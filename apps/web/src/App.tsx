import { Component, useEffect, type ReactNode } from 'react';
import { useRoute } from './router';
import { AboutScreen } from './screens/About';
import { CharacterScreen } from './screens/Character';
import { HomeScreen } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { useStore } from './store';

/** Catches a crash in any screen. Stored characters and play state are not touched. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md p-4">
        <p className="font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-slate-600">Your saved characters are safe.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white"
        >
          Reload
        </button>
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
