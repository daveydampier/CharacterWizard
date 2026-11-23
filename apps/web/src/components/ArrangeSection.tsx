import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { ArrangeRow } from './ArrangeRow';

/** One row of a section: an ability's or a feature's key, and the name it is known by. */
export interface ArrangeItem {
  key: string;
  label: string;
  /** What the row says, where that is not its label. */
  text?: string;
  /** Shown under the row and moved with it: a feature's options. */
  below?: ReactNode;
}

interface Props {
  title: string;
  items: ArrangeItem[];
  /** The row with `activeKey` was dropped on, or stepped onto, the row with `overKey`. Both are in this section. */
  onMove: (activeKey: string, overKey: string) => void;
  onEdit: (key: string) => void;
  onHide: (key: string) => void;
}

/** A dragged row moves up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * One group of rows that can be put in order, by dragging a row's handle or with its buttons.
 * Each section is a drag area of its own, so a row cannot leave its section.
 */
export function ArrangeSection({ title, items, onMove, onEdit, onHide }: Props) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map((item) => item.key);
  const labelOf = (id: UniqueIdentifier): string => items.find((item) => item.key === id)?.label ?? 'the row';
  const place = (id: UniqueIdentifier): string => `position ${keys.indexOf(String(id)) + 1} of ${keys.length}`;

  /** What a screen reader says during a drag: the row's name, not its key. */
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is at ${place(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${labelOf(active.id)} at ${place(over.id)}.` : `Dropped ${labelOf(active.id)}.`),
    onDragCancel: ({ active }) => `Put ${labelOf(active.id)} back.`,
  };

  function dropped({ active, over }: DragEndEvent): void {
    if (over && over.id !== active.id) onMove(String(active.id), String(over.id));
  }

  return (
    <section aria-label={title} className="mt-4">
      <h2 className="text-sm font-medium text-slate-700">{title}</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[vertical]}
        accessibility={{ announcements }}
        onDragEnd={dropped}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul>
            {items.map(({ key, label, text, below }, index) => (
              <ArrangeRow
                key={key}
                id={key}
                label={label}
                text={text}
                first={index === 0}
                last={index === items.length - 1}
                onStep={(direction) => onMove(key, keys[index + direction])}
                onEdit={() => onEdit(key)}
                onHide={() => onHide(key)}
              >
                {below}
              </ArrangeRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
