/**
 * Texture pipeline: NASA source imagery → self-hosted hero textures.
 *
 * Usage: node scripts/prepare-textures.mjs <source-dir>
 *
 * Expects in <source-dir> (all public domain, NASA Visible Earth):
 *  - bm_200403.jpg, bm_200406.jpg, bm_200409.jpg, bm_200412.jpg
 *    (Blue Marble Next Generation w/ topography+bathymetry, 21600x10800)
 *  - blackmarble2016.jpg (Black Marble 2016, 13500x6750)
 *
 * Outputs WebP into public/textures/:
 *  - earth-day-{mar,jun,sep,dec}-{1k,4k,8k}.webp  (season picked at runtime by month)
 *  - earth-night-{1k,2k,4k}.webp
 * The 1k versions load first; larger ones swap in progressively, 8k/4k-night
 * only on capable screens. KTX2/Basis variants remain a follow-up (needs toktx).
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("usage: node scripts/prepare-textures.mjs <source-dir>");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "textures");
await mkdir(outDir, { recursive: true });

const SEASONS = [
  { key: "mar", src: "bm_200403.jpg" },
  { key: "jun", src: "bm_200406.jpg" },
  { key: "sep", src: "bm_200409.jpg" },
  { key: "dec", src: "bm_200412.jpg" },
];

const DAY_LEVELS = [
  { suffix: "1k", width: 1024, quality: 70 },
  { suffix: "4k", width: 4096, quality: 70 },
  { suffix: "8k", width: 8192, quality: 58 },
];

const NIGHT_LEVELS = [
  { suffix: "1k", width: 1024, quality: 70 },
  { suffix: "2k", width: 2048, quality: 70 },
  { suffix: "4k", width: 4096, quality: 62 },
];

async function convert(src, out, width, quality) {
  const info = await sharp(path.join(srcDir, src), { limitInputPixels: 300e6 })
    .resize(width, width / 2, { fit: "fill", kernel: "lanczos3" })
    .webp({ quality, effort: 6 })
    .toFile(path.join(outDir, out));
  console.log(`${out}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
}

for (const { key, src } of SEASONS) {
  for (const { suffix, width, quality } of DAY_LEVELS) {
    await convert(src, `earth-day-${key}-${suffix}.webp`, width, quality);
  }
}

for (const { suffix, width, quality } of NIGHT_LEVELS) {
  await convert("blackmarble2016.jpg", `earth-night-${suffix}.webp`, width, quality);
}
