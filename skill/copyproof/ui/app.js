import {
  KINDS, RATING_LABELS, TAGS, buildPrompt, findPlaceholders, isFlagged, isReviewed, isSent, kindLabel, normalizeText,
  selectForPrompt, sentMark, similarity, slugify, wordDiff,
} from '/lib/core.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = { copy: null, feedback: { version: 1, items: {} }, expert: { items: {} }, voice: '', screenshots: {}, screenshotTimes: {}, root: '' };
const prefs = loadPrefs();
const ui = {
  filter: 'all',
  kind: 'all',
  groupBy: prefs.groupBy || 'screen',
  mode: prefs.mode === 'focus' ? 'focus' : 'list',
  autoAdvance: Boolean(prefs.autoAdvance),
  compact: Boolean(prefs.compact),
  query: '',
  focusId: null, // card id
  group: null, // the screen (or file, or kind) on the page; a search shows every group
  keys: [], // every group with matching cards, in order
  groups: new Map(), // group key -> matching cards
  visible: [], // card ids on the page, in display order
  editingId: null,
  openComments: new Set(),
  openPlaces: new Set(),
  doneSeen: new Set(), // groups already finished, so "screen done" is said once
  drawing: false,
  shotTarget: null,
  summaryShown: false,
};

// A card is one reviewable unit: a string, or identical text repeated across places.
let cards = [];
const cardById = new Map();
const cardOfItem = new Map();
const undoStack = [];
const FB_FIELDS = ['rating', 'tags', 'suggestion', 'comment', 'verdict', 'later'];

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('copyproof:prefs') || localStorage.getItem('copy-review:prefs') || '{}');
  } catch {
    return {};
  }
}
function savePrefs(patch) {
  Object.assign(prefs, patch);
  try {
    localStorage.setItem('copyproof:prefs', JSON.stringify(prefs));
  } catch {}
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- data ----------

const items = () => state.copy.items;
const fbOf = (id) => state.feedback.items[id];
const cardFb = (card) => fbOf(card.lead.id) || {};
const isLive = (card) => card.lead.status !== 'removed';
const reviewed = (card) => isReviewed(fbOf(card.lead.id));
const liveCards = () => cards.filter(isLive);

function buildCards() {
  const split = new Set(state.feedback.split || []);
  const byText = new Map();
  cards = [];
  cardById.clear();
  cardOfItem.clear();
  for (const it of items()) {
    const key = normalizeText(it.text);
    const joinable = it.status !== 'removed' && !split.has(key);
    if (joinable && byText.has(key)) {
      const c = byText.get(key);
      c.items.push(it);
      cardOfItem.set(it.id, c);
      continue;
    }
    const c = { id: it.id, lead: it, items: [it], key };
    cards.push(c);
    cardById.set(c.id, c);
    cardOfItem.set(it.id, c);
    if (joinable) byText.set(key, c);
  }
  // Text the user split apart still has siblings: remember them for the "join" link.
  const counts = new Map();
  for (const c of cards) counts.set(c.key, (counts.get(c.key) || 0) + 1);
  for (const c of cards) c.splitSiblings = split.has(c.key) && counts.get(c.key) > 1;
}

function prune(id) {
  const e = state.feedback.items[id];
  if (!e) return;
  const empty = FB_FIELDS.every((k) => e[k] == null || e[k] === '' || (Array.isArray(e[k]) && !e[k].length)) && !(e.history || []).length;
  if (empty) delete state.feedback.items[id];
}

function pushUndo(card) {
  undoStack.push({ cardId: card.id, before: card.items.map((it) => [it.id, clone(fbOf(it.id))]) });
  if (undoStack.length > 200) undoStack.shift();
  $('#undo').disabled = false;
}

/** Apply a change to the card's feedback, and to every place the same text appears. */
function mutate(card, fn, { undo = true } = {}) {
  if (undo) pushUndo(card);
  const cur = clone(cardFb(card));
  fn(cur);
  const now = new Date().toISOString();
  for (const it of card.items) {
    const e = (state.feedback.items[it.id] ||= {});
    for (const k of FB_FIELDS) {
      const v = cur[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete e[k];
      else e[k] = clone(v);
    }
    e.updatedAt = now;
    prune(it.id);
    unsaved.add(it.id);
  }
  scheduleSave();
}

function undo() {
  const step = undoStack.pop();
  $('#undo').disabled = !undoStack.length;
  if (!step) return toast('Nothing to undo');
  for (const [id, before] of step.before) {
    if (before) state.feedback.items[id] = before;
    else delete state.feedback.items[id];
  }
  scheduleSave();
  const card = cardById.get(step.cardId);
  if (card) {
    refreshCard(card.id);
    goTo(card.id);
  }
  renderProgress();
  toast('Undone');
}

function matchesFilter(card, filter = ui.filter) {
  const it = card.lead;
  if (filter === 'removed') return it.status === 'removed';
  if (it.status === 'removed') return false;
  if (filter === 'unrated') return !reviewed(card);
  if (filter === 'flagged') return isFlagged(fbOf(it.id), 3);
  if (filter === 'later') return Boolean(cardFb(card).later);
  if (filter === 'sent') return isSent(cardFb(card));
  if (filter === 'fresh') return it.status === 'new' || it.status === 'changed';
  if (filter === 'claude') return expertFlagged(card);
  return true;
}

/** The expert pass's view of a card (Claude's take), from expert.json; null when there's none. */
function exOf(card) {
  const items = (state.expert && state.expert.items) || {};
  for (const it of card.items) if (items[it.id]) return items[it.id];
  return null;
}

function expertFlagged(card) {
  const ex = exOf(card);
  return Boolean(ex && ((ex.rating != null && ex.rating <= 2) || ex.offBrand));
}

function expertBlock(card, fb) {
  const ex = exOf(card);
  if (!ex) return '';
  const head = [
    ex.rating != null ? `<b>${ex.rating}</b> ${esc(RATING_LABELS[ex.rating] || '')}` : '',
    ex.offBrand ? '<span class="expert-off">Off-brand</span>' : '',
    ...(ex.tags || []).map((t) => esc((TAGS.find((x) => x.id === t) || { label: t }).label)),
  ].filter(Boolean).join(' · ');
  const actions = [
    ex.rating != null && fb.rating == null ? `<button class="link small" data-action="take-rating">Rate ${ex.rating} · ${esc(RATING_LABELS[ex.rating] || '')}</button>` : '',
    ex.rewrite && !(fb.suggestion || '').trim() ? `<button class="link small" data-action="take-rewrite">Use rewrite</button>` : '',
    (ex.tags || []).length && !(fb.tags || []).length ? `<button class="link small" data-action="take-tags">Add its tags</button>` : '',
  ].join('');
  return `<div class="expert">
    <p class="expert-title">Claude's take${head ? ` · ${head}` : ''}</p>
    ${ex.note ? `<p class="expert-note">${esc(ex.note)}</p>` : ''}
    ${ex.rewrite ? `<p class="expert-rewrite">Try: “${esc(ex.rewrite)}”</p>` : ''}
    ${actions ? `<div class="expert-actions">${actions}</div>` : ''}
  </div>`;
}

function matchesKind(card) {
  return ui.kind === 'all' || card.items.some((it) => (it.kind || 'other') === ui.kind);
}

function matchesQuery(card) {
  if (!ui.query) return true;
  const fb = cardFb(card);
  const ex = exOf(card);
  const hay = [...card.items.flatMap((it) => [it.text, it.file, it.screen, it.context, it.when, it.key, it.kind]), fb.suggestion, fb.comment, ex && ex.note].join(' ').toLowerCase();
  return ui.query.split(/\s+/).every((w) => hay.includes(w));
}

function groupKey(card) {
  const it = card.lead;
  if (ui.groupBy === 'file') return it.file;
  if (ui.groupBy === 'kind') return it.kind || 'other';
  return it.screen || 'Unsorted';
}

function groupOrder(keys) {
  if (ui.groupBy === 'screen') {
    const order = new Map((state.copy.screens || []).map((s, i) => [slugify(s.name), i]));
    return keys.sort((a, b) => (order.get(slugify(a)) ?? 1e6) - (order.get(slugify(b)) ?? 1e6) || a.localeCompare(b));
  }
  if (ui.groupBy === 'kind') return keys.sort((a, b) => (KINDS.indexOf(a) + 1 || 99) - (KINDS.indexOf(b) + 1 || 99));
  return keys.sort((a, b) => a.localeCompare(b));
}

function screenInfo(name) {
  return (state.copy.screens || []).find((s) => slugify(s.name) === slugify(name)) || { name };
}

/** The place to show in the screenshot panel: one that's marked on a screenshot if possible. */
function panelItem(card) {
  return (
    card.items.find((it) => it.box && state.screenshots[slugify(it.screen)]) ||
    card.items.find((it) => state.screenshots[slugify(it.screen)]) ||
    card.lead
  );
}

// ---------- card rendering ----------

function highlight(text) {
  const ph = findPlaceholders(text);
  if (!ph.length) return esc(text);
  const re = new RegExp(ph.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function diffHtml(before, after) {
  return wordDiff(before, after)
    .map((p) => (p.op === 'same' ? highlight(p.text) : p.op === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`))
    .join('');
}

function shortPath(file) {
  if (file.length <= 48) return file;
  return '…/' + file.split('/').slice(-2).join('/');
}

/** How a group's key reads on the page, and what one group is called. */
function groupName(k) {
  if (ui.groupBy === 'file') return shortPath(k);
  return ui.groupBy === 'kind' ? kindLabel(k) : k;
}
const groupNoun = () => ({ file: 'file', kind: 'kind' })[ui.groupBy] || 'screen';

function locLabel(it) {
  const lines = it.lines && it.lines.length > 1 ? `${it.lines[0]} +${it.lines.length - 1}` : it.line;
  return `${shortPath(it.file)}${lines ? ':' + lines : ''}`;
}

function textBlock(card, fb) {
  const it = card.lead;
  if (ui.editingId === card.id) {
    const value = fb.suggestion || it.text;
    return `
      <div class="editing">
        <textarea class="edit-box" data-edit rows="1" spellcheck="true" aria-label="Rewrite">${esc(value)}</textarea>
        <p class="edit-hint"><kbd>Enter</kbd> save · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> cancel <span class="charcount" data-charcount></span></p>
      </div>`;
  }
  const sug = (fb.suggestion || '').trim();
  if (!sug) {
    return `<p class="copy-text editable" data-action="edit" title="Click to rewrite (Enter)">${highlight(it.text)}</p>`;
  }
  const delta = sug.length - it.text.length;
  const body =
    similarity(it.text, sug) >= 0.35
      ? `<p class="copy-text diff editable" data-action="edit" title="Click to edit your rewrite">${diffHtml(it.text, sug)}</p>`
      : `<p class="copy-text was">${highlight(it.text)}</p><p class="copy-text editable rewrite-text" data-action="edit" title="Click to edit your rewrite">${highlight(sug)}</p>`;
  return `
    ${body}
    <p class="rewrite-meta">
      <span class="rewrite-label">Your rewrite</span>
      <span>${it.text.length} → ${sug.length} characters${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}</span>
      <button data-action="edit">Edit</button>
      <button data-action="discard">Discard</button>
    </p>`;
}

function revisionBlock(card, fb) {
  const it = card.lead;
  if (it.status !== 'changed') return '';
  const last = card.items.map((x) => (fbOf(x.id)?.history || []).at(-1)).find(Boolean);
  const before = it.previousText || last?.text;
  const said = [];
  if (last?.rating != null) said.push(`you rated it ${last.rating}/5`);
  if ((last?.suggestion || '').trim()) said.push(`suggested “${esc(last.suggestion.trim())}”`);
  if ((last?.comment || '').trim()) said.push(`said “${esc(last.comment.trim())}”`);
  let verdict;
  if (fb.verdict === 'accepted') verdict = `<span class="verdict ok"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg> Accepted</span><button class="link" data-action="verdict" data-v="">Undo</button>`;
  else if (fb.verdict === 'rejected') verdict = `<span class="verdict no">Sent back</span><button class="link" data-action="verdict" data-v="">Undo</button>`;
  else
    verdict = `<button class="btn small" data-action="verdict" data-v="accepted">Accept <kbd>Y</kbd></button><button class="btn small ghost" data-action="verdict" data-v="rejected">Send back <kbd>R</kbd></button>`;
  return `
    <div class="revision">
      <p class="revision-title">Revised${before ? '' : ' since your last review'}</p>
      ${
        !before
          ? ''
          : similarity(before, it.text) >= 0.35
            ? `<p class="revision-diff">${diffHtml(before, it.text)}</p>`
            : `<p class="revision-diff"><del>${esc(before)}</del></p><p class="revision-diff"><ins>${highlight(it.text)}</ins></p>`
      }
      ${said.length ? `<p class="revision-said">Before, ${said.join(', ')}.</p>` : ''}
      <div class="revision-actions">${verdict}</div>
    </div>`;
}

function placesBlock(card) {
  if (card.items.length < 2 || !ui.openPlaces.has(card.id)) return '';
  const rows = card.items
    .map((it) => `<li><button class="loc" data-action="open-item" data-item="${it.id}" title="Open in editor">${esc(locLabel(it))}</button><span class="muted">${esc(it.screen || '')}</span></li>`)
    .join('');
  return `
    <div class="places">
      <ul>${rows}</ul>
      <p class="muted">Your rating and notes apply to every place. <button class="link" data-action="split">Review each place separately</button></p>
    </div>`;
}

function cardInner(card) {
  const it = card.lead;
  const fb = cardFb(card);
  const status = { new: 'New', removed: 'Removed' }[it.status];
  const usedIn = Array.isArray(it.usedIn) ? it.usedIn : it.usedIn ? [it.usedIn] : [];
  const screens = [...new Set(card.items.map((x) => x.screen))];
  const shot = state.screenshots[slugify(panelItem(card).screen)];

  const meta = [
    `<span class="chip">${esc(kindLabel(it.kind))}</span>`,
    status ? `<span class="chip status-${it.status}">${status}</span>` : '',
    it.status === 'changed' ? `<span class="chip status-changed">Revised</span>` : '',
    fb.later ? `<span class="chip later-chip">For later</span>` : '',
    isSent(fb) ? `<span class="chip sent-chip" title="Queued for Claude Code to apply. Change the feedback to queue it again.">Queued</span>` : '',
    `<button class="loc" data-action="open" title="${esc(it.file)}${it.line ? ':' + it.line : ''} · open in editor (O)">${esc(locLabel(it))}</button>`,
    card.items.length > 1
      ? `<button class="chip places-chip" data-action="places" aria-expanded="${ui.openPlaces.has(card.id)}" title="${esc(screens.join(', '))}">${card.items.length} places</button>`
      : '',
    card.splitSiblings ? `<button class="link small" data-action="join" title="Same text appears elsewhere">Rated separately · join</button>` : '',
    it.key ? `<span class="key" title="Translation key">${esc(it.key)}</span>` : '',
    usedIn.length ? `<span class="dup" title="${esc(usedIn.join('\n'))}">used in ${esc(shortPath(String(usedIn[0])))}${usedIn.length > 1 ? ` +${usedIn.length - 1}` : ''}</span>` : '',
    shot ? `<button class="link small view-on-screen" data-action="view-shot">View on screen</button>` : '',
  ].join('');

  const rating = [1, 2, 3, 4, 5]
    .map(
      (v) =>
        `<button class="rate" role="radio" data-action="rate" data-v="${v}" data-label="${RATING_LABELS[v]}" aria-checked="${fb.rating === v}" aria-label="${v}, ${RATING_LABELS[v]}">${v}</button>`
    )
    .join('');
  // Tag chips are most of a card's DOM, so only cards that show them get them; focusing a card adds them.
  const tags = card.id === ui.focusId || needsTags(fb) ? tagsHtml(fb) : '';
  const low = fb.rating != null && fb.rating <= 2;
  const explained = (fb.tags || []).length || (fb.suggestion || '').trim() || (fb.comment || '').trim();
  const nudge = low && !explained && ui.editingId !== card.id ? `<p class="nudge">What's wrong with it? Pick a tag, press <kbd>Enter</kbd> to rewrite it, or <kbd>C</kbd> to say why.</p>` : '';

  const showComment = ui.openComments.has(card.id) || (fb.comment || '').trim();
  const comment = showComment
    ? `<label class="field"><span>Comment</span><textarea data-field="comment" rows="2" placeholder="What's wrong, or what it should do">${esc(fb.comment || '')}</textarea></label>`
    : '';
  const actions = [
    ui.editingId === card.id || (fb.suggestion || '').trim() ? '' : `<button data-action="edit">Rewrite <kbd>Enter</kbd></button>`,
    showComment ? '' : `<button data-action="comment">Comment <kbd>C</kbd></button>`,
    `<button data-action="later" aria-pressed="${Boolean(fb.later)}">${fb.later ? 'Done with later' : 'Come back later'} <kbd>G</kbd></button>`,
  ].join('');

  const stamp = fb.verdict === 'accepted' ? ['ok', 'Accepted'] : fb.verdict === 'rejected' ? ['r1', 'Sent back'] : fb.rating != null ? [`r${fb.rating}`, RATING_LABELS[fb.rating]] : null;
  return `
    ${stamp ? `<span class="stamp ${stamp[0]}">${esc(stamp[1])}</span>` : ''}
    <div class="card-meta">${meta}</div>
    ${placesBlock(card)}
    ${textBlock(card, fb)}
    ${it.when ? `<p class="context"><span class="when-label">Appears</span> ${esc(it.when)}</p>` : it.context ? `<p class="context">${esc(it.context)}</p>` : ''}
    ${revisionBlock(card, fb)}
    ${expertBlock(card, fb)}
    <div class="rating" role="radiogroup" aria-label="Rating">${rating}</div>
    ${nudge}
    <div class="tags" role="group" aria-label="Problems" data-tags-slot>${tags}</div>
    ${comment}
    ${actions ? `<div class="card-actions">${actions}</div>` : ''}`;
}

function needsTags(fb) {
  return (fb.tags || []).length || (fb.rating != null && fb.rating <= 3) || fb.verdict === 'rejected';
}

function tagsHtml(fb) {
  return TAGS.map((t) => `<button class="tag" data-action="tag" data-tag="${t.id}" aria-pressed="${(fb.tags || []).includes(t.id)}">${esc(t.label)}</button>`).join('');
}

function cardEl(card) {
  const el = document.createElement('article');
  const fb = cardFb(card);
  el.className = 'card';
  if (card.lead.status === 'removed') el.classList.add('removed');
  if (needsTags(fb)) el.classList.add('show-tags');
  if (card.id === ui.focusId) el.classList.add('focused');
  el.dataset.id = card.id;
  el.dataset.rating = fb.rating ?? '';
  el.tabIndex = -1;
  el.innerHTML = cardInner(card);
  return el;
}

function refreshCard(id, focusSel) {
  const old = $(`.card[data-id="${id}"]`);
  const card = cardById.get(id);
  if (!old || !card) return;
  const fresh = cardEl(card);
  old.replaceWith(fresh);
  const box = $('[data-edit]', fresh);
  if (box) {
    autosize(box);
    updateCharcount(card, box);
  }
  const target = focusSel && $(focusSel, fresh);
  if (target) {
    target.focus({ preventScroll: true });
    if (target.setSelectionRange) target.setSelectionRange(target.value.length, target.value.length);
  }
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 2 + 'px';
}

function updateCharcount(card, ta) {
  const el = $('[data-charcount]', ta.closest('.card'));
  if (!el) return;
  const d = ta.value.trim().length - card.lead.text.length;
  el.textContent = `· ${ta.value.trim().length} characters${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}`;
}

// ---------- list rendering ----------

function render() {
  const visible = cards.filter((c) => matchesFilter(c) && matchesKind(c) && matchesQuery(c));
  const groups = new Map();
  for (const c of visible) {
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const keys = groupOrder([...groups.keys()]);
  // One screen at a time keeps big projects manageable. A search looks across all of them.
  const everything = Boolean(ui.query);
  if (!everything && !groups.has(ui.group)) ui.group = pickGroup(keys, groups);
  const shown = everything ? keys : keys.filter((k) => k === ui.group);
  ui.keys = keys;
  ui.groups = groups;
  if (ui.group && groupDone(ui.group)) ui.doneSeen.add(ui.group);
  ui.visible = shown.flatMap((k) => groups.get(k).map((c) => c.id));
  if (ui.focusId && !ui.visible.includes(ui.focusId)) ui.focusId = null;
  // Something is always selected, so the keys work from the first second.
  if (!ui.focusId && ui.visible.length) ui.focusId = ui.visible.find((id) => !reviewed(cardById.get(id))) || ui.visible[0];

  const list = $('#list');
  list.replaceChildren();
  list.insertAdjacentHTML('beforeend', `<div class="focus-bar" id="focus-bar"></div>`);

  if (!visible.length) {
    const msg = {
      unrated: ['Everything here is reviewed', 'Open the summary, or generate the prompt.'],
      flagged: ['Nothing flagged yet', 'Strings rated 3 or lower, or with tags, rewrites or comments, show up here.'],
      fresh: ['No new or revised copy', 'New and changed strings show up here after a rescan.'],
      later: ['Nothing saved for later', 'Press G on a string you want to come back to.'],
      removed: ['Nothing removed', ''],
    }[ui.filter] || ['No matches', 'Try a different search or kind.'];
    const [title, body] = ui.query ? ['No matches', 'Try a different search.'] : msg;
    list.insertAdjacentHTML('beforeend', `<div class="empty"><strong>${title}</strong>${body}</div>`);
  }
  // Big projects have thousands of cards: render the top now and the rest in idle chunks.
  pending = shown.map((k) => ({ k, i: keys.indexOf(k), cards: groups.get(k) }));
  cancelIdle();
  drainPending(120);
  if (pending.length) scheduleIdle();
  renderSidebar(keys, groups);
  renderCounts();
  renderFocusBar();
  renderNextBar();
  renderPanel();
  if (ui.focusId) setFocus(ui.focusId, { scroll: ui.mode === 'focus' });
}

let pending = [];
let idleHandle = null;

const groupPrefKey = () => `${state.copy.project}|${ui.groupBy}`;

/** The group to open on: the one you were last on, else the first with something left to review. */
function pickGroup(keys, groups) {
  const last = (prefs.groups || {})[groupPrefKey()];
  if (keys.includes(last)) return last;
  return keys.find((k) => groups.get(k).some((c) => isLive(c) && !reviewed(c))) || keys[0] || null;
}

/** Switch the page to another group and focus a card in it: the first to review, the first, or the last. */
function showGroup(k, { pick = 'unrated' } = {}) {
  if (!ui.groups.has(k)) return;
  ui.group = k;
  savePrefs({ groups: { ...prefs.groups, [groupPrefKey()]: k } });
  ui.focusId = null;
  render();
  window.scrollTo({ top: 0 });
  const ids = ui.visible;
  const id = pick === 'last' ? ids.at(-1) : pick === 'first' ? ids[0] : ids.find((x) => !reviewed(cardById.get(x))) || ids[0];
  if (id) setFocus(id, { scroll: pick === 'last' });
}

function adjacentGroup(delta) {
  const i = ui.keys.indexOf(ui.group);
  return i === -1 ? null : ui.keys[i + delta] ?? null;
}

/** Focus a card, switching groups if it's on another one. */
function goTo(id) {
  if (ui.visible.includes(id)) return setFocus(id);
  const card = cardById.get(id);
  const k = card && groupKey(card);
  if (!card || !ui.groups.get(k)?.includes(card)) return toast('That string is hidden by the current filter');
  showGroup(k);
  setFocus(id);
}

function stopCode(i) {
  return `${{ screen: 'S', file: 'F', kind: 'K' }[ui.groupBy]}${String(i + 1).padStart(2, '0')}`;
}

function tickClass(card) {
  const fb = cardFb(card);
  if (fb.verdict === 'accepted') return 'r5';
  if (fb.verdict === 'rejected') return 'r1';
  return fb.rating != null ? `r${fb.rating}` : reviewed(card) ? 'r3' : '';
}

const groupDone = (k) => (ui.groups.get(k) || []).every((c) => reviewed(c) || !isLive(c));

/** The bar under the strings: the keys, and where to go next. */
function renderNextBar() {
  const bar = $('#nextbar');
  if (!bar) return;
  const hints = `<span class="hints"><kbd>1</kbd>–<kbd>5</kbd> rate <kbd>Enter</kbd> rewrite <kbd>C</kbd> comment <kbd>J</kbd><kbd>K</kbd> move</span>`;
  if (ui.query || !ui.group || !ui.keys.length) {
    bar.className = 'nextbar';
    bar.innerHTML = hints;
    return;
  }
  const next = adjacentGroup(1);
  const done = groupDone(ui.group);
  const noun = groupNoun();
  bar.className = `nextbar ${done ? 'arrived' : ''}`;
  if (next == null) {
    bar.innerHTML = `${hints}<span class="next-label">${done ? `All ${noun}s reviewed.` : `Last ${noun}.`}</span><button class="btn primary" data-action="export">Generate prompt <kbd>E</kbd></button>`;
    return;
  }
  bar.innerHTML = `${hints}<span class="next-label">${done ? `${cap(noun)} done.` : ''} Next ${noun}</span><button class="next-stop" data-action="next-group"><span>${esc(groupName(next))}</span> <kbd>]</kbd></button>`;
}

/** Flagged strings on this screen that haven't been sent yet. */
function pendingOn(screen) {
  return selectForPrompt(state.copy, state.feedback, { ...exportOptions(), screen, pending: true, includeExemplars: false }).flagged;
}

function queueButton(screen) {
  const n = new Set(pendingOn(screen).filter((it) => it.screen === screen).map((it) => normalizeText(it.text))).size;
  return `<button class="btn small queue-screen" data-queue="${esc(screen)}" ${n ? '' : 'disabled'} title="Queue this screen's feedback for Claude Code. Then say “apply” there.">${n ? `Queue this screen · ${n}` : 'Nothing to queue'}</button>`;
}

/** Queue one screen's pending feedback as a batch for Claude Code, and mark it sent. */
async function queueScreen(screen) {
  const opts = { ...exportOptions(), screen, pending: true };
  const { flagged } = selectForPrompt(state.copy, state.feedback, opts);
  if (!flagged.length) return toast('Nothing to queue on this screen');
  const shots = Object.fromEntries(Object.entries(state.screenshots).map(([k, v]) => [k, v.split('?')[0]]));
  const text = buildPrompt({ copy: state.copy, feedback: state.feedback, voice: state.voice, screenshots: shots, expert: state.expert }, opts);
  const res = await fetch(`/api/batch?screen=${encodeURIComponent(screen)}`, { method: 'PUT', body: text }).catch(() => null);
  if (!res || !res.ok) return toast("Couldn't queue this screen. Is the review server running?");
  const at = new Date().toISOString();
  for (const it of flagged) {
    const e = state.feedback.items[it.id];
    if (e) e.sent = sentMark(e, at);
  }
  scheduleSave();
  const sentIds = new Set(flagged.map((it) => it.id));
  for (const c of cardById.values()) if (c.items.some((it) => sentIds.has(it.id))) refreshCard(c.id);
  renderProgress();
  const n = new Set(flagged.map((it) => normalizeText(it.text))).size;
  rebaseline();
  toast(`Queued ${plural(n, 'string')} from ${screen} for Claude. Say “apply” in Claude Code when you’re ready.`);
}

function buildGroup({ k, i, cards: list2 }) {
  const sec = document.createElement('section');
  sec.className = 'group';
  sec.id = `group-${i}`;
  sec.dataset.key = k;
  const done = list2.filter(reviewed).length;
  const info = ui.groupBy === 'screen' ? screenInfo(k) : {};
  const title = ui.groupBy === 'file' ? `<code>${esc(k)}</code>` : esc(groupName(k));
  const ticks = list2.map((c) => `<i data-t="${c.id}" class="${tickClass(c)}"></i>`).join('');
  sec.innerHTML = `
    <div class="group-head">
      <span class="seq">${stopCode(i)}</span>
      <div class="group-title"><h2>${title}</h2>${info.description ? `<p class="desc">${esc(info.description)}</p>` : ''}</div>
      <div class="group-side"><span class="count">${done} of ${list2.length} reviewed</span>${ui.groupBy === 'screen' ? queueButton(k) : ''}</div>
      <div class="ticks" aria-hidden="true" >${ticks}</div>
    </div>`;
  const frag = document.createDocumentFragment();
  for (const c of list2) frag.appendChild(cardEl(c));
  sec.appendChild(frag);
  return sec;
}

/** Append pending groups until about `budget` cards are on the page (Infinity = all). */
function drainPending(budget) {
  const list = $('#list');
  let n = 0;
  while (pending.length && n < budget) {
    const g = pending.shift();
    list.appendChild(buildGroup(g));
    n += g.cards.length;
  }
}

function scheduleIdle() {
  const step = () => {
    drainPending(150);
    if (pending.length) idleHandle = setTimeout(step, 16);
    else idleHandle = null;
  };
  idleHandle = setTimeout(step, 16);
}

function cancelIdle() {
  clearTimeout(idleHandle);
  idleHandle = null;
}

/** Make sure a card is in the DOM before focusing or scrolling to it. */
function ensureRendered(id) {
  if (!pending.length || $(`.card[data-id="${id}"]`)) return;
  cancelIdle();
  drainPending(Infinity);
}

function renderSidebar(keys, groups) {
  $('#sidebar').innerHTML =
    keys
      .map((k, i) => {
        const list = groups.get(k);
        const done = list.filter(reviewed).length;
        const pct = list.length ? Math.round((done / list.length) * 100) : 0;
        const name = groupName(k);
        const hasShot = ui.groupBy === 'screen' && state.screenshots[slugify(k)];
        const active = !ui.query && k === ui.group ? 'active' : '';
        return `<button class="group-link ${pct === 100 ? 'done' : pct ? 'started' : ''} ${active}" data-target="group-${i}" data-key="${esc(k)}" title="${esc(k)}" style="--pct:${pct}%" ${active ? 'aria-current="location"' : ''}><span class="node" aria-hidden="true"></span><span class="name">${esc(name)}</span><span class="num">${done}/${list.length}${hasShot ? '<span class="visually-hidden">, has a screenshot</span>' : ''}</span><span class="here">You are here</span></button>`;
      })
      .join('');
}

function renderCounts() {
  const all = liveCards();
  const done = all.filter(reviewed).length;
  const flagged = all.filter((c) => isFlagged(fbOf(c.lead.id), 3)).length;
  $('#progress-text').textContent = `${done} of ${all.length} reviewed · ${flagged} flagged`;
  $('#progress-fill').style.width = all.length ? `${(done / all.length) * 100}%` : '0';
  const counts = {
    all: all.length,
    unrated: all.length - done,
    flagged,
    later: all.filter((c) => cardFb(c).later).length,
    sent: all.filter((c) => isSent(cardFb(c))).length,
    fresh: all.filter((c) => c.lead.status === 'new' || c.lead.status === 'changed').length,
    claude: all.filter(expertFlagged).length,
    removed: cards.length - all.length,
  };
  for (const btn of $$('#filters button')) {
    const f = btn.dataset.filter;
    btn.innerHTML = `${btn.dataset.label} <span class="count">${counts[f]}</span>`;
    if (f === 'removed' || f === 'fresh' || f === 'claude' || f === 'later' || f === 'sent') btn.hidden = counts[f] === 0 && ui.filter !== f;
  }
  // Finished everything for the first time this session: show where things stand.
  if (renderCounts.lastLeft > 0 && counts.unrated === 0 && all.length && !ui.summaryShown) {
    ui.summaryShown = true;
    setTimeout(openSummary, 400);
  }
  renderCounts.lastLeft = counts.unrated;
}

/** Update counters without rebuilding the list. */
function renderProgress() {
  renderCounts();
  for (const sec of $$('.group')) {
    const ids = $$('.card', sec).map((c) => c.dataset.id);
    const done = ids.filter((id) => reviewed(cardById.get(id))).length;
    const c = $('.group-head .count', sec);
    if (c) c.textContent = `${done} of ${ids.length} reviewed`;
    const queue = $('.queue-screen', sec);
    if (queue) queue.outerHTML = queueButton(sec.dataset.key);
    for (const t of $$('.ticks i', sec)) t.className = `${tickClass(cardById.get(t.dataset.t))}${t.dataset.t === ui.focusId ? ' on' : ''}`;
    const link = $(`.group-link[data-target="${sec.id}"]`);
    if (link) {
      const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
      $('.num', link).textContent = `${done}/${ids.length}`;
      link.style.setProperty('--pct', `${pct}%`);
      link.classList.toggle('done', pct === 100);
      link.classList.toggle('started', pct > 0 && pct < 100);
    }
  }
  renderFocusBar();
  renderNextBar();
}

function renderFocusBar() {
  const bar = $('#focus-bar');
  if (!bar) return;
  if (ui.mode !== 'focus' || !ui.focusId) {
    bar.innerHTML = '';
    return;
  }
  const i = ui.visible.indexOf(ui.focusId);
  const left = ui.visible.filter((id) => !reviewed(cardById.get(id))).length;
  bar.innerHTML = `
    <button class="btn small ghost" data-action="prev" ${i <= 0 ? 'disabled' : ''}><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg> Previous <kbd>K</kbd></button>
    <span><b>${i + 1}</b> of ${ui.visible.length}${ui.query ? '' : ` in ${esc(ui.group)}`} · ${left} left to review</span>
    <button class="btn small ghost" data-action="next" ${i >= ui.visible.length - 1 ? 'disabled' : ''}>Next <kbd>J</kbd> <svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg></button>`;
}

function renderKinds() {
  const counts = new Map();
  for (const c of liveCards()) for (const k of new Set(c.items.map((it) => it.kind || 'other'))) counts.set(k, (counts.get(k) || 0) + 1);
  const sel = $('#kind-filter');
  const kinds = [...counts.keys()].sort((a, b) => (KINDS.indexOf(a) + 1 || 99) - (KINDS.indexOf(b) + 1 || 99));
  if (!kinds.includes(ui.kind)) ui.kind = 'all';
  sel.innerHTML = `<option value="all">All kinds</option>` + kinds.map((k) => `<option value="${esc(k)}">${esc(kindLabel(k))} (${counts.get(k)})</option>`).join('');
  sel.value = ui.kind;
}

// ---------- screenshot panel ----------

/** Strings on a screen whose text changed after its screenshot was taken. */
function retakeQueued(slug) {
  return (state.batches || []).some((f) => f.endsWith(`-retake-${slug}.md`));
}

function retakeButton(slug, screen, label = 'Ask Claude to retake it') {
  return retakeQueued(slug)
    ? `<span class="retake-queued">Retake queued. Say “apply” in Claude Code.</span>`
    : `<button class="link small" data-action="retake" data-screen="${esc(screen)}">${label}</button>`;
}

/** Queue a screenshot retake for this screen; "apply" in Claude Code picks it up with the copy batches. */
async function queueRetake(screen) {
  const info = screenInfo(screen);
  const strings = items().filter((it) => it.screen === screen && it.status !== 'removed').length;
  const text = [
    `# Retake screenshot: ${screen}`,
    '',
    `Retake the screenshot of **${screen}** and mark where its strings are (copyproof step 4), so it shows the current text.`,
    info.route ? `Route: \`${info.route}\`` : null,
    info.description ? `What it is: ${info.description}` : null,
    `Strings on this screen: ${strings}. Get it into the state that shows the most of them.`,
  ].filter((l) => l != null).join('\n') + '\n';
  const res = await fetch(`/api/batch?screen=${encodeURIComponent(screen)}&kind=retake`, { method: 'PUT', body: text }).catch(() => null);
  if (!res || !res.ok) return toast('Could not queue the retake');
  const { path } = await res.json();
  state.batches = [...(state.batches || []), path.split('/').pop()];
  $('#panel').dataset.key = '';
  renderPanel();
  rebaseline();
  toast(`Retake of ${screen} queued. Say “apply” in Claude Code.`);
}

function changedSinceShot(slug) {
  const taken = state.screenshotTimes[slug];
  if (!taken) return 0;
  return items().filter((it) => slugify(it.screen) === slug && it.status !== 'removed' && it.updatedAt && it.updatedAt > taken).length;
}

/**
 * For a string that isn't on the screenshot: the marked string on the same screen that makes it
 * appear (its `trigger`, e.g. the button that shows an error), so the panel can point there instead.
 */
function triggerOf(it) {
  if (!it || it.box || !it.trigger) return null;
  const want = normalizeText(it.trigger).toLowerCase();
  const slug = slugify(it.screen);
  const onScreen = items().filter((x) => x.box && x.status !== 'removed' && slugify(x.screen) === slug);
  return (
    onScreen.find((x) => normalizeText(x.text).toLowerCase() === want) ||
    onScreen.find((x) => normalizeText(x.text).toLowerCase().startsWith(want)) ||
    null
  );
}

function shotMarkup(slug, current, { interactive }) {
  const src = state.screenshots[slug];
  const trigger = triggerOf(current);
  const boxes = items()
    .filter((it) => it.box && it.status !== 'removed' && slugify(it.screen) === slug)
    .map((it) => {
      const b = it.box;
      const isCur = current && (it.id === current.id || (trigger && it.id === trigger.id));
      const card = cardOfItem.get(it.id);
      const tag = interactive ? 'button' : 'div';
      const isTrigger = trigger && it.id === trigger.id;
      return `<${tag} class="box ${isCur ? 'current' : ''} ${isTrigger ? 'trigger' : ''}" ${interactive ? `data-action="box" data-item="${it.id}"` : ''} title="${esc(card ? card.lead.text : it.text)}" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%"></${tag}>`;
    })
    .join('');
  return `<div class="shot-inner ${ui.drawing && interactive ? 'drawing' : ''}"><img src="/${esc(src)}" alt="Screenshot of ${esc(screenInfo(slug).name)}" draggable="false">${boxes}</div>`;
}

function renderPanel() {
  const panel = $('#panel');
  const card = ui.focusId && cardById.get(ui.focusId);
  if (!card) {
    panel.dataset.key = '';
    panel.innerHTML = `<div class="panel-empty"><p><strong>Select a string</strong>Its screen shows up here, with the string highlighted.</p></div>`;
    return;
  }
  const it = panelItem(card);
  const slug = slugify(it.screen);
  const info = screenInfo(it.screen);
  const src = state.screenshots[slug];
  const head = `
    <div class="panel-head">
      <div>
        <h3>${esc(info.name)}</h3>
        ${info.description ? `<p>${esc(info.description)}</p>` : ''}
      </div>
      ${info.route ? `<code class="route">${esc(info.route)}</code>` : ''}
    </div>`;
  if (!src) {
    ui.drawing = false;
    panel.dataset.key = '';
    panel.innerHTML = `${head}
      <button class="shot-empty" data-action="shot-add" data-slug="${slug}">
        <strong>Add a screenshot of ${esc(info.name)}</strong>
        <span>Drop an image here, paste one, or click to choose a file.</span>
      </button>
      <p class="panel-note">${retakeButton(slug, it.screen, 'Ask Claude to capture it')} For web apps it also marks where each string is.</p>`;
    return;
  }
  const trigger = triggerOf(it);
  const status = it.box
    ? `<span class="marked">Highlighted on the screenshot${it.box.source === 'manual' ? ' (marked by you)' : ''}</span>`
    : trigger
      ? `<span class="marked trigger">Not on this screenshot. It appears from the dashed box${it.when ? `: ${esc(it.when)}` : '.'}</span>`
      : it.when
        ? `<span class="unmarked">Not on this screenshot. <strong>Appears:</strong> ${esc(it.when)}</span>`
        : `<span class="unmarked">Not marked on this screenshot</span>`;
  const stale = changedSinceShot(slug);
  panel.dataset.key = `${slug}|${src}|${it.id}|${ui.drawing}|${stale}`;
  panel.innerHTML = `${head}
    ${stale ? `<p class="shot-stale">This screenshot is older than ${plural(stale, 'changed string')} on this screen, so it may show old text. ${retakeButton(slug, it.screen)}</p>` : ''}
    <div class="shot-wrap" id="shot-wrap">${shotMarkup(slug, it, { interactive: true })}</div>
    <div class="panel-foot">
      <p class="panel-status">${ui.drawing ? '<span class="marked">Drag a box around the string. <kbd>Esc</kbd> to cancel.</span>' : status}</p>
      <div class="panel-actions">
        <button class="btn small ${ui.drawing ? 'primary' : ''}" data-action="draw">${it.box ? 'Re-mark' : 'Mark location'} <kbd>M</kbd></button>
        ${it.box ? `<button class="btn small ghost" data-action="clear-box">Clear</button>` : ''}
        <span class="spacer"></span>
        <button class="btn small ghost" data-action="shot-zoom">Enlarge</button>
        <button class="btn small ghost" data-action="shot-add" data-slug="${slug}">Replace</button>
        <button class="btn small ghost" data-action="shot-remove" data-slug="${slug}">Remove</button>
      </div>
    </div>`;
  const img = $('#shot-wrap img');
  const scroll = () => scrollToBox(it.box ? it : trigger || it);
  if (img.complete) scroll();
  else img.addEventListener('load', scroll, { once: true });
}

function scrollToBox(it) {
  const wrap = $('#shot-wrap');
  if (!wrap || !it.box) return;
  const inner = $('.shot-inner', wrap);
  const top = it.box.y * inner.offsetHeight;
  const h = it.box.h * inner.offsetHeight;
  wrap.scrollTo({ top: Math.max(0, top + h / 2 - wrap.clientHeight / 2), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function startDrawing() {
  const card = ui.focusId && cardById.get(ui.focusId);
  if (!card) return toast('Select a string first');
  const it = panelItem(card);
  if (!state.screenshots[slugify(it.screen)]) return toast(`Add a screenshot of ${it.screen} first`);
  if (getComputedStyle($('#panel')).display === 'none') return toast('Widen the window to mark locations');
  ui.drawing = !ui.drawing;
  renderPanel();
}

function bindDrawing(panel) {
  let start = null;
  let ghost = null;
  const frac = (e, inner) => {
    const r = inner.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  panel.addEventListener('pointerdown', (e) => {
    const inner = e.target.closest('.shot-inner.drawing');
    if (!inner || e.button !== 0) return;
    e.preventDefault();
    try {
      inner.setPointerCapture(e.pointerId);
    } catch {}
    start = { ...frac(e, inner), inner };
    ghost = document.createElement('div');
    ghost.className = 'box drawing-box';
    inner.appendChild(ghost);
  });
  panel.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = frac(e, start.inner);
    Object.assign(ghost.style, {
      left: Math.min(p.x, start.x) * 100 + '%',
      top: Math.min(p.y, start.y) * 100 + '%',
      width: Math.abs(p.x - start.x) * 100 + '%',
      height: Math.abs(p.y - start.y) * 100 + '%',
    });
  });
  panel.addEventListener('pointerup', async (e) => {
    if (!start) return;
    const p = frac(e, start.inner);
    const box = { x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    start = null;
    ghost?.remove();
    if (box.w < 0.01 || box.h < 0.004) return toast('Drag to draw a box around the string');
    const card = cardById.get(ui.focusId);
    ui.drawing = false;
    await saveBox(panelItem(card), box);
  });
}

async function saveBox(it, box) {
  const res = await fetch(`/api/box/${it.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-scanned-at': state.copy.scannedAt || '' },
    body: JSON.stringify(box),
  }).catch(() => null);
  if (res && res.status === 409) {
    await load();
    return toast('The copy was rescanned, so the latest version is loaded. Mark it again.');
  }
  if (!res || !res.ok) return toast('Could not save the location');
  if (box) it.box = { ...box, source: 'manual' };
  else delete it.box;
  renderPanel();
  rebaseline();
  toast(box ? 'Location saved' : 'Location cleared');
}

// ---------- focus & navigation ----------

function setFocus(id, { scroll = true } = {}) {
  const changed = ui.focusId !== id;
  if (ui.focusId) $(`.card[data-id="${ui.focusId}"]`)?.classList.remove('focused');
  if (changed && ui.editingId && ui.editingId !== id) commitEdit(cardById.get(ui.editingId), $('[data-edit]')?.value);
  if (changed) ui.drawing = false;
  ui.focusId = id;
  if (id) ensureRendered(id);
  const el = id && $(`.card[data-id="${id}"]`);
  if (!el) return renderPanel();
  el.classList.add('focused');
  $('.ticks i.on')?.classList.remove('on');
  $(`.ticks i[data-t="${id}"]`)?.classList.add('on');
  const slot = $('[data-tags-slot]', el);
  if (slot && !slot.childElementCount) slot.innerHTML = tagsHtml(cardFb(cardById.get(id)));
  if (scroll) el.scrollIntoView({ block: ui.mode === 'focus' ? 'nearest' : 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const sec = el.closest('.group');
  $$('.group-link').forEach((l) => l.classList.toggle('active', l.dataset.target === sec?.id));
  if (changed || !$('#panel').dataset.key) renderPanel();
  renderFocusBar();
}

function move(delta) {
  if (!ui.visible.length) return;
  const i = ui.visible.indexOf(ui.focusId);
  const edge = delta > 0 ? i === ui.visible.length - 1 : i === 0;
  const over = !ui.query && edge ? adjacentGroup(Math.sign(delta)) : null;
  if (over != null) {
    showGroup(over, { pick: delta > 0 ? 'first' : 'last' });
    return toast(`Now on ${over}`);
  }
  const next = i === -1 ? (delta > 0 ? 0 : ui.visible.length - 1) : Math.min(ui.visible.length - 1, Math.max(0, i + delta));
  setFocus(ui.visible[next]);
}

function nextUnrated() {
  const start = Math.max(0, ui.visible.indexOf(ui.focusId) + 1);
  const order = [...ui.visible.slice(start), ...ui.visible.slice(0, start)];
  const id = order.find((x) => !reviewed(cardById.get(x)) && isLive(cardById.get(x)));
  if (id) return setFocus(id);
  // This screen is done: go to the next one with something left.
  const from = Math.max(0, ui.keys.indexOf(ui.group));
  const rest = [...ui.keys.slice(from + 1), ...ui.keys.slice(0, from)];
  const k = !ui.query && rest.find((x) => ui.groups.get(x).some((c) => isLive(c) && !reviewed(c)));
  if (!k) return toast('Everything in view is reviewed');
  showGroup(k);
  toast(`Now on ${k}`);
}

function setMode(mode) {
  ui.mode = mode;
  savePrefs({ mode });
  document.body.classList.toggle('mode-focus', mode === 'focus');
  $$('#view-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  render();
  if (mode === 'focus') window.scrollTo({ top: 0 });
}

// ---------- mutations ----------

function afterChange(card, focusSel) {
  refreshCard(card.id, focusSel);
  renderProgress();
  if (ui.query || !ui.group || ui.doneSeen.has(ui.group) || !groupDone(ui.group)) return;
  ui.doneSeen.add(ui.group);
  const next = adjacentGroup(1);
  const noun = groupNoun();
  toast(next != null ? `${groupName(ui.group)} is done. Press ] for the next ${noun}, ${groupName(next)}.` : `Every ${noun} is reviewed. Press E to generate the prompt.`);
}

function rate(card, v) {
  const fb = cardFb(card);
  const next = v == null || fb.rating === v ? undefined : v;
  mutate(card, (cur) => {
    cur.rating = next;
  });
  afterChange(card);
  // Low ratings stay put so you can say why; the card shows a nudge.
  if (ui.autoAdvance && next != null && next >= 3) {
    const i = ui.visible.indexOf(card.id);
    if (i >= 0 && i < ui.visible.length - 1) setTimeout(() => setFocus(ui.visible[i + 1]), 120);
  }
}

function toggleLater(card) {
  mutate(card, (cur) => {
    cur.later = cur.later ? undefined : true;
  });
  afterChange(card);
}

function toggleTag(card, tag) {
  mutate(card, (cur) => {
    const set = new Set(cur.tags || []);
    set.has(tag) ? set.delete(tag) : set.add(tag);
    cur.tags = [...set];
  });
  afterChange(card);
}

function setVerdict(card, v) {
  if (card.lead.status !== 'changed') return toast('Only revised strings can be accepted or sent back');
  mutate(card, (cur) => {
    cur.verdict = v || undefined;
  });
  if (v === 'rejected') {
    ui.openComments.add(card.id);
    afterChange(card, 'textarea[data-field="comment"]');
    toast('Say what is still wrong, then move on');
  } else {
    afterChange(card);
    if (v === 'accepted' && ui.autoAdvance) move(1);
  }
}

function startEdit(card) {
  ui.editingId = card.id;
  setFocus(card.id, { scroll: false });
  refreshCard(card.id, '[data-edit]');
}

function commitEdit(card, value) {
  if (!card || ui.editingId !== card.id) return;
  ui.editingId = null;
  const v = (value ?? '').trim();
  const before = (cardFb(card).suggestion || '').trim();
  const next = !v || normalizeText(v) === normalizeText(card.lead.text) ? '' : v;
  if (next !== before) mutate(card, (cur) => (cur.suggestion = next || undefined));
  afterChange(card);
}

function cancelEdit(card) {
  ui.editingId = null;
  refreshCard(card.id);
  $(`.card[data-id="${card.id}"]`)?.focus({ preventScroll: true });
}

function setSplit(card, split) {
  const set = new Set(state.feedback.split || []);
  split ? set.add(card.key) : set.delete(card.key);
  state.feedback.split = [...set];
  if (!state.feedback.split.length) delete state.feedback.split;
  if (!split) {
    // Joining: everyone takes the feedback of the card you clicked.
    const src = clone(cardFb(card));
    for (const it of items()) {
      if (it.status !== 'removed' && normalizeText(it.text) === card.key && it.id !== card.lead.id) {
        const e = (state.feedback.items[it.id] ||= {});
        for (const k of FB_FIELDS) src[k] == null ? delete e[k] : (e[k] = clone(src[k]));
        prune(it.id);
      }
    }
  }
  scheduleSave();
  const leadId = card.lead.id;
  buildCards();
  ui.focusId = cardOfItem.get(leadId)?.id || null;
  render();
  toast(split ? 'Each place is now its own card' : 'Joined. One rating for every place');
}

// ---------- persistence ----------

let saveTimer = null;
let dirty = false;
// Feedback entries changed since the last successful save, so a reload can carry them over.
const unsaved = new Set();
function scheduleSave() {
  dirty = true;
  setSaveState('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
async function save({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  try {
    const res = await fetch('/api/feedback', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-scanned-at': state.copy.scannedAt || '' },
      body: JSON.stringify(state.feedback),
      keepalive,
    });
    if (res.status === 409) {
      await load();
      toast('The copy was rescanned, so the latest version is loaded. Your last change may need redoing.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    unsaved.clear();
    setSaveState('Saved');
  } catch {
    dirty = true;
    setSaveState('Not saved, retrying', true);
    saveTimer = setTimeout(save, 3000);
  }
}
function setSaveState(text, error = false) {
  const el = $('#save-state');
  el.textContent = text;
  el.classList.toggle('error', error);
}
addEventListener('pagehide', () => save({ keepalive: true }));
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') return save({ keepalive: true });
  // Coming back to the tab: pick up a rescan that happened meanwhile.
  const res = await fetch('/api/state').catch(() => null);
  if (!res || !res.ok) return;
  const fresh = await res.json();
  if (fresh.copy.scannedAt !== state.copy.scannedAt && !dirty) {
    apply(fresh);
    toast('Loaded the latest scan');
  }
});

// ---------- screenshots ----------

async function uploadShot(slug, file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast('Use a PNG, JPEG, WebP or GIF');
  const res = await fetch(`/api/screenshot/${encodeURIComponent(slug)}`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
  if (!res.ok) return toast('Upload failed');
  const { path, cleared } = await res.json();
  state.screenshots[slug] = `${path}?v=${Date.now()}`;
  state.screenshotTimes[slug] = new Date().toISOString();
  for (const it of items()) if (slugify(it.screen) === slug) delete it.box;
  render();
  rebaseline();
  toast(cleared ? `Screenshot replaced. ${plural(cleared, 'marked location')} cleared.` : 'Screenshot added');
}

async function removeShot(slug) {
  await fetch(`/api/screenshot/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  delete state.screenshots[slug];
  for (const it of items()) if (slugify(it.screen) === slug) delete it.box;
  render();
  rebaseline();
}

function viewShot(card) {
  const it = panelItem(card);
  const slug = slugify(it.screen);
  if (!state.screenshots[slug]) return;
  $('#lightbox-frame').innerHTML = shotMarkup(slug, it, { interactive: false });
  $('#lightbox').showModal();
  const box = $('#lightbox .box.current');
  if (box) box.scrollIntoView({ block: 'center' });
}

// ---------- export & summary ----------

function exportOptions() {
  return {
    target: $('#export-target input:checked').value,
    maxRating: Number($('#export-max').value),
    includeExemplars: $('#export-exemplars').checked,
  };
}

function renderExport() {
  const opts = exportOptions();
  savePrefs({ export: opts });
  opts.pending = true;
  const sentCount = liveCards().filter((c) => isSent(cardFb(c))).length;
  const { flagged, exemplars } = selectForPrompt(state.copy, state.feedback, opts);
  const shots = Object.fromEntries(Object.entries(state.screenshots).map(([k, v]) => [k, v.split('?')[0]]));
  const text = flagged.length ? buildPrompt({ copy: state.copy, feedback: state.feedback, voice: state.voice, screenshots: shots, expert: state.expert }, opts) : '';
  $('#export-text').value = text || 'Nothing to send yet.\n\nRate strings 3 or lower, or add tags, a rewrite or a comment, and they show up here.';
  $('#export-copy').disabled = !text;
  const words = text ? text.split(/\s+/).length : 0;
  const n = (text.match(/^\d+\. /gm) || []).length;
  $('#export-summary').textContent = flagged.length
    ? `${plural(n, 'string')} to revise${exemplars.length ? ` · ${plural(exemplars.length, 'tone example')}` : ''} · about ${words.toLocaleString()} words${sentCount ? ` · ${sentCount} already queued left out` : ''}`
    : '';
  $('#export-saved').textContent = '';
}

function openExport() {
  renderExport();
  $('#export-dialog').showModal();
}

async function copyPrompt() {
  const text = $('#export-text').value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $('#export-text').select();
    document.execCommand('copy');
  }
  toast('Prompt copied');
  // Only a copied prompt goes to prompt.md: the apply step reads it, so a peek at the dialog mustn't change it.
  const res = await fetch('/api/prompt', { method: 'PUT', body: text }).catch(() => null);
  $('#export-saved').innerHTML = res && res.ok ? 'Saved to <code>.copyproof/prompt.md</code>. In Claude Code, say “apply my copy feedback”.' : 'Copied, but not saved to <code>.copyproof/prompt.md</code>. Is the review server running?';
}

function openSummary() {
  const all = liveCards();
  const done = all.filter(reviewed);
  const ratings = done.map((c) => cardFb(c).rating).filter((r) => r != null);
  const dist = [1, 2, 3, 4, 5].map((v) => ratings.filter((r) => r === v).length);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const flagged = all.filter((c) => isFlagged(fbOf(c.lead.id), 3)).length;
  const screens = new Map();
  for (const c of all) {
    const k = c.lead.screen || 'Unsorted';
    if (!screens.has(k)) screens.set(k, []);
    screens.get(k).push(c);
  }
  const rows = [...screens.entries()]
    .map(([name, list]) => {
      const rs = list.map((c) => cardFb(c).rating).filter((r) => r != null);
      return {
        name,
        total: list.length,
        done: list.filter(reviewed).length,
        flagged: list.filter((c) => isFlagged(fbOf(c.lead.id), 3)).length,
        avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      };
    })
    .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99) || b.flagged - a.flagged);
  const max = Math.max(1, ...dist);
  $('#summary-body').innerHTML = `
    <div class="summary-top">
      <div class="stat"><b>${done.length}</b><span>of ${all.length} reviewed</span></div>
      <div class="stat"><b>${avg == null ? '–' : avg.toFixed(1)}</b><span>average rating</span></div>
      <div class="stat"><b>${flagged}</b><span>flagged to fix</span></div>
      <div class="dist" aria-label="Rating distribution">
        ${dist.map((n, i) => `<div class="dist-col" title="${n} rated ${i + 1}"><span class="dist-bar r${i + 1}" style="height:${(n / max) * 100}%"></span><span class="dist-n">${n}</span><span class="dist-l">${i + 1}</span></div>`).join('')}
      </div>
    </div>
    <table class="summary-table">
      <thead><tr><th>Screen</th><th>Reviewed</th><th>Average</th><th>Flagged</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><td><button class="link" data-screen="${esc(r.name)}">${esc(r.name)}</button></td><td><span class="mini-track"><span style="width:${(r.done / r.total) * 100}%"></span></span>${r.done}/${r.total}</td><td>${r.avg == null ? '<span class="muted">not started</span>' : r.avg.toFixed(1)}</td><td>${r.flagged || '<span class="muted">0</span>'}</td></tr>`
        )
        .join('')}</tbody>
    </table>`;
  $('#summary-dialog').showModal();
}

// ---------- events ----------

async function openSource(it) {
  const res = await fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: it.file, line: it.line }) }).catch(() => null);
  if (!res || !res.ok) toast(`Could not open ${it.file}`);
}

function bind() {
  for (const btn of $$('#filters button')) btn.dataset.label = btn.textContent.trim();
  document.body.classList.toggle('mode-focus', ui.mode === 'focus');
  document.body.classList.toggle('compact', ui.compact);
  $$('#view-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)));

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    ui.filter = btn.dataset.filter;
    $$('#filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render();
    window.scrollTo({ top: 0 });
  });
  $('#view-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });

  const search = $('#search');
  search.addEventListener('input', () => {
    ui.query = search.value.trim().toLowerCase();
    clearTimeout(search.t);
    search.t = setTimeout(render, 120);
  });
  $('#kind-filter').addEventListener('change', (e) => {
    ui.kind = e.target.value;
    render();
  });
  const groupBy = $('#group-by');
  groupBy.value = ui.groupBy;
  groupBy.addEventListener('change', () => {
    ui.groupBy = groupBy.value;
    savePrefs({ groupBy: ui.groupBy });
    ui.group = null;
    ui.focusId = null;
    render();
  });
  const auto = $('#auto-advance');
  auto.checked = ui.autoAdvance;
  auto.addEventListener('change', () => {
    ui.autoAdvance = auto.checked;
    savePrefs({ autoAdvance: ui.autoAdvance });
  });
  const compact = $('#compact');
  compact.checked = ui.compact;
  compact.addEventListener('change', () => {
    ui.compact = compact.checked;
    savePrefs({ compact: ui.compact });
    document.body.classList.toggle('compact', ui.compact);
  });
  $('#undo').addEventListener('click', undo);
  $('#find-toggle').addEventListener('click', (e) => {
    const open = document.body.classList.toggle('find-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    if (open) $('#search').focus();
  });
  $('#progress-text').addEventListener('click', openSummary);

  $('#sidebar').addEventListener('click', (e) => {
    const link = e.target.closest('.group-link');
    if (!link) return;
    if (!ui.query) return showGroup(link.dataset.key);
    if (!document.getElementById(link.dataset.target)) {
      cancelIdle();
      drainPending(Infinity);
    }
    const sec = document.getElementById(link.dataset.target);
    const first = $('.card', sec);
    if (ui.mode === 'focus' && first) return setFocus(first.dataset.id);
    sec?.scrollIntoView({ block: 'start' });
    if (first) setFocus(first.dataset.id, { scroll: false });
  });

  $('#nextbar').addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'next-group' && adjacentGroup(1) != null) showGroup(adjacentGroup(1));
    else if (a === 'export') openExport();
  });
  const list = $('#list');
  list.addEventListener('click', (e) => {
    const queue = e.target.closest('.queue-screen');
    if (queue) return queueScreen(queue.dataset.queue);
    const act = e.target.closest('[data-action]');
    if (act?.dataset.action === 'prev') return move(-1);
    if (act?.dataset.action === 'next') return move(1);
    const cardEl2 = e.target.closest('.card');
    if (!cardEl2) return;
    const card = cardById.get(cardEl2.dataset.id);
    if (!e.target.closest('textarea')) setFocus(card.id, { scroll: false });
    if (!act) return;
    const a = act.dataset.action;
    if (a === 'rate') rate(card, Number(act.dataset.v));
    else if (a === 'take-rating') rate(card, exOf(card).rating);
    else if (a === 'take-rewrite') {
      mutate(card, (cur) => (cur.suggestion = exOf(card).rewrite));
      afterChange(card);
    } else if (a === 'take-tags') {
      mutate(card, (cur) => (cur.tags = [...(exOf(card).tags || [])]));
      afterChange(card);
    }
    else if (a === 'tag') toggleTag(card, act.dataset.tag);
    else if (a === 'later') toggleLater(card);
    else if (a === 'edit') startEdit(card);
    else if (a === 'discard') {
      mutate(card, (cur) => (cur.suggestion = undefined));
      afterChange(card);
    } else if (a === 'comment') {
      ui.openComments.add(card.id);
      refreshCard(card.id, 'textarea[data-field="comment"]');
    } else if (a === 'verdict') setVerdict(card, act.dataset.v);
    else if (a === 'open') openSource(card.lead);
    else if (a === 'open-item') openSource(items().find((x) => x.id === act.dataset.item));
    else if (a === 'places') {
      ui.openPlaces.has(card.id) ? ui.openPlaces.delete(card.id) : ui.openPlaces.add(card.id);
      refreshCard(card.id);
    } else if (a === 'split') setSplit(card, true);
    else if (a === 'join') setSplit(card, false);
    else if (a === 'view-shot') viewShot(card);
  });
  list.addEventListener('input', (e) => {
    const ta = e.target;
    if (ta.matches('[data-edit]')) {
      autosize(ta);
      updateCharcount(cardById.get(ta.closest('.card').dataset.id), ta);
      return;
    }
    if (!ta.matches('textarea[data-field="comment"]')) return;
    const card = cardById.get(ta.closest('.card').dataset.id);
    mutate(card, (cur) => (cur.comment = ta.value), { undo: false });
    renderProgress();
  });
  list.addEventListener('focusin', (e) => {
    const card = e.target.closest('.card');
    if (card && card.dataset.id !== ui.focusId) setFocus(card.dataset.id, { scroll: false });
    // One undo step per comment-editing session, not per keystroke.
    if (e.target.matches('textarea[data-field="comment"]')) pushUndo(cardById.get(card.dataset.id));
  });
  list.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-edit]')) return;
    const card = cardById.get(e.target.closest('.card').dataset.id);
    // Let a click on Edit/Discard etc. land first.
    setTimeout(() => ui.editingId === card.id && commitEdit(card, e.target.value), 0);
  });
  list.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-edit]')) return;
    const card = cardById.get(e.target.closest('.card').dataset.id);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit(card, e.target.value);
      $(`.card[data-id="${card.id}"]`)?.focus({ preventScroll: true });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit(card);
    }
  });

  // Screenshot panel
  const panel = $('#panel');
  panel.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (!act) return;
    const a = act.dataset.action;
    const card = ui.focusId && cardById.get(ui.focusId);
    if (a === 'shot-add') {
      ui.shotTarget = act.dataset.slug;
      $('#shot-input').click();
    } else if (a === 'shot-remove') removeShot(act.dataset.slug);
    else if (a === 'shot-zoom' && card) viewShot(card);
    else if (a === 'retake') queueRetake(act.dataset.screen);
    else if (a === 'draw') startDrawing();
    else if (a === 'clear-box' && card) saveBox(panelItem(card), null);
    else if (a === 'box' && !ui.drawing) {
      const target = cardOfItem.get(act.dataset.item);
      if (target) goTo(target.id);
    }
  });
  bindDrawing(panel);
  for (const zone of [panel, list]) {
    zone.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      panel.classList.add('dragover');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) panel.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      panel.classList.remove('dragover');
      const sec = e.target.closest('.group');
      const card = ui.focusId && cardById.get(ui.focusId);
      const slug = zone === list && sec && ui.groupBy === 'screen' ? slugify(sec.dataset.key) : card ? slugify(panelItem(card).screen) : null;
      if (!slug) return toast('Select a string first, so I know which screen this is');
      uploadShot(slug, e.dataTransfer.files[0]);
    });
  }
  document.addEventListener('paste', (e) => {
    if (e.target.closest('textarea, input') || !ui.focusId) return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      uploadShot(slugify(panelItem(cardById.get(ui.focusId)).screen), file);
    }
  });
  $('#shot-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && ui.shotTarget) uploadShot(ui.shotTarget, file);
    e.target.value = '';
  });

  // Dialogs
  $('#open-export').addEventListener('click', openExport);
  $('#summary-export').addEventListener('click', () => {
    $('#summary-dialog').close();
    openExport();
  });
  $('#summary-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-screen]');
    if (!btn) return;
    $('#summary-dialog').close();
    const card = liveCards().find((c) => c.lead.screen === btn.dataset.screen && !reviewed(c)) || liveCards().find((c) => c.lead.screen === btn.dataset.screen);
    if (!card) return;
    if (!matchesFilter(card) || !matchesKind(card) || !matchesQuery(card)) {
      ui.filter = 'all';
      ui.kind = 'all';
      ui.query = '';
      $('#search').value = '';
      $('#kind-filter').value = 'all';
      $$('#filters button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === 'all')));
      render();
    }
    goTo(card.id);
  });
  $('#export-target').addEventListener('change', renderExport);
  $('#export-max').addEventListener('change', renderExport);
  $('#export-exemplars').addEventListener('change', renderExport);
  $('#export-copy').addEventListener('click', copyPrompt);
  const saved = prefs.export;
  if (saved) {
    const radio = $(`#export-target input[value="${saved.target}"]`);
    if (radio) radio.checked = true;
    if (saved.maxRating) $('#export-max').value = String(saved.maxRating);
    $('#export-exemplars').checked = saved.includeExemplars !== false;
  }

  $('#open-voice').addEventListener('click', () => {
    $('#voice-text').value = state.voice;
    $('#voice-saved').textContent = '';
    $('#voice-dialog').showModal();
  });
  $('#voice-save').addEventListener('click', async () => {
    state.voice = $('#voice-text').value;
    const res = await fetch('/api/voice', { method: 'PUT', body: state.voice }).catch(() => null);
    if (res && res.ok) {
      $('#voice-dialog').close();
      toast('Voice notes saved');
    } else $('#voice-saved').textContent = 'Could not save. Is the server still running?';
  });
  $('#open-help').addEventListener('click', () => $('#help-dialog').showModal());
  const menu = $('#view-menu');
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  for (const b of $$('.menu-item', menu)) b.addEventListener('click', () => (menu.open = false));
  $('#lightbox').addEventListener('click', (e) => e.target.id === 'lightbox' && $('#lightbox').close());

  document.addEventListener('keydown', onKey);
  new ResizeObserver(([e]) => document.documentElement.style.setProperty('--top', `${Math.ceil(e.borderBoxSize[0].blockSize)}px`)).observe($('.topbar'));
}

function onKey(e) {
  if ($('dialog[open]')) return;
  const t = e.target;
  const typing = t instanceof Element && t.matches('textarea, input, select');
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    return undo();
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing) {
    if (e.key === 'Escape') {
      t.blur();
      if (t.id === 'search') return;
      t.closest('.card')?.focus({ preventScroll: true });
    }
    return;
  }
  if (e.key === 'Escape' && ui.drawing) {
    ui.drawing = false;
    return renderPanel();
  }
  const card = ui.focusId && cardById.get(ui.focusId);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const handled = () => e.preventDefault();
  if (k === 'j' || k === 'ArrowDown') return handled(), move(1);
  if (k === 'k' || k === 'ArrowUp') return handled(), move(-1);
  if (k === '/') return handled(), document.body.classList.add('find-open'), $('#search').focus();
  if (k === '?') return handled(), $('#help-dialog').showModal();
  if (k === 'e') return handled(), openExport();
  if (k === 'n') return handled(), nextUnrated();
  if ((k === ']' || k === '[') && !ui.query) {
    handled();
    const g = adjacentGroup(k === ']' ? 1 : -1);
    return g == null ? toast(k === ']' ? 'This is the last screen' : 'This is the first screen') : showGroup(g);
  }
  if (k === 'f') return handled(), setMode(ui.mode === 'focus' ? 'list' : 'focus');
  if (k === 'a') {
    handled();
    const auto = $('#auto-advance');
    auto.checked = !auto.checked;
    auto.dispatchEvent(new Event('change'));
    return toast(`Auto-advance ${auto.checked ? 'on' : 'off'}`);
  }
  if (!card) {
    if (/^[0-5scgmoyr]$|^Enter$/.test(k) && ui.visible.length) {
      handled();
      setFocus(ui.visible[0]);
    }
    return;
  }
  if (/^[1-5]$/.test(k)) return handled(), rate(card, Number(k));
  if (k === '0' || k === 'Backspace') return handled(), rate(card, null);
  if (k === 'Enter' || k === 's') return handled(), startEdit(card);
  if (k === 'c') {
    handled();
    ui.openComments.add(card.id);
    return refreshCard(card.id, 'textarea[data-field="comment"]');
  }
  if (k === 'g') return handled(), toggleLater(card);
  if (k === 'm') return handled(), startDrawing();
  if (k === 'y') return handled(), setVerdict(card, cardFb(card).verdict === 'accepted' ? '' : 'accepted');
  if (k === 'r') return handled(), setVerdict(card, cardFb(card).verdict === 'rejected' ? '' : 'rejected');
  if (k === 'o') return handled(), openSource(card.lead);
}

// ---------- boot ----------

async function load() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Keep changes the server hasn't saved yet, on strings whose text the new scan didn't change.
  const carried = [...unsaved].map((id) => [id, clone(state.feedback.items[id]), state.copy?.items.find((it) => it.id === id)?.text]);
  const data = await res.json();
  apply(data);
  let kept = 0;
  for (const [id, entry, text] of carried) {
    const now = state.copy.items.find((it) => it.id === id);
    if (!now || now.text !== text) continue;
    if (entry) state.feedback.items[id] = entry;
    else delete state.feedback.items[id];
    kept += 1;
  }
  if (kept) {
    buildCards();
    render();
    scheduleSave();
  }
  lastVersion = null;
}

/** The page changed something itself; take the server's new fingerprint as current so it doesn't look like Claude's work. */
async function rebaseline() {
  const res = await fetch('/api/version').catch(() => null);
  if (res && res.ok) lastVersion = (await res.json()).version;
}

// Refresh when Claude finishes something (a batch applied, a screenshot retaken), without losing your place.
let lastVersion = null;
async function checkForUpdates() {
  if (document.hidden || !state.copy) return;
  const active = document.activeElement;
  if (ui.editingId || ui.drawing || (active && /^(TEXTAREA|INPUT|SELECT)$/.test(active.tagName))) return;
  const res = await fetch('/api/version').catch(() => null);
  if (!res || !res.ok) return;
  const { version } = await res.json();
  if (lastVersion === null) {
    lastVersion = version;
    return;
  }
  if (version === lastVersion) return;
  const before = new Map(state.copy.items.map((it) => [it.id, it.text]));
  const y = window.scrollY;
  await load();
  window.scrollTo({ top: y });
  const fresh = state.copy.items.filter((it) => it.status === 'changed' && before.get(it.id) !== it.text);
  const screens = [...new Set(fresh.map((it) => it.screen))];
  toast(fresh.length ? `${plural(fresh.length, 'string')} revised on ${screens.slice(0, 2).join(', ')}${screens.length > 2 ? ` +${screens.length - 2}` : ''}. Press Y to accept, R to send back.` : 'Updated from Claude');
  const res2 = await fetch('/api/version').catch(() => null);
  if (res2 && res2.ok) lastVersion = (await res2.json()).version;
}

function apply(data) {
  Object.assign(state, data);
  state.feedback.items ||= {};
  document.title = `Copyproof · ${state.copy.project}`;
  $('#project-name').textContent = state.copy.project;
  ui.editingId = null;
  buildCards();
  if (ui.focusId && !cardById.has(ui.focusId)) ui.focusId = null;
  renderKinds();
  render();
  setSaveState(state.feedback.savedAt ? 'Saved' : '');
}

async function boot() {
  bind();
  try {
    await load();
    setInterval(checkForUpdates, 5000);
    checkForUpdates();
  } catch (err) {
    $('#list').innerHTML = `<div class="empty"><strong>Couldn't load the copy</strong>Is the review server still running? (${esc(err.message)})</div>`;
    $('#progress-text').textContent = '';
  }
}

boot();
