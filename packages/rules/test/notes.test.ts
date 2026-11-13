import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import type { Character, Modifier } from '@cw/model';
import { buildSheet, conditionalNotes } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

const modifier = (over: Partial<Modifier>): Modifier => ({
  type: 'bonus', subType: '', value: null, ability: null, dice: null,
  addProficiency: false, restriction: '', fromItem: false, componentId: null, ...over,
});

const withModifiers = (...mods: Partial<Modifier>[]): Character => {
  const c = convertCharacter({});
  c.modifiers = mods.map(modifier);
  return c;
};

describe('conditionalNotes', () => {
  it('puts unconditional advantage on its skill row and explains it', () => {
    expect(conditionalNotes(withModifiers({ type: 'advantage', subType: 'intimidation' }))).toEqual([
      { target: { kind: 'skill', skill: 'intimidation' }, text: 'Advantage (roll twice, keep the higher).' },
    ]);
  });

  it('puts conditional advantage on its saving throw row with the sheet\'s own condition', () => {
    const notes = conditionalNotes(withModifiers({
      type: 'advantage', subType: 'constitution-saving-throws',
      restriction: 'saving throws that you make to maintain Concentration.',
    }));
    expect(notes).toEqual([{
      target: { kind: 'save', ability: 'con' },
      text: 'Advantage: saving throws that you make to maintain Concentration.',
    }]);
  });

  it('trims the condition and ends it with a full stop', () => {
    const [note] = conditionalNotes(withModifiers({
      type: 'disadvantage', subType: 'stealth', restriction: '  while wearing this armour ',
    }));
    expect(note.text).toBe('Disadvantage: while wearing this armour.');
  });

  it('explains disadvantage', () => {
    const [note] = conditionalNotes(withModifiers({ type: 'disadvantage', subType: 'stealth' }));
    expect(note.text).toBe('Disadvantage (roll twice, keep the lower).');
  });

  it('names the subject of a note that belongs to no row', () => {
    const notes = conditionalNotes(withModifiers(
      { type: 'advantage', subType: 'spell-attacks', restriction: 'Advantage on Sorcerer Spell Attacks' },
      { type: 'immunity', subType: 'charmed', restriction: 'Raging' },
      { type: 'damage', subType: 'bludgeoning', dice: '1d12', restriction: 'DC 14 Dex Save' },
      { type: 'advantage', subType: 'constitution-ability-checks' },
    ));
    expect(notes.map((n) => n.target.kind)).toEqual(['other', 'other', 'other', 'other']);
    expect(notes.map((n) => n.text)).toEqual([
      'Advantage on spell attacks: Advantage on Sorcerer Spell Attacks.',
      'Immunity, charmed: Raging.',
      'Damage 1d12, bludgeoning: DC 14 Dex Save.',
      'Advantage on constitution ability checks.',
    ]);
  });

  it('shows the amount of a conditional bonus on a row', () => {
    const [note] = conditionalNotes(withModifiers({
      type: 'bonus', subType: 'stealth', value: 2, restriction: 'in dim light',
    }));
    expect(note).toEqual({ target: { kind: 'skill', skill: 'stealth' }, text: 'Bonus + 2: in dim light.' });
  });

  it('ignores modifiers that are neither conditional nor advantage', () => {
    expect(conditionalNotes(withModifiers(
      { type: 'bonus', subType: 'stealth', value: 2 },
      { type: 'proficiency', subType: 'athletics' },
    ))).toEqual([]);
  });

  it('lists the same note once', () => {
    const twice = { type: 'advantage', subType: 'intimidation' };
    expect(conditionalNotes(withModifiers(twice, twice))).toHaveLength(1);
  });

  it('survives modifier types and subtypes it has never seen', () => {
    const notes = conditionalNotes(withModifiers(
      { type: 'constructor', subType: 'toString', restriction: 'odd' },
      { type: '', subType: '', restriction: 'no type at all' },
    ));
    expect(notes.map((n) => n.text)).toEqual(['Constructor, toString: odd.', 'Note: no type at all.']);
  });

  it('finds the notes on real characters', () => {
    const notes = (slug: (typeof SLUGS)[number]) => conditionalNotes(convertCharacter(loadRaw(slug)));
    expect(notes('vlad')).toEqual([
      { target: { kind: 'skill', skill: 'intimidation' }, text: 'Advantage (roll twice, keep the higher).' },
    ]);
    expect(notes('danger')).toEqual([{
      target: { kind: 'save', ability: 'con' },
      text: 'Advantage: saving throws that you make to maintain Concentration.',
    }]);
    expect(notes('franny').map((n) => n.target.kind)).toEqual(['save', 'other', 'save', 'other', 'other']);
    expect(notes('sid')).toEqual([]);
  });
});

describe('buildSheet: what the Explore view needs', () => {
  it.each(SLUGS)('reports a proficiency level for every skill and save: %s', (slug) => {
    const sheet = buildSheet(convertCharacter(loadRaw(slug)));
    expect(Object.keys(sheet.skillLevels).sort()).toEqual(Object.keys(sheet.skills).sort());
    expect(Object.keys(sheet.saveProficiency).sort()).toEqual(Object.keys(sheet.saves).sort());
    expect(sheet.notes).toEqual(conditionalNotes(convertCharacter(loadRaw(slug))));
  });

  it('knows which skills and saves are proficient', () => {
    const vlad = buildSheet(convertCharacter(loadRaw('vlad')));
    expect(vlad.skillLevels.investigation).toBe('expertise');
    expect(vlad.skillLevels.athletics).toBe('none');
    expect(vlad.saveProficiency).toMatchObject({ wis: true, cha: true, str: false });
  });

  it('describes the class and level in one line', () => {
    expect(buildSheet(convertCharacter(loadRaw('vlad'))).classLine).toBe('Warlock 3');
    expect(buildSheet(convertCharacter(loadRaw('danger'))).classLine).toBe('Fighter 9');
    expect(buildSheet(convertCharacter({})).classLine).toBe('');
  });

  it('leaves the headline numbers as they were', () => {
    const sheet = buildSheet(convertCharacter(loadRaw('vlad')));
    expect(sheet.saves).toEqual(loadExpected('vlad').saves);
  });
});
