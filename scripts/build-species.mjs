/**
 * Species backbone: GBIF occurrences → the explorer's own species files.
 *
 * Usage: node scripts/build-species.mjs <ecoregions.ndjson> <id> [id...]
 *
 * For each ecoregion, asks GBIF which species have been photographed
 * inside its (simplified) borders, keeping only CC0 / CC-BY records so
 * every photo is commercially safe, and balancing across taxon groups
 * so a region is not summarized as twelve pigeons. Writes one
 * public/data/species/<id>.json per region in the app's internal
 * schema (lib/species.ts) — the browser never sees GBIF's format.
 *
 * GBIF is itself the aggregator of ~2000 datasets (iNaturalist, eBird,
 * museum collections), so one adapter buys most of the open record.
 */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import * as turf from "@turf/turf";

const [ndjsonPath, ...idArgs] = process.argv.slice(2);
if (!ndjsonPath || idArgs.length === 0) {
  console.error("usage: node scripts/build-species.mjs <ecoregions.ndjson> <id> [id...]");
  process.exit(1);
}
const wanted = new Set(idArgs.map(Number));

const API = "https://api.gbif.org/v1";
const LICENSES = ["CC0_1_0", "CC_BY_4_0"];

/** taxon groups queried separately, in display order */
const GROUPS = [
  { group: "mammals", param: "classKey", key: 359 },
  { group: "birds", param: "classKey", key: 212 },
  { group: "reptiles", param: "classKey", key: 358 },
  { group: "amphibians", param: "classKey", key: 131 },
  { group: "plants", param: "kingdomKey", key: 6 },
  { group: "insects", param: "classKey", key: 216 },
];
const PER_GROUP = 2;
const MAX_SPECIES = 12;

/** an atlas of the wild has no room for the farmyard */
const DOMESTIC = new Set([
  "Homo sapiens",
  "Felis catus",
  "Canis familiaris",
  "Bos taurus",
  "Ovis aries",
  "Capra hircus",
  "Equus caballus",
  "Equus asinus",
  "Gallus gallus",
  "Sus domesticus",
]);

/* ---------- geometry → a WKT small enough for a query URL ---------- */

const ringArea = (ring) => {
  // shoelace; positive = counter-clockwise, which GBIF requires
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
};

const ringsToWkt = (rings) => {
  const parts = rings.map((ring) => {
    const ccw = ringArea(ring) < 0 ? [...ring].reverse() : ring; // GBIF wants counter-clockwise
    return ccw.map(([lon, lat]) => `${lon} ${lat}`).join(",");
  });
  return parts.length === 1
    ? `POLYGON((${parts[0]}))`
    : `MULTIPOLYGON(${parts.map((s) => `((${s}))`).join(",")})`;
};

/**
 * WKT candidates for a region, best first. Simplification can fold a
 * coastline over itself and GBIF rejects self-intersections, so the
 * coordinates are quantized FIRST and unkink then splits anything
 * invalid into clean polygons; the largest survivors speak for the
 * region. Thin coastal slivers can defeat all of that, so the last
 * candidate is the convex hull: coarse, but always valid.
 */
function regionWktCandidates(geometry) {
  const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  const outer = polys
    .map((p) => [p[0]])
    .map((rings) => ({ rings, size: Math.abs(ringArea(rings[0])) }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 4)
    .map((r) => r.rings);

  const candidates = [];
  for (let tolerance = 0.02; tolerance < 3; tolerance *= 1.8) {
    try {
      const simplified = turf.simplify(turf.multiPolygon(outer), { tolerance, mutate: false });
      turf.truncate(simplified, { precision: 2, mutate: true });
      const rings = turf
        .unkinkPolygon(turf.cleanCoords(simplified))
        .features.map((f) => ({ ring: f.geometry.coordinates[0], size: turf.area(f) }))
        .filter((r) => r.ring.length >= 4)
        .sort((a, b) => b.size - a.size)
        .slice(0, 4)
        .map((r) => r.ring);
      if (rings.length === 0) continue;
      const wkt = ringsToWkt(rings);
      if (wkt.length < 1500 && !candidates.includes(wkt)) candidates.push(wkt);
    } catch {
      continue;
    }
  }
  try {
    const hull = turf.truncate(turf.convex(turf.multiPolygon(outer)), { precision: 2 });
    candidates.push(ringsToWkt([hull.geometry.coordinates[0]]));
  } catch {
    // no hull for degenerate geometry; live with what we have
  }
  return candidates;
}

/** cheapest possible query, just to hear whether GBIF accepts the shape */
async function wktAccepted(wkt) {
  try {
    await gbif("/occurrence/search", [
      ["geometry", wkt],
      ["limit", "0"],
    ]);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ GBIF ------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gbif(pathname, params) {
  const url = new URL(API + pathname);
  for (const [k, v] of params) url.searchParams.append(k, v);
  for (let attempt = 0; ; attempt++) {
    await sleep(250);
    const res = await fetch(url, { headers: { "User-Agent": "earth-explorer build" } });
    if (res.ok) return res.json();
    if (attempt >= 2) throw new Error(`GBIF ${res.status} for ${url}`);
    await sleep(1500 * (attempt + 1));
  }
}

const occurrenceParams = (wkt) => [
  ["geometry", wkt],
  ...LICENSES.map((l) => ["license", l]),
  ["hasCoordinate", "true"],
  ["mediaType", "StillImage"],
];

function normalizeLicense(text) {
  const t = (text ?? "").toLowerCase();
  if (t.includes("zero") || t.includes("publicdomain") || t === "cc0_1_0") return "CC0";
  if (t.includes("/by/") || t.includes("by 4") || t === "cc_by_4_0") return "CC BY";
  return null;
}

/**
 * Hosts that serve plain images fast and do not mind being hotlinked,
 * verified in a real browser. Museum media servers routinely pass a
 * content-type check yet hang or block in the page, so anything not
 * listed here is skipped and the species falls back to its next photo
 * or drops out — honest missingness over broken chips.
 */
const TRUSTED_PHOTO_HOSTS = /inaturalist|wikimedia|jacq\.org/;

/** thumbnail-sized variant where the host offers one */
const thumbUrl = (url) =>
  /inaturalist/.test(url) ? url.replace(/\/original\.(jpe?g|png)/i, "/medium.$1") : url;

/** museum media endpoints sometimes answer with HTML; only real images pass */
async function imageOk(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-0", "User-Agent": "earth-explorer build" },
      signal: AbortSignal.timeout(8000),
    });
    const type = res.headers.get("content-type") ?? "";
    await res.body?.cancel();
    return (res.ok || res.status === 206) && type.startsWith("image/");
  } catch {
    return false;
  }
}

/** GBIF's key for iNaturalist research-grade observations */
const INAT_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";

/* --------------------------- PhyloPic ---------------------------- */

async function phylopic(url) {
  await sleep(150);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "earth-explorer build" },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? { json: await res.json(), url: res.url } : null;
  } catch {
    return null;
  }
}

/**
 * Silhouettes are mirrored into public/silhouettes/ and served from
 * our own origin: CSS masks demand CORS-clean fetches and third-party
 * CDNs fail them unpredictably, and the app should depend on no one
 * at runtime anyway. Files are named by PhyloPic image id, so shapes
 * shared between relatives dedupe naturally.
 */
const silhouetteDir = path.join(process.cwd(), "public", "silhouettes");
await mkdir(silhouetteDir, { recursive: true });

async function localizeSilhouette(rasterHref) {
  const uuid = rasterHref.match(/images\/([0-9a-f-]{36})\/raster/)?.[1];
  if (!uuid) return null;
  const dest = path.join(silhouetteDir, `${uuid}.png`);
  if (!existsSync(dest)) {
    try {
      const res = await fetch(rasterHref, {
        headers: { "User-Agent": "earth-explorer build" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    } catch {
      return null;
    }
  }
  return `/silhouettes/${uuid}.png`;
}

/**
 * A flat silhouette for the species from PhyloPic, walking up the tree
 * to the nearest drawn relative when the species itself has none, and
 * past any image whose license is not commercially safe. `exact` says
 * whether the shape belongs to this very species.
 */
async function findSilhouette(speciesKey, detail) {
  const entries = [
    { key: speciesKey, own: true },
    { key: detail.genusKey, own: false },
    { key: detail.familyKey, own: false },
  ].filter((e) => e.key);
  for (const { key, own } of entries) {
    // the resolve endpoint redirects straight to the node
    const resolved = await phylopic(`https://api.phylopic.org/resolve/gbif.org/species/${key}`);
    if (!resolved) continue;
    let url = `${resolved.url}&embed_primaryImage=true`;
    for (let depth = 0; depth < 12 && url; depth++) {
      const node = await phylopic(url);
      if (!node) break;
      const img = node.json._embedded?.primaryImage;
      if (img) {
        const license = normalizeLicense(img._links?.license?.href);
        const rasters = img._links?.rasterFiles ?? [];
        const raster = rasters[rasters.length - 1]; // smallest listed last
        if (license && raster?.href) {
          const localUrl = await localizeSilhouette(raster.href);
          if (localUrl) {
            return {
              url: localUrl,
              credit: img._links?.contributor?.title ?? "PhyloPic",
              license,
              exact: own && depth === 0,
            };
          }
        }
        // uncredited-commercially or rasterless: climb past it
      }
      const parent = node.json._links?.parent?.href;
      url = parent ? `https://api.phylopic.org${parent}&embed_primaryImage=true` : null;
    }
  }
  return null;
}

/**
 * A photo of the species, best provenance first: an individual
 * photographed inside the ecoregion (iNaturalist, then any trusted
 * host), and as a last resort the same species observed elsewhere —
 * a remote region's voles are better shown from afar than dropped.
 */
async function findPhoto(wkt, speciesKey) {
  const attempts = [
    { params: [...occurrenceParams(wkt), ["datasetKey", INAT_DATASET]], local: true },
    { params: occurrenceParams(wkt), local: true },
    {
      params: [
        ...LICENSES.map((l) => ["license", l]),
        ["mediaType", "StillImage"],
        ["datasetKey", INAT_DATASET],
      ],
      local: false,
    },
  ];
  for (const { params, local } of attempts) {
    const occ = await gbif("/occurrence/search", [
      ...params,
      ["speciesKey", String(speciesKey)],
      ["limit", "8"],
    ]);
    for (const record of (occ.results ?? []).slice(0, 5)) {
      const media = (record.media ?? []).find(
        (m) => m.identifier && TRUSTED_PHOTO_HOSTS.test(m.identifier),
      );
      if (!media) continue;
      const license = normalizeLicense(media.license) ?? normalizeLicense(record.license);
      if (!license) continue;
      const photo = {
        url: thumbUrl(media.identifier),
        credit: media.rightsHolder ?? media.creator ?? record.recordedBy ?? "unknown",
        license,
        local,
      };
      if (await imageOk(photo.url)) return photo;
    }
  }
  return null;
}

async function speciesForGroup(wkt, { group, param, key }) {
  const data = await gbif("/occurrence/search", [
    ...occurrenceParams(wkt),
    [param, String(key)],
    ["facet", "speciesKey"],
    ["facetLimit", "6"],
    ["limit", "0"],
  ]);
  const counts = data.facets?.[0]?.counts ?? [];
  return counts.slice(0, PER_GROUP).map((c) => ({
    speciesKey: Number(c.name),
    observations: c.count,
    group,
  }));
}

async function describeSpecies(wkt, { speciesKey, observations, group }) {
  const detail = await gbif(`/species/${speciesKey}`, []);
  if (DOMESTIC.has(detail.canonicalName)) return null;
  // English names come from many checklists, complete with mislabeled
  // languages and bird-banding codes; the name most checklists agree
  // on is the trustworthy one.
  const vern = await gbif(`/species/${speciesKey}/vernacularNames`, [["limit", "100"]]);
  const tally = new Map();
  for (const v of vern.results ?? []) {
    if (v.language !== "eng") continue;
    const name = (v.vernacularName ?? "").split(",")[0].trim();
    if (!name || name.length > 40) continue;
    if (/^[A-Z]{3,6}$/.test(name)) continue; // banding codes posing as names
    const entry = tally.get(name.toLowerCase()) ?? { name, count: 0, preferred: false };
    entry.count += 1;
    entry.preferred ||= Boolean(v.preferred);
    tally.set(name.toLowerCase(), entry);
  }
  const common =
    [...tally.values()].sort(
      (a, b) => Number(b.preferred) - Number(a.preferred) || b.count - a.count,
    )[0]?.name ?? null;
  const photo = await findPhoto(wkt, speciesKey);
  if (!photo) return null;
  const silhouette = await findSilhouette(speciesKey, detail);
  return {
    id: `gbif:${speciesKey}`,
    sci: detail.canonicalName ?? detail.scientificName,
    common,
    group,
    observations,
    photo,
    silhouette,
  };
}

/* ------------------------------ main ------------------------------ */

const outDir = path.join(process.cwd(), "public", "data", "species");
await mkdir(outDir, { recursive: true });

const regions = new Map();
const reader = createInterface({ input: createReadStream(ndjsonPath) });
for await (const line of reader) {
  if (!line.trim()) continue;
  const feature = JSON.parse(line);
  if (wanted.has(feature.properties.id)) {
    regions.set(feature.properties.id, feature);
  }
}
const missing = [...wanted].filter((id) => !regions.has(id));
if (missing.length) console.warn(`not in ${ndjsonPath}: ${missing.join(", ")}`);

let failed = 0;
for (const [id, feature] of regions) {
  const name = feature.properties.name;
  try {
    const candidates = regionWktCandidates(feature.geometry);
    let wkt = null;
    for (const candidate of candidates) {
      if (await wktAccepted(candidate)) {
        wkt = candidate;
        break;
      }
    }
    if (!wkt) {
      console.warn(`${id} ${name}: no usable geometry, skipped`);
      failed++;
      continue;
    }
    const isHull = wkt === candidates[candidates.length - 1] && candidates.length > 1;
    process.stdout.write(`${id} ${name} (wkt ${wkt.length} chars${isHull ? ", hull" : ""})`);

    const picks = [];
    for (const groupSpec of GROUPS) {
      for (const pick of await speciesForGroup(wkt, groupSpec)) picks.push(pick);
    }
    const species = [];
    for (const pick of picks) {
      if (species.length >= MAX_SPECIES) break;
      const described = await describeSpecies(wkt, pick);
      if (described) species.push(described);
    }

    const file = { version: 1, ecoregionId: id, species };
    await writeFile(path.join(outDir, `${id}.json`), JSON.stringify(file));
    console.log(` → ${species.length} species`);
  } catch (err) {
    console.warn(`\n${id} ${name}: ${err.message ?? err}`);
    failed++;
  }
}
console.log(failed ? `done, ${failed} region(s) failed` : "done");
