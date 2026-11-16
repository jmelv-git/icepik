-- =====================================================================
-- ICEPik migration, November 2026: recovery keys, the username rule, the
-- email hook, and a password check before a saved account is deleted.
--
-- For a Supabase project that already runs the earlier
-- database/icepik_schema.sql. It only adds functions, a table and a trigger,
-- and replaces delete_my_account(), so pins, votes, profile totals and
-- accounts all stay. It is safe to run more than once. A fresh project
-- doesn't need it: run database/icepik_schema.sql, which already includes
-- all of this.
--
-- Step 1. Run this query on its own first, and report the number:
--
--   select count(*) from auth.users
--   where nullif(email, '') is not null
--     and email !~ '^[a-z0-9_]{3,20}@icepik\.invalid$';
--
--   It counts saved accounts whose login ID breaks the new username rule
--   (3 to 20 lowercase letters, numbers or underscores). The new trigger
--   leaves those accounts alone, since it checks only new and changed login
--   IDs, and they can still log in. But they can never use "Forgot password?",
--   because the reset only accepts usernames that follow the rule.
--
-- Step 2. Run this whole file (SQL Editor -> New query -> paste -> Run).
--   It runs as one transaction: if any statement fails, nothing changes.
--
-- Step 3. Turn on the dashboard settings listed at the top of
--   database/icepik_schema.sql, in this order: Minimum password length 15,
--   Require current password ON, CAPTCHA ON (required), then the Send Email
--   hook (Hooks -> Send Email -> Postgres -> public.block_auth_emails).
--   The hook needs the function this file creates.
-- =====================================================================

begin;

-- Same count as step 1, shown as a notice in the results.
do $$
declare
  rule_breakers bigint;
begin
  select count(*) into rule_breakers from auth.users
  where nullif(email, '') is not null
    and email !~ '^[a-z0-9_]{3,20}@icepik\.invalid$';
  raise notice 'Saved accounts whose login ID breaks the username rule: %', rule_breakers;
end;
$$;

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- Password sign-in check, shared by create_recovery_key and delete_my_account
-- ---------------------------------------------------------------------

-- True when this session signed in with its password in the last 10 minutes.
-- Supabase writes how and when a session signed in into the access token's
-- amr claim, e.g. [{"method": "password", "timestamp": 1794614400}]; a
-- refreshed token keeps the original sign-in time. Functions that someone
-- holding an unlocked phone shouldn't run without the password check this.
create or replace function public.signed_in_with_password_recently()
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then exists (
      select 1 from jsonb_array_elements(auth.jwt() -> 'amr') m
      where m ->> 'method' = 'password'
        and (m ->> 'timestamp')::numeric > extract(epoch from now()) - 600)
    else false
  end;
$$;

revoke execute on function public.signed_in_with_password_recently() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Username rule on auth.users
-- ---------------------------------------------------------------------

-- Saved accounts: the login ID must be username@icepik.invalid, with a
-- username of 3 to 20 lowercase letters, numbers or underscores (the rule the
-- password reset uses), and it can't change once saved. This keeps real email
-- addresses and phone numbers out of auth.users, and stops someone holding an
-- unlocked phone from renaming the account so its owner can't log in or reset
-- the password. Supabase reports a refusal here only as "Database error ..."
-- (code unexpected_failure), so the app checks the username before saving.
create or replace function public.check_login_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and nullif(old.email, '') is not null
     and new.email is distinct from old.email then
    raise exception 'A saved username can''t be changed.';
  end if;

  if (tg_op = 'INSERT' or new.email is distinct from old.email)
     and nullif(new.email, '') is not null
     and new.email !~ '^[a-z0-9_]{3,20}@icepik\.invalid$' then
    raise exception 'Usernames are 3 to 20 lowercase letters, numbers or underscores.';
  end if;

  if (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and nullif(new.phone, '') is not null then
    raise exception 'ICEPik accounts have no phone number.';
  end if;

  return new;
end;
$$;

-- Created only if missing, so this file can run again without dropping
-- anything on auth.users (Supabase's Auth role owns that table).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'before_auth_user_saved' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger before_auth_user_saved
      before insert or update of email, phone on auth.users
      for each row execute function public.check_login_id();
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Supabase Auth email hook: ICEPik never sends email
-- ---------------------------------------------------------------------

-- Login IDs end in .invalid, so no email can ever arrive. Supabase's own
-- "forgot password" and magic-link endpoints would still store a 6-digit code
-- for a known username if an email provider accepted the message, leaving a
-- code that nobody receives but someone could guess. Refusing every email
-- that carries a code stops Supabase from storing one. Notification-only
-- emails are dropped quietly so they can't block a password change.
-- Turn it on: Authentication -> Hooks -> Send Email -> Postgres -> block_auth_emails.
create or replace function public.block_auth_emails(event jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when event -> 'email_data' ->> 'email_action_type' like '%\_notification' then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'ICEPik does not send email.'))
  end;
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.block_auth_emails(jsonb) to supabase_auth_admin;
revoke execute on function public.block_auth_emails(jsonb) from authenticated, anon, public;


-- ---------------------------------------------------------------------
-- Forgot password: recovery keys
-- ---------------------------------------------------------------------

-- One recovery key per saved account. Nobody reads or writes this table
-- through the API; only the functions below touch it. Row level security
-- with no policies blocks every row, and the browser roles also lose their
-- table grants, so a policy added by mistake later still exposes nothing.
create table if not exists public.recovery_keys (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  key_hash bytea not null
);

alter table public.recovery_keys enable row level security;
revoke all on public.recovery_keys from anon, authenticated;

-- Server only (secret key): give an account a new recovery key and return it
-- once. Any older key stops working. 128 random bits, shown as 8 groups of 4
-- hex characters; at 128 bits a plain SHA-256 hash is enough to store it.
create or replace function public.replace_recovery_key(p_user_id uuid)
returns text
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  raw_key text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  insert into public.recovery_keys (user_id, key_hash)
  values (p_user_id, extensions.digest(raw_key, 'sha256'))
  on conflict (user_id) do update set key_hash = excluded.key_hash;

  return rtrim(regexp_replace(raw_key, '(.{4})', '\1-', 'g'), '-');
end;
$$;

-- The signed-in user's first key (right after saving the account), or a new
-- one from Settings when they think someone saw theirs. Works only within
-- 10 minutes of signing in with the password, so someone holding an unlocked
-- phone can't make a key (and then reset the password) without knowing it.
-- The app signs in with the password first, then calls it:
--   await supabase.auth.signInWithPassword({ email: loginId, password, options: { captchaToken } })
--   const { data: key } = await supabase.rpc('create_recovery_key')
create or replace function public.create_recovery_key()
returns text
language plpgsql
volatile
security definer set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) then
    raise exception 'Save your account with a username and password first.';
  end if;

  if not public.signed_in_with_password_recently() then
    raise exception 'Enter your password again to make a recovery key.';
  end if;

  return public.replace_recovery_key(auth.uid());
end;
$$;

-- Whether the signed-in user has a recovery key. Ask a saved account with
-- none to make one (for example when saving was interrupted).
--   const { data: hasKey } = await supabase.rpc('has_recovery_key')
create or replace function public.has_recovery_key()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.recovery_keys where user_id = auth.uid());
$$;

-- Server only (secret key): the account id when the username and recovery key
-- match, otherwise null. Unknown usernames and wrong keys look the same.
-- Dashes, spaces and letter case in the typed key don't matter.
create or replace function public.check_recovery_key(p_username text, p_key text)
returns uuid
language sql
stable
security definer set search_path = ''
as $$
  select k.user_id
  from public.recovery_keys k
  join auth.users u on u.id = k.user_id
  where u.email = lower(btrim(p_username)) || '@icepik.invalid'
    and k.key_hash = extensions.digest(regexp_replace(lower(p_key), '[^0-9a-f]', '', 'g'), 'sha256');
$$;

revoke execute on function public.create_recovery_key() from public, anon;
grant execute on function public.create_recovery_key() to authenticated;
revoke execute on function public.has_recovery_key() from public, anon;
grant execute on function public.has_recovery_key() to authenticated;
revoke execute on function public.replace_recovery_key(uuid) from public, anon, authenticated;
revoke execute on function public.check_recovery_key(text, text) from public, anon, authenticated;
grant execute on function public.replace_recovery_key(uuid) to service_role;
grant execute on function public.check_recovery_key(text, text) to service_role;


-- ---------------------------------------------------------------------
-- Deleting a saved account now needs a password sign-in in the last 10 minutes
-- ---------------------------------------------------------------------

-- Permanently delete the signed-in user's account (Settings page).
-- Removes their profile and every private link to sightings they posted or
-- voted on; the sightings themselves stay on the map.
-- Users must be able to delete their account themselves from Settings.
-- A saved account must have signed in with its password in the last 10
-- minutes, so someone holding an unlocked phone can't delete it. An anonymous
-- account has no password and can always delete itself.
--   saved accounts first: await supabase.auth.signInWithPassword({ email: loginId, password, options: { captchaToken } })
--   await supabase.rpc('delete_my_account'); await supabase.auth.signOut({ scope: 'local' })
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete your account.';
  end if;

  if exists (select 1 from auth.users u
             where u.id = auth.uid() and nullif(u.email, '') is not null)
     and not public.signed_in_with_password_recently() then
    raise exception 'Enter your password again to delete your account.';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
