import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './router';

describe('parseRoute', () => {
  it('reads each screen from the hash', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/players')).toEqual({ name: 'players' });
    expect(parseRoute('#/c/abc-123/combat')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/explore')).toEqual({ name: 'character', id: 'abc-123', view: 'explore' });
    expect(parseRoute('#/c/abc-123/features')).toEqual({ name: 'character', id: 'abc-123', view: 'features' });
  });

  it('opens Combat when the view is missing or unknown', () => {
    expect(parseRoute('#/c/abc-123')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/nonsense')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/Features')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/constructor')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
  });

  it('sends anything else home', () => {
    for (const hash of ['#/nowhere', '#/c', '#/c/', '#/import/extra', '#/about/extra', '#/players/extra']) {
      expect(parseRoute(hash)).toEqual({ name: 'home' });
    }
  });

  it('decodes the character ID', () => {
    expect(parseRoute('#/c/a%2Fb%25c/explore')).toEqual({ name: 'character', id: 'a/b%c', view: 'explore' });
  });

  it('goes home when the character ID cannot be decoded', () => {
    expect(parseRoute('#/c/%E0%A4%A/combat')).toEqual({ name: 'home' });
    expect(parseRoute('#/c/100%/combat')).toEqual({ name: 'home' });
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { name: 'home' }, { name: 'import' }, { name: 'about' }, { name: 'players' },
      { name: 'character', id: 'abc-123', view: 'combat' },
      { name: 'character', id: 'abc-123', view: 'explore' },
      { name: 'character', id: 'abc-123', view: 'features' },
      { name: 'character', id: 'ddb-42-00000000-0000-4000-8000-00000000000a', view: 'combat' },
      { name: 'character', id: 'a/b%c d#e?f', view: 'explore' },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('percent-encodes the character ID, so it stays one part of the address', () => {
    expect(routeHref({ name: 'character', id: 'a/b%c', view: 'combat' })).toBe('#/c/a%2Fb%25c/combat');
    expect(routeHref({ name: 'character', id: 'ddb-42-00000000-0000-4000-8000-00000000000a', view: 'combat' }))
      .toBe('#/c/ddb-42-00000000-0000-4000-8000-00000000000a/combat');
    expect(routeHref({ name: 'players' })).toBe('#/players');
  });
});
