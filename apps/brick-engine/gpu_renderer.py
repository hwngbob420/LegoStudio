"""Headless Blender launcher (0 API tokens): compile + render on the GPU with EEVEE.

    python apps/brick-engine/gpu_renderer.py <production_dir> [--mode render|contact|blend] [--fast]
"""
from __future__ import annotations
import json, os, subprocess, sys, time

import paths as P


def blender_path():
    cfg = P.STUDIO_CONFIG
    if os.path.exists(cfg):
        p = json.load(open(cfg)).get("blender")
        if p and os.path.exists(p):
            return p
    for p in (os.environ.get("BLENDER", ""), r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"):
        if p and os.path.exists(p):
            return p
    raise SystemExit("Blender not found: run `python bootstrap_studio.py` or set BLENDER")


def run(prod, mode="render", fast=False, extra=()):
    cmd = [blender_path(), "-b", "--factory-startup", "-P", os.path.join(P.ENGINE, "stage_compiler.py"), "--",
           prod, "--mode", mode] + (["--fast"] if fast else []) + list(extra)
    t = time.time()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    last = ""
    for line in p.stdout:
        if line.startswith(("[compile]", "[contact]", "[render]", "Traceback", "  File", "Error")) or "Error" in line:
            print("   ", line.rstrip())
        if "Fra:" in line or "Saved:" in line:
            last = line
    p.wait()
    if p.returncode != 0:
        raise SystemExit(f"Blender failed ({mode}), exit {p.returncode}")
    dt = time.time() - t
    print(f"    blender {mode}: {dt:.1f}s")
    return dt


if __name__ == "__main__":
    a = sys.argv[1:]
    run(os.path.abspath(a[0]), a[a.index("--mode") + 1] if "--mode" in a else "render", "--fast" in a)
