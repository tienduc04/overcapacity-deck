import { createScene } from './scene.js';
import content from '../../content/s05.json';

let prop = null; // the live world, when this tier renders one
const world = () =>
  import('../world/prop.js')
    .then((m) => m.createPropWorld())
    .then((w) => (prop = w));

const scene = createScene({ title: 'Carriers', speaker: 'Speaker D', transition: 'bubbles', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps
let steps = [];
let card = null;

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
  scene.slide.append(col);
};

scene.reveal = (step) => {
  base.reveal(step);
  const r = content.responses[step];
  steps.forEach((row, i) => {
    row.classList.toggle('on', i === step);
    row.classList.toggle('past', i < step);
  });
  const n = r.number == null ? null : content.keyNumbers[r.number];
  card.innerHTML =
    `<div class="line">${r.line}</div>` +
    (n
      ? `<div class="fig"><div><span class="v">${n.value}</span><span class="u">${n.unit}</span></div><div class="l">${n.label}</div><div class="n">${n.note}</div></div>`
      : `<div class="tbd">${content.noFigure}</div>`);
  prop?.go(step, !active);
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
