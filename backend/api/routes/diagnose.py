"""
Match Diagnostic Agent — explains why a user has 0 or few matches.
Shows embedding coverage, raw cosine similarity distribution, and threshold analysis.
"""
import uuid
import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.models.database import get_db
from backend.models.user import User
from backend.models.resume import Resume
from backend.models.job import Job
from backend.models.match import Match
from backend.api.deps import get_current_user

router = APIRouter()


def _cosine_sim(a: list, b: list) -> float:
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


@router.get("/diagnose")
async def diagnose_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoring agent: analyses why matches are low/zero.
    Returns resume status, job embedding coverage, raw score distribution,
    and top-10 matches before threshold filtering.
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

    resume_embedding = resume.embedding  # deserialized by JsonList TypeDecorator
    report["resume"] = {
        "id": str(resume.id),
        "filename": resume.s3_url.rsplit("/", 1)[-1] if "/" in (resume.s3_url or "") else "resume.pdf",
        "uploaded_at": resume.uploaded_at,
        "has_embedding": resume_embedding is not None,
        "embedding_dim": len(resume_embedding) if resume_embedding else 0,
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

    # ── 3. Sample raw cosine similarities (top 20 jobs by score) ─────────────
    jobs_row = await db.execute(select(Job).where(Job.embedding.isnot(None)).limit(500))
    jobs = jobs_row.scalars().all()

    scored = []
    null_embedding_count = 0
    for job in jobs:
        if job.embedding is None:
            null_embedding_count += 1
            continue
        sim = _cosine_sim(resume_embedding, job.embedding)
        scored.append((sim * 100, job))

    scored.sort(key=lambda x: x[0], reverse=True)

    scores_only = [s for s, _ in scored]
    above_75 = sum(1 for s in scores_only if s >= 75)
    above_65 = sum(1 for s in scores_only if s >= 65)
    above_50 = sum(1 for s in scores_only if s >= 50)

    report["score_distribution"] = {
        "jobs_sampled": len(scored),
        "null_embeddings_skipped": null_embedding_count,
        "above_75pct": above_75,
        "above_65pct": above_65,
        "above_50pct": above_50,
        "max_score": round(scores_only[0], 2) if scores_only else 0,
        "avg_score": round(sum(scores_only) / len(scores_only), 2) if scores_only else 0,
        "save_threshold": 75,
    }

    # ── 4. Top 10 matches (before threshold) ─────────────────────────────────
    report["top_10_raw"] = [
        {
            "score": round(score, 2),
            "title": job.title,
            "company": job.company,
            "source": job.source,
            "location": job.location,
            "would_be_saved": score >= 75,
        }
        for score, job in scored[:10]
    ]

    # ── 5. Saved matches ──────────────────────────────────────────────────────
    saved = await db.scalar(
        select(func.count(Match.id)).where(Match.user_id == current_user.id)
    )
    report["saved_matches"] = saved

    # ── 6. Verdict ────────────────────────────────────────────────────────────
    if above_75 == 0 and scores_only:
        report["verdict"] = "THRESHOLD_TOO_HIGH"
        report["fix"] = (
            f"Best raw score is {report['score_distribution']['max_score']}% — below the 75% save threshold. "
            f"This means your resume and the job descriptions don't share enough semantic overlap "
            f"with the MiniLM model. Try: (1) ensure job embeddings are fresh after a Refresh Jobs, "
            f"(2) re-upload a more detailed resume, or (3) the matching model may need calibration."
        )
    elif above_75 > 0 and saved == 0:
        report["verdict"] = "MATCHES_NOT_SAVED"
        report["fix"] = "Matches exist in memory but weren't saved. Click Retry Match to re-run the full task."
    elif saved > 0:
        report["verdict"] = "OK"
        report["fix"] = f"{saved} matches saved. Check the Job Matches tab."
    else:
        report["verdict"] = "UNKNOWN"

    return report
