# Earth Explorer

Play with planet Earth in your browser. The site shows the planet lit exactly as it is right now, based on your local solar time. You can spin it, tilt it, and scroll out into the solar system. A biodiversity explorer built on the RESOLVE ecoregions is in the works.

## Development

```bash
pnpm install
pnpm dev
```

- `pnpm dev` starts the dev server at http://localhost:3000
- `pnpm build` makes the production build
- `pnpm lint` runs ESLint
- `pnpm format` runs Prettier

Key routes:

- `/` is the landing experience
- `/styleguide` shows the design tokens: palettes, solar-phase interpolation, type, spacing, motion

## Docs

- [docs/concept.md](docs/concept.md) holds the concept brief
- [docs/architecture.md](docs/architecture.md) holds the architecture notes

## Credits

- Earth imagery: NASA Earth Observatory / Visible Earth, Blue Marble Next Generation (day) and
  Black Marble (night). NASA imagery is in the public domain; imagery courtesy of NASA.
- Planet and Sun textures: [Solar System Scope](https://www.solarsystemscope.com/textures/),
  CC BY 4.0.
- Ecoregion data: [RESOLVE Ecoregions 2017](https://ecoregions.appspot.com/), CC BY 4.0.
- Solar-position math follows the low-precision Astronomical Almanac approximation.

## License

Code is released under the [MIT License](LICENSE).
