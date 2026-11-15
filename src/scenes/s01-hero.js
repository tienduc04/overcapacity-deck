import { createScene } from './scene.js';
import content from '../../content/s01.json';

const world = () => import('../world/hero.js').then((m) => m.createHeroWorld());

export default createScene({ title: 'Hero', speaker: 'Tien Duc', transition: 'none', content, world });
