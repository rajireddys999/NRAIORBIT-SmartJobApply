"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api";
import { setToken, setRole } from "@/lib/auth";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      setRole(data.role);
      router.push(data.role === "admin" ? "/admin" : "/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isPending = error.includes("pending");
  const isRevoked = error.includes("revoked");

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center px-6">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <Link href="/" className="mb-8 block"><Logo size="md" /></Link>

      <div className="w-full max-w-md rounded-2xl p-8 border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h1 className="text-2xl font-bold mb-6">Log In</h1>

        {error && (
          <div className={`rounded-xl p-3 mb-4 text-sm border ${
            isPending
              ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/25"
              : isRevoked
              ? "bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20"
              : "bg-red-500/15 text-red-500 dark:text-red-300 border-red-500/20"
          }`}>
            {isPending && <span className="font-semibold block mb-0.5">⏳ Pending Approval</span>}
            {isRevoked && <span className="font-semibold block mb-0.5">🚫 Access Revoked</span>}
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email" placeholder="Email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ background: "var(--bg-input)", color: "var(--text)", borderColor: "var(--border)" }}
            className="rounded-xl px-4 py-3 outline-none border focus:ring-2 focus:ring-indigo-500 transition placeholder:text-[var(--text-muted)]"
          />
          <input
            type="password" placeholder="Password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ background: "var(--bg-input)", color: "var(--text)", borderColor: "var(--border)" }}
            className="rounded-xl px-4 py-3 outline-none border focus:ring-2 focus:ring-indigo-500 transition placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit" disabled={loading}
            className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 py-3 rounded-xl font-semibold text-white transition shadow-lg shadow-indigo-500/25"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>
        <p className="text-[var(--text-muted)] text-sm mt-5 text-center">
          No account?{" "}
          <Link href="/register" className="text-indigo-500 hover:underline font-medium">Request access</Link>
        </p>
      </div>
    </main>
  );
}
