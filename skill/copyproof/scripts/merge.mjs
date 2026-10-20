#!/usr/bin/env node
// Merges extraction output into .copyproof/copy.json, keeping ratings across rescans.
//
//   node merge.mjs [project] [--full] [--keep-scan] [scan.json ...]
//
// With no scan files given, reads every .json in .copyproof/scan/ and deletes them after.
// --full treats the scan as covering the whole project, so anything missing is marked removed.
// Strings the scan didn't list but that are still in their file's source are kept anyway
// (an extractor skipped them); --drop-missing trusts the scan instead.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { slugify } from '../lib/core.js';
import { mergeScan } from '../lib/merge.js';
import { findScreenshots, git, parseArgs, paths, projectName, readJson, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
let scanFiles = args._.slice(1).map((f) => resolve(f));
const fromScanDir = scanFiles.length === 0;
if (fromScanDir) {
  if (!existsSync(p.scanDir)) {
    console.error(`No scan files given and ${p.scanDir} does not exist.`);
    process.exit(1);
  }
  scanFiles = readdirSync(p.scanDir).filter((f) => f.endsWith('.json')).map((f) => join(p.scanDir, f));
}
if (!scanFiles.length) {
  console.error('No scan files to merge.');
  process.exit(1);
}

const scans = [];
for (const f of scanFiles) {
  try {
    const scan = readJson(f);
    scans.push(Array.isArray(scan) ? { items: scan } : scan);
  } catch (err) {
    console.error(`Could not parse ${f}: ${err.message}`);
    process.exit(1);
  }
}

const prevCopy = readJson(p.copy);
const prevFeedback = readJson(p.feedback);
const sourceOf = (file) => {
  const full = join(p.root, file);
  try {
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
};
const { copy, feedback, stats, warnings, keptByFile } = mergeScan({
  prevCopy,
  prevFeedback,
  scans,
  full: Boolean(args.full),
  project: projectName(p.root),
  commit: git(p.root, ['rev-parse', 'HEAD']) || undefined,
  sourceOf: args['drop-missing'] ? undefined : sourceOf,
});

for (const w of warnings) console.warn(`warning: ${w}`);
writeJson(p.copy, copy);
writeJson(p.feedback, feedback);
if (fromScanDir && !args['keep-scan']) rmSync(p.scanDir, { recursive: true, force: true });

const kinds = {};
for (const it of copy.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
console.log(`Merged ${scanFiles.length} scan file(s) into ${p.copy}`);
console.log(`  ${stats.total} strings across ${copy.screens.length} screens`);
if (prevCopy) console.log(`  ${stats.new} new · ${stats.changed} changed · ${stats.removed} removed (kept because they had feedback)`);
console.log(`  by kind: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);

if (stats.kept) {
  console.log(`  kept ${stats.kept} string(s) the scan didn't list but are still in the source (re-extract these files if it's a lot):`);
  for (const [file, n] of Object.entries(keptByFile).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${String(n).padStart(4)}  ${file}`);
}

// Plural and conditional variants should be separate items, not "one / other".
const joined = copy.items.filter((it) => it.status !== 'removed' && /\S \/ \S/.test(it.text) && it.kind !== 'legal');
if (joined.length) {
  console.warn(`warning: ${joined.length} string(s) look like variants joined with " / ". Split them into one item each:`);
  for (const it of joined.slice(0, 10)) console.warn(`    ${it.id}  ${it.file}:${it.line}  "${it.text.slice(0, 70)}"`);
}

// Screenshots taken before the copy on them changed show the old text.
const shots = findScreenshots(p);
const stale = [];
for (const [slug, rel] of Object.entries(shots)) {
  const taken = statSync(join(p.root, rel)).mtime.toISOString();
  const newer = copy.items.filter((it) => slugify(it.screen) === slug && it.updatedAt && it.updatedAt > taken).length;
  if (newer) stale.push(`${slug} (${newer} string${newer === 1 ? '' : 's'} changed since it was taken)`);
}
if (stale.length) console.log(`  screenshots to retake: ${stale.join(', ')}`);
