import { describe, expect, it } from 'vitest';
import { linkedActions } from '../src/actions';
import { convertCharacter } from '../src/index';
import { componentRef } from '../src/raw';
import { linkedSpells } from '../src/spells';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('componentRef', () => {
  it('joins an entity type ID and an ID', () => {
    expect(componentRef(12168134, 10292366)).toBe('12168134:10292366');
    expect(componentRef('12168134', 'abc')).toBe('12168134:abc');
  });

  it('is null when either part is missing or is not an ID', () => {
    for (const [type, id] of [[null, 1], [1, null], [undefined, undefined], ['', 1], [1, ''], [{}, 1], [1, []], [Number.NaN, 1]]) {
      expect(componentRef(type, id)).toBeNull();
    }
  });
});

describe('linkedActions', () => {
  it('says which component grants each action', () => {
    const rows = linkedActions(loadRaw('franny').data);
    expect(rows.find((r) => r.entry.name === 'Rage (Enter)')?.component).toBe('12168134:10292174');
  });

  it('gives a custom action no component', () => {
    const custom = linkedActions(loadRaw('franny').data).filter((r) => r.entry.source === 'custom');
    expect(custom).toHaveLength(1);
    expect(custom[0].component).toBeNull();
  });

  it('gives an action no component when the sheet names none', () => {
    const rows = linkedActions({ actions: { class: [{ id: 1, name: 'A' }, { id: 2, name: 'B', componentId: 7 }, { id: 3, name: 'C', componentTypeId: 5, componentId: 7 }] } });
    expect(rows.map((r) => r.component)).toEqual([null, null, '5:7']);
  });

  it('keeps each component with its own action when two actions share a key', () => {
    const rows = linkedActions({
      actions: { class: [{ id: 1, name: 'A', componentTypeId: 5, componentId: 7 }, { id: 1, name: 'A', componentTypeId: 6, componentId: 7 }] },
    });
    expect(rows.map((r) => [r.entry.key, r.component])).toEqual([['action:1:7', '5:7'], ['action:1:7#2', '6:7']]);
  });

  it.each(SLUGS)('returns the same actions, in the same order, as the character has: %s', (slug) => {
    const raw = loadRaw(slug);
    expect(linkedActions(raw.data).map((r) => r.entry)).toEqual(convertCharacter(raw).actions);
  });

  it('never throws on a malformed sheet', () => {
    for (const d of [{}, { actions: null }, { actions: [1, 2] }, { actions: { class: 'x' }, customActions: 3 }, { actions: { class: [null, 4, 'x'] } }]) {
      expect(() => linkedActions(d)).not.toThrow();
    }
  });
});

describe('linkedSpells', () => {
  it('says which component grants a spell', () => {
    const rows = linkedSpells(loadRaw('maya').data, 3);
    const granted = rows.filter((r) => r.component === '1088085227:1789163').map((r) => r.entry.name);
    expect(granted).toEqual(['Mending', 'Word of Radiance', 'Shield of Faith']);
  });

  it('gives a spell from an item no component', () => {
    const rows = linkedSpells(loadRaw('maya').data, 3);
    const fromItem = rows.filter((r) => r.entry.itemKey !== null);
    expect(fromItem.map((r) => r.entry.name)).toEqual(['Scorching Ray']);
    expect(fromItem[0].component).toBeNull();
  });

  it.each(SLUGS)('returns the same spells, in the same order, as the character has: %s', (slug) => {
    const raw = loadRaw(slug);
    const character = convertCharacter(raw);
    expect(linkedSpells(raw.data, character.level).map((r) => r.entry)).toEqual(character.spells);
  });

  it('never throws on a malformed sheet', () => {
    for (const d of [{}, { spells: null, classSpells: 4 }, { spells: { feat: 'x', item: [null] } }, { classSpells: [{ spells: [3, null] }] }]) {
      expect(() => linkedSpells(d, 1)).not.toThrow();
    }
  });
});
