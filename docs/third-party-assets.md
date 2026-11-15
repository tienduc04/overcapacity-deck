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

Not used: the Higgsfield SAM 3D ship test (see credit-ledger.md); the ship is built in Blender.
