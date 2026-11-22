'use client';
import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import type { Media as MediaType } from '@stella/shared/public-contract';
export function Media({
  media,
  priority = false,
  sizes = '(max-width: 767px) 100vw, 50vw',
  className = '',
  onReady,
  defer = false,
}: {
  media: MediaType | null;
  priority?: boolean;
  sizes?: string;
  className?: string;
  onReady?: () => void;
  defer?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    [visible, setVisible] = useState(!defer);
  useEffect(() => {
    if (!defer || visible) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [defer, visible]);
  if (!media || media.rights_status === 'unknown')
    return (
      <span className={'media-placeholder ' + className} aria-hidden="true" />
    );
  const candidates = Object.entries(media.variants ?? {})
    .map(([key, url]) => ({ width: Number(key), url }))
    .filter(({ width }) => Number.isSafeInteger(width) && width > 0)
    .sort((a, b) => a.width - b.width)
    .map(({ width, url }) => ({
      width: Math.min(width, media.width ?? width),
      url,
    }))
    .filter(({ width }, index, list) => width !== list[index - 1]?.width);
  const srcSet = candidates.length
    ? candidates.map(({ width, url }) => `${url} ${width}w`).join(', ')
    : undefined;
  const src = candidates.find(({ width }) => width >= 480)?.url ?? media.url;
  if (priority && visible)
    preload(src, {
      as: 'image',
      fetchPriority: 'high',
      ...(srcSet ? { imageSrcSet: srcSet, imageSizes: sizes } : {}),
    });
  const picture = (
    <img
      className={'responsive-media ' + className}
      src={src}
      srcSet={srcSet}
      alt={media.alt.text}
      lang={media.alt.lang}
      sizes={srcSet ? sizes : undefined}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      onLoad={onReady}
    />
  );
  if (!defer) return picture;
  return (
    <span ref={ref} className="deferred-media">
      {visible ? (
        picture
      ) : (
        <span className="media-placeholder" aria-hidden="true" />
      )}
      <noscript>
        <img src={media.url} alt={media.alt.text} />
      </noscript>
    </span>
  );
}
