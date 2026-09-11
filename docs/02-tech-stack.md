# 2. Tech Stack & Project Layout

## Backend

| Piece | Choice | Notes |
|---|---|---|
| Runtime | Node.js (`>=18.0.0`, per `package.json`'s `engines` field) | |
| Web framework | Express 4 | All routing, middleware, and static file serving |
| Database | SQLite 3 (via the `sqlite3` npm package), file-based | Single file at `data/campusvibe.db`, created automatically on first run. WAL journal mode and foreign keys are enabled at startup. |
| Auth | `jsonwebtoken` (JWT) + `bcryptjs` (password hashing) | JWT is stored in an `httpOnly` cookie named `token`, not `localStorage` |
| Security middleware | `helmet` (CSP + security headers), `cors`, `express-rate-limit`, `cookie-parser` | |
| File uploads | `multer` | Used for the UPI QR code image an organizer uploads for payment setup |
| QR codes | `qrcode` | Generates the e-ticket QR (as a data URL) once a ticket is paid |
| IDs | `uuid` (for user/ticket UUIDs) + a custom human-friendly generator for event IDs (see below) | |
| Dates | `dayjs` | |

## Frontend

There is **no frontend framework and no build step.** The frontend is 12
static HTML pages under `public/`, each with its own inline `<script>`
block (or a small number of shared `.js`/`.css` files), served directly
by Express. Pages talk to the backend via `fetch()` calls to the JSON API
described in [05-api-reference.md](./05-api-reference.md).

Shared frontend assets, all under `public/assets/`:

- **`css/styles.css`** — the single stylesheet used by every page. A
  dark, "starfield" themed design system built on CSS custom properties
  (`--primary`, `--bg`, `--surface`, etc.).
- **`js/chatbot.js`** — the floating chatbot widget, injected into every
  page via a single `<script>` tag (self-contained: builds its own DOM,
  styles, and behavior).
- **`js/i18n.js`** + **`i18n/i18n-data.js`** — the translation engine and
  its 30+ language data tables respectively.
- **`js/lottie.min.js`** + **`lottie/*.json`** — the Lottie animation
  library and one animation file per page, used for the small animated
  illustrations shown on most pages.
- **`js/app.js`** — **not currently used by any page** (no `<script
  src="...app.js">` reference exists anywhere in `public/*.html`). It
  implements a generic event-list loader and appears to be an earlier
  version of logic that each page now implements inline instead. See
  [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md).
- **`img/`** — logo, favicons, PWA icons, default avatar.

## Declared dependencies vs. what's actually used

`package.json` lists several dependencies that are **not** referenced
anywhere in `server.js` (verified by searching for `require(...)` and
usage of each package name in the source). This is worth knowing before
assuming a feature exists just because its library is installed:

| Package | Declared? | Actually used in `server.js`? |
|---|---|---|
| `express`, `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `bcryptjs`, `jsonwebtoken`, `sqlite3`, `qrcode`, `uuid`, `dayjs`, `multer`, `dotenv` | ✅ | ✅ Yes |
| `nodemailer` | ✅ | ❌ **No.** Required at the top of `server.js` but never called (no `createTransport`/`sendMail` anywhere). No emails are actually sent by this codebase, despite `.env.example` having SMTP variables. |
| `razorpay` | ✅ | ❌ **No.** Not required anywhere. Payments are handled manually (bank transfer/UPI + proof review), not through a payment gateway. |
| `stripe` | ✅ | ❌ **No.** Same as above. |
| `passport`, `passport-google-oauth20` | ✅ | ❌ **No.** Google Sign-In is implemented as a hand-rolled OAuth 2.0 "Authorization Code" flow using the built-in `fetch()`, not via Passport.js. |
| `axios` | ✅ | ❌ **No.** All HTTP calls in `server.js` (to Google's OAuth endpoints, and to OpenAI for the chatbot) use the native `fetch()`. |
| `jsdom` (devDependency) | ✅ | Used only for any local/manual testing tooling, not by the running server. |

None of this is a bug — installing a library ahead of building the
feature it's for is a common, reasonable choice — but it does mean the
payment flow, email/SMS notifications, and Google auth all work
differently than the dependency list alone would suggest. See
[08-core-features.md](./08-core-features.md) for how payments actually
work, and [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md)
for the full list of this kind of gap.

## npm scripts

From `package.json`:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

- `npm start` — runs the server normally.
- `npm run dev` — runs it under `nodemon`, restarting automatically on
  file changes (requires the `nodemon` devDependency).

## Full project layout

```
CampusVibe/
├── server.js                       # Entire backend (~1,760 lines): schema, routes, auth, business logic
├── package.json / package-lock.json
├── .env.example                     # Documented list of every environment variable
├── data/
│   └── campusvibe.db                 # SQLite database file (created at first run)
├── public/
│   ├── index.html                    # Homepage — event catalog, search/filter
│   ├── login.html                    # Login (email/password + Google)
│   ├── register.html                 # Student registration + "Continue with Google"
│   ├── organizer-apply.html          # Organizer application form
│   ├── event.html                    # Single event details + registration
│   ├── payment.html                  # Payment instructions + proof submission
│   ├── my-tickets.html               # A student's list of tickets
│   ├── ticket.html                   # A single ticket's QR/e-ticket view
│   ├── profile.html                  # Edit name/mobile/roll number
│   ├── dashboard.html                # Organizer console (tabs: Create, My Events, Payment Setup, Payment Proofs, Analytics)
│   ├── attendance.html               # Organizer check-in tool (QR scan / manual)
│   ├── faq.html                       # Help/FAQ page
│   ├── manifest.json, robots.txt, sitemap.xml
│   ├── googlef0980b4c0a2016f1.html   # Google Search Console site-ownership verification file
│   ├── assets/                        # css/, js/, i18n/, img/, lottie/ — see above
│   └── uploads/                       # Organizer-uploaded UPI QR images (created at runtime by multer)
├── ACCESSIBILITY.md                   # Plain-language accessibility summary
├── ACCESSIBILITY_AUDIT.md             # Detailed accessibility audit log (19 issues, all fixed)
├── SECURITY_AUDIT.md                   # Full defensive security review and findings
├── LOADING_STATES.md                   # Loading, network resilience & performance system
└── docs/                               # This documentation set
```
