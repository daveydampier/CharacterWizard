import type { CustomAbility } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryStorage, type AppStorage, type StoredItem } from './storage';
import { editsFrom, newCustomKey, useStore } from './store';
import { syncOnce } from './sync/engine';
import { TEST_USER, ability, seed, testRemote, testServer } from './test/helpers';

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const itemsOf = async (storage: AppStorage, id: string, kind: StoredItem['kind']): Promise<StoredItem[]> =>
  (await storage.listItems(id)).filter((item) => item.kind === kind);

const names = (list: { name: string }[]): string[] => list.map((a) => a.name);

const howl = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:1', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.', ...over,
});

describe('editing an ability', () => {
  it('changes the sheet on screen, keeps the imported sheet, and stores the edit as a dirty item', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const hex = ability('Hex');
    state().setEdit(hex.key, { timing: 'action', tags: ['debuff'] });
    expect(ability('Hex')).toMatchObject({ timing: 'action', tags: ['debuff'], tagSource: 'user' });
    expect(state().baseSheet?.abilities.find((a) => a.key === hex.key)?.timing).toBe('bonus');
    expect(state().sheet?.edited).toEqual([hex.key]);
    expect(state().edits.abilities).toEqual({ [hex.key]: { timing: 'action', tags: ['debuff'] } });
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([
      { key: hex.key, data: { timing: 'action', tags: ['debuff'] }, deleted: false, dirty: true },
    ]);
    expect(state().syncState).toBe('waiting');
  });

  it('puts an ability back to imported with an edit that changes nothing, keeping the item as a deletion to send', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const hex = ability('Hex');
    state().setEdit(hex.key, { timing: 'action' });
    await settle();
    state().setEdit(hex.key, {});
    expect(ability('Hex').timing).toBe('bonus');
    expect(state().sheet?.edited).toEqual([]);
    expect(state().edits.abilities).toEqual({});
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([{ key: hex.key, data: null, deleted: true, dirty: true }]);
  });

  it('does nothing for an empty edit to an ability that has none', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().setEdit(ability('Hex').key, {});
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toEqual([]);
  });

  it('ignores edits until the saved state has loaded', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const key = ability('Hex').key;
    await state().init(storage, testRemote());
    const opening = state().open(record.id);
    state().setEdit(key, { hidden: true });
    await opening;
    expect(state().edits.abilities).toEqual({});
  });

  it('keeps the edits when the character is opened again', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    const hex = ability('Hex');
    state().setEdit(hex.key, { hidden: true });
    await settle();
    await state().init(storage, testRemote(server));
    await state().open(record.id);
    expect(names(state().sheet?.hidden ?? [])).toEqual(['Hex']);
    expect(names(state().sheet?.abilities ?? [])).not.toContain('Hex');
  });

  it('clamps what was spent when an edit lowers a maximum, and forgets the undo step', async () => {
    await seed('danger');
    const wind = ability('Second Wind');
    state().use(wind, 'combat');
    state().startTurn();
    state().use(ability('Second Wind'), 'combat');
    expect(state().play.spent[wind.key]).toBe(2);
    expect(state().undo).not.toBeNull();
    state().setEdit(wind.key, { uses: { max: 1, reset: 'long' } });
    expect(state().play.spent[wind.key]).toBe(1);
    expect(state().undo).toBeNull();
  });

  it('ends concentration on an ability that is hidden', async () => {
    await seed('vlad');
    const hex = ability('Hex');
    state().use(hex, 'combat');
    expect(state().play.concentrationKey).toBe(hex.key);
    state().setEdit(hex.key, { hidden: true });
    expect(state().play.concentrationKey).toBeNull();
  });

  it('keeps the undo step when an edit does not touch what was spent', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    state().setEdit(ability('Dash').key, { tags: ['movement'] });
    expect(state().undo?.message).toContain('Hex');
  });
});

describe('custom abilities', () => {
  it('adds one to the sheet and stores it without its key in the data', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().saveCustom(howl());
    expect(ability('Pack Howl')).toMatchObject({ key: 'own:1', source: 'custom', timing: 'bonus', tags: ['buff'] });
    await settle();
    const [item] = await itemsOf(storage, record.id, 'custom');
    expect(item).toMatchObject({ key: 'own:1', deleted: false, dirty: true });
    expect(item.data).toEqual({
      name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
      tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.',
    });
  });

  it('replaces the one with the same key', async () => {
    await seed('franny');
    state().saveCustom(howl());
    state().saveCustom(howl({ name: 'Greater Howl', timing: 'action' }));
    expect(state().edits.custom).toHaveLength(1);
    expect(ability('Greater Howl').timing).toBe('action');
  });

  it('deletes one together with the edits under its key', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().saveCustom(howl());
    state().setEdit('own:1', { inExplore: true });
    await settle();
    state().deleteCustom('own:1');
    expect(state().edits).toMatchObject({ custom: [], abilities: {} });
    expect(names(state().sheet?.abilities ?? [])).not.toContain('Pack Howl');
    await settle();
    expect(await itemsOf(storage, record.id, 'custom')).toMatchObject([{ key: 'own:1', deleted: true, data: null }]);
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([{ key: 'own:1', deleted: true, data: null }]);
  });

  it('does nothing when asked to delete a key that is not a custom ability', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().deleteCustom('own:none');
    await settle();
    expect(await itemsOf(storage, record.id, 'custom')).toEqual([]);
  });

  it('makes keys that start "own:" and do not repeat', () => {
    const a = newCustomKey();
    expect(a).toMatch(/^own:[0-9a-f-]{36}$/);
    expect(newCustomKey()).not.toBe(a);
  });
});

describe('order', () => {
  it('records the order of one group and shows it', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const before = state().sheet?.universal.map((a) => a.key) ?? [];
    const reversed = [...before].reverse();
    state().setOrder('combat', reversed);
    expect(state().sheet?.layout.order.combat).toEqual(reversed);
    expect(state().sheet?.layout.order.explore).toEqual([]);
    await settle();
    expect(await itemsOf(storage, record.id, 'order')).toMatchObject([{ key: 'combat', data: reversed, dirty: true }]);
  });

  it('records the order of a group of the Features page, and takes edits under a feature\'s key', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const key = (name: string): string => {
      const found = state().sheet?.featureSource.list.find((f) => f.name === name);
      if (!found) throw new Error(`no feature ${name}`);
      return found.key;
    };
    const feats = (): string[] => names((state().sheet?.features.find((g) => g.heading === 'Feats')?.items ?? []).map((i) => i.feature));
    state().setOrder('features', [key('Lucky'), key('Alert')]);
    expect(feats().slice(0, 2)).toEqual(['Lucky', 'Alert']);
    expect(state().sheet?.layout.order).toEqual({ combat: [], explore: [], features: [key('Lucky'), key('Alert')] });
    state().setEdit(key('Alert'), { inCombat: true });
    expect(ability('Alert')).toMatchObject({ key: key('Alert'), timing: 'passive', source: 'feat' });
    state().setEdit(key('Languages'), { hidden: false });
    expect(names(state().sheet?.hiddenFeatures ?? [])).toEqual(['Eldritch Invocation Options']);
    state().setEdit(key('Lucky'), { hidden: true });
    expect(feats()).not.toContain('Lucky');
    await settle();
    expect(await itemsOf(storage, record.id, 'order')).toMatchObject([
      { key: 'features', data: [key('Lucky'), key('Alert')], dirty: true },
    ]);
    // What is stored reads back as what is on screen.
    expect(editsFrom(await storage.listItems(record.id))).toEqual(state().edits);
    expect(state().edits.abilities).toEqual({
      [key('Alert')]: { inCombat: true }, [key('Languages')]: { hidden: false }, [key('Lucky')]: { hidden: true },
    });
  });

  it('keeps one group\'s order when another group is arranged', async () => {
    await seed('vlad');
    state().setOrder('combat', ['b', 'a']);
    state().setOrder('combat', ['y', 'x']);
    expect(state().edits.order.combat).toEqual(['b', 'a', 'y', 'x']);
  });

  it('writes nothing when the order is unchanged', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().setOrder('explore', ['a', 'b']);
    await settle();
    const [first] = await itemsOf(storage, record.id, 'order');
    await new Promise((resolve) => setTimeout(resolve, 5));
    state().setOrder('explore', ['a', 'b']);
    await settle();
    expect((await itemsOf(storage, record.id, 'order'))[0].updatedAt).toBe(first.updatedAt);
  });
});

describe('re-import with edits', () => {
  it('keeps the edits of the open character and applies them to the new sheet', async () => {
    const record = await seed('danger');
    const wind = ability('Second Wind');
    state().setEdit(wind.key, { uses: { max: 1, reset: 'short' } });
    state().saveCustom(howl());
    state().use(ability('Second Wind'), 'combat');
    await state().saveImported(loadRaw('danger'), record.id);
    expect(state().sheet?.resources.find((r) => r.key === wind.key)).toMatchObject({ max: 1, reset: 'short' });
    expect(names(state().sheet?.abilities ?? [])).toContain('Pack Howl');
    expect(state().play.spent[wind.key]).toBe(1);
  });

  it('clamps a character that is not open to its edited maximums', async () => {
    const storage = memoryStorage();
    const record = await seed('danger', storage);
    const wind = ability('Second Wind');
    state().use(wind, 'combat');
    state().startTurn();
    state().use(ability('Second Wind'), 'combat');
    await settle();
    await state().open('nothing');
    await storage.putItem({
      characterId: record.id, kind: 'edit', key: wind.key, data: { uses: { max: 1, reset: 'long' } },
      updatedAt: '2026-11-18T12:00:00.000Z', deleted: false, dirty: true,
    });
    await state().saveImported(loadRaw('danger'), record.id);
    const [play] = await itemsOf(storage, record.id, 'play');
    expect(play.data).toMatchObject({ spent: { [wind.key]: 1 } });
  });
});

describe('stored edits', () => {
  const stored = (kind: StoredItem['kind'], key: string, data: unknown, deleted = false): StoredItem => ({
    characterId: 'c', kind, key, data, updatedAt: '2026-11-18T12:00:00.000Z', deleted, dirty: false,
  });

  it('are read from items, each kind into its place', () => {
    expect(editsFrom([
      stored('edit', 'spell:1', { hidden: true }),
      stored('custom', 'own:2', { name: 'Zeal' }),
      stored('custom', 'own:1', { name: 'Howl' }),
      stored('order', 'combat', ['a', 'b']),
      stored('order', 'explore', ['c']),
      stored('play', 'state', { spent: {} }),
      stored('turn', 'state', {}),
    ])).toEqual({
      abilities: { 'spell:1': { hidden: true } },
      custom: [
        { key: 'own:1', name: 'Howl', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
        { key: 'own:2', name: 'Zeal', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
      ],
      order: { combat: ['a', 'b'], explore: ['c'], features: [] },
    });
  });

  it('leave out deleted items, malformed ones, and an order for a view that does not exist', () => {
    expect(editsFrom([
      stored('edit', 'spell:1', { hidden: true }, true),
      stored('edit', 'spell:2', { timing: 'never' }),
      stored('edit', 'spell:3', 'nonsense'),
      stored('custom', 'own:1', { timing: 'action' }),
      stored('order', 'sideways', ['a']),
      stored('order', 'combat', 'a,b'),
    ])).toEqual({ abilities: {}, custom: [], order: { combat: [], explore: [], features: [] } });
  });
});

describe('edits and the account', () => {
  it('sends an edit, and after a removal sends the deletion and then forgets the item', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    const hex = ability('Hex');
    state().setEdit(hex.key, { hidden: true });
    await settle();
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    const remote = testRemote(server);
    expect((await remote.pullItems(0)).filter((i) => i.kind === 'edit')).toMatchObject([{ key: hex.key, data: { hidden: true }, deleted: false }]);
    state().setEdit(hex.key, {});
    await settle();
    await state().syncNow();
    expect((await remote.pullItems(0)).filter((i) => i.kind === 'edit')).toMatchObject([{ key: hex.key, deleted: true, data: null }]);
    expect(await itemsOf(storage, record.id, 'edit')).toEqual([]);
  });

  it('shows an edit made on another device, such as the DM fixing a player\'s sheet', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    const hex = ability('Hex');
    const dm = { storage: memoryStorage(), remote: server.remote({ userId: 'user-dm' }) };
    await syncOnce(dm);
    await dm.storage.putItem({
      characterId: record.id, kind: 'edit', key: hex.key, data: { tags: ['debuff'] },
      updatedAt: new Date().toISOString(), deleted: false, dirty: true,
    });
    await dm.storage.putItem({
      characterId: record.id, kind: 'custom', key: 'own:9', data: { name: 'Tatzelwurm Bite', timing: 'action' },
      updatedAt: new Date().toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(dm);
    await state().syncNow();
    expect(ability('Hex').tags).toEqual(['debuff']);
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
    expect(state().edits.abilities[hex.key]).toEqual({ tags: ['debuff'] });
    expect(record.ownerId).toBe(TEST_USER);
  });

  /** Another device, signed in as the DM, that has already changed the test player's character. */
  const dmChanged = async (server: ReturnType<typeof testServer>, characterId: string, abilityKey: string) => {
    const dm = { storage: memoryStorage(), remote: server.remote({ userId: 'user-dm' }) };
    await syncOnce(dm);
    const earlier = new Date(Date.now() - 1000).toISOString();
    await dm.storage.putItem({
      characterId, kind: 'edit', key: abilityKey, data: { tags: ['debuff'] }, updatedAt: earlier, deleted: false, dirty: true,
    });
    await dm.storage.putItem({
      characterId, kind: 'custom', key: 'own:9', data: { name: 'Tatzelwurm Bite', timing: 'action' },
      updatedAt: earlier, deleted: false, dirty: true,
    });
    await syncOnce(dm);
    return dm;
  };

  it('keeps an edit made while a fetch was in flight, shows what else was fetched, and sends the edit', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const inner = testRemote(server);
    let during: (() => void) | null = null;
    const remote = {
      ...inner,
      async pullItems(after: number) {
        const rows = await inner.pullItems(after);
        during?.();
        during = null;
        return rows;
      },
    };
    const record = await seed('vlad', memoryStorage(), remote);
    await state().syncNow();
    const hex = ability('Hex');
    const dm = await dmChanged(server, record.id, hex.key);
    during = () => state().setEdit(hex.key, { timing: 'action' });
    await state().syncNow();
    expect(state().edits.abilities[hex.key]).toEqual({ timing: 'action' });
    // The later change wins the whole item: the DM's earlier change to the same ability is gone.
    expect(ability('Hex').timing).toBe('action');
    expect(ability('Hex').tagSource).not.toBe('user');
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
    await settle();
    await state().syncNow();
    await syncOnce(dm);
    expect((await itemsOf(dm.storage, record.id, 'edit'))[0].data).toEqual({ timing: 'action' });
  });

  it('keeps on screen an edit made while what was fetched was being read back', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const storage = memoryStorage();
    const record = await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    const hex = ability('Hex');
    const eldritch = ability('Eldritch Blast');
    await dmChanged(server, record.id, hex.key);
    // The first read of this character's items is the store reading back what was fetched: edit then.
    const listItems = storage.listItems;
    let edited = false;
    storage.listItems = async (characterId?: string) => {
      const rows = await listItems(characterId);
      if (characterId !== undefined && !edited) {
        edited = true;
        state().setEdit(eldritch.key, { hidden: true });
      }
      return rows;
    };
    await state().syncNow();
    storage.listItems = listItems;
    expect(edited).toBe(true);
    expect(state().edits.abilities).toEqual({ [hex.key]: { tags: ['debuff'] }, [eldritch.key]: { hidden: true } });
    expect(names(state().sheet?.hidden ?? [])).toEqual(['Eldritch Blast']);
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
  });
});
