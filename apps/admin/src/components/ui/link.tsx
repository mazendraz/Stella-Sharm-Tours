'use client';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useGuard } from '../../lib/guard';

/** In-app link that respects the unsaved-changes guard. */
export function AppLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useGuard();
  return (
    <a
      href={href}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target === '_blank'
        )
          return;
        event.preventDefault();
        void navigate(href);
      }}
    />
  );
}
