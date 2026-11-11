import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('actions', () => {
  it('reads timing and limited uses', () => {
    const actions = convertCharacter(loadRaw('danger')).actions;
    expect(actions.find((a) => a.name === 'Action Surge')).toMatchObject({
      timing: 'free', source: 'class', uses: { base: 1, ability: null, addProficiency: false, reset: 'short' },
    });
    expect(actions.find((a) => a.name === 'Second Wind')).toMatchObject({
      timing: 'bonus', attack: null, dice: { count: 1, sides: 10, fixed: 9 },
      uses: { base: 3, reset: 'long' },
    });
  });

  it('reads an attack granted by a feat', () => {
    const pole = convertCharacter(loadRaw('danger')).actions.find((a) => a.name === 'Pole Strike');
    expect(pole).toMatchObject({
      source: 'feat', timing: 'bonus', attack: { ability: 'str', proficient: true }, dice: { count: 1, sides: 4, fixed: 0 },
    });
  });

  it('reads a save-based action', () => {
    const turn = convertCharacter(loadRaw('maya')).actions.find((a) => a.name === 'Channel Divinity: Turn Undead');
    expect(turn).toMatchObject({ timing: 'action', attack: null, saveAbility: 'wis', dcAbility: 'wis' });
  });

  it('reads a use count based on an ability modifier or proficiency bonus', () => {
    const insp = convertCharacter(loadRaw('milton')).actions.find((a) => a.name === 'Bardic Inspiration');
    expect(insp?.uses).toEqual({ base: 0, ability: 'cha', addProficiency: false, reset: 'long' });
    const luck = convertCharacter(loadRaw('vlad')).actions.find((a) => a.name === 'Luck Points');
    expect(luck?.uses).toEqual({ base: 0, ability: null, addProficiency: true, reset: 'long' });
  });

  it('reads custom actions', () => {
    const custom = convertCharacter(loadRaw('franny')).actions.filter((a) => a.source === 'custom');
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({
      name: 'Twig Attack', attack: { ability: 'dex', proficient: true }, dice: { count: 1, sides: 8, fixed: 0 },
    });
  });

  it('keeps actions that have neither an id nor a name', () => {
    const actions = convertCharacter({
      data: {
        actions: { class: [{ activation: { activationType: 1 } }, { activation: { activationType: 3 } }], race: [{}] },
        customActions: [{}, {}],
      },
    }).actions;
    expect(actions).toHaveLength(5);
    expect(new Set(actions.map((a) => a.key)).size).toBe(5);
    expect(actions.every((a) => !a.key.includes('undefined'))).toBe(true);
  });

  it.each(SLUGS)('drops no action: %s', (slug) => {
    const d = loadRaw(slug).data;
    const expected =
      Object.values(d.actions ?? {}).reduce((n: number, list: any) => n + (list ?? []).length, 0) +
      (d.customActions ?? []).length;
    expect(convertCharacter(loadRaw(slug)).actions).toHaveLength(expected);
  });
});
