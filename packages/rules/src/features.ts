import type { Ability, Character, Feature } from '@cw/model';
import { sortByOrder } from './order';

/** A feature, with the options chosen within it. */
export interface FeatureItem {
  feature: Feature;
  options: Feature[];
}

/** One heading of the Features page and what is listed under it. */
export interface FeatureGroup {
  /** `class:{index}`, `feat`, `species` or `background`. */
  key: string;
  heading: string;
  items: FeatureItem[];
}

/** Everything the Features page is built from. The player's edits do not change it. */
export interface FeatureSource {
  /** Every feature on the sheet, in the sheet's order, including what is hidden. */
  list: Feature[];
  /** Each group's heading, by group key. */
  headings: Record<string, string>;
}

const REST = ['feat', 'species', 'background'];

const groupKey = (f: Feature): string =>
  f.origin === 'class' || f.origin === 'subclass' ? `class:${f.classIndex ?? 0}` : f.origin;

/** Classes first, in the sheet's order, then feats, the species and the background. */
function rank(key: string): number {
  const rest = REST.indexOf(key);
  return rest === -1 ? Number(key.slice('class:'.length)) : Number.MAX_SAFE_INTEGER - REST.length + rest;
}

function heading(key: string, features: Feature[], c: Character): string {
  if (key === 'feat') return 'Feats';
  if (key === 'species') return features.find((f) => f.originName !== '')?.originName ?? 'Species';
  if (key === 'background') return features.find((f) => f.originName !== '')?.originName ?? 'Background';
  const cls = c.classes[Number(key.slice('class:'.length))];
  return cls && cls.name !== '' ? `${cls.name} ${cls.level}` : 'Class features';
}

function grouped(list: Feature[]): Map<string, Feature[]> {
  const byGroup = new Map<string, Feature[]>();
  for (const f of list) {
    const key = groupKey(f);
    const group = byGroup.get(key);
    if (group) group.push(f);
    else byGroup.set(key, [f]);
  }
  return byGroup;
}

/** The character's features and the heading each group goes under. */
export function featureSource(c: Character): FeatureSource {
  const headings: Record<string, string> = {};
  for (const [key, features] of grouped(c.features)) headings[key] = heading(key, features, c);
  return { list: c.features, headings };
}

/** The keys of the features D&D Beyond hides on its own sheet. They start hidden here too. */
export const hiddenOnSheet = (list: Feature[]): Set<string> =>
  new Set(list.filter((f) => f.hiddenOnSheet).map((f) => f.key));

/**
 * The Features page: one heading for each class, then Feats, the species and the background,
 * without the features whose key is in `hidden`. An option sits under the feature that offers it;
 * one whose parent is not listed, or is hidden, goes to the end of its group. Within a group the
 * features named in `order` come first, in that order; an option moves with its parent.
 */
export function arrangeFeatures(source: FeatureSource, hidden: ReadonlySet<string>, order: string[] = []): FeatureGroup[] {
  return [...grouped(source.list.filter((f) => !hidden.has(f.key))).entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, features]) => {
      const items: FeatureItem[] = [];
      const byKey = new Map<string, FeatureItem>();
      for (const feature of features) {
        if (feature.parentKey !== null) continue;
        const item = { feature, options: [] };
        items.push(item);
        byKey.set(feature.key, item);
      }
      for (const feature of features) {
        if (feature.parentKey === null) continue;
        const parent = byKey.get(feature.parentKey);
        if (parent) parent.options.push(feature);
        else items.push({ feature, options: [] });
      }
      const rows = sortByOrder(items.map((item) => ({ key: item.feature.key, item })), order);
      return { key, heading: source.headings[key] ?? '', items: rows.map((row) => row.item) };
    });
}

/** The Features page of a character with no edits: an entry the sheet itself hides is left out. */
export function featureGroups(c: Character): FeatureGroup[] {
  const source = featureSource(c);
  return arrangeFeatures(source, hiddenOnSheet(source.list));
}

/** Where a class or subclass feature comes from: "Warlock, level 2". Null for everything else. */
export function featureLine(f: Feature): string | null {
  if (f.level === null) return null;
  return f.originName !== '' ? `${f.originName}, level ${f.level}` : `Level ${f.level}`;
}

/** Every feature key starts this way, and no ability key does. */
export const isFeatureKey = (key: string): boolean => key.startsWith('feature:');

const SOURCE: Record<Feature['origin'], Ability['source']> = {
  class: 'class', subclass: 'class', feat: 'feat', species: 'species', background: 'background',
};

/**
 * A feature as a row in play: a reminder under the feature's own key, name and description. It is
 * passive and has no roll, cost or tags until the player gives it some.
 */
export function featureAbility(f: Feature): Ability {
  return {
    key: f.key,
    name: f.name,
    source: SOURCE[f.origin],
    timing: 'passive',
    roll: { kind: 'none' },
    cost: { kind: 'none' },
    poolKey: null,
    tags: [],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: f.description,
    notes: [],
    tagSource: 'none',
  };
}
