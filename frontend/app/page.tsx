import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-900 text-white flex flex-col items-center justify-center px-6">
      <h1 className="text-5xl font-bold mb-4 text-center">SmartJobApply</h1>
      <p className="text-xl text-slate-300 mb-8 text-center max-w-xl">
        Your 24/7 AI agent that scrapes US job listings, matches them to your resume,
        and auto-applies — while you sleep.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="bg-indigo-500 hover:bg-indigo-400 px-6 py-3 rounded-lg font-semibold transition"
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="border border-slate-400 hover:border-white px-6 py-3 rounded-lg font-semibold transition"
        >
          Log In
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl w-full">
        {[
          { title: "Job Fetcher", desc: "Scrapes Indeed & LinkedIn every 30 min" },
          { title: "AI Matcher", desc: "Semantic matching with OpenAI embeddings" },
          { title: "Auto-Apply", desc: "Fills forms with Playwright — hands-free" },
        ].map((f) => (
          <div key={f.title} className="bg-white/10 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
            <p className="text-slate-300 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
