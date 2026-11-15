# Machine report

Profiled 2026-11-15 (read-only commands; nothing installed outside the project).

## Hardware and runtime
| Item | Value |
|---|---|
| OS | Windows 11 Home Single Language 10.0.26200, 64-bit |
| CPU | Intel Core i5-12450HX, 8 cores / 12 threads |
| RAM | 15.7 GB |
| GPU 1 | NVIDIA GeForce RTX 3050 6 GB Laptop (driver 32.0.16.1742) |
| GPU 2 | Intel UHD Graphics, Alder Lake-HX (driver 32.0.101.7080) |
| Display | 1920×1080 @ 144 Hz |
| Node / npm | v22.23.3 / 10.9.9 |
| Chrome | 157.0.8103.51 |
| WebGL2 in Chrome | Yes, but on the **Intel UHD** (`ANGLE (Intel, Intel(R) UHD Graphics (0x0000468B) Direct3D11)`), not the RTX 3050 |

Chrome on this hybrid laptop renders WebGL on the integrated GPU. To use the RTX, set Chrome to
"High performance" in Windows Settings → System → Display → Graphics (a system setting: do it
yourself; the deck does not need it).

## Quality tiers
`src/core/quality.js`, override with `?q=low|med|high`.

| Tier | Pixel ratio cap | Ken Burns / parallax | Shader detail | Meant for |
|---|---|---|---|---|
| low | 1.0 | off | 0.5 | unknown projector laptop, software WebGL |
| med | 1.0 | on | 1.0 | Intel UHD / Iris Xe at 1080p |
| high | 2.0 | on | 1.0 | discrete GPU or HiDPI screen |

Auto-pick: software renderer → low; NVIDIA / AMD RX / Apple M → high; Intel Iris/Arc, AMD
integrated → med; older Intel UHD/HD → low.

**Recommended default for this machine: `med`** (open with `?q=med`). Measured FPS is in the
Phase 1 section below. The auto-pick says `low` for this UHD, which is the safe choice for an
unknown projector laptop.

## Tools
| Tool | Status |
|---|---|
| Higgsfield MCP | **Connected** (`claude.ai Higgsfield2`, https://mcp.higgsfield.ai/mcp) |
| Figma MCP | **Not connected** (not in `claude mcp list`) |
| Playwright MCP | Connected (not needed: the project uses `@playwright/test` with installed Chrome) |
| Blender | **Installed 2026-11-15** (owner approved): 5.3.0 portable zip from download.blender.org, SHA-256 checked, in `%LOCALAPPDATA%\Programs\Blender\blender-5.3.0-windows-x64\` (winget only offers a machine-wide MSI). `npm run build:ship` rebuilds the ship |
| ffmpeg / ffprobe | **Installed 2026-11-15**: ffmpeg 9.0.2 full build, `winget install Gyan.FFmpeg --scope user` (owner approved). Exe in `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-9.0.2-full_build\bin\`; on PATH in new terminals |

Blender builds the 3D objects for the live scenes (direction change of 2026-11-15, see HANDOFF).

## Phase 1 measurements
2026-11-15, `npm run e2e` (production build, Chrome 157 headless, 1920×1080, Intel UHD):

| Tier | FPS (crossfade skeleton, placeholder plates) |
|---|---|
| low | 144 |
| med | 144 |
| high | 144 |

All tiers hit the 144 Hz display cap: a full-screen plate quad plus a crossfade is cheap. The tiers
only start to differ once the Phase 3 shaders, Ken Burns and parallax exist; re-measure then.
The `med` recommendation stands until those numbers are in.

## Phase 3 measurements
2026-11-15, `npx playwright test` (Vite preview build, Chrome 157 headless, 1920×1080, Intel UHD,
pointer tilt on). FPS at rest and the lowest FPS while each transition runs (1.2 s sample from
scene 1 into scene n):

| Tier | At rest | zoomBlur | laserScan | radarWipe | bubbles | glassCrash | dockFade | Lowest |
|---|---|---|---|---|---|---|---|---|
| low | 144 | 86 | 115 | 113 | 79 | 71 | 117 | 71 |
| med | 144 | 73 | 116 | 115 | 78 | 69 | 116 | 69 |
| high | 144 | 71 | 117 | 112 | 80 | 74 | 111 | 71 |

- Every transition stays above 60 FPS on the integrated GPU, so the governor never steps in.
  glassCrash (two Voronoi lookups per pixel) and bubbles are the heaviest.
- At rest the renderer switches back to the crossfade shader, so idle cost is unchanged.
- Headless Chrome reports devicePixelRatio 1, so `high` renders the same pixel count as `med`
  here; on a HiDPI screen `high` draws 4× the pixels. The `med` recommendation stands.
- The e2e test fails if `med` drops below 55 FPS at rest or during any transition.

## Live 3D scene 1 (prototype)
2026-11-15, same setup. Scene 1 is a live world (`src/world/hero.js`: baked sunset sky, Gerstner
ocean, Blender ship from `scripts/blender/build_ship.py`) rendered into an HDR target.

| Tier | Scene 1 live | Lowest during a transition | Live world resolution |
|---|---|---|---|
| low | 144 (still plate, no 3D) | 69 | none |
| med | 72 | 58 (zoomBlur, out of the live world) | 75 % of the screen |
| high | 53 | 62 | 100 % × pixel ratio |

What got it there (first build ran at 35 FPS on med):
- Sky baked once into a cube map and drawn as the background; prefiltered once (PMREM).
- Containers export only faces that can be seen (14k faces instead of 22k, much less overdraw).
- The live world renders at 75 % resolution on med (the iGPU is fill-rate bound: 720p ran at 141).
- During a transition the live world is drawn once and held; zoomBlur uses 12 taps.

`high` is below 60 here because it renders the world at full resolution on the Intel UHD; on a
discrete GPU it has headroom. Keep `med` on this laptop. The e2e test fails if `med` drops
below 55 FPS in scene 1.

## Chrome on the RTX 3050 (2026-11-15)
The owner set Chrome to "High performance" in Windows Graphics settings
(`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`: `chrome.exe` → `GpuPreference=2`).
A fresh Chrome now reports `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 6GB Laptop GPU ...)`, and the
auto-pick chooses `high`. FPS test, all tiers: 144 live in scene 1, 141 or more during every
transition (display cap). There is now headroom for textures, baked lighting and post effects;
the Intel UHD numbers above remain the floor for an unknown presentation laptop.
