"""EEVEE preview of a built GLB with real materials and the deck's HDR, as a contact sheet.

Workbench previews (in the build scripts) show shape only; this one shows colour, metal and light
close to what three.js renders, before the model goes into the deck.

Usage (from the repo root):
  blender -b --factory-startup --python scripts/blender/preview_eevee.py -- MODEL.glb OUT_DIR [CAM ...]
CAM, optional and repeatable, is a three.js camera (y up) "px,py,pz:tx,ty,tz", e.g. "-40,14,-150:150,34,-700".
Without CAM: three auto-framed views (front, three-quarter, high). Output: OUT_DIR/view-N.png and
OUT_DIR/sheet.png (2 columns).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HDR = os.path.join(ROOT, "public", "env", "umhlanga_sunrise_1k.hdr")
W, H = 960, 540
FOV = 42  # degrees, vertical, as most deck cameras

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(args) < 2:
    sys.exit("usage: ... -- MODEL.glb OUT_DIR [px,py,pz:tx,ty,tz ...]")
model, out, cams = os.path.abspath(args[0]), os.path.abspath(args[1]), args[2:]
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model)  # converts glTF y-up to Blender z-up
scene = bpy.context.scene

# EEVEE's identifier changed across versions (BLENDER_EEVEE_NEXT in 4.2-4.x, BLENDER_EEVEE again in 5.x).
for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        pass
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.view_settings.view_transform = "Standard"  # the deck renders without tone mapping
scene.render.film_transparent = True  # HDR lights the model but is not the backdrop (the deck has its own sky)

world = bpy.data.worlds.new("Env")
world.use_nodes = True
nodes = world.node_tree.nodes
env = nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(HDR)
world.node_tree.links.new(env.outputs["Color"], nodes["Background"].inputs["Color"])
scene.world = world
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.sensor_fit = "VERTICAL"
cam.data.angle = math.radians(FOV)
cam.data.clip_end = 20000
scene.collection.objects.link(cam)
scene.camera = cam


def three_to_blender(x, y, z):
    return Vector((x, -z, y))


def views():
    if cams:
        for c in cams:
            p, t = (tuple(float(v) for v in s.split(",")) for s in c.split(":"))
            yield three_to_blender(*p), three_to_blender(*t)
        return
    pts = [o.matrix_world @ Vector(b) for o in scene.objects if o.type == "MESH" for b in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    centre, r = (lo + hi) / 2, (hi - lo).length / 2
    d = r / math.tan(math.radians(FOV) / 2) * 0.8  # bounding sphere is loose; 0.8 fills the frame
    for az, el in ((-90, 8), (-50, 18), (-30, 45)):  # front, three-quarter, high
        a, e = math.radians(az), math.radians(el)
        yield centre + d * Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))), centre


files = []
for i, (loc, tgt) in enumerate(views()):
    cam.location = loc
    cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out, f"view-{i}.png")
    bpy.ops.render.render(write_still=True)
    files.append(scene.render.filepath)

# Contact sheet, 2 columns (Blender ships numpy, no PIL needed).
tiles = []
for f in files:
    img = bpy.data.images.load(f)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    px[..., :3] = px[..., :3] * px[..., 3:] + 0.18 * (1 - px[..., 3:])  # over mid-grey
    px[..., 3] = 1
    tiles.append(px)
if len(tiles) % 2:
    tiles.append(np.full((H, W, 4), (0.18, 0.18, 0.18, 1.0), np.float32))
rows = [np.concatenate(tiles[i : i + 2], axis=1) for i in range(0, len(tiles), 2)]
sheet = np.concatenate(rows[::-1], axis=0)  # Blender pixel rows start at the bottom
assert sheet.shape == (H * len(rows), W * 2, 4)
img = bpy.data.images.new("sheet", W * 2, H * len(rows), alpha=True)
img.pixels[:] = sheet.ravel()
img.filepath_raw = os.path.join(out, "sheet.png")
img.file_format = "PNG"
img.save()
print(f"[preview_eevee] {len(files)} views, sheet in {out}")
