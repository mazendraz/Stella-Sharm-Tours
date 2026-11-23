/**
 * Lists the Sentinel-2 tiles the trip-story maps need and writes
 * apps/web/src/components/journey-tiles.json (the high-zoom manifest).
 *
 *   pnpm exec tsx scripts/media/plan-journey-tiles.ts data/journeys \
 *     apps/web/src/components/journey-tiles.json
 *
 * Then fetch any new tiles from EOX (s2cloudless_3857, the 2016 layer, which is
 * CC BY 4.0), run grade-journey-tiles.py on them, and put them in
 * apps/web/public/journey-tiles/{z}/{x}/{y}.webp.
 *
 * Low zooms (MIN_ZOOM..REGION_MAX_ZOOM) cover the whole COVER box, so any
 * route an admin draws later still has a map. Higher zooms are only fetched
 * around each scene's view on common desktop and phone screens.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_ZOOM,
  REGION_MAX_ZOOM,
  computeView,
  coverTiles,
  framedPoints,
  tilesFor,
  type Scene,
} from '../../apps/web/src/components/story-map-view';

const dir = process.argv[2] ?? 'data/journeys';
const out = process.argv[3] ?? 'journey-tiles.json';
const screens: [number, number, number][] = [
  [1920, 1080, 1],
  [1536, 864, 1.25],
  [1440, 900, 2],
  [1280, 720, 1],
  [430, 932, 2],
  [390, 844, 2],
  [360, 780, 2],
  [844, 390, 2],
];
const high = new Map<number, Set<string>>();
const add = (z: number, x: number, y: number) => {
  if (z <= REGION_MAX_ZOOM) return;
  if (!high.has(z)) high.set(z, new Set());
  high.get(z)!.add(x + ',' + y);
};
for (const file of readdirSync(dir)) {
  const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const scenes: Scene[] | undefined = data.scenes ?? data.story?.scenes;
  if (!Array.isArray(scenes) || !scenes.length || !scenes[0]?.route) continue;
  scenes.forEach((_, i) => {
    const points = framedPoints(scenes, i);
    for (const [w, h, dpr] of screens) {
      const v = computeView(points, w, h, dpr);
      // The drawn zoom plus one level down, which shows while tiles load.
      for (const z of [v.z, v.z - 1]) {
        const r = tilesFor(v, z);
        for (let x = r.x0; x <= r.x1; x++)
          for (let y = r.y0; y <= r.y1; y++) add(z, x, y);
      }
    }
  });
}
// Manifest: per zoom, per row, sorted x runs [start, end].
const manifest: Record<string, Record<string, [number, number][]>> = {};
let highCount = 0;
for (const [z, set] of [...high].sort((a, b) => a[0] - b[0])) {
  const rows: Record<string, number[]> = {};
  for (const key of set) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    (rows[y] ??= []).push(x);
    highCount++;
  }
  manifest[z] = {};
  for (const [y, xs] of Object.entries(rows)) {
    xs.sort((a, b) => a - b);
    const runs: [number, number][] = [];
    for (const x of xs) {
      const last = runs[runs.length - 1];
      if (last && x === last[1] + 1) last[1] = x;
      else runs.push([x, x]);
    }
    manifest[z]![y] = runs;
  }
}
let lowCount = 0;
const low = [];
for (let z = MIN_ZOOM; z <= REGION_MAX_ZOOM; z++) {
  const r = coverTiles(z);
  low.push(r);
  lowCount += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}
writeFileSync(out, JSON.stringify(manifest));
console.log(
  JSON.stringify({
    lowCount,
    highCount,
    total: lowCount + highCount,
    low,
    perZoom: Object.fromEntries([...high].map(([z, s]) => [z, s.size])),
  }),
);
