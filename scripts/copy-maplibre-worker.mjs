/**
 * MapLibre spawns a module worker that Next/Turbopack cannot resolve
 * from node_modules. Copy the worker and its shared chunk into
 * /public so the page can point MapLibre at them (setWorkerUrl).
 *
 * Usage: node scripts/copy-maplibre-worker.mjs   (run after upgrading maplibre-gl)
 */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const dst = path.join(process.cwd(), "public", "maplibre");
await mkdir(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.join(src, f), path.join(dst, f));
  console.log(`copied ${f}`);
}
