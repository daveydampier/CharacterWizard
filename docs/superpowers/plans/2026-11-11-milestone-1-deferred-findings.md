# Milestone 1: deferred review findings

Minor findings from the task reviews and the final whole-branch review that were deliberately not fixed in milestone 1. None blocks merging. Each should be picked up, or consciously dropped, by the milestone named beside it.

See also "Known gaps carried forward" in `2026-11-11-milestone-1-import-and-sheet-maths.md`, which lists the accepted scope limits.

## Settle in milestone 2 (views and tracking)

- Weapon abilities cost nothing, although a weapon's charge pool is listed as a resource under the same key. Decide how spending a charge links to the weapon.
- `Roll` has no damage-only variant, so spells with damage but no attack or save (Hex, Absorb Elements) show no damage.
- Unarmed strike damage is a plain number string (`'0'`, `'4'`), not a dice expression. The roll line needs to handle it.
- An item-granted spell that D&D Beyond flags as using a spell slot gets a `:slot` key suffix while its cost is the item's charges or nothing. If its item has no pool, it shows no cost.
- An equipped but unattuned attunable weapon no longer shows its charge pool.
- `Ability.source` never takes the value `subclass`; background actions map to `feat`.

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
- `parseCharacterId` rejects URLs with a query string or fragment.
- `loadRaw` returns `any`.

## Design note

- The `Character` format carries D&D Beyond vocabulary (modifier `type` and `subType` strings, `ddbTags`). A later PDF or manual importer would have to emit the same strings.

## Owner decision outstanding

- Fixtures keep each character's D&D Beyond `id` and `readonlyUrl`, and one fixture keeps descriptive fields (age, hair and similar). While the sheets are public these lead to the live sheets and their owners' usernames. Decide whether to scrub them before the repository is pushed.
