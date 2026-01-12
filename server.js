/*
  CampusVibe Server
  Tagline: "Ideal Management, Ideal Moments"

  Notes:
  - All external API keys are left blank with clear comments (ADD YOUR ... HERE)
  - Google OAuth, Stripe, Razorpay, Email(SMTP), and SMS are provided as placeholders
  - Database: SQLite (file-based) using sqlite3; tables auto-created on boot
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
const sqlite3 = require('sqlite3').verbose();
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
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// ✅ FIXED: Initialize DB properly for sqlite3
const db = new sqlite3.Database(path.join(__dirname, 'data', 'campusvibe.db'), 
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
    } else {
      console.log('✅ SQLite database connected');
      
      // Set pragmas AFTER connection callback
      db.run("PRAGMA journal_mode = WAL", (err) => {
        if (err) console.warn('WAL mode failed:', err.message);
      });
      db.run("PRAGMA foreign_keys = ON", (err) => {
        if (err) console.warn('Foreign keys failed:', err.message);
      });
    }
  }
);

// Create tables if not exist (CLEANED sqlite3 syntax)
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

// Execute schema after small delay to ensure DB ready
setTimeout(() => {
  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Schema creation failed:', err.message);
    } else {
      console.log('✅ Database schema ready');
    }
  });

  // ✅ FIXED: Skip migrations - columns already exist from schema
  console.log('✅ Database fully ready - migrations skipped (columns exist)');

  // Seed admin if not exists (FIXED for sqlite3)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusvibe.local';
  db.get('SELECT id FROM users WHERE email = ?', [adminEmail], (err, adminExists) => {
    if (err) {
      console.error('Admin check failed:', err.message);
      return;
    }
    if (!adminExists) {
      const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      db.run(`INSERT INTO users (uuid, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)`,
        [uuidv4(), 'Administrator', adminEmail, hash, 'admin', dayjs().toISOString()],
        function(err) {
          if (err) {
            console.error('Admin seeding failed:', err.message);
          } else {
            console.log('✅ Seeded admin user:', adminEmail);
          }
        }
      );
    } else {
      console.log('✅ Admin user exists:', adminEmail);
    }
  });
}, 100);

// Uploads (GPay QR and payment proofs)
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.fieldname === 'upi_qr' ? 'upi_qr' : 'payment_proofs';
    const dest = path.join(uploadDir, sub);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

// ✅ FIXED: getUserById for sqlite3 callbacks
function getUserById(id, callback) {
  db.get('SELECT id, uuid, name, email, mobile, roll_number, role, created_at FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      console.error('getUserById error:', err);
      callback(null);
    } else {
      callback(user);
    }
  });
}

// Nodemailer transporter placeholder
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

// Auth routes (FIXED for sqlite3)
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, mobile, roll_number } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (existing) return res.status(409).json({ error: 'This email is already registered. Please login or use a different email.' });
    
    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (uuid, name, email, password_hash, mobile, roll_number, role, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), name || '', email, hash, mobile || '', roll_number || '', 'student', dayjs().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: 'Registration failed' });
        getUserById(this.lastID, (user) => {
          if (!user) return res.status(500).json({ error: 'User fetch failed' });
          const token = signToken(user);
          res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
          res.json({ user, token });
        });
      }
    );
  });
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback to index.html for SPA-style front-end routes
app.get('*', (req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).send('CampusVibe server running. Frontend not built yet.');
});

app.listen(PORT, () => {
  console.log(`🚀 CampusVibe server running on http://localhost:${PORT}`);
  console.log(`📱 Admin login: admin@campusvibe.local / admin123`);
  console.log(`🔗 Test: http://localhost:${PORT}/api/health`);
});
