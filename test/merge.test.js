import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemId, mergeScan } from '../skill/copyproof/lib/merge.js';

const NOW = '2026-10-17T00:00:00.000Z';
const item = (text, line, extra = {}) => ({ text, file: 'src/A.tsx', line, kind: 'button', screen: 'Home', ...extra });

test('first scan assigns ids, no statuses, and screens for every item', () => {
  const { copy, stats } = mergeScan({ scans: [{ items: [item('Save', 3), item('Cancel', 4, { screen: 'Settings' })] }], now: NOW });
  assert.equal(copy.items.length, 2);
  assert.ok(copy.items.every((it) => it.id && !it.status));
  assert.deepEqual(copy.screens.map((s) => s.slug).sort(), ['home', 'settings']);
  assert.equal(stats.total, 2);
});

test('duplicate text in one file collapses into one item with all lines', () => {
  const { copy } = mergeScan({ scans: [{ items: [item('Save', 30), item('Save', 3)] }], now: NOW });
  assert.equal(copy.items.length, 1);
  assert.equal(copy.items[0].line, 3);
  assert.deepEqual(copy.items[0].lines, [3, 30]);
});

test('skips items without text or file and warns', () => {
  const { copy, warnings } = mergeScan({ scans: [{ items: [{ text: '', file: 'a' }, { text: 'Hi' }, item('Ok', 1)] }], now: NOW });
  assert.equal(copy.items.length, 1);
  assert.equal(warnings.length, 2);
});

test('rescan keeps feedback, flags new strings, and archives feedback on edited text', () => {
  const first = mergeScan({ scans: [{ items: [item('Submit', 10), item('Cancel', 20)] }], now: NOW });
  const submitId = first.copy.items.find((i) => i.text === 'Submit').id;
  const cancelId = first.copy.items.find((i) => i.text === 'Cancel').id;
  const feedback = { items: { [submitId]: { rating: 2, comment: 'vague' }, [cancelId]: { rating: 5 } } };

  const second = mergeScan({
    prevCopy: first.copy,
    prevFeedback: feedback,
    scans: [{ items: [item('Pay now', 11), item('Cancel', 20), item('Back', 30)] }],
    now: NOW,
  });
  const byText = Object.fromEntries(second.copy.items.map((i) => [i.text, i]));
  assert.equal(byText['Pay now'].status, 'changed');
  assert.equal(byText['Pay now'].previousText, 'Submit');
  assert.equal(byText['Back'].status, 'new');
  assert.equal(byText['Cancel'].status, undefined);
  assert.deepEqual(second.feedback.items[cancelId], { rating: 5 });
  const moved = second.feedback.items[byText['Pay now'].id];
  assert.equal(moved.rating, undefined);
  assert.equal(moved.history[0].rating, 2);
  assert.equal(moved.history[0].text, 'Submit');
  assert.equal(second.feedback.items[submitId], undefined);
  assert.deepEqual(second.stats, { total: 3, new: 1, changed: 1, removed: 0, unchanged: 1 });
});

test('i18n key keeps the same id when its text changes', () => {
  const a = item('Click here', 4, { key: 'cta', file: 'en.json' });
  const b = item('Compose', 4, { key: 'cta', file: 'en.json' });
  assert.equal(itemId(a), itemId(b));
  const first = mergeScan({ scans: [{ items: [a] }], now: NOW });
  const id = first.copy.items[0].id;
  const second = mergeScan({ prevCopy: first.copy, prevFeedback: { items: { [id]: { rating: 1 } } }, scans: [{ items: [b] }], now: NOW });
  assert.equal(second.copy.items[0].status, 'changed');
  assert.equal(second.feedback.items[id].history[0].rating, 1);
});

test('removed strings are dropped unless they had feedback', () => {
  const first = mergeScan({ scans: [{ items: [item('Keep', 1), item('Rated', 50), item('Unrated', 90)] }], now: NOW });
  const rated = first.copy.items.find((i) => i.text === 'Rated').id;
  const second = mergeScan({
    prevCopy: first.copy,
    prevFeedback: { items: { [rated]: { rating: 3 } } },
    scans: [{ files: ['src/A.tsx'], items: [item('Keep', 1)] }],
    now: NOW,
  });
  assert.deepEqual(second.copy.items.map((i) => [i.text, i.status]), [['Keep', undefined], ['Rated', 'removed']]);
  assert.equal(second.stats.removed, 1);
});

test('incremental rescan leaves files it did not cover alone', () => {
  const first = mergeScan({ scans: [{ items: [item('A', 1), item('B', 1, { file: 'src/B.tsx' })] }], now: NOW });
  const second = mergeScan({ prevCopy: first.copy, scans: [{ files: ['src/A.tsx'], items: [item('A2', 1)] }], now: NOW });
  const texts = second.copy.items.map((i) => i.text).sort();
  assert.deepEqual(texts, ['A2', 'B']);
  const full = mergeScan({ prevCopy: first.copy, scans: [{ items: [item('A2', 1)] }], full: true, now: NOW });
  assert.deepEqual(full.copy.items.map((i) => i.text), ['A2']);
});

test('new status survives a rescan until the string gets feedback', () => {
  const first = mergeScan({ scans: [{ items: [item('A', 1)] }], now: NOW });
  const second = mergeScan({ prevCopy: first.copy, scans: [{ items: [item('A', 1), item('B', 40)] }], now: NOW });
  const bId = second.copy.items.find((i) => i.text === 'B').id;
  const third = mergeScan({ prevCopy: second.copy, scans: [{ items: [item('A', 1), item('B', 40)] }], now: NOW });
  assert.equal(third.copy.items.find((i) => i.id === bId).status, 'new');
  const fourth = mergeScan({ prevCopy: third.copy, prevFeedback: { items: { [bId]: { rating: 4 } } }, scans: [{ items: [item('A', 1), item('B', 40)] }], now: NOW });
  assert.equal(fourth.copy.items.find((i) => i.id === bId).status, undefined);
});

test('screenshot positions survive a rescan, including when the text changed', () => {
  const first = mergeScan({ scans: [{ items: [item('Submit', 10), item('Cancel', 20)] }], now: NOW });
  for (const it of first.copy.items) it.box = { x: 0.1, y: 0.2, w: 0.3, h: 0.04, source: 'auto' };
  const second = mergeScan({ prevCopy: first.copy, scans: [{ items: [item('Pay now', 10), item('Cancel', 20)] }], now: NOW });
  assert.ok(second.copy.items.every((it) => it.box && it.box.x === 0.1));
});

test('a verdict counts as feedback, so the revised flag clears on the next scan', () => {
  const first = mergeScan({ scans: [{ items: [item('A', 1)] }], now: NOW });
  const second = mergeScan({ prevCopy: first.copy, prevFeedback: { items: { [first.copy.items[0].id]: { rating: 2 } } }, scans: [{ items: [item('B', 1)] }], now: NOW });
  const id = second.copy.items[0].id;
  assert.equal(second.copy.items[0].status, 'changed');
  const third = mergeScan({ prevCopy: second.copy, prevFeedback: { items: { [id]: { ...second.feedback.items[id], verdict: 'accepted' } } }, scans: [{ items: [item('B', 1)] }], now: NOW });
  assert.equal(third.copy.items[0].status, undefined);
});
