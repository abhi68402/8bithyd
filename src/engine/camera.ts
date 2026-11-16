// Pan / zoom camera with inertia, cursor-anchored zoom, pinch, keyboard and
// eased fly-to. Positions are world pixels; zoom is CSS px per art px.
import { WORLD_W, WORLD_H } from '../world/geo';

export const ZOOM_LEVELS = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4];
const ZMIN = 1 / 32, ZMAX = 4;

export class Camera {
  x = WORLD_W / 2; y = WORLD_H / 2; zoom = 2; tz = 2;
  w = 1; h = 1; dpr = 1;
  private vx = 0; private vy = 0;
  private ax = 0; private ay = 0; // zoom anchor, css px from centre
  private wheelIdle = 9;
  private fly: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; d: number } | null = null;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private dragDist = 0;
  private pinch = 0;
  private lastMove = 0;
  dragging = false;
  onTap: (wx: number, wy: number) => void = () => {};
  onUserMove: () => void = () => {};

  attach(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragDist = this.pointers.size > 1 ? 99 : 0;
      this.vx = this.vy = 0;
      this.fly = null;
      this.pinch = 0;
      this.dragging = true;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.dragDist += Math.abs(dx) + Math.abs(dy);
        if (this.dragDist > 4) {
          this.x -= dx / this.zoom; this.y -= dy / this.zoom;
          const now = performance.now();
          const dt = Math.max(4, now - this.lastMove) / 1000;
          this.lastMove = now;
          this.vx = this.vx * 0.5 + (-dx / this.zoom / dt) * 0.5;
          this.vy = this.vy * 0.5 + (-dy / this.zoom / dt) * 0.5;
          this.onUserMove();
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch > 0) {
          this.ax = (a.x + b.x) / 2 - this.w / 2; this.ay = (a.y + b.y) / 2 - this.h / 2;
          this.setZoom(this.zoom * (d / this.pinch));
          this.tz = this.zoom;
          this.x -= dx / 2 / this.zoom; this.y -= dy / 2 / this.zoom;
          this.wheelIdle = 0;
          this.onUserMove();
        }
        this.pinch = d;
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.dragging = false;
        if (this.dragDist <= 4) {
          this.vx = this.vy = 0;
          const r = el.getBoundingClientRect();
          const [wx, wy] = this.toWorld(e.clientX - r.left, e.clientY - r.top);
          this.onTap(wx, wy);
        } else if (performance.now() - this.lastMove > 80) this.vx = this.vy = 0;
      }
      this.pinch = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.ax = e.clientX - r.left - this.w / 2;
      this.ay = e.clientY - r.top - this.h / 2;
      const k = e.ctrlKey ? 0.012 : e.deltaMode === 1 ? 0.05 : 0.0022;
      this.tz = Math.max(ZMIN, Math.min(ZMAX, this.tz * Math.exp(-e.deltaY * k)));
      this.wheelIdle = 0;
      this.fly = null;
      this.onUserMove();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === '+' || k === '=') this.zoomStep(1);
      else if (k === '-' || k === '_') this.zoomStep(-1);
      else this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  zoomStep(dir: number) {
    this.ax = this.ay = 0;
    let i = 0;
    for (let k = 0; k < ZOOM_LEVELS.length; k++) if (Math.abs(ZOOM_LEVELS[k] - this.tz) < Math.abs(ZOOM_LEVELS[i] - this.tz)) i = k;
    this.tz = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + dir))];
    this.wheelIdle = 9;
  }

  private setZoom(z: number) {
    z = Math.max(ZMIN, Math.min(ZMAX, z));
    this.x += this.ax * (1 / this.zoom - 1 / z);
    this.y += this.ay * (1 / this.zoom - 1 / z);
    this.zoom = z;
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [this.x + (sx - this.w / 2) / this.zoom, this.y + (sy - this.h / 2) / this.zoom];
  }

  flyTo(x: number, y: number, z = this.tz, d = 0.9) {
    this.fly = { x0: this.x, y0: this.y, z0: this.zoom, x1: x, y1: y, z1: z, t: 0, d };
    this.vx = this.vy = 0;
  }
  jump(x: number, y: number, z = this.zoom) { this.x = x; this.y = y; this.zoom = this.tz = z; this.fly = null; }
  get flying() { return !!this.fly; }

  update(dt: number) {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.d);
      const e = f.t * f.t * (3 - 2 * f.t);
      this.x = f.x0 + (f.x1 - f.x0) * e;
      this.y = f.y0 + (f.y1 - f.y0) * e;
      this.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * e);
      this.tz = f.z1;
      if (f.t >= 1) this.fly = null;
    } else {
      // keyboard pan
      let kx = 0, ky = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
      if (kx || ky) {
        const sp = 620 / this.zoom;
        this.x += kx * sp * dt; this.y += ky * sp * dt;
        this.onUserMove();
      }
      // inertia
      if (!this.dragging && (this.vx || this.vy)) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        const k = Math.exp(-dt * 5.5);
        this.vx *= k; this.vy *= k;
        if (Math.abs(this.vx) + Math.abs(this.vy) < 4) this.vx = this.vy = 0;
      }
      // zoom easing, snapping to crisp pixel scales once input settles
      this.wheelIdle += dt;
      if (this.wheelIdle > 0.22 && this.wheelIdle < 5 && this.pointers.size < 2) {
        let best = ZOOM_LEVELS[0];
        for (const l of ZOOM_LEVELS) if (Math.abs(Math.log(l / this.tz)) < Math.abs(Math.log(best / this.tz))) best = l;
        this.tz = best;
        this.wheelIdle = 9;
      }
      if (this.zoom !== this.tz) {
        const lz = Math.log(this.zoom) + (Math.log(this.tz) - Math.log(this.zoom)) * Math.min(1, dt * 14);
        let z = Math.exp(lz);
        if (Math.abs(z - this.tz) < 0.004) z = this.tz;
        this.setZoom(z);
      }
    }
    this.x = Math.max(0, Math.min(WORLD_W, this.x));
    this.y = Math.max(0, Math.min(WORLD_H, this.y));
  }
}
