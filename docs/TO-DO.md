# To-do: stretch goals

Features from the Figma mobile design (`docs/figma-mobile-design/`) that are left out of the current redesign. The redesign changes only the style; these change what the app does, so each needs its own plan.

## Stretch goals

### Account recovery with backup codes (in progress)
Planned with the backend team. Accounts stay username and password with no email; backup codes give a way back in after a forgotten password.
- When someone saves an account, show a set of one-time backup codes to write down or save, shown only once. A code lets them set a new password.
- Agree with the backend team on: the code format and how many codes there are; storing only a hash of each code; each code working once; limiting and CAPTCHA-checking code attempts; making new codes from Settings, which cancels the old ones.
- Never keep the codes in the browser's storage.
- Change the text that says a forgotten password can't be recovered: the Save account screen in `app/_components/settings-dialog.tsx` (about line 321) and `docs/database-handoff.md` (about lines 406 and 516). Check whether the terms in `app/_components/policy.tsx` need a new `POLICY_VERSION`; changing the policy needs the owner's approval.
- Design: Figma's Forgot Password and Code Verification screens (`docs/figma-mobile-design/`) are a style reference for "Use a backup code". Their five-box entry assumes a short code, so match it to the format the backend chooses.

### Photos on reports
Figma shows a photo in each alert card and in the reports list, and an "Add an image (optional)" row on Submit a Report.
- Needs a place to store photos (a Supabase Storage bucket and a column on `sightings`) and an upload limit.
- Strip location and camera metadata (EXIF) before a photo is stored. Faces and licence plates may need blurring.
- Photos must expire with their sighting and be removable when a report is deleted or disputed.
- The Content Security Policy in `proxy.ts` must allow the storage host in `img-src`.
- The terms in `app/_components/policy.tsx` must say what happens to photos, with a new `POLICY_VERSION`. Changing the policy needs the owner's approval.
- Update `docs/database-handoff.md`.

### Know Your Rights articles
Figma shows Know Your Rights as article cards with an image, headline, source, date and summary. Today it is three links to trusted legal resources.
- Needs someone to choose and keep the articles up to date, and a place to keep them.
- Images must be stored on the site itself (the Content Security Policy blocks other image hosts).

### More report fields
Figma's Submit a Report has "Uniform/clothing (optional)", one "How many" number and a "Time" field. The app asks for agents, vehicles, a location label and optional details, and uses the time the report was posted.
- Each new field needs a database column, limits and a check that it can't carry personal details.
- A "Time" field must not allow times in the future or long before the report.

### Address search to place the pin
Figma's form has a "Street address" field with "Or place a pin on the map" under it. The app places the pin on the map and suggests a street label from it.
- Typing an address could move the pin. It must keep the rule that a location is a street or block, never a house number, and the pin stays rounded to about 100 m.

### "New" counter on the map
Figma shows a round counter of new reports in the corner of the map. It would count reports the person hasn't seen yet, kept on the device only.

### Place name in the search box
Figma's search box shows the state and city of the map area ("PA | Philadelphia") when nothing has been searched.

## Not planned

These are in the Figma design but go against how ICEPik protects people. Leave them out unless the privacy model changes.

- **Email sign-up and password reset by email.** Accounts use a username and password with no email, so no inbox is linked to anyone (`lib/accounts.ts`, `docs/database-handoff.md`). Recovery comes from backup codes instead (see above).
- **"Critical" and "Warning" labels.** The app keeps its own status labels: Verified, Unverified and Disputed.
