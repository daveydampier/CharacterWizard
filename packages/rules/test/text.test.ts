import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { abilityLabel, buildSheet, rollLine, skillLabel, spacedDice } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('labels', () => {
  it('spells out abilities and skills the way they are said at the table', () => {
    expect(abilityLabel('str')).toBe('Strength');
    expect(abilityLabel('cha')).toBe('Charisma');
    expect(skillLabel('stealth')).toBe('Stealth');
    expect(skillLabel('animal-handling')).toBe('Animal Handling');
    expect(skillLabel('sleight-of-hand')).toBe('Sleight of Hand');
  });
});

describe('spacedDice', () => {
  it('puts spaces around the sign and leaves flat numbers alone', () => {
    expect(spacedDice('1d8+3')).toBe('1d8 + 3');
    expect(spacedDice('1d8-1')).toBe('1d8 - 1');
    expect(spacedDice('2d6')).toBe('2d6');
    expect(spacedDice('4')).toBe('4');
    expect(spacedDice(' 1d10 + 9 ')).toBe('1d10 + 9');
  });
});

describe('rollLine', () => {
  it('writes an attack with its damage and optional extra damage', () => {
    expect(rollLine({
      kind: 'attack', bonus: 5,
      damage: [{ dice: '1d8+3', type: 'Piercing' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    })).toBe('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
  });

  it('writes an attack with a penalty, no bonus, or no damage listed', () => {
    expect(rollLine({ kind: 'attack', bonus: -1, damage: [{ dice: '1d4', type: null }], optionalDamage: [] }))
      .toBe('Roll d20 - 1. Hit: 1d4.');
    expect(rollLine({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] })).toBe('Roll d20.');
  });

  it('prints flat damage as a number and zero damage as no damage', () => {
    expect(rollLine({ kind: 'attack', bonus: 6, damage: [{ dice: '4', type: 'Bludgeoning' }], optionalDamage: [] }))
      .toBe('Roll d20 + 6. Hit: 4 bludgeoning.');
    expect(rollLine({ kind: 'attack', bonus: 1, damage: [{ dice: '0', type: 'Bludgeoning' }], optionalDamage: [] }))
      .toBe('Roll d20 + 1. Hit: no damage.');
  });

  it('writes a save with the ability spelled out, with and without damage', () => {
    expect(rollLine({ kind: 'save', ability: 'str', dc: 13, damage: [{ dice: '2d6', type: 'necrotic' }] }))
      .toBe('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    expect(rollLine({ kind: 'save', ability: 'wis', dc: 13, damage: [] }))
      .toBe('They roll a Wisdom save against DC 13.');
  });

  it('uses "an" before an ability that starts with a vowel', () => {
    expect(rollLine({ kind: 'save', ability: 'int', dc: 13, damage: [] }))
      .toBe('They roll an Intelligence save against DC 13.');
  });

  it('writes damage with no roll, bare dice, a check and nothing', () => {
    expect(rollLine({ kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] })).toBe('Damage: 1d6 necrotic.');
    expect(rollLine({ kind: 'damage', damage: [] })).toBe('');
    expect(rollLine({ kind: 'dice', dice: '1d10+9' })).toBe('Roll 1d10 + 9.');
    expect(rollLine({ kind: 'check', bonus: 3 })).toBe('Roll d20 + 3.');
    expect(rollLine({ kind: 'none' })).toBe('');
  });

  it('writes the lines the design shows for real characters', () => {
    const line = (slug: (typeof SLUGS)[number], name: string) => {
      const ability = buildSheet(convertCharacter(loadRaw(slug))).abilities.find((a) => a.name === name);
      if (!ability) throw new Error(`${slug} has no ${name}`);
      return rollLine(ability.roll);
    };
    expect(line('vlad', 'Wurms Claw - Sword')).toBe('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(line('vlad', 'Unarmed Strike')).toBe('Roll d20 + 1. Hit: no damage.');
    expect(line('vlad', 'Hex')).toBe('Damage: 1d6 necrotic.');
    expect(line('vlad', 'Arms of Hadar')).toBe('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    expect(line('danger', 'Second Wind')).toBe('Roll 1d10 + 9.');
  });

  it.each(SLUGS)('never prints a raw ability code or an undefined value: %s', (slug) => {
    for (const ability of buildSheet(convertCharacter(loadRaw(slug))).abilities) {
      const line = rollLine(ability.roll);
      expect(line).not.toMatch(/undefined|null|NaN|\b(STR|DEX|CON|INT|WIS|CHA)\b/);
    }
  });
});
