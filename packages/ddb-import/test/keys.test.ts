import { buildSheet } from '@cw/rules';
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { numberDuplicates, textHash } from '../src/keys';

const longsword = (id: number, equipped = true) => ({
  id,
  equipped,
  limitedUse: { maxUses: 2, resetType: 'LongRest' },
  definition: {
    id: 777, name: 'Twin Blade', filterType: 'Weapon', attackType: 1, categoryId: 2, type: 'Longsword',
    damage: { diceString: '1d8' }, damageType: 'Slashing', properties: [],
  },
});

describe('numberDuplicates', () => {
  it('leaves unique keys alone and numbers later copies from 2', () => {
    const rows = [{ key: 'a' }, { key: 'b' }, { key: 'a' }, { key: 'a' }];
    expect(numberDuplicates(rows).map((r) => r.key)).toEqual(['a', 'b', 'a#2', 'a#3']);
  });

  it('does not change the rows it was given', () => {
    const rows = [{ key: 'a' }, { key: 'a' }];
    numberDuplicates(rows);
    expect(rows.map((r) => r.key)).toEqual(['a', 'a']);
  });
});

describe('textHash', () => {
  it('is the same for the same text and differs for different text', () => {
    expect(textHash('Takes a bonus action')).toBe(textHash('Takes a bonus action'));
    expect(textHash('Takes a bonus action')).not.toBe(textHash('Takes an action'));
    expect(textHash('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('two equipped copies of one item', () => {
  const raw = { data: { inventory: [longsword(1), longsword(2)] } };

  it('gives the second copy its own key', () => {
    const c = convertCharacter(raw);
    expect(c.weapons.map((w) => w.key)).toEqual(['item:777:base', 'item:777:base#2']);
    expect(c.chargedItems.map((i) => i.key)).toEqual(['item:777:base', 'item:777:base#2']);
  });

  it('shows both weapons, each with its own pool', () => {
    const sheet = buildSheet(convertCharacter(raw));
    const blades = sheet.abilities.filter((a) => a.name === 'Twin Blade');
    expect(blades.map((a) => a.poolKey)).toEqual(['item:777:base', 'item:777:base#2']);
    expect(sheet.resources.filter((r) => r.name === 'Twin Blade')).toHaveLength(2);
  });

  it('numbers only the copies that are equipped', () => {
    const c = convertCharacter({ data: { inventory: [longsword(1, false), longsword(2)] } });
    expect(c.weapons.map((w) => w.key)).toEqual(['item:777:base']);
    expect(c.chargedItems.map((i) => i.key)).toEqual(['item:777:base']);
  });
});

describe('actions that share a key', () => {
  it('keeps both and numbers the second', () => {
    const actions = convertCharacter({
      data: {
        actions: {
          class: [
            { id: 5, componentId: 9, entityTypeId: 100, name: 'Channel', activation: { activationType: 1 } },
            { id: 5, componentId: 9, entityTypeId: 200, name: 'Channel, improved', activation: { activationType: 3 } },
          ],
        },
      },
    }).actions;
    expect(actions.map((a) => a.key)).toEqual(['action:5:9', 'action:5:9#2']);
    expect(actions.map((a) => a.name)).toEqual(['Channel', 'Channel, improved']);
  });
});

describe('an action with no id and no name', () => {
  const anonymous = (description: string, activationType: number) => ({ description, activation: { activationType } });

  it('keeps its key when the entries are reordered', () => {
    const a = anonymous('Once per turn you may reroll.', 8);
    const b = anonymous('You gain a swim speed.', 2);
    const keysOf = (list: unknown[]) =>
      new Map(convertCharacter({ data: { actions: { class: list } } }).actions.map((x) => [x.description, x.key]));
    const first = keysOf([a, b]);
    const second = keysOf([b, a]);
    expect(first.get(a.description)).toBe(second.get(a.description));
    expect(first.get(b.description)).toBe(second.get(b.description));
    expect(first.get(a.description)).not.toBe(first.get(b.description));
  });

  it('has a key that says it is anonymous and never contains "undefined"', () => {
    const [action] = convertCharacter({ data: { actions: { class: [anonymous('Text', 1)] } } }).actions;
    expect(action.key).toMatch(/^action:anon-[0-9a-f]{8}:base$/);
  });

  it('numbers two that are identical', () => {
    const list = [anonymous('Same', 1), anonymous('Same', 1)];
    const keys = convertCharacter({ data: { actions: { class: list } } }).actions.map((x) => x.key);
    expect(keys[1]).toBe(`${keys[0]}#2`);
  });
});
