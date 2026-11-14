'use client';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  DndContext,
  closestCorners,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useAdmin } from '../lib/admin-context';
import type { Row } from '../lib/content';
export function OrderList({
  items,
  render,
  onReorder,
  disabled = false,
}: {
  items: Row[];
  render: (row: Row, index: number) => ReactNode;
  onReorder: (ids: string[]) => Promise<unknown>;
  disabled?: boolean;
}) {
  const { t, report, online, locale } = useAdmin(),
    [order, setOrder] = useState(items),
    [busy, setBusy] = useState(false),
    keyboardActive = useRef(false),
    keyboardTarget = useRef<string | null>(null);
  useEffect(() => setOrder(items), [items]);
  // Keyboard movement follows list order, not geometric proximity. Cards can
  // have different heights and scroll positions on phones/tablets/desktops.
  const keyboardCoordinates: KeyboardCoordinateGetter = (
    event,
    { context },
  ) => {
    const direction =
      event.code === 'ArrowUp' ? -1 : event.code === 'ArrowDown' ? 1 : 0;
    if (!direction || !context.active) return;
    event.preventDefault();
    const index = order.findIndex(
      (row) => row.id === (keyboardTarget.current ?? context.active!.id),
    );
    const next = order[index + direction];
    if (!next) return;
    const rect = context.droppableRects.get(next.id);
    if (!rect) return;
    keyboardTarget.current = next.id;
    return { x: rect.left, y: rect.top };
  };
  const position = (id: string | number) =>
    `${t('position')} ${new Intl.NumberFormat(locale).format(order.findIndex((row) => row.id === id) + 1)} / ${new Intl.NumberFormat(locale).format(order.length)}`;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );
  async function move(from: number, to: number) {
    if (disabled || busy || !online || from === to || from < 0 || to < 0)
      return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    setBusy(true);
    try {
      await onReorder(next.map((row) => row.id));
    } catch (error) {
      setOrder(items);
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        keyboardActive.current && keyboardTarget.current
          ? [{ id: keyboardTarget.current }]
          : closestCorners(args)
      }
      accessibility={{
        screenReaderInstructions: { draggable: t('keyboardReorder') },
        announcements: {
          onDragStart: ({ active }) => position(active.id),
          onDragOver: ({ over }) => (over ? position(over.id) : t('reorder')),
          onDragEnd: () => t('reorder'),
          onDragCancel: () => t('cancel'),
        },
      }}
      onDragStart={(event) => {
        keyboardActive.current = event.activatorEvent instanceof KeyboardEvent;
        keyboardTarget.current = String(event.active.id);
      }}
      onDragCancel={() => {
        keyboardActive.current = false;
        keyboardTarget.current = null;
      }}
      onDragEnd={(event) => {
        const target = keyboardActive.current
          ? keyboardTarget.current
          : event.over?.id;
        keyboardActive.current = false;
        keyboardTarget.current = null;
        if (target !== null && target !== undefined)
          void move(
            order.findIndex((row) => row.id === event.active.id),
            order.findIndex((row) => row.id === target),
          );
      }}
    >
      <SortableContext
        items={order.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="cards">
          {order.map((row, index) => (
            <SortableRow
              key={row.id}
              row={row}
              disabled={disabled || busy || !online}
            >
              <div className="section-header">
                <strong>{index + 1}</strong>
                {render(row, index)}
              </div>
              {!disabled && (
                <div className="row-controls">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || index === 0 || !online}
                    aria-label={t('up')}
                    onClick={() => void move(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || index === order.length - 1 || !online}
                    aria-label={t('down')}
                    onClick={() => void move(index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || index === 0 || !online}
                    onClick={() => void move(index, 0)}
                  >
                    {t('first')}
                  </button>
                </div>
              )}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
function SortableRow({
  row,
  children,
  disabled,
}: {
  row: Row;
  children: ReactNode;
  disabled: boolean;
}) {
  const { t } = useAdmin(),
    { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: row.id,
      disabled,
    });
  return (
    <article
      className="card"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!disabled && (
        <button
          type="button"
          className="icon-button drag-handle"
          aria-label={t('reorder')}
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
          aria-roledescription={t('reorder')}
        >
          <GripVertical aria-hidden />
        </button>
      )}
      {children}
    </article>
  );
}
