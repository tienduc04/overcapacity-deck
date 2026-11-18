"""Build the small container ship that runs along the lanes on the scene 4 sea chart (src/world/map.js,
drawn as an InstancedMesh, so one mesh and one vertex-coloured material). Seen from ~100 units up at
~2 units long, only the silhouette counts: pointed bow, dark hull, rows of coloured boxes, white bridge aft.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_mapship.py -- public/models/mapship.glb
Or:              npm run build:mapship

Units: length 1 (bow at x = +0.5), Blender z up (glTF y up). map.js scales it and aligns +x with the lane.
"""
import os
import random
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import box, link, material, srgb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/mapship.glb"
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)

L, B, D = 1.0, 0.15, 0.07  # length, beam, hull depth
BOXES = ["#f37021", "#f37021", "#1d3c78", "#8a95a5", "#a8322a", "#e8e4dc"]  # Hapag orange most often

bm = bmesh.new()
col = bm.loops.layers.color.new("Col")


def paint(faces, hex_, k=1.0):
    c = tuple(v * k for v in srgb(hex_))
    for f in faces:
        for loop in f.loops:
            loop[col] = (*c, 1.0)


# Hull: deck outline with a pointed bow and a square stern, extruded down, slightly narrower at the keel.
outline = [(-0.5, -B / 2), (0.3, -B / 2), (0.44, -B / 4), (0.5, 0.0), (0.44, B / 4), (0.3, B / 2), (-0.5, B / 2)]
top = [bm.verts.new((x, y, D)) for x, y in outline]
bot = [bm.verts.new((x * 0.97, y * 0.8, 0.0)) for x, y in outline]
faces = [bm.faces.new(top)]
faces.append(bm.faces.new(list(reversed(bot))))
n = len(outline)
for i in range(n):
    faces.append(bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])))
bmesh.ops.recalc_face_normals(bm, faces=faces)
paint(faces[1:], "#2b2f36")
paint(faces[:1], "#5a1e1e")  # deck seen between the stacks: red-brown
# A white boot-top stripe would vanish at this size; the dark hull against the sea is what reads.

# Container bays from just behind the bow to the bridge, three stacks across, uneven heights.
x = 0.32
while x > -0.3:
    for y0 in (-B / 2 + 0.01, -0.022, 0.026):
        h = random.choice((0.035, 0.05, 0.05, 0.065))
        n0 = len(bm.faces)
        box(bm, x - 0.05, x, y0, y0 + 0.044, D, D + h, 0, srgb(random.choice(BOXES)), col, skip=("-z",))
    x -= 0.058
# Bridge aft: white block with a dark window band, and the funnel behind it.
box(bm, -0.42, -0.34, -B / 2 + 0.005, B / 2 - 0.005, D, D + 0.13, 0, srgb("#eef1f4"), col, skip=("-z",))
box(bm, -0.341, -0.338, -B / 2 + 0.01, B / 2 - 0.01, D + 0.1, D + 0.12, 0, srgb("#1a2230"), col)
box(bm, -0.47, -0.43, -0.025, 0.025, D, D + 0.11, 0, srgb("#f37021"), col, skip=("-z",))

ob = link("MapShip", bm, [material("MapShip", "#ffffff", 0.5, vcol=True)])
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print(f"[build_mapship] wrote {OUT}: {len(ob.data.polygons)} faces")
