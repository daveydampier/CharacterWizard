import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { DB_NAME } from './idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayState } from '@cw/model';
import { idbStorage, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './index';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ddbId: `ddb-${id}`, name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: '2026-11-11T10:00:00.000Z', ...over,
});

const play: PlayState = {
  spent: { pact: 1, 'slot:1': 2 },
  concentrationKey: 'spell:1:base:slot',
  turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: true },
};

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe.each([
  ['memoryStorage', async (): Promise<AppStorage> => memoryStorage()],
  ['idbStorage', idbStorage],
])('%s', (_name, open) => {
  it('starts empty', async () => {
    const storage = await open();
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.getPlay('a')).toBeNull();
  });

  it('stores, replaces and lists characters', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putCharacter(character('a', { name: 'Renamed' }));
    const list = await storage.listCharacters();
    expect(list.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(list.find((c) => c.id === 'a')).toEqual(character('a', { name: 'Renamed' }));
  });

  it('stores and replaces play state per character, without the storage key leaking in', async () => {
    const storage = await open();
    await storage.putPlay('a', play);
    expect(await storage.getPlay('a')).toEqual(play);
    expect(await storage.getPlay('b')).toBeNull();
    const later: PlayState = { ...play, spent: {}, concentrationKey: null };
    await storage.putPlay('a', later);
    expect(await storage.getPlay('a')).toEqual(later);
  });

  it('deletes a character together with its play state', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putPlay('a', play);
    await storage.putPlay('b', play);
    await storage.deleteCharacter('a');
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual(['b']);
    expect(await storage.getPlay('a')).toBeNull();
    expect(await storage.getPlay('b')).toEqual(play);
  });
});

describe('idbStorage', () => {
  it('keeps data between two opens of the same database', async () => {
    const first = await idbStorage();
    await first.putCharacter(character('a'));
    await first.putPlay('a', play);
    const second = await idbStorage();
    expect(await second.listCharacters()).toEqual([character('a')]);
    expect(await second.getPlay('a')).toEqual(play);
  });

  it('closes its connection when a newer version is opened elsewhere, so that open is not blocked', async () => {
    await idbStorage();
    const newer = await openDB(DB_NAME, 2);
    expect(newer.version).toBe(2);
    newer.close();
  });
});

describe('openStorage', () => {
  it('uses IndexedDB when it is available', async () => {
    const { storage, persistent } = await openStorage();
    expect(persistent).toBe(true);
    await storage.putCharacter(character('a'));
    expect(await (await idbStorage()).listCharacters()).toEqual([character('a')]);
  });

  it('falls back to memory and says so when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { storage, persistent } = await openStorage();
    expect(persistent).toBe(false);
    await storage.putCharacter(character('a'));
    expect(await storage.listCharacters()).toEqual([character('a')]);
  });
});
