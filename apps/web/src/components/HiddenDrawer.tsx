import type { Ability } from '@cw/model';

interface Props {
  hidden: Ability[];
  onRestore: (ability: Ability) => void;
}

/** The abilities the player has hidden, folded away, each with a way back. Nothing when none is hidden. */
export function HiddenDrawer({ hidden, onRestore }: Props) {
  if (hidden.length === 0) return null;
  return (
    <details className="mt-4 border-t border-slate-200">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700">
        <span>{`Hidden (${hidden.length})`}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <ul>
        {hidden.map((ability) => (
          <li key={ability.key} className="flex items-center justify-between gap-2 border-t border-slate-200 py-1">
            <span className="min-w-0">{ability.name}</span>
            <button
              type="button"
              aria-label={`Restore ${ability.name}`}
              onClick={() => onRestore(ability)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
