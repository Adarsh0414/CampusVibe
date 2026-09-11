# 1. Project Overview

## What is CampusVibe?

CampusVibe is a web application for managing campus events — college
fests, technical competitions, cultural nights, workshops, and sports
events. It gives students a single place to discover what's happening on
campus and register, and gives event organizers (clubs, societies,
departments) a dashboard to create events, collect payments, and manage
attendance at the door.

Its tagline, used throughout the app's UI, is **"Ideal Management, Ideal
Moments."**

## Who uses it, and how

CampusVibe has three kinds of users, distinguished by a `role` column on
the `users` table (see [04-database-schema.md](./04-database-schema.md)):

- **Students** (`role = 'student'`) — the default role for anyone who
  registers. They can browse and search events, register for one
  (individually or in a group, depending on the event's configured
  ticket tiers), pay via bank transfer or UPI and submit proof, and once
  an organizer confirms that proof, receive a QR-code e-ticket. They can
  also view all their tickets and their profile.
- **Organizers** (`role = 'committee'` internally — the UI calls this
  role "Organizer" or "Committee") — approved by an admin (see the
  organizer-application workflow below). Organizers get access to a
  Dashboard where they can create and edit events, configure payment
  details (bank account / UPI ID / QR code) and optional discount codes,
  review and approve or reject payment proofs submitted by students, view
  basic analytics for their events, and check people in at the door using
  either a QR scanner or manual ticket-number lookup.
- **Admins** (`role = 'admin'`) — a single seeded account (see
  [09-setup-and-deployment.md](./09-setup-and-deployment.md)) with every
  organizer capability across *every* event (not just their own), plus
  the ability to approve or reject organizer applications.

Becoming an organizer is **not instant**. Anyone can fill out an
"Apply to be an organizer" form, but the resulting account stays a
regular student account (with `organizer_status = 'pending'`) until an
admin reviews and approves it. This is a deliberate anti-abuse measure —
see [06-authentication-and-roles.md](./06-authentication-and-roles.md).

## The core user journeys

**A student, end to end:**
1. Registers an account (or signs in with Google).
2. Browses the homepage's event catalog — searchable and filterable by
   category (Technical, Cultural, Sports, Workshops).
3. Opens an event page, picks a ticket tier if the event offers more than
   one (Single / Duo / Trio — see [08-core-features.md](./08-core-features.md)),
   fills in participant details, and optionally applies a discount code.
4. If the event is free, they get a QR e-ticket immediately. If it costs
   money, their registration goes into a **5-minute hold** while they pay.
5. They pay the organizer directly (bank transfer or UPI, using the
   details the organizer configured) and submit a transaction ID / UTR
   number as proof — no card details or payment gateway involved.
6. Once the organizer approves that proof, a QR-code ticket is generated
   and the student can view/download it from "My Tickets."
7. At the event, the organizer scans the student's QR code (or looks them
   up manually by ticket number) to check them in.

**An organizer, end to end:**
1. Applies for an organizer account and waits for admin approval.
2. Once approved, logs into the Dashboard and creates an event: title,
   description, category, date/time, location, capacity, and pricing
   (either a single flat price, or per-tier pricing for Single/Duo/Trio
   tickets).
3. Configures how they'll receive payment (bank details and/or a UPI ID
   plus an uploaded UPI QR code image) and, optionally, discount codes.
4. As students register and submit payment proof, the organizer reviews
   each submission in the "Payment Proofs" tab and approves or rejects it
   (rejection requires a reason, which the student can see and act on).
5. Views simple analytics for the event (registrations, revenue, etc.).
6. On the day of the event, uses the Attendance page to check people in,
   either by scanning ticket QR codes with a camera or by typing in a
   ticket number.

## Key features at a glance

- Event discovery with search and category filtering
- Flexible ticket tiers (Single / Duo / Trio group registration) with
  independent pricing per tier
- Organizer-configurable discount codes (percentage or fixed-amount off)
- A 5-minute automatic seat-hold/expiry system so unpaid registrations
  don't permanently block capacity
- Manual payment verification workflow (bank transfer / UPI + proof
  review) rather than a live payment gateway
- QR-code e-tickets, generated only after payment is verified
- Two attendance check-in methods: camera QR scan, or manual ticket-number
  lookup — plus JSON export/import for offline backup
- Calendar export (`.ics` download) for any public event
- A floating chatbot assistant with a built-in knowledge base and an
  optional real-LLM fallback
- Support for 30+ languages via a client-side i18n system, including
  right-to-left languages (Urdu, Kashmiri, Sindhi)
- Organizer-application workflow with admin approval (not self-service)
- PWA basics (a web app manifest and icon set) so the site can be
  "installed" on a phone home screen

For exactly how each of these works under the hood, see
[08-core-features.md](./08-core-features.md).
