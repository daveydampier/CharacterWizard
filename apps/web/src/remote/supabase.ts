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

/** The data of an answer; rejects with a RemoteError if the call failed or could not be made. */
async function unwrap(call: PromiseLike<Answer>): Promise<unknown> {
  let answer: Answer;
  try {
    answer = await call;
  } catch (error) {
    throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
  }
  if (answer.error) throw failure(answer);
  return answer.data;
}

const rows = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : []);

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
      const { data } = await client.auth.getSession();
      tell(data.session?.user.id ?? null);
      client.auth.onAuthStateChange((_event, session) => tell(session?.user.id ?? null));
    },

    async signIn() {
      await client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
    },

    async signOut() {
      // This device only: the player's other devices stay signed in.
      await client.auth.signOut({ scope: 'local' });
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
      return rows(await unwrap(client.from('characters').select('*').gt('rev', afterRev).order('rev'))).map(characterFromRow);
    },

    async pullItems(afterRev) {
      me();
      return rows(await unwrap(client.from('character_items').select('*').gt('rev', afterRev).order('rev'))).map(itemFromRow);
    },

    async importCharacter(ddbId) {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { status: 'unauthorized' };
      return fetchCharacter(ddbId, importEndpoint(env, token));
    },
  };
}
