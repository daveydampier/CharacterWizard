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
