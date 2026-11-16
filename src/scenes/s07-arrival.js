import { createScene } from './scene.js';
import content from '../../content/s07.json';

let harbour = null; // the live world, when this tier renders one
const world = () => import('../world/harbour.js').then((m) => m.createHarbourWorld()).then((w) => (harbour = w));

const scene = createScene({ title: 'Arrival', speaker: 'Whole group', transition: 'dockFade', content, world });
const enter = scene.enter;
scene.enter = (tl) => {
  harbour?.arrive(); // the ship starts its approach as the scene comes in
  enter(tl);
};

export default scene;
