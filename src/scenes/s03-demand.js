import { createScene } from './scene.js';
import content from '../../content/s03.json';

let port = null; // the live world, when this tier renders one
const world = () =>
  import('../world/port.js')
    .then((m) => m.createPortWorld(content.chart.series))
    .then((w) => (port = w));

const scene = createScene({ title: 'Demand', speaker: 'Speaker A', transition: 'laserScan', content, world });
const base = { reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps

// Step 0: the terminal at blue hour, the crane scanning. Step 1: the stacks go up. Step 2: high view.
scene.reveal = (step) => {
  base.reveal(step);
  port?.go(step, !active);
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
