// One-off verification helper (mirrors the accessibility project's approach):
// extracts every inline <script>...</script> block from every HTML page in
// public/ and syntax-checks it with `node --check`-equivalent (new
// vm.Script) so a security fix that touched inline JS can't silently break
// a page without a build step catching it. Not part of the app itself.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicDir = path.join(__dirname, '..', 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

let totalBlocks = 0;
let failures = 0;

for (const file of htmlFiles) {
  const full = path.join(publicDir, file);
  const html = fs.readFileSync(full, 'utf8');
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 0;
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = match[1];
    const code = match[2];
    if (/\bsrc\s*=/.test(attrs)) continue; // external file, not inline
    // Non-JS payload blocks (JSON-LD structured data, etc.) aren't script to check.
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    if (typeMatch && !/javascript|^module$|^text\/ecmascript$/i.test(typeMatch[1])) continue;
    idx += 1;
    if (!code.trim()) continue;
    totalBlocks += 1;
    try {
      new vm.Script(code, { filename: `${file}#inline-${idx}` });
    } catch (e) {
      failures += 1;
      console.error(`SYNTAX ERROR in ${file} inline script #${idx}: ${e.message}`);
    }
  }
}

console.log(`Checked ${totalBlocks} inline <script> blocks across ${htmlFiles.length} HTML files.`);
if (failures > 0) {
  console.error(`${failures} block(s) failed to parse.`);
  process.exit(1);
} else {
  console.log('All inline scripts parse cleanly.');
}
