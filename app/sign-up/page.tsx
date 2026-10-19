import type { Metadata } from "next";
import { AuthForm } from "../auth/auth-form";
import { AuthShell } from "../auth/auth-shell";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Sign up · ICEPik",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Sign up"
      intro="You don't need an account to use the map. We only use your email to log you in."
    >
      {isSupabaseConfigured ? null : (
        <p className="auth-error" role="status">
          Login isn&apos;t set up on this site yet.
        </p>
      )}
      <AuthForm mode="sign-up" />
    </AuthShell>
  );
}
