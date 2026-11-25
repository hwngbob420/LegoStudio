"""Procedural minifigure builder + 6-joint rig (Blender 5.x).

Parts are rigid meshes parented to armature bones (no deformation, no mouth geometry).
All bones point straight up (+Z) with roll 0, so for every bone:
    local X = side axis  (rot X > 0 tilts the bone's top forward; a hanging arm/leg swings BACK)
    local Y = vertical   (rot Y = twist, e.g. head turn; > 0 turns toward the figure's left)
    local Z = forward    (rot Z = sideways roll)
The figure faces -Y in its own space. Its left side is +X.

Heads are smooth cylinders whose material is the 2D face atlas (see look_dev.face_material).
"""
from __future__ import annotations
import json, math, os
import bpy, bmesh
from mathutils import Matrix, Vector

import look_dev as LD

RECIPES = os.path.join(LD.VAULT, "minifig_recipes")
TEX = os.path.join(LD.ASSETS, "textures")

# key dimensions (metres, 10x real)
HIP_Z = 0.125
LEG_W = 0.075
TORSO_Z0, TORSO_Z1 = 0.14, 0.268
TORSO_WB, TORSO_WT, TORSO_D = 0.156, 0.12, 0.078
NECK_Z1 = 0.284
HEAD_R, HEAD_Z0, HEAD_Z1 = 0.049, 0.284, 0.374
SHOULDER = Vector((0.064, 0.0, 0.252))
FACE_ARC = math.radians(LD.FACE_SPEC["head_uv"]["arc_degrees"])

BONES = {  # name: (head, parent)
    "root": ((0, 0, 0), None),
    "hips": ((0, 0, HIP_Z), "root"),
    "leg.L": ((LEG_W / 2 + 0.002, 0, HIP_Z), "hips"),
    "leg.R": ((-LEG_W / 2 - 0.002, 0, HIP_Z), "hips"),
    "torso": ((0, 0, TORSO_Z0), "hips"),
    "head": ((0, 0, TORSO_Z1 + 0.004), "torso"),
    "arm.L": ((SHOULDER.x, 0, SHOULDER.z), "torso"),
    "arm.R": ((-SHOULDER.x, 0, SHOULDER.z), "torso"),
    "hand.L": ((0.084, -0.052, 0.175), "arm.L"),
    "hand.R": ((-0.084, -0.052, 0.175), "arm.R"),
}


# ------------------------------------------------------------------ geometry helpers
def _cyl(bm, r1, r2, z0, z1, segs=32, center=(0, 0), axis_m=None):
    m = Matrix.Translation((center[0], center[1], (z0 + z1) / 2))
    if axis_m is not None:
        m = axis_m @ Matrix.Translation((0, 0, (z0 + z1) / 2))
    return bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=z1 - z0, matrix=m)


def _bevel_edges(bm, edges, off, segs=3):
    if edges:
        bmesh.ops.bevel(bm, geom=list(edges), offset=off, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)


def _mesh(name, bm, smooth=True, angle=40):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass
    return me


_CACHE: dict = {}


def mesh_leg(side):
    key = f"MF_leg_{side}"
    if key in _CACHE:
        return _CACHE[key]
    bm = bmesh.new()
    s = 1 if side == "L" else -1
    x0, x1 = (0.003, LEG_W) if s > 0 else (-LEG_W, -0.003)
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r["verts"]:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = -0.034 if v.co.y < 0 else 0.038
        v.co.z = 0.032 if v.co.z < 0 else HIP_Z - 0.006
    r2 = bmesh.ops.create_cube(bm, size=1)   # foot block, extends forward
    for v in r2["verts"]:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = -0.05 if v.co.y < 0 else 0.038
        v.co.z = 0.0 if v.co.z < 0 else 0.034
    _bevel_edges(bm, bm.edges, 0.004, 2)
    me = _mesh(key, bm, angle=35)
    _CACHE[key] = me
    return me


def mesh_hips():
    if "MF_hips" in _CACHE:
        return _CACHE["MF_hips"]
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r["verts"]:
        v.co.x *= TORSO_WB
        v.co.y = -0.036 if v.co.y < 0 else 0.038
        v.co.z = HIP_Z - 0.004 if v.co.z < 0 else TORSO_Z0
    _bevel_edges(bm, bm.edges, 0.004, 2)
    # hinge cylinder through the hips (reads as the leg pivot)
    _cyl(bm, 0.018, 0.018, -LEG_W, LEG_W, 20, axis_m=Matrix.Translation((0, 0.0, HIP_Z)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    me = _mesh("MF_hips", bm, angle=35)
    _CACHE["MF_hips"] = me
    return me


def mesh_torso():
    if "MF_torso" in _CACHE:
        return _CACHE["MF_torso"]
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r["verts"]:
        top = v.co.z > 0
        w = TORSO_WT if top else TORSO_WB
        d = TORSO_D * (0.86 if top else 1.0)
        v.co.x = math.copysign(w / 2, v.co.x)
        v.co.y = math.copysign(d / 2, v.co.y)
        v.co.z = TORSO_Z1 if top else TORSO_Z0
    _bevel_edges(bm, bm.edges, 0.005, 3)
    # neck
    _cyl(bm, 0.030, 0.028, TORSO_Z1 - 0.002, NECK_Z1, 24)
    me = _mesh("MF_torso", bm, angle=32)
    # UVs: front faces map to 0..1 across bottom width / height; elsewhere -> outside (masked by CLIP)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        front = poly.normal.y < -0.6 and poly.center.z < TORSO_Z1 - 0.001
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if front:
                uv.data[li].uv = ((co.x + TORSO_WB / 2) / TORSO_WB, (co.z - TORSO_Z0) / (TORSO_Z1 - TORSO_Z0))
            else:
                uv.data[li].uv = (-2.0, -2.0)
    _CACHE["MF_torso"] = me
    return me


def mesh_arm(side):
    key = f"MF_arm_{side}"
    if key in _CACHE:
        return _CACHE[key]
    s = 1 if side == "L" else -1
    bm = bmesh.new()
    sh = Vector((s * SHOULDER.x, 0, SHOULDER.z))
    elbow = Vector((s * 0.080, 0.004, 0.196))
    wrist = Vector((s * 0.084, -0.040, 0.178))

    def seg(a, b, r1, r2):
        d = b - a
        m = Matrix.Translation(a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=r1, radius2=r2, depth=d.length,
                              matrix=m @ Matrix.Translation((0, 0, d.length / 2)))

    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.024, matrix=Matrix.Translation(sh))
    seg(sh, elbow, 0.023, 0.021)
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.021, matrix=Matrix.Translation(elbow))
    seg(elbow, wrist, 0.021, 0.017)
    me = _mesh(key, bm)
    _CACHE[key] = me
    return me


def mesh_hand(side):
    """C-claw hand: a torus with a gap, plus a wrist peg."""
    key = f"MF_hand_{side}"
    if key in _CACHE:
        return _CACHE[key]
    s = 1 if side == "L" else -1
    bm = bmesh.new()
    R, r, gap = 0.019, 0.0085, math.radians(70)
    nu, nv = 28, 12
    rings = []
    for i in range(nu + 1):
        a = gap / 2 + (2 * math.pi - gap) * i / nu
        ring = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % nv], rings[i][(j + 1) % nv]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    # orient: ring plane faces forward-ish, opening forward
    hand_c = Vector((s * 0.086, -0.066, 0.168))
    m = Matrix.Translation(hand_c) @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Rotation(math.radians(-25), 4, "Y")
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    # wrist peg
    seg_a = Vector((s * 0.084, -0.040, 0.178))
    d = hand_c - seg_a
    mm = Matrix.Translation(seg_a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.009, radius2=0.009, depth=d.length * 0.7,
                          matrix=mm @ Matrix.Translation((0, 0, d.length * 0.35)))
    me = _mesh(key, bm)
    _CACHE[key] = me
    return me


def mesh_head():
    """Smooth cylinder head with rounded rims, top stud, and face UVs across the front arc."""
    if "MF_head" in _CACHE:
        return _CACHE["MF_head"]
    bm = bmesh.new()
    r = _cyl(bm, HEAD_R, HEAD_R, HEAD_Z0 + 0.002, HEAD_Z1, 64)
    rims = [e for e in bm.edges if all(abs(abs(v.co.z - (HEAD_Z0 + HEAD_Z1 + 0.002) / 2) - (HEAD_Z1 - HEAD_Z0 - 0.002) / 2) < 1e-5 for v in e.verts)
            and all(Vector((v.co.x, v.co.y)).length > HEAD_R * 0.99 for v in e.verts)]
    _bevel_edges(bm, rims, 0.012, 5)
    # top stud (hidden by most hair, visible on bald / cap-less figs)
    _cyl(bm, 0.03, 0.03, HEAD_Z1 - 0.001, HEAD_Z1 + 0.016, 32)
    me = _mesh("MF_head", bm, angle=50)
    uv = me.uv_layers.new(name="UVMap")
    h = HEAD_Z1 - HEAD_Z0
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(co.x, -co.y)            # 0 at front (-Y), + toward +X
            u = (a + FACE_ARC / 2) / FACE_ARC
            v = (co.z - HEAD_Z0) / h
            if Vector((co.x, co.y)).length < HEAD_R * 0.8:  # caps / stud
                u, v = -2.0, -2.0
            uv.data[li].uv = (u, v)
    _CACHE["MF_head"] = me
    return me


def _sphere_cap(bm, center, R, cutoff_fn, scale=(1, 1, 1), segs=(40, 24)):
    r = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=R,
                                  matrix=Matrix.Translation(center) @ Matrix.Diagonal(Vector(scale).to_4d()))
    kill = [v for v in r["verts"] if cutoff_fn(v.co)]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    # give the shell thickness so cut edges don't look paper-thin
    edges = [e for e in bm.edges if e.is_boundary]
    if edges:
        ext = bmesh.ops.extrude_edge_only(bm, edges=edges)
        vs = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
        for v in vs:
            d = (v.co - Vector(center))
            d.z = 0
            if d.length > 1e-6:
                v.co -= d.normalized() * 0.006


def mesh_hair(style):
    key = f"MF_hair_{style}"
    if key in _CACHE:
        return _CACHE[key]
    bm = bmesh.new()
    c = Vector((0, 0.005, 0.350))
    R = 0.0585

    def hairline(co, front_z=0.361, back_z=0.300):
        t = max(0.0, min(1.0, (co.y + 0.02) / 0.06))
        return co.z < front_z * (1 - t) + back_z * t

    if style in ("messy", "short_crop", "ponytail", "bun", "bob"):
        sc = (1.0, 1.0, 0.95 if style != "short_crop" else 0.86)
        back = {"bob": 0.288, "short_crop": 0.312}.get(style, 0.296)
        front = {"short_crop": 0.359}.get(style, 0.356)
        _sphere_cap(bm, c, R if style != "short_crop" else 0.0555, lambda co: hairline(co, front, back), sc)
    if style == "messy":
        for k in range(9):
            a = k / 9 * 2 * math.pi
            base = Vector((0.030 * math.cos(a), 0.030 * math.sin(a) + 0.006, 0.383))
            tip = base + Vector((0.026 * math.cos(a), 0.026 * math.sin(a), 0.022 + 0.008 * (k % 3)))
            d = tip - base
            m = Matrix.Translation(base) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.016, radius2=0.002, depth=d.length,
                                  matrix=m @ Matrix.Translation((0, 0, d.length / 2)))
        # front fringe swoop
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.03,
                                  matrix=Matrix.Translation((0.018, -0.03, 0.372)) @ Matrix.Diagonal((1.3, 0.7, 0.55, 1)))
    elif style == "ponytail":
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.024,
                                  matrix=Matrix.Translation((0, 0.068, 0.322)) @ Matrix.Diagonal((0.9, 0.9, 1.9, 1)))
        _cyl(bm, 0.012, 0.012, 0.36, 0.372, 16, axis_m=Matrix.Translation((0, 0.06, 0)))
    elif style == "bun":
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.03,
                                  matrix=Matrix.Translation((0, 0.022, 0.402)))
    elif style == "cap":
        _sphere_cap(bm, c, 0.056, lambda co: co.z < 0.352, (1, 1, 0.85))
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.05, radius2=0.05, depth=0.006,
                                  matrix=Matrix.Translation((0, -0.05, 0.356)) @ Matrix.Diagonal((1.0, 0.85, 1, 1)))
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.008, matrix=Matrix.Translation((0, 0.004, 0.395)))
    me = _mesh(key, bm, angle=60)
    _CACHE[key] = me
    return me


def mesh_glasses(kind):
    key = f"MF_glasses_{kind}"
    if key in _CACHE:
        return _CACHE[key]
    bm = bmesh.new()
    z = HEAD_Z0 + 0.60 * (HEAD_Z1 - HEAD_Z0)
    for sx in (-1, 1):
        cx = sx * 0.026
        n = 28
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            if kind == "round":
                x, y = 0.017 * math.cos(a), 0.016 * math.sin(a)
            else:
                ca, sa = math.cos(a), math.sin(a)
                k = max(abs(ca) / 0.019, abs(sa) / 0.0135)
                x, y = ca / k, sa / k
            pts.append(Vector((cx + x, -0.0505 - 0.006 * (abs(cx + x) / 0.05) ** 2 * -1, z + y)))
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            d = b - a
            m = Matrix.Translation(a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
            bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=0.0023, radius2=0.0023, depth=d.length * 1.15,
                                  matrix=m @ Matrix.Translation((0, 0, d.length / 2)))
        # temple arm
        a = Vector((sx * 0.044, -0.046, z + 0.004)); b = Vector((sx * 0.051, 0.0, z + 0.006))
        d = b - a
        m = Matrix.Translation(a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.0022, radius2=0.0022, depth=d.length,
                              matrix=m @ Matrix.Translation((0, 0, d.length / 2)))
    a = Vector((-0.009, -0.052, z + 0.003)); b = Vector((0.009, -0.052, z + 0.003))
    d = b - a
    m = Matrix.Translation(a) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.0022, radius2=0.0022, depth=d.length,
                          matrix=m @ Matrix.Translation((0, 0, d.length / 2)))
    me = _mesh(key, bm)
    _CACHE[key] = me
    return me


def mesh_mug():
    if "MF_mug" in _CACHE:
        return _CACHE["MF_mug"]
    bm = bmesh.new()
    _cyl(bm, 0.022, 0.02, 0.0, 0.05, 24)
    # handle (half torus)
    R, r = 0.014, 0.004
    rings = []
    for i in range(13):
        a = -math.pi / 2 + math.pi * i / 12
        ring = []
        for j in range(8):
            b = 2 * math.pi * j / 8
            ring.append(bm.verts.new((0.022 + (R + r * math.cos(b)) * math.cos(a) - 0.003, r * math.sin(b),
                                      0.025 + (R + r * math.cos(b)) * math.sin(a))))
        rings.append(ring)
    for i in range(12):
        for j in range(8):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % 8], rings[i][(j + 1) % 8]))
    me = _mesh("MF_mug", bm)
    _CACHE["MF_mug"] = me
    return me


# ------------------------------------------------------------------ assembly
def load_recipe(fig_id):
    return json.load(open(os.path.join(RECIPES, f"{fig_id}.json"), encoding="utf-8"))


def _link(ob, coll):
    coll.objects.link(ob)
    return ob


def _part(name, me, mat, coll):
    ob = bpy.data.objects.new(name, me)
    if not me.materials:
        me.materials.append(None)
    ob.material_slots[0].link = "OBJECT"
    ob.material_slots[0].material = mat
    return _link(ob, coll)


def build_minifig(fig_id, coll=None, name_suffix=""):
    """Returns the armature object. Custom props on the head object: face_expr, face_mouth."""
    r = load_recipe(fig_id)
    tag = f"{r['id']}{name_suffix}"
    coll = coll or bpy.data.collections.new(f"FIG_{tag}")
    if coll.name not in bpy.context.scene.collection.children:
        try:
            bpy.context.scene.collection.children.link(coll)
        except RuntimeError:
            pass
    # armature
    ad = bpy.data.armatures.new(f"RIG_{tag}")
    rig = bpy.data.objects.new(f"RIG_{tag}", ad)
    coll.objects.link(rig)
    ad.display_type = "STICK"
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None:
            o.select_set(False)
    vl.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for bn, (head, parent) in BONES.items():
        eb = ad.edit_bones.new(bn)
        eb.head = head
        eb.tail = (head[0], head[1], head[2] + 0.04)
        eb.roll = 0.0
        if parent:
            eb.parent = ebs[parent]
        ebs[bn] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"

    abs_ = LD.abs_material
    torso_png = os.path.join(TEX, f"torso_{r['id']}.png")
    torso_mat = LD.textured_material(f"Torso_{tag}", r["torso"]["color"], torso_png) if os.path.exists(torso_png) \
        else abs_(r["torso"]["color"])
    parts = [
        ("leg.L", _part(f"{tag}_legL", mesh_leg("L"), abs_(r["legs"]), coll)),
        ("leg.R", _part(f"{tag}_legR", mesh_leg("R"), abs_(r["legs"]), coll)),
        ("hips", _part(f"{tag}_hips", mesh_hips(), abs_(r["hips"]), coll)),
        ("torso", _part(f"{tag}_torso", mesh_torso(), torso_mat, coll)),
        ("arm.L", _part(f"{tag}_armL", mesh_arm("L"), abs_(r["arms"]), coll)),
        ("arm.R", _part(f"{tag}_armR", mesh_arm("R"), abs_(r["arms"]), coll)),
        ("hand.L", _part(f"{tag}_handL", mesh_hand("L"), abs_(r["hands"]), coll)),
        ("hand.R", _part(f"{tag}_handR", mesh_hand("R"), abs_(r["hands"]), coll)),
    ]
    head = _part(f"{tag}_head", mesh_head(), LD.face_material(r["id"], r["skin"]), coll)
    parts.append(("head", head))
    hair = r.get("hair", {})
    if hair.get("style") and hair["style"] != "bald":
        parts.append(("head", _part(f"{tag}_hair", mesh_hair(hair["style"]), abs_(hair["color"]), coll)))
    for acc in r.get("accessories", []):
        if acc.startswith("glasses"):
            parts.append(("head", _part(f"{tag}_{acc}", mesh_glasses(acc.split("_")[1]), abs_("black"), coll)))
    vl.update()
    for bone, ob in parts:
        mw = ob.matrix_world.copy()
        ob.parent = rig
        ob.parent_type = "BONE"
        ob.parent_bone = bone
        vl.update()
        ob.matrix_world = mw
    # focus target at the head centre (DoF + camera aim follow the animated head)
    fe = bpy.data.objects.new(f"FOCUS_{tag}", None)
    fe.empty_display_size = 0.02
    coll.objects.link(fe)
    fe.location = (0, 0, (HEAD_Z0 + HEAD_Z1) / 2)
    vl.update()
    mw = fe.matrix_world.copy()
    fe.parent = rig
    fe.parent_type = "BONE"
    fe.parent_bone = "head"
    vl.update()
    fe.matrix_world = mw
    rig["focus_obj"] = fe.name
    spec = LD.FACE_SPEC
    expr = r.get("default_expression", "innocent_dot")
    head["face_expr"] = float(spec["eyes"].index(expr))
    head["face_mouth"] = float(spec["mouths"].index(spec["expression_rest_mouth"][expr]))
    rig["fig_id"] = r["id"]
    rig["head_obj"] = head.name
    rig["display_name"] = r["name"]
    return rig


def attach_prop(rig, prop, bone="hand.R", local=(0, 0, 0), rot_deg=(0, 0, 0)):
    """Parent a prop object to a hand bone, positioned in rest-pose space."""
    vl = bpy.context.view_layer
    pb = rig.pose.bones[bone]
    prop.parent = rig
    prop.parent_type = "BONE"
    prop.parent_bone = bone
    vl.update()
    rest = rig.matrix_world @ Matrix.Translation(Vector(local))
    prop.matrix_world = rest @ Matrix.Rotation(math.radians(rot_deg[2]), 4, "Z")
    return prop


def head_object(rig):
    return bpy.data.objects[rig["head_obj"]]


def focus_object(rig):
    return bpy.data.objects[rig["focus_obj"]]
