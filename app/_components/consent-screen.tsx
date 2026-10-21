import Image from "next/image";
import logo from "../../public/brand/icepik-logo.png";
import { acceptPolicy } from "@/lib/device-storage";
import { POLICY_VERSION, PolicyText } from "./policy";

// Shown before anything else loads: no sign-in, map tiles or CAPTCHA until
// the person agrees. Agreeing is remembered in this browser only; nothing
// about it is sent to the server.
export function ConsentScreen({ updated }: { updated: boolean }) {
  return (
    <main className="consent">
      <section className="consent-card" aria-labelledby="consent-title">
        <Image src={logo} alt="ICEPik" preload className="consent-logo" />
        <h1 id="consent-title">{updated ? "Our terms have changed" : "Before you start"}</h1>
        <p className="consent-intro">
          ICEPik is a community map of possible ICE activity in Philadelphia. Please read how it
          works and what it keeps. The map loads only after you agree.
        </p>
        <div className="consent-text" tabIndex={0} aria-label="Terms and privacy">
          <PolicyText />
        </div>
        <button
          type="button"
          className="primary-button consent-agree"
          onClick={() => acceptPolicy(POLICY_VERSION)}
        >
          I agree
        </button>
      </section>
    </main>
  );
}
