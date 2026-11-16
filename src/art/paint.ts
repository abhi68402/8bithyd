// A tiny software "iso painter". Everything in the city is drawn with these
// primitives once at boot, into small canvases, and never painted again.
// Coordinates: (u, v) are tile units inside the sprite footprint, z is height
// in pixels. Polygons are filled column by column so edges keep the crisp
// 2:1 pixel-art staircase instead of anti-aliased lines.
import type { Rng } from '../world/rng';

type Ctx = CanvasRenderingContext2D;

export interface Sprite {
  c: HTMLCanvasElement;
  l: HTMLCanvasElement | null; // emissive (night lights) layer, same size
  ox: number;
  oy: number;
  fw: number;
  fd: number;
}

export function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

const shadeCache = new Map<string, string>();
export function shade(hex: string, f: number): string {
  const k = hex + f;
  let r = shadeCache.get(k);
  if (r) return r;
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  r = '#' + ((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1);
  shadeCache.set(k, r);
  return r;
}

export type Side = 'L' | 'R';

export class Painter {
  c: HTMLCanvasElement;
  ctx: Ctx;
  lc: HTMLCanvasElement | null = null;
  private lctx: Ctx | null = null;

  constructor(public w: number, public h: number, public ox: number, public oy: number) {
    this.c = mkCanvas(w, h);
    this.ctx = this.c.getContext('2d')!;
  }

  private L(): Ctx {
    if (!this.lctx) {
      this.lc = mkCanvas(this.w, this.h);
      this.lctx = this.lc.getContext('2d')!;
    }
    return this.lctx;
  }

  X(u: number, v: number) {
    return this.ox + (u - v) * 16;
  }
  Y(u: number, v: number, z: number) {
    return this.oy + (u + v) * 8 - z;
  }

  private fill(ctx: Ctx, color: string, q: number[]) {
    const n = q.length >> 1;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = q[i * 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    ctx.fillStyle = color;
    const x0 = Math.round(minX);
    const x1 = Math.round(maxX);
    for (let X = x0; X < x1; X++) {
      const xc = X + 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = q[i * 2];
        const bx = q[j * 2];
        if ((ax <= xc && xc < bx) || (bx <= xc && xc < ax)) {
          const y = q[i * 2 + 1] + ((xc - ax) / (bx - ax)) * (q[j * 2 + 1] - q[i * 2 + 1]);
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
      if (hi > lo) {
        const y0 = Math.round(lo);
        const y1 = Math.round(hi);
        if (y1 > y0) ctx.fillRect(X, y0, 1, y1 - y0);
      }
    }
  }

  private proj(p: number[]): number[] {
    const q: number[] = [];
    for (let i = 0; i < p.length; i += 3) {
      q.push(this.X(p[i], p[i + 1]), this.Y(p[i], p[i + 1], p[i + 2]));
    }
    return q;
  }

  /** Convex polygon from flat [u,v,z, u,v,z, ...]. */
  poly(color: string, p: number[]) {
    this.fill(this.ctx, color, this.proj(p));
  }
  glowPoly(color: string, p: number[]) {
    this.fill(this.L(), color, this.proj(p));
  }

  top(u0: number, v0: number, u1: number, v1: number, z: number, color: string) {
    this.poly(color, [u0, v0, z, u1, v0, z, u1, v1, z, u0, v1, z]);
  }
  /** Screen-left face: constant v. */
  left(u0: number, u1: number, v: number, z0: number, z1: number, color: string) {
    this.poly(color, [u0, v, z0, u1, v, z0, u1, v, z1, u0, v, z1]);
  }
  /** Screen-right face: constant u. */
  right(u: number, v0: number, v1: number, z0: number, z1: number, color: string) {
    this.poly(color, [u, v0, z0, u, v1, z0, u, v1, z1, u, v0, z1]);
  }
  face(side: Side, a0: number, a1: number, k: number, z0: number, z1: number, color: string) {
    if (side === 'L') this.left(a0, a1, k, z0, z1, color);
    else this.right(k, a0, a1, z0, z1, color);
  }
  glowFace(side: Side, a0: number, a1: number, k: number, z0: number, z1: number, color: string) {
    if (side === 'L') this.glowPoly(color, [a0, k, z0, a1, k, z0, a1, k, z1, a0, k, z1]);
    else this.glowPoly(color, [k, a0, z0, k, a1, z0, k, a1, z1, k, a0, z1]);
  }
  /** Polygon on a face given as flat [a, z, a, z ...]. */
  facePoly(side: Side, k: number, color: string, az: number[], glow = false) {
    const p: number[] = [];
    for (let i = 0; i < az.length; i += 2) {
      if (side === 'L') p.push(az[i], k, az[i + 1]);
      else p.push(k, az[i], az[i + 1]);
    }
    if (glow) this.glowPoly(color, p);
    else this.poly(color, p);
  }

  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: string, lf = 0.84, rf = 0.66) {
    this.left(u0, u1, v1, z0, z1, shade(color, lf));
    this.right(u1, v0, v1, z0, z1, shade(color, rf));
    this.top(u0, v0, u1, v1, z1, color);
  }
  box3(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, t: string, l: string, r: string) {
    this.left(u0, u1, v1, z0, z1, l);
    this.right(u1, v0, v1, z0, z1, r);
    this.top(u0, v0, u1, v1, z1, t);
  }

  /** Grid of windows on a face, with a random subset glowing at night. */
  windows(
    side: Side, a0: number, a1: number, k: number, z0: number, z1: number,
    nx: number, ny: number, color: string, r: Rng, lit = 0.45, glow = '#ffd58a',
    fx = 0.55, fz = 0.6,
  ) {
    const cw = (a1 - a0) / nx;
    const chh = (z1 - z0) / ny;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const wa0 = a0 + cw * (i + (1 - fx) / 2);
        const wa1 = wa0 + cw * fx;
        const wz0 = z0 + chh * (j + (1 - fz) / 2);
        const wz1 = wz0 + chh * fz;
        this.face(side, wa0, wa1, k, wz0, wz1, color);
        if (r() < lit) this.glowFace(side, wa0, wa1, k, wz0, wz1, glow);
      }
    }
  }

  /** Pointed arch on a face. */
  arch(side: Side, a0: number, a1: number, k: number, z0: number, z1: number, color: string, glow?: string) {
    const am = (a0 + a1) / 2;
    const zs = z0 + (z1 - z0) * 0.55;
    const pts = [a0, z0, a0, zs, am, z1, a1, zs, a1, z0];
    this.facePoly(side, k, color, pts);
    if (glow) this.facePoly(side, k, glow, pts, true);
  }
  arcade(side: Side, a0: number, a1: number, k: number, z0: number, z1: number, n: number, color: string, glow?: string) {
    const cw = (a1 - a0) / n;
    for (let i = 0; i < n; i++) this.arch(side, a0 + cw * (i + 0.18), a0 + cw * (i + 0.82), k, z0, z1, color, glow);
  }

  // ---- pixel-space helpers (relative to a projected point) ----
  px(u: number, v: number, z: number, color: string, dx = 0, dy = 0, w = 1, h = 1) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(this.X(u, v)) + dx, Math.round(this.Y(u, v, z)) + dy, w, h);
  }
  glowPx(u: number, v: number, z: number, color: string, dx = 0, dy = 0, w = 1, h = 1) {
    const c = this.L();
    c.fillStyle = color;
    c.fillRect(Math.round(this.X(u, v)) + dx, Math.round(this.Y(u, v, z)) + dy, w, h);
  }
  /** Soft additive halo (for lamps, floodlights). */
  halo(u: number, v: number, z: number, rx: number, ry: number, rgb: string, strength = 0.5) {
    const c = this.L();
    const cx = Math.round(this.X(u, v));
    const cy = Math.round(this.Y(u, v, z));
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
        if (d >= 1) continue;
        const a = Math.round((1 - d) * (1 - d) * strength * 8) / 8;
        if (a <= 0) continue;
        c.fillStyle = `rgba(${rgb},${a})`;
        c.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
  line(u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, color: string, glow = false) {
    const ctx = glow ? this.L() : this.ctx;
    let x0 = Math.round(this.X(u0, v0));
    let y0 = Math.round(this.Y(u0, v0, z0));
    const x1 = Math.round(this.X(u1, v1));
    const y1 = Math.round(this.Y(u1, v1, z1));
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    ctx.fillStyle = color;
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Vertical cylinder (towers, minarets, tanks). */
  cyl(u: number, v: number, z0: number, z1: number, r: number, color: string) {
    const cx = Math.round(this.X(u, v));
    const yb = Math.round(this.Y(u, v, z0));
    const yt = Math.round(this.Y(u, v, z1));
    for (let dx = -r; dx < r; dx++) {
      const t = (dx + 0.5) / r;
      this.ctx.fillStyle = t < -0.35 ? shade(color, 1.06) : t < 0.3 ? shade(color, 0.9) : shade(color, 0.68);
      const bulge = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.5);
      this.ctx.fillRect(cx + dx, yt, 1, yb - yt + bulge);
    }
    // top ellipse
    this.ctx.fillStyle = color;
    for (let dx = -r; dx < r; dx++) {
      const t = (dx + 0.5) / r;
      const b = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.5);
      if (b > 0) this.ctx.fillRect(cx + dx, yt - b, 1, b * 2);
    }
  }

  /** Dome / onion dome sitting at (u,v,z). */
  dome(u: number, v: number, z: number, r: number, color: string, squash = 1, finial?: string) {
    const cx = Math.round(this.X(u, v));
    const cy = Math.round(this.Y(u, v, z));
    let top = 0;
    for (let dx = -r; dx < r; dx++) {
      const t = (dx + 0.5) / r;
      const hgt = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * r * squash);
      const base = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.5);
      if (hgt > top) top = hgt;
      this.ctx.fillStyle = t < -0.4 ? shade(color, 1.08) : t < 0.25 ? color : shade(color, 0.74);
      this.ctx.fillRect(cx + dx, cy - hgt, 1, hgt + base);
    }
    if (finial) {
      this.ctx.fillStyle = finial;
      this.ctx.fillRect(cx - 1, cy - top - 1, 2, 1);
      this.ctx.fillRect(cx, cy - top - 4, 1, 3);
    }
  }

  /** Round blob with simple top-left lighting (tree canopies, boulders). */
  blob(u: number, v: number, z: number, r: number, color: string, ry = r) {
    const cx = Math.round(this.X(u, v));
    const cy = Math.round(this.Y(u, v, z));
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = (dx / (r + 0.3)) ** 2 + (dy / (ry + 0.3)) ** 2;
        if (d > 1) continue;
        const lightness = -dx / r - (dy / ry) * 1.3;
        this.ctx.fillStyle = lightness > 0.75 ? shade(color, 1.16) : lightness > -0.35 ? color : shade(color, 0.76);
        this.ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  /** Four-sided pyramid roof. */
  pyramid(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: string) {
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    this.poly(shade(color, 0.86), [u0, v1, z0, u1, v1, z0, um, vm, z1]);
    this.poly(shade(color, 0.66), [u1, v1, z0, u1, v0, z0, um, vm, z1]);
  }

  /** Gabled roof with ridge along u ('u') or v ('v'). */
  gable(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, axis: 'u' | 'v', color: string, wall: string) {
    if (axis === 'u') {
      const vm = (v0 + v1) / 2;
      this.poly(shade(color, 1.08), [u0, v0, z0, u1, v0, z0, u1, vm, z1, u0, vm, z1]);
      this.poly(shade(color, 0.88), [u0, v1, z0, u1, v1, z0, u1, vm, z1, u0, vm, z1]);
      this.poly(shade(wall, 0.66), [u1, v0, z0, u1, v1, z0, u1, vm, z1]);
    } else {
      const um = (u0 + u1) / 2;
      this.poly(shade(color, 1.08), [u0, v0, z0, u0, v1, z0, um, v1, z1, um, v0, z1]);
      this.poly(shade(color, 0.7), [u1, v0, z0, u1, v1, z0, um, v1, z1, um, v0, z1]);
      this.poly(shade(wall, 0.84), [u0, v1, z0, u1, v1, z0, um, v1, z1]);
    }
  }

  /** Slim tower with balcony rings and a dome on top. */
  minaret(u: number, v: number, z0: number, h: number, r: number, color: string, domeCol = color, finial = '#d9b24a') {
    this.cyl(u, v, z0, z0 + h, r, color);
    const cx = Math.round(this.X(u, v));
    for (const f of [0.5, 0.82]) {
      const y = Math.round(this.Y(u, v, z0 + h * f));
      this.ctx.fillStyle = shade(color, 0.78);
      this.ctx.fillRect(cx - r - 1, y, r * 2 + 2, 2);
      this.ctx.fillStyle = shade(color, 1.08);
      this.ctx.fillRect(cx - r - 1, y - 1, r * 2 + 2, 1);
    }
    this.dome(u, v, z0 + h + 1, r + 1, domeCol, 1.25, finial);
  }
}

export function mkSprite(
  fw: number, fd: number, H: number, seedRng: Rng,
  fn: (p: Painter, r: Rng) => void, pad = 4,
): Sprite {
  const w = (fw + fd) * 16 + pad * 2;
  const h = (fw + fd) * 8 + H + 4;
  const p = new Painter(w, h, fd * 16 + pad, H);
  fn(p, seedRng);
  return { c: p.c, l: p.lc, ox: p.ox, oy: p.oy, fw, fd };
}
