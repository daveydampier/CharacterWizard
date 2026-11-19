import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeHref } from '../router';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { rawWithId, seed, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

// In a file of its own, so that the other screen tests build real sheets.
const sheetBuild = vi.hoisted(() => ({ fails: false }));

vi.mock('@cw/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cw/rules')>();
  return {
    ...actual,
    buildSheet: (...args: Parameters<typeof actual.buildSheet>) => {
      if (sheetBuild.fails) throw new Error('sheet build failed');
      return actual.buildSheet(...args);
    },
  };
});

afterEach(() => {
  sheetBuild.fails = false;
});

const state = () => useStore.getState();

/** A device holding Vlad, opened afresh so that no sheet has been built yet. */
async function reopenedDevice() {
  const storage = memoryStorage();
  const server = testServer();
  const record = await seed('vlad', storage, testRemote(server));
  await state().init(storage, testRemote(server));
  return { record, storage, server };
}

describe('Character list', () => {
  it('still lists a character whose sheet cannot be built, so that it can be re-imported or deleted', async () => {
    await reopenedDevice();
    sheetBuild.fails = true;
    renderAt({ name: 'home' });
    expect(await screen.findByText('Vlad')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong on this screen.')).toBeNull();
  });
});

describe('Character screen', () => {
  it('says so when the character cannot be opened, and links back to the list', async () => {
    const { record } = await reopenedDevice();
    sheetBuild.fails = true;
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByText("This character couldn't be opened.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(state()).toMatchObject({ openId: null, sheet: null });
    // It is still on the device: this is not the "isn't on this device" case.
    expect(state().characters.map((c) => c.id)).toEqual([record.id]);
    expect(screen.queryByText("That character isn't on this device.")).toBeNull();
  });

  it('opens the same character when its sheet can be built', async () => {
    const { record } = await reopenedDevice();
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
    expect(screen.queryByText("This character couldn't be opened.")).toBeNull();
  });

  it('forgets the failure when the player goes to a character that does open', async () => {
    const { record } = await reopenedDevice();
    const other = await state().saveImported(rawWithId('minkis', 2));
    if (!other) throw new Error('fixture minkis did not import');
    sheetBuild.fails = true;
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByText("This character couldn't be opened.")).toBeInTheDocument();
    act(() => {
      window.location.hash = routeHref({ name: 'character', id: other.id, view: 'combat' });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
  });
});
