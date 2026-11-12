import { parseCharacterId } from '@cw/ddb-import';
import { useState, type FormEvent } from 'react';
import { IMPORT_MESSAGES, PRIVACY_HINT, fetchCharacter } from '../import/client';
import { navigate, routeHref } from '../router';
import { useStore } from '../store';

const NOT_A_CHARACTER = "That doesn't look like a D&D Beyond character.";

export function ImportScreen() {
  const saveImported = useStore((s) => s.saveImported);
  const [link, setLink] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const fail = (message: string, extra: string | null = null): void => {
    setError(message);
    setHint(extra);
  };

  /** Stores the raw JSON and opens the character, or says why it could not. */
  async function store(raw: unknown): Promise<void> {
    const record = await saveImported(raw);
    if (!record) return fail(NOT_A_CHARACTER);
    navigate({ name: 'character', id: record.id, view: 'combat' });
  }

  async function importByLink(event: FormEvent): Promise<void> {
    event.preventDefault();
    const id = parseCharacterId(link);
    if (id === null) return fail('Paste a D&D Beyond character link or its number.');
    setBusy(true);
    setError(null);
    setHint(null);
    const result = await fetchCharacter(id);
    setBusy(false);
    if (result.status === 'ok') return store(result.raw);
    fail(IMPORT_MESSAGES[result.status], result.status === 'private' ? PRIVACY_HINT : null);
  }

  async function importJson(text: string): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("That isn't valid JSON.");
    }
    await store(raw);
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">Add a character</h1>

      <form onSubmit={(event) => void importByLink(event)} className="mt-4">
        <label htmlFor="link" className="block text-sm font-medium">D&D Beyond character link or number</label>
        <input
          id="link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://www.dndbeyond.com/characters/123456789"
          inputMode="url"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
        <p className="mt-1 text-xs text-slate-600">The sheet's Character Privacy must be set to Public.</p>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </form>

      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>{error}</p>
          {hint ? <p className="mt-1">{hint}</p> : null}
        </div>
      ) : null}

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">Paste the character JSON instead</summary>
        <p className="mt-2 text-xs text-slate-600">
          Use this if the import can't reach D&D Beyond. Paste the JSON, or choose a saved file.
        </p>
        <label htmlFor="json" className="mt-2 block text-sm font-medium">Character JSON</label>
        <textarea
          id="json"
          value={json}
          onChange={(event) => setJson(event.target.value)}
          rows={5}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void importJson(json)}
          className="mt-2 w-full rounded-lg border border-slate-400 px-4 py-2 text-sm font-medium"
        >
          Use this JSON
        </button>
        <label htmlFor="file" className="mt-3 block text-sm font-medium">Or choose a JSON file</label>
        <input
          id="file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(importJson);
          }}
          className="mt-1 block w-full text-sm"
        />
      </details>
    </main>
  );
}
