# Architecture

## Stack

- Next.js (App Router, TypeScript strict), deployed on Vercel
- three.js via react-three-fiber + drei for the hero globe
- Design tokens as CSS custom properties; Tailwind is allowed, but tokens are the source of truth
- No backend, no database, no API keys, no geolocation permission — everything is client-side or
  statically built

## Solar time

- Timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`; never a geolocation prompt
- Subsolar point via `suncalc` or a small solar-position routine
- Outputs: sun direction vector (shader uniform) and normalized solar phase 0–1 (palette driver)

## Hero globe

- Textures self-hosted in `/public`, never fetched from NASA GIBS at runtime
  - Day: NASA Blue Marble Next Generation, downsampled to 4096×2048
  - Night: NASA Black Marble city lights
  - Compressed to KTX2/Basis (webp fallback); 1k versions load first, 4k swaps in when ready
- Custom shader blends day/night across the terminator using the sun-direction uniform
- Performance budget: 60 fps on mid-range mobile; hero payload < 3 MB
- Fallbacks: `prefers-reduced-motion` and no-WebGL get a pre-rendered static hero image with the
  same palette treatment

## Data-compactness principles (later phases)

- All species/ecoregion content is precomputed at build time into static per-ecoregion JSON,
  loaded on demand — no runtime aggregation.
- Vector geodata (ecoregions, glaciers) ships as PMTiles built with tippecanoe: single-file
  archives served over HTTP range requests, no tile server needed on Vercel.
- Images via `next/image`; 3D textures via KTX2.
