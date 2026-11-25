# Hyderabad Days

> **హైదరాబాద్ / हैदराबाद** — *The real street map of Hyderabad as a living 2:1 dimetric pixel-art city.*

Hyderabad Days is a browser-based pixel-art city simulation built on real OpenStreetMap geography (~51 × 46 km across `17.20°–17.62° N`, `78.22°–78.70° E`). Explore hundreds of thousands of real building footprints, elevated metro lines, live traffic, seasonal festivals, and real-time Hyderabad weather & air quality rendered procedurally on a 2D `<canvas>`.

---

## Features

- **Real Hyderabad Map & 38 Custom Landmarks**
  - Streamed binary map tiles (`1024 × 1024 m` tiles in `public/map/t/`) with real building polygons, road hierarchy, parks, lakes, rail lines, and Metro corridors (Red, Blue, Green).
  - Hand-crafted pixel landmarks including **Charminar**, **Mecca Masjid**, **Golconda Fort**, **Hussain Sagar Buddha**, **Birla Mandir**, **Cyber Towers**, **Durgam Cheruvu Cable Bridge**, **Secunderabad Junction**, **Uppal Stadium**, and **Shamshabad Airport**.
- **Living Street & Transit Simulation**
  - Cycling arterial traffic signals where ordinary traffic brakes and emergency vehicles (`108 Ambulance`, `Traffic police patrol`) glide through.
  - Hyderabadi traffic mix: auto-rickshaws, scooters/bikes, delivery riders, TSRTC & Electric buses, Pushpak Airport Liners, Heritage Tourist buses, water tankers, lorries, and cyclists.
  - Pedestrians carrying umbrellas in rain, animated thought bubbles, elevated Metro & MMTS trains, Hussain Sagar boats, Shamshabad runway departures, birds, and evening kites.
- **Live IST Time, Weather & Air Quality**
  - Follows real India Standard Time (`IST`) and Hyderabad astronomical sunrise/sunset.
  - Fetches live Hyderabad weather and air quality from Open-Meteo (`temperature`, `feels like`, `humidity`, `wind speed/direction`, `cloud cover`, `US AQI`, `PM2.5`), driving rain intensity, wind slant, cloud shadows, Deccan haze, and monsoon lightning — plus manual sky presets (`Clear`, `Overcast`, `Deccan Haze`, `Drizzle`, `Rain`, `Thunderstorm`).
- **Interactive City Tools**
  - **City Passport**: Discover and stamp all 38 landmarks, searchable by name, Telugu/Hindi name, or area.
  - **Map Views**: `Roads`, `Metro` (with 10-minute walk catchments), `Traffic`, `Zones`, `Density`, and `Land Use`.
  - **Neighbourhood Report**: Live estimates of population, jobs, R/C/I demand bars, zone mix, ratings, and advisor feedback for the current viewport.
  - **City Happenings & Festival Calendar**: Scheduled local events (match nights at Uppal, Charminar night market, Numaish, Lumbini laser show, Bonalu, Ganesh immersion) plus real-date Indian festivals.
  - **Tap-to-Inspect, Guided Tour, Postcard & Audio**: Tap any landmark, building, vehicle, citizen, or train to inspect or hop on; launch a guided aerial tour; export a pixel **Greetings from Hyderabad** PNG postcard; toggle the procedural Web Audio city soundscape.

---

## Tech Stack

- **Simulation & Renderer**: Vanilla TypeScript, HTML5 2D `<canvas>`, procedural pixel-art painters & chunk baking (`src/art/`, `src/engine/`, `src/sim/`, `src/world/`).
- **HUD**: React 19 + [`pixel-retroui`](https://github.com/Dksie09/RetroUI) (`src/ui/HudApp.tsx`, `src/ui/ui.tsx`, `src/ui/styles.css`) + `@fontsource/silkscreen`.
- **Build & Tests**: Vite 6, TypeScript 5.6, Vitest 2.

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:5173)
npm run dev

# Run unit tests
npm test

# Type-check and build for production (outputs to dist/)
npm run build

# Preview the production build locally
npm run preview
```

### Optional URL Flags

- `?game` — Start with simulated game time instead of live IST/weather sync.
- `?debug` — Show live FPS, frame timing, active chunk counts, and entity telemetry.

### Map Data Pipeline (Optional)

Prebuilt map data is already committed under `public/map/`. To regenerate from OpenStreetMap exports:

```bash
npm run map        # Fetch OSM data into data-raw/ and build public/map/
npm run map:build  # Rebuild public/map/ from existing data-raw/
```

---

## Project Layout

```text
src/
├── art/        # Procedural pixel sprites, vehicles, citizens & landmarks
├── engine/     # Camera, chunk baker, 2D frame renderer, Web Audio soundscape
├── sim/        # Traffic/pedestrian/train sim, live Open-Meteo sync, events & festivals
├── tests/      # Vitest unit suites (city, festivals, quality, query, sim)
├── ui/         # React + pixel-retroui HUD, boot screen, i18n, city tools
└── world/      # Geographic projection, binary tile loader, spatial queries & places
scripts/        # OpenStreetMap fetch & binary tile builder
public/map/     # Prebuilt city.json, grid.bin, and binary map tiles
```

---

## Credits & Data Sources

- **Map Data**: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- **Live Weather & Air Quality**: [Open-Meteo](https://open-meteo.com/)
- **UI Components**: [RetroUI (`pixel-retroui`)](https://github.com/Dksie09/RetroUI)
- **Pixel Font**: [Silkscreen](https://github.com/googlefonts/silkscreen)
