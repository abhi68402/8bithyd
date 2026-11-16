// Shared geography constants. Used by the browser and by the Node map
// pipeline (scripts/build-map.mjs), so keep this file free of DOM and of
// non-erasable TypeScript.
//
// City coordinates are metres: X east from the west edge, Y south from the
// north edge. The screen is a north-up 2:1 dimetric view: 1 art px = 1 m
// east-west, 1 art px = 2 m north-south, heights 1 px = 1 m.
export const BBOX = { s: 17.2, w: 78.22, n: 17.62, e: 78.7 };

const LAT0 = (BBOX.s + BBOX.n) / 2;
const MX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const MY = 110574;

export const CITY_W = (BBOX.e - BBOX.w) * MX;
export const CITY_H = (BBOX.n - BBOX.s) * MY;
export const WORLD_W = CITY_W;
export const WORLD_H = CITY_H / 2;

export const mx = (lon: number) => (lon - BBOX.w) * MX;
export const my = (lat: number) => (BBOX.n - lat) * MY;
export const lonOf = (x: number) => BBOX.w + x / MX;
export const latOf = (y: number) => BBOX.n - y / MY;

/** Map tiles are TILE metres square. */
export const TILE = 1024;
export const TX = Math.ceil(CITY_W / TILE);
export const TY = Math.ceil(CITY_H / TILE);
/** Coordinates inside a tile file are int16 at 1/Q metre. */
export const Q = 4;

/** Coarse height grid cell, metres. */
export const CELL = 32;
export const GW = Math.ceil(CITY_W / CELL);
export const GH = Math.ceil(CITY_H / CELL);

// Road classes
export const ROAD_NAMES = ['Motorway', 'Trunk road', 'Primary road', 'Secondary road', 'Tertiary road', 'Local street', 'Service lane'];
/** Drawn width in metres (slightly exaggerated so streets read at city scale). */
export const ROAD_W = [16, 14, 13, 11, 9, 7, 4.5];

// Area kinds
export const A_WATER = 0, A_PARK = 1, A_FOREST = 2, A_GRASS = 3, A_FARM = 4, A_RES = 5, A_COM = 6, A_IND = 7,
  A_MIL = 8, A_ROCK = 9, A_SCRUB = 10, A_PITCH = 11, A_APRON = 12, A_CEMETERY = 13, A_ISLAND = 14, A_RAILYARD = 15, A_QUARRY = 16;

// Building kinds
export const B_GENERIC = 0, B_HOUSE = 1, B_APART = 2, B_COMMERCIAL = 3, B_INDUSTRIAL = 4, B_RELIGIOUS = 5, B_CIVIC = 6, B_SHED = 7, B_GLASS = 8;
