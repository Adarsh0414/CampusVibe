# 11. Known Limitations & Technical Debt

This document exists so nobody picking up this project has to
rediscover these things the hard way. Everything below was found by
directly reading the source code — not guessed — and is stated plainly
rather than glossed over, in the same spirit as the accessibility
documentation's honest conformance statement (see
[10-accessibility.md](./10-accessibility.md)).

## Installed but unused dependencies

`package.json` declares several packages that are never `require()`'d or
otherwise referenced anywhere in `server.js`:

| Package | What it's for | Why it's unused here |
|---|---|---|
| `nodemailer` | Sending email | Imported at the top of `server.js` but `.createTransport`/`.sendMail` are never called. No email is ever sent by this app — not a welcome email, not an organizer-application decision notice, nothing. The `SMTP_*` variables in `.env.example` currently do nothing. |
| `razorpay`, `stripe` | Payment gateway processing | Payments are handled manually (bank transfer/UPI + organizer-reviewed proof — see [08-core-features.md](./08-core-features.md)), not through either gateway. Neither package is `require()`'d anywhere. |
| `passport`, `passport-google-oauth20` | OAuth strategy middleware | Google Sign-In is implemented as a hand-rolled OAuth 2.0 flow using `fetch()` directly (see [06-authentication-and-roles.md](./06-authentication-and-roles.md)), not via Passport. |
| `axios` | HTTP client | Every outbound HTTP call in `server.js` (to Google, to OpenAI) uses the native `fetch()` instead. |

**If you're extending this project:** before adding a new HTTP call,
email, or payment feature, check whether the "obvious" library for it is
already in `package.json` — it might be, but not wired up. Either use
it (removing this line item) or remove it from `package.json` if you
build the feature a different way, to keep the dependency list honest.

## Database tables with no code path

Two tables exist in the schema (see
[04-database-schema.md](./04-database-schema.md)) but are never queried,
inserted into, or updated anywhere in `server.js`:

- **`waitlist`** — presumably intended for letting students queue for a
  full/capacity-limited event, but there's no "join waitlist" endpoint
  and no UI for it anywhere.
- **`notifications`** — presumably intended as a generic notification
  log (paired with the unused `nodemailer`/SMS setup above), but nothing
  writes to or reads from it.

Both are harmless to leave as-is (an unused table costs nothing at
SQLite's scale), but if you're auditing "what does this app actually
do," don't assume a feature exists just because its table does.

## A ticket status value that's never set

The `tickets.payment_status` column is referenced in a couple of
capacity-check queries as possibly being `'verified'` (alongside
`'paid'`), but **no code path in `server.js` ever sets a ticket to
`'verified'`** — the only status a confirmed/approved ticket ever
actually reaches is `'paid'`. This looks like a naming holdover from an
earlier version of the payment flow. It's harmless (the queries that
mention `'verified'` still work correctly, they just never match
anything), but worth knowing if you're tracing "why doesn't this ticket
show up as verified anywhere" — it never will, by design of the current
code, regardless of what the column's imagined value space suggests.

## Unused frontend file

**`public/assets/js/app.js`** is not loaded by any of the 12 HTML pages
(verified: no `<script src=".../app.js">` reference exists anywhere in
`public/*.html`). It implements a generic "load events into a `#events`
div, wire up search/category filters" pattern that looks like it
predates each page (particularly `index.html`) implementing that same
logic inline instead. It's dead code — safe to delete, or worth
resurrecting as shared logic if this project ever moves toward reducing
per-page duplication.

## Two pieces of dead CSS (found during the accessibility pass, left alone)

- **`.skip-link`** in `styles.css` has two `background` declarations in
  the same rule — the first sets it to `var(--primary)`, but a second
  declaration further down in the same rule block overrides it to a
  dark, mostly-opaque navy. The `var(--primary)` line has no visual
  effect; it's simply dead. (This was investigated during the
  accessibility audit because it initially looked like a color-contrast
  bug — it isn't, since the line that actually renders is the second
  one, which has good contrast.)
- **`register.html`**'s inline `<style>` block defines `.role-toggle`
  and `.role-btn` classes, but no element anywhere in that page's markup
  uses either class. Likely a leftover from an earlier design where
  students chose their role on the registration form itself (the current
  flow instead uses two separate forms/pages — `register.html` for
  students, `organizer-apply.html` for organizers).

Neither affects anything a user can see or interact with — they're
listed here for completeness and because a future engineer searching for
"why does this class exist" deserves a straight answer rather than
silence.

## Attendance logging inconsistency

`POST /api/attendance/manual` (the older, lower-level manual check-in
endpoint that takes raw internal `event_id`/`user_id` rather than the
newer, friendlier `event_uuid`/`ticket_number` pair used by
`manual-by-ticket`) has one difference worth knowing if you ever call it
directly or extend it: it inserts an `attendance` row with `ticket_id`
left `NULL`, unlike the QR-scan and `manual-by-ticket` paths, which both
populate it.

**Update:** an earlier revision of this doc also noted that this
endpoint didn't verify the calling organizer owns the event before
recording attendance. That's fixed — see SEC-010 in `SECURITY_AUDIT.md`
— the same ownership check present on every other organizer-scoped
route is now here too.

The current `attendance.html` UI doesn't call this endpoint (it uses
`manual-by-ticket` instead), so this isn't reachable through the normal
UI today, but the route is still live and callable directly against the
API.

## Cookie security setting for production

**Update: fixed under SEC-004 (see `SECURITY_AUDIT.md`, Part 2).** This
section originally reported that the `token` and `google_oauth_state`
cookies were hardcoded with `secure: false`, meaning they'd be sent over
plain HTTP even in production. That's no longer the case: all three
`res.cookie('token', ...)` call sites and the `google_oauth_state`
cookie now derive `secure` from `NODE_ENV === 'production'`
(`COOKIE_SECURE` near the top of `server.js`), so a production
deployment with `NODE_ENV=production` set gets `secure: true`
automatically, while local HTTP development (where `NODE_ENV` is unset)
keeps working. **Still worth checking at deploy time:** this only helps
if the hosting platform actually sets `NODE_ENV=production` — confirm
that's the case for wherever this gets deployed (see
[09-setup-and-deployment.md](./09-setup-and-deployment.md)).

## No password-reset flow

There is no "Forgot your password?" feature anywhere in this codebase —
no endpoint, no email-based reset token, no UI for it. A student or
organizer who forgets their password has no self-service way to regain
access to a password-based account (a Google-linked account isn't
affected, since it never had a password to begin with).

## No self-service event cancellation for students

Per the chatbot's own knowledge base (`assets/js/chatbot.js`): *"There
isn't a self-service cancel button yet."* A student who registers can't
cancel their own registration through the app — an unpaid registration
simply expires on its own after 5 minutes if never paid, and a paid
registration requires contacting the organizer directly outside the app,
since refunds/cancellations of manually-paid money aren't something the
platform can automate.

## No automated test suite

There is no test directory, no test runner configuration beyond the
`jsdom` devDependency (which isn't wired into any test script in
`package.json`), and no CI configuration in this repository. All
verification of behavior in this codebase (both the original application
logic and the accessibility remediation pass documented in
`ACCESSIBILITY_AUDIT.md`) has been through manual code reading, `node
--check` syntax validation, and logical tracing — not automated tests.
If you're planning to extend this project seriously, adding a test suite
(even a modest one around the payment-status state machine and the
seat-hold expiry logic, which are the most stateful/timing-sensitive
parts of the app) would meaningfully reduce risk for future changes.

## Accessibility testing gap

Covered in full in [10-accessibility.md](./10-accessibility.md) and the
Conformance Statement in `../ACCESSIBILITY_AUDIT.md`, but worth
repeating here since it's the single largest verification gap in the
project: **no live screen reader, browser, or automated accessibility
tooling (Lighthouse/axe) has ever been run against this app.** Every
accessibility fix that's been made is backed by static analysis only.
