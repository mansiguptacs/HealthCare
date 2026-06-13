import Link from "next/link";

const steps = [
  {
    n: "1",
    title: "She sees the helpline",
    body: "A TV / radio campaign shares one free, confidential number for women's health. No cost, no judgment.",
  },
  {
    n: "2",
    title: "She calls and is heard",
    body: "Grok Voice greets her in her own language, gently gathers her problem, and turns it into a private clinical note.",
  },
  {
    n: "3",
    title: "She gets a real next step",
    body: "Severity-aware help: first aid now, then the nearest clinic or mobile camp, or a consented NGO waitlist if she can't travel.",
  },
  {
    n: "4",
    title: "NGOs go where it hurts most",
    body: "Aggregated, anonymous demand shows providers where to set up camp for maximum impact - which then reaches her.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="pill bg-[var(--accent-soft)] text-[var(--accent)]">
            Grok Voice · Vercel · Inngest
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Healthcare that reaches women where the system doesn&apos;t.
          </h1>
          <p className="mt-5 text-lg text-[var(--muted)] leading-relaxed">
            A free, confidential, voice-first helpline for women and girls in
            remote and rural areas. They speak; Grok listens in their language,
            triages with care, and connects them to the nearest help - while
            NGOs learn exactly where to go next.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/call"
              className="px-5 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90 transition"
            >
              Try the helpline
            </Link>
            <Link
              href="/dashboard"
              className="px-5 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-semibold hover:bg-[var(--background)] transition"
            >
              Open NGO dashboard
            </Link>
          </div>
        </div>
        <div className="card p-8">
          <div className="text-sm font-semibold text-[var(--muted)] mb-4">
            Why it matters
          </div>
          <ul className="space-y-4 text-[var(--foreground)]">
            <li className="flex gap-3">
              <span className="text-[var(--primary)] font-bold">·</span>
              Stigma, distance, and cost keep women from reproductive care.
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--primary)] font-bold">·</span>
              A voice call needs no literacy, app, or smartphone.
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--primary)] font-bold">·</span>
              Minimal data: only a phone number and high-level problem are kept.
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--primary)] font-bold">·</span>
              Every AI recommendation is fully traceable and auditable.
            </li>
          </ul>
        </div>
      </section>

      <section className="pb-20">
        <h2 className="text-2xl font-bold tracking-tight mb-8">How it works</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="card p-6">
              <div className="grid place-items-center w-9 h-9 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] font-bold mb-4">
                {s.n}
              </div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
