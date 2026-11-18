import gsap from 'gsap';
import { createScene } from './scene.js';
import content from '../../content/s02.json';

let box = null; // the live world, when this tier renders one
const world = () =>
  import('../world/container.js')
    .then((m) => m.createContainerWorld())
    .then((w) => (box = w));

const scene = createScene({ title: 'Orderbook', speaker: 'Tien Duc', transition: 'zoomBlur', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: step changes leave the camera alone
const beats = [];
let counters = [];

const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });

// Three beats, one per reveal step (Req 1): 0 orderbook size and the delivery wave, 1 carriers with
// Hapag-Lloyd highlighted, 2 the four ordering drivers and the fallacy-of-composition banner.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const { chart, carriers, drivers, banner } = content;

  const kpis = div('ob-kpis');
  counters = content.keyNumbers.map((k) => {
    const v = div('v', k.value);
    const card = div('ob-kpi');
    card.append(v, div('u', k.unit), div('l', k.label), div('n', k.note));
    kpis.append(card);
    return { el: v, value: k.value };
  });
  const top = Math.max(...chart.bars.values);
  const bars = chart.bars.labels
    .map((y, i) => `<div class="ob-bar"><b>${chart.bars.tags[i]}</b><span class="val">${chart.bars.values[i]}</span><i style="height:${(chart.bars.values[i] / top) * 100}%"></i><span class="yr">${y}</span></div>`)
    .join('');
  const wave = div('ob-panel ob-wave', `<div class="t">${chart.title}</div><div class="ob-bars">${bars}</div><div class="key"><b>%</b> ${chart.bars.tagLabel}</div><div class="n">${chart.footnote}</div>`);
  beats.push(div('ob-beat'));
  beats[0].append(kpis, wave);

  const max = Math.max(...carriers.rows.map((r) => r.teu));
  const rows = carriers.rows
    .map((r, i) => `<div class="ob-row${r.highlight ? ' hl' : ''}"><span class="name">${r.rank ?? i + 1}. ${r.name}</span><span class="track"><i style="width:${(r.teu / max) * 100}%"></i></span><span class="teu">${r.teu.toFixed(2)}</span><span class="pct">${r.ratio}%</span></div>`)
    .join('');
  beats.push(div('ob-beat'));
  beats[1].append(div('ob-panel ob-callout', `<p>${carriers.callout}</p><div class="n">${carriers.note}</div>`), div('ob-panel ob-carriers', `<div class="t">${carriers.title}</div>${rows}`));

  const grid = div('ob-grid', drivers.map((d, i) => `<div class="ob-panel ob-driver"><b>0${i + 1}</b><div class="h">${d.title}</div><p>${d.line}</p></div>`).join(''));
  beats.push(div('ob-beat'));
  beats[2].append(grid, div('ob-banner', banner));

  scene.slide.append(...beats);
};

// Count the KPI numbers up from zero; ranges like "4–4.5" just appear (counting both ends reads oddly).
const countUp = () =>
  counters.forEach(({ el, value }) => {
    if (value.includes('–')) return;
    const p = { t: 0 };
    gsap.to(p, { t: 1, duration: 1.4, ease: 'power2.out', delay: 0.3, onUpdate: () => (el.textContent = value.replace(/\d+(\.\d+)?/g, (n) => (n * p.t).toFixed(n.split('.')[1]?.length ?? 0))) });
  });

// Coming from scene 1 (forward, step 0) the camera lands outside the shut box; back from scene 3 it is inside.
scene.reveal = (step) => {
  base.reveal(step);
  beats.forEach((b, i) => b.classList.toggle('is-hidden', i !== step));
  if (step === 0) countUp();
  if (!active) box?.place(step === 0);
};
scene.enter = (tl) => {
  active = true;
  base.enter(tl);
};
scene.exit = (tl) => {
  active = false;
  base.exit(tl);
};
// After the zoom blur: open the doors and go in.
scene.arrive = (direction) => direction > 0 && box?.goInside();

// Next to scene 3: the camera backs out of the box while the laser scan takes over.
scene.leadOut = (tl, ev) => {
  if (!box || ev.to !== 2) return 0;
  tl.add(box.goOut(), 0);
  return 0.9;
};

export default scene;
