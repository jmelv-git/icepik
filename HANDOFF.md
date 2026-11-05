# Handoff: ICEPik map
Work branch `claude/icepik-map-handoff-9xy8qz` (jmelv-git/icepik), last commit 802a3ec "Show the dark-text logo in light high contrast mode", written 2026-11-05. The fork's `main` is the same commit. Previous handoff: `claude/handoff-icepik-map`.

## Goal
ICEPik is a Next.js 16 + Leaflet + Supabase app for reporting ICE sightings in Philadelphia. Work goes to the fork jmelv-git/icepik. The user opens PRs into nthanvii/icepik, which Vercel deploys to icepik.vercel.app. We are polishing it for a product presentation by fixing open UI and accessibility problems that the user picks by ID.

## Status
- [checked] Nine UX changes are merged upstream as nthanvii PR #9: location asked on map open, blue dot, re-center, saved-place badges, custom named places, sticky Back, "I agree" after reading, dark map, terms bullet. Details are in `PLAN.md` on the work branch.
- [checked] Readable dark-map labels (962528a) are merged upstream as PR #10.
- [checked] The SVG logo and app icons (db74c44, 802a3ec) are on fork `main`, but not on nthanvii `main` as of the last fetch. The user opens that PR.
- [checked] No WIP commit, no uncommitted changes, nothing running.
- [from memory] 25 problems are still open; each was reconfirmed on 962528a. The IDs are the ones the user knows:
  - **Search:** S1 late results after emptying the box. S2 Escape while "Searching…". S3 Escape on a result drops focus. S4 one Escape ends the search and also cancels placing Home.
  - **Keyboard:** P2 Enter/Space on a focused pin does nothing. P3 pin focus is lost on the 15 s refresh. P4 selected rows never toggle off. P16 focus is lost after a mouse pick of a result. P17 phone Tab reaches buttons behind the open panel. P19 the same place isn't re-announced. P20 a keyboard search hides the selected pin while its card stays open.
  - **Layout:** P5 at 280 px, credit links blocked by the panel. P9 panel padding blocks the map. P11 long label under the panel at 900×600. P12 long label under the map buttons at 320 px. P15 bad-coordinate result leaves the old place marked. P21 sideways card is 98 px tall. P23 Know Your Rights scrolls at 568×320. R7 sideways report banner hides the searched place.
  - **Side effects:** E1 the map stays moved after the card closes. E2 a saved place with a card open zooms out to 11. E3 rotating leaves the pin off screen.
  - **Smaller:** M1 "+" not disabled at zoom 18. M2 group card covers its cluster. M4 credit focus ring clipped. M3 is fixed.

## Key decisions
- nthanvii's restyle (PR #8) is the base design; our features live inside it, e.g. their "Show where I am" button runs `useMyPosition`.
- Location is asked when the map opens (the user's choice). The terms have one location bullet, and `POLICY_VERSION` is `2026-11-04b-draft`. Bump it whenever the terms text changes.
- Dark map uses `CartoDB.DarkMatterNoLabels` plus `DarkMatterOnlyLabels` in a "labels" pane, with `.map-labels { filter: brightness(2.6) }`, giving 6:1 to 8:1 contrast. It doubles dark tile requests.
- Logos: "faithful" SVGs, the user's preference. `app/_components/brand-logo.tsx` switches to the dark-text version only in light forced colors.
- Search stays on Enter: Nominatim's policy forbids autocomplete.
- Map buttons form a row at the bottom left on phones held sideways, and are hidden and inert while a card covers them.

## Avoid
- Never commit or print `NEXT_PUBLIC_CARTO_KEY`. It is in the environment variables, in Vercel and in the user's `.env.local`.
- Don't proxy or cache CARTO tiles, and don't copy Stadia's Alidade Smooth style; both providers' terms forbid it.
- Follow the privacy rules in `docs/database-handoff.md`: the position and saved places stay on the device, with no coordinates or IDs in URLs.
- Ask before adding a dependency or outside service, weakening the CSP in `proxy.ts`, or editing the terms in `app/_components/policy.tsx`.
- Push to fork `main` only when the user says so. nthanvii/icepik can't be attached to a session, so give the user https://github.com/nthanvii/icepik/compare/main...jmelv-git:icepik:main plus a PR title and description.
- Never create a production anonymous account on the live site; test against the fake Supabase.
- Brightening the whole Dark Matter layer failed: labels only reached about 2.4:1.
- No model IDs in commits or PRs. Keep HANDOFF.md and QUESTIONS.md off the work branch.

## Open questions and blockers
- Waiting on the user: which IDs to fix next. The suggestion was P2, P3 and E1.
- Waiting on the user: whether to keep search on Enter or approve a type-ahead provider such as Photon.
- Not tested yet: real phones, real screen readers, a real Supabase project.
- Unverified: whether Vercel has `NEXT_PUBLIC_CARTO_KEY` for Production and Preview.

## Next step
Ask the user which IDs to fix. For P2, pins are Leaflet `divIcon` markers built in `pinMarker()` in `app/_components/sightings-map.tsx`; add an Enter/Space keydown that calls `latest.current.onSelect`.

Then:
1. Recreate the test harness: save the fake Supabase from the appendix of `PLAN.md`, run it with `MOCK_COUNT=10 node mock-supabase.js`, then build and start the app:
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key npx next build`
   then `npx next start -p 3000` with the same variables. Playwright is preinstalled. Scroll `.consent-text` to the end before clicking "I agree".
2. Fix, run `npx tsc --noEmit`, `npx eslint` and `npx next build`, check in a browser, and push to the work branch.
3. On the user's OK, fast-forward fork `main` and give the PR text.
