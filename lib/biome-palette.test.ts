import { describe, expect, it } from "vitest";
import {
  BIOME_NAMES,
  BIOME_SHADES,
  ROCK_AND_ICE_COLOR,
  ROCK_AND_ICE_ID,
  biomeColor,
  ecoregionColor,
  ecoregionColorExpression,
  mixHex,
} from "./biome-palette";

const HEX = /^#[0-9a-f]{6}$/;

describe("mixHex", () => {
  it("returns endpoints at t=0 and t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("mixes per channel", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#00ff00", 0.5)).toBe("#808000");
  });
});

describe("ecoregionColor", () => {
  it("covers every RESOLVE biome with a valid color", () => {
    for (let biome = 1; biome <= 14; biome++) {
      expect(BIOME_SHADES[biome], `biome ${biome}`).toBeDefined();
      expect(ecoregionColor(biome, 100)).toMatch(HEX);
    }
  });

  it("gives Rock and Ice the no-data grey, whatever its biome number", () => {
    expect(ecoregionColor(11, ROCK_AND_ICE_ID)).toBe(ROCK_AND_ICE_COLOR);
  });

  it("varies shade within one biome by ecoregion id", () => {
    const shades = new Set(
      Array.from({ length: 6 }, (_, i) => ecoregionColor(13, 100 + i)),
    );
    expect(shades.size).toBeGreaterThan(1);
  });

  it("stays inside the biome's two shades", () => {
    expect(ecoregionColor(13, 102)).not.toBe(ecoregionColor(1, 102));
  });

  it("falls back for an unknown biome", () => {
    expect(ecoregionColor(99, 5)).toMatch(HEX);
  });
});

describe("biome legend", () => {
  it("names exactly the biomes that have shades", () => {
    expect(Object.keys(BIOME_NAMES).sort()).toEqual(Object.keys(BIOME_SHADES).sort());
  });

  it("gives every biome a valid swatch color, with a fallback", () => {
    for (const num of Object.keys(BIOME_NAMES)) expect(biomeColor(Number(num))).toMatch(HEX);
    expect(biomeColor(99)).toMatch(HEX);
  });
});

describe("ecoregionColorExpression", () => {
  it("special-cases Rock and Ice, then matches on biomeNum", () => {
    const expr = ecoregionColorExpression();
    expect(expr[0]).toBe("case");
    expect(expr[2]).toBe(ROCK_AND_ICE_COLOR);
    const match = expr[3] as unknown[];
    expect(match[0]).toBe("match");
    // 14 biomes × (label + output) + operator + input + fallback
    expect(match.length).toBe(2 + 14 * 2 + 1);
  });
});
