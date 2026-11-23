import type { Ability } from '@cw/model';
import type { SlotOption } from '@cw/rules';
import { Dialog } from './Dialog';

interface Props {
  ability: Ability;
  options: SlotOption[];
  onPick: (slotKey: string) => void;
  onCancel: () => void;
}

/** Asks which slot pays for a spell. Shown only when more than one could. */
export function SlotSheet({ ability, options, onPick, onCancel }: Props) {
  return (
    <Dialog title={`Cast ${ability.name} with`} onClose={onCancel}>
      <ul className="mt-2">
        {options.map((option) => (
          <li key={option.key} className="border-t border-slate-200">
            <button type="button" onClick={() => onPick(option.key)} className="flex min-h-11 w-full items-center justify-between py-3 text-left">
              <span>{option.label}</span>
              <span className="text-sm text-slate-600">{option.remaining} left</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 py-2">Cancel</button>
    </Dialog>
  );
}
