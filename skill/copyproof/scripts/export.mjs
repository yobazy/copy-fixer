#!/usr/bin/env node
// Builds the revision prompt from saved feedback without opening the UI.
//
//   node export.mjs [project] [--target agent|chat] [--max-rating 3] [--no-exemplars] [--out file]
//
// Prints the prompt, and writes it to .copyproof/prompt.md (or --out).
import { buildPrompt, selectForPrompt } from '../lib/core.js';
import { findScreenshots, parseArgs, paths, readJson, readText, writeAtomic } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const copy = readJson(p.copy);
if (!copy) {
  console.error(`No ${p.copy}. Scan the project first.`);
  process.exit(1);
}
const feedback = readJson(p.feedback, { items: {} });
const options = {
  target: args.target === 'chat' ? 'chat' : 'agent',
  maxRating: args['max-rating'] ? Number(args['max-rating']) : 3,
  includeExemplars: !args['no-exemplars'],
};
const { flagged } = selectForPrompt(copy, feedback, options);
if (!flagged.length) {
  console.error('Nothing flagged yet. Rate some strings 3 or lower, or add notes, then export again.');
  process.exit(2);
}
const prompt = buildPrompt({ copy, feedback, voice: readText(p.voice), screenshots: findScreenshots(p), expert: readJson(p.expert) }, options);
writeAtomic(args.out || p.prompt, prompt);
process.stdout.write(prompt);
