/**
 * The explorer's own species representation. Everything the app knows
 * about who lives in an ecoregion is this shape and nothing else: the
 * build adapters (scripts/build-species.mjs) translate external
 * sources into it, so no external schema ever reaches the browser and
 * a source can be added or swapped without touching the app.
 */

/** In display order: the charismatic before the crawling. */
export const SPECIES_GROUPS = [
  "mammals",
  "birds",
  "reptiles",
  "amphibians",
  "plants",
  "insects",
] as const;

export type SpeciesGroup = (typeof SPECIES_GROUPS)[number];

export interface SpeciesPhoto {
  /** direct image URL, thumbnail-sized */
  url: string;
  /** photographer or rights holder, shown as the credit */
  credit: string;
  license: "CC0" | "CC BY";
  /** photographed inside this ecoregion; false = same species, observed elsewhere */
  local: boolean;
}

export interface SpeciesSilhouette {
  /** PNG with transparency; tintable by using it as a CSS mask */
  url: string;
  /** the silhouette's contributor, credited when the license asks */
  credit: string;
  license: "CC0" | "CC BY";
  /** drawn from this very species; false = a close relative's shape */
  exact: boolean;
}

export interface RegionSpecies {
  /** source-namespaced stable id, e.g. "gbif:2481660" */
  id: string;
  /** scientific name */
  sci: string;
  /** English vernacular name, when one exists */
  common: string | null;
  group: SpeciesGroup;
  /** licensed observations inside the ecoregion, a commonness proxy */
  observations: number;
  photo: SpeciesPhoto;
  silhouette: SpeciesSilhouette | null;
}

export interface RegionSpeciesFile {
  version: 1;
  ecoregionId: number;
  species: RegionSpecies[];
}
