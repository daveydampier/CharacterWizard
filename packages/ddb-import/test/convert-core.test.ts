import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { resetFrom, timingFromActivation } from '../src/raw';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('convertCharacter core: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));

  it('reads identity and level', () => {
    expect(c.name.length).toBeGreaterThan(0);
    expect(c.id).toBeGreaterThan(0);
    expect(c.level).toBe(loadExpected(slug).level);
  });

  it('reads six base scores', () => {
    expect(Object.keys(c.baseScores)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    for (const v of Object.values(c.baseScores)) expect(v).toBeGreaterThan(0);
  });
});

describe('score overrides', () => {
  it('carries an overrideStats value separately and leaves the base score alone', () => {
    const plain = convertCharacter(loadRaw('maya'));
    expect(plain.scoreOverrides).toEqual({});
    const raw = loadRaw('maya');
    const wis = raw.data.overrideStats.find((s: any) => s.id === 5);
    wis.value = plain.baseScores.wis + 3;
    const c = convertCharacter(raw);
    expect(c.scoreOverrides).toEqual({ wis: plain.baseScores.wis + 3 });
    expect(c.baseScores).toEqual(plain.baseScores);
  });
});

describe('classes', () => {
  it('marks a Warlock as Pact Magic with its slot row', () => {
    const cls = convertCharacter(loadRaw('vlad')).classes[0];
    expect(cls).toMatchObject({
      name: 'Warlock', level: 3, hasSpellcasting: true, isPactMagic: true, spellcastingAbility: 'cha',
    });
    expect(cls.slots.slice(0, 3)).toEqual([0, 2, 0]);
  });

  it('gives a subclass caster the subclass ability and the class slot row', () => {
    const cls = convertCharacter(loadRaw('danger')).classes[0];
    expect(cls).toMatchObject({ name: 'Fighter', level: 9, hasSpellcasting: true, isPactMagic: false, spellcastingAbility: 'int' });
    expect(cls.slots.slice(0, 3)).toEqual([4, 2, 0]);
  });

  it('gives no slots to a class without the Spellcasting feature', () => {
    const sid = convertCharacter(loadRaw('sid')).classes[0];
    expect(sid.hasSpellcasting).toBe(false);
    expect(sid.slots).toEqual([]);
    expect(sid.spellcastingAbility).toBe('cha');
    expect(convertCharacter(loadRaw('franny')).classes[0].slots).toEqual([]);
  });
});

describe('modifiers', () => {
  it('keeps modifiers from an equipped item', () => {
    const mods = convertCharacter(loadRaw('maya')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'armor-class', value: 1, fromItem: true }));
  });

  it('flags a bonus that adds the proficiency bonus', () => {
    const mods = convertCharacter(loadRaw('vlad')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'initiative', value: null, addProficiency: true }));
  });

  it('reads a bonus that is an ability modifier', () => {
    const mods = convertCharacter(loadRaw('maya')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'arcana', value: null, ability: 'wis' }));
  });

  it('drops modifiers from an item that is not equipped', () => {
    const raw = loadRaw('maya');
    for (const item of raw.data.inventory) item.equipped = false;
    const mods = convertCharacter(raw).modifiers;
    expect(mods.filter((m) => m.fromItem)).toEqual([]);
  });
});

describe('skill customisations', () => {
  it('reads a per-skill proficiency level and ability override', () => {
    const custom = convertCharacter(loadRaw('vlad')).skillCustom;
    expect(custom.investigation).toEqual({ proficiency: 'expertise', ability: 'cha' });
    expect(custom.perception).toEqual({ proficiency: 'expertise' });
  });
});

describe('unknown input', () => {
  it('never throws on empty or malformed input', () => {
    for (const input of [undefined, null, 42, 'x', {}, { data: null }, { data: {} }, { data: { classes: 'nope', modifiers: 7 } }]) {
      const c = convertCharacter(input);
      expect(c.level).toBe(0);
      expect(c.classes).toEqual([]);
      expect(c.modifiers).toEqual([]);
    }
  });

  it('maps unknown activation and reset values to unknown', () => {
    expect(timingFromActivation({ activationType: 99 })).toBe('unknown');
    expect(timingFromActivation(null)).toBe('unknown');
    expect(timingFromActivation({ activationType: 8 })).toBe('free');
    expect(timingFromActivation({ activationType: 7 })).toBe('long');
    expect(resetFrom('Weird')).toBe('unknown');
    expect(resetFrom('Dawn')).toBe('long');
    expect(resetFrom('Consumable')).toBe('never');
    expect(resetFrom(1)).toBe('short');
  });
});
