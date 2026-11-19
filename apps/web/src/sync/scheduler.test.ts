import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler, type Scheduler } from './scheduler';

let scheduler: Scheduler | null = null;

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  scheduler?.stop();
  scheduler = null;
  vi.useRealTimers();
});

describe('createScheduler', () => {
  it('syncs once, two seconds after the last of several changes', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.changed();
    await vi.advanceTimersByTimeAsync(1500);
    scheduler.changed();
    await vi.advanceTimersByTimeAsync(1999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('syncs every 30 seconds while the app is on screen, and not while it is hidden', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('syncs when the app comes back on screen and when a connection returns', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never runs two syncs at once: a request made during a sync runs one more after it', async () => {
    let release: () => void = () => undefined;
    let active = 0;
    let most = 0;
    const run = vi.fn(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise<void>((resolve) => { release = resolve; });
      active -= 1;
    });
    scheduler = createScheduler(run);
    const first = scheduler.now();
    void scheduler.now();
    void scheduler.now();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it('keeps going after a sync fails', async () => {
    const run = vi.fn(async () => { throw new Error('offline'); });
    scheduler = createScheduler(run);
    await scheduler.now();
    await scheduler.now();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does nothing after stop', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    scheduler.changed();
    scheduler.stop();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).not.toHaveBeenCalled();
  });
});
