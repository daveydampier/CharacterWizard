import { useState } from 'react';
import { hasAccount } from '../remote';
import { routeHref } from '../router';
import { useStore } from '../store';

/**
 * All that a device shows while nobody is signed in on it. `local` is true for a build with no
 * account to talk to (local development), where the button signs in a stand-in player.
 * `production` is true for a built site, where having no account to talk to is a mistake in how
 * the site was built.
 */
export function SignInScreen({
  local = !hasAccount(import.meta.env),
  production = import.meta.env.PROD,
}: { local?: boolean; production?: boolean }) {
  const signIn = useStore((s) => s.signIn);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start(): Promise<void> {
    setFailed(false);
    setBusy(true);
    try {
      await signIn();
    } catch {
      // Sign-in could not start: say so, and bring the button back so the player can try again.
      setFailed(true);
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
      {failed ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Couldn't start sign-in. Check your connection, then try again.
        </p>
      ) : null}
      {local && production ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          This site was built without its account settings, so nothing here is saved to an account. Tell whoever runs the site.
        </p>
      ) : null}
      {local && !production ? <p className="mt-2 text-center text-xs text-slate-600">Local development: no account is used.</p> : null}
      <p className="mt-6 text-center text-sm">
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
      </p>
    </main>
  );
}
