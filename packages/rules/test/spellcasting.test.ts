import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { spellSaveDc, spellSlots, spellcasting } from '../src/index';
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

describe('subclass-granted spells without the Spellcasting feature', () => {
  it('still has a save DC from the subclass ability', () => {
    const sid = convertCharacter(loadRaw('sid'));
    expect(spellSaveDc(sid, 'cha', sid.classes[0].name)).toBe(12);
  });
});
