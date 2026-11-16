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
export interface Pick { type: 'v' | 'c' | 't'; i: number }

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
  raining = false;
  autoWeather = true;
  private weatherTimer = 90;
  activity = 1;
  /** 0..1 slowdown applied near a point (events). */
  jam: { x: number; y: number; r: number }[] = [];

  veh = new Agents(NV);
  ppl = new Agents(NP);
  pIcon = new Int8Array(NP).fill(-1); pIconT = new Float32Array(NP); pDest = new Uint8Array(NP); pStep = new Float32Array(NP);
  /** view rectangle agents should live in, city metres */
  view = { x0: 0, y0: 0, x1: 0, y1: 0, on: false };
  private nodes = new Map<number, number[]>(); // junction -> [tileKey, roadIndex, end]*
  private active: Tile[] = [];
  private roadW = 0; // traffic-weighted road metres in the active tiles
  private roadT = 0;
  private tp: [number, number, number] = [0, 0, 0];
  private activeAt = 0;

  trains: Train[] = [];
  boats: { a: number; r: number; w: number; x: number; y: number; flip: number }[] = [];
  plane = { active: false, t: 0, idle: 14, x: 0, y: 0, z: 0, dir: 1 };
  private runway: Float32Array | null = null;
  birds: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  kites: { x: number; y: number; h: number; ph: number }[] = [];
  spark = new Float32Array(120 * 3); // x, y (city m), life
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
  private addTile(t: Tile) {
    t.roads.forEach((r, ri) => {
      if (r.flags & 4) return;
      for (const end of [0, 1]) {
        const i = end ? r.p.length - 2 : 0;
        const k = Sim.nodeKey(r.p[i], r.p[i + 1]);
        let l = this.nodes.get(k);
        if (!l) { l = []; this.nodes.set(k, l); }
        l.push(t.key, ri, end);
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
        if (!l.length) this.nodes.delete(k);
      }
    }
    for (const a of [this.veh, this.ppl]) for (let i = 0; i < a.n; i++) if (a.tile[i] === t) a.tile[i] = null;
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
  setRain(on: boolean) { this.raining = on; this.weatherTimer = on ? 70 : 150; }
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
    const w = this.rain * 0.3;
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
        if (this.weatherTimer <= 0) { this.raining = !this.raining; this.weatherTimer = this.raining ? 35 + this.rnd() * 40 : 120 + this.rnd() * 180; }
      }
    }
    this.rain += ((this.raining ? 1 : 0) - this.rain) * Math.min(1, dtReal * 0.7);
    if (this.rain < 0.002) this.rain = 0;
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
      let spawns = 12;
      for (let i = 0; i < NV; i++) {
        if (i >= nv) { veh.tile[i] = null; continue; }
        if (!veh.tile[i]) { if (spawns-- > 0) this.spawn(veh, i, false); continue; }
        const x = veh.x[i], y = veh.y[i];
        if (x < v.x0 - 150 || x > v.x1 + 150 || y < v.y0 - 150 || y > v.y1 + 150) { veh.tile[i] = null; continue; }
        const r = veh.tile[i]!.roads[veh.road[i]];
        let k = slow * (1 - this.congestion(r.cls) * 0.65) * (r.cls <= 2 ? 1.25 : r.cls >= 5 ? 0.7 : 1);
        for (const j of this.jam) if (Math.abs(x - j.x) < j.r && Math.abs(y - j.y) < j.r) k *= 0.35;
        this.advance(veh, i, veh.spd[i] * k * dt, false);
      }
      const np = Math.round(Math.min(Math.max(20, Math.min(NP, viewArea / 3200)), 4 + (this.roadT * share) / 55) * this.activity * (1 - this.rain * 0.5));
      const ppl = this.ppl;
      spawns = 10;
      for (let i = 0; i < NP; i++) {
        if (i >= np) { ppl.tile[i] = null; continue; }
        if (!ppl.tile[i]) { if (spawns-- > 0) this.spawn(ppl, i, true); continue; }
        const x = ppl.x[i], y = ppl.y[i];
        if (x < v.x0 - 60 || x > v.x1 + 60 || y < v.y0 - 60 || y > v.y1 + 60) { ppl.tile[i] = null; continue; }
        this.advance(ppl, i, ppl.spd[i] * dt, true);
        this.pStep[i] += dt * 5;
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
        if (pl.idle <= 0) { pl.active = true; pl.t = 0; pl.dir = rw[rw.length - 2] > rw[0] ? 1 : -1; }
      } else {
        pl.t += dt;
        const d = 9 * pl.t * pl.t; // metres along the runway heading
        const L = Math.hypot(rw[rw.length - 2] - rw[0], rw[rw.length - 1] - rw[1]);
        const ux = (rw[rw.length - 2] - rw[0]) / L, uy = (rw[rw.length - 1] - rw[1]) / L;
        pl.x = rw[0] + ux * d; pl.y = rw[1] + uy * d;
        const lift = d - L * 0.55;
        pl.z = lift > 0 ? lift * 0.22 : 0;
        if (d > L + 9000) { pl.active = false; pl.idle = 45 + this.rnd() * 40; }
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
    return best;
  }

  /** City position and orientation (0 E-W, 1 SE, 2 N-S, 3 SW) of car k of train i. */
  trainPos(i: number, k: number): [number, number, number] {
    const tr = this.trains[i];
    const ln = this.city.metro[tr.line];
    const s = Math.max(0.01, Math.min(ln.total, tr.s - tr.dir * k * 21));
    const len = ln.len, p = ln.p;
    let lo = 1, hi = len.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (len[m] < s) lo = m + 1; else hi = m; }
    const f = (s - len[lo - 1]) / (len[lo] - len[lo - 1] || 1);
    const ax = p[lo * 2 - 2], ay = p[lo * 2 - 1], bx = p[lo * 2], by = p[lo * 2 + 1];
    const o = (Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) + 8) & 3;
    // each direction keeps to its own track, left of travel
    const l = Math.hypot(bx - ax, by - ay) || 1, off = 2.4 * tr.dir;
    const out = this.tp;
    out[0] = ax + (bx - ax) * f + ((by - ay) / l) * off;
    out[1] = ay + (by - ay) * f - ((bx - ax) / l) * off;
    out[2] = o;
    return out;
  }

  /** City-metre position of a picked thing. */
  posOf(p: Pick): [number, number] {
    if (p.type === 'v') return [this.veh.x[p.i], this.veh.y[p.i]];
    if (p.type === 'c') return [this.ppl.x[p.i], this.ppl.y[p.i]];
    const [x, y] = this.trainPos(p.i, 1);
    return [x, y];
  }
  alive(p: Pick) { return p.type === 't' || !!(p.type === 'v' ? this.veh : this.ppl).tile[p.i]; }

  describe(p: Pick): { title: string; lines: string[]; action: string } {
    if (p.type === 'v') {
      const row = VEH_ROWS[this.veh.look[p.i]];
      const t = this.veh.tile[p.i];
      const cls = t ? t.roads[this.veh.road[p.i]].cls : 5;
      const where = ['on the motorway', 'on the trunk road', 'on a main road', 'on a main road', 'on a link road', 'in the back streets', 'down a service lane'][cls];
      return { title: row.label, lines: [`Driving ${where}`, `Plate TS 0${(p.i % 9) + 1} ${String.fromCharCode(65 + (p.i % 26))}${String.fromCharCode(65 + ((p.i * 7) % 26))} ${1000 + ((p.i * 7919) % 8999)}`], action: 'Hop on' };
    }
    if (p.type === 'c') {
      const name = NAMES[p.i % NAMES.length];
      const mood = this.pIcon[p.i] >= 0 ? ICON_NAMES[this.pIcon[p.i]] : this.rain > 0.5 ? 'looking for shelter' : this.hour > 21 || this.hour < 5 ? 'out for a late walk' : 'enjoying the walk';
      return { title: name, lines: [`Mood: ${mood}`, `Heading to ${this.city.places[this.pDest[p.i]].name}`], action: 'Follow' };
    }
    const tr = this.trains[p.i], ln = this.city.metro[tr.line];
    let near = '';
    let bd = Infinity;
    for (const st of ln.stations) { const d = Math.abs(st.s - tr.s); if (d < bd) { bd = d; near = st.name; } }
    return { title: `${ln.name} Line metro`, lines: [tr.wait > 0 ? `Doors open at ${near || 'the station'}` : `Next stop near ${near || 'the terminus'}`, `${Math.round(120 + ((p.i * 37) % 200))} passengers on board`], action: 'Hop on' };
  }
}
