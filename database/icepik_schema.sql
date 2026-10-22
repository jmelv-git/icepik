-- =====================================================================
-- ICEPik: MVP database schema for Supabase
--
-- How to run: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Run it once on a fresh project.
--
-- Dashboard settings this schema expects (Authentication section):
--   1. Sign In / Providers -> "Allow anonymous sign-ins": ON
--      The app calls supabase.auth.signInAnonymously() on first launch, so
--      people can post and verify right away without giving any personal info.
--   2. Sign In / Providers -> Email -> "Confirm email": OFF
--      Lets an anonymous user save their account with a username + password
--      (no real email inbox needed). See "Saving an account" below.
--   3. Attack Protection -> CAPTCHA: ON (strongly recommended)
--      Without it, one person can create many throwaway accounts to fake
--      confirmations or get around the posting limit.
--   4. Audit Logs -> "Write audit logs to the database": OFF
--      Otherwise every sign-in's IP address is copied into auth.audit_log_entries.
--
-- Saving an account (optional for users):
--   Supabase signs people in by email, so the app turns a username into a
--   login ID ending in the reserved domain ".invalid", which can never receive
--   mail. That way nobody can be emailed a password reset for someone else.
--     save: supabase.auth.updateUser({ email: `${username}@icepik.invalid`, password })
--     log in on a new phone: supabase.auth.signInWithPassword({ email: `${username}@icepik.invalid`, password })
--   The user keeps the same id, so their posts and votes carry over.
--   Passwords are stored (hashed) by Supabase Auth, never in these tables.
--   There is no password reset: a forgotten password means a new account.
--
-- Tables
--   profiles            one row per app user, no personal info
--   sightings           public ICE sighting pins shown on the map
--   sighting_votes      confirm / dispute votes that drive the verification factor
--   sighting_reporters  private link between a sighting and the user who posted it
--
-- Privacy model (PRD Part 5):
--   * Nothing anyone else can read links a person to a place. Active
--     sightings are public (expired ones can't be read through the app's
--     API); who posted or voted on one is visible only to that same user.
--   * Those private links are deleted within an hour after a sighting
--     expires, so even someone with full database access (a breach, a legal
--     demand) can't rebuild who reported what in the past.
--   * Pin locations are rounded to about 100 m. Voter locations and saved
--     places (home, work) are used for distance checks and never stored.
--   * Supabase's request logs record each request's IP address and full URL
--     (not its body). So nothing that identifies a pin or a person goes in a
--     URL: deleting a post and changing settings go through rpc() calls,
--     which send their arguments in the request body.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------

create type public.sighting_category as enum ('patrol', 'vehicle', 'checkpoint', 'raid', 'other');

create type public.vote_type as enum ('confirm', 'dispute');


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One profile per Supabase auth user (anonymous or saved).
-- Deliberately holds no name, email, phone or location. The two totals
-- survive the hourly cleanup so you can still measure repeat contributors.
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  preferred_language text not null default 'en'
                       check (char_length(preferred_language) between 2 and 10),
  sightings_posted   integer not null default 0,
  votes_cast         integer not null default 0,
  -- Posting limit: the clock hour of the user's latest post and how many
  -- posts they made in it. Cleared by the hourly cleanup.
  post_limit_hour    timestamptz,
  post_limit_count   smallint not null default 0,
  created_at         timestamptz not null default now()
);

-- A reported ICE sighting. Everything here is safe to show publicly.
-- category + agent_count + vehicle_count are the at-a-glance summary;
-- description is optional extra detail.
-- Sightings expire after 4 hours; each new confirmation keeps a sighting
-- on the map for at least 2 more hours.
create table public.sightings (
  id                  uuid primary key default gen_random_uuid(),
  lat                 double precision not null check (lat between -90 and 90),   -- rounded to ~100 m on save
  lng                 double precision not null check (lng between -180 and 180),
  location_label      text check (char_length(location_label) <= 120),  -- e.g. 'Broad St & Girard Ave', no house number
  category            public.sighting_category not null default 'other',
  agent_count         smallint check (agent_count between 0 and 99),     -- null = not sure
  vehicle_count       smallint check (vehicle_count between 0 and 99),   -- null = not sure
  description         text check (char_length(description) <= 280),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '4 hours',

  -- Kept up to date by a trigger on sighting_votes; clients can't write these.
  -- They freeze when the sighting expires.
  confirm_count       integer not null default 0,
  dispute_count       integer not null default 0,

  -- Verification factor: 0.00 to 1.00, starts at 0.50 with no votes.
  verification_score  numeric(3, 2) generated always as (
                        round((confirm_count + 1)::numeric / (confirm_count + dispute_count + 2), 2)
                      ) stored,
  verification_status text generated always as (
                        case
                          when confirm_count >= 2 and confirm_count >= 2 * dispute_count then 'verified'
                          when dispute_count >= 2 and dispute_count > confirm_count then 'disputed'
                          else 'unverified'
                        end
                      ) stored
);

create index sightings_expires_at_idx on public.sightings (expires_at);

-- Who posted each sighting. Kept out of the sightings table so the public
-- map feed and Realtime stream never carry a user id. Only the reporter can
-- read their own rows; rows are written by a trigger, never by the app.
create table public.sighting_reporters (
  sighting_id uuid primary key references public.sightings (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade
);

create index sighting_reporters_reporter_idx on public.sighting_reporters (reporter_id);

-- One vote per user per sighting. Written only through vote_on_sighting(),
-- which checks the voter is nearby.
create table public.sighting_votes (
  sighting_id uuid not null references public.sightings (id) on delete cascade,
  voter_id    uuid not null references public.profiles (id) on delete cascade,
  vote        public.vote_type not null,
  created_at  timestamptz not null default now(),
  primary key (sighting_id, voter_id)
);

create index sighting_votes_voter_idx on public.sighting_votes (voter_id);


-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Distance in meters between two points (haversine formula).
create function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1.0, sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
           + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
         )));
$$;


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Create a profile whenever someone signs up (including anonymous sign-ins).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Give any users that already exist a profile too.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Before a new sighting is saved: round the location to about 100 m, then
-- rate-limit the reporter and set the server-controlled fields so the app
-- can't backdate, extend or pre-verify a sighting. Inserts from the SQL
-- editor (no signed-in user) skip the second part, so you can seed test pins.
create function public.prepare_new_sighting()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  posts_this_hour smallint;
begin
  -- 3 decimal places = about 111 m north-south, 85 m east-west in Philadelphia
  new.lat := round(new.lat::numeric, 3);
  new.lng := round(new.lng::numeric, 3);

  -- A full street address would undo the rounding, so drop a leading house
  -- number: '1234 N Broad St' -> 'N Broad St'. Labels like '5th St & Market St'
  -- and '1200 block of N Broad St' are left alone. The app should still
  -- build the label from the rounded point, using street names only.
  new.location_label := nullif(btrim(regexp_replace(
    new.location_label, '^\s*\d+(-\d+)?[a-z]?\s+(?!block\y)', '', 'i')), '');

  if auth.uid() is null then
    return new;
  end if;

  -- Posts are counted per clock hour on the profile, so deleting a post
  -- doesn't free up room for another one.
  update public.profiles p
  set post_limit_count = case when p.post_limit_hour = date_trunc('hour', now())
                              then p.post_limit_count + 1 else 1 end,
      post_limit_hour  = date_trunc('hour', now()),
      sightings_posted = p.sightings_posted + 1
  where p.id = auth.uid()
  returning p.post_limit_count into posts_this_hour;

  if posts_this_hour > 5 then
    raise exception 'You can post up to 5 sightings an hour. Try again later.';
  end if;

  new.created_at    := now();
  new.expires_at    := now() + interval '4 hours';
  new.confirm_count := 0;
  new.dispute_count := 0;
  return new;
end;
$$;

create trigger before_sighting_insert
  before insert on public.sightings
  for each row execute function public.prepare_new_sighting();

-- After a sighting is saved, privately record who posted it.
create function public.record_sighting_reporter()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.sighting_reporters (sighting_id, reporter_id)
    values (new.id, auth.uid());
  end if;
  return null;
end;
$$;

create trigger after_sighting_insert
  after insert on public.sightings
  for each row execute function public.record_sighting_reporter();

-- Recount confirm/dispute totals whenever a vote is added, changed or removed.
-- Counts only change while the sighting is active, so the hourly cleanup
-- can delete old votes without erasing the final verification result.
-- Each person's first confirmation also keeps the sighting on the map for at
-- least 2 more hours; switching a vote back and forth doesn't.
create function public.refresh_sighting_votes()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  target_id uuid;
begin
  for target_id in
    select distinct x
    from unnest(array[old.sighting_id, new.sighting_id]) as x
    where x is not null
  loop
    -- Lock the sighting first. When two people vote at the same moment,
    -- the second recount waits here and then counts both votes.
    perform 1 from public.sightings
    where id = target_id and expires_at > now()
    for update;

    update public.sightings s
    set confirm_count = (select count(*) from public.sighting_votes v
                         where v.sighting_id = target_id and v.vote = 'confirm'),
        dispute_count = (select count(*) from public.sighting_votes v
                         where v.sighting_id = target_id and v.vote = 'dispute')
    where s.id = target_id
      and s.expires_at > now();
  end loop;

  if tg_op = 'INSERT' then
    if new.vote = 'confirm' then
      update public.sightings s
      set expires_at = greatest(s.expires_at, now() + interval '2 hours')
      where s.id = new.sighting_id
        and s.expires_at > now();
    end if;

    update public.profiles
    set votes_cast = votes_cast + 1
    where id = new.voter_id;
  end if;

  return null;
end;
$$;

create trigger after_vote_change
  after insert or update or delete on public.sighting_votes
  for each row execute function public.refresh_sighting_votes();


-- ---------------------------------------------------------------------
-- Functions the app calls with supabase.rpc(...)
-- ---------------------------------------------------------------------

-- Active sightings within radius_m meters of a point, nearest first.
-- Use it for "Is ICE near my home / work?" and for a dropped map pin.
-- The point you pass in is used for the calculation and never stored.
--   supabase.rpc('sightings_near', { pin_lat: 39.9526, pin_lng: -75.1652, radius_m: 1600 })
create function public.sightings_near(
  pin_lat  double precision,
  pin_lng  double precision,
  radius_m double precision default 1609  -- 1 mile
)
returns table (
  id                  uuid,
  lat                 double precision,
  lng                 double precision,
  location_label      text,
  category            public.sighting_category,
  agent_count         smallint,
  vehicle_count       smallint,
  description         text,
  created_at          timestamptz,
  expires_at          timestamptz,
  confirm_count       integer,
  dispute_count       integer,
  verification_score  numeric,
  verification_status text,
  distance_m          double precision
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.lat, s.lng, s.location_label, s.category, s.agent_count, s.vehicle_count,
         s.description, s.created_at, s.expires_at, s.confirm_count, s.dispute_count,
         s.verification_score, s.verification_status, d.distance_m
  from public.sightings s
  cross join lateral (
    select public.distance_m(pin_lat, pin_lng, s.lat, s.lng) as distance_m
  ) d
  where s.expires_at > now()
    and d.distance_m <= radius_m
  order by d.distance_m;
$$;

-- Confirm or dispute a sighting. Calling it again changes your vote.
-- The voter must be within 1 km of the pin (PRD: verified by "users near
-- the area"). Their location is checked and never stored.
-- Returns the updated sighting so the app can redraw the pin.
--   supabase.rpc('vote_on_sighting', { target_sighting_id, my_vote: 'confirm', my_lat, my_lng })
create function public.vote_on_sighting(
  target_sighting_id uuid,
  my_vote            public.vote_type,
  my_lat             double precision,
  my_lng             double precision
)
returns public.sightings
language plpgsql
security definer set search_path = ''
as $$
declare
  target public.sightings;
begin
  if auth.uid() is null then
    raise exception 'Sign in to confirm or dispute a sighting.';
  end if;

  if my_lat is null or my_lng is null then
    raise exception 'Turn on location to confirm or dispute a sighting.';
  end if;

  select * into target from public.sightings where id = target_sighting_id;

  if not found then
    raise exception 'This sighting no longer exists.';
  end if;

  if target.expires_at <= now() then
    raise exception 'This sighting has expired.';
  end if;

  if exists (
    select 1 from public.sighting_reporters r
    where r.sighting_id = target_sighting_id and r.reporter_id = auth.uid()
  ) then
    raise exception 'You can''t confirm or dispute your own sighting.';
  end if;

  if public.distance_m(my_lat, my_lng, target.lat, target.lng) > 1000 then
    raise exception 'You need to be within 1 km of a sighting to confirm or dispute it.';
  end if;

  insert into public.sighting_votes (sighting_id, voter_id, vote)
  values (target_sighting_id, auth.uid(), my_vote)
  on conflict (sighting_id, voter_id) do update set vote = excluded.vote;

  select * into target from public.sightings where id = target_sighting_id;
  return target;
end;
$$;

revoke execute on function public.vote_on_sighting(uuid, public.vote_type, double precision, double precision) from public, anon;
grant execute on function public.vote_on_sighting(uuid, public.vote_type, double precision, double precision) to authenticated;

-- Permanently delete the signed-in user's account (Settings page).
-- Removes their profile and every private link to sightings they posted or
-- voted on; the sightings themselves stay on the map.
-- App stores require in-app account deletion once accounts can be saved.
--   await supabase.rpc('delete_my_account'); await supabase.auth.signOut()
create function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete your account.';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Delete an active sighting you posted. The pin's id travels in the request
-- body, not in a URL that Supabase logs next to your IP address.
--   supabase.rpc('delete_my_sighting', { target_sighting_id })
create function public.delete_my_sighting(target_sighting_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete a sighting.';
  end if;

  delete from public.sightings s
  using public.sighting_reporters r
  where s.id = target_sighting_id
    and r.sighting_id = s.id
    and r.reporter_id = auth.uid()
    and s.expires_at > now();

  if not found then
    raise exception 'You can only delete active sightings you posted.';
  end if;
end;
$$;

revoke execute on function public.delete_my_sighting(uuid) from public, anon;
grant execute on function public.delete_my_sighting(uuid) to authenticated;

-- Change the signed-in user's language (Settings page), keeping their id
-- out of the logged URL.
--   supabase.rpc('set_my_language', { new_language: 'es' })
create function public.set_my_language(new_language text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.profiles
  set preferred_language = new_language
  where id = auth.uid();
$$;

revoke execute on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;


-- ---------------------------------------------------------------------
-- Hourly cleanup: forget who posted and voted on expired sightings
-- ---------------------------------------------------------------------

-- Expired sightings keep their location, details and final counts (that's
-- what the accuracy metric uses); only the person-to-sighting links go,
-- along with posting-limit hours that have already ended.
create function public.purge_expired_links()
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.sighting_votes v
  using public.sightings s
  where s.id = v.sighting_id and s.expires_at <= now();

  delete from public.sighting_reporters r
  using public.sightings s
  where s.id = r.sighting_id and s.expires_at <= now();

  update public.profiles
  set post_limit_hour = null, post_limit_count = 0
  where post_limit_hour < date_trunc('hour', now());
$$;

revoke execute on function public.purge_expired_links() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule('purge-expired-links', '0 * * * *', 'select public.purge_expired_links()');


-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.sightings          enable row level security;
alter table public.sighting_reporters enable row level security;
alter table public.sighting_votes     enable row level security;

-- profiles: you can read your own. The language changes only through
-- set_my_language(), so there is no update policy.
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

revoke update on public.profiles from anon, authenticated;

-- sightings: anyone can read active ones; signed-in users can post.
-- Reporters delete their own through delete_my_sighting(), so there is no
-- delete policy. Nobody edits a sighting after posting it.
-- Expired sightings stay in the table for your metrics but can't be read
-- through the API, so old pins and descriptions don't pile up in public.
create policy "Anyone can read active sightings"
  on public.sightings for select to anon, authenticated
  using (expires_at > now());

create policy "Signed-in users can post sightings"
  on public.sightings for insert to authenticated
  with check ((select auth.uid()) is not null);

-- sighting_reporters: you can see which active sightings you posted.
-- No one else can, and only the trigger above writes here.
create policy "Users can see the sightings they posted"
  on public.sighting_reporters for select to authenticated
  using ((select auth.uid()) = reporter_id);

-- sighting_votes: you can see your own votes. Casting or changing a vote
-- goes through vote_on_sighting(); votes are removed only by the cleanup
-- or account deletion, so there is no insert, update or delete policy.
create policy "Users can see their own votes"
  on public.sighting_votes for select to authenticated
  using ((select auth.uid()) = voter_id);


-- ---------------------------------------------------------------------
-- Realtime: push new sightings and changing vote counts to every open map
-- Pins expire without sending an event, so the app should also remove any
-- pin whose expires_at has passed.
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.sightings;


-- =====================================================================
-- Success metric queries (PRD Part 1). Run these separately in the SQL
-- editor when you want to check progress; they aren't part of the setup.
-- =====================================================================

-- Users who have posted or voted more than once in total (goal: 20+)
-- select count(*) as repeat_contributors
-- from public.profiles
-- where sightings_posted + votes_cast > 1;

-- Accuracy rate: share of community-decided sightings that were confirmed (goal: 80%+)
-- select round(100.0 * count(*) filter (where verification_status = 'verified')
--              / nullif(count(*) filter (where verification_status <> 'unverified'), 0), 1)
--        as accuracy_pct
-- from public.sightings;


-- =====================================================================
-- Starting over: if you already ran an earlier version of this script,
-- run these three lines first (this deletes all ICEPik data), then run
-- the script again.
-- =====================================================================

-- drop table if exists public.sighting_votes, public.sighting_reporters, public.sightings, public.profiles cascade;
-- drop function if exists public.handle_new_user, public.prepare_new_sighting, public.record_sighting_reporter, public.refresh_sighting_votes, public.sightings_near, public.distance_m, public.vote_on_sighting, public.delete_my_account, public.delete_my_sighting, public.set_my_language, public.purge_expired_links, public.can_vote_on cascade;
-- drop type if exists public.sighting_category, public.vote_type cascade;
