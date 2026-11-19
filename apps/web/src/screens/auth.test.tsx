import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import { memoryServer, type MemoryServer } from '../remote/memory';
import { RemoteError, type Remote } from '../remote/types';
import type { Route } from '../router';
import { memoryStorage, type AppStorage } from '../storage';
import { useStore } from '../store';
import { renderAt } from '../test/render';
import { SignInScreen } from './SignIn';

const state = () => useStore.getState();

const DM = 'user-dm';
const NEW = 'user-new';
const TESTER = { id: 'user-dev', displayName: 'Test player' };

/** A device where nobody is signed in, whose sign-in button signs in the test player. */
async function signedOutApp(wrap: (remote: Remote) => Remote = (remote) => remote): Promise<void> {
  await state().init(memoryStorage(), wrap(memoryServer().remote({ signInAs: TESTER })));
}

/** An account with a table admin, and Nell, who has signed in but is not approved. */
function tableWithNewPlayer(): MemoryServer {
  const server = memoryServer();
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  server.addUser(NEW, 'Nell');
  return server;
}

/** A device signed in as Nell. */
async function waitingApp(server: MemoryServer = tableWithNewPlayer(), storage: AppStorage = memoryStorage()): Promise<MemoryServer> {
  await state().init(storage, server.remote({ userId: NEW }));
  return server;
}

const signInButton = () => screen.queryByRole('button', { name: /^Continue/ });

describe('Sign-in screen', () => {
  it.each<[string, Route]>([
    ['home', { name: 'home' }],
    ['import', { name: 'import' }],
    ['players', { name: 'players' }],
    ['a character', { name: 'character', id: 'ddb-1-user-dev', view: 'combat' }],
  ])('is all a signed-out device shows at the %s route', async (_name, route) => {
    await signedOutApp();
    renderAt(route);
    expect(screen.getByRole('heading', { level: 1, name: 'Character Wizard' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to see your characters on any device.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled();
    expect(screen.getByText('Local development: no account is used.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About and credits' })).toHaveAttribute('href', '#/about');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('leaves About open to a signed-out device', async () => {
    await signedOutApp();
    renderAt({ name: 'about' });
    expect(screen.getByRole('heading', { name: 'About Character Wizard' })).toBeInTheDocument();
    expect(signInButton()).toBeNull();
  });

  it('signs in as the test player and shows their characters', async () => {
    await signedOutApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
    expect(signInButton()).toBeNull();
    expect(state().session?.profile).toMatchObject({ displayName: 'Test player', approved: true });
  });

  it('turns the button off while signing in', async () => {
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    await signedOutApp((remote) => ({ ...remote, signIn: () => held.then(() => remote.signIn()) }));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
  });

  it('turns the button back on when signing in fails', async () => {
    await signedOutApp((remote) => ({ ...remote, signIn: () => Promise.reject(new Error('no popup')) }));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled());
  });

  it('offers Discord when the build has an account to talk to', async () => {
    await signedOutApp();
    render(<SignInScreen local={false} />);
    expect(screen.getByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as test player' })).toBeNull();
    expect(screen.queryByText('Local development: no account is used.')).toBeNull();
  });

  it('says so when sign-in cannot start, and lets the player try again', async () => {
    let fail = true;
    await signedOutApp((remote) => ({
      ...remote,
      async signIn() {
        if (fail) throw new RemoteError('other', 'provider is not enabled');
        await remote.signIn();
      },
    }));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start sign-in. Check your connection, then try again.");
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns on a production build that has no account settings', () => {
    render(<SignInScreen local production />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This site was built without its account settings, so nothing here is saved to an account. Tell whoever runs the site.',
    );
    expect(screen.queryByText('Local development: no account is used.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled();
  });

  it('shows no warning in local development, nor on a build that has an account', () => {
    const dev = render(<SignInScreen local production={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Local development: no account is used.')).toBeInTheDocument();
    dev.unmount();
    render(<SignInScreen local={false} production />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument();
  });
});

describe('Waiting screen', () => {
  it.each<[string, Route]>([
    ['home', { name: 'home' }],
    ['import', { name: 'import' }],
    ['players', { name: 'players' }],
    ['a character', { name: 'character', id: `ddb-1-${NEW}`, view: 'combat' }],
  ])('is all an unapproved player sees at the %s route, and names their account', async (_name, route) => {
    await waitingApp();
    renderAt(route);
    expect(screen.getByRole('heading', { level: 1, name: 'Waiting for your DM to approve you' })).toBeInTheDocument();
    expect(screen.getByText('Signed in as Nell.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Check again', 'Sign out']);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves About open to an unapproved player', async () => {
    await waitingApp();
    renderAt({ name: 'about' });
    expect(screen.getByRole('heading', { name: 'About Character Wizard' })).toBeInTheDocument();
  });

  it('shows the characters once the table admin has approved and the player checks again', async () => {
    const server = await waitingApp();
    renderAt({ name: 'home' });
    await server.remote({ userId: DM }).setApproved(NEW, true);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
    expect(screen.queryByText('Still waiting.')).toBeNull();
  });

  it('says it is still waiting when the player checks again and is not approved', async () => {
    await waitingApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Still waiting.');
    expect(screen.getByRole('heading', { name: 'Waiting for your DM to approve you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('says the same when the account cannot be reached, since it cannot tell which it is', async () => {
    const server = await waitingApp();
    renderAt({ name: 'home' });
    server.offline = true;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Still waiting.');
  });

  it('asks before signing out when this device holds a character the account has never been sent', async () => {
    const storage = memoryStorage();
    // Imported before accounts existed. An unapproved player cannot send it.
    await storage.putCharacter({
      id: 'local-1', ownerId: null, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
    });
    await waitingApp(tableWithNewPlayer(), storage);
    renderAt({ name: 'home' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Some changes haven't synced yet. Sign out and discard them?"));
    expect(state().session?.userId).toBe(NEW);
    expect(await storage.listCharacters()).toHaveLength(1);
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(await storage.listCharacters()).toEqual([]);
    confirm.mockRestore();
  });

  it('goes back to sign-in when the player signs out', async () => {
    const storage = memoryStorage();
    await waitingApp(tableWithNewPlayer(), storage);
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(signInButton()).toBeInTheDocument();
    expect(state().session).toBeNull();
    expect(await storage.getMeta('session')).toBeNull();
  });
});

describe('Waiting screen before the account has answered', () => {
  /** A device that remembers who signed in but has never learned their profile, with no connection. */
  async function uncheckedApp(): Promise<{ server: MemoryServer; storage: AppStorage }> {
    const server = tableWithNewPlayer();
    server.addUser(NEW, 'Nell', { approved: true });
    server.offline = true;
    const storage = memoryStorage();
    await storage.setMeta('session', { userId: NEW, profile: null });
    await state().init(storage, server.remote({ userId: NEW }));
    return { server, storage };
  }

  it('says it is checking and that it needs a connection', async () => {
    await uncheckedApp();
    renderAt({ name: 'home' });
    expect(screen.getByRole('heading', { level: 1, name: 'Checking your account' })).toBeInTheDocument();
    expect(screen.getByText('This needs a connection.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Try again', 'Sign out']);
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  it('stays there when trying again still gets no answer', async () => {
    await uncheckedApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Checking your account' })).toBeInTheDocument();
    expect(screen.queryByText('Still waiting.')).toBeNull();
  });

  it('shows the characters when trying again reaches the account', async () => {
    const { server } = await uncheckedApp();
    renderAt({ name: 'home' });
    server.offline = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
  });

  it('goes back to sign-in when the player signs out', async () => {
    const { storage } = await uncheckedApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(state().session).toBeNull();
    expect(await storage.getMeta('session')).toBeNull();
  });
});
