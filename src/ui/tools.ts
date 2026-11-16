// City-builder tools layered on the HUD: tap any building to inspect it, a
// zones map view, and a live report on the neighbourhood in view (population,
// jobs, demand bars, ratings and an advisor's remark). The DOM is created
// here so the tools stay self-contained.
import './tools.css';
import type { City } from '../world/city';
import type { Sim } from '../sim/sim';
import type { Camera } from '../engine/camera';
import type { Renderer } from '../engine/renderer';
import { pickBuilding, describeBuilding, areaReport, ZONE_COL, ZONE_NAMES, type Report } from '../world/query';
import { lang, onLang, up } from './i18n';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const num = (n: number) => Math.round(n).toLocaleString('en-IN');

type Vars = Record<string, string | number>;
const EN: Record<string, string> = {
  zones: 'ZONES', report: 'CITY REPORT', close: 'Close',
  'zones.info': 'EVERY BUILDING BY USE · UNTAGGED ONES TAKE THE ZONING OF THEIR LAND',
  'zones.zoom': 'ZONED LAND SHOWN · ZOOM IN TO SEE EVERY BUILDING',
  height: 'HEIGHT', footprint: 'FOOTPRINT', metro: 'METRO', floors: '{h} M · {n} FLOORS', floor1: '{h} M · 1 FLOOR', sqm: '{n} SQ M',
  walk: '{st} · {min} MIN WALK', far: '{st} · {km} KM AWAY',
  residents: 'RESIDENTS', workers: 'WORKERS', capacity: 'CAPACITY', about: 'ABOUT {n}',
  real: 'Real outline from OpenStreetMap. Height and occupancy are estimates.',
  gen: 'This outline was generated to fill a gap in the map. Height and occupancy are estimates.',
  title: 'NEIGHBOURHOOD REPORT', around: 'AROUND {name}', zoom: 'ZOOM IN TO STREET LEVEL TO SURVEY A NEIGHBOURHOOD', loading: 'SURVEYING...',
  pop: 'POPULATION', jobs: 'JOBS', buildings: 'BUILDINGS', tallest: 'TALLEST', roads: 'ROADS', m: '{n} M', km: '{n} KM',
  demand: 'DEMAND', rMetro: 'METRO ACCESS', rGreen: 'GREEN SPACE', rTraffic: 'TRAFFIC', rJobs: 'JOBS NEARBY',
  note: 'ESTIMATED FROM REAL FOOTPRINTS · DEMAND IS SIMULATED',
  advisor: 'ADVISOR',
  aEmpty: 'Open country out here. Plenty of room to grow.',
  aMetro: 'Hardly anyone here can walk to the metro. This area needs a station.',
  aGreen: 'Not a park in sight. People here need somewhere green.',
  aTraffic: 'The roads are choking right now. Leave the car at home.',
  aJobs: 'Lots of homes, few workplaces. Everyone here commutes out.',
  aHomes: 'All work and nowhere to live. More homes would fill up fast.',
  aGood: 'A well balanced neighbourhood. The mayor approves.',
};
const HI: Record<string, string> = {
  zones: 'ज़ोन', report: 'शहर रिपोर्ट', close: 'बंद करें',
  'zones.info': 'हर इमारत उसके इस्तेमाल के रंग में · बिना टैग वाली इमारतें अपनी ज़मीन के ज़ोन में',
  'zones.zoom': 'ज़ोन वाली ज़मीन दिख रही है · हर इमारत के लिए ज़ूम करें',
  height: 'ऊँचाई', footprint: 'क्षेत्रफल', metro: 'मेट्रो', floors: '{h} मी · {n} मंज़िल', floor1: '{h} मी · 1 मंज़िल', sqm: '{n} वर्ग मी',
  walk: '{st} · {min} मिनट पैदल', far: '{st} · {km} किमी दूर',
  residents: 'निवासी', workers: 'कर्मचारी', capacity: 'क्षमता', about: 'लगभग {n}',
  real: 'असली नक़्शा OpenStreetMap से। ऊँचाई और लोगों की संख्या अनुमानित है।',
  gen: 'नक़्शे की ख़ाली जगह भरने के लिए यह इमारत बनाई गई है। ऊँचाई और संख्या अनुमानित है।',
  title: 'मोहल्ला रिपोर्ट', around: '{name} के आसपास', zoom: 'मोहल्ले की रिपोर्ट के लिए गली तक ज़ूम करें', loading: 'सर्वे जारी है...',
  pop: 'आबादी', jobs: 'नौकरियाँ', buildings: 'इमारतें', tallest: 'सबसे ऊँची', roads: 'सड़कें', m: '{n} मी', km: '{n} किमी',
  demand: 'माँग', rMetro: 'मेट्रो पहुँच', rGreen: 'हरियाली', rTraffic: 'ट्रैफ़िक', rJobs: 'पास में काम',
  note: 'असली इमारतों से अनुमानित · माँग सिम्युलेटेड है',
  advisor: 'सलाहकार',
  aEmpty: 'यहाँ खुला इलाक़ा है। बढ़ने की बहुत जगह है।',
  aMetro: 'यहाँ से मेट्रो तक पैदल जाना मुश्किल है। इस इलाक़े को स्टेशन चाहिए।',
  aGreen: 'आसपास एक भी पार्क नहीं। लोगों को हरियाली चाहिए।',
  aTraffic: 'अभी सड़कें जाम हैं। गाड़ी घर पर ही छोड़ दें।',
  aJobs: 'घर बहुत, दफ़्तर कम। यहाँ के लोग काम के लिए दूर जाते हैं।',
  aHomes: 'सिर्फ़ काम, रहने की जगह नहीं। यहाँ घर तुरंत भर जाएँगे।',
  aGood: 'संतुलित मोहल्ला। मेयर ख़ुश हैं।',
  Residential: 'रिहायशी', Commercial: 'व्यावसायिक', Industrial: 'औद्योगिक', Public: 'सार्वजनिक',
  House: 'मकान', 'Apartment block': 'अपार्टमेंट', 'Shops and offices': 'दुकानें और दफ़्तर', 'Factory or warehouse': 'फ़ैक्टरी या गोदाम',
  'Place of worship': 'पूजा स्थल', 'Public building': 'सार्वजनिक इमारत', Shed: 'शेड', 'Office tower': 'ऑफ़िस टावर',
  'Commercial building': 'व्यावसायिक इमारत', 'Industrial building': 'औद्योगिक इमारत', Building: 'इमारत',
};
function s(key: string, vars?: Vars): string {
  let out = (lang() === 'hi' ? HI[key] : undefined) ?? EN[key] ?? key;
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

/** Line under the legend when the zones view is on. */
export const zonesInfo = (detail: boolean) => s(detail ? 'zones.info' : 'zones.zoom');
export const ZONE_LEGEND: [string, string][] = ZONE_NAMES.map((n, i) => [ZONE_COL[i], n]);

/** Adds the ZONES button to the map views panel. Call before the HUD binds its buttons. */
export function addZonesButton() {
  const b = el('button', '', s('zones')) as HTMLButtonElement;
  b.dataset.ov = 'zones';
  b.id = 'zonesBtn';
  document.querySelector('#views .grid')?.append(b);
}

export class CityTools {
  private inspect = el('div', 'panel');
  private report = el('aside', 'panel');
  private btn = el('button', 'panel btn alt') as HTMLButtonElement;
  private acc = 9;
  private last: Report | null = null;

  constructor(private city: City, private sim: Sim, private cam: Camera, private r: Renderer) {
    this.inspect.id = 'inspect'; this.inspect.hidden = true;
    this.report.id = 'report'; this.report.hidden = true;
    this.btn.id = 'reportBtn';
    this.btn.onclick = () => { this.report.hidden = !this.report.hidden; this.btn.classList.toggle('on', !this.report.hidden); this.acc = 9; };
    const menu = document.querySelector('.menu');
    menu?.insertBefore(this.btn, $('langBtn') ?? null);
    $('hud').append(this.inspect, this.report);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    onLang(() => this.relabel());
    this.relabel();
  }

  private relabel() {
    this.btn.textContent = s('report');
    const z = document.getElementById('zonesBtn');
    if (z) z.textContent = s('zones');
    if (this.r.building) this.show();
    this.acc = 9;
  }

  /** Called after the HUD has handled a tap; picks a building if nothing else was hit. */
  tap(wx: number, wy: number) {
    const ov = this.r.overlay;
    if (!$('card').hidden || this.r.mode !== 'detail' || (ov !== 'none' && ov !== 'zones')) { this.close(); return; }
    const hit = pickBuilding(this.city, wx, wy);
    if (!hit) { this.close(); return; }
    this.r.building = hit;
    this.show();
  }

  close() {
    this.r.building = null;
    this.inspect.hidden = true;
  }

  private show() {
    const f = describeBuilding(this.city, this.r.building!);
    const p = this.inspect;
    p.textContent = '';
    const x = el('button', 'x', 'X'); x.setAttribute('aria-label', s('close')); x.onclick = () => this.close();
    const tag = el('div', 'tag');
    const chip = el('i'); chip.style.background = ZONE_COL[f.zone];
    tag.append(chip, `${up(s(ZONE_NAMES[f.zone]))}${f.suburb ? ' · ' + up(f.suburb) : ''}`);
    const grid = el('dl');
    const row = (k: string, v: string) => { grid.append(el('dt', '', s(k)), el('dd', '', v)); };
    row('height', s(f.floors > 1 ? 'floors' : 'floor1', { h: f.height, n: f.floors }));
    row('footprint', s('sqm', { n: num(f.footprint) }));
    if (f.peopleLabel) row(f.peopleLabel, s('about', { n: num(Math.max(1, f.people)) }));
    if (f.station) row('metro', f.stationDist < 2500 ? s('walk', { st: up(f.station), min: Math.max(1, Math.round(f.stationDist / 80)) }) : s('far', { st: up(f.station), km: (f.stationDist / 1000).toFixed(1) }));
    p.append(x, tag, el('h3', '', up(s(f.title))), grid, el('p', 'note', s(f.generated ? 'gen' : 'real')));
    p.hidden = false;
  }

  update(dt: number) {
    if (this.r.building && (!$('card').hidden || this.r.mode !== 'detail')) this.close();
    if (this.report.hidden) return;
    this.acc += dt;
    if (this.acc < 0.8) return;
    this.acc = 0;
    this.renderReport();
  }

  private renderReport() {
    const { cam, city, sim } = this;
    const p = this.report;
    p.textContent = '';
    const head = el('header');
    const x = el('button', 'x', 'X'); x.setAttribute('aria-label', s('close')); x.onclick = () => this.btn.click();
    head.append(el('h2', '', s('title')), x);
    p.append(head);
    if (this.r.mode !== 'detail') { p.append(el('p', 'sub', s('zoom'))); return; }
    const hw = cam.w / 2 / cam.zoom, hh = cam.h / 2 / cam.zoom;
    const r = this.last = areaReport(city, cam.x - hw, (cam.y - hh) * 2, cam.x + hw, (cam.y + hh) * 2);
    p.append(el('p', 'sub', s('around', { name: up(r.suburb || 'Hyderabad') })));
    const jobs = r.jobs[1] + r.jobs[2] + r.jobs[3];
    const stats = el('dl');
    const stat = (k: string, v: string) => { stats.append(el('dt', '', s(k)), el('dd', '', v)); };
    stat('pop', num(r.residents)); stat('jobs', num(jobs));
    stat('buildings', num(r.buildings)); stat('tallest', s('m', { n: r.tallest }));
    stat('roads', s('km', { n: r.roadKm.toFixed(1) }));
    p.append(stats);

    // demand bars around a zero line, the way city builders show them
    const dm = el('div', 'demand');
    dm.append(el('span', 'lbl', s('demand')));
    ['R', 'C', 'I'].forEach((letter, i) => {
      const col = el('div', 'col'), bar = el('i'), v = r.demand[i];
      bar.style.background = ZONE_COL[i];
      bar.style.height = `${Math.abs(v) * 50}%`;
      bar.style[v >= 0 ? 'bottom' : 'top'] = '50%';
      col.append(bar, el('b', '', letter));
      col.title = s(ZONE_NAMES[i]);
      dm.append(col);
    });
    const zones = el('div', 'mix');
    for (let z = 0; z < 4; z++) {
      if (!r.byZone[z]) continue;
      const seg = el('i'); seg.style.background = ZONE_COL[z]; seg.style.flex = String(r.byZone[z]); seg.title = `${s(ZONE_NAMES[z])} ${num(r.byZone[z])}`;
      zones.append(seg);
    }
    p.append(dm, zones);

    const traffic = 1 - sim.congestion(2);
    const jobBalance = r.residents > 0 ? Math.min(1, jobs / (r.residents * 0.42)) : jobs > 0 ? 1 : 0;
    const ratings: [string, number][] = [['rMetro', r.metroShare], ['rGreen', Math.min(1, r.greenShare / 0.15)], ['rTraffic', traffic], ['rJobs', jobBalance]];
    const rt = el('div', 'ratings');
    for (const [k, v] of ratings) {
      const line = el('div'), pips = el('span', 'pips');
      const n = Math.round(Math.max(0, Math.min(1, v)) * 5);
      for (let i = 0; i < 5; i++) pips.append(el('i', i < n ? 'on' : ''));
      line.append(el('span', '', s(k)), pips);
      rt.append(line);
    }
    p.append(rt);

    let advice = 'aGood';
    if (r.buildings < 40) advice = 'aEmpty';
    else if (traffic < 0.35) advice = 'aTraffic';
    else if (r.metroShare < 0.15) advice = 'aMetro';
    else if (r.greenShare < 0.02) advice = 'aGreen';
    else if (r.demand[0] > 0.6) advice = 'aHomes';
    else if (jobBalance < 0.35) advice = 'aJobs';
    const adv = el('p', 'advisor');
    adv.append(el('b', '', s('advisor') + ': '), s(advice));
    p.append(adv, el('p', 'note', s('note')));
  }
}
