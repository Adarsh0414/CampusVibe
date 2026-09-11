# 9. Setup & Deployment

## Prerequisites

- Node.js **18 or later** (declared in `package.json`'s `engines` field).
- No external database server needed — SQLite is file-based and the
  database file is created automatically on first run.

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the example environment file and fill in what you need
cp .env.example .env

# 3. Run it
npm start          # plain node
# or
npm run dev         # nodemon, restarts on file changes (requires the nodemon devDependency)
```

On first run, the server will:
- Create `data/` and `public/uploads/` if they don't exist.
- Create `data/campusvibe.db` and run the full schema.
- Seed a single admin account (see "Admin account" below).

Then visit `http://localhost:3000` (or whatever `PORT` you set).

## Every environment variable, explained

All of these live in `.env.example`, which is safe to copy as a starting
point — every value in the shipped example is blank or a placeholder,
not a real secret.

| Variable | Required? | Purpose |
|---|---|---|
| `PORT` | No (default `3000`) | Which port the server listens on |
| `JWT_SECRET` | **Yes, in any real deployment** | Signs and verifies login session tokens. If left unset, the code falls back to a hardcoded literal string (`'CHANGE_ME_DEV_SECRET'`) — fine for a quick local test, **a serious security problem in production**, since anyone who knows this repo's source could forge valid login tokens for any account. Set this to a long, random value before deploying anywhere real. |
| `QR_SIGNING_SECRET` | No (falls back to `JWT_SECRET`) | Signs the HMAC embedded in every ticket's QR code, so a scanned code's authenticity can be checked without a database round-trip. Can be set independently of `JWT_SECRET` if you want ticket-QR forgery and login-token forgery to require compromising two different secrets rather than one. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Strongly recommended | The single admin account is seeded from these on first run **only if no account with that email already exists**. If left unset, defaults to `admin@campusvibe.local` / `admin123` — a publicly-known default that must be changed (or overridden via these variables) before any real deployment, since it's the only account that can approve organizer applications. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | No — feature degrades gracefully if unset | Enables "Continue with Google." Get these from the [Google Cloud Console](https://console.cloud.google.com/) (OAuth 2.0 credentials, "Web application" type). `GOOGLE_CALLBACK_URL` must exactly match a redirect URI registered in that Google Cloud project, and must point at `/api/auth/google/callback` on wherever this app is actually reachable (e.g. `https://your-domain.com/api/auth/google/callback` in production, not `localhost`). If any of the three is missing, Google sign-in buttons redirect to a friendly "not configured" message instead of erroring. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | No | **Declared but currently unused** — `nodemailer` is installed and imported in `server.js` but never actually called anywhere. Setting these variables today has no effect. See [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md) if you're picking this up to actually wire up email notifications. |
| `SMS_API_URL` / `SMS_API_KEY` | No | Also **declared but currently unused** — no SMS-sending code exists anywhere in this codebase. |
| `OPENAI_API_KEY` | No — feature degrades gracefully if unset | Enables the chatbot's LLM fallback for questions its local knowledge base can't answer. Without it, the chatbot still works, just limited to its built-in FAQ answers (see [08-core-features.md](./08-core-features.md)). |
| `OPENAI_CHAT_MODEL` | No (default `gpt-4o-mini`) | Which OpenAI model the chatbot fallback uses, if `OPENAI_API_KEY` is set. |

## Admin account

The very first time the server starts against an empty database, it
seeds one admin account using `ADMIN_EMAIL`/`ADMIN_PASSWORD` (or the
hardcoded defaults if those are unset). This is the **only** account
with `role: 'admin'` — there's no API endpoint to promote another user to
admin, so if you need a second admin, either set the seed variables
before the very first startup, or manually run an `UPDATE users SET role
= 'admin' WHERE email = '...'` against `data/campusvibe.db` (e.g. via the
`sqlite3` CLI) after the fact.

**Security note:** if you ever start this app against a fresh database
without setting `ADMIN_EMAIL`/`ADMIN_PASSWORD`, it will create
`admin@campusvibe.local` / `admin123` — a credential pair visible in this
very documentation and in the source code. Change it immediately (or,
better, always set both variables before the first run in any
environment other than a fully local, throwaway test).

## Running behind a reverse proxy / deploying

`server.js` includes `app.set('trust proxy', 1)`, specifically because
the project has been deployed on **Render** (there's a live URL baked
into `public/robots.txt`'s `Sitemap:` line —
`https://campusvibe-pu3g.onrender.com/sitemap.xml` — suggesting Render is
where this has actually run). This setting is also correct for Railway,
Fly.io, Heroku, and most similar platforms that put a single reverse
proxy in front of your app. If you deploy behind a *chain* of more than
one proxy, you may need to adjust the `1` to the correct hop count — see
[Express's `trust proxy` documentation](https://expressjs.com/en/guide/behind-proxies.html).

Things to double-check before a production deployment:

1. **Set `JWT_SECRET` and `QR_SIGNING_SECRET`** to strong random values
   — see above.
2. **Set `ADMIN_EMAIL`/`ADMIN_PASSWORD`** to something real before first
   startup.
3. **The login cookie is currently set with `secure: false`** (in
   `server.js`, both in the login route and the Google OAuth callback) —
   meaning it will be sent over plain HTTP as well as HTTPS. If deploying
   behind HTTPS (which you should), change this to `secure: true` (ideally
   conditioned on an environment check, since `secure: true` cookies
   won't be sent during local HTTP development). See
   [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md).
4. **Persist the `data/` directory.** SQLite is a single file — if your
   hosting platform's filesystem is ephemeral (many container platforms
   wipe local disk on every redeploy), your database will be reset every
   time you deploy unless you mount a persistent volume at `data/`.
5. **Uploads live under `public/uploads/`** (organizer-uploaded UPI QR
   images) — this also needs to be on persistent storage for the same
   reason, or QR images will disappear on redeploy.
6. Update `public/robots.txt`'s `Sitemap:` line and `public/sitemap.xml`
   if deploying to a different domain than the one currently baked in.

## Database backups

Since everything lives in one SQLite file (`data/campusvibe.db`, plus
its `-wal`/`-shm` companion files while the server is running), a backup
is as simple as copying that file while the server is stopped (or using
SQLite's `.backup` command / the `sqlite3` CLI's online backup API if you
need to back up while it's live, to avoid copying a file mid-write).
There is no separate backup tooling built into this project.
