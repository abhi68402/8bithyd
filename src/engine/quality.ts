// Graphics quality. Every visitor gets the full-quality HIGH tier: sharp
// close-up art, the whole crowd of vehicles and walkers, and a 2x canvas on
// high-density screens. Nothing is lowered automatically. LOW and MEDIUM exist
// only as an opt-in from the GFX button (or ?gfx=low|medium) for a visitor
// whose device struggles.
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
  { name: 'HIGH', dpr: 2, maxPixels: 16e6, hiRes: true, detailCap: 26, coarseCap: 72, tileCap: 150, fetches: 8, agents: 1, bakeMs: 7, rain: 1 },
];

/** The pixel ratio to render at for a window of w x h CSS pixels. */
export function renderDpr(q: Quality, w: number, h: number, deviceDpr: number): number {
  let dpr = Math.min(q.dpr, deviceDpr || 1);
  const px = w * h * dpr * dpr;
  if (px > q.maxPixels) dpr = Math.max(1, Math.sqrt(q.maxPixels / (w * h)));
  // whole and half steps keep the pixel art even
  return dpr >= 1.5 ? Math.floor(dpr * 2) / 2 : 1;
}

export type Tier = 0 | 1 | 2;
const HIGH: Tier = 2;
// new key, so a lower tier left over from the old auto mode does not stick
const KEY = 'hyderabad-days.gfx2';

export class QualityManager {
  tier: Tier = HIGH;
  onChange: (q: Quality) => void = () => {};

  constructor(query: string) {
    const named = ['low', 'medium', 'high'].indexOf(new URLSearchParams(query).get('gfx') ?? '');
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const pin = named >= 0 ? named : saved === '0' || saved === '1' ? Number(saved) : HIGH;
    this.tier = pin as Tier;
  }

  get q(): Quality { return TIERS[this.tier]; }
  get label(): string { return this.q.name; }

  /** HIGH -> MEDIUM -> LOW -> HIGH */
  cycle() { this.set(this.tier === 0 ? HIGH : ((this.tier - 1) as Tier)); }

  set(t: Tier) {
    this.tier = t;
    try { if (t === HIGH) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(t)); } catch { /* storage blocked */ }
    this.onChange(this.q);
  }
}
