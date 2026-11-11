import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildAbilities, buildSheet, mapDdbTags, resources } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('mapDdbTags', () => {
  it('maps known tags, drops Combat and sends unknown tags to utility', () => {
    expect(mapDdbTags(['Damage', 'Debuff'])).toEqual(['damage', 'debuff']);
    expect(mapDdbTags(['Teleportation', 'Warding'])).toEqual(['movement', 'defence']);
    expect(mapDdbTags(['Social', 'Deception'])).toEqual(['social']);
    expect(mapDdbTags(['Combat'])).toEqual([]);
    expect(mapDdbTags(['Summoning', 'Never Seen Before'])).toEqual(['utility']);
  });

  it('treats tag names that exist on Object.prototype as unknown', () => {
    expect(mapDdbTags(['constructor', 'toString', '__proto__', 'hasOwnProperty'])).toEqual(['utility']);
  });
});

describe('buildAbilities: vlad', () => {
  const abilities = buildAbilities(convertCharacter(loadRaw('vlad')));
  const named = (name: string) => abilities.filter((a) => a.name === name);

  it('builds a weapon attack', () => {
    expect(named('Wurms Claw - Sword')[0]).toMatchObject({
      source: 'item', timing: 'action', tags: ['damage'], cost: { kind: 'none' },
      roll: {
        kind: 'attack', bonus: 5,
        damage: [{ dice: '1d8+3', type: 'Piercing' }],
        optionalDamage: [{ dice: '1d6', type: 'poison' }],
      },
    });
  });

  it('builds an attack cantrip', () => {
    expect(named('Eldritch Blast')[0]).toMatchObject({
      source: 'spell', timing: 'action', cost: { kind: 'none' }, tags: ['damage'], tagSource: 'import',
      roll: { kind: 'attack', bonus: 5, damage: [{ dice: '1d10', type: 'force' }], optionalDamage: [] },
    });
  });

  it('builds a pact slot spell with concentration', () => {
    expect(named('Hex')[0]).toMatchObject({
      timing: 'bonus', concentration: true, cost: { kind: 'slot', minLevel: 1, pact: true }, roll: { kind: 'none' },
    });
  });

  it('builds a save spell', () => {
    expect(named('Arms of Hadar')[0]).toMatchObject({ area: true, roll: { kind: 'save', ability: 'str', dc: 13 } });
  });

  it('keeps the slot and free versions of the same spell apart', () => {
    const costs = named('Misty Step').map((a) => a.cost.kind).sort();
    expect(costs).toEqual(['slot', 'uses']);
  });

  it('includes an unarmed strike', () => {
    expect(named('Unarmed Strike')[0]).toMatchObject({
      source: 'universal', timing: 'action', roll: { kind: 'attack', bonus: 1, damage: [{ dice: '0', type: 'Bludgeoning' }] },
    });
  });

  it('lists resources with their maximums', () => {
    const list = resources(convertCharacter(loadRaw('vlad')));
    const freeMisty = list.find((r) => r.name === 'Misty Step');
    expect(freeMisty).toMatchObject({ max: 3, reset: 'long' });
    expect(list.find((r) => r.name === 'Luck Points')).toMatchObject({ max: 2, reset: 'long' });
    expect(list.find((r) => r.name === 'Wurms Claw - Sword')).toMatchObject({ max: 3, reset: 'long' });
  });
});

describe('buildAbilities: other characters', () => {
  it('uses the spell\'s own casting ability and scaled damage', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('danger')));
    expect(abilities.find((a) => a.name === 'Fire Bolt')).toMatchObject({
      roll: { kind: 'attack', bonus: 7, damage: [{ dice: '2d10', type: 'fire' }] },
    });
    expect(abilities.find((a) => a.name === 'Action Surge')).toMatchObject({ timing: 'free', cost: { kind: 'uses' } });
  });

  it('gives a save DC to a subclass caster without the Spellcasting feature', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('sid')));
    expect(abilities.find((a) => a.name === 'Fear')).toMatchObject({ roll: { kind: 'save', ability: 'wis', dc: 12 } });
  });

  it('builds a save-based class action', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('maya')));
    expect(abilities.find((a) => a.name === 'Channel Divinity: Turn Undead')).toMatchObject({
      timing: 'action', roll: { kind: 'save', ability: 'wis', dc: 13 },
    });
  });

  it.each(SLUGS)('gives every ability a unique key: %s', (slug) => {
    const keys = buildAbilities(convertCharacter(loadRaw(slug))).map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.each(SLUGS)('buildSheet: %s', (slug) => {
  it('agrees with the expected file on every headline number', () => {
    const sheet = buildSheet(convertCharacter(loadRaw(slug)));
    const e = loadExpected(slug);
    expect({
      level: sheet.level, proficiencyBonus: sheet.proficiencyBonus, scores: sheet.scores, saves: sheet.saves,
      skills: sheet.skills, initiative: sheet.initiative, armorClass: sheet.armorClass,
      attacksPerAction: sheet.attacksPerAction, slots: sheet.slots, pactSlots: sheet.pactSlots,
    }).toEqual({
      level: e.level, proficiencyBonus: e.proficiencyBonus, scores: e.scores, saves: e.saves,
      skills: e.skills, initiative: e.initiative, armorClass: e.armorClass,
      attacksPerAction: e.attacksPerAction, slots: e.slots, pactSlots: e.pactSlots,
    });
  });
});

describe('content the app has never seen', () => {
  it('builds a displayable sheet from an empty character', () => {
    const sheet = buildSheet(convertCharacter({}));
    expect(sheet.armorClass).toBe(5);
    expect(sheet.abilities.map((a) => a.name)).toEqual(['Unarmed Strike']);
  });

  it('shows abilities with unknown timing, reset type and tags instead of failing', () => {
    const raw = {
      data: {
        id: 1, name: 'Synthetic',
        stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })),
        classes: [{ level: 1, definition: { name: 'Homebrew Class' }, classFeatures: [] }],
        actions: {
          somethingNew: [{
            id: 'x1', name: 'Mystery Power', activation: { activationType: 99 },
            limitedUse: { maxUses: 2, resetType: 'OnAFullMoon' },
          }],
        },
        spells: {
          class: [{
            definition: { id: 77, name: 'Odd Spell', level: 1, tags: ['Never Seen Before'], activation: { activationType: 42 } },
            usesSpellSlot: true,
          }],
        },
      },
    };
    const sheet = buildSheet(convertCharacter(raw));
    expect(sheet.abilities.find((a) => a.name === 'Mystery Power')).toMatchObject({ timing: 'unknown', tags: [], tagSource: 'none' });
    expect(sheet.abilities.find((a) => a.name === 'Odd Spell')).toMatchObject({ timing: 'unknown', tags: ['utility'], roll: { kind: 'none' } });
    expect(sheet.resources.find((r) => r.name === 'Mystery Power')).toMatchObject({ max: 2, reset: 'unknown' });
  });
});
