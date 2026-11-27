"""Bộ dựng thế giới 3 vòng (Gđ 6) cho bộ set gạch.

Mỗi set là một "bát" khép kín:
  vòng 1  sân diễn chi tiết (gạch có núm, đặt bằng SetBuilder.place như set cũ)
  vòng 2  trung cảnh: khối phố, mặt tiền, cây, xe, đèn... (gạch to, ít chi tiết, GỘP lưới theo vật liệu)
  vòng 3  chân trời: khối nhà trơn + ô cửa sáng, màu pha dần về màu sương theo khoảng cách (sương "nướng" vào màu)
  vòm     trụ trời (màu chuyển theo chiều cao bằng vertex color) + đĩa nền -> máy ở đâu trong vòm cũng không lộ khoảng trống

Gộp lưới: một vật thể / nhóm, nhiều ô vật liệu; mỗi khối con ghi hộp bao vào ob["parts"] để bộ đạo diễn kiểm che khuất.
Toạ độ trong file này: mét, tính từ TÂM sân diễn (origin truyền vào builder), Z lên, máy mặc định nhìn về +Y.
Tất định: mọi biến thể chọn bằng Rnd(crc32(tên set)).
"""
from __future__ import annotations
import math, zlib
import bpy, bmesh
from mathutils import Matrix, Vector

import look_dev as LD
from brick_builder import STUD, PLATE

STUD_H = 0.017


class Rnd:
    """LCG tất định (không dùng random của Python để kết quả không đổi giữa các bản Python)."""

    def __init__(self, key: str):
        self.s = zlib.crc32(key.encode("utf-8")) or 1

    def u(self) -> float:
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def r(self, a, b):
        return a + (b - a) * self.u()

    def pick(self, seq):
        return seq[min(len(seq) - 1, int(self.u() * len(seq)))]


def mix_hex(a: str, b: str, t: float) -> str:
    pa, pb = LD.PALETTE.get(a, a).lstrip("#"), LD.PALETTE.get(b, b).lstrip("#")
    ca = [int(pa[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(pb[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(ca, cb))


class Merge:
    """Gom nhiều khối thành MỘT vật thể (nhiều ô vật liệu). Dùng cho vòng 2/3 và đồ vật lặp lại."""

    def __init__(self, sb, name: str, ring: int, center):
        self.sb, self.name, self.ring = sb, name, ring
        self.c = Vector(center)
        self.bm = bmesh.new()
        self.mats: list = []
        self.keys: dict = {}
        self.parts: list = []

    def _mi(self, mat_key, kind="abs", strength=0.0):
        k = (mat_key, kind, strength)
        if k not in self.keys:
            if kind == "emit":
                m = LD.matte_material(f"EM_{mat_key}_{strength}", mat_key, strength=strength)
            elif kind == "flat":
                m = LD.matte_material(f"MT_{mat_key}", mat_key)
            else:
                m = LD.abs_material(mat_key, kind)
            self.keys[k] = len(self.mats)
            self.mats.append(m)
        return self.keys[k]

    def box(self, x0, y0, z0, x1, y1, z1, color, kind="abs", strength=0.0, part=True, studs=False):
        mi = self._mi(color, kind, strength)
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in r["verts"]:
            v.co.x = x0 if v.co.x < 0 else x1
            v.co.y = y0 if v.co.y < 0 else y1
            v.co.z = z0 if v.co.z < 0 else z1
        faces = {f for v in r["verts"] for f in v.link_faces}
        for f in faces:
            f.material_index = mi
        if studs:  # núm trơn thưa trên mặt trên (gạch to ở trung cảnh vẫn đọc ra là gạch)
            nx, ny = max(1, int((x1 - x0) / STUD)), max(1, int((y1 - y0) / STUD))
            if nx * ny <= 64:
                for i in range(nx):
                    for j in range(ny):
                        rr = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=10, radius1=0.024, radius2=0.024, depth=STUD_H,
                                                   matrix=Matrix.Translation((x0 + (i + 0.5) * STUD, y0 + (j + 0.5) * STUD, z1 + STUD_H / 2)))
                        for f in {f for v in rr["verts"] for f in v.link_faces}:
                            f.material_index = mi
        if part:
            self.parts.append((x0, y0, z0, x1, y1, z1))

    def cyl(self, x, y, z0, z1, r, color, kind="abs", seg=16, r2=None, part=True, strength=0.0):
        mi = self._mi(color, kind, strength)
        rr = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0,
                                   matrix=Matrix.Translation((x, y, (z0 + z1) / 2)))
        for f in {f for v in rr["verts"] for f in v.link_faces}:
            f.material_index = mi
        if part:
            self.parts.append((x - r, y - r, z0, x + r, y + r, z1))

    def finish(self, cut=None, float_ok=False):
        if not self.mats:
            self.bm.free()
            return None
        me = bpy.data.meshes.new(f"M_{self.sb.name}_{self.name}")
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = False
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(f"{self.sb.name}_{self.name}", me)
        ob.location = self.c
        ob["step"] = -1
        ob["ring"] = self.ring
        ob["label"] = self.name
        if cut:
            ob["cut"] = cut
        if float_ok:
            ob["float_ok"] = 1
        ob["parts"] = [round(v, 5) for p in self.parts for v in p]
        self.sb.coll.objects.link(ob)
        self.sb.objects.append(ob)
        return ob


_GLASS = {}


def glass_material(tint="#DDEFFF", alpha=0.14):
    """Kính trong (alpha blend, không đổ bóng): nhìn rõ vào trong cửa hàng / phòng họp; Three.js đọc được alpha từ glTF."""
    k = (tint, alpha)
    if k in _GLASS:
        return _GLASS[k]
    m = bpy.data.materials.new(f"Glass_{tint}_{alpha}")
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = LD.color(tint)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Alpha"].default_value = alpha
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        pass
    try:
        m.use_transparency_overlap = False
    except Exception:
        pass
    m.diffuse_color = LD.color(tint, alpha)
    _GLASS[k] = m
    return m


def glassify(objs):
    """Đổi vật sang kính trong, không đổ bóng (đánh dấu nhìn xuyên cho bộ kiểm che khuất)."""
    for o in objs:
        o.material_slots[0].material = glass_material()
        o.visible_shadow = False
        o["see_through"] = 1
    return objs


# ------------------------------------------------------------------ vòm trời + nền
def dome(sb, center, radius=11.0, height=7.0, top="#7FB2E5", horizon="#E8EEF2", ground="#6E7378", seg=48):
    """Trụ trời nhìn từ trong (màu chuyển theo chiều cao bằng thuộc tính màu) + nắp + đĩa nền."""
    c = Vector(center)
    bm = bmesh.new()
    rings = [(0.0, horizon), (0.35, horizon), (1.0, top)]
    vs = []
    for (h, _) in rings:
        row = [bm.verts.new((radius * math.cos(2 * math.pi * i / seg), radius * math.sin(2 * math.pi * i / seg), -0.05 + h * height)) for i in range(seg)]
        vs.append(row)
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((vs[k][i], vs[k + 1][i], vs[k + 1][j], vs[k][j]))  # pháp tuyến hướng vào trong
    cap = bm.faces.new(list(reversed(vs[-1])))
    me = bpy.data.meshes.new(f"M_{sb.name}_DOME")
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    cols = {}
    for (h, col) in rings:
        cols[round(-0.05 + h * height, 4)] = LD.color(col)
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = round(me.vertices[me.loops[li].vertex_index].co.z, 4)
            attr.data[li].color = cols.get(z, LD.color(top))
    m = bpy.data.materials.new(f"Sky_{sb.name}")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    me.materials.append(m)
    ob = bpy.data.objects.new(f"{sb.name}_DOME", me)
    ob.location = c
    ob["step"] = -1
    ob["ring"] = 3
    ob["float_ok"] = 1
    ob.visible_shadow = False
    sb.coll.objects.link(ob)
    # đĩa nền (thấp hơn mặt sân diễn) — phủ tới chân vòm
    g = Merge(sb, "GROUND", 3, center)
    g.cyl(0, 0, -0.06, -0.004, radius + 0.2, ground, kind="flat", seg=seg, part=False)
    gob = g.finish(float_ok=True)
    return ob, gob


def skyline(sb, center, r0=7.2, r1=9.4, haze="#E8EEF2", palette=("tan", "sand_blue", "light_gray", "brick_red", "cream"),
            window="#FFE6A8", hmin=1.4, hmax=4.4, seg=40, gap_front=0.0, key=None):
    """Vòng 3: các khối nhà trơn quanh 360 độ, có ô cửa sáng; càng xa càng nhạt về màu sương."""
    rnd = Rnd(key or sb.name + "_sky")
    m = Merge(sb, "R3_SKYLINE", 3, center)
    for i in range(seg):
        a = 2 * math.pi * (i + rnd.r(-0.2, 0.2)) / seg
        if gap_front and abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < gap_front:
            continue
        for layer in (0, 1):
            r = (r0 if layer == 0 else r0 + (r1 - r0) * 0.7) + rnd.r(0, 0.5)
            w = rnd.r(0.7, 1.25) * (1.0 if layer == 0 else 1.3)
            h = rnd.r(hmin, hmax) * (0.85 if layer == 0 else 1.25)
            t = 0.45 + 0.25 * layer + 0.1 * (r - r0) / (r1 - r0 + 1e-6)
            base = mix_hex(rnd.pick(palette), haze, min(0.85, t))
            cx, cy = r * math.cos(a), r * math.sin(a)
            # khối nhà quay mặt vào tâm: dựng theo trục rồi ghi hộp bao thẳng trục (đủ cho kiểm che khuất)
            ux, uy = -math.sin(a), math.cos(a)
            d = 0.5
            corners = [(cx + ux * s * w / 2 + math.cos(a) * q * d / 2, cy + uy * s * w / 2 + math.sin(a) * q * d / 2) for s in (-1, 1) for q in (-1, 1)]
            x0, x1 = min(p[0] for p in corners), max(p[0] for p in corners)
            y0, y1 = min(p[1] for p in corners), max(p[1] for p in corners)
            m.box(x0, y0, -0.01, x1, y1, h, base, kind="flat")
            if layer == 0:
                # dải cửa sổ mặt hướng vào tâm
                wc = mix_hex(window, haze, 0.35)
                fx, fy = cx - math.cos(a) * (d / 2 + 0.006), cy - math.sin(a) * (d / 2 + 0.006)
                for row in range(int(h / 0.32)):
                    z = 0.22 + row * 0.32
                    if z + 0.12 > h - 0.1:
                        break
                    for col in (-1, 0, 1):
                        if rnd.u() < 0.35:
                            continue
                        px, py = fx + ux * col * w * 0.28, fy + uy * col * w * 0.28
                        m.box(px - 0.05, py - 0.05, z, px + 0.05, py + 0.05, z + 0.12, wc, kind="emit", strength=0.6, part=False)
    return m.finish(float_ok=True)


# ------------------------------------------------------------------ đồ vật trung cảnh (vòng 2)
def tree(m: Merge, x, y, z=0.0, s=1.0, trunk="reddish_brown", leaf=("green", "green_bright")):
    m.cyl(x, y, z, z + 0.42 * s, 0.035 * s, trunk, seg=10)
    for k, (dz, rr) in enumerate(((0.38, 0.2), (0.55, 0.17), (0.7, 0.12))):
        m.cyl(x, y, z + dz * s, z + (dz + 0.2) * s, rr * s, leaf[k % len(leaf)], seg=12, r2=rr * s * 0.55)


def lamp(m: Merge, x, y, z=0.0, h=0.62, glow="#FFE3A0"):
    m.cyl(x, y, z, z + h, 0.018, "black", seg=10)
    m.box(x - 0.04, y - 0.04, z + h, x + 0.04, y + 0.04, z + h + 0.05, glow, kind="emit", strength=4.0)


def bench(m: Merge, x, y, z=0.0, rot=0, color="wood"):
    w, d = 0.36, 0.1
    if rot % 180 == 0:
        m.box(x - w / 2, y - d / 2, z + 0.1, x + w / 2, y + d / 2, z + 0.13, color)
        m.box(x - w / 2, y + d / 2 - 0.02, z + 0.13, x + w / 2, y + d / 2, z + 0.26, color)
        for sx in (-1, 1):
            m.box(x + sx * (w / 2 - 0.03) - 0.015, y - 0.03, z, x + sx * (w / 2 - 0.03) + 0.015, y + 0.03, z + 0.1, "dark_gray")
    else:
        m.box(x - d / 2, y - w / 2, z + 0.1, x + d / 2, y + w / 2, z + 0.13, color)
        m.box(x - d / 2, y - w / 2, z + 0.13, x - d / 2 + 0.02, y + w / 2, z + 0.26, color)
        for sy in (-1, 1):
            m.box(x - 0.03, y + sy * (w / 2 - 0.03) - 0.015, z, x + 0.03, y + sy * (w / 2 - 0.03) + 0.015, z + 0.1, "dark_gray")


def car(m: Merge, x, y, z=0.0, color="red", along_x=True):
    L, Wd = 0.62, 0.3
    hx, hy = (L / 2, Wd / 2) if along_x else (Wd / 2, L / 2)
    m.box(x - hx, y - hy, z + 0.05, x + hx, y + hy, z + 0.18, color)
    ix, iy = (hx * 0.55, hy * 0.92) if along_x else (hx * 0.92, hy * 0.55)
    m.box(x - ix, y - iy, z + 0.18, x + ix, y + iy, z + 0.3, "#2E3A48", kind="abs", part=False)  # kính tối
    m.box(x - ix, y - iy, z + 0.3, x + ix, y + iy, z + 0.32, color)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wx = x + sx * (hx * 0.62 if along_x else hx * 0.95)
            wy = y + sy * (hy * 0.95 if along_x else hy * 0.62)
            m.box(wx - 0.05, wy - 0.025, z, wx + 0.05, wy + 0.025, z + 0.1, "black", part=False)


def facade(m: Merge, x0, y0, width, height, color, depth=0.6, facing="-Y", window="#BFE3FF", trim="cream",
           shop=None, rnd: Rnd | None = None, glow=0.4):
    """Mặt tiền nhiều tầng: khối thân + gờ + lưới cửa sổ (kiểu luật CGA: tầng -> ô -> cửa). facing: hướng mặt tiền."""
    rnd = rnd or Rnd(f"{x0:.2f},{y0:.2f}")
    if facing == "-Y":
        m.box(x0, y0, -0.01, x0 + width, y0 + depth, height, color, kind="matte")
        m.box(x0 - 0.02, y0 - 0.03, height, x0 + width + 0.02, y0 + depth, height + 0.05, trim)  # gờ mái
        floors = int((height - 0.1) / 0.36)
        for f in range(floors):
            z = 0.12 + f * 0.36 + (0.1 if shop and f == 0 else 0)
            if shop and f == 0:
                # tầng trệt: kính cửa hàng sáng + mái hiên
                m.box(x0 + 0.06, y0 - 0.008, 0.02, x0 + width - 0.06, y0, 0.3, shop, kind="emit", strength=glow, part=False)
                m.box(x0 + 0.03, y0 - 0.12, 0.33, x0 + width - 0.03, y0, 0.36, trim, part=False)
                continue
            n = max(1, int(width / 0.26))
            for k in range(n):
                cx = x0 + (k + 0.5) * width / n
                lit = rnd.u() < 0.55
                m.box(cx - 0.07, y0 - 0.008, z, cx + 0.07, y0, z + 0.2, window if lit else mix_hex(window, "#40505C", 0.6),
                      kind="emit" if lit else "flat", strength=glow if lit else 0.0, part=False)
                m.box(cx - 0.085, y0 - 0.02, z - 0.02, cx + 0.085, y0, z, trim, part=False)
    else:  # mặt tiền quay ±X (dãy nhà bên trái/phải)
        sgn = 1 if facing == "+X" else -1
        xa = x0 if sgn > 0 else x0 - depth
        m.box(xa, y0, -0.01, xa + depth, y0 + width, height, color, kind="matte")
        fx = xa + depth if sgn > 0 else xa
        m.box(min(fx, fx + sgn * 0.03), y0 - 0.02, height, max(fx, fx + sgn * 0.03), y0 + width + 0.02, height + 0.05, trim)
        floors = int((height - 0.1) / 0.36)
        for f in range(floors):
            z = 0.12 + f * 0.36
            if shop and f == 0:
                m.box(min(fx, fx + sgn * 0.008), y0 + 0.06, 0.02, max(fx, fx + sgn * 0.008), y0 + width - 0.06, 0.3, shop, kind="emit", strength=glow, part=False)
                continue
            n = max(1, int(width / 0.26))
            for k in range(n):
                cy = y0 + (k + 0.5) * width / n
                lit = rnd.u() < 0.55
                m.box(min(fx, fx + sgn * 0.008), cy - 0.07, z, max(fx, fx + sgn * 0.008), cy + 0.07, z + 0.2,
                      window if lit else mix_hex(window, "#40505C", 0.6), kind="emit" if lit else "flat", strength=glow if lit else 0.0, part=False)


def block_row(m: Merge, x0, x1, y, rnd: Rnd, facing="-Y", hmin=0.9, hmax=2.2, colors=("brick_red", "tan", "sand_blue", "cream", "sand_green"),
              shops=("#F2B061", "#BFE3FF", "#FFD9A0", None), depth=0.6, glow=0.4):
    """Dãy mặt tiền dọc trục X (facing -Y) hoặc dọc trục Y (facing ±X, x0..x1 hiểu là y0..y1, y hiểu là x)."""
    p = x0
    while p < x1 - 0.2:
        w = min(x1 - p, rnd.r(0.7, 1.3))
        h = rnd.r(hmin, hmax)
        col = rnd.pick(colors)
        shop = rnd.pick(shops)
        if facing == "-Y":
            facade(m, p, y, w, h, col, depth=depth, shop=shop, rnd=rnd, glow=glow)
        else:
            facade(m, y, p, w, h, col, depth=depth, facing=facing, shop=shop, rnd=rnd, glow=glow)
        p += w + 0.02


def sign_tile(sb, x, y, z, w, h, tex, name, strength=1.2, rot_z=0, facing_y=True):
    """Biển hiệu phát sáng (texture chữ chung chung, không thương hiệu). x, y, z mét quanh tâm; dựng đứng."""
    import os
    import paths as P
    me = bpy.data.meshes.new(f"M_{sb.name}_{name}")
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:  # dựng phẳng (x rộng, y cao) rồi xoay X 90 độ: toạ độ Generated = (u, v) đúng chiều chữ
        v.co.x = (-w / 2 if v.co.x < 0 else w / 2)
        v.co.y = (0 if v.co.y < 0 else h)
        v.co.z = (-0.01 if v.co.z < 0 else 0.01)
    bm.to_mesh(me)
    bm.free()
    mat = LD.screen_material(f"Sign_{sb.name}_{name}", os.path.join(P.TEXTURES, tex), strength=strength, mapping="Generated")
    me.materials.append(mat)
    ob = bpy.data.objects.new(f"{sb.name}_{name}", me)
    ob.matrix_world = (Matrix.Translation(Vector(sb.center) + Vector((x, y, z))) @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
                       @ Matrix.Rotation(math.radians(90), 4, "X"))
    ob["step"] = -1
    ob["ring"] = 1
    ob["float_ok"] = 1
    ob["label"] = name
    sb.coll.objects.link(ob)
    sb.objects.append(ob)
    return ob


def tag_cut(objs, group):
    for o in objs:
        o["cut"] = group
    return objs
