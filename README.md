# ICEPik

ICEPik is a map where immigrants in Philadelphia can view ICE sightings and report them anonymously. Other users can then help verify each report. We're building it because ICE alerts spread through family group chats today, and as one person we interviewed put it, "The group chat is fast, but it can't tell you if what someone saw is real."

**Live site:** https://icepik.vercel.app

---

## 1. Where does the code live?

On GitHub, in [nthanvii/icepik](https://github.com/nthanvii/icepik). Vercel deploys the live site from this repo's `main` branch. Juan works in a fork, [jmelv-git/icepik](https://github.com/jmelv-git/icepik), and sends changes back as pull requests. `main` on nthanvii/icepik is always the latest version.

It started as Vercel's Next.js and Supabase starter. We then used Claude Code to build our design mockup on top of it, and connected it to the Supabase database our backend developer designed.

- `app/_components/`: the screens, like the map, the report form and Settings.
- `app/actions/sightings.ts`: posting, voting and deleting, which run on the server.
- `app/actions/recovery.ts` and `lib/supabase/admin.ts`: the password reset with a recovery key, the only code that uses Supabase's secret key. The screens for it aren't built yet.
- `lib/`: the Supabase clients and shared code.
- `database/icepik_schema.sql` and `docs/database-handoff.md`: the database and how to set it up.
- `database/migrations/`: upgrades for the live database that keep its data.
- `scripts/supabase-live-checks.mjs`: checks a scratch Supabase project behaves the way the accounts need.

## 2. Where does the data live, and what is stored there right now?

Everything is in Supabase, a database with user accounts built in. The tables and their access rules are in `database/icepik_schema.sql`, and `docs/database-handoff.md` explains them and the Supabase settings they need.

- **Accounts:** everyone gets an anonymous account when they first agree to the terms, with no name, email or phone number. Saving it adds a username and password. Supabase stores passwords in a scrambled form, so nobody can read them, including us. The three email accounts the team made while testing the starter are still there too.
- **Sightings:** each pin's location (rounded to about 100 m), street label, category, counts, description, times, and confirmation and dispute totals. Everyone can see a pin while it's on the map, at least 4 hours. Expired pins stay in the database so we can measure how accurate reports are, but the app can't read them.
- **Who posted or voted on a sighting:** kept in two private tables that only that person can read, and deleted within an hour after the pin expires.
- **Profiles:** each account's language setting, and how many sightings it has posted and votes it has cast in total.

Home and work places stay in the browser and never reach the database. The map pictures come from CARTO and the address search from OpenStreetMap, and we don't store anything from them.

Where the browser has WebGL 2, the map is drawn from CARTO's vector map instead of its pictures, by MapLibre GL, which is bundled from npm like Leaflet. So the Content-Security-Policy's `connect-src` also allows `https://basemaps.cartocdn.com` and `https://tiles.basemaps.cartocdn.com`, for the map's style, tiles, fonts and icons (none of them carry the CARTO key). Without WebGL 2, or if CARTO's vector map can't be loaded, the map shows CARTO's pictures as before.

The site needs these environment variables, in Vercel and (all except `SUPABASE_SECRET_KEY`) in `.env.local` for `npm run dev`:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project's URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key. The older `NEXT_PUBLIC_SUPABASE_ANON_KEY` works too. Never put the secret or `service_role` key here. |
| `NEXT_PUBLIC_CARTO_KEY` | CARTO's free basemap key, from https://carto.com/basemaps/apikey. Without it, every map picture reads "API KEY REQUIRED". |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | The Cloudflare Turnstile site key. CAPTCHA is required in Supabase, with the matching secret key there. Add this key and redeploy before turning CAPTCHA on, or every sign-in fails. A production build stops with an error if it's missing. |
| `SUPABASE_SECRET_KEY` | Supabase's secret key (`sb_secret_…`), used only by the password reset in `app/actions/recovery.ts`. It skips every database rule. Add it in Vercel to the **Production** environment only, with **Sensitive** turned on, never to Preview or Development, and never with a `NEXT_PUBLIC_` name. Never put the production key in `.env.local`: to try the reset locally, use a scratch project's URL and keys. Without the key, the reset says it isn't available. |

Vercel builds these values into the site, so after adding or changing one, redeploy (Deployments > ⋯ > Redeploy). A production build stops with an error if `NEXT_PUBLIC_CARTO_KEY` is missing, so the live map never shows "API KEY REQUIRED".

Anyone can copy the CARTO key from the page, and our free 5 million map tiles a month count across all our keys, so we use two keys:

- **Vercel's Production environment:** a key restricted in CARTO's dashboard to `icepik.vercel.app`. It shows blank map pictures anywhere else.
- **Vercel's Preview environment and `.env.local`:** a second key with no restriction, because preview addresses change with every branch and CARTO doesn't let one key list both `localhost` and public sites. Anyone who gets hold of it can use our tile quota, so we don't share it.

## 3. How does a change get from Claude Code to the live site?

1. We ask Claude Code to make a change in the code.
2. We check it at `localhost:3000` by running `npm run dev`, with the variables from section 2 in `.env.local`.
3. We commit the change to `main` on Juan's fork and open a pull request into nthanvii/icepik.
4. Someone in our Vercel team authorizes the pull request's preview build, a teammate reviews it, and it's merged into `main`.
5. Vercel sees the new commit on `main` and starts a new build on its own.
6. After about a minute the build shows **Ready** in Vercel, and the change is live at https://icepik.vercel.app.

## 4. What will we need to add to turn this into our team's app?

The first version is built:

- **Accounts:** the terms and privacy notice show before anything loads. Agreeing creates an anonymous account, with no sign-up screen. People can save it with a username and password, log in on another phone, or delete it.
- **Live map:** it opens on the whole country and, once you share your location, flies to your city. A new sighting shows up for everyone within a few seconds, without a refresh. Each pin shows whether it's verified, unverified or disputed, how many people confirmed or disputed it, and how long ago it was posted. Pins leave the map after 4 hours, and each confirmation keeps one there for at least 2 more hours.
- **Posting:** place the pin on the map, or search for a place and tap "Submit a report" to start there, then choose what you saw. The pin snaps to the nearest spot on land within 200 m of a road or footpath, so it can't land in water or deep in the woods, and only in the places ICE works (section 6); nothing is sent until "Post sighting". The counts, street names and details are optional, and the street names are suggested for you. If someone already reported a sighting nearby, the form offers to confirm it instead.
- **"Are they still there?":** people within 1 km can confirm or dispute a sighting.
- **Home and work:** saved on the device only, with the number of sightings within 1 mile of each. With a place shown in the search box, "Set on map" puts the pin there and waits for "Save" (a tap moves it), and "Add a place" opens the name form there. On a shared phone, "Clear this device" in Settings deletes them and signs out.
- **Know Your Rights:** links to legal resources.

Before we launch it, we need to:

- run `scripts/supabase-live-checks.mjs` against a scratch Supabase project, before upgrading the live database or merging the recovery-key changes, and stop unless every check passes;
- upgrade the live Supabase project in the order `docs/database-handoff.md` gives under "Existing project": set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel and deploy this app version, then delete or rename the saved accounts whose login ID breaks the username rule (such as the three test email accounts), then run `database/migrations/20261116_recovery_keys.sql` (never the "Starting over" lines in the schema, which delete all pins and votes), then turn on the dashboard settings, with CAPTCHA last;
- add the two CARTO keys to Vercel (see section 2) before the map change is merged. Until then, production builds stop with an error. The keys are free for non-commercial use up to 5 million map tiles a month, and a visit uses about 12 to 90. Above that, CARTO may block the map without notice, so before a wider launch we'll ask support-basemaps@carto.com to raise the limit, which it normally does for free for non-commercial use. CARTO can also withdraw free keys without notice;
- add a rate limit in Vercel's firewall;
- test the handoff's "Done when" list on two real phones;
- have someone review the terms and privacy text, which is a draft.

Still to add:

- **Photos and videos:** a place to store them (Supabase Storage). Before storing a photo, we'll remove the hidden data inside it that can show where it was taken and on what phone.
- **Languages:** a language choice, translated text and a short tutorial on the first visit.
- **A legend** that explains the pin colors.
- **Nearby alerts:** notifications limited to a small area around you. One complaint about the Citizen app was getting alerts from the other side of the country.
- **Reporting harmful posts:** for now, an admin deletes them in Supabase's Table Editor. A report button needs a new table.

Comments are out of scope for this version, as our PRD says.

## 5. Diagram

```mermaid
flowchart LR
    U[Person on a phone or laptop] -->|opens the site, sends posts and votes| V[Vercel<br/>runs the live site]
    U -->|account, pins and live updates| S[Supabase<br/>accounts and database]
    V -->|saves posts and votes| S
    U -->|map pictures| M[CARTO]
    V -->|address search| O[OpenStreetMap]
    CC[Claude Code] -->|commits to main| F[GitHub<br/>Juan's fork]
    F -->|pull request| G[GitHub<br/>nthanvii/icepik]
    G -->|a merge into main starts a build| V
```

Posting, voting on and deleting sightings go through Vercel, so Supabase sees Vercel's IP address for them instead of the person's. Address searches and street-name suggestions go through Vercel too. Signing in, loading pins and loading map pictures go straight from the browser, so Supabase and CARTO see the person's IP address for those.

## 6. Where pins can go

New pins only go where ICE works: the 50 states, DC, Puerto Rico, the U.S. Virgin Islands, Guam and the Northern Mariana Islands. Anywhere else, the app says "Pins can't go here" and places nothing, and the server refuses a sighting posted there. Pins already on the map aren't changed. We checked this in November 2026:

- **That list is the "United States" in immigration law** ([8 U.S.C. 1101(a)(38)](https://www.law.cornell.edu/uscode/text/8/1101)), and ICE's field offices cover every place on it (ICE's [field office list](https://www.ice.gov/contact/ero), updated September 2026). ICE made arrests in every state, DC and Puerto Rico in 2024, 2025 and 2026, and in 2026 also in Guam, Saipan and St. Croix.
- **No state can keep ICE out.** Sanctuary laws only stop state and local police from helping ICE. Courts blocked California's mask ban for federal agents (February 2026) and its agent-ID law (Ninth Circuit, October 2026). Sanctuary states such as California, Illinois, Minnesota and New York had some of the largest operations. Tribal reservations are included too, though some tribes contest ICE entering.
- **Left out:** American Samoa and Swains Island (they run their own immigration system and ICE has no office there; set `INCLUDE_AMERICAN_SAMOA` in `lib/service-area-shape.ts` to `true` if that changes), the uninhabited minor islands (Wake, Midway and others), the base at Guantanamo Bay (in Cuba and closed to the public, though ICE detains people there), and every other country. ICE has investigators in about 50 countries, China included, but they work with local police there and don't make arrests.
- Many agents people report as ICE are Border Patrol or CBP, part of the same department. They work in the same places, so the same area fits.

The map stays on these places too. Some of them always show in the middle of the part of the map you can see (not under the panel or a card): drag out to sea or across a border, and the map glides back until some of the U.S. is there again. That works at every zoom, down to a small island like Guam. The address search only finds places there, and "Show where I am" says so instead of moving the map when you're somewhere else. To reach Guam or Puerto Rico from the mainland, search for a place there.

The outline is `lib/service-area.json`: OpenStreetMap's outline of the United States, which reaches 12 nautical miles out to sea so ports and piers are inside, simplified so no border moves more than 25 m. It's about 95 KB gzipped, and the browser loads it once the map has started, not with the page. Data © OpenStreetMap contributors, under the [ODbL](https://opendatacommons.org/licenses/odbl/). To rebuild it, download `https://polygons.openstreetmap.fr/get_geojson.py?id=148838&params=0` as `osm-148838.geojson`, then run:

```bash
npx mapshaper@0.6.102 osm-148838.geojson -explode -each "$(cat scripts/service-area-pieces.txt)" -filter 'group != "drop"' -split group -dissolve target=* -simplify dp interval=25 keep-shapes -o format=topojson quantization=2000000 target=* lib/service-area.json
```

---

## Screenshots

**Sign-up page on the live site, with the web address showing**
![Sign up page](screenshots/template-sign-up.webp)

**The page we see after logging in**
![Logged in page](screenshots/template-protected-page.webp)

**Our users in Supabase, under Authentication > Users**
![Supabase users](screenshots/supabase-auth-users.webp)

**Vercel showing the deployment is Ready**
![Vercel Ready](screenshots/vercel-project-overview.webp)

**Before our Claude Code changes:** the site was the Next.js Supabase Starter.
![Before](screenshots/template-home.webp)

**After:** it's the ICEPik map, at https://icepik.vercel.app.
![After](screenshots/icepik-map-home.webp)

---

## License

MIT. See [LICENSE](LICENSE). `lib/service-area.json` is OpenStreetMap data, © OpenStreetMap contributors, under the [ODbL](https://opendatacommons.org/licenses/odbl/).
