"""Host-side texture generator: torso prints, monitor screens, posters (Pillow).

Torso UV: u 0..1 spans the BOTTOM width of the trapezoid front, v 0..1 bottom->top.
The top edge is narrower: at v=1 the printable span is u 0.115..0.885.
No text, no logos: brand-safe decals only.
"""
from __future__ import annotations
import json, math, os, random
from PIL import Image, ImageDraw

import paths as PATHS

OUT = PATHS.TEXTURES
PAL = json.load(open(PATHS.PALETTE, encoding="utf-8"))
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


def _font(px):
    from PIL import ImageFont
    for f in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(f, px)
        except Exception:
            continue
    return ImageFont.load_default(size=px)


def sign(text, bg, fg, w=1024, h=320, border=None, neon=False):
    """Biển hiệu chữ chung chung (CAFE, MART, 24H...). Không tên riêng, không logo."""
    img = Image.new("RGBA", (w, h), hexc(bg))
    d = ImageDraw.Draw(img)
    if border:
        d.rounded_rectangle([14, 14, w - 14, h - 14], 28, outline=hexc(border), width=18)
    f = _font(int(h * 0.56))
    bb = d.textbbox((0, 0), text, font=f)
    x, y = (w - (bb[2] - bb[0])) / 2 - bb[0], (h - (bb[3] - bb[1])) / 2 - bb[1]
    if neon:  # quầng sáng mờ quanh chữ (lớp riêng, làm nhoè rồi chồng lên nền)
        from PIL import ImageFilter
        glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).text((x, y), text, font=f, fill=hexc(fg, 200), stroke_width=10, stroke_fill=hexc(fg, 160))
        img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(18)))
        d = ImageDraw.Draw(img)
        d.text((x, y), text, font=f, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=hexc(fg))
    else:
        d.text((x, y), text, font=f, fill=hexc(fg))
    return img


def whiteboard(w=1024, h=640):
    """Bảng trắng: biểu đồ cột vẽ tay + mũi tên, không chữ."""
    img = Image.new("RGBA", (w, h), (246, 246, 242, 255))
    d = ImageDraw.Draw(img)
    d.line([(90, 540), (940, 540)], fill=INK, width=8)
    d.line([(90, 540), (90, 90)], fill=INK, width=8)
    for k, (hh, c) in enumerate(((160, "blue"), (250, "orange"), (330, "green_bright"), (420, "red"))):
        x = 170 + k * 190
        d.rectangle([x, 540 - hh, x + 110, 536], fill=hexc(c), outline=INK, width=6)
    d.line([(160, 420), (380, 330), (600, 250), (830, 110)], fill=hexc("red"), width=10)
    d.polygon([(830, 110), (790, 120), (815, 150)], fill=hexc("red"))
    return img


def tv_screen(w=1024, h=576):
    """Màn hình TV: cảnh hoạt hình trừu tượng (núi + mặt trời), không chữ."""
    img = Image.new("RGBA", (w, h), hexc("sand_blue"))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, h * 0.6], fill=(120, 190, 240, 255))
    d.ellipse([w * 0.68, h * 0.12, w * 0.84, h * 0.4], fill=hexc("yellow"))
    d.polygon([(0, h * 0.75), (w * 0.3, h * 0.3), (w * 0.55, h * 0.7), (w * 0.75, h * 0.42), (w, h * 0.75), (w, h), (0, h)], fill=hexc("green"))
    return img


def product_shelf(w=1024, h=512, seed=5):
    """Mặt trước kệ hàng: hộp màu xếp hàng, nhãn là sọc màu (không chữ, không logo)."""
    rnd = random.Random(seed)
    img = Image.new("RGBA", (w, h), hexc("light_gray"))
    d = ImageDraw.Draw(img)
    cols = ["red", "blue", "yellow", "green_bright", "orange", "lavender", "coral", "teal_dark", "white", "mustard"]
    for row in range(3):
        y0 = 12 + row * (h // 3)
        x = 10
        while x < w - 40:
            bw = rnd.randint(46, 92)
            bh = rnd.randint(int(h / 3 * 0.55), int(h / 3 * 0.85))
            c = rnd.choice(cols)
            d.rectangle([x, y0 + (h // 3 - 16 - bh), x + bw, y0 + h // 3 - 16], fill=hexc(c), outline=INK, width=3)
            d.rectangle([x + 6, y0 + (h // 3 - 16 - bh) + bh * 0.35, x + bw - 6, y0 + (h // 3 - 16 - bh) + bh * 0.5], fill=hexc("white"))
            x += bw + rnd.randint(4, 10)
        d.rectangle([0, y0 + h // 3 - 16, w, y0 + h // 3 - 4], fill=hexc("dark_gray"))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for fn in sorted(PATHS.cast_recipe_files().values()):
        if fn.endswith(".json"):
            r = json.load(open(fn, encoding="utf-8"))
            t = r["torso"]
            torso_print(t["print"], t["color"], t["print_color"]).save(os.path.join(OUT, f"torso_{r['id']}.png"))
    screen_code().save(os.path.join(OUT, "screen_code.png"))
    screen_chart().save(os.path.join(OUT, "screen_chart.png"))
    poster_brick().save(os.path.join(OUT, "poster_brick.png"))
    menu_board().save(os.path.join(OUT, "menu_board.png"))
    # Gđ 6: biển hiệu chung chung + màn hình của các set mới (không thương hiệu, không tên riêng)
    for fn, args in {
        "sign_cafe.png": ("CAFE", "brown_dark", "cream", "cream"),
        "sign_books.png": ("BOOKS", "teal_dark", "cream", None),
        "sign_bakery.png": ("BAKERY", "cream", "reddish_brown", "reddish_brown"),
        "sign_mart.png": ("MART", "#161A2A", "#7CF0FF", None),
        "sign_24h.png": ("24H", "#161A2A", "#FF6FB5", None),
        "sign_open.png": ("OPEN", "#101010", "#FF5A4E", None),
        "sign_bus7.png": ("7", "blue_dark", "white", "white"),
        "sign_park.png": ("PARK", "green", "cream", "cream"),
    }.items():
        neon = args[1].startswith("#1")
        sign(args[0], args[1], args[2], border=args[3], neon=neon).save(os.path.join(OUT, fn))
    sign("7", "blue_dark", "white", w=320, h=320, border="white").save(os.path.join(OUT, "sign_route7_sq.png"))
    whiteboard().save(os.path.join(OUT, "whiteboard.png"))
    tv_screen().save(os.path.join(OUT, "tv_screen.png"))
    product_shelf().save(os.path.join(OUT, "product_shelf.png"))
    print("textures ->", OUT)


if __name__ == "__main__":
    main()
