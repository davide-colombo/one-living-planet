import { Hero } from "@/components/hero/Hero";

export default function Home() {
  return (
    <main>
      {/* The hero pins to the viewport; the story slides over the globe. */}
      <div className="sticky top-0 z-0 h-svh">
        <Hero />
      </div>
      <div className="relative z-10">
        {/* runway one: scroll here pulls the camera back from the limb
            to the whole planet (height = P1_VH in Hero.tsx) */}
        <div aria-hidden className="h-[160svh]" />

        {/* the planet itself — passes during the held beat (HOLD_VH) */}
        <section
          id="planet"
          className="mx-auto flex h-[100svh] max-w-2xl flex-col justify-center px-[var(--space-5)]"
        >
          <p
            className="font-medium"
            style={{
              fontSize: "var(--text-title-2)",
              letterSpacing: "var(--tracking-title)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Third from the Sun, four and a half billion years old — and, as far as anyone knows, the
            only world that has ever been alive.
          </p>
          <p
            className="mt-[var(--space-5)]"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            Around 2.13 million species have been described so far. The best estimate puts the real
            number near 8.7 million — which means most of life on Earth has never been named,
            photographed, or understood. This is a journey through what we know.
          </p>
        </section>

        {/* runway two: the viewpoint expands from Earth to the whole
            solar system (height = P2_VH in Hero.tsx) */}
        <div aria-hidden className="h-[260svh]" />

        {/* arriving among the planets */}
        <section
          id="solar-system"
          className="mx-auto flex min-h-[90svh] max-w-2xl flex-col justify-center px-[var(--space-5)]"
        >
          <p
            className="font-medium"
            style={{
              fontSize: "var(--text-title-2)",
              letterSpacing: "var(--tracking-title)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Step back far enough, and Earth becomes one of eight.
          </p>
          <p
            className="mt-[var(--space-5)]"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            A small rocky world circling an ordinary star, two thirds of the way out along one arm
            of an ordinary galaxy. From here the journey continues outward — through the solar
            system, and backward through deep time. Those parts of the story are on their way.
          </p>
        </section>

        {/* quiet close, for now */}
        <section className="mx-auto flex min-h-[50svh] max-w-2xl flex-col justify-center px-[var(--space-5)] pb-[var(--space-10)]">
          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body-sm)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            The exploration begins here soon.
          </p>
        </section>
      </div>
    </main>
  );
}
