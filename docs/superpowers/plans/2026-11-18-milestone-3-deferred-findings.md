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

## Found by the task reviews of Part A

Every task was reviewed after it was built. The reviews found thirteen faults in the plan's own code that were fixed as they were found, each with a test that fails without the fix: the in-memory account's import could throw; the database's write functions could deadlock, could report a passing failure as a permanent refusal, and counted the ten-character limit before taking their lock; claiming a device's characters at first sign-in could throw away a copy; a failed Discord sign-in was swallowed; a saved state that could not be read could be overwritten; a pill flipped during a fetch could undo another device's spending; a tap during a fetch's read-back could be lost; a damaged fetched character could throw; and a sync still running at sign-out could write a signed-out player's data back to the device.

What the reviews found and left, smallest first. None blocks merging.

Converter and storage:

- The `#2` suffix for a second copy of an item depends on inventory order. D&D Beyond's inventory entry ID could serve instead.
- `numberDuplicates` does not check a numbered key against a natural key that already ends `#2`.
- `normalisePlayItem` keeps a count between 0 and 1 as a stored 0. Floor first, then test.
- After a failed write of the synced play item, a later pill flip does not retry it, because the two items are compared with what is in memory.
- Deleting a character removes its record and then writes the deletion marker in two steps. If the second fails, the deletion never reaches the account.

The account (database and in-memory):

- A write straight to the tables, which the app never makes, still takes the write lock after the row lock and counts the limit before it. Moving the lock to the top of both triggers would close that too.
- A push of an ID that another player owns comes back as `refused`, which tells the caller the ID exists.
- `record_import` is not serialised per player, so simultaneous calls can pass the hourly count together. It also counts an import before the request body is checked, so a malformed request or a failure at D&D Beyond uses one of the hour's thirty.
- `is_approved()` and `is_table_admin()` in the policies run once per row. Wrapping them in `(select …)` would run them once per statement.
- `Remote.profile()` is documented to return null for a signed-in user with no profile, but the in-memory account rejects as unauthorized, and no shared test covers that case.
- A database outage during an import is reported as "Your sign-in has expired", which misleads.

Syncing and the store:

- On an exact tie of `updatedAt` with different content, the fetched copy replaces an unsent local one.
- While sign-out waits for a running sync, the character is still open, so a tap in that wait can write an item after the device is emptied. Close the character before the wait.
- The counter that notices a change made during a fetch is one counter for every character.
- After a read of saved state fails once, the not-saving banner stays on until the app restarts, even if a later read succeeds.
- `saveImported(raw, replaceId)` does not check that the sheet's D&D Beyond ID matches the character being replaced.

Screens:

- The waiting screen's "Sign out" and the Players screen's "Try again" have no guard against a double tap.
- If the reload after a successful approval fails, the Players list is replaced by "Couldn't load the players.", which does not say the change landed.
- A table admin can remove another table admin's access. There is one admin today.
- A card for a character whose sheet cannot be built shows no class line and no hint why.
- Once "This character couldn't be opened." is shown, nothing retries while the screen stays up.
- The dev server's import endpoint answers an oversized request with a reset connection, not the handler's 400.

Tests:

- No test for an equipped item with no definition ID, for an unattuned second copy, for moving a character to the ID it already has, or for upgrading a version 1 database with malformed rows.
- No test against the SQL of an expired token, and nothing can test two simultaneous writers, because the in-process Postgres has one connection.
- No screen-level test of a character that does not open because its saved state cannot be read; the store's test covers it.

## Found by the whole-branch review of Part A

The whole of Part A was reviewed once more after its last task. It found nothing that loses a player's work in ordinary use or shows it to the wrong person. Three faults were fixed before the pull request, each with a test that fails without the fix:

- An account that had signed in but was not approved could take the lock that every write waits for, and so hold up the table's syncing. Both write functions now check the caller before they take it.
- Opening the app with no connection, more than an hour after it was last used, said "Sign in again to sync". The sign-in had not ended; the account just could not be reached to renew it. The app now says the changes are waiting, and carries on once the connection is back.
- No call to the account had a time limit, so one stalled request held up every later sync, and sign-out with it. Each call that reads or writes data now gives up after 20 seconds, and a fetch asks for a page at a time (5 characters, 500 items).

Also fixed: anyone who signed in before the database script was applied gets a profile when it is applied.

Two faults were left to settle before Part B added edits, because an edit is not written again by the next tap the way play state is. Part B's first two tasks fixed both, each with tests that fail without the fix:

- The sync engine and the store read a record, decided, and wrote it back in separate storage calls, so a change the player made in between was overwritten and marked as sent. The device's storage now looks at a record and writes it in one step, and the sync engine, play state and edits all go through that.
- The item cursor moved past items whose character the device did not hold yet, so a character that arrived a round later, or came back after being deleted on the device, arrived without its older items. The item fetch now starts from the beginning whenever a character becomes live on the device.

Left, smallest first:

- The limits are guesses: 20 seconds a call, 8 seconds at start-up, 5 characters and 500 items a page. Nobody has measured a real sheet on a weak signal. A call that is given up on is not cancelled; its answer is ignored. Sign-out's own request to the account has no limit, but the device is emptied before it is made.
- The upgrade from version 1 storage stamps play state with the time of the upgrade, so at first sign-in it beats newer play state in the account. Use the import time.
- On a device whose clock runs more than about two seconds fast, its own change comes back with a capped time, counts as a change from elsewhere, and clears Undo.
- A character the account refused is marked as sent, and the line reads "Saved to your account".
- One item the database cannot take stops every item behind it, with no word to the player.
- An admin whose approval is removed but who is still marked as an admin keeps other players' characters on the device.
- Character records read from the device are not checked, though section 5.3 says they are. A record whose name is not text would throw in the list's sort.
- Each sync reads every character's whole sheet from the device several times, every 30 seconds. Measure on a phone before a DM holding the whole table uses it.
- Two tabs of the app share storage but not memory. One can overwrite the other's change, and signing out in one leaves the other writing.
- When an admin's change to a player's character meets that player's limit, the admin's device says "Your account has ten characters."
- Home's "Sign in" on the sync line shows nothing if sign-in cannot start.

## Decided, not fixed

- **A different account on the same device.** If a different account signs in on a device whose earlier session had ended, the earlier account's copy is removed from the device, including any changes it had not yet sent. The device cannot send them without that account's session, and refusing the second sign-in would need a screen state the design does not have. It takes a shared device, two Discord accounts, and unsent changes made after the first session ended. The spec says so (section 11).
- **A fetched change that cannot be read back.** The character stays open and the player's next change is written over the fetched copy, as any later local change would be. Closing the character in the middle of play over a read error would be worse.

## The Features page

The Features page (plan `2026-11-21-features-page.md`) was reviewed task by task and once more as a whole. Found and left, smallest first. None blocks merging.

- The same option chosen under two parents got `#2` by its position in the sheet's list. Settled in Part B: an option's key now names the feature it is attached to.
- Two features with the same IDs both get the same play rows. No fixture has one; when it happens it is one entry listed twice.
- An orphan option from a list the app does not know (the sheet has one for items) is shown among the feats.
- A feature row's button says whether it is open but does not point at the text it opens. Ability rows have the same shape; change both together.
- A group's heading is read twice by a screen reader (the section's label and its heading). Combat's groups have the same shape.
- `featureLine` shows a level line for any feature that has a level. Only class features have one today.
- A standard background whose feature name is only spaces is chosen over a custom background's feature, and then left out. It needs a malformed sheet.
- A feature with no ID is keyed by its trimmed name, so a name that gains or loses a space at its ends keeps its key. Nothing stored a key before this, so no stored edit moved.

## Part B: editing and arranging

Part B (plan `2026-11-22-milestone-3-part-b-overlays.md`) was built task by task, each task reviewed by itself, and the finished branch reviewed once more as a whole.

The task reviews found eleven faults, all fixed with tests that fail without the fix: what was spent was forgotten when a pool stopped being shown, so hiding and restoring was a free refill; Undo could put back more spent uses than an edited maximum allows, or concentration on an ability since hidden; an imported pool above 99 uses blocked saving any change to that ability; a sync that changed an ability while its editor was open pinned the old imported values as edits; a roll number out of range was changed without a word; a dialog did not hand focus back when it closed; two hidden rows, or two features, with one name could not be told apart by their controls; the editor's comparison depended on the order of keys; and the test stand-in for a dialog was too loose to notice any of the focus faults.

The whole-branch review found no path in ordinary use that loses, duplicates or resurrects an edit, an order, a custom ability or what is spent. It asked for nine more changes, all made: "Add an ability" now offers "Shown in" and the new row appears in the view it was added from; one edit holds a shared pool's maximum; a custom ability must have a key of the player's own; nothing is written for a character the device no longer holds; the editor's title tells twins apart; a number in a feature's label stays with that feature; a negative bonus can be typed on a phone; and a weapon with charges is no longer offered "Limited uses", which would have rewritten its item's charges.

One finding from the last re-review is open and waits for the owner's word:

- **A feature the sheet lists twice.** D&D Beyond lists Rage and Innate Sorcery twice and hides one copy. Numbers in feature labels now follow the sheet's order, and the hidden copy comes first, so the copy the player sees is named "Rage (Barbarian, level 1) 2" on its controls and to a screen reader. The row's visible text is still "Rage". The fix is small: when numbering, put the copies the sheet itself hides after the others.

Found and left. None blocks merging. The ones to pick up first are at the top.

Editing:

- A feature that already has rows in play is not offered "Shown in" (decided; spec section 5.5). A feat with several parts, only one of which has an ability, cannot be ticked into a view as a reminder of the rest; the player adds a custom ability for that.
- The Features page does not show which features the player has ticked into a view. "In play" marks only a feature with abilities of its own.
- "Back to imported" on a feature that D&D Beyond hides, and that the player had restored, hides it again: for that feature the restoring is itself the edit.
- A weapon with charges cannot have its charges' maximum corrected in the app. The editor says its charges are on its item.
- If a sync brings in a "Shown in" choice while the editor is open and the player saves another field, the box goes back to the app's rule and the synced choice is lost.
- An ability whose uses cannot be edited keeps a stale `uses` edit, written by an older state of the sheet, through every Save. It has no effect, but the row counts as edited.
- A stored `{ hidden: false }` on an ability that is not a feature counts as an edit though it changes nothing. The app never writes one.
- Dice text is not checked as dice: "abc" saves as a roll.
- An editor's error is not tied to its field, and focus does not move to it. It is announced.
- The line under a feature's "Shown in" is not tied to the boxes for a screen reader.
- The editor of a feature with rows in play says "Change those rows where they are listed" even when none of them is on the sheet.
- A hidden custom ability cannot be deleted until it is restored. Its delete question does not say that deleting ends concentration and forgets spent uses.
- A spell-slot cost can be chosen for a custom ability on a character with no slots. No test covers a custom slot ability on a pact-only character or one with both kinds.
- No length limit on a custom ability's name and description, nor on the lists the normalisers read.
- Saving an editor writes the whole edit as this version of the app understands it, so a field a newer version wrote there is dropped.

Arranging:

- After "Move up" or "Move down" reaches an end of the group, or after Hide, focus falls to the page. A move by button is not announced as a drag is.
- A press inside a dialog that is released on the dimmed area closes the dialog, and loses what was typed.
- When a dialog opens, focus lands on the dialog's scrolling body, not on its first field (seen in a desktop browser).
- Deleting a custom ability, deleting a character and signing out with unsynced changes ask with the browser's own confirm box, not with a dialog of the app's.
- A row hidden and later restored comes back first in its group, not where it was.
- A dragged row can be dragged, on screen, outside its list. It still lands in its group.
- The touch sensor is never used: on a touch screen the pointer sensor acts first, so a drag starts after 4 px on the handle, not after a short press.
- A feature's options keep the sheet's order under it and cannot be put in order among themselves. They are a plain group, not a list, to a screen reader.
- A feature's row in a view comes after every ability in its group until the player arranges that group.
- Hide on a feature's row in a view hides the feature everywhere, the Features page included. Unticking "Shown in" takes it out of one view. It can be restored from either "Hidden" drawer.
- A copy of a feature that D&D Beyond hides counts as a twin of the one shown, so the shown one carries its class and level in its controls' names.
- A ticked feature's row that shares a name with an ability gets the same label as it, because a row with no cost has no kind of cost to add.
- Two rows with one name and the same kind of cost (two slot casts of one spell from two sources) still share a label.
- "Start my turn" stays pinned at the bottom of the Combat view while the list is being arranged.
- Only four pools are shown before "more", so a pool the player has just made can be behind that button. A pool's chip stays when its only ability is unticked from both views but is still listed nowhere else.

Storage and syncing:

- Every write of an item reads the item's whole character, raw sheet included: twice for each tap, once for each fetched item. Nobody has measured it on a phone. Only the fetch needs the record; a tap needs only to know it is still there.
- The device forgets a deletion once the account has it. An edit removed and made again (hide, restore, hide) is then stamped by this device's clock alone; if that clock is behind the account's by more than the gap between the two changes, the account ignores the new edit and the device shows what the account does not hold.
- After a tap on a character that another device has just deleted, nothing is written, but the screen shows the change and "Waiting to sync" until the sync round ends and closes the character.
- If the read-back after a fetch fails, a change the player made to what is spent during that fetch is no longer stamped again first. It still wins unless the other device's clock is ahead.
- A sync or re-import of the same character in the moment between opening it and its saved state arriving can leave the sheet and the base sheet from different imports.
- A failed write of an edit leaves the edit on screen until the next read-back drops it. The "not saving" banner is the only sign. Play state behaves the same.
- Undo is dropped, needlessly, when the spent counts differ only in the order they are held in. The same comparison makes the store rewrite play state it had no need to.
- The check for "does the device already hold this character" reads the list before the writes, so a character deleted on the device in that instant, with a newer copy fetched, arrives without its items being fetched again. A fetched copy that loses to a newer local deletion still sends the fetch back to the beginning once.
- Deleting a custom ability leaves its key in the stored orders. Saving one writes its two items in two steps. `setEdit` and `saveCustom` stamp a new time even when nothing changed.
- A re-import still takes its time stamp from the copy in memory, and deleting a character is still two storage steps (listed above under Part A).
- An ID that arrives as text containing `@` or `#` could make two features share a key. D&D Beyond's IDs are numbers.

Tests:

- No test syncs a feature's edit, an order or a custom ability between two devices; only an ability's edit. It is the same path.
- No test of the one-step write on the IndexedDB storage with two calls interleaved, nor that a fetch which starts again rewrites nothing, nor of a failed write of an edit, nor of an edit that clamps what is spent during a fetch.
- Not pinned by a test: where "Always on" sits among the groups; a passive row with a cost keeping its Use button; an option with no parent named; a feature D&D Beyond hides that is ticked and not restored; a reload re-reading the Features page's order; the second order of two abilities on one pool; non-finite numbers in stored edits.
- The test "ignores edits until the saved state has loaded" passes without the guard it names.

Size:

- The JavaScript bundle is over 600 kB before compression, mostly supabase-js and dnd-kit. Milestone 5 (offline and install) is the place to split it.

## Task 13: done

The owner ran Task 13 on 2026-11-19, and the Part A pull request is merged.

Checked from the command line after the owner's steps:

- The database script is applied to the Supabase project.
- The import function is deployed with the platform's own token check off. Not signed in, it answers 401 with `{"status":"unauthorized"}`. It allows a request from the site's address and answers 403 to any other address.
- The site is live on Cloudflare Pages, built with the project's address and publishable key.

The owner's report on signing in with Discord, becoming the table admin (Step 8) and the device checks (Step 9): "ok tested and everything worked as expected". So Discord sign-in, the Supabase adapter and the database script all work against the real services. The owner was given Step 9's five checks and the offline start check, and has not yet said which of them were run.

What Task 13's steps got wrong, found with Supabase CLI 3.2.0. The plan and the README are corrected:

- `supabase db push` aims at a local database by default and fails without Docker. `supabase db push --remote` applies the script to the linked project.
- `supabase functions deploy import-character --use-api` deploys without Docker.
- Cloudflare's Create screen opens the form for importing a Worker (project name, build command, deploy command). Pages is under Create application, then Pages, then Connect to Git. The first Pages deployment "failed to start" and worked when retried.

## Not verified in milestone 3

- Which of Task 13's device checks were run. The owner reported that everything worked, without saying which checks. Ask, then remove each line below that a check covers.
- The app has not been opened on a real phone. The walk-throughs ran in a desktop browser at 375 by 812 against the in-memory account.
- Whether Discord sign-in returns to an app installed to an iPhone's home screen. Milestone 5 must check before install is offered.
- Whether a successful fetch from the character service redirects. An unknown ID answers 403 directly; the import function now follows no redirects.
- An offline start, end to end: sign in, wait more than an hour, turn on aeroplane mode, open the app. It should say the changes are waiting, not "Sign in again to sync", and sync by itself within about two minutes of the connection coming back, while the app is on screen (the auth library waits a minute after a renewal fails, then tries every 30 seconds). Tests cover the app's side; the auth library's side was read in its source, not run. Check it in Task 13.
- What the screen shows between returning from Discord and the sign-in finishing. From the code, the sign-in screen shows again for a moment.
- Dragging in "Edit list" on a real touch screen. It was checked with a mouse on the finished branch; the tests cover the keyboard and the up and down buttons.
- Whether an iPhone's keyboard offers a minus sign in the attack bonus and check bonus fields. The digits-only keypad was removed from those two fields for that reason; nobody has looked on a phone.
- How long a tap takes to save on a real phone with a real sheet, now that every write of an item reads its character.
- An edit made on one device appearing on another, on the deployed site. Tests cover it against the in-memory account.
- One database test ("gives them a profile: named as on Discord, not approved, not an admin") failed once in a full run while Part B's plan was being built, and passed on three reruns and in every later run. Nothing in Part B touches the database. If it fails again, look at how the test waits for the in-process Postgres.
- A real feature description on the Features page at phone width. The test sheets' descriptions are placeholders, so long text and wide tables were not seen there. The page uses the same description display as every ability row.
- Whether D&D Beyond fills in a required level on species traits that are gained later. Every trait on the test sheets has none. The app leaves out a trait whose required level is above the character's.
