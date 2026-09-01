# Earth Explorer

A science-communication website about planet Earth — an "Earthrise" landing experience synced to your local solar time, and a biodiversity explorer built on an ecoregion backbone.

## Development

```bash
pnpm install
pnpm dev
```

- `pnpm dev` — dev server at http://localhost:3000
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm format` — Prettier

Key routes:

- `/` — landing (hero comes in Phase 0, Step 3)
- `/styleguide` — design tokens: palettes, solar-phase interpolation, type, spacing, motion

## Docs

- [docs/concept.md](docs/concept.md) — project concept brief
- [docs/architecture.md](docs/architecture.md) — architecture & data-compactness principles
