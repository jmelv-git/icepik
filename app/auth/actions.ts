"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const NOT_CONFIGURED =
  "Login isn't set up on this site yet. Add the Supabase environment variables and redeploy.";

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function logIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const { email, password } = readCredentials(formData);
  const repeatPassword = String(formData.get("repeat-password") ?? "");

  if (!email || !password) return { error: "Enter your email and a password." };
  if (password.length < 6) return { error: "Use a password with at least 6 characters." };
  if (password !== repeatPassword) return { error: "The passwords don't match." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/` },
  });
  if (error) return { error: error.message };

  // With email confirmation turned off, Supabase signs the user in right away.
  if (data.session) redirect("/");

  return {
    message: `We sent a confirmation link to ${email}. Open it to finish signing up, then log in.`,
  };
}
