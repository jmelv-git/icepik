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
--      run again (it also resets the demo, as in step 5). A demo project made from an earlier schema: run
--      database/migrations/20261116_recovery_keys.sql first, then this file.
--   3. Turn on every dashboard setting listed at the top of
--      icepik_schema.sql, the same as the real project, CAPTCHA last:
--      CAPTCHA is required, with provider Turnstile and the same widget's
--      secret key as the real project (the app uses one site key for both).
--   4. In Vercel, set NEXT_PUBLIC_DEMO_SUPABASE_URL and
--      NEXT_PUBLIC_DEMO_SUPABASE_PUBLISHABLE_KEY (or
--      NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY) to the demo project's, and redeploy.
--   5. Before presenting, run  select public.reset_demo();  in the SQL
--      Editor: it puts the sample sightings back (one Verified, two
--      Unverified, one Disputed) and clears everyone else's pins and votes.
--      It also runs every night. A free Supabase project pauses after about
--      a week without use: restore it first.
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
--   3. Sample sightings, one for each status, put back by public.reset_demo()
--      before each demo and every night.
-- Everything else stays as in the real map: one vote per person per
-- sighting, no voting on your own sighting, 5 posts an hour, posted
-- sightings expire after 4 hours (the samples last 25), and the hourly
-- cleanup of who posted and voted.
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


-- 3. Sample sightings, one for each status, and a reset. public.reset_demo()
--    deletes every sighting in the demo (and with them every vote and who
--    posted what) and adds the samples again, fresh: posted minutes ago and
--    on the map for 25 hours. Run it in the SQL Editor before presenting:
--      select public.reset_demo();
--    It also runs every night at 08:00 UTC (3 or 4 a.m. in Philadelphia),
--    so visitors' votes and pins never pile up. The samples' counts are
--    set directly; once someone votes on a sample, the real votes replace
--    them (a dispute on the Verified sample makes it Disputed).
--    Inserts from the SQL editor or pg_cron have no signed-in user, so they
--    skip the posting limit and keep their counts and times (see
--    prepare_new_sighting() in icepik_schema.sql). The app opens /demo on
--    this area (DEMO_AREA in app/_components/demo-context.tsx).
create or replace function public.reset_demo()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.sightings where true;

  insert into public.sightings
    (lat, lng, location_label, category, agent_count, vehicle_count, description,
     confirm_count, dispute_count, created_at, expires_at)
  values
    (39.953, -75.165, 'Market St & 15th St', 'patrol', 2, 1,
     'Sample report: one person confirmed it, so it shows as Verified.',
     1, 0, now() - interval '25 minutes', now() + interval '25 hours'),
    (39.962, -75.158, 'Spring Garden St', 'vehicle', null, 2,
     'Sample report with no votes yet. Confirm or dispute it to see its status change.',
     0, 0, now() - interval '12 minutes', now() + interval '25 hours'),
    (39.943, -75.157, 'S 9th St & South St', 'checkpoint', 4, 2,
     'Sample report: one person disputed it, so it shows as Disputed.',
     0, 1, now() - interval '40 minutes', now() + interval '25 hours'),
    (39.967, -75.172, 'Fairmount Ave', 'patrol', 1, 1,
     'Sample report with no votes yet. Confirm or dispute it to see its status change.',
     0, 0, now() - interval '5 minutes', now() + interval '25 hours');
end;
$$;

-- Only the SQL Editor and pg_cron run it, never the app.
revoke execute on function public.reset_demo() from public, anon, authenticated;

select cron.schedule('reset-demo', '0 8 * * *', 'select public.reset_demo()');

-- Start the demo with the samples.
select public.reset_demo();
