"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import { setToken } from "@/lib/auth";

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
    <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-6">
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        {error && <p className="bg-red-500/20 text-red-300 rounded p-3 mb-4 text-sm">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text" placeholder="Full Name" required value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email" placeholder="Email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password" placeholder="Password (min 8 chars)" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit" disabled={loading}
            className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 py-3 rounded-lg font-semibold transition"
          >
            {loading ? "Creating account…" : "Register"}
          </button>
        </form>
        <p className="text-slate-400 text-sm mt-4 text-center">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}
