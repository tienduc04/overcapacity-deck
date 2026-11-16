# Third-party assets

All from [Poly Haven](https://polyhaven.com), licence **CC0** (public domain, no attribution
required; credited here anyway). Downloaded 2026-11-15 with the owner's approval, MD5 checked
against the Poly Haven API. Source files live in `assets-src/polyhaven/` (gitignored); only
processed versions baked into `public/models/*.glb` ship with the deck.

| Asset | Page | Authors | Used for | Files (1K) |
|---|---|---|---|---|
| Container Side | https://polyhaven.com/a/container_side | Dimitrios Savva | Container walls (corrugation, wear) | `container_side_diff_1k.jpg` (md5 af4c3140…)<br>`container_side_nor_gl_1k.jpg` (md5 4162f65b…)<br>`container_side_arm_1k.jpg` (md5 5ae1b41a…) |
| Rusty Painted Metal | https://polyhaven.com/a/rusty_painted_metal | Amal Kumar | Hull, antifouling, superstructure, funnel; scene 2 container walls, frame and door (re-tinted) | `rusty_painted_metal_diff_1k.jpg` (md5 3846f556…)<br>`rusty_painted_metal_nor_gl_1k.jpg` (md5 b5a2c2b0…)<br>`rusty_painted_metal_arm_1k.jpg` (md5 fdbc2e55…) |
| Metal Plate 02 | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | Deck and hatch covers | `metal_plate_02_diff_1k.jpg` (md5 531b7e06…)<br>`metal_plate_02_nor_gl_1k.jpg` (md5 ce819800…)<br>`metal_plate_02_arm_1k.jpg` (md5 ff6e0499…) |
| Umhlanga Sunrise | https://polyhaven.com/a/umhlanga_sunrise | Greg Zaal | Image lighting for the ship (sky backdrop stays procedural) | `umhlanga_sunrise_1k.hdr` (md5 9fb1501b…) |

Scene 2 (`public/models/container.glb`, `scripts/blender/build_container.py`) is built in Blender; its
plywood floor grain is procedural (shader), the quay is plain concrete colour.

Not used: the Higgsfield SAM 3D ship test (see credit-ledger.md).

## Sketchfab (CC-BY-4.0: attribution required, shown in scene 1's footer via `credits` in content/s01.json)

| Asset | Page | Author | Used for | File |
|---|---|---|---|---|
| Container Ship | https://sketchfab.com/3d-models/container-ship-aaa41cca946b4a08bc08cf692b7757be | RM02 (https://sketchfab.com/RM02) | Scene 1 ship (`public/models/ship-rm02.glb`) | `assets-src/models/rm02/container_ship.glb`, 4K textures, 35,454,960 bytes, md5 b020b409… (downloaded 2026-11-15 with the owner's approval, owner's Sketchfab login) |

Changed by `scripts/rebrand_rm02.py` (CC-BY allows changes; say so in the credit): real carriers' marks
erased from the hull and container textures, yellow boxes repainted orange, HAPAG-LLOYD lettered on
the hull and the orange boxes, textures reduced to 2K. Credit line: *"Container Ship" by RM02,
CC BY 4.0, modified.* The Blender ship (`public/models/ship.glb`) is still used in scene 2.

| Natural Earth 1:10m land | https://www.naturalearthdata.com | Natural Earth (public domain) | Scene 4 coastlines, clipped and simplified by `scripts/build-land.py` | `public/data/land.json` (source `assets-src/geo/ne_10m_land.geojson`, not committed) |

| Propeller (own work) | - | this project | Scene 5 propeller, lofted airfoil blades built by `scripts/blender/build_propeller.py` (`npm run build:propeller`) | `public/models/propeller.glb` (no third-party asset) |
| Ship bridge (own work) | - | this project | Scene 6 bridge: room, curved console, chairs, screen bezels, built by `scripts/blender/build_bridge.py` (`npm run build:bridge`) | `public/models/bridge.glb` (no third-party asset) |
| Harbour (own work) | - | this project | Scene 7 harbour at dawn: brick warehouses, quay, container terminal with cranes, built by `scripts/blender/build_harbour.py` (`npm run build:harbour`) | `public/models/harbour.glb` (no third-party asset) |
