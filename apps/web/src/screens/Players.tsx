import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../remote';
import { routeHref } from '../router';
import { useStore } from '../store';

const ROW_BUTTON = 'inline-flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60';

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-1">
      <span className="min-w-0 truncate font-medium">{name}</span>
      {children}
    </li>
  );
}

/** Where the table admin approves the people waiting and removes access from the approved. */
export function PlayersScreen() {
  const userId = useStore((s) => s.session?.userId ?? null);
  const isTableAdmin = useStore((s) => s.session?.profile?.isTableAdmin === true);
  const listProfiles = useStore((s) => s.listProfiles);
  const setApproved = useStore((s) => s.setApproved);
  /** Null until the players have loaded, and again if loading them fails. */
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadFailed(false);
    try {
      setProfiles(await listProfiles());
    } catch {
      setProfiles(null);
      setLoadFailed(true);
    }
  }, [listProfiles]);

  useEffect(() => {
    if (isTableAdmin) void load();
  }, [isTableAdmin, load]);

  async function change(id: string, approved: boolean): Promise<void> {
    setBusy(true);
    setChangeFailed(false);
    try {
      await setApproved(id, approved);
    } catch {
      setChangeFailed(true);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!isTableAdmin) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">Only the table admin can manage players.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }

  const waiting = profiles?.filter((p) => !p.approved) ?? [];
  const approved = profiles?.filter((p) => p.approved) ?? [];

  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">Players</h1>

      {loadFailed ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>Couldn't load the players.</p>
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 rounded-lg border border-red-300 bg-white px-3 py-1.5">
            Try again
          </button>
        </div>
      ) : null}
      {profiles === null && !loadFailed ? <p className="mt-4 text-slate-600">Loading…</p> : null}
      {changeFailed ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Couldn't change that. Try again.
        </p>
      ) : null}

      {profiles === null ? null : (
        <>
          <section aria-label="Waiting for approval" className="mt-6">
            <h2 className="font-medium">Waiting for approval</h2>
            {waiting.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Nobody is waiting.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {waiting.map((profile) => (
                  <Row key={profile.id} name={profile.displayName}>
                    <button
                      type="button"
                      aria-label={`Approve ${profile.displayName}`}
                      onClick={() => void change(profile.id, true)}
                      disabled={busy}
                      className={ROW_BUTTON}
                    >
                      Approve
                    </button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Approved" className="mt-6">
            <h2 className="font-medium">Approved</h2>
            <ul className="mt-3 space-y-2">
              {approved.map((profile) => (
                <Row key={profile.id} name={profile.displayName}>
                  {profile.id === userId ? (
                    <span className="shrink-0 text-sm text-slate-600">You</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove access for ${profile.displayName}`}
                      onClick={() => void change(profile.id, false)}
                      disabled={busy}
                      className={ROW_BUTTON}
                    >
                      Remove access
                    </button>
                  )}
                </Row>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
