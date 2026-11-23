import { createScene } from './scene.js';
import content from '../../content/s05.json';

let prop = null; // the live world, when this tier renders one
const world = () =>
  import('../world/prop.js')
    .then((m) => m.createPropWorld())
    .then((w) => (prop = w));

const scene = createScene({ title: 'Carriers', speaker: 'Sarkar Sanjoy', transition: 'bubbles', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps
let steps = [];
let card = null;
let side = null; // right-hand panel: fuel bars, lay-up vs scrapping, Gemini example

// One response per reveal step (Req 5): a stepper of all five, and a card for the active one with its
// sourced figure, or a plain note when no sourced figure exists yet.
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const col = document.createElement('div');
  col.className = 'c-col';
  const list = document.createElement('div');
  list.className = 'c-steps';
  steps = content.responses.map((r, i) => {
    const row = document.createElement('div');
    row.className = 'c-step';
    row.innerHTML = `<b>0${i + 1}</b><span>${r.title}</span>`;
    list.append(row);
    return row;
  });
  card = document.createElement('div');
  card.className = 'c-card';
  col.append(list, card);
  side = document.createElement('div');
  side.className = 'c-side';
  scene.slide.append(col, side);
};

// Step 0: the framework (Sanjoy's ppt.pdf); steps 1-5: one response each, with its extra panel.
const box = (b, cls = '') => `<div class="c-box ${cls}"><b>${b.t}</b><span>${b.s}</span></div>`;
const framework = (f) =>
  `<div class="c-frame">${box(f.top, 'top')}<i></i><div class="pair">${f.groups.map((g) => box(g)).join('')}</div>${box(f.network)}<i></i>${box(f.goals, 'goals')}</div>`;
const fuel = (f) =>
  `<div class="c-fuel"><div class="t">${f.title}</div><div class="s">${f.sub}</div>${f.bars
    .map((b) => `<div class="bar"><span>${b.k}</span><em>${b.v}%</em><i><u style="width:${b.v}%"></u></i></div>`)
    .join('')}<div class="save">${f.saving}</div><div class="n">${f.note}</div></div>`;
const compare = (c) => `<div class="c-vs">${c.map((x) => `<div><b>${x.k}</b><span>${x.l}</span></div>`).join('')}</div>`;
const outlook = (o) =>
  `<div class="c-out"><div class="t">${o.title}</div>${o.rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('')}<div class="n">${o.source}</div></div>`;
const example = (e) =>
  `<div class="c-ex"><div class="t">${e.title}</div><svg viewBox="0 0 320 120" aria-hidden="true"><path d="M30 60 H290"/><circle class="hub" cx="110" cy="60" r="10"/><circle class="hub" cx="210" cy="60" r="10"/>${[
    [70, 18], [70, 102], [150, 102], [250, 18], [250, 102], [170, 18],
  ]
    .map(([x, y]) => `<line x1="${x < 160 ? 110 : 210}" y1="60" x2="${x}" y2="${y}"/><circle cx="${x}" cy="${y}" r="5"/>`)
    .join('')}<text x="160" y="52">mainliner</text></svg><ul class="pts">${e.points.map((t) => `<li>${t}</li>`).join('')}</ul><div class="n">${e.source}</div></div>`;

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  steps.forEach((row, i) => {
    row.classList.toggle('on', i === step - 1);
    row.classList.toggle('past', i < step - 1);
  });
  prop?.go(step, !active);
  if (step === 0) {
    side.innerHTML = '';
    card.innerHTML = framework(content.framework);
    return;
  }
  const r = content.responses[step - 1];
  const n = r.number == null ? null : content.keyNumbers[r.number];
  side.innerHTML = (r.fuel ? fuel(r.fuel) : '') + (r.compare ? compare(r.compare) : '') + (r.outlook ? outlook(r.outlook) : '') + (r.example ? example(r.example) : '');
  card.innerHTML =
    `<div class="line">${r.line}</div>` +
    (r.points ? `<ul class="pts">${r.points.map((t) => `<li>${t}</li>`).join('')}</ul>` : '') +
    (n ? `<div class="fig"><div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${n.label}</div><div class="n">${n.note}</div></div>` : '') +
    (r.close ? `<div class="close">${r.close}</div>` : '');
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
