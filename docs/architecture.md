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
  - Day: NASA Blue Marble Next Generation (21600×10800 sources), four seasonal variants
    (Mar/Jun/Sep/Dec) picked by the visitor's current month; 1k → 4k → 8k progressive chain,
    8k only where the GPU reports maxTextureSize ≥ 8192 and the screen is large enough
  - Night: NASA Black Marble 2016 city lights, 1k → 2k → 4k with the same gating
  - WebP today; KTX2/Basis remains a follow-up (needs toktx)
- Custom shader blends day/night across the terminator using the sun-direction uniform
- Performance budget: 60 fps on mid-range mobile; hero payload < 3 MB
  (current: ~403 KB gz JS incl. deferred three.js chunk; textures 56 KB up front, ~460 KB at 4k, ~1.8 MB ceiling with 8k day + 4k night on capable screens)
- Fallbacks: `prefers-reduced-motion` and no-WebGL get a pre-rendered static hero image with the
  same palette treatment (`scripts/render-static-hero.mjs`)
- Texture pipeline: `scripts/prepare-textures.mjs` (sharp → WebP). KTX2/Basis variants are a
  follow-up — requires `toktx` (KTX-Software), not installed on the build machine yet; WebP is
  the mandated fallback and currently the only shipped format
- Dev-only time travel on the landing page: `?t=<solar hour 0–24>` shifts palette and sun
  together (stripped in production builds)
- Scroll choreography: one `SystemRig` transform carries the whole journey — limb close-up →
  whole Earth (P1), a held beat for prose (HOLD), then a logarithmic zoom-out from Earth's
  viewpoint into a stylized (not-to-scale) solar system (P2). Every body lives in the same
  scene graph so the per-body touch interaction can extend to planets and the Sun later.

## Data-compactness principles (later phases)

- All species/ecoregion content is precomputed at build time into static per-ecoregion JSON,
  loaded on demand — no runtime aggregation.
- Vector geodata (ecoregions, glaciers) ships as PMTiles built with tippecanoe: single-file
  archives served over HTTP range requests, no tile server needed on Vercel.
- Images via `next/image`; 3D textures via KTX2.
