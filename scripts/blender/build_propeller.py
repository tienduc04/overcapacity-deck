"""Build scene 5's propeller: a five-bladed fixed-pitch bronze ship propeller with boss and nose cap.
Exports GLB for src/world/prop.js.

Run (headless):  blender -b --factory-startup --python scripts/blender/build_propeller.py -- public/models/propeller.glb [preview_dir]
Or:              npm run build:propeller

Each blade is lofted through radial sections with a NACA 4-digit thickness profile (round leading edge,
sharp trailing edge, thin at the tip), a pitch angle that follows constant pitch P (tan(phi) = P / (2 pi r)),
a cambered back and a flat face, skew (the blade sweeps back in the direction of rotation) and rake.
Units are metres, Blender z up along the shaft; the nose cap points to +z. The mesh is one object
"Propeller" with the single material "Bronze"; UV u runs along the blade (0 root .. 1 tip), v around the section.
"""
import math
import os
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import link, material  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "public/models/propeller.glb"
PREVIEW = argv[1] if len(argv) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)

R = 4.2  # radius
R_ROOT = 0.7  # blades start inside the boss
BLADES = 5
PITCH = 6.2  # P: advance per turn (P/D about 0.74)
C_MAX = 2.0  # widest chord
SKEW = 1.8  # tangential sweep at the tip
RAKE = 0.5  # axial sweep back at the tip
NR = 34  # radial sections
NS = 26  # points along the chord per side
M = {"bronze": material("Bronze", "#c98d4d", 0.35, 1.0)}


def chord(x):
    """Chord length at relative radius x (0 root .. 1 tip): narrow root, widest at 0.52, rounded tip."""
    if x < 0.52:
        g = 1 - ((x - 0.52) / 0.52) ** 2
        return C_MAX * (0.5 + 0.5 * g)
    return C_MAX * max(1 - ((x - 0.52) / 0.48) ** 2, 0.0) ** 0.5


def thickness_ratio(x):
    return 0.17 - 0.12 * x ** 0.8  # thick root, thin tip


def naca_t(s):
    """NACA 4-digit half-thickness for unit thickness ratio at chord fraction s."""
    return 5 * (0.2969 * math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1015 * s ** 4)


def blade_section(x):
    """Points of the closed section at relative radius x, as (q, n) in chord-aligned coordinates
    (q along the chord from the leading edge, n normal to it, +n = the back/suction side)."""
    c = max(chord(x), 0.14)
    t = thickness_ratio(x)
    pts = []
    ss = [0.5 * (1 - math.cos(math.pi * i / (NS - 1))) for i in range(NS)]  # cosine spacing: dense at the edges
    camber = lambda s: 0.035 * (1 - x * 0.5) * 4 * s * (1 - s)
    # face (flat) leading edge -> trailing edge, then back side trailing edge -> leading edge
    for s in ss:
        pts.append((s * c, -naca_t(s) * t * c * 0.45 + camber(s) * c * 0.2))
    for s in reversed(ss[:-1]):
        pts.append((s * c, naca_t(s) * t * c * 1.55 + camber(s) * c))
    return pts, c


def build_blade(bm, uv_layer, k):
    """One blade, rotated about the shaft by k * 72 degrees. Returns nothing; faces go into bm."""
    ang = 2 * math.pi * k / BLADES
    rings = []
    for i in range(NR):
        x = i / (NR - 1) * 0.994
        r = R_ROOT + (R - R_ROOT) * x
        phi = math.atan2(PITCH, 2 * math.pi * r)  # pitch angle of this section
        pts, c = blade_section(x)
        skew = SKEW * x ** 2.2  # tangential
        rake = RAKE * x ** 1.6  # axial, aft
        ring = []
        for q, n in pts:
            q -= 0.42 * c  # reference line at 42% chord
            # chord direction = tangent*cos(phi) + axial*sin(phi); normal = -tangent*sin(phi) + axial*cos(phi)
            tan = q * math.cos(phi) - n * math.sin(phi) + skew
            ax = q * math.sin(phi) + n * math.cos(phi) - rake
            # radial r along x, tangential along y, axial along z; then rotate by the blade angle
            ring.append((r * math.cos(ang) - tan * math.sin(ang), r * math.sin(ang) + tan * math.cos(ang), ax))
        rings.append([bm.verts.new(p) for p in ring])
    m = len(rings[0])
    for i in range(NR - 1):
        for j in range(m):
            a, b = rings[i][j], rings[i][(j + 1) % m]
            c2, d = rings[i + 1][(j + 1) % m], rings[i + 1][j]
            f = bm.faces.new([a, b, c2, d])
            f.smooth = True
            for loop in f.loops:
                vi = loop.vert
                ri = next(ii for ii, rr in enumerate(rings) if vi in rr)
                ji = rings[ri].index(vi)
                loop[uv_layer].uv = (ri / (NR - 1), ji / m * 2)
    tip = rings[-1]  # close the tip
    f = bm.faces.new(tip[::-1])
    f.smooth = True
    for loop in f.loops:
        loop[uv_layer].uv = (1.0, 0.0)


def build_boss(bm, uv_layer):
    """Boss and nose cap: a body of revolution about z."""
    profile = [(0.001, -1.3), (0.5, -1.28), (0.82, -1.05), (0.97, -0.6), (1.02, -0.2), (1.04, 0.5), (0.98, 0.95), (0.8, 1.35), (0.52, 1.62), (0.2, 1.78), (0.001, 1.82)]
    seg = 64
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * s / seg), r * math.sin(2 * math.pi * s / seg), z)) for s in range(seg)])
    for i in range(len(profile) - 1):
        for s in range(seg):
            a, b = rings[i][s], rings[i][(s + 1) % seg]
            c2, d = rings[i + 1][(s + 1) % seg], rings[i + 1][s]
            try:
                f = bm.faces.new([a, d, c2, b] if i == 0 else [a, b, c2, d])
            except ValueError:
                continue
            f.smooth = True
            for loop in f.loops:
                ri = next(ii for ii, rr in enumerate(rings) if loop.vert in rr)
                si = rings[ri].index(loop.vert)
                loop[uv_layer].uv = (0.4 + 0.1 * ri / len(profile), si / seg * 2)  # u > 0.3: no verdigris on the boss
    # six bolt heads on the nose cap
    for s in range(6):
        a = 2 * math.pi * s / 6
        cx, cy, cz = 0.62 * math.cos(a), 0.62 * math.sin(a), 1.5
        ring = [bm.verts.new((cx + 0.11 * math.cos(2 * math.pi * t / 8), cy + 0.11 * math.sin(2 * math.pi * t / 8), cz + 0.04)) for t in range(8)]
        top = bm.verts.new((cx, cy, cz + 0.12))
        for t in range(8):
            try:
                f = bm.faces.new([ring[t], ring[(t + 1) % 8], top])
                f.smooth = True
                for loop in f.loops:
                    loop[uv_layer].uv = (0.45, 0.5)
            except ValueError:
                pass


bm = bmesh.new()
uv = bm.loops.layers.uv.verify()
for k in range(BLADES):
    build_blade(bm, uv, k)
build_boss(bm, uv)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
ob = link("Propeller", bm, [M["bronze"]])
for p in ob.data.polygons:
    p.use_smooth = True

faces = len(ob.data.polygons)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print(f"[build_propeller] wrote {OUT}: {faces} faces, {len(ob.data.vertices)} vertices")

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "MATCAP"
    scene.display.shading.studio_light = "basic_side.exr"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.85, 0.55, 0.25)
    scene.render.resolution_x, scene.render.resolution_y = 960, 960
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("W")
    scene.world.color = (0.05, 0.08, 0.1)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector

    for name, loc in {"front": (0, 0, 16), "three_quarter": (9, -10, 8), "side": (14, 0, 0.3)}.items():
        cam.location = loc
        look = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y")
        cam.rotation_euler = look.to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{name}.png")
        bpy.ops.render.render(write_still=True)
    print(f"[build_propeller] previews in {PREVIEW}")
