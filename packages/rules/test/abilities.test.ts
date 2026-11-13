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
      poolKey: 'item:10956860:base', notes: [], ritual: false,
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
      timing: 'bonus', concentration: true, cost: { kind: 'slot', minLevel: 1, pact: true },
      roll: { kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] },
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

  it.each(SLUGS)('drops no ability: %s', (slug) => {
    const c = convertCharacter(loadRaw(slug));
    expect(buildAbilities(c)).toHaveLength(c.weapons.length + 1 + c.spells.length + c.actions.length);
  });
});

describe('rolls with no attack and no save', () => {
  const abilitiesOf = (slug: (typeof SLUGS)[number]) => buildAbilities(convertCharacter(loadRaw(slug)));

  it('shows the damage of a spell that needs no attack roll or saving throw', () => {
    expect(abilitiesOf('danger').find((a) => a.name === 'Absorb Elements')?.roll).toEqual({
      kind: 'damage', damage: [{ dice: '1d6', type: 'acid' }],
    });
  });

  it('shows a feature\'s dice without calling them damage', () => {
    const danger = abilitiesOf('danger');
    expect(danger.find((a) => a.name === 'Second Wind')?.roll).toEqual({ kind: 'dice', dice: '1d10+9' });
    expect(danger.find((a) => a.name === 'Tactical Mind')?.roll).toEqual({ kind: 'dice', dice: '1d10' });
    expect(abilitiesOf('milton').find((a) => a.name === 'Bardic Inspiration')?.roll).toEqual({ kind: 'dice', dice: '1d6' });
    expect(abilitiesOf('sid').find((a) => a.name === 'Sneak Attack')?.roll).toEqual({ kind: 'dice', dice: '2d6' });
  });

  it('keeps a spell with no damage and no roll as none', () => {
    expect(abilitiesOf('vlad').find((a) => a.name === 'Mage Armor')?.roll).toEqual({ kind: 'none' });
  });
});

describe('sources, rituals, notes and weapon pools', () => {
  const abilitiesOf = (raw: unknown) => buildAbilities(convertCharacter(raw));

  it.each(SLUGS)('never uses a source outside the model: %s', (slug) => {
    const allowed = ['spell', 'class', 'item', 'feat', 'species', 'background', 'universal', 'custom'];
    for (const a of abilitiesOf(loadRaw(slug))) expect(allowed).toContain(a.source);
  });

  it('maps a background action to the background source', () => {
    const raw = { data: { actions: { background: [{ id: 5, name: 'Background Trick', activation: { activationType: 1 } }] } } };
    expect(abilitiesOf(raw).find((a) => a.name === 'Background Trick')?.source).toBe('background');
  });

  it('marks ritual spells', () => {
    const minkis = abilitiesOf(loadRaw('minkis'));
    expect(minkis.find((a) => a.name === 'Detect Magic')?.ritual).toBe(true);
    expect(minkis.filter((a) => a.ritual).map((a) => a.name).sort()).toEqual(['Detect Magic', 'Find Familiar', 'Identify']);
  });

  it('links a weapon to its own charge pool and to nothing else', () => {
    const vlad = abilitiesOf(loadRaw('vlad'));
    const claws = vlad.filter((a) => a.name.startsWith('Wurms Claw'));
    expect(claws).toHaveLength(3);
    for (const claw of claws) {
      expect(claw.poolKey).toBe(claw.key);
      expect(claw.cost).toEqual({ kind: 'none' });
    }
    expect(vlad.filter((a) => a.poolKey !== null)).toHaveLength(3);
    expect(abilitiesOf(loadRaw('franny')).every((a) => a.poolKey === null)).toBe(true);
  });

  it('says which item grants a spell', () => {
    expect(abilitiesOf(loadRaw('maya')).find((a) => a.name === 'Scorching Ray')?.notes).toEqual(['From Shepherds Staff']);
    expect(abilitiesOf(loadRaw('vlad')).find((a) => a.name === 'Hex')?.notes).toEqual([]);
  });

  it('explains an unattuned weapon and shows no pool for it', () => {
    const raw = loadRaw('vlad');
    const item = raw.data.inventory.find((i: any) => i.equipped === true && i.definition.filterType === 'Weapon');
    item.definition.canAttune = true;
    item.isAttuned = false;
    const weapon = abilitiesOf(raw).find((a) => a.name === item.definition.name);
    expect(weapon).toMatchObject({ poolKey: null, notes: ['Not attuned: magic properties are off'] });
    expect(resources(convertCharacter(raw)).map((r) => r.name)).not.toContain(item.definition.name);
  });
});

describe('item charges and item-granted spells', () => {
  const sheetOf = (slug: (typeof SLUGS)[number]) => buildSheet(convertCharacter(loadRaw(slug)));

  it('charges an item spell to its item\'s pool', () => {
    const maya = sheetOf('maya');
    expect(maya.abilities.find((a) => a.name === 'Scorching Ray')?.cost).toEqual({
      kind: 'uses', resourceKey: 'item:10968023:base',
    });
    expect(maya.resources.find((r) => r.name === 'Shepherds Staff')).toMatchObject({ key: 'item:10968023:base', max: 1 });
  });

  it('lists no spell from an item that is not active', () => {
    expect(sheetOf('minkis').abilities.find((a) => a.name === 'Enlarge/Reduce')).toBeUndefined();
  });

  it('lists charges on equipped non-weapon items', () => {
    expect(sheetOf('franny').resources.find((r) => r.name.includes('Gift'))).toMatchObject({ max: 1 });
    expect(sheetOf('minkis').resources.find((r) => r.name === 'Focus of the Chess Master')).toMatchObject({ max: 2 });
    expect(sheetOf('sid').resources.find((r) => r.name === 'Quiver of Imagination')).toMatchObject({ max: 3 });
  });

  it('still lists each weapon pool once', () => {
    const pools = sheetOf('vlad').resources.filter((r) => r.name.startsWith('Wurms Claw'));
    expect(pools.map((r) => r.max)).toEqual([3, 3, 3]);
  });

  it('costs nothing when an item spell\'s item has no pool', () => {
    const c = convertCharacter(loadRaw('maya'));
    c.chargedItems = [];
    expect(buildAbilities(c).find((a) => a.name === 'Scorching Ray')?.cost).toEqual({ kind: 'none' });
  });

  it('costs a slot when an item spell is flagged as slot-using and its item has no pool', () => {
    const c = convertCharacter(loadRaw('maya'));
    const ray = c.spells.find((s) => s.name === 'Scorching Ray');
    if (!ray) throw new Error('fixture has no Scorching Ray');
    ray.usesSlot = true;
    expect(buildAbilities(c).find((a) => a.name === 'Scorching Ray')?.cost).toMatchObject({ kind: 'uses' });
    c.chargedItems = [];
    expect(buildAbilities(c).find((a) => a.name === 'Scorching Ray')?.cost).toEqual({ kind: 'slot', minLevel: 2, pact: false });
  });

  it.each(SLUGS)('has no empty resource and no duplicate resource key: %s', (slug) => {
    const list = sheetOf(slug).resources;
    expect(list.filter((r) => r.max === 0)).toEqual([]);
    expect(new Set(list.map((r) => r.key)).size).toBe(list.length);
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
