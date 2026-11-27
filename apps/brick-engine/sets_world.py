"""Bộ set thế hệ mới (Gđ 6): sân diễn 3 vòng, khép kín bằng vòm trời, có nhóm cutaway cho máy chúc cao / nhìn từ trên.

Quy ước chung (giống set cũ): sân diễn W x L núm, x/y tính bằng núm từ góc nhỏ nhất, z tính bằng plate; máy mặc định nhìn +Y.
Tâm sân diễn = origin truyền vào builder. Vòng 2/3 dùng world_kit (mét, tính từ tâm).
Thuộc tính thêm trên SetBuilder (export_manifest đọc): center, extent (bán kính vòm), dome_h, floor_z.
Không chữ thương hiệu, không màu nhận diện của chuỗi cửa hàng / hãng xe thật.
"""
from __future__ import annotations
import math, os
from mathutils import Matrix, Vector

import look_dev as LD
import brick_builder as BB
from brick_builder import STUD, PLATE
import minifig_builder as MB
import world_kit as WK
import paths as P

TEX = P.TEXTURES
W0, L0 = 40, 28          # sân diễn mặc định (núm)
Z = 0.5                  # mặt trên tấm nền (plate)
EXTENT = 11.5            # bán kính vòm (m)
DOME_H = 7.5


def _base(name, origin, base_color, sky, horizon, ground, W=W0, L=L0):
    sb = BB.SetBuilder(name, origin=(origin[0] - W * STUD / 2, origin[1] - L * STUD / 2, origin[2]))
    sb.center = tuple(origin)
    sb.extent, sb.dome_h, sb.floor_z = EXTENT, DOME_H, (Z + 1) * PLATE
    sb.W, sb.L = W, L
    WK.dome(sb, origin, radius=EXTENT, height=DOME_H, top=sky, horizon=horizon, ground=ground)
    sb.place("baseplate", W, L, 0, 0, 0, base_color)
    return sb


def m_x(sb, xs):  # núm (từ góc) -> mét (từ tâm)
    return xs * STUD - sb.W * STUD / 2


def m_y(sb, ys):
    return ys * STUD - sb.L * STUD / 2


def _walls(sb, x, y, length, rows, color, axis, openings=(), accent=None):
    """Tường gạch chạy so le (1xN), trả danh sách vật để gắn nhóm cutaway."""
    n0 = len(sb.objects)
    sb.wall(x, y, length, rows, color, axis=axis, z=Z, openings=openings,
            accent_rows=set(accent.keys()) if accent else None, accent=list(accent.values())[0] if accent else None)
    return sb.objects[n0:]


def _ceiling(sb, x0, y0, w, l, z, color="white", panel_glow=None):
    """Trần bằng tấm 4xN (nhóm cutaway 'ceiling'); đèn trần phát sáng gắn vào cùng nhóm."""
    n0 = len(sb.objects)
    for i in range(x0, x0 + w, 4):
        for j in range(y0, y0 + l, 4):
            sb.place("plate", min(4, x0 + w - i), min(4, y0 + l - j), i, j, z, color, studs=False)
    if panel_glow:
        for i in range(x0 + 4, x0 + w - 4, 8):
            for j in range(y0 + 4, y0 + l - 4, 8):
                sb.place("tile", 2, 4, i, j, z - 1, panel_glow, mat_kind="glow")
    WK.tag_cut(sb.objects[n0:], "ceiling")
    for o in sb.objects[n0:]:
        o["float_ok"] = 1  # trần tựa lên tường; hộp bao có thể không chạm từng viên
    return sb.objects[n0:]


def _window_panel(sb, x, y, z, w, h_plates, glow="#BFE3FF", strength=1.2, name="Window"):
    sb.place_mesh(BB.part_mesh("panel", w, 1, h_plates), Matrix.Translation((x * STUD, y * STUD, z * PLATE)),
                  "trans_blue", material=LD.matte_material(f"Win_{sb.name}_{name}", glow, strength=strength), name=name)


def _mug(sb, xs, ys, zp, color="white"):
    sb.place_mesh(MB.mesh_mug(), Matrix.Translation((xs * STUD, ys * STUD, zp * PLATE)), color)


def _tree_bricks(sb, x, y, h=4):
    for k in range(h):
        sb.place("round", 1, 1, x, y, Z + 1 + k * 3, "reddish_brown")
    for k, (dx, dy, dz, c) in enumerate(((0, 0, 0, "green"), (-0.6, 0.3, 2, "green_bright"), (0.6, -0.2, 3, "green"),
                                          (0, 0.4, 5, "green_bright"), (0, 0, 7, "green"))):
        sb.place("cone", 1, 1, x + dx, y + dy, Z + 1 + h * 3 + dz, c, studs=False)


def _lamp_bricks(sb, x, y, h=6, glow="yellow"):
    for k in range(h):
        sb.place("round", 1, 1, x, y, Z + 1 + k * 3, "black")
    sb.place("round", 1, 1, x, y, Z + 1 + h * 3, glow, mat_kind="glow")


def _bench_bricks(sb, x, y, color="wood"):
    for dx in (0, 3):
        sb.place("brick", 1, 1, x + dx, y, Z + 1, "dark_gray")
    sb.place("plate", 1, 4, x, y, Z + 4, color, rot=90)
    sb.place("plate", 1, 4, x, y + 1, Z + 4, color, rot=90)
    sb.place("brick", 1, 4, x, y + 1.5, Z + 5, color, rot=90, plates=2)


def _table_bricks(sb, x, y, top="white"):
    sb.place("round", 1, 1, x, y, Z + 1, "black")
    sb.place("round", 1, 1, x, y, Z + 4, "black")
    sb.place("plate", 4, 4, x - 1.5, y - 1.5, Z + 7, top)


def _ring2_city(sb, rnd, front=True, back=True, sides=True, glow=0.4, hmax=2.4):
    """Trung cảnh kiểu phố: dãy mặt tiền 3 phía + phía sau lưng máy (đủ cho cảnh quay ngược), cây, đèn, xe."""
    m = WK.Merge(sb, "R2_BLOCKS", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    if back:
        WK.block_row(m, -6.4, 6.4, hl + 1.0, rnd, hmax=hmax, glow=glow)
    if sides:
        WK.block_row(m, -hl - 0.5, hl + 0.9, -hw - 1.7, rnd, facing="+X", hmax=hmax, glow=glow)
        WK.block_row(m, -hl - 0.5, hl + 0.9, hw + 1.7, rnd, facing="-X", hmax=hmax, glow=glow)
    if front:
        # sau lưng máy: dãy nhà quay về phía sân diễn, đủ xa để máy toàn (EWS ~4 m) không đụng
        m2 = WK.Merge(sb, "R2_FRONT", 2, sb.center)
        p = -6.4
        while p < 6.4:
            w = rnd.r(0.8, 1.3)
            h = rnd.r(1.0, hmax)
            col = rnd.pick(("tan", "sand_blue", "brick_red", "cream"))
            m2.box(p, -6.0 - 0.6, -0.01, p + w, -6.0, h, col, kind="matte")
            p += w + 0.03
        m2.finish()
    deco = WK.Merge(sb, "R2_DECO", 2, sb.center)
    for x in (-5.2, -3.6, 3.6, 5.2):
        WK.tree(deco, x, hl + 0.55, s=1.1)
    for x in (-4.4, 4.4):
        WK.lamp(deco, x, -hl - 0.4)
    m.finish()
    deco.finish()
    return m


# ======================================================================= 1. PHỐ GÓC QUÁN CÀ PHÊ (mở rộng nhiều khối)
def build_city_street(origin=(0, 0, 0)):
    sb = _base("Set_CityStreetCorner", origin, "dark_gray", sky="#7FB2E5", horizon="#F3D9B8", ground="#5C6066")
    rnd = WK.Rnd(sb.name)
    sb.next_step()  # vạch kẻ đường + vạch qua đường
    for i in range(1, 27, 4):
        sb.place("tile", 1, 2, i, 4.5, Z, "white", rot=90)
    for j in range(0, 10, 2):
        sb.place("tile", 1, 4, 30, j + 0.5, Z, "white", rot=90)
        sb.place("tile", 1, 4, 34, j + 0.5, Z, "white", rot=90)
    sb.next_step()  # vỉa hè
    sb.place("plate", 1, 10, 0, 10, Z, "light_gray", rot=90)
    sb.place("plate", 1, 10, 10, 10, Z, "light_gray", rot=90)
    sb.place("plate", 1, 10, 20, 10, Z, "light_gray", rot=90)
    sb.place("plate", 1, 10, 30, 10, Z, "light_gray", rot=90)
    sb.tile_floor(0, 11, 40, 10, ["light_gray", "#B4B8BC"], z=Z)
    # hai mặt tiền phía sau: quán cà phê (trái) + hiệu sách (phải)
    for r0, r1 in ((0, 4), (4, 8)):
        sb.next_step()
        _walls(sb, 0, 22, 20, r1 - r0, "brick_red", "X", openings=[(4, 16, 1, 6)]) if r0 == 0 else \
            _walls_rows(sb, 0, 22, 20, r0, r1, "brick_red", [(4, 16, 1, 6)])
        _walls_rows(sb, 20, 22, 20, r0, r1, "teal_dark", [(23, 33, 1, 6), (35, 39, 0, 7)])
    sb.next_step()
    _window_panel(sb, 4, 22.4, Z + 4, 12, 15, glow="#F2B061", strength=0.9, name="CafeWindow")
    _window_panel(sb, 23, 22.4, Z + 4, 10, 15, glow="#FFE6B0", strength=0.6, name="BookWindow")
    sb.place_mesh(BB.part_mesh("panel", 4, 1, 21), Matrix.Translation((35 * STUD, 22.5 * STUD, (Z + 1) * PLATE)), "wood", name="BookDoor")
    WK.sign_tile(sb, m_x(sb, 10), m_y(sb, 21.9), (Z + 19) * PLATE, 0.62, 0.19, "sign_cafe.png", "SignCafe", strength=0.9)
    WK.sign_tile(sb, m_x(sb, 28), m_y(sb, 21.9), (Z + 19) * PLATE, 0.62, 0.19, "sign_books.png", "SignBooks", strength=0.7)
    sb.next_step()  # mái hiên sọc
    for i in range(14):
        sb.place("plate", 1, 3, 3 + i, 19.6, Z + 17, "red" if i % 2 == 0 else "white", tilt=("X", -28))
    sb.next_step()  # bàn ghế ngoài trời
    for tx in (6, 14):
        _table_bricks(sb, tx, 16)
        _mug(sb, tx + 0.6, 15.6, Z + 8)
        for cx in (tx - 3, tx + 2):
            sb.place("plate", 2, 2, cx, 15.5, Z + 4, "wood")
            sb.place("brick", 1, 1, cx + 0.5, 16, Z + 1, "dark_gray")
    sb.next_step()  # đèn đường, cây, ghế băng, cột đèn giao thông, trụ nước cứu hoả
    _lamp_bricks(sb, 19, 12)
    _tree_bricks(sb, 2, 12)
    _bench_bricks(sb, 22, 18)
    for k in range(7):
        sb.place("round", 1, 1, 37, 11, Z + 1 + k * 3, "dark_gray")
    sb.place("brick", 1, 1, 37, 11, Z + 22, "black")
    sb.place("round", 1, 1, 37, 10.7, Z + 23, "red", plates=1, mat_kind="glow")
    sb.place("round", 1, 1, 37, 10.7, Z + 24.2, "green_bright", plates=1)
    sb.place("round", 1, 1, 27, 12, Z + 1, "red")
    sb.place("round", 1, 1, 27, 12, Z + 4, "red", plates=1)
    # xe con đỗ dưới lòng đường (gạch to gộp, có núm)
    car = WK.Merge(sb, "HERO_CAR", 1, sb.center)
    WK.car(car, m_x(sb, 5), m_y(sb, 6.5), z=Z * PLATE, color="mustard")
    car.finish()
    sb.anchor("cafe_table", 11, 14.5, Z + 1, 10)
    sb.anchor("sidewalk_left", 6, 12.5, Z + 1, 15)
    sb.anchor("sidewalk_right", 16, 12.5, Z + 1, -15)
    sb.anchor("crosswalk", 32, 6, Z + 1, 0)
    sb.anchor("book_door", 30, 18.5, Z + 1, -10)
    sb.anchor("bench", 24, 17, Z + 1, 0)
    sb.anchor("center", 20, 13, Z + 1, 0)
    _ring2_city(sb, rnd, glow=0.35, sides=False)
    road = WK.Merge(sb, "R2_ROAD", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    road.box(-7.0, -hl - 1.8, -0.004, 7.0, m_y(sb, 10), 0.004, "dark_gray", kind="matte", part=False)
    road.box(-7.0, m_y(sb, 10), -0.004, 7.0, hl + 0.6, 0.014, "light_gray", kind="matte", part=False)
    for k in range(-6, 7):
        road.box(k * 1.0 - 0.15, m_y(sb, 4.5), 0.004, k * 1.0 + 0.15, m_y(sb, 5.5), 0.006, "white", kind="flat", part=False)
    road.finish(float_ok=True)
    WK.skyline(sb, sb.center, haze="#F3D9B8", key=sb.name)
    return sb


def _walls_rows(sb, x, y, length, r0, r1, color, openings):
    import sets_library as SL
    n0 = len(sb.objects)
    SL._wall_rows(sb, x, y, length, r0, r1, color, Z, openings=openings, accent={}, axis="X")
    return sb.objects[n0:]


def _walls_rows_y(sb, x, y, length, r0, r1, color, openings):
    import sets_library as SL
    n0 = len(sb.objects)
    SL._wall_rows(sb, x, y, length, r0, r1, color, Z, openings=openings, accent={}, axis="Y")
    return sb.objects[n0:]


def _room_shell(sb, wall_color, rows=8, back_openings=(), left_openings=(), right_openings=(), front_rows=2, front_color=None,
                front_openings=()):
    """Phòng kín: tường sau (y 26), trái (x 0), phải (x 39), tường trước thấp (cutaway 'front'), trần (cutaway 'ceiling')."""
    for r in range(0, rows, 4):
        sb.next_step()
        _walls_rows(sb, 0, 26, 40, r, min(rows, r + 4), wall_color, list(back_openings))
        WK.tag_cut(_walls_rows_y(sb, 0, 1, 25, r, min(rows, r + 4), wall_color, list(left_openings)), "left")
        WK.tag_cut(_walls_rows_y(sb, 39, 1, 25, r, min(rows, r + 4), wall_color, list(right_openings)), "right")
    fr = WK.tag_cut(_walls_rows(sb, 0, 0, 40, 0, front_rows, front_color or wall_color, list(front_openings)), "front")
    return fr


def _ring2_yard(sb, rnd, glow=0.4):
    """Trung cảnh quanh một toà nhà: vỉa hè, cây, xe, dãy nhà bên kia đường (nhìn qua cửa sổ và trong cảnh EWS cắt mái)."""
    _ring2_city(sb, rnd, glow=glow)
    pave = WK.Merge(sb, "R2_PAVE", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    # vỉa hè lát ô (hai tông xám) thay cho mảng trơn: cảnh rộng / chúc cao không còn mảng nền trống
    T0 = 0.48
    nx, ny = int((2 * hw + 2.4) / T0) + 1, int((2 * hl + 1.9) / T0) + 1
    for i in range(nx):
        for j in range(ny):
            x0, y0 = -hw - 1.2 + i * T0, -hl - 1.2 + j * T0
            pave.box(x0 + 0.004, y0 + 0.004, -0.004, x0 + T0 - 0.004, y0 + T0 - 0.004, 0.012,
                     "#A9AEB4" if (i + j) % 2 else "#9A9FA6", kind="matte", part=False)
    pave.box(-hw - 1.3, -hl - 1.3, -0.006, hw + 1.3, hl + 0.8, 0.006, "#6F747A", kind="matte", part=False)  # ron
    pave.finish(float_ok=True)
    # đồ vật sân trước, đặt hai bên hành lang máy (|x| > 1,7 m)
    props = WK.Merge(sb, "R2_FRONTYARD", 2, sb.center)
    for sx in (-1, 1):
        props.box(sx * 2.3 - 0.18, -hl - 0.75, 0.0, sx * 2.3 + 0.18, -hl - 0.45, 0.14, "terracotta" if "terracotta" in LD.PALETTE else "reddish_brown")
        WK.tree(props, sx * 2.3, -hl - 0.6, z=0.14, s=0.7)
        WK.bench(props, sx * 1.95, -hl - 1.05)
        WK.lamp(props, sx * 2.75, -hl - 1.0)
    props.finish()
    cars = WK.Merge(sb, "R2_CARS", 2, sb.center)
    WK.car(cars, -2.2, -hl - 2.4, color="blue")
    WK.car(cars, 1.6, -hl - 2.9, color="white")
    cars.finish()


# ======================================================================= 2. CĂN HỘ CẮT MÁI (phòng khách + phòng ngủ)
def build_apartment(origin=(0, 0, 0)):
    sb = _base("Set_ApartmentCutaway", origin, "light_gray", sky="#6E9FD8", horizon="#E9D8C8", ground="#666B70")
    rnd = WK.Rnd(sb.name)
    sb.next_step()
    sb.tile_floor(1, 1, 24, 25, ["wood", "tan"], z=Z)
    sb.tile_floor(25, 1, 14, 25, ["sand_blue", "light_gray"], z=Z)
    _room_shell(sb, "cream", rows=8, back_openings=[(6, 18, 2, 7), (28, 36, 2, 7)], front_rows=2)
    # vách ngăn phòng ngủ có cửa
    sb.next_step()
    _walls_rows_y(sb, 24, 1, 25, 0, 3, "sand_green", [(8, 13, 0, 3)])  # vách thấp dưới cằm: không chắn mặt ở mọi góc máy
    sb.next_step()  # cửa sổ nhìn ra phố
    _window_panel(sb, 6, 26.4, Z + 6, 12, 15, glow="#CFE6FF", strength=1.3, name="LivingWindow")
    _window_panel(sb, 28, 26.4, Z + 6, 8, 15, glow="#CFE6FF", strength=1.3, name="BedWindow")
    sb.next_step()  # sofa + bàn trà + thảm
    for i in range(6, 18, 2):
        for j in range(10, 16, 2):
            sb.place("tile", 2, 2, i, j, Z + 1, "coral" if (i // 2 + j // 2) % 2 else "lavender")
    sb.place("brick", 2, 8, 6, 17, Z + 1, "blue_dark", rot=90)
    sb.place("brick", 2, 8, 6, 19, Z + 1, "blue_dark", rot=90)
    sb.place("brick", 1, 8, 6, 20, Z + 4, "blue_dark", rot=90)
    sb.place("brick", 2, 1, 5, 17, Z + 4, "blue_dark", rot=90)
    sb.place("brick", 2, 1, 14, 17, Z + 4, "blue_dark", rot=90)
    sb.place("plate", 4, 6, 8, 11, Z + 4, "wood", rot=90)
    for (x, y) in ((8, 11), (13, 11), (8, 14), (13, 14)):
        sb.place("brick", 1, 1, x, y, Z + 1, "dark_gray")
    _mug(sb, 10, 12.5, Z + 5, "red")
    sb.next_step()  # kệ TV + TV
    sb.place("brick", 2, 8, 6, 3, Z + 1, "wood", rot=90)
    sb.place("panel", 6, 1, 7, 4.2, Z + 4, "charcoal", plates=11, name="TVBezel")
    sb.place("tile", 5.5, 3.2, 7.25, 3.9, Z + 4.6, "black", tilt=("X", 90), name="TVScreen",
             material=LD.screen_material("TVScreen", os.path.join(TEX, "tv_screen.png"), strength=1.3))
    sb.next_step()  # đèn cây + cây cảnh
    _lamp_bricks(sb, 20, 20, h=5, glow="#FFE3A0")
    sb.place("brick", 2, 2, 2, 22, Z + 1, "reddish_brown")
    for k, (dx, dy, dz) in enumerate(((0.5, 0.5, 3), (0, 0.6, 6), (1, 0.4, 6), (0.5, 0.5, 9))):
        sb.place("cone", 1, 1, 2 + dx, 22 + dy, Z + 1 + dz, "green_bright" if k % 2 else "green", studs=False)
    sb.next_step()  # phòng ngủ: giường, tủ đầu giường, đèn ngủ
    sb.place("brick", 4, 8, 28, 16, Z + 1, "white")
    sb.place("brick", 4, 8, 32, 16, Z + 1, "white")
    sb.place("plate", 8, 8, 28, 16, Z + 4, "denim_blue")
    sb.place("brick", 2, 8, 28, 22, Z + 4, "white", rot=90)
    sb.place("brick", 2, 2, 36, 22, Z + 1, "wood")
    sb.place("round", 1, 1, 36.5, 22.5, Z + 4, "white")
    sb.place("cone", 1, 1, 36.5, 22.5, Z + 7, "#FFE3A0", studs=False, mat_kind="glow")
    _ceiling(sb, 0, 0, 40, 27, Z + 24, "white", panel_glow="#FFF4D8")
    sb.anchor("couch", 10, 15, Z + 1, 0)
    sb.anchor("living_center", 14, 10, Z + 1, -15)
    sb.anchor("window_view", 12, 23, Z + 1, 180)
    sb.anchor("bed", 31, 13, Z + 1, -10)
    sb.anchor("bedroom_door", 22, 10, Z + 1, 20)
    sb.anchor("tv_watch", 9, 13, Z + 1, 180)
    sb.anchor("center", 20, 12, Z + 1, 0)
    _ring2_yard(sb, rnd, glow=0.45)
    WK.skyline(sb, sb.center, haze="#E9D8C8", key=sb.name)
    return sb


# ======================================================================= 3. VĂN PHÒNG (ô làm việc + phòng họp)
def build_office_floor(origin=(0, 0, 0)):
    sb = _base("Set_OfficeFloor", origin, "dark_gray", sky="#8DB6DE", horizon="#DCE4EA", ground="#6A7076")
    rnd = WK.Rnd(sb.name)
    sb.next_step()
    sb.tile_floor(1, 1, 38, 25, ["slate_blue", "#5E6F88"], z=Z)
    _room_shell(sb, "light_gray", rows=8, back_openings=[(2, 22, 2, 7), (26, 38, 2, 7)], front_rows=2, front_color="sand_blue")
    sb.next_step()  # cửa kính lớn nhìn ra phố + toà nhà bên cạnh
    _window_panel(sb, 2, 26.4, Z + 6, 20, 15, glow="#D6ECFF", strength=1.4, name="OfficeWindowL")
    _window_panel(sb, 26, 26.4, Z + 6, 12, 15, glow="#D6ECFF", strength=1.4, name="OfficeWindowR")
    # cụm 4 bàn làm việc có vách thấp
    for (cx, cy) in ((5, 6), (15, 6)):
        sb.next_step()
        for dx in (0, 5):
            for dy in (0, 4):
                x, y = cx + dx, cy + dy
                sb.place("brick", 1, 1, x, y, Z + 1, "dark_gray")
                sb.place("brick", 1, 1, x + 3, y, Z + 1, "dark_gray")
                sb.place("plate", 2, 4, x, y, Z + 4, "white", rot=90)
                sb.place("panel", 3, 1, x + 0.5, y + 1.3, Z + 5, "charcoal", plates=6, name="Monitor")
                sb.place("tile", 2.6, 1.6, x + 0.7, y + 1.0, Z + 5.4, "black", tilt=("X", 90),
                         material=LD.screen_material(f"OfficeScreen_{cx}_{dx}_{dy}", os.path.join(TEX, "screen_code.png"), strength=1.4))
        sb.place("brick", 10, 1, cx, cy + 3.5, Z + 1, "sand_blue", plates=6)  # vách thấp giữa cụm
    sb.next_step()  # phòng họp: vách kính + bàn dài + bảng trắng
    WK.glassify([sb.place("panel", 1, 2, 27, j, Z + 1, "trans_clear", plates=18, mat_kind="trans", name="GlassWall") for j in range(14, 25, 2)])
    sb.place("brick", 2, 8, 30, 17, Z + 1, "dark_gray", rot=90)
    sb.place("plate", 4, 10, 29, 16, Z + 4, "wood", rot=90)
    sb.place("tile", 8, 5, 29.5, 25.6, Z + 6, "white", tilt=("X", 90), name="Whiteboard",
             material=LD.screen_material("Whiteboard", os.path.join(TEX, "whiteboard.png"), strength=0.35))
    sb.next_step()  # bình nước, cây, máy in
    sb.place("brick", 2, 2, 22, 22, Z + 1, "white")
    sb.place("brick", 2, 2, 22, 22, Z + 4, "white")
    sb.place("round", 1, 1, 22.5, 22.5, Z + 7, "trans_blue", mat_kind="trans")
    sb.place("brick", 2, 2, 2, 22, Z + 1, "reddish_brown")
    for k, (dx, dy, dz) in enumerate(((0.5, 0.5, 3), (0, 0.6, 6), (1, 0.4, 6), (0.5, 0.5, 9))):
        sb.place("cone", 1, 1, 2 + dx, 22 + dy, Z + 1 + dz, "green_bright" if k % 2 else "green", studs=False)
    _ceiling(sb, 0, 0, 40, 27, Z + 24, "white", panel_glow="#F4F8FF")
    sb.anchor("desk_a", 7, 4, Z + 1, 0)
    sb.anchor("desk_b", 17, 4, Z + 1, 0)
    sb.anchor("aisle", 13, 15, Z + 1, 10)
    sb.anchor("whiteboard", 34, 22, Z + 1, -25)
    sb.anchor("meeting_left", 30, 14, Z + 1, 20)
    sb.anchor("meeting_right", 36, 14, Z + 1, -20)
    sb.anchor("cooler", 21, 19, Z + 1, 0)
    sb.anchor("center", 20, 13, Z + 1, 0)
    # trung cảnh: toà tháp bên kia cửa sổ (sát, cao) + phố
    m = WK.Merge(sb, "R2_TOWERS", 2, sb.center)
    WK.block_row(m, -4.5, 4.5, sb.L * STUD / 2 + 1.4, rnd, hmin=2.4, hmax=3.6, colors=("sand_blue", "light_gray", "cream"),
                 shops=(None,), glow=0.5)
    m.finish()
    _ring2_yard(sb, rnd, glow=0.4)
    WK.skyline(sb, sb.center, haze="#DCE4EA", hmin=2.0, hmax=5.0, key=sb.name)
    return sb


# ======================================================================= 4. CỬA HÀNG TIỆN LỢI (trong + mặt tiền neon)
def build_mini_mart(origin=(0, 0, 0)):
    sb = _base("Set_MiniMart", origin, "light_gray", sky="#1B2340", horizon="#3A3F66", ground="#2A2D36")
    rnd = WK.Rnd(sb.name)
    sb.next_step()
    sb.tile_floor(1, 1, 38, 25, ["white", "light_gray"], z=Z)
    _room_shell(sb, "white", rows=8, front_rows=0)
    sb.next_step()  # mặt tiền kính (kính nhìn xuyên; cột + dầm thuộc nhóm cutaway 'front')
    # kính mặt tiền thuộc nhóm cutaway 'front': máy ở trong cửa hàng nhìn gần qua kính thì kính tự ẩn (không thành tấm mờ che mặt)
    WK.tag_cut(WK.glassify([sb.place("panel", 10, 1, i, 0, Z, "trans_clear", plates=22, mat_kind="trans", name="ShopGlass") for i in (0, 10, 30)]), "front")
    n0 = len(sb.objects)
    for i in (0, 10, 20, 30, 39):
        sb.place("brick", 1, 1, i, 0, Z, "dark_gray", plates=25)
    for i in (0, 10, 20, 30):
        sb.place("brick", 10, 1, i, 0, Z + 22, "dark_gray")
    WK.tag_cut(sb.objects[n0:], "front")
    signs = [WK.sign_tile(sb, m_x(sb, 14), m_y(sb, -0.15), (Z + 25) * PLATE, 0.8, 0.25, "sign_mart.png", "SignMart", strength=2.2),
             WK.sign_tile(sb, m_x(sb, 26), m_y(sb, -0.15), (Z + 25) * PLATE, 0.5, 0.16, "sign_24h.png", "Sign24h", strength=2.4)]
    WK.tag_cut(signs, "front")
    WK.sign_tile(sb, m_x(sb, 34), m_y(sb, -0.15), (Z + 12) * PLATE, 0.24, 0.08, "sign_open.png", "SignOpen", strength=2.0)
    sb.next_step()  # kệ hàng 3 dãy
    for k, y in enumerate((9, 14, 19)):
        for x0 in (4, 16):
            sb.place("brick", 2, 10, x0, y, Z + 1, "light_gray", rot=90, plates=12)
            sb.place("tile", 10, 3.7, x0, y - 0.05, Z + 1.2, "white", tilt=("X", 90),
                     material=LD.textured_material(f"Shelf_{k}_{x0}", "light_gray", os.path.join(TEX, "product_shelf.png"), mapping="Generated"))
    sb.next_step()  # quầy thu ngân + máy tính tiền
    sb.place("brick", 8, 2, 26, 7, Z + 1, "red", plates=5)
    sb.place("brick", 4, 2, 34, 7, Z + 1, "red", plates=5)
    sb.place("plate", 12, 2, 26, 7, Z + 6, "dark_gray")
    sb.place("brick", 2, 2, 34, 7, Z + 7, "dark_gray")
    sb.place("tile", 1.8, 1.2, 34.1, 6.62, Z + 10, "black", tilt=("X", 90),
             material=LD.screen_material("Register", os.path.join(TEX, "screen_chart.png"), strength=1.2))
    sb.next_step()  # tủ lạnh phát sáng tường sau
    for i in range(4, 36, 6):
        sb.place("brick", 6, 2, i, 24, Z + 1, "white", plates=24)
        sb.place_mesh(BB.part_mesh("panel", 5, 1, 21), Matrix.Translation(((i + 0.5) * STUD, 23.9 * STUD, (Z + 2) * PLATE)),
                      "trans_blue", material=LD.matte_material(f"Fridge_{i}", "#BFF3FF", strength=1.4), name="FridgeGlow")
    _ceiling(sb, 0, 0, 40, 27, Z + 24, "white", panel_glow="#F0FBFF")
    sb.anchor("clerk", 30, 11, Z + 1, 0)
    sb.anchor("customer", 24, 5, Z + 1, 15)
    sb.anchor("aisle", 14, 11.5, Z + 1, 15)
    sb.anchor("fridge", 20, 21, Z + 1, 180)
    sb.anchor("entrance", 24, 3, Z + 1, 0)
    sb.anchor("center", 20, 12, Z + 1, 0)
    # trung cảnh đêm: vỉa hè phía trước, đèn đường, dãy nhà tối có ô cửa sáng
    pave = WK.Merge(sb, "R2_PAVE", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    pave.box(-6.0, -hl - 1.6, -0.004, 6.0, -hl, 0.014, "#8A8E96", kind="matte", part=False)
    pave.box(-6.0, -hl - 6.0, -0.006, 6.0, -hl - 1.6, 0.004, "#3B3E46", kind="matte", part=False)
    pave.finish(float_ok=True)
    _ring2_city(sb, rnd, glow=0.8, hmax=2.0)
    deco = WK.Merge(sb, "R2_NIGHT", 2, sb.center)
    WK.lamp(deco, -2.4, -hl - 1.2, glow="#FFD27A")
    WK.lamp(deco, 2.6, -hl - 1.2, glow="#FFD27A")
    WK.car(deco, -0.6, -hl - 3.2, color="dark_gray")
    deco.finish()
    WK.skyline(sb, sb.center, haze="#3A3F66", palette=("dark_gray", "blue_dark", "charcoal", "slate_blue"),
               window="#FFD98A", key=sb.name)
    return sb


# ======================================================================= 5. QUẢNG TRƯỜNG CÔNG VIÊN / ĐÀI NGẮM PHỐ
def build_park_plaza(origin=(0, 0, 0)):
    sb = _base("Set_ParkPlaza", origin, "green", sky="#F2A65A", horizon="#FFD9A8", ground="#5E7A4A")
    rnd = WK.Rnd(sb.name)
    sb.next_step()  # nền: ô cỏ + lối đi chữ thập (lát kín để mọi vật đứng trên mặt ô)
    for i in range(0, 40, 2):
        for j in range(0, 28, 2):
            path = 16 <= i < 24 or 10 <= j < 16
            c = ("tan" if (i // 2 + j // 2) % 2 else "cream") if path else ("green" if (i // 2 + j // 2) % 3 else "green_bright")
            sb.place("tile", 2, 2, i, j, Z, c)
    sb.next_step()  # đài phun nước
    for (dx, dy) in ((-3, -1), (-3, 1), (3, -1), (3, 1), (-1, -3), (1, -3), (-1, 3), (1, 3), (-2, -2), (2, -2), (-2, 2), (2, 2)):
        sb.place("brick", 1, 1, 19.5 + dx, 20.5 + dy, Z + 1, "light_gray")
    sb.place("plate", 6, 6, 17, 18, Z + 1, "trans_blue", mat_kind="trans")
    for k in range(3):
        sb.place("round", 1, 1, 19.5, 20.5, Z + 2 + k * 3, "light_gray")
    sb.place("cone", 1, 1, 19.5, 20.5, Z + 11, "trans_blue", studs=False, mat_kind="trans")
    sb.next_step()  # lan can đài ngắm phía sau
    for i in range(0, 40, 2):
        sb.place("round", 1, 1, i + 0.5, 26.5, Z + 1, "dark_gray")
        sb.place("round", 1, 1, i + 0.5, 26.5, Z + 4, "dark_gray")
    for i in range(0, 40, 8):
        sb.place("plate", 1, 8, i, 26, Z + 7, "dark_gray", rot=90)
    sb.next_step()  # ghế băng, cây, đèn, bồn hoa
    _bench_bricks(sb, 6, 7)
    _bench_bricks(sb, 30, 7)
    _bench_bricks(sb, 6, 18)
    _tree_bricks(sb, 3, 22, h=5)
    _tree_bricks(sb, 36, 22, h=5)
    _tree_bricks(sb, 36, 3, h=4)
    _lamp_bricks(sb, 9, 23)   # đèn ở phía sau, cạnh lan can: không đứng giữa máy và mốc diễn
    _lamp_bricks(sb, 31, 23)
    for i, c in enumerate(("pink", "yellow", "coral", "lavender", "white", "orange", "pink", "yellow")):
        sb.place("round", 1, 1, 26 + i * 1.5, 18, Z + 1, c, plates=1)
        sb.place("round", 1, 1, 26 + i * 1.5, 19.2, Z + 1, "green_bright", plates=1)
    WK.sign_tile(sb, m_x(sb, 11), m_y(sb, 3.0), (Z + 6) * PLATE, 0.36, 0.11, "sign_park.png", "SignPark", strength=0.5)
    sb.place("round", 1, 1, 10.5, 2.6, Z + 1, "dark_gray")
    sb.place("round", 1, 1, 10.5, 2.6, Z + 4, "dark_gray", plates=2)
    sb.anchor("bench_left", 8, 10, Z + 1, 0)
    sb.anchor("bench_right", 32, 10, Z + 1, -10)
    sb.anchor("fountain", 15, 16, Z + 1, 20)
    sb.anchor("overlook", 20, 24, Z + 1, 180)
    sb.anchor("path_center", 20, 8, Z + 1, 0)
    sb.anchor("path_left", 12, 13, Z + 1, 25)
    sb.anchor("center", 20, 12, Z + 1, 0)
    # trung cảnh: hàng rào cây xanh, ki-ốt, cây lớn; phía sau lan can là khoảng trống nhìn xuống phố
    m = WK.Merge(sb, "R2_PARK", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    m.box(-6.0, -hl - 1.2, -0.004, 6.0, hl, 0.006, "#6E8F52", kind="matte", part=False)
    for x in (-5.4, -4.2, -3.0, 3.0, 4.2, 5.4):
        WK.tree(m, x, rnd.r(-1.0, 1.4), s=rnd.r(1.0, 1.5), leaf=("green", "green_bright", "#4E8F3A"))
    for y in (-2.2, 2.0):
        m.box(-hw - 1.0, y - 0.1, -0.01, -hw - 0.6, y + 0.1, 0.12, "green", part=False)
        m.box(hw + 0.6, y - 0.1, -0.01, hw + 1.0, y + 0.1, 0.12, "green", part=False)
    m.box(-2.4, -hl - 1.0, -0.01, -1.6, -hl - 0.5, 0.5, "coral", kind="matte")   # ki-ốt
    m.box(-2.5, -hl - 1.1, 0.5, -1.5, -hl - 0.4, 0.55, "white")
    WK.bench(m, 1.8, -hl - 0.8)
    m.finish(float_ok=True)
    # xa: phố thấp hơn (đài ngắm) rồi chân trời
    city = WK.Merge(sb, "R2_LOWCITY", 2, sb.center)
    WK.block_row(city, -6.5, 6.5, hl + 2.2, rnd, hmin=0.6, hmax=1.6, glow=0.5)
    city.finish()
    WK.skyline(sb, sb.center, haze="#FFD9A8", palette=("tan", "coral", "cream", "sand_blue"), window="#FFF0C8",
               hmin=1.6, hmax=4.8, key=sb.name)
    return sb


# ======================================================================= 6. TRẠM XE BUÝT
def build_bus_stop(origin=(0, 0, 0)):
    """Vỉa hè ở phía máy (người chờ xe), lòng đường + xe buýt ở PHÍA SAU làm hậu cảnh (không chắn mặt)."""
    sb = _base("Set_BusStop", origin, "dark_gray", sky="#9CC4E8", horizon="#E2E8EC", ground="#5A5E64")
    rnd = WK.Rnd(sb.name)
    sb.next_step()  # vỉa hè + bó vỉa
    sb.tile_floor(0, 0, 40, 14, ["light_gray", "#B4B8BC"], z=Z)
    for i in range(0, 40, 10):
        sb.place("plate", 1, 10, i, 14, Z, "light_gray", rot=90)
    sb.next_step()  # vạch đường
    for i in range(1, 39, 4):
        sb.place("tile", 1, 2, i, 24.5, Z, "white", rot=90)
    sb.next_step()  # nhà chờ mở mặt trước: 4 cột, mái kính, vách kính bên phải, ghế
    for (x, y) in ((26, 6), (37, 6), (26, 11), (37, 11)):
        for k in range(7):
            sb.place("round", 1, 1, x, y, Z + 1 + k * 3, "dark_gray")
    WK.glassify([sb.place("plate", 6, 12, 26, 6, Z + 22, "trans_clear", mat_kind="trans", rot=90, studs=False)])
    WK.glassify([sb.place("panel", 1, 2, 37.5, j - 0.5, Z + 1, "trans_clear", plates=18, mat_kind="trans", name="ShelterSide") for j in (6.5, 8.5, 10.5)])
    sb.place("tile", 4, 6, 37.4, 7, Z + 6, "white", tilt=("X", 90), rot=90, name="CityMap",
             material=LD.screen_material("CityMap", os.path.join(TEX, "screen_chart.png"), strength=0.4))
    _bench_bricks(sb, 29, 9, color="dark_gray")
    sb.next_step()  # cột biển số tuyến
    for k in range(9):
        sb.place("round", 1, 1, 22, 12, Z + 1 + k * 3, "light_gray")
    WK.sign_tile(sb, m_x(sb, 22.5), m_y(sb, 11.8), (Z + 28) * PLATE, 0.2, 0.2, "sign_route7_sq.png", "SignRoute7", strength=0.6)
    sb.next_step()  # xe buýt đỗ sát lề phía sau (gạch to, màu chung chung)
    bus = WK.Merge(sb, "HERO_BUS", 1, sb.center)
    x0, x1 = m_x(sb, 3), m_x(sb, 25)
    y0, y1 = m_y(sb, 16), m_y(sb, 21.5)
    z0 = Z * PLATE
    bus.box(x0, y0, z0 + 0.06, x1, y1, z0 + 0.26, "white")
    bus.box(x0, y0, z0 + 0.26, x1, y1, z0 + 0.48, "trans_clear", kind="trans", part=False)
    bus.box(x0, y0, z0 + 0.48, x1, y1, z0 + 0.58, "white")
    bus.box(x0 - 0.002, y0 - 0.004, z0 + 0.12, x1 + 0.002, y0 + 0.002, z0 + 0.2, "teal_dark", part=False)  # sọc thân
    for k in range(7):
        xx = x0 + 0.12 + k * (x1 - x0 - 0.24) / 6
        bus.box(xx - 0.012, y0 - 0.002, z0 + 0.26, xx + 0.012, y0 + 0.004, z0 + 0.48, "white", part=False)
    bus.box(x1 - 0.42, y0 - 0.006, z0 + 0.04, x1 - 0.26, y0, z0 + 0.46, "dark_gray", part=False)  # cửa lên xe
    for xx in (x0 + 0.25, x1 - 0.25):
        for yy in (y0 + 0.03, y1 - 0.03):
            bus.box(xx - 0.07, yy - 0.03, z0, xx + 0.07, yy + 0.03, z0 + 0.12, "black", part=False)
    bus.finish()
    WK.sign_tile(sb, (x0 + 0.12), m_y(sb, 15.9), z0 + 0.49, 0.08, 0.08, "sign_route7_sq.png", "BusRoute", strength=0.8)
    _tree_bricks(sb, 39, 12.5, h=5)
    _lamp_bricks(sb, 1, 12.5)
    sb.anchor("shelter", 31, 6, Z + 1, -10)
    sb.anchor("curb_left", 8, 9, Z + 1, 20)
    sb.anchor("curb_right", 18, 8, Z + 1, -20)
    sb.anchor("stop_sign", 21, 9.5, Z + 1, -10)
    sb.anchor("bus_door", 24, 12, Z + 1, 160)
    sb.anchor("sidewalk_front", 13, 4, Z + 1, 0)
    sb.anchor("center", 20, 8, Z + 1, 0)
    _ring2_city(sb, rnd, glow=0.35, sides=False)
    cars = WK.Merge(sb, "R2_CARS", 2, sb.center)
    WK.car(cars, -5.0, 0.6, color="red")
    WK.car(cars, 4.6, 0.85, color="yellow")
    road = WK.Merge(sb, "R2_ROAD", 2, sb.center)
    hw, hl = sb.W * STUD / 2, sb.L * STUD / 2
    road.box(-7.0, m_y(sb, 14), -0.004, 7.0, hl + 0.6, 0.004, "dark_gray", kind="matte", part=False)
    road.box(-7.0, -hl - 1.5, -0.004, 7.0, m_y(sb, 14), 0.012, "light_gray", kind="matte", part=False)
    road.finish(float_ok=True)
    cars.finish()
    WK.skyline(sb, sb.center, haze="#E2E8EC", key=sb.name)
    return sb


# ======================================================================= 7. SÂN KHẤU SÁCH HƯỚNG DẪN (khoảng trắng lắp ráp)
def build_instruction_void(origin=(0, 0, 0)):
    sb = _base("Set_InstructionVoid", origin, "white", sky="#CFDCEC", horizon="#EEF2F7", ground="#D5DCE5")
    sb.next_step()
    sb.tile_floor(4, 4, 32, 20, ["white", "#EEF1F5"], z=Z)
    # bục xoay + mô hình minh hoạ lắp từng bước (ngôi nhà nhỏ)
    sb.next_step()
    for r in range(3):
        sb.place("round", 1, 1, 28, 17 + r, Z + 1, "light_gray")
    sb.place("plate", 6, 6, 26, 16, Z + 4, "blue")
    sb.next_step()
    sb.place("brick", 2, 4, 26.5, 16.5, Z + 5, "red")
    sb.place("brick", 2, 4, 29.5, 16.5, Z + 5, "red")
    sb.next_step()
    sb.place("brick", 1, 4, 26.5, 16.5, Z + 8, "white", rot=90)
    sb.place("brick", 1, 4, 26.5, 19.5, Z + 8, "white", rot=90)
    sb.place("brick", 2, 2, 28, 17.5, Z + 8, "yellow")
    sb.next_step()
    sb.place("cone", 1, 1, 27, 17, Z + 11, "orange", studs=False)
    sb.place("cone", 1, 1, 30, 17, Z + 11, "orange", studs=False)
    sb.place("cone", 1, 1, 27, 20, Z + 11, "orange", studs=False)
    sb.place("cone", 1, 1, 30, 20, Z + 11, "orange", studs=False)
    sb.next_step()  # cột biểu đồ gạch ba bậc (tăng dần)
    for k, (h, c) in enumerate(((2, "blue"), (4, "orange"), (6, "green_bright"))):
        for r in range(h):
            sb.place("brick", 2, 2, 8 + k * 3, 18, Z + 1 + r * 3, c)
    sb.anchor("narrator", 12, 11, Z + 1, 10)
    sb.anchor("pedestal", 22, 11, Z + 1, -20)
    sb.anchor("left", 9, 12, Z + 1, 20)
    sb.anchor("right", 31, 12, Z + 1, -20)
    sb.anchor("center", 20, 12, Z + 1, 0)
    # vòng 2 tối giản: chồng gạch khổng lồ mờ ở xa làm tiền cảnh/hậu cảnh (không phải khoảng trống trơn)
    m = WK.Merge(sb, "R2_GIANT_BRICKS", 2, sb.center)
    rnd = WK.Rnd(sb.name)
    for k in range(10):
        a = k / 10 * 6.283
        r = rnd.r(4.2, 6.0)
        x, y = r * math.cos(a), r * math.sin(a) + 1.0
        if y < -2.2:
            continue  # chừa hành lang máy quay phía trước
        c = WK.mix_hex(rnd.pick(("red", "blue", "yellow", "green_bright", "orange")), "#F6F8FB", 0.55)
        w, d, h = rnd.r(0.5, 0.9), 0.4, rnd.r(0.3, 0.9)
        m.box(x - w / 2, y - d / 2, -0.01, x + w / 2, y + d / 2, h, c, studs=True)
    m.finish()
    return sb


WORLD_SETS = {
    "Set_CityStreetCorner": build_city_street,
    "Set_ApartmentCutaway": build_apartment,
    "Set_OfficeFloor": build_office_floor,
    "Set_MiniMart": build_mini_mart,
    "Set_ParkPlaza": build_park_plaza,
    "Set_BusStop": build_bus_stop,
    "Set_InstructionVoid": build_instruction_void,
}
