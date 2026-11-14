'use client';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      tone?: 'danger';
      disabled?: boolean;
      icon?: ReactNode;
      checked?: boolean;
    }
  | 'separator';

/** Accessible dropdown menu (button + role=menu, arrow keys, Esc, outside click). */
export function Menu({
  items,
  label,
  trigger,
  align = 'end',
  triggerClass = 'icon-btn',
}: {
  items: MenuItem[];
  label?: string;
  trigger?: ReactNode;
  align?: 'start' | 'end';
  triggerClass?: string;
}) {
  const { t } = useAdmin(),
    [open, setOpen] = useState(false),
    id = useId(),
    root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null);
  const visible = items.filter(Boolean);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus(),
    );
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);
  const onKey = (event: KeyboardEvent) => {
    const nodes = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (event.key === 'Tab') setOpen(false);
  };
  return (
    <div
      className="menu-root"
      ref={root}
      onKeyDown={onKey}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={button}
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={trigger ? undefined : (label ?? t('moreActions'))}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger ?? <MoreHorizontal aria-hidden size={20} />}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          className={'menu menu-' + align}
          aria-label={label ?? t('moreActions')}
        >
          {visible.map((item, index) =>
            item === 'separator' ? (
              <div key={index} role="separator" className="menu-sep" />
            ) : (
              <button
                key={index}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                className={'menu-item' + (item.tone ? ' danger' : '')}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.checked && (
                  <span className="menu-check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
