// Sprite sheets for everything that moves, at city scale (1 px = 1 m, with
// vehicles drawn about twice life size so they stay readable). Vehicles have
// eight headings: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE.
import { Painter, mkCanvas, shade } from './paint';

export const VW = 24, VH = 20, VOX = 12, VOY = 15;
export const PW = 3, PH = 6, POX = 1, POY = 5;
/** People are painted at PS x detail and drawn scaled down, so they stay smooth up close. */
export const PS = 2;
export const TW_ = 30, TH_ = 24, TOX = 15, TOY = 19;
export const UM_W = 5, UM_H = 4, UM_COUNT = 5;

type Kind = 'auto' | 'bike' | 'car' | 'bus' | 'truck' | 'patrol' | 'ambulance' | 'delivery';
export const VEH_ROWS: { kind: Kind; color: string; label: string; speed: number }[] = [
  { kind: 'auto', color: '#f2c81e', label: 'Auto-rickshaw', speed: 11 },
  { kind: 'auto', color: '#5fae3a', label: 'CNG auto', speed: 11 },
  { kind: 'bike', color: '#d8433b', label: 'Scooter', speed: 14 },
  { kind: 'bike', color: '#3b78d8', label: 'Motorbike', speed: 15 },
  { kind: 'bike', color: '#33333a', label: 'Motorbike', speed: 15 },
  { kind: 'car', color: '#f2f2f4', label: 'Car', speed: 14 },
  { kind: 'car', color: '#c8402f', label: 'Car', speed: 14 },
  { kind: 'car', color: '#3f6fb5', label: 'Car', speed: 14 },
  { kind: 'car', color: '#8a8f98', label: 'Car', speed: 13 },
  { kind: 'car', color: '#2f2f36', label: 'Cab', speed: 14 },
  { kind: 'car', color: '#e8b040', label: 'Car', speed: 13 },
  { kind: 'bus', color: '#c8402f', label: 'TSRTC City bus', speed: 10 },
  { kind: 'bus', color: '#2f8a5a', label: 'Metro Express bus', speed: 10 },
  { kind: 'truck', color: '#e2803a', label: 'Lorry', speed: 9 },
  { kind: 'truck', color: '#3f7ab5', label: 'Water tanker', speed: 9 },
  { kind: 'bus', color: '#2b6cb8', label: 'Pushpak Airport Liner', speed: 11 },
  { kind: 'bus', color: '#e8b824', label: 'School bus', speed: 9 },
  { kind: 'patrol', color: '#f2f4f8', label: 'Traffic police patrol', speed: 15 },
  { kind: 'ambulance', color: '#f8f8fa', label: '108 Ambulance', speed: 16 },
  { kind: 'delivery', color: '#e85a2a', label: 'Delivery rider', speed: 15 },
  { kind: 'bus', color: '#34a86e', label: 'RTC Electric bus', speed: 11 },
  { kind: 'bus', color: '#c83430', label: 'Heritage Tourist bus', speed: 9 },
  { kind: 'auto', color: '#2d7a9c', label: 'Goods auto', speed: 10 },
  { kind: 'bike', color: '#d89a2a', label: 'Cycle commuter', speed: 7 },
  { kind: 'truck', color: '#e6b830', label: 'Concrete mixer', speed: 8 },
  { kind: 'delivery', color: '#d82b48', label: 'Quick-commerce rider', speed: 16 },
  { kind: 'car', color: '#eef2f6', label: 'White SUV', speed: 15 },
];
/** Rows to pick from, weighted: bikes, autos, and delivery scooters dominate Hyderabad traffic. */
export const VEH_MIX = [
  0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 5, 11, 12, 13, 14, 0, 2, 3,
  19, 19, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 25, 26,
];

// Diagonal sprites are little iso boxes; k sets their size so a vehicle is
// the same length on screen whichever way it is heading.
class Small extends Painter {
  k = 0.3;
  X(u: number, v: number) { return this.ox + (u - v) * 16 * this.k; }
  Y(u: number, v: number, z: number) { return this.oy + (u + v) * 8 * this.k - z * this.k; }
}

/** Diagonal views: little iso boxes. dir 0=SE 1=SW 2=NW 3=NE. */
function paintDiag(p: Painter, kind: Kind, color: string, dir: number) {
  const m = (a: number, b: number): [number, number] => dir === 0 ? [a, b] : dir === 1 ? [-b, a] : dir === 2 ? [-a, -b] : [b, -a];
  let ext = { u0: 0, v0: 0, u1: 0, v1: 0 };
  const box = (a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, c: string) => {
    const [ua, va] = m(a0, b0), [ub, vb] = m(a1, b1);
    ext = { u0: Math.min(ua, ub), v0: Math.min(va, vb), u1: Math.max(ua, ub), v1: Math.max(va, vb) };
    p.box(ext.u0, ext.v0, ext.u1, ext.v1, z0, z1, c);
  };
  const sideL = dir % 2 === 0, sgn = dir < 2 ? 1 : -1, front = dir < 2;
  const side = (a0: number, a1: number, z0: number, z1: number, c: string) => {
    const lo = Math.min(sgn * a0, sgn * a1), hi = Math.max(sgn * a0, sgn * a1);
    p.face(sideL ? 'L' : 'R', lo, hi, sideL ? ext.v1 : ext.u1, z0, z1, sideL ? c : shade(c, 0.8));
  };
  const end = (b0: number, b1: number, z0: number, z1: number, c: string, glow?: string) => {
    const s = sideL ? 'R' : 'L', k = sideL ? ext.u1 : ext.v1;
    p.face(s, b0, b1, k, z0, z1, c);
    if (glow) p.glowFace(s, b0, b1, k, z0, z1, glow);
  };
  const lamps = (w: number, z: number) => { const c = front ? '#fff3c0' : '#e23a2a'; end(-w, w, z, z + 2.5, c, c); };
  const glass = '#2c3e52';
  if (kind === 'car' || kind === 'patrol') {
    box(-0.5, 0.5, -0.26, 0.26, 1, 6, color); lamps(0.26, 2);
    if (kind === 'patrol') side(-0.46, 0.46, 2, 4, '#2458a8');
    box(-0.3, 0.2, -0.24, 0.24, 6, 11, shade(color, 1.05));
    side(-0.26, 0.16, 6, 10, glass); end(-0.2, 0.2, 6, 10, shade(glass, front ? 1.2 : 0.9));
    if (kind === 'patrol') {
      p.px(0, 0, 12, '#e23a2a', -2, -1, 2, 2);
      p.px(0, 0, 12, '#3b9eff', 0, -1, 2, 2);
      p.glowPx(0, 0, 12, '#ff4840', -2, -1, 2, 2);
      p.glowPx(0, 0, 12, '#58b8ff', 0, -1, 2, 2);
    }
  } else if (kind === 'ambulance') {
    box(-0.56, 0.56, -0.28, 0.28, 1, 12, color); lamps(0.26, 2);
    side(-0.52, 0.52, 4, 6, '#e23a2a');
    side(0.14, 0.46, 7, 10, glass); end(-0.22, 0.22, 7, 10, shade(glass, front ? 1.2 : 0.9));
    p.px(0.1, 0, 13, '#e23a2a', -1, -1, 2, 2);
    p.glowPx(0.1, 0, 13, '#ff4840', -1, -1, 2, 2);
  } else if (kind === 'auto') {
    box(-0.36, 0.36, -0.22, 0.22, 1, 6, '#2f2f33'); lamps(0.16, 2);
    box(-0.36, 0.26, -0.22, 0.22, 6, 13, color); side(-0.18, 0.16, 6, 11, '#3a3a40');
  } else if (kind === 'bike' || kind === 'delivery') {
    box(-0.3, 0.3, -0.07, 0.07, 1, 6, color); lamps(0.07, 3);
    p.px(0, 0, 6, '#3f5f8a', -1, -3, 2, 3); p.px(0, 0, 6, '#22222a', -1, -5, 2, 2);
    if (kind === 'delivery') {
      const [bx, by] = m(-0.26, 0);
      p.px(bx, by, 7, '#ff6a2a', -1, -3, 3, 3);
    }
  } else if (kind === 'bus') {
    box(-0.82, 0.82, -0.3, 0.3, 1, 15, color); lamps(0.28, 2);
    side(-0.82, 0.82, 6, 8, color === '#e8b824' ? '#2c2c34' : '#f4efe0'); side(-0.74, 0.74, 9, 13, glass);
    end(-0.24, 0.24, 8, 13, shade(glass, front ? 1.2 : 0.9));
    p.top(ext.u0 + 0.06, ext.v0 + 0.06, ext.u1 - 0.06, ext.v1 - 0.06, 15, shade(color, 1.2));
  } else {
    box(-0.64, 0.24, -0.28, 0.28, 1, 13, color === '#3f7ab5' ? '#c9ccd2' : '#9a7a52');
    if (!front) lamps(0.26, 2);
    box(0.24, 0.64, -0.28, 0.28, 1, 12, color);
    if (front) { lamps(0.26, 2); end(-0.22, 0.22, 7, 11, shade(glass, 1.2)); }
    side(0.32, 0.58, 7, 11, glass);
  }
}

const DIM: Record<Kind, [len: number, wid: number, hgt: number]> = {
  car: [8, 5, 4], auto: [6, 4, 5], bike: [5, 2, 3], bus: [14, 5, 6],
  truck: [12, 5, 6], patrol: [8, 5, 4], ambulance: [10, 5, 6], delivery: [5, 2, 3],
};

/** Cardinal views drawn straight in pixels. dir 0=E 2=S 4=W 6=N. */
function paintCard(c: CanvasRenderingContext2D, l: CanvasRenderingContext2D, kind: Kind, color: string, dir: number) {
  const [len, wid, hgt] = DIM[kind];
  const r = (x: number, y: number, w: number, h: number, col: string, ctx = c) => { ctx.fillStyle = col; ctx.fillRect(Math.round(VOX + x), Math.round(VOY + y), w, h); };
  const glass = '#2c3e52', top = shade(color, 1.12), body = kind === 'auto' ? '#2f2f33' : shade(color, 0.86);
  const roofD = Math.max(1, Math.round(wid / 2));
  if (dir === 0 || dir === 4) {
    const x = -Math.round(len / 2), f = dir === 0 ? 1 : -1;
    r(x, -hgt - roofD, len, roofD, top);
    r(x, -hgt, len, hgt, kind === 'auto' ? color : body);
    if (kind === 'auto') r(x, -2, len, 2, '#2f2f33');
    if (kind !== 'bike' && kind !== 'delivery') r(x + 1, -hgt + 1, len - 2, Math.max(1, hgt - 4), glass);
    if (kind === 'bus') r(x, -3, len, 1, color === '#e8b824' ? '#2c2c34' : '#f4efe0');
    if (kind === 'patrol') {
      r(x, -2, len, 1, '#2458a8');
      r(-1, -hgt - roofD - 1, 1, 1, '#e23a2a'); r(0, -hgt - roofD - 1, 1, 1, '#3b9eff');
      r(-1, -hgt - roofD - 1, 1, 1, '#ff4840', l); r(0, -hgt - roofD - 1, 1, 1, '#58b8ff', l);
    }
    if (kind === 'ambulance') {
      r(x, -3, len, 1, '#e23a2a');
      r(0, -hgt - roofD - 1, 2, 1, '#e23a2a'); r(0, -hgt - roofD - 1, 2, 1, '#ff4840', l);
    }
    if (kind === 'truck') r(f > 0 ? x : x + 4, -hgt - roofD, len - 4, hgt + roofD - 1, color === '#3f7ab5' ? '#c9ccd2' : '#9a7a52');
    r(x + 1, -1, 2, 1, '#1c1c22'); r(x + len - 3, -1, 2, 1, '#1c1c22');
    const fx = f > 0 ? x + len - 1 : x, bx = f > 0 ? x : x + len - 1;
    r(fx, -3, 1, 1, '#fff3c0'); r(fx, -3, 1, 1, '#fff3c0', l);
    // subtle forward headlight glow pool
    l.fillStyle = 'rgba(255,240,180,0.22)';
    l.fillRect(Math.round(VOX + (f > 0 ? fx + 1 : fx - 5)), Math.round(VOY - 3), 5, 3);
    r(bx, -3, 1, 1, '#e23a2a'); r(bx, -3, 1, 1, '#e23a2a', l);
    if (kind === 'bike' || kind === 'delivery') {
      r(-1, -hgt - 3, 2, 3, '#3f5f8a'); r(-1, -hgt - 5, 2, 2, '#22222a');
      if (kind === 'delivery') r(f > 0 ? x : x + 2, -hgt - 3, 3, 3, '#ff6a2a');
    }
  } else {
    const x = -Math.floor(wid / 2), d = Math.max(2, Math.round(len / 2)), south = dir === 2;
    r(x, -hgt - d, wid, d, top);
    if (kind === 'truck') r(x, south ? -hgt - d : -hgt - d + 2, wid, d - 2, color === '#3f7ab5' ? '#c9ccd2' : '#9a7a52');
    r(x, -hgt, wid, hgt, kind === 'auto' ? color : body);
    if (kind === 'patrol') {
      r(x, -2, wid, 1, '#2458a8');
      r(x + 1, -hgt - d, 1, 1, '#e23a2a'); r(x + 3, -hgt - d, 1, 1, '#3b9eff');
      r(x + 1, -hgt - d, 1, 1, '#ff4840', l); r(x + 3, -hgt - d, 1, 1, '#58b8ff', l);
    }
    if (kind === 'ambulance') {
      r(x, -3, wid, 1, '#e23a2a');
      r(x + 1, -hgt - d, 2, 1, '#e23a2a'); r(x + 1, -hgt - d, 2, 1, '#ff4840', l);
    }
    if (kind !== 'bike' && kind !== 'delivery') r(x + 1, -hgt, wid - 2, Math.max(1, hgt - 3), south ? shade(glass, 1.2) : glass);
    const lc = south ? '#fff3c0' : '#e23a2a';
    r(x, -2, 1, 1, lc); r(x + wid - 1, -2, 1, 1, lc);
    r(x, -2, 1, 1, lc, l); r(x + wid - 1, -2, 1, 1, lc, l);
    if (south) {
      l.fillStyle = 'rgba(255,240,180,0.20)';
      l.fillRect(Math.round(VOX + x - 1), Math.round(VOY - 1), wid + 2, 3);
    }
    if (kind === 'bike' || kind === 'delivery') {
      r(x, -hgt - 3, 2, 3, '#3f5f8a'); r(x, -hgt - 5, 2, 2, '#22222a');
      if (kind === 'delivery' && !south) r(x, -hgt - 2, 2, 2, '#ff6a2a');
    }
  }
}

const SKIN = ['#c68a5c', '#a86f47'];
const OUTFITS: [body: string, legs: string, hair: string][] = [
  ['#e8e4d8', '#3a3a48', '#22201c'], ['#3f7ab5', '#2f2f3a', '#22201c'], ['#d8433b', '#d8433b', '#22201c'], ['#e8a02a', '#b86a2a', '#22201c'],
  ['#1f1f24', '#1f1f24', '#1f1f24'], ['#f4f2ea', '#f4f2ea', '#f4f2ea'], ['#3fa07a', '#3fa07a', '#22201c'], ['#f4f2ea', '#3f5fa8', '#22201c'],
  ['#c94f9a', '#7a3f8a', '#22201c'], ['#6a8a4a', '#4a4038', '#55504a'],
  ['#f0743a', '#f4f2ea', '#22201c'], ['#4ea6b8', '#2b3e52', '#22201c'],
  ['#f2c84a', '#5a3a28', '#22201c'], ['#8a52a8', '#f4f2ea', '#22201c'],
];
export const LOOK_COUNT = OUTFITS.length * SKIN.length;

const ICONS: string[][] = [
  ['..w.w..', '.w.w...', 'bbbbb..', 'bcccbb.', 'bcccb.b', 'bcccbb.', '.bbb...'],
  ['...y...', '..yoy..', '.yoyoy.', 'ggggggg', 'g.....g', '.ggggg.', '.......'],
  ['.....w.', '....w..', '...w...', '..w....', '.t.....', 't...r..', '....r..'],
  ['.r...r.', 'rrr.rrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  ['..kkkk.', '..k..k.', '..k..k.', '..k..k.', 'kkk.kkk', 'kkk.kkk', '.......'],
  ['kkkk...', '..k....', '.k.....', 'kkkk...', '....kkk', '.....k.', '....kkk'],
  ['.kkk...', '.krk...', '.kkk...', '.kyk...', '.kkk...', '.kgk...', '.kkk...'],
  ['.bbbbb.', 'bwbbbw.', 'bbbbbbb', 'bbbbbbb', '..k.k..', '.k...k.', '.......'],
  ['..ccc..', '.ccccc.', 'ccccccc', '..c.c..', '..c....', '..cc...', '.......'],
];
const PAL: Record<string, string> = { w: '#f4f4f4', b: '#e8e0d0', c: '#48a8d8', y: '#f2c84a', o: '#e88a2a', g: '#8a8f98', t: '#b8834a', r: '#e23a3a', k: '#33333a' };
export const ICON_NAMES = [
  'craving chai', 'dreaming of biryani', 'thinking about cricket', 'in love',
  'humming a song', 'sleepy', 'stuck in traffic', 'catching the metro', 'dodging puddles',
  'eating Osmania biscuits', 'heading to Hitec City', 'admiring Charminar',
];

export interface Sheets {
  veh: HTMLCanvasElement; vehL: HTMLCanvasElement;
  ppl: HTMLCanvasElement;
  umbrella: HTMLCanvasElement;
  train: HTMLCanvasElement; trainL: HTMLCanvasElement;
  mmts: HTMLCanvasElement; mmtsL: HTMLCanvasElement;
  icons: HTMLCanvasElement;
  boat: HTMLCanvasElement;
  kite: HTMLCanvasElement;
  plane: HTMLCanvasElement;
}

export function buildSheets(lineColors: string[]): Sheets {
  const veh = mkCanvas(VW * 8, VH * VEH_ROWS.length), vehL = mkCanvas(VW * 8, VH * VEH_ROWS.length);
  const vc = veh.getContext('2d')!, vl = vehL.getContext('2d')!;
  VEH_ROWS.forEach((row, ri) => {
    for (let d = 0; d < 8; d++) {
      vc.save(); vl.save();
      vc.translate(d * VW, ri * VH); vl.translate(d * VW, ri * VH);
      if (d % 2) {
        const p = new Small(VW, VH, VOX, VOY);
        paintDiag(p, row.kind, row.color, (d - 1) / 2);
        vc.drawImage(p.c, 0, 0);
        if (p.lc) vl.drawImage(p.lc, 0, 0);
      } else paintCard(vc, vl, row.kind, row.color, d);
      vc.restore(); vl.restore();
    }
  });

  // people: rows = look, columns = walk frame
  const ppl = mkCanvas(PW * PS * 2, PH * PS * LOOK_COUNT);
  const pc = ppl.getContext('2d')!;
  OUTFITS.forEach(([body, legs, hair], oi) => SKIN.forEach((skin, si) => {
    for (let f = 0; f < 2; f++) {
      const x = f * PW * PS, y = (oi * SKIN.length + si) * PH * PS;
      const r = (dx: number, dy: number, w: number, h: number, c: string) => { pc.fillStyle = c; pc.fillRect(x + dx, y + dy, w, h); };
      const bs = shade(body, 0.8), ls = shade(legs, 0.85), shoe = '#2a2228';
      r(2, 0, 2, 1, hair); r(2, 1, 2, 2, skin); r(3, 2, 1, 1, shade(skin, 0.88));
      r(1, 3, 4, 5, body); r(4, 3, 1, 5, bs);
      if (f) { r(0, 3, 1, 2, body); r(0, 5, 1, 1, skin); r(5, 4, 1, 2, bs); r(5, 6, 1, 1, skin); }
      else { r(0, 4, 1, 2, body); r(0, 6, 1, 1, skin); r(5, 3, 1, 2, bs); r(5, 5, 1, 1, skin); }
      if (f) { r(1, 8, 1, 3, legs); r(4, 8, 1, 3, ls); r(1, 11, 1, 1, shoe); r(4, 11, 1, 1, shoe); r(2, 8, 2, 1, legs); }
      else { r(2, 8, 1, 3, legs); r(3, 8, 1, 3, ls); r(2, 11, 2, 1, shoe); }
    }
  }));

  // umbrellas for rainy walks (5 colours)
  const umbrella = mkCanvas(UM_W * UM_COUNT, UM_H);
  const uc = umbrella.getContext('2d')!;
  ['#e23a3a', '#3b78d8', '#f0a030', '#2f2f38', '#3fa07a'].forEach((col, i) => {
    const x = i * UM_W;
    uc.fillStyle = shade(col, 1.15); uc.fillRect(x + 1, 0, 3, 1);
    uc.fillStyle = col; uc.fillRect(x, 1, 5, 1);
    uc.fillStyle = shade(col, 0.78); uc.fillRect(x, 2, 5, 1);
    uc.fillStyle = '#3a3030'; uc.fillRect(x + 2, 3, 1, 1);
  });

  // metro cars: rows = line, cols = orientation E-W, SE, N-S, SW
  const paintRailSheet = (colors: string[], body: string, stripe2?: string) => {
    const sh = mkCanvas(TW_ * 4, TH_ * colors.length), shL = mkCanvas(TW_ * 4, TH_ * colors.length);
    const tc = sh.getContext('2d')!, tl = shL.getContext('2d')!;
    colors.forEach((col, li) => {
      const glass = '#2c3e52';
      for (let o = 0; o < 4; o++) {
        const x0 = o * TW_, y0 = li * TH_;
        const r = (x: number, y: number, w: number, h: number, c: string, ctx = tc) => { ctx.fillStyle = c; ctx.fillRect(x0 + TOX + x, y0 + TOY + y, w, h); };
        if (o === 0) {
          r(-10, -9, 20, 1, '#dfe2e6'); r(-7, -10, 4, 1, '#c4c8cd'); r(3, -10, 4, 1, '#c4c8cd');
          r(-10, -8, 20, 6, body); r(-10, -8, 1, 6, '#b8bcc2'); r(9, -8, 1, 6, '#c8ccd1');
          for (const wx of [-9, -4, 1, 6]) { r(wx, -7, 3, 2, glass); r(wx, -7, 3, 2, '#ffe9b0', tl); }
          for (const dx of [-6, 4]) { r(dx, -7, 2, 5, '#c9cdd2'); r(dx, -7, 2, 1, glass); }
          r(-10, -4, 20, 1, col);
          if (stripe2) r(-10, -3, 20, 1, stripe2);
          r(-9, -2, 18, 1, '#4a4f57'); r(-8, -1, 4, 1, '#2b2e33'); r(4, -1, 4, 1, '#2b2e33');
        } else if (o === 2) {
          r(-2, -15, 5, 9, '#dfe2e6'); r(2, -15, 1, 9, '#c9ccd1'); r(-1, -13, 3, 2, '#c4c8cd'); r(-1, -9, 3, 2, '#c4c8cd');
          r(-2, -6, 5, 5, body); r(-1, -5, 3, 2, glass); r(-1, -5, 3, 2, '#ffe9b0', tl); r(-2, -3, 5, 1, col);
          if (stripe2) r(-2, -2, 5, 1, stripe2);
          r(-2, -1, 5, 1, '#3a3e45');
        } else {
          const p = new Small(TW_, TH_, TOX, TOY - 1);
          p.k = 0.4;
          if (o === 1) {
            p.box(-1.1, -0.34, 1.1, 0.34, 2, 14, body); p.left(-1.1, 1.1, 0.34, 3, 5, col);
            if (stripe2) p.left(-1.1, 1.1, 0.34, 2, 3, stripe2);
            p.left(-1, 1, 0.34, 7, 12, glass);
            p.glowFace('L', -1, 1, 0.34, 7, 12, '#cfe0b8'); p.right(1.1, -0.24, 0.24, 6, 12, glass);
          } else {
            p.box(-0.34, -1.1, 0.34, 1.1, 2, 14, body); p.right(0.34, -1.1, 1.1, 3, 5, shade(col, 0.8));
            if (stripe2) p.right(0.34, -1.1, 1.1, 2, 3, shade(stripe2, 0.8));
            p.right(0.34, -1, 1, 7, 12, '#22303f');
            p.glowFace('R', -1, 1, 0.34, 7, 12, '#b8c8a0'); p.left(-0.24, 0.24, 1.1, 6, 12, glass);
          }
          tc.drawImage(p.c, x0, y0);
          if (p.lc) tl.drawImage(p.lc, x0, y0);
        }
      }
    });
    return [sh, shL] as const;
  };
  const [train, trainL] = paintRailSheet(lineColors, '#eceef0');
  const [mmts, mmtsL] = paintRailSheet(['#2e8b57'], '#e8e4d4', '#f0b828');

  const icons = mkCanvas(11 * ICONS.length, 13);
  const ic = icons.getContext('2d')!;
  ICONS.forEach((rows, i) => {
    const x = i * 11;
    ic.fillStyle = '#2a1f3a'; ic.fillRect(x + 1, 0, 9, 11); ic.fillRect(x, 1, 11, 9); ic.fillRect(x + 4, 11, 2, 2);
    ic.fillStyle = '#fbf6e6'; ic.fillRect(x + 1, 1, 9, 9); ic.fillRect(x + 4, 10, 2, 2);
    rows.forEach((row, yy) => { for (let xx = 0; xx < 7; xx++) { const ch = row[xx]; if (ch !== '.') { ic.fillStyle = PAL[ch]; ic.fillRect(x + 2 + xx, 2 + yy, 1, 1); } } });
  });

  const boat = mkCanvas(28, 10);
  const bc = boat.getContext('2d')!;
  for (let f = 0; f < 2; f++) {
    const x = f * 14;
    const r = (dx: number, dy: number, w: number, h: number, c: string) => { bc.fillStyle = c; bc.fillRect(x + (f ? 14 - dx - w : dx), dy, w, h); };
    r(1, 6, 12, 2, '#f4f2ea'); r(2, 8, 10, 1, '#c8402f'); r(3, 2, 7, 4, '#e8b040'); r(3, 2, 7, 1, '#f4d070'); r(4, 4, 5, 2, '#2c3e52'); r(11, 5, 2, 1, '#f4f2ea');
  }

  const kite = mkCanvas(9, 16);
  const kc = kite.getContext('2d')!;
  const rows = ['....r....', '...rrr...', '..rryrr..', '.rrryrrr.', 'yyyyyyyyy', '.oooyooo.', '..ooyoo..', '...oyo...', '....y....'];
  rows.forEach((row, y) => { for (let x = 0; x < 9; x++) { const ch = row[x]; if (ch !== '.') { kc.fillStyle = ch === 'r' ? '#e23a5a' : ch === 'o' ? '#f08a30' : '#fbf0c0'; kc.fillRect(x, y, 1, 1); } } });
  kc.fillStyle = '#fbf0c0';
  for (let i = 0; i < 6; i++) kc.fillRect(4 + (i % 2 ? 1 : 0), 9 + i, 1, 1);

  // airliner, side view; column 0 heads east, column 1 west
  const plane = mkCanvas(88, 18);
  const pc2 = plane.getContext('2d')!;
  for (let f = 0; f < 2; f++) {
    const r = (dx: number, dy: number, w: number, h: number, c: string) => { pc2.fillStyle = c; pc2.fillRect(f ? 88 - dx - w : dx, dy, w, h); };
    r(4, 8, 34, 5, '#f2f2f4'); r(38, 9, 3, 3, '#f2f2f4'); r(41, 10, 1, 1, '#f2f2f4'); r(4, 12, 34, 1, '#cfd3d8');
    r(8, 9, 28, 1, '#3f5c72'); r(37, 9, 2, 1, '#2c3e52');
    r(2, 2, 5, 7, '#e2603a'); r(1, 2, 3, 2, '#e2603a'); r(1, 8, 6, 2, '#dcdce0');
    r(16, 11, 12, 3, '#dcdce0'); r(14, 13, 12, 2, '#c4c6cc'); r(20, 14, 5, 3, '#8a8a92');
  }
  return { veh, vehL, ppl, umbrella, train, trainL, mmts, mmtsL, icons, boat, kite, plane };
}
