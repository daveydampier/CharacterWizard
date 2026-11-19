import { useState } from 'react';
import { useStore } from '../store';

const PRIMARY = 'min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60';
const SECONDARY = 'min-h-11 rounded-lg border border-slate-300 px-4 py-2';

/**
 * All that a signed-in player sees until a table admin has approved them, or, before that, until
 * the account has said who they are.
 */
export function WaitingScreen() {
  const profile = useStore((s) => s.session?.profile ?? null);
  const syncNow = useStore((s) => s.syncNow);
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setChecked(false);
    await syncNow();
    setBusy(false);
    setChecked(true);
  }

  // A device used before accounts existed may hold characters the account has never been sent,
  // and an unapproved player cannot send them. Signing out would remove them, so it asks first.
  async function leaveNow(): Promise<void> {
    if (await signOut()) return;
    if (window.confirm("Some changes haven't synced yet. Sign out and discard them?")) await signOut(true);
  }

  const leave = (
    <button type="button" onClick={() => void leaveNow()} className={SECONDARY}>Sign out</button>
  );

  if (!profile) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="mt-6 text-xl font-semibold">Checking your account</h1>
        <p className="mt-2 text-sm text-slate-600">This needs a connection.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => void check()} disabled={busy} className={PRIMARY}>Try again</button>
          {leave}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mt-6 text-xl font-semibold">Waiting for your DM to approve you</h1>
      <p className="mt-2 text-sm text-slate-600">Signed in as {profile.displayName}.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => void check()} disabled={busy} className={PRIMARY}>Check again</button>
        {leave}
      </div>
      {checked && !busy ? <p role="status" className="mt-3 text-sm text-slate-700">Still waiting.</p> : null}
    </main>
  );
}
