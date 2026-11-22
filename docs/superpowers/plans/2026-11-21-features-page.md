# Features Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third page, Features, lists every class and subclass feature, feat, species trait and option on a character's sheet, read-only, so that a player can see what their character has.

**Architecture:** `@cw/ddb-import` reads the feature lists from the raw sheet into a new `Feature` record on `Character`, and records which feature grants each action and spell. `@cw/rules` groups them for display (`Sheet.features`). `apps/web` draws that as a third view behind the header switch. Nothing is stored or synced, and Combat and Explore do not change.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript 7 (strict), Vitest 5 (projects `node` and `web` on jsdom), React 19, Vite 8, Tailwind CSS 4, Zustand 5, React Testing Library 16, DOMPurify 3.

**Spec:** `docs/superpowers/specs/2026-11-11-character-wizard-design.md`, sections 5.5 and 10.6, with the header switch in 10.1, section 13 on descriptions and the Features line of section 14. Executors read the spec as well as this plan.

**Where this sits:** milestone 3 has three pieces. Part A (accounts and syncing) is merged. This plan is the second piece. Part B (overlays) comes after it and adds editing, hiding and reordering, for features too; its plan is revised after this one merges.

## Global Constraints

- No code may branch on a specific character, subclass, item, campaign, table or user. No list of feature names, in code or in data, decides what is shown.
- Unknown input must never throw. A missing or malformed list yields no features; a malformed entry takes defaults or is left out.
- Never edit `fixtures/expected/*.json`. Never edit `fixtures/characters/*.json`. Tests that need a variation copy a fixture in memory and change the copy.
- Rules text must not be committed. Fixture descriptions are `"[removed]"`; tests that need description text write their own made-up text.
- Never commit a real D&D Beyond character ID, username, email address, Discord ID, Supabase URL or key.
- Nothing is pushed, merged or deleted without the owner's say-so. The local branches `backup/pre-clean-branch` and `backup/pre-clean-main` are never pushed or merged.
- Only `@cw/ddb-import` may read D&D Beyond field names. `@cw/rules` reads only `@cw/model` types. `apps/web` never reads raw D&D Beyond fields; it calls `convertCharacter`.
- `@cw/rules` and `@cw/model` stay pure: no network, storage, DOM or React.
- The Features page is read-only in this plan. Do not build: an Edit button, Hide, a "Hidden" drawer, reordering, "Shown in", the "Always on" group, search, or any change to what Combat and Explore list. Those are Part B.
- Descriptions are HTML from outside the app. They are shown only through the existing `Description` component, which sanitises them.
- UI copy: sentence case; no "please", no exclamation marks; text exactly as written in this plan's tests.
- Every tappable control is at least 44 px tall (`min-h-11`).
- Multiclass characters stay out of scope. The code keeps one group for each class because the data has it; build nothing more for them.
- Package names: `@cw/model`, `@cw/ddb-import`, `@cw/rules`, `@cw/web`. Packages have no build step except `@cw/web`.
- Work on the branch `milestone-3-features`, cut from `milestone-3-task-13-results` (which holds the spec and this plan and is not yet on `main`). Commit after every task. End every commit message with: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## How this plan was checked

Each of Tasks 1 to 4 is one commit in a throwaway copy of the repository, built in order. The code blocks in this plan were generated from those commits, and the test counts in each task are what `pnpm test` printed at that commit. `pnpm typecheck` was clean at every commit and `pnpm build` succeeded at the last. The page was opened in a browser at 375 by 812 with the level 9 Fighter fixture: no sideways scrolling, each of the three header choices 112 by 44 px, and every row at least 44 px tall.

The file steps of this document (create a file, apply a change) were then replayed by a script onto a fresh checkout. The result was identical to the tested copy.

Starting point: 856 tests in 38 files.

## What the fixtures hold

Facts measured in `fixtures/characters`, which the tests below rely on. An implementer does not need to re-measure them.

- Every feature, feat, trait and option has an `id` and an `entityTypeId` on its `definition`. No two share both.
- An action or a spell names the entry that grants it with `componentTypeId` and `componentId`, which equal that entry's `entityTypeId` and `id`. 54 actions and 41 of 44 granted spells match a listed entry this way. Another 47 actions name a feature the sheet does not list; they are left alone.
- An option (`options.class`, `options.feat`, `options.race`) names its parent the same way. Every option in the fixtures has a listed parent.
- A class feature's `classId` is the ID of the class or of the subclass that defines it. That, and not `isSubClassFeature`, tells the two apart.
- `classFeatures` is not in level order. `displayOrder` orders features within a level on most sheets, not all.
- D&D Beyond's `hideInSheet` marks one or two entries per character: Languages on all eight, Eldritch Invocation Options, and the second copy of Rage and of Innate Sorcery. The sheet lists those two twice; the copy with the action is not flagged.
- Every background that has one grants its feature as a feat (`grantedFeats`), so no fixture produces a background feature. One fixture has no background at all.
- Descriptions are placeholders, so tests check names, order and links, and write their own text where they need some.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `packages/ddb-import/src/raw.ts` | modify | adds `componentRef` and the `Linked<T>` type |
| `packages/ddb-import/src/actions.ts` | modify | `convertActions` becomes `linkedActions`: each action with the component that grants it |
| `packages/ddb-import/src/spells.ts` | modify | `convertSpells` becomes `linkedSpells`, the same for spells |
| `packages/ddb-import/src/features.ts` | create | `convertFeatures` and `playLinks`: all reading of the sheet's feature lists |
| `packages/ddb-import/src/index.ts` | modify | wires the three together in `convertCharacter` |
| `packages/model/src/index.ts` | modify | the `Feature` type and `Character.features` |
| `packages/rules/src/features.ts` | create | `featureGroups` and `featureLine`: grouping and row text, no D&D Beyond knowledge |
| `packages/rules/src/sheet.ts`, `index.ts` | modify | `Sheet.features` |
| `apps/web/src/router.ts` | modify | the `features` view and its address |
| `apps/web/src/screens/Character.tsx` | modify | the three-way switch on its own row; renders the new view |
| `apps/web/src/views/FeaturesView.tsx` | create | the page |
| Tests | create | `packages/ddb-import/test/links.test.ts`, `packages/ddb-import/test/features.test.ts`, `packages/rules/test/features.test.ts`, `apps/web/src/views/FeaturesView.test.tsx`; `apps/web/src/router.test.ts` is modified |

---

### Task 1: Record which feature grants each action and spell

The converter already reads every action and spell. This task makes it also keep the component the sheet says grants each one, without changing any action or spell.

**Files:**
- Create: `packages/ddb-import/test/links.test.ts`
- Modify: `packages/ddb-import/src/raw.ts`
- Modify: `packages/ddb-import/src/actions.ts`
- Modify: `packages/ddb-import/src/spells.ts`
- Modify: `packages/ddb-import/src/index.ts`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces, in `packages/ddb-import/src/raw.ts`:
  - `interface Linked<T> { entry: T; component: string | null }`
  - `componentRef(typeId: unknown, id: unknown): string | null`, which returns `"{typeId}:{id}"`, or null when either part is missing.
- Produces: `linkedActions(d: Raw): Linked<ActionEntry>[]` in `actions.ts` and `linkedSpells(d: Raw, characterLevel: number): Linked<SpellEntry>[]` in `spells.ts`. They replace `convertActions` and `convertSpells`, which nothing else uses.
- `convertCharacter` returns exactly what it returned before.

- [ ] **Step 1: Write the failing tests**

Create `packages/ddb-import/test/links.test.ts`:

<!-- create: packages/ddb-import/test/links.test.ts -->
```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run packages/ddb-import/test/links.test.ts`

Expected: FAIL. `componentRef`, `linkedActions` and `linkedSpells` do not exist yet, so every test fails with "is not a function".

- [ ] **Step 3: Add `componentRef` and `Linked` to `raw.ts`**

<!-- apply: packages/ddb-import/src/raw.ts -->
```diff
diff --git a/packages/ddb-import/src/raw.ts b/packages/ddb-import/src/raw.ts
index bfd0b30..f85f862 100644
--- a/packages/ddb-import/src/raw.ts
+++ b/packages/ddb-import/src/raw.ts
@@ -55,5 +55,29 @@ export function limitedUseFrom(lu: unknown): LimitedUse | null {
   return { base, ability, addProficiency, reset: resetFrom(l.resetType) };
 }
 
+/** An entry of the converted character, with the sheet component that grants it. */
+export interface Linked<T> {
+  entry: T;
+  /** A componentRef, or null when the sheet names no component. */
+  component: string | null;
+}
+
+const idPart = (v: unknown): string | null => {
+  const n = num(v);
+  if (n !== null) return String(n);
+  return str(v) || null;
+};
+
+/**
+ * "{type}:{id}", the way the sheet names a feature, feat, trait or option: by an entity type ID and
+ * an ID. An action or a spell names the component that grants it the same way. Null when either
+ * part is missing.
+ */
+export function componentRef(typeId: unknown, id: unknown): string | null {
+  const type = idPart(typeId);
+  const own = idPart(id);
+  return type !== null && own !== null ? `${type}:${own}` : null;
+}
+
 export const slug = (s: string): string =>
   s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
```

- [ ] **Step 4: Turn `convertActions` into `linkedActions`**

The components are collected beside the entries and joined after `numberDuplicates`, because that function returns new objects for the rows it renames.

<!-- apply: packages/ddb-import/src/actions.ts -->
```diff
diff --git a/packages/ddb-import/src/actions.ts b/packages/ddb-import/src/actions.ts
index e4d0b22..bd4384f 100644
--- a/packages/ddb-import/src/actions.ts
+++ b/packages/ddb-import/src/actions.ts
@@ -1,7 +1,8 @@
 import type { ActionDice, ActionEntry } from '@cw/model';
 import { numberDuplicates, textHash } from './keys';
 import {
-  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
+  abilityFromStatId, arr, componentRef, limitedUseFrom, num, obj, str, timingFromActivation,
+  type Linked, type Raw,
 } from './raw';
 
 const SOURCES = ['class', 'race', 'feat', 'item', 'background'] as const;
@@ -60,14 +61,24 @@ function fromCustom(a: Raw, key: string | number): ActionEntry {
   };
 }
 
-export function convertActions(d: Raw): ActionEntry[] {
+/** Every action on the sheet, each with the component the sheet says grants it. */
+export function linkedActions(d: Raw): Linked<ActionEntry>[] {
   const groups = obj(d.actions);
-  const out: ActionEntry[] = [];
+  const entries: ActionEntry[] = [];
+  const components: (string | null)[] = [];
   for (const [group, items] of Object.entries(groups)) {
     const source = (SOURCES as readonly string[]).includes(group) ? (group as GroupSource) : 'class';
-    for (const a of arr(items)) out.push(fromGroup(obj(a), source, keyId(obj(a))));
+    for (const item of arr(items)) {
+      const a = obj(item);
+      entries.push(fromGroup(a, source, keyId(a)));
+      components.push(componentRef(a.componentTypeId, a.componentId));
+    }
+  }
+  for (const item of arr(d.customActions)) {
+    const a = obj(item);
+    entries.push(fromCustom(a, keyId(a)));
+    components.push(null);
   }
-  for (const a of arr(d.customActions)) out.push(fromCustom(obj(a), keyId(obj(a))));
   // Two actions can share an id and a granting component; both are kept.
-  return numberDuplicates(out);
+  return numberDuplicates(entries).map((entry, index) => ({ entry, component: components[index] }));
 }
```

- [ ] **Step 5: Turn `convertSpells` into `linkedSpells`**

A spell from an item gets no component: an item is not a feature, and the item's ID could collide with nothing useful.

<!-- apply: packages/ddb-import/src/spells.ts -->
```diff
diff --git a/packages/ddb-import/src/spells.ts b/packages/ddb-import/src/spells.ts
index 9f1d250..24710cc 100644
--- a/packages/ddb-import/src/spells.ts
+++ b/packages/ddb-import/src/spells.ts
@@ -1,6 +1,7 @@
 import type { DamagePart, SpellEntry } from '@cw/model';
 import {
-  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
+  abilityFromStatId, arr, componentRef, limitedUseFrom, num, obj, str, timingFromActivation,
+  type Linked, type Raw,
 } from './raw';
 import { activeItemIds } from './modifiers';
 
@@ -78,7 +79,11 @@ function itemNames(d: Raw): Map<number, string> {
   return names;
 }
 
-export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
+/**
+ * Every spell on the sheet, each with the component the sheet says grants it. A spell from an item
+ * has none: an item is not a feature.
+ */
+export function linkedSpells(d: Raw, characterLevel: number): Linked<SpellEntry>[] {
   const active = activeItemIds(d);
   const names = itemNames(d);
   const wrappers: { wrapper: Raw; fromItem: boolean }[] = [
@@ -87,7 +92,7 @@ export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
       arr(list).map((w) => ({ wrapper: obj(w), fromItem: group === 'item' }))),
   ];
   const seen = new Set<string>();
-  const out: SpellEntry[] = [];
+  const out: Linked<SpellEntry>[] = [];
   for (const { wrapper, fromItem } of wrappers) {
     const item = fromItem ? grantingItem(wrapper, active, names) : null;
     // A spell from an item that is not equipped (and attuned, if attunable) is not available.
@@ -95,7 +100,7 @@ export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
     const entry = spellEntry(wrapper, characterLevel, item);
     if (!entry || seen.has(entry.key)) continue;
     seen.add(entry.key);
-    out.push(entry);
+    out.push({ entry, component: fromItem ? null : componentRef(wrapper.componentTypeId, wrapper.componentId) });
   }
   return out;
 }
```

- [ ] **Step 6: Use them in `convertCharacter`**

<!-- apply: packages/ddb-import/src/index.ts -->
```diff
diff --git a/packages/ddb-import/src/index.ts b/packages/ddb-import/src/index.ts
index b92fb9c..0bfd163 100644
--- a/packages/ddb-import/src/index.ts
+++ b/packages/ddb-import/src/index.ts
@@ -1,12 +1,12 @@
 import type { Character } from '@cw/model';
-import { convertActions } from './actions';
+import { linkedActions } from './actions';
 import { convertClasses } from './classes';
 import { convertArmor, convertChargedItems, convertWeapons } from './items';
 import { convertModifiers } from './modifiers';
 import { num, obj, str } from './raw';
 import { baseScores, scoreOverrides } from './scores';
 import { convertSkillCustom } from './skills';
-import { convertSpells } from './spells';
+import { linkedSpells } from './spells';
 
 export { parseCharacterId } from './id';
 
@@ -16,6 +16,8 @@ export function convertCharacter(input: unknown): Character {
   const d = 'data' in outer ? obj(outer.data) : outer;
   const classes = convertClasses(d);
   const level = classes.reduce((sum, c) => sum + c.level, 0);
+  const spells = linkedSpells(d, level);
+  const actions = linkedActions(d);
   return {
     id: num(d.id) ?? 0,
     name: str(d.name),
@@ -28,7 +30,7 @@ export function convertCharacter(input: unknown): Character {
     weapons: convertWeapons(d),
     armor: convertArmor(d),
     chargedItems: convertChargedItems(d),
-    spells: convertSpells(d, level),
-    actions: convertActions(d),
+    spells: spells.map((l) => l.entry),
+    actions: actions.map((l) => l.entry),
   };
 }
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run packages/ddb-import`

Expected: PASS, 110 tests in 7 files.

Run: `pnpm test`

Expected: PASS, 882 tests in 39 files.

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/ddb-import/src/raw.ts packages/ddb-import/src/actions.ts packages/ddb-import/src/spells.ts packages/ddb-import/src/index.ts packages/ddb-import/test/links.test.ts
git commit -m "Record which feature grants each action and spell" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Read features from the sheet

**Files:**
- Create: `packages/ddb-import/test/features.test.ts`
- Create: `packages/ddb-import/src/features.ts`
- Modify: `packages/model/src/index.ts`
- Modify: `packages/ddb-import/src/index.ts`

**Interfaces:**
- Consumes from Task 1: `Linked<T>`, `componentRef`, `linkedActions`, `linkedSpells`. Also `numberDuplicates` and `textHash` from `packages/ddb-import/src/keys.ts`, and `arr`, `num`, `obj`, `str` from `raw.ts`, all of which exist.
- Produces, in `@cw/model`: the `Feature` interface below, and `Character.features: Feature[]`.
- Produces, in `packages/ddb-import/src/features.ts`:
  - `playLinks(rows: Linked<{ key: string }>[]): Map<string, string[]>`
  - `convertFeatures(d: Raw, links: ReadonlyMap<string, string[]>): Feature[]`
- The order of the returned list is part of the interface, and Task 3 relies on it: each class's features (by level, then `displayOrder`, then position on the sheet), then feats, species traits, the background's feature, and last the options, each in the sheet's order.
- An entry flagged `hideInSheet` is kept, with `hiddenOnSheet: true`. Leaving it out is Task 3's job, so that keys do not change when Part B lets a player restore it.

- [ ] **Step 1: Write the failing tests**

Create `packages/ddb-import/test/features.test.ts`:

<!-- create: packages/ddb-import/test/features.test.ts -->
```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run packages/ddb-import/test/features.test.ts`

Expected: FAIL. The file cannot be loaded, because `../src/features` does not exist.

- [ ] **Step 3: Add the `Feature` type**

<!-- apply: packages/model/src/index.ts -->
```diff
diff --git a/packages/model/src/index.ts b/packages/model/src/index.ts
index fdbd25f..9ae28f9 100644
--- a/packages/model/src/index.ts
+++ b/packages/model/src/index.ts
@@ -167,6 +167,31 @@ export interface SkillCustom {
   ability?: AbilityName;
 }
 
+/**
+ * Something the sheet says the character has: a class or subclass feature, a feat, a species trait,
+ * an option chosen within one of those, or the background's own feature. Most have no ability.
+ */
+export interface Feature {
+  /** `feature:{entityTypeId}:{id}`. Stable across re-imports. */
+  key: string;
+  name: string;
+  origin: 'class' | 'subclass' | 'feat' | 'species' | 'background';
+  /** The class, subclass, species or background by name. Empty for a feat. */
+  originName: string;
+  /** Position of the granting class in `Character.classes`. Null outside a class. */
+  classIndex: number | null;
+  /** The class level that grants it. Null outside a class, and for an option. */
+  level: number | null;
+  /** For an option, the key of the feature that offers it. */
+  parentKey: string | null;
+  /** From the player's own sheet. HTML. */
+  description: string;
+  /** Keys of the abilities the sheet attaches to this feature. */
+  playKeys: string[];
+  /** D&D Beyond's own flag: it does not show this entry on its sheet. */
+  hiddenOnSheet: boolean;
+}
+
 /** The app's own character format. Importers produce it; the rules engine consumes it. */
 export interface Character {
   id: number;
@@ -184,6 +209,7 @@ export interface Character {
   chargedItems: ChargedItem[];
   spells: SpellEntry[];
   actions: ActionEntry[];
+  features: Feature[];
 }
 
 export type Roll =
```

- [ ] **Step 4: Write the converter**

Create `packages/ddb-import/src/features.ts`:

<!-- create: packages/ddb-import/src/features.ts -->
```ts
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
```

Notes on the less obvious parts:

- `numberDuplicates` runs over every draft, hidden ones and options included, so that a key never depends on what is shown.
- Only a feature that is not itself an option can be a parent. An option that names another option keeps the place its own list gives it.
- An option takes its parent's `origin`, `originName` and `classIndex`, and keeps `level: null`.
- `playKeys` is a copy of the list in `links`, so that two features never share one array.

- [ ] **Step 5: Add features to the character**

<!-- apply: packages/ddb-import/src/index.ts -->
```diff
diff --git a/packages/ddb-import/src/index.ts b/packages/ddb-import/src/index.ts
index 0bfd163..02772f3 100644
--- a/packages/ddb-import/src/index.ts
+++ b/packages/ddb-import/src/index.ts
@@ -1,6 +1,7 @@
 import type { Character } from '@cw/model';
 import { linkedActions } from './actions';
 import { convertClasses } from './classes';
+import { convertFeatures, playLinks } from './features';
 import { convertArmor, convertChargedItems, convertWeapons } from './items';
 import { convertModifiers } from './modifiers';
 import { num, obj, str } from './raw';
@@ -32,5 +33,6 @@ export function convertCharacter(input: unknown): Character {
     chargedItems: convertChargedItems(d),
     spells: spells.map((l) => l.entry),
     actions: actions.map((l) => l.entry),
+    features: convertFeatures(d, playLinks([...actions, ...spells])),
   };
 }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/ddb-import`

Expected: PASS, 139 tests in 8 files.

Run: `pnpm test`

Expected: PASS, 911 tests in 40 files.

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/model/src/index.ts packages/ddb-import/src/features.ts packages/ddb-import/src/index.ts packages/ddb-import/test/features.test.ts
git commit -m "Read features, feats, traits and options from the sheet" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: Group features for the page

**Files:**
- Create: `packages/rules/test/features.test.ts`
- Create: `packages/rules/src/features.ts`
- Modify: `packages/rules/src/sheet.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Consumes from Task 2: `Feature` and `Character.features` from `@cw/model`, in the order Task 2 states. `convertCharacter` from `@cw/ddb-import` is used by the tests only.
- Produces, exported from `@cw/rules`:
  - `interface FeatureItem { feature: Feature; options: Feature[] }`
  - `interface FeatureGroup { key: string; heading: string; items: FeatureItem[] }`, where `key` is `class:{index}`, `feat`, `species` or `background`
  - `featureGroups(c: Character): FeatureGroup[]`
  - `featureLine(f: Feature): string | null`
  - `Sheet.features: FeatureGroup[]`
- `featureGroups` does not sort features within a group. It keeps the converter's order.

- [ ] **Step 1: Write the failing tests**

Create `packages/rules/test/features.test.ts`:

<!-- create: packages/rules/test/features.test.ts -->
```ts
import { convertCharacter } from '@cw/ddb-import';
import type { Character, Feature } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { buildSheet, featureGroups, featureLine } from '../src/index';
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run packages/rules/test/features.test.ts`

Expected: FAIL. `featureGroups` and `featureLine` are not exported from `../src/index`, so every test fails with "is not a function" or with `sheet.features` undefined.

- [ ] **Step 3: Write the grouping**

Create `packages/rules/src/features.ts`:

<!-- create: packages/rules/src/features.ts -->
```ts
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
```

- [ ] **Step 4: Put the groups on the sheet**

<!-- apply: packages/rules/src/sheet.ts -->
```diff
diff --git a/packages/rules/src/sheet.ts b/packages/rules/src/sheet.ts
index b48a2e6..0572084 100644
--- a/packages/rules/src/sheet.ts
+++ b/packages/rules/src/sheet.ts
@@ -6,6 +6,7 @@ import { buildAbilities, resources, type Resource } from './abilities';
 import { savingThrows, skillLevel, skills } from './checks';
 import { abilityScores, hasModifier, proficiencyBonus } from './core';
 import { armorClass, attacksPerAction, initiative } from './defence';
+import { featureGroups, type FeatureGroup } from './features';
 import { conditionalNotes, type Note } from './notes';
 import { spellSlots, spellcasting } from './spellcasting';
 import { universalActions } from './universal';
@@ -32,6 +33,8 @@ export interface Sheet {
   /** The actions every character can take. Kept apart from `abilities`, which come from the sheet. */
   universal: Ability[];
   notes: Note[];
+  /** The Features page, in order. Kept apart from `abilities`: nothing here is used or spent. */
+  features: FeatureGroup[];
 }
 
 function saveProficiency(c: Character): Record<AbilityName, boolean> {
@@ -70,5 +73,6 @@ export function buildSheet(c: Character): Sheet {
     abilities: buildAbilities(c),
     universal: universalActions(),
     notes: conditionalNotes(c),
+    features: featureGroups(c),
   };
 }
```

<!-- apply: packages/rules/src/index.ts -->
```diff
diff --git a/packages/rules/src/index.ts b/packages/rules/src/index.ts
index ff4cf7b..020e8c7 100644
--- a/packages/rules/src/index.ts
+++ b/packages/rules/src/index.ts
@@ -9,6 +9,7 @@ export * from './abilities';
 export * from './text';
 export * from './notes';
 export * from './universal';
+export * from './features';
 export * from './sheet';
 export * from './play';
 export * from './normalise';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/rules/test/features.test.ts`

Expected: PASS, 27 tests.

Run: `pnpm test`

Expected: PASS, 938 tests in 41 files.

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/features.ts packages/rules/src/sheet.ts packages/rules/src/index.ts packages/rules/test/features.test.ts
git commit -m "Group features for the Features page" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: The Features page

**Files:**
- Create: `apps/web/src/views/FeaturesView.test.tsx`
- Create: `apps/web/src/views/FeaturesView.tsx`
- Modify: `apps/web/src/router.test.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/screens/Character.tsx`

**Interfaces:**
- Consumes from Task 3: `Sheet.features`, `FeatureGroup`, `FeatureItem` and `featureLine` from `@cw/rules`; `Feature` from `@cw/model`.
- Consumes what exists: `Description` from `apps/web/src/components/Description.tsx` (sanitises HTML, and prints "No description on the sheet." when nothing readable is left); `seed` and `rawWithId` from `apps/web/src/test/helpers.ts`; `renderAt` from `apps/web/src/test/render.tsx`; `useStore().saveImported(raw)`.
- Produces: `type View = 'combat' | 'explore' | 'features'` in `router.ts`; the address `#/c/{id}/features`; `FeaturesView({ sheet }: { sheet: Sheet })`.

The header changes for every view: the switch moves from beside the character's name to a row of its own below it, three equal columns. Three choices do not fit beside the name at 375 px.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/views/FeaturesView.test.tsx`:

<!-- create: apps/web/src/views/FeaturesView.test.tsx -->
```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { rawWithId, seed } from '../test/helpers';
import { renderAt } from '../test/render';

async function openFeatures(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

/** Imports a changed copy of a fixture into the signed-in store and opens its Features page. */
async function openChanged(slug: Slug, change: (data: any) => void) {
  await seed(slug);
  const raw = rawWithId(slug, 424242);
  change(raw.data);
  const record = await useStore.getState().saveImported(raw);
  if (!record) throw new Error('the changed sheet did not import');
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const rowNames = (heading: string) =>
  within(group(heading)).getAllByRole('article').map((row) => row.getAttribute('aria-label'));
const row = (heading: string, name: string) => within(group(heading)).getByRole('article', { name });

describe('Features view', () => {
  it('lists the features under a heading for the class, the feats and the species', async () => {
    await openFeatures('vlad');
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['Warlock 3', 'Feats', 'Human']);
    expect(rowNames('Warlock 3')).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor',
      'Pact Magic', 'Magical Cunning', 'Warlock Subclass', 'Tatzelwurm Spells', 'Shadowy Form', 'The Cost',
    ]);
    expect(rowNames('Feats')).toEqual([
      'Alert', 'Criminal Ability Score Improvements', 'Increase three scores (+1 / +1 / +1)', 'Lucky', 'Dark Bargain',
    ]);
    expect(rowNames('Human')).toEqual(['Resourceful', 'Skillful', 'Versatile', 'Creature Type', 'Size', 'Speed', 'Ability Score Increases']);
  });

  it('says where a class or subclass feature comes from, and nothing for a feat', async () => {
    await openFeatures('vlad');
    expect(row('Warlock 3', 'Magical Cunning')).toHaveTextContent('Warlock, level 2');
    expect(row('Warlock 3', 'Shadowy Form')).toHaveTextContent('Thressia, Spirit of the Tatzelwurm, level 3');
    expect(row('Warlock 3', 'Pact of the Blade')).not.toHaveTextContent('level');
    expect(row('Feats', 'Alert')).toHaveTextContent(/^Alert$/);
  });

  it('labels a feature that has rows in play, and only those', async () => {
    await openFeatures('vlad');
    for (const [heading, name] of [['Feats', 'Lucky'], ['Warlock 3', 'Magical Cunning'], ['Warlock 3', 'Pact of the Blade']]) {
      expect(within(row(heading, name)).getByText('In play')).toBeInTheDocument();
    }
    for (const [heading, name] of [['Feats', 'Alert'], ['Warlock 3', 'Pact Magic'], ['Human', 'Size']]) {
      expect(within(row(heading, name)).queryByText('In play')).toBeNull();
    }
  });

  it('shows a feature the sheet lists twice once', async () => {
    await openFeatures('franny');
    expect(within(group('Barbarian 3')).getAllByRole('article', { name: 'Rage' })).toHaveLength(1);
    expect(within(row('Barbarian 3', 'Rage')).getByText('In play')).toBeInTheDocument();
  });

  it('has nothing to use or spend, and no turn button', async () => {
    await openFeatures('vlad');
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Action|Bonus Action|Reaction): / })).toBeNull();
    expect(screen.queryByRole('group', { name: /left$/ })).toBeNull();
  });

  it('opens and closes a description, sanitised', async () => {
    await openChanged('vlad', (data) => {
      const lucky = data.feats.find((f: any) => f.definition.name === 'Lucky');
      lucky.definition.description = '<p>Made-up <strong>test text</strong>.</p><script>window.hacked = true</script><a href="https://example.com">link</a>';
    });
    const lucky = row('Feats', 'Lucky');
    const toggle = within(lucky).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(lucky).queryByText('test text')).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(lucky).getByText('test text').tagName).toBe('STRONG');
    expect(lucky.querySelector('script')).toBeNull();
    expect(lucky.querySelector('a')).toBeNull();
    expect(lucky).toHaveTextContent('link');

    await userEvent.click(toggle);
    expect(within(lucky).queryByText('test text')).toBeNull();
  });

  it('says so when a feature has no description', async () => {
    await openChanged('vlad', (data) => {
      const alert = data.feats.find((f: any) => f.definition.name === 'Alert');
      alert.definition.description = '';
      alert.definition.snippet = '';
    });
    await userEvent.click(within(row('Feats', 'Alert')).getByRole('button'));
    expect(within(row('Feats', 'Alert')).getByText('No description on the sheet.')).toBeInTheDocument();
  });

  it('says so when the sheet lists no features', async () => {
    await openChanged('vlad', (data) => {
      for (const cls of data.classes) cls.classFeatures = [];
      data.feats = [];
      data.race.racialTraits = [];
      data.options = {};
    });
    expect(screen.getByText('This sheet lists no features.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('the view switch', () => {
  it('offers Combat, Explore and Features, and marks the one that is open', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'character', id: record.id, view: 'features' });
    await screen.findByRole('heading', { name: record.name });
    const links = within(screen.getByRole('navigation', { name: 'View' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('aria-current')])).toEqual([
      ['Combat', null], ['Explore', null], ['Features', 'page'],
    ]);
    expect(links[2]).toHaveAttribute('href', `#/c/${encodeURIComponent(record.id)}/features`);
    expect(screen.getByRole('region', { name: 'Feats' })).toBeInTheDocument();
  });

  it('still opens Combat and Explore', async () => {
    const record = await seed('vlad');
    const view = render(<CharacterScreen id={record.id} view="combat" />);
    expect(await screen.findByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Feats' })).toBeNull();
    view.rerender(<CharacterScreen id={record.id} view="explore" />);
    expect(screen.getByRole('button', { name: 'Long Rest' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Feats' })).toBeNull();
  });
});
```

Then extend the router tests:

<!-- apply: apps/web/src/router.test.ts -->
```diff
diff --git a/apps/web/src/router.test.ts b/apps/web/src/router.test.ts
index a7c6954..a500dba 100644
--- a/apps/web/src/router.test.ts
+++ b/apps/web/src/router.test.ts
@@ -10,11 +10,14 @@ describe('parseRoute', () => {
     expect(parseRoute('#/players')).toEqual({ name: 'players' });
     expect(parseRoute('#/c/abc-123/combat')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
     expect(parseRoute('#/c/abc-123/explore')).toEqual({ name: 'character', id: 'abc-123', view: 'explore' });
+    expect(parseRoute('#/c/abc-123/features')).toEqual({ name: 'character', id: 'abc-123', view: 'features' });
   });
 
   it('opens Combat when the view is missing or unknown', () => {
     expect(parseRoute('#/c/abc-123')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
     expect(parseRoute('#/c/abc-123/nonsense')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
+    expect(parseRoute('#/c/abc-123/Features')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
+    expect(parseRoute('#/c/abc-123/constructor')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
   });
 
   it('sends anything else home', () => {
@@ -39,6 +42,7 @@ describe('routeHref', () => {
       { name: 'home' }, { name: 'import' }, { name: 'about' }, { name: 'players' },
       { name: 'character', id: 'abc-123', view: 'combat' },
       { name: 'character', id: 'abc-123', view: 'explore' },
+      { name: 'character', id: 'abc-123', view: 'features' },
       { name: 'character', id: 'ddb-42-00000000-0000-4000-8000-00000000000a', view: 'combat' },
       { name: 'character', id: 'a/b%c d#e?f', view: 'explore' },
     ];
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/views/FeaturesView.test.tsx apps/web/src/router.test.ts`

Expected: FAIL. `view="features"` falls through to the Explore view, so no Features group is found; the route tests fail because `#/c/abc-123/features` parses as Combat.

- [ ] **Step 3: Add the view to the router**

<!-- apply: apps/web/src/router.ts -->
```diff
diff --git a/apps/web/src/router.ts b/apps/web/src/router.ts
index 0c38a43..37a92bd 100644
--- a/apps/web/src/router.ts
+++ b/apps/web/src/router.ts
@@ -1,6 +1,6 @@
 import { useSyncExternalStore } from 'react';
 
-export type View = 'combat' | 'explore';
+export type View = 'combat' | 'explore' | 'features';
 
 export type Route =
   | { name: 'home' }
@@ -18,7 +18,7 @@ function decoded(part: string): string | null {
   }
 }
 
-/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen. */
+/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen; an unknown view is Combat. */
 export function parseRoute(hash: string): Route {
   const parts = hash.replace(/^#/, '').split('/').filter((part) => part !== '');
   if (parts[0] === 'import' && parts.length === 1) return { name: 'import' };
@@ -26,7 +26,8 @@ export function parseRoute(hash: string): Route {
   if (parts[0] === 'players' && parts.length === 1) return { name: 'players' };
   if (parts[0] === 'c' && parts[1]) {
     const id = decoded(parts[1]);
-    if (id !== null) return { name: 'character', id, view: parts[2] === 'explore' ? 'explore' : 'combat' };
+    const view: View = parts[2] === 'explore' || parts[2] === 'features' ? parts[2] : 'combat';
+    if (id !== null) return { name: 'character', id, view };
   }
   return { name: 'home' };
 }
```

- [ ] **Step 4: Write the page**

Create `apps/web/src/views/FeaturesView.tsx`:

<!-- create: apps/web/src/views/FeaturesView.tsx -->
```tsx
import type { Feature } from '@cw/model';
import { featureLine, type Sheet } from '@cw/rules';
import { useState } from 'react';
import { Description } from '../components/Description';

/** One feature: its name, where it comes from, and the description on tap. Nothing here is used or spent. */
function FeatureRow({ feature, option = false }: { feature: Feature; option?: boolean }) {
  const [open, setOpen] = useState(false);
  const line = featureLine(feature);
  return (
    <article aria-label={feature.name} className={`border-t border-slate-200 py-2 ${option ? 'ml-4' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left">
        <span className="font-medium">{feature.name}</span>
        {feature.playKeys.length > 0 ? (
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900">In play</span>
        ) : null}
        {line ? <span className="block text-sm text-slate-600">{line}</span> : null}
      </button>
      {open ? <div className="mt-2 rounded-lg bg-slate-100 p-2"><Description html={feature.description} /></div> : null}
    </article>
  );
}

/** What the character has: every feature on the sheet, under a heading for where it comes from. */
export function FeaturesView({ sheet }: { sheet: Sheet }) {
  if (sheet.features.length === 0) return <p className="py-2 text-sm text-slate-600">This sheet lists no features.</p>;
  return (
    <div>
      {sheet.features.map((group) => (
        <section key={group.key} aria-label={group.heading} className="mt-4 first:mt-0">
          <h2 className="text-sm font-medium text-slate-700">{group.heading}</h2>
          {group.items.map((item) => (
            <div key={item.feature.key}>
              <FeatureRow feature={item.feature} />
              {item.options.map((option) => <FeatureRow key={option.key} feature={option} option />)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add the third choice to the header and render the page**

<!-- apply: apps/web/src/screens/Character.tsx -->
```diff
diff --git a/apps/web/src/screens/Character.tsx b/apps/web/src/screens/Character.tsx
index 17d82cf..c5db24b 100644
--- a/apps/web/src/screens/Character.tsx
+++ b/apps/web/src/screens/Character.tsx
@@ -3,12 +3,19 @@ import { routeHref, type View } from '../router';
 import { useStore } from '../store';
 import { CombatView } from '../views/CombatView';
 import { ExploreView } from '../views/ExploreView';
+import { FeaturesView } from '../views/FeaturesView';
 
-const TAB = 'inline-flex min-h-11 items-center rounded-full px-3 py-1 text-sm';
+const TAB = 'inline-flex min-h-11 items-center justify-center rounded-full px-3 py-1 text-sm';
 const TAB_ON = `${TAB} bg-slate-900 text-white`;
 const TAB_OFF = `${TAB} bg-slate-200 text-slate-800`;
 
-/** One character: the header, the Combat or Explore view, and the pinned undo bar and turn button. */
+const VIEWS: { view: View; label: string }[] = [
+  { view: 'combat', label: 'Combat' },
+  { view: 'explore', label: 'Explore' },
+  { view: 'features', label: 'Features' },
+];
+
+/** One character: the header, the Combat, Explore or Features view, and the pinned undo bar and turn button. */
 export function CharacterScreen({ id, view }: { id: string; view: View }) {
   const open = useStore((s) => s.open);
   const known = useStore((s) => s.characters.some((c) => c.id === id));
@@ -54,27 +61,22 @@ export function CharacterScreen({ id, view }: { id: string; view: View }) {
 
   return (
     <main className="mx-auto max-w-md px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-3">
-      <header className="flex items-center justify-between gap-2">
-        <div className="min-w-0">
-          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
-          <h1 className="truncate text-lg font-semibold">{sheet.name}</h1>
-          {sheet.classLine ? <p className="text-xs text-slate-600">{sheet.classLine}</p> : null}
-        </div>
-        <nav aria-label="View" className="flex shrink-0 gap-1">
-          <a
-            href={routeHref({ name: 'character', id, view: 'combat' })}
-            aria-current={view === 'combat' ? 'page' : undefined}
-            className={view === 'combat' ? TAB_ON : TAB_OFF}
-          >
-            Combat
-          </a>
-          <a
-            href={routeHref({ name: 'character', id, view: 'explore' })}
-            aria-current={view === 'explore' ? 'page' : undefined}
-            className={view === 'explore' ? TAB_ON : TAB_OFF}
-          >
-            Explore
-          </a>
+      <header>
+        <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
+        <h1 className="truncate text-lg font-semibold">{sheet.name}</h1>
+        {sheet.classLine ? <p className="text-xs text-slate-600">{sheet.classLine}</p> : null}
+        {/* Three choices do not fit beside the name on a phone, so they get a row of their own. */}
+        <nav aria-label="View" className="mt-2 grid grid-cols-3 gap-1">
+          {VIEWS.map((item) => (
+            <a
+              key={item.view}
+              href={routeHref({ name: 'character', id, view: item.view })}
+              aria-current={view === item.view ? 'page' : undefined}
+              className={view === item.view ? TAB_ON : TAB_OFF}
+            >
+              {item.label}
+            </a>
+          ))}
         </nav>
       </header>
 
@@ -84,7 +86,11 @@ export function CharacterScreen({ id, view }: { id: string; view: View }) {
         </p>
       ) : null}
 
-      <div className="mt-3">{view === 'combat' ? <CombatView sheet={sheet} /> : <ExploreView sheet={sheet} />}</div>
+      <div className="mt-3">
+        {view === 'combat' ? <CombatView sheet={sheet} /> : null}
+        {view === 'explore' ? <ExploreView sheet={sheet} /> : null}
+        {view === 'features' ? <FeaturesView sheet={sheet} /> : null}
+      </div>
 
       {undo || view === 'combat' ? (
         <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md space-y-2 bg-slate-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
```

The footer needs no change: "Start my turn" already shows only in Combat, and the undo bar shows on any view while there is something to undo.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run apps/web/src/views/FeaturesView.test.tsx apps/web/src/router.test.ts`

Expected: PASS, 17 tests in 2 files.

Run: `pnpm test`

Expected: PASS, 948 tests in 42 files.

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/router.ts apps/web/src/router.test.ts apps/web/src/screens/Character.tsx apps/web/src/views/FeaturesView.tsx apps/web/src/views/FeaturesView.test.tsx
git commit -m "Add the Features page" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: Walk through the page and check the branch

No code is expected to change. If a check fails, fix it with a test that fails without the fix, in a commit of its own, and say so in the report.

**Files:** none, unless a check fails.

**Interfaces:**
- Consumes: the finished branch.
- Produces: a report of what was seen, and a branch ready for the owner to push.

- [ ] **Step 1: Run every check**

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

Expected: 948 tests in 42 files pass, the type check prints no errors, and the build writes `apps/web/dist`.

- [ ] **Step 2: Start the app locally**

```bash
pnpm dev
```

With no Supabase address configured the app uses the in-memory account and shows "Continue as test player".

To drive it from the Browser pane instead of running the command yourself, create `.claude/launch.json` in the repository folder with the content below, start the server named `web` from the pane's tools, and delete the file afterwards. `.claude/` is excluded from git on this machine.

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 3: Walk through at phone size (375 by 812)**

Sign in as the test player. On Import, open "Character JSON", paste the contents of `fixtures/characters/danger.json` and choose "Use this JSON". Then check each of these and note the result:

1. Combat opens. The header shows the name, the class line, and below them three choices of equal width: Combat, Explore, Features. Combat is marked as current.
2. Features shows three headings in this order: "Fighter 9", "Feats", "Tiefling". There is no "Background" heading: this character has no background.
3. Under "Fighter 9" the rows run from level 1 to level 9, and "War Magic" reads "Eldritch Knight, level 7" between the level 6 and level 8 rows.
4. "Second Wind", "Action Surge" and "Polearm Master" carry the label "In play". "Extra Attack", "Blind Fighting" and "Darkvision" do not.
5. Under "Feats", "Hand Crossbow (Vex)" is indented below "4: Weapon Mastery".
6. "Languages" is not listed.
7. Tapping a row opens its description, which in a fixture is the placeholder "[removed]"; tapping again closes it. Nothing else on the page reacts to a tap.
8. There is no Use button, no turn pills, no resource chips and no "Start my turn".
9. The page does not scroll sideways, and no row is shorter than 44 px.
10. Explore and Combat still work: use Second Wind in Combat, switch to Features and back, and the use is still spent. The undo bar shows on Features while it is offered.
11. The phone's back button (the browser's Back) returns from Features to the view before it.

- [ ] **Step 4: Check nothing unexpected is in the branch**

```bash
git status --short
```

```bash
git diff --stat milestone-3-task-13-results
```

Expected: a clean tree; the files of the table under "File structure" and nothing else. No file under `fixtures/` changed.

- [ ] **Step 5: Stop and hand over**

Report the checks and anything that looked wrong or awkward. Do not push. The owner decides when the branch is pushed and the pull request opened.

---

## Notes for Part B's plan

Part B's plan is revised after this merges. What this plan leaves for it, so that nothing has to be rediscovered:

- `Sheet.features` is built from the character alone. Part B's `applyEdits` must also apply `hidden` and `order.features` to it, and must build an ability for each feature ticked into Combat or Explore (spec section 5.5).
- A feature's `hidden`, when unset, follows `hiddenOnSheet`. The "Hidden" drawer of the Features page therefore starts with the entries D&D Beyond hides, and Restore sets `hidden: false`.
- `featureGroups` leaves out `hiddenOnSheet` entries itself today. In Part B that test moves into the edit layer.
- An option whose parent is hidden is listed as one whose parent is missing. `featureGroups` already does this for `hiddenOnSheet` parents.
- Part B's totals start from 948 tests in 42 files, not from the number in its current plan.
