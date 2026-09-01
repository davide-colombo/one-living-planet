/**
 * Pre-renders the static hero globe (no-WebGL / reduced-motion
 * fallback) as an orthographic projection of the day/night textures
 * with the same terminator + rim treatment as the WebGL shader.
 *
 * Usage: node scripts/render-static-hero.mjs
 * Reads public/textures/earth-{day-4k,night-2k}.webp, writes
 * public/textures/hero-static.webp (RGBA).
 */
import sharp from "sharp";
import path from "node:path";

const SIZE = 1200;
const CENTER_LON = 10; // Europe/Africa facing the viewer
const SUN = normalize([0.85, 0.18, -0.45]); // low sun from the right
const RIM = [0.94, 0.62, 0.45]; // dusk rim, sRGB

function normalize(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const texDir = path.join(process.cwd(), "public", "textures");
const load = (name) => sharp(path.join(texDir, name)).raw().toBuffer({ resolveWithObject: true });

const month = new Date().getMonth();
const season =
  month >= 2 && month <= 4
    ? "mar"
    : month >= 5 && month <= 7
      ? "jun"
      : month >= 8 && month <= 10
        ? "sep"
        : "dec";
const [day, night] = await Promise.all([
  load(`earth-day-${season}-4k.webp`),
  load("earth-night-2k.webp"),
]);

function sample({ data, info }, lat, lon) {
  const u = ((lon / (2 * Math.PI) + 0.5) % 1) * (info.width - 1);
  const v = (0.5 - lat / Math.PI) * (info.height - 1);
  const i = (Math.round(v) * info.width + Math.round(u)) * info.channels;
  return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
}

const out = Buffer.alloc(SIZE * SIZE * 4);
const radius = SIZE * 0.485;
const lonOffset = (CENTER_LON * Math.PI) / 180;

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const nx = (px - SIZE / 2) / radius;
    const ny = -(py - SIZE / 2) / radius;
    const d = Math.hypot(nx, ny);
    const o = (py * SIZE + px) * 4;
    if (d > 1.002) continue; // transparent space

    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)));
    const lat = Math.asin(Math.min(1, Math.max(-1, ny)));
    const lon = Math.atan2(nx, nz) + lonOffset;

    const dayC = sample(day, lat, lon);
    const nightC = sample(night, lat, lon);

    const cosSun = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
    const dayness = smoothstep(-0.12, 0.18, cosSun);
    const twilight = smoothstep(-0.12, 0.05, cosSun) * (1 - smoothstep(0.05, 0.35, cosSun));
    const fresnel = Math.pow(1 - Math.min(1, nz), 3);
    const rimLit = 0.35 + 0.65 * smoothstep(-0.3, 0.5, cosSun);

    for (let c = 0; c < 3; c++) {
      const nightSide = nightC[c] * [1.0, 0.88, 0.72][c] * 1.7 + dayC[c] * 0.015;
      const daySide = dayC[c] * (0.18 + 0.95 * Math.max(0, cosSun));
      let v = nightSide + (daySide - nightSide) * dayness;
      v += RIM[c] * twilight * 0.12;
      v += RIM[c] * fresnel * rimLit * 0.55;
      out[o + c] = Math.min(255, Math.round(v * 255));
    }
    out[o + 3] = Math.round(255 * smoothstep(1.002, 0.998, d)); // AA edge
  }
}

const file = path.join(texDir, "hero-static.webp");
const info = await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .webp({ quality: 82 })
  .toFile(file);
console.log(`hero-static.webp: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
