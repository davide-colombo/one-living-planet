"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  PALETTES,
  type PaletteStateName,
  formatOklch,
  paletteAtPhase,
  paletteToCssVars,
  phaseFromLocalClock,
} from "@/lib/palette";

/* ---------------------------------------------------------------- */
/* helpers                                                          */
/* ---------------------------------------------------------------- */

function solarTimeLabel(phase: number): string {
  const totalMinutes = Math.round(phase * 24 * 60) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const STATE_JUMPS: Array<{ name: PaletteStateName; label: string; phase: number }> = [
  { name: "night", label: "Night", phase: 0 },
  { name: "dawn", label: "Dawn", phase: 0.27 },
  { name: "day", label: "Day", phase: 0.5 },
  { name: "dusk", label: "Dusk", phase: 0.73 },
];

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <header className="mb-[var(--space-5)] flex flex-wrap items-baseline gap-x-[var(--space-4)] gap-y-1">
      <h2
        className="font-semibold"
        style={{ fontSize: "var(--text-title-2)", letterSpacing: "var(--tracking-title)" }}
      >
        {title}
      </h2>
      {note ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-body-sm)" }}>{note}</p>
      ) : null}
    </header>
  );
}

function TokenChip({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-[var(--space-3)]">
      <span
        aria-hidden
        className="inline-block h-6 w-6 shrink-0 rounded-full"
        style={{
          background: value,
          boxShadow: "0 0 0 1px color-mix(in oklab, var(--fg) 25%, transparent)",
        }}
      />
      <span className="font-mono" style={{ fontSize: "var(--text-caption)" }}>
        {name}
      </span>
      <span
        className="ml-auto font-mono"
        style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* sections                                                         */
/* ---------------------------------------------------------------- */

function SolarPanel() {
  // Initialized from the local clock (stand-in for the Step 2 solar engine).
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    // Deliberate post-hydration sync: the clock value only exists on the
    // client, and the server-rendered phase 0 must match the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(phaseFromLocalClock(new Date()));
  }, []);

  const palette = useMemo(() => paletteAtPhase(phase), [phase]);
  const vars = useMemo(() => paletteToCssVars(palette) as CSSProperties, [palette]);

  return (
    <section>
      <SectionHeading
        title="Solar palette"
        note="continuous interpolation across the day; scrub with the dev slider"
      />
      <div
        style={{
          ...vars,
          background: "linear-gradient(to bottom, var(--bg-a), var(--bg-b))",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-7) var(--space-6)",
          color: "var(--fg)",
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--fg) 12%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-6)]">
          <div className="max-w-md">
            <p
              className="font-medium uppercase"
              style={{
                fontSize: "var(--text-caption)",
                letterSpacing: "var(--tracking-caps)",
                color: "var(--accent)",
              }}
            >
              Solar time {solarTimeLabel(phase)}
            </p>
            <p
              className="mt-2 font-semibold"
              style={{
                fontSize: "var(--text-title-1)",
                letterSpacing: "var(--tracking-title)",
                lineHeight: "var(--leading-tight)",
              }}
            >
              One planet, lit in real time.
            </p>
            <p className="mt-3" style={{ color: "var(--fg-muted)" }}>
              Background, text, accent, and atmosphere rim all derive from a single solar phase
              value.
            </p>
          </div>

          {/* atmosphere rim demo */}
          <div
            className="grid place-items-center"
            style={{ padding: "var(--space-4)" }}
            aria-hidden
          >
            <div
              style={{
                width: 150,
                height: 150,
                borderRadius: "var(--radius-full)",
                background:
                  "radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--rim) 40%, var(--bg-a)), var(--bg-a) 72%)",
                boxShadow: [
                  "0 0 48px 6px color-mix(in oklab, var(--rim) 50%, transparent)",
                  "inset -20px -16px 44px rgba(0, 0, 0, 0.55)",
                  "inset 5px 7px 26px color-mix(in oklab, var(--rim) 55%, transparent)",
                ].join(", "),
                transition:
                  "box-shadow var(--duration-ambient) var(--ease-gentle), background var(--duration-ambient) var(--ease-gentle)",
              }}
            />
          </div>
        </div>

        {/* dev-only scrubber */}
        <div
          className="mt-[var(--space-6)] rounded-[var(--radius-md)]"
          style={{
            background: "color-mix(in oklab, var(--bg-a) 55%, transparent)",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
            <label
              htmlFor="solar-scrub"
              className="font-mono uppercase"
              style={{
                fontSize: "var(--text-caption)",
                letterSpacing: "var(--tracking-caps)",
                color: "var(--fg-muted)",
              }}
            >
              dev · solar phase {phase.toFixed(3)}
            </label>
            <div className="flex gap-[var(--space-2)]">
              {STATE_JUMPS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setPhase(s.phase)}
                  className="rounded-full px-3 py-1 font-medium"
                  style={{
                    fontSize: "var(--text-caption)",
                    background: "color-mix(in oklab, var(--fg) 12%, transparent)",
                    color: "var(--fg)",
                    transition: "background var(--duration-fast) var(--ease-out)",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <input
            id="solar-scrub"
            type="range"
            min={0}
            max={24}
            step={0.05}
            value={phase * 24}
            onChange={(e) => setPhase(Number(e.target.value) / 24)}
            className="mt-[var(--space-3)] w-full"
            style={{ accentColor: "var(--accent)" }}
          />
          <div
            className="flex justify-between font-mono"
            style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
          >
            {["00", "06", "12", "18", "24"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaletteStates() {
  return (
    <section>
      <SectionHeading title="Palette states" note="the four keyframes of the solar day" />
      <div className="grid gap-[var(--space-4)] sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(PALETTES) as PaletteStateName[]).map((name) => {
          const p = PALETTES[name];
          const vars = paletteToCssVars(p) as CSSProperties;
          return (
            <article
              key={name}
              style={{
                ...vars,
                background: "linear-gradient(to bottom, var(--bg-a), var(--bg-b))",
                color: "var(--fg)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-5)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--fg) 12%, transparent)",
              }}
            >
              <h3
                className="font-semibold capitalize"
                style={{ fontSize: "var(--text-title-3)", letterSpacing: "var(--tracking-title)" }}
              >
                {name}
              </h3>
              <p
                className="mt-1 mb-[var(--space-4)]"
                style={{ fontSize: "var(--text-body-sm)", color: "var(--fg-muted)" }}
              >
                Aa, the quick brown fox
              </p>
              <div className="grid gap-[var(--space-2)]">
                <TokenChip name="--fg" value={formatOklch(p.fg)} />
                <TokenChip name="--fg-muted" value={formatOklch(p.fgMuted)} />
                <TokenChip name="--accent" value={formatOklch(p.accent)} />
                <TokenChip name="--rim" value={formatOklch(p.rim)} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const TYPE_STEPS = [
  {
    token: "--text-hero",
    label: "Hero",
    sample: "Earthrise",
    weight: 700,
    tracking: "var(--tracking-display)",
  },
  {
    token: "--text-display",
    label: "Display",
    sample: "One living planet",
    weight: 600,
    tracking: "var(--tracking-display)",
  },
  {
    token: "--text-title-1",
    label: "Title 1",
    sample: "The terminator line",
    weight: 600,
    tracking: "var(--tracking-title)",
  },
  {
    token: "--text-title-2",
    label: "Title 2",
    sample: "City lights at night",
    weight: 600,
    tracking: "var(--tracking-title)",
  },
  {
    token: "--text-title-3",
    label: "Title 3",
    sample: "Atmosphere as a thin shell",
    weight: 600,
    tracking: "var(--tracking-title)",
  },
  {
    token: "--text-body",
    label: "Body",
    sample:
      "Seen from space, the day side hands off to the night side along a soft gradient called the terminator.",
    weight: 400,
    tracking: "var(--tracking-body)",
  },
  {
    token: "--text-body-sm",
    label: "Body S",
    sample: "Secondary copy, captions under figures, and UI labels sit at this size.",
    weight: 400,
    tracking: "var(--tracking-body)",
  },
  {
    token: "--text-caption",
    label: "Caption",
    sample: "NASA BLUE MARBLE · VISIBLE EARTH",
    weight: 500,
    tracking: "var(--tracking-caps)",
  },
];

function Typography() {
  return (
    <section>
      <SectionHeading
        title="Typography"
        note="system stack: SF Pro on Apple hardware, Inter or Segoe elsewhere"
      />
      <div className="grid gap-[var(--space-5)]">
        {TYPE_STEPS.map((s) => (
          <div key={s.token} className="grid gap-1">
            <span
              className="font-mono"
              style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
            >
              {s.label} · {s.token}
            </span>
            <p
              style={{
                fontSize: `var(${s.token})`,
                fontWeight: s.weight,
                letterSpacing: s.tracking,
                lineHeight: "var(--leading-snug)",
                textTransform: s.label === "Caption" ? "uppercase" : undefined,
                color:
                  s.label.startsWith("Body") || s.label === "Caption"
                    ? "var(--fg-muted)"
                    : "var(--fg)",
                maxWidth: "38ch",
              }}
            >
              {s.sample}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function Spacing() {
  return (
    <section>
      <SectionHeading title="Spacing" note="4px base scale" />
      <div className="grid gap-[var(--space-2)]">
        {SPACE_STEPS.map((n) => (
          <div key={n} className="flex items-center gap-[var(--space-4)]">
            <span
              className="w-24 font-mono"
              style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
            >
              --space-{n}
            </span>
            <span
              className="h-4 rounded-[2px]"
              style={{ width: `var(--space-${n})`, background: "var(--accent)" }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

const DURATIONS = [
  { token: "--duration-instant", note: "hover feedback" },
  { token: "--duration-fast", note: "small controls" },
  { token: "--duration-base", note: "most transitions" },
  { token: "--duration-slow", note: "large surfaces" },
  { token: "--duration-ambient", note: "palette cross-fades" },
];

const EASINGS = [
  { token: "--ease-standard", note: "default" },
  { token: "--ease-out", note: "entrances" },
  { token: "--ease-in", note: "exits" },
  { token: "--ease-gentle", note: "sheets, hero moves" },
];

function Motion() {
  const [runId, setRunId] = useState(0);
  return (
    <section>
      <SectionHeading title="Motion" note="restrained and ease-out biased, nothing bouncy" />
      <button
        type="button"
        onClick={() => setRunId((n) => n + 1)}
        className="mb-[var(--space-5)] rounded-full px-4 py-1.5 font-medium"
        style={{
          background: "var(--accent)",
          color: "var(--bg-a)",
          fontSize: "var(--text-body-sm)",
        }}
      >
        Replay
      </button>
      <div className="grid gap-[var(--space-6)] lg:grid-cols-2">
        <div className="grid gap-[var(--space-3)]">
          {DURATIONS.map((d) => (
            <div key={d.token} className="flex items-center gap-[var(--space-4)]">
              <span
                className="w-44 shrink-0 font-mono"
                style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
              >
                {d.token}
              </span>
              <div
                className="relative h-2 flex-1 rounded-full"
                style={{ background: "color-mix(in oklab, var(--fg) 10%, transparent)" }}
              >
                <span
                  key={runId}
                  className="motion-dot"
                  style={{
                    animationDuration: `var(${d.token})`,
                    animationTimingFunction: "var(--ease-standard)",
                  }}
                />
              </div>
              <span
                className="w-40 shrink-0 text-right"
                style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
              >
                {d.note}
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-[var(--space-3)]">
          {EASINGS.map((e) => (
            <div key={e.token} className="flex items-center gap-[var(--space-4)]">
              <span
                className="w-44 shrink-0 font-mono"
                style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
              >
                {e.token}
              </span>
              <div
                className="relative h-2 flex-1 rounded-full"
                style={{ background: "color-mix(in oklab, var(--fg) 10%, transparent)" }}
              >
                <span
                  key={runId}
                  className="motion-dot"
                  style={{
                    animationDuration: "900ms",
                    animationTimingFunction: `var(${e.token})`,
                  }}
                />
              </div>
              <span
                className="w-40 shrink-0 text-right"
                style={{ fontSize: "var(--text-caption)", color: "var(--fg-muted)" }}
              >
                {e.note}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .motion-dot {
          position: absolute;
          top: 50%;
          left: 0;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: var(--accent);
          transform: translate(0, -50%);
          animation-name: styleguide-slide;
          animation-fill-mode: forwards;
        }
        @keyframes styleguide-slide {
          from { left: 0; }
          to { left: calc(100% - 14px); }
        }
      `}</style>
    </section>
  );
}

/* ---------------------------------------------------------------- */

export function StyleguideClient() {
  return (
    <main
      className="mx-auto grid max-w-5xl gap-[var(--space-9)]"
      style={{ padding: "var(--space-8) var(--space-5) var(--space-10)" }}
    >
      <header>
        <p
          className="font-medium uppercase"
          style={{
            fontSize: "var(--text-caption)",
            letterSpacing: "var(--tracking-caps)",
            color: "var(--accent)",
          }}
        >
          Earth Explorer
        </p>
        <h1
          className="mt-1 font-semibold"
          style={{ fontSize: "var(--text-display)", letterSpacing: "var(--tracking-display)" }}
        >
          Styleguide
        </h1>
        <p className="mt-3 max-w-xl" style={{ color: "var(--fg-muted)" }}>
          The visual system for the landing experience. Every color on this page derives from four
          palette states and a single solar-phase value.
        </p>
      </header>
      <SolarPanel />
      <PaletteStates />
      <Typography />
      <Spacing />
      <Motion />
    </main>
  );
}
