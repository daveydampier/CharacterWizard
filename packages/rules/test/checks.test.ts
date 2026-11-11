import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { abilityMod, abilityScores, proficiencyBonus, savingThrows, skills } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('core formulas', () => {
  it('computes ability modifiers', () => {
    expect([1, 8, 9, 10, 11, 16, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 3, 5]);
  });

  it('computes proficiency bonus by level', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('proficiency bonus', () => expect(proficiencyBonus(c.level)).toBe(e.proficiencyBonus));
  it('ability scores', () => expect(abilityScores(c)).toEqual(e.scores));
  it('saving throws', () => expect(savingThrows(c)).toEqual(e.saves));
  it('skills', () => expect(skills(c)).toEqual(e.skills));
});

describe('score overrides', () => {
  it('replaces the computed score, winning over bonus and set modifiers', () => {
    const c = convertCharacter(loadRaw('vlad'));
    const mod = (type: string, value: number) => ({
      type, subType: 'wisdom-score', value, ability: null, dice: null,
      addProficiency: false, restriction: '', fromItem: false, componentId: null,
    });
    c.modifiers.push(mod('bonus', 1), mod('set', 20));
    c.scoreOverrides = { wis: 18 };
    expect(abilityScores(c).wis).toBe(18);
    expect(abilityScores(c).cha).toBe(abilityScores(convertCharacter(loadRaw('vlad'))).cha);
  });
});

describe('conditional bonuses', () => {
  it('ignores a bonus that has a restriction', () => {
    const c = convertCharacter(loadRaw('vlad'));
    const before = savingThrows(c).con;
    c.modifiers.push({
      type: 'bonus', subType: 'constitution-saving-throws', value: 5, ability: null, dice: null,
      addProficiency: false, restriction: 'against poison', fromItem: false, componentId: null,
    });
    expect(savingThrows(c).con).toBe(before);
  });
});
