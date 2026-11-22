# Milestone 3, Part B: Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ability can be edited, reordered, hidden or added by hand, and every feature on the Features page can be hidden, reordered and ticked into Combat or Explore, with the changes stored beside the imported sheet and synced like everything else.

**Architecture:** A player's edits are items stored beside the imported sheet (`edit`, `custom` and `order` items, synced by Part A's engine with no change to it). One pure function, `applyEdits`, turns the calculated sheet plus the edits into the sheet the views show, so the views and the turn engine never learn about edits. A feature's key takes the same edit an ability's does; a feature the player ticks into a view becomes an ordinary row there. Before any of that, two faults in the syncing are closed, because an edit is written once and cannot rely on the next tap to repair it.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript 7 (strict), Vitest 5 (projects `node` and `web` on jsdom), React 19, Vite 8, Tailwind CSS 4, Zustand 5, `idb` 8, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, added in Task 7), React Testing Library 16, `fake-indexeddb` 6.

**Spec:** `docs/superpowers/specs/2026-11-11-character-wizard-design.md` (sections 5.3, 5.4, 5.5, 6, 7, 10.1, 10.3, 10.4, 10.6, 12 and 14). Executors read the spec as well as this plan.

**This plan replaces Tasks 14 to 20** of `docs/superpowers/plans/2026-11-18-milestone-3-accounts-and-overlays.md`. That text was written before Part A's reviews changed the store and the sync engine and before the Features page existed, and its code no longer applies. Do not build from it.

## Global Constraints

- No code may branch on a specific character, subclass, item, campaign, table or user. Branching on SRD rule names is allowed. No list of feature names decides what is shown.
- Unknown input must never throw. Stored and synced records are checked and repaired when read; a record that cannot be repaired is ignored.
- Never edit `fixtures/expected/*.json`. Never edit `fixtures/characters/*.json`. Tests that need a variation copy a fixture in memory and change the copy.
- Rules text must not be committed. Fixture descriptions are `"[removed]"`; tests that need description text write their own.
- Never commit a real D&D Beyond character ID, username, email address, Discord ID, Supabase URL or key. Test user IDs are made-up strings (`user-test`, `user-dm`).
- An agent must not create accounts, read or type a secret key, or run a command that needs one. Nothing in this plan needs one.
- Nothing is pushed, merged or deleted without the owner's say-so. The local branches `backup/pre-clean-branch` and `backup/pre-clean-main` are never pushed or merged.
- Only `@cw/ddb-import` may read D&D Beyond field names. `@cw/rules` reads only `@cw/model` types. `apps/web` never reads raw D&D Beyond fields; it calls `convertCharacter`.
- `@cw/rules` and `@cw/model` stay pure: no network, storage, DOM or React.
- The views, the turn engine and the store's play logic read only the sheet that `applyEdits` returns. None of them reads edits.
- The app never adds a feature to Combat or Explore. Only the player's tick does (spec section 5.5).
- The app never applies a conditional modifier to a number. It shows it as a note.
- Out of scope, do not build: suggestions, turn plans, situation chips, usage events, feedback, a service worker or install prompt, overriding the sheet's own numbers, search on the Features page, adding a feature by hand, putting a feature's options in order, a conflict screen, live updates between devices.
- UI copy: sentence case; no "please", no exclamation marks; messages exactly as written in this plan's tests.
- Every tappable control is at least 44 px tall (`min-h-11`).
- Single-class characters only.
- Package names: `@cw/model`, `@cw/ddb-import`, `@cw/rules`, `@cw/web`. Packages have no build step except `@cw/web`.
- Work on a new branch `milestone-3-overlays`, cut from `main` after this plan is merged. Commit after every task. End every commit message with: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## How this plan was checked

Every task below is one commit in a throwaway copy of the repository, built in order on top of `main` as it stood after the Features page was merged (`3db4840`), and outside the repository itself. The code blocks in this plan were generated from those commits, and the test counts beside each task are what `pnpm test` printed at that commit. `pnpm typecheck` was clean at every commit and `pnpm build` succeeded at the last.

The file steps of this document (create, replace, apply a change) were then replayed by a script onto a fresh checkout of `main`. The result was identical to the tested copy, apart from `apps/web/package.json` and the lockfile, which the `pnpm add` step of Task 7 produces.

The new screens were opened in a browser at 375 px wide against the in-memory account, with the level 9 Fighter fixture: a feature's editor, a feature ticked into Combat under "Always on", the editor of a feature that already has rows in play, and the Features page's "Edit list". Nothing was dragged with a mouse or a finger in this check; Task 14's walk-through does that.

Where the code came from:

- Tasks 3 to 8 are the old plan's Tasks 14 to 19, replayed onto the current code. Tasks 3 and 5 to 8 applied without a change to their code. Task 4 (the store) was merged by hand onto Part A's review fixes, and gained two tests.
- Tasks 1, 2 and 9 to 13 are new.

Not checked: a drag on a real touch screen, and an edit made on one device appearing on another on the deployed site. Both are in Task 14 or in "Done when".

One test outside this plan's scope failed once while the plan was being built: `supabase/tests/access.test.ts`, "gives them a profile: named as on Discord, not approved, not an admin". It passed on three immediate reruns and in every later full run. Nothing in this plan touches the database. If it fails during execution, rerun it before looking for a cause in the task at hand.

## What changed from the old Part B

For anyone who read the old text:

- **Two tasks come first that the old plan did not have.** They close the two syncing faults the Part A review left "to settle before Part B" (findings file). Every write of an edit in this plan goes through the one-step storage call of Task 1.
- **The store task** no longer swallows a failed read of saved state, and reads edits back from the device after a sync instead of trusting memory.
- **Features** are new throughout: Tasks 9 and 11 to 13, and the feature steps of Task 14's walk-through.
- **"Always on"** (Task 10) is new. `passive` no longer shares "No action needed".
- **Test totals** start from 973 tests in 42 files, where `main` stands, and end at 1254 in 51.

## What the fixtures hold

Facts the tests rely on. All are examples of general rules; no code names any of them.

- `vlad` (Warlock 3): Hex (a Bonus Action, concentration, pact slot), two abilities named Misty Step and two named Hellish Rebuke, told apart by cost. Seven abilities under "No action needed" and none that is passive.
- `vlad`'s features: the class group "Warlock 3", "Feats" and the species group "Human". Alert has no ability of its own. Lucky is in play as Luck Points. Eldritch Invocations has three options (Pact of the Blade, Armor of Shadows, Fiendish Vigor), each in play. Criminal Ability Score Improvements has one option that is not. D&D Beyond hides two entries: Eldritch Invocation Options and Languages. 25 features in all.
- `sid` (Rogue 3) has Cunning Action, which costs nothing. `franny` (Barbarian 3) has a custom action from D&D Beyond, Twig Attack, listed twice.
- `danger` (Fighter 9) has the feat War Caster, in play as Reactive Spell, and a species trait, Darkvision, with no ability of its own.

## File structure

```
apps/web/src/storage/{types,memory,idb,serial,index}.ts   + updateCharacter, updateItem, Update     (Task 1)
apps/web/src/sync/engine.ts                 decides inside one storage step (1); item cursor goes back (2)
packages/model/src/index.ts                 + TIMINGS, TAGS, RESET_TYPES, AbilityEdit, CustomAbility,
                                              CharacterEdits, ViewName (3); + OrderName (11)
packages/rules/src/normalise.ts             + normaliseEdit, normaliseCustom, normaliseOrder, normaliseRoll (3)
packages/rules/src/edits.ts                 applyEdits, editForm, diffEdit, viewsOf (3); features (11)
packages/rules/src/order.ts                 sortByOrder, withGroupOrder                             (11)
packages/rules/src/features.ts              + featureSource, arrangeFeatures, featureAbility,
                                              isFeatureKey, hiddenOnSheet                           (11)
packages/rules/src/views.ts                 groups honour edits and order (3); + passive group (10)
packages/rules/src/sheet.ts                 + hidden, edited, layout (3); + featureSource,
                                              hiddenFeatures, featureRows, unshownResources (11)
packages/rules/src/play.ts                  + costKind                                              (5)
packages/ddb-import/src/features.ts         an option's key names its parent                        (9)
apps/web/src/store.ts                       + baseSheet, edits, setEdit, saveCustom, deleteCustom,
                                              setOrder (4); the Features page's order (11)
apps/web/src/components/Dialog.tsx          a native dialog as a bottom sheet                       (5)
apps/web/src/components/rowLabel.ts         names that tell twins apart                             (5)
apps/web/src/components/{AbilityEditor,RollEditor,fieldStyles,useAbilityEdit}.tsx                   (6)
apps/web/src/components/{ArrangeSection,ArrangeRow,HiddenDrawer}.tsx                                (7, 13)
apps/web/src/views/EditList.tsx             arranging a view, the Hidden drawer, Add an ability     (7, 8)
apps/web/src/components/{CustomAbilityEditor,editorFields}.tsx                                      (8)
apps/web/src/components/FeatureEditor.tsx   the editor of a feature that has rows in play           (12)
apps/web/src/views/FeaturesView.tsx         + Edit on a row (12); + Edit list (13)
apps/web/src/views/FeatureEditList.tsx      arranging the Features page                             (13)
apps/web/src/views/{CombatView,ExploreView}.tsx   Edit, Edit list (6, 7); "Always on" (10)
```

## Background the implementer needs

- **Commands:** `pnpm test` runs everything. `pnpm exec vitest run <path>` runs one file. `pnpm typecheck` checks every package, the web app, the shared handler and the database tests. `pnpm dev` starts the app with the in-memory account and a "Continue as test player" button.
- **Fixtures:** `loadRaw(slug)` from `test-utils/fixtures.ts`. Slugs: `anastasia` (Sorcerer 3), `danger` (Fighter 9), `franny` (Barbarian 3), `maya` (Cleric 3), `milton` (Bard 3), `minkis` (Wizard 3), `sid` (Rogue 3), `vlad` (Warlock 3). `seed(slug)` in `apps/web/src/test/helpers.ts` gives a signed-in store holding that fixture, opened.
- **Words used in this plan:**
  - *The account* is whatever implements `Remote`: Supabase in production, `memoryServer` in tests and local development.
  - *An item* is one row attached to a character: a kind (`play`, `edit`, `custom`, `order`), a key and some data. An `edit` item's key is an ability key or a feature key.
  - *Dirty* marks a record changed on this device that the account has not yet answered for.
  - *The base sheet* is the sheet as imported, with no edits. *The sheet* is the base sheet with the edits applied.
  - *A feature's row* is the ability built from a feature that has none of its own (`featureAbility`).
- **The later change wins,** item by item. Use `nextStamp(previous)` from `apps/web/src/sync/engine.ts` for a new `updatedAt`, inside the `decide` function of `updateItem`, so that it is later than whatever the device holds at that moment.
- **A diff step** in this plan shows removed lines with `-`, added lines with `+` and three lines of unchanged context. Apply it by hand or with `git apply`. On Windows, pass a patch to `git apply` as bytes: a text pipe turns its line endings into CRLF and the patch fails.
- **Bash heredocs that contain apostrophes fail in this environment.** Write files with the file-writing tool, not with `cat <<EOF`.

---

### Task 1: The device looks at a record and writes it in one step

The first of the two faults the Part A review left to settle before edits exist (findings file, "Found by the whole-branch review of Part A"). The sync engine and the store read a record, decide, and write it back in separate storage calls. A change the player makes in between is overwritten, and in the sending path is also marked as sent. Play state hides this, because the next tap writes it again. An edit is written once.

This task gives the device's storage one call that reads a record and writes it as a single step, and moves the sync engine and the saving of play state onto it. No screen changes.

**Files:**
- Modify: `apps/web/src/storage/idb.ts`
- Modify: `apps/web/src/storage/index.ts`
- Modify: `apps/web/src/storage/memory.ts`
- Modify: `apps/web/src/storage/serial.ts`
- Modify (test): `apps/web/src/storage/storage.test.ts`
- Modify: `apps/web/src/storage/types.ts`
- Modify (test): `apps/web/src/store.test.ts`
- Modify: `apps/web/src/store.ts`
- Modify (test): `apps/web/src/sync/engine.test.ts`
- Modify: `apps/web/src/sync/engine.ts`

**Interfaces:**
- Consumes:
  - `AppStorage`, `memoryStorage`, `idbStorage`, `serial` in `apps/web/src/storage` (Part A).
  - `pull`, `push` in `apps/web/src/sync/engine.ts` and `savePlay` in `apps/web/src/store.ts` (Part A).
- Produces:
  - `Update<T> = { put: T } | 'remove' | 'keep'`, exported from `apps/web/src/storage`.
  - `AppStorage.updateCharacter(id, decide: (current: StoredCharacter | null) => Update<StoredCharacter>): Promise<void>`. Removing a character removes its items.
  - `AppStorage.updateItem(characterId, kind, key, decide: (current: StoredItem | null, character: StoredCharacter | null) => Update<StoredItem>): Promise<void>`.
  - Both are implemented by the in-memory storage, the IndexedDB storage (one transaction) and the serial wrapper. `decide` is given copies and must answer at once, without waiting for anything.
  - `pull` and `push` decide inside these calls. `savePlay` starts its writes before it returns, each stamped later than whatever the device holds at that moment.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/storage/storage.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -107,6 +107,71 @@ describe.each([
     expect(await storage.getMeta('user')).toBeNull();
   });
 
+  it('looks at an item and writes it in one step', async () => {
+    const storage = await open();
+    await storage.putCharacter(character('a'));
+    const seen: unknown[] = [];
+    await storage.updateItem('a', 'edit', 'spell:1', (current, owner) => {
+      seen.push(current, owner?.id);
+      return { put: item('a', 'edit', 'spell:1', { tags: ['utility'] }) };
+    });
+    await storage.updateItem('a', 'edit', 'spell:1', (current) => {
+      seen.push(current?.data);
+      return 'keep';
+    });
+    expect(seen).toEqual([null, 'a', { tags: ['utility'] }]);
+    expect(await storage.listItems('a')).toEqual([item('a', 'edit', 'spell:1', { tags: ['utility'] })]);
+    await storage.updateItem('a', 'edit', 'spell:1', () => 'remove');
+    expect(await storage.listItems('a')).toEqual([]);
+  });
+
+  it('tells an item update when the device does not hold the character', async () => {
+    const storage = await open();
+    const seen: unknown[] = [];
+    await storage.updateItem('ghost', 'play', 'state', (current, owner) => {
+      seen.push(current, owner);
+      return 'keep';
+    });
+    expect(seen).toEqual([null, null]);
+    expect(await storage.listItems()).toEqual([]);
+  });
+
+  it('looks at a character and writes it in one step, and removes its items with it', async () => {
+    const storage = await open();
+    const seen: unknown[] = [];
+    await storage.updateCharacter('a', (current) => {
+      seen.push(current);
+      return { put: character('a') };
+    });
+    await storage.putItem(item('a', 'play', 'state', 1));
+    await storage.putItem(item('b', 'play', 'state', 2));
+    await storage.updateCharacter('a', (current) => {
+      seen.push(current?.name);
+      return current ? { put: { ...current, name: 'Renamed' } } : 'keep';
+    });
+    expect(seen).toEqual([null, 'Character a']);
+    expect(await storage.listCharacters()).toEqual([character('a', { name: 'Renamed' })]);
+    await storage.updateCharacter('a', () => 'keep');
+    expect(await storage.listCharacters()).toHaveLength(1);
+    await storage.updateCharacter('a', () => 'remove');
+    expect(await storage.listCharacters()).toEqual([]);
+    expect(await storage.listItems()).toEqual([item('b', 'play', 'state', 2)]);
+  });
+
+  it('gives an update a copy, and stores a copy of its answer', async () => {
+    const storage = await open();
+    await storage.putItem(item('a', 'play', 'state', { spent: { pact: 1 } }));
+    await storage.updateItem('a', 'play', 'state', (current) => {
+      (current?.data as { spent: Record<string, number> }).spent.pact = 99;
+      return 'keep';
+    });
+    expect((await storage.listItems('a'))[0].data).toEqual({ spent: { pact: 1 } });
+    const answer = item('a', 'play', 'state', { spent: { pact: 2 } });
+    await storage.updateItem('a', 'play', 'state', () => ({ put: answer }));
+    (answer.data as { spent: Record<string, number> }).spent.pact = 50;
+    expect((await storage.listItems('a'))[0].data).toEqual({ spent: { pact: 2 } });
+  });
+
   it('stores a copy and returns a copy', async () => {
     const storage = await open();
     const given = item('a', 'play', 'state', { spent: { pact: 1 } });
@@ -189,6 +254,29 @@ describe('serial', () => {
     expect(await storage.listItems()).toEqual([]);
   });
 
+  it('runs an update after the writes made before it, so it sees them', async () => {
+    const inner = memoryStorage();
+    let release: () => void = () => undefined;
+    const gate = new Promise<void>((resolve) => { release = resolve; });
+    const slow: AppStorage = {
+      ...inner,
+      async putItem(value) {
+        await gate;
+        await inner.putItem(value);
+      },
+    };
+    const storage = serial(slow);
+    const seen: unknown[] = [];
+    const write = storage.putItem(item('a', 'play', 'state', 1));
+    const update = storage.updateItem('a', 'play', 'state', (current) => {
+      seen.push(current?.data);
+      return 'keep';
+    });
+    release();
+    await Promise.all([write, update]);
+    expect(seen).toEqual([1]);
+  });
+
   it('keeps going after a call fails, and the failure reaches only its caller', async () => {
     const inner = memoryStorage();
     const storage = serial({ ...inner, putCharacter: () => Promise.reject(new Error('quota')) });
```

Apply this change to `apps/web/src/store.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -121,7 +121,7 @@ describe('saveImported', () => {
   it('keeps the open character\'s unsaved play state when it is re-imported', async () => {
     const storage = memoryStorage();
     const record = await seed('vlad', storage);
-    storage.putItem = async () => { throw new Error('quota'); };
+    storage.updateItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
@@ -150,7 +150,7 @@ describe('open', () => {
   it('keeps the play state in memory when the open character is opened again', async () => {
     const storage = memoryStorage();
     const record = await seed('vlad', storage);
-    storage.putItem = async () => { throw new Error('quota'); };
+    storage.updateItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
@@ -309,10 +309,41 @@ describe('play', () => {
     expect((await savedPlay(storage, record.id))?.turn.action).toBe(false);
   });
 
+  it('stamps a tap later than a copy fetched just before the tap is saved', async () => {
+    const storage = memoryStorage();
+    const record = await seed('vlad', storage);
+    const future = new Date(Date.now() + 60_000).toISOString();
+    const { listItems, updateItem } = storage;
+    let landed = false;
+    // A fetched copy lands after the tap and before the tap's own write.
+    const land = async (): Promise<void> => {
+      if (landed) return;
+      landed = true;
+      await storage.putItem({
+        characterId: record.id, kind: 'play', key: 'state', data: { spent: { pact: 2 }, concentrationKey: null },
+        updatedAt: future, deleted: false, dirty: false,
+      });
+    };
+    storage.listItems = async (id?: string) => {
+      const rows = await listItems(id);
+      await land();
+      return rows;
+    };
+    storage.updateItem = async (...args) => {
+      await land();
+      return updateItem(...args);
+    };
+    state().use(ability('Hex'), 'combat');
+    await settle();
+    const saved = (await listItems(record.id)).find((i) => i.kind === 'play');
+    expect(saved).toMatchObject({ data: { spent: { pact: 1 } }, dirty: true });
+    expect(Date.parse(saved?.updatedAt ?? '')).toBeGreaterThan(Date.parse(future));
+  });
+
   it('turns on the not-saving flag when a write fails, and keeps the change', async () => {
     const storage = memoryStorage();
     await seed('vlad', storage);
-    storage.putItem = async () => { throw new Error('quota'); };
+    storage.updateItem = async () => { throw new Error('quota'); };
     state().use(ability('Hex'), 'combat');
     await settle();
     expect(state().persistent).toBe(false);
```

Apply this change to `apps/web/src/sync/engine.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -33,6 +33,38 @@ function table(): MemoryServer {
 const device = (server: MemoryServer, userId: string, storage: AppStorage = memoryStorage()) =>
   ({ storage, remote: server.remote({ userId }) });
 
+/**
+ * A storage on which `change` is made once, just before the first write that a sync makes to
+ * `target` lands: the worst moment for a tap. `target` is a character's ID or an item's key.
+ */
+function changedBeforeWrite(inner: AppStorage, target: string, change: () => Promise<void>): AppStorage {
+  let done = false;
+  const first = async (id: string): Promise<void> => {
+    if (done || id !== target) return;
+    done = true;
+    await change();
+  };
+  return {
+    ...inner,
+    async putCharacter(value) {
+      await first(value.id);
+      return inner.putCharacter(value);
+    },
+    async updateCharacter(id, decide) {
+      await first(id);
+      return inner.updateCharacter(id, decide);
+    },
+    async putItem(value) {
+      await first(value.key);
+      return inner.putItem(value);
+    },
+    async updateItem(characterId, kind, key, decide) {
+      await first(key);
+      return inner.updateItem(characterId, kind, key, decide);
+    },
+  };
+}
+
 describe('characterId', () => {
   it('is the same wherever the same account imports the same character', () => {
     expect(characterId('42', ANN)).toBe('ddb-42-user-ann');
@@ -252,6 +284,62 @@ describe('fetching', () => {
   });
 });
 
+describe('a change made while a sync is writing', () => {
+  it('keeps a change to an item made just before the fetched copy would have replaced it', async () => {
+    const server = table();
+    const phone = device(server, ANN);
+    const inner = memoryStorage();
+    await phone.storage.putCharacter(character('c1'));
+    await phone.storage.putItem(item('c1', 'edit', 'spell:1'));
+    await syncOnce(phone);
+    await syncOnce(device(server, ANN, inner));
+    await phone.storage.putItem(item('c1', 'edit', 'spell:1', { data: { from: 'phone' }, updatedAt: T2 }));
+    await syncOnce(phone);
+    const tablet = device(server, ANN, changedBeforeWrite(inner, 'spell:1', () =>
+      inner.putItem(item('c1', 'edit', 'spell:1', { data: { from: 'tablet' }, updatedAt: T3 }))));
+    await syncOnce(tablet);
+    expect((await inner.listItems('c1'))[0].data).toEqual({ from: 'tablet' });
+    await syncOnce(phone);
+    expect((await phone.storage.listItems('c1'))[0].data).toEqual({ from: 'tablet' });
+  });
+
+  it('does not mark an item as sent when it changed just before it would have been marked', async () => {
+    const server = table();
+    const inner = memoryStorage();
+    await inner.putCharacter(character('c1'));
+    await inner.putItem(item('c1', 'edit', 'spell:1'));
+    const tablet = device(server, ANN, changedBeforeWrite(inner, 'spell:1', () =>
+      inner.putItem(item('c1', 'edit', 'spell:1', { data: { value: 2 }, updatedAt: T2 }))));
+    await push(tablet);
+    expect((await inner.listItems('c1'))[0]).toMatchObject({ data: { value: 2 }, updatedAt: T2, dirty: true });
+  });
+
+  it('keeps a re-import made just before the fetched character would have replaced it', async () => {
+    const server = table();
+    const phone = device(server, ANN);
+    const inner = memoryStorage();
+    await phone.storage.putCharacter(character('c1'));
+    await syncOnce(phone);
+    await syncOnce(device(server, ANN, inner));
+    await phone.storage.putCharacter(character('c1', { name: 'Phone', updatedAt: T2, importedAt: T2 }));
+    await syncOnce(phone);
+    const tablet = device(server, ANN, changedBeforeWrite(inner, 'c1', () =>
+      inner.putCharacter(character('c1', { name: 'Tablet', updatedAt: T3, importedAt: T3 }))));
+    await pull(tablet);
+    expect((await inner.listCharacters())[0]).toMatchObject({ name: 'Tablet', dirty: true });
+  });
+
+  it('does not mark a character as sent when it changed just before it would have been marked', async () => {
+    const server = table();
+    const inner = memoryStorage();
+    await inner.putCharacter(character('c1'));
+    const tablet = device(server, ANN, changedBeforeWrite(inner, 'c1', () =>
+      inner.putCharacter(character('c1', { name: 'Again', updatedAt: T2, importedAt: T2 }))));
+    await push(tablet);
+    expect((await inner.listCharacters())[0]).toMatchObject({ name: 'Again', updatedAt: T2, dirty: true });
+  });
+});
+
 describe('conflicts', () => {
   it('keeps the later change when two devices change the same item', async () => {
     const server = table();
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/storage/storage.test.ts apps/web/src/store.test.ts apps/web/src/sync/engine.test.ts
```

Expected: FAIL. The storage has no `updateItem` or `updateCharacter`, and the sync engine overwrites a change made just before its own write lands.

- [ ] **Step 3: Write the implementation**

In IndexedDB the read and the write share one transaction, so nothing else can touch the record in between. `decide` must not wait for anything, because a transaction closes as soon as it has no request pending.

`decide` reports what it found by setting variables of the function that called it (`changed`, `found.revived`). The storage call itself resolves to nothing.

Three existing tests in `apps/web/src/store.test.ts` make a write fail by replacing `storage.putItem`. Play state no longer goes through `putItem`, so they replace `storage.updateItem` instead. Nothing else about them changes.

Left as it is: `saveImported` still stamps a re-import from the copy in memory, and `remove` still deletes a character in two storage steps. Both are in the findings file. `claimLocalCharacters` runs before syncing starts and is not touched.

The new tests in `engine.test.ts` use a storage wrapper, `changedBeforeWrite`, that makes a change on the device just before the first write the sync makes to one record. Against the code before this task, every one of them fails.

Apply this change to `apps/web/src/storage/idb.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -73,6 +73,18 @@ export async function idbStorage(): Promise<AppStorage> {
     async putCharacter(character) {
       await db.put('characters', character);
     },
+    async updateCharacter(id, decide) {
+      const tx = db.transaction(['characters', 'items'], 'readwrite');
+      const characters = tx.objectStore('characters');
+      const update = decide((await characters.get(id)) ?? null);
+      if (update === 'remove') {
+        const keys = await tx.objectStore('items').index('byCharacter').getAllKeys(id);
+        await Promise.all([characters.delete(id), ...keys.map((key) => tx.objectStore('items').delete(key))]);
+      } else if (update !== 'keep') {
+        await characters.put(update.put);
+      }
+      await tx.done;
+    },
     async removeCharacter(id) {
       const tx = db.transaction(['characters', 'items'], 'readwrite');
       const keys = await tx.objectStore('items').index('byCharacter').getAllKeys(id);
@@ -100,6 +112,17 @@ export async function idbStorage(): Promise<AppStorage> {
     async putItem(item) {
       await db.put('items', item);
     },
+    async updateItem(characterId, kind, key, decide) {
+      const tx = db.transaction(['characters', 'items'], 'readwrite');
+      const items = tx.objectStore('items');
+      const [current, character] = await Promise.all([
+        items.get([characterId, kind, key]), tx.objectStore('characters').get(characterId),
+      ]);
+      const update = decide(current ?? null, character ?? null);
+      if (update === 'remove') await items.delete([characterId, kind, key]);
+      else if (update !== 'keep') await items.put(update.put);
+      await tx.done;
+    },
     async removeItem(characterId, kind, key) {
       await db.delete('items', [characterId, kind, key]);
     },
```

Replace the whole of `apps/web/src/storage/index.ts` with:

```ts
import { idbStorage } from './idb';
import { memoryStorage } from './memory';
import { serial } from './serial';
import type { AppStorage } from './types';

export { STATE_KEY, SYNCED_KINDS } from './types';
export type { AppStorage, ItemKind, StoredCharacter, StoredItem, SyncedKind, Update } from './types';
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
  const copy = <T>(value: T | undefined): T | null => (value === undefined ? null : structuredClone(value));
  return {
    async listCharacters() {
      return structuredClone([...characters.values()]);
    },
    async putCharacter(character) {
      characters.set(character.id, structuredClone(character));
    },
    async updateCharacter(id, decide) {
      const update = decide(copy(characters.get(id)));
      if (update === 'keep') return;
      if (update === 'remove') {
        characters.delete(id);
        for (const item of itemsOf(id)) items.delete(itemId(item.characterId, item.kind, item.key));
      } else {
        characters.set(update.put.id, structuredClone(update.put));
      }
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
    async updateItem(characterId, kind, key, decide) {
      const id = itemId(characterId, kind, key);
      const update = decide(copy(items.get(id)), copy(characters.get(characterId)));
      if (update === 'keep') return;
      if (update === 'remove') items.delete(id);
      else items.set(itemId(update.put.characterId, update.put.kind, update.put.key), structuredClone(update.put));
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

Replace the whole of `apps/web/src/storage/serial.ts` with:

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
    updateCharacter: queued((id, decide) => storage.updateCharacter(id, decide)),
    removeCharacter: queued((id) => storage.removeCharacter(id)),
    rekeyCharacter: queued((oldId, character) => storage.rekeyCharacter(oldId, character)),
    listItems: queued((characterId?: string) => storage.listItems(characterId)),
    putItem: queued((item) => storage.putItem(item)),
    updateItem: queued((characterId, kind, key, decide) => storage.updateItem(characterId, kind, key, decide)),
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

/** What to do with a record once it has been looked at: store this in its place, remove it, or leave it. */
export type Update<T> = { put: T } | 'remove' | 'keep';

/**
 * Where this device keeps its copy of everything. Named AppStorage because `Storage` is already
 * the browser's own type for localStorage. Every value is copied on the way in and on the way out.
 */
export interface AppStorage {
  /** Every character, including deleted ones that the account has not yet been told about. */
  listCharacters(): Promise<StoredCharacter[]>;
  putCharacter(character: StoredCharacter): Promise<void>;
  /**
   * Looks at one character and stores, removes or keeps it, as one step: no other call can change
   * the record in between. `decide` is given a copy, or null when the device holds none, and must
   * answer at once, without waiting for anything. Removing a character removes its items.
   */
  updateCharacter(id: string, decide: (current: StoredCharacter | null) => Update<StoredCharacter>): Promise<void>;
  /** Removes the character and every item it has from this device. */
  removeCharacter(id: string): Promise<void>;
  /** Stores `character` in place of the one with `oldId`, moving that character's items to it. */
  rekeyCharacter(oldId: string, character: StoredCharacter): Promise<void>;
  /** One character's items, or every item when no ID is given. */
  listItems(characterId?: string): Promise<StoredItem[]>;
  putItem(item: StoredItem): Promise<void>;
  /**
   * The same for one item. `decide` is also given the item's character, or null when the device
   * does not hold it.
   */
  updateItem(
    characterId: string, kind: ItemKind, key: string,
    decide: (current: StoredItem | null, character: StoredCharacter | null) => Update<StoredItem>,
  ): Promise<void>;
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
@@ -138,23 +138,20 @@ async function loadPlay(id: string): Promise<PlayState> {
 /**
  * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
  * An item is written only when it differs from `previous`, so flipping a pill does not touch the
- * synced item. Resolves true when the synced item was written.
+ * synced item. Both writes are started before this returns. Resolves true when the synced item
+ * was written.
  */
 async function savePlay(id: string, next: PlayState, previous: PlayState | null): Promise<boolean> {
-  const items = await storage.listItems(id);
-  const stamp = (kind: 'play' | 'turn'): string =>
-    nextStamp(items.find((item) => item.kind === kind && item.key === STATE_KEY)?.updatedAt);
+  // Stamped and written in one step, later than whatever the device holds at that moment.
+  const write = (kind: 'play' | 'turn', data: unknown, dirty: boolean): Promise<void> =>
+    storage.updateItem(id, kind, STATE_KEY, (current) => ({
+      put: { characterId: id, kind, key: STATE_KEY, data, updatedAt: nextStamp(current?.updatedAt), deleted: false, dirty },
+    }));
   const playChanged = !previous || !same(playItem(next), playItem(previous));
-  if (playChanged) {
-    await storage.putItem({
-      characterId: id, kind: 'play', key: STATE_KEY, data: playItem(next), updatedAt: stamp('play'), deleted: false, dirty: true,
-    });
-  }
-  if (!previous || !same(next.turn, previous.turn)) {
-    await storage.putItem({
-      characterId: id, kind: 'turn', key: STATE_KEY, data: next.turn, updatedAt: stamp('turn'), deleted: false, dirty: false,
-    });
-  }
+  const writes: Promise<void>[] = [];
+  if (playChanged) writes.push(write('play', playItem(next), true));
+  if (!previous || !same(next.turn, previous.turn)) writes.push(write('turn', next.turn, false));
+  await Promise.all(writes);
   return playChanged;
 }
 
```

Apply this change to `apps/web/src/sync/engine.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,5 +1,5 @@
 import type { PushResult, Remote, RemoteCharacter, RemoteItem } from '../remote/types';
-import { SYNCED_KINDS, type AppStorage, type StoredCharacter, type StoredItem, type SyncedKind } from '../storage';
+import { SYNCED_KINDS, type AppStorage, type StoredCharacter, type SyncedKind } from '../storage';
 
 const CURSOR_CHARACTERS = 'cursor:characters';
 const CURSOR_ITEMS = 'cursor:items';
@@ -84,60 +84,53 @@ function fromRemote(row: RemoteCharacter): StoredCharacter {
 /**
  * Fetches everything changed in the account since the last fetch and merges it into this device.
  * A fetched record replaces the device's copy unless the device's copy is dirty and newer.
+ * Each record is looked at and written in one storage step.
  */
 export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>> {
   const changed = new Set<string>();
 
-  const characterCursor = await cursor(storage, CURSOR_CHARACTERS);
-  const characters = await remote.pullCharacters(characterCursor);
-  const local = new Map((await storage.listCharacters()).map((c) => [c.id, c]));
+  const characters = await remote.pullCharacters(await cursor(storage, CURSOR_CHARACTERS));
   for (const row of characters) {
-    const mine = local.get(row.id);
-    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) {
-      if (row.deleted && !mine.deleted) {
-        // The account deleted it and threw away its items; this device has since brought it back.
-        for (const item of await storage.listItems(row.id)) {
-          if (isSynced(item.kind)) await storage.putItem({ ...item, dirty: true });
-        }
+    const found = { revived: false };
+    // Looked at and written in one step, so a change made on this device in between is not lost.
+    await storage.updateCharacter(row.id, (mine) => {
+      if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) {
+        found.revived = row.deleted && !mine.deleted;
+        return 'keep';
       }
-      continue;
-    }
-    if (row.deleted) {
-      if (mine) {
-        await storage.removeCharacter(row.id);
-        local.delete(row.id);
+      if (row.deleted) {
+        if (!mine) return 'keep';
         changed.add(row.id);
+        return 'remove';
+      }
+      if (!mine || mine.updatedAt !== row.updatedAt || mine.deleted) changed.add(row.id);
+      return { put: fromRemote(row) };
+    });
+    if (found.revived) {
+      // The account deleted it and threw away its items; this device has since brought it back.
+      for (const item of await storage.listItems(row.id)) {
+        if (!isSynced(item.kind)) continue;
+        await storage.updateItem(item.characterId, item.kind, item.key, (now) => (now ? { put: { ...now, dirty: true } } : 'keep'));
       }
-      continue;
     }
-    if (!mine || mine.updatedAt !== row.updatedAt || mine.deleted) changed.add(row.id);
-    const stored = fromRemote(row);
-    await storage.putCharacter(stored);
-    local.set(row.id, stored);
   }
   if (characters.length > 0) await storage.setMeta(CURSOR_CHARACTERS, characters[characters.length - 1].rev);
 
-  const itemCursor = await cursor(storage, CURSOR_ITEMS);
-  const items = await remote.pullItems(itemCursor);
-  const localItems = new Map<string, StoredItem>();
-  const idOf = (i: { characterId: string; kind: string; key: string }): string => JSON.stringify([i.characterId, i.kind, i.key]);
-  for (const item of await storage.listItems()) localItems.set(idOf(item), item);
+  const items = await remote.pullItems(await cursor(storage, CURSOR_ITEMS));
   for (const row of items) {
-    const character = local.get(row.characterId);
-    // An item for a character this device does not hold (deleted here, or not fetched) is left out.
-    if (!character || character.deleted) continue;
-    const mine = localItems.get(idOf(row));
-    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) continue;
-    if (row.deleted) {
-      if (mine) {
-        await storage.removeItem(row.characterId, row.kind, row.key);
+    await storage.updateItem(row.characterId, row.kind, row.key, (mine, character) => {
+      // An item for a character this device does not hold (deleted here, or not fetched) is left out.
+      if (!character || character.deleted) return 'keep';
+      if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) return 'keep';
+      if (row.deleted) {
+        if (!mine) return 'keep';
         changed.add(row.characterId);
+        return 'remove';
       }
-      continue;
-    }
-    if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
-    const { rev: _rev, ...rest } = row satisfies RemoteItem;
-    await storage.putItem({ ...rest, dirty: false });
+      if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
+      const { rev: _rev, ...rest } = row satisfies RemoteItem;
+      return { put: { ...rest, dirty: false } };
+    });
   }
   if (items.length > 0) await storage.setMeta(CURSOR_ITEMS, items[items.length - 1].rev);
 
@@ -159,10 +152,10 @@ export async function push({ storage, remote }: SyncDeps): Promise<PushResult['r
     rejected.push(...result.rejected);
     // Over the limit: it stays dirty and is offered again once there is room.
     if (result.rejected.some((r) => r.reason === 'limit')) continue;
-    const now = (await storage.listCharacters()).find((c) => c.id === sent.id);
-    if (!now || now.updatedAt !== sent.updatedAt) continue;
-    if (now.deleted) await storage.removeCharacter(now.id);
-    else await storage.putCharacter({ ...now, dirty: false });
+    await storage.updateCharacter(sent.id, (now) => {
+      if (!now || now.updatedAt !== sent.updatedAt) return 'keep';
+      return now.deleted ? 'remove' : { put: { ...now, dirty: false } };
+    });
   }
 
   // Items wait for their character: the account skips an item whose character it does not have.
@@ -172,12 +165,11 @@ export async function push({ storage, remote }: SyncDeps): Promise<PushResult['r
   );
   if (dirtyItems.length > 0) {
     await remote.pushItems(dirtyItems.map(({ dirty: _dirty, ...row }) => ({ ...row, kind: row.kind as SyncedKind })));
-    const after = new Map((await storage.listItems()).map((i) => [JSON.stringify([i.characterId, i.kind, i.key]), i]));
     for (const sent of dirtyItems) {
-      const now = after.get(JSON.stringify([sent.characterId, sent.kind, sent.key]));
-      if (!now || now.updatedAt !== sent.updatedAt) continue;
-      if (now.deleted) await storage.removeItem(now.characterId, now.kind, now.key);
-      else await storage.putItem({ ...now, dirty: false });
+      await storage.updateItem(sent.characterId, sent.kind, sent.key, (now) => {
+        if (!now || now.updatedAt !== sent.updatedAt) return 'keep';
+        return now.deleted ? 'remove' : { put: { ...now, dirty: false } };
+      });
     }
   }
   return rejected;
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (987 tests in 42 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The device looks at a record and writes it in one step" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: A character that arrives after its items still gets them

The second fault left to settle before edits exist. The device remembers how far it has fetched items as one number. Items fetched for a character the device does not hold yet are left out, and the number moves past them, so when the character arrives a round later it arrives without them. Since Part A a fetch comes a page at a time, so this needs no unlucky timing: a table admin's first fetch, cut short on a weak signal, is enough. The same happens to a character that was deleted on this device and then re-imported on another.

The fix: when a fetched character becomes live on the device, the item fetch starts again from the beginning.

**Files:**
- Modify (test): `apps/web/src/sync/engine.test.ts`
- Modify: `apps/web/src/sync/engine.ts`

**Interfaces:**
- Consumes:
  - `pull` in `apps/web/src/sync/engine.ts` as the task before this one left it, and `AppStorage.updateItem`.
- Produces:
  - `pull` sets the item cursor back to 0 before it stores any fetched character that is not deleted and that the device does not already hold live.
  - An item the device already holds, clean and with the same time stamp, is left alone, so starting again rewrites nothing and reports no change.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/sync/engine.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -284,6 +284,60 @@ describe('fetching', () => {
   });
 });
 
+describe('a character that arrives after its items', () => {
+  it('fetches the items from the beginning when the character arrives a round later', async () => {
+    const server = table();
+    const ann = device(server, ANN);
+    await ann.storage.putCharacter(character('c1'));
+    await ann.storage.putItem(item('c1', 'play', 'state'));
+    await syncOnce(ann);
+    const inner = server.remote({ userId: DEE });
+    let cutShort = true;
+    const dm = {
+      storage: memoryStorage(),
+      remote: { ...inner, pullCharacters: async (after: number) => (cutShort ? [] : inner.pullCharacters(after)) },
+    };
+    // The first fetch is cut short before any character arrives. The items are fetched and left out.
+    expect(await pull(dm)).toEqual(new Set());
+    cutShort = false;
+    expect(await pull(dm)).toEqual(new Set(['c1']));
+    expect((await dm.storage.listItems('c1')).map((i) => [i.kind, i.dirty])).toEqual([['play', false]]);
+  });
+
+  it('fetches the items again when a character deleted on this device comes back', async () => {
+    const server = table();
+    const phone = device(server, ANN);
+    const tablet = device(server, ANN);
+    await phone.storage.putCharacter(character('c1'));
+    await phone.storage.putItem(item('c1', 'edit', 'spell:1'));
+    await syncOnce(phone);
+    await syncOnce(tablet);
+    // Deleted on the tablet and not yet sent: its items are gone from the tablet.
+    await tablet.storage.removeCharacter('c1');
+    await tablet.storage.putCharacter(character('c1', { deleted: true, rawJson: null, updatedAt: T2 }));
+    // Re-imported on the phone later than that.
+    await phone.storage.putCharacter(character('c1', { updatedAt: T3, importedAt: T3 }));
+    await syncOnce(phone);
+    await syncOnce(tablet);
+    expect((await tablet.storage.listCharacters())[0]).toMatchObject({ id: 'c1', deleted: false });
+    expect((await tablet.storage.listItems('c1')).map((i) => i.key)).toEqual(['spell:1']);
+  });
+
+  it('reports no change to a character it already holds when the items are fetched again', async () => {
+    const server = table();
+    const ann = device(server, ANN);
+    const dm = device(server, DEE);
+    await ann.storage.putCharacter(character('c1'));
+    await ann.storage.putItem(item('c1', 'play', 'state'));
+    await syncOnce(ann);
+    await syncOnce(dm);
+    await ann.storage.putCharacter(character('c2', { ddbId: '43' }));
+    await syncOnce(ann);
+    expect(await pull(dm)).toEqual(new Set(['c2']));
+    expect((await dm.storage.listItems('c1'))[0]).toMatchObject({ data: { value: 1 }, dirty: false });
+  });
+});
+
 describe('a change made while a sync is writing', () => {
   it('keeps a change to an item made just before the fetched copy would have replaced it', async () => {
     const server = table();
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/sync/engine.test.ts
```

Expected: FAIL. The item cursor has already passed the character's items, so they are never fetched.

- [ ] **Step 3: Write the implementation**

The cursor goes back before the characters are stored, not after. If the round is cut short between the two, the next round fetches the same characters again, finds them already held, and would not know to go back.

Going back costs one fetch of every item the player may see. For a table admin that is every item at the table, 500 to a page. It happens once for each round in which a new character arrives, which after the first sync means when somebody imports one.

Apply this change to `apps/web/src/sync/engine.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -90,6 +90,13 @@ export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>>
   const changed = new Set<string>();
 
   const characters = await remote.pullCharacters(await cursor(storage, CURSOR_CHARACTERS));
+  if (characters.length > 0) {
+    // A character that becomes live on this device needs every item it has, and the item cursor
+    // may already be past them. The cursor goes back before anything is stored, so that a round
+    // cut short after this point still fetches the items from the beginning.
+    const held = new Set((await storage.listCharacters()).filter((c) => !c.deleted).map((c) => c.id));
+    if (characters.some((row) => !row.deleted && !held.has(row.id))) await storage.setMeta(CURSOR_ITEMS, 0);
+  }
   for (const row of characters) {
     const found = { revived: false };
     // Looked at and written in one step, so a change made on this device in between is not lost.
@@ -127,6 +134,8 @@ export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>>
         changed.add(row.characterId);
         return 'remove';
       }
+      // Already held as fetched: a fetch that starts again from the beginning rewrites nothing.
+      if (mine && !mine.dirty && mine.updatedAt === row.updatedAt) return 'keep';
       if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
       const { rev: _rev, ...rest } = row satisfies RemoteItem;
       return { put: { ...rest, dirty: false } };
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (990 tests in 42 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "A character that arrives after its items still gets them" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: The edit model: what a player can change, and the sheet with it applied

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
  - `normalisePlayItem`, `normaliseTurn` in `packages/rules/src/normalise.ts` (Part A), which this task extends.
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
@@ -268,3 +271,52 @@ export interface PlayState {
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
export * from './features';
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
import { featureGroups, type FeatureGroup } from './features';
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
  /** The Features page, in order. Kept apart from `abilities`: nothing here is used or spent. */
  features: FeatureGroup[];
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
    features: featureGroups(c),
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

Expected: every test passes (1068 tests in 43 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The edit model: what a player can change, and the sheet with it applied" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: The store holds a character's edits and applies them to the sheet

The store loads the open character's edits from its items, keeps the imported sheet and the edited sheet side by side, and gains four actions that change edits. Each action writes one or two items, marked dirty, and the sync engine of Part A carries them to the account with no change of its own. No screen changes in this task.

**Files:**
- Create (test): `apps/web/src/store.edits.test.ts`
- Modify: `apps/web/src/store.ts`

**Interfaces:**
- Consumes:
  - `AbilityEdit`, `CustomAbility`, `CharacterEdits`, `ViewName` from `@cw/model`; `applyEdits`, `emptyEdits`, `isEmptyEdit`, `withGroupOrder`, `normaliseEdit`, `normaliseCustom`, `normaliseOrder` from `@cw/rules` (the task before this one).
  - `StoredItem`, `SyncedKind` and `AppStorage.updateItem` from `apps/web/src/storage` (Task 1); `nextStamp` from `apps/web/src/sync/engine.ts`.
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

  /** Another device, signed in as the DM, that has already changed the test player's character. */
  const dmChanged = async (server: ReturnType<typeof testServer>, characterId: string, abilityKey: string) => {
    const dm = { storage: memoryStorage(), remote: server.remote({ userId: 'user-dm' }) };
    await syncOnce(dm);
    const earlier = new Date(Date.now() - 1000).toISOString();
    await dm.storage.putItem({
      characterId, kind: 'edit', key: abilityKey, data: { tags: ['debuff'] }, updatedAt: earlier, deleted: false, dirty: true,
    });
    await dm.storage.putItem({
      characterId, kind: 'custom', key: 'own:9', data: { name: 'Tatzelwurm Bite', timing: 'action' },
      updatedAt: earlier, deleted: false, dirty: true,
    });
    await syncOnce(dm);
    return dm;
  };

  it('keeps an edit made while a fetch was in flight, shows what else was fetched, and sends the edit', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const inner = testRemote(server);
    let during: (() => void) | null = null;
    const remote = {
      ...inner,
      async pullItems(after: number) {
        const rows = await inner.pullItems(after);
        during?.();
        during = null;
        return rows;
      },
    };
    const record = await seed('vlad', memoryStorage(), remote);
    await state().syncNow();
    const hex = ability('Hex');
    const dm = await dmChanged(server, record.id, hex.key);
    during = () => state().setEdit(hex.key, { timing: 'action' });
    await state().syncNow();
    expect(state().edits.abilities[hex.key]).toEqual({ timing: 'action' });
    // The later change wins the whole item: the DM's earlier change to the same ability is gone.
    expect(ability('Hex').timing).toBe('action');
    expect(ability('Hex').tagSource).not.toBe('user');
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
    await settle();
    await state().syncNow();
    await syncOnce(dm);
    expect((await itemsOf(dm.storage, record.id, 'edit'))[0].data).toEqual({ timing: 'action' });
  });

  it('keeps on screen an edit made while what was fetched was being read back', async () => {
    const server = testServer();
    server.addUser('user-dm', 'Dee', { approved: true, admin: true });
    const storage = memoryStorage();
    const record = await seed('vlad', storage, testRemote(server));
    await state().syncNow();
    const hex = ability('Hex');
    const eldritch = ability('Eldritch Blast');
    await dmChanged(server, record.id, hex.key);
    // The first read of this character's items is the store reading back what was fetched: edit then.
    const listItems = storage.listItems;
    let edited = false;
    storage.listItems = async (characterId?: string) => {
      const rows = await listItems(characterId);
      if (characterId !== undefined && !edited) {
        edited = true;
        state().setEdit(eldritch.key, { hidden: true });
      }
      return rows;
    };
    await state().syncNow();
    storage.listItems = listItems;
    expect(edited).toBe(true);
    expect(state().edits.abilities).toEqual({ [hex.key]: { tags: ['debuff'] }, [eldritch.key]: { hidden: true } });
    expect(names(state().sheet?.hidden ?? [])).toEqual(['Eldritch Blast']);
    expect(ability('Tatzelwurm Bite').source).toBe('custom');
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

**Edits and syncing.** Every edit is written through `updateItem` as it is made, and the write is started before the action returns. The device's copy of the edits is therefore the newest there is: a fetched edit replaces one only when it is later (Task 1). So after a round with the account the store reads the edits back from the device, and does not try to merge what it holds in memory. One guard is needed: if the player makes an edit while that read is running, the read is made again, or its older answer would replace the edit on screen. `localEdits` counts edits for this, as `localChanges` counts changes to what is spent.

`loadSaved` replaces `loadPlay`. It rejects when the device's copy cannot be read, as `loadPlay` did. A character whose saved state cannot be read does not open, and what is on screen is not replaced after a sync. Both rules are from the Part A reviews and their tests still pass unchanged.

A character that is not open is clamped on re-import to its sheet with its edits applied, so an edited maximum is the one that counts.

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
@@ -93,6 +111,8 @@ let remote: Remote | null = null;
 let scheduler: Scheduler | null = null;
 /** Counts local changes to play state, so a fetch can tell that one happened while it was running. */
 let localChanges = 0;
+/** Counts local changes to edits, so a read of them can tell that one happened while it was running. */
+let localEdits = 0;
 
 /** One sheet per character: a re-import replaces it and a delete drops it. */
 const sheetCache = new Map<string, { importedAt: string; sheet: Sheet }>();
@@ -127,14 +147,42 @@ function sessionFrom(value: unknown): Session | null {
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
+/**
+ * A character's saved play state and edits. Empty when nothing is saved. Rejects when what is
+ * saved cannot be read, so that nobody mistakes an unreadable state for an empty one.
+ */
+async function loadSaved(id: string): Promise<{ play: PlayState; edits: CharacterEdits }> {
+  const items = await storage.listItems(id);
+  return { play: playFrom(items), edits: editsFrom(items) };
+}
+
 /**
  * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
  * An item is written only when it differs from `previous`, so flipping a pill does not touch the
@@ -171,6 +219,8 @@ function newId(): string {
 const closed = {
   openId: null as string | null,
   sheet: null as Sheet | null,
+  baseSheet: null as Sheet | null,
+  edits: emptyEdits(),
   play: emptyPlayState(),
   loaded: false,
   undo: null as Undo | null,
@@ -215,6 +265,32 @@ export const useStore = create<AppStore>()((set, get) => {
     });
   };
 
+  /**
+   * Stores one item of the open character's edits, or marks it deleted when `data` is null, then
+   * rebuilds the sheet from the edits as they now stand. What was spent is clamped to the new
+   * sheet, because an edit can lower a maximum or remove a pool. Every write is started before
+   * this returns, each stamped and written in one step, so a read made afterwards sees them.
+   */
+  const changeEdits = (next: CharacterEdits, writes: { kind: SyncedKind; key: string; data: unknown }[]): void => {
+    const { openId, baseSheet, play, loaded } = get();
+    if (openId === null || baseSheet === null || !loaded) return;
+    const sheet = applyEdits(baseSheet, next);
+    const clamped = clampState(play, sheet);
+    const playChanged = !same(playItem(clamped), playItem(play));
+    localEdits += 1;
+    if (playChanged) localChanges += 1;
+    set({ edits: next, sheet, play: playChanged ? clamped : play, undo: playChanged ? null : get().undo });
+    const started: Promise<unknown>[] = writes.map((write) =>
+      storage.updateItem(openId, write.kind, write.key, (current) => ({
+        put: {
+          characterId: openId, kind: write.kind, key: write.key, data: write.data,
+          updatedAt: nextStamp(current?.updatedAt), deleted: write.data === null, dirty: true,
+        },
+      })));
+    if (playChanged) started.push(savePlay(openId, clamped, play));
+    void save(Promise.all(started)).then(() => changedLocally());
+  };
+
   /**
    * After a round with the account: show what the device now holds. `changed` are the characters
    * a fetch altered; `sent` is true when characters were waiting to be sent, whose records are
@@ -233,38 +309,44 @@ export const useStore = create<AppStore>()((set, get) => {
       set({ ...closed });
       return;
     }
-    let sheet: Sheet;
+    let baseSheet: Sheet;
     try {
-      sheet = sheetFor(character);
+      baseSheet = sheetFor(character);
     } catch {
       // What was fetched cannot be turned into a sheet (a record damaged in the account, say).
       sheetCache.delete(openId);
       set({ ...closed });
       return;
     }
-    /** What is on screen is the newest copy: it is written again, stamped later than what was fetched, and sent. */
-    const keepScreen = async (): Promise<void> => {
+    // The device's copy of the edits is the newest: every edit made here is written as it is
+    // made, and a fetched edit replaces one only when it is later. So the edits are read back,
+    // and read again if the player made one during the read.
+    let saved: { play: PlayState; edits: CharacterEdits };
+    let editsSeen: number;
+    do {
+      editsSeen = localEdits;
+      try {
+        saved = await loadSaved(openId);
+      } catch {
+        // What was fetched could not be read back: what is on screen stays, and is not replaced by nothing.
+        set({ persistent: false });
+        return;
+      }
       if (get().openId !== openId) return;
+    } while (editsSeen !== localEdits);
+    const sheet = applyEdits(baseSheet, saved.edits);
+    if (localChanges !== changesBefore) {
+      // The player changed what is spent while the fetch was running, or while its result was
+      // being read back. What is on screen is the newest copy: it is written again, stamped later
+      // than what was fetched, and sent.
       const kept = clampState(get().play, sheet);
-      set({ sheet, play: kept });
+      set({ baseSheet, sheet, edits: saved.edits, play: kept });
       await save(savePlay(openId, kept, null));
       changedLocally();
-    };
-    // The player changed what is spent while the fetch was running.
-    if (localChanges !== changesBefore) return keepScreen();
-    let saved: PlayState;
-    try {
-      saved = await loadPlay(openId);
-    } catch {
-      // What was fetched could not be read back: what is on screen stays, and is not replaced by nothing.
-      set({ persistent: false });
       return;
     }
-    if (get().openId !== openId) return;
-    // Or changed it while the fetched state was being read back.
-    if (localChanges !== changesBefore) return keepScreen();
     // The turn never syncs, so the one in memory is the newest.
-    set({ sheet, play: { ...clampState(saved, sheet), turn: get().play.turn }, undo: null });
+    set({ baseSheet, sheet, edits: saved.edits, play: { ...clampState(saved.play, sheet), turn: get().play.turn }, undo: null });
   };
 
   /** No longer a table admin: the other players' characters leave this device. */
@@ -358,6 +440,7 @@ export const useStore = create<AppStore>()((set, get) => {
     }
     sheetCache.clear();
     localChanges = 0;
+    localEdits = 0;
     scheduler = createScheduler(runSync);
     userChanges = Promise.resolve();
     // Ready now: a signed-in device opens from its own copy without waiting for the account.
@@ -469,15 +552,20 @@ export const useStore = create<AppStore>()((set, get) => {
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
+          // Clamped to the new sheet with its edits: an edited maximum is the one that counts.
+          const saved = await loadSaved(record.id).catch(() => null);
+          if (saved) {
+            const sheet = applyEdits(sheetFor(record), saved.edits);
+            await save(savePlay(record.id, clampState(saved.play, sheet), saved.play));
+          }
         }
       }
       changedLocally();
@@ -509,18 +597,18 @@ export const useStore = create<AppStore>()((set, get) => {
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
-      let saved: PlayState;
+      set({ ...closed, openId: id, sheet: baseSheet, baseSheet });
+      let saved: { play: PlayState; edits: CharacterEdits };
       try {
-        saved = await loadPlay(id);
+        saved = await loadSaved(id);
       } catch {
         // What is saved could not be read. Opening with an empty state would let the next change
         // overwrite it, here and in the account, so the character stays closed.
@@ -528,7 +616,9 @@ export const useStore = create<AppStore>()((set, get) => {
         return;
       }
       // Ignore the answer if the player has already moved to another character.
-      if (get().openId === id) set({ play: clampState(saved, sheet), loaded: true });
+      if (get().openId !== id) return;
+      const sheet = applyEdits(baseSheet, saved.edits);
+      set({ sheet, edits: saved.edits, play: clampState(saved.play, sheet), loaded: true });
     },
 
     use(ability, mode, slot) {
@@ -571,5 +661,42 @@ export const useStore = create<AppStore>()((set, get) => {
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

Expected: every test passes (1092 tests in 44 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The store holds a character's edits and applies them to the sheet" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: A dialog component, an Edit button on every row, and names that tell twins apart

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

Expected: every test passes (1116 tests in 45 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "A dialog component, an Edit button on every row, and names that tell twins apart" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: The ability editor

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

Expected: every test passes (1146 tests in 46 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "The ability editor: timing, uses, tags, views, roll, hide and back to imported" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: Edit list: arrange rows by drag or by button, hide and restore

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

Expected: every test passes (1165 tests in 47 files) and the type check prints no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Edit list: arrange rows by drag or by button, hide and restore" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: Custom abilities: add, edit and delete

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

Expected: every test passes (1186 tests in 48 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Custom abilities: add, edit and delete" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 9: An option's key names the feature it is attached to

Edits are stored by key from this plan on, and features take edits two tasks from now. One feature key was not yet safe to store under: the same option chosen under two features (findings file, "The Features page"). Both entries had the same IDs, the second got `#2`, and which one that was depended on the order of the sheet's list.

An option's key now ends with the IDs of the entry it is attached to, so the two are told apart by what they belong to. Nothing has been stored under a feature key yet, so no stored edit moves.

**Files:**
- Modify: `packages/ddb-import/src/features.ts`
- Modify (test): `packages/ddb-import/test/features.test.ts`
- Modify: `packages/model/src/index.ts`

**Interfaces:**
- Consumes:
  - `convertFeatures` in `packages/ddb-import/src/features.ts` (the Features page).
- Produces:
  - A feature key for an option has the form `feature:{entityTypeId}:{id}@{entityTypeId}:{id}`: the option's own IDs, then the IDs of the component the sheet attaches it to, whether or not that component is a listed feature. Every other feature key is unchanged.
  - The `#2` rule still applies where one feature lists the same option twice.

- [ ] **Step 1: Write the failing tests**

Apply this change to `packages/ddb-import/test/features.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -131,7 +131,8 @@ describe('features from the fixtures', () => {
     const parents = new Set(features.filter((f) => f.parentKey === null).map((f) => f.key));
     const classLevel = character.classes[0].level;
     for (const f of features) {
-      expect(f.key).toMatch(/^feature:\d+:\d+$/);
+      expect(f.key).toMatch(f.parentKey === null ? /^feature:\d+:\d+$/ : /^feature:\d+:\d+@\d+:\d+$/);
+      if (f.parentKey !== null) expect(`feature:${f.key.split('@')[1]}`).toBe(f.parentKey);
       expect(f.name).not.toBe('');
       for (const key of f.playKeys) expect(rows.has(key)).toBe(true);
       if (f.parentKey !== null) expect(parents.has(f.parentKey)).toBe(true);
@@ -304,7 +305,37 @@ describe('features from a sheet no fixture has', () => {
     expect(features.map((f) => [f.key, f.parentKey, f.playKeys])).toEqual([
       ['feature:5:1', null, ['action:1:1']],
       ['feature:5:1#2', null, ['action:1:1']],
-      ['feature:2:8', 'feature:5:1', []],
+      ['feature:2:8@5:1', 'feature:5:1', []],
+    ]);
+  });
+
+  it('gives the same option under two features two keys that do not depend on the sheet\'s order', () => {
+    const under = (parent: number) => ({ componentTypeId: 5, componentId: parent, definition: { id: 8, entityTypeId: 2, name: 'Choice' } });
+    const feats = [
+      { definition: { id: 1, entityTypeId: 5, name: 'First' } },
+      { definition: { id: 2, entityTypeId: 5, name: 'Second' } },
+    ];
+    const keys = (options: unknown[]) =>
+      convertFeatures({ feats, options: { feat: options } }, noLinks)
+        .filter((f) => f.parentKey !== null)
+        .map((f) => [f.parentKey, f.key])
+        .sort();
+    const expected = [['feature:5:1', 'feature:2:8@5:1'], ['feature:5:2', 'feature:2:8@5:2']];
+    expect(keys([under(1), under(2)])).toEqual(expected);
+    expect(keys([under(2), under(1)])).toEqual(expected);
+  });
+
+  it('numbers an option that one feature lists twice, and names the parent of one that is not listed', () => {
+    const option = (parent: number) => ({ componentTypeId: 5, componentId: parent, definition: { id: 8, entityTypeId: 2, name: 'Choice' } });
+    const features = convertFeatures({
+      feats: [{ definition: { id: 1, entityTypeId: 5, name: 'First' } }],
+      options: { feat: [option(1), option(1), option(77)] },
+    }, noLinks);
+    expect(features.map((f) => [f.key, f.parentKey])).toEqual([
+      ['feature:5:1', null],
+      ['feature:2:8@5:1', 'feature:5:1'],
+      ['feature:2:8@5:1#2', 'feature:5:1'],
+      ['feature:2:8@5:77', null],
     ]);
   });
 
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run packages/ddb-import/test/features.test.ts
```

Expected: FAIL. The option's key has no `@` part, and the same option under two features gets `#2` by its position.

- [ ] **Step 3: Write the implementation**

The parent's IDs come from the option's own `componentTypeId` and `componentId`, which is also how its parent is found. An option that names no component keeps a key with no `@` part.

Apply this change to `packages/ddb-import/src/features.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -31,10 +31,13 @@ function draft(def: Raw, place: Place, description: string, parentRef: string |
   const name = str(def.name).trim();
   if (name === '') return null;
   const ref = componentRef(def.entityTypeId, def.id);
+  // Without an ID the key comes from what the entry is, so it survives a reordered sheet.
+  const own = ref ?? `anon-${textHash(`${place.origin}|${name}`)}`;
   return {
     feature: {
-      // Without an ID the key comes from what the entry is, so it survives a reordered sheet.
-      key: `feature:${ref ?? `anon-${textHash(`${place.origin}|${name}`)}`}`,
+      // An option's key also names what it is attached to: the same option chosen under two
+      // features is two entries, and which is which must not depend on the sheet's order.
+      key: `feature:${own}${option && parentRef !== null ? `@${parentRef}` : ''}`,
       name,
       ...place,
       parentKey: null,
```

Apply this change to `packages/model/src/index.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -177,7 +177,8 @@ export interface SkillCustom {
 export interface Feature {
   /**
    * `feature:{entityTypeId}:{id}`. Stable across re-imports. A feature with no ID has a key of the
-   * form `feature:anon-{hash}`; a second feature with the same key gets `#2` added.
+   * form `feature:anon-{hash}`. An option's key ends `@{entityTypeId}:{id}` of the entry it is
+   * attached to. A second feature with the same key gets `#2` added.
    */
   key: string;
   name: string;
```

- [ ] **Step 4: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (1188 tests in 48 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "An option's key names the feature it is attached to" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 10: An "Always on" group for passive rows

Until now a passive ability shared the "No action needed" group with abilities such as Action Surge. Features ticked into Combat start as passive (the task after this one), and a list of reminders does not belong among things the player chooses to do. Spec section 10.1 gives passive rows a group of their own, "Always on": folded, and shown only when it has something in it.

**Files:**
- Modify (test): `apps/web/src/views/CombatView.test.tsx`
- Modify: `apps/web/src/views/CombatView.tsx`
- Modify: `apps/web/src/views/EditList.tsx`
- Modify: `packages/rules/src/views.ts`
- Modify (test): `packages/rules/test/views.test.ts`

**Interfaces:**
- Consumes:
  - `combatGroups`, `CombatGroups` in `packages/rules/src/views.ts`; `CombatView` and `EditList` in `apps/web/src/views`.
  - Store: `setEdit` (Task 4), used by the test to make an ability passive.
- Produces:
  - `CombatGroups` gains `passive: Ability[]`. `free` now holds timing `free` only.
  - The Combat view shows "Always on (n)" after "No action needed", and its Edit list has an "Always on" section.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/views/CombatView.test.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,11 +1,11 @@
-import { render, screen, within } from '@testing-library/react';
+import { act, render, screen, within } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { describe, expect, it } from 'vitest';
 import type { Slug } from '../../../../test-utils/fixtures';
 import { CharacterScreen } from '../screens/Character';
 import { memoryStorage } from '../storage';
 import { useStore } from '../store';
-import { seed, testRemote } from '../test/helpers';
+import { ability, seed, testRemote } from '../test/helpers';
 
 async function openCombat(slug: Slug) {
   const record = await seed(slug);
@@ -33,6 +33,18 @@ describe('Combat view', () => {
     expect(screen.queryByRole('region', { name: 'Other' })).toBeNull();
   });
 
+  it('lists passive abilities under "Always on", with no Use button on one that costs nothing', async () => {
+    await openCombat('vlad');
+    expect(screen.queryByText(/^Always on/)).toBeNull();
+    act(() => useStore.getState().setEdit(ability('Unarmed Strike').key, { timing: 'passive' }));
+    await userEvent.click(await screen.findByText('Always on (1)'));
+    expect(within(row('Unarmed Strike')).queryByRole('button', { name: 'Use Unarmed Strike' })).toBeNull();
+    expect(screen.getByText('No action needed (7)')).toBeInTheDocument();
+    await userEvent.click(screen.getByRole('button', { name: 'Edit list' }));
+    const section = screen.getByRole('region', { name: 'Always on' });
+    expect(within(section).getByRole('button', { name: 'Hide Unarmed Strike' })).toBeInTheDocument();
+  });
+
   it('uses an ability: spends the pill and the slot, shows concentration and offers undo', async () => {
     await openCombat('vlad');
     expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
```

Replace the whole of `packages/rules/test/views.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { applyEdits, buildSheet, combatGroups, emptyEdits, exploreAbilities } from '../src/index';
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

  it('keeps passive abilities apart from the ones that need no action', () => {
    const base = sheetOf('vlad');
    const hex = base.abilities.find((a) => a.name === 'Hex');
    if (!hex) throw new Error('no Hex');
    const before = combatGroups(base);
    const edits = { ...emptyEdits(), abilities: { [hex.key]: { timing: 'passive' as const } } };
    const after = combatGroups(applyEdits(base, edits));
    expect(after.passive.map((a) => a.name)).toEqual([...before.passive.map((a) => a.name), 'Hex']);
    expect(after.free).toEqual(before.free);
    expect(after.bonus.map((a) => a.name)).not.toContain('Hex');
  });

  it.each(SLUGS)('lists only free abilities under "No action needed" and only passive ones under "Always on": %s', (slug) => {
    const groups = combatGroups(sheetOf(slug));
    expect(groups.free.every((a) => a.timing === 'free')).toBe(true);
    expect(groups.passive.every((a) => a.timing === 'passive')).toBe(true);
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
pnpm exec vitest run apps/web/src/views/CombatView.test.tsx packages/rules/test/views.test.ts
```

Expected: FAIL. `combatGroups` has no `passive` group, and the Combat view has no "Always on".

- [ ] **Step 3: Write the implementation**

A passive row that costs nothing and needs no concentration already has no Use button: `availability` gives a row one only when it has a timing to spend, a cost, or concentration. The new test checks that this holds for a row in the new group.

Apply this change to `apps/web/src/views/CombatView.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -84,6 +84,7 @@ export function CombatView({ sheet }: { sheet: Sheet }) {
       </Group>
       {groups.other.length > 0 ? <Group title="Other">{rows(groups.other)}</Group> : null}
       {groups.free.length > 0 ? <Folded title="No action needed" count={groups.free.length}>{rows(groups.free)}</Folded> : null}
+      {groups.passive.length > 0 ? <Folded title="Always on" count={groups.passive.length}>{rows(groups.passive)}</Folded> : null}
       {groups.universal.length > 0 ? <Folded title="Anyone can do this">{rows(groups.universal)}</Folded> : null}
       <Folded title="Keep in mind" count={sheet.notes.length}>
         <NotesList notes={sheet.notes} empty="No conditional notes on this sheet." />
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
  { group: 'passive', title: 'Always on' },
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

Replace the whole of `packages/rules/src/views.ts` with:

```ts
import type { Ability } from '@cw/model';
import { sortByOrder, viewsOf } from './edits';
import type { Sheet } from './sheet';

export interface CombatGroups {
  action: Ability[];
  bonus: Ability[];
  reaction: Ability[];
  /** "No action needed": timing free. */
  free: Ability[];
  /** "Always on": timing passive. Reminders, kept apart from what the player chooses to do. */
  passive: Ability[];
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
  const groups: CombatGroups = { action: [], bonus: [], reaction: [], free: [], passive: [], other: [], universal: [] };
  for (const a of sheet.abilities) {
    if (!viewsOf(sheet, a).combat) continue;
    if (a.timing === 'action' || a.timing === 'bonus' || a.timing === 'reaction') groups[a.timing].push(a);
    else if (a.timing === 'free' || a.timing === 'passive') groups[a.timing].push(a);
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

Expected: every test passes (1198 tests in 48 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "An \"Always on\" group for passive rows" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 11: Features take edits: hide, order, and a row in the views the player ticks

A feature's key is used exactly as an ability key is: an `AbilityEdit` is stored under it (spec section 5.5, "From Part B, features take edits"). This task makes the edit layer and the store honour that. A feature can be hidden and put in order, and a feature with no ability of its own becomes a row in each view the player ticks it into. No screen changes: the Features page keeps drawing `sheet.features`, which now follows the edits.

**Files:**
- Modify (test): `apps/web/src/store.edits.test.ts`
- Modify: `apps/web/src/store.ts`
- Modify: `packages/model/src/index.ts`
- Modify: `packages/rules/src/edits.ts`
- Modify: `packages/rules/src/features.ts`
- Modify: `packages/rules/src/normalise.ts`
- Create: `packages/rules/src/order.ts`
- Modify: `packages/rules/src/sheet.ts`
- Modify (test): `packages/rules/test/edits.test.ts`
- Create (test): `packages/rules/test/feature-edits.test.ts`
- Modify (test): `packages/rules/test/features.test.ts`
- Modify (test): `packages/rules/test/normalise.test.ts`

**Interfaces:**
- Consumes:
  - `applyEdits`, `defaultViews`, `editForm`, `diffEdit`, `sortByOrder`, `withGroupOrder` in `packages/rules/src/edits.ts` (Task 3); `featureGroups` in `packages/rules/src/features.ts` (the Features page).
  - Store: `editsFrom`, `setOrder` (Task 4).
- Produces:
  - `@cw/model`: `OrderName = ViewName | 'features'`. `CharacterEdits.order` is `Record<OrderName, string[]>`.
  - `@cw/rules`, features: `FeatureSource = { list: Feature[]; headings: Record<string, string> }`, `featureSource(c)`, `hiddenOnSheet(list): Set<string>`, `arrangeFeatures(source, hidden: ReadonlySet<string>, order?: string[]): FeatureGroup[]`, `isFeatureKey(key)`, `featureAbility(feature): Ability`. `featureGroups(c)` is unchanged for its callers.
  - `@cw/rules`, edits: `hiddenByDefault(sheet, key): boolean`, `withHidden(edit, hidden, byDefault): AbilityEdit`. `defaultViews` answers "neither view" for a feature key. `sortByOrder` and `withGroupOrder` move to `packages/rules/src/order.ts` and are still exported from the same place.
  - `Sheet` gains `featureSource`, `hiddenFeatures: Feature[]`, `featureRows: Record<string, Ability>` and `unshownResources: Resource[]`. `sheet.layout.order` gains `features`.
  - `normaliseEdit` keeps `hidden: false`.
  - Store: `setOrder` takes an `OrderName`; `editsFrom` reads an `order` item whose key is `features`.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/src/store.edits.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -179,6 +179,35 @@ describe('order', () => {
     expect(await itemsOf(storage, record.id, 'order')).toMatchObject([{ key: 'combat', data: reversed, dirty: true }]);
   });
 
+  it('records the order of a group of the Features page, and takes edits under a feature\'s key', async () => {
+    const storage = memoryStorage();
+    const record = await seed('vlad', storage);
+    const key = (name: string): string => {
+      const found = state().sheet?.featureSource.list.find((f) => f.name === name);
+      if (!found) throw new Error(`no feature ${name}`);
+      return found.key;
+    };
+    const feats = (): string[] => names((state().sheet?.features.find((g) => g.heading === 'Feats')?.items ?? []).map((i) => i.feature));
+    state().setOrder('features', [key('Lucky'), key('Alert')]);
+    expect(feats().slice(0, 2)).toEqual(['Lucky', 'Alert']);
+    expect(state().sheet?.layout.order).toEqual({ combat: [], explore: [], features: [key('Lucky'), key('Alert')] });
+    state().setEdit(key('Alert'), { inCombat: true });
+    expect(ability('Alert')).toMatchObject({ key: key('Alert'), timing: 'passive', source: 'feat' });
+    state().setEdit(key('Languages'), { hidden: false });
+    expect(names(state().sheet?.hiddenFeatures ?? [])).toEqual(['Eldritch Invocation Options']);
+    state().setEdit(key('Lucky'), { hidden: true });
+    expect(feats()).not.toContain('Lucky');
+    await settle();
+    expect(await itemsOf(storage, record.id, 'order')).toMatchObject([
+      { key: 'features', data: [key('Lucky'), key('Alert')], dirty: true },
+    ]);
+    // What is stored reads back as what is on screen.
+    expect(editsFrom(await storage.listItems(record.id))).toEqual(state().edits);
+    expect(state().edits.abilities).toEqual({
+      [key('Alert')]: { inCombat: true }, [key('Languages')]: { hidden: false }, [key('Lucky')]: { hidden: true },
+    });
+  });
+
   it('keeps one group\'s order when another group is arranged', async () => {
     await seed('vlad');
     state().setOrder('combat', ['b', 'a']);
@@ -251,7 +280,7 @@ describe('stored edits', () => {
         { key: 'own:1', name: 'Howl', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
         { key: 'own:2', name: 'Zeal', timing: 'unknown', roll: { kind: 'none' }, cost: { kind: 'none' }, tags: [], concentration: false, description: '' },
       ],
-      order: { combat: ['a', 'b'], explore: ['c'] },
+      order: { combat: ['a', 'b'], explore: ['c'], features: [] },
     });
   });
 
@@ -263,7 +292,7 @@ describe('stored edits', () => {
       stored('custom', 'own:1', { timing: 'action' }),
       stored('order', 'sideways', ['a']),
       stored('order', 'combat', 'a,b'),
-    ])).toEqual({ abilities: {}, custom: [], order: { combat: [], explore: [] } });
+    ])).toEqual({ abilities: {}, custom: [], order: { combat: [], explore: [], features: [] } });
   });
 });
 
```

Apply this change to `packages/rules/test/edits.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -31,7 +31,7 @@ describe('a sheet with no edits', () => {
     const sheet = sheetOf('vlad');
     expect(sheet.hidden).toEqual([]);
     expect(sheet.edited).toEqual([]);
-    expect(sheet.layout).toEqual({ order: { combat: [], explore: [] }, show: {} });
+    expect(sheet.layout).toEqual({ order: { combat: [], explore: [], features: [] }, show: {} });
   });
 
   it('comes back from applyEdits with the same abilities, resources and universal actions', () => {
@@ -52,7 +52,7 @@ describe('applyEdits: one ability', () => {
     applyEdits(sheet, edits({
       abilities: { [hex.key]: { timing: 'action', tags: ['control'], uses: { max: 2, reset: 'long' }, hidden: true } },
       custom: [custom({ cost: { kind: 'uses', max: 1, reset: 'short' } })],
-      order: { combat: [hex.key], explore: [] },
+      order: { combat: [hex.key], explore: [], features: [] },
     }));
     expect(JSON.stringify(sheet)).toBe(before);
   });
@@ -311,7 +311,7 @@ describe('order', () => {
     const sheet = sheetOf('vlad');
     const actions = combatGroups(sheet).action;
     const reversed = [...actions].reverse().map((a) => a.key);
-    const edited = applyEdits(sheet, edits({ order: { combat: reversed, explore: [] } }));
+    const edited = applyEdits(sheet, edits({ order: { combat: reversed, explore: [], features: [] } }));
     expect(combatGroups(edited).action.map((a) => a.key)).toEqual(reversed);
     expect(exploreAbilities(edited).map((a) => a.key)).toEqual(exploreAbilities(sheet).map((a) => a.key));
   });
@@ -319,14 +319,14 @@ describe('order', () => {
   it('puts an ability the order does not mention at the end of its group', () => {
     const sheet = sheetOf('vlad');
     const [first, second, ...rest] = combatGroups(sheet).action;
-    const edited = applyEdits(sheet, edits({ order: { combat: [second.key, first.key], explore: [] } }));
+    const edited = applyEdits(sheet, edits({ order: { combat: [second.key, first.key], explore: [], features: [] } }));
     expect(combatGroups(edited).action.map((a) => a.key)).toEqual([second.key, first.key, ...rest.map((a) => a.key)]);
   });
 
   it('orders the universal group too', () => {
     const sheet = sheetOf('vlad');
     const dodge = named(sheet, 'Dodge');
-    const edited = applyEdits(sheet, edits({ order: { combat: [dodge.key], explore: [] } }));
+    const edited = applyEdits(sheet, edits({ order: { combat: [dodge.key], explore: [], features: [] } }));
     expect(combatGroups(edited).universal[0].name).toBe('Dodge');
   });
 });
```

Create `packages/rules/test/feature-edits.test.ts`:

```ts
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, AbilityEdit, CharacterEdits, Feature } from '@cw/model';
import { describe, expect, it } from 'vitest';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';
import {
  applyEdits, defaultViews, diffEdit, editForm, emptyEdits, hiddenByDefault, viewsOf, withHidden,
} from '../src/edits';
import { featureAbility, featureGroups, isFeatureKey } from '../src/features';
import { applyUse, availability, emptyPlayState, pools } from '../src/play';
import { buildSheet, type Sheet } from '../src/sheet';
import { combatGroups, exploreAbilities } from '../src/views';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));
const feature = (sheet: Sheet, name: string): Feature => {
  const found = sheet.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found;
};
/** The sheet with these edits, each given by the feature's or ability's name. */
function edited(sheet: Sheet, byName: Record<string, AbilityEdit>, order: string[] = []): Sheet {
  const abilities: CharacterEdits['abilities'] = {};
  for (const [name, edit] of Object.entries(byName)) {
    const key = sheet.featureSource.list.find((f) => f.name === name)?.key ?? sheet.abilities.find((a) => a.name === name)?.key;
    if (key === undefined) throw new Error(`nothing called ${name}`);
    abilities[key] = edit;
  }
  return applyEdits(sheet, { ...emptyEdits(), abilities, order: { combat: [], explore: [], features: order } });
}
const names = (list: { name: string }[]): string[] => list.map((x) => x.name);
/** The rows of one group of the Features page; an option is written "parent > option". */
const group = (sheet: Sheet, heading: string): string[] =>
  (sheet.features.find((g) => g.heading === heading)?.items ?? []).flatMap((item) => [
    item.feature.name, ...item.options.map((o) => `${item.feature.name} > ${o.name}`),
  ]);

describe('a sheet with no edits', () => {
  it.each(SLUGS)('shows the Features page as before and puts no feature in play: %s', (slug) => {
    const character = convertCharacter(loadRaw(slug));
    const sheet = buildSheet(character);
    expect(sheet.features).toEqual(featureGroups(character));
    expect(sheet.featureSource.list).toEqual(character.features);
    expect(sheet.hiddenFeatures).toEqual(character.features.filter((f) => f.hiddenOnSheet));
    expect(Object.keys(sheet.featureRows)).toEqual(character.features.filter((f) => f.playKeys.length === 0).map((f) => f.key));
    expect(sheet.abilities.some((a) => isFeatureKey(a.key))).toBe(false);
    expect(sheet.unshownResources).toEqual([]);
    expect(sheet.layout.order.features).toEqual([]);
    const same = applyEdits(sheet, emptyEdits());
    expect(same.features).toEqual(sheet.features);
    expect(same.hiddenFeatures).toEqual(sheet.hiddenFeatures);
    expect(same.abilities).toEqual(sheet.abilities);
    expect(same.resources).toEqual(sheet.resources);
  });

  it('never lists a feature in a view unasked, whatever its timing and tags', () => {
    expect(defaultViews({ key: 'feature:1:2', timing: 'action', ritual: true, tags: ['utility'] })).toEqual({ combat: false, explore: false });
    expect(defaultViews({ key: 'action:1:2', timing: 'action', ritual: false, tags: ['utility'] })).toEqual({ combat: true, explore: true });
    expect(defaultViews({ timing: 'action', ritual: false, tags: [] })).toEqual({ combat: true, explore: false });
  });
});

describe('a feature as a row', () => {
  it('is a passive reminder with the feature\'s key, name and description, and nothing to roll or spend', () => {
    const sheet = sheetOf('vlad');
    const alert = feature(sheet, 'Alert');
    expect(featureAbility(alert)).toEqual({
      key: alert.key, name: 'Alert', source: 'feat', timing: 'passive', roll: { kind: 'none' }, cost: { kind: 'none' },
      poolKey: null, tags: [], concentration: false, ritual: false, range: null, area: false,
      description: alert.description, notes: [], tagSource: 'none',
    });
    expect(availability(featureAbility(alert), sheet, emptyPlayState()).hasUse).toBe(false);
  });

  it('takes its source from where the feature comes from, and a subclass feature counts as the class\'s', () => {
    const sheet = sheetOf('vlad');
    const source = (name: string): Ability['source'] => featureAbility(feature(sheet, name)).source;
    expect([source('Pact Magic'), source('The Cost'), source('Alert'), source('Size')]).toEqual(['class', 'class', 'feat', 'species']);
    expect(featureAbility({ ...feature(sheet, 'Size'), origin: 'background' }).source).toBe('background');
  });

  it('tells a feature key from an ability key', () => {
    const sheet = sheetOf('vlad');
    expect(sheet.featureSource.list.every((f) => isFeatureKey(f.key))).toBe(true);
    expect([...sheet.abilities, ...sheet.universal].some((a) => isFeatureKey(a.key))).toBe(false);
    expect(isFeatureKey('own:1')).toBe(false);
  });
});

describe('ticking a feature into a view', () => {
  it('lists it under "Always on" in Combat, not in Explore, and does not call it edited', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true } });
    const alert = feature(base, 'Alert');
    expect(names(combatGroups(sheet).passive)).toEqual([...names(combatGroups(base).passive), 'Alert']);
    expect(names(exploreAbilities(sheet))).toEqual(names(exploreAbilities(base)));
    expect(sheet.abilities[sheet.abilities.length - 1]).toEqual(featureAbility(alert));
    expect(sheet.edited).toEqual([]);
    expect(viewsOf(sheet, featureAbility(alert))).toEqual({ combat: true, explore: false });
    // The Features page is unchanged: the feature is still listed there.
    expect(sheet.features).toEqual(base.features);
  });

  it('lists it in Explore alone when only that box is ticked', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inExplore: true } });
    expect(names(exploreAbilities(sheet))).toEqual([...names(exploreAbilities(base)), 'Alert']);
    expect(names(combatGroups(sheet).passive)).toEqual(names(combatGroups(base).passive));
  });

  it('applies timing, tags and roll to the row, and then calls it edited', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, {
      Alert: { inCombat: true, timing: 'reaction', tags: ['defence'], roll: { kind: 'dice', dice: '1d4' } },
    });
    const row = combatGroups(sheet).reaction.find((a) => a.name === 'Alert');
    expect(row).toMatchObject({ timing: 'reaction', tags: ['defence'], tagSource: 'user', roll: { kind: 'dice', dice: '1d4' } });
    expect(sheet.edited).toEqual([feature(base, 'Alert').key]);
  });

  it('does not tick a box because of a timing or a tag', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { timing: 'long', tags: ['utility'] } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(names(exploreAbilities(sheet))).toEqual(names(exploreAbilities(base)));
    expect(sheet.featureRows[feature(base, 'Alert').key]).toMatchObject({ timing: 'long', tags: ['utility'] });
  });

  it('gives a ticked feature a pool of its own when it has limited uses, and Use spends from it', () => {
    const base = sheetOf('vlad');
    const key = feature(base, 'Alert').key;
    const sheet = edited(base, { Alert: { inCombat: true, uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources.find((r) => r.key === key)).toEqual({ key, name: 'Alert', max: 2, reset: 'long' });
    const row = sheet.abilities.find((a) => a.key === key);
    if (!row) throw new Error('no row');
    expect(row.cost).toEqual({ kind: 'uses', resourceKey: key });
    const after = applyUse(row, sheet, emptyPlayState());
    expect(after.spent).toEqual({ [key]: 1 });
    expect(pools(sheet).some((p) => p.key === key)).toBe(true);
  });

  it('shows no chip for the pool of a feature that is in neither view, and still gives the editor its uses', () => {
    const base = sheetOf('vlad');
    const key = feature(base, 'Alert').key;
    const sheet = edited(base, { Alert: { uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources).toEqual(base.resources);
    expect(sheet.unshownResources).toEqual([{ key, name: 'Alert', max: 2, reset: 'long' }]);
    expect(editForm(sheet, sheet.featureRows[key])).toMatchObject({ uses: { max: 2, reset: 'long' }, inCombat: false, inExplore: false });
  });

  it('adds no row for a feature that already has an ability, whatever its edit says', () => {
    const base = sheetOf('vlad');
    const lucky = feature(base, 'Lucky');
    expect(lucky.playKeys.length).toBeGreaterThan(0);
    const sheet = edited(base, { Lucky: { inCombat: true, inExplore: true, timing: 'action' } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(sheet.featureRows[lucky.key]).toBeUndefined();
    expect(sheet.edited).toEqual([]);
  });
});

describe('hiding a feature', () => {
  it('takes it off the Features page and lists it as hidden, and leaves its abilities alone', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Lucky: { hidden: true } });
    expect(group(sheet, 'Feats')).not.toContain('Lucky');
    expect(names(sheet.hiddenFeatures)).toEqual(['Eldritch Invocation Options', 'Lucky', 'Languages']);
    expect(sheet.abilities).toEqual(base.abilities);
    expect(sheet.hidden).toEqual([]);
  });

  it('starts with what D&D Beyond hides, and shows one again when the player restores it', () => {
    const base = sheetOf('vlad');
    expect(names(base.hiddenFeatures)).toEqual(['Eldritch Invocation Options', 'Languages']);
    const sheet = edited(base, { Languages: { hidden: false } });
    expect(names(sheet.hiddenFeatures)).toEqual(['Eldritch Invocation Options']);
    expect(group(sheet, 'Human')).toContain('Languages');
  });

  it('takes a ticked feature out of both views, and lists it with the hidden abilities too', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true, hidden: true } });
    expect(sheet.abilities).toEqual(base.abilities);
    expect(names(sheet.hidden)).toEqual(['Alert']);
    expect(names(sheet.hiddenFeatures)).toContain('Alert');
  });

  it('does not list a hidden feature with the hidden abilities when no view would show it', () => {
    const sheet = edited(sheetOf('vlad'), { Alert: { hidden: true } });
    expect(sheet.hidden).toEqual([]);
  });

  it('lists an option at the end of its group when its parent is hidden', () => {
    const base = sheetOf('vlad');
    expect(group(base, 'Warlock 3').slice(0, 5)).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade',
      'Eldritch Invocations > Armor of Shadows', 'Eldritch Invocations > Fiendish Vigor',
    ]);
    const sheet = edited(base, { 'Eldritch Invocations': { hidden: true } });
    expect(group(sheet, 'Warlock 3').slice(-3)).toEqual(['Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor']);
  });

  it('hides one option and leaves its parent and the other options', () => {
    const sheet = edited(sheetOf('vlad'), { 'Armor of Shadows': { hidden: true } });
    expect(group(sheet, 'Warlock 3').slice(1, 4)).toEqual([
      'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade', 'Eldritch Invocations > Fiendish Vigor',
    ]);
  });

  it('drops the pool of a hidden feature from the chips', () => {
    const base = sheetOf('vlad');
    const sheet = edited(base, { Alert: { inCombat: true, hidden: true, uses: { max: 2, reset: 'long' } } });
    expect(sheet.resources).toEqual(base.resources);
    expect(names(sheet.unshownResources)).toEqual(['Alert']);
  });
});

describe('the order of the Features page', () => {
  it('puts the features the player arranged first within their group, and moves an option with its parent', () => {
    const base = sheetOf('vlad');
    const key = (name: string): string => feature(base, name).key;
    const sheet = edited(base, {}, [key('Pact Magic'), key('Eldritch Invocations'), key('Lucky')]);
    expect(group(sheet, 'Warlock 3').slice(0, 6)).toEqual([
      'Pact Magic', 'Eldritch Invocations', 'Eldritch Invocations > Pact of the Blade',
      'Eldritch Invocations > Armor of Shadows', 'Eldritch Invocations > Fiendish Vigor', 'Core Warlock Traits',
    ]);
    expect(group(sheet, 'Feats')[0]).toBe('Lucky');
    expect(sheet.layout.order.features).toEqual([key('Pact Magic'), key('Eldritch Invocations'), key('Lucky')]);
    expect(sheet.features.map((g) => g.heading)).toEqual(base.features.map((g) => g.heading));
  });

  it('ignores a key that is not on the page', () => {
    const base = sheetOf('vlad');
    expect(edited(base, {}, ['feature:0:0', 'spell:1:2:slot']).features).toEqual(base.features);
  });
});

describe('the editor\'s view of a feature', () => {
  it('starts with both boxes unticked, passive, and shown', () => {
    const sheet = sheetOf('vlad');
    const row = sheet.featureRows[feature(sheet, 'Alert').key];
    expect(editForm(sheet, row)).toEqual({
      timing: 'passive', uses: null, tags: [], roll: { kind: 'none' }, inCombat: false, inExplore: false, hidden: false,
    });
  });

  it('records a tick, and records nothing for a box left unticked whatever the timing and tags', () => {
    const base = sheetOf('vlad');
    const row = base.featureRows[feature(base, 'Alert').key];
    const form = editForm(base, row);
    expect(diffEdit(base, row, { ...form, inCombat: true })).toEqual({ inCombat: true });
    expect(diffEdit(base, row, { ...form, timing: 'long', tags: ['utility'] })).toEqual({ timing: 'long', tags: ['utility'] });
    expect(diffEdit(base, row, form)).toEqual({});
  });

  it('says a feature D&D Beyond hides is hidden, and records the choice to show it', () => {
    const base = sheetOf('vlad');
    const languages = feature(base, 'Languages');
    const row = base.featureRows[languages.key];
    const form = editForm(base, row);
    expect(form.hidden).toBe(true);
    expect(diffEdit(base, row, { ...form, hidden: false })).toEqual({ hidden: false });
    expect(diffEdit(base, row, form)).toEqual({});
    const shown = edited(base, { Languages: { hidden: false } });
    expect(editForm(shown, shown.featureRows[languages.key]).hidden).toBe(false);
  });
});

describe('hiding and restoring', () => {
  it('records the choice only where it differs from what the row does unasked', () => {
    expect(withHidden(undefined, true, false)).toEqual({ hidden: true });
    expect(withHidden({ hidden: true, timing: 'action' }, false, false)).toEqual({ timing: 'action' });
    expect(withHidden(undefined, false, true)).toEqual({ hidden: false });
    expect(withHidden({ hidden: false }, true, true)).toEqual({});
    expect(withHidden({ inCombat: true }, true, true)).toEqual({ inCombat: true });
  });

  it('knows which rows start hidden: only a feature that D&D Beyond hides', () => {
    const sheet = sheetOf('vlad');
    expect(hiddenByDefault(sheet, feature(sheet, 'Languages').key)).toBe(true);
    expect(hiddenByDefault(sheet, feature(sheet, 'Alert').key)).toBe(false);
    expect(hiddenByDefault(sheet, sheet.abilities[0].key)).toBe(false);
    expect(hiddenByDefault(sheet, 'own:1')).toBe(false);
  });
});
```

Apply this change to `packages/rules/test/features.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,7 +1,7 @@
 import { convertCharacter } from '@cw/ddb-import';
 import type { Character, Feature } from '@cw/model';
 import { describe, expect, it } from 'vitest';
-import { buildSheet, featureGroups, featureLine } from '../src/index';
+import { arrangeFeatures, buildSheet, featureGroups, featureLine, featureSource, hiddenOnSheet } from '../src/index';
 import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';
 
 const characterOf = (slug: Slug): Character => convertCharacter(loadRaw(slug));
@@ -149,6 +149,36 @@ describe('featureGroups', () => {
   });
 });
 
+describe('arrangeFeatures', () => {
+  const source = featureSource(character([
+    feature('A'), feature('B'), feature('Of B', { parentKey: 'feature:1:B' }),
+    feature('Keen', { origin: 'species', originName: 'Gnome' }),
+  ]));
+  const outlineOf = (hidden: string[], order: string[] = []): [string, string[]][] =>
+    arrangeFeatures(source, new Set(hidden), order).map((g) => [
+      g.heading, g.items.flatMap((i) => [i.feature.name, ...i.options.map((o) => `${i.feature.name} > ${o.name}`)]),
+    ]);
+
+  it('lists everything when nothing is hidden, under the headings the character gave', () => {
+    expect(source.headings).toEqual({ feat: 'Feats', species: 'Gnome' });
+    expect(outlineOf([])).toEqual([['Feats', ['A', 'B', 'B > Of B']], ['Gnome', ['Keen']]]);
+  });
+
+  it('leaves out a group whose features are all hidden', () => {
+    expect(outlineOf(['feature:1:Keen'])).toEqual([['Feats', ['A', 'B', 'B > Of B']]]);
+  });
+
+  it('puts the named features first in their group, and an option whose parent is hidden last', () => {
+    expect(outlineOf([], ['feature:1:B', 'feature:1:Keen'])).toEqual([['Feats', ['B', 'B > Of B', 'A']], ['Gnome', ['Keen']]]);
+    expect(outlineOf(['feature:1:B'])).toEqual([['Feats', ['A', 'Of B']], ['Gnome', ['Keen']]]);
+    expect(outlineOf(['feature:1:B'], ['feature:1:Of B'])).toEqual([['Feats', ['Of B', 'A']], ['Gnome', ['Keen']]]);
+  });
+
+  it('knows which features the sheet itself hides', () => {
+    expect([...hiddenOnSheet([feature('Seen'), feature('Unseen', { hiddenOnSheet: true })])]).toEqual(['feature:1:Unseen']);
+  });
+});
+
 describe('featureLine', () => {
   it('says where a class or subclass feature comes from', () => {
     expect(featureLine(feature('Magical Cunning', { origin: 'class', originName: 'Warlock', classIndex: 0, level: 2 }))).toBe('Warlock, level 2');
```

Apply this change to `packages/rules/test/normalise.test.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -99,10 +99,16 @@ describe('normaliseEdit', () => {
     expect(normaliseEdit({ tags: [] })).toEqual({ tags: [] });
   });
 
-  it('bounds a maximum to 1 to 99 and never stores hidden as false', () => {
-    expect(normaliseEdit({ uses: { max: 0, reset: 'long' }, hidden: false })).toEqual({ uses: { max: 1, reset: 'long' } });
+  it('bounds a maximum to 1 to 99', () => {
+    expect(normaliseEdit({ uses: { max: 0, reset: 'long' } })).toEqual({ uses: { max: 1, reset: 'long' } });
     expect(normaliseEdit({ uses: { max: 250.7, reset: 'never' } })).toEqual({ uses: { max: 99, reset: 'never' } });
   });
+
+  it('keeps hidden as false, which is how a feature that D&D Beyond hides is shown again', () => {
+    expect(normaliseEdit({ hidden: false })).toEqual({ hidden: false });
+    expect(normaliseEdit({ hidden: true })).toEqual({ hidden: true });
+    expect(normaliseEdit({ hidden: 'yes' })).toEqual({});
+  });
 });
 
 describe('normaliseCustom', () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/store.edits.test.ts packages/rules/test/edits.test.ts packages/rules/test/feature-edits.test.ts packages/rules/test/features.test.ts packages/rules/test/normalise.test.ts
```

Expected: FAIL. `../src/features` exports no `featureAbility` or `isFeatureKey`, `../src/edits` exports no `hiddenByDefault` or `withHidden`, and the sheet has no `featureSource`.

- [ ] **Step 3: Write the implementation**

**Hidden.** Unset, a feature is hidden when D&D Beyond hides it on its own sheet (`hiddenOnSheet`) and shown otherwise. So `hidden: false` is a real choice and must survive being stored, which is why `normaliseEdit` now keeps it. `withHidden` records the choice only where it differs from what the row does unasked, so hiding and restoring a feature leaves no edit behind. Hiding a feature does not hide the abilities it grants; those are hidden under their own keys.

**A feature as a row.** `featureAbility` builds the row: the feature's key, name and description, the source that matches its origin, timing `passive`, and no roll, cost or tags. `applyEdits` then applies the edit to it as it does to any ability, so a feature can be given a timing, limited uses, tags and a roll. `sheet.featureRows` holds that row for every feature that has no ability of its own, ticked or not, because the editor needs it either way. Only the ticked ones are also in `sheet.abilities`.

**Never listed unasked.** `defaultViews` answers `{ combat: false, explore: false }` for any feature key, whatever the timing and tags. Everything that asks where a row goes (`viewsOf`, `diffEdit`, the editor) goes through it, so nothing else needs a special case.

**A feature that already has abilities** (`playKeys` is not empty) gets no row, whatever its edit says. It can still be hidden and put in order.

**"edited".** A feature's row is there because the player ticked it. It is marked edited only when its timing, uses, tags or roll were changed.

**Pools.** A feature's limited uses are a pool under the feature's key. The pool is a chip only while something listed spends it. A pool nothing listed spends (its abilities are hidden, or it belongs to a feature in neither view) moves to `sheet.unshownResources`, which `editForm` also reads, so reopening the editor still shows the uses.

**A hidden feature that was ticked into a view** is also listed in `sheet.hidden`, the drawer of the views' own "Edit list", so it can be restored from where it was hidden.

**Order.** `order.features` puts a group's features in order, as `order.combat` does for a view. An option stays under its feature and moves with it. An option whose feature is hidden is a row of its own at the end of the group.

The literal `order: { combat: ..., explore: [] }` appears in a few existing tests and gains `features: []` there. One test in `normalise.test.ts` asserted that `hidden: false` is dropped; it is replaced by one that asserts the opposite, with the reason.

Apply this change to `apps/web/src/store.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,5 +1,5 @@
 import { convertCharacter } from '@cw/ddb-import';
-import type { Ability, AbilityEdit, CharacterEdits, CustomAbility, PlayState, ViewName } from '@cw/model';
+import type { Ability, AbilityEdit, CharacterEdits, CustomAbility, OrderName, PlayState } from '@cw/model';
 import {
   adjustPool, applyEdits, applyUse, buildSheet, clampState, emptyEdits, emptyPlayState, endConcentration,
   isEmptyEdit, normaliseCustom, normaliseEdit, normaliseOrder, normalisePlayItem, normaliseTurn, pools, rest,
@@ -91,14 +91,14 @@ export interface AppStore {
   togglePill(timing: TurnTiming): void;
   endConcentration(): void;
   undoLast(): void;
-  /** Replaces the open character's edits to one ability. An edit that changes nothing removes them. */
+  /** Replaces the open character's edits to one ability or feature. An edit that changes nothing removes them. */
   setEdit(abilityKey: string, edit: AbilityEdit): void;
   /** Adds a custom ability to the open character, or replaces the one with the same key. */
   saveCustom(custom: CustomAbility): void;
   /** Deletes a custom ability and any edits stored under its key. */
   deleteCustom(abilityKey: string): void;
-  /** Records the order the player gave one group of a view. `groupKeys` is the whole group, in order. */
-  setOrder(view: ViewName, groupKeys: string[]): void;
+  /** Records the order the player gave one group of a view or of the Features page. `groupKeys` is the whole group, in order. */
+  setOrder(view: OrderName, groupKeys: string[]): void;
 }
 
 /** A key for a new custom ability. */
@@ -165,7 +165,7 @@ export function editsFrom(items: StoredItem[]): CharacterEdits {
     } else if (item.kind === 'custom') {
       const custom = normaliseCustom(item.data, item.key);
       if (custom) edits.custom.push(custom);
-    } else if (item.kind === 'order' && (item.key === 'combat' || item.key === 'explore')) {
+    } else if (item.kind === 'order' && (item.key === 'combat' || item.key === 'explore' || item.key === 'features')) {
       edits.order[item.key] = normaliseOrder(item.data);
     }
   }
```

Apply this change to `packages/model/src/index.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -276,6 +276,9 @@ export interface PlayState {
 /** The two views. Each keeps its own order of abilities. */
 export type ViewName = 'combat' | 'explore';
 
+/** A list the player can put in order: the two views, and the Features page. */
+export type OrderName = ViewName | 'features';
+
 /** A limited-use pool as the player sets it: how many, and when they come back. */
 export interface UsesEdit {
   max: number;
@@ -284,7 +287,8 @@ export interface UsesEdit {
 
 /**
  * A player's changes to one ability, stored beside the imported sheet and applied each time the
- * sheet is built. An absent field means "as imported".
+ * sheet is built. An absent field means "as imported". A feature takes the same edit under its
+ * own key: for a feature, `inCombat` and `inExplore` are what put it in a view at all.
  */
 export interface AbilityEdit {
   timing?: Timing;
@@ -294,6 +298,7 @@ export interface AbilityEdit {
   roll?: Roll;
   inCombat?: boolean;
   inExplore?: boolean;
+  /** Absent, an ability is shown, and a feature is hidden only if D&D Beyond hides it on its own sheet. */
   hidden?: boolean;
 }
 
@@ -318,6 +323,6 @@ export interface CharacterEdits {
   /** By ability key. */
   abilities: Record<string, AbilityEdit>;
   custom: CustomAbility[];
-  /** Ability keys in the order the player arranged them, for each view. */
-  order: Record<ViewName, string[]>;
+  /** Keys in the order the player arranged them: ability keys for each view, feature keys for the Features page. */
+  order: Record<OrderName, string[]>;
 }
```

Apply this change to `packages/rules/src/edits.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -2,9 +2,12 @@ import type {
   Ability, AbilityEdit, CharacterEdits, CustomAbility, Roll, Tag, Timing, UsesEdit, ViewName,
 } from '@cw/model';
 import type { Resource } from './abilities';
+import { arrangeFeatures, featureAbility, isFeatureKey } from './features';
 import type { Sheet } from './sheet';
 
-export const emptyEdits = (): CharacterEdits => ({ abilities: {}, custom: [], order: { combat: [], explore: [] } });
+export { sortByOrder, withGroupOrder } from './order';
+
+export const emptyEdits = (): CharacterEdits => ({ abilities: {}, custom: [], order: { combat: [], explore: [], features: [] } });
 
 /** True when an edit changes nothing, so it need not be kept. */
 export const isEmptyEdit = (edit: AbilityEdit): boolean => Object.keys(edit).length === 0;
@@ -13,9 +16,11 @@ const EXPLORE_TAGS: Tag[] = ['utility', 'social', 'movement'];
 
 /**
  * Which views list an ability when the player has not chosen. Combat lists everything that does
- * not take a minute or more. Explore lists what is useful outside a fight.
+ * not take a minute or more. Explore lists what is useful outside a fight. A feature is in neither:
+ * the app never adds one to a view, whatever its timing and tags. Only the player's tick does.
  */
-export function defaultViews(ability: Pick<Ability, 'timing' | 'ritual' | 'tags'>): Record<ViewName, boolean> {
+export function defaultViews(ability: Pick<Ability, 'timing' | 'ritual' | 'tags'> & { key?: string }): Record<ViewName, boolean> {
+  if (ability.key !== undefined && isFeatureKey(ability.key)) return { combat: false, explore: false };
   return {
     combat: ability.timing !== 'long',
     explore: ability.timing === 'long' || ability.ritual || ability.tags.some((t) => EXPLORE_TAGS.includes(t)),
@@ -29,20 +34,17 @@ export function viewsOf(sheet: Sheet, ability: Ability): Record<ViewName, boolea
   return { combat: chosen?.combat ?? fallback.combat, explore: chosen?.explore ?? fallback.explore };
 }
 
-/** `list` with the abilities named in `order` first, in that order; the rest keep their places. */
-export function sortByOrder<T extends { key: string }>(list: T[], order: string[]): T[] {
-  const rank = new Map(order.map((key, index) => [key, index]));
-  const placed = list.filter((a) => rank.has(a.key)).sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
-  return [...placed, ...list.filter((a) => !rank.has(a.key))];
-}
+/** True for a feature that D&D Beyond hides on its own sheet: it starts hidden. False for everything else. */
+export const hiddenByDefault = (sheet: Sheet, key: string): boolean =>
+  sheet.featureSource.list.some((f) => f.key === key && f.hiddenOnSheet);
 
 /**
- * A view's order after the player arranged one group. Only the order within a group matters, so
- * the group's keys are taken out of the list and put back, in their new order, at the end.
+ * `edit` with its row hidden or shown. The choice is recorded only where it differs from what
+ * the row does unasked (`byDefault`), so that hiding and restoring leaves no edit behind.
  */
-export function withGroupOrder(order: string[], groupKeys: string[]): string[] {
-  const moved = new Set(groupKeys);
-  return [...order.filter((key) => !moved.has(key)), ...groupKeys];
+export function withHidden(edit: AbilityEdit | undefined, hidden: boolean, byDefault: boolean): AbilityEdit {
+  const { hidden: _before, ...rest } = edit ?? {};
+  return hidden === byDefault ? rest : { ...rest, hidden };
 }
 
 const escapeHtml = (text: string): string =>
@@ -85,8 +87,11 @@ const usesPool = (ability: Ability, key: string): boolean =>
 
 /**
  * The sheet the views show: the calculated sheet with the player's edits applied. Pure; the
- * calculated sheet is not changed. Edits apply to imported abilities, universal actions and
- * custom abilities alike, by key. An edit whose ability is not on the sheet has no effect.
+ * calculated sheet is not changed. Edits apply to imported abilities, universal actions, custom
+ * abilities and features alike, by key. An edit whose ability is not on the sheet has no effect.
+ *
+ * A feature is hidden and put in order under its own key. One with no ability of its own also
+ * becomes a row in each view the player ticked it into.
  */
 export function applyEdits(sheet: Sheet, edits: CharacterEdits): Sheet {
   const resources = new Map<string, Resource>(sheet.resources.map((r) => [r.key, r]));
@@ -104,8 +109,11 @@ export function applyEdits(sheet: Sheet, edits: CharacterEdits): Sheet {
   const edit = (ability: Ability): Ability => {
     const change = edits.abilities[ability.key];
     if (!change || isEmptyEdit(change)) return ability;
-    edited.push(ability.key);
-    if (change.hidden) hiddenKeys.add(ability.key);
+    const feature = isFeatureKey(ability.key);
+    // A feature's row is there because the player ticked it: only a change to what it says counts as edited.
+    if (!feature || change.timing || change.uses || change.tags || change.roll) edited.push(ability.key);
+    // Whether a feature is hidden is settled below, since one can be hidden with no edit at all.
+    if (change.hidden && !feature) hiddenKeys.add(ability.key);
     if (change.inCombat !== undefined || change.inExplore !== undefined) {
       show[ability.key] = {
         ...(change.inCombat !== undefined ? { combat: change.inCombat } : {}),
@@ -135,23 +143,50 @@ export function applyEdits(sheet: Sheet, edits: CharacterEdits): Sheet {
   const universal = sheet.universal.map(edit);
   const everything = [...all, ...universal];
 
+  const list = sheet.featureSource.list;
+  const hiddenFeatures = list.filter((f) => edits.abilities[f.key]?.hidden ?? f.hiddenOnSheet);
+  const hiddenFeatureKeys = new Set(hiddenFeatures.map((f) => f.key));
+  const featureRows: Record<string, Ability> = {};
+  /** Feature rows that a view lists, and the ones a view would list if the feature were not hidden. */
+  const inPlay: Ability[] = [];
+  const hiddenRows: Ability[] = [];
+  for (const f of list) {
+    // A feature that already has abilities is in play as those, and they are edited where they are listed.
+    if (f.playKeys.length > 0) continue;
+    const row = edit(featureAbility(f));
+    featureRows[f.key] = row;
+    const chosen = show[f.key];
+    if (!chosen?.combat && !chosen?.explore) continue;
+    (hiddenFeatureKeys.has(f.key) ? hiddenRows : inPlay).push(row);
+  }
+
+  const listed = new Set([...everything.filter((a) => !hiddenKeys.has(a.key)), ...inPlay].map((a) => a.key));
+  const spenders = [...everything, ...Object.values(featureRows)];
   const kept: Resource[] = [];
+  const unshown: Resource[] = [];
   for (const resource of resources.values()) {
-    const users = everything.filter((a) => usesPool(a, resource.key));
+    const users = spenders.filter((a) => usesPool(a, resource.key));
     if (released.has(resource.key) && users.length === 0) continue;
-    // A pool whose every user is hidden is noise too.
-    if (users.length > 0 && users.every((a) => hiddenKeys.has(a.key))) continue;
-    kept.push(resource);
+    // A pool that nothing listed spends is noise: its abilities are hidden, or are features in neither view.
+    if (users.length > 0 && !users.some((a) => listed.has(a.key))) unshown.push(resource);
+    else kept.push(resource);
   }
 
   return {
     ...sheet,
     resources: kept,
-    abilities: all.filter((a) => !hiddenKeys.has(a.key)),
+    unshownResources: unshown,
+    abilities: [...all.filter((a) => !hiddenKeys.has(a.key)), ...inPlay],
     universal: universal.filter((a) => !hiddenKeys.has(a.key)),
-    hidden: everything.filter((a) => hiddenKeys.has(a.key)),
+    hidden: [...everything.filter((a) => hiddenKeys.has(a.key)), ...hiddenRows],
+    features: arrangeFeatures(sheet.featureSource, hiddenFeatureKeys, edits.order.features),
+    hiddenFeatures,
+    featureRows,
     edited,
-    layout: { order: { combat: [...edits.order.combat], explore: [...edits.order.explore] }, show },
+    layout: {
+      order: { combat: [...edits.order.combat], explore: [...edits.order.explore], features: [...edits.order.features] },
+      show,
+    },
   };
 }
 
@@ -173,7 +208,7 @@ export const canEditUses = (ability: Ability): boolean => ability.cost.kind !==
 /** The form for an ability as it stands on `sheet` (which may or may not have edits applied). */
 export function editForm(sheet: Sheet, ability: Ability): EditForm {
   const poolKey = ability.cost.kind === 'uses' ? ability.cost.resourceKey : null;
-  const pool = poolKey === null ? undefined : sheet.resources.find((r) => r.key === poolKey);
+  const pool = poolKey === null ? undefined : [...sheet.resources, ...sheet.unshownResources].find((r) => r.key === poolKey);
   const views = viewsOf(sheet, ability);
   return {
     timing: ability.timing,
@@ -182,7 +217,7 @@ export function editForm(sheet: Sheet, ability: Ability): EditForm {
     roll: ability.roll,
     inCombat: views.combat,
     inExplore: views.explore,
-    hidden: sheet.hidden.some((a) => a.key === ability.key),
+    hidden: sheet.hidden.some((a) => a.key === ability.key) || sheet.hiddenFeatures.some((f) => f.key === ability.key),
   };
 }
 
@@ -204,6 +239,7 @@ export function diffEdit(baseSheet: Sheet, base: Ability, form: EditForm): Abili
   const fallback = defaultViews({ ...base, timing: form.timing, tags: form.tags });
   if (form.inCombat !== fallback.combat) out.inCombat = form.inCombat;
   if (form.inExplore !== fallback.explore) out.inExplore = form.inExplore;
-  if (form.hidden) out.hidden = true;
+  // A feature that D&D Beyond hides starts hidden, so for it the edit is the choice to show it.
+  if (form.hidden !== original.hidden) out.hidden = form.hidden;
   return out;
 }
```

Apply this change to `packages/rules/src/features.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,4 +1,5 @@
-import type { Character, Feature } from '@cw/model';
+import type { Ability, Character, Feature } from '@cw/model';
+import { sortByOrder } from './order';
 
 /** A feature, with the options chosen within it. */
 export interface FeatureItem {
@@ -14,6 +15,14 @@ export interface FeatureGroup {
   items: FeatureItem[];
 }
 
+/** Everything the Features page is built from. The player's edits do not change it. */
+export interface FeatureSource {
+  /** Every feature on the sheet, in the sheet's order, including what is hidden. */
+  list: Feature[];
+  /** Each group's heading, by group key. */
+  headings: Record<string, string>;
+}
+
 const REST = ['feat', 'species', 'background'];
 
 const groupKey = (f: Feature): string =>
@@ -33,22 +42,36 @@ function heading(key: string, features: Feature[], c: Character): string {
   return cls && cls.name !== '' ? `${cls.name} ${cls.level}` : 'Class features';
 }
 
-/**
- * The Features page: what the sheet says the character has, under one heading for each class, then
- * Feats, the species and the background. An entry the sheet itself hides is left out. An option
- * sits under the feature that offers it; one whose parent is not listed goes to the end of its
- * group.
- */
-export function featureGroups(c: Character): FeatureGroup[] {
+function grouped(list: Feature[]): Map<string, Feature[]> {
   const byGroup = new Map<string, Feature[]>();
-  for (const f of c.features) {
-    if (f.hiddenOnSheet) continue;
+  for (const f of list) {
     const key = groupKey(f);
-    const list = byGroup.get(key);
-    if (list) list.push(f);
+    const group = byGroup.get(key);
+    if (group) group.push(f);
     else byGroup.set(key, [f]);
   }
-  return [...byGroup.entries()]
+  return byGroup;
+}
+
+/** The character's features and the heading each group goes under. */
+export function featureSource(c: Character): FeatureSource {
+  const headings: Record<string, string> = {};
+  for (const [key, features] of grouped(c.features)) headings[key] = heading(key, features, c);
+  return { list: c.features, headings };
+}
+
+/** The keys of the features D&D Beyond hides on its own sheet. They start hidden here too. */
+export const hiddenOnSheet = (list: Feature[]): Set<string> =>
+  new Set(list.filter((f) => f.hiddenOnSheet).map((f) => f.key));
+
+/**
+ * The Features page: one heading for each class, then Feats, the species and the background,
+ * without the features whose key is in `hidden`. An option sits under the feature that offers it;
+ * one whose parent is not listed, or is hidden, goes to the end of its group. Within a group the
+ * features named in `order` come first, in that order; an option moves with its parent.
+ */
+export function arrangeFeatures(source: FeatureSource, hidden: ReadonlySet<string>, order: string[] = []): FeatureGroup[] {
+  return [...grouped(source.list.filter((f) => !hidden.has(f.key))).entries()]
     .sort(([a], [b]) => rank(a) - rank(b))
     .map(([key, features]) => {
       const items: FeatureItem[] = [];
@@ -65,12 +88,50 @@ export function featureGroups(c: Character): FeatureGroup[] {
         if (parent) parent.options.push(feature);
         else items.push({ feature, options: [] });
       }
-      return { key, heading: heading(key, features, c), items };
+      const rows = sortByOrder(items.map((item) => ({ key: item.feature.key, item })), order);
+      return { key, heading: source.headings[key] ?? '', items: rows.map((row) => row.item) };
     });
 }
 
+/** The Features page of a character with no edits: an entry the sheet itself hides is left out. */
+export function featureGroups(c: Character): FeatureGroup[] {
+  const source = featureSource(c);
+  return arrangeFeatures(source, hiddenOnSheet(source.list));
+}
+
 /** Where a class or subclass feature comes from: "Warlock, level 2". Null for everything else. */
 export function featureLine(f: Feature): string | null {
   if (f.level === null) return null;
   return f.originName !== '' ? `${f.originName}, level ${f.level}` : `Level ${f.level}`;
 }
+
+/** Every feature key starts this way, and no ability key does. */
+export const isFeatureKey = (key: string): boolean => key.startsWith('feature:');
+
+const SOURCE: Record<Feature['origin'], Ability['source']> = {
+  class: 'class', subclass: 'class', feat: 'feat', species: 'species', background: 'background',
+};
+
+/**
+ * A feature as a row in play: a reminder under the feature's own key, name and description. It is
+ * passive and has no roll, cost or tags until the player gives it some.
+ */
+export function featureAbility(f: Feature): Ability {
+  return {
+    key: f.key,
+    name: f.name,
+    source: SOURCE[f.origin],
+    timing: 'passive',
+    roll: { kind: 'none' },
+    cost: { kind: 'none' },
+    poolKey: null,
+    tags: [],
+    concentration: false,
+    ritual: false,
+    range: null,
+    area: false,
+    description: f.description,
+    notes: [],
+    tagSource: 'none',
+  };
+}
```

Apply this change to `packages/rules/src/normalise.ts` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -119,7 +119,8 @@ export function normaliseEdit(data: unknown): AbilityEdit {
   if (roll) edit.roll = roll;
   if (typeof source.inCombat === 'boolean') edit.inCombat = source.inCombat;
   if (typeof source.inExplore === 'boolean') edit.inExplore = source.inExplore;
-  if (source.hidden === true) edit.hidden = true;
+  // False is kept: it is how a feature that D&D Beyond hides is shown again.
+  if (typeof source.hidden === 'boolean') edit.hidden = source.hidden;
   return edit;
 }
 
```

Create `packages/rules/src/order.ts`:

```ts
/** `list` with the rows named in `order` first, in that order; the rest keep their places. */
export function sortByOrder<T extends { key: string }>(list: T[], order: string[]): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const placed = list.filter((a) => rank.has(a.key)).sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  return [...placed, ...list.filter((a) => !rank.has(a.key))];
}

/**
 * A list's order after the player arranged one group. Only the order within a group matters, so
 * the group's keys are taken out of the list and put back, in their new order, at the end.
 */
export function withGroupOrder(order: string[], groupKeys: string[]): string[] {
  const moved = new Set(groupKeys);
  return [...order.filter((key) => !moved.has(key)), ...groupKeys];
}
```

Replace the whole of `packages/rules/src/sheet.ts` with:

```ts
import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type Feature, type OrderName, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { arrangeFeatures, featureAbility, featureSource, hiddenOnSheet, type FeatureGroup, type FeatureSource } from './features';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';
import { universalActions } from './universal';

/** How the player has arranged the views. Empty on a sheet with no edits. */
export interface SheetLayout {
  /** Keys in the player's order, for each view and for the Features page. What is not listed follows in sheet order. */
  order: Record<OrderName, string[]>;
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
  /** Everything the Features page is built from, hidden or not. */
  featureSource: FeatureSource;
  /** The Features page, in order, without what is hidden. Nothing here is used or spent. */
  features: FeatureGroup[];
  /** Features that are hidden: by the player, or by D&D Beyond's own flag until the player restores one. */
  hiddenFeatures: Feature[];
  /**
   * By feature key: the feature as a row in play, with the player's edits. Only for a feature with
   * no ability of its own. The ones the player ticked into a view are also in `abilities`.
   */
  featureRows: Record<string, Ability>;
  /** Pools that are not shown, because nothing listed spends them. The editor still reads them. */
  unshownResources: Resource[];
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
  const source = featureSource(c);
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
    featureSource: source,
    features: arrangeFeatures(source, hiddenOnSheet(source.list)),
    hiddenFeatures: source.list.filter((f) => f.hiddenOnSheet),
    featureRows: Object.fromEntries(source.list.filter((f) => f.playKeys.length === 0).map((f) => [f.key, featureAbility(f)])),
    unshownResources: [],
    hidden: [],
    edited: [],
    layout: { order: { combat: [], explore: [], features: [] }, show: {} },
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

Expected: every test passes (1237 tests in 49 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Features take edits: hide, order, and a row in the views the player ticks" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 12: Edit a feature: tick it into a view, or hide it

An opened feature on the Features page gains "Edit" (spec section 10.4, "Features"). A feature with no ability of its own opens the ordinary editor, as the row it is, or would be, in play: both "Shown in" boxes start unticked and nothing but the player's tick changes them. A feature that already has rows in play opens a small editor that only hides it and says which rows those are.

**Files:**
- Modify: `apps/web/src/components/AbilityEditor.tsx`
- Modify: `apps/web/src/components/CustomAbilityEditor.tsx`
- Create: `apps/web/src/components/FeatureEditor.tsx`
- Modify: `apps/web/src/components/editorFields.tsx`
- Modify: `apps/web/src/components/useAbilityEdit.tsx`
- Modify: `apps/web/src/views/EditList.tsx`
- Modify: `apps/web/src/views/FeaturesView.tsx`
- Create (test): `apps/web/src/views/featureedit.test.tsx`

**Interfaces:**
- Consumes:
  - `AbilityEditor`, `useAbilityEdit`, `withViews` in `editorFields.tsx`, `EditList` (Tasks 6 to 8).
  - `sheet.featureRows`, `sheet.featureSource`, `isFeatureKey`, `withHidden`, `hiddenByDefault` from `@cw/rules` (the task before this one).
- Produces:
  - `FeatureEditor({ feature, onClose })` in `apps/web/src/components/FeatureEditor.tsx`: the editor for a feature that has rows in play.
  - `useAbilityEdit().edit` now takes anything with a `key`: an ability or a feature. It opens `CustomAbilityEditor`, `AbilityEditor` or `FeatureEditor` as fits.
  - `withViews(draft, next, chosen, row)`: the fourth argument is now `{ key?: string; ritual: boolean }`, the row being edited.
  - `FeaturesView` rows show "Edit" when open.
  - `EditList` hides and restores through `withHidden`, so a feature's row in a view can be hidden and restored there.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/views/featureedit.test.tsx`:

```tsx
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { combatGroups, exploreAbilities } from '@cw/rules';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { seed } from '../test/helpers';

const state = () => useStore.getState();

async function open(slug: Slug, view: View = 'features') {
  const record = await seed(slug);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const row = (heading: string, name: string) => within(group(heading)).getByRole('article', { name });
const key = (name: string): string => {
  const found = state().sheet?.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found.key;
};
const edits = () => state().edits.abilities;
const names = (list: { name: string }[]): string[] => list.map((a) => a.name);
const sheet = () => {
  const now = state().sheet;
  if (!now) throw new Error('no character is open');
  return now;
};

/** Opens a feature's row and taps its Edit button. */
async function edit(heading: string, name: string) {
  const article = row(heading, name);
  await userEvent.click(within(article).getAllByRole('button')[0]);
  await userEvent.click(within(article).getByRole('button', { name: `Edit ${name}` }));
  return screen.getByRole('dialog', { name: `Edit ${name}` });
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('editing a feature that has no ability of its own', () => {
  it('opens the editor with Passive, both boxes unticked, and nothing recorded when saved as it is', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    expect(within(dialog).getByLabelText('Timing')).toHaveValue('passive');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Hide this feature' })).not.toBeChecked();
    expect(within(dialog).getByText('A feature is listed in Combat or Explore only when you tick it here.')).toBeInTheDocument();
    // Where it is shown is the first thing in a feature's editor; for an ability it comes after the tags.
    const text = dialog.textContent ?? '';
    expect(text.indexOf('Shown in')).toBeLessThan(text.indexOf('Timing'));
    expect(within(dialog).queryByRole('button', { name: 'Back to imported' })).toBeNull();
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
  });

  it('puts the feature under "Always on" in Combat when Combat is ticked, and keeps it on the Features page', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true } });
    expect(row('Feats', 'Alert')).toBeInTheDocument();
    show('combat');
    await userEvent.click(await screen.findByText('Always on (1)'));
    const article = screen.getByRole('article', { name: 'Alert' });
    expect(within(article).queryByRole('button', { name: 'Use Alert' })).toBeNull();
    expect(article).not.toHaveTextContent('edited');
  });

  it('does not tick a box when the timing or the tags change', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.selectOptions(within(dialog).getByLabelText('Timing'), 'long');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { timing: 'long', tags: ['utility'] } });
    expect(names(exploreAbilities(sheet()))).not.toContain('Alert');
  });

  it('gives a ticked feature limited uses: pips in Combat, and Use spends one', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await userEvent.clear(within(dialog).getByLabelText('Maximum uses'));
    await userEvent.type(within(dialog).getByLabelText('Maximum uses'), '2');
    await save();
    show('combat');
    // The sheet has more pools than fit on one line; the new one is behind "more".
    await userEvent.click(await screen.findByRole('button', { name: /more$/ }));
    expect(screen.getByRole('group', { name: 'Alert: 2 of 2 left' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Always on (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Use Alert' }));
    expect(screen.getByRole('group', { name: 'Alert: 1 of 2 left' })).toBeInTheDocument();
  });

  it('opens the same editor from the feature\'s row in Combat, and "Back to imported" takes the row out', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Alert'), { inCombat: true, timing: 'reaction' }));
    const article = within(group('Reaction')).getByRole('article', { name: 'Alert' });
    expect(article).toHaveTextContent('edited');
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: 'Edit Alert' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Alert' });
    expect(within(dialog).getByLabelText('Timing')).toHaveValue('reaction');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to imported' }));
    expect(edits()).toEqual({});
    expect(names(combatGroups(sheet()).reaction)).not.toContain('Alert');
  });

  it('hides the feature from its editor', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this feature' }));
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { hidden: true } });
    expect(within(group('Feats')).queryByRole('article', { name: 'Alert' })).toBeNull();
  });
});

describe('editing a feature that already has rows in play', () => {
  it('offers only Hide, and says which rows those are', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Lucky');
    expect(dialog).toHaveTextContent('In play as: Luck Points. Change those rows where they are listed, in Combat or Explore.');
    expect(within(dialog).queryByLabelText('Timing')).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Combat' })).toBeNull();
    await save();
    expect(edits()).toEqual({});
    // The row is still open, so its Edit button is still there.
    await userEvent.click(within(row('Feats', 'Lucky')).getByRole('button', { name: 'Edit Lucky' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Lucky' })).getByRole('checkbox', { name: 'Hide this feature' }));
    await save();
    expect(edits()).toEqual({ [key('Lucky')]: { hidden: true } });
    expect(within(group('Feats')).queryByRole('article', { name: 'Lucky' })).toBeNull();
    // Its ability is still in play: hiding a feature does not hide its rows.
    expect(names(sheet().abilities)).toContain('Luck Points');
  });

  it('names the rows of an option', async () => {
    await open('vlad');
    const dialog = await edit('Warlock 3', 'Pact of the Blade');
    expect(dialog).toHaveTextContent('In play as: Pact of the Blade: Conjure, Pact of the Blade: Bond.');
  });

  it('tells apart two rows with one name by their cost', async () => {
    await open('vlad');
    const dialog = await edit('Warlock 3', 'Tatzelwurm Spells');
    expect(dialog).toHaveTextContent('Misty Step (pact slot)');
  });
});

describe('a feature\'s row in the Combat Edit list', () => {
  it('is hidden and restored there, leaving no trace of either', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Alert'), { inCombat: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit list' }));
    await userEvent.click(within(group('Always on')).getByRole('button', { name: 'Hide Alert' }));
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true, hidden: true } });
    expect(screen.queryByRole('region', { name: 'Always on' })).toBeNull();
    await userEvent.click(screen.getByText('Hidden (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore Alert' }));
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true } });
    expect(within(group('Always on')).getByRole('button', { name: 'Hide Alert' })).toBeInTheDocument();
  });

  it('restores a feature that D&D Beyond hides by recording the choice to show it', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Languages'), { inCombat: true }));
    // Still hidden, as D&D Beyond has it, so it is not in play yet.
    expect(screen.queryByText(/^Always on/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit list' }));
    await userEvent.click(screen.getByText('Hidden (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore Languages' }));
    expect(edits()).toEqual({ [key('Languages')]: { inCombat: true, hidden: false } });
    await userEvent.click(within(group('Always on')).getByRole('button', { name: 'Hide Languages' }));
    expect(edits()).toEqual({ [key('Languages')]: { inCombat: true } });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/views/featureedit.test.tsx
```

Expected: FAIL. A feature's row has no Edit button.

- [ ] **Step 3: Write the implementation**

`AbilityEditor` needs three small changes to edit a feature's row. The row as imported comes from `baseSheet.featureRows`. "Back to imported" is offered whenever an edit is stored for the row, which for an ability is what `sheet.edited` already said. And for a feature "Shown in" comes first, with one line under it saying that a feature is listed only when ticked, because that is the first thing a player opens a feature's editor to do.

The words under "Shown in" are fixed text: "A feature is listed in Combat or Explore only when you tick it here." The small editor says "In play as: {rows}. Change those rows where they are listed, in Combat or Explore." A row is named as it is in the views, so two rows with one name carry their cost ("Misty Step (pact slot)").

Hiding a feature's row from a view's "Edit list" hides the feature everywhere, the Features page included (spec section 5.5). It is restored from either "Hidden" drawer. For a feature that D&D Beyond hides, restoring records `hidden: false`; hiding it again removes that.

On the `vlad` fixture: Alert has no ability of its own; Lucky is in play as Luck Points; the option Pact of the Blade is in play as two rows. These are examples of the general rule, not special cases.

Apply this change to `apps/web/src/components/AbilityEditor.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -1,5 +1,5 @@
 import type { Ability, ResetType, Roll } from '@cw/model';
-import { canEditUses, diffEdit, editForm, normaliseRoll, type EditForm } from '@cw/rules';
+import { canEditUses, diffEdit, editForm, isFeatureKey, normaliseRoll, type EditForm } from '@cw/rules';
 import { useState, type FormEvent } from 'react';
 import { useStore } from '../store';
 import { Dialog } from './Dialog';
@@ -19,7 +19,8 @@ interface Draft extends Omit<EditForm, 'uses'> {
 
 /**
  * Changes one ability from the sheet: when it is used, what it costs, how it is tagged, where it
- * is listed and what it rolls. An ability the player added has its own editor.
+ * is listed and what it rolls. An ability the player added has its own editor. A feature with no
+ * ability of its own is edited here too, as the row it is, or would be, in play.
  */
 export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose: () => void }) {
   const sheet = useStore((s) => s.sheet);
@@ -38,15 +39,16 @@ export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose:
   if (!sheet || !baseSheet || !start || !draft) return null;
 
   const change = (next: Partial<Draft>): void => {
-    const result = withViews(draft, next, chosen, ability.ritual);
+    const result = withViews(draft, next, chosen, ability);
     setDraft(result.draft);
     setChosen(result.chosen);
     setError(null);
   };
   const usesEditable = canEditUses(ability);
+  const feature = isFeatureKey(ability.key);
   /** The ability as imported. An ability with none has nothing to compare against or go back to. */
-  const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key);
-  const canRestore = base !== undefined && sheet.edited.includes(ability.key);
+  const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key) ?? baseSheet.featureRows[ability.key];
+  const canRestore = base !== undefined && stored !== undefined;
 
   function save(event: FormEvent): void {
     event.preventDefault();
@@ -74,9 +76,18 @@ export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose:
     onClose();
   }
 
+  /** For a feature this comes first: whether it is in a view at all is the first thing to choose. */
+  const shownIn = (
+    <>
+      <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
+      {feature ? <p className="text-sm text-slate-600">A feature is listed in Combat or Explore only when you tick it here.</p> : null}
+    </>
+  );
+
   return (
     <Dialog title={`Edit ${ability.name}`} onClose={onClose}>
       <form onSubmit={save} noValidate className="mt-3 space-y-4">
+        {feature ? shownIn : null}
         <TimingSelect value={draft.timing} onChange={(timing) => change({ timing })} allowUnknown={start.timing === 'unknown'} />
 
         {usesEditable ? (
@@ -94,12 +105,12 @@ export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose:
         )}
 
         <TagToggles value={draft.tags} onChange={(tags) => change({ tags })} />
-        <ShownIn inCombat={draft.inCombat} inExplore={draft.inExplore} onChange={change} />
+        {feature ? null : shownIn}
         <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />
 
         <label className={CHECK}>
           <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
-          <span>Hide this ability</span>
+          <span>{feature ? 'Hide this feature' : 'Hide this ability'}</span>
         </label>
 
         {error ? <p role="alert" className={ALERT}>{error}</p> : null}
```

Apply this change to `apps/web/src/components/CustomAbilityEditor.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -78,7 +78,7 @@ export function CustomAbilityEditor({ custom, onClose }: { custom: CustomAbility
   const [error, setError] = useState<string | null>(null);
 
   const change = (next: Partial<Draft>): void => {
-    const result = withViews(draft, next, chosen, false);
+    const result = withViews(draft, next, chosen, { ritual: false });
     setDraft(result.draft);
     setChosen(result.chosen);
     setError(null);
```

Create `apps/web/src/components/FeatureEditor.tsx`:

```tsx
import type { Feature } from '@cw/model';
import { withHidden } from '@cw/rules';
import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { BUTTON, CHECK, PRIMARY } from './fieldStyles';
import { rowLabel } from './rowLabel';

/**
 * The editor for a feature that already has rows in play. Those rows are edited where they are
 * listed, so all this offers is hiding the feature, and it says which rows they are.
 */
export function FeatureEditor({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const setEdit = useStore((s) => s.setEdit);
  const stored = useStore((s) => s.edits.abilities[feature.key]);
  const [hidden, setHidden] = useState(false);

  if (!sheet) return null;

  const all = [...sheet.abilities, ...sheet.universal, ...sheet.hidden];
  const rows = feature.playKeys.flatMap((key) => {
    const ability = all.find((a) => a.key === key);
    return ability ? [rowLabel(ability, sheet)] : [];
  });

  function save(event: FormEvent): void {
    event.preventDefault();
    if (hidden) setEdit(feature.key, withHidden(stored, true, feature.hiddenOnSheet));
    onClose();
  }

  return (
    <Dialog title={`Edit ${feature.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <p className="text-sm text-slate-700">
          {rows.length > 0 ? `In play as: ${rows.join(', ')}.` : 'This feature already has rows in play.'}
          {' '}Change those rows where they are listed, in Combat or Explore.
        </p>

        <label className={CHECK}>
          <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} className="size-5" />
          <span>Hide this feature</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
```

Apply this change to `apps/web/src/components/editorFields.tsx` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -132,10 +132,11 @@ interface ViewsDraft {
 /**
  * A form's draft with `next` applied. A "Shown in" box the player has not set follows the app's
  * rule, so that giving an ability a tag that belongs in Explore lists it there without a second
- * tap. A box the player has set stays where they put it.
+ * tap. A box the player has set stays where they put it. `row` is the ability being edited: a
+ * feature's boxes follow nothing, because the app never lists a feature unasked.
  */
 export function withViews<D extends ViewsDraft>(
-  draft: D, next: Partial<D>, chosen: ViewsChosen, ritual: boolean,
+  draft: D, next: Partial<D>, chosen: ViewsChosen, row: { key?: string; ritual: boolean },
 ): { draft: D; chosen: ViewsChosen } {
   const merged: D = { ...draft, ...next };
   const now: ViewsChosen = {
@@ -143,7 +144,7 @@ export function withViews<D extends ViewsDraft>(
     explore: chosen.explore || next.inExplore !== undefined,
   };
   if (next.timing !== undefined || next.tags !== undefined) {
-    const auto = defaultViews({ timing: merged.timing, tags: merged.tags, ritual });
+    const auto = defaultViews({ key: row.key, timing: merged.timing, tags: merged.tags, ritual: row.ritual });
     if (!now.combat) merged.inCombat = auto.combat;
     if (!now.explore) merged.inExplore = auto.explore;
   }
```

Replace the whole of `apps/web/src/components/useAbilityEdit.tsx` with:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { AbilityEditor } from './AbilityEditor';
import { CustomAbilityEditor } from './CustomAbilityEditor';
import { FeatureEditor } from './FeatureEditor';

/** What the editor is open for: a row on the sheet, by key, or an ability that does not exist yet. */
type Target = { key: string } | 'new' | null;

interface Editing {
  /** Opens the editor for an ability or a feature. */
  edit: (row: { key: string }) => void;
  /** Opens the editor for a new ability of the player's own. */
  add: () => void;
  /** The open editor, to render once in the view. */
  editor: ReactNode;
}

/**
 * What a view needs to make Edit work. An ability the player added opens the custom ability
 * editor. A feature that already has rows in play opens the small editor that only hides it.
 * Everything else opens the ordinary one: an ability from the sheet, a custom action imported
 * from D&D Beyond, and a feature with no ability of its own, which is edited as the row it would
 * be in play. The row is remembered by key, so the editor closes by itself if the row leaves the
 * sheet while it is open.
 */
export function useAbilityEdit(): Editing {
  const sheet = useStore((s) => s.sheet);
  const customs = useStore((s) => s.edits.custom);
  const [target, setTarget] = useState<Target>(null);
  const close = (): void => setTarget(null);

  const key = target !== null && target !== 'new' ? target.key : null;
  const ability = sheet && key !== null
    ? [...sheet.abilities, ...sheet.universal].find((a) => a.key === key) ?? sheet.featureRows[key]
    : undefined;
  const custom = ability?.source === 'custom' ? customs.find((c) => c.key === ability.key) : undefined;
  const feature = sheet && key !== null && !ability
    ? sheet.featureSource.list.find((f) => f.key === key && f.playKeys.length > 0)
    : undefined;

  // Forget a row that has left the sheet, so its editor does not come back if the row does.
  useEffect(() => {
    if (key !== null && !ability && !feature) setTarget(null);
  }, [key, ability, feature]);

  let editor: ReactNode = null;
  if (target === 'new') editor = <CustomAbilityEditor custom={null} onClose={close} />;
  // Keyed, so that opening the editor for another row starts a new form.
  else if (custom) editor = <CustomAbilityEditor key={custom.key} custom={custom} onClose={close} />;
  else if (ability) editor = <AbilityEditor key={ability.key} ability={ability} onClose={close} />;
  else if (feature) editor = <FeatureEditor key={feature.key} feature={feature} onClose={close} />;

  return { edit: (row) => setTarget({ key: row.key }), add: () => setTarget('new'), editor };
}
```

Replace the whole of `apps/web/src/views/EditList.tsx` with:

```tsx
import { arrayMove } from '@dnd-kit/sortable';
import type { Ability, ViewName } from '@cw/model';
import { combatGroups, exploreAbilities, hiddenByDefault, withHidden, type CombatGroupName, type Sheet } from '@cw/rules';
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
  { group: 'passive', title: 'Always on' },
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

  /** A feature that D&D Beyond hides starts hidden, so hiding and restoring record only a choice that differs. */
  const setHidden = (ability: Ability, hidden: boolean): void =>
    setEdit(ability.key, withHidden(edits.abilities[ability.key], hidden, hiddenByDefault(sheet, ability.key)));

  /** Dragging and the two buttons both end here: the whole section's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder(view, next);
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
          onHide={(ability) => setHidden(ability, true)}
        />
      ))}

      <HiddenDrawer hidden={sheet.hidden} onRestore={(ability) => setHidden(ability, false)} />

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

Replace the whole of `apps/web/src/views/FeaturesView.tsx` with:

```tsx
import type { Feature } from '@cw/model';
import { featureLine, type Sheet } from '@cw/rules';
import { useState } from 'react';
import { Description } from '../components/Description';
import { useAbilityEdit } from '../components/useAbilityEdit';

interface RowProps {
  feature: Feature;
  onEdit: (feature: Feature) => void;
}

/** One feature: its name, where it comes from, and on tap the description and Edit. Nothing here is used or spent. */
function FeatureRow({ feature, onEdit }: RowProps) {
  const [open, setOpen] = useState(false);
  const line = featureLine(feature);
  return (
    <article aria-label={feature.name} className="border-t border-slate-200 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left">
        <span className="font-medium">{feature.name}</span>
        {feature.playKeys.length > 0 ? (
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900">In play</span>
        ) : null}
        {line ? <span className="block text-sm text-slate-600">{line}</span> : null}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-slate-100 p-2">
          <Description html={feature.description} />
          <button
            type="button"
            aria-label={`Edit ${feature.name}`}
            onClick={() => onEdit(feature)}
            className="mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium"
          >
            Edit
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** What the character has: every feature on the sheet, under a heading for where it comes from. */
export function FeaturesView({ sheet }: { sheet: Sheet }) {
  const { edit, editor } = useAbilityEdit();
  if (sheet.features.length === 0) return <p className="py-2 text-sm text-slate-600">This sheet lists no features.</p>;
  return (
    <div>
      {sheet.features.map((group) => (
        <section key={group.key} aria-label={group.heading} className="mt-4 first:mt-0">
          <h2 className="text-sm font-medium text-slate-700">{group.heading}</h2>
          {group.items.map((item) => (
            <div key={item.feature.key}>
              <FeatureRow feature={item.feature} onEdit={edit} />
              {item.options.length > 0 ? (
                <div role="group" aria-label={`${item.feature.name} options`} className="ml-4">
                  {item.options.map((option) => <FeatureRow key={option.key} feature={option} onEdit={edit} />)}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}
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

Expected: every test passes (1248 tests in 50 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Edit a feature: tick it into a view, or hide it" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 13: "Edit list" on the Features page: arrange, hide and restore

The Features page gets its own "Edit list" (spec section 10.4): each feature with a drag handle, "Move up" and "Move down", Edit and Hide; a "Hidden" drawer that starts with the entries D&D Beyond hides; and "Done". It has no "Add an ability": a feature comes from the sheet. An option is listed under its feature with Edit and Hide, and moves with it.

**Files:**
- Modify: `apps/web/src/components/ArrangeRow.tsx`
- Modify: `apps/web/src/components/ArrangeSection.tsx`
- Modify: `apps/web/src/components/HiddenDrawer.tsx`
- Modify: `apps/web/src/views/EditList.tsx`
- Create: `apps/web/src/views/FeatureEditList.tsx`
- Modify: `apps/web/src/views/FeaturesView.tsx`
- Create (test): `apps/web/src/views/featurelist.test.tsx`

**Interfaces:**
- Consumes:
  - `ArrangeSection`, `ArrangeRow`, `HiddenDrawer`, `moved` from `EditList.tsx` (Task 7); `useAbilityEdit` (the task before this one).
  - `sheet.features`, `sheet.hiddenFeatures`, `sheet.featureSource`, `withHidden` from `@cw/rules`; store `setEdit`, `setOrder('features', keys)`.
- Produces:
  - `FeatureEditList({ sheet, onDone })` in `apps/web/src/views/FeatureEditList.tsx`.
  - `ArrangeSection` rows are `{ key, label, below? }`, and `onEdit` and `onHide` are given the key. `below` is drawn under the row, inside it, so it is dragged with the row. `ArrangeRow` takes it as `children`.
  - `HiddenDrawer` lists anything with a `key` and a `name`: abilities or features.
  - `FeaturesView` has "Edit list" at the bottom, and says "Every feature is hidden. "Edit list" brings them back." when nothing is left to list.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/views/featurelist.test.tsx`:

```tsx
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';

const state = () => useStore.getState();

async function open(slug: Slug, storage = memoryStorage()) {
  const record = await seed(slug, storage);
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const key = (name: string): string => {
  const found = state().sheet?.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found.key;
};
const edits = () => state().edits.abilities;
const tap = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const arrange = () => tap('Edit list');
/** The rows of a group while arranging: the features that can be moved. */
const arranged = (heading: string) =>
  within(group(heading)).getAllByRole('listitem').map((row) => row.getAttribute('aria-label'));
/** The rows of a group while reading. */
const read = (heading: string) =>
  within(group(heading)).getAllByRole('article').map((row) => row.getAttribute('aria-label'));

describe('Edit list on the Features page', () => {
  it('shows each feature with a handle, arrows, Edit and Hide, and each option under its feature with Edit and Hide', async () => {
    await open('vlad');
    await arrange();
    expect(arranged('Warlock 3')).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Pact Magic', 'Magical Cunning', 'Warlock Subclass',
      'Tatzelwurm Spells', 'Shadowy Form', 'The Cost',
    ]);
    for (const control of ['Drag Alert', 'Move Alert up', 'Move Alert down', 'Edit Alert', 'Hide Alert']) {
      expect(within(group('Feats')).getByRole('button', { name: control })).toBeInTheDocument();
    }
    const options = within(group('Warlock 3')).getByRole('group', { name: 'Eldritch Invocations options' });
    expect(within(options).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Edit Pact of the Blade', 'Hide Pact of the Blade', 'Edit Armor of Shadows', 'Hide Armor of Shadows',
      'Edit Fiendish Vigor', 'Hide Fiendish Vigor',
    ]);
    // The options sit inside their feature's row, so they move with it.
    expect(within(within(group('Warlock 3')).getByRole('listitem', { name: 'Eldritch Invocations' })).getByRole('group')).toBe(options);
    expect(screen.queryByRole('button', { name: 'Add an ability' })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    await tap('Done');
    expect(read('Feats')[0]).toBe('Alert');
    expect(screen.getByRole('button', { name: 'Edit list' })).toBeInTheDocument();
  });

  it('moves a feature within its group with the arrows, keeps the order after Done, and stores it', async () => {
    const storage = memoryStorage();
    const record = await open('vlad', storage);
    await arrange();
    expect(within(group('Feats')).getByRole('button', { name: 'Move Alert up' })).toBeDisabled();
    await tap('Move Lucky up');
    expect(arranged('Feats')).toEqual(['Alert', 'Lucky', 'Criminal Ability Score Improvements', 'Dark Bargain']);
    await tap('Move Eldritch Invocations down');
    expect(arranged('Warlock 3').slice(0, 3)).toEqual(['Core Warlock Traits', 'Pact Magic', 'Eldritch Invocations']);
    await tap('Done');
    expect(read('Feats')).toEqual(['Alert', 'Lucky', 'Criminal Ability Score Improvements', 'Increase three scores (+1 / +1 / +1)', 'Dark Bargain']);
    expect(read('Warlock 3').slice(0, 6)).toEqual([
      'Core Warlock Traits', 'Pact Magic', 'Eldritch Invocations', 'Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor',
    ]);
    // Each group that was arranged is recorded whole; the views' own orders are untouched.
    expect(state().edits.order.combat).toEqual([]);
    expect(state().edits.order.features).toEqual([
      key('Alert'), key('Lucky'), key('Criminal Ability Score Improvements'), key('Dark Bargain'),
      key('Core Warlock Traits'), key('Pact Magic'), key('Eldritch Invocations'), key('Magical Cunning'),
      key('Warlock Subclass'), key('Tatzelwurm Spells'), key('Shadowy Form'), key('The Cost'),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = (await storage.listItems(record.id)).filter((item) => item.kind === 'order');
    expect(stored).toMatchObject([{ key: 'features', data: state().edits.order.features, dirty: true }]);
  });

  it('hides a feature into the drawer, which starts with what D&D Beyond hides, and restores from it', async () => {
    await open('vlad');
    await arrange();
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    await tap('Hide Alert');
    expect(arranged('Feats')).not.toContain('Alert');
    expect(edits()).toEqual({ [key('Alert')]: { hidden: true } });
    await userEvent.click(screen.getByText('Hidden (3)'));
    await tap('Restore Alert');
    expect(edits()).toEqual({});
    expect(arranged('Feats')).toContain('Alert');
    await tap('Restore Languages');
    expect(edits()).toEqual({ [key('Languages')]: { hidden: false } });
    expect(arranged('Human')).toContain('Languages');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    await tap('Hide Languages');
    expect(edits()).toEqual({});
    await tap('Done');
    expect(read('Human')).not.toContain('Languages');
  });

  it('lists the options of a hidden feature as rows of their own, and hides one option alone', async () => {
    await open('vlad');
    await arrange();
    await tap('Hide Armor of Shadows');
    expect(edits()).toEqual({ [key('Armor of Shadows')]: { hidden: true } });
    expect(within(screen.getByRole('group', { name: 'Eldritch Invocations options' })).queryByRole('button', { name: 'Edit Armor of Shadows' })).toBeNull();
    await tap('Hide Eldritch Invocations');
    expect(arranged('Warlock 3').slice(-2)).toEqual(['Pact of the Blade', 'Fiendish Vigor']);
    expect(screen.queryByRole('group', { name: 'Eldritch Invocations options' })).toBeNull();
    expect(within(group('Warlock 3')).getByRole('button', { name: 'Move Fiendish Vigor up' })).toBeEnabled();
  });

  it('opens the editor from a row and from an option', async () => {
    await open('vlad');
    await arrange();
    await tap('Edit Alert');
    const dialog = screen.getByRole('dialog', { name: 'Edit Alert' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Explore' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(edits()).toEqual({ [key('Alert')]: { inExplore: true } });
    await tap('Edit Fiendish Vigor');
    expect(screen.getByRole('dialog', { name: 'Edit Fiendish Vigor' })).toHaveTextContent('In play as:');
  });

  it('still offers "Edit list" when every feature is hidden, so they can be brought back', async () => {
    await open('vlad');
    act(() => {
      for (const feature of state().sheet?.featureSource.list ?? []) {
        if (!feature.hiddenOnSheet) state().setEdit(feature.key, { hidden: true });
      }
    });
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText('Every feature is hidden. "Edit list" brings them back.')).toBeInTheDocument();
    await arrange();
    await userEvent.click(screen.getByText('Hidden (25)'));
    await tap('Restore Alert');
    await tap('Done');
    expect(read('Feats')).toEqual(['Alert']);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm exec vitest run apps/web/src/views/featurelist.test.tsx
```

Expected: FAIL. `./FeatureEditList` cannot be found, and the Features page has no "Edit list".

- [ ] **Step 3: Write the implementation**

Arranging one group records that whole group's order, as it does in the views. Only the group's own rows are recorded: options are not, because they follow their feature.

When a feature is hidden its options become rows of their own at the end of the group, and can then be moved like any other row.

The page tells "no features on this sheet" from "every feature is hidden" by `sheet.featureSource.list`, which holds every feature whatever is hidden. Without that, a player who hid everything could not reach the drawer to bring anything back.

The drag itself is the component of Task 7 and is tested there from the keyboard. These tests use the buttons.

Replace the whole of `apps/web/src/components/ArrangeRow.tsx` with:

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

const ICON = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 disabled:text-slate-300';
const TEXT = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-indigo-700';

interface Props {
  /** The ability's or feature's key: what the row is sorted by. */
  id: string;
  /** The name the row and its buttons are known by. */
  label: string;
  first: boolean;
  last: boolean;
  /** -1 moves the row up one place, 1 down one. */
  onStep: (direction: -1 | 1) => void;
  onEdit: () => void;
  onHide: () => void;
  /** Shown under the row, across its whole width, and dragged with it. */
  children?: ReactNode;
}

/**
 * One row while arranging: a handle to drag it by, its name, and buttons that move, edit and hide
 * it. It has no Use button, so nothing is spent by a stray tap.
 */
export function ArrangeRow({ id, label, first, last, onStep, onEdit, onHide, children }: Props) {
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
      {children ? <div className="basis-full">{children}</div> : null}
    </li>
  );
}
```

Replace the whole of `apps/web/src/components/ArrangeSection.tsx` with:

```tsx
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { ArrangeRow } from './ArrangeRow';

/** One row of a section: an ability's or a feature's key, and the name it is known by. */
export interface ArrangeItem {
  key: string;
  label: string;
  /** Shown under the row and moved with it: a feature's options. */
  below?: ReactNode;
}

interface Props {
  title: string;
  items: ArrangeItem[];
  /** The row with `activeKey` was dropped on, or stepped onto, the row with `overKey`. Both are in this section. */
  onMove: (activeKey: string, overKey: string) => void;
  onEdit: (key: string) => void;
  onHide: (key: string) => void;
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
  const keys = items.map((item) => item.key);
  const labelOf = (id: UniqueIdentifier): string => items.find((item) => item.key === id)?.label ?? 'the row';
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
            {items.map(({ key, label, below }, index) => (
              <ArrangeRow
                key={key}
                id={key}
                label={label}
                first={index === 0}
                last={index === items.length - 1}
                onStep={(direction) => onMove(key, keys[index + direction])}
                onEdit={() => onEdit(key)}
                onHide={() => onHide(key)}
              >
                {below}
              </ArrangeRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
```

Replace the whole of `apps/web/src/components/HiddenDrawer.tsx` with:

```tsx
interface Props<T> {
  hidden: T[];
  onRestore: (row: T) => void;
}

/** The abilities or features that are hidden, folded away, each with a way back. Nothing when none is hidden. */
export function HiddenDrawer<T extends { key: string; name: string }>({ hidden, onRestore }: Props<T>) {
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

Replace the whole of `apps/web/src/views/EditList.tsx` with:

```tsx
import { arrayMove } from '@dnd-kit/sortable';
import type { ViewName } from '@cw/model';
import { combatGroups, exploreAbilities, hiddenByDefault, withHidden, type CombatGroupName, type Sheet } from '@cw/rules';
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
  { group: 'passive', title: 'Always on' },
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

  /** A feature that D&D Beyond hides starts hidden, so hiding and restoring record only a choice that differs. */
  const setHidden = (key: string, hidden: boolean): void =>
    setEdit(key, withHidden(edits.abilities[key], hidden, hiddenByDefault(sheet, key)));

  /** Dragging and the two buttons both end here: the whole section's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder(view, next);
  }

  return (
    <div>
      {sections.map(({ title, abilities }) => (
        <ArrangeSection
          key={title}
          title={title}
          items={abilities.map((ability) => ({ key: ability.key, label: rowLabel(ability, sheet) }))}
          onMove={(activeKey, overKey) => reorder(abilities.map((a) => a.key), activeKey, overKey)}
          onEdit={(key) => edit({ key })}
          onHide={(key) => setHidden(key, true)}
        />
      ))}

      <HiddenDrawer hidden={sheet.hidden} onRestore={(ability) => setHidden(ability.key, false)} />

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

Create `apps/web/src/views/FeatureEditList.tsx`:

```tsx
import type { Feature } from '@cw/model';
import { withHidden, type FeatureItem, type Sheet } from '@cw/rules';
import { ArrangeSection } from '../components/ArrangeSection';
import { HiddenDrawer } from '../components/HiddenDrawer';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useStore } from '../store';
import { moved } from './EditList';

const TEXT = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-indigo-700';

interface Props {
  sheet: Sheet;
  onDone: () => void;
}

/**
 * The Features page while it is being arranged: the same features under the same headings, each
 * with a handle. Features are put in order within their group, edited, hidden and restored here.
 * An option stays under its feature and moves with it. Nothing is added here: a feature comes
 * from the sheet.
 */
export function FeatureEditList({ sheet, onDone }: Props) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const setOrder = useStore((s) => s.setOrder);
  const { edit, editor } = useAbilityEdit();

  /** A feature that D&D Beyond hides starts hidden, so only a choice that differs from that is recorded. */
  const setHidden = (feature: Feature, hidden: boolean): void =>
    setEdit(feature.key, withHidden(edits.abilities[feature.key], hidden, feature.hiddenOnSheet));
  const hide = (key: string): void => {
    const feature = sheet.featureSource.list.find((f) => f.key === key);
    if (feature) setHidden(feature, true);
  };

  /** Dragging and the two buttons both end here: the whole group's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder('features', next);
  }

  const options = ({ feature, options: chosen }: FeatureItem) =>
    chosen.length === 0 ? undefined : (
      <div role="group" aria-label={`${feature.name} options`} className="ml-11">
        {chosen.map((option) => (
          <div key={option.key} className="flex items-center gap-x-1 border-t border-slate-200">
            <span className="min-w-0 flex-1">{option.name}</span>
            <button type="button" aria-label={`Edit ${option.name}`} onClick={() => edit(option)} className={TEXT}>Edit</button>
            <button type="button" aria-label={`Hide ${option.name}`} onClick={() => setHidden(option, true)} className={TEXT}>Hide</button>
          </div>
        ))}
      </div>
    );

  return (
    <div>
      {sheet.features.map((group) => {
        const keys = group.items.map((item) => item.feature.key);
        return (
          <ArrangeSection
            key={group.key}
            title={group.heading}
            items={group.items.map((item) => ({ key: item.feature.key, label: item.feature.name, below: options(item) }))}
            onMove={(activeKey, overKey) => reorder(keys, activeKey, overKey)}
            onEdit={(key) => edit({ key })}
            onHide={hide}
          />
        );
      })}

      <HiddenDrawer hidden={sheet.hiddenFeatures} onRestore={(feature) => setHidden(feature, false)} />

      <button type="button" onClick={onDone} className="mt-4 min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
        Done
      </button>

      {editor}
    </div>
  );
}
```

Replace the whole of `apps/web/src/views/FeaturesView.tsx` with:

```tsx
import type { Feature } from '@cw/model';
import { featureLine, type Sheet } from '@cw/rules';
import { useState } from 'react';
import { Description } from '../components/Description';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { FeatureEditList } from './FeatureEditList';

interface RowProps {
  feature: Feature;
  onEdit: (feature: Feature) => void;
}

/** One feature: its name, where it comes from, and on tap the description and Edit. Nothing here is used or spent. */
function FeatureRow({ feature, onEdit }: RowProps) {
  const [open, setOpen] = useState(false);
  const line = featureLine(feature);
  return (
    <article aria-label={feature.name} className="border-t border-slate-200 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left">
        <span className="font-medium">{feature.name}</span>
        {feature.playKeys.length > 0 ? (
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900">In play</span>
        ) : null}
        {line ? <span className="block text-sm text-slate-600">{line}</span> : null}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-slate-100 p-2">
          <Description html={feature.description} />
          <button
            type="button"
            aria-label={`Edit ${feature.name}`}
            onClick={() => onEdit(feature)}
            className="mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium"
          >
            Edit
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** What the character has: every feature on the sheet, under a heading for where it comes from. */
export function FeaturesView({ sheet }: { sheet: Sheet }) {
  const { edit, editor } = useAbilityEdit();
  /** True while the player is arranging the list instead of reading it. */
  const [arranging, setArranging] = useState(false);

  if (sheet.featureSource.list.length === 0) return <p className="py-2 text-sm text-slate-600">This sheet lists no features.</p>;
  if (arranging) return <FeatureEditList sheet={sheet} onDone={() => setArranging(false)} />;

  return (
    <div>
      {sheet.features.length === 0 ? (
        <p className="py-2 text-sm text-slate-600">Every feature is hidden. "Edit list" brings them back.</p>
      ) : null}
      {sheet.features.map((group) => (
        <section key={group.key} aria-label={group.heading} className="mt-4 first:mt-0">
          <h2 className="text-sm font-medium text-slate-700">{group.heading}</h2>
          {group.items.map((item) => (
            <div key={item.feature.key}>
              <FeatureRow feature={item.feature} onEdit={edit} />
              {item.options.length > 0 ? (
                <div role="group" aria-label={`${item.feature.name} options`} className="ml-4">
                  {item.options.map((option) => <FeatureRow key={option.key} feature={option} onEdit={edit} />)}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}

      <button
        type="button"
        onClick={() => setArranging(true)}
        className="mt-4 min-h-11 w-full rounded-lg border border-slate-400 px-3 py-2 font-medium"
      >
        Edit list
      </button>

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

Expected: every test passes (1254 tests in 51 files) and the type check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "\"Edit list\" on the Features page: arrange, hide and restore" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 14: Check editing at phone width, and update the README

Part B is complete in code. This task checks it in a real browser against the in-memory account, describes editing in the README, and records what was found.

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`

**Interfaces:**
- Consumes:
  - Everything in this plan.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Run the checks, then walk through editing in a browser**

Run the three checks. Every one must pass before the walk-through.

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

Then start the dev server and open it in a browser at 375 px wide:

```bash
pnpm dev
```

Sign in as the test player and add a character by pasting the contents of `fixtures/characters/vlad.json`. Then walk through all of the following. Every point must hold before the task is committed. Fix what does not hold in the code of the task that owns it, with a test that fails first, and say so in the report.

Abilities:

1. In the Combat view, open the Hex row. It shows its description and an "Edit" button. Tap it: a sheet rises from the bottom titled "Edit Hex", with Timing, Tags, Shown in, Roll and "Hide this ability", and the note "This ability costs a spell slot."
2. Tap the Utility tag. The Explore box ticks itself. Save. The Hex row now carries "utility" and "edited", and Hex is listed in the Explore view.
3. Open the editor for Hex again. "Back to imported" is offered. Tap it: the row loses "utility" and "edited".
4. Open the editor for a weapon, change the attack bonus, and save. The roll line shows the new bonus.
5. Open the editor for Dash (under "Anyone can do this"), tick "Limited uses" with a maximum of 2, and save. Dash shows "2 left", a chip with two pips appears among the resources (behind "more" if there are more than four), and Use spends one.
6. Tap "Edit list" at the bottom of the Combat view. Every row shows a drag handle, up and down arrows, Edit and Hide, and no Use button. The two rows named Misty Step read "Misty Step (pact slot)" and "Misty Step (free cast)".
7. Drag a row by its handle to another place in its group, with a mouse and, if a touch screen is to hand, with a finger. It lands where it was dropped and cannot leave its group. Then move a row with its arrows.
8. Hide "Initiate a Circle Spell". It moves to "Hidden (1)" at the foot of the list. Tap "Done": the row is gone from the Combat view and the order you arranged is kept.
9. Open the Explore view. Its order has not changed. Arrange it, and check that the Combat view's order has not changed.
10. In "Edit list", tap "Add an ability". Give it a name, a Bonus Action timing, limited uses and a description that contains a `<` and a line break. Save, then "Done". The row is in the Bonus Action group with pips, and its description shows the `<` as typed, on two lines.
11. Open the new row's editor from "Edit". It is the custom editor, with Name, Description and Delete. Delete it: the browser asks first, and the row is gone.

Features:

12. Open the Features page and open the Alert row. It shows "Edit". Tap it: the sheet is titled "Edit Alert" and starts with "Shown in", both boxes unticked, and the line "A feature is listed in Combat or Explore only when you tick it here." Timing reads Passive.
13. Change the timing and tap a tag. Neither box ticks itself. Put the timing back to Passive, tick Combat and save.
14. Open the Combat view. "Always on (1)" is listed after "No action needed". Open it: Alert is there with no Use button and no "edited" label. Alert is still on the Features page.
15. From the Alert row in Combat, tap Edit, tick "Limited uses" with a maximum of 1, and save. The row has a Use button and "1 left", and the Alert chip is among the resources.
16. On the Features page, open Lucky and tap Edit. The sheet says "In play as: Luck Points. Change those rows where they are listed, in Combat or Explore." and offers only "Hide this feature", Save and Cancel.
17. Tap "Edit list" at the bottom of the Features page. Each feature shows a handle, arrows, Edit and Hide. Under Eldritch Invocations its three options are listed, indented, each with Edit and Hide and no arrows. There is no "Add an ability". "Hidden (2)" holds Eldritch Invocation Options and Languages.
18. Move Eldritch Invocations down with its arrow: its options move with it. Hide Size: it joins the drawer. Restore Languages from the drawer: it appears under the species.
19. Hide Eldritch Invocations. Its three options are now rows of their own at the end of the class's group, with arrows. Restore it: they go back under it.
20. Tap "Done". The Features page shows the order you arranged, without Size and with Languages.
21. In the Combat view's "Edit list", hide Alert. It leaves the list and is in "Hidden" there. It is also gone from the Features page and is in that page's "Hidden". Restore it from either.

Everything together:

22. Reload the page. Every edit, both views' orders, the Features page's order and everything hidden are as you left them.
23. No button or link is shorter than 44 px, and no screen scrolls sideways, including with an editor open and with "Edit list" on.
24. The browser's console shows no errors.

- [ ] **Step 2: Write the implementation**

The README gains an "Editing a sheet" section. In the findings file, the two faults that were left for "before Part B" are recorded as settled, the option key finding is recorded as settled, a section "Part B: editing and arranging" lists what was found and left, and three lines join "Not verified in milestone 3".

If the walk-through finds something that is not fixed, add it to the findings file's new section in the same commit.

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
- **Features** lists everything the sheet says the character has. None of it is put in Combat or Explore by the app: open a feature, tap Edit, and tick Combat or Explore. It then sits under "Always on" until you give it another timing.
- The Features page has its own "Edit list" for ordering, hiding and restoring. It starts with the entries D&D Beyond hides on its own sheet already in "Hidden".
- A feature that already has rows in play (Rage, Lucky) is edited through those rows; its own editor only hides it.
- Edits sync like everything else, so a table admin can fix a player's sheet from their own device.

## Deploying

The site is static and is built with `pnpm build` into `apps/web/dist`. It needs two values at build time, both public: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the project's publishable key). `apps/web/.env.example` lists them.

The database is created from `supabase/migrations` with `pnpm dlx supabase db push --remote`, and the import function is deployed with `pnpm dlx supabase functions deploy import-character --use-api`. The function answers only the origins listed in its `ALLOWED_ORIGINS` secret, and only signed-in, approved players.

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

Apply this change to `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md` (lines starting `-` are removed, lines starting `+` are added, the rest is unchanged context):

```diff
@@ -70,10 +70,10 @@ The whole of Part A was reviewed once more after its last task. It found nothing
 
 Also fixed: anyone who signed in before the database script was applied gets a profile when it is applied.
 
-Settle before Part B adds edits, because an edit is not written again by the next tap the way play state is:
+Two faults were left to settle before Part B added edits, because an edit is not written again by the next tap the way play state is. Part B's first two tasks fixed both, each with tests that fail without the fix:
 
-- The sync engine and the store read a record, decide, and write it back in separate storage calls. A change the player makes in between is overwritten and marked as sent. The gap is a few milliseconds. Make each of these one storage operation.
-- The item cursor moves past items whose character the device does not hold yet. A character that arrives a round later, or comes back after being deleted on the device, arrives without its older items. Since a fetch now comes a page at a time, this no longer needs unlucky timing: when a table admin's first fetch is cut short on a weak signal, the characters that arrive in the next round come without their play state until their player next changes something. Start the item fetch from the beginning when a character becomes live on the device.
+- The sync engine and the store read a record, decided, and wrote it back in separate storage calls, so a change the player made in between was overwritten and marked as sent. The device's storage now looks at a record and writes it in one step, and the sync engine, play state and edits all go through that.
+- The item cursor moved past items whose character the device did not hold yet, so a character that arrived a round later, or came back after being deleted on the device, arrived without its older items. The item fetch now starts from the beginning whenever a character becomes live on the device.
 
 Left, smallest first:
 
@@ -98,7 +98,7 @@ Left, smallest first:
 
 The Features page (plan `2026-11-21-features-page.md`) was reviewed task by task and once more as a whole. Found and left, smallest first. None blocks merging.
 
-- The same option chosen under two parents gets `#2` by its position in the sheet's list. Part B stores edits by key, so settle this in Part B's plan.
+- The same option chosen under two parents got `#2` by its position in the sheet's list. Settled in Part B: an option's key now names the feature it is attached to.
 - Two features with the same IDs both get the same play rows. No fixture has one; when it happens it is one entry listed twice.
 - An orphan option from a list the app does not know (the sheet has one for items) is shown among the feats.
 - A feature row's button says whether it is open but does not point at the text it opens. Ability rows have the same shape; change both together.
@@ -107,6 +107,25 @@ The Features page (plan `2026-11-21-features-page.md`) was reviewed task by task
 - A standard background whose feature name is only spaces is chosen over a custom background's feature, and then left out. It needs a malformed sheet.
 - A feature with no ID is keyed by its trimmed name, so a name that gains or loses a space at its ends keeps its key. Nothing stored a key before this, so no stored edit moved.
 
+## Part B: editing and arranging
+
+Found while Part B's plan (`2026-11-22-milestone-3-part-b-overlays.md`) was being built and checked. Smallest first. None blocks merging.
+
+- A hidden custom ability cannot be deleted until it is restored, because a hidden row offers only Restore.
+- Two hidden rows with the same name have the same "Restore" button name.
+- Saving a custom ability's editor replaces the whole edit stored under its key with where it is shown and whether it is hidden. Any other field there, which only another version of the app could have written, is dropped.
+- When a dialog opens, focus lands on the dialog and not on its first field.
+- Deleting a custom ability, deleting a character and signing out with unsynced changes ask with the browser's own confirm box, not with a dialog of the app's.
+- "Start my turn" stays pinned at the bottom of the Combat view while the list is being arranged.
+- A feature's row in a view comes after every ability in its group until the player arranges that group.
+- Hide on a feature's row in a view's "Edit list" hides the feature everywhere, the Features page included. Unticking "Shown in" is how to take it out of one view. The row can be restored from either "Hidden" drawer.
+- A feature's options keep the sheet's order under it. They can be edited and hidden, and cannot be put in order among themselves.
+- Only four pools are shown above the list before "more", so a pool the player has just given a feature or an ability can be behind that button.
+- A re-import still takes its time stamp from the copy in memory, and deleting a character is still two storage steps (listed above under Part A). Only the sync engine, play state and edits were moved to the one-step write.
+- The JavaScript bundle is over 600 kB before compression, mostly supabase-js and dnd-kit. Milestone 5 (offline and install) is the place to split it.
+
+Decided, and to revisit if it annoys: a feature that already has rows in play is not offered "Shown in". A feat with several parts, only one of which has an ability, cannot be ticked into a view as a reminder of the rest; the player adds a custom ability for that (spec section 5.5).
+
 ## Task 13: done
 
 The owner ran Task 13 on 2026-11-19, and the Part A pull request is merged.
@@ -133,5 +152,8 @@ What Task 13's steps got wrong, found with Supabase CLI 3.2.0. The plan and the
 - Whether a successful fetch from the character service redirects. An unknown ID answers 403 directly; the import function now follows no redirects.
 - An offline start, end to end: sign in, wait more than an hour, turn on aeroplane mode, open the app. It should say the changes are waiting, not "Sign in again to sync", and sync by itself within about two minutes of the connection coming back, while the app is on screen (the auth library waits a minute after a renewal fails, then tries every 30 seconds). Tests cover the app's side; the auth library's side was read in its source, not run. Check it in Task 13.
 - What the screen shows between returning from Discord and the sign-in finishing. From the code, the sign-in screen shows again for a moment.
+- Dragging in "Edit list" on a real touch screen. It was checked with a mouse; the tests cover the keyboard and the up and down buttons.
+- An edit made on one device appearing on another, on the deployed site. Tests cover it against the in-memory account.
+- One database test ("gives them a profile: named as on Discord, not approved, not an admin") failed once in a full run while Part B's plan was being built, and passed on three reruns and in every later run. Nothing in Part B touches the database. If it fails again, look at how the test waits for the in-process Postgres.
 - A real feature description on the Features page at phone width. The test sheets' descriptions are placeholders, so long text and wide tables were not seen there. The page uses the same description display as every ability row.
 - Whether D&D Beyond fills in a required level on species traits that are gained later. Every trait on the test sheets has none. The app leaves out a trait whose required level is above the character's.
```

- [ ] **Step 3: Run everything**

Run:

```bash
pnpm test
```

```bash
pnpm typecheck
```

Expected: every test passes (1254 tests in 51 files) and the type check prints no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Describe editing in the README and record what Part B found" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

## Done when

- `pnpm test` passes, `pnpm typecheck` is clean and `pnpm build` succeeds at the end of Task 14.
- The walk-through in Task 14 passes at 375 px wide.
- An edit made on one device appears on another signed in to the same account, checked by the owner on the deployed site.

## Design points settled while this plan was built

The spec was changed to match where it said something else or said nothing. Each is cheap to change before execution.

- **An option's key names its parent** (Task 9), so that the same option under two features has two stable keys. Spec section 5.5.
- **A feature that already has rows in play is not offered "Shown in"** (Task 12). This is the spec's rule as it was. The cost is in the spec: a feat with several parts, only one of which has an ability (War Caster), cannot be ticked into a view as a reminder of the rest. Offering "Shown in" for those too is a small change to Tasks 11 and 12: `applyEdits` builds a row for every feature, and `useAbilityEdit` opens the ordinary editor for all of them.
- **Hide on a feature's row in a view hides the feature everywhere,** and the hidden feature is listed in both "Hidden" drawers (Tasks 11 and 12). The spec said only that hiding takes it off all three pages.
- **A feature's row is marked "edited" only when its timing, uses, tags or roll were changed** (Task 11). A tick alone is not an edit to what the row says.
- **In a feature's editor "Shown in" comes first** (Task 12).
- **A feature's options keep the sheet's order** and are not arranged among themselves (Task 13).
- **A pool that nothing listed spends is not shown** (Task 11): this extends the spec's rule for hidden abilities to a feature in neither view.

## Known gaps carried forward

- Druid, Monk, Paladin and Ranger still have no fixture.
- Two people changing the same item at the same moment lose the earlier change silently (spec section 12). The whole of what is spent is one item, and so is each view's order and the Features page's order.
- A device learns of another device's change at its next fetch, up to 30 seconds later. There are no live updates.
- A replaced roll is fixed text and does not follow a level-up (spec section 7).
- The sheet's own numbers (skills, saving throws, initiative, Armor Class, spell attack bonus and save DC) cannot be overridden (spec section 16).
- Upcasting still does not change a spell's damage in the roll line; the player can now replace the roll by hand.
- A custom ability's numbers, and a feature's row's, are typed in and do not scale with level.
- The app does not suggest which features to tick. A new player has to know which ones matter in a fight (spec section 17).
- Dragging in "Edit list" is tested from the keyboard and through the "Move up" and "Move down" buttons. A pointer or touch drag is checked by hand in the walk-through, and has not been tried on a real touch screen.
- A re-import still takes its time stamp from the copy in memory, and deleting a character is still two storage steps. Task 1 moved the sync engine, play state and edits to the one-step write, and left these.
- What the reviews of this plan's code find and leave goes in `docs/superpowers/plans/2026-11-18-milestone-3-deferred-findings.md`, under "Part B: editing and arranging".
