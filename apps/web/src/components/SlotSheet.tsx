import type { Ability } from '@cw/model';
import type { SlotOption } from '@cw/rules';

interface Props {
  ability: Ability;
  options: SlotOption[];
  onPick: (slotKey: string) => void;
  onCancel: () => void;
}

/** Asks which slot pays for a spell. Shown only when more than one could. */
export function SlotSheet({ ability, options, onPick, onCancel }: Props) {
  const title = `Cast ${ability.name} with`;
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-slate-900/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full rounded-t-2xl bg-white p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-medium">{title}</h2>
        <ul className="mt-2">
          {options.map((option) => (
            <li key={option.key} className="border-t border-slate-200">
              <button type="button" onClick={() => onPick(option.key)} className="flex w-full items-center justify-between py-3 text-left">
                <span>{option.label}</span>
                <span className="text-sm text-slate-600">{option.remaining} left</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onCancel} className="mt-2 w-full rounded-lg border border-slate-300 py-2">Cancel</button>
      </div>
    </div>
  );
}
