"""Build scene 6's ship bridge: shell with wall panelling and ceiling lights, a curved console with lit
controls, two captain's chairs, window frame with a dashboard ledge, and the bezels and arms of the three
curved screens. Exports GLB for src/world/bridge.js (the screens' faces are drawn there from model data).

Run (headless):  blender -b --factory-startup --python scripts/blender/build_bridge.py -- public/models/bridge.glb [preview_dir]
Or:              npm run build:bridge

Units are metres, Blender z up (glTF y up after export, glTF z = -Blender y). The screens stand on a cylinder
around the axis (x = 0, y = AXIS_Y) with radius SCREEN_R, three segments SPAN degrees wide with GAP between;
src/world/bridge.js uses the same numbers. One mesh "Bridge", several named materials.
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
OUT = argv[0] if argv else "public/models/bridge.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)

AXIS_Y = -5.4  # glTF z = 5.4
SCREEN_R, SCREEN_H, SCREEN_Z, SPAN, GAP = 5.8, 3.3, 2.45, 34.0, 3.0  # radius, height, centre height, degrees
ROOM = dict(x=14.0, y0=-17.0, y1=7.4, z=6.4)  # half width, back wall, window wall, ceiling


def mat(name, hex_, rough=0.6, metal=0.0, emit=0.0):
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
    mat("Wall", "#2a3644", 0.55, 0.35),
    mat("WallDark", "#171f29", 0.7, 0.3),
    mat("Floor", "#1a1f26", 0.85, 0.05),
    mat("Steel", "#6b7785", 0.32, 0.9),
    mat("Panel", "#10161e", 0.6, 0.25),
    mat("Leather", "#1c1d21", 0.5, 0.0),
    mat("Strip", "#ffe9c4", 0.4, 0.0, 6.0),
    mat("LedCyan", "#22d6e6", 0.4, 0.0, 2.5),
    mat("LedAmber", "#f0a030", 0.4, 0.0, 2.5),
    mat("LedGreen", "#2eea8a", 0.4, 0.0, 2.5),
    mat("LedRed", "#ff5a40", 0.4, 0.0, 2.5),
    mat("Yellow", "#7a5a12", 0.6, 0.2),
]
I = {m.name: i for i, m in enumerate(MATS)}

bm = bmesh.new()
uv = bm.loops.layers.uv.verify()


def B(x0, x1, y0, y1, z0, z1, m="Wall", **kw):
    box(bm, min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1), mat=I[m], **kw)


def polar(r, c_deg, z):
    """Point on the screen cylinder: c = 0 is straight ahead (towards the window), positive = to the left."""
    c = math.radians(c_deg)
    return (-r * math.sin(c), AXIS_Y + r * math.cos(c), z)


def arc_box(c0, c1, r0, r1, z0, z1, m="Panel", n=None):
    """Closed solid between two radii, two angles (degrees) and two heights, as quads along the arc."""
    n = n or max(2, int(abs(c1 - c0) / 4))
    ang = [c0 + (c1 - c0) * k / n for k in range(n + 1)]
    ring = lambda r, z: [bm.verts.new(polar(r, a, z)) for a in ang]
    oo, oi, io, ii = ring(r1, z1), ring(r1, z0), ring(r0, z1), ring(r0, z0)
    faces = []
    for k in range(n):
        faces += [(oo[k], oo[k + 1], oi[k + 1], oi[k]), (io[k + 1], io[k], ii[k], ii[k + 1]),
                  (io[k], io[k + 1], oo[k + 1], oo[k]), (ii[k + 1], ii[k], oi[k], oi[k + 1])]
    faces += [(io[0], oo[0], oi[0], ii[0]), (oo[n], io[n], ii[n], oi[n])]
    for f in faces:
        try:
            face = bm.faces.new(f)
        except ValueError:
            continue
        face.material_index = I[m]
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co.x * 0.5, loop.vert.co.z * 0.5)


def cyl(x, y, z0, z1, r, m, seg=24, r2=None):
    bottom = [bm.verts.new((x + r * math.cos(2 * math.pi * s / seg), y + r * math.sin(2 * math.pi * s / seg), z0)) for s in range(seg)]
    top = [bm.verts.new((x + (r2 or r) * math.cos(2 * math.pi * s / seg), y + (r2 or r) * math.sin(2 * math.pi * s / seg), z1)) for s in range(seg)]
    for s in range(seg):
        f = bm.faces.new([bottom[s], bottom[(s + 1) % seg], top[(s + 1) % seg], top[s]])
        f.material_index = I[m]
        f.smooth = True
        for loop in f.loops:
            loop[uv].uv = (0, 0)
    for ring, flip in ((top, False), (bottom, True)):
        f = bm.faces.new(ring[::-1] if flip else ring)
        f.material_index = I[m]
        for loop in f.loops:
            loop[uv].uv = (0, 0)


# --- room shell ---------------------------------------------------------------------------------------------------
X, Y0, Y1, Z = ROOM["x"], ROOM["y0"], ROOM["y1"], ROOM["z"]
B(-X, X, Y0, Y1, -0.3, 0, "Floor")
B(-X, X, Y0, Y1, Z, Z + 0.3, "WallDark")  # ceiling
B(-X - 0.3, -X, Y0, Y1, 0, Z, "Wall")  # side walls
B(X, X + 0.3, Y0, Y1, 0, Z, "Wall")
B(-X, X, Y0, Y0 - 0.3, 0, Z, "WallDark")  # back wall (not seen)
# non-slip floor: thin raised lines
for k in range(-13, 14):
    B(k * 1.0 - 0.025, k * 1.0 + 0.025, Y0, Y1, 0, 0.012, "Panel")
# wall panelling: vertical seams and a lit skirting strip, on both side walls
for side in (-1, 1):
    wx = side * X
    for k in range(0, 13):
        y = Y0 + 1.0 + k * 2.0
        B(wx - side * 0.0, wx - side * 0.06, y - 0.03, y + 0.03, 0.35, Z - 0.4, "WallDark")
    B(wx, wx - side * 0.12, Y0, Y1, 0, 0.35, "WallDark")  # skirting
    B(wx, wx - side * 0.1, Y0, Y1, 3.0, 3.1, "Steel")  # handrail strip
    for k in range(0, 12):
        y = Y0 + 2.0 + k * 2.0
        B(wx - side * 0.06, wx - side * 0.16, y - 0.05, y + 0.05, 2.92, 3.18, "Steel")  # handrail brackets
    B(wx - side * 0.0, wx - side * 0.02, Y0, Y1, 1.2, 1.6, "WallDark")
# ceiling: panelling, light strips, cable trays
for k in range(-6, 7):
    B(-X, X, Y0, Y1, Z - 0.02, Z - 0.1, "WallDark") if k == -6 else None
for k in range(-12, 13):
    B(k * 1.1 - 0.025, k * 1.1 + 0.025, Y0, Y1, Z - 0.1, Z, "Panel")
for x in (-9.0, -3.0, 3.0, 9.0):
    B(x - 0.12, x + 0.12, Y0 + 1.0, Y1 - 0.6, Z - 0.14, Z - 0.1, "Strip")  # light strips
    B(x - 0.4, x + 0.4, Y0 + 1.0, Y1 - 0.6, Z - 0.16, Z - 0.14, "Steel")
for x in (-6.0, 6.0):  # cable trays with ribs
    B(x - 0.3, x + 0.3, Y0, Y1, Z - 0.34, Z - 0.3, "Steel")
    B(x - 0.3, x - 0.26, Y0, Y1, Z - 0.34, Z - 0.1, "Steel")
    B(x + 0.26, x + 0.3, Y0, Y1, Z - 0.34, Z - 0.1, "Steel")
    for k in range(0, 40):
        y = Y0 + 0.5 + k * 0.6
        B(x - 0.3, x + 0.3, y, y + 0.04, Z - 0.34, Z - 0.1, "Steel")

# --- window wall: sill, dashboard ledge, posts, header with instruments --------------------------------------------
B(-X, X, Y1, Y1 + 0.5, 0, 0.9, "WallDark")  # below the windows
B(-X, X, Y1 - 0.9, Y1 + 0.1, 0.9, 1.05, "Panel")  # window ledge
B(-X, X, Y1 + 0.1, Y1 + 0.5, 5.2, Z, "WallDark")  # header
for x in (-12.0, -6.0, 0.0, 6.0, 12.0):
    B(x - 0.28, x + 0.28, Y1 - 0.05, Y1 + 0.5, 1.05, 5.2, "Steel")  # posts
    B(x - 0.34, x + 0.34, Y1 - 0.12, Y1 + 0.5, 1.05, 1.3, "Steel")
    B(x - 0.34, x + 0.34, Y1 - 0.12, Y1 + 0.5, 4.95, 5.2, "Steel")
B(-X, X, Y1 - 0.12, Y1 + 0.5, 1.05, 1.12, "Steel")
B(-X, X, Y1 - 0.12, Y1 + 0.5, 5.13, 5.2, "Steel")
# header instrument strip: lit indicator blocks (wind, rudder, rpm) like a real bridge
for k in range(0, 18):
    x = -8.5 + k * 1.0
    B(x, x + 0.7, Y1 - 0.18, Y1 - 0.02, 5.25, 5.7, "Panel")
    B(x + 0.1, x + 0.6, Y1 - 0.19, Y1 - 0.17, 5.4, 5.55, ["LedCyan", "LedAmber", "LedGreen"][k % 3])
# window ledge: instruments and a lit radio rack
for k in range(0, 26):
    x = -12.5 + k * 1.0
    B(x + 0.05, x + 0.85, Y1 - 0.7, Y1 - 0.1, 1.05, 1.14, "Panel")
    for j in range(3):
        B(x + 0.12 + j * 0.24, x + 0.28 + j * 0.24, Y1 - 0.62, Y1 - 0.5, 1.14, 1.17, random.choice(["LedCyan", "LedAmber", "LedGreen", "LedRed", "Steel"]))

# --- console: curved desk in front of the screens ----------------------------------------------------------------
arc_box(-62, 62, 2.7, 4.3, 0, 0.82, "Panel", n=40)  # body
arc_box(-62, 62, 2.7, 4.05, 0.82, 0.92, "Steel", n=40)  # top plate, stepping back
arc_box(-62, 62, 4.05, 4.3, 0.82, 1.0, "Steel", n=40)  # front lip
arc_box(-62, 62, 2.5, 2.7, 0, 0.45, "WallDark", n=40)  # kick plate
for a in (-62, 62):
    arc_box(a - 1, a + 1, 2.7, 4.3, 0, 1.0, "Steel", n=2)
# controls: rows of buttons, key-pad blocks, throttle levers and rotary knobs along the arc
leds = ["LedCyan", "LedAmber", "LedGreen", "LedRed"]
for row in range(4):
    r = 2.95 + row * 0.27
    for k in range(0, 100):
        a = -58 + k * 1.16
        if abs(a) < 7 and row > 1:
            continue
        c = math.radians(a)
        cx, cy = -r * math.sin(c), AXIS_Y + r * math.cos(c)
        m = leds[(k * 7 + row * 3) % 4] if (k + row) % 3 == 0 else "WallDark"  # a third lit, the rest dark caps
        B(cx - 0.05, cx + 0.05, cy - 0.04, cy + 0.04, 0.92, 0.95, m)
for a in (-20, 20):  # throttle levers
    for off in (-0.5, 0.5):
        c = math.radians(a + off)
        cx, cy = -3.5 * math.sin(c), AXIS_Y + 3.5 * math.cos(c)
        B(cx - 0.04, cx + 0.04, cy - 0.04, cy + 0.04, 0.92, 1.18, "Steel")
        B(cx - 0.07, cx + 0.07, cy - 0.07, cy + 0.07, 1.16, 1.28, "Panel")
for a in (-36, -28, 28, 36):  # rotary knobs
    c = math.radians(a)
    cyl(-3.3 * math.sin(c), AXIS_Y + 3.3 * math.cos(c), 0.92, 1.0, 0.09, "Steel", seg=18)
B(-0.6, 0.6, AXIS_Y + 3.0, AXIS_Y + 3.8, 0.92, 0.96, "Yellow")  # centre emergency stop plate
cyl(0, AXIS_Y + 3.4, 0.96, 1.05, 0.2, "LedRed", seg=24)

# --- captain's chairs ------------------------------------------------------------------------------------------------
for cx, cy, turn in ((-4.2, -10.0, 0.0), (4.2, -10.0, 0.0)):
    cyl(cx, cy, 0, 0.06, 0.45, "Steel", seg=24)  # base
    cyl(cx, cy, 0.06, 0.55, 0.07, "Steel", seg=12)  # column
    B(cx - 0.45, cx + 0.45, cy - 0.45, cy + 0.45, 0.55, 0.7, "Leather")  # seat
    B(cx - 0.42, cx + 0.42, cy - 0.5, cy - 0.38, 0.7, 1.45, "Leather")  # back on the -y side: the seat faces the window (+y)
    B(cx - 0.3, cx + 0.3, cy - 0.52, cy - 0.36, 1.45, 1.75, "Leather")  # headrest
    for s in (-1, 1):
        B(cx + s * 0.46 - 0.04, cx + s * 0.46 + 0.04, cy - 0.3, cy + 0.3, 0.9, 0.96, "Panel")  # armrests
        B(cx + s * 0.46 - 0.02, cx + s * 0.46 + 0.02, cy - 0.05, cy + 0.05, 0.7, 0.9, "Steel")

# --- the three screens' bezels and arms ----------------------------------------------------------------------------
for c_mid in (SPAN + GAP, 0.0, -(SPAN + GAP)):
    c0, c1 = c_mid - SPAN / 2, c_mid + SPAN / 2
    z0, z1 = SCREEN_Z - SCREEN_H / 2, SCREEN_Z + SCREEN_H / 2
    arc_box(c0 - 0.9, c0 + 0.1, SCREEN_R - 0.05, SCREEN_R + 0.28, z0 - 0.2, z1 + 0.2, "Panel", n=1)  # side stiles
    arc_box(c1 - 0.1, c1 + 0.9, SCREEN_R - 0.05, SCREEN_R + 0.28, z0 - 0.2, z1 + 0.2, "Panel", n=1)
    arc_box(c0 - 0.9, c1 + 0.9, SCREEN_R - 0.05, SCREEN_R + 0.28, z0 - 0.22, z0 + 0.02, "Panel", n=9)  # rails
    arc_box(c0 - 0.9, c1 + 0.9, SCREEN_R - 0.05, SCREEN_R + 0.28, z1 - 0.02, z1 + 0.22, "Panel", n=9)
    arc_box(c0 - 0.9, c1 + 0.9, SCREEN_R - 0.12, SCREEN_R - 0.04, z0 - 0.26, z0 - 0.2, "Steel", n=9)  # chrome trim
    arc_box(c0 - 0.9, c1 + 0.9, SCREEN_R - 0.12, SCREEN_R - 0.04, z1 + 0.2, z1 + 0.26, "Steel", n=9)
    arc_box(c0 - 0.9, c1 + 0.9, SCREEN_R + 0.28, SCREEN_R + 0.6, z0 - 0.2, z1 + 0.2, "WallDark", n=9)  # back housing
    for dc in (-0.28, 0.28):  # legs down to the floor
        a = c_mid + dc * SPAN
        arc_box(a - 0.5, a + 0.5, SCREEN_R + 0.1, SCREEN_R + 0.45, 0, z0 - 0.22, "Steel", n=1)
    # status LEDs under the screen
    p = polar(SCREEN_R - 0.06, c_mid, z0 - 0.12)
    B(p[0] - 0.1, p[0] + 0.1, p[1] - 0.02, p[1] + 0.02, p[2] - 0.03, p[2] + 0.03, "LedGreen")

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Bridge")
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
ob = bpy.data.objects.new("Bridge", me)
bpy.context.collection.objects.link(ob)
for p in ob.data.polygons:
    p.use_smooth = False

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print(f"[build_bridge] wrote {OUT}: {len(ob.data.polygons)} faces, {len(ob.data.vertices)} vertices, {len(MATS)} materials")

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.world = bpy.data.worlds.new("W")
    scene.world.color = (0.03, 0.04, 0.06)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector

    for name, loc, tgt in {"front": ((0, -14.5 + 0 - 0.0, 2.4), (0, 0, 2.2)), "side": ((-9, -8, 3.2), (2, 0, 1.6))}.items() if False else (
        ("front", (0.0, -14.0 - 0.0, 2.4), (0.0, 7.0, 2.2)), ("side", (-9.0, -9.0, 3.4), (1.0, 2.0, 1.4)), ("top", (0.0, -12.0, 9.0), (0.0, 0.0, 0.0))
    ):
        cam.location = loc
        cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{name}.png")
        bpy.ops.render.render(write_still=True)
    print(f"[build_bridge] previews in {PREVIEW}")
