import { describe, expect, it } from 'vitest';
import {
  normaliseCustom, normaliseEdit, normaliseOrder, normalisePlayItem, normaliseRoll, normaliseTurn,
} from '../src/normalise';

describe('normalisePlayItem', () => {
  it('keeps a well-formed item as it is', () => {
    const item = { spent: { pact: 1, 'slot:1': 2 }, concentrationKey: 'spell:1:base:slot' };
    expect(normalisePlayItem(item)).toEqual(item);
  });

  it.each([null, undefined, 7, 'text', [], {}])('turns %j into an empty item', (data) => {
    expect(normalisePlayItem(data)).toEqual({ spent: {}, concentrationKey: null });
  });

  it('drops counts that are not positive whole numbers and rounds the rest down', () => {
    const data = { spent: { a: 2.9, b: 0, c: -1, d: 'three', e: Number.NaN, f: null }, concentrationKey: 5 };
    expect(normalisePlayItem(data)).toEqual({ spent: { a: 2 }, concentrationKey: null });
  });

  it('ignores a spent value that is not an object', () => {
    expect(normalisePlayItem({ spent: [1, 2], concentrationKey: 'k' })).toEqual({ spent: {}, concentrationKey: 'k' });
  });
});

describe('normaliseTurn', () => {
  it('keeps a well-formed turn as it is', () => {
    const turn = { action: true, bonus: false, reaction: true, slotSpentThisTurn: true };
    expect(normaliseTurn(turn)).toEqual(turn);
  });

  it.each([null, undefined, 'text', [], { action: 'yes', bonus: 1 }])('turns %j into a fresh turn', (data) => {
    expect(normaliseTurn(data)).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
  });
});

describe('normaliseRoll', () => {
  it('keeps each kind of roll that is well formed', () => {
    const rolls = [
      { kind: 'none' },
      { kind: 'attack', bonus: 5, damage: [{ dice: '1d8+3', type: 'piercing' }], optionalDamage: [{ dice: '1d6', type: 'poison' }] },
      { kind: 'save', ability: 'wis', dc: 13, damage: [{ dice: '2d6', type: null }] },
      { kind: 'check', bonus: -1 },
      { kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] },
      { kind: 'dice', dice: '1d10+9' },
    ];
    for (const roll of rolls) expect(normaliseRoll(roll)).toEqual(roll);
  });

  it('fills in the damage lists an attack or save left out', () => {
    expect(normaliseRoll({ kind: 'attack', bonus: 4 })).toEqual({ kind: 'attack', bonus: 4, damage: [], optionalDamage: [] });
    expect(normaliseRoll({ kind: 'save', ability: 'dex', dc: 12 })).toEqual({ kind: 'save', ability: 'dex', dc: 12, damage: [] });
  });

  it('trims dice and types, drops damage parts with no dice, and turns an empty type into none', () => {
    const roll = normaliseRoll({ kind: 'damage', damage: [{ dice: ' 2d6 ', type: ' fire ' }, { dice: '', type: 'cold' }, { dice: '4', type: '' }, 'junk'] });
    expect(roll).toEqual({ kind: 'damage', damage: [{ dice: '2d6', type: 'fire' }, { dice: '4', type: null }] });
  });

  it('rounds and bounds numbers', () => {
    expect(normaliseRoll({ kind: 'check', bonus: 3.9 })).toEqual({ kind: 'check', bonus: 3 });
    expect(normaliseRoll({ kind: 'check', bonus: 999 })).toEqual({ kind: 'check', bonus: 40 });
    expect(normaliseRoll({ kind: 'save', ability: 'con', dc: 0, damage: [] })).toEqual({ kind: 'save', ability: 'con', dc: 1, damage: [] });
  });

  it.each([
    [null], ['attack'], [{}], [{ kind: 'spell' }], [{ kind: 'attack', bonus: 'five' }],
    [{ kind: 'save', ability: 'luck', dc: 13 }], [{ kind: 'save', ability: 'wis' }],
    [{ kind: 'damage', damage: [] }], [{ kind: 'dice', dice: '  ' }],
  ])('returns null for %j', (data) => {
    expect(normaliseRoll(data)).toBeNull();
  });
});

describe('normaliseEdit', () => {
  it('keeps a well-formed edit as it is', () => {
    const edit = {
      timing: 'bonus', uses: { max: 3, reset: 'short' }, tags: ['damage', 'control'],
      roll: { kind: 'dice', dice: '1d4' }, inCombat: false, inExplore: true, hidden: true,
    };
    expect(normaliseEdit(edit)).toEqual(edit);
    expect(normaliseEdit({ uses: 'none' })).toEqual({ uses: 'none' });
  });

  it.each([null, undefined, 3, 'x', []])('turns %j into an edit that changes nothing', (data) => {
    expect(normaliseEdit(data)).toEqual({});
  });

  it('leaves out each field that is malformed, and keeps the rest', () => {
    expect(normaliseEdit({
      timing: 'instant', uses: { max: 'many', reset: 'long' }, tags: 'damage', roll: { kind: 'attack' },
      inCombat: 'yes', inExplore: 0, hidden: 'true', extra: 1,
    })).toEqual({});
    expect(normaliseEdit({ timing: 'reaction', uses: { max: 2 } })).toEqual({ timing: 'reaction' });
  });

  it('drops unknown and repeated tags, and keeps an empty list as "no tags"', () => {
    expect(normaliseEdit({ tags: ['damage', 'sparkly', 'damage', 'social'] })).toEqual({ tags: ['damage', 'social'] });
    expect(normaliseEdit({ tags: [] })).toEqual({ tags: [] });
  });

  it('bounds a maximum to 1 to 99', () => {
    expect(normaliseEdit({ uses: { max: 0, reset: 'long' } })).toEqual({ uses: { max: 1, reset: 'long' } });
    expect(normaliseEdit({ uses: { max: 250.7, reset: 'never' } })).toEqual({ uses: { max: 99, reset: 'never' } });
  });

  it('keeps hidden as false, which is how a feature that D&D Beyond hides is shown again', () => {
    expect(normaliseEdit({ hidden: false })).toEqual({ hidden: false });
    expect(normaliseEdit({ hidden: true })).toEqual({ hidden: true });
    expect(normaliseEdit({ hidden: 'yes' })).toEqual({});
  });
});

describe('normaliseCustom', () => {
  it('keeps a well-formed custom ability and takes its key from the item, not the data', () => {
    const data = {
      key: 'own:something-else', name: ' Pack Tactics ', timing: 'free', roll: { kind: 'none' },
      cost: { kind: 'uses', max: 2, reset: 'long' }, tags: ['buff'], concentration: true, description: 'Line one\nLine two',
    };
    expect(normaliseCustom(data, 'own:1')).toEqual({
      key: 'own:1', name: 'Pack Tactics', timing: 'free', roll: { kind: 'none' },
      cost: { kind: 'uses', max: 2, reset: 'long' }, tags: ['buff'], concentration: true, description: 'Line one\nLine two',
    });
  });

  it('fills in everything but the name', () => {
    expect(normaliseCustom({ name: 'Howl' }, 'own:2')).toEqual({
      key: 'own:2', name: 'Howl', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' },
      tags: [], concentration: false, description: '',
    });
  });

  it('keeps a slot cost within levels 1 to 9, and falls back to no cost when the cost is malformed', () => {
    expect(normaliseCustom({ name: 'A', cost: { kind: 'slot', minLevel: 12 } }, 'k')?.cost).toEqual({ kind: 'slot', minLevel: 9 });
    expect(normaliseCustom({ name: 'A', cost: { kind: 'slot' } }, 'k')?.cost).toEqual({ kind: 'none' });
    expect(normaliseCustom({ name: 'A', cost: { kind: 'uses', max: 3 } }, 'k')?.cost).toEqual({ kind: 'none' });
    expect(normaliseCustom({ name: 'A', cost: 'free' }, 'k')?.cost).toEqual({ kind: 'none' });
  });

  it.each([null, 'x', {}, { name: '' }, { name: '   ' }, { name: 7 }])('returns null for %j, which has no name to show', (data) => {
    expect(normaliseCustom(data, 'k')).toBeNull();
  });
});

describe('normaliseOrder', () => {
  it('keeps a list of keys, without repeats, blanks or anything that is not text', () => {
    expect(normaliseOrder(['a', 'b', 'a', '', 3, null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it.each([null, undefined, 'a,b', { 0: 'a' }])('turns %j into an empty order', (data) => {
    expect(normaliseOrder(data)).toEqual([]);
  });
});
