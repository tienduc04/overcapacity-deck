// Navigation state machine. Pure: no DOM, no three, no timers, so Vitest can drive it.
// State: { scene, step, transitioning }. Each scene has `steps` reveal steps (index 0..steps-1);
// entering a scene shows step 0, and "next" on the last step moves to the next scene.
// Every call returns an event for the app to apply, or null when nothing changes:
//   { type: 'step',  scene, step }
//   { type: 'scene', from, to, step, direction: 1 | -1 }   (transitioning becomes true)
//   { type: 'skip',  scene }                               (finish the running transition)
export function createDeck(scenes) {
  if (!scenes.length) throw new Error('deck: no scenes');
  const steps = scenes.map((s) => Math.max(1, s.steps ?? 3));
  const state = { scene: 0, step: 0, transitioning: false };

  function goScene(to, step, direction) {
    const from = state.scene;
    Object.assign(state, { scene: to, step, transitioning: true });
    return { type: 'scene', from, to, step, direction };
  }

  return {
    get state() {
      return { ...state };
    },
    steps: (i) => steps[i],
    // While a transition runs, next/prev only finish it: a double press never skips a slide.
    next() {
      if (state.transitioning) return this.skip();
      if (state.step < steps[state.scene] - 1) return { type: 'step', scene: state.scene, step: ++state.step };
      if (state.scene < scenes.length - 1) return goScene(state.scene + 1, 0, 1);
      return null;
    },
    prev() {
      if (state.transitioning) return this.skip();
      if (state.step > 0) return { type: 'step', scene: state.scene, step: --state.step };
      if (state.scene > 0) return goScene(state.scene - 1, steps[state.scene - 1] - 1, -1); // back = fully revealed
      return null;
    },
    jump(i) {
      if (!Number.isInteger(i) || i < 0 || i >= scenes.length) return null;
      if (state.transitioning) this.skip();
      if (i === state.scene) return state.step === 0 ? null : { type: 'step', scene: i, step: (state.step = 0) };
      return goScene(i, 0, i > state.scene ? 1 : -1);
    },
    skip() {
      if (!state.transitioning) return null;
      state.transitioning = false;
      return { type: 'skip', scene: state.scene };
    },
    // Called by the app when a transition ends on its own.
    done() {
      state.transitioning = false;
    },
  };
}
