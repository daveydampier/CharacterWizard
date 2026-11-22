import { useSyncExternalStore } from 'react';

export type View = 'combat' | 'explore' | 'features';

export type Route =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'about' }
  | { name: 'players' }
  | { name: 'character'; id: string; view: View };

/** A percent-encoded part of the address, decoded. Null when it is not validly encoded. */
function decoded(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen; an unknown view is Combat. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter((part) => part !== '');
  if (parts[0] === 'import' && parts.length === 1) return { name: 'import' };
  if (parts[0] === 'about' && parts.length === 1) return { name: 'about' };
  if (parts[0] === 'players' && parts.length === 1) return { name: 'players' };
  if (parts[0] === 'c' && parts[1]) {
    const id = decoded(parts[1]);
    const view: View = parts[2] === 'explore' || parts[2] === 'features' ? parts[2] : 'combat';
    if (id !== null) return { name: 'character', id, view };
  }
  return { name: 'home' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'import': return '#/import';
    case 'about': return '#/about';
    case 'players': return '#/players';
    // Encoded, so that an ID containing "/" or "%" stays one part of the address.
    case 'character': return `#/c/${encodeURIComponent(route.id)}/${route.view}`;
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
