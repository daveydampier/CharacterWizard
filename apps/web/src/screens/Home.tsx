import { useState } from 'react';
import { IMPORT_MESSAGES, fetchCharacter } from '../import/client';
import { routeHref } from '../router';
import { sheetFor, useStore } from '../store';
import type { StoredCharacter } from '../storage';

const importedOn = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

function CharacterCard({ character }: { character: StoredCharacter }) {
  const saveImported = useStore((s) => s.saveImported);
  const remove = useStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sheet = sheetFor(character);

  async function reimport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await fetchCharacter(character.ddbId);
    setBusy(false);
    if (result.status !== 'ok') {
      setMessage(`${IMPORT_MESSAGES[result.status]} Your saved copy still works.`);
      return;
    }
    const record = await saveImported(result.raw);
    setMessage(record ? 'Updated from D&D Beyond.' : "D&D Beyond didn't respond as expected. Your saved copy still works.");
  }

  function confirmRemove(): void {
    if (window.confirm(`Delete ${character.name} from this device? This can't be undone.`)) void remove(character.id);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <a href={routeHref({ name: 'character', id: character.id, view: 'combat' })} className="block">
        <span className="block text-lg font-medium">{character.name}</span>
        <span className="block text-sm text-slate-600">
          {[sheet.classLine, `Imported ${importedOn(character.importedAt)}`].filter((part) => part.trim() !== '').join(' · ')}
        </span>
      </a>
      <div className="mt-2 flex gap-3 text-sm">
        <button type="button" onClick={() => void reimport()} disabled={busy} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-1.5">
          {busy ? 'Updating…' : 'Re-import'}
        </button>
        <button type="button" onClick={confirmRemove} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-1.5 text-red-800">
          Delete
        </button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </li>
  );
}

export function HomeScreen() {
  const characters = useStore((s) => s.characters);
  const sorted = [...characters].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Your characters</h1>
      {sorted.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-medium">Add your first character</p>
          <p className="mt-1 text-sm text-slate-600">Bring a character in from D&D Beyond to see what they can do on their turn.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((character) => <CharacterCard key={character.id} character={character} />)}
        </ul>
      )}
      <a
        href={routeHref({ name: 'import' })}
        className="mt-4 block rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
      >
        Add a character
      </a>
      <p className="mt-6 text-center text-sm">
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
      </p>
    </main>
  );
}
