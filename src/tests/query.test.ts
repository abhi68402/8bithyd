import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { City, decodeTile } from '../world/city';
import { TILE, TX } from '../world/geo';
import { tileInfo, pickBuilding, describeBuilding, areaReport, Z_RES } from '../world/query';

const MAP = 'public/map/';
const hasMap = existsSync(MAP + 'city.json');

describe.skipIf(!hasMap)('city queries', () => {
  const city = new City();
  city.ingest(JSON.parse(readFileSync(MAP + 'city.json', 'utf8')), new Uint8Array(readFileSync(MAP + 'grid.bin')));
  const cm = city.places.find((p) => p.id === 'charminar')!;
  const tx = Math.floor(cm.x / TILE), ty = Math.floor(cm.y / TILE);
  const buf = readFileSync(`${MAP}t/${tx}_${ty}.bin`);
  const tile = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), tx, ty);
  // make the tile visible to peek() the way a loaded tile would be
  (city as unknown as { tiles: Map<number, unknown> }).tiles.set(ty * TX + tx, tile);

  it('gives every building a zone, an area and occupants', () => {
    const info = tileInfo(city, tile);
    expect(info.zone.length).toBe(tile.nb);
    let people = 0;
    for (let i = 0; i < tile.nb; i++) { expect(info.zone[i]).toBeLessThan(4); expect(info.area[i]).toBeGreaterThan(0); people += info.people[i]; }
    expect(people).toBeGreaterThan(1000);
    expect(tileInfo(city, tile)).toBe(info); // cached
  });

  it('picks a building by its roof and by its base', () => {
    const i = Math.floor(tile.nb / 2), off = tile.bOff[i], n = tile.bN[i], h = tile.bH[i];
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) { x += tile.verts[off + k * 2]; y += tile.verts[off + k * 2 + 1]; }
    x /= n; y /= n;
    const roof = pickBuilding(city, x, y / 2 - h);
    expect(roof).not.toBeNull();
    // the hit is this building or one drawn in front of it
    expect(roof!.tile.bMaxY[roof!.i]).toBeGreaterThanOrEqual(tile.bMaxY[i]);
    const facts = describeBuilding(city, { tile, i });
    expect(facts.floors).toBeGreaterThanOrEqual(1);
    expect(facts.footprint).toBeGreaterThan(0);
    expect(facts.station.length).toBeGreaterThan(0);
    expect(pickBuilding(city, -500, -500)).toBeNull();
  });

  it('adds up a neighbourhood', () => {
    const r = areaReport(city, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE);
    // buildings straddling the tile edge are counted by their first corner
    expect(r.buildings).toBeGreaterThan(tile.nb * 0.95);
    expect(r.buildings).toBeLessThanOrEqual(tile.nb);
    expect(r.byZone[0] + r.byZone[1] + r.byZone[2] + r.byZone[3]).toBe(r.buildings);
    expect(r.byZone[Z_RES]).toBeGreaterThan(0);
    expect(r.residents).toBeGreaterThan(0);
    expect(r.roadKm).toBeGreaterThan(1);
    for (const d of r.demand) { expect(d).toBeGreaterThanOrEqual(-1); expect(d).toBeLessThanOrEqual(1); }
    expect(r.suburb).not.toBe('Hyderabad');
  });
});
