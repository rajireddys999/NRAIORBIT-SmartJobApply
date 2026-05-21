"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import { setToken } from "@/lib/auth";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await register(email, name, password);
      setToken(data.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center px-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="mb-8">
        <Logo size="md" />
      </div>

      <div className="w-full max-w-md rounded-2xl p-8 border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        {error && <p className="bg-red-500/15 text-red-500 dark:text-red-300 rounded-xl p-3 mb-4 text-sm border border-red-500/20">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text" placeholder="Full Name" required value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ background: "var(--bg-input)", color: "var(--text)", borderColor: "var(--border)" }}
            className="rounded-xl px-4 py-3 outline-none border focus:ring-2 focus:ring-indigo-500 transition placeholder:text-[var(--text-muted)]"
          />
          <input
            type="email" placeholder="Email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ background: "var(--bg-input)", color: "var(--text)", borderColor: "var(--border)" }}
            className="rounded-xl px-4 py-3 outline-none border focus:ring-2 focus:ring-indigo-500 transition placeholder:text-[var(--text-muted)]"
          />
          <input
            type="password" placeholder="Password (min 8 chars)" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ background: "var(--bg-input)", color: "var(--text)", borderColor: "var(--border)" }}
            className="rounded-xl px-4 py-3 outline-none border focus:ring-2 focus:ring-indigo-500 transition placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit" disabled={loading}
            className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 py-3 rounded-xl font-semibold text-white transition shadow-lg shadow-indigo-500/25"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="text-[var(--text-muted)] text-sm mt-5 text-center">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-500 hover:underline font-medium">Log in</Link>
        </p>
      </div>
    </main>
  );
}
