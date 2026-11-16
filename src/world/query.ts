// City-builder style questions about the real map: what is this building,
// who is likely in it, and how does the neighbourhood on screen add up?
// Pure data (no canvas) so it can be unit tested. Per-tile figures are
// worked out once and cached against the tile.
import { TILE, TX, A_COM, A_IND, A_PARK, A_FOREST, A_GRASS, A_PITCH, A_WATER,
  B_HOUSE, B_APART, B_COMMERCIAL, B_INDUSTRIAL, B_RELIGIOUS, B_CIVIC, B_SHED, B_GLASS } from './geo';
import type { City, Tile } from './city';

export const Z_RES = 0, Z_COM = 1, Z_IND = 2, Z_PUB = 3;
export const ZONE_NAMES = ['Residential', 'Commercial', 'Industrial', 'Public'];
/** Classic zone colours: green homes, blue business, yellow industry. */
export const ZONE_COL = ['#5ad26e', '#5a9cf5', '#f2c83c', '#e58ad6'];
const KIND_NAMES = ['Building', 'House', 'Apartment block', 'Shops and offices', 'Factory or warehouse', 'Place of worship', 'Public building', 'Shed', 'Office tower'];

/** Net floor area per resident / worker, square metres. Rough planning figures. */
const M2_PER_RESIDENT = 22, M2_PER_WORKER = [0, 20, 55, 35];
const WALK = 800; // metres to a metro station that counts as walkable

export interface TileInfo {
  zone: Uint8Array;      // Z_*
  area: Float32Array;    // footprint, square metres
  people: Float32Array;  // residents (Z_RES) or workers (others)
  metro: Uint8Array;     // 1 if within WALK of a station
}
const cache = new WeakMap<Tile, TileInfo>();

export function tileInfo(city: City, t: Tile): TileInfo {
  let info = cache.get(t);
  if (info) return info;
  const zone = new Uint8Array(t.nb), area = new Float32Array(t.nb), people = new Float32Array(t.nb), metro = new Uint8Array(t.nb);
  // stations that could matter to this tile
  const st: number[] = [];
  const x0 = t.tx * TILE - WALK, y0 = t.ty * TILE - WALK, x1 = (t.tx + 1) * TILE + WALK, y1 = (t.ty + 1) * TILE + WALK;
  for (const m of city.metro) for (const s of m.stations) if (s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1) st.push(s.x, s.y);
  const v = t.verts;
  for (let i = 0; i < t.nb; i++) {
    const n = t.bN[i], off = t.bOff[i], kind = t.bKind[i];
    let a = 0, cx = 0, cy = 0;
    for (let k = 0; k < n; k++) {
      const p = off + k * 2, q = off + ((k + 1) % n) * 2;
      a += v[p] * v[q + 1] - v[q] * v[p + 1];
      cx += v[p]; cy += v[p + 1];
    }
    a = Math.abs(a) / 2; cx /= n; cy /= n;
    area[i] = a;
    let z: number;
    if (kind === B_COMMERCIAL || kind === B_GLASS) z = Z_COM;
    else if (kind === B_INDUSTRIAL) z = Z_IND;
    else if (kind === B_RELIGIOUS || kind === B_CIVIC) z = Z_PUB;
    else if (kind === B_HOUSE || kind === B_APART) z = Z_RES;
    else {
      // untagged buildings and sheds take the zoning of the land they stand on
      const land = city.areaAt(cx, cy);
      z = land === A_IND ? Z_IND : land === A_COM ? Z_COM : Z_RES;
    }
    zone[i] = z;
    const floors = Math.max(1, Math.round(t.bH[i] / 3.2));
    const net = a * floors * 0.72;
    people[i] = kind === B_SHED ? 0 : z === Z_RES ? net / M2_PER_RESIDENT : net / M2_PER_WORKER[z];
    for (let k = 0; k < st.length; k += 2) if (Math.abs(st[k] - cx) < WALK && Math.hypot(st[k] - cx, st[k + 1] - cy) < WALK) { metro[i] = 1; break; }
  }
  info = { zone, area, people, metro };
  cache.set(t, info);
  return info;
}

function inside(v: Float32Array, off: number, n: number, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = v[off + i * 2], yi = v[off + i * 2 + 1], xj = v[off + j * 2], yj = v[off + j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export interface Hit { tile: Tile; i: number }

/**
 * The building drawn under a point of the map. (wx, wy) are world pixels:
 * x in metres, y in half metres, with buildings rising straight up the screen.
 */
export function pickBuilding(city: City, wx: number, wy: number): Hit | null {
  let best: Hit | null = null, bestY = -Infinity;
  const tx = Math.floor(wx / TILE);
  // a tall building's base can be well south of where its roof is drawn
  for (let ty = Math.floor((wy * 2) / TILE); ty <= Math.floor((wy * 2 + 520) / TILE); ty++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = city.peek(ty * TX + tx + dx);
      if (!t || tx + dx < 0 || tx + dx >= TX) continue;
      const v = t.verts;
      for (let i = 0; i < t.nb; i++) {
        if (t.bMaxY[i] <= bestY) continue;
        const h = t.bH[i], off = t.bOff[i], n = t.bN[i];
        if (t.bMaxY[i] / 2 < wy || t.bMaxY[i] / 2 - h - 160 > wy) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (let k = 0; k < n; k++) { const x = v[off + k * 2], y = v[off + k * 2 + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; }
        if (wx < minX || wx > maxX || wy < minY / 2 - h) continue;
        // roof first, then sweep down the walls
        let hit = inside(v, off, n, wx, (wy + h) * 2);
        for (let z = h - 2; !hit && z >= 0; z -= 2) hit = inside(v, off, n, wx, (wy + z) * 2);
        if (hit) { best = { tile: t, i }; bestY = t.bMaxY[i]; }
      }
    }
  }
  return best;
}

/** Name of the closest mapped neighbourhood (the city's own label does not count). */
export function nearestSuburb(city: City, x: number, y: number): string {
  let name = '', bd = Infinity;
  for (const s of city.suburbs) {
    if (s[0] === 'Hyderabad') continue;
    const d = Math.hypot(s[1] - x, s[2] - y);
    if (d < bd) { bd = d; name = s[0]; }
  }
  return name;
}

export interface BuildingFacts {
  title: string; zone: number; height: number; floors: number; footprint: number;
  people: number; peopleLabel: string; generated: boolean;
  suburb: string; station: string; stationDist: number; x: number; y: number;
}

export function describeBuilding(city: City, hit: Hit): BuildingFacts {
  const { tile: t, i } = hit;
  const info = tileInfo(city, t);
  const kind = t.bKind[i], z = info.zone[i], h = t.bH[i];
  const v = t.verts, off = t.bOff[i], n = t.bN[i];
  let x = 0, y = 0;
  for (let k = 0; k < n; k++) { x += v[off + k * 2]; y += v[off + k * 2 + 1]; }
  x /= n; y /= n;
  let station = '', sd = Infinity;
  for (const m of city.metro) for (const s of m.stations) { const d = Math.hypot(s.x - x, s.y - y); if (d < sd) { sd = d; station = s.name; } }
  const suburb = nearestSuburb(city, x, y);
  const title = kind === 0 ? (z === Z_COM ? 'Commercial building' : z === Z_IND ? 'Industrial building' : h > 13 ? 'Apartment block' : 'House') : KIND_NAMES[kind] ?? 'Building';
  return {
    title, zone: z, height: h, floors: Math.max(1, Math.round(h / 3.2)), footprint: info.area[i],
    people: Math.round(info.people[i]), peopleLabel: kind === B_SHED ? '' : z === Z_RES ? 'residents' : kind === B_RELIGIOUS ? 'capacity' : 'workers',
    generated: !!t.bGen?.[i], suburb, station, stationDist: sd, x, y,
  };
}

export interface Report {
  buildings: number; byZone: [number, number, number, number];
  residents: number; jobs: [number, number, number, number];
  tallest: number; roadKm: number; metroShare: number; greenShare: number; waterShare: number;
  /** -1..1, simulated: how much the area "wants" more of each zone. */
  demand: [number, number, number];
  suburb: string;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Add up the loaded map inside a rectangle of city metres. */
export function areaReport(city: City, x0: number, y0: number, x1: number, y1: number): Report {
  const r: Report = { buildings: 0, byZone: [0, 0, 0, 0], residents: 0, jobs: [0, 0, 0, 0], tallest: 0, roadKm: 0, metroShare: 0, greenShare: 0, waterShare: 0, demand: [0, 0, 0], suburb: '' };
  let near = 0;
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) {
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
      if (tx < 0 || ty < 0 || tx >= TX) continue;
      const t = city.peek(ty * TX + tx);
      if (!t) continue;
      const info = tileInfo(city, t), v = t.verts;
      for (let i = 0; i < t.nb; i++) {
        const x = v[t.bOff[i]], y = v[t.bOff[i] + 1];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const z = info.zone[i];
        r.buildings++; r.byZone[z]++;
        if (z === Z_RES) r.residents += info.people[i]; else r.jobs[z] += info.people[i];
        if (t.bH[i] > r.tallest) r.tallest = t.bH[i];
        near += info.metro[i];
      }
      for (const road of t.roads) {
        const x = road.p[0], y = road.p[1];
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) r.roadKm += road.total / 1000;
      }
    }
  }
  r.metroShare = r.buildings ? near / r.buildings : 0;
  // land cover from a coarse sample of the mapped areas
  const N = 14;
  let green = 0, water = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = city.areaAt(x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / N) * (y1 - y0));
    if (k === A_PARK || k === A_FOREST || k === A_GRASS || k === A_PITCH) green++;
    else if (k === A_WATER) water++;
  }
  r.greenShare = green / (N * N); r.waterShare = water / (N * N);
  // demand: a balanced city has about 0.42 jobs per resident, a third of them industrial
  const workers = r.residents * 0.42, jobs = r.jobs[1] + r.jobs[2] + r.jobs[3];
  if (r.buildings > 20) {
    r.demand[0] = clamp((jobs - workers) / (jobs + workers + 1) * 1.6);
    r.demand[1] = clamp((workers * 0.62 - r.jobs[1] - r.jobs[3]) / (workers * 0.62 + r.jobs[1] + r.jobs[3] + 1) * 1.6);
    r.demand[2] = clamp((workers * 0.38 - r.jobs[2]) / (workers * 0.38 + r.jobs[2] + 1) * 1.6);
  }
  r.suburb = nearestSuburb(city, (x0 + x1) / 2, (y0 + y1) / 2);
  return r;
}
