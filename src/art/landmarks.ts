// Hand-composed landmark sprites. Stylised pixel interpretations, not models.
import { mkSprite, shade, type Painter, type Sprite } from './paint';
import { hash2, type Rng } from '../world/rng';

const DARK = '#4a4038';
const GOLD = '#d9b24a';
const GLOW = '#b8873a';
const WATER = '#4f9db3';
const WIN = '#33465e';

type LM = (r: Rng) => Sprite;

/** Building block with an arcade on both visible faces. */
function hall(p: Painter, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, c: string, nL: number, nR: number, ah = 0.6, glow: string | undefined = GLOW) {
  p.box(u0, v0, u1, v1, z0, z1, c);
  const az = z0 + (z1 - z0) * ah;
  if (nL) p.arcade('L', u0 + 0.08, u1 - 0.08, v1, z0 + 1, az, nL, DARK, glow);
  if (nR) p.arcade('R', v0 + 0.08, v1 - 0.08, u1, z0 + 1, az, nR, shade(DARK, 0.8), glow && shade(glow, 0.8));
}
function crenel(p: Painter, u0: number, v0: number, u1: number, v1: number, z: number, c: string) {
  for (let u = u0; u < u1 - 0.05; u += 0.25) p.left(u, u + 0.12, v1, z, z + 2, shade(c, 0.84));
  for (let v = v0; v < v1 - 0.05; v += 0.25) p.right(u1, v, v + 0.12, z, z + 2, shade(c, 0.66));
}
function gate(p: Painter, u0: number, u1: number, v: number, h: number, c: string, beam: string) {
  p.box(u0, v - 0.12, u0 + 0.22, v + 0.12, 0, h, c);
  p.box(u1 - 0.22, v - 0.12, u1, v + 0.12, 0, h, c);
  p.box(u0, v - 0.14, u1, v + 0.14, h, h + 5, beam);
  p.glowFace('L', u0 + 0.22, u1 - 0.22, v + 0.12, 0, h, '#7a5a26');
}
function stadium(p: Painter, n: number, seat: string, track: boolean, r: Rng) {
  const c = n / 2, R = n / 2 - 0.3, s = 0.25;
  for (let v = 0; v < n; v += s) {
    for (let u = 0; u < n; u += s) {
      const rho = Math.hypot(u + s / 2 - c, v + s / 2 - c) / R;
      if (rho > 1) continue;
      if (rho > 0.62) {
        const front = u + v > n + 0.5;
        let h = 4 + ((rho - 0.62) / 0.38) * (front ? 11 : 24);
        h = Math.round(h / 3) * 3;
        const col = rho > 0.95 ? '#cfcfd6' : hash2((u * 8) | 0, (v * 8) | 0, 3) < 0.25 ? '#f0c040' : seat;
        p.box(u, v, u + s, v + s, 0, h, col, 0.8, 0.62);
      } else if (track && rho > 0.46) {
        p.top(u, v, u + s, v + s, 0, '#c0583f');
      } else {
        p.top(u, v, u + s, v + s, 0, ((u * 2) | 0) % 2 ? '#62b24c' : '#58a644');
      }
    }
  }
  if (!track) p.top(c - 0.15, c - 0.7, c + 0.15, c + 0.7, 0, '#d9c79a');
  for (const [fu, fv] of [[0.5, 0.5], [n - 0.5, 0.5], [0.5, n - 0.5], [n - 0.5, n - 0.5]]) {
    p.line(fu, fv, 0, fu, fv, 44, '#8a8a92');
    p.px(fu, fv, 44, '#e8e8ee', -3, -4, 7, 4);
    p.glowPx(fu, fv, 44, '#fffbe0', -3, -4, 7, 4);
  }
  p.halo(c, c, 2, n * 9, n * 5, '255,250,215', 0.5);
  void r;
}
function tomb(p: Painter, n: number, c: string) {
  const m = n / 2;
  p.box(0.15, 0.15, n - 0.15, n - 0.15, 0, 4, '#bfb5a0');
  const a = 0.45, b = n - 0.45, h = 4 + n * 6;
  hall(p, a, a, b, b, 4, h, c, n + 2, n + 2, 0.7, '#8a6a34');
  crenel(p, a, a, b, b, h, c);
  for (const [u, v] of [[a, a], [b, a], [a, b], [b, b]]) p.minaret(u, v, h, 7, 1, c, c);
  const rr = Math.round(n * 3.6);
  p.cyl(m, m, h, h + 5, rr, shade(c, 0.95));
  p.dome(m, m, h + 5, rr + 1, c, 1.25, GOLD);
}

export const LANDMARKS: Record<string, LM> = {
  missing: (r) => mkSprite(1, 1, 20, r, (p) => p.box(0.2, 0.2, 0.8, 0.8, 0, 12, '#d04080')),

  charminar: (r) => mkSprite(3, 3, 106, r, (p) => {
    const c = '#eadcb6';
    p.minaret(0.4, 0.4, 0, 88, 3, c);
    p.box(0.4, 0.4, 2.6, 2.6, 0, 34, c);
    p.arch('L', 0.95, 2.05, 2.6, 0, 29, DARK, '#c9903a');
    p.arch('R', 0.95, 2.05, 2.6, 0, 29, shade(DARK, 0.8), '#a87830');
    p.box(0.34, 0.34, 2.66, 2.66, 34, 37, shade(c, 1.04));
    hall(p, 0.5, 0.5, 2.5, 2.5, 37, 51, c, 5, 5, 0.75, '#c9903a');
    p.px(1.5, 2.5, 50, '#fbf7ea', -2, -2, 4, 4);
    p.px(1.5, 2.5, 50, '#33302a', 0, 0, 1, 1);
    p.box(0.44, 0.44, 2.56, 2.56, 51, 53, shade(c, 1.04));
    hall(p, 0.6, 0.6, 2.4, 2.4, 53, 61, c, 7, 7, 0.8, '#c9903a');
    crenel(p, 0.6, 0.6, 2.4, 2.4, 61, c);
    p.minaret(0.4, 2.6, 0, 88, 3, c);
    p.minaret(2.6, 0.4, 0, 88, 3, c);
    p.minaret(2.6, 2.6, 0, 88, 3, c);
    for (const [u, v] of [[0.4, 2.6], [2.6, 0.4], [2.6, 2.6]]) p.glowPx(u, v, 60, '#c9903a', -2, -30, 4, 30);
    p.halo(1.5, 1.5, 0, 44, 22, '255,190,110', 0.3);
  }),

  mecca: (r) => mkSprite(5, 3, 58, r, (p) => {
    const c = '#cfc4ae';
    p.top(0.1, 2.3, 4.9, 2.95, 0, '#d8cdb6');
    p.top(1.9, 2.45, 3.1, 2.85, 0, WATER);
    p.minaret(0.35, 0.4, 0, 36, 3, c);
    p.box(0.3, 0.3, 4.7, 2.2, 0, 26, c);
    p.arcade('L', 0.6, 4.4, 2.2, 0, 21, 5, DARK, GLOW);
    p.arcade('R', 0.5, 2.0, 4.7, 0, 21, 2, shade(DARK, 0.8), shade(GLOW, 0.8));
    crenel(p, 0.3, 0.3, 4.7, 2.2, 26, c);
    for (let i = 0; i < 5; i++) p.dome(0.7 + i * 0.9, 1.9, 27, 2, shade(c, 1.05));
    p.minaret(0.35, 2.15, 0, 38, 3, c);
    p.minaret(4.65, 2.15, 0, 38, 3, c);
  }),

  chowmahalla: (r) => mkSprite(5, 4, 52, r, (p) => {
    const y = '#f0d58a', w = '#f7f1e0';
    p.top(0.1, 2.0, 4.9, 3.95, 0, '#d9cdb4');
    p.top(1.1, 2.4, 3.9, 3.4, 0, w);
    p.top(1.25, 2.52, 3.75, 3.28, 0, WATER);
    p.px(2.5, 2.9, 0, '#ffffff', 0, -4, 1, 4);
    p.box(4.1, 0.25, 4.7, 0.85, 0, 38, w);
    p.px(4.4, 0.85, 31, '#33302a', -1, -1, 3, 3);
    p.pyramid(4.05, 0.2, 4.75, 0.9, 38, 46, '#b9553d');
    hall(p, 0.4, 0.3, 4.0, 1.8, 0, 22, y, 7, 3, 0.66);
    p.box(0.36, 0.26, 4.04, 1.84, 22, 24, w);
    p.windows('L', 0.5, 3.9, 1.8, 15, 21, 9, 1, WIN, r, 0.6);
    p.box(1.6, 0.5, 2.8, 1.8, 24, 32, y);
    p.arcade('L', 1.7, 2.7, 1.8, 25, 31, 3, DARK, GLOW);
    p.dome(2.2, 1.15, 32, 6, w, 1, GOLD);
    p.dome(0.6, 1.6, 24, 2, w); p.dome(3.8, 1.6, 24, 2, w);
  }),

  falaknuma: (r) => mkSprite(6, 3, 58, r, (p) => {
    const w = '#e9e6e0';
    p.box(0.1, 0.1, 5.9, 2.9, 0, 8, '#a59488');
    const cols = (u0: number, u1: number, v: number, z0: number, z1: number) => {
      p.left(u0, u1, v, z0, z1, '#6f7a86');
      p.glowFace('L', u0, u1, v, z0, z1, '#9a7a40');
      for (let u = u0; u < u1 - 0.02; u += 0.2) p.left(u, u + 0.08, v, z0, z1, w);
    };
    p.box(0.5, 0.7, 2.2, 2.0, 8, 24, w); cols(0.6, 2.2, 2.0, 10, 22);
    p.box(3.8, 0.7, 5.5, 2.0, 8, 24, w); cols(3.8, 5.4, 2.0, 10, 22);
    p.windows('R', 0.8, 1.9, 5.5, 10, 22, 3, 2, WIN, r, 0.6);
    p.box(2.2, 0.5, 3.8, 2.3, 8, 32, w); cols(2.3, 3.7, 2.3, 10, 30);
    p.facePoly('L', 2.3, shade(w, 0.95), [2.2, 32, 3.8, 32, 3.0, 40]);
    p.right(3.8, 0.6, 2.2, 10, 30, shade(w, 0.6));
    p.box(2.6, 2.3, 3.4, 2.8, 8, 10, '#cfc9be');
    for (let u = 0.5; u < 5.6; u += 0.5) p.px(u, 2.0, 24, w, 0, -2, 1, 2);
  }),

  salarjung: (r) => mkSprite(5, 3, 50, r, (p) => {
    const w = '#eeeae0';
    p.box(0.3, 0.5, 4.7, 2.3, 0, 20, w);
    p.windows('L', 0.4, 4.6, 2.3, 2, 19, 12, 2, WIN, r, 0.5);
    p.windows('R', 0.6, 2.2, 4.7, 2, 19, 4, 2, shade(WIN, 0.85), r, 0.5);
    p.box(1.8, 0.4, 3.2, 2.55, 0, 26, shade(w, 1.02));
    p.arcade('L', 1.9, 3.1, 2.55, 1, 20, 3, DARK, GLOW);
    p.box(1.9, 2.55, 3.1, 2.9, 0, 3, '#cfc9be');
    p.cyl(2.5, 1.45, 26, 30, 7, w);
    p.dome(2.5, 1.45, 30, 8, '#f6f4ee', 1, GOLD);
  }),

  highcourt: (r) => mkSprite(5, 3, 62, r, (p) => {
    const c = '#dba79c', rd = '#b5524a';
    p.minaret(0.45, 0.55, 0, 34, 3, c, rd);
    p.minaret(4.55, 0.55, 0, 34, 3, c, rd);
    hall(p, 0.3, 0.4, 4.7, 2.4, 0, 26, c, 8, 4, 0.5);
    p.windows('L', 0.4, 4.6, 2.4, 15, 24, 10, 1, WIN, r, 0.55);
    p.box(0.26, 0.36, 4.74, 2.44, 26, 28, '#f1e6dc');
    p.cyl(2.5, 1.4, 28, 34, 7, c);
    p.dome(2.5, 1.4, 34, 8, rd, 1.1, GOLD);
    p.dome(1.2, 1.4, 28, 4, rd, 1.1); p.dome(3.8, 1.4, 28, 4, rd, 1.1);
    p.minaret(0.45, 2.3, 0, 36, 3, c, rd);
    p.minaret(4.55, 2.3, 0, 36, 3, c, rd);
  }),

  osmaniahosp: (r) => mkSprite(5, 3, 62, r, (p) => {
    const c = '#bdb5a6', d = '#d8d2c2';
    hall(p, 0.3, 0.4, 4.7, 2.4, 0, 28, c, 7, 3, 0.45);
    p.windows('L', 0.4, 4.6, 2.4, 15, 26, 11, 1, WIN, r, 0.6);
    crenel(p, 0.3, 0.4, 4.7, 2.4, 28, c);
    p.cyl(2.5, 1.4, 28, 35, 8, c);
    p.dome(2.5, 1.4, 35, 9, d, 1.3, GOLD);
    p.cyl(0.9, 1.6, 28, 32, 4, c); p.dome(0.9, 1.6, 32, 5, d, 1.3, GOLD);
    p.cyl(4.1, 1.6, 28, 32, 4, c); p.dome(4.1, 1.6, 32, 5, d, 1.3, GOLD);
  }),

  pier: (r) => mkSprite(1, 1, 14, r, (p) => {
    p.box(0.1, 0.38, 0.95, 0.62, 0, 3, '#9a7a52');
    p.px(0.9, 0.62, 3, '#6b5036', 0, -5, 1, 5);
    p.box(0.3, 0.72, 0.7, 0.9, 0, 2, '#d8433b');
  }),

  buddha: (r) => mkSprite(1, 1, 66, r, (p) => {
    p.blob(0.5, 0.5, 3, 11, '#8f8479', 5);
    p.box(0.3, 0.3, 0.7, 0.7, 5, 12, '#c9c3b8');
    const c = '#e6e2d8', s = '#bdb8ac', d = '#a39d90';
    const k = (dx: number, dy: number, w: number, h: number, col: string) => p.px(0.5, 0.5, 12, col, dx, dy, w, h);
    k(-6, -3, 12, 3, '#d9d3c6'); k(-5, -4, 10, 1, c);            // lotus base
    k(-4, -24, 8, 20, c); k(2, -24, 2, 20, s); k(-5, -8, 10, 4, c); k(3, -8, 2, 4, s); // robe
    k(-1, -22, 1, 16, s); k(-3, -12, 1, 6, s);                    // folds
    k(-5, -35, 10, 11, c); k(3, -35, 2, 11, s); k(-6, -35, 12, 3, c); // chest and shoulders
    k(5, -33, 2, 13, s); k(5, -21, 2, 2, c);                       // left arm at the side
    k(-8, -34, 2, 6, c); k(-8, -38, 3, 4, c); k(-8, -38, 1, 4, s); // right hand raised
    k(-1, -37, 2, 2, s);
    k(-3, -43, 6, 6, c); k(2, -43, 1, 6, s); k(-2, -45, 4, 2, c); k(-1, -46, 2, 1, c); // head
    k(-2, -41, 1, 1, d); k(0, -41, 1, 1, d);
    p.glowPx(0.5, 0.5, 12, '#9a927c', -6, -46, 12, 46);
    p.halo(0.5, 0.5, 30, 16, 26, '255,235,190', 0.3);
  }),

  birla: (r) => mkSprite(3, 3, 82, r, (p) => {
    const w = '#f4f2ec', rock = '#a59488';
    p.box(0.1, 0.1, 2.9, 2.9, 0, 10, rock);
    for (const [u, v, s] of [[0.3, 2.8, 5], [1.2, 2.9, 4], [2.8, 1.4, 5], [2.9, 2.6, 4], [2.2, 2.9, 3]]) p.blob(u, v, 4, s, shade(rock, 1.06), s - 1);
    p.box(0.5, 0.5, 2.5, 2.5, 10, 15, w);
    const shikhara = (u: number, v: number, z: number, s0: number, n: number, st: number) => {
      for (let i = 0; i < n; i++) {
        const s = s0 * (1 - i / (n + 1.5));
        p.box(u - s, v - s, u + s, v + s, z + i * st, z + (i + 1) * st, w, 0.88, 0.7);
      }
      p.px(u, v, z + n * st, GOLD, -1, -4, 2, 4);
    };
    shikhara(1.4, 1.1, 15, 0.6, 8, 7);
    hall(p, 0.8, 1.4, 2.2, 2.3, 15, 28, w, 4, 2, 0.75, '#b8a070');
    shikhara(1.5, 1.85, 28, 0.36, 5, 5);
    p.box(1.2, 2.5, 1.8, 2.9, 4, 12, '#e6e2d8');
    p.glowFace('L', 0.5, 2.5, 2.5, 10, 15, '#8a8470');
    p.glowPx(1.4, 1.1, 15, '#8a8470', -8, -58, 12, 58);
    p.halo(1.5, 1.5, 30, 34, 30, '255,244,220', 0.28);
  }),

  secretariat: (r) => mkSprite(6, 4, 86, r, (p) => {
    const w = '#f1eee6';
    p.top(0.2, 3.3, 5.8, 3.95, 0, '#6fb255');
    p.box(0.3, 0.6, 5.7, 3.2, 0, 30, w);
    p.windows('L', 0.4, 5.6, 3.2, 3, 28, 16, 3, '#5a7d98', r, 0.6, '#ffe2a0');
    p.windows('R', 0.7, 3.1, 5.7, 3, 28, 6, 3, '#4a6a84', r, 0.6, '#ffe2a0');
    p.dome(1.0, 1.9, 30, 5, w, 1.1, GOLD); p.dome(5.0, 1.9, 30, 5, w, 1.1, GOLD);
    p.box(2.1, 0.8, 3.9, 3.35, 0, 40, shade(w, 1.02));
    p.arcade('L', 2.2, 3.8, 3.35, 2, 30, 3, '#5a6a78', '#c9a25a');
    p.windows('L', 2.2, 3.8, 3.35, 31, 39, 6, 1, '#5a7d98', r, 0.7, '#ffe2a0');
    p.cyl(3, 2.1, 40, 50, 9, w);
    for (let dx = -7; dx <= 7; dx += 3) p.px(3, 2.1, 43, '#5a7d98', dx, -4, 1, 4);
    p.dome(3, 2.1, 50, 10, '#f8f6f0', 1.15, GOLD);
    for (const [u, v] of [[2.2, 3.2], [3.8, 3.2], [3.8, 0.9]]) p.dome(u, v, 40, 2, w, 1.2, GOLD);
    p.glowPx(3, 2.1, 50, '#8a8674', -10, -12, 20, 22);
    p.halo(3, 2.1, 50, 30, 22, '255,240,210', 0.25);
  }),

  assembly: (r) => mkSprite(5, 3, 56, r, (p) => {
    const w = '#f3f0e8';
    for (const [u, v] of [[0.5, 0.6], [4.5, 0.6]]) { p.cyl(u, v, 22, 26, 3, w); p.dome(u, v, 26, 4, w, 1.2, GOLD); }
    hall(p, 0.3, 0.4, 4.7, 2.3, 0, 22, w, 9, 4, 0.7, '#b89a5a');
    crenel(p, 0.3, 0.4, 4.7, 2.3, 22, w);
    p.cyl(2.5, 1.35, 22, 28, 6, w);
    p.dome(2.5, 1.35, 28, 7, '#f8f6f0', 1.2, GOLD);
    for (const [u, v] of [[0.5, 2.2], [4.5, 2.2]]) { p.cyl(u, v, 22, 26, 3, w); p.dome(u, v, 26, 4, w, 1.2, GOLD); }
  }),

  nampally: (r) => mkSprite(5, 2, 44, r, (p) => {
    const c = '#efe8d6';
    hall(p, 0.2, 0.3, 4.8, 1.5, 0, 18, c, 9, 2, 0.55);
    p.windows('L', 0.3, 4.7, 1.5, 11, 17, 12, 1, WIN, r, 0.6);
    p.box(2.1, 0.2, 2.9, 1.6, 0, 28, c);
    p.arch('L', 2.25, 2.75, 1.6, 0, 14, DARK, GLOW);
    p.px(2.5, 1.6, 23, '#33302a', -1, -1, 3, 3);
    p.pyramid(2.05, 0.15, 2.95, 1.65, 28, 37, '#b9553d');
    p.dome(0.5, 0.9, 18, 3, c, 1.2); p.dome(4.5, 0.9, 18, 3, c, 1.2);
    p.poly('#8a8f98', [0.2, 1.5, 11, 4.8, 1.5, 11, 4.8, 1.95, 8, 0.2, 1.95, 8]);
  }),

  gpo: (r) => mkSprite(3, 2, 48, r, (p) => {
    const c = '#d8c9a8';
    p.box(0.2, 0.2, 2.8, 1.8, 0, 26, c);
    p.left(0.3, 2.7, 1.8, 2, 22, '#6f6a5e');
    p.glowFace('L', 0.3, 2.7, 1.8, 2, 10, '#9a7a40');
    for (let u = 0.3; u < 2.7; u += 0.3) p.left(u, u + 0.12, 1.8, 2, 22, c);
    p.windows('R', 0.3, 1.7, 2.8, 3, 24, 4, 3, WIN, r, 0.5);
    p.box(0.16, 0.16, 2.84, 1.84, 26, 28, shade(c, 1.06));
    p.facePoly('L', 1.84, shade(c, 0.9), [1.0, 28, 2.0, 28, 1.5, 35]);
    p.px(1.5, 1.84, 30, '#fbf7ea', -1, -2, 3, 3);
    p.box(0.3, 1.85, 0.42, 1.97, 0, 5, '#d8433b');
    for (const [u, col] of [[0.7, '#e2533f'], [1.5, '#3f9ad8'], [2.3, '#f0a030']] as const) p.poly(col, [u - 0.3, 1.8, 9, u + 0.3, 1.8, 9, u + 0.3, 1.95, 6, u - 0.3, 1.95, 6]);
  }),

  secjn: (r) => mkSprite(6, 2, 48, r, (p) => {
    const c = '#ead9a8';
    hall(p, 0.2, 0.3, 5.8, 1.5, 0, 20, c, 11, 2, 0.5);
    p.windows('L', 0.3, 5.7, 1.5, 12, 19, 14, 1, WIN, r, 0.6);
    crenel(p, 0.2, 0.3, 5.8, 1.5, 20, c);
    p.box(2.4, 0.2, 3.6, 1.65, 0, 26, c);
    p.arch('L', 2.65, 3.35, 1.65, 0, 18, DARK, GLOW);
    crenel(p, 2.4, 0.2, 3.6, 1.65, 26, c);
    for (const u of [2.4, 3.6]) { p.cyl(u, 1.6, 0, 32, 4, c); for (let dx = -4; dx < 4; dx += 2) p.px(u, 1.6, 32, shade(c, 0.9), dx, -4, 1, 2); }
    p.poly('#8a8f98', [0.2, 1.5, 10, 2.2, 1.5, 10, 2.2, 1.95, 7, 0.2, 1.95, 7]);
    p.poly('#8a8f98', [3.8, 1.5, 10, 5.8, 1.5, 10, 5.8, 1.95, 7, 3.8, 1.95, 7]);
  }),

  stmary: (r) => mkSprite(3, 2, 68, r, (p) => {
    const c = '#b9b3a8';
    p.box(0.3, 0.55, 2.4, 1.45, 0, 22, c);
    p.arcade('L', 0.4, 2.3, 1.45, 4, 18, 5, WIN, '#c98a5a');
    p.gable(0.3, 0.5, 2.4, 1.5, 22, 32, 'u', '#6f6a66', c);
    for (const v0 of [0.3, 1.3]) {
      p.box(2.3, v0, 2.75, v0 + 0.45, 0, 40, shade(c, 1.04));
      p.right(2.75, v0 + 0.14, v0 + 0.31, 28, 36, WIN);
      p.pyramid(2.26, v0 - 0.04, 2.79, v0 + 0.49, 40, 56, '#5f5a58');
    }
    p.right(2.4, 0.8, 1.25, 2, 14, DARK);
    p.px(2.4, 1.0, 22, '#d9a25a', -1, -2, 4, 4);
    p.glowPx(2.4, 1.0, 22, '#d9a25a', -1, -2, 4, 4);
    p.px(2.52, 0.52, 56, GOLD, 0, -4, 1, 4); p.px(2.52, 0.52, 56, GOLD, -1, -3, 3, 1);
    p.px(2.52, 1.52, 56, GOLD, 0, -4, 1, 4); p.px(2.52, 1.52, 56, GOLD, -1, -3, 3, 1);
  }),

  ou: (r) => mkSprite(6, 3, 60, r, (p) => {
    const c = '#cdb9a8';
    hall(p, 0.2, 0.5, 5.8, 2.2, 0, 24, c, 12, 3, 0.45);
    p.windows('L', 0.3, 5.7, 2.2, 13, 22, 16, 1, WIN, r, 0.55);
    p.box(0.16, 0.46, 5.84, 2.24, 24, 26, shade(c, 1.06));
    p.box(2.2, 0.3, 3.8, 2.5, 0, 40, shade(c, 1.03));
    p.arch('L', 2.5, 3.5, 2.5, 0, 33, DARK, '#b8873a');
    p.arch('L', 2.72, 3.28, 2.5, 0, 24, '#2f2a26');
    p.box(2.14, 0.24, 3.86, 2.56, 40, 43, shade(c, 1.08));
    for (const [u, v] of [[2.3, 2.4], [3.7, 2.4], [3.7, 0.4]]) { p.cyl(u, v, 43, 46, 2, c); p.dome(u, v, 46, 3, c, 1.2, GOLD); }
    p.box(2.4, 2.5, 3.6, 2.95, 0, 3, '#bfb09f');
  }),

  uppal: (r) => mkSprite(7, 7, 62, r, (p, r) => stadium(p, 7, '#3f6fb5', false, r)),
  gachibowli: (r) => mkSprite(6, 6, 50, r, (p, r) => stadium(p, 6, '#d8553f', true, r)),

  golconda: (r) => mkSprite(8, 8, 102, r, (p) => {
    const wall = '#c4b49c';
    p.box(0.3, 0.3, 7.7, 0.55, 0, 9, wall);
    p.box(0.3, 0.3, 0.55, 7.7, 0, 9, wall);
    const s = 0.5;
    for (let v = 0.5; v < 7.5; v += s) {
      for (let u = 0.5; u < 7.5; u += s) {
        const rho = Math.hypot(u + s / 2 - 4, v + s / 2 - 3.7) / 3.7;
        if (rho >= 1) continue;
        const n = hash2((u * 4) | 0, (v * 4) | 0, 77);
        let h = (1 - Math.pow(rho, 1.5)) * 60 + n * 7;
        h = Math.max(3, Math.round(h / 4) * 4);
        let col = n < 0.2 ? '#8f9a62' : n < 0.6 ? '#a79688' : '#b3a294';
        const ring = (rho > 0.5 && rho < 0.6) || (rho > 0.78 && rho < 0.86);
        if (ring && u + v > 7) { h += 6; col = wall; }
        p.box(u, v, u + s, v + s, 0, h, col, 0.86, 0.68);
      }
    }
    hall(p, 3.55, 3.25, 4.45, 4.15, 62, 76, '#d8cbb2', 3, 3, 0.7, '#c9903a');
    p.box(3.5, 3.2, 4.5, 4.2, 76, 78, '#e2d6bf');
    p.px(4, 3.7, 78, '#8a8a92', 0, -8, 1, 8); p.px(4, 3.7, 86, '#e2603a', 1, 0, 4, 3);
    p.box(0.3, 7.35, 7.7, 7.7, 0, 11, wall); crenel(p, 0.3, 7.35, 7.7, 7.7, 11, wall);
    p.box(7.35, 0.3, 7.7, 7.7, 0, 11, wall); crenel(p, 7.35, 0.3, 7.7, 7.7, 11, wall);
    p.arch('L', 3.6, 4.4, 7.7, 0, 9, DARK, GLOW);
    for (const [u, v] of [[0.5, 7.5], [7.5, 7.5], [7.5, 0.5]]) { p.cyl(u, v, 0, 15, 5, wall); for (let dx = -5; dx < 5; dx += 2) p.px(u, v, 15, shade(wall, 0.9), dx, -3, 1, 2); }
    p.halo(4, 3.7, 66, 26, 20, '255,200,120', 0.3);
  }),

  taramati: (r) => mkSprite(2, 2, 44, r, (p) => {
    p.box(0.1, 0.1, 1.9, 1.9, 0, 8, '#cdbf9f');
    p.box(0.8, 1.9, 1.2, 2.0, 0, 5, '#bfb190');
    hall(p, 0.4, 0.4, 1.6, 1.6, 8, 26, '#e6dcc0', 3, 3, 0.8, '#c9903a');
    p.box(0.34, 0.34, 1.66, 1.66, 26, 28, '#efe6cc');
    crenel(p, 0.34, 0.34, 1.66, 1.66, 28, '#e6dcc0');
  }),

  cyber: (r) => mkSprite(3, 3, 102, r, (p, r) => {
    const c = '#dccdaa', g = '#3f6f95';
    p.box(0.25, 0.25, 2.75, 2.75, 0, 8, '#d9d2c2');
    p.left(0.4, 2.6, 2.75, 1, 7, '#3f5c72'); p.glowFace('L', 0.4, 2.6, 2.75, 1, 7, '#d9c08a');
    p.cyl(1.5, 1.5, 8, 84, 17, c);
    for (let z = 12; z < 82; z += 6) {
      for (let dx = -16; dx < 16; dx++) {
        if (Math.abs(dx) < 2) continue;
        const t = dx / 17;
        const b = Math.round(Math.sqrt(1 - t * t) * 8);
        p.px(1.5, 1.5, z, t < -0.35 ? shade(g, 1.15) : t < 0.3 ? g : shade(g, 0.7), dx, b - 3, 1, 3);
        if (r() < 0.3) p.glowPx(1.5, 1.5, z, '#9fcbe6', dx, b - 3, 1, 3);
      }
    }
    p.px(1.5, 1.5, 8, shade(c, 0.6), -1, -70, 2, 78);
    p.cyl(1.5, 1.5, 84, 92, 8, '#cfc9be');
    p.px(1.5, 1.5, 92, '#8a8a92', 0, -8, 1, 8);
    p.glowPx(1.5, 1.5, 100, '#ff4030', -1, -1, 3, 3);
  }),

  zoogate: (r) => mkSprite(2, 1, 28, r, (p) => { gate(p, 0.1, 1.9, 0.6, 14, '#e2d6bf', '#3f8a4a'); p.px(1, 0.6, 19, '#f2d23f', -3, -4, 6, 3); p.px(1, 0.6, 19, '#f2d23f', 2, -6, 2, 3); }),
  parkgate: (r) => mkSprite(2, 1, 26, r, (p) => { gate(p, 0.1, 1.9, 0.6, 12, '#a8958c', '#6b4a2e'); p.blob(1, 0.6, 20, 4, '#4f8f3f', 2); }),
  shilpagate: (r) => mkSprite(2, 1, 28, r, (p) => {
    gate(p, 0.1, 1.9, 0.6, 11, '#c9825a', '#a8643f');
    p.poly('#b89a52', [0, 0.3, 16, 2, 0.3, 16, 2, 0.6, 24, 0, 0.6, 24]);
    p.poly('#a88a4a', [0, 0.9, 16, 2, 0.9, 16, 2, 0.6, 24, 0, 0.6, 24]);
  }),
  ramojigate: (r) => mkSprite(3, 1, 38, r, (p) => {
    const c = '#f0e2c0';
    p.box(0.1, 0.3, 0.6, 0.8, 0, 22, c); p.box(2.4, 0.3, 2.9, 0.8, 0, 22, c);
    p.box(0.1, 0.3, 2.9, 0.8, 22, 28, c);
    p.left(0.6, 2.4, 0.8, 0, 22, '#3a3230'); p.glowFace('L', 0.6, 2.4, 0.8, 0, 22, '#7a5a26');
    p.left(0.3, 2.7, 0.8, 23, 27, GOLD); p.glowFace('L', 0.3, 2.7, 0.8, 23, 27, '#c9a23a');
    p.dome(0.35, 0.55, 28, 4, GOLD, 1.2, GOLD); p.dome(2.65, 0.55, 28, 4, GOLD, 1.2, GOLD);
  }),

  flag: (r) => mkSprite(1, 1, 68, r, (p) => {
    p.box(0.36, 0.36, 0.64, 0.64, 0, 3, '#b8b0a4');
    p.px(0.5, 0.5, 3, '#a8a8b0', 0, -58, 1, 58);
    p.px(0.5, 0.5, 61, '#f08a30', 1, 0, 15, 3);
    p.px(0.5, 0.5, 61, '#fbfbf6', 1, 3, 15, 3);
    p.px(0.5, 0.5, 61, '#2f9a4a', 1, 6, 15, 3);
    p.px(0.5, 0.5, 61, '#2f3f9a', 8, 4, 1, 1);
    p.glowPx(0.5, 0.5, 61, '#6a6a60', 1, 0, 15, 9);
  }),

  pavilion: (r) => mkSprite(2, 2, 32, r, (p) => {
    p.box(0.2, 0.2, 1.8, 1.8, 0, 3, '#cfc1a6');
    for (const [u, v] of [[0.35, 0.35], [1.65, 0.35], [0.35, 1.65], [1.65, 1.65]]) p.px(u, v, 3, '#f1ede2', -1, -12, 2, 12);
    p.glowFace('L', 0.35, 1.65, 1.65, 3, 14, '#7a5a26');
    p.pyramid(0.15, 0.15, 1.85, 1.85, 15, 28, '#c2674a');
    p.px(1, 1, 28, GOLD, 0, -3, 1, 3);
  }),

  fountain: (r) => mkSprite(2, 2, 26, r, (p) => {
    p.box(0.25, 0.25, 1.75, 1.75, 0, 3, '#c9c0ae');
    p.top(0.4, 0.4, 1.6, 1.6, 3, WATER);
    for (const [u, v, h, col] of [[1, 1, 16, '#ff60c0'], [0.7, 1, 9, '#60e0ff'], [1.3, 1, 9, '#60e0ff'], [1, 0.7, 9, '#a0ff80'], [1, 1.3, 9, '#a0ff80']] as const) {
      p.px(u, v, 3, '#e6f4f8', 0, -h, 1, h);
      p.glowPx(u, v, 3, col, -1, -h, 3, h);
    }
    p.halo(1, 1, 8, 20, 12, '160,220,255', 0.3);
  }),

  bandstand: (r) => mkSprite(1, 1, 24, r, (p) => {
    p.cyl(0.5, 0.5, 0, 3, 8, '#d9cdb4');
    for (const dx of [-7, -3, 2, 6]) p.px(0.5, 0.5, 3, '#f1ede2', dx, -9, 1, 9);
    p.dome(0.5, 0.5, 12, 9, '#b9553d', 0.6, GOLD);
  }),

  clock: (r) => mkSprite(1, 1, 70, r, (p) => {
    const c = '#e6d8b0';
    p.box(0.26, 0.26, 0.74, 0.74, 0, 4, '#cfc1a6');
    p.box(0.34, 0.34, 0.66, 0.66, 4, 44, c);
    p.left(0.44, 0.56, 0.66, 4, 12, DARK);
    for (const z of [16, 24]) { p.left(0.46, 0.54, 0.66, z, z + 5, WIN); p.right(0.66, 0.46, 0.54, z, z + 5, WIN); }
    p.box(0.3, 0.3, 0.7, 0.7, 44, 46, shade(c, 1.08));
    p.px(0.5, 0.66, 38, '#fbf7ea', -2, -3, 4, 5); p.px(0.5, 0.66, 38, '#33302a', 0, -1, 1, 2);
    p.px(0.66, 0.5, 38, '#e6e0d0', -2, -3, 4, 5); p.px(0.66, 0.5, 38, '#33302a', 0, -1, 1, 2);
    p.glowPx(0.5, 0.66, 38, '#ffe9b0', -2, -3, 4, 5); p.glowPx(0.66, 0.5, 38, '#d9c08a', -2, -3, 4, 5);
    p.box(0.38, 0.38, 0.62, 0.62, 46, 54, c);
    p.pyramid(0.34, 0.34, 0.66, 0.66, 54, 63, '#5f5a58');
    p.px(0.5, 0.5, 63, GOLD, 0, -3, 1, 3);
  }),

  filmset: (r) => mkSprite(4, 3, 46, r, (p, r) => {
    p.top(0.1, 0.1, 3.9, 2.9, 0, '#bfb39c');
    const cols = ['#e39a7a', '#8fc0d8', '#e8d28a', '#b0d0a0'];
    for (let i = 0; i < 4; i++) {
      const h = 16 + ((r() * 3) | 0) * 5;
      p.line(i + 0.5, 1.0, 0, i + 0.5, 1.6, h - 3, '#8a6a48');
      p.box(i + 0.06, 1.6, i + 0.94, 1.78, 0, h, cols[i]);
      p.windows('L', i + 0.12, i + 0.88, 1.78, 7, h - 2, 2, Math.max(1, ((h - 8) / 7) | 0), WIN, r, 0.3);
      p.left(i + 0.38, i + 0.62, 1.78, 0, 6, '#6b4a34');
      p.poly('#d8433b', [i + 0.1, 1.78, 8, i + 0.9, 1.78, 8, i + 0.9, 1.9, 6, i + 0.1, 1.9, 6]);
    }
    p.px(3.3, 2.5, 0, '#55555c', 0, -16, 1, 16); p.px(3.3, 2.5, 16, '#22222a', -2, 0, 5, 3);
    p.glowPx(3.3, 2.5, 16, '#fff6d0', -2, 0, 5, 3);
    p.halo(2, 2.3, 0, 40, 14, '255,246,208', 0.4);
  }),

  palaceset: (r) => mkSprite(3, 3, 58, r, (p, r) => {
    const c = '#e39a7a';
    const tiers: [number, number, number][] = [[0.3, 0, 22], [0.6, 22, 34], [0.9, 34, 44], [1.2, 44, 50]];
    for (const [ins, z0, z1] of tiers) {
      p.box(ins, 1.0, 3 - ins, 2.2, z0, z1, c);
      const n = Math.max(2, Math.round((3 - ins * 2) * 4));
      p.windows('L', ins + 0.05, 3 - ins - 0.05, 2.2, z0 + 2, z1 - 1, n, Math.max(1, Math.round((z1 - z0) / 6)), '#7a3f34', r, 0.5, '#ffc07a', 0.5, 0.6);
      p.left(ins, 3 - ins, 2.2, z1 - 1, z1, '#f7e6d8');
    }
    for (const u of [0.6, 1.5, 2.4]) p.dome(u, 1.6, u === 1.5 ? 50 : 34, 3, '#f0c0a0', 1.2, GOLD);
  }),

  clapper: (r) => mkSprite(1, 1, 28, r, (p) => {
    p.box(0.3, 0.44, 0.9, 0.56, 2, 14, '#22222a');
    for (let i = 0; i < 4; i++) p.left(0.32 + i * 0.15, 0.4 + i * 0.15, 0.56, 14, 17, i % 2 ? '#22222a' : '#f4f4f4');
    p.left(0.36, 0.84, 0.56, 5, 6, '#f4f4f4'); p.left(0.36, 0.84, 0.56, 9, 10, '#f4f4f4');
    p.px(0.15, 0.8, 0, '#55555c', 0, -9, 1, 9); p.px(0.15, 0.8, 9, '#33333a', -2, -3, 5, 3);
  }),

  tomb0: (r) => mkSprite(3, 3, 60, r, (p) => tomb(p, 3, '#cfc6b2')),
  tomb1: (r) => mkSprite(2, 2, 44, r, (p) => tomb(p, 2, '#c9bfa8')),

  terminal: (r) => mkSprite(6, 2, 36, r, (p, r) => {
    p.box(0.2, 0.3, 5.8, 1.7, 0, 14, '#9fc6d8');
    for (let u = 0.3; u < 5.8; u += 0.35) p.left(u, u + 0.04, 1.7, 0, 14, '#e6eef2');
    for (let i = 0; i < 12; i++) if (r() < 0.75) p.glowFace('L', 0.3 + i * 0.45, 0.7 + i * 0.45, 1.7, 1, 13, '#b8d8e8');
    p.right(5.8, 0.4, 1.6, 1, 13, '#7fa8bc');
    for (let i = 0; i < 4; i++) {
      const ins = i * 0.18;
      p.box(0.1, 0.2 + ins, 5.9, 1.8 - ins, 14 + i * 2, 16 + i * 2, '#f2f2f4');
    }
  }),

  atc: (r) => mkSprite(1, 1, 60, r, (p) => {
    p.cyl(0.5, 0.5, 0, 40, 3, '#d9d9de');
    p.cyl(0.5, 0.5, 40, 47, 6, '#3f5f75');
    p.glowPx(0.5, 0.5, 40, '#9fd8c0', -6, -6, 12, 5);
    p.cyl(0.5, 0.5, 47, 49, 7, '#f2f2f4');
    p.px(0.5, 0.5, 49, '#8a8a92', 0, -8, 1, 8);
    p.glowPx(0.5, 0.5, 57, '#ff4030', -1, -1, 3, 3);
  }),

  pylon: (r) => mkSprite(7, 1, 80, r, (p) => {
    const w = '#eeebe2';
    const cable = (v: number, glow: string) => {
      for (let k = 0.5; k <= 3.4; k += 0.48) {
        for (const s of [-1, 1]) {
          p.line(3.5, v, 68, 3.5 + s * k, v, 3, '#f6f3ea');
          p.line(3.5, v, 68, 3.5 + s * k, v, 3, glow, true);
        }
      }
    };
    p.box(3.38, 0.0, 3.62, 0.12, 0, 72, w);
    cable(0.06, '#703a8a');
    p.box(3.38, 0.0, 3.62, 1.0, 60, 64, w);
    p.box(3.38, 0.88, 3.62, 1.0, 0, 72, w);
    cable(0.94, '#3a6a9a');
    p.glowFace('L', 3.38, 3.62, 1.0, 0, 72, '#5a4a8a');
    p.glowPx(3.5, 0.94, 72, '#ff4030', -1, -2, 3, 3);
  }, 6),
};
