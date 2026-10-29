import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/dashboard');
assert.equal(manifest.lang, 'ko');
for (const icon of manifest.icons) {
  const bytes = await readFile(`dist${icon.src}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
assert.ok((await stat('dist/sw.js')).size > 0);
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /manifest.webmanifest/);
assert.match(html, /apple-touch-icon/);
console.log(
  'PWA: manifest, 3 icon dimensions, maskable icon, service worker and HTML links verified.',
);
