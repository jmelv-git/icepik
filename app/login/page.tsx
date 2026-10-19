import type { Metadata } from "next";
import { AuthForm } from "../auth/auth-form";
import { AuthShell } from "../auth/auth-shell";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Log in · ICEPik",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      intro="You don't need an account to use the map."
    >
      {isSupabaseConfigured ? null : (
        <p className="auth-error" role="status">
          Login isn&apos;t set up on this site yet.
        </p>
      )}
      <AuthForm mode="login" />
    </AuthShell>
  );
}
