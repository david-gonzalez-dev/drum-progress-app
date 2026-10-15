#!/usr/bin/env python3
"""Frames plain iPhone screenshots into App Store screenshots: dark background, a short caption on top, the phone screen with rounded corners below.
Put your screenshots in  raw/  named  1-home.png  2-practice.png  3-metronome.png  4-progress.png  5-leaderboard.png  6-challenges.png  (any iPhone size),
run  python3 make_screenshots.py  and take the results from  out/6.9-inch/  and  out/6.5-inch/ ."""
import os, glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = "/Users/david/Documents/AI Projects/Drum Progress Promo/fonts"   # Barlow Condensed (titles), as used by the other App Store graphics
CAPTIONS = {   # one short line each, no more than 5 words
    "1-home": "Log every practice",
    "2-practice": "Climb the tempo ladder",
    "3-metronome": "Practise with the metronome",
    "4-progress": "See your progress grow",
    "5-leaderboard": "Compete with drummers worldwide",
    "6-challenges": "Take on daily challenges",
}
SIZES = {"6.9-inch": (1290, 2796), "6.5-inch": (1284, 2778)}
ORANGE, CREAM = (255, 107, 26), (246, 230, 214)

def background(w, h):
    img = Image.new("RGB", (w, h), (10, 10, 10))
    glow = Image.new("RGB", (w, h), (10, 10, 10))
    d = ImageDraw.Draw(glow)
    d.ellipse((w * 0.1, -h * 0.25, w * 1.2, h * 0.28), fill=(70, 30, 10))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.12))
    return Image.blend(img, glow, 0.9)

def fit_caption(draw, text, w):
    size = 150
    while size > 70:
        font = ImageFont.truetype(os.path.join(FONTS, "BarlowCondensed-ExtraBold.ttf"), size)
        if draw.textlength(text.upper(), font=font) <= w * 0.88: return font
        size -= 6
    return font

def frame(shot_path, caption, size):
    w, h = size
    canvas = background(w, h)
    d = ImageDraw.Draw(canvas)
    font = fit_caption(d, caption, w)
    text = caption.upper()
    d.text((w / 2, h * 0.075), text, font=font, fill=CREAM, anchor="mm")
    d.rectangle((w / 2 - 90, h * 0.075 + font.size * 0.62, w / 2 + 90, h * 0.075 + font.size * 0.62 + 10), fill=ORANGE)
    shot = Image.open(shot_path).convert("RGB")
    pw = int(w * 0.84)
    ph = int(shot.height * pw / shot.width)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    radius = int(pw * 0.085)
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=radius, fill=255)
    x, y = (w - pw) // 2, int(h * 0.17)
    # soft edge + shadow so the screen sits on the background
    border = Image.new("RGB", (pw + 12, ph + 12), (60, 60, 60))
    bmask = Image.new("L", border.size, 0)
    ImageDraw.Draw(bmask).rounded_rectangle((0, 0, border.size[0], border.size[1]), radius=radius + 6, fill=255)
    canvas.paste(border, (x - 6, y - 6), bmask)
    canvas.paste(shot, (x, y), mask)
    return canvas.crop((0, 0, w, h))

def main():
    raws = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(os.path.join(HERE, "raw", "*.png"))}
    if not raws: print("No screenshots found in raw/ yet."); return
    for name, size in SIZES.items():
        out = os.path.join(HERE, "out", name); os.makedirs(out, exist_ok=True)
        for key, caption in CAPTIONS.items():
            if key in raws:
                frame(raws[key], caption, size).save(os.path.join(out, key + ".png"), optimize=True)
                print("made", name, key)

if __name__ == "__main__":
    main()
