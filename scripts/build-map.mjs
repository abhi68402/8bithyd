// Turns raw OpenStreetMap JSON (data-raw/, from fetch-osm.mjs) into the files
// the site loads:
//   public/map/city.json   areas, major roads, rail, metro, places, tile index
//   public/map/grid.bin    coarse building-height grid for far zoom (RLE)
//   public/map/t/X_Y.bin   one binary tile per square km: buildings + roads
//   node scripts/build-map.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import * as G from '../src/world/geo.ts';
import { PLACES } from '../src/world/places.ts';

const RAW = new URL('../data-raw/', import.meta.url).pathname;
const OUT = new URL('../public/map/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT + 't', { recursive: true });

const load = (name) => {
  const f = `${RAW}${name}.json`;
  if (!existsSync(f)) { console.warn('missing', name); return []; }
  return JSON.parse(readFileSync(f, 'utf8')).elements ?? [];
};
const hash = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const pts = (geom) => { const o = []; for (const g of geom) if (g) o.push(G.mx(g.lon), G.my(g.lat)); return o; };
const inCity = (x, y) => x >= 0 && y >= 0 && x < G.CITY_W && y < G.CITY_H;

function area(p) { let a = 0; for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return a / 2; }
function simplify(p, tol, closed) {
  const n = p.length / 2;
  if (n <= (closed ? 4 : 2)) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((p[i * 2] - ax) * dx + (p[i * 2 + 1] - ay) * dy) / l2));
      const d = Math.hypot(p[i * 2] - ax - t * dx, p[i * 2 + 1] - ay - t * dy);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const o = [];
  for (let i = 0; i < n; i++) if (keep[i]) o.push(p[i * 2], p[i * 2 + 1]);
  return o;
}
/** Join multipolygon member ways into closed rings. */
function rings(members, role) {
  const segs = members.filter((m) => m.type === 'way' && m.geometry && (m.role === role || (role === 'outer' && !m.role))).map((m) => m.geometry.filter(Boolean));
  const out = [];
  const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
  while (segs.length) {
    let cur = segs.pop().slice();
    for (let guard = 0; guard < 5000; guard++) {
      if (key(cur[0]) === key(cur[cur.length - 1]) && cur.length > 3) break;
      const tail = key(cur[cur.length - 1]);
      const i = segs.findIndex((s) => key(s[0]) === tail || key(s[s.length - 1]) === tail);
      if (i < 0) break;
      const s = segs.splice(i, 1)[0];
      if (key(s[0]) === tail) cur = cur.concat(s.slice(1)); else cur = cur.concat(s.slice(0, -1).reverse());
    }
    if (cur.length > 3) out.push(cur);
  }
  return out;
}
const R = (v) => Math.round(v);
const ints = (p) => p.map(R);

// ---------------------------------------------------------------- places
const nameEls = load('names');
const places = PLACES.map((p) => {
  let x = G.mx(p.lon), y = G.my(p.lat), snapped = false;
  if (p.match) {
    const re = new RegExp(p.match, 'i');
    let best = 1500;
    for (const e of nameEls) {
      const nm = `${e.tags?.name ?? ''}|${e.tags?.['name:en'] ?? ''}`;
      if (!re.test(nm)) continue;
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (lat == null) continue;
      const d = Math.hypot(G.mx(lon) - G.mx(p.lon), G.my(lat) - G.my(p.lat)) - (e.type === 'node' ? 0 : 150);
      if (d < best) { best = d; x = G.mx(lon); y = G.my(lat); snapped = true; }
    }
  }
  return { ...p, x: R(x), y: R(y), snapped };
});
console.log('places snapped to OSM:', places.filter((p) => p.snapped).length, '/', places.length);
const clearZones = places.filter((p) => p.clear).map((p) => [p.x, p.y, p.clear]);

// ---------------------------------------------------------------- areas
const areas = []; // [kind, ...ints]
const waterLines = []; // [width, ...ints]
const pushArea = (kind, p, tol = 2) => {
  if (p.length < 6) return;
  if (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) p = p.slice(0, -2);
  const s = simplify(p.concat(p[0], p[1]), tol, true).slice(0, -2);
  if (s.length >= 6 && Math.abs(area(s)) > 150) areas.push([kind, ...ints(s)]);
};
for (const e of load('water')) {
  const t = e.tags ?? {};
  if (e.type === 'way' && t.waterway && t.waterway !== 'riverbank') {
    const p = pts(e.geometry ?? []);
    if (p.length >= 4) waterLines.push([t.waterway === 'river' ? 34 : 12, ...ints(simplify(p, 3, false))]);
  } else if (e.type === 'way') pushArea(G.A_WATER, pts(e.geometry ?? []));
  else if (e.type === 'relation') {
    for (const r of rings(e.members ?? [], 'outer')) pushArea(G.A_WATER, pts(r));
    for (const r of rings(e.members ?? [], 'inner')) pushArea(G.A_ISLAND, pts(r));
  }
}
const kindOf = (t) => {
  const l = t.leisure, u = t.landuse, n = t.natural;
  if (l === 'park' || l === 'garden' || l === 'golf_course' || u === 'village_green' || u === 'recreation_ground') return G.A_PARK;
  if (l === 'pitch' || l === 'stadium') return G.A_PITCH;
  if (l === 'nature_reserve' || u === 'forest' || n === 'wood') return G.A_FOREST;
  if (u === 'grass' || u === 'meadow' || n === 'grassland' || n === 'heath') return G.A_GRASS;
  if (u === 'farmland' || u === 'orchard') return G.A_FARM;
  if (u === 'residential') return G.A_RES;
  if (u === 'commercial' || u === 'retail') return G.A_COM;
  if (u === 'industrial') return G.A_IND;
  if (u === 'military') return G.A_MIL;
  if (n === 'bare_rock') return G.A_ROCK;
  if (n === 'scrub') return G.A_SCRUB;
  if (u === 'cemetery') return G.A_CEMETERY;
  if (u === 'railway') return G.A_RAILYARD;
  if (u === 'quarry') return G.A_QUARRY;
  return -1;
};
for (const e of load('green')) {
  const k = kindOf(e.tags ?? {});
  if (k < 0) continue;
  const tol = k === G.A_RES || k === G.A_FARM || k === G.A_MIL ? 5 : 2.5;
  if (e.type === 'way') pushArea(k, pts(e.geometry ?? []), tol);
  else for (const r of rings(e.members ?? [], 'outer')) pushArea(k, pts(r), tol);
}
const runways = [];
for (const e of load('aero')) {
  const t = e.tags ?? {};
  if (e.type !== 'way') continue;
  const p = pts(e.geometry ?? []);
  if (t.aeroway === 'runway' && p.length >= 4) runways.push(ints(p));
  else if (t.aeroway === 'apron' || t.aeroway === 'taxiway' && p.length >= 8 && p[0] === p[p.length - 2]) pushArea(G.A_APRON, p);
}
// draw big backgrounds first, small features and water last
const prio = (k) => (k === G.A_WATER ? 9 : k === G.A_ISLAND ? 10 : k === G.A_RES || k === G.A_FARM || k === G.A_MIL ? 0 : k === G.A_COM || k === G.A_IND ? 1 : 2);
areas.sort((a, b) => prio(a[0]) - prio(b[0]));
console.log('areas', areas.length, 'water lines', waterLines.length, 'runways', runways.length);

// ---------------------------------------------------------------- rail + metro
const rail = [];
const stations = [];
for (const e of load('rail')) {
  const t = e.tags ?? {};
  if (e.type === 'way' && t.railway === 'rail' && !t.service) {
    const p = pts(e.geometry ?? []);
    if (p.length >= 4) rail.push(ints(simplify(p, 2, false)));
  } else if (e.type === 'node' && t.name) {
    stations.push({ name: t['name:en'] ?? t.name, x: R(G.mx(e.lon)), y: R(G.my(e.lat)), metro: t.station === 'subway' || t.subway === 'yes' });
  }
}
const LINE_COL = { red: '#d8433b', blue: '#3b78d8', green: '#3aa657' };
const metroByName = new Map();
for (const e of load('metro')) {
  const t = e.tags ?? {};
  const nm = `${t.ref ?? ''} ${t.name ?? ''} ${t.colour ?? ''}`.toLowerCase();
  const key = /red|#?e[0-9a-f]1|miyapur|lb ?nagar/.test(nm) ? 'red' : /blue|nagole|raidurg/.test(nm) ? 'blue' : /green|jbs|mgbs/.test(nm) ? 'green' : null;
  if (!key) continue;
  const ways = (e.members ?? []).filter((m) => m.type === 'way' && m.geometry && !/platform|stop/.test(m.role ?? '')).map((m) => pts(m.geometry));
  const len = ways.reduce((a, w) => a + w.length, 0);
  if (!metroByName.has(key) || metroByName.get(key).len < len) metroByName.set(key, { ways, len });
}
function stitch(ways) {
  // greedy: start from the longest piece, keep appending the nearest unused end
  const segs = ways.filter((w) => w.length >= 4).map((w) => w.slice());
  if (!segs.length) return [];
  segs.sort((a, b) => b.length - a.length);
  let line = segs.shift();
  const end = (l, tail) => (tail ? [l[l.length - 2], l[l.length - 1]] : [l[0], l[1]]);
  const rev = (l) => { const o = []; for (let i = l.length - 2; i >= 0; i -= 2) o.push(l[i], l[i + 1]); return o; };
  for (;;) {
    let best = 60, bi = -1, mode = 0;
    const [hx, hy] = end(line, false), [tx, ty] = end(line, true);
    segs.forEach((s, i) => {
      const [sx, sy] = end(s, false), [ex, ey] = end(s, true);
      const c = [Math.hypot(tx - sx, ty - sy), Math.hypot(tx - ex, ty - ey), Math.hypot(hx - ex, hy - ey), Math.hypot(hx - sx, hy - sy)];
      c.forEach((d, m) => { if (d < best) { best = d; bi = i; mode = m; } });
    });
    if (bi < 0) break;
    const s = segs.splice(bi, 1)[0];
    if (mode === 0) line = line.concat(s); else if (mode === 1) line = line.concat(rev(s));
    else if (mode === 2) line = s.concat(line); else line = rev(s).concat(line);
  }
  return line;
}
const metro = [];
for (const [key, v] of metroByName) {
  const line = simplify(stitch(v.ways), 1.5, false);
  if (line.length < 8) continue;
  const st = stations.filter((s) => s.metro).filter((s) => {
    for (let i = 0; i < line.length; i += 2) if (Math.hypot(line[i] - s.x, line[i + 1] - s.y) < 120) return true;
    return false;
  });
  metro.push({ name: key[0].toUpperCase() + key.slice(1), color: LINE_COL[key], pts: ints(line), stations: st.map((s) => ({ name: s.name.replace(/ metro station$/i, ''), x: s.x, y: s.y })) });
}
console.log('rail ways', rail.length, 'metro lines', metro.map((m) => `${m.name}:${m.pts.length / 2}pts/${m.stations.length}st`).join(' '));

const suburbs = [];
for (const e of load('suburbs')) {
  const t = e.tags ?? {};
  const nm = t['name:en'] ?? t.name;
  if (!nm || !/^[\x20-\x7e]+$/.test(nm)) continue;
  const x = G.mx(e.lon), y = G.my(e.lat);
  if (inCity(x, y)) suburbs.push([nm, R(x), R(y), t.place === 'suburb' || t.place === 'town' || t.place === 'city' ? 1 : 0]);
}

// ---------------------------------------------------------------- tiles
const tiles = new Map(); // index -> { b: [], r: [] }
const tileAt = (x, y) => {
  const tx = Math.max(0, Math.min(G.TX - 1, Math.floor(x / G.TILE))), ty = Math.max(0, Math.min(G.TY - 1, Math.floor(y / G.TILE)));
  const k = ty * G.TX + tx;
  let t = tiles.get(k);
  if (!t) { t = { tx, ty, b: [], r: [] }; tiles.set(k, t); }
  return t;
};
const files = readdirSync(RAW);

// roads: split at junctions and at tile borders
const RC = { motorway: 0, motorway_link: 0, trunk: 1, trunk_link: 1, primary: 2, primary_link: 2, secondary: 3, secondary_link: 3, tertiary: 4, tertiary_link: 4, residential: 5, unclassified: 5, living_street: 5, road: 5, service: 6 };
const seenWay = new Set();
const ways = [];
const nodeUse = new Map();
for (const f of files.filter((n) => n.startsWith('roads_'))) {
  for (const e of load(f.replace('.json', ''))) {
    if (seenWay.has(e.id) || !e.geometry || !e.nodes) continue;
    const t = e.tags ?? {};
    const cls = RC[t.highway];
    if (cls === undefined || t.area === 'yes' || (cls === 6 && /driveway|parking_aisle|drive-through/.test(t.service ?? ''))) continue;
    seenWay.add(e.id);
    ways.push({ res: /^(residential|living_street)$/.test(t.highway), cls, flags: (t.oneway === 'yes' || t.junction === 'roundabout' ? 1 : 0) | (t.bridge && t.bridge !== 'no' ? 2 : 0) | (t.tunnel && t.tunnel !== 'no' ? 4 : 0), nodes: e.nodes, p: pts(e.geometry) });
    for (const n of e.nodes) nodeUse.set(n, (nodeUse.get(n) ?? 0) + 1);
  }
}
const major = [];
let roadPieces = 0;
for (const w of ways) {
  if (w.cls <= 4) major.push([w.cls, ...ints(simplify(w.p, 4, false))]);
  // split at junction nodes
  let start = 0;
  const n = w.nodes.length;
  for (let i = 1; i < n; i++) {
    if (i < n - 1 && nodeUse.get(w.nodes[i]) < 2) continue;
    const piece = w.p.slice(start * 2, i * 2 + 2);
    start = i;
    // clip to tiles: walk segments, cut wherever a tile line is crossed
    let cur = [piece[0], piece[1]];
    const flush = () => {
      if (cur.length >= 4) {
        const mxp = (cur[0] + cur[2]) / 2, myp = (cur[1] + cur[3]) / 2;
        if (inCity(mxp, myp)) { tileAt(mxp, myp).r.push({ cls: w.cls, flags: w.flags, p: cur, res: w.res }); roadPieces++; }
      }
    };
    for (let k = 2; k < piece.length; k += 2) {
      const ax = piece[k - 2], ay = piece[k - 1], bx = piece[k], by = piece[k + 1];
      const cuts = [];
      for (let gx = Math.floor(Math.min(ax, bx) / G.TILE) + 1; gx * G.TILE < Math.max(ax, bx); gx++) cuts.push((gx * G.TILE - ax) / (bx - ax));
      for (let gy = Math.floor(Math.min(ay, by) / G.TILE) + 1; gy * G.TILE < Math.max(ay, by); gy++) cuts.push((gy * G.TILE - ay) / (by - ay));
      cuts.sort((a, b) => a - b);
      for (const t of cuts) {
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
        cur.push(cx, cy);
        flush();
        cur = [cx, cy];
      }
      cur.push(bx, by);
    }
    flush();
  }
}
console.log('road ways', ways.length, 'pieces', roadPieces, 'major', major.length);

// buildings
const TECH = [[G.mx(78.381), G.my(17.447), 2800], [G.mx(78.343), G.my(17.416), 2600], [G.mx(78.365), G.my(17.432), 2200], [G.mx(78.39), G.my(17.44), 1500]];
const BK = { house: 1, residential: 1, detached: 1, semidetached_house: 1, terrace: 1, bungalow: 1, hut: 1, apartments: 2, dormitory: 2, hotel: 3, commercial: 3, retail: 3, office: 3, supermarket: 3, mall: 3, industrial: 4, warehouse: 4, factory: 4, temple: 5, mosque: 5, church: 5, religious: 5, cathedral: 5, shrine: 5, school: 6, college: 6, university: 6, hospital: 6, public: 6, civic: 6, government: 6, train_station: 6, roof: 7, shed: 7, garage: 7, garages: 7, carport: 7, hangar: 4 };
const gridCov = new Float32Array(G.GW * G.GH);
const gridH = new Float32Array(G.GW * G.GH);
const seenB = new Set();
let nB = 0, tagged = 0;
for (const f of files.filter((n) => n.startsWith('bld_'))) {
  for (const e of load(f.replace('.json', ''))) {
    if (seenB.has(e.id) || !e.geometry) continue;
    seenB.add(e.id);
    let p = pts(e.geometry);
    if (p.length < 8) continue;
    p = p.slice(0, -2);
    let a = area(p);
    if (a < 0) { const q = []; for (let i = p.length - 2; i >= 0; i -= 2) q.push(p[i], p[i + 1]); p = q; a = -a; }
    if (a < 7) continue;
    p = simplify(p.concat(p[0], p[1]), 0.35, true).slice(0, -2);
    if (p.length < 6) continue;
    if (p.length > 2 * 250) p = simplify(p.concat(p[0], p[1]), 2, true).slice(0, -2);
    let cx = 0, cy = 0, maxY = -1e9;
    for (let i = 0; i < p.length; i += 2) { cx += p[i]; cy += p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1]; }
    cx /= p.length / 2; cy /= p.length / 2;
    if (!inCity(cx, cy)) continue;
    if (clearZones.some(([zx, zy, zr]) => Math.hypot(cx - zx, cy - zy) < zr)) continue;
    const t = e.tags ?? {};
    let kind = BK[t.building] ?? (t.amenity === 'place_of_worship' ? 5 : t.amenity ? 6 : t.shop || t.office ? 3 : 0);
    const h1 = hash(e.id), h2 = hash(e.id ^ 0x5bd1e995);
    let h = parseFloat(t.height);
    if (h > 0) tagged++;
    else if (parseFloat(t['building:levels']) > 0) { h = parseFloat(t['building:levels']) * 3.2 + 1; tagged++; }
    else {
      const tech = TECH.some(([zx, zy, zr]) => Math.hypot(cx - zx, cy - zy) < zr);
      if (kind === 7) h = 3 + h1 * 2;
      else if (a < 110) h = 3.5 + h1 * 6;
      else if (a < 380) h = 6 + h1 * 9 + (h2 < 0.12 ? 8 : 0);
      else if (a < 1500) h = 8 + h1 * 12 + (h2 < 0.15 ? 14 : 0);
      else h = kind === 4 ? 8 + h1 * 5 : 9 + h1 * 12;
      if (tech && a > 320 && kind !== 4 && kind !== 7) { h = 22 + h1 * h1 * 95; if (kind === 0 || kind === 3) kind = 8; }
      else if (kind === 3) h += 6;
    }
    if (kind === 0) kind = a < 140 ? 1 : h > 13 ? 2 : 0;
    if (kind === 3 && h > 30) kind = 8;
    h = Math.max(3, Math.min(250, h));
    tileAt(p[0], maxY).b.push({ maxY, h: Math.round(h), kind, p, area: a });
    const gi = Math.floor(cy / G.CELL) * G.GW + Math.floor(cx / G.CELL);
    gridCov[gi] += a; gridH[gi] += a * h;
    nB++;
  }
}
console.log('buildings', nB, 'with real height tags', tagged);

// ---------------------------------------------------------------- infill
// OpenStreetMap has not mapped every building in Hyderabad. Where a settled
// area has streets but no footprints, generate simple lots along the real
// streets so the city does not look abandoned. These are flagged (kind + 64)
// and counted separately; they never overlap a mapped building, road, water
// body, park or railway.
const AB = 1024;
const areaIdx = new Map();
areas.forEach((a, i) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 1; k < a.length; k += 2) { x0 = Math.min(x0, a[k]); x1 = Math.max(x1, a[k]); y0 = Math.min(y0, a[k + 1]); y1 = Math.max(y1, a[k + 1]); }
  a.bb = [x0, y0, x1, y1];
  for (let by = Math.floor(y0 / AB); by <= Math.floor(y1 / AB); by++) for (let bx = Math.floor(x0 / AB); bx <= Math.floor(x1 / AB); bx++) {
    const k = by * 1000 + bx; if (!areaIdx.has(k)) areaIdx.set(k, []); areaIdx.get(k).push(i);
  }
});
const NOBUILD = new Set([G.A_WATER, G.A_PARK, G.A_FOREST, G.A_GRASS, G.A_FARM, G.A_MIL, G.A_ROCK, G.A_SCRUB, G.A_PITCH, G.A_APRON, G.A_CEMETERY, G.A_RAILYARD, G.A_QUARRY, G.A_IND]);
function blocked(x, y) {
  const l = areaIdx.get(Math.floor(y / AB) * 1000 + Math.floor(x / AB));
  if (!l) return false;
  for (let n = l.length - 1; n >= 0; n--) {
    const a = areas[l[n]];
    if (x < a.bb[0] || x > a.bb[2] || y < a.bb[1] || y > a.bb[3]) continue;
    let inside = false;
    for (let i = 1, j = a.length - 2; i < a.length; j = i, i += 2) {
      if ((a[i + 1] > y) !== (a[j + 1] > y) && x < ((a[j] - a[i]) * (y - a[i + 1])) / (a[j + 1] - a[i + 1]) + a[i]) inside = !inside;
    }
    if (inside) return a[0] === G.A_ISLAND ? false : NOBUILD.has(a[0]);
  }
  return false;
}
const CS = 2, MARGIN = 40, ON = Math.ceil((G.TILE + MARGIN * 2) / CS);
const occ = new Uint8Array(ON * ON);
const centre = [G.mx(78.474), G.my(17.4)];
let infill = 0, tileSeq = 0;
const railAll = rail.concat(metro.map((m) => m.pts));
for (const t of [...tiles.values()].sort((a, b) => a.ty - b.ty || a.tx - b.tx)) {
  const ox = t.tx * G.TILE - MARGIN, oy = t.ty * G.TILE - MARGIN;
  const real = t.b.length;
  const cdist = Math.hypot((t.tx + 0.5) * G.TILE - centre[0], (t.ty + 0.5) * G.TILE - centre[1]);
  let resLen = 0;
  for (const r of t.r) if (r.res) for (let i = 2; i < r.p.length; i += 2) resLen += Math.hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1]);
  // only where there is evidence of a settled neighbourhood
  if (resLen < 900 || (real < 120 && cdist > 13000)) continue;
  occ.fill(0);
  const mark = (x, y, r) => {
    const cx = (x - ox) / CS, cy = (y - oy) / CS, rr = r / CS;
    for (let j = Math.max(0, Math.floor(cy - rr)); j <= Math.min(ON - 1, Math.ceil(cy + rr)); j++)
      for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(ON - 1, Math.ceil(cx + rr)); i++) occ[j * ON + i] = 1;
  };
  const markLine = (p, r) => {
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
      if (Math.max(ax, bx) < ox || Math.min(ax, bx) > ox + ON * CS || Math.max(ay, by) < oy || Math.min(ay, by) > oy + ON * CS) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
      for (let k = 0; k <= n; k++) mark(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, r);
    }
  };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nt = tiles.get((t.ty + dy) * G.TX + t.tx + dx);
    if (!nt || t.tx + dx < 0 || t.tx + dx >= G.TX) continue;
    for (const b of nt.b) {
      const p = b.p;
      if (b.maxY < oy - 60) continue;
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        const n = Math.max(1, Math.ceil(Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]) / 2));
        for (let k = 0; k < n; k++) mark(p[i] + ((p[j] - p[i]) * k) / n, p[i + 1] + ((p[j + 1] - p[i + 1]) * k) / n, 2.5);
      }
      let cx = 0, cy = 0;
      for (let i = 0; i < p.length; i += 2) { cx += p[i]; cy += p[i + 1]; }
      mark(cx / (p.length / 2), cy / (p.length / 2), Math.min(14, Math.sqrt(b.area ?? 60) / 2));
    }
    for (const r of nt.r) markLine(r.p, G.ROAD_W[r.cls] / 2 + 2);
  }
  for (const r of railAll) markLine(r, 8);
  for (const z of clearZones) if (Math.abs(z[0] - ox - 552) < 700 + z[2] && Math.abs(z[1] - oy - 552) < 700 + z[2]) for (let a = 0; a < 6.3; a += 0.05) for (let rr = 0; rr <= z[2]; rr += 3) mark(z[0] + Math.cos(a) * rr, z[1] + Math.sin(a) * rr, 2);
  const free = (cx, cy, ux, uy, w, d) => {
    for (let a = -w / 2 - 1; a <= w / 2 + 1; a += 1.6) for (let b = -d / 2 - 1; b <= d / 2 + 1; b += 1.6) {
      const x = cx + ux * a - uy * b, y = cy + uy * a + ux * b;
      const i = Math.floor((x - ox) / CS), j = Math.floor((y - oy) / CS);
      if (i < 0 || j < 0 || i >= ON || j >= ON || occ[j * ON + i]) return false;
    }
    return true;
  };
  const dense = resLen > 5000 || real > 900;
  t.r.forEach((r, ri) => {
    if (r.flags & 6 || r.cls === 6 || r.cls < 2) return;
    if (!r.res && resLen < (r.cls === 5 ? 1500 : 2500)) return;
    const p = r.p;
    let acc = 3, seq = 0;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], sl = Math.hypot(p[i] - ax, p[i + 1] - ay);
      if (sl < 0.5) continue;
      const ux = (p[i] - ax) / sl, uy = (p[i + 1] - ay) / sl;
      while (acc < sl - 3) {
        const hsh = hash(tileSeq * 7919 + ri * 131 + seq++);
        const w = 6 + hsh * 8, d = 7 + hash(seq * 31 + ri) * 6;
        const mxp = ax + ux * (acc + w / 2), myp = ay + uy * (acc + w / 2);
        acc += w + 1.2 + (hsh < 0.12 ? 6 : 0);
        for (const side of [-1, 1]) for (let row = 0; row < (dense ? 2 : 1); row++) {
          if (hash(seq * 17 + side * 5 + row) < (dense ? 0.06 : 0.3)) continue;
          const off = side * (G.ROAD_W[r.cls] / 2 + 3 + d / 2 + row * (d + 2));
          const cx = mxp - uy * off, cy = myp + ux * off;
          if (!inCity(cx, cy) || !free(cx, cy, ux, uy, w, d) || blocked(cx, cy)) continue;
          const q = [];
          for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) q.push(cx + ux * a - uy * b, cy + uy * a + ux * b);
          let pp = q;
          if (area(pp) < 0) pp = [q[6], q[7], q[4], q[5], q[2], q[3], q[0], q[1]];
          for (let a = -w / 2; a <= w / 2; a += 1.5) for (let b = -d / 2; b <= d / 2; b += 1.5) mark(cx + ux * a - uy * b, cy + uy * a + ux * b, 1.6);
          const hh = hash(seq * 53 + row + side);
          const h = r.cls <= 4 ? 7 + hh * 11 : 3.5 + hh * (dense ? 9 : 6);
          let maxY = -1e9;
          for (let k = 1; k < 8; k += 2) maxY = Math.max(maxY, pp[k]);
          tileAt(pp[0], maxY).b.push({ maxY, h: Math.round(h), kind: (r.cls <= 4 ? (hh < 0.4 ? 3 : 2) : h > 9 ? 2 : 1) + 64, p: pp });
          const gi = Math.floor(cy / G.CELL) * G.GW + Math.floor(cx / G.CELL);
          gridCov[gi] += w * d; gridH[gi] += w * d * h;
          infill++;
        }
      }
      acc -= sl;
      if (acc < 0) acc = 0;
    }
  });
  tileSeq++;
}
console.log('generated infill buildings', infill);

// write tiles
const index = [];
let bytes = 0;
for (const t of tiles.values()) {
  t.b.sort((a, b) => a.maxY - b.maxY);
  let size = 8;
  for (const b of t.b) size += 3 + b.p.length * 2;
  for (const r of t.r) size += 4 + r.p.length * 2;
  const buf = Buffer.alloc(size);
  let o = 0;
  buf.writeUInt32LE(t.b.length, o); o += 4;
  buf.writeUInt32LE(t.r.length, o); o += 4;
  const ox = t.tx * G.TILE, oy = t.ty * G.TILE;
  const w16 = (v) => { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * G.Q))), o); o += 2; };
  for (const b of t.b) {
    buf.writeUInt8(b.p.length / 2, o++); buf.writeUInt8(b.h, o++); buf.writeUInt8(b.kind, o++);
    for (let i = 0; i < b.p.length; i += 2) { w16(b.p[i] - ox); w16(b.p[i + 1] - oy); }
  }
  for (const r of t.r) {
    buf.writeUInt8(r.cls, o++); buf.writeUInt8(r.flags, o++); buf.writeUInt16LE(r.p.length / 2, o); o += 2;
    for (let i = 0; i < r.p.length; i += 2) { w16(r.p[i] - ox); w16(r.p[i + 1] - oy); }
  }
  writeFileSync(`${OUT}t/${t.tx}_${t.ty}.bin`, buf);
  bytes += size;
  index.push(t.tx, t.ty, t.b.length);
}
console.log('tiles', tiles.size, 'total', (bytes / 1e6).toFixed(1), 'MB');

// coarse grid: (height, coverage) per cell, zero runs RLE
const cellA = G.CELL * G.CELL;
const out = [];
let zeros = 0;
const flushZ = () => { while (zeros > 0) { const n = Math.min(255, zeros); out.push(0, n); zeros -= n; } };
for (let i = 0; i < gridCov.length; i++) {
  const cov = gridCov[i] / cellA;
  if (cov < 0.06) { zeros++; continue; }
  flushZ();
  out.push(Math.max(1, Math.min(255, Math.round(gridH[i] / gridCov[i]))), Math.max(1, Math.min(255, Math.round(Math.min(1, cov) * 255))));
}
flushZ();
writeFileSync(OUT + 'grid.bin', Buffer.from(out));
console.log('grid.bin', (out.length / 1e6).toFixed(2), 'MB');

const city = {
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors',
  buildings: nB,
  infill,
  places: places.map(({ lat, lon, match, snapped, ...p }) => p),
  areas, waterLines, runways, rail, metro, major, suburbs, tiles: index,
};
const json = JSON.stringify(city);
writeFileSync(OUT + 'city.json', json);
console.log('city.json', (json.length / 1e6).toFixed(2), 'MB');
