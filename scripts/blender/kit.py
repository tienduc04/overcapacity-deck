"""Small helpers shared by the Blender build scripts (materials, mesh linking, UV-mapped boxes)."""
import bpy


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


def link(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


FACES = {"-x": (0, 1, 3, 2), "+x": (4, 6, 7, 5), "-y": (0, 4, 5, 1), "+y": (2, 3, 7, 6), "-z": (0, 2, 6, 4), "+z": (1, 5, 7, 3)}
UV_AXES = {"-x": (1, 2), "+x": (1, 2), "-y": (0, 2), "+y": (0, 2), "-z": (0, 1), "+z": (0, 1)}


def box(bm, x0, x1, y0, y1, z0, z1, mat=0, color=None, col_layer=None, skip=(), uv_origin=(0, 0, 0), uv_scale=1.0):
    """Axis-aligned box; `skip` names faces that can never be seen (saves overdraw).
    UVs are (coordinate - uv_origin) / uv_scale on the two axes of each face (metres by default)."""
    uv = bm.loops.layers.uv.verify()
    vs = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for name, q in FACES.items():
        if name in skip:
            continue
        f = bm.faces.new([vs[i] for i in q])
        f.material_index = mat
        a, b = UV_AXES[name]
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co[a] - uv_origin[a]) / uv_scale, (co[b] - uv_origin[b]) / uv_scale)
            if color is not None:
                loop[col_layer] = (*color, 1.0)


def corrugation(u, pitch, depth):
    """Trapezoid sheet profile: depth (towards the inside) at position u along the sheet."""
    f = (u / pitch) % 1.0
    if f < 0.3:
        return 0.0
    if f < 0.5:
        return depth * (f - 0.3) / 0.2
    if f < 0.8:
        return depth
    return depth * (1.0 - (f - 0.8) / 0.2)


def profile_points(length, pitch):
    """Break points of the trapezoid profile along [0, length]."""
    pts = []
    k = 0
    while k * pitch < length:
        for f in (0.0, 0.3, 0.5, 0.8):
            u = k * pitch + f * pitch
            if u < length:
                pts.append(u)
        k += 1
    return pts + [length]
