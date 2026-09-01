"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { oklchToRgb, paletteAtPhase, paletteToCssVars } from "@/lib/palette";
import { localSolarPhase, localTimezone } from "@/lib/solar";
import { StaticHero } from "./StaticHero";

const EarthGlobe = dynamic(() => import("./EarthGlobe"), { ssr: false });

/** Scroll distance of the pull-back journey, in viewport heights.
    Keep in sync with the journey spacer on the landing page. */
export const JOURNEY_VH = 1.6;

function solarClockLabel(phase: number): string {
  const totalMinutes = Math.round(phase * 1440) % 1440;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type HeroMode = "loading" | "webgl" | "static";

function detectMode(): HeroMode {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  try {
    const canvas = document.createElement("canvas");
    if (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) return "webgl";
  } catch {
    /* fall through to static */
  }
  return "static";
}

/**
 * Dev-only time travel: `?t=<solar hour 0–24>` shifts the clock so both
 * the palette and the sun direction move together.
 */
function devTimeOffsetMs(): number {
  if (process.env.NODE_ENV === "production") return 0;
  const t = new URLSearchParams(window.location.search).get("t");
  if (t === null) return 0;
  const target = Number(t) / 24;
  if (!Number.isFinite(target)) return 0;
  const current = localSolarPhase(new Date());
  const delta = (((target - current) % 1) + 1) % 1;
  return delta * 86_400_000;
}

export function Hero() {
  // Server render carries phase 0 (night, matching the CSS defaults);
  // the real solar phase arrives right after hydration.
  const [phase, setPhase] = useState<number | null>(null);
  const [mode, setMode] = useState<HeroMode>("loading");
  const [timezone, setTimezone] = useState("");
  const [clockMs, setClockMs] = useState<number | null>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init after hydration
    setMode(detectMode());
    setTimezone(localTimezone());
    const offset = devTimeOffsetMs();
    const tick = () => {
      const ms = Date.now() + offset;
      setClockMs(ms);
      setPhase(localSolarPhase(new Date(ms)));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // One scroll handler drives the whole journey: 3D rig progress,
  // the deep-space fade, and the hero copy fading out.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, window.scrollY / (vh * JOURNEY_VH)));
        progressRef.current = p;
        if (spaceRef.current) {
          spaceRef.current.style.opacity = Math.min(1, p * 1.25).toFixed(3);
        }
        if (copyRef.current) {
          copyRef.current.style.opacity = Math.max(0, 1 - window.scrollY / (vh * 0.4)).toFixed(3);
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const palette = useMemo(() => paletteAtPhase(phase ?? 0), [phase]);
  const vars = useMemo(() => paletteToCssVars(palette), [palette]);
  const rimRgb = useMemo(() => oklchToRgb(palette.rim), [palette]);

  // The live palette drives the whole document, not just the hero —
  // the page background is one continuous surface, so scrolling out of
  // the hero never hits a seam.
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  }, [vars]);

  return (
    <section className="relative h-full overflow-hidden" style={{ color: "var(--fg)" }}>
      {/* deep space, fading in as the journey pulls back */}
      <div
        ref={spaceRef}
        aria-hidden
        className="absolute inset-0"
        style={{ background: "#040508", opacity: 0 }}
      />

      {mode === "webgl" && clockMs !== null ? (
        <EarthGlobe rimColor={rimRgb} atMs={clockMs} progressRef={progressRef} />
      ) : null}
      {mode === "static" ? <StaticHero /> : null}

      {/* copy */}
      <div
        ref={copyRef}
        className="pointer-events-none absolute inset-0 flex flex-col items-center px-[var(--space-5)] pt-[12svh] text-center"
      >
        <p
          className="font-medium uppercase"
          style={{
            fontSize: "var(--text-caption)",
            letterSpacing: "var(--tracking-caps)",
            color: "var(--accent)",
          }}
        >
          {phase !== null ? (
            <>
              Solar time {solarClockLabel(phase)}
              {timezone ? ` · ${timezone.replace("_", " ")}` : ""}
            </>
          ) : (
            " "
          )}
        </p>
        <h1
          className="mt-[var(--space-3)] font-semibold"
          style={{
            fontSize: "var(--text-hero)",
            letterSpacing: "var(--tracking-display)",
            lineHeight: "var(--leading-tight)",
          }}
        >
          Earth
        </h1>
        <p
          className="mt-[var(--space-4)] max-w-md"
          style={{ color: "var(--fg-muted)", fontSize: "var(--text-body)" }}
        >
          One living planet, seen the way it is lit right now — from where you are.
        </p>

        {/* scroll cue */}
        <a
          href="#living-planet"
          className="pointer-events-auto absolute bottom-[var(--space-6)] left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5"
          style={{
            fontSize: "var(--text-caption)",
            letterSpacing: "var(--tracking-caps)",
            color: "var(--fg-muted)",
            background: "color-mix(in oklab, var(--bg-a) 45%, transparent)",
            textTransform: "uppercase",
            transition: "color var(--duration-fast) var(--ease-out)",
          }}
        >
          Begin
        </a>
      </div>
    </section>
  );
}
