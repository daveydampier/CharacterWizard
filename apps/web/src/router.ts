import { useSyncExternalStore } from 'react';

export type View = 'combat' | 'explore';

export type Route =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'about' }
  | { name: 'character'; id: string; view: View };

/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter((part) => part !== '');
  if (parts[0] === 'import' && parts.length === 1) return { name: 'import' };
  if (parts[0] === 'about' && parts.length === 1) return { name: 'about' };
  if (parts[0] === 'c' && parts[1]) {
    return { name: 'character', id: parts[1], view: parts[2] === 'explore' ? 'explore' : 'combat' };
  }
  return { name: 'home' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'import': return '#/import';
    case 'about': return '#/about';
    case 'character': return `#/c/${route.id}/${route.view}`;
    default: return '#/';
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const currentHash = (): string => window.location.hash;

/** The current route, re-rendering when the hash changes (including the phone's back button). */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}
