"""FFmpeg master compositor: 12 fps Blender plate + 60 fps Remotion alpha overlay + mix -> 1080p60 MP4.

    python apps/brick-engine/master_compositor.py <production_dir>

The plate is held 5x per frame (12 -> 60 fps, perfectly even cadence), receives a whisper of film grain
and vignette, then the transparent overlay (VP9 + alpha, decoded with libvpx so alpha survives) sits on top.
"""
from __future__ import annotations
import json, os, subprocess, sys


def plate_input(prod, fps_world):
    """Video input args for the Blender plate: concatenated chunk parts (long-form) or a single PNG sequence."""
    cdir = os.path.join(prod, "chunks")
    parts = sorted(f for f in os.listdir(cdir) if f.startswith("part_") and f.endswith(".mp4")) if os.path.isdir(cdir) else []
    if parts:
        lst = os.path.join(cdir, "list.txt")
        open(lst, "w", encoding="utf-8").write("".join("file '" + p + "'" + chr(10) for p in parts))
        return ["-f", "concat", "-safe", "0", "-i", lst]
    return ["-framerate", str(fps_world), "-start_number", "1", "-i", os.path.join(prod, "frames", "f_%04d.png")]


def composite(prod, fps_world=12, fps_out=60, crf=17):
    overlay = os.path.join(prod, "build", "overlay.webm")
    mix = os.path.join(prod, "build", "mix.wav")
    out = os.path.join(prod, "output_final.mp4")
    fc = (f"[0:v]fps={fps_out},noise=alls=3:allf=t,vignette=angle=PI/7,format=rgba[bg];"
          f"[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           *plate_input(prod, fps_world),
           "-c:v", "libvpx-vp9", "-i", overlay,
           "-i", mix,
           "-filter_complex", fc, "-map", "[v]", "-map", "2:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
           "-r", str(fps_out), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out]
    subprocess.run(cmd, check=True)
    return out


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height,r_frame_rate",
                        "-of", "json", path], capture_output=True, text=True)
    return json.loads(r.stdout)


if __name__ == "__main__":
    prod = os.path.abspath(sys.argv[1])
    ep = json.load(open(os.path.join(prod, "storyboard.json"), encoding="utf-8"))
    o = composite(prod, ep.get("fps_world", 12), ep.get("fps_out", 60))
    print(json.dumps(probe(o), indent=1))
