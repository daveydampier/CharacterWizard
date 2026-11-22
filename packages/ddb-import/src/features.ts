import type { Feature } from '@cw/model';
import { numberDuplicates, textHash } from './keys';
import { arr, componentRef, num, obj, str, type Linked, type Raw } from './raw';

/** A feature being built: the feature, what the sheet calls it, and what it is attached to. */
interface Draft {
  feature: Feature;
  /** This entry's own componentRef; null when the sheet gives it no ID. */
  ref: string | null;
  /** For an option, the componentRef of the entry it is attached to. */
  parentRef: string | null;
  option: boolean;
}

type Place = Pick<Feature, 'origin' | 'originName' | 'classIndex' | 'level'>;

/** componentRef to the keys of the actions and spells that component grants. */
export function playLinks(rows: Linked<{ key: string }>[]): Map<string, string[]> {
  const links = new Map<string, string[]>();
  for (const { entry, component } of rows) {
    if (component === null) continue;
    const keys = links.get(component);
    if (keys) keys.push(entry.key);
    else links.set(component, [entry.key]);
  }
  return links;
}

/** One entry of a feature list. Null when it has no name: there would be nothing to show. */
function draft(def: Raw, place: Place, description: string, parentRef: string | null, option: boolean): Draft | null {
  const name = str(def.name);
  if (name === '') return null;
  const ref = componentRef(def.entityTypeId, def.id);
  return {
    feature: {
      // Without an ID the key comes from what the entry is, so it survives a reordered sheet.
      key: `feature:${ref ?? `anon-${textHash(`${place.origin}|${name}`)}`}`,
      name,
      ...place,
      parentKey: null,
      description,
      playKeys: [],
      hiddenOnSheet: def.hideInSheet === true,
    },
    ref,
    parentRef,
    option,
  };
}

const describe = (def: Raw): string => str(def.description) || str(def.snippet);

/** A class's features up to the character's level in it, by level, then display order, then position. */
function classDrafts(c: Raw, classIndex: number): Draft[] {
  const cd = obj(c.definition);
  const sd = obj(c.subclassDefinition);
  const subclassId = num(sd.id);
  const level = num(c.level) ?? 0;
  return arr(c.classFeatures)
    .map((f, position) => ({ def: obj(obj(f).definition), position }))
    .filter(({ def }) => (num(def.requiredLevel) ?? 0) <= level)
    .sort((a, b) =>
      (num(a.def.requiredLevel) ?? 0) - (num(b.def.requiredLevel) ?? 0) ||
      (num(a.def.displayOrder) ?? 0) - (num(b.def.displayOrder) ?? 0) ||
      a.position - b.position)
    .flatMap(({ def }) => {
      // A class feature carries the ID of the class or subclass that defines it.
      const subclass = subclassId !== null && num(def.classId) === subclassId;
      const place: Place = {
        origin: subclass ? 'subclass' : 'class',
        originName: str(subclass ? sd.name : cd.name),
        classIndex,
        level: num(def.requiredLevel),
      };
      return draft(def, place, describe(def), null, false) ?? [];
    });
}

/** The background's own feature. A feat that a background grants is on the sheet's list of feats. */
function backgroundDraft(d: Raw): Draft | null {
  const bg = obj(obj(d.background).definition);
  if (bg.featureIsFeat === true || arr(bg.grantedFeats).length > 0) return null;
  const place: Place = { origin: 'background', originName: str(bg.name), classIndex: null, level: null };
  // The feature has no ID of its own; the background's is used.
  return draft({ name: bg.featureName, id: bg.id, entityTypeId: bg.entityTypeId }, place, str(bg.featureDescription), null, false);
}

/** Where an option with no listed parent goes: by the list it is in. */
function optionPlace(group: string, d: Raw): Place {
  if (group === 'class') {
    const first = obj(arr(d.classes)[0]);
    return { origin: 'class', originName: str(obj(first.definition).name), classIndex: 0, level: null };
  }
  if (group === 'race') return { origin: 'species', originName: speciesName(d), classIndex: null, level: null };
  if (group === 'background') {
    return { origin: 'background', originName: str(obj(obj(d.background).definition).name), classIndex: null, level: null };
  }
  return { origin: 'feat', originName: '', classIndex: null, level: null };
}

const speciesName = (d: Raw): string => str(obj(d.race).fullName) || str(obj(d.race).baseName);

/**
 * Every class and subclass feature, feat, species trait and option on the sheet, and the
 * background's own feature. Nothing is left out, by name or otherwise: an entry the sheet itself
 * hides is kept and marked. Never throws.
 *
 * Order: each class's features, then feats, species traits, the background's feature, and last the
 * options, each list in the sheet's order.
 */
export function convertFeatures(d: Raw, links: ReadonlyMap<string, string[]>): Feature[] {
  const species: Place = { origin: 'species', originName: speciesName(d), classIndex: null, level: null };
  const feat: Place = { origin: 'feat', originName: '', classIndex: null, level: null };
  const drafts: (Draft | null)[] = [
    ...arr(d.classes).flatMap((c, index) => classDrafts(obj(c), index)),
    ...arr(d.feats).map((f) => obj(obj(f).definition)).map((def) => draft(def, feat, describe(def), null, false)),
    ...arr(obj(d.race).racialTraits).map((t) => obj(obj(t).definition)).map((def) => draft(def, species, describe(def), null, false)),
    backgroundDraft(d),
    ...Object.entries(obj(d.options)).flatMap(([group, items]) =>
      arr(items).map((item) => {
        const o = obj(item);
        const def = obj(o.definition);
        return draft(def, optionPlace(group, d), describe(def), componentRef(o.componentTypeId, o.componentId), true);
      })),
  ];
  const kept = drafts.filter((x): x is Draft => x !== null);
  const features = numberDuplicates(kept.map((x) => x.feature));

  // An option belongs to the first listed feature with the ID it names. Options are not parents.
  const parents = new Map<string, Feature>();
  kept.forEach((x, index) => {
    if (!x.option && x.ref !== null && !parents.has(x.ref)) parents.set(x.ref, features[index]);
  });

  return features.map((feature, index) => {
    const { ref, parentRef, option } = kept[index];
    const parent = option && parentRef !== null ? parents.get(parentRef) : undefined;
    return {
      ...feature,
      ...(parent
        ? { origin: parent.origin, originName: parent.originName, classIndex: parent.classIndex, parentKey: parent.key }
        : {}),
      playKeys: ref !== null ? [...(links.get(ref) ?? [])] : [],
    };
  });
}
