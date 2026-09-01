import { describe, expect, it } from "vitest";
import {
  PALETTES,
  PHASE_STOPS,
  lerpHue,
  mixOklch,
  paletteAtPhase,
  phaseFromLocalClock,
  wrapPhase,
} from "./palette";

describe("wrapPhase", () => {
  it("wraps into [0, 1)", () => {
    expect(wrapPhase(0)).toBe(0);
    expect(wrapPhase(1)).toBe(0);
    expect(wrapPhase(1.25)).toBeCloseTo(0.25);
    expect(wrapPhase(-0.25)).toBeCloseTo(0.75);
  });
});

describe("lerpHue", () => {
  it("interpolates along the shortest arc", () => {
    expect(lerpHue(10, 50, 0.5)).toBeCloseTo(30);
    // 350 → 10 should pass through 0, not 180
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0);
    // night indigo → dawn peach goes up through magenta/red
    expect(lerpHue(265, 45, 0.5)).toBeCloseTo(335);
  });

  it("returns endpoints at t=0 and t=1", () => {
    expect(lerpHue(265, 45, 0)).toBeCloseTo(265);
    expect(lerpHue(265, 45, 1)).toBeCloseTo(45);
  });
});

describe("mixOklch", () => {
  it("lerps lightness and chroma linearly", () => {
    const mixed = mixOklch({ l: 0.2, c: 0.1, h: 0 }, { l: 0.6, c: 0.3, h: 0 }, 0.5);
    expect(mixed.l).toBeCloseTo(0.4);
    expect(mixed.c).toBeCloseTo(0.2);
  });
});

describe("paletteAtPhase", () => {
  it("returns pure states on their plateaus", () => {
    expect(paletteAtPhase(0)).toEqual(PALETTES.night);
    expect(paletteAtPhase(0.1)).toEqual(PALETTES.night);
    expect(paletteAtPhase(0.27)).toEqual(PALETTES.dawn);
    expect(paletteAtPhase(0.5)).toEqual(PALETTES.day);
    expect(paletteAtPhase(0.73)).toEqual(PALETTES.dusk);
    expect(paletteAtPhase(0.95)).toEqual(PALETTES.night);
  });

  it("wraps around midnight", () => {
    expect(paletteAtPhase(1.1)).toEqual(paletteAtPhase(0.1));
    expect(paletteAtPhase(-0.1)).toEqual(paletteAtPhase(0.9));
  });

  it("is between the neighboring states mid-transition", () => {
    // halfway between night (0.20) and dawn (0.27)
    const mid = paletteAtPhase(0.235);
    const lo = Math.min(PALETTES.night.bgB.l, PALETTES.dawn.bgB.l);
    const hi = Math.max(PALETTES.night.bgB.l, PALETTES.dawn.bgB.l);
    expect(mid.bgB.l).toBeGreaterThan(lo);
    expect(mid.bgB.l).toBeLessThan(hi);
  });

  it("has monotonically ordered stops covering [0, 1]", () => {
    expect(PHASE_STOPS[0].phase).toBe(0);
    expect(PHASE_STOPS[PHASE_STOPS.length - 1].phase).toBe(1);
    for (let i = 1; i < PHASE_STOPS.length; i++) {
      expect(PHASE_STOPS[i].phase).toBeGreaterThan(PHASE_STOPS[i - 1].phase);
    }
  });
});

describe("phaseFromLocalClock", () => {
  it("maps midnight to 0 and noon to 0.5", () => {
    expect(phaseFromLocalClock(new Date(2026, 0, 1, 0, 0, 0))).toBe(0);
    expect(phaseFromLocalClock(new Date(2026, 0, 1, 12, 0, 0))).toBe(0.5);
    expect(phaseFromLocalClock(new Date(2026, 0, 1, 18, 0, 0))).toBe(0.75);
  });
});
