# Plan: report at a searched place, and no pins in impossible places

Session 1 wrote this plan and changed nothing else. The previous PLAN.md (nine UX changes, all done) is
in git history at `ab6e467`. Session 2 carries this plan out. Tick each box as soon as that change is
verified in a real browser, then commit and push with PLAN.md, so a cut-short session can resume at the
first unticked box. Where the code doesn't match this plan, follow the code and note the difference
under "Notes from session 2".

Session 2: read this file, the original prompt and AGENTS.md again before starting. AGENTS.md says this
Next.js (16.2.4) differs from what you know: after `npm ci`, read the relevant guide in
`node_modules/next/dist/docs/` before writing code (client components, and route handlers for
`app/api/search/route.ts`).

## Checklist

- [ ] 1. Report at the searched place
- [ ] 2. Confirm before sending, and Cancel puts everything back
- [ ] 3. Dragging the pin, and the search icon that brings it back
- [ ] 4. No pins in impossible places (on land, within 200 m of a road or footpath)
- [ ] 5. Nothing pinnable nearby, and large search results

## Decisions needed from the user before or during session 2

1. **Which option for change 4** (see "Change 4: the options" below). Recommended: **A, a pinnability
   grid built once from OpenStreetMap and shipped with the site**. Without a choice, session 2 builds
   everything else, then stops and asks.
2. **What counts as "the existing snapping function".** No function named or described as snapping
   exists on any branch (searched every branch for `snap` and `pinnable`). What does exist is the
   report branch of `place()` in `app/_components/map-app.tsx` (line 732), which rounds every tapped,
   dragged or Enter-placed point with `roundCoord()` (`lib/geo.ts` line 23) to the nearest point on a
   0.001° grid, the same rounding the database applies. In effect every grid point is pinnable today.
   The plan treats that as the existing snapping rule: it moves into one named function,
   `snapToPinnable()`, and change 4 adds the land and road test to it, keeping the grid. If the user
   meant something else, stop and ask, as the prompt says.
3. **For option A: the area it covers, and access to OpenStreetMap data.** The default area is the
   Philadelphia region (west −75.60, east −74.70, south 39.75, north 40.30: the city, the nearby PA
   counties and Camden, Burlington and Gloucester counties in NJ). Outside it, no pin can be placed, and
   the message says so. That fits the README ("a map of Philadelphia"). Building the grid needs a
   one-time download. Both `download.geofabrik.de` and `overpass-api.de` are blocked by this cloud
   environment's network policy. Either add one of them under Allowed domains in the environment's
   Network access settings
   (<https://code.claude.com/docs/en/cloud-environments#network-access>), or run the build script on
   your own computer and commit its output.
4. **Branch base (has a default).** Session 2 works on `claude/confident-cannon-3cv9fu`, which equals
   `main` (`ab6e467`). Two branches have newer work on the same files. Unless the user says otherwise,
   session 2 builds on `main` and leaves both branches alone. The overlap is small, and is listed under
   "Other branches".

## How pinnable spots are decided today

- **Tapping the map** (Report → pick mode): Leaflet's `click` gives the exact point.
  `SightingsMap` calls `onPlace` (`sightings-map.tsx` line 250), and `place()` sets the draft to
  `roundCoord(lat), roundCoord(lng)` (`map-app.tsx` line 738).
- **Tapping a pin or cluster while placing**: it places the draft at that pin's coordinates, which are
  already on the grid (`sightings-map.tsx` lines 382 and 415).
- **Dragging the draft pin**: on `dragend`, the exact point goes to `onPlace`, then to `place()`, then
  it's rounded (`sightings-map.tsx` line 444).
- **Keyboard**: Enter on the focused map calls `place(center)` (`map-app.tsx` line 349).
- **Server**: `postSighting` checks only that the coordinates are in range. The database rounds lat
  and lng to 3 decimals when it saves them (docs/database-handoff.md, "lat, lng").
- Nothing checks land, water, roads or paths. A pin can go in the Delaware River.
- **Search**: `chooseSearchResult()` keeps the exact Nominatim point in React state (`searchResult`).
  `SightingsMap` draws the "Searched:" label there and zooms to it. The search route returns only
  `display_name`, `lat` and `lon` today, with no type and no bounding box.
- **Report button**: one button, "Submit a report" (`.report-button`, `map-app.tsx` line 1449). In the
  code it sits in the **bottom-right** corner on every layout, not the bottom-left. It's the only report
  button, so it's the one to reuse. Its `startReport()` enters pick mode. "Use this spot" opens the form
  (`ReportForm`), and "Move pin" goes back to pick mode with the form hidden. The form is a full-screen
  modal, so the pin can only be dragged in pick mode, never while the form shows.

## Privacy rules that apply

From the prompt and docs/database-handoff.md ("Protect people's locations", "Keep locations out of
the web stack"):
- The exact search-result point and the exact drag or tap point are never stored, never sent to
  Supabase or any server, never logged and never put in a URL. Only the snapped spot (a 0.001° grid
  point) is submitted with a report, and only it goes to `/api/reverse`. That's already the case:
  `ReportForm` sends `point`, which is the draft.
- Writes go through the server actions only. No coordinates or ids in page URLs. Never `console.log`
  coordinates or request bodies (Vercel keeps logs).
- The CSP allows only this site, Supabase, CARTO's `*.basemaps.cartocdn.com` (for images only) and
  Turnstile. Changing it needs the user's OK.
- Searched addresses and the snapshot taken for Cancel live in React state only.
- Every snapping option below keeps the exact point on the device. They differ in what else leaves it
  (see the table).

## Change 4: the options

The rule, applied by the snapping function. A grid point is **pinnable** if (a) it isn't inside a
water area (lake, pond, reservoir, river area, sea) and (b) it is within 200 m of a road or footpath:
any OSM `highway` way a person can be on, from motorway to footway, path, steps, track and pedestrian
streets, but not railways, subways, ferries or aerialways. Snapping takes the grid points within
`SNAP_RANGE_M` (300 m, about three grid steps; a constant to tune) of the exact point, sorted by
distance, and returns the first pinnable one. If none is pinnable, it places nothing (change 5).

All four options plug into the same function:

```ts
// lib/pinnable.ts
export type SnapResult =
  | { ok: true; spot: Point }                       // a grid point, rounded like roundCoord
  | { ok: false; reason: "none-nearby" | "outside-area" | "unavailable" };
export async function snapToPinnable(point: Point): Promise<SnapResult>;
```

Only the `isPinnable(gridPoint)` test behind it changes from option to option.

### A. A pinnability grid built once from OpenStreetMap, shipped with the site (recommended)

- **What it is**: a dev-only script, `scripts/build-pinnable-grid.mjs`, downloads OSM roads, paths and
  water for the covered area once. It works out, for every 0.001° grid point, whether the point is
  pinnable, and writes one bit per point to `public/pinnable/philadelphia.bin`, plus a small header
  (area, step, data date, licence). The browser fetches the file once from this site after the terms
  are accepted, so `isPinnable` is a bit lookup.
- **Cost**: free. No npm package: the script reads OSM data with Node's own `zlib` and a small
  protobuf reader (from a Geofabrik extract), or reads Overpass JSON. The default area has 900 × 550 =
  495,000 grid points, so the file is about 62 KB, and about 10–25 KB gzipped. A larger box reaching
  the Kittatinny Ridge and the Poconos would be about 320 KB. Both are far under "a few megabytes". The
  one-off download is about 460 MB of extracts for PA, NJ and DE from Geofabrik, or about 50 tiled
  Overpass queries. Refresh by rerunning the script (say, every few months).
- **What it sends where**: nothing at runtime. The file comes from this site, and the exact point never
  leaves the device. At build time, the developer's machine downloads OSM data, with no user data
  involved. No CSP change, no policy.tsx change and no new runtime service.
- **What it catches**: lakes, ponds, reservoirs, river areas and the Delaware (mapped as water areas
  in OSM); land far from any mapped road or path (marshes, airfields, river islands).
- **What it misses**: anything OSM doesn't have, or that changed after the build (new roads, unmapped
  trails). Streams mapped only as lines (narrow enough not to matter at 100 m). Bridges count as water,
  so the pin snaps to the bank. Outside the covered area, nothing is pinnable ("Pins can only go in the
  Philadelphia area for now."). In the default area there are no mountains, so the "mountainside" and
  "remote peak" checks use places outside the area (the outside-area message) and in-area places far
  from paths (see Verification).
- **Fit**: `snapToPinnable` awaits the one-time load (a few KB), then runs synchronously. The same
  module could later back a server-side check in `postSighting` (not planned; ask first).
- **Licence**: the grid is derived from OSM data, so it's under ODbL. The map already shows
  "© OpenStreetMap contributors". Add one line to the README and to docs/database-handoff.md.

### B. CARTO vector tiles, read in the browser

- **What it is**: CARTO serves vector tiles of the same base map
  (`tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt`, OpenMapTiles schema,
  up to zoom 14). Checked from this container: they have `water` polygons (lake, pond, river, ocean,
  swimming_pool) and `transportation` lines (motorway … minor, service, track, and `path` with subclass
  footway, pedestrian, path, cycleway, steps). They're served with `Access-Control-Allow-Origin: *`.
  The snapping function fetches the 1–4 zoom-14 tiles around the candidates, decodes them and tests the
  geometry.
- **Cost**: free within CARTO's free tier (its pricing page reportedly says 5M requests a month for
  non-commercial use; check the terms for vector use with our key). One zoom-14 tile over Center City
  is 363 KB gzipped (544 KB unpacked); a rural one is 15 KB. A downtown placement could cost up to about
  1 MB of phone data. It needs an MVT decoder: about 150 hand-written lines, or `@mapbox/vector-tile` +
  `pbf`, which is a new dependency (ask).
- **What it sends where**: from the browser to CARTO and its CDN (Fastly): the tile numbers, with the
  visitor's IP. **Needs a CSP change** (`connect-src https://tiles.basemaps.cartocdn.com`), so stop
  and ask. Privacy cost: those requests happen only while someone places a pin, so CARTO's and Fastly's
  logs (Fastly keeps full IPs up to two business days) would tie an IP to a 2.4 km square shortly
  before a public pin appears there. The raster tiles show only that someone looked at the area.
  Fetching vector tiles for every view at zoom 14 and above would hide that, at more data cost.
  policy.tsx would probably need a sentence (ask).
- **What it catches**: everywhere, not just Philadelphia. Data as fresh as CARTO's.
- **What it misses**: what OSM misses; small simplifications at zoom 14. Tile edges need the
  neighbouring tile when a candidate is within 200 m of one.
- **Fit**: async inside `snapToPinnable`, with tiles cached in memory for the session.

### C. Overpass API (OpenStreetMap) through a new server route

- **What it is**: a new `POST /api/pinnable` route. It takes a box around the rounded candidates (about
  1 km, in the body, never logged), asks Overpass for roads, paths and water areas there, and returns
  the geometry. The browser tests the candidates locally.
- **Cost**: free public service with fair-use limits: about 10,000 queries and 1 GB a day per IP, and
  the OSM wiki asks regular users to divide those by 100. Every visitor shares Vercel's IP, so this is
  fine for a demo and not for real use without a paid or self-hosted Overpass. Queries take from half a
  second to many seconds, and 429 or 504 errors happen at busy times, which is risky during a live
  presentation.
- **What it sends where**: from Vercel to overpass-api.de: a box of about 1 km, without the visitor's IP.
  No CSP change. It's a new outside service, so it needs the user's OK. Blocked from this container: to
  verify it in session 2, the user must allow `overpass-api.de` in the environment's network settings.
- **What it catches**: everywhere, with the freshest data (minutes old) and every mapped path.
- **What it misses**: what OSM misses. The sea isn't a polygon in OSM (it's coastline lines), so it
  needs extra handling. That doesn't matter in Philadelphia.
- **Fit**: async inside `snapToPinnable`.

### D. Nominatim reverse lookups (the existing provider)

- **What it is**: for each candidate, ask Nominatim (through `/api/reverse` or a sibling route) for the
  nearest road with its geometry, and whether the point is inside a water feature.
- **Cost**: free, and no new service. But Nominatim's policy is at most 1 request a second for the
  whole app (every visitor shares Vercel's IP). Each placement needs several requests, so a busy hour
  could get the app blocked, which would also break search and street labels.
- **What it sends where**: from Vercel to Nominatim: the grid points (already done for labels).
- **What it catches and misses**: built for addresses, not for this kind of check. It finds the
  nearest named or addressable road, so it skips many unnamed footpaths. It finds water only when the
  water is a named feature in its "natural" layer, so it misses many ponds. Not recommended.

Considered and rejected: reading pixel colours from the CARTO raster tiles. Positron's land
(#fafaf8) and roads (#fff) are nearly the same colour, labels and dark mode get in the way, it needs
CORS-enabled tiles, and it may breach CARTO's terms.

### Recommendation

**A.** It sends nothing anywhere when someone places a pin, which is what this app is built around. It's
instant and can't fail during the presentation. It needs no CSP, policy or dependency change. The file is
tiny. The price is a fixed covered area and data only as fresh as the last build. Both fit an app that
is "a map of Philadelphia". If the user wants pins anywhere, B is next best, provided they approve the
CSP change and accept CARTO seeing when someone places a pin.

## The changes

### Step 0 (no box): put the existing rule in one function

- **Files**: new `lib/pinnable.ts` (`snapToPinnable`, with today's rule: the nearest grid point is
  always pinnable), `app/_components/map-app.tsx` (`place()`, report branch).
- **Change**: `place()` awaits `snapToPinnable(point)` for `picking === "report"`. A counter drops a
  result that comes back after a newer placement. No change in behaviour yet.
- **Verify**: tap, drag and Enter-to-place still put the pin on the same rounded spot as before
  (Playwright: the submitted coordinates of a mock post equal `roundCoord` of the tap point).

### 1. Report at the searched place

- **Files**: `app/_components/map-app.tsx`, `app/_components/report-form.tsx`, `app/globals.css`,
  `app/_components/map-pins.ts` (reuse `shortPlaceName`; the magnifier from `icons.tsx` `SearchIcon`).
- **Change**: in `startReport()`, if `searchResult` is set, take the snapshot (change 2), check the
  result's size (change 5), and await `snapToPinnable(searchResult)`. When it works, set the draft to the
  snapped spot, remember it as `searchSpot` (with the label), open the form directly (no pick mode), and
  pan so the pin is in view behind the form. Without a search result, `startReport()` stays exactly as it
  is. `ReportForm` gets an optional `searched` prop. When it's set, the spot row shows a notice
  "Searched: {shortPlaceName(label)}", in the same style as the map's searched label (dark pill and
  magnifier). The full name goes to screen readers. "Move pin" and the "rounded to about 100 m"
  sentence stay. No second report button.
- **Verify** (Playwright, 1280x800 and 375x667): search a street address (real Nominatim through
  the route, e.g. "1500 Market Street, Philadelphia"), choose it, tap "Submit a report". The form opens at
  once with "Searched: 1500 Market Street". The draft pin is on a grid point, not on the exact result. It
  passes `isPinnable` (after change 4), and the label and pin are visibly apart in the screenshot. Without
  a search result, the button enters pick mode with "Tap the map where you saw ICE." as before.
  Screenshots on phone and desktop to check the design.

### 2. Confirm before sending, and Cancel puts everything back

- **Files**: `app/_components/map-app.tsx`, `app/_components/sightings-map.tsx` (`MapApi.view()` and
  `MapApi.restoreView(view)`, which doesn't count as "moved"), `app/_components/report-form.tsx`.
- **Change**: "Post sighting" is the confirmation, and nothing is posted before it. Enter in a
  single-line field of the report form no longer submits it (implicit submission is blocked; Tab to
  "Post sighting" still works). `startReport()` saves a snapshot in memory: the map view (center and
  zoom), `selectedId`, `groupIds`, `panelOpen`, `reportsTab`, `query`, `searchResult` and the open results.
  `cancelReport()` restores it from every way out: the form's Cancel, the close button, Escape, and the
  pick banner's Cancel. That applies to both the search path and the tap path. Posting, and "Already
  reported nearby?" → show that sighting, end the report without restoring (a new `endReport()`).
- **Verify**: log every request from tapping the button until Cancel: no server action call
  (`Next-Action` header) and nothing to Supabase. Enter in the Agents and Location fields posts
  nothing. "Post sighting" makes exactly one action call. After Cancel (with each of the four ways out),
  the search box text, result marker, selected pin or card, panel state and map view match the state
  before (DOM checks, plus a screenshot diff of the map area once the tiles have loaded).

### 3. Dragging the pin

- **Files**: `app/_components/sightings-map.tsx` (draft marker `dragend`),
  `app/_components/map-app.tsx`, `app/_components/report-form.tsx`, `app/globals.css`.
- **Change**: dragging already goes through `place()`, so on release it snaps with `snapToPinnable`.
  When the snap fails, the marker goes back to the previous draft (`setDraft` with a new object, so the
  map effect moves it back) and the change 5 message shows. When the draft differs from `searchSpot`
  (dragged or tapped elsewhere), the "Searched" notice turns into a search icon button,
  `aria-label="Move the pin back to the searched place, {short name}"`, with the same text as its
  tooltip. Tapping it sets the draft back to `searchSpot` and the notice returns. Focus then goes to
  "Move pin", and a status line says "Pin moved back to the searched place." The search box keeps its
  text and result throughout.
- **Verify**: from the search flow, "Move pin", then drag the marker with `page.mouse` to a nearby
  street. It lands on a grid point, back in the form the icon shows with its accessible name, and the
  search input still holds the address with the result marker on the map. Tap the icon: the pin
  returns to the snapped search spot and the notice is back. Keyboard: Tab reaches the icon, Enter
  works.

### 4. No pins in impossible places

- **Files**: `lib/pinnable.ts` (the rule inside `snapToPinnable`), plus by option: **A**
  `scripts/build-pinnable-grid.mjs` and `public/pinnable/philadelphia.bin`; **B** `proxy.ts`
  (connect-src, after approval) and maybe policy.tsx (after approval); **C** `app/api/pinnable/route.ts`.
  Also README.md and docs/database-handoff.md (data source, and for A the licence line).
- **Change**: as in "Change 4: the options". Every path (search, tap, pin or cluster tap, drag, Enter)
  already goes through `place()` or `startReport()`, which both call `snapToPinnable`. Existing reports
  are left alone: pins already in water still show and can still be confirmed.
- **Stop conditions**: the option needs the user's choice. B needs the CSP and maybe policy.tsx.
  A and C need a blocked host allowed (or a local build). Ask before adding a server-side check in
  `postSighting`.
- **Verify**: spot checks against the data and the map: City Hall and a Fishtown street are pinnable.
  The middle of FDR Park's Meadow Lake isn't, and a tap there snaps to the shore. Mid-Delaware by
  Little Tinicum Island has nothing within 300 m, so the message shows. A land point more than 200 m from
  any road or path, found in the data (e.g. inside Little Tinicum Island or the Tinicum marsh), is refused.
  In the browser: tap the map on water → snapped to the shore, or refused with the message. Drag onto the
  lake and onto the far-from-path spot → refused, and the pin goes back. Drag to a street → accepted. With
  A, a mountainside outside the area (Hawk Mountain ridge) is refused with the outside-area message.
  With B or C, test a real slope far from trails.

### 5. Nothing pinnable nearby, and large search results

- **Files**: `app/api/search/route.ts` (also return `category`, `type`, `addresstype`, `place_rank` and
  `boundingbox` from the same Nominatim response; still never log anything), the `SearchResult` type
  and `chooseSearchResult()` in `map-app.tsx` (keep them in `searchResult`), and `map-app.tsx` messages
  through `showNotice`.
- **Change**: before snapping a search result, treat it as a large area if `place_rank <= 20` (suburb,
  town, city, county, state) or its bounding box is longer than 1 km on a side. Then place nothing and
  show "That's a large area. Search for an address or a place inside it to report there." When
  `snapToPinnable` finds nothing (from search, tap or drag), show "No spot for a pin near here. Pins go
  on land within 200 m of a road or path." and place nothing. With option A, outside the area: "Pins
  can only go in the Philadelphia area for now." When the data can't load: "Couldn't check this spot.
  Try again." The large-area part can be built before change 4. The nothing-nearby part is verified
  after it.
- **Verify**: search "Philadelphia" → large-area message, no form, nothing on the map changed. Search a
  remote peak: with A, "Hawk Mountain" (outside the area) → the outside-area message, and "Little
  Tinicum Island" (inside, no paths) → nothing-nearby; with B or C, a real remote peak → nothing-nearby.
  Messages are announced (the notice is a status region) and readable on phone and desktop.

## Order

Step 0 → 1 → 2 → 3 → 5 (large-area part) → 4 → 5 (nothing-nearby part, then tick 5) → re-run the
checks for 1 and 3 with the real rule → regression pass → final report.

Steps 0 to 3 and the first half of 5 don't depend on the change 4 option. If no option has been chosen
when they're done, stop there and ask. Record the regression pass and the report under "Notes from
session 2".

## Verification setup (session 2)

- `npm ci` (no node_modules yet; registry.npmjs.org is reachable). Then read the Next docs, as AGENTS.md
  says.
- Build for production with the fake Supabase settings (check the variable names in
  `lib/supabase/config.ts`), and run `npx next start` in the background. `NEXT_PUBLIC_CARTO_KEY` is set
  in the environment. Read it only from there: never print it, and never log tile URLs, which contain it.
- **No Supabase project or CLI here.** Use `scripts/mock-supabase.mjs`, copied to the scratchpad and
  extended to answer `POST /rest/v1/sightings` with the inserted row (rounded to 3 decimals, as the
  database does) and to record request bodies for the privacy check. The report must say that posting
  ran against this fake, so real inserts, database rounding, Realtime and the database's own rules
  weren't checked.
- **Privacy check for every flow**: record every browser request (URL and body, including server
  action calls and `/api/reverse`), what the fake Supabase receives, the browser console and the
  server's output. Search all of it for the exact result's coordinates at several precisions (the
  Nominatim string, 6, 5 and 4 decimals). The only allowed place is the `/api/search` response. The
  snapped spot appears only in `/api/reverse` and the post.
- Nominatim is reachable from the container. Use the real search for the main flows, and
  `page.route('**/api/search')` fixtures for edge cases (a large box, a peak).
- Screen sizes: 375x667 and 1280x800, plus 320x568 for the form. Screenshots for the user at
  `deviceScaleFactor: 2`.
- Regression pass after all five: tapping the map to report on land still works, every pin and cluster
  type still shows, and `npx tsc --noEmit`, `npx eslint` and `npx next build` pass.

## Other branches (checked in session 1)

- `ccr-ce93647e-c29sev`: 31 commits newer than what `main` merged, including the `/demo` page with its
  own database (2bc7278) and Turnstile on (c2ec338). It overlaps here in `map-app.tsx` (imports, a
  `demo` constant, a notice effect, the h1), `report-form.tsx` (`useDemo`, `postSighting(…, demo)`),
  `proxy.ts` (a CSP per path; matters only for option B) and `app/actions/sightings.ts`. If the
  presentation uses `/demo`, this branch needs merging with that one afterwards; the conflicts should be
  a few lines.
- `review-fixes-recovery-keys`: 4 commits ahead of `main` (recovery keys, database review). It
  rewrites much of docs/database-handoff.md, including the privacy section, and touches policy.tsx and
  `app/actions/sightings.ts`. Keep this plan's docs edit to one separate paragraph so it merges cleanly.
  Its privacy rules are no looser than main's for these changes.
- `ccr-59bf185f-dp6eoa`, `ccr-e62ec9a7-8wl264`, `claude/icepik-map-handoff-9xy8qz`: older than `main` or
  already merged. `claude/handoff-icepik-map(-1)`: handoff documents only. `claude/icepik-logo-assets`:
  logo files only. None of them touch this work.

## Final report (prose)

For each change: passed or not, and how it was checked. Which data source change 4 uses and what it
might miss. What couldn't be verified and why (at least: a real Supabase project, real devices).

## Notes from session 2

(none yet)

## Sources

- [CARTO basemap terms](https://carto.com/legal/basemap-terms/) and [CARTO basemaps FAQ](https://docs.carto.com/faqs/carto-basemaps)
- [Overpass API usage limits (OSM wiki)](https://wiki.openstreetmap.org/wiki/Overpass_API) and [Overpass API user's manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
