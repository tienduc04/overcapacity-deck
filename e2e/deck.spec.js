import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = join(import.meta.dirname, 'shots');
const content = ['01', '02', '03', '04', '04b', '05', '06', '07'].map((n) => JSON.parse(readFileSync(`content/s${n}.json`, 'utf8'))); // talk order

// Page errors and any request leaving localhost (the build must run offline).
function watch(page) {
  const seen = { errors: [], external: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('request', (r) => {
    if (!/^(http:\/\/localhost:4174|data:|blob:)/.test(r.url())) seen.external.push(r.url());
  });
  return seen;
}
const body = (page) => page.locator('body');
const idle = (page) => expect(body(page)).toHaveAttribute('data-transition', 'idle');
const headline = (page, i) => page.locator(`.slide[data-scene="${content[i].id}"] .headline`);
const at = async (page, i, step) => {
  await expect(body(page)).toHaveAttribute('data-scene', content[i].id);
  await expect(body(page)).toHaveAttribute('data-step', String(step));
};

test('Right through all 8 scenes and back; headlines, screenshots, offline', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/');
  await at(page, 0, 0);
  for (let i = 0; i < content.length; i++) {
    const steps = content[i].steps ?? 3;
    for (let s = 1; s < steps; s++) {
      await page.keyboard.press('ArrowRight');
      await at(page, i, s);
    }
    await expect(headline(page, i)).toHaveText(content[i].headline);
    await expect(headline(page, i)).toBeVisible();
    await page.waitForTimeout(500); // let the step reveal fade finish before the screenshot
    await page.screenshot({ path: join(SHOTS, `scene${i + 1}.png`) });
    if (i < content.length - 1) {
      await page.keyboard.press('ArrowRight');
      await at(page, i + 1, 0);
      await page.keyboard.press('s'); // skip the transition
      await idle(page);
    }
  }
  await page.keyboard.press('ArrowRight'); // end of deck: nothing happens
  await at(page, content.length - 1, (content.at(-1).steps ?? 3) - 1);

  for (let i = content.length - 1; i > 0; i--) {
    for (let s = (content[i].steps ?? 3) - 1; s > 0; s--) {
      await page.keyboard.press('ArrowLeft');
      await at(page, i, s - 1);
    }
    await page.keyboard.press('ArrowLeft');
    await at(page, i - 1, (content[i - 1].steps ?? 3) - 1); // back = fully revealed
    await page.keyboard.press('s');
    await idle(page);
    await expect(headline(page, i - 1)).toBeVisible();
  }
  expect(seen.errors).toEqual([]);
  expect(seen.external).toEqual([]);
});

test('every control works: Space, click, buttons, 1-8, S, T, D, B, Esc, F', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/');
  await at(page, 0, 0); // app booted (fonts + plates loaded)
  await page.keyboard.press(' '); // scene 1 has one step: Space moves on
  await at(page, 1, 0);
  await page.keyboard.press('s');
  await idle(page);
  await page.mouse.click(900, 500);
  await at(page, 1, 1);
  await page.getByRole('button', { name: 'Next' }).click();
  await at(page, 1, 2);
  await page.getByRole('button', { name: 'Previous' }).click();
  await at(page, 1, 1);

  for (const n of [5, 3, 8, 1]) {
    await page.keyboard.press(String(n));
    await at(page, n - 1, 0);
    await page.keyboard.press('s');
    await idle(page);
  }

  await page.keyboard.press('t');
  await expect(page.locator('.overlay-timer')).toBeVisible();
  await expect(page.locator('.overlay-timer')).toContainText('SCENE 00:0');
  await expect(page.locator('.overlay-timer')).toContainText('/ 00:40'); // s01 budgetSec
  await page.keyboard.press('d');
  await expect(page.locator('.overlay-debug')).toContainText(/tier\s+(low|med|high)/);
  await expect(page.locator('.overlay-debug')).toContainText(/fps\s+\d+/);

  await page.keyboard.press('b');
  await expect(page.locator('.overlay-backup')).toBeVisible();
  await page.keyboard.press('ArrowRight'); // blocked while the backup overlay is open
  await at(page, 0, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.overlay-backup')).toBeHidden();

  await page.keyboard.press('f'); // headless may refuse fullscreen; it must not throw
  await page.keyboard.press('t');
  await page.keyboard.press('d');
  await expect(page.locator('.overlay-timer')).toBeHidden();
  expect(seen.errors).toEqual([]);
});

// Scene n is entered through its own transition (scene 2 zoomBlur ... scene 8 dockFade).
const TRANSITION_SECONDS = { 2: 1.6, 3: 1.8, 4: 2.0, 5: 1.8, 6: 2.0, 7: 2.2, 8: 2.4 };
const fromScene1 = async (page) => {
  await page.keyboard.press('1');
  await page.keyboard.press('s');
  await idle(page);
  await at(page, 0, 0);
};

test('each transition compiles, finishes on its own within 4 s, mid-frame screenshot', async ({ page }) => {
  const shaderErrors = [];
  page.on('console', (m) => /shader|webgl/i.test(m.text()) && m.type() === 'error' && shaderErrors.push(m.text()));
  await page.goto('/?q=med');
  await at(page, 0, 0);
  await page.mouse.move(1500, 300); // tilt on, as in a live talk
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    await fromScene1(page);
    await page.keyboard.press(String(n));
    const t0 = Date.now();
    await page.waitForTimeout(TRANSITION_SECONDS[n] * 450); // about 45 % through
    await page.screenshot({ path: join(SHOTS, `t0${n - 1}-0${n}-mid.png`) });
    await idle(page);
    expect(Date.now() - t0).toBeLessThan(4500);
    await at(page, n - 1, 0);
  }
  expect(shaderErrors).toEqual([]);
});

test('S skips every transition at once', async ({ page }) => {
  await page.goto('/');
  await at(page, 0, 0);
  for (const n of [2, 3, 4, 5, 6, 7]) {
    await fromScene1(page);
    await page.keyboard.press(String(n));
    await page.waitForTimeout(200);
    const t0 = Date.now();
    await page.keyboard.press('s');
    await idle(page);
    expect(Date.now() - t0).toBeLessThan(600);
  }
});

test('no-WebGL fallback: same controls, plates as CSS', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/?webgl=0');
  await expect(body(page)).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#gl')).toHaveCount(0);
  await at(page, 0, 0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await at(page, 1, 0);
  await idle(page); // CSS crossfade ends on its own
  await page.keyboard.press('6');
  await page.keyboard.press('s');
  await idle(page);
  await expect(headline(page, 5)).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'fallback-s06.png') });
  expect(seen.errors).toEqual([]);
});

const countFps = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (t) => (t - t0 < ms ? (n++, requestAnimationFrame(tick)) : done(Math.round((n * 1000) / (t - t0))));
        requestAnimationFrame(tick);
      }),
    ms
  );

test('FPS per tier, at rest and during each transition (logged for docs/machine-report.md)', async ({ page }) => {
  test.setTimeout(120_000);
  const result = {};
  for (const q of ['low', 'med', 'high']) {
    await page.goto(`/?q=${q}`);
    await at(page, 0, 0);
    await page.mouse.move(1400, 400);
    await page.waitForTimeout(800);
    const live = await countFps(page, 2000); // scene 1: the live 3D world
    const during = {};
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      await fromScene1(page);
      await page.keyboard.press(String(n));
      during[n] = await countFps(page, 1200); // every transition lasts at least 1.6 s
      await idle(page);
    }
    await page.waitForTimeout(500);
    const rest = await countFps(page, 2000);
    await page.keyboard.press('2');
    await page.keyboard.press('s');
    await idle(page);
    await page.waitForTimeout(500);
    const live2 = await countFps(page, 2000); // scene 2: inside the container
    result[q] = { live, live2, rest, during, minDuring: Math.min(...Object.values(during)) };
  }
  const gpu = await page.evaluate(() => document.body.dataset.gpu);
  console.log(`[fps] ${JSON.stringify(result)} on ${gpu}`);
  expect(result.med.rest).toBeGreaterThanOrEqual(55);
  expect(result.med.live).toBeGreaterThanOrEqual(55); // scene 1 as a live 3D world
  expect(result.med.live2).toBeGreaterThanOrEqual(55);
  expect(result.med.minDuring).toBeGreaterThanOrEqual(55); // recommended tier keeps 60 FPS headroom
});

test('scenes 1 and 2 are live 3D worlds: frames change, no WebGL errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?q=med');
  await at(page, 0, 0);
  await page.waitForTimeout(1500);
  const a = await page.screenshot({ path: join(SHOTS, 'live-s01-a.png') });
  await page.waitForTimeout(2000);
  const b = await page.screenshot({ path: join(SHOTS, 'live-s01-b.png') });
  expect(a.equals(b)).toBe(false); // waves, ship and camera move on their own
  await page.keyboard.press('2'); // the transition out of a live world works like a plate
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, 'live-s01-to-s02.png') });
  await idle(page);
  await page.waitForTimeout(500);
  const c = await page.screenshot({ path: join(SHOTS, 'live-s02-a.png') });
  await page.waitForTimeout(2000);
  const d = await page.screenshot({ path: join(SHOTS, 'live-s02-b.png') });
  expect(c.equals(d)).toBe(false); // dust, door, sea and camera move
  expect(errors).toEqual([]);
});
