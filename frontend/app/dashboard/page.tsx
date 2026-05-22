"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole, clearToken } from "@/lib/auth";
import { getMatches, getApplications, uploadResume, applyMatch, applyAllMatches, getResumes, deleteResume, resumeTaskStatus, retryMatching, getProfile, saveProfile, autoApply, resetMatches, CandidateProfile } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const SCORE_COLOR = (s: number) =>
  s >= 85 ? "text-emerald-500" : s >= 70 ? "text-green-500" : s >= 50 ? "text-yellow-500" : "text-slate-400";

const SCORE_GLOW = (s: number) =>
  s >= 85 ? "shadow-emerald-500/30" : s >= 70 ? "shadow-green-500/30" : s >= 50 ? "shadow-yellow-500/20" : "";

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse", linkedin: "LinkedIn", themuse: "The Muse",
  remoteok: "RemoteOK", arbeitnow: "Arbeitnow",
  lever: "Lever", ashby: "Ashby", indeed: "Indeed",
};
const SOURCE_STYLE: Record<string, string> = {
  greenhouse: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  linkedin:   "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  themuse:    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
  remoteok:   "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25",
  arbeitnow:  "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25",
  lever:      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
  ashby:      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25",
  indeed:     "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
};

function detectLevel(title: string): "Entry" | "Senior" | null {
  const t = title.toLowerCase();
  if (/\b(entry.?level|junior|jr\.?|associate|new.?grad|intern|graduate)\b/.test(t)) return "Entry";
  if (/\b(senior|sr\.?|lead|staff|principal|director|architect)\b/.test(t)) return "Senior";
  return null;
}

const STATUS_BADGE: Record<string, string> = {
  applied: "bg-green-500/15 text-green-600 dark:text-green-300 border border-green-500/30",
  pending: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30",
  failed:  "bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30",
  skipped: "bg-slate-200 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600/40",
};

const STATS = (matches: any[], applications: any[], avgScore: string | null) => [
  { label: "Total Matches",  value: matches.length,                         icon: "🎯", color: "indigo"  },
  { label: "Strong Matches", value: matches.filter(m => m.score >= 85).length, icon: "⚡", color: "emerald" },
  { label: "Jobs Applied",   value: applications.length,                    icon: "✅", color: "purple"  },
  { label: "Avg Score",      value: avgScore ? `${avgScore}%` : "—",        icon: "📊", color: "cyan"    },
];

const CARD_COLORS: Record<string, string> = {
  indigo:  "border-indigo-400/30  dark:border-indigo-500/30  bg-indigo-50  dark:bg-indigo-600/10",
  emerald: "border-emerald-400/30 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-600/10",
  purple:  "border-purple-400/30  dark:border-purple-500/30  bg-purple-50  dark:bg-purple-600/10",
  cyan:    "border-cyan-400/30    dark:border-cyan-500/30    bg-cyan-50    dark:bg-cyan-600/10",
};

export default function Dashboard() {
  const router = useRouter();
  const [matches, setMatches]           = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeTab, setActiveTab]       = useState<"matches" | "applied">("matches");
  const [dragging, setDragging]         = useState(false);
  const [applying, setApplying]         = useState<string | null>(null);
  const [applyingAll, setApplyingAll]   = useState(false);
  const [applyMsg, setApplyMsg]         = useState("");
  const [resumes, setResumes]           = useState<any[]>([]);
  const [deletingResume, setDeletingResume] = useState<string | null>(null);
  const [profile, setProfile]           = useState<CandidateProfile | null>(null);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg]     = useState("");
  const [profileDraft, setProfileDraft] = useState<Partial<CandidateProfile>>({});
  const [autoApplying, setAutoApplying] = useState<string | null>(null);
  const [matching, setMatching]         = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ scanned: number; total: number; matched: number; strong: number; status: string } | null>(null);
  const [loadError, setLoadError]       = useState("");
  const [loadingData, setLoadingData]   = useState(true);
  const isAdmin = getRole() === "admin";

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    setLoadingData(true);
    Promise.all([
      getMatches(token, 75).catch((e) => { setLoadError(e.message || "Failed to load matches"); return []; }),
      getApplications(token).catch(() => []),
      getResumes(token).catch(() => []),
      getProfile(token).catch(() => null),
    ]).then(([m, a, r, p]) => {
      setMatches(m);
      setApplications(a);
      setResumes(r);
      if (p) { setProfile(p); setProfileDraft(p); }
      else setProfileOpen(true); // auto-open if no profile yet
    }).finally(() => setLoadingData(false));
  }, [router]);

  function startPolling(token: string, task_id: string, successMsg?: (r: any) => string) {
    setMatching(true);
    setMatchProgress(null);
    const deadline = Date.now() + 180_000;
    const poll = async () => {
      if (Date.now() > deadline) { setMatching(false); setMatchProgress(null); setUploadMsg("Matching timed out — worker may be unavailable."); return; }
      try {
        const res = await resumeTaskStatus(token, task_id);
        if (res.state === "SUCCESS") {
          const fresh = await getMatches(token, 75);
          setMatches(fresh);
          setMatching(false);
          setMatchProgress(null);
          setUploadMsg(successMsg ? successMsg(res.result) : `Matched against ${res.result?.total_jobs ?? "all"} jobs — ${fresh.length} match${fresh.length !== 1 ? "es" : ""} found.`);
        } else if (res.state === "FAILURE") {
          setMatching(false);
          setMatchProgress(null);
          setUploadMsg(`Matching failed: ${res.error ?? "unknown error"} — check Railway worker logs.`);
        } else if (res.state === "PROGRESS" && res.meta) {
          setMatchProgress(res.meta);
          setUploadMsg(res.meta.status ?? "Matching in progress…");
          setTimeout(poll, 2000);
        } else {
          setTimeout(poll, 3000);
        }
      } catch { setTimeout(poll, 3000); }
    };
    setTimeout(poll, 3000);
  }

  async function doUpload(file: File) {
    const token = getToken()!;
    setUploading(true); setUploadMsg(""); setUploadSuccess(false);
    try {
      const { task_id, id, filename, uploaded_at } = await uploadResume(token, file);
      setUploadSuccess(true);
      setUploadMsg("Resume uploaded — AI is matching jobs…");
      setResumes(prev => [{ id, filename, uploaded_at, has_embedding: false, download_url: "" }, ...prev]);
      startPolling(token, task_id);
    } catch (err: any) {
      setUploadMsg(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleResetMatches() {
    if (!confirm("Delete all current matches? You'll need to retry matching after.")) return;
    const token = getToken()!;
    try {
      const { deleted } = await resetMatches(token);
      setMatches([]);
      setApplications([]);
      setUploadSuccess(true);
      setUploadMsg(`Cleared ${deleted} matches. Click Retry Match on your resume to re-run.`);
    } catch (err: any) {
      alert(err.message || "Failed to reset matches.");
    }
  }

  async function handleAutoApply(matchId: string) {
    const token = getToken()!;
    setAutoApplying(matchId);
    try {
      const res = await autoApply(token, matchId);
      setMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, status: "applied", applied_at: new Date().toISOString() } : m
      ));
      if (res.method === "greenhouse_api" || res.method === "lever_api") {
        setApplyMsg(`✅ Application submitted automatically via ${res.method === "greenhouse_api" ? "Greenhouse" : "Lever"} API.`);
      } else if (res.job_url) {
        window.open(res.job_url, "_blank", "noopener,noreferrer");
        setApplyMsg("Job page opened — complete your application there. Marked as applied.");
      } else {
        setApplyMsg("Marked as applied.");
      }
    } catch (err: any) {
      setApplyMsg(err.message || "Auto-apply failed.");
    } finally {
      setAutoApplying(null);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken()!;
    setProfileSaving(true); setProfileMsg("");
    try {
      const saved = await saveProfile(token, profileDraft as CandidateProfile);
      setProfile(saved);
      setProfileMsg("Profile saved.");
      setTimeout(() => { setProfileOpen(false); setProfileMsg(""); }, 1200);
    } catch (err: any) {
      setProfileMsg(err.message || "Failed to save.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleRetryMatching(resumeId: string) {
    const token = getToken()!;
    setUploadSuccess(true);
    setUploadMsg("Retrying matching…");
    try {
      const { task_id } = await retryMatching(token, resumeId);
      startPolling(token, task_id);
    } catch (err: any) {
      setUploadSuccess(false);
      setUploadMsg(err.message || "Failed to retry matching.");
    }
  }

  async function handleDeleteResume(resumeId: string) {
    const token = getToken()!;
    setDeletingResume(resumeId);
    try {
      await deleteResume(token, resumeId);
      setResumes(prev => prev.filter(r => r.id !== resumeId));
    } catch (err: any) {
      alert(err.message || "Failed to delete resume.");
    } finally {
      setDeletingResume(null);
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) doUpload(f);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) doUpload(f);
  };
  const handleLogout = () => { clearToken(); router.push("/login"); };

  async function handleApply(matchId: string, sourceUrl?: string) {
    const token = getToken()!;
    setApplying(matchId); setApplyMsg("");
    // Open the actual job application page first
    if (sourceUrl) window.open(sourceUrl, "_blank", "noopener,noreferrer");
    try {
      await applyMatch(token, matchId);
      setMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, status: "applied", applied_at: new Date().toISOString() } : m
      ));
      setApplyMsg(sourceUrl ? "Job page opened — complete your application there. Marked as applied." : "Marked as applied.");
    } catch (err: any) {
      setApplyMsg(err.message || "Failed to apply.");
    } finally {
      setApplying(null);
    }
  }

  async function handleApplyAll() {
    const token = getToken()!;
    setApplyingAll(true); setApplyMsg("");
    try {
      // Open top 5 job URLs before the async call (must be synchronous to avoid popup block)
      const topPending = matches.filter(m => m.status === "pending" && m.score >= 75).slice(0, 5);
      topPending.forEach(m => { if (m.job?.source_url) window.open(m.job.source_url, "_blank", "noopener,noreferrer"); });
      const { applied } = await applyAllMatches(token, 75);
      const now = new Date().toISOString();
      setMatches(prev => prev.map(m =>
        m.status === "pending" && m.score >= 75 ? { ...m, status: "applied", applied_at: now } : m
      ));
      setApplyMsg(`Opened ${topPending.length} job page${topPending.length !== 1 ? "s" : ""} — complete the applications there. ${applied} match${applied !== 1 ? "es" : ""} marked applied.`);
    } catch (err: any) {
      setApplyMsg(err.message || "Failed to apply all.");
    } finally {
      setApplyingAll(false);
    }
  }

  const avgScore = matches.length
    ? (matches.reduce((s, m) => s + m.score, 0) / matches.length).toFixed(1)
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]
      dark:[background:radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.18)_0%,transparent_60%),linear-gradient(180deg,#04050f_0%,#080b1a_40%,#060910_100%)]">

      {/* Nav */}
      <nav className="border-b px-6 py-3 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md"
        style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}>
        <Link href="/"><Logo size="sm" /></Link>
        <div className="flex gap-3 items-center">
          {isAdmin && (
            <>
              <Link href="/admin" className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/25 transition">
                Admin Panel
              </Link>
              <Link href="/jobs" className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition px-3 py-1.5 rounded-lg">
                Job Board
              </Link>
            </>
          )}
          <ThemeToggle />
          <button onClick={handleLogout}
            className="text-[var(--text-muted)] hover:text-red-500 text-sm transition px-3 py-1.5 rounded-lg">
            Log out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight
            dark:[background:linear-gradient(135deg,#fff_0%,#a5b4fc_50%,#818cf8_100%)]
            dark:[-webkit-background-clip:text] dark:[-webkit-text-fill-color:transparent]
            text-gray-900">
            Mission Control
          </h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">
            Your AI job-hunting dashboard — matches, applications, and resume management.
          </p>
        </div>

        {/* Resume Upload */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl p-6 mb-8 border transition-all duration-300 ${
            dragging ? "border-indigo-400/70 bg-indigo-500/10 shadow-lg shadow-indigo-500/20" : ""
          }`}
          style={dragging ? {} : { background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h2 className="text-base font-semibold mb-0.5">Resume Upload</h2>
              <p className="text-[var(--text-muted)] text-xs">PDF only · AI parses and starts matching immediately</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer shrink-0">
              <span className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all select-none ${
                uploading
                  ? "bg-indigo-400/40 text-indigo-300 cursor-wait"
                  : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30"
              }`}>
                {uploading ? "Uploading…" : "Choose PDF"}
              </span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} disabled={uploading} />
            </label>
          </div>
          {uploadMsg && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              uploadSuccess
                ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-300"
                : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300"
            }`}>
              <div className="flex items-center gap-2">
                {uploadSuccess
                  ? matching
                    ? <span className="w-3.5 h-3.5 border-2 border-green-500/40 border-t-green-500 rounded-full animate-spin shrink-0" />
                    : <span>✅</span>
                  : <span>❌</span>}
                <span>{uploadMsg}</span>
              </div>
              {matching && matchProgress && (
                <div className="mt-3 space-y-2">
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full overflow-hidden bg-green-500/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                      style={{ width: matchProgress.total > 0 ? `${Math.round((matchProgress.scanned / matchProgress.total) * 100)}%` : "0%" }}
                    />
                  </div>
                  {/* Live counters */}
                  <div className="flex gap-4 text-xs font-medium">
                    <span>🔍 {matchProgress.scanned}/{matchProgress.total} scanned</span>
                    <span>🎯 {matchProgress.matched} new matches</span>
                    <span>⚡ {matchProgress.strong} strong</span>
                  </div>
                </div>
              )}
            </div>
          )}
          {dragging && <p className="mt-4 text-center text-indigo-400 text-sm font-medium animate-pulse">Drop PDF here</p>}

          {/* Resume list */}
          {resumes.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Uploaded Resumes</p>
              {resumes.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
                  style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">📄</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.filename}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(r.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.download_url && (
                      <a
                        href={r.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold px-3 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 transition"
                      >
                        View
                      </a>
                    )}
                    <label className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 hover:bg-indigo-500/20 transition cursor-pointer">
                      Replace
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          await handleDeleteResume(r.id);
                          doUpload(f);
                        }}
                        disabled={uploading || matching}
                      />
                    </label>
                    <button
                      onClick={() => handleRetryMatching(r.id)}
                      disabled={matching}
                      className="text-xs font-semibold px-3 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25 hover:bg-violet-500/20 transition disabled:opacity-50"
                    >
                      {matching ? "Matching…" : "Re-match"}
                    </button>
                    <button
                      onClick={() => handleDeleteResume(r.id)}
                      disabled={deletingResume === r.id}
                      className="text-xs font-semibold px-3 py-1 rounded-lg bg-red-500/10 text-red-500 border border-red-500/25 hover:bg-red-500/20 transition disabled:opacity-50"
                    >
                      {deletingResume === r.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Candidate Profile */}
        <div className="rounded-2xl border mb-8" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left"
            onClick={() => setProfileOpen(o => !o)}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">👤</span>
              <div>
                <p className="font-semibold text-sm">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name ?? ""}` : "Candidate Profile"}
                  {!profile?.first_name && <span className="ml-2 text-xs font-normal text-amber-500">⚠ Required for auto-apply</span>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {profile?.first_name ? `${profile.phone ?? ""} · ${profile.work_authorization ?? ""} · ${profile.city ?? ""}` : "Fill once — used to auto-submit job applications"}
                </p>
              </div>
            </div>
            <span className="text-[var(--text-muted)] text-sm">{profileOpen ? "▲" : "▼"}</span>
          </button>

          {profileOpen && (
            <form onSubmit={handleSaveProfile} className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="col-span-2 pt-4 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Personal Info</div>
              {[
                { label: "First Name *", key: "first_name", required: true },
                { label: "Last Name *", key: "last_name", required: true },
                { label: "Phone *", key: "phone", required: true },
                { label: "LinkedIn URL", key: "linkedin_url" },
                { label: "GitHub URL", key: "github_url" },
                { label: "Portfolio / Website", key: "portfolio_url" },
              ].map(({ label, key, required }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">{label}</label>
                  <input
                    type="text"
                    required={required}
                    value={(profileDraft as any)[key] ?? ""}
                    onChange={e => setProfileDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              ))}

              <div className="col-span-2 pt-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Location</div>
              {[
                { label: "City", key: "city" },
                { label: "State", key: "state" },
                { label: "Country", key: "country" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">{label}</label>
                  <input
                    type="text"
                    value={(profileDraft as any)[key] ?? ""}
                    onChange={e => setProfileDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              ))}

              <div className="col-span-2 pt-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Work Authorization</div>
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">Status</label>
                <select
                  value={profileDraft.work_authorization ?? ""}
                  onChange={e => setProfileDraft(d => ({ ...d, work_authorization: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <option value="">Select…</option>
                  <option value="citizen">US Citizen</option>
                  <option value="permanent_resident">Permanent Resident (Green Card)</option>
                  <option value="ead">EAD / OPT / STEM OPT</option>
                  <option value="visa_h1b">H-1B Visa</option>
                  <option value="visa_other">Other Visa</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input
                  type="checkbox"
                  id="sponsorship"
                  checked={profileDraft.requires_sponsorship ?? false}
                  onChange={e => setProfileDraft(d => ({ ...d, requires_sponsorship: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="sponsorship" className="text-sm">Requires sponsorship</label>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">Years of Experience</label>
                <input
                  type="number" min={0} max={40}
                  value={profileDraft.years_experience ?? ""}
                  onChange={e => setProfileDraft(d => ({ ...d, years_experience: parseInt(e.target.value) || undefined }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">Short Summary (used in cover letters)</label>
                <textarea
                  rows={3}
                  value={profileDraft.summary ?? ""}
                  onChange={e => setProfileDraft(d => ({ ...d, summary: e.target.value }))}
                  placeholder="e.g. Data engineer with 5 years experience in Python, Spark, and AWS..."
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              <div className="col-span-2 flex items-center gap-3">
                <button type="submit" disabled={profileSaving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50">
                  {profileSaving ? "Saving…" : "Save Profile"}
                </button>
                {profileMsg && <span className="text-sm text-green-500">{profileMsg}</span>}
              </div>
            </form>
          )}
        </div>

        {/* Error banner */}
        {loadError && (
          <div className="mb-6 rounded-xl px-4 py-3 text-sm border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 flex items-center gap-2">
            <span>⚠️</span>
            <span><strong>API error:</strong> {loadError} — check that you are logged in and the backend is reachable.</span>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {STATS(matches, applications, avgScore).map(s => (
            <div key={s.label} className={`rounded-2xl p-5 border shadow-sm ${CARD_COLORS[s.color]}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-medium">{s.label}</p>
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className="text-3xl font-black tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(["matches", "applied"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                  : "border text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              style={activeTab !== tab ? { borderColor: "var(--border)", background: "var(--bg-card)" } : {}}>
              {tab === "matches" ? `Job Matches (${matches.length})` : `Applied (${applications.length})`}
            </button>
          ))}
        </div>

        {/* Job Matches */}
        {activeTab === "matches" && (
          <div className="space-y-3">
            {/* Apply All / Auto-apply toolbar */}
            {matches.some(m => m.status === "pending") && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3 mb-1"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <p className="text-sm text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text)]">{matches.filter(m => m.status === "pending").length}</span> pending match{matches.filter(m => m.status === "pending").length !== 1 ? "es" : ""} — review and apply below
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetMatches}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold border text-red-500 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition"
                  >
                    Reset Matches
                  </button>
                  <button
                    onClick={handleApplyAll}
                    disabled={applyingAll}
                    className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50 disabled:cursor-wait"
                  >
                    {applyingAll ? "Applying…" : "Apply All (≥75%)"}
                  </button>
                </div>
              </div>
            )}
            {applyMsg && (
              <div className="px-4 py-2 rounded-xl text-sm border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400">
                {applyMsg}
              </div>
            )}
            {matches.length === 0 ? (
              <div className="rounded-2xl border p-16 text-center"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <div className="text-5xl mb-4">📄</div>
                <p className="font-semibold text-lg mb-1">No matches yet</p>
                <p className="text-[var(--text-muted)] text-sm">Upload your resume above — AI starts matching within seconds.</p>
              </div>
            ) : matches.map(m => (
              <div key={m.match_id}
                className="rounded-2xl border transition-all duration-200 p-5 flex gap-4 items-start hover:border-indigo-400/40"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

                {/* Score badge */}
                <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-md ${SCORE_GLOW(m.score)} ${
                  m.score >= 85 ? "bg-emerald-500/15 border border-emerald-500/40" :
                  m.score >= 70 ? "bg-green-500/15 border border-green-500/40" :
                  m.score >= 50 ? "bg-yellow-500/15 border border-yellow-500/40" :
                  "bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/40"
                }`}>
                  <span className={`text-base font-black ${SCORE_COLOR(m.score)}`}>{Math.round(m.score)}%</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-base leading-snug truncate">{m.job?.title ?? "—"}</p>
                      <p className="text-[var(--text-muted)] text-sm mt-0.5">
                        {m.job?.company ?? "—"}
                        {m.job?.location && <span className="mx-1.5 opacity-40">·</span>}
                        {m.job?.location ?? ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[m.status] ?? STATUS_BADGE.pending}`}>
                      {m.status}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--border)" }}>
                      <div className={`h-full rounded-full transition-all duration-700 ${
                        m.score >= 85 ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
                        m.score >= 70 ? "bg-gradient-to-r from-green-500 to-emerald-400" :
                        m.score >= 50 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                        "bg-slate-400"
                      }`} style={{ width: `${m.score}%` }} />
                    </div>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">Match</span>
                  </div>

                  {/* Badges + Apply Now */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {m.job?.source && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SOURCE_STYLE[m.job.source] ?? "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}>
                        {SOURCE_LABEL[m.job.source] ?? m.job.source}
                      </span>
                    )}
                    {m.job?.title && (() => {
                      const lvl = detectLevel(m.job.title);
                      return lvl ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                          lvl === "Entry"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                        }`}>
                          {lvl === "Entry" ? "Entry Level" : "Senior"}
                        </span>
                      ) : null;
                    })()}
                    <div className="ml-auto flex items-center gap-2">
                      {m.job?.source_url && (
                        <a
                          href={m.job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 transition"
                          onClick={e => e.stopPropagation()}
                        >
                          View Job →
                        </a>
                      )}
                      {m.status === "pending" ? (
                        <button
                          onClick={() => handleAutoApply(m.match_id)}
                          disabled={autoApplying === m.match_id}
                          title={profile?.first_name ? "Auto-apply using your saved profile" : "Save your profile first to enable auto-apply"}
                          className={`text-xs font-semibold px-3 py-1 rounded-lg border transition disabled:opacity-50 ${
                            profile?.first_name
                              ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/25"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20 cursor-not-allowed"
                          }`}
                        >
                          {autoApplying === m.match_id ? "Applying…" : "Auto Apply →"}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Applied ✓</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Applied Jobs */}
        {activeTab === "applied" && (
          <div className="space-y-3">
            {applications.length === 0 ? (
              <div className="rounded-2xl border p-16 text-center"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                <div className="text-5xl mb-4">🚀</div>
                <p className="font-semibold text-lg mb-1">No applications yet</p>
                <p className="text-[var(--text-muted)] text-sm">Review your matches and click Apply on the ones you want to submit.</p>
              </div>
            ) : applications.map(a => (
              <div key={a.match_id}
                className="rounded-2xl border border-green-500/25 bg-green-50 dark:bg-green-500/[0.04] transition-all p-5 flex gap-4 items-center">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
                  <span className="text-green-500 text-lg">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{a.job?.title ?? "—"}</p>
                  <p className="text-[var(--text-muted)] text-sm mt-0.5">
                    {a.job?.company ?? "—"}{a.job?.location ? ` · ${a.job.location}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p className="text-green-600 dark:text-green-400 text-sm font-semibold">Applied</p>
                  {a.applied_at && (
                    <p className="text-[var(--text-muted)] text-xs">{new Date(a.applied_at).toLocaleDateString()}</p>
                  )}
                  {a.job?.source_url && (
                    <a
                      href={a.job.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 transition"
                    >
                      View Job →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
