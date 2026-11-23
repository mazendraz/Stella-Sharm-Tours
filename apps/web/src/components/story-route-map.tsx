import { useEffect, useRef } from 'react';
import type { PublicStory } from '@stella/shared/story';
import satellite from './journey-satellite.webp';
import relief from './journey-relief.webp';
import aqaba from './journey-aqaba.webp';

type Scene = PublicStory['scenes'][number];
type Point = Scene['route'][number];
const gulf = { west: 34.6, east: 35.3, south: 29.2, north: 29.82 };

export function usesGulfDetail(route: Point[]) {
  return (
    route.length > 1 &&
    route.every(
      ([lon, lat]) =>
        lon >= gulf.west &&
        lon <= gulf.east &&
        lat >= gulf.south &&
        lat <= gulf.north,
    )
  );
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const gulfImage = useRef<HTMLImageElement | null>(null);
  const tiles = useRef<{
    imagery: HTMLImageElement;
    base: HTMLImageElement;
  } | null>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const scene = scenes[index]!,
      leg = scene.route;
    const points = leg.length > 1 ? leg : scenes.flatMap((s) => s.route);
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
        lengths[i - 1]! + Math.hypot((p[0] - prev[0]) * 0.87, p[1] - prev[1]),
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
    const showGulf = usesGulfDetail(leg);
    if (!gulfImage.current && scenes.some((s) => usesGulfDetail(s.route))) {
      gulfImage.current = new Image();
      gulfImage.current.src = aqaba.src;
    }
    const detail = showGulf ? gulfImage.current : null;
    const backdrop = document.createElement('canvas');
    const background = backdrop.getContext('2d');
    let redrawBackground = true;
    const invalidate = () => {
      redrawBackground = true;
      schedule();
    };
    let frame = 0;
    const start = performance.now();
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    function draw(now: number) {
      frame = 0;
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!ctx || !background || !w || !h) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (
        el.width !== Math.round(w * ratio) ||
        el.height !== Math.round(h * ratio)
      ) {
        el.width = Math.round(w * ratio);
        el.height = Math.round(h * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const fullHeight = el.closest('dialog')?.clientHeight ?? h;
      const insetHeight = Math.min(
        195,
        Math.max(108, window.innerWidth * 0.16),
      );
      const expanded = Math.max(
        0,
        Math.min(1, (h - insetHeight) / Math.max(1, fullHeight - insetHeight)),
      );
      const scale = Math.min(
        (0.76 * w) / (0.87 * Math.max(0.18, right - left)),
        ((0.76 - 0.3 * expanded) * h) / Math.max(0.18, top - bottom),
      );
      const xy = ([lon, lat]: Point): Point => [
        w / 2 + (lon - (left + right) / 2) * 0.87 * scale,
        h * (0.5 - 0.08 * expanded) - (lat - (top + bottom) / 2) * scale,
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
              width * 0.87 * scale,
              height * scale,
            );
          }
        }
        tile(base, 20, 38, 24, 20);
        tile(imagery, 27, 34, 12, 10);
        if (detail)
          tile(
            detail,
            gulf.west,
            gulf.north,
            gulf.east - gulf.west,
            gulf.north - gulf.south,
          );
        for (const s of scenes)
          stroke(s.route, '#fff1ccaa', 1.4, [], background);
        redrawBackground = false;
      }
      ctx.drawImage(backdrop, 0, 0, w, h);
      const t = moving
        ? Math.max(0, Math.min(1, (now - start - 180) / 2400))
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
      stroke(done, '#382a20', moving ? 6 : 4);
      stroke(
        done,
        scene.transport === 'ferry' ? '#8ef0ff' : '#ffcb70',
        moving ? 3.6 : 2.3,
        ['flight', 'ferry'].includes(scene.transport) ? [7, 4] : [],
      );
      const [x, y] = xy(marker);
      ctx.beginPath();
      ctx.arc(x, y, moving ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe3a8';
      ctx.fill();
      ctx.strokeStyle = '#433121';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (moving) {
        if (t === 1) onArrival();
        else schedule();
      }
    }
    imagery.onload = base.onload = invalidate;
    if (detail) detail.onload = invalidate;
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    schedule();
    return () => {
      observer.disconnect();
      imagery.onload = base.onload = null;
      if (detail) detail.onload = null;
      cancelAnimationFrame(frame);
    };
  }, [scenes, index, moving, onArrival]);
  return <canvas ref={canvas} aria-hidden="true" className="story-chart" />;
}
