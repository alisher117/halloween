"""Key the baked checkerboard out of the rain plugin export and turn it into
a grayscale drop height map (white = thick water) that the WebGL pass refracts."""
import cv2, numpy as np, glob, sys, os
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
fs = sorted(glob.glob(os.path.join(src, '*.png')))
med = np.median(np.stack([cv2.imread(f, 0) for f in fs[::5]]), axis=0).astype(np.float32)
el = lambda s: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (s, s))

def height(f):
    d = np.abs(cv2.imread(f, 0).astype(np.float32) - med)
    m = (d > 14).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, el(7))
    h, w = m.shape
    ff = cv2.copyMakeBorder(255 - m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    cv2.floodFill(ff, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 0)
    m = m | ff[1:-1, 1:-1]                       # fill drop interiors
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, el(3))
    m = (cv2.GaussianBlur(m, (0, 0), 1.6) > 127).astype(np.uint8) * 255  # smooth contours
    dist = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    t = np.clip(dist / 7.0, 0, 1)
    dome = 1 - (1 - t) ** 2.2                    # rounded edge, flat-ish top
    return cv2.GaussianBlur(dome, (0, 0), 1.0)

H = [height(f) for f in fs]
N, K = len(H), 30                                # crossfade tail into head -> seamless loop
for i in range(N - K):
    if i < K:
        a = i / K
        hm = H[i] * a + H[N - K + i] * (1 - a)
    else:
        hm = H[i]
    cv2.imwrite(os.path.join(out, f'h_{i:04d}.png'), (np.clip(hm, 0, 1) * 255).astype(np.uint8))
print('frames', N - K)
