/**
 * Texture pipeline: NASA source imagery → self-hosted hero textures.
 *
 * Usage: node scripts/prepare-textures.mjs <blue_marble.jpg> <black_marble.jpg>
 *
 * Sources (public domain, NASA Visible Earth):
 *  - Blue Marble Next Generation (world.topo.bathy, 5400×2700)
 *  - Earth at Night 2012 / Black Marble (dnb_land_ocean_ice, 3600×1800)
 *
 * Outputs WebP into public/textures/: 1k versions load first, the
 * larger ones swap in when ready. KTX2/Basis variants are a follow-up
 * (needs toktx; see docs/architecture.md).
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [day, night] = process.argv.slice(2);
if (!day || !night) {
  console.error("usage: node scripts/prepare-textures.mjs <blue_marble.jpg> <black_marble.jpg>");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "textures");
await mkdir(outDir, { recursive: true });

const jobs = [
  { src: day, out: "earth-day-4k.webp", width: 4096, quality: 70 },
  { src: day, out: "earth-day-1k.webp", width: 1024, quality: 70 },
  { src: night, out: "earth-night-2k.webp", width: 2048, quality: 70 },
  { src: night, out: "earth-night-1k.webp", width: 1024, quality: 70 },
];

for (const { src, out, width, quality } of jobs) {
  const file = path.join(outDir, out);
  const info = await sharp(src)
    .resize(width, width / 2, { fit: "fill", kernel: "lanczos3" })
    .webp({ quality, effort: 6 })
    .toFile(file);
  console.log(`${out}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
}
