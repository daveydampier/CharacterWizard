import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('spells', () => {
  const vlad = convertCharacter(loadRaw('vlad')).spells;

  it('reads timing, concentration, slot use and tags', () => {
    const hex = vlad.find((s) => s.name === 'Hex');
    expect(hex).toMatchObject({
      level: 1, timing: 'bonus', concentration: true, usesSlot: true, attack: false,
      saveAbility: null, uses: null, ddbTags: ['Damage', 'Debuff'], range: '90 ft.',
    });
  });

  it('reads an attack cantrip with its damage', () => {
    const blast = vlad.find((s) => s.name === 'Eldritch Blast');
    expect(blast).toMatchObject({ level: 0, timing: 'action', attack: true, usesSlot: false, damage: { dice: '1d10', type: 'force' } });
  });

  it('reads a save spell', () => {
    const arms = vlad.find((s) => s.name === 'Arms of Hadar');
    expect(arms).toMatchObject({ saveAbility: 'str', attack: false, area: true });
  });

  it('keeps the same spell twice when it is granted with different costs', () => {
    const misty = vlad.filter((s) => s.name === 'Misty Step');
    expect(misty).toHaveLength(2);
    expect(misty.map((s) => s.usesSlot).sort()).toEqual([false, true]);
    const free = misty.find((s) => !s.usesSlot);
    expect(free?.uses).toEqual({ base: 0, ability: 'cha', addProficiency: false, reset: 'long' });
    expect(new Set(misty.map((s) => s.key)).size).toBe(2);
  });

  it('scales cantrip damage by character level', () => {
    const fireBolt = convertCharacter(loadRaw('danger')).spells.find((s) => s.name === 'Fire Bolt');
    expect(fireBolt?.damage).toEqual({ dice: '2d10', type: 'fire' });
    expect(fireBolt?.castingAbility).toBe('int');
  });

  it('links an item-granted spell to its item and ignores the placeholder pool', () => {
    const ray = convertCharacter(loadRaw('maya')).spells.find((s) => s.name === 'Scorching Ray');
    expect(ray).toMatchObject({ itemKey: 'item:10968023:base', uses: null });
    expect(ray?.key.endsWith(':free')).toBe(true);
    expect(vlad.every((s) => s.itemKey === null)).toBe(true);
  });

  it('skips a spell granted by an item that is not active', () => {
    expect(convertCharacter(loadRaw('minkis')).spells.find((s) => s.name === 'Enlarge/Reduce')).toBeUndefined();
  });

  it.each(SLUGS)('gives every spell a unique key: %s', (slug) => {
    const keys = convertCharacter(loadRaw(slug)).spells.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
