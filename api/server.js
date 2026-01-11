/*
  CampusVibe Server (Vercel Edition)
  Tagline: "Ideal Management, Ideal Moments"

  ✔ Vercel-compatible
  ✔ No filesystem
  ✔ No SQLite
  ✔ Uses @vercel/kv (Redis)
*/

const serverless = require('serverless-http');

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { kv } = require('@vercel/kv');

const app = express();

/* ================= CONFIG ================= */

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_SECRET';
const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || JWT_SECRET;

/* ================= MIDDLEWARE ================= */

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

/* ================= HELPERS ================= */

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const token =
    req.cookies.token ||
    (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

/* ================= KV HELPERS ================= */
/*
  Data model (Redis keys):

  user:{id}
  user:email:{email}

  event:{uuid}
  event:list

  ticket:{uuid}
  ticket:user:{userId}

  attendance:{eventUuid}
*/

async function getUserById(id) {
  return kv.get(`user:${id}`);
}

/* ================= SEED ADMIN ================= */

(async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@campusvibe.local';
  const existing = await kv.get(`user:email:${email}`);
  if (!existing) {
    const id = uuidv4();
    const user = {
      id,
      name: 'Administrator',
      email,
      password_hash: bcrypt.hashSync(
        process.env.ADMIN_PASSWORD || 'admin123',
        10
      ),
      role: 'admin',
      created_at: dayjs().toISOString()
    };
    await kv.set(`user:${id}`, user);
    await kv.set(`user:email:${email}`, id);
    console.log('Seeded admin:', email);
  }
})();

/* ================= AUTH ================= */

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email & password required' });

  if (await kv.get(`user:email:${email}`))
    return res.status(409).json({ error: 'Email already registered' });

  const id = uuidv4();
  const user = {
    id,
    name: name || '',
    email,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'student',
    created_at: dayjs().toISOString()
  };

  await kv.set(`user:${id}`, user);
  await kv.set(`user:email:${email}`, id);

  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user: { ...user, password_hash: undefined }, token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const id = await kv.get(`user:email:${email}`);
  if (!id) return res.status(401).json({ error: 'Invalid credentials' });

  const user = await kv.get(`user:${id}`);
  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user: { ...user, password_hash: undefined }, token });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await getUserById(req.user.id);
  res.json({ user: { ...user, password_hash: undefined } });
});

/* ================= EVENTS ================= */

app.post(
  '/api/events',
  authRequired,
  roleRequired('committee', 'admin'),
  async (req, res) => {
    const uuid = uuidv4();
    const event = {
      uuid,
      ...req.body,
      created_by: req.user.id,
      created_at: dayjs().toISOString()
    };
    await kv.set(`event:${uuid}`, event);
    await kv.sadd('event:list', uuid);
    res.json({ event });
  }
);

app.get('/api/events', async (req, res) => {
  const ids = await kv.smembers('event:list');
  const events = await Promise.all(ids.map(id => kv.get(`event:${id}`)));
  res.json({ events: events.filter(Boolean) });
});

app.get('/api/events/:uuid', async (req, res) => {
  const event = await kv.get(`event:${req.params.uuid}`);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

/* ================= TICKETS ================= */

app.post('/api/events/:uuid/register', authRequired, async (req, res) => {
  const event = await kv.get(`event:${req.params.uuid}`);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const ticketUuid = uuidv4();
  const base = `${ticketUuid}|${event.uuid}|${req.user.id}`;
  const sig = crypto
    .createHmac('sha256', QR_SIGNING_SECRET)
    .update(base)
    .digest('hex');

  const qr = await QRCode.toDataURL(
    JSON.stringify({
      ticket_uuid: ticketUuid,
      event_uuid: event.uuid,
      user_id: req.user.id,
      sig
    })
  );

  const ticket = {
    uuid: ticketUuid,
    user_id: req.user.id,
    event_uuid: event.uuid,
    qr_code: qr,
    payment_status: 'paid',
    checked_in: false,
    created_at: dayjs().toISOString()
  };

  await kv.set(`ticket:${ticketUuid}`, ticket);
  await kv.sadd(`ticket:user:${req.user.id}`, ticketUuid);

  res.json({ ticket });
});

app.get('/api/tickets', authRequired, async (req, res) => {
  const ids = await kv.smembers(`ticket:user:${req.user.id}`);
  const tickets = await Promise.all(ids.map(id => kv.get(`ticket:${id}`)));
  res.json({ tickets: tickets.filter(Boolean) });
});

/* ================= ATTENDANCE ================= */

app.post(
  '/api/attendance/scan',
  authRequired,
  roleRequired('committee', 'admin'),
  async (req, res) => {
    const { code } = req.body;
    const payload = JSON.parse(code);

    const base = `${payload.ticket_uuid}|${payload.event_uuid}|${payload.user_id}`;
    const sig = crypto
      .createHmac('sha256', QR_SIGNING_SECRET)
      .update(base)
      .digest('hex');

    if (sig !== payload.sig)
      return res.status(400).json({ error: 'Invalid QR' });

    const ticket = await kv.get(`ticket:${payload.ticket_uuid}`);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    ticket.checked_in = true;
    await kv.set(`ticket:${ticket.uuid}`, ticket);

    await kv.rpush(`attendance:${payload.event_uuid}`, {
      ticket_uuid: ticket.uuid,
      user_id: ticket.user_id,
      timestamp: dayjs().toISOString()
    });

    res.json({ ok: true });
  }
);

/* ================= HEALTH ================= */

app.get('/api/health', (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

/* ================= EXPORT ================= */

module.exports = serverless(app);
