import { useState } from 'react';
import { hasAccount } from '../remote';
import { routeHref } from '../router';
import { useStore } from '../store';

/**
 * All that a device shows while nobody is signed in on it. `local` is true for a build with no
 * account to talk to (local development), where the button signs in a stand-in player.
 */
export function SignInScreen({ local = !hasAccount(import.meta.env) }: { local?: boolean }) {
  const signIn = useStore((s) => s.signIn);
  const [busy, setBusy] = useState(false);

  async function start(): Promise<void> {
    setBusy(true);
    try {
      await signIn();
    } catch {
      // Nothing was signed in: the button comes back so the player can try again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mt-6 text-xl font-semibold">Character Wizard</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to see your characters on any device.</p>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="mt-6 min-h-11 w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {local ? 'Continue as test player' : 'Continue with Discord'}
      </button>
      {local ? <p className="mt-2 text-center text-xs text-slate-600">Local development: no account is used.</p> : null}
      <p className="mt-6 text-center text-sm">
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
      </p>
    </main>
  );
}
