# Plan: account recovery screens

The screens for the recovery-key backend that's already on `main` (`app/actions/recovery.ts`,
`lib/supabase/admin.ts`, the recovery-key functions in `database/`). The owner approved this plan on
22 Nov 2026. The previous PLAN.md (report at a searched place, no pins in impossible places, all done)
is in git history at `06c9d67`.

Branch: `claude/account-recovery-screens-su9s7c`, from `origin/main` (`06c9d67`).

## Checklist

- [x] Phase 1. Plan, approved by the owner (22 Nov 2026)
- [x] Phase 2. Build against the mock: layout baseline first, mock extended, screens built, the
      contrast, accessibility and layout scripts cover the new screens
- [x] Phase 3. Testing window on the demo project: live checks, then every flow end to end
- [x] Phase 4. Every check in "Done when"
- [x] Phase 5. Demo project put back (test accounts deleted, `reset_demo()` run), branch pushed,
      compare link handed over. Left to the owner: switch the demo's CAPTCHA secret back to the real
      Turnstile key, add `DEMO_SUPABASE_SECRET_KEY` in Vercel, check the real project's Password
      Requirements setting.

## Decisions from the owner

1. **Demo.** Every recovery screen also works on `/demo`, against the demo project. There, "Forgot
   password?" is a demo-only reset: any letters and numbers work as the key, it sets the new password
   for that username in the demo project, shows a new key once and signs in. Only on `/demo`, the reset
   screen says so in the hint style. It runs on its own server-side path, chosen like `pickDemo()`, with
   its own client built from `DEMO_SUPABASE_SECRET_KEY`, and can never reach the real project.
2. **Terms.** The approved text of 16 Nov 2026 (docs/TO-DO.md), with the two changes marked below, and a
   new `POLICY_VERSION`.
3. **Style.** Existing tokens, glass, gradients and dark panels only; no new colour values; existing
   screens don't move by more than 1 px (`node scripts/capture-layout.mjs --compare`).
4. **Testing.** The demo project is the test project; everything changed there is put back.
5. **Approved in the plan:** Turnstile on Save account (saving now signs in with the new password);
   after a reset, signing in at once with the form's unused CAPTCHA token while the new key shows; a
   confirm before closing Settings while a key is on screen; testing the real reset path with a local
   build whose `/` points at the demo project.
6. **The key is shown in full** (owner, 22 Nov 2026): every character visible at once, without
   scrolling. The key wraps between its groups of 4 at every size; the checks test it.

## Screens

All new screens use the Log in and Save account layout (`form account-form`, the logo and
`account-card`), so phones get the full page with the lava lamp and the glass card, and tablets and
desktop the glass dialog with the logo above it.

- **Save account (changed).** The second warning says a recovery key comes next (same number of lines,
  so nothing moves). A Turnstile check is added. Saving: `updateUser`, then `signInWithPassword` with a
  fresh token, end the session it replaced, `create_recovery_key`, then the key screen. If the sign-in
  or the key fails: "Your account is saved. Make your recovery key in Settings."
- **Your recovery key (new).** The key in full, Copy, advice (paper or a password manager, not on this
  phone; anyone with the username and key can set a new password; it can't be shown again), "I've
  stored my recovery key", Done. React state only.
- **Log in (changed).** "Forgot password?" on the Password label's line (nothing moves). After a log-in,
  `has_recovery_key()`; when false, "Make a recovery key?".
- **Reset your password (new).** Username, recovery key (one field; dashes and spaces optional), new
  password twice, Turnstile. On `/demo`, the demo hint.
- **Recovery key section (new, saved accounts).** Whether there is a key; "Make a new recovery key"
  (or "Make a recovery key").
- **Make a new recovery key (new).** Password and Turnstile, then the key screen.
- **Make a recovery key? (new).** Right after a log-in without a key: Not now, or make one at once.

## Terms (policy.tsx, POLICY_VERSION "2026-11-22-draft")

- Terms of use, new: "If you save your account, keep your password and recovery key to yourself.
  Anyone who has them can use or reset your account." (approved text)
- Privacy, new, after "No name, email or phone number": the approved "Recovery key." paragraph, with one
  sentence **added**: "You can also make a new one in Settings if you think someone saw yours; the old
  one then stops working."
- Privacy, "What our providers see", **changed**: Cloudflare's check is also seen when you open Save
  account, Forgot password or Make a new recovery key.

## Files

New: `app/_components/account-recovery.tsx`, `scripts/recovery-flows.mjs`,
`docs/recovery-screenshots/`. Changed: `app/_components/settings-dialog.tsx`, `map-app.tsx` (close
guard), `policy.tsx`, `app/actions/recovery.ts`, `app/actions/sightings.ts` and
`lib/supabase/config.ts` (`pickDemo()` shared), `lib/supabase/admin.ts`, `lib/accounts.ts`,
`app/globals.css`, `scripts/mock-supabase.mjs`, `capture-layout.mjs`, `glass-contrast.mjs`,
`a11y-audit.mjs`, `layout-baseline.json`, README.md, docs. No new dependencies; the CSP in `proxy.ts`
is unchanged.

## Notes

- Layout baseline recorded from `06c9d67` before any screen changed. The `report-form` state can't be
  reached by `capture-layout.mjs` while map tiles are blocked (the pin-spot check needs CARTO's vector
  tiles); that was already so, and the comparison treats it the same on both sides.
- Phase 2 against the stand-ins: `recovery-flows.mjs` 45 of 45; `capture-layout.mjs --compare` no
  difference above 1 px in 272 states (84 new recovery states and the new "Forgot password?" button
  listed as new); `glass-contrast.mjs` 181 of 181; `a11y-audit.mjs` failed only on the report form's
  three states, unreachable at every size (pre-existing, as above).
- So the audit can exit 0, `scripts/stand-in-tile.mjs` answers the spot check's vector tiles with a
  local stand-in (every other CARTO request is still aborted in the browser; nothing reaches CARTO),
  and the audit starts the report form at a searched place. That surfaced a pre-existing WCAG 1.4.12
  failure on the report form ("Searched:" name cut off with wider text spacing), fixed by letting the
  name wrap.

## Phase 3: the testing window (22 Nov 2026)

The owner switched the demo project's CAPTCHA secret to Cloudflare's test key. The demo project had
no accounts when the window opened.

- `scripts/supabase-live-checks.mjs` (demo values under the names it reads,
  `ICEPIK_SCRATCH_PROJECT=yes`). First run: 0 and 1 passed, **2a failed**: the demo project required
  lowercase, uppercase, digits and symbols in every password (Supabase's "Password Requirements"),
  which the handoff doesn't ask for and which refuses ICEPik's advice ("a few random words"). Stopped
  and asked; the owner set it to "No required characters". Second run: **all 28 checks passed** (2 for
  information: 3, the token after saving; 6c, `/recover` for an unknown username, which answers
  differently from 6a, as the handoff's known gaps say). 6b's SQL Editor lookup wasn't run by hand
  (not a terminal, so the script didn't pause).
- Build A, `/` pointed at the demo project with its secret key as `SUPABASE_SECRET_KEY` (the real
  reset path, `check_recovery_key` with the real key, against real Supabase; the real project was
  never touched): `recovery-flows.mjs --live`, save, nokey and keyboard flows, 35 of 35 (the keyboard
  check first failed on the test's own timing with CAPTCHA on; the test now waits for the token).
- Build B, the normal `/demo`: the demo flow 8 of 8 (any letters and numbers reset the password, the
  note shows, a key with other characters and an unknown username are refused, it logs in at once),
  and a scratch run of the rest on `/demo` (Recovery key section, Make a new recovery key, an
  interrupted save, the offer after logging in) 11 of 11 (its log-in step first stalled on the test's
  own click while the security check's widget moved the form; it presses Enter now).
- Both builds used Cloudflare's test site key, only locally. No password or key in any request URL
  or in the server's output.
- Afterwards: all 26 accounts the tests made were deleted (the demo project has 0 again) and
  `public.reset_demo()` ran with the secret key. The owner was asked to switch the CAPTCHA secret
  back.

## Phase 4: checks on the final code

- `npx tsc --noEmit`, `npx eslint`, `npx next build`: pass. No new dependency; `proxy.ts`,
  `next.config.ts` and the package files unchanged.
- The browser bundle holds neither name `SUPABASE_SECRET_KEY` nor `DEMO_SUPABASE_SECRET_KEY`, nor the
  demo secret's value (not even in the server output); only `app/actions/recovery.ts` imports
  `lib/supabase/admin.ts`.
- `capture-layout.mjs --compare`: no difference above 1 px in 272 states.
- `glass-contrast.mjs`: 181 of 181. `a11y-audit.mjs`: no failures in 498 states, exit 0; no phone text
  under 16 px anywhere.
- `recovery-flows.mjs`: 45 of 45. Forced colors and reduced motion checked by emulation (outlines
  kept, the lamp stops).
- Screenshots: `docs/recovery-screenshots/`, 9 screens at 7 sizes, device scale factor 2.
