import type { Ability, PlayState } from '@cw/model';
import { normalisePlayItem, normaliseTurn } from '@cw/rules';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { memoryServer, type MemoryRemote, type MemoryServer } from '../remote/memory';
import type { Remote } from '../remote/types';
import { STATE_KEY, memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';

/** A fixture's raw JSON with its D&D Beyond ID replaced, so two fixtures can be stored side by side. */
export function rawWithId(slug: Slug, ddbId: number): any {
  const raw = loadRaw(slug);
  raw.data.id = ddbId;
  return raw;
}

/** The approved player most tests are signed in as. */
export const TEST_USER = 'user-test';

/** An in-memory account that already knows the test player. */
export function testServer(): MemoryServer {
  const server = memoryServer();
  server.addUser(TEST_USER, 'Tess', { approved: true });
  return server;
}

/** A device signed in as the test player. Each call without a server gets an account of its own. */
export const testRemote = (server: MemoryServer = testServer()): MemoryRemote => server.remote({ userId: TEST_USER });

/**
 * A fresh store on in-memory storage, signed in as the test player and holding one imported
 * fixture, which is opened.
 */
export async function seed(
  slug: Slug, storage: AppStorage = memoryStorage(), remote: Remote = testRemote(),
): Promise<StoredCharacter> {
  await useStore.getState().init(storage, remote);
  const record = await useStore.getState().saveImported(loadRaw(slug));
  if (!record) throw new Error(`fixture ${slug} did not import`);
  await useStore.getState().open(record.id);
  return record;
}

/** The open character's ability with this name; `cost` picks between two that share a name. */
export function ability(name: string, cost?: Ability['cost']['kind']): Ability {
  const sheet = useStore.getState().sheet;
  if (!sheet) throw new Error('no character is open');
  const found = [...sheet.abilities, ...sheet.universal].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}`);
  return found;
}

/** The play state a storage holds for a character, put back together from its two items. Null when it holds neither. */
export async function savedPlay(storage: AppStorage, characterId: string): Promise<PlayState | null> {
  const items = (await storage.listItems(characterId)).filter((item) => item.key === STATE_KEY && !item.deleted);
  const play = items.find((item) => item.kind === 'play');
  const turn = items.find((item) => item.kind === 'turn');
  if (!play && !turn) return null;
  return { ...normalisePlayItem(play?.data), turn: normaliseTurn(turn?.data) };
}

/** Writes a play state straight into a storage, as its two items, behind the store's back. */
export async function putSavedPlay(storage: AppStorage, characterId: string, state: PlayState): Promise<void> {
  const base = { characterId, key: STATE_KEY, updatedAt: '2026-11-18T12:00:00.000Z', deleted: false };
  await storage.putItem({ ...base, kind: 'play', data: { spent: state.spent, concentrationKey: state.concentrationKey }, dirty: true });
  await storage.putItem({ ...base, kind: 'turn', data: state.turn, dirty: false });
}
