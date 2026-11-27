'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Play, X } from 'lucide-react';
import { publicStorySchema, type PublicStory } from '@stella/shared/story';
import type { Trip } from '@stella/shared/public-contract';
import { Media } from './media';
import { useTripStore } from './store';
import { track } from '@/lib/links';
import { createHistoryEntry } from '@/lib/history-entry';
import { StoryStopPicker } from './story-stop-picker';
import { RouteMap, travelsBetween } from './story-route-map';
import './trip-story.css';

export default function TripStory({
  trip,
  privateMode,
  homeCard = false,
  previewStory,
}: {
  trip: Trip;
  privateMode: boolean;
  homeCard?: boolean;
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
    [paused, setPaused] = useState(true),
    [broken, setBroken] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null),
    requestAfter = useRef(false),
    storyEntry = useRef<ReturnType<typeof createHistoryEntry> | null>(null);
  const ready = useTripStore((state) => state.ready);
  const scene = story?.scenes[index];
  const cover = trip.story_cover ?? trip.cover;
  useEffect(() => {
    if (!open) return;
    const d = dialog.current!,
      controller = new AbortController();
    if (!d.open) d.showModal();
    const pause = () => {
      if (document.hidden) video.current?.pause();
    };
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
    storyEntry.current ??= createHistoryEntry('stellaStory');
    const detach = storyEntry.current.attach(() => setOpen(false), finish);
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
      detach();
      document.removeEventListener('visibilitychange', pause);
      d.close();
    };
  }, [open, locale, trip, privateMode, previewStory]);
  const arrive = useCallback(() => setMoving(false), []);
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
    setIndex(next);
    setMoving(
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
        next === index + 1 &&
        travelsBetween(story.scenes[index], story.scenes[next]!),
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
        className={homeCard ? 'story-entry home-story-card' : 'story-entry'}
        disabled={!ready && !previewStory}
        onClick={() => {
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
        {homeCard && <Play className="home-story-play" aria-hidden size={38} />}
        <span>{homeCard ? trip.title.text : t('storyExplore')}</span>
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
              <X size={16} /> {t('close')}
            </button>
            <b className="story-wordmark" lang="en">
              STELLA
            </b>
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
                  {moving && story.scenes[index - 1] && (
                    <img
                      className="story-departure"
                      alt=""
                      src={story.scenes[index - 1]!.media.url}
                      style={{
                        objectFit: story.scenes[index - 1]!.frame,
                        objectPosition:
                          (story.scenes[index - 1]!.focalX ?? 50) +
                          '% ' +
                          (story.scenes[index - 1]!.focalY ?? 50) +
                          '%',
                      }}
                    />
                  )}
                  {!moving && !broken && scene.media.video && (
                    <video
                      key={scene.id + '-video'}
                      ref={video}
                      poster={scene.media.url}
                      onPlay={() => setPaused(false)}
                      onPause={() => setPaused(true)}
                      onEnded={() => setPaused(true)}
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
                <RouteMap
                  onArrival={arrive}
                  scenes={story.scenes}
                  index={index}
                  moving={moving}
                />
                <footer className="story-panel">
                  <div className="story-caption" aria-live="polite">
                    <small>
                      {index + 1} / {story.scenes.length} ·{' '}
                      {moving
                        ? t('storyMode_' + scene.transport)
                        : t('story_' + scene.kind)}
                    </small>
                    <h2>{scene.title.text}</h2>
                    <p>{scene.caption.text}</p>
                  </div>
                  <div className="story-actions">
                    <button
                      aria-label={t('previous')}
                      hidden={index === 0}
                      disabled={moving}
                      onClick={() => go(index - 1)}
                    >
                      {t('previous')}
                    </button>
                    {trip.slug === 'luxor-plane-1-day' && (
                      <StoryStopPicker
                        scenes={story.scenes}
                        index={index}
                        disabled={moving}
                        onSelect={go}
                      />
                    )}
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
                        disabled={index === story.scenes.length - 1 && !moving}
                        onClick={() =>
                          moving ? setMoving(false) : go(index + 1)
                        }
                      >
                        {moving
                          ? scene.title.text
                          : t('next') +
                            (story.scenes[index + 1]
                              ? ' · ' + story.scenes[index + 1]!.title.text
                              : '')}
                      </button>
                    )}
                    {!moving && scene.media.video && !broken && (
                      <button
                        onClick={() => {
                          const v = video.current;
                          if (!v) return;
                          if (v.paused)
                            void v.play().catch(() => setPaused(true));
                          else v.pause();
                        }}
                      >
                        {t(paused ? 'play' : 'pause')}
                      </button>
                    )}
                  </div>
                  <details key={scene.id} className="story-credits">
                    <summary>{t('storyCredits')}</summary>
                    <small>
                      {scene.credit?.split(' · ').map((part, i) =>
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
                    <small style={{ display: 'block' }}>
                      <a href="https://s2maps.eu">Sentinel-2 cloudless</a> — EOX
                      IT Services GmbH
                      {' (Contains modified Copernicus Sentinel data 2016) · '}
                      <a href="https://creativecommons.org/licenses/by/4.0/">
                        CC BY 4.0
                      </a>
                    </small>
                  </details>
                </footer>
              </>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
