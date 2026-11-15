import gsap from 'gsap';
import { Vector3 } from 'three';
import { createScene } from './scene.js';
import content from '../../content/s01.json';

let hero = null; // the live world, when this tier renders one (pins need it)
const world = () => import('../world/hero.js').then((m) => m.createHeroWorld()).then((w) => (hero = w));

const scene = createScene({ title: 'Hero', speaker: 'Tien Duc', transition: 'none', content, world });
const base = { init: scene.init, enter: scene.enter, exit: scene.exit };
let pins = [];
const v = new Vector3();

scene.init = (ctx) => {
  base.init.call(scene, ctx);
  if (!hero) return; // still plate: nothing to pin to
  const layer = scene.slide.querySelector('.pins');
  pins = content.pins.map(({ label, at, lift }) => {
    const e = document.createElement('div');
    e.className = 'pin';
    e.style.setProperty('--lift', `${lift}px`);
    const text = document.createElement('span');
    text.className = 'pin-label mono-fx';
    text.textContent = label;
    e.append(text);
    layer.append(e);
    return { e, at };
  });
};

// Title lines slide up out of their masks, mono lines decode like a radar readout.
// Not on the timeline: the first scene's timeline is jumped to its end on load.
scene.enter = (tl) => {
  base.enter(tl);
  const { slide } = scene;
  gsap.set(slide.querySelector('.hero-lead'), { clearProps: 'transform,opacity,visibility' });
  gsap.fromTo(slide.querySelectorAll('.headline .line > span'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12, delay: 0.3 });
  gsap.fromTo(slide.querySelector('.hero-subtitle'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.7 });
  slide.querySelectorAll('.mono-fx').forEach((node, i) => scramble(node, 0.2 + i * 0.12));
};

// Leaving for scene 2: the title block slides left and fades, making room for the zoom.
scene.exit = (tl) => {
  tl.to(scene.slide.querySelector('.hero-lead'), { x: -60, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 0);
  base.exit(tl);
};

// Keep each pin on its point of the ship (the stage is 1920×1080, scaled to fit, like the HUD).
scene.update = () => {
  if (!pins.length) return;
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  for (const p of pins) {
    hero.anchor(p.at, v);
    p.e.style.transform = `translate(${960 + (v.x * innerWidth) / 2 / k}px, ${540 - (v.y * innerHeight) / 2 / k}px)`;
  }
};

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#<>_';
function scramble(node, delay) {
  const text = (node.dataset.text ??= node.textContent);
  const o = { p: 0 };
  gsap.to(o, {
    p: 1,
    duration: 0.9,
    delay,
    ease: 'none',
    onUpdate() {
      const n = Math.floor(o.p * text.length);
      node.textContent = text.slice(0, n) + text.slice(n).replace(/\S/g, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
    },
    onComplete: () => (node.textContent = text),
  });
}

export default scene;
