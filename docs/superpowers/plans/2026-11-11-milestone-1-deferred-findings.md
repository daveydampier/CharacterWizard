# Milestone 1: deferred review findings

Minor findings from the task reviews and the final whole-branch review that were deliberately not fixed in milestone 1. None blocks merging. Each should be picked up, or consciously dropped, by the milestone named beside it.

See also "Known gaps carried forward" in `2026-11-11-milestone-1-import-and-sheet-maths.md`, which lists the accepted scope limits.

## Settle in milestone 2 (views and tracking)

All six were settled in the milestone 2 design on 2026-11-11. The decisions are recorded in the spec (section 5.1 unless stated) and implemented by `2026-11-11-milestone-2-views-and-tracking.md`.

- Weapon abilities cost nothing, although a weapon's charge pool is listed as a resource under the same key. **Settled:** the weapon carries the pool in `Ability.poolKey`; the row shows it as pips spent by hand, and Use never touches it.
- `Roll` has no damage-only variant, so spells with damage but no attack or save (Hex, Absorb Elements) show no damage. **Settled:** `Roll` gains `damage`, and `dice` for feature dice whose meaning the import does not state.
- Unarmed strike damage is a plain number string (`'0'`, `'4'`), not a dice expression. **Settled:** it stays a string; the roll line prints a flat number as is and zero as "no damage" (spec section 10.1).
- An item-granted spell that D&D Beyond flags as using a spell slot gets a `:slot` key suffix while its cost is the item's charges or nothing. **Settled:** every item-granted spell's key ends `:item`; the cost is the item's charge, else a slot if flagged, else nothing.
- An equipped but unattuned attunable weapon no longer shows its charge pool. **Settled:** kept, because an unattuned item's magic is off; the row now says so.
- `Ability.source` never takes the value `subclass`; background actions map to `feat`. **Settled:** `subclass` is removed and `background` is added.

## Settle in milestone 3 (accounts and overlays, where keys become persistent)

- Two equipped copies of the same item share one key, so only one appears.
- Actions with the same `id` and `componentId` but different `entityTypeId` share a key.
- Actions with no id and no name get a positional key that changes if entries are reordered.

## Rules accuracy, when a fixture exists

- Weapon attack and damage apply no flat `bonus` modifiers, and Armor Class sums only `armor-class`. Fighting styles such as Archery and Defense are not applied.
- An `unarmored-armor-class` row with a fixed value is added to 10 + Dexterity; it may be a base value instead. A negative ability modifier there is clamped to 0.
- Skill customisation proficiency levels 1 to 3 are inferred; only 4 (expertise) is confirmed.
- `armorClass` uses the first body armour and the first shield it finds.
- A custom action with no dice is never treated as an attack.
- `spellSlots` sums slot rows by index across classes. This is not a multiclass calculation.
- `versatileDice` leaves a d12 or larger unchanged.

## Test and tooling polish

- No direct synthetic tests for `bonusTotal`'s ability and proficiency branches or for `skillCustom` overrides; fixtures cover them implicitly.
- `model.test.ts` spot-checks 2 of the 18 skill-to-ability mappings.
- The "skips unequipped weapons" test does not first assert that the fixture has an equipped weapon.
- The `limitedUses` test uses a subset match, so unexpected extra names pass.
- `proficiencyBonus` does not guard against non-integer levels.
- `bonusTypes.includes(1)` in `modifiers.ts` is an unnamed magic number.
- A class slot table shorter than the class level is indistinguishable from "no slots".
- `fetch-character` and `sheet` print a raw stack trace on a network failure, a non-JSON response or a bad file path.
- The sanitizer redacts only string values; a nested object under a redacted key is recursed into.
- `parseCharacterId` rejects URLs with a query string or fragment. (Fixed in milestone 2, where it moves into `@cw/ddb-import`.)
- `loadRaw` returns `any`.

## Design note

- The `Character` format carries D&D Beyond vocabulary (modifier `type` and `subType` strings, `ddbTags`). A later PDF or manual importer would have to emit the same strings.

## Resolved before the first push

- Fixtures originally kept each character's D&D Beyond `id` and `readonlyUrl`, and one kept descriptive fields. The sanitizer now replaces the ID everywhere and nulls the link and descriptive fields, and the unpushed history was rewritten so earlier versions of the fixture files were never published.
