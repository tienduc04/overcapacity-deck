import { createScene } from './scene.js';
import content from '../../content/s06.json';

let bridge = null; // the live world, when this tier renders one
const world = () =>
  fetch('data/scenarios.json')
    .then((r) => r.json())
    .then((data) => import('../world/bridge.js').then((m) => m.createBridgeWorld({ ...data, stress: content.stress, robustness: content.robustness })))
    .then((w) => (bridge = w));

const scene = createScene({ title: 'Scenarios 2030', speaker: 'Tien Duc', transition: 'glassCrash', content, world });
const base = { init: scene.init, reveal: scene.reveal, enter: scene.enter, exit: scene.exit };
let active = false; // on screen: steps animate; arriving from another scene jumps

const COLOUR = { optimistic: '#22d6e6', base: '#f4f1ec', downside: '#ff6a4a' };
const div = (cls, html = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });

// Step 0: how it is built (pipeline), the inputs and the definition. 1: the fan. 2: the three scenarios, with a
// button for their assumptions. 3: reverse stress test. 4: robustness, signposts and limits. The screens in the bridge follow the step (see world/bridge.js).
scene.init = (ctx) => {
  base.init.call(scene, ctx);
  const pipe = div('v-pipe', content.pipeline.map((p, i) => `<div><b>0${i + 1} ${p.k}</b><span>${p.v}</span><p>${p.l}</p></div>`).join(''));
  const panel = div('v-panel');
  panel.append(
    div('v-def', content.definition),
    div('v-table', content.inputs.map((r) => `<div class="v-row"><b>${r.k}</b><span>${r.v}<u>${r.tag}</u><i>${r.by}</i></span></div>`).join('')),
    div('v-fan', `<div><span class="v">${content.fan.value}</span><span class="u">${content.fan.unit}</span></div><div class="l">${content.fan.label}</div><div class="n">${content.fan.note}</div><div class="ins">${content.fan.insight}</div>`)
  );

  const cards = div('v-cards');
  content.scenarios.forEach((s, i) => {
    const k = content.keyNumbers[i];
    const a = content.assumptions[s.id];
    cards.append(
      div(
        'v-card',
        `<h3>${s.name}<span>${s.sub}</span></h3><div class="n">${k.value}<small>PP IN 2030</small></div>` +
          `<div class="v-story"><p>${s.story}</p><div class="act"><b>Carriers: </b>${s.act}</div></div>` +
          `<dl class="v-drivers">${Object.entries(a).map(([n, v]) => `<dt>${n}</dt><dd>${v}</dd>`).join('')}</dl>`
      )
    );
    cards.lastChild.style.setProperty('--c', COLOUR[s.id]);
  });
  const toggle = document.createElement('button');
  toggle.className = 'v-toggle';
  toggle.textContent = 'Show assumptions';
  toggle.addEventListener('click', () => {
    const on = scene.slide.dataset.show !== 'drivers';
    scene.slide.dataset.show = on ? 'drivers' : '';
    toggle.textContent = on ? 'Show stories' : 'Show assumptions';
  });
  const spread = div('v-spread', content.spread);
  const st = content.stress;
  const stress = div(
    'v-stress',
    `<h4>${st.title}</h4><div class="v-sgrid">${st.items.map((i) => `<div><b>${i.k}</b><span>${i.needText}</span><p>${i.needLabel}</p><em>${i.verdict}</em></div>`).join('')}</div>` +
      `<div class="v-combo">${st.combo} <strong>${st.reading}</strong></div>`
  );
  const sign = div('v-sign');
  sign.append(
    div('v-box ok', `<h4>Robustness</h4><p>${content.robustness.summary}</p>`),
    div('v-box', `<h4>Signposts to watch</h4><ul>${content.signposts.map((t) => `<li>${t}</li>`).join('')}</ul>`),
    div('v-box lim', `<h4>Limits</h4><ul>${content.limits.map((t) => `<li>${t}</li>`).join('')}</ul>`)
  );
  scene.slide.append(pipe, panel, cards, toggle, spread, stress, sign);
};

scene.reveal = (step) => {
  base.reveal(step);
  scene.slide.dataset.at = step;
  bridge?.go(step, !active);
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
