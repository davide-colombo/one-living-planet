import { Hero } from "@/components/hero/Hero";

export default function Home() {
  return (
    <main>
      {/* The hero pins to the viewport; the story slides over the globe. */}
      <div className="sticky top-0 z-0 h-svh">
        <Hero />
      </div>
      <div className="pointer-events-none relative z-10">
        {/* runway one: scroll here pulls the camera back from the limb
            to the whole planet (height = P1_VH in Hero.tsx) */}
        <div aria-hidden className="journey-runway h-[160svh]" />

        {/* the planet itself — passes during the held beat (HOLD_VH) */}
        <section
          id="planet"
          className="mx-auto flex h-[100svh] max-w-2xl flex-col justify-center px-[var(--space-5)]"
        >
          <p
            className="pointer-events-auto font-medium"
            style={{
              fontSize: "var(--text-title-2)",
              letterSpacing: "var(--tracking-title)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Third planet from the Sun, four and a half billion years old, and the only world we know
            of that has ever been alive.
          </p>
          <p
            className="pointer-events-auto mt-[var(--space-5)]"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            About 2.13 million species have a name so far. The best estimate says the real number is
            close to 8.7 million. Most of life on this planet has never been seen up close. This
            site is a way to meet it.
          </p>
        </section>

        {/* runway two: the viewpoint expands from Earth to the whole
            solar system (height = P2_VH in Hero.tsx) */}
        <div aria-hidden className="journey-runway h-[260svh]" />

        {/* arriving among the planets */}
        <section
          id="solar-system"
          className="mx-auto flex min-h-[90svh] max-w-2xl flex-col justify-center px-[var(--space-5)]"
        >
          <p
            className="pointer-events-auto font-medium"
            style={{
              fontSize: "var(--text-title-2)",
              letterSpacing: "var(--tracking-title)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            Step back far enough and Earth becomes one planet among eight.
          </p>
          <p
            className="pointer-events-auto mt-[var(--space-5)]"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            A small rocky world around an ordinary star, out in one arm of an ordinary galaxy. From
            here the story goes outward, and back in time. That part of the site is coming.
          </p>
        </section>

        {/* quiet close, for now */}
        <section className="mx-auto flex min-h-[50svh] max-w-2xl flex-col justify-center px-[var(--space-5)] pb-[var(--space-10)]">
          <p
            className="pointer-events-auto"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-body-sm)",
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            The explorer opens soon.
          </p>
        </section>
      </div>
    </main>
  );
}
