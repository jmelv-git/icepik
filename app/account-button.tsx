"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// The rail's account entry: "Log in" for visitors, "Log out" once signed in.
export function AccountButton({ className }: { className: string }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function logOut() {
    await createClient().auth.signOut();
  }

  if (email) {
    return (
      <button
        type="button"
        className={className}
        onClick={logOut}
        title={`Logged in as ${email}`}
      >
        <span className="rail-icon">
          <PersonIcon />
        </span>
        Log out
      </button>
    );
  }

  return (
    <Link href="/login" className={className}>
      <span className="rail-icon">
        <PersonIcon />
      </span>
      Log in
    </Link>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
