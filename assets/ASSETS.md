# Assets

All files are web-ready. Videos: H.264 MP4, no audio, `+faststart`, CRF 26. `-v` = vertical 720×1280 (mobile), `-h` = horizontal 1280×720 (desktop). Every video has a poster in `video/posters/`.

## Colour grade
All cut clips are graded brighter and warmer (ffmpeg `eq=brightness=0.045:contrast=1.07:saturation=1.32:gamma=1.06`, warm colour balance, light sharpen) and slowed to 0.85× for a smoother, more premium feel. Stock photos in `images/stock/` are graded the same way; the untouched versions are in `images/stock-original/`.

## Rights status — read before publishing
| Status | Meaning |
|---|---|
| **client** | Filmed by Stella / their guests → OK once Stella confirms. |
| **third-party** | Has another creator's watermark or came from someone else's Instagram → **do not publish** without written permission from the creator, or replace. |
| **stock** | Pexels / Unsplash licence, free for commercial use (sources in the original `stella-asset-sources.md`). Illustrative; replace with Stella's own over time. |
| **unknown** | Source not known (looks like a downloaded montage) → treat as third-party. |

## Cut clips from the client's videos (`video/`)
| File | Length | Cut from | Shows | Use | Rights |
|---|---|---|---|---|---|
| hero-history-v.mp4 | 18 s | instagram_1771620822934 (0:00–0:04, 0:15–0:19), 6.10.11 PM (0:20–0:24), 6.09.36 PM (0:01–0:05), 6.09.35 PM (0:10–0:14) | Pyramids → camel ride → Mohamed Ali mosque → Coptic Cairo → Sinai sunrise | History collection hero (mobile) | mixed — see rows below |
| hero-desert-v.mp4 | 14 s | VID_20260422 (jeep, canyon, camels), VID_20260911 (quads, Bedouin tea) | Desert collection hero | client (looks like Stella trips) |
| hero-all-v.mp4 | 17 s | pyramids, reef, canyon, Sinai sunrise, camels, Petra | "All of Egypt" hero (mobile) | mixed |
| hero-all-h.mp4 | 18 s | camel POV at Giza, reef, jeep, canyon, underwater | Desktop hero | mixed |
| giza-pyramids-v.mp4 | 9 s | instagram_1771620822934 0:00–0:09 | Pyramids, clear sky | Cairo trips | **unknown** (Instagram download) |
| giza-camel-ride-v.mp4 | 9.5 s | instagram_1771620822934 0:13–0:23 | Camel ride at Giza | Cairo trips | **unknown** |
| giza-camel-pov-h.mp4 | 4 s | VID-20251122-WA0010 | Camel ride POV with pyramids | Cairo trips, desktop | client (WhatsApp) |
| cairo-citadel-mosque-v.mp4 | 13 s | WhatsApp 6.10.11 PM 0:18–0:31 | Mohamed Ali mosque chandeliers | Cairo 2 days private | client (WhatsApp) |
| coptic-cairo-v.mp4 | 17 s | WhatsApp 6.09.36 PM | Coptic Cairo churches | Cairo 2 days | client (WhatsApp) |
| saint-catherine-monastery-v.mp4 | 9 s | WhatsApp 6.11.39 PM 0:00–0:09 | Desert monastery | Monastery trip | **third-party** — watermark "CHRISTIAN SIDE OF EGYPT"; location may be St Anthony's, not St Catherine — verify |
| mount-sinai-sunrise-v.mp4 | 10 s | WhatsApp 6.09.35 PM 0:09–0:19 | Sunrise above the clouds on Mount Sinai | Mount Sinai trip | **third-party** — small creator signature bottom centre |
| jerusalem-dome-v.mp4 | 8 s | WhatsApp 6.11.38 PM 0:02–0:10 | Dome of the Rock (burned-in "Jerusalem" label) | Jerusalem trip | client? (confirm) |
| desert-jeep-v.mp4 | 6 s | VID_20260422 0:07–0:13 | Jeeps in the desert | Nabq / canyon trips | client |
| coloured-canyon-v.mp4 | 9 s | VID_20260422 0:13–0:22 | Red/coloured canyon | Red Canyon, Wishwash | client |
| desert-camel-v.mp4 | 5 s | VID_20260422 0:24–0:29 | Camel ride, mountains | Dahab trip | client |
| reef-snorkel-v.mp4 | 5 s | VID_20260422 0:34–0:39 | Coral reef underwater | Red Canyon & Three Pools | client |
| bedouin-quad-v.mp4 | 6 s | VID_20260911 | Quad convoy, camels, Bedouin bread & tea | Quad / Super Safari | client |
| petra-treasury-v.mp4 | 2.4 s | lv_0_20261110171809 0:08–0:11 | Petra Treasury | Petra | **unknown** (montage) |
| reef-underwater-h.mp4 | 4.6 s | lv_0_20261110171809 0:00–0:05 (letterbox cropped) | Snorkeller between coral | Ras Mohammed boat, desktop | **unknown** |

Skipped: `1.mp4` (Saladin Citadel) — has the "@caroll.captures" watermark and burned-in Arabic title; `instagram_1776472419468.mp4` — same footage as VID_20260422; `WhatsApp Video 5.19.57 PM` — same montage as `lv_0_…` in lower quality.

## Stock (`video-stock/`, `images/stock/`)
- `stock-sea-quad-pyramids-h.mp4` — Pexels montage used in the mockups (reef aerial, quad, pyramids). Use for the Sea hero until Stella has real sea footage.
- `stock-giza-carriage-h.mp4` — Pexels, horse carriage at Giza.
- 29 photos (pyramids, sphinx, Karnak, Luxor, Sinai, St Catherine, reef, Tiran, white island, Dahab, quad, camel, Sharm bay, sunsets, yacht…). Sources and licences: Pexels / Unsplash (see the original `stella-asset-sources.md`).

## Gaps — ask Stella for real footage/photos
Red Sea boat trips (the biggest gap — Ras Mohammed, Tiran, White Island from their own boats), Sea Scope, glass-bottom boat, parasailing/banana, buggies, aqua park, spa, dolphin show, Nabq cabins, Alexandria, the office, the team (with consent), logo as SVG.

## The flyers (`reference/flyers/`)
Stella's own marketing flyers — used only as the source for the data. Don't put them on the website as images: they are text-heavy, unreadable on phones and duplicate the real content.

## Re-cut + optimistic grade (Nov 14, 2026)
All clips in `video/` (and `video-stock/stock-giza-carriage-h.mp4`) were re-cut to remove bad frames and given a second, content-aware grade on top of the original one. Masters are CRF 23; the media pipeline re-encodes them, and they are seeded with `sourceAlreadyGraded: true` so they are not graded again.
- Sand / pyramids (D): `vibrance=0.10, eq=contrast=1.04:gamma=1.03`. Light touch so the sand doesn't turn orange.
- Sea / underwater (S): brighter and clearer, `eq=brightness=0.02:contrast=1.06:gamma=1.07, vibrance=0.24`, cooler shadows.
- Interiors (I): warm glow, `vibrance=0.16`, warm highlights.
- Joins between non-adjacent cuts use a 0.3 s crossfade.

| Clip | Kept (source seconds) | Removed |
|---|---|---|
| hero-history-v | 0–14.0 | dark backlit facade + Sinai sunrise (creator signature) |
| hero-all-v | 0–3.4, 4.7–11.3, 16.1–20.1 | wetsuit on lens, Sinai sunrise with signature |
| hero-desert-v | 0–1.4, 2.6–8.1, 9.2–13.4, 14.6–16.7 | split-screen glitch, blurry transition, flag |
| reef-snorkel-v | 1.6–4.9 | wetsuit on lens, camel picture-in-picture |
| reef-underwater-h | 0–4.25 | jump to an aerial shot |
| bedouin-quad-v | 0–2.5, 3.5–4.5, 5.5–7.0 | empty walking shot, blurry shot through glass |
| desert-camel-v | 0–2.0, 5.0–5.86 | quads, flag |
| desert-jeep-v | 0–1.4, 2.6–7.06 | split-screen glitch |
| giza-camel-ride-v | 1.5–end | someone's back filling the frame |
| cairo-citadel-mosque-v | 1.5–end | tilting columns |
| coptic-cairo-v | 0–1.5, 3.9–14.9, 15.6–18.0 | dark backlit facade, transition, overlong static end |
| **sea-hero-h** (new) | stock-sea-quad-pyramids-h 0–4.25 | dark desert-at-dusk part → now the Sea collection hero |
| coloured-canyon, giza-pyramids, jerusalem-dome, petra-treasury, stock-giza-carriage | full | grade only |

Untouched (to be replaced, not fixed): `hero-all-h` (blurry desktop hero), `giza-camel-pov-h`, `mount-sinai-sunrise-v`, `saint-catherine-monastery-v` (third-party watermark).
Previous versions are in `_backup-v1/`. `video-v2/` is a working copy of the new files and can be deleted.

## New Pexels stock (Nov 14, 2026) — `video-stock/`
Pexels licence (free commercial use, no attribution required). Sources are the 4K/1080p originals the user downloaded. Each clip is cut and graded (sunrise: lifted shadows; hazy pyramid drone shot: dehazed; reef: brighter). Exported at 2560×1440 or 1440×2560 so the pipeline's mobile **and** desktop crops both come out sharp.

| File | Pexels video | Used for |
|---|---|---|
| stock-hero-egypt.mp4 (19.5 s, 2560×1440) | 35695240 camels + pyramids → 10719349 pyramid drone → 27263876 Red Sea reef → 9424565 Mount Sinai → 34525290 Sharm sunset | "All of Egypt" collection hero (replaces hero-all-v / hero-all-h, rights unknown) |
| stock-red-sea-reef.mp4 (10 s) | 27263876 | Sea collection hero, Ras Mohammed bus, Tiran |
| stock-mount-sinai-sunrise.mp4 (12 s, vertical, 2× speed) | 32911411 | Mount Sinai trip (replaces the clip with the creator signature) |
| stock-saint-catherine.mp4 (9.8 s, 1920×1080) | 4174093 + 4173975 | St Catherine & Dahab trip (replaces the watermarked clip) |
| stock-giza-camels.mp4 (11 s) | 35695240 + 29622798 | Cairo by plane 1 day (replaces giza-camel-pov-h) |
| stock-sharm-sunset.mp4 (11.9 s) | 34525290 | Romantic dinner cruise |

Note: the pipeline makes both the mobile (720×1280) and desktop (1280×720) versions by cropping one source. Vertical 720p client clips therefore come out soft on desktop; that's why the heroes now use the 4K stock.

## Making every video show (Nov 14, 2026)
The API hides any video in `video/` whose rights are `unknown` (not in the `permission` list in `apps/api/src/media.ts`). What changed:
- `hero-history-v` was rebuilt from Pexels (camels, pyramid drone shot) + client clips (Citadel mosque, Coptic Cairo), no Instagram footage. Added to `permission` along with `hero-desert-v` (all client footage).
- New Pexels clips in `video-stock/`: `stock-giza-pyramids-aerial` (10719349), `stock-sea-boat` (the old stock-sea-quad-pyramids-h boat shot), `stock-petra-treasury` (4253642, cropped so the Treasury stays in the mobile crop). `images/stock/petra.jpg` is a still from it.
- Catalog: every trip that has a matching clip now has one. Still with no video (nothing suitable yet): Luxor, water activities, horse riding ×2, dolphin show, aqua park, spa. Jerusalem keeps `jerusalem-dome-v` and stays hidden until Stella confirms it's their footage (Pexels alternative: 40756075).

## Brand
`assets/brand/`: masters cut from Stella's logo (transparent): full logo, white version for dark backgrounds, compass mark, icons. Web copies are in `apps/web/public/brand/` (header lockup mark + wordmark, footer logo, icons, og.jpg) and `apps/admin/public/brand/`.

## 6-second homepage heroes (Nov 14, 2026)
Each collection has two 6 s hero clips, each framed for its own screen:
`video-stock/hero6-<collection>-h.mp4` (2560×1440, desktop + collection page) and
`hero6-<collection>-v.mp4` (1080×1920, phones; the desert one is in `video/` because it is client footage).
In `data/catalog.json` they are `hero_video` and `hero_video_mobile`; `pnpm db:sync-media` gives each collection a phone slide and a desktop slide.
Sources (Pexels): boat over the reef (file 13413450, Private + All), camels 35695240 + pyramid drone shot 10719349 (History, All), reef 27263876 (Sea), quads at sunset (file 14945991, Desert desktop), Sharm sunset 34525290 (Relax), Petra 4253642 (Beyond), Mount Sinai 9424565 (All). Desert phone: client canyon + quad clips.
Cutting scripts: `scripts/media/hero6.py` (these heroes), `stock-clips.py`, `recut-client-clips.py`. They read the Pexels originals from the Downloads folder. The vertical crop is framed on the subject (sun, reef, camels, Treasury).

## Homepage intro footage (Nov 22, 2026)

The active catalog uses the Pexels downloads below. Each clip has a continuous
720p landscape edit and a 720×1280 portrait edit under `assets/video-stock/`.

| Slide | Footage | Pexels file ID |
| --- | --- | --- |
| Private | Visitor photographing a pyramid | 7492809 |
| History | Light and shadow on carved temple walls | 16194346 |
| Red Sea | Fish above a coral reef | 20271097 |
| Desert | Dune buggy | 5977492 |
| Beyond Egypt | Petra Treasury through the Siq | 14923757 |
| Relax | Beachfront resorts | 4185235 |
| All of Egypt | Sailboat on the Nile | 15216597 |

Run `pnpm db:sync-media --hero-only` against the intended database to apply the
new videos to existing homepage slides. The catalog seed pairs the two versions
when it creates new slides.
