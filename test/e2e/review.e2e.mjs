// The review page in a real browser: rate, rewrite, apply a screen, export, and refresh after Claude's work.
// Needs Playwright, which copyproof doesn't depend on:
//
//   npm i --no-save playwright && npx playwright install chromium
//   npm run test:e2e
//
// COPYPROOF_PLAYWRIGHT=/path/to/node_modules/playwright points at an install elsewhere. Skips without one.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { demoCopy, serve } from '../helpers.js';

async function loadPlaywright() {
  if (process.env.COPYPROOF_PLAYWRIGHT) return createRequire(import.meta.url)(process.env.COPYPROOF_PLAYWRIGHT);
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

const pw = await loadPlaywright();
const skip = pw ? false : 'Playwright is not installed';
let dir;
let srv;
let browser;
before(async () => {
  if (skip) return;
  dir = demoCopy();
  srv = await serve(dir);
  browser = await pw.chromium.launch();
});
after(async () => {
  await browser?.close();
  srv?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const feedbackOnDisk = () => JSON.parse(readFileSync(join(dir, '.copyproof', 'feedback.json'), 'utf8'));
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = fn();
      if (v) return v;
    } catch {}
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('rate, rewrite, apply a screen, and export, saving to disk as you go', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url);
  await page.waitForSelector('.card');
  assert.equal(await page.locator('#project-name').textContent(), 'demo-app');

  // Checkout comes first; its first string is "Payment successful!".
  await page.locator('#list').focus();
  await page.keyboard.press('j');
  await page.keyboard.press('2');
  const id = await page.locator('.card.focused').getAttribute('data-id');
  await waitFor(() => feedbackOnDisk().items[id]?.rating === 2);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Paid. Your receipt is on its way.');
  await page.keyboard.press('Enter');
  await waitFor(() => feedbackOnDisk().items[id]?.suggestion === 'Paid. Your receipt is on its way.');

  const apply = page.locator('.apply-screen').first();
  assert.match(await apply.textContent(), /Apply this screen · 1/);
  await apply.click();
  await waitFor(() => readdirSync(join(dir, '.copyproof', 'batches')).length === 1);
  const batch = readFileSync(join(dir, '.copyproof', 'batches', readdirSync(join(dir, '.copyproof', 'batches'))[0]), 'utf8');
  assert.match(batch, /Copy revision: demo-app · Checkout/);
  assert.match(batch, /My suggested rewrite: "Paid\. Your receipt is on its way\."/);
  await waitFor(() => feedbackOnDisk().items[id]?.sent);

  await page.keyboard.press('e');
  await page.waitForSelector('#export-dialog[open]');
  // Queued strings stay out of the prompt until their feedback changes.
  assert.match(await page.locator('#export-text').inputValue(), /Nothing to send yet/);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the export dialog saves prompt.md on Copy, not on open', { skip }, async () => {
  const promptFile = join(dir, '.copyproof', 'prompt.md');
  rmSync(promptFile, { force: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(srv.url);
  await page.waitForSelector('.card');
  // Checkout is queued by the test above, so flag a string on the next screen.
  await page.locator('#list').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('j');
  await page.keyboard.press('2');
  const id = await page.locator('.card.focused').getAttribute('data-id');
  await waitFor(() => feedbackOnDisk().items[id]?.rating === 2);

  await page.keyboard.press('e');
  await page.waitForSelector('#export-dialog[open]');
  assert.doesNotMatch(await page.locator('#export-text').inputValue(), /Nothing to send yet/);
  await page.waitForTimeout(800);
  assert.equal(existsSync(promptFile), false, 'opening the dialog must not write prompt.md');

  await page.locator('#export-copy').click();
  const saved = await waitFor(() => existsSync(promptFile) && readFileSync(promptFile, 'utf8'));
  assert.equal(saved, await page.locator('#export-text').inputValue());
  await page.waitForSelector('#export-saved code');
  await page.close();
});

test('refreshes by itself when Claude changes the copy', { skip, timeout: 20000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(srv.url);
  await page.waitForSelector('.card');
  await page.waitForTimeout(500); // the first version check sets the baseline
  const file = join(dir, '.copyproof', 'copy.json');
  const copy = JSON.parse(readFileSync(file, 'utf8'));
  copy.project = 'demo-app (rescanned)';
  writeFileSync(file, JSON.stringify(copy));
  await page.waitForFunction(() => document.querySelector('#project-name').textContent === 'demo-app (rescanned)', null, { timeout: 12000 });
  await page.close();
});

test('fits a phone screen without sideways scrolling', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(srv.url);
  await page.waitForSelector('.card');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();
});
