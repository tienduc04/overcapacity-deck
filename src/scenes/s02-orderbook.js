import { createScene } from './scene.js';
import content from '../../content/s02.json';

let box = null; // the live world, when this tier renders one
const world = () =>
  import('../world/container.js')
    .then((m) => m.createContainerWorld())
    .then((w) => (box = w));

const scene = createScene({ title: 'Orderbook', speaker: 'Tien Duc', transition: 'zoomBlur', content, world });
const base = { reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: step changes leave the camera alone

// Coming from scene 1 (forward, step 0) the camera lands outside the shut box; back from scene 3 it is inside.
scene.reveal = (step) => {
  base.reveal(step);
  if (!active) box?.place(step === 0);
};
scene.enter = (tl) => {
  active = true;
  base.enter(tl);
};
scene.exit = (tl) => {
  active = false;
  base.exit(tl);
};
// After the zoom blur: open the doors and go in.
scene.arrive = (direction) => direction > 0 && box?.goInside();

// Next to scene 3: the camera backs out of the box while the laser scan takes over.
scene.leadOut = (tl, ev) => {
  if (!box || ev.to !== 2) return 0;
  tl.add(box.goOut(), 0);
  return 0.9;
};

export default scene;
