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
    total, done = 0, 0
    for line in p.stdout:
        if line.startswith(("[compile]", "[contact]", "[render]", "[manifest]", "[glb]", "Traceback", "  File", "Error")) or "Error" in line:
            print("   ", line.rstrip(), flush=True)
        if line.startswith("[compile]"):
            import re
            m = re.search(r"(\d+) frames", line)
            total = int(m.group(1)) if m else 0
            if "--range" in extra:
                i = list(extra).index("--range")
                total = int(extra[i + 2]) - int(extra[i + 1]) + 1
        if "Saved:" in line and total and mode == "render":
            done += 1
            if done % 6 == 0 or done == total:
                print(f"[progress] {'chunk' if '--range' in extra else 'render'} {done}/{total}", flush=True)
    p.wait()
    if p.returncode != 0:
        raise SystemExit(f"Blender failed ({mode}), exit {p.returncode}")
    dt = time.time() - t
    print(f"    blender {mode}: {dt:.1f}s")
    return dt


def run_script(script):
    """Run any engine Blender script headless (export_manifest.py, export_glb.py, ...)."""
    t = time.time()
    p = subprocess.run([blender_path(), "-b", "--factory-startup", "-P", os.path.join(P.ENGINE, script)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    for line in (p.stdout + p.stderr).splitlines():
        if line.startswith(("[manifest]", "[glb]", "Traceback", "  File")) or "Error" in line:
            print("   ", line, flush=True)
    if p.returncode != 0:
        raise SystemExit(f"Blender script {script} failed, exit {p.returncode}")
    print(f"    blender {script}: {time.time() - t:.1f}s")


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--script" in a:
        run_script(a[a.index("--script") + 1])
    else:
        run(os.path.abspath(a[0]), a[a.index("--mode") + 1] if "--mode" in a else "render", "--fast" in a)
