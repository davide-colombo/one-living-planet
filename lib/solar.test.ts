import { describe, expect, it } from "vitest";
import {
  daysSinceJ2000,
  equationOfTime,
  longitudeFromUtcOffset,
  solarPhase,
  subsolarPoint,
  sunDirection,
} from "./solar";

describe("daysSinceJ2000", () => {
  it("is zero at the epoch", () => {
    expect(daysSinceJ2000(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(0);
  });
});

describe("subsolarPoint", () => {
  it("is near the equator at the March equinox", () => {
    // 2026-03-20 ~14:46 UTC
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 14, 46)));
    expect(Math.abs(lat)).toBeLessThan(0.1);
  });

  it("is near the Tropic of Cancer at the June solstice", () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 8, 25)));
    expect(lat).toBeGreaterThan(23.3);
    expect(lat).toBeLessThan(23.5);
  });

  it("is near the Tropic of Capricorn at the December solstice", () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 11, 21, 20, 50)));
    expect(lat).toBeLessThan(-23.3);
    expect(lat).toBeGreaterThan(-23.5);
  });

  it("has longitude near 0 at Greenwich mean noon (within equation of time)", () => {
    const date = new Date(Date.UTC(2026, 8, 1, 12));
    const { lon } = subsolarPoint(date);
    // EoT ≈ ±16 min ≈ ±4°
    expect(Math.abs(lon)).toBeLessThan(4.5);
  });

  it("moves ~15° west per hour", () => {
    const a = subsolarPoint(new Date(Date.UTC(2026, 8, 1, 12)));
    const b = subsolarPoint(new Date(Date.UTC(2026, 8, 1, 13)));
    expect(a.lon - b.lon).toBeCloseTo(15, 1);
  });
});

describe("sunDirection", () => {
  it("is a unit vector", () => {
    const [x, y, z] = sunDirection(new Date(Date.UTC(2026, 8, 1, 12)));
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
  });

  it("points north of the equatorial plane in northern summer", () => {
    const [, y] = sunDirection(new Date(Date.UTC(2026, 5, 21, 12)));
    expect(y).toBeGreaterThan(0.35); // sin(23.4°) ≈ 0.397
  });

  it("+Z corresponds to the subsolar meridian at lon 0", () => {
    // pick a moment when subsolar lon ≈ 0
    const date = new Date(Date.UTC(2026, 8, 1, 12));
    const { lon } = subsolarPoint(date);
    const [x, , z] = sunDirection(date);
    expect(Math.atan2(x, z) / (Math.PI / 180)).toBeCloseTo(lon, 6);
  });
});

describe("equationOfTime", () => {
  it("stays within the known annual range", () => {
    for (let m = 0; m < 12; m++) {
      const eot = equationOfTime(new Date(Date.UTC(2026, m, 15, 12)));
      expect(eot).toBeGreaterThan(-15);
      expect(eot).toBeLessThan(17);
    }
  });

  it("is strongly negative in mid-February", () => {
    expect(equationOfTime(new Date(Date.UTC(2026, 1, 12, 12)))).toBeLessThan(-13);
  });

  it("is strongly positive in early November", () => {
    expect(equationOfTime(new Date(Date.UTC(2026, 10, 3, 12)))).toBeGreaterThan(15);
  });
});

describe("longitudeFromUtcOffset", () => {
  it("maps UTC to 0 and UTC+2 to 30°E", () => {
    expect(longitudeFromUtcOffset(0)).toBe(0);
    expect(longitudeFromUtcOffset(-120)).toBe(30);
    expect(longitudeFromUtcOffset(300)).toBe(-75); // UTC−5
  });
});

describe("solarPhase", () => {
  it("is ~0.5 at Greenwich noon UTC", () => {
    const phase = solarPhase(new Date(Date.UTC(2026, 8, 1, 12)), 0);
    expect(Math.abs(phase - 0.5)).toBeLessThan(0.012); // within EoT
  });

  it("advances 0.25 per 6 hours", () => {
    const d1 = new Date(Date.UTC(2026, 8, 1, 6));
    const d2 = new Date(Date.UTC(2026, 8, 1, 12));
    const delta = solarPhase(d2, 0) - solarPhase(d1, 0);
    expect(delta).toBeCloseTo(0.25, 3);
  });

  it("shifts with longitude: noon UTC is evening at 90°E", () => {
    const date = new Date(Date.UTC(2026, 8, 1, 12));
    const phase = solarPhase(date, 90);
    expect(Math.abs(phase - 0.75)).toBeLessThan(0.012);
  });

  it("agrees with the subsolar point: phase is 0.5 where the sun is overhead", () => {
    const date = new Date(Date.UTC(2026, 3, 10, 3, 17));
    const { lon } = subsolarPoint(date);
    expect(Math.abs(solarPhase(date, lon) - 0.5)).toBeLessThan(0.001);
  });
});
