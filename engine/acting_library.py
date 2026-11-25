"""Stop-motion acting library: named gestures baked as discrete per-frame poses.

Every world frame (12 fps = "on twos" of 24) gets its own key with CONSTANT interpolation. That is the
stop-motion look: no spline smoothing, just poses. A tiny per-frame "boil" jitter mimics
hand-animated puppets.

Pose values are Euler offsets in DEGREES on top of the rest pose (see minifig_builder for axis meanings):
    arm.*  X<0 raises the arm forward;  arm.L Z>0 / arm.R Z<0 = raise sideways (outward)
    leg.*  X<0 = leg forward
    torso/head X>0 = lean/nod forward, Y>0 = turn to the figure's left, Z = sideways tilt
"""
from __future__ import annotations
import math, random
import bpy
from mathutils import Vector

BONES = ("hips", "torso", "head", "arm.L", "arm.R", "hand.L", "hand.R", "leg.L", "leg.R")

# action: {"loop": period_s | None, "keys": [(t, {bone: (x, y, z)})], "root": [(t, (dx, dy, dz))]}
ACTIONS = {
    "idle_breathe": {"loop": 2.6, "keys": [
        (0.0, {"torso": (0, 0, 0), "head": (0, 0, 0), "arm.L": (0, 0, 2), "arm.R": (0, 0, -2)}),
        (0.5, {"torso": (1.8, 0, 0), "head": (-1.5, 0, 0), "arm.L": (-3, 0, 4), "arm.R": (-3, 0, -4)}),
        (1.0, {"torso": (0, 0, 0), "head": (0, 0, 0), "arm.L": (0, 0, 2), "arm.R": (0, 0, -2)})]},
    "talk_gestures": {"loop": 1.5, "keys": [
        (0.0, {"arm.R": (-30, 0, -8), "hand.R": (0, 15, 0), "head": (2, 5, 2), "torso": (0, 4, 0)}),
        (0.3, {"arm.R": (-55, 0, -18), "hand.R": (0, -20, 0), "head": (-3, -3, -2), "torso": (2, -2, 0)}),
        (0.6, {"arm.R": (-42, 0, -5), "hand.R": (0, 25, 0), "head": (1, 7, 3), "torso": (0, 5, 0), "arm.L": (-12, 0, 6)}),
        (1.0, {"arm.R": (-30, 0, -8), "hand.R": (0, 15, 0), "head": (2, 5, 2), "torso": (0, 4, 0)})]},
    "talk_both_hands": {"loop": 1.3, "keys": [
        (0.0, {"arm.R": (-35, 0, -10), "arm.L": (-35, 0, 10), "head": (0, 0, 0)}),
        (0.5, {"arm.R": (-55, 0, -22), "arm.L": (-50, 0, 22), "head": (-4, 0, 3), "torso": (2, 0, 0)}),
        (1.0, {"arm.R": (-35, 0, -10), "arm.L": (-35, 0, 10), "head": (0, 0, 0)})]},
    "shrug_confused": {"loop": None, "keys": [
        (0.0, {}),
        (0.2, {"arm.L": (-30, 0, 38), "arm.R": (-30, 0, -38), "hand.L": (0, -40, 0), "hand.R": (0, 40, 0), "head": (0, 0, 14), "torso": (0, 0, -3)}),
        (0.8, {"arm.L": (-34, 0, 42), "arm.R": (-34, 0, -42), "hand.L": (0, -40, 0), "hand.R": (0, 40, 0), "head": (0, 0, 16), "torso": (0, 0, -3)}),
        (1.0, {})]},
    "point_explain": {"loop": None, "keys": [
        (0.0, {}),
        (0.18, {"arm.R": (-28, 0, -82), "hand.R": (0, 30, 0), "head": (0, -20, 0), "torso": (0, -8, 0), "arm.L": (-10, 0, 8)}),
        (0.5, {"arm.R": (-32, 0, -88), "hand.R": (0, 30, 0), "head": (-3, -24, 0), "torso": (0, -10, 0), "arm.L": (-10, 0, 8)}),
        (0.85, {"arm.R": (-30, 0, -84), "hand.R": (0, 30, 0), "head": (0, -18, 0), "torso": (0, -8, 0), "arm.L": (-10, 0, 8)}),
        (1.0, {})]},
    "slump_tired": {"loop": None, "keys": [
        (0.0, {}),
        (0.25, {"torso": (12, 0, 3), "head": (16, 0, -6), "arm.L": (6, 0, -2), "arm.R": (6, 0, 2)}),
        (1.0, {"torso": (13, 0, 3), "head": (18, 0, -7), "arm.L": (7, 0, -2), "arm.R": (7, 0, 2)})]},
    "shock_jump": {"loop": None, "keys": [
        (0.0, {}),
        (0.12, {"arm.L": (-60, 0, 70), "arm.R": (-60, 0, -70), "head": (-12, 0, 0), "torso": (-6, 0, 0),
                "leg.L": (-15, 0, 0), "leg.R": (12, 0, 0), "hand.L": (0, -30, 0), "hand.R": (0, 30, 0)}),
        (0.32, {"arm.L": (-40, 0, 55), "arm.R": (-40, 0, -55), "head": (-8, 0, 0), "torso": (-3, 0, 0)}),
        (1.0, {"arm.L": (-35, 0, 45), "arm.R": (-35, 0, -45), "head": (-6, 0, 0)})],
        "root": [(0.0, (0, 0, 0)), (0.12, (0, 0, 0.09)), (0.26, (0, 0, 0)), (1.0, (0, 0, 0))]},
    "walk_stopmotion": {"loop": 0.66, "keys": [
        (0.0, {"leg.L": (-28, 0, 0), "leg.R": (28, 0, 0), "arm.L": (22, 0, 3), "arm.R": (-22, 0, -3), "torso": (3, 4, 0)}),
        (0.5, {"leg.L": (28, 0, 0), "leg.R": (-28, 0, 0), "arm.L": (-22, 0, 3), "arm.R": (22, 0, -3), "torso": (3, -4, 0)}),
        (1.0, {"leg.L": (-28, 0, 0), "leg.R": (28, 0, 0), "arm.L": (22, 0, 3), "arm.R": (-22, 0, -3), "torso": (3, 4, 0)})],
        "root": [(0.0, (0, 0, 0)), (0.25, (0, 0, 0.012)), (0.5, (0, 0, 0)), (0.75, (0, 0, 0.012)), (1.0, (0, 0, 0))]},
    "sip_coffee": {"loop": None, "keys": [
        (0.0, {}),
        (0.3, {"arm.R": (-96, 0, 18), "hand.R": (0, 0, 0), "head": (-14, 0, 0), "torso": (-3, 0, 0)}),
        (0.72, {"arm.R": (-100, 0, 20), "head": (-16, 0, 0), "torso": (-4, 0, 0)}),
        (1.0, {})]},
    "nod_yes": {"loop": 0.5, "keys": [(0.0, {"head": (0, 0, 0)}), (0.5, {"head": (14, 0, 0)}), (1.0, {"head": (0, 0, 0)})]},
    "shake_no": {"loop": 0.5, "keys": [(0.0, {"head": (0, -14, 0)}), (0.5, {"head": (0, 14, 0)}), (1.0, {"head": (0, -14, 0)})]},
    "hands_on_hips": {"loop": None, "keys": [
        (0.0, {}),
        (0.2, {"arm.L": (8, 0, 28), "arm.R": (8, 0, -28), "hand.L": (0, 60, 0), "hand.R": (0, -60, 0), "torso": (-4, 0, 0), "head": (-5, 0, 6)}),
        (1.0, {"arm.L": (8, 0, 28), "arm.R": (8, 0, -28), "hand.L": (0, 60, 0), "hand.R": (0, -60, 0), "torso": (-4, 0, 0), "head": (-6, 0, 7)})]},
    "facepalm": {"loop": None, "keys": [
        (0.0, {}),
        (0.25, {"arm.R": (-112, 0, 30), "head": (16, 0, 0), "torso": (6, 0, 0)}),
        (0.85, {"arm.R": (-115, 0, 32), "head": (18, 0, 0), "torso": (7, 0, 0)}),
        (1.0, {})]},
    "wave": {"loop": None, "keys": [
        (0.0, {}),
        (0.15, {"arm.R": (-20, 0, -150), "head": (0, 0, 6)}),
        (0.35, {"arm.R": (-20, 0, -130), "head": (0, 0, 6)}),
        (0.55, {"arm.R": (-20, 0, -155), "head": (0, 0, 6)}),
        (0.75, {"arm.R": (-20, 0, -132), "head": (0, 0, 6)}),
        (1.0, {})]},
    "lean_in": {"loop": None, "keys": [
        (0.0, {}), (0.25, {"torso": (9, 0, 0), "head": (-6, 0, 0)}), (1.0, {"torso": (10, 0, 0), "head": (-7, 0, 0)})]},
}


def _mirror(pose: dict) -> dict:
    out = {}
    for b, (x, y, z) in pose.items():
        nb = b.replace(".L", ".TMP").replace(".R", ".L").replace(".TMP", ".R")
        out[nb] = (x, -y, -z)
    return out


def _ease(u):
    return u * u * (3 - 2 * u)


def _sample(keys, u, mirror=False):
    """Interpolate pose dicts at normalised time u with smoothstep easing between keys."""
    if u <= keys[0][0]:
        k0 = k1 = keys[0]; f = 0.0
    elif u >= keys[-1][0]:
        k0 = k1 = keys[-1]; f = 0.0
    else:
        for i in range(len(keys) - 1):
            if keys[i][0] <= u <= keys[i + 1][0]:
                k0, k1 = keys[i], keys[i + 1]
                span = max(1e-6, k1[0] - k0[0])
                f = _ease((u - k0[0]) / span)
                break
    out = {}
    for b in set(k0[1]) | set(k1[1]):
        a = Vector(k0[1].get(b, (0, 0, 0)))
        c = Vector(k1[1].get(b, (0, 0, 0)))
        out[b] = a.lerp(c, f)
    if mirror:
        out = {k: Vector(v) for k, v in _mirror({b: tuple(v) for b, v in out.items()}).items()}
    return out


def _sample_root(rkeys, u):
    if not rkeys:
        return Vector((0, 0, 0))
    for i in range(len(rkeys) - 1):
        if rkeys[i][0] <= u <= rkeys[i + 1][0]:
            span = max(1e-6, rkeys[i + 1][0] - rkeys[i][0])
            f = _ease((u - rkeys[i][0]) / span)
            return Vector(rkeys[i][1]).lerp(Vector(rkeys[i + 1][1]), f)
    return Vector(rkeys[-1][1])


def pose_at(clips: list, t: float, blend_s: float = 0.17):
    """Combine the idle base layer and all active clips at time t (seconds). Returns (bone->Vector deg, root offset)."""
    pose = {b: Vector((0, 0, 0)) for b in BONES}
    root = Vector((0, 0, 0))
    idle = ACTIONS["idle_breathe"]
    for b, v in _sample(idle["keys"], (t / idle["loop"]) % 1.0).items():
        pose[b] += v
    for c in clips:
        t0, t1 = c["t0"], c["t1"]
        if not (t0 - 1e-6 <= t <= t1 + 1e-6):
            continue
        a = ACTIONS[c["action"]]
        w = c.get("intensity", 1.0)
        if a["loop"]:
            u = ((t - t0) / a["loop"]) % 1.0
            ramp = min(1.0, (t - t0) / blend_s, (t1 - t) / blend_s)
            w *= max(0.0, ramp)
        else:
            u = (t - t0) / max(1e-6, t1 - t0)
        for b, v in _sample(a["keys"], u, c.get("mirror", False)).items():
            pose[b] += v * w
        root += _sample_root(a.get("root"), u) * c.get("intensity", 1.0)
    return pose, root


def set_constant(obj):
    """Force CONSTANT interpolation on every fcurve of obj's action (Blender 5 slotted actions)."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    act = ad.action
    curves = []
    if hasattr(act, "fcurves"):
        curves = list(act.fcurves)
    else:
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(ad.action_slot)
                if cb:
                    curves += list(cb.fcurves)
    for fc in curves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"


def bake_actor(rig, clips: list, fps: int, f0: int, f1: int, base_loc, facing_deg, seed=0, boil=0.35,
               path: list | None = None):
    """Bake per-frame stop-motion poses for one rig.

    clips: [{"action", "t0", "t1", "intensity"?, "mirror"?}] in seconds.
    path:  optional [(t, (x, y, z), facing_deg)] waypoints for walking (linear, stepped per frame).
    """
    rnd = random.Random(seed)
    base = Vector(base_loc)
    for f in range(f0, f1 + 1):
        t = (f - 1) / fps
        pose, root = pose_at(clips, t)
        for b, v in pose.items():
            pb = rig.pose.bones.get(b)
            if pb is None:
                continue
            j = (rnd.uniform(-boil, boil), rnd.uniform(-boil, boil), rnd.uniform(-boil, boil)) if boil else (0, 0, 0)
            pb.rotation_euler = [math.radians(v[i] + j[i]) for i in range(3)]
            pb.keyframe_insert("rotation_euler", frame=f)
        loc, face = base.copy(), facing_deg
        if path:
            loc, face = _path_at(path, t, base, facing_deg)
        # root offsets are in the figure's facing frame
        ang = math.radians(face)
        off = Vector((root.x * math.cos(ang) - root.y * math.sin(ang), root.x * math.sin(ang) + root.y * math.cos(ang), root.z))
        rig.location = loc + off
        rig.rotation_euler = (0, 0, ang)
        rig.keyframe_insert("location", frame=f)
        rig.keyframe_insert("rotation_euler", frame=f)
    set_constant(rig)


def _path_at(path, t, base, facing):
    if t <= path[0][0]:
        return Vector(path[0][1]), path[0][2]
    for i in range(len(path) - 1):
        (ta, pa, fa), (tb, pb, fb) = path[i], path[i + 1]
        if ta <= t <= tb:
            u = (t - ta) / max(1e-6, tb - ta)
            return Vector(pa).lerp(Vector(pb), u), fa + (fb - fa) * min(1.0, u * 3)
    return Vector(path[-1][1]), path[-1][2]
