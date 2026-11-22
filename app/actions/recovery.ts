"use server";

// "Forgot password?" for saved accounts, using the recovery key shown when the
// account was saved. No email or phone is involved.
//
// Same rules as sightings.ts: check every argument, never console.log the
// input (it holds a password and a recovery key), and return errors as values.
// This is the only action that uses a secret key (lib/supabase/admin.ts).
//
// Usage from the reset screen:
//   const result = await resetPasswordWithRecoveryKey({ username, recoveryKey, newPassword }, demo);
//   if (result.ok) show result.data.newRecoveryKey once, then sign in with the
//   new password (with a fresh CAPTCHA token: each token works only once).
//
// The demo at /demo passes demo = true. As in sightings.ts, pickDemo() turns
// only a literal true into the demo; anything else means the real project.
// The demo has its own reset (resetDemoPassword below), with its own client
// built from the demo project's secret key: any letters and numbers work as
// the key there, so a presenter can show the flow without a real key. It
// can't reach the real project, and the real reset always needs the real key.

import type { ActionResult } from "@/app/actions/sightings";
import {
  RECOVERY_NO_MATCH,
  checkPassword,
  checkRecoveryKey,
  checkUsername,
  loginIdFor,
  normalizeUsername,
} from "@/lib/accounts";
import { createAdminClient, createDemoAdminClient } from "@/lib/supabase/admin";
import { pickDemo } from "@/lib/supabase/config";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type ResetResult = ActionResult<{ newRecoveryKey: string }>;

// One answer for unknown usernames and wrong keys.
const NO_MATCH = RECOVERY_NO_MATCH;
const TRY_AGAIN = "Something went wrong. Please try again.";
const NO_DEMO = "The demo isn't set up yet.";
const KEY_NOT_REPLACED =
  "Your password was changed, but ICEPik couldn't make your new recovery key. Reset again with the same key to get one.";

export async function resetPasswordWithRecoveryKey(
  input: {
    username: string;
    recoveryKey: string;
    newPassword: string;
  },
  demo?: boolean,
): Promise<ResetResult> {
  const useDemo = pickDemo(demo);
  if (useDemo === null) return { ok: false, message: NO_DEMO };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, message: TRY_AGAIN };
  }
  const username = typeof input.username === "string" ? normalizeUsername(input.username) : "";
  const recoveryKey = typeof input.recoveryKey === "string" ? input.recoveryKey : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

  if (checkUsername(username) || recoveryKey.length === 0 || recoveryKey.length > 64) {
    return { ok: false, message: NO_MATCH };
  }
  const passwordProblem = checkPassword(newPassword);
  if (passwordProblem) return { ok: false, message: passwordProblem };

  if (useDemo) return resetDemoPassword(username, recoveryKey, newPassword);

  // Only Vercel's Production environment has the secret key.
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Password reset isn't available on this version of the site." };

  const { data: userId, error } = await admin.rpc("check_recovery_key", {
    p_username: username,
    p_key: recoveryKey,
  });
  if (error) return { ok: false, message: TRY_AGAIN };
  if (!userId) return { ok: false, message: NO_MATCH };

  return setPasswordAndReplaceKey(admin, userId, newPassword);
}

// The demo's reset. Any letters and numbers work as the key; the account is
// found by its username alone, in the demo project only.
async function resetDemoPassword(
  username: string,
  recoveryKey: string,
  newPassword: string,
): Promise<ResetResult> {
  const keyProblem = checkRecoveryKey(recoveryKey, true);
  if (keyProblem) return { ok: false, message: keyProblem };

  // Built only from the demo project's URL and DEMO_SUPABASE_SECRET_KEY.
  const admin = createDemoAdminClient();
  if (!admin) return { ok: false, message: "The demo's password reset isn't set up yet." };

  const userId = await findDemoAccount(admin, loginIdFor(username));
  if (userId === undefined) return { ok: false, message: TRY_AGAIN };
  if (userId === null) return { ok: false, message: NO_MATCH };

  return setPasswordAndReplaceKey(admin, userId, newPassword);
}

// The demo account with this login ID: its id, null if there's none, or
// undefined if the list couldn't be read. Only saved accounts have a login
// ID. The demo project holds few accounts, so reading the list is enough.
async function findDemoAccount(admin: AdminClient, loginId: string) {
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return undefined;
    const account = data.users.find((user) => user.email === loginId);
    if (account) return account.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

// admin is the client for the project the account is in: the real one, or
// the demo's on /demo.
async function setPasswordAndReplaceKey(
  admin: AdminClient,
  userId: string,
  newPassword: string,
): Promise<ResetResult> {
  // Sets the password and ends every session for this account, including on a
  // lost or seized phone. A device that's already signed in can still read and
  // post until its access token expires (the JWT expiry, 1 hour by default),
  // but it can't make a recovery key or delete the account.
  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (passwordError) {
    return {
      ok: false,
      message: passwordError.code === "weak_password" ? "Choose a stronger password." : TRY_AGAIN,
    };
  }

  // Replace the used key, trying twice. The password has already changed, so
  // if both tries fail, say so: the used key still works, and resetting again
  // with it gives a new one.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: newRecoveryKey, error: keyError } = await admin.rpc("replace_recovery_key", {
      p_user_id: userId,
    });
    if (!keyError && newRecoveryKey) return { ok: true, data: { newRecoveryKey } };
  }
  return { ok: false, message: KEY_NOT_REPLACED };
}
