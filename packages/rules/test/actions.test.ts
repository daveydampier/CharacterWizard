import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { actionAttacks, limitedUseMax, limitedUses } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('action attacks', () => {
    const sort = <T extends { name: string; source: string }>(list: T[]): T[] =>
      [...list].sort((a, b) => `${a.name}|${a.source}`.localeCompare(`${b.name}|${b.source}`));
    const actual = actionAttacks(c).map(({ name, source, attack, damage }) => ({ name, source, attack, damage }));
    expect(sort(actual)).toEqual(sort(e.actionAttacks));
  });

  it('limited-use maximums', () => {
    expect(limitedUses(c)).toMatchObject(e.limitedUses);
  });
});

describe('limitedUseMax', () => {
  const c = convertCharacter(loadRaw('vlad'));

  it('adds an ability modifier, with a minimum of one', () => {
    expect(limitedUseMax(c, { base: 0, ability: 'cha', addProficiency: false, reset: 'long' })).toBe(3);
    expect(limitedUseMax(c, { base: 0, ability: 'str', addProficiency: false, reset: 'long' })).toBe(1);
  });

  it('leaves a fixed count alone', () => {
    expect(limitedUseMax(c, { base: 0, ability: null, addProficiency: false, reset: 'unknown' })).toBe(0);
  });
});
