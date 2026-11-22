import { createScene } from './scene.js';
import content from '../../content/s03.json';

let port = null; // the live world, when this tier renders one
const world = () =>
  import('../world/port.js')
    .then((m) => m.createPortWorld(content.chart.series))
    .then((w) => (port = w));

const scene = createScene({ title: 'Demand', speaker: 'Aryan', transition: 'shoreWash', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps
const beats = [];

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
const cards = (items, cls, prefix) => div('dm-cards', items.map((c, i) => `<div class="ob-panel ob-driver ${cls}"><b>${prefix} 0${i + 1}</b><div class="h">${c.title}</div><p>${c.line}</p></div>`).join(''));

// Three beats, one per reveal step (Req 2), over the port world's own beats:
// 0 demand resilience and three drivers (the boxes blow open), 1 Hapag-Lloyd case and three risks
// (the Hapag-Lloyd box steps aside, red brackets), 2 supply vs demand table and banner (hollow boxes, 3D stacks).
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const { keyNumbers, drivers, case: cs, risks, table, banner } = content;

  const kpis = div('ob-kpis dm-kpis');
  for (const k of keyNumbers) {
    const card = div('ob-kpi');
    card.append(div('v', k.value), div('u', k.unit), div('l', k.label), div('n', k.note));
    kpis.append(card);
  }
  beats.push(div('ob-beat'));
  beats[0].append(kpis, cards(drivers, '', 'Box'));

  beats.push(div('ob-beat'));
  beats[1].append(div('ob-panel dm-case', `<div class="t">${cs.title}</div><ul>${cs.points.map((p) => `<li>${p}</li>`).join('')}</ul><div class="n">${cs.note}</div>`), cards(risks, 'risk', 'Risk'));

  const head = `<tr>${table.head.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const rows = table.rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('');
  beats.push(div('ob-beat'));
  beats[2].append(div('ob-panel dm-table', `<table>${head}${rows}</table><div class="n">${table.note}</div>`), div('ob-banner dm-banner', banner));

  scene.slide.append(...beats);
};

scene.reveal = (step) => {
  base.reveal(step);
  beats.forEach((b, i) => b.classList.toggle('is-hidden', i !== step));
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
