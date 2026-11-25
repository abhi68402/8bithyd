// Frame renderer for the real-geography city. World pixels are (X metres,
// Y metres / 2). Per frame: blit ground chunks, draw moving things, blit the
// building layer over them, one multiply fill for time of day, an additive
// pass for lights, then optional data overlays and signs.
import { Chunks, COARSE, COARSE_S, type DetailChunk } from './chunks';
import { ZONE_COL } from '../world/query';
import { TIERS, renderDpr, type Quality } from './quality';
import type { Camera } from './camera';
import type { City } from '../world/city';
import { TRAIN_CARS, type Sim, type Pick } from '../sim/sim';
import type { Events } from '../sim/events';
import { CITY_W, CITY_H, WORLD_H, TILE, TX, TY } from '../world/geo';
import { hash2 } from '../world/rng';
import { VW, VH, VOX, VOY, PW, PH, PS, POX, POY, TW_, TH_, TOX, TOY, type Sheets } from '../art/actors';

export type Overlay = 'none' | 'roads' | 'metro' | 'traffic' | 'density' | 'landuse' | 'zones';
export const ROAD_COL = ['#ff5a4f', '#ff8a3c', '#ffc23c', '#fff07a', '#e8f0ff', '#9fb4d0', '#6f7f98'];
const ROAD_PX = [5, 4.5, 4, 3, 2.4, 1.4, 1];
const TRAFFIC = ['#4cd964', '#ffcc33', '#ff4d4d'];
const MAJOR_IDS = new Set(['charminar', 'golconda', 'cyber-towers', 'sec-junction', 'airport', 'uppal', 'buddha', 'ramoji', 'financial-district']);
const COARSE_PAD = 96;
/** Height of the metro viaduct deck above the street, world px. */
const LIFT = 9;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  labels = true;
  overlay: Overlay = 'none';
  selected: Pick | null = null;
  selectedPlace = -1;
  /** Building picked with the inspect tool. */
  /** Graphics settings for this device (see quality.ts). */
  quality: Quality = TIERS[2];
  /** True while a burst of new map is being baked; the governor ignores those frames. */
  busy = false;
  private get hiRes() { return this.quality.hiRes; }
  stamped: (i: number) => boolean = () => false;
  visibleChunks = 0;
  drawnEntities = 0;
  mode = 'detail';
  pending = 0;
  private frame = 0;
  private vis: DetailChunk[] = [];
  private rainSeed = new Float32Array(420 * 3);
  private widths = new Map<string, number>();
  // metro viaduct geometry in world px, built once
  private deck: Path2D[] = [];
  private halts: Path2D[] = [];
  private piers: Float32Array[] = [];

  constructor(
    public canvas: HTMLCanvasElement, private city: City, private chunks: Chunks,
    private sim: Sim, private cam: Camera, public sheets: Sheets, private events: Events,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < this.rainSeed.length; i++) this.rainSeed[i] = Math.random();
    for (const m of city.metro) {
      const p = m.p, len = m.len;
      const at = (s: number, out: number[]) => {
        let k = 1;
        while (k < len.length - 1 && len[k] < s) k++;
        const f = (s - len[k - 1]) / (len[k] - len[k - 1] || 1);
        out.push(p[k * 2 - 2] + (p[k * 2] - p[k * 2 - 2]) * f, (p[k * 2 - 1] + (p[k * 2 + 1] - p[k * 2 - 1]) * f) / 2);
      };
      const deck = new Path2D();
      deck.moveTo(p[0], p[1] / 2);
      for (let i = 2; i < p.length; i += 2) deck.lineTo(p[i], p[i + 1] / 2);
      this.deck.push(deck);
      const halts = new Path2D();
      for (const st of m.stations) {
        const s0 = Math.max(0, st.s - 42), s1 = Math.min(m.total, st.s + 42);
        const pts: number[] = [];
        at(s0, pts);
        for (let k = 1; k < len.length; k++) if (len[k] > s0 && len[k] < s1) pts.push(p[k * 2], p[k * 2 + 1] / 2);
        at(s1, pts);
        halts.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) halts.lineTo(pts[i], pts[i + 1]);
      }
      this.halts.push(halts);
      const piers: number[] = [];
      for (let s = 12; s < m.total; s += 30) at(s, piers);
      this.piers.push(Float32Array.from(piers));
    }
    this.resize();
  }

  /** Switch graphics tier: resizes the canvas and lets the caches shrink to fit. */
  setQuality(q: Quality) {
    this.quality = q;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = renderDpr(this.quality, w, h, window.devicePixelRatio || 1);
    this.cam.w = w; this.cam.h = h; this.cam.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
  }

  draw() {
    const { ctx, cam, sim, sheets, chunks } = this;
    const W = this.canvas.width, H = this.canvas.height;
    const s = cam.zoom * cam.dpr;
    const ox = Math.round(W / 2 - cam.x * s), oy = Math.round(H / 2 - cam.y * s);
    const x0 = cam.x - W / 2 / s, x1 = cam.x + W / 2 / s;
    const y0 = cam.y - H / 2 / s, y1 = cam.y + H / 2 / s;
    const snap = (v: number) => Math.round(v * s) / s;
    const mode = cam.zoom >= 0.4 ? 'detail' : cam.zoom >= 0.09 ? 'coarse' : 'overview';
    this.mode = mode;
    this.frame++;
    chunks.beginFrame(this.quality.bakeMs - (cam.dragging || cam.flying ? 2 : 0));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#263238';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, ox, oy);

    const vis = this.vis;
    vis.length = 0;
    let drawn = 0, pending = 0;
    const ov = chunks.overview;
    const drawOverview = (cv: HTMLCanvasElement) => { ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, 0, 0, CITY_W, WORLD_H); };
    const cx0 = Math.max(0, Math.floor(x0 / COARSE)), cx1 = Math.min(Math.ceil(CITY_W / COARSE) - 1, Math.floor(x1 / COARSE));
    const cy0 = Math.max(0, Math.floor((y0 * 2) / COARSE)), cy1 = Math.min(Math.ceil(CITY_H / COARSE) - 1, Math.floor((y1 * 2 + 400) / COARSE));
    const drawCoarse = (night: boolean, bake: boolean) => {
      ctx.imageSmoothingEnabled = cam.zoom < 0.25;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = bake ? chunks.getCoarse(cx, cy) : chunks.coarse.get(cy * 100 + cx);
          if (!c) { pending++; continue; }
          c.used = this.frame;
          const cv = night ? c.l : c.c;
          ctx.drawImage(cv, cx * COARSE, (cy * COARSE) / 2 - COARSE_PAD * COARSE_S, cv.width * COARSE_S, cv.height * COARSE_S);
        }
      }
    };

    if (mode === 'overview') {
      drawOverview(ov);
      sim.view.on = false;
    } else if (mode === 'coarse') {
      drawOverview(ov);
      drawCoarse(false, true);
      sim.view.on = false;
    } else {
      const tx0 = Math.max(0, Math.floor(x0 / TILE)), tx1 = Math.min(TX - 1, Math.floor(x1 / TILE));
      const ty0 = Math.max(0, Math.floor((y0 * 2) / TILE)), ty1 = Math.min(TY - 1, Math.floor((y1 * 2 + 520) / TILE));
      // fetch/collect chunks first so we know whether a placeholder is needed
      let missing = false;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.city.hasTile(tx, ty)) { missing = true; continue; }
          const c = chunks.getDetail(tx, ty);
          if (c) vis.push(c); else { missing = true; pending++; }
        }
      }
      if (missing) { drawOverview(ov); drawCoarse(false, vis.length === 0 || !cam.dragging); }
      ctx.imageSmoothingEnabled = cam.zoom < 1;
      const hi = this.hiRes && cam.zoom >= 2;
      for (const c of vis) ctx.drawImage(hi && c.hg ? c.hg : c.g!, c.tx * TILE, (c.ty * TILE) / 2, TILE, TILE / 2);
      ctx.imageSmoothingEnabled = false;

      sim.view.x0 = x0 - 60; sim.view.x1 = x1 + 60; sim.view.y0 = y0 * 2 - 80; sim.view.y1 = y1 * 2 + 160; sim.view.on = true;
      const ex0 = x0 - 30, ex1 = x1 + 30, ey0 = y0 - 30, ey1 = y1 + 30;

      // water sparkle, boats
      const sp = sim.spark;
      ctx.fillStyle = '#d6f2f2';
      for (let i = 0; i < sp.length; i += 3) if (sp[i + 2] > 0) ctx.fillRect(sp[i] | 0, (sp[i + 1] / 2) | 0, sp[i + 2] > 0.3 ? 2 : 1, 1);
      for (const b of sim.boats) {
        const bx = b.x, by = b.y / 2;
        if (bx < ex0 || bx > ex1 || by < ey0 || by > ey1) continue;
        ctx.drawImage(sheets.boat, b.flip * 14, 0, 14, 10, snap(bx - 7), snap(by - 8), 14, 10);
      }
      this.events.drawGround(ctx, x0, y0, x1, y1);

      // walkers, then traffic; both sit under the building layer
      const ppl = sim.ppl, veh = sim.veh;
      // level of detail: below 1.5x a walker is a speck of a few screen pixels, so skip the draw calls
      if (cam.zoom >= 1.5) {
        for (let i = 0; i < ppl.n; i++) {
          if (!ppl.tile[i]) continue;
          const x = ppl.x[i], y = ppl.y[i] / 2;
          if (x < ex0 || x > ex1 || y < ey0 || y > ey1) continue;
          ctx.drawImage(sheets.ppl, ((sim.pStep[i] | 0) & 1) * PW * PS, ppl.look[i] * PH * PS, PW * PS, PH * PS, snap(x - POX), snap(y - POY), PW, PH);
          drawn++;
        }
      }
      for (let i = 0; i < veh.n; i++) {
        if (!veh.tile[i]) continue;
        const x = veh.x[i], y = veh.y[i] / 2;
        if (x < ex0 || x > ex1 || y < ey0 || y > ey1) continue;
        ctx.drawImage(sheets.veh, veh.head[i] * VW, veh.look[i] * VH, VW, VH, snap(x - VOX), snap(y - VOY), VW, VH);
        drawn++;
      }

      // buildings: advance each chunk's bake a little, then blit
      ctx.imageSmoothingEnabled = cam.zoom < 1;
      for (const c of vis) {
        chunks.bakeStructs(c);
        if (!chunks.structsDone(c)) pending++;
        if (hi && chunks.structsDone(c)) chunks.bakeHi(c, !cam.dragging && !cam.flying);
        if (c.s) ctx.drawImage(hi && chunks.hiDone(c) ? c.hs! : c.s, c.sx, c.sy, c.s.width, c.s.height);
      }
      ctx.imageSmoothingEnabled = false;

      if (cam.zoom >= 2) {
        const isc = cam.zoom >= 4 ? 0.5 : 1; // keep bubbles the same size on screen
        for (let i = 0; i < ppl.n; i++) {
          const ic = sim.pIcon[i];
          if (ic < 0 || !ppl.tile[i]) continue;
          const x = ppl.x[i], y = ppl.y[i] / 2;
          if (x < ex0 || x > ex1 || y < ey0 || y > ey1) continue;
          ctx.drawImage(sheets.icons, ic * 11, 0, 11, 13, snap(x - 5.5 * isc), snap(y - POY - 14 * isc), 11 * isc, 13 * isc);
        }
      }
      this.drawViaduct(x0, x1, y0, y1, false);
      this.drawTrains(sheets.train, ex0 - 30, ex1 + 30, ey0 - 30, ey1 + 40, snap);
      this.drawViaduct(x0, x1, y0, y1, true);
      this.events.drawSky(ctx, sheets, x0, y0, x1, y1);

      const pl = sim.plane;
      if (pl.active) {
        const X = pl.x, Y = pl.y / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(snap(X - 20), snap(Y - 2), 40, 5);
        ctx.drawImage(sheets.plane, pl.dir > 0 ? 0 : 44, 0, 44, 18, snap(X - 22), snap(Y - 15 - pl.z), 44, 18);
      }
      ctx.fillStyle = '#2b2b36';
      for (const b of sim.birds) {
        const bx = b.x | 0, by = (b.y / 2) | 0;
        if (bx < x0 || bx > x1 || by < y0 || by > y1) continue;
        const up = Math.sin(sim.clock * 9 + b.ph) > 0 ? 0 : 2;
        ctx.fillRect(bx, by + 1, 1, 1); ctx.fillRect(bx - 1, by + up, 1, 1); ctx.fillRect(bx + 1, by + up, 1, 1);
      }
      const hr = sim.hour;
      if (hr > sim.sunset - 3 && hr < sim.sunset + 0.5 && sim.rain < 0.3) {
        for (const k of sim.kites) {
          const X = k.x + Math.sin(sim.clock * 0.9 + k.ph) * 9, Y = k.y / 2 - k.h + Math.sin(sim.clock * 1.7 + k.ph) * 4;
          if (X < x0 - 10 || X > x1 + 10 || Y < y0 - 20 || Y > y1 + 10) continue;
          ctx.drawImage(sheets.kite, snap(X - 4), snap(Y - 8));
        }
      }
    }
    this.visibleChunks = vis.length;
    this.drawnEntities = drawn;

    // time-of-day tint: one full-screen multiply
    const [tr, tg, tb] = sim.tint;
    if (tr < 252 || tg < 252 || tb < 252) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${tr | 0},${tg | 0},${tb | 0})`;
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(s, 0, 0, s, ox, oy);
    }
    // emissive lights, additive
    ctx.globalCompositeOperation = 'lighter';
    if (sim.night > 0.03) {
      ctx.globalAlpha = sim.night * 0.9;
      if (mode === 'overview') { ctx.imageSmoothingEnabled = true; ctx.drawImage(chunks.overviewNight, 0, 0, CITY_W, WORLD_H); }
      else if (mode === 'coarse') drawCoarse(true, false);
      else {
        ctx.imageSmoothingEnabled = cam.zoom < 1;
        for (const c of vis) {
          if (chunks.structsDone(c)) chunks.bakeLights(c);
          if (c.l) ctx.drawImage(c.l, c.sx, c.sy);
        }
        ctx.imageSmoothingEnabled = false;
        const veh = sim.veh;
        for (let i = 0; i < veh.n; i++) {
          if (!veh.tile[i]) continue;
          const x = veh.x[i], y = veh.y[i] / 2;
          if (x < x0 - 20 || x > x1 + 20 || y < y0 - 20 || y > y1 + 20) continue;
          ctx.drawImage(sheets.vehL, veh.head[i] * VW, veh.look[i] * VH, VW, VH, snap(x - VOX), snap(y - VOY), VW, VH);
        }
        this.drawTrains(sheets.trainL, x0 - 60, x1 + 60, y0 - 60, y1 + 60, snap);
      }
    }
    if (mode === 'detail') { ctx.globalAlpha = 0.35 + sim.night * 0.65; this.events.drawLights(ctx, x0, y0, x1, y1); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;

    if (this.overlay !== 'none') this.drawOverlay(s, ox, oy, x0, y0, x1, y1, cx0, cy0, cx1, cy1);
    // zoomed out (or in the metro view) trains show as moving markers
    if (this.overlay === 'metro' || (this.overlay === 'none' && mode !== 'detail')) {
      ctx.setTransform(s, 0, 0, s, ox, oy);
      const px = cam.dpr / s, r = (mode === 'overview' ? 2.5 : 3.5) * px;
      for (let i = 0; i < sim.trains.length; i++) {
        const tp = sim.trainPos(i, 1), x = tp[0], y = tp[1] / 2;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        ctx.fillStyle = '#1b1426'; ctx.fillRect(x - r - px, y - r - px, 2 * (r + px), 2 * (r + px));
        ctx.fillStyle = '#fff7e0'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        ctx.fillStyle = this.city.metro[sim.trains[i].line].color; ctx.fillRect(x - r + px, y - r + px, 2 * (r - px), 2 * (r - px));
      }
    }

    // rain streaks in screen space, one path
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sim.rain > 0.02) {
      const n = Math.min(420, Math.round(sim.rain * 420 * this.quality.rain * Math.min(1, (W * H) / 2.2e6 + 0.3)));
      const d = cam.dpr, rs = this.rainSeed, t = sim.clock;
      ctx.strokeStyle = `rgba(196,214,236,${0.5 * sim.rain})`;
      ctx.lineWidth = d;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (((rs[i * 3] * W - t * 190 * d) % W) + W) % W;
        const y = (rs[i * 3 + 1] * H + t * (820 + rs[i * 3 + 2] * 420) * d) % H;
        ctx.moveTo(x, y); ctx.lineTo(x - 4 * d, y + 13 * d);
      }
      ctx.stroke();
    }

    this.drawSigns();
    this.pending = pending;
    this.busy = pending > 0;
    if ((this.frame & 63) === 0) { chunks.evict(Math.max(this.quality.detailCap, vis.length + 6), this.quality.coarseCap); chunks.evictHi(this.hiRes && mode === 'detail' && cam.zoom >= 2 ? vis.length + 2 : 0); }
  }

  private drawTrains(sheet: HTMLCanvasElement, x0: number, x1: number, y0: number, y1: number, snap: (v: number) => number) {
    const { sim, ctx } = this;
    for (let i = 0; i < sim.trains.length; i++) {
      // cull a whole train from one probe: cars sit within ~70 px of the second car
      const c = sim.trainPos(i, 1), cx = c[0], cy = c[1] / 2;
      if (cx < x0 - 70 || cx > x1 + 70 || cy < y0 - 70 || cy > y1 + 70) continue;
      for (let k = 0; k < TRAIN_CARS; k++) {
        const tp = sim.trainPos(i, k);
        const x = tp[0], y = tp[1] / 2;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        ctx.drawImage(sheet, tp[2] * TW_, sim.trains[i].line * TH_, TW_, TH_, snap(x - TOX), snap(y - TOY - LIFT + 1), TW_, TH_);
      }
    }
  }

  /** Elevated metro: piers, deck and platforms, then (roofs = true) station canopies over the trains. */
  private drawViaduct(x0: number, x1: number, y0: number, y1: number, roofs: boolean) {
    const { ctx, city } = this;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (let i = 0; i < city.metro.length; i++) {
      const col = city.metro[i].color;
      ctx.save();
      if (roofs) {
        ctx.translate(0, -LIFT - 9);
        ctx.globalAlpha = 0.86;
        ctx.lineWidth = 12; ctx.strokeStyle = '#3a3346'; ctx.stroke(this.halts[i]);
        ctx.translate(0, -1);
        ctx.strokeStyle = col; ctx.stroke(this.halts[i]);
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff7e0'; ctx.stroke(this.halts[i]);
        ctx.restore();
        continue;
      }
      const pr = this.piers[i];
      ctx.fillStyle = '#857f74';
      for (let k = 0; k < pr.length; k += 2) {
        const x = pr[k], y = pr[k + 1];
        if (x < x0 - 4 || x > x1 + 4 || y < y0 - 4 || y > y1 + LIFT + 4) continue;
        const px = Math.round(x), py = Math.round(y);
        ctx.fillRect(px - 1, py - LIFT, 3, LIFT); ctx.fillRect(px - 3, py - LIFT, 7, 2);
      }
      ctx.translate(0, -LIFT + 2);
      ctx.lineWidth = 8; ctx.strokeStyle = '#857f74'; ctx.stroke(this.deck[i]);
      ctx.lineWidth = 15; ctx.stroke(this.halts[i]);
      ctx.translate(0, -2);
      ctx.lineWidth = 8; ctx.strokeStyle = '#d6d1c6'; ctx.stroke(this.deck[i]);
      ctx.lineWidth = 15; ctx.strokeStyle = '#efe9da'; ctx.stroke(this.halts[i]);
      ctx.lineWidth = 4; ctx.strokeStyle = '#6f6a62'; ctx.stroke(this.deck[i]);
      ctx.lineWidth = 2; ctx.strokeStyle = '#a9a294'; ctx.stroke(this.deck[i]);
      ctx.restore();
    }
  }

  /** City-builder style data views. */
  private drawOverlay(s: number, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, cx0: number, cy0: number, cx1: number, cy1: number) {
    const { ctx, cam, sim, chunks, city } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(16,12,28,0.66)';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    const px = cam.dpr / s; // one CSS pixel in world units
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const o = this.overlay;
    if (o === 'density' || o === 'landuse') {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(chunks.raster(o), 0, 0, CITY_W, WORLD_H);
      if (o === 'landuse') this.strokeRoads(px, 3, x0, y0, x1, y1, cx0, cy0, cx1, cy1, () => 'rgba(255,255,255,0.28)', 0.5);
      return;
    }
    if (o === 'zones') {
      if (this.mode === 'detail') {
        for (const c of this.vis) {
          const zp = chunks.zonePaths(c.tile);
          for (let z = 0; z < 4; z++) { ctx.fillStyle = ZONE_COL[z]; ctx.fill(zp[z]); }
        }
      } else {
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(chunks.raster('zones'), 0, 0, CITY_W, WORLD_H);
        ctx.globalAlpha = 1;
      }
      this.strokeRoads(px, 3, x0, y0, x1, y1, cx0, cy0, cx1, cy1, () => 'rgba(255,255,255,0.22)', 0.5);
      return;
    }
    if (o === 'roads') {
      this.strokeRoads(px, this.mode === 'overview' ? 3 : 6, x0, y0, x1, y1, cx0, cy0, cx1, cy1, (k) => ROAD_COL[k], 1);
      return;
    }
    if (o === 'traffic') {
      this.strokeRoads(px, this.mode === 'overview' ? 3 : this.mode === 'coarse' ? 4 : 5, x0, y0, x1, y1, cx0, cy0, cx1, cy1, (k, cell) => {
        let c = sim.congestion(k) + (hash2(cell, k, 41) - 0.5) * 0.62;
        for (const j of sim.jam) if (Math.abs(((cell % 1000) + 0.5) * (cell >= 1e6 ? TILE : COARSE) - j.x) < j.r + 1500) c += 0.25;
        return TRAFFIC[c > 0.6 ? 2 : c > 0.33 ? 1 : 0];
      }, 1);
      return;
    }
    // metro: 10-minute walk catchments, lines, stations
    ctx.fillStyle = 'rgba(70,225,205,0.17)';
    for (const m of city.metro) {
      for (const st of m.stations) {
        if (st.x < x0 - 900 || st.x > x1 + 900 || st.y / 2 < y0 - 500 || st.y / 2 > y1 + 500) continue;
        ctx.beginPath(); ctx.ellipse(st.x, st.y / 2, 800, 400, 0, 0, 6.2832); ctx.fill();
      }
    }
    ctx.setLineDash([6 * px, 6 * px]);
    ctx.beginPath();
    for (const r of city.rail) { ctx.moveTo(r[0], r[1] / 2); for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1] / 2); }
    ctx.lineWidth = 1.5 * px; ctx.strokeStyle = 'rgba(220,220,230,0.5)'; ctx.stroke();
    ctx.setLineDash([]);
    for (const pass of [0, 1]) {
      for (const m of city.metro) {
        ctx.beginPath();
        ctx.moveTo(m.p[0], m.p[1] / 2);
        for (let i = 2; i < m.p.length; i += 2) ctx.lineTo(m.p[i], m.p[i + 1] / 2);
        ctx.lineWidth = (pass ? 4 : 7) * px; ctx.strokeStyle = pass ? m.color : '#fff7e0'; ctx.stroke();
      }
    }
    const names = cam.zoom >= 0.24;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.font = '8px Silkscreen, monospace'; ctx.textBaseline = 'middle';
    for (const m of city.metro) {
      for (const st of m.stations) {
        const sx = Math.round((st.x - cam.x) * cam.zoom + cam.w / 2), sy = Math.round((st.y / 2 - cam.y) * cam.zoom + cam.h / 2);
        if (sx < -80 || sx > cam.w + 80 || sy < -10 || sy > cam.h + 10) continue;
        ctx.fillStyle = '#2a1f3a'; ctx.fillRect(sx - 4, sy - 4, 8, 8);
        ctx.fillStyle = '#fff7e0'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = m.color; ctx.fillRect(sx - 1, sy - 1, 2, 2);
        if (names) {
          const t = st.name.toUpperCase();
          ctx.fillStyle = '#2a1f3a'; ctx.fillText(t, sx + 9, sy + 1);
          ctx.fillStyle = '#fff7e0'; ctx.fillText(t, sx + 8, sy);
        }
      }
    }
  }

  private strokeRoads(
    px: number, maxCls: number, x0: number, y0: number, x1: number, y1: number,
    cx0: number, cy0: number, cx1: number, cy1: number, col: (k: number, cell: number) => string, alpha: number,
  ) {
    const { ctx, chunks, city } = this;
    ctx.globalAlpha = alpha;
    if (this.mode === 'detail') {
      for (let ty = Math.floor((y0 * 2) / TILE); ty <= Math.floor((y1 * 2) / TILE); ty++) {
        for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
          const t = city.tile(tx, ty);
          if (!t) continue;
          const paths = chunks.roadPaths(t);
          for (let k = Math.min(6, maxCls); k >= 0; k--) {
            ctx.lineWidth = ROAD_PX[k] * px * (this.cam.zoom < 1 ? 0.8 : 1.3);
            ctx.strokeStyle = col(k, 1e6 + t.key);
            ctx.stroke(paths[k]);
          }
        }
      }
    } else {
      for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) {
        for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
          if (cx < 0 || cy < 0) continue;
          const paths = chunks.majorPathsFor(cx, cy);
          for (let k = Math.min(4, maxCls); k >= 0; k--) {
            ctx.lineWidth = ROAD_PX[k] * px * 0.7;
            ctx.strokeStyle = col(k, cy * 1000 + cx);
            ctx.stroke(paths[k]);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Place signs, neighbourhood names and the selection marker, in CSS pixels. */
  private drawSigns() {
    const { ctx, cam, sim, city } = this;
    const d = cam.dpr, z = cam.zoom;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = 'top';
    if (this.labels) {
      if (z >= 0.1 && z < 1.5 && this.overlay !== 'metro') {
        ctx.font = '8px Silkscreen, monospace';
        let n = 0;
        for (const [name, x, y, rank] of city.suburbs) {
          if (z < 0.4 && !rank) continue;
          const sx = Math.round((x - cam.x) * z + cam.w / 2), sy = Math.round((y / 2 - cam.y) * z + cam.h / 2);
          if (sx < 0 || sx > cam.w || sy < 0 || sy > cam.h) continue;
          if (++n > 46) break;
          const t = name.toUpperCase();
          let tw = this.widths.get('s' + t);
          if (tw === undefined) { tw = Math.ceil(ctx.measureText(t).width); this.widths.set('s' + t, tw); }
          ctx.fillStyle = 'rgba(42,31,58,0.85)'; ctx.fillText(t, sx - (tw >> 1) + 1, sy + 1);
          ctx.fillStyle = '#fff7e0'; ctx.fillText(t, sx - (tw >> 1), sy);
        }
      }
      const big = z >= 2;
      const fs = big ? 16 : 8;
      ctx.font = `${fs}px Silkscreen, monospace`;
      for (const p of city.places) {
        const sx = Math.round((p.x - cam.x) * z + cam.w / 2), sy = Math.round((p.y / 2 - (p.lift ?? 30) * Math.min(1, z * 1.5) - cam.y) * z + cam.h / 2);
        if (sx < -160 || sx > cam.w + 160 || sy < -20 || sy > cam.h + 30) continue;
        const got = this.stamped(p.i), sel = p.i === this.selectedPlace;
        if (z < 0.2 && !MAJOR_IDS.has(p.id) && !sel) {
          ctx.fillStyle = '#2a1f3a'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
          ctx.fillStyle = got ? '#f0a030' : '#fbf6e6'; ctx.fillRect(sx - 2, sy - 2, 4, 4);
          continue;
        }
        const text = p.name.toUpperCase();
        const key = fs + text;
        let tw = this.widths.get(key);
        if (tw === undefined) { tw = Math.ceil(ctx.measureText(text).width); this.widths.set(key, tw); }
        const pad = big ? 6 : 3, bw = tw + pad * 2 + (big ? 12 : 7), bh = fs + pad * 2 - (big ? 2 : 0);
        const bx = sx - (bw >> 1), by = sy - bh - 6;
        ctx.fillStyle = sel ? '#f0a030' : '#2a1f3a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillRect(sx - 1, by + bh, 2, 6);
        ctx.fillStyle = sel ? '#fff7e0' : got ? '#f6e9c6' : '#e9e2d4';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = got ? '#e0892a' : '#b9b0a2';
        ctx.fillRect(bx + pad, by + pad + (big ? 2 : 1), big ? 8 : 4, big ? 8 : 4);
        ctx.fillStyle = '#2a1f3a';
        ctx.fillText(text, bx + pad + (big ? 12 : 7), by + pad - (big ? 1 : 0));
      }
      // beacons for running events
      ctx.font = '8px Silkscreen, monospace';
      for (const a of this.events.active) {
        for (const p of a.sites) {
          const sx = Math.round((p.x - cam.x) * z + cam.w / 2), sy = Math.round((p.y / 2 - cam.y) * z + cam.h / 2);
          if (sx < -40 || sx > cam.w + 40 || sy < -40 || sy > cam.h + 40) continue;
          const r = 6 + ((sim.clock * 14) % 14);
          ctx.strokeStyle = `rgba(255,90,110,${1 - (r - 6) / 14})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx - r, sy - r / 2, r * 2, r);
        }
      }
    }
    if (this.selected && this.mode === 'detail') {
      const [X, Y] = sim.posOf(this.selected);
      const sx = (X - cam.x) * z + cam.w / 2, sy = (Y / 2 - cam.y) * z + cam.h / 2;
      const bob = Math.round(Math.sin(sim.clock * 5) * 3);
      const k = z >= 3 ? 3 : 2;
      ctx.drawImage(this.sheets.kite, Math.round(sx - 4.5 * k), Math.round(sy - 16 * k - 9 * z - 6 + bob), 9 * k, 16 * k);
    }
  }
}
void TY;
