// Two small HUD features, kept out of ui.ts:
//  - a festival badge: today's real Hyderabad festival (tap to go and see it),
//    or the next one with a countdown (tap for a preview);
//  - postcard mode: frames the current view as a shareable "Greetings from
//    Hyderabad" image that can be saved or shared.
import './extras.css';
import type { City, Place } from '../world/city';
import type { Sim } from '../sim/sim';
import type { Camera } from '../engine/camera';
import type { Live } from '../sim/live';
import type { Events } from '../sim/events';
import { festivalsOn, nextFestival, indiaToday, type Festival } from '../sim/festivals';

const $ = (id: string) => document.getElementById(id)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class Extras {
  private badge = el('button', 'panel', '');
  private postBtn = el('button', 'panel btn alt', 'POSTCARD');
  private tourBtn = el('button', 'panel btn alt', 'TOUR');
  private modal = el('div', '');
  private acc = 0;
  private url = '';
  private touring = false;
  private tourIdx = 0;
  private tourTimer = 0;

  constructor(private city: City, private sim: Sim, private cam: Camera, private live: Live, private events: Events, private canvas: HTMLCanvasElement) {
    this.badge.id = 'festBadge';
    this.badge.onclick = () => this.goFestival();
    $('brand').append(this.badge);

    this.postBtn.id = 'postcardBtn';
    this.postBtn.onclick = () => this.postcard();
    this.tourBtn.id = 'tourBtn';
    this.tourBtn.title = 'Take a relaxing guided aerial tour of Hyderabad landmarks';
    this.tourBtn.onclick = () => this.toggleTour();
    document.querySelector('#brand .menu')?.append(this.postBtn, this.tourBtn);

    this.modal.id = 'postcard';
    this.modal.hidden = true;
    this.modal.onclick = (e) => { if (e.target === this.modal) this.closePostcard(); };
    document.body.append(this.modal);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.modal.hidden) this.closePostcard(); });
    this.refresh();
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc > 30) { this.acc = 0; this.refresh(); }
    if (this.touring) {
      if (this.cam.dragging) { this.stopTour(); return; }
      if (!this.cam.flying) {
        this.tourTimer -= dt;
        if (this.tourTimer <= 0) this.nextStop();
      }
    }
  }

  private static readonly TOUR_IDS = [
    'charminar', 'mecca-masjid', 'golconda', 'buddha', 'cable-bridge', 'cyber-towers',
    'birla-mandir', 'chowmahalla', 'falaknuma', 'sec-junction', 'uppal', 'airport',
  ];

  private toggleTour() {
    if (this.touring) this.stopTour();
    else {
      this.touring = true;
      this.tourIdx = 0;
      this.tourBtn.classList.add('on');
      this.tourBtn.textContent = 'STOP TOUR';
      this.nextStop();
    }
  }

  private stopTour() {
    if (!this.touring) return;
    this.touring = false;
    this.tourBtn.classList.remove('on');
    this.tourBtn.textContent = 'TOUR';
  }

  private nextStop() {
    const id = Extras.TOUR_IDS[this.tourIdx % Extras.TOUR_IDS.length];
    this.tourIdx++;
    const p = this.city.places.find((q) => q.id === id);
    if (!p) { this.stopTour(); return; }
    const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
    this.cam.flyTo(p.x, p.y / 2 - (p.lift ?? 30) / 3, 2, Math.min(2.6, 1.1 + d / 8000));
    this.tourTimer = 5.5;
  }

  // ---------- festivals ----------

  private today(): Festival | null { return festivalsOn(indiaToday())[0] ?? null; }

  private refresh() {
    const f = this.today();
    const b = this.badge;
    b.textContent = '';
    if (f) {
      b.classList.add('now');
      b.append(el('b', '', 'TODAY IN HYDERABAD'), el('span', '', f.name.toUpperCase()), el('i', '', 'TAP TO SEE IT'));
      b.title = f.blurb;
      return;
    }
    b.classList.remove('now');
    const n = nextFestival(indiaToday());
    if (!n) { b.hidden = true; return; }
    b.hidden = false;
    const when = n.days === 1 ? 'TOMORROW' : `IN ${n.days} DAYS`;
    b.append(el('b', '', `NEXT FESTIVAL · ${when}`), el('span', '', n.f.name.toUpperCase()), el('i', '', 'TAP FOR A PREVIEW'));
    b.title = n.f.blurb;
  }

  private goFestival() {
    const f = this.today() ?? nextFestival(indiaToday())?.f;
    if (!f) return;
    this.events.force(f.id); // shows it now, whatever the game hour
    const p = this.city.places.find((q) => q.id === f.place);
    if (p) this.cam.flyTo(p.x, p.y / 2 - 20, 2, 1.6);
  }

  // ---------- postcard ----------

  private nearestPlace(): Place | null {
    let best: Place | null = null, bd = Infinity;
    for (const p of this.city.places) {
      const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 600 / Math.max(0.25, this.cam.zoom) + 300 ? best : null;
  }

  private caption(): string {
    const m = Math.floor(this.sim.time);
    const time = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const l = this.live;
    const sky = l.on && l.temp !== null ? `${l.temp}°C ${l.desc}` : this.sim.rain > 0.4 ? 'Monsoon shower' : this.sim.night > 0.6 ? 'City lights' : 'Clear Deccan skies';
    const where = this.nearestPlace()?.name ?? 'Hyderabad';
    const fest = this.events.active.find((a) => a.ev.fest)?.ev.name;
    return [where, time, sky, fest].filter(Boolean).join(' · ');
  }

  private render(): HTMLCanvasElement {
    const src = this.canvas;
    const W = 1200, frame = 36, band = 150;
    const ar = src.height / src.width;
    const iw = W - frame * 2, ih = Math.round(iw * Math.min(ar, 0.75));
    const H = frame + ih + band;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    // paper card with a deckled shadow line
    g.fillStyle = '#f6ecd2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#eadbb8'; g.fillRect(0, H - 8, W, 8);
    // the view: centre crop to the photo's aspect, pixel crisp
    const sh = Math.round(src.width * (ih / iw));
    const sy = Math.max(0, Math.round((src.height - sh) / 2));
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, sy, src.width, Math.min(sh, src.height), frame, frame, iw, ih);
    g.strokeStyle = '#2a1f3a'; g.lineWidth = 4; g.strokeRect(frame - 2, frame - 2, iw + 4, ih + 4);
    // stamp in the photo's corner
    const sx = W - frame - 132, sy2 = frame + 16;
    g.fillStyle = '#f6ecd2'; g.fillRect(sx, sy2, 116, 132);
    g.setLineDash([6, 5]); g.strokeStyle = '#d8433b'; g.lineWidth = 3; g.strokeRect(sx + 6, sy2 + 6, 104, 120); g.setLineDash([]);
    this.stampArt(g, sx + 18, sy2 + 20);
    g.fillStyle = '#d8433b'; g.font = '700 14px Silkscreen, monospace'; g.textAlign = 'center';
    g.fillText('HYD', sx + 58, sy2 + 116);
    // caption band
    g.textAlign = 'left';
    g.fillStyle = '#2a1f3a'; g.font = '700 40px Silkscreen, monospace';
    g.fillText('GREETINGS FROM HYDERABAD', frame, frame + ih + 64);
    g.fillStyle = '#1f8a8a'; g.font = '20px Silkscreen, monospace';
    g.fillText(this.caption().toUpperCase(), frame, frame + ih + 102);
    g.fillStyle = '#7a6a8a'; g.font = '22px "Noto Sans Telugu", "Noto Sans Devanagari", system-ui, sans-serif'; g.textAlign = 'right';
    g.fillText('హైదరాబాద్ / हैदराबाद', W - frame, frame + ih + 64);
    g.font = '14px Silkscreen, monospace';
    g.fillText(location.host || 'hyderabad days', W - frame, frame + ih + 102);
    return c;
  }

  /** A tiny Charminar for the stamp, drawn in chunky pixels. */
  private stampArt(g: CanvasRenderingContext2D, x: number, y: number) {
    const px = 4, S = '#e8a02a', D = '#2a1f3a';
    const r = (a: number, b: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x + a * px, y + b * px, w * px, h * px); };
    r(0, 3, 3, 17, S); r(17, 3, 3, 17, S); r(0, 1, 3, 2, S); r(17, 1, 3, 2, S);
    r(3, 9, 14, 11, S); r(4, 6, 12, 3, S); r(8, 4, 4, 2, S);
    r(7, 13, 6, 7, D); r(8, 12, 4, 1, D);
  }

  private postcard() {
    const card = this.render();
    this.url = card.toDataURL('image/png');
    const m = this.modal;
    m.textContent = '';
    const box = el('div', 'panel box');
    const img = el('img');
    img.src = this.url;
    img.alt = `Postcard: ${this.caption()}`;
    const row = el('div', 'row');
    const save = el('a', 'btnlike', 'SAVE');
    save.href = this.url;
    save.download = 'hyderabad-postcard.png';
    const share = el('button', '', 'SHARE');
    share.onclick = () => this.share(card, share);
    const close = el('button', '', 'CLOSE');
    close.onclick = () => this.closePostcard();
    row.append(save, share, close);
    box.append(el('h2', '', 'YOUR POSTCARD'), img, row);
    m.append(box);
    m.hidden = false;
  }

  private async share(card: HTMLCanvasElement, btn: HTMLButtonElement) {
    const blob = await new Promise<Blob | null>((r) => card.toBlob(r, 'image/png'));
    const text = `Greetings from Hyderabad! ${this.caption()}`;
    const url = location.origin + location.pathname;
    try {
      const file = blob ? new File([blob], 'hyderabad-postcard.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url }); return; }
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      btn.textContent = 'LINK COPIED';
    } catch {
      btn.textContent = 'USE SAVE';
    }
    setTimeout(() => { btn.textContent = 'SHARE'; }, 2200);
  }

  private closePostcard() {
    this.modal.hidden = true;
    this.modal.textContent = '';
  }
}
