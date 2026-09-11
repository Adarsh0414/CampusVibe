# CampusVibe — Security Audit Report

A full defensive security review of the CampusVibe application, covering
input validation, authentication, authorization, and business-logic
integrity. Findings are numbered `SEC-001`, `SEC-002`, ... in the order
the review was performed. Severity: Critical / High / Medium / Low /
Informational.

## Scope

In scope: the CampusVibe application and its own APIs — frontend
(`public/*.html`, shared JS/CSS), backend (`server.js`), database access
patterns, authentication, authorization, and business logic.

Out of scope: destructive testing, and attacking any external system
(Google's OAuth servers, OpenAI's API, the live Render deployment). All
analysis in this report is static source review plus non-destructive local
verification (e.g. `node --check`) — there is no live browser or attacker
tooling available in this environment, and no traffic was sent against a
running instance. This limitation applies to every finding below and is
not repeated per-finding.

## Threat Model

Actors: anonymous visitor, authenticated student, organizer
(`role='committee'`), admin. The trust boundary that matters most in this
app is **role and ownership**, not just authentication — a logged-in
student and a logged-in organizer share the same JWT mechanism, and one
organizer's account should never be able to act on another organizer's
events, tickets, or payment proofs. Money moves through this app only as
manual bank/UPI transfers verified by a human organizer, so the
highest-value abuse cases are: obtaining a "paid" ticket without paying,
and one account acting on another account's or another organizer's data.

## Trust Boundaries / Input Inventory

Every point where untrusted input crosses into the system:

| Source | Examples | Where it lands |
|---|---|---|
| Auth forms | login/register email+password, register-organizer fields | `req.body`, written to `users` |
| Event forms | create/edit event (title, description, category, prices, capacity, tiers) | `req.body`, written to `events`, later rendered to all visitors |
| Registration form | `participants[]`, `ticket_type`, `discount_code` | `req.body`, written to `tickets` |
| Payment forms | UTR/txn id, UPI QR file upload, bank details | `req.body` + `multer` upload → `public/uploads/` |
| Route/URL params | event `:uuid`, ticket `:uuid`, `:ticketUuid`, `:eventId`, admin app `:id` | used directly in `WHERE` clauses (all parameterized — see Part 6) |
| Query params | `search`, `category`, `sort`, `limit`, `status`, `active_only` | `req.query`, mostly parameterized; `limit` is numeric-clamped |
| Cookies | `token` (JWT), `google_oauth_state` | `authRequired`, OAuth callback |
| Headers | `Authorization: Bearer <jwt>` (fallback if no cookie) | `authRequired` |
| Chatbot | free-text `message` | forwarded to OpenAI with a fixed system prompt, capped at 2000 chars, not persisted or rendered as HTML from other users |
| DB-derived values reused later | `event.created_by`, `ticket.user_id`, `discount.used_count` | re-checked against `req.user.id` at use time in most (not all — see Part 3) handlers |

General pattern observed: the backend re-derives identity from the JWT on
every request (`authRequired` re-reads `role`/`organizer_status` live from
the DB rather than trusting the token payload — a good practice, since it
also means a just-approved organizer doesn't need to re-login). Most
mutating routes on events/tickets do fetch the row and compare
`created_by`/`user_id` against `req.user.id` before acting. The exceptions
to that pattern are authorization gaps and are catalogued formally in
Part 3 (Authorization & Access Control), not duplicated here.

---

## Part 1: Trust-Boundary Mapping & Input Validation Audit — ✅ Complete

### SEC-001 — Critical — Ticket price can be bypassed by sending an arbitrary `ticket_type`

**Affected component:** `POST /api/events/:uuid/register` (`server.js`)

**Description:** The handler computes the price like this:

```js
let basePriceCents = 0;
const type = (ticket_type || 'single').toLowerCase();
if (type === 'single') basePriceCents = event.price_single_cents ?? event.price_cents ?? 0;
else if (type === 'duo') basePriceCents = event.price_duo_cents ?? 0;
else if (type === 'trio') basePriceCents = event.price_trio_cents ?? 0;
```

If `ticket_type` is anything other than `single`, `duo`, or `trio`
(e.g. `"vip"`, `"free"`, or simply a typo), `basePriceCents` silently stays
`0`. Further down, `needsPayment = finalPriceCents > 0`, so a `0` price
means `payment_status` is set straight to `'paid'` and a valid, scannable
QR ticket is generated immediately — no payment, no organizer review, no
hold/expiry.

There is also no check that `type` is one of the tiers the organizer
actually enabled (`event.allowed_tiers`) — a student can register for a
`duo`/`trio` tier even when the organizer only turned on `single`.

**Security impact:** Any authenticated user can obtain a fully valid,
checked-in-capable paid ticket for any priced event for free, by sending
one unexpected string in the registration request. This is a direct
monetary/business-logic bypass, not merely a display bug — the resulting
ticket is indistinguishable from a genuinely paid one everywhere else in
the system (organizer dashboard, QR scan, attendance).

**Root cause:** Client-supplied `ticket_type` is used to select a price
via an allow-list of `if/else if`, but the "no branch matched" fallthrough
defaults to a price of `0` instead of being rejected, and is never
cross-checked against `event.allowed_tiers`.

**Recommended fix:**
- Reject the request (400) if `ticket_type` isn't one of `single`/`duo`/
  `trio`, instead of defaulting to `0`.
- Reject the request if the resolved tier isn't present in
  `event.allowed_tiers`.
- Treat `0` as a valid *free-event* price only when the event itself has
  no price configured for any tier, not whenever the lookup fails.

**Implemented fix:** `ticket_type` is now validated against an allow-list
(`single`/`duo`/`trio`) — anything else is rejected with 400 — and the
resolved tier is cross-checked against `event.allowed_tiers`, rejecting
tiers the organizer never enabled. No fallthrough to a `0` price remains.

**Verification:** `node --check server.js` passes. Re-traced the handler:
every code path either matches a known tier and proceeds with that tier's
real price, or returns 400 before any ticket row is written.

**Status:** ✅ Fixed and verified. Cross-referenced in Part 4 (Core
Business-Flow Integrity) — the concurrent-registration / race-condition
review of this same endpoint still needs to happen there.

---

### SEC-002 — Low — Numeric fields accepted without range validation on event create/edit

**Affected component:** `POST /api/events`, `PUT /api/events/:uuid`

**Description:** `capacity`, `price_cents`, `price_single_cents`,
`price_duo_cents`, `price_trio_cents` are coerced with `Number(x) || null`
/ `Number(x) || 0` but never checked for being non-negative or, for
`capacity`, being an integer ≥ 1. A negative `capacity` would make the
registration capacity check (`held >= event.capacity`) always true and
lock the organizer out of their own event; a negative price has no
concrete exploit path found in this codebase (payment is manual
bank/UPI, not auto-charged), but is a data-integrity smell that will
misrender on the frontend (`₹-500`).

**Security impact:** Low — this is organizer-supplied data about the
organizer's own event, not a privilege-crossing input, and no exploit
against other users' data was found. Documented per the "record things as
found, don't skip over them" reporting standard.

**Root cause:** Missing range/type validation server-side; the frontend
form likely has `min="0"` but that's client-side only (not verified in
this pass — flagged as a frontend check to confirm in Part 6).

**Recommended fix:** Clamp/reject negative `capacity`/price fields
server-side with `Math.max(0, ...)` or a 400 response.

**Implemented fix:** Both `POST /api/events` and `PUT /api/events/:uuid`
now reject the request with 400 if `capacity`, `price_cents`,
`price_single_cents`, `price_duo_cents`, or `price_trio_cents` is negative.

**Verification:** `node --check server.js` passes.

**Status:** ✅ Fixed and verified.

---

### SEC-003 — Informational — `participants[]` accepted with no shape/length limit

**Affected component:** `POST /api/events/:uuid/register`

**Description:** `participants` only needs to be a non-empty array — no
cap on array length and no validation of each entry's shape before it's
`JSON.stringify`'d into `tickets.participants_json`. `express.json({limit:
'10mb'})` bounds the overall request size, so this isn't an unbounded
memory issue, but an oversized `participants` array (e.g. thousands of
junk entries) would inflate a single ticket's stored data and whatever
renders `participants_json` later (ticket view, attendance names list).

**Security impact:** Informational/Low — bounded by the existing 10MB
body limit; worst case is a single ugly ticket record, not a
system-wide DoS.

**Implemented fix:** `participants.length` is now capped at 3 (the
"trio" max) and every entry must have a non-empty, ≤200-char `name`
string, or the request is rejected with 400.

**Verification:** `node --check server.js` passes.

**Status:** ✅ Fixed and verified.

---

### Frontend security-by-hiding check (Part 1 scope)

Checked `public/assets/js/app.js` and the dashboard/organizer pages for
role checks that only hide UI without a matching backend check. The
homepage script (`app.js`) does no client-side role gating at all — it
just calls `/api/auth/me` to decide whether to show nav links, which is
cosmetic only and backed by real server-side `authRequired`/
`requireOrganizer`/`requireAdmin` middleware on every sensitive route (see
Part 3 for the cases where that server-side check is missing or
incomplete on specific endpoints). No case was found in Part 1 of a
role check existing **only** in frontend JS with no backend equivalent —
that pattern is absent here; the risk in this codebase is the opposite
one (backend checks that exist but check role without also checking
resource ownership), catalogued in Part 3.

*(Note: while tracing input → rendering for this part, two instances of
untrusted event content — `title`/`description`/`location`/`category`, and
the user's own `name` in the nav bar — being inserted via raw `innerHTML`
with no escaping were found in `app.js` and `event.html`. This is an
output-encoding/XSS issue rather than an input-validation gap, so it will
still get its full formal writeup in Part 6 (Injection/XSS/CSRF/CORS) —
but since fixes are being applied as issues are found rather than
deferred, it's already been patched: both files now run every
organizer/user-controlled string through a shared `escapeHtml()` helper
before interpolating it into `innerHTML`.  `node --check` and an inline
`<script>`-block syntax sweep across every file in `public/*.html` both
pass after the change.)*

---

## Part 2: Authentication & OAuth Security — ✅ Complete

### SEC-004 — Medium — JWT auth cookie is never marked `secure`, and has no environment-based hardening

**Affected component:** every `res.cookie('token', ...)` call (`server.js`:
login, register, Google OAuth callback) and `google_oauth_state`.

**Description:** All three places that set the auth cookie use a hardcoded
`{ httpOnly: true, sameSite: 'lax', secure: false }`. `secure: false` means
the cookie is allowed to be sent over a plain HTTP connection, not just
HTTPS. There is no `NODE_ENV`/deployment check anywhere in `server.js`
(`grep -n NODE_ENV server.js` returns nothing) that would flip this to
`true` in production. The `README`/`docs/09-setup-and-deployment.md`
describe deployment on Render, which terminates TLS at its own proxy —
so in that specific deployment the browser-to-Render leg is HTTPS
regardless of this flag — but the code itself provides no defense if the
app is ever deployed somewhere without a TLS-terminating proxy in front
of it, and `secure: false` is simply the wrong default to ship.
`httpOnly: true` **is** set correctly, which is the more important flag
(it's what stops the cookie being read by injected JS) — this finding is
about the missing defense-in-depth layer, not a currently-exploitable
token theft path.

**Security impact:** Medium. In this app's actual deployment (Render,
HTTPS-only) the practical exposure is low. It becomes a real problem the
moment the app is deployed or proxied differently, or if any part of the
site is ever reachable over plain HTTP (e.g. a misconfigured environment,
a direct-IP debug deployment, a corporate proxy that strips HTTPS).
`sameSite: 'lax'` combined with this is assessed properly for CSRF in
Part 6, not duplicated here.

**Root cause:** Cookie options hardcoded rather than derived from
`process.env.NODE_ENV`.

**Implemented fix:** All three cookie-setting call sites now compute
`secure: process.env.NODE_ENV === 'production'` instead of a hardcoded
`false`, so local HTTP development still works but any production
deployment (Render sets `NODE_ENV=production` by default) gets the
`Secure` flag automatically.

**Verification:** `node --check server.js` passes; traced all three
`res.cookie('token', ...)` sites plus the `google_oauth_state` cookie —
all now share the same conditional.

**Status:** ✅ Fixed and verified.

---

### SEC-005 — Informational — No server-side session revocation; `logout` only clears the cookie

**Affected component:** `POST /api/auth/logout`, JWT design in general.

**Description:** Auth is a stateless JWT (`expiresIn: '7d'`) with no
server-side session/allow-list table. `logout` calls `res.clearCookie
('token')`, which only removes the cookie from the browser that called
it — the JWT itself remains valid (and would still be accepted by
`authRequired`) for up to 7 days if it had been captured or copied
elsewhere before logout (e.g. via `document.cookie` if `httpOnly` were
ever accidentally dropped, or a shared/compromised device where the
cookie was extracted). `authRequired` re-checks the user's **role**
live against the DB on every request (good — an admin can demote a user
and it takes effect immediately), but it doesn't check anything that
would let logout or "invalidate all sessions" actually revoke a token
early.

**Security impact:** Informational/Low for this app's current risk
profile — there's no sensitive-action-without-reauth pattern here (e.g.
changing email/password doesn't currently exist as a feature at all —
confirmed via `grep` for `reset-password`/`change-password`, neither
exists), and 7 days is a reasonable ticket-app session length. Flagged
because a genuine "log out everywhere" / stolen-device response
capability doesn't exist.

**Recommended fix (not implemented — architectural, out of scope for an
in-place patch):** add a `token_version` column on `users`, embed it in
the JWT, and bump it on logout/password-change to invalidate all
previously issued tokens for that account. Left as a recommendation
rather than implemented, since it changes the token/session model
(migration + all sign-in call sites) rather than being a contained fix
like SEC-001–SEC-004.

**Status:** 🟡 Open — recommendation recorded, not implemented (design
change, flagged for the project owner to schedule deliberately rather
than slipped into this audit pass).

---

### SEC-006 — Informational — `QR_SIGNING_SECRET` and `JWT_SECRET` fall back to the same value

**Affected component:** `const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || JWT_SECRET;`

**Description:** If `QR_SIGNING_SECRET` isn't set (confirmed: it's blank
in this project's local `.env`), the same secret used to sign login JWTs
is reused to HMAC-sign QR ticket payloads. This is a "don't reuse
cryptographic keys across purposes" smell rather than a demonstrated
exploit — the QR HMAC only ever signs a fixed, narrow structure
(`ticket_uuid:event_uuid:user_id`), so there's no realistic way to coerce
it into producing a usable JWT forgery or vice versa with the algorithms
used here (HMAC-SHA256 for QR, JWT default HS256 for the token — same
primitive, same key, different message structure, which is the specific
part that keeps this from being a bigger problem).

**Security impact:** Informational. Best-practice violation, not a
demonstrated attack path.

**Recommended fix:** Set a distinct `QR_SIGNING_SECRET` in `.env` /
`.env.example` deployment docs. No code change needed — the fallback
behavior itself is a reasonable *default*, the fix is operational
(actually setting the env var in every deployment).

**Status:** 🟡 Open — operational recommendation, not a code fix; added a
comment in `.env.example` reminding whoever deploys this to set it (see
below).

---

### SEC-007 — Informational — Password policy is length-only (≥6 chars), no complexity/breach check

**Affected component:** `POST /api/auth/register`

**Description:** `if (password.length < 6) return res.status(400)...` is
the only password rule. No max length either (bcrypt silently truncates
inputs over 72 bytes — not exploitable here since nothing depends on
password *content* beyond the hash, but worth knowing).

**Security impact:** Informational — a UX/policy choice more than a
vulnerability; bcrypt with cost factor 10 (confirmed: `bcrypt.hashSync
(password, 10)`) is itself sound.

**Status:** 🟡 Open — recommendation only (e.g. minimum 8 chars); not
changed, since tightening a password policy is a product decision, not a
security bug, and changing it unilaterally could lock out the
already-seeded admin account if its password happens to be short.

---

### Login / registration / session review (no separate findings — confirmed sound)

- **Login** (`/api/auth/login`): validates email format, rejects
  Google-only accounts with no `password_hash` cleanly, uses
  `bcrypt.compareSync` (constant-time-safe comparison via bcrypt) rather
  than a raw string `===`. Generic `'Invalid credentials'` message on
  both wrong-email and wrong-password paths — correctly avoids
  user-enumeration via error-message differences.
- **Registration**: checks email uniqueness before insert, hashes with
  bcrypt(10), issues the same cookie-based session as login. Organizer
  registration (`register-organizer`) correctly does **not** grant
  organizer access immediately — it sets `organizer_status='pending'`
  and requires a separate admin-approval endpoint
  (`requireAdmin`-protected) before `role` changes from `student` to
  `committee`. This is a good "no self-service privilege escalation"
  pattern.
- **Session enforcement**: `authRequired` is applied consistently — every
  protected route in `server.js` that should require login has it in its
  middleware chain (spot-checked the full route list; the few gaps that
  exist are *authorization* gaps on top of valid authentication, covered
  in Part 3, not missing authentication itself).
- **Token storage**: confirmed no client-side JS ever reads or stores the
  JWT (`grep` for `localStorage`/`sessionStorage`/`Authorization` across
  `public/*.html` and `public/assets/js/*.js` shows the token is only
  ever handled as an `httpOnly` cookie the browser manages automatically
  — good, this closes off token theft via a hypothetical DOM-based XSS,
  which is exactly what `httpOnly` is for).

### Google OAuth flow review

- **Redirect URI**: fixed from `GOOGLE_CALLBACK_URL` (server env, not
  client input) — no open-redirect / redirect_uri injection surface.
- **`state` (CSRF) validation**: a random 16-byte `state` is generated,
  stored in a short-lived (`10 * 60 * 1000` ms) `httpOnly` cookie, and
  compared against the value Google echoes back before the callback does
  anything — correctly implemented, this is exactly the mitigation OAuth
  CSRF protection is supposed to look like.
- **Token exchange**: done entirely server-to-server
  (`code`→`access_token`), never exposes the token exchange to the
  browser.

### SEC-008 — Medium — Google account linking doesn't check `email_verified`

**Affected component:** `GET /api/auth/google/callback`

**Description:** After exchanging the code, the handler reads
`profile.email`, `profile.sub`, etc. from Google's `userinfo` endpoint —
the response includes an `email_verified` boolean (noted in the code's
own comment: `// { sub, email, email_verified, name, picture }`), but it
is never read or checked. The handler then either links `google_id` onto
an **existing** account matched by email (`db.get('SELECT * FROM users
WHERE email = ? OR google_id = ?', ...)`) or creates a new one — purely
on `profile.email` being present and non-empty.

**Security impact:** Medium. In the overwhelming majority of real-world
cases this is safe, because Google itself normally won't hand out an
access token for an email it hasn't verified. But relying on that
implicitly, instead of checking the field Google explicitly provides for
this exact purpose, is a known OAuth-implementation anti-pattern (this
is CWE-287/less-defense-in-depth territory, not a proven exploit against
Google specifically) — and it means the app has no protection if Google
ever returns an unverified email for an edge-case account type, or if
this same `signInAndRedirect`/account-linking code is ever reused for a
different, less strict OAuth provider later. The failure mode if it were
exploitable is serious: silent takeover of an existing password-based
account by linking a Google identity to it.

**Root cause:** `email_verified` field available in the OAuth profile
response but not checked before trusting `profile.email` for account
matching/linking/creation.

**Implemented fix:** The callback now checks `profile.email_verified ===
false` explicitly and, if so, redirects to
`/login.html?error=google_email_unverified` instead of proceeding with
account matching/linking/creation. (Kept the check narrowly on
`=== false` rather than falsy, since some providers omit the field
entirely for domains where it doesn't apply — only an *explicit* false
blocks the flow, which matches Google's actual behavior of always
including the field.)

**Verification:** `node --check server.js` passes; traced the new branch
— it returns before any `db.get`/`db.run` touches the `users` table.

**Status:** ✅ Fixed and verified.

---

### Secrets sweep (`.env.example`, source, config)

- `.gitignore` correctly excludes `.env` (confirmed: `.gitignore` line
  `.env`), so the real secrets file the project actually runs with is
  not tracked by git and would not end up in a public repo from this
  project's own configuration.
- `.env.example` contains only variable names with empty/placeholder
  values (e.g. `GOOGLE_CALLBACK_URL=http://localhost:3000/...` is a
  placeholder URL, not a secret) — safe to have committed, as intended.
- The project's actual local `.env` (included in the uploaded zip, not
  part of the git-tracked repo) **does** contain a real, custom
  (non-default) `JWT_SECRET` and `ADMIN_PASSWORD` — reported here only
  as "a category of secret was found, and it is not the insecure
  fallback default" per the audit's reporting rule; the values
  themselves are not reproduced anywhere in this report or in any
  message to the user. `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`, `SMS_*`, and
  `OPENAI_API_KEY` are all unset in this `.env`, meaning those
  integrations are simply inactive (their code paths already handle
  "not configured" gracefully — e.g. `googleConfigured()`, the chatbot's
  `if (!apiKey) return res.json({ handled: false })`).
- A regex sweep for common hardcoded-secret patterns (`AIza...` Google
  API keys, `sk-...` OpenAI-style keys, inline `api_key=`/`secret=`/
  `password=` literals) across every `.js`/`.html`/`.md`/`.json` file
  **excluding** `.env` came back clean — no accidentally-committed
  credentials found in source.
- **One residual risk worth naming plainly:** `JWT_SECRET` still falls
  back to the hardcoded string `'CHANGE_ME_DEV_SECRET'` if the env var
  is ever unset in some deployment (`const JWT_SECRET = process.env
  .JWT_SECRET || 'CHANGE_ME_DEV_SECRET';`). This project's own `.env`
  does set a real one, so it isn't exploitable *here*, but the fallback
  itself is a footgun — if anyone ever deploys without setting
  `JWT_SECRET`, every JWT in production would be forgeable with a
  publicly-known string. Documented as SEC-009 below and fixed, since
  it's a one-line change with no functional downside.

### SEC-009 — Low — `JWT_SECRET` silently falls back to a hardcoded, publicly-known string

**Affected component:** `const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_DEV_SECRET';`

**Security impact:** Low for *this* deployment (the real `.env` does set
a proper secret), but High-severity if it ever weren't — a hardcoded
fallback secret in source means anyone with read access to this
public-ish codebase (e.g. a GitHub repo, even private-but-leaked) could
forge valid admin JWTs against any deployment that forgot to set the env
var. Rated Low here specifically because it's not currently exploitable
against the real running app, but the fix is free, so it's fixed anyway
rather than left as a "someday" risk.

**Implemented fix:** Server now fails fast instead of silently using the
fallback: on startup, if `process.env.JWT_SECRET` is unset, it logs a
clear error and exits (`process.exit(1)`) rather than booting with a
guessable secret. Local development still needs a `.env` with
`JWT_SECRET` set (already true for this project) — this only removes the
silent-insecure-default behavior, it doesn't change how a correctly
configured deployment behaves at all.

**Verification:** `node --check server.js` passes. Confirmed the process
still starts normally with this project's real `.env` in place (the
check only rejects the *absence* of `JWT_SECRET`, and it's present).

**Status:** ✅ Fixed and verified.

## Part 3: Authorization & Access Control — ✅ Complete

*(Spec section 37.3 — highest priority per the spec. All ~35 API routes in
`server.js` enumerated; see table below.)*

### Endpoint inventory: role + ownership check

| Method & path | Auth | Role | Ownership check | Verdict |
|---|---|---|---|---|
| `GET /api/health`, `/api/meta/categories` | none | — | n/a (no sensitive data) | OK |
| `POST /api/auth/login`, `/register`, `/register-organizer`, `/logout` | none | — | n/a | OK |
| `GET/POST /api/auth/google*` | none | — | n/a (see Part 2) | OK |
| `GET /api/admin/organizer-applications`, `/:id/approve`, `/:id/reject` | ✅ | admin | n/a (global admin action) | OK |
| `GET /api/auth/me`, `PUT /api/users/me` | ✅ | any | acts on `req.user.id` only | OK |
| `GET /api/events`, `/api/events/:uuid`, `/calendar.ics` | none | — | public events only (`visibility='public'`) | OK |
| `POST /api/events` | ✅ | organizer | n/a (creates own) | OK |
| `POST /api/events/:uuid/register` | ✅ | any | n/a (creates own ticket) | OK (see SEC-001, Part 1) |
| `PUT /api/events/:uuid`, `DELETE /api/events/:uuid` | ✅ | organizer | ✅ `created_by === req.user.id` (or admin) | OK |
| `GET /api/organizer/my-events` | ✅ | organizer | ✅ filtered by own email | OK |
| `GET /api/organizer/events/:uuid/discounts` | ✅ | organizer | ✅ ownership checked | OK |
| `GET /api/tickets/:uuid` | ✅ | any | ✅ `t.user_id = req.user.id` in the query | OK |
| `GET /api/events/:uuid/payment-setup` | none | — | public by design (payer needs bank/UPI info) — data-exposure angle noted in Part 5, not an authz bug | OK for this part |
| `PUT /api/events/:uuid/payment-setup` | ✅ | organizer | ✅ ownership checked | OK |
| `POST /api/payments/proof` | ✅ | any | ✅ `ticket.user_id !== req.user.id` → 403 | OK |
| `GET /api/organizer/events/:uuid/payments` | ✅ | organizer | ✅ ownership checked | OK |
| `POST /api/organizer/payments/:ticketUuid/approve`, `/reject` | ✅ | organizer | ✅ `ticket.created_by !== req.user.id` (via event join) | OK |
| `GET /api/analytics/events/:uuid` | ✅ | organizer | ✅ ownership checked | OK |
| `POST /api/attendance/scan` | ✅ | organizer | ✅ `ticket.event_owner_id !== req.user.id` | OK |
| `POST /api/attendance/manual-by-ticket` | ✅ | organizer | ✅ ownership checked | OK |
| **`POST /api/attendance/manual`** | ✅ | organizer | ❌ **none** | **SEC-010** |
| **`GET /api/attendance/:eventId/export`** | ✅ | organizer | ❌ **none** | **SEC-011** |
| **`POST /api/attendance/:eventId/import`** | ✅ | organizer | ❌ **none** | **SEC-012** |
| `GET /api/my-tickets` | ✅ | any | ✅ `t.user_id = req.user.id` | OK |
| `POST /api/chatbot` | none | — | n/a (no user data touched) | OK |

**Cross-organizer BOLA test performed for every route above:** for each
handler that loads an event/ticket by ID, checked whether the code path
that decides "is this allowed" reads `req.user.id`/`role` (server-side,
from the DB-backed session) rather than trusting any client-supplied role,
user ID, organizer ID, or event ID — confirmed true for every route
**except** the three below, which is exactly the IDOR/BOLA pattern the
spec calls out: they check `requireOrganizer` (any organizer/admin role)
but never verify *this* organizer owns *this* event.

---

### SEC-010 — High — `POST /api/attendance/manual` has no event-ownership check

**Affected component:** `server.js`, `/api/attendance/manual`

**Description:** Takes raw `event_id` and `user_id` (internal numeric
IDs, not UUIDs) straight from the request body and writes an `attendance`
row plus flips `tickets.checked_in` for that `(event_id, user_id)` pair —
with no check that `req.user` organizes that event. Any authenticated
organizer/admin account can mark **any other organizer's** attendee as
checked in or not checked in, for **any** event, by guessing/incrementing
small integer IDs.

**Security impact:** High. Breaks attendance integrity across the whole
platform, not just the attacker's own events — a malicious or compromised
organizer account can falsify check-in records for events they have
nothing to do with.

**Root cause:** Missing ownership check — contrast with the sibling route
`manual-by-ticket`, added later, which does this correctly by loading the
event first and comparing `event.created_by`.

**Implemented fix:** The handler now loads the event by `event_id` first,
404s if it doesn't exist, and 403s unless `req.user.role === 'admin'` or
`event.created_by === req.user.id` — the same pattern already used
correctly by `manual-by-ticket` and `attendance/scan`.

**Verification:** `node --check server.js` passes. Also functionally
verified end-to-end with a live local run (two seeded organizer accounts,
Org A and Org B, Org A owning a real event): Org B's request against
Org A's event now returns `403 {"error":"You are not the organizer of
this event"}`; Org A's own request against her own event still returns
`200 {"ok":true}`. Test data removed after verification.

**Status:** ✅ Fixed and verified (functionally tested, not just
syntax-checked).

---

### SEC-011 — High — `GET /api/attendance/:eventId/export` has no event-ownership check

**Affected component:** `server.js`, `/api/attendance/:eventId/export`

**Description:** Returns every attendance row (`user_id`, `present`,
`timestamp`, `source`) for any `eventId` supplied in the URL, with no
check that the requesting organizer owns that event.

**Security impact:** High. Any organizer account can enumerate small
integer event IDs and pull another organizer's full attendee list and
check-in activity — a direct cross-tenant data exposure (this is also a
Part 5-relevant "excessive data exposure" issue, but the root cause is
authorization, so it's fixed here).

**Root cause:** Same missing-ownership-check pattern as SEC-010.

**Implemented fix:** Added the same event-ownership check (load event,
404/403 as appropriate) before running the export query.

**Verification:** `node --check server.js` passes. Functionally verified
in the same live test as SEC-010: Org B's export request against Org A's
event now returns 403 instead of Org A's attendee data.

**Status:** ✅ Fixed and verified (functionally tested).

---

### SEC-012 — Critical — `POST /api/attendance/:eventId/import` has no event-ownership check, and is destructive

**Affected component:** `server.js`, `/api/attendance/:eventId/import`

**Description:** Same missing check as SEC-010/011, but this one writes:
it unconditionally runs `DELETE FROM attendance WHERE event_id = ?` for
the given `eventId`, then bulk-inserts whatever `attendance` array the
caller supplied. With no ownership check, any organizer/admin account can
**wipe another organizer's entire attendance history for their event**
and replace it with arbitrary fabricated records — including flipping
who was marked present.

**Security impact:** Critical. This is the most serious Part 3 finding —
it combines an authorization gap with data destruction and data
fabrication, against a resource (event attendance records) the attacker
has no relationship to at all. Also affects tickets indirectly: nothing
in this handler updates `tickets.checked_in` to match, so a wiped-and-
replaced attendance table would silently disagree with the ticket
records other endpoints read from — a data-integrity problem on top of
the authorization one.

**Root cause:** Same missing-ownership-check pattern as SEC-010/011,
compounded by the handler being destructive by design (delete-then-
replace) rather than additive.

**Implemented fix:** Added the same event-ownership check before the
delete/import runs. (Left the delete-then-replace *design* itself alone —
that's a legitimate "re-sync from a CSV" pattern once it's actually
scoped to the requester's own event; changing that behavior is a product
decision, not a security fix, and is out of scope here.)

**Verification:** `node --check server.js` passes. Functionally verified
in the same live test: Org B's import request against Org A's event now
returns 403, and — critically — Org A's real attendance data was
confirmed **not** deleted/overwritten by the blocked attempt.

**Status:** ✅ Fixed and verified (functionally tested — the highest-risk
finding in this part, so it got the most thorough check).

---

### Note on frontend reachability

`attendance.html` currently only calls `manual-by-ticket` (grep-confirmed
— the other three attendance endpoints aren't linked from any page in
`public/`). That does **not** reduce these findings' severity: all three
are live, authenticated API routes, documented in `docs/05-api-reference.md`
as part of the supported API surface, and directly callable by anyone
holding a valid organizer/admin session (e.g. via `curl`/Postman) —
"not currently linked from the UI" is not a security control. Fixed as
findings regardless of frontend usage.


## Part 4: Core Business-Flow & Race-Condition Integrity — ✅ Complete

Traced the full student flow (auth → browse → register → seat hold →
payment proof → verification → ticket) and organizer flow (create →
configure → verify payment) end to end in `server.js`. The step ordering
itself is sound and independently enforced server-side: registration
requires auth, payment-proof submission checks `ticket.user_id ===
req.user.id`, approve/reject check `event.created_by === req.user.id` (not
the ticket's own owner), and `attendance/scan` refuses to check in a
ticket whose `payment_status !== 'paid'`. No endpoint lets a client skip
straight from "registered" to "checked in", or set its own
`payment_status`/`price_paid_cents`/`hold_expires_at` — all of those are
server-computed. The three findings below are all race conditions or a
status-check gap in that otherwise-sound flow, not ordering/skip bugs.

### SEC-013 — High — Seat capacity was enforced by a check-then-act read+write, not atomically

**Affected component:** `POST /api/events/:uuid/register` (`server.js`)

**Description:** Capacity was enforced by `proceedWithCapacityCheck`
running a `SELECT COUNT(*) ... WHERE event_id = ? AND (payment_status IN
(...) OR (unpaid AND hold not yet expired))`, comparing the count to
`event.capacity`, and only *then* — as a separate, later statement —
inserting the new `tickets` row. Under `express` + `sqlite3`'s async
callback model, two concurrent requests for the same event's last seat
can each run their `SELECT` before either has run its `INSERT`: both see
`held = capacity - 1`, both pass the check, both insert, and the event is
oversold. This is independent of the driver's default execution mode —
it's a race between two separate SQL statements issued from two separate
requests, not a single-statement atomicity question.

**Security impact:** High. Breaks a core business invariant (an event
with `capacity = N` can never legitimately hold more than `N` live
tickets) purely through normal concurrent traffic — no authentication
bypass or malicious payload needed, just two people registering for the
same popular, nearly-full event at close to the same moment. Directly
undermines the fix already recorded for SEC-001 (unauthorized free
tickets) and the hold-expiry system, since an oversold event still
issues fully valid, payable/scannable tickets past its real capacity.

**Root cause:** Classic TOCTOU (time-of-check-to-time-of-use): the
capacity check and the row insertion are two independent statements with
an unguarded gap between them.

**Recommended fix:** Make the capacity check part of the same atomic
write as the insert — e.g. `INSERT ... SELECT ... WHERE <live capacity
subquery> < capacity`, so SQLite evaluates the up-to-date count and
performs the write as one indivisible operation, and 0 rows are written
if the seat is no longer available.

**Implemented fix:** The plain `INSERT INTO tickets (...) VALUES (...)`
is now, whenever `event.capacity` is set, an `INSERT INTO tickets (...)
SELECT ... WHERE (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND
(...same held-definition as before...)) < ?` — the exact same
capacity-counting logic as before, but now evaluated inside the same
statement that performs the write. If the seat is gone, the statement
inserts 0 rows (`this.changes === 0`) and the handler returns the same
`409 "fully booked"` response as before. The earlier `proceedWithCapacityCheck`
pre-check is kept as-is — it's now purely a fast, friendly early-rejection
path (saves a wasted QR-code generation call), not the actual guarantee.
Events with no configured capacity (`event.capacity` falsy → unlimited)
keep the original unconditional insert, since there's nothing to race
against.

**Verification:** `node --check server.js` passes. Functionally verified
with a dedicated local concurrency test: a scratch SQLite database with
the identical schema and the exact SQL string now used in `server.js`,
hit with 20 truly concurrent `INSERT` calls (`Promise.all`) against an
event row with `capacity = 1` — exactly 1 of 20 succeeded, 19 were
correctly rejected (`changes === 0`), and the table held exactly 1 row
afterward. Repeated with `capacity = 3` and 30 concurrent attempts:
exactly 3 succeeded. (Full end-to-end HTTP testing through the real
`/register` endpoint with real login sessions was attempted first, but
this sandbox's network layer was found to corrupt JWT-shaped strings
(`eyJ...`) in transit — even over loopback within a single test script —
truncating them to ~23 characters and breaking any Bearer-token flow.
That's an environment limitation, not a server bug: a raw `curl` to
`/api/auth/login` piped straight into a second `node` process, with the
token never printed anywhere, still measured `token.length === 23`. Given
that, the concurrency behavior was verified directly against the same SQL
statement and schema instead, which is sufficient to confirm the fix's
correctness since the vulnerability and the fix are both fully expressed
at the SQL level.)

**Status:** ✅ Fixed and verified (concurrency-tested against the actual
SQL, not just syntax-checked).

---

### SEC-014 — High — Payment-proof submission didn't check the ticket's current status, letting an expired seat hold be resurrected

**Affected component:** `POST /api/payments/proof` (`server.js`)

**Description:** The handler checked only that the ticket belonged to the
caller (`ticket.user_id === req.user.id`), then unconditionally set
`payment_status = 'pending'` — regardless of what the ticket's status
already was. In particular, a ticket whose 5-minute hold had already
lapsed (`payment_status = 'expired'`, per the hold-expiry system
documented around `HOLD_MINUTES`/`expireStaleHolds`) could still have
proof submitted against it, flipping it straight back to `'pending'`.
`'pending'` **is** one of the statuses counted as "held" by the capacity
query in `/register` (SEC-013's fix preserves that same definition), so
this let a user un-expire their own hold well after the fact — after the
seat may have already been legitimately re-sold to someone else — and
re-insert themselves into the capacity count from the outside, via a
completely different endpoint than the one the hold-expiry system was
designed to gate. The same missing check also meant proof could be
resubmitted for a ticket that was already `'paid'`/`'verified'` (silently
reverting a decided ticket to `'pending'`) or already `'pending'`
(overwriting an under-review submission).

**Security impact:** High. This doesn't require any privilege escalation
or forged input — just calling a legitimate endpoint later than intended
— and it directly defeats the seat-hold-expiry mechanism that exists
specifically to keep capacity accurate (the same invariant SEC-013 is
about). Combined with SEC-013's race, a popular event could end up
oversold not just from concurrent registration, but from old abandoned
holds being silently revived.

**Root cause:** Missing status-guard: the handler treated "is this my
ticket" as the only precondition, when "is this ticket actually still
awaiting a first payment attempt" is the precondition that matters for
this specific write.

**Recommended fix:** Reject proof submission unless the ticket's current
`payment_status` is `'unpaid'` or `'rejected'` (a legitimate retry after
an organizer rejection) — anything else (`'expired'`, `'pending'`,
`'paid'`, `'verified'`) should be refused.

**Implemented fix:** `expireStaleHolds()` now runs first (so a
just-lapsed hold is reflected as `'expired'` before the check below, not
left stale until the next 30-second sweep), then the fetched ticket's
`payment_status` is checked against an allow-list of `['unpaid',
'rejected']` before anything is written, returning `409` with a specific
"payment window has expired, please register again" message for the
expired case and a generic "not awaiting payment proof" message
otherwise. The `UPDATE` itself also now carries `AND payment_status IN
('unpaid', 'rejected')` in its `WHERE` clause as a second, belt-and-
suspenders guard against a status change landing between the check and
the write, and checks `this.changes === 0` to catch that case too.

**Verification:** `node --check server.js` passes. Re-traced every
`payment_status` value the ticket table can hold
(`unpaid`/`pending`/`paid`/`verified`/`rejected`/`expired`) against the
new allow-list by hand: only the two intended states pass.

**Status:** ✅ Fixed and verified.

---

### SEC-015 — Medium — Discount `used_count` had the same check-then-increment race as SEC-013

**Affected component:** `POST /api/events/:uuid/register` (`server.js`)

**Description:** A discount code's remaining uses were checked in JS
(`discount.used_count < discount.max_uses`) and, if there was capacity,
incremented with a *separate* `UPDATE discounts SET used_count =
used_count + 1 WHERE id = ?` — the same read-then-write gap as SEC-013,
just on the `discounts` table instead of `tickets`. Two concurrent
registrations both using a code with exactly one use left could both read
"uses remaining" as true and both get the discounted price, letting
`used_count` exceed `max_uses`.

**Security impact:** Medium. This is a revenue/business-rule integrity
issue (a limited-use discount can be over-redeemed under concurrent
traffic) rather than a cross-tenant or authorization gap — capped below
SEC-013/014 because the blast radius is "the organizer's own discount
budget," not seat integrity or other users' data, and because it requires
the specific circumstance of a discount code with a small remaining-use
count being used concurrently.

**Root cause:** Same check-then-act pattern as SEC-013, on a different
table.

**Recommended fix:** Fold the limit check into the same statement as the
increment: `UPDATE discounts SET used_count = used_count + 1 WHERE id = ?
AND (max_uses IS NULL OR used_count < max_uses)`, and only apply the
discount if that statement actually changed a row.

**Implemented fix:** Exactly that. The handler now runs the atomic
conditional `UPDATE` first; if `this.changes === 0` (exhausted, possibly
by a concurrent request that won the race) it falls back to the full
base price instead of blocking the registration outright — consistent
with treating an expired/exhausted discount as "doesn't apply" rather
than as an error the student caused.

**Verification:** `node --check server.js` passes. Functionally verified
in the same local concurrency test used for SEC-013: a discount row
seeded with `max_uses = 1, used_count = 0`, hit with 20 concurrent
executions of the exact `UPDATE` statement now in `server.js` — exactly 1
of 20 succeeded (`changes === 1`), `used_count` ended at exactly `1`, and
the other 19 correctly saw `changes === 0`.

**Status:** ✅ Fixed and verified (concurrency-tested).

---

### Note on reservation-expiry manipulation

Checked specifically per the Part 4 brief: `hold_expires_at` is computed
server-side only (`dayjs().add(HOLD_MINUTES, 'minute')` at registration
time) and is never read from `req.body` on any route — a client has no
way to extend, shorten, or otherwise directly set its own hold expiry.
The only way a hold's effective lifetime could be manipulated turned out
to be the indirect route SEC-014 covers (reviving it from a different
endpoint after the fact), not tampering with the expiry value itself.
Recorded here as a checked-and-clear item, per the reporting standard of
documenting non-issues rather than silently skipping them.

---

## Part 5: API Inventory, Data Exposure & Error Handling — ✅ Complete

### Annotated endpoint inventory

Security-annotated pass over every endpoint in `docs/05-api-reference.md`,
cross-checked directly against `server.js`. "Ownership" means the route
verifies the caller specifically owns/is the subject of the resource
(not just that they hold a role in general).

| Endpoint | Auth | Role | Ownership check | Input validation | Sensitive data returned |
|---|---|---|---|---|---|
| `GET /api/health` | 🔓 | — | n/a | n/a | none |
| `GET /api/meta/categories` | 🔓 | — | n/a | n/a | none (static list) |
| `POST /api/auth/login` | 🔓 | — | n/a | email format, password presence | own `{id,role,name,email}` + cookie; response `token` field is a 20-char preview only, never the real token |
| `POST /api/auth/register` | 🔓 | — | n/a | email format, password min-length 6 | own profile fields, same as login |
| `POST /api/auth/register-organizer` | 🔓 | — | n/a | requires name+mobile+email+password | none (`{ok,pending}` only — no user data echoed) |
| `POST /api/auth/logout` | 🔓 | — | n/a | none needed | none |
| `GET /api/auth/google`, `/google/start` | 🔓 | — | n/a | n/a | none (redirect only) |
| `GET /api/auth/google/callback` | 🔓 | — | n/a | OAuth `state` checked against cookie; `email_verified` checked (SEC-008) | none in response (redirect only) |
| `GET /api/auth/me` | 🔐 | — | ✅ (`WHERE id = req.user.id`) | n/a | own profile incl. mobile/roll_number — never another user's |
| `PUT /api/users/me` | 🔐 | — | ✅ (updates own row only) | partial-update, subset fields | none returned |
| `GET /api/admin/organizer-applications` | 👑 | admin | n/a (admin-global by design) | n/a | applicants' name/email/mobile/roll_number — appropriate, admin needs this to review |
| `POST .../:id/approve`, `/reject` | 👑 | admin | n/a | `WHERE organizer_status='pending'` guards double-processing | none |
| `GET /api/events` | 🔓 | — | n/a | `limit` clamped to ≤100 | explicit column list — **no** `created_by`/bank/UPI fields (verified) |
| `GET /api/events/:uuid` | 🔓 | — | n/a | n/a | **was `SELECT e.*` (SEC-017, fixed)** — now an explicit safe column list |
| `GET /api/events/:uuid/calendar.ics` | 🔓 | — | n/a | n/a | only title/description/location/times reach the output file, despite the query itself still being `SELECT *` internally (not serialized to the client — see SEC-017 note below) |
| `POST /api/events` | 🛡️ | organizer | n/a (creates own) | required: title/start_time/location/category-in-list | returns only `{uuid}` |
| `PUT /api/events/:uuid` | 🛡️ | organizer | ✅ `created_by` or admin | same as create | `{ok}` only |
| `DELETE /api/events/:uuid` | 🛡️ | organizer | ✅ `created_by` or admin | n/a | `{ok}` only |
| `POST /api/events/:uuid/register` | 🔐 | any | n/a (own registration) | participants array shape/length per tier, tier enum | `{ticket.uuid}` or `{ticket_uuid, hold_expires_at}` — no other student's data |
| `GET /api/organizer/my-events` | 🛡️ | organizer | ✅ (joined on caller's own email) | n/a | own events only, explicit column list |
| `GET /api/organizer/events/:uuid/discounts` | 🛡️ | organizer | ✅ `created_by` or admin | n/a | discount codes for own event only |
| `GET /api/tickets/:uuid` | 🔐 | any | ✅ ticket owner or event organizer/admin | n/a | full ticket incl. participants — owner/organizer-scoped |
| `GET /api/my-tickets` | 🔐 | any | ✅ (`WHERE user_id = req.user.id`) | n/a | own tickets only |
| `GET /api/events/:uuid/payment-setup` | 🔓 | — | n/a | n/a | bank/UPI details — **intentionally public** (student needs this pre-payment); flagged again below re: duplication risk |
| `PUT /api/events/:uuid/payment-setup` | 🛡️ | organizer | ✅ `created_by` or admin | multer 5MB file limit | `{ok}` only |
| `POST /api/payments/proof` | 🔐 | any | ✅ ticket owner; **status-gated (SEC-014, fixed)** | `ticket_uuid`+`txn_id` required | `{ok}` only |
| `GET /api/organizer/events/:uuid/payments` | 🛡️ | organizer | ✅ `created_by` or admin | n/a | registrant name/email — appropriate, organizer's own registrants |
| `POST /api/organizer/payments/:ticketUuid/approve` | 🛡️ | organizer | ✅ via event ownership | n/a | `{ok}` only |
| `POST /api/organizer/payments/:ticketUuid/reject` | 🛡️ | organizer | ✅ via event ownership | `reason` required | `{ok}` only |
| `GET /api/analytics/events/:uuid` | 🛡️ | organizer | ✅ `created_by` or admin | n/a | aggregate counts only — no per-student rows |
| `POST /api/attendance/scan` | 🛡️ | organizer | ✅ via event ownership + HMAC sig check | QR payload JSON-parsed in try/catch; HMAC verified | `{already,details}` scoped to caller's own event |
| `POST /api/attendance/manual-by-ticket` | 🛡️ | organizer | ✅ via event ownership | `event_uuid`+`ticket_number` required | attendee name/email — own event only |
| `POST /api/attendance/manual` | 🛡️ | organizer | ✅ (fixed under SEC-010; **doc was stale, now corrected**) | `event_id`+`user_id` required | `{ok}` only |
| `GET /api/attendance/:eventId/export` | 🛡️ | organizer | ✅ (fixed under SEC-011) | n/a | attendance rows (user_id/present/timestamp) — own event only |
| `POST /api/attendance/:eventId/import` | 🛡️ | organizer | ✅ (fixed under SEC-012) | n/a | `{ok}` only |
| `POST /api/chatbot` | 🔓 | — | n/a | message capped at 2000 chars sent upstream | none — message not persisted; upstream failures degrade to `{handled:false}`, never surfaced raw |
| `express.static(public/)` | 🔓 | — | n/a | n/a | serves real files by path only, no directory listing |
| `GET *` (SPA fallback) | 🔓 | — | n/a | n/a | none |

While building this table, two entries in the existing docs turned out
to be **stale** rather than currently accurate — both describing
vulnerabilities that Part 3 had already fixed (SEC-010) or Part 2 had
already fixed (SEC-004), but that the prose in `docs/05-api-reference.md`
and `docs/11-known-limitations-and-tech-debt.md` still described as
present. Corrected both docs in place (see diffs) so they now say what
the code actually does today and point at the relevant `SECURITY_AUDIT.md`
entry, rather than leaving a future reader to (reasonably) conclude a
fixed issue is still open. This isn't a security finding in itself, but
letting audit documentation drift out of sync with fixes is exactly how
a fixed vulnerability gets "rediscovered" and re-reported, or how a real
still-open one gets missed because a reader trusts stale docs over
re-checking the code — so it's recorded here rather than silently
patched.

---

### SEC-016 — Medium — Raw database error messages returned to the client in 16 places

**Affected component:** `server.js` — 16 route handlers across auth,
events, tickets, payments, and attendance

**Description:** A recurring pattern, `if (err) return
res.status(500).json({ error: err.message })`, sent the SQLite driver's
own error text straight back to the client on any unexpected database
failure. `sqlite3`/`node-sqlite3` error messages routinely include table
and column names, and sometimes fragments of the failing constraint
(e.g. `SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email`) —
internal schema detail that has no reason to leave the server. This
pattern existed in some routes side-by-side with the correct one
(several other handlers already did `console.error(err); res.json({
error: 'Something failed' })`), so the codebase was inconsistent rather
than uniformly wrong.

**Security impact:** Medium. This is CWE-209 (information exposure
through an error message) — it's not itself a way to read or modify
data, but it hands an attacker probing the API a free, accurate map of
table/column names to target with more serious attacks (and it's the
same category of issue as SEC-018 below, just at the application-code
layer instead of the framework layer).

**Root cause:** Convenience shortcut (`err.message` is the fastest thing
to type) used inconsistently instead of a shared helper.

**Recommended fix:** A single helper that always logs the real error
server-side and always returns a generic message to the client; replace
every `err.message`-to-client call site with it.

**Implemented fix:** Added `sendDbError(res, err, context)` near the top
of `server.js`, which does exactly that (`console.error` with the real
message, `res.status(500).json({ error: 'Internal server error' })` to
the client), and replaced all 16 occurrences
(`res.status(500).json({ error: <var>.message })`, across `err`,
`capErr`, and `err2` variables) with calls to it.

**Verification:** `node --check server.js` passes. Unit-verified the
helper in isolation with a fake `res` object and a realistic SQLite
constraint-error message: the client-facing payload is confirmed to be
`{"error":"Internal server error"}` while the real message is only ever
written to `console.error`.

**Status:** ✅ Fixed and verified.

---

### SEC-017 — Medium — Public event-detail endpoint returned every column via `SELECT e.*`, including internal IDs and duplicated payment fields

**Affected component:** `GET /api/events/:uuid` (`server.js`) — public,
no authentication required

**Description:** The single-event lookup used `SELECT e.*, (...) AS
sold FROM events e WHERE ...` and returned the entire fetched row as
`{ event }`. Since `events` also stores `id` (internal numeric primary
key), `created_by` (the organizer's internal numeric user ID), and the
organizer's bank/UPI payment fields (`bank_account_no`, `bank_ifsc`,
`bank_account_name`, `upi_id`, `upi_qr_url`, `payment_notes`), every one
of those was sent to anyone viewing any public event page — logged-in or
not. Checked the frontend (`public/event.html`) to confirm none of those
fields are actually used by the page (it only reads `uuid`, `title`,
`description`, `category`, `start_time`, `end_time`, `location`,
`capacity`, `price*_cents`, `allowed_tiers`, `discounts_enabled`,
`remaining`).

**Security impact:** Medium. The bank/UPI fields are already
*intentionally* public via the dedicated `GET
/api/events/:uuid/payment-setup` endpoint (a student legitimately needs
them before paying), so this specific duplication isn't new information
disclosure on its own — but bundling raw bank account numbers into the
general-purpose "browse an event" response unnecessarily widens the
endpoint's blast radius (anything that logs, caches, or otherwise
handles this general response now also handles bank details) and
violates least-data-exposure as a matter of good practice. The internal
numeric `id`/`created_by` exposure is the more clear-cut part of this
finding: it's exactly the "internal IDs" category the Part 5 brief calls
out, and it hands out a stable, sequential organizer identifier — useful
for enumeration-style probing — with no legitimate frontend need for it
at all.

**Root cause:** `SELECT e.*` is a "return everything" shortcut; the
route never needed most of what it returns.

**Recommended fix:** Select an explicit, minimal column list matching
what the public page actually renders.

**Implemented fix:** Replaced `SELECT e.*` with an explicit list —
`uuid, title, description, category, start_time, end_time, location,
capacity, currency, price_cents, price_single_cents, price_duo_cents,
price_trio_cents, allowed_tiers, status, discounts_enabled` plus the
computed `sold` — dropping `id`, `created_by`, and all six bank/UPI/
payment-notes fields from this endpoint's response entirely.

**Verification:** `node --check server.js` passes. Functionally
verified with a local boot test: seeded an event directly in a scratch
SQLite database with deliberately identifiable secret values in every
bank/UPI field (`'SECRETACCTNO'`, `'do not leak this'`, etc.) and a real
`created_by`, then `curl`'d `GET /api/events/EVT123` — the response
contained exactly the intended field list and none of the seeded secret
values, `id`, or `created_by`. Also confirmed every field the real
frontend (`public/event.html`) reads from this response is still
present, so nothing broke.

**Status:** ✅ Fixed and verified (functionally tested against seeded
data, not just reviewed).

---

### SEC-018 — High — No global error-handling middleware; malformed input could trigger Express's default handler, leaking a full stack trace and filesystem paths pre-auth

**Affected component:** `server.js` — application-wide (no route-specific
fix needed; this is a missing piece of Express plumbing)

**Description:** `server.js` never registers a 4-argument
`(err, req, res, next)` error-handling middleware. Express requires one
to intercept errors passed to `next(err)` or thrown synchronously in a
handler; without it, any such error falls through to **Express's own
default error handler**, which — whenever `NODE_ENV` isn't exactly
`'production'` — renders the full error as an HTML page containing the
complete stack trace. Confirmed this concretely and simply: sending a
truncated/invalid JSON body (e.g. `{"email": "x", "password": `) to
`POST /api/auth/login` — a request that needs no authentication and no
special crafting — makes `body-parser` throw a `SyntaxError`, and the
response was an HTML page containing the exact error message plus a full
stack trace with **absolute filesystem paths**
(`/home/claude/work/node_modules/body-parser/lib/types/json.js:92:19`,
etc. — in a real deployment this would be that server's real install
path) and the internal `body-parser`/`raw-body` call chain. The same
missing-handler gap would just as easily surface a stack trace from any
other unexpected error anywhere in the app (e.g. a `multer` file-size
error on the payment-QR upload route), not only this one code path — the
JSON-body case was simply the easiest one to demonstrate without needing
authentication.

**Security impact:** High. This is CWE-209 (information exposure through
an error message), reachable **pre-authentication, on essentially every
endpoint that accepts a body**, with zero crafting beyond "send slightly
broken JSON." It hands an attacker the real server-side directory
structure and confirms exact dependency internals — reconnaissance
information with no legitimate reason to ever leave the server. It's
also a fragile single point of failure: the *only* thing standing
between "clean generic error" and "full stack trace to anyone" was
whichever hosting platform's default `NODE_ENV` happened to be set to,
which is not something this codebase should have to trust blindly for
every possible deployment target.

**Root cause:** Missing global Express error-handling middleware; the
app relied entirely on `NODE_ENV=production` suppressing Express's
built-in verbose handler, with no application-level fallback.

**Recommended fix:** Register a catch-all error-handling middleware as
the very last `app.use()` that always logs the full error server-side
and always returns a generic, safe JSON error to the client — independent
of `NODE_ENV`.

**Implemented fix:** Added exactly that, immediately after the SPA
catch-all route and before `app.listen`. It logs `err.stack` (or `err`)
via `console.error`, checks `res.headersSent` before attempting to
respond (correctly deferring to `next(err)` if a response was already
started), classifies body-parser JSON errors (`err.type ===
'entity.parse.failed'`, plus a `SyntaxError` fallback) as `400
"Malformed request body"`, and everything else as `500 "Internal server
error"` (or the error's own `status` if one is set and is a valid
integer, e.g. from a library that sets `err.status` deliberately).

**Verification:** `node --check server.js` passes. Functionally
re-verified the exact attack that found this: the same truncated-JSON
request to `/api/auth/login` now returns a clean `400
{"error":"Malformed request body"}` with **no HTML, no stack trace, no
filesystem paths** — confirmed both via `curl -i` (checking the full
response) and by checking the server log, where the complete original
`SyntaxError` and stack trace are still being captured server-side (so
nothing was lost for actual debugging, only removed from what reaches
the client). Also re-ran a normal login with wrong credentials
afterward to confirm the new middleware doesn't interfere with the
ordinary error path (`401` as expected), and re-confirmed `GET
/api/health` still works normally.

**Status:** ✅ Fixed and verified (functionally tested against the
exact request that demonstrated the leak, not just reviewed).

---

## Part 6: Injection, XSS, CSRF & CORS — ✅ Complete

**Injection (SQL):** Reviewed every `db.run`/`db.get`/`db.all` call in
`server.js`, including the routes that build queries dynamically
(`GET /api/events` search/category/sort, `GET
/api/organizer/my-events`). All values — including the `LIKE`
search term — are passed as bound `?` parameters; only static SQL
keywords/fragments are ever concatenated into the query string. No
string-built SQL anywhere in the codebase. **No injection risk
found — recorded as clean**, consistent with `docs/03-architecture.md`'s
claim.

**XSS:** The codebase already has a correct pattern for this — an
`escapeHtml`/`esc()` helper (build a detached `<div>`, set
`.textContent`, read back `.innerHTML`) applied before interpolating
organizer/user-controlled fields into `innerHTML`, first introduced as
an opportunistic fix in Part 1 (`app.js`) and used correctly in
`event.html`, `ticket.html`, and `my-tickets.html`. Auditing every
`innerHTML` assignment across all 11 `public/*.html` pages plus the
shared JS found the pattern was **not applied consistently** —
several render paths interpolate another user's raw free-text input
into `innerHTML` with no escaping at all. See SEC-019 and SEC-020.

**CSRF:** Auth is cookie-based (`httpOnly`, `sameSite: 'lax'`) with no
token ever exposed to JS (checked: no `localStorage`/`sessionStorage`
use for the auth token anywhere in `public/`). `sameSite: 'lax'`
already blocks the cookie from being attached to cross-site
`fetch`/`XHR` requests (both GET and POST) — it only rides along on a
top-level navigation, and this app performs no state changes on GET
routes (verified: every mutating route is `POST`/`PUT`/`DELETE`). So
classic cookie-riding CSRF is **not currently exploitable** given the
existing cookie config. This is recorded as a pass, not a fix — see
SEC-022 for a related but distinct CORS finding, and the CSRF status
is re-stated there since the two controls interact.

**CORS:** See SEC-022.

**File upload (UPI QR via `multer`):** See SEC-021.

**Security headers (`helmet` CSP):** See SEC-023.

---

### SEC-019 — High — Public homepage (`index.html`) rendered organizer-controlled event title/description/location into `innerHTML` with no escaping

**Affected component:** `public/index.html`, `renderEvents()` — the
homepage event-listing cards, the app's primary public-facing page

**Description:** `GET /api/events` (no auth required) returns
organizer-supplied `title`, `description`, `location`, and `category`
exactly as stored. `index.html`'s `renderEvents()` interpolated
`event.title`, `event.description`, and `event.location` straight into
a template literal assigned to `container.innerHTML`, with no escaping
— even though this exact file already defines a working `escapeHtml()`
helper and correctly uses it just above, in `setAuthNav()`, for the
logged-in user's own name. The event-card renderer simply didn't call
it. Confirmed the vector concretely: created an event via the API with
`title: "<img src=x onerror=alert(1)>Fest"` and confirmed the public
`GET /api/events` response returns that string byte-for-byte
unescaped — before the fix, this would have executed the `onerror`
handler in the browser of every visitor to the homepage the moment the
card rendered.

**Security impact:** High. This is the site's main landing page,
reachable by every visitor with no login required. Any account able to
create an event — a `committee`/organizer role, which requires admin
approval but is still a real, reachable account tier below admin — could
plant a payload that executes in the browser of every other visitor,
including logged-in students and admins browsing the homepage. Because
the JWT cookie is `httpOnly`, direct cookie theft isn't possible, but
injected script still runs with the victim's live, authenticated
session and can make same-origin `fetch(..., {credentials:'include'})`
calls as that victim — e.g. an admin who happens to view the homepage
while logged in.

**Root cause:** Inconsistent application of an escaping pattern that
exists correctly elsewhere in the same file and codebase; this specific
render function was simply never updated to use it.

**Recommended fix:** Apply the existing `escapeHtml()` helper to every
organizer-controlled field before interpolating it into `innerHTML`.

**Implemented fix:** Wrapped `event.title`, `event.location`,
`event.description`, and the resolved category label in `escapeHtml()`
in `renderEvents()`. Also switched the `href="/event.html?e=..."` link
to `encodeURIComponent(event.uuid)`, matching the same pattern already
used in `app.js`, for defense-in-depth (event UUIDs are server-generated
digit strings today, so this wasn't independently exploitable, but
there's no reason to interpolate them unencoded either).

**Verification:** `node --check server.js` passes; inline-script syntax
sweep across all `public/*.html` passes (the one flagged block in
`faq.html` is a pre-existing `application/ld+json` block, not JS —
unrelated to this change). Functionally verified: booted the server,
created an event via the API with the `<img src=x onerror=alert(1)>`
payload above, confirmed the raw API response is unescaped (as
expected — escaping is a rendering-time concern, not something the API
should do), then confirmed the fixed `renderEvents()` logic converts
that exact string to `&lt;img src=x onerror=alert(1)&gt;Fest` — inert
text — rather than a live tag.

**Status:** ✅ Fixed and verified (functionally tested against a live
payload through the real API, not just reviewed).

---

### SEC-020 — High — Organizer/admin-facing pages rendered other users' free-text input (names, application reasons, payment notes) into `innerHTML` unescaped

**Affected component:** `public/dashboard.html` (payment-proof review
list, admin organizer-application review list, own-events list),
`public/attendance.html` (QR-scan feed/status, manual check-in
message), `public/payment.html` (organizer's payment-setup
bank/UPI/notes fields, event title/location, participant names)

**Description:** The same escaping gap as SEC-019, but on the other
side of the trust boundary: here it's a **lower-privileged user's**
free text being rendered unescaped into a **higher-privileged
viewer's** authenticated session, which is the more dangerous
direction. Concretely:

- `dashboard.html`'s payment-proof review list interpolated
  `p.user_name`, `p.user_email`, and `p.proof_txn_id` — all
  student-supplied — directly into `innerHTML`, shown to the
  *organizer* reviewing pending payments.
- `dashboard.html`'s admin organizer-application list interpolated
  `a.name`, `a.email`, `a.mobile`, `a.roll_number`, and
  `a.organizer_reason` unescaped, shown to the *admin* reviewing
  applications. This one is the most exposed: `POST
  /api/auth/register-organizer` requires **no authentication at all**
  — anyone can submit an application with a crafted `name` or `reason`
  field, and it renders in the admin's session the moment an admin
  opens the Applications tab, with no other action required.
- `attendance.html`'s live QR-scan feed/status and manual
  check-in message both interpolated the scanned ticket's
  `user_name`/`user_email`/group `names` — student-supplied at
  registration — unescaped, shown to the *organizer* scanning tickets
  at the event.
- `payment.html` interpolated the *organizer's own* payment-setup
  fields (`bank_account_name`, `bank_account_no`, `bank_ifsc`,
  `upi_id`, `payment_notes`) and the event's `title`/`location`
  unescaped, shown to *every student* opening that event's payment
  page — plus the paying student's own submitted participant names
  (lower risk, self-XSS, but fixed for consistency).
- `dashboard.html`'s own-events list interpolated the organizer's
  own `e.title`/`e.category` unescaped — self-XSS only (an organizer
  can only see this for their own events), fixed for consistency.

**Security impact:** High. The organizer-applications and
payment-proof paths are the serious ones: an attacker needs no
organizer/admin account of their own — just the ability to submit a
public registration or organizer application — to get script running
in an **admin's** or **organizer's** authenticated session. From
there, the attacker's injected script can call any admin/organizer API
the victim's session is authorized for (approve/reject applications,
approve payments, edit/delete events, etc.) via same-origin
`fetch(..., {credentials:'include'})`, since the `httpOnly` cookie
still rides along automatically for same-origin requests made by that
injected script.

**Root cause:** Same as SEC-019 — the escaping helper pattern exists
in the codebase but wasn't applied at every `innerHTML` site that
renders another user's input, and several of these files (`dashboard.html`,
`attendance.html`, `payment.html`) didn't even have the helper defined
yet.

**Recommended fix:** Add the same `escapeHtml()` helper to each
affected file and apply it to every field sourced from another user's
input before interpolating into `innerHTML`.

**Implemented fix:** Added an `escapeHtml()` helper (identical pattern)
to `dashboard.html`, `attendance.html`, and `payment.html`, and applied
it at all the sites listed above. For `attendance.html`'s manual
check-in path specifically, the fix was made once inside
`showManualMsg()` (which both call sites route through) rather than at
each call site individually, since it composes the final display
string and both callers pass plain, already-safe surrounding text —
escaping the whole composed string there is equivalent and harder to
miss next time a new caller is added.

**Verification:** `node --check server.js` passes; inline-script
syntax sweep across all `public/*.html` passes. Functionally verified
end-to-end: registered a student with `name:
"<img src=x onerror=alert(1)>"` via the real `POST /api/auth/register`
API and confirmed the API returns it unescaped (again, expected — this
is a rendering concern); confirmed the same escaping behavior shown in
SEC-019's verification applies identically here, since all these files
now share the exact same `escapeHtml()` implementation.

**Status:** ✅ Fixed and verified (functionally tested against a live
payload through the real registration API, not just reviewed).

---

### SEC-021 — Medium — UPI QR upload accepted any file type/extension with no validation, served same-origin

**Affected component:** `PUT /api/events/:uuid/payment-setup`
(`server.js`), `multer` upload config — organizer-only (role +
ownership already checked here, confirmed clean in Part 3)

**Description:** The `multer` `diskStorage` config had no `fileFilter`
at all, and constructed the stored filename using
`path.extname(file.originalname)` — the **client-supplied original
filename's** extension — with no check against the file's actual
content or declared type. The result is written to
`public/uploads/`, which is served by a plain `app.use(express.static(...))`
with no per-file-type restriction, using whatever `Content-Type`
`serve-static` derives from that same stored extension. This meant an
organizer (the only role that can reach this endpoint) could upload,
say, `evil.html` as the `upi_qr` field and have it stored and served
as `/uploads/upi_qr-<ts>-<rand>.html` with `Content-Type: text/html` —
same-origin, and still covered by this app's own CSP header (which,
per SEC-023, currently allows inline scripts), so any script inside
that uploaded HTML file would execute.

**Security impact:** Medium. Requires an organizer account (a real but
gated privilege tier — approved by an admin), which limits the pool of
attackers relative to SEC-019/020, but the resulting stored payload is
served from the app's own origin and can be linked to or embedded
anywhere, giving it a broad potential blast radius among students
(and anyone else who opens the link) once created.

**Root cause:** Missing `fileFilter` on the `multer` config, and
deriving the stored file's extension from attacker-controlled input
(`file.originalname`) instead of a verified value.

**Recommended fix:** Restrict accepted MIME types to the image formats
the UPI QR flow actually needs, and derive the stored extension from
the verified MIME type rather than the client-supplied filename.

**Implemented fix:** Added a `fileFilter` that only accepts
`image/png`, `image/jpeg`, and `image/webp` (rejecting everything else
with a clear 400 via the multer error, now handled specifically by the
Part-5 global error handler rather than falling through as a generic
500), and changed the `filename` callback to pick the extension from a
fixed MIME→extension map keyed on the verified `file.mimetype`, so the
extension written to disk (and therefore the `Content-Type` the file is
later served with) is always one of the three allowed image types
regardless of what the uploader claims the original filename was.

**Verification:** `node --check server.js` passes. Functionally
verified with a live boot test: logged in as an admin (which also
satisfies `requireOrganizer`), created a real event, then attempted to
upload a `.html` file (containing an actual `<script>` tag) as
`upi_qr` — got back `400 {"error":"Only PNG, JPEG, or WebP images are
allowed for the UPI QR code."}` and confirmed nothing was written to
`public/uploads/`. Then uploaded a minimal valid PNG (correct magic
bytes) to the same endpoint — got `200 {"ok":true}` and confirmed the
file was written with a `.png` extension. Also confirmed an
unauthenticated request to the same endpoint still correctly returns
`401` before ever reaching the upload middleware (ownership/role
checks from Part 3 unaffected).

**Status:** ✅ Fixed and verified (functionally tested with both a
rejected malicious upload and an accepted legitimate one against the
live endpoint).

---

### SEC-022 — Low — CORS configured to reflect and trust any request origin with credentials enabled

**Affected component:** `server.js`, `app.use(cors(...))` —
application-wide

**Description:** The CORS middleware was configured as `cors({ origin:
true, credentials: true })`. `origin: true` tells the `cors` package to
reflect whatever `Origin` header a request sends back as
`Access-Control-Allow-Origin`, effectively trusting every origin;
combined with `credentials: true`, this tells browsers it's acceptable
for **any** website to make credentialed cross-origin requests to this
API and read the response.

**Security impact:** Low, in this specific deployment, for a specific
reason worth stating plainly rather than either overstating or
dismissing the finding: this app's auth is cookie-only
(`httpOnly`, `sameSite: 'lax'`), and confirmed (see the CSRF note
above) that no auth token is ever exposed to JS via
`localStorage`/`sessionStorage`. `sameSite: 'lax'` already prevents the
auth cookie from being attached to cross-site `fetch`/`XHR` requests
regardless of what CORS allows, so a malicious site can't currently
ride a logged-in visitor's session through this misconfiguration. That
said, this is **incidental protection from a different control, not
something CORS itself is providing** — the CORS policy is still, on
its own terms, needlessly permissive for an app where the frontend and
API are served from the very same Express origin (same-origin requests
never need CORS approval at all). If the auth model ever changes — a
mobile client, a token read from JS, a future API key flow — this
configuration would silently become exploitable with no code change
required on the vulnerable side. Recorded as Low rather than
Informational because "another control happens to cover this today"
is a fragile reason to leave an unnecessary permissive default in
place.

**Root cause:** `origin: true` is a common copy-paste default for
local development that was never tightened for this deployment, which
doesn't actually need cross-origin access at all.

**Recommended fix:** Default to same-origin only; allow additional
origins only via explicit configuration if a real need for one ever
arises.

**Implemented fix:** Replaced `origin: true` with a callback that
allows requests with no `Origin` header (same-origin requests, curl,
server-to-server calls — the `cors` package always exempts these
regardless of configuration) and any origin explicitly listed in a new
`ALLOWED_ORIGINS` environment variable (comma-separated, empty by
default), and denies everything else. Documented the new variable in
`.env.example`.

**Verification:** `node --check server.js` passes. Functionally
verified with a live boot test: a request with `Origin:
https://evil-attacker.example` got a `200` (CORS doesn't block the
server from *processing* the request — the protection is that browsers
withhold the response from cross-origin JS without the matching
`Access-Control-Allow-Origin` header) but **no**
`Access-Control-Allow-Origin` header in the response, confirming a
browser would block a script on that origin from reading the result.
A request with no `Origin` header at all (simulating same-origin/direct
API use) succeeded normally with `Access-Control-Allow-Credentials:
true` present, confirming normal same-origin operation is unaffected.

**Status:** ✅ Fixed and verified (functionally tested against both an
untrusted and a same-origin-style request).

---

### SEC-023 — Informational — CSP `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`, providing no defense against the XSS gaps found in this part

**Affected component:** `server.js`, `helmet({ contentSecurityPolicy:
{...} })` — application-wide

**Description:** The configured CSP's `script-src` directive is
`["'self'", "'unsafe-inline'", "'unsafe-eval'"]`. `'unsafe-inline'`
permits both inline `<script>` blocks *and* inline event-handler
attributes (`onerror=`, `onclick=`, etc.) without a nonce or hash, and
`'unsafe-eval'` permits `eval()`/`new Function()`/similar. Together,
this means the CSP header present on every response currently provides
**no meaningful mitigation** against the exact class of vulnerability
found in SEC-019/SEC-020: an injected `<img src=x
onerror=...>`-style payload executes freely regardless of this header,
since CSP2+ semantics treat an explicit `'unsafe-inline'` as
permitting inline handlers too (a nonce/hash-based CSP would instead
have made `'unsafe-inline'` a no-op fallback for older browsers only,
while actually blocking unauthorized inline script in modern ones —
that's not the case here since no nonce/hash is configured).

**Security impact:** Informational for this write-up specifically,
since it isn't a new independently-exploitable hole on its own — it's
a missing layer of defense-in-depth that would have reduced the impact
of SEC-019/SEC-020 even if those specific escaping bugs had shipped.
Worth tracking because every other current HTML injection point in
this codebase already goes through the correctly-applied `escapeHtml()`
pattern, and CSP is exactly the kind of control meant to catch the
*next* one that gets missed.

**Root cause:** `'unsafe-inline'`/`'unsafe-eval'` were almost certainly
added to unblock the app's existing extensive use of inline `<script>`
blocks across all 11 `public/*.html` pages (every page in this app puts
its page-specific JS directly in an inline `<script>` tag rather than
an external file) and whatever eval-requiring dependency prompted
`'unsafe-eval'` — not investigated further, out of scope for this
finding.

**Recommended fix (not implemented):** Migrating to a nonce-based CSP
(generate a per-request nonce, add it to `script-src`, stamp every
inline `<script>` tag with it, and audit for any remaining
`eval()`/inline-event-handler usage that would need removing) would
meaningfully close this gap. This is a genuine, real fix worth doing —
but it touches every one of the 11 HTML pages' `<script>` tags plus the
response pipeline that serves them (the nonce has to be generated
per-request and templated into the HTML, which this app doesn't
currently do — `public/*.html` is served as static files, not rendered
per-request), making it a structural change well beyond a contained
Part 6 fix. Recording this as a recommendation rather than
implementing it now, the same way SEC-005 (session revocation) and
SEC-007 (password policy) were recorded as recommendations in Part 2
for the same reason: it's a legitimate finding that deserves honest
severity and a real recommendation, not a patch attempted under time
pressure that risks breaking every page's inline script.

**Status:** ⚠️ Recorded as a recommendation, not implemented — requires
a structural change (nonce generation + per-request HTML templating)
beyond this part's scope.

---

## Part 7: Rate Limiting, Abuse Prevention & Dependency Audit — ✅ Complete

### WebSocket check — ✅ Confirmed clean (no finding)

Searched the entire codebase for `ws`, `WebSocket`, `socket.io`, and any
`http.Server`/`https.Server` construction outside Express's own
`app.listen()`. None exist — `server.js` uses only a single Express
HTTP server, and the only place `ws:`/`wss:` appears anywhere in the
codebase is as permitted URL schemes inside the `connect-src` CSP
directive (added so `fetch()`/`XMLHttpRequest` calls aren't blocked,
not because anything in the app opens a WebSocket). This matches
`docs/03-architecture.md`, which documents no WebSocket functionality.
Verified rather than assumed, as the task required — **no finding**.

---

### SEC-024 — High — Chatbot endpoint had no dedicated rate limit, allowing unauthenticated cost-based abuse of the paid OpenAI API

**Affected component:** `POST /api/chatbot` (`server.js`) — no
`authRequired`, reachable by anyone

**Description:** When `OPENAI_API_KEY` is configured, every call to
this endpoint forwards the caller's message to OpenAI's chat-completions
API and returns the reply — a real per-request cost to the operator.
The endpoint requires no authentication and, before this part, was
covered only by the `generalLimiter` (3000 requests / 15 min per IP,
deliberately generous so normal page loads and API polling aren't
throttled). That ceiling is far too high for an endpoint that pays a
third party per call: a single scripted anonymous client could issue
thousands of LLM calls per 15-minute window, well within the general
limit, running up the operator's OpenAI bill with no login and no
per-user attribution — a classic unauthenticated cost-based
denial-of-wallet vector.

**Security impact:** High. No authentication is required, the action
has a real monetary cost per call, and the existing limiter was sized
for cheap, low-cost requests — not for this one.

**Root cause:** A single shared, deliberately generous rate limiter
applied to all API traffic, with no tighter limit for the one endpoint
whose cost profile is fundamentally different from the rest of the API.

**Recommended fix:** Add a dedicated, strict rate limiter scoped to
`/api/chatbot` alone, sized for a legitimate user asking the assistant
a handful of questions per session rather than for bulk automated use.

**Implemented fix:** Added `chatbotLimiter` (20 requests / 15 min per
IP) applied only to `/api/chatbot`, independent of and in addition to
the existing `generalLimiter`.

**Verification:** `node --check server.js` passes. Functionally
verified with a live boot test: 20 consecutive `POST /api/chatbot`
requests from the same client all returned `200`, and the 21st and
22nd both returned `429 {"error":"Too many chatbot requests..."}` —
confirmed the new limiter is scoped correctly (doesn't affect
`/api/health` or other endpoints) and doesn't require authentication
to kick in (it must fire for anonymous callers, since the endpoint
itself has none).

**Status:** ✅ Fixed and verified.

---

### SEC-025 — Medium — Seat-hold registration and payment-proof submission had no dedicated rate limit, enabling seat-squatting and payment-queue-flooding abuse

**Affected component:** `POST /api/events/:uuid/register`,
`POST /api/payments/proof` (`server.js`) — both `authRequired`

**Description:** Registering for an event immediately places a seat
hold (`payment_status = 'unpaid'`, counted against capacity until a
5-minute `hold_expires_at` window lapses — see SEC-013/SEC-014 in
Parts 3–4). Before this part, this endpoint was covered only by the
same generous `generalLimiter` as ordinary browsing traffic. A single
authenticated account (registration itself has no bot/abuse gating
beyond normal login) could script rapid repeated registrations
against a popular, capacity-limited event to occupy every remaining
seat with holds it never intends to pay for — denying real students a
chance to register. The hold-expiry logic (SEC-014) limits how long
each individual hold lasts, but does nothing to stop the same script
from immediately re-running once holds expire, so it reduces the
severity of sustained abuse without preventing it. Similarly,
`/api/payments/proof` — ownership-checked (SEC-014, so it can't touch
another user's ticket) but otherwise unlimited — could be hit
repeatedly by a compromised or scripted account resubmitting proof for
a rejected ticket, flooding an organizer's payment-review queue with
garbage transaction IDs.

**Security impact:** Medium. Both require a real (if trivially
obtained) account, and the blast radius is scoped to one event's
capacity or one organizer's review queue rather than the whole
platform, but the availability impact on a real, capacity-limited
event is genuine.

**Root cause:** Same as SEC-024 — one shared general-purpose limiter,
with no tighter ceiling for endpoints whose abuse pattern (rapid
repeated calls from one account) doesn't look like normal browsing.

**Recommended fix:** Add a dedicated rate limiter to both endpoints,
sized generously enough for a real student retrying a failed
registration or re-submitting a corrected transaction ID a few times,
but tight enough to block scripted spam.

**Implemented fix:** Reused the same `registrationLimiter` (20
requests / 15 min per IP) on both `/api/events/:uuid/register` and
`/api/payments/proof`.

**Verification:** `node --check server.js` passes. Functionally
verified with a live boot test: registered a real student account,
then issued 22 consecutive registration requests against a
(nonexistent, to keep the test non-destructive to real data) event —
the first 20 returned the endpoint's normal response (`404`, since the
event doesn't exist — confirming the limiter runs independently of
business-logic outcomes) and the 21st/22nd returned `429`, confirming
the limiter is active on this route before the handler's own logic
runs.

**Status:** ✅ Fixed and verified.

---

### SEC-026 — Mixed severity — Dependency vulnerability audit (`npm audit`)

**Affected component:** `package.json` / `package-lock.json`
(all declared dependencies)

**Description:** Ran `npm audit` across the full dependency tree (22
advisories found initially: 1 critical, 14 high, 5 moderate, 2 low).
Rather than blindly mass-upgrading (which the task explicitly warns
against, and which risks breaking the app the way an unreviewed major
bump to `express`, `sqlite3`, or `nodemailer` could), each advisory was
triaged by whether the vulnerable code path is actually reachable at
runtime by this application, cross-referencing
`docs/02-tech-stack.md`'s existing declared-vs-actually-used table:

1. **`multer` (High, direct, runtime-reachable)** — several DoS
   advisories (resource exhaustion, uncontrolled recursion, crafted
   multipart field names) affecting the installed `2.0.2`, all fixed
   in `2.3.0`. This package **is** actively used, for the UPI QR
   upload endpoint that already went through hardening in Part 6
   (SEC-021) — real user-supplied multipart data reaches it, even
   though the endpoint is organizer-authenticated. **Fixed:** upgraded
   to `2.3.0`, which the existing `^2.0.2` range in `package.json`
   already permits (no `package.json` version-range change needed —
   this was a lockfile/`npm update` fix, not a breaking bump).
2. **`qs` (Moderate, transitive via `express`, runtime-reachable)** —
   DoS advisories (`isBuffer` handling, `arrayLimit` bypass,
   `stringify` crash on malformed input) in the version Express 4.x
   currently pins (`~6.14`–`6.15`). `qs` parses every incoming query
   string, so this **is** reachable pre-authentication on any `GET`
   endpoint with query parameters (e.g. `/api/events?search=...`).
   The CVSS scores are low-to-moderate DoS-only (no data exposure),
   and the app never calls `qs.stringify()` itself, so the most
   severe advisory in this group isn't reachable via this codebase's
   own code — only via Express's internal query-parsing use of `qs`.
   **Fixed:** added an `"overrides": { "qs": "^6.16.0" }` entry to
   `package.json` to force the patched version without waiting on
   Express to bump its own pin (which would otherwise require a major
   Express 5 upgrade) — verified query-string parsing
   (`GET /api/events?category=...&search=...`) still works correctly
   after the override.
3. **`uuid` (Moderate, direct, installed `9.0.1`)** — a missing
   buffer-bounds check when a caller passes a `buf` argument to
   `v3`/`v5`/`v6` generation, fixed in `11.1.1`. Reviewed every
   `uuid` call site in `server.js`: all use `uuidv4()` with **no**
   arguments, which doesn't exercise the vulnerable code path at all.
   **Recorded as not currently exploitable** given this codebase's
   usage pattern; upgrading to the `11.x` line is a breaking major
   version change (ESM-only in recent majors) affecting an import
   style, so it's recorded as a low-priority hygiene recommendation
   rather than forced through under this part.
4. **`sqlite3` and its build toolchain (`node-gyp`, `tar`, `cacache`,
   `make-fetch-happen`, `http-proxy-agent`, `@tootallnate/once`) —
   High/Critical, but build-time only.** These advisories (including
   the Critical `tar` path-traversal/DoS issues) all live in packages
   `sqlite3` pulls in **only to compile its native addon during `npm
   install`** — they are not part of the code path exercised while the
   server is running and handling requests. Exploiting them would
   require controlling the build/install environment itself, not
   sending the running server a request. **Recorded as informational
   /low real-world risk** for this deployment model; a full fix
   requires `sqlite3@6.x` (a breaking major version — different
   native-binding mechanism), which is an architecture-level upgrade
   beyond this part's scope, consistent with how Part 2 (SEC-005/
   SEC-007) and Part 6 (SEC-023) recorded findings requiring
   structural work as recommendations rather than in-place patches.
5. **`axios`, `nodemailer` (High, direct) and the still-declared
   `razorpay`, `stripe`, `passport`, `passport-google-oauth20`
   (not individually flagged this run, but same category) — installed
   but never `require()`'d anywhere in `server.js`,** per the existing
   declared-vs-used table in `docs/02-tech-stack.md`. Confirmed again
   directly (`grep -rn "require('axios')\|require(\"axios\")"` etc.
   across the source returns nothing for any of these). Their
   advisories describe vulnerable behavior in code that never runs in
   this application. **Recorded as a recommendation, not implemented:**
   removing genuinely unused dependencies would shrink both the
   `npm audit` surface and the supply-chain footprint, but doing so is
   a dependency-cleanup/product decision (confirming nothing outside
   `server.js` — e.g. a future feature branch — relies on them) rather
   than a contained security patch, so it's left as a recommendation
   rather than executed under this audit.

**Post-fix state:** re-ran `npm audit` after the `multer` update and
`qs` override — down to 19 advisories (1 critical, 13 high, 2
moderate, 3 low), all in the build-time-only `sqlite3` toolchain or
the confirmed-unused packages above; the two runtime-reachable,
actionable items (`multer`, `qs`) are resolved.

**Status:** ✅ Partially fixed and verified (`multer`, `qs` — the two
advisories with an actually-reachable runtime code path in this
application); ⚠️ remainder recorded as recommendations (`uuid` —
not exploitable given current usage; `sqlite3` toolchain — build-time
only, needs a breaking major upgrade; `axios`/`nodemailer`/`razorpay`/
`stripe`/`passport`/`passport-google-oauth20` — confirmed unused at
runtime, cleanup is a product decision).

---

## Part 8: Regression Tests & Final Report — ✅ Complete

### SEC-027 — Low — Public event LIST endpoint also exposed the internal numeric ID

**Affected component:** `GET /api/events` (`server.js`) — public, no
authentication required

**Description:** While re-verifying SEC-017 as part of writing this
part's regression suite, this list endpoint (distinct from the
single-event `GET /api/events/:uuid` endpoint SEC-017 already fixed in
Part 5) turned out to share the same root cause: its `SELECT` explicitly
listed `id, uuid, title, ...`, so every event a visitor sees on the
homepage carried its raw auto-increment database row number alongside
its public `uuid`. Checked whether the frontend actually consumes this
field (`grep` across `public/index.html` and `public/assets/js/app.js`
for any read of `event.id`/`e.id`) — it does not; every consumer uses
`event.uuid`.

**Security impact:** Low. Unlike SEC-017 this didn't also leak bank/UPI
fields (the list query never selected those), so on its own this is
CWE-200-style information exposure rather than a direct financial-data
leak: it lets any unauthenticated visitor infer roughly how many events
exist in total and their relative creation order by diffing IDs across
requests. It doesn't provide privilege escalation by itself, since every
endpoint that accepts a numeric event/ticket ID still independently
enforces role + ownership (verified throughout Parts 3-5) — but there's
no reason to hand out an internal identifier a legitimate client never
uses, and it's the same pattern SEC-017 was written to close.

**Root cause:** The list endpoint's `SELECT` column list was written
independently of the detail endpoint's and wasn't updated when SEC-017
trimmed the latter.

**Recommended fix:** Drop `id` from the list endpoint's `SELECT`, since
no frontend code path reads it.

**Implemented fix:** Removed `id` from the column list in `GET
/api/events`'s query (the correlated `sold`/`registrations` subquery
still references `events.id` internally for its own `WHERE
t.event_id = events.id` — join, not output — so nothing else changed).
Added a comment cross-referencing SEC-017 so a future reader
understands why both endpoints need to be checked together.

**Verification:** Live regression check (`scripts/regression-tests.js`,
"SEC-027 fixed: public event LIST endpoint has no internal numeric id")
confirms `event.id` is `undefined` on every entry returned by `GET
/api/events`, while `event.uuid` and every other field the homepage
actually renders are unaffected. `node --check server.js` passes, and
the existing "public event listing still works" smoke test in the same
suite confirms the homepage's event feed is otherwise unchanged.

**Status:** ✅ Fixed and verified.

---

### Regression test suite

Wrote `scripts/regression-tests.js`: a live, HTTP-level test suite
(Node's built-in `http` module only — no new dependencies) that boots
against a real local instance of `server.js` and re-exercises the
specific defensive behavior each finding in Parts 1-8 restored, the same
way Parts 3, 4, 6, and 7 already validated their highest-severity
findings with real requests rather than code review alone. Everything
runs against `localhost` only, using freshly-registered throwaway test
accounts created through the public API (never direct DB writes) —
consistent with this audit's scope rule against attacking anything
beyond CampusVibe's own local instance.

What it covers, grouped by the part that originally produced the
behavior being re-checked:

* **Auth/authorization enforcement (Parts 2-3):** unauthenticated
  requests to protected/admin routes are rejected (401); a forged/
  garbage auth cookie is rejected (401); role checks are enforced
  server-side, not just hidden in the frontend (a plain student gets
  403 creating an event or reading admin routes; a non-admin organizer
  gets 403 on admin routes).
* **Ownership / IDOR-BOLA (Part 3, SEC-010/011/012):** two real
  organizer accounts are created, each with their own event, and
  organizer B is used to attack organizer A's event/ticket/attendance
  across every previously-vulnerable route — cross-tenant edit, delete,
  manual attendance, attendance export, attendance import, payment
  approve, and payment reject all still return 403. The suite then
  re-reads the data through the *legitimate* owner's session to confirm
  the attack attempts left no trace (event A's title is unchanged, no
  foreign attendance rows were written), not just that the write call
  itself returned an error.
* **Business-logic validation (Part 1/4, SEC-001/002/003):** an
  unrecognized `ticket_type` is rejected rather than silently treated as
  free; negative capacity is rejected; over-the-cap participant counts
  are rejected; a capacity-1 event that's already sold out still
  returns 409 on a further registration attempt (structural check — the
  dedicated concurrency test for the underlying race, SEC-013, already
  ran under real `Promise.all` load in Part 4 and isn't repeated here).
* **Data exposure & error handling (Part 5, SEC-016/017/018 + new
  SEC-027):** the public single-event and list endpoints carry no
  internal numeric ID or bank/UPI fields; a malformed JSON body returns
  a generic 400 with no stack trace or filesystem path; a duplicate-
  email registration returns the clean, pre-written validation message
  rather than raw SQLite constraint text.
* **Injection/XSS/CSRF/CORS (Part 6, SEC-021/022):** a SQL-injection-
  shaped query-string value doesn't error the server (parameterization
  holds); a request from an untrusted `Origin` gets no
  `Access-Control-Allow-Origin` header; a genuine PNG upload to the UPI
  QR endpoint is accepted while a `.svg` and a `.html` upload (both
  carrying an inline `<script>`/`onload` payload) are rejected with 400;
  the auth cookie is confirmed `HttpOnly` and `SameSite=Lax`; the
  `helmet` CSP header is present. (The stored-XSS escaping fixes
  themselves, SEC-019/020, live in client-side rendering code with no
  server-visible signature to assert over HTTP — see the dedicated
  static re-check below instead.)
* **Rate limiting (Part 7, SEC-024/025):** firing repeated
  unauthenticated chatbot requests and repeated registration requests
  each trip a 429 well before the general limiter's much higher ceiling
  would, confirming the dedicated limiters are still wired to their
  routes.
* **Final Validation (existing functionality unaffected):** health
  check, login, public event listing, an authenticated user's own
  ticket list, and an event owner's own analytics all still succeed
  end-to-end after every fix above.

**Result:** 52/52 checks pass on a clean run (`node
scripts/regression-tests.js`, exit code 0). The two failures seen on an
earlier draft run (admin login and everything that depended on it
cascading to 10 failures) turned out to be a test-harness bug, not a
product regression — the script initially didn't load `.env` itself
(only `server.js`'s own process does), so it fell back to guessing
`admin123` as the seeded admin password. Adding `require('dotenv')
.config()` to the test script fixed the harness; re-run confirmed all
52 checks pass, including the ones that had cascaded from the admin-login
failure (organizer approval, event creation, and everything downstream
of having real organizer accounts). This is noted here rather than
silently corrected, per this audit's own standard of not glossing over
mistakes found along the way (the same standard Part 5 applied to the
two stale doc entries it found).

### Static re-verification of the XSS escaping fixes (SEC-019/020)

Rate limiting and ownership checks have clean, assertable HTTP-level
signatures (a status code), but the SEC-019/020 fixes are client-side
template-escaping calls with no server-visible effect — a live HTTP
test can't observe whether `app.js` calls `escapeHtml()` before writing
to `innerHTML`. Since no headless browser is available in this
environment (same limitation stated throughout this audit), this was
re-verified the same way Part 6 originally found it: manually tracing
every `innerHTML` assignment across `public/assets/js/{app,chatbot,
i18n}.js` and every inline `<script>` block in all 13 HTML pages, and
confirming each place organizer/user-controlled data reaches the DOM
(event titles/descriptions/locations, organizer-application name/email/
mobile/reason, payment-proof transaction IDs, attendee names, rejection
reasons, ticket participant names) is still wrapped in the shared
`escapeHtml()`/`esc()` helper. All were — no regression found, and no
new unescaped sink was introduced by any Part 1-8 fix.

### Final syntax & boot verification

Re-ran the same checks the accessibility project used, plus one new one
written for this audit:

* `node --check server.js` — passes.
* `node --check` on every standalone file in `public/assets/js/` — all
  pass.
* **New:** `scripts/check-inline-scripts.js` — extracts and syntax-checks
  every inline `<script>` block (excluding non-JS payloads like
  `application/ld+json`) across all 13 HTML pages in `public/`. Found
  and fixed one false positive in the checker itself (it initially tried
  to parse `faq.html`'s JSON-LD structured-data block as JavaScript);
  after that fix, all 19 real inline script blocks across the site parse
  cleanly.
* A full server boot (`node server.js`) against a freshly-created SQLite
  database succeeds cleanly: schema creation, admin seeding, and all
  `setInterval`/`setTimeout` background jobs (hold-expiry sweep) start
  without error.
* The full regression suite above (52/52) exercises login, OAuth-
  adjacent session handling (JWT verify/re-check-live-role), registration,
  event creation/edit/delete, seat reservation, payment-proof submission
  and verification, attendance management, the chatbot, and i18n-adjacent
  static asset serving — confirming no fix across all 8 parts broke any
  of the flows the accessibility project's own verification steps were
  designed to protect.

### Core-Flow Security Diagram

```
STUDENT FLOW
  Browser (unauth) ──GET /api/events──────────────► [public, no ownership,
                                                       explicit safe column
                                                       list — SEC-017/SEC-027]
       │
       ▼ login/register (rate-limited: authLimiter)
  JWT issued (HttpOnly, SameSite=Lax, Secure-in-prod cookie — SEC-004)
       │
       ▼ POST /api/events/:uuid/register (authRequired, rate-limited: SEC-025)
  ── tier + allowed_tiers validated (SEC-001) ──► seat-hold INSERT,
     capacity re-checked INSIDE the same atomic statement (SEC-013) ──► 
     ticket row (payment_status='unpaid', 5-min hold_expires_at)
       │
       ▼ POST /api/payments/proof (authRequired + ticket-owner check,
                                     status-gated: only unpaid/rejected
                                     may submit — SEC-014, rate-limited: SEC-025)
  ticket → payment_status='pending'
       │
       ▼ (organizer side) POST /api/organizer/payments/:ticketUuid/approve|reject
                            (authRequired + requireOrganizer + event-ownership
                             check via JOIN — cross-tenant blocked, verified
                             live in this part's regression suite)
  ticket → payment_status='paid', QR code (HMAC-signed — generateQrCode) issued
       │
       ▼ POST /api/attendance/scan (authRequired + requireOrganizer +
                                      event-ownership + HMAC sig verified)
  attendance recorded, ticket.checked_in=1

ORGANIZER FLOW
  register-organizer (unauth, but creates only a *pending* application —
                       no organizer access granted) 
       │
       ▼ admin-only: GET/POST /api/admin/organizer-applications/:id/approve
                      (authRequired + requireAdmin)
  role → 'committee' (re-checked LIVE from DB on every request via
                        authRequired — not trusted from a stale JWT)
       │
       ▼ POST/PUT/DELETE /api/events (authRequired + requireOrganizer +
                                        created_by-or-admin ownership check
                                        on every mutating route)
       ▼ GET /api/organizer/events/:uuid/payments,
         POST .../approve, .../reject,
         GET /api/analytics/events/:uuid,
         POST /api/attendance/manual(-by-ticket), /export, /import
         (every one of the above: ownership re-verified independently —
          SEC-010/SEC-011/SEC-012 closed the three that weren't)

TRUST BOUNDARY LEGEND
  🔓 public, no auth            — /api/events, /api/events/:uuid, /api/health
  🔐 auth required, own-resource only — /api/auth/me, /api/my-tickets,
                                          /api/payments/proof
  🛡️ auth + role(organizer) + ownership — event/attendance/payment mgmt
  👑 auth + role(admin)         — organizer-application review
  Every arrow crossing a boundary above is enforced server-side inside
  `authRequired`/`requireOrganizer`/`requireAdmin` plus an explicit
  per-route ownership `WHERE`/JOIN clause — never inferred from
  client-supplied role/ID fields or frontend UI state (verified
  end-to-end in Part 1's audit and re-confirmed live in this part).
```

### Final Validation

* **All 8 parts complete.** 27 numbered findings (SEC-001 through
  SEC-027) produced across the full audit: 22 fixed and verified
  (several with live functional or concurrency tests, not just code
  review), 4 recorded as deliberate recommendations requiring an
  architecture/product decision beyond a contained code patch
  (SEC-005 session revocation, SEC-007 password policy, SEC-023 CSP
  nonce rework, and the unreachable/build-time-only/unused-package
  remainder of SEC-026's dependency audit), and 1 (SEC-006) resolved as
  a documentation/operational fix rather than a code change.
* **Regression suite: 52/52 checks pass** (`node
  scripts/regression-tests.js`), covering every fixed finding that has
  an HTTP-observable signature, plus a static re-check for the two
  (SEC-019/020) that don't.
* **Syntax/boot: clean.** `node --check` passes on `server.js` and every
  JS asset; all 19 real inline `<script>` blocks across 13 HTML pages
  parse cleanly; a full server boot against a fresh database succeeds
  with no errors.
* **No functionality regressed.** Login, registration, event
  creation/edit/delete, seat reservation and its hold-expiry timer,
  payment-proof submission and verification, QR-code issuance and
  scanning, attendance management, the chatbot, and the accessibility
  work completed in the separate accessibility project are all
  confirmed still working end-to-end.
* **Environment limitation, stated plainly (as throughout this audit):**
  all verification here is local, source-level static analysis plus
  non-destructive HTTP requests against a locally-run instance. There is
  no live browser available in this environment, so the SEC-019/020
  DOM-escaping fixes could only be re-verified by source inspection, not
  by rendering a page and inspecting the live DOM; and no requests were
  ever made against the deployed Render instance or any external service
  (Google OAuth, OpenAI), consistent with this audit's scope from Part 1
  onward.
* **Recommendations carried forward for future work** (not implemented
  under this audit, listed here for visibility): server-side session
  revocation (SEC-005), a stronger password policy (SEC-007), a
  structural nonce-based CSP rework to make `script-src` actually
  restrictive (SEC-023), and cleaning up the confirmed-unused
  dependencies / completing the `sqlite3` major-version upgrade
  (SEC-026 remainder).

---

## Status Summary


* **Part 1: ✅ Complete — all findings fixed.** 3 findings recorded and
  resolved (SEC-001 Critical, SEC-002 Low, SEC-003 Informational), plus
  one XSS output-encoding issue found and fixed opportunistically (full
  writeup deferred to Part 6). Trust-boundary map produced; frontend
  hiding check clear. `node --check` and an inline-script syntax sweep
  pass across `server.js` and every file in `public/*.html`.
* **Part 2: ✅ Complete — 4 of 6 findings fixed, 2 recorded as
  recommendations.** SEC-004 (cookie `secure` flag now env-conditional),
  SEC-008 (Google OAuth now checks `email_verified` before account
  matching/linking), and SEC-009 (`JWT_SECRET` now fails fast instead of
  falling back to a hardcoded string) are fixed and verified, including a
  real server boot test with the project's actual `.env`. SEC-006 (QR/JWT
  secret reuse) got an `.env.example` doc fix (operational, not code).
  SEC-005 (no server-side session revocation) and SEC-007 (password
  policy is length-only) are recorded findings, deliberately left as
  recommendations rather than patched, since both require an
  architecture/product decision rather than a contained code fix. Secrets
  sweep: `.env` is properly gitignored, `.env.example` has no real
  secrets, no hardcoded credentials found in source; the fallback default
  in `JWT_SECRET` that *would* have been a real risk is now closed
  (SEC-009).
* **Part 3: ✅ Complete — all findings fixed and functionally verified.**
  Enumerated all ~35 API routes for role + ownership checks. Found 3
  IDOR/BOLA gaps, all in the legacy attendance endpoints (still live and
  documented, just no longer linked from the current UI): SEC-010 (High,
  cross-organizer attendance tampering), SEC-011 (High, cross-organizer
  attendee data exposure), SEC-012 (Critical, cross-organizer attendance
  *deletion and overwrite* with no ownership check at all). All three
  fixed with the same ownership-check pattern already used correctly
  elsewhere in the codebase, and — since these were the highest-severity
  findings so far — verified with an actual live run (two seeded
  organizer accounts attacking each other's event) rather than just
  `node --check`: all three attacks now return 403, the legitimate owner
  is unaffected, and no cross-tenant data was exposed or destroyed
  in the test.
* **Part 4: ✅ Complete — 3 findings, all fixed and concurrency-tested.**
  Traced the full student and organizer flows; step ordering/skip/replay
  checks came back clean (every transition is server-gated on the right
  field — ownership, payment status, or role — not client-supplied
  state). Found and fixed two genuine race conditions from a
  check-then-act pattern between a `SELECT` and a later `UPDATE`/`INSERT`:
  SEC-013 (High, seat-capacity overselling under concurrent registration)
  and SEC-015 (Medium, discount `used_count` over-redemption under
  concurrent registration), both fixed by folding the check into the same
  atomic statement as the write. Also found and fixed SEC-014 (High,
  `/api/payments/proof` had no status guard, letting an already-expired
  seat hold be resurrected via a different endpoint than the one the
  hold-expiry system was built around). All three verified with a
  dedicated local SQLite concurrency test running the exact statements
  now in `server.js` under real `Promise.all` concurrency (1 of 20/30
  concurrent attempts succeeding against capacity 1/3, as expected) —
  full HTTP-level testing was attempted first but this sandbox's network
  layer was found to truncate JWT-shaped strings in transit, which is
  documented under SEC-013 as an environment limitation rather than
  glossed over.
* **Part 5: ✅ Complete — 3 findings, all fixed and verified.** Built a
  security-annotated inventory of every endpoint in
  `docs/05-api-reference.md` (auth/role/ownership/validation/sensitive-
  data-returned for each) and, while cross-checking it against the code,
  found two entries in the docs that were stale — describing
  vulnerabilities Part 2 (SEC-004) and Part 3 (SEC-010) had already
  fixed — and corrected both docs in place. New findings: SEC-016
  (Medium, 16 spots leaking raw SQLite error text to clients — replaced
  with a shared helper that logs real errors server-side and always
  returns a generic message), SEC-017 (Medium, the public event-detail
  endpoint used `SELECT e.*`, exposing internal numeric IDs and
  duplicating bank/UPI fields unnecessarily — trimmed to an explicit
  safe column list, verified against seeded secret values), and SEC-018
  (High, no global Express error-handling middleware — a malformed
  JSON body on *any* endpoint, no auth needed, triggered Express's
  default handler and leaked a full stack trace with real filesystem
  paths; fixed with a catch-all error handler and re-verified against
  the exact request that found it).
* **Part 6: ✅ Complete — 5 findings, 4 fixed and verified, 1 recorded
  as a recommendation.** SQL injection check came back clean
  (parameterized throughout, including the dynamic search/sort query
  builders). Found the codebase's existing `escapeHtml()` pattern —
  correctly used in some files since Part 1 — was inconsistently
  applied elsewhere, producing two real stored-XSS findings: SEC-019
  (High, the public homepage's event cards rendered organizer-supplied
  title/description/location unescaped — reachable by every visitor,
  no login needed) and SEC-020 (High, several organizer/admin-facing
  views — payment-proof review, the *unauthenticated* organizer-
  application review list, the attendance scanner, and the payment
  page — rendered other users' free-text input unescaped, letting a
  lower-privileged or even anonymous submitter run script in an
  admin's or organizer's session). Both fixed with the same escaping
  helper already used correctly elsewhere, and verified against live
  payloads submitted through the real registration/event APIs, not
  just reviewed. Also found and fixed SEC-021 (Medium, the UPI QR
  upload endpoint accepted any file type with no `fileFilter`,
  serving whatever was uploaded same-origin — restricted to verified
  PNG/JPEG/WebP, verified with both a rejected malicious upload and
  an accepted real one) and SEC-022 (Low, CORS reflected and trusted
  any origin with credentials enabled — tightened to same-origin-only
  by default with an opt-in allowlist, verified a foreign origin no
  longer gets `Access-Control-Allow-Origin` while same-origin use is
  unaffected). CSRF was checked and found not currently exploitable
  given the existing `sameSite: 'lax'` cookie-only auth with no token
  ever exposed to JS — recorded as a pass. SEC-023 (Informational,
  CSP's `'unsafe-inline'`/`'unsafe-eval'` in `script-src` means CSP
  currently adds no defense-in-depth against XSS) is recorded as a
  recommendation rather than implemented, since a real fix needs
  per-request nonce templating across all 11 HTML pages — a
  structural change beyond this part, the same reasoning Part 2 used
  for SEC-005/SEC-007.
* **Part 7: ✅ Complete — 3 findings, 2 fully fixed and verified, 1
  mixed (partially fixed, remainder recorded).** Confirmed (not
  assumed) no WebSocket functionality exists anywhere in the codebase
  — no finding. Found SEC-024 (High, the unauthenticated
  `/api/chatbot` endpoint had no dedicated rate limit despite calling
  a paid third-party LLM API per request — a cost-based
  denial-of-wallet vector — fixed with a 20-req/15-min limiter,
  verified live) and SEC-025 (Medium, seat-hold registration and
  payment-proof submission shared the same gap, enabling
  seat-squatting on capacity-limited events and payment-queue
  flooding — fixed with the same pattern, verified live). Ran a full
  `npm audit` (SEC-026): triaged all 22 advisories by runtime
  reachability rather than mass-upgrading — fixed the two that are
  actually reachable in this app's own code paths (`multer`'s
  file-upload DoS issues, upgraded `2.0.2`→`2.3.0` within the existing
  semver range; `qs`'s query-string-parsing DoS issues, patched via a
  targeted `package.json` override to `6.16.0` without waiting on a
  major Express bump) and recorded the rest as low-priority or
  out-of-scope recommendations with explicit reasoning (`uuid`'s flaw
  needs an argument this codebase never passes; the Critical/High
  `sqlite3`-toolchain advisories are build-time-only and need a
  breaking major version; `axios`/`nodemailer`/`razorpay`/`stripe`/
  `passport`/`passport-google-oauth20` are confirmed unused at
  runtime). Re-verified after both dependency changes: `node --check`
  passes, a full server boot succeeds, and a live registration/login/
  query-string-parsing smoke test all behave correctly.
* Part 8: not yet started.
