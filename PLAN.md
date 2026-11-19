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

- [x] 1. Report at the searched place
- [x] 2. Confirm before sending, and Cancel puts everything back
- [x] 3. Dragging the pin, and the search icon that brings it back
- [x] 4. No pins in impossible places (on land, within 200 m of a road or footpath)
- [x] 5. Nothing pinnable nearby, and large search results
- [x] 6. Draw the map from CARTO's vector tiles, so it can zoom past 18 (added by the user on 18 Nov)

## Decisions from the user

1. **Change 4 uses option B, CARTO's vector tiles** (user, 18 Nov 2026: "We already use CARTO, so
   just do the least amount of change needed", then "I want CARTO vector tiles"). They approved the
   CSP line this needs (`connect-src` for CARTO's tile host), and they chose to leave the privacy terms
   (policy.tsx) as they are. Options A, C and D below are kept for the record.
2. **Draw the whole map from vector tiles too** (user, 18 Nov 2026, to remove the zoom limit at 18;
   chosen over enlarging the zoom-18 images). This is change 6. They chose it knowing it "needs a new
   map-drawing library (such as MapLibre GL, roughly 800 KB), rebuilt light and dark map styles, more
   CSP changes, and rework of every marker". The exact packages are under change 6. If the user objects
   to the small Leaflet bridge package, write the bridge by hand instead (about 150 lines).
3. **What counts as "the existing snapping function".** No function named or described as snapping
   exists on any branch (searched every branch for `snap` and `pinnable`). What does exist is the
   report branch of `place()` in `app/_components/map-app.tsx` (line 732), which rounds every tapped,
   dragged or Enter-placed point with `roundCoord()` (`lib/geo.ts` line 23) to the nearest point on a
   0.001° grid, the same rounding the database applies. In effect every grid point is pinnable today.
   The plan treats that as the existing snapping rule: it moves into one named function,
   `snapToPinnable()`, and change 4 adds the land and road test to it, keeping the grid.
   **Confirmed by the user on 18 Nov 2026:** "that rounding pin to about 100m is what I meant by
   snapping."
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
  Turnstile. The user approved one addition for changes 4 and 6: `connect-src https://basemaps.cartocdn.com
  https://tiles.basemaps.cartocdn.com` (CARTO's style files, and its vector tiles, fonts and icons).
  Anything beyond that needs a new OK.
- The pin check must not tell CARTO that someone is placing a pin. It reads the same tile URLs the
  map has already loaded to draw the area, so they come from the browser's cache (verify: no new CARTO
  request during a check). Before checking, the map shows the spot at zoom 15 or deeper if it isn't
  already, so any tile it needs is an ordinary map-viewing request.
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

### A. A pinnability grid built once from OpenStreetMap, shipped with the site (not chosen)

- **What it is**: a dev-only script, `scripts/build-pinnable-grid.mjs`, downloads OSM roads, paths and
  water for the covered area once. It works out, for every 0.001° grid point, whether the point is
  pinnable, and writes one bit per point to `public/pinnable/philadelphia.bin`, plus a small header
  (area, step, data date, licence). The browser fetches the file once from this site after the terms
  are accepted, so `isPinnable` is a bit lookup.
- **Cost**: free. No npm package: the script reads the `.osm.pbf` extracts with Node's own `zlib`
  and a small protobuf reader. The default area has 900 × 550 = 495,000 grid points, so the file is
  about 62 KB, and about 10–25 KB gzipped. A larger box reaching the Kittatinny Ridge and the Poconos
  would be about 320 KB. Both are far under "a few megabytes". The one-off download is about 585 MB of
  state extracts (see below), used only on the build machine and never committed. Refresh by rerunning
  the script (say, every few months).
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

### B. CARTO vector tiles, read in the browser (CHOSEN by the user)

- **Details for session 2** (checked 18 Nov 2026): CARTO's current GL styles
  (`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` and `dark-matter-gl-style`) draw from
  `https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt`,
  in the **Protomaps schema**, up to **zoom 15** (zoom 16 answers 404). Glyphs and sprites come from
  the same host. No API key is in those URLs, and tiles load without one. Layers the check uses: `earth`
  (land polygons, which also covers the sea), `water` (polygons of kind water, lake, basin, swimming_pool
  and so on, plus river and stream lines, which are ignored), and `roads` (lines of kind highway,
  major_road, minor_road and path, with kind_detail footway, pedestrian, path, cycleway, service and so
  on). Rail and `disused_*` kinds are excluded. Sizes: zoom 15 over City Hall is 181 KB on the wire
  (394 KB unpacked); zoom 14 is 84 KB; a rural zoom-13 tile is 16 KB. Pinnable = inside `earth`, not
  inside a `water` polygon, and within 200 m of a road. The check reads the zoom-15 tiles covering 500 m
  around the point (300 m snapping + 200 m to a road), with a hand-written MVT decoder of about 150
  lines (no new package), and works whether or not change 6 is in. The URL template comes from the style
  in use, so it's the same URL the map loads.
- **What it is**: CARTO serves vector tiles of the same base map
  (`tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt`, OpenMapTiles schema,
  up to zoom 14). Checked from this container: they have `water` polygons (lake, pond, river, ocean,
  swimming_pool) and `transportation` lines (motorway … minor, service, track, and `path` with subclass
  footway, pedestrian, path, cycleway, steps). They're served with `Access-Control-Allow-Origin: *`.
  The snapping function fetches the 1–4 zoom-14 tiles around the candidates, decodes them and tests the
  geometry. (This first check was of the older v1 tiles. Use v2, as above.)
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
  No CSP change. It's a new outside service, so it needs the user's OK. From this container no Overpass
  instance answered: overpass-api.de reset every connection during the TLS handshake (see below),
  overpass.kumi.systems and overpass.private.coffee timed out after 40 s, and maps.mail.ru answered
  504. Session 2 could not verify C unless one of them starts answering, and that is the same
  reliability risk the app would carry.
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

### Where the OpenStreetMap data comes from (options A and C)

Checked from this container on 18 Nov 2026. Internet access isn't restricted, but some hosts don't
answer:
- **geo2day.com (formerly osmtoday), works; use this for A.** Daily state extracts, all dated
  18 Nov 2026: `north_america/us/pennsylvania.pbf` (374 MB), `north_america/us/new-jersey.pbf` (178 MB,
  hyphen, not underscore), `north_america/us/delaware.pbf` (24 MB). Between them they cover the whole
  default area.
- **download.openstreetmap.fr, works.** `extracts/north-america/us-northeast-latest.osm.pbf` (2 GB,
  17 Nov) has PA and NJ but not Delaware. Fallback only.
- **download.bbbike.org, works, too small.** Its weekly Philadelphia extract (42 MB PBF, 14 Nov) covers
  only −75.33..−74.94 × 39.83..40.05, which leaves out the city's Far Northeast (up to about 40.14) and
  every suburb.
- **download.geofabrik.de and overpass-api.de, no connection.** Each reset the connection right after
  the TLS hello on every try (3 tries each, also over HTTP/1.1). The local proxy logged "tunnel closed
  after 3–4 s; 517 B sent, 39 B received", which means the tunnel opened and then dropped. That's a
  failure on the path to those two hosts, not a refusal. Don't depend on them.

### Recommendation and choice

Session 1 recommended A, because it sends nothing when someone places a pin and is tiny for users (the
585 MB download happens once, on the build machine). **The user chose B.** With change 6 the map draws
from the same vector tiles, so the check reads tiles that are already cached and adds no placement
request (see "Privacy rules that apply"). What B might miss: anything OSM lacks or CARTO hasn't picked
up yet (CARTO's data is a few weeks old), trails mapped nowhere, small simplification in the tiles,
and tidal or seasonal water. Bridges count as water, so the pin goes to the bank. It works anywhere,
not just Philadelphia.

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

- **Files** (option B): `lib/pinnable.ts` (the rule inside `snapToPinnable`: tile maths, fetching the
  zoom-15 tiles from the style's URL template, the MVT decoder, point-in-polygon and distance to a
  line), `app/_components/map-app.tsx` (before checking, show the spot at zoom 15 or deeper if the
  500 m around it isn't on screen there), `proxy.ts` (the approved `connect-src` line, if change 6
  hasn't added it already), README.md and docs/database-handoff.md (one paragraph: what the check
  reads, and that it adds no request of its own).
- **Change**: as in option B. Every path (search, tap, pin or cluster tap, drag, Enter) already goes
  through `place()` or `startReport()`, which both call `snapToPinnable`. Existing reports are left
  alone: pins already in water still show and can still be confirmed. Tiles are kept in memory for the
  session, so repeated checks in one area cost nothing.
- **Stop conditions**: any CSP change beyond the approved line. If CARTO's terms turn out to forbid
  reading the vector tiles like this, stop and say so. Ask before adding a server-side check in
  `postSighting`. Never send the exact point anywhere: only tile numbers, which the map loads anyway.
- **Verify**: spot checks of `snapToPinnable` in the browser against what the map shows. City Hall and
  a Fishtown street are pinnable. The middle of FDR Park's Meadow Lake isn't, and a tap there snaps to
  the shore. Mid-Delaware by Little Tinicum Island has nothing within 300 m, so the message shows. A
  land point more than 200 m from any road or path (inside Little Tinicum Island or the Tinicum marsh) is
  refused. A real mountainside far from any trail is refused (choose one with the data, e.g. on Blue
  Mountain away from the Appalachian Trail). In the browser: tap the map on water → snapped to the
  shore, or refused with the message. Drag onto the lake and onto the mountainside → refused, and the
  pin goes back. Drag to a street → accepted. Network: during a check, no new request to CARTO when
  the area is already on screen, and no request carries the exact point.

### 5. Nothing pinnable nearby, and large search results

- **Files**: `app/api/search/route.ts` (also return `category`, `type`, `addresstype`, `place_rank` and
  `boundingbox` from the same Nominatim response; still never log anything), the `SearchResult` type
  and `chooseSearchResult()` in `map-app.tsx` (keep them in `searchResult`), and `map-app.tsx` messages
  through `showNotice`.
- **Change**: before snapping a search result, treat it as a large area if `place_rank <= 20` (suburb,
  town, city, county, state) or its bounding box is longer than 1 km on a side. Then place nothing and
  show "That's a large area. Search for an address or a place inside it to report there." When
  `snapToPinnable` finds nothing (from search, tap or drag), show "No spot for a pin near here. Pins go
  on land within 200 m of a road or path." and place nothing. When the tiles can't load: "Couldn't
  check this spot. Try again." (Option B has no covered area, so there's no outside-area message.) The
  large-area part can be built before change 4. The nothing-nearby part is verified after it.
- **Verify**: search "Philadelphia" → large-area message, no form, nothing on the map changed. Search a
  remote peak with no trail to its top (find one whose result point is more than 500 m from any road or
  path in the tiles) → the nothing-nearby message. Also search "Little Tinicum Island" → nothing-nearby.
  Messages are announced (the notice is a status region) and readable on phone and desktop.

### 6. Draw the map from CARTO's vector tiles, so it can zoom past 18

- **Packages** (exact versions, from npm, bundled; no CDN): `maplibre-gl@6.16.0` (BSD-3-Clause; out
  since 25 Oct; 6.19.0 came out on 17 Nov, too new) and `@maplibre/maplibre-gl-leaflet@0.1.4` (ISC, from
  the MapLibre project, a 3 KB bridge that puts a MapLibre map inside Leaflet as a layer; it supports
  MapLibre 6). Leaflet stays in charge of everything else: pins, clusters, the searched label, the blue
  dot, saved places, taps, dragging, panes and the attribution. Cost to users on the first visit: about
  455 KB of compressed JavaScript (measured on 6.19: 298 KB main file and a 157 KB worker) plus 10 KB of
  CSS, cached afterwards. Map data replaces map images: a zoom-15 vector tile (up to 181 KB downtown)
  covers what many 256-pixel images used to.
- **Files**: `package.json` and `package-lock.json`; `app/_components/sightings-map.tsx` (the base
  layer); `app/_components/leaflet.ts` (load the bridge with Leaflet); `app/globals.css` (MapLibre's
  CSS, and dark-label rules that are no longer needed, kept for the fallback); `proxy.ts` (the approved
  `connect-src` line); README.md and docs/database-handoff.md (the "Bundle Leaflet from npm" and CSP
  lines gain MapLibre and the two hosts).
- **Change**: the base layer becomes a MapLibre GL layer that loads CARTO's Positron or Dark Matter GL
  style, chosen from `prefers-color-scheme` and switched live with `setStyle`, as the raster layers are
  today. In dark, `transformStyle` lightens the place and street labels, which Dark Matter draws too
  faint (the reason for today's separate label tiles). Re-run the contrast check from the dark-map work.
  The map's deepest zoom goes from 18 to 20 (MapLibre redraws the zoom-15 data sharply). The cluster
  logic that uses `MAX_ZOOM` follows the new value. The attribution stays "© OpenStreetMap
  contributors © CARTO" with its links. MapLibre's own controls stay off. **Fallback**: if WebGL isn't
  available (some privacy-hardened browsers turn it off), keep today's raster layers and deepest zoom 18,
  unchanged. The pin check (change 4) works in both cases. MapLibre's worker is loaded from this site
  (`setWorkerUrl`), so the CSP needs no `blob:` script change.
- **Stop conditions**: if MapLibre or its worker won't run under the CSP with only the approved
  `connect-src` line (for example if it needs `unsafe-eval` or a looser `script-src`), stop and ask.
  Same if the bridge or MapLibre 6.16 won't build with Next 16 and Turbopack, rather than swapping in
  other packages. If it can't be made solid before the presentation, the five changes don't depend on
  it: leave it on a branch and say so.
- **Verify** (light and dark, 1280x800 and 375x667): the map draws, labels are readable (contrast
  check), and zoom 19 and 20 are sharp. A live light/dark switch works without a reload. Every pin and
  cluster type, the searched label, the blue dot, saved places and the draft pin still sit above the
  map, and taps still reach the map and the pins. Pick mode, drag and Enter-to-place work. The
  attribution shows. No CSP errors in the console. Only the allowed hosts are contacted. With WebGL
  turned off (Chromium `--disable-webgl`), the raster fallback shows. Record first-load bytes before and
  after.

## Order

Step 0 → 1 → 2 → 3 → 5 (large-area part) → 4 → 5 (nothing-nearby part, then tick 5) → 6 → re-run
the checks for 1, 3 and 4 on the vector map → regression pass → final report.

Change 4 comes before 6 because the five requested changes don't depend on 6, so they're safe for the
presentation even if 6 runs into a stop condition. Record the regression pass and the report under
"Notes from session 2".

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
- WebGL in headless Chromium (change 6): launch with `--enable-unsafe-swiftshader` (or
  `--use-angle=swiftshader`) so MapLibre gets a software WebGL. Check `getContext('webgl2')` first and
  note it in the report.
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

For each change (1 to 6): passed or not, and how it was checked. Which data source change 4 uses (CARTO's
v2 vector tiles, built from OpenStreetMap) and what it might miss. First-load bytes before and after
change 6, and the fallback without WebGL. What couldn't be verified and why (at least: a real Supabase
project, real devices and their GPUs).

## Notes from session 2

- Test harness (scratchpad, not in the repo): `t/lib.mjs` (Playwright helpers, network recorder that
  redacts the CARTO key), `t/mock-supabase.mjs` (fake Supabase that accepts posts, rounds them to 3
  decimals and logs every request body), `main/check-flows.mjs` (changes 1, 2, 3 and 5's large-area
  part; `node check-flows.mjs desktop|phone`).
- Parallel work: a workflow builds `lib/pinnable.ts` (change 4) and change 6 in their own worktrees,
  each followed by an independent reviewer. Until it lands, `lib/pinnable.ts` holds today's rule
  (plain rounding) behind the final API.
- Steps 0 and 4's wiring are one piece of code: `checkSpot()` in map-app.tsx shows the spot at Leaflet
  zoom 16 or deeper (`DETAIL_ZOOM`; with change 6 that is MapLibre zoom 15, so the map itself loads the
  zoom-15 tiles the check reads), then awaits `snapToPinnable`. A counter drops a check that a newer
  placement or Cancel overtook. Taps, drops, Enter and pin/cluster taps all go through it.
- Change 5, large-area rule, calibrated on real Nominatim answers (18 Nov): `place_rank <= 20` would
  have called every peak an area (peaks are rank 18 with an 11 m box), and a 1 km box would have refused
  "1500 Market Street, Philadelphia" (its top result, City Hall station, has a 1.1 km box). Used instead:
  rank 16 or below, or a `place`/`boundary` result of a settlement or region type, or a box longer than
  2 km on a side. So "Philadelphia", "Fishtown" and big parks (Fairmount 5 km) get the large-area
  message; addresses, streets, buildings and peaks don't. "Little Tinicum Island" is a 3 km islet, so it
  gets the large-area message, not nothing-nearby (the plan expected the latter).
- Change 1: the notice shows the result's short name, as the map label does. For "1500 Market Street,
  Philadelphia" Nominatim's top result is "City Hall, 1500, Market Street, …", so it reads "Searched:
  City Hall".
- **Change 2 verified** (desktop 1280x800 and phone 375x667, `check-flows.mjs`, 26/26 and 25/25): from
  tapping "Submit a report" to Cancel, no server action call and no write reached the fake Supabase;
  Enter in the Agents, Location and category fields posts nothing; "Post sighting" makes exactly one
  action call, and the fake Supabase received only the snapped spot; the form's Cancel, its close
  button, Escape and the banner's Cancel each restore the search text, the searched label, the pins'
  screen positions (so the map's center and zoom), and an open card with its selected pin. The exact
  search coordinates appeared in no request but the search response, and in neither the browser
  console nor the server log.
- Changes 1 and 3 pass the same script with today's rule (form opens at once with the notice; the pin is
  on a grid point, not the exact result; drag snaps; the notice becomes the icon with its accessible
  name; the icon, by mouse and by keyboard, brings the pin and notice back and focus moves to "Move
  pin"; the search box keeps its text throughout). Their boxes wait for the re-run with change 4's rule.
- Change 4's engine (`lib/pinnable.ts`, 740 lines, no imports) was built in a worktree and merged
  (31fce03). Its builder cross-checked it against a separate reference implementation (1,135 of 1,135
  grid points agree) and found the test places used below. Two deliberate differences from the plan:
  every tile of a check missing gives "unavailable", not "none-nearby" (a stale template would
  otherwise refuse every pin), and the nearest grid point is checked with only the tiles within 200 m
  of it before the whole 500 m box is read (same answers, fewer tiles). Road tunnels don't count (the
  Turnpike tunnel under Blue Mountain doesn't make the slope above it pinnable).
- The plan's "zoom 15" before a check is Leaflet zoom 16 in the code (`DETAIL_ZOOM`): the MapLibre
  bridge runs MapLibre one zoom below Leaflet, and zoom-15 vector tiles load only from Leaflet 16.
- Test places (found with the module in Node, `main/places.json`): South Meadow Lake in FDR Park
  (39.9014819, −75.1787115), the Delaware south of Little Tinicum Island (39.849, −75.293; nearest
  pinnable spot 477 m), a forested north slope below the Blue Mountain crest west of Port Clinton
  (40.5704, −76.0939; nearest pinnable spot 479 m; the builder's first slope point, 40.566, −76.090, is
  1.26 km from any path), Frankford Ave & Girard Ave, and the search "Mount Sanford" (Alaska, a
  volcano with no trail: nothing pinnable within 300 m).
- Change 5: Little Tinicum Island has a mapped trail at its east end and is a 3 km islet anyway, so it
  isn't a "nothing nearby" test; the remote-peak search ("Mount Sanford") is.
- **Change 4 verified on the raster map** (desktop and phone, `main/check-pinnable.mjs`, 12/12 each):
  a tap on South Meadow Lake and a drag back onto it both end on the shore (124 m from the middle, on
  the grid); a tap on the river or the slope is refused with "No spot for a pin near here. Pins go on
  land within 200 m of a road or path." and places nothing; a pin dragged onto either goes back to
  where it was, with the message; a tap on a street lands on the nearest grid point (61 m); no console
  errors. Still to check after change 6: the check's tiles come from the browser cache. On the raster
  map they are new requests (4 for the lake), as expected.
- **Changes 1, 3 and 5 verified with the real rule**: `check-flows.mjs` again (desktop 26/26, phone
  25/25, small phone 25/25 earlier) and `check-pinnable.mjs` (search "1500 Market Street,
  Philadelphia": the form opens with "Searched: City Hall" and the pin on a pinnable grid point 22 m
  from the exact result; after a drag the notice is the icon, the search box keeps its text, the icon
  brings the notice back; "Mount Sanford" gives the nothing-nearby message with no form and no pin;
  "Philadelphia" gives the large-area message; the exact result coordinates appear in no request but
  the search response, nor in the console or server log).
- Found while testing: a repeated notice (a second refused pin in a row) wasn't announced again,
  because the screen-reader copy only speaks when its text changes. `showNotice` now clears the
  message for 150 ms first when it's the same (commit "Announce a repeated notice again").
- Independent review of `lib/pinnable.ts` (its own Python decoder written from the MVT spec): 1,207
  of 1,207 grid points and 175 of 175 snaps agree on live tiles; verdict pass. Fixed from its
  findings: a 404 tile now makes the check "unavailable" ("Couldn't check this spot. Try again.")
  instead of being read as sea; one template lookup per check; a note on where the flat maths stops
  being exact. Re-tested in Node with a local tile server that 404s one tile.
- Independent review of the change 1–3/5 code: verdict "fixes needed" (2 major, 5 minor). All fixed
  (commit c340486) and checked in the browser (`main/check-review-fixes.mjs`, 12/12;
  `main/check-zoom-cancel.mjs`, 3/3): a check started from a searched place now says "Checking the
  spot…" on the button and to screen readers, Escape cancels it, and it is dropped if the search
  changes, a dialog opens or another spot is being chosen (it used to open the form for the old
  search); any error in a check counts as "unavailable"; "Back to the form" during a drag check drops
  the check and puts the pin back; Cancel returns focus to "Submit a report" (also from the banner);
  Cancel's view survives a zoom animation still under way (Escape 30, 120 and 220 ms into the
  zoom-in); a long searched name shortens instead of widening the form at 320 and 375 px; screen
  readers get the full name; the large-area message says how to tap the map instead. Accepted as is:
  a bare street name ("Broad Street") is not treated as a large area, so the pin goes near the
  segment Nominatim returns.
- Change 6 was finished by a second worker after the first hit a usage limit, and merged (8387f13,
  merge efed5fd). Its builder's checks: the map draws from CARTO's vector tiles under every pin and
  overlay; zoom 19 and 20 are sharp; labels reach 6.66:1 in dark and 4.71:1 in light; a live
  light/dark switch keeps one style; the raster map shows without WebGL (max zoom 18) and if
  MapLibre fails; no WebGL context leaks over 20 unmounts; first visit with WebGL about 1.71 MB
  instead of 0.90 MB (MapLibre about 440 KB compressed, vector data 782 KB instead of 438 KB of
  images), cached afterwards; without WebGL +2.5 KB. Added on merge: the map passes its tile
  template to the pin check (`onVectorTiles={setTileTemplate}`); a style that hasn't arrived after
  12 s gives the raster map instead of a blank one; MapLibre's worker, a static file the page's CSP
  doesn't reach, gets its own policy from `next.config.ts` (`default-src 'none'; connect-src` the two
  CARTO vector hosts), checked with curl and in the browser.
- **Change 4 verified on the vector map** (desktop and phone, `check-pinnable.mjs`, 12/12 each): every
  pin check's tiles came from the browser's cache and none from CARTO: lake 4/4, river 4/4 and
  mountainside 4/4 (both the whole 500 m box), search start 2/2, at both sizes. The flow suites pass
  on the vector map too (desktop 26/26, phone 25/25), as do the review-fix checks (12/12) and Cancel
  during a zoom (3/3).
- **Regression pass** (on the merged build with the vector map): `npx tsc --noEmit` exit 0;
  `npx eslint` exit 0 for the repo (run with `--ignore-pattern '.claude/**'`: the agents' git
  worktrees under `.claude/worktrees/`, which are untracked copies with their own `.next` builds,
  otherwise add thousands of findings that aren't in the repo); `npx next build` succeeds.
  `main/check-regression.mjs` 10/10: at 1280x800 and 375x667, light and dark, verified, unverified
  and disputed pins and a cluster all draw above the vector map and are the topmost element at their
  centre; a report placed by tapping the map on land posts ("Sighting posted. Everyone can see it
  now.") and opens its card, at both sizes; no console errors other than the fake Supabase's
  realtime socket.
- Independent review of change 6 (rebuilt and run on its own ports): verdict pass, 37/37 browser
  checks in all four size and scheme combinations; the served CSP equals the old one plus the two
  approved connect-src hosts; only the two approved packages (and their own dependencies) added;
  keyboard: Tab reaches the map, the arrow keys pan, Enter places the pin at the centre. Fixed from its
  findings: when the style loads but CARTO's vector tiles can't (an outage, a blocked host), the map
  now falls back to CARTO's images instead of staying blank (an error before the first tile, or no
  tile 15 s after the style); the docs say WebGL 2. Checked: `main/check-fallback.mjs` 3/3 (tiles
  blocked → images, style blocked → images, nothing blocked → vector map). Accepted: the build copies
  about 5 MB of MapLibre files nobody downloads into `.next/static/media` (deploy size only).
- **Change 6 verified**: the builder's and the reviewer's checks above, plus every suite of this
  session re-run on the vector map (flows, pin checks, review fixes, regression, fallback).
- Clean-up: the agents' three git worktrees and their local branches were removed after merging.
- **Final audit** (two independent read-only auditors over the whole branch). Privacy/security: pass
  (the CARTO key is in no diff, tracked file or log; policy.tsx, `database/` and the sightings
  server action are untouched; the CSP diff is exactly the approved line; the two packages are pinned
  and from the npm registry; no new storage, logging or URLs of coordinates). Task compliance: one
  major gap, now closed: no lake had been shown refusing, and the small-lake check could pass
  without its drags. South Meadow Lake (FDR Park) snaps to its shore by design (there is land within
  300 m); the lake check now asserts that each drag moves the pin, and Lake Nockamixon (open water,
  nothing pinnable within 300 m) is refused, by a tap and by a drag that sends the pin back. Also
  fixed from the audit (commit 881e402): Report uses a search result only while the box still shows
  it; tapping "Checking the spot…" stops the check; "Move pin" lines up beside the icon; and before a
  check the map now waits for the vector map to load what it shows. A tap from the opening zoom
  used to send 2 of its 4 tile requests to CARTO; now 0 of 4. New checks: the exact tap and drop
  points (6 of them) appear in no request, database record, console or server log; a house-number
  address reads "Searched: [number] [street]", as the map label does; touch input on a phone (tap, finger drag,
  "Use this spot"); a pin on the image map without WebGL; and "Couldn't check this spot" when CARTO's
  vector tiles are unreachable (`main/check-audit-fixes.mjs`, 8/8).
- **Final run on the final build** (after every code change): flows desktop 26/26, phone 25/25,
  320x568 25/25; pin checks desktop 16/16, phone 16/16, 320x568 15/15 (one drag test skipped there:
  its starting spot is under the search box on that screen; it passes at the other sizes); review
  fixes 12/12; Cancel during a zoom 3/3; regression 10/10; fallback 3/3; audit fixes 8/8;
  `npx tsc --noEmit` and `npx eslint` exit 0 over the whole repo; `npx next build` succeeds. Pin
  check tiles: from the cache in every check at 375 px and up; on the 320 px screen, checks that
  read the whole 500 m box fetched 1–2 of 4 tiles from CARTO (recorded in the handoff doc).
- **Not verified** (and why): a real Supabase project (none here; posting ran against the fake, so
  real inserts, the database's rounding and rules, and Realtime were not exercised); real devices and
  GPUs (headless Chromium with software WebGL; touch was emulated through the DevTools protocol);
  Firefox and Safari; a Vercel deployment (in particular that the worker's own CSP header from
  `next.config.ts` is served there); real Windows high-contrast themes on the new notice and icon.
- **Open questions for the user**: (1) CARTO's basemap terms cover the vector tiles, and the free tier
  is described for customers who use a key; vector styles load without one today, but CARTO says it
  may require a key later. If it does, the map falls back to images, but every pin check fails
  closed ("Couldn't check this spot") until the key is added to vector requests. The terms forbid
  bulk extraction and server-side caching or proxying, and don't mention decoding a few tiles in the
  browser to test a point; ask CARTO to be certain. (2) On the image map (no WebGL 2), each check
  downloads vector tiles at the moment a pin is placed, which CARTO could link to the pin's area; a
  sentence in policy.tsx may be wanted (not changed: it needs the user's OK). (3) Fail closed when
  CARTO can't be reached (current) or place with plain rounding? (4) The street label lookup
  (`/api/reverse`, the snapped spot only) still runs when the form opens, before "Post sighting",
  as before this work. (5) A tap now zooms the map to street level (zoom 16) before the pin lands.
  (6) A bare street name ("Broad Street") is not treated as a large area.
- **Follow-up: saved places start at a searched place too.** With a search result shown (and the
  box still showing it), Settings' "Set on map" for home or work puts a pending pin there and waits
  for "Save home" / "Save workplace" (focus goes to it); a tap or Enter moves the pin; Cancel and
  Escape save nothing. A whole city or area says "That's a large area. Search for an address inside
  it, or tap your home on the map." and falls back to tapping. "Add a place" opens the name form at
  the searched place with its short name filled in, as the search box's star does. Without a
  search, all three work as before. Home and work keep their own 4-decimal rounding and no land and
  road check (that check is for report pins; saved places never leave the device). Checked in the
  browser (`places/check-places.mjs`): 39/39 on desktop and on a phone; report flows still 26/26
  and 25/25, regression 10/10; `tsc` and `eslint` exit 0.
- **Follow-up: pins only where ICE works.** Researched on 2026-11-19 (README, section 6): the
  INA's "United States" (8 U.S.C. 1101(a)(38)), which every ERO field office covers, with ICE
  arrests in 2025-2026 in each part; no state can exclude ICE; American Samoa (own immigration
  system), the minor outlying islands, Guantanamo and every other country left out.
  `lib/service-area.json` is OSM relation 148838 (to 12 nautical miles out), simplified with
  Douglas-Peucker at 25 m: checked against the full outline at 167,740 points near the land
  borders, every wrong answer was within 25 m of the true border. 293 KB, 95 KB gzipped, loaded
  with import() at the first pin. `snapToPinnable` takes `inArea` and answers "outside" with no
  tile read; the map checks it before zooming in; a large-area search outside gets the outside
  message instead of "search inside it"; `postSighting` refuses points outside. Home and work
  aren't limited (device only). Checked: the app's decoder agrees with a reference checker at
  20,000 random border points; browser (`area/check-area.mjs`) 19/19 on desktop and on a phone
  (Tijuana, Pago Pago refused; San Ysidro pinned; a tap 150 m into Mexico moved north into the
  U.S.; Beijing and a Tijuana search refused; San Juan, PR opens the form; a tampered post with
  Tijuana's coordinates refused by the server, nothing inserted; the outline not downloaded until
  the first pin); report flows 26/26 and 25/25, pin checks 16/16, regression 10/10, saved places
  39/39.
- **Follow-up: the map stays on the covered places.** A single box can't hold Guam and Saipan with
  the rest (they're across the 180th meridian), so the rule is the user's other idea: at least 10%
  of the visible map (inside `mapPadding()`, so not under the panel or a card; the whole map when a
  sheet leaves less than 40% of either side) must show the covered places. The check samples the
  view on an 8x8 grid against `lib/service-area.json` (about 0.02 ms, with edges indexed by
  0.1-degree bands of latitude), so it runs on every `move`, keeps the last view that had enough,
  and at `moveend` glides back to it (once per move; mid-zoom `move` events are skipped). The
  outline now loads once the map has started, not at the first pin: a 1 km version (11 KB gzipped)
  misjudged street-level views at the border on phones. minZoom stays 9. The search asks for us,
  pr, vi, gu and mp and drops results outside the outline (Nominatim files American Samoa under
  us). "Show where I am" from outside says so and doesn't move the map, and the first fix doesn't
  auto-center there. Checked (`area/check-map-limit.mjs`, 10/10 on desktop and on a phone): three
  screens out to sea from Atlantic City and three screens into Manitoba from Pembina glide back to
  the coast or border (on desktop the coast stops beside the panel, not under it); dragging over
  land is unchanged; a jump to Guam stays, one to American Samoa doesn't; locate from Beijing shows
  the message and the map stays, from Philadelphia it centers as before. Real searches: San Juan
  PR, Hagåtña, Charlotte Amalie and Saipan are found, Pago Pago isn't, and "Tijuana" or "Toronto"
  only match U.S. places.

## Sources

- [CARTO basemap terms](https://carto.com/legal/basemap-terms/) and [CARTO basemaps FAQ](https://docs.carto.com/faqs/carto-basemaps)
- [Overpass API usage limits (OSM wiki)](https://wiki.openstreetmap.org/wiki/Overpass_API) and [Overpass API user's manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
