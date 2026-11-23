"""Tone Sentinel-2 cloudless tiles to the softer look of the original story map.

  python grade-journey-tiles.py <tiles-in> <tiles-out>

Land: matched to the old map's mean and spread per channel (Sentinel-2 desert
is near white). Water: shifted to the old map's deeper blue. A smooth mask on
(blue - red) blends the two, so coasts and reefs have no hard edge.
"""
import sys, os, numpy as np
from PIL import Image

S2_LAND, S2_LAND_SD = np.array([240, 223, 156.]), np.array([34, 45, 38.])
OLD_LAND, OLD_LAND_SD = np.array([171, 148, 112.]), np.array([35, 30, 28.])
S2_WATER, OLD_WATER = np.array([25, 42, 67.]), np.array([23, 61, 114.])

def grade(a):
    a = a.astype(np.float32)
    land = OLD_LAND + (a - S2_LAND) * (OLD_LAND_SD / S2_LAND_SD)
    water = a * (OLD_WATER / S2_WATER)
    t = np.clip((a[..., 2] - a[..., 0]) / 30.0, 0, 1)[..., None]
    t = t * t * (3 - 2 * t)
    return np.clip(land * (1 - t) + water * t, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    src, dst = sys.argv[1:3]
    n = 0
    for root, _, files in os.walk(src):
        for f in files:
            if not f.endswith('.webp'):
                continue
            rel = os.path.relpath(os.path.join(root, f), src)
            out = os.path.join(dst, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            img = np.asarray(Image.open(os.path.join(root, f)).convert('RGB'))
            Image.fromarray(grade(img)).save(out, 'WEBP', quality=80, method=6)
            n += 1
    print(n, 'tiles graded')
