"""Stage compiler (Blender PLAYER): build sets + cast, then play build/baked_timeline.json.

    blender -b --factory-startup -P apps/brick-engine/stage_compiler.py -- <production_dir> --mode contact|render|blend [--fast]

Phase C: all motion (acting, faces, lip-sync, cameras, assembly, FX placement) is computed ONCE by packages/director
(TypeScript) into build/baked_timeline.json. Blender only keys those exact values; the Three.js preview plays the same file.
Outputs:
    build/contact/<shot>.png + build/contact/contact.json    (mode contact; includes director-predicted head boxes)
    frames/f_####.png                                        (mode render)
"""
from __future__ import annotations
import json, math, os, sys, time

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


# ------------------------------------------------------------------ playback of the baked timeline
def _key(obj, path, frame):
    obj.keyframe_insert(path, frame=frame)


def apply_actor(rig, A, frames):
    """Root + joint eulers + face cells, one CONSTANT key per frame (stop-motion)."""
    head = MB.head_object(rig)
    last_face = None
    for f in range(1, frames + 1):
        x, y, z, rz = A["root"][f - 1]
        rig.location = (x, y, z)
        rig.rotation_euler = (0, 0, rz)
        _key(rig, "location", f)
        _key(rig, "rotation_euler", f)
        for b, arr in A["joints"].items():
            pb = rig.pose.bones.get(b)
            if pb is not None:
                pb.rotation_euler = arr[f - 1]
                pb.keyframe_insert("rotation_euler", frame=f)
        face = tuple(A["face"][f - 1])
        if face != last_face:
            head["face_expr"], head["face_mouth"] = float(face[0]), float(face[1])
            _key(head, '["face_expr"]', f)
            _key(head, '["face_mouth"]', f)
            last_face = face
    AL.set_constant(rig)
    AL.set_constant(head)


def apply_camera(cam, S, rigs):
    cd = cam.data
    cd.lens = S["lens"]
    cd.dof.aperture_fstop = S["fstop"]
    cd.dof.aperture_blades = 7
    cd.shift_x, cd.shift_y = S["shift"]
    if "actor" in S["focus"]:
        cd.dof.focus_object = MB.focus_object(rigs[S["focus"]["actor"]])
    else:
        cd.dof.focus_distance = S["focus"]["distance"]
    for i, k in enumerate(S["keys"]):
        f = S["f0"] + i
        cam.location = k[:3]
        cam.rotation_euler = k[3:]
        _key(cam, "location", f)
        _key(cam, "rotation_euler", f)
    AL.set_constant(cam)


def apply_assembly(objs_by_name, entry):
    lift = entry["lift"]
    for name, fs in entry["show"].items():
        o = objs_by_name.get(name)
        if o is None:
            continue
        home = o.location.copy()
        o.hide_render = True
        o.keyframe_insert("hide_render", frame=1)
        o.hide_render = False
        o.keyframe_insert("hide_render", frame=fs)
        o.location = home + Vector((0, 0, lift))
        _key(o, "location", fs)
        o.location = home + Vector((0, 0, -0.004))
        _key(o, "location", fs + 1)
        o.location = home
        _key(o, "location", fs + 2)
        AL.set_constant(o)


# ------------------------------------------------------------------ main compile
def compile_episode(prod_dir, fast=False):
    """Build sets + cast in Blender, then PLAY build/baked_timeline.json (written by packages/director)."""
    t_start = time.time()
    build = os.path.join(prod_dir, "build")
    bt_path = os.path.join(build, "baked_timeline.json")
    if not os.path.exists(bt_path):
        raise SystemExit("Missing build/baked_timeline.json - run: npx tsx packages/director/src/cli.ts " + prod_dir)
    T = json.load(open(bt_path, encoding="utf-8"))
    fps, frames = T["fps"], T["frames"]
    W, H = T["resolution"]
    reset_scene()
    sc = bpy.context.scene
    LD.setup_render(W, H, fps=fps, samples=T.get("samples") or 32, fast=fast)
    sc.frame_start, sc.frame_end = 1, frames
    sets = {}
    for i, sdef in enumerate(T["sets"]):
        org = tuple(sdef["origin"])
        sb = SL.SETS[sdef["id"]](origin=org)
        sets[sdef["id"]] = sb
        preset = LD.load_lighting(sdef.get("lighting", "studio_bright"))
        if i == 0:
            LD.setup_world(preset)
        LD.setup_lights(preset, org)
    rigs = {}
    for aid, A in T["actors"].items():
        rig = MB.build_minifig(A["fig"])
        rigs[aid] = rig
        for prop in A.get("props", []):
            if prop == "mug":
                me = MB.mesh_mug()
                if not me.materials:
                    me.materials.append(None)
                mug = bpy.data.objects.new(f"{aid}_mug", me)
                mug.material_slots[0].link = "OBJECT"
                mug.material_slots[0].material = LD.abs_material(A.get("prop_color") or "white")
                sc.collection.objects.link(mug)
                MB.attach_prop(rig, mug, "hand.R", local=(-0.086, -0.070, 0.128))
        apply_actor(rig, A, frames)
    for entry in T["assembly"]:
        apply_assembly({o.name: o for o in sets[entry["set"]].objects}, entry)
    cams = []
    for S in T["shots"]:
        cam = make_camera(f"CAM_{S['id']}", S, None)
        apply_camera(cam, S, rigs)
        mk = sc.timeline_markers.new(S["id"], frame=S["f0"])
        mk.camera = cam
        cams.append((S, cam, S["f0"], S["f1"]))
    sc.camera = cams[0][1]
    cam_by_shot = {S["id"]: cam for S, cam, _, _ in cams}
    for e in T["fx"]:
        FX.spawn_fx(e["kind"], e["f0"], e["f1"], Vector(e["loc"]), cam_by_shot[e["shot"]], size=e["size"])
    for sid in sets:
        BB.export_ldr(os.path.join(build, f"{sid}.ldr"), sid)
    print(f"[compile] {len(bpy.data.objects)} objects, {frames} frames @ {fps} fps, played baked timeline in {time.time() - t_start:.1f}s")
    return T, cams, rigs, frames, fps


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


def run_contact(prod_dir, T, cams, rigs, fast):
    sc = bpy.context.scene
    out = os.path.join(prod_dir, "build", "contact")
    os.makedirs(out, exist_ok=True)
    sc.render.resolution_percentage = 50
    report = {"shots": []}
    ep = json.load(open(os.path.join(prod_dir, "storyboard.json"), encoding="utf-8"))
    by_id = {x["id"]: x for x in ep["shots"]}
    qa = {q["shot"]: q for q in T["qa"]}
    for S, cam, f0, f1 in cams:
        s = by_id[S["id"]]
        f = qa[S["id"]]["key_f"]
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
        for smp in qa[S["id"]]["samples"]:
            fr = smp["f"]
            samples.append({"t": round((fr - 1) / sc.render.fps, 3), "f": fr, "heads": heads_at(fr), "predicted": smp["heads"]})
        sc.frame_set(f)
        report["shots"].append({"id": s["id"], "frame": f, "png": path, "render_s": round(time.time() - t, 2),
                                "subject_zone": s.get("subject_zone", "center"),
                                "ui_safe_zone": s.get("ui_safe_zone", "none"),
                                "ui_rect": UI_ZONES.get(s.get("ui_safe_zone", "none")),
                                "subtitle_band": SUBTITLE_BAND, "heads": heads, "samples": samples})
    json.dump(report, open(os.path.join(out, "contact.json"), "w"), indent=1)
    print("[contact] wrote", len(report["shots"]), "shots")


def run_render(prod_dir, f_end, frange=None, out=None):
    """Render all frames, or one chunk (frange=(f0, f1)) into `out`. Existing frames are skipped (resume after a crash)."""
    sc = bpy.context.scene
    out = out or os.path.join(prod_dir, "frames")
    os.makedirs(out, exist_ok=True)
    if frange:
        sc.frame_start, sc.frame_end = frange
    sc.render.filepath = os.path.join(out, "f_")
    sc.render.use_overwrite = False
    sc.render.use_placeholder = False
    t = time.time()
    bpy.ops.render.render(animation=True)
    dt = time.time() - t
    n = sc.frame_end - sc.frame_start + 1
    if not frange:
        json.dump({"frames": f_end, "seconds": round(dt, 1), "s_per_frame": round(dt / max(1, f_end), 2)},
                  open(os.path.join(prod_dir, "build", "render_stats.json"), "w"))
    print(f"[render] {n} frames in {dt:.1f}s ({dt / max(1, n):.2f}s/frame)")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    prod = os.path.abspath(argv[0])
    mode = argv[argv.index("--mode") + 1] if "--mode" in argv else "contact"
    fast = "--fast" in argv
    T, cams, rigs, f_end, fps = compile_episode(prod, fast)
    if mode == "contact":
        run_contact(prod, T, cams, rigs, fast)
    elif mode == "render":
        frange = (int(argv[argv.index("--range") + 1]), int(argv[argv.index("--range") + 2])) if "--range" in argv else None
        out = argv[argv.index("--out") + 1] if "--out" in argv else None
        run_render(prod, f_end, frange, out)
    if mode == "blend" or "--save" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(prod, "build", "episode.blend"), compress=True)


if __name__ == "__main__":
    main()
