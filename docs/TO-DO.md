# To-do: stretch goals

Features from the Figma mobile design (`docs/figma-mobile-design/`) that are left out of the current redesign. The redesign changes only the style; these change what the app does, so each needs its own plan.

## Stretch goals

### Account recovery with a recovery key (in progress)
Accounts stay username and password with no email. The backend is built: `database/icepik_schema.sql` (or, for the live project, `database/migrations/20261116_recovery_keys.sql`) and `app/actions/recovery.ts`. `docs/database-handoff.md` ("Save the account", "Forgot password", "Settings") has the calls. Before building the screens, run `scripts/supabase-live-checks.mjs` against a scratch Supabase project: it checks the Supabase behaviour this design depends on.
- One recovery key per saved account: 128 random bits shown as 8 groups of 4 (for example `3f9a-0c21-…`), shown once. Only a hash is stored. It works once; a reset or "Make a new recovery key" replaces it.
- Saving: after `updateUser`, sign in with the new password (fresh CAPTCHA token), then `rpc('create_recovery_key')` and show the key once. The database makes a key only within 10 minutes of a password sign-in. Offer Copy, and tell people to write the key on paper or keep it in a password manager, not on the phone. Never keep it in the browser's storage.
- Log in screen: "Forgot password?" asks for the username, the key and a new password, calls the `resetPasswordWithRecoveryKey` server action, shows the new key once, then signs in (fresh CAPTCHA token).
- Not on `/demo`: `resetPasswordWithRecoveryKey` always uses the real project, with its secret key. Hide "Forgot password?" when `useDemo()` is true (or give the action a demo flag that refuses, as `pickDemo()` does in `app/actions/sightings.ts`).
- Settings: "Make a new recovery key" asks for the password and signs in with it first. After a saved account logs in, call `rpc('has_recovery_key')`; if it returns false, ask once to make one.
- Change the text that says a forgotten password can't be recovered: the Save account screen in `app/_components/settings-dialog.tsx` (the warning list in `SaveAccount`).
- In the same change, add the recovery key to the terms in `app/_components/policy.tsx` and change `POLICY_VERSION`, so the terms never describe a screen that isn't there yet. The owner approved this text (November 16, 2026):
  - Terms of use: "If you save your account, keep your password and recovery key to yourself. Anyone who has them can use or reset your account."
  - Privacy, after "No name, email or phone number": "**Recovery key.** When you save your account, ICEPik shows you a recovery key once. With no email, it's the only way to reset a forgotten password: anyone who has your username and key can set a new password, which signs your other devices out within about an hour. Each key works once, and a reset gives you a new one. We keep only a scrambled form of the key (a hash), so we can't show it to you again. Write it down or keep it in a password manager, not on this device. If you lose both your password and your key, the account can't be recovered."
- Design: Figma's Forgot Password and Code Verification screens (`docs/figma-mobile-design/`) are a style reference. Their five-box entry assumes a short code; the key is 32 characters in 8 groups, so use one text field that accepts it with or without dashes and spaces.

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

- **Email sign-up and password reset by email.** Accounts use a username and password with no email, so no inbox is linked to anyone (`lib/accounts.ts`, `docs/database-handoff.md`). Recovery comes from a recovery key instead (see above).
- **"Critical" and "Warning" labels.** The app keeps its own status labels: Verified, Unverified and Disputed.
