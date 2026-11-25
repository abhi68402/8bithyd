import { describe, it, expect } from 'vitest';
import { renderDpr, QUALITY } from '../engine/quality';

describe('universal graphics quality', () => {
  it('enables full detail and full simulation density universally', () => {
    expect(QUALITY.hiRes).toBe(true);
    expect(QUALITY.agents).toBe(1);
    expect(QUALITY.rain).toBe(1);
    expect(QUALITY.dpr).toBe(2);
  });

  it('keeps full 2x sharpness on big high-density screens', () => {
    expect(renderDpr(1440, 900, 2)).toBe(2);
    expect(renderDpr(1728, 1117, 2)).toBe(2); // 16" laptop, full screen
    expect(renderDpr(2560, 1440, 2)).toBe(2); // 27" display
    expect(renderDpr(1440, 900, 1)).toBe(1);
    expect(renderDpr(5000, 3000, 2)).toBeGreaterThanOrEqual(1);
  });
});
