import { describe, expect, test } from 'vitest';
import { createDeck } from '../src/core/deck.js';

// 3 scenes: 2 steps, 3 steps (default), 1 step.
const make = () => createDeck([{ steps: 2 }, {}, { steps: 1 }]);
const pos = (d) => [d.state.scene, d.state.step];

describe('deck state machine', () => {
  test('next walks the reveal steps, then moves to the next scene', () => {
    const d = make();
    expect(pos(d)).toEqual([0, 0]);
    expect(d.next()).toEqual({ type: 'step', scene: 0, step: 1 });
    expect(d.next()).toEqual({ type: 'scene', from: 0, to: 1, step: 0, direction: 1 });
    expect(d.state.transitioning).toBe(true);
  });

  test('next during a transition only finishes it (no double skip)', () => {
    const d = make();
    d.next();
    d.next(); // → scene 1, transitioning
    expect(d.next()).toEqual({ type: 'skip', scene: 1 });
    expect(pos(d)).toEqual([1, 0]);
    expect(d.state.transitioning).toBe(false);
  });

  test('skip only acts while transitioning; done() also ends it', () => {
    const d = make();
    expect(d.skip()).toBeNull();
    d.jump(2);
    d.done();
    expect(d.state.transitioning).toBe(false);
    expect(d.skip()).toBeNull();
  });

  test('prev steps back, then returns to the previous scene fully revealed', () => {
    const d = make();
    d.jump(1);
    d.done();
    expect(d.prev()).toEqual({ type: 'scene', from: 1, to: 0, step: 1, direction: -1 });
    d.done();
    expect(d.prev()).toEqual({ type: 'step', scene: 0, step: 0 });
    expect(d.prev()).toBeNull(); // start of deck
  });

  test('next stops at the end of the deck', () => {
    const d = make();
    d.jump(2);
    d.done();
    expect(d.next()).toBeNull();
    expect(pos(d)).toEqual([2, 0]);
  });

  test('jump goes to step 0 of any scene; ignores invalid targets', () => {
    const d = make();
    expect(d.jump(2)).toEqual({ type: 'scene', from: 0, to: 2, step: 0, direction: 1 });
    expect(d.jump(1)).toEqual({ type: 'scene', from: 2, to: 1, step: 0, direction: -1 }); // finishes the running one first
    d.done();
    d.next();
    expect(d.jump(1)).toEqual({ type: 'step', scene: 1, step: 0 });
    expect(d.jump(1)).toBeNull();
    expect(d.jump(7)).toBeNull();
    expect(d.jump(-1)).toBeNull();
  });

  test('a full forward run visits every step of every scene once', () => {
    const d = make();
    const seen = [pos(d).join('.')];
    for (let ev; (ev = d.next()); ) {
      if (ev.type === 'scene') d.done();
      seen.push(pos(d).join('.'));
    }
    expect(seen).toEqual(['0.0', '0.1', '1.0', '1.1', '1.2', '2.0']);
  });
});
