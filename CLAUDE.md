# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Hyderabad Days" (package `hyderabad-days`): a browser-based isometric pixel-art simulation of Hyderabad. Vanilla TypeScript + Vite, rendered on a single 2D canvas. No framework, no runtime dependencies (only the `@fontsource/silkscreen` font). All art is generated procedurally in code; there are no image assets.

## Commands

```bash
npm run dev       # Vite dev server on :5173 (strictPort; also configured in .claude/launch.json)
npm run build     # tsc --noEmit && vite build  (type-check is part of the build)
npm test          # vitest run (all tests)
npx vitest run src/tests/world.test.ts -t "is deterministic"   # single file / test
```

Appending `?debug` to the URL enables debug mode (see `src/main.ts`). There is no linter configured. `dist/` is build output.

## Architecture

Pipeline: `World` (data) → `Chunks` (pre-baked canvases) → `Renderer` (per-frame blits), with `Sim` mutating live state and `UI` as the DOM overlay. `src/main.ts` wires them together during boot (fonts → world → overview bake → sprite sheets → sim/camera/renderer/UI).

- **`src/world/`** – Deterministic city generator, pure data with no canvas so it is unit-testable (`world.ts`). Seeded via `rng.ts` (hash2/noise); the same seed must always yield the same city (tested). `places.ts` defines named landmarks/places. Map is an `N×N` tile grid stored in typed arrays (ground, variant, road, road mask, …) plus object lists and metro lines. District types are constants (OLD, CENTRAL, CANTT, SUBURB, HILLS, TECH, RURAL).
- **`src/engine/`** – `iso.ts` holds the grid/projection maths (`N`, `CH`, `wx/wy`, `tileX/tileY`, `idx`, `inMap`); everything else depends on it. `chunks.ts` pre-renders the static world into 16×16-tile chunk canvases with three lazily baked layers (ground `g`, depth-sorted structures `s`, night lights `l`) and LRU eviction, plus a low-res overview. `renderer.ts` draws a frame as: ground chunk blits → moving entities → structure chunk blits → multiply fill for time-of-day → additive light pass. No per-sprite sorting and no per-frame allocation. `camera.ts` handles pan/zoom input.
- **`src/sim/sim.ts`** – The living city: game clock, day/night tint, weather, vehicles, citizens, metro trains. Hot data is in typed arrays; motion is parametric along tile paths so it is stable at any `dt`. Preserve the no-allocation-per-frame property.
- **`src/art/`** – Procedural pixel art. `paint.ts` has drawing primitives (`mkCanvas`), `tiles.ts` terrain tile ids/painters (tile type constants like `WATER`, `ROAD`-related are imported by the world generator), `sprites.ts` building/prop sprites looked up via `spriteFor`, `landmarks.ts` hand-built landmark art, `actors.ts` vehicle/citizen/icon sprite sheets (`buildSheets` takes metro line colors).
- **`src/ui/`** – DOM overlay (`ui.ts`, `styles.css`) over the canvas; the boot screen elements (`bootMsg`, `bootBar`) live in `index.html`.

Because world data, art tile ids, and chunk baking are coupled through shared constants in `iso.ts` and `art/tiles.ts`, changing grid size or tile/sprite ids usually requires touching `world`, `art`, and `engine` together.

## Tests

Only `src/tests/world.test.ts` exists: it covers iso projection round-trips and world-generation determinism/invariants. Keep `World` free of DOM/canvas dependencies so it stays testable under Vitest.
