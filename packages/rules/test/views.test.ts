import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { applyEdits, buildSheet, combatGroups, emptyEdits, exploreAbilities } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

const sheetOf = (slug: (typeof SLUGS)[number]) => buildSheet(convertCharacter(loadRaw(slug)));

describe('combatGroups', () => {
  it('groups by timing and keeps the sheet\'s order', () => {
    const groups = combatGroups(sheetOf('vlad'));
    expect(groups.action.slice(0, 4).map((a) => a.name)).toEqual([
      'Wurms Claw - Sword', 'Wurms Claw - Axe', 'Wurms Claw - Hammer', 'Unarmed Strike',
    ]);
    expect(groups.bonus.map((a) => a.name)).toEqual([
      'Hex', 'Misty Step', 'Misty Step', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    expect(groups.reaction.map((a) => a.name)).toEqual(['Hellish Rebuke', 'Hellish Rebuke']);
    expect(groups.free.map((a) => a.name)).toContain('Luck Points');
    expect(groups.other).toEqual([]);
  });

  it('keeps passive abilities apart from the ones that need no action', () => {
    const base = sheetOf('vlad');
    const hex = base.abilities.find((a) => a.name === 'Hex');
    if (!hex) throw new Error('no Hex');
    const before = combatGroups(base);
    const edits = { ...emptyEdits(), abilities: { [hex.key]: { timing: 'passive' as const } } };
    const after = combatGroups(applyEdits(base, edits));
    expect(after.passive.map((a) => a.name)).toEqual([...before.passive.map((a) => a.name), 'Hex']);
    expect(after.free).toEqual(before.free);
    expect(after.bonus.map((a) => a.name)).not.toContain('Hex');
  });

  it.each(SLUGS)('lists only free abilities under "No action needed" and only passive ones under "Always on": %s', (slug) => {
    const groups = combatGroups(sheetOf(slug));
    expect(groups.free.every((a) => a.timing === 'free')).toBe(true);
    expect(groups.passive.every((a) => a.timing === 'passive')).toBe(true);
  });

  it('puts abilities with unknown timing in other', () => {
    expect(combatGroups(sheetOf('franny')).other.map((a) => a.name)).toEqual(['Twig Attack', 'Twig Attack']);
  });

  it.each(SLUGS)('leaves out only the abilities that take a minute or more: %s', (slug) => {
    const sheet = sheetOf(slug);
    const { universal, ...groups } = combatGroups(sheet);
    const shown = Object.values(groups).reduce((n, list) => n + list.length, 0);
    expect(shown).toBe(sheet.abilities.filter((a) => a.timing !== 'long').length);
    expect(universal).toEqual(sheet.universal);
  });
});

describe('exploreAbilities', () => {
  it('lists utility, social and movement abilities, rituals and long abilities', () => {
    expect(exploreAbilities(sheetOf('vlad')).map((a) => a.name)).toEqual([
      'Charm Person', 'Misty Step', 'Phantasmal Force', 'Misty Step', 'Magical Cunning',
    ]);
    expect(exploreAbilities(sheetOf('minkis')).map((a) => a.name)).toEqual([
      'Feather Fall', 'Find Familiar', 'Detect Magic', 'Identify', 'Mind Spike', 'Message', 'Mage Hand',
    ]);
  });

  it('leaves out an untagged feature with a combat timing', () => {
    expect(exploreAbilities(sheetOf('danger')).map((a) => a.name)).not.toContain('Second Wind');
    expect(exploreAbilities(sheetOf('franny')).map((a) => a.name)).toEqual(['Beast Sense', 'Speak with Animals']);
  });
});
