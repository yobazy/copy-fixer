#!/usr/bin/env node
// Saves string positions found by locate.mjs into copy.json.
//
//   node set-boxes.mjs <project> boxes.json [more.json ...]
//
// Each file is the JSON the locate function returned: { screen, boxes: { id: {x,y,w,h} }, missing: [id] }.
// Positions the user drew by hand in the review page are kept unless --overwrite.
import { parseArgs, paths, readJson, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const copy = readJson(p.copy);
if (!copy || args._.length < 2) {
  console.error('Usage: node set-boxes.mjs <project> boxes.json [...]');
  process.exit(1);
}
const byId = new Map(copy.items.map((it) => [it.id, it]));
let set = 0;
let kept = 0;
const missing = [];
for (const file of args._.slice(1)) {
  let data = readJson(file);
  if (typeof data === 'string') data = JSON.parse(data);
  for (const [id, box] of Object.entries(data.boxes || {})) {
    const it = byId.get(id);
    if (!it) continue;
    if (it.box && it.box.source === 'manual' && !args.overwrite) {
      kept += 1;
      continue;
    }
    it.box = { x: box.x, y: box.y, w: box.w, h: box.h, source: box.source || 'auto' };
    set += 1;
  }
  for (const id of data.missing || []) if (byId.has(id)) missing.push(byId.get(id));
}
writeJson(p.copy, copy);
console.log(`Saved ${set} position(s)${kept ? `, kept ${kept} drawn by hand` : ''}.`);
if (missing.length) {
  console.log(`Not found on the page (${missing.length}). They may need a different state, or the user can mark them in the review page:`);
  for (const it of missing) console.log(`  ${it.id}  "${it.text.slice(0, 70)}"`);
}
