// The import logic, written against web-standard Request and Response only. It runs unchanged in
// the Supabase Edge Function (Deno), in the Vite dev server (Node) and in Vitest. No imports.

export const CHARACTER_ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

/** A request body is `{"id":"<digits>"}`: anything near this size is not one. */
export const MAX_REQUEST_BYTES = 1024;
/** A character is about 250 KB. Nothing larger than this is relayed. */
export const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

export type ImportStatus =
  | 'ok' | 'private' | 'not-found' | 'upstream-error' | 'bad-request'
  | 'unauthorized' | 'not-approved' | 'rate-limited';

/** Whether this caller may import: signed in, approved, and within the rate limit. */
export type Allowance = 'ok' | 'unauthorized' | 'not-approved' | 'rate-limited';

export interface ImportOptions {
  /** Origins that may call from a browser, compared exactly. '*' allows any origin. */
  allowedOrigins: string[];
  /**
   * Decides whether the caller may import. The deployed function always sets it. The dev server
   * leaves it out, which allows everyone.
   */
  authorize?: (req: Request) => Promise<Allowance>;
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ID_PATTERN = /^\d{1,12}$/;

const REFUSAL: Record<Exclude<Allowance, 'ok'>, number> = { unauthorized: 401, 'not-approved': 403, 'rate-limited': 429 };

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // Every answer depends on the Origin header, so every answer says so to caches.
  if (origin === null) return { Vary: 'Origin' };
  const any = allowed.includes('*');
  if (!any && !allowed.includes(origin)) return { Vary: 'Origin' };
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

/** The body as text, or null if it is longer than `maxBytes`. Stops reading at the limit. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

const tooLong = (headers: Headers, maxBytes: number): boolean => {
  const length = Number(headers.get('content-length') ?? '0');
  return Number.isFinite(length) && length > maxBytes;
};

async function requestedId(req: Request): Promise<string | null> {
  try {
    if (tooLong(req.headers, MAX_REQUEST_BYTES)) return null;
    const text = await readCapped(req.body, MAX_REQUEST_BYTES);
    if (text === null) return null;
    const body: unknown = JSON.parse(text);
    const id = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).id : null;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The deployed function's access check. It passes the caller's own token to the database function
 * `record_import`, which answers "ok", "not-approved" or "rate-limited" and records the import.
 * The database rejects a missing, invalid or expired token itself. Anything unexpected, including
 * a database that cannot be reached or no address to reach it at, refuses the request.
 */
export function databaseAuthorize(
  supabaseUrl: string | null | undefined, fetchImpl: typeof fetch = fetch,
): (req: Request) => Promise<Allowance> {
  const base = (supabaseUrl ?? '').replace(/\/+$/, '');
  return async (req) => {
    const authorization = req.headers.get('authorization');
    const apikey = req.headers.get('apikey');
    if (base === '' || !authorization || !apikey) return 'unauthorized';
    try {
      const res = await fetchImpl(`${base}/rest/v1/rpc/record_import`, {
        method: 'POST',
        headers: { Authorization: authorization, apikey, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return 'unauthorized';
      const answer: unknown = await res.json();
      return answer === 'ok' || answer === 'not-approved' || answer === 'rate-limited' ? answer : 'unauthorized';
    } catch {
      return 'unauthorized';
    }
  };
}

/**
 * POST { "id": "<1 to 12 digits>" } fetches that public D&D Beyond character and nothing else.
 * It sends no cookies and no headers beyond Accept, and follows no redirects.
 */
export async function handleImport(req: Request, options: ImportOptions): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, options.allowedOrigins);
  // A browser request from an origin that is not listed gets no answer it can read.
  if (origin !== null && !('Access-Control-Allow-Origin' in cors)) return reply(403, { status: 'unauthorized' }, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { status: 'bad-request' }, cors);

  if (options.authorize) {
    const allowed = await options.authorize(req).catch((): Allowance => 'unauthorized');
    if (allowed !== 'ok') return reply(REFUSAL[allowed], { status: allowed }, cors);
  }

  const id = await requestedId(req);
  if (id === null) return reply(400, { status: 'bad-request' }, cors);

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${CHARACTER_ENDPOINT}${id}`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
  if (upstream.status === 403) return reply(403, { status: 'private' }, cors);
  if (upstream.status === 404) return reply(404, { status: 'not-found' }, cors);
  if (!upstream.ok) return reply(502, { status: 'upstream-error' }, cors);
  try {
    if (tooLong(upstream.headers, MAX_UPSTREAM_BYTES)) return reply(502, { status: 'upstream-error' }, cors);
    const text = await readCapped(upstream.body, MAX_UPSTREAM_BYTES);
    if (text === null) return reply(502, { status: 'upstream-error' }, cors);
    return reply(200, { status: 'ok', raw: JSON.parse(text) }, cors);
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
}
