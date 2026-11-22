// Stand-in for Supabase, for local UI checks only: fixture sightings over
// plain HTTP, accounts and the recovery-key functions. Nothing here is a real
// key or a real account.
//
//   node scripts/mock-supabase.mjs            (port 54321, 8 sightings)
//   MOCK_COUNT=10 node scripts/mock-supabase.mjs   (adds a cluster)
//   MOCK_DEMO=1 MOCK_PORT=54322 node scripts/mock-supabase.mjs
//     the demo project: votes from anywhere, Verified after 1 confirmation
//     (database/icepik_demo_changes.sql); build with
//     NEXT_PUBLIC_DEMO_SUPABASE_URL=http://127.0.0.1:54322 and
//     NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY=test-anon-key
//
// Build and start the app against it with
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key NEXT_PUBLIC_TURNSTILE_SITE_KEY=
// and, for the password reset, start it with SUPABASE_SECRET_KEY=test-secret-key
// (and DEMO_SUPABASE_SECRET_KEY=test-secret-key for the demo's reset): the
// fake secret key this stand-in accepts for its server-only calls.
//
// Accounts, as Supabase Auth and database/icepik_schema.sql behave:
// - each anonymous sign-up is its own account, with its own session;
// - saving (PUT /auth/v1/user) adds a username@icepik.invalid login ID and a
//   password: usernames follow the database's rule, a taken one answers
//   email_exists, a password under 15 characters weak_password;
// - a password sign-in starts a new session; a wrong password answers
//   invalid_credentials; signing out ends that session;
// - create_recovery_key works only for a saved account, within 10 minutes
//   of a password sign-in, from a session that still exists; it returns a
//   new key (8 groups of 4) and keeps only its SHA-256 hash;
// - has_recovery_key; and, with the secret key only, check_recovery_key
//   (dashes, spaces and capitals in the key don't matter, as in the SQL) and
//   replace_recovery_key;
// - the admin API (secret key): list accounts, and set a password, which
//   ends every session of that account.
// GET /__mock/requests lists the requests this project received (method,
// path, and whether they used the secret key: never a body or a header), so
// a check can prove the demo's reset never reached the real project.
// POST /__mock/requests clears that list.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 54321);
const DEMO = process.env.MOCK_DEMO === "1";
// Votes cast against this server: sighting id -> { confirm, dispute }.
const votes = new Map();
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
// The database's rule for the status (icepik_schema.sql; the demo's in
// icepik_demo_changes.sql).
const statusFor = (c, d, fallback) =>
  !c && !d
    ? fallback
    : DEMO
      ? c >= 1 && c > d ? "verified" : d >= 1 && d > c ? "disputed" : "unverified"
      : c >= 2 && c >= 2 * d ? "verified" : d >= 2 && d > c ? "disputed" : "unverified";
const rows = () =>
  spots.slice(0, N).map(([lat, lng, s, label], i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const v = votes.get(id) ?? { confirm: 0, dispute: 0 };
    return base(i + 1, {
      lat,
      lng,
      location_label: label,
      confirm_count: v.confirm,
      dispute_count: v.dispute,
      verification_status: statusFor(v.confirm, v.dispute, s),
    });
  });
const distanceM = (a, b, c, d) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SECRET_KEY = process.env.MOCK_SECRET_KEY || "test-secret-key";
const LOGIN_DOMAIN = "@icepik.invalid";
const TEN_MINUTES = 10 * 60 * 1000;

// Accounts by id, and sessions by access token (and by refresh token).
const users = new Map();
const sessions = new Map();
const refreshTokens = new Map();
// The requests this project received: method, path and whether the secret
// key was used. Never bodies or headers.
let requests = [];

const userJson = (u) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email ?? "",
  is_anonymous: u.email === null,
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: u.createdAt,
});

function newSession(u, password) {
  const sessionId = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const passwordAt = password ? Date.now() : null;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: u.id,
    role: "authenticated",
    aud: "authenticated",
    exp,
    session_id: sessionId,
    is_anonymous: u.email === null,
    amr: [{ method: password ? "password" : "anonymous", timestamp: Math.floor(Date.now() / 1000) }],
    iss: `http://127.0.0.1:${PORT}/auth/v1`,
  })}.sig`;
  const refresh = randomBytes(12).toString("hex");
  const s = { userId: u.id, sessionId, passwordAt, ended: false, access, refresh };
  sessions.set(access, s);
  refreshTokens.set(refresh, s);
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: 86400,
    expires_at: exp,
    token_type: "bearer",
    user: userJson(u),
  };
}

const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer /, "");
const isAdmin = (req) => req.headers.apikey === SECRET_KEY && bearer(req) === SECRET_KEY;
const live = (req) => {
  const s = sessions.get(bearer(req));
  return s && !s.ended ? s : null;
};
const hash = (key) => createHash("sha256").update(key).digest("hex");
const newKey = () => randomBytes(16).toString("hex").replace(/(.{4})(?!$)/g, "$1-");
// The SQL's normalising: lower case, then only 0-9 and a-f.
const keyHash = (typed) => hash(String(typed).toLowerCase().replace(/[^0-9a-f]/g, ""));
const authError = (status, code, msg) => [status, { code: status, error_code: code, msg }];
const dbError = (message, code = "P0001") => [400, { code, message, details: null, hint: null }];
const replaceKey = (u) => {
  const key = newKey();
  u.keyHash = keyHash(key);
  return key;
};

// Auth and the recovery-key functions. Returns [status, body] or null.
async function accounts(req, url) {
  const path = url.pathname;
  if (path === "/auth/v1/signup" && req.method === "POST") {
    const u = { id: randomUUID(), email: null, password: null, keyHash: null, createdAt: iso(Date.now()) };
    users.set(u.id, u);
    return [200, newSession(u, false)];
  }
  if (path === "/auth/v1/token" && req.method === "POST") {
    const input = await readBody(req);
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const s = refreshTokens.get(input.refresh_token);
      if (!s || s.ended) return authError(400, "refresh_token_not_found", "Invalid Refresh Token");
      s.ended = true;
      const next = newSession(users.get(s.userId), false);
      // A refresh keeps the original sign-in time.
      sessions.get(next.access_token).passwordAt = s.passwordAt;
      return [200, next];
    }
    const u = [...users.values()].find((x) => x.email && x.email === input.email);
    if (!u || u.password !== input.password) {
      return authError(400, "invalid_credentials", "Invalid login credentials");
    }
    return [200, newSession(u, true)];
  }
  if (path === "/auth/v1/logout" && req.method === "POST") {
    const s = sessions.get(bearer(req));
    if (s) s.ended = true;
    return [204, null];
  }
  if (path === "/auth/v1/user") {
    const s = live(req);
    if (!s) return authError(403, "session_not_found", "Session from session_id claim in JWT does not exist");
    const u = users.get(s.userId);
    if (req.method === "PUT") {
      const input = await readBody(req);
      if (input.email !== undefined && input.email !== u.email) {
        if (u.email !== null) return authError(500, "unexpected_failure", "Database error updating user");
        const name = String(input.email).toLowerCase();
        if (!name.endsWith(LOGIN_DOMAIN) || !/^[a-z0-9_]{3,20}$/.test(name.slice(0, -LOGIN_DOMAIN.length))) {
          return authError(500, "unexpected_failure", "Database error updating user");
        }
        if ([...users.values()].some((x) => x.email === name)) {
          return authError(422, "email_exists", "A user with this email address has already been registered");
        }
        if (typeof input.password !== "string" || Array.from(input.password).length < 15) {
          return authError(422, "weak_password", "Password should be at least 15 characters.");
        }
        u.email = name;
        u.password = input.password;
      } else if (input.password !== undefined) {
        if (u.password !== null && input.current_password === undefined) {
          return authError(400, "current_password_required", "Current password required");
        }
        if (u.password !== null && input.current_password !== u.password) {
          return authError(400, "current_password_invalid", "Current password is invalid");
        }
        u.password = input.password;
      }
    }
    return [200, userJson(u)];
  }
  if (path === "/auth/v1/admin/users" && req.method === "GET") {
    if (!isAdmin(req)) return authError(401, "no_authorization", "This endpoint requires a valid secret key");
    const page = Number(url.searchParams.get("page") || 1);
    const perPage = Number(url.searchParams.get("per_page") || 50);
    const all = [...users.values()];
    return [200, { users: all.slice((page - 1) * perPage, page * perPage).map(userJson), aud: "authenticated" }];
  }
  const adminUser = path.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
  if (adminUser && req.method === "PUT") {
    if (!isAdmin(req)) return authError(401, "no_authorization", "This endpoint requires a valid secret key");
    const u = users.get(adminUser[1]);
    if (!u) return authError(404, "user_not_found", "User not found");
    const input = await readBody(req);
    if (typeof input.password !== "string" || Array.from(input.password).length < 15) {
      return authError(422, "weak_password", "Password should be at least 15 characters.");
    }
    u.password = input.password;
    // An admin password change ends every session of the account.
    for (const s of sessions.values()) if (s.userId === u.id) s.ended = true;
    return [200, userJson(u)];
  }

  const rpc = path.match(/^\/rest\/v1\/rpc\/(create_recovery_key|has_recovery_key|check_recovery_key|replace_recovery_key)$/);
  if (!rpc || req.method !== "POST") return null;
  const input = await readBody(req);
  if (rpc[1] === "check_recovery_key" || rpc[1] === "replace_recovery_key") {
    if (!isAdmin(req)) return dbError(`permission denied for function ${rpc[1]}`, "42501");
    if (rpc[1] === "replace_recovery_key") {
      const u = users.get(input.p_user_id);
      return u ? [200, replaceKey(u)] : dbError("insert or update violates foreign key constraint", "23503");
    }
    const loginId = `${String(input.p_username ?? "").trim().toLowerCase()}${LOGIN_DOMAIN}`;
    const u = [...users.values()].find((x) => x.email === loginId);
    return [200, u && u.keyHash && u.keyHash === keyHash(input.p_key ?? "") ? u.id : null];
  }
  // The browser's calls, with the user's own session token. The database
  // accepts a token until it expires, then checks the session itself.
  const token = sessions.get(bearer(req));
  if (!token) return dbError(`permission denied for function ${rpc[1]}`, "42501");
  const u = users.get(token.userId);
  if (rpc[1] === "has_recovery_key") return [200, Boolean(u.keyHash)];
  if (u.email === null) return dbError("Save your account with a username and password first.");
  if (token.ended || !token.passwordAt || Date.now() - token.passwordAt > TEN_MINUTES) {
    return dbError("Enter your password again to make a recovery key.");
  }
  return [200, replaceKey(u)];
}

http
  .createServer(async (req, res) => {
    const h = {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers":
        req.headers["access-control-request-headers"] || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Content-Type": "application/json",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, h);
      return res.end();
    }
    const url = new URL(req.url, "http://x");
    let body = "[]";
    let status = 200;
    if (url.pathname === "/__mock/requests") {
      if (req.method === "POST") requests = [];
      res.writeHead(200, h);
      return res.end(JSON.stringify(requests));
    }
    requests.push({ method: req.method, path: url.pathname, secretKey: isAdmin(req) });
    if (requests.length > 5000) requests.shift();
    const answer = await accounts(req, url);
    if (answer) {
      const [code, json] = answer;
      res.writeHead(code, h);
      return res.end(json === null ? "" : JSON.stringify(json));
    }
    if (url.pathname === "/rest/v1/sightings" && req.method === "GET") {
      clock = Date.now();
      body = JSON.stringify(rows());
    } else if (url.pathname === "/rest/v1/rpc/vote_on_sighting" && req.method === "POST") {
      // As the database's vote_on_sighting(): one vote per person (this
      // stand-in has one person), and the real map's 1 km check.
      const input = await readBody(req);
      const row = rows().find((r) => r.id === input.target_sighting_id);
      if (!row) {
        status = 400;
        body = JSON.stringify({ code: "P0001", message: "This sighting no longer exists." });
      } else if (
        !DEMO &&
        (input.my_lat == null ||
          input.my_lng == null ||
          distanceM(input.my_lat, input.my_lng, row.lat, row.lng) > 1000)
      ) {
        status = 400;
        body = JSON.stringify({
          code: "P0001",
          message: "You need to be within 1 km of a sighting to confirm or dispute it.",
        });
      } else {
        votes.set(row.id, {
          confirm: input.my_vote === "confirm" ? 1 : 0,
          dispute: input.my_vote === "dispute" ? 1 : 0,
        });
        body = JSON.stringify(rows().find((r) => r.id === row.id));
      }
    } else if (url.pathname.startsWith("/rest/v1/")) body = "[]";
    else if (url.pathname.includes("jwks")) body = JSON.stringify({ keys: [] });
    else {
      status = 404;
      body = "{}";
    }
    res.writeHead(status, h);
    res.end(body);
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log("mock supabase on", PORT, "rows", N, DEMO ? "(demo rules)" : ""),
  );
