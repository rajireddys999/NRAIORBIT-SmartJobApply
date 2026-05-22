"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole, clearToken } from "@/lib/auth";
import { adminGetUsers, adminGetStats, adminApprove, adminRevoke, refreshJobs, adminTaskStatus, adminGetEmployeeResumes, adminGetEmployeeResume } from "@/lib/api";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

type Employee = {
  id: string; name: string; email: string;
  role: string; status: string; created_at: string;
};

type Stats = {
  total_employees: number; pending: number; active: number;
  revoked: number; total_jobs: number; total_applications: number;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30",
  active:  "bg-green-500/15  text-green-600  dark:text-green-300  border border-green-500/30",
  revoked: "bg-red-500/15    text-red-600    dark:text-red-300    border border-red-500/30",
};

const STAT_CARDS = (s: Stats) => [
  { label: "Total Employees", value: s.total_employees, icon: "👥", color: "indigo" },
  { label: "Pending Approval", value: s.pending,         icon: "⏳", color: "yellow" },
  { label: "Active",           value: s.active,          icon: "✅", color: "emerald" },
  { label: "Total Jobs",       value: s.total_jobs,       icon: "💼", color: "purple" },
];

const CARD_BG: Record<string, string> = {
  indigo:  "border-indigo-400/30  bg-indigo-50   dark:bg-indigo-600/10",
  yellow:  "border-yellow-400/30  bg-yellow-50   dark:bg-yellow-600/10",
  emerald: "border-emerald-400/30 bg-emerald-50  dark:bg-emerald-600/10",
  purple:  "border-purple-400/30  bg-purple-50   dark:bg-purple-600/10",
};

type FilterTab = "all" | "pending" | "active" | "revoked";
type AdminTab = "employees" | "resumes";

type EmployeeResume = {
  id: string; name: string; email: string; status: string;
  resume: { id: string; filename: string; uploaded_at: string; download_url: string; has_embedding: boolean } | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>("employees");
  const [empResumes, setEmpResumes] = useState<EmployeeResume[]>([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [viewingResume, setViewingResume] = useState<string | null>(null);

  type RefreshStatus = "idle" | "queued" | "running" | "done" | "failed";
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshResult, setRefreshResult] = useState<{ fetched: number; saved: number } | null>(null);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    const token = getToken();
    const role = getRole();
    if (!token || role !== "admin") { router.push("/login"); return; }
    Promise.all([adminGetUsers(token), adminGetStats(token)])
      .then(([u, s]) => { setUsers(u); setStats(s); })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleApprove(userId: string) {
    const token = getToken()!;
    setActing(userId);
    try {
      await adminApprove(token, userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "active" } : u));
      setStats(prev => prev ? { ...prev, pending: prev.pending - 1, active: prev.active + 1 } : prev);
    } finally { setActing(null); }
  }

  async function handleRevoke(userId: string) {
    const token = getToken()!;
    setActing(userId);
    try {
      await adminRevoke(token, userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "revoked" } : u));
      setStats(prev => {
        if (!prev) return prev;
        const wasActive = users.find(u => u.id === userId)?.status === "active";
        return { ...prev, active: wasActive ? prev.active - 1 : prev.active, revoked: prev.revoked + 1 };
      });
    } finally { setActing(null); }
  }

  async function handleRefreshJobs() {
    const token = getToken()!;
    setRefreshStatus("queued");
    setRefreshResult(null);
    setRefreshError("");
    try {
      const { task_id } = await refreshJobs(token);
      setRefreshStatus("running");
      // Poll every 3 s until the task finishes (max 3 min)
      const deadline = Date.now() + 3 * 60 * 1000;
      const poll = async () => {
        if (Date.now() > deadline) {
          setRefreshStatus("failed");
          setRefreshError("Timed out — task still running in background.");
          return;
        }
        try {
          const status = await adminTaskStatus(token, task_id);
          if (status.state === "SUCCESS") {
            setRefreshStatus("done");
            setRefreshResult(status.result ?? null);
            // Refresh stats so job count updates
            adminGetStats(token).then(setStats).catch(() => {});
          } else if (status.state === "FAILURE") {
            setRefreshStatus("failed");
            setRefreshError(status.error ?? "Task failed.");
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
      setRefreshError("Failed to queue refresh. Try again.");
    }
  }

  async function handleLoadResumes() {
    const token = getToken()!;
    setResumesLoading(true);
    try {
      const data = await adminGetEmployeeResumes(token);
      setEmpResumes(data);
    } finally {
      setResumesLoading(false);
    }
  }

  async function handleViewResume(userId: string) {
    const token = getToken()!;
    setViewingResume(userId);
    try {
      const { download_url } = await adminGetEmployeeResume(token, userId);
      if (download_url) window.open(download_url, "_blank", "noopener,noreferrer");
      else alert("Resume URL unavailable — Supabase storage may not be configured.");
    } catch {
      alert("No resume uploaded by this employee.");
    } finally {
      setViewingResume(null);
    }
  }

  const filtered = users.filter(u => {
    if (u.role === "admin") return false;
    return filter === "all" || u.status === filter;
  });

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]
      dark:[background:radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.15)_0%,transparent_60%),linear-gradient(180deg,#04050f_0%,#080b1a_40%,#060910_100%)]">

      {/* Nav */}
      <nav className="border-b px-6 py-3 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md"
        style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}>
        <Link href="/"><Logo size="sm" /></Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25">
            Admin
          </span>
          <Link href="/jobs" className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition px-3 py-1.5 rounded-lg">
            Job Board
          </Link>
          <ThemeToggle />
          <button
            onClick={() => { clearToken(); router.push("/login"); }}
            className="text-[var(--text-muted)] hover:text-red-500 text-sm transition px-3 py-1.5 rounded-lg">
            Log out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight
              dark:[background:linear-gradient(135deg,#fff_0%,#a5b4fc_50%,#818cf8_100%)]
              dark:[-webkit-background-clip:text] dark:[-webkit-text-fill-color:transparent]
              text-gray-900">
              Admin Panel
            </h1>
            <p className="text-[var(--text-muted)] mt-1 text-sm">
              Manage employee access — approve or revoke accounts.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={handleRefreshJobs}
              disabled={refreshStatus === "queued" || refreshStatus === "running"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                refreshStatus === "queued" || refreshStatus === "running"
                  ? "bg-indigo-400/30 text-indigo-300 cursor-wait"
                  : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25"
              }`}
            >
              {refreshStatus === "queued" && (
                <span className="w-3.5 h-3.5 border-2 border-indigo-300/40 border-t-indigo-300 rounded-full animate-spin" />
              )}
              {refreshStatus === "running" && (
                <span className="w-3.5 h-3.5 border-2 border-indigo-300/40 border-t-indigo-300 rounded-full animate-spin" />
              )}
              {refreshStatus === "queued" ? "Queuing…"
                : refreshStatus === "running" ? "Fetching jobs…"
                : "↺ Refresh Jobs"}
            </button>

            {/* Status panel */}
            {refreshStatus !== "idle" && (
              <div className={`text-xs rounded-xl px-3 py-2 border max-w-xs text-right ${
                refreshStatus === "done"
                  ? "bg-green-500/10 border-green-500/25 text-green-600 dark:text-green-400"
                  : refreshStatus === "failed"
                  ? "bg-red-500/10 border-red-500/25 text-red-500"
                  : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
              }`}>
                {refreshStatus === "queued" && "Queuing task…"}
                {refreshStatus === "running" && (
                  <span>Fetching from all sources<span className="animate-pulse">…</span><br/>
                    <span className="opacity-60">Greenhouse · Lever · Ashby · The Muse · Arbeitnow · RemoteOK · LinkedIn</span>
                  </span>
                )}
                {refreshStatus === "done" && refreshResult && (
                  <span>
                    ✅ Done — <strong>{refreshResult.saved} new jobs</strong> saved
                    <br /><span className="opacity-70">{refreshResult.fetched} fetched total</span>
                  </span>
                )}
                {refreshStatus === "done" && !refreshResult && "✅ Completed"}
                {refreshStatus === "failed" && `❌ ${refreshError}`}
              </div>
            )}
          </div>
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {STAT_CARDS(stats).map(s => (
              <div key={s.label} className={`rounded-2xl p-5 border shadow-sm ${CARD_BG[s.color]}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-medium">{s.label}</p>
                  <span className="text-lg">{s.icon}</span>
                </div>
                <p className="text-3xl font-black tracking-tight">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Admin tabs */}
        <div className="flex gap-2 mb-6">
          {(["employees", "resumes"] as AdminTab[]).map(tab => (
            <button key={tab} onClick={() => {
              setAdminTab(tab);
              if (tab === "resumes" && empResumes.length === 0) handleLoadResumes();
            }}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${
                adminTab === tab
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                  : "border text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              style={adminTab !== tab ? { borderColor: "var(--border)", background: "var(--bg-card)" } : {}}>
              {tab === "employees" ? "👥 Employees" : "📄 Resumes"}
            </button>
          ))}
        </div>

        {/* Resumes panel */}
        {adminTab === "resumes" && (
          <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: "var(--border)" }}>
            <div className="grid grid-cols-[1fr_1fr_100px_120px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
              <span>Employee</span><span>Resume</span><span>Uploaded</span><span className="text-right">Action</span>
            </div>
            {resumesLoading ? (
              <div className="flex items-center gap-3 py-12 px-6 text-[var(--text-muted)]" style={{ background: "var(--bg-card)" }}>
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> Loading…
              </div>
            ) : empResumes.length === 0 ? (
              <div className="py-12 text-center text-[var(--text-muted)] text-sm" style={{ background: "var(--bg-card)" }}>
                No employees found.
              </div>
            ) : empResumes.map((emp, i) => (
              <div key={emp.id}
                className="grid grid-cols-[1fr_1fr_100px_120px] gap-4 px-5 py-4 items-center"
                style={{ background: "var(--bg-card)", borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <div>
                  <p className="font-semibold text-sm truncate">{emp.name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{emp.email}</p>
                </div>
                <div>
                  {emp.resume ? (
                    <>
                      <p className="text-sm truncate">{emp.resume.filename}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {emp.resume.has_embedding ? "✅ Embedded" : "⚠ No embedding"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">No resume</p>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {emp.resume ? new Date(emp.resume.uploaded_at).toLocaleDateString() : "—"}
                </p>
                <div className="flex justify-end">
                  {emp.resume ? (
                    emp.resume.download_url ? (
                      <a
                        href={emp.resume.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 transition"
                      >
                        View PDF
                      </a>
                    ) : (
                      <button
                        onClick={() => handleViewResume(emp.id)}
                        disabled={viewingResume === emp.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 transition disabled:opacity-50"
                      >
                        {viewingResume === emp.id ? "…" : "View PDF"}
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Employees section */}
        {adminTab === "employees" && (
          <>
            <div className="flex gap-2 mb-5 flex-wrap">
              {(["all", "pending", "active", "revoked"] as FilterTab[]).map(tab => (
                <button key={tab} onClick={() => setFilter(tab)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all capitalize ${
                    filter === tab
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                      : "border text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  style={filter !== tab ? { borderColor: "var(--border)", background: "var(--bg-card)" } : {}}>
                  {tab}
                  {tab === "pending" && stats?.pending ? (
                    <span className="ml-1.5 bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5">
                      {stats.pending}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center gap-3 py-16 text-[var(--text-muted)]">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-[1fr_1fr_120px_160px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                  style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
                  <span>Employee</span><span>Email</span><span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-[var(--text-muted)] text-sm" style={{ background: "var(--bg-card)" }}>
                    No employees in this category.
                  </div>
                ) : filtered.map((u, i) => (
                  <div key={u.id}
                    className="grid grid-cols-[1fr_1fr_120px_160px] gap-4 px-5 py-4 items-center transition-colors hover:bg-indigo-500/[0.03]"
                    style={{ background: "var(--bg-card)", borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <div>
                      <p className="font-semibold text-sm truncate">{u.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] truncate">{u.email}</p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit capitalize ${STATUS_STYLE[u.status] ?? ""}`}>
                      {u.status}
                    </span>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleViewResume(u.id)}
                        disabled={viewingResume === u.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 transition disabled:opacity-50"
                      >
                        {viewingResume === u.id ? "…" : "Resume"}
                      </button>
                      {u.status !== "active" && (
                        <button onClick={() => handleApprove(u.id)} disabled={acting === u.id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 hover:bg-green-500/25 transition disabled:opacity-50">
                          {acting === u.id ? "…" : "Approve"}
                        </button>
                      )}
                      {u.status !== "revoked" && (
                        <button onClick={() => handleRevoke(u.id)} disabled={acting === u.id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 hover:bg-red-500/20 transition disabled:opacity-50">
                          {acting === u.id ? "…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
