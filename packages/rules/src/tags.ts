import type { Tag } from '@cw/model';

const DDB_TAGS: Record<string, Tag | null> = {
  Damage: 'damage',
  Healing: 'healing',
  Buff: 'buff',
  Debuff: 'debuff',
  Control: 'control',
  Teleportation: 'movement',
  Warding: 'defence',
  Social: 'social',
  Deception: 'social',
  Combat: null,
};

/** Unknown tags become 'utility'. Combat is dropped. Duplicates are removed, order kept. */
export function mapDdbTags(tags: string[]): Tag[] {
  const out: Tag[] = [];
  for (const raw of tags) {
    const mapped = Object.hasOwn(DDB_TAGS, raw) ? DDB_TAGS[raw] : 'utility';
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}
