import type { Ability } from '@cw/model';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';

/** A fixture's raw JSON with its D&D Beyond ID replaced, so two fixtures can be stored side by side. */
export function rawWithId(slug: Slug, ddbId: number): any {
  const raw = loadRaw(slug);
  raw.data.id = ddbId;
  return raw;
}

/** A fresh store on in-memory storage, holding one imported fixture, which is opened. */
export async function seed(slug: Slug, storage: AppStorage = memoryStorage()): Promise<StoredCharacter> {
  await useStore.getState().init(storage);
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
