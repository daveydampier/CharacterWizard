import { useEffect, useState } from 'react';
import { IMPORT_MESSAGES } from '../import/client';
import { routeHref } from '../router';
import { sheetFor, useStore, type SyncState } from '../store';
import type { StoredCharacter } from '../storage';

const SYNC_LINE: Record<SyncState, string> = {
  saved: 'Saved to your account',
  waiting: 'Waiting to sync',
  signin: 'Sign in again to sync',
  limit: 'Your account has ten characters. Delete one so the rest can sync.',
};

const SMALL_BUTTON = 'inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-1.5';

const importedOn = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const byName = (a: StoredCharacter, b: StoredCharacter): number => a.name.localeCompare(b.name);

/** One character. `detail` follows its class and level: when it was imported, or whose it is. */
function CharacterCard({ character, detail }: { character: StoredCharacter; detail: string }) {
  const importCharacter = useStore((s) => s.importCharacter);
  const saveImported = useStore((s) => s.saveImported);
  const remove = useStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A record whose sheet cannot be built still gets a card, so that it can be re-imported or deleted.
  let classLine = '';
  try {
    classLine = sheetFor(character).classLine;
  } catch {
    classLine = '';
  }

  async function reimport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await importCharacter(character.ddbId);
    setBusy(false);
    if (result.status !== 'ok') {
      setMessage(`${IMPORT_MESSAGES[result.status]} Your saved copy still works.`);
      return;
    }
    // Named by its own ID, so that a table admin updates the player's copy and does not make one of their own.
    const record = await saveImported(result.raw, character.id);
    setMessage(record ? 'Updated from D&D Beyond.' : "D&D Beyond didn't respond as expected. Your saved copy still works.");
  }

  function confirmRemove(): void {
    const question = `Delete ${character.name}? It will be removed from the account and from every device. This can't be undone.`;
    if (window.confirm(question)) void remove(character.id);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <a href={routeHref({ name: 'character', id: character.id, view: 'combat' })} className="block">
        <span className="block text-lg font-medium">{character.name}</span>
        <span className="block text-sm text-slate-600">
          {[classLine, detail].filter((part) => part.trim() !== '').join(' · ')}
        </span>
      </a>
      <div className="mt-2 flex gap-3 text-sm">
        {character.ddbId === '0' ? null : (
          <button type="button" onClick={() => void reimport()} disabled={busy} className={SMALL_BUTTON}>
            {busy ? 'Updating…' : 'Re-import'}
          </button>
        )}
        <button type="button" onClick={confirmRemove} className={`${SMALL_BUTTON} text-red-800`}>
          Delete
        </button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </li>
  );
}

/** Whether the account has what this device holds, and the way back in when the session has ended. */
function SyncLine() {
  const syncState = useStore((s) => s.syncState);
  const signIn = useStore((s) => s.signIn);
  return (
    <div className="mt-1 flex items-center gap-3 text-sm text-slate-600">
      <p role="status">{SYNC_LINE[syncState]}</p>
      {syncState === 'signin' ? (
        <button type="button" onClick={() => void signIn().catch(() => undefined)} className={SMALL_BUTTON}>Sign in</button>
      ) : null}
    </div>
  );
}

function SignOutButton() {
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  async function leave(): Promise<void> {
    setBusy(true);
    try {
      // Signing out removes this device's copy, so it is refused while a change has not been sent.
      if (await signOut()) return;
      if (window.confirm("Some changes haven't synced yet. Sign out and discard them?")) await signOut(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => void leave()} disabled={busy} className={`${SMALL_BUTTON} disabled:opacity-60`}>
      Sign out
    </button>
  );
}

export function HomeScreen() {
  const characters = useStore((s) => s.characters);
  const userId = useStore((s) => s.session?.userId ?? null);
  const isTableAdmin = useStore((s) => s.session?.profile?.isTableAdmin === true);
  const listProfiles = useStore((s) => s.listProfiles);
  /** Display names by user ID. Empty for a player, and for an admin until, or unless, the players load. */
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!isTableAdmin) return undefined;
    let current = true;
    listProfiles().then(
      (profiles) => {
        if (current) setNames(new Map(profiles.map((p) => [p.id, p.displayName])));
      },
      // The table is still listed, without its owners' names.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [isTableAdmin, listProfiles]);

  const own = characters.filter((c) => c.ownerId === userId).sort(byName);
  const table = isTableAdmin ? characters.filter((c) => c.ownerId !== userId).sort(byName) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Your characters</h1>
      <SyncLine />
      {own.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-medium">Add your first character</p>
          <p className="mt-1 text-sm text-slate-600">Bring a character in from D&D Beyond to see what they can do on their turn.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {own.map((character) => (
            <CharacterCard key={character.id} character={character} detail={`Imported ${importedOn(character.importedAt)}`} />
          ))}
        </ul>
      )}
      <a
        href={routeHref({ name: 'import' })}
        className="mt-4 block rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
      >
        Add a character
      </a>
      {table.length === 0 ? null : (
        <section aria-label="Table" className="mt-8">
          <h2 className="font-medium">Table</h2>
          <ul className="mt-3 space-y-3">
            {table.map((character) => (
              <CharacterCard key={character.id} character={character} detail={names.get(character.ownerId ?? '') ?? ''} />
            ))}
          </ul>
        </section>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
        {isTableAdmin ? (
          <a href={routeHref({ name: 'players' })} className="inline-flex min-h-11 items-center text-indigo-700">Players</a>
        ) : null}
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
        <SignOutButton />
      </div>
    </main>
  );
}
