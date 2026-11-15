import { describe, it, expect } from 'vitest';
import { kenBurns } from '../src/core/renderer.js';

describe('Ken Burns', () => {
  it('starts at rest and never samples outside the plate', () => {
    expect(kenBurns(2, 0)).toEqual([1, 0, 0].map((v, k) => (k ? expect.closeTo(v) : v)));
    for (let i = 0; i < 7; i++)
      for (let t = 0; t <= 100; t += 2.5) {
        const [s, x, y] = kenBurns(i, t);
        const room = 0.5 * (1 - 1 / s); // half the cropped margin for a full-cover plate
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(1.06 + 1e-9);
        expect(Math.abs(x)).toBeLessThanOrEqual(room + 1e-12);
        expect(Math.abs(y)).toBeLessThanOrEqual(room + 1e-12);
      }
  });
});
