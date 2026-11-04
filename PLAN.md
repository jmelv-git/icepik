# Plan: nine UX changes for the presentation

Session 1 wrote this plan and changed nothing else. Session 2 carries it out: tick each box below as soon
as that change is verified in a real browser, then commit and push (with PLAN.md) so a cut-short session
can resume at the first unticked box. Where the code doesn't match this plan, follow the code and note the
difference under "Notes from session 2" at the end.

## Checklist

- [x] 2. Terms and Privacy paragraph about location (policy.tsx, one paragraph only)
- [x] 8. Agree button disabled until the terms are read to the end
- [x] 7. Sticky Back button on the Terms and Privacy card in Settings
- [x] 1. Location access at the start, with the answer remembered on the device
- [x] 3. Blue dot at the user's position
- [x] 4. Re-center button
- [x] 5. Map icons for saved locations (home, work, custom)
- [x] 6. Custom saved locations (add, name, delete, localStorage only)
- [x] 9. Dark map with CartoDB.DarkMatter, switching live
- [ ] Regression pass: every pin and cluster type, map credit at phone width, `npx tsc --noEmit`, `npx eslint`, `npx next build`
- [ ] Final report (prose, as the prompt asks)

## Order and why

2 → 8 → 7 → 1 → 3 → 4 → 5 → 6 → 9 → regressions → report.

- 2 first: it lengthens the agreement text, which change 8's scroll check depends on.
- 8 next: every browser test starts at the consent screen, so the test helper must learn to scroll the
  terms before tapping "I agree" (see Verification setup).
- 1 → 3 → 4 build on each other (permission, then the dot, then centering on it).
- 5 before 6: custom places reuse the generic "saved place" icon.
- 9 last: it restyles the map, so it is checked against every marker added by 3, 5 and 6.

## Stop conditions found while reading (none blocks the work)

- **Permissions-Policy** (`proxy.ts` line 50) is `camera=(), microphone=(), geolocation=(self)`, which
  already allows geolocation on this site. No header change needed. If a test still shows geolocation
  blocked, stop and ask.
- **Content-Security-Policy** (`proxy.ts`): `img-src` already allows `https://*.basemaps.cartocdn.com`,
  and leaflet-providers' `CartoDB.DarkMatter` (variant `dark_all`) uses the same hosts and key. No CSP
  change needed. Geolocation needs no CSP change.
- **No new dependencies**: everything below uses browser APIs (Geolocation, Permissions,
  IntersectionObserver, matchMedia, localStorage, `crypto.randomUUID`) and the existing Leaflet and
  leaflet-providers.
- **policy.tsx** may only gain the one paragraph of change 2. Two things in that file will then be out of
  date, and changing them needs the user's OK (put both in the final report, don't edit them):
  - the existing bullet "Your location is used only when you confirm or dispute a sighting … It isn't
    stored. Home and work places stay on this device." (the word "only" becomes wrong);
  - `POLICY_VERSION`, which the file says to change whenever the text changes so everyone agrees again.
- **CARTO key**: read only from `NEXT_PUBLIC_CARTO_KEY` at build time. Never print it. Tile URLs contain
  it, so tests log only status codes, zoom levels and the style segment (`light_all` / `dark_all`), never
  URLs, headers or page HTML.

## Privacy rules that apply (docs/database-handoff.md, "Protect people's locations")

- The device position is sent only with a vote (`vote_on_sighting()`), "and nowhere else: no caching,
  logs, analytics or crash reports". So the blue-dot position lives in React state (memory) only. It is
  never stored, never sent to Supabase or `/api/search`, never logged, never in a URL.
- Saved places (home, work and now custom ones) stay in localStorage only, never cookies, never sent.
  Custom place names may be sensitive ("Mom's house"): treat them like coordinates.
- No coordinates or ids in page URLs, query strings or hashes.
- "Clear this device" must also clear the new keys (custom places, remembered location answer).

## The changes

### 2. Terms and Privacy paragraph
- **File**: `app/_components/policy.tsx`: add one `<li>` in the Privacy list, after the existing
  location bullet. Nothing else in the file changes.
- **Draft text** (refine in session 2, keep it this short):
  "**Your location on the map.** When you first open the map, ICEPik asks your browser for your location
  so it can show where you are as a blue dot and center the map there. You can say no and the map still
  works. Your position stays on this device: it isn't sent to ICEPik, stored or shared. Places you save
  stay on this device too."
- **Verify**: the paragraph shows on the consent screen and in Settings → Terms and privacy (Playwright
  text check plus screenshot). Quote the final text in the report.

### 8. Agree button after reading
- **Files**: `app/_components/consent-screen.tsx`, `app/globals.css`.
- **Change**: a sentinel element at the end of the text inside `.consent-text`, watched with an
  IntersectionObserver (root `null`, so it works whether the text box or the whole page scrolls on small
  phones). While it hasn't been seen, the button keeps `aria-disabled="true"` (not `disabled`, so it stays
  focusable and in the accessibility tree), ignores clicks, and has `aria-describedby` pointing at a
  visible note: "Scroll to the end of the terms to agree." When the sentinel is seen once, enable the
  button and hide the note. If the text fits without scrolling, the observer fires at once and the button
  starts enabled. The `.consent-text` box is already focusable (`tabIndex={0}`), so keyboard users can
  scroll it with the arrow keys. Style `[aria-disabled="true"]` on `.primary-button` (dimmed,
  `cursor: not-allowed`) to match the design.
- **Verify** (375x667, 320x568, 1280x800, and a tall window where the text fits): before scrolling, Tab
  reaches "I agree"; it is in the accessibility tree as a disabled button whose description is the note
  (`getByRole('button', { name: 'I agree' })`, `toBeDisabled()`, `toHaveAccessibleDescription`); clicking
  it does nothing. After scrolling the text to the end (mouse wheel and keyboard End/PageDown), it is
  enabled and agreeing works. In the tall window it is enabled from the start.

### 7. Sticky Back button
- **Files**: `app/_components/settings-dialog.tsx` (the `view === "policy"` block, about line 64),
  `app/globals.css`.
- **Change**: `.modal` is the scroll container (`overflow-y: auto`). Give the policy view's Back row a
  class (e.g. `sticky-actions`) with `position: sticky; bottom: 0`, the surface background and a soft top
  edge, so the existing Back button stays in view from the first line to the last. Check it doesn't cover
  the last line of text (bottom padding).
- **Verify** at 375x667 and 1280x800: open Settings → Terms and privacy, scroll to the top, middle and
  bottom; at each point `elementFromPoint` at the Back button's centre is the button and clicking it
  returns to the settings page. Screenshots mid-scroll.

### 1. Location access at the start
- **Files**: `lib/device-storage.ts` (new key `icepik.location`, values `"granted" | "denied" |
  "unavailable"`, a `useLocationAnswer()` hook and a setter, cleared by `clearDeviceStorage`), a small
  hook for the position (e.g. `lib/use-my-position.ts`), `app/_components/map-app.tsx`,
  `app/globals.css`.
- **Change**: once the map opens (after consent, so nothing is asked before the terms are agreed), if no
  answer is stored, show one short line in the notice style, e.g. "ICEPik asks for your location to show
  where you are and center the map. It stays on this device.", and call `navigator.geolocation
  .watchPosition` (which shows the browser's prompt). On the first fix: store "granted", hide the line,
  center the map on the position once (only if the person hasn't moved the map or opened a sighting
  yet). On error: code 1 stores "denied", codes 2 and 3 store "unavailable"; stop watching, hide the
  line, and the map works as before. On later loads: if "granted" and `navigator.permissions` still says
  granted, start watching silently; if "denied"/"unavailable", don't ask. Keep the position in memory
  only. Reuse the pattern of `currentPosition()` in `sighting-card.tsx`.
- **Stop condition**: the Permissions-Policy already allows it (see above).
- **Verify**: Playwright context with `permissions: ['geolocation']` and `geolocation: {...}` (granted)
  and one without the grant (denied): the line shows on the first visit only; after a reload neither the
  line nor a new request appears (count `getCurrentPosition`/`watchPosition` calls with an init script);
  with "denied" the map, search, pins and REPORT all still work; localStorage holds only the answer, no
  coordinates; network log shows no request carrying the position.

### 3. Blue dot
- **Files**: `app/_components/sightings-map.tsx` (new prop `myPosition`), `app/_components/map-pins.ts`
  (markup), `app/globals.css`.
- **Change**: a non-interactive Leaflet marker (`interactive: false`, `keyboard: false`) in its own pane
  just below the sighting pins (marker pane is 600, search pane 550: use about 560), plus a faint
  accuracy circle when the accuracy is useful. Moved with `setLatLng` on every watch update. Classic
  "you are here" look: a round blue dot (a stronger blue than `--blue`) with a thick white ring and soft
  shadow. It must not pass for the new-report pin, which is also blue (`DRAFT_PIN_MARKUP`, `#4f93c8`) but
  a teardrop with a "+"; the dot is a circle, not a pin. `role="img"`, `aria-label="Your location"`.
- **Verify**: dot appears at the granted position; `context.setGeolocation` to a new point moves it;
  screenshot next to a verified, unverified, disputed, selected and draft pin, a cluster and the searched
  label, at phone and desktop, light (and dark after change 9).

### 4. Re-center button
- **Files**: `app/_components/map-app.tsx` (button + handler), `app/_components/sightings-map.tsx`
  (`MapApi.centerOn(point)`), `app/globals.css`, `app/_components/icons.tsx` (a crosshair icon, same
  style as the others).
- **Change**: a real `<button>` styled like the zoom buttons, stacked just above the zoom control (bottom
  right), `aria-label="Center the map on my location"`, reachable with Tab. With a position: pan/zoom to
  it (zoom at least 15). Without one: if the permission is still "prompt", ask (the tap is a user
  gesture); if denied or unavailable, show a notice explaining why, e.g. "ICEPik can't see your location.
  Allow location for this site in your browser settings, then try again." Never do nothing.
- **Watch out**: on phones the zoom control sits under the open sighting card at 320x568 and 375x667
  (older problem), and `phonePadding()` in map-app.tsx avoids the zoom control's box. Re-measure so the
  new button doesn't overlap REPORT, the credits or the P1 pin space; include it in `phonePadding` if it
  sits in the same column.
- **Verify**: granted: after panning away, the button (by click and by keyboard Enter) brings the dot to
  the centre. Denied: the notice appears and the map doesn't move. Tab order, accessible name, focus ring
  visible (not clipped like the zoom buttons' ring). Phone and desktop screenshots.

### 5. Saved-location icons
- **Files**: `app/_components/map-pins.ts` (`savedPlaceMarkup(kind: "home" | "work" | "custom")`),
  `app/_components/sightings-map.tsx` (new prop for saved places, own layer and pane below the pins),
  `app/_components/map-app.tsx` (pass them), `app/globals.css`.
- **Change**: saved places aren't drawn on the map today. Draw each as a divIcon in the pins' style (rem
  sizes, white rim, the same drop shadow) but a different shape from the teardrop sighting pins: a round
  or rounded-square badge in the dark surface colour with a white glyph. Glyphs: the house and briefcase
  from `PlaceIcon` in `icons.tsx` for the existing `PlaceName` types `"home" | "work"`, and one generic
  "saved place" glyph (star or bookmark) for every custom place. Non-interactive, `role="img"`,
  `aria-label` like "Home, saved on this device".
- **Verify**: set home and work (Settings → Set on map) and one custom place; each shows its own icon at
  its spot; screenshot next to every sighting pin type and the blue dot; they're distinct by shape, not
  only colour.

### 6. Custom saved locations
- **Files**: `lib/device-storage.ts` (key `icepik.custom-places`, type `CustomPlace = { id, name, lat,
  lng }`, `useCustomPlaces()`, `addCustomPlace()` returning `false` when it couldn't be saved,
  `removeCustomPlace(id)`; parse defensively; cap the name length and the count), `map-app.tsx`,
  `settings-dialog.tsx`, `app/globals.css`.
- **Storage check**: the existing `write()` swallows errors. Add a checked write that catches the
  exception and reads the value back (as `acceptPolicy` already does), so "full or blocked" is detected.
- **Adding**: (a) Settings → Your places → "Add a place" starts a new picking mode (`Picking` gains
  `"custom"`), the existing pick banner says "Tap the place on the map", and the tap opens a small naming
  form (name input, Save, Cancel) in the banner's style; (b) after choosing a search result, a "Save this
  place" button next to the search box's Clear button opens the same form, prefilled with
  `shortPlaceName(label)`. Coordinates rounded to 4 decimals like home and work.
- **Showing and deleting**: custom places appear in Settings → Your places (generic icon, name, nearby
  count, Show, Delete) and in the panel's "Your places" card (Show), and on the map (change 5).
- **Errors**: if saving fails, notice "Couldn't save this place on this device. Your browser's storage is
  full or blocked." and the page keeps working.
- **Verify**: add by map tap and by search result; reload, still there; delete, gone after reload;
  storage blocked (`addInitScript` making `localStorage.setItem` throw `QuotaExceededError`) shows the
  message and the map still works; "Clear this device" removes them; network log shows no request with
  a place name or its coordinates.

### 9. Dark map
- **Files**: `app/_components/sightings-map.tsx`, `app/globals.css`.
- **Change**: pick `CartoDB.Positron` or `CartoDB.DarkMatter` from
  `matchMedia("(prefers-color-scheme: dark)")`, with the same key and `maxNativeZoom: MAX_ZOOM`; on the
  media query's `change` event swap the layer live. Put a class (e.g. `map-dark`) on the map container
  for CSS: a dark container background so loading doesn't flash white, and readable overlays.
- **Things to restyle or check in dark**: the "Searched:" label is a dark pill with a dark pointer and
  keeps its colours even in forced-colours mode, so on DarkMatter both would vanish: give it a light
  version under `.map-dark` (this also covers forced colours with a dark scheme). Check the disputed grey
  pin, clusters, the blue dot, saved-place badges, the draft pin, zoom and re-center buttons, the pick
  banner and the map credit. The app has no Leaflet popups as far as I saw; confirm with a grep and
  say so in the report.
- **Verify**: Playwright `colorScheme: 'dark'` loads `dark_all` tiles (count by style segment only);
  `page.emulateMedia({ colorScheme: 'dark' })` and back switches live without reload; screenshots of every
  marker type and the controls in both schemes, plus contrast samples for the searched label's pointer
  and the credit text.

## Verification setup (session 2)

- **AGENTS.md**: this Next.js differs from what you know. These changes touch client components and CSS
  only; if any Next.js API is needed, read `node_modules/next/dist/docs/` first.
- **Build**: production build so the dev badge doesn't show:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key npx next build`,
  then `npx next start -p 3000` with the same variables, in the background with a long timeout (2 h
  maximum; restart if it's stopped). The CARTO key is read from the environment by the build.
- **Data**: without Supabase settings the app shows the map with a "not connected" note, enough for the
  consent screen, map, buttons, dark map and location checks. For pins, there is no Supabase project or
  CLI here, so use the fake Supabase in the appendix (fixture sightings over plain HTTP on port 54321).
  Say in the report that pin checks ran against fixtures from a fake Supabase, not a real project.
- **Playwright**: `require('playwright')`, `chromium.launch()` (preinstalled; don't install). Screenshots
  for the user at `deviceScaleFactor: 2`. Geolocation: `browser.newContext({ permissions:
  ['geolocation'], geolocation: { latitude: 39.9526, longitude: -75.1652 } })`, move with
  `context.setGeolocation`; denied = no grant. Dark: `colorScheme: 'dark'`. Search: mock
  `page.route('**/api/search', …)`. After change 8 the consent helper must scroll `.consent-text` to the
  end before clicking "I agree".
- **Sizes**: 320x568, 375x667, 390x844, 667x375, 1280x800.
- **Branch**: work on `claude/icepik-map-handoff-9xy8qz`. It already holds the four presentation fixes
  (commits e7e39c7, dd9c4d8), which are not on `main` yet: don't merge to `main` without the user's OK.

## Final report (prose)

For each change: passed or not, and how it was checked. The paragraph added to policy.tsx, quoted. What
couldn't be verified and why (at least: real Supabase, real devices, real Windows contrast themes). The
policy.tsx follow-ups that need approval (the "only" bullet and `POLICY_VERSION`). Last, the two search
options: keep search on Enter (no policy problems), or switch to a type-ahead provider such as Photon (a
new outside service: needs the user's approval and updates to the README and docs/database-handoff.md;
because search runs through the server route, the provider wouldn't see visitors' IP addresses).
Autocomplete must not be built on Nominatim: its usage policy forbids it.

## Appendix: fake Supabase for local pin checks

Save as `mock-supabase.js` in the session's scratchpad and run `node mock-supabase.js` (port 54321).

```js
// Fake Supabase for local UI testing: fixture sightings, fake anonymous sign-up.
const http = require('http');
const PORT = Number(process.env.MOCK_PORT || 54321);
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const C = [39.9526, -75.1652];
const base = (i, o) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  agent_count: 2, vehicle_count: 1, category: 'patrol', confirm_count: 0, dispute_count: 0,
  created_at: iso(now - i * 7 * 60000), description: 'Fixture sighting', expires_at: iso(now + 6 * 3600000),
  lat: C[0], lng: C[1], location_label: `Fixture street ${i}`, verification_score: null,
  verification_status: 'unverified', ...o,
});
const N = Number(process.env.MOCK_COUNT || 8);
const spots = [
  [39.9526, -75.1652, 'verified', 'Market Street & 15th'],
  [39.9580, -75.1580, 'unverified', 'Spring Garden Street'],
  [39.9450, -75.1550, 'disputed', 'South 9th Street'],
  [39.9620, -75.1720, 'unverified', 'Fairmount Avenue'],
  [39.9400, -75.1750, 'verified', 'Washington Avenue'],
  [39.9500, -75.1450, 'unverified', 'Chestnut Street & 3rd'],
  [39.9700, -75.1500, 'disputed', 'Girard Avenue'],
  [39.9350, -75.1600, 'unverified', 'Passyunk Avenue'],
  [39.9528, -75.1648, 'unverified', 'Market Street & 15th (2)'],
  [39.9480, -75.1900, 'unverified', 'University City'],
];
const rows = spots.slice(0, N).map(([lat, lng, s, label], i) => base(i + 1, { lat, lng, verification_status: s, location_label: label }));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const userId = '11111111-1111-4111-8111-111111111111';
const exp = Math.floor(now / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: true, iss: `http://127.0.0.1:${PORT}/auth/v1` })}.sig`;
const user = { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [], created_at: iso(now) };
const session = { access_token: jwt, refresh_token: 'refresh', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  const url = new URL(req.url, 'http://x');
  let body = '[]', status = 200;
  if (url.pathname === '/rest/v1/sightings') body = JSON.stringify(rows);
  else if (url.pathname.startsWith('/rest/v1/')) body = '[]';
  else if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/token') body = JSON.stringify(session);
  else if (url.pathname === '/auth/v1/user') body = JSON.stringify(user);
  else if (url.pathname.includes('jwks')) body = JSON.stringify({ keys: [] });
  else { status = 404; body = '{}'; }
  res.writeHead(status, h); res.end(body);
}).listen(PORT, () => console.log('mock supabase on', PORT, 'rows', rows.length));
```

Set `MOCK_COUNT=10` to add a second Market Street sighting at almost the same spot, which forms a cluster.

## Notes from session 2

- Session 2 scripts and screenshots: `<scratchpad>/ux9/` (`lib.js` has the shared Playwright helpers,
  `check-*.js` one script per group of changes, `shots/` the screenshots).
- Change 8: the IntersectionObserver's root is the terms box itself, not the page, so "fits without
  scrolling" means the text fits in its box. Verified at 375x667, 320x568, 1280x800 (disabled first,
  Tab reaches it in 2 presses, the accessibility tree reports disabled with the note as its
  description, an early click does nothing, End in the box enables it) and at 1280x2600 (enabled from
  the start).
- Change 7: the bar sticks with `bottom: -1.75rem` (Chrome sticks to the scrollport edge, ignoring the
  dialog's padding). Verified at 375x667 and 1280x800: the Back button is the topmost element at its
  centre at top, middle and bottom scroll, the last line ends above the bar, and Back returns to
  Settings.
- Change 1: the "asks for your location" line shows only when the browser will really ask (status
  "asking"); when location is already allowed the hook uses a separate "finding" status and shows
  nothing. Verified granted (1280x800, 375x667), denied (both) and unavailable (375x667): line then
  request on the first visit; answer stored; no line and no request after a reload; map, search and
  REPORT work when denied; no coordinates in localStorage or any request.
- Change 3: the plan put the dot below the pins, but a pin could then hide it completely (seen at
  375x667). The dot's pane is now above the marker pane (610); it is non-interactive, so taps reach the
  pin under it. The accuracy circle has its own pane below the pins (545) and is hidden when accuracy
  is worse than 1.5 km.
- Change 4: the button is a Leaflet control holding a real `<button>`, stacked above the zoom buttons,
  with an inset focus ring (an outline would be clipped like the zoom buttons'). It centers the dot in
  the middle of the map area left uncovered by the panel or card (`MapApi.centerOn` with `mapPadding()`).
- Change 3 re-checked at 375x667 and 1280x800 with the position on the South 9th Street pin: the dot
  draws above the pin, and the topmost element under the dot's centre is still the pin, so taps reach it.
- Change 5: badges are dark rounded squares with a white edge and a white glyph (house, briefcase, star),
  centred on the spot, in their own pane (540) under the searched label, the dot and the pins. A place
  being named shows a dashed badge.
- Change 6: `write()` in device-storage now reports whether the value was stored (it reads it back),
  so home and work also say when they couldn't be saved. Custom places are capped at 25, names at 40
  characters, coordinates rounded to 4 decimals like home and work. Adding: Settings → Saved places →
  "Add a place", then tap the map; or the star button that appears in the search box after choosing a
  result. Both open a naming form where the pick banner sits. Verified at 375x667 and 1280x800 (add by
  tap and by search, Escape cancels, survives reload, Settings lists and deletes, "Clear this device"
  removes every `icepik.*` key), storage full at 375x667 (message shown, page still works), and no
  request carried a name or coordinates.
- Change 9: the styles in dark mode use a `prefers-color-scheme: dark` media query (no class on the map),
  so CSS and tiles switch together. On a live switch the new tile layer is added on top and the old one
  removed once the new one has loaded, so the map never flashes empty. The app has no Leaflet popups.
  Verified at 1280x800, 375x667 and 320x568 in dark: only `dark_all` tiles, every marker type present,
  map credit visible and dark (text 9.7:1, links 8.7:1), searched label light (text 14.8:1, pointer
  13.6:1 on dark tiles); switching to light and back live leaves one tile layer showing the right style,
  with no reload and no page errors.
- Regression pass, part 1 (commit eaa331e): `npx tsc --noEmit` exit 0, `npx eslint` exit 0,
  `npx next build` exit 0. Part 2: four independent reviewers (one per group of changes) test the
  build on port 3000 against the pre-change build (dd9c4d8) on port 3001, including every pin and
  cluster type in light and dark and the map credit at phone widths; their scripts and screenshots go
  to `<scratchpad>/ux9/review/`.

## Merge with nthanvii's restyle (PR #8 on nthanvii/icepik)

- nthanvii merged a restyle of the UI around the map (new rail, "Nearby reports" panel, Know Your
  Rights card, search box, "Submit a report" button, their own find-me and zoom buttons). Merged into
  this branch, taking their design and moving this branch's work into it: their find-me button
  ("Show where I am") runs `centerOnMe` (blue dot, remembered answer, centering in the free part of
  the map); their zoom buttons replace Leaflet's and my re-center control; custom places appear in
  their "Your places" card; the save star sits in their search box; `phonePadding` avoids
  `.map-controls`.
- Colour and focus checks on the merged UI (`<scratchpad>/ux9/contrast-audit.js`, `focus-check.js`;
  phone and desktop, light and dark; terms, panel, card, search, Settings, Know Your Rights, pick
  banner, report form): one failure, "Submit a report" white on #f0313d at 4.0:1, fixed with
  --red-strong (4.8:1); focus rings on report rows and "Your places" rows were clipped, now drawn
  inside the row; their zoom group clipped its focus ring, now inset. After the fixes: 0 contrast
  failures in 1066 text and icon instances. Location (granted, denied, unavailable), saved places, the
  dark map and P1 re-verified on the merged build.
- Resolved with the user: keep change 1 (ask when the map opens). nthanvii's "used only when you ask
  for it" bullet and this branch's paragraph are replaced by one bullet that matches the app, and
  `POLICY_VERSION` is now "2026-11-04b-draft", so everyone is asked to agree again.
