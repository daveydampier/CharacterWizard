import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION } from './idb';
import {
  idbStorage, memoryStorage, openStorage, serial, type AppStorage, type StoredCharacter, type StoredItem,
} from './index';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: 'user-1', ddbId: `ddb-${id}`, name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: '2026-11-11T10:00:00.000Z', updatedAt: '2026-11-11T10:00:00.000Z', deleted: false, dirty: false,
  ...over,
});

const item = (characterId: string, kind: StoredItem['kind'], key: string, data: unknown): StoredItem => ({
  characterId, kind, key, data, updatedAt: '2026-11-11T10:00:00.000Z', deleted: false, dirty: true,
});

const byKey = (a: StoredItem, b: StoredItem): number => `${a.kind}|${a.key}`.localeCompare(`${b.kind}|${b.key}`);

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
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('user')).toBeNull();
  });

  it('stores, replaces and lists characters', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putCharacter(character('a', { name: 'Renamed', dirty: true }));
    const list = await storage.listCharacters();
    expect(list.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(list.find((c) => c.id === 'a')).toEqual(character('a', { name: 'Renamed', dirty: true }));
  });

  it('stores items by character, kind and key, and replaces one with the same three', async () => {
    const storage = await open();
    await storage.putItem(item('a', 'play', 'state', { spent: { pact: 1 } }));
    await storage.putItem(item('a', 'edit', 'spell:1:base:slot', { hidden: true }));
    await storage.putItem(item('b', 'play', 'state', { spent: {} }));
    await storage.putItem(item('a', 'play', 'state', { spent: { pact: 2 } }));
    expect((await storage.listItems('a')).sort(byKey)).toEqual([
      item('a', 'edit', 'spell:1:base:slot', { hidden: true }),
      item('a', 'play', 'state', { spent: { pact: 2 } }),
    ]);
    expect(await storage.listItems()).toHaveLength(3);
  });

  it('removes one item and leaves the rest', async () => {
    const storage = await open();
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.putItem(item('a', 'turn', 'state', 2));
    await storage.removeItem('a', 'play', 'state');
    expect(await storage.listItems('a')).toEqual([item('a', 'turn', 'state', 2)]);
  });

  it('removes a character together with its items', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.putItem(item('b', 'play', 'state', 2));
    await storage.removeCharacter('a');
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual(['b']);
    expect(await storage.listItems()).toEqual([item('b', 'play', 'state', 2)]);
  });

  it('gives a character a new ID and moves its items to it', async () => {
    const storage = await open();
    await storage.putCharacter(character('old', { ownerId: null }));
    await storage.putItem(item('old', 'play', 'state', 1));
    await storage.putItem(item('other', 'play', 'state', 2));
    await storage.rekeyCharacter('old', character('new'));
    expect(await storage.listCharacters()).toEqual([character('new')]);
    expect(await storage.listItems('old')).toEqual([]);
    expect(await storage.listItems('new')).toEqual([item('new', 'play', 'state', 1)]);
    expect(await storage.listItems('other')).toHaveLength(1);
  });

  it('keeps named values', async () => {
    const storage = await open();
    await storage.setMeta('user', { id: 'user-1' });
    await storage.setMeta('cursor', 12);
    expect(await storage.getMeta('user')).toEqual({ id: 'user-1' });
    expect(await storage.getMeta('cursor')).toBe(12);
  });

  it('empties everything on clear', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.setMeta('user', 'x');
    await storage.clear();
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('user')).toBeNull();
  });

  it('stores a copy and returns a copy', async () => {
    const storage = await open();
    const given = item('a', 'play', 'state', { spent: { pact: 1 } });
    await storage.putItem(given);
    (given.data as { spent: Record<string, number> }).spent.pact = 99;
    const [first] = await storage.listItems('a');
    expect(first.data).toEqual({ spent: { pact: 1 } });
    (first.data as { spent: Record<string, number> }).spent.pact = 50;
    expect((await storage.listItems('a'))[0].data).toEqual({ spent: { pact: 1 } });
  });
});

describe('idbStorage', () => {
  it('keeps data between two opens of the same database', async () => {
    const first = await idbStorage();
    await first.putCharacter(character('a'));
    await first.putItem(item('a', 'play', 'state', 1));
    const second = await idbStorage();
    expect(await second.listCharacters()).toEqual([character('a')]);
    expect(await second.listItems('a')).toEqual([item('a', 'play', 'state', 1)]);
  });

  it('closes its connection when a newer version is opened elsewhere, so that open is not blocked', async () => {
    await idbStorage();
    const newer = await openDB(DB_NAME, DB_VERSION + 1);
    expect(newer.version).toBe(DB_VERSION + 1);
    newer.close();
  });

  it('upgrades a milestone 2 database: characters gain the sync fields and play splits in two', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('characters', { keyPath: 'id' });
        database.createObjectStore('play', { keyPath: 'characterId' });
      },
    });
    await v1.put('characters', {
      id: 'local-1', ddbId: '42', name: 'Vlad', rawJson: { data: { id: 42 } }, importedAt: '2026-11-12T09:00:00.000Z',
    });
    await v1.put('play', {
      characterId: 'local-1', spent: { pact: 1 }, concentrationKey: 'spell:1:base:slot',
      turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: true },
    });
    v1.close();

    const storage = await idbStorage();
    expect(await storage.listCharacters()).toEqual([{
      id: 'local-1', ownerId: null, ddbId: '42', name: 'Vlad', rawJson: { data: { id: 42 } },
      importedAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z', deleted: false, dirty: true,
    }]);
    const items = (await storage.listItems('local-1')).sort(byKey);
    expect(items.map((i) => [i.kind, i.key, i.data, i.dirty])).toEqual([
      ['play', 'state', { spent: { pact: 1 }, concentrationKey: 'spell:1:base:slot' }, true],
      ['turn', 'state', { action: true, bonus: false, reaction: false, slotSpentThisTurn: true }, false],
    ]);
    const raw = await openDB(DB_NAME);
    expect([...raw.objectStoreNames].sort()).toEqual(['characters', 'items', 'meta']);
    raw.close();
  });
});

describe('serial', () => {
  it('runs calls in the order they were made, so a delete waits for an earlier slow write', async () => {
    const inner = memoryStorage();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: AppStorage = {
      ...inner,
      async putItem(value) {
        await gate;
        await inner.putItem(value);
      },
    };
    const storage = serial(slow);
    await storage.putCharacter(character('a'));
    const write = storage.putItem(item('a', 'play', 'state', 1));
    const removal = storage.removeCharacter('a');
    release();
    await Promise.all([write, removal]);
    expect(await storage.listItems()).toEqual([]);
  });

  it('keeps going after a call fails, and the failure reaches only its caller', async () => {
    const inner = memoryStorage();
    const storage = serial({ ...inner, putCharacter: () => Promise.reject(new Error('quota')) });
    await expect(storage.putCharacter(character('a'))).rejects.toThrow('quota');
    await storage.setMeta('still', 'working');
    expect(await storage.getMeta('still')).toBe('working');
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
