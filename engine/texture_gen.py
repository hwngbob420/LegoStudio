"""Host-side texture generator: torso prints, monitor screens, posters (Pillow).

Torso UV: u 0..1 spans the BOTTOM width of the trapezoid front, v 0..1 bottom->top.
The top edge is narrower: at v=1 the printable span is u 0.115..0.885.
No text, no logos: brand-safe decals only.
"""
from __future__ import annotations
import json, math, os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "asset_vault", "textures")
PAL = json.load(open(os.path.join(ROOT, "vault_config", "palette.json"), encoding="utf-8"))
S = 1024
SS = 2
N = S * SS


def hexc(name, a=255):
    h = PAL.get(name, name).lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


INK = (25, 22, 24, 255)


def P(u, v):  # u right, v up -> pixels
    return (u * N, (1 - v) * N)


def poly(d, pts, **kw):
    d.polygon([P(*p) for p in pts], **kw)


def ln(d, pts, w=10, fill=INK):
    d.line([P(*p) for p in pts], fill=fill, width=w * SS, joint="curve")


def torso_print(kind, base, accent):
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    a = hexc(accent)
    shade = tuple(max(0, int(c * 0.72)) for c in hexc(base)[:3]) + (255,)
    if kind == "hoodie":
        poly(d, [(0.30, 1.0), (0.5, 0.80), (0.70, 1.0)], fill=shade)                   # hood opening
        ln(d, [(0.5, 0.80), (0.5, 0.0)], 7, fill=shade)                                 # zipper
        for x in (0.43, 0.57):
            ln(d, [(x, 0.92), (x, 0.66)], 6, fill=a)                                     # strings
            d.ellipse([P(x - 0.012, 0.67), P(x + 0.012, 0.64)], fill=a)
        poly(d, [(0.24, 0.30), (0.76, 0.30), (0.70, 0.06), (0.30, 0.06)], fill=shade)    # pocket
        ln(d, [(0.24, 0.30), (0.30, 0.06)], 5, fill=INK)
        ln(d, [(0.76, 0.30), (0.70, 0.06)], 5, fill=INK)
        # tiny bug icon on the chest (developer joke, no text)
        cx, cy = 0.68, 0.62
        d.ellipse([P(cx - 0.04, cy + 0.035), P(cx + 0.04, cy - 0.045)], fill=hexc("lime"))
        for k in (-1, 1):
            for dy in (0.02, -0.005, -0.03):
                ln(d, [(cx + 0.035 * k, cy + dy), (cx + 0.065 * k, cy + dy + 0.01)], 3, fill=hexc("lime"))
    elif kind == "blazer":
        poly(d, [(0.36, 1.0), (0.5, 0.55), (0.64, 1.0)], fill=a)                        # shirt V
        poly(d, [(0.30, 1.0), (0.36, 1.0), (0.5, 0.55), (0.42, 0.40)], fill=shade)        # lapels
        poly(d, [(0.70, 1.0), (0.64, 1.0), (0.5, 0.55), (0.58, 0.40)], fill=shade)
        ln(d, [(0.5, 0.55), (0.5, 0.0)], 4, fill=shade)
        for y in (0.32, 0.18):
            d.ellipse([P(0.47, y + 0.025), P(0.53, y - 0.025)], fill=INK)
        poly(d, [(0.62, 0.70), (0.70, 0.70), (0.69, 0.64), (0.63, 0.64)], fill=hexc("coral"))  # pocket square
    elif kind == "apron":
        poly(d, [(0.30, 0.78), (0.70, 0.78), (0.78, 0.0), (0.22, 0.0)], fill=a)
        ln(d, [(0.30, 0.78), (0.20, 1.0)], 8, fill=a)
        ln(d, [(0.70, 0.78), (0.80, 1.0)], 8, fill=a)
        poly(d, [(0.36, 0.38), (0.64, 0.38), (0.64, 0.18), (0.36, 0.18)], outline=shade, width=6 * SS)
        # coffee bean emblem
        d.ellipse([P(0.45, 0.62), P(0.55, 0.48)], fill=hexc("brown_dark"))
        ln(d, [(0.5, 0.61), (0.48, 0.55), (0.52, 0.49)], 4, fill=a)
    elif kind == "cardigan":
        poly(d, [(0.34, 1.0), (0.5, 0.45), (0.66, 1.0)], fill=a)
        ln(d, [(0.34, 1.0), (0.5, 0.45), (0.66, 1.0)], 6, fill=shade)
        ln(d, [(0.5, 0.45), (0.5, 0.0)], 6, fill=shade)
        for y in (0.36, 0.24, 0.12):
            d.ellipse([P(0.53, y + 0.02), P(0.57, y - 0.02)], fill=hexc("tan"))
        d.ellipse([P(0.40, 0.95), P(0.60, 0.85)], outline=hexc("cream"), width=4 * SS)   # necklace
        for k in range(9):
            t = k / 8
            x = 0.41 + 0.18 * t
            y = 0.86 - 0.05 * math.sin(t * math.pi)
            d.ellipse([P(x - 0.008, y + 0.008), P(x + 0.008, y - 0.008)], fill=hexc("cream"))
    elif kind == "tee_star":
        d.ellipse([P(0.40, 1.03), P(0.60, 0.92)], fill=shade)
        cx, cy, R, r = 0.5, 0.5, 0.17, 0.07
        pts = []
        for k in range(10):
            ang = math.pi / 2 + k * math.pi / 5
            rr = R if k % 2 == 0 else r
            pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
        poly(d, pts, fill=a)
    return img.resize((S, S), Image.LANCZOS)


def screen_code(seed=3, w=1024, h=640):
    """Monitor screen: dark editor with coloured code bars and one red 'bug' line. No readable text."""
    rnd = random.Random(seed)
    img = Image.new("RGBA", (w, h), (24, 28, 38, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 34], fill=(40, 46, 60, 255))
    for i, c in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        d.ellipse([14 + i * 28, 9, 30 + i * 28, 25], fill=c + (255,))
    d.rectangle([0, 34, 150, h], fill=(30, 34, 46, 255))
    for k in range(14):
        d.rounded_rectangle([18, 54 + k * 36, 18 + rnd.randint(50, 110), 66 + k * 36], 5, fill=(90, 100, 120, 255))
    cols = [(198, 120, 221), (97, 175, 239), (152, 195, 121), (229, 192, 123), (224, 108, 117), (171, 178, 191)]
    y = 54
    line_no = 0
    while y < h - 20:
        x = 180 + 26 * rnd.choice((0, 0, 1, 1, 2, 3))
        if line_no == 9:
            d.rectangle([150, y - 6, w, y + 18], fill=(110, 30, 40, 255))
        for _ in range(rnd.randint(1, 4)):
            ww = rnd.randint(30, 150)
            if x + ww > w - 30:
                break
            d.rounded_rectangle([x, y, x + ww, y + 12], 5, fill=rnd.choice(cols) + (255,))
            x += ww + 14
        y += 30
        line_no += 1
    return img


def screen_chart(w=1024, h=640):
    img = Image.new("RGBA", (w, h), (246, 244, 236, 255))
    d = ImageDraw.Draw(img)
    for i, (hh, c) in enumerate(((0.3, "blue"), (0.55, "green_bright"), (0.8, "orange"), (0.45, "red"))):
        x0 = 150 + i * 200
        d.rounded_rectangle([x0, h - 80 - hh * (h - 160), x0 + 130, h - 80], 12, fill=hexc(c))
    d.line([100, h - 80, w - 80, h - 80], fill=INK, width=8)
    return img


def poster_brick(w=600, h=800):
    img = Image.new("RGBA", (w, h), hexc("cream"))
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, w - 24, h - 24], outline=hexc("orange"), width=14)
    # a big stylised brick with plain studs
    d.rounded_rectangle([110, 380, 490, 600], 24, fill=hexc("red"))
    for cx in (200, 300, 400):
        d.rounded_rectangle([cx - 40, 320, cx + 40, 392], 14, fill=hexc("red"))
        d.ellipse([cx - 40, 304, cx + 40, 340], fill=(230, 60, 40, 255))
    d.rounded_rectangle([140, 660, 460, 690], 15, fill=hexc("dark_gray"))
    d.rounded_rectangle([190, 715, 410, 735], 10, fill=hexc("light_gray"))
    return img


def menu_board(w=800, h=500):
    img = Image.new("RGBA", (w, h), (34, 40, 36, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([12, 12, w - 12, h - 12], outline=hexc("wood"), width=16)
    for k, c in enumerate(("cream", "tan", "cream", "tan")):
        y = 90 + k * 90
        d.ellipse([70, y - 24, 118, y + 24], outline=hexc("cream"), width=6)   # cup icon
        d.rounded_rectangle([150, y - 10, 150 + 260 + 60 * (k % 2), y + 10], 10, fill=hexc(c))
        d.rounded_rectangle([w - 190, y - 10, w - 80, y + 10], 10, fill=hexc("orange"))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    rdir = os.path.join(ROOT, "vault_config", "minifig_recipes")
    for fn in sorted(os.listdir(rdir)):
        if fn.endswith(".json"):
            r = json.load(open(os.path.join(rdir, fn), encoding="utf-8"))
            t = r["torso"]
            torso_print(t["print"], t["color"], t["print_color"]).save(os.path.join(OUT, f"torso_{r['id']}.png"))
    screen_code().save(os.path.join(OUT, "screen_code.png"))
    screen_chart().save(os.path.join(OUT, "screen_chart.png"))
    poster_brick().save(os.path.join(OUT, "poster_brick.png"))
    menu_board().save(os.path.join(OUT, "menu_board.png"))
    print("textures ->", OUT)


if __name__ == "__main__":
    main()
