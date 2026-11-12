export type ImportResult =
  | { status: 'ok'; raw: unknown }
  | { status: 'private' | 'not-found' | 'upstream-error' | 'unreachable' };

export interface ImportEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_KEY?: string;
}

const FUNCTION_PATH = '/functions/v1/import-character';

/**
 * Where to send the import request and with which headers. With no Supabase URL configured the
 * request goes to this page's own origin, where the dev server answers it.
 */
export function importEndpoint(env: ImportEnv): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_KEY ?? '';
  if (key !== '') {
    headers.apikey = key;
    // A legacy anon key is a JWT and must also be sent as a bearer token. A publishable key must not.
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  }
  return { url: `${base}${FUNCTION_PATH}`, headers };
}

/** Asks the import function for a character. Never throws: every failure is a status. */
export async function fetchCharacter(id: string, env: ImportEnv = import.meta.env): Promise<ImportResult> {
  const { url, headers } = importEndpoint(env);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ id }) });
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
  const status = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).status : null;
  if (status === 'ok') return { status: 'ok', raw: (body as Record<string, unknown>).raw };
  if (status === 'private' || status === 'not-found' || status === 'upstream-error') return { status };
  return { status: 'unreachable' };
}

export const IMPORT_MESSAGES: Record<Exclude<ImportResult['status'], 'ok'>, string> = {
  private: 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.',
  'not-found': 'No character with that ID.',
  'upstream-error': "D&D Beyond didn't respond as expected.",
  unreachable: "Couldn't reach the import service.",
};

/** Where the privacy setting is, shown under the Private message. */
export const PRIVACY_HINT =
  'On D&D Beyond, open the character, choose Edit, and on the Home step set Character Privacy to Public.';
