// The living part of the city, on the real street network. Vehicles and
// walkers follow actual road centre-lines from the loaded map tiles and are
// recycled so they are always where the camera is. Hot data lives in typed
// arrays; nothing is allocated per frame.
import { TILE, TX, ROAD_W } from '../world/geo';
import type { City, Road, Tile } from '../world/city';
import { VEH_MIX, VEH_ROWS, LOOK_COUNT, ICON_NAMES } from '../art/actors';

const NV = 420;
const NP = 260;
/** Share of traffic each road class carries, motorway to service lane. */
const VEH_W = [1, 1, 1, 0.8, 0.55, 0.16, 0.05];
/** Cars per metro train. */
export const TRAIN_CARS = 4;
const NAMES = ['Aarav', 'Ayesha', 'Ravi', 'Lakshmi', 'Imran', 'Sravani', 'Kiran', 'Fatima', 'Venkat', 'Meena', 'Arjun', 'Zoya', 'Suresh', 'Divya', 'Rahim', 'Anitha', 'Vikram', 'Noor', 'Srinu', 'Padma', 'Farhan', 'Keerthi', 'Mahesh', 'Sana', 'Naveen', 'Swathi', 'Irfan', 'Bhavani', 'Chaitanya', 'Rukhsar'];

export interface Train { line: number; s: number; dir: number; wait: number; last: number }
export interface RailLine { p: Float32Array; len: Float32Array; total: number }
export interface MetroETA { line: string; color: string; station: string; dist: number; walkMin: number; etaMin: number; boarding: boolean }
export interface Pick { type: 'v' | 'c' | 't' | 'm' | 'p'; i: number }

const FLIGHTS: { flight: string; route: string; mode: 'dep' | 'arr' }[] = [
  { flight: '6E 412', route: 'HYD → DEL', mode: 'dep' },
  { flight: 'EK 527', route: 'DXB → HYD', mode: 'arr' },
  { flight: 'AI 542', route: 'HYD → BOM', mode: 'dep' },
  { flight: 'QR 501', route: 'DOH → HYD', mode: 'arr' },
  { flight: '6E 618', route: 'HYD → BLR', mode: 'dep' },
  { flight: 'BA 277', route: 'LHR → HYD', mode: 'arr' },
];

/** A pool of things travelling along road pieces. */
class Agents {
  tile: (Tile | null)[];
  road = new Int32Array(0);
  dirn = new Int8Array(0);
  s = new Float32Array(0);
  spd = new Float32Array(0);
  look = new Uint8Array(0);
  x = new Float32Array(0); // city metres
  y = new Float32Array(0);
  head = new Uint8Array(0); // 0..7
  constructor(public n: number) {
    this.tile = new Array(n).fill(null);
    this.road = new Int32Array(n); this.dirn = new Int8Array(n); this.s = new Float32Array(n); this.spd = new Float32Array(n);
    this.look = new Uint8Array(n); this.x = new Float32Array(n); this.y = new Float32Array(n); this.head = new Uint8Array(n);
  }
}

export class Sim {
  time = 16.4 * 60; // minutes since midnight
  day = 1;
  weekday = 0;
  speed = 1;
  night = 0;
  tint: [number, number, number] = [255, 255, 255];
  sunrise = 6.1; sunset = 18.3;
  rain = 0;
  rainTarget = 0;
  raining = false;
  cloudCover = 0.25;
  haze = 0;
  storm = false;
  windX = 0.4;
  puddle = 0;
  autoWeather = true;
  private weatherTimer = 90;
  activity = 1;
  /** 0..1 slowdown applied near a point (events). */
  jam: { x: number; y: number; r: number }[] = [];

  veh = new Agents(NV);
  ppl = new Agents(NP);
  vehStop = new Uint8Array(NV);
  vehSpdCur = new Float32Array(NV);
  private roadBuckets = new Map<number, number[]>();
  private bucketPool: number[][] = [];
  pIcon = new Int8Array(NP).fill(-1); pIconT = new Float32Array(NP); pDest = new Uint8Array(NP); pStep = new Float32Array(NP);
  /** view rectangle agents should live in, city metres */
  view = { x0: 0, y0: 0, x1: 0, y1: 0, on: false };
  private nodes = new Map<number, number[]>(); // junction -> [tileKey, roadIndex, end]*
  /** Signalized arterial intersections: nodeKey -> [x, y] city metres. */
  signalPos = new Map<number, [number, number]>();
  private active: Tile[] = [];
  private roadW = 0; // traffic-weighted road metres in the active tiles
  private roadT = 0;
  private tp: [number, number, number] = [0, 0, 0];
  private activeAt = 0;

  trains: Train[] = [];
  railLines: RailLine[] = [];
  mmts: Train[] = [];
  boats: { a: number; r: number; w: number; x: number; y: number; flip: number }[] = [];
  plane = { active: false, mode: 'dep' as 'dep' | 'arr', flight: '6E 412', route: 'HYD → DEL', flightIdx: 0, t: 0, idle: 10, x: 0, y: 0, z: 0, dir: 1, spd: 0 };
  private runway: Float32Array | null = null;
  birds: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  kites: { x: number; y: number; h: number; ph: number }[] = [];
  spark = new Float32Array(120 * 3); // x, y (city m), life
  flash = 0;
  private nextFlash = 8;
  onFlash: () => void = () => {};
  chai = 18432;
  clock = 0;

  private seed = 12345;
  private rnd() {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s;
    return (s >>> 0) / 4294967296;
  }

  constructor(private city: City) {
    city.onTile = (t) => this.addTile(t);
    const prevEvict = city.onEvict;
    city.onEvict = (t) => { this.removeTile(t); prevEvict(t); };
    for (const t of city.loaded()) this.addTile(t);
    city.metro.forEach((ln, li) => {
      // one train roughly every 3 km, alternating direction
      const n = Math.max(2, Math.round(ln.total / 3000));
      for (let k = 0; k < n; k++) this.trains.push({ line: li, s: 60 + ((ln.total - 120) * (k + 0.5)) / n, dir: k % 2 ? -1 : 1, wait: 0, last: -1 });
    });
    // MMTS suburban trains along major city.rail corridors (>= 2.5 km)
    for (const r of city.rail) {
      if (r.length < 4) continue;
      const len = new Float32Array(r.length / 2);
      for (let i = 2; i < r.length; i += 2) len[i / 2] = len[i / 2 - 1] + Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]);
      const total = len[len.length - 1];
      if (total < 2500) continue;
      const li = this.railLines.length;
      this.railLines.push({ p: r, len, total });
      const n = Math.min(3, Math.max(1, Math.round(total / 7500)));
      for (let k = 0; k < n; k++) this.mmts.push({ line: li, s: 80 + ((total - 160) * (k + 0.5)) / n, dir: k % 2 ? -1 : 1, wait: 0, last: -1 });
    }
    const lake = city.places.find((p) => p.id === 'buddha');
    if (lake) for (let i = 0; i < 5; i++) this.boats.push({ a: i * 1.4, r: 160 + i * 70, w: (i % 2 ? -1 : 1) * (0.05 + i * 0.012), x: lake.x, y: lake.y, flip: 0 });
    let best = 0;
    for (const r of city.runways) { const l = Math.hypot(r[r.length - 2] - r[0], r[r.length - 1] - r[1]); if (l > best) { best = l; this.runway = r; } }
    for (let i = 0; i < 9; i++) this.birds.push({ x: -300 + i * 16, y: 9000 + (i % 3) * 22, vx: 46, vy: 14, ph: i });
    const old = city.places.find((p) => p.id === 'charminar');
    if (old) for (let i = 0; i < 9; i++) this.kites.push({ x: old.x - 500 + this.rnd() * 1000, y: old.y - 500 + this.rnd() * 1000, h: 40 + this.rnd() * 40, ph: this.rnd() * 6 });
    for (let i = 0; i < NV; i++) { this.veh.look[i] = VEH_MIX[(this.rnd() * VEH_MIX.length) | 0]; this.veh.spd[i] = VEH_ROWS[this.veh.look[i]].speed * (0.85 + this.rnd() * 0.3); }
    for (let i = 0; i < NP; i++) { this.ppl.look[i] = (this.rnd() * LOOK_COUNT) | 0; this.ppl.spd[i] = 2.2 + this.rnd() * 1.4; this.pDest[i] = (this.rnd() * city.places.length) | 0; }
    this.light();
  }

  // ---------------------------------------------------------------- road graph
  private static nodeKey(x: number, y: number) { return Math.round(x * 2) * 131072 + Math.round(y * 2); }
  private checkSignal(k: number, x: number, y: number) {
    const l = this.nodes.get(k);
    if (!l || l.length < 9) { this.signalPos.delete(k); return; }
    let maj = 0;
    for (let j = 0; j < l.length; j += 3) {
      const nt = this.city.peek(l[j]);
      if (nt && nt.roads[l[j + 1]].cls <= 3) maj++;
    }
    if (maj >= 2) this.signalPos.set(k, [x, y]);
    else this.signalPos.delete(k);
  }
  private addTile(t: Tile) {
    t.roads.forEach((r, ri) => {
      if (r.flags & 4) return;
      for (const end of [0, 1]) {
        const i = end ? r.p.length - 2 : 0;
        const x = r.p[i], y = r.p[i + 1];
        const k = Sim.nodeKey(x, y);
        let l = this.nodes.get(k);
        if (!l) { l = []; this.nodes.set(k, l); }
        l.push(t.key, ri, end);
        if (r.cls <= 3 && !(r.flags & 2)) this.checkSignal(k, x, y);
      }
    });
  }
  private removeTile(t: Tile) {
    for (const r of t.roads) {
      for (const end of [0, 1]) {
        const i = end ? r.p.length - 2 : 0;
        const k = Sim.nodeKey(r.p[i], r.p[i + 1]);
        const l = this.nodes.get(k);
        if (!l) continue;
        for (let j = l.length - 3; j >= 0; j -= 3) if (l[j] === t.key) l.splice(j, 3);
        if (!l.length) { this.nodes.delete(k); this.signalPos.delete(k); }
        else if (this.signalPos.has(k) && l.length < 9) this.signalPos.delete(k);
      }
    }
    for (const a of [this.veh, this.ppl]) for (let i = 0; i < a.n; i++) if (a.tile[i] === t) a.tile[i] = null;
  }

  /** Signal cycle at node k: 0 = E/W green, 1 = E/W amber, 2 = N/S green, 3 = N/S amber. */
  signalPhase(k: number): 0 | 1 | 2 | 3 {
    const t = (this.clock + ((k & 31) * 1.37)) % 16;
    return t < 6.5 ? 0 : t < 8 ? 1 : t < 14.5 ? 2 : 3;
  }
  private isRedFor(k: number, r: Road, end: 0 | 1): boolean {
    const p = r.p, n = p.length;
    const dx = end ? p[n - 2] - p[n - 4] : p[0] - p[2];
    const dy = end ? p[n - 1] - p[n - 3] : p[1] - p[3];
    const ew = Math.abs(dx) >= Math.abs(dy);
    const ph = this.signalPhase(k);
    return ew ? ph !== 0 : ph !== 2;
  }

  private refreshActive() {
    this.active.length = 0;
    this.roadW = this.roadT = 0;
    const v = this.view;
    if (!v.on) return;
    for (let ty = Math.floor(v.y0 / TILE); ty <= Math.floor(v.y1 / TILE); ty++) {
      for (let tx = Math.floor(v.x0 / TILE); tx <= Math.floor(v.x1 / TILE); tx++) {
        const t = this.city.peek(ty * TX + tx);
        if (!t || !t.roads.length) continue;
        if (t.wlen === undefined) {
          let w = 0, tl = 0;
          for (const r of t.roads) { if (r.flags & 4) continue; w += r.total * VEH_W[r.cls]; tl += r.total; }
          t.wlen = w; t.tlen = tl;
        }
        this.roadW += t.wlen; this.roadT += t.tlen!;
        this.active.push(t);
      }
    }
  }

  private spawn(a: Agents, i: number, walker: boolean): boolean {
    if (!this.active.length) return false;
    const v = this.view;
    for (let tries = 0; tries < 8; tries++) {
      const t = this.active[(this.rnd() * this.active.length) | 0];
      const ri = (this.rnd() * t.roads.length) | 0;
      const r = t.roads[ri];
      if (r.flags & 4 || r.total < 6) continue;
      // traffic prefers big roads, walkers prefer small ones
      const w = walker ? (r.cls >= 4 ? 1 : r.cls >= 2 ? 0.25 : 0) : VEH_W[r.cls];
      if (this.rnd() > w) continue;
      const s = this.rnd() * r.total;
      a.tile[i] = t; a.road[i] = ri; a.s[i] = s;
      a.dirn[i] = r.flags & 1 && !walker ? 1 : this.rnd() < 0.5 ? 1 : -1;
      this.locate(a, i, r, walker);
      if (a.x[i] < v.x0 || a.x[i] > v.x1 || a.y[i] < v.y0 || a.y[i] > v.y1) continue;
      return true;
    }
    a.tile[i] = null;
    return false;
  }

  /** Position and heading on a road piece, offset to the left of travel. */
  private locate(a: Agents, i: number, r: Road, walker: boolean) {
    const len = r.len, p = r.p, s = a.s[i];
    let k = 1;
    const n = len.length;
    while (k < n - 1 && len[k] < s) k++;
    const f = (s - len[k - 1]) / (len[k] - len[k - 1] || 1);
    const ax = p[k * 2 - 2], ay = p[k * 2 - 1], bx = p[k * 2], by = p[k * 2 + 1];
    let dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    if (a.dirn[i] < 0) { dx = -dx; dy = -dy; }
    // left of travel: rotate heading by -90 degrees (y points south)
    const off = walker ? ROAD_W[r.cls] / 2 + 0.6 : r.flags & 1 ? 0 : ROAD_W[r.cls] * 0.23;
    a.x[i] = ax + (bx - ax) * f + dy * off;
    a.y[i] = ay + (by - ay) * f - dx * off;
    a.head[i] = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) & 7;
  }

  private advance(a: Agents, i: number, dist: number, walker: boolean) {
    const t = a.tile[i]!;
    let r = t.roads[a.road[i]];
    let s = a.s[i] + dist * a.dirn[i];
    if (s >= 0 && s <= r.total) { a.s[i] = s; this.locate(a, i, r, walker); return; }
    // reached a junction: pick the next piece
    const end = s > r.total ? 1 : 0;
    const pi = end ? r.p.length - 2 : 0;
    const l = this.nodes.get(Sim.nodeKey(r.p[pi], r.p[pi + 1]));
    let pickT: Tile | null = null, pickR = 0, pickEnd = 0, total = 0;
    if (l) {
      for (let j = 0; j < l.length; j += 3) {
        const nt = l[j] === t.key ? t : this.city.peek(l[j]);
        if (!nt) continue;
        const nr = nt.roads[l[j + 1]];
        if (nt === t && l[j + 1] === a.road[i]) continue; // no U-turn unless forced
        if (!walker && nr.flags & 1 && l[j + 2] === 1) continue; // wrong way down a one-way
        // prefer to keep to roads of the same or higher class
        const w = walker ? 1 : nr.cls <= r.cls ? 3 : nr.cls === r.cls + 1 ? 1 : 0.35;
        total += w;
        if (this.rnd() * total < w) { pickT = nt; pickR = l[j + 1]; pickEnd = l[j + 2]; }
      }
    }
    if (!pickT) {
      if (walker || !(r.flags & 1)) { a.dirn[i] = -a.dirn[i] as 1 | -1; a.s[i] = end ? r.total : 0; this.locate(a, i, r, walker); }
      else a.tile[i] = null;
      return;
    }
    r = pickT.roads[pickR];
    a.tile[i] = pickT; a.road[i] = pickR;
    a.dirn[i] = pickEnd ? -1 : 1;
    a.s[i] = pickEnd ? r.total : 0;
    this.locate(a, i, r, walker);
  }

  setTime(minutes: number) { this.time = ((minutes % 1440) + 1440) % 1440; this.light(); }
  setRain(on: boolean) {
    this.raining = on;
    this.rainTarget = on ? 1 : 0;
    this.storm = false;
    this.cloudCover = on ? 0.85 : 0.25;
    this.haze = on ? 0.12 : 0;
    this.weatherTimer = on ? 70 : 150;
  }
  setWeather(rainTarget: number, cloudCover: number, haze: number, storm: boolean, windX = 0.4) {
    this.rainTarget = Math.max(0, Math.min(1, rainTarget));
    this.raining = this.rainTarget > 0.15;
    this.cloudCover = Math.max(0, Math.min(1, cloudCover));
    this.haze = Math.max(0, Math.min(1, haze));
    this.storm = storm;
    this.windX = windX;
  }
  get hour() { return this.time / 60; }

  private light() {
    const h = this.time / 60, sr = this.sunrise, ss = this.sunset;
    const N: [number, number, number] = [92, 104, 172];
    const keys: [number, number, number, number][] = [
      [0, ...N], [sr - 1.2, 96, 108, 174], [sr + 0.1, 255, 186, 150], [sr + 1.4, 255, 240, 226], [sr + 3, 255, 255, 255],
      [ss - 2.3, 255, 255, 255], [ss - 0.7, 255, 218, 168], [ss + 0.25, 238, 146, 124], [ss + 1.1, 116, 114, 180], [ss + 2.6, ...N], [24, ...N],
    ];
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] <= h) k++;
    const a = keys[k], b = keys[k + 1];
    const f = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0] || 1)));
    let r = a[1] + (b[1] - a[1]) * f, g = a[2] + (b[2] - a[2]) * f, bl = a[3] + (b[3] - a[3]) * f;
    const lum = r * 0.3 + g * 0.5 + bl * 0.2;
    this.night = Math.min(1, Math.max(0, (215 - lum) / 110));
    const w = this.rain * 0.3 + this.cloudCover * 0.07;
    r *= 1 - w * 1.05; g *= 1 - w * 0.9; bl *= 1 - w * 0.7;
    this.tint[0] = r; this.tint[1] = g; this.tint[2] = bl;
    this.activity = h < 5 ? 0.25 : h < 7 ? 0.25 + (h - 5) * 0.375 : h < 21 ? 1 : Math.max(0.25, 1 - (h - 21) * 0.25);
  }

  /** Simulated congestion 0..1 for a road class right now (rush hours, rain). */
  congestion(cls: number): number {
    const h = this.hour;
    const rush = Math.max(Math.exp(-((h - 9.3) ** 2) / 2.2), Math.exp(-((h - 18.6) ** 2) / 3.2));
    const base = [0.5, 0.62, 0.7, 0.55, 0.4, 0.18, 0.08][cls] ?? 0.1;
    return Math.min(1, base * (0.2 + rush * 0.72) * this.activity + this.rain * 0.2);
  }

  update(dtReal: number, liveClock: boolean) {
    const dt = dtReal * (liveClock ? 1 : this.speed);
    this.clock += dtReal;
    if (!liveClock) {
      this.time += dt * 3;
      if (this.time >= 1440) { this.time -= 1440; this.day++; this.weekday = (this.weekday + 1) % 7; }
      if (this.autoWeather) {
        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
          this.raining = !this.raining;
          this.rainTarget = this.raining ? 0.85 : 0;
          this.cloudCover = this.raining ? 0.85 : 0.25;
          this.haze = this.raining ? 0.1 : 0;
          this.storm = false;
          this.weatherTimer = this.raining ? 35 + this.rnd() * 40 : 120 + this.rnd() * 180;
        }
      }
    }
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dtReal * 0.7);
    if (this.rain < 0.002) this.rain = 0;
    this.puddle = this.rain > 0.25 ? Math.min(1, this.puddle + dtReal * 0.04 * this.rain) : Math.max(0, this.puddle - dtReal * 0.008);
    this.flash = Math.max(0, this.flash - dtReal * 3.8);
    if (this.storm || this.rain > 0.72) {
      this.nextFlash -= dtReal;
      if (this.nextFlash <= 0) {
        this.flash = this.storm ? 1 : 0.85;
        this.nextFlash = this.storm ? 3 + this.rnd() * 6 : 7 + this.rnd() * 14;
        this.onFlash();
      }
    }
    this.light();
    if (dt <= 0) return;

    if (this.clock - this.activeAt > 0.4) { this.activeAt = this.clock; this.refreshActive(); }
    const v = this.view;
    if (v.on) {
      const slow = 1 - this.rain * 0.25;
      // population scales with how much city is on screen
      const viewArea = (v.x1 - v.x0) * (v.y1 - v.y0);
      // ...and never more than the visible streets can hold without queueing
      const share = Math.min(1, viewArea / (Math.max(1, this.active.length) * TILE * TILE));
      const nv = Math.round(Math.min(Math.max(30, Math.min(NV, viewArea / 2600)), 4 + (this.roadW * share) / 26) * (0.35 + 0.65 * this.activity));
      const veh = this.veh;
      // bucket active vehicles by (tile, road, dir) so trailing cars queue smoothly behind stopped ones
      let poolIdx = 0;
      this.roadBuckets.clear();
      for (let i = 0; i < nv; i++) {
        const vt = veh.tile[i];
        if (!vt) continue;
        const rk = vt.key * 2048 + veh.road[i] * 2 + (veh.dirn[i] > 0 ? 1 : 0);
        let list = this.roadBuckets.get(rk);
        if (!list) {
          list = this.bucketPool[poolIdx] ?? (this.bucketPool[poolIdx] = []);
          list.length = 0;
          poolIdx++;
          this.roadBuckets.set(rk, list);
        }
        list.push(i);
      }

      let spawns = 12;
      for (let i = 0; i < NV; i++) {
        if (i >= nv) { veh.tile[i] = null; this.vehStop[i] = 0; this.vehSpdCur[i] = 0; continue; }
        if (!veh.tile[i]) { this.vehStop[i] = 0; this.vehSpdCur[i] = 0; if (spawns-- > 0) this.spawn(veh, i, false); continue; }
        const x = veh.x[i], y = veh.y[i];
        if (x < v.x0 - 150 || x > v.x1 + 150 || y < v.y0 - 150 || y > v.y1 + 150) { veh.tile[i] = null; this.vehStop[i] = 0; continue; }
        const vt = veh.tile[i]!;
        const r = vt.roads[veh.road[i]];
        const dir = veh.dirn[i];
        const distLeft = dir > 0 ? r.total - veh.s[i] : veh.s[i];
        // check red traffic signal ahead (police/ambulances can glide through)
        const kind = VEH_ROWS[veh.look[i]].kind;
        let stopped = false;
        let stopGap = distLeft - 8.5;
        if (distLeft < 18 && distLeft > 3 && r.cls <= 4 && !(r.flags & 2) && kind !== 'ambulance' && kind !== 'patrol') {
          const end: 0 | 1 = dir > 0 ? 1 : 0;
          const pi = end ? r.p.length - 2 : 0;
          const nk = Sim.nodeKey(r.p[pi], r.p[pi + 1]);
          if (this.signalPos.has(nk) && this.isRedFor(nk, r, end)) stopped = true;
        }
        // check vehicle ahead on the same road piece & direction
        const rk = vt.key * 2048 + veh.road[i] * 2 + (dir > 0 ? 1 : 0);
        const peers = this.roadBuckets.get(rk);
        let aheadGap = Infinity;
        if (peers && peers.length > 1) {
          for (let pi = 0; pi < peers.length; pi++) {
            const j = peers[pi];
            if (j === i) continue;
            const gap = (veh.s[j] - veh.s[i]) * dir;
            if (gap > 0 && gap < aheadGap) aheadGap = gap;
          }
        }
        if (aheadGap < 12) { stopped = true; stopGap = Math.min(stopGap, aheadGap - 10); }
        this.vehStop[i] = stopped ? 1 : 0;
        if (stopped && (stopGap <= 0 || aheadGap <= 10.5)) {
          this.vehSpdCur[i] = 0;
          continue;
        }
        let k = slow * (1 - this.congestion(r.cls) * 0.65) * (r.cls <= 2 ? 1.25 : r.cls >= 5 ? 0.7 : 1);
        if (stopped) k *= Math.max(0.18, Math.min(1, stopGap / 9));
        else if (aheadGap < 18) k *= 0.65;
        for (const j of this.jam) if (Math.abs(x - j.x) < j.r && Math.abs(y - j.y) < j.r) k *= 0.35;
        const sp = veh.spd[i] * k;
        this.vehSpdCur[i] = sp;
        this.advance(veh, i, sp * dt, false);
      }
      const np = Math.round(Math.min(Math.max(20, Math.min(NP, viewArea / 3200)), 4 + (this.roadT * share) / 55) * this.activity * (1 - this.rain * 0.5));
      const ppl = this.ppl;
      spawns = 10;
      for (let i = 0; i < NP; i++) {
        if (i >= np) { ppl.tile[i] = null; continue; }
        if (!ppl.tile[i]) { if (spawns-- > 0) this.spawn(ppl, i, true); continue; }
        const x = ppl.x[i], y = ppl.y[i];
        if (x < v.x0 - 60 || x > v.x1 + 60 || y < v.y0 - 60 || y > v.y1 + 60) { ppl.tile[i] = null; continue; }
        // pause walkers briefly at arterial red crosswalks
        const pr = ppl.tile[i]!.roads[ppl.road[i]];
        const pdir = ppl.dirn[i];
        const pLeft = pdir > 0 ? pr.total - ppl.s[i] : ppl.s[i];
        let waitCross = false;
        if (pLeft < 7.5 && pLeft > 2 && pr.cls <= 3 && !(pr.flags & 2)) {
          const end: 0 | 1 = pdir > 0 ? 1 : 0;
          const pi = end ? pr.p.length - 2 : 0;
          const nk = Sim.nodeKey(pr.p[pi], pr.p[pi + 1]);
          if (this.signalPos.has(nk) && this.isRedFor(nk, pr, end)) waitCross = true;
        }
        if (!waitCross) {
          this.advance(ppl, i, ppl.spd[i] * dt, true);
          this.pStep[i] += dt * 5;
        }
        if (this.pIcon[i] >= 0) { this.pIconT[i] -= dt; if (this.pIconT[i] <= 0) this.pIcon[i] = -1; }
      }
      if (this.rnd() < dt * 2.5) {
        const i = (this.rnd() * np) | 0;
        if (this.pIcon[i] < 0 && ppl.tile[i]) { this.pIcon[i] = (this.rnd() * ICON_NAMES.length) | 0; this.pIconT[i] = 3 + this.rnd() * 3; }
      }
    }

    for (const tr of this.trains) {
      if (tr.wait > 0) { tr.wait -= dt; continue; }
      const ln = this.city.metro[tr.line];
      const prev = tr.s;
      tr.s += tr.dir * 26 * dt;
      for (let k = 0; k < ln.stations.length; k++) {
        const st = ln.stations[k].s;
        if (k !== tr.last && (prev - st) * (tr.s - st) <= 0) { tr.s = st; tr.wait = 3; tr.last = k; break; }
      }
      if (tr.s >= ln.total - 30) { tr.s = ln.total - 30; tr.dir = -1; tr.wait = 4; tr.last = -1; }
      if (tr.s <= 30) { tr.s = 30; tr.dir = 1; tr.wait = 4; tr.last = -1; }
    }
    for (const tr of this.mmts) {
      if (tr.wait > 0) { tr.wait -= dt; continue; }
      const ln = this.railLines[tr.line];
      tr.s += tr.dir * 22 * dt;
      if (tr.s >= ln.total - 40) { tr.s = ln.total - 40; tr.dir = -1; tr.wait = 3; }
      if (tr.s <= 40) { tr.s = 40; tr.dir = 1; tr.wait = 3; }
    }

    const lake = this.city.places.find((p) => p.id === 'buddha');
    if (lake) {
      for (const b of this.boats) {
        b.a += b.w * dt;
        const nx = lake.x + Math.cos(b.a) * b.r * 1.25, ny = lake.y + Math.sin(b.a) * b.r;
        b.flip = nx < b.x ? 1 : 0;
        b.x = nx; b.y = ny;
      }
    }

    const pl = this.plane, rw = this.runway;
    if (rw) {
      if (!pl.active) {
        pl.idle -= dt;
        if (pl.idle <= 0) {
          const f = FLIGHTS[pl.flightIdx % FLIGHTS.length];
          pl.flightIdx++;
          pl.mode = f.mode;
          pl.flight = f.flight;
          pl.route = f.route;
          pl.active = true;
          pl.t = 0;
          pl.dir = rw[rw.length - 2] > rw[0] ? 1 : -1;
        }
      } else {
        pl.t += dt;
        const L = Math.hypot(rw[rw.length - 2] - rw[0], rw[rw.length - 1] - rw[1]);
        const ux = (rw[rw.length - 2] - rw[0]) / L, uy = (rw[rw.length - 1] - rw[1]) / L;
        if (pl.mode === 'dep') {
          const d = 9 * pl.t * pl.t;
          pl.spd = Math.min(250, Math.round(18 * pl.t * 3.6));
          pl.x = rw[0] + ux * d; pl.y = rw[1] + uy * d;
          const lift = d - L * 0.55;
          pl.z = lift > 0 ? lift * 0.22 : 0;
          if (d > L + 9000) { pl.active = false; pl.idle = 24 + this.rnd() * 22; }
        } else {
          // arrival: descend from approach along runway heading and roll to halt
          const totalDist = L + 7000;
          const v0 = 135;
          const dFromStart = v0 * pl.t - 0.55 * pl.t * pl.t;
          const d = dFromStart - 7000;
          pl.spd = Math.max(0, Math.round((v0 - 1.1 * pl.t) * 3.6));
          pl.x = rw[0] + ux * d; pl.y = rw[1] + uy * d;
          pl.z = d < L * 0.25 ? Math.max(0, (L * 0.25 - d) * 0.16) : 0;
          if (pl.t > 95 || dFromStart >= totalDist || pl.spd <= 8) { pl.active = false; pl.idle = 20 + this.rnd() * 20; }
        }
      }
    }

    for (const b of this.birds) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (v.on && (b.x > v.x1 + 400 || b.y > v.y1 + 800)) { b.x = v.x0 - 100 - this.rnd() * 200; b.y = v.y0 + this.rnd() * (v.y1 - v.y0); }
    }

    if (v.on) {
      for (let i = 0; i < this.spark.length; i += 3) {
        this.spark[i + 2] -= dt;
        if (this.spark[i + 2] < -0.8) {
          const x = v.x0 + this.rnd() * (v.x1 - v.x0), y = v.y0 + this.rnd() * (v.y1 - v.y0);
          if (this.city.areaAt(x, y) !== 0) { this.spark[i + 2] = -0.5; continue; }
          this.spark[i] = x; this.spark[i + 1] = y; this.spark[i + 2] = 0.5 + this.rnd() * 0.6;
        }
      }
    }
    const h = this.time / 60;
    this.chai += dt * (h > 6 && h < 22 ? 9 : 1.5);
  }

  /** Nearest moving thing to a city-metre point. */
  pick(x: number, y: number, rad: number): Pick | null {
    let best: Pick | null = null, bd = rad * rad;
    const veh = this.veh, ppl = this.ppl;
    for (let i = 0; i < NV; i++) {
      if (!veh.tile[i]) continue;
      const d = (veh.x[i] - x) ** 2 + (veh.y[i] - y) ** 2;
      if (d < bd) { bd = d; best = { type: 'v', i }; }
    }
    for (let i = 0; i < NP; i++) {
      if (!ppl.tile[i]) continue;
      const d = (ppl.x[i] - x) ** 2 + (ppl.y[i] - y) ** 2;
      if (d < bd) { bd = d; best = { type: 'c', i }; }
    }
    for (let i = 0; i < this.trains.length; i++) {
      const [tx, ty] = this.trainPos(i, 0);
      const d = ((tx - x) ** 2 + (ty - y) ** 2) / 6;
      if (d < bd) { bd = d; best = { type: 't', i }; }
    }
    for (let i = 0; i < this.mmts.length; i++) {
      const [tx, ty] = this.mmtsPos(i, 0);
      const d = ((tx - x) ** 2 + (ty - y) ** 2) / 6;
      if (d < bd) { bd = d; best = { type: 'm', i }; }
    }
    if (this.plane.active) {
      const py = this.plane.y - this.plane.z * 2;
      const d = ((this.plane.x - x) ** 2 + (py - y) ** 2) / 8;
      if (d < bd) { bd = d; best = { type: 'p', i: 0 }; }
    }
    return best;
  }

  private trackPos(tr: Train, ln: { p: Float32Array; len: Float32Array; total: number }, k: number, offBase: number): [number, number, number] {
    const s = Math.max(0.01, Math.min(ln.total, tr.s - tr.dir * k * 21));
    const len = ln.len, p = ln.p;
    let lo = 1, hi = len.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (len[m] < s) lo = m + 1; else hi = m; }
    const f = (s - len[lo - 1]) / (len[lo] - len[lo - 1] || 1);
    const ax = p[lo * 2 - 2], ay = p[lo * 2 - 1], bx = p[lo * 2], by = p[lo * 2 + 1];
    const o = (Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) + 8) & 3;
    const l = Math.hypot(bx - ax, by - ay) || 1, off = offBase * tr.dir;
    const out = this.tp;
    out[0] = ax + (bx - ax) * f + ((by - ay) / l) * off;
    out[1] = ay + (by - ay) * f - ((bx - ax) / l) * off;
    out[2] = o;
    return out;
  }

  /** City position and orientation (0 E-W, 1 SE, 2 N-S, 3 SW) of car k of metro train i. */
  trainPos(i: number, k: number): [number, number, number] {
    const tr = this.trains[i];
    return this.trackPos(tr, this.city.metro[tr.line], k, 2.4);
  }

  /** City position and orientation of car k of MMTS suburban train i. */
  mmtsPos(i: number, k: number): [number, number, number] {
    const tr = this.mmts[i];
    return this.trackPos(tr, this.railLines[tr.line], k, 2.6);
  }

  /** True if a metro train is boarding or arriving within 180m of stationS on lineIdx. */
  stationBusy(lineIdx: number, stationS: number): boolean {
    for (const tr of this.trains) {
      if (tr.line === lineIdx && Math.abs(tr.s - stationS) < 180) return true;
    }
    return false;
  }

  /** Nearest metro station and live next-train ETA from a city-metre point. */
  nearestMetroETA(x: number, y: number): MetroETA | null {
    let bestLine = -1, bestSt = -1, bd = Infinity;
    for (let li = 0; li < this.city.metro.length; li++) {
      const m = this.city.metro[li];
      for (let si = 0; si < m.stations.length; si++) {
        const st = m.stations[si];
        const d = Math.hypot(st.x - x, st.y - y);
        if (d < bd) { bd = d; bestLine = li; bestSt = si; }
      }
    }
    if (bestLine < 0) return null;
    const m = this.city.metro[bestLine], st = m.stations[bestSt];
    let bestSec = Infinity, boarding = false;
    for (const tr of this.trains) {
      if (tr.line !== bestLine) continue;
      if (tr.wait > 0 && Math.abs(tr.s - st.s) < 35) { boarding = true; bestSec = 0; break; }
      const approaching = (st.s - tr.s) * tr.dir >= 0;
      const dist = approaching ? Math.abs(st.s - tr.s) : (tr.dir > 0 ? (m.total - tr.s) + (m.total - st.s) : tr.s + st.s);
      const sec = dist / 22;
      if (sec < bestSec) bestSec = sec;
    }
    return {
      line: m.name,
      color: m.color,
      station: st.name,
      dist: bd,
      walkMin: Math.max(1, Math.round(bd / 80)),
      etaMin: Number.isFinite(bestSec) ? Math.max(1, Math.round(bestSec / 60)) : 3,
      boarding,
    };
  }

  /** City-metre position of a picked thing. */
  posOf(p: Pick): [number, number] {
    if (p.type === 'v') return [this.veh.x[p.i], this.veh.y[p.i]];
    if (p.type === 'c') return [this.ppl.x[p.i], this.ppl.y[p.i]];
    if (p.type === 'm') { const [x, y] = this.mmtsPos(p.i, 1); return [x, y]; }
    if (p.type === 'p') return [this.plane.x, this.plane.y - this.plane.z * 2];
    const [x, y] = this.trainPos(p.i, 1);
    return [x, y];
  }
  alive(p: Pick) {
    if (p.type === 't' || p.type === 'm') return true;
    if (p.type === 'p') return this.plane.active;
    return !!(p.type === 'v' ? this.veh : this.ppl).tile[p.i];
  }

  describe(p: Pick): { title: string; lines: string[]; action: string } {
    if (p.type === 'v') {
      const row = VEH_ROWS[this.veh.look[p.i]];
      const t = this.veh.tile[p.i];
      const cls = t ? t.roads[this.veh.road[p.i]].cls : 5;
      const where = ['on the motorway', 'on the trunk road', 'on a main road', 'on a main road', 'on a link road', 'in the back streets', 'down a service lane'][cls];
      const kmh = Math.round(this.vehSpdCur[p.i] * 3.6);
      const status = this.vehStop[p.i] ? 'Stopped at a red signal' : `${kmh} km/h · Driving ${where}`;
      return { title: row.label, lines: [status], action: 'Hop on' };
    }
    if (p.type === 'c') {
      const name = NAMES[p.i % NAMES.length];
      const mood = this.pIcon[p.i] >= 0 ? ICON_NAMES[this.pIcon[p.i]] : this.rain > 0.5 ? 'walking under an umbrella' : this.hour > 21 || this.hour < 5 ? 'out for a late walk' : 'enjoying the walk';
      return { title: name, lines: [`Mood: ${mood}`, `Heading to ${this.city.places[this.pDest[p.i]].name}`], action: 'Follow' };
    }
    if (p.type === 'm') {
      return {
        title: 'MMTS Suburban Rail',
        lines: [`${Math.round(22 * 3.6)} km/h along city rail corridor`, `${Math.round(260 + ((p.i * 53) % 340))} commuters on board`],
        action: 'Hop on',
      };
    }
    if (p.type === 'p') {
      const pl = this.plane;
      return {
        title: `${pl.flight} · ${pl.route}`,
        lines: [pl.mode === 'dep' ? `Departing RGIA · ${pl.spd} km/h` : `Arriving RGIA · ${pl.spd} km/h`, `Altitude ${Math.round(pl.z * 3)} m`],
        action: 'Track flight',
      };
    }
    const tr = this.trains[p.i], ln = this.city.metro[tr.line];
    let near = '';
    let bd = Infinity;
    for (const st of ln.stations) { const d = Math.abs(st.s - tr.s); if (d < bd) { bd = d; near = st.name; } }
    return { title: `${ln.name} Line metro`, lines: [tr.wait > 0 ? `Doors open at ${near || 'the station'}` : `Next stop near ${near || 'the terminus'} · ${Math.round(26 * 3.6)} km/h`, `${Math.round(120 + ((p.i * 37) % 200))} passengers on board`], action: 'Hop on' };
  }
}
