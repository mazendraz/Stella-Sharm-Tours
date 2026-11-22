'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { publicStorySchema, type PublicStory } from '@stella/shared/story';
import type { Trip } from '@stella/shared/public-contract';
import { Media } from './media';
import { useTripStore } from './store';
import { track } from '@/lib/links';
import terrain from './journey-relief.webp';
import './trip-story.css';

type Scene = PublicStory['scenes'][number];
type Point = [number, number];

// Natural Earth II shaded relief, cropped to 20–44°E and 18–38°N.
function RouteMap({
  arriving,
  scenes,
  index,
  moving,
}: {
  arriving: boolean;
  scenes: Scene[];
  index: number;
  moving: boolean;
}) {
  const points = scenes.flatMap((s) => s.route),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.max(...ys),
    bottom = Math.min(...ys);
  const scale = Math.min(
    280 / Math.max(0.05, (right - left) * 0.87),
    198 / Math.max(0.05, top - bottom),
  );
  const xy = ([lon, lat]: Point) => [
    160 + (lon - (left + right) / 2) * 0.87 * scale,
    118 + ((top + bottom) / 2 - lat) * scale,
  ];
  const path = (pts: Point[]) =>
    pts
      .map(
        (p, i) =>
          (i ? 'L' : 'M') +
          xy(p)
            .map((v) => v.toFixed(2))
            .join(' '),
      )
      .join(' ');
  const scene = scenes[index]!,
    [cx, cy] = xy(scene.route[scene.route.length - 1]!);
  return (
    <svg viewBox="0 0 320 236" aria-hidden="true" className="story-chart">
      <rect width="320" height="236" fill="#f1dfb9" />
      <image
        href={terrain.src}
        x={xy([20, 38])[0]}
        y={xy([20, 38])[1]}
        width={24 * 0.87 * scale}
        height={20 * scale}
        preserveAspectRatio="none"
      />
      {scenes.map((s, i) => (
        <path
          key={s.id}
          d={path(s.route)}
          fill="none"
          stroke={i < index ? '#6e361c' : '#494940'}
          strokeWidth={i < index ? 2.3 : 1.3}
          strokeDasharray={
            s.transport === 'flight' || s.transport === 'ferry'
              ? '4 3'
              : undefined
          }
        />
      ))}
      <path
        key={scene.id}
        d={path(scene.route)}
        pathLength={1}
        className={moving ? 'story-trace' : ''}
        fill="none"
        stroke="#ac3e1c"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {(moving || arriving) && (
        <circle
          key={moving ? 'leg' : 'arrival'}
          r="4.6"
          fill="#ad4121"
          stroke="white"
          strokeWidth="2"
        >
          <animateMotion
            dur={moving ? '1.4s' : '1.2s'}
            keyTimes="0;1"
            keyPoints={moving ? '0;0.8' : '0.8;1'}
            calcMode="linear"
            path={path(scene.route)}
            fill="freeze"
          />
        </circle>
      )}
      {!moving && !arriving && (
        <circle
          cx={cx}
          cy={cy}
          r="4.6"
          fill="#ad4121"
          stroke="white"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
export default function TripStory({
  trip,
  privateMode,
  previewStory,
}: {
  trip: Trip;
  privateMode: boolean;
  previewStory?: PublicStory | undefined;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    dialog = useRef<HTMLDialogElement>(null),
    entry = useRef<HTMLButtonElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false),
    [story, setStory] = useState<PublicStory | null>(null),
    [error, setError] = useState(false),
    [index, setIndex] = useState(0),
    [moving, setMoving] = useState(false),
    [arriving, setArriving] = useState(false),
    [broken, setBroken] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null),
    requestAfter = useRef(false);
  const ready = useTripStore((state) => state.ready);
  const scene = story?.scenes[index];
  const cover = trip.story_cover ?? trip.cover;
  useEffect(() => {
    if (!open) return;
    const d = dialog.current!,
      controller = new AbortController();
    d.showModal();
    const marker =
      Date.now().toString(36) + Math.random().toString(36).slice(2);
    history.pushState({ ...history.state, stellaStory: marker }, '');
    const back = () => setOpen(false);
    const pause = () => {
      if (document.hidden) video.current?.pause();
    };
    window.addEventListener('popstate', back);
    document.addEventListener('visibilitychange', pause);
    if (previewStory) setStory(previewStory);
    else
      fetch(
        '/api/trip-story?' + new URLSearchParams({ slug: trip.slug, locale }),
        { signal: controller.signal },
      )
        .then(async (r) => {
          if (!r.ok) throw Error();
          return publicStorySchema.parse(await r.json());
        })
        .then((s) => {
          if (!controller.signal.aborted) setStory(s);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        });
    return () => {
      controller.abort();
      window.removeEventListener('popstate', back);
      document.removeEventListener('visibilitychange', pause);
      d.close();
      const finish = () => {
        entry.current?.focus({ preventScroll: true });
        if (requestAfter.current) {
          requestAfter.current = false;
          useTripStore
            .getState()
            .openRequest(
              [trip],
              privateMode ? 'private' : 'group',
              1,
              entry.current ?? undefined,
            );
        }
      };
      if (history.state?.stellaStory === marker) {
        window.addEventListener('popstate', finish, { once: true });
        history.back();
      } else finish();
    };
  }, [open, locale, trip, privateMode, previewStory]);
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => {
      setMoving(false);
      setArriving(true);
    }, 1400);
    return () => clearTimeout(timer);
  }, [moving, index]);
  useEffect(() => {
    if (!arriving) return;
    const timer = setTimeout(() => setArriving(false), 1200);
    return () => clearTimeout(timer);
  }, [arriving]);
  const go = (next: number) => {
    if (
      !story ||
      next < 0 ||
      next >= story.scenes.length ||
      moving ||
      next === index
    )
      return;
    setBroken(false);
    setArriving(false);
    setIndex(next);
    setMoving(
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
        next === index + 1 &&
        story.scenes[next]!.route.length > 1,
    );
    if (next === story.scenes.length - 1)
      track('trip_story_finish', { slug: trip.slug });
  };
  const rtl = () => document.documentElement.dir === 'rtl';
  return (
    <>
      <button
        type="button"
        ref={entry}
        className="story-entry"
        disabled={!ready && !previewStory}
        onClick={() => {
          setArriving(false);
          setIndex(0);
          setMoving(false);
          setBroken(false);
          setStory(null);
          setError(false);
          setOpen(true);
          track('trip_story_open', { slug: trip.slug });
        }}
      >
        {cover && <Media media={cover} defer />}
        <span>{t('storyExplore')}</span>
      </button>
      <dialog
        ref={dialog}
        className="stella-story"
        aria-label={t('storyExplore')}
        onCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLSelectElement) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            go(index + ((e.key === 'ArrowRight') !== rtl() ? 1 : -1));
          }
        }}
      >
        {open && (
          <>
            <button
              autoFocus
              type="button"
              className="story-close"
              aria-label={t('close')}
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            {!story || !scene ? (
              <p role="status">
                {error ? t('storyUnavailable') : t('storyLoading')}
              </p>
            ) : (
              <>
                <div className="story-progress" aria-hidden="true">
                  {story.scenes.map((s, i) => (
                    <i key={s.id} className={i <= index ? 'seen' : ''} />
                  ))}
                </div>
                <div
                  className="story-stills"
                  onPointerDown={(e) => {
                    pointer.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={(e) => {
                    const start = pointer.current;
                    pointer.current = null;
                    if (
                      !start ||
                      Math.hypot(start.x - e.clientX, start.y - e.clientY) >
                        12 ||
                      moving ||
                      (e.target instanceof HTMLVideoElement &&
                        e.clientY >
                          e.currentTarget.getBoundingClientRect().bottom - 60)
                    )
                      return;
                    const r = e.currentTarget.getBoundingClientRect();
                    go(
                      index +
                        (e.clientX - r.left > r.width / 2 !== rtl() ? 1 : -1),
                    );
                  }}
                  onPointerCancel={() => {
                    pointer.current = null;
                  }}
                >
                  {!moving && (
                    <img
                      key={scene.id + '-still'}
                      src={scene.media.url}
                      alt={scene.media.alt.text}
                      style={{
                        objectFit: scene.frame,
                        objectPosition:
                          (scene.focalX ?? 50) +
                          '% ' +
                          (scene.focalY ?? 50) +
                          '%',
                      }}
                    />
                  )}
                  {!moving && !broken && scene.media.video && (
                    <video
                      key={scene.id + '-video'}
                      ref={video}
                      poster={scene.media.url}
                      controls
                      muted
                      playsInline
                      autoPlay={
                        !matchMedia('(prefers-reduced-motion: reduce)').matches
                      }
                      onError={() => setBroken(true)}
                      style={{
                        objectFit: scene.frame,
                        objectPosition:
                          (scene.focalX ?? 50) +
                          '% ' +
                          (scene.focalY ?? 50) +
                          '%',
                      }}
                    >
                      {scene.media.video.vertical && (
                        <source
                          media="(max-width: 700px)"
                          src={scene.media.video.vertical}
                        />
                      )}
                      <source
                        src={
                          scene.media.video.horizontal ||
                          scene.media.video.vertical ||
                          undefined
                        }
                      />
                    </video>
                  )}
                </div>
                <div
                  className={'story-location' + (moving ? ' traveling' : '')}
                >
                  <RouteMap
                    arriving={arriving}
                    scenes={story.scenes}
                    index={index}
                    moving={moving}
                  />
                </div>
                <div className="story-caption" aria-live="polite">
                  <small>
                    {moving
                      ? t('storyMode_' + scene.transport)
                      : t('story_' + scene.kind)}
                  </small>
                  <h2>{scene.title.text}</h2>
                  <p>{scene.caption.text}</p>
                  {scene.credit && (
                    <details key={scene.id} className="story-credits">
                      <summary>{t('storyCredits')}</summary>
                      <small>
                        {scene.credit.split(' · ').map((part, i) =>
                          /^https?:\/\//.test(part) ? (
                            <a
                              key={i}
                              href={part}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {part.split('/')[2]} ↗{' '}
                            </a>
                          ) : (
                            <span key={i}>{part} </span>
                          ),
                        )}
                      </small>
                    </details>
                  )}
                </div>
                <footer>
                  <button
                    aria-label={t('previous')}
                    disabled={moving || index === 0}
                    onClick={() => go(index - 1)}
                  >
                    <ChevronLeft />
                  </button>
                  <select
                    value={index}
                    aria-label={t('storyStops')}
                    disabled={moving}
                    onChange={(e) => go(Number(e.target.value))}
                  >
                    {story.scenes.map((s, i) => (
                      <option key={s.id} value={i}>
                        {i + 1} / {story.scenes.length} · {s.title.text}
                      </option>
                    ))}
                  </select>
                  {index === story.scenes.length - 1 && !previewStory ? (
                    <button
                      onClick={() => {
                        requestAfter.current = true;
                        track('trip_story_request', { slug: trip.slug });
                        setOpen(false);
                      }}
                    >
                      {t('request')}
                    </button>
                  ) : (
                    <button
                      aria-label={t('next')}
                      disabled={moving || index === story.scenes.length - 1}
                      onClick={() => go(index + 1)}
                    >
                      <ChevronRight />
                    </button>
                  )}
                </footer>
              </>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
