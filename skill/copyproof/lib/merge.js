import { createHash } from 'node:crypto';
import { PLACEHOLDER_SOURCE, normalizeText, slugify } from './core.js';

export { normalizeText };

export function itemId(item) {
  const basis = item.key ? `key:${item.file}:${item.key}` : `text:${item.file}:${normalizeText(item.text)}`;
  return createHash('sha1').update(basis).digest('hex').slice(0, 10);
}

const FIELDS = ['text', 'file', 'line', 'kind', 'screen', 'context', 'when', 'trigger', 'key', 'usedIn'];

function clean(raw) {
  const item = {};
  for (const f of FIELDS) if (raw[f] != null && raw[f] !== '') item[f] = raw[f];
  item.text = String(item.text);
  if (item.line != null) item.line = Number(item.line) || undefined;
  if (!item.kind) item.kind = 'other';
  if (!item.screen) item.screen = 'Unsorted';
  return item;
}

/**
 * Validate and dedupe raw scan items. Same id → one item with every line it appears on.
 */
export function collectScan(scans) {
  const warnings = [];
  const byId = new Map();
  const covered = new Set();
  const screens = new Map();
  for (const scan of scans) {
    for (const f of scan.files || []) covered.add(f);
    for (const s of scan.screens || []) {
      if (s && s.name) screens.set(slugify(s.name), { ...screens.get(slugify(s.name)), ...s });
    }
    for (const raw of scan.items || []) {
      if (!raw || typeof raw.text !== 'string' || !raw.text.trim() || !raw.file) {
        warnings.push(`Skipped item without text/file: ${JSON.stringify(raw).slice(0, 120)}`);
        continue;
      }
      const item = clean(raw);
      covered.add(item.file);
      const id = itemId(item);
      const existing = byId.get(id);
      if (existing) {
        if (item.line && !existing.lines.includes(item.line)) existing.lines.push(item.line);
      } else {
        byId.set(id, { id, ...item, lines: item.line ? [item.line] : [] });
      }
    }
  }
  for (const it of byId.values()) {
    it.lines.sort((a, b) => a - b);
    if (it.lines.length) it.line = it.lines[0];
    if (it.lines.length <= 1) delete it.lines;
  }
  return { items: [...byId.values()], covered, screens, warnings };
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", '#39': "'", rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', hellip: '\u2026', nbsp: ' ', mdash: '\u2014', ndash: '\u2013' };

/** Source text with escapes undone, so a string can be found the way it's written in code. */
function unescapeSource(src) {
  return normalizeText(
    String(src)
      .replace(/&(#39|[a-z]+);/g, (m, e) => ENTITIES[e] ?? m)
      .replace(/\\(['"`])/g, '$1')
      .replace(/''/g, "'")
  );
}

/**
 * Where `text` still appears in a file's source, as a 1-based line, or null.
 * Placeholders are skipped; every literal piece of 4+ characters must be present.
 * Returns null for strings too short to tell apart from code.
 */
export function findInSource(src, text) {
  if (src == null) return null;
  const pieces = normalizeText(text)
    .split(new RegExp(PLACEHOLDER_SOURCE, 'g'))
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  if (!pieces.length) return null;
  const whole = unescapeSource(src);
  if (!pieces.every((piece) => whole.includes(piece))) return null;
  const longest = pieces.reduce((a, b) => (b.length > a.length ? b : a));
  const lines = String(src).split('\n');
  const at = lines.findIndex((l) => unescapeSource(l).includes(longest));
  return at >= 0 ? at + 1 : 0;
}

function hasFeedback(fb) {
  return Boolean(fb && (fb.rating != null || fb.verdict || fb.later || (fb.tags || []).length || (fb.suggestion || '').trim() || (fb.comment || '').trim()));
}

function archive(fb, previousText, now) {
  if (!hasFeedback(fb)) return fb;
  const { history = [], ...current } = fb;
  return { history: [...history, { ...current, text: previousText, archivedAt: now }] };
}

/**
 * Merge a fresh scan into the previous copy.json + feedback.json.
 *
 * - Items in files the scan covered are replaced by the scan's view of them.
 * - Items in files the scan didn't cover are left alone (incremental rescans), unless `full`.
 * - A previous item whose text changed (same i18n key, or same file/kind within 3 lines) becomes
 *   "changed"; its feedback moves into history so it can be re-reviewed against the new text.
 * - A previous item the scan didn't list but whose text is still in its file (per `sourceOf`) is
 *   kept as it was: an extractor that skipped part of a file shouldn't make strings vanish.
 * - A previous item that disappeared is dropped, or kept as "removed" if it had feedback.
 * - Screenshot positions (`box`) carry over to the same or the matched changed item.
 */
export function mergeScan({ prevCopy, prevFeedback, scans, full = false, now = new Date().toISOString(), project, commit, sourceOf }) {
  const { items: fresh, covered, screens: scanScreens, warnings } = collectScan(scans);
  const prevItems = (prevCopy && prevCopy.items) || [];
  const fbItems = { ...((prevFeedback && prevFeedback.items) || {}) };
  const firstScan = !prevCopy;
  const isCovered = (file) => full || covered.has(file);

  const prevById = new Map(prevItems.map((it) => [it.id, it]));
  const freshIds = new Set(fresh.map((it) => it.id));
  const orphans = prevItems.filter((it) => isCovered(it.file) && !freshIds.has(it.id) && it.status !== 'removed');
  const claimed = new Set();
  const stats = { total: 0, new: 0, changed: 0, removed: 0, unchanged: 0, kept: 0 };
  const keptByFile = {};

  const result = [];
  for (const it of fresh) {
    const prev = prevById.get(it.id);
    const out = { ...it, firstSeen: (prev && prev.firstSeen) || now };
    // Positions on the screenshot come from the locate step or the UI, not from extraction.
    if (prev && prev.box && !out.box) out.box = prev.box;
    // "When it appears" notes are often added in a later pass (set-when); a rescan that didn't write them keeps them.
    if (prev && !out.when && prev.when) out.when = prev.when;
    if (prev && !out.trigger && prev.trigger) out.trigger = prev.trigger;
    if (prev) {
      const textChanged = normalizeText(prev.text) !== normalizeText(it.text);
      if (textChanged) {
        out.status = 'changed';
        out.previousText = prev.text;
        out.updatedAt = now;
        fbItems[it.id] = archive(fbItems[it.id], prev.text, now);
        stats.changed += 1;
      } else {
        // Carry a still-unreviewed "new"/"changed" flag forward until someone rates it.
        if (prev.status && prev.status !== 'removed' && !hasFeedback(fbItems[it.id])) out.status = prev.status;
        if (prev.previousText && out.status === 'changed') out.previousText = prev.previousText;
        if (prev.updatedAt) out.updatedAt = prev.updatedAt;
        stats.unchanged += 1;
      }
    } else {
      const match = orphans.find(
        (o) => !claimed.has(o.id) && o.file === it.file && o.kind === it.kind && o.line && it.line && Math.abs(o.line - it.line) <= 3
      );
      if (match) {
        claimed.add(match.id);
        out.status = 'changed';
        out.previousText = match.text;
        out.updatedAt = now;
        out.firstSeen = match.firstSeen || now;
        if (match.box && !out.box) out.box = match.box;
        const moved = archive(fbItems[match.id], match.text, now);
        if (moved) fbItems[it.id] = moved;
        delete fbItems[match.id];
        stats.changed += 1;
      } else {
        if (!firstScan) {
          out.status = 'new';
          out.updatedAt = now;
        }
        stats.new += firstScan ? 0 : 1;
      }
    }
    result.push(out);
  }

  const sources = new Map();
  const source = (file) => {
    if (!sources.has(file)) sources.set(file, sourceOf ? sourceOf(file) : null);
    return sources.get(file);
  };
  for (const o of orphans) {
    if (claimed.has(o.id)) continue;
    const line = sourceOf ? findInSource(source(o.file), o.text) : null;
    if (line != null) {
      result.push(line ? { ...o, line } : o);
      stats.kept += 1;
      keptByFile[o.file] = (keptByFile[o.file] || 0) + 1;
      continue;
    }
    if (hasFeedback(fbItems[o.id])) {
      result.push({ ...o, status: 'removed' });
      stats.removed += 1;
    } else {
      delete fbItems[o.id];
    }
  }
  for (const it of prevItems) {
    if (!isCovered(it.file)) result.push(it);
  }

  result.sort((a, b) => a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0));
  stats.total = result.filter((it) => it.status !== 'removed').length;

  // Screens: keep previous descriptions, add scan ones, and make sure every item's screen exists.
  const screens = new Map(((prevCopy && prevCopy.screens) || []).map((s) => [slugify(s.name), s]));
  for (const [slug, s] of scanScreens) screens.set(slug, { ...screens.get(slug), ...s });
  const used = new Set(result.map((it) => slugify(it.screen)));
  for (const it of result) {
    const slug = slugify(it.screen);
    if (!screens.has(slug)) screens.set(slug, { name: it.screen });
  }
  const screenList = [...screens.entries()].filter(([slug]) => used.has(slug)).map(([slug, s]) => ({ ...s, slug }));

  const copy = {
    version: 1,
    project: project || (prevCopy && prevCopy.project) || 'project',
    scannedAt: now,
    ...(commit ? { commit } : {}),
    screens: screenList,
    items: result,
  };
  for (const id of Object.keys(fbItems)) if (!fbItems[id]) delete fbItems[id];
  const feedback = { version: 1, ...(prevFeedback || {}), items: fbItems };
  return { copy, feedback, stats, warnings, keptByFile };
}
