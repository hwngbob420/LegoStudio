"""One-command production: script.json + episode_shotlist.json -> output_final.mp4

    python engine/produce.py productions/<episode> [--fast] [--force] [--keep-frames] [--from STAGE]

Stages: tts -> lipsync -> props -> contact (QA gate) -> render -> audio -> overlay -> composite -> qa -> clean
The contact gate stops the run when a face collides with UI (override with --force).
"""
from __future__ import annotations
import json, os, shutil, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
sys.path.insert(0, ENGINE)
STAGES = ["tts", "lipsync", "props", "contact", "render", "audio", "overlay", "composite", "qa", "clean"]


def py(script, *args):
    subprocess.run([sys.executable, os.path.join(ENGINE, script), *args], check=True)


def main():
    a = sys.argv[1:]
    prod = os.path.abspath(a[0])
    fast, force, keep = "--fast" in a, "--force" in a, "--keep-frames" in a
    start = STAGES.index(a[a.index("--from") + 1]) if "--from" in a else 0
    import gpu_renderer
    log = {"episode": os.path.basename(prod), "stages": {}}
    lp = os.path.join(prod, "build", "production_log.json")
    if start and os.path.exists(lp):
        log = json.load(open(lp))
    os.makedirs(os.path.join(prod, "build"), exist_ok=True)
    t_all = time.time()
    for st in STAGES[start:]:
        t = time.time()
        print(f"== {st} ==")
        if st == "tts":
            py("tts_sapi.py", prod)
        elif st == "lipsync":
            py("lipsync_2d.py", prod)
        elif st == "props":
            py("remotion_props.py", prod)
        elif st == "contact":
            gpu_renderer.run(prod, "contact", fast)
            r = subprocess.run([sys.executable, os.path.join(ENGINE, "contact_sheet_gen.py"), prod])
            if r.returncode != 0 and not force:
                raise SystemExit("Contact-sheet gate FAILED (face/UI collision). Fix the shotlist or pass --force.")
        elif st == "render":
            log["gpu_render_s"] = round(gpu_renderer.run(prod, "render", fast), 1)
        elif st == "audio":
            py("audio_design.py", prod)
        elif st == "overlay":
            rs = os.path.join(ROOT, "remotion_studio")
            npx = "npx.cmd" if os.name == "nt" else "npx"
            props = os.path.join(prod, "build", "overlay_props.json")
            out = os.path.join(prod, "build", "overlay.webm")
            subprocess.run([npx, "remotion", "render", "src/index.ts", "Overlay", out, f"--props={props}", "--codec=vp9",
                            "--pixel-format=yuva420p", "--image-format=png", "--log=error"], cwd=rs, check=True)
        elif st == "composite":
            import master_compositor as MC
            ep = json.load(open(os.path.join(prod, "episode_shotlist.json"), encoding="utf-8"))
            out = MC.composite(prod, ep.get("fps_world", 12), ep.get("fps_out", 60))
            log["output"] = out
            log["probe"] = MC.probe(out)
        elif st == "qa":
            py("qa_frames.py", prod)
        elif st == "clean":
            if not keep:
                shutil.rmtree(os.path.join(prod, "frames"), ignore_errors=True)
                for f in ("overlay.webm",):
                    p = os.path.join(prod, "build", f)
                    if os.path.exists(p):
                        os.remove(p)
        log["stages"][st] = round(time.time() - t, 1)
        json.dump(log, open(lp, "w"), indent=1)
    log["total_s"] = round(sum(log["stages"].values()), 1)
    json.dump(log, open(lp, "w"), indent=1)
    print(f"\nDONE in {time.time() - t_all:.0f}s -> {os.path.join(prod, 'output_final.mp4')}")
    print(json.dumps(log["stages"], indent=1))


if __name__ == "__main__":
    main()
