"""Extract QA evidence frames from the final MP4 (one per shot key moment + extra beats) and a strip.

    python engine/qa_frames.py <production_dir>   -> qa_frames/*.jpg + qa_frames/_strip.jpg
"""
from __future__ import annotations
import json, os, subprocess, sys

ENGINE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ENGINE)
from timeref import Timeline


def main(prod):
    ep = json.load(open(os.path.join(prod, "episode_shotlist.json"), encoding="utf-8"))
    timing = json.load(open(os.path.join(prod, "build", "timing.json"), encoding="utf-8"))
    tl = Timeline(timing)
    tl.resolve_shots(ep["shots"])
    picks = []
    for s in ep["shots"]:
        kt = tl.t(s["key_t"]) if s.get("key_t") is not None else (s["_t0"] + s["_t1"]) / 2
        picks.append((f"{s['id']}_key", kt))
    for name, ref in ep.get("qa_extra", {}).items():
        picks.append((name, tl.t(ref)))
    out = os.path.join(prod, "qa_frames")
    os.makedirs(out, exist_ok=True)
    mp4 = os.path.join(prod, "output_final.mp4")
    paths = []
    for name, t in picks:
        p = os.path.join(out, f"{name}_{t:05.2f}s.jpg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", mp4, "-frames:v", "1", "-q:v", "3", p], check=True)
        paths.append(p)
    from PIL import Image
    ims = [Image.open(p).resize((640, 360)) for p in paths]
    cols = 3
    rows = (len(ims) + cols - 1) // cols
    strip = Image.new("RGB", (cols * 640, rows * 360), (0, 0, 0))
    for i, im in enumerate(ims):
        strip.paste(im, ((i % cols) * 640, (i // cols) * 360))
    strip.save(os.path.join(out, "_strip.jpg"), quality=85)
    print(f"qa frames: {len(paths)} -> {out}")


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
