import { createScene } from './scene.js';
import content from '../../content/s04.json';

let map = null; // the live world, when this tier renders one
const world = () =>
  import('../world/map.js')
    .then((m) => m.createMapWorld())
    .then((w) => (map = w));

const scene = createScene({ title: 'Chokepoints', speaker: 'Akshaya', transition: 'radarWipe', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
const card = (cls, n) =>
  div(`m-card ${cls}`, `<div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${n.label}</div>${n.note ? `<div class="n">${n.note}</div>` : ''}`);

// Req 3: Suez shut, traffic round the Cape. The reopening is the next scene (s04b, Req 4).
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const [a, b] = content.keyNumbers;
  const col = div('m-col');
  col.append(card('m-a', a), card('m-b', b));
  const banner = div('m-banner', content.banner.shut);
  const legend = div('m-legend', `<div class="cape">${content.legend[0]}<i></i></div><div class="suez">${content.legend[1]}<i></i></div><div class="note">${content.legend[2]}</div>`);
  scene.slide.append(banner, col, legend);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  map?.go(step, 0, !active);
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
