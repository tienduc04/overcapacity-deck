import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-500.css';
import '@fontsource/inter/latin-400.css';
import './hud/hud.css';
import gsap from 'gsap';
import { createDeck } from './core/deck.js';
import { createRenderer } from './core/renderer.js';
import { createFallback, loadPlate } from './core/fallback.js';
import { TIERS, gpuName, pickTier } from './core/quality.js';
import { createHud } from './hud/hud.js';
import { scenes } from './scenes/index.js';

const params = new URLSearchParams(location.search);
const body = document.body;

// ?webgl=0 forces the no-WebGL path (rehearsal and tests).
const probe = params.get('webgl') === '0' ? null : document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
const gpu = probe ? gpuName(probe) : null;
probe?.getExtension('WEBGL_lose_context')?.loseContext();
const tierName = pickTier(location.search, gpu);
const tier = TIERS[tierName];

await document.fonts.load('800 44px Montserrat'); // placeholder plates draw text with it
const plates = await Promise.all(scenes.map((s, i) => loadPlate(i + 1, s.title)));
const canvas = document.getElementById('gl');
// Live 3D worlds need WebGL and motion; the low tier and the fallback keep the still plates.
const live = gpu && tier.liveScale ? await Promise.all(scenes.map((s) => s.world?.() ?? null)) : [];
let view = gpu ? createRenderer(canvas, plates, tier, { still: scenes.map((s) => s.still), live }) : null;
if (!view) {
  canvas.remove();
  view = createFallback(document.getElementById('plates'), plates);
}
Object.assign(body.dataset, { tier: tierName, renderer: view.kind, gpu: gpu ?? 'none' });

const deck = createDeck(scenes.map((s) => ({ steps: s.content.steps })));
const hud = createHud(document.getElementById('stage'), { total: scenes.length, onPrev: () => apply(deck.prev()), onNext: () => apply(deck.next()) });
scenes.forEach((s, index) => s.init({ hud, view, tier, index }));

let running = null; // { tl, visual } of the transition on screen
let sceneStart = performance.now();
const startTime = performance.now();

function markPosition() {
  const { scene, step } = deck.state;
  Object.assign(body.dataset, { scene: scenes[scene].id, step });
  hud.setPosition(scene, step, deck.steps(scene));
}

function finishRunning() {
  if (!running) return;
  const r = running;
  r.visual?.skip();
  r.tl.progress(1);
}

function apply(ev) {
  if (!ev) return;
  if (ev.type === 'skip') return finishRunning();
  if (ev.type === 'step') {
    scenes[ev.scene].reveal(ev.step);
    return markPosition();
  }
  // ev.type === 'scene'
  finishRunning();
  const from = scenes[ev.from];
  const to = scenes[ev.to];
  const type = ev.direction > 0 ? to.transition : from.transition; // going back replays the transition we came through
  to.reveal(ev.step);
  const tl = gsap.timeline();
  from.exit(tl);
  // Lead-in: the leaving world plays a camera move first (on tl, so a skip finishes it); the shader
  // transition and the new slide follow it.
  const lead = from.leadOut?.(tl, ev) ?? 0;
  const inner = gsap.timeline();
  to.enter(inner);
  tl.add(inner, lead);
  const r = { tl };
  running = r;
  body.dataset.transition = 'running';
  sceneStart = performance.now();
  markPosition();
  const start = () =>
    (r.visual = view.transition(ev.from, ev.to, {
      type,
      liveFrom: lead > 0,
      onDone: () => {
        tl.progress(1);
        deck.done();
        if (running === r) running = null;
        body.dataset.transition = 'idle';
        to.arrive?.(ev.direction); // the new world can animate now: it is no longer held for the shader
      },
    }));
  if (!lead) return start();
  const wait = gsap.delayedCall(lead, start);
  r.visual = {
    skip() {
      wait.kill();
      start().skip();
    },
  };
}

// Initial scene: no transition.
view.show(0);
scenes[0].reveal(0);
scenes[0].enter(gsap.timeline().progress(1));
markPosition();

// Controls. Everything works with keys, click and the on-screen buttons (no hover-only UI).
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (hud.isOpen('backup') && key !== 'b' && key !== 'Escape') return; // overlay captures navigation
  if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') apply(deck.next());
  else if (key === 'ArrowLeft' || key === 'PageUp') apply(deck.prev());
  else if (key === 's') apply(deck.skip());
  else if (key === 'b') hud.toggle('backup');
  else if (key === 'Escape') hud.toggle('backup', false);
  else if (key === 't') hud.toggle('timer');
  else if (key === 'd') hud.toggle('debug');
  else if (key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  else if (key >= '1' && key <= String(scenes.length)) apply(deck.jump(Number(key) - 1));
  else return;
  e.preventDefault();
});
addEventListener('click', (e) => {
  if (e.target.closest('button, a, input, select, .overlay-backup')) return;
  apply(deck.next());
});

// Pointer tilt (decorative; the deck never needs the mouse). The CSS fallback has none.
addEventListener('pointermove', (e) => view.tilt?.((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2));

const resize = () => view.resize(innerWidth, innerHeight);
addEventListener('resize', resize);
resize();

// One loop for rendering, timer and debug overlay.
let frames = 0;
let fpsAt = performance.now();
let fps = 0;
function loop(now) {
  view.render(now / 1000);
  frames++;
  if (now - fpsAt >= 500) {
    fps = (frames * 1000) / (now - fpsAt);
    frames = 0;
    fpsAt = now;
    hud.updateDebug([`tier     ${tierName}`, `renderer ${view.kind}`, `fx       ${view.fx ?? 'css'}`,`fps      ${fps.toFixed(0)}`, `gpu      ${gpu ?? 'none'}`, `scene    ${body.dataset.scene} step ${body.dataset.step}`]);
  }
  const { scene } = deck.state;
  hud.updateTimer((now - startTime) / 1000, (now - sceneStart) / 1000, scenes[scene].content.budgetSec);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
