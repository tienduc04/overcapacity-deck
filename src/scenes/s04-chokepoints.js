import { createScene } from './scene.js';
import content from '../../content/s04.json';

let map = null; // the live world, when this tier renders one
const world = () =>
  import('../world/map.js')
    .then((m) => m.createMapWorld())
    .then((w) => (map = w));

const scene = createScene({ title: 'Detours & Disruptions', speaker: 'Akshaya', transition: 'radarWipe', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps

// Map pose per step: 6 overview, 0 wide, 1 Red Sea close-up. The last step must end on pose 1 (Suez shut):
// s04b starts on that frame.
const POSE = [6, 0, 1, 1, 1];

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
const card = (cls, n) =>
  div(`m-card ${cls}`, `<div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${n.label}</div>${n.note ? `<div class="n">${n.note}</div>` : ''}`);
const ul = (pts) => `<ul>${pts.map((p) => `<li>${p}</li>`).join('')}</ul>`;
const kcard = (c) => `<div class="k-card"><div class="h">${c.head}</div>${c.stat ? `<div class="v">${c.stat}</div>` : ''}${ul(c.points)}</div>`;
const table = (t) =>
  `<div class="k-table"><b>${t.head[0]}</b><i></i><b class="w">${t.head[1]}</b>${t.rows.map(([a, b]) => `<span>${a}</span><i>→</i><span class="w">${b}</span>`).join('')}</div>`;
// Nominal vs effective: one full bar, one shorter bar whose missing part is the capacity absorbed.
const capacity = (c) =>
  `<div class="k-cap"><div class="bar"><u style="width:100%"></u><span>${c.nominal}</span></div><div class="bar eff"><u style="width:72%"></u><s style="width:28%">${c.lost}</s><span>${c.effective}</span></div><div class="n">${c.note}</div></div>`;

// Step 0: the route map with a callout per route. Step 1: longer routes (the shared page panel) with the two
// key numbers. Steps 2-4: one screen each from Akshaya's doc.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  scene.slide.classList.add('slide--choke');
  const [a, b] = content.keyNumbers;
  const col = div('m-col');
  col.append(card('m-a', a), card('m-b', b));
  const banner = div('m-banner', content.banner.shut);
  const legend = div('m-legend', `<div class="cape">${content.legend[0]}<i></i></div><div class="suez">${content.legend[1]}<i></i></div><div class="note">${content.legend[2]}</div>`);
  const screens = div('k-screens');
  content.screens.forEach((sc, i) => {
    const s = div('k-screen', `<h2 class="k-t">${sc.title}</h2>`);
    s.dataset.n = i + 2;
    if (sc.cards) s.append(div(`k-row n${sc.cards.length}`, sc.cards.map(kcard).join('')));
    if (sc.table) s.append(div('k-row', table(sc.table)));
    if (sc.flow) s.append(div('k-row n4 flow', sc.flow.map(kcard).join('')));
    if (sc.capacity) s.append(div('k-row', capacity(sc.capacity)));
    if (sc.note) s.append(div('k-note', sc.note));
    screens.append(s);
  });
  const routes = div('k-routes', content.routes.map((r) =>
    `<div class="k-route ${r.kind}"><div class="h">${r.name}</div><div class="d">${r.dist}</div><div class="t">${r.days}</div>${r.delta ? `<div class="x">${r.delta}</div>` : ''}</div>`).join('') + `<div class="n">${content.routesNote}</div>`);
  scene.slide.append(banner, col, legend, screens, routes);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  map?.go(POSE[step], 0, !active);
  map?.chart(step === 0, !active);
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
