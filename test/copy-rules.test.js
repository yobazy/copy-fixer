// House copy rules for the review page itself: sentence-case labels, and "screen", not "stop".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KINDS, kindLabel } from '../skill/copyproof/lib/core.js';

const ui = (f) => readFileSync(new URL(`../skill/copyproof/ui/${f}`, import.meta.url), 'utf8');

test('kind labels are sentence case', () => {
  assert.equal(kindLabel('empty-state'), 'Empty state');
  assert.equal(kindLabel('toast'), 'Toast');
  assert.equal(kindLabel('title-meta'), 'Page title');
  assert.equal(kindLabel(undefined), 'Other');
  for (const k of KINDS) assert.match(kindLabel(k), /^[A-Z][a-z]*( [a-z]+)*$/, k);
});

test('no all-caps or letter-spaced labels in the page styles', () => {
  const css = ui('styles.css');
  assert.doesNotMatch(css, /text-transform:\s*uppercase/);
  assert.doesNotMatch(css, /font-variant(-caps)?:\s*(all-)?small-caps/);
  // Positive tracking is what makes small caps-style labels; only the wordmark keeps a hair of it.
  const tracked = [...css.matchAll(/letter-spacing:\s*(0?\.\d+)em/g)].filter((m) => Number(m[1]) > 0.01);
  assert.deepEqual(tracked.map((m) => m[0]), []);
});

test('the page says "screen", not "stop"', () => {
  const source = ui('app.js') + ui('index.html');
  for (const phrase of [/next stop/i, /last stop/i, /every stop/i, /end of the line/i]) assert.doesNotMatch(source, phrase);
});
