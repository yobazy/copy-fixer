#!/usr/bin/env node
// Batches of feedback the user sent from the review page ("Queue this screen"), oldest first.
//
//   node batches.mjs [project]                 prints every batch not yet applied
//   node batches.mjs [project] --list          just their file names
//   node batches.mjs [project] --done <file…>  marks those applied (moves them to batches/done/)
//   node batches.mjs [project] --done-all      marks every pending batch applied
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs, paths } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const pending = existsSync(p.batches) ? readdirSync(p.batches).filter((f) => f.endsWith('.md')).sort() : [];

if (args.done || args['done-all']) {
  // parseArgs takes the first name after --done as its value; the rest land in args._.
  const given = [typeof args.done === 'string' ? args.done : null, ...args._.slice(1)].filter(Boolean);
  const names = args['done-all'] ? pending : given.map((f) => basename(f));
  const done = join(p.batches, 'done');
  mkdirSync(done, { recursive: true });
  for (const name of names) {
    if (!pending.includes(name)) {
      console.error(`Not a pending batch: ${name}`);
      process.exitCode = 1;
      continue;
    }
    renameSync(join(p.batches, name), join(done, name));
    console.log(`Applied: ${name}`);
  }
} else if (!pending.length) {
  console.log('No batches waiting. In the review page, finish a screen and press "Queue this screen".');
} else if (args.list) {
  for (const name of pending) console.log(name);
} else {
  for (const name of pending) {
    console.log(`\n<!-- batch: ${name} -->\n`);
    process.stdout.write(readFileSync(join(p.batches, name), 'utf8'));
  }
}
