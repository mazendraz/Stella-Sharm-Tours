"""Re-tone a Sentinel-2 close-up so it matches journey-satellite.webp.
Keeps the close-up's fine detail, takes the broad colour from the base image."""
import sys, numpy as np
from PIL import Image, ImageFilter
base_path, detail_path, out_path, west, east, south, north = sys.argv[1:8]
west, east, south, north = map(float, (west, east, south, north))
sat = Image.open(base_path).convert('RGB')   # 27..39E, 24..34N
det = Image.open(detail_path).convert('RGB')
W, H = det.size
px = sat.width / 12.0
crop = sat.crop(((west-27)*px, (34-north)*px, (east-27)*px, (34-south)*px)) if False else \
       sat.transform((W, H), Image.EXTENT, ((west-27)*px, (34-north)*px, (east-27)*px, (34-south)*px), Image.BICUBIC)
sigma = float(sys.argv[8]) if len(sys.argv) > 8 else 40
blur = lambda im: np.asarray(im.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float32)
d = np.asarray(det, dtype=np.float32)
mb, md = blur(crop), blur(det)
contrast = float(sys.argv[9]) if len(sys.argv) > 9 else 0.75
out = mb + (d - md) * contrast
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path, 'WEBP', quality=84, method=6)
print(out_path, W, H)
