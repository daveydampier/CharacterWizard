# Character Wizard: design

Date: 2026-11-11
Status: approved in conversation, awaiting written review

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
| `packages/rules` | Sheet maths, action economy, suggestion engine. Pure functions with no network or UI code | The `Character` format |
| `apps/web` | React + Vite PWA: screens, taps, local turn state, sync | Both packages, Supabase |
| `supabase/` | Auth, Postgres tables with row-level security, one Edge Function for import | Nothing of ours |

Libraries: React, Vite, Tailwind CSS, Zustand for client state, dnd-kit for drag and drop, supabase-js, vite-plugin-pwa, Vitest.

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

type Roll =
  | { kind: 'attack'; bonus: number; damage: DamagePart[]; optionalDamage: DamagePart[] }
  | { kind: 'save'; ability: AbilityName; dc: number; damage: DamagePart[] }
  | { kind: 'check'; bonus: number }
  | { kind: 'none' };

type Cost =
  | { kind: 'none' }
  | { kind: 'slot'; minLevel: number; pact: boolean }
  | { kind: 'uses'; resourceKey: string };

interface Ability {
  key: string;                 // stable across re-imports
  name: string;
  source: 'spell' | 'class' | 'subclass' | 'item' | 'feat' | 'species' | 'universal' | 'custom';
  timing: Timing;
  roll: Roll;
  cost: Cost;
  tags: Tag[];
  concentration: boolean;
  range: string | null;
  area: boolean;               // affects an area; from the import's area-of-effect data
  description: string;         // from the player's own sheet
  tagSource: 'import' | 'curated' | 'user' | 'none';
}
```

**Ability key:** `{kind}:{definitionId}:{grantingComponentId or "base"}`. The granting component is part of the key because the same spell can arrive twice with different costs, for example Misty Step cast with a slot and Misty Step cast free through a subclass feature. Custom abilities use a UUID.

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
| `resource_state` | `character_id`, `counts` (jsonb of resource key to remaining), `concentration_key` |
| `usage_events` | `id`, `character_id`, `ability_key`, `view`, `timing`, `plan_key`, `occurred_at` |
| `feedback` | Keyed by (`character_id`, `target_kind`, `target_key`): `useful`. `target_kind` is `ability` or `plan` |

Turn state (which of Action, Bonus Action and Reaction are spent, and whether a slot was spent this turn) is held in the browser only.

Overlays are keyed by ability key, so a re-import keeps every correction and ordering. The same key is what would let homebrew tags be shared between users later.

## 6. Import flow

1. The player pastes a D&D Beyond character URL or ID. The client extracts the numeric ID and rejects anything else.
2. The client calls the `import-character` Edge Function. It requires a signed-in user, accepts only a numeric ID, and requests only the character-service URL above. It sends no cookies or spoofed headers.
3. The raw JSON is stored in `characters.raw_json`. Conversion to `Character` runs in the browser on load, so converter fixes apply to existing characters without a re-import.

| Upstream result | Message to the player |
|---|---|
| 403 | "This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again", with where to find the setting |
| 404 | "No character with that ID" |
| Anything else | "D&D Beyond didn't respond as expected". The saved copy keeps working |

**Re-import** replaces `raw_json`, keeps overlays and custom abilities, and clamps `resource_state.counts` to the new maximums.

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

**Use:** tapping Use marks the timing spent, deducts the slot or limited use, sets concentration if applicable, and records a usage event. One-step undo reverses all four.

**Start my turn:** resets Action, Bonus Action, Reaction and `slotSpentThisTurn`.

**Rests:** Short Rest restores short-rest resources and Pact Magic slots. Long Rest restores everything and clears concentration. Item charges that reset at dawn are restored on a Long Rest. Consumables never reset.

**Hard rules** (deterministic, from SRD 5.2):

- One Action, one Bonus Action and one Reaction per round.
- Only one spell slot may be spent per turn. Reaction spells are exempt from this check, because they are normally cast on another creature's turn.
- One concentration effect at a time. A second is allowed and is labelled "ends your {current}".
- An ability with no remaining uses, or needing a slot when none remain, is unavailable.

Unavailable abilities are greyed out, not hidden.

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

Both views are phone first.

### 10.1 Combat

- Header with character name and a Combat / Explore switch.
- Turn tracker: three pills for Action, Bonus Action and Reaction.
- Resources: this character's limited pools, as remaining and maximum.
- Suggested turn card with reason and thumbs up or down; swipe for the next plan.
- Abilities grouped by Action, Bonus Action, Reaction, and "No action needed" (timing `free`, for example Action Surge). Each row has a drag handle, name, tags, a plain-English roll line and a Use button.
- The Attack action states the number of attacks when it is more than one.
- A collapsed "Anyone can do this" group for the universal actions.
- A "Start my turn" button.

**Roll lines** are full sentences generated from `Roll`:

- Attack: "Roll d20 + 4. Hit: 1d8 + 2 piercing. Add 1d6 poison if you spend a die".
- Save: "They roll a Strength save against 12. Fail: 2d6 necrotic".
- Check: "Roll d20 + 3".

### 10.2 Explore (non-combat)

- Skill checks with the full roll, proficient skills first, with search and inline advantage notes.
- Saving throws in the same format.
- Abilities tagged utility, social or movement, and rituals. No turn tracker; Use still deducts resources.
- Short Rest and Long Rest buttons.

### 10.3 Shared behaviour

- Tapping a row opens the full description and the edit controls: timing, uses, tags, which views it appears in, hide.
- Drag and drop reorders within a group; each view keeps its own order.
- "Add to list" creates a custom ability.
- Hidden abilities move to a "Hidden" drawer and can be restored.

## 11. Accounts and security

- Sign-in by emailed link through Supabase Auth. No passwords.
- Open sign-up is disabled; the DM invites players by email.
- Row-level security on every table: a user can read and write rows for characters they own. A user with `is_table_admin` can read and write all characters.
- The Edge Function is the only code that calls D&D Beyond, and it cannot be used to fetch arbitrary URLs.

## 12. Offline behaviour

- The PWA caches the app shell and the last-loaded characters.
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
2. **Both views with turn and resource tracking**, stored on the device only.
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
