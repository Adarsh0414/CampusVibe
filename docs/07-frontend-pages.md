# 7. Frontend Pages

CampusVibe's frontend is 12 static HTML pages under `public/`. Every page
shares the same header/nav pattern, `assets/css/styles.css`, the chatbot
widget (`assets/js/chatbot.js`), and the i18n system
(`assets/js/i18n.js` + `assets/i18n/i18n-data.js`). Each page's own logic
lives in an inline `<script>` block at the bottom of that page (there is
no shared frontend framework — see
[03-architecture.md](./03-architecture.md)).

## `index.html` — Homepage

The event catalog and main entry point. On load, calls `GET
/api/meta/categories` (to populate the filter dropdown) and `GET
/api/events` (with `search`/`category` query params re-fetched on every
filter change), rendering each result as a card with the category icon,
date, location, and a "View" link to `event.html?e=<uuid>`. Also calls
`GET /api/auth/me` to decide whether to show "Login" or the logged-in
nav (My Tickets / Profile / Organizer / Logout). Includes quick-link
tiles (Events / Profile / Help) and the language selector
(`data-i18n-mount`).

## `login.html` — Login

A simple email/password form (`POST /api/auth/login`) plus a "Continue
with Google" link (`GET /api/auth/google`, a full-page navigation, not a
`fetch()` call). Reads an `?error=` query parameter to show a specific
message if redirected back here after a failed Google OAuth attempt.
Links to both `register.html` (student sign-up) and
`organizer-apply.html`.

## `register.html` — Student Registration

Collects `name`, `email`, `password`, `mobile`, `roll_number` and submits
to `POST /api/auth/register`, which logs the new user in immediately.
Also offers "Continue with Google" (`GET /api/auth/google/start`).

## `organizer-apply.html` — Organizer Application

A longer form (`name`, `email`, `password`, `mobile`, `roll_number`,
`reason`) submitting to `POST /api/auth/register-organizer`. On success,
shows a message explaining the account is pending admin approval — it
does **not** redirect to a logged-in area, since the account isn't an
organizer yet (see
[06-authentication-and-roles.md](./06-authentication-and-roles.md)).

## `event.html` — Event Details & Registration

The most functionally dense student-facing page. Reads the event's UUID
from the `?e=` query parameter and calls `GET /api/events/:uuid`.
Displays the full event description, date/time, location, category, and
remaining capacity. Includes:

- **The ticket-type selector** — a custom-built, keyboard-accessible
  radiogroup (see [10-accessibility.md](./10-accessibility.md)) for
  choosing Single / Duo / Trio, if the event offers more than one tier,
  with the price updating live.
- **The participant fields** — one name + roll-number pair per person
  in the chosen tier, rendered dynamically.
- **A discount code field**, applied client-side by re-fetching pricing
  context, but ultimately validated server-side at registration time.
- **The "Register" action**, which calls `POST
  /api/events/:uuid/register` and either shows a success state (free
  event, ticket issued immediately) or redirects to `payment.html` with
  the new ticket's UUID (paid event, 5-minute hold started).
- **Add to Calendar** — a dropdown offering a `.ics` download (`GET
  /api/events/:uuid/calendar.ics`) or an "Add to Google Calendar" link.
- **Share** — either the native Web Share API (on supported
  browsers/devices) or a fallback dropdown (WhatsApp / Facebook / X /
  Instagram / Copy Link).

## `payment.html` — Payment Instructions & Proof Submission

Reads a ticket UUID from the query string, calls `GET
/api/tickets/:uuid` for ticket/event context and `GET
/api/events/:uuid/payment-setup` for the organizer's bank/UPI details
and QR code image. Shows a **live countdown** to the ticket's
`hold_expires_at` (see [08-core-features.md](./08-core-features.md)) and
a form for submitting the transaction ID / UTR number (`POST
/api/payments/proof`). After submission, the ticket's status becomes
`pending` and the student is told to wait for organizer approval.

## `my-tickets.html` — My Tickets

Calls `GET /api/my-tickets` and lists every ticket the logged-in student
holds, newest event first, each showing the event, date/location,
payment status (with a distinct visual state for `unpaid` w/ countdown,
`pending`, `paid`, `rejected`, `expired`), and a link to `ticket.html` for
tickets that are `paid`.

## `ticket.html` — Single Ticket / E-Ticket View

Calls `GET /api/tickets/:uuid`. For a `paid` ticket, this is the actual
e-ticket: shows the QR code image (a `data:` URL already generated
server-side), event details, and participant names. For tickets in other
states (`unpaid`, `pending`, `rejected`), shows an appropriate status
message instead of a QR code (there's nothing to scan yet).

## `profile.html` — Profile

Calls `GET /api/auth/me` to populate the form and `PUT /api/users/me` to
save changes to `name`, `mobile`, `roll_number`. Also shows read-only
stats (`ticket_count`, `events_organized`) returned by `/api/auth/me`.

## `dashboard.html` — Organizer Console

The organizer/admin control panel, structured as a **tabbed interface**
(implemented as a full WAI-ARIA "Tabs" pattern — see
[10-accessibility.md](./10-accessibility.md)) with these tabs:

- **Create Event** — the event-creation form, calling `POST
  /api/events`, including per-tier pricing, capacity, category, and
  inline discount-code rows.
- **My Events** — calls `GET /api/organizer/my-events`; lists the
  organizer's events with Edit / Analytics / Payment Setup / Copy ID /
  Delete actions per row (Edit calls `PUT /api/events/:uuid`, Delete
  calls `DELETE /api/events/:uuid` behind a native `confirm()` dialog).
- **Payment Setup** — a per-event form for bank/UPI details and QR
  upload, calling `PUT /api/events/:uuid/payment-setup` (multipart, for
  the QR image file).
- **Payment Proofs** — calls `GET
  /api/organizer/events/:uuid/payments?status=pending` (and other
  statuses) to review submitted transaction IDs, with Approve/Reject
  buttons calling the corresponding `POST
  /api/organizer/payments/:ticketUuid/approve|reject` endpoints.
- **Analytics** — calls `GET /api/analytics/events/:uuid` for
  registration/revenue summaries.

If the logged-in user is an `admin`, the dashboard also surfaces the
**organizer-application review** UI (`GET
/api/admin/organizer-applications`, with approve/reject actions) that
regular organizers don't see.

## `attendance.html` — Attendance / Check-In

The door-side tool, also using a tabbed interface (QR Scan / Manual by
Ticket #) with the same accessible Tabs pattern as the dashboard. An
organizer first "locks in" which event they're checking people into (a
short event-ID input, since one organizer may run multiple events).

- **QR Scan mode** — uses the device camera (or a pasted/typed code) to
  read a ticket's QR payload and calls `POST /api/attendance/scan`.
- **Manual mode** — a simple "Ticket Number" input (the human-friendly
  `#0007`-style ID), calling `POST /api/attendance/manual-by-ticket`.
- **Export/Import** — buttons to copy the event's attendance log to the
  clipboard as JSON (`GET /api/attendance/:eventId/export`) and restore
  it later (`POST /api/attendance/:eventId/import`), as an offline-backup
  safety net during a live event.

## `faq.html` — Help / FAQ

A static help page (accordion-style Q&A) — no API calls. Also the page
linked from the homepage's "Help" quick-link and, indirectly, the
chatbot's own "visit the FAQ" suggestion when it can't answer something.

## Shared behaviors across all pages

- **The chatbot widget** (`assets/js/chatbot.js`) injects itself onto
  every page that includes the script tag — see
  [08-core-features.md](./08-core-features.md).
- **The language selector** (`data-i18n-mount`) appears in every page's
  header, backed by `assets/js/i18n.js`.
- **A skip-navigation link** (`<a class="skip-link" href="#main-content">`)
  is the first focusable element on every page, for keyboard users to
  bypass the repeated header/nav.
- **Toast notifications** (a small `role="status"`/`role="alert"`
  element, styled and positioned consistently) are used across pages for
  success/error feedback after form submissions, rather than
  `alert()`/browser dialogs (except for the one destructive confirmation
  — deleting an event — which intentionally does use the native
  `confirm()`).
