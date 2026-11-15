import { describe, it, expect } from 'vitest';
import { project, CHOKEPOINTS, MAP_VIEW, LAT_MIN, LAT_MAX } from '../src/core/geo.js';

describe('s04 map projection', () => {
  it('maps the frame corners to the stage corners', () => {
    expect(project(MAP_VIEW.lonMin, LAT_MAX)).toEqual([0, 0]);
    const [x, y] = project(MAP_VIEW.lonMax, LAT_MIN);
    expect(x).toBeCloseTo(1920);
    expect(y).toBeCloseTo(1080);
  });

  it('keeps every chokepoint inside the frame, right of the left-third text area', () => {
    for (const c of Object.values(CHOKEPOINTS)) {
      const [x, y] = project(c.lon, c.lat);
      expect(x).toBeGreaterThan(640);
      expect(x).toBeLessThan(1920);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1080);
    }
  });
});
