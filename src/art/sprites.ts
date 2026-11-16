// Sprite registry: every building, tree, prop and landmark is painted lazily
// the first time it is needed (during the boot bake) and cached forever.
import { mkSprite, shade, type Painter, type Sprite } from './paint';
import { mulberry, hashStr, pick, type Rng } from '../world/rng';
import { LANDMARKS } from './landmarks';

const cache = new Map<string, Sprite>();

export function spriteFor(key: string): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = make(key);
    cache.set(key, s);
  }
  return s;
}
export const spriteCount = () => cache.size;

function make(key: string): Sprite {
  const [cat, name, vs] = key.split(':');
  const r = mulberry(hashStr(key));
  const v = +(vs ?? 0);
  if (cat === 'lm') return (LANDMARKS[name] ?? LANDMARKS.missing)(r);
  if (cat === 'b') return (BUILD[name] ?? BUILD.suburb)(r, v);
  if (cat === 't') return (TREE[name] ?? TREE.neem)(r, v);
  if (cat === 'v') return viaduct(name, v, r);
  return (PROP[name] ?? PROP.rock)(r, v);
}

export const WIN = '#33465e';
const WARM = '#ffd58a';
const COOL = '#cfe8ff';
const BRIGHT = ['#e2533f', '#f0a030', '#3f9ad8', '#3fb07a', '#d84f9a', '#f2d23f', '#7a5fd8'];

function tank(p: Painter, u: number, v: number, z: number) {
  p.cyl(u, v, z + 1, z + 4, 2, '#3a3a44');
}

const BUILD: Record<string, (r: Rng, v: number) => Sprite> = {
  old: (r) => mkSprite(1, 1, 50, r, (p, r) => {
    if (r() < 0.07) {
      p.box(0.15, 0.15, 0.85, 0.85, 0, 12, '#f1ede2');
      p.arcade('L', 0.2, 0.8, 0.85, 1, 9, 3, '#52635c', '#7a6a3a');
      p.dome(0.5, 0.5, 12, 6, '#5fa48a', 1, '#d9b24a');
      p.minaret(0.84, 0.2, 0, 28, 1, '#f1ede2', '#5fa48a');
      return;
    }
    const wall = pick(r, ['#efe3c4', '#e6d3a8', '#d7e3cd', '#cddfe8', '#f0d2c2', '#e9e1d6', '#e3c9a0', '#c9dccb']);
    const floors = (r() * 3) | 0;
    const h = 9 + floors * 8;
    const a = 0.1, b = 0.9;
    p.box(a, a, b, b, 0, h, wall);
    p.top(a + 0.07, a + 0.07, b - 0.07, b - 0.07, h, shade(wall, 0.88));
    if (floors) {
      p.windows('L', a + 0.06, b - 0.06, b, 10, h - 1, 3, floors, WIN, r, 0.4, WARM, 0.5, 0.62);
      p.windows('R', a + 0.06, b - 0.06, b, 10, h - 1, 3, floors, shade(WIN, 0.85), r, 0.4, WARM, 0.5, 0.62);
    }
    // shopfronts with awnings
    const shut = pick(r, ['#6f7f8a', '#8a7a66', '#5f8a7a', '#7a6f8a']);
    for (const [s0, s1] of [[a + 0.06, 0.47], [0.53, b - 0.06]]) {
      p.left(s0, s1, b, 0, 7, shut);
      if (r() < 0.65) p.glowFace('L', s0, s1, b, 0, 7, '#b88a40');
      const aw = pick(r, BRIGHT);
      p.poly(aw, [s0, b, 9, s1, b, 9, s1, b + 0.11, 6, s0, b + 0.11, 6]);
    }
    p.right(b, 0.38, 0.62, 0, 7, shade(shut, 0.7));
    if (r() < 0.3) tank(p, 0.35, 0.35, h);
    if (r() < 0.25) p.px(0.7, 0.3, h, pick(r, ['#3f9a4f', '#f08a30']), 0, -7, 3, 2);
    if (r() < 0.25) p.px(0.7, 0.3, h, '#6a6a70', 0, -7, 1, 7);
  }),

  central: (r) => mkSprite(1, 1, 72, r, (p, r) => {
    const glassy = r() < 0.22;
    const wall = glassy ? pick(r, ['#7fb3c8', '#8fc0b8', '#93a9c9']) : pick(r, ['#e6dcc6', '#d6cfc4', '#ecd9b4', '#d3dbe0', '#e6c9b4', '#c6d6d2', '#e9d2c9', '#d9e0c4']);
    const floors = 2 + ((r() * 4) | 0);
    const h = 9 + floors * 8;
    const a = 0.08, b = 0.92;
    p.box(a, a, b, b, 0, h, glassy ? '#dfe5e8' : wall);
    if (glassy) {
      p.left(a, b, b, 9, h, wall);
      p.right(b, a, b, 9, h, shade(wall, 0.74));
      for (let z = 9; z < h; z += 4) { p.left(a, b, b, z, z + 1, shade(wall, 0.8)); p.right(b, a, b, z, z + 1, shade(wall, 0.6)); }
      for (let f = 0; f < floors; f++) if (r() < 0.5) p.glowFace(r() < 0.5 ? 'L' : 'R', a + r() * 0.3, b - r() * 0.3, b, 10 + f * 8, 15 + f * 8, '#55788c');
    } else {
      p.windows('L', a + 0.04, b - 0.04, b, 10, h - 1, 3, floors, WIN, r, 0.45);
      p.windows('R', a + 0.04, b - 0.04, b, 10, h - 1, 3, floors, shade(WIN, 0.85), r, 0.45);
    }
    // glass storefront and signboards
    p.left(a + 0.05, b - 0.05, b, 0, 6, '#3f5c72');
    p.glowFace('L', a + 0.05, b - 0.05, b, 0, 6, '#d9b877');
    p.right(b, a + 0.05, b - 0.05, 0, 6, '#33495c');
    const s1 = pick(r, BRIGHT), s2 = pick(r, BRIGHT);
    p.left(a, b, b, 7, 10, s1);
    p.right(b, a, b, 7, 10, shade(s2, 0.82));
    p.glowFace('L', a, b, b, 7, 10, shade(s1, 0.55));
    for (let i = 0; i < 4; i++) p.px(a + 0.12 + i * 0.18, b, 9, '#ffffff', 0, 0, 2, 1);
    const top = r();
    if (top < 0.35) {
      const bc = pick(r, BRIGHT);
      p.px(0.3, 0.5, h, '#55555c', 0, -4, 1, 4);
      p.px(0.7, 0.5, h, '#55555c', 0, -4, 1, 4);
      p.box(0.18, 0.47, 0.82, 0.53, h + 4, h + 13, bc);
      p.left(0.24, 0.5, 0.53, h + 8, h + 11, '#ffffff');
      p.glowFace('L', 0.18, 0.82, 0.53, h + 4, h + 13, shade(bc, 0.5));
    } else if (top < 0.6) {
      tank(p, 0.3, 0.3, h);
      p.box(0.55, 0.55, 0.75, 0.75, h, h + 3, '#b9b9bf');
    }
  }),

  cantt: (r) => mkSprite(1, 1, 42, r, (p, r) => {
    const wall = pick(r, ['#ecdca8', '#f0e6c8', '#e6d0a0', '#f2ead8']);
    const roof = pick(r, ['#b9553d', '#a94f3a', '#c2674a']);
    if (r() < 0.7) {
      const axis = r() < 0.5 ? 'u' : 'v';
      p.box(0.2, 0.2, 0.8, 0.8, 0, 9, wall);
      p.left(0.42, 0.56, 0.8, 0, 6, '#6b4a34');
      p.windows('L', 0.22, 0.42, 0.8, 2, 8, 1, 1, WIN, r, 0.5);
      p.windows('L', 0.58, 0.78, 0.8, 2, 8, 1, 1, WIN, r, 0.5);
      p.windows('R', 0.24, 0.76, 0.8, 2, 8, 2, 1, shade(WIN, 0.85), r, 0.5);
      p.gable(0.13, 0.13, 0.87, 0.87, 9, 18, axis, roof, wall);
      p.blob(0.14, 0.86, 3, 3, '#5a9a45', 2);
    } else {
      p.box(0.1, 0.16, 0.9, 0.84, 0, 20, wall);
      p.arcade('L', 0.14, 0.86, 0.84, 1, 8, 4, '#5b4a3a', '#8a6a34');
      p.windows('L', 0.14, 0.86, 0.84, 11, 19, 4, 1, WIN, r, 0.5);
      p.windows('R', 0.2, 0.8, 0.9, 2, 19, 2, 2, shade(WIN, 0.85), r, 0.5);
      p.pyramid(0.05, 0.11, 0.95, 0.89, 20, 28, roof);
    }
  }),

  suburb: (r) => mkSprite(1, 1, 62, r, (p, r) => {
    const floors = 2 + ((r() * 4) | 0);
    const a = 0.1, b = 0.9;
    if (r() < 0.07) {
      // under construction
      const c = '#b3ada3';
      for (const [cu, cv] of [[a, a], [b - 0.08, a], [a, b - 0.08]]) p.box(cu, cv, cu + 0.08, cv + 0.08, 0, floors * 8, c);
      for (let f = 1; f <= floors; f++) p.box(a, a, b, b, f * 8 - 2, f * 8, c);
      p.box(b - 0.08, b - 0.08, b, b, 0, floors * 8, c);
      for (let i = 0; i < 4; i++) p.line(a + i * 0.25, b, 0, a + i * 0.25, b, floors * 8 + 4, '#b08a4a');
      p.line(a, b, floors * 4, b, b, floors * 4, '#b08a4a');
      return;
    }
    const wall = pick(r, ['#e9d9c4', '#d9e4d4', '#e4d4dc', '#d4dce8', '#efe2b8', '#e6c9b0', '#cfe2dc']);
    const h = 4 + floors * 8;
    p.box(a, a, b, b, 0, h, wall);
    p.left(a + 0.1, b - 0.1, b, 0, 4, '#4a4a52');
    for (let f = 0; f < floors; f++) {
      const z = 4 + f * 8;
      p.left(a + 0.04, b - 0.04, b, z, z + 2, shade(wall, 1.1));
      p.left(a + 0.04, b - 0.04, b, z + 2, z + 3, shade(wall, 0.7));
    }
    p.windows('L', a + 0.04, b - 0.04, b, 7, h + 3, 3, floors, WIN, r, 0.5, WARM, 0.5, 0.45);
    p.windows('R', a + 0.06, b - 0.06, b, 5, h, 2, floors, shade(WIN, 0.85), r, 0.5);
    p.box(0.55, 0.15, 0.8, 0.4, h, h + 5, shade(wall, 0.95));
    if (r() < 0.4) tank(p, 0.3, 0.6, h);
  }),

  hills: (r) => mkSprite(1, 1, 44, r, (p, r) => {
    const wall = pick(r, ['#f4f1e8', '#efe9dc', '#e9e4da', '#f0e8d8']);
    const acc = pick(r, ['#b9684a', '#6f6a66', '#8a6a4a']);
    p.box(0.2, 0.1, 0.9, 0.6, 0, 18, wall);
    p.left(0.26, 0.84, 0.6, 10, 16, '#5f8fae');
    p.glowFace('L', 0.26, 0.84, 0.6, 10, 16, '#c9a25a');
    p.right(0.9, 0.16, 0.54, 10, 16, '#4a7592');
    p.top(0.17, 0.07, 0.93, 0.63, 19, acc);
    p.box(0.1, 0.5, 0.66, 0.9, 0, 9, shade(wall, 0.97));
    p.left(0.16, 0.6, 0.9, 2, 8, '#5f8fae');
    if (r() < 0.6) p.glowFace('L', 0.16, 0.6, 0.9, 2, 8, '#c9a25a');
    p.right(0.66, 0.56, 0.84, 0, 6, '#6b4a34');
    if (r() < 0.5) p.blob(0.84, 0.84, 3, 3, '#5a9a45', 2); else p.blob(0.84, 0.84, 2, 3, '#b09c90', 2);
  }),

  tech: (r) => techBlock(r, 5, 7),
  techlow: (r) => techBlock(r, 2, 3),

  tower: (r) => mkSprite(2, 2, 196, r, (p, r) => {
    const h = 76 + ((r() * 11) | 0) * 8;
    const g = pick(r, ['#5f9fc8', '#6fb7d6', '#79c2b8', '#7f9fd0', '#4a86b0', '#8fb8c8']);
    const a = 0.2, b = 1.8;
    p.box(0.08, 0.08, 1.92, 1.92, 0, 8, '#cfcfd4');
    p.left(0.2, 1.8, 1.92, 0, 7, '#3f5c72');
    p.glowFace('L', 0.2, 1.8, 1.92, 0, 7, '#d9c08a');
    p.box3(a, a, b, b, 8, h, '#dfe6ea', g, shade(g, 0.72));
    for (let z = 8; z < h; z += 8) { p.left(a, b, b, z, z + 1, shade(g, 0.72)); p.right(b, a, b, z, z + 1, shade(g, 0.54)); }
    for (let m = 0.4; m < 1.7; m += 0.2) { p.left(m, m + 0.02, b, 8, h, shade(g, 0.88)); p.right(b, m, m + 0.02, 8, h, shade(g, 0.64)); }
    p.left(a, a + 0.08, b, 8, h, shade(g, 1.22));
    p.left(b - 0.3, b, b, 8, h, shade(g, 1.1));
    for (let z = 9; z < h - 6; z += 8) {
      if (r() < 0.38) { const s = a + r() * 0.8; p.glowFace('L', s, Math.min(b, s + 0.3 + r() * 0.9), b, z, z + 6, r() < 0.75 ? '#5f89a6' : '#9a8650'); }
      if (r() < 0.26) { const s = a + r() * 0.8; p.glowFace('R', s, Math.min(b, s + 0.3 + r() * 0.9), b, z, z + 6, '#4a6a80'); }
    }
    const crown = r();
    if (crown < 0.4) {
      p.box3(0.5, 0.5, 1.5, 1.5, h, h + 12, '#dfe6ea', g, shade(g, 0.72));
      p.px(1, 1, h + 12, '#9a9aa2', 0, -12, 1, 12);
      p.glowPx(1, 1, h + 24, '#ff4030', -1, -1, 3, 3);
    } else if (crown < 0.7) {
      p.poly(shade(g, 1.1), [a, b, h, b, b, h, b, b, h + 14]);
      p.poly(shade(g, 0.6), [b, a, h, b, b, h, b, b, h + 14]);
    } else {
      p.box(0.6, 0.6, 1.4, 1.4, h, h + 5, '#b9bcc2');
      p.top(0.75, 0.75, 1.25, 1.25, h + 5, '#e8c84a');
    }
    p.glowFace('L', a, b, b, h - 2, h, '#8fb0c8');
  }),

  hut: (r) => mkSprite(1, 1, 24, r, (p, r) => {
    const wall = pick(r, ['#c79a6b', '#d9b58a', '#b98a5f']);
    p.box(0.26, 0.26, 0.74, 0.74, 0, 7, wall);
    p.left(0.44, 0.56, 0.74, 0, 5, '#5b4030');
    if (r() < 0.5) p.glowFace('L', 0.44, 0.56, 0.74, 0, 5, '#b88a40');
    p.pyramid(0.14, 0.14, 0.86, 0.86, 6, 17, pick(r, ['#b89a52', '#a88a4a', '#c2a45f']));
  }),
};

function techBlock(r: Rng, minF: number, span: number): Sprite {
  return mkSprite(1, 1, 120, r, (p, r) => {
    const floors = minF + ((r() * span) | 0);
    const h = 8 + floors * 7;
    const a = 0.1, b = 0.9;
    p.box(0.05, 0.05, 0.95, 0.95, 0, 6, '#d2d2d6');
    p.left(0.1, 0.9, 0.95, 0, 5, '#3f5c72');
    p.glowFace('L', 0.1, 0.9, 0.95, 0, 5, '#d9c08a');
    if (r() < 0.3) {
      const wall = pick(r, ['#e2d9c6', '#d9d9dc', '#e6dccf']);
      p.box(a, a, b, b, 6, h, wall);
      for (let f = 0; f < floors; f++) {
        const z = 8 + f * 7;
        p.left(a + 0.03, b - 0.03, b, z, z + 4, '#3f5f7a');
        p.right(b, a + 0.03, b - 0.03, z, z + 4, '#33506a');
        if (r() < 0.5) p.glowFace('L', a + 0.03 + r() * 0.3, b - 0.03 - r() * 0.2, b, z, z + 4, '#6f8fa8');
        if (r() < 0.4) p.glowFace('R', a + 0.03 + r() * 0.3, b - 0.03, b, z, z + 4, '#55707e');
      }
    } else {
      const g = pick(r, ['#6fb7d6', '#5aa0c8', '#7fc9c0', '#8fb0d8', '#4f8fb5', '#6fc0a8']);
      p.box3(a, a, b, b, 6, h, '#dfe6ea', g, shade(g, 0.72));
      for (let z = 6; z < h; z += 7) { p.left(a, b, b, z, z + 1, shade(g, 0.74)); p.right(b, a, b, z, z + 1, shade(g, 0.55)); }
      for (const m of [0.36, 0.63]) { p.left(m, m + 0.03, b, 6, h, shade(g, 0.86)); p.right(b, m, m + 0.03, 6, h, shade(g, 0.62)); }
      p.left(a, a + 0.06, b, 6, h, shade(g, 1.2));
      for (let f = 0; f < floors; f++) {
        const z = 8 + f * 7;
        if (r() < 0.32) p.glowFace('L', a + r() * 0.4, b - r() * 0.3, b, z, z + 5, r() < 0.7 ? '#5f89a6' : '#9a8650');
        if (r() < 0.22) p.glowFace('R', a + r() * 0.4, b - r() * 0.2, b, z, z + 5, '#4a6a80');
      }
    }
    p.box(0.3, 0.3, 0.6, 0.6, h, h + 4, '#b9bcc2');
    if (r() < 0.5) { p.px(0.45, 0.45, h + 4, '#8a8a92', 0, -8, 1, 8); p.glowPx(0.45, 0.45, h + 12, '#ff4030', -1, -1, 3, 3); }
  });
}

const TREE: Record<string, (r: Rng, v: number) => Sprite> = {
  neem: (r) => mkSprite(1, 1, 30, r, (p, r) => {
    const g = pick(r, ['#4f8f3f', '#5a9a45', '#488a44', '#62a04a']);
    const u = 0.4 + r() * 0.2, v = 0.4 + r() * 0.2;
    p.px(u, v, 0, '#6b4a2e', -1, -8, 2, 8);
    p.blob(u, v, 12, 6, shade(g, 0.9), 5);
    p.blob(u - 0.08, v + 0.05, 15, 4, g, 3);
    p.blob(u + 0.12, v - 0.02, 17, 3, shade(g, 1.08), 3);
  }),
  gul: (r) => mkSprite(1, 1, 30, r, (p, r) => {
    const fl = pick(r, ['#e2552f', '#f07a2a', '#e8a02a', '#d9508a']);
    const u = 0.4 + r() * 0.2, v = 0.4 + r() * 0.2;
    p.px(u, v, 0, '#6b4a2e', -1, -7, 2, 7);
    p.blob(u, v, 11, 7, '#5a9a45', 4);
    const cx = Math.round(p.X(u, v)), cy = Math.round(p.Y(u, v, 11));
    p.ctx.fillStyle = fl;
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.28, d = r() * 6;
      p.ctx.fillRect(cx + Math.round(Math.cos(a) * d), cy - 1 + Math.round(Math.sin(a) * d * 0.5) - 1, 2, 1);
    }
  }),
  palm: (r) => mkSprite(1, 1, 34, r, (p, r) => {
    const u = 0.4 + r() * 0.2, v = 0.4 + r() * 0.2;
    const h = 16 + ((r() * 8) | 0);
    const cx = Math.round(p.X(u, v)), cy = Math.round(p.Y(u, v, 0));
    const lean = r() < 0.5 ? 1 : -1;
    p.ctx.fillStyle = '#8a6a48';
    for (let i = 0; i < h; i++) p.ctx.fillRect(cx + (i > h * 0.6 ? lean : 0), cy - i, 1, 1);
    const tx = cx + lean, ty = cy - h;
    const g = pick(r, ['#4f8f3f', '#5f9f45']);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28 + r();
      for (let d = 1; d <= 6; d++) {
        p.ctx.fillStyle = d > 3 ? shade(g, 0.85) : g;
        p.ctx.fillRect(tx + Math.round(Math.cos(a) * d), ty + Math.round(Math.sin(a) * d * 0.5 + d * d * 0.07), 1, 1);
      }
    }
    p.ctx.fillStyle = '#3a6a34';
    p.ctx.fillRect(tx - 1, ty - 1, 3, 2);
  }),
  banyan: (r) => mkSprite(1, 1, 30, r, (p, r) => {
    const g = pick(r, ['#3f7f3a', '#468a40']);
    p.px(0.5, 0.5, 0, '#5b4030', -2, -7, 4, 7);
    p.px(0.5, 0.5, 0, '#6b5040', -6, -5, 1, 5);
    p.px(0.5, 0.5, 0, '#6b5040', 5, -6, 1, 6);
    p.blob(0.5, 0.5, 12, 10, shade(g, 0.9), 5);
    p.blob(0.4, 0.5, 15, 6, g, 4);
    p.blob(0.62, 0.48, 16, 5, shade(g, 1.08), 3);
  }),
  bush: (r) => mkSprite(1, 1, 14, r, (p, r) => {
    const g = pick(r, ['#5f9a48', '#6aa650', '#7a9a48']);
    const n = 1 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const u = 0.25 + r() * 0.5, v = 0.25 + r() * 0.5;
      p.blob(u, v, 3, 3, g, 2);
      if (r() < 0.4) p.px(u, v, 4, pick(r, ['#f2d23f', '#e86a8a', '#ffffff']));
    }
  }),
};

const PROP: Record<string, (r: Rng, v: number) => Sprite> = {
  rock: (r) => mkSprite(1, 1, 26, r, (p, r) => {
    const c = pick(r, ['#b09c90', '#a8958c', '#b8a698', '#9f8f86']);
    p.blob(0.42, 0.55, 4, 6, c, 4);
    if (r() < 0.7) p.blob(0.62, 0.42, 4, 4, shade(c, 0.94), 3);
    if (r() < 0.5) p.blob(0.45, 0.5, 11, 4, shade(c, 1.05), 3);
    if (r() < 0.3) p.blob(0.24, 0.7, 2, 2, '#6a9a48', 2);
  }),
  lamp: (r) => mkSprite(1, 1, 22, r, (p) => {
    p.px(0.1, 0.1, 0, '#3c3c44', 0, -15, 1, 15);
    p.px(0.1, 0.1, 15, '#3c3c44', 0, 0, 3, 1);
    p.px(0.1, 0.1, 15, '#fff3c0', 2, 1, 2, 1);
    p.glowPx(0.1, 0.1, 15, '#fff0b0', 1, 0, 3, 2);
    p.halo(0.3, 0.3, 0, 18, 9, '255,206,120', 0.42);
  }),
  statue: (r, v) => mkSprite(1, 1, 24, r, (p) => {
    p.box(0.34, 0.34, 0.66, 0.66, 0, 7, '#b8b0a4');
    const c = v % 2 ? '#5a5248' : '#7a6a4a';
    p.px(0.5, 0.5, 7, c, -1, -7, 3, 7);
    p.px(0.5, 0.5, 7, c, 0, -9, 2, 2);
    p.px(0.5, 0.5, 7, c, 2, -6, 2, 1);
    p.halo(0.5, 0.5, 6, 6, 5, '255,220,150', 0.35);
  }),
  stall: (r) => mkSprite(1, 1, 22, r, (p, r) => {
    const c = pick(r, BRIGHT);
    p.box(0.16, 0.16, 0.84, 0.84, 0, 5, '#8a6a4a');
    for (let i = 0; i < 14; i++) p.px(0.2 + r() * 0.6, 0.2 + r() * 0.6, 5, pick(r, BRIGHT), 0, -1, 1, 1);
    for (const [u, v] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) p.px(u, v, 0, '#5b4a3a', 0, -13, 1, 13);
    p.glowFace('L', 0.16, 0.84, 0.84, 5, 12, '#a87a30');
    p.glowFace('R', 0.16, 0.84, 0.84, 5, 12, '#8a6426');
    p.top(0.06, 0.06, 0.94, 0.94, 13, c);
    p.top(0.06, 0.3, 0.94, 0.42, 13, '#f6f0e0');
    p.top(0.06, 0.62, 0.94, 0.74, 13, '#f6f0e0');
    p.left(0.06, 0.94, 0.94, 11, 13, shade(c, 0.8));
    p.right(0.94, 0.06, 0.94, 11, 13, shade(c, 0.62));
  }),
  animal: (r, v) => mkSprite(1, 1, 22, r, (p) => {
    const k = (dx: number, dy: number, w: number, h: number, c: string) => p.px(0.5, 0.5, 0, c, dx, dy, w, h);
    if (v === 0) { k(-4, -7, 8, 5, '#8f8f98'); k(3, -8, 3, 4, '#8f8f98'); k(5, -5, 1, 4, '#8f8f98'); k(-4, -2, 2, 2, '#7a7a84'); k(2, -2, 2, 2, '#7a7a84'); k(4, -7, 1, 1, '#22222a'); }
    else if (v === 1) { k(-2, -6, 5, 3, '#e0b040'); k(2, -13, 2, 8, '#e0b040'); k(2, -14, 3, 2, '#e0b040'); k(-2, -3, 1, 3, '#c89a30'); k(2, -3, 1, 3, '#c89a30'); k(-1, -5, 1, 1, '#8a5a20'); k(1, -6, 1, 1, '#8a5a20'); k(2, -10, 1, 1, '#8a5a20'); }
    else if (v === 2) { k(-4, -4, 7, 3, '#e8892a'); k(3, -5, 3, 3, '#e8892a'); k(-5, -5, 1, 2, '#e8892a'); k(-2, -4, 1, 3, '#33221a'); k(0, -4, 1, 3, '#33221a'); k(-4, -1, 1, 1, '#c8701a'); k(2, -1, 1, 1, '#c8701a'); }
    else if (v === 3) { k(-3, -5, 5, 3, '#b8834a'); k(2, -7, 2, 3, '#b8834a'); k(3, -9, 1, 2, '#6b4a2e'); k(-3, -2, 1, 2, '#9a6a3a'); k(1, -2, 1, 2, '#9a6a3a'); k(-1, -5, 1, 1, '#f0e0c0'); }
    else if (v === 4) { k(-3, -5, 6, 4, '#3a3230'); k(2, -6, 3, 3, '#3a3230'); k(-3, -1, 2, 1, '#2a2422'); k(1, -1, 2, 1, '#2a2422'); }
    else { k(-1, -4, 3, 3, '#2f6fb8'); k(1, -6, 1, 2, '#2f6fb8'); k(-5, -4, 4, 2, '#2f9a7a'); k(-6, -3, 2, 2, '#3fb08a'); k(-4, -4, 1, 1, '#e8d040'); k(0, -1, 1, 1, '#8a6a3a'); }
  }),
  goal: (r, v) => mkSprite(1, 1, 14, r, (p) => {
    const u = v ? 0.8 : 0.2;
    p.line(u, 0.2, 0, u, 0.2, 7, '#f4f4f4');
    p.line(u, 0.8, 0, u, 0.8, 7, '#f4f4f4');
    p.line(u, 0.2, 7, u, 0.8, 7, '#f4f4f4');
  }),
  railcar: (r, v) => mkSprite(1, 1, 16, r, (p) => {
    const c = v === 0 ? '#d9772f' : '#2f5fa8';
    p.box(0.02, 0.3, 0.98, 0.7, 2, 11, c);
    p.left(0.02, 0.98, 0.7, 6, 7, '#f0e6c8');
    p.windows('L', 0.06, 0.94, 0.7, 7, 11, v === 0 ? 2 : 5, 1, '#23303c', r, 0.6, WARM, 0.6, 0.7);
    p.top(0.02, 0.3, 0.98, 0.7, 11, '#b9bcc2');
  }),
  plane: (r, v) => mkSprite(2, 2, 22, r, (p) => {
    const tail = v ? '#2f6fb8' : '#e2603a';
    p.top(0.95, 0.15, 1.3, 1.85, 5, '#d6d6dc');
    p.box(0.25, 0.86, 1.8, 1.14, 3, 8, '#f2f2f4');
    p.left(0.5, 1.6, 1.14, 6, 7, '#3f5c72');
    p.facePoly('L', 1.0, tail, [0.25, 8, 0.6, 8, 0.3, 17, 0.22, 17]);
    p.top(0.2, 0.7, 0.45, 1.3, 8, '#d6d6dc');
    p.px(1.1, 0.6, 3, '#8a8a92', -1, -2, 3, 3);
    p.px(1.1, 1.5, 3, '#8a8a92', -1, -2, 3, 3);
    p.right(1.8, 0.9, 1.1, 5, 8, '#3f5c72');
  }),
};

function viaduct(name: string, v: number, r: Rng): Sprite {
  return mkSprite(1, 1, 44, r, (p) => {
    const con = '#c6c1b7';
    const station = name[0] === 's';
    const axis = station ? name[1] : name;
    const pillar = () => { p.box(0.43, 0.43, 0.57, 0.57, 0, 19, '#b3aea4'); p.box(0.38, 0.38, 0.62, 0.62, 18, 20, '#bdb8ae'); };
    const deckX = (w: number) => { p.box(0, 0.5 - w, 1, 0.5 + w, 20, 23, con); p.line(0, 0.42, 23, 1, 0.42, 23, '#8a8a92'); p.line(0, 0.58, 23, 1, 0.58, 23, '#8a8a92'); };
    const deckY = (w: number) => { p.box(0.5 - w, 0, 0.5 + w, 1, 20, 23, con); p.line(0.42, 0, 23, 0.42, 1, 23, '#8a8a92'); p.line(0.58, 0, 23, 0.58, 1, 23, '#8a8a92'); };
    if (axis === 'c') { pillar(); deckX(0.24); deckY(0.24); return; }
    if (station) {
      const col = ['#d8433b', '#3b78d8', '#3aa657'][v] ?? '#d8433b';
      p.box(0.3, 0.3, 0.7, 0.7, 0, 19, '#b3aea4');
      if (axis === 'x') {
        deckX(0.4);
        p.left(0, 1, 0.9, 23, 26, col);
        p.glowFace('L', 0, 1, 0.9, 20, 26, shade(col, 0.7));
        p.box(0.1, 0.9, 0.3, 1.0, 0, 20, '#a8a39a');
      } else {
        deckY(0.4);
        p.right(0.9, 0, 1, 23, 26, shade(col, 0.8));
        p.glowFace('R', 0, 1, 0.9, 20, 26, shade(col, 0.6));
        p.box(0.9, 0.1, 1.0, 0.3, 0, 20, '#a8a39a');
      }
      p.halo(0.5, 0.5, 24, 14, 7, '255,240,200', 0.3);
      return;
    }
    if (v === 1) pillar();
    if (axis === 'x') deckX(0.24); else deckY(0.24);
  });
}
