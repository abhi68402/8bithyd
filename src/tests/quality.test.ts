import { describe, it, expect, beforeEach } from 'vitest';
import { renderDpr, TIERS, QualityManager } from '../engine/quality';

describe('graphics quality', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });

  it('starts every visitor at full quality', () => {
    const q = new QualityManager('');
    expect(q.label).toBe('HIGH');
    expect(q.q.hiRes).toBe(true);
    expect(q.q.agents).toBe(1);
  });

  it('only lowers quality when the visitor asks', () => {
    expect(new QualityManager('?gfx=low').label).toBe('LOW');
    const q = new QualityManager('');
    q.cycle();
    expect(q.label).toBe('MEDIUM');
    expect(new QualityManager('').label).toBe('MEDIUM'); // remembered
    q.cycle(); q.cycle();
    expect(q.label).toBe('HIGH');
    expect(new QualityManager('').label).toBe('HIGH');
  });

  it('keeps full 2x sharpness on big high-density screens', () => {
    expect(renderDpr(TIERS[2], 1440, 900, 2)).toBe(2);
    expect(renderDpr(TIERS[2], 1728, 1117, 2)).toBe(2); // 16" laptop, full screen
    expect(renderDpr(TIERS[2], 2560, 1440, 2)).toBe(2); // 27" display
    expect(renderDpr(TIERS[2], 1440, 900, 1)).toBe(1);
    for (const q of TIERS) expect(renderDpr(q, 5000, 3000, 2)).toBeGreaterThanOrEqual(1);
  });
});
