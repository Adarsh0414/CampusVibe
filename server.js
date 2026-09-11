/*
  CampusVibe Server - FIXED ROUTING + CSP FONTS
  Tagline: "Ideal Management, Ideal Moments"

  ✅ API routes FIRST → Static files LAST → PERFECT LOGIN
  ✅ FIXED CSP fonts (moz-extension + chrome-extension allowed)
*/

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');

// ✅ SEC-016 fix: several routes previously did `res.status(500).json({ error:
// err.message })`, sending the SQLite driver's raw error text straight to the
// client — which can include table/column names, constraint names, or
// fragments of the query (e.g. "SQLITE_CONSTRAINT: UNIQUE constraint failed:
// users.email"). This helper logs the full error server-side (where it's
// actually useful for debugging) and always returns a generic, safe message
// to the client instead.
function sendDbError(res, err, context) {
  console.error(`[DB error]${context ? ' ' + context : ''}:`, err && err.message);
  return res.status(500).json({ error: 'Internal server error' });
}

const app = express();

// ✅ Required when running behind a reverse proxy (Render, Railway, Fly.io,
// Heroku, etc.). Without this, Express sees every request as coming from
// the proxy's own IP address instead of the real visitor's IP — which
// means express-rate-limit ends up counting ALL visitors combined as a
// single "user", so the whole site can hit the rate limit and start
// rejecting everyone after only moderate traffic. `1` means "trust the
// first proxy hop," which matches how Render's routing works.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
// ✅ SEC-009 fix: previously fell back to a hardcoded 'CHANGE_ME_DEV_SECRET'
// string if JWT_SECRET was unset, which would let anyone who has read the
// source code forge valid JWTs (including admin ones) against any
// deployment that forgot to set the env var. Fail fast instead.
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Refusing to start with an insecure default — set JWT_SECRET in your .env.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
// ✅ SEC-004 fix: cookies are only marked Secure (HTTPS-only) in production,
// so local HTTP development still works, but any production deployment
// (Render sets NODE_ENV=production) gets the Secure flag automatically
// instead of a hardcoded `false`.
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

// Shared, reasonably strict email check used by both login and registration.
// Client-side validation is easy to bypass (dev tools, direct API calls), so
// this is the check that actually matters for keeping obviously-fake input
// ("asdf", "a@b") out of the database.
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || JWT_SECRET;

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

// ✅ SEC-021 fix (Part 6): previously no `fileFilter` at all — multer accepted
// any file type/extension for the UPI QR upload, and the result is written to
// `public/uploads/` and served by `express.static` using the *original*
// filename's extension (see the `filename` callback below). That let an
// organizer (the only role that can reach this endpoint) upload a `.html` or
// `.svg` file that would be served same-origin with its native content-type
// — a stored-XSS vector against anyone who opens that URL, since our own CSP
// still allows inline scripts (see SECURITY_AUDIT.md SEC-023). Restrict to
// actual image types the UPI QR flow needs, and re-derive the stored
// extension from the verified mimetype rather than trusting the client-
// supplied filename's extension.
const ALLOWED_UPLOAD_MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = ALLOWED_UPLOAD_MIME_TO_EXT[file.mimetype] || '.bin';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIME_TO_EXT[file.mimetype]) return cb(null, true);
    cb(new Error('Only PNG, JPEG, or WebP images are allowed for the UPI QR code.'));
  }
});

function generateQrCode(ticketUuid, eventUuid, userId) {
  const payload = {
    ticket_uuid: ticketUuid,
    event_uuid: eventUuid,
    user_id: userId
  };
  payload.sig = crypto.createHmac('sha256', QR_SIGNING_SECRET)
    .update(`${ticketUuid}:${eventUuid}:${userId}`)
    .digest('hex');
  return JSON.stringify(payload);
}

const db = new sqlite3.Database(path.join(__dirname, 'data', 'campusvibe.db'), 
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
    } else {
      console.log('✅ SQLite database connected');
      db.run("PRAGMA journal_mode = WAL");
      db.run("PRAGMA foreign_keys = ON");
    }
  }
);

// Schema (compact - all columns included)
const schema = `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT,
  email TEXT NOT NULL UNIQUE, password_hash TEXT, mobile TEXT, roll_number TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','committee','admin')),
  google_id TEXT, created_at TEXT NOT NULL
); CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  description TEXT, category TEXT, start_time TEXT NOT NULL, end_time TEXT,
  location TEXT, capacity INTEGER, price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR', created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL, bank_account_no TEXT, bank_ifsc TEXT, bank_account_name TEXT,
  upi_id TEXT, upi_qr_url TEXT, payment_notes TEXT, price_single_cents INTEGER,
  price_duo_cents INTEGER, price_trio_cents INTEGER, allowed_tiers TEXT,
  FOREIGN KEY(created_by) REFERENCES users(id)
); CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, event_id INTEGER NOT NULL,
  percentage INTEGER, amount_cents INTEGER, max_uses INTEGER, used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, FOREIGN KEY(event_id) REFERENCES events(id)
); CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL, FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(user_id) REFERENCES users(id)
); CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL, qr_code TEXT, checked_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, discount_code TEXT, price_paid_cents INTEGER NOT NULL DEFAULT 0,
  payment_provider TEXT, payment_status TEXT NOT NULL DEFAULT 'unpaid', proof_txn_id TEXT,
  proof_image_url TEXT, proof_submitted_at TEXT, reviewed_by INTEGER, reviewed_at TEXT,
  rejection_reason TEXT, group_type TEXT, participants_json TEXT, amount_due_cents INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(event_id) REFERENCES events(id)
); CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  ticket_id INTEGER, present INTEGER NOT NULL DEFAULT 0, timestamp TEXT NOT NULL,
  source TEXT NOT NULL, FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(ticket_id) REFERENCES tickets(id)
); CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, event_id INTEGER,
  type TEXT NOT NULL, status TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(event_id) REFERENCES events(id)
);`;

setTimeout(() => {
  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Schema failed:', err.message);
      return;
    }
    console.log('✅ Schema ready (FULL production schema)');

    // ✅ Safe migrations for organizer-approval workflow (ignore "duplicate column" errors)
    // These now run only after the schema callback confirms tables exist.
    db.run(`ALTER TABLE users ADD COLUMN organizer_status TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN organizer_reason TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN avatar_url TEXT`, () => {});
    // ✅ Safe migration for organizer-configurable discount codes
    db.run(`ALTER TABLE events ADD COLUMN discounts_enabled INTEGER NOT NULL DEFAULT 0`, () => {});
    // ✅ Safe migration for the registration seat-hold/timeout system
    db.run(`ALTER TABLE tickets ADD COLUMN hold_expires_at TEXT`, () => {});

    // Seed admin — reads from ADMIN_EMAIL/ADMIN_PASSWORD in .env, falling back
    // to a default only if they're not set (e.g. local first run).
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusvibe.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    db.get('SELECT id FROM users WHERE email = ?', [adminEmail], (err2, row) => {
      if (err2) { console.error('❌ Admin seed check failed:', err2.message); return; }
      if (!row) {
        const hash = bcrypt.hashSync(adminPassword, 10);
        db.run('INSERT INTO users (uuid, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)',
          [uuidv4(), 'Administrator', adminEmail, hash, 'admin', dayjs().toISOString()]);
        console.log('✅ Admin seeded:', adminEmail);
      }
    });
  });
}, 100);

// Event categories shown across the app (organizer create-form + homepage filters)
const EVENT_CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Workshops'];

// ✅ Generates a human-friendly, noticeable event ID: DDMMYYYY + 6 random digits
// e.g. today (8 Jul 2026) -> "08072026482913"
function generateEventUuid() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000); // 6 random digits
  return `${dd}${mm}${yyyy}${rand}`;
}

// ✅ Seat-hold / registration-timeout system: an "unpaid" ticket only holds
// its seat for HOLD_MINUTES. If the user never submits payment proof within
// that window, the hold is released (status flips to 'expired') so the seat
// becomes available to everyone else again. Tickets that already have proof
// submitted ('pending'), are confirmed ('paid'/'verified'), or are mid-retry
// ('rejected', which the user can resubmit) are never auto-expired — only a
// truly abandoned, never-attempted payment is.
const HOLD_MINUTES = 5;

function expireStaleHolds(cb) {
  db.run(
    `UPDATE tickets SET payment_status = 'expired'
     WHERE payment_status = 'unpaid' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?`,
    [dayjs().toISOString()],
    (err) => { if (cb) cb(err); }
  );
}

// Opportunistic background sweep so seats free up even without matching
// requests hitting the lazy-expiry check paths (also called inline in the
// hot paths below, since a 60s interval alone could leave a stale window).
setInterval(() => expireStaleHolds(), 30 * 1000);

// Retries a few times on the (very unlikely) chance of a same-day collision
function createUniqueEventUuid(cb, attempt = 0) {
  const candidate = generateEventUuid();
  db.get('SELECT id FROM events WHERE uuid = ?', [candidate], (err, row) => {
    if (err) return cb(err);
    if (row && attempt < 5) return createUniqueEventUuid(cb, attempt + 1);
    cb(null, candidate);
  });
}

// ✅ Organizer discount-code management: replaces all discount codes for an
// event with the given list. Called from create + update event handlers.
// `codes` is expected to be an array of { code, percentage, amount_cents, max_uses }.
function saveDiscountCodes(eventId, discountsEnabled, codes, cb) {
  db.run('DELETE FROM discounts WHERE event_id = ?', [eventId], (delErr) => {
    if (delErr) return cb(delErr);
    if (!discountsEnabled || !Array.isArray(codes) || codes.length === 0) {
      return cb(null);
    }

    const cleaned = codes
      .map(c => ({
        code: String(c.code || '').trim().toUpperCase(),
        percentage: c.percentage != null && c.percentage !== '' ? Math.max(0, Math.min(100, Number(c.percentage))) : null,
        amount_cents: c.amount_cents != null && c.amount_cents !== '' ? Math.max(0, Number(c.amount_cents)) : null,
        max_uses: c.max_uses != null && c.max_uses !== '' ? Math.max(1, Number(c.max_uses)) : null
      }))
      .filter(c => c.code && (c.percentage != null || c.amount_cents != null));

    if (!cleaned.length) return cb(null);

    let remaining = cleaned.length;
    let firstErr = null;
    cleaned.forEach(c => {
      db.run(
        `INSERT OR IGNORE INTO discounts (code, event_id, percentage, amount_cents, max_uses, active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [c.code, eventId, c.percentage, c.amount_cents, c.max_uses, dayjs().toISOString()],
        (insErr) => {
          if (insErr) firstErr = firstErr || insErr;
          remaining -= 1;
          if (remaining === 0) cb(firstErr);
        }
      );
    });
  });
}

// ✅ FIXED CSP - Allows ALL fonts + extensions (NO MORE ERRORS)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      "style-src": ["'self'", "'unsafe-inline'", "https:"],
      "img-src": ["'self'", "data:", "https:", "http:"],
      "font-src": ["'self'", "data:", "https:", "http:", "moz-extension:", "chrome-extension:"],
      "connect-src": ["'self'", "ws:", "wss:", "http:", "https:"],
      "media-src": ["'self'", "https:", "http:"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'self'"]
    }
  }
}));

// ✅ SEC-022 fix (Part 6): `origin: true` reflects whatever Origin header the
// request sends and marks it trusted — combined with `credentials: true`,
// that tells browsers it's fine for *any* website to make credentialed
// requests to this API. In this deployment the frontend and API are served
// from the same Express app/origin, so cross-origin credentialed access is
// never actually needed; practical exploitation is further limited today by
// auth being cookie-only with `sameSite: 'lax'` (see COOKIE_SECURE above),
// which already blocks the cookie from riding along on cross-site
// fetch/XHR. But that's incidental, not load-bearing — CORS itself should
// still default to same-origin only, so this doesn't silently become
// exploitable if auth ever changes (e.g. a token read from JS). Requests
// with no Origin header (curl, server-to-server, same-origin fetches) are
// always allowed by the `cors` package regardless of this callback. Set
// ALLOWED_ORIGINS (comma-separated) in .env for any legitimate additional
// frontend origin.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ✅ Rate limiting, split into two tiers instead of one blanket limit:
//
// 1) A generous general limiter for normal browsing/API use. The previous
//    single limiter (500 requests / 15 min) applied to EVERY request,
//    including every CSS/JS/image file and every API call a single page
//    load makes — so just a few page loads or refreshes could exhaust it,
//    especially combined with `trust proxy` not being set (see above),
//    which made it worse by lumping all visitors together as one "user."
// 2) A strict limiter only on login/register endpoints, which is what
//    rate-limiting is actually *for* here — slowing down anyone trying to
//    guess passwords — without punishing normal site usage.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a few minutes.' },
  // Static files (css/js/images/fonts) don't need to count against the limit at all.
  skip: (req) => req.path.startsWith('/assets/') || req.path.startsWith('/uploads/')
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/register-organizer'], authLimiter);

// ✅ SEC-024 fix (Part 7): the chatbot endpoint is unauthenticated and, when
// OPENAI_API_KEY is set, each call forwards to a paid third-party LLM API.
// Previously it was covered only by the generalLimiter (3000 req/15min per
// IP, deliberately generous for normal page/API traffic) — meaning a single
// anonymous visitor could script thousands of OpenAI calls per window at the
// operator's expense (a cost-based DoS), with no dedicated ceiling for this
// specific expensive, unauthenticated action.
const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chatbot requests. Please wait a few minutes and try again.' }
});
app.use('/api/chatbot', chatbotLimiter);

// ✅ SEC-025 fix (Part 7): event registration places a seat hold immediately
// (payment is submitted afterward), and was previously covered only by the
// generalLimiter. A single authenticated account — or a small number of
// throwaway accounts, which registration does not otherwise limit — could
// script rapid repeated registrations against a popular event to hold/consume
// every remaining seat, denying real students a chance to register even
// though the attacker never intends to pay (the 5-minute hold-expiry logic
// mitigates this but doesn't prevent it: the attacker can simply re-run the
// script). A dedicated limiter slows this "seat-squatting" abuse pattern
// without affecting a normal student registering once or twice.
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please wait a few minutes and try again.' }
});
app.use('/api/events/:uuid/register', registrationLimiter);

// ✅ SEC-025 fix (Part 7): payment-proof submission is ownership-checked
// (SEC-014, Part 4) so it can't be used to attack another user's ticket, but
// was likewise only covered by the generalLimiter. Give it the same
// dedicated ceiling so a compromised/scripted account can't flood an
// organizer's payment-review queue with garbage transaction IDs by
// repeatedly resubmitting proof for a rejected ticket.
app.use('/api/payments/proof', registrationLimiter);

// ✅ ALL API ROUTES FIRST (before static)
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/meta/categories', (req, res) => res.json({ categories: EVENT_CATEGORIES }));

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err || !row) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!row.password_hash) {
      // This account was created via Google Sign-In and has no password set.
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please use "Login with Google" instead.' });
    }
    if (!bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = { id: row.id, role: row.role, name: row.name, email: row.email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE });
    res.json({ user, token: token.slice(0, 20) + '...' });
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, mobile, roll_number } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, existing) => {
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [uuidv4(), name || '', email, hash, mobile || '', roll_number || '', 'student', dayjs().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: 'Registration failed' });
        const user = { id: this.lastID, role: 'student', name: name || email.split('@')[0] };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE });
        res.json({ user, token: token.slice(0, 20) + '...' });
      });
  });
});

// ✅ Organizer registration is now an APPLICATION, not instant access.
// The account is created with role='student' + organizer_status='pending';
// an admin must approve it (see /api/admin/organizer-applications) before
// the account gains organizer/committee access.
app.post('/api/auth/register-organizer', (req, res) => {
  const { name, email, password, mobile, roll_number, reason } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile are required' });

  db.get('SELECT id FROM users WHERE email = ?', [email], (err, existing) => {
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    db.run(
      `INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, organizer_status, organizer_reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), name, email, hash, mobile, roll_number || '', 'student', 'pending', reason || '', dayjs().toISOString()],
      function (err) {
        if (err) return res.status(500).json({ error: 'Application failed' });
        // Not auto-logging in as an organizer — the account exists as a
        // regular student until an admin approves the application.
        res.json({
          ok: true,
          pending: true,
          message: 'Your organizer application has been submitted. You will get organizer access once an admin approves it.'
        });
      }
    );
  });
});

// ===============================
// ADMIN: Organizer application review
// ===============================
app.get('/api/admin/organizer-applications', authRequired, requireAdmin, (req, res) => {
  db.all(
    `SELECT id, uuid, name, email, mobile, roll_number, organizer_status, organizer_reason, created_at
     FROM users WHERE organizer_status = 'pending' ORDER BY created_at ASC`,
    (err, rows) => {
      if (err) return sendDbError(res, err);
      res.json({ applications: rows });
    }
  );
});

app.post('/api/admin/organizer-applications/:id/approve', authRequired, requireAdmin, (req, res) => {
  db.run(
    `UPDATE users SET role = 'committee', organizer_status = 'approved' WHERE id = ? AND organizer_status = 'pending'`,
    [req.params.id],
    function (err) {
      if (err) return sendDbError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'Application not found or already processed' });
      res.json({ ok: true });
    }
  );
});

app.post('/api/admin/organizer-applications/:id/reject', authRequired, requireAdmin, (req, res) => {
  db.run(
    `UPDATE users SET organizer_status = 'rejected' WHERE id = ? AND organizer_status = 'pending'`,
    [req.params.id],
    function (err) {
      if (err) return sendDbError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'Application not found or already processed' });
      res.json({ ok: true });
    }
  );
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ===============================
// GOOGLE OAUTH LOGIN
// ===============================
// A manual OAuth 2.0 "Authorization Code" flow — no extra npm packages
// needed, just Node's built-in fetch. Requires GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL to be set in .env (see
// .env.example for where to get these from Google Cloud Console). If they
// aren't set, the button fails gracefully with a clear message instead of
// crashing or 404ing.
function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);
}

function startGoogleOAuth(req, res) {
  if (!googleConfigured()) {
    return res.redirect('/login.html?error=google_not_configured');
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// register.html and login.html historically point at slightly different
// paths — both start the exact same flow.
app.get('/api/auth/google', startGoogleOAuth);
app.get('/api/auth/google/start', startGoogleOAuth);

app.get('/api/auth/google/callback', async (req, res) => {
  if (!googleConfigured()) {
    return res.redirect('/login.html?error=google_not_configured');
  }

  const { code, state, error } = req.query;
  const expectedState = req.cookies?.google_oauth_state;
  res.clearCookie('google_oauth_state');

  if (error) return res.redirect('/login.html?error=google_auth_failed');
  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect('/login.html?error=google_auth_failed');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text());
      return res.redirect('/login.html?error=google_auth_failed');
    }
    const tokenData = await tokenRes.json();

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!profileRes.ok) {
      console.error('Google userinfo fetch failed:', await profileRes.text());
      return res.redirect('/login.html?error=google_auth_failed');
    }
    const profile = await profileRes.json(); // { sub, email, email_verified, name, picture }

    if (!profile.email) {
      return res.redirect('/login.html?error=google_auth_failed');
    }
    // ✅ SEC-008 fix: Google's userinfo response includes email_verified —
    // previously unused. Without this check, an unverified email would be
    // trusted for account matching/linking/creation just like a verified
    // one, which is an account-linking best-practice gap (CWE-287-adjacent):
    // linking should only ever happen onto an email Google has actually
    // confirmed the person controls. Only an *explicit* `false` blocks the
    // flow (not merely a missing field), matching Google's real behavior of
    // always including this field for this scope.
    if (profile.email_verified === false) {
      return res.redirect('/login.html?error=google_email_unverified');
    }

    db.get('SELECT * FROM users WHERE email = ? OR google_id = ?', [profile.email, profile.sub], (err, existing) => {
      if (err) return res.redirect('/login.html?error=google_auth_failed');

      const signInAndRedirect = (row) => {
        const user = { id: row.id, role: row.role, name: row.name, email: row.email };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE });
        res.redirect((row.role === 'committee' || row.role === 'admin') ? '/dashboard.html' : '/');
      };

      if (existing) {
        // Link the Google account to this existing user if it wasn't already.
        if (!existing.google_id) {
          db.run('UPDATE users SET google_id = ? WHERE id = ?', [profile.sub, existing.id]);
        }
        return signInAndRedirect(existing);
      }

      // New account — Google has already verified this email address, so
      // there's no password to set and no verification step needed.
      db.run(
        'INSERT INTO users (uuid, name, email, password_hash, google_id, role, created_at) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), profile.name || profile.email.split('@')[0], profile.email, null, profile.sub, 'student', dayjs().toISOString()],
        function (insErr) {
          if (insErr) return res.redirect('/login.html?error=google_auth_failed');
          db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (getErr, newRow) => {
            if (getErr || !newRow) return res.redirect('/login.html?error=google_auth_failed');
            signInAndRedirect(newRow);
          });
        }
      );
    });
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect('/login.html?error=google_auth_failed');
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  // ✅ FIX: authRequired's base query only selects a lean set of columns
  // (used on every request for speed). The profile page needs more —
  // mobile, roll_number, and usage stats — so fetch those here instead.
  db.get(
    `SELECT id, uuid, name, email, role, organizer_status, mobile, roll_number, avatar_url,
            (SELECT COUNT(*) FROM tickets WHERE user_id = users.id) AS ticket_count,
            (SELECT COUNT(*) FROM events WHERE created_by = users.id) AS events_organized
     FROM users WHERE id = ?`,
    [req.user.id],
    (err, row) => {
      if (err || !row) return res.status(500).json({ error: 'Failed to load profile' });
      res.json({ user: row });
    }
  );
});

// ✅ FIX: this endpoint was missing entirely — profile.html called it but got
// a 404, which showed up to the user as "Failed to update profile" every time.
app.put('/api/users/me', authRequired, (req, res) => {
  const { name, mobile, roll_number } = req.body;
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }
  db.run(
    `UPDATE users SET name = ?, mobile = ?, roll_number = ? WHERE id = ?`,
    [
      name !== undefined ? name.trim() : req.user.name,
      mobile !== undefined ? mobile.trim() : req.user.mobile,
      roll_number !== undefined ? roll_number.trim() : req.user.roll_number,
      req.user.id
    ],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update profile' });
      res.json({ ok: true });
    }
  );
});

function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // ✅ Always re-check the LIVE role/status from the DB rather than trusting the
  // (possibly stale) JWT payload. This matters because an organizer application
  // can be approved by an admin after the token was issued — without this, the
  // user would need to log out/in again before dashboard access actually works.
  db.get('SELECT id, uuid, name, email, role, organizer_status FROM users WHERE id = ?', [decoded.id], (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Invalid session' });
    req.user = row;
    next();
  });
}

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

// 🔧 FIX: Get single public event by UUID (prevents HTML fallback)
// ✅ FIX: List public events (prevents /api/events 404)
app.get('/api/events', (req, res) => {
  const { search, category, sort, limit } = req.query;

  expireStaleHolds(() => {
  // ✅ FIX: hide events that have already ended (end_time, or start_time+24h if no end_time)
  // ✅ SEC-027 fix (Part 8): this list previously selected the internal
  // auto-increment `id` alongside the public `uuid`, exposing every visible
  // event's raw database row number to any unauthenticated visitor (and
  // trivially letting them infer event count/creation order by diffing
  // consecutive IDs). SEC-017 (Part 5) already fixed this same pattern on
  // the single-event detail endpoint but missed this list endpoint, which
  // shares the same root cause. The frontend never reads `event.id` from
  // this response (only `event.uuid`), so it's dropped entirely rather than
  // kept for a consumer that doesn't exist.
  let query = `
    SELECT 
      uuid, title, description, category, start_time, end_time,
      location, capacity, price_cents, price_single_cents, price_duo_cents,
      price_trio_cents, allowed_tiers, status,
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = events.id AND t.payment_status != 'expired') AS registrations
    FROM events
    WHERE visibility = 'public'
      AND status = 'published'
      AND datetime(COALESCE(end_time, datetime(start_time, '+1 day'))) >= datetime('now', '+330 minutes')
  `;
  const params = [];

  if (search) {
    query += ` AND (title LIKE ? OR description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  query += sort === 'newest' ? ` ORDER BY created_at DESC` : ` ORDER BY start_time ASC`;
  query += ` LIMIT ?`;
  params.push(Math.min(Number(limit) || 50, 100));

  db.all(query, params, (err, rows) => {
    if (err) return sendDbError(res, err);
    res.json({ events: rows });
  });
  });
});
app.get('/api/events/:uuid', (req, res) => {
  const { uuid } = req.params;

  expireStaleHolds(() => {
  db.get(
    `
    SELECT
      e.uuid, e.title, e.description, e.category, e.start_time, e.end_time,
      e.location, e.capacity, e.currency, e.price_cents, e.price_single_cents,
      e.price_duo_cents, e.price_trio_cents, e.allowed_tiers, e.status,
      e.discounts_enabled,
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.payment_status != 'expired') AS sold
    FROM events e
    WHERE e.uuid = ? AND e.visibility = 'public'
    `,
    [uuid],
    (err, event) => {
      if (err) return sendDbError(res, err);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      event.remaining = event.capacity
        ? Math.max(0, event.capacity - (event.sold || 0))
        : null;

      res.json({ event });
    }
  );
  });
});

// ===============================
// ADD TO CALENDAR (.ics download)
// ===============================
function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toICSDateUTC(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

app.get('/api/events/:uuid/calendar.ics', (req, res) => {
  const { uuid } = req.params;

  db.get('SELECT * FROM events WHERE uuid = ? AND visibility = ?', [uuid, 'public'], (err, event) => {
    if (err) return res.status(500).send('Server error generating calendar file');
    if (!event) return res.status(404).send('Event not found');

    const dtStart = toICSDateUTC(event.start_time);
    // Some calendar apps need an explicit end — default to +2 hours if the
    // organizer didn't set one, rather than omitting DTEND entirely.
    const endSource = event.end_time || dayjs(event.start_time).add(2, 'hour').toISOString();
    const dtEnd = toICSDateUTC(endSource);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CampusVibe//Event//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event.uuid}@campusvibe.local`,
      `DTSTAMP:${toICSDateUTC(new Date().toISOString())}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(event.description || '')}`,
      `LOCATION:${icsEscape(event.location || '')}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const safeName = (event.title || 'event').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
    res.send(ics);
  });
});


app.post('/api/events', authRequired, requireOrganizer, (req, res) => {
  const {
    title,
    description,
    category,
    start_time,
    end_time,
    location,
    capacity,
    price_cents,
    price_single_cents,
    price_duo_cents,
    price_trio_cents,
    allowed_tiers,
    status,
    visibility,
    discounts_enabled,
    discount_codes
  } = req.body;

  if (!title || !start_time) {
    return res.status(400).json({ error: 'Title and start time required' });
  }
  if (!location) {
    return res.status(400).json({ error: 'Location is required' });
  }
  if (!category || !EVENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category is required and must be one of: ${EVENT_CATEGORIES.join(', ')}` });
  }
  // ✅ SEC-002 fix: reject negative capacity/price values instead of silently
  // storing them (a negative capacity previously made every registration
  // request see "held >= capacity" as permanently true, locking the
  // organizer out of their own event).
  for (const [field, val] of Object.entries({ capacity, price_cents, price_single_cents, price_duo_cents, price_trio_cents })) {
    if (val !== undefined && val !== null && val !== '' && Number(val) < 0) {
      return res.status(400).json({ error: `${field} cannot be negative` });
    }
  }

  createUniqueEventUuid((err, eventUuid) => {
    if (err) return res.status(500).json({ error: 'Failed to generate event ID' });

    db.run(
      `
      INSERT INTO events (
        uuid,
        title,
        description,
        category,
        start_time,
        end_time,
        location,
        capacity,
        created_by,
        status,
        visibility,
        created_at,
        price_cents,
        price_single_cents,
        price_duo_cents,
        price_trio_cents,
        allowed_tiers,
        discounts_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        eventUuid,
        title,
        description || '',
        category,
        start_time,
        end_time || null,
        location,
        capacity || null,
        req.user.id,
        status === 'draft' ? 'draft' : 'published',
        visibility === 'private' ? 'private' : 'public',
        dayjs().toISOString(),
        Number(price_cents) || 0,
        price_single_cents != null ? Number(price_single_cents) : null,
        price_duo_cents != null ? Number(price_duo_cents) : null,
        price_trio_cents != null ? Number(price_trio_cents) : null,
        allowed_tiers || 'single',
        discounts_enabled ? 1 : 0
      ],
      function (err) {
        if (err) {
          console.error('Event creation failed:', err);
          return res.status(500).json({ error: 'Failed to create event' });
        }

        const eventId = this.lastID;
        saveDiscountCodes(eventId, discounts_enabled, discount_codes, (discErr) => {
          if (discErr) console.error('Discount code save failed:', discErr.message);
          res.json({
            ok: true,
            event: {
              uuid: eventUuid
            }
          });
        });
      }
    );
  });
});

// 🔒 EVENT REGISTRATION (FINAL GUARANTEED ROUTE)
app.post('/api/events/:uuid/register', authRequired, (req, res) => {
  const { uuid } = req.params;
  const { participants, ticket_type, discount_code } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'Participants required' });
  }
  // ✅ SEC-003 fix: cap participant count (tier max is 3, for "trio") and
  // require each entry to carry a real name, instead of accepting an
  // unbounded array of arbitrary-shaped objects into participants_json.
  const MAX_PARTICIPANTS = 3;
  if (participants.length > MAX_PARTICIPANTS) {
    return res.status(400).json({ error: `A maximum of ${MAX_PARTICIPANTS} participants is allowed` });
  }
  if (!participants.every(p => p && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 200)) {
    return res.status(400).json({ error: 'Each participant needs a valid name' });
  }

  // Release any seats whose 5-minute payment window has lapsed before we
  // even look at capacity, so an abandoned registration never blocks a new one.
  expireStaleHolds(() => {
  db.get('SELECT * FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err) return sendDbError(res, err);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const proceedWithCapacityCheck = (cb) => {
      if (!event.capacity) return cb();
      db.get(
        `SELECT COUNT(*) AS held FROM tickets
         WHERE event_id = ?
           AND (
             payment_status IN ('paid', 'verified', 'pending', 'rejected')
             OR (payment_status = 'unpaid' AND (hold_expires_at IS NULL OR hold_expires_at > ?))
           )`,
        [event.id, dayjs().toISOString()],
        (capErr, row) => {
          if (capErr) return sendDbError(res, capErr);
          if ((row?.held || 0) >= event.capacity) {
            return res.status(409).json({ error: 'Sorry, this event is fully booked. No seats remaining.' });
          }
          cb();
        }
      );
    };

    // ✅ SEC-001 fix: `type` MUST be one of the three known tiers, and MUST be
    // a tier the organizer actually enabled for this event (event.allowed_tiers).
    // Previously an unrecognized ticket_type silently fell through to a base
    // price of 0, which meant needsPayment became false and the caller got a
    // fully paid, scannable ticket for free by sending any unexpected string.
    // Both checks below now reject the request instead of defaulting to free.
    const VALID_TIERS = ['single', 'duo', 'trio'];
    const type = (ticket_type || 'single').toLowerCase();
    if (!VALID_TIERS.includes(type)) {
      return res.status(400).json({ error: `Invalid ticket_type. Must be one of: ${VALID_TIERS.join(', ')}` });
    }
    const allowedTiers = (event.allowed_tiers || 'single').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!allowedTiers.includes(type)) {
      return res.status(400).json({ error: `This event does not offer the "${type}" ticket tier.` });
    }

    let basePriceCents = 0;
    if (type === 'single') {
      basePriceCents = event.price_single_cents ?? event.price_cents ?? 0;
    } else if (type === 'duo') {
      basePriceCents = event.price_duo_cents ?? 0;
    } else if (type === 'trio') {
      basePriceCents = event.price_trio_cents ?? 0;
    }

    const checkDiscountAndRegister = (finalPriceCents) => {
      const ticketUuid = crypto.randomUUID();
      const needsPayment = finalPriceCents > 0;
      const paymentStatus = needsPayment ? 'unpaid' : 'paid';
      // Only unpaid registrations get a countdown — once proof is submitted
      // (or nothing was ever owed) the seat isn't on a timer anymore.
      const holdExpiresAt = needsPayment ? dayjs().add(HOLD_MINUTES, 'minute').toISOString() : null;

      const registerTicket = (qrCodeUrl) => {
        const insertParams = [
          ticketUuid,
          req.user.id,
          event.id,
          JSON.stringify(participants),
          dayjs().toISOString(),
          paymentStatus,
          discount_code || null,
          finalPriceCents,
          needsPayment ? 0 : finalPriceCents,
          type,
          qrCodeUrl || null,
          holdExpiresAt
        ];

        const onInserted = function (err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Registration failed' });
          }
          // ✅ SEC-013 fix: when the event has a capacity, the insert below is
          // conditional (see the WHERE-guarded SQL) and writes 0 rows if the
          // seat is no longer available. `proceedWithCapacityCheck` above is
          // only a fast-path pre-check for a nice error message early — it is
          // NOT what prevents overbooking, because a second concurrent
          // request's SELECT can run before the first request's INSERT lands
          // (a classic check-then-act race). The real guarantee comes from
          // re-checking capacity inside the same atomic INSERT statement that
          // writes the row, so two simultaneous "last seat" registrations
          // can't both succeed.
          if (event.capacity && this.changes === 0) {
            return res.status(409).json({ error: 'Sorry, this event is fully booked. No seats remaining.' });
          }

          if (needsPayment) {
            res.json({
              requires_payment: true,
              ticket_uuid: ticketUuid,
              hold_expires_at: holdExpiresAt
            });
          } else {
            res.json({
              ok: true,
              ticket: { uuid: ticketUuid }
            });
          }
        };

        if (event.capacity) {
          // Atomic capacity-safe insert: the seat count is re-checked inside
          // the same statement that performs the write, closing the race
          // window between `proceedWithCapacityCheck`'s earlier SELECT and
          // this INSERT (SEC-013).
          db.run(
            `INSERT INTO tickets (
              uuid, user_id, event_id, participants_json, created_at,
              payment_status, discount_code, amount_due_cents, price_paid_cents, group_type, qr_code, hold_expires_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE (
              SELECT COUNT(*) FROM tickets
              WHERE event_id = ?
                AND (
                  payment_status IN ('paid', 'verified', 'pending', 'rejected')
                  OR (payment_status = 'unpaid' AND (hold_expires_at IS NULL OR hold_expires_at > ?))
                )
            ) < ?`,
            [...insertParams, event.id, dayjs().toISOString(), event.capacity],
            onInserted
          );
        } else {
          db.run(
            `INSERT INTO tickets (
              uuid, user_id, event_id, participants_json, created_at, 
              payment_status, discount_code, amount_due_cents, price_paid_cents, group_type, qr_code, hold_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            insertParams,
            onInserted
          );
        }
      };

      if (!needsPayment) {
        // Generate QR code right away
        const qrPayload = generateQrCode(ticketUuid, event.uuid, req.user.id);
        QRCode.toDataURL(qrPayload, (err, url) => {
          if (err) {
            console.error('QR code generation failed:', err);
            registerTicket(null);
          } else {
            registerTicket(url);
          }
        });
      } else {
        registerTicket(null);
      }
    };

    proceedWithCapacityCheck(() => {
      if (discount_code) {
        db.get(
          'SELECT * FROM discounts WHERE code = ? AND event_id = ? AND active = 1',
          [String(discount_code).trim().toUpperCase(), event.id],
          (err, discount) => {
            if (!discount) return checkDiscountAndRegister(basePriceCents);

            // ✅ SEC-015 fix: previously this read `used_count`, decided in JS
            // whether the discount still had uses left, and only THEN issued a
            // separate increment — a check-then-act race where two concurrent
            // registrations using the last remaining use could both read
            // "uses left" as true and both succeed, overrunning `max_uses`.
            // The increment is now the same statement as the limit check:
            // the WHERE clause re-verifies `used_count < max_uses` atomically
            // as part of the UPDATE itself, so at most one of two simultaneous
            // requests can consume the final use.
            db.run(
              `UPDATE discounts SET used_count = used_count + 1
               WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)`,
              [discount.id],
              function (updErr) {
                if (updErr) {
                  console.error(updErr);
                  // Fail closed on the discount (not on the registration) —
                  // proceed at full price rather than blocking the request.
                  return checkDiscountAndRegister(basePriceCents);
                }
                if (this.changes === 0) {
                  // Exhausted (possibly by a concurrent request that won the
                  // race) — proceed at full price instead of honoring it.
                  return checkDiscountAndRegister(basePriceCents);
                }
                let finalPrice = basePriceCents;
                if (discount.percentage) {
                  finalPrice = Math.round(basePriceCents * (1 - discount.percentage / 100));
                } else if (discount.amount_cents) {
                  finalPrice = Math.max(0, basePriceCents - discount.amount_cents);
                }
                checkDiscountAndRegister(finalPrice);
              }
            );
          }
        );
      } else {
        checkDiscountAndRegister(basePriceCents);
      }
    });
  });
  });
});

// ===============================
// DELETE EVENT (Organizer / Admin)
// ===============================
// ✅ EDIT EVENT — lets an organizer update their own event's details
app.put('/api/events/:uuid', authRequired, requireOrganizer, (req, res) => {
  const { uuid } = req.params;
  const {
    title, description, category, start_time, end_time, location, capacity,
    price_single_cents, price_duo_cents, price_trio_cents, allowed_tiers,
    status, visibility, discounts_enabled, discount_codes
  } = req.body;

  db.get('SELECT id, created_by FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this event' });
    }

    if (!title || !start_time) return res.status(400).json({ error: 'Title and start time required' });
    if (!location) return res.status(400).json({ error: 'Location is required' });
    if (!category || !EVENT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${EVENT_CATEGORIES.join(', ')}` });
    }
    // ✅ SEC-002 fix: same negative-value rejection as event creation.
    for (const [field, val] of Object.entries({ capacity, price_single_cents, price_duo_cents, price_trio_cents })) {
      if (val !== undefined && val !== null && val !== '' && Number(val) < 0) {
        return res.status(400).json({ error: `${field} cannot be negative` });
      }
    }

    db.run(
      `UPDATE events SET
        title = ?, description = ?, category = ?, start_time = ?, end_time = ?,
        location = ?, capacity = ?, price_single_cents = ?, price_duo_cents = ?,
        price_trio_cents = ?, allowed_tiers = ?, status = ?, visibility = ?,
        discounts_enabled = ?
       WHERE id = ?`,
      [
        title, description || '', category, start_time, end_time || null,
        location, capacity || null,
        price_single_cents != null ? Number(price_single_cents) : null,
        price_duo_cents != null ? Number(price_duo_cents) : null,
        price_trio_cents != null ? Number(price_trio_cents) : null,
        allowed_tiers || 'single',
        status === 'draft' ? 'draft' : 'published',
        visibility === 'private' ? 'private' : 'public',
        discounts_enabled ? 1 : 0,
        event.id
      ],
      function (err) {
        if (err) {
          console.error('Event update failed:', err);
          return res.status(500).json({ error: 'Failed to update event' });
        }
        saveDiscountCodes(event.id, discounts_enabled, discount_codes, (discErr) => {
          if (discErr) console.error('Discount code save failed:', discErr.message);
          res.json({ ok: true });
        });
      }
    );
  });
});

app.delete('/api/events/:uuid', authRequired, requireOrganizer, (req, res) => {
  const { uuid } = req.params;

  db.get(
    `
    SELECT e.id, e.created_by
    FROM events e
    WHERE e.uuid = ?
    `,
    [uuid],
    (err, event) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Only creator or admin can delete
      if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this event' });
      }

      // Delete tickets first (FK safety)
      db.run(
        `DELETE FROM tickets WHERE event_id = ?`,
        [event.id],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to delete tickets' });
          }

          // Delete event
          db.run(
            `DELETE FROM events WHERE id = ?`,
            [event.id],
            function (err) {
              if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to delete event' });
              }

              res.json({
                ok: true,
                message: 'Event deleted successfully'
              });
            }
          );
        }
      );
    }
  );
});

// ===============================
// Organizer: My Events
// ===============================
app.get('/api/organizer/my-events', authRequired, requireOrganizer, (req, res) => {
  const activeOnly = req.query.active_only === '1';

  let query = `
    SELECT 
      e.id,
      e.uuid,
      e.title,
      e.description,
      e.category,
      e.start_time,
      e.end_time,
      e.location,
      e.capacity,
      e.status,
      e.visibility,
      e.price_single_cents,
      e.price_duo_cents,
      e.price_trio_cents,
      e.allowed_tiers,
      e.discounts_enabled
    FROM events e
    JOIN users u ON e.created_by = u.id
    WHERE u.email = ?
  `;

  const params = [req.user.email];

  if (activeOnly) {
    // ✅ FIX: event times are entered/stored as naive local (IST) datetimes, but
    // SQLite's 'now' is UTC — without the +330 minutes (5h30m) offset, ended events kept
    // showing for ~5.5 extra hours after they actually finished in IST.
    // Note: SQLite datetime() modifiers don't accept "+5:30" syntax (returns NULL);
    // it must be expressed in a single unit, hence 330 minutes.
    query += ` AND (e.end_time IS NULL OR datetime(e.end_time) >= datetime('now', '+330 minutes'))`;
  }

  query += ` ORDER BY e.start_time DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to load events' });
    }
    res.json({ events: rows });
  });
});

// ===============================
// ORGANIZER DISCOUNT CODES (for editing an existing event)
// ===============================
app.get('/api/organizer/events/:uuid/discounts', authRequired, requireOrganizer, (req, res) => {
  const { uuid } = req.params;
  db.get('SELECT id, created_by FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    db.all(
      'SELECT id, code, percentage, amount_cents, max_uses, used_count, active FROM discounts WHERE event_id = ? ORDER BY id ASC',
      [event.id],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Failed to load discount codes' });
        res.json({ discounts: rows });
      }
    );
  });
});

// ===============================
// GET TICKET BY UUID (PRINT VIEW)
// ===============================
app.get('/api/tickets/:uuid', authRequired, (req, res) => {
  const { uuid } = req.params;

  expireStaleHolds(() => {
  db.get(
    `
    SELECT 
      t.id AS ticket_number,
      t.uuid,
      t.created_at,
      t.participants_json,
      t.payment_status,
      t.qr_code,
      t.checked_in,
      t.amount_due_cents,
      t.group_type,
      t.hold_expires_at,
      e.uuid AS event_uuid,
      e.title AS event_title,
      e.category,
      e.start_time,
      e.end_time,
      e.location
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE t.uuid = ? AND t.user_id = ?
    `,
    [uuid, req.user.id],
    (err, ticket) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load ticket' });
      }

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      res.json({
        ticket
      });
    }
  );
  });
});

// ===============================
// GET EVENT PAYMENT SETUP
// ===============================
app.get('/api/events/:uuid/payment-setup', (req, res) => {
  const { uuid } = req.params;
  db.get(
    `SELECT bank_account_name, bank_account_no, bank_ifsc, upi_id, upi_qr_url, payment_notes 
     FROM events WHERE uuid = ?`,
    [uuid],
    (err, event) => {
      if (err) return sendDbError(res, err);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ payment: event });
    }
  );
});

// ===============================
// SAVE/UPDATE EVENT PAYMENT SETUP (Organizer only)
// ===============================
app.put('/api/events/:uuid/payment-setup', authRequired, requireOrganizer, upload.single('upi_qr'), (req, res) => {
  const { uuid } = req.params;
  const { bank_account_name, bank_account_no, bank_ifsc, upi_id, payment_notes } = req.body;

  db.get('SELECT id, created_by FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err || !event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify payment setup for this event' });
    }

    let upiQrUrl = null;
    if (req.file) {
      upiQrUrl = `/uploads/${req.file.filename}`;
    }

    const query = upiQrUrl
      ? `UPDATE events SET bank_account_name = ?, bank_account_no = ?, bank_ifsc = ?, upi_id = ?, upi_qr_url = ?, payment_notes = ? WHERE id = ?`
      : `UPDATE events SET bank_account_name = ?, bank_account_no = ?, bank_ifsc = ?, upi_id = ?, payment_notes = ? WHERE id = ?`;

    const params = upiQrUrl
      ? [bank_account_name, bank_account_no, bank_ifsc, upi_id, upiQrUrl, payment_notes, event.id]
      : [bank_account_name, bank_account_no, bank_ifsc, upi_id, payment_notes, event.id];

    db.run(query, params, function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to update payment setup' });
      }
      res.json({ ok: true });
    });
  });
});

// ===============================
// SUBMIT PAYMENT PROOF (UTR / Transaction ID only — no screenshot needed)
// ===============================
app.post('/api/payments/proof', authRequired, (req, res) => {
  const { ticket_uuid, txn_id } = req.body;
  if (!ticket_uuid || !txn_id) {
    return res.status(400).json({ error: 'Ticket UUID and Transaction ID / UTR Number are required' });
  }

  // ✅ SEC-014 fix: expire stale holds first so a ticket whose 5-minute
  // window has already lapsed is seen as 'expired' (not stale 'unpaid')
  // by the check just below, rather than by some later background sweep.
  expireStaleHolds(() => {
  db.get('SELECT id, user_id, payment_status FROM tickets WHERE uuid = ?', [ticket_uuid], (err, ticket) => {
    if (err || !ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // ✅ SEC-014 fix: previously this endpoint updated payment_status to
    // 'pending' unconditionally, regardless of the ticket's current status.
    // That let a caller resurrect a seat hold whose 5-minute window had
    // already expired — moving it from 'expired' back to 'pending' long
    // after the seat had been counted as free again (and possibly already
    // re-sold to someone else), directly undermining the hold-expiry system
    // that exists to prevent overbooking. It also let a decided ticket
    // ('paid'/'verified') or one already under review ('pending') be
    // silently reset. Only a ticket that is still genuinely awaiting its
    // first payment attempt, or was rejected and is being retried, may
    // submit/resubmit proof.
    if (!['unpaid', 'rejected'].includes(ticket.payment_status)) {
      const reason = ticket.payment_status === 'expired'
        ? 'This registration\'s payment window has expired. Please register again.'
        : 'This ticket is not awaiting payment proof.';
      return res.status(409).json({ error: reason });
    }

    db.run(
      `UPDATE tickets 
       SET payment_status = 'pending', proof_txn_id = ?, proof_submitted_at = ? 
       WHERE id = ? AND payment_status IN ('unpaid', 'rejected')`,
      [txn_id, dayjs().toISOString(), ticket.id],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to submit payment proof' });
        }
        // Belt-and-suspenders: if another request changed the status between
        // the check above and this write, `changes` will be 0.
        if (this.changes === 0) {
          return res.status(409).json({ error: 'This ticket is not awaiting payment proof.' });
        }
        res.json({ ok: true });
      }
    );
  });
  });
});

// ===============================
// ORGANIZER: LIST PAYMENT PROOFS
// ===============================
app.get('/api/organizer/events/:uuid/payments', authRequired, requireOrganizer, (req, res) => {
  const { uuid } = req.params;
  const status = req.query.status || 'pending';

  db.get('SELECT id, created_by FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err || !event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.all(
      `SELECT t.id AS ticket_number, t.uuid AS ticket_uuid, t.payment_status, t.proof_txn_id, 
              t.proof_submitted_at, t.group_type, t.participants_json, t.amount_due_cents,
              u.name AS user_name, u.email AS user_email
       FROM tickets t
       JOIN users u ON t.user_id = u.id
       WHERE t.event_id = ? AND t.payment_status = ?`,
      [event.id, status],
      (err, rows) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to query payment proofs' });
        }
        res.json({ payments: rows });
      }
    );
  });
});

// ===============================
// ORGANIZER: APPROVE PAYMENT
// ===============================
app.post('/api/organizer/payments/:ticketUuid/approve', authRequired, requireOrganizer, (req, res) => {
  const { ticketUuid } = req.params;

  db.get(
    `SELECT t.*, e.created_by, e.uuid AS event_uuid 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE t.uuid = ?`,
    [ticketUuid],
    (err, ticket) => {
      if (err || !ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (req.user.role !== 'admin' && ticket.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const qrPayload = generateQrCode(ticket.uuid, ticket.event_uuid, ticket.user_id);
      QRCode.toDataURL(qrPayload, (err, url) => {
        if (err) {
          console.error('QR code generation failed:', err);
          return res.status(500).json({ error: 'QR Code generation failed' });
        }

        db.run(
          `UPDATE tickets 
           SET payment_status = 'paid', qr_code = ?, reviewed_by = ?, reviewed_at = ?, price_paid_cents = amount_due_cents 
           WHERE id = ?`,
          [url, req.user.id, dayjs().toISOString(), ticket.id],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ error: 'Failed to approve payment' });
            }
            res.json({ ok: true });
          }
        );
      });
    }
  );
});

// ===============================
// ORGANIZER: REJECT PAYMENT
// ===============================
app.post('/api/organizer/payments/:ticketUuid/reject', authRequired, requireOrganizer, (req, res) => {
  const { ticketUuid } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  db.get(
    `SELECT t.*, e.created_by 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE t.uuid = ?`,
    [ticketUuid],
    (err, ticket) => {
      if (err || !ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (req.user.role !== 'admin' && ticket.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        `UPDATE tickets 
         SET payment_status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = ? 
         WHERE id = ?`,
        [reason, req.user.id, dayjs().toISOString(), ticket.id],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to reject payment' });
          }
          res.json({ ok: true });
        }
      );
    }
  );
});

// ===============================
// EVENT ANALYTICS
// ===============================
app.get('/api/analytics/events/:uuid', authRequired, requireOrganizer, (req, res) => {
  const { uuid } = req.params;

  db.get('SELECT id, created_by FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err || !event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.get(
      `SELECT 
         COUNT(*) AS total,
         SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checked_in
       FROM tickets
       WHERE event_id = ?`,
      [event.id],
      (err, row) => {
        if (err) return sendDbError(res, err);
        res.json({
          metrics: {
            totalRegistrations: row.total || 0,
            paid: row.paid || 0,
            checkedIn: row.checked_in || 0
          }
        });
      }
    );
  });
});

// ===============================
// ATTENDANCE: SCAN QR CODE
// ===============================
app.post('/api/attendance/scan', authRequired, requireOrganizer, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'QR Code payload is required' });

  let payload;
  try {
    payload = JSON.parse(code);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid QR code format' });
  }

  const { ticket_uuid, event_uuid, user_id, sig } = payload;
  if (!ticket_uuid || !event_uuid || !user_id || !sig) {
    return res.status(400).json({ error: 'Malformed QR code payload' });
  }

  // Verify HMAC signature
  const expectedSig = crypto.createHmac('sha256', QR_SIGNING_SECRET)
    .update(`${ticket_uuid}:${event_uuid}:${user_id}`)
    .digest('hex');

  if (sig !== expectedSig) {
    return res.status(400).json({ error: 'Invalid QR signature (tampered)' });
  }

  db.get(
    `SELECT t.*, u.name AS user_name, u.email AS user_email, e.created_by AS event_owner_id, e.title AS event_title
     FROM tickets t 
     JOIN users u ON t.user_id = u.id 
     JOIN events e ON t.event_id = e.id
     WHERE t.uuid = ?`,
    [ticket_uuid],
    (err, ticket) => {
      if (err) return sendDbError(res, err);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (req.user.role !== 'admin' && ticket.event_owner_id !== req.user.id) {
        return res.status(403).json({ error: 'This ticket belongs to a different organizer\'s event' });
      }
      if (ticket.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Ticket is not paid or verified' });
      }

      if (ticket.checked_in) {
        return res.json({ 
          already: true, 
          details: { user_name: ticket.user_name, user_email: ticket.user_email } 
        });
      }

      db.serialize(() => {
        db.run('UPDATE tickets SET checked_in = 1 WHERE id = ?', [ticket.id]);
        db.run(
          `INSERT INTO attendance (event_id, user_id, ticket_id, present, timestamp, source)
           VALUES (?, ?, ?, 1, ?, 'qr')`,
          [ticket.event_id, ticket.user_id, ticket.id, dayjs().toISOString()]
        );
      });

      res.json({ 
        ok: true, 
        details: { user_name: ticket.user_name, user_email: ticket.user_email } 
      });
    }
  );
});

// ===============================
// ATTENDANCE: MANUAL CHECK-IN
// ===============================
// ✅ FIX: the old /api/attendance/manual endpoint required raw internal
// numeric event_id + user_id — IDs an organizer has no practical way to know
// at the door. This version works the way a volunteer actually checks
// people in: pick the Event ID (the friendly one shown in the dashboard)
// once, then just the Ticket Number (#0007 etc.) printed on each e-ticket.
app.post('/api/attendance/manual-by-ticket', authRequired, requireOrganizer, (req, res) => {
  const { event_uuid, ticket_number, present } = req.body;
  if (!event_uuid || !ticket_number) {
    return res.status(400).json({ error: 'Event ID and Ticket Number are required' });
  }

  db.get('SELECT id, created_by, title FROM events WHERE uuid = ?', [event_uuid], (err, event) => {
    if (err) return sendDbError(res, err);
    if (!event) return res.status(404).json({ error: 'No event found for that Event ID' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You are not the organizer of this event' });
    }

    db.get(
      `SELECT t.id, t.uuid, t.payment_status, t.checked_in, t.participants_json, t.user_id,
              u.name AS user_name, u.email AS user_email
       FROM tickets t JOIN users u ON t.user_id = u.id
       WHERE t.event_id = ? AND t.id = ?`,
      [event.id, ticket_number],
      (err, ticket) => {
        if (err) return sendDbError(res, err);
        if (!ticket) return res.status(404).json({ error: `Ticket #${String(ticket_number).padStart(4, '0')} not found for "${event.title}"` });
        if (ticket.payment_status !== 'paid') {
          return res.status(400).json({ error: 'This ticket has not been paid/verified yet' });
        }

        const wasAlready = !!ticket.checked_in;
        const isPresent = present !== false;

        db.serialize(() => {
          db.run('UPDATE tickets SET checked_in = ? WHERE id = ?', [isPresent ? 1 : 0, ticket.id]);
          db.run(
            `INSERT INTO attendance (event_id, user_id, present, timestamp, source) VALUES (?, ?, ?, ?, 'manual')`,
            [event.id, ticket.user_id, isPresent ? 1 : 0, dayjs().toISOString()]
          );
        });

        let participants = [];
        try { participants = JSON.parse(ticket.participants_json || '[]'); } catch (_) {}
        const names = participants.map(p => p.name).filter(Boolean).join(', ') || ticket.user_name;

        res.json({
          ok: true,
          already: wasAlready,
          details: { names, user_email: ticket.user_email, event_title: event.title }
        });
      }
    );
  });
});

app.post('/api/attendance/manual', authRequired, requireOrganizer, (req, res) => {
  const { event_id, user_id, present } = req.body;
  if (!event_id || !user_id) {
    return res.status(400).json({ error: 'Event ID and User ID are required' });
  }

  // ✅ SEC-010 fix: this handler previously trusted event_id with no
  // ownership check at all, letting any organizer mark attendance on any
  // other organizer's event. Load the event first and verify ownership,
  // matching the pattern already used by manual-by-ticket and
  // attendance/scan.
  db.get('SELECT id, created_by FROM events WHERE id = ?', [event_id], (err, event) => {
    if (err) return sendDbError(res, err);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You are not the organizer of this event' });
    }

    db.serialize(() => {
      db.run(
        `INSERT INTO attendance (event_id, user_id, present, timestamp, source)
         VALUES (?, ?, ?, ?, 'manual')`,
        [event_id, user_id, present ? 1 : 0, dayjs().toISOString()]
      );
      db.run(
        `UPDATE tickets SET checked_in = ? WHERE event_id = ? AND user_id = ?`,
        [present ? 1 : 0, event_id, user_id]
      );
    });

    res.json({ ok: true });
  });
});

// ===============================
// ATTENDANCE: EXPORT
// ===============================
app.get('/api/attendance/:eventId/export', authRequired, requireOrganizer, (req, res) => {
  const { eventId } = req.params;

  // ✅ SEC-011 fix: same missing-ownership pattern as SEC-010 — previously
  // any organizer could export any other organizer's attendee list.
  db.get('SELECT id, created_by FROM events WHERE id = ?', [eventId], (err, event) => {
    if (err) return sendDbError(res, err);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You are not the organizer of this event' });
    }

    db.all(
      `SELECT user_id, present, timestamp, source 
       FROM attendance 
       WHERE event_id = ?`,
      [eventId],
      (err2, rows) => {
        if (err2) return sendDbError(res, err2);
        res.json({ attendance: rows });
      }
    );
  });
});

// ===============================
// ATTENDANCE: IMPORT
// ===============================
app.post('/api/attendance/:eventId/import', authRequired, requireOrganizer, (req, res) => {
  const { eventId } = req.params;
  const { attendance } = req.body;

  if (!attendance || !Array.isArray(attendance)) {
    return res.status(400).json({ error: 'Attendance array required' });
  }

  // ✅ SEC-012 fix: this was the most serious of the three — no ownership
  // check on a DESTRUCTIVE route (delete-then-replace). Any organizer could
  // wipe and overwrite another organizer's entire attendance history for
  // their event. Ownership is now verified before the delete/import runs.
  db.get('SELECT id, created_by FROM events WHERE id = ?', [eventId], (err, event) => {
    if (err) return sendDbError(res, err);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (req.user.role !== 'admin' && event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You are not the organizer of this event' });
    }

    const stmt = db.prepare(
      `INSERT INTO attendance (event_id, user_id, present, timestamp, source) 
       VALUES (?, ?, ?, ?, ?)`
    );

    db.serialize(() => {
      db.run('DELETE FROM attendance WHERE event_id = ?', [eventId]);
      attendance.forEach(item => {
        stmt.run(eventId, item.user_id, item.present || 0, item.timestamp || dayjs().toISOString(), item.source || 'import');
      });
      stmt.finalize();
    });

    res.json({ ok: true });
  });
});
// ===============================
// MY TICKETS (Logged-in user)
// ===============================
app.get('/api/my-tickets', authRequired, (req, res) => {
  expireStaleHolds(() => {
  db.all(
    `
    SELECT
      t.id AS ticket_number,
      t.uuid,
      t.created_at,
      t.payment_status,
      t.checked_in,
      t.hold_expires_at,
      t.amount_due_cents,
      e.uuid AS event_uuid,
      e.title AS event_title,
      e.start_time,
      e.end_time,
      e.location
    FROM tickets t
    JOIN events e ON e.id = t.event_id
    WHERE t.user_id = ?
    ORDER BY e.start_time DESC
    `,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to load tickets' });
      }
      res.json({ tickets: rows });
    }
  );
  });
});

// ✅ STATIC FILES LAST (after ALL API)
// ===============================
// AI CHATBOT (optional real LLM, KB fallback)
// ===============================
// If the site owner sets an OPENAI_API_KEY environment variable, questions
// the client-side knowledge base couldn't answer are forwarded to a real
// LLM with a system prompt describing CampusVibe, for genuinely open-ended
// answers. Without a key, this simply tells the client it couldn't help so
// the widget can suggest the Help page / contacting the organizer instead
// of ever inventing an answer.
const CAMPUSVIBE_SYSTEM_PROMPT = `You are the CampusVibe Assistant, a helpful support chatbot embedded on the CampusVibe campus event platform. CampusVibe lets students discover campus events (fests, workshops, competitions), register, pay via bank transfer or UPI, and receive a QR e-ticket once an organizer verifies their payment. Organizers apply for an organizer account, then use a Dashboard to create events, set up payment details, review submitted payment proofs, and check students in by scanning their ticket QR at the door. Unpaid registrations hold a seat for only 5 minutes before the seat is automatically released. Answer briefly and helpfully, only about how to use CampusVibe. If you don't know something specific to a particular event (e.g. its exact schedule or contact person), say the user should check the event page or contact the organizer directly. Do not invent features that don't exist.`;

app.post('/api/chatbot', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No LLM configured — be honest instead of guessing.
    return res.json({ handled: false });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CAMPUSVIBE_SYSTEM_PROMPT },
          { role: 'user', content: message.slice(0, 2000) }
        ],
        max_tokens: 300,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      console.error('Chatbot LLM call failed:', response.status, await response.text());
      return res.json({ handled: false });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.json({ handled: false });
    res.json({ handled: true, reply });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    res.json({ handled: false });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// ✅ SPA FALLBACK LAST
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>🚀 CampusVibe LIVE!</h1>
      <p><a href="/api/health">API Health ✅</a></p>
      <script>
        fetch('/api/health').then(r=>r.json()).then(console.log);
      </script>
    `);
  }
});

// ✅ SEC-018 fix: there was previously no error-handling middleware at all,
// so any unhandled error fell through to Express's *default* error handler.
// That default handler renders a full stack trace as HTML whenever
// NODE_ENV isn't exactly 'production' — and the easiest way to hit it
// turns out to need no auth at all: sending a malformed JSON body to
// *any* endpoint (e.g. a POST with a truncated `{...` body) makes
// body-parser throw a SyntaxError, which Express then rendered as HTML
// containing absolute filesystem paths and the internal body-parser /
// raw-body call chain (CWE-209, information exposure through an error
// message). This is real internal detail disclosure reachable pre-auth,
// and shouldn't depend entirely on an environment variable being set
// correctly in every deployment target. This handler must be registered
// last (Express only routes to a 4-argument middleware on error) and
// always logs the full error server-side while returning a generic,
// safe JSON error to the client.
app.use((err, req, res, next) => {
  console.error('[Unhandled error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const isMalformedBody = (err && err.type === 'entity.parse.failed') || err instanceof SyntaxError;
  // ✅ SEC-021 fix (Part 6): surface multer's upload-validation errors (bad
  // file type from fileFilter, file too large) as a real 400 with a safe,
  // specific message instead of falling through to the generic 500 below —
  // these are ordinary client input errors, not server faults, and the
  // messages here are static strings we wrote ourselves (never raw
  // filesystem/driver detail), so returning them is safe.
  const isUploadError = err && (err.name === 'MulterError' || /PNG, JPEG, or WebP/.test(err.message || ''));
  const status = isMalformedBody ? 400 : isUploadError ? 400 : (err && Number.isInteger(err.status) ? err.status : 500);
  const message = isMalformedBody
    ? 'Malformed request body'
    : isUploadError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB).' : (err.message || 'Invalid file upload.'))
      : 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CampusVibe FULLY LIVE: http://localhost:${PORT}`);
  console.log(`👤 Admin Login: ${process.env.ADMIN_EMAIL || 'admin@campusvibe.local'}`);
  console.log(`🧪 Test API:    http://localhost:${PORT}/api/health`);
  console.log(`📱 Frontend:   http://localhost:${PORT}/`);
  console.log(`💾 Database:   data/campusvibe.db`);
});