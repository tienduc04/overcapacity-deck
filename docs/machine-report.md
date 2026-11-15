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
| Blender | **Not found**: not on PATH, not in `C:\Program Files\Blender Foundation`, `%LOCALAPPDATA%\Programs`, Steam or WinGet |
| ffmpeg / ffprobe | **Not found**: not on PATH, not in WinGet packages, not under `C:\Program Files` |

Blender is only needed for Phase 6 (optional) and ffmpeg for Phase 3 (clip encoding). Both need
an install outside this folder, so they wait for your approval. Options:
`winget install Gyan.FFmpeg` and `winget install BlenderFoundation.Blender`, or the portable zips
unpacked into `tools/` inside this project (no system change).

## Phase 1 measurements
_Filled in after the Phase 1 build (see below)._
