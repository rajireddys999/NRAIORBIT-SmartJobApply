import Link from "next/link";
import Logo from "@/components/Logo";
import AiBrain from "@/components/AiBrain";

const STATS = [
  { value: "24/7", label: "Always Running" },
  { value: "30m",  label: "Fetch Interval" },
  { value: "75%+", label: "Match Threshold" },
  { value: "∞",    label: "Applications" },
];

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        <path d="M11 8v6M8 11h6" strokeLinecap="round"/>
      </svg>
    ),
    title: "Job Fetcher Agent",
    desc: "Scrapes Indeed, LinkedIn & Glassdoor every 30 minutes. Deduplicates and embeds each listing automatically.",
    color: "from-indigo-500/20 to-indigo-500/5",
    border: "border-indigo-500/30",
    glow: "group-hover:shadow-indigo-500/20",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "AI Resume Matcher",
    desc: "OpenAI embeddings compute cosine similarity between your resume and every job. Scores 0–100, auto-triggers apply at 75+.",
    color: "from-violet-500/20 to-violet-500/5",
    border: "border-violet-500/30",
    glow: "group-hover:shadow-violet-500/20",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" strokeLinecap="round"/>
      </svg>
    ),
    title: "Auto-Apply Agent",
    desc: "Playwright fills and submits application forms — LinkedIn Easy Apply and generic forms — hands-free while you sleep.",
    color: "from-purple-500/20 to-purple-500/5",
    border: "border-purple-500/30",
    glow: "group-hover:shadow-purple-500/20",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Email Notifications",
    desc: "Instant SendGrid confirmation emails after every application — job title, company, match score, and timestamp.",
    color: "from-fuchsia-500/20 to-fuchsia-500/5",
    border: "border-fuchsia-500/30",
    glow: "group-hover:shadow-fuchsia-500/20",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#020817] text-white overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#020817]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <Logo size="sm" />
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-slate-400 hover:text-white text-sm transition">Log In</Link>
            <Link href="/register"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg font-semibold transition shadow-lg shadow-indigo-500/25">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12">

          {/* Left — copy */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-semibold tracking-widest mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
              AI-POWERED · 24/7 AUTONOMOUS
            </div>

            <h1 className="text-4xl lg:text-6xl font-black leading-tight mb-6">
              Apply to{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent animate-glow">
                hundreds of jobs
              </span>
              <br />while you sleep.
            </h1>

            <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0">
              Upload your resume once. Our AI scrapes US job boards every 30 minutes,
              scores each listing against your profile, and auto-applies to every match
              above your threshold — no clicks required.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link href="/register"
                className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500
                           px-8 py-4 rounded-xl font-bold text-lg transition shadow-2xl shadow-indigo-500/30">
                Start Applying Free →
              </Link>
              <Link href="/login"
                className="border border-slate-600 hover:border-indigo-400 hover:text-indigo-300
                           px-8 py-4 rounded-xl font-semibold text-lg transition text-slate-300">
                Log In
              </Link>
            </div>
          </div>

          {/* Right — AI neural network visual */}
          <div className="flex-1 relative animate-float">
            {/* Glow blob behind */}
            <div className="absolute inset-0 -inset-8 bg-gradient-radial from-indigo-600/20 via-violet-600/10 to-transparent rounded-full blur-3xl" />

            {/* Orbit rings around the viz */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg viewBox="0 0 400 400" className="w-full h-full opacity-20 animate-spin-slow absolute">
                <ellipse cx="200" cy="200" rx="190" ry="80" stroke="#6366f1" strokeWidth="1" fill="none" strokeDasharray="4 6" />
              </svg>
              <svg viewBox="0 0 400 400" className="w-full h-full opacity-15 animate-spin-rev absolute">
                <ellipse cx="200" cy="200" rx="150" ry="60" stroke="#a855f7" strokeWidth="1" fill="none" strokeDasharray="2 8" transform="rotate(45 200 200)" />
              </svg>
            </div>

            {/* Neural net */}
            <div className="relative z-10 bg-slate-900/60 border border-white/10 rounded-3xl p-6 backdrop-blur-sm shadow-2xl">
              <AiBrain />
              {/* Scan line overlay */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                <div className="animate-scan w-full h-8 bg-gradient-to-b from-transparent via-indigo-400/10 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 border-y border-white/5 bg-white/2">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                {s.value}
              </div>
              <div className="text-slate-500 text-sm mt-1 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-black mb-4">
            Four agents.{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Zero effort.
            </span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            A fully autonomous pipeline — from scraping to applying to emailing — running on Celery workers 24/7.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className={`group relative border ${f.border} rounded-2xl p-8 bg-gradient-to-br ${f.color}
                         backdrop-blur-sm hover:shadow-2xl ${f.glow} transition-all duration-300`}
            >
              <div className="text-indigo-400 mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-slate-400 leading-relaxed">{f.desc}</p>
              {/* Corner accent */}
              <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-lg" />
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent to-indigo-950/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black mb-16">
            How{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              it works
            </span>
          </h2>
          <div className="flex flex-col md:flex-row gap-0 items-stretch">
            {[
              { step: "01", title: "Upload Resume", desc: "Drop your PDF once. We parse and embed it." },
              { step: "02", title: "AI Matches Jobs", desc: "We score every listing 0–100 against your profile." },
              { step: "03", title: "Auto-Applied", desc: "Matches above 75% get applied to automatically." },
              { step: "04", title: "Email Confirmed", desc: "You get an email for every application sent." },
            ].map((s, i) => (
              <div key={s.step} className="flex-1 relative">
                {/* Connector */}
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 right-0 w-px h-16 bg-gradient-to-b from-indigo-500/50 to-transparent translate-x-1/2 z-10" />
                )}
                <div className="bg-slate-900/60 border border-white/8 rounded-2xl p-6 mx-2 h-full">
                  <div className="text-4xl font-black text-indigo-500/40 mb-3">{s.step}</div>
                  <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                  <p className="text-slate-400 text-sm">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="relative inline-block mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full blur-3xl opacity-30" />
            <Logo size="lg" />
          </div>
          <h2 className="text-4xl font-black mb-6">
            Ready to let AI<br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              handle your job search?
            </span>
          </h2>
          <p className="text-slate-400 mb-10 text-lg">
            Create your account, upload your resume, and wake up to applications already sent.
          </p>
          <Link href="/register"
            className="inline-block bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500
                       px-10 py-5 rounded-2xl font-black text-xl transition shadow-2xl shadow-indigo-500/40">
            Get Started — It&apos;s Free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <Logo size="sm" />
          <p className="text-slate-600 text-sm">© 2026 NRAIORBIT. All rights reserved.</p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <Link href="/login" className="hover:text-white transition">Login</Link>
            <Link href="/register" className="hover:text-white transition">Register</Link>
            <Link href="/jobs" className="hover:text-white transition">Jobs</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
