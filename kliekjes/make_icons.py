"""Generate the Kliekjes app icons. Run once: python3 make_icons.py"""
from PIL import Image, ImageDraw

DEEP = (15, 34, 48)
RAISED = (29, 62, 81)
FROST = (230, 240, 245)
WARM = (242, 181, 68)

S = 1024


def mark(draw, cx, cy, scale):
    """A stacked food container: lid, body, and a frozen highlight."""
    w = 380 * scale
    h = 250 * scale
    lid_h = 62 * scale
    r = 26 * scale

    # lid
    draw.rounded_rectangle(
        [cx - w / 2 - 26 * scale, cy - h / 2 - lid_h,
         cx + w / 2 + 26 * scale, cy - h / 2 + 6 * scale],
        radius=r, fill=FROST)

    # tapered body
    top_l, top_r = cx - w / 2, cx + w / 2
    bot_l, bot_r = cx - w / 2 + 46 * scale, cx + w / 2 - 46 * scale
    bot_y = cy + h / 2
    draw.polygon([(top_l, cy - h / 2 + 10 * scale), (top_r, cy - h / 2 + 10 * scale),
                  (bot_r, bot_y), (bot_l, bot_y)], fill=FROST)
    draw.rounded_rectangle([bot_l - 4 * scale, bot_y - r, bot_r + 4 * scale, bot_y],
                           radius=r * 0.7, fill=FROST)

    # contents peeking through, warm against the cold shell
    draw.rounded_rectangle(
        [cx - w / 2 + 76 * scale, cy - h / 2 + 76 * scale,
         cx + w / 2 - 76 * scale, cy - h / 2 + 150 * scale],
        radius=22 * scale, fill=WARM)


def build(size, maskable=False):
    img = Image.new("RGB", (S, S), DEEP)
    d = ImageDraw.Draw(img)

    if not maskable:
        d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=RAISED)
        d.rounded_rectangle([int(S * 0.012), int(S * 0.012), S - int(S * 0.012), S - int(S * 0.012)],
                            radius=int(S * 0.21), fill=DEEP)

    mark(d, S / 2, S / 2 + (10 if maskable else 16), 0.78 if maskable else 1.0)
    return img.resize((size, size), Image.LANCZOS)


build(192).save("public/img/icon-192.png")
build(512).save("public/img/icon-512.png")
build(512, maskable=True).save("public/img/icon-maskable.png")
print("icons written")
