'use client';

import type { ReactNode, CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useRef, useState, useEffect } from 'react';
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 60,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const t = useTranslations();
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button
          type="button"
          aria-label={t('decrease', { label })}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus size={18} />
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={t('increase', { label })}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
export function Panel({
  open,
  onClose,
  title,
  children,
  kind = 'sheet',
  clip = null,
  returnTo = null,
  footer,
  onEscapeKeyDown,
  restored = false,
  immediateClose = false,
  scrollTop = 0,
  onPanelScroll,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  kind?: 'sheet' | 'collection' | 'trip' | 'builder';
  clip?: { top: number; right: number; bottom: number; left: number } | null;
  returnTo?: HTMLElement | null;
  footer?: ReactNode;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  restored?: boolean;
  immediateClose?: boolean;
  scrollTop?: number;
  onPanelScroll?: (scrollTop: number) => void;
}) {
  const t = useTranslations();
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement),
  );
  const start = useRef(0);
  const [closing, setClosing] = useState(false);
  const closeRequested = useRef(false);
  const restoreScroll = useCallback(
    (element: HTMLDivElement | null) => {
      if (element && scrollTop) element.scrollTop = scrollTop;
    },
    [scrollTop],
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const close = () => {
    if (closeRequested.current) return;
    closeRequested.current = true;
    if (
      immediateClose ||
      matchMedia('(prefers-reduced-motion:reduce)').matches
    ) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(onClose, 320);
  };
  const content = (
    <>
      {kind === 'sheet' && (
        <div
          className="drag-handle"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (e.clientY - start.current > 80) close();
          }}
        >
          <span />
        </div>
      )}
      <Dialog.Title className="sr-only">{title}</Dialog.Title>
      <button
        className="icon-button panel-close"
        aria-label={t('close')}
        onClick={close}
      >
        <X />
      </button>
      {children}
    </>
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={
            'scrim' +
            (restored ? ' restored' : '') +
            (closing ? ' closing' : '')
          }
        />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
          style={
            clip
              ? ({
                  '--clip-t': clip.top + 'px',
                  '--clip-r': clip.right + 'px',
                  '--clip-b': clip.bottom + 'px',
                  '--clip-l': clip.left + 'px',
                } as CSSProperties)
              : undefined
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnTo ?? returnFocus.current;
            requestAnimationFrame(() => {
              if (target?.isConnected) target.focus({ preventScroll: true });
            });
          }}
          className={
            'panel panel-' +
            kind +
            (footer ? ' panel-with-footer' : '') +
            (restored ? ' restored' : '') +
            (closing ? ' closing' : '')
          }
          onPointerDownOutside={() => close()}
        >
          {footer ? (
            <div
              className="panel-scroll"
              ref={restoreScroll}
              onScroll={(event) =>
                onPanelScroll?.(event.currentTarget.scrollTop)
              }
            >
              {content}
            </div>
          ) : (
            content
          )}
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
