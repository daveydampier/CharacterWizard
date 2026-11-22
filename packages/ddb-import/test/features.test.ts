import type { Feature } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { convertFeatures, playLinks } from '../src/features';
import { convertCharacter } from '../src/index';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';

const featuresOf = (slug: Slug): Feature[] => convertCharacter(loadRaw(slug)).features;
const names = (features: Feature[]): string[] => features.map((f) => f.name);
const noLinks = new Map<string, string[]>();

/** A sheet with one level 3 class that has a subclass, for the cases no fixture has. */
function sheet(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    classes: [{
      level: 3,
      definition: { id: 10, name: 'Tinker' },
      subclassDefinition: { id: 20, name: 'Clockmaker' },
      classFeatures: [
        { definition: { id: 3, entityTypeId: 1, name: 'Third', requiredLevel: 3, displayOrder: 1, classId: 10 } },
        { definition: { id: 1, entityTypeId: 1, name: 'First', requiredLevel: 1, displayOrder: 2, classId: 10 } },
        { definition: { id: 2, entityTypeId: 1, name: 'Also first', requiredLevel: 1, displayOrder: 1, classId: 10 } },
        { definition: { id: 4, entityTypeId: 1, name: 'Gears', requiredLevel: 3, displayOrder: 1, classId: 20 } },
        { definition: { id: 5, entityTypeId: 1, name: 'Too high', requiredLevel: 4, displayOrder: 1, classId: 10 } },
      ],
    }],
    ...extra,
  };
}

describe('features from the fixtures', () => {
  it('lists a class\'s features by level, with subclass features among them', () => {
    const warlock = featuresOf('vlad').filter((f) => f.classIndex === 0 && f.parentKey === null);
    expect(warlock.map((f) => [f.level, f.origin, f.name])).toEqual([
      [1, 'class', 'Core Warlock Traits'],
      [1, 'class', 'Eldritch Invocations'],
      [1, 'class', 'Pact Magic'],
      [1, 'class', 'Eldritch Invocation Options'],
      [2, 'class', 'Magical Cunning'],
      [3, 'class', 'Warlock Subclass'],
      [3, 'subclass', 'Tatzelwurm Spells'],
      [3, 'subclass', 'Shadowy Form'],
      [3, 'subclass', 'The Cost'],
    ]);
    expect(new Set(warlock.filter((f) => f.origin === 'class').map((f) => f.originName))).toEqual(new Set(['Warlock']));
    expect(new Set(warlock.filter((f) => f.origin === 'subclass').map((f) => f.originName)))
      .toEqual(new Set(['Thressia, Spirit of the Tatzelwurm']));
  });

  it('puts a higher-level subclass feature at its level, not with the level 3 ones', () => {
    const fighter = featuresOf('danger').filter((f) => f.classIndex === 0 && f.parentKey === null);
    const at = (name: string) => fighter.findIndex((f) => f.name === name);
    expect(fighter.find((f) => f.name === 'War Magic')).toMatchObject({ origin: 'subclass', originName: 'Eldritch Knight', level: 7 });
    expect(at('6: Ability Score Improvement')).toBeLessThan(at('War Magic'));
    expect(at('War Magic')).toBeLessThan(at('8: Ability Score Improvement'));
    expect(fighter.map((f) => f.level)).toEqual([...fighter.map((f) => f.level)].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('lists feats and species traits in the sheet\'s order', () => {
    const danger = featuresOf('danger');
    expect(names(danger.filter((f) => f.origin === 'feat' && f.parentKey === null))).toEqual([
      'Blind Fighting', 'Weapon Mastery', '4: Weapon Mastery', 'Mage Slayer', 'Polearm Master', 'Shield Master', 'War Caster',
    ]);
    const traits = danger.filter((f) => f.origin === 'species' && f.parentKey === null);
    expect(names(traits)).toEqual([
      'Darkvision', 'Otherworldly Presence', 'Creature Type', 'Size', 'Speed', 'Fiendish Legacy', 'Fiendish Legacy Spells',
      'Ability Score Increases', 'Languages',
    ]);
    expect(new Set(traits.map((f) => f.originName))).toEqual(new Set(['Tiefling']));
    expect(traits.every((f) => f.level === null && f.classIndex === null)).toBe(true);
  });

  it('gives an option its parent\'s key and place', () => {
    const vlad = featuresOf('vlad');
    const invocations = vlad.find((f) => f.name === 'Eldritch Invocations');
    const options = vlad.filter((f) => f.parentKey === invocations?.key);
    expect(names(options)).toEqual(['Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor']);
    for (const option of options) {
      expect(option).toMatchObject({ origin: 'class', originName: 'Warlock', classIndex: 0, level: null });
    }
    const danger = featuresOf('danger');
    const mastery = danger.find((f) => f.origin === 'feat' && f.name === '4: Weapon Mastery');
    expect(danger.filter((f) => f.parentKey === mastery?.key).map((f) => [f.origin, f.name])).toEqual([['feat', 'Hand Crossbow (Vex)']]);
    const legacy = danger.find((f) => f.name === 'Fiendish Legacy');
    expect(danger.filter((f) => f.parentKey === legacy?.key).map((f) => [f.origin, f.originName, f.name]))
      .toEqual([['species', 'Tiefling', 'Infernal Legacy']]);
  });

  it('links a feature to the actions and spells the sheet attaches to it', () => {
    const play = (slug: Slug, name: string, origin: Feature['origin']): string[] => {
      const character = convertCharacter(loadRaw(slug));
      const rows = new Map([...character.actions, ...character.spells].map((r) => [r.key, r.name]));
      const found = character.features.filter((f) => f.name === name && f.origin === origin && f.playKeys.length > 0);
      expect(found).toHaveLength(1);
      return found[0].playKeys.map((key) => rows.get(key) ?? `missing ${key}`);
    };
    expect(play('franny', 'Rage', 'class')).toEqual(['Rage (Enter)']);
    expect(play('vlad', 'Lucky', 'feat')).toEqual(['Luck Points']);
    expect(play('danger', 'Polearm Master', 'feat')).toEqual(['Pole Strike', 'Reactive Strike']);
    expect(play('maya', 'Magic Initiate (Cleric)', 'feat')).toEqual(['Mending', 'Word of Radiance', 'Shield of Faith']);
    expect(play('vlad', 'Pact of the Blade', 'class')).toEqual(['Pact of the Blade: Conjure', 'Pact of the Blade: Bond']);
    expect(play('vlad', 'Shadowy Form', 'subclass')).toEqual(['Misty Step']);
  });

  it('leaves a feature with no action or spell unlinked', () => {
    const franny = featuresOf('franny');
    for (const name of ['Danger Sense', 'Reckless Attack', 'Unarmored Defense', 'Savage Attacker', 'Tough']) {
      expect(franny.find((f) => f.name === name)?.playKeys).toEqual([]);
    }
  });

  it('marks what D&D Beyond hides on its own sheet, and keeps it', () => {
    const hidden = (slug: Slug) => featuresOf(slug).filter((f) => f.hiddenOnSheet).map((f) => `${f.name}${f.playKeys.length > 0 ? ' (in play)' : ''}`);
    expect(hidden('franny')).toEqual(['Rage', 'Languages']);
    expect(hidden('anastasia')).toEqual(['Innate Sorcery', 'Languages']);
    expect(hidden('vlad')).toEqual(['Eldritch Invocation Options', 'Languages']);
    // The sheet lists Rage twice. The copy it shows is the one with the action.
    const rages = featuresOf('franny').filter((f) => f.name === 'Rage');
    expect(rages.map((f) => [f.hiddenOnSheet, f.playKeys.length])).toEqual([[true, 0], [false, 1]]);
  });

  it('finds no background feature where the background grants its feature as a feat', () => {
    for (const slug of SLUGS) expect(featuresOf(slug).filter((f) => f.origin === 'background')).toEqual([]);
  });

  it.each(SLUGS)('gives every feature its own key, a known parent and real play rows: %s', (slug) => {
    const character = convertCharacter(loadRaw(slug));
    const { features } = character;
    expect(features.length).toBeGreaterThan(15);
    expect(new Set(features.map((f) => f.key)).size).toBe(features.length);
    const rows = new Set([...character.actions, ...character.spells].map((r) => r.key));
    const parents = new Set(features.filter((f) => f.parentKey === null).map((f) => f.key));
    const classLevel = character.classes[0].level;
    for (const f of features) {
      expect(f.key).toMatch(/^feature:\d+:\d+$/);
      expect(f.name).not.toBe('');
      for (const key of f.playKeys) expect(rows.has(key)).toBe(true);
      if (f.parentKey !== null) expect(parents.has(f.parentKey)).toBe(true);
      if (f.level !== null) expect(f.level).toBeLessThanOrEqual(classLevel);
    }
  });

  it('counts the features of each fixture', () => {
    expect(Object.fromEntries(SLUGS.map((slug) => [slug, featuresOf(slug).length]))).toEqual({
      anastasia: 28, danger: 42, franny: 28, maya: 23, milton: 21, minkis: 24, sid: 27, vlad: 25,
    });
  });
});

describe('features from a sheet no fixture has', () => {
  it('orders a class\'s features by level, then display order, then position, and stops at the class level', () => {
    const features = convertFeatures(sheet(), noLinks);
    expect(features.map((f) => [f.level, f.origin, f.originName, f.name])).toEqual([
      [1, 'class', 'Tinker', 'Also first'],
      [1, 'class', 'Tinker', 'First'],
      [3, 'class', 'Tinker', 'Third'],
      [3, 'subclass', 'Clockmaker', 'Gears'],
    ]);
    expect(features.every((f) => f.classIndex === 0)).toBe(true);
    expect(features[0].key).toBe('feature:1:2');
  });

  it('treats every feature as the class\'s own when there is no subclass', () => {
    const d = sheet();
    delete (d.classes as any[])[0].subclassDefinition;
    expect(new Set(convertFeatures(d, noLinks).map((f) => f.origin))).toEqual(new Set(['class']));
  });

  it('numbers a second class as the second group', () => {
    const d = sheet();
    (d.classes as any[]).push({
      level: 1, definition: { id: 30, name: 'Scout' },
      classFeatures: [{ definition: { id: 9, entityTypeId: 1, name: 'Keen eye', requiredLevel: 1, classId: 30 } }],
    });
    expect(convertFeatures(d, noLinks).find((f) => f.name === 'Keen eye')).toMatchObject({ classIndex: 1, originName: 'Scout', origin: 'class' });
  });

  it('lists a background\'s own feature, and not one that is a feat', () => {
    const background = (definition: Record<string, unknown>) =>
      convertFeatures({ background: { definition: { id: 7, entityTypeId: 3, name: 'Sailor', featureName: 'Ship\'s Passage', featureDescription: '<p>Made-up text.</p>', ...definition } } }, noLinks);
    expect(background({})).toEqual([{
      key: 'feature:3:7', name: 'Ship\'s Passage', origin: 'background', originName: 'Sailor', classIndex: null, level: null,
      parentKey: null, description: '<p>Made-up text.</p>', playKeys: [], hiddenOnSheet: false,
    }]);
    expect(background({ grantedFeats: [{ name: 'Tough' }] })).toEqual([]);
    expect(background({ featureIsFeat: true })).toEqual([]);
    expect(background({ featureName: '' })).toEqual([]);
    expect(background({ featureName: null })).toEqual([]);
  });

  describe('a custom background', () => {
    const custom = (featuresBackground: unknown, name: unknown = 'My Wanderer', extra: Record<string, unknown> = {}) => ({
      background: { hasCustomBackground: true, definition: null, customBackground: { id: 11, entityTypeId: 8, name, featuresBackground }, ...extra },
    });
    const standard = (over: Record<string, unknown> = {}) => ({
      id: 7, entityTypeId: 3, name: 'Sailor', featureName: 'Ship\'s Passage', featureDescription: '<p>Made-up text.</p>', ...over,
    });

    it('lists the feature of the background it is taken from, under the custom name', () => {
      expect(convertFeatures(custom(standard()), noLinks)).toEqual([{
        key: 'feature:3:7', name: 'Ship\'s Passage', origin: 'background', originName: 'My Wanderer', classIndex: null, level: null,
        parentKey: null, description: '<p>Made-up text.</p>', playKeys: [], hiddenOnSheet: false,
      }]);
    });

    it('uses the features background\'s name when the custom background has none', () => {
      for (const name of [null, '']) {
        expect(convertFeatures(custom(standard(), name), noLinks).map((f) => f.originName)).toEqual(['Sailor']);
      }
    });

    it('keys the feature by what it is when the features background has no IDs', () => {
      const [feature] = convertFeatures(custom(standard({ id: null, entityTypeId: null })), noLinks);
      expect(feature.key).toMatch(/^feature:anon-[0-9a-f]{8}$/);
    });

    it('leaves out a feature that is a feat or comes with feats', () => {
      expect(convertFeatures(custom(standard({ grantedFeats: [{ name: 'Tough' }] })), noLinks)).toEqual([]);
      expect(convertFeatures(custom(standard({ featureIsFeat: true })), noLinks)).toEqual([]);
    });

    it('finds nothing where the custom background has no features background', () => {
      expect(convertFeatures(custom(null), noLinks)).toEqual([]);
      expect(convertFeatures(custom(undefined), noLinks)).toEqual([]);
      expect(convertFeatures({ background: { definition: null, customBackground: { id: null, entityTypeId: null, name: null, featuresBackground: null } } }, noLinks)).toEqual([]);
      expect(convertFeatures({ background: { definition: null, customBackground: 'x' } }, noLinks)).toEqual([]);
    });

    it('prefers the standard background\'s feature when there is one', () => {
      const d = { background: { definition: standard(), customBackground: { id: 1, entityTypeId: 2, name: null, featuresBackground: null } } };
      expect(convertFeatures(d, noLinks).map((f) => [f.key, f.originName])).toEqual([['feature:3:7', 'Sailor']]);
    });

    it('names an orphan background option by the custom background', () => {
      const option = { componentTypeId: 99, componentId: 99, definition: { id: 4, entityTypeId: 2, name: 'D' } };
      const named = convertFeatures({ ...custom(null), options: { background: [option] } }, noLinks);
      expect(named.map((f) => [f.name, f.origin, f.originName])).toEqual([['D', 'background', 'My Wanderer']]);
      const unnamed = convertFeatures({ ...custom(standard(), null), options: { background: [option] } }, noLinks);
      expect(unnamed.filter((f) => f.name === 'D').map((f) => f.originName)).toEqual(['Sailor']);
    });
  });

  it('places an option with no listed parent by the list it is in', () => {
    const option = (id: number, name: string) => ({ componentTypeId: 99, componentId: 99, definition: { id, entityTypeId: 2, name } });
    const features = convertFeatures(sheet({
      race: { fullName: 'Gnome' },
      background: { definition: { name: 'Sailor' } },
      options: { class: [option(1, 'A')], race: [option(2, 'B')], feat: [option(3, 'C')], background: [option(4, 'D')], other: [option(5, 'E')] },
    }), noLinks).filter((f) => f.key.startsWith('feature:2:'));
    expect(features.map((f) => [f.name, f.origin, f.originName, f.classIndex, f.parentKey])).toEqual([
      ['A', 'class', 'Tinker', 0, null],
      ['B', 'species', 'Gnome', null, null],
      ['C', 'feat', '', null, null],
      ['D', 'background', 'Sailor', null, null],
      ['E', 'feat', '', null, null],
    ]);
  });

  it('does not make an option the parent of another option', () => {
    const features = convertFeatures(sheet({
      options: {
        class: [
          { componentTypeId: 1, componentId: 1, definition: { id: 1, entityTypeId: 2, name: 'Outer' } },
          { componentTypeId: 2, componentId: 1, definition: { id: 2, entityTypeId: 2, name: 'Inner' } },
        ],
      },
    }), noLinks);
    expect(features.find((f) => f.name === 'Outer')?.parentKey).toBe('feature:1:1');
    expect(features.find((f) => f.name === 'Inner')?.parentKey).toBeNull();
  });

  it('numbers a second feature with the same IDs, and attaches options to the first', () => {
    const features = convertFeatures({
      feats: [
        { definition: { id: 1, entityTypeId: 5, name: 'Twin' } },
        { definition: { id: 1, entityTypeId: 5, name: 'Twin' } },
      ],
      options: { feat: [{ componentTypeId: 5, componentId: 1, definition: { id: 8, entityTypeId: 2, name: 'Choice' } }] },
    }, new Map([['5:1', ['action:1:1']]]));
    expect(features.map((f) => [f.key, f.parentKey, f.playKeys])).toEqual([
      ['feature:5:1', null, ['action:1:1']],
      ['feature:5:1#2', null, ['action:1:1']],
      ['feature:2:8', 'feature:5:1', []],
    ]);
  });

  it('keys a feature that has no ID by what it is, and leaves out one with no name', () => {
    const one = convertFeatures({ feats: [{ definition: { name: 'Homebrew gift' } }, { definition: { id: 4, entityTypeId: 5 } }, { definition: {} }, {}] }, noLinks);
    expect(one).toHaveLength(1);
    expect(one[0].key).toMatch(/^feature:anon-[0-9a-f]{8}$/);
    const again = convertFeatures({ feats: [{ definition: { id: 4, entityTypeId: 5 } }, { definition: { name: 'Homebrew gift' } }] }, noLinks);
    expect(again[0].key).toBe(one[0].key);
    const asTrait = convertFeatures({ race: { racialTraits: [{ definition: { name: 'Homebrew gift' } }] } }, noLinks);
    expect(asTrait[0].key).not.toBe(one[0].key);
  });

  it('uses the short description when the full one is empty, and defaults the rest', () => {
    const [full, short, none] = convertFeatures({
      feats: [
        { definition: { id: 1, entityTypeId: 5, name: 'A', description: '<p>Full</p>', snippet: 'Short' } },
        { definition: { id: 2, entityTypeId: 5, name: 'B', description: '', snippet: 'Short' } },
        { definition: { id: 3, entityTypeId: 5, name: 'C', description: 7, hideInSheet: 'yes' } },
      ],
    }, noLinks);
    expect([full.description, short.description, none.description]).toEqual(['<p>Full</p>', 'Short', '']);
    expect(none.hiddenOnSheet).toBe(false);
  });

  it('copies the play rows, so that changing one feature does not change another', () => {
    const links = new Map([['5:1', ['action:1:1']]]);
    const [feature] = convertFeatures({ feats: [{ definition: { id: 1, entityTypeId: 5, name: 'A' } }] }, links);
    feature.playKeys.push('x');
    expect(links.get('5:1')).toEqual(['action:1:1']);
  });

  it('never throws, and finds nothing, on a sheet with no usable lists', () => {
    const broken = [
      {}, { classes: 'x', feats: 3, race: 4, options: [1, 2], background: 'b' },
      { classes: [null, 5, { classFeatures: 'x' }, { classFeatures: [null, 3, { definition: 4 }] }] },
      { feats: [null, 1, 'x'], race: { racialTraits: { a: 1 } }, options: { class: 'x', feat: [null, 2] } },
      { background: { definition: null } }, { background: { definition: { featureName: 5, grantedFeats: 'x' } } },
    ];
    for (const d of broken) expect(convertFeatures(d, noLinks)).toEqual([]);
    expect(convertCharacter({}).features).toEqual([]);
    expect(convertCharacter(null).features).toEqual([]);
  });
});

describe('playLinks', () => {
  it('groups keys by component, in order, and skips rows with none', () => {
    const links = playLinks([
      { entry: { key: 'a' }, component: '1:1' },
      { entry: { key: 'b' }, component: null },
      { entry: { key: 'c' }, component: '1:1' },
      { entry: { key: 'd' }, component: '2:2' },
    ]);
    expect([...links]).toEqual([['1:1', ['a', 'c']], ['2:2', ['d']]]);
  });
});
