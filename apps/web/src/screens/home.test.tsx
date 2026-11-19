import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import type { MemoryServer, MemoryServerOptions } from '../remote/memory';
import { CHARACTER_LIMIT, RemoteError, type ImportResult, type Remote } from '../remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';
import { syncOnce } from '../sync/engine';
import { TEST_USER, rawWithId, seed, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

const state = () => useStore.getState();

const DM = 'user-dm';
const OTHER = 'user-other';

const stored = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: TEST_USER, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
  importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true, ...over,
});

const minkis = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter =>
  stored(id, { ddbId: '2', name: 'Minkis', rawJson: rawWithId('minkis', 2), ...over });

/** Puts characters into the account as their owner would, from a device of the owner's. */
async function accountHas(server: MemoryServer, userId: string, ...records: StoredCharacter[]): Promise<void> {
  const device = { storage: memoryStorage(), remote: server.remote({ userId }) };
  for (const record of records) await device.storage.putCharacter(record);
  await syncOnce(device);
}

/** An account with a table admin, Dee, and the test player, Tess, who owns Vlad. */
async function table(options?: MemoryServerOptions): Promise<MemoryServer> {
  const server = testServer(options);
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  await accountHas(server, TEST_USER, stored('ddb-1-user-test'));
  return server;
}

/** A device signed in as the table admin. */
async function asAdmin(server: MemoryServer, wrap: (remote: Remote) => Remote = (remote) => remote): Promise<void> {
  await state().init(memoryStorage(), wrap(server.remote({ userId: DM })));
}

const tableSection = () => screen.getByRole('region', { name: 'Table' });

describe('Home: whose characters are listed', () => {
  it('lists only the signed-in player\'s own under "Your characters"', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-test', { dirty: false }));
    await storage.putCharacter(minkis(`ddb-2-${OTHER}`, { ownerId: OTHER, dirty: false }));
    await state().init(storage, testRemote());
    expect(state().characters).toHaveLength(2);
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Minkis/ })).toBeNull();
  });

  it('shows a player no Table section and no link to Players', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(minkis(`ddb-2-${OTHER}`, { ownerId: OTHER, dirty: false }));
    const remote = testRemote();
    const listProfiles = vi.spyOn(remote, 'listProfiles');
    await seed('vlad', storage, remote);
    renderAt({ name: 'home' });
    expect(screen.queryByRole('region', { name: 'Table' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Table' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Players' })).toBeNull();
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('shows a table admin another player\'s character under Table, with the owner\'s name', async () => {
    await asAdmin(await table());
    await state().saveImported(rawWithId('minkis', 2));
    renderAt({ name: 'home' });
    expect(within(tableSection()).getByRole('heading', { level: 2, name: 'Table' })).toBeInTheDocument();
    const theirs = within(tableSection()).getByRole('link', { name: /Vlad/ });
    expect(theirs).toHaveAttribute('href', '#/c/ddb-1-user-test/combat');
    expect(await within(theirs).findByText('Warlock 3 · Tess')).toBeInTheDocument();
    expect(theirs).not.toHaveTextContent('Imported');

    // The admin's own character stays under "Your characters", with its import date.
    expect(within(tableSection()).queryByRole('link', { name: /Minkis/ })).toBeNull();
    const own = screen.getByRole('link', { name: /Minkis/ });
    expect(own).toHaveTextContent('Wizard 3 · Imported');
    expect(own).not.toHaveTextContent('Dee');
  });

  it('sorts the table by character name', async () => {
    const server = await table();
    server.addUser(OTHER, 'Otto', { approved: true });
    await accountHas(server, OTHER, minkis(`ddb-2-${OTHER}`, { ownerId: OTHER }));
    await asAdmin(server);
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad', 'Minkis']);
    renderAt({ name: 'home' });
    await within(tableSection()).findByText('Wizard 3 · Otto');
    const names = within(tableSection()).getAllByRole('link').map((link) => link.firstElementChild?.textContent);
    expect(names).toEqual(['Minkis', 'Vlad']);
  });

  it.each<[string, () => Promise<never[]>]>([
    ['the players cannot be loaded', () => Promise.reject(new RemoteError('offline'))],
    ['the owner is not among the players', async () => []],
  ])('leaves the owner\'s name out when %s', async (_name, answer) => {
    const listProfiles = vi.fn(answer);
    await asAdmin(await table(), (remote) => ({ ...remote, listProfiles }));
    renderAt({ name: 'home' });
    await waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));
    const theirs = within(tableSection()).getByRole('link', { name: /Vlad/ });
    expect(within(theirs).getByText('Warlock 3')).toBeInTheDocument();
  });

  it('asks for the players once, however often the screen re-renders', async () => {
    const server = await table();
    let listProfiles = vi.fn<Remote['listProfiles']>();
    await asAdmin(server, (remote) => {
      listProfiles = vi.fn(() => remote.listProfiles());
      return { ...remote, listProfiles };
    });
    renderAt({ name: 'home' });
    await within(tableSection()).findByText('Warlock 3 · Tess');
    await state().saveImported(rawWithId('minkis', 2));
    expect(await screen.findByRole('link', { name: /Minkis/ })).toBeInTheDocument();
    expect(listProfiles).toHaveBeenCalledTimes(1);
  });

  it('gives a table admin with nobody else\'s characters no Table section, and a link to Players', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    await asAdmin(server);
    await state().saveImported(loadRaw('vlad'));
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Table' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Players' })).toHaveAttribute('href', '#/players');
  });

  it('still invites a table admin with no characters of their own to add one', async () => {
    await asAdmin(await table());
    renderAt({ name: 'home' });
    expect(screen.getByText('Add your first character')).toBeInTheDocument();
    expect(within(tableSection()).getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
  });
});

describe('Home: re-import and delete', () => {
  it('re-imports a table character through the account and keeps its owner', async () => {
    const importer = vi.fn(async (_ddbId: string): Promise<ImportResult> => ({ status: 'ok', raw: loadRaw('vlad') }));
    const server = await table({ importer });
    await asAdmin(server);
    renderAt({ name: 'home' });
    await userEvent.click(within(tableSection()).getByRole('button', { name: 'Re-import' }));
    expect(await within(tableSection()).findByText('Updated from D&D Beyond.')).toBeInTheDocument();
    expect(importer.mock.calls).toEqual([['1']]);
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER, dirty: true }]);
    expect(state().characters).toHaveLength(1);

    await state().syncNow();
    const [theirs, ...rest] = await testRemote(server).pullCharacters(0);
    expect(rest).toEqual([]);
    expect(theirs).toMatchObject({ id: 'ddb-1-user-test', ownerId: TEST_USER, deleted: false });
    expect(theirs.importedAt).not.toBe('2026-01-01T10:00:00.000Z');
  });

  it.each<[Exclude<ImportResult['status'], 'ok'>, string]>([
    ['unauthorized', 'Your sign-in has expired. Sign in again, then retry. Your saved copy still works.'],
    ['not-approved', "Your DM hasn't approved your account yet. Your saved copy still works."],
    ['rate-limited', 'Too many imports. Try again in an hour. Your saved copy still works.'],
    ['unreachable', "Couldn't reach the import service. Your saved copy still works."],
  ])('explains a re-import the account answers with %s, and keeps the saved copy', async (status, message) => {
    const record = await seed('vlad', memoryStorage(), testRemote(testServer({ importer: async () => ({ status }) })));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText(message)).toHaveAttribute('role', 'status');
    expect(state().characters).toEqual([record]);
    expect(screen.getByRole('button', { name: 'Re-import' })).toBeEnabled();
  });

  it('offers no re-import for a character that has no D&D Beyond ID', async () => {
    await state().init(memoryStorage(), testRemote());
    const record = await state().saveImported(rawWithId('vlad', 0));
    expect(record?.ddbId).toBe('0');
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-import' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('says that deleting removes the character from the account and from every device', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    const confirm = vi.fn((_message?: string) => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm.mock.calls).toEqual([
      ["Delete Vlad? It will be removed from the account and from every device. This can't be undone."],
    ]);
    expect(state().characters).toHaveLength(1);
  });
});

describe('Home: the sync line', () => {
  const syncLine = (text: string) => {
    const line = screen.getByText(text);
    expect(line).toHaveAttribute('role', 'status');
    return line;
  };

  it('says "Saved to your account" once the account has everything', async () => {
    await seed('vlad');
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Saved to your account');
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('says "Waiting to sync" while a change has not reached the account, and catches up', async () => {
    const server = testServer();
    await seed('vlad', memoryStorage(), testRemote(server));
    server.offline = true;
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Waiting to sync');
    server.offline = false;
    await state().syncNow();
    expect(await screen.findByText('Saved to your account')).toBeInTheDocument();
    expect(screen.queryByText('Waiting to sync')).toBeNull();
  });

  it('says "Sign in again to sync" when the session has ended, with a button that signs in', async () => {
    const remote = testServer().remote({ userId: TEST_USER, signInAs: { id: TEST_USER, displayName: 'Tess' } });
    await seed('vlad', memoryStorage(), remote);
    await remote.signOut();
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Sign in again to sync');
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Saved to your account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('says so when the account is full and a character here cannot be sent', async () => {
    const server = testServer();
    const records: StoredCharacter[] = [];
    for (let i = 1; i <= CHARACTER_LIMIT; i += 1) records.push(stored(`ddb-${i}-user-test`, { ddbId: String(i) }));
    await accountHas(server, TEST_USER, ...records);
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-99-user-test', { ddbId: '99' }));
    await storage.setMeta('session', { userId: TEST_USER, profile: { displayName: 'Tess', approved: true, isTableAdmin: false } });
    await storage.setMeta('cursor:characters', 1_000_000);
    await state().init(storage, testRemote(server));
    renderAt({ name: 'home' });
    syncLine('Your account has ten characters. Delete one so the rest can sync.');
  });
});

describe('Home: signing out', () => {
  const signedOut = () => screen.findByRole('button', { name: 'Continue as test player' });

  async function seeded(): Promise<{ server: MemoryServer; storage: AppStorage }> {
    const server = testServer();
    const storage = memoryStorage();
    await seed('vlad', storage, testRemote(server));
    return { server, storage };
  }

  it('sends what is waiting, then signs out without asking', async () => {
    const { server, storage } = await seeded();
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await signedOut()).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(state().session).toBeNull();
    expect(await storage.listCharacters()).toEqual([]);
    expect((await testRemote(server).pullCharacters(0)).map((c) => c.name)).toEqual(['Vlad']);
  });

  it('asks before discarding changes that cannot be sent, and stays signed in on "no"', async () => {
    const { server, storage } = await seeded();
    server.offline = true;
    renderAt({ name: 'home' });
    const confirm = vi.fn((_message?: string) => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]).toEqual(["Some changes haven't synced yet. Sign out and discard them?"]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
    expect(state().session?.userId).toBe(TEST_USER);
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(await storage.listCharacters()).toHaveLength(1);
  });

  it('discards them and signs out on "yes"', async () => {
    const { server, storage } = await seeded();
    server.offline = true;
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await signedOut()).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ session: null, characters: [] });
    expect(await storage.listCharacters()).toEqual([]);
    server.offline = false;
    expect(await testRemote(server).pullCharacters(0)).toEqual([]);
  });
});
