"""Build the Hapag-Lloyd style container ship for the live 3D scenes and export it as GLB.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_ship.py -- public/models/ship.glb
Or:              npm run build:ship

Units are metres, Blender z up (glTF y up after export), bow towards +x, waterline at z = 0.
Everything is generated here from numbers, so the model can be rebuilt and tweaked at any time.
"""
import math
import random
import sys

import bpy
import bmesh

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/ship.glb"
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)  # before any data is created

L, B = 330.0, 48.0  # length overall, beam
KEEL, DECK = -14.0, 13.0  # keel and main deck height relative to the waterline
X0, X1 = -L / 2, L / 2
BOOT_TOP = 1.6  # red antifouling shows this far above the waterline (ship in light load)


def srgb(hex_):
    """'#rrggbb' -> linear RGB, which Blender materials expect."""
    c = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name, hex_, rough=0.6, metal=0.0, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*srgb(hex_), 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if vcol:
        n = m.node_tree.nodes.new("ShaderNodeVertexColor")
        n.layer_name = "Col"
        m.node_tree.links.new(n.outputs["Color"], p.inputs["Base Color"])
    return m


M = {
    "hull": material("Hull", "#1c2638", 0.55, 0.2),
    "bottom": material("Antifouling", "#7a2621", 0.7),
    "deck": material("Deck", "#4a4f55", 0.8),
    "white": material("Superstructure", "#dcdcd6", 0.6),
    "glass": material("Windows", "#0d141c", 0.15, 0.4),
    "funnel": material("Funnel", "#e2601f", 0.5),
    "black": material("Funnel top", "#151515", 0.8),
    "text": material("Lettering", "#f1f1ec", 0.5),
    "box": material("Containers", "#ffffff", 0.65, 0.25, vcol=True),
    "hatch": material("Hatch covers", "#3b3f45", 0.8, 0.2),
}


def link(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ---------- hull ----------
def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def keel_z(x):
    if x < -120:  # stern: the bottom sweeps up to the transom
        return KEEL + 12.0 * ((-120 - x) / (-120 - X0)) ** 1.6
    if x > 140:  # forefoot rounds up into the raked stem
        return KEEL + 24.0 * ((x - 140) / (X1 - 140)) ** 2.2
    return KEEL


def half_width(x, z):
    """Half breadth at (x, z): box-shaped midbody, fine V-shaped bow with flare, wide transom."""
    if x > 70:
        u = (x - 70) / (X1 - 70)
        plan = 1 - u ** 1.35  # tapers from the parallel midbody into a sharp stem
        p = 1.6 + 6.4 * (1 - u)  # section fullness: 8 = boxy, 1.6 = sharp V
    elif x < -120:
        u = (-120 - x) / (-120 - X0)
        plan = 1 - 0.22 * u * u
        p = 8 - 4.5 * u
    else:
        plan, p = 1.0, 8.0
    k = keel_z(x)
    h = min(max((DECK - z) / max(DECK - k, 1e-3), 0.0), 1.0)  # 0 at deck, 1 at keel
    return B / 2 * max(plan, 0.0) * max(1 - h ** p, 0.0) ** (1 / p)


def build_hull():
    NX, NZ = 120, 18
    bm = bmesh.new()
    xs = [X0 + L * (0.5 - 0.5 * math.cos(math.pi * i / (NX - 1))) for i in range(NX)]  # denser at the ends
    rings = []
    for x in xs:
        k = keel_z(x)
        zs = [DECK - (DECK - k) * (j / (NZ - 1)) ** 1.25 for j in range(NZ)]  # deck -> keel
        star = [bm.verts.new((x, half_width(x, z), z)) for z in zs]
        port = [bm.verts.new((x, -half_width(x, z), z)) for z in reversed(zs[:-1])]
        rings.append(star + port)  # starboard deck -> keel -> port deck
    for a, b in zip(rings, rings[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    bm.faces.new(list(reversed(rings[0])))  # transom
    deck = [r[0] for r in rings] + [r[-1] for r in reversed(rings)]
    deck_face = bm.faces.new(deck)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)  # the stem collapses to a line
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if not f.is_valid:
            continue
        zc = f.calc_center_median().z
        f.material_index = 2 if f is deck_face else (1 if zc < BOOT_TOP else 0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return link("Hull", bm, [M["hull"], M["bottom"], M["deck"]])


# ---------- boxes (superstructure, containers) ----------
FACES = {"-x": (0, 1, 3, 2), "+x": (4, 6, 7, 5), "-y": (0, 4, 5, 1), "+y": (2, 3, 7, 6), "-z": (0, 2, 6, 4), "+z": (1, 5, 7, 3)}


def box(bm, x0, x1, y0, y1, z0, z1, mat=0, color=None, col_layer=None, skip=()):
    """Axis-aligned box; `skip` names faces that can never be seen (saves overdraw)."""
    vs = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for name, q in FACES.items():
        if name in skip:
            continue
        f = bm.faces.new([vs[i] for i in q])
        f.material_index = mat
        if color is not None:
            for loop in f.loops:
                loop[col_layer] = (*color, 1.0)


def build_superstructure():
    bm = bmesh.new()
    # accommodation block, aft
    ax0, ax1, aw, top = -132.0, -116.0, 17.0, DECK + 40.0
    box(bm, ax0, ax1, -aw, aw, DECK, top - 4, 0)
    box(bm, ax0 - 1, ax1 + 1.5, -B / 2 - 1.5, B / 2 + 1.5, top - 4, top, 0)  # bridge deck with wings
    box(bm, ax0 + 3, ax1 - 3, -3, 3, top, top + 9, 0)  # radar mast
    # window bands on the front, back and sides, one per deck (2.9 m)
    z = DECK + 3.0
    while z < top - 5:
        box(bm, ax1, ax1 + 0.15, -aw + 1, aw - 1, z, z + 1.1, 1)
        box(bm, ax0 - 0.15, ax0, -aw + 1, aw - 1, z, z + 1.1, 1)
        box(bm, ax0 + 1, ax1 - 1, aw, aw + 0.15, z, z + 1.1, 1)
        box(bm, ax0 + 1, ax1 - 1, -aw - 0.15, -aw, z, z + 1.1, 1)
        z += 2.9
    box(bm, ax1 + 1.5, ax1 + 1.65, -B / 2 - 1, B / 2 + 1, top - 3.2, top - 1.2, 1)  # bridge windows
    # funnel behind the accommodation, Hapag-Lloyd orange with a black top
    fx0, fx1 = -152.0, -140.0
    box(bm, fx0, fx1, -6, 6, DECK, DECK + 30, 2)
    box(bm, fx0 - 0.2, fx1 + 0.2, -6.2, 6.2, DECK + 30, DECK + 33, 3)
    # forecastle bulwark and a small foremast
    box(bm, 150, 152, -6, 6, DECK, DECK + 12, 0)
    return link("Superstructure", bm, [M["white"], M["glass"], M["funnel"], M["black"]])


PALETTE = [  # sRGB, weight: Hapag-Lloyd orange plus a realistic mix of leased boxes, sun-faded
    ("#d0632a", 24), ("#b8693c", 9), ("#2a4f7e", 11), ("#7d8287", 14), ("#c9c8c1", 8),
    ("#8a3530", 10), ("#3d6248", 6), ("#5a3532", 8), ("#3b6870", 5), ("#a08a5a", 5),
]
BOX_L, BOX_W, BOX_H = 12.19, 2.44, 2.59  # 40 ft high cube


def pick_color():
    r = random.uniform(0, sum(w for _, w in PALETTE))
    for hex_, w in PALETTE:
        r -= w
        if r <= 0:
            break
    j = random.uniform(0.72, 1.0)  # weathering: no two boxes quite the same
    return tuple(min(c * j, 1.0) for c in srgb(hex_))


def build_containers():
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    hatch = bmesh.new()
    x = -110.0
    while x + BOX_L < 136:
        xc = x + BOX_L / 2
        w = min(half_width(x, DECK), half_width(x + BOX_L, DECK)) - 1.2
        rows = max(int(2 * w / (BOX_W + 0.08)), 0)
        bow = smooth((xc - 70) / 66)  # stacks get lower towards the bow (visibility line)
        tiers_max = round(8 - 3 * bow)
        z0 = DECK + 1.6
        box(hatch, x - 0.3, x + BOX_L + 0.3, -w - 0.4, w + 0.4, DECK, z0)
        heights = [max(tiers_max - random.choice((0, 0, 0, 0, 1, 1, 2, 3)), 0) for _ in range(rows)]
        for r, tiers in enumerate(heights):
            y = (r - (rows - 1) / 2) * (BOX_W + 0.08)
            left = heights[r - 1] if r > 0 else 0
            right = heights[r + 1] if r < rows - 1 else 0
            for t in range(tiers):
                zb = z0 + t * (BOX_H + 0.02)
                # faces hidden by the box above or by a neighbour stack 8 cm away are left out
                skip = {"-z"} | ({"+z"} if t < tiers - 1 else set())
                skip |= {"-y"} if t < left else set()
                skip |= {"+y"} if t < right else set()
                box(bm, x, x + BOX_L, y - BOX_W / 2, y + BOX_W / 2, zb, zb + BOX_H, 0, pick_color(), col, skip)
        x += BOX_L + 0.9  # lashing gap between bays
    link("Hatches", hatch, [M["hatch"]])
    return link("Containers", bm, [M["box"]])


# ---------- lettering ----------
def build_name():
    font = None
    try:
        font = bpy.data.fonts.load("C:/Windows/Fonts/ariblk.ttf")
    except Exception:  # not on Windows: Blender's built-in font
        pass
    for side in (1, -1):
        bpy.ops.object.text_add(location=(0, 0, 0))
        t = bpy.context.object
        t.data.body = "HAPAG-LLOYD"
        if font:
            t.data.font = font
        t.data.size = 9.0
        t.data.extrude = 0.12
        t.data.align_x = "CENTER"
        t.data.align_y = "CENTER"
        # starboard reads bow-to-stern seen from +y, port reads stern-to-bow seen from -y
        t.rotation_euler = (math.radians(90), 0, math.radians(180) if side > 0 else 0)
        t.location = (-15, side * (B / 2 + 0.06), 7.0)
        t.data.materials.append(M["text"])
        bpy.ops.object.convert(target="MESH")
        t.name = f"Name_{'starboard' if side > 0 else 'port'}"


build_hull()
build_superstructure()
build_containers()
build_name()
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print(f"[build_ship] wrote {OUT}: {len(bpy.data.objects)} objects, {tris} faces")
