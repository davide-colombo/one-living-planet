import { Hero } from "@/components/hero/Hero";

// Chapter structure from docs/concept.md — the hero is chapter 01, "Earthrise".
const CHAPTERS = [
  { id: "living-planet", n: "02", title: "The living planet" },
  { id: "one-tree", n: "03", title: "One tree" },
  { id: "in-danger", n: "04", title: "In danger" },
  { id: "explore", n: "05", title: "Explore" },
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
