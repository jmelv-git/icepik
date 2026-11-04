# ICEPik Database Handoff

Oct 20, 2026 · @Juan

## Overview

The ICEPik backend is ready for the MVP: a Supabase Postgres database with four tables, five database functions and a live feed of map pins. Browsers read it with supabase-js and the publishable key; posting, voting and deleting go through Next.js server actions. The server enforces every rule, so the app can't break them by accident.

**The one rule everything follows:** nothing another user can read may connect a person to a place. Pins are public. Who posted or voted on a pin is private to that person, and those records are deleted within an hour after the pin expires. The section "What we need from you" lists how the app keeps this rule too.

- Handoff package: `icepik-handoff.zip` holds every file below, a PDF of this doc and a README.
- Schema: `icepik_schema.sql`, run once in Supabase's SQL Editor.
- Server code: `lib/supabase/server.ts` and `app/actions/sightings.ts`, also printed under "How to call it".
- Diagram, access rules and copyable SQL: [ICEPik Database Map](https://claude.ai/artifact/8dMTG4gPJUmLJvZ2vKpZaS), or `icepik-database-map.html` in the package.

## Before you start

Confirm these four Supabase settings with the backend owner, then set up the client. The app uses only the project URL and the publishable (anon) key, never the secret service\_role key.

| Setting (Authentication section) | Value | Why |
| --- | --- | --- |
| Sign In / Providers → Allow anonymous sign-ins | On | Accounts are created silently on first launch |
| Sign In / Providers → Email → Confirm email | Off | Lets users save a username and password without an inbox |
| Attack Protection → CAPTCHA | On (recommended) | Blocks throwaway accounts used to fake confirmations; the app then sends a `captchaToken` when signing in |
| Audit Logs → Write audit logs to the database | Off | Otherwise every sign-in's IP address is also copied into the database |

**Client.** Set up supabase-js with `@supabase/ssr`, the way Supabase's [Next.js guide](https://supabase.com/docs/guides/auth/server-side/nextjs) does: `createBrowserClient` in client components, and `createServerClient` with cookies in server code and middleware. The saved session *is* the anonymous account: if its cookie isn't kept, the user loses their account and their posts.

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
```

**Types.** Generate TypeScript types once the schema is in place, and again after any schema change.

```bash
npx supabase gen types typescript --project-id <project-ref> > database.types.ts
```

**Test pins.** Seed pins from the SQL Editor. They have no reporter, so anyone can vote on them, and they expire after 4 hours like real pins. Delete them before measuring the success metrics.

```sql
insert into public.sightings (lat, lng, category, agent_count, vehicle_count, location_label, description)
values (39.970, -75.160, 'vehicle', 2, 1, 'Broad St & Girard Ave', 'TEST'),
       (39.953, -75.165, 'checkpoint', 4, 2, 'Broad St & Market St', 'TEST');

-- when you're done testing
delete from public.sightings where description = 'TEST';
```

## Data model

The app works with four tables. Only `sightings` is public, and only while a pin is active; the other three return just the signed-in user's own rows.

![How the app reaches the database: 1 public table, 3 private](images/how-the-app-reaches-the-database.png)

Browsers only read pins and receive live updates. Posting, voting and deleting run as server actions on Vercel, so Supabase never sees users' IP addresses for them. The three private tables return only the signed-in user's own rows.

### sightings (public)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `lat`, `lng` | number | Rounded to 3 decimals (about 100 m) when saved |
| `location_label` | text, up to 120 characters, optional | Street names only; a leading house number is removed |
| `category` | `patrol`, `vehicle`, `checkpoint`, `raid` or `other` | Defaults to `other` |
| `agent_count`, `vehicle_count` | whole number 0–99, optional | Empty means "not sure" |
| `description` | text, up to 280 characters, optional | Public and not moderated |
| `created_at` | timestamp | Set by the server |
| `expires_at` | timestamp | Posting time + 4 hours; first confirmations extend it |
| `confirm_count`, `dispute_count` | whole number | Read only; kept current by the server |
| `verification_score` | number 0.00–1.00 | Read only; 0.50 before any votes |
| `verification_status` | `verified`, `disputed` or `unverified` | Read only |

The app reads active pins (signed in or not) and inserts new ones. It deletes its own active pins through `delete_my_sighting()`. Nobody can edit a pin after posting it.

### Private tables

| Table | Columns | What the app can do |
| --- | --- | --- |
| `sighting_votes` | `sighting_id`, `voter_id`, `vote` (`confirm` or `dispute`), `created_at` | Read your own votes. Cast or change a vote only through `vote_on_sighting()` |
| `sighting_reporters` | `sighting_id`, `reporter_id` | Read your own rows to list "my posts". The server writes them and deletes them after the pin expires |
| `profiles` | `id` (the user's id), `preferred_language`, `sightings_posted`, `votes_cast`, `post_limit_hour`, `post_limit_count`, `created_at` | Read your own profile. Change `preferred_language` only through `set_my_language()` |

### Server functions

| Call | Who | What it does |
| --- | --- | --- |
| `sightings_near(pin_lat, pin_lng, radius_m = 1609)` | Anyone | Active pins within `radius_m` meters, nearest first, each with `distance_m` |
| `vote_on_sighting(target_sighting_id, my_vote, my_lat, my_lng)` | Signed in | Confirms or disputes after checking the voter is within 1 km; returns the updated pin |
| `delete_my_sighting(target_sighting_id)` | Signed in | Deletes your own active pin |
| `set_my_language(new_language)` | Signed in | Changes your language setting |
| `delete_my_account()` | Signed in | Deletes the account and its private records; its pins stay on the map |

## How to call it

Reads and live updates use supabase-js in the browser. Posting, voting and deleting a pin go through Next.js server actions, so Supabase logs Vercel's IP for them instead of the user's. Errors come back as plain messages ready to show (see "Errors to handle").

### Server actions (copy these two files)

`lib/supabase/server.ts` is Supabase's official server client for Next.js. `app/actions/sightings.ts` holds the three actions. Both import the generated types from `database.types.ts` at the project root; change that path if yours differs. They pass a type-check against Next.js 16.4, `@supabase/ssr` 0.12 and `@supabase/supabase-js` 2.118, plus tests that call them with missing, wrong-type and oversized input. Run npm install server-only for the guard at the top of the first file.

```ts
// lib/supabase/server.ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/database.types'

/**
 * Supabase client for server code (server actions, route handlers).
 * Same as Supabase's official Next.js example, plus the generated types.
 *
 * Don't put this client in a global variable. Create a new one inside each
 * function that uses it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, which can't set cookies.
            // Safe to ignore while proxy.ts (middleware.ts before Next.js 16)
            // refreshes user sessions.
          }
        },
      },
    },
  )
}
```

```ts
// app/actions/sightings.ts
'use server'

// Posting, voting and deleting run here, on Vercel, instead of in the browser.
// Supabase then logs Vercel's IP address for these requests instead of the
// user's, so its logs can't tie a person's IP to a pin, a vote or a deletion.
//
// Rules for this file:
// - Anyone can call these actions directly with any input, not just through
//   our UI. TypeScript types aren't checked at runtime, so every argument is
//   checked here before it reaches the database.
// - Build each database row field by field. Never pass client input straight
//   into a query, or callers could set fields they shouldn't.
// - Never accept a user id from the caller. The database takes the user from
//   the session cookie.
// - Never console.log the input. Vercel keeps runtime logs, and the input holds
//   coordinates and pin ids.
// - Return errors as values. Next.js hides the message of a thrown error in
//   production, and the database's messages are already written for users.
//
// Usage from a client component:
//   const result = await voteOnSighting({ sightingId, vote: 'confirm', myLat, myLng })
//   if (!result.ok) showMessage(result.message)

import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/database.types'

type Sighting = Database['public']['Tables']['sightings']['Row']
type Category = Database['public']['Enums']['sighting_category']
type Vote = Database['public']['Enums']['vote_type']

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string }

export type NewSighting = {
  lat: number
  lng: number
  category: Category
  agentCount?: number | null
  vehicleCount?: number | null
  locationLabel?: string | null
  description?: string | null
}

const CATEGORIES: readonly Category[] = ['patrol', 'vehicle', 'checkpoint', 'raid', 'other']
const VOTES: readonly Vote[] = ['confirm', 'dispute']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRY_AGAIN = 'Something went wrong. Please try again.'

export async function postSighting(input: NewSighting): Promise<ActionResult<Sighting>> {
  const problem = checkNewSighting(input)
  if (problem) return { ok: false, message: problem }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sightings')
    .insert({
      lat: input.lat,
      lng: input.lng,
      category: input.category,
      agent_count: input.agentCount ?? null,
      vehicle_count: input.vehicleCount ?? null,
      location_label: input.locationLabel?.trim() || null,
      description: input.description?.trim() || null,
    })
    .select()
    .single()

  return error ? failure(error) : { ok: true, data }
}

export async function voteOnSighting(input: {
  sightingId: string
  vote: Vote
  myLat: number
  myLng: number
}): Promise<ActionResult<Sighting>> {
  if (!isRecord(input)) return { ok: false, message: TRY_AGAIN }
  if (!isInRange(input.myLat, -90, 90) || !isInRange(input.myLng, -180, 180)) {
    return { ok: false, message: 'Turn on location to confirm or dispute a sighting.' }
  }
  if (!UUID.test(String(input.sightingId)) || !VOTES.includes(input.vote)) {
    return { ok: false, message: TRY_AGAIN }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('vote_on_sighting', {
    target_sighting_id: input.sightingId,
    my_vote: input.vote,
    my_lat: input.myLat,
    my_lng: input.myLng,
  })

  return error ? failure(error) : { ok: true, data }
}

export async function deleteSighting(sightingId: string): Promise<ActionResult<null>> {
  if (!UUID.test(String(sightingId))) return { ok: false, message: TRY_AGAIN }

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_my_sighting', { target_sighting_id: sightingId })

  return error ? failure(error) : { ok: true, data: null }
}

// Server actions are public endpoints, so check the input even though the
// database enforces the same rules.
function checkNewSighting(input: unknown): string | null {
  if (!isRecord(input)) return TRY_AGAIN
  if (!isInRange(input.lat, -90, 90) || !isInRange(input.lng, -180, 180)) {
    return 'Pick a spot on the map first.'
  }
  if (!CATEGORIES.includes(input.category as Category)) return 'Choose what you saw.'
  if (!isCount(input.agentCount) || !isCount(input.vehicleCount)) {
    return 'Counts must be whole numbers from 0 to 99.'
  }
  if (!isOptionalText(input.locationLabel, 120)) return 'Keep the location under 120 characters.'
  if (!isOptionalText(input.description, 280)) return 'Keep the description under 280 characters.'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value == null || (typeof value === 'string' && value.length <= maxLength)
}

function isInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isCount(value: unknown): boolean {
  return value == null || (Number.isInteger(value) && isInRange(value, 0, 99))
}

function failure(error: PostgrestError): ActionResult<never> {
  // P0001 = a message from ICEPik's own database checks, written for users.
  if (error.code === 'P0001') return { ok: false, message: error.message }
  // 42501 = row-level security refused it, usually an expired session.
  if (error.code === '42501') {
    return { ok: false, message: 'Your session has expired. Reload the page and try again.' }
  }
  return { ok: false, message: TRY_AGAIN }
}
```

### Sign in on first launch

```ts
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  await supabase.auth.signInAnonymously({ options: { captchaToken } }) // captchaToken only if CAPTCHA is on
}
```

### Load the map

```ts
const { data: pins } = await supabase.from('sightings').select('*') // only active pins come back
```

### Keep the map live

```ts
supabase
  .channel('map')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sightings' }, (change) => {
    if (change.eventType === 'DELETE') removePin(change.old.id)
    else upsertPin(change.new) // INSERT or UPDATE: a new pin, new counts or a later expiry
  })
  .subscribe()
```

Pins expire without sending an event, so remove any pin whose `expires_at` has passed at least once a minute. Missed events aren't replayed: reload the pins when the app returns to the foreground or reconnects.

### Post a sighting

```ts
import { postSighting } from '@/app/actions/sightings'

const result = await postSighting({
  lat, lng, category: 'vehicle', agentCount: 3, vehicleCount: 2,
  locationLabel: 'Broad St & Girard Ave', description,
})
if (!result.ok) showMessage(result.message)
```

The database rounds the location and sets the time, expiry and counts. The new pin also reaches every open map through Realtime.

### Confirm or dispute

```ts
import { voteOnSighting } from '@/app/actions/sightings'

const result = await voteOnSighting({
  sightingId: pin.id,
  vote: 'confirm', // or 'dispute'; voting again switches it
  myLat, myLng,    // the device's current GPS fix
})
if (!result.ok) showMessage(result.message)
```

Votes can be switched but not removed.

### Check a saved place or a dropped pin

For home and work, filter the pins already on the phone, so those places never leave it. This is the same distance formula the server uses, so it also works for the 1 km vote pre-check.

```ts
const toRad = (d: number) => (d * Math.PI) / 180
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

const nearHome = pins.filter((p) => distanceMeters(home.lat, home.lng, p.lat, p.lng) <= 1609)
```

For a pin dropped on the map, the server can do the search and return `distance_m` with each pin:

```ts
const { data: nearby } = await supabase.rpc('sightings_near', { pin_lat, pin_lng, radius_m: 1609 })
```

### My posts, my votes, deleting a post

```ts
import { deleteSighting } from '@/app/actions/sightings'

const { data: myPosts } = await supabase.from('sighting_reporters').select('sighting_id')
const { data: myVotes } = await supabase.from('sighting_votes').select('sighting_id, vote')
const result = await deleteSighting(pinId) // your own active pin only
```

### Settings

```ts
const { data: profile } = await supabase
  .from('profiles').select('preferred_language, sightings_posted, votes_cast').single()
await supabase.rpc('set_my_language', { new_language: 'es' })
```

### Save the account, log in on a new phone

```ts
const loginId = `${username.toLowerCase()}@icepik.invalid`
await supabase.auth.updateUser({ email: loginId, password }) // save: same user id, posts and votes kept
await supabase.auth.signInWithPassword({ email: loginId, password, options: { captchaToken } })
const isSaved = session.user.is_anonymous === false
```

The `.invalid` ending can never receive email, so nobody can reset another user's password. It also means a forgotten password can't be recovered.

### Delete the account

```ts
await supabase.rpc('delete_my_account')
await supabase.auth.signOut({ scope: 'local' }) // the account is gone, so just clear this phone
```

## Rules and limits

The server enforces all of these. Mirror them in the app so people see a rule before they run into it.

| Rule | Value |
| --- | --- |
| Pin lifetime | 4 hours from posting |
| Extension | Each person's first confirmation keeps the pin up at least 2 more hours |
| Location rounding | 3 decimals: about 111 m north–south and 85 m east–west in Philadelphia |
| Posting limit | 5 posts per account per clock hour; deleting a post doesn't free a slot |
| Vote distance | Within 1 km of the pin |
| Votes | One per person per pin; can be switched, not removed; not on your own pin or an expired one |
| Verified | 2+ confirmations and at least twice as many confirmations as disputes |
| Disputed | 2+ disputes that outnumber confirmations |
| Verification score | (confirmations + 1) ÷ (confirmations + disputes + 2) |
| Text limits | Label 120 characters, description 280, agent and vehicle counts 0–99 |
| Private record cleanup | Hourly, for pins that have expired |

## Errors to handle

ICEPik's own checks return `error.code` `P0001` with a message written for users: show it as is. For Supabase Auth errors, check `error.code`, never the message text ([error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).

| Error | When | What the app should do |
| --- | --- | --- |
| "You can post up to 5 sightings an hour. Try again later." | 6th post in a clock hour | Show it and keep what the user typed |
| "You need to be within 1 km of a sighting to confirm or dispute it." | Voter is too far away | Show it; your pre-check should usually prevent this |
| "Turn on location to confirm or dispute a sighting." | No location sent | Ask for location permission |
| "This sighting has expired." | Voting on an expired pin | Remove the pin from the map |
| "This sighting no longer exists." | The reporter deleted it | Remove the pin from the map |
| "You can't confirm or dispute your own sighting." | Voting on your own pin | Hide the vote buttons on your own pins |
| "Sign in to confirm or dispute a sighting." or "Sign in to delete your account." | No session | Run the anonymous sign-in again |
| Code `42501`, "violates row-level security policy" | Posting without a session, or writing a table directly | App bug: use the calls in "How to call it" |
| Code `23514` (check constraint) | Text or a count over its limit | App bug: enforce the limits in the form |
| Auth `email_exists` or `user_already_exists` | Username already taken when saving | Say "That username is taken" |
| Auth `invalid_credentials` | Wrong username or password | Say "Username or password is wrong" |
| Auth `weak_password` | Password fails the project's strength setting | Show the password rules |
| Auth `captcha_failed` | CAPTCHA token missing or rejected | Show the CAPTCHA again |
| Auth `over_request_rate_limit` | Too many auth requests from one network | Ask them to try again later |
| Auth `anonymous_provider_disabled` | Anonymous sign-ins are off in Supabase | Ask the backend owner to turn them on |
| "You can only delete active sightings you posted." | Deleting a pin that isn't yours, or has expired | Show Delete only on your own active pins |
| "Sign in to delete a sighting." | No session | Run the anonymous sign-in again |

## What we need from you

The server enforces the data rules; these are the parts only the app can get right. Everything here is required for the MVP unless it's marked **Should**.

### Protect people's locations

- **Keep saved places on the phone.** Store home and work in device storage only, and check them against loaded pins with `distanceMeters`. A server copy would be a list of where immigrants live.
- **Send the phone's location only when voting.** It goes into `vote_on_sighting()` at the moment of the vote and nowhere else: no caching, logs, analytics or crash reports. Don't add third-party SDKs that collect location or user ids.
- **Label pins with street names, not addresses.** Reverse-geocode the rounded point and keep cross streets or "1200 block of …". The server's house-number removal is only a backstop.
- **Warn before free text.** Put a hint on the description field: no names or home addresses. Descriptions are public and nobody moderates them.
- **Guard the session and keys.** Let `@supabase/ssr` keep the session in cookies. The publishable key is the only key in the app; never ship the service\_role key or give it a `NEXT_PUBLIC_` name.

### Keep locations out of the web stack

Supabase, Vercel and CARTO's tile servers all see every visitor's IP address and log each request URL next to it. These rules keep those logs from tying anyone to a place.

- **Writes go through the server actions only.** Never insert into `sightings` or call `vote_on_sighting` or `delete_my_sighting` from the browser client: the user's IP would reach Supabase with the request.
- **No ids or coordinates in URLs.** Change settings with `rpc()`, and never call `rpc()` with `{ get: true }`. Never put coordinates in a page URL, query string or hash: they also land in browser history.
- **Saved places stay in the browser.** Keep home and work in `localStorage` only, never in cookies, which travel to Vercel with every request.
- **No third-party code.** No analytics, session replay, ads or tag managers, and leave Vercel Web Analytics and Speed Insights off. Bundle Leaflet from npm rather than a CDN, and self-host fonts with `next/font`. Set a Content-Security-Policy that allows only your own origin, your Supabase project, CARTO's `*.basemaps.cartocdn.com` and the CAPTCHA provider.
- **Load the map only after the user agrees to the privacy policy.** Leaflet fetches CARTO's Positron tiles from `*.basemaps.cartocdn.com` (through `leaflet-providers`, with the free key in `NEXT_PUBLIC_CARTO_KEY`), whose servers record each visitor's IP and which tiles, and so which area, they load. Keep the OpenStreetMap and CARTO attribution visible. CARTO's terms forbid proxying or caching tiles on a server.
- **Keep the browser's default referrer policy.** `strict-origin-when-cross-origin` sends other sites only your domain, never the page path. Don't use `no-referrer`: a CARTO key restricted to your website is checked against the Referer.
- **Geocode on the server.** Call the reverse geocoder (and Google Translate, later) from a route handler with only the rounded point, so the provider sees Vercel's IP. Never `console.log` request bodies or coordinates: Vercel keeps runtime logs.
- **Protect shared devices.** Add "Clear this device" in Settings to delete saved places and sign out. Keep street names out of page titles, which show in tabs and history.
- **Don't drop new pins on the reporter's GPS position.** Let them place the pin, and suggest posting after they've left the area: a fresh pin shows roughly where its reporter is standing.

### Keep the server actions safe

Server actions are public endpoints: anyone can call one directly with any input, without using the app. Next.js already blocks cross-site form posts and hides thrown error details. Everything else is up to us.

- **Check every argument at runtime.** TypeScript types aren't enforced when a request arrives. `sightings.ts` checks types, ranges and lengths before touching the database; any new action must do the same.
- **Build database rows field by field.** Never pass the caller's object into `.insert()` or `.update()`, or they could set fields such as `expires_at`.
- **Take the user from the session, never from the input.** Don't add a `userId` argument: the database already knows who is calling. If an action ever needs the user on the server, use `supabase.auth.getClaims()`, never `getSession()`.
- **Use only the publishable key.** Never create a Supabase client with the secret service\_role key in an action. It skips every database rule, so any visitor could do anything.
- **Return only what the screen needs**, and pass on only ICEPik's own error messages (`P0001`). Everything else becomes "Something went wrong."
- **Keep Next.js's defaults.** Don't add `serverActions.allowedOrigins` or raise `bodySizeLimit` without checking with the backend owner.
- **Keep server code out of the browser.** `lib/supabase/server.ts` starts with `import 'server-only'`, so the build fails if a client component imports it.
- **Rate-limit actions in Vercel's firewall.** The Hobby plan includes one rate-limit rule: match POST requests that carry a `Next-Action` header, count per IP, and allow about 30 a minute. Run it in Log mode for a day first. When it trips, the action call throws in the browser: catch it and show "Too many tries. Wait a minute."
- **Test with hostile input.** Call each action directly with missing, wrong-type and oversized arguments. Each must return a message and write nothing.

### Keep the map live and honest

- Subscribe to Realtime and handle insert, update and delete events.
- Drop pins whose `expires_at` has passed, checking at least once a minute. Reload pins when the app returns to the foreground or reconnects.
- Show each pin's `verification_status`, its confirm and dispute counts, and how long ago it was posted. Disputed pins must look clearly different from verified ones.
- Cluster pins: rounding puts nearby reports on exactly the same coordinates.
- **Should:** before posting, show active pins within about 200 m and offer to confirm one instead. One event then stays one pin.

### Posting and voting

- Mirror the limits in the post form: the five categories, counts 0–99, label 120 characters, description 280.
- Show Confirm and Dispute only when the vote can succeed: not your pin (`myPosts`), not expired, within 1 km (`distanceMeters`), location on. Still show the server's message if it fails.
- Show the user's current vote from `myVotes` and let them switch it.
- Show Delete only on the user's own active pins.

### Accounts

- On the first visit, show the terms of service and privacy policy before anything else loads: no sign-in, map tiles or CAPTCHA yet. Once the user agrees, sign in anonymously and go straight to the map, with no sign-up screen. Keep the accepted policy version in localStorage, ask again when it changes, and send nothing about the agreement to the server.
- Put "Save account" and "Log in" in Settings. Usernames are 3–20 characters of lowercase letters, numbers and underscores. Passwords are at least 8 characters.
- On the save screen, warn people not to use their real name, and that a forgotten password can't be reset.
- Put "Delete my account" in Settings with a confirmation step inside the app. App stores require in-app deletion.
- If CAPTCHA is on, pass a `captchaToken` to `signInAnonymously` and `signInWithPassword`.

## Done when

Run these on two real phones (A and B) against the Supabase project before calling the frontend done.

- [ ] A first visit shows the terms, and nothing loads from Supabase, CARTO or the CAPTCHA provider until the user agrees. Then the map opens with no sign-up screen and shows the test pins.
- [ ] A pin posted on phone A appears on phone B within a few seconds, without a refresh.
- [ ] Phone B confirms A's pin from within 1 km, and both phones show the new count and status.
- [ ] A vote from more than 1 km away shows the server's message.
- [ ] Phone A sees Delete and no vote buttons on its own pin; deleting it removes the pin from phone B.
- [ ] A pin disappears from both maps within a minute of its `expires_at`.
- [ ] The 6th post in one clock hour shows the posting-limit message and keeps the form filled in.
- [ ] Closing and reopening the app keeps the same account and its "my posts".
- [ ] Saving a username on phone A, then logging in on phone B, shows the same profile totals.
- [ ] Deleting the account signs the phone out and leaves its pins on the map.
- [ ] A network inspector shows the device's location only in the `voteOnSighting` server action request, saved places never, and no request URL holding a pin id, user id or coordinates. No request from the browser to Supabase posts, votes or deletes.
- [ ] The app bundle contains no service\_role key.
- [ ] Calling each server action directly with missing, wrong-type or oversized arguments returns a message and writes nothing, and rapid repeat calls get rate-limited by Vercel's firewall.

## Not built yet and known gaps

These are outside the MVP schema. Ask before building screens that need them.

- **Stretch features with no tables yet:** notifications, local news, live streaming and translated text. Only `preferred_language` is stored. Light mode needs nothing from the database.
- **Out of scope in the PRD:** comments and followers.
- **No moderation:** there's no "report this pin" flow. For now, admins delete harmful posts in Supabase's Table Editor. A report button needs a new table, so ask first.
- **Untested on a live Supabase project:** saving a username and the hourly cleanup job. Test both early.
- **Supabase's own logs** record each request's IP address, a rough location worked out from it, and the full URL. They're kept about 1 day on the Free plan and 7 days on Pro, and Pro's daily backups keep deleted rows for 7 days. Vercel also sees every visitor's IP. A subpoena or warrant can demand all of it, so tell users plainly what is kept instead of promising complete anonymity. CARTO's tile servers and its delivery network (Fastly) also see each visitor's IP and the area they view. Fastly keeps full client IPs for up to two business days (seven when tied to transmission errors, at least a year when tied to activity it flags as suspicious). CARTO shortens IP addresses before logging them and keeps those logs for 30 days in the US. Its terms forbid proxying its tiles, so hiding visitors' IPs from the tile server would mean hosting your own tiles, which isn't decided yet.
- **Answered:** which frontend framework is the team using? The setup code assumes Next.js on Vercel (answered in this thread).

## Sources

- [Supabase: Server-side auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase: Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
- [Supabase: Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase: Managing user data](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase: Log field reference](https://supabase.com/docs/guides/monitoring-and-debugging/log-field-reference.md)
- [Supabase: Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs)
- [Supabase: Pricing (log and backup retention)](https://supabase.com/pricing)
- [CARTO: Basemaps API key](https://www.carto.com/basemaps/apikey/)
- [CARTO: Basemap terms (attribution, no proxying, IP truncation, log retention)](https://carto.com/legal/basemap-terms/)
- [CARTO: Subprocessors](https://carto.com/legal/subp)
- [Fastly: Data management (IP retention)](https://docs.fastly.com/products/data-management)
- [Next.js with-supabase example: server client](https://github.com/vercel/next.js/blob/canary/examples/with-supabase/lib/supabase/server.ts)
