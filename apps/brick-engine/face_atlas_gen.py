"""Generate crisp 2D face atlases (eyes / mouths / per-character detail layers).

Host-side (Pillow). Output PNGs go to workspace/channel_library/baked/textures/ (gitignored, reproducible).
Cell layout is declared in face_atlas_spec.json so Blender, lip-sync and agents agree on indices.

    python apps/brick-engine/face_atlas_gen.py
"""
from __future__ import annotations
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter

import paths as PATHS

OUT = PATHS.TEXTURES
SPEC = json.load(open(PATHS.FACE_SPEC, encoding="utf-8"))

CELL = SPEC["cell_px"]          # final cell size
SS = 3                          # supersampling factor for anti-aliased ink
C = CELL * SS
INK = (22, 18, 20, 255)
WHITE = (255, 255, 255, 255)
MOUTH_IN = (70, 18, 26, 255)
TONGUE = (226, 98, 110, 255)
SWEAT = (110, 190, 255, 255)
BLUSH = (255, 120, 130, 110)
W = int(0.030 * C)              # base ink width


XF = {"ax": 0.5, "ay": 0.5, "s": 1.0}   # per-atlas feature transform (scale about anchor)


def P(x, y):
    s, ax, ay = XF["s"], XF["ax"], XF["ay"]
    return ((ax + (x - ax) * s) * C, (ay + (y - ay) * s) * C)


def set_xf(ax, ay, s):
    global W
    XF.update(ax=ax, ay=ay, s=s)
    W = int(0.030 * C * (s ** 0.75))


def ell(d, cx, cy, rx, ry, **kw):
    d.ellipse([P(cx - rx, cy - ry), P(cx + rx, cy + ry)], **kw)


def arc(d, cx, cy, rx, ry, a0, a1, width=W, fill=INK):
    d.arc([P(cx - rx, cy - ry), P(cx + rx, cy + ry)], a0, a1, fill=fill, width=width)


def line(d, pts, width=W, fill=INK):
    d.line([P(*p) for p in pts], fill=fill, width=width, joint="curve")
    r = width / 2
    for p in (pts[0], pts[-1]):
        x, y = P(*p)
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def bezier(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


EX, EY, ES = 0.335, 0.40, 0.165   # eye centre x (left), y, half-spacing helper
EYES = [(0.5 - ES, EY), (0.5 + ES, EY)]


def brow(d, side, y, tilt, length=0.075, curve=-0.012, width=None):
    cx = EYES[side][0]
    s = -1 if side == 0 else 1
    a = (cx - length * s * -1 * -1, y)
    p0 = (cx - length, y + tilt * s * -1)
    p2 = (cx + length, y - tilt * s * -1)
    p1 = (cx, (p0[1] + p2[1]) / 2 + curve)
    line(d, bezier(p0, p1, p2), width=width or int(W * 1.05))


def dot_eye(d, cx, cy, rx=0.034, ry=0.05, hl=True):
    ell(d, cx, cy, rx, ry, fill=INK)
    if hl:
        ell(d, cx - rx * 0.35, cy - ry * 0.4, rx * 0.32, rx * 0.32, fill=WHITE)


# ------------------------------------------------------------------ eyes
def eyes_innocent(d):
    for i, (x, y) in enumerate(EYES):
        dot_eye(d, x, y)
        brow(d, i, y - 0.105, 0.0, length=0.05, curve=-0.015)


def eyes_deadpan(d):
    for i, (x, y) in enumerate(EYES):
        # half-lidded: flat lid + lower half pupil
        d.pieslice([P(x - 0.042, y - 0.035), P(x + 0.042, y + 0.05)], 0, 180, fill=INK)
        line(d, [(x - 0.06, y + 0.004), (x + 0.06, y + 0.004)], width=int(W * 1.1))
        arc(d, x, y + 0.075, 0.035, 0.016, 20, 160, width=int(W * 0.5))      # eye bag
        line(d, [(x - 0.055, y - 0.075), (x + 0.055, y - 0.072)], width=int(W * 0.95))


def eyes_shocked(d):
    for i, (x, y) in enumerate(EYES):
        ell(d, x, y, 0.07, 0.082, fill=WHITE, outline=INK, width=int(W * 0.95))
        ell(d, x, y + 0.006, 0.016, 0.018, fill=INK)
        brow(d, i, y - 0.15, -0.02, length=0.06, curve=-0.03)


def eyes_smug(d):
    for i, (x, y) in enumerate(EYES):
        s = -1 if i == 0 else 1
        d.pieslice([P(x - 0.045, y - 0.03), P(x + 0.045, y + 0.05)], 0, 180, fill=INK)
        ell(d, x + 0.022, y + 0.018, 0.009, 0.009, fill=WHITE)
        lid = [(x - 0.062, y + 0.012 + 0.006 * s), (x + 0.062, y - 0.004 - 0.006 * s)]
        line(d, lid, width=int(W * 1.1))
    brow(d, 0, EY - 0.085, 0.0, length=0.055, curve=-0.004)
    brow(d, 1, EY - 0.125, -0.012, length=0.055, curve=-0.025)            # raised brow


def eyes_nervous(d):
    for i, (x, y) in enumerate(EYES):
        dot_eye(d, x, y + 0.01, rx=0.024, ry=0.034)
        s = -1 if i == 0 else 1
        p0 = (x - 0.055, y - 0.09 + (0.03 if s < 0 else -0.0))
        p2 = (x + 0.055, y - 0.09 + (0.0 if s < 0 else 0.03))
        line(d, [p0, p2], width=int(W * 0.95))
    # sweat drop on the right temple
    x, y = 0.80, 0.30
    d.polygon([P(x, y - 0.07), P(x - 0.032, y), P(x + 0.032, y)], fill=SWEAT)
    ell(d, x, y + 0.004, 0.034, 0.036, fill=SWEAT)
    ell(d, x - 0.01, y - 0.004, 0.009, 0.012, fill=(235, 250, 255, 255))


def eyes_angry(d):
    for i, (x, y) in enumerate(EYES):
        dot_eye(d, x, y + 0.012, rx=0.03, ry=0.04)
        s = -1 if i == 0 else 1
        inner = x - 0.05 * s
        outer = x + 0.06 * s
        line(d, [(outer, y - 0.11), (inner, y - 0.055)], width=int(W * 1.35))


def eyes_blink(d):
    for i, (x, y) in enumerate(EYES):
        arc(d, x, y - 0.01, 0.045, 0.03, 10, 170, width=int(W * 1.05))
        brow(d, i, y - 0.105, 0.0, length=0.05, curve=-0.015)


def eyes_happy(d):
    for i, (x, y) in enumerate(EYES):
        arc(d, x, y + 0.02, 0.048, 0.05, 195, 345, width=int(W * 1.1))
        brow(d, i, y - 0.11, 0.0, length=0.05, curve=-0.02)


def eyes_side(d):
    for i, (x, y) in enumerate(EYES):
        ell(d, x, y, 0.055, 0.06, fill=WHITE, outline=INK, width=int(W * 0.8))
        ell(d, x + 0.026, y + 0.004, 0.022, 0.03, fill=INK)
        line(d, [(x - 0.055, y - 0.085), (x + 0.055, y - 0.085)], width=int(W * 0.95))


EYE_FUNCS = {
    "innocent_dot": eyes_innocent, "deadpan_tired": eyes_deadpan, "shocked_wide": eyes_shocked,
    "smug_smirk": eyes_smug, "sweating_nervous": eyes_nervous, "angry_brow": eyes_angry,
    "blink": eyes_blink, "happy_closed": eyes_happy, "side_glance": eyes_side,
}

# ------------------------------------------------------------------ mouths
MX, MY = 0.5, 0.70


def mouth_shape(d, w, h, teeth_top=0.0, teeth_bot=0.0, tongue=0.0, dy=0.0, round_=False):
    box = [P(MX - w, MY - h + dy), P(MX + w, MY + h + dy)]
    rad = int(min(box[1][0] - box[0][0], box[1][1] - box[0][1]) * 0.475)
    if round_:
        d.ellipse(box, fill=MOUTH_IN)
    else:
        d.rounded_rectangle(box, radius=rad, fill=MOUTH_IN)
    mask = Image.new("L", (C, C), 0)
    md = ImageDraw.Draw(mask)
    if round_:
        md.ellipse(box, fill=255)
    else:
        md.rounded_rectangle(box, radius=rad, fill=255)
    over = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    od = ImageDraw.Draw(over)
    if teeth_top:
        od.rectangle([P(MX - w, MY - h + dy), P(MX + w, MY - h + dy + teeth_top)], fill=WHITE)
    if teeth_bot:
        od.rectangle([P(MX - w, MY + h + dy - teeth_bot), P(MX + w, MY + h + dy)], fill=WHITE)
    if tongue:
        od.ellipse([P(MX - w * 0.7, MY + h + dy - tongue), P(MX + w * 0.7, MY + h + dy + tongue)], fill=TONGUE)
    return box, mask, over


def finish_mouth(img, d, box, mask, over, round_=False):
    img.paste(over, (0, 0), Image.composite(over, Image.new("RGBA", (C, C)), mask))
    if round_:
        d.ellipse(box, outline=INK, width=W)
    else:
        (x0, y0), (x1, y1) = box
        d.rounded_rectangle(box, radius=int(min(x1 - x0, y1 - y0) * 0.475), outline=INK, width=W)


def m_rest(img, d):
    line(d, bezier((MX - 0.06, MY - 0.005), (MX, MY + 0.03), (MX + 0.06, MY - 0.005)))


def m_A(img, d):
    line(d, [(MX - 0.07, MY), (MX + 0.07, MY)], width=int(W * 1.3))


def m_B(img, d):
    b, m, o = mouth_shape(d, 0.085, 0.036, teeth_top=0.042, teeth_bot=0.036)
    finish_mouth(img, d, b, m, o)


def m_C(img, d):
    b, m, o = mouth_shape(d, 0.085, 0.055, teeth_top=0.04, tongue=0.035)
    finish_mouth(img, d, b, m, o)


def m_D(img, d):
    b, m, o = mouth_shape(d, 0.095, 0.08, teeth_top=0.042, tongue=0.05, dy=0.012)
    finish_mouth(img, d, b, m, o)


def m_E(img, d):
    b, m, o = mouth_shape(d, 0.058, 0.065, tongue=0.03, dy=0.006, round_=True)
    finish_mouth(img, d, b, m, o, round_=True)


def m_F(img, d):
    b, m, o = mouth_shape(d, 0.032, 0.036, round_=True)
    finish_mouth(img, d, b, m, o, round_=True)


def m_G(img, d):
    b, m, o = mouth_shape(d, 0.075, 0.034, teeth_top=0.048)
    finish_mouth(img, d, b, m, o)
    line(d, bezier((MX - 0.06, MY + 0.035), (MX, MY + 0.05), (MX + 0.06, MY + 0.035)), width=int(W * 0.7))


def m_H(img, d):
    b, m, o = mouth_shape(d, 0.08, 0.06, teeth_top=0.032, dy=0.005)
    finish_mouth(img, d, b, m, o)
    ell(d, MX, MY - 0.005, 0.04, 0.03, fill=TONGUE)


def m_smirk(img, d):
    line(d, bezier((MX - 0.07, MY + 0.01), (MX + 0.02, MY + 0.03), (MX + 0.085, MY - 0.035)), width=int(W * 1.1))
    arc(d, MX + 0.095, MY - 0.03, 0.015, 0.02, 270, 90, width=int(W * 0.6))


def m_frown(img, d):
    line(d, bezier((MX - 0.065, MY + 0.025), (MX, MY - 0.03), (MX + 0.065, MY + 0.025)), width=int(W * 1.1))


def m_wavy(img, d):
    pts = [(MX - 0.08 + i * 0.16 / 40, MY + 0.012 * math.sin(i / 40 * math.pi * 4)) for i in range(41)]
    line(d, pts, width=int(W * 1.0))


def m_shockO(img, d):
    b, m, o = mouth_shape(d, 0.06, 0.085, tongue=0.04, dy=0.02, round_=True)
    finish_mouth(img, d, b, m, o, round_=True)


def m_grin(img, d):
    box = [P(MX - 0.10, MY - 0.06), P(MX + 0.10, MY + 0.07)]
    d.pieslice(box, 0, 180, fill=MOUTH_IN)
    d.pieslice([P(MX - 0.10, MY - 0.06), P(MX + 0.10, MY + 0.03)], 0, 180, fill=WHITE)
    d.chord(box, 0, 180, outline=INK, width=W)
    line(d, [(MX - 0.10, MY + 0.005), (MX + 0.10, MY + 0.005)], width=W)


MOUTH_FUNCS = {
    "X": m_rest, "A": m_A, "B": m_B, "C": m_C, "D": m_D, "E": m_E, "F": m_F, "G": m_G, "H": m_H,
    "smirk": m_smirk, "frown": m_frown, "wavy": m_wavy, "shock_O": m_shockO, "grin": m_grin,
}

# ------------------------------------------------------------------ per-character detail layers
def det_blush(d):
    for x in (0.5 - 0.23, 0.5 + 0.23):
        ell(d, x, 0.56, 0.055, 0.03, fill=BLUSH)


def det_freckles(d):
    for x0 in (0.29, 0.71):
        for dx, dy in ((-0.03, 0), (0.0, 0.02), (0.03, -0.005), (0.012, -0.022)):
            ell(d, x0 + dx, 0.53 + dy, 0.007, 0.007, fill=(150, 80, 60, 200))


def det_beard(d):
    col = (30, 22, 20, 235)
    d.chord([P(0.26, 0.48), P(0.74, 0.98)], 0, 180, fill=col)
    d.ellipse([P(0.40, 0.62), P(0.60, 0.76)], fill=(0, 0, 0, 0))
    line(d, bezier((0.38, 0.625), (0.5, 0.585), (0.62, 0.625)), width=int(W * 1.6), fill=col)


def det_wrinkles(d):
    for x in (0.5 - 0.235, 0.5 + 0.235):
        s = 1 if x > 0.5 else -1
        line(d, [(x, 0.37), (x + 0.025 * s, 0.385)], width=int(W * 0.45))
        line(d, [(x, 0.41), (x + 0.028 * s, 0.415)], width=int(W * 0.45))
    arc(d, 0.5, 0.64, 0.14, 0.12, 200, 235, width=int(W * 0.45))
    arc(d, 0.5, 0.64, 0.14, 0.12, 305, 340, width=int(W * 0.45))


def det_lashes(d):
    for i, (x, y) in enumerate(EYES):
        s = -1 if i == 0 else 1
        line(d, [(x + 0.035 * s, y - 0.035), (x + 0.058 * s, y - 0.052)], width=int(W * 0.6))


DETAIL_FUNCS = {"blush": det_blush, "freckles": det_freckles, "beard": det_beard,
                "wrinkles": det_wrinkles, "lashes": det_lashes}


def render_cell(fn, needs_img=False):
    img = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if needs_img:
        fn(img, d)
    else:
        fn(d)
    return img.resize((CELL, CELL), Image.LANCZOS)


def build_atlas(names, funcs, needs_img=False, xf=(0.5, 0.5, 1.0)):
    set_xf(*xf)
    cols, rows = SPEC["grid"]
    atlas = Image.new("RGBA", (CELL * cols, CELL * rows), (0, 0, 0, 0))
    for i, n in enumerate(names):
        cell = render_cell(funcs[n], needs_img)
        atlas.paste(cell, ((i % cols) * CELL, (i // cols) * CELL))
    return atlas


def main():
    os.makedirs(OUT, exist_ok=True)
    build_atlas(SPEC["eyes"], EYE_FUNCS, xf=(0.5, 0.40, 1.3)).save(os.path.join(OUT, "atlas_eyes.png"))
    build_atlas(SPEC["mouths"], MOUTH_FUNCS, needs_img=True, xf=(0.5, 0.70, 2.0)).save(os.path.join(OUT, "atlas_mouths.png"))
    # detail layers: one PNG per combination used by recipes
    for fn in sorted(PATHS.cast_recipe_files().values()):
        if not fn.endswith(".json"):
            continue
        r = json.load(open(fn, encoding="utf-8"))
        img = Image.new("RGBA", (C, C), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        set_xf(0.5, 0.40, 1.3)
        for name in r.get("face_details", []):
            DETAIL_FUNCS[name](d)
        img.resize((CELL, CELL), Image.LANCZOS).save(os.path.join(OUT, f"detail_{r['id']}.png"))
    # preview sheet for humans / agents (single image)
    prev = Image.new("RGBA", (CELL * 4, CELL * 4 * 2), (250, 205, 60, 255))
    for k, a in enumerate(("atlas_eyes.png", "atlas_mouths.png")):
        im = Image.open(os.path.join(OUT, a)).resize((CELL * 4, CELL * 4))
        prev.alpha_composite(im, (0, CELL * 4 * k))
    prev.convert("RGB").resize((CELL * 2, CELL * 4)).save(os.path.join(OUT, "atlas_preview.jpg"), quality=88)
    print("atlases ->", OUT)


if __name__ == "__main__":
    main()
