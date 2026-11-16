import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('public/data/scenarios.json', 'utf8'));
const names = ['optimistic', 'base', 'downside'];

describe('public/data/scenarios.json (model output for scene 6)', () => {
  it('has every scenario with one value per year', () => {
    for (const n of names) {
      expect(d.scenarios[n].gap_pp).toHaveLength(d.years.length);
      expect(d.scenarios[n].util_idx).toHaveLength(d.years.length);
      expect(d.fan_gap_pp[n]).toHaveLength(d.years.length);
    }
  });
  it('orders the scenarios from tight to oversupplied in every year', () => {
    d.years.forEach((_, i) => {
      expect(d.scenarios.optimistic.gap_pp[i]).toBeLessThan(d.scenarios.base.gap_pp[i]);
      expect(d.scenarios.base.gap_pp[i]).toBeLessThan(d.scenarios.downside.gap_pp[i]);
      expect(d.scenarios.optimistic.util_idx[i]).toBeGreaterThan(d.scenarios.base.util_idx[i]);
      expect(d.scenarios.base.util_idx[i]).toBeGreaterThan(d.scenarios.downside.util_idx[i]);
    });
  });
});
