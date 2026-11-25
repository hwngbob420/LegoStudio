"""Single-image QA gate: one keyframe per shot + translucent UI safe zones + automatic face/UI collision check.

    python engine/contact_sheet_gen.py <production_dir>

Reads build/contact/contact.json (written by stage_compiler --mode contact), writes:
    contact_sheet.jpg   (the ONE image 04-stopmotion-dop inspects)
    build/qa_report.json  {"pass": bool, "issues": [...]}
Exit code 1 when a head intersects a UI rect (zero-overlap contract) or leaves the frame.
"""
from __future__ import annotations
import json, os, sys
from PIL import Image, ImageDraw, ImageFont


def _font(sz):
    for f in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(f, sz)
        except OSError:
            pass
    return ImageFont.load_default()


def overlap(a, b):
    if not a or not b:
        return 0.0
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return max(0.0, w) * max(0.0, h)


def main(prod):
    rep = json.load(open(os.path.join(prod, "build", "contact", "contact.json"), encoding="utf-8"))
    shots = rep["shots"]
    cols = 3
    tw, th = 640, 360
    pad, head_h = 14, 34
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + head_h + pad) + pad + 40), (18, 20, 26))
    d = ImageDraw.Draw(sheet)
    f_big, f_small = _font(22), _font(15)
    issues = []
    for i, s in enumerate(shots):
        im = Image.open(s["png"]).convert("RGB").resize((tw, th), Image.LANCZOS)
        ov = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        R = lambda r: [r[0] * tw, r[1] * th, r[2] * tw, r[3] * th]
        if s.get("ui_rect"):
            od.rectangle(R(s["ui_rect"]), fill=(80, 170, 255, 70), outline=(80, 170, 255, 255), width=2)
        od.rectangle(R(s["subtitle_band"]), fill=(255, 255, 255, 40), outline=(255, 255, 255, 140), width=1)
        for k in (1 / 3, 2 / 3):  # rule-of-thirds guides
            od.line([k * tw, 0, k * tw, th], fill=(255, 255, 255, 60), width=1)
            od.line([0, k * th, tw, k * th], fill=(255, 255, 255, 60), width=1)
        ok = True
        for aid, bb in s["heads"].items():
            bad = overlap(bb, s.get("ui_rect")) > 0 or overlap(bb, s["subtitle_band"]) > 0.0005
            clipped = bb[0] < 0 or bb[1] < 0 or bb[2] > 1 or bb[3] > 1
            col = (255, 70, 70, 255) if bad else ((255, 190, 60, 255) if clipped else (90, 255, 120, 255))
            od.rectangle(R(bb), outline=col, width=3)
            if bad:
                ok = False
                issues.append({"shot": s["id"], "actor": aid, "type": "face_ui_overlap", "head": bb, "ui": s.get("ui_rect")})
            if clipped and s["subject_zone"] != "center":
                issues.append({"shot": s["id"], "actor": aid, "type": "head_clipped", "head": bb, "severity": "warn"})
        im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
        x = pad + (i % cols) * (tw + pad)
        y = pad + 40 + (i // cols) * (th + head_h + pad)
        sheet.paste(im, (x, y + head_h))
        tag = "PASS" if ok else "FAIL"
        d.text((x, y + 6), f"{s['id']}  f{s['frame']}  subj:{s['subject_zone']}  ui:{s['ui_safe_zone']}", font=f_small, fill=(220, 225, 235))
        d.text((x + tw - 60, y + 4), tag, font=f_big, fill=(90, 255, 120) if ok else (255, 80, 80))
    # time-sampled check: every overlay cue active at a sample time vs every head at that time
    pp = os.path.join(prod, "build", "overlay_props.json")
    cues = json.load(open(pp, encoding="utf-8"))["cues"] if os.path.exists(pp) else []
    for s in shots:
        for smp in s.get("samples", []):
            for c in cues:
                if not (c["t0"] <= smp["t"] <= c["t1"]):
                    continue
                rect = c.get("rect")
                if c["type"] == "arrow":
                    xs, ys = (c["from"][0], c["to"][0]), (c["from"][1], c["to"][1])
                    rect = [min(xs), min(ys), max(xs), max(ys)]
                for aid, bb in smp["heads"].items():
                    if rect and overlap(bb, rect) > 0.0004:
                        issues.append({"shot": s["id"], "actor": aid, "type": "cue_over_face", "cue": c["type"],
                                       "t": smp["t"], "head": [round(v, 3) for v in bb], "rect": rect})
    hard = [x for x in issues if x.get("severity") != "warn"]
    d.text((pad, 10), f"CONTACT SHEET - {os.path.basename(prod)}   shots:{len(shots)}   "
                      f"{'ALL CLEAR' if not hard else str(len(hard)) + ' COLLISION(S)'}", font=f_big,
           fill=(255, 255, 255) if not hard else (255, 90, 90))
    out = os.path.join(prod, "contact_sheet.jpg")
    sheet.save(out, quality=90)
    json.dump({"pass": not hard, "issues": issues}, open(os.path.join(prod, "build", "qa_report.json"), "w"), indent=1)
    print(f"contact sheet -> {out}  pass={not hard}  issues={len(issues)}")
    return 0 if not hard else 1


if __name__ == "__main__":
    sys.exit(main(os.path.abspath(sys.argv[1])))
