import { convertCharacter } from '@cw/ddb-import';
import type { Character, Feature } from '@cw/model';
import { describe, expect, it } from 'vitest';
import {
  arrangeFeatures, buildSheet, featureGroups, featureLabels, featureLine, featureSource, hiddenOnSheet,
} from '../src/index';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';

const characterOf = (slug: Slug): Character => convertCharacter(loadRaw(slug));

function feature(name: string, over: Partial<Feature> = {}): Feature {
  return {
    key: `feature:1:${name}`, name, origin: 'feat', originName: '', classIndex: null, level: null,
    parentKey: null, description: '', playKeys: [], hiddenOnSheet: false, ...over,
  };
}

/** An empty character with these classes and features. */
function character(features: Feature[], classes: { name: string; level: number }[] = []): Character {
  const base = convertCharacter({});
  return {
    ...base,
    classes: classes.map((c) => ({
      ...c, subclassName: null, spellcastingAbility: null, hasSpellcasting: false, isPactMagic: false, slots: [],
    })),
    features,
  };
}

/** Each group as its heading and its rows; an option is written "parent > option". */
const outline = (c: Character): [string, string[]][] =>
  featureGroups(c).map((g) => [
    g.heading,
    g.items.flatMap((item) => [item.feature.name, ...item.options.map((o) => `${item.feature.name} > ${o.name}`)]),
  ]);

describe('featureGroups', () => {
  it('lists a class, then feats, then the species, with options under their features', () => {
    expect(outline(characterOf('vlad'))).toEqual([
      ['Warlock 3', [
        'Core Warlock Traits',
        'Eldritch Invocations',
        'Eldritch Invocations > Pact of the Blade',
        'Eldritch Invocations > Armor of Shadows',
        'Eldritch Invocations > Fiendish Vigor',
        'Pact Magic',
        'Magical Cunning',
        'Warlock Subclass',
        'Tatzelwurm Spells',
        'Shadowy Form',
        'The Cost',
      ]],
      ['Feats', [
        'Alert',
        'Criminal Ability Score Improvements',
        'Criminal Ability Score Improvements > Increase three scores (+1 / +1 / +1)',
        'Lucky',
        'Dark Bargain',
      ]],
      ['Human', ['Resourceful', 'Skillful', 'Versatile', 'Creature Type', 'Size', 'Speed', 'Ability Score Increases']],
    ]);
    expect(featureGroups(characterOf('vlad')).map((g) => g.key)).toEqual(['class:0', 'feat', 'species']);
  });

  it('leaves out what D&D Beyond hides on its own sheet, so a feature the sheet lists twice shows once', () => {
    const rows = (slug: Slug) => featureGroups(characterOf(slug)).flatMap((g) => g.items.map((item) => item.feature.name));
    expect(rows('franny').filter((name) => name === 'Rage')).toEqual(['Rage']);
    expect(rows('anastasia').filter((name) => name === 'Innate Sorcery')).toEqual(['Innate Sorcery']);
    for (const slug of SLUGS) expect(rows(slug)).not.toContain('Languages');
    const shown = featureGroups(characterOf('franny')).flatMap((g) => g.items).find((item) => item.feature.name === 'Rage');
    expect(shown?.feature.playKeys).toHaveLength(1);
  });

  it.each(SLUGS)('shows every feature the sheet does not hide, once: %s', (slug) => {
    const c = characterOf(slug);
    const shown = featureGroups(c).flatMap((g) => g.items.flatMap((item) => [item.feature, ...item.options]));
    const expected = c.features.filter((f) => !f.hiddenOnSheet);
    expect(shown.map((f) => f.key).sort()).toEqual(expected.map((f) => f.key).sort());
    expect(new Set(shown.map((f) => f.key)).size).toBe(shown.length);
  });

  it('puts an option whose parent is not listed, or is hidden, at the end of its group', () => {
    const c = character([
      feature('A'),
      feature('Hidden parent', { hiddenOnSheet: true }),
      feature('B'),
      feature('Lost', { parentKey: 'feature:1:Gone' }),
      feature('Of A', { parentKey: 'feature:1:A' }),
      feature('Of hidden', { parentKey: 'feature:1:Hidden parent' }),
    ]);
    expect(outline(c)).toEqual([['Feats', ['A', 'A > Of A', 'B', 'Lost', 'Of hidden']]]);
  });

  it('nests one level only: an option of an option is a row of its own', () => {
    const c = character([
      feature('A'),
      feature('Of A', { parentKey: 'feature:1:A' }),
      feature('Of that', { parentKey: 'feature:1:Of A' }),
    ]);
    expect(outline(c)).toEqual([['Feats', ['A', 'A > Of A', 'Of that']]]);
  });

  it('does not nest an option under a feature of another group', () => {
    const c = character([
      feature('A'),
      feature('Trait option', { origin: 'species', originName: 'Gnome', parentKey: 'feature:1:A' }),
    ]);
    expect(outline(c)).toEqual([['Feats', ['A']], ['Gnome', ['Trait option']]]);
  });

  it('orders the groups: each class in the sheet\'s order, feats, species, background', () => {
    const c = character([
      feature('Passage', { origin: 'background', originName: 'Sailor' }),
      feature('Darkvision', { origin: 'species', originName: 'Gnome' }),
      feature('Alert'),
      feature('Keen eye', { origin: 'class', originName: 'Scout', classIndex: 1, level: 1 }),
      feature('Gears', { origin: 'subclass', originName: 'Clockmaker', classIndex: 0, level: 3 }),
      feature('Tools', { origin: 'class', originName: 'Tinker', classIndex: 0, level: 1 }),
    ], [{ name: 'Tinker', level: 3 }, { name: 'Scout', level: 1 }]);
    expect(outline(c)).toEqual([
      ['Tinker 3', ['Gears', 'Tools']],
      ['Scout 1', ['Keen eye']],
      ['Feats', ['Alert']],
      ['Gnome', ['Darkvision']],
      ['Sailor', ['Passage']],
    ]);
    expect(featureGroups(c).map((g) => g.key)).toEqual(['class:0', 'class:1', 'feat', 'species', 'background']);
  });

  it('orders ten or more classes by number, not by spelling', () => {
    const classes = Array.from({ length: 11 }, (_, i) => ({ name: `C${i}`, level: 1 }));
    const c = character([10, 2, 0].map((i) => feature(`F${i}`, { origin: 'class', classIndex: i, level: 1 })), classes);
    expect(featureGroups(c).map((g) => g.heading)).toEqual(['C0 1', 'C2 1', 'C10 1']);
  });

  it('falls back to a plain heading when a name is missing', () => {
    const c = character([
      feature('Tools', { origin: 'class', classIndex: 0, level: 1 }),
      feature('Odd', { origin: 'class', classIndex: null, level: 1, key: 'feature:1:Odd' }),
      feature('Darkvision', { origin: 'species' }),
      feature('Passage', { origin: 'background' }),
    ]);
    expect(featureGroups(c).map((g) => [g.key, g.heading])).toEqual([
      ['class:0', 'Class features'], ['species', 'Species'], ['background', 'Background'],
    ]);
  });

  it('is empty for a character with no features', () => {
    expect(featureGroups(character([]))).toEqual([]);
    expect(featureGroups(character([feature('Only hidden', { hiddenOnSheet: true })]))).toEqual([]);
  });
});

describe('arrangeFeatures', () => {
  const source = featureSource(character([
    feature('A'), feature('B'), feature('Of B', { parentKey: 'feature:1:B' }),
    feature('Keen', { origin: 'species', originName: 'Gnome' }),
  ]));
  const outlineOf = (hidden: string[], order: string[] = []): [string, string[]][] =>
    arrangeFeatures(source, new Set(hidden), order).map((g) => [
      g.heading, g.items.flatMap((i) => [i.feature.name, ...i.options.map((o) => `${i.feature.name} > ${o.name}`)]),
    ]);

  it('lists everything when nothing is hidden, under the headings the character gave', () => {
    expect(source.headings).toEqual({ feat: 'Feats', species: 'Gnome' });
    expect(outlineOf([])).toEqual([['Feats', ['A', 'B', 'B > Of B']], ['Gnome', ['Keen']]]);
  });

  it('leaves out a group whose features are all hidden', () => {
    expect(outlineOf(['feature:1:Keen'])).toEqual([['Feats', ['A', 'B', 'B > Of B']]]);
  });

  it('puts the named features first in their group, and an option whose parent is hidden last', () => {
    expect(outlineOf([], ['feature:1:B', 'feature:1:Keen'])).toEqual([['Feats', ['B', 'B > Of B', 'A']], ['Gnome', ['Keen']]]);
    expect(outlineOf(['feature:1:B'])).toEqual([['Feats', ['A', 'Of B']], ['Gnome', ['Keen']]]);
    expect(outlineOf(['feature:1:B'], ['feature:1:Of B'])).toEqual([['Feats', ['Of B', 'A']], ['Gnome', ['Keen']]]);
  });

  it('knows which features the sheet itself hides', () => {
    expect([...hiddenOnSheet([feature('Seen'), feature('Unseen', { hiddenOnSheet: true })])]).toEqual(['feature:1:Unseen']);
  });
});

describe('featureLine', () => {
  it('says where a class or subclass feature comes from', () => {
    expect(featureLine(feature('Magical Cunning', { origin: 'class', originName: 'Warlock', classIndex: 0, level: 2 }))).toBe('Warlock, level 2');
    expect(featureLine(feature('Gears', { origin: 'subclass', originName: 'Clockmaker', classIndex: 0, level: 3 }))).toBe('Clockmaker, level 3');
    expect(featureLine(feature('Nameless', { origin: 'class', classIndex: 0, level: 3 }))).toBe('Level 3');
  });

  it('is null for a feat, a species trait and an option', () => {
    expect(featureLine(feature('Alert'))).toBeNull();
    expect(featureLine(feature('Darkvision', { origin: 'species', originName: 'Gnome' }))).toBeNull();
    expect(featureLine(feature('Pact of the Blade', { origin: 'class', originName: 'Warlock', classIndex: 0, parentKey: 'feature:1:x' }))).toBeNull();
  });
});

describe('the sheet', () => {
  it.each(SLUGS)('carries the feature groups: %s', (slug) => {
    const c = characterOf(slug);
    const sheet = buildSheet(c);
    expect(sheet.features).toEqual(featureGroups(c));
    expect(sheet.features.length).toBeGreaterThanOrEqual(3);
  });
});

describe('featureLabels', () => {
  /** The labels with these features hidden; by default, the ones the sheet itself hides. */
  const labelsOf = (c: Character, hidden: Feature[] = c.features.filter((f) => f.hiddenOnSheet)) => {
    const source = featureSource(c);
    return featureLabels(arrangeFeatures(source, new Set(hidden.map((f) => f.key))), hidden, source);
  };
  /** The labels that are not the plain name, in sheet order. */
  const bracketed = (c: Character, labels: Record<string, string>): string[] =>
    c.features.filter((f) => f.key in labels && labels[f.key] !== f.name).map((f) => labels[f.key]);

  it('tells twins apart by parent, class line or heading, and leaves every other name alone', () => {
    const c = characterOf('danger');
    const labels = labelsOf(c);
    expect(bracketed(c, labels)).toEqual([
      'Weapon Mastery (Fighter, level 1)', '4: Weapon Mastery (Fighter, level 4)', 'Weapon Mastery (Feats)',
      '4: Weapon Mastery (Feats)', 'Intelligence (Otherworldly Presence)', 'Intelligence (Fiendish Legacy Spells)',
    ]);
    expect(new Set(Object.values(labels)).size).toBe(Object.keys(labels).length);
  });

  it('labels every feature on the page and in the drawer, and nothing else', () => {
    for (const slug of SLUGS) {
      const c = characterOf(slug);
      expect(Object.keys(labelsOf(c)).sort()).toEqual(c.features.map((f) => f.key).sort());
    }
  });

  it('counts a twin in the drawer, so hiding one does not rename the other', () => {
    const c = characterOf('danger');
    const intelligence = c.features.filter((f) => f.name === 'Intelligence');
    const labels = labelsOf(c, [...c.features.filter((f) => f.hiddenOnSheet), intelligence[0]]);
    expect(intelligence.map((f) => labels[f.key])).toEqual(['Intelligence (Otherworldly Presence)', 'Intelligence (Fiendish Legacy Spells)']);
  });

  it('numbers twins that nothing else tells apart, the later ones in page order', () => {
    const c = character([feature('Keen Nose', { key: 'feature:1:a' }), feature('Keen Nose', { key: 'feature:1:b' }), feature('Keen Nose', { key: 'feature:1:c' })]);
    expect(Object.values(labelsOf(c, []))).toEqual(['Keen Nose (Feats)', 'Keen Nose (Feats) 2', 'Keen Nose (Feats) 3']);
  });

  it('uses the class line for a class feature, and the heading for one with no level', () => {
    const c = character([
      feature('Tough Hide', { key: 'feature:1:a', origin: 'class', originName: 'Fighter', classIndex: 0, level: 3 }),
      feature('Tough Hide', { key: 'feature:1:b', origin: 'species', originName: 'Lizardfolk' }),
      feature('Gills', { key: 'feature:1:c', origin: 'species', originName: 'Lizardfolk' }),
    ], [{ name: 'Fighter', level: 5 }]);
    expect(labelsOf(c, [])).toEqual({
      'feature:1:a': 'Tough Hide (Fighter, level 3)', 'feature:1:b': 'Tough Hide (Lizardfolk)', 'feature:1:c': 'Gills',
    });
  });
});
