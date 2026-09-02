/**
 * Biome palette for the ecoregion explorer.
 *
 * Colors are chosen so the map reads like the world it shows: sand
 * deserts, greens that deepen with rainfall and drift toward blue as
 * the climate cools, golds for grasslands. RESOLVE's
 * own COLOR attribute (still in the tiles) is a cartographic palette
 * with no such reading, so the style ignores it.
 *
 * Each biome gets two shades; an ecoregion sits at a fixed point
 * between them, picked from its id, so neighboring ecoregions of one
 * biome stay tellable apart without turning into confetti.
 */

/** RESOLVE biome number → [deep shade, light shade]. */
export const BIOME_SHADES: Record<number, [string, string]> = {
  /* 1 · Tropical & Subtropical Moist Broadleaf Forests */
  1: ["#1e6e3c", "#2f8a4e"],
  /* 2 · Tropical & Subtropical Dry Broadleaf Forests */
  2: ["#7c9440", "#94ab52"],
  /* 3 · Tropical & Subtropical Coniferous Forests */
  3: ["#2c7a58", "#3d926c"],
  /* 4 · Temperate Broadleaf & Mixed Forests */
  4: ["#4d9152", "#63a967"],
  /* 5 · Temperate Conifer Forests */
  5: ["#2a6349", "#38795b"],
  /* 6 · Boreal Forests / Taiga */
  6: ["#3f7168", "#52867c"],
  /* 7 · Tropical & Subtropical Grasslands, Savannas & Shrublands */
  7: ["#c29e4e", "#d4b364"],
  /* 8 · Temperate Grasslands, Savannas & Shrublands */
  8: ["#c8b876", "#d9cb8d"],
  /* 9 · Flooded Grasslands & Savannas */
  9: ["#4f9a84", "#63ad97"],
  /* 10 · Montane Grasslands & Shrublands */
  10: ["#84936f", "#97a583"],
  /* 11 · Tundra */
  11: ["#a9b8ba", "#bcc9cb"],
  /* 12 · Mediterranean Forests, Woodlands & Scrub */
  12: ["#9a9a52", "#adad66"],
  /* 13 · Deserts & Xeric Shrublands */
  13: ["#cfb188", "#e0c49c"],
  /* 14 · Mangroves */
  14: ["#25998a", "#33ad9d"],
};

/** RESOLVE biome number → display name, for the legend. */
export const BIOME_NAMES: Record<number, string> = {
  1: "Tropical & Subtropical Moist Broadleaf Forests",
  2: "Tropical & Subtropical Dry Broadleaf Forests",
  3: "Tropical & Subtropical Coniferous Forests",
  4: "Temperate Broadleaf & Mixed Forests",
  5: "Temperate Conifer Forests",
  6: "Boreal Forests / Taiga",
  7: "Tropical & Subtropical Grasslands, Savannas & Shrublands",
  8: "Temperate Grasslands, Savannas & Shrublands",
  9: "Flooded Grasslands & Savannas",
  10: "Montane Grasslands & Shrublands",
  11: "Tundra",
  12: "Mediterranean Forests, Woodlands & Scrub",
  13: "Deserts & Xeric Shrublands",
  14: "Mangroves",
};

/**
 * The one ecoregion outside every biome: id 0, "Rock and Ice". It has
 * no biome, realm, or protection data behind it, so it wears a flat
 * dark grey that reads as "no data here" and stays inert on the map.
 */
export const ROCK_AND_ICE_ID = 0;
export const ROCK_AND_ICE_COLOR = "#3f464e";

const FALLBACK_COLOR = "#8a8a8a";

/** How many distinct shade steps a biome spreads across. */
const VARIANTS = 6;

function channel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

/** Linear sRGB-hex mix, matching MapLibre's default color interpolation. */
export function mixHex(a: string, b: string, t: number): string {
  const c = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** One representative color per biome, for legend swatches. */
export function biomeColor(biomeNum: number): string {
  const shades = BIOME_SHADES[biomeNum];
  if (!shades) return FALLBACK_COLOR;
  return mixHex(shades[0], shades[1], 0.5);
}

/** Fill color of one ecoregion — the same mapping the map style uses. */
export function ecoregionColor(biomeNum: number, id: number): string {
  if (id === ROCK_AND_ICE_ID) return ROCK_AND_ICE_COLOR;
  const shades = BIOME_SHADES[biomeNum];
  if (!shades) return FALLBACK_COLOR;
  return mixHex(shades[0], shades[1], (id % VARIANTS) / (VARIANTS - 1));
}

/**
 * The same mapping as a MapLibre style expression, so every feature in
 * the tiles is colored without a rebuild (tiles carry id + biomeNum).
 */
export function ecoregionColorExpression(): unknown[] {
  const match: unknown[] = ["match", ["get", "biomeNum"]];
  for (const [num, [deep, light]] of Object.entries(BIOME_SHADES)) {
    match.push(Number(num), [
      "interpolate",
      ["linear"],
      ["%", ["get", "id"], VARIANTS],
      0,
      deep,
      VARIANTS - 1,
      light,
    ]);
  }
  match.push(FALLBACK_COLOR);
  return ["case", ["==", ["get", "id"], ROCK_AND_ICE_ID], ROCK_AND_ICE_COLOR, match];
}
