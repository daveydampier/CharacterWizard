// The import logic, written against web-standard Request and Response only. It runs unchanged in
// the Supabase Edge Function (Deno), in the Vite dev server (Node) and in Vitest. No imports.

export const CHARACTER_ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

export type ImportStatus = 'ok' | 'private' | 'not-found' | 'upstream-error' | 'bad-request' | 'unauthorized';

export interface ImportOptions {
  /** Origins that may call from a browser, compared exactly. '*' allows any origin. */
  allowedOrigins: string[];
  /** When set, the request's `apikey` header must equal it. */
  apiKey?: string | null;
  /** When true, a missing or empty `apiKey` refuses every request instead of skipping the check. The deployed function sets it. */
  requireKey?: boolean;
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ID_PATTERN = /^\d{1,12}$/;

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (origin === null) return {};
  const any = allowed.includes('*');
  if (!any && !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': any ? '*' : origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(status: number, body: { status: ImportStatus; raw?: unknown }, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function requestedId(req: Request): Promise<string | null> {
  try {
    const body: unknown = await req.json();
    const id = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).id : null;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * POST { "id": "<1 to 12 digits>" } fetches that public D&D Beyond character and nothing else.
 * It sends no cookies and no headers beyond Accept.
 */
export async function handleImport(req: Request, options: ImportOptions): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, options.allowedOrigins);
  // A browser request from an origin that is not listed gets no answer it can read.
  if (origin !== null && Object.keys(cors).length === 0) return reply(403, { status: 'unauthorized' }, {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { status: 'bad-request' }, cors);
  if (options.apiKey) {
    if (req.headers.get('apikey') !== options.apiKey) return reply(401, { status: 'unauthorized' }, cors);
  } else if (options.requireKey === true) {
    return reply(401, { status: 'unauthorized' }, cors);
  }

  const id = await requestedId(req);
  if (id === null) return reply(400, { status: 'bad-request' }, cors);

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${CHARACTER_ENDPOINT}${id}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
  if (upstream.status === 403) return reply(403, { status: 'private' }, cors);
  if (upstream.status === 404) return reply(404, { status: 'not-found' }, cors);
  if (!upstream.ok) return reply(502, { status: 'upstream-error' }, cors);
  try {
    return reply(200, { status: 'ok', raw: await upstream.json() }, cors);
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
}
