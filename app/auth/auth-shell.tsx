import Image from "next/image";
import Link from "next/link";
import logo from "../../public/brand/icepik-logo.png";

// The dark card the login, sign-up and error pages sit in.
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link href="/" className="auth-logo" aria-label="Back to the map">
          <Image src={logo} alt="ICEPik" preload />
        </Link>
        <h1 id="auth-title">{title}</h1>
        {intro ? <p className="auth-intro">{intro}</p> : null}
        {children}
        <Link href="/" className="auth-back">
          ← Back to the map
        </Link>
      </section>
    </main>
  );
}
