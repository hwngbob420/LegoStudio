"""Shotlist + timing -> resolved Remotion props (absolute seconds, pixel-free normalised rects).

    python apps/brick-engine/remotion_props.py <production_dir>   -> build/overlay_props.json
"""
from __future__ import annotations
import json, os, sys

ENGINE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ENGINE)
import paths as P
from timeref import Timeline

UI_ZONES = {
    "left_third": [0.035, 0.10, 0.365, 0.76], "right_third": [0.635, 0.10, 0.965, 0.76],
    "top_left": [0.035, 0.06, 0.40, 0.24], "top_right": [0.60, 0.06, 0.965, 0.24],
    "top_center": [0.32, 0.05, 0.68, 0.22], "upper": [0.06, 0.06, 0.94, 0.30],
}


def apply_locale(prod, props, lang):
    """Swap subtitle text + card text for a translated locale. Word timings are spread evenly over each line."""
    f = os.path.join(prod, "locales", f"{lang}.json")
    if not lang or not os.path.exists(f):
        return props
    loc = json.load(open(f, encoding="utf-8"))
    for s in props["subtitles"]:
        text = loc.get("lines", {}).get(s["id"])
        if not text:
            continue
        toks = text.split()
        dur = max(0.2, s["end"] - s["start"])
        s["words"] = [{"t": round(s["start"] + dur * i / len(toks), 3), "text": w} for i, w in enumerate(toks)]
    for c, o in zip(props["cues"], loc.get("cues", [])):
        for k in ("title", "label", "note"):
            if o.get(k) and k in c:
                c[k] = o[k]
    props["lang"] = lang
    return props


def build(prod, lang=None):
    ep = json.load(open(os.path.join(prod, "storyboard.json"), encoding="utf-8"))
    timing = json.load(open(os.path.join(prod, "build", "timing.json"), encoding="utf-8"))
    tl = Timeline(timing)
    tl.resolve_shots(ep["shots"])
    duration = ep["shots"][-1]["_t1"]
    cues = []
    for c in ep.get("ui", []):
        r = dict(c)
        r["t0"], r["t1"] = tl.t(c["t0"]), tl.t(c["t1"])
        if "zone" in c:
            r["rect"] = UI_ZONES[c["zone"]]
        for b in r.get("bars", []):
            b["t"] = tl.t(b["t"])
            if "collapse_t" in b:
                b["collapse_t"] = tl.t(b["collapse_t"])
        cues.append(r)
    colors = ep.get("subtitles", {}).get("speaker_colors", {})
    names = {}
    for c in ep["cast"]:
        rp = P.cast_recipe_files()[c["id"]]
        names[c["id"]] = json.load(open(rp, encoding="utf-8"))["name"]
    subs = []
    for lid, L in timing["lines"].items():
        tokens = L["text"].split()   # keep punctuation from the script when counts line up
        words = [{"t": w[0], "text": (tokens[i] if len(tokens) == len(L["words"]) else w[1])} for i, w in enumerate(L["words"])]
        subs.append({"id": lid, "speaker": names.get(L["speaker"], L["speaker"]), "color": colors.get(L["speaker"], "#FFFFFF"),
                     "start": L["start"], "end": L["end"], "words": words})
    props = {"fps": ep.get("fps_out", 60), "duration": duration, "width": ep["resolution"][0], "height": ep["resolution"][1],
             "cues": cues, "subtitles": subs, "shots": [{"id": s["id"], "t0": s["_t0"], "t1": s["_t1"]} for s in ep["shots"]]}
    props = apply_locale(prod, props, lang)
    out = os.path.join(prod, "build", "overlay_props.json")
    json.dump(props, open(out, "w"), indent=1)
    print("props ->", out, f"({len(cues)} cues, {len(subs)} subtitle lines, {duration:.2f}s)")
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    build(os.path.abspath(a[0]), a[a.index("--lang") + 1] if "--lang" in a else None)
