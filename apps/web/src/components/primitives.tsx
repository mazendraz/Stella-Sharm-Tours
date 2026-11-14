'use client';

import type { ReactNode, CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState, useEffect } from 'react';
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  kind?: 'sheet' | 'collection' | 'trip' | 'builder';
  clip?: { top: number; right: number; bottom: number; left: number } | null;
  returnTo?: HTMLElement | null;
}) {
  const t = useTranslations();
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement),
  );
  const start = useRef(0);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      () => {
        onClose();
        setClosing(false);
      },
      matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 320,
    );
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={'scrim ' + (closing ? 'closing' : '')} />
        <Dialog.Content
          aria-describedby={undefined}
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
          className={'panel panel-' + kind + (closing ? ' closing' : '')}
          onPointerDownOutside={() => close()}
        >
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
