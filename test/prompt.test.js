import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPrompt, findPlaceholders, groupEntries, isFlagged, isReviewed, selectForPrompt, similarity, slugify, wordDiff,
} from '../skill/copyproof/lib/core.js';

const copy = {
  project: 'demo',
  items: [
    { id: 'a', text: 'Oops! Something went wrong', file: 'src/Checkout.tsx', line: 12, kind: 'error', screen: 'Checkout', context: 'Payment failed' },
    { id: 'b', text: 'Submit', file: 'src/Checkout.tsx', line: 23, kind: 'button', screen: 'Checkout' },
    { id: 'c', text: 'You have {{count}} unread messages', file: 'locales/en.json', line: 8, kind: 'body', screen: 'Inbox', key: 'inbox.unread' },
    { id: 'd', text: 'Nice and clear', file: 'src/Home.tsx', line: 2, kind: 'heading', screen: 'Home' },
    { id: 'e', text: 'Gone', file: 'src/Old.tsx', line: 2, kind: 'body', screen: 'Home', status: 'removed' },
    { id: 'f', text: 'Fine', file: 'src/Home.tsx', line: 5, kind: 'body', screen: 'Home' },
  ],
};
const feedback = {
  items: {
    a: { rating: 1, tags: ['generic', 'not-actionable'], suggestion: "Your card didn't go through. Try another card." },
    b: { rating: 4, comment: 'Should say what it does' },
    c: { rating: 3 },
    d: { rating: 5 },
    e: { rating: 1 },
    f: { rating: 4 },
  },
};

test('flags low ratings and anything with notes, skips removed items', () => {
  const { flagged, exemplars } = selectForPrompt(copy, feedback);
  assert.deepEqual(flagged.map((i) => i.id), ['a', 'b', 'c']);
  assert.deepEqual(exemplars.map((i) => i.id), ['d']);
  assert.equal(isFlagged({ rating: 4 }), false);
  assert.equal(isFlagged({ rating: 4 }, 4), true);
});

test('agent prompt has locations, feedback, placeholders and edit rules', () => {
  const out = buildPrompt({ copy, feedback, voice: 'Plain and warm.', screenshots: { checkout: '.copyproof/screenshots/checkout.png' } });
  assert.match(out, /^# Copy revision: demo/);
  assert.match(out, /## Voice and tone\n\nPlain and warm\./);
  assert.match(out, /"Nice and clear"/);
  assert.match(out, /\*\*src\/Checkout\.tsx:12\*\* · error · Checkout/);
  assert.match(out, /Problems: Generic, Not actionable/);
  assert.match(out, /My suggested rewrite: "Your card didn't go through\. Try another card\."/);
  assert.match(out, /key `inbox\.unread`/);
  assert.match(out, /Keep these placeholders: `\{\{count\}\}`/);
  assert.equal(out.match(/Screenshot of this screen/g).length, 1);
  assert.match(out, /Edit the source files/);
  assert.doesNotMatch(out, /Gone/);
});

test('chat prompt groups by screen and asks for a table instead of edits', () => {
  const out = buildPrompt({ copy, feedback }, { target: 'chat', includeExemplars: false });
  assert.match(out, /### Checkout/);
  assert.match(out, /### Inbox/);
  assert.doesNotMatch(out, /src\/Checkout\.tsx/);
  assert.doesNotMatch(out, /Copy I love/);
  assert.match(out, /Reply with a table/);
});

test('placeholder detection across syntaxes', () => {
  assert.deepEqual(findPlaceholders('Hi {name}, {{count}} new, %@ and %1$s, ${total}, %(user)s'), ['{name}', '{{count}}', '%@', '%1$s', '${total}', '%(user)s']);
  assert.deepEqual(findPlaceholders('No placeholders here.'), []);
});

test('slugify', () => {
  assert.equal(slugify('Settings › Notifications'), 'settings-notifications');
  assert.equal(slugify('Café Menü'), 'cafe-menu');
  assert.equal(slugify(''), 'unsorted');
});

test('word diff marks changed words and keeps the rest', () => {
  const parts = wordDiff('Card Number', 'Card number');
  assert.deepEqual(parts, [{ op: 'same', text: 'Card ' }, { op: 'del', text: 'Number' }, { op: 'ins', text: 'number' }]);
  assert.ok(similarity('Card Number', 'Card number') > 0.35);
  assert.ok(similarity('Oops! Something went wrong', "Your payment didn't go through.") < 0.35);
  assert.equal(similarity('Same', 'Same'), 1);
});

test('identical text with identical feedback becomes one prompt entry with every location', () => {
  const c = {
    project: 'demo',
    items: [
      { id: 'x1', text: 'Cancel', file: 'src/A.tsx', line: 4, kind: 'button', screen: 'A' },
      { id: 'x2', text: 'Cancel', file: 'src/B.tsx', line: 9, kind: 'button', screen: 'B' },
      { id: 'x3', text: 'Cancel', file: 'src/C.tsx', line: 2, kind: 'button', screen: 'C' },
    ],
  };
  const fb = { items: { x1: { rating: 2, comment: 'Say what is cancelled' }, x2: { rating: 2, comment: 'Say what is cancelled' }, x3: { rating: 1 } } };
  const out = buildPrompt({ copy: c, feedback: fb });
  assert.equal((out.match(/^\d+\. /gm) || []).length, 2);
  assert.match(out, /Same text also at: src\/B\.tsx:9\. Apply the same change everywhere\./);
  assert.equal(groupEntries(selectForPrompt(c, fb).flagged, fb.items).length, 2);
});

test('verdicts: accepted counts as reviewed, rejected is flagged with its history', () => {
  assert.equal(isReviewed({ verdict: 'accepted' }), true);
  assert.equal(isReviewed({ tags: ['typo'] }), false);
  assert.equal(isFlagged({ verdict: 'accepted' }), false);
  assert.equal(isFlagged({ verdict: 'rejected' }), true);
  const c = { project: 'demo', items: [{ id: 'r', text: 'Pay now', previousText: 'Submit', status: 'changed', file: 'a.tsx', line: 1, kind: 'button', screen: 'A' }] };
  const out = buildPrompt({ copy: c, feedback: { items: { r: { verdict: 'rejected', comment: 'Too pushy' } } } });
  assert.match(out, /Your last revision changed "Submit" to the current text\. I rejected it/);
  assert.match(out, /Notes: Too pushy/);
});

test('the prompt says where a string appears, preferring the when note', async () => {
  const { buildPrompt } = await import('../skill/copyproof/lib/core.js');
  const copy = { project: 'p', items: [{ id: 'a1', text: 'Card declined', file: 'src/A.tsx', line: 9, kind: 'error', screen: 'Checkout', context: 'old', when: 'Under Pay after a decline.' }] };
  const out = buildPrompt({ copy, feedback: { items: { a1: { rating: 2 } } } });
  assert.match(out, /Where it appears: Under Pay after a decline\./);
});

test('an earlier expert note rides along in the prompt for strings the user flagged', async () => {
  const { buildPrompt } = await import('../skill/copyproof/lib/core.js');
  const copy = { project: 'p', items: [{ id: 'a1', text: 'Operation failed', file: 'src/A.tsx', line: 9, kind: 'error', screen: 'Checkout' }] };
  const out = buildPrompt({ copy, feedback: { items: { a1: { rating: 1 } } }, expert: { items: { a1: { rating: 1, note: 'Robotic, no next step.', rewrite: "Couldn't pay. Try another card." } } } });
  assert.match(out, /An earlier expert pass said: Robotic, no next step\./);
  assert.match(out, /Try another card/);
});

test('a flag alone puts a well-rated string in the prompt', () => {
  const copy = { project: 'p', items: [{ id: 'a1', text: 'New hangout', file: 'src/A.tsx', line: 3, kind: 'button', screen: 'Home' }] };
  assert.equal(isFlagged({ rating: 4, flag: true }), true);
  const out = buildPrompt({ copy, feedback: { items: { a1: { rating: 4, flag: true } } } });
  assert.match(out, /I flagged this one to fix\./);
  assert.match(out, /Rating: 4\/5/);
});
