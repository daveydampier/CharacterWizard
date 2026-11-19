import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCharacter, importEndpoint, type ImportEnv } from '../import/client';
import { memoryServer } from './memory';
import { supabaseRemote } from './supabase';
import type { Remote } from './types';

export * from './types';
export { memoryServer } from './memory';
export { supabaseRemote } from './supabase';

/** The stand-in user of local development. */
export const DEV_USER = { id: '00000000-0000-4000-8000-00000000d3e1', displayName: 'Test player' };

/** True when the build has a Supabase project to talk to. */
export const hasAccount = (env: ImportEnv): boolean => (env.VITE_SUPABASE_URL ?? '') !== '' && (env.VITE_SUPABASE_KEY ?? '') !== '';

/**
 * A Supabase client set up for this app: the session is kept on the device, and sign-in returns
 * with a `code` in the query string (PKCE), which supabase-js exchanges and then removes.
 */
export function createSupabaseClient(env: ImportEnv): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_KEY ?? '', {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
}

/** Where local development remembers that the stand-in player is signed in. */
const DEV_FLAG = 'cw-dev-signed-in';

/** localStorage, where it works. A browser that blocks it just forgets the stand-in's sign-in. */
const devFlag = {
  get: (): boolean => {
    try {
      return window.localStorage.getItem(DEV_FLAG) === '1';
    } catch {
      return false;
    }
  },
  set: (signedIn: boolean): void => {
    try {
      if (signedIn) window.localStorage.setItem(DEV_FLAG, '1');
      else window.localStorage.removeItem(DEV_FLAG);
    } catch {
      // Nothing to do: the next reload starts signed out.
    }
  },
};

/**
 * Local development's account: held in memory for as long as the page is open, where "Continue
 * as test player" signs in an approved admin and imports go to the dev server. The account is
 * empty again after a reload, but the stand-in player stays signed in, as a real one would.
 */
function devRemote(env: ImportEnv): Remote {
  const server = memoryServer({ importer: (ddbId) => fetchCharacter(ddbId, importEndpoint(env)) });
  const signedIn = devFlag.get();
  if (signedIn) server.addUser(DEV_USER.id, DEV_USER.displayName, { approved: true, admin: true });
  const inner = server.remote({ userId: signedIn ? DEV_USER.id : null, signInAs: DEV_USER });
  return {
    ...inner,
    async signIn() {
      await inner.signIn();
      devFlag.set(true);
    },
    async signOut() {
      await inner.signOut();
      devFlag.set(false);
    },
  };
}

/** The account this build talks to: Supabase when an address is configured, the stand-in otherwise. */
export function defaultRemote(env: ImportEnv = import.meta.env): Remote {
  return hasAccount(env) ? supabaseRemote(createSupabaseClient(env), env) : devRemote(env);
}
