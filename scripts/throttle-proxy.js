/*
  CampusVibe Performance Testing — Throttling Proxy (Part 22)
  -------------------------------------------------------------
  A minimal HTTP proxy that sits in front of the real local server.js and
  simulates network conditions by (a) delaying the first byte of every
  response by a fixed latency, and (b) rate-limiting the response body to a
  fixed bytes/sec ceiling, using the same round-trip-time + throughput
  numbers Chrome DevTools' built-in network presets use. This lets the
  measurement script (performance-tests.js) exercise the real app/server
  code under realistic slow-network conditions without needing a browser
  or an external network (this sandbox only has egress to package
  registries, not to a real cellular network or a CDP-driven browser).

  Profiles (matching Chrome DevTools presets):
    fast4g : 40ms RTT / ~4  Mbps down / ~3  Mbps up
    slow4g : 170ms RTT / ~400 Kbps... actually modeled closer to Lighthouse's
             "Slow 4G": 150ms RTT, 1.6 Mbps down, 750 Kbps up
    slow3g : 400ms RTT, 400 Kbps down, 400 Kbps up (Lighthouse "Slow 3G")
    offline: connection is accepted then immediately reset, simulating a
             request that can never complete — this is what the app's
             offline banner / timeout / error-state logic needs to handle.

  Usage: node scripts/throttle-proxy.js <profile> <listenPort> <targetPort>
*/

const http = require('http');

const PROFILES = {
  fast4g: { rttMs: 40, downKbps: 4000, upKbps: 3000 },
  slow4g: { rttMs: 150, downKbps: 1600, upKbps: 750 },
  slow3g: { rttMs: 400, downKbps: 400, upKbps: 400 },
  offline: { offline: true },
};

const profileName = process.argv[2] || 'fast4g';
const listenPort = parseInt(process.argv[3] || '4000', 10);
const targetPort = parseInt(process.argv[4] || '3000', 10);
const profile = PROFILES[profileName];

if (!profile) {
  console.error(`Unknown profile "${profileName}". Options: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Streams `buf` to `res` in chunks sized so the overall transfer rate
// matches `kbps` (kilobits/sec), independent of how large the payload is.
async function throttledWrite(res, buf, kbps) {
  const bytesPerSecond = (kbps * 1000) / 8;
  const chunkSize = Math.max(256, Math.floor(bytesPerSecond / 10)); // ~100ms worth per chunk
  let offset = 0;
  while (offset < buf.length) {
    const chunk = buf.slice(offset, offset + chunkSize);
    res.write(chunk);
    offset += chunk.length;
    if (offset < buf.length) {
      await sleep(1000 * (chunk.length / bytesPerSecond));
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (profile.offline) {
    // Simulate "no connection" — accept the socket, then hang until the
    // client's own timeout fires, mirroring a real dead connection rather
    // than a fast, honest ECONNREFUSED.
    req.socket.setTimeout(0);
    return; // never respond
  }

  const started = Date.now();
  await sleep(profile.rttMs); // simulate latency before the request even reaches "the network"

  const bodyChunks = [];
  req.on('data', (c) => bodyChunks.push(c));
  req.on('end', async () => {
    const reqBody = Buffer.concat(bodyChunks);
    if (reqBody.length) {
      // Simulate upload throttling for request bodies (proof/QR uploads etc.)
      await sleep(1000 * (reqBody.length * 8) / (profile.upKbps * 1000));
    }

    const upstream = http.request(
      { host: 'localhost', port: targetPort, path: req.url, method: req.method, headers: req.headers },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on('data', (c) => chunks.push(c));
        upstreamRes.on('end', async () => {
          const buf = Buffer.concat(chunks);
          const ttfb = Date.now() - started;
          res.writeHead(upstreamRes.statusCode, {
            ...upstreamRes.headers,
            'x-sim-profile': profileName,
            'x-sim-ttfb-ms': String(ttfb),
          });
          await throttledWrite(res, buf, profile.downKbps);
          res.end();
        });
      }
    );
    upstream.on('error', (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'upstream error', detail: err.message }));
    });
    if (reqBody.length) upstream.write(reqBody);
    upstream.end();
  });
});

server.listen(listenPort, () => {
  console.log(`[throttle-proxy] profile=${profileName} listening on :${listenPort} -> target :${targetPort}`);
});
