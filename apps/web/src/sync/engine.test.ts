import { describe, expect, it } from 'vitest';
import { memoryServer, type MemoryServer } from '../remote/memory';
import { CHARACTER_LIMIT } from '../remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter, type StoredItem } from '../storage';
import { characterId, claimLocalCharacters, hasUnsynced, nextStamp, pull, push, resetCursors, syncOnce } from './engine';

const ANN = 'user-ann';
const BEN = 'user-ben';
const DEE = 'user-dee';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';
const T3 = '2026-01-03T10:00:00.000Z';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: ANN, ddbId: '42', name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: T1, updatedAt: T1, deleted: false, dirty: true, ...over,
});

const item = (characterId: string, kind: StoredItem['kind'], key: string, over: Partial<StoredItem> = {}): StoredItem => ({
  characterId, kind, key, data: { value: 1 }, updatedAt: T1, deleted: false, dirty: true, ...over,
});

function table(): MemoryServer {
  const server = memoryServer();
  server.addUser(ANN, 'Ann', { approved: true });
  server.addUser(BEN, 'Ben', { approved: true });
  server.addUser(DEE, 'Dee', { approved: true, admin: true });
  return server;
}

/** A device: its own storage, signed in to the shared server. */
const device = (server: MemoryServer, userId: string, storage: AppStorage = memoryStorage()) =>
  ({ storage, remote: server.remote({ userId }) });

describe('characterId', () => {
  it('is the same wherever the same account imports the same character', () => {
    expect(characterId('42', ANN)).toBe('ddb-42-user-ann');
    expect(characterId('42', ANN)).not.toBe(characterId('42', BEN));
  });
});

describe('nextStamp', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  it('is the current time when that is later than the previous stamp', () => {
    expect(nextStamp(T1, now)).toBe('2026-11-18T12:00:00.000Z');
    expect(nextStamp(undefined, now)).toBe('2026-11-18T12:00:00.000Z');
  });

  it('is one millisecond after the previous stamp when the clock has not moved past it', () => {
    expect(nextStamp('2026-11-18T12:00:00.000Z', now)).toBe('2026-11-18T12:00:00.001Z');
    expect(nextStamp('2026-11-18T13:00:00.000Z', now)).toBe('2026-11-18T13:00:00.001Z');
  });

  it('ignores a previous stamp that is not a date', () => {
    expect(nextStamp('nonsense', now)).toBe('2026-11-18T12:00:00.000Z');
  });
});

describe('sending', () => {
  it('sends dirty characters and items, and marks them clean', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'play', 'state'));
    expect(await hasUnsynced(a.storage)).toBe(true);
    expect(await push(a)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(false);
    expect((await a.remote.pullCharacters(0)).map((c) => c.id)).toEqual(['c1']);
    expect((await a.remote.pullItems(0)).map((i) => i.kind)).toEqual(['play']);
  });

  it('never sends the turn, and does not count it as unsynced', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'turn', 'state', { dirty: true }));
    await push(a);
    expect(await a.remote.pullItems(0)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(false);
  });

  it('does not send a character that has no owner yet', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1', { ownerId: null }));
    await push(a);
    expect(await a.remote.pullCharacters(0)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(true);
  });

  it('removes a deleted character from the device once the account knows', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await push(a);
    await a.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await push(a);
    expect(await a.storage.listCharacters()).toEqual([]);
    expect((await a.remote.pullCharacters(0))[0]).toMatchObject({ id: 'c1', deleted: true });
  });

  it('removes a deleted item from the device once the account knows', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'custom', 'own:1'));
    await push(a);
    await a.storage.putItem(item('c1', 'custom', 'own:1', { deleted: true, data: null, updatedAt: T2 }));
    await push(a);
    expect(await a.storage.listItems('c1')).toEqual([]);
    expect((await a.remote.pullItems(0))[0]).toMatchObject({ key: 'own:1', deleted: true });
  });

  it('keeps a character dirty when the account is full, holds its items back, and reports it', async () => {
    const server = table();
    const a = device(server, ANN);
    for (let i = 0; i < CHARACTER_LIMIT; i += 1) await a.storage.putCharacter(character(`c${i}`));
    await push(a);
    await a.storage.putCharacter(character('extra'));
    await a.storage.putItem(item('extra', 'play', 'state'));
    expect(await push(a)).toEqual([{ id: 'extra', reason: 'limit' }]);
    expect((await a.storage.listCharacters()).find((c) => c.id === 'extra')?.dirty).toBe(true);
    expect((await a.storage.listItems('extra'))[0].dirty).toBe(true);
  });

  it('gives up on a character the account refuses, so it is not sent for ever', async () => {
    const server = table();
    const a = device(server, ANN);
    const b = device(server, BEN);
    await a.storage.putCharacter(character('c1'));
    await push(a);
    await b.storage.putCharacter(character('c1', { ownerId: BEN, name: 'Not mine', updatedAt: T2 }));
    expect(await push(b)).toEqual([{ id: 'c1', reason: 'refused' }]);
    expect(await hasUnsynced(b.storage)).toBe(false);
  });

  it('leaves a record dirty if it changed again while the request was in flight', async () => {
    const server = table();
    const storage = memoryStorage();
    const inner = server.remote({ userId: ANN });
    const remote = {
      ...inner,
      async pushItems(rows: Parameters<typeof inner.pushItems>[0]) {
        await inner.pushItems(rows);
        await storage.putItem(item('c1', 'play', 'state', { data: { value: 2 }, updatedAt: T2 }));
      },
    };
    await storage.putCharacter(character('c1'));
    await storage.putItem(item('c1', 'play', 'state'));
    await push({ storage, remote });
    expect((await storage.listItems('c1'))[0]).toMatchObject({ data: { value: 2 }, dirty: true });
  });

  it('rejects when the account cannot be reached, and keeps everything dirty', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    server.offline = true;
    await expect(push(a)).rejects.toMatchObject({ kind: 'offline' });
    expect(await hasUnsynced(a.storage)).toBe(true);
  });
});

describe('fetching', () => {
  it('brings another device\'s characters and items to this one, clean', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null } }));
    await push(phone);
    expect(await pull(tablet)).toEqual(new Set(['c1']));
    expect(await tablet.storage.listCharacters()).toEqual([character('c1', { dirty: false })]);
    expect(await tablet.storage.listItems('c1')).toEqual([
      item('c1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null }, dirty: false }),
    ]);
  });

  it('reports nothing changed when there is nothing new', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await push(phone);
    await pull(tablet);
    expect(await pull(tablet)).toEqual(new Set());
    // A device fetches its own writes back once; they are identical, so nothing has changed.
    expect(await pull(phone)).toEqual(new Set());
  });

  it('asks only for what is new since the last fetch', async () => {
    const server = table();
    const phone = device(server, ANN);
    const calls: number[] = [];
    const inner = server.remote({ userId: ANN });
    const tablet = { storage: memoryStorage(), remote: { ...inner, pullCharacters: (after: number) => { calls.push(after); return inner.pullCharacters(after); } } };
    await phone.storage.putCharacter(character('c1'));
    await push(phone);
    await pull(tablet);
    await pull(tablet);
    expect(calls[0]).toBe(0);
    expect(calls[1]).toBeGreaterThan(0);
    await resetCursors(tablet.storage);
    await pull(tablet);
    expect(calls[2]).toBe(0);
  });

  it('removes a character deleted on another device, with its items', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'play', 'state'));
    await push(phone);
    await pull(tablet);
    await tablet.storage.putItem(item('c1', 'turn', 'state', { dirty: false }));
    await phone.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await push(phone);
    expect(await pull(tablet)).toEqual(new Set(['c1']));
    expect(await tablet.storage.listCharacters()).toEqual([]);
    expect(await tablet.storage.listItems()).toEqual([]);
  });

  it('removes an item deleted on another device', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'custom', 'own:1'));
    await push(phone);
    await pull(tablet);
    await phone.storage.putItem(item('c1', 'custom', 'own:1', { deleted: true, data: null, updatedAt: T2 }));
    await push(phone);
    await pull(tablet);
    expect(await tablet.storage.listItems('c1')).toEqual([]);
  });

  it('shows the table admin every character and a player only their own', async () => {
    const server = table();
    const ann = device(server, ANN);
    const ben = device(server, BEN);
    const dee = device(server, DEE);
    await ann.storage.putCharacter(character('a1'));
    await ben.storage.putCharacter(character('b1', { ownerId: BEN }));
    await push(ann);
    await push(ben);
    await pull(ann);
    await pull(dee);
    expect((await ann.storage.listCharacters()).map((c) => c.id)).toEqual(['a1']);
    expect((await dee.storage.listCharacters()).map((c) => [c.id, c.ownerId]).sort()).toEqual([['a1', ANN], ['b1', BEN]]);
  });
});

describe('conflicts', () => {
  it('keeps the later change when two devices change the same item', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T2 }));
    await tablet.storage.putItem(item('c1', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T3 }));
    await syncOnce(phone);
    await syncOnce(tablet);
    await syncOnce(phone);
    expect((await phone.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: false });
    expect((await tablet.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: false });
  });

  it('keeps both changes when they are to different items', async () => {
    const server = table();
    const player = device(server, ANN);
    const dm = device(server, DEE);
    await player.storage.putCharacter(character('c1'));
    await syncOnce(player);
    await syncOnce(dm);
    await player.storage.putItem(item('c1', 'edit', 'spell:1', { data: { hidden: true }, updatedAt: T2 }));
    await dm.storage.putItem(item('c1', 'edit', 'spell:2', { data: { tags: ['damage'] }, updatedAt: T2 }));
    await syncOnce(player);
    await syncOnce(dm);
    await syncOnce(player);
    const keys = async (d: typeof player) => (await d.storage.listItems('c1')).map((i) => i.key).sort();
    expect(await keys(player)).toEqual(['spell:1', 'spell:2']);
    expect(await keys(dm)).toEqual(['spell:1', 'spell:2']);
  });

  it('keeps a dirty local record that is newer than the fetched one, and sends it', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T2 }));
    await syncOnce(phone);
    await tablet.storage.putItem(item('c1', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T3 }));
    expect(await pull(tablet)).toEqual(new Set());
    expect((await tablet.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: true });
    await push(tablet);
    await syncOnce(phone);
    expect((await phone.storage.listItems('c1'))[0].data).toEqual({ from: 'tablet' });
  });

  it('lets a re-import after a delete elsewhere bring the character back, items and all', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'edit', 'spell:1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await tablet.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await syncOnce(tablet);
    await phone.storage.putCharacter(character('c1', { updatedAt: T3, importedAt: T3 }));
    await syncOnce(phone);
    await syncOnce(phone);
    expect((await phone.remote.pullCharacters(0))[0]).toMatchObject({ id: 'c1', deleted: false });
    expect((await phone.remote.pullItems(0)).map((i) => i.key)).toEqual(['spell:1']);
  });
});

describe('first sign-in on a device', () => {
  const ownerless = (id: string, ddbId: string, over: Partial<StoredCharacter> = {}): StoredCharacter =>
    character(id, { ownerId: null, ddbId, ...over });

  it('gives ownerless characters to the user, under the ID an import by that user would have', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(ownerless('local-uuid', '42'));
    await storage.putItem(item('local-uuid', 'play', 'state'));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([
      { ...ownerless('local-uuid', '42'), id: 'ddb-42-user-ann', ownerId: ANN, dirty: true },
    ]);
    expect((await storage.listItems('ddb-42-user-ann')).map((i) => i.kind)).toEqual(['play']);
    expect(await storage.listItems('local-uuid')).toEqual([]);
  });

  it('keeps the ID of a pasted character that has no D&D Beyond ID', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(ownerless('local-uuid', '0'));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([character('local-uuid', { ownerId: ANN, ddbId: '0', dirty: true })]);
  });

  it('leaves characters that already have an owner alone', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(character('ddb-42-user-ann', { dirty: false }));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([character('ddb-42-user-ann', { dirty: false })]);
  });

  it('uploads them, and where the account already has the character keeps the newer import and the later play state', async () => {
    const server = table();
    const tablet = device(server, ANN);
    await tablet.storage.putCharacter(character('ddb-42-user-ann', { importedAt: T2, updatedAt: T2, name: 'Newer import' }));
    await tablet.storage.putItem(item('ddb-42-user-ann', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T1 }));
    await tablet.storage.putCharacter(character('ddb-7-user-ann', { ddbId: '7' }));
    await syncOnce(tablet);

    const phone = device(server, ANN);
    await phone.storage.putCharacter(ownerless('local-1', '42', { name: 'Older import' }));
    await phone.storage.putItem(item('local-1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T3 }));
    await phone.storage.putCharacter(ownerless('local-2', '99', { name: 'Only on the phone' }));
    await claimLocalCharacters(phone.storage, ANN);
    await syncOnce(phone);
    await syncOnce(tablet);

    for (const d of [phone, tablet]) {
      const names = new Map((await d.storage.listCharacters()).map((c) => [c.id, c.name]));
      expect(names.get('ddb-42-user-ann')).toBe('Newer import');
      expect(names.get('ddb-99-user-ann')).toBe('Only on the phone');
      expect(names.get('ddb-7-user-ann')).toBe('Character ddb-7-user-ann');
      expect((await d.storage.listItems('ddb-42-user-ann'))[0].data).toEqual({ from: 'phone' });
      expect(await hasUnsynced(d.storage)).toBe(false);
    }
  });
});
