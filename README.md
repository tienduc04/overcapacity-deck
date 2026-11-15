# Overcapacity in Container Shipping – 3D web slide deck

Brief and source of truth: [HANDOFF.md](HANDOFF.md) (storyboard, rules, phases, Gemini plate prompts).

KLU, "Connecting the World Across Oceans". Vite + Three.js + GSAP, plain JS, runs offline.

## Run
```
npm run dev             # http://localhost:5173
npm run build           # dist/ (always works, even with sample content)
npm run build:final     # check:content, then build; fails until every number is verified
npm run check:content   # list what is not ready in content/*.json
npm test                # Vitest: content checker + navigation state machine
npm run e2e             # Playwright (installed Chrome): all scenes, controls, fallback, FPS
```
URL options: `?q=low|med|high` (quality tier), `?webgl=0` (no-WebGL fallback).

## Controls
→ / Space / PageDown / click / ▶ next step or scene · ← / PageUp / ◀ back · 1–7 jump ·
S skip transition · T timer · D debug · B backup overlay (Esc closes) · F fullscreen

## Layout
- `content/sNN.json` – slide text and numbers (status `verified | unverified | sample`)
- `src/core/` – `deck.js` state machine, `renderer.js` Three.js plates + transitions,
  `quality.js` tiers, `fallback.js` plates loading + no-WebGL path
- `src/scenes/` – one file per scene (contract in `scene.js`), `src/hud/` – HUD and styles
- `public/plates/sNN.jpg` – background plates (placeholder drawn if missing),
  `public/clips/` – transition clips (Phase 3), `assets-src/` – originals (not served, not in git)
- `assets/manifest.json` – every generated asset, `docs/credit-ledger.md` – Higgsfield credits,
  `docs/machine-report.md` – hardware, tools, tiers
