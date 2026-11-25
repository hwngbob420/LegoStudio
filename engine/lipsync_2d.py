"""Audio -> 2D viseme track, quantised to the world frame rate.

    python engine/lipsync_2d.py <production_dir> [--rhubarb]

Sources (first available):
  1. SAPI viseme events captured by tts_sapi.py (default, offline, exact)
  2. Rhubarb Lip Sync JSON (tools/bin/rhubarb) for any recorded wav (--rhubarb)
Output: build/mouth_tracks.json  {actor: {frame: mouth_cell_index}}  (-1 = rest, use expression's rest mouth)

Quantisation: each world frame picks the mouth shape with the largest overlap inside that frame window;
closed-lip shapes (A = M/B/P) get a priority boost so plosives never vanish at 12 fps; a shape must hold
at least one frame (no flicker).
"""
from __future__ import annotations
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = json.load(open(os.path.join(ROOT, "vault_config", "face_atlases", "face_atlas_spec.json"), encoding="utf-8"))

# SAPI viseme id (0-21) -> Rhubarb/Preston-Blair shape
SAPI_TO_SHAPE = {0: "X", 1: "C", 2: "D", 3: "E", 4: "C", 5: "E", 6: "B", 7: "F", 8: "E", 9: "D", 10: "E", 11: "D",
                 12: "C", 13: "B", 14: "H", 15: "B", 16: "B", 17: "H", 18: "G", 19: "B", 20: "B", 21: "A"}
PRIORITY = {"A": 1.6, "F": 1.2, "G": 1.2, "D": 1.1}


def segments_from_sapi(line):
    segs = []
    for t, v, dur in line["visemes"]:
        segs.append((t, t + max(dur, 0.04), SAPI_TO_SHAPE.get(v, "X")))
    return segs


def segments_from_rhubarb(wav, rhubarb, offset):
    out = subprocess.run([rhubarb, "-f", "json", "--extendedShapes", "GHX", wav], capture_output=True, text=True, check=True)
    cues = json.loads(out.stdout)["mouthCues"]
    return [(offset + c["start"], offset + c["end"], c["value"]) for c in cues]


def quantise(segs, fps, f_lo, f_hi):
    """Return {frame: shape} for frames whose window overlaps speech."""
    out = {}
    for f in range(f_lo, f_hi + 1):
        a, b = (f - 1) / fps, f / fps
        score = {}
        for s0, s1, shp in segs:
            ov = min(b, s1) - max(a, s0)
            if ov > 0:
                score[shp] = score.get(shp, 0) + ov * PRIORITY.get(shp, 1.0)
        if score:
            out[f] = max(score, key=score.get)
    # anti-flicker: an open shape sandwiched between two rests becomes a small 'B'... keep, but
    # collapse X between two speech frames to the previous shape (SAPI inserts tiny silences)
    fs = sorted(out)
    for i in range(1, len(fs) - 1):
        if out[fs[i]] == "X" and out[fs[i - 1]] != "X" and out[fs[i + 1]] != "X":
            out[fs[i]] = "C" if out[fs[i - 1]] in ("D", "C") else "B"
    return out


def main(prod, use_rhubarb=False):
    timing = json.load(open(os.path.join(prod, "build", "timing.json"), encoding="utf-8"))
    fps = timing.get("fps_world", 12)
    mouths = SPEC["mouths"]
    tracks: dict = {}
    rh = os.path.join(ROOT, "tools", "bin", "rhubarb", "rhubarb.exe")
    for lid, L in timing["lines"].items():
        if use_rhubarb and os.path.exists(rh):
            segs = segments_from_rhubarb(L["wav"], rh, L["wav_start"])
        else:
            segs = segments_from_sapi(L)
        f_lo = int(L["start"] * fps)
        f_hi = int(L["end"] * fps) + 2
        q = quantise(segs, fps, f_lo, f_hi)
        tr = tracks.setdefault(L["speaker"], {})
        for f, shp in q.items():
            tr[str(f)] = -1 if shp == "X" else mouths.index(shp)
    json.dump(tracks, open(os.path.join(prod, "build", "mouth_tracks.json"), "w"))
    n = sum(len(v) for v in tracks.values())
    print(f"mouth tracks: {len(tracks)} actors, {n} keyed frames @ {fps} fps")


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]), "--rhubarb" in sys.argv)
