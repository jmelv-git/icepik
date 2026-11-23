<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Rules for every agent session

- Commits and pull requests name no AI model and have no Co-Authored-By or session lines.
- Never commit `HANDOFF.md`. If it exists, it is your task: read it first, and tick each step in it when you finish that step.
- Don't open `.env*`. Never print, log or commit the CARTO key or a tile URL.
- In checks: block map tiles or use `scripts/stand-in-tile.mjs`, stub `/api/search` and `/api/reverse`, and send nothing to Nominatim or any other geocoder.
- Never log user input, coordinates, ids, push endpoints or secrets, on the server or in the browser.
- Layout changes need the owner's approval. The map and its buttons stay as they are. No glass where it isn't needed. Don't re-record `scripts/layout-baseline.json` without the owner's OK.
- Accessibility: WCAG 2.2 AA, as in `docs/accessibility-checklist.md`. Phone text at least 16 px. Existing colour tokens only.
- If `node_modules` lacks MapLibre, run `npm ci` first.
