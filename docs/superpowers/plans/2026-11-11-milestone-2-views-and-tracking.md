# Milestone 2: Views and Turn Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app that imports a D&D Beyond character and shows a Combat view and an Explore view with turn and resource tracking, stored on the device only.

**Architecture:** The pure packages gain the missing pieces the views need: new `Roll` variants, weapon charge links, roll-line text, conditional notes, the universal actions and a turn engine (`packages/rules/src/play.ts`). The import logic is one web-standard handler in `supabase/functions/_shared/`, run unchanged by the Supabase Edge Function, by the Vite dev server and by Vitest. `apps/web` is a React app whose single Zustand store holds the characters and the open character's play state, saved to IndexedDB through an `AppStorage` interface.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript 7 (strict), Vitest 5 with two projects (`node`, and `web` on jsdom), React 19, Vite 8, Tailwind CSS 4, Zustand 5, `idb` 8, DOMPurify 3, React Testing Library 16, `fake-indexeddb` 6, Supabase Edge Functions (Deno), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-11-11-character-wizard-design.md` (sections 4, 5.1, 5.3, 6, 8, 10, 12, 13, 14, 15). Executors read the spec as well as this plan.

## Global Constraints

- No code may branch on a specific character, subclass, item, campaign or table. Branching on SRD rule names is allowed.
- Unknown input must never throw. Unknown activation types become timing `unknown`; unknown reset types become `unknown`; unknown tags become `utility`; missing arrays are treated as empty.
- Never edit `fixtures/expected/*.json`. Never edit `fixtures/characters/*.json`. Tests that need a variation copy a fixture in memory and change the copy.
- Rules text must not be committed. Fixture descriptions are `"[removed]"`; tests that need description HTML write their own.
- Never commit a real D&D Beyond character ID, username, Supabase URL or key. Test IDs are `42` and `123456789`. Keys in tests are `sb_publishable_test` and similar.
- Only `@cw/ddb-import` may read D&D Beyond field names. `@cw/rules` reads only `@cw/model` types. `apps/web` never reads raw D&D Beyond fields; it calls `convertCharacter`.
- `@cw/rules` and `@cw/model` stay pure: no network, storage, DOM or React.
- The app never applies a conditional modifier to a number. It shows it as a note.
- Out of scope, do not build: accounts, sign-in, supabase-js, overlays (edit, reorder, hide, custom abilities), drag and drop, suggestions, turn plans, situation chips, usage events, feedback, a service worker or install prompt.
- UI copy: sentence case; no "please", no exclamation marks; roll lines and messages exactly as written in this plan's tests.
- Single-class characters only.
- Package names: `@cw/model`, `@cw/ddb-import`, `@cw/rules`, `@cw/web`. Packages have no build step except `@cw/web`.
- Work on the branch `milestone-2-views-and-tracking`. Commit after every task. End every commit message with: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## How this plan was checked

Every file in this plan was written and run in a throwaway copy of the repository before the plan was written: 497 tests passed, `pnpm typecheck` passed, `pnpm --filter @cw/web build` succeeded, and the app was opened in a browser at 375 px wide. The library versions were the ones in "Tech Stack". If `pnpm add` installs a newer major version and a step fails, read that library's migration notes before changing the code in this plan.

## Scope notes

- The spec's `Storage` interface is named `AppStorage` in code, because `Storage` is the browser's own type for localStorage.
- `supabase-js` is not used. One `fetch` calls the function.
- The Edge Function has no signed-in check until milestone 3. It checks the project's publishable key and the caller's origin. This is recorded as an accepted risk in spec section 17.
- Usage events are not recorded. Milestone 4 adds them.
- The fixtures all carry D&D Beyond ID `1` after sanitizing, so importing two fixtures by pasting JSON replaces the first with the second. Tests that need two characters use `rawWithId` (Task 10).

## File structure

```
packages/model/src/index.ts              + Roll variants, Ability fields, Weapon.unattuned,
                                           SpellEntry.itemName, TurnState, PlayState
packages/ddb-import/src/id.ts            parseCharacterId (moved from scripts/)
packages/ddb-import/src/items.ts         unattuned weapons
packages/ddb-import/src/spells.ts        item-granted spell key and item name
packages/rules/src/abilities.ts          new Roll variants, poolKey, notes, ritual, source
packages/rules/src/text.ts               rollLine, spacedDice, abilityLabel, skillLabel
packages/rules/src/notes.ts              conditionalNotes
packages/rules/src/universal.ts          the twelve universal actions
packages/rules/src/sheet.ts              + classLine, skillLevels, saveProficiency, notes, universal
packages/rules/src/play.ts               the turn engine
packages/rules/src/views.ts              combatGroups, exploreAbilities
scripts/sheet.ts                         uses rollLine; prints notes
scripts/fetch-character.ts               imports parseCharacterId from @cw/ddb-import

supabase/functions/_shared/import-handler.ts       the import logic (web standard only)
supabase/functions/_shared/import-handler.test.ts
supabase/functions/import-character/index.ts       Deno entry point
supabase/config.toml                                created in Task 16

apps/web/package.json, index.html, vite.config.ts
apps/web/dev/import-plugin.ts            mounts the handler on the Vite dev server
apps/web/src/main.tsx, App.tsx, index.css, vite-env.d.ts
apps/web/src/router.ts                   hash routes
apps/web/src/storage/{types,memory,idb,index}.ts   AppStorage and its two implementations
apps/web/src/store.ts                    the Zustand store
apps/web/src/import/client.ts            calls the function; the messages
apps/web/src/components/                 Pips, ResourceChips, Description, NotesList,
                                         AbilityRow, SlotSheet, useAbilityUse
apps/web/src/views/                      CombatView, ExploreView
apps/web/src/screens/                    Home, Import, About, Character
apps/web/src/test/                       setup.ts, helpers.ts, render.tsx
```

## Background the implementer needs

- **Commands:** `pnpm test` runs everything. `pnpm exec vitest run <path>` runs one file. `pnpm typecheck` checks every package, the web app and the shared handler. `pnpm sheet fixtures/characters/vlad.json` prints a sheet.
- **Fixtures:** `loadRaw(slug)` and `loadExpected(slug)` from `test-utils/fixtures.ts`. Slugs: `anastasia` (Sorcerer 3), `danger` (Fighter 9, two attacks per Action), `franny` (Barbarian 3), `maya` (Cleric 3), `milton` (Bard 3), `minkis` (Wizard 3), `sid` (Rogue 3), `vlad` (Warlock 3).
- **Facts the tests rely on:**
  - `vlad` has two Pact Magic slots of level 2 and no other slots; two abilities named Misty Step (one costs a pact slot, one is a free cast with 3 uses); three weapons named `Wurms Claw - Sword`, `- Axe` and `- Hammer`, each with its own 3-charge pool; Hex is a Bonus Action, concentration, pact slot spell with `1d6 necrotic` damage and no attack or save.
  - `minkis` has 4 level 1 slots and 2 level 2 slots; Chromatic Orb is a level 1 Action spell; Mind Spike is level 2.
  - `danger` has Action Surge (1 use, Short Rest) and Second Wind (3 uses, Long Rest, dice `1d10+9`).
  - `maya` has Scorching Ray granted by the item Shepherds Staff, which has a 1-charge pool.
- **Turn rules (spec section 8):** one Action, one Bonus Action and one Reaction per round; one spell slot per turn, except that Reaction spells neither check nor set that limit; one concentration effect at a time.
- **Play state counts what is spent**, never what remains. Pool keys are an ability or item key, `slot:1` to `slot:9`, or `pact`.
- **Supabase keys:** a project's publishable key (`sb_publishable_...`) is public by design and is sent in the `apikey` header. Supabase injects it into the function as the JSON dictionary `SUPABASE_PUBLISHABLE_KEYS` (`{"default": "..."}`).

---

### Task 1: Converter changes

Item-granted spells get the key part `item` and carry their item's name; an unattuned weapon is flagged and loses its charge pool; `parseCharacterId` moves into `@cw/ddb-import` and accepts a query string or fragment.

**Files:**
- Create: `packages/ddb-import/src/id.ts`
- Create: `packages/ddb-import/test/id.test.ts`
- Modify: `packages/model/src/index.ts` (`DamagePart`, `Weapon`, `SpellEntry`)
- Modify: `packages/ddb-import/src/index.ts`, `packages/ddb-import/src/items.ts`, `packages/ddb-import/src/spells.ts`
- Modify: `packages/ddb-import/test/items.test.ts`, `packages/ddb-import/test/spells.test.ts`
- Modify: `scripts/fetch-character.ts`, `scripts/sanitize.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseCharacterId(input: string): string | null` exported from `@cw/ddb-import`; `Weapon.unattuned: boolean`; `SpellEntry.itemName: string | null`; item-granted spell keys end `:item`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ddb-import/test/id.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCharacterId } from '../src/index';

describe('parseCharacterId', () => {
  it('accepts a bare ID or a D&D Beyond character URL', () => {
    expect(parseCharacterId('123456789')).toBe('123456789');
    expect(parseCharacterId('  123456789\n')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789')).toBe('123456789');
    expect(parseCharacterId('https://dndbeyond.com/characters/123456789/')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789/builder')).toBe('123456789');
  });

  it('accepts a URL with a query string or a fragment', () => {
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789?utm_source=share')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789/builder?x=1#home')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789#spells')).toBe('123456789');
  });

  it('rejects anything else', () => {
    for (const bad of [
      '', 'abc', '12 34', '../etc/passwd', '-5', '1234567890123',
      'https://example.com/characters/1',
      'http://www.dndbeyond.com/characters/1',
      'https://www.dndbeyond.com.evil.example/characters/1',
      'https://www.dndbeyond.com/characters/abc',
      'https://www.dndbeyond.com/characters/1/../2',
    ]) {
      expect(parseCharacterId(bad)).toBeNull();
    }
  });
});
```

In `scripts/sanitize.test.ts`, delete the line `import { parseCharacterId } from './fetch-character';` and delete the whole `describe('parseCharacterId', ...)` block at the end of the file (the new test file replaces it).

In `packages/ddb-import/test/spells.test.ts`, replace:

```ts
    expect(ray).toMatchObject({ itemKey: 'item:10968023:base', uses: null });
    expect(ray?.key.endsWith(':free')).toBe(true);
    expect(vlad.every((s) => s.itemKey === null)).toBe(true);
```

with:

```ts
    expect(ray).toMatchObject({ itemKey: 'item:10968023:base', itemName: 'Shepherds Staff', uses: null });
    expect(ray?.key.endsWith(':item')).toBe(true);
    expect(vlad.every((s) => s.itemKey === null && s.itemName === null)).toBe(true);
```

and add this test immediately before `it('skips a spell granted by an item that is not active', ...)`:

```ts
  it('keys an item-granted spell as item even when it is flagged as using a spell slot', () => {
    const raw = loadRaw('maya');
    const wrapper = raw.data.spells.item.find((w: any) => w.definition.name === 'Scorching Ray');
    wrapper.usesSpellSlot = true;
    const ray = convertCharacter(raw).spells.find((s) => s.name === 'Scorching Ray');
    expect(ray?.key.endsWith(':item')).toBe(true);
    expect(ray?.usesSlot).toBe(true);
  });

```

In `packages/ddb-import/test/items.test.ts`, add this test at the end of the `describe('weapon attunement', ...)` block (after the test `'ignores a magic bonus until the attunable weapon is attuned'`):

```ts

  it('flags an unattuned attunable weapon and gives it no charge pool', () => {
    const off = withWeapon(extra, true, false);
    expect(weaponOf(off.raw, off.name)).toMatchObject({ unattuned: true, uses: null });
    expect(convertCharacter(off.raw).chargedItems.map((i) => i.name)).not.toContain(off.name);
    const on = withWeapon(extra, true, true);
    expect(weaponOf(on.raw, on.name)).toMatchObject({ unattuned: false, uses: { base: 3 } });
    const plain = withWeapon(extra, false, false);
    expect(weaponOf(plain.raw, plain.name)).toMatchObject({ unattuned: false, uses: { base: 3 } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/ddb-import`
Expected: FAIL. `id.test.ts` fails because `parseCharacterId` is not exported from `../src/index`; the Scorching Ray tests fail on `itemName` and on the `:item` suffix; the attunement test fails on `unattuned`.

- [ ] **Step 3: Update the model**

In `packages/model/src/index.ts`, replace:

```ts
export interface DamagePart {
  dice: string;
```

with:

```ts
export interface DamagePart {
  /** A dice expression ("1d8+3") or a flat number ("4", "0"). */
  dice: string;
```

In `interface Weapon`, replace:

```ts
  properties: string[];
  uses: LimitedUse | null;
}
```

with:

```ts
  properties: string[];
  /** Null when the weapon has no charge pool, or needs attunement and is not attuned. */
  uses: LimitedUse | null;
  /** True when the item needs attunement and is not attuned: its magic properties are off. */
  unattuned: boolean;
}
```

In `interface SpellEntry`, replace:

```ts
  itemKey: string | null;
  description: string;
```

with:

```ts
  itemKey: string | null;
  /** Name of the item that grants this spell; null if not item-granted. */
  itemName: string | null;
  description: string;
```

- [ ] **Step 4: Move `parseCharacterId`**

Create `packages/ddb-import/src/id.ts`:

```ts
/**
 * Accepts "123456789" or a dndbeyond.com/characters/<id> URL, with or without a trailing path,
 * query string or fragment. Returns the numeric ID, or null for anything else.
 */
export function parseCharacterId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,12}$/.test(trimmed)) return trimmed;
  const match = /^https:\/\/(?:www\.)?dndbeyond\.com\/characters\/(\d{1,12})(?:\/[a-z0-9-]*)*(?:[?#].*)?$/i.exec(trimmed);
  return match ? match[1] : null;
}
```

In `packages/ddb-import/src/index.ts`, add after the last import line:

```ts

export { parseCharacterId } from './id';
```

In `scripts/fetch-character.ts`, add `import { parseCharacterId } from '@cw/ddb-import';` after the `node:url` import, and delete the local `parseCharacterId` function together with its doc comment. The file's imports become:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCharacterId } from '@cw/ddb-import';
import { sanitize } from './sanitize';
```

- [ ] **Step 5: Flag unattuned weapons**

In `packages/ddb-import/src/items.ts`, inside `convertWeapons`, replace:

```ts
      uses: limitedUseFrom(item.limitedUse),
    };
```

with:

```ts
      uses: effective ? limitedUseFrom(item.limitedUse) : null,
      unattuned: !effective,
    };
```

- [ ] **Step 6: Key item-granted spells as `item` and record the item's name**

In `packages/ddb-import/src/spells.ts`:

Replace the signature line `function spellEntry(wrapper: Raw, characterLevel: number, itemKey: string | null): SpellEntry | null {` with:

```ts
interface GrantingItem {
  key: string;
  name: string;
}

function spellEntry(wrapper: Raw, characterLevel: number, item: GrantingItem | null): SpellEntry | null {
```

Replace `  const costKind = usesSlot ? 'slot' : uses || itemKey ? 'free' : 'atwill';` with:

```ts
  // An item-granted spell is always keyed `item`, whatever D&D Beyond's slot flag says.
  const costKind = item ? 'item' : usesSlot ? 'slot' : uses ? 'free' : 'atwill';
```

In the returned object, replace the line `    itemKey,` with:

```ts
    itemKey: item?.key ?? null,
    itemName: item?.name ?? null,
```

Replace the whole `grantingItemKey` function and its doc comment with:

```ts
/** The granting item for a spell in the `spells.item` group, or null if that item is not active. */
function grantingItem(wrapper: Raw, active: Set<number>, names: Map<number, string>): GrantingItem | null {
  const id = num(wrapper.componentId);
  return id !== null && active.has(id) ? { key: `item:${id}:base`, name: names.get(id) ?? '' } : null;
}

function itemNames(d: Raw): Map<number, string> {
  const names = new Map<number, string>();
  for (const item of arr(d.inventory)) {
    const def = obj(item?.definition);
    const id = num(def.id);
    if (id !== null && !names.has(id)) names.set(id, str(def.name));
  }
  return names;
}
```

In `convertSpells`, add `  const names = itemNames(d);` on the line after `  const active = activeItemIds(d);`, and replace:

```ts
    const itemKey = fromItem ? grantingItemKey(wrapper, active) : null;
    // A spell from an item that is not equipped (and attuned, if attunable) is not available.
    if (fromItem && !itemKey) continue;
    const entry = spellEntry(wrapper, characterLevel, itemKey);
```

with:

```ts
    const item = fromItem ? grantingItem(wrapper, active, names) : null;
    // A spell from an item that is not equipped (and attuned, if attunable) is not available.
    if (fromItem && !item) continue;
    const entry = spellEntry(wrapper, characterLevel, item);
```

- [ ] **Step 7: Run all tests and the typecheck**

Run: `pnpm test`
Expected: PASS, every test.

Run: `pnpm typecheck`
Expected: no output after `tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add packages/model packages/ddb-import scripts/fetch-character.ts scripts/sanitize.test.ts
git commit -m "Key item spells as item, flag unattuned weapons, move parseCharacterId

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Ability changes

`Roll` gains `damage` and `dice`; `Ability` gains `poolKey`, `ritual` and `notes`; `source` drops `subclass` and gains `background`; an item-granted spell with no item pool costs a slot when the import says so.

**Files:**
- Modify: `packages/model/src/index.ts` (`Roll`, `Ability`)
- Replace: `packages/rules/src/abilities.ts`
- Modify: `packages/rules/test/abilities.test.ts`

**Interfaces:**
- Consumes: `Weapon.unattuned`, `SpellEntry.itemName` (Task 1).
- Produces:
  - `Roll` variants `{ kind: 'damage'; damage: DamagePart[] }` and `{ kind: 'dice'; dice: string }`.
  - `Ability.poolKey: string | null`, `Ability.ritual: boolean`, `Ability.notes: string[]`.
  - `Ability.source: 'spell' | 'class' | 'item' | 'feat' | 'species' | 'background' | 'universal' | 'custom'`.
  - `NOT_ATTUNED_NOTE` exported from `@cw/rules`.

- [ ] **Step 1: Update the tests**

In `packages/rules/test/abilities.test.ts`:

In the test `'builds a weapon attack'`, replace:

```ts
      source: 'item', timing: 'action', tags: ['damage'], cost: { kind: 'none' },
      roll: {
```

with:

```ts
      source: 'item', timing: 'action', tags: ['damage'], cost: { kind: 'none' },
      poolKey: 'item:10956860:base', notes: [], ritual: false,
      roll: {
```

In the test `'builds a pact slot spell with concentration'`, replace:

```ts
      timing: 'bonus', concentration: true, cost: { kind: 'slot', minLevel: 1, pact: true }, roll: { kind: 'none' },
    });
```

with:

```ts
      timing: 'bonus', concentration: true, cost: { kind: 'slot', minLevel: 1, pact: true },
      roll: { kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] },
    });
```

Add these two `describe` blocks immediately before `describe('item charges and item-granted spells', ...)`:

```ts
describe('rolls with no attack and no save', () => {
  const abilitiesOf = (slug: (typeof SLUGS)[number]) => buildAbilities(convertCharacter(loadRaw(slug)));

  it('shows the damage of a spell that needs no attack roll or saving throw', () => {
    expect(abilitiesOf('danger').find((a) => a.name === 'Absorb Elements')?.roll).toEqual({
      kind: 'damage', damage: [{ dice: '1d6', type: 'acid' }],
    });
  });

  it('shows a feature\'s dice without calling them damage', () => {
    const danger = abilitiesOf('danger');
    expect(danger.find((a) => a.name === 'Second Wind')?.roll).toEqual({ kind: 'dice', dice: '1d10+9' });
    expect(danger.find((a) => a.name === 'Tactical Mind')?.roll).toEqual({ kind: 'dice', dice: '1d10' });
    expect(abilitiesOf('milton').find((a) => a.name === 'Bardic Inspiration')?.roll).toEqual({ kind: 'dice', dice: '1d6' });
    expect(abilitiesOf('sid').find((a) => a.name === 'Sneak Attack')?.roll).toEqual({ kind: 'dice', dice: '2d6' });
  });

  it('keeps a spell with no damage and no roll as none', () => {
    expect(abilitiesOf('vlad').find((a) => a.name === 'Mage Armor')?.roll).toEqual({ kind: 'none' });
  });
});

describe('sources, rituals, notes and weapon pools', () => {
  const abilitiesOf = (raw: unknown) => buildAbilities(convertCharacter(raw));

  it.each(SLUGS)('never uses a source outside the model: %s', (slug) => {
    const allowed = ['spell', 'class', 'item', 'feat', 'species', 'background', 'universal', 'custom'];
    for (const a of abilitiesOf(loadRaw(slug))) expect(allowed).toContain(a.source);
  });

  it('maps a background action to the background source', () => {
    const raw = { data: { actions: { background: [{ id: 5, name: 'Background Trick', activation: { activationType: 1 } }] } } };
    expect(abilitiesOf(raw).find((a) => a.name === 'Background Trick')?.source).toBe('background');
  });

  it('marks ritual spells', () => {
    const minkis = abilitiesOf(loadRaw('minkis'));
    expect(minkis.find((a) => a.name === 'Detect Magic')?.ritual).toBe(true);
    expect(minkis.filter((a) => a.ritual).map((a) => a.name).sort()).toEqual(['Detect Magic', 'Find Familiar', 'Identify']);
  });

  it('links a weapon to its own charge pool and to nothing else', () => {
    const vlad = abilitiesOf(loadRaw('vlad'));
    const claws = vlad.filter((a) => a.name.startsWith('Wurms Claw'));
    expect(claws).toHaveLength(3);
    for (const claw of claws) {
      expect(claw.poolKey).toBe(claw.key);
      expect(claw.cost).toEqual({ kind: 'none' });
    }
    expect(vlad.filter((a) => a.poolKey !== null)).toHaveLength(3);
    expect(abilitiesOf(loadRaw('franny')).every((a) => a.poolKey === null)).toBe(true);
  });

  it('says which item grants a spell', () => {
    expect(abilitiesOf(loadRaw('maya')).find((a) => a.name === 'Scorching Ray')?.notes).toEqual(['From Shepherds Staff']);
    expect(abilitiesOf(loadRaw('vlad')).find((a) => a.name === 'Hex')?.notes).toEqual([]);
  });

  it('explains an unattuned weapon and shows no pool for it', () => {
    const raw = loadRaw('vlad');
    const item = raw.data.inventory.find((i: any) => i.equipped === true && i.definition.filterType === 'Weapon');
    item.definition.canAttune = true;
    item.isAttuned = false;
    const weapon = abilitiesOf(raw).find((a) => a.name === item.definition.name);
    expect(weapon).toMatchObject({ poolKey: null, notes: ['Not attuned: magic properties are off'] });
    expect(resources(convertCharacter(raw)).map((r) => r.name)).not.toContain(item.definition.name);
  });
});

```

In `describe('item charges and item-granted spells', ...)`, add this test immediately after the test `'costs nothing when an item spell\'s item has no pool'`:

```ts

  it('costs a slot when an item spell is flagged as slot-using and its item has no pool', () => {
    const c = convertCharacter(loadRaw('maya'));
    const ray = c.spells.find((s) => s.name === 'Scorching Ray');
    if (!ray) throw new Error('fixture has no Scorching Ray');
    ray.usesSlot = true;
    expect(buildAbilities(c).find((a) => a.name === 'Scorching Ray')?.cost).toMatchObject({ kind: 'uses' });
    c.chargedItems = [];
    expect(buildAbilities(c).find((a) => a.name === 'Scorching Ray')?.cost).toEqual({ kind: 'slot', minLevel: 2, pact: false });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/rules/test/abilities.test.ts`
Expected: FAIL. Hex's roll is `none`, `poolKey`, `ritual` and `notes` are undefined, and the background action's source is `feat`.

- [ ] **Step 3: Update the model**

In `packages/model/src/index.ts`, replace:

```ts
  | { kind: 'check'; bonus: number }
  | { kind: 'none' };
```

with:

```ts
  | { kind: 'check'; bonus: number }
  /** A spell with damage but no attack roll or saving throw. */
  | { kind: 'damage'; damage: DamagePart[] }
  /** A feature's dice whose meaning (damage, healing, a bonus) the import does not state. */
  | { kind: 'dice'; dice: string }
  | { kind: 'none' };
```

Replace the body of `interface Ability` so that the whole interface reads:

```ts
export interface Ability {
  key: string;
  name: string;
  /** The import cannot tell a subclass feature from a class feature; both are 'class'. */
  source: 'spell' | 'class' | 'item' | 'feat' | 'species' | 'background' | 'universal' | 'custom';
  timing: Timing;
  roll: Roll;
  cost: Cost;
  /** A pool shown on the row and spent by hand (a weapon's charges). Use never spends it. */
  poolKey: string | null;
  tags: Tag[];
  concentration: boolean;
  ritual: boolean;
  range: string | null;
  area: boolean;
  description: string;
  /** Short facts from the sheet, shown on the row. */
  notes: string[];
  tagSource: 'import' | 'curated' | 'user' | 'none';
}
```

- [ ] **Step 4: Replace `packages/rules/src/abilities.ts`**

Replace the whole file with:

```ts
import type {
  Ability, AbilityName, ActionEntry, Character, Cost, DamagePart, ResetType, Roll, SpellEntry,
} from '@cw/model';
import { actionAttacks, formatDamage, unarmedStrike, weaponAttacks } from './attacks';
import { abilityMod, abilityScores, proficiencyBonus } from './core';
import { limitedUseMax } from './resources';
import { spellAttackBonus, spellSaveDc } from './spellcasting';
import { mapDdbTags } from './tags';

export interface Resource {
  key: string;
  name: string;
  max: number;
  reset: ResetType;
}

const ACTION_SOURCE: Record<ActionEntry['source'], Ability['source']> = {
  class: 'class',
  race: 'species',
  feat: 'feat',
  item: 'item',
  background: 'background',
  custom: 'custom',
};

export const NOT_ATTUNED_NOTE = 'Not attuned: magic properties are off';

function castingContext(c: Character): { ability: AbilityName | null; className: string | null; pact: boolean } {
  const cls = c.classes.find((k) => k.spellcastingAbility);
  return {
    ability: cls?.spellcastingAbility ?? null,
    className: cls?.name ?? null,
    pact: c.classes.some((k) => k.isPactMagic),
  };
}

function spellRoll(c: Character, s: SpellEntry, ability: AbilityName | null, className: string | null): Roll {
  const damage: DamagePart[] = s.damage ? [s.damage] : [];
  if (ability && s.attack) {
    return { kind: 'attack', bonus: spellAttackBonus(c, ability, className), damage, optionalDamage: [] };
  }
  if (ability && s.saveAbility) {
    return { kind: 'save', ability: s.saveAbility, dc: spellSaveDc(c, ability, className), damage };
  }
  // Damage with no attack roll and no saving throw (Hex): the dice are still worth showing.
  if (damage.length > 0) return { kind: 'damage', damage };
  return { kind: 'none' };
}

/**
 * A spell's own pool comes first. An item-granted spell costs one charge of its item's pool
 * (the charge amount is not modelled). Without a pool it costs a slot if the import says so,
 * and otherwise nothing.
 */
function spellCost(c: Character, s: SpellEntry, pact: boolean): Cost {
  if (s.uses) return { kind: 'uses', resourceKey: s.key };
  if (s.itemKey && c.chargedItems.some((i) => i.key === s.itemKey)) {
    return { kind: 'uses', resourceKey: s.itemKey };
  }
  if (s.usesSlot) return { kind: 'slot', minLevel: s.level, pact };
  return { kind: 'none' };
}

function spellAbilities(c: Character): Ability[] {
  const ctx = castingContext(c);
  return c.spells.map((s): Ability => {
    const tags = mapDdbTags(s.ddbTags);
    return {
      key: s.key,
      name: s.name,
      source: 'spell',
      timing: s.timing,
      roll: spellRoll(c, s, s.castingAbility ?? ctx.ability, ctx.className),
      cost: spellCost(c, s, ctx.pact),
      poolKey: null,
      tags,
      concentration: s.concentration,
      ritual: s.ritual,
      range: s.range,
      area: s.area,
      description: s.description,
      notes: s.itemName ? [`From ${s.itemName}`] : [],
      tagSource: tags.length > 0 ? 'import' : 'none',
    };
  });
}

function weaponAbilities(c: Character): Ability[] {
  const pools = new Set(c.chargedItems.map((i) => i.key));
  // weaponAttacks returns one entry per weapon, in the same order as c.weapons.
  const weapons: Ability[] = weaponAttacks(c).map((w, index): Ability => ({
    key: w.key,
    name: w.name,
    source: 'item',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: w.attack,
      damage: [{ dice: w.damage, type: w.damageType }],
      optionalDamage: w.extraDamage,
    },
    cost: { kind: 'none' },
    // What a charge does is not in the import, so the pool is shown on the row and spent by hand.
    poolKey: pools.has(w.key) ? w.key : null,
    tags: ['damage'],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: '',
    notes: c.weapons[index]?.unattuned ? [NOT_ATTUNED_NOTE] : [],
    tagSource: 'import',
  }));
  const unarmed = unarmedStrike(c);
  weapons.push({
    key: 'universal:unarmed-strike:base',
    name: 'Unarmed Strike',
    source: 'universal',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: unarmed.attack,
      damage: [{ dice: String(unarmed.damage), type: 'Bludgeoning' }],
      optionalDamage: [],
    },
    cost: { kind: 'none' },
    poolKey: null,
    tags: ['damage'],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: '',
    notes: [],
    tagSource: 'curated',
  });
  return weapons;
}

function actionRoll(c: Character, a: ActionEntry, attackBonus: number | undefined): Roll {
  const scores = abilityScores(c);
  const mod = a.dcAbility ? abilityMod(scores[a.dcAbility]) : 0;
  const dice = a.dice ? formatDamage(`${a.dice.count}d${a.dice.sides}`, a.dice.fixed + (a.attack ? mod : 0)) : null;
  const damage: DamagePart[] = dice ? [{ dice, type: null }] : [];
  if (a.attack && attackBonus !== undefined) {
    return { kind: 'attack', bonus: attackBonus, damage, optionalDamage: [] };
  }
  if (a.saveAbility) {
    const dc = a.fixedDc ?? 8 + proficiencyBonus(c.level) + mod;
    return { kind: 'save', ability: a.saveAbility, dc, damage };
  }
  // Dice with no attack and no save: the import does not say whether they are damage or healing.
  if (dice) return { kind: 'dice', dice };
  return { kind: 'none' };
}

function actionAbilities(c: Character): Ability[] {
  const attackByKey = new Map(actionAttacks(c).map((a) => [a.key, a.attack]));
  return c.actions.map((a): Ability => ({
    key: a.key,
    name: a.name,
    source: ACTION_SOURCE[a.source],
    timing: a.timing,
    roll: actionRoll(c, a, attackByKey.get(a.key)),
    cost: a.uses ? { kind: 'uses', resourceKey: a.key } : { kind: 'none' },
    poolKey: null,
    tags: [],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: a.description,
    notes: [],
    tagSource: 'none',
  }));
}

export function buildAbilities(c: Character): Ability[] {
  const seen = new Set<string>();
  return [...weaponAbilities(c), ...spellAbilities(c), ...actionAbilities(c)].filter((a) =>
    seen.has(a.key) ? false : (seen.add(a.key), true),
  );
}

/** Every limited-use pool on the character: features, free spell casts and item charges. */
export function resources(c: Character): Resource[] {
  const out: Resource[] = [];
  for (const a of c.actions) {
    if (a.uses) out.push({ key: a.key, name: a.name, max: limitedUseMax(c, a.uses), reset: a.uses.reset });
  }
  for (const s of c.spells) {
    if (s.uses) out.push({ key: s.key, name: s.name, max: limitedUseMax(c, s.uses), reset: s.uses.reset });
  }
  for (const i of c.chargedItems) {
    out.push({ key: i.key, name: i.name, max: limitedUseMax(c, i.uses), reset: i.uses.reset });
  }
  return out;
}
```

- [ ] **Step 5: Run all tests and the typecheck**

Run: `pnpm test`
Expected: PASS, every test.

Run: `pnpm typecheck`
Expected: no errors. (`scripts/sheet.ts` has its own `rollLine` with a `default` branch, so the new `Roll` variants do not break it. Task 3 replaces it.)

- [ ] **Step 6: Commit**

```bash
git add packages/model packages/rules
git commit -m "Add damage and dice rolls, weapon pool links, notes and rituals to abilities

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: Roll lines and labels

**Files:**
- Create: `packages/rules/src/text.ts`
- Create: `packages/rules/test/text.test.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `scripts/sheet.ts`

**Interfaces:**
- Consumes: `Roll`, `DamagePart`, `AbilityName`, `SkillName`, `ABILITY_FULL` from `@cw/model`.
- Produces, exported from `@cw/rules`:
  - `rollLine(roll: Roll): string` (empty string when there is nothing to roll)
  - `spacedDice(dice: string): string`
  - `capitalise(s: string): string`
  - `abilityLabel(ability: AbilityName): string` ("Strength")
  - `skillLabel(skill: SkillName): string` ("Sleight of Hand")

- [ ] **Step 1: Write the failing test**

Create `packages/rules/test/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { abilityLabel, buildSheet, rollLine, skillLabel, spacedDice } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('labels', () => {
  it('spells out abilities and skills the way they are said at the table', () => {
    expect(abilityLabel('str')).toBe('Strength');
    expect(abilityLabel('cha')).toBe('Charisma');
    expect(skillLabel('stealth')).toBe('Stealth');
    expect(skillLabel('animal-handling')).toBe('Animal Handling');
    expect(skillLabel('sleight-of-hand')).toBe('Sleight of Hand');
  });
});

describe('spacedDice', () => {
  it('puts spaces around the sign and leaves flat numbers alone', () => {
    expect(spacedDice('1d8+3')).toBe('1d8 + 3');
    expect(spacedDice('1d8-1')).toBe('1d8 - 1');
    expect(spacedDice('2d6')).toBe('2d6');
    expect(spacedDice('4')).toBe('4');
    expect(spacedDice(' 1d10 + 9 ')).toBe('1d10 + 9');
  });
});

describe('rollLine', () => {
  it('writes an attack with its damage and optional extra damage', () => {
    expect(rollLine({
      kind: 'attack', bonus: 5,
      damage: [{ dice: '1d8+3', type: 'Piercing' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    })).toBe('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
  });

  it('writes an attack with a penalty, no bonus, or no damage listed', () => {
    expect(rollLine({ kind: 'attack', bonus: -1, damage: [{ dice: '1d4', type: null }], optionalDamage: [] }))
      .toBe('Roll d20 - 1. Hit: 1d4.');
    expect(rollLine({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] })).toBe('Roll d20.');
  });

  it('prints flat damage as a number and zero damage as no damage', () => {
    expect(rollLine({ kind: 'attack', bonus: 6, damage: [{ dice: '4', type: 'Bludgeoning' }], optionalDamage: [] }))
      .toBe('Roll d20 + 6. Hit: 4 bludgeoning.');
    expect(rollLine({ kind: 'attack', bonus: 1, damage: [{ dice: '0', type: 'Bludgeoning' }], optionalDamage: [] }))
      .toBe('Roll d20 + 1. Hit: no damage.');
  });

  it('writes a save with the ability spelled out, with and without damage', () => {
    expect(rollLine({ kind: 'save', ability: 'str', dc: 13, damage: [{ dice: '2d6', type: 'necrotic' }] }))
      .toBe('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    expect(rollLine({ kind: 'save', ability: 'wis', dc: 13, damage: [] }))
      .toBe('They roll a Wisdom save against DC 13.');
  });

  it('writes damage with no roll, bare dice, a check and nothing', () => {
    expect(rollLine({ kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] })).toBe('Damage: 1d6 necrotic.');
    expect(rollLine({ kind: 'damage', damage: [] })).toBe('');
    expect(rollLine({ kind: 'dice', dice: '1d10+9' })).toBe('Roll 1d10 + 9.');
    expect(rollLine({ kind: 'check', bonus: 3 })).toBe('Roll d20 + 3.');
    expect(rollLine({ kind: 'none' })).toBe('');
  });

  it('writes the lines the design shows for real characters', () => {
    const line = (slug: (typeof SLUGS)[number], name: string) => {
      const ability = buildSheet(convertCharacter(loadRaw(slug))).abilities.find((a) => a.name === name);
      if (!ability) throw new Error(`${slug} has no ${name}`);
      return rollLine(ability.roll);
    };
    expect(line('vlad', 'Wurms Claw - Sword')).toBe('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(line('vlad', 'Unarmed Strike')).toBe('Roll d20 + 1. Hit: no damage.');
    expect(line('vlad', 'Hex')).toBe('Damage: 1d6 necrotic.');
    expect(line('vlad', 'Arms of Hadar')).toBe('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    expect(line('danger', 'Second Wind')).toBe('Roll 1d10 + 9.');
  });

  it.each(SLUGS)('never prints a raw ability code or an undefined value: %s', (slug) => {
    for (const ability of buildSheet(convertCharacter(loadRaw(slug))).abilities) {
      const line = rollLine(ability.roll);
      expect(line).not.toMatch(/undefined|null|NaN|\b(STR|DEX|CON|INT|WIS|CHA)\b/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/rules/test/text.test.ts`
Expected: FAIL. `rollLine`, `spacedDice`, `abilityLabel` and `skillLabel` are not exported from `../src/index`.

- [ ] **Step 3: Write the implementation**

Create `packages/rules/src/text.ts`:

```ts
import { ABILITY_FULL, type AbilityName, type DamagePart, type Roll, type SkillName } from '@cw/model';

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "strength" for 'str', capitalised: the name a player hears at the table. */
export const abilityLabel = (ability: AbilityName): string => capitalise(ABILITY_FULL[ability]);

/** "Sleight of Hand" for 'sleight-of-hand'. */
export function skillLabel(skill: SkillName): string {
  return skill.split('-').map((word, index) => (index > 0 && word === 'of' ? word : capitalise(word))).join(' ');
}

/** "1d8+3" becomes "1d8 + 3". A flat number is returned unchanged. */
export function spacedDice(dice: string): string {
  return dice.trim().replace(/(?<=\S)\s*([+-])\s*/g, ' $1 ');
}

/** "Roll d20 + 5." With no bonus it is "Roll d20.", and a penalty reads "Roll d20 - 1." */
function d20(bonus: number): string {
  if (bonus === 0) return 'Roll d20.';
  return `Roll d20 ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}.`;
}

const isZero = (dice: string): boolean => /^0+$/.test(dice.trim());

/** The parts that deal something, joined: "1d8 + 3 piercing + 1d6 poison". Null when nothing is dealt. */
function damageText(parts: DamagePart[]): string | null {
  const real = parts.filter((p) => p.dice.trim() !== '' && !isZero(p.dice));
  if (real.length === 0) return null;
  return real.map((p) => `${spacedDice(p.dice)}${p.type ? ` ${p.type.toLowerCase()}` : ''}`).join(' + ');
}

/** The plain-English sentence for a roll. Empty when there is nothing to roll. */
export function rollLine(roll: Roll): string {
  switch (roll.kind) {
    case 'attack': {
      let line = d20(roll.bonus);
      if (roll.damage.length > 0) line += ` Hit: ${damageText(roll.damage) ?? 'no damage'}.`;
      const extra = damageText(roll.optionalDamage);
      if (extra) line += ` Extra: ${extra} (see the item).`;
      return line;
    }
    case 'save': {
      const damage = damageText(roll.damage);
      return `They roll a ${abilityLabel(roll.ability)} save against DC ${roll.dc}.${damage ? ` Fail: ${damage}.` : ''}`;
    }
    case 'damage': {
      const damage = damageText(roll.damage);
      return damage ? `Damage: ${damage}.` : '';
    }
    case 'dice':
      return roll.dice.trim() === '' ? '' : `Roll ${spacedDice(roll.dice)}.`;
    case 'check':
      return d20(roll.bonus);
    default:
      return '';
  }
}
```

In `packages/rules/src/index.ts`, add after `export * from './abilities';`:

```ts
export * from './text';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/rules/test/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Use `rollLine` in the sheet script**

In `scripts/sheet.ts`, replace everything from `import { buildSheet } from '@cw/rules';` down to the closing brace of the local `rollLine` function with:

```ts
import { buildSheet, rollLine } from '@cw/rules';

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));
```

(The `import type { Ability } from '@cw/model';` line and the local `rollLine` function are removed. `signed` stays: the header lines still use it.)

Replace:

```ts
  for (const a of group) console.log(`  ${a.name}${rollLine(a) ? `: ${rollLine(a)}` : ''}`);
```

with:

```ts
  for (const a of group) {
    const line = rollLine(a.roll);
    console.log(`  ${a.name}${line ? `: ${line}` : ''}`);
  }
```

- [ ] **Step 6: Check the script's output**

Run: `pnpm sheet fixtures/characters/vlad.json`
Expected, among the other lines:

```
  Wurms Claw - Sword: Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).
  Unarmed Strike: Roll d20 + 1. Hit: no damage.
  Arms of Hadar: They roll a Strength save against DC 13. Fail: 2d6 necrotic.
  Hex: Damage: 1d6 necrotic.
```

- [ ] **Step 7: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add packages/rules scripts/sheet.ts
git commit -m "Write roll lines as short sentences in the rules package

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: Conditional notes and the sheet fields the Explore view needs

**Files:**
- Create: `packages/rules/src/notes.ts`
- Create: `packages/rules/test/notes.test.ts`
- Replace: `packages/rules/src/sheet.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `scripts/sheet.ts`

**Interfaces:**
- Consumes: `capitalise`, `spacedDice` (Task 3); `skillLevel` from `./checks`; `hasModifier` from `./core`.
- Produces, exported from `@cw/rules`:
  - `type NoteTarget = { kind: 'skill'; skill: SkillName } | { kind: 'save'; ability: AbilityName } | { kind: 'other' }`
  - `interface Note { target: NoteTarget; text: string }`
  - `conditionalNotes(c: Character): Note[]`
  - `Sheet.classLine: string`, `Sheet.saveProficiency: Record<AbilityName, boolean>`, `Sheet.skillLevels: Record<SkillName, ProficiencyLevel>`, `Sheet.notes: Note[]`

- [ ] **Step 1: Write the failing test**

Create `packages/rules/test/notes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import type { Character, Modifier } from '@cw/model';
import { buildSheet, conditionalNotes } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

const modifier = (over: Partial<Modifier>): Modifier => ({
  type: 'bonus', subType: '', value: null, ability: null, dice: null,
  addProficiency: false, restriction: '', fromItem: false, componentId: null, ...over,
});

const withModifiers = (...mods: Partial<Modifier>[]): Character => {
  const c = convertCharacter({});
  c.modifiers = mods.map(modifier);
  return c;
};

describe('conditionalNotes', () => {
  it('puts unconditional advantage on its skill row and explains it', () => {
    expect(conditionalNotes(withModifiers({ type: 'advantage', subType: 'intimidation' }))).toEqual([
      { target: { kind: 'skill', skill: 'intimidation' }, text: 'Advantage (roll twice, keep the higher).' },
    ]);
  });

  it('puts conditional advantage on its saving throw row with the sheet\'s own condition', () => {
    const notes = conditionalNotes(withModifiers({
      type: 'advantage', subType: 'constitution-saving-throws',
      restriction: 'saving throws that you make to maintain Concentration.',
    }));
    expect(notes).toEqual([{
      target: { kind: 'save', ability: 'con' },
      text: 'Advantage: saving throws that you make to maintain Concentration.',
    }]);
  });

  it('trims the condition and ends it with a full stop', () => {
    const [note] = conditionalNotes(withModifiers({
      type: 'disadvantage', subType: 'stealth', restriction: '  while wearing this armour ',
    }));
    expect(note.text).toBe('Disadvantage: while wearing this armour.');
  });

  it('explains disadvantage', () => {
    const [note] = conditionalNotes(withModifiers({ type: 'disadvantage', subType: 'stealth' }));
    expect(note.text).toBe('Disadvantage (roll twice, keep the lower).');
  });

  it('names the subject of a note that belongs to no row', () => {
    const notes = conditionalNotes(withModifiers(
      { type: 'advantage', subType: 'spell-attacks', restriction: 'Advantage on Sorcerer Spell Attacks' },
      { type: 'immunity', subType: 'charmed', restriction: 'Raging' },
      { type: 'damage', subType: 'bludgeoning', dice: '1d12', restriction: 'DC 14 Dex Save' },
      { type: 'advantage', subType: 'constitution-ability-checks' },
    ));
    expect(notes.map((n) => n.target.kind)).toEqual(['other', 'other', 'other', 'other']);
    expect(notes.map((n) => n.text)).toEqual([
      'Advantage on spell attacks: Advantage on Sorcerer Spell Attacks.',
      'Immunity, charmed: Raging.',
      'Damage 1d12, bludgeoning: DC 14 Dex Save.',
      'Advantage on constitution ability checks.',
    ]);
  });

  it('shows the amount of a conditional bonus on a row', () => {
    const [note] = conditionalNotes(withModifiers({
      type: 'bonus', subType: 'stealth', value: 2, restriction: 'in dim light',
    }));
    expect(note).toEqual({ target: { kind: 'skill', skill: 'stealth' }, text: 'Bonus + 2: in dim light.' });
  });

  it('ignores modifiers that are neither conditional nor advantage', () => {
    expect(conditionalNotes(withModifiers(
      { type: 'bonus', subType: 'stealth', value: 2 },
      { type: 'proficiency', subType: 'athletics' },
    ))).toEqual([]);
  });

  it('lists the same note once', () => {
    const twice = { type: 'advantage', subType: 'intimidation' };
    expect(conditionalNotes(withModifiers(twice, twice))).toHaveLength(1);
  });

  it('survives modifier types and subtypes it has never seen', () => {
    const notes = conditionalNotes(withModifiers(
      { type: 'constructor', subType: 'toString', restriction: 'odd' },
      { type: '', subType: '', restriction: 'no type at all' },
    ));
    expect(notes.map((n) => n.text)).toEqual(['Constructor, toString: odd.', 'Note: no type at all.']);
  });

  it('finds the notes on real characters', () => {
    const notes = (slug: (typeof SLUGS)[number]) => conditionalNotes(convertCharacter(loadRaw(slug)));
    expect(notes('vlad')).toEqual([
      { target: { kind: 'skill', skill: 'intimidation' }, text: 'Advantage (roll twice, keep the higher).' },
    ]);
    expect(notes('danger')).toEqual([{
      target: { kind: 'save', ability: 'con' },
      text: 'Advantage: saving throws that you make to maintain Concentration.',
    }]);
    expect(notes('franny').map((n) => n.target.kind)).toEqual(['save', 'other', 'save', 'other', 'other']);
    expect(notes('sid')).toEqual([]);
  });
});

describe('buildSheet: what the Explore view needs', () => {
  it.each(SLUGS)('reports a proficiency level for every skill and save: %s', (slug) => {
    const sheet = buildSheet(convertCharacter(loadRaw(slug)));
    expect(Object.keys(sheet.skillLevels).sort()).toEqual(Object.keys(sheet.skills).sort());
    expect(Object.keys(sheet.saveProficiency).sort()).toEqual(Object.keys(sheet.saves).sort());
    expect(sheet.notes).toEqual(conditionalNotes(convertCharacter(loadRaw(slug))));
  });

  it('knows which skills and saves are proficient', () => {
    const vlad = buildSheet(convertCharacter(loadRaw('vlad')));
    expect(vlad.skillLevels.investigation).toBe('expertise');
    expect(vlad.skillLevels.athletics).toBe('none');
    expect(vlad.saveProficiency).toMatchObject({ wis: true, cha: true, str: false });
  });

  it('describes the class and level in one line', () => {
    expect(buildSheet(convertCharacter(loadRaw('vlad'))).classLine).toBe('Warlock 3');
    expect(buildSheet(convertCharacter(loadRaw('danger'))).classLine).toBe('Fighter 9');
    expect(buildSheet(convertCharacter({})).classLine).toBe('');
  });

  it('leaves the headline numbers as they were', () => {
    const sheet = buildSheet(convertCharacter(loadRaw('vlad')));
    expect(sheet.saves).toEqual(loadExpected('vlad').saves);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/rules/test/notes.test.ts`
Expected: FAIL. `conditionalNotes` is not exported.

- [ ] **Step 3: Write `notes.ts`**

Create `packages/rules/src/notes.ts`:

```ts
import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type AbilityName, type Character, type Modifier, type SkillName,
} from '@cw/model';
import { capitalise, spacedDice } from './text';

export type NoteTarget =
  | { kind: 'skill'; skill: SkillName }
  | { kind: 'save'; ability: AbilityName }
  | { kind: 'other' };

/** A conditional modifier the app shows but never applies to a number. */
export interface Note {
  target: NoteTarget;
  text: string;
}

const words = (kebab: string): string => kebab.replace(/-/g, ' ').trim();

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

const ROLL_TWICE: Record<string, string> = {
  advantage: 'roll twice, keep the higher',
  disadvantage: 'roll twice, keep the lower',
};

function noteTarget(subType: string): NoteTarget {
  const skill = SKILLS.find((s) => s === subType);
  if (skill) return { kind: 'skill', skill };
  const ability = ABILITIES.find((a) => `${ABILITY_FULL[a]}-saving-throws` === subType);
  if (ability) return { kind: 'save', ability };
  return { kind: 'other' };
}

/** "Advantage", "Bonus + 2", "Damage 1d12": the modifier's type and its amount, if it has one. */
function amountLabel(m: Modifier): string {
  let label = capitalise(words(m.type)) || 'Note';
  if (m.dice) label += ` ${spacedDice(m.dice)}`;
  else if (m.value !== null && m.value !== 0) label += ` ${m.value > 0 ? '+' : '-'} ${Math.abs(m.value)}`;
  return label;
}

function noteText(m: Modifier, target: NoteTarget): string {
  const restriction = m.restriction.trim();
  const rollTwice = Object.hasOwn(ROLL_TWICE, m.type) ? ROLL_TWICE[m.type] : null;
  let label = amountLabel(m);
  if (target.kind === 'other' && m.subType !== '') {
    // The row does not say what the note is about, so the note has to.
    label += rollTwice ? ` on ${words(m.subType)}` : `, ${words(m.subType)}`;
  }
  if (restriction !== '') return sentence(`${label}: ${restriction}`);
  if (rollTwice && target.kind !== 'other') return `${label} (${rollTwice}).`;
  return sentence(label);
}

/**
 * Every advantage or disadvantage modifier and every modifier with a restriction, as a note.
 * Notes on a skill or a saving throw name that row; everything else is 'other'.
 */
export function conditionalNotes(c: Character): Note[] {
  const out: Note[] = [];
  const seen = new Set<string>();
  for (const m of c.modifiers) {
    const conditional = m.restriction.trim() !== '';
    if (!conditional && !Object.hasOwn(ROLL_TWICE, m.type)) continue;
    const target = noteTarget(m.subType);
    const text = noteText(m, target);
    const id = `${JSON.stringify(target)}|${text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ target, text });
  }
  return out;
}
```

In `packages/rules/src/index.ts`, add after `export * from './text';`:

```ts
export * from './notes';
```

- [ ] **Step 4: Replace `packages/rules/src/sheet.ts`**

Replace the whole file with:

```ts
import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';

export interface Sheet {
  name: string;
  level: number;
  /** "Warlock 3". Empty when the character has no class. */
  classLine: string;
  proficiencyBonus: number;
  scores: Record<AbilityName, number>;
  saves: Record<AbilityName, number>;
  saveProficiency: Record<AbilityName, boolean>;
  skills: Record<SkillName, number>;
  skillLevels: Record<SkillName, ProficiencyLevel>;
  initiative: number;
  armorClass: number;
  attacksPerAction: number;
  spellcasting: { ability: AbilityName; attack: number; saveDc: number } | null;
  slots: Record<string, number>;
  pactSlots: { level: number; count: number } | null;
  resources: Resource[];
  abilities: Ability[];
  notes: Note[];
}

function saveProficiency(c: Character): Record<AbilityName, boolean> {
  const out = {} as Record<AbilityName, boolean>;
  for (const ability of ABILITIES) {
    out[ability] = hasModifier(c, 'proficiency', `${ABILITY_FULL[ability]}-saving-throws`);
  }
  return out;
}

function skillLevels(c: Character): Record<SkillName, ProficiencyLevel> {
  const out = {} as Record<SkillName, ProficiencyLevel>;
  for (const skill of SKILLS) out[skill] = skillLevel(c, skill);
  return out;
}

export function buildSheet(c: Character): Sheet {
  const { slots, pact } = spellSlots(c);
  return {
    name: c.name,
    level: c.level,
    classLine: c.classes.map((k) => `${k.name} ${k.level}`).join(' / '),
    proficiencyBonus: proficiencyBonus(c.level),
    scores: abilityScores(c),
    saves: savingThrows(c),
    saveProficiency: saveProficiency(c),
    skills: skills(c),
    skillLevels: skillLevels(c),
    initiative: initiative(c),
    armorClass: armorClass(c),
    attacksPerAction: attacksPerAction(c),
    spellcasting: spellcasting(c),
    slots,
    pactSlots: pact,
    resources: resources(c),
    abilities: buildAbilities(c),
    notes: conditionalNotes(c),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/rules/test/notes.test.ts`
Expected: PASS.

- [ ] **Step 6: Print notes in the sheet script**

In `scripts/sheet.ts`, add at the end of the file:

```ts

if (sheet.notes.length) {
  console.log('\n[notes]');
  for (const n of sheet.notes) {
    const about = n.target.kind === 'skill' ? `${n.target.skill}: ` : n.target.kind === 'save' ? `${n.target.ability} save: ` : '';
    console.log(`  ${about}${n.text}`);
  }
}
```

Run: `pnpm sheet fixtures/characters/vlad.json`
Expected: the output ends with

```
[notes]
  intimidation: Advantage (roll twice, keep the higher).
```

- [ ] **Step 7: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add packages/rules scripts/sheet.ts
git commit -m "Surface conditional modifiers as notes and add Explore fields to the sheet

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: Universal actions

**Files:**
- Create: `packages/rules/src/universal.ts`
- Create: `packages/rules/test/universal.test.ts`
- Modify: `packages/rules/src/sheet.ts`, `packages/rules/src/index.ts`

**Interfaces:**
- Consumes: `Ability` (Task 2).
- Produces: `universalActions(): Ability[]` exported from `@cw/rules`; `Sheet.universal: Ability[]`. Keys are `universal:<slug>:base` (for example `universal:dash:base`). `sheet.abilities` is unchanged and does not include them.

The descriptions are written in our own words from SRD 5.2. Do not paste SRD text.

- [ ] **Step 1: Write the failing test**

Create `packages/rules/test/universal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildSheet, universalActions } from '../src/index';
import { loadRaw } from '../../../test-utils/fixtures';

describe('universalActions', () => {
  it('lists the twelve actions of the 2024 rules in order', () => {
    expect(universalActions().map((a) => a.name)).toEqual([
      'Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide',
      'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize',
    ]);
  });

  it('makes each one an Action with a description, no roll and no cost', () => {
    for (const a of universalActions()) {
      expect(a).toMatchObject({
        source: 'universal', timing: 'action', roll: { kind: 'none' }, cost: { kind: 'none' },
        poolKey: null, concentration: false, ritual: false,
      });
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.key).toMatch(/^universal:[a-z]+:base$/);
    }
  });

  it('uses keys that do not collide with each other or with the sheet\'s own abilities', () => {
    const sheet = buildSheet(convertCharacter(loadRaw('vlad')));
    const keys = [...sheet.abilities, ...sheet.universal].map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(sheet.universal).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/rules/test/universal.test.ts`
Expected: FAIL. `universalActions` is not exported.

- [ ] **Step 3: Write the implementation**

Create `packages/rules/src/universal.ts`:

```ts
import type { Ability } from '@cw/model';

/**
 * The actions every character can take, summarised in our own words from SRD 5.2
 * (CC-BY-4.0; the attribution is in the README and on the About screen).
 */
const UNIVERSAL: { slug: string; name: string; description: string }[] = [
  { slug: 'attack', name: 'Attack', description: 'Attack with a weapon or an Unarmed Strike. Your weapons are listed above.' },
  { slug: 'dash', name: 'Dash', description: 'Gain extra movement equal to your Speed for the rest of this turn.' },
  { slug: 'disengage', name: 'Disengage', description: 'Your movement does not provoke Opportunity Attacks for the rest of this turn.' },
  { slug: 'dodge', name: 'Dodge', description: 'Until your next turn, attacks against you have Disadvantage if you can see the attacker, and you make Dexterity saves with Advantage.' },
  { slug: 'help', name: 'Help', description: 'Give an ally Advantage on an ability check or on their next attack against a creature within 5 feet of you.' },
  { slug: 'hide', name: 'Hide', description: 'Make a Dexterity (Stealth) check to become hidden. You need cover or heavy obscurement, out of sight of enemies.' },
  { slug: 'influence', name: 'Influence', description: 'Make a Charisma check, or a Wisdom (Animal Handling) check, to change how a creature treats you.' },
  { slug: 'magic', name: 'Magic', description: 'Cast a spell, use a magic item, or use a magical feature. Your spells are listed above.' },
  { slug: 'ready', name: 'Ready', description: 'Choose a trigger and an action. When the trigger happens before your next turn, use your Reaction to take the action.' },
  { slug: 'search', name: 'Search', description: 'Make a Wisdom check (Insight, Medicine, Perception or Survival) to notice something that is not obvious.' },
  { slug: 'study', name: 'Study', description: 'Make an Intelligence check (Arcana, History, Investigation, Nature or Religion) to recall or work something out.' },
  { slug: 'utilize', name: 'Utilize', description: 'Use an object that is not magical.' },
];

export function universalActions(): Ability[] {
  return UNIVERSAL.map((u): Ability => ({
    key: `universal:${u.slug}:base`,
    name: u.name,
    source: 'universal',
    timing: 'action',
    roll: { kind: 'none' },
    cost: { kind: 'none' },
    poolKey: null,
    tags: [],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: u.description,
    notes: [],
    tagSource: 'none',
  }));
}
```

In `packages/rules/src/index.ts`, add after `export * from './notes';`:

```ts
export * from './universal';
```

In `packages/rules/src/sheet.ts`:

Add after `import { spellSlots, spellcasting } from './spellcasting';`:

```ts
import { universalActions } from './universal';
```

In `interface Sheet`, replace the last two fields (`abilities` and `notes`) with:

```ts
  abilities: Ability[];
  /** The actions every character can take. Kept apart from `abilities`, which come from the sheet. */
  universal: Ability[];
  notes: Note[];
```

In `buildSheet`, add after `    abilities: buildAbilities(c),`:

```ts
    universal: universalActions(),
```

- [ ] **Step 4: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add packages/rules
git commit -m "Add the twelve universal actions as curated abilities

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: The turn engine

**Files:**
- Modify: `packages/model/src/index.ts` (add `TurnState`, `PlayState`)
- Create: `packages/rules/src/play.ts`, `packages/rules/src/views.ts`
- Create: `packages/rules/test/play.test.ts`, `packages/rules/test/views.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Consumes: `Sheet` (with `universal`, Task 5), `Ability`, `Resource`.
- Produces, in `@cw/model`:
  - `interface TurnState { action: boolean; bonus: boolean; reaction: boolean; slotSpentThisTurn: boolean }` (true means spent)
  - `interface PlayState { spent: Record<string, number>; concentrationKey: string | null; turn: TurnState }`
- Produces, exported from `@cw/rules`:
  - `interface Pool { key: string; name: string; max: number; reset: ResetType; kind: 'slot' | 'pact' | 'uses' }`
  - `PACT_KEY = 'pact'`, `slotKey(level: number): string`
  - `type ViewMode = 'combat' | 'explore'`, `type TurnTiming = 'action' | 'bonus' | 'reaction'`
  - `TIMING_LABEL: Record<TurnTiming, string>` ("Action", "Bonus Action", "Reaction")
  - `emptyPlayState(): PlayState`
  - `pools(sheet: Sheet): Pool[]`
  - `remaining(pool: Pool, state: PlayState): number`
  - `interface SlotOption { key: string; label: string; remaining: number }`
  - `interface Availability { hasUse: boolean; canUse: boolean; reason: string | null; slotOptions: SlotOption[]; ends: string | null }`
  - `availability(ability, sheet, state, mode?: ViewMode): Availability`
  - `applyUse(ability, sheet, state, mode?: ViewMode, slot?: string): PlayState` (returns the same object when the ability cannot be used)
  - `startTurn(state)`, `rest(kind: 'short' | 'long', sheet, state)`, `adjustPool(state, pool, delta)`, `togglePill(state, timing)`, `endConcentration(state)`, `clampState(state, sheet)`; each returns a new `PlayState`
  - `costLabel(ability, sheet, state): string | null`
  - `useSummary(ability, sheet, before, after): string`
  - `interface CombatGroups { action; bonus; reaction; free; other }` (each `Ability[]`), `combatGroups(sheet)`, `exploreAbilities(sheet): Ability[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/rules/test/play.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  PACT_KEY, adjustPool, applyUse, availability, buildSheet, clampState, costLabel, emptyPlayState,
  endConcentration, pools, remaining, rest, slotKey, startTurn, togglePill, useSummary, type Sheet,
} from '../src/index';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));

/** The ability with this name; `cost` picks between two abilities that share a name. */
function find(sheet: Sheet, name: string, cost?: Ability['cost']['kind']): Ability {
  const found = [...sheet.abilities, ...sheet.universal].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}${cost ? ` with cost ${cost}` : ''}`);
  return found;
}

const poolOf = (sheet: Sheet, name: string) => {
  const pool = pools(sheet).find((p) => p.name === name);
  if (!pool) throw new Error(`no pool ${name}`);
  return pool;
};

describe('pools', () => {
  it('lists pact slots as a short-rest pool before the other pools', () => {
    const list = pools(sheetOf('vlad'));
    expect(list[0]).toEqual({ key: PACT_KEY, name: 'Pact slots', max: 2, reset: 'short', kind: 'pact' });
    expect(list.map((p) => p.name)).toContain('Wurms Claw - Sword');
  });

  it('lists each spell slot level, lowest first, as a long-rest pool', () => {
    expect(pools(sheetOf('minkis')).slice(0, 2)).toEqual([
      { key: slotKey(1), name: 'Level 1 slots', max: 4, reset: 'long', kind: 'slot' },
      { key: slotKey(2), name: 'Level 2 slots', max: 2, reset: 'long', kind: 'slot' },
    ]);
  });

  it.each(SLUGS)('has unique keys and no empty pool: %s', (slug) => {
    const list = pools(sheetOf(slug));
    expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
    expect(list.filter((p) => p.max <= 0)).toEqual([]);
  });

  it('counts what is left from what is spent', () => {
    const sheet = sheetOf('vlad');
    const pact = poolOf(sheet, 'Pact slots');
    expect(remaining(pact, emptyPlayState())).toBe(2);
    expect(remaining(pact, { ...emptyPlayState(), spent: { [PACT_KEY]: 5 } })).toBe(0);
  });
});

describe('availability and applyUse in combat', () => {
  const vlad = sheetOf('vlad');
  const hex = find(vlad, 'Hex');
  const blast = find(vlad, 'Eldritch Blast');
  const arms = find(vlad, 'Arms of Hadar');
  const freeMisty = find(vlad, 'Misty Step', 'uses');
  const slotMisty = find(vlad, 'Misty Step', 'slot');
  const rebuke = find(vlad, 'Hellish Rebuke', 'slot');

  it('allows Hex and then Eldritch Blast', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(afterHex).toEqual({
      spent: { [PACT_KEY]: 1 },
      concentrationKey: hex.key,
      turn: { action: false, bonus: true, reaction: false, slotSpentThisTurn: true },
    });
    expect(availability(blast, vlad, afterHex)).toMatchObject({ hasUse: true, canUse: true, reason: null });
    expect(applyUse(blast, vlad, afterHex).turn.action).toBe(true);
  });

  it('blocks Hex and then Arms of Hadar: two spell slots in one turn', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(availability(arms, vlad, afterHex)).toMatchObject({
      canUse: false, reason: 'You already spent a spell slot this turn.',
    });
    expect(applyUse(arms, vlad, afterHex)).toBe(afterHex);
  });

  it('allows a free Misty Step and then Arms of Hadar', () => {
    const afterStep = applyUse(freeMisty, vlad, emptyPlayState());
    expect(afterStep.spent).toEqual({ [freeMisty.key]: 1 });
    expect(afterStep.turn).toMatchObject({ bonus: true, slotSpentThisTurn: false });
    expect(availability(arms, vlad, afterStep).canUse).toBe(true);
  });

  it('blocks a second Bonus Action and says why', () => {
    const afterStep = applyUse(freeMisty, vlad, emptyPlayState());
    expect(availability(slotMisty, vlad, afterStep)).toMatchObject({
      canUse: false, reason: 'You already used your Bonus Action this turn.',
    });
  });

  it('lets a Reaction spell ignore and not set the one-slot rule', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(availability(rebuke, vlad, afterHex).canUse).toBe(true);
    const afterRebuke = applyUse(rebuke, vlad, emptyPlayState());
    expect(afterRebuke.turn).toMatchObject({ reaction: true, slotSpentThisTurn: false });
    expect(afterRebuke.spent).toEqual({ [PACT_KEY]: 1 });
  });

  it('blocks a slot spell when no slot is left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { [PACT_KEY]: 2 } };
    expect(availability(arms, vlad, state)).toMatchObject({ canUse: false, reason: 'No spell slots left.', slotOptions: [] });
  });

  it('blocks a limited-use ability when no use is left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { [freeMisty.key]: 3 } };
    expect(availability(freeMisty, vlad, state)).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('warns that a second concentration spell ends the first, and switches', () => {
    const darkness = find(vlad, 'Darkness');
    const afterHex = startTurn(applyUse(hex, vlad, emptyPlayState()));
    expect(availability(darkness, vlad, afterHex)).toMatchObject({ canUse: true, ends: 'Hex' });
    expect(availability(hex, vlad, afterHex).ends).toBeNull();
    expect(applyUse(darkness, vlad, afterHex).concentrationKey).toBe(darkness.key);
  });

  it('gives no Use button to an ability with nothing to spend or track', () => {
    const sid = sheetOf('sid');
    expect(availability(find(sid, 'Sneak Attack'), sid, emptyPlayState())).toMatchObject({
      hasUse: false, canUse: false, reason: null,
    });
  });

  it('uses a free-timing feature without touching the turn', () => {
    const danger = sheetOf('danger');
    const surge = find(danger, 'Action Surge');
    const after = applyUse(surge, danger, emptyPlayState());
    expect(after.spent).toEqual({ [surge.key]: 1 });
    expect(after.turn).toEqual(emptyPlayState().turn);
    expect(availability(surge, danger, after)).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('spends the Action for a universal action and for a weapon, never the weapon\'s charges', () => {
    const afterDash = applyUse(find(vlad, 'Dash'), vlad, emptyPlayState());
    expect(afterDash).toMatchObject({ spent: {}, turn: { action: true } });
    const afterSword = applyUse(find(vlad, 'Wurms Claw - Sword'), vlad, emptyPlayState());
    expect(afterSword).toMatchObject({ spent: {}, turn: { action: true } });
  });
});

describe('slot choice', () => {
  const minkis = sheetOf('minkis');
  const orb = find(minkis, 'Chromatic Orb');
  const spike = find(minkis, 'Mind Spike');

  it('offers every slot level that could pay, lowest first', () => {
    expect(availability(orb, minkis, emptyPlayState()).slotOptions).toEqual([
      { key: 'slot:1', label: 'Level 1 slot', remaining: 4 },
      { key: 'slot:2', label: 'Level 2 slot', remaining: 2 },
    ]);
    expect(availability(spike, minkis, emptyPlayState()).slotOptions).toEqual([
      { key: 'slot:2', label: 'Level 2 slot', remaining: 2 },
    ]);
  });

  it('spends the lowest slot unless told otherwise', () => {
    expect(applyUse(orb, minkis, emptyPlayState()).spent).toEqual({ 'slot:1': 1 });
    expect(applyUse(orb, minkis, emptyPlayState(), 'combat', 'slot:2').spent).toEqual({ 'slot:2': 1 });
    expect(applyUse(orb, minkis, emptyPlayState(), 'combat', 'slot:9').spent).toEqual({ 'slot:1': 1 });
  });

  it('leaves out a level with nothing left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { 'slot:1': 4 } };
    expect(availability(orb, minkis, state).slotOptions.map((o) => o.key)).toEqual(['slot:2']);
  });

  it('offers the pact slot when its level is high enough', () => {
    const vlad = sheetOf('vlad');
    expect(availability(find(vlad, 'Hex'), vlad, emptyPlayState()).slotOptions).toEqual([
      { key: PACT_KEY, label: 'Pact slot (level 2)', remaining: 2 },
    ]);
  });
});

describe('explore mode', () => {
  const vlad = sheetOf('vlad');

  it('deducts the cost and sets concentration but leaves the turn alone', () => {
    const charm = find(vlad, 'Charm Person');
    const spentTurn: PlayState = {
      ...emptyPlayState(), turn: { action: true, bonus: true, reaction: true, slotSpentThisTurn: true },
    };
    expect(availability(charm, vlad, spentTurn, 'explore').canUse).toBe(true);
    const after = applyUse(charm, vlad, spentTurn, 'explore');
    expect(after.spent).toEqual({ [PACT_KEY]: 1 });
    expect(after.turn).toEqual(spentTurn.turn);
  });

  it('gives no Use button to an ability that costs nothing', () => {
    expect(availability(find(vlad, 'Thaumaturgy'), vlad, emptyPlayState(), 'explore').hasUse).toBe(false);
    expect(availability(find(vlad, 'Thaumaturgy'), vlad, emptyPlayState(), 'combat').hasUse).toBe(true);
  });
});

describe('startTurn, togglePill and endConcentration', () => {
  it('resets the turn and keeps everything else', () => {
    const vlad = sheetOf('vlad');
    const afterHex = applyUse(find(vlad, 'Hex'), vlad, emptyPlayState());
    const next = startTurn(afterHex);
    expect(next.turn).toEqual(emptyPlayState().turn);
    expect(next.spent).toEqual(afterHex.spent);
    expect(next.concentrationKey).toBe(afterHex.concentrationKey);
  });

  it('flips one pill', () => {
    const once = togglePill(emptyPlayState(), 'action');
    expect(once.turn).toMatchObject({ action: true, bonus: false, reaction: false });
    expect(togglePill(once, 'action').turn.action).toBe(false);
  });

  it('ends concentration', () => {
    expect(endConcentration({ ...emptyPlayState(), concentrationKey: 'x' }).concentrationKey).toBeNull();
  });
});

describe('rest', () => {
  const danger = sheetOf('danger');
  const surge = poolOf(danger, 'Action Surge');
  const wind = poolOf(danger, 'Second Wind');
  const used: PlayState = {
    spent: { [surge.key]: 1, [wind.key]: 2, 'slot:1': 3 },
    concentrationKey: 'something',
    turn: { action: true, bonus: true, reaction: true, slotSpentThisTurn: true },
  };

  it('restores only short-rest pools on a Short Rest', () => {
    expect(rest('short', danger, used)).toEqual({
      spent: { [wind.key]: 2, 'slot:1': 3 },
      concentrationKey: 'something',
      turn: emptyPlayState().turn,
    });
  });

  it('restores everything and ends concentration on a Long Rest', () => {
    expect(rest('long', danger, used)).toEqual(emptyPlayState());
  });

  it('restores pact slots on a Short Rest', () => {
    const vlad = sheetOf('vlad');
    const state: PlayState = { ...emptyPlayState(), spent: { [PACT_KEY]: 2, [poolOf(vlad, 'Luck Points').key]: 1 } };
    expect(rest('short', vlad, state).spent).toEqual({ [poolOf(vlad, 'Luck Points').key]: 1 });
  });

  it('never restores a consumable or a pool with an unknown reset', () => {
    const sheet = sheetOf('vlad');
    sheet.resources = [
      { key: 'potion', name: 'Potion', max: 1, reset: 'never' },
      { key: 'mystery', name: 'Mystery', max: 2, reset: 'unknown' },
    ];
    const state: PlayState = { ...emptyPlayState(), spent: { potion: 1, mystery: 2 } };
    expect(rest('long', sheet, state).spent).toEqual({ potion: 1, mystery: 2 });
  });

  it.each(SLUGS)('a Long Rest after spending everything restores every restorable pool: %s', (slug) => {
    const sheet = sheetOf(slug);
    const spent = Object.fromEntries(pools(sheet).map((p) => [p.key, p.max]));
    const rested = rest('long', sheet, { ...emptyPlayState(), spent });
    for (const pool of pools(sheet)) {
      const restorable = pool.reset === 'short' || pool.reset === 'long';
      expect(remaining(pool, rested)).toBe(restorable ? pool.max : 0);
    }
  });
});

describe('adjustPool', () => {
  const vlad = sheetOf('vlad');
  const sword = poolOf(vlad, 'Wurms Claw - Sword');

  it('spends and restores one, and never leaves the pool\'s range', () => {
    const one = adjustPool(emptyPlayState(), sword, 1);
    expect(one.spent).toEqual({ [sword.key]: 1 });
    expect(adjustPool(one, sword, -1).spent).toEqual({});
    expect(adjustPool(emptyPlayState(), sword, -1).spent).toEqual({});
    const full = adjustPool(adjustPool(adjustPool(one, sword, 1), sword, 1), sword, 1);
    expect(full.spent).toEqual({ [sword.key]: 3 });
  });
});

describe('clampState', () => {
  it('clamps to the new maximum, drops unknown pools and forgets a missing concentration', () => {
    const vlad = sheetOf('vlad');
    const state: PlayState = {
      spent: { [PACT_KEY]: 7, 'slot:3': 1, gone: 2, [poolOf(vlad, 'Luck Points').key]: 1 },
      concentrationKey: 'spell:not-there',
      turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: false },
    };
    expect(clampState(state, vlad)).toEqual({
      spent: { [PACT_KEY]: 2, [poolOf(vlad, 'Luck Points').key]: 1 },
      concentrationKey: null,
      turn: state.turn,
    });
  });

  it('keeps a concentration that still exists', () => {
    const vlad = sheetOf('vlad');
    const hex = find(vlad, 'Hex');
    expect(clampState({ ...emptyPlayState(), concentrationKey: hex.key }, vlad).concentrationKey).toBe(hex.key);
  });
});

describe('costLabel', () => {
  it('tells the two Misty Steps apart', () => {
    const vlad = sheetOf('vlad');
    expect(costLabel(find(vlad, 'Misty Step', 'slot'), vlad, emptyPlayState())).toBe('pact slot');
    expect(costLabel(find(vlad, 'Misty Step', 'uses'), vlad, emptyPlayState())).toBe('free cast, 3 left');
  });

  it('labels spell slots, feature uses and item charges, and nothing for a free ability', () => {
    const minkis = sheetOf('minkis');
    expect(costLabel(find(minkis, 'Chromatic Orb'), minkis, emptyPlayState())).toBe('spell slot');
    const danger = sheetOf('danger');
    const wind = find(danger, 'Second Wind');
    expect(costLabel(wind, danger, { ...emptyPlayState(), spent: { [wind.key]: 1 } })).toBe('2 left');
    const maya = sheetOf('maya');
    expect(costLabel(find(maya, 'Scorching Ray'), maya, emptyPlayState())).toBe('1 charge of Shepherds Staff, 1 left');
    const vlad = sheetOf('vlad');
    expect(costLabel(find(vlad, 'Eldritch Blast'), vlad, emptyPlayState())).toBeNull();
  });
});

describe('useSummary', () => {
  it('says what a Use spent', () => {
    const vlad = sheetOf('vlad');
    const hex = find(vlad, 'Hex');
    const before = emptyPlayState();
    expect(useSummary(hex, vlad, before, applyUse(hex, vlad, before))).toBe('Used Hex. Spent: Bonus Action, a pact slot.');
    const step = find(vlad, 'Misty Step', 'uses');
    expect(useSummary(step, vlad, before, applyUse(step, vlad, before)))
      .toBe('Used Misty Step. Spent: Bonus Action, one use of Misty Step.');
    const minkis = sheetOf('minkis');
    const orb = find(minkis, 'Chromatic Orb');
    expect(useSummary(orb, minkis, before, applyUse(orb, minkis, before, 'combat', 'slot:2')))
      .toBe('Used Chromatic Orb. Spent: Action, a level 2 slot.');
    expect(useSummary(hex, vlad, before, before)).toBe('Used Hex.');
  });
});
```

Create `packages/rules/test/views.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildSheet, combatGroups, exploreAbilities } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

const sheetOf = (slug: (typeof SLUGS)[number]) => buildSheet(convertCharacter(loadRaw(slug)));

describe('combatGroups', () => {
  it('groups by timing and keeps the sheet\'s order', () => {
    const groups = combatGroups(sheetOf('vlad'));
    expect(groups.action.slice(0, 4).map((a) => a.name)).toEqual([
      'Wurms Claw - Sword', 'Wurms Claw - Axe', 'Wurms Claw - Hammer', 'Unarmed Strike',
    ]);
    expect(groups.bonus.map((a) => a.name)).toEqual([
      'Hex', 'Misty Step', 'Misty Step', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    expect(groups.reaction.map((a) => a.name)).toEqual(['Hellish Rebuke', 'Hellish Rebuke']);
    expect(groups.free.map((a) => a.name)).toContain('Luck Points');
    expect(groups.other).toEqual([]);
  });

  it('puts abilities with unknown timing in other', () => {
    expect(combatGroups(sheetOf('franny')).other.map((a) => a.name)).toEqual(['Twig Attack', 'Twig Attack']);
  });

  it.each(SLUGS)('leaves out only the abilities that take a minute or more: %s', (slug) => {
    const sheet = sheetOf(slug);
    const groups = combatGroups(sheet);
    const shown = Object.values(groups).reduce((n, list) => n + list.length, 0);
    expect(shown).toBe(sheet.abilities.filter((a) => a.timing !== 'long').length);
  });
});

describe('exploreAbilities', () => {
  it('lists utility, social and movement abilities, rituals and long abilities', () => {
    expect(exploreAbilities(sheetOf('vlad')).map((a) => a.name)).toEqual([
      'Charm Person', 'Misty Step', 'Phantasmal Force', 'Misty Step', 'Magical Cunning',
    ]);
    expect(exploreAbilities(sheetOf('minkis')).map((a) => a.name)).toEqual([
      'Feather Fall', 'Find Familiar', 'Detect Magic', 'Identify', 'Mind Spike', 'Message', 'Mage Hand',
    ]);
  });

  it('leaves out an untagged feature with a combat timing', () => {
    expect(exploreAbilities(sheetOf('danger')).map((a) => a.name)).not.toContain('Second Wind');
    expect(exploreAbilities(sheetOf('franny')).map((a) => a.name)).toEqual(['Beast Sense', 'Speak with Animals']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/rules/test/play.test.ts packages/rules/test/views.test.ts`
Expected: FAIL. None of the engine functions is exported.

- [ ] **Step 3: Add the play state types to the model**

Add at the end of `packages/model/src/index.ts`:

```ts

/** Which parts of the current turn are used up. True means spent. */
export interface TurnState {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /** A spell slot was spent this turn; only one may be. */
  slotSpentThisTurn: boolean;
}

/** Everything the app tracks during play. A new character starts with nothing spent. */
export interface PlayState {
  /** Pool key to the number spent. Keys: an ability or item key, `slot:1`..`slot:9`, or `pact`. */
  spent: Record<string, number>;
  /** Key of the ability being concentrated on. */
  concentrationKey: string | null;
  turn: TurnState;
}
```

- [ ] **Step 4: Write the engine**

Create `packages/rules/src/play.ts`:

```ts
import type { Ability, PlayState, ResetType, Timing, TurnState } from '@cw/model';
import type { Sheet } from './sheet';

/** One limited pool: a spell slot level, the pact slots, or a feature, free cast or item. */
export interface Pool {
  key: string;
  name: string;
  max: number;
  reset: ResetType;
  kind: 'slot' | 'pact' | 'uses';
}

export const PACT_KEY = 'pact';
export const slotKey = (level: number): string => `slot:${level}`;

/** Combat tracks the turn. Explore only deducts costs. */
export type ViewMode = 'combat' | 'explore';

export type TurnTiming = 'action' | 'bonus' | 'reaction';

export const TIMING_LABEL: Record<TurnTiming, string> = {
  action: 'Action',
  bonus: 'Bonus Action',
  reaction: 'Reaction',
};

const isTurnTiming = (t: Timing): t is TurnTiming => t === 'action' || t === 'bonus' || t === 'reaction';

const freshTurn = (): TurnState => ({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });

export const emptyPlayState = (): PlayState => ({ spent: {}, concentrationKey: null, turn: freshTurn() });

/** Spell slots lowest level first, then pact slots, then every other pool in sheet order. */
export function pools(sheet: Sheet): Pool[] {
  const out: Pool[] = [];
  const levels = Object.keys(sheet.slots).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  for (const level of levels) {
    out.push({ key: slotKey(level), name: `Level ${level} slots`, max: sheet.slots[String(level)], reset: 'long', kind: 'slot' });
  }
  if (sheet.pactSlots) {
    out.push({ key: PACT_KEY, name: 'Pact slots', max: sheet.pactSlots.count, reset: 'short', kind: 'pact' });
  }
  for (const r of sheet.resources) out.push({ ...r, kind: 'uses' });
  return out;
}

export function remaining(pool: Pool, state: PlayState): number {
  return Math.max(0, pool.max - (state.spent[pool.key] ?? 0));
}

export interface SlotOption {
  key: string;
  label: string;
  remaining: number;
}

export interface Availability {
  /** The row has a Use button at all. False for an ability with nothing to spend or track. */
  hasUse: boolean;
  /** Use is allowed right now. */
  canUse: boolean;
  /** Why Use is blocked; null when it is allowed or there is no Use button. */
  reason: string | null;
  /** The slots that could pay, lowest first. Empty unless the cost is a spell slot. */
  slotOptions: SlotOption[];
  /** The name of the concentration effect that using this would end. */
  ends: string | null;
}

const SPENT_REASON: Record<TurnTiming, string> = {
  action: 'You already used your Action this turn.',
  bonus: 'You already used your Bonus Action this turn.',
  reaction: 'You already used your Reaction this round.',
};

function slotOptions(ability: Ability, sheet: Sheet, state: PlayState): SlotOption[] {
  if (ability.cost.kind !== 'slot') return [];
  const min = Math.max(1, ability.cost.minLevel);
  const out: SlotOption[] = [];
  for (const pool of pools(sheet)) {
    const left = remaining(pool, state);
    if (left === 0) continue;
    if (pool.kind === 'slot') {
      const level = Number(pool.key.slice('slot:'.length));
      if (level >= min) out.push({ key: pool.key, label: `Level ${level} slot`, remaining: left });
    } else if (pool.kind === 'pact' && sheet.pactSlots && sheet.pactSlots.level >= min) {
      out.push({ key: pool.key, label: `Pact slot (level ${sheet.pactSlots.level})`, remaining: left });
    }
  }
  return out;
}

function concentrationName(sheet: Sheet, key: string): string {
  return sheet.abilities.find((a) => a.key === key)?.name ?? 'current concentration';
}

export function availability(ability: Ability, sheet: Sheet, state: PlayState, mode: ViewMode = 'combat'): Availability {
  const turnTiming = mode === 'combat' && isTurnTiming(ability.timing) ? ability.timing : null;
  const hasUse = turnTiming !== null || ability.cost.kind !== 'none' || ability.concentration;
  const options = slotOptions(ability, sheet, state);
  const current = state.concentrationKey;
  const ends = ability.concentration && current !== null && current !== ability.key
    ? concentrationName(sheet, current)
    : null;
  const blocked = (reason: string | null): Availability => ({ hasUse, canUse: false, reason, slotOptions: options, ends });

  if (!hasUse) return blocked(null);
  if (turnTiming && state.turn[turnTiming]) return blocked(SPENT_REASON[turnTiming]);
  if (ability.cost.kind === 'uses') {
    const key = ability.cost.resourceKey;
    const pool = pools(sheet).find((p) => p.key === key);
    if (pool && remaining(pool, state) === 0) return blocked('No uses left.');
  }
  if (ability.cost.kind === 'slot') {
    if (options.length === 0) return blocked('No spell slots left.');
    // Reaction spells are exempt: they are normally cast on another creature's turn.
    if (mode === 'combat' && ability.timing !== 'reaction' && state.turn.slotSpentThisTurn) {
      return blocked('You already spent a spell slot this turn.');
    }
  }
  return { hasUse, canUse: true, reason: null, slotOptions: options, ends };
}

/**
 * The state after using the ability. `slot` picks which slot pays; without it the lowest pays.
 * Returns the same state when the ability cannot be used.
 */
export function applyUse(
  ability: Ability, sheet: Sheet, state: PlayState, mode: ViewMode = 'combat', slot?: string,
): PlayState {
  const a = availability(ability, sheet, state, mode);
  if (!a.canUse) return state;
  const next: PlayState = { spent: { ...state.spent }, concentrationKey: state.concentrationKey, turn: { ...state.turn } };
  const spend = (key: string): void => {
    next.spent[key] = (next.spent[key] ?? 0) + 1;
  };
  if (mode === 'combat' && isTurnTiming(ability.timing)) next.turn[ability.timing] = true;
  if (ability.cost.kind === 'uses') spend(ability.cost.resourceKey);
  if (ability.cost.kind === 'slot') {
    const chosen = a.slotOptions.find((o) => o.key === slot) ?? a.slotOptions[0];
    spend(chosen.key);
    if (mode === 'combat' && ability.timing !== 'reaction') next.turn.slotSpentThisTurn = true;
  }
  if (ability.concentration) next.concentrationKey = ability.key;
  return next;
}

export function startTurn(state: PlayState): PlayState {
  return { ...state, turn: freshTurn() };
}

/**
 * A Short Rest restores short-rest pools, which include pact slots. A Long Rest restores those and
 * long-rest pools, and ends concentration. Consumables and pools with an unknown reset are left alone.
 */
export function rest(kind: 'short' | 'long', sheet: Sheet, state: PlayState): PlayState {
  const spent = { ...state.spent };
  for (const pool of pools(sheet)) {
    if (pool.reset === 'short' || (kind === 'long' && pool.reset === 'long')) delete spent[pool.key];
  }
  return { spent, concentrationKey: kind === 'long' ? null : state.concentrationKey, turn: freshTurn() };
}

/** A tap on a pool's pips: `delta` +1 spends one, -1 restores one. Never leaves 0..max. */
export function adjustPool(state: PlayState, pool: Pool, delta: number): PlayState {
  const value = Math.min(pool.max, Math.max(0, (state.spent[pool.key] ?? 0) + delta));
  const spent = { ...state.spent };
  if (value === 0) delete spent[pool.key];
  else spent[pool.key] = value;
  return { ...state, spent };
}

export function togglePill(state: PlayState, timing: TurnTiming): PlayState {
  return { ...state, turn: { ...state.turn, [timing]: !state.turn[timing] } };
}

export function endConcentration(state: PlayState): PlayState {
  return { ...state, concentrationKey: null };
}

/** After a re-import: clamp to the new maximums, forget pools and concentration that no longer exist. */
export function clampState(state: PlayState, sheet: Sheet): PlayState {
  const spent: Record<string, number> = {};
  for (const pool of pools(sheet)) {
    const value = Math.min(pool.max, Math.max(0, Math.floor(state.spent[pool.key] ?? 0)));
    if (value > 0) spent[pool.key] = value;
  }
  const concentrating = state.concentrationKey !== null && sheet.abilities.some((a) => a.key === state.concentrationKey);
  return { spent, concentrationKey: concentrating ? state.concentrationKey : null, turn: { ...state.turn } };
}

/** The short label that tells two rows with the same name apart: "pact slot", "free cast, 3 left". */
export function costLabel(ability: Ability, sheet: Sheet, state: PlayState): string | null {
  if (ability.cost.kind === 'slot') {
    return sheet.pactSlots && Object.keys(sheet.slots).length === 0 ? 'pact slot' : 'spell slot';
  }
  if (ability.cost.kind === 'uses') {
    const key = ability.cost.resourceKey;
    const pool = pools(sheet).find((p) => p.key === key);
    if (!pool) return null;
    const left = `${remaining(pool, state)} left`;
    if (key !== ability.key) return `1 charge of ${pool.name}, ${left}`;
    return ability.source === 'spell' ? `free cast, ${left}` : left;
  }
  return null;
}

/** "Used Hex. Spent: Bonus Action, a pact slot." Compares the state before and after a Use. */
export function useSummary(ability: Ability, sheet: Sheet, before: PlayState, after: PlayState): string {
  const parts: string[] = [];
  for (const timing of ['action', 'bonus', 'reaction'] as const) {
    if (!before.turn[timing] && after.turn[timing]) parts.push(TIMING_LABEL[timing]);
  }
  for (const pool of pools(sheet)) {
    if ((after.spent[pool.key] ?? 0) <= (before.spent[pool.key] ?? 0)) continue;
    if (pool.kind === 'slot') parts.push(`a level ${pool.key.slice('slot:'.length)} slot`);
    else if (pool.kind === 'pact') parts.push('a pact slot');
    else parts.push(`one use of ${pool.name}`);
  }
  return parts.length > 0 ? `Used ${ability.name}. Spent: ${parts.join(', ')}.` : `Used ${ability.name}.`;
}
```

Create `packages/rules/src/views.ts`:

```ts
import type { Ability, Tag } from '@cw/model';
import type { Sheet } from './sheet';

export interface CombatGroups {
  action: Ability[];
  bonus: Ability[];
  reaction: Ability[];
  /** "No action needed": timing free or passive. */
  free: Ability[];
  /** Timing the import could not tell. */
  other: Ability[];
}

/** Everything except abilities that take a minute or more, grouped by when they can be used. */
export function combatGroups(sheet: Sheet): CombatGroups {
  const groups: CombatGroups = { action: [], bonus: [], reaction: [], free: [], other: [] };
  for (const a of sheet.abilities) {
    if (a.timing === 'action' || a.timing === 'bonus' || a.timing === 'reaction') groups[a.timing].push(a);
    else if (a.timing === 'free' || a.timing === 'passive') groups.free.push(a);
    else if (a.timing === 'unknown') groups.other.push(a);
  }
  return groups;
}

const EXPLORE_TAGS: Tag[] = ['utility', 'social', 'movement'];

/** Abilities tagged utility, social or movement, rituals, and anything taking a minute or more. */
export function exploreAbilities(sheet: Sheet): Ability[] {
  return sheet.abilities.filter(
    (a) => a.timing === 'long' || a.ritual || a.tags.some((t) => EXPLORE_TAGS.includes(t)),
  );
}
```

In `packages/rules/src/index.ts`, add after `export * from './sheet';`:

```ts
export * from './play';
export * from './views';
```

The file now reads:

```ts
export * from './core';
export * from './checks';
export * from './defence';
export * from './attacks';
export * from './spellcasting';
export * from './resources';
export * from './tags';
export * from './abilities';
export * from './text';
export * from './notes';
export * from './universal';
export * from './sheet';
export * from './play';
export * from './views';
```

- [ ] **Step 5: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add packages/model packages/rules
git commit -m "Add the turn engine: pools, availability, use, rests and view groups

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: The import handler and the Edge Function

The handler uses only `Request`, `Response`, `fetch` and `AbortSignal`. It must import nothing, so that Deno, Node and Vitest can all load the same file.

**Files:**
- Create: `supabase/functions/_shared/import-handler.ts`
- Create: `supabase/functions/_shared/import-handler.test.ts`
- Create: `supabase/functions/import-character/index.ts`
- Modify: `vitest.config.ts`, `tsconfig.json`

**Interfaces:**
- Consumes: nothing from the packages.
- Produces, from `supabase/functions/_shared/import-handler.ts`:
  - `CHARACTER_ENDPOINT: string`
  - `type ImportStatus = 'ok' | 'private' | 'not-found' | 'upstream-error' | 'bad-request' | 'unauthorized'`
  - `interface ImportOptions { allowedOrigins: string[]; apiKey?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number }`
  - `handleImport(req: Request, options: ImportOptions): Promise<Response>`
- Wire format: request `POST` with JSON body `{ "id": "<1 to 12 digits>" }`; response JSON `{ "status": ImportStatus, "raw"?: unknown }` with HTTP 200 (`ok`), 400 (`bad-request`), 401 or 403 (`unauthorized`), 403 (`private`), 404 (`not-found`), 405 (`bad-request`) or 502 (`upstream-error`).

- [ ] **Step 1: Let Vitest and tsc see the handler**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'scripts/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
  },
});
```

Replace `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": [
    "packages/*/src",
    "packages/*/test",
    "scripts",
    "test-utils",
    "supabase/functions/_shared",
    "vitest.config.ts"
  ]
}
```

(`allowImportingTsExtensions` is needed because Deno requires the `.ts` extension in imports. `supabase/functions/import-character/index.ts` is deliberately not included: it uses the `Deno` global, which Node's types do not have.)

- [ ] **Step 2: Write the failing test**

Create `supabase/functions/_shared/import-handler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_ENDPOINT, handleImport, type ImportOptions } from './import-handler.ts';

const APP = 'https://app.example';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://x.example/functions/v1/import-character', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** An upstream that answers every request with this status and body. */
function upstream(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

const options = (over: Partial<ImportOptions> = {}): ImportOptions => ({ allowedOrigins: [APP], ...over });

describe('handleImport', () => {
  it('fetches the character by ID and returns the raw JSON', async () => {
    const fetchImpl = upstream(200, { id: 42, data: { name: 'Test' } });
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', raw: { id: 42, data: { name: 'Test' } } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${CHARACTER_ENDPOINT}42`);
  });

  it('sends no cookies, no credentials and no headers beyond Accept', async () => {
    const fetchImpl = upstream(200, {});
    await handleImport(post({ id: '42' }, { cookie: 'session=abc', authorization: 'Bearer user-token' }), options({ fetchImpl }));
    const init = fetchImpl.mock.calls[0][1] ?? {};
    expect(Object.keys(init).sort()).toEqual(['headers', 'signal']);
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it.each([
    [403, 403, 'private'],
    [404, 404, 'not-found'],
    [500, 502, 'upstream-error'],
    [429, 502, 'upstream-error'],
  ])('maps upstream %i to %i %s', async (upstreamStatus, status, name) => {
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: upstream(upstreamStatus) }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ status: name });
  });

  it('reports an upstream error when the fetch fails or the body is not JSON', async () => {
    const failing = vi.fn(async () => { throw new Error('network down'); });
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: failing }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ status: 'upstream-error' });
    const html = await handleImport(post({ id: '42' }), options({ fetchImpl: upstream(200, '<html>') }));
    expect(await html.json()).toEqual({ status: 'upstream-error' });
  });

  it('gives up on an upstream that does not answer in time', async () => {
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: hanging, timeoutMs: 20 }));
    expect(await res.json()).toEqual({ status: 'upstream-error' });
  });

  it.each([
    [{ id: 42 }],
    [{ id: '' }],
    [{ id: '12a' }],
    [{ id: '1234567890123' }],
    [{ id: '42/../../admin' }],
    [{ id: 'https://evil.example/' }],
    [{}],
    [null],
    ['not json'],
  ])('rejects a body that is not a 1 to 12 digit ID and fetches nothing: %j', async (body) => {
    const fetchImpl = upstream(200);
    const res = await handleImport(post(body), options({ fetchImpl }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: 'bad-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects methods other than POST and OPTIONS', async () => {
    const fetchImpl = upstream(200);
    const req = new Request('https://x.example/f?id=42', { method: 'GET', headers: { origin: APP } });
    const res = await handleImport(req, options({ fetchImpl }));
    expect(res.status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers a preflight from a listed origin', async () => {
    const req = new Request('https://x.example/f', { method: 'OPTIONS', headers: { origin: APP } });
    const res = await handleImport(req, options());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('access-control-allow-headers')).toContain('apikey');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });

  it('puts the CORS headers on every answer to a listed origin', async () => {
    const res = await handleImport(post({ id: 'x' }), options());
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('refuses an origin that is not listed, without fetching', async () => {
    const fetchImpl = upstream(200);
    const res = await handleImport(post({ id: '42' }, { origin: 'https://other.example' }), options({ fetchImpl }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ status: 'unauthorized' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows any origin when the list contains *', async () => {
    const res = await handleImport(post({ id: '42' }, { origin: 'http://192.168.1.20:5173' }),
      options({ allowedOrigins: ['*'], fetchImpl: upstream(200) }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('requires the configured key in the apikey header', async () => {
    const fetchImpl = upstream(200, {});
    const keyed = options({ apiKey: 'sb_publishable_test', fetchImpl });
    expect((await handleImport(post({ id: '42' }), keyed)).status).toBe(401);
    expect((await handleImport(post({ id: '42' }, { apikey: 'wrong' }), keyed)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await handleImport(post({ id: '42' }, { apikey: 'sb_publishable_test' }), keyed)).status).toBe(200);
  });

  it('asks for no key when none is configured', async () => {
    const res = await handleImport(post({ id: '42' }), options({ apiKey: null, fetchImpl: upstream(200) }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run supabase`
Expected: FAIL. `./import-handler.ts` does not exist.

- [ ] **Step 4: Write the handler**

Create `supabase/functions/_shared/import-handler.ts`:

```ts
// The import logic, written against web-standard Request and Response only. It runs unchanged in
// the Supabase Edge Function (Deno), in the Vite dev server (Node) and in Vitest. No imports.

export const CHARACTER_ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

export type ImportStatus = 'ok' | 'private' | 'not-found' | 'upstream-error' | 'bad-request' | 'unauthorized';

export interface ImportOptions {
  /** Origins that may call from a browser, compared exactly. '*' allows any origin. */
  allowedOrigins: string[];
  /** When set, the request's `apikey` header must equal it. */
  apiKey?: string | null;
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ID_PATTERN = /^\d{1,12}$/;

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (origin === null) return {};
  const any = allowed.includes('*');
  if (!any && !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': any ? '*' : origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(status: number, body: { status: ImportStatus; raw?: unknown }, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function requestedId(req: Request): Promise<string | null> {
  try {
    const body: unknown = await req.json();
    const id = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).id : null;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * POST { "id": "<1 to 12 digits>" } fetches that public D&D Beyond character and nothing else.
 * It sends no cookies and no headers beyond Accept.
 */
export async function handleImport(req: Request, options: ImportOptions): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, options.allowedOrigins);
  // A browser request from an origin that is not listed gets no answer it can read.
  if (origin !== null && Object.keys(cors).length === 0) return reply(403, { status: 'unauthorized' }, {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { status: 'bad-request' }, cors);
  if (options.apiKey && req.headers.get('apikey') !== options.apiKey) {
    return reply(401, { status: 'unauthorized' }, cors);
  }

  const id = await requestedId(req);
  if (id === null) return reply(400, { status: 'bad-request' }, cors);

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${CHARACTER_ENDPOINT}${id}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
  if (upstream.status === 403) return reply(403, { status: 'private' }, cors);
  if (upstream.status === 404) return reply(404, { status: 'not-found' }, cors);
  if (!upstream.ok) return reply(502, { status: 'upstream-error' }, cors);
  try {
    return reply(200, { status: 'ok', raw: await upstream.json() }, cors);
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run supabase`
Expected: PASS.

- [ ] **Step 6: Write the Deno entry point**

Create `supabase/functions/import-character/index.ts`:

```ts
// Supabase Edge Function entry point (Deno). All logic is in ../_shared/import-handler.ts.
import { handleImport } from '../_shared/import-handler.ts';

/** The project's publishable key, which Supabase injects as a JSON dictionary. Null if absent. */
function publishableKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    return typeof keys.default === 'string' ? keys.default : null;
  } catch {
    return null;
  }
}

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

Deno.serve((req) => handleImport(req, { allowedOrigins, apiKey: publishableKey() }));
```

This file is not run by Vitest or checked by tsc. It is exercised in Task 16, when the function is deployed.

- [ ] **Step 7: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add supabase vitest.config.ts tsconfig.json
git commit -m "Add the import handler and its Edge Function entry point

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: Web app workspace, test setup and router

Creates the `@cw/web` package, a second Vitest project that runs on jsdom, and the hash router. No screens yet.

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json` (root), `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `test-utils/fixtures.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/router.ts`, `apps/web/src/router.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `apps/web/src/router.ts`:
  - `type View = 'combat' | 'explore'`
  - `type Route = { name: 'home' } | { name: 'import' } | { name: 'about' } | { name: 'character'; id: string; view: View }`
  - `parseRoute(hash: string): Route`, `routeHref(route: Route): string`, `navigate(route: Route): void`, `useRoute(): Route`
- Produces: Vitest project `web` (jsdom, files `apps/web/src/**/*.test.{ts,tsx}`, setup file `apps/web/src/test/setup.ts`). The setup file registers the jest-dom matchers, installs `fake-indexeddb`, and after each test unmounts React, removes stubbed globals and clears the URL hash.

- [ ] **Step 1: Add the workspace package**

Replace `pnpm-workspace.yaml` with:

```yaml
packages:
  - "packages/*"
  - "apps/*"
allowBuilds:
  esbuild: true
```

Create `apps/web/package.json`:

```json
{
  "name": "@cw/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Install the dependencies**

Run each command from the repository root:

```bash
pnpm --filter @cw/web add react react-dom zustand idb dompurify "@cw/model@workspace:*" "@cw/rules@workspace:*" "@cw/ddb-import@workspace:*"
```

```bash
pnpm --filter @cw/web add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @types/react @types/react-dom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom fake-indexeddb vitest
```

```bash
pnpm add -w -D jsdom @vitejs/plugin-react
```

Why each odd one is there: `vitest` is a dev dependency of `@cw/web` so that the jest-dom type augmentation of `vitest` resolves to the same copy (without it, `toBeInTheDocument` fails the typecheck). `jsdom` and `@vitejs/plugin-react` are at the root because the root `vitest.config.ts` loads them.

Expected `apps/web/package.json` afterwards (versions may be newer):

```json
{
  "name": "@cw/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@cw/ddb-import": "workspace:*",
    "@cw/model": "workspace:*",
    "@cw/rules": "workspace:*",
    "dompurify": "^3.4.17",
    "idb": "^8.0.4",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "zustand": "^5.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.5",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.9",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.3.0",
    "fake-indexeddb": "^6.2.8",
    "tailwindcss": "^4.3.5",
    "vite": "^8.3.7",
    "vitest": "^5.1.0"
  }
}
```

- [ ] **Step 3: Add the root scripts**

In the root `package.json`, add two scripts so that `scripts` reads:

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "pnpm --filter @cw/web dev",
    "build": "pnpm --filter @cw/web build",
    "sheet": "tsx scripts/sheet.ts",
    "fetch-character": "tsx scripts/fetch-character.ts"
  },
```

- [ ] **Step 4: Configure TypeScript, Vitest and git**

Replace `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": [
    "packages/*/src",
    "packages/*/test",
    "apps/web/src",
    "apps/web/dev",
    "apps/web/vite.config.ts",
    "scripts",
    "test-utils",
    "supabase/functions/_shared",
    "vitest.config.ts"
  ]
}
```

Replace `vitest.config.ts` with:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'scripts/**/*.test.ts',
            'supabase/functions/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
```

Replace `.gitignore` with:

```
node_modules/
dist/
.env
.env.*
!.env.example
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 5: Make the fixture loader work under jsdom**

Under jsdom the global `URL` is jsdom's, and Node's `fileURLToPath` rejects it. In `test-utils/fixtures.ts`, replace:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
```

with:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
```

Replace:

```ts
const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
```

with:

```ts
// Built from a path, not a URL object: under jsdom the global URL is not Node's.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
```

Replace the two `readFileSync` calls so that the two functions read:

```ts
export function loadRaw(slug: Slug): any {
  return JSON.parse(readFileSync(join(root, 'characters', `${slug}.json`), 'utf8'));
}

export function loadExpected(slug: Slug): Expected {
  return JSON.parse(readFileSync(join(root, 'expected', `${slug}.json`), 'utf8'));
}
```

- [ ] **Step 6: Write the test setup file**

Create `apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});
```

- [ ] **Step 7: Write the failing router test**

Create `apps/web/src/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './router';

describe('parseRoute', () => {
  it('reads each screen from the hash', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/c/abc-123/combat')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/explore')).toEqual({ name: 'character', id: 'abc-123', view: 'explore' });
  });

  it('opens Combat when the view is missing or unknown', () => {
    expect(parseRoute('#/c/abc-123')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/nonsense')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
  });

  it('sends anything else home', () => {
    for (const hash of ['#/nowhere', '#/c', '#/c/', '#/import/extra', '#/about/extra']) {
      expect(parseRoute(hash)).toEqual({ name: 'home' });
    }
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { name: 'home' }, { name: 'import' }, { name: 'about' },
      { name: 'character', id: 'abc-123', view: 'combat' },
      { name: 'character', id: 'abc-123', view: 'explore' },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });
});
```

Run: `pnpm exec vitest run apps/web/src/router.test.ts`
Expected: FAIL. `./router` does not exist.

- [ ] **Step 8: Write the router**

Create `apps/web/src/router.ts`:

```ts
import { useSyncExternalStore } from 'react';

export type View = 'combat' | 'explore';

export type Route =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'about' }
  | { name: 'character'; id: string; view: View };

/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter((part) => part !== '');
  if (parts[0] === 'import' && parts.length === 1) return { name: 'import' };
  if (parts[0] === 'about' && parts.length === 1) return { name: 'about' };
  if (parts[0] === 'c' && parts[1]) {
    return { name: 'character', id: parts[1], view: parts[2] === 'explore' ? 'explore' : 'combat' };
  }
  return { name: 'home' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'import': return '#/import';
    case 'about': return '#/about';
    case 'character': return `#/c/${route.id}/${route.view}`;
    default: return '#/';
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const currentHash = (): string => window.location.hash;

/** The current route, re-rendering when the hash changes (including the phone's back button). */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}
```

- [ ] **Step 9: Run all tests and the typecheck, then commit**

Run: `pnpm test`
Expected: PASS. The output lists tests from both projects, `node` and `web`.

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json vitest.config.ts .gitignore test-utils/fixtures.ts apps/web
git commit -m "Add the web app workspace, its jsdom test project and the hash router

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 9: On-device storage

**Files:**
- Create: `apps/web/src/storage/types.ts`, `memory.ts`, `idb.ts`, `index.ts`
- Create: `apps/web/src/storage/storage.test.ts`

**Interfaces:**
- Consumes: `PlayState` from `@cw/model` (Task 6).
- Produces, from `apps/web/src/storage` (the `index.ts`):
  - `interface StoredCharacter { id: string; ddbId: string; name: string; rawJson: unknown; importedAt: string }`
  - `interface AppStorage { listCharacters(): Promise<StoredCharacter[]>; putCharacter(c: StoredCharacter): Promise<void>; deleteCharacter(id: string): Promise<void>; getPlay(characterId: string): Promise<PlayState | null>; putPlay(characterId: string, state: PlayState): Promise<void> }`
  - `memoryStorage(): AppStorage`
  - `idbStorage(): Promise<AppStorage>` (database `character-wizard`, version 1, stores `characters` keyed by `id` and `play` keyed by `characterId`)
  - `openStorage(): Promise<{ storage: AppStorage; persistent: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/storage/storage.test.ts`. The same contract tests run against both implementations.

```ts
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayState } from '@cw/model';
import { idbStorage, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './index';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ddbId: `ddb-${id}`, name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: '2026-11-11T10:00:00.000Z', ...over,
});

const play: PlayState = {
  spent: { pact: 1, 'slot:1': 2 },
  concentrationKey: 'spell:1:base:slot',
  turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: true },
};

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe.each([
  ['memoryStorage', async (): Promise<AppStorage> => memoryStorage()],
  ['idbStorage', idbStorage],
])('%s', (_name, open) => {
  it('starts empty', async () => {
    const storage = await open();
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.getPlay('a')).toBeNull();
  });

  it('stores, replaces and lists characters', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putCharacter(character('a', { name: 'Renamed' }));
    const list = await storage.listCharacters();
    expect(list.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(list.find((c) => c.id === 'a')).toEqual(character('a', { name: 'Renamed' }));
  });

  it('stores and replaces play state per character, without the storage key leaking in', async () => {
    const storage = await open();
    await storage.putPlay('a', play);
    expect(await storage.getPlay('a')).toEqual(play);
    expect(await storage.getPlay('b')).toBeNull();
    const later: PlayState = { ...play, spent: {}, concentrationKey: null };
    await storage.putPlay('a', later);
    expect(await storage.getPlay('a')).toEqual(later);
  });

  it('deletes a character together with its play state', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putPlay('a', play);
    await storage.putPlay('b', play);
    await storage.deleteCharacter('a');
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual(['b']);
    expect(await storage.getPlay('a')).toBeNull();
    expect(await storage.getPlay('b')).toEqual(play);
  });
});

describe('idbStorage', () => {
  it('keeps data between two opens of the same database', async () => {
    const first = await idbStorage();
    await first.putCharacter(character('a'));
    await first.putPlay('a', play);
    const second = await idbStorage();
    expect(await second.listCharacters()).toEqual([character('a')]);
    expect(await second.getPlay('a')).toEqual(play);
  });
});

describe('openStorage', () => {
  it('uses IndexedDB when it is available', async () => {
    const { storage, persistent } = await openStorage();
    expect(persistent).toBe(true);
    await storage.putCharacter(character('a'));
    expect(await (await idbStorage()).listCharacters()).toEqual([character('a')]);
  });

  it('falls back to memory and says so when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { storage, persistent } = await openStorage();
    expect(persistent).toBe(false);
    await storage.putCharacter(character('a'));
    expect(await storage.listCharacters()).toEqual([character('a')]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/storage`
Expected: FAIL. `./index` does not exist.

- [ ] **Step 3: Write the storage**

Create `apps/web/src/storage/types.ts`:

```ts
import type { PlayState } from '@cw/model';

/** One imported character. Mirrors the `characters` table that milestone 3 adds. */
export interface StoredCharacter {
  /** Local UUID. */
  id: string;
  /** The D&D Beyond character ID, as a string. Re-import finds the record by it. */
  ddbId: string;
  name: string;
  /** The D&D Beyond response exactly as it was imported. Converted on load, never stored converted. */
  rawJson: unknown;
  /** ISO 8601 date and time. */
  importedAt: string;
}

/**
 * Where characters and play state are kept. Named AppStorage because `Storage` is already the
 * browser's own type for localStorage. Milestone 3 adds sync behind this same interface.
 */
export interface AppStorage {
  listCharacters(): Promise<StoredCharacter[]>;
  putCharacter(character: StoredCharacter): Promise<void>;
  /** Also deletes the character's play state. */
  deleteCharacter(id: string): Promise<void>;
  getPlay(characterId: string): Promise<PlayState | null>;
  putPlay(characterId: string, state: PlayState): Promise<void>;
}
```

Create `apps/web/src/storage/memory.ts`:

```ts
import type { PlayState } from '@cw/model';
import type { AppStorage, StoredCharacter } from './types';

/** Keeps everything in memory. Used in tests, and as the fallback when IndexedDB is unavailable. */
export function memoryStorage(): AppStorage {
  const characters = new Map<string, StoredCharacter>();
  const play = new Map<string, PlayState>();
  return {
    async listCharacters() {
      return [...characters.values()];
    },
    async putCharacter(character) {
      characters.set(character.id, character);
    },
    async deleteCharacter(id) {
      characters.delete(id);
      play.delete(id);
    },
    async getPlay(characterId) {
      return play.get(characterId) ?? null;
    },
    async putPlay(characterId, state) {
      play.set(characterId, state);
    },
  };
}
```

Create `apps/web/src/storage/idb.ts`:

```ts
import type { PlayState } from '@cw/model';
import { openDB, type DBSchema } from 'idb';
import type { AppStorage, StoredCharacter } from './types';

export const DB_NAME = 'character-wizard';

interface Schema extends DBSchema {
  characters: { key: string; value: StoredCharacter };
  play: { key: string; value: PlayState & { characterId: string } };
}

/** Opens (and on first use creates) the database. Rejects where IndexedDB is unavailable. */
export async function idbStorage(): Promise<AppStorage> {
  const db = await openDB<Schema>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('characters', { keyPath: 'id' });
      database.createObjectStore('play', { keyPath: 'characterId' });
    },
  });
  return {
    async listCharacters() {
      return db.getAll('characters');
    },
    async putCharacter(character) {
      await db.put('characters', character);
    },
    async deleteCharacter(id) {
      const tx = db.transaction(['characters', 'play'], 'readwrite');
      await Promise.all([tx.objectStore('characters').delete(id), tx.objectStore('play').delete(id), tx.done]);
    },
    async getPlay(characterId) {
      const row = await db.get('play', characterId);
      if (!row) return null;
      return { spent: row.spent, concentrationKey: row.concentrationKey, turn: row.turn };
    },
    async putPlay(characterId, state) {
      await db.put('play', { characterId, spent: state.spent, concentrationKey: state.concentrationKey, turn: state.turn });
    },
  };
}
```

Create `apps/web/src/storage/index.ts`:

```ts
import { idbStorage } from './idb';
import { memoryStorage } from './memory';
import type { AppStorage } from './types';

export type { AppStorage, StoredCharacter } from './types';
export { memoryStorage } from './memory';
export { idbStorage } from './idb';

/**
 * IndexedDB when it works. Otherwise (private browsing, storage blocked) an in-memory store, with
 * `persistent: false` so the app can say that nothing will be saved.
 */
export async function openStorage(): Promise<{ storage: AppStorage; persistent: boolean }> {
  try {
    return { storage: await idbStorage(), persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/storage`
Expected: PASS.

- [ ] **Step 5: Run the typecheck, then commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/storage
git commit -m "Store characters and play state in IndexedDB behind AppStorage

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 10: The app store

One Zustand store holds the stored characters and the open character's sheet, play state and one undo step. Every play change is written to storage; a failed write turns on the "not saving" flag and keeps the change in memory.

**Files:**
- Create: `apps/web/src/store.ts`
- Create: `apps/web/src/store.test.ts`
- Create: `apps/web/src/test/helpers.ts`

**Interfaces:**
- Consumes: `AppStorage`, `StoredCharacter`, `memoryStorage`, `openStorage` (Task 9); `convertCharacter` from `@cw/ddb-import`; `buildSheet`, `applyUse`, `startTurn`, `rest`, `adjustPool`, `togglePill`, `endConcentration`, `clampState`, `emptyPlayState`, `pools`, `useSummary`, `Sheet`, `TurnTiming`, `ViewMode` from `@cw/rules` (Task 6).
- Produces, from `apps/web/src/store.ts`:
  - `interface Undo { state: PlayState; message: string }`
  - `interface AppStore` with state `ready`, `persistent`, `characters`, `openId`, `sheet`, `play`, `undo` and actions `init(storage?)`, `saveImported(raw)`, `remove(id)`, `open(id)`, `use(ability, mode, slot?)`, `startTurn()`, `rest(kind)`, `adjust(poolKey, delta)`, `togglePill(timing)`, `endConcentration()`, `undoLast()`
  - `useStore` (the Zustand hook; `useStore.getState()` outside React)
  - `sheetFor(character: StoredCharacter): Sheet` (cached per character and import date)
- Produces, from `apps/web/src/test/helpers.ts`:
  - `rawWithId(slug, ddbId): any`, `seed(slug, storage?): Promise<StoredCharacter>`, `ability(name, cost?): Ability`
- Undo messages: `useSummary(...)` for a Use, `'Started a new turn.'`, `'Took a Short Rest.'`, `'Took a Long Rest.'`.

- [ ] **Step 1: Write the test helpers and the failing test**

Create `apps/web/src/test/helpers.ts`:

```ts
import type { Ability } from '@cw/model';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';

/** A fixture's raw JSON with its D&D Beyond ID replaced, so two fixtures can be stored side by side. */
export function rawWithId(slug: Slug, ddbId: number): any {
  const raw = loadRaw(slug);
  raw.data.id = ddbId;
  return raw;
}

/** A fresh store on in-memory storage, holding one imported fixture, which is opened. */
export async function seed(slug: Slug, storage: AppStorage = memoryStorage()): Promise<StoredCharacter> {
  await useStore.getState().init(storage);
  const record = await useStore.getState().saveImported(loadRaw(slug));
  if (!record) throw new Error(`fixture ${slug} did not import`);
  await useStore.getState().open(record.id);
  return record;
}

/** The open character's ability with this name; `cost` picks between two that share a name. */
export function ability(name: string, cost?: Ability['cost']['kind']): Ability {
  const sheet = useStore.getState().sheet;
  if (!sheet) throw new Error('no character is open');
  const found = [...sheet.abilities, ...sheet.universal].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}`);
  return found;
}
```

Create `apps/web/src/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyPlayState } from '@cw/rules';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryStorage, type AppStorage } from './storage';
import { sheetFor, useStore } from './store';
import { ability, rawWithId, seed } from './test/helpers';

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('init', () => {
  it('loads what the storage holds and becomes ready', async () => {
    const storage = memoryStorage();
    await seed('vlad', storage);
    await state().init(storage);
    expect(state()).toMatchObject({ ready: true, persistent: true, openId: null, sheet: null });
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
  });

  it('keeps working without saving when the storage cannot be read', async () => {
    const broken: AppStorage = { ...memoryStorage(), listCharacters: async () => { throw new Error('blocked'); } };
    await state().init(broken);
    expect(state()).toMatchObject({ ready: true, persistent: false, characters: [] });
  });
});

describe('saveImported', () => {
  it('stores a new character with its name, D&D Beyond ID and raw JSON', async () => {
    const storage = memoryStorage();
    await state().init(storage);
    const raw = loadRaw('vlad');
    const record = await state().saveImported(raw);
    expect(record).toMatchObject({ ddbId: '1', name: 'Vlad', rawJson: raw });
    expect(record?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(record?.importedAt ?? ''))).toBe(false);
    expect(await storage.listCharacters()).toEqual([record]);
  });

  it('refuses JSON that is not a character', async () => {
    await state().init(memoryStorage());
    expect(await state().saveImported({ hello: 'world' })).toBeNull();
    expect(await state().saveImported('nonsense')).toBeNull();
    expect(state().characters).toEqual([]);
  });

  it('keeps two different characters apart', async () => {
    await state().init(memoryStorage());
    await state().saveImported(rawWithId('vlad', 101));
    await state().saveImported(rawWithId('minkis', 102));
    expect(state().characters.map((c) => c.name).sort()).toEqual(['Minkis', 'Vlad']);
  });

  it('replaces the character on re-import and clamps what was spent', async () => {
    const storage = memoryStorage();
    const first = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    await storage.putPlay(first.id, { ...emptyPlayState(), spent: { pact: 9, gone: 3 }, concentrationKey: 'not-there' });
    const second = await state().saveImported(loadRaw('vlad'));
    expect(second?.id).toBe(first.id);
    expect(state().characters).toHaveLength(1);
    expect(await storage.getPlay(first.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
    expect(state().play.spent).toEqual({ pact: 2 });
  });
});

describe('open', () => {
  it('builds the sheet and loads saved play state', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().init(storage);
    await state().open(record.id);
    expect(state().sheet?.name).toBe('Vlad');
    expect(state().play.spent).toEqual({ pact: 1 });
    expect(state().play.turn.bonus).toBe(true);
    expect(state().undo).toBeNull();
  });

  it('opens nothing for an unknown ID', async () => {
    await seed('vlad');
    await state().open('no-such-id');
    expect(state()).toMatchObject({ openId: null, sheet: null });
  });
});

describe('play', () => {
  it('uses an ability, saves the result and offers one undo step', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    expect(state().play).toMatchObject({ spent: { pact: 1 }, turn: { bonus: true, slotSpentThisTurn: true } });
    expect(state().undo?.message).toBe('Used Hex. Spent: Bonus Action, a pact slot.');
    await settle();
    expect(await storage.getPlay(record.id)).toEqual(state().play);

    state().undoLast();
    expect(state().play).toEqual(emptyPlayState());
    expect(state().undo).toBeNull();
    await settle();
    expect(await storage.getPlay(record.id)).toEqual(emptyPlayState());
  });

  it('does nothing when the ability cannot be used', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    const afterHex = state().play;
    state().use(ability('Arms of Hadar'), 'combat');
    expect(state().play).toBe(afterHex);
    expect(state().undo?.message).toContain('Hex');
  });

  it('spends the chosen slot', async () => {
    await seed('minkis');
    state().use(ability('Chromatic Orb'), 'combat', 'slot:2');
    expect(state().play.spent).toEqual({ 'slot:2': 1 });
  });

  it('can undo Start my turn and a rest', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    const afterHex = state().play;
    state().startTurn();
    expect(state().play.turn.bonus).toBe(false);
    expect(state().undo?.message).toBe('Started a new turn.');
    state().undoLast();
    expect(state().play).toEqual(afterHex);

    state().rest('long');
    expect(state().play).toEqual(emptyPlayState());
    expect(state().undo?.message).toBe('Took a Long Rest.');
    state().undoLast();
    expect(state().play).toEqual(afterHex);

    state().rest('short');
    expect(state().undo?.message).toBe('Took a Short Rest.');
    expect(state().play.spent).toEqual({});
  });

  it('lets the player adjust a pool, flip a pill and end concentration by hand, clearing undo', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    state().adjust('pact', 1);
    expect(state().play.spent).toEqual({ pact: 2 });
    expect(state().undo).toBeNull();
    state().adjust('pact', -1);
    state().adjust('no-such-pool', 1);
    expect(state().play.spent).toEqual({ pact: 1 });
    state().togglePill('bonus');
    expect(state().play.turn.bonus).toBe(false);
    state().endConcentration();
    expect(state().play.concentrationKey).toBeNull();
  });

  it('turns on the not-saving flag when a write fails, and keeps the change', async () => {
    const storage = memoryStorage();
    await seed('vlad', storage);
    storage.putPlay = async () => { throw new Error('quota'); };
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().persistent).toBe(false);
    expect(state().play.spent).toEqual({ pact: 1 });
  });
});

describe('remove', () => {
  it('deletes the character and its play state and closes it if open', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().use(ability('Hex'), 'combat');
    await settle();
    await state().remove(record.id);
    expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.getPlay(record.id)).toBeNull();
  });
});

describe('sheetFor', () => {
  it('returns the same sheet until the character is re-imported', async () => {
    const first = await seed('vlad');
    expect(sheetFor(first)).toBe(sheetFor(first));
    const again = await state().saveImported(loadRaw('vlad'));
    if (!again) throw new Error('re-import failed');
    expect(again.importedAt >= first.importedAt).toBe(true);
    expect(sheetFor(again).name).toBe('Vlad');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/store.test.ts`
Expected: FAIL. `./store` does not exist.

- [ ] **Step 3: Write the store**

Create `apps/web/src/store.ts`:

```ts
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, pools, rest,
  startTurn, togglePill, useSummary, type Sheet, type TurnTiming, type ViewMode,
} from '@cw/rules';
import { create } from 'zustand';
import { memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';

export interface Undo {
  /** The play state to go back to. */
  state: PlayState;
  message: string;
}

export interface AppStore {
  /** False until stored characters have been loaded. */
  ready: boolean;
  /** False when the device is not saving: IndexedDB is unavailable or a write failed. */
  persistent: boolean;
  characters: StoredCharacter[];
  /** The character on screen, its sheet and its play state. */
  openId: string | null;
  sheet: Sheet | null;
  play: PlayState;
  /** One step, held in memory only. */
  undo: Undo | null;

  /** Loads stored characters. Tests pass a storage; the app lets it choose. */
  init(storage?: AppStorage): Promise<void>;
  /** Adds a character, or replaces the one with the same D&D Beyond ID. Null if `raw` is not a character. */
  saveImported(raw: unknown): Promise<StoredCharacter | null>;
  remove(id: string): Promise<void>;
  open(id: string): Promise<void>;
  use(ability: Ability, mode: ViewMode, slot?: string): void;
  startTurn(): void;
  rest(kind: 'short' | 'long'): void;
  adjust(poolKey: string, delta: number): void;
  togglePill(timing: TurnTiming): void;
  endConcentration(): void;
  undoLast(): void;
}

let storage: AppStorage = memoryStorage();

const sheetCache = new Map<string, Sheet>();

/** The calculated sheet for a stored character. Converted from the raw JSON on first use. */
export function sheetFor(character: StoredCharacter): Sheet {
  const cacheKey = `${character.id}|${character.importedAt}`;
  let sheet = sheetCache.get(cacheKey);
  if (!sheet) {
    sheet = buildSheet(convertCharacter(character.rawJson));
    sheetCache.set(cacheKey, sheet);
  }
  return sheet;
}

const initial = {
  ready: false,
  persistent: true,
  characters: [] as StoredCharacter[],
  openId: null as string | null,
  sheet: null as Sheet | null,
  play: emptyPlayState(),
  undo: null as Undo | null,
};

export const useStore = create<AppStore>()((set, get) => {
  /** Runs a storage write. A failure turns on the "not saving" banner instead of breaking the app. */
  const save = async (write: Promise<void>): Promise<void> => {
    try {
      await write;
    } catch {
      set({ persistent: false });
    }
  };

  /** Applies a play change to the open character and saves it. */
  const change = (next: PlayState, undo: Undo | null): void => {
    const { openId, play } = get();
    if (openId === null || next === play) return;
    set({ play: next, undo });
    void save(storage.putPlay(openId, next));
  };

  return {
    ...initial,

    async init(override) {
      let persistent = true;
      if (override) storage = override;
      else ({ storage, persistent } = await openStorage());
      let characters: StoredCharacter[] = [];
      try {
        characters = await storage.listCharacters();
      } catch {
        persistent = false;
      }
      set({ ...initial, ready: true, persistent, characters });
    },

    async saveImported(raw) {
      const converted = convertCharacter(raw);
      if (converted.name === '' && converted.classes.length === 0) return null;
      const ddbId = String(converted.id);
      // An ID of 0 means the JSON had none, so it can never match a stored character.
      const existing = ddbId === '0' ? undefined : get().characters.find((c) => c.ddbId === ddbId);
      const record: StoredCharacter = {
        id: existing?.id ?? crypto.randomUUID(),
        ddbId,
        name: converted.name || 'Unnamed character',
        rawJson: raw,
        importedAt: new Date().toISOString(),
      };
      await save(storage.putCharacter(record));
      set({ characters: [...get().characters.filter((c) => c.id !== record.id), record] });
      if (existing) {
        // Re-import: what was spent stays spent, within the new maximums.
        const saved = await storage.getPlay(record.id).catch(() => null);
        if (saved) await save(storage.putPlay(record.id, clampState(saved, sheetFor(record))));
        if (get().openId === record.id) await get().open(record.id);
      }
      return record;
    },

    async remove(id) {
      await save(storage.deleteCharacter(id));
      set({ characters: get().characters.filter((c) => c.id !== id) });
      if (get().openId === id) set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
    },

    async open(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) {
        set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
        return;
      }
      const sheet = sheetFor(character);
      set({ openId: id, sheet, play: emptyPlayState(), undo: null });
      const saved = await storage.getPlay(id).catch(() => null);
      // Ignore the answer if the player has already moved to another character.
      if (saved && get().openId === id) set({ play: clampState(saved, sheet) });
    },

    use(ability, mode, slot) {
      const { sheet, play } = get();
      if (!sheet) return;
      const next = applyUse(ability, sheet, play, mode, slot);
      change(next, { state: play, message: useSummary(ability, sheet, play, next) });
    },

    startTurn() {
      const { play } = get();
      change(startTurn(play), { state: play, message: 'Started a new turn.' });
    },

    rest(kind) {
      const { sheet, play } = get();
      if (!sheet) return;
      change(rest(kind, sheet, play), {
        state: play,
        message: kind === 'long' ? 'Took a Long Rest.' : 'Took a Short Rest.',
      });
    },

    // The three manual controls below clear the undo step: undo only ever reverses the last change.
    adjust(poolKey, delta) {
      const { sheet, play } = get();
      const pool = sheet ? pools(sheet).find((p) => p.key === poolKey) : undefined;
      if (pool) change(adjustPool(play, pool, delta), null);
    },

    togglePill(timing) {
      change(togglePill(get().play, timing), null);
    },

    endConcentration() {
      change(endConcentration(get().play), null);
    },

    undoLast() {
      const { undo } = get();
      if (undo) change(undo.state, null);
    },
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add apps/web/src/store.ts apps/web/src/store.test.ts apps/web/src/test/helpers.ts
git commit -m "Add the app store: characters, play state, undo and saving

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 11: Import client and the dev server's import endpoint

**Files:**
- Create: `apps/web/src/vite-env.d.ts`
- Create: `apps/web/src/import/client.ts`, `apps/web/src/import/client.test.ts`
- Create: `apps/web/dev/import-plugin.ts`

**Interfaces:**
- Consumes: `handleImport` from `supabase/functions/_shared/import-handler.ts` (Task 7).
- Produces, from `apps/web/src/import/client.ts`:
  - `type ImportResult = { status: 'ok'; raw: unknown } | { status: 'private' | 'not-found' | 'upstream-error' | 'unreachable' }`
  - `interface ImportEnv { VITE_SUPABASE_URL?: string; VITE_SUPABASE_KEY?: string }`
  - `importEndpoint(env: ImportEnv): { url: string; headers: Record<string, string> }`
  - `fetchCharacter(id: string, env?: ImportEnv): Promise<ImportResult>` (never throws; uses the global `fetch`)
  - `IMPORT_MESSAGES: Record<'private' | 'not-found' | 'upstream-error' | 'unreachable', string>`, `PRIVACY_HINT: string`
- Produces, from `apps/web/dev/import-plugin.ts`: `devImport(): Plugin`, `DEV_IMPORT_PATH`, `toWebRequest(req)`.
- Environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`. With neither set, the client posts to `/functions/v1/import-character` on the page's own origin, which the dev server answers.

- [ ] **Step 1: Declare the environment variables**

Create `apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** https://<project-ref>.supabase.co. Unset in local development, where the dev server answers. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable key. It is public by design. */
  readonly VITE_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/import/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchCharacter, importEndpoint } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('importEndpoint', () => {
  it('uses this page\'s own origin and no key in local development', () => {
    expect(importEndpoint({})).toEqual({
      url: '/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('sends a publishable key in the apikey header only', () => {
    expect(importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_KEY: 'sb_publishable_x' })).toEqual({
      url: 'https://abc.supabase.co/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x' },
    });
  });

  it('also sends a legacy JWT key as a bearer token', () => {
    const { headers } = importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'eyJhbGciOi.x.y' });
    expect(headers).toMatchObject({ apikey: 'eyJhbGciOi.x.y', Authorization: 'Bearer eyJhbGciOi.x.y' });
  });
});

describe('fetchCharacter', () => {
  it('posts the ID and returns the raw character', async () => {
    const fetchMock = vi.fn(async () => json(200, { status: 'ok', raw: { data: { name: 'Vlad' } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchCharacter('42', {})).toEqual({ status: 'ok', raw: { data: { name: 'Vlad' } } });
    expect(fetchMock).toHaveBeenCalledWith('/functions/v1/import-character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":"42"}',
    });
  });

  it.each([
    [403, 'private'],
    [404, 'not-found'],
    [502, 'upstream-error'],
  ] as const)('passes on the function\'s %i %s answer', async (httpStatus, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(httpStatus, { status })));
    expect(await fetchCharacter('42', {})).toEqual({ status });
  });

  it('reports unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
  });

  it('reports unreachable for an answer that is not the function\'s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { status: 'unauthorized' })));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, null)));
    expect(await fetchCharacter('42', {})).toEqual({ status: 'unreachable' });
  });
});
```

Run: `pnpm exec vitest run apps/web/src/import`
Expected: FAIL. `./client` does not exist.

- [ ] **Step 3: Write the client**

Create `apps/web/src/import/client.ts`:

```ts
export type ImportResult =
  | { status: 'ok'; raw: unknown }
  | { status: 'private' | 'not-found' | 'upstream-error' | 'unreachable' };

export interface ImportEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_KEY?: string;
}

const FUNCTION_PATH = '/functions/v1/import-character';

/**
 * Where to send the import request and with which headers. With no Supabase URL configured the
 * request goes to this page's own origin, where the dev server answers it.
 */
export function importEndpoint(env: ImportEnv): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_KEY ?? '';
  if (key !== '') {
    headers.apikey = key;
    // A legacy anon key is a JWT and must also be sent as a bearer token. A publishable key must not.
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  }
  return { url: `${base}${FUNCTION_PATH}`, headers };
}

/** Asks the import function for a character. Never throws: every failure is a status. */
export async function fetchCharacter(id: string, env: ImportEnv = import.meta.env): Promise<ImportResult> {
  const { url, headers } = importEndpoint(env);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ id }) });
  } catch {
    return { status: 'unreachable' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Not our function's JSON: a proxy error page, or no function at this address.
    return { status: 'unreachable' };
  }
  const status = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).status : null;
  if (status === 'ok') return { status: 'ok', raw: (body as Record<string, unknown>).raw };
  if (status === 'private' || status === 'not-found' || status === 'upstream-error') return { status };
  return { status: 'unreachable' };
}

export const IMPORT_MESSAGES: Record<Exclude<ImportResult['status'], 'ok'>, string> = {
  private: 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.',
  'not-found': 'No character with that ID.',
  'upstream-error': "D&D Beyond didn't respond as expected.",
  unreachable: "Couldn't reach the import service.",
};

/** Where the privacy setting is, shown under the Private message. */
export const PRIVACY_HINT =
  'On D&D Beyond, open the character, choose Edit, and on the Home step set Character Privacy to Public.';
```

Run: `pnpm exec vitest run apps/web/src/import`
Expected: PASS.

- [ ] **Step 4: Write the dev server plugin**

Create `apps/web/dev/import-plugin.ts`. It has no unit test: it is thin glue between Node's request object and the handler, and Task 15 checks it against the running dev server.

```ts
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { handleImport } from '../../../supabase/functions/_shared/import-handler.ts';

export const DEV_IMPORT_PATH = '/functions/v1/import-character';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** A Node request as a web-standard Request, which is what the shared handler takes. */
export async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  return new Request(`http://localhost${DEV_IMPORT_PATH}`, {
    method,
    headers,
    body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
  });
}

/**
 * Mounts the Edge Function's handler on the Vite dev server at the same path Supabase serves it,
 * so the app can import characters locally with no Supabase project. Dev server only.
 */
export function devImport(): Plugin {
  return {
    name: 'cw-dev-import',
    configureServer(server) {
      server.middlewares.use(DEV_IMPORT_PATH, (req, res) => {
        void (async () => {
          const response = await handleImport(await toWebRequest(req), { allowedOrigins: ['*'] });
          res.statusCode = response.status;
          response.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(() => {
          res.statusCode = 500;
          res.end();
        });
      });
    },
  };
}
```

- [ ] **Step 5: Run the typecheck, then commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/vite-env.d.ts apps/web/src/import apps/web/dev
git commit -m "Add the import client and mount the handler on the dev server

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 12: Row components

The pieces both views are built from. Each is tested on its own, without the app shell.

**Files:**
- Create: `apps/web/src/components/Pips.tsx`, `ResourceChips.tsx`, `Description.tsx`, `NotesList.tsx`, `AbilityRow.tsx`, `SlotSheet.tsx`, `useAbilityUse.tsx`
- Create: `apps/web/src/components/components.test.tsx`

**Interfaces:**
- Consumes: `availability`, `costLabel`, `pools`, `remaining`, `rollLine`, `abilityLabel`, `skillLabel`, `Pool`, `SlotOption`, `Note`, `Sheet`, `ViewMode` from `@cw/rules`; `useStore` (Task 10); `seed`, `ability` test helpers (Task 10).
- Produces:
  - `Pips({ pool: Pool; left: number; onAdjust: (delta: number) => void })`: up to 6, one button per pip, labelled `Spend one {pool.name}` (filled) or `Restore one {pool.name}` (empty), inside a group labelled `{pool.name}: {left} of {max} left`. Above 6, `{left} / {max}` with a minus and a plus button carrying the same two labels.
  - `ResourceChips({ pools: Pool[]; state: PlayState; onAdjust: (pool: Pool, delta: number) => void })`: a region labelled `Resources`; the first four pools, then a `+N more` / `Show fewer` button.
  - `sanitiseDescription(html: string): string` and `Description({ html: string })`.
  - `noteSubject(note: Note): string | null` and `NotesList({ notes: Note[]; empty: string })`.
  - `AbilityRow({ ability, sheet, state, mode, onUse, onAdjust })`: an `article` labelled with the ability's name; the Use button is labelled `Use {name}`.
  - `SlotSheet({ ability, options, onPick, onCancel })`: a dialog labelled `Cast {name} with`.
  - `useAbilityUse(mode: ViewMode): { request: (ability: Ability) => void; slotSheet: ReactNode }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/components.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PlayState } from '@cw/model';
import { emptyPlayState, pools, type Pool } from '@cw/rules';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { AbilityRow } from './AbilityRow';
import { Description, sanitiseDescription } from './Description';
import { NotesList } from './NotesList';
import { Pips } from './Pips';
import { ResourceChips } from './ResourceChips';

const pool = (max: number): Pool => ({ key: 'p', name: 'Luck Points', max, reset: 'long', kind: 'uses' });

describe('Pips', () => {
  it('shows one pip per use and says how many are left', () => {
    render(<Pips pool={pool(3)} left={2} onAdjust={() => {}} />);
    expect(screen.getByRole('group', { name: 'Luck Points: 2 of 3 left' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Spend one Luck Points' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Restore one Luck Points' })).toHaveLength(1);
  });

  it('spends on a filled pip and restores on an empty one', async () => {
    const onAdjust = vi.fn();
    render(<Pips pool={pool(3)} left={2} onAdjust={onAdjust} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Spend one Luck Points' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Luck Points' }));
    expect(onAdjust.mock.calls).toEqual([[1], [-1]]);
  });

  it('shows a number with minus and plus for a large pool', async () => {
    const onAdjust = vi.fn();
    render(<Pips pool={pool(9)} left={7} onAdjust={onAdjust} />);
    expect(screen.getByText('7 / 9')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Spend one Luck Points' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Luck Points' }));
    expect(onAdjust.mock.calls).toEqual([[1], [-1]]);
  });
});

describe('ResourceChips', () => {
  it('folds pools beyond the first four behind a button', async () => {
    await seed('vlad');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    const all = pools(sheet);
    render(<ResourceChips pools={all} state={emptyPlayState()} onAdjust={() => {}} />);
    const region = screen.getByRole('region', { name: 'Resources' });
    expect(within(region).getAllByRole('group')).toHaveLength(4);
    await userEvent.click(within(region).getByRole('button', { name: `+${all.length - 4} more` }));
    expect(within(region).getAllByRole('group')).toHaveLength(all.length);
    expect(within(region).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });

  it('renders nothing for a character with no pools', () => {
    const { container } = render(<ResourceChips pools={[]} state={emptyPlayState()} onAdjust={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Description', () => {
  it('keeps formatting and removes everything that could run or load', () => {
    const dirty = '<p onclick="steal()">Deal <strong>fire</strong> damage.</p>'
      + '<script>alert(1)</script><img src="x" onerror="alert(2)">'
      + '<a href="javascript:alert(3)">link text</a><iframe src="https://evil.example"></iframe>'
      + '<ul><li style="background:url(x)">one</li></ul>';
    const clean = sanitiseDescription(dirty);
    expect(clean).toBe('<p>Deal <strong>fire</strong> damage.</p>link text<ul><li>one</li></ul>');
  });

  it('renders the sanitised text', () => {
    const { container } = render(<Description html={'<p>Hello <em>there</em></p><script>window.hacked = true</script>'} />);
    expect(screen.getByText('there')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('says so when the sheet has no description', () => {
    render(<Description html="  " />);
    expect(screen.getByText('No description on the sheet.')).toBeInTheDocument();
  });
});

describe('NotesList', () => {
  it('prefixes a note with the skill or save it is about', () => {
    render(<NotesList empty="none" notes={[
      { target: { kind: 'skill', skill: 'sleight-of-hand' }, text: 'Advantage (roll twice, keep the higher).' },
      { target: { kind: 'save', ability: 'con' }, text: 'Advantage: to maintain Concentration.' },
      { target: { kind: 'other' }, text: 'Immunity, charmed: Raging.' },
    ]} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Sleight of Hand: Advantage (roll twice, keep the higher).',
      'Constitution save: Advantage: to maintain Concentration.',
      'Immunity, charmed: Raging.',
    ]);
  });

  it('shows the empty text when there are no notes', () => {
    render(<NotesList notes={[]} empty="No other notes on this sheet." />);
    expect(screen.getByText('No other notes on this sheet.')).toBeInTheDocument();
  });
});

describe('AbilityRow', () => {
  async function row(name: string, state: PlayState = emptyPlayState(), cost?: 'slot' | 'uses') {
    await seed('vlad');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    const onUse = vi.fn();
    const onAdjust = vi.fn();
    render(<AbilityRow ability={ability(name, cost)} sheet={sheet} state={state} mode="combat" onUse={onUse} onAdjust={onAdjust} />);
    return { article: screen.getByRole('article', { name }), onUse, onAdjust };
  }

  it('shows the name, cost label, tags and roll line, and calls onUse', async () => {
    const { article, onUse } = await row('Arms of Hadar');
    expect(article).toHaveTextContent('pact slot');
    expect(article).toHaveTextContent('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    await userEvent.click(within(article).getByRole('button', { name: 'Use Arms of Hadar' }));
    expect(onUse).toHaveBeenCalledWith(ability('Arms of Hadar'));
  });

  it('tells two abilities with the same name apart by their cost', async () => {
    const { article } = await row('Misty Step', emptyPlayState(), 'uses');
    expect(article).toHaveTextContent('free cast, 3 left');
  });

  it('disables Use and gives the reason when the ability is blocked', async () => {
    const state: PlayState = { ...emptyPlayState(), spent: { pact: 2 } };
    const { article, onUse } = await row('Arms of Hadar', state);
    const use = within(article).getByRole('button', { name: 'Use Arms of Hadar' });
    expect(use).toBeDisabled();
    expect(article).toHaveTextContent('No spell slots left.');
    await userEvent.click(use);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('warns when using it would end the current concentration', async () => {
    await seed('vlad');
    const state: PlayState = { ...emptyPlayState(), concentrationKey: ability('Hex').key };
    const { article } = await row('Darkness', state);
    expect(article).toHaveTextContent('Ends your Hex.');
  });

  it('shows a weapon\'s charges as pips that never go through Use', async () => {
    const { article, onUse, onAdjust } = await row('Wurms Claw - Sword');
    expect(article).toHaveTextContent('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(within(article).getByRole('group', { name: 'Wurms Claw - Sword: 3 of 3 left' })).toBeInTheDocument();
    await userEvent.click(within(article).getAllByRole('button', { name: 'Spend one Wurms Claw - Sword' })[0]);
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onAdjust.mock.calls[0][1]).toBe(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('opens the description on a tap of the name', async () => {
    const { article } = await row('Dash');
    expect(article).not.toHaveTextContent('Gain extra movement');
    await userEvent.click(within(article).getByRole('button', { name: /^Dash/ }));
    expect(article).toHaveTextContent('Gain extra movement equal to your Speed');
  });

  it('has no Use button for an ability with nothing to spend', async () => {
    await seed('sid');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    render(<AbilityRow ability={ability('Sneak Attack')} sheet={sheet} state={emptyPlayState()} mode="combat" onUse={() => {}} onAdjust={() => {}} />);
    const article = screen.getByRole('article', { name: 'Sneak Attack' });
    expect(article).toHaveTextContent('Roll 2d6.');
    expect(within(article).queryByRole('button', { name: 'Use Sneak Attack' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components`
Expected: FAIL. The component files do not exist.

- [ ] **Step 3: Write the components**

Create `apps/web/src/components/Pips.tsx`:

```tsx
import type { Pool } from '@cw/rules';

/** Above this many, pips are too small to tap, so the pool shows a number with minus and plus. */
const MAX_PIPS = 6;

interface Props {
  pool: Pool;
  /** How many are left. */
  left: number;
  /** +1 spends one, -1 restores one. */
  onAdjust: (delta: number) => void;
}

const BUTTON = 'inline-flex h-8 min-w-6 items-center justify-center text-lg leading-none';

/** A pool the player spends and restores by hand: a filled pip is one left, an empty pip is one spent. */
export function Pips({ pool, left, onAdjust }: Props) {
  if (pool.max > MAX_PIPS) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" aria-label={`Spend one ${pool.name}`} onClick={() => onAdjust(1)} className={BUTTON}>−</button>
        <span className="tabular-nums">{left} / {pool.max}</span>
        <button type="button" aria-label={`Restore one ${pool.name}`} onClick={() => onAdjust(-1)} className={BUTTON}>+</button>
      </span>
    );
  }
  return (
    <span role="group" aria-label={`${pool.name}: ${left} of ${pool.max} left`} className="inline-flex">
      {Array.from({ length: pool.max }, (_, index) => {
        const filled = index < left;
        return (
          <button
            key={index}
            type="button"
            aria-label={filled ? `Spend one ${pool.name}` : `Restore one ${pool.name}`}
            onClick={() => onAdjust(filled ? 1 : -1)}
            className={`${BUTTON} ${filled ? 'text-slate-900' : 'text-slate-400'}`}
          >
            {filled ? '●' : '○'}
          </button>
        );
      })}
    </span>
  );
}
```

Create `apps/web/src/components/ResourceChips.tsx`:

```tsx
import type { PlayState } from '@cw/model';
import { remaining, type Pool } from '@cw/rules';
import { useState } from 'react';
import { Pips } from './Pips';

/** How many pools are shown before the rest fold behind a "more" button. */
const SHOWN = 4;

interface Props {
  pools: Pool[];
  state: PlayState;
  onAdjust: (pool: Pool, delta: number) => void;
}

/** Every limited pool as a chip with tappable pips. */
export function ResourceChips({ pools, state, onAdjust }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (pools.length === 0) return null;
  const visible = showAll ? pools : pools.slice(0, SHOWN);
  const hidden = pools.length - visible.length;
  return (
    <section aria-label="Resources" className="flex flex-wrap items-center gap-2">
      {visible.map((pool) => (
        <span key={pool.key} className="inline-flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pl-3 pr-1 text-sm">
          <span>{pool.name}</span>
          <Pips pool={pool} left={remaining(pool, state)} onAdjust={(delta) => onAdjust(pool, delta)} />
        </span>
      ))}
      {pools.length > SHOWN ? (
        <button type="button" onClick={() => setShowAll(!showAll)} className="rounded-full px-2 py-1 text-sm text-indigo-700">
          {showAll ? 'Show fewer' : `+${hidden} more`}
        </button>
      ) : null}
    </section>
  );
}
```

Create `apps/web/src/components/Description.tsx`. Descriptions are HTML from an imported sheet, and pasted JSON is untrusted, so nothing is rendered without passing through DOMPurify with this allow-list.

```tsx
import DOMPurify from 'dompurify';

/** Formatting only. No links, images, styles, scripts or attributes of any kind. */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h3', 'h4', 'h5', 'span',
];

/** Description text from an imported sheet. It is HTML from outside the app, so it is sanitised. */
export function sanitiseDescription(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

export function Description({ html }: { html: string }) {
  if (html.trim() === '') return <p className="text-sm text-slate-600">No description on the sheet.</p>;
  return (
    <div className="description text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: sanitiseDescription(html) }} />
  );
}
```

Create `apps/web/src/components/NotesList.tsx`:

```tsx
import { abilityLabel, skillLabel, type Note } from '@cw/rules';

/** What a note is about, for a list where the note does not sit on its own row. */
export function noteSubject(note: Note): string | null {
  if (note.target.kind === 'skill') return skillLabel(note.target.skill);
  if (note.target.kind === 'save') return `${abilityLabel(note.target.ability)} save`;
  return null;
}

interface Props {
  notes: Note[];
  /** Shown when there are no notes. */
  empty: string;
}

/** The "Keep in mind" list: conditional modifiers from the sheet, never applied to a number. */
export function NotesList({ notes, empty }: Props) {
  if (notes.length === 0) return <p className="py-2 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="list-disc py-2 pl-5 text-sm">
      {notes.map((note) => {
        const subject = noteSubject(note);
        const text = subject ? `${subject}: ${note.text}` : note.text;
        return <li key={text}>{text}</li>;
      })}
    </ul>
  );
}
```

Create `apps/web/src/components/AbilityRow.tsx`:

```tsx
import type { Ability, PlayState } from '@cw/model';
import { availability, costLabel, pools, remaining, rollLine, type Pool, type Sheet, type ViewMode } from '@cw/rules';
import { useState } from 'react';
import { Description } from './Description';
import { Pips } from './Pips';

interface Props {
  ability: Ability;
  sheet: Sheet;
  state: PlayState;
  mode: ViewMode;
  onUse: (ability: Ability) => void;
  onAdjust: (pool: Pool, delta: number) => void;
}

/** The small labels after the name: what it costs and what kind of ability it is. */
function labels(ability: Ability, sheet: Sheet, state: PlayState): string[] {
  const out: string[] = [];
  const cost = costLabel(ability, sheet, state);
  if (cost) out.push(cost);
  if (ability.concentration) out.push('concentration');
  if (ability.ritual) out.push('ritual');
  if (ability.timing === 'long') out.push('takes a minute or more');
  out.push(...ability.tags);
  return out;
}

/** One ability: name, labels, roll line, notes, a Use button, and the description on tap. */
export function AbilityRow({ ability, sheet, state, mode, onUse, onAdjust }: Props) {
  const [open, setOpen] = useState(false);
  const a = availability(ability, sheet, state, mode);
  const line = rollLine(ability.roll);
  const pool = ability.poolKey ? pools(sheet).find((p) => p.key === ability.poolKey) : undefined;
  const blocked = a.hasUse && !a.canUse;
  const meta = labels(ability, sheet, state);

  return (
    <article aria-label={ability.name} className="border-t border-slate-200 py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`min-w-0 flex-1 text-left ${blocked ? 'text-slate-500' : ''}`}
        >
          <span className="font-medium">{ability.name}</span>
          {meta.length > 0 ? <span className="ml-2 text-xs text-slate-500">{meta.join(' · ')}</span> : null}
          {line ? <span className="block text-sm">{line}</span> : null}
          {ability.notes.map((note) => <span key={note} className="block text-sm text-slate-600">{note}</span>)}
          {a.ends ? <span className="block text-sm text-amber-800">Ends your {a.ends}.</span> : null}
          {blocked && a.reason ? <span className="block text-sm">{a.reason}</span> : null}
        </button>
        {a.hasUse ? (
          <button
            type="button"
            aria-label={`Use ${ability.name}`}
            disabled={!a.canUse}
            onClick={() => onUse(ability)}
            className="rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium disabled:border-slate-200 disabled:text-slate-400"
          >
            Use
          </button>
        ) : null}
      </div>
      {pool ? (
        <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          <span>Charges</span>
          <Pips pool={pool} left={remaining(pool, state)} onAdjust={(delta) => onAdjust(pool, delta)} />
        </div>
      ) : null}
      {open ? <div className="mt-2 rounded-lg bg-slate-100 p-2"><Description html={ability.description} /></div> : null}
    </article>
  );
}
```

Create `apps/web/src/components/SlotSheet.tsx`:

```tsx
import type { Ability } from '@cw/model';
import type { SlotOption } from '@cw/rules';

interface Props {
  ability: Ability;
  options: SlotOption[];
  onPick: (slotKey: string) => void;
  onCancel: () => void;
}

/** Asks which slot pays for a spell. Shown only when more than one could. */
export function SlotSheet({ ability, options, onPick, onCancel }: Props) {
  const title = `Cast ${ability.name} with`;
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-slate-900/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full rounded-t-2xl bg-white p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-medium">{title}</h2>
        <ul className="mt-2">
          {options.map((option) => (
            <li key={option.key} className="border-t border-slate-200">
              <button type="button" onClick={() => onPick(option.key)} className="flex w-full items-center justify-between py-3 text-left">
                <span>{option.label}</span>
                <span className="text-sm text-slate-600">{option.remaining} left</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onCancel} className="mt-2 w-full rounded-lg border border-slate-300 py-2">Cancel</button>
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/useAbilityUse.tsx`:

```tsx
import type { Ability } from '@cw/model';
import { availability, type ViewMode } from '@cw/rules';
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { SlotSheet } from './SlotSheet';

/**
 * What a view needs to make Use work: `request` uses the ability, first asking which slot pays
 * when more than one could, and `slotSheet` is that question, to render once in the view.
 */
export function useAbilityUse(mode: ViewMode): { request: (ability: Ability) => void; slotSheet: ReactNode } {
  const sheet = useStore((s) => s.sheet);
  const play = useStore((s) => s.play);
  const use = useStore((s) => s.use);
  const [pending, setPending] = useState<Ability | null>(null);

  function request(ability: Ability): void {
    if (!sheet) return;
    const a = availability(ability, sheet, play, mode);
    if (!a.canUse) return;
    if (a.slotOptions.length > 1) setPending(ability);
    else use(ability, mode);
  }

  const slotSheet = pending && sheet ? (
    <SlotSheet
      ability={pending}
      options={availability(pending, sheet, play, mode).slotOptions}
      onPick={(slotKey) => {
        use(pending, mode, slotKey);
        setPending(null);
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { request, slotSheet };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/components`
Expected: PASS.

- [ ] **Step 5: Run the typecheck, then commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/components
git commit -m "Add the row components: pips, chips, ability row, description, slot sheet

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 13: The character screen with the Combat and Explore views

**Files:**
- Create: `apps/web/src/views/CombatView.tsx`, `apps/web/src/views/ExploreView.tsx`
- Create: `apps/web/src/screens/Character.tsx`
- Create: `apps/web/src/views/CombatView.test.tsx`, `apps/web/src/views/ExploreView.test.tsx`

**Interfaces:**
- Consumes: the components of Task 12; `useStore` (Task 10); `routeHref`, `View` (Task 8); `combatGroups`, `exploreAbilities`, `pools`, `rollLine`, `TIMING_LABEL`, `abilityLabel`, `skillLabel` from `@cw/rules`.
- Produces:
  - `CombatView({ sheet: Sheet })`: regions labelled `Action`, `Bonus Action`, `Reaction` and (only when not empty) `Other`; folded groups `No action needed (N)`, `Anyone can do this` and `Keep in mind (N)`; three pill buttons labelled `{Action|Bonus Action|Reaction}: {spent|available}` with `aria-pressed`.
  - `ExploreView({ sheet: Sheet })`: a search box labelled `Search skills and abilities`; regions `Skill checks`, `Saving throws`, `Out of combat abilities`, `Keep in mind`; buttons `Short Rest` and `Long Rest`.
  - `CharacterScreen({ id: string; view: View })`: opens the character, renders the header (name as the `h1`, a navigation labelled `View`), the view, and a pinned footer with the undo bar (`role="status"`, an `Undo` button) and, in Combat, `Start my turn`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/views/CombatView.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';

async function openCombat(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="combat" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const row = (name: string, index = 0) => screen.getAllByRole('article', { name })[index];
const use = (name: string, index = 0) => within(row(name, index)).getByRole('button', { name: `Use ${name}` });
const pill = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}: `) });

describe('Combat view', () => {
  it('groups abilities by Action, Bonus Action and Reaction', async () => {
    await openCombat('vlad');
    const names = (group: string) =>
      within(screen.getByRole('region', { name: group })).getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(names('Action').slice(0, 4)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe', 'Wurms Claw - Hammer', 'Unarmed Strike']);
    expect(names('Bonus Action')).toEqual(['Hex', 'Misty Step', 'Misty Step', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond']);
    expect(names('Reaction')).toEqual(['Hellish Rebuke', 'Hellish Rebuke']);
    expect(screen.getByText('No action needed (7)')).toBeInTheDocument();
    expect(screen.getByText('Anyone can do this')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Other' })).toBeNull();
  });

  it('uses an ability: spends the pill and the slot, shows concentration and offers undo', async () => {
    await openCombat('vlad');
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(use('Hex'));

    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
    expect(screen.getByText('Used Hex. Spent: Bonus Action, a pact slot.')).toBeInTheDocument();

    expect(use('Arms of Hadar')).toBeDisabled();
    expect(row('Arms of Hadar')).toHaveTextContent('You already spent a spell slot this turn.');
    expect(use('Eldritch Blast')).toBeEnabled();
    expect(use('Misty Step', 0)).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Pact slots: 2 of 2 left' })).toBeInTheDocument();
    expect(screen.queryByText('Concentrating on Hex')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('starts a new turn: pills reset, spent resources and concentration stay', async () => {
    await openCombat('vlad');
    await userEvent.click(use('Hex'));
    await userEvent.click(use('Eldritch Blast'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Start my turn' }));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
    expect(use('Arms of Hadar')).toBeEnabled();
    expect(screen.getByText('Started a new turn.')).toBeInTheDocument();
  });

  it('lets the player flip a pill, tap a pip and end concentration by hand', async () => {
    await openCombat('vlad');
    await userEvent.click(pill('Action'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(use('Eldritch Blast')).toBeDisabled();
    await userEvent.click(pill('Action'));
    expect(use('Eldritch Blast')).toBeEnabled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Spend one Pact slots' })[0]);
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Pact slots' }));
    expect(screen.getByRole('group', { name: 'Pact slots: 2 of 2 left' })).toBeInTheDocument();

    await userEvent.click(use('Hex'));
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(screen.queryByText('Concentrating on Hex')).toBeNull();
  });

  it('spends a weapon\'s charge from its row without spending the Action', async () => {
    await openCombat('vlad');
    const sword = row('Wurms Claw - Sword');
    await userEvent.click(within(sword).getAllByRole('button', { name: 'Spend one Wurms Claw - Sword' })[0]);
    expect(within(sword).getByRole('group', { name: 'Wurms Claw - Sword: 2 of 3 left' })).toBeInTheDocument();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(use('Wurms Claw - Sword'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sword).getByRole('group', { name: 'Wurms Claw - Sword: 2 of 3 left' })).toBeInTheDocument();
  });

  it('asks which slot pays when more than one level could', async () => {
    await openCombat('minkis');
    await userEvent.click(use('Chromatic Orb'));
    const dialog = screen.getByRole('dialog', { name: 'Cast Chromatic Orb with' });
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: /Level 2 slot/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Level 1 slots: 4 of 4 left' })).toBeInTheDocument();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
  });

  it('spends nothing when the slot question is cancelled, and does not ask when one level could pay', async () => {
    await openCombat('minkis');
    await userEvent.click(use('Chromatic Orb'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(use('Mind Spike'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
  });

  it('states the number of attacks only when it is more than one', async () => {
    await openCombat('danger');
    expect(screen.getByText('Attack action: 2 attacks')).toBeInTheDocument();
  });

  it('does not state the number of attacks for one attack', async () => {
    await openCombat('vlad');
    expect(screen.queryByText(/Attack action:/)).toBeNull();
  });

  it('spends the Action for a universal action', async () => {
    await openCombat('vlad');
    await userEvent.click(use('Dash'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Used Dash. Spent: Action.')).toBeInTheDocument();
  });

  it('lists abilities with unknown timing under Other', async () => {
    await openCombat('franny');
    expect(within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')).toHaveLength(2);
  });

  it('lists every conditional note under Keep in mind, with its subject', async () => {
    await openCombat('danger');
    expect(screen.getByText('Keep in mind (1)')).toBeInTheDocument();
    expect(screen.getByText('Constitution save: Advantage: saving throws that you make to maintain Concentration.')).toBeInTheDocument();
  });

  it('says so when the sheet has no class or level', async () => {
    await useStore.getState().init(memoryStorage());
    const record = await useStore.getState().saveImported({ data: { id: 7, name: 'Blank' } });
    if (!record) throw new Error('the blank sheet did not import');
    render(<CharacterScreen id={record.id} view="combat" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No class or level was found on this sheet');
    expect(screen.getByRole('article', { name: 'Unarmed Strike' })).toBeInTheDocument();
  });

  it('keeps play state when the view is left and opened again', async () => {
    const record = await openCombat('vlad');
    await userEvent.click(use('Hex'));
    await useStore.getState().open(record.id);
    expect(useStore.getState().play.spent).toEqual({ pact: 1 });
  });
});
```

Create `apps/web/src/views/ExploreView.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';

async function openExplore(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="explore" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const region = (name: string) => screen.getByRole('region', { name });
const labels = (name: string) =>
  within(region(name)).getAllByRole('article').map((a) => a.getAttribute('aria-label'));

describe('Explore view', () => {
  it('lists proficient skills first with the full roll, then the rest', async () => {
    await openExplore('vlad');
    const skills = labels('Skill checks');
    expect(skills).toHaveLength(18);
    expect(skills.slice(0, 5)).toEqual(['Arcana', 'Investigation', 'Perception', 'Sleight of Hand', 'Stealth']);
    expect(skills.indexOf('Athletics')).toBeGreaterThan(skills.indexOf('Stealth'));
    const investigation = within(region('Skill checks')).getByRole('article', { name: 'Investigation' });
    expect(investigation).toHaveTextContent('expertise');
    expect(investigation).toHaveTextContent('Roll d20 + 7.');
    expect(within(region('Skill checks')).getByRole('article', { name: 'Athletics' })).toHaveTextContent('Roll d20 - 1.');
    expect(screen.getByText('13 more skills')).toBeInTheDocument();
  });

  it('puts a note on the skill it belongs to', async () => {
    await openExplore('vlad');
    expect(within(region('Skill checks')).getByRole('article', { name: 'Intimidation' }))
      .toHaveTextContent('Advantage (roll twice, keep the higher).');
    expect(within(region('Keep in mind')).getByText('No other notes on this sheet.')).toBeInTheDocument();
  });

  it('lists saving throws in the same format, with their notes', async () => {
    await openExplore('danger');
    const saves = labels('Saving throws');
    expect(saves).toHaveLength(6);
    expect(saves.slice(0, 2)).toEqual(['Strength save', 'Constitution save']);
    expect(within(region('Saving throws')).getByRole('article', { name: 'Constitution save' }))
      .toHaveTextContent('Advantage: saving throws that you make to maintain Concentration.');
    expect(screen.getByText('4 more saves')).toBeInTheDocument();
  });

  it('puts notes that belong to no row under Keep in mind', async () => {
    await openExplore('franny');
    const items = within(region('Keep in mind')).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Damage 1d12, bludgeoning: DC 14 Dex Save.', 'Immunity, charmed: Raging.', 'Immunity, frightened: Raging.']);
  });

  it('lists out of combat abilities and has no turn tracker', async () => {
    await openExplore('vlad');
    expect(labels('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step', 'Phantasmal Force', 'Misty Step', 'Magical Cunning',
    ]);
    expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Action: / })).toBeNull();
  });

  it('deducts the cost on Use and leaves the turn alone', async () => {
    await openExplore('vlad');
    const charm = within(region('Out of combat abilities')).getByRole('article', { name: 'Charm Person' });
    await userEvent.click(within(charm).getByRole('button', { name: 'Use Charm Person' }));
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(useStore.getState().play.turn).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
    expect(screen.getByText('Used Charm Person. Spent: a pact slot.')).toBeInTheDocument();
  });

  it('filters skills, saves and abilities by the search text', async () => {
    await openExplore('vlad');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search skills and abilities' }), 'cha');
    expect(labels('Saving throws')).toEqual(['Charisma save']);
    expect(labels('Out of combat abilities')).toEqual(['Charm Person']);
    expect(screen.queryByRole('region', { name: 'Skill checks' })).toBeNull();

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'ath');
    expect(labels('Skill checks')).toEqual(['Athletics']);
    expect(screen.queryByText(/more skills/)).toBeNull();

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Nothing matches "zzz".')).toBeInTheDocument();
  });

  it('takes a Short Rest and a Long Rest, each of which can be undone', async () => {
    await openExplore('danger');
    const surge = ability('Action Surge');
    const wind = ability('Second Wind');
    useStore.getState().use(surge, 'explore');
    useStore.getState().use(wind, 'explore');

    await userEvent.click(screen.getByRole('button', { name: 'Short Rest' }));
    expect(useStore.getState().play.spent).toEqual({ [wind.key]: 1 });
    expect(screen.getByText('Took a Short Rest.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
    expect(useStore.getState().play.spent).toEqual({});
    expect(screen.getByText('Took a Long Rest.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useStore.getState().play.spent).toEqual({ [wind.key]: 1 });
  });

  it('marks rituals and abilities that take a minute or more', async () => {
    await openExplore('minkis');
    const list = region('Out of combat abilities');
    expect(within(list).getByRole('article', { name: 'Detect Magic' })).toHaveTextContent('ritual');
    expect(within(list).getByRole('article', { name: 'Identify' })).toHaveTextContent('takes a minute or more');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/src/views`
Expected: FAIL. `../screens/Character` does not exist.

- [ ] **Step 3: Write the Combat view**

Create `apps/web/src/views/CombatView.tsx`:

```tsx
import type { Ability } from '@cw/model';
import { TIMING_LABEL, combatGroups, pools, type Sheet, type TurnTiming } from '@cw/rules';
import { useMemo, type ReactNode } from 'react';
import { AbilityRow } from '../components/AbilityRow';
import { NotesList } from '../components/NotesList';
import { ResourceChips } from '../components/ResourceChips';
import { useAbilityUse } from '../components/useAbilityUse';
import { useStore } from '../store';

const TIMINGS: TurnTiming[] = ['action', 'bonus', 'reaction'];

const SUMMARY = 'flex cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700';

/** A group that is always open: Action, Bonus Action, Reaction, Other. */
function Group({ title, hint, spent, children }: { title: string; hint?: string; spent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`mt-4 ${spent ? 'opacity-60' : ''}`}>
      <h2 className="flex items-baseline justify-between text-sm font-medium text-slate-700">
        <span>{spent ? `${title} · spent` : title}</span>
        {hint ? <span className="text-xs font-normal text-slate-600">{hint}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** A group that starts folded. */
function Folded({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="mt-4 border-t border-slate-200">
      <summary className={SUMMARY}>
        <span>{count !== undefined ? `${title} (${count})` : title}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      {children}
    </details>
  );
}

export function CombatView({ sheet }: { sheet: Sheet }) {
  const play = useStore((s) => s.play);
  const adjust = useStore((s) => s.adjust);
  const togglePill = useStore((s) => s.togglePill);
  const endConcentration = useStore((s) => s.endConcentration);
  const { request, slotSheet } = useAbilityUse('combat');
  const groups = useMemo(() => combatGroups(sheet), [sheet]);
  const allPools = useMemo(() => pools(sheet), [sheet]);
  const concentration = play.concentrationKey
    ? sheet.abilities.find((a) => a.key === play.concentrationKey)?.name ?? null
    : null;

  const rows = (abilities: Ability[]): ReactNode =>
    abilities.map((ability) => (
      <AbilityRow
        key={ability.key}
        ability={ability}
        sheet={sheet}
        state={play}
        mode="combat"
        onUse={request}
        onAdjust={(pool, delta) => adjust(pool.key, delta)}
      />
    ));

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 flex gap-2 bg-slate-50 px-4 py-2">
        {TIMINGS.map((timing) => {
          const spent = play.turn[timing];
          return (
            <button
              key={timing}
              type="button"
              aria-pressed={spent}
              aria-label={`${TIMING_LABEL[timing]}: ${spent ? 'spent' : 'available'}`}
              onClick={() => togglePill(timing)}
              className={`flex-1 rounded-full border px-2 py-1.5 text-sm ${
                spent ? 'border-slate-300 text-slate-500 line-through' : 'border-indigo-300 bg-indigo-50 text-indigo-900'
              }`}
            >
              {TIMING_LABEL[timing]}
            </button>
          );
        })}
      </div>

      <ResourceChips pools={allPools} state={play} onAdjust={(pool, delta) => adjust(pool.key, delta)} />

      {concentration ? (
        <p role="status" className="mt-3 flex items-center justify-between rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          <span>Concentrating on {concentration}</span>
          <button type="button" onClick={endConcentration} className="underline">End</button>
        </p>
      ) : null}

      <Group
        title="Action"
        spent={play.turn.action}
        hint={sheet.attacksPerAction > 1 ? `Attack action: ${sheet.attacksPerAction} attacks` : undefined}
      >
        {rows(groups.action)}
      </Group>
      <Group title="Bonus Action" spent={play.turn.bonus}>
        {groups.bonus.length > 0 ? rows(groups.bonus) : <p className="py-2 text-sm text-slate-600">Nothing uses your Bonus Action.</p>}
      </Group>
      <Group title="Reaction" spent={play.turn.reaction}>
        {groups.reaction.length > 0 ? rows(groups.reaction) : <p className="py-2 text-sm text-slate-600">Nothing uses your Reaction.</p>}
      </Group>
      {groups.other.length > 0 ? <Group title="Other">{rows(groups.other)}</Group> : null}
      {groups.free.length > 0 ? <Folded title="No action needed" count={groups.free.length}>{rows(groups.free)}</Folded> : null}
      <Folded title="Anyone can do this">{rows(sheet.universal)}</Folded>
      <Folded title="Keep in mind" count={sheet.notes.length}>
        <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
      </Folded>

      {slotSheet}
    </div>
  );
}
```

- [ ] **Step 4: Write the Explore view**

Create `apps/web/src/views/ExploreView.tsx`:

```tsx
import { ABILITIES, SKILLS, type ProficiencyLevel } from '@cw/model';
import { abilityLabel, exploreAbilities, pools, rollLine, skillLabel, type Note, type Sheet } from '@cw/rules';
import { useMemo, useState, type ReactNode } from 'react';
import { AbilityRow } from '../components/AbilityRow';
import { NotesList } from '../components/NotesList';
import { ResourceChips } from '../components/ResourceChips';
import { useAbilityUse } from '../components/useAbilityUse';
import { useStore } from '../store';

/** One skill or saving throw: a name, a d20 roll and any notes that belong to it. */
interface CheckRow {
  key: string;
  label: string;
  bonus: number;
  /** "proficient", "expertise", "half proficiency", or null. */
  level: string | null;
  proficient: boolean;
  notes: Note[];
}

const LEVEL_LABEL: Record<ProficiencyLevel, string | null> = {
  none: null,
  half: 'half proficiency',
  proficient: 'proficient',
  expertise: 'expertise',
};

function skillRows(sheet: Sheet): CheckRow[] {
  return SKILLS.map((skill) => ({
    key: skill,
    label: skillLabel(skill),
    bonus: sheet.skills[skill],
    level: LEVEL_LABEL[sheet.skillLevels[skill]],
    proficient: sheet.skillLevels[skill] !== 'none',
    notes: sheet.notes.filter((n) => n.target.kind === 'skill' && n.target.skill === skill),
  }));
}

function saveRows(sheet: Sheet): CheckRow[] {
  return ABILITIES.map((ability) => ({
    key: ability,
    label: `${abilityLabel(ability)} save`,
    bonus: sheet.saves[ability],
    level: sheet.saveProficiency[ability] ? 'proficient' : null,
    proficient: sheet.saveProficiency[ability],
    notes: sheet.notes.filter((n) => n.target.kind === 'save' && n.target.ability === ability),
  }));
}

function Check({ row }: { row: CheckRow }) {
  return (
    <article aria-label={row.label} className="border-t border-slate-200 py-2">
      <span className="font-medium">{row.label}</span>
      {row.level ? <span className="ml-2 text-xs text-slate-500">{row.level}</span> : null}
      <span className="block text-sm">{rollLine({ kind: 'check', bonus: row.bonus })}</span>
      {row.notes.map((note) => <span key={note.text} className="block text-sm text-indigo-800">{note.text}</span>)}
    </article>
  );
}

/** Proficient rows first; the rest folded away unless the player is searching. */
function CheckList({ title, rows, searching, more }: { title: string; rows: CheckRow[]; searching: boolean; more: string }) {
  if (rows.length === 0) return null;
  const first = searching ? rows : rows.filter((row) => row.proficient);
  const rest = searching ? [] : rows.filter((row) => !row.proficient);
  return (
    <section aria-label={title} className="mt-4">
      <h2 className="text-sm font-medium text-slate-700">{title}</h2>
      {first.map((row) => <Check key={row.key} row={row} />)}
      {rest.length > 0 ? (
        <details className="border-t border-slate-200">
          <summary className="flex cursor-pointer items-center justify-between py-2 text-sm text-slate-700">
            <span>{`${rest.length} more ${more}`}</span>
            <span aria-hidden="true">▾</span>
          </summary>
          {rest.map((row) => <Check key={row.key} row={row} />)}
        </details>
      ) : null}
    </section>
  );
}

export function ExploreView({ sheet }: { sheet: Sheet }) {
  const play = useStore((s) => s.play);
  const adjust = useStore((s) => s.adjust);
  const rest = useStore((s) => s.rest);
  const { request, slotSheet } = useAbilityUse('explore');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (text: string): boolean => needle === '' || text.toLowerCase().includes(needle);

  const allPools = useMemo(() => pools(sheet), [sheet]);
  const skills = useMemo(() => skillRows(sheet), [sheet]);
  const saves = useMemo(() => saveRows(sheet), [sheet]);
  const abilities = useMemo(() => exploreAbilities(sheet), [sheet]);
  const otherNotes = useMemo(() => sheet.notes.filter((n) => n.target.kind === 'other'), [sheet]);

  const shownSkills = skills.filter((row) => matches(row.label));
  const shownSaves = saves.filter((row) => matches(row.label));
  const shownAbilities = abilities.filter((a) => matches(a.name));
  const nothing = shownSkills.length + shownSaves.length + shownAbilities.length === 0;

  let abilityList: ReactNode = null;
  if (shownAbilities.length > 0) {
    abilityList = shownAbilities.map((ability) => (
      <AbilityRow
        key={ability.key}
        ability={ability}
        sheet={sheet}
        state={play}
        mode="explore"
        onUse={request}
        onAdjust={(pool, delta) => adjust(pool.key, delta)}
      />
    ));
  } else if (needle === '') {
    abilityList = <p className="py-2 text-sm text-slate-600">Nothing on this sheet is marked for use outside combat.</p>;
  }

  return (
    <div>
      <label htmlFor="search" className="sr-only">Search skills and abilities</label>
      <input
        id="search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search skills and abilities"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
      />

      <ResourceChips pools={allPools} state={play} onAdjust={(pool, delta) => adjust(pool.key, delta)} />

      {nothing ? <p className="mt-4 text-sm text-slate-600">Nothing matches "{query.trim()}".</p> : null}

      <CheckList title="Skill checks" rows={shownSkills} searching={needle !== ''} more="skills" />
      <CheckList title="Saving throws" rows={shownSaves} searching={needle !== ''} more="saves" />

      {abilityList ? (
        <section aria-label="Out of combat abilities" className="mt-4">
          <h2 className="text-sm font-medium text-slate-700">Out of combat abilities</h2>
          {abilityList}
        </section>
      ) : null}

      <section aria-label="Keep in mind" className="mt-4">
        <h2 className="text-sm font-medium text-slate-700">Keep in mind</h2>
        <NotesList notes={otherNotes} empty="No other notes on this sheet." />
      </section>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => rest('short')} className="flex-1 rounded-lg border border-slate-400 px-3 py-3 font-medium">
          Short Rest
        </button>
        <button type="button" onClick={() => rest('long')} className="flex-1 rounded-lg border border-slate-400 px-3 py-3 font-medium">
          Long Rest
        </button>
      </div>

      {slotSheet}
    </div>
  );
}
```

- [ ] **Step 5: Write the character screen**

Create `apps/web/src/screens/Character.tsx`:

```tsx
import { useEffect } from 'react';
import { routeHref, type View } from '../router';
import { useStore } from '../store';
import { CombatView } from '../views/CombatView';
import { ExploreView } from '../views/ExploreView';

const TAB = 'rounded-full px-3 py-1 text-sm';
const TAB_ON = `${TAB} bg-slate-900 text-white`;
const TAB_OFF = `${TAB} bg-slate-200 text-slate-800`;

/** One character: the header, the Combat or Explore view, and the pinned undo bar and turn button. */
export function CharacterScreen({ id, view }: { id: string; view: View }) {
  const open = useStore((s) => s.open);
  const known = useStore((s) => s.characters.some((c) => c.id === id));
  const openId = useStore((s) => s.openId);
  const sheet = useStore((s) => s.sheet);
  const undo = useStore((s) => s.undo);
  const undoLast = useStore((s) => s.undoLast);
  const startTurn = useStore((s) => s.startTurn);

  useEffect(() => {
    void open(id);
  }, [id, open]);

  if (!known) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">That character isn't on this device.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-block text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  if (openId !== id || !sheet) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;

  return (
    <main className="mx-auto max-w-md px-4 pb-32 pt-3">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <a href={routeHref({ name: 'home' })} className="text-sm text-indigo-700">‹ Characters</a>
          <h1 className="truncate text-lg font-semibold">{sheet.name}</h1>
          {sheet.classLine ? <p className="text-xs text-slate-600">{sheet.classLine}</p> : null}
        </div>
        <nav aria-label="View" className="flex shrink-0 gap-1">
          <a
            href={routeHref({ name: 'character', id, view: 'combat' })}
            aria-current={view === 'combat' ? 'page' : undefined}
            className={view === 'combat' ? TAB_ON : TAB_OFF}
          >
            Combat
          </a>
          <a
            href={routeHref({ name: 'character', id, view: 'explore' })}
            aria-current={view === 'explore' ? 'page' : undefined}
            className={view === 'explore' ? TAB_ON : TAB_OFF}
          >
            Explore
          </a>
        </nav>
      </header>

      {sheet.level === 0 ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          No class or level was found on this sheet, so most abilities are missing. Go back and re-import it.
        </p>
      ) : null}

      <div className="mt-3">{view === 'combat' ? <CombatView sheet={sheet} /> : <ExploreView sheet={sheet} />}</div>

      {undo || view === 'combat' ? (
        <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md space-y-2 bg-slate-50 px-4 pb-4 pt-2">
          {undo ? (
            <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">
              <span>{undo.message}</span>
              <button type="button" onClick={undoLast} className="font-medium underline">Undo</button>
            </p>
          ) : null}
          {view === 'combat' ? (
            <button type="button" onClick={startTurn} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white">
              Start my turn
            </button>
          ) : null}
        </footer>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/views`
Expected: PASS.

- [ ] **Step 7: Run all tests and the typecheck, then commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

```bash
git add apps/web/src/views apps/web/src/screens/Character.tsx
git commit -m "Add the character screen with the Combat and Explore views

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 14: Home, Import and About screens and the app shell

**Files:**
- Create: `apps/web/src/screens/Home.tsx`, `Import.tsx`, `About.tsx`
- Create: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`, `apps/web/src/index.css`
- Create: `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/.env.example`
- Create: `apps/web/src/test/render.tsx`, `apps/web/src/screens/screens.test.tsx`

**Interfaces:**
- Consumes: `CharacterScreen` (Task 13); `fetchCharacter`, `IMPORT_MESSAGES`, `PRIVACY_HINT` (Task 11); `devImport` (Task 11); `parseCharacterId` (Task 1); `useStore`, `sheetFor` (Task 10); `useRoute`, `navigate`, `routeHref` (Task 8).
- Produces: `HomeScreen()`, `ImportScreen()`, `AboutScreen()`, `App()`; test helper `renderAt(route: Route)` from `apps/web/src/test/render.tsx`.
- Copy the screens show (the tests assert it exactly):
  - Import, bad input: `Paste a D&D Beyond character link or its number.`
  - Import, not JSON: `That isn't valid JSON.` Not a character: `That doesn't look like a D&D Beyond character.`
  - Home, empty: `Add your first character`. Re-import success: `Updated from D&D Beyond.` Re-import failure: the import message followed by ` Your saved copy still works.`
  - Unknown character: `That character isn't on this device.`
  - Not saving: `This device isn't saving changes. They will be lost when you close the page.`

- [ ] **Step 1: Write the render helper and the failing test**

Create `apps/web/src/test/render.tsx`:

```tsx
import { render } from '@testing-library/react';
import { App } from '../App';
import { routeHref, type Route } from '../router';

/** Renders the whole app at a route. Seed the store first; a loaded store is not re-initialised. */
export function renderAt(route: Route) {
  window.location.hash = routeHref(route);
  return render(<App />);
}
```

Create `apps/web/src/screens/screens.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import { memoryStorage, type AppStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';
import { renderAt } from '../test/render';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', mock);
  return mock;
};

async function emptyApp(storage: AppStorage = memoryStorage()) {
  await useStore.getState().init(storage);
}

describe('Home screen', () => {
  it('invites the first import when there are no characters', async () => {
    await emptyApp();
    renderAt({ name: 'home' });
    expect(screen.getByText('Add your first character')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a character' })).toHaveAttribute('href', '#/import');
    expect(screen.getByRole('link', { name: 'About and credits' })).toHaveAttribute('href', '#/about');
  });

  it('lists a character with its class and level and links to its Combat view', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'home' });
    const link = screen.getByRole('link', { name: /Vlad/ });
    expect(link).toHaveAttribute('href', `#/c/${record.id}/combat`);
    expect(link).toHaveTextContent('Warlock 3');
    expect(link).toHaveTextContent('Imported');
  });

  it('deletes a character only after the player confirms', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Vlad/ })).toBeNull());
    expect(useStore.getState().characters).toEqual([]);
  });

  it('re-imports a character by its D&D Beyond ID', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText('Updated from D&D Beyond.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"1"}');
    expect(useStore.getState().characters).toHaveLength(1);
  });

  it('keeps the saved copy when a re-import fails', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    stubFetch(() => json(403, { status: 'private' }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText(/This sheet is Private\..*Your saved copy still works\./)).toBeInTheDocument();
    expect(useStore.getState().characters).toHaveLength(1);
  });
});

describe('Import screen', () => {
  const linkField = () => screen.getByLabelText('D&D Beyond character link or number');

  it('imports by link and opens the character in Combat', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
    await userEvent.type(linkField(), 'https://www.dndbeyond.com/characters/123456789?utm=share');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"123456789"}');
    const [record] = useStore.getState().characters;
    expect(window.location.hash).toBe(`#/c/${record.id}/combat`);
    expect(screen.getByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
  });

  it('rejects text that is not a character link or number, without calling the service', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const fetchMock = stubFetch(() => json(200, {}));
    await userEvent.type(linkField(), 'https://example.com/characters/1');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Paste a D&D Beyond character link or its number.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'private', 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.'],
    [404, 'not-found', 'No character with that ID.'],
    [502, 'upstream-error', "D&D Beyond didn't respond as expected."],
  ])('explains a %i %s answer', async (httpStatus, status, message) => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(httpStatus, { status }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(useStore.getState().characters).toEqual([]);
  });

  it('says where the privacy setting is when the sheet is Private', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => json(403, { status: 'private' }));
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('on the Home step set Character Privacy to Public');
  });

  it('says so when the import service cannot be reached', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    stubFetch(() => { throw new TypeError('Failed to fetch'); });
    await userEvent.type(linkField(), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the import service.");
  });

  it('imports pasted JSON', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    // fireEvent, not userEvent.type: the fixture is about 250 KB.
    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(loadRaw('minkis')) } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
  });

  it('imports a chosen JSON file', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    const file = new File([JSON.stringify(loadRaw('sid'))], 'sid.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Or choose a JSON file'), file);
    expect(await screen.findByRole('heading', { name: 'Sid' })).toBeInTheDocument();
  });

  it('explains pasted text that is not JSON or not a character', async () => {
    await emptyApp();
    renderAt({ name: 'import' });
    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: '{ not json' } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(screen.getByRole('alert')).toHaveTextContent("That isn't valid JSON.");

    fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: '{"hello":"world"}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
    expect(await screen.findByText("That doesn't look like a D&D Beyond character.")).toBeInTheDocument();
    expect(useStore.getState().characters).toEqual([]);
  });
});

describe('App', () => {
  it('shows the About screen with the SRD attribution and the not-affiliated statement', async () => {
    await emptyApp();
    renderAt({ name: 'about' });
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('System Reference Document 5.2');
    expect(main).toHaveTextContent('Creative Commons Attribution 4.0 International License');
    expect(main).toHaveTextContent('not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast');
  });

  it('says so when the character in the address is not on this device', async () => {
    await emptyApp();
    renderAt({ name: 'character', id: 'no-such-id', view: 'combat' });
    expect(screen.getByText("That character isn't on this device.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
  });

  it('warns when the device is not saving', async () => {
    const broken: AppStorage = { ...memoryStorage(), listCharacters: async () => { throw new Error('blocked'); } };
    await emptyApp(broken);
    renderAt({ name: 'home' });
    expect(screen.getByRole('alert')).toHaveTextContent("This device isn't saving changes.");
  });

  it('switches between Combat and Explore from the header', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    const nav = await screen.findByRole('navigation', { name: 'View' });
    expect(within(nav).getByRole('link', { name: 'Combat' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('link', { name: 'Explore' }));
    expect(await screen.findByRole('region', { name: 'Skill checks' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/c/${record.id}/explore`);
  });

  it('loads stored characters by itself on a fresh start', async () => {
    useStore.setState({ ready: false, characters: [] });
    renderAt({ name: 'home' });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Add your first character')).toBeInTheDocument();
    expect(useStore.getState().persistent).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/screens`
Expected: FAIL. `../App` does not exist.

- [ ] **Step 3: Write the three screens**

Create `apps/web/src/screens/Home.tsx`:

```tsx
import { useState } from 'react';
import { IMPORT_MESSAGES, fetchCharacter } from '../import/client';
import { routeHref } from '../router';
import { sheetFor, useStore } from '../store';
import type { StoredCharacter } from '../storage';

const importedOn = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

function CharacterCard({ character }: { character: StoredCharacter }) {
  const saveImported = useStore((s) => s.saveImported);
  const remove = useStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sheet = sheetFor(character);

  async function reimport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await fetchCharacter(character.ddbId);
    setBusy(false);
    if (result.status !== 'ok') {
      setMessage(`${IMPORT_MESSAGES[result.status]} Your saved copy still works.`);
      return;
    }
    const record = await saveImported(result.raw);
    setMessage(record ? 'Updated from D&D Beyond.' : "D&D Beyond didn't respond as expected. Your saved copy still works.");
  }

  function confirmRemove(): void {
    if (window.confirm(`Delete ${character.name} from this device? This can't be undone.`)) void remove(character.id);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <a href={routeHref({ name: 'character', id: character.id, view: 'combat' })} className="block">
        <span className="block text-lg font-medium">{character.name}</span>
        <span className="block text-sm text-slate-600">
          {[sheet.classLine, `Imported ${importedOn(character.importedAt)}`].filter((part) => part.trim() !== '').join(' · ')}
        </span>
      </a>
      <div className="mt-2 flex gap-2 text-sm">
        <button type="button" onClick={() => void reimport()} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5">
          {busy ? 'Updating…' : 'Re-import'}
        </button>
        <button type="button" onClick={confirmRemove} className="rounded-lg border border-slate-300 px-3 py-1.5 text-red-800">
          Delete
        </button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </li>
  );
}

export function HomeScreen() {
  const characters = useStore((s) => s.characters);
  const sorted = [...characters].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Your characters</h1>
      {sorted.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-medium">Add your first character</p>
          <p className="mt-1 text-sm text-slate-600">Bring a character in from D&D Beyond to see what they can do on their turn.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((character) => <CharacterCard key={character.id} character={character} />)}
        </ul>
      )}
      <a
        href={routeHref({ name: 'import' })}
        className="mt-4 block rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
      >
        Add a character
      </a>
      <p className="mt-6 text-center text-sm">
        <a href={routeHref({ name: 'about' })} className="text-indigo-700">About and credits</a>
      </p>
    </main>
  );
}
```

Create `apps/web/src/screens/Import.tsx`:

```tsx
import { parseCharacterId } from '@cw/ddb-import';
import { useState, type FormEvent } from 'react';
import { IMPORT_MESSAGES, PRIVACY_HINT, fetchCharacter } from '../import/client';
import { navigate, routeHref } from '../router';
import { useStore } from '../store';

const NOT_A_CHARACTER = "That doesn't look like a D&D Beyond character.";

export function ImportScreen() {
  const saveImported = useStore((s) => s.saveImported);
  const [link, setLink] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const fail = (message: string, extra: string | null = null): void => {
    setError(message);
    setHint(extra);
  };

  /** Stores the raw JSON and opens the character, or says why it could not. */
  async function store(raw: unknown): Promise<void> {
    const record = await saveImported(raw);
    if (!record) return fail(NOT_A_CHARACTER);
    navigate({ name: 'character', id: record.id, view: 'combat' });
  }

  async function importByLink(event: FormEvent): Promise<void> {
    event.preventDefault();
    const id = parseCharacterId(link);
    if (id === null) return fail('Paste a D&D Beyond character link or its number.');
    setBusy(true);
    setError(null);
    setHint(null);
    const result = await fetchCharacter(id);
    setBusy(false);
    if (result.status === 'ok') return store(result.raw);
    fail(IMPORT_MESSAGES[result.status], result.status === 'private' ? PRIVACY_HINT : null);
  }

  async function importJson(text: string): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("That isn't valid JSON.");
    }
    await store(raw);
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">Add a character</h1>

      <form onSubmit={(event) => void importByLink(event)} className="mt-4">
        <label htmlFor="link" className="block text-sm font-medium">D&D Beyond character link or number</label>
        <input
          id="link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://www.dndbeyond.com/characters/123456789"
          inputMode="url"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
        <p className="mt-1 text-xs text-slate-600">The sheet's Character Privacy must be set to Public.</p>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </form>

      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>{error}</p>
          {hint ? <p className="mt-1">{hint}</p> : null}
        </div>
      ) : null}

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">Paste the character JSON instead</summary>
        <p className="mt-2 text-xs text-slate-600">
          Use this if the import can't reach D&D Beyond. Paste the JSON, or choose a saved file.
        </p>
        <label htmlFor="json" className="mt-2 block text-sm font-medium">Character JSON</label>
        <textarea
          id="json"
          value={json}
          onChange={(event) => setJson(event.target.value)}
          rows={5}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void importJson(json)}
          className="mt-2 w-full rounded-lg border border-slate-400 px-4 py-2 text-sm font-medium"
        >
          Use this JSON
        </button>
        <label htmlFor="file" className="mt-3 block text-sm font-medium">Or choose a JSON file</label>
        <input
          id="file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(importJson);
          }}
          className="mt-1 block w-full text-sm"
        />
      </details>
    </main>
  );
}
```

Create `apps/web/src/screens/About.tsx`. The attribution wording is the same as in `README.md` and must stay word for word.

```tsx
import { routeHref } from '../router';

export function AboutScreen() {
  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">About Character Wizard</h1>
      <p className="mt-3 text-sm">
        A play aid for D&D (2024 rules). It shows what your character can do, grouped by Action, Bonus Action
        and Reaction, with every roll written out.
      </p>
      <h2 className="mt-5 font-medium">Licensing and attribution</h2>
      <p className="mt-2 text-sm">
        This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast
        LLC, available at{' '}
        <a href="https://www.dndbeyond.com/srd" className="text-indigo-700 underline">https://www.dndbeyond.com/srd</a>.
        The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" className="text-indigo-700 underline">
          https://creativecommons.org/licenses/by/4.0/legalcode
        </a>.
      </p>
      <p className="mt-3 text-sm">
        Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
      </p>
      <h2 className="mt-5 font-medium">Your data</h2>
      <p className="mt-2 text-sm">
        Your characters and what you have spent are stored on this device only. Ability descriptions come from
        your own imported sheet.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Write the app shell**

Create `apps/web/src/App.tsx`:

```tsx
import { Component, useEffect, type ReactNode } from 'react';
import { useRoute } from './router';
import { AboutScreen } from './screens/About';
import { CharacterScreen } from './screens/Character';
import { HomeScreen } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { useStore } from './store';

/** Catches a crash in any screen. Stored characters and play state are not touched. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md p-4">
        <p className="font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-slate-600">Your saved characters are safe.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white"
        >
          Reload
        </button>
      </main>
    );
  }
}

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'import': return <ImportScreen />;
    case 'about': return <AboutScreen />;
    case 'character': return <CharacterScreen id={route.id} view={route.view} />;
    default: return <HomeScreen />;
  }
}

export function App() {
  const ready = useStore((s) => s.ready);
  const persistent = useStore((s) => s.persistent);
  const init = useStore((s) => s.init);

  useEffect(() => {
    // A store that is already loaded (as in tests) is left alone.
    if (!useStore.getState().ready) void init();
  }, [init]);

  if (!ready) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;
  return (
    <ErrorBoundary>
      {persistent ? null : (
        <p role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          This device isn't saving changes. They will be lost when you close the page.
        </p>
      )}
      <Screen />
    </ErrorBoundary>
  );
}
```

Create `apps/web/src/index.css`:

```css
@import "tailwindcss";

html {
  -webkit-text-size-adjust: 100%;
}

body {
  @apply bg-slate-50 text-slate-900 antialiased;
}

/* Hide the default disclosure triangle; each summary draws its own chevron. */
summary {
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}

/* Sanitised description text from the player's sheet. */
.description p {
  @apply mb-2;
}
.description ul {
  @apply mb-2 list-disc pl-5;
}
.description ol {
  @apply mb-2 list-decimal pl-5;
}
.description table {
  @apply mb-2 w-full text-left text-xs;
}
.description th,
.description td {
  @apply border-b border-slate-200 py-1 pr-2 align-top;
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <title>Character Wizard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devImport } from './dev/import-plugin.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), devImport()],
  server: {
    // Listen on the local network so a phone on the same Wi-Fi can open the dev server.
    host: true,
  },
});
```

Create `apps/web/.env.example`:

```
# Copy to .env.local for a build that calls the deployed Edge Function.
# Leave both unset in local development: the dev server answers imports itself.
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/screens`
Expected: PASS.

- [ ] **Step 6: Run everything**

Run: `pnpm test`
Expected: PASS. 26 test files, 497 tests.

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm build`
Expected: `vite build` finishes with `✓ built` and writes `apps/web/dist/index.html`, one CSS file and one JS file (about 300 kB, about 100 kB gzipped). No warnings about the config file.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "Add the Home, Import and About screens and the app shell

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 15: Check the running app at phone width, and update the README

This task finds what the component tests cannot: layout, the real dev-server import endpoint and real IndexedDB.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: an updated README. Any defect found here is fixed in the file that owns it, with a test added first where a test can express it.

- [ ] **Step 1: Start the dev server**

Run (leave it running): `pnpm dev`
Expected: Vite prints a `Local:` URL (normally `http://localhost:5173/`) and a `Network:` URL.

- [ ] **Step 2: Check the dev import endpoint without calling D&D Beyond**

In a second terminal:

```bash
curl -s -i -X POST http://localhost:5173/functions/v1/import-character -H "Content-Type: application/json" -d '{"id":"abc"}'
```

Expected: `HTTP/1.1 400 Bad Request` and the body `{"status":"bad-request"}`.

- [ ] **Step 3: Walk through the app in a browser at 375 px wide**

Open the Local URL with the browser's device toolbar set to 375 by 812. Check each line; fix anything that fails.

1. Home shows "Add your first character" and the "Add a character" button.
2. Add a character, open "Paste the character JSON instead", choose the file `fixtures/characters/vlad.json`. The Combat view for Vlad opens.
3. Nothing scrolls sideways. The three pills stay at the top and "Start my turn" stays at the bottom while the list scrolls.
4. Use on Hex: the Bonus Action pill is struck through, Pact slots shows one empty pip, an amber "Concentrating on Hex" banner appears, and a dark bar reads "Used Hex. Spent: Bonus Action, a pact slot." with Undo.
5. Arms of Hadar is greyed, its Use button is disabled, and it reads "You already spent a spell slot this turn."
6. Undo restores all of step 4. Use Hex again, then "Start my turn": the pills reset and the slot stays spent.
7. Tap a pip under "Wurms Claw - Sword": one charge is spent and the Action pill does not change.
8. Tap the name of a spell row such as Hex: a grey box opens under it. For a fixture it reads "[removed]", because fixture descriptions are scrubbed. A weapon row reads "No description on the sheet."
9. Open "Anyone can do this" and tap Dash: the description is readable and Use spends the Action.
10. Reload the page. The character is still listed, and opening it shows the same spent slot and charge.
11. Explore: skills list proficient ones first; Intimidation shows "Advantage (roll twice, keep the higher)."; searching "cha" leaves the Charisma save and Charm Person; Long Rest restores everything and shows an Undo bar.
12. Back on Home, import `fixtures/characters/minkis.json` the same way. It replaces Vlad (all fixtures share D&D Beyond ID 1). Use on Chromatic Orb opens "Cast Chromatic Orb with" and lists Level 1 slot and Level 2 slot.
13. Delete asks for confirmation and removes the character.
14. About shows the SRD attribution and the not-affiliated statement.

- [ ] **Step 4: Update the README**

In `README.md`, replace the line `This repository currently contains the import and sheet maths. See `docs/superpowers/specs/` for the design.` with:

```markdown
This repository contains the import, the sheet maths, the turn engine and the web app. See `docs/superpowers/specs/` for the design.
```

Replace the `## Commands` code block with:

```markdown
    pnpm install
    pnpm test
    pnpm typecheck
    pnpm dev
    pnpm build
    pnpm sheet fixtures/characters/vlad.json
    pnpm fetch-character https://www.dndbeyond.com/characters/<id> <slug>

`pnpm dev` starts the app on your machine and on your local network, and answers character imports itself, so no Supabase project is needed for development. `fetch-character` and the app's import both need the sheet's Character Privacy set to Public.
```

(Remove the old sentence about `fetch-character` that the new paragraph replaces.)

Replace the `## Packages` list with:

```markdown
- `packages/model`: shared types.
- `packages/ddb-import`: converts D&D Beyond JSON into the app's `Character` format.
- `packages/rules`: calculates the sheet, the list of abilities, the roll lines and the turn engine.
- `apps/web`: the React app. Characters and play state are stored on the device.
- `supabase/functions/import-character`: the Edge Function that fetches a public character.
```

Leave the "Licensing and attribution" section unchanged.

- [ ] **Step 5: Run everything once more, then commit**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS, no type errors, build succeeds.

```bash
git add README.md apps/web packages
git commit -m "Describe the web app in the README

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 16: Deploy the Edge Function and the site (repository owner)

**This task needs the repository owner.** It creates accounts and handles keys, which an agent must not do. An agent executing the plan prepares Step 1, then stops and hands the remaining steps to the owner.

**Files:**
- Create: `supabase/config.toml`

**Interfaces:**
- Consumes: `supabase/functions/import-character` (Task 7); the web app (Task 14).
- Produces: a deployed function at `https://<project-ref>.supabase.co/functions/v1/import-character` and the site on Cloudflare Pages.

- [ ] **Step 1 (agent): Add the Supabase project config**

Create `supabase/config.toml`:

```toml
project_id = "character-wizard"

[functions.import-character]
verify_jwt = true
```

If a later `supabase` command rejects this file, delete it, run `pnpm dlx supabase init` to generate a full one, and add the `[functions.import-character]` block above to the generated file.

Commit:

```bash
git add supabase/config.toml
git commit -m "Add the Supabase project config

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

- [ ] **Step 2 (owner): Create the Supabase project**

At https://supabase.com, create a free project named `character-wizard`. From Project Settings, note the project reference and the project URL (`https://<project-ref>.supabase.co`). From Settings, API Keys, copy the publishable key (`sb_publishable_...`). Do not copy a secret key anywhere.

- [ ] **Step 3 (owner): Deploy the function**

From the repository root:

```bash
pnpm dlx supabase login
```

```bash
pnpm dlx supabase link --project-ref <project-ref>
```

```bash
pnpm dlx supabase functions deploy import-character
```

If the deploy command says it needs Docker, start Docker Desktop and run it again.

- [ ] **Step 4 (owner): Check the function before any origin is allowed**

```bash
curl -s -i -X POST https://<project-ref>.supabase.co/functions/v1/import-character -H "Content-Type: application/json" -H "apikey: <publishable key>" -d '{"id":"abc"}'
```

Expected: `400` and `{"status":"bad-request"}`. The request has no `Origin` header, so the origin list does not apply to it.

If the answer is `401` with a message about a missing or invalid JWT, the platform's own check is rejecting the publishable key. Change `verify_jwt = true` to `verify_jwt = false` in `supabase/config.toml`, deploy again and commit the change. The function still checks the key itself.

If the answer is `401` with the body `{"status":"unauthorized"}`, the request reached the function and the function found no key to check against: the platform did not provide `SUPABASE_PUBLISHABLE_KEYS`. Give the function the publishable key under its fallback name, then run the check again:

```bash
pnpm dlx supabase secrets set IMPORT_API_KEY=<publishable key>
```

Then fetch a real public character, using a sheet you own that is set to Public:

```bash
curl -s -X POST https://<project-ref>.supabase.co/functions/v1/import-character -H "Content-Type: application/json" -H "apikey: <publishable key>" -d '{"id":"<your character id>"}' | head -c 200
```

Expected: the output starts `{"status":"ok","raw":{`.

- [ ] **Step 5 (owner): Deploy the site to Cloudflare Pages**

In the Cloudflare dashboard, create a Pages project connected to the GitHub repository `daveydampier/CharacterWizard`:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `pnpm install && pnpm build` |
| Build output directory | `apps/web/dist` |
| Environment variable `NODE_VERSION` | `24` |
| Environment variable `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Environment variable `VITE_SUPABASE_KEY` | the publishable key |

Both `VITE_` values end up in the public JavaScript bundle. That is expected: the publishable key is public by design. Note the site's address (`https://<name>.pages.dev`).

The first production deployment happens when this branch is merged to `main`. To try it sooner, Pages builds a preview for the branch at a `https://<branch>.<name>.pages.dev` address; add that origin in the next step as well.

- [ ] **Step 6 (owner): Allow the site's origin**

```bash
pnpm dlx supabase secrets set ALLOWED_ORIGINS=https://<name>.pages.dev
```

List several origins with commas and no spaces. An origin is scheme and host only, with no trailing slash.

- [ ] **Step 7 (owner): Check the deployed app on a phone**

Open the Pages address on a phone. Import a character by pasting its D&D Beyond link. Expected: the Combat view opens. Then set a sheet to Private and try again. Expected: "This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again." with the hint under it.

If the import says "Couldn't reach the import service.", check three things in this order: the origin in `ALLOWED_ORIGINS` matches the address in the phone's browser exactly; `VITE_SUPABASE_KEY` in Cloudflare Pages is the same publishable key the function checks; and the curl check in Step 4 still answers `400`, not `401` (a `401` there means the platform's JWT check or the function's key check is refusing the key, and Step 4 says what to change).

---

## Changes made during execution

The code in the tasks above is the plan as written. Review during execution changed four things; the repository is the record.

- **Task 3, save roll line.** The article is chosen from the ability's name, so the line reads "They roll an Intelligence save against DC 13." A private `article` helper in `packages/rules/src/text.ts` does this, with one added test.
- **Task 7, the key check fails closed.** `ImportOptions` gained `requireKey?: boolean`. When it is true and no key is configured, the handler answers every request with 401 `unauthorized`. The Edge Function entry sets it and reads the key from `SUPABASE_PUBLISHABLE_KEYS`, falling back to an `IMPORT_API_KEY` secret. The dev server does not set it.
- **Task 10, re-importing the open character.** `saveImported` clamps and keeps the play state in memory when the re-imported character is the open one, and uses the stored copy only when it is not open. The test "replaces the character on re-import and clamps what was spent" sets the over-spent state in the store, not in storage, and two tests were added.
- **Task 16, Step 1.** A sentence that appeared twice was removed, and Step 4 gained the `IMPORT_API_KEY` fallback.

## Done when

- `pnpm test` passes (497 tests or more), `pnpm typecheck` is clean and `pnpm build` succeeds.
- The walk-through in Task 15 passes at 375 px wide.
- The owner has completed Task 16, or has chosen to stay on the dev server for now.

## Known gaps carried forward

- Druid, Monk, Paladin and Ranger still have no fixture.
- Upcasting does not change a spell's damage in the roll line. Choosing a level 2 slot for Chromatic Orb spends that slot and still prints the level 1 damage.
- An item-granted spell is assumed to cost one charge of its item.
- Each of a character's weapons with charges has its own pool, even where the item's text says the forms share one. The player corrects this with the pips.
- Explore lists abilities by tag, and class features have no tags until milestone 4, so an untagged out-of-combat feature with Action timing appears only in Combat.
- Sourcebook noise (the "Circle Spell" rows) stays in "No action needed" until hide arrives in milestone 3.
- The Edge Function has no signed-in check and no rate limit until milestone 3.
- The dev server's import endpoint and the app's error boundary have no unit test; Task 15 checks the endpoint by hand.
- Two equipped copies of one item still share a key (milestone 3).
- Descriptions with tables can be wider than a phone screen; the table scrolls with the row, not on its own.
- A proficiency or expertise modifier that carries a restriction is applied to the number as well as listed as a note (`hasModifier` in `packages/rules/src/core.ts`, milestone 1 code). No fixture has one.
- Nothing stops `@cw/rules` or `@cw/model` from using browser globals at compile time, because one `tsconfig.json` gives every package the DOM library. Review is the only guard.
- Stored play state is not validated when it is read. Milestone 3 must normalise it at the storage boundary before sync writes to it.
- A spent group in Combat dims its rows to 60% opacity, which lowers the contrast of the reason text.
- Safari may clear on-device storage after seven days without a visit (spec section 17).
- The app has not been opened on a real phone, and import by link has not been run against the real services. Task 16 covers both.
- Review findings that were deferred are listed in `docs/superpowers/plans/2026-11-11-milestone-2-deferred-findings.md`.
