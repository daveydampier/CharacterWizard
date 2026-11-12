# Character Wizard: design

Date: 2026-11-11
Status: approved in conversation, awaiting written review. Milestone 2 decisions added 2026-11-11 (sections 4, 5, 6, 8, 10, 12, 15 and 17).

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
| Launch audience | The DM's own table first; invite only |
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

The web app routes by URL hash (`#/`, `#/import`, `#/about`, `#/c/{id}/combat`, `#/c/{id}/explore`), so the phone's back button works and static hosting needs no rewrite rules.

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

**Ability key:** `{kind}:{definitionId}:{grantingComponentId or "base"}`. Spells add a fourth part, `slot`, `free`, `atwill` or `item`, because one feature can grant the same spell twice with different costs: Misty Step cast with a slot and Misty Step cast free through a subclass feature. Every spell granted by an item uses `item`, whatever D&D Beyond's slot flag says. Custom abilities created in the app use a UUID.

**Tag mapping from D&D Beyond spell tags:** `Damage`→damage, `Healing`→healing, `Buff`→buff, `Debuff`→debuff, `Control`→control, `Teleportation`→movement, `Warding`→defence, `Social` and `Deception`→social, `Combat`→ignored, anything else→utility.

**Curated data** (shipped in `packages/rules`, written from SRD 5.2):

- The universal actions: Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize.
- Purpose tags for every class feature, levels 1 to 20, of all twelve SRD classes (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard) and the one subclass the SRD includes for each.
- The pairing rules in section 9.

Curated entries are matched to imported features by D&D Beyond's definition ID where known and by name otherwise. A feature with no curated entry and no D&D Beyond tags starts untagged; this is the normal path for non-SRD subclasses, third-party content and homebrew.

### 5.2 Stored data (Postgres)

| Table | Contents |
|---|---|
| `profiles` | `id` (auth user), `display_name`, `is_table_admin` |
| `characters` | `id`, `owner_id`, `ddb_character_id`, `name`, `raw_json`, `number_overrides` (jsonb), `imported_at`. Unique on (`owner_id`, `ddb_character_id`). Ten per owner, enforced by a trigger |
| `ability_overlays` | Keyed by (`character_id`, `ability_key`): `timing`, `uses_max`, `uses_reset`, `tags`, `hidden`, `in_combat`, `in_explore`, `combat_position`, `explore_position`. All nullable; null means "use the imported value" |
| `custom_abilities` | `id`, `character_id`, `definition` (an `Ability` as jsonb) |
| `resource_state` | `character_id`, `spent` (jsonb of pool key to number spent), `concentration_key` |
| `usage_events` | `id`, `character_id`, `ability_key`, `view`, `timing`, `plan_key`, `occurred_at` |
| `feedback` | Keyed by (`character_id`, `target_kind`, `target_key`): `useful`. `target_kind` is `ability` or `plan` |

Turn state (which of Action, Bonus Action and Reaction are spent, and whether a slot was spent this turn) is held on the device only.

**Spent, not remaining:** play state counts what is spent. A new character needs no initial state, and a re-import only clamps each count to the new maximum.

**Pool keys:** a feature, free spell cast or item pool uses its ability or item key. Spell slots use `slot:1` to `slot:9`. Pact Magic slots use `pact`.

Overlays are keyed by ability key, so a re-import keeps every correction and ordering. The same key is what would let homebrew tags be shared between users later.

### 5.3 On-device storage (milestone 2 onward)

One IndexedDB database, `character-wizard`, behind a `Storage` interface so that milestone 3 can add sync behind the same calls.

| Store | Record |
|---|---|
| `characters` | `id` (local UUID), `ddbId`, `name`, `rawJson`, `importedAt`. Mirrors the `characters` table. Re-import finds the record by `ddbId` |
| `play` | `characterId`, `spent`, `concentrationKey`, `turn` (`action`, `bonus`, `reaction`, `slotSpentThisTurn`) |

Turn state is persisted, because phones discard background tabs when a player switches to D&D Beyond. The one-step undo snapshot is held in memory only.

If IndexedDB is unavailable (private browsing, quota), the app says so and keeps working in memory.

## 6. Import flow

1. The player pastes a D&D Beyond character URL or ID. The client extracts the numeric ID and rejects anything else. A URL may carry a query string or fragment.
2. The client posts `{ "id": "<digits>" }` to the `import-character` Edge Function. It accepts only 1 to 12 digits and requests only the character-service URL above. It sends no cookies or spoofed headers. It answers `{ "status": "ok", "raw": ... }`, or a status of `private`, `not-found`, `upstream-error` or `bad-request`.
3. The raw JSON is stored (on the device in milestone 2; in `characters.raw_json` from milestone 3). Conversion to `Character` runs in the browser on load, so converter fixes apply to existing characters without a re-import.
4. As a fallback, the import screen accepts the character JSON pasted or uploaded as a file.

**Access before accounts exist (milestone 2):** the function is callable with the project's public key and answers only the origins listed in its `ALLOWED_ORIGINS` setting. From milestone 3 it requires a signed-in user.

**Local development:** the Vite dev server mounts the same handler at `/functions/v1/import-character`, so no Supabase project is needed to run the app locally.

| Upstream result | Message to the player |
|---|---|
| 403 | "This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again", with where to find the setting |
| 404 | "No character with that ID" |
| Anything else | "D&D Beyond didn't respond as expected". The saved copy keeps working |
| The function cannot be reached | "Couldn't reach the import service", with the paste fallback |

**Re-import** replaces the raw JSON, keeps overlays and custom abilities, clamps each spent count to the new maximum, drops pools that no longer exist, and clears concentration if that ability is gone.

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

**Every calculated number can be overridden.** Overrides live in `characters.number_overrides` (sheet-level numbers) and `ability_overlays` (per-ability values).

## 8. Turn tracking and hard rules

**Turn state:** `action`, `bonus`, `reaction` (each available or spent), `slotSpentThisTurn`, and the current concentration ability.

**Use:** tapping Use marks the timing spent, deducts the slot or limited use, and sets concentration if applicable. From milestone 4 it also records a usage event.

- When more than one slot level could pay for a spell, Use asks which. When only one could, it spends that one without asking.
- An ability with no timing to spend, no cost and no concentration is informational and has no Use button.
- In the Explore view, Use deducts the cost and sets concentration but leaves the turn alone, and the one-slot-per-turn rule is not checked.

**Start my turn:** resets Action, Bonus Action, Reaction and `slotSpentThisTurn`.

**Rests:** Short Rest restores short-rest resources and Pact Magic slots. Long Rest restores everything and clears concentration. Item charges that reset at dawn are restored on a Long Rest. Consumables never reset. A pool whose reset type the import did not recognise is left alone; the player restores it by hand. Both rests also reset the turn.

**Undo:** one step. It reverses the last Use, Start my turn or rest.

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
- Abilities grouped by Action, Bonus Action, Reaction, "No action needed" (timing `free`, for example Action Surge; collapsed) and "Other" (timing `unknown`; shown only when not empty). Abilities that take a minute or more are not listed. Each row has the name, a cost label, tags, a plain-English roll line and a Use button. A drag handle is added in milestone 3.
- A group whose timing is spent dims but stays visible.
- Two rows with the same name are told apart by their cost label ("free cast, 3 left" and "pact slot").
- A weapon with a charge pool shows the pool as pips on its row.
- The Action group states the number of attacks when it is more than one. Using any weapon spends the Action once; attacks within the Action are not counted.
- A collapsed "Anyone can do this" group for the universal actions. They use the normal row, so Use on Dash spends the Action.
- A collapsed "Keep in mind" group (see roll lines and notes below).
- A "Start my turn" button, pinned at the bottom.

**Roll lines** are short sentences generated from `Roll`. Ability names are spelled out.

- Attack: "Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item)."
- Save: "They roll a Strength save against DC 13. Fail: 2d6 necrotic."
- Damage only: "Damage: 1d6 necrotic."
- Dice only: "Roll 1d10 + 9."
- Check: "Roll d20 + 3."
- Flat damage is printed as the number ("Hit: 4 bludgeoning."), and zero as "Hit: no damage."

**Conditional notes:** the app never applies a conditional modifier to a number. Every advantage or disadvantage modifier, and every modifier with a restriction, becomes a note that uses the sheet's own condition text.

- A note that belongs to a skill or a saving throw sits on that row: "Advantage (roll twice, keep the higher)." or "Advantage: {condition}".
- Every other note goes in a "Keep in mind" list, open in Explore and collapsed in Combat.

### 10.2 Explore (non-combat)

- Search across skills and abilities.
- The same resource chips as Combat.
- Skill checks with the full roll, proficient skills first and the rest folded, with inline notes.
- Saving throws in the same format.
- Abilities tagged utility, social or movement, rituals, and anything taking a minute or more. No turn tracker; Use still deducts resources. An untagged ability with Action, Bonus Action or Reaction timing appears in Combat only, until milestone 3 lets the player choose.
- "Keep in mind".
- Short Rest and Long Rest buttons.

### 10.3 Shared behaviour

- Tapping a row opens the full description. Descriptions are HTML from the import and are sanitised to a small set of formatting tags before display.
- From milestone 3, the opened row also has the edit controls: timing, uses, tags, which views it appears in, hide.
- Drag and drop reorders within a group; each view keeps its own order (milestone 3).
- "Add to list" creates a custom ability (milestone 3).
- Hidden abilities move to a "Hidden" drawer and can be restored (milestone 3).

### 10.4 Other screens

- **Character list** (home): saved characters with class, level and import date; add, re-import and delete.
- **Import:** see section 6.
- **About:** the attribution and statement in section 13.

## 11. Accounts and security

- Sign-in by emailed link through Supabase Auth. No passwords.
- Open sign-up is disabled; the DM invites players by email.
- Row-level security on every table: a user can read and write rows for characters they own. A user with `is_table_admin` can read and write all characters.
- The Edge Function is the only code that calls D&D Beyond, and it cannot be used to fetch arbitrary URLs.

## 12. Offline behaviour

- From milestone 2, characters and play state are stored on the device (section 5.3), so a saved character opens without a connection once the page itself has loaded.
- The PWA caches the app shell and the last-loaded characters (milestone 5).
- Resource changes and usage events are written locally first and synced when a connection is available.
- If one character is open on two devices, the latest write wins. No conflict resolution in this version.

## 13. Hosting and licensing

- Static frontend on Cloudflare Pages. Supabase free tier for auth, database and the Edge Function.
- An About screen carries the SRD 5.2 attribution required by CC-BY-4.0 and states that the app is not affiliated with D&D Beyond or Wizards of the Coast.
- Ability descriptions shown in the app come only from the signed-in player's own imported sheet. The app ships no non-SRD rules text.

## 14. Testing

- **Converter and sheet maths:** each real character is a fixture. The stored JSON goes in; attack bonuses, save DC, slot counts and limited-use maximums must match what D&D Beyond's own sheet displays. Fixtures have `username`, `userId`, `campaign` and avatar URLs removed before they are committed.
- **Generality:** the converter is also tested with synthetic input containing unknown activation types, unknown reset types, unknown tags and features with no structure at all. Each must produce a displayable ability and never an error.
- **Coverage gap:** Druid, Monk, Paladin and Ranger have curated tags but no real fixture yet. Their maths is unverified against a real sheet until a fixture for each is added.
- **Rules and suggestions:** table-driven tests. A character plus a turn state goes in; expected availability, ordering and plans come out. For example, for the level 3 Warlock: Hex plus Eldritch Blast is legal; Hex plus Arms of Hadar is not (two slots); a free Misty Step plus Arms of Hadar is legal.
- **Web app:** component tests for the Use, undo, Start my turn and rest flows.

## 15. Milestones

Each milestone is usable on its own and gets its own implementation plan.

1. **Import and sheet maths**, verified against every available fixture (eight characters across eight classes as of 2026-11-11). Curated tags for all twelve classes are written in milestone 4, where they are first used.
2. **Both views with turn and resource tracking**, stored on the device only. Includes the import Edge Function, which the browser needs to fetch a character, the Supabase project that hosts it, and the first deployment of the static site. No accounts, overlays, suggestions or usage events.
3. **Accounts, saved characters and overlays** (edit, reorder, hide, add custom).
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

The ability key and overlay model leave room for the first three without rework.

## 17. Risks

| Risk | Mitigation |
|---|---|
| The unofficial endpoint changes or is closed | All D&D Beyond handling is isolated in `ddb-import` and one Edge Function. Saved characters keep working from stored JSON. A PDF or manual importer can target the same `Character` format |
| A public release would lean on an unofficial endpoint and D&D Beyond's terms | Out of scope now; must be revisited before any public launch |
| Homebrew authored as text only | Tag editor, per-number overrides and custom abilities cover every case by hand |
| Sheet maths disagrees with D&D Beyond | Fixture tests against every available real sheet; every number is overridable |
| Players must set sheets to Public | The import screen explains it and recognises the 403 response |
| Until milestone 3 the Edge Function has no signed-in check | Accepted for milestone 2. It accepts only a numeric ID, fetches only the character-service URL, and returns only what a public sheet already exposes to anyone. It answers only listed origins. Milestone 3 adds the signed-in check |
