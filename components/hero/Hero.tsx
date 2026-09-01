"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { oklchToRgb, paletteAtPhase, paletteToCssVars } from "@/lib/palette";
import { localSolarPhase, localTimezone } from "@/lib/solar";
import { StaticHero } from "./StaticHero";

const EarthGlobe = dynamic(() => import("./EarthGlobe"), { ssr: false });

/** Scroll choreography, in viewport heights. Keep in sync with the
    runway spacers on the landing page:
    P1 = limb close-up → whole Earth in space,
    HOLD = a held beat while the planet prose passes,
    P2 = zoom out from Earth's viewpoint to the whole solar system. */
export const P1_VH = 1.6;
export const HOLD_VH = 1.0;
export const P2_VH = 2.6;

/** Scroll speed (in viewport-heights/second) treated as a fling:
    the snap correction then plays faster to stay out of the way. */
const FAST_SCROLL_VHPS = 2.5;

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

const TOUCHED_KEY = "earth-explorer:touched";

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Hero() {
  // Server render carries phase 0 (night, matching the CSS defaults);
  // the real solar phase arrives right after hydration.
  const [phase, setPhase] = useState<number | null>(null);
  const [mode, setMode] = useState<HeroMode>("loading");
  const modeRef = useRef<HeroMode>("loading");
  const [timezone, setTimezone] = useState("");
  const [clockMs, setClockMs] = useState<number | null>(null);
  // "interaction mode": the visitor has picked up a body — every
  // distraction fades out until they let go.
  const [interacting, setInteracting] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  // focused celestial body (system view): rig zooms in on it
  const [focused, setFocused] = useState<string | null>(null);
  const [atTop, setAtTop] = useState(true);
  const focusedRef = useRef<string | null>(null);
  const focusStartY = useRef(0);
  const copyRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const journeyRef = useRef({ p1: 0, p2: 0 });

  /* ---- programmatic scrolling (pull-ins and snap transitions) ---- */
  const scrollAnim = useRef<number | null>(null);

  const cancelScrollAnim = useCallback(() => {
    if (scrollAnim.current !== null) {
      cancelAnimationFrame(scrollAnim.current);
      scrollAnim.current = null;
    }
  }, []);

  const animateScrollTo = useCallback(
    (targetY: number, duration = 850) => {
      cancelScrollAnim();
      const startY = window.scrollY;
      if (Math.abs(targetY - startY) < 2) return;
      const startT = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - startT) / duration);
        window.scrollTo(0, startY + (targetY - startY) * easeInOut(t));
        scrollAnim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      scrollAnim.current = requestAnimationFrame(step);
    },
    [cancelScrollAnim],
  );

  // First-visit hint, until the planet has been touched once.
  useEffect(() => {
    if (mode !== "webgl") return;
    let touched = false;
    try {
      touched = localStorage.getItem(TOUCHED_KEY) === "1";
    } catch {
      /* storage unavailable — show the hint */
    }
    if (touched) return;
    const id = setTimeout(() => setHintVisible(true), 2500);
    return () => clearTimeout(id);
  }, [mode]);

  // Stable identity: a fresh closure would re-run the globe's pointer
  // effect on every render, resetting a drag in progress.
  const onInteractionChange = useCallback((active: boolean) => {
    setInteracting(active);
    if (!active) return;
    setHintVisible(false);
    try {
      localStorage.setItem(TOUCHED_KEY, "1");
    } catch {
      /* fine — the hint will just show again next visit */
    }
  }, []);

  const onFocusRequest = useCallback(
    (name: string | null) => {
      if (name === "earth") {
        // Earth's detailed view lives at its scroll anchor — go there.
        setFocused(null);
        focusedRef.current = null;
        animateScrollTo(window.innerHeight * P1_VH, 1100);
        return;
      }
      setFocused(name);
      focusedRef.current = name;
      focusStartY.current = window.scrollY;
    },
    [animateScrollTo],
  );

  // Static visitors (reduced motion, no WebGL) get no scroll journey:
  // the page collapses the runways and the snap stays out of the way.
  useEffect(() => {
    modeRef.current = mode;
    if (mode === "static") document.documentElement.dataset.hero = "static";
    return () => {
      delete document.documentElement.dataset.hero;
    };
  }, [mode]);

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

  // One scroll handler drives the whole journey: 3D rig progress, the
  // deep-space fade, copy fade, focus release, and — via a scroll-end
  // debounce — the snap that forbids resting inside a transition.
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let peakVel = 0; // vh/s, decays
    let lastDir = 1; // +1 scrolling down, -1 scrolling up
    let snapTimer: ReturnType<typeof setTimeout> | undefined;

    const snapIfBetweenZones = () => {
      if (modeRef.current !== "webgl") return;
      if (focusedRef.current !== null || scrollAnim.current !== null) return;
      const vh = window.innerHeight;
      const y = window.scrollY;
      const earthAnchor = vh * P1_VH;
      const holdEnd = vh * (P1_VH + HOLD_VH);
      const systemAnchor = vh * (P1_VH + HOLD_VH + P2_VH);
      const margin = vh * 0.1;
      // The snap continues in the direction the visitor was going.
      // Stopping partway never rolls them back where they came from.
      let target: number | null = null;
      if (y > margin && y < earthAnchor - margin) {
        target = lastDir >= 0 ? earthAnchor : 0;
      } else if (y > holdEnd + margin && y < systemAnchor - margin) {
        target = lastDir >= 0 ? systemAnchor : holdEnd;
      }
      if (target === null) return;
      // quick after a fling, unhurried after a gentle stop; never a jump
      const distance = Math.abs(target - y) / vh;
      const base = peakVel > FAST_SCROLL_VHPS ? 220 : 380;
      animateScrollTo(target, Math.min(700, base + distance * 180));
    };

    const onScroll = () => {
      const now = performance.now();
      const y = window.scrollY;
      const vh = window.innerHeight;
      const dt = Math.max(1, now - lastT) / 1000;
      const vel = Math.abs(y - lastY) / vh / dt;
      peakVel = Math.max(vel, peakVel * Math.exp(-3 * dt));
      if (y !== lastY) lastDir = y > lastY ? 1 : -1;
      lastY = y;
      lastT = now;

      // scrolling away releases a focused body
      if (focusedRef.current !== null && Math.abs(y - focusStartY.current) > vh * 0.15) {
        focusedRef.current = null;
        setFocused(null);
      }

      clearTimeout(snapTimer);
      snapTimer = setTimeout(snapIfBetweenZones, 140);

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (modeRef.current !== "webgl") {
          if (copyRef.current) {
            copyRef.current.style.opacity = Math.max(0, 1 - y / (vh * 0.4)).toFixed(3);
          }
          return;
        }
        const p1 = Math.min(1, Math.max(0, y / (vh * P1_VH)));
        const p2 = Math.min(1, Math.max(0, (y - vh * (P1_VH + HOLD_VH)) / (vh * P2_VH)));
        journeyRef.current.p1 = p1;
        journeyRef.current.p2 = p2;
        if (spaceRef.current) {
          spaceRef.current.style.opacity = Math.min(1, p1 * 1.25).toFixed(3);
        }
        if (copyRef.current) {
          copyRef.current.style.opacity = Math.max(0, 1 - y / (vh * 0.4)).toFixed(3);
        }
        setAtTop(y < vh * 0.8);
      });
    };

    // a manual wheel/touch interrupts any programmatic scroll
    const onManualScroll = () => cancelScrollAnim();

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", onManualScroll, { passive: true });
    window.addEventListener("touchmove", onManualScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(snapTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", onManualScroll);
      window.removeEventListener("touchmove", onManualScroll);
    };
  }, [animateScrollTo, cancelScrollAnim]);

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
        <EarthGlobe
          rimColor={rimRgb}
          atMs={clockMs}
          journeyRef={journeyRef}
          focused={focused}
          onFocusRequest={onFocusRequest}
          onInteractionChange={onInteractionChange}
        />
      ) : null}
      {mode === "static" ? <StaticHero /> : null}

      {/* copy — outer layer fades with scroll, inner layer retreats
          into "interaction mode" while the visitor handles the planet */}
      <div
        ref={copyRef}
        className="pointer-events-none absolute inset-0 flex flex-col items-center px-[var(--space-5)] pt-[12svh] text-center"
      >
        <div
          className="flex w-full flex-1 flex-col items-center"
          style={{
            opacity: interacting ? 0 : 1,
            transition: "opacity var(--duration-slow) var(--ease-gentle)",
          }}
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
            href="#planet"
            className="absolute bottom-[var(--space-6)] left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5"
            style={{
              pointerEvents: interacting ? "none" : "auto",
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
      </div>

      {/* focused body caption */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[var(--space-7)] left-1/2 -translate-x-1/2 text-center uppercase"
        style={{
          fontSize: "var(--text-caption)",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--fg-muted)",
          opacity: focused ? 1 : 0,
          transition: "opacity var(--duration-slow) var(--ease-gentle)",
        }}
      >
        <span style={{ color: "var(--fg)" }}>{focused ?? " "}</span>
        <span className="mx-2">·</span>
        drag to spin · click away to release
      </div>

      {/* first-visit hint: the planet can be touched */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[22svh] left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 uppercase"
        style={{
          fontSize: "var(--text-caption)",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--fg)",
          background: "color-mix(in oklab, var(--bg-a) 60%, transparent)",
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--fg) 18%, transparent)",
          opacity: hintVisible ? 1 : 0,
          transition: "opacity var(--duration-ambient) var(--ease-gentle)",
        }}
      >
        {atTop ? "Touch the planet" : "Drag to spin the planet"}
      </div>
    </section>
  );
}
