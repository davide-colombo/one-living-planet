# Earth Explorer — Concept and Feasibility Brief

*Working title: none yet. Draft 1 — 2026-09-01. Author: Claude, for Davide Colombo.*

## Verdict

The idea is viable, but not as pitched. As pitched it is five products — biodiversity explorer, cryosphere layer, weather/travel tool, geopolitical atlas, solar-system-and-deep-time experience — and each of the underlying data layers already exists somewhere as a free, well-maintained public source or even as a finished website. What does **not** exist, and where the opportunity actually lies, is a single consumer-grade product that stitches these layers into one curated, narrative, beautifully animated "explore your planet" experience. The gap is **design, editorial curation, and integration — not data**. That gap matches your profile (TypeScript + design systems + delegation to coding agents, plus domain credibility in biology) far better than a data-engineering moat would. The recommendation is to build the landing experience plus **one** layer (biodiversity) to production quality, and treat everything else as phases that are earned, not promised.

## Correcting the premise

"NASA has no such website; Google has not; Apple has not" is only half true. Nobody has the integrated product, but every individual piece has a strong incumbent, and you should know them before writing a line of code:

- **Half-Earth Project Map** (Yale's Map of Life + Vizzuality + Esri): an interactive globe of global species richness and rarity at up to 1 km resolution, with protected-area overlays and per-country report cards. This is the closest thing to your biodiversity globe, and it is polished.
- **Map of Life** (mol.org): species lists for any region on Earth ("Regions" tool), with a public API exposing range maps, Red List status, taxonomy, and images.
- **OneZoom** (onezoom.org): the interactive phylogenetic tree — 2.2M species, zoomable, on a single page.
- **Ancient Earth** (dinosaurpictures.org/ancient-earth, Ian Webster): the deep-time globe — type your city, watch it drift through 750 My of plate tectonics.
- **NASA Worldview / GIBS**: daily full-resolution satellite imagery of the whole planet, browsable interactively.
- **NASA Eyes**: the interactive solar system.

None of these is a consumer product with Apple-grade motion design and a narrative arc; all of them are tools or outreach sites made by scientists. That is your opening. It also means the correct pitch is not "the data nobody shows" but "the experience nobody has built" — closer to what Apple did with Maps' flyover mode, or what *inaturalist meets Apple TV's* Planet Earth *would look like as a website*.

## What to cut, and why

**Weather** is a commodity; every visitor has three weather apps. Keep weather only as *ambient context* on the globe (live cloud layer from GIBS, current conditions when a place is focused via Open-Meteo), never as a feature you market. The "prepare for travelling" app is a different product with a different audience and brutal competition (Google Travel, Wanderlog, every airline app); drop it from this concept entirely.

**Wars and geopolitics** carry the highest editorial and licensing risk. ACLED — the best-known conflict event dataset — has an EULA that prohibits redistributing or exposing its raw data to end users, restricts access tiers behind registration, and is enforced; you cannot legally power a public map with it. UCDP's Georeferenced Event Dataset (Uppsala) has a public API and is free for non-commercial use, so a "conflict snapshot" layer is *technically* feasible — but a solo-maintained site displaying active wars next to cute animal facts is a tonal and reputational minefield. Defer to phase 3 at the earliest, and only with a serious editorial framing; dropping it is defensible.

**Glaciers** are the opposite: excellent phase-2 material. The data is static, global, free, and beautiful — Randolph Glacier Inventory 7.0 (~275,000 glacier outlines via NSIDC/GLIMS as shapefiles, convertible to vector tiles at build time) plus WGMS mass-balance time series for the "and they are disappearing" narrative. No API keys, no rate limits, no editorial risk, and it serves the site's stated mission (why biodiversity and the environment are in danger).

**Solar system and deep history** belong on the landing page as short scroll chapters and links outward (or lightweight embeds), not as features you rebuild. NASA Eyes and Ancient Earth already do them well; competing there burns months for no differentiation.

That leaves the MVP: **landing experience + biodiversity explorer**.

## Data sources (verified 2026-09)

| Layer | Source | Access | License / constraint |
|---|---|---|---|
| Species occurrence maps | GBIF Maps API v2 (`api.gbif.org/v2/map`) | Free tile service (raster or vector), filterable by taxon, year, country | Open; per-dataset CC licenses; attribution |
| Species lists per region | Map of Life API; or precomputed from GBIF at build time | Public API | Check MOL terms for commercial reuse |
| Region backbone | RESOLVE Ecoregions 2017 (846 terrestrial ecoregions) | Static download | CC-BY — ideal curation unit for "what lives here" |
| Species photos / observations | iNaturalist API | Free, rate-limited | Photo licenses vary — filter to CC0/CC-BY |
| Species facts / summaries | Wikidata + Wikipedia REST APIs | Free | CC-BY-SA |
| Conservation status | IUCN Red List API | Free token, citation required | No bulk redistribution |
| Satellite imagery, night lights, clouds | NASA GIBS WMTS (Blue Marble, Black Marble/VIIRS, daily true color) | Free tile service | Open, attribution |
| Glaciers | RGI 7.0 via NSIDC; WGMS for time series | Static download | Open, cite |
| Weather (ambient only) | Open-Meteo | Free, no key, ≤10k calls/day non-commercial | CC-BY 4.0; paid tier if ever commercial |
| Conflict events (deferred) | UCDP GED API | Free API | Non-commercial only; ACLED not usable |
| Country facts | World Bank API, REST Countries | Free | Open |
| Basemap vectors | Natural Earth | Static download | Public domain |

Two things follow from this table. First, the MVP needs **no backend**: everything is either a public tile service or static data you precompute into JSON/vector tiles at build time. Second, several key licenses are **non-commercial** (Open-Meteo free tier, UCDP), which constrains monetization later — fine for now, but decide before adding ads or paid tiers.

## Architecture (recommendation, not established practice)

Static-first. Astro or Next.js with React islands, deployed on Cloudflare Pages or Vercel; heavy data (species-per-ecoregion lists, glacier tiles) generated at build time by Python/Node scripts — the same reproducible-pipeline discipline you use for NGS work applies verbatim.

Two rendering stacks, deliberately separate:

- **Landing hero**: custom Three.js / react-three-fiber globe. Full visual control is the point — GIBS Blue Marble texture on the day side, Black Marble city lights on the night side, atmospheric rim shader for the sun-behind-Earth glow. The day/night terminator needs no server and no geolocation permission: solar declination and hour angle are ~20 lines of astronomy (or the SunCalc library), and the visitor's timezone comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`. The page palette interpolates continuously through night → dawn → day → dusk states keyed to local solar time. This is entirely client-side and works offline after first load.
- **Explorer**: MapLibre GL + deck.gl (2D, with globe projection where wanted). Data-dense mapping is what these are built for; forcing GBIF tiles and ecoregion polygons through a bespoke Three.js globe would cost months of performance work for no gain. The transition between hero and explorer is a designed moment (camera dive from globe to map), not a shared engine.

Non-negotiable constraints: a `prefers-reduced-motion` and low-power fallback (static rendered Earth image, no WebGL) — a hero that melts a mid-range Android phone is the opposite of Apple style; and lazy-loading everything below the hero.

## The landing page

Structure it as 4–6 scroll chapters, not an infinite feed — you said it yourself: not too much information at once.

1. **Earthrise.** The half-lit globe, sun rim behind, palette synced to the visitor's local solar time. One line of copy. No UI chrome.
2. **The living planet.** ~2.13 million described species; best-known estimate ~8.7 million total (Mora et al. 2011, *PLOS Biology*) — most of life is still undescribed. Animated counters restrained to one use.
3. **One tree.** A minimal, stylized phylogeny teaser (not a OneZoom clone — a designed illustration that links out or into a light embed).
4. **In danger.** ~1 million species threatened with extinction (IPBES 2019 Global Assessment). This is the mission statement of the site and the bridge to the explorer.
5. **Explore.** CTA: dive into the globe.

Deep time and the solar system, if kept, are chapters 3b/3c at most — each one screen, each linking out.

## Phases

- **Phase 0 (2–3 weeks):** brand system + landing hero prototype (terminator sync, palette engine, reduced-motion fallback). This is also the demo that tests whether the concept lands with people.
- **Phase 1 (6–10 weeks):** biodiversity explorer on the ecoregion backbone — click anywhere, get the ecoregion, its species highlights (precomputed), GBIF density overlay, species pages assembled from Wikidata + iNaturalist + IUCN status.
- **Phase 2:** glaciers + a deep-time chapter.
- **Phase 3 (conditional):** country facts; conflict layer only with editorial capacity and UCDP's terms re-checked.
- **App:** PWA first (installable, offline shell); native only if usage justifies it.

## Risks, ranked

1. **Scope creep** — the pitch itself is the evidence. The mitigation is this document: one layer to production quality before any second layer.
2. **Editorial cost** — "interesting facts, curated, beautiful" is a content operation, not a codebase. Automating assembly from Wikidata/iNat gets you 80%; the remaining curation is recurring human work. Budget it or scope facts to a fixed set (e.g., 846 ecoregions × 5 flagship species).
3. **Mobile WebGL performance** — solvable but must be designed in from day one, not retrofitted.
4. **Licensing on the growth path** — non-commercial clauses (Open-Meteo, UCDP) and iNat photo licenses are fine today and a landmine the day you monetize.
5. **Differentiation drift** — if the execution is not visibly better-designed than Half-Earth Map, the product has no reason to exist. Design quality is the moat; treat it as the primary requirement, not polish.

## Open questions for you

Whether this is a portfolio/science-communication project or a product with revenue ambitions changes the licensing choices and the phase-3 decision; and whether you want the first public output to be the Phase 0 hero (fast, demonstrable) or a fuller private prototype. Everything else in this brief proceeds on the assumption: science-communication first, portfolio-grade, revenue deferred.

## Key references

- Half-Earth Project Map — eowilsonfoundation.org / Vizzuality
- Map of Life — mol.org, api.mol.org
- GBIF Maps API — gbif.org/developer/maps
- NASA GIBS — nasa-gibs.github.io/gibs-api-docs
- RGI 7.0 — glims.org/rgi_user_guide, NSIDC dataset NSIDC-0770
- Open-Meteo — open-meteo.com
- UCDP — ucdp.uu.se/apidocs; ACLED EULA — acleddata.com/eula
- OneZoom — onezoom.org; Ancient Earth — dinosaurpictures.org/ancient-earth
- Mora et al. 2011, "How Many Species Are There on Earth and in the Ocean?", *PLOS Biology* 9(8)
- IPBES 2019, Global Assessment Report on Biodiversity and Ecosystem Services
