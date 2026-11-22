// Change the version whenever the text below changes: everyone is asked to
// agree again. The accepted version is kept in localStorage only.
export const POLICY_VERSION = "2026-11-22-draft";

// Plain-language terms and privacy notice, shown before anything else loads.
// DRAFT: the team must review this text before launch.
export function PolicyText() {
  return (
    <div className="policy">
      <h3>Terms of use</h3>
      <ul>
        <li>
          Sightings come from other people. They can be wrong, late or false. Use your own
          judgment, and don’t put yourself at risk to report or check one.
        </li>
        <li>Only report what you saw yourself.</li>
        <li>
          Don’t include names, home addresses or anything else that identifies a person.
          Descriptions are public and nobody checks them before they appear.
        </li>
        <li>
          Don’t post false reports, threats, or anything that encourages anyone to interfere
          with, threaten or hurt another person, including officers.
        </li>
        <li>
          If you save your account, keep your password and recovery key to yourself. Anyone who has
          them can use or reset your account.
        </li>
        <li>
          The Know Your Rights links are general information, not legal advice. ICEPik is
          provided as is and may change or stop at any time.
        </li>
      </ul>

      <h3>Privacy</h3>
      <ul>
        <li>
          <strong>No name, email or phone number.</strong> ICEPik creates an anonymous account on
          this device. If you save it, you choose a username and password.
        </li>
        <li>
          <strong>Recovery key.</strong> When you save your account, ICEPik shows you a recovery key
          once. With no email, it’s the only way to reset a forgotten password: anyone who has your
          username and key can set a new password, which signs your other devices out within about
          an hour. Each key works once, and a reset gives you a new one. You can also make a new one
          in Settings if you think someone saw yours; the old one then stops working. We keep only a
          scrambled form of the key (a hash), so we can’t show it to you again. Write it down or keep
          it in a password manager, not on this device. If you lose both your password and your key,
          the account can’t be recovered.
        </li>
        <li>
          <strong>Sightings are public</strong> while they’re on the map: at least 4 hours, more
          if people confirm them. Their location is rounded to about 100 meters.
        </li>
        <li>
          <strong>Nobody else can see who posted or confirmed a sighting.</strong> That link is
          deleted within an hour after the sighting leaves the map. We keep the sighting itself,
          without the link, to measure how accurate reports are.
        </li>
        <li>
          <strong>Your location stays on this device</strong>, except when you confirm or dispute a
          sighting. Then ICEPik sends it once, to check you’re within 1 km, and doesn’t store it.
        </li>
        <li>
          <strong>The blue dot.</strong> When you first open the map, ICEPik asks your browser for
          your location, to show where you are and center the map there. Centering loads the map
          images for that area, which CARTO sees (see below). You can say no and the map still
          works.
        </li>
        <li>
          <strong>What our providers see.</strong> Supabase (our database) and Vercel (our
          website host) see your IP address when you connect. Supabase keeps request logs with
          your IP address and a rough location worked out from it for about a day, and backups
          for up to 7 days. CARTO, which provides the map images, and its delivery network,
          Fastly, see your IP address and which area of the map you view. Fastly keeps full IP
          addresses for up to 2 business days, or longer for errors or traffic it flags as
          suspicious. CARTO shortens IP addresses before saving them and keeps those logs for
          30 days. Cloudflare&apos;s security check sees your IP address and browser when your
          account is created, and whenever you open Log in, Save account, Forgot password or Make a
          new recovery key, or, for a saved account, Delete my account. For each signed-in
          session, Supabase also keeps the IP address and browser it last used (updated about
          every hour while ICEPik is open), until that session signs out or the account is
          deleted. Logging in to another account on this device can leave the earlier session
          behind.
        </li>
        <li>
          <strong>We can’t promise complete anonymity.</strong> A subpoena or warrant can
          require these providers to hand over the logs they hold.
        </li>
        <li>No ads, analytics or tracking.</li>
        <li>
          <strong>What this device keeps.</strong> Your sign-in, your home, work and other saved
          places, your answer about location, your choice for the moving background, and which
          version of these terms you agreed to. Saved places and these choices are never sent to
          us.
        </li>
        <li>
          You can delete your account in Settings; a saved account asks for its password first.
          Your sightings stay on the map until they expire, with no link to you.
          &ldquo;Clear this device&rdquo; removes saved places and the background choice, and
          signs this device out.
        </li>
      </ul>
    </div>
  );
}
