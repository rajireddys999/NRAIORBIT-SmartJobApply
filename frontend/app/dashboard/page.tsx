"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole, clearToken } from "@/lib/auth";
import { getMatches, getApplications, uploadResume } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const SCORE_COLOR = (s: number) =>
  s >= 85 ? "text-emerald-500" : s >= 70 ? "text-green-500" : s >= 50 ? "text-yellow-500" : "text-slate-400";

const SCORE_GLOW = (s: number) =>
  s >= 85 ? "shadow-emerald-500/30" : s >= 70 ? "shadow-green-500/30" : s >= 50 ? "shadow-yellow-500/20" : "";

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse", linkedin: "LinkedIn", themuse: "The Muse",
  remoteok: "RemoteOK", arbeitnow: "Arbeitnow",
};
const SOURCE_STYLE: Record<string, string> = {
  greenhouse: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  linkedin:   "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  themuse:    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
  remoteok:   "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25",
  arbeitnow:  "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25",
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
  { label: "Strong Matches", value: matches.filter(m => m.score >= 75).length, icon: "⚡", color: "emerald" },
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
  const isAdmin = getRole() === "admin";

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    getMatches(token, 50).then(setMatches).catch(() => {});
    getApplications(token).then(setApplications).catch(() => {});
  }, [router]);

  async function doUpload(file: File) {
    const token = getToken()!;
    setUploading(true); setUploadMsg(""); setUploadSuccess(false);
    try {
      await uploadResume(token, file);
      setUploadMsg("Resume uploaded — AI matching started in background.");
      setUploadSuccess(true);
    } catch (err: any) {
      setUploadMsg(err.message || "Upload failed.");
    } finally {
      setUploading(false);
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
            <div className={`mt-4 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${
              uploadSuccess
                ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-300"
                : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300"
            }`}>
              <span>{uploadSuccess ? "✅" : "❌"}</span>
              {uploadMsg}
            </div>
          )}
          {dragging && <p className="mt-4 text-center text-indigo-400 text-sm font-medium animate-pulse">Drop PDF here</p>}
        </div>

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
                    {m.job?.source_url && (
                      <a
                        href={m.job.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 transition"
                        onClick={e => e.stopPropagation()}
                      >
                        Apply Now →
                      </a>
                    )}
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
                <p className="text-[var(--text-muted)] text-sm">Once your score clears 75%, the AI auto-applies on your behalf.</p>
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
