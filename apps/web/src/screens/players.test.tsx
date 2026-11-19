import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryServer } from '../remote/memory';
import { RemoteError, type Profile, type Remote } from '../remote/types';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { TEST_USER, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

const state = () => useStore.getState();

const DM = 'user-dm';
const NEW = 'user-new';

/** An account with a table admin (Dee), an approved player (Tess) and one who is waiting (Nell). */
function table(): MemoryServer {
  const server = testServer();
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  server.addUser(NEW, 'Nell');
  return server;
}

/** The Players screen on a device signed in as the table admin. */
async function playersAsAdmin(server: MemoryServer = table(), wrap: (remote: Remote) => Remote = (remote) => remote): Promise<MemoryServer> {
  await state().init(memoryStorage(), wrap(server.remote({ userId: DM })));
  renderAt({ name: 'players' });
  return server;
}

const waiting = () => screen.findByRole('region', { name: 'Waiting for approval' });
const approved = () => screen.findByRole('region', { name: 'Approved' });
const approvedOnAccount = async (server: MemoryServer, id: string): Promise<boolean | undefined> =>
  (await server.remote({ userId: DM }).listProfiles()).find((p) => p.id === id)?.approved;

describe('Players screen', () => {
  it('is not for a player who is not the table admin', async () => {
    const remote = testRemote();
    const listProfiles = vi.spyOn(remote, 'listProfiles');
    await state().init(memoryStorage(), remote);
    renderAt({ name: 'players' });
    expect(screen.getByText('Only the table admin can manage players.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
    expect(screen.queryByRole('heading', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('lists the people waiting, each with Approve, and the approved, each with Remove access', async () => {
    await playersAsAdmin();
    expect(screen.getByRole('heading', { level: 1, name: 'Players' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '‹ Characters' })).toHaveAttribute('href', '#/');

    const waitingSection = await waiting();
    expect(within(waitingSection).getByRole('heading', { level: 2, name: 'Waiting for approval' })).toBeInTheDocument();
    expect(within(waitingSection).getAllByRole('listitem')).toHaveLength(1);
    expect(within(waitingSection).getByRole('listitem')).toHaveTextContent('Nell');
    expect(within(waitingSection).getByRole('button', { name: 'Approve Nell' })).toHaveTextContent(/^Approve$/);

    const approvedSection = await approved();
    expect(within(approvedSection).getByRole('heading', { level: 2, name: 'Approved' })).toBeInTheDocument();
    expect(within(approvedSection).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['DeeYou', 'TessRemove access']);
    expect(within(approvedSection).getByRole('button', { name: 'Remove access for Tess' })).toHaveTextContent(/^Remove access$/);
  });

  it('gives the admin\'s own row "You" and no button', async () => {
    await playersAsAdmin();
    const own = within(await approved()).getAllByRole('listitem')[0];
    expect(own).toHaveTextContent('Dee');
    expect(within(own).getByText('You')).toBeInTheDocument();
    expect(within(own).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /Dee/ })).toBeNull();
  });

  it('says "Loading…" until the players arrive', async () => {
    let arrive: (profiles: Profile[]) => void = () => undefined;
    const held = new Promise<Profile[]>((resolve) => { arrive = resolve; });
    await playersAsAdmin(table(), (remote) => ({ ...remote, listProfiles: () => held }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    arrive([{ id: DM, displayName: 'Dee', approved: true, isTableAdmin: true }]);
    expect(await approved()).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('says "Nobody is waiting." when nobody is', async () => {
    const server = table();
    server.addUser(NEW, 'Nell', { approved: true });
    await playersAsAdmin(server);
    expect(within(await waiting()).getByText('Nobody is waiting.')).toBeInTheDocument();
    expect(within(await waiting()).queryByRole('button')).toBeNull();
  });

  it('approves a waiting player and loads the list again', async () => {
    let listProfiles = vi.fn<Remote['listProfiles']>();
    const server = await playersAsAdmin(table(), (remote) => {
      listProfiles = vi.fn(() => remote.listProfiles());
      return { ...remote, listProfiles };
    });
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await within(await approved()).findByRole('button', { name: 'Remove access for Nell' })).toBeInTheDocument();
    expect(within(await waiting()).getByText('Nobody is waiting.')).toBeInTheDocument();
    expect(await approvedOnAccount(server, NEW)).toBe(true);
    expect(listProfiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes an approved player\'s access and loads the list again', async () => {
    const server = await playersAsAdmin();
    await userEvent.click(within(await approved()).getByRole('button', { name: 'Remove access for Tess' }));
    expect(await within(await waiting()).findByRole('button', { name: 'Approve Tess' })).toBeInTheDocument();
    expect(within(await approved()).queryByRole('button')).toBeNull();
    expect(await approvedOnAccount(server, TEST_USER)).toBe(false);
  });

  it('says so when the players cannot be loaded, and loads them on "Try again"', async () => {
    const server = table();
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    server.offline = true;
    renderAt({ name: 'players' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the players.");
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('link', { name: '‹ Characters' })).toBeInTheDocument();

    server.offline = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(within(await waiting()).getByRole('button', { name: 'Approve Nell' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when a change fails, and keeps the list', async () => {
    const server = await playersAsAdmin(table(), (remote) => ({
      ...remote, setApproved: () => Promise.reject(new RemoteError('offline')),
    }));
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change that. Try again.");
    expect(within(await waiting()).getByRole('button', { name: 'Approve Nell' })).toBeEnabled();
    expect(await approvedOnAccount(server, NEW)).toBe(false);
  });

  it('clears that message when the next change works', async () => {
    let fail = true;
    await playersAsAdmin(table(), (remote) => ({
      ...remote,
      setApproved: (id, value) => (fail ? Promise.reject(new RemoteError('offline')) : remote.setApproved(id, value)),
    }));
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await within(await approved()).findByRole('button', { name: 'Remove access for Nell' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
