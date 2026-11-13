import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { routeHref, useRoute } from './router';
import { AboutScreen } from './screens/About';
import { CharacterScreen } from './screens/Character';
import { HomeScreen } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { useStore } from './store';

/** Catches a crash in any screen. Stored characters and play state are not touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Going to another screen tries again. */
  private readonly reset = (): void => {
    if (this.state.failed) this.setState({ failed: false });
  };

  componentDidMount(): void {
    window.addEventListener('hashchange', this.reset);
  }

  componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.reset);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md p-4">
        <p className="font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-slate-600">Your saved characters are safe.</p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white"
          >
            Reload
          </button>
          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-indigo-700">
            Back to your characters
          </a>
        </div>
      </main>
    );
  }
}

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'import': return <ImportScreen />;
    case 'about': return <AboutScreen />;
    case 'character': return <CharacterScreen id={route.id} view={route.view} />;
    default: return <HomeScreen />;
  }
}

export function App() {
  const ready = useStore((s) => s.ready);
  const persistent = useStore((s) => s.persistent);
  const init = useStore((s) => s.init);

  useEffect(() => {
    // A store that is already loaded (as in tests) is left alone.
    if (!useStore.getState().ready) void init();
  }, [init]);

  if (!ready) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;
  return (
    <ErrorBoundary>
      {persistent ? null : (
        <p role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          This device isn't saving changes. They will be lost when you close the page.
        </p>
      )}
      <Screen />
    </ErrorBoundary>
  );
}
