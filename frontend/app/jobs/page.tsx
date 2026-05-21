"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { getJobs } from "@/lib/api";
import Logo from "@/components/Logo";

export default function JobBoard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    setLoading(true);
    getJobs(token, page).then(setJobs).finally(() => setLoading(false));
  }, [page, router]);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <nav className="border-b border-white/10 px-6 py-3 flex justify-between items-center bg-[#020817]/90 backdrop-blur-md">
        <Logo size="sm" />
        <a href="/dashboard" className="text-slate-300 hover:text-white text-sm">Dashboard</a>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Job Board</h1>

        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            {jobs.map(j => (
              <a
                key={j.id}
                href={j.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-800 hover:bg-slate-700 rounded-xl p-4 transition"
              >
                <p className="font-semibold">{j.title}</p>
                <p className="text-slate-400 text-sm">{j.company} · {j.location}</p>
                <p className="text-slate-500 text-xs mt-1">{j.source} · {new Date(j.fetched_at).toLocaleDateString()}</p>
              </a>
            ))}
            {jobs.length === 0 && <p className="text-slate-400 text-center py-12">No jobs yet — the fetcher runs every 30 min.</p>}
          </div>
        )}

        <div className="flex justify-center gap-4 mt-8">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="bg-slate-700 disabled:opacity-30 px-4 py-2 rounded-lg text-sm">Previous</button>
          <span className="text-slate-400 text-sm self-center">Page {page}</span>
          <button disabled={jobs.length < 20} onClick={() => setPage(p => p + 1)} className="bg-slate-700 disabled:opacity-30 px-4 py-2 rounded-lg text-sm">Next</button>
        </div>
      </div>
    </div>
  );
}
