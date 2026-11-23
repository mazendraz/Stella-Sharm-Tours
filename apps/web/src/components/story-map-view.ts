/**
 * Map geometry for trip stories, shared by the renderer (story-route-map.tsx)
 * and by scripts/media/plan-journey-tiles.ts, so the tiles shipped in
 * public/journey-tiles are exactly the ones the map asks for.
 *
 * Imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), Web Mercator tiles.
 */
export type Point = [number, number]; // [lon, lat]
export type Bounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};

export const TILE = 256;
/** Every zoom up to REGION_MAX_ZOOM covers this whole box. */
export const COVER: Bounds = {
  west: 27.5,
  east: 37.5,
  south: 23.5,
  north: 33.5,
};
export const MIN_ZOOM = 6;
export const REGION_MAX_ZOOM = 10;
/** Higher zooms exist only around the views the stories actually use. */
export const MAX_ZOOM = 14;
/** How far a tile may be stretched before it looks soft. */
const STRETCH = 1.3;
/** Shortest leg the map frames (world units at zoom 0, about 1.5 km). */
const MIN_SPAN = 0.012;

/** Web Mercator world coordinates at zoom 0 (0..256). */
export function project([lon, lat]: Point): Point {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [
    ((lon + 180) / 360) * TILE,
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE,
  ];
}

const coverNW = project([COVER.west, COVER.north]);
const coverSE = project([COVER.east, COVER.south]);

export type Scene = { route: Point[] };

/** The points a scene frames: its own leg, or for a single stop the last real
 * leg before it, so the view stays put between nearby stops. */
export function framedPoints(scenes: Scene[], index: number): Point[] {
  const own = scenes[index]!.route;
  if (own.length > 1) return own;
  for (let i = index - 1; i >= 0; i--) {
    const r = scenes[i]!.route;
    if (r.length > 1) return [...r, ...own];
  }
  const all = scenes.flatMap((s) => s.route);
  return all.length ? all : own;
}

export type View = {
  w: number;
  h: number;
  /** CSS px per world unit. */
  k: number;
  /** World point drawn at the focus (fx, fy). */
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  /** Tile zoom to draw. */
  z: number;
  /** Square around the focus that becomes the corner thumbnail. */
  side: number;
  thumb: number;
  thumbLeft: number;
  thumbTop: number;
};

export function computeView(
  points: Point[],
  w: number,
  h: number,
  dpr: number,
): View {
  const xy = points.map(project);
  const xs = xy.map((p) => p[0]),
    ys = xy.map((p) => p[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const fx = w / 2,
    fy = h * 0.42;
  const side = Math.min(w * 0.92, h * 0.78);
  const fit = (0.74 * side) / Math.max(MIN_SPAN, right - left, bottom - top);
  const sharpest = (2 ** MAX_ZOOM * STRETCH) / dpr;
  const cover = Math.max(
    w / (coverSE[0] - coverNW[0]),
    h / (coverSE[1] - coverNW[1]),
  );
  const k = Math.max(cover, Math.min(fit, sharpest));
  // Keep the whole screen inside the imagery.
  const cx = Math.min(
    Math.max((left + right) / 2, coverNW[0] + fx / k),
    coverSE[0] - (w - fx) / k,
  );
  const cy = Math.min(
    Math.max((top + bottom) / 2, coverNW[1] + fy / k),
    coverSE[1] - (h - fy) / k,
  );
  const z = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.ceil(Math.log2((k * dpr) / STRETCH) - 1e-9)),
  );
  const small = h <= 530;
  const thumb = small ? 76 : Math.min(188, Math.max(106, w * 0.15));
  return {
    w,
    h,
    k,
    cx,
    cy,
    fx,
    fy,
    z,
    side,
    thumb,
    thumbLeft: w * 0.04,
    thumbTop: small ? 64 : 75,
  };
}

/** Tile x/y ranges (inclusive) at zoom z that cover the view. */
export function tilesFor(v: View, z = v.z) {
  const n = 2 ** z,
    scale = n / 1; // tile index per world unit is n / TILE * TILE
  const wx0 = v.cx - v.fx / v.k,
    wx1 = v.cx + (v.w - v.fx) / v.k,
    wy0 = v.cy - v.fy / v.k,
    wy1 = v.cy + (v.h - v.fy) / v.k;
  const t = (u: number) => (u / TILE) * scale;
  return {
    z,
    x0: Math.max(0, Math.floor(t(wx0))),
    x1: Math.min(n - 1, Math.floor(t(wx1))),
    y0: Math.max(0, Math.floor(t(wy0))),
    y1: Math.min(n - 1, Math.floor(t(wy1))),
  };
}

/** Tile ranges covering COVER at zoom z. */
export function coverTiles(z: number) {
  const n = 2 ** z,
    t = (u: number) => Math.floor((u / TILE) * n);
  return {
    z,
    x0: t(coverNW[0]),
    x1: Math.min(n - 1, t(coverSE[0])),
    y0: t(coverNW[1]),
    y1: Math.min(n - 1, t(coverSE[1])),
  };
}
