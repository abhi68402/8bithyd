import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { City, decodeTile } from '../world/city';
import { TILE, TX } from '../world/geo';
import { Sim } from '../sim/sim';
import { describeAqi } from '../sim/live';
import { VEH_MIX, VEH_ROWS } from '../art/actors';

const MAP = 'public/map/';
const hasMap = existsSync(MAP + 'city.json');

describe.skipIf(!hasMap)('city simulation', () => {
  const city = new City();
  city.ingest(JSON.parse(readFileSync(MAP + 'city.json', 'utf8')), new Uint8Array(readFileSync(MAP + 'grid.bin')));
  const cm = city.places.find((p) => p.id === 'charminar')!;
  const tx = Math.floor(cm.x / TILE), ty = Math.floor(cm.y / TILE);
  const buf = readFileSync(`${MAP}t/${tx}_${ty}.bin`);
  const tile = decodeTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), tx, ty);
  (city as unknown as { tiles: Map<number, unknown> }).tiles.set(ty * TX + tx, tile);

  it('registers traffic signals at arterial junctions and cycles phases', () => {
    const sim = new Sim(city);
    expect(sim.signalPos.size).toBeGreaterThan(0);
    const phases = new Set<number>();
    for (let t = 0; t < 16; t += 0.5) {
      sim.clock = t;
      const [firstKey] = sim.signalPos.keys();
      phases.add(sim.signalPhase(firstKey));
    }
    expect(phases.has(0)).toBe(true);
    expect(phases.has(1)).toBe(true);
    expect(phases.has(2)).toBe(true);
    expect(phases.has(3)).toBe(true);
  });

  it('spawns and advances traffic and walkers inside the viewport', () => {
    const sim = new Sim(city);
    sim.view = { x0: cm.x - 400, y0: cm.y - 400, x1: cm.x + 400, y1: cm.y + 400, on: true };
    for (let k = 0; k < 20; k++) sim.update(0.05, false);
    let activeVeh = 0, activePpl = 0;
    for (let i = 0; i < sim.veh.n; i++) if (sim.veh.tile[i]) activeVeh++;
    for (let i = 0; i < sim.ppl.n; i++) if (sim.ppl.tile[i]) activePpl++;
    expect(activeVeh).toBeGreaterThan(5);
    expect(activePpl).toBeGreaterThan(5);
  });

  it('includes valid vehicle mix indices', () => {
    for (const idx of VEH_MIX) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(VEH_ROWS.length);
    }
  });

  it('spawns MMTS suburban trains, computes metro ETAs, and classifies AQI', () => {
    const sim = new Sim(city);
    expect(sim.mmts.length).toBeGreaterThan(0);
    const [mx, my] = sim.mmtsPos(0, 0);
    expect(Number.isFinite(mx)).toBe(true);
    expect(Number.isFinite(my)).toBe(true);

    const eta = sim.nearestMetroETA(cm.x, cm.y);
    expect(eta).not.toBeNull();
    expect(eta!.station.length).toBeGreaterThan(0);
    expect(eta!.etaMin).toBeGreaterThanOrEqual(1);

    expect(describeAqi(35)).toBe('Good');
    expect(describeAqi(85)).toBe('Moderate');
    expect(describeAqi(130)).toBe('Hazy');
    expect(describeAqi(220)).toBe('Heavy haze');
  });
});
