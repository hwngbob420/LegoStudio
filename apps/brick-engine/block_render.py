"""Block ~2 phút (5D): render bản cuối theo block, lưu theo mã băm, chỉ làm lại block đã đổi.

Bộ đạo diễn ghi `blocks: [{id, f0, f1, hash}]` vào baked_timeline.json. `hash` là mã băm nội dung lát timeline của block
(đã dời về khung 1, không phụ thuộc block khác). Ở đây cộng thêm "muối" render (mã nguồn Blender, kho, chất lượng)
để đổi vật liệu/ánh sáng cũng render lại. Cùng khoá = cùng hình -> dùng lại file cũ, kể cả khi block đã trượt khung
vì block trước dài/ngắn đi.

Tệp:
  chunks/blk_<khoá>.mp4          nền 3D Blender của block (12 hình/giây)
  build/overlay/ov_<khoá>.webm   lớp chữ Remotion của block (60 hình/giây, kênh alpha)
  build/blocks/<id>_<khoá>.mp4   block hoàn chỉnh (nền + chữ + tiếng) để xem và duyệt
  build/block_outputs.json       danh sách block hoàn chỉnh theo thứ tự (Studio đọc)
"""
from __future__ import annotations
import glob, hashlib, json, os, subprocess

import paths as P

RENDER_SOURCES = ["stage_compiler.py", "gpu_renderer.py", "look_dev.py", "brick_builder.py", "minifig_builder.py",
                  "sets_library.py", "fx_library.py", "acting_library.py", "texture_gen.py", "face_atlas_gen.py"]


def _sha(parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else str(p).encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()[:16]


def _files(paths_):
    out = []
    for f in sorted(paths_):
        if os.path.isfile(f):
            out += [os.path.relpath(f, P.REPO).replace(os.sep, "/"), open(f, "rb").read()]
    return out


def render_salt(fast: bool) -> str:
    """Muối cho nền 3D: mã render Blender + kho kênh ảnh hưởng tới hình + chất lượng."""
    files = [os.path.join(P.ENGINE, f) for f in RENDER_SOURCES] + [P.MANIFEST, P.PALETTE, P.FACE_SPEC]
    files += glob.glob(os.path.join(P.LIGHTING, "*.json")) + glob.glob(os.path.join(P.CAST, "*.json"))
    files += glob.glob(os.path.join(P.PROJECTS, "*", "assets", "cast", "*.json"))
    return _sha(["plate-v1", "fast" if fast else "final", *_files(files)])


def overlay_salt() -> str:
    """Muối cho lớp chữ: mã nguồn composition Overlay + thành phần."""
    src = os.path.join(P.VIDEO_ENGINE, "src")
    files = [os.path.join(src, f) for f in ("Overlay.tsx", "Root.tsx", "theme.ts", "index.ts")] + glob.glob(os.path.join(src, "components", "*.tsx"))
    return _sha(["overlay-v1", *_files(files)])


def blocks_of(T, chunk_sec=120.0):
    """Block của timeline, hoặc None nếu dùng cách chia chặng cũ (tập cũ một block quá dài)."""
    bl = T.get("blocks") or []
    if not bl:
        return None
    if len(bl) == 1 and (bl[0]["f1"] - bl[0]["f0"] + 1) > chunk_sec * T["fps"] * 1.6:
        return None
    return bl


def plate_key(block, fast):
    return _sha([block["hash"], render_salt(fast)])


# ---------------------------------------------------------------- lớp chữ theo block
def slice_overlay(props, t0, t1):
    """Bản Python của sliceOverlay (packages/director/src/overlay.ts): giữ phần giao [t0, t1), dời mốc về 0."""
    r = lambda x: round(x - t0, 5)  # noqa: E731
    hit = lambda a, b: b > t0 + 1e-9 and a < t1 - 1e-9  # noqa: E731
    cues = []
    for c in props["cues"]:
        if not hit(c["t0"], c["t1"]):
            continue
        o = dict(c, t0=max(0.0, r(c["t0"])), t1=min(t1 - t0, r(c["t1"])))
        if isinstance(c.get("bars"), list):
            o["bars"] = [dict(b, t=r(b["t"]), **({"collapse_t": r(b["collapse_t"])} if "collapse_t" in b else {})) for b in c["bars"]]
        cues.append(o)
    subs = [dict(s, start=r(s["start"]), end=r(s["end"]), words=[dict(w, t=r(w["t"])) for w in s["words"]])
            for s in props["subtitles"] if hit(s["start"], s["end"])]
    shots = [dict(s, t0=max(0.0, r(s["t0"])), t1=min(t1 - t0, r(s["t1"]))) for s in props["shots"] if hit(s["t0"], s["t1"])]
    return dict(props, duration=round(t1 - t0, 5), cues=cues, subtitles=subs, shots=shots)


def overlay_key(sliced):
    """Mã băm lớp chữ của block: bỏ ID cảnh (đổi khi block khác thêm/bớt cảnh) và ID câu."""
    norm = dict(sliced, shots=[{k: v for k, v in s.items() if k != "id"} for s in sliced["shots"]],
                subtitles=[{k: v for k, v in s.items() if k != "id"} for s in sliced["subtitles"]])
    return _sha([json.dumps(norm, sort_keys=True, ensure_ascii=False), overlay_salt()])


def render_overlays(prod, blocks, fps_world, log=print, lang=None):
    """Render lớp chữ từng block (bỏ qua block đã có cùng khoá). Trả {block_id: đường dẫn webm}.
    Bản phụ đề ngôn ngữ khác (lang) dùng thư mục riêng, không xoá bộ đệm của bản chính."""
    props = json.load(open(os.path.join(prod, "build", "overlay_props.json"), encoding="utf-8"))
    odir = os.path.join(prod, "build", f"overlay_{lang}" if lang else "overlay")
    os.makedirs(odir, exist_ok=True)
    npx = "npx.cmd" if os.name == "nt" else "npx"
    out, keep = {}, set()
    for i, b in enumerate(blocks):
        t0, t1 = (b["f0"] - 1) / fps_world, b["f1"] / fps_world
        sl = slice_overlay(props, t0, t1)
        key = overlay_key(sl)
        f = os.path.join(odir, f"ov_{key}.webm")
        keep.add(f)
        out[b["id"]] = f
        if os.path.exists(f):
            log(f"    overlay {b['id']}: unchanged, skip")
            continue
        log(f"[progress] overlay {i}/{len(blocks)}")
        pf = os.path.join(odir, f"props_{key}.json")
        json.dump(sl, open(pf, "w", encoding="utf-8"), ensure_ascii=False)
        tmp = f + ".part.webm"
        subprocess.run([npx, "remotion", "render", "src/index.ts", "Overlay", tmp, f"--props={pf}", "--codec=vp9",
                        "--pixel-format=yuva420p", "--image-format=png", "--log=error"], cwd=P.VIDEO_ENGINE, check=True)
        os.replace(tmp, f)
        os.remove(pf)
    for f in glob.glob(os.path.join(odir, "ov_*.webm")):
        if f not in keep:
            os.remove(f)
    log(f"[progress] overlay {len(blocks)}/{len(blocks)}")
    return out


# ---------------------------------------------------------------- ghép theo block
def composite_blocks(prod, blocks, plates, overlays, fps_world=12, fps_out=60, crf=17, out_name="output_final.mp4", log=print, lang=None):
    """Mỗi block: nền + chữ -> build/blocks/v_<khoá>.mp4 (chỉ hình, lưu theo khoá, không phụ thuộc tiếng nên block khác
    đổi độ dài không làm block này phải ghép lại). Rồi gắn đoạn tiếng tương ứng -> build/blocks/<id>.mp4 để xem riêng (nhanh,
    chép hình). Bản cuối: nối hình các block (-c copy, cùng thông số mã hoá) + MỘT bản trộn tiếng cả tập (nhạc liền mạch)."""
    mix = os.path.join(prod, "build", "mix.wav")
    bdir = os.path.join(prod, "build", f"blocks_{lang}" if lang else "blocks")
    os.makedirs(bdir, exist_ok=True)
    # tpad nhân bản hình cuối vài khung rồi -frames:v cắt đúng số hình: mỗi block đúng (khung thế giới x 5) hình, không hụt
    # một hình ở cuối (hụt sẽ cộng dồn thành lệch khẩu hình ở các block sau)
    fc = (f"[0:v]fps={fps_out},tpad=stop_mode=clone:stop=10,noise=alls=3:allf=t,vignette=angle=PI/7,format=rgba[bg];"
          f"[1:v]format=rgba,tpad=stop_mode=clone:stop=10[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]")
    files, listing, keep = [], [], set()
    for i, b in enumerate(blocks):
        t0, dur = (b["f0"] - 1) / fps_world, (b["f1"] - b["f0"] + 1) / fps_world
        key = _sha(["comp-v2", os.path.basename(plates[b["id"]]), os.path.basename(overlays[b["id"]]), crf, fps_out])
        v = os.path.join(bdir, f"v_{key}.mp4")
        keep.add(v)
        if not os.path.exists(v):
            log(f"[progress] composite {i}/{len(blocks)}")
            tmp = v + ".part.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", plates[b["id"]], "-c:v", "libvpx-vp9", "-i", overlays[b["id"]],
                            "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-profile:v", "high",
                            "-pix_fmt", "yuv420p", "-r", str(fps_out), "-frames:v", str((b["f1"] - b["f0"] + 1) * fps_out // fps_world), "-movflags", "+faststart", tmp], check=True)
            os.replace(tmp, v)
        else:
            log(f"    block {b['id']}: unchanged, skip")
        # bản xem riêng của block: chép hình + đoạn tiếng của block
        f = os.path.join(bdir, f"{b['id']}.mp4")
        keep.add(f)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v, "-ss", f"{t0:.5f}", "-t", f"{dur:.5f}", "-i", mix,
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", f], check=True)
        files.append({"id": b["id"], "t0": round(t0, 3), "t1": round(t0 + dur, 3), "file": os.path.relpath(f, prod).replace(os.sep, "/"),
                      "key": key, "hash": b["hash"]})
        listing.append(v)
    for f in glob.glob(os.path.join(bdir, "*.mp4")):
        if f not in keep:
            os.remove(f)
    json.dump(files, open(os.path.join(prod, "build", f"block_outputs_{lang}.json" if lang else "block_outputs.json"), "w", encoding="utf-8"), indent=1)
    lst = os.path.join(bdir, "concat.txt")
    open(lst, "w", encoding="utf-8").write("".join(f"file '{os.path.basename(f)}'" + chr(10) for f in listing))
    out = os.path.join(prod, out_name)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", mix,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out], check=True)
    log(f"[progress] composite {len(blocks)}/{len(blocks)}")
    return out
