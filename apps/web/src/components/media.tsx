'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
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
  // Media without size variants (e.g. a video poster) is served as-is; a width
  // loader would only pretend to resize it.
  const hasVariants = Object.keys(media.variants ?? {}).length > 0;
  const picture = (
    <Image
      className={className}
      src={media.url}
      alt={media.alt.text}
      lang={media.alt.lang}
      fill
      sizes={sizes}
      priority={priority}
      fetchPriority={priority ? 'high' : undefined}
      decoding={priority ? 'sync' : 'async'}
      onLoad={onReady}
      unoptimized={!hasVariants}
      loader={({ width }) => {
        const variants = Object.entries(media.variants ?? {})
          .map(([w, url]) => ({ w: Number(w), url }))
          .filter((v) => Number.isFinite(v.w))
          .sort((a, b) => a.w - b.w);
        return (
          variants.find((v) => v.w >= width)?.url ??
          variants.at(-1)?.url ??
          media.url
        );
      }}
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
