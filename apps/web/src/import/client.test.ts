import { describe, expect, it, vi } from 'vitest';
import { IMPORT_MESSAGES, fetchCharacter, importEndpoint } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LOCAL = { url: '/functions/v1/import-character', headers: { 'Content-Type': 'application/json' } };

describe('importEndpoint', () => {
  it('uses this page\'s own origin and no key in local development', () => {
    expect(importEndpoint({})).toEqual(LOCAL);
  });

  it('sends the publishable key in the apikey header', () => {
    expect(importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_KEY: 'sb_publishable_x' })).toEqual({
      url: 'https://abc.supabase.co/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x' },
    });
  });

  it('sends the signed-in user\'s token as a bearer token', () => {
    const { headers } = importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_x' }, 'user-token');
    expect(headers).toEqual({ 'Content-Type': 'application/json', apikey: 'sb_publishable_x', Authorization: 'Bearer user-token' });
  });

  it('sends no bearer token when nobody is signed in', () => {
    expect(importEndpoint({ VITE_SUPABASE_KEY: 'sb_publishable_x' }, null).headers.Authorization).toBeUndefined();
  });
});

describe('fetchCharacter', () => {
  it('posts the ID with the endpoint\'s headers and returns the raw character', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(200, { status: 'ok', raw: { data: { name: 'Vlad' } } }));
    vi.stubGlobal('fetch', fetchMock);
    const endpoint = { url: 'https://abc.supabase.co/functions/v1/import-character', headers: { apikey: 'k', Authorization: 'Bearer t' } };
    expect(await fetchCharacter('42', endpoint)).toEqual({ status: 'ok', raw: { data: { name: 'Vlad' } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint.url);
    expect(init).toMatchObject({ method: 'POST', headers: endpoint.headers, body: '{"id":"42"}' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [403, 'private'],
    [404, 'not-found'],
    [502, 'upstream-error'],
    [401, 'unauthorized'],
    [403, 'not-approved'],
    [429, 'rate-limited'],
  ] as const)('passes on the function\'s %i %s answer', async (httpStatus, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(httpStatus, { status })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status });
  });

  it('has a message for every answer that is not a character', () => {
    expect(IMPORT_MESSAGES.unauthorized).toBe('Your sign-in has expired. Sign in again, then retry.');
    expect(IMPORT_MESSAGES['not-approved']).toBe("Your DM hasn't approved your account yet.");
    expect(IMPORT_MESSAGES['rate-limited']).toBe('Too many imports. Try again in an hour.');
  });

  it('reports unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
  });

  it('gives up when the function does not answer in time', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
    })));
    expect(await fetchCharacter('42', LOCAL, 20)).toEqual({ status: 'unreachable' });
  });

  it('reports unreachable for an answer that is not the function\'s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { status: 'bad-request' })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, null)));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
  });

  it.each([[undefined], [null], ['text'], [7], [[1, 2]]])('treats "ok" with raw %j as D&D Beyond misbehaving', async (raw) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { status: 'ok', raw })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'upstream-error' });
  });
});
