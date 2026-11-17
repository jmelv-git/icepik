import type { User } from "@supabase/supabase-js";

// Saved accounts log in with a username. Supabase Auth signs people in by
// email, so the username becomes a login ID on the reserved ".invalid"
// domain, which can never receive mail: nobody can be sent a password reset
// for someone else's account.
const LOGIN_DOMAIN = "@icepik.invalid";

export const USERNAME_RULES = "3 to 20 lowercase letters, numbers or underscores";
export const PASSWORD_RULES = "At least 15 characters. A few random words work well";
// NIST's minimum when a password is an account's only protection. Supabase
// enforces the same minimum (Authentication -> Minimum password length) and
// counts it in characters (Unicode code points), as this file does.
const MIN_PASSWORD_LENGTH = 15;
// Supabase refuses passwords over 72 bytes (bcrypt's limit). Letters with
// accents take 2 bytes and emoji 4, so a password with them fits fewer.
const MAX_PASSWORD_BYTES = 72;

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export function loginIdFor(username: string) {
  return `${normalizeUsername(username)}${LOGIN_DOMAIN}`;
}

// The username of a saved account, or null for an anonymous one.
export function usernameOf(user: User | null) {
  if (!user || user.is_anonymous || !user.email) return null;
  return user.email.endsWith(LOGIN_DOMAIN) ? user.email.slice(0, -LOGIN_DOMAIN.length) : user.email;
}

export function checkUsername(username: string) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(username))
    ? null
    : `Usernames are ${USERNAME_RULES}.`;
}

export function checkPassword(password: string) {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return "Use a password of at least 15 characters. A few random words work well.";
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "That password is too long. Use up to 72 characters, fewer if it has accented letters or emoji.";
  }
  return null;
}

// Supabase Auth errors carry a stable `code`; never match on the message.
export function authErrorMessage(error: { code?: string; message?: string } | null) {
  switch (error?.code) {
    case "email_exists":
    case "user_already_exists":
      return "That username is taken. Try another one.";
    case "invalid_credentials":
      return "Username or password is wrong.";
    // "Require current password when changing password" is on in Supabase.
    case "current_password_required":
    case "current_password_invalid":
      return "Your current password is wrong.";
    case "same_password":
      return "Choose a password that's different from your current one.";
    case "weak_password":
      return `That password is too weak. ${PASSWORD_RULES}. ${error.message ?? ""}`.trim();
    case "email_address_invalid":
      return "That username can't be used. Try another one.";
    case "captcha_failed":
      return "The security check didn't go through. Complete it again.";
    case "over_request_rate_limit":
      return "Too many tries from this network. Wait a few minutes and try again.";
    case "anonymous_provider_disabled":
      return "ICEPik can't create accounts right now: anonymous sign-ins are turned off in Supabase.";
    // Also what Supabase returns when the database refuses a login ID (the
    // username rule, or renaming a saved username). Check the username first.
    case "unexpected_failure":
    default:
      return "Something went wrong. Please try again.";
  }
}
