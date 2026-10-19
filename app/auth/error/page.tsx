import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../auth-shell";

export const metadata: Metadata = {
  title: "Link didn't work · ICEPik",
};

export default function AuthErrorPage() {
  return (
    <AuthShell
      title="That link didn't work"
      intro="It may have expired or already been used. Try logging in, or sign up again to get a new link."
    >
      <Link href="/login" className="auth-button">
        Go to log in
      </Link>
    </AuthShell>
  );
}
