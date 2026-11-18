"""Build scene 3's hero props: a 40 ft high-cube container in parts (so Three.js can blow it open),
HAPAG-LLOYD lettering, three hologram icons for the demand drivers, and a cargo load.
Exports GLB for src/world/port.js, which clones the container.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_cargo.py -- public/models/cargo.glb
Or:              npm run build:cargo

Units are metres, Blender z up (glTF y up after export, three.js z = -Blender y). The container stands on
z = 0, centred on x = y = 0, long side along y; its doors are at y = -L/2 (three.js +z, towards the camera).
Nodes: Box (empty) > Frame, WallL (-x), WallR (+x), Roof; Lettering (on the +x wall); IconAI, IconRoute,
IconTariff (centred on their origin, ~1.6 m); Cargo (pallets filling ~40% of the box from the closed end).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import box, corrugation, link, material, profile_points  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/cargo.glb"
random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)

L, W, H = 12.19, 2.44, 2.59  # outside length, width, height (ISO 40 ft high cube)
POST = 0.16  # corner post / rail section
PITCH, DEPTH = 0.278, 0.045  # side-wall corrugation

M = {
    "wall": material("Wall", "#d2601f", 0.55, 0.3),  # Hapag orange, as scene 2
    "frame": material("Frame", "#9c4416", 0.5, 0.45),
    "steel": material("Fittings", "#2f343a", 0.4, 0.8),
    "floor": material("Floor", "#5a4634", 0.85),
    "letter": material("Lettering", "#f4f1ec", 0.6),
    "holo": material("Holo", "#4fd8ea", 0.3),
    "carton": material("Carton", "#b58a5c", 0.85),
    "pallet": material("Pallet", "#8a6a45", 0.9),
    "strap": material("Strap", "#d9d4c7", 0.6),
}


def bevel(ob, width=0.012):
    """Rounded hard edges catch the floodlights; a perfectly sharp box reads as a toy."""
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width, mod.segments, mod.limit_method = width, 2, "ANGLE"
    mod.harden_normals = True
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def sheet_x(bm, side, mat):
    """Corrugated side wall at x = side * W/2, outward profile, between the rails; both faces (it flies off)."""
    ys = [y - (L / 2 - POST) for y in profile_points(L - 2 * POST, PITCH)]
    z0, z1 = POST, H - POST
    for y0, y1 in zip(ys, ys[1:]):
        x0 = side * (W / 2 - 0.02 + DEPTH - corrugation(y0 + L / 2 + 1e-4, PITCH, DEPTH))
        x1 = side * (W / 2 - 0.02 + DEPTH - corrugation(y1 + L / 2 - 1e-4, PITCH, DEPTH))
        pts = [(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)]
        f = bm.faces.new([bm.verts.new(p) for p in (pts if side > 0 else pts[::-1])])
        f.material_index = mat


def build_frame():
    """Corner posts, rails, corner castings, floor, the closed end and the doors with locking bars."""
    bm = bmesh.new()
    hx, hy = W / 2, L / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, y0 = (hx - POST if sx > 0 else -hx), (hy - POST if sy > 0 else -hy)
            box(bm, x0, x0 + POST, y0, y0 + POST, 0, H, 1)  # corner post
            for z in (0, H - 0.17):  # corner castings
                cx, cy = (hx - 0.18 if sx > 0 else -hx - 0.005), (hy - 0.18 if sy > 0 else -hy - 0.005)
                box(bm, cx, cx + 0.185, cy, cy + 0.185, z - 0.005, z + 0.175, 2)
        box(bm, (hx - 0.12 if sx > 0 else -hx), (hx if sx > 0 else -hx + 0.12), -hy, hy, 0, POST, 1)  # bottom side rail
        box(bm, (hx - 0.1 if sx > 0 else -hx), (hx if sx > 0 else -hx + 0.1), -hy, hy, H - 0.12, H, 1)  # top side rail
    for sy in (-1, 1):  # end rails
        y0 = hy - POST if sy > 0 else -hy
        box(bm, -hx, hx, y0, y0 + POST, 0, 0.22, 1)
        box(bm, -hx, hx, y0, y0 + POST, H - 0.2, H, 1)
    box(bm, -hx + 0.1, hx - 0.1, -hy + 0.1, hy - 0.1, 0.1, 0.16, 3)  # floor
    # closed end (+y): vertical corrugation
    xs = [x - (hx - POST) for x in profile_points(W - 2 * POST, PITCH)]
    for x0, x1 in zip(xs, xs[1:]):
        y0 = hy - 0.06 + corrugation(x0 + hx + 1e-4, PITCH, 0.035)
        y1 = hy - 0.06 + corrugation(x1 + hx - 1e-4, PITCH, 0.035)
        f = bm.faces.new([bm.verts.new(p) for p in ((x0, y0, 0.22), (x1, y1, 0.22), (x1, y1, H - 0.2), (x0, y0, H - 0.2))])
        f.material_index = 0
    # doors (-y): two leaves, horizontal panels, four locking bars with cams and handles
    for sx in (-1, 1):
        xa, xb = (0.005, hx - POST) if sx > 0 else (-hx + POST, -0.005)
        box(bm, xa, xb, -hy, -hy + 0.05, 0.22, H - 0.2, 0)
        for k in range(4):  # pressed panels
            z = 0.42 + k * 0.52
            box(bm, xa + 0.06, xb - 0.06, -hy - 0.012, -hy, z, z + 0.32, 0)
        for xb_ in ((xa + 0.28, xa + 0.72) if sx > 0 else (xb - 0.72, xb - 0.28)):
            box(bm, xb_ - 0.026, xb_ + 0.026, -hy - 0.07, -hy - 0.02, 0.12, H - 0.08, 2)  # locking bar
            for z in (0.12, H - 0.16):
                box(bm, xb_ - 0.05, xb_ + 0.05, -hy - 0.09, -hy - 0.02, z, z + 0.08, 2)  # cam keeper
            box(bm, xb_ - 0.02, xb_ + 0.2 * sx, -hy - 0.11, -hy - 0.07, 1.0, 1.06, 2)  # handle
        for z in (0.5, 1.3, 2.1):  # hinges
            hxp = hx - 0.02 if sx > 0 else -hx + 0.02
            box(bm, min(hxp, hxp - 0.12 * sx), max(hxp, hxp - 0.12 * sx), -hy - 0.06, -hy, z, z + 0.12, 2)
    box(bm, -hx, hx, -hy - 0.02, -hy + 0.05, H - 0.22, H - 0.12, 1)  # door header
    return bevel(link("Frame", bm, [M["wall"], M["frame"], M["steel"], M["floor"]]))


def build_walls():
    out = []
    for name, side in (("WallL", -1), ("WallR", 1)):
        bm = bmesh.new()
        sheet_x(bm, side, 0)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
        out.append(link(name, bm, [M["wall"]]))
    bm = bmesh.new()
    ys = [y - (L / 2 - POST) for y in profile_points(L - 2 * POST, 0.24)]
    for y0, y1 in zip(ys, ys[1:]):
        z0 = H - 0.03 + corrugation(y0 + L / 2 + 1e-4, 0.24, 0.03)
        z1 = H - 0.03 + corrugation(y1 + L / 2 - 1e-4, 0.24, 0.03)
        bm.faces.new([bm.verts.new(p) for p in ((-W / 2 + 0.1, y0, z0), (W / 2 - 0.1, y0, z0), (W / 2 - 0.1, y1, z1), (-W / 2 + 0.1, y1, z1))])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    out.append(link("Roof", bm, [M["wall"]]))
    return out


def build_lettering():
    """HAPAG-LLOYD on the +x wall, reading left to right seen from +x (text: x -> +y, normal -> +x)."""
    cu = bpy.data.curves.new("LetteringCurve", "FONT")
    cu.body, cu.size, cu.extrude, cu.align_x, cu.align_y = "HAPAG-LLOYD", 0.62, 0.006, "CENTER", "CENTER"
    tmp = bpy.data.objects.new("tmp", cu)
    bpy.context.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    rot = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0))).to_4x4()  # columns: x->(0,1,0), y->(0,0,1), z->(1,0,0)
    me.transform(rot)
    me.materials.append(M["letter"])
    ob = bpy.data.objects.new("Lettering", me)
    bpy.context.collection.objects.link(ob)
    ob.location = (W / 2 + DEPTH + 0.01, 0.6, H * 0.62)
    return ob


def sweep(bm, pts, r, mat):
    """Square tube along a polyline (the route arrow)."""
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a)
        rings.append([bm.verts.new(p + r * (math.cos(k * math.pi / 2) * a + math.sin(k * math.pi / 2) * b)) for k in range(4)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(4):
            f = bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
            f.material_index = mat


def build_icons():
    out = []
    # AI: a chip (die, package, pins on all four sides), standing up to face the doors.
    bm = bmesh.new()
    box(bm, -0.6, 0.6, -0.07, 0.07, -0.6, 0.6, 0)
    box(bm, -0.32, 0.32, -0.12, -0.07, -0.32, 0.32, 0)
    for k in range(7):
        u = -0.45 + k * 0.15
        box(bm, u - 0.035, u + 0.035, -0.03, 0.03, 0.6, 0.82, 0)
        box(bm, u - 0.035, u + 0.035, -0.03, 0.03, -0.82, -0.6, 0)
        box(bm, 0.6, 0.82, -0.03, 0.03, u - 0.035, u + 0.035, 0)
        box(bm, -0.82, -0.6, -0.03, 0.03, u - 0.035, u + 0.035, 0)
    out.append(link("IconAI", bm, [M["holo"]]))
    # Re-routing: a globe and an arrow arcing over it.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.62)
    for f in bm.faces:
        f.material_index = 0
    arc = [Vector((0.95 * math.cos(a), 0.0, 0.95 * math.sin(a))) for a in [math.radians(200 - k * 8) for k in range(24)]]
    sweep(bm, arc, 0.045, 0)
    end, tangent = arc[-1], (arc[-1] - arc[-2]).normalized()
    cone = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.14, radius2=0.0, depth=0.3)
    rot = tangent.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(end + tangent * 0.15) @ rot, verts=cone["verts"])
    out.append(link("IconRoute", bm, [M["holo"]]))
    # Tariff front-loading: cartons stacked ahead of a clock.
    bm = bmesh.new()
    for (x, z) in ((-0.55, -0.7), (-0.05, -0.7), (-0.3, -0.25)):
        box(bm, x - 0.22, x + 0.22, -0.22, 0.22, z, z + 0.42, 0)
    clock = bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=0.42)
    bmesh.ops.rotate(bm, verts=clock["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    bmesh.ops.translate(bm, verts=clock["verts"], vec=(0.45, 0, 0.15))
    for k in range(12):
        a = k * math.pi / 6
        cx, cz = 0.45 + 0.34 * math.cos(a), 0.15 + 0.34 * math.sin(a)
        box(bm, cx - 0.025, cx + 0.025, -0.05, -0.01, cz - 0.025, cz + 0.025, 0)
    box(bm, 0.43, 0.47, -0.06, -0.02, 0.15, 0.45, 0)  # minute hand
    box(bm, 0.45, 0.68, -0.06, -0.02, 0.13, 0.17, 0)  # hour hand
    out.append(link("IconTariff", bm, [M["holo"]]))
    return out


def build_cargo():
    """Double-stacked pallets of cartons from the closed end, ~40% of the box."""
    bm = bmesh.new()
    y_end = L / 2 - 0.25
    for row in range(5):  # along the box
        y1 = y_end - row * 1.22
        for sx in (-1, 1):  # two across
            x0 = 0.04 if sx > 0 else -1.04
            for tier in range(2):
                z = 0.16 + tier * 1.12
                box(bm, x0, x0 + 1.0, y1 - 1.2, y1, z, z + 0.14, 1)  # pallet
                for i in range(2):
                    for j in range(2):
                        for k in range(2):
                            jx, jy = random.uniform(-0.01, 0.01), random.uniform(-0.01, 0.01)
                            cx, cy, cz = x0 + i * 0.5 + jx, y1 - 1.2 + j * 0.6 + jy, z + 0.14 + k * 0.46
                            box(bm, cx + 0.01, cx + 0.49, cy + 0.01, cy + 0.59, cz, cz + 0.45, 0)
                box(bm, x0 - 0.005, x0 + 1.005, y1 - 0.62, y1 - 0.58, z + 0.14, z + 1.06, 2)  # strap
    return bevel(link("Cargo", bm, [M["carton"], M["pallet"], M["strap"]]), 0.008)


root = bpy.data.objects.new("Box", None)
bpy.context.collection.objects.link(root)
for ob in [build_frame(), *build_walls()]:
    ob.parent = root
build_lettering()
for i, ob in enumerate(build_icons()):
    ob.location = (8 + 3 * i, 0, 1.4)  # out of the way; port.js places them
cargo = build_cargo()

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print(f"[build_cargo] wrote {OUT}")
