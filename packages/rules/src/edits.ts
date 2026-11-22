import type {
  Ability, AbilityEdit, CharacterEdits, CustomAbility, Roll, Tag, Timing, UsesEdit, ViewName,
} from '@cw/model';
import type { Resource } from './abilities';
import type { Sheet } from './sheet';

export const emptyEdits = (): CharacterEdits => ({ abilities: {}, custom: [], order: { combat: [], explore: [] } });

/** True when an edit changes nothing, so it need not be kept. */
export const isEmptyEdit = (edit: AbilityEdit): boolean => Object.keys(edit).length === 0;

const EXPLORE_TAGS: Tag[] = ['utility', 'social', 'movement'];

/**
 * Which views list an ability when the player has not chosen. Combat lists everything that does
 * not take a minute or more. Explore lists what is useful outside a fight.
 */
export function defaultViews(ability: Pick<Ability, 'timing' | 'ritual' | 'tags'>): Record<ViewName, boolean> {
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

/** `list` with the abilities named in `order` first, in that order; the rest keep their places. */
export function sortByOrder<T extends { key: string }>(list: T[], order: string[]): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const placed = list.filter((a) => rank.has(a.key)).sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  return [...placed, ...list.filter((a) => !rank.has(a.key))];
}

/**
 * A view's order after the player arranged one group. Only the order within a group matters, so
 * the group's keys are taken out of the list and put back, in their new order, at the end.
 */
export function withGroupOrder(order: string[], groupKeys: string[]): string[] {
  const moved = new Set(groupKeys);
  return [...order.filter((key) => !moved.has(key)), ...groupKeys];
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
 * calculated sheet is not changed. Edits apply to imported abilities, universal actions and
 * custom abilities alike, by key. An edit whose ability is not on the sheet has no effect.
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
    edited.push(ability.key);
    if (change.hidden) hiddenKeys.add(ability.key);
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

  const kept: Resource[] = [];
  for (const resource of resources.values()) {
    const users = everything.filter((a) => usesPool(a, resource.key));
    if (released.has(resource.key) && users.length === 0) continue;
    // A pool whose every user is hidden is noise too.
    if (users.length > 0 && users.every((a) => hiddenKeys.has(a.key))) continue;
    kept.push(resource);
  }

  return {
    ...sheet,
    resources: kept,
    abilities: all.filter((a) => !hiddenKeys.has(a.key)),
    universal: universal.filter((a) => !hiddenKeys.has(a.key)),
    hidden: everything.filter((a) => hiddenKeys.has(a.key)),
    edited,
    layout: { order: { combat: [...edits.order.combat], explore: [...edits.order.explore] }, show },
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
  const pool = poolKey === null ? undefined : sheet.resources.find((r) => r.key === poolKey);
  const views = viewsOf(sheet, ability);
  return {
    timing: ability.timing,
    uses: pool ? { max: pool.max, reset: pool.reset } : null,
    tags: ability.tags,
    roll: ability.roll,
    inCombat: views.combat,
    inExplore: views.explore,
    hidden: sheet.hidden.some((a) => a.key === ability.key),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
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
  if (form.hidden) out.hidden = true;
  return out;
}
