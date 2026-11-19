import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import { ErrorBoundary } from '../App';
import { fetchCharacter } from '../import/client';
import { CHARACTER_LIMIT, type ImportResult, type Remote } from '../remote/types';
import { memoryStorage, type AppStorage } from '../storage';
import { useStore } from '../store';
import { TEST_USER, ability, rawWithId, savedPlay, seed, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', mock);
  return mock;
};

/** The test player's device on an account that sends imports to the import service, as local development does. */
const importingRemote = () => testRemote(testServer({ importer: (ddbId) => fetchCharacter(ddbId) }));

async function emptyApp(storage: AppStorage = memoryStorage(), remote: Remote = importingRemote()) {
  await useStore.getState().init(storage, remote);
}

/** A device whose signed-in player already has ten characters, with D&D Beyond IDs 1 to 10. */
async function fullApp(remote: Remote = importingRemote()) {
  const storage = memoryStorage();
  const rawJson = loadRaw('vlad');
  for (let i = 1; i <= CHARACTER_LIMIT; i += 1) {
    await storage.putCharacter({
      id: `ddb-${i}-${TEST_USER}`, ownerId: TEST_USER, ddbId: String(i), name: `Vlad ${i}`, rawJson,
      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
    });
  }
  await emptyApp(storage, remote);
}

const LIMIT = 'You have ten characters. Delete one to add another.';

describe('Home screen', () => {
  it('invites the first import when there are no characters', async () => {
    await emptyApp();
    renderAt({ name: 'home' });
    expect(screen.getByText('Add your first character')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a character' })).toHaveAttribute('href', '#/import');
    expect(screen.getByRole('link', { name: 'About and credits' })).toHaveAttribute('href', '#/about');
  });

  it('lists a character with its class and level and links to its Combat view', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'home' });
    const link = screen.getByRole('link', { name: /Vlad/ });
    expect(link).toHaveAttribute('href', `#/c/${record.id}/combat`);
    expect(link).toHaveTextContent('Warlock 3');
    expect(link).toHaveTextContent('Imported');
  });

  it('deletes a character only after the player confirms', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Vlad/ })).toBeNull());
    expect(useStore.getState().characters).toEqual([]);
  });

  it('re-imports a character by its D&D Beyond ID', async () => {
    await seed('vlad', memoryStorage(), importingRemote());
    renderAt({ name: 'home' });
    const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText('Updated from D&D Beyond.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"1"}');
    expect(useStore.getState().characters).toHaveLength(1);
  });

  it('keeps the saved copy when a re-import fails', async () => {
    await seed('vlad', memoryStorage(), importingRemote());
    renderAt({ name: 'home' });
    stubFetch(() => json(403, { status: 'private' }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText(/This sheet is Private\..*Your saved copy still works\./)).toBeInTheDocument();
    expect(useStore.getState().characters).toHaveLength(1);
  });
});

describe('Import screen', () => {
  const linkField = () => screen.getByLabelText('D&D Beyond character link or number');

  it('imports by link and opens the character in Combat', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
    await userEvent.type(linkField(), 'https://www.dndbeyond.com/characters/123456789?utm=share');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"123456789"}');
    const [record] = useStore.getState().characters;
    expect(window.location.hash).toBe(`#/c/${record.id}/combat`);
    expect(screen.getByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
  });

  it('rejects text that is not a character link or number, without calling the service', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const fetchMock = stubFetch(() => json(200, {}));
    await userEvent.type(linkField(), 'https://example.com/characters/1');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Paste a D&D Beyond character link or its number.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'private', 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.'],
    [404, 'not-found', 'No character with that ID.'],
    [502, 'upstream-error', "D&D Beyond didn't respond as expected."],
  ])('explains a %i %s answer', async (httpStatus, status, message) => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(httpStatus, { status }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(useStore.getState().characters).toEqual([]);
  });

  it('says where the privacy setting is when the sheet is Private', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(403, { status: 'private' }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('on the Home step set Character Privacy to Public');
  });

  it('says so when the import service cannot be reached', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => { throw new TypeError('Failed to fetch'); });
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the import service.");
  });

  it('imports pasted JSON', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    // fireEvent, not userEvent.type: the fixture is about 250 KB.
    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(loadRaw('minkis')) } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
  });

  it('imports a chosen JSON file', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const file = new File([JSON.stringify(loadRaw('sid'))], 'sid.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Or choose a JSON file'), file);
    expect(await screen.findByRole('heading', { name: 'Sid' })).toBeInTheDocument();
  });

  it.each([
    [502, 'upstream-error'],
    [500, 'unreachable'],
  ])('points to the paste fallback and opens it after a %i %s answer', async (httpStatus, status) => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(httpStatus, { status }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can paste the character JSON below instead.');
    expect(screen.getByText('Paste the character JSON instead').closest('details')).toHaveAttribute('open');
  });

  it('keeps the paste section closed and gives no paste hint for a Private sheet', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(403, { status: 'private' }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('You can paste the character JSON below instead.');
    expect(screen.getByText('Paste the character JSON instead').closest('details')).not.toHaveAttribute('open');
  });

  it('says so when the character cannot be saved, whichever way it came in', async () => {
    await emptyApp();
    const original = useStore.getState().saveImported;
    useStore.setState({ saveImported: async () => { throw new Error('storage broke'); } });
    try {
      renderAt({ name: 'import' });
      stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
      await userEvent.type(linkField(), '42');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add this character. Try again.");
      expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();

      fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: '{"data":{"id":7,"name":"Blank"}}' } });
      await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't add this character. Try again.");
    } finally {
      useStore.setState({ saveImported: original });
    }
  });

  it('says so when the chosen file cannot be read, and lets the same file be chosen again', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const file = new File(['{}'], 'broken.json', { type: 'application/json' });
    file.text = () => Promise.reject(new Error('unreadable'));
    const input = screen.getByLabelText('Or choose a JSON file') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read that file.");
    expect(input.value).toBe('');
  });

  it('explains pasted text that is not JSON or not a character', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: '{ not json' } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(screen.getByRole('alert')).toHaveTextContent("That isn't valid JSON.");

    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: '{"hello":"world"}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(await screen.findByText("That doesn't look like a D&D Beyond character.")).toBeInTheDocument();
    expect(useStore.getState().characters).toEqual([]);
  });

  it('asks the account, which can refuse before the import service is called', async () => {
    const importer = vi.fn(async (_ddbId: string): Promise<ImportResult> => ({ status: 'ok', raw: loadRaw('vlad') }));
    const server = testServer({ importer });
    await emptyApp(memoryStorage(), testRemote(server));
    // Access was removed since this device last heard from the account.
    server.addUser(TEST_USER, 'Tess', { approved: false });
    renderAt({ name: 'import' });
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Your DM hasn't approved your account yet.");
    expect(importer).not.toHaveBeenCalled();

    server.addUser(TEST_USER, 'Tess', { approved: true });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
    expect(importer.mock.calls).toEqual([['42']]);
  });

  it.each([
    [401, 'unauthorized', 'Your sign-in has expired. Sign in again, then retry.'],
    [403, 'not-approved', "Your DM hasn't approved your account yet."],
    [429, 'rate-limited', 'Too many imports. Try again in an hour.'],
  ])('explains a %i %s answer and keeps the paste section closed', async (httpStatus, status, message) => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(httpStatus, { status }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent('You can paste the character JSON below instead.');
    expect(screen.getByText('Paste the character JSON instead').closest('details')).not.toHaveAttribute('open');
    expect(useStore.getState().characters).toEqual([]);
  });

  it('marks the paste section as one that unfolds', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const summary = screen.getByText('Paste the character JSON instead').closest('summary');
    const mark = summary?.lastElementChild;
    expect(mark).toHaveTextContent('▾');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  describe('when the player already has ten characters', () => {
    it('says so instead of asking for an eleventh by link', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 99) }));
      await userEvent.type(linkField(), '99');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(screen.getByRole('alert')).toHaveTextContent(LIMIT);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
      expect(screen.getByText('Paste the character JSON instead').closest('details')).not.toHaveAttribute('open');
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });

    it('still imports by link a character the player already has', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
      await userEvent.type(linkField(), 'https://www.dndbeyond.com/characters/3');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
      expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"3"}');
      expect(window.location.hash).toBe(`#/c/ddb-3-${TEST_USER}/combat`);
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });

    it('knows a character the player already has when its number is typed with leading zeros', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
      await userEvent.type(linkField(), '003');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });

    it('does not count a table admin\'s view of other players\' characters', async () => {
      const server = testServer({ importer: (ddbId) => fetchCharacter(ddbId) });
      server.addUser('user-dm', 'Dee', { approved: true, admin: true });
      await fullApp(testRemote(server));
      await useStore.getState().syncNow();
      await emptyApp(memoryStorage(), server.remote({ userId: 'user-dm' }));
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
      renderAt({ name: 'import' });
      stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
      await userEvent.type(linkField(), '3');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
      expect(window.location.hash).toBe('#/c/ddb-3-user-dm/combat');
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT + 1);
    });

    it('says so for pasted JSON of an eleventh', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(rawWithId('minkis', 99)) } });
      await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT);
      expect(screen.getByRole('alert')).not.toHaveTextContent("That doesn't look like a D&D Beyond character.");
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });

    it('says so for a chosen file of an eleventh', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      const file = new File([JSON.stringify(rawWithId('sid', 98))], 'sid.json', { type: 'application/json' });
      await userEvent.upload(screen.getByLabelText('Or choose a JSON file'), file);
      expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT);
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });

    it('still takes pasted JSON of a character the player already has', async () => {
      await fullApp();
      renderAt({ name: 'import' });
      fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(rawWithId('minkis', 3)) } });
      await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
    });
  });
});

describe('App', () => {
  it('shows the About screen with the SRD attribution and the not-affiliated statement', async () => {
    await emptyApp();
    renderAt({ name: 'about' });
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('System Reference Document 5.2');
    expect(main).toHaveTextContent('Creative Commons Attribution 4.0 International License');
    expect(main).toHaveTextContent('not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast');
  });

  it('says so when the character in the address is not on this device', async () => {
    await emptyApp();
    renderAt({ name: 'character', id: 'no-such-id', view: 'combat' });
    expect(screen.getByText("That character isn't on this device.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
  });

  it('warns when the device is not saving', async () => {
    const broken: AppStorage = { ...memoryStorage(), listCharacters: async () => { throw new Error('blocked'); } };
    await emptyApp(broken);
    renderAt({ name: 'home' });
    expect(screen.getByRole('alert')).toHaveTextContent("This device isn't saving changes.");
  });

  it('shows nothing that can be tapped until the character\'s saved play state has been read', async () => {
    const inner = memoryStorage();
    let held: Promise<void> | null = null;
    const storage: AppStorage = {
      ...inner,
      async listItems(characterId) {
        if (held) await held;
        return inner.listItems(characterId);
      },
    };
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    useStore.getState().use(ability('Hex'), 'combat');
    await waitFor(async () => expect(await savedPlay(inner, record.id)).toMatchObject({ spent: { pact: 1 } }));
    // The same device, opened again: nothing is open, and the next read of the saved state is held.
    await useStore.getState().init(storage, testRemote(server));
    let release: () => void = () => undefined;
    held = new Promise<void>((resolve) => { release = resolve; });

    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(useStore.getState()).toMatchObject({ openId: record.id, loaded: false });
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    release();
    expect(await screen.findByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Use / }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(useStore.getState().play.spent).toEqual({ pact: 1 });
  });

  it('switches between Combat and Explore from the header', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    const nav = await screen.findByRole('navigation', { name: 'View' });
    expect(within(nav).getByRole('link', { name: 'Combat' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('link', { name: 'Explore' }));
    expect(await screen.findByRole('region', { name: 'Skill checks' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/c/${record.id}/explore`);
  });

  it('catches a crashing screen, logs it, offers a way out and recovers on the next route', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let crash = true;
    function Boom() {
      if (crash) throw new Error('boom');
      return <p>Recovered</p>;
    }
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const fallback = screen.getByRole('alert');
    expect(fallback).toHaveTextContent('Something went wrong on this screen.');
    expect(within(fallback).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(within(fallback).getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
    expect(consoleError.mock.calls.some((args) => args.some((arg) => arg instanceof Error && arg.message === 'boom'))).toBe(true);

    crash = false;
    act(() => {
      window.location.hash = '#/about';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('loads the device and the account by itself on a fresh start, and asks for sign-in', async () => {
    useStore.setState({ ready: false, session: null, characters: [] });
    renderAt({ name: 'home' });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // No Supabase project is configured under test, so the app chooses the local stand-in account.
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as test player' }));
    expect(await screen.findByText('Add your first character')).toBeInTheDocument();
    expect(useStore.getState().persistent).toBe(true);
  });
});
