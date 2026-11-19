import { describe, expect, it } from 'vitest';
import { CHARACTER_LIMIT, IMPORTS_PER_HOUR } from './types';
import type { CharacterPush, ImportAllowance, ItemPush, Remote } from './types';

/** The calls the contract makes as one signed-in user. */
export type ContractClient = Pick<
  Remote,
  'profile' | 'listProfiles' | 'setApproved' | 'pushCharacters' | 'pushItems' | 'pullCharacters' | 'pullItems'
> & { recordImport(): Promise<ImportAllowance> };

/** An account to test: the in-memory server, or the real SQL running on PGlite. */
export interface ContractBackend {
  /** Creates a user as a first sign-in would, then sets the two flags directly. */
  addUser(id: string, displayName: string, options?: { approved?: boolean; admin?: boolean }): Promise<void>;
  as(userId: string): ContractClient;
}

export const ANN = '00000000-0000-4000-8000-00000000000a';
export const BEN = '00000000-0000-4000-8000-00000000000b';
export const DEE = '00000000-0000-4000-8000-0000000000d0';
export const NEW = '00000000-0000-4000-8000-0000000000e0';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';
const T3 = '2026-01-03T10:00:00.000Z';

export const character = (id: string, over: Partial<CharacterPush> = {}): CharacterPush => ({
  id, ddbId: '42', name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: T1, updatedAt: T1, deleted: false, ...over,
});

export const item = (characterId: string, kind: ItemPush['kind'], key: string, over: Partial<ItemPush> = {}): ItemPush => ({
  characterId, kind, key, data: { value: 1 }, updatedAt: T1, deleted: false, ...over,
});

/** Ann and Ben are approved players, Dee is the table admin, and the fourth user has just signed in. */
async function table(make: () => Promise<ContractBackend>): Promise<ContractBackend> {
  const backend = await make();
  await backend.addUser(ANN, 'Ann', { approved: true });
  await backend.addUser(BEN, 'Ben', { approved: true });
  await backend.addUser(DEE, 'Dee', { approved: true, admin: true });
  await backend.addUser(NEW, 'Newcomer');
  return backend;
}

const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

/**
 * The rules every account must keep. Run against `memoryServer` in the web tests and against the
 * SQL migrations in the database tests, so the two cannot drift apart.
 */
export function remoteContract(name: string, make: () => Promise<ContractBackend>): void {
  describe(`account rules: ${name}`, () => {
    describe('profiles', () => {
      it('gives a new user a profile that is neither approved nor admin', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).profile()).toEqual({ id: NEW, displayName: 'Newcomer', approved: false, isTableAdmin: false });
      });

      it('shows a player only their own profile and an admin every profile, by name', async () => {
        const backend = await table(make);
        expect((await backend.as(ANN).listProfiles()).map((p) => p.displayName)).toEqual(['Ann']);
        expect((await backend.as(NEW).listProfiles()).map((p) => p.displayName)).toEqual(['Newcomer']);
        expect((await backend.as(DEE).listProfiles()).map((p) => p.displayName)).toEqual(['Ann', 'Ben', 'Dee', 'Newcomer']);
      });

      it('lets an admin approve a player and remove access again', async () => {
        const backend = await table(make);
        await backend.as(DEE).setApproved(NEW, true);
        expect((await backend.as(NEW).profile())?.approved).toBe(true);
        expect((await backend.as(NEW).pushCharacters([character('n1')])).rejected).toEqual([]);
        await backend.as(DEE).setApproved(NEW, false);
        expect(await backend.as(NEW).pullCharacters(0)).toEqual([]);
      });

      it('refuses approval by anyone who is not an admin, and an admin changing their own', async () => {
        const backend = await table(make);
        await expect(backend.as(ANN).setApproved(NEW, true)).rejects.toMatchObject({ kind: 'refused' });
        await expect(backend.as(NEW).setApproved(NEW, true)).rejects.toMatchObject({ kind: 'refused' });
        await expect(backend.as(DEE).setApproved(DEE, false)).rejects.toMatchObject({ kind: 'refused' });
        expect((await backend.as(NEW).profile())?.approved).toBe(false);
        expect((await backend.as(DEE).profile())?.approved).toBe(true);
      });
    });

    describe('characters', () => {
      it('stores a character for its creator and returns it with a rev', async () => {
        const backend = await table(make);
        expect(await backend.as(ANN).pushCharacters([character('a1')])).toEqual({ rejected: [] });
        const [row] = await backend.as(ANN).pullCharacters(0);
        expect(row).toMatchObject({ ...character('a1'), ownerId: ANN });
        expect(row.rev).toBeGreaterThan(0);
      });

      it('shows a character to its owner and to an admin, and to nobody else', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        await backend.as(BEN).pushCharacters([character('b1')]);
        expect(ids(await backend.as(ANN).pullCharacters(0))).toEqual(['a1']);
        expect(ids(await backend.as(BEN).pullCharacters(0))).toEqual(['b1']);
        expect(ids(await backend.as(DEE).pullCharacters(0))).toEqual(['a1', 'b1']);
        expect(await backend.as(NEW).pullCharacters(0)).toEqual([]);
      });

      it('refuses every write from a user who is not approved', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).pushCharacters([character('n1')])).toEqual({ rejected: [{ id: 'n1', reason: 'refused' }] });
        expect(await backend.as(DEE).pullCharacters(0)).toEqual([]);
      });

      it('keeps the later change: an older or equal write is skipped without being rejected', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1', { name: 'Second', updatedAt: T2 })]);
        const [before] = await ann.pullCharacters(0);
        expect(await ann.pushCharacters([character('a1', { name: 'Older', updatedAt: T1 })])).toEqual({ rejected: [] });
        expect(await ann.pushCharacters([character('a1', { name: 'Same time', updatedAt: T2 })])).toEqual({ rejected: [] });
        expect(await ann.pullCharacters(0)).toEqual([before]);
        await ann.pushCharacters([character('a1', { name: 'Third', updatedAt: T3 })]);
        const [after] = await ann.pullCharacters(0);
        expect(after.name).toBe('Third');
        expect(after.rev).toBeGreaterThan(before.rev);
      });

      it('never records a time in the future', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1', { updatedAt: '2999-01-01T00:00:00.000Z' })]);
        const [row] = await backend.as(ANN).pullCharacters(0);
        expect(Date.parse(row.updatedAt)).toBeLessThanOrEqual(Date.now() + 5000);
      });

      it('lets an admin change a player\'s character without becoming its owner', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(DEE).pushCharacters([character('a1', { name: 'Fixed by Dee', updatedAt: T2 })])).toEqual({ rejected: [] });
        expect((await backend.as(ANN).pullCharacters(0))[0]).toMatchObject({ name: 'Fixed by Dee', ownerId: ANN });
      });

      it('refuses a player writing another player\'s character', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(BEN).pushCharacters([character('a1', { name: 'Stolen', updatedAt: T2 })]))
          .toEqual({ rejected: [{ id: 'a1', reason: 'refused' }] });
        expect((await backend.as(ANN).pullCharacters(0))[0].name).toBe('Character a1');
      });

      it('makes whoever creates a character its owner, admin included', async () => {
        const backend = await table(make);
        await backend.as(DEE).pushCharacters([character('d1')]);
        expect((await backend.as(DEE).pullCharacters(0))[0].ownerId).toBe(DEE);
        expect(await backend.as(ANN).pullCharacters(0)).toEqual([]);
      });

      it(`holds ${CHARACTER_LIMIT} live characters per owner, and takes the rest of a batch when one is over`, async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        const ten = Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`a${i}`));
        expect(await ann.pushCharacters(ten)).toEqual({ rejected: [] });
        const result = await ann.pushCharacters([
          character('extra'),
          character('a0', { name: 'Renamed', updatedAt: T2 }),
        ]);
        expect(result).toEqual({ rejected: [{ id: 'extra', reason: 'limit' }] });
        const rows = await ann.pullCharacters(0);
        expect(rows).toHaveLength(CHARACTER_LIMIT);
        expect(rows.find((r) => r.id === 'a0')?.name).toBe('Renamed');
      });

      it('frees a place when a character is deleted', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters(Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`a${i}`)));
        await ann.pushCharacters([character('a0', { deleted: true, updatedAt: T2 })]);
        expect(await ann.pushCharacters([character('extra')])).toEqual({ rejected: [] });
      });

      it('counts the limit against the owner, not against an admin who edits', async () => {
        const backend = await table(make);
        await backend.as(DEE).pushCharacters(Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`d${i}`)));
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(DEE).pushCharacters([character('a1', { name: 'Edited', updatedAt: T2 })])).toEqual({ rejected: [] });
      });
    });

    describe('deleting a character', () => {
      it('keeps the row as deleted with no raw JSON, and removes its items', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'play', 'state'), item('a1', 'edit', 'spell:1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        expect((await ann.pullCharacters(0))[0]).toMatchObject({ id: 'a1', deleted: true, rawJson: null });
        expect(await ann.pullItems(0)).toEqual([]);
      });

      it('skips an item sent for a deleted character', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        await ann.pushItems([item('a1', 'play', 'state', { updatedAt: T3 })]);
        expect(await ann.pullItems(0)).toEqual([]);
      });

      it('brings a deleted character back when a newer live copy arrives', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        await ann.pushCharacters([character('a1', { updatedAt: T3 })]);
        expect((await ann.pullCharacters(0))[0]).toMatchObject({ deleted: false, rawJson: { data: { name: 'a1' } } });
      });
    });

    describe('items', () => {
      it('stores items by character, kind and key', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([
          item('a1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null } }),
          item('a1', 'edit', 'spell:1', { data: { hidden: true } }),
          item('a1', 'order', 'combat', { data: ['spell:1'] }),
        ]);
        const rows = await ann.pullItems(0);
        expect(rows.map((r) => [r.kind, r.key, r.data]).sort()).toEqual([
          ['edit', 'spell:1', { hidden: true }],
          ['order', 'combat', ['spell:1']],
          ['play', 'state', { spent: { pact: 1 }, concentrationKey: null }],
        ]);
      });

      it('keeps the later change for each item on its own', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([
          item('a1', 'edit', 'one', { data: { hidden: true }, updatedAt: T2 }),
          item('a1', 'edit', 'two', { data: { hidden: true }, updatedAt: T1 }),
        ]);
        await ann.pushItems([
          item('a1', 'edit', 'one', { data: { hidden: false }, updatedAt: T1 }),
          item('a1', 'edit', 'two', { data: { hidden: false }, updatedAt: T2 }),
        ]);
        const byKey = new Map((await ann.pullItems(0)).map((r) => [r.key, r.data]));
        expect(byKey.get('one')).toEqual({ hidden: true });
        expect(byKey.get('two')).toEqual({ hidden: false });
      });

      it('keeps a deleted item as a row with no data', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'custom', 'own:1')]);
        await ann.pushItems([item('a1', 'custom', 'own:1', { deleted: true, updatedAt: T2 })]);
        expect((await ann.pullItems(0))[0]).toMatchObject({ key: 'own:1', deleted: true, data: null });
      });

      it('lets an admin read and write a player\'s items, and nobody else', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        await backend.as(ANN).pushItems([item('a1', 'edit', 'one')]);
        await backend.as(DEE).pushItems([item('a1', 'edit', 'two')]);
        await backend.as(BEN).pushItems([item('a1', 'edit', 'three')]);
        await backend.as(NEW).pushItems([item('a1', 'edit', 'four')]);
        expect((await backend.as(ANN).pullItems(0)).map((r) => r.key).sort()).toEqual(['one', 'two']);
        expect((await backend.as(DEE).pullItems(0)).map((r) => r.key).sort()).toEqual(['one', 'two']);
        expect(await backend.as(BEN).pullItems(0)).toEqual([]);
        expect(await backend.as(NEW).pullItems(0)).toEqual([]);
      });

      it('skips an item for a character that does not exist', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushItems([item('nowhere', 'play', 'state')]);
        expect(await backend.as(DEE).pullItems(0)).toEqual([]);
      });
    });

    describe('fetching changes', () => {
      it('returns only rows after the given rev, lowest first, with one numbering for both tables', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'play', 'state')]);
        await ann.pushCharacters([character('a2')]);
        const characters = await ann.pullCharacters(0);
        const [play] = await ann.pullItems(0);
        expect(characters.map((c) => c.id)).toEqual(['a1', 'a2']);
        expect(characters[0].rev).toBeLessThan(play.rev);
        expect(play.rev).toBeLessThan(characters[1].rev);
        expect((await ann.pullCharacters(characters[0].rev)).map((c) => c.id)).toEqual(['a2']);
        expect(await ann.pullCharacters(characters[1].rev)).toEqual([]);
        expect(await ann.pullItems(play.rev)).toEqual([]);
      });

      it('gives a changed row a new rev, so it is fetched again', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        const [first] = await ann.pullCharacters(0);
        await ann.pushCharacters([character('a1', { name: 'Renamed', updatedAt: T2 })]);
        expect((await ann.pullCharacters(first.rev)).map((c) => c.name)).toEqual(['Renamed']);
      });
    });

    describe('the import check', () => {
      it('turns away a user who is not approved', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).recordImport()).toBe('not-approved');
      });

      it(`allows ${IMPORTS_PER_HOUR} imports in an hour for each player, then says so`, async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        for (let i = 0; i < IMPORTS_PER_HOUR; i += 1) expect(await ann.recordImport()).toBe('ok');
        expect(await ann.recordImport()).toBe('rate-limited');
        expect(await backend.as(BEN).recordImport()).toBe('ok');
      });
    });
  });
}
