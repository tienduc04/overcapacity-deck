import { createScene } from './scene.js';
import content from '../../content/s04.json';

let map = null; // the live world, when this tier renders one
const world = () =>
  import('../world/map.js')
    .then((m) => m.createMapWorld())
    .then((w) => (map = w));

const scene = createScene({ title: 'Chokepoints', speaker: 'Speakers B and C', transition: 'radarWipe', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps
let opened = false; // the REOPEN SUEZ button was pressed on step 2
let button = null;

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
const card = (cls, n, swap) => {
  const lab = swap ? `<span class="m-shut">${n.label}</span><span class="m-open">${n.labelOpen}</span>` : n.label;
  return div(`m-card ${cls}`, `<div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${lab}</div>${n.note ? `<div class="n">${n.note}</div>` : ''}`);
};

// Step 0: Suez shut, capacity absorbed. 1: the Cape detour in detail. 2: the REOPEN SUEZ button. 3: Suez open, what it means.
// The button and the right arrow do the same thing; going back below step 2 shuts Suez again.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const [a, b, c, d] = content.keyNumbers;
  const col = div('m-col');
  col.append(div('m-banner', `<span class="m-shut">${content.banner.shut}</span><span class="m-open">${content.banner.open}</span>`), card('m-a', a, true), card('m-b', b), card('m-c', c), card('m-c', d));
  const legend = div('m-legend', `<div class="cape">${content.legend[0]}<i></i></div><div class="suez"><span class="m-shut">${content.legend[1]}</span><span class="m-open">${content.legendOpen}</span><i></i></div><div class="note">${content.legend[2]}</div>`);
  button = document.createElement('button');
  button.className = 'm-reopen';
  button.textContent = content.button.label;
  button.addEventListener('click', () => {
    opened = true;
    scene.slide.dataset.open = '1';
    button.classList.add('done');
    button.textContent = content.button.done;
    map?.setOpen(true);
  });
  scene.slide.append(col, legend, button);
};

scene.reveal = (step) => {
  base.reveal(step);
  if (step < 2) opened = false;
  const open = step >= 3 || (step === 2 && opened);
  scene.slide.dataset.at = step;
  scene.slide.dataset.open = open ? '1' : '0';
  if (button && step < 3) {
    button.classList.toggle('done', open);
    button.textContent = open ? content.button.done : content.button.label;
  }
  map?.go(step, open, !active);
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
