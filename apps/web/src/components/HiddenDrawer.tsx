interface Props<T> {
  hidden: T[];
  /** The name each row is shown and known by. The caller chooses it, so that two rows with the same name can be told apart. */
  label: (row: T) => string;
  onRestore: (row: T) => void;
}

/** The abilities or features that are hidden, folded away, each with a way back. Nothing when none is hidden. */
export function HiddenDrawer<T extends { key: string }>({ hidden, label, onRestore }: Props<T>) {
  if (hidden.length === 0) return null;
  return (
    <details className="mt-4 border-t border-slate-200">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700">
        <span>{`Hidden (${hidden.length})`}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <ul>
        {hidden.map((row) => {
          const name = label(row);
          return (
            <li key={row.key} className="flex items-center justify-between gap-2 border-t border-slate-200 py-1">
              <span className="min-w-0">{name}</span>
              <button
                type="button"
                aria-label={`Restore ${name}`}
                onClick={() => onRestore(row)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium"
              >
                Restore
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
