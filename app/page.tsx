import Link from "next/link";
import { Hero } from "@/components/hero/Hero";

const proseShadow = { textShadow: "0 2px 24px rgba(0, 0, 0, 0.9), 0 1px 4px rgba(0, 0, 0, 0.8)" };

export default function Home() {
  return (
    <main>
      {/* The hero pins to the viewport; the story slides over the globe. */}
      <div className="sticky top-0 z-0 h-svh">
        <Hero />
      </div>
      <div className="story-layer pointer-events-none relative z-10">
        {/* runway one: scroll here pulls the camera back from the limb
            to the whole planet (height = P1_VH in Hero.tsx) */}
        <div aria-hidden className="journey-runway h-[160svh]" />

        {/* the planet itself — passes during the held beat (HOLD_VH) */}
        <section id="planet" className="flex h-[100svh] flex-col justify-center">
          <div
            className="pointer-events-auto ml-[7vw] max-w-xl pr-[var(--space-5)]"
            style={proseShadow}
          >
            <p
              className="font-medium"
              style={{
                fontSize: "clamp(1.5rem, 1.1rem + 1.4vw, 2.8rem)",
                letterSpacing: "var(--tracking-title)",
                lineHeight: "var(--leading-snug)",
              }}
            >
              Third planet from the Sun, four and a half billion years old, and the only world we
              know of that has ever been alive.
            </p>
            <p
              className="mt-[var(--space-5)]"
              style={{
                color: "color-mix(in oklab, var(--fg) 85%, transparent)",
                fontSize: "clamp(1.05rem, 0.9rem + 0.55vw, 1.5rem)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              About 2.13 million species have a name so far. The best estimate says the real number
              is close to 8.7 million. Most of life on this planet has never been seen up close.
              This site is a way to meet it.
            </p>
            <Link
              href="/explore"
              className="mt-[var(--space-6)] inline-block rounded-full px-5 py-2 uppercase"
              style={{
                fontSize: "var(--text-caption)",
                letterSpacing: "var(--tracking-caps)",
                color: "var(--fg)",
                background: "color-mix(in oklab, var(--bg-a) 60%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--fg) 30%, transparent)",
              }}
            >
              Meet the ecoregions
            </Link>
          </div>
        </section>

        {/* runway two: the viewpoint expands from Earth to the whole
            solar system (height = P2_VH in Hero.tsx) */}
        <div aria-hidden className="journey-runway h-[260svh]" />

        {/* arriving among the planets */}
        <section id="solar-system" className="flex min-h-[100svh] flex-col justify-center">
          <div
            className="pointer-events-auto ml-[7vw] max-w-xl pr-[var(--space-5)]"
            style={proseShadow}
          >
            <p
              className="font-medium"
              style={{
                fontSize: "clamp(1.5rem, 1.1rem + 1.4vw, 2.8rem)",
                letterSpacing: "var(--tracking-title)",
                lineHeight: "var(--leading-snug)",
              }}
            >
              Step back far enough and Earth becomes one planet among eight.
            </p>
            <p
              className="mt-[var(--space-5)] pb-[var(--space-10)]"
              style={{
                color: "color-mix(in oklab, var(--fg) 85%, transparent)",
                fontSize: "clamp(1.05rem, 0.9rem + 0.55vw, 1.5rem)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              A small rocky world around an ordinary star, out in one arm of an ordinary galaxy.
              From here the story goes outward, and back in time. That part of the site is coming.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
