import { createScene } from './scene.js';
import content from '../../content/s04b.json';

// Req 4 (Akib): the same map as s04, its own instance, with Suez traffic coming back.
let map = null;
const world = () =>
  import('../world/map.js')
    .then((m) => m.createMapWorld())
    .then((w) => (map = w));

// Crossfade between identical frames: step 0 starts on s04's last view (Red Sea close-up, Suez shut), so the
// cut is invisible and arrive() plays one continuous move: Suez reopens, a lead ship sails through, zoom out.
const scene = createScene({ title: 'When the Detours End', speaker: 'Akib', transition: 'crossfade', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false;
let at = 0;

// Per step: map camera pose (index into map.js POSES: 2 wide, 3 Europe ports) and how far Suez traffic is back.
const POSE = [2, 2, 3, 4, 5];
const OPEN = [0.45, 0.6, 0.6, 1, 1];

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });

// Step 0: agenda. Steps 1-4: one screen of Req4.pptx each; the agenda shrinks to a rail on the left.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const s = scene.slide;
  s.classList.add('slide--detours');
  s.dataset.open = '1';
  const rail = div('d-rail', `<div class="d-sub">${content.subhead}</div>`);
  content.screens.forEach((sc, i) => rail.append(div('d-item', `<b>${i + 1}</b><span>${sc.title}</span>`)));
  const cards = div('d-screens');
  content.screens.forEach((sc, i) => {
    const screen = div('d-screen');
    screen.dataset.n = i + 1;
    screen.innerHTML = sc.cards
      .map((c) => `<div class="d-card"><div class="h">${c.head}</div>${c.stat ? `<div class="v">${c.stat}</div>` : ''}<ul>${c.points.map((p) => `<li>${p}</li>`).join('')}</ul></div>`)
      .join('');
    cards.append(screen);
  });
  const banner = div('m-banner', content.banner);
  const legend = div('m-legend', `<div class="cape">${content.legend[0]}<i></i></div><div class="suez">${content.legend[1]}<i></i></div><div class="note">${content.legend[2]}</div>`);
  s.append(banner, rail, cards, legend);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  scene.slide.querySelectorAll('.d-item').forEach((el, i) => el.classList.toggle('on', i + 1 === step));
  at = step;
  if (!active && step === 0) map?.go(1, 0, true); // same frame s04 ends on
  else map?.go(POSE[step], OPEN[step], !active);
};
scene.arrive = () => {
  if (at === 0) map?.reopen(POSE[0], OPEN[0]);
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
