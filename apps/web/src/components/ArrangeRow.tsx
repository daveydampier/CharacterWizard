import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

const ICON = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 disabled:text-slate-300';
const TEXT = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-indigo-700';

interface Props {
  /** The ability's or feature's key: what the row is sorted by. */
  id: string;
  /** The name the row and its buttons are known by. */
  label: string;
  /** What the row says, where that is not its label: a feature's plain name under its heading. */
  text?: string;
  first: boolean;
  last: boolean;
  /** -1 moves the row up one place, 1 down one. */
  onStep: (direction: -1 | 1) => void;
  onEdit: () => void;
  onHide: () => void;
  /** Shown under the row, across its whole width, and dragged with it. */
  children?: ReactNode;
}

/**
 * One row while arranging: a handle to drag it by, its name, and buttons that move, edit and hide
 * it. It has no Use button, so nothing is spent by a stray tap.
 */
export function ArrangeRow({ id, label, text = label, first, last, onStep, onEdit, onHide, children }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      aria-label={label}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-x-1 border-t border-slate-200 bg-slate-50 py-1 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      {/* Only the handle starts a drag, so the list still scrolls under a finger anywhere else. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}`}
        className={`${ICON} cursor-grab touch-none text-lg`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="min-w-0 flex-1 font-medium">{text}</span>
      <span className="ml-auto flex items-center">
        <button type="button" aria-label={`Move ${label} up`} disabled={first} onClick={() => onStep(-1)} className={ICON}>
          <span aria-hidden="true">▲</span>
        </button>
        <button type="button" aria-label={`Move ${label} down`} disabled={last} onClick={() => onStep(1)} className={ICON}>
          <span aria-hidden="true">▼</span>
        </button>
        <button type="button" aria-label={`Edit ${label}`} onClick={onEdit} className={TEXT}>Edit</button>
        <button type="button" aria-label={`Hide ${label}`} onClick={onHide} className={TEXT}>Hide</button>
      </span>
      {children ? <div className="basis-full">{children}</div> : null}
    </li>
  );
}
