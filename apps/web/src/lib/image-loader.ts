'use client';
import type { ImageLoaderProps } from 'next/image';
// The API supplies a processed media URL. Variants use a shared width query.
export default function imageLoader({ src, width, quality }: ImageLoaderProps) {
  return (
    src +
    (src.includes('?') ? '&' : '?') +
    'w=' +
    width +
    '&q=' +
    (quality ?? 72)
  );
}
