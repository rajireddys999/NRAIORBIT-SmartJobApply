"""
Match Diagnostic Agent — explains why a user has 0 or few matches.
Uses the same multi-signal composite scorer as the matcher so scores are consistent.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.models.database import get_db
from backend.models.user import User
from backend.models.resume import Resume
from backend.models.job import Job
from backend.models.match import Match
from backend.api.deps import get_current_user
from backend.agents.resume_matcher import composite_score, extract_skills, _cosine_similarity

router = APIRouter()

SAVE_THRESHOLD      = 50.0
STRONG_THRESHOLD    = 70.0
EXCELLENT_THRESHOLD = 82.0


@router.get("/diagnose")
async def diagnose_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoring agent: analyses why matches are low/zero.
    Returns resume status, job embedding coverage, composite score distribution,
    top-10 matches before threshold, and skill gap analysis.
    """
    report: dict = {}

    # ── 1. Resume status ──────────────────────────────────────────────────────
    res_row = await db.execute(
        select(Resume)
        .where(Resume.user_id == current_user.id)
        .order_by(Resume.uploaded_at.desc())
        .limit(1)
    )
    resume = res_row.scalar_one_or_none()

    if not resume:
        return {"error": "no_resume", "message": "No resume uploaded yet. Upload a PDF to begin matching."}

    resume_embedding = resume.embedding
    resume_text = resume.parsed_text

    report["resume"] = {
        "id": str(resume.id),
        "filename": resume.s3_url.rsplit("/", 1)[-1] if "/" in (resume.s3_url or "") else "resume.pdf",
        "uploaded_at": resume.uploaded_at,
        "has_embedding": resume_embedding is not None,
        "embedding_dim": len(resume_embedding) if resume_embedding else 0,
        "has_text": bool(resume_text),
        "skills_detected": sorted(extract_skills(resume_text or "")),
    }

    if resume_embedding is None:
        report["verdict"] = "RESUME_NOT_EMBEDDED"
        report["fix"] = "Delete and re-upload your resume — the embedding step failed."
        return report

    # ── 2. Job embedding coverage ─────────────────────────────────────────────
    total_jobs = await db.scalar(select(func.count(Job.id)))
    embedded_jobs = await db.scalar(
        select(func.count(Job.id)).where(Job.embedding.isnot(None))
    )
    report["jobs"] = {
        "total": total_jobs,
        "with_embedding": embedded_jobs,
        "without_embedding": total_jobs - embedded_jobs,
        "coverage_pct": round(embedded_jobs / total_jobs * 100, 1) if total_jobs else 0,
    }

    if embedded_jobs == 0:
        report["verdict"] = "NO_JOB_EMBEDDINGS"
        report["fix"] = (
            "All job embeddings are NULL — run Admin → fix-embeddings (if corrupted) "
            "then Admin → Refresh Jobs to re-embed."
        )
        return report

    # ── 3. Composite score distribution (sample up to 500 jobs) ──────────────
    jobs_row = await db.execute(select(Job).where(Job.embedding.isnot(None)).limit(500))
    jobs = jobs_row.scalars().all()

    scored = []
    null_count = 0
    for job in jobs:
        if job.embedding is None:
            null_count += 1
            continue
        sim = _cosine_similarity(resume_embedding, job.embedding)
        score = composite_score(sim, resume_text, job.description, job.title)
        scored.append((score, job))

    scored.sort(key=lambda x: x[0], reverse=True)

    scores_only = [s for s, _ in scored]
    above_93 = sum(1 for s in scores_only if s >= EXCELLENT_THRESHOLD)
    above_85 = sum(1 for s in scores_only if s >= STRONG_THRESHOLD)
    above_75 = sum(1 for s in scores_only if s >= SAVE_THRESHOLD)

    report["score_distribution"] = {
        "jobs_sampled": len(scored),
        "null_embeddings_skipped": null_count,
        "excellent_82pct": above_93,
        "strong_70pct": above_85,
        "match_50pct": above_75,
        "max_score": round(scores_only[0], 2) if scores_only else 0,
        "avg_score": round(sum(scores_only) / len(scores_only), 2) if scores_only else 0,
        "save_threshold": SAVE_THRESHOLD,
        "strong_threshold": STRONG_THRESHOLD,
        "excellent_threshold": EXCELLENT_THRESHOLD,
    }

    # ── 4. Top 10 matches with skill breakdown ────────────────────────────────
    top10 = []
    for score, job in scored[:10]:
        job_skills = sorted(extract_skills(job.description or ""))
        resume_skills = sorted(extract_skills(resume_text or ""))
        shared = sorted(set(resume_skills) & set(job_skills))
        missing = sorted(set(job_skills) - set(resume_skills))
        top10.append({
            "score": round(score, 2),
            "title": job.title,
            "company": job.company,
            "source": job.source,
            "location": job.location,
            "would_be_saved": score >= SAVE_THRESHOLD,
            "is_strong": score >= STRONG_THRESHOLD,
            "is_excellent": score >= EXCELLENT_THRESHOLD,
            "shared_skills": shared[:10],
            "missing_skills": missing[:10],
        })
    report["top_10_raw"] = top10

    # ── 5. Saved matches ──────────────────────────────────────────────────────
    saved = await db.scalar(
        select(func.count(Match.id)).where(Match.user_id == current_user.id)
    )
    report["saved_matches"] = saved

    # ── 6. Verdict ────────────────────────────────────────────────────────────
    if above_75 == 0 and scores_only:
        report["verdict"] = "THRESHOLD_TOO_HIGH"
        report["fix"] = (
            f"Best composite score is {report['score_distribution']['max_score']}% — below the 50% save threshold. "
            f"Tips: (1) re-upload a more detailed resume with clear skill keywords, "
            f"(2) run Admin → Refresh Jobs to fetch fresh job descriptions, "
            f"(3) check the skill gap in top_10_raw to see what skills to add."
        )
    elif above_75 > 0 and saved == 0:
        report["verdict"] = "MATCHES_NOT_SAVED"
        report["fix"] = f"{above_75} jobs scored ≥50% but no Match rows exist. Click Retry Match to save them."
    elif saved > 0:
        report["verdict"] = "OK"
        report["fix"] = f"{saved} matches saved ({above_85} strong, {above_93} excellent). Check the Job Matches tab."
    else:
        report["verdict"] = "UNKNOWN"

    return report
