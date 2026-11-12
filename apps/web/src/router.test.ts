import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './router';

describe('parseRoute', () => {
  it('reads each screen from the hash', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/c/abc-123/combat')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/explore')).toEqual({ name: 'character', id: 'abc-123', view: 'explore' });
  });

  it('opens Combat when the view is missing or unknown', () => {
    expect(parseRoute('#/c/abc-123')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/nonsense')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
  });

  it('sends anything else home', () => {
    for (const hash of ['#/nowhere', '#/c', '#/c/', '#/import/extra', '#/about/extra']) {
      expect(parseRoute(hash)).toEqual({ name: 'home' });
    }
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { name: 'home' }, { name: 'import' }, { name: 'about' },
      { name: 'character', id: 'abc-123', view: 'combat' },
      { name: 'character', id: 'abc-123', view: 'explore' },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });
});
