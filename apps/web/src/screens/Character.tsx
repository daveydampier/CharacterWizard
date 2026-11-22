import { useEffect, useState } from 'react';
import { routeHref, type View } from '../router';
import { useStore } from '../store';
import { CombatView } from '../views/CombatView';
import { ExploreView } from '../views/ExploreView';
import { FeaturesView } from '../views/FeaturesView';

const TAB = 'inline-flex min-h-11 items-center justify-center rounded-full px-3 py-1 text-sm';
const TAB_ON = `${TAB} bg-slate-900 text-white`;
const TAB_OFF = `${TAB} bg-slate-200 text-slate-800`;

const VIEWS: { view: View; label: string }[] = [
  { view: 'combat', label: 'Combat' },
  { view: 'explore', label: 'Explore' },
  { view: 'features', label: 'Features' },
];

/** One character: the header, the Combat, Explore or Features view, and the pinned undo bar and turn button. */
export function CharacterScreen({ id, view }: { id: string; view: View }) {
  const open = useStore((s) => s.open);
  const known = useStore((s) => s.characters.some((c) => c.id === id));
  const openId = useStore((s) => s.openId);
  const sheet = useStore((s) => s.sheet);
  const loaded = useStore((s) => s.loaded);
  const undo = useStore((s) => s.undo);
  const undoLast = useStore((s) => s.undoLast);
  const startTurn = useStore((s) => s.startTurn);

  /** The character that `open` has finished with and left closed, although it is on this device. */
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const settled = (): void => {
      if (current) setFailedId(useStore.getState().openId === id ? null : id);
    };
    void open(id).then(settled, settled);
    return () => {
      current = false;
    };
  }, [id, open]);

  if (!known) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">That character isn't on this device.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  if (failedId === id) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">This character couldn't be opened.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  // Nothing can be tapped until the saved play state has been read, so nothing is shown until then.
  if (openId !== id || !sheet || !loaded) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;

  return (
    <main className="mx-auto max-w-md px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-3">
      <header>
        <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
        <h1 className="truncate text-lg font-semibold">{sheet.name}</h1>
        {sheet.classLine ? <p className="text-xs text-slate-600">{sheet.classLine}</p> : null}
        {/* Three choices do not fit beside the name on a phone, so they get a row of their own. */}
        <nav aria-label="View" className="mt-2 grid grid-cols-3 gap-1">
          {VIEWS.map((item) => (
            <a
              key={item.view}
              href={routeHref({ name: 'character', id, view: item.view })}
              aria-current={view === item.view ? 'page' : undefined}
              className={view === item.view ? TAB_ON : TAB_OFF}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      {sheet.level === 0 ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          No class or level was found on this sheet, so most abilities are missing. Go back and re-import it.
        </p>
      ) : null}

      <div className="mt-3">
        {view === 'combat' ? <CombatView sheet={sheet} /> : null}
        {view === 'explore' ? <ExploreView sheet={sheet} /> : null}
        {view === 'features' ? <FeaturesView sheet={sheet} /> : null}
      </div>

      {undo || view === 'combat' ? (
        <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md space-y-2 bg-slate-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {undo ? (
            <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-0.5 text-sm text-white">
              <span className="py-1.5">{undo.message}</span>
              <button type="button" onClick={undoLast} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center font-medium underline">Undo</button>
            </p>
          ) : null}
          {view === 'combat' ? (
            <button type="button" onClick={startTurn} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white">
              Start my turn
            </button>
          ) : null}
        </footer>
      ) : null}
    </main>
  );
}
