import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import {
  armorClass, attacksPerAction, formatDamage, initiative, unarmedStrike, versatileDice, weaponAttacks,
} from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('damage formatting', () => {
  it('formats a bonus with its sign and omits zero', () => {
    expect(formatDamage('1d8', 3)).toBe('1d8+3');
    expect(formatDamage('1d4', -1)).toBe('1d4-1');
    expect(formatDamage('1d6', 0)).toBe('1d6');
  });

  it('steps a versatile die up one size', () => {
    expect(versatileDice('1d6')).toBe('1d8');
    expect(versatileDice('1d8')).toBe('1d10');
    expect(versatileDice('2d6')).toBe('2d8');
    expect(versatileDice('weird')).toBeNull();
  });
});

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);
  const byName = <T extends { name: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));

  it('initiative', () => expect(initiative(c)).toBe(e.initiative));
  it('armor class', () => expect(armorClass(c)).toBe(e.armorClass));
  it('attacks per action', () => expect(attacksPerAction(c)).toBe(e.attacksPerAction));
  it('unarmed strike', () => expect(unarmedStrike(c)).toEqual(e.unarmed));
  it('weapon attacks', () => {
    const actual = weaponAttacks(c).map(({ name, attack, damage, versatile }) => ({ name, attack, damage, versatile }));
    expect(byName(actual)).toEqual(byName(e.weapons));
  });
});
