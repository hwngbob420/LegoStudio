"""Long-form render in chunks (like pixel-story-engine's chunkRenderer, adapted to the Blender plate).

    python apps/brick-engine/chunk_renderer.py <production_dir> [--chunk-sec 120] [--redo N] [--fast]

* Splits the baked timeline into chunks (default 120 s of story = 1440 world frames at 12 fps).
* Per chunk: Blender renders PNG frames (skipping frames that already exist -> resumes after a crash),
  then FFmpeg packs them into chunks/part_XX.mp4 (12 fps, near-lossless) and deletes the PNGs (keeps disk use small).
* Chunk state lives in project.json ("chunks"), keyed by the baked timeline hash: a changed storyboard invalidates
  the chunks; an unchanged one resumes where it stopped. --redo N re-renders only chunk N.
* master_compositor.py concatenates the parts with `-c copy`, then overlays + muxes the single audio mix.
"""
import glob, hashlib, json, os, shutil, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paths as P  # noqa: E402
import gpu_renderer  # noqa: E402
import block_render as BR  # noqa: E402


def timeline_hash(prod):
    return hashlib.sha256(open(os.path.join(prod, "build", "baked_timeline.json"), "rb").read()).hexdigest()[:16]


def load_project(prod):
    p = os.path.join(prod, "project.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    name = os.path.basename(prod)
    return {"id": name, "title": name, "created": "1970-01-01T00:00:00Z", "language": "vi",
            "settings": {"quality": "final", "chunk_sec": 120}, "stages": {}, "chunks": []}


def save_project(prod, proj):
    p = os.path.join(prod, "project.json")
    tmp = p + ".tmp"
    json.dump(proj, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    os.replace(tmp, p)


def plan_chunks(frames, fps, chunk_sec):
    n = max(1, int(round(chunk_sec * fps)))
    return [{"index": i, "f0": f0, "f1": min(frames, f0 + n - 1), "status": "pending"} for i, f0 in enumerate(range(1, frames + 1, n))]


def pack(prod, c, fps):
    """PNG frames of one chunk -> chunks/part_XX.mp4 (or chunks/blk_<key>.mp4 in block mode), then delete the PNGs."""
    fdir = os.path.join(prod, "frames", f"c{c['index']:02d}")
    os.makedirs(os.path.join(prod, "chunks"), exist_ok=True)
    out = os.path.join(prod, c["file"]) if c.get("key") else os.path.join(prod, "chunks", f"part_{c['index']:02d}.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-start_number", str(c["f0"]),
                    "-i", os.path.join(fdir, "f_%04d.png"), "-frames:v", str(c["f1"] - c["f0"] + 1),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-r", str(fps), out + ".part.mp4"], check=True)
    os.replace(out + ".part.mp4", out)   # ghi xong mới đổi tên: tắt giữa chừng không để lại file hỏng bị tưởng là xong
    shutil.rmtree(fdir, ignore_errors=True)
    return out


def main():
    a = sys.argv[1:]
    prod = os.path.abspath(a[0])
    fast = "--fast" in a
    T = json.load(open(os.path.join(prod, "build", "baked_timeline.json"), encoding="utf-8"))
    frames, fps = T["frames"], T["fps"]
    proj = load_project(prod)
    chunk_sec = float(a[a.index("--chunk-sec") + 1]) if "--chunk-sec" in a else float(proj.get("settings", {}).get("chunk_sec", 120))
    h = timeline_hash(prod)
    blocks = BR.blocks_of(T, chunk_sec)
    if blocks:
        # 5D: một chặng = một block ~2 phút, tên file theo khoá nội dung -> block không đổi thì dùng lại (dù đã trượt khung)
        chunks = [{"index": i, "id": b["id"], "f0": b["f0"], "f1": b["f1"], "key": BR.plate_key(b, fast),
                   "file": f"chunks/blk_{BR.plate_key(b, fast)}.mp4"} for i, b in enumerate(blocks)]
        for c in chunks:
            c["status"] = "done" if os.path.exists(os.path.join(prod, c["file"])) else "pending"
        if "--redo" in a:
            k = a[a.index("--redo") + 1]
            for c in chunks:
                if str(c["index"]) == k or c["id"] == k:
                    c["status"] = "pending"
        keep = {os.path.normcase(os.path.join(prod, c["file"])) for c in chunks}
        for f in glob.glob(os.path.join(prod, "chunks", "*.mp4")):
            if os.path.normcase(f) not in keep:
                os.remove(f)   # block cũ không còn dùng (hoặc chặng kiểu cũ)
        proj["chunks"], proj["timeline_hash"], proj["chunk_mode"] = chunks, h, "blocks"
    else:
        planned = plan_chunks(frames, fps, chunk_sec)
        same = proj.get("chunk_mode") != "blocks" and proj.get("timeline_hash") == h and [(c["f0"], c["f1"]) for c in proj.get("chunks", [])] == [(c["f0"], c["f1"]) for c in planned]
        if not same:
            proj["chunks"] = planned
            proj["timeline_hash"] = h
            proj["chunk_mode"] = "fixed"
            shutil.rmtree(os.path.join(prod, "chunks"), ignore_errors=True)
        if "--redo" in a:
            k = int(a[a.index("--redo") + 1])
            proj["chunks"][k]["status"] = "pending"
    save_project(prod, proj)
    chunks = proj["chunks"]
    t0 = time.time()
    todo = sum(1 for c in chunks if c["status"] != "done")
    print(f"[render] {len(chunks)} chunk(s), {todo} to render", flush=True)
    for c in chunks:
        part = os.path.join(prod, c["file"]) if c.get("key") else os.path.join(prod, "chunks", f"part_{c['index']:02d}.mp4")
        if c["status"] == "done" and os.path.exists(part):
            print(f"    chunk {c.get('id', c['index'])}: unchanged, skip", flush=True)
            continue
        print(f"[progress] render {c['index']}/{len(chunks)}", flush=True)
        out = os.path.join(prod, "frames", f"c{c['index']:02d}")
        if c.get("key"):
            # khung dở dang thuộc block khác (block đã đổi hoặc trượt): bỏ, tránh trộn khung cũ vào block mới
            mark = os.path.join(out, "_key.txt")
            if os.path.isdir(out) and (not os.path.exists(mark) or open(mark).read().strip() != c["key"]):
                shutil.rmtree(out, ignore_errors=True)
            os.makedirs(out, exist_ok=True)
            open(mark, "w").write(c["key"])
        if os.path.isdir(out):
            done = sorted(f for f in os.listdir(out) if f.endswith(".png"))
            if done:  # the newest frame may be half-written if the app was closed mid-frame: redo it
                os.remove(os.path.join(out, done[-1]))
                print(f"    chunk {c['index']}: resuming, {len(done) - 1} frame(s) already rendered", flush=True)
        gpu_renderer.run(prod, "render", fast, extra=("--range", str(c["f0"]), str(c["f1"]), "--out", out))
        tmpfile = c["file"] if c.get("key") else None
        c["file"] = os.path.relpath(pack(prod, c, fps), prod).replace(os.sep, "/")
        assert not tmpfile or c["file"] == tmpfile
        c["status"] = "done"
        save_project(prod, proj)
        print(f"    chunk {c['index']} frames {c['f0']}-{c['f1']} -> {c['file']}", flush=True)
    print(f"[progress] render {len(chunks)}/{len(chunks)}", flush=True)
    dt = time.time() - t0
    json.dump({"frames": frames, "chunks": len(chunks), "seconds": round(dt, 1), "s_per_frame": round(dt / max(1, frames), 2)},
              open(os.path.join(prod, "build", "render_stats.json"), "w"))
    print(f"[render] {frames} frames in {len(chunks)} chunk(s), {dt:.1f}s")


if __name__ == "__main__":
    main()
