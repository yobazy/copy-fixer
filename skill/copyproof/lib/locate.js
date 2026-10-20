import { PLACEHOLDER_SOURCE, slugify } from './core.js';

// Runs in the page. Keep it self-contained.
function locate(items, placeholderSource, screenSlug) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = (text) => {
    const parts = norm(text).split(new RegExp(placeholderSource, 'gi'));
    const re = new RegExp('^' + parts.map(esc).join('.+?') + '$', 'i');
    return (s) => re.test(norm(s));
  };
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return null;
    return r;
  };
  const els = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName));
  const textOf = new Map();
  const text = (el) => {
    if (!textOf.has(el)) textOf.set(el, norm(el.innerText || el.textContent));
    return textOf.get(el);
  };
  const ATTRS = ['placeholder', 'aria-label', 'alt', 'title', 'value', 'aria-placeholder'];
  const used = new Set();
  const pad = 4;
  const toBox = (r) => {
    const x = Math.max(0, r.left + scrollX - pad);
    const y = Math.max(0, r.top + scrollY - pad);
    return {
      x: +(x / docW).toFixed(5),
      y: +(y / docH).toFixed(5),
      w: +(Math.min(docW - x, r.width + pad * 2) / docW).toFixed(5),
      h: +(Math.min(docH - y, r.height + pad * 2) / docH).toFixed(5),
      source: 'auto',
    };
  };
  const boxes = {};
  const missing = [];
  for (const item of items) {
    const test = matcher(item.text);
    let best = null;
    let bestArea = Infinity;
    const consider = (el) => {
      if (used.has(el)) return;
      const r = visible(el);
      if (!r) return;
      const area = r.width * r.height;
      if (area < bestArea) {
        best = { el, r };
        bestArea = area;
      }
    };
    for (const el of els) if (ATTRS.some((a) => el.hasAttribute(a) && test(el.getAttribute(a)))) consider(el);
    if (!best) for (const el of els) if (test(text(el))) consider(el);
    if (!best && norm(item.text).length > 12) {
      const needle = norm(item.text).split(new RegExp(placeholderSource, 'gi'))[0];
      if (needle.length > 8) for (const el of els) if (text(el).includes(needle)) consider(el);
    }
    if (best) {
      used.add(best.el);
      boxes[item.id] = toBox(best.r);
    } else missing.push(item.id);
  }
  return JSON.stringify({ screen: screenSlug, page: { width: docW, height: docH }, boxes, missing });
}

/**
 * A browser function (as source text) that finds one screen's strings on the current page and
 * returns their positions as JSON for set-boxes. Throws if the screen has no strings.
 */
export function locateSnippet(copy, screen, { pretty = false } = {}) {
  const slug = slugify(screen);
  const items = copy.items.filter((it) => slugify(it.screen) === slug && it.status !== 'removed').map((it) => ({ id: it.id, text: it.text }));
  if (!items.length) throw new Error(`No strings on screen "${screen}".`);
  // Every statement in locate() ends in ; or a brace, so collapsing whitespace is safe and keeps the snippet small.
  const body = pretty ? locate.toString() : locate.toString().replace(/\n\s*/g, ' ');
  return `() => (${body})(${JSON.stringify(items)}, ${JSON.stringify(PLACEHOLDER_SOURCE)}, ${JSON.stringify(slug)})`;
}
