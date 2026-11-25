// Game HUD controller: mounts the React + pixel-retroui HudApp into #hud-root,
// draws the minimap & inspector portraits onto their canvas refs, and pushes
// throttled simulation/weather/report snapshots to React.
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PW, PH, PS } from '../art/actors';
import { spriteFor } from '../art/sprites';
import type { City, Place } from '../world/city';
import type { Sim, Pick } from '../sim/sim';
import { windCompass, type Live, type WeatherPreset } from '../sim/live';
import { EVENTS, type Events, type CityEvent } from '../sim/events';
import { festivalsOn, nextFestival, indiaToday, type Festival } from '../sim/festivals';
import type { Camera } from '../engine/camera';
import type { CityAudio } from '../engine/audio';
import { ROAD_COL, type Renderer, type Overlay } from '../engine/renderer';
import type { Chunks } from '../engine/chunks';
import { CITY_W, WORLD_H, ROAD_NAMES, TILE, TX } from '../world/geo';
import { pickBuilding, describeBuilding, areaReport, ZONE_NAMES, ZONE_COL, type Hit, type BuildingFacts } from '../world/query';
import { t, word, up, lang, onLang, PLACE_HI } from './i18n';
import { ZONE_LEGEND, zonesInfo } from './tools';
import { HudApp, type DrawerTab, type HudActions, type HudCardState, type HudReportState, type HudSnapshot, type HudWalkItem } from './HudApp';

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
  zones: ZONE_LEGEND,
  landuse: [['#f5cd5a', 'Residential'], ['#5a96f0', 'Commercial'], ['#be6edc', 'Industrial'], ['#5ac86e', 'Parks'], ['#329650', 'Forest'], ['#aac85a', 'Farmland'], ['#c85a50', 'Military'], ['#46aae6', 'Water']],
};
const TOUR_IDS = [
  'charminar', 'mecca-masjid', 'golconda', 'buddha', 'cable-bridge', 'cyber-towers',
  'birla-mandir', 'chowmahalla', 'falaknuma', 'sec-junction', 'uppal', 'airport',
];
const WALKS: HudWalkItem[] = [
  { id: 'old-city', name: 'OLD CITY', sub: 'Charminar & Laad Bazaar', placeId: 'charminar' },
  { id: 'lake', name: 'HUSSAIN SAGAR', sub: 'Buddha & Tank Bund', placeId: 'buddha' },
  { id: 'hitec', name: 'CYBERABAD', sub: 'Cyber Towers & Cable Bridge', placeId: 'cable-bridge' },
  { id: 'fort', name: 'GOLCONDA', sub: 'Fort & Qutb Shahi', placeId: 'golconda' },
  { id: 'sec', name: 'SECUNDERABAD', sub: 'Clock Tower & St. Mary’s', placeId: 'sec-junction' },
  { id: 'airport', name: 'SHAMSHABAD', sub: 'Runway & Terminals', placeId: 'airport' },
];
const ADVISOR_COPY: Record<string, string> = {
  aEmpty: 'Open country out here. Plenty of room to grow.',
  aMetro: 'Hardly anyone here can walk to the metro. This area needs a station.',
  aGreen: 'Not a park in sight. People here need somewhere green.',
  aTraffic: 'The roads are choking right now. Leave the car at home.',
  aJobs: 'Lots of homes, few workplaces. Everyone here commutes out.',
  aHomes: 'All work and nowhere to live. More homes would fill up fast.',
  aGood: 'A well balanced neighbourhood. The mayor approves.',
};
const num = (n: number) => Math.round(n).toLocaleString('en-IN');

export class UI {
  stamps = new Set<string>();
  follow: Pick | null = null;
  private root: Root;
  private acc = 0;
  private pulseAcc = 0;
  private pulseIdx = 0;
  private pulseLine = '';
  private reportAcc = 9;
  private festAcc = 0;
  private openId = '';
  private actor: Pick | null = null;
  private building: Hit | null = null;
  private rideMeters = 0;
  private ridePrev: [number, number] | null = null;
  private miniBase: HTMLCanvasElement;
  private minimapEl: HTMLCanvasElement | null = null;
  private portraitEl: HTMLCanvasElement | null = null;
  private pendingPortrait: (() => void) | null = null;
  private toastTimer = 0;
  private toastData: { msg: string; onTap: (() => void) | null } | null = null;
  private drawer: DrawerTab = '';
  private hintGone = false;
  private soundOn = false;
  private touring = false;
  private tourIdx = 0;
  private tourTimer = 0;
  private postcardData: { url: string; caption: string; canvas: HTMLCanvasElement } | null = null;
  private reportData: HudReportState | null = null;
  private cardData: HudCardState | null = null;

  constructor(
    private city: City,
    private sim: Sim,
    private cam: Camera,
    private r: Renderer,
    private chunks: Chunks,
    private live: Live,
    private events: Events,
    private audio?: CityAudio,
  ) {
    try {
      for (const id of JSON.parse(localStorage.getItem(STORE) || '[]')) this.stamps.add(id);
    } catch { /* ignore */ }
    r.stamped = (i) => this.stamps.has(city.places[i].id);

    this.miniBase = document.createElement('canvas');
    this.miniBase.width = 200;
    this.miniBase.height = 92;
    const bc = this.miniBase.getContext('2d')!;
    bc.imageSmoothingQuality = 'high';
    bc.drawImage(chunks.overview, 0, 0, 200, 92);

    cam.onUserMove = () => {
      this.stopFollow();
      if (!this.hintGone) { this.hintGone = true; this.renderHud(); }
    };
    cam.onTap = (wx, wy) => this.tap(wx, wy);
    events.onStart = (a) => this.toast(t('toast.event', { e: up(word(a.ev.name)) }), () => this.goEvent(a.ev, false), 7);
    window.addEventListener('hashchange', () => this.fromHash());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.postcardData) this.closePostcard();
        else { this.closeCard(); this.setDrawer(''); }
      }
    });
    onLang(() => this.renderHud());
    setTimeout(() => { if (!this.hintGone) { this.hintGone = true; this.renderHud(); } }, 9000);

    const mount = document.getElementById('hud-root')!;
    this.root = createRoot(mount);
    this.pulse();
    this.renderHud();
  }

  private actions: HudActions = {
    setLive: (on) => {
      if (this.live.on !== on) {
        this.live.set(on);
        if (!on && this.sim.speed === 0) this.sim.speed = 1;
      }
      this.audio?.blip(560);
      this.renderHud();
    },
    setSpeed: (speed) => {
      this.live.set(false);
      this.sim.speed = speed;
      this.audio?.blip(480);
      this.renderHud();
    },
    scrubTime: (minutes) => {
      this.live.set(false);
      this.sim.setTime(minutes);
      this.renderHud();
    },
    setWeatherPreset: (preset: WeatherPreset) => {
      this.live.setWeatherPreset(preset);
      this.audio?.blip(450);
      this.renderHud();
    },
    refreshWeather: () => {
      this.live.setWeatherPreset('live');
      this.live.refreshWeather();
      this.audio?.blip(520);
      this.renderHud();
    },
    toggleSigns: () => {
      this.r.labels = !this.r.labels;
      this.audio?.blip(520);
      this.renderHud();
    },
    toggleSound: () => {
      if (this.audio) this.soundOn = this.audio.toggle();
      this.renderHud();
    },
    setOverlay: (ov) => {
      this.r.overlay = ov === 'none' ? 'none' : this.r.overlay === ov ? 'none' : ov;
      this.renderHud();
    },
    setDrawer: (tab) => this.setDrawer(tab),
    openPlace: (p) => {
      this.openPlace(p, true);
      if (window.innerWidth < 700) this.setDrawer('');
    },
    closeCard: () => this.closeCard(),
    cardAction: () => this.cardAction(),
    zoomStep: (dir) => this.cam.zoomStep(dir),
    minimapFly: (wx, wy) => {
      this.stopFollow();
      this.cam.flyTo(wx, wy, Math.max(0.5, this.cam.tz), 0.6);
    },
    minimapJump: (wx, wy) => this.cam.jump(wx, wy, this.cam.zoom),
    tapToast: () => {
      const fn = this.toastData?.onTap;
      this.toastData = null;
      this.toastTimer = 0;
      this.renderHud();
      fn?.();
    },
    goFestival: () => this.goFestival(),
    toggleTour: () => this.toggleTour(),
    openPostcard: () => this.openPostcard(),
    closePostcard: () => this.closePostcard(),
    sharePostcard: () => this.sharePostcard(),
    launchEvent: (id) => {
      const ev = EVENTS.find((e) => e.id === id);
      if (ev) this.goEvent(ev, true);
    },
    goWalk: (placeId) => {
      const p = this.city.places.find((q) => q.id === placeId);
      if (p) {
        this.openPlace(p, true);
        if (window.innerWidth < 760) this.setDrawer('');
      }
    },
    setMinimapCanvas: (el) => { this.minimapEl = el; if (el) this.drawMinimap(); },
    setPortraitCanvas: (el) => {
      this.portraitEl = el;
      if (el && this.pendingPortrait) { this.pendingPortrait(); this.pendingPortrait = null; }
    },
  };

  private setDrawer(tab: DrawerTab) {
    this.drawer = this.drawer === tab ? '' : tab;
    if (this.drawer === 'report') this.reportAcc = 9;
    this.renderHud();
  }

  fromHash(): boolean {
    const id = location.hash.slice(1);
    const p = this.city.places.find((q) => q.id === id);
    if (p && id !== this.openId) { this.openPlace(p, true); return true; }
    return !!p;
  }

  private goEvent(ev: { id: string; place: string }, start: boolean) {
    if (start) this.events.force(ev.id);
    const p = this.city.places.find((q) => q.id === ev.place);
    if (p) { this.stopFollow(); this.cam.flyTo(p.x, p.y / 2 - 20, 2, 1.6); }
    if (window.innerWidth < 760) this.setDrawer('');
    this.renderHud();
  }

  private goFestival() {
    const f = this.todayFest() ?? nextFestival(indiaToday())?.f;
    if (f) this.goEvent(f, true);
  }

  private todayFest(): Festival | null {
    return festivalsOn(indiaToday())[0] ?? null;
  }

  private toggleTour() {
    if (this.touring) this.stopTour();
    else {
      this.touring = true;
      this.tourIdx = 0;
      this.nextTourStop();
      this.renderHud();
    }
  }

  private stopTour() {
    if (!this.touring) return;
    this.touring = false;
    this.renderHud();
  }

  private nextTourStop() {
    const id = TOUR_IDS[this.tourIdx % TOUR_IDS.length];
    this.tourIdx++;
    const p = this.city.places.find((q) => q.id === id);
    if (!p) { this.stopTour(); return; }
    const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
    this.cam.flyTo(p.x, p.y / 2 - (p.lift ?? 30) / 3, 2, Math.min(2.6, 1.1 + d / 8000));
    this.tourTimer = 5.5;
  }

  private stamp(p: Place) {
    if (this.stamps.has(p.id)) return;
    this.stamps.add(p.id);
    try { localStorage.setItem(STORE, JSON.stringify([...this.stamps])); } catch { /* ignore */ }
    this.audio?.stampChime();
    const all = this.stamps.size === this.city.places.length;
    this.toast(all ? t('toast.complete') : t('toast.stamped', { p: lang() === 'hi' ? PLACE_HI[p.id] ?? p.name : p.name.toUpperCase(), n: this.stamps.size, t: this.city.places.length }));
    if (p.id === this.openId && this.cardData) {
      this.cardData = { ...this.cardData, tag: `${up(word(p.area))} · ${t('card.stampedTag')}` };
    }
    this.renderHud();
  }

  private toast(msg: string, onTap: (() => void) | null = null, secs = 3.2) {
    this.toastData = { msg, onTap };
    this.toastTimer = secs;
    this.renderHud();
  }

  private tap(wx: number, wy: number) {
    this.hintGone = true;
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
    if (best) { this.openPlace(best, false); return; }
    if (z >= 1.5) {
      const hit = pickBuilding(this.city, wx, wy);
      if (hit) { this.openBuilding(hit); return; }
    }
    this.closeCard();
  }

  openPlace(p: Place, fly: boolean) {
    this.stopFollow();
    this.actor = null;
    this.building = null;
    this.r.selected = null;
    this.r.selectedBuilding = null;
    this.openId = p.id;
    this.r.selectedPlace = p.i;
    this.audio?.blip(600, 0.025);
    if (fly) {
      const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
      this.cam.flyTo(p.x, p.y / 2 - (p.lift ?? 30) / 3, 2, Math.min(2.4, 1 + d / 9000));
    }
    const [sec, secLang] = this.second(p);
    this.cardData = {
      tag: `${up(word(p.area))}${this.stamps.has(p.id) ? ` · ${t('card.stampedTag')}` : ''}`,
      title: p.name,
      sub: sec,
      subLang: secLang,
      blurb: p.blurb,
      actionText: t('card.fly'),
      showAction: !fly,
    };
    this.drawPortrait(() => this.paintPlacePortrait(PORTRAIT[p.id] ?? p.sprite ?? 'lm:flag'));
    if (location.hash.slice(1) !== p.id) history.replaceState(null, '', '#' + p.id);
    this.renderHud();
  }

  private openActor(pick: Pick) {
    this.stopFollow();
    this.actor = pick;
    this.building = null;
    this.openId = '';
    this.r.selectedPlace = -1;
    this.r.selectedBuilding = null;
    this.r.selected = pick;
    this.rideMeters = 0;
    this.ridePrev = null;
    this.audio?.blip(660, 0.025);
    this.refreshActor();
    this.drawPortrait(() => this.paintActorPortrait(pick));
    this.renderHud();
  }

  private openBuilding(hit: Hit) {
    this.stopFollow();
    this.actor = null;
    this.building = hit;
    this.openId = '';
    this.r.selectedPlace = -1;
    this.r.selected = null;
    this.r.selectedBuilding = hit;
    this.audio?.blip(540, 0.022);
    const f = describeBuilding(this.city, hit);
    const zName = up(word(ZONE_NAMES[f.zone]));
    const metroNote = f.station ? (f.stationDist < 850 ? `${f.station} (${Math.max(1, Math.round(f.stationDist / 75))} min walk)` : `${f.station} (${(f.stationDist / 1000).toFixed(1)} km)`) : '';
    const occ = f.people > 0 && f.peopleLabel ? `~${f.people.toLocaleString('en-IN')} ${f.peopleLabel}` : '';
    const bits = [`${Math.round(f.footprint).toLocaleString('en-IN')} m²`, occ, metroNote].filter(Boolean);
    this.cardData = {
      tag: `${t('card.building')} · ${zName}`,
      title: f.title,
      sub: f.suburb ? `${f.suburb.toUpperCase()} · ${f.floors}F (${f.height}M)` : `${f.floors}F (${f.height}M)`,
      subLang: 'en',
      blurb: `${bits.join(' · ')}.${f.generated ? ' (Generated block infill)' : ''}`,
      actionText: '',
      showAction: false,
    };
    this.drawPortrait(() => this.paintBuildingPortrait(f));
    this.renderHud();
  }

  private refreshActor() {
    if (!this.actor) return;
    if (!this.sim.alive(this.actor)) { this.closeCard(); return; }
    const d = this.sim.describe(this.actor);
    const sub = this.follow && this.rideMeters >= 5
      ? (this.rideMeters < 1000 ? `${Math.round(this.rideMeters)} M RIDDEN` : `${(this.rideMeters / 1000).toFixed(2)} KM RIDDEN`)
      : '';
    this.cardData = {
      tag: t(this.actor.type === 'c' ? 'card.citizen' : this.actor.type === 't' ? 'card.metro' : 'card.road'),
      title: d.title,
      sub,
      subLang: 'en',
      blurb: d.lines.join(' · '),
      actionText: this.follow ? t('card.stop') : d.action.toUpperCase(),
      showAction: true,
    };
  }

  private cardAction() {
    if (this.actor) {
      if (this.follow) this.stopFollow();
      else {
        this.follow = this.actor;
        this.rideMeters = 0;
        this.ridePrev = this.sim.posOf(this.actor);
        if (this.cam.tz < 2) this.cam.tz = 2;
      }
      this.refreshActor();
      this.renderHud();
    } else {
      const p = this.city.places.find((q) => q.id === this.openId);
      if (p) this.openPlace(p, true);
    }
  }

  private stopFollow() {
    if (!this.follow) return;
    this.follow = null;
    this.ridePrev = null;
    this.refreshActor();
    this.renderHud();
  }

  closeCard() {
    this.follow = null;
    this.ridePrev = null;
    this.actor = null;
    this.building = null;
    this.openId = '';
    this.cardData = null;
    this.r.selected = null;
    this.r.selectedBuilding = null;
    this.r.selectedPlace = -1;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    this.renderHud();
  }

  private drawPortrait(paint: () => void) {
    if (this.portraitEl) paint();
    else this.pendingPortrait = paint;
  }

  private paintPlacePortrait(key: string) {
    const cv = this.portraitEl;
    if (!cv) return;
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

  private paintActorPortrait(pick: Pick) {
    const cv = this.portraitEl;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#bfe0e6'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#59585f'; ctx.fillRect(0, 62, 96, 34);
    const sh = this.r.sheets;
    if (pick.type === 'v') ctx.drawImage(sh.veh, 24, this.sim.veh.look[pick.i] * 20, 24, 20, 0, 4, 96, 80);
    else if (pick.type === 'c') ctx.drawImage(sh.ppl, 0, this.sim.ppl.look[pick.i] * PH * PS, PW * PS, PH * PS, 30, 14, 36, 72);
    else ctx.drawImage(sh.train, 0, this.sim.trains[pick.i].line * 24, 30, 24, 3, 12, 90, 72);
  }

  private paintBuildingPortrait(f: BuildingFacts) {
    const cv = this.portraitEl;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#bfe0e6'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#8fbf6a'; ctx.fillRect(0, 68, 96, 28);
    const col = ZONE_COL[f.zone] ?? '#d9d2c4';
    const h = Math.min(58, Math.max(18, f.floors * 5));
    const y0 = 76 - h;
    ctx.fillStyle = '#2a1f3a'; ctx.fillRect(26, y0 - 2, 44, h + 4);
    ctx.fillStyle = col; ctx.fillRect(28, y0, 22, h);
    ctx.fillStyle = '#3a3048'; ctx.globalAlpha = 0.25; ctx.fillRect(50, y0, 18, h); ctx.globalAlpha = 1;
    ctx.fillStyle = '#f6ecd2'; ctx.fillRect(28, y0 - 2, 40, 4);
    ctx.fillStyle = '#2c3e52';
    for (let wy = y0 + 6; wy < 70; wy += 8) {
      for (let wx = 32; wx < 64; wx += 7) ctx.fillRect(wx, wy, 4, 4);
    }
  }

  private second = (p: Place): [string, string] => (
    lang() === 'hi' && PLACE_HI[p.id] ? [PLACE_HI[p.id], 'hi'] : [p.te, 'te']
  );

  private viewInfoText(): string {
    const o = this.r.overlay, cam = this.cam;
    if (o === 'none') return '';
    if (o === 'metro') {
      let best = '', bd = Infinity, line = '';
      for (const m of this.city.metro) for (const st of m.stations) {
        const d = Math.hypot(st.x - cam.x, st.y - cam.y * 2);
        if (d < bd) { bd = d; best = st.name; line = m.name; }
      }
      return best ? t('view.metro', { st: best.toUpperCase(), line: line.toUpperCase(), dist: bd < 1000 ? t('unit.m', { n: Math.round(bd / 10) * 10 }) : t('unit.km', { n: (bd / 1000).toFixed(1) }), min: Math.max(1, Math.round(bd / 80)) }) : t('view.noMetro');
    }
    if (o === 'roads') {
      if (this.r.mode !== 'detail') return t('view.roadsZoom');
      const vw = cam.w / cam.zoom / 2, vh = cam.h / cam.zoom;
      let main = 0, local = 0;
      for (let ty = Math.floor((cam.y * 2 - vh) / TILE); ty <= Math.floor((cam.y * 2 + vh) / TILE); ty++) {
        for (let tx = Math.floor((cam.x - vw) / TILE); tx <= Math.floor((cam.x + vw) / TILE); tx++) {
          const tl = this.city.peek(ty * TX + tx);
          if (tl) for (const rd of tl.roads) { if (rd.cls <= 4) main += rd.total; else local += rd.total; }
        }
      }
      return t('view.roads', { main: (main / 1000).toFixed(0), local: (local / 1000).toFixed(0) });
    }
    if (o === 'traffic') {
      const c = this.sim.congestion(2);
      return t('view.traffic', { s: up(word(c > 0.6 ? 'Jammed' : c > 0.33 ? 'Slow' : 'Flowing')) });
    }
    if (o === 'zones') return zonesInfo(this.r.mode === 'detail');
    if (o === 'density') return t('view.density');
    return t('view.landuse');
  }

  private computeReport() {
    if (this.drawer !== 'report') return;
    if (this.r.mode !== 'detail') {
      this.reportData = {
        detail: false, suburb: '', residents: '', jobs: '', buildings: '', tallest: '', roadKm: '',
        demand: [0, 0, 0], byZone: [0, 0, 0, 0], ratings: [], advisor: '',
      };
      return;
    }
    const { cam, city, sim } = this;
    const hw = cam.w / 2 / cam.zoom, hh = cam.h / 2 / cam.zoom;
    const r = areaReport(city, cam.x - hw, (cam.y - hh) * 2, cam.x + hw, (cam.y + hh) * 2);
    const jobs = r.jobs[1] + r.jobs[2] + r.jobs[3];
    const traffic = 1 - sim.congestion(2);
    const jobBalance = r.residents > 0 ? Math.min(1, jobs / (r.residents * 0.42)) : jobs > 0 ? 1 : 0;
    let advKey = 'aGood';
    if (r.buildings < 40) advKey = 'aEmpty';
    else if (traffic < 0.35) advKey = 'aTraffic';
    else if (r.metroShare < 0.15) advKey = 'aMetro';
    else if (r.greenShare < 0.02) advKey = 'aGreen';
    else if (r.demand[0] > 0.6) advKey = 'aHomes';
    else if (jobBalance < 0.35) advKey = 'aJobs';

    this.reportData = {
      detail: true,
      suburb: r.suburb || 'Hyderabad',
      residents: num(r.residents),
      jobs: num(jobs),
      buildings: num(r.buildings),
      tallest: `${Math.round(r.tallest)} M`,
      roadKm: `${r.roadKm.toFixed(1)} KM`,
      demand: r.demand,
      byZone: r.byZone,
      ratings: [
        { label: 'METRO ACCESS', pct: Math.round(Math.max(0, Math.min(1, r.metroShare)) * 100) },
        { label: 'GREEN SPACE', pct: Math.round(Math.max(0, Math.min(1, r.greenShare / 0.15)) * 100) },
        { label: 'TRAFFIC FLOW', pct: Math.round(Math.max(0, Math.min(1, traffic)) * 100) },
        { label: 'JOBS NEARBY', pct: Math.round(Math.max(0, Math.min(1, jobBalance)) * 100) },
      ],
      advisor: ADVISOR_COPY[advKey],
    };
  }

  private pulse() {
    const s = this.sim, c = s.congestion(2), ev = this.events.active[0];
    const skyDesc = this.live.temp !== null && this.live.weatherPreset === 'live'
      ? `LIVE SKY: ${this.live.temp}°C · ${this.live.activeDesc.toUpperCase()}`
      : t(s.rain > 0.4 ? 'pulse.monsoon' : s.night > 0.6 ? 'pulse.lights' : 'pulse.clear');
    const lines = [
      t('pulse.buildings', { n: this.city.buildings.toLocaleString('en-IN') }),
      t('pulse.traffic', { s: t(c > 0.6 ? 'pulse.honk' : c > 0.33 ? 'pulse.busy' : 'pulse.smooth') }),
      t('pulse.chai', { n: Math.round(s.chai).toLocaleString('en-IN') }),
      t('pulse.metro', { t: s.trains.length, l: this.city.metro.length }),
      ev ? t('pulse.onNow', { e: up(word(ev.ev.name)) }) : skyDesc,
    ];
    this.pulseIdx = (this.pulseIdx + 1) % lines.length;
    this.pulseLine = lines[this.pulseIdx];
  }

  private nearestPlace(): Place | null {
    let best: Place | null = null, bd = Infinity;
    for (const p of this.city.places) {
      const d = Math.hypot(p.x - this.cam.x, p.y / 2 - this.cam.y);
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 600 / Math.max(0.25, this.cam.zoom) + 300 ? best : null;
  }

  private postcardCaption(): string {
    const m = Math.floor(this.sim.time);
    const time = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const l = this.live;
    const sky = l.weatherLive && l.temp !== null ? `${l.temp}°C ${l.activeDesc}` : this.sim.rain > 0.4 ? 'Monsoon shower' : this.sim.night > 0.6 ? 'City lights' : 'Clear Deccan skies';
    const where = this.nearestPlace()?.name ?? 'Hyderabad';
    const fest = this.events.active.find((a) => a.ev.fest)?.ev.name;
    return [where, time, sky, fest].filter(Boolean).join(' · ');
  }

  private openPostcard() {
    const src = this.r.canvas;
    const W = 1200, frame = 36, band = 150;
    const ar = src.height / src.width;
    const iw = W - frame * 2, ih = Math.round(iw * Math.min(ar, 0.75));
    const H = frame + ih + band;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f6ecd2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#eadbb8'; g.fillRect(0, H - 8, W, 8);
    const sh = Math.round(src.width * (ih / iw));
    const sy = Math.max(0, Math.round((src.height - sh) / 2));
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, sy, src.width, Math.min(sh, src.height), frame, frame, iw, ih);
    g.strokeStyle = '#2a1f3a'; g.lineWidth = 4; g.strokeRect(frame - 2, frame - 2, iw + 4, ih + 4);
    const sx = W - frame - 132, sy2 = frame + 16;
    g.fillStyle = '#f6ecd2'; g.fillRect(sx, sy2, 116, 132);
    g.setLineDash([6, 5]); g.strokeStyle = '#d8433b'; g.lineWidth = 3; g.strokeRect(sx + 6, sy2 + 6, 104, 120); g.setLineDash([]);
    const px = 4, S = '#e8a02a', D = '#2a1f3a';
    const rect = (a: number, b: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(sx + 18 + a * px, sy2 + 20 + b * px, w * px, h * px); };
    rect(0, 3, 3, 17, S); rect(17, 3, 3, 17, S); rect(0, 1, 3, 2, S); rect(17, 1, 3, 2, S);
    rect(3, 9, 14, 11, S); rect(4, 6, 12, 3, S); rect(8, 4, 4, 2, S);
    rect(7, 13, 6, 7, D); rect(8, 12, 4, 1, D);
    g.fillStyle = '#d8433b'; g.font = '700 14px Silkscreen, monospace'; g.textAlign = 'center';
    g.fillText('HYD', sx + 58, sy2 + 116);
    const cap = this.postcardCaption();
    g.textAlign = 'left';
    g.fillStyle = '#2a1f3a'; g.font = '700 40px Silkscreen, monospace';
    g.fillText('GREETINGS FROM HYDERABAD', frame, frame + ih + 64);
    g.fillStyle = '#1f8a8a'; g.font = '20px Silkscreen, monospace';
    g.fillText(cap.toUpperCase(), frame, frame + ih + 102);
    g.fillStyle = '#7a6a8a'; g.font = '22px "Noto Sans Telugu", "Noto Sans Devanagari", system-ui, sans-serif'; g.textAlign = 'right';
    g.fillText('హైదరాబాద్ / हैदराबाद', W - frame, frame + ih + 64);
    g.font = '14px Silkscreen, monospace';
    g.fillText(location.host || 'hyderabad days', W - frame, frame + ih + 102);

    this.postcardData = { url: c.toDataURL('image/png'), caption: cap, canvas: c };
    this.renderHud();
  }

  private closePostcard() {
    if (!this.postcardData) return;
    this.postcardData = null;
    this.renderHud();
  }

  private async sharePostcard(): Promise<string> {
    if (!this.postcardData) return 'SHARE';
    const blob = await new Promise<Blob | null>((r) => this.postcardData!.canvas.toBlob(r, 'image/png'));
    const text = `Greetings from Hyderabad! ${this.postcardData.caption}`;
    const url = location.origin + location.pathname;
    try {
      const file = blob ? new File([blob], 'hyderabad-postcard.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url }); return 'SHARED!'; }
      if (navigator.share) { await navigator.share({ text, url }); return 'SHARED!'; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      return 'COPIED!';
    } catch {
      return 'USE SAVE';
    }
  }

  private snapshot(): HudSnapshot {
    const m = Math.floor(this.sim.time), s = this.sim, hr = m / 60;
    const h = Math.floor(m / 60) % 24;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const part = t(hr < s.sunrise - 0.7 ? 'part.night' : hr < s.sunrise + 1 ? 'part.dawn' : hr < 12 ? 'part.morning' : hr < 16 ? 'part.afternoon' : hr < s.sunset + 0.8 ? 'part.evening' : 'part.night');
    const days = t('days').split(',');
    const dayLine = `${days[s.weekday]} · ${part}${s.rain > 0.4 ? ` · ${t('part.rain')}` : ''}`;

    const [r, g, b] = s.tint;
    const skyBg = `rgb(${Math.round((143 * r) / 255)},${Math.round((208 * g) / 255)},${Math.round((232 * b) / 255)})`;
    const day = hr >= s.sunrise && hr < s.sunset;
    const f = day ? (hr - s.sunrise) / (s.sunset - s.sunrise) : ((hr + 24 - s.sunset) % 24) / (24 - s.sunset + s.sunrise);
    const skySun = `${Math.round(14 - Math.sin(f * Math.PI) * 12)}px`;
    const skyOrb = day ? '#ffd23f' : '#f4f0e0';

    const tf = this.todayFest();
    const nf = tf ? null : nextFestival(indiaToday());
    const festival = tf
      ? { now: true, label: 'TODAY IN HYDERABAD', name: tf.name.toUpperCase(), sub: 'TAP TO SEE IT', blurb: tf.blurb }
      : nf
        ? { now: false, label: `NEXT FESTIVAL · ${nf.days === 1 ? 'TOMORROW' : `IN ${nf.days} DAYS`}`, name: nf.f.name.toUpperCase(), sub: 'TAP FOR A PREVIEW', blurb: nf.f.blurb }
        : null;

    const l = this.live;
    const windText = l.windSpeed !== null ? `${l.windSpeed} KM/H${l.windDir !== null ? ` ${windCompass(l.windDir)}` : ''}` : '';
    const activeIds = new Set(this.events.active.map((a) => a.ev.id));

    return {
      timeStr, dayLine, liveOn: l.on, speed: s.speed, minutes: m, skyBg, skySun, skyOrb,
      weatherPreset: l.weatherPreset,
      weatherLabel: l.label,
      weatherCondition: l.activeDesc,
      weatherTemp: l.temp,
      weatherFeels: l.feelsLike,
      weatherHumidity: l.humidity,
      weatherWind: windText,
      weatherClouds: l.cloudPct,
      weatherAqi: l.aqi,
      weatherFetching: l.fetching,
      weatherFailed: l.failed,
      labelsOn: this.r.labels,
      soundOn: this.soundOn,
      touring: this.touring,
      hintGone: this.hintGone,
      overlay: this.r.overlay,
      legend: LEGENDS[this.r.overlay],
      viewInfo: this.viewInfoText(),
      drawer: this.drawer,
      places: this.city.places,
      stamps: [...this.stamps],
      placeAreaLabel: (area) => up(word(area)),
      placeSecond: this.second,
      festival,
      pulseText: this.pulseLine,
      toast: this.toastData ? { msg: this.toastData.msg, hasAction: !!this.toastData.onTap } : null,
      card: this.cardData,
      report: this.reportData,
      eventsList: EVENTS.filter((e) => !e.fest).map((ev) => ({
        id: ev.id, name: ev.name, when: this.events.when(ev), blurb: ev.blurb, active: activeIds.has(ev.id),
      })),
      walksList: WALKS,
      postcard: this.postcardData ? { url: this.postcardData.url, caption: this.postcardData.caption } : null,
    };
  }

  private renderHud() {
    this.root.render(<HudApp state={this.snapshot()} actions={this.actions} />);
  }

  private drawMinimap() {
    const mm = this.minimapEl;
    if (!mm) return;
    const ctx = mm.getContext('2d')!;
    ctx.drawImage(this.miniBase, 0, 0);
    if (this.sim.night > 0.05) { ctx.fillStyle = `rgba(20,24,70,${this.sim.night * 0.5})`; ctx.fillRect(0, 0, mm.width, mm.height); }
    const kx = mm.width / CITY_W, ky = mm.height / WORLD_H;
    const vw = this.cam.w / this.cam.zoom, vh = this.cam.h / this.cam.zoom;
    ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round((this.cam.x - vw / 2) * kx) + 0.5, Math.round((this.cam.y - vh / 2) * ky) + 0.5, Math.max(3, Math.round(vw * kx)), Math.max(3, Math.round(vh * ky)));
    ctx.fillStyle = '#f0a030';
    ctx.fillRect(Math.round(this.cam.x * kx) - 1, Math.round(this.cam.y * ky) - 1, 3, 3);
  }

  update(dt: number) {
    if (this.touring) {
      if (this.cam.dragging) this.stopTour();
      else if (!this.cam.flying) {
        this.tourTimer -= dt;
        if (this.tourTimer <= 0) this.nextTourStop();
      }
    }
    if (this.follow) {
      if (!this.sim.alive(this.follow)) this.stopFollow();
      else {
        const [x, y] = this.sim.posOf(this.follow);
        if (this.ridePrev) this.rideMeters += Math.hypot(x - this.ridePrev[0], y - this.ridePrev[1]);
        this.ridePrev = [x, y];
        const k = Math.min(1, dt * 7);
        this.cam.x += (x - this.cam.x) * k;
        this.cam.y += (y / 2 - 4 - this.cam.y) * k;
      }
    }
    this.acc += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) { this.toastData = null; this.renderHud(); }
    }
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;

    this.pulseAcc += step;
    if (this.pulseAcc > 3.5) { this.pulseAcc = 0; this.pulse(); }
    this.festAcc += step;
    if (this.festAcc > 30) this.festAcc = 0;
    if (this.drawer === 'report') {
      this.reportAcc += step;
      if (this.reportAcc >= 0.8) { this.reportAcc = 0; this.computeReport(); }
    }
    if (this.actor) this.refreshActor();

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

    this.drawMinimap();
    this.renderHud();
    void this.chunks;
  }
}
