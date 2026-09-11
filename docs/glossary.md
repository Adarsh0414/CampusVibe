# Glossary

Project-specific terms used throughout this documentation and the
codebase, in one place for quick lookup.

**Admin** — The `role: 'admin'` user. Exactly one is seeded on first
startup (from `ADMIN_EMAIL`/`ADMIN_PASSWORD`). Can do everything an
organizer can, for any event, plus approve/reject organizer
applications. See [06-authentication-and-roles.md](./06-authentication-and-roles.md).

**Attendance** — The `attendance` database table: a log of check-in
events (one row per check-in action), separate from the `checked_in`
flag stored on each `tickets` row. See
[04-database-schema.md](./04-database-schema.md).

**Committee** — The internal `role` column value (`'committee'`) for
what every part of the user-facing UI calls "Organizer." If you see
`role === 'committee'` in the code, that's an organizer account.

**Discount code** — An organizer-configured code (percentage or
fixed-amount off) applicable to one event, stored in the `discounts`
table. Unique across the whole platform, not per-event. See
[08-core-features.md](./08-core-features.md).

**Event ID** (a.k.a. event UUID) — A human-friendly identifier in the
format `DDMMYYYY` + 6 random digits (e.g. `08072026482913`), used
instead of a random UUID specifically so it's easy for an organizer to
read aloud, write down, or type at a check-in desk. See
[04-database-schema.md](./04-database-schema.md).

**Group registration / group type** — A single ticket covering more than
one person (Duo = 2 people, Trio = 3), with all participants' details
stored together as JSON on one `tickets` row. See "Ticket tier" below and
[08-core-features.md](./08-core-features.md).

**Hold** / **seat hold** — The 5-minute window an *unpaid* ticket has to
submit payment proof before it automatically expires and its seat is
released. See "The 5-minute seat-hold system" in
[08-core-features.md](./08-core-features.md).

**Organizer** — The user-facing name for the `committee` role. Someone
who has applied for and been approved for organizer access, and can
create/manage events. See [06-authentication-and-roles.md](./06-authentication-and-roles.md).

**Organizer application** — The pending-approval request created by
`POST /api/auth/register-organizer`, tracked via
`users.organizer_status` (`pending` / `approved` / `rejected`). Must be
approved by an admin before the account gains organizer (`committee`)
access. See [06-authentication-and-roles.md](./06-authentication-and-roles.md).

**Participant** — One person covered by a ticket, stored as `{ name,
roll_number }` inside `tickets.participants_json`. A "Single" ticket has
one participant; a "Trio" ticket has three.

**Payment proof** — The transaction ID / UTR number a student submits
(`POST /api/payments/proof`) as evidence they paid the organizer
directly (bank transfer/UPI). Reviewed manually by the organizer, not
verified automatically. See
[08-core-features.md](./08-core-features.md).

**Payment status** — The `tickets.payment_status` value, one of
`unpaid`, `pending`, `paid`, `rejected`, or `expired` (a `verified`
value is referenced in a couple of queries but never actually set — see
[11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md)).
See the full state machine diagram in
[04-database-schema.md](./04-database-schema.md).

**Ticket** — One row in the `tickets` table: a single registration for
one event, covering one or more participants depending on its tier. Has
its own UUID (used in URLs/QR codes) and a numeric ID (used as the
human-facing "Ticket Number," e.g. "#0007").

**Ticket tier** — Which registration size an event offers: `single`
(1 person), `duo` (2 people), or `trio` (3 people), each independently
priced via `events.price_single_cents` / `price_duo_cents` /
`price_trio_cents`. See [08-core-features.md](./08-core-features.md).

**UTR number** — "Unique Transaction Reference" — the reference number
Indian bank transfers (especially UPI payments) generate for a
completed transaction. This is what students are asked to submit as
payment proof, since it's independently verifiable by the organizer
against their own bank/UPI statement.
