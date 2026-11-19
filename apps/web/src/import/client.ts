import type { ImportResult } from '../remote/types';

export type { ImportResult } from '../remote/types';

export interface ImportEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_KEY?: string;
}

export interface ImportEndpoint {
  url: string;
  headers: Record<string, string>;
}

const FUNCTION_PATH = '/functions/v1/import-character';

/** How long to wait for the import function before giving up. */
export const IMPORT_TIMEOUT_MS = 15_000;

/**
 * Where to send the import request and with which headers. With no Supabase URL configured the
 * request goes to this page's own origin, where the dev server answers it. `accessToken` is the
 * signed-in user's token, which the deployed function requires.
 */
export function importEndpoint(env: ImportEnv, accessToken?: string | null): ImportEndpoint {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_KEY ?? '';
  if (key !== '') headers.apikey = key;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return { url: `${base}${FUNCTION_PATH}`, headers };
}

const PASSED_ON = ['private', 'not-found', 'upstream-error', 'unauthorized', 'not-approved', 'rate-limited'] as const;

/** Asks the import function for a character. Never throws: every failure is a status. */
export async function fetchCharacter(
  id: string,
  endpoint: ImportEndpoint = importEndpoint(import.meta.env),
  timeoutMs: number = IMPORT_TIMEOUT_MS,
): Promise<ImportResult> {
  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { status: 'unreachable' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Not our function's JSON: a proxy error page, or no function at this address.
    return { status: 'unreachable' };
  }
  const answer = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (answer.status === 'ok') {
    const raw = answer.raw;
    // "ok" with nothing usable in it is the service misbehaving, not a character.
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? { status: 'ok', raw } : { status: 'upstream-error' };
  }
  const passed = PASSED_ON.find((status) => status === answer.status);
  return passed ? { status: passed } : { status: 'unreachable' };
}

export const IMPORT_MESSAGES: Record<Exclude<ImportResult['status'], 'ok'>, string> = {
  private: 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.',
  'not-found': 'No character with that ID.',
  'upstream-error': "D&D Beyond didn't respond as expected.",
  unreachable: "Couldn't reach the import service.",
  unauthorized: 'Your sign-in has expired. Sign in again, then retry.',
  'not-approved': "Your DM hasn't approved your account yet.",
  'rate-limited': 'Too many imports. Try again in an hour.',
};

/** Shown instead of importing when the account is full. */
export const LIMIT_MESSAGE = 'You have ten characters. Delete one to add another.';

/** Where the privacy setting is, shown under the Private message. */
export const PRIVACY_HINT =
  'On D&D Beyond, open the character, choose Edit, and on the Home step set Character Privacy to Public.';
