import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import { memoryStorage, type AppStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';
import { renderAt } from '../test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', mock);
  return mock;
};

async function emptyApp(storage: AppStorage = memoryStorage()) {
  await useStore.getState().init(storage);
}

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
    await seed('vlad');
    renderAt({ name: 'home' });
    const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText('Updated from D&D Beyond.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"1"}');
    expect(useStore.getState().characters).toHaveLength(1);
  });

  it('keeps the saved copy when a re-import fails', async () => {
    await seed('vlad');
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

  it('switches between Combat and Explore from the header', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    const nav = await screen.findByRole('navigation', { name: 'View' });
    expect(within(nav).getByRole('link', { name: 'Combat' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('link', { name: 'Explore' }));
    expect(await screen.findByRole('region', { name: 'Skill checks' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/c/${record.id}/explore`);
  });

  it('loads stored characters by itself on a fresh start', async () => {
    useStore.setState({ ready: false, characters: [] });
    renderAt({ name: 'home' });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Add your first character')).toBeInTheDocument();
    expect(useStore.getState().persistent).toBe(true);
  });
});
