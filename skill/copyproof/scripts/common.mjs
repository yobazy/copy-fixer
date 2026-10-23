import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../lib/core.js';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = '.copyproof';
const OLD_DATA_DIR = '.copy-review'; // the name before the rename

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

export function paths(projectArg) {
  const root = resolve(projectArg || '.');
  const data = join(root, DATA_DIR);
  const old = join(root, OLD_DATA_DIR);
  if (!existsSync(data) && existsSync(old)) renameSync(old, data);
  return {
    root,
    data,
    copy: join(data, 'copy.json'),
    feedback: join(data, 'feedback.json'),
    voice: join(data, 'voice.md'),
    expert: join(data, 'expert.json'),
    prompt: join(data, 'prompt.md'),
    batches: join(data, 'batches'),
    scanDir: join(data, 'scan'),
    screenshots: join(data, 'screenshots'),
  };
}

export function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readText(file, fallback = '') {
  return existsSync(file) ? readFileSync(file, 'utf8') : fallback;
}

export function writeAtomic(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, file);
}

export function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2) + '\n');
}

export function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function projectName(root) {
  const pkg = readJson(join(root, 'package.json'));
  return (pkg && pkg.name) || basename(root);
}

/** Map of screen slug → screenshot path relative to the project root. */
export function findScreenshots(p) {
  const out = {};
  if (!existsSync(p.screenshots)) return out;
  for (const f of readdirSync(p.screenshots)) {
    const m = f.match(/^(.+)\.(png|jpe?g|webp|gif)$/i);
    if (m) out[slugify(m[1])] = `${DATA_DIR}/screenshots/${f}`;
  }
  return out;
}
