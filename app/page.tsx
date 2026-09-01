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
      {/* The hero pins to the viewport; chapters slide over the globe. */}
      <div className="sticky top-0 z-0 h-svh">
        <Hero />
      </div>
      <div className="relative z-10">
        {/* journey runway: scroll here pulls the camera back from the
            limb to the whole planet before the chapters arrive
            (height = JOURNEY_VH in Hero.tsx) */}
        <div aria-hidden className="h-[160svh]" />
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
                color: "var(--fg)",
              }}
            >
              {c.title}
            </h2>
          </section>
        ))}
      </div>
    </main>
  );
}
