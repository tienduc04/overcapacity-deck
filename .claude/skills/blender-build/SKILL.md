---
name: blender-build
description: Build or change a 3D model for the deck with the Blender scripts in scripts/blender/ (build_*.py → public/models/*.glb), then check it with an EEVEE preview that shows real materials and the deck's HDR. Use for any new or reworked Blender model, scene asset or "make the 3D look better" request in this repo.
---

# Blender build loop for the overcapacity deck

Models are code: one headless Blender script per asset, so every GLB can be rebuilt. Never hand-edit a GLB.

## The loop

1. **Reference first.** Before modelling, write down 3-5 traits of the real object (proportions, silhouette, materials,
   colours) and the camera it will be seen from in the deck (`CAM`/poses in `src/world/<world>.js`). Model only what that
   camera sees.
2. **Script.** `scripts/blender/build_<name>.py`, using `kit.py` (`srgb`, `material`, `link`, `box`). Add an npm script
   `build:<name>` like the others in package.json.
3. **Build:** `npm run build:<name>` (writes `public/models/<name>.glb`; optional 2nd arg = Workbench preview dir, shape only).
4. **Look-dev preview (required):** EEVEE with materials, lit by `public/env/umhlanga_sunrise_1k.hdr`:
   ```
   "%LOCALAPPDATA%\Programs\Blender\blender-5.3.0-windows-x64\blender.exe" -b --factory-startup --python scripts/blender/preview_eevee.py -- public/models/<name>.glb <scratch dir> [px,py,pz:tx,ty,tz ...]
   ```
   Short form: `npm run preview:glb -- public/models/<name>.glb <scratch dir> [cams]`.
   Pass the deck camera(s) in three.js coordinates (y up) so the preview matches the slide. Without cameras it renders
   front, three-quarter and high views. Read `<scratch dir>/sheet.png` and judge it against step 1 before going on.
   Takes ~7 s for a small model, ~30 s for the harbour on the RTX 3050.
5. **In the deck:** load it in `src/world/<world>.js`, then check in the browser at `?q=high` and run `npx vitest run`
   and `npx playwright test` (the FPS test logs the transition dip; keep it above ~60 on high).
6. Add the model to `docs/third-party-assets.md` (own work or licence + credit) and a line in HANDOFF.md. Commit; never push.

## Rules that keep it looking good

- **Axes:** Blender z up, glTF/three.js y up; three.js z = -Blender y. Keep shared numbers (radii, heights) in one place
  and mirror them in the JS file with a comment, as `ARC` in bridge.js does.
- **Edges catch light:** bevel visible hard edges (bevel modifier, 2 segments, or chamfered `box` geometry) and use
  weighted normals; a perfectly sharp box reads as a toy.
- **Materials:** roughness 0.35-0.8 for painted steel, metal 0.0-0.3 unless it is bare metal; colours through `srgb()`.
  Emission only for real light sources, and it must stay under the world's bloom threshold unless it should glow.
- **Detail where the camera is:** spend faces on silhouettes and near objects; far objects are boxes. Watch the GLB size
  (the harbour is ~30k faces / 4.2 MB, a sensible ceiling per scene).
- **Variation:** repeated objects (containers, windows, cranes) need colour, height or wear variation from a seeded RNG.
- **The preview is not the final look:** three.js adds haze, bloom, its own lights and some procedural shaders (e.g. the
  propeller bronze in prop.js). Use the preview for shape, proportion and base materials; judge the final look in the deck.
- **Branding:** "HAPAG-LLOYD" lettering is allowed on ships and boxes in s01, s03, s07; never a logo file.
- **Assets from outside** (Poly Haven, Sketchfab): ask before downloading, record the licence, prefer CC0.
