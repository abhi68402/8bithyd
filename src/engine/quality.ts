// Graphics quality by device. A tier is picked once from what the browser
// reveals about the hardware, then a small governor watches real frame times
// and steps down if the device cannot keep up (and back up once, if it turns
// out to have room). The visitor can also pin a tier.
export interface Quality {
  name: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Cap on device pixels per CSS pixel. */
  dpr: number;
  /** Cap on canvas size in device pixels; the pixel ratio drops to fit. */
  maxPixels: number;
  /** Close-up layers at double detail. */
  hiRes: boolean;
  /** Baked chunks and map tiles kept in memory. */
  detailCap: number; coarseCap: number; tileCap: number;
  /** Tiles fetched at once. */
  fetches: number;
  /** Share of the full crowd of vehicles and walkers. */
  agents: number;
  /** Milliseconds per frame spent baking new map chunks. */
  bakeMs: number;
  /** Share of rain streaks drawn. */
  rain: number;
}

export const TIERS: Quality[] = [
  { name: 'LOW', dpr: 1, maxPixels: 1.3e6, hiRes: false, detailCap: 12, coarseCap: 28, tileCap: 70, fetches: 4, agents: 0.45, bakeMs: 4, rain: 0.4 },
  { name: 'MEDIUM', dpr: 2, maxPixels: 2.6e6, hiRes: false, detailCap: 18, coarseCap: 48, tileCap: 110, fetches: 6, agents: 0.75, bakeMs: 5.5, rain: 0.7 },
  { name: 'HIGH', dpr: 2, maxPixels: 6e6, hiRes: true, detailCap: 26, coarseCap: 72, tileCap: 150, fetches: 8, agents: 1, bakeMs: 7, rain: 1 },
];

export interface Device { memory?: number; cores?: number; mobile: boolean; saveData: boolean }

/** 0 low, 1 medium, 2 high. */
export function pickTier(d: Device): number {
  const mem = d.memory ?? (d.mobile ? 4 : 8), cores = d.cores ?? (d.mobile ? 4 : 8);
  if (d.saveData || mem <= 2 || cores <= 2) return 0;
  if (d.mobile || mem <= 4 || cores <= 4) return 1;
  return 2;
}

export function readDevice(): Device {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    mobile: coarse && Math.min(screen.width, screen.height) < 900,
    saveData: !!nav.connection?.saveData,
  };
}

/** The pixel ratio to render at for a window of w x h CSS pixels. */
export function renderDpr(q: Quality, w: number, h: number, deviceDpr: number): number {
  let dpr = Math.min(q.dpr, deviceDpr || 1);
  const px = w * h * dpr * dpr;
  if (px > q.maxPixels) dpr = Math.max(1, Math.sqrt(q.maxPixels / (w * h)));
  // whole and half steps keep the pixel art even
  return dpr >= 1.5 ? Math.floor(dpr * 2) / 2 : 1;
}

export type Choice = 'auto' | 0 | 1 | 2;
const KEY = 'hyderabad-days.gfx';
const WINDOW = 90; // frames per judgement

export class QualityManager {
  choice: Choice = 'auto';
  tier: number;
  readonly deviceTier: number;
  onChange: (q: Quality) => void = () => {};
  private n = 0; private slow = 0; private work = 0;
  private badWindows = 0; private goodWindows = 0; private ups = 1; private cool = 0;

  constructor(device: Device, query: string) {
    this.deviceTier = pickTier(device);
    this.tier = this.deviceTier;
    const named = ['low', 'medium', 'high'].indexOf(new URLSearchParams(query).get('gfx') ?? '');
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const pin = named >= 0 ? named : saved !== null && saved !== 'auto' ? Number(saved) : -1;
    if (pin === 0 || pin === 1 || pin === 2) { this.choice = pin; this.tier = pin; }
  }

  get q(): Quality { return TIERS[this.tier]; }
  get label(): string { return this.choice === 'auto' ? `AUTO · ${this.q.name}` : this.q.name; }

  /** AUTO -> LOW -> MEDIUM -> HIGH -> AUTO */
  cycle() { this.set(this.choice === 'auto' ? 0 : this.choice === 2 ? 'auto' : ((this.choice + 1) as Choice)); }

  set(c: Choice) {
    this.choice = c;
    try { localStorage.setItem(KEY, String(c)); } catch { /* storage blocked */ }
    this.badWindows = this.goodWindows = this.n = this.slow = this.work = 0;
    this.ups = 1;
    this.go(c === 'auto' ? this.deviceTier : c);
  }

  private go(tier: number) {
    if (tier === this.tier) { this.onChange(this.q); return; }
    this.tier = tier;
    this.cool = 3; // let caches settle before judging again
    this.onChange(this.q);
  }

  /** Feed every frame: time since the last frame and time spent working, ms. `busy` = baking a burst of new map. */
  frame(raw: number, work: number, busy: boolean) {
    if (this.choice !== 'auto' || raw > 250) return; // pinned, or the tab was asleep
    if (this.cool > 0) { this.cool -= raw / 1000; return; }
    this.n++;
    this.work += work;
    if (raw > 26 && !busy) this.slow++;
    if (this.n < WINDOW) return;
    const slow = this.slow / this.n, work1 = this.work / this.n;
    this.n = this.slow = this.work = 0;
    if (slow > 0.3) { this.badWindows++; this.goodWindows = 0; }
    else if (slow < 0.03 && work1 < 5) { this.goodWindows++; this.badWindows = 0; }
    else { this.badWindows = 0; this.goodWindows = 0; }
    if (this.badWindows >= 2 && this.tier > 0) { this.badWindows = 0; this.go(this.tier - 1); }
    else if (this.goodWindows >= 10 && this.tier < this.deviceTier && this.ups > 0) { this.goodWindows = 0; this.ups--; this.go(this.tier + 1); }
  }
}
