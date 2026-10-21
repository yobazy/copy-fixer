#!/usr/bin/env node
// Saves an expert pass ("Claude's take") into .copyproof/expert.json, apart from the user's own feedback.
//
//   node set-expert.mjs <project> take.json [more.json ...]
//
// Each file is { "<id>": { "rating": 1-5, "tags": ["wordy", ...], "offBrand": true, "note": "...", "rewrite": "..." } }.
// Only the review page shows it; the user adopts a rating, tags or rewrite with one click.
import { TAGS } from '../lib/core.js';
import { parseArgs, paths, readJson, writeJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const copy = readJson(p.copy);
if (!copy || args._.length < 2) {
  console.error('Usage: node set-expert.mjs <project> take.json [...]');
  process.exit(1);
}
const ids = new Set(copy.items.map((it) => it.id));
const tagIds = new Set(TAGS.map((t) => t.id));
const expert = readJson(p.expert, { version: 1, items: {} });
expert.items ||= {};
let set = 0;
const unknown = [];
const badTags = new Set();
for (const file of args._.slice(1)) {
  let data = readJson(file);
  if (typeof data === 'string') data = JSON.parse(data);
  for (const [id, take] of Object.entries(data || {})) {
    if (!ids.has(id)) {
      unknown.push(id);
      continue;
    }
    const out = {};
    const r = Number(take && take.rating);
    if (r >= 1 && r <= 5) out.rating = Math.round(r);
    const tags = (Array.isArray(take && take.tags) ? take.tags : []).filter((t) => (tagIds.has(t) ? true : (badTags.add(t), false)));
    if (tags.length) out.tags = tags;
    if (take && take.offBrand) out.offBrand = true;
    for (const k of ['note', 'rewrite']) {
      const v = String((take && take[k]) || '').trim();
      if (v) out[k] = v;
    }
    if (!Object.keys(out).length) continue;
    expert.items[id] = out;
    set += 1;
  }
}
expert.savedAt = new Date().toISOString();
writeJson(p.expert, expert);
const flagged = Object.values(expert.items).filter((x) => (x.rating != null && x.rating <= 2) || x.offBrand).length;
console.log(`Saved ${set} take(s); ${flagged} flagged (rated 1-2 or off-brand) in total.`);
if (unknown.length) console.log(`Unknown ids skipped (${unknown.length}): ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? '…' : ''}`);
if (badTags.size) console.log(`Unknown tags dropped: ${[...badTags].join(', ')}`);
