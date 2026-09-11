# 3. Architecture

CampusVibe is a **monolithic Express application**: one process serves
both the JSON API and the static frontend files, from a single
`server.js` file. There is no separate frontend server, no build
pipeline, and no microservices — deliberately simple, matching the
project's scale.

## Request routing order — why it matters

`server.js` registers routes in a specific, important order, called out
explicitly in a comment at the top of the file:

```
✅ API routes FIRST → Static files LAST → PERFECT LOGIN
```

Concretely, the file:

1. Configures middleware (`helmet`, `cors`, JSON body parsing, cookie
   parsing, rate limiting) — see below.
2. Registers **every** `/api/...` route.
3. *Then* registers `express.static(...)` to serve everything under
   `public/`.
4. *Then* registers a catch-all `app.get('*', ...)` that serves
   `public/index.html` for any request that didn't match anything above.

This ordering matters because Express matches routes in registration
order. If the static file server were registered *before* the API
routes, a request to (say) `/api/events` could theoretically be
intercepted by an identically-named static file, or the catch-all could
swallow API requests. Registering all API routes first, and the
"serve whatever file matches, or fall back to `index.html`" logic last,
guarantees API calls are always handled as API calls.

The final catch-all also functions as a **client-side-routing fallback**:
even though this isn't a single-page app with client-side routing in the
traditional sense, this pattern ensures that if someone requests a path
that isn't a real file and isn't an API route, they land on the homepage
instead of a bare Express 404.

## Middleware stack (in order)

1. **`helmet`** — sets a Content Security Policy and other security
   headers. The CSP is deliberately permissive on a few fronts (allows
   `'unsafe-inline'` and `'unsafe-eval'` for scripts, since every page
   uses inline `<script>` blocks rather than external bundles) — see the
   comment in `server.js` above the `helmet()` call for the specific
   reasoning per directive.
2. **`cors`** — configured with `origin: true, credentials: true`,
   meaning it reflects whatever origin made the request and allows
   cookies to be sent cross-origin. Appropriate for a same-origin app;
   worth tightening if this were ever split across multiple domains.
3. **`express.json({ limit: '10mb' })`** — parses JSON request bodies.
4. **`cookie-parser`** — parses the `token` (JWT) and `google_oauth_state`
   cookies.
5. **Rate limiting, in two tiers** (see `server.js` for the full
   reasoning comment):
   - A **general limiter**: 3,000 requests per 15 minutes per IP, skipped
     entirely for `/assets/` and `/uploads/` paths (so loading a page's
     CSS/JS/images never counts against it).
   - A **strict auth limiter**: 30 requests per 15 minutes per IP,
     applied only to `/api/auth/login`, `/api/auth/register`, and
     `/api/auth/register-organizer` — this is what actually slows down
     credential-guessing attempts, without punishing normal browsing.
6. **`app.set('trust proxy', 1)`** (set once, near the top, before the
   rate limiters are defined) — tells Express to trust the first hop of
   `X-Forwarded-For` headers, which is required for the rate limiters
   above to see each visitor's real IP address when the app runs behind
   a reverse proxy (Render, Railway, Fly.io, Heroku, etc.). Without this,
   every visitor behind the same proxy would be counted as a single
   "user" for rate-limiting purposes.

## Database access pattern

There is no ORM. Every database interaction in `server.js` uses the
`sqlite3` package's callback-based API directly (`db.get`, `db.all`,
`db.run`, `db.serialize`, `db.exec`), with parameterized queries
(`?` placeholders) throughout — this is what protects against SQL
injection; there's no separate sanitization layer, so it's important
that any new query added to this codebase continues using parameter
placeholders rather than string concatenation.

The database connection is a single, shared `sqlite3.Database` instance
created once at startup and reused by every request (SQLite in WAL mode
supports this safely for an app at this scale).

## Startup sequence

1. Load environment variables (`dotenv`).
2. Create the `data/` and `public/uploads/` directories if they don't
   exist yet (`fs.mkdirSync(..., { recursive: true })`).
3. Open (or create) the SQLite database file, enable WAL journal mode and
   foreign key enforcement.
4. After a short (`100ms`) delay — to let the database connection settle
   — run the full `CREATE TABLE IF NOT EXISTS` schema (see
   [04-database-schema.md](./04-database-schema.md)), then run a series
   of `ALTER TABLE ... ADD COLUMN` statements that silently ignore
   "duplicate column" errors. This is the project's migration strategy:
   **idempotent, additive `ALTER TABLE` statements run on every startup**,
   rather than a versioned migration system. Safe for this app's scale,
   but worth knowing if a future column needs to be *removed* or
   *renamed* — SQLite's `ALTER TABLE` support for those operations is
   limited, and this codebase has no tooling for it.
5. Seed a single admin account, if one doesn't already exist, using
   `ADMIN_EMAIL`/`ADMIN_PASSWORD` from the environment (falling back to
   `admin@campusvibe.local` / `admin123` if unset — see
   [09-setup-and-deployment.md](./09-setup-and-deployment.md) for why you
   should always set these in any real deployment).
6. Start a **background interval** (`setInterval`, every 30 seconds) that
   sweeps for and expires stale, unpaid ticket "holds" — see
   [08-core-features.md](./08-core-features.md) for what this means.
   This same expiry check is *also* run inline, synchronously, at the
   start of every route that reads event capacity or ticket lists (event
   listing, single-event lookup, registration, "My Tickets"), so a stale
   hold is never visible even in the up-to-30-second gap between
   background sweeps.
7. Start listening on `PORT` (default `3000`).

## Frontend architecture

Each of the 12 pages under `public/` is a self-contained HTML document
with its own `<style>` and `<script>` blocks (beyond the shared
`styles.css`/`chatbot.js`/`i18n.js`). There's no shared frontend state
management, no virtual DOM, and no client-side router — each page:

1. Renders its static structure (header, nav, page-specific markup).
2. On load, calls `fetch()` against one or more `/api/...` endpoints.
3. Builds and injects HTML for dynamic content (event lists, ticket
   cards, dashboard tables) directly via template literals and
   `innerHTML`.
4. Wires up event listeners for forms, buttons, and any custom widgets
   (tabs, dropdown menus, the ticket-type selector) — all implemented by
   hand, following WAI-ARIA Authoring Practices Guide patterns where
   applicable (see [10-accessibility.md](./10-accessibility.md)).

This is a deliberate "no framework" approach appropriate for a project of
this size — it keeps the deployment story trivial (no build step, no
bundler config) at the cost of some code duplication between pages (e.g.
the header/nav markup, and small utility functions like a toast-message
helper, are repeated per page rather than shared as components).

## Authentication flow (brief — see [06-authentication-and-roles.md](./06-authentication-and-roles.md) for full detail)

Authentication uses a **JWT stored in an `httpOnly` cookie** named
`token`, not `localStorage`/`sessionStorage` — this means the token isn't
accessible to JavaScript (mitigating XSS token theft) but is
automatically sent by the browser on every request to the same origin.
An `authRequired` Express middleware function verifies this JWT on every
protected route and **re-fetches the user's current role from the
database** on every request (rather than trusting the role embedded in
the token), so a role change (like an organizer application being
approved) takes effect immediately without requiring the user to log out
and back in.
