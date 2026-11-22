import { convertCharacter } from '@cw/ddb-import';
import type { Ability, CharacterEdits, CustomAbility } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { loadRaw, type Slug } from '../../../test-utils/fixtures';
import {
  applyEdits, canEditUses, defaultViews, diffEdit, editForm, emptyEdits, isEmptyEdit, sortByOrder, viewsOf,
  withGroupOrder,
} from '../src/edits';
import { availability, applyUse, clampState, emptyPlayState, pools } from '../src/play';
import { buildSheet, type Sheet } from '../src/sheet';
import { combatGroups, exploreAbilities } from '../src/views';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));
const edits = (over: Partial<CharacterEdits> = {}): CharacterEdits => ({ ...emptyEdits(), ...over });
const named = (sheet: Sheet, name: string, cost?: Ability['cost']['kind']): Ability => {
  const found = [...sheet.abilities, ...sheet.universal, ...sheet.hidden].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}`);
  return found;
};
const names = (list: Ability[]): string[] => list.map((a) => a.name);

const custom = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:1', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: [], concentration: false, description: '', ...over,
});

describe('a sheet with no edits', () => {
  it('has nothing hidden, nothing edited and an empty layout', () => {
    const sheet = sheetOf('vlad');
    expect(sheet.hidden).toEqual([]);
    expect(sheet.edited).toEqual([]);
    expect(sheet.layout).toEqual({ order: { combat: [], explore: [] }, show: {} });
  });

  it('comes back from applyEdits with the same abilities, resources and universal actions', () => {
    const sheet = sheetOf('vlad');
    const same = applyEdits(sheet, emptyEdits());
    expect(same.abilities).toEqual(sheet.abilities);
    expect(same.universal).toEqual(sheet.universal);
    expect(same.resources).toEqual(sheet.resources);
    expect(same).not.toBe(sheet);
  });
});

describe('applyEdits: one ability', () => {
  it('never changes the sheet it was given', () => {
    const sheet = sheetOf('vlad');
    const before = JSON.stringify(sheet);
    const hex = named(sheet, 'Hex');
    applyEdits(sheet, edits({
      abilities: { [hex.key]: { timing: 'action', tags: ['control'], uses: { max: 2, reset: 'long' }, hidden: true } },
      custom: [custom({ cost: { kind: 'uses', max: 1, reset: 'short' } })],
      order: { combat: [hex.key], explore: [] },
    }));
    expect(JSON.stringify(sheet)).toBe(before);
  });

  it('replaces the timing, which moves the ability to another Combat group', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { timing: 'action' } } }));
    expect(named(edited, 'Hex').timing).toBe('action');
    expect(names(combatGroups(edited).action)).toContain('Hex');
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(edited.edited).toEqual([hex.key]);
  });

  it('replaces the tags and marks them as the player\'s', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { tags: ['buff'] } } }));
    expect(named(edited, 'Action Surge')).toMatchObject({ tags: ['buff'], tagSource: 'user' });
  });

  it('replaces the roll', () => {
    const sheet = sheetOf('vlad');
    const sword = named(sheet, 'Wurms Claw - Sword');
    const roll = { kind: 'attack' as const, bonus: 9, damage: [{ dice: '1d8+5', type: 'piercing' }], optionalDamage: [] };
    const edited = applyEdits(sheet, edits({ abilities: { [sword.key]: { roll } } }));
    expect(named(edited, 'Wurms Claw - Sword').roll).toEqual(roll);
  });

  it('ignores an edit for an ability that is not on the sheet', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({ abilities: { 'item:999:base': { hidden: true, timing: 'bonus' } } }));
    expect(edited.abilities).toEqual(sheet.abilities);
    expect(edited.edited).toEqual([]);
    expect(edited.hidden).toEqual([]);
  });

  it('applies to the universal actions by the same rule', () => {
    const sheet = sheetOf('vlad');
    const dash = named(sheet, 'Dash');
    const edited = applyEdits(sheet, edits({ abilities: { [dash.key]: { timing: 'bonus', tags: ['movement'] } } }));
    expect(named(edited, 'Dash')).toMatchObject({ timing: 'bonus', tags: ['movement'] });
    expect(names(edited.universal)).toContain('Dash');
  });
});

describe('applyEdits: limited uses', () => {
  it('gives an ability with no cost a pool of its own, which Use then spends', () => {
    const sheet = sheetOf('vlad');
    const dash = named(sheet, 'Dash');
    const edited = applyEdits(sheet, edits({ abilities: { [dash.key]: { uses: { max: 2, reset: 'short' } } } }));
    const row = named(edited, 'Dash');
    expect(row.cost).toEqual({ kind: 'uses', resourceKey: dash.key });
    expect(edited.resources).toContainEqual({ key: dash.key, name: 'Dash', max: 2, reset: 'short' });
    let state = applyUse(row, edited, emptyPlayState());
    expect(state.spent[dash.key]).toBe(1);
    state = applyUse(row, edited, { ...state, turn: emptyPlayState().turn });
    expect(availability(row, edited, { ...state, turn: emptyPlayState().turn })).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('changes the maximum and reset of the pool an ability already spends from', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { uses: { max: 5, reset: 'short' } } } }));
    expect(edited.resources.find((r) => r.key === wind.key)).toMatchObject({ name: 'Second Wind', max: 5, reset: 'short' });
    expect(edited.resources).toHaveLength(sheet.resources.length);
  });

  it('changes an item\'s pool when the edited ability spends the item\'s charges', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    if (ray.cost.kind !== 'uses') throw new Error('expected Scorching Ray to spend charges');
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { uses: { max: 3, reset: 'long' } } } }));
    expect(edited.resources.find((r) => r.key === (ray.cost as { resourceKey: string }).resourceKey)?.max).toBe(3);
    expect(named(edited, 'Scorching Ray').cost).toEqual(ray.cost);
  });

  it('removes the cost and the pool with "none"', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { uses: 'none' } } }));
    expect(named(edited, 'Action Surge').cost).toEqual({ kind: 'none' });
    expect(edited.resources.some((r) => r.key === surge.key)).toBe(false);
  });

  it('keeps a pool that something else still uses when one user gives it up', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    const key = (ray.cost as { resourceKey: string }).resourceKey;
    const staff = sheet.abilities.find((a) => a.poolKey === key);
    expect(staff).toBeDefined();
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { uses: 'none' } } }));
    expect(edited.resources.some((r) => r.key === key)).toBe(true);
  });

  it('leaves an ability that costs a spell slot alone', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    expect(canEditUses(hex)).toBe(false);
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { uses: { max: 4, reset: 'long' } } } }));
    expect(named(edited, 'Hex').cost).toEqual(hex.cost);
    expect(edited.resources).toEqual(sheet.resources);
  });

  it('clamps what was spent to an edited maximum', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { uses: { max: 1, reset: 'long' } } } }));
    const state = clampState({ ...emptyPlayState(), spent: { [wind.key]: 3 } }, edited);
    expect(state.spent[wind.key]).toBe(1);
  });
});

describe('applyEdits: hiding', () => {
  it('moves a hidden ability out of both views and into the hidden list', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { hidden: true } } }));
    expect(names(edited.abilities)).not.toContain('Hex');
    expect(names(edited.hidden)).toEqual(['Hex']);
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(names(exploreAbilities(edited))).not.toContain('Hex');
  });

  it('hides a universal action too', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({ abilities: { [named(sheet, 'Utilize').key]: { hidden: true } } }));
    expect(names(edited.universal)).not.toContain('Utilize');
    expect(names(edited.hidden)).toEqual(['Utilize']);
  });

  it('drops the resource chip of a pool whose every user is hidden', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { hidden: true } } }));
    expect(edited.resources.some((r) => r.key === surge.key)).toBe(false);
    expect(pools(edited).some((p) => p.key === surge.key)).toBe(false);
  });

  it('keeps the chip while another user of the pool is still shown, and for a pool nothing uses', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    const key = (ray.cost as { resourceKey: string }).resourceKey;
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { hidden: true } } }));
    expect(edited.resources.some((r) => r.key === key)).toBe(true);
    const unused = { key: 'item:1:base', name: 'Wand', max: 3, reset: 'long' as const };
    const withWand = applyEdits({ ...sheet, resources: [...sheet.resources, unused] }, emptyEdits());
    expect(withWand.resources).toContainEqual(unused);
  });
});

describe('applyEdits: custom abilities', () => {
  it('adds a custom ability as a row of source "custom"', () => {
    const sheet = sheetOf('franny');
    const edited = applyEdits(sheet, edits({ custom: [custom({ tags: ['buff'], concentration: true })] }));
    expect(named(edited, 'Pack Howl')).toMatchObject({
      key: 'own:1', source: 'custom', timing: 'bonus', tags: ['buff'], tagSource: 'user', concentration: true, cost: { kind: 'none' },
    });
    expect(names(combatGroups(edited).bonus)).toContain('Pack Howl');
  });

  it('gives a custom ability with uses a pool under its own key', () => {
    const edited = applyEdits(sheetOf('franny'), edits({ custom: [custom({ cost: { kind: 'uses', max: 2, reset: 'long' } })] }));
    expect(named(edited, 'Pack Howl').cost).toEqual({ kind: 'uses', resourceKey: 'own:1' });
    expect(edited.resources).toContainEqual({ key: 'own:1', name: 'Pack Howl', max: 2, reset: 'long' });
  });

  it('lets a custom ability cost a spell slot, which the turn engine then offers', () => {
    const sheet = sheetOf('minkis');
    const edited = applyEdits(sheet, edits({ custom: [custom({ timing: 'action', cost: { kind: 'slot', minLevel: 2 } })] }));
    const row = named(edited, 'Pack Howl');
    expect(row.cost).toEqual({ kind: 'slot', minLevel: 2, pact: false });
    expect(availability(row, edited, emptyPlayState()).slotOptions.map((o) => o.key)).toEqual(['slot:2']);
  });

  it('marks a slot cost as pact magic on a character with only pact slots', () => {
    const edited = applyEdits(sheetOf('vlad'), edits({ custom: [custom({ cost: { kind: 'slot', minLevel: 1 } })] }));
    expect(named(edited, 'Pack Howl').cost).toEqual({ kind: 'slot', minLevel: 1, pact: true });
  });

  it('escapes the plain-text description and keeps its line breaks', () => {
    const edited = applyEdits(sheetOf('franny'), edits({
      custom: [custom({ description: 'Deal 1d6 <fire> & "more".\nOnce per turn.' })],
    }));
    expect(named(edited, 'Pack Howl').description).toBe('Deal 1d6 &lt;fire&gt; &amp; &quot;more&quot;.<br>Once per turn.');
  });

  it('hides and re-homes a custom ability through an edit under its key, like any other', () => {
    const edited = applyEdits(sheetOf('franny'), edits({
      custom: [custom(), custom({ key: 'own:2', name: 'Second' })],
      abilities: { 'own:1': { hidden: true }, 'own:2': { inExplore: true } },
    }));
    expect(names(edited.hidden)).toEqual(['Pack Howl']);
    expect(names(exploreAbilities(edited))).toContain('Second');
  });
});

describe('which views list an ability', () => {
  it('follows the app\'s rule until the player chooses', () => {
    const sheet = sheetOf('vlad');
    expect(defaultViews(named(sheet, 'Hex'))).toEqual({ combat: true, explore: false });
    expect(defaultViews(named(sheet, 'Misty Step', 'slot'))).toEqual({ combat: true, explore: true });
    expect(defaultViews(named(sheet, 'Dash'))).toEqual({ combat: true, explore: false });
    expect(defaultViews({ ...named(sheet, 'Hex'), timing: 'long' })).toEqual({ combat: false, explore: true });
    expect(defaultViews({ ...named(sheet, 'Hex'), ritual: true })).toEqual({ combat: true, explore: true });
  });

  it('puts an ability in Explore when the player ticks it', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    expect(names(exploreAbilities(sheet))).not.toContain('Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { inExplore: true } } }));
    expect(names(exploreAbilities(edited))).toContain('Second Wind');
    expect(viewsOf(edited, named(edited, 'Second Wind'))).toEqual({ combat: true, explore: true });
  });

  it('takes an ability out of Combat when the player unticks it', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { inCombat: false, inExplore: true } } }));
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(names(exploreAbilities(edited))).toContain('Hex');
  });

  it('lists an ability forced into Combat under "Other" when its timing has no group', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { timing: 'long', inCombat: true } } }));
    expect(names(combatGroups(edited).other)).toContain('Hex');
  });

  it('can put a universal action in Explore and take one out of Combat', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({
      abilities: { [named(sheet, 'Search').key]: { inExplore: true }, [named(sheet, 'Ready').key]: { inCombat: false } },
    }));
    expect(names(exploreAbilities(edited))).toContain('Search');
    expect(names(combatGroups(edited).universal)).not.toContain('Ready');
    expect(names(combatGroups(edited).universal)).toContain('Search');
  });
});

describe('order', () => {
  it('sortByOrder puts the listed keys first, in list order, and keeps the rest where they were', () => {
    const list = ['a', 'b', 'c', 'd'].map((key) => ({ key }));
    expect(sortByOrder(list, ['c', 'a', 'gone']).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortByOrder(list, [])).toEqual(list);
  });

  it('withGroupOrder replaces a group\'s keys and leaves the other groups\' order alone', () => {
    expect(withGroupOrder(['x', 'a', 'y', 'b'], ['b', 'a', 'c'])).toEqual(['x', 'y', 'b', 'a', 'c']);
    expect(withGroupOrder([], ['b', 'a'])).toEqual(['b', 'a']);
  });

  it('orders each Combat group, and Explore separately', () => {
    const sheet = sheetOf('vlad');
    const actions = combatGroups(sheet).action;
    const reversed = [...actions].reverse().map((a) => a.key);
    const edited = applyEdits(sheet, edits({ order: { combat: reversed, explore: [] } }));
    expect(combatGroups(edited).action.map((a) => a.key)).toEqual(reversed);
    expect(exploreAbilities(edited).map((a) => a.key)).toEqual(exploreAbilities(sheet).map((a) => a.key));
  });

  it('puts an ability the order does not mention at the end of its group', () => {
    const sheet = sheetOf('vlad');
    const [first, second, ...rest] = combatGroups(sheet).action;
    const edited = applyEdits(sheet, edits({ order: { combat: [second.key, first.key], explore: [] } }));
    expect(combatGroups(edited).action.map((a) => a.key)).toEqual([second.key, first.key, ...rest.map((a) => a.key)]);
  });

  it('orders the universal group too', () => {
    const sheet = sheetOf('vlad');
    const dodge = named(sheet, 'Dodge');
    const edited = applyEdits(sheet, edits({ order: { combat: [dodge.key], explore: [] } }));
    expect(combatGroups(edited).universal[0].name).toBe('Dodge');
  });
});

describe('the editor\'s form', () => {
  it('describes an ability as it stands', () => {
    const sheet = sheetOf('danger');
    expect(editForm(sheet, named(sheet, 'Second Wind'))).toEqual({
      timing: 'bonus', uses: { max: 3, reset: 'long' }, tags: [], roll: { kind: 'dice', dice: '1d10+9' },
      inCombat: true, inExplore: false, hidden: false,
    });
    expect(editForm(sheet, named(sheet, 'Dash')).uses).toBeNull();
  });

  it('records nothing when the form is unchanged', () => {
    const sheet = sheetOf('danger');
    for (const ability of [...sheet.abilities, ...sheet.universal]) {
      expect(diffEdit(sheet, ability, editForm(sheet, ability))).toEqual({});
    }
    expect(isEmptyEdit({})).toBe(true);
    expect(isEmptyEdit({ hidden: true })).toBe(false);
  });

  it('records only the fields that differ from the imported ability', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const form = editForm(sheet, wind);
    expect(diffEdit(sheet, wind, { ...form, timing: 'action' })).toEqual({ timing: 'action' });
    expect(diffEdit(sheet, wind, { ...form, uses: { max: 4, reset: 'long' } })).toEqual({ uses: { max: 4, reset: 'long' } });
    expect(diffEdit(sheet, wind, { ...form, uses: null })).toEqual({ uses: 'none' });
    expect(diffEdit(sheet, wind, { ...form, hidden: true })).toEqual({ hidden: true });
    expect(diffEdit(sheet, wind, { ...form, roll: { kind: 'none' } })).toEqual({ roll: { kind: 'none' } });
  });

  it('does not record a view that the new tags or timing would put the ability in anyway', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const form = editForm(sheet, wind);
    expect(diffEdit(sheet, wind, { ...form, tags: ['utility'], inExplore: true })).toEqual({ tags: ['utility'] });
    expect(diffEdit(sheet, wind, { ...form, tags: ['utility'], inExplore: false })).toEqual({ tags: ['utility'], inExplore: false });
    expect(diffEdit(sheet, wind, { ...form, inExplore: true })).toEqual({ inExplore: true });
  });

  it('ignores the order of tags', () => {
    const sheet = sheetOf('vlad');
    const step = named(sheet, 'Misty Step', 'slot');
    const form = editForm(sheet, step);
    expect(diffEdit(sheet, step, { ...form, tags: [...form.tags].reverse() })).toEqual({});
  });

  it('never records uses for an ability that costs a spell slot', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    expect(diffEdit(sheet, hex, { ...editForm(sheet, hex), uses: { max: 2, reset: 'long' } })).toEqual({});
  });

  it('round-trips: applying the recorded edit gives a sheet whose form is the one that was saved', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const wanted = {
      timing: 'action' as const, uses: { max: 2, reset: 'short' as const }, tags: ['healing' as const],
      roll: { kind: 'dice' as const, dice: '1d10+12' }, inCombat: true, inExplore: true, hidden: false,
    };
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: diffEdit(sheet, wind, wanted) } }));
    expect(editForm(edited, named(edited, 'Second Wind'))).toEqual(wanted);
  });
});
