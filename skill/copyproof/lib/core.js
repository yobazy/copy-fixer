// Shared between the Node scripts and the browser UI. No Node-only imports here.

export const TAGS = [
  { id: 'unclear', label: 'Unclear' },
  { id: 'wordy', label: 'Too long' },
  { id: 'generic', label: 'Generic' },
  { id: 'off-tone', label: 'Off-tone' },
  { id: 'jargon', label: 'Jargon' },
  { id: 'robotic', label: 'Robotic' },
  { id: 'not-actionable', label: 'Not actionable' },
  { id: 'inconsistent', label: 'Inconsistent' },
  { id: 'typo', label: 'Typo / grammar' },
  { id: 'missing-info', label: 'Missing info' },
];

export const KINDS = [
  'heading', 'body', 'button', 'link', 'label', 'placeholder', 'tooltip',
  'error', 'success', 'empty-state', 'toast', 'dialog', 'notification',
  'email', 'onboarding', 'nav', 'title-meta', 'accessibility', 'permission',
  'legal', 'other',
];

export const RATING_LABELS = {
  1: 'Rewrite it',
  2: 'Weak',
  3: 'Okay',
  4: 'Good',
  5: 'Love it',
};

export function slugify(name) {
  return String(name || 'unsorted')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unsorted';
}

export function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

export const PLACEHOLDER_SOURCE = String.raw`\{\{\s*[\w.]+\s*\}\}|\$\{[^}]+\}|\{[\w.]+(?:,[^}]*)?\}|%(?:\d+\$)?[@dsfiu]|%\([\w]+\)s|\$t\([^)]*\)`;

export function findPlaceholders(text) {
  return [...new Set(String(text).match(new RegExp(PLACEHOLDER_SOURCE, 'g')) || [])];
}

function hasNotes(fb) {
  return Boolean(fb && ((fb.suggestion || '').trim() || (fb.comment || '').trim() || (fb.tags || []).length));
}

/** Rated, or a revision the user accepted or sent back. */
export function isReviewed(fb) {
  return Boolean(fb && (fb.rating != null || fb.verdict));
}

export function isFlagged(fb, maxRating = 3) {
  if (!fb) return false;
  if (fb.verdict === 'rejected') return true;
  return (fb.rating != null && fb.rating <= maxRating) || hasNotes(fb);
}

/**
 * Word-level diff. Returns [{ op: 'same' | 'del' | 'ins', text }].
 * Copy strings are short, so plain LCS is fine.
 */
export function wordDiff(before, after) {
  const tok = (s) => String(s).match(/\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu) || [];
  const a = tok(before);
  const b = tok(after);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  const push = (op, text) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push('same', a[i++]), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', a[i++]);
    else push('ins', b[j++]);
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('ins', b[j++]);
  return out;
}

/** Share of the original's words kept in the rewrite, 0..1. Low means "show both lines, not a diff". */
export function similarity(before, after) {
  const parts = wordDiff(before, after);
  const kept = parts.filter((p) => p.op === 'same').reduce((n, p) => n + p.text.trim().length, 0);
  const total = Math.max(normalizeText(before).length, normalizeText(after).length, 1);
  return kept / total;
}

export const DEFAULT_PROMPT_OPTIONS = {
  target: 'agent', // 'agent' = a coding agent with repo access; 'chat' = any chat model
  maxRating: 3,
  includeExemplars: true,
  pending: false, // leave out strings already sent in a batch
  screen: null, // only this screen's strings (a batch)
};

function feedbackKey(fb = {}) {
  return JSON.stringify([fb.rating ?? null, [...(fb.tags || [])].sort(), (fb.suggestion || '').trim(), (fb.comment || '').trim(), fb.verdict || null]);
}

/** Already sent to be applied, and not changed since. Editing the feedback makes it pending again. */
export function isSent(fb) {
  return Boolean(fb && fb.sent && fb.sent.key === feedbackKey(fb));
}

/** What to store on a feedback entry when it goes out in a batch. */
export function sentMark(fb, at = new Date().toISOString()) {
  return { key: feedbackKey(fb), at };
}

export function selectForPrompt(copy, feedback, options = {}) {
  const opts = { ...DEFAULT_PROMPT_OPTIONS, ...options };
  const entries = (feedback && feedback.items) || {};
  const items = (copy.items || []).filter((it) => it.status !== 'removed');
  let flagged = items.filter((it) => isFlagged(entries[it.id], opts.maxRating));
  if (opts.pending) flagged = flagged.filter((it) => !isSent(entries[it.id]));
  if (opts.screen) {
    // One screen's strings, plus the same text with the same feedback elsewhere, so it changes everywhere at once.
    const sameAs = (it) => normalizeText(it.text) + '\u0000' + feedbackKey(entries[it.id]);
    const keys = new Set(flagged.filter((it) => it.screen === opts.screen).map(sameAs));
    flagged = flagged.filter((it) => keys.has(sameAs(it)));
  }
  let exemplars = [];
  if (opts.includeExemplars) {
    const seen = new Set();
    const loved = items.filter((it) => {
      const fb = entries[it.id];
      const key = normalizeText(it.text);
      if (!fb || fb.rating !== 5 || (fb.suggestion || '').trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Spread exemplars across kinds so the tone signal isn't all buttons.
    const byKind = new Map();
    for (const it of loved) {
      if (!byKind.has(it.kind)) byKind.set(it.kind, []);
      byKind.get(it.kind).push(it);
    }
    const queues = [...byKind.values()];
    while (exemplars.length < 12 && queues.some((q) => q.length)) {
      for (const q of queues) if (q.length && exemplars.length < 12) exemplars.push(q.shift());
    }
  }
  return { flagged, exemplars };
}

/** Collapse flagged items with the same text and the same feedback into one entry with many locations. */
export function groupEntries(flagged, entries) {
  const groups = new Map();
  for (const it of flagged) {
    const key = normalizeText(it.text) + '\u0000' + feedbackKey(entries[it.id]);
    if (!groups.has(key)) groups.set(key, { lead: it, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()];
}

function quote(text) {
  const t = String(text);
  return t.includes('\n') ? '\n' + t.split('\n').map((l) => '     > ' + l).join('\n') : `"${t}"`;
}

function location(it) {
  const lines = it.lines && it.lines.length > 1 ? it.lines.join(', ') : it.line;
  return lines ? `${it.file}:${lines}` : it.file;
}

export function buildPrompt({ copy, feedback, voice, screenshots = {}, expert }, options = {}) {
  const opts = { ...DEFAULT_PROMPT_OPTIONS, ...options };
  const entries = (feedback && feedback.items) || {};
  const { flagged, exemplars } = selectForPrompt(copy, feedback, opts);
  const grouped = groupEntries(flagged, entries);
  const project = copy.project || 'this project';
  const agent = opts.target === 'agent';
  const n = grouped.length;
  const out = [];

  out.push(`# Copy revision: ${project}${opts.screen ? ` · ${opts.screen}` : ''}`);
  out.push('');
  out.push(
    agent
      ? `I reviewed the user-facing copy in ${project} and flagged ${n} string${n === 1 ? '' : 's'} to improve. Each item below has its file location, the current text, my rating (1 = rewrite it, 5 = love it), tags and notes. Edit the source files to apply the revisions.`
      : `I reviewed the user-facing copy in ${project} and flagged ${n} string${n === 1 ? '' : 's'} to improve. Each item below has the current text, where it appears, my rating (1 = rewrite it, 5 = love it), tags and notes. Propose a revision for each one.`
  );

  if (voice && voice.trim()) {
    out.push('', '## Voice and tone', '', voice.trim());
  }

  if (exemplars.length) {
    out.push('', '## Copy I love (match this tone)', '');
    for (const it of exemplars) out.push(`- ${it.kind ? `[${it.kind}] ` : ''}"${it.text}"`);
  }

  out.push('', '## Items to revise');
  const sections = new Map();
  for (const g of grouped) {
    const key = agent ? g.lead.file : g.lead.screen || 'Other';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(g);
  }
  let num = 0;
  const shotsMentioned = new Set();
  for (const [section, groups] of sections) {
    out.push('', `### ${section}`);
    for (const { lead: it, items } of groups) {
      num += 1;
      const fb = entries[it.id] || {};
      const meta = [it.kind, agent ? it.screen : null].filter(Boolean).join(' · ');
      out.push('');
      out.push(`${num}. **${agent ? location(it) : meta || 'copy'}**${agent && meta ? ` · ${meta}` : ''}${it.key ? ` · key \`${it.key}\`` : ''}`);
      if (items.length > 1) {
        const others = items.slice(1).map((x) => (agent ? location(x) : x.screen || x.file));
        out.push(`   - Same text also at: ${[...new Set(others)].join(', ')}. Apply the same change everywhere.`);
      }
      out.push(`   - Current: ${quote(it.text)}`);
      if (it.when || it.context) out.push(`   - Where it appears: ${it.when || it.context}`);
      if (fb.verdict === 'rejected' && it.previousText) {
        out.push(`   - Your last revision changed ${quote(it.previousText)} to the current text. I rejected it, so try again.`);
      }
      if (fb.rating != null) out.push(`   - Rating: ${fb.rating}/5`);
      if ((fb.tags || []).length) {
        const labels = fb.tags.map((t) => (TAGS.find((x) => x.id === t) || { label: t }).label);
        out.push(`   - Problems: ${labels.join(', ')}`);
      }
      if ((fb.suggestion || '').trim()) out.push(`   - My suggested rewrite: ${quote(fb.suggestion.trim())}`);
      if ((fb.comment || '').trim()) out.push(`   - Notes: ${fb.comment.trim()}`);
      const ex = expert && expert.items && expert.items[it.id];
      if (ex && ex.note) out.push(`   - An earlier expert pass said: ${ex.note}${ex.rewrite ? ` (it suggested ${quote(ex.rewrite)})` : ''}`);
      const ph = findPlaceholders(it.text);
      if (ph.length) out.push(`   - Keep these placeholders: ${ph.map((p) => '`' + p + '`').join(' ')}`);
      const shot = agent && it.screen ? screenshots[slugify(it.screen)] : null;
      if (shot && !shotsMentioned.has(shot)) {
        shotsMentioned.add(shot);
        out.push(`   - Screenshot of this screen: ${shot}`);
      }
    }
  }

  out.push('', '## How to revise', '');
  const rules = [
    'Where I wrote a suggested rewrite, use it. Only adjust it to fix grammar, keep placeholders working, or fit the space.',
    'Where I left no suggestion, write a revision that addresses my rating, problems and notes.',
    'Keep every placeholder, variable and format specifier exactly as written.',
    'Keep buttons, labels and navigation items about as short as they are now so layouts don\'t break.',
    'If the same or similar text appears elsewhere, keep wording consistent across all of it.',
  ];
  if (agent) {
    rules.push(
      'Change only the text. Leave the code, i18n keys and component structure alone.',
      'If the copy lives in a translation file, update the base language. List the keys whose other locales now need new translations.',
      'When you finish, give me a table with location, before and after for every change, and flag any item you skipped and why.'
    );
  } else {
    rules.push('Reply with a table for each item: number, current text, revised text, and a one-line reason.');
  }
  for (const r of rules) out.push(`- ${r}`);

  return out.join('\n') + '\n';
}
