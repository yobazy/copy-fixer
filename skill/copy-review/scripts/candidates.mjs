#!/usr/bin/env node
// Lists files likely to contain user-facing copy, so the extractor knows what to read.
//
//   node candidates.mjs [project] [--since <git-ref>] [--json]
//
// --since limits output to files changed since that commit (for incremental rescans).
import { readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { git, parseArgs, paths, readJson } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const p = paths(args._[0]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.astro', '.output',
  '.expo', '.turbo', '.cache', '.vercel', '.netlify', 'coverage', 'Pods', 'DerivedData', '.gradle',
  'target', 'vendor', '.venv', 'venv', '__pycache__', '.idea', '.vscode', '.copy-review', '.claude',
  'storybook-static', 'generated', '__generated__', 'scripts', 'evals', 'migrations', 'seeds', 'benchmarks',
]);

// Highest-yield areas first. The last two are mostly logic, so only skim them for user-facing text.
const AREA_ORDER = ['i18n', 'ui', 'ios', 'android', 'flutter', 'templates', 'store-listing', 'script', 'backend'];
const AREA_NOTE = {
  script: 'mostly logic; read only files that build UI text, toasts, notifications or error messages',
  backend: 'mostly logic; read only files that return user-visible messages or render emails/notifications',
};

const LOCALE_DIR = /(^|\/)(locales?|i18n|l10n|lang|langs|languages|messages|translations?|intl|strings)(\/|$)/i;

// Extension → area. Files with these extensions are candidates anywhere.
const CODE = {
  ui: ['.jsx', '.tsx', '.vue', '.svelte', '.astro', '.html', '.htm', '.mdx', '.razor', '.cshtml', '.xaml', '.qml'],
  script: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'],
  ios: ['.swift', '.m', '.mm', '.strings', '.stringsdict', '.xcstrings', '.storyboard', '.xib', '.intentdefinition'],
  android: ['.kt', '.kts', '.java'],
  flutter: ['.dart', '.arb'],
  templates: ['.erb', '.hbs', '.handlebars', '.ejs', '.liquid', '.njk', '.jinja', '.jinja2', '.j2', '.twig', '.mustache', '.pug', '.haml', '.slim', '.heex', '.eex', '.blade.php', '.tmpl', '.gohtml'],
  backend: ['.py', '.rb', '.go', '.rs', '.php', '.ex', '.exs', '.cs', '.scala', '.elm'],
  i18n: ['.po', '.pot', '.xliff', '.xlf', '.resx', '.ftl', '.properties'],
};
const EXT_AREA = new Map();
for (const [area, exts] of Object.entries(CODE)) for (const e of exts) EXT_AREA.set(e, area);

const TEST_FILE = /(\.|_)(test|spec|stories|story|e2e|cy|mock|fixture)s?\.[a-z]+$|(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright|fixtures?|mocks?|\.storybook)\//i;
const CONFIG_FILE = /(^|\/)([\w.-]+\.config\.[a-z]+|\.eslintrc.*|tsconfig.*\.json|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

function classify(rel) {
  const lower = rel.toLowerCase();
  if (TEST_FILE.test(rel) || CONFIG_FILE.test(rel)) return null;
  if (lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.map')) return null;
  const base = lower.split('/').pop();
  if (base === 'info.plist' || base.endsWith('infoplist.strings')) return 'ios';
  if (/(^|\/)res\/values[^/]*\/[^/]*\.xml$/.test(lower)) return 'android';
  if (/(^|\/)res\/(layout|menu|navigation|xml)[^/]*\/[^/]*\.xml$/.test(lower)) return 'android';
  if (/(^|\/)(fastlane\/metadata|metadata)\//.test(lower) && lower.endsWith('.txt')) return 'store-listing';
  if (/\.(json|ya?ml|toml)$/.test(lower)) return LOCALE_DIR.test(rel) || /(^|[./_-])(en|en-us|en_us|base|default|messages|strings)\.(json|ya?ml|toml)$/.test(lower) ? 'i18n' : null;
  if (/(^|\/)(emails?|mail(ers)?|notifications?)\//.test(lower) && /\.(txt|md|html|mjml)$/.test(lower)) return 'templates';
  const ext = lower.endsWith('.blade.php') ? '.blade.php' : extname(lower);
  return EXT_AREA.get(ext) || null;
}

function listFiles() {
  const tracked = git(p.root, ['ls-files', '--cached', '--others', '--exclude-standard']);
  if (tracked != null) return tracked.split('\n').filter(Boolean);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(p.root, full).split(sep).join('/');
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith('.')) walk(full);
      } else out.push(rel);
    }
  };
  walk(p.root);
  return out;
}

let files = listFiles().filter((f) => !f.split('/').some((seg) => SKIP_DIRS.has(seg)));
let since = args.since;
if (since === true) {
  const prev = readJson(p.copy);
  since = prev && prev.commit;
}
if (since) {
  const changed = git(p.root, ['diff', '--name-only', since]);
  const untracked = git(p.root, ['ls-files', '--others', '--exclude-standard']);
  if (changed == null) {
    console.error(`Could not diff against ${since}; listing everything.`);
  } else {
    const set = new Set([...changed.split('\n'), ...(untracked || '').split('\n')].filter(Boolean));
    files = files.filter((f) => set.has(f));
  }
}

const candidates = [];
for (const f of files) {
  const area = classify(f);
  if (!area) continue;
  let size = 0;
  try { size = statSync(join(p.root, f)).size; } catch { continue; }
  if (size > 400_000) continue; // generated bundles, not source
  candidates.push({ file: f, area, size });
}

const localeFiles = candidates.filter((c) => c.area === 'i18n' || /\.(strings|xcstrings|arb|po|xliff|xlf|resx|ftl)$/.test(c.file) || /res\/values[^/]*\/strings\.xml$/.test(c.file));

if (args.json) {
  console.log(JSON.stringify({ root: p.root, since: since || null, count: candidates.length, localeFiles: localeFiles.map((c) => c.file), candidates }, null, 2));
} else {
  const byArea = new Map();
  for (const c of candidates) {
    if (!byArea.has(c.area)) byArea.set(c.area, []);
    byArea.get(c.area).push(c);
  }
  console.log(`${candidates.length} candidate files in ${p.root}${since ? ` changed since ${since}` : ''}`);
  if (localeFiles.length) {
    console.log(`\nTranslation files found (extract from the base language here first):`);
    for (const c of localeFiles) console.log(`  ${c.file}`);
  }
  const areas = [...byArea.keys()].sort((a, b) => AREA_ORDER.indexOf(a) - AREA_ORDER.indexOf(b));
  for (const area of areas) {
    const list = byArea.get(area);
    console.log(`\n[${area}] ${list.length} files${AREA_NOTE[area] ? ` (${AREA_NOTE[area]})` : ''}`);
    for (const c of list) console.log(`  ${c.file}`);
  }
}
