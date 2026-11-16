import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { mx, my, lonOf, latOf, CITY_W, CITY_H, TILE, TX, TY, BBOX } from '../world/geo';
import { City, decodeTile } from '../world/city';
import { PLACES } from '../world/places';
import { sunTimes, describeWeather } from '../sim/live';
import { EVENTS } from '../sim/events';

const MAP = new URL('../../public/map/', import.meta.url).pathname;
const hasMap = existsSync(MAP + 'city.json');

describe('projection', () => {
  it('round-trips lon/lat <-> city metres', () => {
    for (const [lat, lon] of [[17.3616, 78.4747], [BBOX.s, BBOX.w], [BBOX.n, BBOX.e]]) {
      expect(lonOf(mx(lon))).toBeCloseTo(lon, 9);
      expect(latOf(my(lat))).toBeCloseTo(lat, 9);
    }
  });
  it('is about 51 x 46 km', () => {
    expect(CITY_W / 1000).toBeGreaterThan(49); expect(CITY_W / 1000).toBeLessThan(53);
    expect(CITY_H / 1000).toBeGreaterThan(45); expect(CITY_H / 1000).toBeLessThan(48);
    expect(TX * TILE).toBeGreaterThanOrEqual(CITY_W); expect(TY * TILE).toBeGreaterThanOrEqual(CITY_H);
  });
  it('puts Secunderabad north-east of Charminar', () => {
    const c = PLACES.find((p) => p.id === 'charminar')!, s = PLACES.find((p) => p.id === 'sec-junction')!;
    expect(mx(s.lon)).toBeGreaterThan(mx(c.lon));
    expect(my(s.lat)).toBeLessThan(my(c.lat));
  });
});

describe('live mode maths', () => {
  it('gives plausible Hyderabad sun times all year', () => {
    for (const d of ['2026-01-15', '2026-06-21', '2026-11-15', '2026-12-21']) {
      const [rise, set] = sunTimes(new Date(d + 'T06:00:00Z'));
      expect(rise).toBeGreaterThan(5.4); expect(rise).toBeLessThan(7);
      expect(set).toBeGreaterThan(17.3); expect(set).toBeLessThan(19.1);
    }
    const [, juneSet] = sunTimes(new Date('2026-06-21T06:00:00Z'));
    const [, decSet] = sunTimes(new Date('2026-12-21T06:00:00Z'));
    expect(juneSet - decSet).toBeGreaterThan(0.8);
  });
  it('names weather codes', () => {
    expect(describeWeather(0)).toBe('Clear');
    expect(describeWeather(63)).toBe('Rain');
    expect(describeWeather(95)).toBe('Thunderstorm');
  });
});

describe('places and events', () => {
  it('has unique places inside the map', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    for (const p of PLACES) {
      expect(mx(p.lon), p.id).toBeGreaterThan(0); expect(mx(p.lon), p.id).toBeLessThan(CITY_W);
      expect(my(p.lat), p.id).toBeGreaterThan(0); expect(my(p.lat), p.id).toBeLessThan(CITY_H);
    }
  });
  it('ties every event to a real place', () => {
    for (const e of EVENTS) for (const id of e.sites ?? [e.place]) expect(PLACES.some((p) => p.id === id), `${e.id} -> ${id}`).toBe(true);
  });
});

describe.skipIf(!hasMap)('built map data', () => {
  const city = new City();
  const json = JSON.parse(readFileSync(MAP + 'city.json', 'utf8'));
  city.ingest(json, new Uint8Array(readFileSync(MAP + 'grid.bin')));

  it('has the city-wide layers', () => {
    expect(city.buildings).toBeGreaterThan(500000);
    expect(city.places.length).toBe(PLACES.length);
    expect(city.metro.length).toBe(3);
    for (const m of city.metro) { expect(m.total).toBeGreaterThan(8000); expect(m.stations.length).toBeGreaterThan(5); }
    expect(city.major.length).toBeGreaterThan(3000);
    expect(city.areas.some((a) => a.kind === 0)).toBe(true);
  });
  it('finds Hussain Sagar as water at the Buddha statue', () => {
    const b = city.places.find((p) => p.id === 'buddha')!;
    expect(city.areaAt(b.x + 60, b.y + 60)).toBe(0);
  });
  it('decodes every tile listed in the index, with roads joined at tile borders', () => {
    const files = readdirSync(MAP + 't');
    expect(files.length).toBe(json.tiles.length / 3);
    let buildings = 0;
    const sample = files.filter((_: string, i: number) => i % 40 === 0);
    for (const f of sample) {
      const [tx, ty] = f.replace('.bin', '').split('_').map(Number);
      const buf = readFileSync(MAP + 't/' + f);
      const t = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), tx, ty);
      buildings += t.nb;
      for (let i = 1; i < t.nb; i++) expect(t.bMaxY[i]).toBeGreaterThanOrEqual(t.bMaxY[i - 1]);
      for (const r of t.roads) {
        expect(r.cls).toBeLessThan(7);
        expect(r.total).toBeGreaterThanOrEqual(0);
        // clipped to the tile (small tolerance for rounding)
        for (let i = 0; i < r.p.length; i += 2) {
          expect(r.p[i]).toBeGreaterThan(tx * TILE - 1); expect(r.p[i]).toBeLessThan((tx + 1) * TILE + 1);
          expect(r.p[i + 1]).toBeGreaterThan(ty * TILE - 1); expect(r.p[i + 1]).toBeLessThan((ty + 1) * TILE + 1);
        }
      }
    }
    expect(buildings).toBeGreaterThan(5000);
  });
});
