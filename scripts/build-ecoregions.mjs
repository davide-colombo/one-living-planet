/**
 * Ecoregion backbone: RESOLVE Ecoregions 2017 (CC-BY) → static assets.
 *
 * Usage: node scripts/build-ecoregions.mjs <dir with Ecoregions2017.shp/.dbf>
 *
 * Outputs:
 *  - public/data/ecoregions-index.json  — one entry per ecoregion
 *    (id, name, biome, realm, protection outlook, color, bbox),
 *    loaded by the explorer up front (~100 KB gzipped)
 *  - <source-dir>/ecoregions.ndjson     — full geometry, one feature
 *    per line, minimal attributes; feed for tippecanoe → PMTiles
 *
 * Then: tippecanoe -o public/data/ecoregions.pmtiles \
 *         -Z0 -z7 -D10 --coalesce-densest-as-needed \
 *         --extend-zooms-if-still-dropping --detect-shared-borders \
 *         -l ecoregions <source-dir>/ecoregions.ndjson
 *
 * -D10 snaps below-max zooms to a 1024 grid (sub-pixel on screen) and
 * roughly thirds the world-view tiles, where zoom lag lived; leave the
 * max zoom at full detail.
 */
import * as shapefile from "shapefile";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("usage: node scripts/build-ecoregions.mjs <source-dir>");
  process.exit(1);
}

const outDataDir = path.join(process.cwd(), "public", "data");
await mkdir(outDataDir, { recursive: true });

function extendBbox(bbox, coords) {
  if (typeof coords[0] === "number") {
    if (coords[0] < bbox[0]) bbox[0] = coords[0];
    if (coords[1] < bbox[1]) bbox[1] = coords[1];
    if (coords[0] > bbox[2]) bbox[2] = coords[0];
    if (coords[1] > bbox[3]) bbox[3] = coords[1];
    return;
  }
  for (const c of coords) extendBbox(bbox, c);
}

const round = (v) => Math.round(v * 100) / 100;

const source = await shapefile.open(
  path.join(srcDir, "Ecoregions2017.shp"),
  path.join(srcDir, "Ecoregions2017.dbf"),
);

const index = [];
const ndjsonPath = path.join(srcDir, "ecoregions.ndjson");
const ndjson = createWriteStream(ndjsonPath);
let count = 0;

for (;;) {
  const { done, value } = await source.read();
  if (done) break;
  const p = value.properties;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  if (value.geometry) extendBbox(bbox, value.geometry.coordinates);

  index.push({
    id: p.ECO_ID,
    name: p.ECO_NAME,
    biomeNum: p.BIOME_NUM,
    biome: p.BIOME_NAME,
    realm: p.REALM,
    nnh: p.NNH_NAME, // Nature Needs Half protection outlook
    color: p.COLOR,
    bbox: bbox.map(round),
  });

  ndjson.write(
    JSON.stringify({
      type: "Feature",
      properties: {
        id: p.ECO_ID,
        name: p.ECO_NAME,
        biomeNum: p.BIOME_NUM,
        color: p.COLOR,
      },
      geometry: value.geometry,
    }) + "\n",
  );
  count++;
  if (count % 100 === 0) console.log(`  ${count} features...`);
}

await new Promise((resolve) => ndjson.end(resolve));
index.sort((a, b) => a.id - b.id);
await writeFile(path.join(outDataDir, "ecoregions-index.json"), JSON.stringify(index));
console.log(`${count} ecoregions → ecoregions-index.json + ${ndjsonPath}`);
