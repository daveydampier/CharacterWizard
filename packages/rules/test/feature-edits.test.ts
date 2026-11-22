import { convertCharacter } from '@cw/ddb-import';
import type { Ability, AbilityEdit, CharacterEdits, Feature } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';
import {
  applyEdits, defaultViews, diffEdit, editForm, emptyEdits, hiddenByDefault, viewsOf, withHidden,
} from '../src/edits';
import { featureAbility, featureGroups, isFeatureKey } from '../src/features';
import { applyUse, availability, emptyPlayState, pools } from '../src/play';
import { buildSheet, type Sheet } from '../src/sheet';
import { combatGroups, exploreAbilities } from '../src/views';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));
const feature = (sheet: Sheet, name: string): Feature => {
  const found = sheet.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found;
};
/** The sheet with these edits, each given by the feature's or ability's name. */
function edited(sheet: Sheet, byName: Record<string, AbilityEdit>, order: string[] = []): Sheet {
  const abilities: CharacterEdits['abilities'] = {};
  for (const [name, edit] of Object.entries(byName)) {
    const key = sheet.featureSource.list.find((f) => f.name === name)?.key ?? sheet.abilities.find((a) => a.name === name)?.key;
    if (key === undefined) throw new Error(`nothing called ${name}`);
    abilities[key] = edit;
  }
  return applyEdits(sheet, { ...emptyEdits(), abilities, order: { combat: [], explore: [], features: order } });
}
const names = (list: { name: string }[]): string[] => list.map((x) => x.name);
/** The rows of one group of the Features page; an option is written "parent > option". */
const group = (sheet: Sheet, heading: string): string[] =>
  (sheet.features.find((g) => g.heading === heading)?.items ?? []).flatMap((item) => [
    item.feature.name, ...item.options.map((o) => `${item.feature.name} > ${o.name}`),
  ]);

describe('a sheet with no edits', () => {
  it.each(SLUGS)('shows the Features page as before and puts no feature in play: %s', (slug) => {
    const character = convertCharacter(loadRaw(slug));
    const sheet = buildSheet(character);
    expect(sheet.features).toEqual(featureGroups(character));
    expect(sheet.featureSource.list).toEqual(character.features);
    expect(sheet.hiddenFeatures).toEqual(character.features.filter((f) => f.hiddenOnSheet));
    expect(Object.keys(sheet.featureRows)).toEqual(character.features.filter((f) => f.playKeys.length === 0).map((f) => f.key));
    expect(sheet.abilities.some((a) => isFeatureKey(a.key))).toBe(false);
    expect(sheet.unshownResources).toEqual([]);
    expect(sheet.layout.order.features).toEqual([]);
    const same = applyEdits(sheet, emptyEdits());
    expect(same.features).toEqual(sheet.features);
    expect(same.hiddenFeatures).toEqual(sheet.hiddenFeatures);
    expect(same.abilities).toEqual(sheet.abilities);
    expect(same.resources).toEqual(sheet.resources);
  });

  it('never lists a feature in a view unasked, whatever its timing and tags', () => {
    expect(defaultViews({ key: 'feature:1:2', timing: 'action', ritual: true, tags: ['utility'] })).toEqual({ combat: false, explore: false });
    expect(defaultViews({ key: 'action:1:2', timing: 'action', ritual: false, tags: ['utility'] })).toEqual({ combat: true, explore: true });
    expect(defaultViews({ timing: 'action', ritual: false, tags: [] })).toEqual({ combat: true, explore: false });
  });
});

describe('a feature as a row', () => {
  it('is a passive reminder with the feature\'s key, name and description, and nothing to roll or spend', () => {
    const sheet = sheetOf('vlad');
    const alert = feature(sheet, 'Alert');
    expect(featureAbility(alert)).toEqual({
      key: alert.key, name: 'Alert', source: 'feat', timing: 'passive', roll: { kind: 'none' }, cost: { kind: 'none' },
      poolKey: null, tags: [], concentration: false, ritual: false, range: null, area: false,
      description: alert.description, notes: [], tagSource: 'none',
    });
    expect(availability(featureAbility(alert), sheet, emptyPlayState()).hasUse).toBe(false);
  });

  it('takes its source from where the feature comes from, and a subclass feature counts as the class\'s', () => {
    const sheet = sheetOf('vlad');
    const source = (name: string): Ability['source'] => featureAbility(feature(sheet, name)).source;
    expect([source('Pact Magic'), source('The Cost'), source('Alert'), source('Size')]).toEqual(['class', 'class', 'feat', 'species']);
    expect(featureAbility({ ...feature(sheet, 'Size'), origin: 'background' }).source).toBe('background');
  });

  it('tells a feature key from an ability key', () => {
    const sheet = sheetOf('vlad');
    expect(sheet.featureSource.list.every((f) => isFeatureKey(f.key))).toBe(true);
    expect([...sheet.abilities, ...sheet.universal].some((a) => isFeatureKey(a.key))).toBe(false);
    expect(isFeatureKey('own:1')).toBe(false);
  });
});

describe('ticking a feature into a view', () => {
  it('lists it under "Always on" in Combat, not in Explore, and does not call it edited', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true } });
    const alert = feature(base, 'Alert');
    expect(names(combatGroups(sheet).passive)).toEqual([...names(combatGroups(base).passive), 'Alert']);
    expect(names(exploreAbilities(sheet))).toEqual(names(exploreAbilities(base)));
    expect(sheet.abilities[sheet.abilities.length - 1]).toEqual(featureAbility(alert));
    expect(sheet.edited).toEqual([]);
    expect(viewsOf(sheet, featureAbility(alert))).toEqual({ combat: true, explore: false });
    // The Features page is unchanged: the feature is still listed there.
    expect(sheet.features).toEqual(base.features);
  });

  it('lists it in Explore alone when only that box is ticked', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inExplore: true } });
    expect(names(exploreAbilities(sheet))).toEqual([...names(exploreAbilities(base)), 'Alert']);
    expect(names(combatGroups(sheet).passive)).toEqual(names(combatGroups(base).passive));
  });

  it('applies timing, tags and roll to the row, and then calls it edited', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, {
      Alert: { inCombat: true, timing: 'reaction', tags: ['defence'], roll: { kind: 'dice', dice: '1d4' } },
    });
    const row = combatGroups(sheet).reaction.find((a) => a.name === 'Alert');
    expect(row).toMatchObject({ timing: 'reaction', tags: ['defence'], tagSource: 'user', roll: { kind: 'dice', dice: '1d4' } });
    expect(sheet.edited).toEqual([feature(base, 'Alert').key]);
  });

  it('does not tick a box because of a timing or a tag', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { timing: 'long', tags: ['utility'] } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(names(exploreAbilities(sheet))).toEqual(names(exploreAbilities(base)));
    expect(sheet.featureRows[feature(base, 'Alert').key]).toMatchObject({ timing: 'long', tags: ['utility'] });
  });

  it('gives a ticked feature a pool of its own when it has limited uses, and Use spends from it', () => {
    const base = sheetOf('vlad');
    const key = feature(base, 'Alert').key;
    const sheet = edited(base, { Alert: { inCombat: true, uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources.find((r) => r.key === key)).toEqual({ key, name: 'Alert', max: 2, reset: 'long' });
    const row = sheet.abilities.find((a) => a.key === key);
    if (!row) throw new Error('no row');
    expect(row.cost).toEqual({ kind: 'uses', resourceKey: key });
    const after = applyUse(row, sheet, emptyPlayState());
    expect(after.spent).toEqual({ [key]: 1 });
    expect(pools(sheet).some((p) => p.key === key)).toBe(true);
  });

  it('shows no chip for the pool of a feature that is in neither view, and still gives the editor its uses', () => {
    const base = sheetOf('vlad');
    const key = feature(base, 'Alert').key;
    const sheet = edited(base, { Alert: { uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources).toEqual(base.resources);
    expect(sheet.unshownResources).toEqual([{ key, name: 'Alert', max: 2, reset: 'long' }]);
    expect(editForm(sheet, sheet.featureRows[key])).toMatchObject({ uses: { max: 2, reset: 'long' }, inCombat: false, inExplore: false });
  });

  it('adds no row for a feature that already has an ability, whatever its edit says', () => {
    const base = sheetOf('vlad');
    const lucky = feature(base, 'Lucky');
    expect(lucky.playKeys.length).toBeGreaterThan(0);
    const sheet = edited(base, { Lucky: { inCombat: true, inExplore: true, timing: 'action' } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(sheet.featureRows[lucky.key]).toBeUndefined();
    expect(sheet.edited).toEqual([]);
  });
});

describe('hiding a feature', () => {
  it('takes it off the Features page and lists it as hidden, and leaves its abilities alone', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Lucky: { hidden: true } });
    expect(group(sheet, 'Feats')).not.toContain('Lucky');
    expect(names(sheet.hiddenFeatures)).toEqual(['Eldritch Invocation Options', 'Lucky', 'Languages']);
    expect(sheet.abilities).toEqual(base.abilities);
    expect(sheet.hidden).toEqual([]);
  });

  it('starts with what D&D Beyond hides, and shows one again when the player restores it', () => {
    const base = sheetOf('vlad');
    expect(names(base.hiddenFeatures)).toEqual(['Eldritch Invocation Options', 'Languages']);
    const sheet = edited(base, { Languages: { hidden: false } });
    expect(names(sheet.hiddenFeatures)).toEqual(['Eldritch Invocation Options']);
    expect(group(sheet, 'Human')).toContain('Languages');
  });

  it('takes a ticked feature out of both views, and lists it with the hidden abilities too', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true, hidden: true } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(names(sheet.hidden)).toEqual(['Alert']);
    expect(names(sheet.hiddenFeatures)).toContain('Alert');
  });

  it('does not list a hidden feature with the hidden abilities when no view would show it', () => {
    const sheet = edited(sheetOf('vlad'), { Alert: { hidden: true } });
    expect(sheet.hidden).toEqual([]);
  });

  it('lists an option at the end of its group when its parent is hidden', () => {
    const base = sheetOf('vlad');
    expect(group(base, 'Warlock 3').slice(0, 5)).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade',
      'Eldritch Invocations > Armor of Shadows', 'Eldritch Invocations > Fiendish Vigor',
    ]);
    const sheet = edited(base, { 'Eldritch Invocations': { hidden: true } });
    expect(group(sheet, 'Warlock 3').slice(-3)).toEqual(['Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor']);
  });

  it('hides one option and leaves its parent and the other options', () => {
    const sheet = edited(sheetOf('vlad'), { 'Armor of Shadows': { hidden: true } });
    expect(group(sheet, 'Warlock 3').slice(1, 4)).toEqual([
      'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade', 'Eldritch Invocations > Fiendish Vigor',
    ]);
  });

  it('drops the pool of a hidden feature from the chips', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true, hidden: true, uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources).toEqual(base.resources);
    expect(names(sheet.unshownResources)).toEqual(['Alert']);
  });
});

describe('the order of the Features page', () => {
  it('puts the features the player arranged first within their group, and moves an option with its parent', () => {
    const base = sheetOf('vlad');
    const key = (name: string): string => feature(base, name).key;
    const sheet = edited(base, {}, [key('Pact Magic'), key('Eldritch Invocations'), key('Lucky')]);
    expect(group(sheet, 'Warlock 3').slice(0, 6)).toEqual([
      'Pact Magic', 'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade',
      'Eldritch Invocations > Armor of Shadows', 'Eldritch Invocations > Fiendish Vigor', 'Core Warlock Traits',
    ]);
    expect(group(sheet, 'Feats')[0]).toBe('Lucky');
    expect(sheet.layout.order.features).toEqual([key('Pact Magic'), key('Eldritch Invocations'), key('Lucky')]);
    expect(sheet.features.map((g) => g.heading)).toEqual(base.features.map((g) => g.heading));
  });

  it('ignores a key that is not on the page', () => {
    const base = sheetOf('vlad');
    expect(edited(base, {}, ['feature:0:0', 'spell:1:2:slot']).features).toEqual(base.features);
  });
});

describe('the editor\'s view of a feature', () => {
  it('starts with both boxes unticked, passive, and shown', () => {
    const sheet = sheetOf('vlad');
    const row = sheet.featureRows[feature(sheet, 'Alert').key];
    expect(editForm(sheet, row)).toEqual({
      timing: 'passive', uses: null, tags: [], roll: { kind: 'none' }, inCombat: false, inExplore: false, hidden: false,
    });
  });

  it('records a tick, and records nothing for a box left unticked whatever the timing and tags', () => {
    const base = sheetOf('vlad');
    const row = base.featureRows[feature(base, 'Alert').key];
    const form = editForm(base, row);
    expect(diffEdit(base, row, { ...form, inCombat: true })).toEqual({ inCombat: true });
    expect(diffEdit(base, row, { ...form, timing: 'long', tags: ['utility'] })).toEqual({ timing: 'long', tags: ['utility'] });
    expect(diffEdit(base, row, form)).toEqual({});
  });

  it('says a feature D&D Beyond hides is hidden, and records the choice to show it', () => {
    const base = sheetOf('vlad');
    const languages = feature(base, 'Languages');
    const row = base.featureRows[languages.key];
    const form = editForm(base, row);
    expect(form.hidden).toBe(true);
    expect(diffEdit(base, row, { ...form, hidden: false })).toEqual({ hidden: false });
    expect(diffEdit(base, row, form)).toEqual({});
    const shown = edited(base, { Languages: { hidden: false } });
    expect(editForm(shown, shown.featureRows[languages.key]).hidden).toBe(false);
  });
});

describe('hiding and restoring', () => {
  it('records the choice only where it differs from what the row does unasked', () => {
    expect(withHidden(undefined, true, false)).toEqual({ hidden: true });
    expect(withHidden({ hidden: true, timing: 'action' }, false, false)).toEqual({ timing: 'action' });
    expect(withHidden(undefined, false, true)).toEqual({ hidden: false });
    expect(withHidden({ hidden: false }, true, true)).toEqual({});
    expect(withHidden({ inCombat: true }, true, true)).toEqual({ inCombat: true });
  });

  it('knows which rows start hidden: only a feature that D&D Beyond hides', () => {
    const sheet = sheetOf('vlad');
    expect(hiddenByDefault(sheet, feature(sheet, 'Languages').key)).toBe(true);
    expect(hiddenByDefault(sheet, feature(sheet, 'Alert').key)).toBe(false);
    expect(hiddenByDefault(sheet, sheet.abilities[0].key)).toBe(false);
    expect(hiddenByDefault(sheet, 'own:1')).toBe(false);
  });
});
