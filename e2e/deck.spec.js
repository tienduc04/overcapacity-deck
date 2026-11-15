import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = join(import.meta.dirname, 'shots');
const content = [1, 2, 3, 4, 5, 6, 7].map((n) => JSON.parse(readFileSync(`content/s0${n}.json`, 'utf8')));

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

test('Right through all 7 scenes and back; headlines, screenshots, offline', async ({ page }) => {
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
    await page.screenshot({ path: join(SHOTS, `s0${i + 1}.png`) });
    if (i < content.length - 1) {
      await page.keyboard.press('ArrowRight');
      await at(page, i + 1, 0);
      await page.keyboard.press('s'); // skip the transition
      await idle(page);
    }
  }
  await page.keyboard.press('ArrowRight'); // end of deck: nothing happens
  await at(page, 6, (content[6].steps ?? 3) - 1);

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

test('every control works: Space, click, buttons, 1-7, S, T, D, B, Esc, F', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/');
  await at(page, 0, 0); // app booted (fonts + plates loaded)
  await page.keyboard.press(' ');
  await at(page, 0, 1);
  await page.mouse.click(900, 500);
  await at(page, 1, 0);
  await page.keyboard.press('s');
  await idle(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await at(page, 1, 1);
  await page.getByRole('button', { name: 'Previous' }).click();
  await at(page, 1, 0);

  for (const n of [5, 3, 7, 1]) {
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

test('a transition finishes on its own within 4 s', async ({ page }) => {
  await page.goto('/');
  await at(page, 0, 0);
  await page.keyboard.press('2');
  const t0 = Date.now();
  await idle(page);
  expect(Date.now() - t0).toBeLessThan(4500);
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

test('FPS per tier (logged for docs/machine-report.md)', async ({ page }) => {
  const result = {};
  for (const q of ['low', 'med', 'high']) {
    await page.goto(`/?q=${q}`);
    await at(page, 0, 0);
    await page.keyboard.press('2');
    await page.keyboard.press('s');
    await idle(page);
    await page.waitForTimeout(1000);
    result[q] = await page.evaluate(
      () =>
        new Promise((done) => {
          let n = 0;
          const t0 = performance.now();
          const tick = (t) => (t - t0 < 2000 ? (n++, requestAnimationFrame(tick)) : done(Math.round((n * 1000) / (t - t0))));
          requestAnimationFrame(tick);
        })
    );
  }
  const gpu = await page.evaluate(() => document.body.dataset.gpu);
  console.log(`[fps] ${JSON.stringify(result)} on ${gpu}`);
  expect(result.med).toBeGreaterThanOrEqual(55); // recommended tier keeps 60 FPS headroom
});
