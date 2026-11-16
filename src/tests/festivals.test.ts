import { describe, it, expect } from 'vitest';
import { FESTIVALS, festivalsOn, nextFestival, indiaToday } from '../sim/festivals';
import { PLACES } from '../world/places';

const ids = (y: number, m: number, d: number) => festivalsOn({ y, m, d }).map((f) => f.id);

describe('festival calendar', () => {
  it('uses India time, not the visitor timezone', () => {
    // 20:00 UTC on 25 Jan is already 26 Jan in India
    expect(indiaToday(new Date(Date.UTC(2026, 0, 25, 20, 0)))).toEqual({ y: 2026, m: 1, d: 26 });
  });

  it('finds fixed-date festivals every year', () => {
    expect(ids(2026, 1, 14)).toContain('f-sankranti');
    expect(ids(2031, 1, 14)).toContain('f-sankranti');
    expect(ids(2026, 8, 15)).toContain('f-independence');
    expect(ids(2026, 12, 25)).toContain('f-christmas');
  });

  it('handles ranges and their edges', () => {
    expect(ids(2026, 2, 1)).toContain('f-numaish');
    expect(ids(2026, 2, 15)).toContain('f-numaish');
    expect(ids(2026, 2, 16)).not.toContain('f-numaish');
    expect(ids(2026, 11, 8)).toContain('f-diwali');
    expect(ids(2027, 11, 8)).not.toContain('f-diwali');
  });

  it('counts down to the next festival, across New Year', () => {
    expect(nextFestival({ y: 2026, m: 11, d: 16 })).toMatchObject({ f: { id: 'f-christmas' }, days: 38 });
    expect(nextFestival({ y: 2026, m: 12, d: 31 })).toMatchObject({ f: { id: 'f-newyear' }, days: 1 });
  });

  it('only points at real places', () => {
    for (const f of FESTIVALS) for (const id of f.sites ?? [f.place]) expect(PLACES.some((p) => p.id === id), `${f.id} -> ${id}`).toBe(true);
  });
});
