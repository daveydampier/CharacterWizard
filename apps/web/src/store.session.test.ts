import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryServer, type MemoryServer } from './remote/memory';
import { CHARACTER_LIMIT, type Remote } from './remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter } from './storage';
import { useStore } from './store';
import { syncOnce } from './sync/engine';
import { TEST_USER, ability, rawWithId, savedPlay, seed, testRemote, testServer } from './test/helpers';

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const DM = 'user-dm';
const OTHER = 'user-other';

/** A second device signed in to the same account, with nothing to do with the store. */
const otherDevice = (server: MemoryServer, userId: string = TEST_USER) =>
  ({ storage: memoryStorage(), remote: server.remote({ userId }) });

const stored = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: TEST_USER, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
  importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true, ...over,
});

describe('starting the app', () => {
  it('starts once when asked twice at the same moment, as React does in development', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    await Promise.all([state().init(), state().init()]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ ready: true, session: null });
    open.mockRestore();
  });

  it('starts again when asked again later', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    await state().init();
    await state().init();
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });
});

describe('who is signed in', () => {
  it('has no session on a device where nobody has signed in, and is ready all the same', async () => {
    await state().init(memoryStorage(), testServer().remote());
    expect(state()).toMatchObject({ ready: true, session: null, characters: [] });
    expect(await state().saveImported(loadRaw('vlad'))).toBeNull();
    expect(state().canAddCharacter()).toBe(false);
  });

  it('signs in, learns the profile and remembers both on the device', async () => {
    const storage = memoryStorage();
    const server = memoryServer();
    await state().init(storage, server.remote({ signInAs: { id: 'user-new', displayName: 'Nell' } }));
    expect(state().session).toBeNull();
    await state().signIn();
    const session = { userId: 'user-new', profile: { id: 'user-new', displayName: 'Nell', approved: true, isTableAdmin: true } };
    expect(state().session).toEqual(session);
    expect(await storage.getMeta('session')).toEqual(session);
  });

  it('opens from the device when the account cannot say who is signed in, and asks for sign-in to sync', async () => {
    const storage = memoryStorage();
    const server = testServer();
    await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    // The same device later: the session has ended, so the account reports nobody.
    await state().init(storage, server.remote());
    expect(state().session?.userId).toBe(TEST_USER);
    expect(state().session?.profile?.displayName).toBe('Tess');
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
    expect(state().syncState).toBe('signin');
  });

  it('keeps an unapproved player\'s session but sends and fetches nothing', async () => {
    const server = memoryServer();
    server.addUser('user-new', 'Nell');
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-new', { ownerId: 'user-new' }));
    await state().init(storage, server.remote({ userId: 'user-new' }));
    expect(state().session?.profile).toMatchObject({ approved: false });
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    expect(await server.remote({ userId: DM }).pullCharacters(0)).toEqual([]);
  });

  it('notices approval at the next sync and then sends what it holds', async () => {
    const server = memoryServer();
    server.addUser('user-new', 'Nell');
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-new', { ownerId: 'user-new' }));
    await state().init(storage, server.remote({ userId: 'user-new' }));
    await server.remote({ userId: DM }).setApproved('user-new', true);
    await state().syncNow();
    expect(state().session?.profile?.approved).toBe(true);
    expect((await server.remote({ userId: DM }).pullCharacters(0)).map((c) => c.id)).toEqual(['ddb-1-user-new']);
    expect(state().syncState).toBe('saved');
  });

  it('removes the previous account\'s copy when a different user signs in on the device', async () => {
    const storage = memoryStorage();
    const server = testServer();
    server.addUser(OTHER, 'Otto', { approved: true });
    await seed('vlad', storage, testRemote(server));
    await state().init(storage, server.remote({ userId: OTHER }));
    expect(state().session?.userId).toBe(OTHER);
    expect(state().characters).toEqual([]);
    expect(await storage.listCharacters()).toEqual([]);
  });
});

describe('first sign-in on a device that already has characters', () => {
  it('gives them to the player, re-keyed, and uploads them with their play state', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(stored('local-uuid', { ownerId: null }));
    await storage.putItem({
      characterId: 'local-uuid', kind: 'play', key: 'state', data: { spent: { pact: 1 }, concentrationKey: null },
      updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
    });
    const server = testServer();
    await state().init(storage, testRemote(server));
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER, dirty: false }]);
    const remote = testRemote(server);
    expect((await remote.pullCharacters(0)).map((c) => c.id)).toEqual(['ddb-1-user-test']);
    expect((await remote.pullItems(0))[0]).toMatchObject({ characterId: 'ddb-1-user-test', kind: 'play', data: { spent: { pact: 1 } } });
  });
});

describe('syncing', () => {
  it('says "waiting" after a change and "saved" once the account has it', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    expect(state().characters[0].dirty).toBe(false);
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    expect((await testRemote(server).pullItems(0))[0]).toMatchObject({ characterId: record.id, data: { spent: { pact: 1 } } });
  });

  it('does not count a pill flip as something to sync', async () => {
    await seed('vlad');
    await state().syncNow();
    state().togglePill('action');
    await settle();
    expect(state().syncState).toBe('saved');
  });

  it('keeps waiting while the account cannot be reached, and catches up afterwards', async () => {
    const server = testServer();
    await seed('vlad', memoryStorage(), testRemote(server));
    server.offline = true;
    await state().syncNow();
    expect(state().syncState).toBe('waiting');
    server.offline = false;
    await state().syncNow();
    expect(state().syncState).toBe('saved');
  });

  it('asks for sign-in when the account rejects the session', async () => {
    const server = testServer();
    const remote = testRemote(server);
    await seed('vlad', memoryStorage(), remote);
    await remote.signOut();
    await state().syncNow();
    expect(state().syncState).toBe('signin');
    expect(state().session?.userId).toBe(TEST_USER);
    expect(state().characters).toHaveLength(1);
  });

  it('shows a character imported on another device', async () => {
    const server = testServer();
    await state().init(memoryStorage(), testRemote(server));
    const other = otherDevice(server);
    await other.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(other);
    await state().syncNow();
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
  });

  it('shows what another device spent on the open character, and keeps this device\'s turn', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    state().togglePill('reaction');
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() + 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    await state().syncNow();
    expect(state().play.spent).toEqual({ pact: 2 });
    expect(state().play.turn.reaction).toBe(true);
    expect(state().undo).toBeNull();
  });

  it('closes the open character when it was deleted on another device', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    const [theirs] = await other.storage.listCharacters();
    await other.storage.putCharacter({
      ...theirs, deleted: true, rawJson: null, dirty: true, updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    await syncOnce(other);
    await state().syncNow();
    expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
    expect(record.id).toBe(theirs.id);
  });

  it('keeps a change the player made while a fetch was running', async () => {
    const server = testServer();
    const inner = testRemote(server);
    let duringFetch: () => void = () => undefined;
    const remote: Remote = {
      ...inner,
      async pullItems(afterRev) {
        const rows = await inner.pullItems(afterRev);
        duringFetch();
        return rows;
      },
    };
    const record = await seed('vlad', memoryStorage(), remote);
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() - 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    duringFetch = () => {
      duringFetch = () => undefined;
      state().use(ability('Hex'), 'combat');
    };
    await state().syncNow();
    expect(state().play.spent).toEqual({ pact: 1 });
    await state().syncNow();
    expect((await inner.pullItems(0))[0].data).toMatchObject({ spent: { pact: 1 } });
  });

  it('does not let a pill flipped during a fetch undo what another device spent', async () => {
    const server = testServer();
    const inner = testRemote(server);
    let duringFetch: () => void = () => undefined;
    const remote: Remote = {
      ...inner,
      async pullItems(afterRev) {
        const rows = await inner.pullItems(afterRev);
        duringFetch();
        return rows;
      },
    };
    const record = await seed('vlad', memoryStorage(), remote);
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date().toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    duringFetch = () => {
      duringFetch = () => undefined;
      state().togglePill('reaction');
    };
    await state().syncNow();
    // The turn is this device's own; what is spent is what the other device sent.
    expect(state().play.turn.reaction).toBe(true);
    expect(state().play.spent).toEqual({ pact: 2 });
    await settle();
    await state().syncNow();
    expect((await inner.pullItems(0))[0].data).toMatchObject({ spent: { pact: 2 } });
  });

  it('keeps a change the player made while the fetched state was being read back', async () => {
    const server = testServer();
    const inner = testRemote(server);
    const storage = memoryStorage();
    const record = await seed('vlad', storage, inner);
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() - 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    // The first read of this character's items is the store reading back what was fetched: tap then.
    const listItems = storage.listItems;
    let tapped = false;
    storage.listItems = async (characterId?: string) => {
      const rows = await listItems(characterId);
      if (characterId !== undefined && !tapped) {
        tapped = true;
        state().use(ability('Hex'), 'combat');
      }
      return rows;
    };
    await state().syncNow();
    storage.listItems = listItems;
    expect(tapped).toBe(true);
    expect(state().play.spent).toEqual({ pact: 1 });
    await settle();
    await state().syncNow();
    expect((await inner.pullItems(0))[0].data).toMatchObject({ spent: { pact: 1 } });
  });

  it('sends a deletion and then forgets the character entirely', async () => {
    const server = testServer();
    const storage = memoryStorage();
    const record = await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    await state().remove(record.id);
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(await storage.listCharacters()).toEqual([]);
    expect((await testRemote(server).pullCharacters(0))[0]).toMatchObject({ id: record.id, deleted: true });
    expect(state().syncState).toBe('saved');
  });
});

describe('the ten-character limit', () => {
  const fill = async (storage: AppStorage) => {
    for (let i = 1; i <= CHARACTER_LIMIT; i += 1) await storage.putCharacter(stored(`ddb-${i}-user-test`, { ddbId: String(i) }));
  };

  it('refuses an eleventh character of the player\'s own', async () => {
    const storage = memoryStorage();
    await fill(storage);
    await state().init(storage, testRemote());
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
    expect(state().canAddCharacter()).toBe(false);
    expect(await state().saveImported(rawWithId('minkis', 99))).toBeNull();
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
  });

  it('still lets a full account re-import a character it already has', async () => {
    const storage = memoryStorage();
    await fill(storage);
    await state().init(storage, testRemote());
    expect(await state().saveImported(rawWithId('vlad', 1))).toMatchObject({ id: 'ddb-1-user-test' });
  });

  it('does not count other players\' characters against a table admin', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await fill(player.storage);
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
    expect(state().canAddCharacter()).toBe(true);
  });

  it('says so when the account is full because of another device', async () => {
    const server = testServer();
    const other = otherDevice(server);
    await fill(other.storage);
    await syncOnce(other);
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-99-user-test', { ddbId: '99' }));
    await storage.setMeta('session', { userId: TEST_USER, profile: { displayName: 'Tess', approved: true, isTableAdmin: false } });
    await storage.setMeta('cursor:characters', 1_000_000);
    await state().init(storage, testRemote(server));
    expect(state().syncState).toBe('limit');
  });
});

describe('a table admin', () => {
  it('sees every character and re-imports a player\'s character without becoming its owner', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER }]);
    const again = await state().saveImported(loadRaw('vlad'), 'ddb-1-user-test');
    expect(again).toMatchObject({ id: 'ddb-1-user-test', ownerId: TEST_USER });
    expect(state().characters).toHaveLength(1);
    // Importing the same sheet without naming the player's copy makes the admin's own.
    const own = await state().saveImported(loadRaw('vlad'));
    expect(own).toMatchObject({ id: `ddb-1-${DM}`, ownerId: DM });
    expect(state().characters).toHaveLength(2);
  });

  it('refuses to re-import a character that is not on the device', async () => {
    await state().init(memoryStorage(), testRemote());
    expect(await state().saveImported(loadRaw('vlad'), 'no-such-id')).toBeNull();
  });

  it('starts seeing everyone\'s characters once made an admin', async () => {
    const server = testServer();
    server.addUser(OTHER, 'Otto', { approved: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: OTHER }));
    expect(state().characters).toEqual([]);
    server.addUser(OTHER, 'Otto', { approved: true, admin: true });
    await state().syncNow();
    expect(state().characters.map((c) => c.id)).toEqual(['ddb-1-user-test']);
  });

  it('loses the other players\' characters from the device when no longer an admin', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    const storage = memoryStorage();
    await state().init(storage, server.remote({ userId: DM }));
    const own = await state().saveImported(rawWithId('minkis', 2));
    await state().open('ddb-1-user-test');
    expect(state().openId).toBe('ddb-1-user-test');
    server.addUser(DM, 'Dee', { approved: true });
    await state().syncNow();
    expect(state().characters.map((c) => c.id)).toEqual([own?.id]);
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual([own?.id]);
    expect(state()).toMatchObject({ openId: null, sheet: null });
  });

  it('lists profiles and approves through the account', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    server.addUser('user-new', 'Nell');
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect((await state().listProfiles()).map((p) => p.displayName)).toEqual(['Dee', 'Nell', 'Tess']);
    await state().setApproved('user-new', true);
    expect((await state().listProfiles()).find((p) => p.id === 'user-new')?.approved).toBe(true);
    await expect(state().setApproved(DM, false)).rejects.toMatchObject({ kind: 'refused' });
  });
});

describe('signing out', () => {
  it('removes the device\'s copy of everything once the account has it all', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(await state().signOut()).toBe(true);
    expect(state()).toMatchObject({ ready: true, session: null, characters: [], openId: null });
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('session')).toBeNull();
    // It synced first, so nothing was lost.
    expect((await testRemote(server).pullItems(0))[0]).toMatchObject({ characterId: record.id, data: { spent: { pact: 1 } } });
  });

  it('refuses while changes cannot be sent, unless told to discard them', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    server.offline = true;
    expect(await state().signOut()).toBe(false);
    expect(state().session?.userId).toBe(TEST_USER);
    expect(await savedPlay(storage, record.id)).not.toBeNull();
    expect(await state().signOut(true)).toBe(true);
    expect(state().session).toBeNull();
    expect(await storage.listCharacters()).toEqual([]);
  });

  it('does not come back as "sign in again" after signing out', async () => {
    await seed('vlad');
    await state().signOut(true);
    expect(state()).toMatchObject({ session: null, syncState: 'saved' });
  });

  it('waits for a sync that is running, so nothing it fetched is left on the device', async () => {
    const server = testServer();
    const inner = testRemote(server);
    let hold = false;
    let release: () => void = () => undefined;
    const remote: Remote = {
      ...inner,
      async pullCharacters(afterRev) {
        const rows = await inner.pullCharacters(afterRev);
        if (hold) await new Promise<void>((resolve) => { release = resolve; });
        return rows;
      },
    };
    const storage = memoryStorage();
    await seed('vlad', storage, remote);
    await state().syncNow();
    // Another device adds a character, which the next fetch will bring here.
    const other = otherDevice(server);
    await other.storage.putCharacter(stored('ddb-7-user-test', { ddbId: '7', name: 'Second character' }));
    await syncOnce(other);
    hold = true;
    const syncing = state().syncNow();
    await settle();
    const signingOut = state().signOut(true);
    await settle();
    release();
    expect(await signingOut).toBe(true);
    await syncing;
    expect(state().session).toBeNull();
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.listItems()).toEqual([]);
  });
});

describe('import', () => {
  it('goes through the account, which checks the player first', async () => {
    const server = memoryServer({ importer: async () => ({ status: 'ok', raw: loadRaw('vlad') }) });
    server.addUser('user-new', 'Nell');
    await state().init(memoryStorage(), server.remote({ userId: 'user-new' }));
    expect(await state().importCharacter('1')).toEqual({ status: 'not-approved' });
    server.addUser('user-new', 'Nell', { approved: true });
    expect((await state().importCharacter('1')).status).toBe('ok');
  });
});

describe('saved state that cannot be read', () => {
  it('leaves the character closed, says the device is not saving, and overwrites nothing', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().init(storage, testRemote(server));
    const listItems = storage.listItems;
    storage.listItems = async () => { throw new Error('blocked'); };
    await state().open(record.id);
    expect(state()).toMatchObject({ openId: null, sheet: null, loaded: false, persistent: false });
    // Nothing can be changed, so nothing is written over what could not be read.
    state().togglePill('action');
    await settle();
    storage.listItems = listItems;
    expect(await savedPlay(storage, record.id)).toMatchObject({ spent: { pact: 1 }, turn: { action: false, bonus: true } });
  });

  it('opens the character once the saved state can be read again', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().init(storage, testRemote(server));
    const listItems = storage.listItems;
    storage.listItems = async () => { throw new Error('blocked'); };
    await state().open(record.id);
    storage.listItems = listItems;
    await state().open(record.id);
    expect(state()).toMatchObject({ openId: record.id, loaded: true });
    expect(state().play.spent).toEqual({ pact: 1 });
  });

  it('keeps what is on screen when a fetched change cannot be read back', async () => {
    const server = testServer();
    const storage = memoryStorage();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() + 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    // The engine lists every item at once; the store reads one character's. Only the second fails.
    const listItems = storage.listItems;
    storage.listItems = async (characterId?: string) => {
      if (characterId !== undefined) throw new Error('blocked');
      return listItems();
    };
    await state().syncNow();
    expect(state().play.spent).toEqual({ pact: 1 });
    expect(state().undo).not.toBeNull();
    expect(state().persistent).toBe(false);
    expect(state().openId).toBe(record.id);
  });
});
