// Game HUD: clock (live or game time), city pulse, passport of stamps, cards,
// minimap, city events and the map views. All DOM; the only per-frame work is
// a throttled tick.
import type { City, Place } from '../world/city';
import type { Sim, Pick } from '../sim/sim';
import type { Live } from '../sim/live';
import type { Events, CityEvent } from '../sim/events';
import type { Camera } from '../engine/camera';
import { ROAD_COL, type Renderer, type Overlay } from '../engine/renderer';
import type { Chunks } from '../engine/chunks';
import { spriteFor } from '../art/sprites';
import { CITY_W, WORLD_H, ROAD_NAMES, TILE, TX } from '../world/geo';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'hyderabad-days.stamps';
const PORTRAIT: Record<string, string> = {
  'laad-bazaar': 'p:stall:3', 'tank-bund': 'p:statue:0', 'mir-alam': 'lm:pier', 'financial-district': 'b:tower:4', airport: 'lm:terminal',
};
const LEGENDS: Record<Overlay, [string, string][]> = {
  none: [],
  roads: ROAD_NAMES.map((n, i) => [ROAD_COL[i], n] as [string, string]),
  traffic: [['#4cd964', 'Flowing'], ['#ffcc33', 'Slow'], ['#ff4d4d', 'Jammed']],
  metro: [['#d8433b', 'Red line'], ['#3b78d8', 'Blue line'], ['#3aa657', 'Green line'], ['rgba(70,225,205,0.5)', '10 min walk'], ['#cfcfd8', 'Railway']],
  density: [['#3c5aa0', 'Sparse'], ['#46aabe', 'Low'], ['#78d278', 'Medium'], ['#f0dc5a', 'Dense'], ['#f5963c', 'Very dense'], ['#e64646', 'Packed']],
  landuse: [['#f5cd5a', 'Residential'], ['#5a96f0', 'Commercial'], ['#be6edc', 'Industrial'], ['#5ac86e', 'Parks'], ['#329650', 'Forest'], ['#aac85a', 'Farmland'], ['#c85a50', 'Military'], ['#46aae6', 'Water']],
};

export class UI {
  stamps = new Set<string>();
  follow: Pick | null = null;
  private acc = 0;
  private pulseAcc = 0;
  private pulseIdx = 0;
  private scrubbing = false;
  private openId = '';
  private actor: Pick | null = null;
  private miniBase: HTMLCanvasElement;
  private toastTimer = 0;
  private lastMinute = -1;

  constructor(private city: City, private sim: Sim, private cam: Camera, private r: Renderer, private chunks: Chunks, private live: Live, private events: Events) {
    try {
      for (const id of JSON.parse(localStorage.getItem(STORE) || '[]')) this.stamps.add(id);
    } catch { /* storage unavailable: stamps just won't persist */ }
    r.stamped = (i) => this.stamps.has(city.places[i].id);

    // clock: live or game time
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
      b.onclick = () => { this.setLive(false); sim.speed = +b.dataset.speed!; this.syncClock(); };
    });
    $('liveBtn').onclick = () => { this.setLive(!live.on); };
    $('rainBtn').onclick = () => { this.setLive(false); sim.setRain(!sim.raining); };
    $('signBtn').onclick = () => { r.labels = !r.labels; $('signBtn').classList.toggle('on', r.labels); };
    const scrub = $<HTMLInputElement>('scrub');
    scrub.oninput = () => { this.setLive(false); this.scrubbing = true; sim.setTime(+scrub.value); this.clock(true); };
    scrub.onchange = () => { this.scrubbing = false; };
    $('zin').onclick = () => cam.zoomStep(1);
    $('zout').onclick = () => cam.zoomStep(-1);
    this.syncClock();

    // drawers
    $('passportBtn').onclick = () => this.drawer('passport');
    $('passportClose').onclick = () => this.drawer('');
    $('viewsBtn').onclick = () => { const v = $('views'); v.hidden = !v.hidden; $('viewsBtn').classList.toggle('on', !v.hidden || r.overlay !== 'none'); };
    document.querySelectorAll<HTMLButtonElement>('[data-ov]').forEach((b) => { b.onclick = () => this.setOverlay(b.dataset.ov as Overlay); });
    $<HTMLInputElement>('search').oninput = () => this.renderList();
    $('cardClose').onclick = () => this.closeCard();
    $('cardAction').onclick = () => this.cardAction();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeCard(); this.drawer(''); }
    });

    // minimap
    const mm = $<HTMLCanvasElement>('minimap');
    this.miniBase = document.createElement('canvas');
    this.miniBase.width = mm.width; this.miniBase.height = mm.height;
    const bc = this.miniBase.getContext('2d')!;
    bc.imageSmoothingQuality = 'high';
    bc.drawImage(chunks.overview, 0, 0, mm.width, mm.height);
    const toWorld = (e: PointerEvent): [number, number] => {
      const b = mm.getBoundingClientRect();
      return [((e.clientX - b.left) / b.width) * CITY_W, ((e.clientY - b.top) / b.height) * WORLD_H];
    };
    let down = false;
    mm.onpointerdown = (e) => { down = true; mm.setPointerCapture(e.pointerId); const [x, y] = toWorld(e); this.stopFollow(); cam.flyTo(x, y, Math.max(0.5, cam.tz), 0.6); };
    mm.onpointermove = (e) => { if (down) { const [x, y] = toWorld(e); cam.jump(x, y, cam.zoom); } };
    mm.onpointerup = mm.onpointercancel = () => { down = false; };

    cam.onUserMove = () => { this.stopFollow(); $('hint').classList.add('gone'); };
    cam.onTap = (wx, wy) => this.tap(wx, wy);
    // events announce themselves; tapping the announcement takes you there
    events.onStart = (a) => this.toast(`HAPPENING NOW: ${a.ev.name.toUpperCase()} · TAP TO GO`, () => this.goEvent(a.ev, false), 7);

    this.renderList();
    this.counts();
    this.clock(true);
    window.addEventListener('hashchange', () => this.fromHash());
  }

  private setLive(on: boolean) {
    if (this.live.on === on) return;
    this.live.set(on);
    if (!on && this.sim.speed === 0) this.sim.speed = 1;
    this.syncClock();
    this.clock(true);
  }
  private syncClock() {
    const live = this.live.on;
    $('liveBtn').classList.toggle('on', live);
    $('clock').classList.toggle('live', live);
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.classList.toggle('on', !live && +b.dataset.speed! === this.sim.speed));
  }

  private setOverlay(o: Overlay) {
    this.r.overlay = this.r.overlay === o ? 'none' : o;
    const cur = this.r.overlay;
    document.querySelectorAll<HTMLButtonElement>('[data-ov]').forEach((b) => b.classList.toggle('on', b.dataset.ov === cur && cur !== 'none'));
    $('viewsBtn').classList.toggle('on', cur !== 'none' || !$('views').hidden);
    const lg = $('legend');
    lg.textContent = '';
    for (const [col, name] of LEGENDS[cur]) {
      const s = document.createElement('span'), i = document.createElement('i');
      i.style.background = col;
      s.append(i, name.toUpperCase());
      lg.append(s);
    }
    this.viewInfo();
  }

  /** One line of live facts for the active map view. */
  private viewInfo() {
    const o = this.r.overlay, cam = this.cam, el = $('viewInfo');
    if (o === 'none') { el.textContent = ''; return; }
    if (o === 'metro') {
      let best = '', bd = Infinity, line = '';
      for (const m of this.city.metro) for (const st of m.stations) {
        const d = Math.hypot(st.x - cam.x, st.y - cam.y * 2);
        if (d < bd) { bd = d; best = st.name; line = m.name; }
      }
      el.textContent = best ? `NEAREST TO CENTRE: ${best.toUpperCase()} (${line.toUpperCase()}) · ${bd < 1000 ? Math.round(bd / 10) * 10 + ' M' : (bd / 1000).toFixed(1) + ' KM'} · ${Math.max(1, Math.round(bd / 80))} MIN WALK` : 'NO METRO DATA';
    } else if (o === 'roads') {
      if (this.r.mode !== 'detail') { el.textContent = 'MAIN ROADS SHOWN · ZOOM IN FOR EVERY STREET'; return; }
      const vw = cam.w / cam.zoom / 2, vh = cam.h / cam.zoom;
      let main = 0, local = 0;
      for (let ty = Math.floor((cam.y * 2 - vh) / TILE); ty <= Math.floor((cam.y * 2 + vh) / TILE); ty++) {
        for (let tx = Math.floor((cam.x - vw) / TILE); tx <= Math.floor((cam.x + vw) / TILE); tx++) {
          const t = this.city.peek(ty * TX + tx);
          if (t) for (const r of t.roads) { if (r.cls <= 4) main += r.total; else local += r.total; }
        }
      }
      el.textContent = `AROUND HERE: ${(main / 1000).toFixed(0)} KM MAIN ROADS · ${(local / 1000).toFixed(0)} KM STREETS`;
    } else if (o === 'traffic') {
      const c = this.sim.congestion(2);
      el.textContent = `SIMULATED FROM TIME, RAIN AND EVENTS · MAIN ROADS ${c > 0.6 ? 'JAMMED' : c > 0.33 ? 'SLOW' : 'FLOWING'}`;
    } else if (o === 'density') el.textContent = 'BUILT FLOOR AREA PER 32 M CELL, FROM REAL FOOTPRINTS';
    else el.textContent = 'LAND USE AS MAPPED IN OPENSTREETMAP';
  }

  fromHash(): boolean {
    const id = location.hash.slice(1);
    const p = this.city.places.find((q) => q.id === id);
    if (p && id !== this.openId) { this.openPlace(p, true); return true; }
    return !!p;
  }

  private drawer(which: '' | 'passport') {
    $('passport').hidden = which !== 'passport';
    $('brand').hidden = which !== '';
    if (which === 'passport') this.renderList();
  }

  private renderList() {
    const q = $<HTMLInputElement>('search').value.trim().toLowerCase();
    const list = $('placeList');
    list.textContent = '';
    let area = '';
    for (const p of this.city.places) {
      if (q && !p.name.toLowerCase().includes(q) && !p.te.includes(q) && !p.area.toLowerCase().includes(q)) continue;
      if (p.area !== area) {
        area = p.area;
        const h = document.createElement('h4');
        h.textContent = area.toUpperCase();
        list.append(h);
      }
      const b = document.createElement('button');
      b.className = 'place' + (this.stamps.has(p.id) ? ' got' : '');
      const st = document.createElement('span'); st.className = 'st'; st.textContent = 'OK';
      const nm = document.createElement('span'); nm.className = 'nm';
      const a = document.createElement('span'); a.textContent = p.name;
      const t = document.createElement('span'); t.textContent = p.te; t.lang = 'te';
      nm.append(a, t);
      b.append(st, nm);
      b.onclick = () => { this.openPlace(p, true); if (window.innerWidth < 700) this.drawer(''); };
      list.append(b);
    }
    if (!list.children.length) { const e = document.createElement('p'); e.textContent = 'No place by that name.'; list.append(e); }
  }

  private goEvent(ev: CityEvent, start: boolean) {
    if (start) this.events.force(ev.id);
    const p = this.city.places.find((q) => q.id === ev.place);
    if (p) { this.stopFollow(); this.cam.flyTo(p.x, p.y / 2 - 20, 2, 1.6); }
    if (window.innerWidth < 700) this.drawer('');
  }

  private counts() {
    const t = `${this.stamps.size}/${this.city.places.length}`;
    $('stampCount').textContent = t;
    $('stampCount2').textContent = `${t} stamped`;
  }

  private stamp(p: Place) {
    if (this.stamps.has(p.id)) return;
    this.stamps.add(p.id);
    try { localStorage.setItem(STORE, JSON.stringify([...this.stamps])); } catch { /* ignore */ }
    this.counts();
    if (!$('passport').hidden) this.renderList();
    const all = this.stamps.size === this.city.places.length;
    this.toast(all ? 'PASSPORT COMPLETE! YOU KNOW HYDERABAD.' : `STAMPED: ${p.name.toUpperCase()} · ${this.stamps.size}/${this.city.places.length}`);
    if (p.id === this.openId) $('cardTag').textContent = `${p.area.toUpperCase()} · STAMPED`;
  }

  private toast(msg: string, onTap: (() => void) | null = null, secs = 2.8) {
    const t = $('toast');
    t.textContent = msg;
    t.onclick = onTap ? () => { onTap(); t.hidden = true; } : null;
    t.hidden = true;
    void t.offsetWidth; // restart the pop animation
    t.hidden = false;
    this.toastTimer = secs;
  }

  /** wx, wy are world pixels. */
  private tap(wx: number, wy: number) {
    $('hint').classList.add('gone');
    const z = this.cam.zoom;
    if (z >= 1) {
      const pick = this.sim.pick(wx, wy * 2 + 6, 12 + 10 / z);
      if (pick) { this.openActor(pick); return; }
    }
    let best: Place | null = null, bd = Infinity;
    const reach = Math.max(34, 26 / z);
    for (const p of this.city.places) {
      const lift = p.lift ?? 30;
      if (Math.abs(wx - p.x) > reach * 1.6 || wy < p.y / 2 - lift - reach || wy > p.y / 2 + reach) continue;
      const d = Math.hypot(wx - p.x, wy - (p.y / 2 - lift / 2));
      if (d < bd) { bd = d; best = p; }
    }
    if (best) this.openPlace(best, false);
    else this.closeCard();
  }

  openPlace(p: Place, fly: boolean) {
    this.stopFollow();
    this.actor = null;
    this.r.selected = null;
    this.openId = p.id;
    this.r.selectedPlace = p.i;
    if (fly) {
      const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
      this.cam.flyTo(p.x, p.y / 2 - (p.lift ?? 30) / 3, 2, Math.min(2.4, 1 + d / 9000));
    }
    $('cardTag').textContent = `${p.area.toUpperCase()}${this.stamps.has(p.id) ? ' · STAMPED' : ''}`;
    $('cardName').textContent = p.name;
    $('cardTe').textContent = p.te;
    $('cardBlurb').textContent = p.blurb;
    $('cardAction').textContent = 'FLY THERE';
    $('cardAction').hidden = fly;
    this.portrait(PORTRAIT[p.id] ?? p.sprite ?? 'lm:flag');
    $('card').hidden = false;
    if (location.hash.slice(1) !== p.id) history.replaceState(null, '', '#' + p.id);
  }

  private openActor(pick: Pick) {
    this.stopFollow();
    this.actor = pick;
    this.openId = '';
    this.r.selectedPlace = -1;
    this.r.selected = pick;
    this.refreshActor();
    this.actorPortrait(pick);
    $('card').hidden = false;
  }

  private refreshActor() {
    if (!this.actor) return;
    if (!this.sim.alive(this.actor)) { this.closeCard(); return; }
    const d = this.sim.describe(this.actor);
    $('cardTag').textContent = this.actor.type === 'c' ? 'CITIZEN' : this.actor.type === 't' ? 'METRO' : 'ON THE ROAD';
    $('cardName').textContent = d.title;
    $('cardTe').textContent = '';
    $('cardBlurb').textContent = d.lines.join(' · ');
    $('cardAction').hidden = false;
    $('cardAction').textContent = this.follow ? 'STOP' : d.action.toUpperCase();
  }

  private cardAction() {
    if (this.actor) {
      if (this.follow) this.stopFollow();
      else { this.follow = this.actor; if (this.cam.tz < 2) this.cam.tz = 2; }
      this.refreshActor();
    } else {
      const p = this.city.places.find((q) => q.id === this.openId);
      if (p) this.openPlace(p, true);
    }
  }

  private stopFollow() {
    if (!this.follow) return;
    this.follow = null;
    this.refreshActor();
  }

  closeCard() {
    $('card').hidden = true;
    this.follow = null;
    this.actor = null;
    this.openId = '';
    this.r.selected = null;
    this.r.selectedPlace = -1;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  private portrait(key: string) {
    const cv = $<HTMLCanvasElement>('portrait');
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#bfe0e6'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#8fbf6a'; ctx.fillRect(0, 70, 96, 26);
    const s = spriteFor(key).c;
    let k = Math.min(88 / s.width, 88 / s.height);
    k = k >= 1 ? Math.floor(k) : k;
    const w = s.width * k, h = s.height * k;
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(s, Math.round((96 - w) / 2), Math.round(90 - h), w, h);
  }

  private actorPortrait(pick: Pick) {
    const cv = $<HTMLCanvasElement>('portrait');
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#bfe0e6'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#59585f'; ctx.fillRect(0, 62, 96, 34);
    const sh = this.r.sheets;
    if (pick.type === 'v') ctx.drawImage(sh.veh, 24, this.sim.veh.look[pick.i] * 20, 24, 20, 0, 4, 96, 80);
    else if (pick.type === 'c') ctx.drawImage(sh.ppl, 0, this.sim.ppl.look[pick.i] * 8, 5, 8, 28, 16, 40, 64);
    else ctx.drawImage(sh.train, 0, this.sim.trains[pick.i].line * 24, 30, 24, 3, 12, 90, 72);
  }

  private clock(force = false) {
    const m = Math.floor(this.sim.time);
    if (!force && m === this.lastMinute) return;
    this.lastMinute = m;
    const h = Math.floor(m / 60), s = this.sim;
    $('time').textContent = `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const hr = m / 60;
    const part = hr < s.sunrise - 0.7 ? 'NIGHT' : hr < s.sunrise + 1 ? 'DAWN' : hr < 12 ? 'MORNING' : hr < 16 ? 'AFTERNOON' : hr < s.sunset + 0.8 ? 'EVENING' : 'NIGHT';
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    $('dayline').textContent = `${days[s.weekday]} · ${part}${s.rain > 0.4 ? ' · RAIN' : ''}`;
    $('liveline').textContent = this.live.on ? this.live.label : 'GAME TIME';
    if (!this.scrubbing) $<HTMLInputElement>('scrub').value = String(m);
    const sky = $('sky');
    const [r, g, b] = s.tint;
    sky.style.background = `rgb(${Math.round((143 * r) / 255)},${Math.round((208 * g) / 255)},${Math.round((232 * b) / 255)})`;
    const day = hr >= s.sunrise && hr < s.sunset;
    const f = day ? (hr - s.sunrise) / (s.sunset - s.sunrise) : ((hr + 24 - s.sunset) % 24) / (24 - s.sunset + s.sunrise);
    sky.style.setProperty('--sun', `${Math.round(14 - Math.sin(f * Math.PI) * 12)}px`);
    sky.style.setProperty('--orb', day ? '#ffd23f' : '#f4f0e0');
  }

  private pulse() {
    const s = this.sim;
    const c = s.congestion(2);
    const ev = this.events.active[0];
    const lines = [
      `${this.city.buildings.toLocaleString('en-IN')} REAL BUILDINGS ON THE MAP`,
      `TRAFFIC: ${c > 0.6 ? 'HONKING EVERYWHERE' : c > 0.33 ? 'BUSY, AS USUAL' : 'SMOOTH FOR ONCE'}`,
      `${Math.round(s.chai).toLocaleString('en-IN')} CUPS OF CHAI POURED TODAY`,
      `METRO: ${s.trains.length} TRAINS ON ${this.city.metro.length} LINES`,
      ev ? `ON NOW: ${ev.ev.name.toUpperCase()}` : s.rain > 0.4 ? 'MONSOON SHOWER OVER THE CITY' : s.night > 0.6 ? 'CITY LIGHTS ARE ON' : 'CLEAR DECCAN SKIES',
    ];
    this.pulseIdx = (this.pulseIdx + 1) % lines.length;
    $('pulseText').textContent = lines[this.pulseIdx];
  }

  /** Called every frame; does real work a few times a second. */
  update(dt: number) {
    if (this.follow) {
      if (!this.sim.alive(this.follow)) this.stopFollow();
      else {
        const [x, y] = this.sim.posOf(this.follow);
        const k = Math.min(1, dt * 7);
        this.cam.x += (x - this.cam.x) * k;
        this.cam.y += (y / 2 - 4 - this.cam.y) * k;
      }
    }
    this.acc += dt;
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) $('toast').hidden = true; }
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;
    this.clock();
    this.pulseAcc += step;
    if (this.pulseAcc > 3.5) { this.pulseAcc = 0; this.pulse(); $('liveline').textContent = this.live.on ? this.live.label : 'GAME TIME'; }
    if (this.actor) this.refreshActor();
    $('rainBtn').classList.toggle('on', this.sim.raining);
    if (this.r.overlay !== 'none') this.viewInfo();

    // stamp places the visitor wanders close to
    const cam = this.cam;
    if (cam.zoom >= 0.5 && !cam.flying) {
      for (const p of this.city.places) {
        if (this.stamps.has(p.id)) continue;
        if (Math.hypot(p.x - cam.x, (p.y / 2 - cam.y) * 1.5) < 150) { this.stamp(p); break; }
      }
    } else if (cam.zoom >= 0.5 && this.openId) {
      const p = this.city.places.find((q) => q.id === this.openId);
      if (p && Math.hypot(p.x - cam.x, (p.y / 2 - cam.y) * 1.5) < 150) this.stamp(p);
    }

    // minimap viewport
    const mm = $<HTMLCanvasElement>('minimap');
    const ctx = mm.getContext('2d')!;
    ctx.drawImage(this.miniBase, 0, 0);
    if (this.sim.night > 0.05) { ctx.fillStyle = `rgba(20,24,70,${this.sim.night * 0.5})`; ctx.fillRect(0, 0, mm.width, mm.height); }
    const kx = mm.width / CITY_W, ky = mm.height / WORLD_H;
    const vw = cam.w / cam.zoom, vh = cam.h / cam.zoom;
    ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round((cam.x - vw / 2) * kx) + 0.5, Math.round((cam.y - vh / 2) * ky) + 0.5, Math.max(3, Math.round(vw * kx)), Math.max(3, Math.round(vh * ky)));
    ctx.fillStyle = '#f0a030';
    ctx.fillRect(Math.round(cam.x * kx) - 1, Math.round(cam.y * ky) - 1, 3, 3);
    void this.chunks;
  }
}
