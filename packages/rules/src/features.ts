import type { Character, Feature } from '@cw/model';

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

/**
 * The Features page: what the sheet says the character has, under one heading for each class, then
 * Feats, the species and the background. An entry the sheet itself hides is left out. An option
 * sits under the feature that offers it; one whose parent is not listed goes to the end of its
 * group.
 */
export function featureGroups(c: Character): FeatureGroup[] {
  const byGroup = new Map<string, Feature[]>();
  for (const f of c.features) {
    if (f.hiddenOnSheet) continue;
    const key = groupKey(f);
    const list = byGroup.get(key);
    if (list) list.push(f);
    else byGroup.set(key, [f]);
  }
  return [...byGroup.entries()]
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
      return { key, heading: heading(key, features, c), items };
    });
}

/** Where a class or subclass feature comes from: "Warlock, level 2". Null for everything else. */
export function featureLine(f: Feature): string | null {
  if (f.level === null) return null;
  return f.originName !== '' ? `${f.originName}, level ${f.level}` : `Level ${f.level}`;
}
