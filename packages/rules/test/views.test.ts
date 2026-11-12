import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildSheet, combatGroups, exploreAbilities } from '../src/index';
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

  it('puts abilities with unknown timing in other', () => {
    expect(combatGroups(sheetOf('franny')).other.map((a) => a.name)).toEqual(['Twig Attack', 'Twig Attack']);
  });

  it.each(SLUGS)('leaves out only the abilities that take a minute or more: %s', (slug) => {
    const sheet = sheetOf(slug);
    const groups = combatGroups(sheet);
    const shown = Object.values(groups).reduce((n, list) => n + list.length, 0);
    expect(shown).toBe(sheet.abilities.filter((a) => a.timing !== 'long').length);
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
