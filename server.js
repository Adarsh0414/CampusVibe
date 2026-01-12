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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_DEV_SECRET';
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || JWT_SECRET;

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

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
    if (err) console.error('❌ Schema failed:', err.message);
    else console.log('✅ Schema ready (FULL production schema)');
  });

  // Seed admin
  const adminEmail = 'admin@campusvibe.local';
  db.get('SELECT id FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('admin123', 10);
      db.run('INSERT INTO users (uuid, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)',
        [uuidv4(), 'Administrator', adminEmail, hash, 'admin', dayjs().toISOString()]);
      console.log('✅ Admin seeded:', adminEmail, '/ admin123');
    }
  });
}, 100);

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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// ✅ ALL API ROUTES FIRST (before static)
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), admin: 'admin@campusvibe.local/admin123' }));

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err || !row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = { id: row.id, role: row.role, name: row.name, email: row.email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: false });
    res.json({ user, token: token.slice(0, 20) + '...' });
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, mobile, roll_number } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, existing) => {
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [uuidv4(), name || '', email, hash, mobile || '', roll_number || '', 'student', dayjs().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: 'Registration failed' });
        const user = { id: this.lastID, role: 'student', name: name || email.split('@')[0] };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: false });
        res.json({ user, token: token.slice(0, 20) + '...' });
      });
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/events', (req, res) => {
  const { q, category } = req.query;
  let sql = 'SELECT id, uuid, title, description, start_time, location, capacity, price_cents, status FROM events WHERE visibility = "public" ORDER BY start_time ASC LIMIT 50';
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ events: rows });
  });
});

// ✅ STATIC FILES LAST (after ALL API)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ SPA FALLBACK LAST
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>🚀 CampusVibe LIVE!</h1>
      <p><strong>Admin:</strong> admin@campusvibe.local / admin123</p>
      <p><a href="/api/health">API Health ✅</a></p>
      <script>
        fetch('/api/health').then(r=>r.json()).then(console.log);
      </script>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 CampusVibe FULLY LIVE: http://localhost:${PORT}`);
  console.log(`👤 Admin Login: admin@campusvibe.local / admin123`);
  console.log(`🧪 Test API:    http://localhost:${PORT}/api/health`);
  console.log(`📱 Frontend:   http://localhost:${PORT}/`);
  console.log(`💾 Database:   data/campusvibe.db`);
});
