"""2D emotion FX drawn as Grease Pencil v3 strokes (Blender 5.x), billboarded to the camera.

The strokes are generated procedurally: sweat drops, shock emanata, ?, !, sparkles, anger veins, steam.
Each FX "pops" on with a 3-frame overshoot (stop-motion snappy), wobbles, then disappears on an empty key.
For hand-drawn FX, artists can draw on the same GP objects with nijiGPen tools; this module only needs bpy.
"""
from __future__ import annotations
import math
import bpy
from mathutils import Vector

import look_dev as LD

_MATS: dict = {}


def _gp_mat(name, stroke, fill=None):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(f"GPFX_{name}")
    bpy.data.materials.create_gpencil_data(m)
    g = m.grease_pencil
    g.color = LD.color(stroke)
    g.show_stroke = True
    if fill:
        g.show_fill = True
        g.fill_color = LD.color(fill)
    else:
        g.show_fill = False
    _MATS[name] = m
    return m


# ---- shape generators: return list of (points[(x,y)], material_key, cyclic, radius)
def _circle(cx, cy, r, n=20):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def shape_sweat():
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        r = 0.32 * (1 - 0.55 * max(0, math.sin(a))) if True else 0.3
        x = 0.30 * math.cos(a) * (1 - 0.6 * max(0.0, math.sin(a)))
        y = -0.1 + 0.30 * math.sin(a) + (0.42 * max(0.0, math.sin(a)) ** 3)
        pts.append((x, y))
    hl = [(-0.12, 0.0), (-0.1, 0.12)]
    return [(pts, "sweat", True, 0.035), (hl, "white", False, 0.03)]


def shape_shock():
    out = []
    for k in range(8):
        a = math.pi * (0.1 + 0.8 * k / 7)
        r0, r1 = 0.75, 1.15 + 0.12 * (k % 2)
        out.append(([(r0 * math.cos(a), r0 * math.sin(a)), (r1 * math.cos(a), r1 * math.sin(a))], "ink", False, 0.045))
    return out


def shape_question():
    pts = []
    for i in range(18):
        a = math.pi * (1.1 - 1.45 * i / 17)
        pts.append((0.28 * math.cos(a), 0.45 + 0.28 * math.sin(a)))
    pts += [(0.0, 0.05), (0.0, -0.1)]
    return [(pts, "ink", False, 0.07), (_circle(0, -0.35, 0.07, 10), "ink_fill", True, 0.04)]


def shape_exclaim():
    return [([(0.0, 0.7), (0.0, -0.1)], "ink", False, 0.09), (_circle(0, -0.38, 0.08, 10), "ink_fill", True, 0.04)]


def shape_sparkle():
    out = []
    for cx, cy, s in ((0, 0, 1.0), (0.55, 0.45, 0.5), (-0.45, 0.55, 0.38)):
        pts = []
        for i in range(8):
            a = math.pi / 2 + i * math.pi / 4
            r = 0.36 * s if i % 2 == 0 else 0.09 * s
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        out.append((pts, "gold", True, 0.025))
    return out


def shape_anger():
    out = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c = (0.22 * math.cos(a), 0.22 * math.sin(a))
        p0 = (c[0] + 0.18 * math.cos(a + 1.2), c[1] + 0.18 * math.sin(a + 1.2))
        p1 = (c[0] + 0.18 * math.cos(a - 1.2), c[1] + 0.18 * math.sin(a - 1.2))
        out.append(([p0, (c[0] * 0.6, c[1] * 0.6), p1], "red", False, 0.06))
    return out


def shape_steam():
    out = []
    for k, x0 in enumerate((-0.25, 0.0, 0.25)):
        pts = [(x0 + 0.08 * math.sin(i / 10 * math.pi * 2 + k), i / 10 * 0.9) for i in range(11)]
        out.append((pts, "steam", False, 0.035))
    return out


def shape_motion_arcs():
    out = []
    for k in range(3):
        r = 0.6 + 0.18 * k
        pts = [(r * math.cos(a), r * math.sin(a)) for a in [math.pi * (0.55 + 0.3 * i / 10) for i in range(11)]]
        out.append((pts, "ink", False, 0.035))
    return out


SHAPES = {"sweat_drop": shape_sweat, "shock_lines": shape_shock, "question": shape_question, "exclaim": shape_exclaim,
          "sparkle": shape_sparkle, "anger": shape_anger, "steam": shape_steam, "motion_arcs": shape_motion_arcs}
MATS = {"ink": ("#1A1618", None), "ink_fill": ("#1A1618", "#1A1618"), "sweat": ("#1A1618", "#7CC8FF"),
        "white": ("#FFFFFF", None), "gold": ("#1A1618", "#FFD43B"), "red": ("#E03131", None),
        "steam": ("#FFFFFF", None)}


def spawn_fx(kind, f0, f1, location, camera, size=0.06, coll=None, parent=None):
    """Create a billboarded GP FX object visible from frame f0 to f1 (inclusive)."""
    gp = bpy.data.grease_pencils.new(f"FX_{kind}_{f0}")
    keys = list(MATS)
    for k in keys:
        gp.materials.append(_gp_mat(k, *MATS[k]))
    ob = bpy.data.objects.new(gp.name, gp)
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = location
    if parent is not None:
        mw = ob.matrix_world.copy()
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    con = ob.constraints.new("DAMPED_TRACK")
    con.target = camera
    con.track_axis = "TRACK_Z"
    layer = gp.layers.new("fx")
    strokes = SHAPES[kind]()
    pops = [0.55, 1.18, 1.0]
    if f0 > 1:
        layer.frames.new(f0 - 1)  # empty frame before (keeps it hidden)
    for f in range(f0, f1 + 1):
        i = f - f0
        s = pops[i] if i < len(pops) else 1.0 + 0.04 * math.sin(i * 2.1)
        dy = 0.0
        if kind == "sweat_drop":
            dy = -0.05 * max(0, i - 2)
        if kind == "steam":
            dy = 0.04 * i
        fr = layer.frames.new(f)
        dr = fr.drawing
        dr.add_strokes([len(p) for p, *_ in strokes])
        for si, (pts, mk, cyc, rad) in enumerate(strokes):
            st = dr.strokes[si]
            st.cyclic = cyc
            st.material_index = keys.index(mk)
            for pi, (x, y) in enumerate(pts):
                p = st.points[pi]
                p.position = (x * size * s, (y + dy) * size * s, 0.0)
                p.radius = rad * size * s
    layer.frames.new(f1 + 1)  # empty -> hidden
    return ob
