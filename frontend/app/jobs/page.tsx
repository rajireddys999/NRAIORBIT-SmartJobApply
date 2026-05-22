"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole } from "@/lib/auth";
import { getJobs, refreshJobs } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

// ── Source display config ─────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  linkedin:   "LinkedIn",
  themuse:    "The Muse",
  remoteok:   "RemoteOK",
  arbeitnow:  "Arbeitnow",
};
const SOURCE_STYLE: Record<string, string> = {
  greenhouse: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
  linkedin:   "bg-blue-500/10   text-blue-600   dark:text-blue-400   border border-blue-500/25",
  themuse:    "bg-purple-500/10 text-purple-600  dark:text-purple-400  border border-purple-500/25",
  remoteok:   "bg-orange-500/10 text-orange-600  dark:text-orange-400  border border-orange-500/25",
  arbeitnow:  "bg-teal-500/10   text-teal-600    dark:text-teal-400    border border-teal-500/25",
};
const DEFAULT_SOURCE_STYLE = "bg-slate-500/10 text-slate-500 border border-slate-500/20";

// ── Experience level detector ─────────────────────────────────────────────────
function detectLevel(title: string): "Entry" | "Senior" | null {
  const t = title.toLowerCase();
  if (/\b(entry.?level|junior|jr\.?|associate|new.?grad|intern|graduate|i\b)\b/.test(t)) return "Entry";
  if (/\b(senior|sr\.?|lead|staff|principal|director|head|architect|iv\b|v\b)\b/.test(t)) return "Senior";
  return null;
}

const LEVEL_STYLE = {
  Entry:  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25",
  Senior: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25",
};

export default function JobBoard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [locationFilter, setLocationFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState<"All" | "Entry" | "Senior" | "Mid">("All");

  useEffect(() => {
    const token = getToken();
    const role = getRole();
    if (!token) { router.push("/login"); return; }
    if (role !== "admin") { router.push("/dashboard"); return; }
    setLoading(true);
    getJobs(token, 1, 100).then(setJobs).finally(() => setLoading(false));
  }, [router]);

  // Unique filter options derived from loaded jobs
  const locations = useMemo(() => {
    const cities = new Set<string>();
    jobs.forEach(j => {
      const loc = j.location?.trim();
      if (loc) cities.add(loc);
    });
    return ["All", ...Array.from(cities).sort()];
  }, [jobs]);

  const sources = useMemo(() => {
    const srcs = new Set<string>();
    jobs.forEach(j => { if (j.source) srcs.add(j.source); });
    return ["All", ...Array.from(srcs).sort()];
  }, [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const locOk = locationFilter === "All" || j.location === locationFilter;
      const srcOk = sourceFilter === "All" || j.source === sourceFilter;
      if (!locOk || !srcOk) return false;
      if (levelFilter === "All") return true;
      const lvl = detectLevel(j.title);
      if (levelFilter === "Entry")  return lvl === "Entry";
      if (levelFilter === "Senior") return lvl === "Senior";
      if (levelFilter === "Mid")    return lvl === null; // title has no entry/senior signal
      return true;
    });
  }, [jobs, locationFilter, sourceFilter, levelFilter]);

  async function handleRefresh() {
    const token = getToken();
    if (!token) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      await refreshJobs(token);
      setRefreshMsg("Job fetch queued — new jobs appear within 2–3 minutes.");
    } catch {
      setRefreshMsg("Failed to queue refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]
      dark:[background:radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.12)_0%,transparent_60%),linear-gradient(180deg,#04050f_0%,#080b1a_40%,#060910_100%)]">

      {/* Nav */}
      <nav className="border-b px-6 py-3 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md"
        style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}>
        <Link href="/"><Logo size="sm" /></Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard"
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition px-3 py-1.5 rounded-lg">
            Dashboard
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Job Board</h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">
              {loading ? "Loading…" : `${filtered.length} jobs`}
              {locationFilter !== "All" || sourceFilter !== "All" || levelFilter !== "All"
                ? ` (filtered from ${jobs.length})`
                : " fetched from 5 sources"}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              refreshing
                ? "bg-indigo-400/30 text-indigo-300 cursor-wait"
                : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25"
            }`}
          >
            <span>{refreshing ? "Queuing…" : "↺ Refresh Jobs"}</span>
          </button>
        </div>

        {refreshMsg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
            {refreshMsg}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)] font-medium">Location</label>
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)] font-medium">Source</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {sources.map(s => (
                <option key={s} value={s}>
                  {s === "All" ? "All Sources" : SOURCE_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)] font-medium">Experience</label>
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value as typeof levelFilter)}
              className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="All">All Levels</option>
              <option value="Entry">Entry Level / Junior</option>
              <option value="Senior">Senior / Lead</option>
              <option value="Mid">Mid Level</option>
            </select>
          </div>
          {(locationFilter !== "All" || sourceFilter !== "All" || levelFilter !== "All") && (
            <button
              onClick={() => { setLocationFilter("All"); setSourceFilter("All"); setLevelFilter("All"); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline transition"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Job cards */}
        {loading ? (
          <div className="flex items-center gap-3 py-16 text-[var(--text-muted)]">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            Loading jobs…
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(j => {
              const level = detectLevel(j.title);
              const srcLabel = SOURCE_LABEL[j.source] ?? j.source;
              const srcStyle = SOURCE_STYLE[j.source] ?? DEFAULT_SOURCE_STYLE;
              return (
                <a
                  key={j.id}
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl p-4 border transition-all hover:border-indigo-400/50 hover:shadow-md hover:shadow-indigo-500/5"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text)] group-hover:text-indigo-400 transition truncate">
                        {j.title}
                      </p>
                      <p className="text-[var(--text-muted)] text-sm mt-0.5 truncate">
                        {j.company}
                        {j.location && <span className="mx-1.5 opacity-40">·</span>}
                        {j.location}
                      </p>
                    </div>
                    <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition text-sm shrink-0 mt-0.5">
                      Open →
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                    {/* Source badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${srcStyle}`}>
                      {srcLabel}
                    </span>
                    {/* Experience level badge */}
                    {level && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_STYLE[level]}`}>
                        {level === "Entry" ? "Entry Level" : "Senior"}
                      </span>
                    )}
                    {/* Date */}
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      {new Date(j.fetched_at).toLocaleDateString()}
                    </span>
                  </div>
                </a>
              );
            })}

            {filtered.length === 0 && !loading && (
              <div className="text-center py-16 rounded-2xl border" style={{ borderColor: "var(--border)" }}>
                <div className="text-4xl mb-3">🔍</div>
                <p className="font-semibold text-lg mb-1">No jobs match your filters</p>
                <p className="text-[var(--text-muted)] text-sm">
                  Try clearing the filters or click ↺ Refresh Jobs to fetch new listings.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
