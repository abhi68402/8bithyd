// Three levels of detail, all cached bitmaps so a frame is a few blits:
//   detail   one chunk per square-km tile at 1 art px per metre. Ground bakes
//            in one go; the ~thousands of building footprints are extruded a
//            few hundred per frame (time-boxed), so panning never hitches.
//   coarse   4 km chunks at quarter scale, built from the height grid.
//   overview the whole city at 1/16, built once at boot (also the minimap).
// Chunks are evicted least-recently-used so memory stays bounded.
import { TILE, TX, TY, CELL, GW, GH, CITY_W, CITY_H, ROAD_W,
  A_WATER, A_PARK, A_FOREST, A_GRASS, A_FARM, A_RES, A_COM, A_IND, A_MIL, A_ROCK, A_SCRUB, A_PITCH, A_APRON, A_CEMETERY, A_ISLAND, A_RAILYARD, A_QUARRY,
  B_HOUSE, B_APART, B_COMMERCIAL, B_INDUSTRIAL, B_RELIGIOUS, B_CIVIC, B_SHED, B_GLASS } from '../world/geo';
import type { City, Tile, Place } from '../world/city';
import { tileInfo, ZONE_COL } from '../world/query';
import { hash2 } from '../world/rng';
import { mkCanvas, shade } from '../art/paint';
import { spriteFor } from '../art/sprites';

type Ctx = CanvasRenderingContext2D;

export const LAND = '#bdb27c';
export const AREA_COL: string[] = [];
AREA_COL[A_WATER] = '#3b8da6'; AREA_COL[A_PARK] = '#6fb255'; AREA_COL[A_FOREST] = '#5a9a48'; AREA_COL[A_GRASS] = '#8fb262';
AREA_COL[A_FARM] = '#a9b560'; AREA_COL[A_RES] = '#c9bfa0'; AREA_COL[A_COM] = '#cfc5ae'; AREA_COL[A_IND] = '#b9b3a6';
AREA_COL[A_MIL] = '#a9ad7e'; AREA_COL[A_ROCK] = '#a59488'; AREA_COL[A_SCRUB] = '#9aa565'; AREA_COL[A_PITCH] = '#62b24c';
AREA_COL[A_APRON] = '#8e8f96'; AREA_COL[A_CEMETERY] = '#9db27a'; AREA_COL[A_ISLAND] = LAND; AREA_COL[A_RAILYARD] = '#9a9084'; AREA_COL[A_QUARRY] = '#b3a590';
const ASPHALT = ['#4a4953', '#4c4b55', '#504f58', '#55545c', '#595860', '#5e5d64', '#69686e'];

// building palettes: [roof, wallLight, wallMid, wallDark]
function pal(walls: string[], roofs: string[]): string[][] {
  const out: string[][] = [];
  for (const w of walls) for (const r of roofs) out.push([r, shade(w, 1.0), shade(w, 0.84), shade(w, 0.66)]);
  return out;
}
const PALS: string[][][] = [];
const CONCRETE = ['#d9d2c4', '#cfc8ba', '#e0d6c2', '#c9c4bc', '#d6cdbd'];
PALS[0] = pal(['#e6dcc6', '#d6cfc4', '#ecd9b4', '#d3dbe0', '#e6c9b4', '#c6d6d2'], CONCRETE);
PALS[B_HOUSE] = pal(['#efe3c4', '#e6d3a8', '#d7e3cd', '#cddfe8', '#f0d2c2', '#e9e1d6', '#e3c9a0'], [...CONCRETE, '#c2674a']);
PALS[B_APART] = pal(['#e9d9c4', '#d9e4d4', '#e4d4dc', '#d4dce8', '#efe2b8', '#e6c9b0'], CONCRETE);
PALS[B_COMMERCIAL] = pal(['#e2d6bf', '#cfd3d6', '#d9c7b8', '#e8dcc0'], ['#c9c4bc', '#bfc4c8', '#d6cdbd']);
PALS[B_INDUSTRIAL] = pal(['#b9bcc2', '#c4c0b6', '#aab4bc'], ['#8fa3b5', '#a8b0b8', '#9aa7a0', '#b5a898']);
PALS[B_RELIGIOUS] = pal(['#f4f1e8', '#efe6d0'], ['#f1ede2', '#e6dcc0']);
PALS[B_CIVIC] = pal(['#e8d090', '#ecdca8', '#dba79c', '#e6dccf'], ['#c2674a', '#b9553d', '#cfc8ba']);
PALS[B_SHED] = pal(['#a8a39a', '#b3ada3'], ['#9aa0a6', '#b0a898']);
PALS[B_GLASS] = pal(['#6fb7d6', '#5aa0c8', '#7fc9c0', '#8fb0d8', '#4f8fb5', '#6fc0a8'], ['#dfe6ea', '#cfd8dc']);

let noisePat: CanvasPattern | null = null, winPat: CanvasPattern | null = null, bandPat: CanvasPattern | null = null;
let winPatH: CanvasPattern | null = null, bandPatH: CanvasPattern | null = null;
let litPat: CanvasPattern | null = null, litCool: CanvasPattern | null = null, farmPat: CanvasPattern | null = null;
let treeSheet: HTMLCanvasElement | null = null;
const TREE_N = 8, TREE_W = 11, TREE_H = 14;

function initPatterns(ctx: Ctx) {
  if (noisePat) return;
  const mk = (w: number, h: number, fn: (c: Ctx) => void) => { const cv = mkCanvas(w, h); fn(cv.getContext('2d')!); return ctx.createPattern(cv, 'repeat')!; };
  noisePat = mk(64, 64, (c) => {
    for (let i = 0; i < 520; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,240,0.09)' : 'rgba(40,30,20,0.08)'; c.fillRect((hash2(i, 1, 5) * 64) | 0, (hash2(i, 2, 5) * 64) | 0, 1, 1); }
  });
  farmPat = mk(8, 6, (c) => { c.fillStyle = 'rgba(70,90,30,0.16)'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 3, 8, 1); });
  winPat = mk(4, 5, (c) => { c.fillStyle = 'rgba(44,58,82,0.78)'; c.fillRect(1, 1, 2, 2); });
  bandPat = mk(4, 4, (c) => { c.fillStyle = 'rgba(20,50,80,0.38)'; c.fillRect(0, 0, 4, 1); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 2, 1, 2); });
  // close-up versions at two art pixels per metre: a pane, a glint and a sill
  const half = (p: CanvasPattern) => { p.setTransform(new DOMMatrix().scale(0.5)); return p; };
  winPatH = half(mk(8, 10, (c) => {
    c.fillStyle = 'rgba(40,54,80,0.84)'; c.fillRect(2, 2, 4, 5);
    c.fillStyle = 'rgba(150,196,230,0.55)'; c.fillRect(2, 2, 2, 1); c.fillRect(2, 3, 1, 1);
    c.fillStyle = 'rgba(30,20,10,0.16)'; c.fillRect(1, 7, 6, 1);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(0, 9, 8, 1);
  }));
  bandPatH = half(mk(8, 8, (c) => {
    c.fillStyle = 'rgba(20,50,80,0.40)'; c.fillRect(0, 0, 8, 2);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(0, 2, 8, 1); c.fillRect(0, 3, 1, 5);
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(3, 4, 2, 3);
  }));
  const lit = (cols: string[], p: number) => mk(32, 40, (c) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (hash2(x, y, 77) < p) { c.fillStyle = cols[(hash2(x, y, 78) * cols.length) | 0]; c.fillRect(x * 4 + 1, y * 5 + 1, 2, 2); }
  });
  litPat = lit(['#ffd58a', '#ffe2a8', '#f0b060'], 0.42);
  litCool = lit(['#9fd0ee', '#cfe8ff', '#ffd58a'], 0.5);
  treeSheet = mkCanvas(TREE_W * TREE_N, TREE_H);
  const t = treeSheet.getContext('2d')!;
  const greens = ['#4f8f3f', '#5a9a45', '#488a44', '#62a04a', '#3f7f3a', '#6aa650'];
  for (let v = 0; v < TREE_N; v++) {
    const x0 = v * TREE_W, g = greens[v % greens.length];
    if (v === 7) { // palm
      t.fillStyle = '#8a6a48'; t.fillRect(x0 + 5, 5, 1, 9);
      t.fillStyle = g;
      for (const [dx, dy] of [[-3, 1], [-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1], [-2, 2], [2, 2], [0, -1]]) t.fillRect(x0 + 5 + dx, 4 + dy, 1, 1);
      continue;
    }
    const r = 3 + (v % 3);
    t.fillStyle = '#6b4a2e'; t.fillRect(x0 + 5, 10, 1, 4);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy * 1.3 > r * r + 0.8) continue;
      const l = -dx - dy * 1.3;
      t.fillStyle = l > r * 0.75 ? shade(g, 1.18) : l > -r * 0.4 ? g : shade(g, 0.76);
      t.fillRect(x0 + 5 + dx, 8 - (r > 4 ? 1 : 0) + dy, 1, 1);
    }
    if (v === 5) { t.fillStyle = '#e2552f'; for (let i = 0; i < 6; i++) t.fillRect(x0 + 3 + ((i * 3) % 6), 5 + (i % 3), 1, 1); }
  }
}

function polyPath(ctx: Ctx, p: Float32Array) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
}

/** Paint land use, water and rail in city-metre coordinates (transform set by caller). */
function paintLand(ctx: Ctx, city: City, x0: number, y0: number, x1: number, y1: number, farmTexture: boolean) {
  ctx.fillStyle = LAND;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (const a of city.areasIn(x0, y0, x1, y1)) {
    ctx.beginPath();
    polyPath(ctx, a.p);
    ctx.closePath();
    ctx.fillStyle = AREA_COL[a.kind] ?? LAND;
    ctx.fill();
    if (farmTexture && a.kind === A_FARM) { ctx.fillStyle = farmPat!; ctx.fill(); }
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = AREA_COL[A_WATER];
  for (const w of city.waterLines) {
    ctx.lineWidth = w.w;
    ctx.beginPath(); polyPath(ctx, w.p); ctx.stroke();
  }
}

interface Extra { y: number; kind: 0 | 1 | 2 | 3 | 4; x: number; v: number; place?: Place }

export interface DetailChunk {
  tx: number; ty: number; key: number;
  tile: Tile;
  g: HTMLCanvasElement | null;
  s: HTMLCanvasElement | null; sx: number; sy: number; sctx: Ctx | null;
  l: HTMLCanvasElement | null; lctx: Ctx | null;
  bi: number; ei: number; // structure progress
  li: number; lei: number; // lights progress
  extras: Extra[];
  used: number;
  // close-up layers at HI art pixels per metre, baked only when zoomed right in
  hg: HTMLCanvasElement | null;
  hs: HTMLCanvasElement | null; hctx: Ctx | null;
  hbi: number; hei: number; hused: number;
}
/** Art pixels per metre of the close-up layers. */
export const HI = 2;
export interface CoarseChunk { cx: number; cy: number; c: HTMLCanvasElement; l: HTMLCanvasElement; used: number }

export const COARSE = 2048;
export const COARSE_S = 4; // metres per px (x); y is twice that
const COARSE_PAD = 96;
export const OV_S = 16;

export class Chunks {
  detail = new Map<number, DetailChunk>();
  coarse = new Map<number, CoarseChunk>();
  overview!: HTMLCanvasElement;
  overviewNight!: HTMLCanvasElement;
  bakes = 0;
  private deadline = 0;
  private frame = 0;
  private bldClear: [number, number, number][] = [];
  private propClear: [number, number, number][] = [];
  private tileClearCache = new WeakMap<Tile, [number, number, number][]>();

  constructor(private city: City) {
    initPatterns(mkCanvas(1, 1).getContext('2d')!);
    city.onEvict = (t) => this.dropDetail(t.key);
    for (const p of city.places) {
      if (!p.clear && !p.sprite) continue;
      this.bldClear.push([p.x, p.y, Math.max(p.clear ?? 0, p.sprite ? 28 : 0)]);
      this.propClear.push([p.x, p.y, Math.min(Math.max(p.clear ?? 0, p.sprite ? 22 : 0), 46)]);
    }
  }

  private zonesForTile(t: Tile): [number, number, number][] {
    let z = this.tileClearCache.get(t);
    if (z) return z;
    const x0 = t.tx * TILE - 180, x1 = (t.tx + 1) * TILE + 180;
    const y0 = t.ty * TILE - 180, y1 = (t.ty + 1) * TILE + 180;
    z = this.bldClear.filter(([zx, zy, zr]) => zx + zr >= x0 && zx - zr <= x1 && zy + zr >= y0 && zy - zr <= y1);
    this.tileClearCache.set(t, z);
    return z;
  }

  private clearedBuilding(t: Tile, i: number): boolean {
    const zones = this.zonesForTile(t);
    if (!zones.length) return false;
    const n = t.bN[i], off = t.bOff[i], v = t.verts;
    let cx = 0, cy = 0;
    for (let k = 0; k < n; k++) { cx += v[off + k * 2]; cy += v[off + k * 2 + 1]; }
    cx /= n; cy /= n;
    for (const [zx, zy, zr] of zones) {
      const dc = Math.hypot(cx - zx, cy - zy);
      if (dc < zr) return true;
      if (dc <= zr + 160) {
        for (let k = 0; k < n; k++) if (Math.hypot(v[off + k * 2] - zx, v[off + k * 2 + 1] - zy) < zr) return true;
      }
    }
    return false;
  }

  private clearedProp(x: number, y: number): boolean {
    for (const [zx, zy, zr] of this.propClear) if (Math.hypot(x - zx, y - zy) < zr) return true;
    return false;
  }

  beginFrame(ms: number) { this.deadline = performance.now() + ms; this.frame++; }
  private timeLeft() { return performance.now() < this.deadline; }

  // ------------------------------------------------------------ detail
  /** Chunk for a tile, created once the tile and its neighbours have loaded. */
  getDetail(tx: number, ty: number): DetailChunk | null {
    const key = ty * TX + tx;
    let c = this.detail.get(key);
    if (c) { c.used = this.frame; return c; }
    const tile = this.city.tile(tx, ty);
    if (!tile) return null;
    let ready = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.city.tile(tx + dx, ty + dy) === null) ready = false;
    if (!ready || !this.timeLeft()) return null;
    c = { tx, ty, key, tile, g: null, s: null, sx: 0, sy: 0, sctx: null, l: null, lctx: null, bi: 0, ei: 0, li: 0, lei: 0, extras: this.extras(tile), used: this.frame, hg: null, hs: null, hctx: null, hbi: 0, hei: 0, hused: 0 };
    c.g = this.paintGround(c, 1);
    this.detail.set(key, c);
    return c;
  }

  private extras(tile: Tile): Extra[] {
    const out: Extra[] = [];
    const ox = tile.tx * TILE, oy = tile.ty * TILE;
    const dense = tile.nb > 1400;
    const STEP = 22;
    for (let gy = 0; gy < TILE / STEP; gy++) {
      for (let gx = 0; gx < TILE / STEP; gx++) {
        const h = hash2(gx + tile.tx * 61, gy + tile.ty * 67, 9);
        if (h > 0.75) continue;
        const x = ox + (gx + hash2(gx, gy, tile.key) * 0.9) * STEP, y = oy + (gy + hash2(gy, gx, tile.key + 1) * 0.9) * STEP;
        const k = this.city.areaAt(x, y);
        const p = k === A_FOREST ? 0.75 : k === A_PARK ? 0.42 : k === A_SCRUB ? 0.14 : k === A_CEMETERY ? 0.2 : k === A_MIL ? 0.1 : k === A_GRASS ? 0.06
          : k === A_RES || k === A_COM ? (dense ? 0.012 : 0.04) : k === A_FARM ? 0.012 : k === -1 ? (dense ? 0.01 : 0.035) : 0;
        if (h < p && !this.clearedProp(x, y)) out.push({ y, kind: 0, x, v: k === A_FOREST || k === A_PARK ? (hash2(gx, gy, 3) * 7) | 0 : (hash2(gx, gy, 3) * TREE_N) | 0 });
      }
    }
    // Hero monuments are rendered unclipped across tile boundaries in Renderer.drawLandmarks
    // avenue trees, bus shelters, streetlamps & roadside carts along roads
    for (let ri = 0; ri < tile.roads.length; ri++) {
      const r = tile.roads[ri];
      if (r.cls > 4 || (r.flags & 6) || r.total < 32) continue;
      const p = r.p, off = ROAD_W[r.cls] / 2 + 3.5;
      for (let k = 2; k < p.length; k += 2) {
        const ax = p[k - 2], ay = p[k - 1], bx = p[k], by = p[k + 1];
        const seg = Math.hypot(bx - ax, by - ay);
        if (seg < 24) continue;
        const nx = -(by - ay) / seg, ny = (bx - ax) / seg;
        if (r.cls <= 3) {
          const nTrees = Math.min(4, Math.floor(seg / 42));
          for (let m = 1; m <= nTrees; m++) {
            const h = hash2(ri * 17 + k, m + tile.key, 19);
            if (h > 0.55) continue;
            const f = m / (nTrees + 1);
            const side = h < 0.27 ? 1 : -1;
            const tx = ax + (bx - ax) * f + nx * off * side;
            const ty = ay + (by - ay) * f + ny * off * side;
            if (tx < ox || tx >= ox + TILE || ty < oy || ty >= oy + TILE) continue;
            if (this.city.areaAt(tx, ty) === A_WATER || this.clearedProp(tx, ty)) continue;
            out.push({ y: ty, kind: 0, x: tx, v: ((h * 12) | 0) % 7 });
          }
        }
        // roadside props at segment midpoint (bus shelter, streetlamp, or pushcart)
        const mh = hash2(ri * 31 + k, tile.key, 43);
        if (seg >= 34 && mh < 0.34) {
          const side = mh < 0.17 ? 1 : -1;
          const px = (ax + bx) * 0.5 + nx * (ROAD_W[r.cls] / 2 + 2.2) * side;
          const py = (ay + by) * 0.5 + ny * (ROAD_W[r.cls] / 2 + 2.2) * side;
          if (px >= ox && px < ox + TILE && py >= oy && py < oy + TILE && this.city.areaAt(px, py) !== A_WATER && !this.clearedProp(px, py)) {
            if (r.cls <= 2 && mh < 0.08) out.push({ y: py, kind: 2, x: px, v: ((mh * 40) | 0) % 3 });
            else if (r.cls <= 2 && mh < 0.26) out.push({ y: py, kind: 4, x: px, v: 0 });
            else if (r.cls >= 3 && mh < 0.14) out.push({ y: py, kind: 3, x: px, v: ((mh * 50) | 0) % 4 });
          }
        }
      }
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /** Ground of one tile at S art pixels per metre. */
  private paintGround(c: DetailChunk, S: number): HTMLCanvasElement {
    this.bakes++;
    const city = this.city;
    const cv = mkCanvas(TILE * S, (TILE / 2) * S);
    const ctx = cv.getContext('2d')!;
    const ox = c.tx * TILE, oy = c.ty * TILE;
    ctx.setTransform(S, 0, 0, 0.5 * S, -ox * S, -oy * 0.5 * S);
    paintLand(ctx, city, ox, oy, ox + TILE, oy + TILE, true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = noisePat!;
    ctx.fillRect(0, 0, TILE * S, (TILE / 2) * S);
    ctx.setTransform(S, 0, 0, 0.5 * S, -ox * S, -oy * 0.5 * S);
    // railways
    ctx.lineCap = 'butt';
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (const r of city.rail) polyPath(ctx, r);
      ctx.strokeStyle = pass ? '#cfc9bd' : '#6b6258';
      ctx.lineWidth = pass ? 1.2 : 4.5;
      ctx.setLineDash(pass ? [4, 5] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // roads from this tile and its neighbours so strokes meet without seams
    const byClass: Float32Array[][] = [[], [], [], [], [], [], []];
    const bridges: [number, Float32Array][] = [];
    const near = (x: number, y: number) => x > ox - 24 && x < ox + TILE + 24 && y > oy - 24 && y < oy + TILE + 24;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = city.tile(c.tx + dx, c.ty + dy);
        if (!t) continue;
        for (const r of t.roads) {
          if (r.flags & 4) continue;
          const p = r.p;
          if ((dx || dy) && !near(p[0], p[1]) && !near(p[p.length - 2], p[p.length - 1])) continue;
          if (r.flags & 2) bridges.push([r.cls, p]); else byClass[r.cls].push(p);
        }
      }
    }
    const stroke = (list: Float32Array[], w: number, col: string) => {
      if (!list.length) return;
      ctx.beginPath();
      for (const p of list) polyPath(ctx, p);
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
    };
    for (let k = 6; k >= 0; k--) stroke(byClass[k], ROAD_W[k] + 2.6, k <= 2 ? '#c4baaa' : '#b3a998');
    if (S > 1) for (let k = 6; k >= 0; k--) stroke(byClass[k], ROAD_W[k] + 0.7, '#3c3b44'); // kerb shadow
    for (let k = 6; k >= 0; k--) stroke(byClass[k], ROAD_W[k], ASPHALT[k]);
    // weathered lane patches on minor Old City & residential streets
    ctx.setLineDash([2, 8]);
    stroke(byClass[5], 1.6, 'rgba(130,122,110,0.28)');
    stroke(byClass[6], 1.2, 'rgba(142,130,114,0.32)');
    ctx.setLineDash([]);
    // highway green median + crisp white shoulders
    if (byClass[0].length) {
      stroke(byClass[0], ROAD_W[0] - 1.2, 'rgba(236,232,220,0.35)');
      stroke(byClass[0], ROAD_W[0] - 2.1, ASPHALT[0]);
      stroke(byClass[0], 1.8, '#5a9a48');
    }
    // arterial white lane markings & yellow centerlines
    for (const k of [1, 2]) {
      if (!byClass[k].length) continue;
      stroke(byClass[k], ROAD_W[k] - 1.1, 'rgba(240,236,222,0.3)');
      stroke(byClass[k], ROAD_W[k] - 1.8, ASPHALT[k]);
      ctx.setLineDash([4, 6]);
      stroke(byClass[k], ROAD_W[k] * 0.52, 'rgba(240,236,222,0.42)');
      ctx.setLineDash([]);
      stroke(byClass[k], k === 1 ? 1.5 : S > 1 ? 0.55 : 0.85, '#d8b84a');
      if (k === 1) stroke(byClass[k], 0.5, '#595860');
    }
    stroke(byClass[3], S > 1 ? 0.45 : 0.8, '#d8b84a');
    ctx.setLineDash([5, 7]);
    stroke(byClass[4], S > 1 ? 0.4 : 0.7, '#cfcab8');
    if (S > 1) { ctx.setLineDash([3, 6]); stroke(byClass[5], 0.3, 'rgba(225,220,205,0.5)'); }
    ctx.setLineDash([]);
    // yellow-black speed breakers on connector & local streets
    for (const k of [3, 4]) {
      for (let i = 0; i < byClass[k].length; i++) {
        if (hash2(i, c.key, 51 + k) > 0.28) continue;
        const p = byClass[k][i];
        if (p.length < 4) continue;
        const mx = (p[0] + p[2]) * 0.5, my = (p[1] + p[3]) * 0.5;
        const ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
        const nx = -Math.sin(ang) * (ROAD_W[k] * 0.42), ny = Math.cos(ang) * (ROAD_W[k] * 0.42);
        ctx.strokeStyle = '#f0b828';
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(mx - nx, my - ny); ctx.lineTo(mx + nx, my + ny); ctx.stroke();
      }
    }
    for (const [k, p] of bridges) stroke([p], ROAD_W[k] + 4, '#d6d0c2');
    for (const [k, p] of bridges) stroke([p], ROAD_W[k], ASPHALT[k]);
    for (const [k, p] of bridges) if (k <= 3) stroke([p], 0.6, '#d8b84a');
    // elevated metro viaducts
    // shadow of the elevated metro; the viaduct itself is drawn above the buildings
    for (const m of city.metro) stroke([m.p], 7, 'rgba(30,24,40,0.2)');
    // runways
    for (const r of city.runways) { stroke([r], 58, '#4f5057'); ctx.setLineDash([30, 30]); stroke([r], 2, '#e8e4d0'); ctx.setLineDash([]); }
    return cv;
  }

  private structCanvas(c: DetailChunk, S = 1): [HTMLCanvasElement, number, number] {
    let x0 = c.tx * TILE - 40, x1 = (c.tx + 1) * TILE + 40;
    let y0 = (c.ty * TILE) / 2 - c.tile.maxH - 16, y1 = ((c.ty + 1) * TILE) / 2 + 12;
    for (const e of c.extras) {
      if (e.kind !== 1) continue;
      const p = e.place!, sp = spriteFor(p.sprite!), s = p.scale ?? 1;
      const ax = sp.ox + (sp.fw - sp.fd) * 8, ay = sp.oy + (sp.fw + sp.fd) * 4;
      x0 = Math.min(x0, p.x - ax * s - 2); x1 = Math.max(x1, p.x + (sp.c.width - ax) * s + 2);
      y0 = Math.min(y0, p.y / 2 - ay * s - 2); y1 = Math.max(y1, p.y / 2 + (sp.c.height - ay) * s + 2);
    }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    return [mkCanvas(Math.ceil(x1 - x0) * S, Math.ceil(y1 - y0) * S), x0, y0];
  }

  private drawExtra(ctx: Ctx, e: Extra, ox: number, oy: number, lights: boolean) {
    if (e.kind === 0) {
      if (!lights) ctx.drawImage(treeSheet!, e.v * TREE_W, 0, TREE_W, TREE_H, Math.round(e.x - ox - 5), Math.round(e.y / 2 - oy - 13), TREE_W, TREE_H);
      return;
    }
    const sx = Math.round(e.x - ox), sy = Math.round(e.y / 2 - oy);
    if (e.kind === 2) {
      // TSRTC bus shelter
      if (lights) {
        ctx.fillStyle = 'rgba(220,245,255,0.65)';
        ctx.fillRect(sx - 3, sy - 4, 6, 2);
        return;
      }
      ctx.fillStyle = '#2a1f3a'; ctx.fillRect(sx - 4, sy - 5, 8, 5);
      ctx.fillStyle = e.v === 1 ? '#34a86e' : '#1f8a8a'; ctx.fillRect(sx - 4, sy - 6, 8, 2);
      ctx.fillStyle = '#f6ecd2'; ctx.fillRect(sx - 3, sy - 4, 6, 2);
      ctx.fillStyle = '#5a4a6a'; ctx.fillRect(sx - 3, sy - 2, 1, 2); ctx.fillRect(sx + 2, sy - 2, 1, 2);
      return;
    }
    if (e.kind === 3) {
      // roadside pushcart / fruit & chai bandi
      if (lights) {
        ctx.fillStyle = 'rgba(255,210,115,0.65)';
        ctx.fillRect(sx - 2, sy - 4, 4, 2);
        return;
      }
      const cols = ['#d8433b', '#f0a030', '#3aa657', '#3b78d8'];
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(sx - 3, sy - 2, 6, 2);
      ctx.fillStyle = '#222026'; ctx.fillRect(sx - 2, sy, 1, 1); ctx.fillRect(sx + 1, sy, 1, 1);
      ctx.fillStyle = cols[e.v % cols.length]; ctx.fillRect(sx - 3, sy - 5, 6, 2);
      ctx.fillStyle = '#f6ecd2'; ctx.fillRect(sx - 1, sy - 5, 2, 1);
      return;
    }
    if (e.kind === 4) {
      // boulevard streetlamp post
      if (lights) {
        ctx.fillStyle = '#ffe5a3';
        ctx.fillRect(sx - 1, sy - 9, 3, 2);
        return;
      }
      ctx.fillStyle = '#363642'; ctx.fillRect(sx, sy - 9, 1, 9);
      ctx.fillStyle = '#4e4e5c'; ctx.fillRect(sx - 1, sy - 9, 3, 1);
      return;
    }
    const p = e.place!, sp = spriteFor(p.sprite!), s = p.scale ?? 1;
    const src = lights ? sp.l : sp.c;
    if (!src) return;
    const ax = sp.ox + (sp.fw - sp.fd) * 8, ay = sp.oy + (sp.fw + sp.fd) * 4;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, Math.round(p.x - ox - ax * s), Math.round(p.y / 2 - oy - ay * s), sp.c.width * s, sp.c.height * s);
  }

  private drawBuilding(ctx: Ctx, t: Tile, i: number, ox: number, oy: number, lights: boolean, hi = false) {
    const n = t.bN[i], h = t.bH[i], kind = t.bKind[i], off = t.bOff[i], v = t.verts;
    const hv = hash2(i, t.key, 3);
    const set = PALS[kind] ?? PALS[0];
    const pl = set[(hv * set.length) | 0];
    let cx = 0, cy = 0, minX = Infinity, maxX = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = off + k * 2, b = off + ((k + 1) % n) * 2;
      const ax = v[a] - ox, ay = v[a + 1] / 2 - oy, bx = v[b] - ox, by = v[b + 1] / 2 - oy;
      cx += ax; cy += ay;
      if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
      const dx = bx - ax;
      if (dx > -0.4) continue; // only south-facing walls are visible
      if (!lights && h >= 5) {
        // subtle SE ground shadow strip so buildings sit solidly on the street
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.lineTo(bx + 2, by + 1.2); ctx.lineTo(ax + 2, ay + 1.2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(26,20,36,0.16)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by - h); ctx.lineTo(ax, ay - h);
      if (lights) {
        if (h >= 6 && dx < -3) { ctx.fillStyle = kind === B_GLASS ? litCool! : litPat!; ctx.fill(); }
        if ((kind === B_COMMERCIAL || (kind === B_HOUSE && hv < 0.35)) && dx < -4) {
          ctx.fillStyle = 'rgba(255,205,120,0.35)';
          ctx.fillRect(Math.round((ax + bx) / 2 - 2), Math.round((ay + by) / 2 - 2), 4, 2);
        }
        continue;
      }
      const sl = (by - ay) / -dx;
      ctx.fillStyle = sl > 0.22 ? pl[3] : sl < -0.22 ? pl[1] : pl[2];
      ctx.fill();
      if (kind === B_GLASS) { ctx.fillStyle = hi ? bandPatH! : bandPat!; ctx.fill(); }
      else if (h >= (hi ? 6 : 9) && dx < (hi ? -3 : -4) && kind !== B_INDUSTRIAL && kind !== B_SHED) { ctx.fillStyle = hi ? winPatH! : winPat!; ctx.fill(); }
    }
    cx /= n; cy /= n;
    if (lights) {
      if (h < 6 && hv < 0.55) { ctx.fillStyle = '#ffd58a'; ctx.fillRect(Math.round(cx), Math.round(cy + 1), 2, 1); }
      if (h > 60) { ctx.fillStyle = '#ff4030'; ctx.fillRect(Math.round(cx), Math.round(cy - h - 2), 2, 2); }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(v[off] - ox, v[off + 1] / 2 - oy - h);
    for (let k = 1; k < n; k++) ctx.lineTo(v[off + k * 2] - ox, v[off + k * 2 + 1] / 2 - oy - h);
    ctx.closePath();
    ctx.fillStyle = pl[0];
    ctx.fill();
    const w = maxX - minX;
    if (hi) {
      // parapet line, and the rooftop clutter every Hyderabad terrace has
      ctx.lineWidth = 0.5; ctx.strokeStyle = shade(pl[0], 0.8); ctx.stroke();
      if (w > 6 && kind !== B_INDUSTRIAL && kind !== B_SHED && kind !== B_RELIGIOUS) {
        const tx = Math.round((cx + (hv - 0.5) * w * 0.4) * 2) / 2, ty = Math.round((cy - h) * 2) / 2;
        if (hv < 0.72) {
          // iconic blue Syntex or dark rooftop water tank
          const blueTank = hv > 0.28;
          ctx.fillStyle = blueTank ? '#1b649c' : '#1e1e24'; ctx.fillRect(tx, ty - 0.5, 1.5, 1.5);
          ctx.fillStyle = blueTank ? '#4ea2e0' : '#50505c'; ctx.fillRect(tx, ty - 0.5, 1.5, 0.5);
        }
        if (w > 11 && hv > 0.3) { ctx.fillStyle = shade(pl[0], 1.06); ctx.fillRect(tx - 3.5, ty - 1.5, 2.5, 2); ctx.fillStyle = shade(pl[0], 0.72); ctx.fillRect(tx - 3.5, ty + 0.5, 2.5, 0.5); }
        if (kind === B_GLASS || kind === B_APART || h > 22) {
          // rooftop solar array or HVAC units
          const solar = hv > 0.55;
          ctx.fillStyle = solar ? '#224a78' : '#9aa4ac'; ctx.fillRect(tx + 2.5, ty - 1, 2.5, 1.5);
          ctx.fillStyle = solar ? '#cfd8e0' : '#6c757c'; ctx.fillRect(tx + 2.5, ty + 0.5, 2.5, 0.5);
        }
        if ((kind === B_HOUSE || kind === B_APART) && w > 10 && hv > 0.75) {
          // colourful terrace laundry or potted greens
          ctx.fillStyle = '#e25548'; ctx.fillRect(tx - 1.5, ty - 2, 1, 1);
          ctx.fillStyle = '#5ab868'; ctx.fillRect(tx - 0.5, ty - 2, 1, 1);
        }
      }
    }
    if (kind === B_RELIGIOUS && w > 7) {
      const r = Math.min(7, w * 0.22);
      ctx.fillStyle = hv < 0.5 ? '#5fa48a' : '#f6f4ee';
      ctx.beginPath(); ctx.arc(cx, cy - h, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#d9b24a'; ctx.fillRect(Math.round(cx), Math.round(cy - h - r - 2), 1, 2);
    } else if (!hi && w > 9 && hv < 0.55 && kind !== B_INDUSTRIAL) {
      ctx.fillStyle = hv < 0.22 ? '#1f6da8' : hv < 0.35 ? '#3a3a44' : shade(pl[0], 0.86);
      ctx.fillRect(Math.round(cx + (hv - 0.25) * w * 0.6), Math.round(cy - h - 1), 2, 2);
    }
    void B_COMMERCIAL; void B_CIVIC; void B_APART; void B_HOUSE;
  }

  /** Advance the building bake of a chunk within the frame budget. */
  bakeStructs(c: DetailChunk): void {
    const t = c.tile;
    if (c.bi >= t.nb && c.ei >= c.extras.length) return;
    if (!this.timeLeft()) return;
    if (!c.s) { [c.s, c.sx, c.sy] = this.structCanvas(c); c.sctx = c.s.getContext('2d')!; this.bakes++; }
    const ctx = c.sctx!;
    for (let guard = 0; ; guard++) {
      const nextB = c.bi < t.nb ? t.bMaxY[c.bi] : Infinity;
      const nextE = c.ei < c.extras.length ? c.extras[c.ei].y : Infinity;
      if (nextB === Infinity && nextE === Infinity) { c.sctx = null; break; }
      if (nextE <= nextB) this.drawExtra(ctx, c.extras[c.ei++], c.sx, c.sy, false);
      else { const bi = c.bi++; if (!this.clearedBuilding(t, bi)) this.drawBuilding(ctx, t, bi, c.sx, c.sy, false); }
      if ((guard & 31) === 31 && !this.timeLeft()) break;
    }
  }
  structsDone(c: DetailChunk) { return c.bi >= c.tile.nb && c.ei >= c.extras.length; }

  /**
   * Advance the close-up layers of a chunk. The ground is one big paint, so it
   * only happens while the view is `still`; buildings go in time-boxed slices.
   */
  bakeHi(c: DetailChunk, still: boolean): void {
    c.hused = this.frame;
    if (!this.timeLeft()) return;
    if (!c.hg) { if (still) c.hg = this.paintGround(c, HI); return; }
    const t = c.tile;
    if (c.hbi >= t.nb && c.hei >= c.extras.length) return;
    if (!c.hs) {
      c.hs = this.structCanvas(c, HI)[0];
      c.hctx = c.hs.getContext('2d')!;
      c.hctx.scale(HI, HI);
      this.bakes++;
    }
    const ctx = c.hctx!;
    for (let guard = 0; ; guard++) {
      const nextB = c.hbi < t.nb ? t.bMaxY[c.hbi] : Infinity;
      const nextE = c.hei < c.extras.length ? c.extras[c.hei].y : Infinity;
      if (nextB === Infinity && nextE === Infinity) { c.hctx = null; break; }
      if (nextE <= nextB) this.drawExtra(ctx, c.extras[c.hei++], c.sx, c.sy, false);
      else { const bi = c.hbi++; if (!this.clearedBuilding(t, bi)) this.drawBuilding(ctx, t, bi, c.sx, c.sy, false, true); }
      if ((guard & 15) === 15 && !this.timeLeft()) break;
    }
  }
  hiDone(c: DetailChunk) { return !!c.hs && c.hbi >= c.tile.nb && c.hei >= c.extras.length; }
  private dropHi(c: DetailChunk) {
    for (const cv of [c.hg, c.hs]) if (cv) { cv.width = 0; cv.height = 0; }
    c.hg = c.hs = c.hctx = null; c.hbi = c.hei = 0;
  }
  /** Keep at most `cap` chunks' close-up layers, most recently used first. */
  evictHi(cap: number) {
    const all: DetailChunk[] = [];
    for (const c of this.detail.values()) if (c.hg || c.hs) all.push(c);
    if (all.length <= cap) return;
    all.sort((a, b) => a.hused - b.hused);
    for (let i = 0; i < all.length - cap; i++) this.dropHi(all[i]);
  }

  /** Footprints of a tile grouped by zone, in world pixels, for the zones view. */
  zonePaths(t: Tile): Path2D[] {
    let p = this.zoneCache.get(t);
    if (p) return p;
    p = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const zone = tileInfo(this.city, t).zone, v = t.verts;
    for (let i = 0; i < t.nb; i++) {
      const off = t.bOff[i], n = t.bN[i], path = p[zone[i]];
      path.moveTo(v[off], v[off + 1] / 2);
      for (let k = 1; k < n; k++) path.lineTo(v[off + k * 2], v[off + k * 2 + 1] / 2);
      path.closePath();
    }
    this.zoneCache.set(t, p);
    return p;
  }
  private zoneCache = new WeakMap<Tile, Path2D[]>();

  bakeLights(c: DetailChunk): void {
    const t = c.tile;
    if (!c.s || (c.li >= t.nb && c.lei >= c.extras.length) || !this.timeLeft()) return;
    if (!c.l) {
      c.l = mkCanvas(c.s.width, c.s.height); c.lctx = c.l.getContext('2d')!; this.bakes++;
      // street lamps: warm dots strung along the roads
      const g = c.lctx;
      g.setTransform(1, 0, 0, 0.5, -c.sx, -c.sy);
      g.lineCap = 'round';
      for (const [maxCls, dash, w, col] of [[4, 26, 3.4, '#ffcf8a'], [5, 34, 2.4, '#e0a860']] as const) {
        g.beginPath();
        for (const r of t.roads) if ((maxCls === 4 ? r.cls <= 4 : r.cls === 5) && !(r.flags & 4)) polyPath(g, r.p);
        g.setLineDash([0.1, dash]); g.lineWidth = w; g.strokeStyle = col; g.stroke();
      }
      g.setLineDash([]);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    const ctx = c.lctx!;
    for (let guard = 0; ; guard++) {
      if (c.li < t.nb) { const li = c.li++; if (!this.clearedBuilding(t, li)) this.drawBuilding(ctx, t, li, c.sx, c.sy, true); }
      else if (c.lei < c.extras.length) this.drawExtra(ctx, c.extras[c.lei++], c.sx, c.sy, true);
      else { c.lctx = null; break; }
      if ((guard & 63) === 63 && !this.timeLeft()) break;
    }
  }

  private dropDetail(key: number) {
    const c = this.detail.get(key);
    if (!c) return;
    for (const cv of [c.g, c.s, c.l, c.hg, c.hs]) if (cv) { cv.width = 0; cv.height = 0; }
    this.detail.delete(key);
  }

  // ------------------------------------------------------------ coarse
  getCoarse(cx: number, cy: number): CoarseChunk | null {
    const key = cy * 100 + cx;
    let c = this.coarse.get(key);
    if (c) { c.used = this.frame; return c; }
    if (!this.timeLeft()) return null;
    this.bakes++;
    const city = this.city;
    const W = COARSE / COARSE_S, H = COARSE / COARSE_S / 2;
    const cv = mkCanvas(W, H + COARSE_PAD), lv = mkCanvas(W, H + COARSE_PAD);
    const ctx = cv.getContext('2d')!, lx = lv.getContext('2d')!;
    const ox = cx * COARSE, oy = cy * COARSE;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, COARSE_PAD, W, H); ctx.clip();
    ctx.setTransform(1 / COARSE_S, 0, 0, 0.5 / COARSE_S, -ox / COARSE_S, COARSE_PAD - (oy * 0.5) / COARSE_S);
    paintLand(ctx, city, ox, oy, ox + COARSE, oy + COARSE, false);
    this.paintMajor(ctx, ox - 64, oy - 64, ox + COARSE + 64, oy + COARSE + 64, 1.7);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.paintBlocks(ctx, lx, Math.floor(ox / CELL), Math.floor(oy / CELL), COARSE / CELL, CELL / COARSE_S, COARSE_PAD, 1.3);
    c = { cx, cy, c: cv, l: lv, used: this.frame };
    this.coarse.set(key, c);
    return c;
  }

  /** Major roads, rail and metro in city metres. */
  private paintMajor(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, widen: number, maxCls = 4) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const byClass: Float32Array[][] = [[], [], [], [], []];
    for (const r of this.city.majorIn(x0, y0, x1, y1)) if (r.cls <= maxCls) byClass[r.cls].push(r.p);
    for (let k = maxCls; k >= 0; k--) {
      if (!byClass[k].length) continue;
      ctx.beginPath();
      for (const p of byClass[k]) polyPath(ctx, p);
      ctx.lineWidth = ROAD_W[k] * widen; ctx.strokeStyle = k <= 1 ? '#5b5a66' : '#6a6970';
      ctx.stroke();
    }
    ctx.beginPath();
    for (const r of this.city.rail) polyPath(ctx, r);
    ctx.lineWidth = 5 * widen; ctx.strokeStyle = '#6b6258'; ctx.stroke();
    for (const m of this.city.metro) {
      ctx.beginPath(); polyPath(ctx, m.p);
      ctx.lineWidth = 9 * widen; ctx.strokeStyle = m.color; ctx.stroke();
    }
  }

  /** Little extruded blocks from the height grid. `px` = pixels per cell in x. */
  private paintBlocks(ctx: Ctx, lx: Ctx | null, gx0: number, gy0: number, n: number, px: number, pad: number, zk: number) {
    const { gridH, gridC } = this.city;
    const py = px / 2;
    for (let j = 0; j < n; j++) {
      const gy = gy0 + j;
      if (gy < 0 || gy >= GH) continue;
      for (let i = 0; i < n; i++) {
        const gx = gx0 + i;
        if (gx < 0 || gx >= GW) continue;
        const h = gridH[gy * GW + gx];
        if (!h) continue;
        const s = Math.sqrt(gridC[gy * GW + gx] / 255);
        const bw = Math.max(1, Math.round(px * s)), bd = Math.max(1, Math.round(py * s));
        const hh = Math.max(1, Math.round((h * zk) / (CELL / px)));
        const x = Math.round(i * px + (px - bw) / 2), y = Math.round(pad + j * py + (py - bd) / 2);
        const hv = hash2(gx, gy, 5);
        const set = h > 30 ? PALS[B_GLASS] : hv < 0.5 ? PALS[B_HOUSE] : PALS[B_APART];
        const pl = set[(hv * 7919) % set.length | 0];
        ctx.fillStyle = pl[3];
        ctx.fillRect(x, y + bd - hh, bw, hh);
        ctx.fillStyle = pl[0];
        ctx.fillRect(x, y - hh, bw, bd);
        if (lx && hv < 0.6) {
          lx.fillStyle = h > 30 ? '#9fd0ee' : hv < 0.3 ? '#ffd58a' : '#f0b060';
          lx.fillRect(x + ((hv * 97) % bw | 0), y + bd - 1 - ((hv * 31) % hh | 0), 1, 1);
          if (h > 22) lx.fillRect(x, y + bd - 1 - ((hv * 53) % hh | 0), Math.max(1, bw - 1), 1);
        }
      }
    }
  }

  /** Whole-city overview, built once at boot. */
  async buildOverview(onProgress: (f: number) => void) {
    const W = Math.ceil(CITY_W / OV_S), H = Math.ceil(CITY_H / OV_S / 2);
    const cv = mkCanvas(W, H), nv = mkCanvas(W, H);
    const ctx = cv.getContext('2d')!, nx = nv.getContext('2d')!;
    // yield with a timer, not rAF: rAF stalls in background tabs and would hang the boot
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    ctx.setTransform(1 / OV_S, 0, 0, 0.5 / OV_S, 0, 0);
    paintLand(ctx, this.city, 0, 0, CITY_W, CITY_H, false);
    onProgress(0.4); await tick();
    this.paintMajor(ctx, 0, 0, CITY_W, CITY_H, 2.6, 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    onProgress(0.6); await tick();
    const rows = 4;
    for (let k = 0; k < rows; k++) {
      // bands, so the progress bar keeps moving
      const j0 = Math.floor((GH * k) / rows), j1 = Math.floor((GH * (k + 1)) / rows);
      this.paintBand(ctx, nx, j0, j1);
      onProgress(0.6 + (0.4 * (k + 1)) / rows); await tick();
    }
    this.overview = cv; this.overviewNight = nv;
  }
  private paintBand(ctx: Ctx, nx: Ctx, j0: number, j1: number) {
    const { gridH, gridC } = this.city;
    const px = CELL / OV_S;
    for (let gy = j0; gy < j1; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const h = gridH[gy * GW + gx];
        if (!h) continue;
        const c = gridC[gy * GW + gx];
        const hv = hash2(gx, gy, 5);
        if (c < 60 && hv > c / 60) continue;
        const set = h > 30 ? PALS[B_GLASS] : hv < 0.5 ? PALS[B_HOUSE] : PALS[B_APART];
        const pl = set[(hv * 7919) % set.length | 0];
        const hh = Math.max(1, Math.round(h / 14));
        const x = gx * px, y = Math.round((gy * px) / 2);
        ctx.fillStyle = pl[3]; ctx.fillRect(x, y, px, 1);
        ctx.fillStyle = pl[0]; ctx.fillRect(x, y - hh, px, hh);
        if (hv < 0.45) { nx.fillStyle = h > 30 ? '#9fd0ee' : '#ffc878'; nx.fillRect(x + (hv < 0.2 ? 1 : 0), y - (hv < 0.1 ? hh : 0), 1, 1); }
      }
    }
  }

  // ------------------------------------------------------------ overlay rasters
  private rasters = new Map<string, HTMLCanvasElement>();
  /** Pre-rendered data map (density or land use) covering the whole city. */
  raster(mode: 'density' | 'landuse' | 'zones'): HTMLCanvasElement {
    let cv = this.rasters.get(mode);
    if (cv) return cv;
    if (mode === 'density') {
      cv = mkCanvas(GW, GH);
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(GW, GH);
      const { gridH, gridC } = this.city;
      const ramp = [[60, 90, 160], [70, 170, 190], [120, 210, 120], [240, 220, 90], [245, 150, 60], [230, 70, 70]];
      for (let i = 0; i < GW * GH; i++) {
        const h = gridH[i];
        if (!h) continue;
        // floor area ratio-ish: coverage x storeys
        const d = Math.min(0.999, ((gridC[i] / 255) * (h / 3.2)) / 6);
        const r = ramp[(d * ramp.length) | 0];
        img.data[i * 4] = r[0]; img.data[i * 4 + 1] = r[1]; img.data[i * 4 + 2] = r[2]; img.data[i * 4 + 3] = 235;
      }
      ctx.putImageData(img, 0, 0);
    } else {
      cv = mkCanvas(Math.ceil(CITY_W / OV_S), Math.ceil(CITY_H / OV_S / 2));
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(1 / OV_S, 0, 0, 0.5 / OV_S, 0, 0);
      for (const a of this.city.areas) {
        const col = mode === 'zones' ? (a.kind === A_RES ? ZONE_COL[0] : a.kind === A_COM ? ZONE_COL[1] : a.kind === A_IND ? ZONE_COL[2] : undefined) : LANDUSE_COL[a.kind];
        if (!col) continue;
        ctx.beginPath(); polyPath(ctx, a.p); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
    }
    this.rasters.set(mode, cv);
    return cv;
  }

  /** Per-class road paths of a tile in world px, for the road overlays. */
  roadPaths(t: Tile): Path2D[] {
    if (t.paths) return t.paths;
    const paths: Path2D[] = [];
    for (let k = 0; k < 7; k++) paths.push(new Path2D());
    for (const r of t.roads) {
      const p = r.p, path = paths[r.cls];
      path.moveTo(p[0], p[1] / 2);
      for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1] / 2);
    }
    t.paths = paths;
    return paths;
  }
  private majorPaths = new Map<number, Path2D[]>();
  /** Per-class major-road paths for a 4 km cell, world px. */
  majorPathsFor(cx: number, cy: number): Path2D[] {
    const key = cy * 100 + cx;
    let paths = this.majorPaths.get(key);
    if (paths) return paths;
    paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const x0 = cx * COARSE, y0 = cy * COARSE;
    for (const r of this.city.majorIn(x0, y0, x0 + COARSE, y0 + COARSE)) {
      // each road belongs to the cell holding its first point, so it is stroked once
      if (Math.floor(r.p[0] / COARSE) !== cx || Math.floor(r.p[1] / COARSE) !== cy) continue;
      const p = r.p, path = paths[r.cls];
      path.moveTo(p[0], p[1] / 2);
      for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1] / 2);
    }
    this.majorPaths.set(key, paths);
    return paths;
  }

  evict(detailCap: number, coarseCap: number) {
    if (this.detail.size > detailCap) {
      const all = [...this.detail.values()].sort((a, b) => a.used - b.used);
      for (let i = 0; i < all.length - detailCap; i++) this.dropDetail(all[i].key);
    }
    if (this.coarse.size > coarseCap) {
      const all = [...this.coarse.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < all.length - coarseCap; i++) { all[i][1].c.width = 0; all[i][1].l.width = 0; this.coarse.delete(all[i][0]); }
    }
  }
  dropAll() { for (const k of [...this.detail.keys()]) this.dropDetail(k); this.evict(0, 0); }
}

export const LANDUSE_COL: (string | undefined)[] = [];
LANDUSE_COL[A_RES] = 'rgba(245,205,90,0.82)'; LANDUSE_COL[A_COM] = 'rgba(90,150,240,0.85)'; LANDUSE_COL[A_IND] = 'rgba(190,110,220,0.85)';
LANDUSE_COL[A_PARK] = 'rgba(90,200,110,0.85)'; LANDUSE_COL[A_FOREST] = 'rgba(50,150,80,0.85)'; LANDUSE_COL[A_FARM] = 'rgba(170,200,90,0.6)';
LANDUSE_COL[A_MIL] = 'rgba(200,90,80,0.7)'; LANDUSE_COL[A_WATER] = 'rgba(70,170,230,0.9)'; LANDUSE_COL[A_APRON] = 'rgba(200,200,210,0.8)';
void TY;
