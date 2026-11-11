import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildAbilities, spellAttackBonus, spellSaveDc, spellSlots, spellcasting } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('spell attack and save DC', () => {
    const s = spellcasting(c);
    expect(s ? { attack: s.attack, saveDc: s.saveDc } : null).toEqual(e.spellcasting);
  });

  it('spell slots', () => {
    const { slots, pact } = spellSlots(c);
    expect(slots).toEqual(e.slots);
    expect(pact).toEqual(e.pactSlots);
  });
});

describe('class-specific spell attack bonus', () => {
  it('adds a <class>-spell-attacks bonus only for that class', () => {
    const c = convertCharacter(loadRaw('vlad'));
    const before = spellAttackBonus(c, 'cha');
    c.modifiers.push({
      type: 'bonus', subType: 'warlock-spell-attacks', value: 2, ability: null, dice: null,
      addProficiency: false, restriction: '', fromItem: false, componentId: null,
    });
    expect(spellAttackBonus(c, 'cha')).toBe(before);
    expect(spellAttackBonus(c, 'cha', 'Wizard')).toBe(before);
    expect(spellAttackBonus(c, 'cha', 'Warlock')).toBe(before + 2);
    expect(spellcasting(c)?.attack).toBe(before + 2);
    const blast = buildAbilities(c).find((a) => a.name === 'Eldritch Blast');
    expect(blast?.roll).toMatchObject({ kind: 'attack', bonus: before + 2 });
  });
});

describe('subclass-granted spells without the Spellcasting feature', () => {
  it('still has a save DC from the subclass ability', () => {
    const sid = convertCharacter(loadRaw('sid'));
    expect(spellSaveDc(sid, 'cha', sid.classes[0].name)).toBe(12);
  });
});
