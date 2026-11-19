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

Settle before Part B adds edits, because an edit is not written again by the next tap the way play state is:

- The sync engine and the store read a record, decide, and write it back in separate storage calls. A change the player makes in between is overwritten and marked as sent. The gap is a few milliseconds. Make each of these one storage operation.
- The item cursor moves past items whose character the device does not hold yet. A character that arrives a round later, or comes back after being deleted on the device, arrives without its older items. Since a fetch now comes a page at a time, this no longer needs unlucky timing: when a table admin's first fetch is cut short on a weak signal, the characters that arrive in the next round come without their play state until their player next changes something. Start the item fetch from the beginning when a character becomes live on the device.

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

## Not verified in milestone 3

- Discord sign-in against the real services, the Supabase adapter against a live project, and the migration applied to a real project. Plan Task 13 (repository owner) covers all three. Remove this line when the owner reports that Task 13's checks passed.
- The app has not been opened on a real phone. The walk-throughs ran in a desktop browser at 375 by 812 against the in-memory account.
- Whether Discord sign-in returns to an app installed to an iPhone's home screen. Milestone 5 must check before install is offered.
- Whether a successful fetch from the character service redirects. An unknown ID answers 403 directly; the import function now follows no redirects.
- An offline start, end to end: sign in, wait more than an hour, turn on aeroplane mode, open the app. It should say the changes are waiting, not "Sign in again to sync", and sync by itself within about two minutes of the connection coming back, while the app is on screen (the auth library waits a minute after a renewal fails, then tries every 30 seconds). Tests cover the app's side; the auth library's side was read in its source, not run. Check it in Task 13.
- What the screen shows between returning from Discord and the sign-in finishing. From the code, the sign-in screen shows again for a moment.
