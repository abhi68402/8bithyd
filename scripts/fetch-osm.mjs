// Extracts greater Hyderabad from the Geofabrik "southern-zone" OpenStreetMap
// extract into data-raw/*.json (not committed), in the element format that
// build-map.mjs reads. No dependencies: a minimal .osm.pbf reader lives here.
//
//   curl -L -o data-raw/southern-zone.osm.pbf https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf
//   node scripts/fetch-osm.mjs
import { openSync, readSync, writeFileSync, fstatSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { BBOX } from '../src/world/geo.ts';
import { PLACES } from '../src/world/places.ts';

const RAW = new URL('../data-raw/', import.meta.url).pathname;
mkdirSync(RAW, { recursive: true });
const PAD = 0.02;
const S = BBOX.s - PAD, N = BBOX.n + PAD, W = BBOX.w - PAD, E = BBOX.e + PAD;

// ---- protobuf primitives
class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.b = buf; this.p = pos; this.e = end; }
  varint() {
    let r = 0, m = 1, b;
    do { b = this.b[this.p++]; r += (b & 0x7f) * m; m *= 128; } while (b & 0x80);
    return r;
  }
  sint() { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  /** Calls fn(field, wireType) for each field; fn must consume the value. */
  each(fn) {
    while (this.p < this.e) {
      const key = this.varint();
      const f = Math.floor(key / 8), wt = key & 7;
      if (fn(f, wt) === false) this.skip(wt);
    }
  }
  skip(wt) {
    if (wt === 0) this.varint();
    else if (wt === 2) { const l = this.varint(); this.p += l; }
    else if (wt === 5) this.p += 4;
    else if (wt === 1) this.p += 8;
  }
  sub() { const l = this.varint(); const r = new Reader(this.b, this.p, this.p + l); this.p += l; return r; }
  bytes() { const l = this.varint(); const s = this.b.subarray(this.p, this.p + l); this.p += l; return s; }
  packed(signed) { const r = this.sub(); const o = []; while (r.p < r.e) o.push(signed ? r.sint() : r.varint()); return o; }
}

// ---- node store (ids arrive sorted, so binary search works)
let cap = 1 << 22, nNodes = 0;
let nid = new Float64Array(cap), nlat = new Float64Array(cap), nlon = new Float64Array(cap);
function addNode(id, lat, lon) {
  if (nNodes === cap) {
    cap *= 2;
    const a = new Float64Array(cap), b = new Float64Array(cap), c = new Float64Array(cap);
    a.set(nid); b.set(nlat); c.set(nlon);
    nid = a; nlat = b; nlon = c;
  }
  nid[nNodes] = id; nlat[nNodes] = lat; nlon[nNodes] = lon; nNodes++;
}
let sorted = true;
function findNode(id) {
  let lo = 0, hi = nNodes - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (nid[m] < id) lo = m + 1; else if (nid[m] > id) hi = m - 1; else return m;
  }
  return -1;
}

// ---- outputs
const out = { bld: [], roads: [], water: [], green: [], rail: [], metro: [], aero: [], names: [], suburbs: [] };
const parts = { bld: 0, roads: 0 };
const flush = (name, force) => {
  const list = out[name];
  if (name in parts) {
    if (list.length >= 60000 || (force && list.length)) {
      writeFileSync(`${RAW}${name}_p${parts[name]++}.json`, JSON.stringify({ elements: list }));
      out[name] = [];
    }
  } else if (force) writeFileSync(`${RAW}${name}.json`, JSON.stringify({ elements: list }));
};
const NAME_RE = new RegExp(PLACES.filter((p) => p.match).map((p) => p.match).join('|'), 'i');
const NO_ROAD = /^(footway|path|steps|cycleway|pedestrian|track|construction|proposed|corridor|platform|elevator|bridleway)$/;
const LEISURE = /^(park|garden|pitch|golf_course|stadium|nature_reserve)$/;
const LANDUSE = /^(forest|grass|meadow|farmland|orchard|recreation_ground|cemetery|village_green|military|industrial|commercial|retail|residential|quarry|railway|reservoir|basin)$/;
const NATURAL = /^(wood|scrub|grassland|bare_rock|heath|water)$/;
const wayGeom = new Map(); // id -> geometry, for relation members

function handleNode(id, lat, lon, tags) {
  if (tags.place && /^(suburb|neighbourhood|quarter|town|village|city)$/.test(tags.place)) out.suburbs.push({ type: 'node', id, lat, lon, tags });
  if (tags.railway === 'station' || tags.railway === 'halt' || tags.station === 'subway') out.rail.push({ type: 'node', id, lat, lon, tags });
  if (tags.aeroway === 'aerodrome') out.aero.push({ type: 'node', id, lat, lon, tags });
  const nm = `${tags.name ?? ''}|${tags['name:en'] ?? ''}`;
  if (nm.length > 1 && NAME_RE.test(nm)) out.names.push({ type: 'node', id, lat, lon, tags });
}

function handleWay(id, tags, refs) {
  const geometry = [];
  let inside = false;
  for (const r of refs) {
    const i = findNode(r);
    if (i < 0) { geometry.push(null); continue; }
    const lat = nlat[i], lon = nlon[i];
    geometry.push({ lat, lon });
    if (lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e) inside = true;
  }
  if (!inside) return;
  const el = { type: 'way', id, tags, nodes: refs, geometry };
  const g = geometry.filter(Boolean);
  if (tags.building) { el.geometry = g; delete el.nodes; out.bld.push(el); flush('bld'); }
  else if (tags.highway) { if (!NO_ROAD.test(tags.highway) && g.length === geometry.length) { out.roads.push(el); flush('roads'); } }
  else if (tags.railway && /^(rail|subway|light_rail)$/.test(tags.railway)) { out.rail.push({ ...el, geometry: g }); wayGeom.set(id, g); }
  else if (tags.aeroway) out.aero.push({ ...el, geometry: g });
  else if (tags.natural === 'water' || (tags.waterway && /^(river|canal|riverbank)$/.test(tags.waterway)) || (tags.landuse && /^(reservoir|basin)$/.test(tags.landuse))) { out.water.push({ ...el, geometry: g }); wayGeom.set(id, g); }
  else if ((tags.leisure && LEISURE.test(tags.leisure)) || (tags.landuse && LANDUSE.test(tags.landuse)) || (tags.natural && NATURAL.test(tags.natural))) { out.green.push({ ...el, geometry: g }); wayGeom.set(id, g); }
  else if (!tags.highway && !tags.building && !tags.barrier && !tags.power) wayGeom.set(id, g); // possible multipolygon member
  const nm = `${tags.name ?? ''}|${tags['name:en'] ?? ''}`;
  if (nm.length > 1 && NAME_RE.test(nm) && g.length) {
    let la = 0, lo = 0;
    for (const p of g) { la += p.lat; lo += p.lon; }
    out.names.push({ type: 'way', id, tags, center: { lat: la / g.length, lon: lo / g.length } });
  }
}

function handleRelation(id, tags, members) {
  const isMetro = tags.type === 'route' && /^(subway|light_rail)$/.test(tags.route ?? '');
  const isArea = tags.type === 'multipolygon' && (tags.natural === 'water' || (tags.leisure && LEISURE.test(tags.leisure)) || (tags.landuse && LANDUSE.test(tags.landuse)) || tags.natural === 'wood');
  if (!isMetro && !isArea) return;
  const ms = [];
  for (const m of members) {
    if (m.type !== 'way') continue;
    const g = wayGeom.get(m.ref);
    if (g && g.length > 1) ms.push({ type: 'way', ref: m.ref, role: m.role, geometry: g });
  }
  if (!ms.length) return;
  const el = { type: 'relation', id, tags, members: ms };
  if (isMetro) out.metro.push(el);
  else if (tags.natural === 'water' || /^(reservoir|basin)$/.test(tags.landuse ?? '')) out.water.push(el);
  else out.green.push(el);
}

// ---- block decoding
const dec = new TextDecoder();
function primitiveBlock(buf) {
  const r = new Reader(buf);
  const strings = [];
  const groups = [];
  let gran = 100, latOff = 0, lonOff = 0;
  r.each((f, wt) => {
    if (f === 1 && wt === 2) { const st = r.sub(); st.each((ff) => { if (ff === 1) strings.push(dec.decode(st.bytes())); else return false; }); }
    else if (f === 2 && wt === 2) groups.push(r.sub());
    else if (f === 17) gran = r.varint();
    else if (f === 19) latOff = r.varint();
    else if (f === 20) lonOff = r.varint();
    else return false;
  });
  const tagsOf = (keys, vals) => { const t = {}; for (let i = 0; i < keys.length; i++) t[strings[keys[i]]] = strings[vals[i]]; return t; };
  for (const g of groups) {
    g.each((f, wt) => {
      if (f === 2 && wt === 2) { // dense nodes
        const d = g.sub();
        let ids = [], lats = [], lons = [], kv = [];
        d.each((ff) => {
          if (ff === 1) ids = d.packed(true); else if (ff === 8) lats = d.packed(true); else if (ff === 9) lons = d.packed(true); else if (ff === 10) kv = d.packed(false); else return false;
        });
        let id = 0, la = 0, lo = 0, k = 0;
        for (let i = 0; i < ids.length; i++) {
          id += ids[i]; la += lats[i]; lo += lons[i];
          const lat = 1e-9 * (latOff + gran * la), lon = 1e-9 * (lonOff + gran * lo);
          const keep = lat >= S && lat <= N && lon >= W && lon <= E;
          let tags = null;
          if (kv.length) {
            while (kv[k] !== 0 && k < kv.length) { if (keep) (tags ??= {})[strings[kv[k]]] = strings[kv[k + 1]]; k += 2; }
            k++;
          }
          if (!keep) continue;
          if (nNodes && id < nid[nNodes - 1]) sorted = false;
          addNode(id, lat, lon);
          if (tags && lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e) handleNode(id, lat, lon, tags);
        }
      } else if (f === 3 && wt === 2) { // way
        const w = g.sub();
        let id = 0, keys = [], vals = [], refs = [];
        w.each((ff) => {
          if (ff === 1) id = w.varint(); else if (ff === 2) keys = w.packed(false); else if (ff === 3) vals = w.packed(false); else if (ff === 8) refs = w.packed(true); else return false;
        });
        let ref = 0;
        for (let i = 0; i < refs.length; i++) { ref += refs[i]; refs[i] = ref; }
        // quick reject: first node must be near the city
        if (refs.length && (findNode(refs[0]) >= 0 || findNode(refs[refs.length - 1]) >= 0 || findNode(refs[refs.length >> 1]) >= 0)) handleWay(id, tagsOf(keys, vals), refs);
      } else if (f === 4 && wt === 2) { // relation
        const rel = g.sub();
        let id = 0, keys = [], vals = [], roles = [], mem = [], types = [];
        rel.each((ff) => {
          if (ff === 1) id = rel.varint(); else if (ff === 2) keys = rel.packed(false); else if (ff === 3) vals = rel.packed(false);
          else if (ff === 8) roles = rel.packed(false); else if (ff === 9) mem = rel.packed(true); else if (ff === 10) types = rel.packed(false); else return false;
        });
        const tags = tagsOf(keys, vals);
        if (tags.type !== 'route' && tags.type !== 'multipolygon') return;
        let m = 0;
        const members = mem.map((d, i) => { m += d; return { type: ['node', 'way', 'relation'][types[i]], ref: m, role: strings[roles[i]] }; });
        handleRelation(id, tags, members);
      } else return false;
    });
  }
}

const fd = openSync(`${RAW}southern-zone.osm.pbf`, 'r');
const size = fstatSync(fd).size;
let pos = 0, blocks = 0;
const head = Buffer.alloc(4);
const t0 = Date.now();
while (pos < size) {
  readSync(fd, head, 0, 4, pos); pos += 4;
  const hl = head.readUInt32BE(0);
  const hb = Buffer.alloc(hl);
  readSync(fd, hb, 0, hl, pos); pos += hl;
  let type = '', dsize = 0;
  const hr = new Reader(hb);
  hr.each((f) => { if (f === 1) type = dec.decode(hr.bytes()); else if (f === 3) dsize = hr.varint(); else return false; });
  const blob = Buffer.alloc(dsize);
  readSync(fd, blob, 0, dsize, pos); pos += dsize;
  if (type !== 'OSMData') continue;
  let raw = null;
  const br = new Reader(blob);
  br.each((f) => { if (f === 1) raw = br.bytes(); else if (f === 3) raw = inflateSync(br.bytes()); else return false; });
  if (raw) primitiveBlock(raw);
  if (++blocks % 400 === 0) console.log(`${((pos / size) * 100).toFixed(0)}%  nodes kept ${nNodes}  buildings ${parts.bld * 60000 + out.bld.length}  roads ${parts.roads * 60000 + out.roads.length}  ${((Date.now() - t0) / 1000) | 0}s`);
}
for (const k of Object.keys(out)) flush(k, true);
console.log(`DONE in ${((Date.now() - t0) / 1000) | 0}s  nodes ${nNodes} sorted=${sorted}  buildings ${(parts.bld - 1) * 60000}+  roads ${(parts.roads - 1) * 60000}+`);
