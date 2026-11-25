// Universal full-quality graphics configuration: sharp close-up art,
// full vehicle/walker simulation, and 2x pixel-art rendering on high-density
// screens for every visitor.
export interface Quality {
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

export const QUALITY: Quality = {
  dpr: 2,
  maxPixels: 16e6,
  hiRes: true,
  detailCap: 28,
  coarseCap: 72,
  tileCap: 160,
  fetches: 8,
  agents: 1,
  bakeMs: 8,
  rain: 1,
};

/** The pixel ratio to render at for a window of w x h CSS pixels. */
export function renderDpr(w: number, h: number, deviceDpr: number, q: Quality = QUALITY): number {
  let dpr = Math.min(q.dpr, deviceDpr || 1);
  const px = w * h * dpr * dpr;
  if (px > q.maxPixels) dpr = Math.max(1, Math.sqrt(q.maxPixels / (w * h)));
  // whole and half steps keep the pixel art even
  return dpr >= 1.5 ? Math.floor(dpr * 2) / 2 : 1;
}
