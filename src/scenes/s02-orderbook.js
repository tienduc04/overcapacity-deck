import { createScene } from './scene.js';
import content from '../../content/s02.json';

const world = () => import('../world/container.js').then((m) => m.createContainerWorld());

export default createScene({ title: 'Orderbook', speaker: 'Tien Duc', transition: 'zoomBlur', content, world });
