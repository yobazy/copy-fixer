#!/usr/bin/env node
// Merges extraction output into .copyproof/copy.json, keeping ratings across rescans.
//
//   node merge.mjs [project] [--full] [--keep-scan] [scan.json ...]
//
// With no scan files given, reads every .json in .copyproof/scan/ and deletes them after.
// --full treats the scan as covering the whole project, so anything missing is marked removed.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mergeScan } from '../lib/merge.js';
import { git, parseArgs, paths, projectName, readJson, writeJson } from './common.mjs';

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
const { copy, feedback, stats, warnings } = mergeScan({
  prevCopy,
  prevFeedback,
  scans,
  full: Boolean(args.full),
  project: projectName(p.root),
  commit: git(p.root, ['rev-parse', 'HEAD']) || undefined,
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
