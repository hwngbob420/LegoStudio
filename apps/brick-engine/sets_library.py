"""Brick set recipes (open-backlot dioramas). Each builder returns a SetBuilder with stage anchors.

Assembly steps (obj["step"]) define the order of the "clack-clack-clack" build-up transition.
Coordinates: x, y in studs from the set's min corner; z in plates. Camera convention: looks toward +Y.
"""
from __future__ import annotations
import math, os
import bpy
from mathutils import Matrix, Vector

import look_dev as LD
import brick_builder as BB
from brick_builder import STUD, PLATE
import minifig_builder as MB

import paths as P

TEX = P.TEXTURES


def _cyc_backdrop(coll, center, width=9.0, depth=5.0, height=4.0, cname="#C9D9E8"):
    """Seamless studio cyclorama behind the diorama (curved floor-to-wall sweep)."""
    import bmesh
    bm = bmesh.new()
    n = 16
    prof = []
    for i in range(n + 1):  # floor then curve then wall
        a = (math.pi / 2) * i / n
        r = 1.2
        prof.append((depth - r + r * math.sin(a), r - r * math.cos(a)))
    prof = [(-depth, 0.0)] + prof + [(depth, height)]
    rows = []
    for x in (-width / 2, width / 2):
        rows.append([bm.verts.new((x, y, z)) for (y, z) in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new("Cyc")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("Cyc_Backdrop", me)
    ob.data.materials.append(LD.matte_material("Cyc", cname))
    ob.location = Vector(center) + Vector((0, 0, -0.002))
    ob["step"] = -1
    coll.objects.link(ob)
    return ob


# ======================================================================= CREATOR DESK
def build_creator_desk(origin=(0, 0, 0)):
    W, L = 32, 24
    sb = BB.SetBuilder("Set_BrickCreatorDesk", origin=(origin[0] - W * STUD / 2, origin[1] - L * STUD / 2, origin[2]))
    _cyc_backdrop(sb.coll, (origin[0], origin[1] + 1.2, 0), cname="#9FB9D2")
    sb.place("baseplate", W, L, 0, 0, 0, "light_gray")
    Z = 0.5  # top of baseplate in plates
    # floor: warm wood checker tiles, a rug in the middle (2 steps)
    sb.next_step()
    sb.tile_floor(2, 0, 30, 11, ["wood", "tan"], z=Z)
    sb.next_step()
    sb.tile_floor(2, 11, 30, 10, ["wood", "tan"], z=Z)
    for i in range(8, 24, 2):
        for j in range(10, 16, 2):
            sb.place("tile", 2, 2, i, j, Z + 1, "teal_dark" if (i // 2 + j // 2) % 2 else "sand_green")
    # back wall (y=22..23): sand blue with cream stripe, window opening x18..26 rows 2..7
    for r0, r1 in ((0, 3), (3, 6), (6, 9)):
        sb.next_step()
        _wall_rows(sb, 0, 22, 32, r0, r1, "sand_blue", Z, openings=[(18, 26, 2, 7)], accent={1: "cream"}, axis="X")
        _wall_rows(sb, 0, 2, 20, r0, r1, "cream", Z, openings=[], accent={1: "sand_green"}, axis="Y")
    # window: white frame, glowing sky panel, mullion
    sb.next_step()
    sb.place("plate", 1, 10, 17, 21, Z + 6, "white", rot=90)   # sill
    sb.place_mesh(BB.part_mesh("panel", 8, 1, 15), Matrix.Translation((18 * STUD, 22.4 * STUD, (Z + 6) * PLATE)),
                  "trans_blue", material=LD.matte_material("SkyWindow", "#BFE3FF", strength=1.6), name="WindowSky")
    for r in range(5):
        sb.place("brick", 1, 1, 21.5, 21.6, Z + 6 + r * 3, "white")
    sb.place("plate", 1, 10, 17, 21.6, Z + 21, "white", rot=90)
    # poster on the back wall
    sb.place("tile", 4, 6, 4, 21.55, Z + 7, "cream", tilt=("X", 90),
             material=LD.textured_material("Poster", "cream", os.path.join(TEX, "poster_brick.png"), mapping="Generated"))
    # desk against the back wall: x 8..18, y 18..21
    sb.next_step()
    for (x, y) in ((8, 18), (17, 18), (8, 20), (17, 20)):
        sb.place("brick", 1, 1, x, y, Z + 1, "dark_gray")
        sb.place("brick", 1, 1, x, y, Z + 4, "dark_gray")
    sb.place("plate", 2, 10, 8, 18, Z + 7, "wood", rot=90)
    sb.place("plate", 2, 10, 8, 20, Z + 7, "wood", rot=90)
    top = Z + 8
    # monitor
    sb.next_step()
    sb.place("plate", 2, 2, 12, 19.5, top, "dark_gray")
    sb.place("round", 1, 1, 12.5, 20, top + 1, "dark_gray")
    sb.place("round", 1, 1, 12.5, 20, top + 4, "dark_gray")
    sb.place("panel", 5, 1, 10.5, 19.8, top + 4, "charcoal", plates=9, name="MonitorBezel")
    sb.place("tile", 4.5, 3.2, 10.75, 19.4, top + 4.5, "black", tilt=("X", 90), name="MonitorScreen",
             material=LD.screen_material("ScreenCode", os.path.join(TEX, "screen_code.png"), strength=1.8))
    sb.place("tile", 1, 4, 11, 18.3, top, "light_gray", name="Keyboard")
    sb.place("tile", 1, 1, 15.5, 18.4, top, "white", name="Mouse")
    # three coffees (the joke)
    for k, c in enumerate(("white", "red", "teal_dark")):
        sb.place_mesh(MB.mesh_mug(), Matrix.Translation(((8.6 + k * 0.95) * STUD, 18.6 * STUD, top * PLATE)), c, name=f"Mug_{k}")
    # book stack + succulent
    for k, c in enumerate(("blue", "orange", "white", "red")):
        sb.place("plate", 2, 3, 16.2 + 0.15 * (k % 2), 19.6, top + k, c)
    sb.place("round", 1, 1, 16.7, 20.1, top + 4, "reddish_brown")
    sb.place("cone", 1, 1, 16.7, 20.1, top + 7, "green_bright", studs=False)
    # bookshelf on the left wall
    sb.next_step()
    for z in (Z + 1, Z + 10, Z + 19, Z + 28):
        sb.place("plate", 2, 8, 1, 9, z, "wood")
    for y in (9, 16):
        for k in range(3):
            sb.place("brick", 1, 1, 1.5, y, Z + 2 + k * 9, "wood")
            sb.place("brick", 1, 1, 1.5, y, Z + 5 + k * 9, "wood")
    books = ["red", "blue", "yellow", "green_bright", "orange", "white", "lavender", "coral", "teal_dark", "mustard"]
    for shelf in range(3):
        for k in range(6):
            sb.place("brick", 1, 1, 1.5, 10 + k, Z + 2 + shelf * 9, books[(k * 3 + shelf * 2) % len(books)])
            if k % 2 == 0:
                sb.place("brick", 1, 1, 1.5, 10 + k, Z + 5 + shelf * 9, books[(k * 7 + shelf) % len(books)], plates=1)
    # plant in the corner
    sb.next_step()
    sb.place("brick", 2, 2, 28, 19, Z + 1, "terracotta" if "terracotta" in LD.PALETTE else "reddish_brown")
    for k, (dx, dy, dz) in enumerate(((0.5, 0.5, 3), (0, 0.6, 6), (1, 0.4, 6), (0.5, 0.5, 9), (0.2, 0.9, 11))):
        sb.place("cone", 1, 1, 28 + dx, 19 + dy, Z + 1 + dz, "green_bright" if k % 2 else "green", studs=False)
    sb.place("round", 1, 1, 28.5, 19.5, Z + 13, "green_bright", plates=1)
    # anchors
    sb.anchor("max_mark", 10.5, 13.5, Z + 2, 18)
    sb.anchor("priya_mark", 20.5, 12.5, Z + 2, -22)
    sb.anchor("priya_offstage", 34, 11, Z + 1, -90)
    sb.anchor("desk_center", 13, 19, top, 0)
    sb.anchor("center", 16, 12, Z + 1, 0)
    return sb


def _wall_rows(sb, x, y, length, r0, r1, color, z, openings, accent, axis):
    for r in range(r0, r1):
        pos = 0
        seq = []
        if r % 2:
            seq.append(2); pos = 2
        while pos < length:
            seq.append(min(4, length - pos)); pos += seq[-1]
        p = 0
        c = accent.get(r, color)
        for n in seq:
            s0, s1 = p, p + n
            p += n
            if any(o[2] <= r < o[3] and s0 < o[1] and s1 > o[0] for o in openings):
                for s in range(s0, s1):
                    if not any(o[2] <= r < o[3] and o[0] <= s < o[1] for o in openings):
                        sb._wall_piece(x, y, s, 1, r, z, axis, c)
                continue
            sb._wall_piece(x, y, s0, n, r, z, axis, c)


# ======================================================================= CAFE STREET
def build_cafe_street(origin=(0, 0, 0)):
    W, L = 32, 24
    sb = BB.SetBuilder("Set_BrickCafeStreet", origin=(origin[0] - W * STUD / 2, origin[1] - L * STUD / 2, origin[2]))
    _cyc_backdrop(sb.coll, (origin[0], origin[1] + 1.2, 0), cname="#F3D9B8")
    sb.place("baseplate", W, L, 0, 0, 0, "dark_gray")
    Z = 0.5
    sb.next_step()  # road markings
    for i in range(1, 31, 4):
        sb.place("tile", 1, 2, i, 3.5, Z, "white", rot=90)
    sb.next_step()  # sidewalk
    sb.tile_floor(0, 8, 32, 12, ["light_gray", "light_gray", "#B4B8BC"], z=Z)
    sb.place("plate", 1, 8, 0, 7, Z, "light_gray", rot=90)
    for r0, r1 in ((0, 4), (4, 8)):
        sb.next_step()
        _wall_rows(sb, 0, 20, 32, r0, r1, "brick_red", Z, openings=[(6, 18, 1, 6), (22, 26, 0, 7)], accent={7: "tan"}, axis="X")
    sb.next_step()  # big cafe window + door
    sb.place_mesh(BB.part_mesh("panel", 12, 1, 15), Matrix.Translation((6 * STUD, 20.4 * STUD, (Z + 4) * PLATE)),
                  "orange", material=LD.matte_material("CafeGlow", "#F2B061", strength=0.9), name="CafeWindow")
    sb.place_mesh(BB.part_mesh("panel", 4, 1, 21), Matrix.Translation((22 * STUD, 20.5 * STUD, (Z + 1) * PLATE)),
                  "wood", name="CafeDoor")
    sb.place("tile", 4, 3, 26.5, 19.55, Z + 8, "black", tilt=("X", 90),
             material=LD.screen_material("Menu", os.path.join(TEX, "menu_board.png"), strength=0.8))
    sb.next_step()  # awning stripes
    for i in range(16):
        c = "red" if i % 2 == 0 else "white"
        sb.place("plate", 1, 3, 5 + i, 17.6, Z + 17, c, tilt=("X", -28))
    sb.next_step()  # tables & chairs
    for tx in (6, 14):
        sb.place("round", 1, 1, tx, 14, Z + 1, "black")
        sb.place("round", 1, 1, tx, 14, Z + 4, "black")
        sb.place("plate", 4, 4, tx - 1.5, 12.5, Z + 7, "white")
        sb.place_mesh(MB.mesh_mug(), Matrix.Translation(((tx + 0.6) * STUD, 13.6 * STUD, (Z + 8) * PLATE)), "white")
        for cx in (tx - 3, tx + 2):
            sb.place("plate", 2, 2, cx, 13.5, Z + 4, "wood")
            sb.place("brick", 1, 1, cx + 0.5, 14, Z + 1, "dark_gray")
    sb.next_step()  # street lamp + tree + flowers
    for k in range(6):
        sb.place("round", 1, 1, 27, 9, Z + 1 + k * 3, "black")
    sb.place("round", 1, 1, 27, 9, Z + 19, "yellow", mat_kind="glow")
    for k in range(3):
        sb.place("round", 1, 1, 2, 10, Z + 1 + k * 3, "reddish_brown")
    for k, (dx, dy, dz, s) in enumerate(((0, 0, 9, "green"), (-0.6, 0.3, 11, "green_bright"), (0.6, -0.2, 12, "green"),
                                          (0, 0.4, 14, "green_bright"), (0, 0, 16, "green"))):
        sb.place("cone", 1, 1, 2 + dx, 10 + dy, Z + 1 + dz, s, studs=False)
    for i, c in enumerate(("pink", "yellow", "coral", "lavender", "white", "orange")):
        sb.place("round", 1, 1, 7 + i * 2, 19, Z + 1, c, plates=1)
    sb.anchor("cafe_left", 9, 11, Z + 1, 15)
    sb.anchor("cafe_right", 19, 11, Z + 1, -15)
    sb.anchor("door", 24, 18, Z + 1, 0)
    sb.anchor("center", 16, 11, Z + 1, 0)
    return sb


# ======================================================================= OFFICE STAGE
def build_office_stage(origin=(0, 0, 0)):
    W, L = 32, 24
    sb = BB.SetBuilder("Set_BrickOfficeStage", origin=(origin[0] - W * STUD / 2, origin[1] - L * STUD / 2, origin[2]))
    _cyc_backdrop(sb.coll, (origin[0], origin[1] + 1.2, 0), cname="#1E2740")
    sb.place("baseplate", W, L, 0, 0, 0, "blue_dark")
    Z = 0.5
    sb.next_step()
    sb.tile_floor(0, 0, 32, 12, ["blue_dark", "slate_blue"], z=Z)
    sb.next_step()  # stage platform
    for i in range(4, 28, 4):
        for j in range(12, 20, 2):
            sb.place("brick", 4, 2, i, j, Z, "dark_gray")
    sb.place("tile", 2, 2, 4, 12, Z + 3, "orange")
    for i in range(4, 28, 2):
        sb.place("tile", 2, 2, i, 12, Z + 3, "orange" if i % 4 == 0 else "dark_gray")
        for j in range(14, 20, 2):
            sb.place("tile", 2, 2, i, j, Z + 3, "charcoal")
    sb.next_step()  # big screen
    sb.place("panel", 18, 1, 7, 20.6, Z + 3, "black", plates=22, name="StageScreenFrame")
    sb.place("tile", 16, 10, 8, 20.5, Z + 5, "black", tilt=("X", 90), name="StageScreen",
             material=LD.screen_material("StageChart", os.path.join(TEX, "screen_chart.png"), strength=1.4))
    sb.next_step()  # podium + spot cans + plants
    sb.place("brick", 2, 2, 22, 13, Z + 3, "wood")
    sb.place("brick", 2, 2, 22, 13, Z + 6, "wood")
    sb.place("plate", 2, 3, 22, 12.6, Z + 9, "wood")
    for x in (3, 28):
        for k in range(8):
            sb.place("round", 1, 1, x, 20, Z + 3 + k * 3, "black")
        sb.place("round", 1, 1, x, 20, Z + 27, "white", mat_kind="glow")
        sb.place("brick", 2, 2, x - 0.5, 15, Z + 3, "reddish_brown")
        sb.place("cone", 1, 1, x, 15.5, Z + 6, "green_bright", studs=False)
        sb.place("cone", 1, 1, x, 15.5, Z + 9, "green", studs=False)
    sb.anchor("stage_center", 16, 15, Z + 4, 0)
    sb.anchor("stage_left", 11, 15, Z + 4, 12)
    sb.anchor("stage_right", 21, 15, Z + 4, -12)
    sb.anchor("floor_center", 16, 6, Z + 1, 0)
    sb.anchor("center", 16, 12, Z + 1, 0)
    return sb


SETS = {"Set_BrickCreatorDesk": build_creator_desk, "Set_BrickCafeStreet": build_cafe_street,
        "Set_BrickOfficeStage": build_office_stage}
