"""Native procedural brick builder (Blender 5.x, bpy + bmesh only).

* Every unique part shape is ONE mesh datablock; all placements share it (instancing).
  Colour lives on the object material slot (link='OBJECT'), so a red and a blue 2x4 still share geometry.
* Studs are plain cylinders: no raised logo, which keeps it brand-safe and is the cheapest geometry.
* Micro-bevel and a 0.12 mm (scaled) gap per side give the seams that make bricks read as bricks.
* Every placement records an LDraw part id + colour, so a set can be exported as a standard .ldr file
  (open it in LDraw/Studio tools, or re-import it with ldr_tools_blender when the LDraw library is installed).

Units: 1 stud = 0.08 m (10x real scale), plate = 0.032 m, brick = 3 plates.
"""
from __future__ import annotations
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector

import look_dev as LD

STUD = 0.08
PLATE = 0.032
GAP = 0.0012
BEVEL = 0.0028
STUD_R = 0.024
STUD_H = 0.017

_MESH_CACHE: dict = {}
PLACEMENTS: list = []        # (ldraw_id, ldraw_color, matrix_world) for .ldr export

LDRAW_IDS = {  # (kind, w, l, plates) -> LDraw part number (subset)
    ("brick", 1, 1, 3): "3005", ("brick", 1, 2, 3): "3004", ("brick", 1, 3, 3): "3622", ("brick", 1, 4, 3): "3010",
    ("brick", 1, 6, 3): "3009", ("brick", 1, 8, 3): "3008", ("brick", 2, 2, 3): "3003", ("brick", 2, 3, 3): "3002",
    ("brick", 2, 4, 3): "3001", ("plate", 1, 1, 1): "3024", ("plate", 1, 2, 1): "3023", ("plate", 1, 4, 1): "3710",
    ("plate", 1, 6, 1): "3666", ("plate", 1, 8, 1): "3460", ("plate", 2, 2, 1): "3022", ("plate", 2, 4, 1): "3020",
    ("plate", 2, 6, 1): "3795", ("plate", 2, 8, 1): "3034", ("plate", 4, 4, 1): "3031", ("plate", 6, 6, 1): "3958",
    ("tile", 1, 1, 1): "3070b", ("tile", 1, 2, 1): "3069b", ("tile", 1, 4, 1): "2431", ("tile", 2, 2, 1): "3068b",
    ("round", 1, 1, 3): "3062b", ("round", 1, 1, 1): "4073", ("cone", 1, 1, 3): "4589",
}
LDRAW_COLORS = {"white": 15, "black": 0, "red": 4, "blue": 1, "yellow": 14, "green": 2, "tan": 19, "light_gray": 71,
                "dark_gray": 72, "brown_dark": 308, "reddish_brown": 70, "orange": 25, "lime": 27, "sand_blue": 379,
                "sand_green": 378, "lavender": 31, "pink": 29, "trans_clear": 47, "trans_blue": 43, "teal_dark": 3,
                "brick_red": 320, "mustard": 191, "cream": 19, "wood": 92, "coral": 353, "green_bright": 10,
                "blue_dark": 272, "tan_dark": 28, "charcoal": 0, "denim_blue": 73, "slate_blue": 379}


# ------------------------------------------------------------------ mesh primitives
def _box(bm, x0, y0, z0, x1, y1, z1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r["verts"]
    for v in vs:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    return vs


def _bevel_all(bm, offset, segs=2):
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=offset, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)


def _studs(bm, w, l, z, segs=18, hollow=False):
    for i in range(w):
        for j in range(l):
            cx, cy = (i + 0.5) * STUD, (j + 0.5) * STUD
            r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=STUD_R, radius2=STUD_R,
                                      depth=STUD_H, matrix=Matrix.Translation((cx, cy, z + STUD_H / 2)))
            if segs <= 10:      # baseplates: skip stud bevel (thousands of studs, seen from afar)
                continue
            vs = set(r["verts"])
            top = list({e for v in vs for e in v.link_edges
                        if all(x in vs and abs(x.co.z - (z + STUD_H)) < 1e-6 for x in e.verts)})
            bmesh.ops.bevel(bm, geom=top, offset=0.0025, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)


def _finish(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(35))
    except Exception:
        pass
    me.materials.append(None)
    return me


def part_mesh(kind: str, w: int = 1, l: int = 1, plates: int = 3, studs: bool | None = None):
    """kind: brick | plate | tile | round | cone | baseplate | panel. Returns a cached mesh (origin at min corner, z=0 bottom)."""
    if kind == "plate":
        plates = 1
    if kind == "tile":
        plates = 1
        studs = False
    if studs is None:
        studs = kind not in ("tile", "panel")
    key = (kind, w, l, plates, studs)
    if key in _MESH_CACHE:
        return _MESH_CACHE[key]
    bm = bmesh.new()
    h = plates * PLATE
    name = f"P_{kind}_{w}x{l}x{plates}{'' if studs else '_flat'}"
    if kind == "baseplate":
        h = PLATE * 0.5
        _box(bm, 0, 0, 0, w * STUD, l * STUD, h)
        _bevel_all(bm, 0.003, 1)
        if studs:
            _studs(bm, w, l, h, segs=10)
    elif kind in ("round", "cone"):
        rad = STUD * 0.5 - GAP
        rt = rad if kind == "round" else rad * 0.45
        bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=rad, radius2=rt, depth=h,
                              matrix=Matrix.Translation((STUD / 2, STUD / 2, h / 2)))
        _bevel_all(bm, 0.002, 1)
        if studs:
            _studs(bm, 1, 1, h)
    else:
        _box(bm, GAP, GAP, 0, w * STUD - GAP, l * STUD - GAP, h - 0.0006)
        _bevel_all(bm, BEVEL, 2)
        if studs:
            _studs(bm, w, l, h - 0.0006)
    me = _finish(bm, name)
    _MESH_CACHE[key] = me
    return me


def custom_mesh(name: str, builder):
    """Cache arbitrary bmesh-built shapes (e.g. mug handle, monitor bezel)."""
    if name in _MESH_CACHE:
        return _MESH_CACHE[name]
    bm = bmesh.new()
    builder(bm)
    me = _finish(bm, name)
    _MESH_CACHE[name] = me
    return me


# ------------------------------------------------------------------ placement
class SetBuilder:
    """Places parts on a stud grid. x, y in studs (part min corner), z in plates."""

    def __init__(self, name: str, origin=(0.0, 0.0, 0.0)):
        self.name = name
        self.coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.coll)
        self.origin = Vector(origin)
        self.step = 0
        self.objects: list = []
        self.anchors: dict = {}

    def next_step(self, n=1):
        self.step += n
        return self.step

    def place(self, kind, w, l, x, y, z, color, plates=3, rot=0, studs=None, material=None, mat_kind="abs",
              tilt=None, name=None, step=None):
        """rot: 0/90/180/270 around Z (about the part's min corner footprint)."""
        me = part_mesh(kind, w, l, plates, studs)
        ob = bpy.data.objects.new(name or f"{kind}_{w}x{l}", me)
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = material or LD.abs_material(color, mat_kind)
        # orientation, then shift so the transformed bounding box min corner lands exactly on (x, y, z)
        R = Matrix.Rotation(math.radians(rot), 4, "Z")
        if tilt is not None:  # (axis, degrees) e.g. stand a tile upright
            R = R @ Matrix.Rotation(math.radians(tilt[1]), 4, tilt[0])
        h = (0.5 if kind == "baseplate" else (1 if kind in ("plate", "tile") else plates)) * PLATE
        corners = [R @ Vector((cx, cy, cz)) for cx in (0, w * STUD) for cy in (0, l * STUD) for cz in (0, h)]
        mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        m = Matrix.Translation(self.origin + Vector((x * STUD, y * STUD, z * PLATE)) - mn) @ R
        ob.matrix_world = m
        ob["step"] = self.step if step is None else step
        self.coll.objects.link(ob)
        self.objects.append(ob)
        pid = LDRAW_IDS.get((kind, min(w, l), max(w, l), plates))
        if pid:
            PLACEMENTS.append((pid, LDRAW_COLORS.get(color, 16), m.copy(), self.name))
        return ob

    def place_mesh(self, me, matrix_local, color, mat_kind="abs", material=None, name=None, step=None):
        if not me.materials:
            me.materials.append(None)
        ob = bpy.data.objects.new(name or me.name, me)
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = material or LD.abs_material(color, mat_kind)
        ob.matrix_world = Matrix.Translation(self.origin) @ matrix_local
        ob["step"] = self.step if step is None else step
        self.coll.objects.link(ob)
        self.objects.append(ob)
        return ob

    # -------- composite helpers
    def wall(self, x, y, length, rows, color, axis="X", z=0, openings=(), accent_rows=None, accent=None):
        """Running-bond wall of 1xN bricks. openings: list of (start, end, row0, row1) in studs/rows to leave empty."""
        for r in range(rows):
            pos = 0
            off = 2 if r % 2 else 0
            seq = []
            if off:
                seq.append(2)
                pos = 2
            while pos < length:
                seq.append(min(4, length - pos))
                pos += seq[-1]
            p = 0
            for n in seq:
                s0, s1 = p, p + n
                p += n
                blocked = [o for o in openings if r >= o[2] and r < o[3] and s0 < o[1] and s1 > o[0]]
                if blocked:
                    # split brick around opening using 1x1 / 1x2 pieces
                    for s in range(s0, s1):
                        if not any(r >= o[2] and r < o[3] and o[0] <= s < o[1] for o in openings):
                            self._wall_piece(x, y, s, 1, r, z, axis, color if not (accent_rows and r in accent_rows) else accent)
                    continue
                self._wall_piece(x, y, s0, n, r, z, axis, color if not (accent_rows and r in accent_rows) else accent)

    def _wall_piece(self, x, y, s, n, r, z, axis, color):
        if axis == "X":
            self.place("brick", n, 1, x + s, y, z + r * 3, color)
        else:
            self.place("brick", n, 1, x, y + s, z + r * 3, color, rot=90)

    def tile_floor(self, x, y, w, l, colors, z=1, size=2):
        k = 0
        for i in range(0, w, size):
            for j in range(0, l, size):
                c = colors[((i // size) + (j // size)) % len(colors)]
                self.place("tile", size, size, x + i, y + j, z, c)
                k += 1

    def anchor(self, name, x, y, z_plates, facing_deg=0):
        """Stage anchor: where an actor stands (x, y studs, z plates) and which way they face (deg around Z)."""
        p = self.origin + Vector((x * STUD, y * STUD, z_plates * PLATE))
        self.anchors[name] = {"location": list(p), "facing_deg": facing_deg}
        e = bpy.data.objects.new(f"ANCHOR_{name}", None)
        e.empty_display_type = "SINGLE_ARROW"
        e.location = p
        e.rotation_euler = (0, 0, math.radians(facing_deg))
        self.coll.objects.link(e)
        return p


def export_ldr(path: str, set_name: str):
    """Write placements of one set as an LDraw .ldr (LDU: 1 stud = 20, plate = 8, -Y up)."""
    s = 20 / STUD
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # Blender Z-up -> LDraw -Y-up
    lines = [f"0 {set_name}", "0 Name: " + os.path.basename(path), "0 Author: LegoStudio brick_builder", "0 !LDRAW_ORG Unofficial_Model"]
    for pid, col, m, sn in PLACEMENTS:
        if sn != set_name:
            continue
        mm = conv @ m @ conv.inverted()
        t = mm.to_translation() * s
        r = mm.to_3x3()
        vals = " ".join(f"{v:.3f}" for row in r for v in row)
        lines.append(f"1 {col} {t.x:.2f} {t.y:.2f} {t.z:.2f} {vals} {pid}.dat")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return path
