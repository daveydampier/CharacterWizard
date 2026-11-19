import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * The parts of a Supabase project that the migrations rely on and PGlite does not have: the two
 * API roles, the auth schema with its users table, and auth.uid(), written as Supabase writes it.
 */
const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

/** A fresh in-process Postgres with the stand-in and every migration applied, in file-name order. */
export async function openDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  return db;
}

/** Empties every table and restarts the rev sequence, so each test starts from nothing. */
export async function resetDatabase(db: PGlite): Promise<void> {
  await db.exec(`
    truncate auth.users cascade;
    alter sequence public.sync_rev restart;
  `);
}

/**
 * Runs one statement as a signed-in user, the way Supabase's API does: as the `authenticated`
 * role, with the user's ID in the token claims. Pass null for a request with no token.
 */
export async function queryAs<T = Record<string, unknown>>(
  db: PGlite, userId: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId === null ? '' : JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await tx.exec(`set local role ${userId === null ? 'anon' : 'authenticated'}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
