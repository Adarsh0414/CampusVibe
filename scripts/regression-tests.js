/*
  CampusVibe Security Regression Tests (Part 8)
  ----------------------------------------------
  Non-destructive, source-local verification that every defensive behavior
  confirmed or restored in Parts 1-7 of SECURITY_AUDIT.md is still in place.
  This talks HTTP to a real local instance of server.js (same approach as
  the live tests already used for the highest-severity findings in Parts
  3, 4, 6 and 7) — never anything outside localhost, and never a real
  attack against a deployed system.

  Usage: node scripts/regression-tests.js
  Exits 0 if every check passes, 1 otherwise, printing a PASS/FAIL line
  per check plus a final summary.
*/

const http = require('http');
const crypto = require('crypto');
require('dotenv').config();

const PORT = process.env.TEST_PORT || 3000;
const HOST = 'localhost';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    fail += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function request({ method, path, body, cookie, headers = {}, raw }) {
  return new Promise((resolve, reject) => {
    const data = raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : null);
    const finalHeaders = Object.assign({}, headers);
    if (cookie) finalHeaders.Cookie = cookie;
    if (data !== null && !finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }
    if (data !== null) finalHeaders['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({ hostname: HOST, port: PORT, path, method, headers: finalHeaders }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text: buf.toString('utf8'), json });
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

function cookieFrom(res) {
  const sc = res.headers['set-cookie'];
  if (!sc) return null;
  const tokenLine = sc.find((c) => c.startsWith('token='));
  if (!tokenLine) return null;
  return tokenLine.split(';')[0];
}

function rawCookieHeaderFrom(res) {
  const sc = res.headers['set-cookie'];
  return sc && sc.find((c) => c.startsWith('token='));
}

function buildMultipart(fields, file) {
  const boundary = '----campusvibeRegressionBoundary' + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    ));
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    ));
    parts.push(file.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, buffer: Buffer.concat(parts) };
}

async function main() {
  console.log('CampusVibe Security Regression Suite (Part 8)\n');

  // A tiny 1x1 PNG, for the valid-upload test.
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  const rand = crypto.randomBytes(4).toString('hex');
  const studentAEmail = `regtest.studentA.${rand}@example.com`;
  const studentBEmail = `regtest.studentB.${rand}@example.com`;
  const orgAEmail = `regtest.orgA.${rand}@example.com`;
  const orgBEmail = `regtest.orgB.${rand}@example.com`;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@campusvibe.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // ---------------------------------------------------------------------
  // Setup: seed a student, two organizer accounts (approved by admin), and
  // grab session cookies for each. This is done through the public API
  // only — no direct DB access — so the setup itself exercises real code.
  // ---------------------------------------------------------------------
  console.log('Setup');

  const studentA = await request({ method: 'POST', path: '/api/auth/register', body: { name: 'Reg Student A', email: studentAEmail, password: 'password123' } });
  const studentACookie = cookieFrom(studentA);
  check('setup: student A registered', studentA.status === 200 && !!studentACookie);

  const studentB = await request({ method: 'POST', path: '/api/auth/register', body: { name: 'Reg Student B', email: studentBEmail, password: 'password123' } });
  const studentBCookie = cookieFrom(studentB);
  check('setup: student B registered', studentB.status === 200 && !!studentBCookie);

  await request({ method: 'POST', path: '/api/auth/register-organizer', body: { name: 'Reg Organizer A', email: orgAEmail, password: 'password123', mobile: '9990000001', reason: 'regression test' } });
  await request({ method: 'POST', path: '/api/auth/register-organizer', body: { name: 'Reg Organizer B', email: orgBEmail, password: 'password123', mobile: '9990000002', reason: 'regression test' } });

  const adminLogin = await request({ method: 'POST', path: '/api/auth/login', body: { email: adminEmail, password: adminPassword } });
  const adminCookie = cookieFrom(adminLogin);
  check('setup: admin logged in', adminLogin.status === 200 && !!adminCookie);

  const apps = await request({ method: 'GET', path: '/api/admin/organizer-applications', cookie: adminCookie });
  const appA = apps.json && apps.json.applications && apps.json.applications.find((a) => a.email === orgAEmail);
  const appB = apps.json && apps.json.applications && apps.json.applications.find((a) => a.email === orgBEmail);
  check('setup: both organizer applications visible to admin', !!appA && !!appB);

  if (appA) await request({ method: 'POST', path: `/api/admin/organizer-applications/${appA.id}/approve`, cookie: adminCookie });
  if (appB) await request({ method: 'POST', path: `/api/admin/organizer-applications/${appB.id}/approve`, cookie: adminCookie });

  const orgALogin = await request({ method: 'POST', path: '/api/auth/login', body: { email: orgAEmail, password: 'password123' } });
  const orgACookie = cookieFrom(orgALogin);
  const orgBLogin = await request({ method: 'POST', path: '/api/auth/login', body: { email: orgBEmail, password: 'password123' } });
  const orgBCookie = cookieFrom(orgBLogin);
  check('setup: both organizer accounts can log in with committee access', orgALogin.json?.user?.role === 'committee' && orgBLogin.json?.user?.role === 'committee');

  // Organizer A creates a capacity-limited, paid event; Organizer B creates their own.
  const createA = await request({
    method: 'POST', path: '/api/events', cookie: orgACookie,
    body: {
      title: 'Reg Test Event A', description: 'desc', category: 'Technical',
      start_time: new Date(Date.now() + 86400000).toISOString(), location: 'Hall A',
      capacity: 1, price_single_cents: 10000, allowed_tiers: 'single', status: 'published', visibility: 'public'
    }
  });
  const eventA = createA.json && createA.json.event;
  check('setup: organizer A created event A', createA.status === 200 && !!eventA);

  const createB = await request({
    method: 'POST', path: '/api/events', cookie: orgBCookie,
    body: {
      title: 'Reg Test Event B', description: 'desc', category: 'Technical',
      start_time: new Date(Date.now() + 86400000).toISOString(), location: 'Hall B',
      capacity: 5, price_single_cents: 0, allowed_tiers: 'single', status: 'published', visibility: 'public'
    }
  });
  const eventB = createB.json && createB.json.event;
  check('setup: organizer B created event B', createB.status === 200 && !!eventB);

  // Student A registers for (and pays into) event A, to get a real ticket
  // for the ownership tests below.
  let ticketA = null;
  if (eventA) {
    const reg = await request({
      method: 'POST', path: `/api/events/${eventA.uuid}/register`, cookie: studentACookie,
      body: { participants: [{ name: 'Reg Student A' }], ticket_type: 'single' }
    });
    // Event A is priced, so a successful registration returns
    // { requires_payment: true, ticket_uuid, ... } rather than { ticket }.
    ticketA = reg.json && reg.json.ticket_uuid ? { uuid: reg.json.ticket_uuid } : null;
    check('setup: student A registered for event A', reg.status === 200 && !!ticketA);
    if (ticketA) {
      const proof = await request({
        method: 'POST', path: '/api/payments/proof', cookie: studentACookie,
        body: { ticket_uuid: ticketA.uuid, txn_id: 'REGTEST-TXN-1' }
      });
      check('setup: student A submitted payment proof for event A', proof.status === 200);
    }
  }

  // =======================================================================
  console.log('\nPart 2/3: Authentication & Authorization — server-side enforcement');
  // =======================================================================

  const noAuthMe = await request({ method: 'GET', path: '/api/auth/me' });
  check('unauthenticated /api/auth/me is rejected (401)', noAuthMe.status === 401);

  const noAuthCreate = await request({ method: 'POST', path: '/api/events', body: { title: 'x' } });
  check('unauthenticated event creation is rejected (401)', noAuthCreate.status === 401);

  const noAuthAdmin = await request({ method: 'GET', path: '/api/admin/organizer-applications' });
  check('unauthenticated admin endpoint is rejected (401)', noAuthAdmin.status === 401);

  const badToken = await request({ method: 'GET', path: '/api/auth/me', headers: { Cookie: 'token=not-a-real-jwt' } });
  check('forged/garbage auth token is rejected (401)', badToken.status === 401);

  const studentCreate = await request({
    method: 'POST', path: '/api/events', cookie: studentACookie,
    body: { title: 'x', category: 'Technical', start_time: new Date().toISOString(), location: 'y' }
  });
  check('a plain student cannot create an event (403, role check is server-side)', studentCreate.status === 403);

  const studentAdmin = await request({ method: 'GET', path: '/api/admin/organizer-applications', cookie: studentACookie });
  check('a plain student cannot reach admin endpoints (403/401)', [401, 403].includes(studentAdmin.status));

  const orgOnAdmin = await request({ method: 'GET', path: '/api/admin/organizer-applications', cookie: orgACookie });
  check('a non-admin organizer cannot reach admin endpoints (403)', orgOnAdmin.status === 403);

  // =======================================================================
  console.log('\nPart 3: Authorization & Ownership (IDOR/BOLA) — SEC-010/011/012 + event/payment ownership');
  // =======================================================================

  if (eventA) {
    const crossEdit = await request({
      method: 'PUT', path: `/api/events/${eventA.uuid}`, cookie: orgBCookie,
      body: { title: 'hijacked', category: 'Technical', start_time: eventA.start_time, location: 'x' }
    });
    check('organizer B cannot edit organizer A\'s event (403)', crossEdit.status === 403);

    const crossDelete = await request({ method: 'DELETE', path: `/api/events/${eventA.uuid}`, cookie: orgBCookie });
    check('organizer B cannot delete organizer A\'s event (403)', crossDelete.status === 403);

    // Confirm event A is genuinely untouched after the attempted cross-tenant attack.
    const stillThere = await request({ method: 'GET', path: `/api/events/${eventA.uuid}` });
    check('event A survives the attempted cross-tenant edit/delete, title unchanged', stillThere.status === 200 && stillThere.json?.event?.title === 'Reg Test Event A');
  }

  // Fetch event A's numeric internal id via organizer A's own "my events"
  // list (never exposed on the public endpoint — see SEC-017 check below).
  const myEventsA = await request({ method: 'GET', path: '/api/organizer/my-events', cookie: orgACookie });
  const myEventARow = myEventsA.json && myEventsA.json.events && myEventsA.json.events.find((e) => e.uuid === eventA?.uuid);
  const eventAId = myEventARow && myEventARow.id;
  check('setup: resolved event A\'s internal numeric id via its owner', !!eventAId);

  if (eventAId) {
    const crossManual = await request({
      method: 'POST', path: '/api/attendance/manual', cookie: orgBCookie,
      body: { event_id: eventAId, user_id: 1, present: true }
    });
    check('SEC-010 stays fixed: organizer B cannot mark attendance on organizer A\'s event (403)', crossManual.status === 403);

    const crossExport = await request({ method: 'GET', path: `/api/attendance/${eventAId}/export`, cookie: orgBCookie });
    check('SEC-011 stays fixed: organizer B cannot export organizer A\'s attendee list (403)', crossExport.status === 403);

    const crossImport = await request({
      method: 'POST', path: `/api/attendance/${eventAId}/import`, cookie: orgBCookie,
      body: { attendance: [{ user_id: 1, present: 1 }] }
    });
    check('SEC-012 stays fixed: organizer B cannot wipe/overwrite organizer A\'s attendance (403)', crossImport.status === 403);

    // Confirm the attack genuinely didn't write anything, using the legitimate owner's view.
    const legitExport = await request({ method: 'GET', path: `/api/attendance/${eventAId}/export`, cookie: orgACookie });
    const hasForeignRow = legitExport.json && legitExport.json.attendance && legitExport.json.attendance.some((r) => r.user_id === 1);
    check('attempted SEC-012 attack left no attendance rows behind', legitExport.status === 200 && !hasForeignRow);
  }

  if (ticketA) {
    const crossApprove = await request({ method: 'POST', path: `/api/organizer/payments/${ticketA.uuid}/approve`, cookie: orgBCookie });
    check('organizer B cannot approve a payment on organizer A\'s event (403)', crossApprove.status === 403);

    const crossReject = await request({ method: 'POST', path: `/api/organizer/payments/${ticketA.uuid}/reject`, cookie: orgBCookie, body: { reason: 'nope' } });
    check('organizer B cannot reject a payment on organizer A\'s event (403)', crossReject.status === 403);

    const crossProof = await request({
      method: 'POST', path: '/api/payments/proof', cookie: studentBCookie,
      body: { ticket_uuid: ticketA.uuid, txn_id: 'HIJACK-TXN' }
    });
    check('student B cannot submit payment proof for student A\'s ticket (403)', crossProof.status === 403);

    // The legitimate owner can still act on their own ticket after all the attacks above.
    const legitApprove = await request({ method: 'POST', path: `/api/organizer/payments/${ticketA.uuid}/approve`, cookie: orgACookie });
    check('organizer A (the real owner) can still approve their own ticket', legitApprove.status === 200);
  }

  // =======================================================================
  console.log('\nPart 1/4: Input Validation & Business-Logic Guards');
  // =======================================================================

  if (eventB) {
    const badTier = await request({
      method: 'POST', path: `/api/events/${eventB.uuid}/register`, cookie: studentBCookie,
      body: { participants: [{ name: 'x' }], ticket_type: 'not-a-real-tier' }
    });
    check('SEC-001 stays fixed: an unrecognized ticket_type is rejected, not silently free (400)', badTier.status === 400);

    const tooManyParticipants = await request({
      method: 'POST', path: `/api/events/${eventB.uuid}/register`, cookie: studentBCookie,
      body: { participants: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }], ticket_type: 'single' }
    });
    check('SEC-003 stays fixed: more than the max participants is rejected (400)', tooManyParticipants.status === 400);
  }

  const negativeCapacity = await request({
    method: 'POST', path: '/api/events', cookie: orgACookie,
    body: { title: 'neg', category: 'Technical', start_time: new Date().toISOString(), location: 'x', capacity: -5 }
  });
  check('SEC-002 stays fixed: negative capacity is rejected (400)', negativeCapacity.status === 400);

  // =======================================================================
  console.log('\nPart 4: Seat-Capacity Race Guard (structural check — full concurrency test lives in SEC-013 verification)');
  // =======================================================================
  if (eventA) {
    // Event A had capacity 1 and is already fully booked by student A above.
    const overCapacity = await request({
      method: 'POST', path: `/api/events/${eventA.uuid}/register`, cookie: studentBCookie,
      body: { participants: [{ name: 'Reg Student B' }], ticket_type: 'single' }
    });
    check('a fully-booked event correctly rejects a further registration (409)', overCapacity.status === 409);
  }

  // =======================================================================
  console.log('\nPart 5: Data Exposure & Error Handling');
  // =======================================================================

  if (eventA) {
    const publicView = await request({ method: 'GET', path: `/api/events/${eventA.uuid}` });
    const ev = publicView.json && publicView.json.event;
    check('SEC-017 stays fixed: public event endpoint has no internal numeric id', publicView.status === 200 && ev && ev.id === undefined);
    check('SEC-017 stays fixed: public event endpoint has no bank/UPI fields', ev && ev.bank_account_no === undefined && ev.upi_id === undefined && ev.upi_qr_url === undefined);
  }

  const listView = await request({ method: 'GET', path: '/api/events?limit=100' });
  const listedA = listView.json && listView.json.events && listView.json.events.find((e) => e.uuid === eventA?.uuid);
  check('SEC-027 fixed: public event LIST endpoint has no internal numeric id', listView.status === 200 && !!listedA && listedA.id === undefined);

  const dupEmail = await request({ method: 'POST', path: '/api/auth/register', body: { name: 'x', email: studentAEmail, password: 'password123' } });
  check('SEC-016 stays fixed: duplicate-email registration returns a clean message, not raw DB text', dupEmail.status === 409 && /already registered/i.test(dupEmail.json?.error || '') && !/SQLITE/i.test(dupEmail.json?.error || ''));

  const malformed = await request({ method: 'POST', path: '/api/auth/login', raw: '{"email": "a@b.com", "password": ', headers: { 'Content-Type': 'application/json' } });
  check('SEC-018 stays fixed: malformed JSON returns a generic 400, not a stack trace', malformed.status === 400 && /^\s*\{/.test(malformed.text) && !/at\s+\S+\s+\(/.test(malformed.text) && !malformed.text.includes(__dirname));

  // =======================================================================
  console.log('\nPart 6: Injection, XSS, CSRF & CORS');
  // =======================================================================

  const injectionAttempt = await request({ method: 'GET', path: `/api/events?category=${encodeURIComponent("Technical' OR '1'='1")}` });
  check('SQL-injection-shaped query param does not error the server (parameterized queries hold)', injectionAttempt.status === 200);

  const foreignOrigin = await request({ method: 'GET', path: '/api/health', headers: { Origin: 'https://evil-attacker.example' } });
  check('SEC-022 stays fixed: an untrusted cross-origin request gets no CORS allow-origin header', !foreignOrigin.headers['access-control-allow-origin']);

  if (eventA) {
    const png = buildMultipart({}, { field: 'upi_qr', filename: 'qr.png', contentType: 'image/png', data: PNG_1PX });
    const goodUpload = await request({
      method: 'PUT', path: `/api/events/${eventA.uuid}/payment-setup`, cookie: orgACookie,
      raw: png.buffer, headers: { 'Content-Type': `multipart/form-data; boundary=${png.boundary}` }
    });
    check('a genuine PNG upload to the QR endpoint is accepted', goodUpload.status === 200);

    const svg = buildMultipart({}, { field: 'upi_qr', filename: 'evil.svg', contentType: 'image/svg+xml', data: Buffer.from('<svg onload="alert(1)"></svg>') });
    const badUpload = await request({
      method: 'PUT', path: `/api/events/${eventA.uuid}/payment-setup`, cookie: orgACookie,
      raw: svg.buffer, headers: { 'Content-Type': `multipart/form-data; boundary=${svg.boundary}` }
    });
    check('SEC-021 stays fixed: a disguised SVG/script upload to the QR endpoint is rejected (400)', badUpload.status === 400);

    const html = buildMultipart({}, { field: 'upi_qr', filename: 'evil.html', contentType: 'text/html', data: Buffer.from('<script>alert(1)</script>') });
    const badUpload2 = await request({
      method: 'PUT', path: `/api/events/${eventA.uuid}/payment-setup`, cookie: orgACookie,
      raw: html.buffer, headers: { 'Content-Type': `multipart/form-data; boundary=${html.boundary}` }
    });
    check('SEC-021 stays fixed: an HTML upload to the QR endpoint is rejected (400)', badUpload2.status === 400);
  }

  const cookieHeader = rawCookieHeaderFrom(studentA);
  check('auth cookie is HttpOnly', !!cookieHeader && /HttpOnly/i.test(cookieHeader));
  check('auth cookie is SameSite=Lax', !!cookieHeader && /SameSite=Lax/i.test(cookieHeader));

  const csp = await request({ method: 'GET', path: '/' });
  check('helmet CSP header is present', !!csp.headers['content-security-policy']);

  // =======================================================================
  console.log('\nPart 7: Rate Limiting & Abuse Prevention');
  // =======================================================================

  // Chatbot limiter is configured for 20 req / 15 min. Fire 22 unauthenticated
  // requests and confirm at least one gets rate-limited (429) before the cap.
  let chatbot429 = false;
  for (let i = 0; i < 22 && !chatbot429; i++) {
    const r = await request({ method: 'POST', path: '/api/chatbot', body: { message: 'hi' } });
    if (r.status === 429) chatbot429 = true;
  }
  check('SEC-024 stays fixed: the chatbot endpoint enforces a dedicated rate limit', chatbot429);

  // Registration limiter is configured for 20 req / 15 min per IP, shared
  // across /api/events/:uuid/register and /api/payments/proof.
  let registration429 = false;
  if (eventB) {
    for (let i = 0; i < 22 && !registration429; i++) {
      const r = await request({
        method: 'POST', path: `/api/events/${eventB.uuid}/register`, cookie: studentBCookie,
        body: { participants: [{ name: `Bulk ${i}` }], ticket_type: 'single' }
      });
      if (r.status === 429) registration429 = true;
    }
  }
  check('SEC-025 stays fixed: registration enforces a dedicated rate limit (seat-squatting guard)', registration429);

  // =======================================================================
  console.log('\nFinal Validation: existing app functionality is unaffected by the fixes');
  // =======================================================================

  const health = await request({ method: 'GET', path: '/api/health' });
  check('server is up and healthy', health.status === 200 && health.json?.ok === true);

  const legitLogin = await request({ method: 'POST', path: '/api/auth/login', body: { email: studentAEmail, password: 'password123' } });
  check('a legitimate login still succeeds', legitLogin.status === 200 && !!cookieFrom(legitLogin));

  const eventsList = await request({ method: 'GET', path: '/api/events' });
  check('public event listing still works', eventsList.status === 200 && Array.isArray(eventsList.json?.events));

  const myTickets = await request({ method: 'GET', path: '/api/my-tickets', cookie: studentACookie });
  check('an authenticated user can still list their own tickets', myTickets.status === 200 && Array.isArray(myTickets.json?.tickets));

  const legitAnalytics = await request({ method: 'GET', path: `/api/analytics/events/${eventA?.uuid}`, cookie: orgACookie });
  check('the legitimate event owner can still view their own analytics', legitAnalytics.status === 200);

  // ---------------------------------------------------------------------
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log('\nFailed checks:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Regression suite crashed:', e);
  process.exitCode = 1;
});
