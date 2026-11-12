// Stand-in for Supabase, for local UI checks only: fixture sightings over
// plain HTTP and a fake anonymous sign-up. From the appendix of PLAN.md.
//
//   node scripts/mock-supabase.mjs            (port 54321, 8 sightings)
//   MOCK_COUNT=10 node scripts/mock-supabase.mjs   (adds a cluster)
//
// Build and start the app against it with
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 54321);
const now = Date.now();
// Ages are counted from each request, so "posted N minutes ago" (and so the
// width of that text) is the same however long the server has run.
let clock = now;
const iso = (ms) => new Date(ms).toISOString();
const C = [39.9526, -75.1652];
const base = (i, o) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  agent_count: 2,
  vehicle_count: 1,
  category: "patrol",
  confirm_count: 0,
  dispute_count: 0,
  created_at: iso(clock - i * 7 * 60000),
  description: "Fixture sighting",
  expires_at: iso(clock + 6 * 3600000),
  lat: C[0],
  lng: C[1],
  location_label: `Fixture street ${i}`,
  verification_score: null,
  verification_status: "unverified",
  ...o,
});
const N = Number(process.env.MOCK_COUNT || 8);
const spots = [
  [39.9526, -75.1652, "verified", "Market Street & 15th"],
  [39.958, -75.158, "unverified", "Spring Garden Street"],
  [39.945, -75.155, "disputed", "South 9th Street"],
  [39.962, -75.172, "unverified", "Fairmount Avenue"],
  [39.94, -75.175, "verified", "Washington Avenue"],
  [39.95, -75.145, "unverified", "Chestnut Street & 3rd"],
  [39.97, -75.15, "disputed", "Girard Avenue"],
  [39.935, -75.16, "unverified", "Passyunk Avenue"],
  [39.9528, -75.1648, "unverified", "Market Street & 15th (2)"],
  [39.948, -75.19, "unverified", "University City"],
];
const rows = () =>
  spots
    .slice(0, N)
    .map(([lat, lng, s, label], i) =>
      base(i + 1, { lat, lng, verification_status: s, location_label: label }),
    );
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const userId = "11111111-1111-4111-8111-111111111111";
const exp = Math.floor(now / 1000) + 3600 * 24;
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
  sub: userId,
  role: "authenticated",
  aud: "authenticated",
  exp,
  is_anonymous: true,
  iss: `http://127.0.0.1:${PORT}/auth/v1`,
})}.sig`;
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: true,
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: iso(now),
};
const session = {
  access_token: jwt,
  refresh_token: "refresh",
  expires_in: 86400,
  expires_at: exp,
  token_type: "bearer",
  user,
};

http
  .createServer((req, res) => {
    const h = {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        req.headers["access-control-request-headers"] || "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, h);
      return res.end();
    }
    const url = new URL(req.url, "http://x");
    let body = "[]";
    let status = 200;
    if (url.pathname === "/rest/v1/sightings") {
      clock = Date.now();
      body = JSON.stringify(rows());
    } else if (url.pathname.startsWith("/rest/v1/")) body = "[]";
    else if (
      url.pathname === "/auth/v1/signup" ||
      url.pathname === "/auth/v1/token"
    )
      body = JSON.stringify(session);
    else if (url.pathname === "/auth/v1/user") body = JSON.stringify(user);
    else if (url.pathname.includes("jwks")) body = JSON.stringify({ keys: [] });
    else {
      status = 404;
      body = "{}";
    }
    res.writeHead(status, h);
    res.end(body);
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log("mock supabase on", PORT, "rows", N),
  );
