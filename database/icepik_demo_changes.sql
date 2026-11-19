-- =====================================================================
-- ICEPik demo: looser verification rules, for the demo at /demo only
--
-- Run this ONLY in a separate Supabase project made for the demo, never in
-- the real one. The first statement below stops the file unless you have
-- removed the "-- " in front of the line that says this is the demo project.
--
-- Order, in the demo project:
--   1. SQL Editor -> New query: run database/icepik_schema.sql.
--   2. New query: paste this file, remove the "-- " in front of the
--      set_config line just below this header, and run it. It is safe to
--      run again. A demo project made from an earlier schema: run
--      database/migrations/20261116_recovery_keys.sql first, then this file.
--   3. Turn on every dashboard setting listed at the top of
--      icepik_schema.sql, the same as the real project, CAPTCHA last:
--      CAPTCHA is required, with provider Turnstile and the same widget's
--      secret key as the real project (the app uses one site key for both).
--   4. In Vercel, set NEXT_PUBLIC_DEMO_SUPABASE_URL and
--      NEXT_PUBLIC_DEMO_SUPABASE_PUBLISHABLE_KEY (or
--      NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY) to the demo project's, and redeploy.
--   5. Before each demo, paste the sample sightings at the end of this file
--      (they expire after 4 hours, like any sighting). A free Supabase
--      project pauses after about a week without use: restore it first.
--
-- What changes, compared with the real map:
--   1. Confirming or disputing works from anywhere. vote_on_sighting() keeps
--      its my_lat and my_lng arguments, so the app calls it the same way,
--      but ignores them: no 1 km check, and the location is never stored.
--      The demo's vote buttons don't wait for a location.
--   2. A sighting is Verified after 1 confirmation, as long as it has more
--      confirmations than disputes (real map: at least 2, and at least twice
--      the disputes). Disputed mirrors it: 1 dispute, more disputes than
--      confirmations.
-- Everything else stays as in the real map: one vote per person per
-- sighting, no voting on your own sighting, 5 posts an hour, sightings
-- expire after 4 hours, and the hourly cleanup of who posted and voted.
-- =====================================================================


-- This is the demo project: remove the "-- " at the start of the next line.
-- select set_config('icepik.this_is_the_demo_project', 'yes', false);

do $$
begin
  if coalesce(current_setting('icepik.this_is_the_demo_project', true), '') <> 'yes' then
    raise exception 'Stopped before changing anything: this file is only for the demo''s own Supabase project. In that project, remove the "-- " in front of the set_config line near the top and run it again.';
  end if;
end $$;


-- 1. Verified sooner. The status is a generated column, so it is dropped
--    and added again with the new rule (existing rows are recomputed).
alter table public.sightings drop column verification_status;

alter table public.sightings add column verification_status text generated always as (
  case
    when confirm_count >= 1 and confirm_count > dispute_count then 'verified'
    when dispute_count >= 1 and dispute_count > confirm_count then 'disputed'
    else 'unverified'
  end
) stored;


-- 2. Vote from anywhere. Same function as in icepik_schema.sql, without the
--    location and 1 km checks. my_lat and my_lng are kept so the app calls
--    it the same way; they are ignored and never stored.
create or replace function public.vote_on_sighting(
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

  insert into public.sighting_votes (sighting_id, voter_id, vote)
  values (target_sighting_id, auth.uid(), my_vote)
  on conflict (sighting_id, voter_id) do update set vote = excluded.vote;

  select * into target from public.sightings where id = target_sighting_id;
  return target;
end;
$$;

revoke execute on function public.vote_on_sighting(uuid, public.vote_type, double precision, double precision) from public, anon;
grant execute on function public.vote_on_sighting(uuid, public.vote_type, double precision, double precision) to authenticated;


-- Sample sightings for the demo, around Philadelphia City Hall. Paste these
-- lines into a new query in the demo project and remove the "-- " at the
-- start of each, within 4 hours before a demo: sightings expire after 4
-- hours like any other. The delete first removes samples from an earlier
-- run, so they never show twice. Inserts from the SQL editor skip the
-- posting limit (see prepare_new_sighting() in icepik_schema.sql).
-- delete from public.sightings where description = 'Demo sighting';
-- insert into public.sightings (lat, lng, location_label, category, agent_count, vehicle_count, description)
-- values
--   (39.953, -75.165, 'Market St & 15th St', 'patrol', 2, 1, 'Demo sighting'),
--   (39.962, -75.158, 'Spring Garden St', 'vehicle', null, 2, 'Demo sighting'),
--   (39.943, -75.157, 'S 9th St & South St', 'checkpoint', 4, 2, 'Demo sighting'),
--   (39.967, -75.172, 'Fairmount Ave', 'patrol', 1, 1, 'Demo sighting');
