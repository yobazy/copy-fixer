#!/usr/bin/env node
// Prints a browser function that finds one screen's strings on the current page and returns
// where each one is, as fractions of the full page. Run it with the browser tool's evaluate
// on the page you're about to screenshot (full page), save the returned JSON, then:
//
//   node locate.mjs <project> --screen "Checkout"            > locate.js
//   (evaluate locate.js in the browser, save the result to boxes.json)
//   node set-boxes.mjs <project> boxes.json
//
// While serve.mjs is running, the page can fetch the same function instead of you pasting it:
//   async () => (0, eval)(await (await fetch('http://localhost:4477/api/locate?screen=Checkout')).text())()
import { locateSnippet } from '../lib/locate.js';
import { parseArgs, paths, readJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);
const copy = readJson(p.copy);
if (!copy) {
  console.error(`No ${p.copy}. Scan the project first.`);
  process.exit(1);
}
if (!args.screen) {
  console.error('Pass --screen "<screen name>". Screens: ' + copy.screens.map((s) => s.name).join(', '));
  process.exit(1);
}
try {
  process.stdout.write(locateSnippet(copy, args.screen, { pretty: Boolean(args.pretty) }) + '\n');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
