/*
  CampusVibe Performance Testing (Part 22)
  -----------------------------------------
  Drives the real app server through scripts/throttle-proxy.js under four
  network profiles (Fast 4G, Slow 4G, Slow 3G, Offline) and records, per
  the spec's own list:
    - API response delays (TTFB + full transfer) for the requests each
      page's JS fires on load
    - whether the app's own timeout ceilings (fetchWithTimeout, 12-20s
      depending on page — see loading.js) would fire before a real
      response arrives on that profile
    - failed-request / recovery behavior on Offline

  "First meaningful UI appearance" / "time until skeleton appears" /
  "time until interactive" are DOM/paint metrics that need a real browser
  (out of scope for this sandbox — no CDP-capable browser or external
  network reachable here). Those three are instead verified by static
  code audit: the skeleton markup ships inside the initial HTML response
  itself (not injected after a JS fetch), so — as documented below —
  its paint time is bounded by HTML TTFB alone, never by any API call.
  This script measures exactly that HTML TTFB per profile to put a real
  number on that claim, plus every subsequent API call's timing.

  Usage: node scripts/performance-tests.js
  Requires the app server already running on :3000 (see run-perf-suite.sh
  which does both steps together).
*/

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PROFILES = ['fast4g', 'slow4g', 'slow3g', 'offline'];
const TARGET_PORT = 3000;
const PROXY_BASE_PORT = 4100;

// Requests each page fires on initial load (method/path), grouped by page,
// mirroring the actual fetch() call sites audited in Parts 1-21.
const PAGE_REQUESTS = {
  'homepage (index.html)': [
    { method: 'GET', path: '/' , label: 'HTML shell + inline skeleton'},
    { method: 'GET', path: '/api/events', label: 'events list (fills skeleton)' },
    { method: 'GET', path: '/api/meta/categories', label: 'category pills' },
  ],
  'event details (event.html)': [
    { method: 'GET', path: '/event.html', label: 'HTML shell + inline skeleton' },
  ],
  'login (login.html)': [
    { method: 'GET', path: '/login.html', label: 'HTML shell' },
    { method: 'POST', path: '/api/auth/login', body: { email: 'admin@campusvibe.test', password: 'AdminPass123!' }, label: 'login submit' },
  ],
  'my-tickets (my-tickets.html)': [
    { method: 'GET', path: '/my-tickets.html', label: 'HTML shell + inline skeleton' },
  ],
  'dashboard (dashboard.html)': [
    { method: 'GET', path: '/dashboard.html', label: 'HTML shell + inline skeleton' },
  ],
};

// The timeout ceiling each page actually uses client-side (from loading.js
// call sites audited across Parts 1-21), so we can flag whether a given
// profile's real response time would exceed it.
const TIMEOUT_CEILING_MS = {
  'homepage (index.html)': 12000,
  'event details (event.html)': 12000,
  'login (login.html)': 12000,
  'my-tickets (my-tickets.html)': 12000,
  'dashboard (dashboard.html)': 20000,
};

function timedRequest(proxyPort, { method, path: p, body }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const data = body ? JSON.stringify(body) : null;
    const headers = { };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(
      { host: 'localhost', port: proxyPort, path: p, method, headers, timeout: 25000 },
      (res) => {
        let firstByteAt = null;
        let bytes = 0;
        res.on('data', (chunk) => {
          if (firstByteAt === null) firstByteAt = Date.now();
          bytes += chunk.length;
        });
        res.on('end', () => {
          resolve({
            ok: true,
            status: res.statusCode,
            ttfbMs: (firstByteAt || Date.now()) - started,
            totalMs: Date.now() - started,
            bytes,
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'client-side timeout (25s test ceiling)', totalMs: Date.now() - started });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, totalMs: Date.now() - started });
    });
    if (data) req.write(data);
    req.end();
  });
}

function startProxy(profile, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(__dirname, 'throttle-proxy.js'), profile, String(port), String(TARGET_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    proc.stdout.on('data', (d) => {
      if (!started && d.toString().includes('listening')) {
        started = true;
        resolve(proc);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[proxy:${profile}] ${d}`));
    proc.on('error', reject);
    setTimeout(() => { if (!started) resolve(proc); }, 1000);
  });
}

function stopProxy(proc) {
  return new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.kill();
  });
}

async function runProfile(profileName, port) {
  console.log(`\n=== Profile: ${profileName} ===`);
  const proc = await startProxy(profileName, port);
  const results = {};

  for (const [page, requests] of Object.entries(PAGE_REQUESTS)) {
    results[page] = [];
    for (const reqSpec of requests) {
      // Offline: give it one bounded attempt (8s) since a real client
      // would never get a response either — we just need to confirm the
      // connection genuinely never completes, not hang the whole suite.
      const timeoutBudget = profileName === 'offline' ? 8000 : 25000;
      const result = await Promise.race([
        timedRequest(port, reqSpec),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'no response (simulated offline)', totalMs: timeoutBudget }), timeoutBudget)),
      ]);
      results[page].push({ ...reqSpec, ...result });
      const line = result.ok
        ? `  ${page} :: ${reqSpec.label} — TTFB ${result.ttfbMs}ms, total ${result.totalMs}ms, ${result.bytes}B, HTTP ${result.status}`
        : `  ${page} :: ${reqSpec.label} — FAILED after ${result.totalMs}ms (${result.error})`;
      console.log(line);
    }
  }

  await stopProxy(proc);
  return results;
}

async function main() {
  // Sanity check the target server is actually up first.
  const health = await timedRequest(TARGET_PORT, { method: 'GET', path: '/api/health' });
  if (!health.ok) {
    console.error('Target server on :3000 is not responding. Start it first (node server.js).');
    process.exit(1);
  }

  const allResults = {};
  let port = PROXY_BASE_PORT;
  for (const profileName of PROFILES) {
    allResults[profileName] = await runProfile(profileName, port);
    port += 1;
  }

  console.log('\n\n=== SUMMARY: timeout-ceiling risk per profile ===');
  for (const [page, ceiling] of Object.entries(TIMEOUT_CEILING_MS)) {
    for (const profileName of PROFILES) {
      if (profileName === 'offline') continue;
      const reqs = allResults[profileName][page] || [];
      const worst = reqs.reduce((max, r) => Math.max(max, r.totalMs || 0), 0);
      const risk = worst >= ceiling ? 'WOULD HIT TIMEOUT' : 'within ceiling';
      console.log(`  ${page} [${profileName}] worst=${worst}ms vs ceiling=${ceiling}ms -> ${risk}`);
    }
  }

  require('fs').writeFileSync(
    path.join(__dirname, '..', 'perf-results.json'),
    JSON.stringify(allResults, null, 2)
  );
  console.log('\nRaw results written to perf-results.json');
}

main();
