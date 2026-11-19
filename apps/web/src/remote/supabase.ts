import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCharacter, importEndpoint, type ImportEnv } from '../import/client';
import {
  characterFromRow, characterToRow, itemFromRow, itemToRow, profileFromRow, rejectedFromJson, remoteErrorFrom,
} from './rows';
import { RemoteError, type Remote } from './types';

type Row = Record<string, unknown>;

/** What every supabase-js data call resolves to. The client reports failures here; it does not throw. */
interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status?: number;
}

/** A failure as a RemoteError. A request that never got an answer has no status, or status 0. */
function failure(answer: Answer): RemoteError {
  const message = answer.error?.message ?? '';
  if (!answer.status || /failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return new RemoteError('offline', message);
  }
  return remoteErrorFrom({ code: answer.error?.code, status: answer.status, message });
}

/** How long a data call may go without an answer before it counts as no connection. */
export const CALL_LIMIT_MS = 20_000;
/** How long start-up waits to learn who is signed in before it carries on without knowing. */
export const START_LIMIT_MS = 8_000;
/** How many rows one request asks for. A character row carries a whole sheet. */
export const CHARACTER_PAGE = 5;
export const ITEM_PAGE = 500;
/** The most requests one fetch makes of a table. The next sync continues from where it stopped. */
const MAX_PAGES = 20;

const timedOut = Symbol('timed out');

/** The call's own result, or `timedOut` if it has not settled within `ms`. The call is left to end on its own. */
function within<T>(call: PromiseLike<T>, ms: number): Promise<T | typeof timedOut> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(timedOut), ms);
    Promise.resolve(call).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The data of an answer; rejects with a RemoteError if the call failed, could not be made, or
 * got no answer in time. Without the limit one stalled request would hold up every later sync.
 */
async function unwrap(call: PromiseLike<Answer>): Promise<unknown> {
  let answer: Answer | typeof timedOut;
  try {
    answer = await within(call, CALL_LIMIT_MS);
  } catch (error) {
    throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
  }
  if (answer === timedOut) throw new RemoteError('offline', 'no answer in time');
  if (answer.error) throw failure(answer);
  return answer.data;
}

const rows = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : []);

/**
 * Every row after `afterRev`, asked for a page at a time. If a page fails after an earlier one
 * arrived, what arrived is returned: it is in rev order, so the caller's cursor moves to its
 * last row and the next fetch continues from there.
 */
async function paged(afterRev: number, size: number, page: (after: number) => PromiseLike<Answer>): Promise<Row[]> {
  const all: Row[] = [];
  let after = afterRev;
  for (let n = 0; n < MAX_PAGES; n += 1) {
    let got: Row[];
    try {
      got = rows(await unwrap(page(after)));
    } catch (error) {
      if (all.length > 0) break;
      throw error;
    }
    all.push(...got);
    if (got.length < size) break;
    const last = Number(got[got.length - 1].rev);
    if (!Number.isFinite(last) || last <= after) break;
    after = last;
  }
  return all;
}

/**
 * The account, on Supabase. Sign-in is by Discord; data goes through the tables and functions of
 * supabase/migrations. Create the client with `createSupabaseClient` so that sign-in returns to
 * the page with a `code` in the query string, which the hash routes do not use.
 */
export function supabaseRemote(client: SupabaseClient, env: ImportEnv): Remote {
  let userId: string | null = null;

  const me = (): string => {
    if (userId === null) throw new RemoteError('unauthorized');
    return userId;
  };

  return {
    async start(onUser) {
      let told = false;
      const tell = (id: string | null): void => {
        if (told && id === userId) return;
        told = true;
        userId = id;
        onUser(id);
      };
      // Reads the session kept on this device, first finishing a sign-in that has just come back.
      // If that fails (the session cannot be read, or cannot be renewed), nobody is signed in as
      // far as the account is concerned. The store keeps its own record of who was.
      const { data } = await client.auth.getSession();
      tell(data.session?.user.id ?? null);
      client.auth.onAuthStateChange((_event, session) => tell(session?.user.id ?? null));
    },

    async signIn() {
      // supabase-js reports a sign-in that cannot start (the provider is off, the address is not
      // allowed, there is no connection) by resolving with an error, not by throwing.
      const { error } = await client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
      if (error) throw failure({ data: null, error, status: error.status });
    },

    async signOut() {
      // This device only: the player's other devices stay signed in.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw failure({ data: null, error, status: error.status });
    },

    async profile() {
      const data = await unwrap(client.from('profiles').select('*').eq('id', me()).maybeSingle());
      return data ? profileFromRow(data as Row) : null;
    },

    async listProfiles() {
      me();
      return rows(await unwrap(client.from('profiles').select('*').order('display_name'))).map(profileFromRow);
    },

    async setApproved(player, approved) {
      me();
      await unwrap(client.rpc('set_player_approved', { player, value: approved }));
    },

    async pushCharacters(characters) {
      me();
      const data = await unwrap(client.rpc('push_characters', { rows: characters.map(characterToRow) }));
      return { rejected: rejectedFromJson(data) };
    },

    async pushItems(items) {
      me();
      await unwrap(client.rpc('push_items', { rows: items.map(itemToRow) }));
    },

    async pullCharacters(afterRev) {
      me();
      const data = await paged(afterRev, CHARACTER_PAGE, (after) =>
        client.from('characters').select('*').gt('rev', after).order('rev').limit(CHARACTER_PAGE));
      return data.map(characterFromRow);
    },

    async pullItems(afterRev) {
      me();
      const data = await paged(afterRev, ITEM_PAGE, (after) =>
        client.from('character_items').select('*').gt('rev', after).order('rev').limit(ITEM_PAGE));
      return data.map(itemFromRow);
    },

    async importCharacter(ddbId) {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { status: 'unauthorized' };
      return fetchCharacter(ddbId, importEndpoint(env, token));
    },
  };
}
