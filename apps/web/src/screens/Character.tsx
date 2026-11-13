import { useEffect } from 'react';
import { routeHref, type View } from '../router';
import { useStore } from '../store';
import { CombatView } from '../views/CombatView';
import { ExploreView } from '../views/ExploreView';

const TAB = 'inline-flex min-h-11 items-center rounded-full px-3 py-1 text-sm';
const TAB_ON = `${TAB} bg-slate-900 text-white`;
const TAB_OFF = `${TAB} bg-slate-200 text-slate-800`;

/** One character: the header, the Combat or Explore view, and the pinned undo bar and turn button. */
export function CharacterScreen({ id, view }: { id: string; view: View }) {
  const open = useStore((s) => s.open);
  const known = useStore((s) => s.characters.some((c) => c.id === id));
  const openId = useStore((s) => s.openId);
  const sheet = useStore((s) => s.sheet);
  const undo = useStore((s) => s.undo);
  const undoLast = useStore((s) => s.undoLast);
  const startTurn = useStore((s) => s.startTurn);

  useEffect(() => {
    void open(id);
  }, [id, open]);

  if (!known) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">That character isn't on this device.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  if (openId !== id || !sheet) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;

  return (
    <main className="mx-auto max-w-md px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-3">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
          <h1 className="truncate text-lg font-semibold">{sheet.name}</h1>
          {sheet.classLine ? <p className="text-xs text-slate-600">{sheet.classLine}</p> : null}
        </div>
        <nav aria-label="View" className="flex shrink-0 gap-1">
          <a
            href={routeHref({ name: 'character', id, view: 'combat' })}
            aria-current={view === 'combat' ? 'page' : undefined}
            className={view === 'combat' ? TAB_ON : TAB_OFF}
          >
            Combat
          </a>
          <a
            href={routeHref({ name: 'character', id, view: 'explore' })}
            aria-current={view === 'explore' ? 'page' : undefined}
            className={view === 'explore' ? TAB_ON : TAB_OFF}
          >
            Explore
          </a>
        </nav>
      </header>

      {sheet.level === 0 ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          No class or level was found on this sheet, so most abilities are missing. Go back and re-import it.
        </p>
      ) : null}

      <div className="mt-3">{view === 'combat' ? <CombatView sheet={sheet} /> : <ExploreView sheet={sheet} />}</div>

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
