// HUD on a fixed 1920×1080 stage, scaled to fit the window. Builds one slide panel per scene
// from its content JSON, plus the nav buttons and the T / D / B overlays.

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pad = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
export const isSample = (c) => [...(c.keyNumbers ?? []), ...(c.chart ? [c.chart] : [])].some((x) => x.status === 'sample');

export function createHud(stage, { total, onPrev, onNext }) {
  const slides = el('div', 'slides');
  const counter = el('div', 'counter metric');
  const prevBtn = el('button', 'nav-btn', '◀');
  const nextBtn = el('button', 'nav-btn', '▶');
  prevBtn.setAttribute('aria-label', 'Previous');
  nextBtn.setAttribute('aria-label', 'Next');
  prevBtn.addEventListener('click', onPrev);
  nextBtn.addEventListener('click', onNext);
  const nav = el('nav', 'nav');
  nav.append(prevBtn, counter, nextBtn);

  const timer = el('div', 'overlay-timer metric');
  const debug = el('pre', 'overlay-debug');
  const backup = el('div', 'overlay-backup');
  backup.append(el('h2', '', 'Backup slides'), el('p', 'body-text', 'Placeholder: backup charts and Q&A material arrive in a later phase. Press B or Esc to close.'));
  for (const o of [timer, debug, backup]) o.hidden = true;
  stage.append(slides, nav, timer, debug, backup);

  // Fit the 1920×1080 stage into the window.
  const fit = () => stage.style.setProperty('--scale', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit);
  fit();

  // One slide per scene. Groups reveal in order; group g appears at step min(g, steps - 1).
  function mount(content, scene, index) {
    const slide = el('section', 'slide');
    slide.dataset.scene = content.id;
    slide.hidden = true;

    const top = el('header', 'slide-top');
    top.append(el('span', 'slide-brand', 'Hapag-Lloyd'), el('span', 'slide-no metric', `${pad(index + 1)} / ${pad(total)}`), el('span', 'slide-title', scene.title), el('span', 'slide-speaker', scene.speaker));
    slide.append(top);
    if (content.pending) slide.append(el('div', 'badge-pending', 'CONTENT PENDING'));
    if (isSample(content)) slide.append(el('div', 'watermark', 'SAMPLE DATA'));

    const groups = [];
    // Headline lines are masks for the hero's slide-up; an optional accent splits off the first line.
    const headline = el('h1', 'headline');
    const accent = content.headlineAccent;
    const lines = accent && content.headline.startsWith(accent) ? [accent, content.headline.slice(accent.length).trim()] : [content.headline];
    lines.forEach((text, i) => {
      const line = el('span', 'line');
      line.append(el('span', i === 0 && lines.length > 1 ? 'accent' : '', text));
      headline.append(...(i ? [' ', line] : [line]));
    });
    if (content.layout === 'hero') {
      slide.classList.add('slide--hero');
      const lead = el('div', 'hero-lead');
      lead.append(el('div', 'hero-tag mono-fx', content.tag), headline, el('p', 'hero-subtitle', content.subtitle));
      groups.push(lead);
      const course = el('div', 'hero-course');
      course.append(el('span', 'dot'), el('span', 'mono-fx', content.course));
      slide.append(course, el('div', 'hero-crew mono-fx', content.crew), el('div', 'hero-hint mono-fx', content.hint), el('div', 'pins'));
    } else groups.push(headline);
    if (content.keyNumbers?.length) {
      const row = el('div', 'numbers');
      for (const k of content.keyNumbers) {
        const card = el('div', `number-card glass number-card--${k.status}`);
        const value = el('div', 'number-value metric', String(k.value));
        value.append(el('span', 'number-unit', k.unit));
        card.append(value, el('div', 'number-label', k.label));
        if (k.status !== 'verified') card.append(el('div', 'number-status', k.status.toUpperCase()));
        row.append(card);
      }
      groups.push(row);
    }
    const side = [];
    if (content.chart) {
      const chart = el('div', 'chart glass');
      chart.append(el('div', 'chart-title', content.chart.title ?? 'Chart'), el('div', 'chart-body', `${content.chart.type ?? 'chart'} · ${content.chart.status}`));
      side.push(chart);
    }
    if (content.bullets?.length) {
      const ul = el('ul', 'bullets body-text');
      for (const b of content.bullets) ul.append(el('li', '', b));
      side.push(ul);
    }
    if (side.length) {
      const wrap = el('div', 'side');
      wrap.append(...side);
      groups.push(wrap);
    }
    const extra = [['Theory', content.theory], ['Case', content.case]].filter(([, t]) => t);
    if (extra.length) {
      const row = el('div', 'extra');
      for (const [label, text] of extra) {
        const card = el('div', 'extra-card glass');
        card.append(el('div', 'extra-label', label), el('p', 'body-text', text));
        row.append(card);
      }
      groups.push(row);
    }
    const steps = Math.max(1, content.steps ?? 3);
    groups.forEach((g, i) => {
      g.dataset.step = Math.min(i, steps - 1);
      slide.append(g);
    });

    const sources = [...(content.keyNumbers ?? []), ...(content.chart ? [content.chart] : [])]
      .filter((x) => x.source)
      .map((x) => `${x.source}${x.date ? `, ${x.date}` : ''}`);
    const notes = [sources.length && `Sources: ${[...new Set(sources)].join(' · ')}`, content.credits].filter(Boolean);
    if (notes.length) slide.append(el('footer', 'sources', notes.join(' · ')));
    slides.append(slide);
    return slide;
  }

  return {
    mount,
    showStep(slide, step) {
      for (const g of slide.querySelectorAll('[data-step]')) g.classList.toggle('is-hidden', Number(g.dataset.step) > step);
    },
    setPosition(index, step, steps) {
      counter.textContent = `${pad(index + 1)}/${pad(total)} · ${step + 1}/${steps}`;
      prevBtn.disabled = index === 0 && step === 0;
      nextBtn.disabled = index === total - 1 && step === steps - 1;
    },
    toggle(name, force) {
      const o = { timer, debug, backup }[name];
      o.hidden = force === undefined ? !o.hidden : !force;
      return !o.hidden;
    },
    isOpen: (name) => !{ timer, debug, backup }[name].hidden,
    // elapsed/sceneElapsed in seconds; over budget turns red. budgetSec 0 = no budget.
    updateTimer(elapsed, sceneElapsed, budgetSec) {
      if (timer.hidden) return;
      const text = `TOTAL ${mmss(elapsed)} · SCENE ${mmss(sceneElapsed)}${budgetSec ? ` / ${mmss(budgetSec)}` : ''}`;
      if (timer.textContent !== text) timer.textContent = text;
      timer.classList.toggle('is-over', budgetSec > 0 && sceneElapsed > budgetSec);
    },
    updateDebug(lines) {
      if (!debug.hidden) debug.textContent = lines.join('\n');
    },
  };
}
