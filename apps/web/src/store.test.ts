import { describe, expect, it, vi } from 'vitest';
import { emptyPlayState } from '@cw/rules';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryStorage, type AppStorage } from './storage';
import { sheetFor, useStore } from './store';
import { ability, rawWithId, seed } from './test/helpers';

const sheetBuild = vi.hoisted(() => ({ fails: false }));

vi.mock('@cw/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cw/rules')>();
  return {
    ...actual,
    buildSheet: (...args: Parameters<typeof actual.buildSheet>) => {
      if (sheetBuild.fails) throw new Error('sheet build failed');
      return actual.buildSheet(...args);
    },
  };
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('init', () => {
  it('loads what the storage holds and becomes ready', async () => {
    const storage = memoryStorage();
    await seed('vlad', storage);
    await state().init(storage);
    expect(state()).toMatchObject({ ready: true, persistent: true, openId: null, sheet: null });
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
  });

  it('keeps working without saving when the storage cannot be read', async () => {
    const broken: AppStorage = { ...memoryStorage(), listCharacters: async () => { throw new Error('blocked'); } };
    await state().init(broken);
    expect(state()).toMatchObject({ ready: true, persistent: false, characters: [] });
  });
});

describe('saveImported', () => {
  it('stores a new character with its name, D&D Beyond ID and raw JSON', async () => {
    const storage = memoryStorage();
    await state().init(storage);
    const raw = loadRaw('vlad');
    const record = await state().saveImported(raw);
    expect(record).toMatchObject({ ddbId: '1', name: 'Vlad', rawJson: raw });
    expect(record?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(record?.importedAt ?? ''))).toBe(false);
    expect(await storage.listCharacters()).toEqual([record]);
  });

  it('refuses JSON that is not a character', async () => {
    await state().init(memoryStorage());
    expect(await state().saveImported({ hello: 'world' })).toBeNull();
    expect(await state().saveImported('nonsense')).toBeNull();
    expect(state().characters).toEqual([]);
  });

  it('makes an ID without crypto.randomUUID, as on a page served over plain HTTP', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView>(array: T): T => real.getRandomValues(array as any) });
    await state().init(memoryStorage());
    const first = await state().saveImported(rawWithId('vlad', 101));
    const second = await state().saveImported(rawWithId('minkis', 102));
    expect(first?.id).toMatch(UUID_V4);
    expect(second?.id).toMatch(UUID_V4);
    expect(first?.id).not.toBe(second?.id);
  });

  it('refuses a character whose sheet cannot be built, and stores nothing', async () => {
    const storage = memoryStorage();
    await state().init(storage);
    sheetBuild.fails = true;
    try {
      expect(await state().saveImported(loadRaw('vlad'))).toBeNull();
    } finally {
      sheetBuild.fails = false;
    }
    expect(state().characters).toEqual([]);
    expect(await storage.listCharacters()).toEqual([]);
  });

  it('keeps two different characters apart', async () => {
    await state().init(memoryStorage());
    await state().saveImported(rawWithId('vlad', 101));
    await state().saveImported(rawWithId('minkis', 102));
    expect(state().characters.map((c) => c.name).sort()).toEqual(['Minkis', 'Vlad']);
  });

  it('replaces the character on re-import and clamps what was spent', async () => {
    const storage = memoryStorage();
    const first = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    useStore.setState({ play: { ...emptyPlayState(), spent: { pact: 9, gone: 3 }, concentrationKey: 'not-there' } });
    const second = await state().saveImported(loadRaw('vlad'));
    expect(second?.id).toBe(first.id);
    expect(state().characters).toHaveLength(1);
    expect(await storage.getPlay(first.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
    expect(state().play.spent).toEqual({ pact: 2 });
  });

  it('clamps the stored play state of a character that is not open on re-import', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    await state().open('missing');
    expect(state().openId).toBeNull();
    await storage.putPlay(record.id, { ...emptyPlayState(), spent: { pact: 9, gone: 3 }, concentrationKey: 'not-there' });
    await state().saveImported(loadRaw('vlad'));
    expect(await storage.getPlay(record.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
    expect(state().openId).toBeNull();
  });

  it('keeps the open character\'s unsaved play state when it is re-imported', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    storage.putPlay = async () => { throw new Error('quota'); };
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().persistent).toBe(false);
    const again = await state().saveImported(loadRaw('vlad'));
    expect(again?.id).toBe(record.id);
    expect(state()).toMatchObject({ openId: record.id, undo: null });
    expect(state().sheet?.name).toBe('Vlad');
    expect(state().play.spent).toEqual({ pact: 1 });
  });
});

describe('open', () => {
  it('builds the sheet and loads saved play state', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().init(storage);
    await state().open(record.id);
    expect(state().sheet?.name).toBe('Vlad');
    expect(state().play.spent).toEqual({ pact: 1 });
    expect(state().play.turn.bonus).toBe(true);
    expect(state().undo).toBeNull();
  });

  it('keeps the play state in memory when the open character is opened again', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    storage.putPlay = async () => { throw new Error('quota'); };
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().persistent).toBe(false);
    await state().open(record.id);
    expect(state().openId).toBe(record.id);
    expect(state().play.spent).toEqual({ pact: 1 });
  });

  it('opens nothing for an unknown ID', async () => {
    await seed('vlad');
    await state().open('no-such-id');
    expect(state()).toMatchObject({ openId: null, sheet: null });
  });
});

describe('play', () => {
  it('uses an ability, saves the result and offers one undo step', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    expect(state().play).toMatchObject({ spent: { pact: 1 }, turn: { bonus: true, slotSpentThisTurn: true } });
    expect(state().undo?.message).toBe('Used Hex. Spent: Bonus Action, a pact slot.');
    await settle();
    expect(await storage.getPlay(record.id)).toEqual(state().play);

    state().undoLast();
    expect(state().play).toEqual(emptyPlayState());
    expect(state().undo).toBeNull();
    await settle();
    expect(await storage.getPlay(record.id)).toEqual(emptyPlayState());
  });

  it('does nothing when the ability cannot be used', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    const afterHex = state().play;
    state().use(ability('Arms of Hadar'), 'combat');
    expect(state().play).toBe(afterHex);
    expect(state().undo?.message).toContain('Hex');
  });

  it('spends the chosen slot', async () => {
    await seed('minkis');
    state().use(ability('Chromatic Orb'), 'combat', 'slot:2');
    expect(state().play.spent).toEqual({ 'slot:2': 1 });
  });

  it('can undo Start my turn and a rest', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    const afterHex = state().play;
    state().startTurn();
    expect(state().play.turn.bonus).toBe(false);
    expect(state().undo?.message).toBe('Started a new turn.');
    state().undoLast();
    expect(state().play).toEqual(afterHex);

    state().rest('long');
    expect(state().play).toEqual(emptyPlayState());
    expect(state().undo?.message).toBe('Took a Long Rest.');
    state().undoLast();
    expect(state().play).toEqual(afterHex);

    state().rest('short');
    expect(state().undo?.message).toBe('Took a Short Rest.');
    expect(state().play.spent).toEqual({});
  });

  it('lets the player adjust a pool, flip a pill and end concentration by hand, clearing undo', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    state().adjust('pact', 1);
    expect(state().play.spent).toEqual({ pact: 2 });
    expect(state().undo).toBeNull();
    state().adjust('pact', -1);
    state().adjust('no-such-pool', 1);
    expect(state().play.spent).toEqual({ pact: 1 });
    state().togglePill('bonus');
    expect(state().play.turn.bonus).toBe(false);
    state().endConcentration();
    expect(state().play.concentrationKey).toBeNull();
  });

  it('turns on the not-saving flag when a write fails, and keeps the change', async () => {
    const storage = memoryStorage();
    await seed('vlad', storage);
    storage.putPlay = async () => { throw new Error('quota'); };
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().persistent).toBe(false);
    expect(state().play.spent).toEqual({ pact: 1 });
  });
});

describe('remove', () => {
  it('deletes the character and its play state and closes it if open', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().remove(record.id);
    expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.getPlay(record.id)).toBeNull();
  });
});

describe('sheetFor', () => {
  it('returns the same sheet until the character is re-imported', async () => {
    const first = await seed('vlad');
    expect(sheetFor(first)).toBe(sheetFor(first));
    const again = await state().saveImported(loadRaw('vlad'));
    if (!again) throw new Error('re-import failed');
    expect(again.importedAt >= first.importedAt).toBe(true);
    expect(sheetFor(again).name).toBe('Vlad');
  });
});
