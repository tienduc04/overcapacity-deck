import gsap from 'gsap';
import { createScene } from './scene.js';
import content from '../../content/s01.json';

let hero = null; // the live world, when this tier renders one (it letters the title behind the ship)
const world = () =>
  import('../world/hero.js')
    .then((m) => m.createHeroWorld({ word: content.headline }))
    .then((w) => (hero = w));

const scene = createScene({ title: 'Hero', speaker: 'Tien Duc', transition: 'none', content, world });
const base = { init: scene.init, enter: scene.enter, exit: scene.exit };

scene.init = (ctx) => {
  base.init.call(scene, ctx);
  scene.slide.classList.toggle('slide--title-3d', Boolean(hero));
};

// The masthead rises into the sky, the question slides up out of its line masks, the small lines fade in.
// Not on the timeline: the first scene's timeline is jumped to its end on load.
scene.enter = (tl) => {
  base.enter(tl);
  const q = (s) => scene.slide.querySelectorAll(s);
  gsap.set(q('.hero-foot'), { clearProps: 'transform,opacity,visibility' });
  if (hero) hero.fly.p = 0;
  if (hero) gsap.fromTo(hero.titleFx, { alpha: 0, rise: 0.035 }, { alpha: 1, rise: 0, duration: 1.6, ease: 'power3.out', delay: 0.3 });
  gsap.fromTo(q('.hero-subtitle .line > *'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12, delay: 0.8 });
  gsap.fromTo(q('.hero-course, .hero-crew, .hero-hint'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, stagger: 0.15, delay: 1.1 });
};

// Leaving for scene 2: the text block bottom left slides left and fades, making room for the zoom.
scene.exit = (tl) => {
  tl.to(scene.slide.querySelector('.hero-foot'), { x: -60, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 0);
  base.exit(tl);
};

// Next to scene 2: the camera flies in to an orange box on deck before the zoom blur takes over.
scene.leadOut = (tl, ev) => {
  if (!hero || ev.to !== 1) return 0;
  gsap.killTweensOf(hero.titleFx); // the entrance fade may still be running
  tl.to(hero.titleFx, { alpha: 0, duration: 0.6, ease: 'power1.in' }, 0);
  // Never slows down: the blur takes over while the camera is still rushing in (renderer keeps it live).
  tl.fromTo(hero.fly, { p: 0 }, { p: 1, duration: 3.4, ease: 'none' }, 0);
  return 1.8; // + 1.6 s blur: 3.4 s, inside the deck's 4 s per transition
};

export default scene;
