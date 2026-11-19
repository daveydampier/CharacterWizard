-- Character Wizard, milestone 3: accounts, characters and everything attached to them.
-- The rules here are mirrored by apps/web/src/remote/memory.ts, and one list of test cases
-- (apps/web/src/remote/contract.ts) runs against both. Change them together.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  approved boolean not null default false,
  is_table_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.characters (
  -- "ddb-<ddb id>-<owner id>" for an imported character; a UUID for pasted JSON.
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  ddb_character_id text not null default '0',
  name text not null default '',
  raw_json jsonb,
  imported_at timestamptz not null,
  -- When the change was made, by the clock of the device that made it. Never in the future.
  updated_at timestamptz not null,
  deleted boolean not null default false,
  -- Stamped on every accepted write. Devices fetch "everything after the last rev I saw".
  rev bigint not null default 0
);
create index characters_rev on public.characters (rev);
create index characters_owner on public.characters (owner_id);

create table public.character_items (
  character_id text not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('play', 'edit', 'custom', 'order')),
  key text not null,
  data jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  rev bigint not null default 0,
  primary key (character_id, kind, key)
);
create index character_items_rev on public.character_items (rev);

create table public.import_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index import_log_user on public.import_log (user_id, at);

create sequence public.sync_rev;

-- ---------------------------------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------------------------------

-- Security definer, so that a policy on profiles can ask about profiles without recursing.
create function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved)
$$;

create function public.is_table_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved and p.is_table_admin)
$$;

-- A first sign-in creates the profile: not approved, not an admin, named as on Discord.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'Player'
    )
  );
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Write ordering: the later change wins, and every accepted write gets the next rev
-- ---------------------------------------------------------------------------------------------

create function public.characters_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := least(new.updated_at, now());
  if tg_op = 'UPDATE' then
    -- Not newer than what is stored: skip the write without an error.
    if new.updated_at <= old.updated_at then
      return null;
    end if;
    new.id := old.id;
    new.owner_id := old.owner_id;
  end if;
  if new.deleted then
    new.raw_json := null;
  elsif tg_op = 'INSERT' or old.deleted then
    if (select count(*) from public.characters c where c.owner_id = new.owner_id and not c.deleted) >= 10 then
      raise exception 'character_limit' using errcode = 'P0001';
    end if;
  end if;
  -- Held until commit, so rev order is commit order and no fetch can skip a row.
  perform pg_advisory_xact_lock(4242);
  new.rev := nextval('public.sync_rev');
  return new;
end
$$;

create trigger characters_before_write before insert or update on public.characters
  for each row execute function public.characters_before_write();

-- A deleted character loses its items.
create function public.characters_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted and not old.deleted then
    delete from public.character_items i where i.character_id = new.id;
  end if;
  return null;
end
$$;

create trigger characters_after_delete after update on public.characters
  for each row execute function public.characters_after_delete();

create function public.items_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := least(new.updated_at, now());
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  if new.deleted then
    new.data := null;
  end if;
  perform pg_advisory_xact_lock(4242);
  new.rev := nextval('public.sync_rev');
  return new;
end
$$;

create trigger items_before_write before insert or update on public.character_items
  for each row execute function public.items_before_write();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.character_items enable row level security;
alter table public.import_log enable row level security;

-- Nobody writes profiles directly: the trigger creates them and set_player_approved changes them.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_table_admin());

create policy characters_select on public.characters for select to authenticated
  using (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()));
create policy characters_insert on public.characters for insert to authenticated
  with check (public.is_approved() and owner_id = (select auth.uid()));
create policy characters_update on public.characters for update to authenticated
  using (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()))
  with check (public.is_approved() and (owner_id = (select auth.uid()) or public.is_table_admin()));

-- The inner query is itself filtered by the policies on characters, so "exists" means
-- "exists, and the caller may see it".
create policy items_select on public.character_items for select to authenticated
  using (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));
create policy items_insert on public.character_items for insert to authenticated
  with check (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));
create policy items_update on public.character_items for update to authenticated
  using (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted))
  with check (public.is_approved() and exists (
    select 1 from public.characters c where c.id = character_id and not c.deleted));

-- import_log has no policies: only record_import touches it.

-- ---------------------------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------------------------

-- Each row is taken or refused on its own, so one refused character does not hold up the rest.
-- Returns [{ "id": ..., "reason": "limit" | "refused" }] for the rows it would not take.
create function public.push_characters(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_id text;
  rejected jsonb := '[]'::jsonb;
begin
  -- Checked before the lock, so that an account that is not approved cannot hold up the writers
  -- that are. Its rows come back as refused, as row-level security would refuse each of them.
  if not public.is_approved() then
    return coalesce(
      (select jsonb_agg(jsonb_build_object('id', e ->> 'id', 'reason', 'refused')) from jsonb_array_elements(rows) e),
      '[]'::jsonb);
  end if;
  -- Taken before any row is locked, so that every writer queues in the same order. Without it,
  -- two devices writing the same rows can deadlock, and two devices of one player can both
  -- pass the ten-character count.
  perform pg_advisory_xact_lock(4242);
  for r in select * from jsonb_array_elements(rows) loop
    v_id := r ->> 'id';
    begin
      if exists (select 1 from public.characters c where c.id = v_id) then
        update public.characters set
          ddb_character_id = r ->> 'ddb_character_id',
          name = r ->> 'name',
          raw_json = nullif(r -> 'raw_json', 'null'::jsonb),
          imported_at = (r ->> 'imported_at')::timestamptz,
          updated_at = (r ->> 'updated_at')::timestamptz,
          deleted = coalesce((r ->> 'deleted')::boolean, false)
        where id = v_id;
      else
        insert into public.characters (id, owner_id, ddb_character_id, name, raw_json, imported_at, updated_at, deleted)
        values (
          v_id, auth.uid(), r ->> 'ddb_character_id', r ->> 'name', nullif(r -> 'raw_json', 'null'::jsonb),
          (r ->> 'imported_at')::timestamptz, (r ->> 'updated_at')::timestamptz,
          coalesce((r ->> 'deleted')::boolean, false)
        );
      end if;
    exception
      -- Refusals that will not change if the same row is sent again: the limit, a row that is
      -- not the caller's, an id that is taken, data that is not valid. Anything else (a deadlock,
      -- a timeout) is not a refusal: it propagates, the whole call fails, and the device tries again.
      when raise_exception or insufficient_privilege or integrity_constraint_violation
        or unique_violation or not_null_violation or check_violation or foreign_key_violation
        or data_exception or invalid_datetime_format or datetime_field_overflow
        or invalid_text_representation then
      rejected := rejected || jsonb_build_object(
        'id', v_id, 'reason', case when sqlerrm = 'character_limit' then 'limit' else 'refused' end);
    end;
  end loop;
  return rejected;
end
$$;

-- An item whose character the caller cannot see, or that is deleted, is skipped without an error.
create function public.push_items(rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
begin
  -- Checked before the lock, for the same reason as in push_characters.
  if not public.is_approved() then
    return;
  end if;
  -- The same lock, taken first for the same reason as in push_characters.
  perform pg_advisory_xact_lock(4242);
  for r in select * from jsonb_array_elements(rows) loop
    if not exists (
      select 1 from public.characters c where c.id = r ->> 'character_id' and not c.deleted
    ) then
      continue;
    end if;
    insert into public.character_items (character_id, kind, key, data, updated_at, deleted)
    values (
      r ->> 'character_id', r ->> 'kind', r ->> 'key', nullif(r -> 'data', 'null'::jsonb),
      (r ->> 'updated_at')::timestamptz, coalesce((r ->> 'deleted')::boolean, false)
    )
    on conflict (character_id, kind, key) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted;
  end loop;
end
$$;

create function public.set_player_approved(player uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_table_admin() or player = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set approved = value where id = player;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end
$$;

-- Called by the import function with the caller's own token, before it fetches anything.
create function public.record_import() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_recent integer;
begin
  if v_user is null or not public.is_approved() then
    return 'not-approved';
  end if;
  delete from public.import_log where user_id = v_user and at < now() - interval '1 day';
  select count(*) into v_recent from public.import_log where user_id = v_user and at > now() - interval '1 hour';
  if v_recent >= 30 then
    return 'rate-limited';
  end if;
  insert into public.import_log (user_id) values (v_user);
  return 'ok';
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants. Stated in full, so the result does not depend on the project's default privileges.
-- ---------------------------------------------------------------------------------------------

revoke all on public.profiles, public.characters, public.character_items, public.import_log from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.characters, public.character_items to authenticated;

revoke execute on function
  public.is_approved(), public.is_table_admin(), public.push_characters(jsonb), public.push_items(jsonb),
  public.set_player_approved(uuid, boolean), public.record_import(),
  public.handle_new_user(), public.characters_before_write(), public.characters_after_delete(),
  public.items_before_write()
from public, anon;

-- The trigger functions are never called directly, by anyone.
revoke execute on function
  public.handle_new_user(), public.characters_before_write(), public.characters_after_delete(),
  public.items_before_write()
from authenticated;
revoke all on sequence public.sync_rev from anon, authenticated;

grant execute on function
  public.is_approved(), public.is_table_admin(), public.push_characters(jsonb), public.push_items(jsonb),
  public.set_player_approved(uuid, boolean), public.record_import()
to authenticated;
