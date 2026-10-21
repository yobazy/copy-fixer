#!/usr/bin/env node
// "When it appears" notes: a plain sentence per string saying where on the screen it shows up and
// what makes it show, plus (optionally) the visible text of the thing that causes it.
//
//   node set-when.mjs <project> --todo [--unmarked] [--out todo.json]
//       Lists strings without a note, grouped by file, for extraction agents to fill in.
//       --unmarked: only strings that aren't marked on a screenshot (the ones that need it most).
//   node set-when.mjs <project> notes.json [more.json ...]
//       Saves notes. Each file is { "<id>": { "when": "...", "trigger": "..." } }.
//       Existing notes are replaced only with --overwrite.
import { writeFileSync } from 'node:fs';
import { parseArgs, paths, readJson, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const copy = readJson(p.copy);
if (!copy) {
  console.error('Usage: node set-when.mjs <project> --todo | notes.json [...]');
  process.exit(1);
}

if (args.todo) {
  const todo = copy.items.filter((it) => it.status !== 'removed' && !it.when && (!args.unmarked || !it.box));
  const byFile = new Map();
  for (const it of todo) {
    if (!byFile.has(it.file)) byFile.set(it.file, []);
    byFile.get(it.file).push({ id: it.id, text: it.text, line: it.line, kind: it.kind, screen: it.screen, ...(it.context ? { context: it.context } : {}) });
  }
  const files = [...byFile.entries()].map(([file, items]) => ({ file, items }));
  const out = JSON.stringify(files, null, 1);
  if (args.out) {
    writeFileSync(args.out, out);
    console.log(`${todo.length} string(s) in ${files.length} file(s) need a note. Written to ${args.out}.`);
  } else {
    process.stdout.write(out + '\n');
  }
  process.exit(0);
}

if (args._.length < 2) {
  console.error('Usage: node set-when.mjs <project> notes.json [more.json ...]');
  process.exit(1);
}
const byId = new Map(copy.items.map((it) => [it.id, it]));
let set = 0;
let kept = 0;
const unknown = [];
for (const file of args._.slice(1)) {
  let data = readJson(file);
  if (typeof data === 'string') data = JSON.parse(data);
  for (const [id, note] of Object.entries(data || {})) {
    const it = byId.get(id);
    if (!it) {
      unknown.push(id);
      continue;
    }
    const when = String((note && note.when) || '').trim();
    if (!when) continue;
    if (it.when && !args.overwrite) {
      kept += 1;
      continue;
    }
    it.when = when;
    const trigger = String((note && note.trigger) || '').trim();
    if (trigger) it.trigger = trigger;
    else delete it.trigger;
    set += 1;
  }
}
writeJson(p.copy, copy);
console.log(`Saved ${set} note(s)${kept ? `, kept ${kept} existing (use --overwrite to replace)` : ''}.`);
if (unknown.length) console.log(`Unknown ids skipped (${unknown.length}): ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? '…' : ''}`);
