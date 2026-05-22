"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getRole, clearToken } from "@/lib/auth";
import { adminGetUsers, adminGetStats, adminApprove, adminRevoke } from "@/lib/api";
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

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

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
        <div className="mb-8">
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

        {/* Filter tabs */}
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

        {/* Employee table */}
        {loading ? (
          <div className="flex items-center gap-3 py-16 text-[var(--text-muted)]">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_120px_160px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
              <span>Employee</span>
              <span>Email</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center text-[var(--text-muted)] text-sm"
                style={{ background: "var(--bg-card)" }}>
                No employees in this category.
              </div>
            ) : filtered.map((u, i) => (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_1fr_120px_160px] gap-4 px-5 py-4 items-center transition-colors hover:bg-indigo-500/[0.03]"
                style={{
                  background: "var(--bg-card)",
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                }}
              >
                <div>
                  <p className="font-semibold text-sm truncate">{u.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-sm text-[var(--text-muted)] truncate">{u.email}</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit capitalize ${STATUS_STYLE[u.status] ?? ""}`}>
                  {u.status}
                </span>
                <div className="flex gap-2 justify-end">
                  {u.status !== "active" && (
                    <button
                      onClick={() => handleApprove(u.id)}
                      disabled={acting === u.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 hover:bg-green-500/25 transition disabled:opacity-50"
                    >
                      {acting === u.id ? "…" : "Approve"}
                    </button>
                  )}
                  {u.status !== "revoked" && (
                    <button
                      onClick={() => handleRevoke(u.id)}
                      disabled={acting === u.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 hover:bg-red-500/20 transition disabled:opacity-50"
                    >
                      {acting === u.id ? "…" : "Revoke"}
                    </button>
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
