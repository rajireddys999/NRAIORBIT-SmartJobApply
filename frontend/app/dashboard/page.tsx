"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, clearToken } from "@/lib/auth";
import { getMatches, getApplications, uploadResume } from "@/lib/api";
import Logo from "@/components/Logo";

const SCORE_COLOR = (s: number) =>
  s >= 85 ? "text-emerald-400" : s >= 70 ? "text-green-400" : s >= 50 ? "text-yellow-400" : "text-slate-400";

const SCORE_GLOW = (s: number) =>
  s >= 85 ? "shadow-emerald-500/40" : s >= 70 ? "shadow-green-500/40" : s >= 50 ? "shadow-yellow-500/30" : "";

const STATUS_BADGE: Record<string, string> = {
  applied:  "bg-green-500/20 text-green-300 border border-green-500/40",
  pending:  "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40",
  failed:   "bg-red-500/20 text-red-300 border border-red-500/40",
  skipped:  "bg-slate-700/60 text-slate-400 border border-slate-600/40",
};

export default function Dashboard() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"matches" | "applied">("matches");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    getMatches(token, 50).then(setMatches).catch(() => {});
    getApplications(token).then(setApplications).catch(() => {});
  }, [router]);

  async function doUpload(file: File) {
    const token = getToken()!;
    setUploading(true);
    setUploadMsg("");
    setUploadSuccess(false);
    try {
      await uploadResume(token, file);
      setUploadMsg("Resume uploaded — AI matching started in background.");
      setUploadSuccess(true);
    } catch (err: any) {
      setUploadMsg(err.message || "Upload failed.");
      setUploadSuccess(false);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  }

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  const avgScore = matches.length
    ? (matches.reduce((s, m) => s + m.score, 0) / matches.length).toFixed(1)
    : null;

  const stats = [
    {
      label: "Total Matches",
      value: matches.length,
      icon: "🎯",
      gradient: "from-indigo-600/30 to-indigo-900/10",
      border: "border-indigo-500/30",
      glow: "shadow-indigo-500/20",
    },
    {
      label: "Strong Matches",
      value: matches.filter(m => m.score >= 75).length,
      icon: "⚡",
      gradient: "from-emerald-600/30 to-emerald-900/10",
      border: "border-emerald-500/30",
      glow: "shadow-emerald-500/20",
    },
    {
      label: "Jobs Applied",
      value: applications.length,
      icon: "✅",
      gradient: "from-purple-600/30 to-purple-900/10",
      border: "border-purple-500/30",
      glow: "shadow-purple-500/20",
    },
    {
      label: "Avg Match Score",
      value: avgScore ? `${avgScore}%` : "—",
      icon: "📊",
      gradient: "from-cyan-600/30 to-cyan-900/10",
      border: "border-cyan-500/30",
      glow: "shadow-cyan-500/20",
    },
  ];

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 60%), linear-gradient(180deg, #04050f 0%, #080b1a 40%, #060910 100%)",
      }}
    >
      {/* Nav */}
      <nav
        className="border-b border-white/8 px-6 py-3 flex justify-between items-center sticky top-0 z-20"
        style={{ background: "rgba(4,5,15,0.85)", backdropFilter: "blur(16px)" }}
      >
        <Logo size="sm" />
        <div className="flex gap-4 items-center">
          <Link href="/jobs" className="text-slate-300 hover:text-white text-sm transition px-3 py-1.5 rounded-lg hover:bg-white/5">
            Job Board
          </Link>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-sm transition px-3 py-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-300"
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight" style={{
            background: "linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #818cf8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Mission Control
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Your AI job-hunting dashboard — matches, applications, and resume management.</p>
        </div>

        {/* Resume Upload */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl p-6 mb-8 border transition-all duration-300 ${
            dragging
              ? "border-indigo-400/70 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"
              : "border-white/10 bg-white/[0.03]"
          }`}
          style={{ boxShadow: dragging ? undefined : "inset 0 1px 0 rgba(255,255,255,0.05)" }}
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white mb-0.5">Resume Upload</h2>
              <p className="text-slate-400 text-xs">PDF only · AI parses and starts matching immediately</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer shrink-0">
              <span
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 select-none ${
                  uploading
                    ? "bg-indigo-500/40 text-indigo-300 cursor-wait"
                    : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-400/40"
                }`}
              >
                {uploading ? "Uploading…" : "Choose PDF"}
              </span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} disabled={uploading} />
            </label>
          </div>
          {uploadMsg && (
            <div className={`mt-4 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${
              uploadSuccess
                ? "bg-green-500/10 border border-green-500/30 text-green-300"
                : "bg-red-500/10 border border-red-500/30 text-red-300"
            }`}>
              <span>{uploadSuccess ? "✅" : "❌"}</span>
              {uploadMsg}
            </div>
          )}
          {dragging && (
            <div className="mt-4 text-center text-indigo-300 text-sm font-medium animate-pulse">
              Drop PDF here to upload
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(s => (
            <div
              key={s.label}
              className={`rounded-2xl p-5 border bg-gradient-to-br ${s.gradient} ${s.border} shadow-lg ${s.glow}`}
              style={{ boxShadow: `0 4px 32px -4px var(--tw-shadow-color)` }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">{s.label}</p>
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className="text-3xl font-black tracking-tight text-white">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(["matches", "applied"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === tab
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/8"
              }`}
            >
              {tab === "matches" ? `Job Matches (${matches.length})` : `Applied (${applications.length})`}
            </button>
          ))}
        </div>

        {/* Job Matches */}
        {activeTab === "matches" && (
          <div className="space-y-3">
            {matches.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-16 text-center">
                <div className="text-5xl mb-4">📄</div>
                <p className="text-white font-semibold text-lg mb-1">No matches yet</p>
                <p className="text-slate-400 text-sm">Upload your resume above — the AI starts matching within seconds.</p>
              </div>
            ) : matches.map(m => (
              <div
                key={m.match_id}
                className="rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-200 p-5 flex gap-4 items-start"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
              >
                {/* Score ring */}
                <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${SCORE_GLOW(m.score)} ${
                  m.score >= 85 ? "bg-emerald-500/20 border border-emerald-500/40" :
                  m.score >= 70 ? "bg-green-500/20 border border-green-500/40" :
                  m.score >= 50 ? "bg-yellow-500/20 border border-yellow-500/40" :
                  "bg-slate-700/40 border border-slate-600/40"
                }`}>
                  <span className={`text-base font-black ${SCORE_COLOR(m.score)}`}>{Math.round(m.score)}%</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-base leading-snug truncate">{m.job?.title ?? "—"}</p>
                      <p className="text-slate-400 text-sm mt-0.5">
                        {m.job?.company ?? "—"}
                        {m.job?.location ? <span className="text-slate-600 mx-1.5">·</span> : ""}
                        {m.job?.location ?? ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[m.status] ?? STATUS_BADGE.pending}`}>
                      {m.status}
                    </span>
                  </div>

                  {/* Match score bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          m.score >= 85 ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
                          m.score >= 70 ? "bg-gradient-to-r from-green-500 to-emerald-400" :
                          m.score >= 50 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                          "bg-slate-600"
                        }`}
                        style={{ width: `${m.score}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">Match</span>
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
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-16 text-center">
                <div className="text-5xl mb-4">🚀</div>
                <p className="text-white font-semibold text-lg mb-1">No applications yet</p>
                <p className="text-slate-400 text-sm">Once your score clears 75%, the AI auto-applies on your behalf.</p>
              </div>
            ) : applications.map(a => (
              <div
                key={a.match_id}
                className="rounded-2xl border border-green-500/20 bg-green-500/[0.04] hover:bg-green-500/[0.07] transition-all duration-200 p-5 flex gap-4 items-center"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
                  <span className="text-green-400 text-lg">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{a.job?.title ?? "—"}</p>
                  <p className="text-slate-400 text-sm mt-0.5">{a.job?.company ?? "—"}{a.job?.location ? ` · ${a.job.location}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-green-400 text-sm font-semibold">Applied</p>
                  {a.applied_at && (
                    <p className="text-slate-500 text-xs mt-0.5">{new Date(a.applied_at).toLocaleDateString()}</p>
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
