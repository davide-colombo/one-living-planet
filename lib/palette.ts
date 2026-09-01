/**
 * Solar palette engine.
 *
 * Canonical definition of the four palette states (night, dawn, day, dusk)
 * and the continuous interpolation between them, driven by a normalized
 * solar phase in [0, 1):
 *
 *   0.00 = solar midnight · 0.25 = sunrise · 0.50 = solar noon · 0.75 = sunset
 *
 * Colors are OKLCH so cross-fades stay perceptually smooth (night→dawn
 * travels indigo→pink→peach instead of muddying through gray).
 *
 * The real solar phase comes from the solar-time engine (Step 2);
 * `phaseFromLocalClock` is a stand-in that treats local clock time as
 * solar time.
 */

export interface Oklch {
  /** lightness 0–1 */
  l: number;
  /** chroma, ~0–0.4 */
  c: number;
  /** hue in degrees 0–360 */
  h: number;
}

export interface PaletteState {
  /** background gradient, zenith (top) */
  bgA: Oklch;
  /** background gradient, horizon (bottom) */
  bgB: Oklch;
  fg: Oklch;
  fgMuted: Oklch;
  accent: Oklch;
  /** atmosphere rim glow */
  rim: Oklch;
}

export type PaletteStateName = "night" | "dawn" | "day" | "dusk";

const oklch = (l: number, c: number, h: number): Oklch => ({ l, c, h });

export const PALETTES: Record<PaletteStateName, PaletteState> = {
  night: {
    bgA: oklch(0.14, 0.025, 262),
    bgB: oklch(0.22, 0.055, 265),
    fg: oklch(0.93, 0.01, 250),
    fgMuted: oklch(0.72, 0.02, 255),
    accent: oklch(0.75, 0.12, 240),
    rim: oklch(0.65, 0.16, 255),
  },
  dawn: {
    bgA: oklch(0.24, 0.06, 280),
    bgB: oklch(0.62, 0.11, 45),
    fg: oklch(0.96, 0.012, 60),
    fgMuted: oklch(0.78, 0.03, 60),
    accent: oklch(0.72, 0.15, 45),
    rim: oklch(0.72, 0.13, 30),
  },
  day: {
    bgA: oklch(0.45, 0.1, 252),
    bgB: oklch(0.7, 0.11, 230),
    fg: oklch(0.99, 0.005, 230),
    fgMuted: oklch(0.88, 0.02, 235),
    accent: oklch(0.8, 0.12, 215),
    rim: oklch(0.85, 0.09, 220),
  },
  dusk: {
    bgA: oklch(0.22, 0.07, 300),
    bgB: oklch(0.55, 0.14, 50),
    fg: oklch(0.95, 0.012, 70),
    fgMuted: oklch(0.76, 0.03, 65),
    accent: oklch(0.7, 0.16, 55),
    rim: oklch(0.68, 0.15, 40),
  },
};

/**
 * Keyframe track across the solar day. Dawn and dusk are transient
 * (narrow windows); night and day are plateaus.
 */
export const PHASE_STOPS: ReadonlyArray<{ phase: number; state: PaletteStateName }> = [
  { phase: 0.0, state: "night" },
  { phase: 0.2, state: "night" },
  { phase: 0.27, state: "dawn" },
  { phase: 0.35, state: "day" },
  { phase: 0.65, state: "day" },
  { phase: 0.73, state: "dusk" },
  { phase: 0.8, state: "night" },
  { phase: 1.0, state: "night" },
];

/** Wrap any number into [0, 1). */
export function wrapPhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate hue along the shortest arc, in degrees. */
export function lerpHue(a: number, b: number, t: number): number {
  let delta = (((b - a) % 360) + 540) % 360; // 0..360
  delta -= 180; // -180..180
  return (((a + delta * t) % 360) + 360) % 360;
}

export function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  return {
    l: lerp(a.l, b.l, t),
    c: lerp(a.c, b.c, t),
    h: lerpHue(a.h, b.h, t),
  };
}

export function mixPaletteState(a: PaletteState, b: PaletteState, t: number): PaletteState {
  return {
    bgA: mixOklch(a.bgA, b.bgA, t),
    bgB: mixOklch(a.bgB, b.bgB, t),
    fg: mixOklch(a.fg, b.fg, t),
    fgMuted: mixOklch(a.fgMuted, b.fgMuted, t),
    accent: mixOklch(a.accent, b.accent, t),
    rim: mixOklch(a.rim, b.rim, t),
  };
}

/** The fully interpolated palette at a given solar phase. */
export function paletteAtPhase(phase: number): PaletteState {
  const p = wrapPhase(phase);
  for (let i = 0; i < PHASE_STOPS.length - 1; i++) {
    const from = PHASE_STOPS[i];
    const to = PHASE_STOPS[i + 1];
    if (p >= from.phase && p <= to.phase) {
      const span = to.phase - from.phase;
      const t = span === 0 ? 0 : smoothstep((p - from.phase) / span);
      return mixPaletteState(PALETTES[from.state], PALETTES[to.state], t);
    }
  }
  return PALETTES.night;
}

export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** CSS custom-property map for a palette state, ready to spread into a style. */
export function paletteToCssVars(p: PaletteState): Record<string, string> {
  return {
    "--bg-a": formatOklch(p.bgA),
    "--bg-b": formatOklch(p.bgB),
    "--fg": formatOklch(p.fg),
    "--fg-muted": formatOklch(p.fgMuted),
    "--accent": formatOklch(p.accent),
    "--rim": formatOklch(p.rim),
  };
}

/**
 * OKLCH → sRGB (0–1, gamma-encoded, clamped). Needed where CSS can't
 * do the conversion for us — e.g. WebGL shader uniforms.
 */
export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin: [number, number, number] = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];

  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

/**
 * Stand-in until the solar-time engine (Step 2): treats local clock time
 * as solar time, so 00:00 → 0, 12:00 → 0.5.
 */
export function phaseFromLocalClock(date: Date): number {
  const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return seconds / 86400;
}
