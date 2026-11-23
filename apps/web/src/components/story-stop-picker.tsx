'use client';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronDown, List, X } from 'lucide-react';
import type { PublicStory } from '@stella/shared/story';

export function StoryStopPicker({
  scenes,
  index,
  disabled,
  onSelect,
}: {
  scenes: PublicStory['scenes'];
  index: number;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    number = new Intl.NumberFormat(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const current = scenes[index]!;
  function show() {
    dialog.current?.showModal();
    setOpen(true);
  }
  return (
    <>
      <button
        type="button"
        className="stop-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('storyStops') + ' · ' + current.title.text}
        disabled={disabled}
        onClick={show}
      >
        <List size={17} />
        <span>{current.title.text}</span>
        <ChevronDown size={15} />
      </button>
      <dialog
        ref={dialog}
        className="stop-picker-dialog"
        aria-label={t('storyStops')}
        onClose={() => setOpen(false)}
        onKeyDown={(e) => e.stopPropagation()}
        onCancel={(e) => {
          e.stopPropagation();
          e.preventDefault();
          dialog.current?.close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        {open && (
          <div className="stop-picker-sheet">
            <div className="stop-picker-header">
              <h3>{t('storyStops')}</h3>
              <span>
                {number.format(index + 1)} / {number.format(scenes.length)}
              </span>
              <button
                type="button"
                aria-label={t('close')}
                onClick={() => dialog.current?.close()}
              >
                <X size={18} />
              </button>
            </div>
            <ol className="stop-picker-list">
              {scenes.map((scene, i) => (
                <li key={scene.id}>
                  <button
                    type="button"
                    aria-current={i === index ? 'step' : undefined}
                    ref={(node) => {
                      if (node && i === index) {
                        node.focus({ preventScroll: true });
                        node.scrollIntoView({ block: 'nearest' });
                      }
                    }}
                    onClick={() => {
                      dialog.current?.close();
                      onSelect(i);
                    }}
                  >
                    <img
                      src={scene.media.variants?.['480'] ?? scene.media.url}
                      loading="lazy"
                      alt=""
                    />
                    <span className="stop-number">{number.format(i + 1)}</span>
                    <span className="stop-name">{scene.title.text}</span>
                    {i === index && <Check size={18} />}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </dialog>
    </>
  );
}
