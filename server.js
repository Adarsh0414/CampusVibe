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

// 🔧 FIX: Get single public event by UUID (prevents HTML fallback)
// ✅ FIX: List public events (prevents /api/events 404)
app.get('/api/events', (req, res) => {
  db.all(
    `
    SELECT 
      id, uuid, title, description, start_time, end_time,
      location, capacity, price_cents, status
    FROM events
    WHERE visibility = 'public'
    ORDER BY start_time ASC
    LIMIT 50
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ events: rows });
    }
  );
});
app.get('/api/events/:uuid', (req, res) => {
  const { uuid } = req.params;

  db.get(
    `
    SELECT e.*,
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) AS sold
    FROM events e
    WHERE e.uuid = ? AND e.visibility = 'public'
    `,
    [uuid],
    (err, event) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!event) return res.status(404).json({ error: 'Event not found' });

      event.remaining = event.capacity
        ? Math.max(0, event.capacity - (event.sold || 0))
        : null;

      res.json({ event });
    }
  );
});

// ✅ CREATE EVENT (FIXES POST /api/events JSON ERROR)
app.post('/api/events', authRequired, (req, res) => {
  const {
    title,
    description,
    category,
    start_time,
    end_time,
    location,
    capacity
  } = req.body;

  if (!title || !start_time) {
    return res.status(400).json({ error: 'Title and start time required' });
  }

  const eventUuid = uuidv4();

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
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      eventUuid,
      title,
      description || '',
      category || '',
      start_time,
      end_time || null,
      location || '',
      capacity || null,
      req.user.id,
      'published',
      'public',
      dayjs().toISOString()
    ],
    function (err) {
      if (err) {
        console.error('Event creation failed:', err);
        return res.status(500).json({ error: 'Failed to create event' });
      }

      res.json({
        ok: true,
        event: {
          uuid: eventUuid
        }
      });
    }
  );
});

// 🔒 EVENT REGISTRATION (FINAL GUARANTEED ROUTE)
app.post('/api/events/:uuid/register', authRequired, (req, res) => {
  const { uuid } = req.params;
  const { participants } = req.body;

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'Participants required' });
  }

  db.get('SELECT id FROM events WHERE uuid = ?', [uuid], (err, event) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const ticketUuid = crypto.randomUUID();

    db.run(
      `INSERT INTO tickets (uuid, user_id, event_id, participants_json, created_at, payment_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ticketUuid,
        req.user.id,
        event.id,
        JSON.stringify(participants),
        dayjs().toISOString(),
        'paid'
      ],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Registration failed' });
        }

        res.json({
          ok: true,
          ticket: { uuid: ticketUuid }
        });
      }
    );
  });
});

// ===============================
// DELETE EVENT (Organizer / Admin)
// ===============================
app.delete('/api/events/:uuid', authRequired, (req, res) => {
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
app.get('/api/organizer/my-events', authRequired, (req, res) => {
  const activeOnly = req.query.active_only === '1';

  let query = `
    SELECT 
      e.id,
      e.uuid,
      e.title,
      e.start_time,
      e.end_time,
      e.location,
      e.status,
      e.visibility
    FROM events e
    JOIN users u ON e.created_by = u.id
    WHERE u.email = ?
  `;

  const params = [req.user.email];

  if (activeOnly) {
    query += ` AND (e.end_time IS NULL OR datetime(e.end_time) >= datetime('now'))`;
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
// GET TICKET BY UUID (PRINT VIEW)
// ===============================
app.get('/api/tickets/:uuid', authRequired, (req, res) => {
  const { uuid } = req.params;

  db.get(
    `
    SELECT 
      t.uuid,
      t.created_at,
      t.participants_json,
      e.title AS event_title,
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

// ===============================
// MY TICKETS (Logged-in user)
// ===============================
app.get('/api/my-tickets', authRequired, (req, res) => {
  db.all(
    `
    SELECT
      t.uuid,
      t.created_at,
      t.payment_status,
      t.checked_in,
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