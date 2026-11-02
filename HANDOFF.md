# Handoff: ICEPik map and contrast
Work branch `main` on jmelv-git/icepik (Juan's fork), last commit 6232f58 "Merge pull request #6 from jmelv-git/main", written 2026-11-02.

## Goal
ICEPik is a Next.js 16 + Leaflet + Supabase app (ICE sighting reports, Philadelphia). Workflow: commit straight to `main` on the fork jmelv-git/icepik; the user opens PRs into nthanvii/icepik, which Vercel deploys to icepik.vercel.app. This stretch of work switched the basemap to CARTO Positron and raised the contrast and accessibility of pins and buttons. It is done when merged upstream and the live site shows the CARTO map.

## Status
- [checked] CARTO Positron map via leaflet-providers, key from `NEXT_PUBLIC_CARTO_KEY`; prod builds on Vercel fail without it (`next.config.ts`). Commit ab9a832.
- [checked] Pin accessibility: status in marker titles, cluster count `aria-hidden`, dark "!" + amber rim on yellow pins (`app/_components/map-pins.ts`). Commit 72a196e.
- [checked] Button/disputed contrast: `--green #33b56b` with dark text, `--red-strong`, `--blue-strong`, disputed grey `#6b6f78`, amber ring on `.cluster-unverified` (`app/globals.css`). Commit 058536e.
- [checked] Fork `main` contains 6232f58, a merge titled "Merge pull request #6 from jmelv-git/main", so PR #6 appears merged upstream. Working tree clean, no WIP commit.
- [from memory] Unrestricted dev/preview CARTO key tested locally: real tiles load. Restricted production key not tested.
- [from memory] Vercel env vars: unknown whether `NEXT_PUBLIC_CARTO_KEY` is set for Production and Preview and redeployed. If not, production builds fail (by design) and the live site keeps the old build.
- No background processes or subagents still need anything.

## Key decisions
- CARTO over Stadia: Stadia free tier is 200k tiles/month; CARTO free non-commercial is 5M.
- Self-hosting tiles postponed: Vercel Hobby caps at 1M requests/month and pauses the whole site when exceeded.
- Two CARTO keys: production key restricted to `icepik.vercel.app`; one unrestricted key for Preview and `.env.local`. CARTO won't let one key list both localhost and public sites. Documented in README section 2.
- Vote button "Option B": dark text on light green, so confirm/dispute differ for colour-blind users.
- `--blue` kept for focus rings; `--blue-strong` only behind white text.

## Avoid
- Never commit or print the CARTO key. It is in this cloud environment's variables (`NEXT_PUBLIC_CARTO_KEY`), in Vercel, and in the user's `.env.local`.
- Don't copy Stadia's Alidade Smooth style: Stadia's terms forbid reusing it.
- Don't proxy or cache CARTO tiles on a server: CARTO's terms forbid it.
- Keep privacy rules in `docs/database-handoff.md` (no coordinates or IDs in URLs, writes via server actions only).

## Open questions and blockers
- Waiting on the user: confirm the Vercel env vars are set and the live map shows CARTO tiles.
- Optional follow-ups that were offered, not requested:
  - On short phones (≤667px tall), the reports panel's cards overflow; this covers the map credit and leaves the page scrolled 128px at 320×568.
  - The selected pin is only shown by 1.2× scale.
  - The search dot draws under pins and looks like "you are here".

## Next step
Run `git log --oneline -5` on `main` and ask the user whether icepik.vercel.app now shows the CARTO map. If not, check that `NEXT_PUBLIC_CARTO_KEY` is in Vercel (Production and Preview) and redeploy. After that, offer the follow-ups above, starting with the short-phone panel overflow (`.panel-cards` in `app/globals.css`).
