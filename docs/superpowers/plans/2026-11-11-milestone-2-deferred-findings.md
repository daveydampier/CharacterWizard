# Milestone 2: deferred review findings

Minor findings from the task reviews and the final whole-branch review that were deliberately not fixed in milestone 2. None blocks merging. Each should be picked up, or consciously dropped, by the milestone named beside it.

See also "Known gaps carried forward" and "Changes made during execution" in `2026-11-11-milestone-2-views-and-tracking.md`.

## Settle at the start of milestone 3 (accounts and sync)

Storage and the import function are what sync and sign-in build on.

All twelve were settled in the milestone 3 design on 2026-11-18; none was dropped. The decisions are recorded in the spec (sections 4, 5.3, 6, 8 and 11) and implemented by Part A of the milestone 3 plan.

- Stored play state is not validated when read. `clampState` throws on a record without `spent`; today the store swallows that and shows an empty state. Normalise at the storage boundary. **Settled:** every record read from the device or fetched from the account is checked and repaired before use (spec section 5.3).
- `idbStorage` copies the `PlayState` fields by hand in `getPlay` and `putPlay`, so a new field would be dropped without an error. **Settled:** replaced by the version 2 item store, which stores each item whole.
- `memoryStorage` keeps the caller's object references, where IndexedDB stores a copy. The shared tests cannot see the difference. **Settled:** both implementations copy on the way in and on the way out.
- `remove()` can leave an orphaned play record if a play write is still in flight. **Settled:** writes go through one queue, so a delete waits for writes in flight.
- A `use()` made before `open()` has loaded the stored play state can overwrite it. The window is a few milliseconds. **Settled:** Use and the manual controls are disabled until the saved state has loaded (spec section 8).
- The `sheetFor` cache is keyed on `id|importedAt` and never evicts. **Settled:** one sheet per character, dropped when the character is deleted.
- The upstream fetch in the import handler follows redirects. Check against the real service before setting `redirect: 'error'`. **Settled:** the function follows no redirects. Checked on 2026-11-18: the service answers an unknown ID with 403 directly. The owner's first real import after deploying confirms the 200 path.
- The import handler puts no size cap on the request or the upstream body, and sets no `Vary: Origin` on a refusal. Do both with the rate limit. **Settled:** 1 KB and 5 MB caps, `Vary: Origin` on every answer, and 30 imports per player per hour (spec section 6).
- The import client has no timeout of its own, accepts `status: "ok"` without an object `raw`, and reports a `401` or `400` from the function as "Couldn't reach the import service." **Settled:** a 15-second timeout, `raw` must be an object, and separate messages for expired sign-in, not approved and too many imports.
- The dev server's import endpoint allows any origin with no key while the dev server is visible on the local network. It reads the whole request body with no cap and does not log a handler failure. **Settled:** it gets the size cap and logs failures. It stays open to the local network on purpose, because that is how a phone reaches the dev server.
- `supabase/config.toml` sets `verify_jwt = true`. Whether the platform accepts a publishable key there is unverified; plan Task 16 Step 4 has the fallback. **Settled:** set to `false`. The function checks the caller itself through the database, which does not depend on the platform setting (spec section 6).
- The character ID in a route is neither encoded nor decoded. IDs are UUIDs today. **Settled:** percent-encoded in the route; IDs now contain the owner's ID.

## Settle in milestone 3 or 4 (overlays, tags, suggestions)

Milestone 3 takes the six marked **Milestone 3** below, because its screens touch them anyway. The rest stay for milestone 4.

- The "Paste the character JSON instead" row on the Import screen lost its disclosure triangle when it became a flex row, so it no longer looks expandable. Add a ▾ as the Combat and Explore rows have. **Milestone 3.**
- The undo bar survives leaving a character and coming back to it, because opening the character that is already open now keeps its state. Undo still restores the right state.
- A description that is only a non-breaking space shows an empty box.
- Home shows Re-import for a character pasted from JSON with no D&D Beyond ID (`ddbId` "0"), and prints "Imported " with nothing after it for an invalid date. **Milestone 3** (the Re-import half; the empty date stays).
- The character screen shows "Loading…" with no way back if opening a known character fails. **Milestone 3.**
- The slot choice sheet declares `aria-modal` but has no initial focus, focus trap or Escape key. Adopt `<dialog>` when more dialogs arrive. **Milestone 3.**
- Two rows with the same name (a free cast and a slot cast of one spell) have identical accessible names. **Milestone 3.**
- A pill's label says "spent" and its `aria-pressed` also says pressed, which reads oddly in a screen reader.
- The undo bar's `role="status"` element is inserted together with its text, which some screen readers do not announce.
- A spent group in Combat dims its rows to 60% opacity, lowering the contrast of the reason text, and every blocked row gains a reason line, so the list shifts after a Use.
- The universal actions Attack and Magic say "listed above", which ties their text to the layout. Revisit when reordering arrives. The Hide description is terse. **Milestone 3** (the wording; the Hide description stays).
- `Cost.pact` is ignored by the engine: slot options and cost labels are read from the shape of the sheet. Correct for single-class characters only.
- `applyUse` spends the lowest slot when given a slot key that is no longer offered.

## Rules accuracy, when a fixture exists

- A proficiency or expertise modifier with a restriction is applied to the number and also listed as a note (`hasModifier`, milestone 1 code). No fixture has one.
- A negative conditional modifier prints as "Bonus - 2".
- An item-granted spell whose item has no name in the inventory gets an empty "From" note.
- `classLine` joins classes with " / "; only single-class characters are supported.

## Test and tooling polish

- Nothing at compile time stops `@cw/rules` or `@cw/model` from using browser globals, because one `tsconfig.json` gives every package the DOM library. Per-package configs or a lint test would restore the guard.
- `pools(sheet)` is rebuilt several times for each availability check.
- The background-action test in `abilities.test.ts` builds a minimal raw object, so a failure there would be ambiguous.
- The components test "first four are groups" depends on the Vlad fixture's first four pools each having six uses or fewer.
- The slot choice is tested in Combat only, not in Explore with a multi-level caster.
- The parse-ID pattern accepts empty path segments (`//`).
- The Task 14 implementer wrote tests and code together, so no failing-first run exists for the screens tests.

## Not verified in milestone 2

- The app has not been opened on a real phone. The walk-through ran in a desktop browser emulating 375 by 812 on `localhost`.
- Import by link has not been run against the real D&D Beyond service or a deployed Edge Function. Plan Task 16 (repository owner) covers both.
