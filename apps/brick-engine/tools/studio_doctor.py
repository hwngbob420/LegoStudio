"""LegoStudio health check.  python tools/studio_doctor.py"""
from __future__ import annotations
import json, os, re, shutil, subprocess, sys

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE)
import paths as P
ROOT = P.REPO
sys.path.insert(0, ROOT)
OK, BAD = "[ ok ]", "[FAIL]"
fails = 0


def check(name, cond, hint=""):
    global fails
    print(f"{OK if cond else BAD} {name}" + ("" if cond else f"  -> {hint}"))
    fails += 0 if cond else 1


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return ""


from bootstrap_studio import find_blender  # noqa: E402

b = find_blender()
check("Blender 5.x found", bool(b) and "Blender 5" in run([b, "--version"]), "install Blender 5.2 or set BLENDER")
check("NVIDIA GPU visible", "RTX" in run(["nvidia-smi", "-L"]) or "GTX" in run(["nvidia-smi", "-L"]), "EEVEE still works on any GPU, slower")
enc = run(["ffmpeg", "-hide_banner", "-encoders"])
dec = run(["ffmpeg", "-hide_banner", "-decoders"])
check("FFmpeg libx264 + libvpx-vp9", "libx264" in enc and "libvpx-vp9" in dec, "install a full FFmpeg build")
check("Node + npx", bool(shutil.which("npx") or shutil.which("npx.cmd")), "install Node 20+")
check("Remotion deps installed", os.path.isdir(os.path.join(ROOT, "node_modules", "remotion")), "npm install (o thu muc goc)")
if os.name == "nt":
    v = run(["powershell", "-NoProfile", "-Command", "Add-Type -AssemblyName System.Speech;"
             "(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count"]).strip()
    check("SAPI voices", v.isdigit() and int(v) > 0, "enable Windows speech voices")
tex = P.TEXTURES
check("Face atlases generated", os.path.exists(os.path.join(tex, "atlas_eyes.png")), "python bootstrap_studio.py")
check("HDRIs cached", os.path.isdir(P.HDRI) and len(os.listdir(P.HDRI)) > 0,
      "python bootstrap_studio.py (falls back to flat world colour)")
pal = json.load(open(P.PALETTE))
cat = json.load(open(P.CATALOG, encoding="utf-8"))
rdir = P.CAST
for fn in sorted(os.listdir(rdir)):
    r = json.load(open(os.path.join(rdir, fn), encoding="utf-8"))
    cols = [r["skin"], r["hair"]["color"], r["torso"]["color"], r["arms"], r["hands"], r["hips"], r["legs"]]
    bad = [c for c in cols if c not in pal and not c.startswith("#")]
    check(f"recipe {r['id']} colours valid + in catalog", not bad and r["id"] in cat["cast"], f"bad={bad}")
src = open(os.path.join(P.ENGINE, "sets_library.py"), encoding="utf-8").read()
for sid in cat["sets"]:
    check(f"set {sid} registered in SETS", f'"{sid}": build_' in src, "add builder to SETS")
total, used, free = shutil.disk_usage(ROOT)
check(f"disk free {free / 2**30:.0f} GB (>= 5 GB)", free > 5 * 2**30, "free disk space; renders need ~2 GB per minute temporarily")
print("\nHEALTHY" if not fails else f"\n{fails} problem(s)")
sys.exit(1 if fails else 0)
