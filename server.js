/*
  CampusVibe Server
  Tagline: "Ideal Management, Ideal Moments"

  Notes:
  - All external API keys are left blank with clear comments (ADD YOUR ... HERE)
  - Google OAuth, Stripe, Razorpay, Email(SMTP), and SMS are provided as placeholders
  - Database: SQLite (file-based) using better-sqlite3; tables auto-created on boot
  - QR Tickets: Generated with qrcode library and stored as Data URLs
  - JWT cookies for authentication
  - Role-based access for student, committee, admin
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
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');

// Payments placeholders
// const Stripe = require('stripe'); // ADD YOUR STRIPE_SECRET_KEY HERE
// const Razorpay = require('razorpay'); // ADD YOUR RAZORPAY_KEY_ID/SECRET HERE

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_DEV_SECRET'; // Set in .env for production
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || JWT_SECRET;

// Ensure data directory exists
const dataDir = path.join(process.cwd(), '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
// Initialize DB
const dbPath = path.join(dataDir, 'campusvibe.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables if not exist
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  mobile TEXT,
  roll_number TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','committee','admin')),
  google_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  location TEXT,
  capacity INTEGER,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL,
  percentage INTEGER,
  amount_cents INTEGER,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  qr_code TEXT,
  checked_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  discount_code TEXT,
  price_paid_cents INTEGER NOT NULL DEFAULT 0,
  payment_provider TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  ticket_id INTEGER,
  present INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event_id INTEGER,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(event_id) REFERENCES events(id)
);
`;
db.exec(schema);

// Lightweight migrations to add columns if missing (SQLite will throw if exists; we ignore)
function addColumn(table, columnDef) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); } catch (e) { /* ignore */ }
}
addColumn('events', 'bank_account_no TEXT');
addColumn('events', 'bank_ifsc TEXT');
addColumn('events', 'bank_account_name TEXT');
addColumn('events', 'upi_id TEXT');
addColumn('events', 'upi_qr_url TEXT');
addColumn('events', 'payment_notes TEXT');
addColumn('tickets', 'proof_txn_id TEXT');
addColumn('tickets', 'proof_image_url TEXT');
addColumn('tickets', 'proof_submitted_at TEXT');
addColumn('tickets', 'reviewed_by INTEGER');
addColumn('tickets', 'reviewed_at TEXT');
addColumn('tickets', 'rejection_reason TEXT');
addColumn('events', 'price_single_cents INTEGER');
addColumn('events', 'price_duo_cents INTEGER');
addColumn('events', 'price_trio_cents INTEGER');
addColumn('tickets', 'group_type TEXT');
addColumn('tickets', 'participants_json TEXT');
addColumn('tickets', 'amount_due_cents INTEGER');
addColumn('events', 'allowed_tiers TEXT');

// Uploads (GPay QR and payment proofs)
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
['upi_qr', 'payment_proofs'].forEach(sub => {
  const dest = path.join(uploadDir, sub);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
});
// ✅ VERCEL SAFE - Pre-create ALL directories at startup

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.fieldname === 'upi_qr' ? 'upi_qr' : 'payment_proofs';
    cb(null, path.join(uploadDir, sub));  // ✅ Direct path, no mkdir
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Seed admin if not exists
(function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusvibe.local';
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    db.prepare(`INSERT INTO users (uuid, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), 'Administrator', adminEmail, hash, 'admin', dayjs().toISOString());
    console.log('Seeded admin user:', adminEmail);
  }
})();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "data:", "https:", "chrome-extension:", "moz-extension:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'self'"],
      // allow lottie JSON over self
      "object-src": ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

function getUserById(id) {
  return db.prepare('SELECT id, uuid, name, email, mobile, roll_number, role, created_at FROM users WHERE id = ?').get(id);
}

// Nodemailer transporter placeholder
function getTransporter() {
  // ADD YOUR SMTP CONFIG HERE (.env): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, // ADD YOUR SMTP_HOST HERE
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

// Auth routes
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, mobile, roll_number } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'This email is already registered. Please login or use a different email.' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uuidv4(), name || '', email, hash, mobile || '', roll_number || '', 'student', dayjs().toISOString());
  const user = getUserById(info.lastInsertRowid);
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user, token });
});

// Register or upgrade to organizer (committee role)
app.post('/api/auth/register-organizer', (req, res) => {
  const { name, email, password, mobile, roll_number } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (row) {
    const match = row.password_hash && bcrypt.compareSync(password, row.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password for organizer upgrade. Please try again with the correct password.' });
    if (row.role !== 'admin' && row.role !== 'committee') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('committee', row.id);
    }
    const user = getUserById(row.id);
    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    return res.json({ user, token, upgraded: true });
  } else {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuidv4(), name || '', email, hash, mobile || '', roll_number || '', 'committee', dayjs().toISOString());
    const user = getUserById(info.lastInsertRowid);
    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    return res.json({ user, token, upgraded: false });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  const match = row.password_hash && bcrypt.compareSync(password, row.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const user = getUserById(row.id);
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({ user });
});

// Google OAuth placeholders
app.get('/api/auth/google/start', (req, res) => {
  // ADD YOUR GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and implement passport GoogleStrategy
  res.json({ message: 'Google OAuth not configured. ADD YOUR GOOGLE_CLIENT_ID/SECRET HERE and implement OAuth.' });
});
app.get('/api/auth/google/callback', (req, res) => {
  res.json({ message: 'Google OAuth callback placeholder. Complete configuration to enable.' });
});

// Profile update
app.put('/api/users/me', authRequired, (req, res) => {
  const { name, mobile, roll_number } = req.body || {};
  db.prepare('UPDATE users SET name = ?, mobile = ?, roll_number = ? WHERE id = ?').run(name || '', mobile || '', roll_number || '', req.user.id);
  const user = getUserById(req.user.id);
  res.json({ user });
});

// Event routes
app.get('/api/events', (req, res) => {
  const { q, category, public: publicOnly } = req.query;
  let sql = `SELECT e.*, (e.capacity - IFNULL((SELECT COUNT(1) FROM tickets t WHERE t.event_id = e.id), 0)) AS remaining FROM events e WHERE 1=1`;
  const params = [];
  if (publicOnly === '1') {
    sql += ` AND e.status = 'published' AND e.visibility = 'public'`;
    sql += ` AND IFNULL(e.end_time, e.start_time) > ?`;
    params.push(dayjs().toISOString());
  }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY start_time ASC';
  const rows = db.prepare(sql).all(...params);
  res.json({ events: rows });
});

app.get('/api/organizer/my-events', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const activeOnly = req.query.active_only === '1' || req.query.active_only === 'true';
  const rows = db.prepare('SELECT * FROM events WHERE created_by = ? ORDER BY start_time ASC').all(req.user.id);
  if (!activeOnly) return res.json({ events: rows });
  const now = dayjs();
  const filtered = rows.filter(e => {
    const t = e.end_time || e.start_time;
    return !t ? true : now.isBefore(dayjs(t));
  });
  res.json({ events: filtered });
});

app.get('/api/events/:uuid', (req, res) => {
  const sql = `
    SELECT e.*, (e.capacity - IFNULL((SELECT COUNT(1) FROM tickets t WHERE t.event_id = e.id), 0)) AS remaining
    FROM events e
    WHERE e.uuid = ?
  `;
  const event = db.prepare(sql).get(req.params.uuid);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

app.post('/api/events', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const { title, description, category, start_time, end_time, location, capacity,
          price_cents, currency, status, visibility,
          price_single_cents, price_duo_cents, price_trio_cents, allowed_tiers } = req.body || {};
  if (!title || !start_time) return res.status(400).json({ error: 'title and start_time required' });
  const info = db.prepare(`INSERT INTO events (uuid, title, description, category, start_time, end_time, location, capacity, price_cents, currency, created_by, status, visibility, created_at, price_single_cents, price_duo_cents, price_trio_cents, allowed_tiers) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuidv4(), title, description || '', category || '', start_time, end_time || null, location || '', Number(capacity) || null, Number(price_cents) || 0, currency || 'INR', req.user.id, status || 'published', visibility || 'public', dayjs().toISOString(),
         price_single_cents ?? null, price_duo_cents ?? null, price_trio_cents ?? null, (allowed_tiers || 'single'));
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.json({ event });
});

app.put('/api/events/:uuid', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const { title, description, category, start_time, end_time, location, capacity, price_cents, currency, status, visibility,
          price_single_cents, price_duo_cents, price_trio_cents, allowed_tiers } = req.body || {};
  db.prepare(`UPDATE events SET title = ?, description = ?, category = ?, start_time = ?, end_time = ?, location = ?, capacity = ?, price_cents = ?, currency = ?, status = ?, visibility = ?, price_single_cents = COALESCE(?, price_single_cents), price_duo_cents = COALESCE(?, price_duo_cents), price_trio_cents = COALESCE(?, price_trio_cents), allowed_tiers = COALESCE(?, allowed_tiers) WHERE id = ?`)
    .run(title || e.title, description ?? e.description, category ?? e.category, start_time || e.start_time, end_time || e.end_time, location ?? e.location, capacity ?? e.capacity, price_cents ?? e.price_cents, currency || e.currency, status || e.status, visibility || e.visibility,
         price_single_cents ?? null, price_duo_cents ?? null, price_trio_cents ?? null, allowed_tiers ?? null, e.id);
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(e.id);
  res.json({ event: updated });
});

app.delete('/api/events/:uuid', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  res.json({ ok: true });
});

// Discount code management
app.post('/api/events/:uuid/discounts', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const { code, percentage, amount_cents, max_uses } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const info = db.prepare(`INSERT INTO discounts (code, event_id, percentage, amount_cents, max_uses, created_at) VALUES (?,?,?,?,?,?)`)
    .run(code.toUpperCase(), e.id, percentage || null, amount_cents || null, max_uses || null, dayjs().toISOString());
  const discount = db.prepare('SELECT * FROM discounts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ discount });
});

app.post('/api/events/:uuid/waitlist', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const existing = db.prepare('SELECT id FROM waitlist WHERE event_id = ? AND user_id = ?').get(e.id, req.user.id);
  if (!existing) {
    db.prepare('INSERT INTO waitlist (event_id, user_id, created_at) VALUES (?,?,?)').run(e.id, req.user.id, dayjs().toISOString());
  }
  res.json({ ok: true });
});

// Payment setup per event (organizer provides bank/UPI details)
app.get('/api/events/:uuid/payment-setup', (req, res) => {
  const e = db.prepare('SELECT bank_account_no, bank_ifsc, bank_account_name, upi_id, upi_qr_url, payment_notes FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  res.json({ payment: e });
});

app.put('/api/events/:uuid/payment-setup', authRequired, roleRequired('committee', 'admin'), upload.single('upi_qr'), (req, res) => {
  const eRow = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!eRow) return res.status(404).json({ error: 'Event not found' });
  if (req.user.role !== 'admin' && eRow.created_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { bank_account_no, bank_ifsc, bank_account_name, upi_id, payment_notes, upi_qr_url } = req.body || {};
  let qrUrl = upi_qr_url || eRow.upi_qr_url || null;
  if (req.file) {
    qrUrl = `/uploads/upi_qr/${req.file.filename}`; // uploaded image path
  }
  db.prepare('UPDATE events SET bank_account_no = ?, bank_ifsc = ?, bank_account_name = ?, upi_id = ?, upi_qr_url = ?, payment_notes = ? WHERE id = ?')
    .run(bank_account_no || null, bank_ifsc || null, bank_account_name || null, upi_id || null, qrUrl, payment_notes || null, eRow.id);
  res.json({ ok: true, upi_qr_url: qrUrl });
});

// Registration and ticketing
function applyDiscount(eventId, basePrice, code) {
  if (!code) return { final: basePrice, code: null };
  const d = db.prepare('SELECT * FROM discounts WHERE event_id = ? AND code = ? AND active = 1').get(eventId, code.toUpperCase());
  if (!d) return { final: basePrice, code: null };
  let final = basePrice;
  if (d.percentage) final = Math.max(0, Math.round(basePrice * (100 - d.percentage) / 100));
  if (d.amount_cents) final = Math.max(0, final - d.amount_cents);
  return { final, code: d.code };
}

app.post('/api/events/:uuid/register', authRequired, async (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });

  // capacity check
  const count = db.prepare('SELECT COUNT(1) as c FROM tickets WHERE event_id = ?').get(e.id).c;
  if (e.capacity && count >= e.capacity) {
    return res.status(409).json({ error: 'Event full. You may join waitlist.', waitlist: true });
  }

  const { payment_method, discount_code, ticket_type, participants } = req.body || {};
  const allowed = (e.allowed_tiers || 'single').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  let groupType = (ticket_type || '').toLowerCase();
  if (!groupType || !['single','duo','trio'].includes(groupType) || (allowed.length && !allowed.includes(groupType))) {
    return res.status(400).json({ error: 'Invalid or disallowed ticket type' });
  }
  const needCount = groupType === 'trio' ? 3 : (groupType === 'duo' ? 2 : 1);
  let participantsArr = Array.isArray(participants) ? participants.slice(0, needCount) : [];
  const primaryUser = getUserById(req.user.id);
  if (!participantsArr[0]) participantsArr[0] = { name: primaryUser.name || '', roll_number: primaryUser.roll_number || '' };
  while (participantsArr.length < needCount) participantsArr.push({ name: '', roll_number: '' });

  const basePrice = groupType === 'trio'
    ? (e.price_trio_cents ?? 25000)
    : groupType === 'duo'
      ? (e.price_duo_cents ?? 18000)
      : (e.price_single_cents ?? e.price_cents ?? 9000);

  const { final, code } = applyDiscount(e.id, basePrice, discount_code);

  const ticketUuid = uuidv4();
  const now = dayjs().toISOString();
  const info = db.prepare(`INSERT INTO tickets (uuid, user_id, event_id, created_at, discount_code, amount_due_cents, price_paid_cents, payment_provider, payment_status, group_type, participants_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ticketUuid, req.user.id, e.id, now, code, final, 0, payment_method || null, final > 0 ? 'unpaid' : 'paid', groupType, JSON.stringify(participantsArr));
  const ticketId = info.lastInsertRowid;

  if (final > 0) {
    // Manual bank/UPI payment required: return organizer payment info and ticket UUID
    const payment = {
      account_name: e.bank_account_name || '',
      account_no: e.bank_account_no || '',
      ifsc: e.bank_ifsc || '',
      upi_id: e.upi_id || '',
      upi_qr_url: e.upi_qr_url || null,
      notes: e.payment_notes || ''
    };
    return res.json({ requires_payment: true, ticket_uuid: ticketUuid, event_payment: payment, message: 'Complete bank/UPI transfer and upload proof tied to this ticket.' });
  } else {
    // Free ticket - generate QR now
    const base = `${ticketUuid}|${e.uuid}|${req.user.id}`;
    const sig = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(base).digest('hex');
    const qrPayload = { ticket_uuid: ticketUuid, event_uuid: e.uuid, user_id: req.user.id, sig };
    const qr = await QRCode.toDataURL(JSON.stringify(qrPayload));
    db.prepare('UPDATE tickets SET qr_code = ? WHERE id = ?').run(qr, ticketId);
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    return res.json({ ticket, tagline: 'Ideal Management, Ideal Moments' });
  }
});

// User submits bank/UPI payment proof for a ticket
app.post('/api/payments/proof', authRequired, upload.single('screenshot'), async (req, res) => {
  const { ticket_uuid, txn_id } = req.body || {};
  if (!ticket_uuid || !txn_id) return res.status(400).json({ error: 'ticket_uuid and txn_id required' });
  const t = db.prepare('SELECT * FROM tickets WHERE uuid = ? AND user_id = ?').get(ticket_uuid, req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  const fileUrl = req.file ? `/uploads/payment_proofs/${req.file.filename}` : null;
  db.prepare('UPDATE tickets SET proof_txn_id = ?, proof_image_url = ?, proof_submitted_at = ?, payment_status = ? WHERE id = ?')
    .run(txn_id, fileUrl, dayjs().toISOString(), 'pending_proof', t.id);
  res.json({ ok: true, ticket_uuid });
});

// Organizer views payment proofs for an event
app.get('/api/organizer/events/:uuid/payments', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  if (req.user.role !== 'admin' && e.created_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { status } = req.query || {};
  let sql = `SELECT t.uuid as ticket_uuid, t.payment_status, t.proof_txn_id, t.proof_image_url, t.proof_submitted_at, u.name as user_name, u.email as user_email FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.event_id = ?`;
  const params = [e.id];
  if (status === 'pending') { sql += ` AND t.payment_status = 'pending_proof'`; }
  sql += ' ORDER BY t.proof_submitted_at DESC NULLS LAST, t.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ payments: rows });
});

// Organizer approves payment proof -> generate QR, mark as paid
app.post('/api/organizer/payments/:ticketUuid/approve', authRequired, roleRequired('committee', 'admin'), async (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE uuid = ?').get(req.params.ticketUuid);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  const e = db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id);
  if (req.user.role !== 'admin' && e.created_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const base = `${t.uuid}|${e.uuid}|${t.user_id}`;
  const sig = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(base).digest('hex');
  const qrPayload = { ticket_uuid: t.uuid, event_uuid: e.uuid, user_id: t.user_id, sig };
  const qr = await QRCode.toDataURL(JSON.stringify(qrPayload));
  db.prepare("UPDATE tickets SET payment_status = 'paid', qr_code = ?, reviewed_by = ?, reviewed_at = ?, price_paid_cents = COALESCE(amount_due_cents, price_paid_cents, 0) WHERE id = ?")
    .run(qr, req.user.id, dayjs().toISOString(), t.id);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(t.id);
  res.json({ ok: true, ticket });
});

// Organizer rejects payment proof
app.post('/api/organizer/payments/:ticketUuid/reject', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE uuid = ?').get(req.params.ticketUuid);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  const e = db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id);
  if (req.user.role !== 'admin' && e.created_by !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { reason } = req.body || {};
  db.prepare("UPDATE tickets SET payment_status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .run(reason || null, req.user.id, dayjs().toISOString(), t.id);
  res.json({ ok: true });
});

app.get('/api/tickets/:uuid', authRequired, (req, res) => {
  const t = db.prepare('SELECT t.*, e.title as event_title, e.start_time, e.end_time, e.location, u.name as user_name, u.email as user_email FROM tickets t JOIN events e ON e.id = t.event_id JOIN users u ON u.id = t.user_id WHERE t.uuid = ? AND u.id = ?').get(req.params.uuid, req.user.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ ticket: t, tagline: 'Ideal Management, Ideal Moments' });
});

// List current user's tickets
app.get('/api/tickets', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT t.uuid, t.payment_status, t.checked_in, t.created_at, t.qr_code,
           e.title as event_title, e.uuid as event_uuid, e.start_time, e.location
    FROM tickets t JOIN events e ON e.id = t.event_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
  `).all(req.user.id);
  res.json({ tickets: rows });
});

// Attendance endpoints
app.post('/api/attendance/scan', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  let payload;
  try { payload = JSON.parse(code); } catch (e) { return res.status(400).json({ error: 'Invalid code' }); }
  if (!payload.ticket_uuid || !payload.event_uuid || !payload.user_id || !payload.sig) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const base = `${payload.ticket_uuid}|${payload.event_uuid}|${payload.user_id}`;
  const expected = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(base).digest('hex');
  let valid = false;
  try {
    valid = expected.length === (payload.sig || '').length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(payload.sig));
  } catch (_) { valid = false; }
  if (!valid) return res.status(400).json({ error: 'Signature verification failed' });

  const t = db.prepare('SELECT * FROM tickets WHERE uuid = ?').get(payload.ticket_uuid);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  if (t.user_id !== payload.user_id) return res.status(400).json({ error: 'Ticket-user mismatch' });
  const ev = db.prepare('SELECT uuid FROM events WHERE id = ?').get(t.event_id);
  if (!ev || ev.uuid !== payload.event_uuid) return res.status(400).json({ error: 'Ticket-event mismatch' });
  if (t.payment_status !== 'paid') return res.status(400).json({ error: 'Ticket not paid' });
  if (t.checked_in) {
    const details = db.prepare('SELECT t.uuid, u.name as user_name, u.email as user_email, e.title as event_title FROM tickets t JOIN users u ON u.id = t.user_id JOIN events e ON e.id = t.event_id WHERE t.id = ?').get(t.id);
    return res.json({ ok: true, already: true, details });
  }

  db.prepare('UPDATE tickets SET checked_in = 1 WHERE id = ?').run(t.id);
  db.prepare('INSERT INTO attendance (event_id, user_id, ticket_id, present, timestamp, source) VALUES (?,?,?,?,?,?)')
    .run(t.event_id, t.user_id, t.id, 1, dayjs().toISOString(), 'qr');
  const details = db.prepare('SELECT t.uuid, u.name as user_name, u.email as user_email, e.title as event_title FROM tickets t JOIN users u ON u.id = t.user_id JOIN events e ON e.id = t.event_id WHERE t.id = ?').get(t.id);
  res.json({ ok: true, details });
});

app.post('/api/attendance/manual', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const { event_id, user_id, present } = req.body || {};
  if (!event_id || !user_id) return res.status(400).json({ error: 'event_id and user_id required' });
  db.prepare('INSERT INTO attendance (event_id, user_id, ticket_id, present, timestamp, source) VALUES (?,?,?,?,?,?)')
    .run(event_id, user_id, null, present ? 1 : 0, dayjs().toISOString(), 'manual');
  res.json({ ok: true });
});

app.get('/api/attendance/:eventId/export', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM attendance WHERE event_id = ?').all(Number(req.params.eventId));
  res.json({ event_id: Number(req.params.eventId), attendance: rows });
});

app.post('/api/attendance/:eventId/import', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const { attendance } = req.body || {};
  if (!Array.isArray(attendance)) return res.status(400).json({ error: 'attendance array required' });
  const stmt = db.prepare('INSERT INTO attendance (event_id, user_id, ticket_id, present, timestamp, source) VALUES (?,?,?,?,?,?)');
  const now = dayjs().toISOString();
  const eventId = Number(req.params.eventId);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run(eventId, r.user_id, r.ticket_id || null, r.present ? 1 : 0, r.timestamp || now, r.source || 'import');
    }
  });
  insertMany(attendance);
  res.json({ ok: true, count: attendance.length });
});

// Analytics
app.get('/api/analytics/events/:uuid', authRequired, roleRequired('committee', 'admin'), (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const totalRegistrations = db.prepare('SELECT COUNT(1) as c FROM tickets WHERE event_id = ?').get(e.id).c;
  const paid = db.prepare("SELECT COUNT(1) as c FROM tickets WHERE event_id = ? AND payment_status = 'paid'").get(e.id).c;
  const checkedIn = db.prepare('SELECT COUNT(1) as c FROM tickets WHERE event_id = ? AND checked_in = 1').get(e.id).c;
  res.json({
    event: { uuid: e.uuid, title: e.title },
    metrics: { totalRegistrations, paid, checkedIn }
  });
});

// Notifications placeholders
app.post('/api/notifications/test', authRequired, roleRequired('committee', 'admin'), async (req, res) => {
  const transporter = getTransporter();
  if (!transporter) return res.json({ message: 'Email not configured. ADD YOUR SMTP HOST/USER/PASS in .env' });
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@campusvibe.local',
      to: req.body.to || 'test@example.com',
      subject: '[CampusVibe] Test Notification',
      text: 'Test email from CampusVibe',
      html: '<b>Test email from CampusVibe</b>'
    });
    res.json({ ok: true, id: info.messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Calendar (ICS export)
app.get('/api/events/:uuid/calendar.ics', (req, res) => {
  const e = db.prepare('SELECT * FROM events WHERE uuid = ?').get(req.params.uuid);
  if (!e) return res.status(404).send('Event not found');
  const dtStart = dayjs(e.start_time).format('YYYYMMDDTHHmmss');
  const dtEnd = e.end_time ? dayjs(e.end_time).format('YYYYMMDDTHHmmss') : dtStart;
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//CampusVibe//EN\nBEGIN:VEVENT\nUID:${e.uuid}\nDTSTAMP:${dayjs().format('YYYYMMDDTHHmmss')}\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nSUMMARY:${e.title}\nLOCATION:${e.location || ''}\nDESCRIPTION:${(e.description || '').replace(/\n/g, ' ')}\nEND:VEVENT\nEND:VCALENDAR`;
  res.setHeader('Content-Type', 'text/calendar');
  res.send(ics);
});

// SMS notifications placeholder
app.post('/api/sms/send', authRequired, roleRequired('committee', 'admin'), async (req, res) => {
  // ADD YOUR SMS_API_URL and SMS_API_KEY HERE; Implement with axios/fetch
  res.json({ message: 'SMS not configured. ADD YOUR SMS_API_URL/KEY HERE' });
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback to index.html for SPA-style front-end routes
app.get('*', (req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).send('CampusVibe server running. Frontend not built yet.');
});

app.listen(PORT, () => {
  console.log(`CampusVibe server running on http://localhost:${PORT}`);
});
