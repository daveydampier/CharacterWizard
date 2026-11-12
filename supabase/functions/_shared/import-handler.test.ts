import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_ENDPOINT, handleImport, type ImportOptions } from './import-handler.ts';

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
    expect(Object.keys(init).sort()).toEqual(['headers', 'signal']);
    expect(init.headers).toEqual({ Accept: 'application/json' });
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

  it('requires the configured key in the apikey header', async () => {
    const fetchImpl = upstream(200, {});
    const keyed = options({ apiKey: 'sb_publishable_test', fetchImpl });
    expect((await handleImport(post({ id: '42' }), keyed)).status).toBe(401);
    expect((await handleImport(post({ id: '42' }, { apikey: 'wrong' }), keyed)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await handleImport(post({ id: '42' }, { apikey: 'sb_publishable_test' }), keyed)).status).toBe(200);
  });

  it('asks for no key when none is configured', async () => {
    const res = await handleImport(post({ id: '42' }), options({ apiKey: null, fetchImpl: upstream(200) }));
    expect(res.status).toBe(200);
  });
});
