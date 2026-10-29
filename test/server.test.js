// The review server, end to end: a real serve.mjs on a copy of the demo project, driven over HTTP.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { demoCopy, serve } from './helpers.js';

let dir;
let srv;
before(async () => {
  dir = demoCopy();
  srv = await serve(dir);
});
after(() => {
  srv?.stop();
  rmSync(dir, { recursive: true, force: true });
});

const api = (path, init = {}) => fetch(srv.url + path, init);
const json = (body) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const copyOnDisk = () => JSON.parse(readFileSync(join(dir, '.copyproof', 'copy.json'), 'utf8'));
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('serves the page, its script, the shared core and the fonts', async () => {
  const page = await api('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /<title>Copyproof<\/title>/);
  for (const path of ['/app.js', '/styles.css', '/lib/core.js', '/fonts/overpass-latin-wght-normal.woff2']) {
    assert.equal((await api(path)).status, 200, path);
  }
  assert.equal((await api('/nope')).status, 404);
});

test('state has the copy, empty feedback, and the screenshots by screen slug', async () => {
  const state = await (await api('/api/state')).json();
  assert.equal(state.copy.items.length, 16);
  assert.deepEqual(state.feedback, { version: 1, items: {} });
  assert.deepEqual(Object.keys(state.screenshots).sort(), ['checkout', 'inbox']);
  assert.equal(state.screenshots.checkout, '.copyproof/screenshots/checkout.png');
  assert.ok(state.screenshotTimes.checkout);
});

test('refuses requests for another host name (DNS rebinding)', async () => {
  // fetch won't let us set Host, so talk HTTP directly.
  const { request } = await import('node:http');
  const status = await new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: srv.port, path: '/api/state', headers: { host: 'evil.example' } }, (res) => ok(res.statusCode));
    req.on('error', fail);
    req.end();
  });
  assert.equal(status, 403);
});

test('refuses writes from another origin', async () => {
  const res = await api('/api/voice', { method: 'PUT', headers: { origin: 'https://evil.example' }, body: 'pwned' });
  assert.equal(res.status, 403);
  assert.equal(existsSync(join(dir, '.copyproof', 'voice.md')), false);
  const same = await api('/api/voice', { method: 'PUT', headers: { origin: srv.url }, body: 'Plain and warm.' });
  assert.equal(same.status, 200);
  assert.equal(readFileSync(join(dir, '.copyproof', 'voice.md'), 'utf8'), 'Plain and warm.');
});

test('saves feedback, and refuses a save from a page that loaded an older scan', async () => {
  const { scannedAt } = copyOnDisk();
  const body = { version: 1, items: { e39393f6c7: { rating: 1, comment: 'Say what happened' } } };
  const ok = await api('/api/feedback', { method: 'PUT', ...json(body), headers: { 'content-type': 'application/json', 'x-scanned-at': scannedAt } });
  assert.equal(ok.status, 200);
  const saved = JSON.parse(readFileSync(join(dir, '.copyproof', 'feedback.json'), 'utf8'));
  assert.equal(saved.items.e39393f6c7.rating, 1);
  assert.ok(saved.savedAt);

  const stale = await api('/api/feedback', { method: 'PUT', body: JSON.stringify({ items: {} }), headers: { 'x-scanned-at': '2000-01-01T00:00:00.000Z' } });
  assert.equal(stale.status, 409);
  assert.equal(JSON.parse(readFileSync(join(dir, '.copyproof', 'feedback.json'), 'utf8')).items.e39393f6c7.rating, 1);

  assert.equal((await api('/api/feedback', { method: 'PUT', body: '{"nope":1}' })).status, 400);
});

test('box positions must be fractions of the screenshot; null clears one', async () => {
  const bad = await api('/api/box/a9faf697b2', { method: 'PUT', ...json({ x: 0.1, y: 0.2, w: 2, h: 0.1 }) });
  assert.equal(bad.status, 400);
  assert.equal((await api('/api/box/0000000000', { method: 'PUT', ...json({ x: 0, y: 0, w: 0.1, h: 0.1 }) })).status, 404);

  const good = await api('/api/box/a9faf697b2', { method: 'PUT', ...json({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }) });
  assert.equal(good.status, 200);
  assert.deepEqual(copyOnDisk().items.find((it) => it.id === 'a9faf697b2').box, { x: 0.1, y: 0.2, w: 0.3, h: 0.05, source: 'manual' });

  await api('/api/box/a9faf697b2', { method: 'PUT', ...json(null) });
  assert.equal(copyOnDisk().items.find((it) => it.id === 'a9faf697b2').box, undefined);
});

test('replacing a screenshot clears that screen\'s positions only; deleting removes the file', async () => {
  const wrongType = await api('/api/screenshot/Inbox', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(wrongType.status, 415);

  const res = await api('/api/screenshot/Inbox', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: PNG });
  assert.equal(res.status, 200);
  const { path, cleared } = await res.json();
  assert.equal(path, '.copyproof/screenshots/inbox.png');
  assert.equal(cleared, 5);
  const copy = copyOnDisk();
  assert.ok(copy.items.filter((it) => it.screen === 'Inbox').every((it) => !it.box));
  assert.ok(copy.items.filter((it) => it.screen === 'Checkout').some((it) => it.box));
  const served = await api('/.copyproof/screenshots/inbox.png');
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

  assert.equal((await api('/api/screenshot/Inbox', { method: 'DELETE' })).status, 200);
  assert.equal(existsSync(join(dir, '.copyproof', 'screenshots', 'inbox.png')), false);
});

test('screenshot paths cannot climb out of the screenshots folder', async () => {
  for (const path of ['/.copyproof/screenshots/..%2fcopy.json', '/.copyproof/screenshots/..%2f..%2fpackage.json', '/.copyproof/screenshots/%2e%2e/copy.json']) {
    assert.equal((await api(path)).status, 404, path);
  }
});

test('open-in-editor refuses files outside the project', async () => {
  const res = await api('/api/open', { method: 'POST', ...json({ file: '../../../../etc/passwd', line: 1 }) });
  assert.equal(res.status, 404);
});

test('a batch lands in .copyproof/batches with a safe name, and bumps the version', async () => {
  const v1 = (await (await api('/api/version')).json()).version;
  const res = await api(`/api/batch?screen=${encodeURIComponent('../Checkout')}`, { method: 'PUT', body: '# batch' });
  const { path } = await res.json();
  assert.match(path, /^\.copyproof\/batches\/[\w-]+-checkout\.md$/);
  const files = readdirSync(join(dir, '.copyproof', 'batches'));
  assert.equal(files.length, 1);
  assert.equal(readFileSync(join(dir, '.copyproof', 'batches', files[0]), 'utf8'), '# batch');
  const v2 = (await (await api('/api/version')).json()).version;
  assert.notEqual(v1, v2);

  const retake = await (await api('/api/batch?screen=Inbox&kind=retake', { method: 'PUT', body: 'retake' })).json();
  assert.match(retake.path, /-retake-inbox\.md$/);
});

test('saves the prompt to prompt.md', async () => {
  const res = await (await api('/api/prompt', { method: 'PUT', body: '# Copy revision' })).json();
  assert.equal(res.path, '.copyproof/prompt.md');
  assert.equal(readFileSync(join(dir, '.copyproof', 'prompt.md'), 'utf8'), '# Copy revision');
});

test('locate serves the snippet for a screen, and 404s for an empty one', async () => {
  const res = await api('/api/locate?screen=Checkout');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /^\(\) => \(function locate/);
  assert.equal((await api('/api/locate?screen=Nowhere')).status, 404);
});

test('locate lets pages on this machine read it, but not other websites', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:8080', 'https://app.localhost']) {
    const res = await api('/api/locate?screen=Checkout', { headers: { origin } });
    assert.equal(res.headers.get('access-control-allow-origin'), origin, origin);
  }
  for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example', 'null']) {
    const res = await api('/api/locate?screen=Checkout', { headers: { origin } });
    assert.equal(res.headers.get('access-control-allow-origin'), null, origin);
  }
});
