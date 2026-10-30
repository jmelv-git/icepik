// Change the version whenever the text below changes: everyone is asked to
// agree again. The accepted version is kept in localStorage only.
export const POLICY_VERSION = "2026-10-30-draft";

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
          <strong>Sightings are public</strong> while they’re on the map: at least 4 hours, more
          if people confirm them. Their location is rounded to about 100 meters.
        </li>
        <li>
          <strong>Nobody else can see who posted or confirmed a sighting.</strong> That link is
          deleted within an hour after the sighting leaves the map. We keep the sighting itself,
          without the link, to measure how accurate reports are.
        </li>
        <li>
          <strong>Your location is used only when you confirm or dispute a sighting</strong>, to
          check you’re within 1 km. It isn’t stored. Home and work places stay on this
          device.
        </li>
        <li>
          <strong>What our providers see.</strong> Supabase (our database) and Vercel (our
          website host) see your IP address when you connect. Supabase keeps request logs with
          your IP address and a rough location worked out from it for about a day, and backups
          for up to 7 days. CARTO, which provides the map images, and its delivery network,
          Fastly, see your IP address and which area of the map you view. Fastly keeps full IP
          addresses for up to 2 business days, or longer for errors or traffic it flags as
          suspicious. CARTO shortens IP addresses before saving them and keeps those logs for
          30 days. A security check by Cloudflare may also see your IP address.
        </li>
        <li>
          <strong>We can’t promise complete anonymity.</strong> A subpoena or warrant can
          require these providers to hand over the logs they hold.
        </li>
        <li>No ads, analytics or tracking.</li>
        <li>
          You can delete your account in Settings. Your sightings stay on the map until they
          expire, with no link to you. &ldquo;Clear this device&rdquo; removes saved places and
          signs this device out.
        </li>
      </ul>
    </div>
  );
}
