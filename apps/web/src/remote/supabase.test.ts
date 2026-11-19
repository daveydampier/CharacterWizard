import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_USER, defaultRemote, hasAccount } from './index';
import { supabaseRemote } from './supabase';

const ENV = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_test' };

interface Answer { data: unknown; error: { code?: string; message?: string } | null; status?: number }

/** What supabase-js's auth calls resolve with when they fail. They do not throw. */
interface AuthProblem { message?: string; status?: number }

/**
 * A stand-in for the supabase-js client that records each data call as a line of text
 * ("from characters select * gt rev 5 order rev") and answers with whatever the test queued.
 */
function fakeClient(session: { userId: string; token: string } | null = { userId: 'user-ann', token: 'user-token' }) {
  const calls: string[] = [];
  const answers: Answer[] = [];
  let authListener: (event: string, session: unknown) => void = () => undefined;
  const sessionData = () => ({
    data: { session: session ? { user: { id: session.userId }, access_token: session.token } : null }, error: null,
  });

  const builder = (parts: string[]) => {
    const next = (...more: unknown[]) => builder([...parts, ...more.map(String)]);
    const settle = (): Promise<Answer> => {
      calls.push(parts.join(' '));
      return Promise.resolve(answers.shift() ?? { data: null, error: null, status: 200 });
    };
    return {
      select: (columns: string) => next('select', columns),
      eq: (column: string, value: unknown) => next('eq', column, value),
      gt: (column: string, value: unknown) => next('gt', column, value),
      order: (column: string) => next('order', column),
      maybeSingle: () => next('maybeSingle'),
      then: (resolve: (answer: Answer) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
    };
  };

  const auth = {
    getSession: vi.fn(async () => sessionData()),
    onAuthStateChange: vi.fn((listener: typeof authListener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }),
    signInWithOAuth: vi.fn(async (_options: unknown): Promise<{ data: unknown; error: AuthProblem | null }> => ({ data: {}, error: null })),
    signOut: vi.fn(async (_options: unknown): Promise<{ error: AuthProblem | null }> => ({ error: null })),
  };

  const client = {
    auth,
    from: (table: string) => builder(['from', table]),
    rpc: (name: string, args: unknown) => builder(['rpc', name, JSON.stringify(args)]),
  };

  return {
    client: client as unknown as SupabaseClient,
    auth,
    calls,
    answer: (data: unknown, status = 200) => answers.push({ data, error: null, status }),
    fail: (error: { code?: string; message?: string }, status?: number) => answers.push({ data: null, error, status }),
    emit: (userId: string | null) => authListener('TOKEN_REFRESHED', userId ? { user: { id: userId } } : null),
  };
}

async function started(fake = fakeClient()) {
  const remote = supabaseRemote(fake.client, ENV);
  const seen: (string | null)[] = [];
  await remote.start((userId) => seen.push(userId));
  return { fake, remote, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('supabaseRemote: who is signed in', () => {
  it('reports the stored session at start, then only changes', async () => {
    const { fake, seen } = await started();
    expect(seen).toEqual(['user-ann']);
    fake.emit('user-ann');
    fake.emit('user-ann');
    expect(seen).toEqual(['user-ann']);
    fake.emit(null);
    fake.emit('user-ben');
    expect(seen).toEqual(['user-ann', null, 'user-ben']);
  });

  it('reports null at start when nobody is signed in', async () => {
    const { seen } = await started(fakeClient(null));
    expect(seen).toEqual([null]);
  });

  it('signs in with Discord and comes back to this page without its hash', async () => {
    const { fake, remote } = await started(fakeClient(null));
    window.location.hash = '#/import';
    await remote.signIn();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
  });

  it('signs out of this device only', async () => {
    const { fake, remote } = await started();
    await remote.signOut();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects when sign-in cannot start, so the screen can say so', async () => {
    const { fake, remote } = await started(fakeClient(null));
    fake.auth.signInWithOAuth.mockResolvedValueOnce({
      data: {}, error: { message: 'Unsupported provider: provider is not enabled', status: 400 },
    });
    await expect(remote.signIn()).rejects.toMatchObject({ name: 'RemoteError', kind: 'other' });
  });

  it('rejects as offline when sign-in cannot reach the account', async () => {
    const { fake, remote } = await started(fakeClient(null));
    fake.auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: 'TypeError: Failed to fetch', status: 0 } });
    await expect(remote.signIn()).rejects.toMatchObject({ name: 'RemoteError', kind: 'offline' });
  });

  it('rejects when signing out fails', async () => {
    const { fake, remote } = await started();
    fake.auth.signOut.mockResolvedValueOnce({ error: { message: 'boom', status: 500 } });
    await expect(remote.signOut()).rejects.toMatchObject({ name: 'RemoteError', kind: 'other' });
  });

  it('refuses data calls while signed out, without asking', async () => {
    const { fake, remote } = await started(fakeClient(null));
    await expect(remote.profile()).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(remote.pullCharacters(0)).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fake.calls).toEqual([]);
  });
});

describe('supabaseRemote: data', () => {
  it('reads the signed-in user\'s own profile', async () => {
    const { fake, remote } = await started();
    fake.answer({ id: 'user-ann', display_name: 'Ann', approved: true, is_table_admin: false });
    expect(await remote.profile()).toEqual({ id: 'user-ann', displayName: 'Ann', approved: true, isTableAdmin: false });
    expect(fake.calls).toEqual(['from profiles select * eq id user-ann maybeSingle']);
  });

  it('returns null when the profile does not exist yet', async () => {
    const { fake, remote } = await started();
    fake.answer(null);
    expect(await remote.profile()).toBeNull();
  });

  it('lists profiles by name and approves through the database function', async () => {
    const { fake, remote } = await started();
    fake.answer([{ id: 'a', display_name: 'Ann', approved: true, is_table_admin: false }]);
    expect((await remote.listProfiles()).map((p) => p.displayName)).toEqual(['Ann']);
    await remote.setApproved('user-new', true);
    expect(fake.calls).toEqual([
      'from profiles select * order display_name',
      'rpc set_player_approved {"player":"user-new","value":true}',
    ]);
  });

  it('sends characters through push_characters and returns what was rejected', async () => {
    const { fake, remote } = await started();
    fake.answer([{ id: 'c2', reason: 'limit' }]);
    const result = await remote.pushCharacters([{
      id: 'c1', ddbId: '42', name: 'Vlad', rawJson: { data: 1 }, importedAt: 'T1', updatedAt: 'T2', deleted: false,
    }]);
    expect(result).toEqual({ rejected: [{ id: 'c2', reason: 'limit' }] });
    expect(fake.calls).toEqual([
      'rpc push_characters {"rows":[{"id":"c1","ddb_character_id":"42","name":"Vlad","raw_json":{"data":1},"imported_at":"T1","updated_at":"T2","deleted":false}]}',
    ]);
  });

  it('sends items through push_items', async () => {
    const { fake, remote } = await started();
    await remote.pushItems([{ characterId: 'c1', kind: 'play', key: 'state', data: { spent: {} }, updatedAt: 'T1', deleted: false }]);
    expect(fake.calls).toEqual([
      'rpc push_items {"rows":[{"character_id":"c1","kind":"play","key":"state","data":{"spent":{}},"updated_at":"T1","deleted":false}]}',
    ]);
  });

  it('fetches rows after a rev, in rev order, and maps them', async () => {
    const { fake, remote } = await started();
    fake.answer([{
      id: 'c1', owner_id: 'user-ann', ddb_character_id: '42', name: 'Vlad', raw_json: { data: 1 },
      imported_at: '2026-01-01T10:00:00+00:00', updated_at: '2026-01-02T10:00:00.123456+00:00', deleted: false, rev: 7,
    }]);
    fake.answer([{ character_id: 'c1', kind: 'edit', key: 'k', data: { hidden: true }, updated_at: '2026-01-02T10:00:00+00:00', deleted: false, rev: 8 }]);
    expect(await remote.pullCharacters(5)).toEqual([{
      id: 'c1', ownerId: 'user-ann', ddbId: '42', name: 'Vlad', rawJson: { data: 1 },
      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.123Z', deleted: false, rev: 7,
    }]);
    expect(await remote.pullItems(5)).toEqual([{
      characterId: 'c1', kind: 'edit', key: 'k', data: { hidden: true }, updatedAt: '2026-01-02T10:00:00.000Z', deleted: false, rev: 8,
    }]);
    expect(fake.calls).toEqual([
      'from characters select * gt rev 5 order rev',
      'from character_items select * gt rev 5 order rev',
    ]);
  });
});

describe('supabaseRemote: failures', () => {
  it.each([
    ['a refusal by the database', { code: '42501', message: 'not allowed' }, 403, 'refused'],
    ['an expired token', { code: 'PGRST301', message: 'JWT expired' }, 401, 'unauthorized'],
    ['any other 401', { message: 'Unauthorized' }, 401, 'unauthorized'],
    ['a request that never got an answer', { message: 'TypeError: Failed to fetch' }, 0, 'offline'],
    ['an answer with no status at all', { message: 'something' }, undefined, 'offline'],
    ['a server error', { code: 'XX000', message: 'boom' }, 500, 'other'],
  ] as const)('turns %s into a RemoteError', async (_label, error, status, kind) => {
    const { fake, remote } = await started();
    fake.fail(error, status);
    await expect(remote.pullItems(0)).rejects.toMatchObject({ name: 'RemoteError', kind });
  });
});

describe('supabaseRemote: import', () => {
  it('calls the import function with the publishable key and the user\'s token', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ status: 'ok', raw: { data: { id: 42 } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { remote } = await started();
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://abc.supabase.co/functions/v1/import-character');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json', apikey: 'sb_publishable_test', Authorization: 'Bearer user-token',
    });
  });

  it('answers unauthorized without calling when there is no session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { remote } = await started(fakeClient(null));
    expect(await remote.importCharacter('42')).toEqual({ status: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('defaultRemote', () => {
  it('knows whether the build has a Supabase project', () => {
    expect(hasAccount(ENV)).toBe(true);
    expect(hasAccount({})).toBe(false);
    expect(hasAccount({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBe(false);
  });

  it('is an in-memory account in local development, where sign-in makes an approved admin', async () => {
    const remote = defaultRemote({});
    const seen: (string | null)[] = [];
    await remote.start((userId) => seen.push(userId));
    await remote.signIn();
    expect(seen).toEqual([null, DEV_USER.id]);
    expect(await remote.profile()).toEqual({ id: DEV_USER.id, displayName: 'Test player', approved: true, isTableAdmin: true });
  });

  it('keeps the stand-in player signed in across a reload, and signed out after signing out', async () => {
    const first = defaultRemote({});
    await first.start(() => undefined);
    await first.signIn();
    // A reload: a new account in memory, the same browser.
    const second = defaultRemote({});
    const seen: (string | null)[] = [];
    await second.start((userId) => seen.push(userId));
    expect(seen).toEqual([DEV_USER.id]);
    expect((await second.profile())?.approved).toBe(true);
    await second.signOut();
    const third = defaultRemote({});
    const after: (string | null)[] = [];
    await third.start((userId) => after.push(userId));
    expect(after).toEqual([null]);
  });

  it('sends a local import to the dev server', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ status: 'ok', raw: { data: { id: 42 } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const remote = defaultRemote({});
    await remote.start(() => undefined);
    await remote.signIn();
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    expect(fetchMock.mock.calls[0][0]).toBe('/functions/v1/import-character');
  });
});
