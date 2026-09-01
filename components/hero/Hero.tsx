"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { oklchToRgb, paletteAtPhase, paletteToCssVars } from "@/lib/palette";
import { localSolarPhase, localTimezone } from "@/lib/solar";
import { StaticHero } from "./StaticHero";

const EarthGlobe = dynamic(() => import("./EarthGlobe"), { ssr: false });

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

  const palette = useMemo(() => paletteAtPhase(phase ?? 0), [phase]);
  const vars = useMemo(() => paletteToCssVars(palette) as CSSProperties, [palette]);
  const rimRgb = useMemo(() => oklchToRgb(palette.rim), [palette]);

  return (
    <section
      className="relative h-svh overflow-hidden"
      style={{
        ...vars,
        background: "linear-gradient(to bottom, var(--bg-a), var(--bg-b))",
        color: "var(--fg)",
        transition: "background var(--duration-ambient) var(--ease-gentle)",
      }}
    >
      {/* sun glare behind the limb */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 30% at 72% 88%, color-mix(in oklab, var(--accent) 28%, transparent), transparent 70%)",
        }}
      />

      {mode === "webgl" && clockMs !== null ? (
        <EarthGlobe rimColor={rimRgb} atMs={clockMs} />
      ) : null}
      {mode === "static" ? <StaticHero /> : null}

      {/* copy */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center px-[var(--space-5)] pt-[18svh] text-center">
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
            " "
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
      </div>

      {/* scroll cue */}
      <a
        href="#overview"
        className="absolute bottom-[var(--space-6)] left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5"
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
    </section>
  );
}
