'use client';
import { useMemo, type ReactNode, type CSSProperties } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from './dnd-modifiers';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';
import { Menu, type MenuItem } from './menu';

export function useSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

export function useDndAnnouncements(
  name: (id: string) => string,
  ids: string[],
) {
  const { t, locale } = useAdmin();
  const position = (id: string | number) =>
    t('positionOf', {
      name: name(String(id)),
      n: new Intl.NumberFormat(locale).format(ids.indexOf(String(id)) + 1),
      total: new Intl.NumberFormat(locale).format(ids.length),
    });
  return {
    // Rendered into <body> so the live region never ends up inside a <table>.
    ...(typeof document === 'undefined' ? {} : { container: document.body }),
    screenReaderInstructions: { draggable: t('keyboardReorder') },
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) =>
        position(active.id),
      onDragOver: ({ over }: { over: { id: string | number } | null }) =>
        over ? position(over.id) : '',
      onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
        over ? position(over.id) : t('reorderCancelled'),
      onDragCancel: () => t('reorderCancelled'),
    },
  };
}

export function DragHandle({
  attributes,
  listeners,
  label,
  disabled,
}: {
  attributes: object;
  listeners?: object | undefined;
  label: string;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      className="drag-handle"
      aria-label={label}
      disabled={disabled}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={20} aria-hidden />
    </button>
  );
}

function moveItems(
  t: (k: string) => string,
  index: number,
  length: number,
  move: (to: number) => void,
  onRemove?: () => void,
): MenuItem[] {
  return [
    {
      label: t('moveUp'),
      disabled: index === 0,
      onSelect: () => move(index - 1),
    },
    {
      label: t('moveDown'),
      disabled: index === length - 1,
      onSelect: () => move(index + 1),
    },
    { label: t('moveTop'), disabled: index === 0, onSelect: () => move(0) },
    ...(onRemove
      ? ([
          'separator',
          { label: t('remove'), tone: 'danger', onSelect: onRemove },
        ] as MenuItem[])
      : []),
  ];
}

/** Sortable list for editor forms: drag handle + ⋯ menu. No row numbers. */
export function SortableList<T>({
  items,
  getKey,
  onChange,
  render,
  onRemove,
  itemName,
  disabled = false,
  extraMenu,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  onChange: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  onRemove?: (index: number) => void;
  itemName: (item: T, index: number) => string;
  disabled?: boolean;
  extraMenu?: (item: T, index: number) => MenuItem[];
}) {
  const { t } = useAdmin(),
    sensors = useSortSensors(),
    ids = useMemo(() => items.map(getKey), [items, getKey]);
  const accessibility = useDndAnnouncements(
    (id) => itemName(items[ids.indexOf(id)]!, ids.indexOf(id)),
    ids,
  );
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    onChange(arrayMove(items, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={accessibility}
      onDragEnd={(event: DragEndEvent) => {
        if (!event.over) return;
        move(
          ids.indexOf(String(event.active.id)),
          ids.indexOf(String(event.over.id)),
        );
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="sortable-list">
          {items.map((item, index) => (
            <SortableItem
              key={ids[index]}
              id={ids[index]!}
              disabled={disabled}
              handleLabel={t('dragToReorder', { name: itemName(item, index) })}
              menu={
                disabled
                  ? null
                  : [
                      ...(extraMenu?.(item, index) ?? []),
                      ...moveItems(
                        t,
                        index,
                        items.length,
                        (to) => move(index, to),
                        onRemove ? () => onRemove(index) : undefined,
                      ),
                    ]
              }
              menuLabel={t('actionsFor', { name: itemName(item, index) })}
            >
              {render(item, index)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  disabled,
  children,
  handleLabel,
  menu,
  menuLabel,
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
  handleLabel: string;
  menu: MenuItem[] | null;
  menuLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={'sortable-item' + (isDragging ? ' dragging' : '')}
    >
      {!disabled && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={handleLabel}
        />
      )}
      <div className="sortable-content">{children}</div>
      {menu && <Menu items={menu} label={menuLabel} />}
    </li>
  );
}

/** Hook for sortable table rows (list pages). */
export function useSortableRow(id: string, disabled: boolean) {
  const sortable = useSortable({ id, disabled });
  return {
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
      position: 'relative',
      zIndex: sortable.isDragging ? 2 : undefined,
    } as CSSProperties,
  };
}

export {
  DndContext,
  SortableContext,
  verticalListSortingStrategy,
  closestCenter,
  arrayMove,
  moveItems,
};
