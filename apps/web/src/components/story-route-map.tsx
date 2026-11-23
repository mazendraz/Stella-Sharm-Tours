import { useEffect, useRef } from 'react';
import type { PublicStory } from '@stella/shared/story';
import satellite from './journey-satellite.webp';
import relief from './journey-relief.webp';
import aqaba from './journey-aqaba.webp';
import sinai from './journey-sinai.webp';

type Scene = PublicStory['scenes'][number];
type Point = Scene['route'][number];
type Bounds = { west: number; east: number; south: number; north: number };
const sat: Bounds = { west: 27, east: 39, south: 24, north: 34 }; // journey-satellite.webp
// Sentinel-2 cloudless close-ups for legs too short for the base imagery.
const DETAILS = [
  // Gulf of Aqaba head: 2048px over 0.7° of longitude.
  {
    src: aqaba.src,
    bounds: { west: 34.6, east: 35.3, south: 29.2, north: 29.82 },
    maxScale: 3300,
  },
  // St Catherine and Mount Sinai: 2048px over 0.35° of longitude.
  {
    src: sinai.src,
    bounds: { west: 33.8, east: 34.15, south: 28.42, north: 28.68 },
    maxScale: 9000,
  },
];
const inside = (route: Point[], b: Bounds) =>
  route.every(
    ([lon, lat]) =>
      lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north,
  );
const detailFor = (route: Point[]) =>
  route.length > 1 ? DETAILS.find((d) => inside(route, d.bounds)) : undefined;
const LON = 0.87; // cos(latitude) for Egypt / Sinai
// Highest zoom (CSS px per degree of latitude) each image can take before
// it visibly pixelates: ~2.6x the source resolution.
const MAX_SCALE_SATELLITE = 600; // 2400px over 12° of longitude

/** Whether a scene's map uses a Sentinel-2 close-up (needs its credit). */
export function usesDetailImagery(route: Point[]) {
  return !!detailFor(route);
}

const near = (a?: Point, b?: Point) =>
  !!a && !!b && Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;

/** True when going from scene `from` to scene `to` actually covers new ground. */
export function travelsBetween(from: Scene | undefined, to: Scene) {
  const leg = to.route;
  if (leg.length < 2) return false;
  // A scene that only repeats the leg that brought us here (e.g. a second
  // photo at the same stop) must not replay the journey.
  return !near(from?.route[from.route.length - 1], leg[leg.length - 1]);
}

/** The leg the map frames for a scene: its own route, or for a single stop
 * the last real leg before it so the view stays put between stops. */
function framedPoints(scenes: Scene[], index: number): Point[] {
  const own = scenes[index]!.route;
  if (own.length > 1) return own;
  for (let i = index - 1; i >= 0; i--) {
    const r = scenes[i]!.route;
    if (r.length > 1) return [...r, ...own];
  }
  const all = scenes.flatMap((s) => s.route);
  return all.length ? all : own;
}

export function RouteMap({
  scenes,
  index,
  moving,
  onArrival,
}: {
  scenes: Scene[];
  index: number;
  moving: boolean;
  onArrival: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frameBox = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const detailImages = useRef(new Map<string, HTMLImageElement>());
  const tiles = useRef<{
    imagery: HTMLImageElement;
    base: HTMLImageElement;
  } | null>(null);
  useEffect(() => {
    const el = canvas.current!,
      box = wrap.current!,
      border = frameBox.current!;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const scene = scenes[index]!,
      leg = scene.route;
    const points = framedPoints(scenes, index);
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const left = Math.min(...xs),
      right = Math.max(...xs),
      bottom = Math.min(...ys),
      top = Math.max(...ys);
    const lengths = [0];
    for (let i = 1; i < leg.length; i++) {
      const prev = leg[i - 1]!,
        p = leg[i]!;
      lengths.push(
        lengths[i - 1]! + Math.hypot((p[0] - prev[0]) * LON, p[1] - prev[1]),
      );
    }
    if (!tiles.current) {
      const imagery = new Image(),
        base = new Image();
      imagery.src = satellite.src;
      base.src = relief.src;
      tiles.current = { imagery, base };
    }
    const { imagery, base } = tiles.current;
    // Start fetching every close-up this trip needs as soon as the story
    // opens, so it is ready before the scene that uses it.
    for (const s of scenes) {
      const d = detailFor(s.route);
      if (d && !detailImages.current.has(d.src)) {
        const img = new Image();
        img.src = d.src;
        detailImages.current.set(d.src, img);
      }
    }
    const close = detailFor(points);
    const detail = close ? (detailImages.current.get(close.src) ?? null) : null;
    const backdrop = document.createElement('canvas');
    const background = backdrop.getContext('2d');

    // The view is computed once per viewport size, so the map never zooms or
    // drifts while the inset grows to full screen: the inset is only a scaled
    // and clipped window onto this same full-screen canvas.
    let view: {
      w: number;
      h: number;
      scale: number;
      cx: number;
      cy: number;
      fx: number;
      fy: number;
      thumbScale: number;
      ready: boolean;
    } | null = null;
    let redrawBackground = true;
    const layout = () => {
      const w = box.clientWidth,
        h = box.clientHeight;
      if (!w || !h) return false;
      const ready = !!detail?.naturalWidth;
      if (view && view.w === w && view.h === h && view.ready === ready)
        return true;
      const fx = w / 2,
        fy = h * 0.42;
      const side = Math.min(w * 0.92, h * 0.78);
      const fit = Math.min(
        (0.74 * side) / (LON * Math.max(0.02, right - left)),
        (0.74 * side) / Math.max(0.02, top - bottom),
      );
      // Never show past the edge of the imagery in use (the detailed gulf
      // image, or the satellite image), so no seam or blurry fill shows.
      // A close-up is only used once it has loaded, so nothing ever shows
      // past its edges while it downloads.
      const useDetail = close && detail?.naturalWidth ? close : null;
      const edge = useDetail ? useDetail.bounds : sat;
      const cover = Math.max(
        w / (LON * (edge.east - edge.west)),
        h / (edge.north - edge.south),
      );
      const scale = Math.max(
        cover,
        Math.min(fit, useDetail ? useDetail.maxScale : MAX_SCALE_SATELLITE),
      );
      const westOf = fx / (LON * scale),
        eastOf = (w - fx) / (LON * scale),
        northOf = fy / scale,
        southOf = (h - fy) / scale;
      const cx = Math.min(
        Math.max((left + right) / 2, edge.west + westOf),
        edge.east - eastOf,
      );
      const cy = Math.min(
        Math.max((top + bottom) / 2, edge.south + southOf),
        edge.north - northOf,
      );
      // Thumbnail: a square around the focus, scaled into the corner.
      const small = h <= 530;
      const thumb = small ? 76 : Math.min(188, Math.max(106, w * 0.15));
      const tx = w * 0.04,
        ty = small ? 64 : 75;
      const s = thumb / side;
      view = { w, h, scale, cx, cy, fx, fy, thumbScale: s, ready };
      redrawBackground = true;
      const cl = fx - side / 2,
        ct = fy - side / 2;
      box.style.setProperty(
        '--map-inset',
        `translate(${tx - cl * s}px, ${ty - ct * s}px) scale(${s})`,
      );
      box.style.setProperty(
        '--map-clip',
        `inset(${ct}px ${w - cl - side}px ${h - ct - side}px ${cl}px round ${14 / s}px)`,
      );
      Object.assign(border.style, {
        left: tx + 'px',
        top: ty + 'px',
        width: thumb + 'px',
        height: thumb + 'px',
      });
      return true;
    };

    let frame = 0;
    const start = performance.now();
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const invalidate = () => {
      redrawBackground = true;
      schedule();
    };
    function draw(now: number) {
      frame = 0;
      if (!ctx || !background || !layout() || !view) return;
      const { w, h, scale, cx, cy, fx, fy, thumbScale } = view;
      // Keep the route and marker the same size on screen whether the map is
      // the corner thumbnail or full screen, including mid-transition.
      const css = getComputedStyle(box).transform;
      const shown =
        css && css !== 'none' ? new DOMMatrixReadOnly(css).a || 1 : 1;
      const px = 1 / Math.max(shown, thumbScale);
      const settling =
        Math.abs(shown - (moving ? 1 : thumbScale)) > 0.002 &&
        now - start < 1500;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (
        el.width !== Math.round(w * ratio) ||
        el.height !== Math.round(h * ratio)
      ) {
        el.width = Math.round(w * ratio);
        el.height = Math.round(h * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const xy = ([lon, lat]: Point): Point => [
        fx + (lon - cx) * LON * scale,
        fy - (lat - cy) * scale,
      ];
      const stroke = (
        line: Point[],
        color: string,
        width: number,
        dash: number[] = [],
        target: CanvasRenderingContext2D = ctx,
      ) => {
        target.beginPath();
        line.forEach((p, i) => {
          const [x, y] = xy(p);
          if (i) target.lineTo(x, y);
          else target.moveTo(x, y);
        });
        target.lineWidth = width;
        target.lineJoin = target.lineCap = 'round';
        target.strokeStyle = color;
        target.setLineDash(dash);
        target.stroke();
        target.setLineDash([]);
      };
      if (
        redrawBackground ||
        backdrop.width !== el.width ||
        backdrop.height !== el.height
      ) {
        backdrop.width = el.width;
        backdrop.height = el.height;
        background.setTransform(ratio, 0, 0, ratio, 0, 0);
        background.imageSmoothingEnabled = true;
        background.imageSmoothingQuality = 'high';
        background.fillStyle = '#454c42';
        background.fillRect(0, 0, w, h);
        function tile(
          img: HTMLImageElement,
          west: number,
          north: number,
          width: number,
          height: number,
        ) {
          if (img.naturalWidth) {
            const [x, y] = xy([west, north]);
            background!.drawImage(
              img,
              x,
              y,
              width * LON * scale,
              height * scale,
            );
          }
        }
        tile(base, 20, 38, 24, 20);
        tile(
          imagery,
          sat.west,
          sat.north,
          sat.east - sat.west,
          sat.north - sat.south,
        );
        if (close && detail)
          tile(
            detail,
            close.bounds.west,
            close.bounds.north,
            close.bounds.east - close.bounds.west,
            close.bounds.north - close.bounds.south,
          );
        for (const s of scenes)
          stroke(s.route, '#fff1ccaa', 1.4, [], background);
        redrawBackground = false;
      }
      ctx.drawImage(backdrop, 0, 0, w, h);
      const t = moving
        ? Math.max(0, Math.min(1, (now - start - 520) / 2400))
        : 1;
      const distance = lengths[lengths.length - 1]! * t * t * (3 - 2 * t);
      let j = 1;
      while (j < leg.length - 1 && lengths[j]! < distance) j++;
      const k = Math.min(j, leg.length - 1),
        a = leg[Math.max(0, k - 1)]!,
        b = leg[k]!;
      const f =
        (distance - (lengths[k - 1] ?? 0)) /
        (lengths[k]! - (lengths[k - 1] ?? 0) || 1);
      const marker: Point = [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
      ];
      const done = [...leg.slice(0, k), marker];
      stroke(done, '#382a20', (moving ? 6 : 4.5) * px);
      stroke(
        done,
        scene.transport === 'ferry' ? '#8ef0ff' : '#ffcb70',
        (moving ? 3.6 : 2.6) * px,
        ['flight', 'ferry'].includes(scene.transport) ? [7 * px, 4 * px] : [],
      );
      const [x, y] = xy(marker);
      ctx.beginPath();
      ctx.arc(x, y, (moving ? 7 : 4.5) * px, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe3a8';
      ctx.fill();
      ctx.strokeStyle = '#433121';
      ctx.lineWidth = 2 * px;
      ctx.stroke();
      if (moving && t === 1) onArrival();
      else if (moving || settling) schedule();
    }
    imagery.onload = base.onload = invalidate;
    if (detail) detail.onload = invalidate;
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    schedule();
    return () => {
      observer.disconnect();
      imagery.onload = base.onload = null;
      if (detail) detail.onload = null;
      cancelAnimationFrame(frame);
    };
  }, [scenes, index, moving, onArrival]);
  return (
    <>
      <div
        ref={wrap}
        className={'story-location' + (moving ? ' traveling' : '')}
      >
        <canvas ref={canvas} aria-hidden="true" className="story-chart" />
      </div>
      <div
        ref={frameBox}
        aria-hidden="true"
        className={'story-location-frame' + (moving ? ' traveling' : '')}
      />
    </>
  );
}
