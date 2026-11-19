-- =====================================================================
-- ICEPik demo: looser verification rules, for the demo at /demo only
--
-- Run this ONLY in a separate Supabase project made for the demo, never in
-- the real one. Order: first database/icepik_schema.sql, then this file
-- (Supabase Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Then set the demo project's URL and key in Vercel as
-- NEXT_PUBLIC_DEMO_SUPABASE_URL and NEXT_PUBLIC_DEMO_SUPABASE_PUBLISHABLE_KEY
-- (or NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY), and redeploy. The dashboard
-- settings at the top of icepik_schema.sql apply to the demo project too
-- (anonymous sign-ins ON, "Confirm email" OFF, CAPTCHA recommended).
--
-- What changes, compared with the real map:
--   1. Confirming or disputing works from anywhere. vote_on_sighting() no
--      longer checks that the voter is within 1 km, and takes no location
--      (the demo app sends none).
--   2. A sighting is Verified after 1 confirmation, as long as it has more
--      confirmations than disputes (real map: at least 2, and at least twice
--      the disputes). Disputed mirrors it: 1 dispute, more disputes than
--      confirmations.
-- Everything else stays as in the real map: one vote per person per
-- sighting, no voting on your own sighting, 5 posts an hour, sightings
-- expire after 4 hours, and the hourly cleanup of who posted and voted.
-- =====================================================================


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


-- Optional: sample sightings for the demo, around Philadelphia City Hall.
-- Inserts from the SQL editor skip the posting limit (see
-- prepare_new_sighting() in icepik_schema.sql). They expire after 4 hours
-- like any sighting; run this block again before a demo.
-- insert into public.sightings (lat, lng, location_label, category, agent_count, vehicle_count, description)
-- values
--   (39.953, -75.165, 'Market St & 15th St', 'patrol', 2, 1, 'Demo sighting'),
--   (39.958, -75.158, 'Spring Garden St', 'vehicle', null, 2, 'Demo sighting'),
--   (39.945, -75.155, 'S 9th St', 'checkpoint', 4, 2, 'Demo sighting'),
--   (39.962, -75.172, 'Fairmount Ave', 'patrol', 1, 1, 'Demo sighting');
