// City events: scheduled happenings that change what the simulation shows.
// Most run on a game calendar (weekday based). Festivals (festivals.ts) run on
// the real date in India and show during their hours on the game clock.
// All effects are procedural and cheap: a few hundred fillRects at most.
import type { City, Place } from '../world/city';
import type { Sim } from './sim';
import { PW, PH, PS, POX, POY, LOOK_COUNT, UM_W, UM_H, UM_COUNT, type Sheets } from '../art/actors';
import { FESTIVALS, festivalsOn, indiaToday } from './festivals';

type Ctx = CanvasRenderingContext2D;
export type Fx = 'crowd' | 'strings' | 'fireworks' | 'laser' | 'ferris' | 'kites' | 'flood' | 'floodlights' | 'confetti';

export interface CityEvent {
  id: string; name: string; place: string; sites?: string[];
  from: number; to: number; days: number[] | null;
  blurb: string; fx: Fx[]; r: number; crowd: number; jam?: number;
  /** festival: on when the real date matches, not by weekday */
  fest?: boolean;
}
const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const EVENTS: CityEvent[] = [
  { id: 'match', name: 'Match night at Uppal', place: 'uppal', from: 19, to: 22.5, days: [0, 2, 5], r: 150, crowd: 130, jam: 900,
    blurb: 'Floodlights on, stands full, and fireworks if Hyderabad wins.', fx: ['crowd', 'floodlights', 'fireworks'] },
  { id: 'market', name: 'Night market at Charminar', place: 'charminar', from: 19.5, to: 24, days: null, r: 120, crowd: 150, jam: 350,
    blurb: 'Haleem, bangles and fairy lights around the four minarets.', fx: ['crowd', 'strings'] },
  { id: 'kites', name: 'Kite festival', place: 'parade-ground', from: 15.5, to: 18.5, days: [0, 6], r: 220, crowd: 80,
    blurb: 'Hundreds of paper kites over Parade Ground.', fx: ['crowd', 'kites'] },
  { id: 'laser', name: 'Laser show at Lumbini Park', place: 'lumbini', from: 19.25, to: 20.25, days: null, r: 90, crowd: 50,
    blurb: 'Beams over the water every evening.', fx: ['crowd', 'laser'] },
  { id: 'immersion', name: 'Ganesh immersion', place: 'tank-bund', from: 16, to: 21, days: [4], r: 320, crowd: 170, jam: 1200,
    blurb: 'Processions from across the city converge on Hussain Sagar.', fx: ['crowd', 'strings', 'fireworks'] },
  { id: 'bonalu', name: 'Bonalu at Golconda', place: 'golconda', from: 8, to: 13, days: [0], r: 260, crowd: 130, jam: 700,
    blurb: 'Pots of offerings carried up to the fort temple, with drums all the way.', fx: ['crowd', 'confetti'] },
  { id: 'numaish', name: 'Numaish exhibition', place: 'nampally', from: 17, to: 22.5, days: [1, 3, 6], r: 170, crowd: 110, jam: 500,
    blurb: 'The winter fair: giant wheel, stalls and too much food.', fx: ['crowd', 'ferris', 'strings'] },
  { id: 'flood', name: 'Monsoon waterlogging', place: 'necklace-road', sites: ['necklace-road', 'high-court', 'nampally', 'cyber-towers', 'abids'], from: 0, to: 0, days: [], r: 160, crowd: 0, jam: 600,
    blurb: 'Heavy rain has flooded low-lying junctions. Traffic is crawling.', fx: ['flood'] },
];
for (const { dates, ...f } of FESTIVALS) EVENTS.push({ ...f, days: [], fest: true });

const h1 = (n: number, s: number) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const BRIGHT = ['#ff5a6e', '#ffd23f', '#5ad1ff', '#7dff8a', '#ff9f43', '#d98bff'];

export interface Active { ev: CityEvent; sites: Place[]; t0: number }

export class Events {
  active: Active[] = [];
  private forced = new Map<string, number>();
  private wet = 0;
  /** ids of festivals happening today (real date), refreshed once a minute */
  festToday = new Set<string>();
  private festCheck = 0;
  onStart: (a: Active) => void = () => {};

  constructor(private city: City, private sim: Sim) {}

  private sitesOf(ev: CityEvent): Place[] {
    return (ev.sites ?? [ev.place]).map((id) => this.city.places.find((p) => p.id === id)).filter((p): p is Place => !!p);
  }
  isOn(ev: CityEvent): boolean {
    const s = this.sim;
    if ((this.forced.get(ev.id) ?? 0) > s.clock) return true;
    if (ev.id === 'flood') return this.wet > 25;
    if (ev.fest) return this.festToday.has(ev.id) && s.hour >= ev.from && s.hour < ev.to;
    if (ev.days && !ev.days.includes(s.weekday)) return false;
    return s.hour >= ev.from && s.hour < ev.to;
  }
  /** Start an event by hand for a couple of minutes. */
  force(id: string) { this.forced.set(id, this.sim.clock + 150); }
  stop(id: string) { this.forced.delete(id); }
  when(ev: CityEvent): string {
    if (ev.id === 'flood') return 'WHEN IT POURS';
    if (ev.fest) return 'FESTIVAL';
    const f = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    return `${ev.days ? ev.days.map((d) => DAY[d]).join(' ') : 'DAILY'} ${f(ev.from)}-${f(ev.to)}`;
  }

  update(dt: number) {
    const s = this.sim;
    this.wet = s.rain > 0.85 ? this.wet + dt : Math.max(0, this.wet - dt * 2);
    this.festCheck -= dt;
    if (this.festCheck <= 0) { this.festCheck = 60; this.festToday = new Set(festivalsOn(indiaToday()).map((f) => f.id)); }
    for (const ev of EVENTS) {
      const on = this.isOn(ev);
      const i = this.active.findIndex((a) => a.ev === ev);
      if (on && i < 0) { const a = { ev, sites: this.sitesOf(ev), t0: s.clock }; if (a.sites.length) { this.active.push(a); this.onStart(a); } }
      else if (!on && i >= 0) this.active.splice(i, 1);
    }
    s.jam.length = 0;
    for (const a of this.active) if (a.ev.jam) for (const p of a.sites) s.jam.push({ x: p.x, y: p.y, r: a.ev.jam });
  }

  /** Things on the ground, drawn before buildings. World px (x, y/2). */
  drawGround(ctx: Ctx, sheets: Sheets, x0: number, y0: number, x1: number, y1: number) {
    const t = this.sim.clock;
    const raining = this.sim.rain > 0.35;
    for (const a of this.active) {
      for (const p of a.sites) {
        const px = p.x, py = p.y / 2, R = a.ev.r;
        if (px + R * 2 < x0 || px - R * 2 > x1 || py + R < y0 || py - R > y1) continue;
        if (a.ev.fx.includes('flood')) {
          ctx.fillStyle = 'rgba(70,150,190,0.55)';
          for (let k = 0; k < 7; k++) {
            const ax = px + (h1(k, 1) - 0.5) * R * 2, ay = py + (h1(k, 2) - 0.5) * R;
            const w = 18 + h1(k, 3) * 26;
            ctx.fillRect(Math.round(ax - w / 2), Math.round(ay - w / 6), Math.round(w), Math.round(w / 3));
            ctx.fillRect(Math.round(ax - w / 3), Math.round(ay - w / 4), Math.round(w * 0.66), Math.round(w / 2));
          }
        }
        if (a.ev.fx.includes('crowd')) {
          const count = Math.min(80, Math.round(a.ev.crowd * (raining ? 0.5 : 0.7)));
          for (let k = 0; k < count; k++) {
            const ang = h1(k, 4) * 6.283, rad = Math.sqrt(h1(k, 5)) * R * 0.9;
            const x = Math.round(px + Math.cos(ang) * rad * 1.25 + Math.sin(t * 0.7 + k) * 4);
            const y = Math.round(py + (Math.sin(ang) * rad) / 2 + Math.cos(t * 0.5 + k * 1.7) * 2.5);
            const step = ((t * 4 + k) | 0) & 1;
            const look = k % LOOK_COUNT;
            ctx.drawImage(sheets.ppl, step * PW * PS, look * PH * PS, PW * PS, PH * PS, x - POX, y - POY, PW, PH);
            if (raining) {
              ctx.drawImage(sheets.umbrella, (k % UM_COUNT) * UM_W, 0, UM_W, UM_H, x - 2, y - POY - 2, UM_W, UM_H);
            }
          }
        }
      }
    }
  }

  /** Things in the air, drawn above buildings. */
  drawSky(ctx: Ctx, sheets: Sheets, x0: number, y0: number, x1: number, y1: number) {
    const t = this.sim.clock;
    for (const a of this.active) {
      const p = a.sites[0];
      const px = p.x, py = p.y / 2;
      if (px + 400 < x0 || px - 400 > x1 || py + 200 < y0 || py - 300 > y1) continue;
      if (a.ev.fx.includes('kites')) {
        for (let k = 0; k < 34; k++) {
          const x = px + (h1(k, 6) - 0.5) * a.ev.r * 2.6 + Math.sin(t * 0.8 + k) * 10;
          const y = py + (h1(k, 7) - 0.5) * a.ev.r - 40 - h1(k, 8) * 70 + Math.sin(t * 1.5 + k * 2) * 5;
          ctx.drawImage(sheets.kite, Math.round(x), Math.round(y));
        }
      }
      if (a.ev.fx.includes('ferris')) {
        const cx = px + 70, cy = py - 34, R = 24;
        ctx.fillStyle = '#55555c';
        ctx.fillRect(cx - 1, cy, 2, 34); ctx.fillRect(cx - 9, cy + 30, 18, 3);
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * 6.283 + t * 0.35;
          const x = Math.round(cx + Math.cos(ang) * R), y = Math.round(cy + Math.sin(ang) * R);
          ctx.fillStyle = '#8a8a92';
          for (let d = 4; d < R; d += 4) ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 1, 1);
          ctx.fillStyle = BRIGHT[k % BRIGHT.length];
          ctx.fillRect(x - 1, y - 1, 3, 3);
        }
      }
      if (a.ev.fx.includes('confetti')) {
        ctx.fillStyle = '#f0a030';
        for (let k = 0; k < 70; k++) {
          const x = px + (h1(k, 9) - 0.5) * a.ev.r * 2;
          const y = py - 90 + ((h1(k, 10) * 120 + t * (18 + h1(k, 11) * 14)) % 120);
          ctx.fillRect(Math.round(x + Math.sin(t * 2 + k) * 3), Math.round(y), 1, 1);
        }
      }
    }
  }

  /** Additive glows, drawn in the lights pass. */
  drawLights(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
    const t = this.sim.clock;
    for (const a of this.active) {
      const p = a.sites[0];
      const px = p.x, py = p.y / 2, R = a.ev.r;
      if (px + 500 < x0 || px - 500 > x1 || py + 300 < y0 || py - 400 > y1) continue;
      if (a.ev.fx.includes('strings')) {
        for (let k = 0; k < 90; k++) {
          if (((t * 2.5 + k) | 0) % 3 === 0) continue;
          const row = k % 5, u = (k / 90) * 2 - 1;
          ctx.fillStyle = BRIGHT[k % BRIGHT.length];
          ctx.fillRect(Math.round(px + u * R * 1.2), Math.round(py + (row - 2) * R * 0.16 - 6 - Math.abs(Math.sin(u * 9)) * 4), 2, 2);
        }
      }
      if (a.ev.fx.includes('floodlights')) {
        ctx.fillStyle = 'rgba(255,250,220,0.10)';
        for (let k = 5; k > 0; k--) ctx.fillRect(Math.round(px - k * 34), Math.round(py - k * 15), k * 68, k * 30);
      }
      if (a.ev.fx.includes('laser')) {
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          ctx.strokeStyle = BRIGHT[(k * 2) % BRIGHT.length];
          ctx.beginPath();
          ctx.moveTo(px, py - 6);
          ctx.lineTo(px + Math.sin(t * (0.5 + k * 0.13) + k * 1.9) * 220, py - 150 - Math.cos(t * 0.7 + k) * 40);
          ctx.stroke();
        }
      }
      if (a.ev.fx.includes('fireworks')) {
        // only in the last part of a scheduled event, or all through a forced one
        const late = a.ev.id !== 'match' || this.sim.hour > a.ev.to - 0.4 || this.sim.hour < a.ev.from;
        if (!late) continue;
        for (let b = 0; b < 3; b++) {
          const T = 1.6, ph = t / T + b * 0.37, n = Math.floor(ph), age = ph - n;
          const cx = px + (h1(n, 12 + b) - 0.5) * R * 2, cy = py - 90 - h1(n, 15 + b) * 60;
          ctx.fillStyle = BRIGHT[(n + b) % BRIGHT.length];
          ctx.globalAlpha *= 1 - age * 0.8;
          for (let k = 0; k < 30; k++) {
            const ang = (k / 30) * 6.283, d = age * (30 + h1(k, n) * 26);
            ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d * 0.8 + age * age * 22), 2, 2);
          }
          ctx.globalAlpha /= 1 - age * 0.8;
        }
      }
    }
  }
}
