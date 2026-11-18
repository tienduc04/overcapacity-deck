"""Build scene 2: inside a 40 ft high-cube container looking out of its open doors onto a quay,
the harbour water and a low far shore. Exports GLB for src/world/container.js.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_container.py -- public/models/container.glb
Or:              npm run build:container

Units are metres, Blender z up (glTF y up after export). The container runs along +x from its
closed end (x = 0) to the doors (x = LI); floor top at z = 0, quay top at QUAY_Z, water at WATER_Z.
The open door is its own object with the origin on its hinge, so Three.js can swing it.
"""
import math
import os
import random
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import box, corrugation, link, material, profile_points, srgb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/container.glb"
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)  # before any data is created

LI, WI, HI = 12.03, 2.35, 2.69  # inside length, width, height (ISO 40 ft high cube)
WO = 2.44  # outside width
DOOR_W, DOOR_H = 2.34, 2.58  # door opening
QUAY_Z, WATER_Z = -0.2, -2.6
QUAY_EDGE = LI + 22.0
DOOR_OPEN = 64  # degrees the right-hand door stands open (outwards)

M = {
    "wall": material("Wall", "#d2601f", 0.55, 0.3),  # Hapag orange
    "frame": material("Frame", "#a84a18", 0.5, 0.4),
    "floor": material("Floor", "#ffffff", 0.75, vcol=True),
    "door": material("Door", "#d2601f", 0.5, 0.4),
    "steel": material("Fittings", "#3a3f46", 0.4, 0.8),
    "quay": material("Quay", "#8d8b86", 0.9),
    "paint": material("Kerb", "#ffffff", 0.7, vcol=True),
    "shore": material("Shore", "#3c4048", 0.9),
    "carton": material("Carton", "#b58a5c", 0.85),
    "pallet": material("Pallet", "#8a6a45", 0.9),
    "strap": material("Strap", "#d9d4c7", 0.6),
    "label": material("Label", "#ece8df", 0.7),
    "ink": material("Ink", "#1b1b1b", 0.6),
}
# Gross deliveries 2027-29 in M TEU (Yang Chen 2026b, as on slide 2's chart; status unverified there).
# Each stack has one carton layer per ~1 M TEU, so the three heights echo the chart.
DELIVERIES = {"2027": 3.43, "2028": 5.98, "2029": 4.35}


def build_shell():
    """Side walls and roof as corrugated sheets (faces point inwards), plus the closed end."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    pitch, depth = 0.278, 0.055
    xs = profile_points(LI, pitch)

    def quad(a, b, c, d, mat):
        f = bm.faces.new([bm.verts.new(p) for p in (a, b, c, d)])
        f.material_index = mat
        for loop, (s, t) in zip(f.loops, ((a[0], a[2]), (b[0], b[2]), (c[0], c[2]), (d[0], d[2]))):
            loop[uv].uv = (s, t)  # metres along the container and up the wall
        return f

    for side in (1, -1):  # +y = left looking out of the doors, -y = right
        for x0, x1 in zip(xs, xs[1:]):
            y0 = side * (WI / 2 + depth - corrugation(x0 + 1e-4, pitch, depth))
            y1 = side * (WI / 2 + depth - corrugation(x1 - 1e-4, pitch, depth))
            pts = ((x0, y0, 0), (x1, y1, 0), (x1, y1, HI), (x0, y0, HI))
            quad(*(pts[::-1] if side < 0 else pts), 0)  # normals face inwards
    rpitch, rdepth = 0.24, 0.04
    for x0, x1 in zip(profile_points(LI, rpitch), profile_points(LI, rpitch)[1:]):
        z0 = HI + rdepth - corrugation(x0 + 1e-4, rpitch, rdepth)
        z1 = HI + rdepth - corrugation(x1 - 1e-4, rpitch, rdepth)
        f = quad((x0, WI / 2 + depth, z0), (x1, WI / 2 + depth, z1), (x1, -WI / 2 - depth, z1), (x0, -WI / 2 - depth, z0), 0)
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x, loop.vert.co.y)
    quad((0, WI / 2 + depth, HI + rdepth), (0, -WI / 2 - depth, HI + rdepth), (0, -WI / 2 - depth, 0), (0, WI / 2 + depth, 0), 0)
    # bottom and top side rails, and the door frame: posts, header, sill, corner castings
    for s in (1, -1):
        y_in, y_out = s * (WI / 2 - 0.04), s * (WI / 2 + depth)
        box(bm, 0, LI, min(y_in, y_out), max(y_in, y_out), 0, 0.16, 1)
        box(bm, 0, LI, min(y_in, y_out), max(y_in, y_out), HI - 0.1, HI + 0.04, 1)
        y_post = s * DOOR_W / 2
        box(bm, LI - 0.12, LI + 0.12, min(y_post, s * WO / 2), max(y_post, s * WO / 2), -0.16, 2.9, 1)
        box(bm, LI - 0.03, LI + 0.15, min(s * (WO / 2 - 0.16), s * WO / 2 + 0.01), max(s * (WO / 2 - 0.16), s * WO / 2 + 0.01), -0.18, -0.04, 3)
        box(bm, LI - 0.03, LI + 0.15, min(s * (WO / 2 - 0.16), s * WO / 2 + 0.01), max(s * (WO / 2 - 0.16), s * WO / 2 + 0.01), 2.78, 2.9, 3)
    box(bm, LI - 0.14, LI + 0.12, -WO / 2, WO / 2, DOOR_H, 2.9, 1)  # header
    box(bm, LI - 0.05, LI + 0.12, -WO / 2, WO / 2, -0.16, 0.0, 1)  # sill
    # weld the sheet strips: hairline cracks between them let the sky shine through
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    return link("Shell", bm, [M["wall"], M["frame"], M["door"], M["steel"]])


def build_floor():
    """Plywood boards along the container: staggered joints, each board its own tone and grain offset."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    col = bm.loops.layers.color.new("Col")
    tones = ["#a8865c", "#9a774f", "#b4936a", "#8f6e49", "#a37f55", "#b08a5e"]
    y = -WI / 2
    while y < WI / 2 - 0.05:
        w = min(random.uniform(0.26, 0.42), WI / 2 - y)
        x = -random.uniform(0, 2.4)
        while x < LI:
            l = random.uniform(2.4, 4.2)
            x0, x1 = max(x, 0.0), min(x + l, LI - 0.05)
            if x1 - x0 < 0.05:
                break
            c = tuple(v * random.uniform(0.82, 1.05) for v in srgb(random.choice(tones)))
            ox, oy = random.uniform(0, 50), random.uniform(0, 50)
            vs = [bm.verts.new(p) for p in ((x0, y + 0.004, 0), (x1, y + 0.004, 0), (x1, y + w - 0.004, 0), (x0, y + w - 0.004, 0))]
            f = bm.faces.new(vs)
            for loop in f.loops:
                p = loop.vert.co
                edge = min(abs(p.y - WI / 2), abs(p.y + WI / 2))  # scuffed and darker along the walls
                k = 0.72 + 0.28 * min(edge / 0.5, 1.0)
                loop[col] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
                loop[uv].uv = (p.x + ox, p.y + oy)  # grain runs along u (the board's length)
            x += l
        y += w
    # dark gaps between the boards
    vs = [bm.verts.new(p) for p in ((0, -WI / 2, -0.01), (LI, -WI / 2, -0.01), (LI, WI / 2, -0.01), (0, WI / 2, -0.01))]
    f = bm.faces.new(vs)
    for loop in f.loops:
        loop[col] = (0.02, 0.015, 0.01, 1.0)
    return link("Floor", bm, [M["floor"]])


def build_door():
    """Right-hand door leaf, origin on its hinge; closed it would span y 0 .. +DOOR_W/2 at x 0 .. 0.06."""
    bm = bmesh.new()
    w, h, t = WO / 2 - 0.02, 2.62, 0.06
    # inner face: four horizontal corrugated panels between flat bands (faces -x when closed)
    uv = bm.loops.layers.uv.verify()
    zs = [0.0]
    for k in range(4):
        z0 = 0.18 + k * 0.6
        zs += [z0, z0 + 0.12, z0 + 0.42, z0 + 0.54]
    zs.append(h)
    dent = lambda i: 0.035 if (i % 4) in (2, 3) else 0.0  # noqa: E731
    for i, (z0, z1) in enumerate(zip(zs, zs[1:])):
        x0, x1 = -dent(i), -dent(i + 1)
        vs = [bm.verts.new(p) for p in ((x1, 0.02, z1), (x1, w, z1), (x0, w, z0), (x0, 0.02, z0))]
        f = bm.faces.new(vs)
        f.material_index = 0
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.y, loop.vert.co.z)
    box(bm, 0, t, 0.02, w, 0, h, 0, skip=("-x",))  # leaf thickness and outer face
    for yb in (0.32, 0.82):  # locking bars and handles on the outer face
        r = 0.028
        box(bm, t, t + 2 * r, yb - r, yb + r, 0.05, h - 0.05, 1)
        box(bm, t, t + 0.05, yb - 0.02, yb + 0.02, 0.95, 1.05, 1)
        box(bm, t + 0.05, t + 0.07, yb - 0.02, yb + 0.22, 0.95, 1.05, 1)
    ob = link("Door", bm, [M["door"], M["steel"]])
    ob.location = (LI + 0.12, -WO / 2, 0)
    ob.rotation_euler = (0, 0, -math.radians(DOOR_OPEN))  # swings out to the right (-y)
    return ob


def build_quay():
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    box(bm, LI - 1.0, QUAY_EDGE, -60, 60, WATER_Z - 1.5, QUAY_Z, 0, skip=("-z", "-x"))
    # painted safety line parallel to the edge
    box(bm, QUAY_EDGE - 3.2, QUAY_EDGE - 3.05, -60, 60, QUAY_Z, QUAY_Z + 0.004, 1, srgb("#d9b21e"), col, skip=("-z",))
    # kerb along the edge in yellow and black blocks
    y = -60.0
    k = 0
    while y < 60:
        c = srgb("#e0b41c") if k % 2 == 0 else srgb("#1b1b1b")
        box(bm, QUAY_EDGE - 0.45, QUAY_EDGE, y, y + (2.0 if k % 2 == 0 else 1.0), QUAY_Z, QUAY_Z + 0.25, 1, c, col, skip=("-z",))
        y += 2.0 if k % 2 == 0 else 1.0
        k += 1
    # bollards
    for yb in (-14.0, 6.0, 26.0):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.22, radius2=0.18, depth=0.55,
                              matrix=_at(QUAY_EDGE - 1.1, yb, QUAY_Z + 0.275))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.3, radius2=0.3, depth=0.08,
                              matrix=_at(QUAY_EDGE - 1.1, yb, QUAY_Z + 0.59))
    for f in bm.faces:  # cones come without material or colour: dark steel
        if f.material_index == 0 and f.calc_center_median().z > QUAY_Z + 0.01 and abs(f.calc_center_median().x - (QUAY_EDGE - 1.1)) < 0.4:
            f.material_index = 1
            for loop in f.loops:
                loop[col] = (*srgb("#2a2c30"), 1.0)
    return link("Quay", bm, [M["quay"], M["paint"]])


def _at(x, y, z):
    from mathutils import Matrix

    return Matrix.Translation((x, y, z))


def build_shore():
    """Low skyline across the water: sheds, blocks and a few cranes, flattened by haze in Three.js."""
    bm = bmesh.new()
    x0 = 1400.0
    y = -2200.0
    while y < 2200:
        w = random.uniform(15, 70)
        h = random.choice((4, 6, 8, 10, 14, 18, 24))
        d = random.uniform(15, 50)
        box(bm, x0, x0 + d, y, y + w, WATER_Z, WATER_Z + h + 2, skip=("-z", "+x"))
        y += w + random.uniform(0, 25)
    for yc in (-420.0, -360.0, 300.0, 350.0, 400.0):  # ship-to-shore cranes
        box(bm, x0 - 30, x0 - 26, yc - 2, yc + 2, WATER_Z, WATER_Z + 60, skip=("-z",))
        box(bm, x0 - 30, x0 - 26, yc + 14, yc + 18, WATER_Z, WATER_Z + 60, skip=("-z",))
        box(bm, x0 - 90, x0 + 20, yc - 2, yc + 18, WATER_Z + 58, WATER_Z + 63, skip=())
    box(bm, x0 + 40, x0 + 2000, -2200, 2200, WATER_Z, WATER_Z + 1.5, skip=("-z",))  # land
    return link("Shore", bm, [M["shore"]])


def text_mesh(body, size, mat):
    """Flat lettering facing +x, reading left to right from inside the box looking at the closed end."""
    from mathutils import Matrix

    cu = bpy.data.curves.new(body, "FONT")
    cu.body, cu.size, cu.extrude, cu.align_x, cu.align_y = body, size, 0.003, "CENTER", "CENTER"
    tmp = bpy.data.objects.new("tmp", cu)
    bpy.context.collection.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    me.transform(Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0))).to_4x4())  # text x -> +y, y -> +z, normal -> +x
    me.materials.append(mat)
    return me


def build_cargo():
    """Three pallet stacks against the closed end, one per delivery year, each with a year placard."""
    rng = random.Random(5)  # own stream: the rest of the build keeps its random sequence
    bm = bmesh.new()
    x0, x1 = 0.14, 1.14
    for (year, teu), yc in zip(DELIVERIES.items(), (-0.68, 0.0, 0.68)):  # 2027 on the left seen from the doors
        y0, y1 = yc - 0.31, yc + 0.31
        box(bm, x0, x1, y0, y1, 0.0, 0.14, 1)  # pallet
        layers = round(teu)
        for k in range(layers):
            z = 0.14 + k * 0.33
            for i in range(2):
                for j in range(2):
                    jx, jy = rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012)
                    cx, cy = x0 + i * 0.5 + jx, y0 + j * 0.31 + jy
                    box(bm, cx + 0.01, cx + 0.49, cy + 0.01, cy + 0.3, z, z + 0.32, 0)
        top = 0.14 + layers * 0.33
        for yy in (y0 + 0.14, y1 - 0.17):  # two straps over the top and down the front
            box(bm, x1 + 0.005, x1 + 0.02, yy, yy + 0.03, 0.14, top, 2)
            box(bm, x0, x1 + 0.02, yy, yy + 0.03, top, top + 0.012, 2)
        box(bm, x1 + 0.02, x1 + 0.03, yc - 0.26, yc + 0.26, 0.36, 0.72, 3)  # placard
        ob = bpy.data.objects.new("Year" + year, text_mesh(year, 0.22, M["ink"]))
        bpy.context.collection.objects.link(ob)
        ob.location = (x1 + 0.034, yc, 0.55)
    ob = link("Cargo", bm, [M["carton"], M["pallet"], M["strap"], M["label"]])
    mod = ob.modifiers.new("Bevel", "BEVEL")  # rounded edges catch the light from the doors
    mod.width, mod.segments, mod.limit_method, mod.harden_normals = 0.008, 2, "ANGLE", True
    for f in ob.data.polygons:
        f.use_smooth = True
    return ob


build_shell()
build_floor()
build_door()
build_quay()
build_shore()
build_cargo()
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print(f"[build_container] wrote {OUT}: {len(bpy.data.objects)} objects, {faces} faces")
