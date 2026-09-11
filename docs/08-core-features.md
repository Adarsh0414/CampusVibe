# 8. Core Features — Deep Dives

## Ticket tiers (Single / Duo / Trio) and group registration

An event can accept one, two, or all three registration "tiers,"
controlled by `events.allowed_tiers` (a comma-or-single value like
`'single'` or `'single,duo,trio'`) and priced independently via
`price_single_cents`, `price_duo_cents`, `price_trio_cents`. This lets an
organizer run, say, a hackathon where a "Trio" ticket (a 3-person team)
costs less per head than three separate "Single" tickets.

At registration (`POST /api/events/:uuid/register`):
- The student picks a tier; the frontend renders exactly that many
  participant-detail rows (1 for single, 2 for duo, 3 for trio), each
  collecting `{ name, roll_number }`.
- All participants are stored together as a **single ticket row**, with
  the array serialized into `tickets.participants_json`. There's no
  separate row per participant — the group registers and checks in as
  one unit under one ticket number.
- The base price for the chosen tier is looked up, a discount code (if
  any) is applied, and that final price becomes both
  `amount_due_cents` and (once paid) `price_paid_cents`.

## The 5-minute seat-hold system

**The problem this solves:** if a paid event's capacity is limited, what
stops someone from registering, never actually paying, and permanently
occupying a seat that a paying student could have used?

**The mechanism:**
1. When a registration for a *paid* tier is created, it's inserted with
   `payment_status: 'unpaid'` and `hold_expires_at` set to **5 minutes**
   from now (`HOLD_MINUTES = 5` in `server.js`).
2. While `unpaid` and before `hold_expires_at`, that ticket **still
   counts against the event's capacity** — this is what actually reserves
   the seat.
3. If the student submits payment proof within those 5 minutes
   (`POST /api/payments/proof`), the ticket moves to `pending` and is
   permanently safe from expiry from that point on — the countdown was
   only ever about *unpaid, unattempted* holds.
4. If 5 minutes pass with no proof submitted, the ticket is flipped to
   `payment_status: 'expired'` and **no longer counts against capacity**
   — the seat is released back to everyone else.

**Where expiry actually happens:** there are two mechanisms, working
together:
- A **background sweep** (`setInterval`, every 30 seconds) that runs
  `expireStaleHolds()` unconditionally.
- The exact same `expireStaleHolds()` function is **also called inline**,
  synchronously, at the start of every route that reads capacity or
  ticket lists (`GET /api/events`, `GET /api/events/:uuid`, `POST
  /api/events/:uuid/register`, `GET /api/my-tickets`) — so a stale hold
  is never visible to a user even during the up-to-30-second gap between
  background sweeps. The 30-second interval exists mainly so seats free
  up promptly even if nobody happens to be actively browsing/registering
  at that moment.

**On the frontend:** `payment.html` shows a **live countdown timer**
against the ticket's `hold_expires_at`, so the student can see exactly
how much time they have left to submit proof, with a one-time
announcement (not a per-second one) when it actually expires — see
[10-accessibility.md](./10-accessibility.md) for why that distinction
matters for screen-reader users.

## Manual payment verification (no payment gateway)

CampusVibe does **not** integrate a payment gateway (Razorpay and Stripe
are installed as dependencies but never used — see
[02-tech-stack.md](./02-tech-stack.md)). Instead, payment is handled
directly between the student and the organizer, with the platform acting
only as a record-keeper and verifier:

1. The organizer configures how they accept payment for their event
   (`PUT /api/events/:uuid/payment-setup`): bank account details, a UPI
   ID, and/or an uploaded UPI QR code image.
2. A student who owes money is shown these details on `payment.html` and
   pays the organizer **outside the app entirely** (their own banking
   app, UPI app, cash, etc.).
3. The student then reports proof of that payment back to CampusVibe as
   a **transaction ID / UTR number** (`POST /api/payments/proof`) — note
   this is a text field, not a screenshot upload (the `proof_image_url`
   column exists in the schema but nothing currently populates it).
4. The organizer reviews submitted transaction IDs in their Dashboard's
   "Payment Proofs" tab, checks them against their own bank/UPI
   statement manually, and clicks Approve or Reject.
5. Only on **Approve** does CampusVibe generate the ticket's QR code —
   there is no QR code, and therefore no way to be checked in at the
   event, until an organizer has manually confirmed the money arrived.

This is simple and requires no payment-gateway account, merchant fees, or
PCI compliance work, at the cost of being manual (organizer effort scales
with registration volume) and trust-based (nothing stops a student from
entering a fake transaction ID — the organizer's manual bank-statement
check is the only real safeguard).

## Discount codes

Organizers can define discount codes per event
(`events.discounts_enabled` + rows in the `discounts` table), each either
a percentage off (`percentage`) or a fixed amount off (`amount_cents`),
optionally capped by `max_uses`. At registration, a submitted code is
looked up (case-insensitively — codes are stored/matched uppercased),
checked for being `active` and under its use cap, applied to the tier's
base price, and its `used_count` incremented. Codes are **unique across
the whole platform**, not scoped per-event at the database level — see
[04-database-schema.md](./04-database-schema.md).

## QR-code attendance

Once a ticket reaches `payment_status: 'paid'`, the server generates a QR
code encoding a small JSON payload:

```json
{ "ticket_uuid": "...", "event_uuid": "...", "user_id": 42, "sig": "<HMAC-SHA256>" }
```

The `sig` is an HMAC-SHA256 of `ticket_uuid:event_uuid:user_id`, signed
with `QR_SIGNING_SECRET` (falls back to `JWT_SECRET` if unset). This
means a scanned QR code's authenticity can be verified **without a
database lookup first** — `POST /api/attendance/scan` recomputes the
expected signature and rejects anything that doesn't match *before*
querying the ticket, which is both a security measure (a forged/edited
QR payload is rejected outright) and a minor efficiency one.

Two independent ways to check someone in, both ultimately setting
`tickets.checked_in = 1` and inserting an `attendance` log row:

1. **QR scan** (`POST /api/attendance/scan`) — the device camera reads
   the code, the app sends the raw payload string to the server.
2. **Manual by ticket number** (`POST /api/attendance/manual-by-ticket`)
   — for when scanning isn't practical (bad lighting, a phone with no
   working camera input, a student who can't pull up their ticket). The
   organizer types the event's human-friendly ID once, then just the
   short ticket number (`#0007`) printed on each e-ticket.

Both paths verify the calling organizer actually owns the event (or is
an admin) before allowing check-in, and both are idempotent about
double-scanning — checking in an already-checked-in ticket returns
`{ already: true }` rather than silently creating duplicate attendance
log rows or erroring confusingly.

For resilience during a live event (spotty wifi, a crashed browser tab),
`attendance.html` also supports **exporting** the current attendance log
to the clipboard as JSON and **importing** it back later.

## The chatbot assistant

`assets/js/chatbot.js` is a self-contained floating widget included on
every page. It answers in two tiers, and is explicitly designed to never
invent an answer it doesn't have:

1. **A local, client-side knowledge base** — an array of 17 `{ keys,
   answer }` entries covering the most common questions (how to
   register, how to pay, why a ticket is pending, how to create an
   event, how discount codes work, how organizer approval works, etc.).
   Matching is simple keyword scoring: for each KB entry, every one of
   its `keys` phrases found as a substring of the user's message adds
   that phrase's word-count to a score; the highest-scoring entry above
   zero wins. This works entirely offline/instantly and needs no server
   round-trip.
2. **A server fallback** (`POST /api/chatbot`) for anything the KB
   doesn't confidently match. If the site owner has set an
   `OPENAI_API_KEY`, this forwards the question to a real LLM (OpenAI's
   Chat Completions API) with a system prompt describing exactly what
   CampusVibe does and doesn't do, so it can answer genuinely open-ended
   questions. **Without a key, it honestly says it couldn't find an
   answer** and points to the FAQ page / contacting the organizer,
   rather than guessing — see the comment at the top of `chatbot.js` for
   this design philosophy stated directly by the original author.

The widget also gives a **page-aware greeting** (a different opening
message depending on whether you're on the payment page, my-tickets,
dashboard, or an event page) and offers a handful of one-tap suggested
questions. It's implemented as an accessible, non-modal dialog widget —
see [10-accessibility.md](./10-accessibility.md).

## Multilingual support (i18n)

`assets/js/i18n.js` + `assets/i18n/i18n-data.js` implement a client-side
translation system supporting **30+ languages**, including several
Indian regional languages (Hindi, Bengali, Tamil, Telugu, Marathi,
Gujarati, Punjabi, Kannada, Malayalam, Odia, Assamese, Maithili,
Konkani, Bodo, Dogri, Santali, Manipuri, and more) and right-to-left
languages (Urdu, Kashmiri, Sindhi).

How it works:
- Elements marked `data-i18n="<key>"` (text content), `data-i18n-title`
  (the `title` attribute), or `data-i18n-placeholder` (form placeholder
  text) get their content replaced with the current language's string
  for that key.
- The selected language is remembered (persisted across page loads —
  see `getLanguage()`/`setLanguage()` in `i18n.js`) and applied by
  setting `<html lang="...">` and `<html dir="ltr"|"rtl">` accordingly,
  so RTL languages actually flip the page layout, not just the text.
- If a key has no translation in the current language, the English
  string is shown as a fallback automatically (rather than a blank
  space or a raw key name) — and that specific element is individually
  marked `lang="en"` so a screen reader pronounces it correctly instead
  of applying the page's selected language's pronunciation rules to
  English text. See
  [ACCESSIBILITY_AUDIT.md](../ACCESSIBILITY_AUDIT.md) (issue A11Y-018)
  for the full reasoning.
- Changing the language re-scans and re-translates the **entire current
  page**, including dynamically-rendered content like event cards — not
  just the static markup present at page load.

## Calendar export

`GET /api/events/:uuid/calendar.ics` generates a standards-compliant
iCalendar (`.ics`) file for any public event, offered from the event
page as "Add to Calendar → Download." This is a plain-text format
understood by Outlook, Apple Calendar, Google Calendar's import feature,
and most other calendar software — no external calendar API integration
is needed. The event page also offers a direct "Add to Google Calendar"
link (built client-side from the event's details) as a one-click
alternative that doesn't require a file download.

## PWA basics

`public/manifest.json` declares CampusVibe as an installable web app
(name, theme color, icon set at 192×192 and 512×512). There is **no
service worker** in this codebase, so while a phone can add CampusVibe to
its home screen with a proper icon and standalone display mode, there's
no offline caching or background-sync behavior — it's a PWA manifest
only, not a full offline-capable PWA.
