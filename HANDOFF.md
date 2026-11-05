# Handoff: ICEPik map
Work branch `claude/icepik-map-handoff-9xy8qz` (jmelv-git/icepik, same commit as fork `main`), last commit 802a3ec "Show the dark-text logo in light high contrast mode", written 2026-11-05. Previous handoff: `claude/handoff-icepik-map`.

## Goal
ICEPik is a Next.js 16 + Leaflet + Supabase app for reporting ICE sightings in Philadelphia. Work goes to the fork jmelv-git/icepik. The user opens PRs into nthanvii/icepik, which Vercel deploys to icepik.vercel.app. We are polishing it for a presentation by fixing open UI and accessibility problems the user picks by ID.

## Status
- [checked] Nine UX changes are merged upstream (nthanvii PR #9); see `PLAN.md`. Dark-map label fix 962528a is merged (PR #10).
- [checked] Logo and icons (db74c44, 802a3ec) are on fork `main`; the user still has to open that PR.
- [checked] No WIP commit and nothing running.
- [from memory] 25 open problems, each reconfirmed on 962528a:
  - **Search:** S1 late results after emptying the box. S2 Escape while "Searching…". S3 Escape on a result drops focus. S4 one Escape also cancels placing Home.
  - **Keyboard:** P2 Enter/Space on a focused pin does nothing. P3 pin focus lost on the 15 s refresh. P4 rows never toggle off. P16 focus lost after a mouse pick of a result. P17 phone Tab reaches buttons behind the panel. P19 the same place isn't re-announced. P20 keyboard search hides the selected pin.
  - **Layout:** P5 credit links blocked at 280 px. P9 panel padding blocks the map. P11/P12 long label under the panel or buttons. P15 bad coordinates keep the old place. P21 sideways card is 98 px tall. P23 Know Your Rights scrolls at 568×320. R7 sideways banner hides the searched place.
  - **Side effects:** E1 map stays moved after the card closes. E2 saved place with a card open zooms out. E3 rotating leaves the pin off screen.
  - **Smaller:** M1 "+" not disabled at zoom 18. M2 group card covers its cluster. M4 credit focus ring clipped.

## Key decisions
- nthanvii's restyle (PR #8) is the base design, with our features inside it.
- Location is asked when the map opens (the user's choice). One terms bullet; `POLICY_VERSION` is `2026-11-04b-draft`. Bump it on any terms change.
- Dark map: `DarkMatterNoLabels` plus `DarkMatterOnlyLabels`, lightened by `.map-labels { filter: brightness(2.6) }`, which doubles tile requests.
- Faithful SVG logos; `app/_components/brand-logo.tsx` uses the dark-text one in light forced colors.
- Search stays on Enter: Nominatim forbids autocomplete.

## Avoid
- Never commit or print `NEXT_PUBLIC_CARTO_KEY`. It is in the environment variables, Vercel and `.env.local`.
- Don't proxy or cache CARTO tiles, and don't copy Stadia's style.
- Follow `docs/database-handoff.md`: no coordinates or IDs in URLs; position and places stay on the device.
- Ask before adding dependencies or services, loosening the CSP in `proxy.ts`, or editing `app/_components/policy.tsx`.
- Push fork `main` only on the user's OK. nthanvii/icepik can't be attached, so give the user https://github.com/nthanvii/icepik/compare/main...jmelv-git:icepik:main plus a title and description.
- Never create a production anonymous account; test against the fake Supabase.
- Brightening the whole dark layer failed (labels reached about 2.4:1).
- No model IDs in commits or PRs. Keep HANDOFF.md and QUESTIONS.md off the work branch.

## Open questions and blockers
- Waiting on the user: which IDs to fix next (suggested: P2, P3, E1).
- Waiting on the user: search on Enter, or a type-ahead provider such as Photon.
- Not tested: real phones, real screen readers, a real Supabase project, and whether Vercel has `NEXT_PUBLIC_CARTO_KEY`.

## Next step
Ask the user which IDs to fix. For P2, add an Enter/Space keydown to the pin markers in `pinMarker()` in `app/_components/sightings-map.tsx` that calls `latest.current.onSelect`.

Then:
1. Run the fake Supabase from the `PLAN.md` appendix (`MOCK_COUNT=10 node mock-supabase.js`). Build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key npx next build`, then serve with `npx next start -p 3000`. Playwright is preinstalled; scroll `.consent-text` to the end before "I agree".
2. Fix, run `npx tsc --noEmit`, `npx eslint` and `npx next build`, check in a browser, and push the work branch.
3. On the user's OK, fast-forward fork `main` and give the PR text.
