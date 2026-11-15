// Shared implementation of the scene contract
// { id, title, speaker, init(ctx), enter(timeline), exit(timeline), update(dt), dispose() }
// plus reveal(step) for the JSON reveal steps. Each sNN-*.js file passes its own metadata;
// later phases override enter/exit/update per scene with real visuals.
// world: optional async factory for a live 3D world that replaces the plate (WebGL path only).
export function createScene({ title, speaker, transition, content, still = false, world = null }) {
  let slide;
  let hud;
  return {
    id: content.id,
    title,
    speaker,
    world,
    still, // true: plate stays fixed (no Ken Burns), so overlays can align to it
    transition, // shader type used when entering this scene going forward
    content,
    init(ctx) {
      hud = ctx.hud;
      slide = this.slide = hud.mount(content, this, ctx.index);
    },
    enter(tl) {
      slide.hidden = false;
      tl.fromTo(slide, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, 0.2);
    },
    exit(tl) {
      tl.to(slide, { autoAlpha: 0, duration: 0.35, ease: 'power1.in', onComplete: () => (slide.hidden = true) }, 0);
    },
    reveal(step) {
      hud.showStep(slide, step);
    },
    update() {},
    dispose() {
      slide?.remove();
    },
  };
}
