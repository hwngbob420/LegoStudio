"""Stage compiler: episode_shotlist.json -> animated Blender scene -> contact sheet / frames / .blend.

    blender -b --factory-startup -P engine/stage_compiler.py -- <production_dir> --mode contact|render|blend [--fast]

Inputs (inside <production_dir>):
    episode_shotlist.json   written by 01-showrunner (tiny JSON)
    build/timing.json       from engine/tts_sapi.py  (line start/end seconds)
    build/mouth_tracks.json from engine/lipsync_2d.py (per-actor mouth cell per world frame)
Outputs:
    build/contact/shot_XX.png + build/contact/contact.json   (mode contact)
    frames/f_####.png                                        (mode render)
    build/sfx_events.json                                    (always: clacks, pops, whooshes)
"""
from __future__ import annotations
import json, math, os, random, sys, time, zlib

ENGINE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ENGINE)
import bpy
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

import look_dev as LD
import brick_builder as BB
import minifig_builder as MB
import acting_library as AL
import fx_library as FX
import sets_library as SL

UI_ZONES = {  # normalised [x0, y0, x1, y1], origin top-left
    "left_third": [0.035, 0.10, 0.365, 0.76], "right_third": [0.635, 0.10, 0.965, 0.76],
    "top_left": [0.035, 0.06, 0.40, 0.24], "top_right": [0.60, 0.06, 0.965, 0.24],
    "top_center": [0.32, 0.05, 0.68, 0.22], "none": None,
}
SUBTITLE_BAND = [0.12, 0.83, 0.88, 0.96]
SUBJECT_SHIFT = {"left_third": 1 / 6, "right_third": -1 / 6, "center": 0.0}


from timeref import Timeline


def frame_of(t, fps):
    return int(round(t * fps)) + 1


# ------------------------------------------------------------------ scene setup
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def head_world_center(rig):
    return MB.focus_object(rig).matrix_world.translation.copy()


def make_camera(name, shot, ctx):
    cd = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(cam)
    cd.sensor_width = 36
    cd.clip_start = 0.02
    cd.clip_end = 60
    cd.dof.use_dof = True
    return cam


def place_camera(cam, spec, ctx, f0, f1, subjects, set_center, seed):
    """Camera presets with Rule-of-Thirds lens shift, tilt-shift DoF and stepped handheld micro-shake."""
    cd = cam.data
    preset = spec.get("preset", "mcu")
    zone = spec.get("subject_zone", "center")
    yaw = math.radians(spec.get("yaw", 0))
    heads = [head_world_center(r) for r in subjects] if subjects else []
    focus_obj = MB.focus_object(subjects[0]) if subjects else None
    lens, fstop, dist, height, look = 50, 1.4, 1.0, 0.0, None
    sc = Vector(set_center)
    if preset in ("wide_establish", "assembly_high"):
        lens = spec.get("lens", 30 if preset == "assembly_high" else 35)
        fstop = spec.get("fstop", 1.0)
        back = 3.1 if preset == "assembly_high" else 2.85
        up = 1.75 if preset == "assembly_high" else 1.05
        look = sc + Vector((0, 0.25, 0.22))
        pos = sc + Vector((math.sin(yaw) * back, -math.cos(yaw) * back, up))
        focus_point = sc + Vector((0, -0.05, 0.25))
        shift = (0.0, 0.0)
    elif preset == "two_shot":
        a, b = heads[0], heads[1]
        mid = (a + b) / 2
        sep = (a - b).length
        lens = spec.get("lens", 45)
        fstop = spec.get("fstop", 1.6)
        fov = 2 * math.atan(18 / lens)
        d = sep / (spec.get("spread", 0.46) * 2 * math.tan(fov / 2))
        look = mid + Vector((0, 0, -0.02))
        pos = mid + Vector((math.sin(yaw) * d, -math.cos(yaw) * d, 0.10 + spec.get("rise", 0.0)))
        focus_point = mid
        shift = (0.0, -0.06)
    else:  # mcu / ecu / mcu_low
        h = heads[0]
        lens = spec.get("lens", 70 if preset == "ecu" else 50)
        fstop = spec.get("fstop", 1.8 if preset == "ecu" else 1.4)
        d = spec.get("distance", 0.62 if preset == "ecu" else 0.95)
        rise = spec.get("rise", 0.015 if preset == "ecu" else 0.04)
        face = math.radians(subjects[0]["facing_now"]) if "facing_now" in subjects[0] else 0
        ang = face * 0.5 + yaw
        pos = h + Vector((math.sin(ang) * d, -math.cos(ang) * d, rise))
        look = h + Vector((0, 0, -0.012 if preset == "ecu" else -0.04))
        focus_point = h
        # vertical: ECU head centred slightly high; MCU leaves headroom (positive shift moves subject down)
        shift = (SUBJECT_SHIFT.get(zone, 0.0), 0.0 if preset == "ecu" else 0.035)
    cd.lens = lens
    cd.dof.aperture_fstop = fstop
    cd.dof.aperture_blades = 7
    cd.shift_x, cd.shift_y = shift
    if focus_obj is not None and preset not in ("wide_establish", "assembly_high"):
        cd.dof.focus_object = focus_obj
    else:
        cd.dof.focus_distance = (pos - focus_point).length
    move = spec.get("move", "none")
    rnd = random.Random(seed)
    shake = spec.get("shake", 1.0)
    base_rot = (look - pos).to_track_quat("-Z", "Y").to_euler()
    for f in range(f0, f1 + 1):
        u = (f - f0) / max(1, f1 - f0)
        p = pos.copy()
        if move == "push_in":
            p = pos.lerp(look, 0.10 * u)
        elif move == "pull_out":
            p = pos.lerp(look, 0.10 * (1 - u))
        elif move == "drift_right":
            p = pos + Vector((0.08 * u, 0, 0))
        elif move == "crane_down":
            p = pos + Vector((0, 0, 0.25 * (1 - u) ** 2))
        jit = Vector((rnd.gauss(0, 0.0012), rnd.gauss(0, 0.0012), rnd.gauss(0, 0.0012))) * shake
        cam.location = p + jit
        r = (look - p).to_track_quat("-Z", "Y").to_euler()
        r.x += rnd.gauss(0, 0.0009) * shake
        r.z += rnd.gauss(0, 0.0009) * shake
        cam.rotation_euler = r
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
    AL.set_constant(cam)
    return cam


# ------------------------------------------------------------------ assembly transition
def animate_assembly(objs, f0, f1, fps, sfx, origin_lift=0.55):
    steps = sorted({o["step"] for o in objs if o.get("step", -1) >= 1})
    if not steps:
        return
    span = max(1, f1 - f0)
    per = span / len(steps)
    for si, s in enumerate(steps):
        group = [o for o in objs if o.get("step") == s]
        group.sort(key=lambda o: (o.matrix_world.translation.z, o.matrix_world.translation.x + o.matrix_world.translation.y))
        fs_base = f0 + int(si * per)
        sfx.append({"t": (fs_base - 1) / fps, "type": "clack", "gain": 1.0})
        for k, o in enumerate(group):
            fs = fs_base + (1 if (k > len(group) / 2 and per >= 2) else 0)
            home = o.location.copy()
            o.hide_render = True
            o.keyframe_insert("hide_render", frame=1)
            o.hide_render = False
            o.keyframe_insert("hide_render", frame=fs)
            o.location = home + Vector((0, 0, origin_lift * 0.35))
            o.keyframe_insert("location", frame=fs)
            o.location = home + Vector((0, 0, -0.004))
            o.keyframe_insert("location", frame=fs + 1)
            o.location = home
            o.keyframe_insert("location", frame=fs + 2)
            AL.set_constant(o)
        if per >= 3:
            sfx.append({"t": (fs_base) / fps + 0.04, "type": "clack", "gain": 0.6})


# ------------------------------------------------------------------ faces
def key_faces(rig, head, expr_track, mouth_track, fps, f_end, seed, spec):
    """expr_track: [(t, expr_name)], mouth_track: {frame: mouth_index or -1(rest)}. Adds auto-blinks."""
    eyes, mouths = spec["eyes"], spec["mouths"]
    rest_of = spec["expression_rest_mouth"]
    rnd = random.Random(seed)
    expr_track = sorted(expr_track)
    blink_frames = set()
    t = rnd.uniform(0.8, 2.0)
    while t * fps < f_end:
        blink_frames.add(frame_of(t, fps))
        t += rnd.uniform(2.2, 4.2)
    last = (None, None)
    for f in range(1, f_end + 1):
        t = (f - 1) / fps
        e = expr_track[0][1]
        for (te, name) in expr_track:
            if te <= t + 1e-6:
                e = name
        ei = eyes.index(e)
        if f in blink_frames and e not in ("happy_closed", "blink", "shocked_wide"):
            ei = eyes.index("blink")
        m = mouth_track.get(str(f), mouth_track.get(f, -1))
        mi = mouths.index(rest_of[e]) if m in (-1, None) else m
        if (ei, mi) != last or f == 1:
            head["face_expr"] = float(ei)
            head["face_mouth"] = float(mi)
            head.keyframe_insert('["face_expr"]', frame=f)
            head.keyframe_insert('["face_mouth"]', frame=f)
            last = (ei, mi)
    AL.set_constant(head)


# ------------------------------------------------------------------ main compile
def compile_episode(prod_dir, fast=False):
    t_start = time.time()
    shot_path = os.path.join(prod_dir, "episode_shotlist.json")
    ep = json.load(open(shot_path, encoding="utf-8"))
    build = os.path.join(prod_dir, "build")
    os.makedirs(build, exist_ok=True)
    timing = json.load(open(os.path.join(build, "timing.json"), encoding="utf-8"))
    mouths_all = {}
    mp = os.path.join(build, "mouth_tracks.json")
    if os.path.exists(mp):
        mouths_all = json.load(open(mp, encoding="utf-8"))
    tl = Timeline(timing)
    fps = ep.get("fps_world", 12)
    W, H = ep.get("resolution", [1920, 1080])
    # resolve shots in order so later shots may reference earlier ones
    tl.resolve_shots(ep["shots"])
    duration = ep["shots"][-1]["_t1"]
    f_end = frame_of(duration, fps) - 1
    reset_scene()
    sc = bpy.context.scene
    LD.setup_render(W, H, fps=fps, samples=ep.get("samples", 32), fast=fast)
    sc.frame_start, sc.frame_end = 1, f_end
    # sets
    sets = {}
    for i, sdef in enumerate(ep["sets"]):
        org = (i * 14.0, 0, 0)
        sb = SL.SETS[sdef["id"]](origin=org)
        sets[sdef["id"]] = {"sb": sb, "center": Vector(org), "def": sdef}
        preset = LD.load_lighting(sdef.get("lighting", "studio_bright"))
        if i == 0:
            LD.setup_world(preset)
        LD.setup_lights(preset, org)
    # cast
    rigs = {}
    for c in ep["cast"]:
        rig = MB.build_minifig(c["id"])
        a = sets[c["set"]]["sb"].anchors[c["mark"]]
        rig["home"] = a["location"]
        rig["facing_now"] = a["facing_deg"]
        rig.location = a["location"]
        rig.rotation_euler = (0, 0, math.radians(a["facing_deg"]))
        rigs[c["id"]] = rig
        for prop in c.get("props", []):
            if prop == "mug":
                me = MB.mesh_mug()
                if not me.materials:
                    me.materials.append(None)
                mug = bpy.data.objects.new(f"{c['id']}_mug", me)
                mug.material_slots[0].link = "OBJECT"
                mug.material_slots[0].material = LD.abs_material(c.get("prop_color", "white"))
                sc.collection.objects.link(mug)
                MB.attach_prop(rig, mug, "hand.R", local=(-0.086, -0.070, 0.128))
    # gather acting / expressions / fx per actor across shots
    acts = {k: [] for k in rigs}
    exprs = {k: [] for k in rigs}
    appear = {}
    sfx = []
    fx_list = []
    for s in ep["shots"]:
        for aid, A in s.get("actors", {}).items():
            for clip in A.get("acts", []):
                acts[aid].append({"action": clip["a"], "t0": tl.t(clip["t0"]), "t1": tl.t(clip["t1"]),
                                  "intensity": clip.get("intensity", 1.0), "mirror": clip.get("mirror", False)})
            for e in A.get("expr", []):
                exprs[aid].append((tl.t(e["t"]), e["e"]))
            if "appear" in A:
                appear[aid] = tl.t(A["appear"])
        for fx in s.get("fx", []):
            fx_list.append(fx)
    spec = LD.FACE_SPEC
    for aid, rig in rigs.items():
        recipe = MB.load_recipe(rig["fig_id"])
        if not exprs[aid]:
            exprs[aid] = [(0.0, recipe.get("default_expression", "innocent_dot"))]
        exprs[aid].sort()
        if exprs[aid][0][0] > 0:
            exprs[aid].insert(0, (0.0, exprs[aid][0][1]))
        home = Vector(rig["home"])
        app = appear.get(aid)

        def zfn(t, app=app):
            if app is None:
                return 0.0
            if t < app - 1.5 / fps:
                return 6.0
            if t < app - 0.5 / fps:
                return 0.18
            return 0.0

        AL.bake_actor(rig, acts[aid], fps, 1, f_end, home, rig["facing_now"], seed=zlib.crc32(aid.encode()) % 1000)
        if app is not None:
            for f in range(1, f_end + 1):
                t = (f - 1) / fps
                z = zfn(t)
                if z:
                    sc.frame_set(f)
                    rig.location = home + Vector((0, 0, z))
                    rig.keyframe_insert("location", frame=f)
            AL.set_constant(rig)
            sfx.append({"t": app, "type": "clack", "gain": 1.1})
        key_faces(rig, MB.head_object(rig), exprs[aid], mouths_all.get(aid, {}), fps, f_end, zlib.crc32(aid.encode()) % 997, spec)
    # assembly
    for s in ep["shots"]:
        asm = s.get("assembly")
        if asm:
            objs = sets[s["set"]]["sb"].objects
            animate_assembly(objs, frame_of(tl.t(asm["t0"]), fps), frame_of(tl.t(asm["t1"]), fps), fps, sfx)
    # cameras per shot + markers
    cams = []
    for i, s in enumerate(ep["shots"]):
        f0, f1 = frame_of(s["_t0"], fps), max(frame_of(s["_t0"], fps), frame_of(s["_t1"], fps) - 1)
        subj = [rigs[a] for a in s.get("subjects", [])]
        sc.frame_set(f0 + (f1 - f0) // 2)
        cam = make_camera(f"CAM_{s['id']}", s, None)
        spec_c = dict(s.get("camera", {}))
        spec_c.setdefault("subject_zone", s.get("subject_zone", "center"))
        place_camera(cam, spec_c, None, f0, f1, subj, sets[s["set"]]["center"], seed=i * 31 + 7)
        mk = sc.timeline_markers.new(s["id"], frame=f0)
        mk.camera = cam
        cams.append((s, cam, f0, f1))
        if i > 0 and s.get("whoosh", False):
            sfx.append({"t": s["_t0"] - 0.08, "type": "whoosh", "gain": 0.7})
    sc.camera = cams[0][1]
    # FX (needs cameras): billboard to the shot camera active at its start time
    for fx in fx_list:
        t0, t1 = tl.t(fx["t0"]), tl.t(fx["t1"])
        f0, f1 = frame_of(t0, fps), frame_of(t1, fps)
        cam = next((c for (s, c, a, b) in cams if a <= f0 <= b), cams[-1][1])
        sc.frame_set(f0)
        rig = rigs[fx["actor"]]
        hc = head_world_center(rig)
        off = Vector(fx.get("offset", (0.055, -0.02, 0.06)))
        right = (cam.matrix_world.to_3x3() @ Vector((1, 0, 0)))
        loc = hc + right * off.x + Vector((0, off.y, off.z))
        FX.spawn_fx(fx["kind"], f0, f1, loc, cam, size=fx.get("size", 0.06))
        sfx.append({"t": t0, "type": "pop" if fx["kind"] != "shock_lines" else "boing", "gain": 0.8})
    json.dump(sorted(sfx, key=lambda e: e["t"]), open(os.path.join(build, "sfx_events.json"), "w"), indent=1)
    # export ldr for each set
    for sid in sets:
        BB.export_ldr(os.path.join(build, f"{sid}.ldr"), sid)
    print(f"[compile] {len(bpy.data.objects)} objects, {f_end} frames @ {fps} fps, built in {time.time() - t_start:.1f}s")
    return ep, cams, rigs, f_end, fps, tl


def head_bbox_screen(sc, cam, rig):
    """Projected (x0, y0, x1, y1) of head + hair, origin top-left, normalised."""
    pts = []
    for ob in rig.children:
        if ob.parent_bone == "head":
            for c in ob.bound_box:
                pts.append(ob.matrix_world @ Vector(c))
    xs, ys = [], []
    for p in pts:
        v = world_to_camera_view(sc, cam, p)
        if v.z > 0:
            xs.append(v.x)
            ys.append(1 - v.y)
    if not xs:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def run_contact(prod_dir, ep, cams, rigs, fast, tl=None):
    sc = bpy.context.scene
    out = os.path.join(prod_dir, "build", "contact")
    os.makedirs(out, exist_ok=True)
    sc.render.resolution_percentage = 50
    report = {"shots": []}
    for s, cam, f0, f1 in cams:
        kt = s.get("key_t")
        f = frame_of(tl.t(kt), sc.render.fps) if (kt is not None and tl) else (f0 + f1) // 2
        f = min(max(f, f0), f1)
        sc.frame_set(f)
        sc.camera = cam
        path = os.path.join(out, f"{s['id']}.png")
        sc.render.filepath = path
        t = time.time()
        bpy.ops.render.render(write_still=True)
        def heads_at(fr):
            sc.frame_set(fr)
            hs = {}
            for aid, rig in rigs.items():
                bb = head_bbox_screen(sc, cam, rig)
                if bb and bb[2] > 0 and bb[0] < 1 and bb[3] > 0 and bb[1] < 1:
                    hs[aid] = bb
            return hs
        heads = heads_at(f)
        # time samples across the whole shot so the gate catches UI cues that overlap later/earlier faces
        samples = []
        for fr in sorted({f0, f0 + (f1 - f0) // 4, (f0 + f1) // 2, f0 + 3 * (f1 - f0) // 4, f1, f}):
            samples.append({"t": round((fr - 1) / sc.render.fps, 3), "heads": heads_at(fr)})
        sc.frame_set(f)
        report["shots"].append({"id": s["id"], "frame": f, "png": path, "render_s": round(time.time() - t, 2),
                                "subject_zone": s.get("subject_zone", "center"),
                                "ui_safe_zone": s.get("ui_safe_zone", "none"),
                                "ui_rect": UI_ZONES.get(s.get("ui_safe_zone", "none")),
                                "subtitle_band": SUBTITLE_BAND, "heads": heads, "samples": samples})
    json.dump(report, open(os.path.join(out, "contact.json"), "w"), indent=1)
    print("[contact] wrote", len(report["shots"]), "shots")


def run_render(prod_dir, f_end):
    sc = bpy.context.scene
    out = os.path.join(prod_dir, "frames")
    os.makedirs(out, exist_ok=True)
    sc.render.filepath = os.path.join(out, "f_")
    sc.render.use_overwrite = True
    t = time.time()
    bpy.ops.render.render(animation=True)
    dt = time.time() - t
    json.dump({"frames": f_end, "seconds": round(dt, 1), "s_per_frame": round(dt / max(1, f_end), 2)},
              open(os.path.join(prod_dir, "build", "render_stats.json"), "w"))
    print(f"[render] {f_end} frames in {dt:.1f}s ({dt / max(1, f_end):.2f}s/frame)")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    prod = os.path.abspath(argv[0])
    mode = argv[argv.index("--mode") + 1] if "--mode" in argv else "contact"
    fast = "--fast" in argv
    ep, cams, rigs, f_end, fps, tl = compile_episode(prod, fast)
    if mode == "contact":
        run_contact(prod, ep, cams, rigs, fast, tl)
    elif mode == "render":
        run_render(prod, f_end)
    if mode == "blend" or "--save" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(prod, "build", "episode.blend"), compress=True)


if __name__ == "__main__":
    main()
