// Runtime access to the real-geography map produced by scripts/build-map.mjs.
// city.json and grid.bin load once at boot; one-square-km tiles (building
// footprints + roads) stream in on demand and are evicted LRU.
import { TILE, TX, TY, Q, GW, GH } from './geo';
import type { PlaceDef } from './places';

export interface Place extends Omit<PlaceDef, 'lat' | 'lon' | 'match'> { i: number; x: number; y: number }
export interface Area { kind: number; p: Float32Array; x0: number; y0: number; x1: number; y1: number }
export interface Line { cls: number; p: Float32Array; x0: number; y0: number; x1: number; y1: number }
export interface MetroLine { name: string; color: string; p: Float32Array; len: Float32Array; total: number; stations: { name: string; x: number; y: number; s: number }[] }
export interface Road { cls: number; flags: number; p: Float32Array; len: Float32Array; total: number }
export interface Tile {
  tx: number; ty: number; key: number;
  nb: number;
  bN: Uint8Array; bH: Uint8Array; bKind: Uint8Array; bOff: Uint32Array; bMaxY: Float32Array;
  /** 1 where the footprint was generated to fill a gap in the map data. */
  bGen: Uint8Array;
  verts: Float32Array; // absolute city metres
  maxH: number;
  roads: Road[];
  used: number;
  paths: Path2D[] | null; // per road class, world px, built lazily for overlays
  wlen?: number; // road length weighted by how much traffic each class carries
  tlen?: number; // total road length
}

const BUCKET = 2048;
const lengths = (p: Float32Array) => {
  const l = new Float32Array(p.length / 2);
  for (let i = 2; i < p.length; i += 2) l[i / 2] = l[i / 2 - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
};
function bounds<T extends { p: Float32Array; x0: number; y0: number; x1: number; y1: number }>(o: T): T {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < o.p.length; i += 2) {
    const x = o.p[i], y = o.p[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  o.x0 = x0; o.y0 = y0; o.x1 = x1; o.y1 = y1;
  return o;
}

export function decodeTile(buf: ArrayBuffer, tx: number, ty: number): Tile {
  const dv = new DataView(buf);
  const nb = dv.getUint32(0, true), nr = dv.getUint32(4, true);
  const ox = tx * TILE, oy = ty * TILE;
  const bN = new Uint8Array(nb), bH = new Uint8Array(nb), bKind = new Uint8Array(nb), bGen = new Uint8Array(nb), bOff = new Uint32Array(nb), bMaxY = new Float32Array(nb);
  const verts: number[] = [];
  let o = 8, maxH = 0;
  for (let i = 0; i < nb; i++) {
    const n = dv.getUint8(o), h = dv.getUint8(o + 1);
    bN[i] = n; bH[i] = h; bKind[i] = dv.getUint8(o + 2) & 63; bGen[i] = dv.getUint8(o + 2) >> 6 & 1; bOff[i] = verts.length;
    if (h > maxH) maxH = h;
    o += 3;
    let my = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = ox + dv.getInt16(o, true) / Q, y = oy + dv.getInt16(o + 2, true) / Q;
      verts.push(x, y);
      if (y > my) my = y;
      o += 4;
    }
    bMaxY[i] = my;
  }
  const roads: Road[] = [];
  for (let i = 0; i < nr; i++) {
    const cls = dv.getUint8(o), flags = dv.getUint8(o + 1), n = dv.getUint16(o + 2, true);
    o += 4;
    const p = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { p[k * 2] = ox + dv.getInt16(o, true) / Q; p[k * 2 + 1] = oy + dv.getInt16(o + 2, true) / Q; o += 4; }
    const len = lengths(p);
    roads.push({ cls, flags, p, len, total: len[len.length - 1] });
  }
  return { tx, ty, key: ty * TX + tx, nb, bN, bH, bKind, bGen, bOff, bMaxY, verts: new Float32Array(verts), maxH, roads, used: 0, paths: null };
}

export class City {
  places: Place[] = [];
  areas: Area[] = [];
  waterLines: { w: number; p: Float32Array }[] = [];
  runways: Float32Array[] = [];
  rail: Float32Array[] = [];
  metro: MetroLine[] = [];
  major: Line[] = [];
  suburbs: [string, number, number, number][] = [];
  buildings = 0;
  infill = 0;
  attribution = '';
  gridH = new Uint8Array(GW * GH);
  gridC = new Uint8Array(GW * GH);
  /** buildings per tile; 0xffff = no file */
  tileCount = new Uint16Array(TX * TY).fill(0xffff);
  private tiles = new Map<number, Tile>();
  private pending = new Set<number>();
  private areaBuckets = new Map<number, number[]>();
  private majorBuckets = new Map<number, number[]>();
  private clock = 0;
  onTile: (t: Tile) => void = () => {};
  onEvict: (t: Tile) => void = () => {};
  base = '/map/';
  /** Tiles kept in memory and fetched at once (set from graphics quality). */
  tileCap = 150;
  maxFetch = 8;

  static async load(base = `${import.meta.env.BASE_URL}map/`): Promise<City> {
    const c = new City();
    c.base = base;
    const [json, grid] = await Promise.all([
      fetch(base + 'city.json').then((r) => { if (!r.ok) throw new Error('city.json missing - run "npm run map"'); return r.json(); }),
      fetch(base + 'grid.bin').then((r) => r.arrayBuffer()),
    ]);
    c.ingest(json, new Uint8Array(grid));
    return c;
  }

  ingest(j: any, grid: Uint8Array) {
    this.buildings = j.buildings; this.infill = j.infill ?? 0; this.attribution = j.attribution;
    this.places = j.places.map((p: any, i: number) => ({ ...p, i }));
    this.areas = j.areas.map((a: number[]) => bounds({ kind: a[0], p: Float32Array.from(a.slice(1)), x0: 0, y0: 0, x1: 0, y1: 0 }));
    this.waterLines = j.waterLines.map((a: number[]) => ({ w: a[0], p: Float32Array.from(a.slice(1)) }));
    this.runways = j.runways.map((a: number[]) => Float32Array.from(a));
    this.rail = j.rail.map((a: number[]) => Float32Array.from(a));
    this.major = j.major.map((a: number[]) => bounds({ cls: a[0], p: Float32Array.from(a.slice(1)), x0: 0, y0: 0, x1: 0, y1: 0 }));
    this.suburbs = j.suburbs;
    this.metro = j.metro.map((m: any) => {
      const p = Float32Array.from(m.pts as number[]);
      const len = lengths(p);
      const stations = (m.stations as { name: string; x: number; y: number }[]).map((s) => {
        let bd = Infinity, bs = 0;
        for (let i = 0; i < p.length; i += 2) { const d = Math.hypot(p[i] - s.x, p[i + 1] - s.y); if (d < bd) { bd = d; bs = len[i / 2]; } }
        return { ...s, s: bs };
      }).sort((a, b) => a.s - b.s);
      return { name: m.name, color: m.color, p, len, total: len[len.length - 1], stations };
    });
    for (let i = 0; i < j.tiles.length; i += 3) this.tileCount[j.tiles[i + 1] * TX + j.tiles[i]] = Math.min(0xfffe, j.tiles[i + 2]);
    // grid: zero runs are (0, n); other cells are (height, coverage)
    let o = 0;
    for (let i = 0; i < grid.length; i += 2) {
      if (grid[i] === 0) o += grid[i + 1];
      else { this.gridH[o] = grid[i]; this.gridC[o] = grid[i + 1]; o++; }
    }
    const bucket = (m: Map<number, number[]>, o: { x0: number; y0: number; x1: number; y1: number }, i: number) => {
      for (let by = Math.floor(o.y0 / BUCKET); by <= Math.floor(o.y1 / BUCKET); by++) {
        for (let bx = Math.floor(o.x0 / BUCKET); bx <= Math.floor(o.x1 / BUCKET); bx++) {
          const k = by * 1000 + bx;
          let l = m.get(k);
          if (!l) { l = []; m.set(k, l); }
          l.push(i);
        }
      }
    };
    this.areas.forEach((a, i) => bucket(this.areaBuckets, a, i));
    this.major.forEach((a, i) => bucket(this.majorBuckets, a, i));
  }

  private query(m: Map<number, number[]>, x0: number, y0: number, x1: number, y1: number): number[] {
    const seen = new Set<number>();
    for (let by = Math.floor(y0 / BUCKET); by <= Math.floor(y1 / BUCKET); by++) {
      for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) {
        const l = m.get(by * 1000 + bx);
        if (l) for (const i of l) seen.add(i);
      }
    }
    return [...seen].sort((a, b) => a - b);
  }
  /** Areas (in draw order) whose bounds touch the rectangle, city metres. */
  areasIn(x0: number, y0: number, x1: number, y1: number): Area[] {
    return this.query(this.areaBuckets, x0, y0, x1, y1).map((i) => this.areas[i]).filter((a) => a.x1 >= x0 && a.x0 <= x1 && a.y1 >= y0 && a.y0 <= y1);
  }
  majorIn(x0: number, y0: number, x1: number, y1: number): Line[] {
    return this.query(this.majorBuckets, x0, y0, x1, y1).map((i) => this.major[i]).filter((a) => a.x1 >= x0 && a.x0 <= x1 && a.y1 >= y0 && a.y0 <= y1);
  }
  /** Kind of the top-most area at a point, or -1. */
  areaAt(x: number, y: number): number {
    const l = this.areaBuckets.get(Math.floor(y / BUCKET) * 1000 + Math.floor(x / BUCKET));
    if (!l) return -1;
    for (let k = l.length - 1; k >= 0; k--) {
      const a = this.areas[l[k]];
      if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) continue;
      const p = a.p;
      let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
      }
      if (inside) return a.kind;
    }
    return -1;
  }

  hasTile(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < TX && ty < TY && this.tileCount[ty * TX + tx] !== 0xffff; }
  /** Loaded tile, or null (and starts loading it). `undefined` = no such tile. */
  tile(tx: number, ty: number): Tile | null | undefined {
    if (!this.hasTile(tx, ty)) return undefined;
    const key = ty * TX + tx;
    const t = this.tiles.get(key);
    if (t) { t.used = ++this.clock; return t; }
    if (!this.pending.has(key) && this.pending.size < this.maxFetch) {
      this.pending.add(key);
      fetch(`${this.base}t/${tx}_${ty}.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => {
          const tile = decodeTile(buf, tx, ty);
          tile.used = ++this.clock;
          this.tiles.set(key, tile);
          this.onTile(tile);
          if (this.tiles.size > this.tileCap) this.evict();
        })
        .catch(() => { this.tileCount[key] = 0xffff; })
        .finally(() => this.pending.delete(key));
    }
    return null;
  }
  peek(key: number) { return this.tiles.get(key); }
  loaded() { return this.tiles.values(); }
  loadedCount() { return this.tiles.size; }
  private evict() {
    const all = [...this.tiles.values()].sort((a, b) => a.used - b.used);
    const drop = Math.min(all.length, Math.max(10, Math.round(this.tileCap * 0.27)));
    for (let i = 0; i < drop; i++) { this.tiles.delete(all[i].key); this.onEvict(all[i]); }
  }
}
