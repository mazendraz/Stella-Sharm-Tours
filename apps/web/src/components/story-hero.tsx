'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Pause, Play, ArrowUpRight } from 'lucide-react';
import type { Slide } from '@stella/shared/public-contract';
import { Media } from './media';
import { Content } from './text';
import { internalHref, track } from '@/lib/links';
import { useTripStore } from './store';
import { eligibleSlides } from '@stella/shared/hero';
const MAX_VIDEO_S = 20,
  VIDEO_WAIT_MS = 4000,
  FADE_MS = 1100;

// One slide's background: cover image, then its video fades in over it once
// it's actually playing (no jump from photo to video).
function HeroLayer({
  slide,
  source,
  active,
  fadeIn,
  first,
  playing,
  onVideo,
  onEnded,
}: {
  slide: Slide;
  source: string | null;
  active: boolean;
  fadeIn: boolean;
  first: boolean;
  playing: boolean;
  onVideo: (v: HTMLVideoElement | null) => void;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [posterReady, setPosterReady] = useState(false),
    [load, setLoad] = useState(false),
    [on, setOn] = useState(false);
  // The first slide's image loads first (page speed); later slides start
  // their video straight away.
  useEffect(() => {
    if (!source || (first && !posterReady)) return;
    const timer = setTimeout(() => setLoad(true), first ? 600 : 0);
    return () => clearTimeout(timer);
  }, [source, posterReady, first]);
  useEffect(() => {
    if (active) onVideo(video.current);
    return () => {
      if (active) onVideo(null);
    };
  }, [active, load]);
  // Becoming the active slide again: start the video from the beginning.
  useEffect(() => {
    if (active && video.current) video.current.currentTime = 0;
  }, [active]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => {});
    else if (active) v.pause();
  }, [playing, active, load]);
  return (
    <div
      className={
        'hero-background' +
        (fadeIn ? ' crossfade' : '') +
        (active ? '' : ' previous-background')
      }
    >
      <Media
        media={slide.cover}
        priority={first}
        sizes="100vw"
        onReady={() => setPosterReady(true)}
      />
      {load && source && (
        <video
          ref={video}
          className={on ? 'on' : ''}
          src={source}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onPlaying={() => setOn(true)}
          onEnded={onEnded}
        />
      )}
      <div className="hero-shade" />
    </div>
  );
}

export function StoryHero({
  slides,
  whatsappUrl,
  fallback,
}: {
  slides: Slide[];
  whatsappUrl: string | null;
  fallback: Slide | null;
}) {
  const locale = useLocale(),
    t = useTranslations();
  const root = useRef<HTMLElement>(null),
    copy = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0),
    [visible, setVisible] = useState(true),
    [hidden, setHidden] = useState(false),
    [manual, setManual] = useState(false),
    [reduce, setReduce] = useState(true),
    [desktop, setDesktop] = useState(false),
    [previous, setPrevious] = useState<Slide | null>(null);
  const overlay = useTripStore((s) => s.overlay),
    request = useTripStore((s) => !!s.request);
  const stage = useRef<HTMLDivElement>(null),
    bars = useRef<HTMLDivElement>(null),
    activeVideo = useRef<HTMLVideoElement | null>(null),
    elapsed = useRef(0),
    advanced = useRef(''),
    touch = useRef(0);
  const filtered = useMemo(() => {
    const result = eligibleSlides(slides, desktop ? 'desktop' : 'mobile');
    return result.length ? result : fallback ? [fallback] : [];
  }, [slides, desktop, fallback]);
  const count = Math.max(filtered.length, 1),
    current = index % count,
    active = filtered[current];
  const paused = !visible || hidden || manual || reduce || overlay || request;
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(locale);
  const sourceOf = (s: Slide | null | undefined) =>
    s && s.cover?.rights_status !== 'unknown'
      ? ((desktop ? s.cover?.video?.horizontal : s.cover?.video?.vertical) ??
        null)
      : null;
  const saveData = () =>
    !!(navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData;
  function show(next: number) {
    if (!filtered.length) return;
    const to = (next + filtered.length) % filtered.length;
    if (to === current) {
      // Only one slide: play it again from the start.
      elapsed.current = 0;
      advanced.current = '';
      if (activeVideo.current) activeVideo.current.currentTime = 0;
      return;
    }
    setPrevious(active ?? null);
    setIndex(to);
    elapsed.current = 0;
    advanced.current = '';
  }
  function go(next: number) {
    show(next);
    track('hero_slide_change', { index: next });
  }
  // Called when the active slide is done (video ended / image time is up).
  const finish = () => {
    if (!active || advanced.current === active.id) return;
    advanced.current = active.id;
    show(current + 1);
  };
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion:reduce)'),
      d = matchMedia('(min-width:1024px)');
    const change = () => {
      setReduce(m.matches);
      setDesktop(d.matches);
    };
    change();
    m.addEventListener('change', change);
    d.addEventListener('change', change);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const io = new IntersectionObserver(
      (es) => setVisible((es[0]?.intersectionRatio ?? 0) >= 0.6),
      { threshold: [0, 0.6, 1] },
    );
    if (root.current) io.observe(root.current);
    let raf = 0;
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.max(
            0,
            -(root.current?.getBoundingClientRect().top ?? 0),
          ),
          k = Math.min(y / 700, 1);
        if (!m.matches && stage.current) {
          stage.current.style.transform = 'scale(' + (1 - k * 0.1) + ')';
          stage.current.style.borderRadius = k * 36 + 'px';
          stage.current.style.filter = 'brightness(' + (1 - k * 0.45) + ')';
        }
        if (copy.current)
          copy.current.style.opacity = String(Math.max(0, 1 - y / 260));
      });
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      m.removeEventListener('change', change);
      d.removeEventListener('change', change);
      io.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('scroll', scroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  // Progress bars: finished slides full, upcoming empty, the active one is
  // driven by the loop below (so a bar is never left full by mistake).
  useEffect(() => {
    bars.current
      ?.querySelectorAll<HTMLElement>('.story-bar > span')
      .forEach((el, i) => {
        el.style.transform = 'scaleX(' + (i < current ? 1 : 0) + ')';
      });
  }, [current, filtered.length]);
  // A slide with a video lasts as long as its video (max 20 s) and the bar
  // follows the video's own time. An image slide uses its duration_s.
  useEffect(() => {
    if (!active || paused) return;
    const expectsVideo = !!sourceOf(active) && !saveData();
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const v = activeVideo.current,
        bar =
          bars.current?.querySelectorAll<HTMLElement>('.story-bar > span')[
            current
          ];
      let p = 0;
      if (v && v.readyState >= 2 && Number.isFinite(v.duration) && v.duration) {
        const length = Math.min(v.duration, MAX_VIDEO_S);
        p = v.currentTime / length;
        if (v.currentTime >= MAX_VIDEO_S) return finish();
      } else {
        elapsed.current += dt;
        // Give the video a few seconds to start; if it doesn't, show the
        // image for its normal time instead.
        const wait = expectsVideo ? VIDEO_WAIT_MS : 0;
        p = Math.max(0, elapsed.current - wait) / (active.duration_s * 1000);
        if (p >= 1) return finish();
      }
      if (bar) bar.style.transform = 'scaleX(' + Math.min(p, 1) + ')';
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active?.id, paused, current, desktop]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(null), FADE_MS);
    return () => clearTimeout(timer);
  }, [previous]);
  if (!active) return null;
  // Outgoing slide first, incoming on top. Keys keep each slide's element
  // (and its playing video) while it fades out under the new one.
  const layers = (
    previous && previous.id !== active.id ? [previous, active] : [active]
  ).map((s, i) => ({
    slide: s,
    leaving: i === 0 && !!previous && s !== active,
  }));
  return (
    <section
      ref={root}
      className="hero"
      aria-label={t('journeys')}
      onTouchStart={(e) => {
        // Swiping the chip row scrolls the chips, not the slides.
        touch.current = (e.target as Element).closest('.story-pills')
          ? NaN
          : (e.touches[0]?.clientX ?? 0);
      }}
      onTouchEnd={(e) => {
        if (Number.isNaN(touch.current)) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touch.current;
        if (Math.abs(delta) > 55)
          go(index + (delta > 0 ? -1 : 1) * (rtl ? -1 : 1));
      }}
    >
      <div className="hero-stage" ref={stage}>
        {layers.map(({ slide, leaving }) => (
          <HeroLayer
            key={slide.id}
            slide={slide}
            source={reduce || saveData() ? null : sourceOf(slide)}
            active={!leaving}
            fadeIn={!leaving && !!previous}
            first={filtered[0]?.id === slide.id && !previous}
            playing={!leaving && !paused}
            onVideo={(v) => {
              if (!leaving) activeVideo.current = v;
            }}
            onEnded={() => {
              if (!leaving) finish();
            }}
          />
        ))}
      </div>
      <div className="story-bars" aria-hidden="true" ref={bars}>
        {filtered.map((s) => (
          <span className="story-bar" key={s.id}>
            <span />
          </span>
        ))}
      </div>
      <div className="hero-tap-zones" aria-hidden="true">
        <div onClick={() => go(index - 1)} />
        <div onClick={() => go(index + 1)} />
      </div>
      <div className="hero-copy wrap" ref={copy}>
        <div className="hero-text" key={active.id}>
          <p className="kicker">
            <span className="gold-line" />
            <Content value={active.kicker} />
          </p>
          <h1>
            <Content value={active.title} />
          </h1>
          <p className="hero-sub">
            <Content value={active.subline} />
          </p>
          <div className="button-row">
            <Link
              className="button light"
              href={internalHref(active.href, locale)}
            >
              <Content value={active.cta_label} />
              <ArrowUpRight size={19} />
            </Link>
            {whatsappUrl && (
              <a
                className="button wa"
                href={whatsappUrl}
                onClick={() => track('whatsapp_click')}
              >
                <WhatsAppIcon size={19} />
                {t('whatsapp')}
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="story-list">
        {filtered.map((s, i) => (
          <button
            key={s.id}
            className={i === current ? 'active' : ''}
            aria-pressed={i === current}
            onClick={() => go(i)}
          >
            <span className="story-thumb">
              <Media media={s.cover} defer sizes="62px" />
            </span>
            <span>
              <Content value={s.title} />
            </span>
          </button>
        ))}
      </div>
      <div className="hero-bottom wrap">
        <ChipRow current={current}>
          {filtered.map((s, i) => (
            <button
              key={s.id}
              className={'chip ' + (i === current ? 'active' : '')}
              aria-pressed={i === current}
              onClick={() => go(i)}
            >
              <Content value={s.kicker ?? s.title} />
            </button>
          ))}
        </ChipRow>
        <div className="hero-controls">
          <button
            className="icon-button"
            aria-label={t('previous')}
            onClick={() => go(index - 1)}
          >
            ‹
          </button>
          <button
            className="icon-button"
            aria-label={t(manual ? 'play' : 'pause')}
            onClick={() => setManual(!manual)}
          >
            {manual ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label={t('next')}
            onClick={() => go(index + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Horizontally scrollable chip row: touch-swipe and trackpad scroll natively,
 * mouse users can drag it, the active chip is kept in view, and the edges
 * fade while more chips are hidden that way.
 */
function ChipRow({
  current,
  children,
}: {
  current: number;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; left: number; moved: boolean } | null>(null),
    [edges, setEdges] = useState({ start: false, end: false });
  const measure = () => {
    const el = row.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth,
      pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos > 2, end: max - pos > 2 });
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    const el = row.current,
      chip = el?.children[current] as HTMLElement | undefined;
    if (!el || !chip) return;
    const a = el.getBoundingClientRect(),
      b = chip.getBoundingClientRect();
    if (b.left >= a.left && b.right <= a.right) return;
    el.scrollBy({
      left: b.left + b.width / 2 - (a.left + a.width / 2),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [current]);
  return (
    <div
      ref={row}
      className="story-pills"
      data-fade-start={edges.start || undefined}
      data-fade-end={edges.end || undefined}
      onScroll={measure}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag.current = {
          x: e.clientX,
          left: e.currentTarget.scrollLeft,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 6) return;
        if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
        d.moved = true;
        e.currentTarget.scrollLeft = d.left - dx;
      }}
      onPointerUp={() => {
        // Keep the flag until the click that follows a drag is swallowed.
        setTimeout(() => (drag.current = null));
      }}
      onPointerCancel={() => (drag.current = null)}
      onClickCapture={(e) => {
        if (drag.current?.moved) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}
