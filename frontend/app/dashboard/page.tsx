"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, clearToken } from "@/lib/auth";
import { getMatches, getApplications, uploadResume } from "@/lib/api";
import Logo from "@/components/Logo";

export default function Dashboard() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"matches" | "applied">("matches");

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    getMatches(token, 50).then(setMatches).catch(() => {});
    getApplications(token).then(setApplications).catch(() => {});
  }, [router]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken()!;
    setUploading(true);
    setUploadMsg("");
    try {
      await uploadResume(token, file);
      setUploadMsg("Resume uploaded! Matching started in background.");
    } catch (err: any) {
      setUploadMsg(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <nav className="border-b border-white/10 px-6 py-3 flex justify-between items-center bg-[#020817]/90 backdrop-blur-md">
        <Logo size="sm" />
        <div className="flex gap-4 items-center">
          <Link href="/jobs" className="text-slate-300 hover:text-white text-sm">Job Board</Link>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm">Log out</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Resume Upload */}
        <div className="bg-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">Upload Resume</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition">
              {uploading ? "Uploading…" : "Choose PDF"}
            </span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            {uploadMsg && <span className="text-sm text-slate-300">{uploadMsg}</span>}
          </label>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Matches", value: matches.length },
            { label: "High Matches (75+)", value: matches.filter(m => m.score >= 75).length },
            { label: "Applied", value: applications.length },
            { label: "Avg Score", value: matches.length ? (matches.reduce((s, m) => s + m.score, 0) / matches.length).toFixed(1) + "%" : "—" },
          ].map(s => (
            <div key={s.label} className="bg-slate-800 rounded-xl p-4">
              <p className="text-slate-400 text-xs uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["matches", "applied"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab ? "bg-indigo-500" : "bg-slate-700 hover:bg-slate-600"}`}
            >
              {tab === "matches" ? "Job Matches" : "Applied Jobs"}
            </button>
          ))}
        </div>

        {/* Match / Application List */}
        <div className="space-y-3">
          {activeTab === "matches" && matches.map(m => (
            <div key={m.match_id} className="bg-slate-800 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{m.job.title}</p>
                <p className="text-slate-400 text-sm">{m.job.company} · {m.job.location}</p>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${m.score >= 75 ? "text-green-400" : m.score >= 50 ? "text-yellow-400" : "text-slate-400"}`}>
                  {m.score.toFixed(1)}%
                </span>
                <p className={`text-xs mt-1 ${m.status === "applied" ? "text-green-400" : m.status === "failed" ? "text-red-400" : "text-slate-400"}`}>
                  {m.status}
                </p>
              </div>
            </div>
          ))}
          {activeTab === "applied" && applications.map(a => (
            <div key={a.match_id} className="bg-slate-800 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{a.job.title}</p>
                <p className="text-slate-400 text-sm">{a.job.company} · {a.job.location}</p>
              </div>
              <div className="text-right">
                <span className="text-green-400 text-sm font-medium">Applied</span>
                <p className="text-slate-400 text-xs">{new Date(a.applied_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
          {activeTab === "matches" && matches.length === 0 && (
            <p className="text-slate-400 text-center py-12">Upload a resume to see job matches.</p>
          )}
        </div>
      </div>
    </div>
  );
}
