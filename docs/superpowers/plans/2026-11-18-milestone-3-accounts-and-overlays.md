# Milestone 3: Accounts, Syncing and Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players sign in with Discord, their characters and play state are backed up and follow them between devices, the DM can open and fix any character at the table, and every ability can be edited, reordered, hidden or added by hand.

**Architecture:** The device stays in charge of the screen: every screen reads the device's own IndexedDB copy, each change is saved there first and marked dirty, and a sync engine sends dirty records to the account and fetches what changed. The account is reached only through one `Remote` interface, implemented by `supabaseRemote` (supabase-js) and by `memoryServer`, which keeps the same rules in memory for tests and local development. Postgres holds two synced tables, `characters` and `character_items`, where the later change wins row by row and row-level security decides who may see what. A player's edits are items stored beside the imported sheet and applied by one pure function, `applyEdits`, so the views and the turn engine never learn about them.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript 7 (strict), Vitest 5 (projects `node` and `web` on jsdom), React 19, Vite 8, Tailwind CSS 4, Zustand 5, `idb` 8, `@supabase/supabase-js` 2, `@electric-sql/pglite` 0.5 (tests only), dnd-kit (Part B), React Testing Library 16, `fake-indexeddb` 6, Supabase (Auth with Discord, Postgres, one Edge Function on Deno), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-11-11-character-wizard-design.md` (sections 2, 4, 5.1 to 5.4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16 and 17). Executors read the spec as well as this plan.

**Two parts, one pull request each.** Part A (Tasks 1 to 13) is accounts and syncing and is usable on its own. Part B (Tasks 14 to 20) is overlays. Stop after Task 13, open the Part A pull request, and start Part B only when the owner says so.

## Global Constraints

- No code may branch on a specific character, subclass, item, campaign, table or user. Branching on SRD rule names is allowed.
- Unknown input must never throw. Stored and synced records are checked and repaired when read; a record that cannot be repaired is ignored.
- Never edit `fixtures/expected/*.json`. Never edit `fixtures/characters/*.json`. Tests that need a variation copy a fixture in memory and change the copy.
- Rules text must not be committed. Fixture descriptions are `"[removed]"`; tests that need description text write their own.
- Never commit a real D&D Beyond character ID, username, email address, Discord ID, Supabase URL or key. Test user IDs are made-up strings (`user-test`) or made-up UUIDs. Keys in tests are `sb_publishable_test` and similar.
- An agent must not create accounts, read or type a secret key, or run a command that needs one. Steps marked **(owner)** are for the repository owner. An agent prepares what it can, then stops and hands over.
- Nothing is pushed, merged or deleted without the owner's say-so. The local branches `backup/pre-clean-branch` and `backup/pre-clean-main` are never pushed or merged.
- Only `@cw/ddb-import` may read D&D Beyond field names. `@cw/rules` reads only `@cw/model` types. `apps/web` never reads raw D&D Beyond fields; it calls `convertCharacter`.
- `@cw/rules` and `@cw/model` stay pure: no network, storage, DOM or React.
- `apps/web` reaches the account only through the `Remote` interface (`apps/web/src/remote`). Only `apps/web/src/remote/supabase.ts` and `apps/web/src/remote/index.ts` import supabase-js.
- The SQL in `supabase/migrations` and `apps/web/src/remote/memory.ts` keep the same rules. A change to one is a change to the other, and to `apps/web/src/remote/contract.ts`, which tests both.
- The app never applies a conditional modifier to a number. It shows it as a note.
- Out of scope, do not build: suggestions, turn plans, situation chips, usage events, feedback, a service worker or install prompt, overriding the sheet's own numbers, a second sign-in provider, live updates between devices, a conflict screen, an admin creating a character for another player.
- UI copy: sentence case; no "please", no exclamation marks; messages exactly as written in this plan's tests.
- Every tappable control is at least 44 px tall (`min-h-11`).
- Single-class characters only.
- Package names: `@cw/model`, `@cw/ddb-import`, `@cw/rules`, `@cw/web`. Packages have no build step except `@cw/web`.
- Work on the branch `milestone-3-accounts-and-overlays` for Part A. Commit after every task. End every commit message with: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## How this plan was checked

Every task below is one commit in a throwaway copy of the repository, built in order and outside the repository itself. The code blocks in this plan were generated from those commits, and the test counts beside each task are what `pnpm test` printed at that commit. `pnpm typecheck` was clean at every commit and `pnpm build` succeeded at the end of each part.

The file steps of this document (create, replace, apply a change) were then replayed by a script onto a fresh checkout of the branch. The result was identical to the tested copy, apart from the `package.json` files and the lockfile, which the `pnpm add` steps produce.

Both parts were also opened in a browser at 375 px wide against the in-memory account. Part A: sign-in, import by pasted JSON, Use, reload, the Players screen, sign-out. Part B: the editor, a tag moving an ability into Explore, "Edit list" with the arrow buttons, hiding, adding a custom ability, and a reload. A drag with the mouse was checked by the helper agent that wrote the Part B screens. The walk-through of Part A found two faults that no test had caught; both are fixed in the tasks below, each with a test that fails without the fix.

Tasks 9 to 11 and 16 to 19 (the screens) were written by helper agents from written briefs and then checked as above. The other tasks were written by the planning session.

Not checked, because it needs the owner's accounts: Discord sign-in against the real services, the Supabase adapter against a live project, and applying the migration to a real project. Task 13 covers all three.

The library versions were the ones `pnpm add` installed on 2026-11-18. If a newer major version is installed and a step fails, read that library's migration notes before changing the code in this plan.

## File structure

```
packages/ddb-import/src/keys.ts            numberDuplicates, textHash
packages/ddb-import/src/actions.ts         action keys: numbered duplicates, hashed anonymous entries
packages/ddb-import/src/items.ts           item keys: numbered copies
packages/model/src/index.ts                + TIMINGS, TAGS, RESET_TYPES, AbilityEdit, CustomAbility,
                                             CharacterEdits, ViewName                         (Part B)
packages/rules/src/normalise.ts            normalisePlayItem, normaliseTurn; + edit, custom, order,
                                             roll                                             (Part B)
packages/rules/src/edits.ts                applyEdits, editForm, diffEdit, viewsOf, sortByOrder (Part B)
packages/rules/src/views.ts                groups and Explore list honour edits and order     (Part B)
packages/rules/src/sheet.ts                + hidden, edited, layout                           (Part B)

supabase/migrations/20261118000000_accounts_and_sync.sql   tables, triggers, policies, functions
supabase/tests/database.ts                 PGlite with a stand-in for Supabase's auth schema
supabase/tests/access.test.ts              the contract, and the rules against direct writes
supabase/functions/_shared/import-handler.ts   + authorize, size caps, no redirects
supabase/functions/import-character/index.ts   uses databaseAuthorize
supabase/config.toml                       verify_jwt = false

apps/web/src/storage/{types,memory,idb,serial,index}.ts    AppStorage version 2
apps/web/src/remote/types.ts               Remote, Profile, RemoteError, the row types
apps/web/src/remote/memory.ts              memoryServer: the account in memory
apps/web/src/remote/contract.ts            the rules both accounts must keep
apps/web/src/remote/rows.ts                database columns to app fields and back
apps/web/src/remote/supabase.ts            supabaseRemote
apps/web/src/remote/index.ts               defaultRemote: Supabase, or the local stand-in
apps/web/src/sync/engine.ts                pull, push, syncOnce, claimLocalCharacters
apps/web/src/sync/scheduler.ts             when to sync
apps/web/src/store.ts                      + session, syncState, sign-in and sign-out, sync;
                                             + edits                                          (Part B)
apps/web/src/import/client.ts              endpoint with the user's token, timeout, new messages
apps/web/src/router.ts                     + #/players, encoded character IDs
apps/web/src/screens/{SignIn,Waiting,Players}.tsx          new screens
apps/web/src/screens/{Home,Import,Character}.tsx, App.tsx  account-aware
apps/web/src/components/Dialog.tsx         a native dialog as a bottom sheet                  (Part B)
apps/web/src/components/{AbilityEditor,CustomAbilityEditor,RollEditor,editorFields}.tsx
                                           the two editors and the fields they share          (Part B)
apps/web/src/components/{rowLabel,fieldStyles}.ts, useAbilityEdit.tsx                         (Part B)
apps/web/src/components/{ArrangeSection,ArrangeRow,HiddenDrawer}.tsx                          (Part B)
apps/web/src/views/EditList.tsx            arranging, the Hidden drawer, Add an ability       (Part B)
```

## Background the implementer needs

- **Commands:** `pnpm test` runs everything. `pnpm exec vitest run <path>` runs one file. `pnpm typecheck` checks every package, the web app, the shared handler and the database tests. `pnpm dev` starts the app with the in-memory account.
- **Fixtures:** `loadRaw(slug)` and `loadExpected(slug)` from `test-utils/fixtures.ts`. Slugs: `anastasia` (Sorcerer 3), `danger` (Fighter 9), `franny` (Barbarian 3), `maya` (Cleric 3), `milton` (Bard 3), `minkis` (Wizard 3), `sid` (Rogue 3), `vlad` (Warlock 3). Every fixture has D&D Beyond ID `1` after sanitizing; `rawWithId(slug, id)` in `apps/web/src/test/helpers.ts` gives a copy with another ID.
- **Facts the tests rely on:** `vlad` has two Pact Magic slots and no others, Hex (a Bonus Action, concentration, pact slot) and two abilities named Misty Step. `minkis` has level 1 and level 2 slots. `danger` has Action Surge (1 use, Short Rest) and Second Wind (3 uses, Long Rest, dice `1d10+9`). `maya` has Scorching Ray granted by Shepherds Staff, which has a 1-charge pool.
- **Words used in this plan:**
  - *The account* is whatever implements `Remote`: Supabase in production, `memoryServer` in tests and local development.
  - *An item* is one row of `character_items`: a kind (`play`, `edit`, `custom`, `order`), a key and some data, attached to a character.
  - *Dirty* marks a record changed on this device that the account has not yet answered for.
  - *`rev`* is a number the account stamps on every accepted write. A device fetches everything with a `rev` above the last one it saw.
  - *A tombstone* is a record kept with `deleted: true` so that the deletion can travel.
- **The later change wins.** Every record carries `updatedAt`, the time of the change by the clock of the device that made it. The account skips a write that is not newer than what it holds, and never records a time in the future. Use `nextStamp(previous)` from `apps/web/src/sync/engine.ts` for a new `updatedAt`; never `new Date().toISOString()` directly.
- **Supabase keys:** a project's publishable key (`sb_publishable_...`) is public by design and is sent in the `apikey` header. A signed-in user's access token is sent as `Authorization: Bearer <token>`. No secret key appears anywhere in this plan.
- **Bash heredocs that contain apostrophes fail in this environment.** Write files with the file-writing tool, not with `cat <<EOF`.

---

# Part A: accounts and syncing

---

### Task 1: Ability keys that never collide

Edits are stored by ability key from this milestone, so two different things must never share a key, and a key must not depend on where an entry sits in D&D Beyond's lists. This settles the three key problems carried over from milestone 1 (spec section 5.1, "Key collisions"). No fixture has any of them, so the tests build their own input.

**Files:**
- Modify: `packages/ddb-import/src/actions.ts`
- Modify: `packages/ddb-import/src/items.ts`
- Create: `packages/ddb-import/src/keys.ts`
- Create (test): `packages/ddb-import/test/keys.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `numberDuplicates<T extends { key: string }>(rows: T[]): T[]` and `textHash(text: string): string` in `packages/ddb-import/src/keys.ts`.
  - Keys: the first equipped copy of an item is `item:<definitionId>:base`, later copies `item:<definitionId>:base#2`, `#3`. Two actions with one key become `<key>` and `<key>#2`. An action with no id and no name is `action:anon-<8 hex digits>:<component or base>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ddb-import/test/keys.test.ts`:

```ts
import { buildSheet } from '@cw/rules';
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { numberDuplicates, textHash } from '../src/keys';

const longsword = (id: number, equipped = true) => ({
  id,
  equipped,
  limitedUse: { maxUses: 2, resetType: 'LongRest' },
  definition: {
    id: 777, name: 'Twin Blade', filterType: 'Weapon', attackType: 1, categoryId: 2, type: 'Longsword',
    damage: { diceString: '1d8' }, damageType: 'Slashing', properties: [],
  },
});

describe('numberDuplicates', () => {
  it('leaves unique keys alone and numbers later copies from 2', () => {
    const rows = [{ key: 'a' }, { key: 'b' }, { key: 'a' }, { key: 'a' }];
    expect(numberDuplicates(rows).map((r) => r.key)).toEqual(['a', 'b', 'a#2', 'a#3']);
  });

  it('does not change the rows it was given', () => {
    const rows = [{ key: 'a' }, { key: 'a' }];
    numberDuplicates(rows);
    expect(rows.map((r) => r.key)).toEqual(['a', 'a']);
  });
});

describe('textHash', () => {
  it('is the same for the same text and differs for different text', () => {
    expect(textHash('Takes a bonus action')).toBe(textHash('Takes a bonus action'));
    expect(textHash('Takes a bonus action')).not.toBe(textHash('Takes an action'));
    expect(textHash('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('two equipped copies of one item', () => {
  const raw = { data: { inventory: [longsword(1), longsword(2)] } };

  it('gives the second copy its own key', () => {
    const c = convertCharacter(raw);
    expect(c.weapons.map((w) => w.key)).toEqual(['item:777:base', 'item:777:base#2']);
    expect(c.chargedItems.map((i) => i.key)).toEqual(['item:777:base', 'item:777:base#2']);
  });

  it('shows both weapons, each with its own pool', () => {
    const sheet = buildSheet(convertCharacter(raw));
    const blades = sheet.abilities.filter((a) => a.name === 'Twin Blade');
    expect(blades.map((a) => a.poolKey)).toEqual(['item:777:base', 'item:777:base#2']);
    expect(sheet.resources.filter((r) => r.name === 'Twin Blade')).toHaveLength(2);
  });

  it('numbers only the copies that are equipped', () => {
    const c = convertCharacter({ data: { inventory: [longsword(1, false), longsword(2)] } });
    expect(c.weapons.map((w) => w.key)).toEqual(['item:777:base']);
    expect(c.chargedItems.map((i) => i.key)).toEqual(['item:777:base']);
  });
});

describe('actions that share a key', () => {
  it('keeps both and numbers the second', () => {
    const actions = convertCharacter({
      data: {
        actions: {
          class: [
            { id: 5, componentId: 9, entityTypeId: 100, name: 'Channel', activation: { activationType: 1 } },
            { id: 5, componentId: 9, entityTypeId: 200, name: 'Channel, improved', activation: { activationType: 3 } },
          ],
        },
      },
    }).actions;
    expect(actions.map((a) => a.key)).toEqual(['action:5:9', 'action:5:9#2']);
    expect(actions.map((a) => a.name)).toEqual(['Channel', 'Channel, improved']);
  });
});

describe('an action with no id and no name', () => {
  const anonymous = (description: string, activationType: number) => ({ description, activation: { activationType } });

  it('keeps its key when the entries are reordered', () => {
    const a = anonymous('Once per turn you may reroll.', 8);
    const b = anonymous('You gain a swim speed.', 2);
    const keysOf = (list: unknown[]) =>
      new Map(convertCharacter({ data: { actions: { class: list } } }).actions.map((x) => [x.description, x.key]));
    const first = keysOf([a, b]);
    const second = keysOf([b, a]);
    expect(first.get(a.description)).toBe(second.get(a.description));
    expect(first.get(b.description)).toBe(second.get(b.description));
    expect(first.get(a.description)).not.toBe(first.get(b.description));
  });

  it('has a key that says it is anonymous and never contains "undefined"', () => {
    const [action] = convertCharacter({ data: { actions: { class: [anonymous('Text', 1)] } } }).actions;
    expect(action.key).toMatch(/^action:anon-[0-9a-f]{8}:base$/);
  });

  it('numbers two that are identical', () => {
    const list = [anonymous('Same', 1), anonymous('Same', 1)];
    const keys = convertCharacter({ data: { actions: { class: list } } }).actions.map((x) => x.key);
    expect(keys[1]).toBe(`${keys[0]}#2`);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run packages/ddb-import/test/keys.test.ts
```

Expected: FAIL. `../src/keys` cannot be found.

- [ ] **Step 3: Write the implementation**

Spells are deliberately left alone: two spell entries with the same key are one grant listed twice, and `convertSpells` already keeps only the first.

Replace the whole of `packages/ddb-import/src/actions.ts` with:

```ts
import type { ActionDice, ActionEntry } from '@cw/model';
import { numberDuplicates, textHash } from './keys';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';

const SOURCES = ['class', 'race', 'feat', 'item', 'background'] as const;
type GroupSource = (typeof SOURCES)[number];

function dice(count: unknown, sides: unknown, fixed: unknown): ActionDice | null {
  const c = num(count);
  const s = num(sides);
  if (!c || !s) return null;
  return { count: c, sides: s, fixed: num(fixed) ?? 0 };
}

/**
 * The id, else the name, else a hash of what the entry says. An entry with neither an id nor a
 * name keeps its key when D&D Beyond reorders the list, which a position would not.
 */
const keyId = (a: Raw): string | number =>
  str(a.id) ||
  num(a.id) ||
  str(a.name) ||
  `anon-${textHash(`${str(a.snippet)}|${str(a.description)}|${obj(a.activation).activationType ?? a.activationType ?? ''}`)}`;

function fromGroup(a: Raw, source: GroupSource, key: string | number): ActionEntry {
  const ability = abilityFromStatId(a.abilityModifierStatId);
  const d = obj(a.dice);
  return {
    key: `action:${key}:${num(a.componentId) ?? 'base'}`,
    name: str(a.name),
    source,
    timing: timingFromActivation(a.activation),
    attack: a.attackTypeRange != null && ability ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: dice(d.diceCount, d.diceValue, d.fixedValue),
    uses: limitedUseFrom(a.limitedUse),
    description: str(a.snippet) || str(a.description),
  };
}

function fromCustom(a: Raw, key: string | number): ActionEntry {
  const ability = abilityFromStatId(a.statId);
  const d = dice(a.diceCount, a.diceType, a.fixedValue);
  return {
    key: `custom:${key}:base`,
    name: str(a.name),
    source: 'custom',
    timing: timingFromActivation({ activationType: a.activationType }),
    attack: ability && d ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: d,
    uses: null,
    description: str(a.snippet) || str(a.description),
  };
}

export function convertActions(d: Raw): ActionEntry[] {
  const groups = obj(d.actions);
  const out: ActionEntry[] = [];
  for (const [group, items] of Object.entries(groups)) {
    const source = (SOURCES as readonly string[]).includes(group) ? (group as GroupSource) : 'class';
    for (const a of arr(items)) out.push(fromGroup(obj(a), source, keyId(obj(a))));
  }
  for (const a of arr(d.customActions)) out.push(fromCustom(obj(a), keyId(obj(a))));
  // Two actions can share an id and a granting component; both are kept.
  return numberDuplicates(out);
}
```

Replace the whole of `packages/ddb-import/src/items.ts` with:

```ts
import type { Armor, ChargedItem, DamagePart, Weapon } from '@cw/model';
import { activeItemIds } from './modifiers';
import { arr, limitedUseFrom, num, obj, own, slug, str, type Raw } from './raw';

/** characterValues rows with this typeId and value true mark an inventory item as a pact weapon. */
const PACT_WEAPON_TYPE = 28;

const ARMOR_KINDS: Record<number, Armor['kind']> = { 1: 'light', 2: 'medium', 3: 'heavy', 4: 'shield' };

function pactWeaponInventoryIds(d: Raw): Set<string> {
  const ids = new Set<string>();
  for (const v of arr(d.characterValues)) {
    if (v?.typeId === PACT_WEAPON_TYPE && v?.value === true) ids.add(String(v.valueId));
  }
  return ids;
}

function grantedBonus(def: Raw, subType: string): number {
  return arr(def.grantedModifiers)
    .filter((m) => m?.type === 'bonus' && m?.subType === subType)
    .reduce((sum, m) => sum + (num(m.value) ?? num(m.fixedValue) ?? 0), 0);
}

function extraDamage(def: Raw): DamagePart[] {
  return arr(def.grantedModifiers)
    .filter((m) => m?.type === 'damage' && str(obj(m.dice).diceString) !== '')
    .map((m) => ({ dice: str(m.dice.diceString), type: str(m.subType) || null }));
}

/**
 * The key of every equipped inventory entry, by its position in the inventory. The first equipped
 * copy of an item is `item:<definitionId>:base`; later copies get `#2`, `#3`.
 */
function itemKeys(d: Raw): Map<number, string> {
  const copies = new Map<number, number>();
  const keys = new Map<number, string>();
  arr(d.inventory).forEach((item, index) => {
    if (item?.equipped !== true) return;
    const id = num(obj(item.definition).id) ?? 0;
    const count = (copies.get(id) ?? 0) + 1;
    copies.set(id, count);
    keys.set(index, count === 1 ? `item:${id}:base` : `item:${id}:base#${count}`);
  });
  return keys;
}

export function convertWeapons(d: Raw): Weapon[] {
  const pact = pactWeaponInventoryIds(d);
  const keys = itemKeys(d);
  const out: Weapon[] = [];
  for (const [index, item] of arr(d.inventory).entries()) {
    const key = keys.get(index);
    if (key === undefined) continue;
    const def = obj(item.definition);
    // Granted modifiers only apply when the item is attuned, if it needs attunement.
    const effective = !(def.canAttune === true && item.isAttuned !== true);
    const shared = {
      key,
      name: str(def.name),
      magicBonus: effective ? grantedBonus(def, 'magic') : 0,
      isPactWeapon: pact.has(String(item.id)),
      extraDamage: effective ? extraDamage(def) : [],
      uses: effective ? limitedUseFrom(item.limitedUse) : null,
      unattuned: !effective,
    };
    if (def.filterType === 'Weapon') {
      const properties = arr(def.properties).map((p) => str(p?.name));
      out.push({
        ...shared,
        melee: def.attackType !== 2,
        category: def.categoryId === 1 ? 'simple' : def.categoryId === 2 ? 'martial' : 'other',
        typeSlug: slug(str(def.type)),
        finesse: properties.includes('Finesse'),
        versatile: properties.includes('Versatile'),
        damageDice: str(obj(def.damage).diceString),
        damageType: str(def.damageType) || null,
        properties,
      });
    } else if (def.filterType === 'Staff') {
      // A magic staff can be wielded as a quarterstaff; D&D Beyond's data omits the weapon stats.
      out.push({
        ...shared,
        melee: true,
        category: 'simple',
        typeSlug: 'quarterstaff',
        finesse: false,
        versatile: true,
        damageDice: '1d6',
        damageType: 'Bludgeoning',
        properties: ['Versatile'],
      });
    }
  }
  return out;
}

/** Every active item (equipped, and attuned if attunable) that has a real limited-use pool. */
export function convertChargedItems(d: Raw): ChargedItem[] {
  const active = activeItemIds(d);
  const keys = itemKeys(d);
  const out: ChargedItem[] = [];
  for (const [index, item] of arr(d.inventory).entries()) {
    const def = obj(item?.definition);
    const id = num(def.id);
    const key = keys.get(index);
    const uses = limitedUseFrom(item?.limitedUse);
    // An attunable item that is not attuned has no pool, equipped or not.
    const attuned = !(def.canAttune === true && item?.isAttuned !== true);
    if (id === null || key === undefined || !active.has(id) || !attuned || !uses) continue;
    out.push({ key, name: str(def.name), uses });
  }
  return out;
}

export function convertArmor(d: Raw): Armor[] {
  const out: Armor[] = [];
  for (const item of arr(d.inventory)) {
    if (item?.equipped !== true) continue;
    const def = obj(item.definition);
    if (def.filterType !== 'Armor') continue;
    const kind = own(ARMOR_KINDS, def.armorTypeId);
    const baseAc = num(def.armorClass);
    if (!kind || baseAc === null) continue;
    out.push({ name: str(def.name), kind, baseAc });
  }
  return out;
}
```

Create `packages/ddb-import/src/keys.ts`:

```ts
/**
 * Edits are stored by key, so two different things must never share one. The first row with a key
 * keeps it; each later row with the same key gets `#2`, `#3` and so on, in the order given.
 */
export function numberDuplicates<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = (seen.get(row.key) ?? 0) + 1;
    seen.set(row.key, count);
    return count === 1 ? row : { ...row, key: `${row.key}#${count}` };
  });
}

/** FNV-1a, 32 bits, as eight hex digits. Stable across runs and platforms; not for security. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (532 tests in 27 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Give colliding ability keys a number and anonymous actions a stable key" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Device storage version 2, and a store that cannot lose saved state

The device's database gains the shape that syncing needs (spec section 5.3): characters carry an owner and the sync fields, and everything attached to a character is an item of some kind. This task also settles five deferred findings: stored state is checked when read, both storage implementations copy what they are given, writes run one at a time, nothing can be changed before the saved state has loaded, and the sheet cache holds one sheet per character.

The store keeps its public shape. Sign-in and syncing arrive in Task 8; until then every character is saved with `ownerId: null`.

**Files:**
- Modify: `apps/web/src/storage/idb.ts`
- Modify: `apps/web/src/storage/index.ts`
- Modify: `apps/web/src/storage/memory.ts`
- Create: `apps/web/src/storage/serial.ts`
- Modify (test): `apps/web/src/storage/storage.test.ts`
- Modify: `apps/web/src/storage/types.ts`
- Modify (test): `apps/web/src/store.test.ts`
- Modify: `apps/web/src/store.ts`
- Modify (test): `apps/web/src/test/helpers.ts`
- Modify: `packages/rules/src/index.ts`
- Create: `packages/rules/src/normalise.ts`
- Create (test): `packages/rules/test/normalise.test.ts`

**Interfaces:**
- Consumes:
  - `PlayState`, `TurnState` from `@cw/model`; `clampState`, `emptyPlayState` from `@cw/rules`.
- Produces:
  - `normalisePlayItem(data: unknown): PlayItem`, `normaliseTurn(data: unknown): TurnState` and `type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>` in `packages/rules/src/normalise.ts`, exported from `@cw/rules`.
  - `apps/web/src/storage`: `StoredCharacter` (`id`, `ownerId`, `ddbId`, `name`, `rawJson`, `importedAt`, `updatedAt`, `deleted`, `dirty`), `StoredItem` (`characterId`, `kind`, `key`, `data`, `updatedAt`, `deleted`, `dirty`), `ItemKind`, `SyncedKind`, `SYNCED_KINDS`, `STATE_KEY`, and `AppStorage` with `listCharacters`, `putCharacter`, `removeCharacter`, `rekeyCharacter`, `listItems`, `putItem`, `removeItem`, `getMeta`, `setMeta`, `clear`.
  - `serial(storage: AppStorage): AppStorage`, `memoryStorage()`, `idbStorage()`, `openStorage()`, `DB_NAME`, `DB_VERSION`.
  - Store: `loaded: boolean`; `cachedSheetCount(): number`.
  - Test helpers: `savedPlay(storage, characterId)`, `putSavedPlay(storage, characterId, state)`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/web/src/storage/storage.test.ts` with:

```ts
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION } from './idb';
import {
  idbStorage, memoryStorage, openStorage, serial, type AppStorage, type StoredCharacter, type StoredItem,
} from './index';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: 'user-1', ddbId: `ddb-${id}`, name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: '2026-11-11T10:00:00.000Z', updatedAt: '2026-11-11T10:00:00.000Z', deleted: false, dirty: false,
  ...over,
});

const item = (characterId: string, kind: StoredItem['kind'], key: string, data: unknown): StoredItem => ({
  characterId, kind, key, data, updatedAt: '2026-11-11T10:00:00.000Z', deleted: false, dirty: true,
});

const byKey = (a: StoredItem, b: StoredItem): number => `${a.kind}|${a.key}`.localeCompare(`${b.kind}|${b.key}`);

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
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('user')).toBeNull();
  });

  it('stores, replaces and lists characters', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putCharacter(character('a', { name: 'Renamed', dirty: true }));
    const list = await storage.listCharacters();
    expect(list.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(list.find((c) => c.id === 'a')).toEqual(character('a', { name: 'Renamed', dirty: true }));
  });

  it('stores items by character, kind and key, and replaces one with the same three', async () => {
    const storage = await open();
    await storage.putItem(item('a', 'play', 'state', { spent: { pact: 1 } }));
    await storage.putItem(item('a', 'edit', 'spell:1:base:slot', { hidden: true }));
    await storage.putItem(item('b', 'play', 'state', { spent: {} }));
    await storage.putItem(item('a', 'play', 'state', { spent: { pact: 2 } }));
    expect((await storage.listItems('a')).sort(byKey)).toEqual([
      item('a', 'edit', 'spell:1:base:slot', { hidden: true }),
      item('a', 'play', 'state', { spent: { pact: 2 } }),
    ]);
    expect(await storage.listItems()).toHaveLength(3);
  });

  it('removes one item and leaves the rest', async () => {
    const storage = await open();
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.putItem(item('a', 'turn', 'state', 2));
    await storage.removeItem('a', 'play', 'state');
    expect(await storage.listItems('a')).toEqual([item('a', 'turn', 'state', 2)]);
  });

  it('removes a character together with its items', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putCharacter(character('b'));
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.putItem(item('b', 'play', 'state', 2));
    await storage.removeCharacter('a');
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual(['b']);
    expect(await storage.listItems()).toEqual([item('b', 'play', 'state', 2)]);
  });

  it('gives a character a new ID and moves its items to it', async () => {
    const storage = await open();
    await storage.putCharacter(character('old', { ownerId: null }));
    await storage.putItem(item('old', 'play', 'state', 1));
    await storage.putItem(item('other', 'play', 'state', 2));
    await storage.rekeyCharacter('old', character('new'));
    expect(await storage.listCharacters()).toEqual([character('new')]);
    expect(await storage.listItems('old')).toEqual([]);
    expect(await storage.listItems('new')).toEqual([item('new', 'play', 'state', 1)]);
    expect(await storage.listItems('other')).toHaveLength(1);
  });

  it('keeps named values', async () => {
    const storage = await open();
    await storage.setMeta('user', { id: 'user-1' });
    await storage.setMeta('cursor', 12);
    expect(await storage.getMeta('user')).toEqual({ id: 'user-1' });
    expect(await storage.getMeta('cursor')).toBe(12);
  });

  it('empties everything on clear', async () => {
    const storage = await open();
    await storage.putCharacter(character('a'));
    await storage.putItem(item('a', 'play', 'state', 1));
    await storage.setMeta('user', 'x');
    await storage.clear();
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('user')).toBeNull();
  });

  it('stores a copy and returns a copy', async () => {
    const storage = await open();
    const given = item('a', 'play', 'state', { spent: { pact: 1 } });
    await storage.putItem(given);
    (given.data as { spent: Record<string, number> }).spent.pact = 99;
    const [first] = await storage.listItems('a');
    expect(first.data).toEqual({ spent: { pact: 1 } });
    (first.data as { spent: Record<string, number> }).spent.pact = 50;
    expect((await storage.listItems('a'))[0].data).toEqual({ spent: { pact: 1 } });
  });
});

describe('idbStorage', () => {
  it('keeps data between two opens of the same database', async () => {
    const first = await idbStorage();
    await first.putCharacter(character('a'));
    await first.putItem(item('a', 'play', 'state', 1));
    const second = await idbStorage();
    expect(await second.listCharacters()).toEqual([character('a')]);
    expect(await second.listItems('a')).toEqual([item('a', 'play', 'state', 1)]);
  });

  it('closes its connection when a newer version is opened elsewhere, so that open is not blocked', async () => {
    await idbStorage();
    const newer = await openDB(DB_NAME, DB_VERSION + 1);
    expect(newer.version).toBe(DB_VERSION + 1);
    newer.close();
  });

  it('upgrades a milestone 2 database: characters gain the sync fields and play splits in two', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('characters', { keyPath: 'id' });
        database.createObjectStore('play', { keyPath: 'characterId' });
      },
    });
    await v1.put('characters', {
      id: 'local-1', ddbId: '42', name: 'Vlad', rawJson: { data: { id: 42 } }, importedAt: '2026-11-12T09:00:00.000Z',
    });
    await v1.put('play', {
      characterId: 'local-1', spent: { pact: 1 }, concentrationKey: 'spell:1:base:slot',
      turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: true },
    });
    v1.close();

    const storage = await idbStorage();
    expect(await storage.listCharacters()).toEqual([{
      id: 'local-1', ownerId: null, ddbId: '42', name: 'Vlad', rawJson: { data: { id: 42 } },
      importedAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z', deleted: false, dirty: true,
    }]);
    const items = (await storage.listItems('local-1')).sort(byKey);
    expect(items.map((i) => [i.kind, i.key, i.data, i.dirty])).toEqual([
      ['play', 'state', { spent: { pact: 1 }, concentrationKey: 'spell:1:base:slot' }, true],
      ['turn', 'state', { action: true, bonus: false, reaction: false, slotSpentThisTurn: true }, false],
    ]);
    const raw = await openDB(DB_NAME);
    expect([...raw.objectStoreNames].sort()).toEqual(['characters', 'items', 'meta']);
    raw.close();
  });
});

describe('serial', () => {
  it('runs calls in the order they were made, so a delete waits for an earlier slow write', async () => {
    const inner = memoryStorage();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: AppStorage = {
      ...inner,
      async putItem(value) {
        await gate;
        await inner.putItem(value);
      },
    };
    const storage = serial(slow);
    await storage.putCharacter(character('a'));
    const write = storage.putItem(item('a', 'play', 'state', 1));
    const removal = storage.removeCharacter('a');
    release();
    await Promise.all([write, removal]);
    expect(await storage.listItems()).toEqual([]);
  });

  it('keeps going after a call fails, and the failure reaches only its caller', async () => {
    const inner = memoryStorage();
    const storage = serial({ ...inner, putCharacter: () => Promise.reject(new Error('quota')) });
    await expect(storage.putCharacter(character('a'))).rejects.toThrow('quota');
    await storage.setMeta('still', 'working');
    expect(await storage.getMeta('still')).toBe('working');
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

Apply this change to `apps/web/src/store.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -2,8 +2,8 @@ import { describe, expect, it, vi } from 'vitest';
 import { emptyPlayState } from '@cw/rules';
 import { loadRaw } from '../../../test-utils/fixtures';
 import { memoryStorage, type AppStorage } from './storage';
-import { sheetFor, useStore } from './store';
-import { ability, rawWithId, seed } from './test/helpers';
+import { cachedSheetCount, sheetFor, useStore } from './store';
+import { ability, putSavedPlay, rawWithId, savedPlay, seed } from './test/helpers';
 
 const sheetBuild = vi.hoisted(() => ({ fails: false }));
 
@@ -47,7 +47,8 @@ describe('saveImported', () => {
     await state().init(storage);
     const raw = loadRaw('vlad');
     const record = await state().saveImported(raw);
-    expect(record).toMatchObject({ ddbId: '1', name: 'Vlad', rawJson: raw });
+    expect(record).toMatchObject({ ddbId: '1', name: 'Vlad', rawJson: raw, deleted: false, dirty: true });
+    expect(record?.updatedAt).toBe(record?.importedAt);
     expect(record?.id).toMatch(/^[0-9a-f-]{36}$/);
     expect(Number.isNaN(Date.parse(record?.importedAt ?? ''))).toBe(false);
     expect(await storage.listCharacters()).toEqual([record]);
@@ -99,7 +100,7 @@ describe('saveImported', () => {
     const second = await state().saveImported(loadRaw('vlad'));
     expect(second?.id).toBe(first.id);
     expect(state().characters).toHaveLength(1);
-    expect(await storage.getPlay(first.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
+    expect(await savedPlay(storage, first.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
     expect(state().play.spent).toEqual({ pact: 2 });
   });
 
@@ -108,16 +109,16 @@ describe('saveImported', () => {
     const record = await seed('vlad', storage);
     await state().open('missing');
     expect(state().openId).toBeNull();
-    await storage.putPlay(record.id, { ...emptyPlayState(), spent: { pact: 9, gone: 3 }, concentrationKey: 'not-there' });
+    await putSavedPlay(storage, record.id, { ...emptyPlayState(), spent: { pact: 9, gone: 3 }, concentrationKey: 'not-there' });
     await state().saveImported(loadRaw('vlad'));
-    expect(await storage.getPlay(record.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
+    expect(await savedPlay(storage, record.id)).toMatchObject({ spent: { pact: 2 }, concentrationKey: null });
     expect(state().openId).toBeNull();
   });
 
   it('keeps the open character\'s unsaved play state when it is re-imported', async () => {
     const storage = memoryStorage();
     const record = await seed('vlad', storage);
-    storage.putPlay = async () => { throw new Error('quota'); };
+    storage.putItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
@@ -146,7 +147,7 @@ describe('open', () => {
   it('keeps the play state in memory when the open character is opened again', async () => {
     const storage = memoryStorage();
     const record = await seed('vlad', storage);
-    storage.putPlay = async () => { throw new Error('quota'); };
+    storage.putItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
@@ -155,6 +156,41 @@ describe('open', () => {
     expect(state().play.spent).toEqual({ pact: 1 });
   });
 
+  it('is not loaded until the saved play state has been read, and ignores changes until then', async () => {
+    const storage = memoryStorage();
+    const record = await seed('vlad', storage);
+    state().use(ability('Hex'), 'combat');
+    await settle();
+    await state().init(storage);
+    const opening = state().open(record.id);
+    expect(state()).toMatchObject({ openId: record.id, loaded: false });
+    state().use(ability('Arms of Hadar'), 'combat');
+    state().togglePill('action');
+    expect(state().play).toEqual(emptyPlayState());
+    await opening;
+    expect(state().loaded).toBe(true);
+    expect(state().play.spent).toEqual({ pact: 1 });
+    await settle();
+    expect((await savedPlay(storage, record.id))?.spent).toEqual({ pact: 1 });
+  });
+
+  it('repairs saved play state that is malformed', async () => {
+    const storage = memoryStorage();
+    const record = await seed('vlad', storage);
+    await storage.putItem({
+      characterId: record.id, kind: 'play', key: 'state', data: { concentrationKey: 12 },
+      updatedAt: '2026-11-18T12:00:00.000Z', deleted: false, dirty: true,
+    });
+    await storage.putItem({
+      characterId: record.id, kind: 'turn', key: 'state', data: 'nonsense',
+      updatedAt: '2026-11-18T12:00:00.000Z', deleted: false, dirty: false,
+    });
+    await state().init(storage);
+    await state().open(record.id);
+    expect(state().loaded).toBe(true);
+    expect(state().play).toEqual(emptyPlayState());
+  });
+
   it('opens nothing for an unknown ID', async () => {
     await seed('vlad');
     await state().open('no-such-id');
@@ -170,13 +206,16 @@ describe('play', () => {
     expect(state().play).toMatchObject({ spent: { pact: 1 }, turn: { bonus: true, slotSpentThisTurn: true } });
     expect(state().undo?.message).toBe('Used Hex. Spent: Bonus Action, a pact slot.');
     await settle();
-    expect(await storage.getPlay(record.id)).toEqual(state().play);
+    expect(await savedPlay(storage, record.id)).toEqual(state().play);
+    const items = await storage.listItems(record.id);
+    expect(items.find((item) => item.kind === 'play')).toMatchObject({ dirty: true, deleted: false });
+    expect(items.find((item) => item.kind === 'turn')).toMatchObject({ dirty: false });
 
     state().undoLast();
     expect(state().play).toEqual(emptyPlayState());
     expect(state().undo).toBeNull();
     await settle();
-    expect(await storage.getPlay(record.id)).toEqual(emptyPlayState());
+    expect(await savedPlay(storage, record.id)).toEqual(emptyPlayState());
   });
 
   it('does nothing when the ability cannot be used', async () => {
@@ -230,10 +269,25 @@ describe('play', () => {
     expect(state().play.concentrationKey).toBeNull();
   });
 
+  it('does not rewrite the synced play item when only the turn changes', async () => {
+    const storage = memoryStorage();
+    const record = await seed('vlad', storage);
+    state().use(ability('Hex'), 'combat');
+    await settle();
+    const before = (await storage.listItems(record.id)).find((item) => item.kind === 'play');
+    await new Promise((resolve) => setTimeout(resolve, 5));
+    state().togglePill('action');
+    state().startTurn();
+    await settle();
+    const after = (await storage.listItems(record.id)).find((item) => item.kind === 'play');
+    expect(after?.updatedAt).toBe(before?.updatedAt);
+    expect((await savedPlay(storage, record.id))?.turn.action).toBe(false);
+  });
+
   it('turns on the not-saving flag when a write fails, and keeps the change', async () => {
     const storage = memoryStorage();
     await seed('vlad', storage);
-    storage.putPlay = async () => { throw new Error('quota'); };
+    storage.putItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
@@ -250,7 +304,14 @@ describe('remove', () => {
     await state().remove(record.id);
     expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
     expect(await storage.listCharacters()).toEqual([]);
-    expect(await storage.getPlay(record.id)).toBeNull();
+    expect(await savedPlay(storage, record.id)).toBeNull();
+  });
+
+  it('drops the cached sheet', async () => {
+    const record = await seed('vlad');
+    const before = cachedSheetCount();
+    await state().remove(record.id);
+    expect(cachedSheetCount()).toBe(before - 1);
   });
 });
 
@@ -263,4 +324,14 @@ describe('sheetFor', () => {
     expect(again.importedAt >= first.importedAt).toBe(true);
     expect(sheetFor(again).name).toBe('Vlad');
   });
+
+  it('keeps one sheet per character however often it is re-imported', async () => {
+    await seed('vlad');
+    const before = cachedSheetCount();
+    for (let i = 0; i < 3; i += 1) {
+      await new Promise((resolve) => setTimeout(resolve, 2));
+      await state().saveImported(loadRaw('vlad'));
+    }
+    expect(cachedSheetCount()).toBe(before);
+  });
 });
```

Replace the whole of `apps/web/src/test/helpers.ts` with:

```ts
import type { Ability, PlayState } from '@cw/model';
import { normalisePlayItem, normaliseTurn } from '@cw/rules';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { STATE_KEY, memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
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

/** The play state a storage holds for a character, put back together from its two items. Null when it holds neither. */
export async function savedPlay(storage: AppStorage, characterId: string): Promise<PlayState | null> {
  const items = (await storage.listItems(characterId)).filter((item) => item.key === STATE_KEY && !item.deleted);
  const play = items.find((item) => item.kind === 'play');
  const turn = items.find((item) => item.kind === 'turn');
  if (!play && !turn) return null;
  return { ...normalisePlayItem(play?.data), turn: normaliseTurn(turn?.data) };
}

/** Writes a play state straight into a storage, as its two items, behind the store's back. */
export async function putSavedPlay(storage: AppStorage, characterId: string, state: PlayState): Promise<void> {
  const base = { characterId, key: STATE_KEY, updatedAt: '2026-11-18T12:00:00.000Z', deleted: false };
  await storage.putItem({ ...base, kind: 'play', data: { spent: state.spent, concentrationKey: state.concentrationKey }, dirty: true });
  await storage.putItem({ ...base, kind: 'turn', data: state.turn, dirty: false });
}
```

Create `packages/rules/test/normalise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalisePlayItem, normaliseTurn } from '../src/normalise';

describe('normalisePlayItem', () => {
  it('keeps a well-formed item as it is', () => {
    const item = { spent: { pact: 1, 'slot:1': 2 }, concentrationKey: 'spell:1:base:slot' };
    expect(normalisePlayItem(item)).toEqual(item);
  });

  it.each([null, undefined, 7, 'text', [], {}])('turns %j into an empty item', (data) => {
    expect(normalisePlayItem(data)).toEqual({ spent: {}, concentrationKey: null });
  });

  it('drops counts that are not positive whole numbers and rounds the rest down', () => {
    const data = { spent: { a: 2.9, b: 0, c: -1, d: 'three', e: Number.NaN, f: null }, concentrationKey: 5 };
    expect(normalisePlayItem(data)).toEqual({ spent: { a: 2 }, concentrationKey: null });
  });

  it('ignores a spent value that is not an object', () => {
    expect(normalisePlayItem({ spent: [1, 2], concentrationKey: 'k' })).toEqual({ spent: {}, concentrationKey: 'k' });
  });
});

describe('normaliseTurn', () => {
  it('keeps a well-formed turn as it is', () => {
    const turn = { action: true, bonus: false, reaction: true, slotSpentThisTurn: true };
    expect(normaliseTurn(turn)).toEqual(turn);
  });

  it.each([null, undefined, 'text', [], { action: 'yes', bonus: 1 }])('turns %j into a fresh turn', (data) => {
    expect(normaliseTurn(data)).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/storage/storage.test.ts apps/web/src/store.test.ts packages/rules/test/normalise.test.ts
```

Expected: FAIL. The storage tests fail to compile against the old `AppStorage` (no `listItems`), and `../src/normalise` cannot be found.

- [ ] **Step 3: Write the implementation**

The upgrade from version 1 runs inside IndexedDB's upgrade transaction, so it may only await IndexedDB requests. The old `play` store is not in the new schema's types, which is why it is read through an untyped view of the same transaction.

Replace the whole of `apps/web/src/storage/idb.ts` with:

```ts
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { STATE_KEY, type AppStorage, type StoredCharacter, type StoredItem } from './types';

export const DB_NAME = 'character-wizard';
export const DB_VERSION = 2;

interface Schema extends DBSchema {
  characters: { key: string; value: StoredCharacter };
  items: { key: [string, string, string]; value: StoredItem; indexes: { byCharacter: string } };
  meta: { key: string; value: unknown };
}

type UpgradeTx = IDBPTransaction<Schema, ArrayLike<StoreNames<Schema>>, 'versionchange'>;

/**
 * Version 1 (milestone 2) had `characters` without the sync fields and one `play` record per
 * character. Each character gains the sync fields and is marked dirty so that it uploads after
 * the first sign-in; each play record becomes a `play` item and a `turn` item.
 */
async function upgradeFromVersion1(database: IDBPDatabase<Schema>, tx: UpgradeTx): Promise<void> {
  // The version 1 stores are not in the version 2 schema, so they are read untyped.
  const old = tx as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
  const characters = tx.objectStore('characters');
  for (const row of (await old.objectStore('characters').getAll()) as Record<string, unknown>[]) {
    const importedAt = typeof row.importedAt === 'string' ? row.importedAt : new Date(0).toISOString();
    await characters.put({
      id: String(row.id),
      ownerId: null,
      ddbId: typeof row.ddbId === 'string' ? row.ddbId : '0',
      name: typeof row.name === 'string' ? row.name : 'Unnamed character',
      rawJson: row.rawJson,
      importedAt,
      updatedAt: importedAt,
      deleted: false,
      dirty: true,
    });
  }
  const items = tx.objectStore('items');
  for (const row of (await old.objectStore('play').getAll()) as Record<string, unknown>[]) {
    const characterId = String(row.characterId);
    const updatedAt = new Date().toISOString();
    await items.put({
      characterId, kind: 'play', key: STATE_KEY,
      data: { spent: row.spent, concentrationKey: row.concentrationKey },
      updatedAt, deleted: false, dirty: true,
    });
    await items.put({ characterId, kind: 'turn', key: STATE_KEY, data: row.turn, updatedAt, deleted: false, dirty: false });
  }
  (database as unknown as IDBDatabase).deleteObjectStore('play');
}

/** Opens (and on first use creates or upgrades) the database. Rejects where IndexedDB is unavailable. */
export async function idbStorage(): Promise<AppStorage> {
  const db = await openDB<Schema>(DB_NAME, DB_VERSION, {
    async upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) database.createObjectStore('characters', { keyPath: 'id' });
      if (oldVersion < 2) {
        const items = database.createObjectStore('items', { keyPath: ['characterId', 'kind', 'key'] });
        items.createIndex('byCharacter', 'characterId');
        database.createObjectStore('meta');
        if (oldVersion === 1) await upgradeFromVersion1(database, tx);
      }
    },
    // A newer version of the app is opening the database in another tab: let it upgrade.
    blocking() {
      db.close();
    },
  });
  return {
    async listCharacters() {
      return db.getAll('characters');
    },
    async putCharacter(character) {
      await db.put('characters', character);
    },
    async removeCharacter(id) {
      const tx = db.transaction(['characters', 'items'], 'readwrite');
      const keys = await tx.objectStore('items').index('byCharacter').getAllKeys(id);
      await Promise.all([
        tx.objectStore('characters').delete(id),
        ...keys.map((key) => tx.objectStore('items').delete(key)),
        tx.done,
      ]);
    },
    async rekeyCharacter(oldId, character) {
      const tx = db.transaction(['characters', 'items'], 'readwrite');
      const items = tx.objectStore('items');
      const moved = await items.index('byCharacter').getAll(oldId);
      await Promise.all([
        tx.objectStore('characters').delete(oldId),
        tx.objectStore('characters').put(character),
        ...moved.map((item) => items.delete([oldId, item.kind, item.key])),
        ...moved.map((item) => items.put({ ...item, characterId: character.id })),
        tx.done,
      ]);
    },
    async listItems(characterId) {
      return characterId === undefined ? db.getAll('items') : db.getAllFromIndex('items', 'byCharacter', characterId);
    },
    async putItem(item) {
      await db.put('items', item);
    },
    async removeItem(characterId, kind, key) {
      await db.delete('items', [characterId, kind, key]);
    },
    async getMeta(name) {
      return (await db.get('meta', name)) ?? null;
    },
    async setMeta(name, value) {
      await db.put('meta', value, name);
    },
    async clear() {
      const tx = db.transaction(['characters', 'items', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('characters').clear(), tx.objectStore('items').clear(), tx.objectStore('meta').clear(), tx.done,
      ]);
    },
  };
}
```

Replace the whole of `apps/web/src/storage/index.ts` with:

```ts
import { idbStorage } from './idb';
import { memoryStorage } from './memory';
import { serial } from './serial';
import type { AppStorage } from './types';

export { STATE_KEY, SYNCED_KINDS } from './types';
export type { AppStorage, ItemKind, StoredCharacter, StoredItem, SyncedKind } from './types';
export { memoryStorage } from './memory';
export { idbStorage } from './idb';
export { serial } from './serial';

/**
 * IndexedDB when it works. Otherwise (private browsing, storage blocked) an in-memory store, with
 * `persistent: false` so the app can say that nothing will be saved. Calls run one at a time.
 */
export async function openStorage(): Promise<{ storage: AppStorage; persistent: boolean }> {
  try {
    return { storage: serial(await idbStorage()), persistent: true };
  } catch {
    return { storage: serial(memoryStorage()), persistent: false };
  }
}
```

Replace the whole of `apps/web/src/storage/memory.ts` with:

```ts
import type { AppStorage, StoredCharacter, StoredItem } from './types';

const itemId = (characterId: string, kind: string, key: string): string => JSON.stringify([characterId, kind, key]);

/** Keeps everything in memory. Used in tests, and as the fallback when IndexedDB is unavailable. */
export function memoryStorage(): AppStorage {
  const characters = new Map<string, StoredCharacter>();
  const items = new Map<string, StoredItem>();
  const meta = new Map<string, unknown>();
  const itemsOf = (characterId: string): StoredItem[] => [...items.values()].filter((i) => i.characterId === characterId);
  return {
    async listCharacters() {
      return structuredClone([...characters.values()]);
    },
    async putCharacter(character) {
      characters.set(character.id, structuredClone(character));
    },
    async removeCharacter(id) {
      characters.delete(id);
      for (const item of itemsOf(id)) items.delete(itemId(item.characterId, item.kind, item.key));
    },
    async rekeyCharacter(oldId, character) {
      const moved = itemsOf(oldId);
      characters.delete(oldId);
      for (const item of moved) items.delete(itemId(item.characterId, item.kind, item.key));
      characters.set(character.id, structuredClone(character));
      for (const item of moved) items.set(itemId(character.id, item.kind, item.key), { ...item, characterId: character.id });
    },
    async listItems(characterId) {
      return structuredClone(characterId === undefined ? [...items.values()] : itemsOf(characterId));
    },
    async putItem(item) {
      items.set(itemId(item.characterId, item.kind, item.key), structuredClone(item));
    },
    async removeItem(characterId, kind, key) {
      items.delete(itemId(characterId, kind, key));
    },
    async getMeta(name) {
      return meta.has(name) ? structuredClone(meta.get(name)) : null;
    },
    async setMeta(name, value) {
      meta.set(name, structuredClone(value));
    },
    async clear() {
      characters.clear();
      items.clear();
      meta.clear();
    },
  };
}
```

Create `apps/web/src/storage/serial.ts`:

```ts
import type { AppStorage } from './types';

/**
 * Runs every call to the storage one after another, in the order they were made. A delete therefore
 * waits for the writes that were started before it, and cannot leave one of them behind.
 * A call that fails rejects for its own caller and does not stop the calls behind it.
 */
export function serial(storage: AppStorage): AppStorage {
  let tail: Promise<unknown> = Promise.resolve();
  const queued = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      const result = tail.then(() => call(...args));
      tail = result.catch(() => undefined);
      return result;
    };
  return {
    listCharacters: queued(() => storage.listCharacters()),
    putCharacter: queued((character) => storage.putCharacter(character)),
    removeCharacter: queued((id) => storage.removeCharacter(id)),
    rekeyCharacter: queued((oldId, character) => storage.rekeyCharacter(oldId, character)),
    listItems: queued((characterId?: string) => storage.listItems(characterId)),
    putItem: queued((item) => storage.putItem(item)),
    removeItem: queued((characterId, kind, key) => storage.removeItem(characterId, kind, key)),
    getMeta: queued((name) => storage.getMeta(name)),
    setMeta: queued((name, value) => storage.setMeta(name, value)),
    clear: queued(() => storage.clear()),
  };
}
```

Replace the whole of `apps/web/src/storage/types.ts` with:

```ts
/** The kinds of item that sync to the account, one row each in `character_items`. */
export const SYNCED_KINDS = ['play', 'edit', 'custom', 'order'] as const;
export type SyncedKind = (typeof SYNCED_KINDS)[number];

/** `turn` (the Action, Bonus Action and Reaction pills) never leaves the device. */
export type ItemKind = SyncedKind | 'turn';

/** The key of the one `play` item and the one `turn` item each character has. */
export const STATE_KEY = 'state';

/** One imported character. Mirrors a row of the `characters` table. */
export interface StoredCharacter {
  /** `ddb-<ddbId>-<ownerId>` for an imported character; a UUID for pasted JSON with no D&D Beyond ID. */
  id: string;
  /** The account that owns it. Null only for a character imported before accounts existed. */
  ownerId: string | null;
  /** The D&D Beyond character ID, as a string. "0" when the JSON had none. */
  ddbId: string;
  name: string;
  /** The D&D Beyond response exactly as it was imported. Null once the character is deleted. */
  rawJson: unknown;
  /** ISO 8601 date and time. */
  importedAt: string;
  /** When this record last changed, by this device's clock when it made the change. */
  updatedAt: string;
  /** A deleted character is kept until the account has been told. */
  deleted: boolean;
  /** Changed on this device and not yet accepted by the account. */
  dirty: boolean;
}

/** Something attached to a character: what is spent, one ability's edits, one view's order. */
export interface StoredItem {
  characterId: string;
  kind: ItemKind;
  key: string;
  /** Checked and repaired by whoever reads it. Null once the item is deleted. */
  data: unknown;
  updatedAt: string;
  deleted: boolean;
  dirty: boolean;
}

/**
 * Where this device keeps its copy of everything. Named AppStorage because `Storage` is already
 * the browser's own type for localStorage. Every value is copied on the way in and on the way out.
 */
export interface AppStorage {
  /** Every character, including deleted ones that the account has not yet been told about. */
  listCharacters(): Promise<StoredCharacter[]>;
  putCharacter(character: StoredCharacter): Promise<void>;
  /** Removes the character and every item it has from this device. */
  removeCharacter(id: string): Promise<void>;
  /** Stores `character` in place of the one with `oldId`, moving that character's items to it. */
  rekeyCharacter(oldId: string, character: StoredCharacter): Promise<void>;
  /** One character's items, or every item when no ID is given. */
  listItems(characterId?: string): Promise<StoredItem[]>;
  putItem(item: StoredItem): Promise<void>;
  removeItem(characterId: string, kind: ItemKind, key: string): Promise<void>;
  /** A small named value: who is signed in, how far fetching has got. Null when never set. */
  getMeta(name: string): Promise<unknown>;
  setMeta(name: string, value: unknown): Promise<void>;
  /** Empties everything. Used when signing out. */
  clear(): Promise<void>;
}
```

Apply this change to `apps/web/src/store.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,11 +1,12 @@
 import { convertCharacter } from '@cw/ddb-import';
 import type { Ability, PlayState } from '@cw/model';
 import {
-  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, pools, rest,
-  startTurn, togglePill, useSummary, type Sheet, type TurnTiming, type ViewMode,
+  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, normalisePlayItem,
+  normaliseTurn, pools, rest, startTurn, togglePill, useSummary, type PlayItem, type Sheet,
+  type TurnTiming, type ViewMode,
 } from '@cw/rules';
 import { create } from 'zustand';
-import { memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';
+import { STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';
 
 export interface Undo {
   /** The play state to go back to. */
@@ -23,6 +24,8 @@ export interface AppStore {
   openId: string | null;
   sheet: Sheet | null;
   play: PlayState;
+  /** False while the open character's saved play state is still being read. Nothing can be changed until it is. */
+  loaded: boolean;
   /** One step, held in memory only. */
   undo: Undo | null;
 
@@ -43,19 +46,51 @@ export interface AppStore {
 
 let storage: AppStorage = memoryStorage();
 
-const sheetCache = new Map<string, Sheet>();
+/** One sheet per character: a re-import replaces it and a delete drops it. */
+const sheetCache = new Map<string, { importedAt: string; sheet: Sheet }>();
 
 /** The calculated sheet for a stored character. Converted from the raw JSON on first use. */
 export function sheetFor(character: StoredCharacter): Sheet {
-  const cacheKey = `${character.id}|${character.importedAt}`;
-  let sheet = sheetCache.get(cacheKey);
-  if (!sheet) {
-    sheet = buildSheet(convertCharacter(character.rawJson));
-    sheetCache.set(cacheKey, sheet);
-  }
+  const cached = sheetCache.get(character.id);
+  if (cached && cached.importedAt === character.importedAt) return cached.sheet;
+  const sheet = buildSheet(convertCharacter(character.rawJson));
+  sheetCache.set(character.id, { importedAt: character.importedAt, sheet });
   return sheet;
 }
 
+/** How many sheets are cached. For tests. */
+export const cachedSheetCount = (): number => sheetCache.size;
+
+const playItem = (state: PlayState): PlayItem => ({ spent: state.spent, concentrationKey: state.concentrationKey });
+const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
+
+/** A character's saved play state, repaired where it is malformed. Empty when nothing is saved. */
+async function loadPlay(id: string): Promise<PlayState> {
+  const items = await storage.listItems(id);
+  const data = (kind: 'play' | 'turn'): unknown =>
+    items.find((item) => item.kind === kind && item.key === STATE_KEY && !item.deleted)?.data;
+  return { ...normalisePlayItem(data('play')), turn: normaliseTurn(data('turn')) };
+}
+
+/**
+ * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
+ * An item is written only when it differs from `previous`, so flipping a pill does not touch the
+ * synced item.
+ */
+async function savePlay(id: string, next: PlayState, previous: PlayState | null): Promise<void> {
+  const updatedAt = new Date().toISOString();
+  if (!previous || !same(playItem(next), playItem(previous))) {
+    await storage.putItem({
+      characterId: id, kind: 'play', key: STATE_KEY, data: playItem(next), updatedAt, deleted: false, dirty: true,
+    });
+  }
+  if (!previous || !same(next.turn, previous.turn)) {
+    await storage.putItem({
+      characterId: id, kind: 'turn', key: STATE_KEY, data: next.turn, updatedAt, deleted: false, dirty: false,
+    });
+  }
+}
+
 /**
  * A random version 4 UUID. Browsers offer `crypto.randomUUID` only on secure pages, so a phone
  * reaching the dev server over the local network builds one from random bytes instead.
@@ -76,6 +111,7 @@ const initial = {
   openId: null as string | null,
   sheet: null as Sheet | null,
   play: emptyPlayState(),
+  loaded: false,
   undo: null as Undo | null,
 };
 
@@ -91,10 +127,10 @@ export const useStore = create<AppStore>()((set, get) => {
 
   /** Applies a play change to the open character and saves it. */
   const change = (next: PlayState, undo: Undo | null): void => {
-    const { openId, play } = get();
-    if (openId === null || next === play) return;
+    const { openId, play, loaded } = get();
+    if (openId === null || !loaded || next === play) return;
     set({ play: next, undo });
-    void save(storage.putPlay(openId, next));
+    void save(savePlay(openId, next, play));
   };
 
   return {
@@ -119,12 +155,17 @@ export const useStore = create<AppStore>()((set, get) => {
       const ddbId = String(converted.id);
       // An ID of 0 means the JSON had none, so it can never match a stored character.
       const existing = ddbId === '0' ? undefined : get().characters.find((c) => c.ddbId === ddbId);
+      const importedAt = new Date().toISOString();
       const record: StoredCharacter = {
         id: existing?.id ?? newId(),
+        ownerId: existing?.ownerId ?? null,
         ddbId,
         name: converted.name || 'Unnamed character',
         rawJson: raw,
-        importedAt: new Date().toISOString(),
+        importedAt,
+        updatedAt: importedAt,
+        deleted: false,
+        dirty: true,
       };
       try {
         sheetFor(record);
@@ -139,36 +180,38 @@ export const useStore = create<AppStore>()((set, get) => {
         if (get().openId === record.id) {
           // The open character's play state in memory is the newest copy.
           const sheet = sheetFor(record);
-          const play = clampState(get().play, sheet);
+          const before = get().play;
+          const play = clampState(before, sheet);
           set({ sheet, play, undo: null });
-          await save(storage.putPlay(record.id, play));
+          await save(savePlay(record.id, play, before));
         } else {
-          const saved = await storage.getPlay(record.id).catch(() => null);
-          if (saved) await save(storage.putPlay(record.id, clampState(saved, sheetFor(record))));
+          const saved = await loadPlay(record.id).catch(() => null);
+          if (saved) await save(savePlay(record.id, clampState(saved, sheetFor(record)), saved));
         }
       }
       return record;
     },
 
     async remove(id) {
-      await save(storage.deleteCharacter(id));
+      await save(storage.removeCharacter(id));
+      sheetCache.delete(id);
       set({ characters: get().characters.filter((c) => c.id !== id) });
-      if (get().openId === id) set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
+      if (get().openId === id) set({ openId: null, sheet: null, play: emptyPlayState(), loaded: false, undo: null });
     },
 
     async open(id) {
       const character = get().characters.find((c) => c.id === id);
       if (!character) {
-        set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
+        set({ openId: null, sheet: null, play: emptyPlayState(), loaded: false, undo: null });
         return;
       }
       // Already open: the play state in memory is the newest copy, even if saving it failed.
       if (get().openId === id && get().sheet) return;
       const sheet = sheetFor(character);
-      set({ openId: id, sheet, play: emptyPlayState(), undo: null });
-      const saved = await storage.getPlay(id).catch(() => null);
+      set({ openId: id, sheet, play: emptyPlayState(), loaded: false, undo: null });
+      const saved = await loadPlay(id).catch(() => emptyPlayState());
       // Ignore the answer if the player has already moved to another character.
-      if (saved && get().openId === id) set({ play: clampState(saved, sheet) });
+      if (get().openId === id) set({ play: clampState(saved, sheet), loaded: true });
     },
 
     use(ability, mode, slot) {
```

Replace the whole of `packages/rules/src/index.ts` with:

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
export * from './normalise';
export * from './views';
```

Create `packages/rules/src/normalise.ts`:

```ts
import type { PlayState, TurnState } from '@cw/model';

/** The part of the play state that syncs: what is spent and what is being concentrated on. */
export type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Stored and synced records are checked and repaired before use, because they may have been
 * written by an older version of the app, by another device, or by hand in the database.
 * These functions never throw.
 */
export function normalisePlayItem(data: unknown): PlayItem {
  const source = isRecord(data) ? data : {};
  const spent: Record<string, number> = {};
  if (isRecord(source.spent)) {
    for (const [key, value] of Object.entries(source.spent)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) spent[key] = Math.floor(value);
    }
  }
  const concentrationKey = typeof source.concentrationKey === 'string' ? source.concentrationKey : null;
  return { spent, concentrationKey };
}

export function normaliseTurn(data: unknown): TurnState {
  const source = isRecord(data) ? data : {};
  return {
    action: source.action === true,
    bonus: source.bonus === true,
    reaction: source.reaction === true,
    slotSpentThisTurn: source.slotSpentThisTurn === true,
  };
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (565 tests in 28 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Device storage version 2 and store hardening" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: The `Remote` interface and an in-memory account

Everything the app asks of the account goes through one interface (spec section 4). This task defines it and builds the in-memory implementation, which tests use and which local development uses in place of Supabase. The rules it keeps (who may see and write what, the later change winning, ten characters, thirty imports an hour) are written as one list of cases in `contract.ts`. Task 4 runs the same list against the real SQL, so the two cannot drift apart.

**Files:**
- Create (test): `apps/web/src/remote/contract.ts`
- Create (test): `apps/web/src/remote/memory.test.ts`
- Create: `apps/web/src/remote/memory.ts`
- Create: `apps/web/src/remote/types.ts`

**Interfaces:**
- Consumes:
  - `SyncedKind` from `apps/web/src/storage` (Task 2).
- Produces:
  - `apps/web/src/remote/types.ts`: `Profile`, `RemoteCharacter`, `RemoteItem`, `CharacterPush`, `ItemPush`, `PushResult`, `ImportResult`, `ImportAllowance`, `RemoteError` (with `kind: 'offline' | 'unauthorized' | 'refused' | 'other'`), `CHARACTER_LIMIT = 10`, `IMPORTS_PER_HOUR = 30`, and `Remote` with `start(onUser)`, `signIn()`, `signOut()`, `profile()`, `listProfiles()`, `setApproved(userId, approved)`, `pushCharacters(rows)`, `pushItems(rows)`, `pullCharacters(afterRev)`, `pullItems(afterRev)`, `importCharacter(ddbId)`.
  - `memoryServer(options?): MemoryServer` with `addUser(id, displayName, { approved?, admin? })`, `remote({ userId?, signInAs? }): MemoryRemote` and `offline: boolean`. `MemoryRemote` is a `Remote` plus `recordImport()`.
  - `remoteContract(name, make)`, `ContractBackend`, `ContractClient`, and the fixtures `ANN`, `BEN`, `DEE`, `NEW`, `character(id, over?)`, `item(characterId, kind, key, over?)` in `apps/web/src/remote/contract.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/remote/contract.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHARACTER_LIMIT, IMPORTS_PER_HOUR } from './types';
import type { CharacterPush, ImportAllowance, ItemPush, Remote } from './types';

/** The calls the contract makes as one signed-in user. */
export type ContractClient = Pick<
  Remote,
  'profile' | 'listProfiles' | 'setApproved' | 'pushCharacters' | 'pushItems' | 'pullCharacters' | 'pullItems'
> & { recordImport(): Promise<ImportAllowance> };

/** An account to test: the in-memory server, or the real SQL running on PGlite. */
export interface ContractBackend {
  /** Creates a user as a first sign-in would, then sets the two flags directly. */
  addUser(id: string, displayName: string, options?: { approved?: boolean; admin?: boolean }): Promise<void>;
  as(userId: string): ContractClient;
}

export const ANN = '00000000-0000-4000-8000-00000000000a';
export const BEN = '00000000-0000-4000-8000-00000000000b';
export const DEE = '00000000-0000-4000-8000-0000000000d0';
export const NEW = '00000000-0000-4000-8000-0000000000e0';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';
const T3 = '2026-01-03T10:00:00.000Z';

export const character = (id: string, over: Partial<CharacterPush> = {}): CharacterPush => ({
  id, ddbId: '42', name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: T1, updatedAt: T1, deleted: false, ...over,
});

export const item = (characterId: string, kind: ItemPush['kind'], key: string, over: Partial<ItemPush> = {}): ItemPush => ({
  characterId, kind, key, data: { value: 1 }, updatedAt: T1, deleted: false, ...over,
});

/** Ann and Ben are approved players, Dee is the table admin, and the fourth user has just signed in. */
async function table(make: () => Promise<ContractBackend>): Promise<ContractBackend> {
  const backend = await make();
  await backend.addUser(ANN, 'Ann', { approved: true });
  await backend.addUser(BEN, 'Ben', { approved: true });
  await backend.addUser(DEE, 'Dee', { approved: true, admin: true });
  await backend.addUser(NEW, 'Newcomer');
  return backend;
}

const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

/**
 * The rules every account must keep. Run against `memoryServer` in the web tests and against the
 * SQL migrations in the database tests, so the two cannot drift apart.
 */
export function remoteContract(name: string, make: () => Promise<ContractBackend>): void {
  describe(`account rules: ${name}`, () => {
    describe('profiles', () => {
      it('gives a new user a profile that is neither approved nor admin', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).profile()).toEqual({ id: NEW, displayName: 'Newcomer', approved: false, isTableAdmin: false });
      });

      it('shows a player only their own profile and an admin every profile, by name', async () => {
        const backend = await table(make);
        expect((await backend.as(ANN).listProfiles()).map((p) => p.displayName)).toEqual(['Ann']);
        expect((await backend.as(NEW).listProfiles()).map((p) => p.displayName)).toEqual(['Newcomer']);
        expect((await backend.as(DEE).listProfiles()).map((p) => p.displayName)).toEqual(['Ann', 'Ben', 'Dee', 'Newcomer']);
      });

      it('lets an admin approve a player and remove access again', async () => {
        const backend = await table(make);
        await backend.as(DEE).setApproved(NEW, true);
        expect((await backend.as(NEW).profile())?.approved).toBe(true);
        expect((await backend.as(NEW).pushCharacters([character('n1')])).rejected).toEqual([]);
        await backend.as(DEE).setApproved(NEW, false);
        expect(await backend.as(NEW).pullCharacters(0)).toEqual([]);
      });

      it('refuses approval by anyone who is not an admin, and an admin changing their own', async () => {
        const backend = await table(make);
        await expect(backend.as(ANN).setApproved(NEW, true)).rejects.toMatchObject({ kind: 'refused' });
        await expect(backend.as(NEW).setApproved(NEW, true)).rejects.toMatchObject({ kind: 'refused' });
        await expect(backend.as(DEE).setApproved(DEE, false)).rejects.toMatchObject({ kind: 'refused' });
        expect((await backend.as(NEW).profile())?.approved).toBe(false);
        expect((await backend.as(DEE).profile())?.approved).toBe(true);
      });
    });

    describe('characters', () => {
      it('stores a character for its creator and returns it with a rev', async () => {
        const backend = await table(make);
        expect(await backend.as(ANN).pushCharacters([character('a1')])).toEqual({ rejected: [] });
        const [row] = await backend.as(ANN).pullCharacters(0);
        expect(row).toMatchObject({ ...character('a1'), ownerId: ANN });
        expect(row.rev).toBeGreaterThan(0);
      });

      it('shows a character to its owner and to an admin, and to nobody else', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        await backend.as(BEN).pushCharacters([character('b1')]);
        expect(ids(await backend.as(ANN).pullCharacters(0))).toEqual(['a1']);
        expect(ids(await backend.as(BEN).pullCharacters(0))).toEqual(['b1']);
        expect(ids(await backend.as(DEE).pullCharacters(0))).toEqual(['a1', 'b1']);
        expect(await backend.as(NEW).pullCharacters(0)).toEqual([]);
      });

      it('refuses every write from a user who is not approved', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).pushCharacters([character('n1')])).toEqual({ rejected: [{ id: 'n1', reason: 'refused' }] });
        expect(await backend.as(DEE).pullCharacters(0)).toEqual([]);
      });

      it('keeps the later change: an older or equal write is skipped without being rejected', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1', { name: 'Second', updatedAt: T2 })]);
        const [before] = await ann.pullCharacters(0);
        expect(await ann.pushCharacters([character('a1', { name: 'Older', updatedAt: T1 })])).toEqual({ rejected: [] });
        expect(await ann.pushCharacters([character('a1', { name: 'Same time', updatedAt: T2 })])).toEqual({ rejected: [] });
        expect(await ann.pullCharacters(0)).toEqual([before]);
        await ann.pushCharacters([character('a1', { name: 'Third', updatedAt: T3 })]);
        const [after] = await ann.pullCharacters(0);
        expect(after.name).toBe('Third');
        expect(after.rev).toBeGreaterThan(before.rev);
      });

      it('never records a time in the future', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1', { updatedAt: '2999-01-01T00:00:00.000Z' })]);
        const [row] = await backend.as(ANN).pullCharacters(0);
        expect(Date.parse(row.updatedAt)).toBeLessThanOrEqual(Date.now() + 5000);
      });

      it('lets an admin change a player\'s character without becoming its owner', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(DEE).pushCharacters([character('a1', { name: 'Fixed by Dee', updatedAt: T2 })])).toEqual({ rejected: [] });
        expect((await backend.as(ANN).pullCharacters(0))[0]).toMatchObject({ name: 'Fixed by Dee', ownerId: ANN });
      });

      it('refuses a player writing another player\'s character', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(BEN).pushCharacters([character('a1', { name: 'Stolen', updatedAt: T2 })]))
          .toEqual({ rejected: [{ id: 'a1', reason: 'refused' }] });
        expect((await backend.as(ANN).pullCharacters(0))[0].name).toBe('Character a1');
      });

      it('makes whoever creates a character its owner, admin included', async () => {
        const backend = await table(make);
        await backend.as(DEE).pushCharacters([character('d1')]);
        expect((await backend.as(DEE).pullCharacters(0))[0].ownerId).toBe(DEE);
        expect(await backend.as(ANN).pullCharacters(0)).toEqual([]);
      });

      it(`holds ${CHARACTER_LIMIT} live characters per owner, and takes the rest of a batch when one is over`, async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        const ten = Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`a${i}`));
        expect(await ann.pushCharacters(ten)).toEqual({ rejected: [] });
        const result = await ann.pushCharacters([
          character('extra'),
          character('a0', { name: 'Renamed', updatedAt: T2 }),
        ]);
        expect(result).toEqual({ rejected: [{ id: 'extra', reason: 'limit' }] });
        const rows = await ann.pullCharacters(0);
        expect(rows).toHaveLength(CHARACTER_LIMIT);
        expect(rows.find((r) => r.id === 'a0')?.name).toBe('Renamed');
      });

      it('frees a place when a character is deleted', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters(Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`a${i}`)));
        await ann.pushCharacters([character('a0', { deleted: true, updatedAt: T2 })]);
        expect(await ann.pushCharacters([character('extra')])).toEqual({ rejected: [] });
      });

      it('counts the limit against the owner, not against an admin who edits', async () => {
        const backend = await table(make);
        await backend.as(DEE).pushCharacters(Array.from({ length: CHARACTER_LIMIT }, (_, i) => character(`d${i}`)));
        await backend.as(ANN).pushCharacters([character('a1')]);
        expect(await backend.as(DEE).pushCharacters([character('a1', { name: 'Edited', updatedAt: T2 })])).toEqual({ rejected: [] });
      });
    });

    describe('deleting a character', () => {
      it('keeps the row as deleted with no raw JSON, and removes its items', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'play', 'state'), item('a1', 'edit', 'spell:1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        expect((await ann.pullCharacters(0))[0]).toMatchObject({ id: 'a1', deleted: true, rawJson: null });
        expect(await ann.pullItems(0)).toEqual([]);
      });

      it('skips an item sent for a deleted character', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        await ann.pushItems([item('a1', 'play', 'state', { updatedAt: T3 })]);
        expect(await ann.pullItems(0)).toEqual([]);
      });

      it('brings a deleted character back when a newer live copy arrives', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushCharacters([character('a1', { deleted: true, updatedAt: T2 })]);
        await ann.pushCharacters([character('a1', { updatedAt: T3 })]);
        expect((await ann.pullCharacters(0))[0]).toMatchObject({ deleted: false, rawJson: { data: { name: 'a1' } } });
      });
    });

    describe('items', () => {
      it('stores items by character, kind and key', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([
          item('a1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null } }),
          item('a1', 'edit', 'spell:1', { data: { hidden: true } }),
          item('a1', 'order', 'combat', { data: ['spell:1'] }),
        ]);
        const rows = await ann.pullItems(0);
        expect(rows.map((r) => [r.kind, r.key, r.data]).sort()).toEqual([
          ['edit', 'spell:1', { hidden: true }],
          ['order', 'combat', ['spell:1']],
          ['play', 'state', { spent: { pact: 1 }, concentrationKey: null }],
        ]);
      });

      it('keeps the later change for each item on its own', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([
          item('a1', 'edit', 'one', { data: { hidden: true }, updatedAt: T2 }),
          item('a1', 'edit', 'two', { data: { hidden: true }, updatedAt: T1 }),
        ]);
        await ann.pushItems([
          item('a1', 'edit', 'one', { data: { hidden: false }, updatedAt: T1 }),
          item('a1', 'edit', 'two', { data: { hidden: false }, updatedAt: T2 }),
        ]);
        const byKey = new Map((await ann.pullItems(0)).map((r) => [r.key, r.data]));
        expect(byKey.get('one')).toEqual({ hidden: true });
        expect(byKey.get('two')).toEqual({ hidden: false });
      });

      it('keeps a deleted item as a row with no data', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'custom', 'own:1')]);
        await ann.pushItems([item('a1', 'custom', 'own:1', { deleted: true, updatedAt: T2 })]);
        expect((await ann.pullItems(0))[0]).toMatchObject({ key: 'own:1', deleted: true, data: null });
      });

      it('lets an admin read and write a player\'s items, and nobody else', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushCharacters([character('a1')]);
        await backend.as(ANN).pushItems([item('a1', 'edit', 'one')]);
        await backend.as(DEE).pushItems([item('a1', 'edit', 'two')]);
        await backend.as(BEN).pushItems([item('a1', 'edit', 'three')]);
        await backend.as(NEW).pushItems([item('a1', 'edit', 'four')]);
        expect((await backend.as(ANN).pullItems(0)).map((r) => r.key).sort()).toEqual(['one', 'two']);
        expect((await backend.as(DEE).pullItems(0)).map((r) => r.key).sort()).toEqual(['one', 'two']);
        expect(await backend.as(BEN).pullItems(0)).toEqual([]);
        expect(await backend.as(NEW).pullItems(0)).toEqual([]);
      });

      it('skips an item for a character that does not exist', async () => {
        const backend = await table(make);
        await backend.as(ANN).pushItems([item('nowhere', 'play', 'state')]);
        expect(await backend.as(DEE).pullItems(0)).toEqual([]);
      });
    });

    describe('fetching changes', () => {
      it('returns only rows after the given rev, lowest first, with one numbering for both tables', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        await ann.pushItems([item('a1', 'play', 'state')]);
        await ann.pushCharacters([character('a2')]);
        const characters = await ann.pullCharacters(0);
        const [play] = await ann.pullItems(0);
        expect(characters.map((c) => c.id)).toEqual(['a1', 'a2']);
        expect(characters[0].rev).toBeLessThan(play.rev);
        expect(play.rev).toBeLessThan(characters[1].rev);
        expect((await ann.pullCharacters(characters[0].rev)).map((c) => c.id)).toEqual(['a2']);
        expect(await ann.pullCharacters(characters[1].rev)).toEqual([]);
        expect(await ann.pullItems(play.rev)).toEqual([]);
      });

      it('gives a changed row a new rev, so it is fetched again', async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        await ann.pushCharacters([character('a1')]);
        const [first] = await ann.pullCharacters(0);
        await ann.pushCharacters([character('a1', { name: 'Renamed', updatedAt: T2 })]);
        expect((await ann.pullCharacters(first.rev)).map((c) => c.name)).toEqual(['Renamed']);
      });
    });

    describe('the import check', () => {
      it('turns away a user who is not approved', async () => {
        const backend = await table(make);
        expect(await backend.as(NEW).recordImport()).toBe('not-approved');
      });

      it(`allows ${IMPORTS_PER_HOUR} imports in an hour for each player, then says so`, async () => {
        const backend = await table(make);
        const ann = backend.as(ANN);
        for (let i = 0; i < IMPORTS_PER_HOUR; i += 1) expect(await ann.recordImport()).toBe('ok');
        expect(await ann.recordImport()).toBe('rate-limited');
        expect(await backend.as(BEN).recordImport()).toBe('ok');
      });
    });
  });
}
```

Create `apps/web/src/remote/memory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ANN, character, remoteContract, type ContractBackend } from './contract';
import { memoryServer } from './memory';
import { IMPORTS_PER_HOUR, RemoteError } from './types';

remoteContract('memoryServer', async (): Promise<ContractBackend> => {
  const server = memoryServer();
  return {
    async addUser(id, displayName, options) {
      server.addUser(id, displayName, options);
    },
    as: (userId) => server.remote({ userId }),
  };
});

describe('memoryServer', () => {
  it('rejects every call from a signed-out device as unauthorized', async () => {
    const remote = memoryServer().remote();
    await expect(remote.profile()).rejects.toBeInstanceOf(RemoteError);
    await expect(remote.pullCharacters(0)).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(remote.pushCharacters([character('a1')])).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('rejects every call as offline while offline', async () => {
    const server = memoryServer();
    server.addUser(ANN, 'Ann', { approved: true });
    const remote = server.remote({ userId: ANN });
    server.offline = true;
    await expect(remote.pullItems(0)).rejects.toMatchObject({ kind: 'offline' });
    server.offline = false;
    expect(await remote.pullItems(0)).toEqual([]);
  });

  it('tells the listener who is signed in at start, after sign-in and after sign-out', async () => {
    const server = memoryServer();
    const remote = server.remote({ signInAs: { id: ANN, displayName: 'Test player' } });
    const seen: (string | null)[] = [];
    await remote.start((userId) => seen.push(userId));
    await remote.signIn();
    await remote.signOut();
    expect(seen).toEqual([null, ANN, null]);
  });

  it('creates the sign-in user as an approved admin, which is what local development wants', async () => {
    const remote = memoryServer().remote({ signInAs: { id: ANN, displayName: 'Test player' } });
    await remote.start(() => undefined);
    await remote.signIn();
    expect(await remote.profile()).toEqual({ id: ANN, displayName: 'Test player', approved: true, isTableAdmin: true });
  });

  it('forgets imports older than an hour', async () => {
    let now = Date.parse('2026-11-18T12:00:00.000Z');
    const server = memoryServer({ now: () => now });
    server.addUser(ANN, 'Ann', { approved: true });
    const remote = server.remote({ userId: ANN });
    for (let i = 0; i < IMPORTS_PER_HOUR; i += 1) await remote.recordImport();
    expect(await remote.recordImport()).toBe('rate-limited');
    now += 61 * 60 * 1000;
    expect(await remote.recordImport()).toBe('ok');
  });

  it('checks before it imports, and passes an allowed import to the importer', async () => {
    const importer = vi.fn(async () => ({ status: 'ok' as const, raw: { data: { id: 42 } } }));
    const server = memoryServer({ importer });
    server.addUser(ANN, 'Ann');
    const remote = server.remote({ userId: ANN });
    expect(await remote.importCharacter('42')).toEqual({ status: 'not-approved' });
    expect(importer).not.toHaveBeenCalled();
    server.addUser(ANN, 'Ann', { approved: true });
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    expect(importer).toHaveBeenCalledWith('42');
  });

  it('answers an import from a signed-out device with unauthorized, and with unreachable when offline', async () => {
    const server = memoryServer();
    expect(await server.remote().importCharacter('42')).toEqual({ status: 'unauthorized' });
    server.addUser(ANN, 'Ann', { approved: true });
    server.offline = true;
    expect(await server.remote({ userId: ANN }).importCharacter('42')).toEqual({ status: 'unreachable' });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/remote/memory.test.ts
```

Expected: FAIL. `./memory` and `./types` cannot be found.

- [ ] **Step 3: Write the implementation**

`contract.ts` is not a test file by name, because Task 4 imports it from another test. It only does anything when `remoteContract` is called.

Create `apps/web/src/remote/memory.ts`:

```ts
import {
  CHARACTER_LIMIT, IMPORTS_PER_HOUR, RemoteError,
  type CharacterPush, type ImportAllowance, type ImportResult, type ItemPush, type Profile, type PushResult,
  type Remote, type RemoteCharacter, type RemoteItem,
} from './types';

const HOUR = 60 * 60 * 1000;

export interface MemoryServerOptions {
  /** The server's clock, in milliseconds. Tests replace it. */
  now?: () => number;
  /** What an allowed import returns. Local development points this at the dev server. */
  importer?: (ddbId: string) => Promise<ImportResult>;
}

export interface MemoryRemoteOptions {
  /** Who this device is signed in as. Omit for a signed-out device. */
  userId?: string | null;
  /** Who `signIn()` signs this device in as. The user is created, approved and admin, if new. */
  signInAs?: { id: string; displayName: string };
}

/** A Remote with the account's import check exposed, so tests can call it without an import. */
export interface MemoryRemote extends Remote {
  recordImport(): Promise<ImportAllowance>;
}

export interface MemoryServer {
  addUser(id: string, displayName: string, options?: { approved?: boolean; admin?: boolean }): void;
  /** A device's connection to this server. */
  remote(options?: MemoryRemoteOptions): MemoryRemote;
  /** While true, every call from every device rejects with RemoteError('offline'). */
  offline: boolean;
}

const itemId = (row: { characterId: string; kind: string; key: string }): string =>
  JSON.stringify([row.characterId, row.kind, row.key]);

/**
 * The account, in memory. It keeps the same rules as the SQL in supabase/migrations: who may see
 * and write what, the later change winning, the ten-character limit and the import rate limit.
 * `remote/contract.ts` runs one list of cases against both, so that they cannot drift apart.
 */
export function memoryServer(options: MemoryServerOptions = {}): MemoryServer {
  const now = options.now ?? Date.now;
  const profiles = new Map<string, Profile>();
  const characters = new Map<string, RemoteCharacter>();
  const items = new Map<string, RemoteItem>();
  const imports: { userId: string; at: number }[] = [];
  let rev = 0;

  /** The time a write is recorded as: its own, but never later than the server's clock. */
  const capped = (updatedAt: string): string => {
    const time = Date.parse(updatedAt);
    return new Date(Number.isFinite(time) ? Math.min(time, now()) : now()).toISOString();
  };
  const newer = (incoming: string, stored: string): boolean => Date.parse(incoming) > Date.parse(stored);
  const liveCount = (ownerId: string): number =>
    [...characters.values()].filter((c) => c.ownerId === ownerId && !c.deleted).length;

  const server: MemoryServer = {
    offline: false,

    addUser(id, displayName, { approved = false, admin = false } = {}) {
      profiles.set(id, { id, displayName, approved, isTableAdmin: admin });
    },

    remote(remoteOptions = {}) {
      let userId = remoteOptions.userId ?? null;
      let listener: (id: string | null) => void = () => undefined;

      /** The signed-in user's profile. Rejects when offline or signed out. */
      const caller = (): Profile => {
        if (server.offline) throw new RemoteError('offline');
        const profile = userId === null ? undefined : profiles.get(userId);
        if (!profile) throw new RemoteError('unauthorized');
        return profile;
      };
      const isAdmin = (p: Profile): boolean => p.approved && p.isTableAdmin;
      const canSee = (p: Profile, c: RemoteCharacter): boolean => p.approved && (c.ownerId === p.id || isAdmin(p));

      const recordImport = async (): Promise<ImportAllowance> => {
        const me = caller();
        if (!me.approved) return 'not-approved';
        const since = now() - HOUR;
        if (imports.filter((i) => i.userId === me.id && i.at > since).length >= IMPORTS_PER_HOUR) return 'rate-limited';
        imports.push({ userId: me.id, at: now() });
        return 'ok';
      };

      return {
        async start(onUser) {
          listener = onUser;
          onUser(userId);
        },
        async signIn() {
          const who = remoteOptions.signInAs;
          if (!who) return;
          if (!profiles.has(who.id)) server.addUser(who.id, who.displayName, { approved: true, admin: true });
          userId = who.id;
          listener(userId);
        },
        async signOut() {
          userId = null;
          listener(null);
        },

        async profile() {
          return { ...caller() };
        },
        async listProfiles() {
          const me = caller();
          const visible = isAdmin(me) ? [...profiles.values()] : [me];
          return visible.map((p) => ({ ...p })).sort((a, b) => a.displayName.localeCompare(b.displayName));
        },
        async setApproved(id, approved) {
          const me = caller();
          const target = profiles.get(id);
          if (!isAdmin(me) || id === me.id || !target) throw new RemoteError('refused');
          profiles.set(id, { ...target, approved });
        },

        async pushCharacters(rows: CharacterPush[]): Promise<PushResult> {
          const me = caller();
          const rejected: PushResult['rejected'] = [];
          for (const row of rows) {
            const existing = characters.get(row.id);
            if (!me.approved || (existing && !canSee(me, existing))) {
              rejected.push({ id: row.id, reason: 'refused' });
              continue;
            }
            const updatedAt = capped(row.updatedAt);
            if (existing && !newer(updatedAt, existing.updatedAt)) continue;
            const ownerId = existing?.ownerId ?? me.id;
            const becomesLive = !row.deleted && (!existing || existing.deleted);
            if (becomesLive && liveCount(ownerId) >= CHARACTER_LIMIT) {
              rejected.push({ id: row.id, reason: 'limit' });
              continue;
            }
            rev += 1;
            characters.set(row.id, structuredClone({
              ...row, ownerId, updatedAt, rawJson: row.deleted ? null : row.rawJson, rev,
            }));
            if (row.deleted) {
              for (const item of [...items.values()]) {
                if (item.characterId === row.id) items.delete(itemId(item));
              }
            }
          }
          return { rejected };
        },

        async pushItems(rows: ItemPush[]) {
          const me = caller();
          for (const row of rows) {
            const character = characters.get(row.characterId);
            if (!character || character.deleted || !canSee(me, character)) continue;
            const existing = items.get(itemId(row));
            const updatedAt = capped(row.updatedAt);
            if (existing && !newer(updatedAt, existing.updatedAt)) continue;
            rev += 1;
            items.set(itemId(row), structuredClone({ ...row, updatedAt, data: row.deleted ? null : row.data, rev }));
          }
        },

        async pullCharacters(afterRev) {
          const me = caller();
          return structuredClone(
            [...characters.values()].filter((c) => c.rev > afterRev && canSee(me, c)).sort((a, b) => a.rev - b.rev),
          );
        },
        async pullItems(afterRev) {
          const me = caller();
          const visible = (item: RemoteItem): boolean => {
            const character = characters.get(item.characterId);
            return character !== undefined && !character.deleted && canSee(me, character);
          };
          return structuredClone(
            [...items.values()].filter((i) => i.rev > afterRev && visible(i)).sort((a, b) => a.rev - b.rev),
          );
        },

        recordImport,
        async importCharacter(ddbId) {
          let allowed: ImportAllowance;
          try {
            allowed = await recordImport();
          } catch (error) {
            return { status: error instanceof RemoteError && error.kind === 'unauthorized' ? 'unauthorized' : 'unreachable' };
          }
          if (allowed !== 'ok') return { status: allowed };
          return options.importer ? options.importer(ddbId) : { status: 'unreachable' };
        },
      };
    },
  };
  return server;
}
```

Create `apps/web/src/remote/types.ts`:

```ts
import type { SyncedKind } from '../storage';

/** How many live characters one account may hold. The database enforces it; the app checks first. */
export const CHARACTER_LIMIT = 10;
/** How many imports one player may make in an hour. */
export const IMPORTS_PER_HOUR = 30;

export interface Profile {
  id: string;
  /** The player's name on Discord. */
  displayName: string;
  approved: boolean;
  isTableAdmin: boolean;
}

/** A row of the `characters` table. */
export interface RemoteCharacter {
  id: string;
  ownerId: string;
  ddbId: string;
  name: string;
  /** Null once the character is deleted. */
  rawJson: unknown;
  importedAt: string;
  updatedAt: string;
  deleted: boolean;
  /** Stamped by the account on every accepted write. Higher means later. */
  rev: number;
}

/** A row of the `character_items` table. */
export interface RemoteItem {
  characterId: string;
  kind: SyncedKind;
  key: string;
  /** Null once the item is deleted. */
  data: unknown;
  updatedAt: string;
  deleted: boolean;
  rev: number;
}

/** What a device sends. The account decides the owner (whoever creates the row) and the rev. */
export type CharacterPush = Omit<RemoteCharacter, 'rev' | 'ownerId'>;
export type ItemPush = Omit<RemoteItem, 'rev'>;

/**
 * Characters the account would not take. `limit`: the owner already has ten. `refused`: not the
 * caller's to write. A write that is merely older than what the account holds is not listed.
 */
export interface PushResult {
  rejected: { id: string; reason: 'limit' | 'refused' }[];
}

export type ImportResult =
  | { status: 'ok'; raw: unknown }
  | { status: 'private' | 'not-found' | 'upstream-error' | 'unreachable' | 'unauthorized' | 'not-approved' | 'rate-limited' };

/** What the account's own check says before an import is allowed. */
export type ImportAllowance = 'ok' | 'not-approved' | 'rate-limited';

/**
 * `offline`: the account could not be reached. `unauthorized`: nobody is signed in, or the session
 * is no longer valid. `refused`: the account understood and said no. `other`: anything else.
 */
export type RemoteErrorKind = 'offline' | 'unauthorized' | 'refused' | 'other';

export class RemoteError extends Error {
  constructor(public readonly kind: RemoteErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'RemoteError';
  }
}

/**
 * Everything the app asks of the account. `supabaseRemote` talks to Supabase; `memoryServer` keeps
 * the same rules in memory for tests and for local development. Every method except `start`,
 * `signIn` and `signOut` rejects with a RemoteError when it cannot do what was asked.
 */
export interface Remote {
  /**
   * Reads the session kept on this device, completing a sign-in that has just returned to the
   * page. Calls `onUser` with the signed-in user's ID (or null) once before it resolves, and
   * again whenever that changes.
   */
  start(onUser: (userId: string | null) => void): Promise<void>;
  /** Starts sign-in. With Supabase this leaves the page for Discord. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The signed-in user's own profile; null if it does not exist yet. */
  profile(): Promise<Profile | null>;
  /** Every profile for a table admin; only their own for anyone else. Ordered by name. */
  listProfiles(): Promise<Profile[]>;
  /** Table admins only, and never on their own profile. */
  setApproved(userId: string, approved: boolean): Promise<void>;
  pushCharacters(rows: CharacterPush[]): Promise<PushResult>;
  /** Items whose character the caller cannot see, or that is deleted, are skipped without an error. */
  pushItems(rows: ItemPush[]): Promise<void>;
  /** Visible characters with a rev above `afterRev`, lowest rev first. */
  pullCharacters(afterRev: number): Promise<RemoteCharacter[]>;
  pullItems(afterRev: number): Promise<RemoteItem[]>;
  /** Fetches a character from D&D Beyond through the import function. Never rejects. */
  importCharacter(ddbId: string): Promise<ImportResult>;
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (599 tests in 29 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The Remote interface and an in-memory account that keeps its rules" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: The database: tables, access rules and write ordering

One SQL file creates everything the account stores (spec sections 5.2 and 11). It is tested inside Vitest on PGlite, a Postgres that runs in-process, with a small stand-in for the parts of Supabase the SQL relies on (the two API roles, `auth.users` and `auth.uid()`). No Docker and no live project is needed. The tests run the contract of Task 3 against the SQL, then check what the contract cannot: that the rules hold against direct writes to the tables, not only through the functions.

**Files:**
- Create: `apps/web/src/remote/rows.ts`
- Create: `supabase/migrations/20261118000000_accounts_and_sync.sql`
- Create (test): `supabase/tests/access.test.ts`
- Create (test): `supabase/tests/database.ts`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes:
  - `remoteContract`, `ContractBackend`, `ContractClient`, `ANN`, `BEN`, `DEE`, `NEW`, `character`, `item` from `apps/web/src/remote/contract.ts` (Task 3).
  - `Profile`, `RemoteCharacter`, `RemoteItem`, `CharacterPush`, `ItemPush`, `PushResult`, `RemoteError`, `ImportAllowance` from `apps/web/src/remote/types.ts` (Task 3).
- Produces:
  - Tables `public.profiles`, `public.characters`, `public.character_items`, `public.import_log`; sequence `public.sync_rev`.
  - Database functions the app calls: `push_characters(rows jsonb) returns jsonb`, `push_items(rows jsonb) returns void`, `set_player_approved(player uuid, value boolean) returns void`, `record_import() returns text`.
  - `apps/web/src/remote/rows.ts`: `characterToRow`, `characterFromRow`, `itemToRow`, `itemFromRow`, `profileFromRow`, `rejectedFromJson`, `remoteErrorFrom({ code?, status?, message? }): RemoteError`.
  - `supabase/tests/database.ts`: `openDatabase(): Promise<PGlite>`, `resetDatabase(db)`, `queryAs(db, userId | null, sql, params?)`.

- [ ] **Step 1: Prepare**

Add PGlite as a development dependency of the workspace root:

```bash
pnpm add -D -w @electric-sql/pglite
```

Expected: `@electric-sql/pglite` appears under `devDependencies` in the root `package.json`. The plan was checked with version 0.5.16.

- [ ] **Step 2: Write the failing tests**

Create `supabase/tests/access.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANN, BEN, DEE, NEW, character, item, remoteContract, type ContractBackend, type ContractClient,
} from '../../apps/web/src/remote/contract';
import {
  characterFromRow, characterToRow, itemFromRow, itemToRow, profileFromRow, rejectedFromJson, remoteErrorFrom,
} from '../../apps/web/src/remote/rows';
import type { ImportAllowance } from '../../apps/web/src/remote/types';
import { openDatabase, queryAs, resetDatabase } from './database';

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase();
}, 60_000);

/** Makes the same calls supabaseRemote makes, straight against the database. */
function client(userId: string): ContractClient {
  const run = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      return await queryAs<T>(db, userId, sql, params);
    } catch (error) {
      throw remoteErrorFrom(error as { code?: string; message?: string });
    }
  };
  return {
    async profile() {
      const rows = await run<Record<string, unknown>>('select * from public.profiles where id = $1', [userId]);
      return rows[0] ? profileFromRow(rows[0]) : null;
    },
    async listProfiles() {
      return (await run<Record<string, unknown>>('select * from public.profiles order by display_name')).map(profileFromRow);
    },
    async setApproved(player, approved) {
      await run('select public.set_player_approved($1, $2)', [player, approved]);
    },
    async pushCharacters(rows) {
      const [result] = await run<{ rejected: unknown }>(
        'select public.push_characters($1::jsonb) as rejected', [JSON.stringify(rows.map(characterToRow))],
      );
      return { rejected: rejectedFromJson(result.rejected) };
    },
    async pushItems(rows) {
      await run('select public.push_items($1::jsonb)', [JSON.stringify(rows.map(itemToRow))]);
    },
    async pullCharacters(afterRev) {
      return (await run<Record<string, unknown>>(
        'select * from public.characters where rev > $1 order by rev', [afterRev],
      )).map(characterFromRow);
    },
    async pullItems(afterRev) {
      return (await run<Record<string, unknown>>(
        'select * from public.character_items where rev > $1 order by rev', [afterRev],
      )).map(itemFromRow);
    },
    async recordImport() {
      const [row] = await run<{ result: ImportAllowance }>('select public.record_import() as result');
      return row.result;
    },
  };
}

async function backend(): Promise<ContractBackend> {
  await resetDatabase(db);
  return {
    async addUser(id, displayName, { approved = false, admin = false } = {}) {
      // What Supabase Auth does on a first Discord sign-in, then what the owner does by hand.
      await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [
        id, JSON.stringify({ full_name: displayName }),
      ]);
      await db.query('update public.profiles set approved = $2, is_table_admin = $3 where id = $1', [id, approved, admin]);
    },
    as: client,
  };
}

remoteContract('the SQL migrations', backend);

describe('the database, beyond the shared rules', () => {
  const table = async (): Promise<ContractBackend> => {
    const b = await backend();
    await b.addUser(ANN, 'Ann', { approved: true });
    await b.addUser(BEN, 'Ben', { approved: true });
    await b.addUser(DEE, 'Dee', { approved: true, admin: true });
    await b.addUser(NEW, 'Newcomer');
    return b;
  };

  it('names a new profile from Discord, preferring the display name, and falls back to "Player"', async () => {
    await backend();
    const add = (id: string, meta: unknown) =>
      db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify(meta)]);
    await add(ANN, { full_name: 'ann#1234', name: 'ann', custom_claims: { global_name: 'Ann of the Dice' } });
    await add(BEN, { name: 'ben' });
    await add(NEW, {});
    const names = (await db.query<{ display_name: string }>('select display_name from public.profiles order by display_name')).rows;
    expect(names.map((n) => n.display_name)).toEqual(['Ann of the Dice', 'Player', 'ben']);
  });

  it('gives a request with no token nothing at all', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    for (const tableName of ['profiles', 'characters', 'character_items', 'import_log']) {
      await expect(queryAs(db, null, `select * from public.${tableName}`)).rejects.toThrow(/permission denied/);
    }
    await expect(queryAs(db, null, 'select public.record_import()')).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, null, `select public.push_characters('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
  });

  it('lets nobody write a profile directly, not even their own or as admin', async () => {
    await table();
    for (const user of [NEW, ANN, DEE]) {
      await expect(queryAs(db, user, `update public.profiles set approved = true, is_table_admin = true where id = $1`, [user]))
        .rejects.toThrow(/permission denied/);
    }
    await expect(queryAs(db, NEW, `insert into public.profiles (id, approved) values ($1, true)`, [NEW]))
      .rejects.toThrow(/permission denied/);
  });

  it('lets nobody read or write the import log directly', async () => {
    await table();
    await expect(queryAs(db, ANN, 'select * from public.import_log')).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, DEE, `delete from public.import_log`)).rejects.toThrow(/permission denied/);
  });

  it('lets nobody delete a character or an item outright', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await b.as(ANN).pushItems([item('a1', 'play', 'state')]);
    await expect(queryAs(db, ANN, `delete from public.characters where id = 'a1'`)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, DEE, `delete from public.character_items`)).rejects.toThrow(/permission denied/);
  });

  it('holds the rules against direct writes to the tables, not only through the functions', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    // Ben cannot see Ann's row, so his update changes nothing; a newcomer's insert is refused.
    await queryAs(db, BEN, `update public.characters set name = 'Stolen', updated_at = now() where id = 'a1'`);
    expect((await b.as(ANN).pullCharacters(0))[0].name).toBe('Character a1');
    await expect(queryAs(db, NEW, `
      insert into public.characters (id, owner_id, imported_at, updated_at) values ('n1', $1, now(), now())`, [NEW]))
      .rejects.toThrow(/row-level security/);
    // Nobody can create a character in someone else's name, admin included.
    await expect(queryAs(db, DEE, `
      insert into public.characters (id, owner_id, imported_at, updated_at) values ('x1', $1, now(), now())`, [ANN]))
      .rejects.toThrow(/row-level security/);
    // An owner cannot give a character away: the owner column does not change.
    await queryAs(db, ANN, `update public.characters set owner_id = $1, updated_at = '2026-02-01T00:00:00Z' where id = 'a1'`, [BEN]);
    expect((await b.as(DEE).pullCharacters(0))[0].ownerId).toBe(ANN);
  });

  it('refuses an item of an unknown kind', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await expect(b.as(ANN).pushItems([item('a1', 'turn' as never, 'state')])).rejects.toThrow();
  });

  it('counts only the last hour of imports, and clears out rows older than a day', async () => {
    const b = await table();
    await db.query(`
      insert into public.import_log (user_id, at)
      select $1, now() - interval '61 minutes' from generate_series(1, 30)`, [ANN]);
    await db.query(`insert into public.import_log (user_id, at) values ($1, now() - interval '2 days')`, [ANN]);
    expect(await b.as(ANN).recordImport()).toBe('ok');
    const rows = (await db.query<{ n: number }>('select count(*)::int as n from public.import_log where user_id = $1', [ANN])).rows;
    expect(rows[0].n).toBe(31);
  });

  it('removes a player\'s characters and items when their account is deleted', async () => {
    const b = await table();
    await b.as(ANN).pushCharacters([character('a1')]);
    await b.as(ANN).pushItems([item('a1', 'play', 'state')]);
    await db.query('delete from auth.users where id = $1', [ANN]);
    expect(await b.as(DEE).pullCharacters(0)).toEqual([]);
    expect(await b.as(DEE).pullItems(0)).toEqual([]);
  });
});
```

Create `supabase/tests/database.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * The parts of a Supabase project that the migrations rely on and PGlite does not have: the two
 * API roles, the auth schema with its users table, and auth.uid(), written as Supabase writes it.
 */
const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

/** A fresh in-process Postgres with the stand-in and every migration applied, in file-name order. */
export async function openDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  return db;
}

/** Empties every table and restarts the rev sequence, so each test starts from nothing. */
export async function resetDatabase(db: PGlite): Promise<void> {
  await db.exec(`
    truncate auth.users cascade;
    alter sequence public.sync_rev restart;
  `);
}

/**
 * Runs one statement as a signed-in user, the way Supabase's API does: as the `authenticated`
 * role, with the user's ID in the token claims. Pass null for a request with no token.
 */
export async function queryAs<T = Record<string, unknown>>(
  db: PGlite, userId: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId === null ? '' : JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await tx.exec(`set local role ${userId === null ? 'anon' : 'authenticated'}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run supabase/tests/access.test.ts
```

Expected: FAIL. The migration file does not exist, so `openDatabase` applies nothing and the first query fails with `relation "public.profiles" does not exist`. (`../../apps/web/src/remote/rows` cannot be found either, until the implementation step.)

- [ ] **Step 4: Write the implementation**

Three things in the SQL are easy to get wrong and are there on purpose:

- **The `before write` triggers return `null` for a write that is not newer.** In Postgres that skips the row without an error, which is what "the later change wins" needs. It also means an `update` can report zero rows for a row that exists, so `push_characters` tests for existence with `exists`, not with `found`.
- **`rev` is taken under `pg_advisory_xact_lock`.** The lock is held until the transaction commits, so `rev` order is commit order. Without it, a row with a lower `rev` could become visible after a device had already fetched past it, and that device would never see it.
- **`nullif(r -> 'raw_json', 'null'::jsonb)`.** A JSON `null` inside the rows is a jsonb value, not an SQL `NULL`.

Create `apps/web/src/remote/rows.ts`:

```ts
import {
  RemoteError,
  type CharacterPush, type ItemPush, type Profile, type PushResult, type RemoteCharacter, type RemoteItem,
} from './types';

// The database's column names on one side, the app's field names on the other. Used by
// supabaseRemote and by the database tests, so the tests exercise the same mapping.

type Row = Record<string, unknown>;

/** A timestamp as the database returns it (a string from the API, a Date from a driver), as ISO 8601. */
const iso = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const characterToRow = (c: CharacterPush): Row => ({
  id: c.id,
  ddb_character_id: c.ddbId,
  name: c.name,
  raw_json: c.deleted ? null : c.rawJson,
  imported_at: c.importedAt,
  updated_at: c.updatedAt,
  deleted: c.deleted,
});

export const characterFromRow = (row: Row): RemoteCharacter => ({
  id: text(row.id),
  ownerId: text(row.owner_id),
  ddbId: text(row.ddb_character_id),
  name: text(row.name),
  rawJson: row.raw_json ?? null,
  importedAt: iso(row.imported_at),
  updatedAt: iso(row.updated_at),
  deleted: row.deleted === true,
  rev: Number(row.rev),
});

export const itemToRow = (i: ItemPush): Row => ({
  character_id: i.characterId,
  kind: i.kind,
  key: i.key,
  data: i.deleted ? null : i.data,
  updated_at: i.updatedAt,
  deleted: i.deleted,
});

export const itemFromRow = (row: Row): RemoteItem => ({
  characterId: text(row.character_id),
  kind: text(row.kind) as RemoteItem['kind'],
  key: text(row.key),
  data: row.data ?? null,
  updatedAt: iso(row.updated_at),
  deleted: row.deleted === true,
  rev: Number(row.rev),
});

export const profileFromRow = (row: Row): Profile => ({
  id: text(row.id),
  displayName: text(row.display_name),
  approved: row.approved === true,
  isTableAdmin: row.is_table_admin === true,
});

/** What push_characters returns, checked: a list of { id, reason }. */
export function rejectedFromJson(value: unknown): PushResult['rejected'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Row => entry !== null && typeof entry === 'object')
    .map((entry) => ({ id: text(entry.id), reason: entry.reason === 'limit' ? 'limit' as const : 'refused' as const }));
}

/**
 * A database or API error as a RemoteError. 42501 is "insufficient privilege", which is also what
 * set_player_approved raises. PGRST301 and 401 mean the token is missing, invalid or expired.
 */
export function remoteErrorFrom(error: { code?: string; status?: number; message?: string }): RemoteError {
  if (error.code === '42501') return new RemoteError('refused', error.message);
  if (error.code === 'PGRST301' || error.code === 'PGRST302' || error.status === 401) {
    return new RemoteError('unauthorized', error.message);
  }
  return new RemoteError('other', error.message);
}
```

Create `supabase/migrations/20261118000000_accounts_and_sync.sql`:

```sql
-- Character Wizard, milestone 3: accounts, characters and everything attached to them.
-- The rules here are mirrored by apps/web/src/remote/memory.ts, and one list of test cases
-- (apps/web/src/remote/contract.ts) runs against both. Change them together.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  approved boolean not null default false,
  is_table_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.characters (
  -- "ddb-<ddb id>-<owner id>" for an imported character; a UUID for pasted JSON.
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  ddb_character_id text not null default '0',
  name text not null default '',
  raw_json jsonb,
  imported_at timestamptz not null,
  -- When the change was made, by the clock of the device that made it. Never in the future.
  updated_at timestamptz not null,
  deleted boolean not null default false,
  -- Stamped on every accepted write. Devices fetch "everything after the last rev I saw".
  rev bigint not null default 0
);
create index characters_rev on public.characters (rev);
create index characters_owner on public.characters (owner_id);

create table public.character_items (
  character_id text not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('play', 'edit', 'custom', 'order')),
  key text not null,
  data jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  rev bigint not null default 0,
  primary key (character_id, kind, key)
);
create index character_items_rev on public.character_items (rev);

create table public.import_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index import_log_user on public.import_log (user_id, at);

create sequence public.sync_rev;

-- ---------------------------------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------------------------------

-- Security definer, so that a policy on profiles can ask about profiles without recursing.
create function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)
$$;

create function public.is_table_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved and p.is_table_admin)
$$;

-- A first sign-in creates the profile: not approved, not an admin, named as on Discord.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'Player'
    )
  );
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Write ordering: the later change wins, and every accepted write gets the next rev
-- ---------------------------------------------------------------------------------------------

create function public.characters_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := least(new.updated_at, now());
  if tg_op = 'UPDATE' then
    -- Not newer than what is stored: skip the write without an error.
    if new.updated_at <= old.updated_at then
      return null;
    end if;
    new.id := old.id;
    new.owner_id := old.owner_id;
  end if;
  if new.deleted then
    new.raw_json := null;
  elsif tg_op = 'INSERT' or old.deleted then
    if (select count(*) from public.characters c where c.owner_id = new.owner_id and not c.deleted) >= 10 then
      raise exception 'character_limit' using errcode = 'P0001';
    end if;
  end if;
  -- Held until commit, so rev order is commit order and no fetch can skip a row.
  perform pg_advisory_xact_lock(4242);
  new.rev := nextval('public.sync_rev');
  return new;
end
$$;

create trigger characters_before_write before insert or update on public.characters
  for each row execute function public.characters_before_write();

-- A deleted character loses its items.
create function public.characters_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted and not old.deleted then
    delete from public.character_items i where i.character_id = new.id;
  end if;
  return null;
end
$$;

create trigger characters_after_delete after update on public.characters
  for each row execute function public.characters_after_delete();

create function public.items_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := least(new.updated_at, now());
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  if new.deleted then
    new.data := null;
  end if;
  perform pg_advisory_xact_lock(4242);
  new.rev := nextval('public.sync_rev');
  return new;
end
$$;

create trigger items_before_write before insert or update on public.character_items
  for each row execute function public.items_before_write();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.character_items enable row level security;
alter table public.import_log enable row level security;

-- Nobody writes profiles directly: the trigger creates them and set_player_approved changes them.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_table_admin());

create policy characters_select on public.characters for select to authenticated
  using (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()));
create policy characters_insert on public.characters for insert to authenticated
  with check (public.is_approved() and owner_id = (select auth.uid()));
create policy characters_update on public.characters for update to authenticated
  using (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()))
  with check (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()));

-- The inner query is itself filtered by the policies on characters, so "exists" means
-- "exists, and the caller may see it".
create policy items_select on public.character_items for select to authenticated
  using (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));
create policy items_insert on public.character_items for insert to authenticated
  with check (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));
create policy items_update on public.character_items for update to authenticated
  using (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted))
  with check (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));

-- import_log has no policies: only record_import touches it.

-- ---------------------------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------------------------

-- Each row is taken or refused on its own, so one refused character does not hold up the rest.
-- Returns [{ "id": ..., "reason": "limit" | "refused" }] for the rows it would not take.
create function public.push_characters(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_id text;
  rejected jsonb := '[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    v_id := r ->> 'id';
    begin
      if exists (select 1 from public.characters c where c.id = v_id) then
        update public.characters set
          ddb_character_id = r ->> 'ddb_character_id',
          name = r ->> 'name',
          raw_json = nullif(r -> 'raw_json', 'null'::jsonb),
          imported_at = (r ->> 'imported_at')::timestamptz,
          updated_at = (r ->> 'updated_at')::timestamptz,
          deleted = coalesce((r ->> 'deleted')::boolean, false)
        where id = v_id;
      else
        insert into public.characters (id, owner_id, ddb_character_id, name, raw_json, imported_at, updated_at, deleted)
        values (
          v_id, auth.uid(), r ->> 'ddb_character_id', r ->> 'name', nullif(r -> 'raw_json', 'null'::jsonb),
          (r ->> 'imported_at')::timestamptz, (r ->> 'updated_at')::timestamptz,
          coalesce((r ->> 'deleted')::boolean, false)
        );
      end if;
    exception when others then
      rejected := rejected || jsonb_build_object(
        'id', v_id, 'reason', case when sqlerrm = 'character_limit' then 'limit' else 'refused' end);
    end;
  end loop;
  return rejected;
end
$$;

-- An item whose character the caller cannot see, or that is deleted, is skipped without an error.
create function public.push_items(rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    if not public.is_approved() or not exists (
      select 1 from public.characters c where c.id = r ->> 'character_id' and not c.deleted
    ) then
      continue;
    end if;
    insert into public.character_items (character_id, kind, key, data, updated_at, deleted)
    values (
      r ->> 'character_id', r ->> 'kind', r ->> 'key', nullif(r -> 'data', 'null'::jsonb),
      (r ->> 'updated_at')::timestamptz, coalesce((r ->> 'deleted')::boolean, false)
    )
    on conflict (character_id, kind, key) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted;
  end loop;
end
$$;

create function public.set_player_approved(player uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_table_admin() or player = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set approved = value where id = player;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end
$$;

-- Called by the import function with the caller's own token, before it fetches anything.
create function public.record_import() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_recent integer;
begin
  if v_user is null or not public.is_approved() then
    return 'not-approved';
  end if;
  delete from public.import_log where user_id = v_user and at < now() - interval '1 day';
  select count(*) into v_recent from public.import_log where user_id = v_user and at > now() - interval '1 hour';
  if v_recent >= 30 then
    return 'rate-limited';
  end if;
  insert into public.import_log (user_id) values (v_user);
  return 'ok';
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants. Stated in full, so the result does not depend on the project's default privileges.
-- ---------------------------------------------------------------------------------------------

revoke all on public.profiles, public.characters, public.character_items, public.import_log from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.characters, public.character_items to authenticated;

revoke execute on function
  public.is_approved(), public.is_table_admin(), public.push_characters(jsonb), public.push_items(jsonb),
  public.set_player_approved(uuid, boolean), public.record_import(),
  public.handle_new_user(), public.characters_before_write(), public.characters_after_delete(),
  public.items_before_write()
from public, anon;
grant execute on function
  public.is_approved(), public.is_table_admin(), public.push_characters(jsonb), public.push_items(jsonb),
  public.set_player_approved(uuid, boolean), public.record_import()
to authenticated;
```

Replace the whole of `tsconfig.json` with:

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
    "supabase/tests",
    "vitest.config.ts"
  ]
}
```

Replace the whole of `vitest.config.ts` with:

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
            'supabase/tests/**/*.test.ts',
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

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (635 tests in 30 files) and the type check prints no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "The database: tables, access rules, write ordering and the calls the app makes" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: The sync engine and its scheduler

The engine moves records between a device's storage and the account (spec section 12). It is plain async functions over `AppStorage` and `Remote`, so the tests run two in-memory devices against one in-memory account. The scheduler decides when to sync and nothing else.

**Files:**
- Create (test): `apps/web/src/sync/engine.test.ts`
- Create: `apps/web/src/sync/engine.ts`
- Create (test): `apps/web/src/sync/scheduler.test.ts`
- Create: `apps/web/src/sync/scheduler.ts`

**Interfaces:**
- Consumes:
  - `AppStorage`, `StoredCharacter`, `StoredItem`, `SYNCED_KINDS`, `SyncedKind`, `memoryStorage` from `apps/web/src/storage` (Task 2).
  - `Remote`, `PushResult`, `RemoteCharacter`, `RemoteItem`, `CHARACTER_LIMIT` from `apps/web/src/remote/types.ts`, and `memoryServer` from `apps/web/src/remote/memory.ts` (Task 3).
- Produces:
  - `apps/web/src/sync/engine.ts`: `characterId(ddbId: string, ownerId: string): string`, `nextStamp(previous?: string, now?: number): string`, `pull(deps): Promise<Set<string>>`, `push(deps): Promise<PushResult['rejected']>`, `syncOnce(deps): Promise<SyncResult>`, `claimLocalCharacters(storage, userId): Promise<void>`, `resetCursors(storage): Promise<void>`, `hasUnsynced(storage): Promise<boolean>`, with `SyncDeps = { storage: AppStorage; remote: Remote }` and `SyncResult = { changed: Set<string>; rejected: PushResult['rejected'] }`.
  - `apps/web/src/sync/scheduler.ts`: `createScheduler(run: () => Promise<void>, options?: { debounceMs?: number; intervalMs?: number }): Scheduler` with `changed()`, `now(): Promise<void>`, `start()`, `stop()`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/sync/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { memoryServer, type MemoryServer } from '../remote/memory';
import { CHARACTER_LIMIT } from '../remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter, type StoredItem } from '../storage';
import { characterId, claimLocalCharacters, hasUnsynced, nextStamp, pull, push, resetCursors, syncOnce } from './engine';

const ANN = 'user-ann';
const BEN = 'user-ben';
const DEE = 'user-dee';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';
const T3 = '2026-01-03T10:00:00.000Z';

const character = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: ANN, ddbId: '42', name: `Character ${id}`, rawJson: { data: { name: id } },
  importedAt: T1, updatedAt: T1, deleted: false, dirty: true, ...over,
});

const item = (characterId: string, kind: StoredItem['kind'], key: string, over: Partial<StoredItem> = {}): StoredItem => ({
  characterId, kind, key, data: { value: 1 }, updatedAt: T1, deleted: false, dirty: true, ...over,
});

function table(): MemoryServer {
  const server = memoryServer();
  server.addUser(ANN, 'Ann', { approved: true });
  server.addUser(BEN, 'Ben', { approved: true });
  server.addUser(DEE, 'Dee', { approved: true, admin: true });
  return server;
}

/** A device: its own storage, signed in to the shared server. */
const device = (server: MemoryServer, userId: string, storage: AppStorage = memoryStorage()) =>
  ({ storage, remote: server.remote({ userId }) });

describe('characterId', () => {
  it('is the same wherever the same account imports the same character', () => {
    expect(characterId('42', ANN)).toBe('ddb-42-user-ann');
    expect(characterId('42', ANN)).not.toBe(characterId('42', BEN));
  });
});

describe('nextStamp', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  it('is the current time when that is later than the previous stamp', () => {
    expect(nextStamp(T1, now)).toBe('2026-11-18T12:00:00.000Z');
    expect(nextStamp(undefined, now)).toBe('2026-11-18T12:00:00.000Z');
  });

  it('is one millisecond after the previous stamp when the clock has not moved past it', () => {
    expect(nextStamp('2026-11-18T12:00:00.000Z', now)).toBe('2026-11-18T12:00:00.001Z');
    expect(nextStamp('2026-11-18T13:00:00.000Z', now)).toBe('2026-11-18T13:00:00.001Z');
  });

  it('ignores a previous stamp that is not a date', () => {
    expect(nextStamp('nonsense', now)).toBe('2026-11-18T12:00:00.000Z');
  });
});

describe('sending', () => {
  it('sends dirty characters and items, and marks them clean', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'play', 'state'));
    expect(await hasUnsynced(a.storage)).toBe(true);
    expect(await push(a)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(false);
    expect((await a.remote.pullCharacters(0)).map((c) => c.id)).toEqual(['c1']);
    expect((await a.remote.pullItems(0)).map((i) => i.kind)).toEqual(['play']);
  });

  it('never sends the turn, and does not count it as unsynced', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'turn', 'state', { dirty: true }));
    await push(a);
    expect(await a.remote.pullItems(0)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(false);
  });

  it('does not send a character that has no owner yet', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1', { ownerId: null }));
    await push(a);
    expect(await a.remote.pullCharacters(0)).toEqual([]);
    expect(await hasUnsynced(a.storage)).toBe(true);
  });

  it('removes a deleted character from the device once the account knows', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await push(a);
    await a.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await push(a);
    expect(await a.storage.listCharacters()).toEqual([]);
    expect((await a.remote.pullCharacters(0))[0]).toMatchObject({ id: 'c1', deleted: true });
  });

  it('removes a deleted item from the device once the account knows', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    await a.storage.putItem(item('c1', 'custom', 'own:1'));
    await push(a);
    await a.storage.putItem(item('c1', 'custom', 'own:1', { deleted: true, data: null, updatedAt: T2 }));
    await push(a);
    expect(await a.storage.listItems('c1')).toEqual([]);
    expect((await a.remote.pullItems(0))[0]).toMatchObject({ key: 'own:1', deleted: true });
  });

  it('keeps a character dirty when the account is full, holds its items back, and reports it', async () => {
    const server = table();
    const a = device(server, ANN);
    for (let i = 0; i < CHARACTER_LIMIT; i += 1) await a.storage.putCharacter(character(`c${i}`));
    await push(a);
    await a.storage.putCharacter(character('extra'));
    await a.storage.putItem(item('extra', 'play', 'state'));
    expect(await push(a)).toEqual([{ id: 'extra', reason: 'limit' }]);
    expect((await a.storage.listCharacters()).find((c) => c.id === 'extra')?.dirty).toBe(true);
    expect((await a.storage.listItems('extra'))[0].dirty).toBe(true);
  });

  it('gives up on a character the account refuses, so it is not sent for ever', async () => {
    const server = table();
    const a = device(server, ANN);
    const b = device(server, BEN);
    await a.storage.putCharacter(character('c1'));
    await push(a);
    await b.storage.putCharacter(character('c1', { ownerId: BEN, name: 'Not mine', updatedAt: T2 }));
    expect(await push(b)).toEqual([{ id: 'c1', reason: 'refused' }]);
    expect(await hasUnsynced(b.storage)).toBe(false);
  });

  it('leaves a record dirty if it changed again while the request was in flight', async () => {
    const server = table();
    const storage = memoryStorage();
    const inner = server.remote({ userId: ANN });
    const remote = {
      ...inner,
      async pushItems(rows: Parameters<typeof inner.pushItems>[0]) {
        await inner.pushItems(rows);
        await storage.putItem(item('c1', 'play', 'state', { data: { value: 2 }, updatedAt: T2 }));
      },
    };
    await storage.putCharacter(character('c1'));
    await storage.putItem(item('c1', 'play', 'state'));
    await push({ storage, remote });
    expect((await storage.listItems('c1'))[0]).toMatchObject({ data: { value: 2 }, dirty: true });
  });

  it('rejects when the account cannot be reached, and keeps everything dirty', async () => {
    const server = table();
    const a = device(server, ANN);
    await a.storage.putCharacter(character('c1'));
    server.offline = true;
    await expect(push(a)).rejects.toMatchObject({ kind: 'offline' });
    expect(await hasUnsynced(a.storage)).toBe(true);
  });
});

describe('fetching', () => {
  it('brings another device\'s characters and items to this one, clean', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null } }));
    await push(phone);
    expect(await pull(tablet)).toEqual(new Set(['c1']));
    expect(await tablet.storage.listCharacters()).toEqual([character('c1', { dirty: false })]);
    expect(await tablet.storage.listItems('c1')).toEqual([
      item('c1', 'play', 'state', { data: { spent: { pact: 1 }, concentrationKey: null }, dirty: false }),
    ]);
  });

  it('reports nothing changed when there is nothing new', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await push(phone);
    await pull(tablet);
    expect(await pull(tablet)).toEqual(new Set());
    // A device fetches its own writes back once; they are identical, so nothing has changed.
    expect(await pull(phone)).toEqual(new Set());
  });

  it('asks only for what is new since the last fetch', async () => {
    const server = table();
    const phone = device(server, ANN);
    const calls: number[] = [];
    const inner = server.remote({ userId: ANN });
    const tablet = { storage: memoryStorage(), remote: { ...inner, pullCharacters: (after: number) => { calls.push(after); return inner.pullCharacters(after); } } };
    await phone.storage.putCharacter(character('c1'));
    await push(phone);
    await pull(tablet);
    await pull(tablet);
    expect(calls[0]).toBe(0);
    expect(calls[1]).toBeGreaterThan(0);
    await resetCursors(tablet.storage);
    await pull(tablet);
    expect(calls[2]).toBe(0);
  });

  it('removes a character deleted on another device, with its items', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'play', 'state'));
    await push(phone);
    await pull(tablet);
    await tablet.storage.putItem(item('c1', 'turn', 'state', { dirty: false }));
    await phone.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await push(phone);
    expect(await pull(tablet)).toEqual(new Set(['c1']));
    expect(await tablet.storage.listCharacters()).toEqual([]);
    expect(await tablet.storage.listItems()).toEqual([]);
  });

  it('removes an item deleted on another device', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'custom', 'own:1'));
    await push(phone);
    await pull(tablet);
    await phone.storage.putItem(item('c1', 'custom', 'own:1', { deleted: true, data: null, updatedAt: T2 }));
    await push(phone);
    await pull(tablet);
    expect(await tablet.storage.listItems('c1')).toEqual([]);
  });

  it('shows the table admin every character and a player only their own', async () => {
    const server = table();
    const ann = device(server, ANN);
    const ben = device(server, BEN);
    const dee = device(server, DEE);
    await ann.storage.putCharacter(character('a1'));
    await ben.storage.putCharacter(character('b1', { ownerId: BEN }));
    await push(ann);
    await push(ben);
    await pull(ann);
    await pull(dee);
    expect((await ann.storage.listCharacters()).map((c) => c.id)).toEqual(['a1']);
    expect((await dee.storage.listCharacters()).map((c) => [c.id, c.ownerId]).sort()).toEqual([['a1', ANN], ['b1', BEN]]);
  });
});

describe('conflicts', () => {
  it('keeps the later change when two devices change the same item', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T2 }));
    await tablet.storage.putItem(item('c1', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T3 }));
    await syncOnce(phone);
    await syncOnce(tablet);
    await syncOnce(phone);
    expect((await phone.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: false });
    expect((await tablet.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: false });
  });

  it('keeps both changes when they are to different items', async () => {
    const server = table();
    const player = device(server, ANN);
    const dm = device(server, DEE);
    await player.storage.putCharacter(character('c1'));
    await syncOnce(player);
    await syncOnce(dm);
    await player.storage.putItem(item('c1', 'edit', 'spell:1', { data: { hidden: true }, updatedAt: T2 }));
    await dm.storage.putItem(item('c1', 'edit', 'spell:2', { data: { tags: ['damage'] }, updatedAt: T2 }));
    await syncOnce(player);
    await syncOnce(dm);
    await syncOnce(player);
    const keys = async (d: typeof player) => (await d.storage.listItems('c1')).map((i) => i.key).sort();
    expect(await keys(player)).toEqual(['spell:1', 'spell:2']);
    expect(await keys(dm)).toEqual(['spell:1', 'spell:2']);
  });

  it('keeps a dirty local record that is newer than the fetched one, and sends it', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await phone.storage.putItem(item('c1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T2 }));
    await syncOnce(phone);
    await tablet.storage.putItem(item('c1', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T3 }));
    expect(await pull(tablet)).toEqual(new Set());
    expect((await tablet.storage.listItems('c1'))[0]).toMatchObject({ data: { from: 'tablet' }, dirty: true });
    await push(tablet);
    await syncOnce(phone);
    expect((await phone.storage.listItems('c1'))[0].data).toEqual({ from: 'tablet' });
  });

  it('lets a re-import after a delete elsewhere bring the character back, items and all', async () => {
    const server = table();
    const phone = device(server, ANN);
    const tablet = device(server, ANN);
    await phone.storage.putCharacter(character('c1'));
    await phone.storage.putItem(item('c1', 'edit', 'spell:1'));
    await syncOnce(phone);
    await syncOnce(tablet);
    await tablet.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
    await syncOnce(tablet);
    await phone.storage.putCharacter(character('c1', { updatedAt: T3, importedAt: T3 }));
    await syncOnce(phone);
    await syncOnce(phone);
    expect((await phone.remote.pullCharacters(0))[0]).toMatchObject({ id: 'c1', deleted: false });
    expect((await phone.remote.pullItems(0)).map((i) => i.key)).toEqual(['spell:1']);
  });
});

describe('first sign-in on a device', () => {
  const ownerless = (id: string, ddbId: string, over: Partial<StoredCharacter> = {}): StoredCharacter =>
    character(id, { ownerId: null, ddbId, ...over });

  it('gives ownerless characters to the user, under the ID an import by that user would have', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(ownerless('local-uuid', '42'));
    await storage.putItem(item('local-uuid', 'play', 'state'));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([
      { ...ownerless('local-uuid', '42'), id: 'ddb-42-user-ann', ownerId: ANN, dirty: true },
    ]);
    expect((await storage.listItems('ddb-42-user-ann')).map((i) => i.kind)).toEqual(['play']);
    expect(await storage.listItems('local-uuid')).toEqual([]);
  });

  it('keeps the ID of a pasted character that has no D&D Beyond ID', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(ownerless('local-uuid', '0'));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([character('local-uuid', { ownerId: ANN, ddbId: '0', dirty: true })]);
  });

  it('leaves characters that already have an owner alone', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(character('ddb-42-user-ann', { dirty: false }));
    await claimLocalCharacters(storage, ANN);
    expect(await storage.listCharacters()).toEqual([character('ddb-42-user-ann', { dirty: false })]);
  });

  it('uploads them, and where the account already has the character keeps the newer import and the later play state', async () => {
    const server = table();
    const tablet = device(server, ANN);
    await tablet.storage.putCharacter(character('ddb-42-user-ann', { importedAt: T2, updatedAt: T2, name: 'Newer import' }));
    await tablet.storage.putItem(item('ddb-42-user-ann', 'play', 'state', { data: { from: 'tablet' }, updatedAt: T1 }));
    await tablet.storage.putCharacter(character('ddb-7-user-ann', { ddbId: '7' }));
    await syncOnce(tablet);

    const phone = device(server, ANN);
    await phone.storage.putCharacter(ownerless('local-1', '42', { name: 'Older import' }));
    await phone.storage.putItem(item('local-1', 'play', 'state', { data: { from: 'phone' }, updatedAt: T3 }));
    await phone.storage.putCharacter(ownerless('local-2', '99', { name: 'Only on the phone' }));
    await claimLocalCharacters(phone.storage, ANN);
    await syncOnce(phone);
    await syncOnce(tablet);

    for (const d of [phone, tablet]) {
      const names = new Map((await d.storage.listCharacters()).map((c) => [c.id, c.name]));
      expect(names.get('ddb-42-user-ann')).toBe('Newer import');
      expect(names.get('ddb-99-user-ann')).toBe('Only on the phone');
      expect(names.get('ddb-7-user-ann')).toBe('Character ddb-7-user-ann');
      expect((await d.storage.listItems('ddb-42-user-ann'))[0].data).toEqual({ from: 'phone' });
      expect(await hasUnsynced(d.storage)).toBe(false);
    }
  });
});
```

Create `apps/web/src/sync/scheduler.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler, type Scheduler } from './scheduler';

let scheduler: Scheduler | null = null;

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  scheduler?.stop();
  scheduler = null;
  vi.useRealTimers();
});

describe('createScheduler', () => {
  it('syncs once, two seconds after the last of several changes', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.changed();
    await vi.advanceTimersByTimeAsync(1500);
    scheduler.changed();
    await vi.advanceTimersByTimeAsync(1999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('syncs every 30 seconds while the app is on screen, and not while it is hidden', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('syncs when the app comes back on screen and when a connection returns', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never runs two syncs at once: a request made during a sync runs one more after it', async () => {
    let release: () => void = () => undefined;
    let active = 0;
    let most = 0;
    const run = vi.fn(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise<void>((resolve) => { release = resolve; });
      active -= 1;
    });
    scheduler = createScheduler(run);
    const first = scheduler.now();
    void scheduler.now();
    void scheduler.now();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it('keeps going after a sync fails', async () => {
    const run = vi.fn(async () => { throw new Error('offline'); });
    scheduler = createScheduler(run);
    await scheduler.now();
    await scheduler.now();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does nothing after stop', async () => {
    const run = vi.fn(async () => undefined);
    scheduler = createScheduler(run);
    scheduler.start();
    scheduler.changed();
    scheduler.stop();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/sync/engine.test.ts apps/web/src/sync/scheduler.test.ts
```

Expected: FAIL. `./engine` and `./scheduler` cannot be found.

- [ ] **Step 3: Write the implementation**

Three rules the tests pin down:

- A fetched record replaces the device's copy **unless the device's copy is dirty and newer**.
- A record stops being dirty once the account has answered, **unless it changed again while the request was in flight** (its `updatedAt` is no longer the one that was sent).
- **Items wait for their character.** The account skips an item whose character it does not have, so an item is sent only once its character is no longer dirty.

A device fetches its own writes back once, because the account gave them a new `rev`. They are identical to what it holds, so nothing is reported as changed.

Create `apps/web/src/sync/engine.ts`:

```ts
import type { PushResult, Remote, RemoteCharacter, RemoteItem } from '../remote/types';
import { SYNCED_KINDS, type AppStorage, type StoredCharacter, type StoredItem, type SyncedKind } from '../storage';

const CURSOR_CHARACTERS = 'cursor:characters';
const CURSOR_ITEMS = 'cursor:items';

export interface SyncDeps {
  storage: AppStorage;
  remote: Remote;
}

export interface SyncResult {
  /** IDs of characters whose record or items on this device were changed by what was fetched. */
  changed: Set<string>;
  /** Characters the account would not take. */
  rejected: PushResult['rejected'];
}

/** The ID of an imported character: the same on every device that imports it into the same account. */
export const characterId = (ddbId: string, ownerId: string): string => `ddb-${ddbId}-${ownerId}`;

/**
 * The time to record for a change made now. Always later than `previous`, even if this device's
 * clock has gone backwards, so the account never mistakes a newer change for an older one.
 */
export function nextStamp(previous?: string, now: number = Date.now()): string {
  const before = previous === undefined ? Number.NaN : Date.parse(previous);
  return new Date(Number.isFinite(before) ? Math.max(now, before + 1) : now).toISOString();
}

const isSynced = (kind: string): kind is SyncedKind => (SYNCED_KINDS as readonly string[]).includes(kind);
const later = (a: string, b: string): boolean => Date.parse(a) > Date.parse(b);
const cursor = async (storage: AppStorage, name: string): Promise<number> => {
  const value = await storage.getMeta(name);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

/** Forgets how far fetching has got, so the next fetch asks for everything the user may see. */
export async function resetCursors(storage: AppStorage): Promise<void> {
  await storage.setMeta(CURSOR_CHARACTERS, 0);
  await storage.setMeta(CURSOR_ITEMS, 0);
}

/**
 * First sign-in on a device: characters imported before accounts existed have no owner. Each is
 * given the signed-in user and the ID an import by that user would have, and is marked dirty so
 * that it uploads. Its items move with it.
 */
export async function claimLocalCharacters(storage: AppStorage, userId: string): Promise<void> {
  const all = await storage.listCharacters();
  for (const character of all.filter((c) => c.ownerId === null)) {
    const id = character.ddbId === '0' ? character.id : characterId(character.ddbId, userId);
    if (id !== character.id && all.some((c) => c.id === id)) {
      // The account's copy of this character is already here: the ownerless one gives way.
      await storage.removeCharacter(character.id);
      continue;
    }
    await storage.rekeyCharacter(character.id, { ...character, id, ownerId: userId, dirty: true });
  }
}

function fromRemote(row: RemoteCharacter): StoredCharacter {
  const { rev: _rev, ...rest } = row;
  return { ...rest, dirty: false };
}

/**
 * Fetches everything changed in the account since the last fetch and merges it into this device.
 * A fetched record replaces the device's copy unless the device's copy is dirty and newer.
 */
export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>> {
  const changed = new Set<string>();

  const characterCursor = await cursor(storage, CURSOR_CHARACTERS);
  const characters = await remote.pullCharacters(characterCursor);
  const local = new Map((await storage.listCharacters()).map((c) => [c.id, c]));
  for (const row of characters) {
    const mine = local.get(row.id);
    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) {
      if (row.deleted && !mine.deleted) {
        // The account deleted it and threw away its items; this device has since brought it back.
        for (const item of await storage.listItems(row.id)) {
          if (isSynced(item.kind)) await storage.putItem({ ...item, dirty: true });
        }
      }
      continue;
    }
    if (row.deleted) {
      if (mine) {
        await storage.removeCharacter(row.id);
        local.delete(row.id);
        changed.add(row.id);
      }
      continue;
    }
    if (!mine || mine.updatedAt !== row.updatedAt || mine.deleted) changed.add(row.id);
    const stored = fromRemote(row);
    await storage.putCharacter(stored);
    local.set(row.id, stored);
  }
  if (characters.length > 0) await storage.setMeta(CURSOR_CHARACTERS, characters[characters.length - 1].rev);

  const itemCursor = await cursor(storage, CURSOR_ITEMS);
  const items = await remote.pullItems(itemCursor);
  const localItems = new Map<string, StoredItem>();
  const idOf = (i: { characterId: string; kind: string; key: string }): string => JSON.stringify([i.characterId, i.kind, i.key]);
  for (const item of await storage.listItems()) localItems.set(idOf(item), item);
  for (const row of items) {
    const character = local.get(row.characterId);
    // An item for a character this device does not hold (deleted here, or not fetched) is left out.
    if (!character || character.deleted) continue;
    const mine = localItems.get(idOf(row));
    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) continue;
    if (row.deleted) {
      if (mine) {
        await storage.removeItem(row.characterId, row.kind, row.key);
        changed.add(row.characterId);
      }
      continue;
    }
    if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
    const { rev: _rev, ...rest } = row satisfies RemoteItem;
    await storage.putItem({ ...rest, dirty: false });
  }
  if (items.length > 0) await storage.setMeta(CURSOR_ITEMS, items[items.length - 1].rev);

  return changed;
}

/**
 * Sends every dirty record to the account. A record stops being dirty once the account has
 * answered, whether it took the change or already held a newer one, unless it changed again
 * on this device while the request was in flight.
 */
export async function push({ storage, remote }: SyncDeps): Promise<PushResult['rejected']> {
  const rejected: PushResult['rejected'] = [];

  // One character per request: each carries the whole imported sheet.
  for (const sent of (await storage.listCharacters()).filter((c) => c.dirty && c.ownerId !== null)) {
    const { ownerId: _ownerId, dirty: _dirty, ...row } = sent;
    const result = await remote.pushCharacters([row]);
    rejected.push(...result.rejected);
    // Over the limit: it stays dirty and is offered again once there is room.
    if (result.rejected.some((r) => r.reason === 'limit')) continue;
    const now = (await storage.listCharacters()).find((c) => c.id === sent.id);
    if (!now || now.updatedAt !== sent.updatedAt) continue;
    if (now.deleted) await storage.removeCharacter(now.id);
    else await storage.putCharacter({ ...now, dirty: false });
  }

  // Items wait for their character: the account skips an item whose character it does not have.
  const settled = new Set((await storage.listCharacters()).filter((c) => !c.dirty && !c.deleted).map((c) => c.id));
  const dirtyItems = (await storage.listItems()).filter(
    (i) => i.dirty && isSynced(i.kind) && settled.has(i.characterId),
  );
  if (dirtyItems.length > 0) {
    await remote.pushItems(dirtyItems.map(({ dirty: _dirty, ...row }) => ({ ...row, kind: row.kind as SyncedKind })));
    const after = new Map((await storage.listItems()).map((i) => [JSON.stringify([i.characterId, i.kind, i.key]), i]));
    for (const sent of dirtyItems) {
      const now = after.get(JSON.stringify([sent.characterId, sent.kind, sent.key]));
      if (!now || now.updatedAt !== sent.updatedAt) continue;
      if (now.deleted) await storage.removeItem(now.characterId, now.kind, now.key);
      else await storage.putItem({ ...now, dirty: false });
    }
  }
  return rejected;
}

/** One round: fetch, then send. Rejects with a RemoteError if the account cannot be reached. */
export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const changed = await pull(deps);
  const rejected = await push(deps);
  return { changed, rejected };
}

/** True while this device holds a change the account has not yet answered for. */
export async function hasUnsynced(storage: AppStorage): Promise<boolean> {
  if ((await storage.listCharacters()).some((c) => c.dirty)) return true;
  return (await storage.listItems()).some((i) => i.dirty && isSynced(i.kind));
}
```

Create `apps/web/src/sync/scheduler.ts`:

```ts
export interface SchedulerOptions {
  /** How long after a local change to wait before syncing. */
  debounceMs?: number;
  /** How often to sync while the app is on screen. */
  intervalMs?: number;
}

export interface Scheduler {
  /** A local change was made: sync soon. Several changes close together cause one sync. */
  changed(): void;
  /** Sync now. If a sync is already running, one more runs straight after it. */
  now(): Promise<void>;
  /** Start syncing on a timer, when the app comes back on screen and when a connection returns. */
  start(): void;
  stop(): void;
}

/**
 * Decides when to sync; `run` does the syncing. Never runs two syncs at once, and never lets a
 * failed sync stop the next one.
 */
export function createScheduler(run: () => Promise<void>, options: SchedulerOptions = {}): Scheduler {
  const debounceMs = options.debounceMs ?? 2000;
  const intervalMs = options.intervalMs ?? 30_000;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const now = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run().catch(() => undefined);
      } while (again);
      running = null;
    })();
    return running;
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void now();
  };
  const onOnline = (): void => {
    void now();
  };

  return {
    changed() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void now();
      }, debounceMs);
    },
    now,
    start() {
      if (interval) return;
      interval = setInterval(onVisible, intervalMs);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
    },
    stop() {
      if (debounce) clearTimeout(debounce);
      if (interval) clearInterval(interval);
      debounce = null;
      interval = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    },
  };
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (668 tests in 32 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The sync engine and its scheduler" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: The import function checks the caller and limits what it reads

From this milestone the import function serves only a signed-in, approved player within the rate limit (spec section 6). It finds that out by passing the caller's own token to the database function `record_import` (Task 4). The publishable-key check of milestone 2 goes, and so does the dependence on the platform's `verify_jwt` setting. The handler also gains size caps, follows no redirects, and says `Vary: Origin` on every answer. The client gains a timeout, stricter checks and a message for each new answer.

**Files:**
- Modify: `apps/web/dev/import-plugin.ts`
- Modify (test): `apps/web/src/import/client.test.ts`
- Modify: `apps/web/src/import/client.ts`
- Modify: `supabase/config.toml`
- Modify (test): `supabase/functions/_shared/import-handler.test.ts`
- Modify: `supabase/functions/_shared/import-handler.ts`
- Modify: `supabase/functions/import-character/index.ts`

**Interfaces:**
- Consumes:
  - `ImportResult` from `apps/web/src/remote/types.ts` (Task 3).
  - The database function `record_import()` (Task 4), reached over HTTP at `<project url>/rest/v1/rpc/record_import`.
- Produces:
  - `supabase/functions/_shared/import-handler.ts`: `handleImport(req, options)`, `ImportOptions` (`allowedOrigins`, `authorize?`, `fetchImpl?`, `timeoutMs?`), `Allowance`, `ImportStatus`, `databaseAuthorize(supabaseUrl, fetchImpl?)`, `readCapped(body, maxBytes)`, `MAX_REQUEST_BYTES`, `MAX_UPSTREAM_BYTES`, `CHARACTER_ENDPOINT`.
  - `apps/web/src/import/client.ts`: `importEndpoint(env, accessToken?): ImportEndpoint`, `fetchCharacter(id, endpoint?, timeoutMs?): Promise<ImportResult>`, `IMPORT_MESSAGES`, `LIMIT_MESSAGE`, `PRIVACY_HINT`, `IMPORT_TIMEOUT_MS`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/web/src/import/client.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_MESSAGES, fetchCharacter, importEndpoint } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LOCAL = { url: '/functions/v1/import-character', headers: { 'Content-Type': 'application/json' } };

describe('importEndpoint', () => {
  it('uses this page\'s own origin and no key in local development', () => {
    expect(importEndpoint({})).toEqual(LOCAL);
  });

  it('sends the publishable key in the apikey header', () => {
    expect(importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_KEY: 'sb_publishable_x' })).toEqual({
      url: 'https://abc.supabase.co/functions/v1/import-character',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x' },
    });
  });

  it('sends the signed-in user\'s token as a bearer token', () => {
    const { headers } = importEndpoint({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_x' }, 'user-token');
    expect(headers).toEqual({ 'Content-Type': 'application/json', apikey: 'sb_publishable_x', Authorization: 'Bearer user-token' });
  });

  it('sends no bearer token when nobody is signed in', () => {
    expect(importEndpoint({ VITE_SUPABASE_KEY: 'sb_publishable_x' }, null).headers.Authorization).toBeUndefined();
  });
});

describe('fetchCharacter', () => {
  it('posts the ID with the endpoint\'s headers and returns the raw character', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(200, { status: 'ok', raw: { data: { name: 'Vlad' } } }));
    vi.stubGlobal('fetch', fetchMock);
    const endpoint = { url: 'https://abc.supabase.co/functions/v1/import-character', headers: { apikey: 'k', Authorization: 'Bearer t' } };
    expect(await fetchCharacter('42', endpoint)).toEqual({ status: 'ok', raw: { data: { name: 'Vlad' } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint.url);
    expect(init).toMatchObject({ method: 'POST', headers: endpoint.headers, body: '{"id":"42"}' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [403, 'private'],
    [404, 'not-found'],
    [502, 'upstream-error'],
    [401, 'unauthorized'],
    [403, 'not-approved'],
    [429, 'rate-limited'],
  ] as const)('passes on the function\'s %i %s answer', async (httpStatus, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(httpStatus, { status })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status });
  });

  it('has a message for every answer that is not a character', () => {
    expect(IMPORT_MESSAGES.unauthorized).toBe('Your sign-in has expired. Sign in again, then retry.');
    expect(IMPORT_MESSAGES['not-approved']).toBe("Your DM hasn't approved your account yet.");
    expect(IMPORT_MESSAGES['rate-limited']).toBe('Too many imports. Try again in an hour.');
  });

  it('reports unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
  });

  it('gives up when the function does not answer in time', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
    })));
    expect(await fetchCharacter('42', LOCAL, 20)).toEqual({ status: 'unreachable' });
  });

  it('reports unreachable for an answer that is not the function\'s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { status: 'bad-request' })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, null)));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'unreachable' });
  });

  it.each([[undefined], [null], ['text'], [7], [[1, 2]]])('treats "ok" with raw %j as D&D Beyond misbehaving', async (raw) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { status: 'ok', raw })));
    expect(await fetchCharacter('42', LOCAL)).toEqual({ status: 'upstream-error' });
  });
});
```

Apply this change to `supabase/functions/_shared/import-handler.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,5 +1,8 @@
 import { describe, expect, it, vi } from 'vitest';
-import { CHARACTER_ENDPOINT, handleImport, type ImportOptions } from './import-handler.ts';
+import {
+  CHARACTER_ENDPOINT, MAX_REQUEST_BYTES, MAX_UPSTREAM_BYTES, databaseAuthorize, handleImport, readCapped,
+  type Allowance, type ImportOptions,
+} from './import-handler.ts';
 
 const APP = 'https://app.example';
 
@@ -33,10 +36,16 @@ describe('handleImport', () => {
     const fetchImpl = upstream(200, {});
     await handleImport(post({ id: '42' }, { cookie: 'session=abc', authorization: 'Bearer user-token' }), options({ fetchImpl }));
     const init = fetchImpl.mock.calls[0][1] ?? {};
-    expect(Object.keys(init).sort()).toEqual(['headers', 'signal']);
+    expect(Object.keys(init).sort()).toEqual(['headers', 'redirect', 'signal']);
     expect(init.headers).toEqual({ Accept: 'application/json' });
   });
 
+  it('follows no redirects', async () => {
+    const fetchImpl = upstream(200, {});
+    await handleImport(post({ id: '42' }), options({ fetchImpl }));
+    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('error');
+  });
+
   it.each([
     [403, 403, 'private'],
     [404, 404, 'not-found'],
@@ -122,62 +131,137 @@ describe('handleImport', () => {
     expect(res.headers.get('access-control-allow-origin')).toBe('*');
   });
 
-  it('requires the configured key in the apikey header', async () => {
-    const fetchImpl = upstream(200, {});
-    const keyed = options({ apiKey: 'sb_publishable_test', fetchImpl });
-    expect((await handleImport(post({ id: '42' }), keyed)).status).toBe(401);
-    expect((await handleImport(post({ id: '42' }, { apikey: 'wrong' }), keyed)).status).toBe(401);
+  it('says the answer depends on the origin even when it refuses the origin or has none', async () => {
+    const refused = await handleImport(post({ id: '42' }, { origin: 'https://other.example' }), options());
+    expect(refused.headers.get('vary')).toBe('Origin');
+    const noOrigin = new Request('https://x.example/f', { method: 'POST', body: JSON.stringify({ id: 'x' }) });
+    expect((await handleImport(noOrigin, options())).headers.get('vary')).toBe('Origin');
+  });
+
+  it('refuses a request body over the size limit without fetching', async () => {
+    const fetchImpl = upstream(200);
+    const big = JSON.stringify({ id: '42', padding: 'x'.repeat(MAX_REQUEST_BYTES) });
+    const res = await handleImport(post(big), options({ fetchImpl }));
+    expect(res.status).toBe(400);
+    expect(await res.json()).toEqual({ status: 'bad-request' });
     expect(fetchImpl).not.toHaveBeenCalled();
-    expect((await handleImport(post({ id: '42' }, { apikey: 'sb_publishable_test' }), keyed)).status).toBe(200);
   });
 
-  it('still requires the key from a request with no Origin header, which skips the origin list', async () => {
-    const noOrigin = (headers: Record<string, string> = {}) => new Request('https://x.example/functions/v1/import-character', {
-      method: 'POST',
-      headers: { 'content-type': 'application/json', ...headers },
-      body: JSON.stringify({ id: '42' }),
+  it('refuses to relay an upstream body over the size limit, whether or not its length is declared', async () => {
+    const declared = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-length': String(MAX_UPSTREAM_BYTES + 1) } }));
+    expect(await (await handleImport(post({ id: '42' }), options({ fetchImpl: declared }))).json()).toEqual({ status: 'upstream-error' });
+    const chunk = new Uint8Array(1024 * 1024).fill(32);
+    const endless = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
+      pull(controller) {
+        controller.enqueue(chunk);
+      },
+    }), { status: 200 }));
+    const res = await handleImport(post({ id: '42' }), options({ fetchImpl: endless }));
+    expect(res.status).toBe(502);
+    expect(await res.json()).toEqual({ status: 'upstream-error' });
+  });
+
+  describe('with an access check', () => {
+    const allowing = (answer: Allowance) => vi.fn(async (_req: Request) => answer);
+
+    it('fetches when the check allows it, and hands the check the request', async () => {
+      const authorize = allowing('ok');
+      const fetchImpl = upstream(200, {});
+      const req = post({ id: '42' }, { authorization: 'Bearer user-token' });
+      const res = await handleImport(req, options({ authorize, fetchImpl }));
+      expect(res.status).toBe(200);
+      expect(authorize).toHaveBeenCalledWith(req);
+    });
+
+    it.each([
+      ['unauthorized', 401],
+      ['not-approved', 403],
+      ['rate-limited', 429],
+    ] as const)('answers %s with %i and fetches nothing', async (answer, status) => {
+      const fetchImpl = upstream(200, {});
+      const res = await handleImport(post({ id: '42' }), options({ authorize: allowing(answer), fetchImpl }));
+      expect(res.status).toBe(status);
+      expect(await res.json()).toEqual({ status: answer });
+      expect(res.headers.get('access-control-allow-origin')).toBe(APP);
+      expect(fetchImpl).not.toHaveBeenCalled();
+    });
+
+    it('refuses when the check itself fails', async () => {
+      const fetchImpl = upstream(200, {});
+      const authorize = vi.fn(async () => { throw new Error('database down'); });
+      const res = await handleImport(post({ id: '42' }), options({ authorize, fetchImpl }));
+      expect(res.status).toBe(401);
+      expect(fetchImpl).not.toHaveBeenCalled();
+    });
+
+    it('checks before it reads the body, so a refused caller cannot make it parse anything', async () => {
+      const res = await handleImport(post('not json'), options({ authorize: allowing('unauthorized') }));
+      expect(res.status).toBe(401);
+    });
+
+    it('still answers a preflight, which carries no token', async () => {
+      const authorize = allowing('unauthorized');
+      const req = new Request('https://x.example/f', { method: 'OPTIONS', headers: { origin: APP } });
+      expect((await handleImport(req, options({ authorize }))).status).toBe(204);
+      expect(authorize).not.toHaveBeenCalled();
     });
-    const fetchImpl = upstream(200, {});
-    const keyed = options({ apiKey: 'sb_publishable_test', fetchImpl });
-    expect((await handleImport(noOrigin(), keyed)).status).toBe(401);
-    const wrong = await handleImport(noOrigin({ apikey: 'wrong' }), keyed);
-    expect(wrong.status).toBe(401);
-    expect(await wrong.json()).toEqual({ status: 'unauthorized' });
-    expect(fetchImpl).not.toHaveBeenCalled();
-    const right = await handleImport(noOrigin({ apikey: 'sb_publishable_test' }), keyed);
-    expect(right.status).toBe(200);
-    expect(await right.json()).toEqual({ status: 'ok', raw: {} });
-    expect(fetchImpl).toHaveBeenCalledTimes(1);
   });
+});
 
-  it('asks for no key when none is configured', async () => {
-    const res = await handleImport(post({ id: '42' }), options({ apiKey: null, fetchImpl: upstream(200) }));
-    expect(res.status).toBe(200);
+describe('readCapped', () => {
+  const stream = (...parts: string[]) => new Response(parts.join('')).body;
+
+  it('returns the text when it fits', async () => {
+    expect(await readCapped(stream('hello'), 5)).toBe('hello');
+    expect(await readCapped(null, 5)).toBe('');
   });
 
-  it.each([
-    ['undefined', undefined],
-    ['null', null],
-    ['empty', ''],
-  ])('refuses every request when a key is required but none is set (%s)', async (_label, apiKey) => {
-    const fetchImpl = upstream(200, {});
-    const res = await handleImport(post({ id: '42' }), options({ apiKey, requireKey: true, fetchImpl }));
-    expect(res.status).toBe(401);
-    expect(await res.json()).toEqual({ status: 'unauthorized' });
+  it('returns null when it does not', async () => {
+    expect(await readCapped(stream('hello!'), 5)).toBeNull();
+  });
+});
+
+describe('databaseAuthorize', () => {
+  const request = (headers: Record<string, string> = {}) => new Request('https://x.example/f', {
+    method: 'POST', headers: { authorization: 'Bearer user-token', apikey: 'sb_publishable_test', ...headers },
+  });
+  const database = (status: number, body: unknown) =>
+    vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
+
+  it('asks the database with the caller\'s own token and passes on its answer', async () => {
+    for (const answer of ['ok', 'not-approved', 'rate-limited'] as const) {
+      const fetchImpl = database(200, answer);
+      expect(await databaseAuthorize('https://abc.supabase.co/', fetchImpl)(request())).toBe(answer);
+      expect(fetchImpl.mock.calls[0][0]).toBe('https://abc.supabase.co/rest/v1/rpc/record_import');
+      expect(fetchImpl.mock.calls[0][1]).toMatchObject({
+        method: 'POST',
+        headers: { Authorization: 'Bearer user-token', apikey: 'sb_publishable_test', 'Content-Type': 'application/json' },
+        body: '{}',
+      });
+    }
+  });
+
+  it('refuses a request with no token or no key, without asking', async () => {
+    const fetchImpl = database(200, 'ok');
+    const check = databaseAuthorize('https://abc.supabase.co', fetchImpl);
+    expect(await check(new Request('https://x.example/f', { method: 'POST', headers: { apikey: 'k' } }))).toBe('unauthorized');
+    expect(await check(new Request('https://x.example/f', { method: 'POST', headers: { authorization: 'Bearer t' } }))).toBe('unauthorized');
     expect(fetchImpl).not.toHaveBeenCalled();
   });
 
-  it('accepts the matching key when a key is required', async () => {
-    const fetchImpl = upstream(200, {});
-    const keyed = options({ apiKey: 'sb_publishable_test', requireKey: true, fetchImpl });
-    const res = await handleImport(post({ id: '42' }, { apikey: 'sb_publishable_test' }), keyed);
-    expect(res.status).toBe(200);
-    expect(await res.json()).toEqual({ status: 'ok', raw: {} });
+  it.each([
+    ['the database rejects the token', database(401, { message: 'JWT expired' })],
+    ['the caller may not run the function', database(403, { message: 'permission denied' })],
+    ['the database fails', database(500, {})],
+    ['the answer is not one it knows', database(200, 'maybe')],
+    ['the database cannot be reached', vi.fn(async () => { throw new TypeError('fetch failed'); })],
+  ])('refuses when %s', async (_label, fetchImpl) => {
+    expect(await databaseAuthorize('https://abc.supabase.co', fetchImpl)(request())).toBe('unauthorized');
   });
 
-  it('still answers a preflight from a listed origin when a key is required but missing', async () => {
-    const req = new Request('https://x.example/f', { method: 'OPTIONS', headers: { origin: APP } });
-    const res = await handleImport(req, options({ requireKey: true }));
-    expect(res.status).toBe(204);
+  it.each([null, undefined, ''])('refuses every request when it has no database address (%j)', async (url) => {
+    const fetchImpl = database(200, 'ok');
+    expect(await databaseAuthorize(url, fetchImpl)(request())).toBe('unauthorized');
+    expect(fetchImpl).not.toHaveBeenCalled();
   });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/import/client.test.ts supabase/functions/_shared/import-handler.test.ts
```

Expected: FAIL. `databaseAuthorize`, `readCapped` and the two size constants are not exported, and `fetchCharacter` does not yet take an endpoint.

- [ ] **Step 3: Write the implementation**

`fetchCharacter`'s second argument changes from the environment to an endpoint (`{ url, headers }`). The Home and Import screens still call `fetchCharacter(id)` with no second argument, which keeps working until Tasks 10 and 11 move them to the store.

`redirect: 'error'` was chosen after checking that the character service answers an unknown ID directly with 403. Whether a successful fetch also avoids redirects is confirmed by the owner's first real import after deploying (Task 13). If that import fails with "D&D Beyond didn't respond as expected", remove the `redirect` line and its test.

Replace the whole of `apps/web/dev/import-plugin.ts` with:

```ts
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_REQUEST_BYTES, handleImport } from '../../../supabase/functions/_shared/import-handler.ts';

export const DEV_IMPORT_PATH = '/functions/v1/import-character';

/** The request body, read no further than one byte past the handler's own limit. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    chunks.push(buffer);
    total += buffer.byteLength;
    if (total > MAX_REQUEST_BYTES) break;
  }
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
 * so the app can import characters locally with no Supabase project. Dev server only. It has no
 * access check and answers any origin, because a phone on the same network must be able to reach it.
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
        })().catch((error: unknown) => {
          server.config.logger.error(`import endpoint failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
          res.statusCode = 500;
          res.end();
        });
      });
    },
  };
}
```

Replace the whole of `apps/web/src/import/client.ts` with:

```ts
import type { ImportResult } from '../remote/types';

export type { ImportResult } from '../remote/types';

export interface ImportEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_KEY?: string;
}

export interface ImportEndpoint {
  url: string;
  headers: Record<string, string>;
}

const FUNCTION_PATH = '/functions/v1/import-character';

/** How long to wait for the import function before giving up. */
export const IMPORT_TIMEOUT_MS = 15_000;

/**
 * Where to send the import request and with which headers. With no Supabase URL configured the
 * request goes to this page's own origin, where the dev server answers it. `accessToken` is the
 * signed-in user's token, which the deployed function requires.
 */
export function importEndpoint(env: ImportEnv, accessToken?: string | null): ImportEndpoint {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_KEY ?? '';
  if (key !== '') headers.apikey = key;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return { url: `${base}${FUNCTION_PATH}`, headers };
}

const PASSED_ON = ['private', 'not-found', 'upstream-error', 'unauthorized', 'not-approved', 'rate-limited'] as const;

/** Asks the import function for a character. Never throws: every failure is a status. */
export async function fetchCharacter(
  id: string,
  endpoint: ImportEndpoint = importEndpoint(import.meta.env),
  timeoutMs: number = IMPORT_TIMEOUT_MS,
): Promise<ImportResult> {
  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(timeoutMs),
    });
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
  const answer = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (answer.status === 'ok') {
    const raw = answer.raw;
    // "ok" with nothing usable in it is the service misbehaving, not a character.
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? { status: 'ok', raw } : { status: 'upstream-error' };
  }
  const passed = PASSED_ON.find((status) => status === answer.status);
  return passed ? { status: passed } : { status: 'unreachable' };
}

export const IMPORT_MESSAGES: Record<Exclude<ImportResult['status'], 'ok'>, string> = {
  private: 'This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.',
  'not-found': 'No character with that ID.',
  'upstream-error': "D&D Beyond didn't respond as expected.",
  unreachable: "Couldn't reach the import service.",
  unauthorized: 'Your sign-in has expired. Sign in again, then retry.',
  'not-approved': "Your DM hasn't approved your account yet.",
  'rate-limited': 'Too many imports. Try again in an hour.',
};

/** Shown instead of importing when the account is full. */
export const LIMIT_MESSAGE = 'You have ten characters. Delete one to add another.';

/** Where the privacy setting is, shown under the Private message. */
export const PRIVACY_HINT =
  'On D&D Beyond, open the character, choose Edit, and on the Home step set Character Privacy to Public.';
```

Replace the whole of `supabase/config.toml` with:

```toml
project_id = "character-wizard"

[functions.import-character]
# The function checks the caller itself, through the database (see _shared/import-handler.ts).
verify_jwt = false
```

Replace the whole of `supabase/functions/_shared/import-handler.ts` with:

```ts
// The import logic, written against web-standard Request and Response only. It runs unchanged in
// the Supabase Edge Function (Deno), in the Vite dev server (Node) and in Vitest. No imports.

export const CHARACTER_ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

/** A request body is `{"id":"<digits>"}`: anything near this size is not one. */
export const MAX_REQUEST_BYTES = 1024;
/** A character is about 250 KB. Nothing larger than this is relayed. */
export const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

export type ImportStatus =
  | 'ok' | 'private' | 'not-found' | 'upstream-error' | 'bad-request'
  | 'unauthorized' | 'not-approved' | 'rate-limited';

/** Whether this caller may import: signed in, approved, and within the rate limit. */
export type Allowance = 'ok' | 'unauthorized' | 'not-approved' | 'rate-limited';

export interface ImportOptions {
  /** Origins that may call from a browser, compared exactly. '*' allows any origin. */
  allowedOrigins: string[];
  /**
   * Decides whether the caller may import. The deployed function always sets it. The dev server
   * leaves it out, which allows everyone.
   */
  authorize?: (req: Request) => Promise<Allowance>;
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ID_PATTERN = /^\d{1,12}$/;

const REFUSAL: Record<Exclude<Allowance, 'ok'>, number> = { unauthorized: 401, 'not-approved': 403, 'rate-limited': 429 };

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // Every answer depends on the Origin header, so every answer says so to caches.
  if (origin === null) return { Vary: 'Origin' };
  const any = allowed.includes('*');
  if (!any && !allowed.includes(origin)) return { Vary: 'Origin' };
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

/** The body as text, or null if it is longer than `maxBytes`. Stops reading at the limit. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

const tooLong = (headers: Headers, maxBytes: number): boolean => {
  const length = Number(headers.get('content-length') ?? '0');
  return Number.isFinite(length) && length > maxBytes;
};

async function requestedId(req: Request): Promise<string | null> {
  try {
    if (tooLong(req.headers, MAX_REQUEST_BYTES)) return null;
    const text = await readCapped(req.body, MAX_REQUEST_BYTES);
    if (text === null) return null;
    const body: unknown = JSON.parse(text);
    const id = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).id : null;
    return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The deployed function's access check. It passes the caller's own token to the database function
 * `record_import`, which answers "ok", "not-approved" or "rate-limited" and records the import.
 * The database rejects a missing, invalid or expired token itself. Anything unexpected, including
 * a database that cannot be reached or no address to reach it at, refuses the request.
 */
export function databaseAuthorize(
  supabaseUrl: string | null | undefined, fetchImpl: typeof fetch = fetch,
): (req: Request) => Promise<Allowance> {
  const base = (supabaseUrl ?? '').replace(/\/+$/, '');
  return async (req) => {
    const authorization = req.headers.get('authorization');
    const apikey = req.headers.get('apikey');
    if (base === '' || !authorization || !apikey) return 'unauthorized';
    try {
      const res = await fetchImpl(`${base}/rest/v1/rpc/record_import`, {
        method: 'POST',
        headers: { Authorization: authorization, apikey, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return 'unauthorized';
      const answer: unknown = await res.json();
      return answer === 'ok' || answer === 'not-approved' || answer === 'rate-limited' ? answer : 'unauthorized';
    } catch {
      return 'unauthorized';
    }
  };
}

/**
 * POST { "id": "<1 to 12 digits>" } fetches that public D&D Beyond character and nothing else.
 * It sends no cookies and no headers beyond Accept, and follows no redirects.
 */
export async function handleImport(req: Request, options: ImportOptions): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, options.allowedOrigins);
  // A browser request from an origin that is not listed gets no answer it can read.
  if (origin !== null && !('Access-Control-Allow-Origin' in cors)) return reply(403, { status: 'unauthorized' }, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { status: 'bad-request' }, cors);

  if (options.authorize) {
    const allowed = await options.authorize(req).catch((): Allowance => 'unauthorized');
    if (allowed !== 'ok') return reply(REFUSAL[allowed], { status: allowed }, cors);
  }

  const id = await requestedId(req);
  if (id === null) return reply(400, { status: 'bad-request' }, cors);

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${CHARACTER_ENDPOINT}${id}`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
  if (upstream.status === 403) return reply(403, { status: 'private' }, cors);
  if (upstream.status === 404) return reply(404, { status: 'not-found' }, cors);
  if (!upstream.ok) return reply(502, { status: 'upstream-error' }, cors);
  try {
    if (tooLong(upstream.headers, MAX_UPSTREAM_BYTES)) return reply(502, { status: 'upstream-error' }, cors);
    const text = await readCapped(upstream.body, MAX_UPSTREAM_BYTES);
    if (text === null) return reply(502, { status: 'upstream-error' }, cors);
    return reply(200, { status: 'ok', raw: JSON.parse(text) }, cors);
  } catch {
    return reply(502, { status: 'upstream-error' }, cors);
  }
}
```

Replace the whole of `supabase/functions/import-character/index.ts` with:

```ts
// Supabase Edge Function entry point (Deno). All logic is in ../_shared/import-handler.ts.
import { databaseAuthorize, handleImport } from '../_shared/import-handler.ts';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

// Supabase gives every function its own project's address. Without it, every request is refused.
const authorize = databaseAuthorize(Deno.env.get('SUPABASE_URL'));

Deno.serve((req) => handleImport(req, { allowedOrigins, authorize }));
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (694 tests in 32 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The import function checks the caller through the database and limits what it reads" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: The Supabase adapter

`supabaseRemote` is the `Remote` that talks to a real Supabase project: Discord sign-in through Supabase Auth, and the tables and functions of Task 4. It is a thin adapter, tested against a stand-in for the supabase-js client that records each call. It cannot be tested against the real services without the owner's accounts; Task 13 covers that.

`defaultRemote` chooses between the adapter and the in-memory account, so `pnpm dev` still needs no Supabase project.

**Files:**
- Create: `apps/web/src/remote/index.ts`
- Create (test): `apps/web/src/remote/supabase.test.ts`
- Create: `apps/web/src/remote/supabase.ts`
- Modify (test): `apps/web/src/test/setup.ts`

**Interfaces:**
- Consumes:
  - `Remote`, `RemoteError` from `apps/web/src/remote/types.ts`; `memoryServer` from `apps/web/src/remote/memory.ts` (Task 3).
  - `characterToRow`, `characterFromRow`, `itemToRow`, `itemFromRow`, `profileFromRow`, `rejectedFromJson`, `remoteErrorFrom` from `apps/web/src/remote/rows.ts` (Task 4).
  - `fetchCharacter`, `importEndpoint`, `ImportEnv` from `apps/web/src/import/client.ts` (Task 6).
- Produces:
  - `apps/web/src/remote/supabase.ts`: `supabaseRemote(client: SupabaseClient, env: ImportEnv): Remote`.
  - `apps/web/src/remote/index.ts`: re-exports `./types`, `memoryServer` and `supabaseRemote`; adds `hasAccount(env): boolean`, `createSupabaseClient(env): SupabaseClient`, `defaultRemote(env?): Remote`, `DEV_USER`.
  - `apps/web/src/test/setup.ts` clears `localStorage` after every test.

- [ ] **Step 1: Prepare**

Add supabase-js to the web app:

```bash
pnpm --filter @cw/web add @supabase/supabase-js
```

Expected: `@supabase/supabase-js` appears under `dependencies` in `apps/web/package.json`. The plan was checked with version 2.119.0.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/remote/supabase.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_USER, defaultRemote, hasAccount } from './index';
import { supabaseRemote } from './supabase';

const ENV = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_test' };

interface Answer { data: unknown; error: { code?: string; message?: string } | null; status?: number }

/**
 * A stand-in for the supabase-js client that records each data call as a line of text
 * ("from characters select * gt rev 5 order rev") and answers with whatever the test queued.
 */
function fakeClient(session: { userId: string; token: string } | null = { userId: 'user-ann', token: 'user-token' }) {
  const calls: string[] = [];
  const answers: Answer[] = [];
  let authListener: (event: string, session: unknown) => void = () => undefined;
  const sessionData = () => ({
    data: { session: session ? { user: { id: session.userId }, access_token: session.token } : null }, error: null,
  });

  const builder = (parts: string[]) => {
    const next = (...more: unknown[]) => builder([...parts, ...more.map(String)]);
    const settle = (): Promise<Answer> => {
      calls.push(parts.join(' '));
      return Promise.resolve(answers.shift() ?? { data: null, error: null, status: 200 });
    };
    return {
      select: (columns: string) => next('select', columns),
      eq: (column: string, value: unknown) => next('eq', column, value),
      gt: (column: string, value: unknown) => next('gt', column, value),
      order: (column: string) => next('order', column),
      maybeSingle: () => next('maybeSingle'),
      then: (resolve: (answer: Answer) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
    };
  };

  const auth = {
    getSession: vi.fn(async () => sessionData()),
    onAuthStateChange: vi.fn((listener: typeof authListener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }),
    signInWithOAuth: vi.fn(async (_options: unknown) => ({ data: {}, error: null })),
    signOut: vi.fn(async (_options: unknown) => ({ error: null })),
  };

  const client = {
    auth,
    from: (table: string) => builder(['from', table]),
    rpc: (name: string, args: unknown) => builder(['rpc', name, JSON.stringify(args)]),
  };

  return {
    client: client as unknown as SupabaseClient,
    auth,
    calls,
    answer: (data: unknown, status = 200) => answers.push({ data, error: null, status }),
    fail: (error: { code?: string; message?: string }, status?: number) => answers.push({ data: null, error, status }),
    emit: (userId: string | null) => authListener('TOKEN_REFRESHED', userId ? { user: { id: userId } } : null),
  };
}

async function started(fake = fakeClient()) {
  const remote = supabaseRemote(fake.client, ENV);
  const seen: (string | null)[] = [];
  await remote.start((userId) => seen.push(userId));
  return { fake, remote, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('supabaseRemote: who is signed in', () => {
  it('reports the stored session at start, then only changes', async () => {
    const { fake, seen } = await started();
    expect(seen).toEqual(['user-ann']);
    fake.emit('user-ann');
    fake.emit('user-ann');
    expect(seen).toEqual(['user-ann']);
    fake.emit(null);
    fake.emit('user-ben');
    expect(seen).toEqual(['user-ann', null, 'user-ben']);
  });

  it('reports null at start when nobody is signed in', async () => {
    const { seen } = await started(fakeClient(null));
    expect(seen).toEqual([null]);
  });

  it('signs in with Discord and comes back to this page without its hash', async () => {
    const { fake, remote } = await started(fakeClient(null));
    window.location.hash = '#/import';
    await remote.signIn();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
  });

  it('signs out of this device only', async () => {
    const { fake, remote } = await started();
    await remote.signOut();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('refuses data calls while signed out, without asking', async () => {
    const { fake, remote } = await started(fakeClient(null));
    await expect(remote.profile()).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(remote.pullCharacters(0)).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fake.calls).toEqual([]);
  });
});

describe('supabaseRemote: data', () => {
  it('reads the signed-in user\'s own profile', async () => {
    const { fake, remote } = await started();
    fake.answer({ id: 'user-ann', display_name: 'Ann', approved: true, is_table_admin: false });
    expect(await remote.profile()).toEqual({ id: 'user-ann', displayName: 'Ann', approved: true, isTableAdmin: false });
    expect(fake.calls).toEqual(['from profiles select * eq id user-ann maybeSingle']);
  });

  it('returns null when the profile does not exist yet', async () => {
    const { fake, remote } = await started();
    fake.answer(null);
    expect(await remote.profile()).toBeNull();
  });

  it('lists profiles by name and approves through the database function', async () => {
    const { fake, remote } = await started();
    fake.answer([{ id: 'a', display_name: 'Ann', approved: true, is_table_admin: false }]);
    expect((await remote.listProfiles()).map((p) => p.displayName)).toEqual(['Ann']);
    await remote.setApproved('user-new', true);
    expect(fake.calls).toEqual([
      'from profiles select * order display_name',
      'rpc set_player_approved {"player":"user-new","value":true}',
    ]);
  });

  it('sends characters through push_characters and returns what was rejected', async () => {
    const { fake, remote } = await started();
    fake.answer([{ id: 'c2', reason: 'limit' }]);
    const result = await remote.pushCharacters([{
      id: 'c1', ddbId: '42', name: 'Vlad', rawJson: { data: 1 }, importedAt: 'T1', updatedAt: 'T2', deleted: false,
    }]);
    expect(result).toEqual({ rejected: [{ id: 'c2', reason: 'limit' }] });
    expect(fake.calls).toEqual([
      'rpc push_characters {"rows":[{"id":"c1","ddb_character_id":"42","name":"Vlad","raw_json":{"data":1},"imported_at":"T1","updated_at":"T2","deleted":false}]}',
    ]);
  });

  it('sends items through push_items', async () => {
    const { fake, remote } = await started();
    await remote.pushItems([{ characterId: 'c1', kind: 'play', key: 'state', data: { spent: {} }, updatedAt: 'T1', deleted: false }]);
    expect(fake.calls).toEqual([
      'rpc push_items {"rows":[{"character_id":"c1","kind":"play","key":"state","data":{"spent":{}},"updated_at":"T1","deleted":false}]}',
    ]);
  });

  it('fetches rows after a rev, in rev order, and maps them', async () => {
    const { fake, remote } = await started();
    fake.answer([{
      id: 'c1', owner_id: 'user-ann', ddb_character_id: '42', name: 'Vlad', raw_json: { data: 1 },
      imported_at: '2026-01-01T10:00:00+00:00', updated_at: '2026-01-02T10:00:00.123456+00:00', deleted: false, rev: 7,
    }]);
    fake.answer([{ character_id: 'c1', kind: 'edit', key: 'k', data: { hidden: true }, updated_at: '2026-01-02T10:00:00+00:00', deleted: false, rev: 8 }]);
    expect(await remote.pullCharacters(5)).toEqual([{
      id: 'c1', ownerId: 'user-ann', ddbId: '42', name: 'Vlad', rawJson: { data: 1 },
      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.123Z', deleted: false, rev: 7,
    }]);
    expect(await remote.pullItems(5)).toEqual([{
      characterId: 'c1', kind: 'edit', key: 'k', data: { hidden: true }, updatedAt: '2026-01-02T10:00:00.000Z', deleted: false, rev: 8,
    }]);
    expect(fake.calls).toEqual([
      'from characters select * gt rev 5 order rev',
      'from character_items select * gt rev 5 order rev',
    ]);
  });
});

describe('supabaseRemote: failures', () => {
  it.each([
    ['a refusal by the database', { code: '42501', message: 'not allowed' }, 403, 'refused'],
    ['an expired token', { code: 'PGRST301', message: 'JWT expired' }, 401, 'unauthorized'],
    ['any other 401', { message: 'Unauthorized' }, 401, 'unauthorized'],
    ['a request that never got an answer', { message: 'TypeError: Failed to fetch' }, 0, 'offline'],
    ['an answer with no status at all', { message: 'something' }, undefined, 'offline'],
    ['a server error', { code: 'XX000', message: 'boom' }, 500, 'other'],
  ] as const)('turns %s into a RemoteError', async (_label, error, status, kind) => {
    const { fake, remote } = await started();
    fake.fail(error, status);
    await expect(remote.pullItems(0)).rejects.toMatchObject({ name: 'RemoteError', kind });
  });
});

describe('supabaseRemote: import', () => {
  it('calls the import function with the publishable key and the user\'s token', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ status: 'ok', raw: { data: { id: 42 } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { remote } = await started();
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://abc.supabase.co/functions/v1/import-character');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json', apikey: 'sb_publishable_test', Authorization: 'Bearer user-token',
    });
  });

  it('answers unauthorized without calling when there is no session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { remote } = await started(fakeClient(null));
    expect(await remote.importCharacter('42')).toEqual({ status: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('defaultRemote', () => {
  it('knows whether the build has a Supabase project', () => {
    expect(hasAccount(ENV)).toBe(true);
    expect(hasAccount({})).toBe(false);
    expect(hasAccount({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBe(false);
  });

  it('is an in-memory account in local development, where sign-in makes an approved admin', async () => {
    const remote = defaultRemote({});
    const seen: (string | null)[] = [];
    await remote.start((userId) => seen.push(userId));
    await remote.signIn();
    expect(seen).toEqual([null, DEV_USER.id]);
    expect(await remote.profile()).toEqual({ id: DEV_USER.id, displayName: 'Test player', approved: true, isTableAdmin: true });
  });

  it('keeps the stand-in player signed in across a reload, and signed out after signing out', async () => {
    const first = defaultRemote({});
    await first.start(() => undefined);
    await first.signIn();
    // A reload: a new account in memory, the same browser.
    const second = defaultRemote({});
    const seen: (string | null)[] = [];
    await second.start((userId) => seen.push(userId));
    expect(seen).toEqual([DEV_USER.id]);
    expect((await second.profile())?.approved).toBe(true);
    await second.signOut();
    const third = defaultRemote({});
    const after: (string | null)[] = [];
    await third.start((userId) => after.push(userId));
    expect(after).toEqual([null]);
  });

  it('sends a local import to the dev server', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ status: 'ok', raw: { data: { id: 42 } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const remote = defaultRemote({});
    await remote.start(() => undefined);
    await remote.signIn();
    expect(await remote.importCharacter('42')).toEqual({ status: 'ok', raw: { data: { id: 42 } } });
    expect(fetchMock.mock.calls[0][0]).toBe('/functions/v1/import-character');
  });
});
```

Replace the whole of `apps/web/src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
  // Local development's stand-in account remembers its sign-in here.
  window.localStorage.clear();
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/remote/supabase.test.ts
```

Expected: FAIL. `./index` and `./supabase` cannot be found.

- [ ] **Step 4: Write the implementation**

supabase-js data calls do not throw: they resolve to `{ data, error, status }`. A request that never reached the server has no status (or status 0), which is how the adapter tells "offline" from a refusal.

In local development the stand-in player stays signed in across a reload, by a flag in `localStorage`, as a real player would. The in-memory account itself is empty again after a reload. The test setup clears `localStorage` after every test so that no test inherits a sign-in.

The client is created with `flowType: 'pkce'`, so Discord sign-in returns to the page with `?code=...` in the query string. supabase-js exchanges the code and removes it from the address. The app's own routes are in the hash and are not involved.

Create `apps/web/src/remote/index.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCharacter, importEndpoint, type ImportEnv } from '../import/client';
import { memoryServer } from './memory';
import { supabaseRemote } from './supabase';
import type { Remote } from './types';

export * from './types';
export { memoryServer } from './memory';
export { supabaseRemote } from './supabase';

/** The stand-in user of local development. */
export const DEV_USER = { id: '00000000-0000-4000-8000-00000000d3e1', displayName: 'Test player' };

/** True when the build has a Supabase project to talk to. */
export const hasAccount = (env: ImportEnv): boolean => (env.VITE_SUPABASE_URL ?? '') !== '' && (env.VITE_SUPABASE_KEY ?? '') !== '';

/**
 * A Supabase client set up for this app: the session is kept on the device, and sign-in returns
 * with a `code` in the query string (PKCE), which supabase-js exchanges and then removes.
 */
export function createSupabaseClient(env: ImportEnv): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_KEY ?? '', {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
}

/** Where local development remembers that the stand-in player is signed in. */
const DEV_FLAG = 'cw-dev-signed-in';

/** localStorage, where it works. A browser that blocks it just forgets the stand-in's sign-in. */
const devFlag = {
  get: (): boolean => {
    try {
      return window.localStorage.getItem(DEV_FLAG) === '1';
    } catch {
      return false;
    }
  },
  set: (signedIn: boolean): void => {
    try {
      if (signedIn) window.localStorage.setItem(DEV_FLAG, '1');
      else window.localStorage.removeItem(DEV_FLAG);
    } catch {
      // Nothing to do: the next reload starts signed out.
    }
  },
};

/**
 * Local development's account: held in memory for as long as the page is open, where "Continue
 * as test player" signs in an approved admin and imports go to the dev server. The account is
 * empty again after a reload, but the stand-in player stays signed in, as a real one would.
 */
function devRemote(env: ImportEnv): Remote {
  const server = memoryServer({ importer: (ddbId) => fetchCharacter(ddbId, importEndpoint(env)) });
  const signedIn = devFlag.get();
  if (signedIn) server.addUser(DEV_USER.id, DEV_USER.displayName, { approved: true, admin: true });
  const inner = server.remote({ userId: signedIn ? DEV_USER.id : null, signInAs: DEV_USER });
  return {
    ...inner,
    async signIn() {
      await inner.signIn();
      devFlag.set(true);
    },
    async signOut() {
      await inner.signOut();
      devFlag.set(false);
    },
  };
}

/** The account this build talks to: Supabase when an address is configured, the stand-in otherwise. */
export function defaultRemote(env: ImportEnv = import.meta.env): Remote {
  return hasAccount(env) ? supabaseRemote(createSupabaseClient(env), env) : devRemote(env);
}
```

Create `apps/web/src/remote/supabase.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCharacter, importEndpoint, type ImportEnv } from '../import/client';
import {
  characterFromRow, characterToRow, itemFromRow, itemToRow, profileFromRow, rejectedFromJson, remoteErrorFrom,
} from './rows';
import { RemoteError, type Remote } from './types';

type Row = Record<string, unknown>;

/** What every supabase-js data call resolves to. The client reports failures here; it does not throw. */
interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status?: number;
}

/** A failure as a RemoteError. A request that never got an answer has no status, or status 0. */
function failure(answer: Answer): RemoteError {
  const message = answer.error?.message ?? '';
  if (!answer.status || /failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return new RemoteError('offline', message);
  }
  return remoteErrorFrom({ code: answer.error?.code, status: answer.status, message });
}

/** The data of an answer; rejects with a RemoteError if the call failed or could not be made. */
async function unwrap(call: PromiseLike<Answer>): Promise<unknown> {
  let answer: Answer;
  try {
    answer = await call;
  } catch (error) {
    throw new RemoteError('offline', error instanceof Error ? error.message : String(error));
  }
  if (answer.error) throw failure(answer);
  return answer.data;
}

const rows = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : []);

/**
 * The account, on Supabase. Sign-in is by Discord; data goes through the tables and functions of
 * supabase/migrations. Create the client with `createSupabaseClient` so that sign-in returns to
 * the page with a `code` in the query string, which the hash routes do not use.
 */
export function supabaseRemote(client: SupabaseClient, env: ImportEnv): Remote {
  let userId: string | null = null;

  const me = (): string => {
    if (userId === null) throw new RemoteError('unauthorized');
    return userId;
  };

  return {
    async start(onUser) {
      let told = false;
      const tell = (id: string | null): void => {
        if (told && id === userId) return;
        told = true;
        userId = id;
        onUser(id);
      };
      // Reads the session kept on this device, first finishing a sign-in that has just come back.
      const { data } = await client.auth.getSession();
      tell(data.session?.user.id ?? null);
      client.auth.onAuthStateChange((_event, session) => tell(session?.user.id ?? null));
    },

    async signIn() {
      await client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
    },

    async signOut() {
      // This device only: the player's other devices stay signed in.
      await client.auth.signOut({ scope: 'local' });
    },

    async profile() {
      const data = await unwrap(client.from('profiles').select('*').eq('id', me()).maybeSingle());
      return data ? profileFromRow(data as Row) : null;
    },

    async listProfiles() {
      me();
      return rows(await unwrap(client.from('profiles').select('*').order('display_name'))).map(profileFromRow);
    },

    async setApproved(player, approved) {
      me();
      await unwrap(client.rpc('set_player_approved', { player, value: approved }));
    },

    async pushCharacters(characters) {
      me();
      const data = await unwrap(client.rpc('push_characters', { rows: characters.map(characterToRow) }));
      return { rejected: rejectedFromJson(data) };
    },

    async pushItems(items) {
      me();
      await unwrap(client.rpc('push_items', { rows: items.map(itemToRow) }));
    },

    async pullCharacters(afterRev) {
      me();
      return rows(await unwrap(client.from('characters').select('*').gt('rev', afterRev).order('rev'))).map(characterFromRow);
    },

    async pullItems(afterRev) {
      me();
      return rows(await unwrap(client.from('character_items').select('*').gt('rev', afterRev).order('rev'))).map(itemFromRow);
    },

    async importCharacter(ddbId) {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { status: 'unauthorized' };
      return fetchCharacter(ddbId, importEndpoint(env, token));
    },
  };
}
```

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (717 tests in 33 files) and the type check prints no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "The Supabase adapter and the choice between it and the local stand-in" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: The store knows who is signed in and keeps the device and the account in step

The store gains a session and drives the sync engine (spec sections 11 and 12). The screens do not change in this task: tests sign the store in through a test account, so every existing screen test keeps passing. Sign-in and the other new screens arrive in Tasks 9 to 11.

**Files:**
- Modify (test): `apps/web/src/screens/screens.test.tsx`
- Create (test): `apps/web/src/store.session.test.ts`
- Modify (test): `apps/web/src/store.test.ts`
- Modify: `apps/web/src/store.ts`
- Modify (test): `apps/web/src/test/helpers.ts`
- Modify (test): `apps/web/src/views/CombatView.test.tsx`

**Interfaces:**
- Consumes:
  - `AppStorage`, `StoredCharacter`, `STATE_KEY`, `memoryStorage`, `openStorage` from `apps/web/src/storage` (Task 2).
  - `Remote`, `RemoteError`, `Profile`, `ImportResult`, `CHARACTER_LIMIT`, `defaultRemote` from `apps/web/src/remote` (Tasks 3 and 7); `memoryServer`, `MemoryServer`, `MemoryRemote` from `apps/web/src/remote/memory.ts`.
  - `characterId`, `claimLocalCharacters`, `hasUnsynced`, `nextStamp`, `resetCursors`, `syncOnce` from `apps/web/src/sync/engine.ts`; `createScheduler` from `apps/web/src/sync/scheduler.ts` (Task 5).
- Produces:
  - Store state: `session: { userId: string; profile: Profile | null } | null`, `syncState: 'saved' | 'waiting' | 'signin' | 'limit'`. `characters` now holds every character on the device that is not deleted.
  - Store actions: `init(storage?, remote?)`, `signIn()`, `signOut(discard?): Promise<boolean>`, `syncNow()`, `listProfiles()`, `setApproved(userId, approved)`, `importCharacter(ddbId)`, `canAddCharacter()`, `saveImported(raw, replaceId?)`.
  - Test helpers: `TEST_USER`, `testServer(): MemoryServer`, `testRemote(server?): MemoryRemote`, and `seed(slug, storage?, remote?)`, which now signs in as the test player.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/screens/screens.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -5,7 +5,7 @@ import { loadRaw } from '../../../../test-utils/fixtures';
 import { ErrorBoundary } from '../App';
 import { memoryStorage, type AppStorage } from '../storage';
 import { useStore } from '../store';
-import { seed } from '../test/helpers';
+import { seed, testRemote } from '../test/helpers';
 import { renderAt } from '../test/render';
 
 const json = (status: number, body: unknown) =>
@@ -18,7 +18,7 @@ const stubFetch = (response: () => Response | Promise<Response>) => {
 };
 
 async function emptyApp(storage: AppStorage = memoryStorage()) {
-  await useStore.getState().init(storage);
+  await useStore.getState().init(storage, testRemote());
 }
 
 describe('Home screen', () => {
```

Create `apps/web/src/store.session.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryServer, type MemoryServer } from './remote/memory';
import { CHARACTER_LIMIT, type Remote } from './remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter } from './storage';
import { useStore } from './store';
import { syncOnce } from './sync/engine';
import { TEST_USER, ability, rawWithId, savedPlay, seed, testRemote, testServer } from './test/helpers';

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const DM = 'user-dm';
const OTHER = 'user-other';

/** A second device signed in to the same account, with nothing to do with the store. */
const otherDevice = (server: MemoryServer, userId: string = TEST_USER) =>
  ({ storage: memoryStorage(), remote: server.remote({ userId }) });

const stored = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: TEST_USER, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
  importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true, ...over,
});

describe('starting the app', () => {
  it('starts once when asked twice at the same moment, as React does in development', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    await Promise.all([state().init(), state().init()]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ ready: true, session: null });
    open.mockRestore();
  });

  it('starts again when asked again later', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    await state().init();
    await state().init();
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });
});

describe('who is signed in', () => {
  it('has no session on a device where nobody has signed in, and is ready all the same', async () => {
    await state().init(memoryStorage(), testServer().remote());
    expect(state()).toMatchObject({ ready: true, session: null, characters: [] });
    expect(await state().saveImported(loadRaw('vlad'))).toBeNull();
    expect(state().canAddCharacter()).toBe(false);
  });

  it('signs in, learns the profile and remembers both on the device', async () => {
    const storage = memoryStorage();
    const server = memoryServer();
    await state().init(storage, server.remote({ signInAs: { id: 'user-new', displayName: 'Nell' } }));
    expect(state().session).toBeNull();
    await state().signIn();
    const session = { userId: 'user-new', profile: { id: 'user-new', displayName: 'Nell', approved: true, isTableAdmin: true } };
    expect(state().session).toEqual(session);
    expect(await storage.getMeta('session')).toEqual(session);
  });

  it('opens from the device when the account cannot say who is signed in, and asks for sign-in to sync', async () => {
    const storage = memoryStorage();
    const server = testServer();
    await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    // The same device later: the session has ended, so the account reports nobody.
    await state().init(storage, server.remote());
    expect(state().session?.userId).toBe(TEST_USER);
    expect(state().session?.profile?.displayName).toBe('Tess');
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
    expect(state().syncState).toBe('signin');
  });

  it('keeps an unapproved player\'s session but sends and fetches nothing', async () => {
    const server = memoryServer();
    server.addUser('user-new', 'Nell');
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-new', { ownerId: 'user-new' }));
    await state().init(storage, server.remote({ userId: 'user-new' }));
    expect(state().session?.profile).toMatchObject({ approved: false });
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    expect(await server.remote({ userId: DM }).pullCharacters(0)).toEqual([]);
  });

  it('notices approval at the next sync and then sends what it holds', async () => {
    const server = memoryServer();
    server.addUser('user-new', 'Nell');
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-new', { ownerId: 'user-new' }));
    await state().init(storage, server.remote({ userId: 'user-new' }));
    await server.remote({ userId: DM }).setApproved('user-new', true);
    await state().syncNow();
    expect(state().session?.profile?.approved).toBe(true);
    expect((await server.remote({ userId: DM }).pullCharacters(0)).map((c) => c.id)).toEqual(['ddb-1-user-new']);
    expect(state().syncState).toBe('saved');
  });

  it('removes the previous account\'s copy when a different user signs in on the device', async () => {
    const storage = memoryStorage();
    const server = testServer();
    server.addUser(OTHER, 'Otto', { approved: true });
    await seed('vlad', storage, testRemote(server));
    await state().init(storage, server.remote({ userId: OTHER }));
    expect(state().session?.userId).toBe(OTHER);
    expect(state().characters).toEqual([]);
    expect(await storage.listCharacters()).toEqual([]);
  });
});

describe('first sign-in on a device that already has characters', () => {
  it('gives them to the player, re-keyed, and uploads them with their play state', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(stored('local-uuid', { ownerId: null }));
    await storage.putItem({
      characterId: 'local-uuid', kind: 'play', key: 'state', data: { spent: { pact: 1 }, concentrationKey: null },
      updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
    });
    const server = testServer();
    await state().init(storage, testRemote(server));
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER, dirty: false }]);
    const remote = testRemote(server);
    expect((await remote.pullCharacters(0)).map((c) => c.id)).toEqual(['ddb-1-user-test']);
    expect((await remote.pullItems(0))[0]).toMatchObject({ characterId: 'ddb-1-user-test', kind: 'play', data: { spent: { pact: 1 } } });
  });
});

describe('syncing', () => {
  it('says "waiting" after a change and "saved" once the account has it', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    expect(state().characters[0].dirty).toBe(false);
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    expect((await testRemote(server).pullItems(0))[0]).toMatchObject({ characterId: record.id, data: { spent: { pact: 1 } } });
  });

  it('does not count a pill flip as something to sync', async () => {
    await seed('vlad');
    await state().syncNow();
    state().togglePill('action');
    await settle();
    expect(state().syncState).toBe('saved');
  });

  it('keeps waiting while the account cannot be reached, and catches up afterwards', async () => {
    const server = testServer();
    await seed('vlad', memoryStorage(), testRemote(server));
    server.offline = true;
    await state().syncNow();
    expect(state().syncState).toBe('waiting');
    server.offline = false;
    await state().syncNow();
    expect(state().syncState).toBe('saved');
  });

  it('asks for sign-in when the account rejects the session', async () => {
    const server = testServer();
    const remote = testRemote(server);
    await seed('vlad', memoryStorage(), remote);
    await remote.signOut();
    await state().syncNow();
    expect(state().syncState).toBe('signin');
    expect(state().session?.userId).toBe(TEST_USER);
    expect(state().characters).toHaveLength(1);
  });

  it('shows a character imported on another device', async () => {
    const server = testServer();
    await state().init(memoryStorage(), testRemote(server));
    const other = otherDevice(server);
    await other.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(other);
    await state().syncNow();
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
  });

  it('shows what another device spent on the open character, and keeps this device\'s turn', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    state().togglePill('reaction');
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() + 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    await state().syncNow();
    expect(state().play.spent).toEqual({ pact: 2 });
    expect(state().play.turn.reaction).toBe(true);
    expect(state().undo).toBeNull();
  });

  it('closes the open character when it was deleted on another device', async () => {
    const server = testServer();
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    const [theirs] = await other.storage.listCharacters();
    await other.storage.putCharacter({
      ...theirs, deleted: true, rawJson: null, dirty: true, updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    await syncOnce(other);
    await state().syncNow();
    expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
    expect(record.id).toBe(theirs.id);
  });

  it('keeps a change the player made while a fetch was running', async () => {
    const server = testServer();
    const inner = testRemote(server);
    let duringFetch: () => void = () => undefined;
    const remote: Remote = {
      ...inner,
      async pullItems(afterRev) {
        const rows = await inner.pullItems(afterRev);
        duringFetch();
        return rows;
      },
    };
    const record = await seed('vlad', memoryStorage(), remote);
    await state().syncNow();
    const other = otherDevice(server);
    await syncOnce(other);
    await other.storage.putItem({
      characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
      updatedAt: new Date(Date.now() - 1000).toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(other);
    duringFetch = () => {
      duringFetch = () => undefined;
      state().use(ability('Hex'), 'combat');
    };
    await state().syncNow();
    expect(state().play.spent).toEqual({ pact: 1 });
    await state().syncNow();
    expect((await inner.pullItems(0))[0].data).toMatchObject({ spent: { pact: 1 } });
  });

  it('sends a deletion and then forgets the character entirely', async () => {
    const server = testServer();
    const storage = memoryStorage();
    const record = await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    await state().remove(record.id);
    expect(state().syncState).toBe('waiting');
    await state().syncNow();
    expect(await storage.listCharacters()).toEqual([]);
    expect((await testRemote(server).pullCharacters(0))[0]).toMatchObject({ id: record.id, deleted: true });
    expect(state().syncState).toBe('saved');
  });
});

describe('the ten-character limit', () => {
  const fill = async (storage: AppStorage) => {
    for (let i = 1; i <= CHARACTER_LIMIT; i += 1) await storage.putCharacter(stored(`ddb-${i}-user-test`, { ddbId: String(i) }));
  };

  it('refuses an eleventh character of the player\'s own', async () => {
    const storage = memoryStorage();
    await fill(storage);
    await state().init(storage, testRemote());
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
    expect(state().canAddCharacter()).toBe(false);
    expect(await state().saveImported(rawWithId('minkis', 99))).toBeNull();
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
  });

  it('still lets a full account re-import a character it already has', async () => {
    const storage = memoryStorage();
    await fill(storage);
    await state().init(storage, testRemote());
    expect(await state().saveImported(rawWithId('vlad', 1))).toMatchObject({ id: 'ddb-1-user-test' });
  });

  it('does not count other players\' characters against a table admin', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await fill(player.storage);
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect(state().characters).toHaveLength(CHARACTER_LIMIT);
    expect(state().canAddCharacter()).toBe(true);
  });

  it('says so when the account is full because of another device', async () => {
    const server = testServer();
    const other = otherDevice(server);
    await fill(other.storage);
    await syncOnce(other);
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-99-user-test', { ddbId: '99' }));
    await storage.setMeta('session', { userId: TEST_USER, profile: { displayName: 'Tess', approved: true, isTableAdmin: false } });
    await storage.setMeta('cursor:characters', 1_000_000);
    await state().init(storage, testRemote(server));
    expect(state().syncState).toBe('limit');
  });
});

describe('a table admin', () => {
  it('sees every character and re-imports a player\'s character without becoming its owner', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER }]);
    const again = await state().saveImported(loadRaw('vlad'), 'ddb-1-user-test');
    expect(again).toMatchObject({ id: 'ddb-1-user-test', ownerId: TEST_USER });
    expect(state().characters).toHaveLength(1);
    // Importing the same sheet without naming the player's copy makes the admin's own.
    const own = await state().saveImported(loadRaw('vlad'));
    expect(own).toMatchObject({ id: `ddb-1-${DM}`, ownerId: DM });
    expect(state().characters).toHaveLength(2);
  });

  it('refuses to re-import a character that is not on the device', async () => {
    await state().init(memoryStorage(), testRemote());
    expect(await state().saveImported(loadRaw('vlad'), 'no-such-id')).toBeNull();
  });

  it('starts seeing everyone\'s characters once made an admin', async () => {
    const server = testServer();
    server.addUser(OTHER, 'Otto', { approved: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    await state().init(memoryStorage(), server.remote({ userId: OTHER }));
    expect(state().characters).toEqual([]);
    server.addUser(OTHER, 'Otto', { approved: true, admin: true });
    await state().syncNow();
    expect(state().characters.map((c) => c.id)).toEqual(['ddb-1-user-test']);
  });

  it('loses the other players\' characters from the device when no longer an admin', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    const player = otherDevice(server);
    await player.storage.putCharacter(stored('ddb-1-user-test'));
    await syncOnce(player);
    const storage = memoryStorage();
    await state().init(storage, server.remote({ userId: DM }));
    const own = await state().saveImported(rawWithId('minkis', 2));
    await state().open('ddb-1-user-test');
    expect(state().openId).toBe('ddb-1-user-test');
    server.addUser(DM, 'Dee', { approved: true });
    await state().syncNow();
    expect(state().characters.map((c) => c.id)).toEqual([own?.id]);
    expect((await storage.listCharacters()).map((c) => c.id)).toEqual([own?.id]);
    expect(state()).toMatchObject({ openId: null, sheet: null });
  });

  it('lists profiles and approves through the account', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    server.addUser('user-new', 'Nell');
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    expect((await state().listProfiles()).map((p) => p.displayName)).toEqual(['Dee', 'Nell', 'Tess']);
    await state().setApproved('user-new', true);
    expect((await state().listProfiles()).find((p) => p.id === 'user-new')?.approved).toBe(true);
    await expect(state().setApproved(DM, false)).rejects.toMatchObject({ kind: 'refused' });
  });
});

describe('signing out', () => {
  it('removes the device\'s copy of everything once the account has it all', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    expect(await state().signOut()).toBe(true);
    expect(state()).toMatchObject({ ready: true, session: null, characters: [], openId: null });
    expect(await storage.listCharacters()).toEqual([]);
    expect(await storage.listItems()).toEqual([]);
    expect(await storage.getMeta('session')).toBeNull();
    // It synced first, so nothing was lost.
    expect((await testRemote(server).pullItems(0))[0]).toMatchObject({ characterId: record.id, data: { spent: { pact: 1 } } });
  });

  it('refuses while changes cannot be sent, unless told to discard them', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    state().use(ability('Hex'), 'combat');
    await settle();
    server.offline = true;
    expect(await state().signOut()).toBe(false);
    expect(state().session?.userId).toBe(TEST_USER);
    expect(await savedPlay(storage, record.id)).not.toBeNull();
    expect(await state().signOut(true)).toBe(true);
    expect(state().session).toBeNull();
    expect(await storage.listCharacters()).toEqual([]);
  });

  it('does not come back as "sign in again" after signing out', async () => {
    await seed('vlad');
    await state().signOut(true);
    expect(state()).toMatchObject({ session: null, syncState: 'saved' });
  });
});

describe('import', () => {
  it('goes through the account, which checks the player first', async () => {
    const server = memoryServer({ importer: async () => ({ status: 'ok', raw: loadRaw('vlad') }) });
    server.addUser('user-new', 'Nell');
    await state().init(memoryStorage(), server.remote({ userId: 'user-new' }));
    expect(await state().importCharacter('1')).toEqual({ status: 'not-approved' });
    server.addUser('user-new', 'Nell', { approved: true });
    expect((await state().importCharacter('1')).status).toBe('ok');
  });
});
```

Apply this change to `apps/web/src/store.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -3,7 +3,7 @@ import { emptyPlayState } from '@cw/rules';
 import { loadRaw } from '../../../test-utils/fixtures';
 import { memoryStorage, type AppStorage } from './storage';
 import { cachedSheetCount, sheetFor, useStore } from './store';
-import { ability, putSavedPlay, rawWithId, savedPlay, seed } from './test/helpers';
+import { ability, putSavedPlay, rawWithId, savedPlay, seed, testRemote } from './test/helpers';
 
 const sheetBuild = vi.hoisted(() => ({ fails: false }));
 
@@ -29,14 +29,14 @@ describe('init', () => {
   it('loads what the storage holds and becomes ready', async () => {
     const storage = memoryStorage();
     await seed('vlad', storage);
-    await state().init(storage);
+    await state().init(storage, testRemote());
     expect(state()).toMatchObject({ ready: true, persistent: true, openId: null, sheet: null });
     expect(state().characters.map((c) => c.name)).toEqual(['Vlad']);
   });
 
   it('keeps working without saving when the storage cannot be read', async () => {
     const broken: AppStorage = { ...memoryStorage(), listCharacters: async () => { throw new Error('blocked'); } };
-    await state().init(broken);
+    await state().init(broken, testRemote());
     expect(state()).toMatchObject({ ready: true, persistent: false, characters: [] });
   });
 });
@@ -44,18 +44,19 @@ describe('init', () => {
 describe('saveImported', () => {
   it('stores a new character with its name, D&D Beyond ID and raw JSON', async () => {
     const storage = memoryStorage();
-    await state().init(storage);
+    await state().init(storage, testRemote());
     const raw = loadRaw('vlad');
     const record = await state().saveImported(raw);
     expect(record).toMatchObject({ ddbId: '1', name: 'Vlad', rawJson: raw, deleted: false, dirty: true });
     expect(record?.updatedAt).toBe(record?.importedAt);
-    expect(record?.id).toMatch(/^[0-9a-f-]{36}$/);
+    expect(record?.id).toBe('ddb-1-user-test');
+    expect(record?.ownerId).toBe('user-test');
     expect(Number.isNaN(Date.parse(record?.importedAt ?? ''))).toBe(false);
     expect(await storage.listCharacters()).toEqual([record]);
   });
 
   it('refuses JSON that is not a character', async () => {
-    await state().init(memoryStorage());
+    await state().init(memoryStorage(), testRemote());
     expect(await state().saveImported({ hello: 'world' })).toBeNull();
     expect(await state().saveImported('nonsense')).toBeNull();
     expect(state().characters).toEqual([]);
@@ -64,9 +65,10 @@ describe('saveImported', () => {
   it('makes an ID without crypto.randomUUID, as on a page served over plain HTTP', async () => {
     const real = globalThis.crypto;
     vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView>(array: T): T => real.getRandomValues(array as any) });
-    await state().init(memoryStorage());
-    const first = await state().saveImported(rawWithId('vlad', 101));
-    const second = await state().saveImported(rawWithId('minkis', 102));
+    await state().init(memoryStorage(), testRemote());
+    // An ID of 0 is JSON pasted with no D&D Beyond ID, which is the only kind that needs a random ID.
+    const first = await state().saveImported(rawWithId('vlad', 0));
+    const second = await state().saveImported(rawWithId('minkis', 0));
     expect(first?.id).toMatch(UUID_V4);
     expect(second?.id).toMatch(UUID_V4);
     expect(first?.id).not.toBe(second?.id);
@@ -74,7 +76,7 @@ describe('saveImported', () => {
 
   it('refuses a character whose sheet cannot be built, and stores nothing', async () => {
     const storage = memoryStorage();
-    await state().init(storage);
+    await state().init(storage, testRemote());
     sheetBuild.fails = true;
     try {
       expect(await state().saveImported(loadRaw('vlad'))).toBeNull();
@@ -86,7 +88,7 @@ describe('saveImported', () => {
   });
 
   it('keeps two different characters apart', async () => {
-    await state().init(memoryStorage());
+    await state().init(memoryStorage(), testRemote());
     await state().saveImported(rawWithId('vlad', 101));
     await state().saveImported(rawWithId('minkis', 102));
     expect(state().characters.map((c) => c.name).sort()).toEqual(['Minkis', 'Vlad']);
@@ -136,7 +138,7 @@ describe('open', () => {
     const record = await seed('vlad', storage);
     state().use(ability('Hex'), 'combat');
     await settle();
-    await state().init(storage);
+    await state().init(storage, testRemote());
     await state().open(record.id);
     expect(state().sheet?.name).toBe('Vlad');
     expect(state().play.spent).toEqual({ pact: 1 });
@@ -161,7 +163,7 @@ describe('open', () => {
     const record = await seed('vlad', storage);
     state().use(ability('Hex'), 'combat');
     await settle();
-    await state().init(storage);
+    await state().init(storage, testRemote());
     const opening = state().open(record.id);
     expect(state()).toMatchObject({ openId: record.id, loaded: false });
     state().use(ability('Arms of Hadar'), 'combat');
@@ -185,7 +187,7 @@ describe('open', () => {
       characterId: record.id, kind: 'turn', key: 'state', data: 'nonsense',
       updatedAt: '2026-11-18T12:00:00.000Z', deleted: false, dirty: false,
     });
-    await state().init(storage);
+    await state().init(storage, testRemote());
     await state().open(record.id);
     expect(state().loaded).toBe(true);
     expect(state().play).toEqual(emptyPlayState());
@@ -303,7 +305,8 @@ describe('remove', () => {
     await settle();
     await state().remove(record.id);
     expect(state()).toMatchObject({ characters: [], openId: null, sheet: null });
-    expect(await storage.listCharacters()).toEqual([]);
+    // The record stays, marked deleted and without its sheet, until the account has been told.
+    expect(await storage.listCharacters()).toMatchObject([{ id: record.id, deleted: true, dirty: true, rawJson: null }]);
     expect(await savedPlay(storage, record.id)).toBeNull();
   });
 
```

Replace the whole of `apps/web/src/test/helpers.ts` with:

```ts
import type { Ability, PlayState } from '@cw/model';
import { normalisePlayItem, normaliseTurn } from '@cw/rules';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { memoryServer, type MemoryRemote, type MemoryServer } from '../remote/memory';
import type { Remote } from '../remote/types';
import { STATE_KEY, memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';

/** A fixture's raw JSON with its D&D Beyond ID replaced, so two fixtures can be stored side by side. */
export function rawWithId(slug: Slug, ddbId: number): any {
  const raw = loadRaw(slug);
  raw.data.id = ddbId;
  return raw;
}

/** The approved player most tests are signed in as. */
export const TEST_USER = 'user-test';

/** An in-memory account that already knows the test player. */
export function testServer(): MemoryServer {
  const server = memoryServer();
  server.addUser(TEST_USER, 'Tess', { approved: true });
  return server;
}

/** A device signed in as the test player. Each call without a server gets an account of its own. */
export const testRemote = (server: MemoryServer = testServer()): MemoryRemote => server.remote({ userId: TEST_USER });

/**
 * A fresh store on in-memory storage, signed in as the test player and holding one imported
 * fixture, which is opened.
 */
export async function seed(
  slug: Slug, storage: AppStorage = memoryStorage(), remote: Remote = testRemote(),
): Promise<StoredCharacter> {
  await useStore.getState().init(storage, remote);
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

/** The play state a storage holds for a character, put back together from its two items. Null when it holds neither. */
export async function savedPlay(storage: AppStorage, characterId: string): Promise<PlayState | null> {
  const items = (await storage.listItems(characterId)).filter((item) => item.key === STATE_KEY && !item.deleted);
  const play = items.find((item) => item.kind === 'play');
  const turn = items.find((item) => item.kind === 'turn');
  if (!play && !turn) return null;
  return { ...normalisePlayItem(play?.data), turn: normaliseTurn(turn?.data) };
}

/** Writes a play state straight into a storage, as its two items, behind the store's back. */
export async function putSavedPlay(storage: AppStorage, characterId: string, state: PlayState): Promise<void> {
  const base = { characterId, key: STATE_KEY, updatedAt: '2026-11-18T12:00:00.000Z', deleted: false };
  await storage.putItem({ ...base, kind: 'play', data: { spent: state.spent, concentrationKey: state.concentrationKey }, dirty: true });
  await storage.putItem({ ...base, kind: 'turn', data: state.turn, dirty: false });
}
```

Apply this change to `apps/web/src/views/CombatView.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -5,7 +5,7 @@ import type { Slug } from '../../../../test-utils/fixtures';
 import { CharacterScreen } from '../screens/Character';
 import { memoryStorage } from '../storage';
 import { useStore } from '../store';
-import { seed } from '../test/helpers';
+import { seed, testRemote } from '../test/helpers';
 
 async function openCombat(slug: Slug) {
   const record = await seed(slug);
@@ -151,7 +151,7 @@ describe('Combat view', () => {
   });
 
   it('says so when the sheet has no class or level', async () => {
-    await useStore.getState().init(memoryStorage());
+    await useStore.getState().init(memoryStorage(), testRemote());
     const record = await useStore.getState().saveImported({ data: { id: 7, name: 'Blank' } });
     if (!record) throw new Error('the blank sheet did not import');
     render(<CharacterScreen id={record.id} view="combat" />);
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/screens/screens.test.tsx apps/web/src/store.session.test.ts apps/web/src/store.test.ts apps/web/src/views/CombatView.test.tsx
```

Expected: FAIL. `init` takes one argument, and the store has no `session`, `signOut` or `syncNow`.

- [ ] **Step 3: Write the implementation**

Six behaviours here are deliberate and easy to undo by accident:

- **Starting twice at the same moment starts once.** In development React runs the app's start-up effect twice. A second `init()` with no arguments joins the first; without that, the second reset the open character and left the screen on "Loading…". The browser walk-through found this, not a test.
- **A player who stops being a table admin loses the other players' characters from the device** at the next sync.

- **`ready` turns true as soon as the device's own copy is loaded.** The promise `init` returns also waits for the account, which tests rely on, but the app does not wait for it: a signed-in device opens without a connection.
- **When the account reports that nobody is signed in but the device has a session, the device keeps its session** and shows "Sign in again to sync". Only `signOut` clears a device.
- **Deleting keeps the record, marked deleted, until the account has been told.** The engine removes it after the push.
- **A change made while a fetch is running wins.** `localChanges` counts play changes; if it moved during the fetch, what is on screen is written again with a later stamp and sent.

Replace the whole of `apps/web/src/store.ts` with:

```ts
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, normalisePlayItem,
  normaliseTurn, pools, rest, startTurn, togglePill, useSummary, type PlayItem, type Sheet,
  type TurnTiming, type ViewMode,
} from '@cw/rules';
import { create } from 'zustand';
import { CHARACTER_LIMIT, RemoteError, defaultRemote, type ImportResult, type Profile, type Remote } from './remote';
import { STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';
import { characterId, claimLocalCharacters, hasUnsynced, nextStamp, resetCursors, syncOnce } from './sync/engine';
import { createScheduler, type Scheduler } from './sync/scheduler';

export interface Undo {
  /** The play state to go back to. */
  state: PlayState;
  message: string;
}

/** Who is signed in on this device. The profile is null until the account has been asked once. */
export interface Session {
  userId: string;
  profile: Profile | null;
}

/**
 * `saved`: the account has everything. `waiting`: changes are still to be sent, or the account
 * cannot be reached. `signin`: the session has ended and the player must sign in again to sync.
 * `limit`: the account already holds ten characters, so one on this device cannot be sent.
 */
export type SyncState = 'saved' | 'waiting' | 'signin' | 'limit';

export interface AppStore {
  /** False until this device's own copy has been loaded. */
  ready: boolean;
  /** False when the device is not saving: IndexedDB is unavailable or a write failed. */
  persistent: boolean;
  /** Null when nobody is signed in on this device. */
  session: Session | null;
  syncState: SyncState;
  /** Every character on this device that is not deleted: the player's own and, for a table admin, everyone's. */
  characters: StoredCharacter[];
  /** The character on screen, its sheet and its play state. */
  openId: string | null;
  sheet: Sheet | null;
  play: PlayState;
  /** False while the open character's saved play state is still being read. Nothing can be changed until it is. */
  loaded: boolean;
  /** One step, held in memory only. */
  undo: Undo | null;

  /**
   * Loads this device's copy, then finds out who is signed in and syncs. `ready` turns true as
   * soon as the device's copy is loaded; the returned promise also waits for the account.
   * Tests pass a storage and a remote; the app lets both be chosen.
   */
  init(storage?: AppStorage, remote?: Remote): Promise<void>;
  signIn(): Promise<void>;
  /**
   * Signs out and removes this device's copy of everything. If changes are still waiting to sync
   * and `discard` is not true, it does nothing and resolves false.
   */
  signOut(discard?: boolean): Promise<boolean>;
  /** Asks the account for this user's profile, then syncs. */
  syncNow(): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  setApproved(userId: string, approved: boolean): Promise<void>;
  /** Fetches a character from D&D Beyond through the account. Never rejects. */
  importCharacter(ddbId: string): Promise<ImportResult>;
  /** False when the signed-in player already has ten characters. */
  canAddCharacter(): boolean;
  /**
   * Adds a character, or replaces the signed-in player's copy of the same D&D Beyond character.
   * `replaceId` re-imports that character in place, whoever owns it. Null if `raw` is not a
   * character, nobody is signed in, or the player already has ten.
   */
  saveImported(raw: unknown, replaceId?: string): Promise<StoredCharacter | null>;
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

const META_SESSION = 'session';

let storage: AppStorage = memoryStorage();
let remote: Remote | null = null;
let scheduler: Scheduler | null = null;
/** Counts local changes to play state, so a fetch can tell that one happened while it was running. */
let localChanges = 0;

/** One sheet per character: a re-import replaces it and a delete drops it. */
const sheetCache = new Map<string, { importedAt: string; sheet: Sheet }>();

/** The calculated sheet for a stored character. Converted from the raw JSON on first use. */
export function sheetFor(character: StoredCharacter): Sheet {
  const cached = sheetCache.get(character.id);
  if (cached && cached.importedAt === character.importedAt) return cached.sheet;
  const sheet = buildSheet(convertCharacter(character.rawJson));
  sheetCache.set(character.id, { importedAt: character.importedAt, sheet });
  return sheet;
}

/** How many sheets are cached. For tests. */
export const cachedSheetCount = (): number => sheetCache.size;

const playItem = (state: PlayState): PlayItem => ({ spent: state.spent, concentrationKey: state.concentrationKey });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const live = (all: StoredCharacter[]): StoredCharacter[] => all.filter((c) => !c.deleted);

/** A session as kept on the device, repaired where it is malformed. Null when there is none. */
function sessionFrom(value: unknown): Session | null {
  if (value === null || typeof value !== 'object') return null;
  const { userId, profile } = value as Record<string, unknown>;
  if (typeof userId !== 'string' || userId === '') return null;
  const p = profile !== null && typeof profile === 'object' ? (profile as Record<string, unknown>) : null;
  return {
    userId,
    profile: p && typeof p.displayName === 'string'
      ? { id: userId, displayName: p.displayName, approved: p.approved === true, isTableAdmin: p.isTableAdmin === true }
      : null,
  };
}

/** A character's saved play state, repaired where it is malformed. Empty when nothing is saved. */
async function loadPlay(id: string): Promise<PlayState> {
  const items = await storage.listItems(id);
  const data = (kind: 'play' | 'turn'): unknown =>
    items.find((item) => item.kind === kind && item.key === STATE_KEY && !item.deleted)?.data;
  return { ...normalisePlayItem(data('play')), turn: normaliseTurn(data('turn')) };
}

/**
 * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
 * An item is written only when it differs from `previous`, so flipping a pill does not touch the
 * synced item. Resolves true when the synced item was written.
 */
async function savePlay(id: string, next: PlayState, previous: PlayState | null): Promise<boolean> {
  const items = await storage.listItems(id);
  const stamp = (kind: 'play' | 'turn'): string =>
    nextStamp(items.find((item) => item.kind === kind && item.key === STATE_KEY)?.updatedAt);
  const playChanged = !previous || !same(playItem(next), playItem(previous));
  if (playChanged) {
    await storage.putItem({
      characterId: id, kind: 'play', key: STATE_KEY, data: playItem(next), updatedAt: stamp('play'), deleted: false, dirty: true,
    });
  }
  if (!previous || !same(next.turn, previous.turn)) {
    await storage.putItem({
      characterId: id, kind: 'turn', key: STATE_KEY, data: next.turn, updatedAt: stamp('turn'), deleted: false, dirty: false,
    });
  }
  return playChanged;
}

/**
 * A random version 4 UUID. Browsers offer `crypto.randomUUID` only on secure pages, so a phone
 * reaching the dev server over the local network builds one from random bytes instead.
 */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const closed = {
  openId: null as string | null,
  sheet: null as Sheet | null,
  play: emptyPlayState(),
  loaded: false,
  undo: null as Undo | null,
};

const initial = {
  ready: false,
  persistent: true,
  session: null as Session | null,
  syncState: 'saved' as SyncState,
  characters: [] as StoredCharacter[],
  ...closed,
};

export const useStore = create<AppStore>()((set, get) => {
  /** Runs a storage write. A failure turns on the "not saving" banner instead of breaking the app. */
  const save = async <T>(write: Promise<T>): Promise<T | undefined> => {
    try {
      return await write;
    } catch {
      set({ persistent: false });
      return undefined;
    }
  };

  /** Something on this device now differs from the account: say so, and sync soon. */
  const changedLocally = (): void => {
    if (get().syncState === 'saved') set({ syncState: 'waiting' });
    scheduler?.changed();
  };

  /** Applies a play change to the open character and saves it. */
  const change = (next: PlayState, undo: Undo | null): void => {
    const { openId, play, loaded } = get();
    if (openId === null || !loaded || next === play) return;
    localChanges += 1;
    set({ play: next, undo });
    void save(savePlay(openId, next, play)).then((synced) => {
      if (synced) changedLocally();
    });
  };

  /**
   * After a round with the account: show what the device now holds. `changed` are the characters
   * a fetch altered; `sent` is true when characters were waiting to be sent, whose records are
   * now marked clean.
   */
  const showSynced = async (changed: Set<string>, sent: boolean, changesBefore: number): Promise<void> => {
    if (changed.size === 0 && !sent) return;
    const characters = live(await storage.listCharacters());
    set({ characters });
    const { openId, play } = get();
    if (openId === null || !changed.has(openId)) return;
    const character = characters.find((c) => c.id === openId);
    if (!character) {
      // Deleted on another device.
      sheetCache.delete(openId);
      set({ ...closed });
      return;
    }
    const sheet = sheetFor(character);
    if (localChanges !== changesBefore) {
      // The player changed something while the fetch was running: what is on screen is the newest
      // copy. It is written again, stamped later than what was fetched, and sent.
      const kept = clampState(play, sheet);
      set({ sheet, play: kept });
      await save(savePlay(openId, kept, null));
      changedLocally();
      return;
    }
    const saved = await loadPlay(openId).catch(() => emptyPlayState());
    // The turn never syncs, so the one in memory is the newest.
    if (get().openId === openId) set({ sheet, play: { ...clampState(saved, sheet), turn: get().play.turn }, undo: null });
  };

  /** No longer a table admin: the other players' characters leave this device. */
  const dropOthers = async (userId: string): Promise<void> => {
    for (const character of await storage.listCharacters()) {
      if (character.ownerId === userId) continue;
      await storage.removeCharacter(character.id);
      sheetCache.delete(character.id);
      if (get().openId === character.id) set({ ...closed });
    }
    set({ characters: get().characters.filter((c) => c.ownerId === userId) });
  };

  /** One round with the account: who am I, then fetch and send. Never rejects. */
  const runSync = async (): Promise<void> => {
    const session = get().session;
    if (!session || !remote) return;
    try {
      const profile = await remote.profile();
      const before = session.profile;
      if (!same(profile, before)) {
        // What this user may see has changed: fetch from the beginning.
        if (profile?.approved !== before?.approved || profile?.isTableAdmin !== before?.isTableAdmin) await resetCursors(storage);
        if (before?.isTableAdmin && !profile?.isTableAdmin) await dropOthers(session.userId);
        const next = { userId: session.userId, profile };
        await save(storage.setMeta(META_SESSION, next));
        if (get().session?.userId === session.userId) set({ session: next });
      }
      if (!profile?.approved) return;
      const changesBefore = localChanges;
      const sent = get().characters.some((c) => c.dirty);
      const { changed, rejected } = await syncOnce({ storage, remote });
      if (get().session?.userId !== session.userId) return;
      await showSynced(changed, sent, changesBefore);
      const full = rejected.some((r) => r.reason === 'limit');
      set({ syncState: full ? 'limit' : (await hasUnsynced(storage)) ? 'waiting' : 'saved' });
    } catch (error) {
      if (get().session?.userId !== session.userId) return;
      set({ syncState: error instanceof RemoteError && error.kind === 'unauthorized' ? 'signin' : 'waiting' });
    }
  };

  /** The account says who is signed in: at start, after sign-in, and when a session ends. */
  const onUser = async (userId: string | null): Promise<void> => {
    let session = get().session;
    if (userId === null) {
      // The device believes someone is signed in but their session has ended. It keeps working
      // from its own copy; only signing in again will sync.
      if (session) set({ syncState: 'signin' });
      return;
    }
    if (session && session.userId !== userId) {
      // A different account on this device: the previous account's copy must not be shown to it.
      await save(storage.clear());
      sheetCache.clear();
      set({ characters: [], ...closed });
      session = null;
    }
    if (!session) {
      session = { userId, profile: null };
      await save(storage.setMeta(META_SESSION, session));
      set({ session });
    }
    await save(claimLocalCharacters(storage, userId));
    const characters = await storage.listCharacters().catch(() => [] as StoredCharacter[]);
    set({ characters: live(characters), syncState: 'waiting' });
    scheduler?.start();
    await scheduler?.now();
  };

  /** Calls to `onUser` run one after another, and `init` and `signIn` wait for them. */
  let userChanges: Promise<void> = Promise.resolve();
  /** The app's own start-up while it is running. */
  let starting: Promise<void> | null = null;

  const start = async (storageOverride?: AppStorage, remoteOverride?: Remote): Promise<void> => {
    scheduler?.stop();
    let persistent = true;
    if (storageOverride) storage = storageOverride;
    else ({ storage, persistent } = await openStorage());
    remote = remoteOverride ?? defaultRemote();
    let characters: StoredCharacter[] = [];
    let session: Session | null = null;
    try {
      session = sessionFrom(await storage.getMeta(META_SESSION));
      characters = live(await storage.listCharacters());
    } catch {
      persistent = false;
    }
    sheetCache.clear();
    localChanges = 0;
    scheduler = createScheduler(runSync);
    userChanges = Promise.resolve();
    // Ready now: a signed-in device opens from its own copy without waiting for the account.
    set({ ...initial, ready: true, persistent, session, characters, syncState: session ? 'waiting' : 'saved' });
    await remote
      .start((userId) => {
        userChanges = userChanges.then(() => onUser(userId)).catch(() => undefined);
      })
      .catch(() => undefined);
    await userChanges;
  };

  return {
    ...initial,

    async init(storageOverride, remoteOverride) {
      // In development React runs the app's start-up effect twice. A second start would reset
      // what the first has already put on screen, so it joins the first instead.
      const own = storageOverride === undefined && remoteOverride === undefined;
      if (own && starting) return starting;
      const run = start(storageOverride, remoteOverride);
      if (!own) return run;
      starting = run;
      try {
        await run;
      } finally {
        starting = null;
      }
    },

    async signIn() {
      await remote?.signIn();
      await userChanges;
    },

    async signOut(discard = false) {
      if (!get().session) return true;
      if (!discard) {
        await scheduler?.now();
        if (await hasUnsynced(storage).catch(() => false)) return false;
      }
      scheduler?.stop();
      const { persistent } = get();
      // Signed out on this device first, so the account's own "nobody is signed in" is not news.
      set({ ...initial, ready: true, persistent });
      sheetCache.clear();
      await save(storage.clear());
      await remote?.signOut().catch(() => undefined);
      await userChanges;
      return true;
    },

    async syncNow() {
      await scheduler?.now();
    },

    async listProfiles() {
      if (!remote) throw new RemoteError('unauthorized');
      return remote.listProfiles();
    },

    async setApproved(userId, approved) {
      if (!remote) throw new RemoteError('unauthorized');
      await remote.setApproved(userId, approved);
    },

    async importCharacter(ddbId) {
      return remote ? remote.importCharacter(ddbId) : { status: 'unreachable' };
    },

    canAddCharacter() {
      const { session, characters } = get();
      if (!session) return false;
      return characters.filter((c) => c.ownerId === session.userId).length < CHARACTER_LIMIT;
    },

    async saveImported(raw, replaceId) {
      const { session, characters } = get();
      if (!session) return null;
      const converted = convertCharacter(raw);
      if (converted.name === '' && converted.classes.length === 0) return null;
      const ddbId = String(converted.id);
      // An ID of 0 means the JSON had none, so it can never match a stored character.
      const id = replaceId ?? (ddbId === '0' ? newId() : characterId(ddbId, session.userId));
      const existing = characters.find((c) => c.id === id);
      if (replaceId !== undefined && !existing) return null;
      if (!existing && !get().canAddCharacter()) return null;
      const stamp = nextStamp(existing?.updatedAt);
      const record: StoredCharacter = {
        id,
        ownerId: existing?.ownerId ?? session.userId,
        ddbId,
        name: converted.name || 'Unnamed character',
        rawJson: raw,
        importedAt: stamp,
        updatedAt: stamp,
        deleted: false,
        dirty: true,
      };
      try {
        sheetFor(record);
      } catch {
        // Converted, but the sheet cannot be built from it: treat it as not a character.
        return null;
      }
      await save(storage.putCharacter(record));
      set({ characters: [...get().characters.filter((c) => c.id !== record.id), record] });
      if (existing) {
        // Re-import: what was spent stays spent, within the new maximums.
        if (get().openId === record.id) {
          // The open character's play state in memory is the newest copy.
          const sheet = sheetFor(record);
          const before = get().play;
          const play = clampState(before, sheet);
          set({ sheet, play, undo: null });
          await save(savePlay(record.id, play, before));
        } else {
          const saved = await loadPlay(record.id).catch(() => null);
          if (saved) await save(savePlay(record.id, clampState(saved, sheetFor(record)), saved));
        }
      }
      changedLocally();
      return record;
    },

    async remove(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) return;
      // The record stays, marked deleted, until the account has been told. Its items go now.
      const tombstone: StoredCharacter = {
        ...character, rawJson: null, deleted: true, dirty: true, updatedAt: nextStamp(character.updatedAt),
      };
      await save((async () => {
        await storage.removeCharacter(id);
        await storage.putCharacter(tombstone);
      })());
      sheetCache.delete(id);
      set({ characters: get().characters.filter((c) => c.id !== id) });
      if (get().openId === id) set({ ...closed });
      changedLocally();
    },

    async open(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) {
        set({ ...closed });
        return;
      }
      // Already open: the play state in memory is the newest copy, even if saving it failed.
      if (get().openId === id && get().sheet) return;
      let sheet: Sheet;
      try {
        sheet = sheetFor(character);
      } catch {
        // Stored, but no sheet can be built from it (a record damaged in the account, say).
        set({ ...closed });
        return;
      }
      set({ ...closed, openId: id, sheet });
      const saved = await loadPlay(id).catch(() => emptyPlayState());
      // Ignore the answer if the player has already moved to another character.
      if (get().openId === id) set({ play: clampState(saved, sheet), loaded: true });
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

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (748 tests in 34 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The store knows who is signed in and keeps the device and the account in step" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 9: Sign-in and waiting screens, and the shell that chooses between them

A device with nobody signed in shows only the sign-in screen and About. A signed-in player who is not approved sees only the waiting screen (spec sections 10.5 and 11). The router gains the Players route and encodes character IDs, which now contain the owner's ID.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify (test): `apps/web/src/router.test.ts`
- Modify: `apps/web/src/router.ts`
- Create: `apps/web/src/screens/SignIn.tsx`
- Create: `apps/web/src/screens/Waiting.tsx`
- Create (test): `apps/web/src/screens/auth.test.tsx`
- Modify (test): `apps/web/src/screens/screens.test.tsx`

**Interfaces:**
- Consumes:
  - Store: `session`, `signIn()`, `signOut(discard?)`, `syncNow()` (Task 8).
  - `hasAccount(env)` from `apps/web/src/remote` (Task 7).
  - Test helpers and `memoryServer` (Tasks 3 and 8); `renderAt(route)` from `apps/web/src/test/render.tsx`.
- Produces:
  - `Route` gains `{ name: 'players' }` at `#/players`. `routeHref` percent-encodes a character ID and `parseRoute` decodes it; an ID that cannot be decoded is the home route.
  - `SignInScreen({ local?: boolean })` in `apps/web/src/screens/SignIn.tsx`; `local` defaults to `!hasAccount(import.meta.env)`.
  - `WaitingScreen()` in `apps/web/src/screens/Waiting.tsx`.
  - `App` shows, in this order: About for the about route; `SignInScreen` when there is no session; `WaitingScreen` when the profile is unknown or not approved; otherwise the screen for the route.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/web/src/router.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './router';

describe('parseRoute', () => {
  it('reads each screen from the hash', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/about')).toEqual({ name: 'about' });
    expect(parseRoute('#/players')).toEqual({ name: 'players' });
    expect(parseRoute('#/c/abc-123/combat')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/explore')).toEqual({ name: 'character', id: 'abc-123', view: 'explore' });
  });

  it('opens Combat when the view is missing or unknown', () => {
    expect(parseRoute('#/c/abc-123')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
    expect(parseRoute('#/c/abc-123/nonsense')).toEqual({ name: 'character', id: 'abc-123', view: 'combat' });
  });

  it('sends anything else home', () => {
    for (const hash of ['#/nowhere', '#/c', '#/c/', '#/import/extra', '#/about/extra', '#/players/extra']) {
      expect(parseRoute(hash)).toEqual({ name: 'home' });
    }
  });

  it('decodes the character ID', () => {
    expect(parseRoute('#/c/a%2Fb%25c/explore')).toEqual({ name: 'character', id: 'a/b%c', view: 'explore' });
  });

  it('goes home when the character ID cannot be decoded', () => {
    expect(parseRoute('#/c/%E0%A4%A/combat')).toEqual({ name: 'home' });
    expect(parseRoute('#/c/100%/combat')).toEqual({ name: 'home' });
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { name: 'home' }, { name: 'import' }, { name: 'about' }, { name: 'players' },
      { name: 'character', id: 'abc-123', view: 'combat' },
      { name: 'character', id: 'abc-123', view: 'explore' },
      { name: 'character', id: 'ddb-42-00000000-0000-4000-8000-00000000000a', view: 'combat' },
      { name: 'character', id: 'a/b%c d#e?f', view: 'explore' },
    ];
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('percent-encodes the character ID, so it stays one part of the address', () => {
    expect(routeHref({ name: 'character', id: 'a/b%c', view: 'combat' })).toBe('#/c/a%2Fb%25c/combat');
    expect(routeHref({ name: 'character', id: 'ddb-42-00000000-0000-4000-8000-00000000000a', view: 'combat' }))
      .toBe('#/c/ddb-42-00000000-0000-4000-8000-00000000000a/combat');
    expect(routeHref({ name: 'players' })).toBe('#/players');
  });
});
```

Create `apps/web/src/screens/auth.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import { memoryServer, type MemoryServer } from '../remote/memory';
import type { Remote } from '../remote/types';
import type { Route } from '../router';
import { memoryStorage, type AppStorage } from '../storage';
import { useStore } from '../store';
import { renderAt } from '../test/render';
import { SignInScreen } from './SignIn';

const state = () => useStore.getState();

const DM = 'user-dm';
const NEW = 'user-new';
const TESTER = { id: 'user-dev', displayName: 'Test player' };

/** A device where nobody is signed in, whose sign-in button signs in the test player. */
async function signedOutApp(wrap: (remote: Remote) => Remote = (remote) => remote): Promise<void> {
  await state().init(memoryStorage(), wrap(memoryServer().remote({ signInAs: TESTER })));
}

/** An account with a table admin, and Nell, who has signed in but is not approved. */
function tableWithNewPlayer(): MemoryServer {
  const server = memoryServer();
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  server.addUser(NEW, 'Nell');
  return server;
}

/** A device signed in as Nell. */
async function waitingApp(server: MemoryServer = tableWithNewPlayer(), storage: AppStorage = memoryStorage()): Promise<MemoryServer> {
  await state().init(storage, server.remote({ userId: NEW }));
  return server;
}

const signInButton = () => screen.queryByRole('button', { name: /^Continue/ });

describe('Sign-in screen', () => {
  it.each<[string, Route]>([
    ['home', { name: 'home' }],
    ['import', { name: 'import' }],
    ['players', { name: 'players' }],
    ['a character', { name: 'character', id: 'ddb-1-user-dev', view: 'combat' }],
  ])('is all a signed-out device shows at the %s route', async (_name, route) => {
    await signedOutApp();
    renderAt(route);
    expect(screen.getByRole('heading', { level: 1, name: 'Character Wizard' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to see your characters on any device.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled();
    expect(screen.getByText('Local development: no account is used.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About and credits' })).toHaveAttribute('href', '#/about');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('leaves About open to a signed-out device', async () => {
    await signedOutApp();
    renderAt({ name: 'about' });
    expect(screen.getByRole('heading', { name: 'About Character Wizard' })).toBeInTheDocument();
    expect(signInButton()).toBeNull();
  });

  it('signs in as the test player and shows their characters', async () => {
    await signedOutApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
    expect(signInButton()).toBeNull();
    expect(state().session?.profile).toMatchObject({ displayName: 'Test player', approved: true });
  });

  it('turns the button off while signing in', async () => {
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    await signedOutApp((remote) => ({ ...remote, signIn: () => held.then(() => remote.signIn()) }));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
  });

  it('turns the button back on when signing in fails', async () => {
    await signedOutApp((remote) => ({ ...remote, signIn: () => Promise.reject(new Error('no popup')) }));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue as test player' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue as test player' })).toBeEnabled());
  });

  it('offers Discord when the build has an account to talk to', async () => {
    await signedOutApp();
    render(<SignInScreen local={false} />);
    expect(screen.getByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as test player' })).toBeNull();
    expect(screen.queryByText('Local development: no account is used.')).toBeNull();
  });
});

describe('Waiting screen', () => {
  it.each<[string, Route]>([
    ['home', { name: 'home' }],
    ['import', { name: 'import' }],
    ['players', { name: 'players' }],
    ['a character', { name: 'character', id: `ddb-1-${NEW}`, view: 'combat' }],
  ])('is all an unapproved player sees at the %s route, and names their account', async (_name, route) => {
    await waitingApp();
    renderAt(route);
    expect(screen.getByRole('heading', { level: 1, name: 'Waiting for your DM to approve you' })).toBeInTheDocument();
    expect(screen.getByText('Signed in as Nell.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Check again', 'Sign out']);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves About open to an unapproved player', async () => {
    await waitingApp();
    renderAt({ name: 'about' });
    expect(screen.getByRole('heading', { name: 'About Character Wizard' })).toBeInTheDocument();
  });

  it('shows the characters once the table admin has approved and the player checks again', async () => {
    const server = await waitingApp();
    renderAt({ name: 'home' });
    await server.remote({ userId: DM }).setApproved(NEW, true);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
    expect(screen.queryByText('Still waiting.')).toBeNull();
  });

  it('says it is still waiting when the player checks again and is not approved', async () => {
    await waitingApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Still waiting.');
    expect(screen.getByRole('heading', { name: 'Waiting for your DM to approve you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('says the same when the account cannot be reached, since it cannot tell which it is', async () => {
    const server = await waitingApp();
    renderAt({ name: 'home' });
    server.offline = true;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Still waiting.');
  });

  it('asks before signing out when this device holds a character the account has never been sent', async () => {
    const storage = memoryStorage();
    // Imported before accounts existed. An unapproved player cannot send it.
    await storage.putCharacter({
      id: 'local-1', ownerId: null, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
    });
    await waitingApp(tableWithNewPlayer(), storage);
    renderAt({ name: 'home' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Some changes haven't synced yet. Sign out and discard them?"));
    expect(state().session?.userId).toBe(NEW);
    expect(await storage.listCharacters()).toHaveLength(1);
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(await storage.listCharacters()).toEqual([]);
    confirm.mockRestore();
  });

  it('goes back to sign-in when the player signs out', async () => {
    const storage = memoryStorage();
    await waitingApp(tableWithNewPlayer(), storage);
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(signInButton()).toBeInTheDocument();
    expect(state().session).toBeNull();
    expect(await storage.getMeta('session')).toBeNull();
  });
});

describe('Waiting screen before the account has answered', () => {
  /** A device that remembers who signed in but has never learned their profile, with no connection. */
  async function uncheckedApp(): Promise<{ server: MemoryServer; storage: AppStorage }> {
    const server = tableWithNewPlayer();
    server.addUser(NEW, 'Nell', { approved: true });
    server.offline = true;
    const storage = memoryStorage();
    await storage.setMeta('session', { userId: NEW, profile: null });
    await state().init(storage, server.remote({ userId: NEW }));
    return { server, storage };
  }

  it('says it is checking and that it needs a connection', async () => {
    await uncheckedApp();
    renderAt({ name: 'home' });
    expect(screen.getByRole('heading', { level: 1, name: 'Checking your account' })).toBeInTheDocument();
    expect(screen.getByText('This needs a connection.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Try again', 'Sign out']);
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  it('stays there when trying again still gets no answer', async () => {
    await uncheckedApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Checking your account' })).toBeInTheDocument();
    expect(screen.queryByText('Still waiting.')).toBeNull();
  });

  it('shows the characters when trying again reaches the account', async () => {
    const { server } = await uncheckedApp();
    renderAt({ name: 'home' });
    server.offline = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Your characters' })).toBeInTheDocument();
  });

  it('goes back to sign-in when the player signs out', async () => {
    const { storage } = await uncheckedApp();
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Character Wizard' })).toBeInTheDocument();
    expect(state().session).toBeNull();
    expect(await storage.getMeta('session')).toBeNull();
  });
});
```

Apply this change to `apps/web/src/screens/screens.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -275,10 +275,12 @@ describe('App', () => {
     consoleError.mockRestore();
   });
 
-  it('loads stored characters by itself on a fresh start', async () => {
-    useStore.setState({ ready: false, characters: [] });
+  it('loads the device and the account by itself on a fresh start, and asks for sign-in', async () => {
+    useStore.setState({ ready: false, session: null, characters: [] });
     renderAt({ name: 'home' });
     expect(screen.getByText('Loading…')).toBeInTheDocument();
+    // No Supabase project is configured under test, so the app chooses the local stand-in account.
+    await userEvent.click(await screen.findByRole('button', { name: 'Continue as test player' }));
     expect(await screen.findByText('Add your first character')).toBeInTheDocument();
     expect(useStore.getState().persistent).toBe(true);
   });
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/router.test.ts apps/web/src/screens/auth.test.tsx apps/web/src/screens/screens.test.tsx
```

Expected: FAIL. `./SignIn` cannot be found, and the router has no `players` route.

- [ ] **Step 3: Write the implementation**

"Sign out" on the waiting screen asks before it discards anything. A device used before accounts existed may hold characters that an unapproved player has no way to send.

The waiting screen says "Still waiting." after "Check again" whether the player is not approved or the account could not be reached, because it cannot tell which.

One existing test changes on purpose: "loads stored characters by itself on a fresh start" in `screens.test.tsx` now signs in first, because a fresh start lands on the sign-in screen.

Replace the whole of `apps/web/src/App.tsx` with:

```tsx
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { routeHref, useRoute } from './router';
import { AboutScreen } from './screens/About';
import { CharacterScreen } from './screens/Character';
import { HomeScreen } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { SignInScreen } from './screens/SignIn';
import { WaitingScreen } from './screens/Waiting';
import { useStore } from './store';

/** Catches a crash in any screen. Stored characters and play state are not touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Going to another screen tries again. */
  private readonly reset = (): void => {
    if (this.state.failed) this.setState({ failed: false });
  };

  componentDidMount(): void {
    window.addEventListener('hashchange', this.reset);
  }

  componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.reset);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md p-4">
        <p className="font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-slate-600">Your saved characters are safe.</p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white"
          >
            Reload
          </button>
          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-indigo-700">
            Back to your characters
          </a>
        </div>
      </main>
    );
  }
}

/** About is open to everyone. Every other screen needs a signed-in, approved player. */
function Screen() {
  const route = useRoute();
  const session = useStore((s) => s.session);
  if (route.name === 'about') return <AboutScreen />;
  if (!session) return <SignInScreen />;
  if (!session.profile?.approved) return <WaitingScreen />;
  switch (route.name) {
    case 'import': return <ImportScreen />;
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

Replace the whole of `apps/web/src/router.ts` with:

```ts
import { useSyncExternalStore } from 'react';

export type View = 'combat' | 'explore';

export type Route =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'about' }
  | { name: 'players' }
  | { name: 'character'; id: string; view: View };

/** A percent-encoded part of the address, decoded. Null when it is not validly encoded. */
function decoded(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** "#/c/<id>/explore" and friends. Anything unrecognised is the home screen. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter((part) => part !== '');
  if (parts[0] === 'import' && parts.length === 1) return { name: 'import' };
  if (parts[0] === 'about' && parts.length === 1) return { name: 'about' };
  if (parts[0] === 'players' && parts.length === 1) return { name: 'players' };
  if (parts[0] === 'c' && parts[1]) {
    const id = decoded(parts[1]);
    if (id !== null) return { name: 'character', id, view: parts[2] === 'explore' ? 'explore' : 'combat' };
  }
  return { name: 'home' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'import': return '#/import';
    case 'about': return '#/about';
    case 'players': return '#/players';
    // Encoded, so that an ID containing "/" or "%" stays one part of the address.
    case 'character': return `#/c/${encodeURIComponent(route.id)}/${route.view}`;
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

Create `apps/web/src/screens/SignIn.tsx`:

```tsx
import { useState } from 'react';
import { hasAccount } from '../remote';
import { routeHref } from '../router';
import { useStore } from '../store';

/**
 * All that a device shows while nobody is signed in on it. `local` is true for a build with no
 * account to talk to (local development), where the button signs in a stand-in player.
 */
export function SignInScreen({ local = !hasAccount(import.meta.env) }: { local?: boolean }) {
  const signIn = useStore((s) => s.signIn);
  const [busy, setBusy] = useState(false);

  async function start(): Promise<void> {
    setBusy(true);
    try {
      await signIn();
    } catch {
      // Nothing was signed in: the button comes back so the player can try again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mt-6 text-xl font-semibold">Character Wizard</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to see your characters on any device.</p>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="mt-6 min-h-11 w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {local ? 'Continue as test player' : 'Continue with Discord'}
      </button>
      {local ? <p className="mt-2 text-center text-xs text-slate-600">Local development: no account is used.</p> : null}
      <p className="mt-6 text-center text-sm">
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
      </p>
    </main>
  );
}
```

Create `apps/web/src/screens/Waiting.tsx`:

```tsx
import { useState } from 'react';
import { useStore } from '../store';

const PRIMARY = 'min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60';
const SECONDARY = 'min-h-11 rounded-lg border border-slate-300 px-4 py-2';

/**
 * All that a signed-in player sees until a table admin has approved them, or, before that, until
 * the account has said who they are.
 */
export function WaitingScreen() {
  const profile = useStore((s) => s.session?.profile ?? null);
  const syncNow = useStore((s) => s.syncNow);
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setChecked(false);
    await syncNow();
    setBusy(false);
    setChecked(true);
  }

  // A device used before accounts existed may hold characters the account has never been sent,
  // and an unapproved player cannot send them. Signing out would remove them, so it asks first.
  async function leaveNow(): Promise<void> {
    if (await signOut()) return;
    if (window.confirm("Some changes haven't synced yet. Sign out and discard them?")) await signOut(true);
  }

  const leave = (
    <button type="button" onClick={() => void leaveNow()} className={SECONDARY}>Sign out</button>
  );

  if (!profile) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="mt-6 text-xl font-semibold">Checking your account</h1>
        <p className="mt-2 text-sm text-slate-600">This needs a connection.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => void check()} disabled={busy} className={PRIMARY}>Try again</button>
          {leave}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mt-6 text-xl font-semibold">Waiting for your DM to approve you</h1>
      <p className="mt-2 text-sm text-slate-600">Signed in as {profile.displayName}.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => void check()} disabled={busy} className={PRIMARY}>Check again</button>
        {leave}
      </div>
      {checked && !busy ? <p role="status" className="mt-3 text-sm text-slate-700">Still waiting.</p> : null}
    </main>
  );
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (774 tests in 35 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Sign-in and waiting screens, and the shell that chooses between them" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 10: Home shows the table and the sync state; Players approves and removes access

The character list becomes account-aware (spec section 10.5): a player sees their own characters, a table admin also sees everyone else's under "Table", one line says whether the account has everything, and "Sign out" asks before discarding unsynced changes. The Players screen is where a table admin approves players and removes access.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/screens/About.tsx`
- Modify: `apps/web/src/screens/Home.tsx`
- Create: `apps/web/src/screens/Players.tsx`
- Create (test): `apps/web/src/screens/home.test.tsx`
- Create (test): `apps/web/src/screens/players.test.tsx`
- Modify (test): `apps/web/src/screens/screens.test.tsx`
- Modify (test): `apps/web/src/test/helpers.ts`

**Interfaces:**
- Consumes:
  - Store: `session`, `syncState`, `characters`, `importCharacter(ddbId)`, `saveImported(raw, replaceId?)`, `remove(id)`, `signIn()`, `signOut(discard?)`, `listProfiles()`, `setApproved(userId, approved)` (Task 8).
  - `IMPORT_MESSAGES` from `apps/web/src/import/client.ts` (Task 6); the `players` route (Task 9).
- Produces:
  - `HomeScreen()` with a "Table" section for a table admin, a sync line (`role="status"`), "Sign out", and a "Players" link for a table admin.
  - `PlayersScreen()` in `apps/web/src/screens/Players.tsx`, shown for the `players` route.
  - Test helper `testServer(options?: MemoryServerOptions)` now passes its options through, so a test can give the account an `importer`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/screens/home.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { loadRaw } from '../../../../test-utils/fixtures';
import type { MemoryServer, MemoryServerOptions } from '../remote/memory';
import { CHARACTER_LIMIT, RemoteError, type ImportResult, type Remote } from '../remote/types';
import { memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';
import { syncOnce } from '../sync/engine';
import { TEST_USER, rawWithId, seed, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

const state = () => useStore.getState();

const DM = 'user-dm';
const OTHER = 'user-other';

const stored = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter => ({
  id, ownerId: TEST_USER, ddbId: '1', name: 'Vlad', rawJson: loadRaw('vlad'),
  importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true, ...over,
});

const minkis = (id: string, over: Partial<StoredCharacter> = {}): StoredCharacter =>
  stored(id, { ddbId: '2', name: 'Minkis', rawJson: rawWithId('minkis', 2), ...over });

/** Puts characters into the account as their owner would, from a device of the owner's. */
async function accountHas(server: MemoryServer, userId: string, ...records: StoredCharacter[]): Promise<void> {
  const device = { storage: memoryStorage(), remote: server.remote({ userId }) };
  for (const record of records) await device.storage.putCharacter(record);
  await syncOnce(device);
}

/** An account with a table admin, Dee, and the test player, Tess, who owns Vlad. */
async function table(options?: MemoryServerOptions): Promise<MemoryServer> {
  const server = testServer(options);
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  await accountHas(server, TEST_USER, stored('ddb-1-user-test'));
  return server;
}

/** A device signed in as the table admin. */
async function asAdmin(server: MemoryServer, wrap: (remote: Remote) => Remote = (remote) => remote): Promise<void> {
  await state().init(memoryStorage(), wrap(server.remote({ userId: DM })));
}

const tableSection = () => screen.getByRole('region', { name: 'Table' });

describe('Home: whose characters are listed', () => {
  it('lists only the signed-in player\'s own under "Your characters"', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-1-user-test', { dirty: false }));
    await storage.putCharacter(minkis(`ddb-2-${OTHER}`, { ownerId: OTHER, dirty: false }));
    await state().init(storage, testRemote());
    expect(state().characters).toHaveLength(2);
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Minkis/ })).toBeNull();
  });

  it('shows a player no Table section and no link to Players', async () => {
    const storage = memoryStorage();
    await storage.putCharacter(minkis(`ddb-2-${OTHER}`, { ownerId: OTHER, dirty: false }));
    const remote = testRemote();
    const listProfiles = vi.spyOn(remote, 'listProfiles');
    await seed('vlad', storage, remote);
    renderAt({ name: 'home' });
    expect(screen.queryByRole('region', { name: 'Table' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Table' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Players' })).toBeNull();
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('shows a table admin another player\'s character under Table, with the owner\'s name', async () => {
    await asAdmin(await table());
    await state().saveImported(rawWithId('minkis', 2));
    renderAt({ name: 'home' });
    expect(within(tableSection()).getByRole('heading', { level: 2, name: 'Table' })).toBeInTheDocument();
    const theirs = within(tableSection()).getByRole('link', { name: /Vlad/ });
    expect(theirs).toHaveAttribute('href', '#/c/ddb-1-user-test/combat');
    expect(await within(theirs).findByText('Warlock 3 · Tess')).toBeInTheDocument();
    expect(theirs).not.toHaveTextContent('Imported');

    // The admin's own character stays under "Your characters", with its import date.
    expect(within(tableSection()).queryByRole('link', { name: /Minkis/ })).toBeNull();
    const own = screen.getByRole('link', { name: /Minkis/ });
    expect(own).toHaveTextContent('Wizard 3 · Imported');
    expect(own).not.toHaveTextContent('Dee');
  });

  it('sorts the table by character name', async () => {
    const server = await table();
    server.addUser(OTHER, 'Otto', { approved: true });
    await accountHas(server, OTHER, minkis(`ddb-2-${OTHER}`, { ownerId: OTHER }));
    await asAdmin(server);
    expect(state().characters.map((c) => c.name)).toEqual(['Vlad', 'Minkis']);
    renderAt({ name: 'home' });
    await within(tableSection()).findByText('Wizard 3 · Otto');
    const names = within(tableSection()).getAllByRole('link').map((link) => link.firstElementChild?.textContent);
    expect(names).toEqual(['Minkis', 'Vlad']);
  });

  it.each<[string, () => Promise<never[]>]>([
    ['the players cannot be loaded', () => Promise.reject(new RemoteError('offline'))],
    ['the owner is not among the players', async () => []],
  ])('leaves the owner\'s name out when %s', async (_name, answer) => {
    const listProfiles = vi.fn(answer);
    await asAdmin(await table(), (remote) => ({ ...remote, listProfiles }));
    renderAt({ name: 'home' });
    await waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1));
    const theirs = within(tableSection()).getByRole('link', { name: /Vlad/ });
    expect(within(theirs).getByText('Warlock 3')).toBeInTheDocument();
  });

  it('asks for the players once, however often the screen re-renders', async () => {
    const server = await table();
    let listProfiles = vi.fn<Remote['listProfiles']>();
    await asAdmin(server, (remote) => {
      listProfiles = vi.fn(() => remote.listProfiles());
      return { ...remote, listProfiles };
    });
    renderAt({ name: 'home' });
    await within(tableSection()).findByText('Warlock 3 · Tess');
    await state().saveImported(rawWithId('minkis', 2));
    expect(await screen.findByRole('link', { name: /Minkis/ })).toBeInTheDocument();
    expect(listProfiles).toHaveBeenCalledTimes(1);
  });

  it('gives a table admin with nobody else\'s characters no Table section, and a link to Players', async () => {
    const server = testServer();
    server.addUser(DM, 'Dee', { approved: true, admin: true });
    await asAdmin(server);
    await state().saveImported(loadRaw('vlad'));
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Table' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Players' })).toHaveAttribute('href', '#/players');
  });

  it('still invites a table admin with no characters of their own to add one', async () => {
    await asAdmin(await table());
    renderAt({ name: 'home' });
    expect(screen.getByText('Add your first character')).toBeInTheDocument();
    expect(within(tableSection()).getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
  });
});

describe('Home: re-import and delete', () => {
  it('re-imports a table character through the account and keeps its owner', async () => {
    const importer = vi.fn(async (_ddbId: string): Promise<ImportResult> => ({ status: 'ok', raw: loadRaw('vlad') }));
    const server = await table({ importer });
    await asAdmin(server);
    renderAt({ name: 'home' });
    await userEvent.click(within(tableSection()).getByRole('button', { name: 'Re-import' }));
    expect(await within(tableSection()).findByText('Updated from D&D Beyond.')).toBeInTheDocument();
    expect(importer.mock.calls).toEqual([['1']]);
    expect(state().characters).toMatchObject([{ id: 'ddb-1-user-test', ownerId: TEST_USER, dirty: true }]);
    expect(state().characters).toHaveLength(1);

    await state().syncNow();
    const [theirs, ...rest] = await testRemote(server).pullCharacters(0);
    expect(rest).toEqual([]);
    expect(theirs).toMatchObject({ id: 'ddb-1-user-test', ownerId: TEST_USER, deleted: false });
    expect(theirs.importedAt).not.toBe('2026-01-01T10:00:00.000Z');
  });

  it.each<[Exclude<ImportResult['status'], 'ok'>, string]>([
    ['unauthorized', 'Your sign-in has expired. Sign in again, then retry. Your saved copy still works.'],
    ['not-approved', "Your DM hasn't approved your account yet. Your saved copy still works."],
    ['rate-limited', 'Too many imports. Try again in an hour. Your saved copy still works.'],
    ['unreachable', "Couldn't reach the import service. Your saved copy still works."],
  ])('explains a re-import the account answers with %s, and keeps the saved copy', async (status, message) => {
    const record = await seed('vlad', memoryStorage(), testRemote(testServer({ importer: async () => ({ status }) })));
    renderAt({ name: 'home' });
    await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    expect(await screen.findByText(message)).toHaveAttribute('role', 'status');
    expect(state().characters).toEqual([record]);
    expect(screen.getByRole('button', { name: 'Re-import' })).toBeEnabled();
  });

  it('offers no re-import for a character that has no D&D Beyond ID', async () => {
    await state().init(memoryStorage(), testRemote());
    const record = await state().saveImported(rawWithId('vlad', 0));
    expect(record?.ddbId).toBe('0');
    renderAt({ name: 'home' });
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-import' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('says that deleting removes the character from the account and from every device', async () => {
    await seed('vlad');
    renderAt({ name: 'home' });
    const confirm = vi.fn((_message?: string) => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm.mock.calls).toEqual([
      ["Delete Vlad? It will be removed from the account and from every device. This can't be undone."],
    ]);
    expect(state().characters).toHaveLength(1);
  });
});

describe('Home: the sync line', () => {
  const syncLine = (text: string) => {
    const line = screen.getByText(text);
    expect(line).toHaveAttribute('role', 'status');
    return line;
  };

  it('says "Saved to your account" once the account has everything', async () => {
    await seed('vlad');
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Saved to your account');
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('says "Waiting to sync" while a change has not reached the account, and catches up', async () => {
    const server = testServer();
    await seed('vlad', memoryStorage(), testRemote(server));
    server.offline = true;
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Waiting to sync');
    server.offline = false;
    await state().syncNow();
    expect(await screen.findByText('Saved to your account')).toBeInTheDocument();
    expect(screen.queryByText('Waiting to sync')).toBeNull();
  });

  it('says "Sign in again to sync" when the session has ended, with a button that signs in', async () => {
    const remote = testServer().remote({ userId: TEST_USER, signInAs: { id: TEST_USER, displayName: 'Tess' } });
    await seed('vlad', memoryStorage(), remote);
    await remote.signOut();
    await state().syncNow();
    renderAt({ name: 'home' });
    syncLine('Sign in again to sync');
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Saved to your account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('says so when the account is full and a character here cannot be sent', async () => {
    const server = testServer();
    const records: StoredCharacter[] = [];
    for (let i = 1; i <= CHARACTER_LIMIT; i += 1) records.push(stored(`ddb-${i}-user-test`, { ddbId: String(i) }));
    await accountHas(server, TEST_USER, ...records);
    const storage = memoryStorage();
    await storage.putCharacter(stored('ddb-99-user-test', { ddbId: '99' }));
    await storage.setMeta('session', { userId: TEST_USER, profile: { displayName: 'Tess', approved: true, isTableAdmin: false } });
    await storage.setMeta('cursor:characters', 1_000_000);
    await state().init(storage, testRemote(server));
    renderAt({ name: 'home' });
    syncLine('Your account has ten characters. Delete one so the rest can sync.');
  });
});

describe('Home: signing out', () => {
  const signedOut = () => screen.findByRole('button', { name: 'Continue as test player' });

  async function seeded(): Promise<{ server: MemoryServer; storage: AppStorage }> {
    const server = testServer();
    const storage = memoryStorage();
    await seed('vlad', storage, testRemote(server));
    return { server, storage };
  }

  it('sends what is waiting, then signs out without asking', async () => {
    const { server, storage } = await seeded();
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await signedOut()).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(state().session).toBeNull();
    expect(await storage.listCharacters()).toEqual([]);
    expect((await testRemote(server).pullCharacters(0)).map((c) => c.name)).toEqual(['Vlad']);
  });

  it('asks before discarding changes that cannot be sent, and stays signed in on "no"', async () => {
    const { server, storage } = await seeded();
    server.offline = true;
    renderAt({ name: 'home' });
    const confirm = vi.fn((_message?: string) => false);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]).toEqual(["Some changes haven't synced yet. Sign out and discard them?"]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
    expect(state().session?.userId).toBe(TEST_USER);
    expect(screen.getByRole('link', { name: /Vlad/ })).toBeInTheDocument();
    expect(await storage.listCharacters()).toHaveLength(1);
  });

  it('discards them and signs out on "yes"', async () => {
    const { server, storage } = await seeded();
    server.offline = true;
    renderAt({ name: 'home' });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await signedOut()).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ session: null, characters: [] });
    expect(await storage.listCharacters()).toEqual([]);
    server.offline = false;
    expect(await testRemote(server).pullCharacters(0)).toEqual([]);
  });
});
```

Create `apps/web/src/screens/players.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryServer } from '../remote/memory';
import { RemoteError, type Profile, type Remote } from '../remote/types';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { TEST_USER, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

const state = () => useStore.getState();

const DM = 'user-dm';
const NEW = 'user-new';

/** An account with a table admin (Dee), an approved player (Tess) and one who is waiting (Nell). */
function table(): MemoryServer {
  const server = testServer();
  server.addUser(DM, 'Dee', { approved: true, admin: true });
  server.addUser(NEW, 'Nell');
  return server;
}

/** The Players screen on a device signed in as the table admin. */
async function playersAsAdmin(server: MemoryServer = table(), wrap: (remote: Remote) => Remote = (remote) => remote): Promise<MemoryServer> {
  await state().init(memoryStorage(), wrap(server.remote({ userId: DM })));
  renderAt({ name: 'players' });
  return server;
}

const waiting = () => screen.findByRole('region', { name: 'Waiting for approval' });
const approved = () => screen.findByRole('region', { name: 'Approved' });
const approvedOnAccount = async (server: MemoryServer, id: string): Promise<boolean | undefined> =>
  (await server.remote({ userId: DM }).listProfiles()).find((p) => p.id === id)?.approved;

describe('Players screen', () => {
  it('is not for a player who is not the table admin', async () => {
    const remote = testRemote();
    const listProfiles = vi.spyOn(remote, 'listProfiles');
    await state().init(memoryStorage(), remote);
    renderAt({ name: 'players' });
    expect(screen.getByText('Only the table admin can manage players.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
    expect(screen.queryByRole('heading', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('lists the people waiting, each with Approve, and the approved, each with Remove access', async () => {
    await playersAsAdmin();
    expect(screen.getByRole('heading', { level: 1, name: 'Players' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '‹ Characters' })).toHaveAttribute('href', '#/');

    const waitingSection = await waiting();
    expect(within(waitingSection).getByRole('heading', { level: 2, name: 'Waiting for approval' })).toBeInTheDocument();
    expect(within(waitingSection).getAllByRole('listitem')).toHaveLength(1);
    expect(within(waitingSection).getByRole('listitem')).toHaveTextContent('Nell');
    expect(within(waitingSection).getByRole('button', { name: 'Approve Nell' })).toHaveTextContent(/^Approve$/);

    const approvedSection = await approved();
    expect(within(approvedSection).getByRole('heading', { level: 2, name: 'Approved' })).toBeInTheDocument();
    expect(within(approvedSection).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['DeeYou', 'TessRemove access']);
    expect(within(approvedSection).getByRole('button', { name: 'Remove access for Tess' })).toHaveTextContent(/^Remove access$/);
  });

  it('gives the admin\'s own row "You" and no button', async () => {
    await playersAsAdmin();
    const own = within(await approved()).getAllByRole('listitem')[0];
    expect(own).toHaveTextContent('Dee');
    expect(within(own).getByText('You')).toBeInTheDocument();
    expect(within(own).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /Dee/ })).toBeNull();
  });

  it('says "Loading…" until the players arrive', async () => {
    let arrive: (profiles: Profile[]) => void = () => undefined;
    const held = new Promise<Profile[]>((resolve) => { arrive = resolve; });
    await playersAsAdmin(table(), (remote) => ({ ...remote, listProfiles: () => held }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    arrive([{ id: DM, displayName: 'Dee', approved: true, isTableAdmin: true }]);
    expect(await approved()).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('says "Nobody is waiting." when nobody is', async () => {
    const server = table();
    server.addUser(NEW, 'Nell', { approved: true });
    await playersAsAdmin(server);
    expect(within(await waiting()).getByText('Nobody is waiting.')).toBeInTheDocument();
    expect(within(await waiting()).queryByRole('button')).toBeNull();
  });

  it('approves a waiting player and loads the list again', async () => {
    let listProfiles = vi.fn<Remote['listProfiles']>();
    const server = await playersAsAdmin(table(), (remote) => {
      listProfiles = vi.fn(() => remote.listProfiles());
      return { ...remote, listProfiles };
    });
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await within(await approved()).findByRole('button', { name: 'Remove access for Nell' })).toBeInTheDocument();
    expect(within(await waiting()).getByText('Nobody is waiting.')).toBeInTheDocument();
    expect(await approvedOnAccount(server, NEW)).toBe(true);
    expect(listProfiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes an approved player\'s access and loads the list again', async () => {
    const server = await playersAsAdmin();
    await userEvent.click(within(await approved()).getByRole('button', { name: 'Remove access for Tess' }));
    expect(await within(await waiting()).findByRole('button', { name: 'Approve Tess' })).toBeInTheDocument();
    expect(within(await approved()).queryByRole('button')).toBeNull();
    expect(await approvedOnAccount(server, TEST_USER)).toBe(false);
  });

  it('says so when the players cannot be loaded, and loads them on "Try again"', async () => {
    const server = table();
    await state().init(memoryStorage(), server.remote({ userId: DM }));
    server.offline = true;
    renderAt({ name: 'players' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the players.");
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('link', { name: '‹ Characters' })).toBeInTheDocument();

    server.offline = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(within(await waiting()).getByRole('button', { name: 'Approve Nell' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when a change fails, and keeps the list', async () => {
    const server = await playersAsAdmin(table(), (remote) => ({
      ...remote, setApproved: () => Promise.reject(new RemoteError('offline')),
    }));
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change that. Try again.");
    expect(within(await waiting()).getByRole('button', { name: 'Approve Nell' })).toBeEnabled();
    expect(await approvedOnAccount(server, NEW)).toBe(false);
  });

  it('clears that message when the next change works', async () => {
    let fail = true;
    await playersAsAdmin(table(), (remote) => ({
      ...remote,
      setApproved: (id, value) => (fail ? Promise.reject(new RemoteError('offline')) : remote.setApproved(id, value)),
    }));
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(await waiting()).getByRole('button', { name: 'Approve Nell' }));
    expect(await within(await approved()).findByRole('button', { name: 'Remove access for Nell' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
```

Apply this change to `apps/web/src/screens/screens.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -3,9 +3,10 @@ import userEvent from '@testing-library/user-event';
 import { describe, expect, it, vi } from 'vitest';
 import { loadRaw } from '../../../../test-utils/fixtures';
 import { ErrorBoundary } from '../App';
+import { fetchCharacter } from '../import/client';
 import { memoryStorage, type AppStorage } from '../storage';
 import { useStore } from '../store';
-import { seed, testRemote } from '../test/helpers';
+import { seed, testRemote, testServer } from '../test/helpers';
 import { renderAt } from '../test/render';
 
 const json = (status: number, body: unknown) =>
@@ -17,6 +18,9 @@ const stubFetch = (response: () => Response | Promise<Response>) => {
   return mock;
 };
 
+/** The test player's device on an account that sends imports to the import service, as local development does. */
+const importingRemote = () => testRemote(testServer({ importer: (ddbId) => fetchCharacter(ddbId) }));
+
 async function emptyApp(storage: AppStorage = memoryStorage()) {
   await useStore.getState().init(storage, testRemote());
 }
@@ -55,7 +59,7 @@ describe('Home screen', () => {
   });
 
   it('re-imports a character by its D&D Beyond ID', async () => {
-    await seed('vlad');
+    await seed('vlad', memoryStorage(), importingRemote());
     renderAt({ name: 'home' });
     const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: loadRaw('vlad') }));
     await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
@@ -65,7 +69,7 @@ describe('Home screen', () => {
   });
 
   it('keeps the saved copy when a re-import fails', async () => {
-    await seed('vlad');
+    await seed('vlad', memoryStorage(), importingRemote());
     renderAt({ name: 'home' });
     stubFetch(() => json(403, { status: 'private' }));
     await userEvent.click(screen.getByRole('button', { name: 'Re-import' }));
```

Replace the whole of `apps/web/src/test/helpers.ts` with:

```ts
import type { Ability, PlayState } from '@cw/model';
import { normalisePlayItem, normaliseTurn } from '@cw/rules';
import { loadRaw, type Slug } from '../../../../test-utils/fixtures';
import { memoryServer, type MemoryRemote, type MemoryServer, type MemoryServerOptions } from '../remote/memory';
import type { Remote } from '../remote/types';
import { STATE_KEY, memoryStorage, type AppStorage, type StoredCharacter } from '../storage';
import { useStore } from '../store';

/** A fixture's raw JSON with its D&D Beyond ID replaced, so two fixtures can be stored side by side. */
export function rawWithId(slug: Slug, ddbId: number): any {
  const raw = loadRaw(slug);
  raw.data.id = ddbId;
  return raw;
}

/** The approved player most tests are signed in as. */
export const TEST_USER = 'user-test';

/** An in-memory account that already knows the test player. */
export function testServer(options?: MemoryServerOptions): MemoryServer {
  const server = memoryServer(options);
  server.addUser(TEST_USER, 'Tess', { approved: true });
  return server;
}

/** A device signed in as the test player. Each call without a server gets an account of its own. */
export const testRemote = (server: MemoryServer = testServer()): MemoryRemote => server.remote({ userId: TEST_USER });

/**
 * A fresh store on in-memory storage, signed in as the test player and holding one imported
 * fixture, which is opened.
 */
export async function seed(
  slug: Slug, storage: AppStorage = memoryStorage(), remote: Remote = testRemote(),
): Promise<StoredCharacter> {
  await useStore.getState().init(storage, remote);
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

/** The play state a storage holds for a character, put back together from its two items. Null when it holds neither. */
export async function savedPlay(storage: AppStorage, characterId: string): Promise<PlayState | null> {
  const items = (await storage.listItems(characterId)).filter((item) => item.key === STATE_KEY && !item.deleted);
  const play = items.find((item) => item.kind === 'play');
  const turn = items.find((item) => item.kind === 'turn');
  if (!play && !turn) return null;
  return { ...normalisePlayItem(play?.data), turn: normaliseTurn(turn?.data) };
}

/** Writes a play state straight into a storage, as its two items, behind the store's back. */
export async function putSavedPlay(storage: AppStorage, characterId: string, state: PlayState): Promise<void> {
  const base = { characterId, key: STATE_KEY, updatedAt: '2026-11-18T12:00:00.000Z', deleted: false };
  await storage.putItem({ ...base, kind: 'play', data: { spent: state.spent, concentrationKey: state.concentrationKey }, dirty: true });
  await storage.putItem({ ...base, kind: 'turn', data: state.turn, dirty: false });
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/screens/home.test.tsx apps/web/src/screens/players.test.tsx apps/web/src/screens/screens.test.tsx
```

Expected: FAIL. `./Players` cannot be found, and Home has no "Table" section, sync line or "Sign out".

- [ ] **Step 3: Write the implementation**

Re-import passes the character's own ID to `saveImported`, so a table admin updates the player's copy and does not make one of their own.

The sync line's four texts are: "Saved to your account", "Waiting to sync", "Sign in again to sync" (with a "Sign in" button), and "Your account has ten characters. Delete one so the rest can sync."

Two existing re-import tests in `screens.test.tsx` now seed an account whose importer calls `fetchCharacter`, as `defaultRemote` does in local development, because re-import goes through the account. Their assertions do not change.

The About screen's sentence about where data is kept is corrected: it is no longer on the device only.

Replace the whole of `apps/web/src/App.tsx` with:

```tsx
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { routeHref, useRoute } from './router';
import { AboutScreen } from './screens/About';
import { CharacterScreen } from './screens/Character';
import { HomeScreen } from './screens/Home';
import { ImportScreen } from './screens/Import';
import { PlayersScreen } from './screens/Players';
import { SignInScreen } from './screens/SignIn';
import { WaitingScreen } from './screens/Waiting';
import { useStore } from './store';

/** Catches a crash in any screen. Stored characters and play state are not touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Going to another screen tries again. */
  private readonly reset = (): void => {
    if (this.state.failed) this.setState({ failed: false });
  };

  componentDidMount(): void {
    window.addEventListener('hashchange', this.reset);
  }

  componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.reset);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="mx-auto max-w-md p-4">
        <p className="font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-slate-600">Your saved characters are safe.</p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white"
          >
            Reload
          </button>
          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-indigo-700">
            Back to your characters
          </a>
        </div>
      </main>
    );
  }
}

/** About is open to everyone. Every other screen needs a signed-in, approved player. */
function Screen() {
  const route = useRoute();
  const session = useStore((s) => s.session);
  if (route.name === 'about') return <AboutScreen />;
  if (!session) return <SignInScreen />;
  if (!session.profile?.approved) return <WaitingScreen />;
  switch (route.name) {
    case 'import': return <ImportScreen />;
    case 'players': return <PlayersScreen />;
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

Replace the whole of `apps/web/src/screens/About.tsx` with:

```tsx
import { routeHref } from '../router';

export function AboutScreen() {
  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
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
        Your characters, what you have spent and your edits are kept on this device and in your account, so
        that they follow you to another device. Signing out removes them from this device. Ability descriptions
        come from your own imported sheet.
      </p>
    </main>
  );
}
```

Replace the whole of `apps/web/src/screens/Home.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { IMPORT_MESSAGES } from '../import/client';
import { routeHref } from '../router';
import { sheetFor, useStore, type SyncState } from '../store';
import type { StoredCharacter } from '../storage';

const SYNC_LINE: Record<SyncState, string> = {
  saved: 'Saved to your account',
  waiting: 'Waiting to sync',
  signin: 'Sign in again to sync',
  limit: 'Your account has ten characters. Delete one so the rest can sync.',
};

const SMALL_BUTTON = 'inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-1.5';

const importedOn = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const byName = (a: StoredCharacter, b: StoredCharacter): number => a.name.localeCompare(b.name);

/** One character. `detail` follows its class and level: when it was imported, or whose it is. */
function CharacterCard({ character, detail }: { character: StoredCharacter; detail: string }) {
  const importCharacter = useStore((s) => s.importCharacter);
  const saveImported = useStore((s) => s.saveImported);
  const remove = useStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sheet = sheetFor(character);

  async function reimport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await importCharacter(character.ddbId);
    setBusy(false);
    if (result.status !== 'ok') {
      setMessage(`${IMPORT_MESSAGES[result.status]} Your saved copy still works.`);
      return;
    }
    // Named by its own ID, so that a table admin updates the player's copy and does not make one of their own.
    const record = await saveImported(result.raw, character.id);
    setMessage(record ? 'Updated from D&D Beyond.' : "D&D Beyond didn't respond as expected. Your saved copy still works.");
  }

  function confirmRemove(): void {
    const question = `Delete ${character.name}? It will be removed from the account and from every device. This can't be undone.`;
    if (window.confirm(question)) void remove(character.id);
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <a href={routeHref({ name: 'character', id: character.id, view: 'combat' })} className="block">
        <span className="block text-lg font-medium">{character.name}</span>
        <span className="block text-sm text-slate-600">
          {[sheet.classLine, detail].filter((part) => part.trim() !== '').join(' · ')}
        </span>
      </a>
      <div className="mt-2 flex gap-3 text-sm">
        {character.ddbId === '0' ? null : (
          <button type="button" onClick={() => void reimport()} disabled={busy} className={SMALL_BUTTON}>
            {busy ? 'Updating…' : 'Re-import'}
          </button>
        )}
        <button type="button" onClick={confirmRemove} className={`${SMALL_BUTTON} text-red-800`}>
          Delete
        </button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </li>
  );
}

/** Whether the account has what this device holds, and the way back in when the session has ended. */
function SyncLine() {
  const syncState = useStore((s) => s.syncState);
  const signIn = useStore((s) => s.signIn);
  return (
    <div className="mt-1 flex items-center gap-3 text-sm text-slate-600">
      <p role="status">{SYNC_LINE[syncState]}</p>
      {syncState === 'signin' ? (
        <button type="button" onClick={() => void signIn().catch(() => undefined)} className={SMALL_BUTTON}>Sign in</button>
      ) : null}
    </div>
  );
}

function SignOutButton() {
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  async function leave(): Promise<void> {
    setBusy(true);
    try {
      // Signing out removes this device's copy, so it is refused while a change has not been sent.
      if (await signOut()) return;
      if (window.confirm("Some changes haven't synced yet. Sign out and discard them?")) await signOut(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => void leave()} disabled={busy} className={`${SMALL_BUTTON} disabled:opacity-60`}>
      Sign out
    </button>
  );
}

export function HomeScreen() {
  const characters = useStore((s) => s.characters);
  const userId = useStore((s) => s.session?.userId ?? null);
  const isTableAdmin = useStore((s) => s.session?.profile?.isTableAdmin === true);
  const listProfiles = useStore((s) => s.listProfiles);
  /** Display names by user ID. Empty for a player, and for an admin until, or unless, the players load. */
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!isTableAdmin) return undefined;
    let current = true;
    listProfiles().then(
      (profiles) => {
        if (current) setNames(new Map(profiles.map((p) => [p.id, p.displayName])));
      },
      // The table is still listed, without its owners' names.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [isTableAdmin, listProfiles]);

  const own = characters.filter((c) => c.ownerId === userId).sort(byName);
  const table = isTableAdmin ? characters.filter((c) => c.ownerId !== userId).sort(byName) : [];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Your characters</h1>
      <SyncLine />
      {own.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-medium">Add your first character</p>
          <p className="mt-1 text-sm text-slate-600">Bring a character in from D&D Beyond to see what they can do on their turn.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {own.map((character) => (
            <CharacterCard key={character.id} character={character} detail={`Imported ${importedOn(character.importedAt)}`} />
          ))}
        </ul>
      )}
      <a
        href={routeHref({ name: 'import' })}
        className="mt-4 block rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white"
      >
        Add a character
      </a>
      {table.length === 0 ? null : (
        <section aria-label="Table" className="mt-8">
          <h2 className="font-medium">Table</h2>
          <ul className="mt-3 space-y-3">
            {table.map((character) => (
              <CharacterCard key={character.id} character={character} detail={names.get(character.ownerId ?? '') ?? ''} />
            ))}
          </ul>
        </section>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
        {isTableAdmin ? (
          <a href={routeHref({ name: 'players' })} className="inline-flex min-h-11 items-center text-indigo-700">Players</a>
        ) : null}
        <a href={routeHref({ name: 'about' })} className="inline-flex min-h-11 items-center text-indigo-700">About and credits</a>
        <SignOutButton />
      </div>
    </main>
  );
}
```

Create `apps/web/src/screens/Players.tsx`:

```tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../remote';
import { routeHref } from '../router';
import { useStore } from '../store';

const ROW_BUTTON = 'inline-flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60';

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-1">
      <span className="min-w-0 truncate font-medium">{name}</span>
      {children}
    </li>
  );
}

/** Where the table admin approves the people waiting and removes access from the approved. */
export function PlayersScreen() {
  const userId = useStore((s) => s.session?.userId ?? null);
  const isTableAdmin = useStore((s) => s.session?.profile?.isTableAdmin === true);
  const listProfiles = useStore((s) => s.listProfiles);
  const setApproved = useStore((s) => s.setApproved);
  /** Null until the players have loaded, and again if loading them fails. */
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadFailed(false);
    try {
      setProfiles(await listProfiles());
    } catch {
      setProfiles(null);
      setLoadFailed(true);
    }
  }, [listProfiles]);

  useEffect(() => {
    if (isTableAdmin) void load();
  }, [isTableAdmin, load]);

  async function change(id: string, approved: boolean): Promise<void> {
    setBusy(true);
    setChangeFailed(false);
    try {
      await setApproved(id, approved);
    } catch {
      setChangeFailed(true);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!isTableAdmin) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">Only the table admin can manage players.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }

  const waiting = profiles?.filter((p) => !p.approved) ?? [];
  const approved = profiles?.filter((p) => p.approved) ?? [];

  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">Players</h1>

      {loadFailed ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>Couldn't load the players.</p>
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 rounded-lg border border-red-300 bg-white px-3 py-1.5">
            Try again
          </button>
        </div>
      ) : null}
      {profiles === null && !loadFailed ? <p className="mt-4 text-slate-600">Loading…</p> : null}
      {changeFailed ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Couldn't change that. Try again.
        </p>
      ) : null}

      {profiles === null ? null : (
        <>
          <section aria-label="Waiting for approval" className="mt-6">
            <h2 className="font-medium">Waiting for approval</h2>
            {waiting.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Nobody is waiting.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {waiting.map((profile) => (
                  <Row key={profile.id} name={profile.displayName}>
                    <button
                      type="button"
                      aria-label={`Approve ${profile.displayName}`}
                      onClick={() => void change(profile.id, true)}
                      disabled={busy}
                      className={ROW_BUTTON}
                    >
                      Approve
                    </button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Approved" className="mt-6">
            <h2 className="font-medium">Approved</h2>
            <ul className="mt-3 space-y-2">
              {approved.map((profile) => (
                <Row key={profile.id} name={profile.displayName}>
                  {profile.id === userId ? (
                    <span className="shrink-0 text-sm text-slate-600">You</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove access for ${profile.displayName}`}
                      onClick={() => void change(profile.id, false)}
                      disabled={busy}
                      className={ROW_BUTTON}
                    >
                      Remove access
                    </button>
                  )}
                </Row>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (807 tests in 37 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Home shows the table and the sync state; Players approves and removes access" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 11: Import goes through the account; Character waits for its saved state

Import by link now asks the account, which checks the player and the rate limit before anything is fetched, and the screen respects the ten-character limit (spec section 6). The Character screen shows nothing that can be tapped until the saved play state has been read, and says so when a character cannot be opened. This settles three more deferred findings: the stuck "Loading…" screen, the Import screen's missing triangle, and a character list that one bad record could break.

**Files:**
- Modify: `apps/web/src/screens/Character.tsx`
- Modify: `apps/web/src/screens/Home.tsx`
- Modify: `apps/web/src/screens/Import.tsx`
- Create (test): `apps/web/src/screens/character.test.tsx`
- Modify (test): `apps/web/src/screens/screens.test.tsx`

**Interfaces:**
- Consumes:
  - Store: `importCharacter(ddbId)`, `canAddCharacter()`, `saveImported(raw)`, `open(id)`, `loaded`, `session`, `characters` (Tasks 2 and 8).
  - `IMPORT_MESSAGES`, `LIMIT_MESSAGE`, `PRIVACY_HINT` from `apps/web/src/import/client.ts` (Task 6); `characterId` from `apps/web/src/sync/engine.ts` (Task 5).
- Produces:
  - `ImportScreen()` imports through the store, shows `LIMIT_MESSAGE` for an eleventh character without making a request, and shows each new answer's message without opening the paste fallback.
  - `CharacterScreen({ id, view })` shows "Loading…" until `loaded`, and "This character couldn't be opened." with a link back when opening fails.
  - The character list gives a card to a character whose sheet cannot be built, so that it can be re-imported or deleted.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/screens/character.test.tsx`:

```tsx
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeHref } from '../router';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { rawWithId, seed, testRemote, testServer } from '../test/helpers';
import { renderAt } from '../test/render';

// In a file of its own, so that the other screen tests build real sheets.
const sheetBuild = vi.hoisted(() => ({ fails: false }));

vi.mock('@cw/rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cw/rules')>();
  return {
    ...actual,
    buildSheet: (...args: Parameters<typeof actual.buildSheet>) => {
      if (sheetBuild.fails) throw new Error('sheet build failed');
      return actual.buildSheet(...args);
    },
  };
});

afterEach(() => {
  sheetBuild.fails = false;
});

const state = () => useStore.getState();

/** A device holding Vlad, opened afresh so that no sheet has been built yet. */
async function reopenedDevice() {
  const storage = memoryStorage();
  const server = testServer();
  const record = await seed('vlad', storage, testRemote(server));
  await state().init(storage, testRemote(server));
  return { record, storage, server };
}

describe('Character list', () => {
  it('still lists a character whose sheet cannot be built, so that it can be re-imported or deleted', async () => {
    await reopenedDevice();
    sheetBuild.fails = true;
    renderAt({ name: 'home' });
    expect(await screen.findByText('Vlad')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong on this screen.')).toBeNull();
  });
});

describe('Character screen', () => {
  it('says so when the character cannot be opened, and links back to the list', async () => {
    const { record } = await reopenedDevice();
    sheetBuild.fails = true;
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByText("This character couldn't be opened.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your characters' })).toHaveAttribute('href', '#/');
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(state()).toMatchObject({ openId: null, sheet: null });
    // It is still on the device: this is not the "isn't on this device" case.
    expect(state().characters.map((c) => c.id)).toEqual([record.id]);
    expect(screen.queryByText("That character isn't on this device.")).toBeNull();
  });

  it('opens the same character when its sheet can be built', async () => {
    const { record } = await reopenedDevice();
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
    expect(screen.queryByText("This character couldn't be opened.")).toBeNull();
  });

  it('forgets the failure when the player goes to a character that does open', async () => {
    const { record } = await reopenedDevice();
    const other = await state().saveImported(rawWithId('minkis', 2));
    if (!other) throw new Error('fixture minkis did not import');
    sheetBuild.fails = true;
    renderAt({ name: 'character', id: record.id, view: 'combat' });
    expect(await screen.findByText("This character couldn't be opened.")).toBeInTheDocument();
    act(() => {
      window.location.hash = routeHref({ name: 'character', id: other.id, view: 'combat' });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
  });
});
```

Apply this change to `apps/web/src/screens/screens.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -4,9 +4,10 @@ import { describe, expect, it, vi } from 'vitest';
 import { loadRaw } from '../../../../test-utils/fixtures';
 import { ErrorBoundary } from '../App';
 import { fetchCharacter } from '../import/client';
+import { CHARACTER_LIMIT, type ImportResult, type Remote } from '../remote/types';
 import { memoryStorage, type AppStorage } from '../storage';
 import { useStore } from '../store';
-import { seed, testRemote, testServer } from '../test/helpers';
+import { TEST_USER, ability, rawWithId, savedPlay, seed, testRemote, testServer } from '../test/helpers';
 import { renderAt } from '../test/render';
 
 const json = (status: number, body: unknown) =>
@@ -21,10 +22,25 @@ const stubFetch = (response: () => Response | Promise<Response>) => {
 /** The test player's device on an account that sends imports to the import service, as local development does. */
 const importingRemote = () => testRemote(testServer({ importer: (ddbId) => fetchCharacter(ddbId) }));
 
-async function emptyApp(storage: AppStorage = memoryStorage()) {
-  await useStore.getState().init(storage, testRemote());
+async function emptyApp(storage: AppStorage = memoryStorage(), remote: Remote = importingRemote()) {
+  await useStore.getState().init(storage, remote);
 }
 
+/** A device whose signed-in player already has ten characters, with D&D Beyond IDs 1 to 10. */
+async function fullApp(remote: Remote = importingRemote()) {
+  const storage = memoryStorage();
+  const rawJson = loadRaw('vlad');
+  for (let i = 1; i <= CHARACTER_LIMIT; i += 1) {
+    await storage.putCharacter({
+      id: `ddb-${i}-${TEST_USER}`, ownerId: TEST_USER, ddbId: String(i), name: `Vlad ${i}`, rawJson,
+      importedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', deleted: false, dirty: true,
+    });
+  }
+  await emptyApp(storage, remote);
+}
+
+const LIMIT = 'You have ten characters. Delete one to add another.';
+
 describe('Home screen', () => {
   it('invites the first import when there are no characters', async () => {
     await emptyApp();
@@ -220,6 +236,131 @@ describe('Import screen', () => {
     expect(await screen.findByText("That doesn't look like a D&D Beyond character.")).toBeInTheDocument();
     expect(useStore.getState().characters).toEqual([]);
   });
+
+  it('asks the account, which can refuse before the import service is called', async () => {
+    const importer = vi.fn(async (_ddbId: string): Promise<ImportResult> => ({ status: 'ok', raw: loadRaw('vlad') }));
+    const server = testServer({ importer });
+    await emptyApp(memoryStorage(), testRemote(server));
+    // Access was removed since this device last heard from the account.
+    server.addUser(TEST_USER, 'Tess', { approved: false });
+    renderAt({ name: 'import' });
+    await userEvent.type(linkField(), '42');
+    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+    expect(await screen.findByRole('alert')).toHaveTextContent("Your DM hasn't approved your account yet.");
+    expect(importer).not.toHaveBeenCalled();
+
+    server.addUser(TEST_USER, 'Tess', { approved: true });
+    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+    expect(await screen.findByRole('heading', { name: 'Vlad' })).toBeInTheDocument();
+    expect(importer.mock.calls).toEqual([['42']]);
+  });
+
+  it.each([
+    [401, 'unauthorized', 'Your sign-in has expired. Sign in again, then retry.'],
+    [403, 'not-approved', "Your DM hasn't approved your account yet."],
+    [429, 'rate-limited', 'Too many imports. Try again in an hour.'],
+  ])('explains a %i %s answer and keeps the paste section closed', async (httpStatus, status, message) => {
+    await emptyApp();
+    renderAt({ name: 'import' });
+    stubFetch(() => json(httpStatus, { status }));
+    await userEvent.type(linkField(), '42');
+    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+    const alert = await screen.findByRole('alert');
+    expect(alert).toHaveTextContent(message);
+    expect(alert).not.toHaveTextContent('You can paste the character JSON below instead.');
+    expect(screen.getByText('Paste the character JSON instead').closest('details')).not.toHaveAttribute('open');
+    expect(useStore.getState().characters).toEqual([]);
+  });
+
+  it('marks the paste section as one that unfolds', async () => {
+    await emptyApp();
+    renderAt({ name: 'import' });
+    const summary = screen.getByText('Paste the character JSON instead').closest('summary');
+    const mark = summary?.lastElementChild;
+    expect(mark).toHaveTextContent('▾');
+    expect(mark).toHaveAttribute('aria-hidden', 'true');
+  });
+
+  describe('when the player already has ten characters', () => {
+    it('says so instead of asking for an eleventh by link', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 99) }));
+      await userEvent.type(linkField(), '99');
+      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+      expect(screen.getByRole('alert')).toHaveTextContent(LIMIT);
+      expect(fetchMock).not.toHaveBeenCalled();
+      expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
+      expect(screen.getByText('Paste the character JSON instead').closest('details')).not.toHaveAttribute('open');
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+
+    it('still imports by link a character the player already has', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      const fetchMock = stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
+      await userEvent.type(linkField(), 'https://www.dndbeyond.com/characters/3');
+      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
+      expect(fetchMock.mock.calls[0][1]?.body).toBe('{"id":"3"}');
+      expect(window.location.hash).toBe(`#/c/ddb-3-${TEST_USER}/combat`);
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+
+    it('knows a character the player already has when its number is typed with leading zeros', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
+      await userEvent.type(linkField(), '003');
+      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+
+    it('does not count a table admin\'s view of other players\' characters', async () => {
+      const server = testServer({ importer: (ddbId) => fetchCharacter(ddbId) });
+      server.addUser('user-dm', 'Dee', { approved: true, admin: true });
+      await fullApp(testRemote(server));
+      await useStore.getState().syncNow();
+      await emptyApp(memoryStorage(), server.remote({ userId: 'user-dm' }));
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+      renderAt({ name: 'import' });
+      stubFetch(() => json(200, { status: 'ok', raw: rawWithId('minkis', 3) }));
+      await userEvent.type(linkField(), '3');
+      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
+      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
+      expect(window.location.hash).toBe('#/c/ddb-3-user-dm/combat');
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT + 1);
+    });
+
+    it('says so for pasted JSON of an eleventh', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(rawWithId('minkis', 99)) } });
+      await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
+      expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT);
+      expect(screen.getByRole('alert')).not.toHaveTextContent("That doesn't look like a D&D Beyond character.");
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+
+    it('says so for a chosen file of an eleventh', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      const file = new File([JSON.stringify(rawWithId('sid', 98))], 'sid.json', { type: 'application/json' });
+      await userEvent.upload(screen.getByLabelText('Or choose a JSON file'), file);
+      expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT);
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+
+    it('still takes pasted JSON of a character the player already has', async () => {
+      await fullApp();
+      renderAt({ name: 'import' });
+      fireEvent.change(screen.getByLabelText('Character JSON'), { target: { value: JSON.stringify(rawWithId('minkis', 3)) } });
+      await userEvent.click(screen.getByRole('button', { name: 'Use this JSON' }));
+      expect(await screen.findByRole('heading', { name: 'Minkis' })).toBeInTheDocument();
+      expect(useStore.getState().characters).toHaveLength(CHARACTER_LIMIT);
+    });
+  });
 });
 
 describe('App', () => {
@@ -246,6 +387,38 @@ describe('App', () => {
     expect(screen.getByRole('alert')).toHaveTextContent("This device isn't saving changes.");
   });
 
+  it('shows nothing that can be tapped until the character\'s saved play state has been read', async () => {
+    const inner = memoryStorage();
+    let held: Promise<void> | null = null;
+    const storage: AppStorage = {
+      ...inner,
+      async listItems(characterId) {
+        if (held) await held;
+        return inner.listItems(characterId);
+      },
+    };
+    const server = testServer();
+    const record = await seed('vlad', storage, testRemote(server));
+    useStore.getState().use(ability('Hex'), 'combat');
+    await waitFor(async () => expect(await savedPlay(inner, record.id)).toMatchObject({ spent: { pact: 1 } }));
+    // The same device, opened again: nothing is open, and the next read of the saved state is held.
+    await useStore.getState().init(storage, testRemote(server));
+    let release: () => void = () => undefined;
+    held = new Promise<void>((resolve) => { release = resolve; });
+
+    renderAt({ name: 'character', id: record.id, view: 'combat' });
+    expect(await screen.findByText('Loading…')).toBeInTheDocument();
+    expect(useStore.getState()).toMatchObject({ openId: record.id, loaded: false });
+    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
+    expect(screen.queryByRole('button')).toBeNull();
+
+    release();
+    expect(await screen.findByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
+    expect(screen.getAllByRole('button', { name: /^Use / }).length).toBeGreaterThan(0);
+    expect(screen.queryByText('Loading…')).toBeNull();
+    expect(useStore.getState().play.spent).toEqual({ pact: 1 });
+  });
+
   it('switches between Combat and Explore from the header', async () => {
     const record = await seed('vlad');
     renderAt({ name: 'character', id: record.id, view: 'combat' });
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/screens/character.test.tsx apps/web/src/screens/screens.test.tsx
```

Expected: FAIL. `screens/character.test.tsx` fails because the Character screen stays on "Loading…", and the Import tests fail because the screen still calls `fetchCharacter` directly and knows nothing of the limit.

- [ ] **Step 3: Write the implementation**

`character.test.tsx` mocks `buildSheet` from `@cw/rules`, which is why it is a file of its own: the mock must not reach the other screen tests.

The `emptyApp` helper in `screens.test.tsx` now signs in to an account whose importer calls `fetchCharacter`, so the Import tests that stub `fetch` still reach their stub. Their assertions do not change.

Replace the whole of `apps/web/src/screens/Character.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { routeHref, type View } from '../router';
import { useStore } from '../store';
import { CombatView } from '../views/CombatView';
import { ExploreView } from '../views/ExploreView';

const TAB = 'inline-flex min-h-11 items-center rounded-full px-3 py-1 text-sm';
const TAB_ON = `${TAB} bg-slate-900 text-white`;
const TAB_OFF = `${TAB} bg-slate-200 text-slate-800`;

/** One character: the header, the Combat or Explore view, and the pinned undo bar and turn button. */
export function CharacterScreen({ id, view }: { id: string; view: View }) {
  const open = useStore((s) => s.open);
  const known = useStore((s) => s.characters.some((c) => c.id === id));
  const openId = useStore((s) => s.openId);
  const sheet = useStore((s) => s.sheet);
  const loaded = useStore((s) => s.loaded);
  const undo = useStore((s) => s.undo);
  const undoLast = useStore((s) => s.undoLast);
  const startTurn = useStore((s) => s.startTurn);

  /** The character that `open` has finished with and left closed, although it is on this device. */
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const settled = (): void => {
      if (current) setFailedId(useStore.getState().openId === id ? null : id);
    };
    void open(id).then(settled, settled);
    return () => {
      current = false;
    };
  }, [id, open]);

  if (!known) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">That character isn't on this device.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  if (failedId === id) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="font-medium">This character couldn't be opened.</p>
        <a href={routeHref({ name: 'home' })} className="mt-2 inline-flex min-h-11 items-center text-indigo-700">Back to your characters</a>
      </main>
    );
  }
  // Nothing can be tapped until the saved play state has been read, so nothing is shown until then.
  if (openId !== id || !sheet || !loaded) return <main className="mx-auto max-w-md p-4 text-slate-600">Loading…</main>;

  return (
    <main className="mx-auto max-w-md px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-3">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
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
        <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md space-y-2 bg-slate-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {undo ? (
            <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-0.5 text-sm text-white">
              <span className="py-1.5">{undo.message}</span>
              <button type="button" onClick={undoLast} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center font-medium underline">Undo</button>
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

Apply this change to `apps/web/src/screens/Home.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -27,7 +27,13 @@ function CharacterCard({ character, detail }: { character: StoredCharacter; deta
   const remove = useStore((s) => s.remove);
   const [busy, setBusy] = useState(false);
   const [message, setMessage] = useState<string | null>(null);
-  const sheet = sheetFor(character);
+  // A record whose sheet cannot be built still gets a card, so that it can be re-imported or deleted.
+  let classLine = '';
+  try {
+    classLine = sheetFor(character).classLine;
+  } catch {
+    classLine = '';
+  }
 
   async function reimport(): Promise<void> {
     setBusy(true);
@@ -53,7 +59,7 @@ function CharacterCard({ character, detail }: { character: StoredCharacter; deta
       <a href={routeHref({ name: 'character', id: character.id, view: 'combat' })} className="block">
         <span className="block text-lg font-medium">{character.name}</span>
         <span className="block text-sm text-slate-600">
-          {[sheet.classLine, detail].filter((part) => part.trim() !== '').join(' · ')}
+          {[classLine, detail].filter((part) => part.trim() !== '').join(' · ')}
         </span>
       </a>
       <div className="mt-2 flex gap-3 text-sm">
```

Apply this change to `apps/web/src/screens/Import.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,8 +1,9 @@
 import { parseCharacterId } from '@cw/ddb-import';
 import { useState, type FormEvent } from 'react';
-import { IMPORT_MESSAGES, PRIVACY_HINT, fetchCharacter } from '../import/client';
+import { IMPORT_MESSAGES, LIMIT_MESSAGE, PRIVACY_HINT } from '../import/client';
 import { navigate, routeHref } from '../router';
 import { useStore } from '../store';
+import { characterId } from '../sync/engine';
 
 const NOT_A_CHARACTER = "That doesn't look like a D&D Beyond character.";
 const SAVE_FAILED = "Couldn't add this character. Try again.";
@@ -10,6 +11,8 @@ const READ_FAILED = "Couldn't read that file.";
 const PASTE_HINT = 'You can paste the character JSON below instead.';
 
 export function ImportScreen() {
+  const importCharacter = useStore((s) => s.importCharacter);
+  const canAddCharacter = useStore((s) => s.canAddCharacter);
   const saveImported = useStore((s) => s.saveImported);
   const [link, setLink] = useState('');
   const [json, setJson] = useState('');
@@ -31,18 +34,28 @@ export function ImportScreen() {
     } catch {
       return fail(SAVE_FAILED);
     }
-    if (!record) return fail(NOT_A_CHARACTER);
+    // Nothing was stored: the account is full, or this is not a character.
+    if (!record) return fail(canAddCharacter() ? NOT_A_CHARACTER : LIMIT_MESSAGE);
     navigate({ name: 'character', id: record.id, view: 'combat' });
   }
 
+  /** True when the signed-in player already has this D&D Beyond character, so importing it adds nothing. */
+  function alreadyHas(ddbId: string): boolean {
+    const { session, characters } = useStore.getState();
+    // The number, not the text: "003" is the character stored as "3".
+    return session !== null && characters.some((c) => c.id === characterId(String(Number(ddbId)), session.userId));
+  }
+
   async function importByLink(event: FormEvent): Promise<void> {
     event.preventDefault();
     const id = parseCharacterId(link);
     if (id === null) return fail('Paste a D&D Beyond character link or its number.');
+    // Checked before asking, so a full account does not spend an import on a character it cannot keep.
+    if (!canAddCharacter() && !alreadyHas(id)) return fail(LIMIT_MESSAGE);
     setBusy(true);
     setError(null);
     setHint(null);
-    const result = await fetchCharacter(id);
+    const result = await importCharacter(id);
     setBusy(false);
     if (result.status === 'ok') return store(result.raw);
     if (result.status === 'unreachable' || result.status === 'upstream-error') {
@@ -101,7 +114,10 @@ export function ImportScreen() {
         onToggle={(event) => setPasteOpen(event.currentTarget.open)}
         className="mt-6 rounded-lg border border-slate-200 bg-white p-3"
       >
-        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Paste the character JSON instead</summary>
+        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium">
+          <span>Paste the character JSON instead</span>
+          <span aria-hidden="true">▾</span>
+        </summary>
         <p className="mt-2 text-xs text-slate-600">
           Use this if the import can't reach D&D Beyond. Paste the JSON, or choose a saved file.
         </p>
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (824 tests in 38 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Import goes through the account and respects the limit; Character waits for its saved state" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 12: Check the running app at phone width, and update the README

Part A is complete in code. This task checks it in a real browser against the in-memory account, describes accounts in the README, and starts the milestone's findings file. When this plan was checked, this walk-through found two faults that the tests had missed (the app starting twice in development, and the stand-in player being signed out by every reload); both are fixed in Tasks 7 and 8 as written here. Do not skip it.

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`

**Interfaces:**
- Consumes:
  - Everything in Tasks 1 to 11.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Walk through the app in a browser**

Start the dev server and open it in a browser at 375 px wide (a phone-sized viewport in the browser's device toolbar):

```bash
pnpm dev
```

Walk through all of the following. Every point must hold before the task is committed. Fix what does not hold in the code of the task that owns it, with a test that fails first, and say so in the report.

1. The first screen is "Character Wizard" with one button, "Continue as test player", the note "Local development: no account is used.", and a link to About. About opens without signing in.
2. "Continue as test player" shows "Your characters" with the empty state, a sync line, "Sign out" and a "Players" link.
3. "Add a character", then open "Paste the character JSON instead", whose row shows a ▾, and paste the contents of `fixtures/characters/vlad.json`. The Combat view opens. Back on the list, the sync line reads "Saved to your account" within a few seconds.
4. In the Combat view, tap Use on Hex. The Bonus Action pill and a pact slot are spent, and the concentration banner appears. Reload the page: after a moment of "Loading…" the same state is shown.
5. Reload the character list. You are still signed in, and the sync line reads "Saved to your account".
6. In the browser's developer tools, under Application, IndexedDB, `character-wizard`: the stores are `characters`, `items` and `meta`, and there is no `play` store.
7. "Players" lists "Test player" under "Approved", marked "You" with no button, and says "Nobody is waiting."
8. Delete a character. The confirmation says it will be removed from the account and from every device.
9. "Sign out" returns to the sign-in screen, and the three IndexedDB stores are empty.
10. No button or link is shorter than 44 px, and no screen scrolls sideways.

The in-memory account is empty again after every reload. The device's own copy is what is shown, so nothing looks different. That is expected in local development.

- [ ] **Step 2: Write the implementation**

The README gains "Accounts" and "Deploying" sections. The findings file starts with what was found while the plan was being checked and what cannot be verified without the owner's accounts.

Replace the whole of `README.md` with:

```markdown
# Character Wizard

A play aid for D&D (2024 rules). It imports a character from D&D Beyond and shows what the character can do, grouped by Action, Bonus Action and Reaction, with every roll written out. Players sign in with Discord, and their characters follow them between devices.

This repository contains the import, the sheet maths, the turn engine, the web app and the database. See `docs/superpowers/specs/` for the design.

## Commands

    pnpm install
    pnpm test
    pnpm typecheck
    pnpm dev
    pnpm build
    pnpm sheet fixtures/characters/vlad.json
    pnpm fetch-character https://www.dndbeyond.com/characters/<id> <slug>

`pnpm dev` starts the app on your machine and on your local network. With no Supabase address configured it needs no account of any kind: "Continue as test player" signs in to an account held in memory, which is empty again after a reload, and the dev server answers character imports itself. Characters stay in the browser's own storage between reloads.

`fetch-character` and the app's import both need the sheet's Character Privacy set to Public.

`pnpm test` includes the database's access rules. They run on PGlite, a Postgres inside the test process, so no Docker and no Supabase project is needed.

## Accounts

- **Signing in** is by Discord, through Supabase Auth. The app stores no password and sends no email.
- **Anyone can sign in, and a new account can do nothing** until a table admin approves it on the Players screen.
- **The first table admin is made by hand,** once. Sign in on the deployed site, then in the Supabase dashboard's SQL Editor find your row with `select id, display_name from public.profiles;` and run `update public.profiles set approved = true, is_table_admin = true where id = '<your id>';`.
- **A table admin** sees every character at the table under "Table" and can open and edit any of them.
- **The device keeps its own copy** of everything, so the app opens and works without a connection. Changes are sent when one is available. Where two devices change the same thing, the later change wins.
- **Signing out** removes the device's copy.

## Deploying

The site is static and is built with `pnpm build` into `apps/web/dist`. It needs two values at build time, both public: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the project's publishable key). `apps/web/.env.example` lists them.

The database is created from `supabase/migrations` with `pnpm dlx supabase db push`, and the import function is deployed with `pnpm dlx supabase functions deploy import-character`. The function answers only the origins listed in its `ALLOWED_ORIGINS` secret, and only signed-in, approved players.

Never commit a Supabase address, a key, a Discord client secret or a database password.

## Packages

- `packages/model`: shared types.
- `packages/ddb-import`: converts D&D Beyond JSON into the app's `Character` format.
- `packages/rules`: calculates the sheet, the list of abilities, the roll lines and the turn engine.
- `apps/web`: the React app. `src/storage` is the device's copy, `src/remote` is the account (Supabase, or an in-memory stand-in), and `src/sync` moves changes between the two.
- `supabase/migrations`: the database: tables, access rules and the functions the app calls.
- `supabase/functions/import-character`: the Edge Function that fetches a public character.
- `supabase/tests`: tests of the access rules, run against the migrations.

## Licensing and attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
```

Create `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`:

```markdown
# Milestone 3: deferred review findings

Findings that were deliberately not fixed in milestone 3. Add to this file as reviews find things; each entry names the milestone that should pick it up or drop it.

See also "Known gaps carried forward" in `2026-11-18-milestone-3-accounts-and-overlays.md`.

## Settle in milestone 4 (suggestions)

Found while the plan was being checked.

- On a full account, pasted JSON that is not a character at all gets the "ten characters" message, because the limit is checked before anything else.
- The waiting screen says "Still waiting." both when the player is not approved and when the account could not be reached. It cannot tell which.
- "Checking your account" shows briefly during an ordinary sign-in, between the session arriving and the profile arriving. It also shows when a session ended before any profile was learned, where "Try again" cannot help and "Sign out" is the way on.
- "Remove access" on the Players screen does not ask first. Approving again undoes it.
- A card under "Table" shows the owner's name and not the import date.

## Not verified in milestone 3

- Discord sign-in against the real services, the Supabase adapter against a live project, and the migration applied to a real project. Plan Task 13 (repository owner) covers all three. Remove this line when the owner reports that Task 13's checks passed.
- The app has not been opened on a real phone. The walk-throughs ran in a desktop browser at 375 by 812 against the in-memory account.
- Whether Discord sign-in returns to an app installed to an iPhone's home screen. Milestone 5 must check before install is offered.
- Whether a successful fetch from the character service redirects. An unknown ID answers 403 directly; the import function now follows no redirects.
```

- [ ] **Step 3: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (824 tests in 38 files) and the type check prints no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Describe accounts in the README and start the milestone 3 findings file" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 13: Set up sign-in, the database and the deployment (repository owner)

**This task needs the repository owner.** It creates accounts, handles a client secret and a database password, and changes dashboard settings, none of which an agent may do. An agent executing the plan does Step 1, then stops and hands the remaining steps to the owner.

Two rules throughout: never paste a secret (the Discord client secret, the database password, a Supabase secret key) into a chat or into the repository, and nothing in this task needs committing.

**Files:** none.

**Interfaces:**
- Consumes: the migration (Task 4), the import function (Task 6), the web app (Tasks 7 to 12).
- Produces: a Supabase project with Discord sign-in and the database applied, the deployed import function, the site on Cloudflare Pages, and one table admin.

- [ ] **Step 1 (agent): Check that the branch is ready to deploy**

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

Expected: every test passes, the type check prints no errors, and the build writes `apps/web/dist`. Then stop and hand over to the owner with this task's remaining steps.

- [ ] **Step 2 (owner): Have a Supabase project, linked to this folder**

If milestone 2's Task 16 was done, the project exists and is linked: go to Step 3.

Otherwise, at https://supabase.com create a free project named `character-wizard`. It asks for a database password: generate one and keep it in a password manager. From Project Settings, note the project reference and the project URL (`https://<project-ref>.supabase.co`). From Settings, API Keys, copy the publishable key (`sb_publishable_...`), which is public by design. Leave the secret key alone.

Then, from the repository root:

```bash
pnpm dlx supabase login
```

```bash
pnpm dlx supabase link --project-ref <project-ref>
```

If `link` asks for the database password, enter it there.

- [ ] **Step 3 (owner): Create the database**

```bash
pnpm dlx supabase db push
```

Expected: it lists `20261118000000_accounts_and_sync.sql` and applies it. In the dashboard's Table Editor there are now four tables, `profiles`, `characters`, `character_items` and `import_log`, each marked as having row-level security enabled.

If the command fails, copy the error message to the agent. Do not edit the SQL in the dashboard: the file in `supabase/migrations` is the record.

- [ ] **Step 4 (owner): Make a Discord application for sign-in**

At https://discord.com/developers/applications choose New Application (the application from another project can be reused instead). Under OAuth2:

- Copy the **Client ID**.
- Reset and copy the **Client Secret**. This is a secret.
- Under Redirects, add `https://<project-ref>.supabase.co/auth/v1/callback` and save.

- [ ] **Step 5 (owner): Turn on Discord sign-in in Supabase**

In the Supabase dashboard:

- Authentication, Sign In / Providers, Discord: enable it, and paste the Client ID and Client Secret from Step 4.
- Authentication, URL Configuration: set **Site URL** to the site's address, `https://<name>.pages.dev` (the Cloudflare Pages address; see Step 7 if it does not exist yet). Under **Redirect URLs** add `https://<name>.pages.dev/`.

The dashboard's labels move from time to time. What matters is that the Discord provider is enabled with the two values, and that the site's address is an allowed redirect.

- [ ] **Step 6 (owner): Deploy the import function and say who may call it**

```bash
pnpm dlx supabase functions deploy import-character
```

```bash
pnpm dlx supabase secrets set ALLOWED_ORIGINS=https://<name>.pages.dev
```

An origin is scheme and host only, with no trailing slash. List several with commas and no spaces. If the deploy command says it needs Docker, start Docker Desktop and run it again.

Then check that the function refuses a caller who is not signed in. Run this in Git Bash, not PowerShell:

```bash
curl -s -i -X POST https://<project-ref>.supabase.co/functions/v1/import-character -H "Content-Type: application/json" -H "apikey: <publishable key>" -d '{"id":"1"}'
```

Expected: `401` and the body `{"status":"unauthorized"}`. If the body instead mentions a missing or invalid JWT, the platform's own check is still on: confirm that `supabase/config.toml` says `verify_jwt = false` and deploy again.

- [ ] **Step 7 (owner): Deploy the site to Cloudflare Pages**

If milestone 2's Task 16 created the Pages project, it builds again when the Part A pull request is merged to `main`: go to Step 8 after the merge.

Otherwise, in the Cloudflare dashboard create a Pages project connected to the GitHub repository `daveydampier/CharacterWizard`:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `pnpm install && pnpm build` |
| Build output directory | `apps/web/dist` |
| Environment variable `NODE_VERSION` | `24` |
| Environment variable `PNPM_VERSION` | `11.24.0` |
| Environment variable `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Environment variable `VITE_SUPABASE_KEY` | the publishable key |

Both `VITE_` values end up in the public JavaScript bundle. That is expected: the publishable key is public by design. If Cloudflare rejects `PNPM_VERSION`, remove it.

To try Part A before it is merged, Pages builds a preview for the branch at `https://<branch>.<name>.pages.dev`. That address must then also be listed in `ALLOWED_ORIGINS` (Step 6) and under Redirect URLs (Step 5).

- [ ] **Step 8 (owner): Make yourself the table admin**

Open the site and choose "Continue with Discord". Expected: after Discord, the site shows "Waiting for your DM to approve you" with your Discord name.

In the Supabase dashboard's SQL Editor, look at who has signed in:

```sql
select id, display_name, approved, is_table_admin from public.profiles;
```

Then approve yourself and make yourself the admin, using your own row's `id` from that list:

```sql
update public.profiles set approved = true, is_table_admin = true where id = '<your id>';
```

Back on the site choose "Check again". Expected: "Your characters". This is the only time SQL is needed: from now on you approve players on the Players screen.

- [ ] **Step 9 (owner): Check it on real devices**

1. On a phone, sign in and import a character by pasting its D&D Beyond link. Expected: the Combat view opens, and the character list says "Saved to your account" within a few seconds.
2. Sign in on a second device. Expected: the character is there.
3. Spend a spell slot on one device. Expected: within about 30 seconds, or on switching back to the app, the other device shows it spent.
4. Ask a player to open the site and sign in. Expected: they see the waiting screen, and they appear under "Waiting for approval" on your Players screen. Approve them. Expected: after "Check again" they can import a character, and it appears under "Table" on your character list.
5. Open that character from "Table" and open it on the player's device. Expected: both show the same sheet.

If something goes wrong:

| What you see | Check, in this order |
|---|---|
| Discord says the redirect is invalid | The redirect in Step 4 is exactly `https://<project-ref>.supabase.co/auth/v1/callback` |
| After Discord, the site shows the sign-in screen again | The site's address is under Redirect URLs in Step 5, with its trailing slash; `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` are set in Cloudflare and the site was rebuilt since |
| "Couldn't reach the import service." | The origin in `ALLOWED_ORIGINS` matches the address bar exactly; the Step 6 check still answers `401` with `{"status":"unauthorized"}` |
| "Your sign-in has expired. Sign in again, then retry." straight after signing in | The function cannot reach the database: redeploy it (Step 6) and check Step 3 was applied |
| "D&D Beyond didn't respond as expected." for a sheet that is Public | The character service may have started redirecting: tell the agent, who removes the `redirect: 'error'` line described in Task 6 |
| The list stays on "Waiting to sync" | The project may be paused (Supabase pauses a free project after seven days of low activity): resume it from the dashboard |

- [ ] **Step 10 (owner): Say what happened**

Tell the agent which checks passed and anything that looked wrong or awkward on a real phone. The agent records it in `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md` under "Not verified in milestone 3" or removes the line that is now verified.

---

## End of Part A

Stop here. With the owner's say-so, push the branch and open the Part A pull request. Part B starts on a new branch, `milestone-3-overlays`, cut from `main` after Part A is merged, and only when the owner says to start it.

# Part B: overlays

Work on the branch `milestone-3-overlays`. Every Global Constraint above still applies.

---

### Task 14: The edit model: what a player can change, and the sheet with it applied

A player's changes never alter the imported sheet. They are stored beside it and applied each time the sheet is built (spec section 5.4). This task defines the three types, the functions that check them when they are read, and `applyEdits`, the one pure function that turns the calculated sheet plus the edits into the sheet the views show. The views and the turn engine read only that sheet, so nothing in this task touches the web app.

**Files:**
- Modify: `packages/model/src/index.ts`
- Create: `packages/rules/src/edits.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `packages/rules/src/normalise.ts`
- Modify: `packages/rules/src/sheet.ts`
- Modify: `packages/rules/src/universal.ts`
- Modify: `packages/rules/src/views.ts`
- Create (test): `packages/rules/test/edits.test.ts`
- Modify (test): `packages/rules/test/normalise.test.ts`
- Modify (test): `packages/rules/test/views.test.ts`

**Interfaces:**
- Consumes:
  - `normalisePlayItem`, `normaliseTurn` in `packages/rules/src/normalise.ts` (Task 2), which this task extends.
  - `Sheet`, `buildSheet`, `Resource`, `combatGroups`, `exploreAbilities` in `@cw/rules`.
- Produces:
  - `@cw/model`: `TIMINGS`, `TAGS`, `RESET_TYPES` (the allowed values, as arrays), `ViewName = 'combat' | 'explore'`, `UsesEdit = { max: number; reset: ResetType }`, `AbilityEdit`, `CustomAbility`, `CharacterEdits = { abilities: Record<string, AbilityEdit>; custom: CustomAbility[]; order: Record<ViewName, string[]> }`.
  - `@cw/rules` normalisers: `normaliseEdit(data): AbilityEdit`, `normaliseCustom(data, key): CustomAbility | null`, `normaliseOrder(data): string[]`, `normaliseRoll(data): Roll | null`.
  - `@cw/rules` edits: `emptyEdits()`, `isEmptyEdit(edit)`, `applyEdits(sheet, edits): Sheet`, `defaultViews(ability)`, `viewsOf(sheet, ability)`, `sortByOrder(list, order)`, `withGroupOrder(order, groupKeys)`, `canEditUses(ability)`, `editForm(sheet, ability): EditForm`, `diffEdit(baseSheet, base, form): AbilityEdit`, and `EditForm = { timing; uses: UsesEdit | null; tags; roll; inCombat; inExplore; hidden }`.
  - `Sheet` gains `hidden: Ability[]`, `edited: string[]` and `layout: { order: Record<ViewName, string[]>; show: Record<string, { combat?: boolean; explore?: boolean }> }`.
  - `combatGroups(sheet)` gains a `universal` group and honours `layout`; `exploreAbilities(sheet)` honours `layout` and can list universal actions.

- [ ] **Step 1: Write the failing tests**

Create `packages/rules/test/edits.test.ts`:

```ts
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, CharacterEdits, CustomAbility } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { loadRaw, type Slug } from '../../../test-utils/fixtures';
import {
  applyEdits, canEditUses, defaultViews, diffEdit, editForm, emptyEdits, isEmptyEdit, sortByOrder, viewsOf,
  withGroupOrder,
} from '../src/edits';
import { availability, applyUse, clampState, emptyPlayState, pools } from '../src/play';
import { buildSheet, type Sheet } from '../src/sheet';
import { combatGroups, exploreAbilities } from '../src/views';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));
const edits = (over: Partial<CharacterEdits> = {}): CharacterEdits => ({ ...emptyEdits(), ...over });
const named = (sheet: Sheet, name: string, cost?: Ability['cost']['kind']): Ability => {
  const found = [...sheet.abilities, ...sheet.universal, ...sheet.hidden].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}`);
  return found;
};
const names = (list: Ability[]): string[] => list.map((a) => a.name);

const custom = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:1', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: [], concentration: false, description: '', ...over,
});

describe('a sheet with no edits', () => {
  it('has nothing hidden, nothing edited and an empty layout', () => {
    const sheet = sheetOf('vlad');
    expect(sheet.hidden).toEqual([]);
    expect(sheet.edited).toEqual([]);
    expect(sheet.layout).toEqual({ order: { combat: [], explore: [] }, show: {} });
  });

  it('comes back from applyEdits with the same abilities, resources and universal actions', () => {
    const sheet = sheetOf('vlad');
    const same = applyEdits(sheet, emptyEdits());
    expect(same.abilities).toEqual(sheet.abilities);
    expect(same.universal).toEqual(sheet.universal);
    expect(same.resources).toEqual(sheet.resources);
    expect(same).not.toBe(sheet);
  });
});

describe('applyEdits: one ability', () => {
  it('never changes the sheet it was given', () => {
    const sheet = sheetOf('vlad');
    const before = JSON.stringify(sheet);
    const hex = named(sheet, 'Hex');
    applyEdits(sheet, edits({
      abilities: { [hex.key]: { timing: 'action', tags: ['control'], uses: { max: 2, reset: 'long' }, hidden: true } },
      custom: [custom({ cost: { kind: 'uses', max: 1, reset: 'short' } })],
      order: { combat: [hex.key], explore: [] },
    }));
    expect(JSON.stringify(sheet)).toBe(before);
  });

  it('replaces the timing, which moves the ability to another Combat group', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { timing: 'action' } } }));
    expect(named(edited, 'Hex').timing).toBe('action');
    expect(names(combatGroups(edited).action)).toContain('Hex');
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(edited.edited).toEqual([hex.key]);
  });

  it('replaces the tags and marks them as the player\'s', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { tags: ['buff'] } } }));
    expect(named(edited, 'Action Surge')).toMatchObject({ tags: ['buff'], tagSource: 'user' });
  });

  it('replaces the roll', () => {
    const sheet = sheetOf('vlad');
    const sword = named(sheet, 'Wurms Claw - Sword');
    const roll = { kind: 'attack' as const, bonus: 9, damage: [{ dice: '1d8+5', type: 'piercing' }], optionalDamage: [] };
    const edited = applyEdits(sheet, edits({ abilities: { [sword.key]: { roll } } }));
    expect(named(edited, 'Wurms Claw - Sword').roll).toEqual(roll);
  });

  it('ignores an edit for an ability that is not on the sheet', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({ abilities: { 'item:999:base': { hidden: true, timing: 'bonus' } } }));
    expect(edited.abilities).toEqual(sheet.abilities);
    expect(edited.edited).toEqual([]);
    expect(edited.hidden).toEqual([]);
  });

  it('applies to the universal actions by the same rule', () => {
    const sheet = sheetOf('vlad');
    const dash = named(sheet, 'Dash');
    const edited = applyEdits(sheet, edits({ abilities: { [dash.key]: { timing: 'bonus', tags: ['movement'] } } }));
    expect(named(edited, 'Dash')).toMatchObject({ timing: 'bonus', tags: ['movement'] });
    expect(names(edited.universal)).toContain('Dash');
  });
});

describe('applyEdits: limited uses', () => {
  it('gives an ability with no cost a pool of its own, which Use then spends', () => {
    const sheet = sheetOf('vlad');
    const dash = named(sheet, 'Dash');
    const edited = applyEdits(sheet, edits({ abilities: { [dash.key]: { uses: { max: 2, reset: 'short' } } } }));
    const row = named(edited, 'Dash');
    expect(row.cost).toEqual({ kind: 'uses', resourceKey: dash.key });
    expect(edited.resources).toContainEqual({ key: dash.key, name: 'Dash', max: 2, reset: 'short' });
    let state = applyUse(row, edited, emptyPlayState());
    expect(state.spent[dash.key]).toBe(1);
    state = applyUse(row, edited, { ...state, turn: emptyPlayState().turn });
    expect(availability(row, edited, { ...state, turn: emptyPlayState().turn })).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('changes the maximum and reset of the pool an ability already spends from', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { uses: { max: 5, reset: 'short' } } } }));
    expect(edited.resources.find((r) => r.key === wind.key)).toMatchObject({ name: 'Second Wind', max: 5, reset: 'short' });
    expect(edited.resources).toHaveLength(sheet.resources.length);
  });

  it('changes an item\'s pool when the edited ability spends the item\'s charges', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    if (ray.cost.kind !== 'uses') throw new Error('expected Scorching Ray to spend charges');
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { uses: { max: 3, reset: 'long' } } } }));
    expect(edited.resources.find((r) => r.key === (ray.cost as { resourceKey: string }).resourceKey)?.max).toBe(3);
    expect(named(edited, 'Scorching Ray').cost).toEqual(ray.cost);
  });

  it('removes the cost and the pool with "none"', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { uses: 'none' } } }));
    expect(named(edited, 'Action Surge').cost).toEqual({ kind: 'none' });
    expect(edited.resources.some((r) => r.key === surge.key)).toBe(false);
  });

  it('keeps a pool that something else still uses when one user gives it up', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    const key = (ray.cost as { resourceKey: string }).resourceKey;
    const staff = sheet.abilities.find((a) => a.poolKey === key);
    expect(staff).toBeDefined();
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { uses: 'none' } } }));
    expect(edited.resources.some((r) => r.key === key)).toBe(true);
  });

  it('leaves an ability that costs a spell slot alone', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    expect(canEditUses(hex)).toBe(false);
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { uses: { max: 4, reset: 'long' } } } }));
    expect(named(edited, 'Hex').cost).toEqual(hex.cost);
    expect(edited.resources).toEqual(sheet.resources);
  });

  it('clamps what was spent to an edited maximum', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { uses: { max: 1, reset: 'long' } } } }));
    const state = clampState({ ...emptyPlayState(), spent: { [wind.key]: 3 } }, edited);
    expect(state.spent[wind.key]).toBe(1);
  });
});

describe('applyEdits: hiding', () => {
  it('moves a hidden ability out of both views and into the hidden list', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { hidden: true } } }));
    expect(names(edited.abilities)).not.toContain('Hex');
    expect(names(edited.hidden)).toEqual(['Hex']);
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(names(exploreAbilities(edited))).not.toContain('Hex');
  });

  it('hides a universal action too', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({ abilities: { [named(sheet, 'Utilize').key]: { hidden: true } } }));
    expect(names(edited.universal)).not.toContain('Utilize');
    expect(names(edited.hidden)).toEqual(['Utilize']);
  });

  it('drops the resource chip of a pool whose every user is hidden', () => {
    const sheet = sheetOf('danger');
    const surge = named(sheet, 'Action Surge');
    const edited = applyEdits(sheet, edits({ abilities: { [surge.key]: { hidden: true } } }));
    expect(edited.resources.some((r) => r.key === surge.key)).toBe(false);
    expect(pools(edited).some((p) => p.key === surge.key)).toBe(false);
  });

  it('keeps the chip while another user of the pool is still shown, and for a pool nothing uses', () => {
    const sheet = sheetOf('maya');
    const ray = named(sheet, 'Scorching Ray');
    const key = (ray.cost as { resourceKey: string }).resourceKey;
    const edited = applyEdits(sheet, edits({ abilities: { [ray.key]: { hidden: true } } }));
    expect(edited.resources.some((r) => r.key === key)).toBe(true);
    const unused = { key: 'item:1:base', name: 'Wand', max: 3, reset: 'long' as const };
    const withWand = applyEdits({ ...sheet, resources: [...sheet.resources, unused] }, emptyEdits());
    expect(withWand.resources).toContainEqual(unused);
  });
});

describe('applyEdits: custom abilities', () => {
  it('adds a custom ability as a row of source "custom"', () => {
    const sheet = sheetOf('franny');
    const edited = applyEdits(sheet, edits({ custom: [custom({ tags: ['buff'], concentration: true })] }));
    expect(named(edited, 'Pack Howl')).toMatchObject({
      key: 'own:1', source: 'custom', timing: 'bonus', tags: ['buff'], tagSource: 'user', concentration: true, cost: { kind: 'none' },
    });
    expect(names(combatGroups(edited).bonus)).toContain('Pack Howl');
  });

  it('gives a custom ability with uses a pool under its own key', () => {
    const edited = applyEdits(sheetOf('franny'), edits({ custom: [custom({ cost: { kind: 'uses', max: 2, reset: 'long' } })] }));
    expect(named(edited, 'Pack Howl').cost).toEqual({ kind: 'uses', resourceKey: 'own:1' });
    expect(edited.resources).toContainEqual({ key: 'own:1', name: 'Pack Howl', max: 2, reset: 'long' });
  });

  it('lets a custom ability cost a spell slot, which the turn engine then offers', () => {
    const sheet = sheetOf('minkis');
    const edited = applyEdits(sheet, edits({ custom: [custom({ timing: 'action', cost: { kind: 'slot', minLevel: 2 } })] }));
    const row = named(edited, 'Pack Howl');
    expect(row.cost).toEqual({ kind: 'slot', minLevel: 2, pact: false });
    expect(availability(row, edited, emptyPlayState()).slotOptions.map((o) => o.key)).toEqual(['slot:2']);
  });

  it('marks a slot cost as pact magic on a character with only pact slots', () => {
    const edited = applyEdits(sheetOf('vlad'), edits({ custom: [custom({ cost: { kind: 'slot', minLevel: 1 } })] }));
    expect(named(edited, 'Pack Howl').cost).toEqual({ kind: 'slot', minLevel: 1, pact: true });
  });

  it('escapes the plain-text description and keeps its line breaks', () => {
    const edited = applyEdits(sheetOf('franny'), edits({
      custom: [custom({ description: 'Deal 1d6 <fire> & "more".\nOnce per turn.' })],
    }));
    expect(named(edited, 'Pack Howl').description).toBe('Deal 1d6 &lt;fire&gt; &amp; &quot;more&quot;.<br>Once per turn.');
  });

  it('hides and re-homes a custom ability through an edit under its key, like any other', () => {
    const edited = applyEdits(sheetOf('franny'), edits({
      custom: [custom(), custom({ key: 'own:2', name: 'Second' })],
      abilities: { 'own:1': { hidden: true }, 'own:2': { inExplore: true } },
    }));
    expect(names(edited.hidden)).toEqual(['Pack Howl']);
    expect(names(exploreAbilities(edited))).toContain('Second');
  });
});

describe('which views list an ability', () => {
  it('follows the app\'s rule until the player chooses', () => {
    const sheet = sheetOf('vlad');
    expect(defaultViews(named(sheet, 'Hex'))).toEqual({ combat: true, explore: false });
    expect(defaultViews(named(sheet, 'Misty Step', 'slot'))).toEqual({ combat: true, explore: true });
    expect(defaultViews(named(sheet, 'Dash'))).toEqual({ combat: true, explore: false });
    expect(defaultViews({ ...named(sheet, 'Hex'), timing: 'long' })).toEqual({ combat: false, explore: true });
    expect(defaultViews({ ...named(sheet, 'Hex'), ritual: true })).toEqual({ combat: true, explore: true });
  });

  it('puts an ability in Explore when the player ticks it', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    expect(names(exploreAbilities(sheet))).not.toContain('Second Wind');
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: { inExplore: true } } }));
    expect(names(exploreAbilities(edited))).toContain('Second Wind');
    expect(viewsOf(edited, named(edited, 'Second Wind'))).toEqual({ combat: true, explore: true });
  });

  it('takes an ability out of Combat when the player unticks it', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { inCombat: false, inExplore: true } } }));
    expect(names(combatGroups(edited).bonus)).not.toContain('Hex');
    expect(names(exploreAbilities(edited))).toContain('Hex');
  });

  it('lists an ability forced into Combat under "Other" when its timing has no group', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    const edited = applyEdits(sheet, edits({ abilities: { [hex.key]: { timing: 'long', inCombat: true } } }));
    expect(names(combatGroups(edited).other)).toContain('Hex');
  });

  it('can put a universal action in Explore and take one out of Combat', () => {
    const sheet = sheetOf('vlad');
    const edited = applyEdits(sheet, edits({
      abilities: { [named(sheet, 'Search').key]: { inExplore: true }, [named(sheet, 'Ready').key]: { inCombat: false } },
    }));
    expect(names(exploreAbilities(edited))).toContain('Search');
    expect(names(combatGroups(edited).universal)).not.toContain('Ready');
    expect(names(combatGroups(edited).universal)).toContain('Search');
  });
});

describe('order', () => {
  it('sortByOrder puts the listed keys first, in list order, and keeps the rest where they were', () => {
    const list = ['a', 'b', 'c', 'd'].map((key) => ({ key }));
    expect(sortByOrder(list, ['c', 'a', 'gone']).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortByOrder(list, [])).toEqual(list);
  });

  it('withGroupOrder replaces a group\'s keys and leaves the other groups\' order alone', () => {
    expect(withGroupOrder(['x', 'a', 'y', 'b'], ['b', 'a', 'c'])).toEqual(['x', 'y', 'b', 'a', 'c']);
    expect(withGroupOrder([], ['b', 'a'])).toEqual(['b', 'a']);
  });

  it('orders each Combat group, and Explore separately', () => {
    const sheet = sheetOf('vlad');
    const actions = combatGroups(sheet).action;
    const reversed = [...actions].reverse().map((a) => a.key);
    const edited = applyEdits(sheet, edits({ order: { combat: reversed, explore: [] } }));
    expect(combatGroups(edited).action.map((a) => a.key)).toEqual(reversed);
    expect(exploreAbilities(edited).map((a) => a.key)).toEqual(exploreAbilities(sheet).map((a) => a.key));
  });

  it('puts an ability the order does not mention at the end of its group', () => {
    const sheet = sheetOf('vlad');
    const [first, second, ...rest] = combatGroups(sheet).action;
    const edited = applyEdits(sheet, edits({ order: { combat: [second.key, first.key], explore: [] } }));
    expect(combatGroups(edited).action.map((a) => a.key)).toEqual([second.key, first.key, ...rest.map((a) => a.key)]);
  });

  it('orders the universal group too', () => {
    const sheet = sheetOf('vlad');
    const dodge = named(sheet, 'Dodge');
    const edited = applyEdits(sheet, edits({ order: { combat: [dodge.key], explore: [] } }));
    expect(combatGroups(edited).universal[0].name).toBe('Dodge');
  });
});

describe('the editor\'s form', () => {
  it('describes an ability as it stands', () => {
    const sheet = sheetOf('danger');
    expect(editForm(sheet, named(sheet, 'Second Wind'))).toEqual({
      timing: 'bonus', uses: { max: 3, reset: 'long' }, tags: [], roll: { kind: 'dice', dice: '1d10+9' },
      inCombat: true, inExplore: false, hidden: false,
    });
    expect(editForm(sheet, named(sheet, 'Dash')).uses).toBeNull();
  });

  it('records nothing when the form is unchanged', () => {
    const sheet = sheetOf('danger');
    for (const ability of [...sheet.abilities, ...sheet.universal]) {
      expect(diffEdit(sheet, ability, editForm(sheet, ability))).toEqual({});
    }
    expect(isEmptyEdit({})).toBe(true);
    expect(isEmptyEdit({ hidden: true })).toBe(false);
  });

  it('records only the fields that differ from the imported ability', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const form = editForm(sheet, wind);
    expect(diffEdit(sheet, wind, { ...form, timing: 'action' })).toEqual({ timing: 'action' });
    expect(diffEdit(sheet, wind, { ...form, uses: { max: 4, reset: 'long' } })).toEqual({ uses: { max: 4, reset: 'long' } });
    expect(diffEdit(sheet, wind, { ...form, uses: null })).toEqual({ uses: 'none' });
    expect(diffEdit(sheet, wind, { ...form, hidden: true })).toEqual({ hidden: true });
    expect(diffEdit(sheet, wind, { ...form, roll: { kind: 'none' } })).toEqual({ roll: { kind: 'none' } });
  });

  it('does not record a view that the new tags or timing would put the ability in anyway', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const form = editForm(sheet, wind);
    expect(diffEdit(sheet, wind, { ...form, tags: ['utility'], inExplore: true })).toEqual({ tags: ['utility'] });
    expect(diffEdit(sheet, wind, { ...form, tags: ['utility'], inExplore: false })).toEqual({ tags: ['utility'], inExplore: false });
    expect(diffEdit(sheet, wind, { ...form, inExplore: true })).toEqual({ inExplore: true });
  });

  it('ignores the order of tags', () => {
    const sheet = sheetOf('vlad');
    const step = named(sheet, 'Misty Step', 'slot');
    const form = editForm(sheet, step);
    expect(diffEdit(sheet, step, { ...form, tags: [...form.tags].reverse() })).toEqual({});
  });

  it('never records uses for an ability that costs a spell slot', () => {
    const sheet = sheetOf('vlad');
    const hex = named(sheet, 'Hex');
    expect(diffEdit(sheet, hex, { ...editForm(sheet, hex), uses: { max: 2, reset: 'long' } })).toEqual({});
  });

  it('round-trips: applying the recorded edit gives a sheet whose form is the one that was saved', () => {
    const sheet = sheetOf('danger');
    const wind = named(sheet, 'Second Wind');
    const wanted = {
      timing: 'action' as const, uses: { max: 2, reset: 'short' as const }, tags: ['healing' as const],
      roll: { kind: 'dice' as const, dice: '1d10+12' }, inCombat: true, inExplore: true, hidden: false,
    };
    const edited = applyEdits(sheet, edits({ abilities: { [wind.key]: diffEdit(sheet, wind, wanted) } }));
    expect(editForm(edited, named(edited, 'Second Wind'))).toEqual(wanted);
  });
});
```

Apply this change to `packages/rules/test/normalise.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,5 +1,7 @@
 import { describe, expect, it } from 'vitest';
-import { normalisePlayItem, normaliseTurn } from '../src/normalise';
+import {
+  normaliseCustom, normaliseEdit, normaliseOrder, normalisePlayItem, normaliseRoll, normaliseTurn,
+} from '../src/normalise';
 
 describe('normalisePlayItem', () => {
   it('keeps a well-formed item as it is', () => {
@@ -31,3 +33,115 @@ describe('normaliseTurn', () => {
     expect(normaliseTurn(data)).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
   });
 });
+
+describe('normaliseRoll', () => {
+  it('keeps each kind of roll that is well formed', () => {
+    const rolls = [
+      { kind: 'none' },
+      { kind: 'attack', bonus: 5, damage: [{ dice: '1d8+3', type: 'piercing' }], optionalDamage: [{ dice: '1d6', type: 'poison' }] },
+      { kind: 'save', ability: 'wis', dc: 13, damage: [{ dice: '2d6', type: null }] },
+      { kind: 'check', bonus: -1 },
+      { kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] },
+      { kind: 'dice', dice: '1d10+9' },
+    ];
+    for (const roll of rolls) expect(normaliseRoll(roll)).toEqual(roll);
+  });
+
+  it('fills in the damage lists an attack or save left out', () => {
+    expect(normaliseRoll({ kind: 'attack', bonus: 4 })).toEqual({ kind: 'attack', bonus: 4, damage: [], optionalDamage: [] });
+    expect(normaliseRoll({ kind: 'save', ability: 'dex', dc: 12 })).toEqual({ kind: 'save', ability: 'dex', dc: 12, damage: [] });
+  });
+
+  it('trims dice and types, drops damage parts with no dice, and turns an empty type into none', () => {
+    const roll = normaliseRoll({ kind: 'damage', damage: [{ dice: ' 2d6 ', type: ' fire ' }, { dice: '', type: 'cold' }, { dice: '4', type: '' }, 'junk'] });
+    expect(roll).toEqual({ kind: 'damage', damage: [{ dice: '2d6', type: 'fire' }, { dice: '4', type: null }] });
+  });
+
+  it('rounds and bounds numbers', () => {
+    expect(normaliseRoll({ kind: 'check', bonus: 3.9 })).toEqual({ kind: 'check', bonus: 3 });
+    expect(normaliseRoll({ kind: 'check', bonus: 999 })).toEqual({ kind: 'check', bonus: 40 });
+    expect(normaliseRoll({ kind: 'save', ability: 'con', dc: 0, damage: [] })).toEqual({ kind: 'save', ability: 'con', dc: 1, damage: [] });
+  });
+
+  it.each([
+    [null], ['attack'], [{}], [{ kind: 'spell' }], [{ kind: 'attack', bonus: 'five' }],
+    [{ kind: 'save', ability: 'luck', dc: 13 }], [{ kind: 'save', ability: 'wis' }],
+    [{ kind: 'damage', damage: [] }], [{ kind: 'dice', dice: '  ' }],
+  ])('returns null for %j', (data) => {
+    expect(normaliseRoll(data)).toBeNull();
+  });
+});
+
+describe('normaliseEdit', () => {
+  it('keeps a well-formed edit as it is', () => {
+    const edit = {
+      timing: 'bonus', uses: { max: 3, reset: 'short' }, tags: ['damage', 'control'],
+      roll: { kind: 'dice', dice: '1d4' }, inCombat: false, inExplore: true, hidden: true,
+    };
+    expect(normaliseEdit(edit)).toEqual(edit);
+    expect(normaliseEdit({ uses: 'none' })).toEqual({ uses: 'none' });
+  });
+
+  it.each([null, undefined, 3, 'x', []])('turns %j into an edit that changes nothing', (data) => {
+    expect(normaliseEdit(data)).toEqual({});
+  });
+
+  it('leaves out each field that is malformed, and keeps the rest', () => {
+    expect(normaliseEdit({
+      timing: 'instant', uses: { max: 'many', reset: 'long' }, tags: 'damage', roll: { kind: 'attack' },
+      inCombat: 'yes', inExplore: 0, hidden: 'true', extra: 1,
+    })).toEqual({});
+    expect(normaliseEdit({ timing: 'reaction', uses: { max: 2 } })).toEqual({ timing: 'reaction' });
+  });
+
+  it('drops unknown and repeated tags, and keeps an empty list as "no tags"', () => {
+    expect(normaliseEdit({ tags: ['damage', 'sparkly', 'damage', 'social'] })).toEqual({ tags: ['damage', 'social'] });
+    expect(normaliseEdit({ tags: [] })).toEqual({ tags: [] });
+  });
+
+  it('bounds a maximum to 1 to 99 and never stores hidden as false', () => {
+    expect(normaliseEdit({ uses: { max: 0, reset: 'long' }, hidden: false })).toEqual({ uses: { max: 1, reset: 'long' } });
+    expect(normaliseEdit({ uses: { max: 250.7, reset: 'never' } })).toEqual({ uses: { max: 99, reset: 'never' } });
+  });
+});
+
+describe('normaliseCustom', () => {
+  it('keeps a well-formed custom ability and takes its key from the item, not the data', () => {
+    const data = {
+      key: 'own:something-else', name: ' Pack Tactics ', timing: 'free', roll: { kind: 'none' },
+      cost: { kind: 'uses', max: 2, reset: 'long' }, tags: ['buff'], concentration: true, description: 'Line one\nLine two',
+    };
+    expect(normaliseCustom(data, 'own:1')).toEqual({
+      key: 'own:1', name: 'Pack Tactics', timing: 'free', roll: { kind: 'none' },
+      cost: { kind: 'uses', max: 2, reset: 'long' }, tags: ['buff'], concentration: true, description: 'Line one\nLine two',
+    });
+  });
+
+  it('fills in everything but the name', () => {
+    expect(normaliseCustom({ name: 'Howl' }, 'own:2')).toEqual({
+      key: 'own:2', name: 'Howl', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' },
+      tags: [], concentration: false, description: '',
+    });
+  });
+
+  it('keeps a slot cost within levels 1 to 9, and falls back to no cost when the cost is malformed', () => {
+    expect(normaliseCustom({ name: 'A', cost: { kind: 'slot', minLevel: 12 } }, 'k')?.cost).toEqual({ kind: 'slot', minLevel: 9 });
+    expect(normaliseCustom({ name: 'A', cost: { kind: 'slot' } }, 'k')?.cost).toEqual({ kind: 'none' });
+    expect(normaliseCustom({ name: 'A', cost: { kind: 'uses', max: 3 } }, 'k')?.cost).toEqual({ kind: 'none' });
+    expect(normaliseCustom({ name: 'A', cost: 'free' }, 'k')?.cost).toEqual({ kind: 'none' });
+  });
+
+  it.each([null, 'x', {}, { name: '' }, { name: '   ' }, { name: 7 }])('returns null for %j, which has no name to show', (data) => {
+    expect(normaliseCustom(data, 'k')).toBeNull();
+  });
+});
+
+describe('normaliseOrder', () => {
+  it('keeps a list of keys, without repeats, blanks or anything that is not text', () => {
+    expect(normaliseOrder(['a', 'b', 'a', '', 3, null, 'c'])).toEqual(['a', 'b', 'c']);
+  });
+
+  it.each([null, undefined, 'a,b', { 0: 'a' }])('turns %j into an empty order', (data) => {
+    expect(normaliseOrder(data)).toEqual([]);
+  });
+});
```

Replace the whole of `packages/rules/test/views.test.ts` with:

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
    const { universal, ...groups } = combatGroups(sheet);
    const shown = Object.values(groups).reduce((n, list) => n + list.length, 0);
    expect(shown).toBe(sheet.abilities.filter((a) => a.timing !== 'long').length);
    expect(universal).toEqual(sheet.universal);
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

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run packages/rules/test/edits.test.ts packages/rules/test/normalise.test.ts packages/rules/test/views.test.ts
```

Expected: FAIL. `../src/edits` cannot be found, and `normaliseEdit`, `normaliseCustom`, `normaliseOrder` and `normaliseRoll` are not exported.

- [ ] **Step 3: Write the implementation**

`diffEdit` records only the fields that differ from the imported ability, so the fields the player did not touch keep following the imported sheet after a re-import. For the two "shown in" boxes it compares against where the *edited* ability would go by default: giving an ability the tag `utility` puts it in Explore without recording `inExplore`.

The two universal actions whose text said "listed above" are reworded, because rows can now be reordered and hidden.

Apply this change to `packages/model/src/index.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -35,13 +35,16 @@ export type SkillName = keyof typeof SKILL_ABILITY;
 export const SKILLS = Object.keys(SKILL_ABILITY) as SkillName[];
 
 /** 'free' = usable without an Action, Bonus Action or Reaction. 'long' = a minute or more. */
-export type Timing = 'action' | 'bonus' | 'reaction' | 'free' | 'passive' | 'long' | 'unknown';
+export const TIMINGS = ['action', 'bonus', 'reaction', 'free', 'passive', 'long', 'unknown'] as const;
+export type Timing = (typeof TIMINGS)[number];
 
-export type Tag =
-  | 'damage' | 'healing' | 'buff' | 'debuff' | 'control'
-  | 'movement' | 'defence' | 'utility' | 'social';
+export const TAGS = [
+  'damage', 'healing', 'buff', 'debuff', 'control', 'movement', 'defence', 'utility', 'social',
+] as const;
+export type Tag = (typeof TAGS)[number];
 
-export type ResetType = 'short' | 'long' | 'never' | 'unknown';
+export const RESET_TYPES = ['short', 'long', 'never', 'unknown'] as const;
+export type ResetType = (typeof RESET_TYPES)[number];
 export type ProficiencyLevel = 'none' | 'half' | 'proficient' | 'expertise';
 
 /** One D&D Beyond modifier row that is currently in effect. */
@@ -239,3 +242,52 @@ export interface PlayState {
   concentrationKey: string | null;
   turn: TurnState;
 }
+
+/** The two views. Each keeps its own order of abilities. */
+export type ViewName = 'combat' | 'explore';
+
+/** A limited-use pool as the player sets it: how many, and when they come back. */
+export interface UsesEdit {
+  max: number;
+  reset: ResetType;
+}
+
+/**
+ * A player's changes to one ability, stored beside the imported sheet and applied each time the
+ * sheet is built. An absent field means "as imported".
+ */
+export interface AbilityEdit {
+  timing?: Timing;
+  /** 'none' removes the ability's limited uses. */
+  uses?: UsesEdit | 'none';
+  tags?: Tag[];
+  roll?: Roll;
+  inCombat?: boolean;
+  inExplore?: boolean;
+  hidden?: boolean;
+}
+
+/** An ability the player added. Its key is `own:<uuid>`. */
+export interface CustomAbility {
+  key: string;
+  name: string;
+  timing: Timing;
+  roll: Roll;
+  cost:
+    | { kind: 'none' }
+    | { kind: 'uses'; max: number; reset: ResetType }
+    | { kind: 'slot'; minLevel: number };
+  tags: Tag[];
+  concentration: boolean;
+  /** Plain text, escaped before it is shown. */
+  description: string;
+}
+
+/** Everything a player has changed on one character. */
+export interface CharacterEdits {
+  /** By ability key. */
+  abilities: Record<string, AbilityEdit>;
+  custom: CustomAbility[];
+  /** Ability keys in the order the player arranged them, for each view. */
+  order: Record<ViewName, string[]>;
+}
```

Create `packages/rules/src/edits.ts`:

```ts
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
```

Replace the whole of `packages/rules/src/index.ts` with:

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
export * from './normalise';
export * from './edits';
export * from './views';
```

Apply this change to `packages/rules/src/normalise.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,4 +1,8 @@
-import type { PlayState, TurnState } from '@cw/model';
+import {
+  ABILITIES, RESET_TYPES, TAGS, TIMINGS,
+  type AbilityEdit, type AbilityName, type CustomAbility, type DamagePart, type PlayState, type ResetType,
+  type Roll, type Tag, type Timing, type TurnState, type UsesEdit,
+} from '@cw/model';
 
 /** The part of the play state that syncs: what is spent and what is being concentrated on. */
 export type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>;
@@ -6,6 +10,12 @@ export type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>;
 const isRecord = (v: unknown): v is Record<string, unknown> =>
   v !== null && typeof v === 'object' && !Array.isArray(v);
 
+const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
+  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;
+
+const wholeNumber = (value: unknown, min: number, max: number): number | null =>
+  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : null;
+
 /**
  * Stored and synced records are checked and repaired before use, because they may have been
  * written by an older version of the app, by another device, or by hand in the database.
@@ -32,3 +42,111 @@ export function normaliseTurn(data: unknown): TurnState {
     slotSpentThisTurn: source.slotSpentThisTurn === true,
   };
 }
+
+function damageParts(data: unknown): DamagePart[] {
+  if (!Array.isArray(data)) return [];
+  const out: DamagePart[] = [];
+  for (const part of data) {
+    if (!isRecord(part) || typeof part.dice !== 'string' || part.dice.trim() === '') continue;
+    out.push({ dice: part.dice.trim(), type: typeof part.type === 'string' && part.type.trim() !== '' ? part.type.trim() : null });
+  }
+  return out;
+}
+
+/** A roll as stored, or null if it is not one. Bonuses and DCs are whole numbers within sane bounds. */
+export function normaliseRoll(data: unknown): Roll | null {
+  if (!isRecord(data)) return null;
+  switch (data.kind) {
+    case 'none':
+      return { kind: 'none' };
+    case 'attack': {
+      const bonus = wholeNumber(data.bonus, -20, 40);
+      return bonus === null
+        ? null
+        : { kind: 'attack', bonus, damage: damageParts(data.damage), optionalDamage: damageParts(data.optionalDamage) };
+    }
+    case 'save': {
+      const ability = oneOf<AbilityName>(ABILITIES, data.ability);
+      const dc = wholeNumber(data.dc, 1, 40);
+      return ability === null || dc === null ? null : { kind: 'save', ability, dc, damage: damageParts(data.damage) };
+    }
+    case 'check': {
+      const bonus = wholeNumber(data.bonus, -20, 40);
+      return bonus === null ? null : { kind: 'check', bonus };
+    }
+    case 'damage': {
+      const damage = damageParts(data.damage);
+      return damage.length === 0 ? null : { kind: 'damage', damage };
+    }
+    case 'dice':
+      return typeof data.dice === 'string' && data.dice.trim() !== '' ? { kind: 'dice', dice: data.dice.trim() } : null;
+    default:
+      return null;
+  }
+}
+
+function tagList(data: unknown): Tag[] | null {
+  if (!Array.isArray(data)) return null;
+  const out: Tag[] = [];
+  for (const value of data) {
+    const tag = oneOf<Tag>(TAGS, value);
+    if (tag && !out.includes(tag)) out.push(tag);
+  }
+  return out;
+}
+
+function usesEdit(data: unknown): UsesEdit | null {
+  if (!isRecord(data)) return null;
+  const max = wholeNumber(data.max, 1, 99);
+  const reset = oneOf<ResetType>(RESET_TYPES, data.reset);
+  return max === null || reset === null ? null : { max, reset };
+}
+
+/** One ability's edits. A field that is missing or malformed is left out, which means "as imported". */
+export function normaliseEdit(data: unknown): AbilityEdit {
+  const source = isRecord(data) ? data : {};
+  const edit: AbilityEdit = {};
+  const timing = oneOf<Timing>(TIMINGS, source.timing);
+  if (timing) edit.timing = timing;
+  if (source.uses === 'none') edit.uses = 'none';
+  else {
+    const uses = usesEdit(source.uses);
+    if (uses) edit.uses = uses;
+  }
+  const tags = tagList(source.tags);
+  if (tags) edit.tags = tags;
+  const roll = normaliseRoll(source.roll);
+  if (roll) edit.roll = roll;
+  if (typeof source.inCombat === 'boolean') edit.inCombat = source.inCombat;
+  if (typeof source.inExplore === 'boolean') edit.inExplore = source.inExplore;
+  if (source.hidden === true) edit.hidden = true;
+  return edit;
+}
+
+/** An ability the player added, or null if it has no name and so cannot be shown. */
+export function normaliseCustom(data: unknown, key: string): CustomAbility | null {
+  if (!isRecord(data) || typeof data.name !== 'string' || data.name.trim() === '') return null;
+  const cost = isRecord(data.cost) ? data.cost : {};
+  const uses = cost.kind === 'uses' ? usesEdit(cost) : null;
+  const minLevel = cost.kind === 'slot' ? wholeNumber(cost.minLevel, 1, 9) : null;
+  return {
+    key,
+    name: data.name.trim(),
+    timing: oneOf<Timing>(TIMINGS, data.timing) ?? 'unknown',
+    roll: normaliseRoll(data.roll) ?? { kind: 'none' },
+    cost: uses ? { kind: 'uses', ...uses } : minLevel !== null ? { kind: 'slot', minLevel } : { kind: 'none' },
+    tags: tagList(data.tags) ?? [],
+    concentration: data.concentration === true,
+    description: typeof data.description === 'string' ? data.description : '',
+  };
+}
+
+/** A view's order: a list of ability keys with no repeats. */
+export function normaliseOrder(data: unknown): string[] {
+  if (!Array.isArray(data)) return [];
+  const out: string[] = [];
+  for (const key of data) {
+    if (typeof key === 'string' && key !== '' && !out.includes(key)) out.push(key);
+  }
+  return out;
+}
```

Replace the whole of `packages/rules/src/sheet.ts` with:

```ts
import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type ProficiencyLevel, type SkillName, type ViewName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';
import { universalActions } from './universal';

/** How the player has arranged the views. Empty on a sheet with no edits. */
export interface SheetLayout {
  /** Ability keys in the player's order, for each view. Abilities not listed follow in sheet order. */
  order: Record<ViewName, string[]>;
  /** By ability key: the player's choice of which views list it. Absent means the app decides. */
  show: Record<string, { combat?: boolean; explore?: boolean }>;
}

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
  /** The actions every character can take. Kept apart from `abilities`, which come from the sheet. */
  universal: Ability[];
  notes: Note[];
  /** Abilities the player has hidden. They are in neither `abilities` nor `universal`. */
  hidden: Ability[];
  /** Keys of the abilities that carry an edit. */
  edited: string[];
  layout: SheetLayout;
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
    universal: universalActions(),
    notes: conditionalNotes(c),
    hidden: [],
    edited: [],
    layout: { order: { combat: [], explore: [] }, show: {} },
  };
}
```

Replace the whole of `packages/rules/src/universal.ts` with:

```ts
import type { Ability } from '@cw/model';

/**
 * The actions every character can take, summarised in our own words from SRD 5.2
 * (CC-BY-4.0; the attribution is in the README and on the About screen).
 */
const UNIVERSAL: { slug: string; name: string; description: string }[] = [
  { slug: 'attack', name: 'Attack', description: 'Attack with a weapon or an Unarmed Strike. Each of your weapons has its own row.' },
  { slug: 'dash', name: 'Dash', description: 'Gain extra movement equal to your Speed for the rest of this turn.' },
  { slug: 'disengage', name: 'Disengage', description: 'Your movement does not provoke Opportunity Attacks for the rest of this turn.' },
  { slug: 'dodge', name: 'Dodge', description: 'Until your next turn, attacks against you have Disadvantage if you can see the attacker, and you make Dexterity saves with Advantage.' },
  { slug: 'help', name: 'Help', description: 'Give an ally Advantage on an ability check or on their next attack against a creature within 5 feet of you.' },
  { slug: 'hide', name: 'Hide', description: 'Make a Dexterity (Stealth) check to become hidden. You need cover or heavy obscurement, out of sight of enemies.' },
  { slug: 'influence', name: 'Influence', description: 'Make a Charisma check, or a Wisdom (Animal Handling) check, to change how a creature treats you.' },
  { slug: 'magic', name: 'Magic', description: 'Cast a spell, use a magic item, or use a magical feature. Each of your spells has its own row.' },
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

Replace the whole of `packages/rules/src/views.ts` with:

```ts
import type { Ability } from '@cw/model';
import { sortByOrder, viewsOf } from './edits';
import type { Sheet } from './sheet';

export interface CombatGroups {
  action: Ability[];
  bonus: Ability[];
  reaction: Ability[];
  /** "No action needed": timing free or passive. */
  free: Ability[];
  /** Timing the import could not tell, and abilities the player put in Combat that have no group there. */
  other: Ability[];
  /** "Anyone can do this": the universal actions. */
  universal: Ability[];
}

export type CombatGroupName = keyof CombatGroups;

/**
 * The Combat view's groups, each in the player's order. An ability is listed unless it takes a
 * minute or more, or the player has chosen otherwise.
 */
export function combatGroups(sheet: Sheet): CombatGroups {
  const groups: CombatGroups = { action: [], bonus: [], reaction: [], free: [], other: [], universal: [] };
  for (const a of sheet.abilities) {
    if (!viewsOf(sheet, a).combat) continue;
    if (a.timing === 'action' || a.timing === 'bonus' || a.timing === 'reaction') groups[a.timing].push(a);
    else if (a.timing === 'free' || a.timing === 'passive') groups.free.push(a);
    else groups.other.push(a);
  }
  groups.universal = sheet.universal.filter((a) => viewsOf(sheet, a).combat);
  const order = sheet.layout.order.combat;
  for (const name of Object.keys(groups) as CombatGroupName[]) groups[name] = sortByOrder(groups[name], order);
  return groups;
}

/**
 * The Explore view's abilities, in the player's order: those tagged utility, social or movement,
 * rituals, anything taking a minute or more, and whatever the player has put there.
 */
export function exploreAbilities(sheet: Sheet): Ability[] {
  const listed = [...sheet.abilities, ...sheet.universal].filter((a) => viewsOf(sheet, a).explore);
  return sortByOrder(listed, sheet.layout.order.explore);
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (902 tests in 39 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The edit model: what a player can change, checked on read and applied to the sheet" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 15: The store holds a character's edits and applies them to the sheet

The store loads the open character's edits from its items, keeps the imported sheet and the edited sheet side by side, and gains four actions that change edits. Each action writes one or two items, marked dirty, and the sync engine of Task 5 carries them to the account with no change of its own. No screen changes in this task.

**Files:**
- Create (test): `apps/web/src/store.edits.test.ts`
- Modify: `apps/web/src/store.ts`

**Interfaces:**
- Consumes:
  - `AbilityEdit`, `CustomAbility`, `CharacterEdits`, `ViewName` from `@cw/model`; `applyEdits`, `emptyEdits`, `isEmptyEdit`, `withGroupOrder`, `normaliseEdit`, `normaliseCustom`, `normaliseOrder` from `@cw/rules` (the task before this one).
  - `StoredItem`, `SyncedKind` from `apps/web/src/storage`; `nextStamp` from `apps/web/src/sync/engine.ts`.
- Produces:
  - Store state: `baseSheet: Sheet | null` (the sheet as imported), `edits: CharacterEdits` (the open character's), and `sheet`, which is now `applyEdits(baseSheet, edits)`.
  - Store actions: `setEdit(abilityKey: string, edit: AbilityEdit): void` (an edit that changes nothing removes the ability's edits), `saveCustom(custom: CustomAbility): void`, `deleteCustom(abilityKey: string): void`, `setOrder(view: ViewName, groupKeys: string[]): void`.
  - `newCustomKey(): string` (`own:<uuid>`) and `editsFrom(items: StoredItem[]): CharacterEdits`, both exported from `apps/web/src/store.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/store.edits.test.ts`:

```ts
import type { CustomAbility } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { loadRaw } from '../../../test-utils/fixtures';
import { memoryStorage, type AppStorage, type StoredItem } from './storage';
import { editsFrom, newCustomKey, useStore } from './store';
import { syncOnce } from './sync/engine';
import { TEST_USER, ability, seed, testRemote, testServer } from './test/helpers';

const state = () => useStore.getState();

/** Lets the store's fire-and-forget storage writes finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const itemsOf = async (storage: AppStorage, id: string, kind: StoredItem['kind']): Promise<StoredItem[]> =>
  (await storage.listItems(id)).filter((item) => item.kind === kind);

const names = (list: { name: string }[]): string[] => list.map((a) => a.name);

const howl = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:1', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.', ...over,
});

describe('editing an ability', () => {
  it('changes the sheet on screen, keeps the imported sheet, and stores the edit as a dirty item', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const hex = ability('Hex');
    state().setEdit(hex.key, { timing: 'action', tags: ['debuff'] });
    expect(ability('Hex')).toMatchObject({ timing: 'action', tags: ['debuff'], tagSource: 'user' });
    expect(state().baseSheet?.abilities.find((a) => a.key === hex.key)?.timing).toBe('bonus');
    expect(state().sheet?.edited).toEqual([hex.key]);
    expect(state().edits.abilities).toEqual({ [hex.key]: { timing: 'action', tags: ['debuff'] } });
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([
      { key: hex.key, data: { timing: 'action', tags: ['debuff'] }, deleted: false, dirty: true },
    ]);
    expect(state().syncState).toBe('waiting');
  });

  it('puts an ability back to imported with an edit that changes nothing, keeping the item as a deletion to send', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const hex = ability('Hex');
    state().setEdit(hex.key, { timing: 'action' });
    await settle();
    state().setEdit(hex.key, {});
    expect(ability('Hex').timing).toBe('bonus');
    expect(state().sheet?.edited).toEqual([]);
    expect(state().edits.abilities).toEqual({});
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([{ key: hex.key, data: null, deleted: true, dirty: true }]);
  });

  it('does nothing for an empty edit to an ability that has none', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().setEdit(ability('Hex').key, {});
    await settle();
    expect(await itemsOf(storage, record.id, 'edit')).toEqual([]);
  });

  it('ignores edits until the saved state has loaded', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const key = ability('Hex').key;
    await state().init(storage, testRemote());
    const opening = state().open(record.id);
    state().setEdit(key, { hidden: true });
    await opening;
    expect(state().edits.abilities).toEqual({});
  });

  it('keeps the edits when the character is opened again', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    const hex = ability('Hex');
    state().setEdit(hex.key, { hidden: true });
    await settle();
    await state().init(storage, testRemote(server));
    await state().open(record.id);
    expect(names(state().sheet?.hidden ?? [])).toEqual(['Hex']);
    expect(names(state().sheet?.abilities ?? [])).not.toContain('Hex');
  });

  it('clamps what was spent when an edit lowers a maximum, and forgets the undo step', async () => {
    await seed('danger');
    const wind = ability('Second Wind');
    state().use(wind, 'combat');
    state().startTurn();
    state().use(ability('Second Wind'), 'combat');
    expect(state().play.spent[wind.key]).toBe(2);
    expect(state().undo).not.toBeNull();
    state().setEdit(wind.key, { uses: { max: 1, reset: 'long' } });
    expect(state().play.spent[wind.key]).toBe(1);
    expect(state().undo).toBeNull();
  });

  it('ends concentration on an ability that is hidden', async () => {
    await seed('vlad');
    const hex = ability('Hex');
    state().use(hex, 'combat');
    expect(state().play.concentrationKey).toBe(hex.key);
    state().setEdit(hex.key, { hidden: true });
    expect(state().play.concentrationKey).toBeNull();
  });

  it('keeps the undo step when an edit does not touch what was spent', async () => {
    await seed('vlad');
    state().use(ability('Hex'), 'combat');
    state().setEdit(ability('Dash').key, { tags: ['movement'] });
    expect(state().undo?.message).toContain('Hex');
  });
});

describe('custom abilities', () => {
  it('adds one to the sheet and stores it without its key in the data', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().saveCustom(howl());
    expect(ability('Pack Howl')).toMatchObject({ key: 'own:1', source: 'custom', timing: 'bonus', tags: ['buff'] });
    await settle();
    const [item] = await itemsOf(storage, record.id, 'custom');
    expect(item).toMatchObject({ key: 'own:1', deleted: false, dirty: true });
    expect(item.data).toEqual({
      name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
      tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.',
    });
  });

  it('replaces the one with the same key', async () => {
    await seed('franny');
    state().saveCustom(howl());
    state().saveCustom(howl({ name: 'Greater Howl', timing: 'action' }));
    expect(state().edits.custom).toHaveLength(1);
    expect(ability('Greater Howl').timing).toBe('action');
  });

  it('deletes one together with the edits under its key', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().saveCustom(howl());
    state().setEdit('own:1', { inExplore: true });
    await settle();
    state().deleteCustom('own:1');
    expect(state().edits).toMatchObject({ custom: [], abilities: {} });
    expect(names(state().sheet?.abilities ?? [])).not.toContain('Pack Howl');
    await settle();
    expect(await itemsOf(storage, record.id, 'custom')).toMatchObject([{ key: 'own:1', deleted: true, data: null }]);
    expect(await itemsOf(storage, record.id, 'edit')).toMatchObject([{ key: 'own:1', deleted: true, data: null }]);
  });

  it('does nothing when asked to delete a key that is not a custom ability', async () => {
    const storage = memoryStorage();
    const record = await seed('franny', storage);
    state().deleteCustom('own:none');
    await settle();
    expect(await itemsOf(storage, record.id, 'custom')).toEqual([]);
  });

  it('makes keys that start "own:" and do not repeat', () => {
    const a = newCustomKey();
    expect(a).toMatch(/^own:[0-9a-f-]{36}$/);
    expect(newCustomKey()).not.toBe(a);
  });
});

describe('order', () => {
  it('records the order of one group and shows it', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    const before = state().sheet?.universal.map((a) => a.key) ?? [];
    const reversed = [...before].reverse();
    state().setOrder('combat', reversed);
    expect(state().sheet?.layout.order.combat).toEqual(reversed);
    expect(state().sheet?.layout.order.explore).toEqual([]);
    await settle();
    expect(await itemsOf(storage, record.id, 'order')).toMatchObject([{ key: 'combat', data: reversed, dirty: true }]);
  });

  it('keeps one group\'s order when another group is arranged', async () => {
    await seed('vlad');
    state().setOrder('combat', ['b', 'a']);
    state().setOrder('combat', ['y', 'x']);
    expect(state().edits.order.combat).toEqual(['b', 'a', 'y', 'x']);
  });

  it('writes nothing when the order is unchanged', async () => {
    const storage = memoryStorage();
    const record = await seed('vlad', storage);
    state().setOrder('explore', ['a', 'b']);
    await settle();
    const [first] = await itemsOf(storage, record.id, 'order');
    await new Promise((resolve) => setTimeout(resolve, 5));
    state().setOrder('explore', ['a', 'b']);
    await settle();
    expect((await itemsOf(storage, record.id, 'order'))[0].updatedAt).toBe(first.updatedAt);
  });
});

describe('re-import with edits', () => {
  it('keeps the edits of the open character and applies them to the new sheet', async () => {
    const record = await seed('danger');
    const wind = ability('Second Wind');
    state().setEdit(wind.key, { uses: { max: 1, reset: 'short' } });
    state().saveCustom(howl());
    state().use(ability('Second Wind'), 'combat');
    await state().saveImported(loadRaw('danger'), record.id);
    expect(state().sheet?.resources.find((r) => r.key === wind.key)).toMatchObject({ max: 1, reset: 'short' });
    expect(names(state().sheet?.abilities ?? [])).toContain('Pack Howl');
    expect(state().play.spent[wind.key]).toBe(1);
  });

  it('clamps a character that is not open to its edited maximums', async () => {
    const storage = memoryStorage();
    const record = await seed('danger', storage);
    const wind = ability('Second Wind');
    state().use(wind, 'combat');
    state().startTurn();
    state().use(ability('Second Wind'), 'combat');
    await settle();
    await state().open('nothing');
    await storage.putItem({
      characterId: record.id, kind: 'edit', key: wind.key, data: { uses: { max: 1, reset: 'long' } },
      updatedAt: '2026-11-18T12:00:00.000Z', deleted: false, dirty: true,
    });
    await state().saveImported(loadRaw('danger'), record.id);
    const [play] = await itemsOf(storage, record.id, 'play');
    expect(play.data).toMatchObject({ spent: { [wind.key]: 1 } });
  });
});

describe('stored edits', () => {
  const stored = (kind: StoredItem['kind'], key: string, data: unknown, deleted = false): StoredItem => ({
    characterId: 'c', kind, key, data, updatedAt: '2026-11-18T12:00:00.000Z', deleted, dirty: false,
  });

  it('are read from items, each kind into its place', () => {
    expect(editsFrom([
      stored('edit', 'spell:1', { hidden: true }),
      stored('custom', 'own:2', { name: 'Zeal' }),
      stored('custom', 'own:1', { name: 'Howl' }),
      stored('order', 'combat', ['a', 'b']),
      stored('order', 'explore', ['c']),
      stored('play', 'state', { spent: {} }),
      stored('turn', 'state', {}),
    ])).toEqual({
      abilities: { 'spell:1': { hidden: true } },
      custom: [
        { key: 'own:1', name: 'Howl', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
        { key: 'own:2', name: 'Zeal', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
      ],
      order: { combat: ['a', 'b'], explore: ['c'] },
    });
  });

  it('leave out deleted items, malformed ones, and an order for a view that does not exist', () => {
    expect(editsFrom([
      stored('edit', 'spell:1', { hidden: true }, true),
      stored('edit', 'spell:2', { timing: 'never' }),
      stored('edit', 'spell:3', 'nonsense'),
      stored('custom', 'own:1', { timing: 'action' }),
      stored('order', 'sideways', ['a']),
      stored('order', 'combat', 'a,b'),
    ])).toEqual({ abilities: {}, custom: [], order: { combat: [], explore: [] } });
  });
});

describe('edits and the account', () => {
  it('sends an edit, and after a removal sends the deletion and then forgets the item', async () => {
    const storage = memoryStorage();
    const server = testServer();
    const record = await seed('vlad', storage, testRemote(server));
    const hex = ability('Hex');
    state().setEdit(hex.key, { hidden: true });
    await settle();
    await state().syncNow();
    expect(state().syncState).toBe('saved');
    const remote = testRemote(server);
    expect((await remote.pullItems(0)).filter((i) => i.kind === 'edit')).toMatchObject([{ key: hex.key, data: { hidden: true }, deleted: false }]);
    state().setEdit(hex.key, {});
    await settle();
    await state().syncNow();
    expect((await remote.pullItems(0)).filter((i) => i.kind === 'edit')).toMatchObject([{ key: hex.key, deleted: true, data: null }]);
    expect(await itemsOf(storage, record.id, 'edit')).toEqual([]);
  });

  it('shows an edit made on another device, such as the DM fixing a player\'s sheet', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const record = await seed('vlad', memoryStorage(), testRemote(server));
    await state().syncNow();
    const hex = ability('Hex');
    const dm = { storage: memoryStorage(), remote: server.remote({ userId: 'user-dm' }) };
    await syncOnce(dm);
    await dm.storage.putItem({
      characterId: record.id, kind: 'edit', key: hex.key, data: { tags: ['debuff'] },
      updatedAt: new Date().toISOString(), deleted: false, dirty: true,
    });
    await dm.storage.putItem({
      characterId: record.id, kind: 'custom', key: 'own:9', data: { name: 'Tatzelwurm Bite', timing: 'action' },
      updatedAt: new Date().toISOString(), deleted: false, dirty: true,
    });
    await syncOnce(dm);
    await state().syncNow();
    expect(ability('Hex').tags).toEqual(['debuff']);
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
    expect(state().edits.abilities[hex.key]).toEqual({ tags: ['debuff'] });
    expect(record.ownerId).toBe(TEST_USER);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/store.edits.test.ts
```

Expected: FAIL. The store has no `setEdit`, `saveCustom`, `deleteCustom`, `setOrder`, `baseSheet` or `edits`, and exports no `editsFrom` or `newCustomKey`.

- [ ] **Step 3: Write the implementation**

Removing an edit does not delete its item on the device. The item is kept with `deleted: true` and no data until the account has been told, exactly as a deleted character is. `editsFrom` leaves deleted items out.

An edit can lower a maximum, remove a pool or hide the ability being concentrated on, so every change to the edits clamps the play state to the new sheet. When that changes what is spent, the undo step is dropped, because it would restore a state the sheet no longer allows.

Apply this change to `apps/web/src/store.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,13 +1,15 @@
 import { convertCharacter } from '@cw/ddb-import';
-import type { Ability, PlayState } from '@cw/model';
+import type { Ability, AbilityEdit, CharacterEdits, CustomAbility, PlayState, ViewName } from '@cw/model';
 import {
-  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, normalisePlayItem,
-  normaliseTurn, pools, rest, startTurn, togglePill, useSummary, type PlayItem, type Sheet,
-  type TurnTiming, type ViewMode,
+  adjustPool, applyEdits, applyUse, buildSheet, clampState, emptyEdits, emptyPlayState, endConcentration,
+  isEmptyEdit, normaliseCustom, normaliseEdit, normaliseOrder, normalisePlayItem, normaliseTurn, pools, rest,
+  startTurn, togglePill, useSummary, withGroupOrder, type PlayItem, type Sheet, type TurnTiming, type ViewMode,
 } from '@cw/rules';
 import { create } from 'zustand';
 import { CHARACTER_LIMIT, RemoteError, defaultRemote, type ImportResult, type Profile, type Remote } from './remote';
-import { STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';
+import {
+  STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter, type StoredItem, type SyncedKind,
+} from './storage';
 import { characterId, claimLocalCharacters, hasUnsynced, nextStamp, resetCursors, syncOnce } from './sync/engine';
 import { createScheduler, type Scheduler } from './sync/scheduler';
 
@@ -42,7 +44,12 @@ export interface AppStore {
   characters: StoredCharacter[];
   /** The character on screen, its sheet and its play state. */
   openId: string | null;
+  /** The sheet the views show: the imported sheet with the player's edits applied. */
   sheet: Sheet | null;
+  /** The sheet as imported, with no edits. The editor compares against it. */
+  baseSheet: Sheet | null;
+  /** The open character's edits. */
+  edits: CharacterEdits;
   play: PlayState;
   /** False while the open character's saved play state is still being read. Nothing can be changed until it is. */
   loaded: boolean;
@@ -84,8 +91,19 @@ export interface AppStore {
   togglePill(timing: TurnTiming): void;
   endConcentration(): void;
   undoLast(): void;
+  /** Replaces the open character's edits to one ability. An edit that changes nothing removes them. */
+  setEdit(abilityKey: string, edit: AbilityEdit): void;
+  /** Adds a custom ability to the open character, or replaces the one with the same key. */
+  saveCustom(custom: CustomAbility): void;
+  /** Deletes a custom ability and any edits stored under its key. */
+  deleteCustom(abilityKey: string): void;
+  /** Records the order the player gave one group of a view. `groupKeys` is the whole group, in order. */
+  setOrder(view: ViewName, groupKeys: string[]): void;
 }
 
+/** A key for a new custom ability. */
+export const newCustomKey = (): string => `own:${newId()}`;
+
 const META_SESSION = 'session';
 
 let storage: AppStorage = memoryStorage();
@@ -127,14 +145,39 @@ function sessionFrom(value: unknown): Session | null {
   };
 }
 
-/** A character's saved play state, repaired where it is malformed. Empty when nothing is saved. */
-async function loadPlay(id: string): Promise<PlayState> {
-  const items = await storage.listItems(id);
+/** The play state held in a character's items, repaired where it is malformed. Empty when nothing is saved. */
+function playFrom(items: StoredItem[]): PlayState {
   const data = (kind: 'play' | 'turn'): unknown =>
     items.find((item) => item.kind === kind && item.key === STATE_KEY && !item.deleted)?.data;
   return { ...normalisePlayItem(data('play')), turn: normaliseTurn(data('turn')) };
 }
 
+/** The edits held in a character's items, each checked and repaired. A deleted item is not an edit. */
+export function editsFrom(items: StoredItem[]): CharacterEdits {
+  const edits = emptyEdits();
+  for (const item of items) {
+    if (item.deleted) continue;
+    if (item.kind === 'edit') {
+      const edit = normaliseEdit(item.data);
+      if (!isEmptyEdit(edit)) edits.abilities[item.key] = edit;
+    } else if (item.kind === 'custom') {
+      const custom = normaliseCustom(item.data, item.key);
+      if (custom) edits.custom.push(custom);
+    } else if (item.kind === 'order' && (item.key === 'combat' || item.key === 'explore')) {
+      edits.order[item.key] = normaliseOrder(item.data);
+    }
+  }
+  // Items come back in no particular order; custom abilities are shown by name.
+  edits.custom.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
+  return edits;
+}
+
+/** A character's saved play state and edits. Empty when nothing is saved or it cannot be read. */
+async function loadSaved(id: string): Promise<{ play: PlayState; edits: CharacterEdits }> {
+  const items = await storage.listItems(id).catch(() => [] as StoredItem[]);
+  return { play: playFrom(items), edits: editsFrom(items) };
+}
+
 /**
  * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
  * An item is written only when it differs from `previous`, so flipping a pill does not touch the
@@ -174,6 +217,8 @@ function newId(): string {
 const closed = {
   openId: null as string | null,
   sheet: null as Sheet | null,
+  baseSheet: null as Sheet | null,
+  edits: emptyEdits(),
   play: emptyPlayState(),
   loaded: false,
   undo: null as Undo | null,
@@ -216,6 +261,32 @@ export const useStore = create<AppStore>()((set, get) => {
     });
   };
 
+  /**
+   * Stores one item of the open character's edits, or marks it deleted when `data` is null, then
+   * rebuilds the sheet from the edits as they now stand. What was spent is clamped to the new
+   * sheet, because an edit can lower a maximum or remove a pool.
+   */
+  const changeEdits = (next: CharacterEdits, writes: { kind: SyncedKind; key: string; data: unknown }[]): void => {
+    const { openId, baseSheet, play, loaded } = get();
+    if (openId === null || baseSheet === null || !loaded) return;
+    const sheet = applyEdits(baseSheet, next);
+    const clamped = clampState(play, sheet);
+    const playChanged = !same(playItem(clamped), playItem(play));
+    if (playChanged) localChanges += 1;
+    set({ edits: next, sheet, play: playChanged ? clamped : play, undo: playChanged ? null : get().undo });
+    void save((async () => {
+      const items = await storage.listItems(openId);
+      for (const write of writes) {
+        const existing = items.find((item) => item.kind === write.kind && item.key === write.key);
+        await storage.putItem({
+          characterId: openId, kind: write.kind, key: write.key, data: write.data,
+          updatedAt: nextStamp(existing?.updatedAt), deleted: write.data === null, dirty: true,
+        });
+      }
+      if (playChanged) await savePlay(openId, clamped, play);
+    })()).then(() => changedLocally());
+  };
+
   /**
    * After a round with the account: show what the device now holds. `changed` are the characters
    * a fetch altered; `sent` is true when characters were waiting to be sent, whose records are
@@ -234,19 +305,21 @@ export const useStore = create<AppStore>()((set, get) => {
       set({ ...closed });
       return;
     }
-    const sheet = sheetFor(character);
+    const baseSheet = sheetFor(character);
+    const saved = await loadSaved(openId);
+    if (get().openId !== openId) return;
+    const sheet = applyEdits(baseSheet, saved.edits);
     if (localChanges !== changesBefore) {
       // The player changed something while the fetch was running: what is on screen is the newest
       // copy. It is written again, stamped later than what was fetched, and sent.
       const kept = clampState(play, sheet);
-      set({ sheet, play: kept });
+      set({ baseSheet, sheet, edits: saved.edits, play: kept });
       await save(savePlay(openId, kept, null));
       changedLocally();
       return;
     }
-    const saved = await loadPlay(openId).catch(() => emptyPlayState());
     // The turn never syncs, so the one in memory is the newest.
-    if (get().openId === openId) set({ sheet, play: { ...clampState(saved, sheet), turn: get().play.turn }, undo: null });
+    set({ baseSheet, sheet, edits: saved.edits, play: { ...clampState(saved.play, sheet), turn: get().play.turn }, undo: null });
   };
 
   /** No longer a table admin: the other players' characters leave this device. */
@@ -448,15 +521,17 @@ export const useStore = create<AppStore>()((set, get) => {
       if (existing) {
         // Re-import: what was spent stays spent, within the new maximums.
         if (get().openId === record.id) {
-          // The open character's play state in memory is the newest copy.
-          const sheet = sheetFor(record);
+          // The open character's play state in memory is the newest copy. Its edits are kept.
+          const baseSheet = sheetFor(record);
+          const sheet = applyEdits(baseSheet, get().edits);
           const before = get().play;
           const play = clampState(before, sheet);
-          set({ sheet, play, undo: null });
+          set({ baseSheet, sheet, play, undo: null });
           await save(savePlay(record.id, play, before));
         } else {
-          const saved = await loadPlay(record.id).catch(() => null);
-          if (saved) await save(savePlay(record.id, clampState(saved, sheetFor(record)), saved));
+          const saved = await loadSaved(record.id);
+          const sheet = applyEdits(sheetFor(record), saved.edits);
+          await save(savePlay(record.id, clampState(saved.play, sheet), saved.play));
         }
       }
       changedLocally();
@@ -488,18 +563,20 @@ export const useStore = create<AppStore>()((set, get) => {
       }
       // Already open: the play state in memory is the newest copy, even if saving it failed.
       if (get().openId === id && get().sheet) return;
-      let sheet: Sheet;
+      let baseSheet: Sheet;
       try {
-        sheet = sheetFor(character);
+        baseSheet = sheetFor(character);
       } catch {
         // Stored, but no sheet can be built from it (a record damaged in the account, say).
         set({ ...closed });
         return;
       }
-      set({ ...closed, openId: id, sheet });
-      const saved = await loadPlay(id).catch(() => emptyPlayState());
+      set({ ...closed, openId: id, sheet: baseSheet, baseSheet });
+      const saved = await loadSaved(id);
       // Ignore the answer if the player has already moved to another character.
-      if (get().openId === id) set({ play: clampState(saved, sheet), loaded: true });
+      if (get().openId !== id) return;
+      const sheet = applyEdits(baseSheet, saved.edits);
+      set({ sheet, edits: saved.edits, play: clampState(saved.play, sheet), loaded: true });
     },
 
     use(ability, mode, slot) {
@@ -542,5 +619,42 @@ export const useStore = create<AppStore>()((set, get) => {
       const { undo } = get();
       if (undo) change(undo.state, null);
     },
+
+    setEdit(abilityKey, edit) {
+      const { edits } = get();
+      const abilities = { ...edits.abilities };
+      const empty = isEmptyEdit(edit);
+      if (empty && !(abilityKey in abilities)) return;
+      if (empty) delete abilities[abilityKey];
+      else abilities[abilityKey] = edit;
+      changeEdits({ ...edits, abilities }, [{ kind: 'edit', key: abilityKey, data: empty ? null : edit }]);
+    },
+
+    saveCustom(custom) {
+      const { edits } = get();
+      const others = edits.custom.filter((c) => c.key !== custom.key);
+      const { key: _key, ...data } = custom;
+      const next = [...others, custom].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
+      changeEdits({ ...edits, custom: next }, [{ kind: 'custom', key: custom.key, data }]);
+    },
+
+    deleteCustom(abilityKey) {
+      const { edits } = get();
+      if (!edits.custom.some((c) => c.key === abilityKey)) return;
+      const abilities = { ...edits.abilities };
+      const writes: { kind: SyncedKind; key: string; data: unknown }[] = [{ kind: 'custom', key: abilityKey, data: null }];
+      if (abilityKey in abilities) {
+        delete abilities[abilityKey];
+        writes.push({ kind: 'edit', key: abilityKey, data: null });
+      }
+      changeEdits({ ...edits, abilities, custom: edits.custom.filter((c) => c.key !== abilityKey) }, writes);
+    },
+
+    setOrder(view, groupKeys) {
+      const { edits } = get();
+      const order = withGroupOrder(edits.order[view], groupKeys);
+      if (same(order, edits.order[view])) return;
+      changeEdits({ ...edits, order: { ...edits.order, [view]: order } }, [{ kind: 'order', key: view, data: order }]);
+    },
   };
 });
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (924 tests in 40 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The store holds a character's edits and applies them to the sheet" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 16: A dialog component, an Edit button on every row, and names that tell twins apart

Three small things the editor needs before it can exist (spec sections 10.1 and 10.3). The slot chooser moves onto a real `<dialog>`, which settles its deferred focus findings. Every row gains an Edit button in its opened state and an "edited" label. And two rows with the same name get the kind of cost in their accessible names, so a screen reader, and a test, can tell them apart.

**Files:**
- Modify: `apps/web/src/components/AbilityRow.tsx`
- Create: `apps/web/src/components/Dialog.tsx`
- Modify: `apps/web/src/components/SlotSheet.tsx`
- Modify (test): `apps/web/src/components/components.test.tsx`
- Create (test): `apps/web/src/components/dialog.test.tsx`
- Create: `apps/web/src/components/rowLabel.ts`
- Modify (test): `apps/web/src/test/setup.ts`
- Modify (test): `apps/web/src/views/CombatView.test.tsx`
- Modify (test): `apps/web/src/views/ExploreView.test.tsx`
- Modify: `packages/rules/src/play.ts`
- Modify (test): `packages/rules/test/play.test.ts`

**Interfaces:**
- Consumes:
  - `Sheet.edited` (the task before last), `costLabel`, `pools` in `packages/rules/src/play.ts`.
  - `AbilityRow`, `SlotSheet`, `useAbilityUse` in `apps/web/src/components`.
- Produces:
  - `Dialog({ title, onClose, children })` in `apps/web/src/components/Dialog.tsx`: a native `<dialog>` opened with `showModal()`, labelled by its title. Closing it by Escape, by the backdrop or by `close()` calls `onClose`.
  - `costKind(ability: Ability, sheet: Sheet): string | null` in `@cw/rules`: "pact slot", "spell slot", "free cast", "limited uses", "1 charge of {pool}", or null. `costLabel` is built on it and returns the same strings as before.
  - `rowLabel(ability: Ability, sheet: Sheet): string` in `apps/web/src/components/rowLabel.ts`: the ability's name, or "{name} ({cost kind})" when another row on the sheet shares the name and the ability has a cost.
  - `AbilityRow` takes an optional `onEdit?: (ability: Ability) => void`, shows "Edit" in the opened row when it is given, shows the label "edited" for a key in `sheet.edited`, and uses `rowLabel` for its accessible name and its buttons' names.
  - `apps/web/src/test/setup.ts` gains a stand-in for `showModal()` and `close()`, which jsdom does not implement.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/components/components.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,4 +1,4 @@
-import { render, screen, within } from '@testing-library/react';
+import { cleanup, render, screen, within } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { describe, expect, it, vi } from 'vitest';
 import type { PlayState } from '@cw/model';
@@ -109,14 +109,30 @@ describe('NotesList', () => {
 });
 
 describe('AbilityRow', () => {
-  async function row(name: string, state: PlayState = emptyPlayState(), cost?: 'slot' | 'uses') {
-    await seed('vlad');
+  /** Renders one of the open character's rows. `label` is its accessible name where that is not its name. */
+  function show(name: string, options: { state?: PlayState; cost?: 'slot' | 'uses'; label?: string; edit?: boolean } = {}) {
     const sheet = useStore.getState().sheet;
     if (!sheet) throw new Error('no sheet');
     const onUse = vi.fn();
     const onAdjust = vi.fn();
-    render(<AbilityRow ability={ability(name, cost)} sheet={sheet} state={state} mode="combat" onUse={onUse} onAdjust={onAdjust} />);
-    return { article: screen.getByRole('article', { name }), onUse, onAdjust };
+    const onEdit = vi.fn();
+    render(
+      <AbilityRow
+        ability={ability(name, options.cost)}
+        sheet={sheet}
+        state={options.state ?? emptyPlayState()}
+        mode="combat"
+        onUse={onUse}
+        onAdjust={onAdjust}
+        onEdit={options.edit ? onEdit : undefined}
+      />,
+    );
+    return { article: screen.getByRole('article', { name: options.label ?? name }), onUse, onAdjust, onEdit };
+  }
+
+  async function row(name: string, state: PlayState = emptyPlayState(), cost?: 'slot' | 'uses', label?: string) {
+    await seed('vlad');
+    return show(name, { state, cost, label });
   }
 
   it('shows the name, cost label, tags and roll line, and calls onUse', async () => {
@@ -128,10 +144,73 @@ describe('AbilityRow', () => {
   });
 
   it('tells two abilities with the same name apart by their cost', async () => {
-    const { article } = await row('Misty Step', emptyPlayState(), 'uses');
+    const { article } = await row('Misty Step', emptyPlayState(), 'uses', 'Misty Step (free cast)');
     expect(article).toHaveTextContent('free cast, 3 left');
   });
 
+  it('names twins by their kind of cost, on the row and on its Use button', async () => {
+    await seed('vlad');
+    const free = show('Misty Step', { cost: 'uses', label: 'Misty Step (free cast)' });
+    const slot = show('Misty Step', { cost: 'slot', label: 'Misty Step (pact slot)' });
+    await userEvent.click(within(free.article).getByRole('button', { name: 'Use Misty Step (free cast)' }));
+    expect(free.onUse).toHaveBeenCalledWith(ability('Misty Step', 'uses'));
+    expect(within(slot.article).getByRole('button', { name: 'Use Misty Step (pact slot)' })).toBeInTheDocument();
+    expect(screen.queryByRole('article', { name: 'Misty Step' })).toBeNull();
+  });
+
+  it('keeps the plain name for an ability with a cost and no twin, and for twins that cost nothing', async () => {
+    await seed('vlad');
+    expect(show('Arms of Hadar').article).toHaveAccessibleName('Arms of Hadar');
+    cleanup();
+    await seed('franny');
+    const sheet = useStore.getState().sheet;
+    if (!sheet) throw new Error('no sheet');
+    const twins = sheet.abilities.filter((a) => a.name === 'Twig Attack');
+    expect(twins).toHaveLength(2);
+    for (const twin of twins) {
+      render(<AbilityRow ability={twin} sheet={sheet} state={emptyPlayState()} mode="combat" onUse={() => {}} onAdjust={() => {}} />);
+    }
+    expect(screen.getAllByRole('article', { name: 'Twig Attack' })).toHaveLength(2);
+  });
+
+  it('stops naming the cost once the twin is hidden', async () => {
+    await seed('vlad');
+    useStore.getState().setEdit(ability('Misty Step', 'slot').key, { hidden: true });
+    expect(show('Misty Step').article).toHaveAccessibleName('Misty Step');
+  });
+
+  it('offers Edit under the description of an opened row', async () => {
+    await seed('vlad');
+    const { article, onEdit } = show('Hex', { edit: true });
+    expect(within(article).queryByRole('button', { name: 'Edit Hex' })).toBeNull();
+    await userEvent.click(within(article).getByRole('button', { name: /^Hex/ }));
+    const edit = within(article).getByRole('button', { name: 'Edit Hex' });
+    expect(edit).toHaveTextContent(/^Edit$/);
+    await userEvent.click(edit);
+    expect(onEdit).toHaveBeenCalledWith(ability('Hex'));
+  });
+
+  it('names the Edit button of a twin by its kind of cost', async () => {
+    await seed('vlad');
+    const { article } = show('Misty Step', { cost: 'uses', label: 'Misty Step (free cast)', edit: true });
+    await userEvent.click(within(article).getByRole('button', { name: /^Misty Step/ }));
+    expect(within(article).getByRole('button', { name: 'Edit Misty Step (free cast)' })).toBeInTheDocument();
+  });
+
+  it('has no Edit button when nothing handles it', async () => {
+    await seed('vlad');
+    const { article } = show('Hex');
+    await userEvent.click(within(article).getByRole('button', { name: /^Hex/ }));
+    expect(within(article).queryByRole('button', { name: /^Edit/ })).toBeNull();
+  });
+
+  it('marks an edited row, and only that row', async () => {
+    await seed('vlad');
+    useStore.getState().setEdit(ability('Hex').key, { tags: ['debuff'] });
+    expect(within(show('Hex').article).getByText(/edited/)).toHaveTextContent('pact slot · concentration · debuff · edited');
+    expect(show('Arms of Hadar').article).not.toHaveTextContent('edited');
+  });
+
   it('disables Use and gives the reason when the ability is blocked', async () => {
     const state: PlayState = { ...emptyPlayState(), spent: { pact: 2 } };
     const { article, onUse } = await row('Arms of Hadar', state);
```

Create `apps/web/src/components/dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

afterEach(() => {
  vi.restoreAllMocks();
});

function open() {
  const onClose = vi.fn();
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  render(
    <Dialog title="Pick a slot" onClose={onClose}>
      <button type="button">Inside</button>
    </Dialog>,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Pick a slot' }), onClose, showModal };
}

describe('Dialog', () => {
  it('opens as a modal dialog, labelled by its title', () => {
    const { dialog, showModal } = open();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Pick a slot' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('calls onClose on Escape, which the browser reports as a cancel event', () => {
    const { dialog, onClose } = open();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the browser closes it', () => {
    const { dialog, onClose } = open();
    fireEvent(dialog, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on a click on the backdrop', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open on a click inside it', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Inside' }));
    await userEvent.click(within(dialog).getByRole('heading', { name: 'Pick a slot' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

Replace the whole of `apps/web/src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no `showModal` or `close` on <dialog>. These stand in for the two things the app
// relies on: an open dialog has the `open` attribute, and closing one sends a `close` event.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
  // Local development's stand-in account remembers its sign-in here.
  window.localStorage.clear();
});
```

Apply this change to `apps/web/src/views/CombatView.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -24,8 +24,10 @@ describe('Combat view', () => {
     const names = (group: string) =>
       within(screen.getByRole('region', { name: group })).getAllByRole('article').map((a) => a.getAttribute('aria-label'));
     expect(names('Action').slice(0, 4)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe', 'Wurms Claw - Hammer', 'Unarmed Strike']);
-    expect(names('Bonus Action')).toEqual(['Hex', 'Misty Step', 'Misty Step', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond']);
-    expect(names('Reaction')).toEqual(['Hellish Rebuke', 'Hellish Rebuke']);
+    expect(names('Bonus Action')).toEqual([
+      'Hex', 'Misty Step (pact slot)', 'Misty Step (free cast)', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
+    ]);
+    expect(names('Reaction')).toEqual(['Hellish Rebuke (pact slot)', 'Hellish Rebuke (free cast)']);
     expect(screen.getByText('No action needed (7)')).toBeInTheDocument();
     expect(screen.getByText('Anyone can do this')).toBeInTheDocument();
     expect(screen.queryByRole('region', { name: 'Other' })).toBeNull();
@@ -44,7 +46,8 @@ describe('Combat view', () => {
     expect(use('Arms of Hadar')).toBeDisabled();
     expect(row('Arms of Hadar')).toHaveTextContent('You already spent a spell slot this turn.');
     expect(use('Eldritch Blast')).toBeEnabled();
-    expect(use('Misty Step', 0)).toBeDisabled();
+    expect(use('Misty Step (pact slot)')).toBeDisabled();
+    expect(use('Misty Step (free cast)')).toBeDisabled();
 
     await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
     expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
```

Apply this change to `apps/web/src/views/ExploreView.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -57,7 +57,7 @@ describe('Explore view', () => {
   it('lists out of combat abilities and has no turn tracker', async () => {
     await openExplore('vlad');
     expect(labels('Out of combat abilities')).toEqual([
-      'Charm Person', 'Misty Step', 'Phantasmal Force', 'Misty Step', 'Magical Cunning',
+      'Charm Person', 'Misty Step (pact slot)', 'Phantasmal Force', 'Misty Step (free cast)', 'Magical Cunning',
     ]);
     expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();
     expect(screen.queryByRole('button', { name: /^Action: / })).toBeNull();
```

Apply this change to `packages/rules/test/play.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -2,7 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { convertCharacter } from '@cw/ddb-import';
 import type { Ability, PlayState } from '@cw/model';
 import {
-  PACT_KEY, adjustPool, applyUse, availability, buildSheet, clampState, concentrationName, costLabel, emptyPlayState,
+  PACT_KEY, adjustPool, applyUse, availability, buildSheet, clampState, concentrationName, costKind, costLabel, emptyPlayState,
   endConcentration, pools, remaining, rest, slotKey, startTurn, togglePill, useSummary, type Sheet,
 } from '../src/index';
 import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';
@@ -340,6 +340,52 @@ describe('costLabel', () => {
   });
 });
 
+describe('costKind', () => {
+  it('names the kind of slot the same way the cost label does', () => {
+    const vlad = sheetOf('vlad');
+    expect(costKind(find(vlad, 'Misty Step', 'slot'), vlad)).toBe('pact slot');
+    const minkis = sheetOf('minkis');
+    expect(costKind(find(minkis, 'Chromatic Orb'), minkis)).toBe('spell slot');
+  });
+
+  it('names a free cast, limited uses and a charge of something else, without the number left', () => {
+    const vlad = sheetOf('vlad');
+    expect(costKind(find(vlad, 'Misty Step', 'uses'), vlad)).toBe('free cast');
+    const danger = sheetOf('danger');
+    expect(costKind(find(danger, 'Second Wind'), danger)).toBe('limited uses');
+    const maya = sheetOf('maya');
+    expect(costKind(find(maya, 'Scorching Ray'), maya)).toBe('1 charge of Shepherds Staff');
+  });
+
+  it('is null for an ability with no cost, and for one whose pool is not on the sheet', () => {
+    const vlad = sheetOf('vlad');
+    const blast = find(vlad, 'Eldritch Blast');
+    expect(costKind(blast, vlad)).toBeNull();
+    expect(costKind({ ...blast, cost: { kind: 'uses', resourceKey: 'gone' } }, vlad)).toBeNull();
+  });
+
+  it('does not change as uses are spent', () => {
+    const danger = sheetOf('danger');
+    const wind = find(danger, 'Second Wind');
+    const spent = applyUse(wind, danger, emptyPlayState());
+    expect(costLabel(wind, danger, spent)).not.toBe(costLabel(wind, danger, emptyPlayState()));
+    expect(costKind(wind, danger)).toBe('limited uses');
+  });
+
+  it.each(SLUGS)('is the part of the cost label before the number left: %s', (slug) => {
+    const sheet = sheetOf(slug);
+    for (const a of [...sheet.abilities, ...sheet.universal]) {
+      const label = costLabel(a, sheet, emptyPlayState());
+      const kind = costKind(a, sheet);
+      if (kind === null || label === null) expect(label, a.name).toBe(kind);
+      else if (a.cost.kind === 'slot') expect(label, a.name).toBe(kind);
+      // A feature's own uses have always been labelled with the number alone.
+      else if (kind === 'limited uses') expect(label, a.name).toMatch(/^\d+ left$/);
+      else expect(label.replace(/, \d+ left$/, ''), a.name).toBe(kind);
+    }
+  });
+});
+
 describe('useSummary', () => {
   it('says what a Use spent', () => {
     const vlad = sheetOf('vlad');
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/components/components.test.tsx apps/web/src/components/dialog.test.tsx apps/web/src/views/CombatView.test.tsx apps/web/src/views/ExploreView.test.tsx packages/rules/test/play.test.ts
```

Expected: FAIL. `./Dialog` cannot be found, `costKind` is not exported, and the row has no Edit button.

- [ ] **Step 3: Write the implementation**

On the `vlad` fixture the two rows named Misty Step become "Misty Step (pact slot)" and "Misty Step (free cast)" to assistive technology, and their buttons "Use Misty Step (pact slot)" and so on. The same happens wherever a fixture has two rows with one name and different costs (Hellish Rebuke on `vlad` and `danger`, for example). Two rows that share a name and both cost nothing still share a name. Existing tests that told such rows apart by position now use the names.

`Dialog` prevents the browser's own handling of Escape and calls `onClose` instead, so a dialog always closes by being unmounted and its owner's state stays the single record of whether it is open.

Replace the whole of `apps/web/src/components/AbilityRow.tsx` with:

```tsx
import type { Ability, PlayState } from '@cw/model';
import { availability, costLabel, pools, remaining, rollLine, type Pool, type Sheet, type ViewMode } from '@cw/rules';
import { useState } from 'react';
import { Description } from './Description';
import { Pips } from './Pips';
import { rowLabel } from './rowLabel';

interface Props {
  ability: Ability;
  sheet: Sheet;
  state: PlayState;
  mode: ViewMode;
  onUse: (ability: Ability) => void;
  onAdjust: (pool: Pool, delta: number) => void;
  /** When given, the opened row offers "Edit". */
  onEdit?: (ability: Ability) => void;
}

/** The small labels after the name: what it costs, what kind of ability it is, and whether the player changed it. */
function labels(ability: Ability, sheet: Sheet, state: PlayState): string[] {
  const out: string[] = [];
  const cost = costLabel(ability, sheet, state);
  if (cost) out.push(cost);
  if (ability.concentration) out.push('concentration');
  if (ability.ritual) out.push('ritual');
  if (ability.timing === 'long') out.push('takes a minute or more');
  out.push(...ability.tags);
  if (sheet.edited.includes(ability.key)) out.push('edited');
  return out;
}

/** One ability: name, labels, roll line, notes, a Use button, and the description on tap. */
export function AbilityRow({ ability, sheet, state, mode, onUse, onAdjust, onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const a = availability(ability, sheet, state, mode);
  const line = rollLine(ability.roll);
  const pool = ability.poolKey ? pools(sheet).find((p) => p.key === ability.poolKey) : undefined;
  const blocked = a.hasUse && !a.canUse;
  const meta = labels(ability, sheet, state);
  const label = rowLabel(ability, sheet);

  return (
    <article aria-label={label} className="border-t border-slate-200 py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`min-h-11 min-w-0 flex-1 text-left ${blocked ? 'text-slate-500' : ''}`}
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
            aria-label={`Use ${label}`}
            disabled={!a.canUse}
            onClick={() => onUse(ability)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium disabled:border-slate-200 disabled:text-slate-400"
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
      {open ? (
        <div className="mt-2 rounded-lg bg-slate-100 p-2">
          <Description html={ability.description} />
          {onEdit ? (
            <button
              type="button"
              aria-label={`Edit ${label}`}
              onClick={() => onEdit(ability)}
              className="mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium"
            >
              Edit
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
```

Create `apps/web/src/components/Dialog.tsx`:

```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Called when the player dismisses the dialog: Escape, a tap outside it, or the browser closing it. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal bottom sheet. It is a native `<dialog>` opened with `showModal`, so the browser moves
 * focus into it, keeps it there, and closes it on Escape. The dialog is open for as long as it is
 * rendered: whoever renders it stops rendering it when `onClose` is called.
 */
export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        // The dialog closes by no longer being rendered, not by the browser closing it first.
        event.preventDefault();
        onClose();
      }}
      // The padding is on the inner element, so a click whose target is the dialog is on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-md rounded-t-2xl bg-white p-0 text-slate-900 backdrop:bg-slate-900/40"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-4">
        <h2 id={titleId} className="font-medium">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
```

Replace the whole of `apps/web/src/components/SlotSheet.tsx` with:

```tsx
import type { Ability } from '@cw/model';
import type { SlotOption } from '@cw/rules';
import { Dialog } from './Dialog';

interface Props {
  ability: Ability;
  options: SlotOption[];
  onPick: (slotKey: string) => void;
  onCancel: () => void;
}

/** Asks which slot pays for a spell. Shown only when more than one could. */
export function SlotSheet({ ability, options, onPick, onCancel }: Props) {
  return (
    <Dialog title={`Cast ${ability.name} with`} onClose={onCancel}>
      <ul className="mt-2">
        {options.map((option) => (
          <li key={option.key} className="border-t border-slate-200">
            <button type="button" onClick={() => onPick(option.key)} className="flex min-h-11 w-full items-center justify-between py-3 text-left">
              <span>{option.label}</span>
              <span className="text-sm text-slate-600">{option.remaining} left</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 py-2">Cancel</button>
    </Dialog>
  );
}
```

Create `apps/web/src/components/rowLabel.ts`:

```ts
import type { Ability } from '@cw/model';
import { costKind, type Sheet } from '@cw/rules';

/**
 * The name a row and its buttons are known by. It is the ability's name, with the kind of cost
 * added where another row on the sheet has the same name: "Misty Step (pact slot)" and
 * "Misty Step (free cast)".
 */
export function rowLabel(ability: Ability, sheet: Sheet): string {
  const twin = [...sheet.abilities, ...sheet.universal].some((a) => a.name === ability.name && a.key !== ability.key);
  const kind = twin ? costKind(ability, sheet) : null;
  return kind === null ? ability.name : `${ability.name} (${kind})`;
}
```

Apply this change to `packages/rules/src/play.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -190,20 +190,35 @@ export function clampState(state: PlayState, sheet: Sheet): PlayState {
   return { spent, concentrationKey: concentrating ? state.concentrationKey : null, turn: { ...state.turn } };
 }
 
-/** The short label that tells two rows with the same name apart: "pact slot", "free cast, 3 left". */
-export function costLabel(ability: Ability, sheet: Sheet, state: PlayState): string | null {
+/** The pool an ability's Use spends from. Undefined when it costs no uses or the pool is not on the sheet. */
+function usesPool(ability: Ability, sheet: Sheet): Pool | undefined {
+  if (ability.cost.kind !== 'uses') return undefined;
+  const key = ability.cost.resourceKey;
+  return pools(sheet).find((p) => p.key === key);
+}
+
+/**
+ * What kind of cost an ability has, in words that do not change as uses are spent: "pact slot",
+ * "free cast", "limited uses", "1 charge of Shepherds Staff". Null when it costs nothing.
+ */
+export function costKind(ability: Ability, sheet: Sheet): string | null {
   if (ability.cost.kind === 'slot') {
     return sheet.pactSlots && Object.keys(sheet.slots).length === 0 ? 'pact slot' : 'spell slot';
   }
-  if (ability.cost.kind === 'uses') {
-    const key = ability.cost.resourceKey;
-    const pool = pools(sheet).find((p) => p.key === key);
-    if (!pool) return null;
-    const left = `${remaining(pool, state)} left`;
-    if (key !== ability.key) return `1 charge of ${pool.name}, ${left}`;
-    return ability.source === 'spell' ? `free cast, ${left}` : left;
-  }
-  return null;
+  const pool = usesPool(ability, sheet);
+  if (!pool) return null;
+  if (pool.key !== ability.key) return `1 charge of ${pool.name}`;
+  return ability.source === 'spell' ? 'free cast' : 'limited uses';
+}
+
+/** The short label that tells two rows with the same name apart: "pact slot", "free cast, 3 left". */
+export function costLabel(ability: Ability, sheet: Sheet, state: PlayState): string | null {
+  const kind = costKind(ability, sheet);
+  const pool = usesPool(ability, sheet);
+  if (kind === null || !pool) return kind;
+  const left = `${remaining(pool, state)} left`;
+  // A feature's own uses need no words: the number says it.
+  return pool.key === ability.key && ability.source !== 'spell' ? left : `${kind}, ${left}`;
 }
 
 /** "Used Hex. Spent: Bonus Action, a pact slot." Compares the state before and after a Use. */
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (948 tests in 41 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "A dialog component, an Edit button on every row, and names that tell twins apart" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 17: The ability editor

The editor is a dialog that changes one ability: timing, limited uses, tags, which views list it, its roll, and whether it is hidden (spec section 10.4). It starts from the ability as it stands, and on Save records only what differs from the imported ability, so untouched fields keep following the sheet after a re-import.

**Files:**
- Create: `apps/web/src/components/AbilityEditor.tsx`
- Create: `apps/web/src/components/RollEditor.tsx`
- Create (test): `apps/web/src/components/editor.test.tsx`
- Create: `apps/web/src/components/fieldStyles.ts`
- Create: `apps/web/src/components/useAbilityEdit.tsx`
- Modify: `apps/web/src/views/CombatView.tsx`
- Modify: `apps/web/src/views/ExploreView.tsx`

**Interfaces:**
- Consumes:
  - `Dialog` and `AbilityRow`'s `onEdit` (the task before this one).
  - `editForm`, `diffEdit`, `canEditUses`, `normaliseRoll`, `combatGroups` from `@cw/rules`; `TIMINGS`, `TAGS`, `RESET_TYPES`, `ABILITIES`, `Roll`, `EditForm` types.
  - Store: `sheet`, `baseSheet`, `setEdit(abilityKey, edit)`.
- Produces:
  - `RollEditor({ value, onChange })` in `apps/web/src/components/RollEditor.tsx`.
  - `AbilityEditor({ ability, onClose })` in `apps/web/src/components/AbilityEditor.tsx`.
  - `useAbilityEdit(): { edit: (ability: Ability) => void; editor: ReactNode }` in `apps/web/src/components/useAbilityEdit.tsx`, modelled on `useAbilityUse`: a view passes `edit` to each row as `onEdit` and renders `editor`.
  - Shared Tailwind class names for form fields in `apps/web/src/components/fieldStyles.ts`.
  - `CombatView` and `ExploreView` open the editor from a row's Edit button, and the Combat view's "Anyone can do this" group now comes from `combatGroups(sheet).universal`. The group is not shown when it is empty.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/editor.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Roll } from '@cw/model';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { RollEditor } from './RollEditor';

describe('RollEditor', () => {
  /** Holds the roll as a form would, and records each roll the editor sends. */
  function Harness({ start, onChange }: { start: Roll; onChange: (roll: Roll) => void }) {
    const [roll, setRoll] = useState(start);
    return (
      <RollEditor
        value={roll}
        onChange={(next) => {
          setRoll(next);
          onChange(next);
        }}
      />
    );
  }

  function editing(start: Roll) {
    const onChange = vi.fn<(roll: Roll) => void>();
    render(<Harness start={start} onChange={onChange} />);
    return { last: (): Roll | undefined => onChange.mock.calls.at(-1)?.[0], onChange };
  }

  const kind = () => screen.getByRole('combobox', { name: 'Roll' });
  const options = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

  async function retype(label: string, text: string) {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    if (text !== '') await userEvent.type(field, text);
  }

  it('offers the kinds of roll, and an ability check only for a roll that is one', () => {
    editing({ kind: 'none' });
    expect(kind()).toHaveValue('none');
    expect(options(kind())).toEqual(['No roll', 'Attack roll', 'Saving throw', 'Damage only', 'Dice only']);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('edits an attack: the bonus, the damage and its type', async () => {
    const { last } = editing({ kind: 'attack', bonus: 5, damage: [{ dice: '1d8+3', type: 'piercing' }], optionalDamage: [] });
    expect(kind()).toHaveValue('attack');
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(5);
    expect(screen.getByLabelText('Damage')).toHaveValue('1d8+3');
    expect(screen.getByLabelText('Damage type')).toHaveValue('piercing');
    await retype('Attack bonus', '7');
    await retype('Damage', '2d6+4');
    await retype('Damage type', 'slashing');
    expect(last()).toEqual({ kind: 'attack', bonus: 7, damage: [{ dice: '2d6+4', type: 'slashing' }], optionalDamage: [] });
  });

  it('takes a negative attack bonus', async () => {
    const { last } = editing({ kind: 'attack', bonus: 5, damage: [], optionalDamage: [] });
    await retype('Attack bonus', '-1');
    expect(last()).toMatchObject({ kind: 'attack', bonus: -1 });
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(-1);
  });

  it('edits a save: the ability by its full name, the DC and the damage', async () => {
    const { last } = editing({ kind: 'save', ability: 'str', dc: 13, damage: [{ dice: '2d6', type: 'necrotic' }] });
    const save = screen.getByRole('combobox', { name: 'Save' });
    expect(save).toHaveValue('str');
    expect(options(save)).toEqual(['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']);
    expect(screen.getByLabelText('DC')).toHaveValue(13);
    await userEvent.selectOptions(save, 'Wisdom');
    await retype('DC', '15');
    await retype('Damage type', '');
    expect(last()).toEqual({ kind: 'save', ability: 'wis', dc: 15, damage: [{ dice: '2d6', type: null }] });
  });

  it('edits damage only', async () => {
    const { last } = editing({ kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] });
    expect(screen.queryByLabelText('Attack bonus')).toBeNull();
    await retype('Damage', '1d10');
    expect(last()).toEqual({ kind: 'damage', damage: [{ dice: '1d10', type: 'necrotic' }] });
  });

  it('edits dice only', async () => {
    const { last } = editing({ kind: 'dice', dice: '2d6' });
    expect(screen.getByLabelText('Dice')).toHaveValue('2d6');
    await retype('Dice', '3d6');
    expect(last()).toEqual({ kind: 'dice', dice: '3d6' });
  });

  it('edits an ability check, which is offered only while the roll is one', async () => {
    const { last } = editing({ kind: 'check', bonus: 3 });
    expect(options(kind())).toContain('Ability check');
    await retype('Bonus', '4');
    expect(last()).toEqual({ kind: 'check', bonus: 4 });
    await userEvent.selectOptions(kind(), 'No roll');
    expect(last()).toEqual({ kind: 'none' });
    expect(options(kind())).not.toContain('Ability check');
  });

  it('starts each kind from blanks when the kind is switched', async () => {
    const { last } = editing({ kind: 'none' });
    await userEvent.selectOptions(kind(), 'Attack roll');
    expect(last()).toEqual({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] });
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(0);
    expect(screen.getByLabelText('Damage')).toHaveValue('');
    await userEvent.selectOptions(kind(), 'Saving throw');
    expect(last()).toEqual({ kind: 'save', ability: 'str', dc: 10, damage: [] });
    await userEvent.selectOptions(kind(), 'Damage only');
    expect(last()).toEqual({ kind: 'damage', damage: [] });
    await userEvent.selectOptions(kind(), 'Dice only');
    expect(last()).toEqual({ kind: 'dice', dice: '' });
    expect(screen.getByLabelText('Dice')).toHaveValue('');
  });

  it('carries further damage parts and optional damage while the kind stays the same, and drops them when it changes', async () => {
    const { last } = editing({
      kind: 'attack',
      bonus: 5,
      damage: [{ dice: '1d8+3', type: 'piercing' }, { dice: '1d4', type: 'fire' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    });
    await retype('Damage', '1d10+3');
    await retype('Attack bonus', '6');
    expect(last()).toEqual({
      kind: 'attack',
      bonus: 6,
      damage: [{ dice: '1d10+3', type: 'piercing' }, { dice: '1d4', type: 'fire' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    });
    await userEvent.selectOptions(kind(), 'Saving throw');
    expect(last()).toEqual({ kind: 'save', ability: 'str', dc: 10, damage: [] });
    await userEvent.selectOptions(kind(), 'Attack roll');
    expect(last()).toEqual({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] });
  });

  it('sends a roll that is not finished yet while a field is empty', async () => {
    const { last } = editing({ kind: 'dice', dice: '2d6' });
    await retype('Dice', '');
    expect(last()).toEqual({ kind: 'dice', dice: '' });
  });
});

describe('AbilityEditor', () => {
  async function open(slug: Slug, view: View = 'combat') {
    const record = await seed(slug);
    const screenOf = render(<CharacterScreen id={record.id} view={view} />);
    await screen.findByRole('heading', { name: record.name });
    return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
  }

  const row = (label: string) => screen.getByRole('article', { name: label });
  const group = (name: string) =>
    within(screen.getByRole('region', { name })).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));

  /** Opens a row and taps its Edit button. `label` is the row's accessible name, `name` the ability's. */
  async function edit(label: string, name = label) {
    const article = row(label);
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: `Edit ${label}` }));
    return screen.getByRole('dialog', { name: `Edit ${name}` });
  }

  const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const edits = () => useStore.getState().edits.abilities;

  it('opens from a row, showing the ability as it stands', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    expect(within(dialog).getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
    expect(within(within(dialog).getByRole('combobox', { name: 'Timing' })).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Action', 'Bonus Action', 'Reaction', 'No action needed', 'Passive', 'Takes a minute or more']);
    expect(within(dialog).getByRole('button', { name: 'Damage' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Debuff' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Healing' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getAllByRole('button', { pressed: false }).map((b) => b.textContent))
      .toEqual(['Healing', 'Buff', 'Control', 'Movement', 'Defence', 'Utility', 'Social']);
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).getByRole('combobox', { name: 'Roll' })).toHaveValue('damage');
    expect(within(dialog).getByRole('checkbox', { name: 'Hide this ability' })).not.toBeChecked();
  });

  it('moves a row to another group when its timing changes, and marks it edited', async () => {
    await open('vlad');
    await edit('Hex');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Timing' }), 'Action');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(group('Action')).toContain('Hex');
    expect(group('Bonus Action')).not.toContain('Hex');
    expect(row('Hex')).toHaveTextContent('edited');
    expect(edits()).toEqual({ [ability('Hex').key]: { timing: 'action' } });
  });

  it('offers an unknown timing only for an ability whose timing is unknown', async () => {
    await open('franny');
    const other = within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')[0];
    await userEvent.click(within(other).getAllByRole('button')[0]);
    await userEvent.click(within(other).getByRole('button', { name: 'Edit Twig Attack' }));
    const timing = screen.getByRole('combobox', { name: 'Timing' });
    expect(timing).toHaveValue('unknown');
    expect(within(timing).getByRole('option', { name: 'Unknown' })).toBeInTheDocument();
  });

  it('gives limited uses to an ability that had none: pips, a number left, and Use spends one', async () => {
    await open('sid');
    const dialog = await edit('Cunning Action');
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    const max = within(dialog).getByLabelText('Maximum uses');
    await userEvent.clear(max);
    await userEvent.type(max, '2');
    const reset = within(dialog).getByRole('combobox', { name: 'Comes back on' });
    expect(within(reset).getAllByRole('option').map((o) => o.textContent)).toEqual(['Short Rest', 'Long Rest', 'Never']);
    await userEvent.selectOptions(reset, 'Short Rest');
    await save();
    expect(edits()).toEqual({ [ability('Cunning Action').key]: { uses: { max: 2, reset: 'short' } } });
    expect(row('Cunning Action')).toHaveTextContent('2 left');
    expect(screen.getByRole('group', { name: 'Cunning Action: 2 of 2 left' })).toBeInTheDocument();
    await userEvent.click(within(row('Cunning Action')).getByRole('button', { name: 'Use Cunning Action' }));
    expect(row('Cunning Action')).toHaveTextContent('1 left');
    expect(screen.getByRole('group', { name: 'Cunning Action: 1 of 2 left' })).toBeInTheDocument();
  });

  it('asks for a maximum between 1 and 99 before saving limited uses', async () => {
    await open('sid');
    const dialog = await edit('Cunning Action');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await userEvent.clear(within(dialog).getByLabelText('Maximum uses'));
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(edits()).toEqual({});
    await userEvent.type(within(dialog).getByLabelText('Maximum uses'), '100');
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(edits()).toEqual({});
  });

  it('changes and removes the limited uses of an ability that has them', async () => {
    await open('danger');
    const dialog = await edit('Second Wind');
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).toBeChecked();
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(3);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await save();
    expect(edits()).toEqual({ [ability('Second Wind').key]: { uses: 'none' } });
    expect(row('Second Wind')).not.toHaveTextContent('left');
    expect(screen.queryByRole('group', { name: /^Second Wind:/ })).toBeNull();
  });

  it('says a spell that costs a slot has no uses to edit', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    expect(within(dialog).getByText('This ability costs a spell slot.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Limited uses' })).toBeNull();
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    expect(within(dialog).queryByRole('combobox', { name: 'Comes back on' })).toBeNull();
  });

  it('toggles a tag', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Control' }));
    expect(within(dialog).getByRole('button', { name: 'Control' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Damage' }));
    expect(within(dialog).getByRole('button', { name: 'Damage' })).toHaveAttribute('aria-pressed', 'false');
    await save();
    expect(ability('Hex').tags).toEqual(['debuff', 'control']);
    expect(row('Hex')).toHaveTextContent('pact slot · concentration · debuff · control · edited');
  });

  it('lists an ability in Explore once Explore is ticked', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Explore' }));
    await save();
    expect(edits()).toEqual({ [ability('Hex').key]: { inExplore: true } });
    expect(group('Bonus Action')).toContain('Hex');
    show('explore');
    expect(await screen.findByRole('region', { name: 'Out of combat abilities' })).toBeInTheDocument();
    expect(group('Out of combat abilities')).toContain('Hex');
  });

  it('takes an ability out of Combat when Combat is unticked, and edits from Explore too', async () => {
    const { show } = await open('vlad', 'explore');
    const dialog = await edit('Charm Person');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(group('Out of combat abilities')).toContain('Charm Person');
    show('combat');
    expect(await screen.findByRole('region', { name: 'Action' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Charm Person' })).toBeNull();
  });

  it('replaces an attack bonus, which changes the roll line and keeps the rest of the roll', async () => {
    await open('vlad');
    expect(row('Wurms Claw - Sword')).toHaveTextContent('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    const dialog = await edit('Wurms Claw - Sword');
    const bonus = within(dialog).getByLabelText('Attack bonus');
    await userEvent.clear(bonus);
    await userEvent.type(bonus, '7');
    await save();
    expect(row('Wurms Claw - Sword')).toHaveTextContent('Roll d20 + 7. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(row('Wurms Claw - Sword')).toHaveTextContent('edited');
  });

  it('does not save a roll that is not finished', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Roll' }), 'Dice only');
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Finish the roll, or choose No roll.');
    expect(screen.getByRole('dialog', { name: 'Edit Hex' })).toBeInTheDocument();
    expect(edits()).toEqual({});
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Roll' }), 'No roll');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({ [ability('Hex').key]: { roll: { kind: 'none' } } });
  });

  it('hides an ability', async () => {
    await open('vlad');
    const key = ability('Hex').key;
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this ability' }));
    await save();
    expect(screen.queryByRole('article', { name: 'Hex' })).toBeNull();
    expect(useStore.getState().sheet?.hidden.map((a) => a.name)).toEqual(['Hex']);
    expect(edits()).toEqual({ [key]: { hidden: true } });
  });

  it('puts an edited ability back to imported, and offers that only for an edited one', async () => {
    await open('vlad');
    const first = await edit('Hex');
    expect(within(first).queryByRole('button', { name: 'Back to imported' })).toBeNull();
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Timing' }), 'Reaction');
    await userEvent.click(within(first).getByRole('button', { name: 'Utility' }));
    await save();
    expect(group('Reaction')).toContain('Hex');

    const second = await edit('Hex');
    await userEvent.click(within(second).getByRole('button', { name: 'Back to imported' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(group('Bonus Action')).toContain('Hex');
    expect(row('Hex')).not.toHaveTextContent('edited');
    expect(edits()).toEqual({});
  });

  it('saves nothing on Cancel', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    expect(group('Bonus Action')).toContain('Hex');
  });

  it('saves nothing when the dialog is closed with Escape, and starts afresh the next time', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    await userEvent.click(within(row('Hex')).getByRole('button', { name: 'Edit Hex' }));
    expect(screen.getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
  });

  it('saves nothing when nothing was changed', async () => {
    await open('vlad');
    await edit('Wurms Claw - Sword');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    expect(row('Wurms Claw - Sword')).not.toHaveTextContent('edited');
  });

  it('edits a universal action, which stays under "Anyone can do this"', async () => {
    await open('vlad');
    const dialog = await edit('Dash');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Movement' }));
    await save();
    expect(ability('Dash').tags).toEqual(['movement']);
    expect(row('Dash')).toHaveTextContent('edited');
    expect(row('Dash').closest('details')).toHaveTextContent('Anyone can do this');
  });

  it('takes a universal action out of Combat when Combat is unticked', async () => {
    await open('vlad');
    const dialog = await edit('Dash');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(screen.queryByRole('article', { name: 'Dash' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Dodge' })).toBeInTheDocument();
  });

  it('tells twins apart on the Edit button and titles the editor with the name', async () => {
    await open('vlad');
    const dialog = await edit('Misty Step (free cast)', 'Misty Step');
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).toBeChecked();
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(3);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/components/editor.test.tsx
```

Expected: FAIL. `./RollEditor` and `./AbilityEditor` cannot be found.

- [ ] **Step 3: Write the implementation**

The roll editor edits the first damage part only. Further parts, and an attack's optional damage, are carried through unchanged while the kind of roll stays the same, and dropped when it changes.

While the player is typing, the roll may be unfinished (an attack with no damage dice is fine, a "dice only" roll with no dice is not). Save passes a roll the player changed through `normaliseRoll` and refuses with "Finish the roll, or choose No roll." when that returns null. A roll the player did not touch is kept exactly as it is, so that opening and saving an ability never records an edit by accident.

Limited uses need a maximum from 1 to 99; otherwise Save refuses with "Set the maximum uses, from 1 to 99.".

"Back to imported" is offered only for an ability that carries an edit. It stores an empty edit, which removes every change to that ability.

Create `apps/web/src/components/AbilityEditor.tsx`:

```tsx
import { TAGS, type Ability, type ResetType, type Roll, type Tag, type Timing } from '@cw/model';
import { canEditUses, diffEdit, editForm, normaliseRoll, type EditForm } from '@cw/rules';
import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import { ALERT, BUTTON, CHECK, INPUT, LABEL, PRIMARY } from './fieldStyles';

const TIMING_OPTIONS: { value: Timing; label: string }[] = [
  { value: 'action', label: 'Action' },
  { value: 'bonus', label: 'Bonus Action' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'free', label: 'No action needed' },
  { value: 'passive', label: 'Passive' },
  { value: 'long', label: 'Takes a minute or more' },
];

const RESET_OPTIONS: { value: ResetType; label: string }[] = [
  { value: 'short', label: 'Short Rest' },
  { value: 'long', label: 'Long Rest' },
  { value: 'never', label: 'Never' },
];

/** "Unknown" is something the import says, not something a player chooses, so it is offered only to keep. */
const UNKNOWN = { value: 'unknown', label: 'Unknown' } as const;

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What the form holds while it is open. The uses are kept apart so that unticking them forgets nothing. */
interface Draft extends Omit<EditForm, 'uses'> {
  limited: boolean;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
}

/** Changes one ability: when it is used, what it costs, how it is tagged, where it is listed and what it rolls. */
export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const baseSheet = useStore((s) => s.baseSheet);
  const setEdit = useStore((s) => s.setEdit);
  const id = useId();
  const [start] = useState<EditForm | null>(() => (sheet ? editForm(sheet, ability) : null));
  const [draft, setDraft] = useState<Draft | null>(() =>
    start ? { ...start, limited: start.uses !== null, max: start.uses?.max ?? 1, reset: start.uses?.reset ?? 'long' } : null);
  const [error, setError] = useState<string | null>(null);

  if (!sheet || !baseSheet || !start || !draft) return null;

  const change = (next: Partial<Draft>): void => {
    setDraft({ ...draft, ...next });
    setError(null);
  };
  const usesEditable = canEditUses(ability);
  const timings = start.timing === 'unknown' ? [...TIMING_OPTIONS, UNKNOWN] : TIMING_OPTIONS;
  const resets = start.uses?.reset === 'unknown' ? [...RESET_OPTIONS, UNKNOWN] : RESET_OPTIONS;
  const canRestore = sheet.edited.includes(ability.key) && ability.source !== 'custom';

  function save(event: FormEvent): void {
    event.preventDefault();
    if (!sheet || !baseSheet || !start || !draft) return;
    if (usesEditable && draft.limited && !(Number.isInteger(draft.max) && draft.max >= 1 && draft.max <= 99)) {
      setError('Set the maximum uses, from 1 to 99.');
      return;
    }
    // A roll the player did not touch is kept exactly as it is; one they changed must be a finished roll.
    const roll: Roll | null = draft.roll === start.roll ? draft.roll : normaliseRoll(draft.roll);
    if (!roll) {
      setError('Finish the roll, or choose No roll.');
      return;
    }
    const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key);
    if (!base) return;
    const form: EditForm = {
      timing: draft.timing,
      uses: usesEditable && draft.limited ? { max: draft.max, reset: draft.reset } : null,
      tags: draft.tags,
      roll,
      inCombat: draft.inCombat,
      inExplore: draft.inExplore,
      hidden: draft.hidden,
    };
    setEdit(ability.key, diffEdit(baseSheet, base, form));
    onClose();
  }

  const toggleTag = (tag: Tag): void =>
    // Kept in the order the tags are listed, whatever order they were tapped in.
    change({ tags: TAGS.filter((t) => (t === tag ? !draft.tags.includes(t) : draft.tags.includes(t))) });

  return (
    <Dialog title={`Edit ${ability.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <div>
          <label htmlFor={`${id}-timing`} className={LABEL}>Timing</label>
          <select
            id={`${id}-timing`}
            value={draft.timing}
            onChange={(event) => change({ timing: event.target.value as Timing })}
            className={INPUT}
          >
            {timings.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {usesEditable ? (
          <div className="space-y-3">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.limited} onChange={(event) => change({ limited: event.target.checked })} className="size-5" />
              <span>Limited uses</span>
            </label>
            {draft.limited ? (
              <>
                <div>
                  <label htmlFor={`${id}-max`} className={LABEL}>Maximum uses</label>
                  <input
                    id={`${id}-max`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={Number.isFinite(draft.max) ? draft.max : ''}
                    onChange={(event) => change({ max: event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-reset`} className={LABEL}>Comes back on</label>
                  <select
                    id={`${id}-reset`}
                    value={draft.reset}
                    onChange={(event) => change({ reset: event.target.value as ResetType })}
                    className={INPUT}
                  >
                    {resets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This ability costs a spell slot.</p>
        )}

        <fieldset>
          <legend className={LABEL}>Tags</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className={`min-h-11 rounded-full border px-3 py-1.5 text-sm ${
                    on ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {capitalised(tag)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LABEL}>Shown in</legend>
          <div className="flex gap-6">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.inCombat} onChange={(event) => change({ inCombat: event.target.checked })} className="size-5" />
              <span>Combat</span>
            </label>
            <label className={CHECK}>
              <input type="checkbox" checked={draft.inExplore} onChange={(event) => change({ inExplore: event.target.checked })} className="size-5" />
              <span>Explore</span>
            </label>
          </div>
        </fieldset>

        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        <label className={CHECK}>
          <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
          <span>Hide this ability</span>
        </label>

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {canRestore ? (
            <button
              type="button"
              onClick={() => {
                setEdit(ability.key, {});
                onClose();
              }}
              className={`${BUTTON} ml-auto`}
            >
              Back to imported
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
```

Create `apps/web/src/components/RollEditor.tsx`:

```tsx
import { ABILITIES, type AbilityName, type DamagePart, type Roll } from '@cw/model';
import { abilityLabel } from '@cw/rules';
import { useId, type ReactNode } from 'react';
import { INPUT, LABEL } from './fieldStyles';

type Kind = Roll['kind'];

const KIND_LABEL: Record<Kind, string> = {
  none: 'No roll',
  attack: 'Attack roll',
  save: 'Saving throw',
  damage: 'Damage only',
  dice: 'Dice only',
  check: 'Ability check',
};

/** The kinds a player can choose. An ability check is offered only for a roll that already is one. */
const CHOICES: Kind[] = ['none', 'attack', 'save', 'damage', 'dice'];

/** The roll a kind starts from when the player switches to it. */
function blank(kind: Kind): Roll {
  switch (kind) {
    case 'attack':
      return { kind, bonus: 0, damage: [], optionalDamage: [] };
    case 'save':
      return { kind, ability: 'str', dc: 10, damage: [] };
    case 'damage':
      return { kind, damage: [] };
    case 'dice':
      return { kind, dice: '' };
    case 'check':
      return { kind, bonus: 0 };
    default:
      return { kind: 'none' };
  }
}

/** `damage` with its first part changed. Any further parts are kept as they are. */
function withFirst(damage: DamagePart[], change: Partial<DamagePart>): DamagePart[] {
  const first: DamagePart = { dice: damage[0]?.dice ?? '', type: damage[0]?.type ?? null, ...change };
  return [first, ...damage.slice(1)];
}

/** An empty number field is not a number yet; the form that holds the roll decides what to say about it. */
const numberFrom = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));
const numberText = (value: number): number | string => (Number.isFinite(value) ? value : '');

interface Props {
  value: Roll;
  /** Called with every change, including rolls that are not finished yet (empty dice, an empty number). */
  onChange: (roll: Roll) => void;
}

/**
 * The fields for one roll: its kind, then what that kind needs. It edits the first damage part
 * only; further parts, and an attack's optional damage, stay as they are until the kind changes.
 */
export function RollEditor({ value, onChange }: Props) {
  const id = useId();
  const kinds = value.kind === 'check' ? [...CHOICES, value.kind] : CHOICES;

  const field = (name: string, label: string, control: (fieldId: string) => ReactNode): ReactNode => (
    <div>
      <label htmlFor={`${id}-${name}`} className={LABEL}>{label}</label>
      {control(`${id}-${name}`)}
    </div>
  );

  const number = (name: string, label: string, current: number, change: (n: number) => void): ReactNode =>
    field(name, label, (fieldId) => (
      <input
        id={fieldId}
        type="number"
        inputMode="numeric"
        value={numberText(current)}
        onChange={(event) => change(numberFrom(event.target.value))}
        className={INPUT}
      />
    ));

  const text = (name: string, label: string, current: string, change: (text: string) => void, hint?: string): ReactNode =>
    field(name, label, (fieldId) => (
      <input
        id={fieldId}
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        placeholder={hint}
        value={current}
        onChange={(event) => change(event.target.value)}
        className={INPUT}
      />
    ));

  /** The first damage part's two fields, for the kinds that have damage. */
  const damage = (roll: Extract<Roll, { damage: DamagePart[] }>): ReactNode => (
    <>
      {text('damage', 'Damage', roll.damage[0]?.dice ?? '', (dice) => onChange({ ...roll, damage: withFirst(roll.damage, { dice }) }), '1d8+3')}
      {text('type', 'Damage type', roll.damage[0]?.type ?? '', (type) =>
        onChange({ ...roll, damage: withFirst(roll.damage, { type: type === '' ? null : type }) }))}
    </>
  );

  return (
    <div className="space-y-3">
      {field('kind', 'Roll', (fieldId) => (
        <select
          id={fieldId}
          value={value.kind}
          onChange={(event) => onChange(blank(event.target.value as Kind))}
          className={INPUT}
        >
          {kinds.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
        </select>
      ))}

      {value.kind === 'attack' ? (
        <>
          {number('bonus', 'Attack bonus', value.bonus, (bonus) => onChange({ ...value, bonus }))}
          {damage(value)}
        </>
      ) : null}

      {value.kind === 'save' ? (
        <>
          {field('ability', 'Save', (fieldId) => (
            <select
              id={fieldId}
              value={value.ability}
              onChange={(event) => onChange({ ...value, ability: event.target.value as AbilityName })}
              className={INPUT}
            >
              {ABILITIES.map((ability) => <option key={ability} value={ability}>{abilityLabel(ability)}</option>)}
            </select>
          ))}
          {number('dc', 'DC', value.dc, (dc) => onChange({ ...value, dc }))}
          {damage(value)}
        </>
      ) : null}

      {value.kind === 'damage' ? damage(value) : null}

      {value.kind === 'dice' ? text('dice', 'Dice', value.dice, (dice) => onChange({ ...value, dice }), '2d6') : null}

      {value.kind === 'check' ? number('bonus', 'Bonus', value.bonus, (bonus) => onChange({ ...value, bonus })) : null}
    </div>
  );
}
```

Create `apps/web/src/components/fieldStyles.ts`:

```ts
/** The look shared by the editors' form controls. */
export const LABEL = 'block text-sm font-medium text-slate-700';
export const INPUT = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
/** A tick box with its words beside it: the whole line is the tap target. */
export const CHECK = 'flex min-h-11 items-center gap-2';
export const BUTTON = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium';
export const PRIMARY = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white';
export const ALERT = 'rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm';
```

Create `apps/web/src/components/useAbilityEdit.tsx`:

```tsx
import type { Ability } from '@cw/model';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';

/**
 * What a view needs to make Edit work: `edit` opens the editor for an ability, and `editor` is
 * that dialog, to render once in the view. The ability is remembered by key, so the editor closes
 * by itself if the ability leaves the sheet while it is open.
 */
export function useAbilityEdit(): { edit: (ability: Ability) => void; editor: ReactNode } {
  const sheet = useStore((s) => s.sheet);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const editing = sheet && editingKey !== null
    ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === editingKey)
    : undefined;

  // Forget an ability that has left the sheet, so its editor does not come back if the ability does.
  useEffect(() => {
    if (editingKey !== null && !editing) setEditingKey(null);
  }, [editingKey, editing]);

  return {
    edit: (ability) => setEditingKey(ability.key),
    // Keyed, so that opening the editor for another ability starts a new form.
    editor: editing ? <AbilityEditor key={editing.key} ability={editing} onClose={() => setEditingKey(null)} /> : null,
  };
}
```

Replace the whole of `apps/web/src/views/CombatView.tsx` with:

```tsx
import type { Ability } from '@cw/model';
import { TIMING_LABEL, combatGroups, pools, type Sheet, type TurnTiming } from '@cw/rules';
import { useMemo, type ReactNode } from 'react';
import { AbilityRow } from '../components/AbilityRow';
import { ConcentrationBanner } from '../components/ConcentrationBanner';
import { NotesList } from '../components/NotesList';
import { ResourceChips } from '../components/ResourceChips';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useAbilityUse } from '../components/useAbilityUse';
import { useStore } from '../store';

const TIMINGS: TurnTiming[] = ['action', 'bonus', 'reaction'];

const SUMMARY = 'flex min-h-11 cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700';

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
  const { edit, editor } = useAbilityEdit();
  const groups = useMemo(() => combatGroups(sheet), [sheet]);
  const allPools = useMemo(() => pools(sheet), [sheet]);

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
        onEdit={edit}
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
              className={`min-h-11 flex-1 rounded-full border px-2 py-1.5 text-sm ${
                spent ? 'border-slate-300 text-slate-500 line-through' : 'border-indigo-300 bg-indigo-50 text-indigo-900'
              }`}
            >
              {TIMING_LABEL[timing]}
            </button>
          );
        })}
      </div>

      <ResourceChips pools={allPools} state={play} onAdjust={(pool, delta) => adjust(pool.key, delta)} />

      <ConcentrationBanner sheet={sheet} concentrationKey={play.concentrationKey} onEnd={endConcentration} />

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
      {groups.universal.length > 0 ? <Folded title="Anyone can do this">{rows(groups.universal)}</Folded> : null}
      <Folded title="Keep in mind" count={sheet.notes.length}>
        <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
      </Folded>

      {slotSheet}
      {editor}
    </div>
  );
}
```

Apply this change to `apps/web/src/views/ExploreView.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -5,6 +5,7 @@ import { AbilityRow } from '../components/AbilityRow';
 import { ConcentrationBanner } from '../components/ConcentrationBanner';
 import { NotesList } from '../components/NotesList';
 import { ResourceChips } from '../components/ResourceChips';
+import { useAbilityEdit } from '../components/useAbilityEdit';
 import { useAbilityUse } from '../components/useAbilityUse';
 import { useStore } from '../store';
 
@@ -87,6 +88,7 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
   const rest = useStore((s) => s.rest);
   const endConcentration = useStore((s) => s.endConcentration);
   const { request, slotSheet } = useAbilityUse('explore');
+  const { edit, editor } = useAbilityEdit();
   const [query, setQuery] = useState('');
   const needle = query.trim().toLowerCase();
   const matches = (text: string): boolean => needle === '' || text.toLowerCase().includes(needle);
@@ -113,6 +115,7 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
         mode="explore"
         onUse={request}
         onAdjust={(pool, delta) => adjust(pool.key, delta)}
+        onEdit={edit}
       />
     ));
   } else if (needle === '') {
@@ -161,6 +164,7 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
       </div>
 
       {slotSheet}
+      {editor}
     </div>
   );
 }
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (978 tests in 42 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The ability editor: timing, uses, tags, views, roll, hide and back to imported" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 18: Edit list: arrange rows by drag or by button, hide and restore

Playing and arranging are separate (spec section 10.4). "Edit list" at the bottom of each view switches it into arranging: rows show a drag handle, "Move up" and "Move down", Edit and Hide, and no Use button; hidden abilities sit in a "Hidden" drawer with Restore; "Done" returns to playing. Combat and Explore each keep their own order.

**Files:**
- Create: `apps/web/src/components/ArrangeRow.tsx`
- Create: `apps/web/src/components/ArrangeSection.tsx`
- Create: `apps/web/src/components/HiddenDrawer.tsx`
- Modify: `apps/web/src/views/CombatView.tsx`
- Create: `apps/web/src/views/EditList.tsx`
- Modify: `apps/web/src/views/ExploreView.tsx`
- Create (test): `apps/web/src/views/editlist.test.tsx`

**Interfaces:**
- Consumes:
  - `AbilityEditor` (the task before this one) and the twin names of the task before that.
  - `combatGroups`, `exploreAbilities`, `Sheet.hidden` from `@cw/rules`.
  - Store: `edits`, `setEdit(abilityKey, edit)`, `setOrder(view, groupKeys)`.
- Produces:
  - `EditList({ view, sheet, onDone })` in `apps/web/src/views/EditList.tsx`, and the pure function it exports for reordering: `moved(keys: string[], activeKey: string, overKey: string): string[]`.
  - `ArrangeSection`, `ArrangeRow` and `HiddenDrawer` in `apps/web/src/components`: one group of rows that can be reordered, one such row, and the list of hidden abilities.
  - `CombatView` and `ExploreView` each have an "Edit list" button and show `EditList` while arranging.

- [ ] **Step 1: Prepare**

Add dnd-kit to the web app:

```bash
pnpm --filter @cw/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: the three packages appear under `dependencies` in `apps/web/package.json`.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/views/editlist.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { moved } from './EditList';

async function open(slug: Slug, view: View = 'combat') {
  const record = await seed(slug);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => userEvent.click(button(name));
const arrange = () => tap('Edit list');
const done = () => tap('Done');

/** The rows of one section while arranging, by accessible name, in order. */
const arranged = (section: string) =>
  within(screen.getByRole('region', { name: section })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

/** The rows of one group while playing, by accessible name, in order. */
const played = (group: string) =>
  within(screen.getByRole('region', { name: group })).getAllByRole('article').map((a) => a.getAttribute('aria-label'));

const state = () => useStore.getState();

describe('moved', () => {
  it('puts the dragged key where the key it was dropped on is', () => {
    expect(moved(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'c', 'b']);
  });

  it('changes nothing when dropped on itself or on a key that is not in the list', () => {
    const keys = ['a', 'b', 'c'];
    expect(moved(keys, 'b', 'b')).toEqual(keys);
    expect(moved(keys, 'b', 'z')).toEqual(keys);
    expect(moved(keys, 'z', 'a')).toEqual(keys);
  });

  it('leaves the list it was given as it was', () => {
    const keys = ['a', 'b', 'c'];
    moved(keys, 'a', 'c');
    expect(keys).toEqual(['a', 'b', 'c']);
  });
});

describe('Edit list', () => {
  it('shows each row with a handle and no Use button, under the same headings as the view', async () => {
    await open('vlad');
    expect(button('Use Hex')).toBeInTheDocument();
    await arrange();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')))
      .toEqual(['Resources', 'Action', 'Bonus Action', 'Reaction', 'No action needed', 'Anyone can do this']);
    expect(arranged('Bonus Action')).toEqual([
      'Hex', 'Misty Step (pact slot)', 'Misty Step (free cast)', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    for (const control of ['Drag Hex', 'Move Hex up', 'Move Hex down', 'Edit Hex', 'Hide Hex', 'Drag Misty Step (free cast)']) {
      expect(button(control)).toBeInTheDocument();
    }
    const hex = within(screen.getByRole('region', { name: 'Bonus Action' })).getAllByRole('listitem')[0];
    expect(hex).toHaveTextContent('Hex');
    expect(hex).not.toHaveTextContent('Damage:');
    expect(screen.queryByText(/^Hidden/)).toBeNull();
  });

  it('keeps the turn pills, the resources and concentration in sight while arranging in Combat', async () => {
    await open('vlad');
    await tap('Use Hex');
    await arrange();
    expect(screen.getByRole('button', { name: 'Bonus Action: spent' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
  });

  it('goes back to playing on Done', async () => {
    await open('vlad');
    await arrange();
    await done();
    expect(button('Use Hex')).toBeInTheDocument();
    expect(button('Edit list')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drag Hex' })).toBeNull();
  });

  it('moves a row down and up with the buttons, and keeps the order after Done', async () => {
    await open('vlad');
    await arrange();
    await tap('Move Hex down');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Hex', 'Misty Step (free cast)']);
    await tap('Move Hex down');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
    await tap('Move Misty Step (free cast) up');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (free cast)', 'Misty Step (pact slot)', 'Hex']);
    await done();
    expect(played('Bonus Action')).toEqual([
      'Misty Step (free cast)', 'Misty Step (pact slot)', 'Hex', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    expect(played('Action').slice(0, 2)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe']);
  });

  it('disables moving the first row up and the last row down', async () => {
    await open('vlad');
    await arrange();
    expect(button('Move Hex up')).toBeDisabled();
    expect(button('Move Hex down')).toBeEnabled();
    expect(button('Move Pact of the Blade: Bond up')).toBeEnabled();
    expect(button('Move Pact of the Blade: Bond down')).toBeDisabled();
    await tap('Move Hex down');
    expect(button('Move Hex up')).toBeEnabled();
    expect(button('Move Misty Step (pact slot) up')).toBeDisabled();
  });

  it('keeps an order for each view: arranging Combat leaves Explore alone, and the other way round', async () => {
    const { show } = await open('vlad');
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Charm Person', 'Phantasmal Force']);
    await arrange();
    await tap('Move Phantasmal Force up');
    await done();
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Phantasmal Force', 'Charm Person']);

    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Phantasmal Force', 'Misty Step (free cast)', 'Magical Cunning',
    ]);
    await arrange();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Abilities']);
    expect(screen.queryByRole('searchbox')).toBeNull();
    await tap('Move Magical Cunning up');
    await tap('Move Magical Cunning up');
    expect(arranged('Abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Magical Cunning', 'Phantasmal Force', 'Misty Step (free cast)',
    ]);
    await done();
    expect(played('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Magical Cunning', 'Phantasmal Force', 'Misty Step (free cast)',
    ]);
    expect(state().edits.order.explore).toHaveLength(5);

    show('combat');
    await screen.findByRole('region', { name: 'Action' });
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Phantasmal Force', 'Charm Person']);
    expect(played('Bonus Action')[0]).toBe('Hex');
  });

  it('hides a row into the Hidden drawer and restores it from there', async () => {
    await open('vlad');
    await arrange();
    await tap('Hide Hex');
    expect(arranged('Bonus Action')).not.toContain('Hex');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    expect(state().edits.abilities).toEqual({ [state().sheet?.hidden[0].key ?? '']: { hidden: true } });
    await done();
    expect(screen.queryByRole('article', { name: 'Hex' })).toBeNull();

    await arrange();
    await tap('Restore Hex');
    expect(screen.queryByText(/^Hidden/)).toBeNull();
    expect(arranged('Bonus Action')).toContain('Hex');
    expect(state().edits.abilities).toEqual({});
    await done();
    expect(screen.getByRole('article', { name: 'Hex' })).toBeInTheDocument();
  });

  it('keeps the rest of an edit when hiding and restoring', async () => {
    await open('vlad');
    const key = ability('Hex').key;
    state().setEdit(key, { tags: ['debuff'] });
    await arrange();
    await tap('Hide Hex');
    expect(state().edits.abilities[key]).toEqual({ tags: ['debuff'], hidden: true });
    await tap('Restore Hex');
    expect(state().edits.abilities[key]).toEqual({ tags: ['debuff'] });
  });

  it('counts every hidden ability, whichever view hid it', async () => {
    const { show } = await open('vlad');
    await arrange();
    await tap('Hide Hex');
    await tap('Hide Dash');
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    await done();
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    await arrange();
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    expect(button('Restore Hex')).toBeInTheDocument();
    expect(button('Restore Dash')).toBeInTheDocument();
  });

  it('arranges and hides the universal actions like any other row', async () => {
    await open('vlad');
    await arrange();
    expect(arranged('Anyone can do this').slice(0, 3)).toEqual(['Attack', 'Dash', 'Disengage']);
    await tap('Move Dash up');
    await tap('Hide Disengage');
    expect(arranged('Anyone can do this').slice(0, 3)).toEqual(['Dash', 'Attack', 'Dodge']);
    await done();
    const universal = screen.getByText('Anyone can do this').closest('details');
    if (!universal) throw new Error('no universal group');
    expect(within(universal).getAllByRole('article').map((a) => a.getAttribute('aria-label')).slice(0, 3)).toEqual(['Dash', 'Attack', 'Dodge']);
  });

  it('opens the editor from a row, and shows the change in the list', async () => {
    await open('vlad');
    await arrange();
    await tap('Edit Hex');
    const dialog = screen.getByRole('dialog', { name: 'Edit Hex' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Reaction');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(arranged('Bonus Action')).not.toContain('Hex');
    expect(arranged('Reaction')).toContain('Hex');
    expect(button('Drag Hex')).toBeInTheDocument();
  });

  it('lists only the groups that have rows', async () => {
    await open('franny');
    await arrange();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')))
      .toEqual(['Resources', 'Action', 'Bonus Action', 'Other', 'Anyone can do this']);
    expect(arranged('Other')).toEqual(['Twig Attack', 'Twig Attack']);
  });

  it('is reached from Explore even when no ability is listed there', async () => {
    await open('franny', 'explore');
    for (const name of ['Beast Sense', 'Speak with Animals']) state().setEdit(ability(name).key, { inExplore: false });
    await arrange();
    expect(screen.queryByRole('region')).toBeNull();
    await done();
    expect(screen.getByText('Nothing on this sheet is marked for use outside combat.')).toBeInTheDocument();
  });
});

describe('dragging with the keyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** jsdom lays nothing out, so each row is given a place by its position in its list. */
  function layOutRows() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: Element) {
      const li = this.closest('li');
      const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
      const top = index * 50;
      return { x: 0, y: top, top, bottom: top + 50, left: 0, right: 300, width: 300, height: 50, toJSON: () => ({}) };
    });
  }

  it('picks a row up by its handle, moves it with the arrow keys and drops it', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hex').focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Space]');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
    expect(arranged('Action').slice(0, 2)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe']);
    await done();
    expect(played('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
  });

  it('keeps a row in its section however far it is moved', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hellish Rebuke (pact slot)').focus();
    await userEvent.keyboard('[Space]');
    for (let presses = 0; presses < 4; presses += 1) await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Space]');
    expect(arranged('Reaction')).toEqual(['Hellish Rebuke (free cast)', 'Hellish Rebuke (pact slot)']);
    expect(arranged('No action needed')).not.toContain('Hellish Rebuke (pact slot)');
  });

  it('puts the row back on Escape', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hex').focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Escape]');
    expect(arranged('Bonus Action')[0]).toBe('Hex');
    expect(state().edits.order.combat).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/views/editlist.test.tsx
```

Expected: FAIL. `./EditList` cannot be found.

- [ ] **Step 4: Write the implementation**

Dragging and the two buttons end in the same call: the group's keys in their new order, passed to `setOrder`. A row cannot leave its group; moving an ability to another group is done by changing its timing in the editor.

The first time a group is arranged, its whole order is recorded. An ability that arrives later (a re-import, a custom ability) is not in the record and so goes to the end of its group.

Each group has its own drag context, so a row cannot be dropped into another group, and a small inline modifier keeps a dragged row moving up and down only.

A pointer drag is not simulated in tests. `moved` is tested directly, the buttons are tested through the screen, and three tests drive a drag from the keyboard, with the rows' positions stubbed because jsdom lays nothing out. The pointer and touch gestures are checked by hand in the last task's walk-through.

In the Explore view, arranging replaces the whole view, and "Edit list" sits at the very bottom so that it can be reached when no ability is listed.

Create `apps/web/src/components/ArrangeRow.tsx`:

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ICON = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 disabled:text-slate-300';
const TEXT = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-indigo-700';

interface Props {
  /** The ability's key: what the row is sorted by. */
  id: string;
  /** The name the row and its buttons are known by. */
  label: string;
  first: boolean;
  last: boolean;
  /** -1 moves the row up one place, 1 down one. */
  onStep: (direction: -1 | 1) => void;
  onEdit: () => void;
  onHide: () => void;
}

/**
 * One row while arranging: a handle to drag it by, its name, and buttons that move, edit and hide
 * it. It has no Use button, so nothing is spent by a stray tap.
 */
export function ArrangeRow({ id, label, first, last, onStep, onEdit, onHide }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      aria-label={label}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-x-1 border-t border-slate-200 bg-slate-50 py-1 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      {/* Only the handle starts a drag, so the list still scrolls under a finger anywhere else. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}`}
        className={`${ICON} cursor-grab touch-none text-lg`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="ml-auto flex items-center">
        <button type="button" aria-label={`Move ${label} up`} disabled={first} onClick={() => onStep(-1)} className={ICON}>
          <span aria-hidden="true">▲</span>
        </button>
        <button type="button" aria-label={`Move ${label} down`} disabled={last} onClick={() => onStep(1)} className={ICON}>
          <span aria-hidden="true">▼</span>
        </button>
        <button type="button" aria-label={`Edit ${label}`} onClick={onEdit} className={TEXT}>Edit</button>
        <button type="button" aria-label={`Hide ${label}`} onClick={onHide} className={TEXT}>Hide</button>
      </span>
    </li>
  );
}
```

Create `apps/web/src/components/ArrangeSection.tsx`:

```tsx
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Ability } from '@cw/model';
import { ArrangeRow } from './ArrangeRow';

/** One row of a section: the ability and the name it is known by. */
export interface ArrangeItem {
  ability: Ability;
  label: string;
}

interface Props {
  title: string;
  items: ArrangeItem[];
  /** The row with `activeKey` was dropped on, or stepped onto, the row with `overKey`. Both are in this section. */
  onMove: (activeKey: string, overKey: string) => void;
  onEdit: (ability: Ability) => void;
  onHide: (ability: Ability) => void;
}

/** A dragged row moves up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * One group of rows that can be put in order, by dragging a row's handle or with its buttons.
 * Each section is a drag area of its own, so a row cannot leave its section.
 */
export function ArrangeSection({ title, items, onMove, onEdit, onHide }: Props) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map((item) => item.ability.key);
  const labelOf = (id: UniqueIdentifier): string => items.find((item) => item.ability.key === id)?.label ?? 'the row';
  const place = (id: UniqueIdentifier): string => `position ${keys.indexOf(String(id)) + 1} of ${keys.length}`;

  /** What a screen reader says during a drag: the row's name, not its key. */
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is at ${place(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${labelOf(active.id)} at ${place(over.id)}.` : `Dropped ${labelOf(active.id)}.`),
    onDragCancel: ({ active }) => `Put ${labelOf(active.id)} back.`,
  };

  function dropped({ active, over }: DragEndEvent): void {
    if (over && over.id !== active.id) onMove(String(active.id), String(over.id));
  }

  return (
    <section aria-label={title} className="mt-4">
      <h2 className="text-sm font-medium text-slate-700">{title}</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[vertical]}
        accessibility={{ announcements }}
        onDragEnd={dropped}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul>
            {items.map(({ ability, label }, index) => (
              <ArrangeRow
                key={ability.key}
                id={ability.key}
                label={label}
                first={index === 0}
                last={index === items.length - 1}
                onStep={(direction) => onMove(ability.key, keys[index + direction])}
                onEdit={() => onEdit(ability)}
                onHide={() => onHide(ability)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
```

Create `apps/web/src/components/HiddenDrawer.tsx`:

```tsx
import type { Ability } from '@cw/model';

interface Props {
  hidden: Ability[];
  onRestore: (ability: Ability) => void;
}

/** The abilities the player has hidden, folded away, each with a way back. Nothing when none is hidden. */
export function HiddenDrawer({ hidden, onRestore }: Props) {
  if (hidden.length === 0) return null;
  return (
    <details className="mt-4 border-t border-slate-200">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between py-2 text-sm font-medium text-slate-700">
        <span>{`Hidden (${hidden.length})`}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <ul>
        {hidden.map((ability) => (
          <li key={ability.key} className="flex items-center justify-between gap-2 border-t border-slate-200 py-1">
            <span className="min-w-0">{ability.name}</span>
            <button
              type="button"
              aria-label={`Restore ${ability.name}`}
              onClick={() => onRestore(ability)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

Apply this change to `apps/web/src/views/CombatView.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,6 +1,6 @@
 import type { Ability } from '@cw/model';
 import { TIMING_LABEL, combatGroups, pools, type Sheet, type TurnTiming } from '@cw/rules';
-import { useMemo, type ReactNode } from 'react';
+import { useMemo, useState, type ReactNode } from 'react';
 import { AbilityRow } from '../components/AbilityRow';
 import { ConcentrationBanner } from '../components/ConcentrationBanner';
 import { NotesList } from '../components/NotesList';
@@ -8,6 +8,7 @@ import { ResourceChips } from '../components/ResourceChips';
 import { useAbilityEdit } from '../components/useAbilityEdit';
 import { useAbilityUse } from '../components/useAbilityUse';
 import { useStore } from '../store';
+import { EditList } from './EditList';
 
 const TIMINGS: TurnTiming[] = ['action', 'bonus', 'reaction'];
 
@@ -46,6 +47,8 @@ export function CombatView({ sheet }: { sheet: Sheet }) {
   const endConcentration = useStore((s) => s.endConcentration);
   const { request, slotSheet } = useAbilityUse('combat');
   const { edit, editor } = useAbilityEdit();
+  /** True while the player is arranging the list instead of playing from it. */
+  const [arranging, setArranging] = useState(false);
   const groups = useMemo(() => combatGroups(sheet), [sheet]);
   const allPools = useMemo(() => pools(sheet), [sheet]);
 
@@ -63,6 +66,42 @@ export function CombatView({ sheet }: { sheet: Sheet }) {
       />
     ));
 
+  /** The list as it is played from. While arranging, the Edit list takes its place. */
+  const playing = (
+    <>
+      <Group
+        title="Action"
+        spent={play.turn.action}
+        hint={sheet.attacksPerAction > 1 ? `Attack action: ${sheet.attacksPerAction} attacks` : undefined}
+      >
+        {rows(groups.action)}
+      </Group>
+      <Group title="Bonus Action" spent={play.turn.bonus}>
+        {groups.bonus.length > 0 ? rows(groups.bonus) : <p className="py-2 text-sm text-slate-600">Nothing uses your Bonus Action.</p>}
+      </Group>
+      <Group title="Reaction" spent={play.turn.reaction}>
+        {groups.reaction.length > 0 ? rows(groups.reaction) : <p className="py-2 text-sm text-slate-600">Nothing uses your Reaction.</p>}
+      </Group>
+      {groups.other.length > 0 ? <Group title="Other">{rows(groups.other)}</Group> : null}
+      {groups.free.length > 0 ? <Folded title="No action needed" count={groups.free.length}>{rows(groups.free)}</Folded> : null}
+      {groups.universal.length > 0 ? <Folded title="Anyone can do this">{rows(groups.universal)}</Folded> : null}
+      <Folded title="Keep in mind" count={sheet.notes.length}>
+        <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
+      </Folded>
+
+      <button
+        type="button"
+        onClick={() => setArranging(true)}
+        className="mt-4 min-h-11 w-full rounded-lg border border-slate-400 px-3 py-2 font-medium"
+      >
+        Edit list
+      </button>
+
+      {slotSheet}
+      {editor}
+    </>
+  );
+
   return (
     <div>
       <div className="sticky top-0 z-10 -mx-4 flex gap-2 bg-slate-50 px-4 py-2">
@@ -89,28 +128,7 @@ export function CombatView({ sheet }: { sheet: Sheet }) {
 
       <ConcentrationBanner sheet={sheet} concentrationKey={play.concentrationKey} onEnd={endConcentration} />
 
-      <Group
-        title="Action"
-        spent={play.turn.action}
-        hint={sheet.attacksPerAction > 1 ? `Attack action: ${sheet.attacksPerAction} attacks` : undefined}
-      >
-        {rows(groups.action)}
-      </Group>
-      <Group title="Bonus Action" spent={play.turn.bonus}>
-        {groups.bonus.length > 0 ? rows(groups.bonus) : <p className="py-2 text-sm text-slate-600">Nothing uses your Bonus Action.</p>}
-      </Group>
-      <Group title="Reaction" spent={play.turn.reaction}>
-        {groups.reaction.length > 0 ? rows(groups.reaction) : <p className="py-2 text-sm text-slate-600">Nothing uses your Reaction.</p>}
-      </Group>
-      {groups.other.length > 0 ? <Group title="Other">{rows(groups.other)}</Group> : null}
-      {groups.free.length > 0 ? <Folded title="No action needed" count={groups.free.length}>{rows(groups.free)}</Folded> : null}
-      {groups.universal.length > 0 ? <Folded title="Anyone can do this">{rows(groups.universal)}</Folded> : null}
-      <Folded title="Keep in mind" count={sheet.notes.length}>
-        <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
-      </Folded>
-
-      {slotSheet}
-      {editor}
+      {arranging ? <EditList view="combat" sheet={sheet} onDone={() => setArranging(false)} /> : playing}
     </div>
   );
 }
```

Create `apps/web/src/views/EditList.tsx`:

```tsx
import { arrayMove } from '@dnd-kit/sortable';
import type { Ability, ViewName } from '@cw/model';
import { combatGroups, exploreAbilities, type CombatGroupName, type Sheet } from '@cw/rules';
import { useMemo } from 'react';
import { ArrangeSection } from '../components/ArrangeSection';
import { HiddenDrawer } from '../components/HiddenDrawer';
import { rowLabel } from '../components/rowLabel';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useStore } from '../store';

/** The Combat view's groups, in the order the view shows them. */
const COMBAT_SECTIONS: { group: CombatGroupName; title: string }[] = [
  { group: 'action', title: 'Action' },
  { group: 'bonus', title: 'Bonus Action' },
  { group: 'reaction', title: 'Reaction' },
  { group: 'other', title: 'Other' },
  { group: 'free', title: 'No action needed' },
  { group: 'universal', title: 'Anyone can do this' },
];

/**
 * A section's keys after the row `activeKey` is dropped on the row `overKey`: the dragged row
 * takes that place and the rows between shift by one. Unchanged when either key is not in the list.
 */
export function moved(keys: string[], activeKey: string, overKey: string): string[] {
  const from = keys.indexOf(activeKey);
  const to = keys.indexOf(overKey);
  return from < 0 || to < 0 || from === to ? keys : arrayMove(keys, from, to);
}

interface Props {
  view: ViewName;
  sheet: Sheet;
  onDone: () => void;
}

/**
 * A view while it is being arranged: the same rows under the same headings, each with a handle
 * instead of a Use button. Rows are put in order, edited, hidden and restored here.
 */
export function EditList({ view, sheet, onDone }: Props) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const setOrder = useStore((s) => s.setOrder);
  const { edit, editor } = useAbilityEdit();

  const sections = useMemo(() => {
    const groups = combatGroups(sheet);
    const all = view === 'combat'
      ? COMBAT_SECTIONS.map(({ group, title }) => ({ title, abilities: groups[group] }))
      : [{ title: 'Abilities', abilities: exploreAbilities(sheet) }];
    return all.filter((section) => section.abilities.length > 0);
  }, [view, sheet]);

  const hide = (ability: Ability): void => setEdit(ability.key, { ...(edits.abilities[ability.key] ?? {}), hidden: true });

  /** Dragging and the two buttons both end here: the whole section's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder(view, next);
  }

  function restore(ability: Ability): void {
    const { hidden: _hidden, ...rest } = edits.abilities[ability.key] ?? {};
    setEdit(ability.key, rest);
  }

  return (
    <div>
      {sections.map(({ title, abilities }) => (
        <ArrangeSection
          key={title}
          title={title}
          items={abilities.map((ability) => ({ ability, label: rowLabel(ability, sheet) }))}
          onMove={(activeKey, overKey) => reorder(abilities.map((a) => a.key), activeKey, overKey)}
          onEdit={edit}
          onHide={hide}
        />
      ))}

      <HiddenDrawer hidden={sheet.hidden} onRestore={restore} />

      <button type="button" onClick={onDone} className="mt-4 min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
        Done
      </button>

      {editor}
    </div>
  );
}
```

Apply this change to `apps/web/src/views/ExploreView.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -8,6 +8,7 @@ import { ResourceChips } from '../components/ResourceChips';
 import { useAbilityEdit } from '../components/useAbilityEdit';
 import { useAbilityUse } from '../components/useAbilityUse';
 import { useStore } from '../store';
+import { EditList } from './EditList';
 
 /** One skill or saving throw: a name, a d20 roll and any notes that belong to it. */
 interface CheckRow {
@@ -90,6 +91,8 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
   const { request, slotSheet } = useAbilityUse('explore');
   const { edit, editor } = useAbilityEdit();
   const [query, setQuery] = useState('');
+  /** True while the player is arranging the list instead of playing from it. */
+  const [arranging, setArranging] = useState(false);
   const needle = query.trim().toLowerCase();
   const matches = (text: string): boolean => needle === '' || text.toLowerCase().includes(needle);
 
@@ -104,6 +107,8 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
   const shownAbilities = abilities.filter((a) => matches(a.name));
   const nothing = shownSkills.length + shownSaves.length + shownAbilities.length === 0;
 
+  if (arranging) return <EditList view="explore" sheet={sheet} onDone={() => setArranging(false)} />;
+
   let abilityList: ReactNode = null;
   if (shownAbilities.length > 0) {
     abilityList = shownAbilities.map((ability) => (
@@ -163,6 +168,14 @@ export function ExploreView({ sheet }: { sheet: Sheet }) {
         </button>
       </div>
 
+      <button
+        type="button"
+        onClick={() => setArranging(true)}
+        className="mt-4 min-h-11 w-full rounded-lg border border-slate-400 px-3 py-2 font-medium"
+      >
+        Edit list
+      </button>
+
       {slotSheet}
       {editor}
     </div>
```

- [ ] **Step 5: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (997 tests in 43 files) and the type check prints no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Edit list: arrange rows by drag or by button, hide and restore" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 19: Custom abilities: add, edit and delete

"Add an ability" in Edit list creates an ability by hand, for anything the import cannot express (spec section 10.4). A custom ability is a row like any other: it can be used, edited, reordered, hidden and deleted.

**Files:**
- Modify: `apps/web/src/components/AbilityEditor.tsx`
- Create: `apps/web/src/components/CustomAbilityEditor.tsx`
- Create (test): `apps/web/src/components/custom.test.tsx`
- Modify (test): `apps/web/src/components/editor.test.tsx`
- Create: `apps/web/src/components/editorFields.tsx`
- Modify: `apps/web/src/components/useAbilityEdit.tsx`
- Modify: `apps/web/src/views/EditList.tsx`

**Interfaces:**
- Consumes:
  - `Dialog`, `RollEditor`, and the timing, tag and uses fields of `AbilityEditor` (the three tasks before this one), which this task moves into `apps/web/src/components/editorFields.tsx` so both editors share them.
  - `normaliseRoll`, `defaultViews` from `@cw/rules`; `CustomAbility` from `@cw/model`.
  - Store: `edits`, `saveCustom(custom)`, `deleteCustom(abilityKey)`, `setEdit(abilityKey, edit)`, `newCustomKey()`.
- Produces:
  - `CustomAbilityEditor({ custom, onClose })` in `apps/web/src/components/CustomAbilityEditor.tsx`; `custom` is null to add one.
  - `apps/web/src/components/editorFields.tsx`: `TimingSelect`, `UsesFields`, `TagToggles`, `ShownIn`, `withViews(draft, next, chosen, ritual)`, `ViewsChosen`, `validMaxUses`, `ROLL_ERROR`, `MAX_USES_ERROR`.
  - `useAbilityEdit()` now returns `{ edit, add, editor }` and chooses which editor to open.
  - "Add an ability" in `EditList`.
  - Edit on a row whose key is one of `edits.custom` opens `CustomAbilityEditor`; every other row opens `AbilityEditor`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/custom.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomAbility } from '@cw/model';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { seed } from '../test/helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const state = () => useStore.getState();

const howl = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:howl', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.', ...over,
});

/** Opens a character, first giving it the custom abilities in `own`. */
async function open(slug: Slug, view: View = 'combat', own: CustomAbility[] = []) {
  const record = await seed(slug);
  for (const custom of own) state().saveCustom(custom);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => userEvent.click(button(name));
const row = (label: string) => screen.getByRole('article', { name: label });
const played = (group: string) =>
  within(screen.getByRole('region', { name: group })).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));
const arranged = (section: string) =>
  within(screen.getByRole('region', { name: section })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

async function fill(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  if (text !== '') await userEvent.type(field, text);
}

const choose = (label: string, option: string) => userEvent.selectOptions(screen.getByRole('combobox', { name: label }), option);

/** From a view: into Edit list, then the empty editor. */
async function add() {
  await tap('Edit list');
  await tap('Add an ability');
  return screen.getByRole('dialog', { name: 'Add an ability' });
}

/** Opens a row while playing, unless it is open already, and taps its Edit button. */
async function edit(label: string) {
  const toggle = within(row(label)).getAllByRole('button')[0];
  if (toggle.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle);
  await userEvent.click(within(row(label)).getByRole('button', { name: `Edit ${label}` }));
  return screen.getByRole('dialog', { name: `Edit ${label}` });
}

describe('adding a custom ability', () => {
  it('starts from an Action that costs nothing and rolls nothing', async () => {
    await open('franny');
    const dialog = await add();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('');
    const timing = within(dialog).getByRole('combobox', { name: 'Timing' });
    expect(timing).toHaveValue('action');
    expect(within(timing).queryByRole('option', { name: 'Unknown' })).toBeNull();
    const cost = within(dialog).getByRole('combobox', { name: 'Cost' });
    expect(cost).toHaveValue('none');
    expect(within(cost).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nothing', 'Limited uses', 'A spell slot']);
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    expect(within(dialog).queryByLabelText('Lowest slot level')).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Concentration' })).not.toBeChecked();
    expect(within(dialog).getAllByRole('button', { pressed: false })).toHaveLength(9);
    expect(within(dialog).getByRole('combobox', { name: 'Roll' })).toHaveValue('none');
    // Where it is listed and whether it is hidden are for an ability that exists.
    expect(within(dialog).queryByRole('checkbox', { name: 'Combat' })).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Hide this ability' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('adds a Bonus Action with limited uses: a row with pips that Use spends', async () => {
    await open('franny');
    await add();
    await fill('Name', '  Pack Howl ');
    await choose('Timing', 'Bonus Action');
    await choose('Cost', 'Limited uses');
    await fill('Maximum uses', '2');
    await choose('Comes back on', 'Short Rest');
    await tap('Save');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(arranged('Bonus Action')).toContain('Pack Howl');
    expect(state().edits.custom).toEqual([{
      key: expect.stringMatching(/^own:/), name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' },
      cost: { kind: 'uses', max: 2, reset: 'short' }, tags: [], concentration: false, description: '',
    }]);

    await tap('Done');
    expect(played('Bonus Action')).toContain('Pack Howl');
    expect(row('Pack Howl')).toHaveTextContent('2 left');
    expect(screen.getByRole('group', { name: 'Pack Howl: 2 of 2 left' })).toBeInTheDocument();
    await tap('Use Pack Howl');
    expect(row('Pack Howl')).toHaveTextContent('1 left');
    expect(screen.getByRole('group', { name: 'Pack Howl: 1 of 2 left' })).toBeInTheDocument();
    expect(button('Bonus Action: spent')).toBeInTheDocument();
  });

  it('adds an ability that costs a spell slot, and Use offers the slots that can pay', async () => {
    await open('minkis');
    const dialog = await add();
    await fill('Name', 'Arcane Bolt');
    await choose('Cost', 'A spell slot');
    const level = within(dialog).getByRole('combobox', { name: 'Lowest slot level' });
    expect(level).toHaveValue('1');
    expect(within(level).getAllByRole('option')).toHaveLength(9);
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0].cost).toEqual({ kind: 'slot', minLevel: 1 });
    expect(row('Arcane Bolt')).toHaveTextContent('spell slot');
    await tap('Use Arcane Bolt');
    const slots = screen.getByRole('dialog', { name: 'Cast Arcane Bolt with' });
    expect(within(slots).getByRole('button', { name: /Level 1 slot/ })).toBeInTheDocument();
    await userEvent.click(within(slots).getByRole('button', { name: /Level 2 slot/ }));
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
  });

  it('takes the lowest slot level, a roll, tags and concentration', async () => {
    await open('minkis');
    await add();
    await fill('Name', 'Arcane Bolt');
    await choose('Cost', 'A spell slot');
    await choose('Lowest slot level', '2');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Concentration' }));
    await tap('Damage');
    await tap('Utility');
    await choose('Roll', 'Attack roll');
    await fill('Attack bonus', '6');
    await fill('Damage', '2d8');
    await fill('Damage type', 'force');
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0]).toMatchObject({
      cost: { kind: 'slot', minLevel: 2 }, concentration: true, tags: ['damage', 'utility'],
      roll: { kind: 'attack', bonus: 6, damage: [{ dice: '2d8', type: 'force' }], optionalDamage: [] },
    });
    expect(row('Arcane Bolt')).toHaveTextContent('Roll d20 + 6. Hit: 2d8 force.');
    expect(row('Arcane Bolt')).toHaveTextContent('spell slot · concentration · damage · utility');
    await tap('Use Arcane Bolt');
    // Only a level 2 slot can pay, so there is nothing to ask.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Arcane Bolt')).toBeInTheDocument();
  });

  it('lists a new ability in Explore when its tags put it there', async () => {
    const { show } = await open('franny');
    await add();
    await fill('Name', 'Bear Whisper');
    await tap('Social');
    await tap('Save');
    await tap('Done');
    expect(played('Action')).toContain('Bear Whisper');
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toContain('Bear Whisper');
  });

  it('shows the description as text, with its line break and any markup as written', async () => {
    await open('franny');
    await add();
    await fill('Name', 'Pack Howl');
    await userEvent.type(screen.getByLabelText('Description'), 'Allies take heart.{Enter}Range <b>30</b> feet & no more.');
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0].description).toBe('Allies take heart.\nRange <b>30</b> feet & no more.');
    await userEvent.click(within(row('Pack Howl')).getAllByRole('button')[0]);
    const description = row('Pack Howl').querySelector('.description');
    expect(description).toHaveTextContent('Allies take heart.Range <b>30</b> feet & no more.');
    expect(description?.querySelector('b')).toBeNull();
    expect(description?.querySelectorAll('br')).toHaveLength(1);
  });

  it('asks for a name before saving', async () => {
    await open('franny');
    const dialog = await add();
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the ability a name.');
    await fill('Name', '   ');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the ability a name.');
    expect(state().edits.custom).toEqual([]);
    await fill('Name', 'Pack Howl');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await tap('Save');
    expect(state().edits.custom).toHaveLength(1);
  });

  it('asks for a finished roll and a sensible maximum before saving', async () => {
    await open('franny');
    const dialog = await add();
    await fill('Name', 'Pack Howl');
    await choose('Roll', 'Dice only');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Finish the roll, or choose No roll.');
    await fill('Dice', '1d6');
    await choose('Cost', 'Limited uses');
    await fill('Maximum uses', '0');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(state().edits.custom).toEqual([]);
    await fill('Maximum uses', '3');
    await tap('Save');
    expect(state().edits.custom[0]).toMatchObject({ roll: { kind: 'dice', dice: '1d6' }, cost: { kind: 'uses', max: 3, reset: 'long' } });
  });

  it('saves nothing on Cancel', async () => {
    await open('franny');
    await add();
    await fill('Name', 'Pack Howl');
    await tap('Cancel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state().edits.custom).toEqual([]);
  });

  it('can be reached from Explore too', async () => {
    await open('franny', 'explore');
    await add();
    await fill('Name', 'Bear Whisper');
    await tap('Utility');
    await tap('Save');
    expect(arranged('Abilities')).toContain('Bear Whisper');
  });
});

describe('editing a custom ability', () => {
  it('opens its own editor from the row, filled in, and changes the row', async () => {
    await open('franny', 'combat', [howl({ cost: { kind: 'uses', max: 2, reset: 'short' } })]);
    const dialog = await edit('Pack Howl');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Pack Howl');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Allies within 30 feet take heart.');
    expect(within(dialog).getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
    expect(within(dialog).getByRole('combobox', { name: 'Cost' })).toHaveValue('uses');
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(2);
    expect(within(dialog).getByRole('combobox', { name: 'Comes back on' })).toHaveValue('short');
    expect(within(dialog).getByRole('button', { name: 'Buff' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).queryByRole('button', { name: 'Back to imported' })).toBeNull();

    await fill('Name', 'Greater Howl');
    await choose('Timing', 'Reaction');
    await choose('Cost', 'Nothing');
    await tap('Save');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(played('Reaction')).toEqual(['Greater Howl']);
    expect(row('Greater Howl')).not.toHaveTextContent('left');
    expect(state().edits.custom).toMatchObject([{ key: 'own:howl', name: 'Greater Howl', timing: 'reaction', cost: { kind: 'none' } }]);
    expect(state().edits.abilities).toEqual({});
  });

  it('opens its own editor from Edit list', async () => {
    await open('franny', 'combat', [howl()]);
    await tap('Edit list');
    await tap('Edit Pack Howl');
    expect(within(screen.getByRole('dialog', { name: 'Edit Pack Howl' })).getByLabelText('Name')).toHaveValue('Pack Howl');
  });

  it('records where it is shown only where that differs from where the app would put it', async () => {
    const { show } = await open('franny', 'combat', [howl()]);
    const first = await edit('Pack Howl');
    await userEvent.click(within(first).getByRole('checkbox', { name: 'Explore' }));
    await tap('Save');
    expect(state().edits.abilities).toEqual({ 'own:howl': { inExplore: true } });

    // Tagged utility, the app lists it in Explore by itself, so nothing needs recording.
    const second = await edit('Pack Howl');
    expect(within(second).getByRole('checkbox', { name: 'Explore' })).toBeChecked();
    await userEvent.click(within(second).getByRole('button', { name: 'Utility' }));
    await tap('Save');
    expect(state().edits.abilities).toEqual({});
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toContain('Pack Howl');
  });

  it('follows its tags into Explore without a tap on the box', async () => {
    await open('franny', 'combat', [howl()]);
    const dialog = await edit('Pack Howl');
    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
    expect(explore).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(explore).toBeChecked();
    await tap('Save');
    expect(state().edits.abilities).toEqual({});
    expect(state().edits.custom[0].tags).toEqual(['buff', 'utility']);
  });

  it('hides from its editor', async () => {
    await open('franny', 'combat', [howl()]);
    const dialog = await edit('Pack Howl');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this ability' }));
    await tap('Save');
    expect(screen.queryByRole('article', { name: 'Pack Howl' })).toBeNull();
    expect(state().edits.abilities).toEqual({ 'own:howl': { hidden: true } });
    expect(state().edits.custom).toHaveLength(1);
  });

  it('hides and restores from Edit list', async () => {
    await open('franny', 'combat', [howl()]);
    await tap('Edit list');
    await tap('Hide Pack Howl');
    expect(arranged('Bonus Action')).not.toContain('Pack Howl');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    await tap('Restore Pack Howl');
    expect(arranged('Bonus Action')).toContain('Pack Howl');
    expect(state().edits.abilities).toEqual({});
    await tap('Done');
    expect(row('Pack Howl')).toBeInTheDocument();
  });

  it('deletes after asking, by the name it was saved under', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open('franny', 'combat', [howl()]);
    state().setEdit('own:howl', { inExplore: true });
    await edit('Pack Howl');
    await fill('Name', 'Something else');
    await tap('Delete');
    expect(confirm).toHaveBeenCalledWith("Delete Pack Howl? This can't be undone.");
    expect(screen.getByRole('dialog', { name: 'Edit Pack Howl' })).toBeInTheDocument();
    expect(state().edits.custom).toHaveLength(1);

    confirm.mockReturnValue(true);
    await tap('Delete');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('article', { name: 'Pack Howl' })).toBeNull();
    expect(state().edits).toMatchObject({ custom: [], abilities: {} });
  });
});

describe('a custom action from D&D Beyond', () => {
  it('opens the ordinary editor, and can be put back to imported', async () => {
    await open('franny');
    const twig = state().sheet?.abilities.find((a) => a.name === 'Twig Attack' && a.source === 'custom');
    if (!twig) throw new Error('no custom action on the fixture');
    const article = within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')[1];
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: 'Edit Twig Attack' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Twig Attack' });
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).not.toBeChecked();

    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(state().edits.abilities).toEqual({ [twig.key]: { timing: 'action' } });
    expect(played('Action')).toContain('Twig Attack');

    const moved = within(screen.getByRole('region', { name: 'Action' })).getByRole('article', { name: 'Twig Attack' });
    await userEvent.click(within(moved).getAllByRole('button')[0]);
    await userEvent.click(within(moved).getByRole('button', { name: 'Edit Twig Attack' }));
    await tap('Back to imported');
    expect(state().edits.abilities).toEqual({});
    expect(played('Other')).toEqual(['Twig Attack', 'Twig Attack']);
  });
});
```

Apply this change to `apps/web/src/components/editor.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -288,6 +288,44 @@ describe('AbilityEditor', () => {
     expect(group('Out of combat abilities')).toContain('Hex');
   });
 
+  it('lists an ability in Explore when it is given a tag that belongs there, without a tap on the box', async () => {
+    const { show } = await open('vlad');
+    const dialog = await edit('Hex');
+    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
+    expect(explore).not.toBeChecked();
+    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
+    expect(explore).toBeChecked();
+    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
+    expect(explore).not.toBeChecked();
+    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
+    await save();
+    // Only the tags are recorded: where it is listed still follows the app's rule.
+    expect(edits()).toEqual({ [ability('Hex').key]: { tags: ['damage', 'debuff', 'utility'] } });
+    show('explore');
+    expect(await screen.findByRole('region', { name: 'Out of combat abilities' })).toBeInTheDocument();
+    expect(group('Out of combat abilities')).toContain('Hex');
+  });
+
+  it('leaves a box where the player put it when the tags change afterwards', async () => {
+    await open('vlad');
+    const dialog = await edit('Hex');
+    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
+    await userEvent.click(explore);
+    await userEvent.click(explore);
+    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
+    expect(explore).not.toBeChecked();
+    await save();
+    expect(edits()).toEqual({ [ability('Hex').key]: { tags: ['damage', 'debuff', 'utility'], inExplore: false } });
+  });
+
+  it('keeps a box set in an earlier edit where it was put', async () => {
+    await open('vlad');
+    useStore.getState().setEdit(ability('Hex').key, { inExplore: false });
+    const dialog = await edit('Hex');
+    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
+    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
+  });
+
   it('takes an ability out of Combat when Combat is unticked, and edits from Explore too', async () => {
     const { show } = await open('vlad', 'explore');
     const dialog = await edit('Charm Person');
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/components/custom.test.tsx apps/web/src/components/editor.test.tsx
```

Expected: FAIL. `./CustomAbilityEditor` cannot be found, and Edit list has no "Add an ability".

- [ ] **Step 3: Write the implementation**

D&D Beyond's own custom actions also have source `custom`. They are imported, not made here, so they are not in `edits.custom` and open the ordinary editor. The test uses the `franny` fixture's "Twig Attack" for this, as an example of the general rule and not as a special case.

In both editors, a "Shown in" box that the player has not set follows the app's rule while they change the timing and tags: giving an ability the Utility tag ticks Explore without a second tap, and nothing is recorded about where it is shown. A box the player has set, in this edit or an earlier one, stays where they put it.

"Back to imported" is offered for any edited ability that exists on the imported sheet, which includes D&D Beyond's own custom actions.

A custom ability's description is plain text. `applyEdits` escapes it, so a `<` typed by the player is shown as a `<` and never read as HTML.

Replace the whole of `apps/web/src/components/AbilityEditor.tsx` with:

```tsx
import type { Ability, ResetType, Roll } from '@cw/model';
import { canEditUses, diffEdit, editForm, normaliseRoll, type EditForm } from '@cw/rules';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import {
  MAX_USES_ERROR, ROLL_ERROR, ShownIn, TagToggles, TimingSelect, UsesFields, validMaxUses, withViews, type ViewsChosen,
} from './editorFields';
import { ALERT, BUTTON, CHECK, PRIMARY } from './fieldStyles';

/** What the form holds while it is open. The uses are kept apart so that unticking them forgets nothing. */
interface Draft extends Omit<EditForm, 'uses'> {
  limited: boolean;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
}

/**
 * Changes one ability from the sheet: when it is used, what it costs, how it is tagged, where it
 * is listed and what it rolls. An ability the player added has its own editor.
 */
export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const baseSheet = useStore((s) => s.baseSheet);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => s.edits.abilities[ability.key]);
  /** A box counts as set by the player if an earlier edit recorded it. */
  const [chosen, setChosen] = useState<ViewsChosen>(() => ({
    combat: stored?.inCombat !== undefined, explore: stored?.inExplore !== undefined,
  }));
  const [start] = useState<EditForm | null>(() => (sheet ? editForm(sheet, ability) : null));
  const [draft, setDraft] = useState<Draft | null>(() =>
    start ? { ...start, limited: start.uses !== null, max: start.uses?.max ?? 1, reset: start.uses?.reset ?? 'long' } : null);
  const [error, setError] = useState<string | null>(null);

  if (!sheet || !baseSheet || !start || !draft) return null;

  const change = (next: Partial<Draft>): void => {
    const result = withViews(draft, next, chosen, ability.ritual);
    setDraft(result.draft);
    setChosen(result.chosen);
    setError(null);
  };
  const usesEditable = canEditUses(ability);
  /** The ability as imported. An ability with none has nothing to compare against or go back to. */
  const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key);
  const canRestore = base !== undefined && sheet.edited.includes(ability.key);

  function save(event: FormEvent): void {
    event.preventDefault();
    if (!baseSheet || !start || !draft || !base) return;
    if (usesEditable && draft.limited && !validMaxUses(draft.max)) {
      setError(MAX_USES_ERROR);
      return;
    }
    // A roll the player did not touch is kept exactly as it is; one they changed must be a finished roll.
    const roll: Roll | null = draft.roll === start.roll ? draft.roll : normaliseRoll(draft.roll);
    if (!roll) {
      setError(ROLL_ERROR);
      return;
    }
    const form: EditForm = {
      timing: draft.timing,
      uses: usesEditable && draft.limited ? { max: draft.max, reset: draft.reset } : null,
      tags: draft.tags,
      roll,
      inCombat: draft.inCombat,
      inExplore: draft.inExplore,
      hidden: draft.hidden,
    };
    setEdit(ability.key, diffEdit(baseSheet, base, form));
    onClose();
  }

  return (
    <Dialog title={`Edit ${ability.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <TimingSelect value={draft.timing} onChange={(timing) => change({ timing })} allowUnknown={start.timing === 'unknown'} />

        {usesEditable ? (
          <div className="space-y-3">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.limited} onChange={(event) => change({ limited: event.target.checked })} className="size-5" />
              <span>Limited uses</span>
            </label>
            {draft.limited ? (
              <UsesFields max={draft.max} reset={draft.reset} onChange={change} allowUnknown={start.uses?.reset === 'unknown'} />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This ability costs a spell slot.</p>
        )}

        <TagToggles value={draft.tags} onChange={(tags) => change({ tags })} />
        <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        <label className={CHECK}>
          <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
          <span>Hide this ability</span>
        </label>

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {canRestore ? (
            <button
              type="button"
              onClick={() => {
                setEdit(ability.key, {});
                onClose();
              }}
              className={`${BUTTON} ml-auto`}
            >
              Back to imported
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
```

Create `apps/web/src/components/CustomAbilityEditor.tsx`:

```tsx
import type { AbilityEdit, CustomAbility, ResetType, Roll, Tag, Timing } from '@cw/model';
import { defaultViews, editForm, normaliseRoll } from '@cw/rules';
import { useId, useState, type FormEvent } from 'react';
import { newCustomKey, useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import {
  MAX_USES_ERROR, ROLL_ERROR, ShownIn, TagToggles, TimingSelect, UsesFields, validMaxUses, withViews, type ViewsChosen,
} from './editorFields';
import { ALERT, BUTTON, CHECK, INPUT, LABEL, PRIMARY } from './fieldStyles';

type CostKind = CustomAbility['cost']['kind'];

const COST_OPTIONS: { value: CostKind; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'uses', label: 'Limited uses' },
  { value: 'slot', label: 'A spell slot' },
];

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** What the form holds while it is open. Every kind of cost keeps its fields, so switching between them forgets nothing. */
interface Draft {
  name: string;
  description: string;
  timing: Timing;
  cost: CostKind;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
  minLevel: number;
  concentration: boolean;
  tags: Tag[];
  roll: Roll;
  inCombat: boolean;
  inExplore: boolean;
  hidden: boolean;
}

function draftOf(custom: CustomAbility | null, shown: { inCombat: boolean; inExplore: boolean; hidden: boolean }): Draft {
  const cost = custom?.cost ?? { kind: 'none' };
  return {
    name: custom?.name ?? '',
    description: custom?.description ?? '',
    timing: custom?.timing ?? 'action',
    cost: cost.kind,
    max: cost.kind === 'uses' ? cost.max : 1,
    reset: cost.kind === 'uses' ? cost.reset : 'long',
    minLevel: cost.kind === 'slot' ? cost.minLevel : 1,
    concentration: custom?.concentration ?? false,
    tags: custom?.tags ?? [],
    roll: custom?.roll ?? { kind: 'none' },
    ...shown,
  };
}

/**
 * Adds an ability of the player's own (`custom` is null), or changes or deletes one. Unlike an
 * ability from the sheet it has a name, a description and a cost to set, and nothing to go back to.
 */
export function CustomAbilityEditor({ custom, onClose }: { custom: CustomAbility | null; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const saveCustom = useStore((s) => s.saveCustom);
  const deleteCustom = useStore((s) => s.deleteCustom);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => (custom ? s.edits.abilities[custom.key] : undefined));
  /** A box counts as set by the player if an earlier edit recorded it. */
  const [chosen, setChosen] = useState<ViewsChosen>(() => ({
    combat: stored?.inCombat !== undefined, explore: stored?.inExplore !== undefined,
  }));
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => {
    // Where an existing ability is listed, and whether it is hidden, come from the sheet.
    const row = custom && sheet ? [...sheet.abilities, ...sheet.hidden].find((a) => a.key === custom.key) : undefined;
    const form = row && sheet ? editForm(sheet, row) : null;
    return draftOf(custom, { inCombat: form?.inCombat ?? true, inExplore: form?.inExplore ?? false, hidden: form?.hidden ?? false });
  });
  const [error, setError] = useState<string | null>(null);

  const change = (next: Partial<Draft>): void => {
    const result = withViews(draft, next, chosen, false);
    setDraft(result.draft);
    setChosen(result.chosen);
    setError(null);
  };

  function save(event: FormEvent): void {
    event.preventDefault();
    const name = draft.name.trim();
    if (name === '') {
      setError('Give the ability a name.');
      return;
    }
    if (draft.cost === 'uses' && !validMaxUses(draft.max)) {
      setError(MAX_USES_ERROR);
      return;
    }
    const roll = normaliseRoll(draft.roll);
    if (!roll) {
      setError(ROLL_ERROR);
      return;
    }
    const cost: CustomAbility['cost'] =
      draft.cost === 'uses'
        ? { kind: 'uses', max: draft.max, reset: draft.reset }
        : draft.cost === 'slot'
          ? { kind: 'slot', minLevel: draft.minLevel }
          : { kind: 'none' };
    const key = custom?.key ?? newCustomKey();
    saveCustom({
      key, name, timing: draft.timing, roll, cost, tags: draft.tags, concentration: draft.concentration, description: draft.description,
    });
    if (custom) {
      // Only a choice that differs from where the app would list the saved ability is recorded.
      const after = useStore.getState().sheet;
      const saved = after ? [...after.abilities, ...after.hidden].find((a) => a.key === key) : undefined;
      const fallback = saved ? defaultViews(saved) : { combat: draft.inCombat, explore: draft.inExplore };
      const edit: AbilityEdit = {};
      if (draft.inCombat !== fallback.combat) edit.inCombat = draft.inCombat;
      if (draft.inExplore !== fallback.explore) edit.inExplore = draft.inExplore;
      if (draft.hidden) edit.hidden = true;
      setEdit(key, edit);
    }
    onClose();
  }

  function remove(): void {
    if (!custom) return;
    if (!window.confirm(`Delete ${custom.name}? This can't be undone.`)) return;
    deleteCustom(custom.key);
    onClose();
  }

  return (
    <Dialog title={custom ? `Edit ${custom.name}` : 'Add an ability'} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <div>
          <label htmlFor={`${id}-name`} className={LABEL}>Name</label>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            value={draft.name}
            onChange={(event) => change({ name: event.target.value })}
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor={`${id}-description`} className={LABEL}>Description</label>
          <textarea
            id={`${id}-description`}
            rows={3}
            value={draft.description}
            onChange={(event) => change({ description: event.target.value })}
            className={INPUT}
          />
        </div>

        <TimingSelect value={draft.timing} onChange={(timing) => change({ timing })} allowUnknown={custom?.timing === 'unknown'} />

        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-cost`} className={LABEL}>Cost</label>
            <select id={`${id}-cost`} value={draft.cost} onChange={(event) => change({ cost: event.target.value as CostKind })} className={INPUT}>
              {COST_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {draft.cost === 'uses' ? (
            <UsesFields
              max={draft.max}
              reset={draft.reset}
              onChange={change}
              allowUnknown={custom?.cost.kind === 'uses' && custom.cost.reset === 'unknown'}
            />
          ) : null}
          {draft.cost === 'slot' ? (
            <div>
              <label htmlFor={`${id}-level`} className={LABEL}>Lowest slot level</label>
              <select id={`${id}-level`} value={draft.minLevel} onChange={(event) => change({ minLevel: Number(event.target.value) })} className={INPUT}>
                {SLOT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        <label className={CHECK}>
          <input type="checkbox" checked={draft.concentration} onChange={(event) => change({ concentration: event.target.checked })} className="size-5" />
          <span>Concentration</span>
        </label>

        <TagToggles value={draft.tags} onChange={(tags) => change({ tags })} />
        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        {custom ? (
          <>
            <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
            <label className={CHECK}>
              <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
              <span>Hide this ability</span>
            </label>
          </>
        ) : null}

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {custom ? <button type="button" onClick={remove} className={`${BUTTON} ml-auto border-red-300 text-red-800`}>Delete</button> : null}
        </div>
      </form>
    </Dialog>
  );
}
```

Create `apps/web/src/components/editorFields.tsx`:

```tsx
import { TAGS, type ResetType, type Tag, type Timing } from '@cw/model';
import { defaultViews } from '@cw/rules';
import { useId } from 'react';
import { CHECK, INPUT, LABEL } from './fieldStyles';

/** The fields the ability editor and the custom ability editor have in common. */

const TIMING_OPTIONS: { value: Timing; label: string }[] = [
  { value: 'action', label: 'Action' },
  { value: 'bonus', label: 'Bonus Action' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'free', label: 'No action needed' },
  { value: 'passive', label: 'Passive' },
  { value: 'long', label: 'Takes a minute or more' },
];

const RESET_OPTIONS: { value: ResetType; label: string }[] = [
  { value: 'short', label: 'Short Rest' },
  { value: 'long', label: 'Long Rest' },
  { value: 'never', label: 'Never' },
];

/** "Unknown" is something the import says, not something a player chooses, so it is offered only to keep. */
const UNKNOWN = { value: 'unknown', label: 'Unknown' } as const;

export const ROLL_ERROR = 'Finish the roll, or choose No roll.';
export const MAX_USES_ERROR = 'Set the maximum uses, from 1 to 99.';

/** True for a maximum the app can store. The field is not a number while it is empty. */
export const validMaxUses = (max: number): boolean => Number.isInteger(max) && max >= 1 && max <= 99;

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

interface TimingProps {
  value: Timing;
  onChange: (timing: Timing) => void;
  /** Offer "Unknown": true only for an ability whose timing is unknown already. */
  allowUnknown: boolean;
}

export function TimingSelect({ value, onChange, allowUnknown }: TimingProps) {
  const id = useId();
  const options = allowUnknown ? [...TIMING_OPTIONS, UNKNOWN] : TIMING_OPTIONS;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>Timing</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as Timing)} className={INPUT}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

interface UsesProps {
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
  onChange: (change: { max?: number; reset?: ResetType }) => void;
  /** Offer "Unknown": true only for a pool whose reset is unknown already. */
  allowUnknown: boolean;
}

/** How many uses a pool has and when they come back. */
export function UsesFields({ max, reset, onChange, allowUnknown }: UsesProps) {
  const id = useId();
  const options = allowUnknown ? [...RESET_OPTIONS, UNKNOWN] : RESET_OPTIONS;
  return (
    <>
      <div>
        <label htmlFor={`${id}-max`} className={LABEL}>Maximum uses</label>
        <input
          id={`${id}-max`}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={Number.isFinite(max) ? max : ''}
          onChange={(event) => onChange({ max: event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) })}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${id}-reset`} className={LABEL}>Comes back on</label>
        <select id={`${id}-reset`} value={reset} onChange={(event) => onChange({ reset: event.target.value as ResetType })} className={INPUT}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </>
  );
}

/** The nine tags as toggles. The tags stay in the order they are listed, whatever order they are tapped in. */
export function TagToggles({ value, onChange }: { value: Tag[]; onChange: (tags: Tag[]) => void }) {
  return (
    <fieldset>
      <legend className={LABEL}>Tags</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {TAGS.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(TAGS.filter((t) => (t === tag ? !on : value.includes(t))))}
              className={`min-h-11 rounded-full border px-3 py-1.5 text-sm ${
                on ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-700'
              }`}
            >
              {capitalised(tag)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Which of the two "Shown in" boxes the player has set themselves, now or in an earlier edit. */
export interface ViewsChosen {
  combat: boolean;
  explore: boolean;
}

interface ViewsDraft {
  timing: Timing;
  tags: Tag[];
  inCombat: boolean;
  inExplore: boolean;
}

/**
 * A form's draft with `next` applied. A "Shown in" box the player has not set follows the app's
 * rule, so that giving an ability a tag that belongs in Explore lists it there without a second
 * tap. A box the player has set stays where they put it.
 */
export function withViews<D extends ViewsDraft>(
  draft: D, next: Partial<D>, chosen: ViewsChosen, ritual: boolean,
): { draft: D; chosen: ViewsChosen } {
  const merged: D = { ...draft, ...next };
  const now: ViewsChosen = {
    combat: chosen.combat || next.inCombat !== undefined,
    explore: chosen.explore || next.inExplore !== undefined,
  };
  if (next.timing !== undefined || next.tags !== undefined) {
    const auto = defaultViews({ timing: merged.timing, tags: merged.tags, ritual });
    if (!now.combat) merged.inCombat = auto.combat;
    if (!now.explore) merged.inExplore = auto.explore;
  }
  return { draft: merged, chosen: now };
}

interface ShownInProps {
  inCombat: boolean;
  inExplore: boolean;
  onChange: (change: { inCombat?: boolean; inExplore?: boolean }) => void;
}

/** Which of the two views list the ability. */
export function ShownIn({ inCombat, inExplore, onChange }: ShownInProps) {
  return (
    <fieldset>
      <legend className={LABEL}>Shown in</legend>
      <div className="flex gap-6">
        <label className={CHECK}>
          <input type="checkbox" checked={inCombat} onChange={(event) => onChange({ inCombat: event.target.checked })} className="size-5" />
          <span>Combat</span>
        </label>
        <label className={CHECK}>
          <input type="checkbox" checked={inExplore} onChange={(event) => onChange({ inExplore: event.target.checked })} className="size-5" />
          <span>Explore</span>
        </label>
      </div>
    </fieldset>
  );
}
```

Replace the whole of `apps/web/src/components/useAbilityEdit.tsx` with:

```tsx
import type { Ability } from '@cw/model';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';
import { CustomAbilityEditor } from './CustomAbilityEditor';

/** What the editor is open for: an ability on the sheet, by key, or one that does not exist yet. */
type Target = { key: string } | 'new' | null;

interface Editing {
  /** Opens the editor for an ability. */
  edit: (ability: Ability) => void;
  /** Opens the editor for a new ability of the player's own. */
  add: () => void;
  /** The open editor, to render once in the view. */
  editor: ReactNode;
}

/**
 * What a view needs to make Edit work. An ability the player added opens the custom ability
 * editor; everything else, a custom action imported from D&D Beyond included, opens the ordinary
 * one. The ability is remembered by key, so the editor closes by itself if the ability leaves the
 * sheet while it is open.
 */
export function useAbilityEdit(): Editing {
  const sheet = useStore((s) => s.sheet);
  const customs = useStore((s) => s.edits.custom);
  const [target, setTarget] = useState<Target>(null);
  const close = (): void => setTarget(null);

  const key = target !== null && target !== 'new' ? target.key : null;
  const ability = sheet && key !== null ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === key) : undefined;
  const custom = ability?.source === 'custom' ? customs.find((c) => c.key === ability.key) : undefined;

  // Forget an ability that has left the sheet, so its editor does not come back if the ability does.
  useEffect(() => {
    if (key !== null && !ability) setTarget(null);
  }, [key, ability]);

  let editor: ReactNode = null;
  if (target === 'new') editor = <CustomAbilityEditor custom={null} onClose={close} />;
  // Keyed, so that opening the editor for another ability starts a new form.
  else if (custom) editor = <CustomAbilityEditor key={custom.key} custom={custom} onClose={close} />;
  else if (ability) editor = <AbilityEditor key={ability.key} ability={ability} onClose={close} />;

  return { edit: (a) => setTarget({ key: a.key }), add: () => setTarget('new'), editor };
}
```

Replace the whole of `apps/web/src/views/EditList.tsx` with:

```tsx
import { arrayMove } from '@dnd-kit/sortable';
import type { Ability, ViewName } from '@cw/model';
import { combatGroups, exploreAbilities, type CombatGroupName, type Sheet } from '@cw/rules';
import { useMemo } from 'react';
import { ArrangeSection } from '../components/ArrangeSection';
import { HiddenDrawer } from '../components/HiddenDrawer';
import { rowLabel } from '../components/rowLabel';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useStore } from '../store';

/** The Combat view's groups, in the order the view shows them. */
const COMBAT_SECTIONS: { group: CombatGroupName; title: string }[] = [
  { group: 'action', title: 'Action' },
  { group: 'bonus', title: 'Bonus Action' },
  { group: 'reaction', title: 'Reaction' },
  { group: 'other', title: 'Other' },
  { group: 'free', title: 'No action needed' },
  { group: 'universal', title: 'Anyone can do this' },
];

/**
 * A section's keys after the row `activeKey` is dropped on the row `overKey`: the dragged row
 * takes that place and the rows between shift by one. Unchanged when either key is not in the list.
 */
export function moved(keys: string[], activeKey: string, overKey: string): string[] {
  const from = keys.indexOf(activeKey);
  const to = keys.indexOf(overKey);
  return from < 0 || to < 0 || from === to ? keys : arrayMove(keys, from, to);
}

interface Props {
  view: ViewName;
  sheet: Sheet;
  onDone: () => void;
}

/**
 * A view while it is being arranged: the same rows under the same headings, each with a handle
 * instead of a Use button. Rows are put in order, edited, hidden and restored here, and abilities
 * of the player's own are added.
 */
export function EditList({ view, sheet, onDone }: Props) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const setOrder = useStore((s) => s.setOrder);
  const { edit, add, editor } = useAbilityEdit();

  const sections = useMemo(() => {
    const groups = combatGroups(sheet);
    const all = view === 'combat'
      ? COMBAT_SECTIONS.map(({ group, title }) => ({ title, abilities: groups[group] }))
      : [{ title: 'Abilities', abilities: exploreAbilities(sheet) }];
    return all.filter((section) => section.abilities.length > 0);
  }, [view, sheet]);

  const hide = (ability: Ability): void => setEdit(ability.key, { ...(edits.abilities[ability.key] ?? {}), hidden: true });

  /** Dragging and the two buttons both end here: the whole section's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder(view, next);
  }

  function restore(ability: Ability): void {
    const { hidden: _hidden, ...rest } = edits.abilities[ability.key] ?? {};
    setEdit(ability.key, rest);
  }

  return (
    <div>
      {sections.map(({ title, abilities }) => (
        <ArrangeSection
          key={title}
          title={title}
          items={abilities.map((ability) => ({ ability, label: rowLabel(ability, sheet) }))}
          onMove={(activeKey, overKey) => reorder(abilities.map((a) => a.key), activeKey, overKey)}
          onEdit={edit}
          onHide={hide}
        />
      ))}

      <HiddenDrawer hidden={sheet.hidden} onRestore={restore} />

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={add} className="min-h-11 flex-1 rounded-lg border border-slate-400 px-3 py-2 font-medium">
          Add an ability
        </button>
        <button type="button" onClick={onDone} className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
          Done
        </button>
      </div>

      {editor}
    </div>
  );
}
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (1018 tests in 44 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Custom abilities: add, edit and delete" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 20: Check editing at phone width, and update the README

Part B is complete in code. This task checks it in a real browser against the in-memory account, describes editing in the README, and records what the checks found.

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`

**Interfaces:**
- Consumes:
  - Everything in Part B.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Walk through editing in a browser**

Start the dev server and open it in a browser at 375 px wide:

```bash
pnpm dev
```

Sign in as the test player and add a character by pasting the contents of `fixtures/characters/vlad.json`. Then walk through all of the following. Every point must hold before the task is committed. Fix what does not hold in the code of the task that owns it, with a test that fails first, and say so in the report.

1. In the Combat view, open the Hex row. It shows its description and an "Edit" button. Tap it: a sheet rises from the bottom titled "Edit Hex", with Timing, Tags, Shown in, Roll and "Hide this ability", and the note "This ability costs a spell slot."
2. Tap the Utility tag. The Explore box ticks itself. Save. The Hex row now carries "utility" and "edited", and Hex is listed in the Explore view.
3. Open the editor for Hex again. "Back to imported" is offered. Tap it: the row loses "utility" and "edited".
4. Open the editor for a weapon, change the attack bonus, and save. The roll line shows the new bonus.
5. Open the editor for Dash (under "Anyone can do this"), tick "Limited uses" with a maximum of 2, and save. Dash shows "2 left", a chip with two pips appears under the turn pills, and Use spends one.
6. Tap "Edit list" at the bottom of the Combat view. Every row shows a drag handle, up and down arrows, Edit and Hide, and no Use button. The two rows named Misty Step read "Misty Step (pact slot)" and "Misty Step (free cast)".
7. Drag a row by its handle to another place in its group, with a mouse and, if a touch screen is to hand, with a finger. It lands where it was dropped and cannot leave its group. Then move a row with its arrows.
8. Hide "Initiate a Circle Spell". It moves to "Hidden (1)" at the foot of the list. Tap "Done": the row is gone from the Combat view and the order you arranged is kept.
9. Open the Explore view. Its order has not changed. Arrange it, and check that the Combat view's order has not changed.
10. In "Edit list", tap "Add an ability". Give it a name, a Bonus Action timing, limited uses and a description that contains a `<` and a line break. Save, then "Done". The row is in the Bonus Action group with pips, and its description shows the `<` as typed, on two lines.
11. Open the new row's editor from "Edit". It is the custom editor, with Name, Description and Delete. Delete it: the browser asks first, and the row is gone.
12. Reload the page. Every edit, the order and the hidden row are as you left them.
13. In "Edit list", restore the hidden row from "Hidden (1)".
14. No button or link is shorter than 44 px, and no screen scrolls sideways, including with the editor open.

- [ ] **Step 2: Write the implementation**

The README gains an "Editing a sheet" section. The findings file gains what was found while Part B was being checked.

Replace the whole of `README.md` with:

```markdown
# Character Wizard

A play aid for D&D (2024 rules). It imports a character from D&D Beyond and shows what the character can do, grouped by Action, Bonus Action and Reaction, with every roll written out. Players sign in with Discord, and their characters follow them between devices.

This repository contains the import, the sheet maths, the turn engine, the web app and the database. See `docs/superpowers/specs/` for the design.

## Commands

    pnpm install
    pnpm test
    pnpm typecheck
    pnpm dev
    pnpm build
    pnpm sheet fixtures/characters/vlad.json
    pnpm fetch-character https://www.dndbeyond.com/characters/<id> <slug>

`pnpm dev` starts the app on your machine and on your local network. With no Supabase address configured it needs no account of any kind: "Continue as test player" signs in to an account held in memory, which is empty again after a reload, and the dev server answers character imports itself. Characters stay in the browser's own storage between reloads.

`fetch-character` and the app's import both need the sheet's Character Privacy set to Public.

`pnpm test` includes the database's access rules. They run on PGlite, a Postgres inside the test process, so no Docker and no Supabase project is needed.

## Accounts

- **Signing in** is by Discord, through Supabase Auth. The app stores no password and sends no email.
- **Anyone can sign in, and a new account can do nothing** until a table admin approves it on the Players screen.
- **The first table admin is made by hand,** once. Sign in on the deployed site, then in the Supabase dashboard's SQL Editor find your row with `select id, display_name from public.profiles;` and run `update public.profiles set approved = true, is_table_admin = true where id = '<your id>';`.
- **A table admin** sees every character at the table under "Table" and can open and edit any of them.
- **The device keeps its own copy** of everything, so the app opens and works without a connection. Changes are sent when one is available. Where two devices change the same thing, the later change wins.
- **Signing out** removes the device's copy.

## Editing a sheet

The imported sheet is never changed. A player's edits are stored beside it and applied each time the sheet is built, so they survive a re-import.

- **Edit** on an opened row changes one ability: when it is used, its limited uses, its tags, which views list it, its roll, and whether it is hidden. "Back to imported" removes every edit to it.
- **Edit list** at the bottom of each view is for arranging: drag a row or use its up and down buttons, hide rows, restore hidden ones, and add an ability of your own.
- Combat and Explore each keep their own order.
- Edits sync like everything else, so a table admin can fix a player's sheet from their own device.

## Deploying

The site is static and is built with `pnpm build` into `apps/web/dist`. It needs two values at build time, both public: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the project's publishable key). `apps/web/.env.example` lists them.

The database is created from `supabase/migrations` with `pnpm dlx supabase db push`, and the import function is deployed with `pnpm dlx supabase functions deploy import-character`. The function answers only the origins listed in its `ALLOWED_ORIGINS` secret, and only signed-in, approved players.

Never commit a Supabase address, a key, a Discord client secret or a database password.

## Packages

- `packages/model`: shared types.
- `packages/ddb-import`: converts D&D Beyond JSON into the app's `Character` format.
- `packages/rules`: calculates the sheet, the list of abilities, the roll lines and the turn engine.
- `apps/web`: the React app. `src/storage` is the device's copy, `src/remote` is the account (Supabase, or an in-memory stand-in), and `src/sync` moves changes between the two.
- `supabase/migrations`: the database: tables, access rules and the functions the app calls.
- `supabase/functions/import-character`: the Edge Function that fetches a public character.
- `supabase/tests`: tests of the access rules, run against the migrations.

## Licensing and attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
```

Replace the whole of `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md` with:

```markdown
# Milestone 3: deferred review findings

Findings that were deliberately not fixed in milestone 3. Add to this file as reviews find things; each entry names the milestone that should pick it up or drop it.

See also "Known gaps carried forward" in `2026-11-18-milestone-3-accounts-and-overlays.md`.

## Settle in milestone 4 (suggestions)

Found while the plan was being checked.

- On a full account, pasted JSON that is not a character at all gets the "ten characters" message, because the limit is checked before anything else.
- The waiting screen says "Still waiting." both when the player is not approved and when the account could not be reached. It cannot tell which.
- "Checking your account" shows briefly during an ordinary sign-in, between the session arriving and the profile arriving. It also shows when a session ended before any profile was learned, where "Try again" cannot help and "Sign out" is the way on.
- "Remove access" on the Players screen does not ask first. Approving again undoes it.
- A card under "Table" shows the owner's name and not the import date.

Found while Part B of the plan was being checked.

- A hidden custom ability cannot be deleted until it is restored, because a hidden row offers only Restore.
- Two hidden rows with the same name have the same "Restore" button name.
- Saving a custom ability's editor replaces the whole edit stored under its key with where it is shown and whether it is hidden. Any other field there, which only another version of the app could have written, is dropped.
- When a dialog opens, focus lands on the dialog and not on its first field.
- Deleting a custom ability, deleting a character and signing out with unsynced changes ask with the browser's own confirm box, not with a dialog of the app's.
- "Start my turn" stays pinned at the bottom of the Combat view while the list is being arranged.
- The JavaScript bundle is over 600 kB before compression, mostly supabase-js and dnd-kit. Milestone 5 (offline and install) is the place to split it.

## Not verified in milestone 3

- Discord sign-in against the real services, the Supabase adapter against a live project, and the migration applied to a real project. Plan Task 13 (repository owner) covers all three. Remove this line when the owner reports that Task 13's checks passed.
- The app has not been opened on a real phone. The walk-throughs ran in a desktop browser at 375 by 812 against the in-memory account.
- Dragging in "Edit list" on a real touch screen. It was checked with a mouse; the tests cover the keyboard and the up and down buttons.
- Whether Discord sign-in returns to an app installed to an iPhone's home screen. Milestone 5 must check before install is offered.
- Whether a successful fetch from the character service redirects. An unknown ID answers 403 directly; the import function now follows no redirects.
```

- [ ] **Step 3: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (1018 tests in 44 files) and the type check prints no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Describe editing in the README and record what the checks found" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

## Done when

**Part A**

- `pnpm test` passes, `pnpm typecheck` is clean and `pnpm build` succeeds at the end of Task 12.
- The walk-through in Task 12 passes at 375 px wide against the in-memory account.
- The owner has completed Task 13, or has chosen to merge Part A before deploying it.

**Part B**

- `pnpm test` passes, `pnpm typecheck` is clean and `pnpm build` succeeds at the end of the last task.
- The walk-through in the last task passes at 375 px wide.
- An edit made on one device appears on another signed in to the same account, checked by the owner on the deployed site.

## Known gaps carried forward

- Druid, Monk, Paladin and Ranger still have no fixture.
- Discord sign-in, the Supabase adapter and the migration have run only against stand-ins until the owner completes Task 13.
- Discord sign-in leaves the site and comes back. Whether that returns to an app installed to an iPhone's home screen is not verified; milestone 5 must check it before install is offered.
- Two people changing the same item at the same moment lose the earlier change silently (spec section 12). The whole of what is spent is one item.
- A device learns of another device's change at its next fetch, up to 30 seconds later. There are no live updates.
- A table admin who opens a player's character can spend that player's resources. Undo reverses a slip.
- Anyone with a Discord account can sign in and wait for approval. Unapproved accounts accumulate in the Supabase dashboard until the owner deletes them there.
- Supabase pauses a free project after seven days of low activity. The app then works from each device's copy until the owner resumes the project.
- The import rate limit counts per player, not per device or address.
- A replaced roll is fixed text and does not follow a level-up (spec section 7).
- The sheet's own numbers (skills, saving throws, initiative, Armor Class, spell attack bonus and save DC) cannot be overridden (spec section 16).
- Upcasting still does not change a spell's damage in the roll line; the player can now replace the roll by hand.
- A custom ability's numbers are typed in and do not scale with level.
- Dragging in "Edit list" is tested from the keyboard and through the "Move up" and "Move down" buttons. A pointer or touch drag is checked by hand in the walk-through, and has not been tried on a real touch screen.
- The deferred findings that milestone 3 did not take are still listed in `docs/superpowers/plans/2026-11-11-milestone-2-deferred-findings.md`, and new ones from this milestone's reviews go in `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`.
