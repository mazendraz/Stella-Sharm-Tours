'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function useTripReorder(move: (slug: string, target: string) => void) {
  const list = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    slug: string;
    card: HTMLElement;
    top: number;
    offset: number;
    start: number;
    y: number;
    target: string;
    active: boolean;
    timer: ReturnType<typeof setTimeout>;
    frame: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ slug: string; target: string } | null>(
    null,
  );

  useEffect(
    () => () => {
      const current = gesture.current;
      if (!current) return;
      clearTimeout(current.timer);
      cancelAnimationFrame(current.frame);
    },
    [],
  );

  function finish(event: PointerEvent, drop: boolean) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    clearTimeout(current.timer);
    cancelAnimationFrame(current.frame);
    current.card.style.removeProperty('--trip-drag-y');
    setDrag(null);
    if (drop && current.active) move(current.slug, current.target);
  }

  function update() {
    const current = gesture.current;
    const element = list.current;
    if (!current?.active || !element) return;
    const scroller = element.closest('.panel-scroll');
    const tabbar = document.querySelector<HTMLElement>(
      scroller ? '.panel .tabbar' : '.trip-navigation-page .tabbar',
    );
    const bottom =
      scroller?.getBoundingClientRect().bottom ??
      (tabbar?.offsetHeight ? tabbar.getBoundingClientRect().top : innerHeight);
    if (current.y < 65 || current.y > bottom - 65) {
      (scroller ?? window).scrollBy({
        top: current.y < 65 ? -12 : 12,
        behavior: 'instant',
      });
    }
    let closest = Infinity;
    let target = current.slug;
    for (const card of element.querySelectorAll<HTMLElement>(
      '[data-trip-slug]',
    )) {
      const rect = card.getBoundingClientRect();
      const offset = card === current.card ? current.offset : 0;
      const distance = Math.abs(
        current.y - ((rect.top + rect.bottom) / 2 - offset),
      );
      if (distance < closest) {
        closest = distance;
        target = card.dataset.tripSlug ?? current.slug;
      }
    }
    if (current.target !== target) {
      current.target = target;
      setDrag({ slug: current.slug, target });
    }
    const baseTop = current.card.getBoundingClientRect().top - current.offset;
    current.offset = current.top + current.y - current.start - baseTop;
    current.card.style.setProperty('--trip-drag-y', current.offset + 'px');
    current.frame = requestAnimationFrame(update);
  }

  function grip(slug: string) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (
          event.pointerType === 'mouse' ||
          !event.isPrimary ||
          gesture.current
        )
          return;
        const card =
          event.currentTarget.closest<HTMLElement>('[data-trip-slug]');
        if (!card) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          id: event.pointerId,
          slug,
          card,
          top: card.getBoundingClientRect().top,
          offset: 0,
          start: event.clientY,
          y: event.clientY,
          target: slug,
          active: false,
          frame: 0,
          timer: setTimeout(() => {
            const current = gesture.current;
            if (!current) return;
            current.active = true;
            setDrag({ slug, target: slug });
            update();
          }, 320),
        };
      },
      onPointerMove(event: PointerEvent) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        if (!current.active && Math.abs(event.clientY - current.start) > 10) {
          finish(event, false);
          return;
        }
        current.y = event.clientY;
      },
      onPointerUp: (event: PointerEvent) => finish(event, true),
      onPointerCancel: (event: PointerEvent) => finish(event, false),
      onLostPointerCapture: (event: PointerEvent) => finish(event, false),
    };
  }
  return { list, drag, grip };
}
