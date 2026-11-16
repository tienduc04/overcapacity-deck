"""Build scene 7's harbour at dawn: a row of brick warehouses with stepped gables, copper roofs and towers
along a stone quay (in the style of a north German port warehouse district, no real building copied), and a
container terminal to the right with ship-to-shore cranes, floodlight masts and stacks.
Exports GLB for src/world/harbour.js.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_harbour.py -- public/models/harbour.glb [preview_dir]
Or:              npm run build:harbour

Units are metres, Blender z up, water at z = 0. The camera in three.js looks along -z (glTF), which is +y
here: the far bank runs along x at y ~ QUAY_Y, its fronts face -y. One mesh "Harbour", several materials.
"""
import math
import os
import random
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import box, srgb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/harbour.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)

QUAY_Y = 700.0  # front of the warehouse quay
QUAY_Z = 4.0  # quay top above the water
TERM_Y = 640.0  # front of the terminal quay (further out)
TERM_X = (330.0, 1250.0)


def mat(name, hex_, rough=0.7, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*srgb(hex_), 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*srgb(hex_), 1.0)
        p.inputs["Emission Strength"].default_value = emit
    return m


MATS = [
    mat("Brick", "#6e3424", 0.85),
    mat("BrickDark", "#46201a", 0.85),
    mat("Copper", "#5d8c78", 0.55, 0.3),
    mat("Window", "#11161e", 0.2, 0.6),
    mat("Lit", "#ffc277", 0.5, 0.0, 4.0),
    mat("Stone", "#8a8478", 0.9),
    mat("Concrete", "#6d6d6a", 0.9),
    mat("Crane", "#cfc8b8", 0.5, 0.4),
    mat("CraneRed", "#a8321f", 0.5, 0.3),
    mat("Lamp", "#fff1d6", 0.5, 0.0, 8.0),
    mat("BoxOrange", "#d2601f", 0.7, 0.2),
    mat("BoxBlue", "#1d2a52", 0.7, 0.2),
    mat("BoxGrey", "#7d8798", 0.7, 0.2),
    mat("BoxRed", "#4a1c22", 0.7, 0.2),
    mat("BoxGreen", "#2f5a3a", 0.7, 0.2),
    mat("Wood", "#3b2a20", 0.8),
]
I = {m.name: i for i, m in enumerate(MATS)}
BOXES = ["BoxOrange", "BoxBlue", "BoxGrey", "BoxRed", "BoxGreen", "BoxGrey", "BoxBlue"]

bm = bmesh.new()
uv = bm.loops.layers.uv.verify()
BACK = ("+y", "-z")  # faces never seen from the river


def B(x0, x1, y0, y1, z0, z1, m, skip=BACK):
    box(bm, min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1), mat=I[m], skip=skip)


def face(vs, m):
    f = bm.faces.new([bm.verts.new(v) for v in vs])
    f.material_index = I[m]
    for loop in f.loops:
        loop[uv].uv = (loop.vert.co.x * 0.1, loop.vert.co.z * 0.1)


def roof(x0, x1, y0, y1, z0, h, m="Copper"):
    """Pitched roof, ridge along x."""
    ym = (y0 + y1) / 2
    face([(x0, y0, z0), (x1, y0, z0), (x1, ym, z0 + h), (x0, ym, z0 + h)], m)  # front slope
    face([(x1, y1, z0), (x0, y1, z0), (x0, ym, z0 + h), (x1, ym, z0 + h)], m)  # back slope
    face([(x0, y1, z0), (x0, y0, z0), (x0, ym, z0 + h)], m)  # ends
    face([(x1, y0, z0), (x1, y1, z0), (x1, ym, z0 + h)], m)


def spire(cx, cy, w, z0, h, m="Copper"):
    a, b = w / 2, (cx, cy, z0 + h)
    c = [(cx - a, cy - a, z0), (cx + a, cy - a, z0), (cx + a, cy + a, z0), (cx - a, cy + a, z0)]
    for k in range(4):
        face([c[k], c[(k + 1) % 4], b], m)


# --- water edge: stone quay wall under the warehouses, concrete apron at the terminal ------------------------------
B(-1400, TERM_X[0], QUAY_Y, QUAY_Y + 40, -2, QUAY_Z, "Stone")
B(-1400, TERM_X[0], QUAY_Y - 0.3, QUAY_Y, 0.3, 0.9, "BrickDark")  # wet line
B(TERM_X[0], TERM_X[1], TERM_Y, QUAY_Y + 260, -2, QUAY_Z, "Concrete")
for x in range(-1380, int(TERM_X[0]), 24):  # bollards along the stone quay
    B(x, x + 0.8, QUAY_Y + 1, QUAY_Y + 1.8, QUAY_Z, QUAY_Z + 1.0, "BrickDark")

# --- warehouses: blocks along x, separated by narrow canals -------------------------------------------------------
x = -1380.0
blocks = 0
while x < TERM_X[0] - 70:
    length = random.choice([78, 92, 104, 118])
    x0, x1 = x, min(x + length, TERM_X[0] - 20)
    y0, y1 = QUAY_Y + 6, QUAY_Y + 36
    H = random.choice([23.0, 25.5, 27.0])
    z0 = QUAY_Z
    B(x0, x1, y0, y1, z0, z0 + H, "Brick", skip=("-z",))
    B(x0, x1, y0 - 0.4, y0, z0, z0 + 1.6, "BrickDark")  # plinth
    for k in range(1, 7):  # string courses between floors
        B(x0, x1, y0 - 0.25, y0, z0 + k * (H / 7) - 0.2, z0 + k * (H / 7) + 0.15, "BrickDark")
    B(x0, x1, y0 - 0.5, y0, z0 + H - 0.6, z0 + H + 0.3, "BrickDark")  # cornice
    roof(x0, x1, y0, y1, z0 + H, 9.0)
    # gables with a loading-bay column under each
    n_g = max(2, int((x1 - x0) // 32))
    gx_all = [x0 + (x1 - x0) * (g + 0.5) / n_g for g in range(n_g)]
    for gx in gx_all:
        gw = 15.0
        for s, (w, h0, h1) in enumerate([(1.0, 0, 3.2), (0.72, 3.2, 6.2), (0.46, 6.2, 9.0), (0.2, 9.0, 11.5)]):
            B(gx - gw * w / 2, gx + gw * w / 2, y0 - 0.6, y0 + 3.0, z0 + H + h0, z0 + H + h1, "Brick")
            B(gx - gw * w / 2 - 0.3, gx + gw * w / 2 + 0.3, y0 - 0.8, y0 + 3.0, z0 + H + h1 - 0.3, z0 + H + h1, "BrickDark")
        B(gx - 1.6, gx + 1.6, y0 - 0.9, y0 + 3.0, z0 + 2.0, z0 + H + 6.0, "BrickDark")  # loading-bay pier
        for k in range(7):
            zz = z0 + 2.4 + k * (H / 7)
            B(gx - 1.1, gx + 1.1, y0 - 1.0, y0 - 0.85, zz, zz + 2.4, "Wood")  # hoist doors
        B(gx - 0.2, gx + 0.2, y0 - 3.6, y0 - 0.9, z0 + H + 4.6, z0 + H + 5.0, "BrickDark")  # hoist beam
        B(gx - 0.9, gx + 0.9, y0 - 0.9, y0 - 0.75, z0 + H + 6.5, z0 + H + 8.0, "Window")  # gable window
    # windows: arched rows read as tall dark slots; a few warm lit ones at dawn
    for k in range(7):
        zz = z0 + 2.4 + k * (H / 7)
        wx = x0 + 2.2
        while wx < x1 - 3.0:
            if all(abs(wx + 0.65 - gx) > 2.6 for gx in gx_all):
                m = "Lit" if random.random() < 0.06 else "Window"
                B(wx, wx + 1.3, y0 - 0.12, y0, zz, zz + 1.9, m)
            wx += 3.4
    # a tower on some blocks, at an end
    if blocks % 2 == 0:
        tx = x0 + 6.0 if blocks % 4 == 0 else x1 - 6.0
        B(tx - 5, tx + 5, y0 - 1.0, y0 + 9, z0, z0 + H + 14, "Brick", skip=("-z",))
        B(tx - 5.3, tx + 5.3, y0 - 1.3, y0 + 9.3, z0 + H + 13.4, z0 + H + 14.2, "BrickDark")
        for k in range(3):
            B(tx - 0.8, tx + 0.8, y0 - 1.12, y0 - 1.0, z0 + H + 2 + k * 3.8, z0 + H + 4.6 + k * 3.8, "Window")
        spire(tx, y0 + 4, 11.0, z0 + H + 14.2, 13.0)
    blocks += 1
    x = x1 + random.choice([14, 18, 22])  # canal

# low silhouettes of the town behind the warehouses
for k in range(60):
    bx = -1500 + k * 30 + random.uniform(-8, 8)
    if bx > TERM_X[0] - 40:
        break
    B(bx, bx + random.uniform(18, 32), QUAY_Y + 60, QUAY_Y + 90, QUAY_Z, QUAY_Z + random.uniform(18, 42), "BrickDark", skip=("-z",))
for cx, h in ((-620, 96), (-180, 128)):  # two church spires far behind
    B(cx - 6, cx + 6, QUAY_Y + 120, QUAY_Y + 132, QUAY_Z, QUAY_Z + h * 0.45, "BrickDark", skip=("-z",))
    spire(cx, QUAY_Y + 126, 12.0, QUAY_Z + h * 0.45, h * 0.55)

# --- container terminal: stacks, floodlight masts, ship-to-shore cranes -------------------------------------------
for blk_y in (TERM_Y + 70, TERM_Y + 130):
    for bay in range(int((TERM_X[1] - TERM_X[0] - 60) / 13)):
        bx = TERM_X[0] + 30 + bay * 13
        for row in range(7):
            by = blk_y + row * 2.55
            tiers = random.choice([1, 2, 3, 3, 4, 4, 5])
            for t in range(tiers):
                B(bx, bx + 12.2, by, by + 2.44, QUAY_Z + t * 2.6, QUAY_Z + t * 2.6 + 2.59, random.choice(BOXES), skip=("-z",))
for mx in range(int(TERM_X[0]) + 40, int(TERM_X[1]), 120):  # floodlight masts
    B(mx, mx + 0.9, TERM_Y + 60, TERM_Y + 60.9, QUAY_Z, QUAY_Z + 38, "Concrete")
    B(mx - 2.5, mx + 3.4, TERM_Y + 59, TERM_Y + 61.9, QUAY_Z + 38, QUAY_Z + 39.5, "Concrete")
    B(mx - 2.2, mx + 3.1, TERM_Y + 58.9, TERM_Y + 59.1, QUAY_Z + 38.2, QUAY_Z + 39.3, "Lamp")


def crane(cx):
    """Ship-to-shore crane, boom raised over the water (towards -y)."""
    yl, yr = TERM_Y + 6, TERM_Y + 36  # waterside and landside legs
    for lx in (cx - 9, cx + 9):
        for ly in (yl, yr):
            B(lx - 0.9, lx + 0.9, ly - 0.9, ly + 0.9, QUAY_Z, QUAY_Z + 46, "Crane", skip=("-z",))
        B(lx - 0.8, lx + 0.8, yl, yr, QUAY_Z + 14, QUAY_Z + 15.6, "Crane")  # sill beam
        B(lx - 1.2, lx + 1.2, yl - 2, yr + 2, QUAY_Z, QUAY_Z + 1.4, "CraneRed")  # bogies
    for ly in (yl, yr):
        B(cx - 9, cx + 9, ly - 0.8, ly + 0.8, QUAY_Z + 44, QUAY_Z + 46, "Crane")  # portal beams
    # boom out over the water and girder back over the land, two box girders
    for gx in (cx - 5, cx + 5):
        B(gx - 0.8, gx + 0.8, TERM_Y - 62, yr + 24, QUAY_Z + 46, QUAY_Z + 49, "Crane")
    for k in range(0, 24):  # cross ties
        yy = TERM_Y - 60 + k * 5.2
        B(cx - 5, cx + 5, yy, yy + 0.6, QUAY_Z + 47, QUAY_Z + 48, "Crane")
    # apex frame and stays
    B(cx - 6, cx - 4.4, yl + 6, yl + 7.6, QUAY_Z + 49, QUAY_Z + 74, "Crane")
    B(cx + 4.4, cx + 6, yl + 6, yl + 7.6, QUAY_Z + 49, QUAY_Z + 74, "Crane")
    B(cx - 6, cx + 6, yl + 6, yl + 7.6, QUAY_Z + 72, QUAY_Z + 74.5, "CraneRed")
    B(cx - 0.4, cx + 0.4, TERM_Y - 50, yl + 6, QUAY_Z + 60, QUAY_Z + 61, "Crane")  # forestay (simplified)
    B(cx - 4, cx + 4, yr + 16, yr + 24, QUAY_Z + 40, QUAY_Z + 46, "Concrete", skip=("-z",))  # machinery house / counterweight
    B(cx - 2, cx + 2, TERM_Y + 2, TERM_Y + 7, QUAY_Z + 40, QUAY_Z + 44, "Window")  # driver's cab
    B(cx - 3.5, cx + 3.5, TERM_Y - 20, TERM_Y - 14, QUAY_Z + 43, QUAY_Z + 46, "CraneRed")  # trolley
    B(cx - 0.6, cx + 0.6, TERM_Y - 61.2, TERM_Y - 60.6, QUAY_Z + 49.2, QUAY_Z + 50.2, "Lamp")  # boom-tip light


for k, cx in enumerate((420, 560, 700, 860, 1010)):
    crane(cx)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Harbour")
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
ob = bpy.data.objects.new("Harbour", me)
bpy.context.collection.objects.link(ob)
for p in ob.data.polygons:
    p.use_smooth = False

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print(f"[build_harbour] wrote {OUT}: {len(ob.data.polygons)} faces, {len(ob.data.vertices)} vertices, {blocks} warehouse blocks")

if PREVIEW:
    from mathutils import Vector

    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.world = bpy.data.worlds.new("W")
    scene.world.color = (0.5, 0.42, 0.35)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens_unit = "FOV"
    cam.data.angle = math.radians(64)
    cam.data.clip_end = 5000
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, loc, tgt in (("river", (0, -150, 14), (60, 700, 40)), ("close", (-300, 450, 30), (-300, 720, 25)), ("terminal", (500, 300, 40), (700, 680, 40))):
        cam.location = loc
        cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{name}.png")
        bpy.ops.render.render(write_still=True)
    print(f"[build_harbour] previews in {PREVIEW}")
