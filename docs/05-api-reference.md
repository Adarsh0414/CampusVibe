# 5. API Reference

All endpoints are prefixed `/api` and return JSON (except
`GET /api/events/:uuid/calendar.ics`, which returns a calendar file).
Requests and responses are JSON unless noted; authenticated endpoints
expect the `token` cookie set at login (see
[06-authentication-and-roles.md](./06-authentication-and-roles.md)) —
the frontend always calls `fetch()` with `credentials: 'include'` so the
cookie is sent automatically.

**Legend:**
- 🔓 Public — no authentication required
- 🔐 Authenticated — any logged-in user (`authRequired`)
- 🛡️ Organizer — authenticated **and** `role` is `committee` or `admin`
  (`requireOrganizer`)
- 👑 Admin — authenticated **and** `role` is `admin` (`requireAdmin`)

Error responses throughout this API follow the shape `{ "error":
"<message>" }` with an appropriate HTTP status code (`400` invalid
input, `401` not authenticated, `403` forbidden, `404` not found, `409`
conflict, `500` server error).

---

## Misc

### `GET /api/health` 🔓
Health check. Returns `{ ok: true, time: "<ISO timestamp>" }`.

### `GET /api/meta/categories` 🔓
Returns the fixed list of event categories used across the app:
`{ categories: ["Technical", "Cultural", "Sports", "Workshops"] }`.

---

## Authentication

### `POST /api/auth/login` 🔓 *(rate-limited: 30 / 15 min per IP)*
Body: `{ email, password }`.
- Validates email format and that the account has a password (Google-only
  accounts are rejected here with a message pointing to "Login with
  Google").
- On success: sets the `token` cookie (JWT, 7-day expiry, `httpOnly`),
  returns `{ user: { id, role, name, email }, token: "<preview>..." }`
  (the `token` field in the response body is a **truncated preview only**
  — the real, complete token is in the cookie, not something client JS
  needs to read).

### `POST /api/auth/register` 🔓 *(rate-limited)*
Body: `{ name, email, password, mobile, roll_number }`. Creates a
`role: 'student'` account. Requires email + password (min. 6 characters);
`name`/`mobile`/`roll_number` are optional. Logs the user in immediately
(same cookie behavior as login) — no email verification step exists.

### `POST /api/auth/register-organizer` 🔓 *(rate-limited)*
Body: `{ name, email, password, mobile, roll_number, reason }`. Requires
`name` and `mobile` in addition to email/password. **Does not log the
user in or grant organizer access** — creates a `role: 'student'` account
with `organizer_status: 'pending'` and returns `{ ok: true, pending:
true, message: "..." }`. See "Organizer application review" below for
how this gets approved.

### `POST /api/auth/logout` 🔓
Clears the `token` cookie. Always returns `{ ok: true }`.

### `GET /api/auth/google` / `GET /api/auth/google/start` 🔓
Both start the same Google OAuth 2.0 flow — two paths exist because
`login.html` and `register.html` historically linked to slightly
different URLs. Redirects to Google's consent screen. Returns nothing to
call directly — this is meant to be a full-page navigation
(`<a href="/api/auth/google">`), not a `fetch()` call. If Google OAuth
isn't configured (see [09-setup-and-deployment.md](./09-setup-and-deployment.md)),
redirects to `/login.html?error=google_not_configured` instead of
erroring.

### `GET /api/auth/google/callback` 🔓
Google redirects back here after consent. Exchanges the authorization
code for a token, fetches the user's Google profile, finds-or-creates a
matching `users` row (matched by email or Google `sub`), sets the same
`token` cookie as a normal login, and redirects to `/dashboard.html`
(organizers/admins) or `/` (students). Not meant to be called directly.

### `GET /api/auth/me` 🔐
Returns the current user's full profile:
```json
{
  "user": {
    "id": 1, "uuid": "...", "name": "...", "email": "...",
    "role": "student", "organizer_status": null,
    "mobile": "...", "roll_number": "...", "avatar_url": null,
    "ticket_count": 3, "events_organized": 0
  }
}
```

### `PUT /api/users/me` 🔐
Body: `{ name, mobile, roll_number }` (any subset — omitted fields keep
their current value). Updates the caller's own profile.

---

## Organizer applications (admin review)

### `GET /api/admin/organizer-applications` 👑
Returns all pending applications:
`{ applications: [{ id, uuid, name, email, mobile, roll_number, organizer_status, organizer_reason, created_at }, ...] }`.

### `POST /api/admin/organizer-applications/:id/approve` 👑
Sets that user's `role` to `'committee'` and `organizer_status` to
`'approved'`. `404` if the application doesn't exist or was already
processed (the query only matches rows still `'pending'`).

### `POST /api/admin/organizer-applications/:id/reject` 👑
Sets `organizer_status` to `'rejected'`. Same not-found behavior as
approve.

---

## Events

### `GET /api/events` 🔓
Query params: `search` (matches title/description), `category`, `sort`
(`'newest'` or default chronological by `start_time`), `limit` (max
100, default 50).
Only returns events that are `visibility: 'public'`, `status:
'published'`, and **not yet ended** (compared against server time
adjusted +330 minutes, i.e. IST). Each event includes a computed
`registrations` count (tickets excluding `expired` ones).
Also runs the stale-hold expiry sweep first (see
[08-core-features.md](./08-core-features.md)), so counts are always
current.

### `GET /api/events/:uuid` 🔓
A single public event by its (human-friendly) UUID. Adds a computed
`sold` count and `remaining` (capacity minus sold, or `null` if
capacity is unlimited). `404` if not found or not public.

### `GET /api/events/:uuid/calendar.ics` 🔓
Returns a standards-compliant `.ics` calendar file (`Content-Type:
text/calendar`) as an attachment download, for any public event. Used by
the "Add to Calendar → Download" option on the event page. If the event
has no `end_time`, defaults to a 2-hour duration.

### `POST /api/events` 🛡️
Creates a new event. Body fields: `title`, `description`, `category`
(must be one of the fixed categories), `start_time`, `end_time`,
`location`, `capacity`, `price_cents`, `price_single_cents`,
`price_duo_cents`, `price_trio_cents`, `allowed_tiers`, `status`
(`'draft'` or anything else → `'published'`), `visibility` (`'private'`
or anything else → `'public'`), `discounts_enabled`, `discount_codes`
(array — see below). `title`, `start_time`, `location`, and a valid
`category` are required. Generates a human-friendly event ID (see
[04-database-schema.md](./04-database-schema.md)) and saves any provided
discount codes in the same call. Returns `{ ok: true, event: { uuid } }`.

### `PUT /api/events/:uuid` 🛡️
Updates an existing event. Same body shape as create. Only the event's
own creator (`created_by`) or an admin may edit it — everyone else gets
`403`.

### `DELETE /api/events/:uuid` 🛡️
Deletes an event (and, per the frontend's confirmation prompt, this is
irreversible). Same ownership check as `PUT`.

### `POST /api/events/:uuid/register` 🔐
The registration endpoint. Body: `{ participants, ticket_type,
discount_code }`, where `participants` is a non-empty array of `{ name,
roll_number }` (one entry per person — 1 for `single`, 2 for `duo`, 3
for `trio`) and `ticket_type` is `'single'` (default), `'duo'`, or
`'trio'`.

Flow:
1. Expires any stale holds first, then checks capacity (counting tickets
   that are `paid`/`verified`/`pending`/`rejected`, plus `unpaid` ones
   whose hold hasn't expired) — `409` if full.
2. Looks up the base price for the chosen tier.
3. If a `discount_code` is supplied and valid (exists, active, under its
   use limit), applies it and increments its `used_count`.
4. If the final price is `0`, the ticket is created as `payment_status:
   'paid'` immediately and a QR code is generated right away — response:
   `{ ok: true, ticket: { uuid } }`.
5. If the final price is greater than `0`, the ticket is created as
   `payment_status: 'unpaid'` with a 5-minute `hold_expires_at` — response:
   `{ requires_payment: true, ticket_uuid, hold_expires_at }`, and the
   frontend redirects to the payment page.

### `GET /api/organizer/my-events` 🛡️
Lists events created by the current organizer (or, for admins, likely
all events created by anyone — see `server.js` around line 1097 for the
exact query if this distinction matters for your use case).

### `GET /api/organizer/events/:uuid/discounts` 🛡️
Lists discount codes configured for one of the organizer's own events.

---

## Tickets

### `GET /api/tickets/:uuid` 🔐
A single ticket's full detail (used by `ticket.html`). Only the ticket's
owner (or an organizer/admin, for review purposes) can view it —
check the route in `server.js` for the exact authorization condition if
extending this.

### `GET /api/my-tickets` 🔐
All of the current user's tickets, newest event first, including event
title/time/location, payment status, check-in status, and any active
hold expiry. Runs the stale-hold sweep first.

---

## Payments (manual bank transfer / UPI)

There is no payment gateway integration in this codebase — see
[02-tech-stack.md](./02-tech-stack.md). Payment is "manual": the
organizer publishes their bank/UPI details, the student pays outside the
app and reports a transaction ID, and the organizer confirms it.

### `GET /api/events/:uuid/payment-setup` 🔓
Returns an event's payment instructions (`bank_account_name`,
`bank_account_no`, `bank_ifsc`, `upi_id`, `upi_qr_url`,
`payment_notes`) — shown to a student on the payment page. Public
(doesn't require login) since a student needs to see this before/while
paying.

### `PUT /api/events/:uuid/payment-setup` 🛡️ *(multipart/form-data)*
Organizer-only. Body fields: `bank_account_name`, `bank_account_no`,
`bank_ifsc`, `upi_id`, `payment_notes`, plus an optional file field
named `upi_qr` (the QR code image, handled by `multer`, saved under
`public/uploads/`). Only the event's owner or an admin may update it.

### `POST /api/payments/proof` 🔐
Body: `{ ticket_uuid, txn_id }`. The student submits their transaction
ID / UTR number as proof of payment. Sets `payment_status` to
`'pending'`. Only the ticket's own owner can submit proof for it.

### `GET /api/organizer/events/:uuid/payments` 🛡️
Query param `status` (default `'pending'`). Lists tickets for one of the
organizer's events matching that payment status, joined with the
registering student's name/email — this is what populates the "Payment
Proofs" tab in the dashboard.

### `POST /api/organizer/payments/:ticketUuid/approve` 🛡️
Approves a submitted proof: generates the ticket's QR code (only
happens at this point — a ticket has no QR until it's `paid`), sets
`payment_status: 'paid'`, records `reviewed_by`/`reviewed_at`, and sets
`price_paid_cents` to the previously-computed `amount_due_cents`.

### `POST /api/organizer/payments/:ticketUuid/reject` 🛡️
Body: `{ reason }` (required). Sets `payment_status: 'rejected'` with
the given reason. The student can see this reason and resubmit proof
via `POST /api/payments/proof` again.

---

## Analytics

### `GET /api/analytics/events/:uuid` 🛡️
Returns summary analytics for one of the organizer's own events
(registration counts, revenue, payment-status breakdown — see
`server.js` around line 1418 for the exact fields returned).

---

## Attendance

### `POST /api/attendance/scan` 🛡️
Body: `{ code }` — the raw string payload decoded from a scanned QR
code (a JSON string containing `ticket_uuid`, `event_uuid`, `user_id`,
and an HMAC `sig`). The signature is re-computed server-side and
compared, rejecting any tampered payload (`400`). Only the event's owner
(or an admin) may check in tickets for that event (`403` otherwise —
"This ticket belongs to a different organizer's event"). The ticket must
already be `payment_status: 'paid'`. If already checked in, returns
`{ already: true, details }` rather than double-recording. Otherwise
marks `checked_in = 1` and inserts an `attendance` row with
`source: 'qr'`.

### `POST /api/attendance/manual-by-ticket` 🛡️
Body: `{ event_uuid, ticket_number, present }`. The friendlier manual
check-in path: an organizer/volunteer enters the human-readable event ID
once, then just a ticket number (the `tickets.id` shown as "#0007" on
the e-ticket) for each person. `present` defaults to `true`; passing
`false` explicitly un-checks someone in. Returns participant names
(parsed from `participants_json`) and whether they were already checked
in.

### `POST /api/attendance/manual` 🛡️
The older/lower-level manual check-in endpoint: body `{ event_id,
user_id, present }` using **raw internal numeric IDs** rather than the
friendlier UUID/ticket-number pair above. Still present and functional,
but not what the current `attendance.html` UI actually calls — see the
comment in `server.js` above `manual-by-ticket` explaining why that
endpoint replaced this one for the door-side workflow. **Note:** unlike
the other two check-in paths, this one does not insert a `ticket_id`
into the `attendance` row it creates (it's left `NULL`). It *does* now
verify event ownership (`event.created_by === req.user.id`, or admin)
before marking attendance — this was fixed under SEC-010 (see
`SECURITY_AUDIT.md`); earlier revisions of this doc described it as
missing that check, which was accurate at the time but is no longer
current. Still, treat this endpoint as legacy/internal rather than
extending it further — `manual-by-ticket` is the maintained path.

### `GET /api/attendance/:eventId/export` 🛡️
Body-less. Returns the raw `attendance` rows for one event as JSON
(`{ attendance: [...] }`) — used by the "Offline backup" feature in
`attendance.html` to let an organizer copy the day's check-in data to
their clipboard.

### `POST /api/attendance/:eventId/import` 🛡️
The reverse of export — restores attendance records from a previously
exported JSON blob, for recovering from e.g. a browser crash mid-event.

---

## Chatbot

### `POST /api/chatbot` 🔓
Body: `{ message }`. If `OPENAI_API_KEY` is **not** set in the
environment, immediately returns `{ handled: false }` — the frontend
widget interprets this as "no LLM available" and falls back to its own
built-in, client-side knowledge base (see
[08-core-features.md](./08-core-features.md)). If a key **is** set,
forwards the message to OpenAI's Chat Completions API with a fixed
system prompt describing CampusVibe, using model
`OPENAI_CHAT_MODEL` (default `gpt-4o-mini`), and returns `{ handled:
true, reply: "..." }`. Any upstream failure (bad key, API error, network
issue) is caught and degrades gracefully to `{ handled: false }` rather
than surfacing an error to the user.

---

## Static files & fallback

### `express.static(public/)`
Registered *after* every API route above. Serves every file under
`public/` directly (HTML pages, `assets/`, `uploads/`) by its real path.

### `GET *` (catch-all, registered last)
Serves `public/index.html` for any request that didn't match an API
route or a real static file. See
[03-architecture.md](./03-architecture.md) for why this ordering matters.
