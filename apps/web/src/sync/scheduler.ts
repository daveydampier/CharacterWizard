export interface SchedulerOptions {
  /** How long after a local change to wait before syncing. */
  debounceMs?: number;
  /** How often to sync while the app is on screen. */
  intervalMs?: number;
}

export interface Scheduler {
  /** A local change was made: sync soon. Several changes close together cause one sync. */
  changed(): void;
  /** Sync now. If a sync is already running, one more runs straight after it. */
  now(): Promise<void>;
  /** Start syncing on a timer, when the app comes back on screen and when a connection returns. */
  start(): void;
  stop(): void;
}

/**
 * Decides when to sync; `run` does the syncing. Never runs two syncs at once, and never lets a
 * failed sync stop the next one.
 */
export function createScheduler(run: () => Promise<void>, options: SchedulerOptions = {}): Scheduler {
  const debounceMs = options.debounceMs ?? 2000;
  const intervalMs = options.intervalMs ?? 30_000;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const now = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run().catch(() => undefined);
      } while (again);
      running = null;
    })();
    return running;
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void now();
  };
  const onOnline = (): void => {
    void now();
  };

  return {
    changed() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void now();
      }, debounceMs);
    },
    now,
    start() {
      if (interval) return;
      interval = setInterval(onVisible, intervalMs);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
    },
    stop() {
      if (debounce) clearTimeout(debounce);
      if (interval) clearInterval(interval);
      debounce = null;
      interval = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    },
  };
}
