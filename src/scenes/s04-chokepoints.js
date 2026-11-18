import { createScene } from './scene.js';
import content from '../../content/s04.json';

let map = null; // the live world, when this tier renders one
const world = () =>
  import('../world/map.js')
    .then((m) => m.createMapWorld())
    .then((w) => (map = w));

const scene = createScene({ title: 'Chokepoints', speaker: 'Akshaya and Akib', transition: 'radarWipe', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps
let gauge = null;

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
const card = (cls, n, swap) => {
  const lab = swap ? `<span class="m-shut">${n.label}</span><span class="m-open">${n.labelOpen}</span>` : n.label;
  return div(`m-card ${cls}`, `<div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${lab}</div>${n.note ? `<div class="n">${n.note}</div>` : ''}`);
};

// Steps 0-1 (Req 3): Suez shut, traffic round the Cape. 2-3 (Req 4): Suez traffic coming back.
// 4-5: back to normal. OPEN is how far the map's Suez traffic is back; the gauge shows the share of
// Asia-Europe ships using Suez from the Req 3-4 notes (8% in the crisis, 36% early Oct, ~80% before).
const OPEN = [0, 0, 0.45, 0.45, 1, 1];

scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const [a, b, c, d] = content.keyNumbers;
  const col = div('m-col');
  col.append(card('m-a', a, true), card('m-b', b), card('m-c', c), card('m-c', d));
  const g = content.gauge;
  gauge = div('m-gauge', `<div class="t">${g.title}</div><div class="track"><i></i>${g.marks.map((m) => `<b style="left:${m.at}%"><span>${m.at}%</span><em>${m.label}</em></b>`).join('')}</div><div class="n"></div>`);
  col.append(gauge);
  const banner = div('m-banner', `<span class="m-shut">${content.banner.shut}</span><span class="m-open">${content.banner.open}</span>`);
  const legend = div('m-legend', `<div class="cape">${content.legend[0]}<i></i></div><div class="suez"><span class="m-shut">${content.legend[1]}</span><span class="m-open">${content.legendOpen}</span><i></i></div><div class="note">${content.legend[2]}</div>`);
  scene.slide.append(banner, col, legend);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  scene.slide.dataset.open = step >= 2 ? '1' : '0';
  if (gauge) {
    gauge.querySelector('i').style.width = `${content.gauge.byStep[step]}%`;
    gauge.querySelector('.n').textContent = content.gauge.notes[step];
  }
  map?.go(step, OPEN[step], !active);
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
