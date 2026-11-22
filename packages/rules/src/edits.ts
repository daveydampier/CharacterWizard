import type {
  Ability, AbilityEdit, CharacterEdits, CustomAbility, Roll, Tag, Timing, UsesEdit, ViewName,
} from '@cw/model';
import type { Resource } from './abilities';
import { arrangeFeatures, featureAbility, isFeatureKey } from './features';
import type { Sheet } from './sheet';

export { sortByOrder, withGroupOrder } from './order';

export const emptyEdits = (): CharacterEdits => ({ abilities: {}, custom: [], order: { combat: [], explore: [], features: [] } });

/** True when an edit changes nothing, so it need not be kept. */
export const isEmptyEdit = (edit: AbilityEdit): boolean => Object.keys(edit).length === 0;

const EXPLORE_TAGS: Tag[] = ['utility', 'social', 'movement'];

/**
 * Which views list an ability when the player has not chosen. Combat lists everything that does
 * not take a minute or more. Explore lists what is useful outside a fight. A feature is in neither:
 * the app never adds one to a view, whatever its timing and tags. Only the player's tick does.
 * The key says which of the two this is for, so it must always be given.
 */
export function defaultViews(ability: Pick<Ability, 'key' | 'timing' | 'ritual' | 'tags'>): Record<ViewName, boolean> {
  if (isFeatureKey(ability.key)) return { combat: false, explore: false };
  return {
    combat: ability.timing !== 'long',
    explore: ability.timing === 'long' || ability.ritual || ability.tags.some((t) => EXPLORE_TAGS.includes(t)),
  };
}

/** Which views list an ability on this sheet: the player's choice where there is one. */
export function viewsOf(sheet: Sheet, ability: Ability): Record<ViewName, boolean> {
  const chosen = sheet.layout.show[ability.key];
  const fallback = defaultViews(ability);
  return { combat: chosen?.combat ?? fallback.combat, explore: chosen?.explore ?? fallback.explore };
}

/** True for a feature that D&D Beyond hides on its own sheet: it starts hidden. False for everything else. */
export const hiddenByDefault = (sheet: Sheet, key: string): boolean =>
  sheet.featureSource.list.some((f) => f.key === key && f.hiddenOnSheet);

/**
 * `edit` with its row hidden or shown. The choice is recorded only where it differs from what
 * the row does unasked (`byDefault`), so that hiding and restoring leaves no edit behind.
 */
export function withHidden(edit: AbilityEdit | undefined, hidden: boolean, byDefault: boolean): AbilityEdit {
  const { hidden: _before, ...rest } = edit ?? {};
  return hidden === byDefault ? rest : { ...rest, hidden };
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>');

/** A custom ability as a row. A cost in uses spends from a pool under the ability's own key. */
function customAbility(custom: CustomAbility, sheet: Sheet): Ability {
  const cost: Ability['cost'] =
    custom.cost.kind === 'uses'
      ? { kind: 'uses', resourceKey: custom.key }
      : custom.cost.kind === 'slot'
        ? { kind: 'slot', minLevel: custom.cost.minLevel, pact: sheet.pactSlots !== null && Object.keys(sheet.slots).length === 0 }
        : { kind: 'none' };
  return {
    key: custom.key,
    name: custom.name,
    source: 'custom',
    timing: custom.timing,
    roll: custom.roll,
    cost,
    poolKey: null,
    tags: custom.tags,
    concentration: custom.concentration,
    ritual: false,
    range: null,
    area: false,
    description: escapeHtml(custom.description),
    notes: [],
    tagSource: 'user',
  };
}

const usesPool = (ability: Ability, key: string): boolean =>
  (ability.cost.kind === 'uses' && ability.cost.resourceKey === key) || ability.poolKey === key;

/**
 * The sheet the views show: the calculated sheet with the player's edits applied. Pure; the
 * calculated sheet is not changed. Edits apply to imported abilities, universal actions, custom
 * abilities and features alike, by key. An edit whose ability is not on the sheet has no effect.
 *
 * A feature is hidden and put in order under its own key. One with no ability of its own also
 * becomes a row in each view the player ticked it into.
 */
export function applyEdits(sheet: Sheet, edits: CharacterEdits): Sheet {
  const resources = new Map<string, Resource>(sheet.resources.map((r) => [r.key, r]));
  for (const custom of edits.custom) {
    if (custom.cost.kind === 'uses') {
      resources.set(custom.key, { key: custom.key, name: custom.name, max: custom.cost.max, reset: custom.cost.reset });
    }
  }
  /** Pools an ability stopped spending from. One that nothing else uses is dropped. */
  const released = new Set<string>();
  const hiddenKeys = new Set<string>();
  const edited: string[] = [];
  const show: Sheet['layout']['show'] = {};

  const edit = (ability: Ability): Ability => {
    const change = edits.abilities[ability.key];
    if (!change || isEmptyEdit(change)) return ability;
    const feature = isFeatureKey(ability.key);
    // A feature's row is there because the player ticked it: only a change to what it says counts as edited.
    if (!feature || change.timing || change.uses || change.tags || change.roll) edited.push(ability.key);
    // Whether a feature is hidden is settled below, since one can be hidden with no edit at all.
    if (change.hidden && !feature) hiddenKeys.add(ability.key);
    if (change.inCombat !== undefined || change.inExplore !== undefined) {
      show[ability.key] = {
        ...(change.inCombat !== undefined ? { combat: change.inCombat } : {}),
        ...(change.inExplore !== undefined ? { explore: change.inExplore } : {}),
      };
    }
    let next: Ability = ability;
    if (change.timing) next = { ...next, timing: change.timing };
    if (change.tags) next = { ...next, tags: change.tags, tagSource: 'user' };
    if (change.roll) next = { ...next, roll: change.roll };
    // An ability that costs a spell slot keeps that cost: its uses cannot be edited.
    if (change.uses && next.cost.kind !== 'slot') {
      if (change.uses === 'none') {
        if (next.cost.kind === 'uses') released.add(next.cost.resourceKey);
        next = { ...next, cost: { kind: 'none' } };
      } else {
        const key = next.cost.kind === 'uses' ? next.cost.resourceKey : next.key;
        const existing = resources.get(key);
        resources.set(key, { key, name: existing?.name ?? next.name, max: change.uses.max, reset: change.uses.reset });
        next = { ...next, cost: { kind: 'uses', resourceKey: key } };
      }
    }
    return next;
  };

  const all = [...sheet.abilities, ...edits.custom.map((c) => customAbility(c, sheet))].map(edit);
  const universal = sheet.universal.map(edit);
  const everything = [...all, ...universal];

  const list = sheet.featureSource.list;
  const hiddenFeatures = list.filter((f) => edits.abilities[f.key]?.hidden ?? f.hiddenOnSheet);
  const hiddenFeatureKeys = new Set(hiddenFeatures.map((f) => f.key));
  const featureRows: Record<string, Ability> = {};
  /** Feature rows that a view lists, and the ones a view would list if the feature were not hidden. */
  const inPlay: Ability[] = [];
  const hiddenRows: Ability[] = [];
  for (const f of list) {
    // A feature that already has abilities is in play as those, and they are edited where they are listed.
    if (f.playKeys.length > 0) continue;
    const row = edit(featureAbility(f));
    featureRows[f.key] = row;
    const chosen = show[f.key];
    if (!chosen?.combat && !chosen?.explore) continue;
    (hiddenFeatureKeys.has(f.key) ? hiddenRows : inPlay).push(row);
  }

  const listed = new Set([...everything.filter((a) => !hiddenKeys.has(a.key)), ...inPlay].map((a) => a.key));
  const spenders = [...everything, ...Object.values(featureRows)];
  const kept: Resource[] = [];
  const unshown: Resource[] = [];
  for (const resource of resources.values()) {
    const users = spenders.filter((a) => usesPool(a, resource.key));
    if (released.has(resource.key) && users.length === 0) continue;
    // A pool that nothing listed spends is noise: its abilities are hidden, or are features in neither view.
    if (users.length > 0 && !users.some((a) => listed.has(a.key))) unshown.push(resource);
    else kept.push(resource);
  }

  return {
    ...sheet,
    resources: kept,
    unshownResources: unshown,
    abilities: [...all.filter((a) => !hiddenKeys.has(a.key)), ...inPlay],
    universal: universal.filter((a) => !hiddenKeys.has(a.key)),
    hidden: [...everything.filter((a) => hiddenKeys.has(a.key)), ...hiddenRows],
    features: arrangeFeatures(sheet.featureSource, hiddenFeatureKeys, edits.order.features),
    hiddenFeatures,
    featureRows,
    edited,
    layout: {
      order: { combat: [...edits.order.combat], explore: [...edits.order.explore], features: [...edits.order.features] },
      show,
    },
  };
}

/** What the editor shows and changes for one ability. */
export interface EditForm {
  timing: Timing;
  /** Null when the ability has no limited uses, or costs a spell slot. */
  uses: UsesEdit | null;
  tags: Tag[];
  roll: Roll;
  inCombat: boolean;
  inExplore: boolean;
  hidden: boolean;
}

/** True when the ability's uses can be edited: anything that does not cost a spell slot. */
export const canEditUses = (ability: Ability): boolean => ability.cost.kind !== 'slot';

/** The form for an ability as it stands on `sheet` (which may or may not have edits applied). */
export function editForm(sheet: Sheet, ability: Ability): EditForm {
  const poolKey = ability.cost.kind === 'uses' ? ability.cost.resourceKey : null;
  const pool = poolKey === null ? undefined : [...sheet.resources, ...sheet.unshownResources].find((r) => r.key === poolKey);
  const views = viewsOf(sheet, ability);
  return {
    timing: ability.timing,
    uses: pool ? { max: pool.max, reset: pool.reset } : null,
    tags: ability.tags,
    roll: ability.roll,
    inCombat: views.combat,
    inExplore: views.explore,
    hidden: sheet.hidden.some((a) => a.key === ability.key) || sheet.hiddenFeatures.some((f) => f.key === ability.key),
  };
}

/**
 * True when two plain values hold the same content. The order of an object's keys does not
 * matter; the order of an array's items does (two damage parts swapped are a different roll).
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => same(item, b[i]));
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  const otherKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  return keys.length === otherKeys.length && keys.every((k) => Object.hasOwn(right, k) && same(left[k], right[k]));
}
const sameTags = (a: Tag[], b: Tag[]): boolean => same([...a].sort(), [...b].sort());

/**
 * The edit that turns the ability as imported (`base`, on the sheet with no edits) into what the
 * form says. Only fields that differ are recorded, so the rest keep following the imported sheet.
 */
export function diffEdit(baseSheet: Sheet, base: Ability, form: EditForm): AbilityEdit {
  const original = editForm(baseSheet, base);
  const out: AbilityEdit = {};
  if (form.timing !== original.timing) out.timing = form.timing;
  if (canEditUses(base) && !same(form.uses, original.uses)) out.uses = form.uses ?? 'none';
  if (!sameTags(form.tags, original.tags)) out.tags = form.tags;
  if (!same(form.roll, original.roll)) out.roll = form.roll;
  // The default view depends on timing and tags, so compare against the default for the edited ability.
  const fallback = defaultViews({ ...base, timing: form.timing, tags: form.tags });
  if (form.inCombat !== fallback.combat) out.inCombat = form.inCombat;
  if (form.inExplore !== fallback.explore) out.inExplore = form.inExplore;
  // A feature that D&D Beyond hides starts hidden, so for it the edit is the choice to show it.
  if (form.hidden !== original.hidden) out.hidden = form.hidden;
  return out;
}
