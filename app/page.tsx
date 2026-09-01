import { Hero } from "@/components/hero/Hero";

const CHAPTERS = [
  { id: "overview", n: "01", title: "Overview" },
  { id: "atmosphere", n: "02", title: "Atmosphere" },
  { id: "biosphere", n: "03", title: "Biosphere" },
  { id: "explore", n: "04", title: "Explore" },
];

export default function Home() {
  return (
    <main>
      <Hero />
      {CHAPTERS.map((c) => (
        <section
          key={c.id}
          id={c.id}
          className="mx-auto flex min-h-[70svh] max-w-5xl flex-col justify-center px-[var(--space-5)]"
        >
          <p
            className="font-mono"
            style={{
              fontSize: "var(--text-caption)",
              letterSpacing: "var(--tracking-caps)",
              color: "var(--accent)",
            }}
          >
            {c.n}
          </p>
          <h2
            className="mt-[var(--space-2)] font-semibold"
            style={{
              fontSize: "var(--text-title-1)",
              letterSpacing: "var(--tracking-title)",
              color: "var(--fg-muted)",
            }}
          >
            {c.title}
          </h2>
        </section>
      ))}
    </main>
  );
}
