#!/usr/bin/env node
// Serves the review UI for one project on localhost.
//
//   node serve.mjs [project] [--port 4477] [--no-open]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { slugify } from '../lib/core.js';
import { locateSnippet } from '../lib/locate.js';
import { DATA_DIR, SKILL_DIR, findScreenshots, parseArgs, paths, readJson, readText, writeAtomic, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
if (!existsSync(p.copy)) {
  console.error(`No ${p.copy}. Scan the project first (see SKILL.md).`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const STATIC = {
  '/': join(SKILL_DIR, 'ui', 'index.html'),
  '/app.js': join(SKILL_DIR, 'ui', 'app.js'),
  '/styles.css': join(SKILL_DIR, 'ui', 'styles.css'),
  '/lib/core.js': join(SKILL_DIR, 'lib', 'core.js'),
  ...Object.fromEntries(
    ['overpass-latin-wght-normal', 'overpass-latin-wght-italic', 'overpass-mono-latin-wght-normal'].map((n) => [`/fonts/${n}.woff2`, join(SKILL_DIR, 'ui', 'fonts', `${n}.woff2`)])
  ),
};

/** Resolve `rel` inside `base`, refusing anything that escapes it. */
function inside(base, rel) {
  const full = resolve(base, normalize(rel).replace(/^([/\\])+/, ''));
  return full === base || full.startsWith(base + sep) ? full : null;
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        fail(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function onPath(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function openInEditor(file, line) {
  const target = `${file}:${line || 1}`;
  const custom = (process.env.COPYPROOF_EDITOR || process.env.COPY_REVIEW_EDITOR);
  if (custom) {
    const [cmd, ...rest] = custom.split(' ');
    const argv = rest.map((a) => a.replace('{file}', file).replace('{line}', String(line || 1)));
    spawn(cmd, argv.length ? argv : [target], { detached: true, stdio: 'ignore' }).unref();
    return cmd;
  }
  for (const cmd of ['cursor', 'code', 'windsurf']) {
    if (onPath(cmd)) {
      spawn(cmd, ['-g', target], { detached: true, stdio: 'ignore' }).unref();
      return cmd;
    }
  }
  if (onPath('zed')) {
    spawn('zed', [target], { detached: true, stdio: 'ignore' }).unref();
    return 'zed';
  }
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(opener, [file], { detached: true, stdio: 'ignore' }).unref();
  return opener;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  // The API changes files on disk, so only answer localhost, and only same-origin writes.
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'Bad host' });
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Cross-origin request refused' });
  }

  if (req.method === 'GET' && STATIC[route]) {
    return send(res, 200, readFileSync(STATIC[route]), MIME[extname(STATIC[route])] || 'text/plain');
  }

  // The locate function, for the app's own page to fetch and run during the screenshot step
  // (so it doesn't have to be pasted into the browser tool). Read-only, so any origin may ask.
  if (req.method === 'GET' && route === '/api/locate') {
    const cors = { 'access-control-allow-origin': '*' };
    try {
      const snippet = locateSnippet(readJson(p.copy), url.searchParams.get('screen') || '');
      return send(res, 200, snippet, 'text/javascript; charset=utf-8', cors);
    } catch (err) {
      return send(res, 404, { error: err.message }, undefined, cors);
    }
  }

  if (req.method === 'GET' && route === '/api/state') {
    return send(res, 200, {
      root: p.root,
      dataDir: DATA_DIR,
      copy: readJson(p.copy),
      feedback: readJson(p.feedback, { version: 1, items: {} }),
      voice: readText(p.voice),
      expert: readJson(p.expert, { version: 1, items: {} }),
      screenshots: findScreenshots(p),
      screenshotTimes: Object.fromEntries(
        Object.entries(findScreenshots(p)).map(([slug, rel]) => [slug, statSync(join(p.root, rel)).mtime.toISOString()])
      ),
    });
  }

  if (req.method === 'PUT' && route === '/api/feedback') {
    // A rescan rewrites feedback.json (moving ratings into history). Refuse saves from a page
    // that loaded an older scan, so it can't clobber that; the page reloads instead.
    const scannedAt = (readJson(p.copy) || {}).scannedAt;
    if (req.headers['x-scanned-at'] && req.headers['x-scanned-at'] !== scannedAt) {
      return send(res, 409, { error: 'The copy was rescanned. Reload to get the latest.' });
    }
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    if (!body || typeof body.items !== 'object') return send(res, 400, { error: 'Expected { items: {...} }' });
    writeJson(p.feedback, { version: 1, ...body, savedAt: new Date().toISOString() });
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && route === '/api/voice') {
    writeAtomic(p.voice, (await readBody(req)).toString('utf8'));
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && route === '/api/prompt') {
    writeAtomic(p.prompt, (await readBody(req)).toString('utf8'));
    return send(res, 200, { ok: true, path: `${DATA_DIR}/prompt.md` });
  }

  const boxRoute = route.match(/^\/api\/box\/([\w-]+)$/);
  if (boxRoute && req.method === 'PUT') {
    const copy = readJson(p.copy);
    if (req.headers['x-scanned-at'] && req.headers['x-scanned-at'] !== copy.scannedAt) {
      return send(res, 409, { error: 'The copy was rescanned. Reload to get the latest.' });
    }
    const item = copy.items.find((it) => it.id === boxRoute[1]);
    if (!item) return send(res, 404, { error: 'No such string' });
    const box = JSON.parse((await readBody(req)).toString('utf8'));
    const valid = box && ['x', 'y', 'w', 'h'].every((k) => typeof box[k] === 'number' && box[k] >= 0 && box[k] <= 1);
    if (box && !valid) return send(res, 400, { error: 'Expected { x, y, w, h } as fractions of the screenshot' });
    if (box) item.box = { x: box.x, y: box.y, w: box.w, h: box.h, source: 'manual' };
    else delete item.box;
    writeJson(p.copy, copy);
    return send(res, 200, { ok: true });
  }

  const shotUpload = route.match(/^\/api\/screenshot\/([^/]+)$/);
  if (shotUpload && (req.method === 'PUT' || req.method === 'DELETE')) {
    const slug = slugify(decodeURIComponent(shotUpload[1]));
    const ext = IMAGE_EXT[(req.headers['content-type'] || '').split(';')[0]];
    if (req.method === 'PUT' && !ext) return send(res, 415, { error: 'Upload a PNG, JPEG, WebP or GIF' });
    const body = req.method === 'PUT' ? await readBody(req) : null;
    // Positions are relative to the old image, so they no longer mean anything.
    const copy = readJson(p.copy);
    let cleared = 0;
    for (const it of copy.items) {
      if (it.box && slugify(it.screen) === slug) {
        delete it.box;
        cleared += 1;
      }
    }
    if (cleared) writeJson(p.copy, copy);
    mkdirSync(p.screenshots, { recursive: true });
    for (const f of readdirSync(p.screenshots)) {
      if (f.replace(/\.[^.]+$/, '') === slug) unlinkSync(join(p.screenshots, f));
    }
    if (req.method === 'DELETE') return send(res, 200, { ok: true, cleared });
    const name = `${slug}.${ext}`;
    writeAtomic(join(p.screenshots, name), body);
    return send(res, 200, { ok: true, path: `${DATA_DIR}/screenshots/${name}`, cleared });
  }

  if (req.method === 'GET' && route.startsWith(`/${DATA_DIR}/screenshots/`)) {
    const file = inside(p.screenshots, decodeURIComponent(route.slice(`/${DATA_DIR}/screenshots/`.length)));
    if (!file || !existsSync(file)) return send(res, 404, { error: 'Not found' });
    return send(res, 200, readFileSync(file), MIME[extname(file).toLowerCase()] || 'application/octet-stream');
  }

  if (req.method === 'POST' && route === '/api/open') {
    const { file, line } = JSON.parse((await readBody(req)).toString('utf8'));
    const full = inside(p.root, String(file || ''));
    if (!full || !existsSync(full)) return send(res, 404, { error: `File not found: ${file}` });
    return send(res, 200, { ok: true, editor: openInEditor(full, Number(line) || 1) });
  }

  send(res, 404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => send(res, 500, { error: err.message }));
});

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) listen(port + 1, attemptsLeft - 1);
    else {
      console.error(err.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${server.address().port}`;
    console.log(`Copyproof for ${p.root}`);
    console.log(`  ${url}`);
    console.log('  Ctrl+C to stop. Feedback saves to .copyproof/feedback.json as you go.');
    if (!args['no-open']) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      spawn(opener, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    }
  });
}

listen(Number(args.port) || 4477, 20);
