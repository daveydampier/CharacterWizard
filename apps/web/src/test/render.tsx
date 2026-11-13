import { render } from '@testing-library/react';
import { App } from '../App';
import { routeHref, type Route } from '../router';

/** Renders the whole app at a route. Seed the store first; a loaded store is not re-initialised. */
export function renderAt(route: Route) {
  window.location.hash = routeHref(route);
  return render(<App />);
}
