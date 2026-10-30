// The scripts Claude runs, end to end on a copy of the demo project.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { demoCopy, run } from './helpers.js';

let dir;
beforeEach(() => {
  dir = demoCopy();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const data = (...p) => join(dir, '.copyproof', ...p);
const readJsonFile = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeFeedback = (items) => writeFileSync(data('feedback.json'), JSON.stringify({ version: 1, items }));

test('candidates lists the locale file first and skips the data folder', () => {
  const { status, stdout } = run('candidates.mjs', [dir, '--json']);
  assert.equal(status, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.localeFiles, ['locales/en.json']);
  const files = out.candidates.map((c) => c.file).sort();
  assert.deepEqual(files, ['locales/en.json', 'preview/checkout.html', 'preview/inbox.html', 'src/screens/Checkout.tsx', 'src/screens/Inbox.tsx']);
});

test('export prints and saves the prompt, and says so when nothing is flagged', () => {
  const none = run('export.mjs', [dir]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /Nothing flagged yet/);

  writeFeedback({ e39393f6c7: { rating: 1, suggestion: 'We couldn’t take the payment. Check your card details and try again.' }, '68a1a8049c': { rating: 5 } });
  const agent = run('export.mjs', [dir]);
  assert.equal(agent.status, 0);
  assert.match(agent.stdout, /src\/screens\/Checkout\.tsx:\d+/);
  assert.match(agent.stdout, /My suggested rewrite: "We couldn’t take the payment/);
  assert.match(agent.stdout, /## Copy I love \(match this tone\)\n\n- \[toast\] "Payment successful!"/);
  assert.equal(readFileSync(data('prompt.md'), 'utf8'), agent.stdout);

  const chat = run('export.mjs', [dir, '--target', 'chat', '--no-exemplars', '--out', join(dir, 'chat.md')]);
  assert.doesNotMatch(chat.stdout, /Copy I love/);
  assert.match(chat.stdout, /Reply with a table/);
  assert.ok(existsSync(join(dir, 'chat.md')));
});

test('batches prints pending batches oldest first and moves applied ones to done/', () => {
  assert.match(run('batches.mjs', [dir]).stdout, /No batches waiting\. .*press "Queue this screen"/);
  mkdirSync(data('batches'), { recursive: true });
  writeFileSync(data('batches', '2026-01-02-inbox.md'), 'second');
  writeFileSync(data('batches', '2026-01-01-checkout.md'), 'first');
  const all = run('batches.mjs', [dir]).stdout;
  assert.ok(all.indexOf('first') < all.indexOf('second'));
  assert.equal(run('batches.mjs', [dir, '--list']).stdout, '2026-01-01-checkout.md\n2026-01-02-inbox.md\n');

  const done = run('batches.mjs', [dir, '--done', '.copyproof/batches/2026-01-01-checkout.md', 'nope.md']);
  assert.equal(done.status, 1);
  assert.match(done.stderr, /Not a pending batch: nope\.md/);
  assert.deepEqual(readdirSync(data('batches', 'done')), ['2026-01-01-checkout.md']);
  run('batches.mjs', [dir, '--done-all']);
  assert.deepEqual(readdirSync(data('batches', 'done')).sort(), ['2026-01-01-checkout.md', '2026-01-02-inbox.md']);
});

test('set-boxes saves found positions but keeps ones drawn by hand', () => {
  const copy = readJsonFile(data('copy.json'));
  copy.items.find((it) => it.id === 'a9faf697b2').box = { x: 0.5, y: 0.5, w: 0.1, h: 0.1, source: 'manual' };
  writeFileSync(data('copy.json'), JSON.stringify(copy));
  const boxes = join(dir, 'boxes.json');
  // The browser tool sometimes hands back the JSON as a string; both work.
  writeFileSync(boxes, JSON.stringify(JSON.stringify({ screen: 'checkout', boxes: { a9faf697b2: { x: 0, y: 0, w: 0.2, h: 0.2 }, '9c485f2a0f': { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, missing: ['c7c33f916d'] })));
  const out = run('set-boxes.mjs', [dir, boxes]).stdout;
  assert.match(out, /Saved 1 position\(s\), kept 1 drawn by hand/);
  assert.match(out, /c7c33f916d {2}"Close checkout"/);
  const after = readJsonFile(data('copy.json')).items;
  assert.equal(after.find((it) => it.id === 'a9faf697b2').box.source, 'manual');
  assert.deepEqual(after.find((it) => it.id === '9c485f2a0f').box, { x: 0.1, y: 0.1, w: 0.2, h: 0.2, source: 'auto' });

  run('set-boxes.mjs', [dir, boxes, '--overwrite']);
  assert.equal(readJsonFile(data('copy.json')).items.find((it) => it.id === 'a9faf697b2').box.source, 'auto');
});

test('set-when lists strings without a note, saves notes, and keeps existing ones unless told', () => {
  const todo = JSON.parse(run('set-when.mjs', [dir, '--todo']).stdout);
  assert.equal(todo.flatMap((f) => f.items).length, 16);
  // Every fixture string is marked on a screenshot, so none need a note badly.
  assert.deepEqual(JSON.parse(run('set-when.mjs', [dir, '--todo', '--unmarked']).stdout), []);

  const first = join(dir, 'when-1.json');
  writeFileSync(first, JSON.stringify({ e39393f6c7: { when: 'Under the card field when the payment fails.' } }));
  run('set-when.mjs', [dir, first]);
  const notes = join(dir, 'when.json');
  writeFileSync(notes, JSON.stringify({ '68a1a8049c': { when: 'Top of the screen after you pay.', trigger: 'Submit' }, e39393f6c7: { when: 'Replaced?' }, zzz: { when: 'x' } }));
  const out = run('set-when.mjs', [dir, notes]).stdout;
  assert.match(out, /Saved 1 note\(s\), kept 1 existing/);
  assert.match(out, /Unknown ids skipped \(1\): zzz/);
  const items = readJsonFile(data('copy.json')).items;
  assert.equal(items.find((it) => it.id === '68a1a8049c').when, 'Top of the screen after you pay.');
  assert.equal(items.find((it) => it.id === '68a1a8049c').trigger, 'Submit');
  assert.equal(items.find((it) => it.id === 'e39393f6c7').when, 'Under the card field when the payment fails.');
  assert.match(run('set-when.mjs', [dir, notes, '--overwrite']).stdout, /Saved 2 note/);
  assert.equal(readJsonFile(data('copy.json')).items.find((it) => it.id === 'e39393f6c7').when, 'Replaced?');
});

test('set-expert keeps valid ratings and known tags only', () => {
  const take = join(dir, 'take.json');
  writeFileSync(take, JSON.stringify({ e39393f6c7: { rating: 1.6, tags: ['generic', 'made-up'], offBrand: true, note: ' Says Oops. ', rewrite: '' }, a9faf697b2: { rating: 9 }, nope: { rating: 3 } }));
  const out = run('set-expert.mjs', [dir, take]).stdout;
  assert.match(out, /Saved 1 take\(s\); 1 flagged/);
  assert.match(out, /Unknown tags dropped: made-up/);
  assert.deepEqual(readJsonFile(data('expert.json')).items, { e39393f6c7: { rating: 2, tags: ['generic'], offBrand: true, note: 'Says Oops.' } });
});

test('merge reads scan/, keeps feedback across a rescan, marks the edit as changed, and deletes scan/', () => {
  writeFeedback({ e39393f6c7: { rating: 1 } });
  const copy = readJsonFile(data('copy.json'));
  const checkout = copy.items.filter((it) => it.file === 'src/screens/Checkout.tsx');
  const scanItems = checkout.map(({ text, file, line, kind, screen }) => ({ text: text === 'Oops! Something went wrong' ? 'We couldn’t take the payment.' : text, file, line, kind, screen }));
  mkdirSync(data('scan'), { recursive: true });
  writeFileSync(data('scan', 'main.json'), JSON.stringify({ files: ['src/screens/Checkout.tsx'], items: scanItems }));
  const res = run('merge.mjs', [dir]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /0 new · 1 changed · 0 removed/);
  assert.equal(existsSync(data('scan')), false);
  const merged = readJsonFile(data('copy.json'));
  const changed = merged.items.find((it) => it.text === 'We couldn’t take the payment.');
  assert.equal(changed.status, 'changed');
  assert.equal(changed.previousText, 'Oops! Something went wrong');
  assert.equal(merged.items.length, copy.items.length);
  const fb = readJsonFile(data('feedback.json')).items[changed.id];
  assert.equal(fb.history[0].rating, 1);
});

test('the old .copy-review folder is renamed on first use', () => {
  renameSync(join(dir, '.copyproof'), join(dir, '.copy-review'));
  assert.equal(run('batches.mjs', [dir, '--list']).status, 0);
  assert.ok(existsSync(join(dir, '.copyproof', 'copy.json')));
  assert.equal(existsSync(join(dir, '.copy-review')), false);
});

test('locate prints a snippet for a screen and lists the screens when none is given', () => {
  assert.match(run('locate.mjs', [dir, '--screen', 'Inbox']).stdout, /^\(\) => \(function locate/);
  const none = run('locate.mjs', [dir]);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /Screens: Checkout, Inbox/);
});
