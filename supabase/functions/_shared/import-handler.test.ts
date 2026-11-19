import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_ENDPOINT, MAX_REQUEST_BYTES, MAX_UPSTREAM_BYTES, databaseAuthorize, handleImport, readCapped,
  type Allowance, type ImportOptions,
} from './import-handler.ts';

const APP = 'https://app.example';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://x.example/functions/v1/import-character', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** An upstream that answers every request with this status and body. */
function upstream(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

const options = (over: Partial<ImportOptions> = {}): ImportOptions => ({ allowedOrigins: [APP], ...over });

describe('handleImport', () => {
  it('fetches the character by ID and returns the raw JSON', async () => {
    const fetchImpl = upstream(200, { id: 42, data: { name: 'Test' } });
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', raw: { id: 42, data: { name: 'Test' } } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${CHARACTER_ENDPOINT}42`);
  });

  it('sends no cookies, no credentials and no headers beyond Accept', async () => {
    const fetchImpl = upstream(200, {});
    await handleImport(post({ id: '42' }, { cookie: 'session=abc', authorization: 'Bearer user-token' }), options({ fetchImpl }));
    const init = fetchImpl.mock.calls[0][1] ?? {};
    expect(Object.keys(init).sort()).toEqual(['headers', 'redirect', 'signal']);
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('follows no redirects', async () => {
    const fetchImpl = upstream(200, {});
    await handleImport(post({ id: '42' }), options({ fetchImpl }));
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('error');
  });

  it.each([
    [403, 403, 'private'],
    [404, 404, 'not-found'],
    [500, 502, 'upstream-error'],
    [429, 502, 'upstream-error'],
  ])('maps upstream %i to %i %s', async (upstreamStatus, status, name) => {
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: upstream(upstreamStatus) }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ status: name });
  });

  it('reports an upstream error when the fetch fails or the body is not JSON', async () => {
    const failing = vi.fn(async () => { throw new Error('network down'); });
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: failing }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: 'upstream-error' });
    const html = await handleImport(post({ id: '42' }), options({ fetchImpl: upstream(200, '<html>') }));
    expect(await html.json()).toEqual({ status: 'upstream-error' });
  });

  it('gives up on an upstream that does not answer in time', async () => {
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: hanging, timeoutMs: 20 }));
    expect(await res.json()).toEqual({ status: 'upstream-error' });
  });

  it.each([
    [{ id: 42 }],
    [{ id: '' }],
    [{ id: '12a' }],
    [{ id: '1234567890123' }],
    [{ id: '42/../../admin' }],
    [{ id: 'https://evil.example/' }],
    [{}],
    [null],
    ['not json'],
  ])('rejects a body that is not a 1 to 12 digit ID and fetches nothing: %j', async (body) => {
    const fetchImpl = upstream(200);
    const res = await handleImport(post(body), options({ fetchImpl }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'bad-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects methods other than POST and OPTIONS', async () => {
    const fetchImpl = upstream(200);
    const req = new Request('https://x.example/f?id=42', { method: 'GET', headers: { origin: APP } });
    const res = await handleImport(req, options({ fetchImpl }));
    expect(res.status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers a preflight from a listed origin', async () => {
    const req = new Request('https://x.example/f', { method: 'OPTIONS', headers: { origin: APP } });
    const res = await handleImport(req, options());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('access-control-allow-headers')).toContain('apikey');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });

  it('puts the CORS headers on every answer to a listed origin', async () => {
    const res = await handleImport(post({ id: 'x' }), options());
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('refuses an origin that is not listed, without fetching', async () => {
    const fetchImpl = upstream(200);
    const res = await handleImport(post({ id: '42' }, { origin: 'https://other.example' }), options({ fetchImpl }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ status: 'unauthorized' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows any origin when the list contains *', async () => {
    const res = await handleImport(post({ id: '42' }, { origin: 'http://192.168.1.20:5173' }),
      options({ allowedOrigins: ['*'], fetchImpl: upstream(200) }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('says the answer depends on the origin even when it refuses the origin or has none', async () => {
    const refused = await handleImport(post({ id: '42' }, { origin: 'https://other.example' }), options());
    expect(refused.headers.get('vary')).toBe('Origin');
    const noOrigin = new Request('https://x.example/f', { method: 'POST', body: JSON.stringify({ id: 'x' }) });
    expect((await handleImport(noOrigin, options())).headers.get('vary')).toBe('Origin');
  });

  it('refuses a request body over the size limit without fetching', async () => {
    const fetchImpl = upstream(200);
    const big = JSON.stringify({ id: '42', padding: 'x'.repeat(MAX_REQUEST_BYTES) });
    const res = await handleImport(post(big), options({ fetchImpl }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'bad-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to relay an upstream body over the size limit, whether or not its length is declared', async () => {
    const declared = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-length': String(MAX_UPSTREAM_BYTES + 1) } }));
    expect(await (await handleImport(post({ id: '42' }), options({ fetchImpl: declared }))).json()).toEqual({ status: 'upstream-error' });
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    const endless = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    }), { status: 200 }));
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: endless }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: 'upstream-error' });
  });

  describe('with an access check', () => {
    const allowing = (answer: Allowance) => vi.fn(async (_req: Request) => answer);

    it('fetches when the check allows it, and hands the check the request', async () => {
      const authorize = allowing('ok');
      const fetchImpl = upstream(200, {});
      const req = post({ id: '42' }, { authorization: 'Bearer user-token' });
      const res = await handleImport(req, options({ authorize, fetchImpl }));
      expect(res.status).toBe(200);
      expect(authorize).toHaveBeenCalledWith(req);
    });

    it.each([
      ['unauthorized', 401],
      ['not-approved', 403],
      ['rate-limited', 429],
    ] as const)('answers %s with %i and fetches nothing', async (answer, status) => {
      const fetchImpl = upstream(200, {});
      const res = await handleImport(post({ id: '42' }), options({ authorize: allowing(answer), fetchImpl }));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ status: answer });
      expect(res.headers.get('access-control-allow-origin')).toBe(APP);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses when the check itself fails', async () => {
      const fetchImpl = upstream(200, {});
      const authorize = vi.fn(async () => { throw new Error('database down'); });
      const res = await handleImport(post({ id: '42' }), options({ authorize, fetchImpl }));
      expect(res.status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('checks before it reads the body, so a refused caller cannot make it parse anything', async () => {
      const res = await handleImport(post('not json'), options({ authorize: allowing('unauthorized') }));
      expect(res.status).toBe(401);
    });

    it('still answers a preflight, which carries no token', async () => {
      const authorize = allowing('unauthorized');
      const req = new Request('https://x.example/f', { method: 'OPTIONS', headers: { origin: APP } });
      expect((await handleImport(req, options({ authorize }))).status).toBe(204);
      expect(authorize).not.toHaveBeenCalled();
    });
  });
});

describe('readCapped', () => {
  const stream = (...parts: string[]) => new Response(parts.join('')).body;

  it('returns the text when it fits', async () => {
    expect(await readCapped(stream('hello'), 5)).toBe('hello');
    expect(await readCapped(null, 5)).toBe('');
  });

  it('returns null when it does not', async () => {
    expect(await readCapped(stream('hello!'), 5)).toBeNull();
  });
});

describe('databaseAuthorize', () => {
  const request = (headers: Record<string, string> = {}) => new Request('https://x.example/f', {
    method: 'POST', headers: { authorization: 'Bearer user-token', apikey: 'sb_publishable_test', ...headers },
  });
  const database = (status: number, body: unknown) =>
    vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

  it('asks the database with the caller\'s own token and passes on its answer', async () => {
    for (const answer of ['ok', 'not-approved', 'rate-limited'] as const) {
      const fetchImpl = database(200, answer);
      expect(await databaseAuthorize('https://abc.supabase.co/', fetchImpl)(request())).toBe(answer);
      expect(fetchImpl.mock.calls[0][0]).toBe('https://abc.supabase.co/rest/v1/rpc/record_import');
      expect(fetchImpl.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', apikey: 'sb_publishable_test', 'Content-Type': 'application/json' },
        body: '{}',
      });
    }
  });

  it('refuses a request with no token or no key, without asking', async () => {
    const fetchImpl = database(200, 'ok');
    const check = databaseAuthorize('https://abc.supabase.co', fetchImpl);
    expect(await check(new Request('https://x.example/f', { method: 'POST', headers: { apikey: 'k' } }))).toBe('unauthorized');
    expect(await check(new Request('https://x.example/f', { method: 'POST', headers: { authorization: 'Bearer t' } }))).toBe('unauthorized');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['the database rejects the token', database(401, { message: 'JWT expired' })],
    ['the caller may not run the function', database(403, { message: 'permission denied' })],
    ['the database fails', database(500, {})],
    ['the answer is not one it knows', database(200, 'maybe')],
    ['the database cannot be reached', vi.fn(async () => { throw new TypeError('fetch failed'); })],
  ])('refuses when %s', async (_label, fetchImpl) => {
    expect(await databaseAuthorize('https://abc.supabase.co', fetchImpl)(request())).toBe('unauthorized');
  });

  it.each([null, undefined, ''])('refuses every request when it has no database address (%j)', async (url) => {
    const fetchImpl = database(200, 'ok');
    expect(await databaseAuthorize(url, fetchImpl)(request())).toBe('unauthorized');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
