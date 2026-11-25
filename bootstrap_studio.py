"""LegoStudio bootstrap: audit the machine, fetch reproducible assets, build generated textures.

    python bootstrap_studio.py                 # core: audit + HDRIs + atlases + textures + Remotion deps
    python bootstrap_studio.py --with-ldraw    # + official LDraw parts library (~45 MB zip) into asset_vault/ldraw
    python bootstrap_studio.py --with-rhubarb  # + Rhubarb Lip Sync 1.13 binary into tools/bin/rhubarb
    python bootstrap_studio.py --audit         # only print the environment report

Everything heavy lands in gitignored folders (asset_vault/, tools/bin/, node_modules/), so a fresh clone is
fully reproducible with this one command. Downloads come only from first-party sources: Poly Haven (CC0),
library.ldraw.org, the official Rhubarb GitHub release, and npm.
"""
from __future__ import annotations
import json, os, platform, shutil, subprocess, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
VAULT = os.path.join(ROOT, "asset_vault")
CFG = os.path.join(ROOT, "studio_config.json")

HDRIS = {  # Poly Haven CC0, 2k
    "studio_small_09_2k.hdr": "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_09_2k.hdr",
    "golden_bay_2k.hdr": "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/golden_bay_2k.hdr",
}
LDRAW_ZIP = "https://library.ldraw.org/library/updates/complete.zip"
RHUBARB_ZIP = "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.13.0/Rhubarb-Lip-Sync-1.13.0-Windows.zip"

BLENDER_CANDIDATES = [
    r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe",
    r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/usr/bin/blender",
]


def sh(cmd, **kw):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=60, **kw).stdout.strip()
    except Exception:
        return ""


def find_blender():
    env = os.environ.get("BLENDER")
    for c in ([env] if env else []) + BLENDER_CANDIDATES + [shutil.which("blender") or ""]:
        if c and os.path.exists(c):
            return c
    return None


def audit():
    blender = find_blender()
    rep = {
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "python": sys.version.split()[0],
        "blender": blender,
        "blender_version": sh([blender, "--version"]).splitlines()[0] if blender else None,
        "gpu": sh(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"]) or "n/a",
        "node": sh(["node", "--version"]) or None,
        "npm": sh(["npm.cmd" if os.name == "nt" else "npm", "--version"]) or None,
        "ffmpeg": (sh(["ffmpeg", "-version"]).splitlines() or [None])[0],
        "git": sh(["git", "--version"]) or None,
        "sapi_voices": None,
    }
    if os.name == "nt":
        rep["sapi_voices"] = sh(["powershell", "-NoProfile", "-Command",
                                 "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer)"
                                 ".GetInstalledVoices() | % { $_.VoiceInfo.Name }"]).splitlines()
    try:
        import numpy, PIL  # noqa
        rep["py_deps"] = "numpy + Pillow OK"
    except ImportError as e:
        rep["py_deps"] = f"MISSING: {e} -> pip install numpy pillow"
    return rep


def fetch(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        print(f"  cached  {os.path.relpath(dst, ROOT)}")
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    print(f"  fetch   {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "LegoStudio-bootstrap/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dst + ".part", "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(dst + ".part", dst)
    return dst


def main():
    args = sys.argv[1:]
    rep = audit()
    print("== LegoStudio environment ==")
    for k, v in rep.items():
        print(f"  {k:<16} {v}")
    if "--audit" in args:
        return
    if not rep["blender"]:
        sys.exit("Blender 5.x not found. Set BLENDER=<path to blender.exe>.")
    json.dump({"blender": rep["blender"]}, open(CFG, "w"), indent=1)
    print("== HDRIs (Poly Haven, CC0) ==")
    for name, url in HDRIS.items():
        try:
            fetch(url, os.path.join(VAULT, "hdri", name))
        except Exception as e:
            print(f"  WARN {name}: {e} (lighting falls back to the preset world colour)")
    if "--with-ldraw" in args:
        print("== LDraw parts library ==")
        z = fetch(LDRAW_ZIP, os.path.join(VAULT, "downloads", "ldraw_complete.zip"))
        if not os.path.isdir(os.path.join(VAULT, "ldraw", "parts")):
            with zipfile.ZipFile(z) as zf:
                zf.extractall(VAULT)  # zip root folder is 'ldraw/'
        print("  ->", os.path.join(VAULT, "ldraw"))
    if "--with-rhubarb" in args:
        print("== Rhubarb Lip Sync ==")
        z = fetch(RHUBARB_ZIP, os.path.join(VAULT, "downloads", "rhubarb.zip"))
        dst = os.path.join(ROOT, "tools", "bin", "rhubarb")
        if not os.path.exists(os.path.join(dst, "rhubarb.exe")):
            with zipfile.ZipFile(z) as zf:
                zf.extractall(os.path.join(ROOT, "tools", "bin"))
            inner = [d for d in os.listdir(os.path.join(ROOT, "tools", "bin")) if d.lower().startswith("rhubarb-lip-sync")]
            if inner:
                os.replace(os.path.join(ROOT, "tools", "bin", inner[0]), dst)
        print("  ->", dst)
    print("== Generated textures ==")
    subprocess.run([sys.executable, os.path.join(ROOT, "vault_config", "face_atlases", "generate_atlases.py")], check=True)
    subprocess.run([sys.executable, os.path.join(ROOT, "engine", "texture_gen.py")], check=True)
    rs = os.path.join(ROOT, "remotion_studio")
    if os.path.exists(os.path.join(rs, "package.json")) and not os.path.isdir(os.path.join(rs, "node_modules")):
        print("== Remotion dependencies (npm ci) ==")
        npm = "npm.cmd" if os.name == "nt" else "npm"
        lock = os.path.exists(os.path.join(rs, "package-lock.json"))
        subprocess.run([npm, "ci" if lock else "install", "--no-audit", "--no-fund"], cwd=rs, check=True)
    print("\nReady. Produce an episode:\n  python engine/produce.py productions/showcase_v1")


if __name__ == "__main__":
    main()
