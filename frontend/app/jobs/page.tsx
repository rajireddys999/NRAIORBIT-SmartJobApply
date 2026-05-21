"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { getJobs } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

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
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <nav className="border-b px-6 py-3 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md"
        style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}>
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition px-3 py-1.5 rounded-lg">
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Job Board</h1>

        {loading ? (
          <p className="text-[var(--text-muted)]">Loading…</p>
        ) : (
          <div className="space-y-3">
            {jobs.map(j => (
              <a
                key={j.id}
                href={j.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl p-4 border transition hover:border-indigo-400/50"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <p className="font-semibold text-[var(--text)]">{j.title}</p>
                <p className="text-[var(--text-muted)] text-sm mt-0.5">{j.company} · {j.location}</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                  {j.source} · {new Date(j.fetched_at).toLocaleDateString()}
                </p>
              </a>
            ))}
            {jobs.length === 0 && (
              <div className="text-center py-16 rounded-2xl border" style={{ borderColor: "var(--border)" }}>
                <p className="text-[var(--text-muted)]">No jobs yet — the fetcher runs every 30 min.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center gap-4 mt-8">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-lg text-sm border transition disabled:opacity-30"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            Previous
          </button>
          <span className="text-[var(--text-muted)] text-sm self-center">Page {page}</span>
          <button
            disabled={jobs.length < 20}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-lg text-sm border transition disabled:opacity-30"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
