# App Store screenshots

1. Take plain iPhone screenshots (demo account) and save them in `raw/` (any file extension case is fine).
2. Run `python3 make_screenshots.py` in this folder.
3. Upload the files from `out/6.9-inch/` to App Store Connect (6.9-inch iPhone). Apple scales them for the other sizes; `out/6.5-inch/` is there if it asks for that size.

The order and the caption of each screenshot are in the `SHOTS` list at the top of `make_screenshots.py` (10 screenshots, Apple's maximum).
Your untouched originals are in `_originals-private/` (not in git). Names in the screenshots are fake (Jamie, Sofia, Drum Crew) and the Admin tab is painted out.
