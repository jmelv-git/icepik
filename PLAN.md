# Plan: account recovery screens

The screens for the recovery-key backend that's already on `main` (`app/actions/recovery.ts`,
`lib/supabase/admin.ts`, the recovery-key functions in `database/`). The owner approved this plan on
22 Nov 2026. The previous PLAN.md (report at a searched place, no pins in impossible places, all done)
is in git history at `06c9d67`.

Branch: `claude/account-recovery-screens-su9s7c`, from `origin/main` (`06c9d67`).

## Checklist

- [x] Phase 1. Plan, approved by the owner (22 Nov 2026)
- [ ] Phase 2. Build against the mock: layout baseline first, mock extended, screens built, the
      contrast, accessibility and layout scripts cover the new screens
- [ ] Phase 3. Testing window on the demo project: live checks, then every flow end to end
- [ ] Phase 4. Every check in "Done when"
- [ ] Phase 5. Demo project put back, branch pushed, compare link handed over

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
  reached while map tiles are blocked (the pin-spot check needs CARTO's vector tiles), at most sizes;
  that was already so, and the comparison treats it the same on both sides.
