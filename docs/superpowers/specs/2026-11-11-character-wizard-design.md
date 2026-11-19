# Character Wizard: design

Date: 2026-11-11
Status: approved in conversation, awaiting written review. Milestone 2 decisions added 2026-11-11 (sections 4, 5, 6, 8, 10, 12, 15 and 17). Milestone 3 decisions added 2026-11-18 (sections 2, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16 and 17).

## 1. Purpose

New players at a home D&D table struggle to follow the rules and to find a flow for how their character plays. Character Wizard imports a character from D&D Beyond and presents a simplified, phone-first view for use during play. It shows what the character can do, grouped by when they can do it, with the exact roll written out, and it suggests legal, sensible turns.

**Audience for this version:** one home table (seven players and their DM). The design must not block a later public release, where homebrew content is the norm rather than the exception.

**Rules basis:** D&D SRD 5.2 (2024 rules), licensed CC-BY-4.0.

### Design principle: general, not fitted

The app is built for any D&D Beyond character, not for the characters used to test it.

- No code may branch on a specific character, subclass, item, campaign or table.
- The converter and engine work only from D&D Beyond's general data structure and from tags.
- Real characters are fixtures: examples that prove the maths and expose edge cases. Passing the fixtures is evidence, not the goal.
- Content the app has never seen (homebrew, third-party, new sourcebooks) must still import, calculate and display. At worst its abilities start untagged and are ordered by the player's own ordering and usage.

## 2. Decisions

| Topic | Decision |
|---|---|
| Launch audience | The DM's own table first; by approval only |
| Sign-in | Discord, through Supabase Auth. Sign-in is required to use the app. No passwords and no emails |
| Who may use it | Anyone can sign in with Discord. A new account can do nothing until a table admin approves it in the app |
| Table admin | Can open and edit every character at the table, exactly as its owner can |
| Edits | A player's changes are layered over the imported sheet by ability key and survive a re-import. Playing and arranging are separate modes |
| Play tracking | The app tracks the turn (Action, Bonus Action, Reaction) and limited-use resources (spell slots, feature uses). Hit points and conditions stay on D&D Beyond or paper |
| Suggestion intelligence | Deterministic rules plus tags. No machine learning and no LLM in this version |
| Homebrew | First-class. Every ability is tagged from one of three sources: imported data, curated SRD data, or user edits. The engine reads only tags |
| Architecture | Client-side engine. Sheet maths and suggestions run in the browser; Supabase stores data |
| Layout | Phone first |
| Mobile path | Capacitor wrapping the web app. React Native is not planned, because it would require rewriting the UI layer |

## 3. Import check findings

A real character (level 3 Warlock, 2024 rules, homebrew subclass and homebrew weapons) was fetched on 2026-11-11 from:

```
GET https://character-service.dndbeyond.com/character/v5/character/{id}
```

This endpoint is undocumented and unofficial. Findings:

- **Privacy:** a Private sheet returns HTTP 403 with `"serverMessage": "Unauthorized Access Attempt."`. A Public sheet returns HTTP 200 and about 250 KB of JSON to a plain request with no special headers. Campaign Only is not expected to work because the request is unauthenticated.
- **Spells are fully structured:** activation type, concentration, range, save ability or attack roll, upcasting, and D&D Beyond's own purpose tags (observed: `Damage`, `Control`, `Buff`, `Debuff`, `Warding`, `Teleportation`, `Social`, `Deception`, `Combat`).
- **Official class actions are structured:** activation type and limited uses (fixed, ability-modifier based, or proficiency-bonus based) with a reset type.
- **Homebrew items are structured:** base weapon type, damage dice, properties including weapon masteries, granted modifiers (for example `+1d6 poison`), and limited uses. Rules that exist only in the description (for example level scaling) are not structured.
- **Homebrew subclass effects are structured where the author wired them up:** save bonuses, advantage, always-prepared spells, and free spell casts tied to the granting feature by `componentId`.
- **Homebrew feature timing is text only.** A feature whose description says "takes a bonus action" has no activation type and does not appear in `actions`. It needs a tag from the user.
- **No derived numbers.** Attack bonuses, save DC and slot counts are absent. `pactMagic` and `spellSlots` report zero available; the real counts come from `classes[].definition.spellRules.levelSpellSlots`.
- **Noise exists.** Sourcebook-granted actions that the player never uses appear in `actions.class` (seven "Circle Spell" entries on this character).

A second pass the same day fetched thirteen more character IDs. Seven returned data and six returned the 403 above. The eight accessible characters are all single-class and all on 2024 rules:

| Class and level | Subclass | Homebrew present |
|---|---|---|
| Barbarian 3 | Path of the Pack Queen | Subclass, item, feat, one custom action |
| Bard 3 | College of the Soloist | Subclass, item, three custom items |
| Cleric 3 | Life Domain | Item |
| Fighter 9 | Eldritch Knight | Items |
| Rogue 3 | Shadow Stalker | Subclass, item |
| Sorcerer 3 | Prophet of Flame | Subclass, feat |
| Warlock 3 | Thressia, Spirit of the Tatzelwurm | Subclass, items |
| Wizard 3 | Grandmaster | Subclass, item, two custom items |

Additional findings from the wider set:

- `customActions` and `customItems` are in use and must be converted like any other ability or item.
- Homebrew feats occur as well as homebrew subclasses and items.
- A level 9 Fighter brings Extra Attack, so the Attack action must state how many attacks it grants.

ID mappings observed across the eight characters:

| Field | Values |
|---|---|
| Ability (`statId`, `saveDcAbilityId`) | 1 Strength, 2 Dexterity, 3 Constitution, 4 Intelligence, 5 Wisdom, 6 Charisma |
| `activation.activationType` | 1 Action, 2 No Action (Font of Magic conversion), 3 Bonus Action, 4 Reaction, 6 Minute, 7 Hour, 8 Special (Action Surge, Indomitable) |
| `limitedUse.resetType` (numeric) | 1 Short Rest (Action Surge), 2 Long Rest |
| `limitedUse.resetType` (items, string) | `"LongRest"`, `"Dawn"`, `"Consumable"` |
| Spell tags | `Damage`, `Control`, `Buff`, `Debuff`, `Warding`, `Healing`, `Utility`, `Social`, `Deception`, `Detection`, `Communication`, `Exploration`, `Teleportation`, `Summoning`, `Shapechanging`, `Combat` |

Any value not listed here must be handled as unknown, not rejected: the ability is still shown, with timing `unknown` or tag `utility`.

## 4. Architecture

One TypeScript monorepo (pnpm workspaces).

| Part | Job | Depends on |
|---|---|---|
| `packages/ddb-import` | Converts raw D&D Beyond JSON into the app's `Character` format. All D&D Beyond quirks live here | Nothing |
| `packages/model` | Shared types and constants: `Character`, `Ability`, ability and skill names | Nothing |
| `packages/rules` | Sheet maths, action economy, suggestion engine. Pure functions with no network or UI code | The `Character` format |
| `apps/web` | React + Vite PWA: screens, taps, local turn state, sync | Both packages, Supabase |
| `supabase/` | Auth, Postgres tables with row-level security, one Edge Function for import | Nothing of ours |

Libraries: React, Vite, Tailwind CSS, Zustand for client state, dnd-kit for drag and drop, supabase-js, vite-plugin-pwa, Vitest.

Libraries arrive with the milestone that first uses them: supabase-js and dnd-kit in milestone 3, vite-plugin-pwa in milestone 5. Milestone 2 calls the Edge Function with a plain `fetch`.

The Edge Function's logic lives in `supabase/functions/_shared/import-handler.ts`. It is written against the web-standard `Request` and `Response` only, so Vitest tests it and the Vite dev server mounts the same handler at the same path.

The web app routes by URL hash (`#/`, `#/import`, `#/about`, `#/players`, `#/c/{id}/combat`, `#/c/{id}/explore`), so the phone's back button works and static hosting needs no rewrite rules. A character ID is percent-encoded in the route.

From milestone 3 the web app reaches Supabase only through one `Remote` interface: sign-in, profiles, sending changes, fetching changes and import. `supabaseRemote` implements it with supabase-js. `memoryRemote` implements the same rules in memory. Tests use it, and the dev server uses it when no Supabase address is configured, with a "Continue as test player" button, so local development still needs no Supabase project.

If the endpoint changes, only `ddb-import` changes. A PDF or manual-entry importer can later produce the same `Character` format.

## 5. Data model

### 5.1 The ability shape

Everything a character can do is one record type.

```ts
// 'free' covers D&D Beyond's "No Action" and "Special": usable without spending
// an Action, Bonus Action or Reaction. 'long' covers anything taking a minute or more.
type Timing = 'action' | 'bonus' | 'reaction' | 'free' | 'passive' | 'long' | 'unknown';

type Tag =
  | 'damage' | 'healing' | 'buff' | 'debuff' | 'control'
  | 'movement' | 'defence' | 'utility' | 'social';

// DamagePart.dice is a dice expression ("1d8+3") or a flat number ("4", "0").
type Roll =
  | { kind: 'attack'; bonus: number; damage: DamagePart[]; optionalDamage: DamagePart[] }
  | { kind: 'save'; ability: AbilityName; dc: number; damage: DamagePart[] }
  | { kind: 'check'; bonus: number }
  // A spell with damage but no attack roll or saving throw (Hex).
  | { kind: 'damage'; damage: DamagePart[] }
  // A feature's dice whose meaning the import does not state (Second Wind, Bardic Inspiration).
  | { kind: 'dice'; dice: string }
  | { kind: 'none' };

type Cost =
  | { kind: 'none' }
  | { kind: 'slot'; minLevel: number; pact: boolean }
  | { kind: 'uses'; resourceKey: string };

interface Ability {
  key: string;                 // stable across re-imports
  name: string;
  source: 'spell' | 'class' | 'item' | 'feat' | 'species' | 'background' | 'universal' | 'custom';
  timing: Timing;
  roll: Roll;
  cost: Cost;
  poolKey: string | null;      // a pool shown on the row and spent by hand, never by Use
  tags: Tag[];
  concentration: boolean;
  ritual: boolean;
  range: string | null;
  area: boolean;               // affects an area; from the import's area-of-effect data
  description: string;         // from the player's own sheet
  notes: string[];             // short facts shown on the row: "From {item}", "Not attuned: ..."
  tagSource: 'import' | 'curated' | 'user' | 'none';
}
```

**Source:** the import cannot tell a subclass feature from a class feature, and nothing reads the difference, so both are `class`. Background actions are `background`.

**Weapon charges:** the import does not say what a weapon's charge does. A weapon whose item has a charge pool carries that pool's key in `poolKey`. The row shows the pool as pips that the player taps; Use on the weapon spends only the Action.

**Item-granted spells:** the cost is one charge of the item if the item has a pool, otherwise a spell slot if D&D Beyond flags the spell as slot-using, otherwise nothing. The row carries the note "From {item}".

**Unattuned items:** an equipped weapon that needs attunement and is not attuned has no magic bonus, no extra damage and no charge pool, and carries the note "Not attuned: magic properties are off".

**Ability key:** `{kind}:{definitionId}:{grantingComponentId or "base"}`. Spells add a fourth part, `slot`, `free`, `atwill` or `item`, because one feature can grant the same spell twice with different costs: Misty Step cast with a slot and Misty Step cast free through a subclass feature. Every spell granted by an item uses `item`, whatever D&D Beyond's slot flag says. An ability created in the app has the key `own:{uuid}`.

**Key collisions:** edits are stored by key from milestone 3, so two different things must never share one. When two inventory entries or two actions produce the same key, the first keeps it and each later one gets `#2`, `#3` and so on, in sheet order; both are shown, each with its own pool. Spells differ: two spell entries with the same key are one grant listed twice, and only the first is kept. An action with neither an ID nor a name is keyed by a hash of its description and activation, not by its position, so reordering on D&D Beyond does not detach its edits.

**Tag mapping from D&D Beyond spell tags:** `Damage`→damage, `Healing`→healing, `Buff`→buff, `Debuff`→debuff, `Control`→control, `Teleportation`→movement, `Warding`→defence, `Social` and `Deception`→social, `Combat`→ignored, anything else→utility.

**Curated data** (shipped in `packages/rules`, written from SRD 5.2):

- The universal actions: Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize.
- Purpose tags for every class feature, levels 1 to 20, of all twelve SRD classes (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard) and the one subclass the SRD includes for each.
- The pairing rules in section 9.

Curated entries are matched to imported features by D&D Beyond's definition ID where known and by name otherwise. A feature with no curated entry and no D&D Beyond tags starts untagged; this is the normal path for non-SRD subclasses, third-party content and homebrew.

### 5.2 Stored data (Postgres)

| Table | Contents |
|---|---|
| `profiles` | `id` (auth user), `display_name` (from Discord), `approved`, `is_table_admin`, `created_at`. A trigger creates the row, not approved, when a user first signs in |
| `characters` | `id` (text), `owner_id`, `ddb_character_id`, `name`, `raw_json`, `imported_at`, `updated_at`, `deleted`, `rev`. Ten live characters per owner, enforced by a trigger |
| `character_items` | Keyed by (`character_id`, `kind`, `key`): `data` (jsonb), `updated_at`, `deleted`, `rev`. Everything attached to a character; the kinds are listed below |
| `import_log` | `user_id`, `at`. One row per import, read only by the rate limit |
| `usage_events` (milestone 4) | `id`, `character_id`, `ability_key`, `view`, `timing`, `plan_key`, `occurred_at` |
| `feedback` (milestone 4) | Keyed by (`character_id`, `target_kind`, `target_key`): `useful`. `target_kind` is `ability` or `plan` |

**Character ID:** `ddb-{ddbCharacterId}-{ownerId}` for an imported character, so two devices that import the same character into the same account make the same record. A random UUID for JSON pasted with no D&D Beyond ID.

**Item kinds** (one row is one item; section 12 calls these "items"):

| `kind` | `key` | `data` |
|---|---|---|
| `play` | `state` | `{ spent, concentrationKey }` |
| `edit` | the ability key | an `AbilityEdit` (section 5.4) |
| `custom` | the ability's `own:{uuid}` key | a `CustomAbility` (section 5.4) |
| `order` | `combat` or `explore` | an array of ability keys |

One table holds every kind, so syncing, conflict handling and the access rule are each written once. The database does not check the shape of `data`; the app checks and repairs every item when it reads it (section 5.3).

**Sync columns:** `updated_at` is when the change was made, by the clock of the device that made it. A trigger on both tables caps it at the server's time, silently skips a write that is not newer than the row it would replace, and stamps `rev` from one sequence. The stamp is taken under an advisory lock, so `rev` order is commit order and a device can fetch "everything after the last `rev` I saw" without missing a row.

**Deleting** sets `deleted`. A deleted character keeps its row with `raw_json` null and loses its items; a deleted item keeps its row with `data` null. Every device learns of the deletion at its next fetch.

Turn state (which of Action, Bonus Action and Reaction are spent, and whether a slot was spent this turn) is held on the device only.

**Spent, not remaining:** play state counts what is spent. A new character needs no initial state, and a re-import only clamps each count to the new maximum.

**Pool keys:** a feature, free spell cast or item pool uses its ability or item key. Spell slots use `slot:1` to `slot:9`. Pact Magic slots use `pact`.

Edits are keyed by ability key, so a re-import keeps every correction and ordering. The same key is what would let homebrew tags be shared between users later, by querying inside `data`.

### 5.3 On-device storage

One IndexedDB database, `character-wizard`, behind an `AppStorage` interface. (`Storage` is already the browser's name for localStorage.) Milestone 2 created version 1; milestone 3 upgrades it to version 2, which mirrors the two synced tables.

| Store | Record |
|---|---|
| `characters` | `id`, `ownerId`, `ddbId`, `name`, `rawJson`, `importedAt`, `updatedAt`, `deleted`, `dirty`. Re-import finds the record by `ddbId` and owner |
| `items` | `characterId`, `kind`, `key`, `data`, `updatedAt`, `deleted`, `dirty`. The kinds of section 5.2, plus `turn` (`action`, `bonus`, `reaction`, `slotSpentThisTurn`), which never leaves the device |
| `meta` | The signed-in user's ID and profile as last seen, and the last `rev` fetched from each table |

`dirty` marks a record changed on this device and not yet accepted by the account.

**Upgrade from version 1:** each `play` record becomes a `play` item and a `turn` item. Characters imported before accounts existed have no owner; at the first sign-in on that device they are given the signed-in user as owner and the character ID of section 5.2, and are marked dirty so that they upload.

**Checked on read:** every record read from the device or fetched from the account is checked and repaired to its expected shape before the app uses it. A play item without `spent` becomes an empty one; an edit with an unknown timing loses that field. A record that cannot be repaired is ignored.

**Writes** go through one queue per database, so a delete waits for writes still in flight. Both the IndexedDB and the in-memory implementation store a copy of what they are given and return a copy.

Turn state is persisted, because phones discard background tabs when a player switches to D&D Beyond. The one-step undo snapshot is held in memory only.

If IndexedDB is unavailable (private browsing, quota), the app says so and keeps working in memory.

### 5.4 Edits (milestone 3)

A player's changes never alter the imported sheet. They are stored beside it and applied each time the sheet is built.

```ts
/** A player's changes to one ability. An absent field means "as imported". */
interface AbilityEdit {
  timing?: Timing;
  uses?: { max: number; reset: ResetType } | 'none';
  tags?: Tag[];
  roll?: Roll;
  inCombat?: boolean;
  inExplore?: boolean;
  hidden?: boolean;
}

/** An ability the player added. */
interface CustomAbility {
  key: string;                 // own:{uuid}
  name: string;
  timing: Timing;
  roll: Roll;
  cost:
    | { kind: 'none' }
    | { kind: 'uses'; max: number; reset: ResetType }
    | { kind: 'slot'; minLevel: number };
  tags: Tag[];
  concentration: boolean;
  description: string;         // plain text
}

interface CharacterEdits {
  abilities: Record<string, AbilityEdit>;   // by ability key
  custom: CustomAbility[];
  order: { combat: string[]; explore: string[] };
}
```

`applyEdits(sheet, edits)` in `packages/rules` is a pure function that returns the sheet the views show. The views, the turn engine and the store's play logic read only that sheet and know nothing of edits. It applies to imported abilities, universal actions and custom abilities alike, by key.

- **Timing, tags, roll:** replace the imported value. Edited tags set `tagSource` to `user`.
- **Uses:** `{ max, reset }` changes the pool the ability already spends from, or gives an ability with no cost a pool under its own key and makes Use spend from it. `'none'` removes the cost. Not offered for an ability that costs a spell slot.
- **inCombat, inExplore:** override which views list the ability. Unset, Combat lists every timing except `long`, and Explore lists what section 10.2 says. An ability forced into Combat whose timing has no group there is listed under "Other".
- **hidden:** the ability leaves both views and is listed in `sheet.hidden`. A pool is not shown as a resource chip when at least one ability uses it and all of them are hidden.
- **order:** within any group, abilities whose key is in the view's list come first, in list order; the rest follow in sheet order.
- **Custom abilities** are converted to `Ability` records with source `custom` and appended. Editing one rewrites its `custom` item; hiding it or changing its views uses an `AbilityEdit` under its key, like any other ability. Its description is plain text and is escaped before display.
- The sheet records which keys carry an edit, so a row can show "edited".

An edit whose ability is not on the sheet (an unequipped weapon, a feature lost on re-import) is kept and has no effect.

## 6. Import flow

1. The player pastes a D&D Beyond character URL or ID. The client extracts the numeric ID and rejects anything else. A URL may carry a query string or fragment.
2. The client posts `{ "id": "<digits>" }` to the `import-character` Edge Function. It accepts only 1 to 12 digits and requests only the character-service URL above. It sends no cookies or spoofed headers. It answers `{ "status": "ok", "raw": ... }`, or a status of `private`, `not-found`, `upstream-error`, `bad-request`, `unauthorized`, `not-approved` or `rate-limited`.
3. The raw JSON is stored on the device, and from milestone 3 synced to `characters.raw_json`. Conversion to `Character` runs in the browser on load, so converter fixes apply to existing characters without a re-import.
4. As a fallback, the import screen accepts the character JSON pasted or uploaded as a file.

**Access before accounts exist (milestone 2):** the caller sends the project's publishable key in the `apikey` header and the function checks it. If the deployed function has no key to check against, it refuses every request rather than skipping the check. The function answers a browser only from the origins listed in its `ALLOWED_ORIGINS` setting.

**Access from milestone 3:** the function accepts only a signed-in, approved player. It passes the caller's own token to one database function, `record_import`, which answers `ok`, `not-approved` or `rate-limited` and records the import. The database rejects a missing or invalid token itself. The publishable-key check of milestone 2 is removed, and the platform's `verify_jwt` setting is off, because the function's own check does not depend on it. If the deployed function cannot reach the database it refuses every request.

**Limits:** 30 imports per player per hour. The request body is capped at 1 KB and the body relayed from D&D Beyond at 5 MB. The function follows no redirects. The client gives up after 15 seconds and accepts an `ok` answer only when `raw` is an object.

**Local development:** the Vite dev server mounts the same handler at `/functions/v1/import-character`, with the same size caps and no access check, so no Supabase project is needed to run the app locally. The dev server stays reachable from the local network, because that is how a phone reaches it.

| Upstream result | Message to the player |
|---|---|
| 403 | "This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again", with where to find the setting |
| 404 | "No character with that ID" |
| Anything else | "D&D Beyond didn't respond as expected". The saved copy keeps working |
| The function cannot be reached | "Couldn't reach the import service", with the paste fallback |
| `unauthorized` | "Your sign-in has expired. Sign in again, then retry" |
| `not-approved` | "Your DM hasn't approved your account yet" |
| `rate-limited` | "Too many imports. Try again in an hour" |
| The account already has ten characters | "You have ten characters. Delete one to add another" (checked before the request is made) |

**Re-import** replaces the raw JSON, keeps edits and custom abilities, clamps each spent count to the new maximum (an edited maximum where there is one), drops pools that no longer exist, and clears concentration if that ability is gone. Re-import is offered only for a character that has a D&D Beyond ID. For the character that is open, the play state in memory is the newest copy and is the one clamped and kept.

## 7. Sheet maths

`packages/rules` calculates:

- Ability scores and modifiers: base scores plus `bonus` modifiers on `*-score`, with `overrideStats` taking precedence.
- Proficiency bonus from total level.
- Skill checks and saving throws: proficiency, expertise, flat bonuses. Advantage is shown as a note, not applied.
- Spell attack bonus and save DC from the class's spellcasting ability.
- Weapon attacks and damage: Strength or Dexterity by weapon properties, `replace-weapon-ability` modifiers (Pact of the Blade), proficiency, magic bonus. Extra dice from item modifiers are listed as `optionalDamage`.
- Attacks per Attack action, from Extra Attack and its upgrades.
- Spell slots and Pact Magic slots from `spellRules.levelSpellSlots`.
- Limited-use maximums: fixed, ability-modifier based (`statModifierUsesId`), and proficiency-bonus based (`useProficiencyBonus`).
- Initiative and a basic Armor Class (armour, shield, Dexterity, flat bonuses, Barbarian Unarmored Defense).

Not calculated: effects that exist only in description text, hit points, conditions, and multiclass characters.

**A wrong number can be corrected where it matters most.** From milestone 3 the player can replace any ability's roll: the attack bonus and damage, the save and its DC, or the dice (section 5.4). A replaced roll is fixed text and does not follow a level-up; the row is marked "edited" and can be put back to the imported value. Overriding the sheet's own numbers (skills, saving throws, initiative, Armor Class, spell attack bonus and spell save DC) is not built in this version; see section 16.

## 8. Turn tracking and hard rules

**Turn state:** `action`, `bonus`, `reaction` (each available or spent), `slotSpentThisTurn`, and the current concentration ability.

**Use:** tapping Use marks the timing spent, deducts the slot or limited use, and sets concentration if applicable. From milestone 4 it also records a usage event.

- When more than one slot level could pay for a spell, Use asks which. When only one could, it spends that one without asking.
- An ability with no timing to spend, no cost and no concentration is informational and has no Use button.
- In the Explore view, Use deducts the cost and sets concentration but leaves the turn alone, and the one-slot-per-turn rule is not checked.
- Use and the manual controls are disabled until the character's saved play state has loaded, so an early tap cannot overwrite it.

**Start my turn:** resets Action, Bonus Action, Reaction and `slotSpentThisTurn`.

**Rests:** Short Rest restores short-rest resources and Pact Magic slots. Long Rest restores everything and clears concentration. Item charges that reset at dawn are restored on a Long Rest. Consumables never reset. A pool whose reset type the import did not recognise is left alone; the player restores it by hand. Both rests also reset the turn.

**Undo:** one step. It reverses the last Use, Start my turn or rest. A manual change (a pill, a pip, ending concentration) clears the undo step, so undo only ever reverses the most recent change.

**Manual control:** the player can flip any of the three turn pills and can spend or restore one use of any pool by tapping its pips. This is how the player handles anything the app cannot model: Action Surge granting a second Action, a homebrew feature described only in text, or a mistake.

**Hard rules** (deterministic, from SRD 5.2):

- One Action, one Bonus Action and one Reaction per round.
- Only one spell slot may be spent per turn. Reaction spells are exempt: they neither check nor set `slotSpentThisTurn`, because they are normally cast on another creature's turn.
- One concentration effect at a time. A second is allowed and is labelled "Ends your {current}".
- An ability with no remaining uses, or needing a slot when none remain, is unavailable.

Unavailable abilities are greyed out, not hidden. Use is disabled on a greyed row and the row states the reason.

## 9. Suggestion engine

### 9.1 Ordering within a group

1. Abilities the player has positioned by hand come first, in that order. Learning never moves them.
2. The rest are sorted by score:

```
score = tagWeight(view, activeSituations)
      + usageScore       // sum over usage events of 0.5 ^ (ageInDays / 30), capped
      + feedbackScore    // thumbs up raises, thumbs down lowers by a larger amount
```

All weights and caps live in one configuration file in `packages/rules` so they can be tuned from real play.

**Default tag weights:** in combat, damage and debuff rank highest, then control, buff, healing, defence, movement, utility. In the Explore view, utility, social and movement rank highest.

**Situation chips** (optional toggles in the combat view): "Ally is hurt" raises healing; "I'm in trouble" raises defence and movement; "Lots of enemies" raises abilities with an area of effect.

### 9.2 Turn plans

A turn plan is one Action plus zero or one Bonus Action that are legal together.

1. Take the top five available Actions and the top five available Bonus Actions, plus "no Bonus Action".
2. Remove pairs that break a hard rule (two slots, insufficient resources).
3. Score each pair as the sum of both scores plus any pairing bonus.
4. Drop plans the player has thumbed down. Show the top three, each with a one-line reason.

**Initial pairing rules:**

| Condition | Effect | Reason shown |
|---|---|---|
| A concentration buff or debuff is not active, and the Action is tagged damage | Bonus for pairing them | "Set up {spell}, then attack" |
| Already concentrating on a damage-adding effect, and the Action is an attack | Bonus for the attack | "{spell} is up" |
| Already concentrating | Penalty for other concentration abilities | (none) |
| Ability used often by this character | (from usage score) | "You use this often" |

The plan key is `{actionKey}+{bonusKey or "none"}`.

## 10. Views

Both views are phone first. Each is one scrolling page.

### 10.1 Combat

- Header with character name and a Combat / Explore switch.
- Turn tracker: three pills for Action, Bonus Action and Reaction, pinned while the list scrolls. Tapping a pill flips it.
- Resources: this character's pools as chips with tappable pips.
- A banner naming the current concentration effect, with a control to end it.
- Suggested turn card with reason and thumbs up or down; swipe for the next plan (milestone 4).
- Abilities grouped by Action, Bonus Action, Reaction, "No action needed" (timing `free`, for example Action Surge; collapsed) and "Other" (timing `unknown`; shown only when not empty). Abilities that take a minute or more are not listed. Each row has the name, a cost label, tags, a plain-English roll line and a Use button. An edited row also carries the label "edited".
- A group whose timing is spent dims but stays visible.
- Two rows with the same name are told apart by their cost label ("free cast, 3 left" and "pact slot"). The cost label is part of each row's accessible name and of its Use button's.
- A weapon with a charge pool shows the pool as pips on its row.
- The Action group states the number of attacks when it is more than one. Using any weapon spends the Action once; attacks within the Action are not counted.
- A collapsed "Anyone can do this" group for the universal actions. They use the normal row, so Use on Dash spends the Action.
- A collapsed "Keep in mind" group (see roll lines and notes below).
- A "Start my turn" button, pinned at the bottom.

**Roll lines** are short sentences generated from `Roll`. Ability names are spelled out.

- Attack: "Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item)."
- Save: "They roll a Strength save against DC 13. Fail: 2d6 necrotic." ("an" before a vowel: "an Intelligence save".)
- Damage only: "Damage: 1d6 necrotic."
- Dice only: "Roll 1d10 + 9."
- Check: "Roll d20 + 3."
- Flat damage is printed as the number ("Hit: 4 bludgeoning."), and zero as "Hit: no damage."

**Conditional notes:** the app never applies a conditional modifier to a number. Every advantage or disadvantage modifier, and every modifier with a restriction, becomes a note that uses the sheet's own condition text.

- A note that belongs to a skill or a saving throw sits on that row: "Advantage (roll twice, keep the higher)." or "Advantage: {condition}".
- Every other note goes in a "Keep in mind" list, open in Explore and collapsed in Combat.
- Combat has no skill or saving throw rows, so its "Keep in mind" list also carries those notes, each prefixed with its subject ("Constitution save: Advantage: ...").

### 10.2 Explore (non-combat)

- Search across skills and abilities.
- The same resource chips as Combat.
- Skill checks with the full roll, proficient skills first and the rest folded, with inline notes.
- Saving throws in the same format.
- Abilities tagged utility, social or movement, rituals, and anything taking a minute or more. No turn tracker; Use still deducts resources. An untagged ability with Action, Bonus Action or Reaction timing appears in Combat only, unless the player ticks Explore in its editor.
- "Keep in mind".
- Short Rest and Long Rest buttons.

### 10.3 Shared behaviour

- Tapping a row opens the full description. Descriptions are HTML from the import and are sanitised to a small set of formatting tags before display.
- Dialogs (the slot choice, the ability editor, confirmations) are `<dialog>` elements: focus moves into them, stays inside them, and Escape closes them.

### 10.4 Editing and arranging (milestone 3)

Playing and arranging are separate, so that nobody moves or edits a row by accident in the middle of a fight.

**While playing,** rows look as section 10.1 describes. The opened row shows the description and one extra button, "Edit", which opens the editor for that ability.

**The editor** is a dialog with:

- Timing: Action, Bonus Action, Reaction, No action needed, Takes a minute or more, Passive.
- Limited uses: off, or a maximum and a reset (Short Rest, Long Rest, never). Not shown for an ability that costs a spell slot.
- Tags: the nine tags as toggles.
- Shown in: Combat and Explore tick boxes, starting from where the app put the ability.
- Roll: none, an attack (bonus and damage), a save (ability, DC and damage), damage only, or dice only. Numbers are typed in.
- Hide, and "Back to imported", which removes every edit to that ability.

**"Edit list"** is a button at the bottom of each view. It switches the view into arranging:

- Each row shows a drag handle and no Use button.
- Dragging moves a row within its own group. Moving an ability to another group is done by changing its timing in the editor.
- Combat and Explore each keep their own order. The first drag in a group fixes that group's order as shown; an ability that arrives later goes to the end of its group.
- A "Hidden" drawer lists hidden abilities, each with Restore.
- "Add an ability" opens the editor with three more fields: a name, a plain-text description, and a concentration tick box. Its cost is nothing, limited uses, or a spell slot of a chosen level. A custom ability can also be deleted from its editor.
- "Done" returns to playing.

Hide, order and edit work on any row, including the universal actions. The universal actions' own text does not refer to where other rows are.

### 10.5 Other screens

- **Sign in:** one button, "Continue with Discord", and the link to About. Shown whenever nobody is signed in on the device.
- **Waiting for approval:** shown to a signed-in player who is not approved. It names the account, and has "Check again" and "Sign out".
- **Character list** (home): the player's characters with class, level and import date; add, re-import and delete. Deleting says that the character is removed from the account and from every device. A table admin also sees a "Table" section listing every other character with its owner's name. One line shows the sync state: "Saved to your account", "Waiting to sync" or "Sign in again to sync". The screen has "Sign out", and for a table admin a link to Players.
- **Players** (table admin only): the people waiting, each with Approve, and the approved players, each with Remove access. An admin cannot remove their own access.
- **Import:** see section 6.
- **About:** the attribution and statement in section 13.
- **Character:** if a character cannot be opened, the screen says so and links back to the list.

## 11. Accounts and security

**Sign-in**

- Sign-in is by Discord, through Supabase Auth. The app sends no email and stores no password. Sign-in returns to the site with a `code` in the query string, which does not collide with the hash routes.
- Sign-in is required. A device with nobody signed in shows only the sign-in screen and About.
- The device remembers who is signed in (section 5.3), so the app opens from the device's copy without a connection. If the session can no longer be renewed, the app keeps working from the device and shows "Sign in again to sync".
- **Signing out** removes the device's copy of every character. If changes are still waiting to sync, the app says so and asks before discarding them.

**Approval**

- A first sign-in creates a profile that is not approved. An unapproved player sees only the waiting screen.
- A table admin approves players, and removes access, on the Players screen. Removing access keeps the player's characters.
- The first admin is made by hand: the owner signs in once, then marks their own profile approved and admin with one SQL statement in the Supabase dashboard. Nothing in the app can grant admin.

**Row-level security** is on for every table.

| Who | Can |
|---|---|
| Not signed in | Nothing |
| Signed in, not approved | Read their own profile |
| Approved player | Read and write their own characters and those characters' items. Ten live characters |
| Table admin | The same for every character; read every profile; approve and remove access |

- No policy lets anyone write `profiles`. Approval goes through one database function, `set_player_approved`, which checks that the caller is an admin and is not changing their own row.
- A character's owner is whoever created it and cannot be changed. An admin can edit another player's character but cannot create one in their name.
- An item can be read or written only while its character is visible to the caller and not deleted.
- `import_log` has no policies; only `record_import` touches it.

**The Edge Function** is the only code that calls D&D Beyond, it cannot be used to fetch arbitrary URLs, and it serves only signed-in, approved players within the rate limit (section 6).

## 12. Offline behaviour and syncing

- Characters, play state and edits are stored on the device (section 5.3), so a saved character opens without a connection once the page itself has loaded. Every screen reads from the device's copy.
- The PWA caches the app shell (milestone 5).

**Syncing (milestone 3)**

- Every change is saved on the device first, marked dirty, and sent to the account in the background.
- **Sending:** about two seconds after a change, and again when a connection returns. A record stops being dirty once the account has answered, whether it accepted the change or already held a newer one.
- **Fetching:** at sign-in, when the app opens, when the player switches back to it, and every 30 seconds while it is on screen. The device asks for every character and item with a `rev` after the last one it saw.
- **Merging a fetched record:** it replaces the device's copy unless the device's copy is dirty and newer. If the character on screen changed, the screen updates.
- **What syncs:** characters, and the `play`, `edit`, `custom` and `order` items. Turn state does not.
- **First sign-in on a device:** characters already on it are uploaded (section 5.3). Where the account already has the same character, the ordinary rule decides each record: the newer import, and whichever play state changed last.

**Conflicts:** the later change wins, item by item, and the earlier one is lost without a message. Edits to different abilities are different items, so both survive. The whole of what is spent is one item, and so is each view's order. "Later" goes by the clock of the device that made the change; the server never accepts a time in the future.

**Deleting** a character removes it from the account and, at their next fetch, from every device that has it.

Usage events (milestone 4) will be written locally first and sent in the same way.

## 13. Hosting and licensing

- Static frontend on Cloudflare Pages. Supabase free tier for auth, database and the Edge Function.
- Sign-in needs a Discord application whose ID and secret are entered in the Supabase dashboard by the owner. The database is created from the SQL files in `supabase/migrations`.
- Supabase pauses a free project after seven days of low activity and the owner resumes it from the dashboard. While it is paused the app works from each device's copy; signing in on a new device, syncing and import by link wait until it is resumed.
- An About screen carries the SRD 5.2 attribution required by CC-BY-4.0 and states that the app is not affiliated with D&D Beyond or Wizards of the Coast.
- Ability descriptions shown in the app come only from the signed-in player's own imported sheet. The app ships no non-SRD rules text.

## 14. Testing

- **Converter and sheet maths:** each real character is a fixture. The stored JSON goes in; attack bonuses, save DC, slot counts and limited-use maximums must match what D&D Beyond's own sheet displays. Fixtures have `username`, `userId`, `campaign` and avatar URLs removed before they are committed.
- **Generality:** the converter is also tested with synthetic input containing unknown activation types, unknown reset types, unknown tags and features with no structure at all. Each must produce a displayable ability and never an error.
- **Coverage gap:** Druid, Monk, Paladin and Ranger have curated tags but no real fixture yet. Their maths is unverified against a real sheet until a fixture for each is added.
- **Rules and suggestions:** table-driven tests. A character plus a turn state goes in; expected availability, ordering and plans come out. For example, for the level 3 Warlock: Hex plus Eldritch Blast is legal; Hex plus Arms of Hadar is not (two slots); a free Misty Step plus Arms of Hadar is legal.
- **Web app:** component tests for the Use, undo, Start my turn and rest flows, and from milestone 3 for sign-in, approval, editing, arranging and custom abilities, all against `memoryRemote`.
- **Access rules:** the SQL in `supabase/migrations` is run inside the test suite on PGlite, a Postgres that runs in-process, with a small stand-in for Supabase's `auth` schema. Tests act as an unapproved player, an approved player and a table admin, and cover the ten-character limit, the write-ordering trigger and the import rate limit. No Docker and no live project is needed.
- **Syncing:** two in-memory devices and one `memoryRemote`. Tests cover sending, fetching, the later change winning, deletion reaching the other device, and first sign-in upload. `memoryRemote` and the SQL trigger are tested against the same list of cases so that they cannot drift apart.
- **Edits:** table-driven tests of `applyEdits`, and synthetic converter input for each key collision of section 5.1, since no fixture has one.
- **Not covered by automated tests:** Discord sign-in against the real services. The owner checks it after deploying.

## 15. Milestones

Each milestone is usable on its own and gets its own implementation plan.

1. **Import and sheet maths**, verified against every available fixture (eight characters across eight classes as of 2026-11-11). Curated tags for all twelve classes are written in milestone 4, where they are first used.
2. **Both views with turn and resource tracking**, stored on the device only. Includes the import Edge Function, which the browser needs to fetch a character, the Supabase project that hosts it, and the first deployment of the static site. No accounts, overlays, suggestions or usage events.
3. **Accounts, saved characters and overlays** (edit, reorder, hide, add custom). One plan in two parts, each with its own pull request:
   - **Part A, accounts and syncing:** the version 2 device storage, the database and its access rules, Discord sign-in, approval and the Players screen, syncing, the table admin's "Table" section, and the import function's access check and limits. Usable on its own: characters are backed up and follow the player between devices.
   - **Part B, overlays:** the ability editor, "Edit list" with drag and drop, hiding, custom abilities, and re-import with edits.
4. **Suggestions:** turn plans, situation chips, feedback and usage learning.
5. **Offline support and install to home screen.**

## 16. Out of scope for this version

- A Claude model pre-filling homebrew tags from ability text.
- A shared homebrew tag library across users.
- Native mobile builds.
- Hit points, conditions and death saves.
- Multiclass characters.
- Public sign-up, billing and moderation.
- A dashboard for usage and feedback data.
- Overriding the sheet's own numbers: skills, saving throws, initiative, Armor Class, spell attack bonus and spell save DC. It needs an edit screen for the sheet and rules for knock-on effects (a new spell save DC changes every spell's roll line). Until then a wrong ability roll is fixed in that ability's editor.
- A second sign-in provider such as Google. Adding one is a dashboard setting and one more button.
- Live updates between devices. A change made elsewhere arrives at the next fetch, within 30 seconds.
- A conflict screen. The later change wins (section 12).
- An admin creating a character for another player, or moving a character between players.

The ability key and overlay model leave room for the first three without rework.

## 17. Risks

| Risk | Mitigation |
|---|---|
| The unofficial endpoint changes or is closed | All D&D Beyond handling is isolated in `ddb-import` and one Edge Function. Saved characters keep working from stored JSON. A PDF or manual importer can target the same `Character` format |
| A public release would lean on an unofficial endpoint and D&D Beyond's terms | Out of scope now; must be revisited before any public launch |
| Homebrew authored as text only | The ability editor (timing, uses, tags, roll) and custom abilities cover every case by hand |
| Sheet maths disagrees with D&D Beyond | Fixture tests against every available real sheet; any ability's roll can be replaced. The sheet's own numbers cannot be overridden yet (section 16) |
| Two people change the same item at once and one change is lost silently | Accepted. Items are small (one ability's edits, one view's order), so it needs the same item on two devices within one fetch interval |
| A table admin spends a player's resources by accident while their character is open | Accepted, to avoid a read-only mode. Undo reverses the slip |
| Anyone with a Discord account can sign in and wait for approval | Accepted. An unapproved account can read only its own profile and can call nothing |
| Supabase pauses an idle free project | The app works from each device's copy until the owner resumes it (section 13) |
| Discord sign-in leaves the site and comes back, which may not return to an app installed to an iPhone's home screen | Not verified. To be checked in milestone 5, before install is offered |
| Players must set sheets to Public | The import screen explains it and recognises the 403 response |
| Until milestone 3 the Edge Function has no signed-in check | Accepted for milestone 2. It accepts only a numeric ID, fetches only the character-service URL, and returns only what a public sheet already exposes to anyone. It answers only listed origins. Milestone 3 adds the signed-in check |
| Until milestone 3 a character and its play state live only in the browser's storage, which a browser may clear. Safari removes a site's stored data after seven days of browser use without a visit to it | Accepted for milestone 2. Re-importing restores the character; only what was spent is lost. Accounts (milestone 3) and the installed app (milestone 5) remove the limit |
