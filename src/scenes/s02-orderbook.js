import { createScene } from './scene.js';
import content from '../../content/s02.json';

let box = null; // the live world, when this tier renders one
const world = () =>
  import('../world/container.js')
    .then((m) => m.createContainerWorld())
    .then((w) => (box = w));

const scene = createScene({ title: 'Orderbook', speaker: 'Tien Duc', transition: 'zoomBlur', content, world });
const base = { init: scene.init, enter: scene.enter, exit: scene.exit, reveal: scene.reveal };
let active = false; // on screen: step changes animate the camera; arriving from another scene does not

// Reticle locked on the box and the prompt to inspect it. A click anywhere (or Space, →) advances.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const lock = document.createElement('div');
  lock.className = 'lock';
  lock.append(...Array.from({ length: 4 }, () => document.createElement('i')));
  const label = document.createElement('span');
  label.className = 'lock-label';
  label.textContent = 'Target locked';
  lock.append(label);
  const tap = document.createElement('div');
  tap.className = 'tap';
  tap.textContent = '[ Tap to inspect ]';
  scene.slide.append(lock, tap);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  box?.go(step, !active);
};
scene.enter = (tl) => {
  active = true;
  base.enter(tl);
};
scene.exit = (tl) => {
  active = false;
  base.exit(tl);
};

export default scene;
