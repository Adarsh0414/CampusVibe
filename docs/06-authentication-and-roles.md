# 6. Authentication & Roles

## How a session works

CampusVibe uses **stateless JWT authentication stored in an `httpOnly`
cookie**, not a server-side session store and not `localStorage`.

1. On successful login/registration/Google sign-in, the server signs a
   JWT (`jsonwebtoken`, `HS256` by default) containing `{ id, role, name,
   email }`, expiring in **7 days**.
2. That JWT is set as a cookie named `token`:
   ```js
   res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: false });
   ```
   - `httpOnly: true` — JavaScript on the page cannot read this cookie
     (`document.cookie` won't show it), which limits the damage an XSS
     vulnerability could do (an attacker's injected script can't steal
     the token directly).
   - `sameSite: 'lax'` — the cookie is sent on normal top-level
     navigation and same-site requests, but not on most cross-site
     requests, which gives some baseline CSRF protection.
   - `secure: false` — **the cookie is not marked HTTPS-only.** This is
     fine for local development over plain HTTP, but if this app is
     deployed publicly, this should be `true` (and conditioned on
     `NODE_ENV === 'production'` or similar) so the cookie is never sent
     over an unencrypted connection. See
     [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md).
3. On every subsequent request, `cookie-parser` reads the cookie, and any
   route protected by the `authRequired` middleware verifies the JWT's
   signature and expiry.

## The `authRequired` middleware

```js
function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  // ... verify JWT, then:
  db.get('SELECT id, uuid, name, email, role, organizer_status FROM users WHERE id = ?', [decoded.id], (err, row) => {
    req.user = row;
    next();
  });
}
```

Two details worth calling out:

- It accepts the token from **either** the `token` cookie **or** an
  `Authorization: Bearer <token>` header. The frontend only ever uses the
  cookie, but the header path means the API could be called from a
  non-browser client (a script, Postman, a future mobile app) by sending
  the JWT explicitly.
- **It re-queries the database for the user's current role on every
  single request**, rather than trusting the role embedded in the JWT
  payload. This is a deliberate correctness choice: if an admin approves
  someone's organizer application while that person is already logged
  in, their *existing* session immediately gains dashboard access on
  their very next request — they don't need to log out and back in for
  a new JWT to be issued. The tradeoff is one extra database read per
  authenticated request, which is negligible at SQLite/single-server
  scale.

## Roles

There are exactly three values for `users.role` (enforced by a `CHECK`
constraint in the schema):

| `role` value | What the UI calls it | Granted by |
|---|---|---|
| `student` | Student | Default for every new account |
| `committee` | Organizer / Committee | An admin approving an organizer application |
| `admin` | Administrator | Only via the seeded admin account (see [09-setup-and-deployment.md](./09-setup-and-deployment.md)) — there is no API endpoint that promotes anyone to `admin` |

Two authorization middlewares build on top of `authRequired`:

```js
function requireOrganizer(req, res, next) {
  if (!(req.user.role === 'committee' || req.user.role === 'admin')) {
    return res.status(403).json({ error: 'Organizer access required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

`requireOrganizer` treats `admin` as a superset of `committee` — an admin
can do everything an organizer can, for every event, not just their own
(most organizer-scoped routes explicitly check `req.user.role !==
'admin' && event.created_by !== req.user.id`, granting admins a bypass on
the ownership check).

## The organizer-application workflow

Becoming an organizer is **not self-service**. This is a deliberate
anti-abuse design: without it, anyone could register as `committee` and
start creating fake events or collecting payments through the platform.

```
 student fills out         account created with          admin reviews in
 organizer-apply.html  ──▶ role='student',           ──▶  the Applications
                            organizer_status='pending'      list
                                                                │
                                        ┌───────────────────────┴──────────────────┐
                                        ▼                                          ▼
                          organizer_status='approved'                 organizer_status='rejected'
                          role → 'committee'                          role stays 'student'
                          (dashboard access on next request)          (can't re-apply via the API
                                                                        without changing email —
                                                                        no re-apply endpoint exists)
```

Key implementation details:

- `POST /api/auth/register-organizer` creates the account but **does
  not log the user in as an organizer** — it returns `{ ok: true,
  pending: true, message: "..." }` and the frontend shows a "wait for
  approval" message rather than redirecting anywhere authenticated.
- The pending application is queried by `GET
  /api/admin/organizer-applications`, which only an admin can call.
- Approval (`POST /api/admin/organizer-applications/:id/approve`) is a
  single `UPDATE` that flips both `role` and `organizer_status` at once,
  and only matches rows still in `'pending'` status (so double-approving
  or approving-then-rejecting the same application is a no-op that
  returns `404`, not a silent overwrite).
- There's no notification sent to the applicant when their status
  changes (see [11-known-limitations-and-tech-debt.md](./11-known-limitations-and-tech-debt.md)
  regarding the unused `nodemailer` dependency) — they find out by
  logging in and noticing the Dashboard link now works, or by an admin
  telling them directly.

## Google Sign-In

Implemented as a **hand-rolled OAuth 2.0 Authorization Code flow**, using
the platform's built-in `fetch()` — not the `passport`/
`passport-google-oauth20` packages that are listed in `package.json`
(see [02-tech-stack.md](./02-tech-stack.md)).

1. `GET /api/auth/google` (or `/start`) generates a random CSRF `state`
   value, stores it in a short-lived (`10 min`) cookie, and redirects the
   browser to Google's consent screen with that `state` attached.
2. After the user consents, Google redirects to `GET
   /api/auth/google/callback?code=...&state=...`.
3. The callback checks the returned `state` against the cookie (rejecting
   if they don't match — this is what prevents a CSRF attack from
   completing a login on the victim's behalf), exchanges the
   authorization `code` for an access token, then fetches the user's
   Google profile (`email`, `sub`, `name`).
4. It looks for an existing user by **either** email or Google `sub`. If
   found, it links the Google ID if not already linked, and logs them in.
   If not found, it creates a brand-new `role: 'student'` account with
   `password_hash: null` (there's no password — see below) and the
   Google `sub` stored as `google_id`.
5. Either way, it sets the same `token` cookie a normal login would, and
   redirects to `/dashboard.html` (organizers/admins) or `/` (students).

**Accounts created via Google have `password_hash = NULL`.** If such a
user later tries to log in with the email/password form instead, `POST
/api/auth/login` explicitly detects this and returns a clear error:
*"This account uses Google Sign-In. Please use 'Login with Google'
instead."* rather than a generic "invalid credentials" — there's no
"set a password" flow to add one after the fact.

If `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_CALLBACK_URL`
aren't set in the environment, every Google-related route redirects to
`/login.html?error=google_not_configured` instead of erroring — the
"Continue with Google" button degrades gracefully rather than crashing
the app.

## Password handling

Passwords are hashed with `bcryptjs` at a cost factor of `10`
(`bcrypt.hashSync(password, 10)`) before ever touching the database — a
plaintext password is never stored. There is no password-reset flow
("forgot password") anywhere in this codebase.
