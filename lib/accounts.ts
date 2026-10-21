import type { User } from "@supabase/supabase-js";

// Saved accounts log in with a username. Supabase Auth signs people in by
// email, so the username becomes a login ID on the reserved ".invalid"
// domain, which can never receive mail: nobody can be sent a password reset
// for someone else's account.
const LOGIN_DOMAIN = "@icepik.invalid";

export const USERNAME_RULES = "3 to 20 lowercase letters, numbers or underscores";
export const PASSWORD_RULES = "At least 8 characters";
const MIN_PASSWORD_LENGTH = 8;

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
  return password.length >= MIN_PASSWORD_LENGTH ? null : "Use a password with at least 8 characters.";
}

// Supabase Auth errors carry a stable `code`; never match on the message.
export function authErrorMessage(error: { code?: string; message?: string } | null) {
  switch (error?.code) {
    case "email_exists":
    case "user_already_exists":
      return "That username is taken. Try another one.";
    case "invalid_credentials":
      return "Username or password is wrong.";
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
    default:
      return "Something went wrong. Please try again.";
  }
}
