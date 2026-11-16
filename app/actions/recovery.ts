"use server";

// "Forgot password?" for saved accounts, using the recovery key shown when the
// account was saved. No email or phone is involved.
//
// Same rules as sightings.ts: check every argument, never console.log the
// input (it holds a password and a recovery key), and return errors as values.
// This is the only action that uses the secret key (lib/supabase/admin.ts).
//
// Usage from the reset screen:
//   const result = await resetPasswordWithRecoveryKey({ username, recoveryKey, newPassword });
//   if (result.ok) show result.data.newRecoveryKey once, then sign in with the
//   new password (with a fresh CAPTCHA token: each token works only once).

import type { ActionResult } from "@/app/actions/sightings";
import { checkPassword, checkUsername, normalizeUsername } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/admin";

// One answer for unknown usernames and wrong keys.
const NO_MATCH = "That username and recovery key don't match.";
const TRY_AGAIN = "Something went wrong. Please try again.";

export async function resetPasswordWithRecoveryKey(input: {
  username: string;
  recoveryKey: string;
  newPassword: string;
}): Promise<ActionResult<{ newRecoveryKey: string }>> {
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

  // Only Vercel's Production environment has the secret key.
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Password reset isn't available on this version of the site." };

  const { data: userId, error } = await admin.rpc("check_recovery_key", {
    p_username: username,
    p_key: recoveryKey,
  });
  if (error) return { ok: false, message: TRY_AGAIN };
  if (!userId) return { ok: false, message: NO_MATCH };

  // Sets the password and ends every session for this account, including on a
  // lost or seized phone. A device that's already signed in keeps working
  // until its access token expires (the JWT expiry, 1 hour by default).
  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (passwordError) {
    return {
      ok: false,
      message: passwordError.code === "weak_password" ? "Choose a stronger password." : TRY_AGAIN,
    };
  }

  // Replace the used key. If this fails, the old key still works, so trying
  // again with it is safe.
  const { data: newRecoveryKey, error: keyError } = await admin.rpc("replace_recovery_key", {
    p_user_id: userId,
  });
  if (keyError || !newRecoveryKey) return { ok: false, message: TRY_AGAIN };

  return { ok: true, data: { newRecoveryKey } };
}
