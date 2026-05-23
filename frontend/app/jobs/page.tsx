"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole } from "@/lib/auth";
import { getJobs, refreshJobs, adminTaskStatus } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

// ── Source display config ─────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  linkedin:   "LinkedIn",
  themuse:    "The Muse",
  remoteok:   "RemoteOK",
  arbeitnow:  "Arbeitnow",
  lever:      "Lever",
  ashby:      "Ashby",
  indeed:     "Indeed",
};
const SOURCE_STYLE: Record<string, string> = {
  greenhouse: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25",
  linkedin:   "bg-blue-500/10   text-blue-600   dark:text-blue-400   border border-blue-500/25",
  themuse:    "bg-purple-500/10 text-purple-600  dark:text-purple-400  border border-purple-500/25",
  remoteok:   "bg-orange-500/10 text-orange-600  dark:text-orange-400  border border-orange-500/25",
  arbeitnow:  "bg-teal-500/10   text-teal-600    dark:text-teal-400    border border-teal-500/25",
  lever:      "bg-rose-500/10   text-rose-600    dark:text-rose-400    border border-rose-500/25",
  ashby:      "bg-violet-500/10 text-violet-600  dark:text-violet-400  border border-violet-500/25",
  indeed:     "bg-sky-500/10    text-sky-700     dark:text-sky-300     border border-sky-500/25",
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

type RefreshStatus = "idle" | "queued" | "running" | "done" | "failed";

export default function JobBoard() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newJobIds, setNewJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshMsg, setRefreshMsg] = useState("");
  const [locationFilter, setLocationFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState<"All" | "Entry" | "Senior" | "Mid">("All");
  const [sortKey, setSortKey] = useState<"fetched_at" | "posted_at" | "company" | "title">("fetched_at");

  useEffect(() => {
    const token = getToken();
    const role = getRole();
    if (!token) { router.push("/login"); return; }
    setIsAdmin(role === "admin");
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
    const list = jobs.filter(j => {
      const locOk = locationFilter === "All" || j.location === locationFilter;
      const srcOk = sourceFilter === "All" || j.source === sourceFilter;
      if (!locOk || !srcOk) return false;
      if (levelFilter === "All") return true;
      const lvl = detectLevel(j.title);
      if (levelFilter === "Entry")  return lvl === "Entry";
      if (levelFilter === "Senior") return lvl === "Senior";
      if (levelFilter === "Mid")    return lvl === null;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortKey === "fetched_at") {
        return new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime();
      }
      if (sortKey === "posted_at") {
        const aDate = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const bDate = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return bDate - aDate;
      }
      if (sortKey === "company") return a.company.localeCompare(b.company);
      if (sortKey === "title")   return a.title.localeCompare(b.title);
      return 0;
    });
  }, [jobs, locationFilter, sourceFilter, levelFilter, sortKey]);

  async function handleRefresh() {
    const token = getToken();
    if (!token) return;
    setRefreshStatus("queued");
    setRefreshMsg("");

    // Snapshot current job IDs so we can diff after the task finishes
    const knownIds = new Set(jobs.map((j: any) => j.id));

    try {
      const { task_id } = await refreshJobs(token);
      setRefreshStatus("running");

      const deadline = Date.now() + 4 * 60 * 1000;
      const poll = async () => {
        if (Date.now() > deadline) {
          setRefreshStatus("failed");
          setRefreshMsg("Timed out — task still running in background.");
          return;
        }
        try {
          const status = await adminTaskStatus(token, task_id);
          if (status.state === "SUCCESS") {
            setRefreshStatus("done");
            // Re-fetch jobs and surface only the new ones
            const fresh = await getJobs(token, 1, 100);
            const added = fresh.filter((j: any) => !knownIds.has(j.id));
            // Sort: new jobs first, then existing
            setJobs([...added, ...fresh.filter((j: any) => knownIds.has(j.id))]);
            setNewJobIds(new Set(added.map((j: any) => j.id)));
            const result = status.result;
            if (result) {
              setRefreshMsg(`${result.saved} new job${result.saved !== 1 ? "s" : ""} added (${result.fetched} fetched total)`);
            } else {
              setRefreshMsg("Refresh complete.");
            }
          } else if (status.state === "FAILURE") {
            setRefreshStatus("failed");
            setRefreshMsg(status.error ?? "Refresh failed.");
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 3000);
    } catch {
      setRefreshStatus("failed");
      setRefreshMsg("Failed to queue refresh.");
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
          {isAdmin && (
            <button
              onClick={handleRefresh}
              disabled={refreshStatus === "queued" || refreshStatus === "running"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                refreshStatus === "queued" || refreshStatus === "running"
                  ? "bg-indigo-400/30 text-indigo-300 cursor-wait"
                  : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25"
              }`}
            >
              {(refreshStatus === "queued" || refreshStatus === "running") && (
                <span className="w-3.5 h-3.5 border-2 border-indigo-300/40 border-t-indigo-300 rounded-full animate-spin" />
              )}
              <span>
                {refreshStatus === "queued" ? "Queuing…"
                  : refreshStatus === "running" ? "Fetching…"
                  : "↺ Refresh Jobs"}
              </span>
            </button>
          )}
        </div>

        {refreshStatus !== "idle" && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm border ${
            refreshStatus === "done"
              ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
              : refreshStatus === "failed"
              ? "border-red-500/25 bg-red-500/10 text-red-500"
              : "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
          }`}>
            {refreshStatus === "queued" && "Queuing task…"}
            {refreshStatus === "running" && (
              <span>Fetching from all sources<span className="animate-pulse">…</span></span>
            )}
            {refreshStatus === "done" && (refreshMsg || "Refresh complete.")}
            {refreshStatus === "failed" && `❌ ${refreshMsg}`}
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
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)] font-medium">Sort</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as typeof sortKey)}
              className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="fetched_at">Latest Fetched</option>
              <option value="posted_at">Latest Posted</option>
              <option value="company">Company A→Z</option>
              <option value="title">Title A→Z</option>
            </select>
          </div>
          {(locationFilter !== "All" || sourceFilter !== "All" || levelFilter !== "All" || sortKey !== "fetched_at") && (
            <button
              onClick={() => { setLocationFilter("All"); setSourceFilter("All"); setLevelFilter("All"); setSortKey("fetched_at"); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline transition"
            >
              Clear all
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
              const isNew = newJobIds.has(j.id);
              const dateLabel = j.posted_at
                ? `Posted ${new Date(j.posted_at).toLocaleDateString()}`
                : `Fetched ${new Date(j.fetched_at).toLocaleDateString()}`;
              return (
                <a
                  key={j.id}
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group block rounded-xl p-4 border transition-all hover:border-indigo-400/50 hover:shadow-md hover:shadow-indigo-500/5 ${
                    isNew ? "border-indigo-400/40 ring-1 ring-indigo-400/20" : ""
                  }`}
                  style={{ background: "var(--bg-card)", borderColor: isNew ? undefined : "var(--border)" }}
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
                    {/* New badge */}
                    {isNew && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500 text-white">
                        New
                      </span>
                    )}
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
                    {/* Date — posted_at preferred, fetched_at as fallback */}
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      {dateLabel}
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
