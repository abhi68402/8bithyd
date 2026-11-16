import { describe, it, expect } from 'vitest';
import { pickTier, renderDpr, TIERS } from '../engine/quality';

describe('graphics quality', () => {
  it('ranks devices', () => {
    expect(pickTier({ memory: 16, cores: 10, mobile: false, saveData: false })).toBe(2);
    expect(pickTier({ mobile: false, saveData: false })).toBe(2);           // desktop Safari reveals nothing
    expect(pickTier({ cores: 6, mobile: true, saveData: false })).toBe(1);   // any phone starts at medium
    expect(pickTier({ memory: 4, cores: 8, mobile: false, saveData: false })).toBe(1);
    expect(pickTier({ memory: 2, cores: 8, mobile: true, saveData: false })).toBe(0);
    expect(pickTier({ memory: 8, cores: 2, mobile: false, saveData: false })).toBe(0);
    expect(pickTier({ memory: 8, cores: 8, mobile: false, saveData: true })).toBe(0);
  });
  it('keeps the canvas inside its pixel budget, in half steps', () => {
    expect(renderDpr(TIERS[2], 1440, 900, 2)).toBe(2);
    expect(renderDpr(TIERS[2], 1440, 900, 1)).toBe(1);
    expect(renderDpr(TIERS[0], 390, 844, 3)).toBe(1);
    expect(renderDpr(TIERS[1], 390, 844, 3)).toBe(2);
    const d = renderDpr(TIERS[2], 2560, 1440, 2); // a 4K-class window
    expect(d).toBeLessThan(2);
    expect(d * 2).toBe(Math.round(d * 2));
    expect(2560 * 1440 * d * d).toBeLessThanOrEqual(TIERS[2].maxPixels);
    for (const q of TIERS) expect(renderDpr(q, 5000, 3000, 2)).toBe(1); // never below 1
  });
});
