import { describe, expect, it, vi } from 'vitest';
import { fetchCharacter, importEndpoint } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('importEndpoint', () => {
  it('uses this page\'s own origin and no key in local development', () => {
    expect(importEndpoint({})).toEqual({
      url: '/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('sends a publishable key in the apikey header only', () => {
    expect(importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_KEY: 'sb_publishable_x' })).toEqual({
      url: 'https://abc.supabase.co/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x' },
    });
  });

  it('also sends a legacy JWT key as a bearer token', () => {
    const { headers } = importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'eyJhbGciOi.x.y' });
    expect(headers).toMatchObject({ apikey: 'eyJhbGciOi.x.y', Authorization: 'Bearer eyJhbGciOi.x.y' });
  });
});

describe('fetchCharacter', () => {
  it('posts the ID and returns the raw character', async () => {
    const fetchMock = vi.fn(async () => json(200, { status: 'ok', raw: { data: { name: 'Vlad' } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchCharacter('42', {})).toEqual({ status: 'ok', raw: { data: { name: 'Vlad' } } });
    expect(fetchMock).toHaveBeenCalledWith('/functions/v1/import-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":"42"}',
    });
  });

  it.each([
    [403, 'private'],
    [404, 'not-found'],
    [502, 'upstream-error'],
  ] as const)('passes on the function\'s %i %s answer', async (httpStatus, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(httpStatus, { status })));
    expect(await fetchCharacter('42', {})).toEqual({ status });
  });

  it('reports unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
  });

  it('reports unreachable for an answer that is not the function\'s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { status: 'unauthorized' })));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, null)));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
  });
});
