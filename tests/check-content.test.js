import { describe, expect, test } from 'vitest';
import { checkContent, readDocs } from '../scripts/check-content.mjs';

const messages = (dir) => checkContent(readDocs(dir)).map((p) => `${p.file}: ${p.message}`);

describe('check-content', () => {
  test('a complete, verified slide passes', () => {
    expect(messages('tests/fixtures/pass')).toEqual([]);
  });

  test('every rule fires on the bad fixture', () => {
    const m = messages('tests/fixtures/fail').join('\n');
    expect(m).toMatch(/bad\.json: owner is missing/);
    expect(m).toMatch(/bad\.json: pending is true/);
    expect(m).toMatch(/bad\.json: headline has 13 words \(max 12\)/);
    expect(m).toMatch(/bad\.json: 4 keyNumbers \(max 3\)/);
    expect(m).toMatch(/keyNumbers\[0\] "Sample number" is sample, not verified/);
    expect(m).toMatch(/keyNumbers\[1\] "No url" is verified but has no url/);
    expect(m).toMatch(/chart "Unverified chart" is unverified, not verified/);
    expect(m).toMatch(/broken\.json: not valid JSON/);
  });

  test('the real content fails today (sample data, unverified figure, pending)', () => {
    const m = messages('content').join('\n');
    expect(m).not.toMatch(/keyNumbers\[0\] "Container ship orderbook"/); // 14M+ TEU is verified with a URL
    expect(m).toMatch(/s02\.json: keyNumbers\[1\] "Of the existing fleet" is unverified/);
    expect(m).toMatch(/s03\.json: pending is true/);
  });
});
