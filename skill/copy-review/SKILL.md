---
name: copy-review
description: Collect every piece of user-facing copy in a project (UI text, buttons, errors, empty states, emails, notifications, permission prompts, accessibility labels) into a local review page where the user rates each string 1–5, tags problems, suggests rewrites and leaves comments, then turns that feedback into a prompt for Claude or any other model. Works for web, React Native, iOS, Android, Flutter, desktop and backend templates. Use when the user says "copy review", "review the copy", "audit the copy", "rate the copy", "go through all the text in the app", "find all the strings", "UX writing review", "microcopy audit", or "apply my copy feedback". Also run as /copy-review.
---

# Copy review

This skill turns a project's user-facing text into a review session, and turns the review back into a revision prompt.

Everything lives in `<project>/.copy-review/`:

| File | What it is |
|---|---|
| `copy.json` | Every extracted string, with its location, kind, screen and context. The merge script writes it. |
| `feedback.json` | The user's ratings, tags, suggestions and comments, keyed by string id. The review page writes it. |
| `voice.md` | Optional voice and tone notes. They go at the top of every prompt. |
| `screenshots/<screen-slug>.png` | Optional, one per screen. |
| `prompt.md` | The last generated revision prompt. |

`SKILL_DIR` below means the directory this file is in. Scripts need only Node 18+ and have no dependencies.

## Choose the mode from what the user asked

- **Scan + review** (default, `/copy-review`): steps 1 to 5.
- **Rescan** (`copy.json` exists, or the user says "rescan" or "refresh"): step 1 with `--since`, then steps 2 to 5. Ratings carry over. Strings whose text changed come back as **Revised**, with the old feedback shown alongside.
- **Review only** ("open the copy review"): step 5.
- **With screenshots** ("with screenshots", `--screenshots`): add step 4. Otherwise skip it, but mention once that it's available. Reviewing next to the real screen is much easier.
- **Apply** ("apply my copy feedback"): step 6.
- **Scoped** ("review the copy in onboarding", a path): restrict step 1 to those files.

## 1. Survey the project

```bash
node SKILL_DIR/scripts/candidates.mjs <project>            # full scan
node SKILL_DIR/scripts/candidates.mjs <project> --since    # only files changed since the last scan
```

This lists the files likely to hold copy, grouped by area (ui, ios, android, i18n, templates…), and lists translation files first. It respects `.gitignore` and skips tests, stories and build output. If the project uses translation files, extract from the base-language file instead of hunting through components.

The list is a starting point, not the answer. Skip files that are obviously not user-facing (API clients, utils, types), and read anything the list missed that clearly holds copy.

## 2. Extract

Read `SKILL_DIR/reference/extraction.md`. It defines what counts as copy, where to find it in each stack, and the JSON to write. Follow it exactly. Accuracy matters more than speed, so:

- `text` must be verbatim, and `line` must be the real line. Check against the file.
- Use consistent `screen` names, because the review page groups by them.

**Small projects** (up to about 40 candidate files): extract it yourself and write `<project>/.copy-review/scan/main.json`.

**Larger projects**: split the candidate files into batches of about 20–40 by feature area (keep a screen's files together), and start parallel subagents in one message, one per batch. Give each one:
- the absolute path of `SKILL_DIR/reference/extraction.md` to read first,
- its exact file list,
- its output path, `<project>/.copy-review/scan/<batch-name>.json`,
- the screen names already in use (from `copy.json` on a rescan, or that you've settled on), so groupings line up.

Tell subagents to report only the item count and anything uncertain, not the strings.

## 3. Merge

```bash
node SKILL_DIR/scripts/merge.mjs <project>          # incremental: only the files in this scan are replaced
node SKILL_DIR/scripts/merge.mjs <project> --full   # the scan covered everything; anything missing is gone
```

Use `--full` on a first scan and on any full rescan. Merge assigns stable ids, keeps feedback, marks new/revised/removed strings, deletes `scan/`, and prints a summary. Read the warnings. If counts look wrong (for example 0 errors in an app with forms), go back and fill the gaps before opening the review.

## 4. Screenshots (optional)

One screenshot per screen, plus where each string sits on it. The review page shows the screen next to the string being reviewed, with that string highlighted.

A screenshot belongs to a screen by its file name: `.copy-review/screenshots/<slug>.png`, where the slug is the screen name lowercased with non-alphanumerics turned into `-` (`Settings › Notifications` → `settings-notifications`).

**Web** (anything you can open in the Playwright browser tools):

1. Start the dev server if it isn't running (in the background).
2. Set the viewport to how users see the app: 390×844 for mobile-first and React Native Web, 1280×800 for desktop.
3. For each screen with a known `route` (or one you can reach by clicking through):
   1. Navigate there, and get the page into the state that shows the most copy (open the dialog, trigger the empty state, submit the empty form for validation errors).
   2. `node SKILL_DIR/scripts/locate.mjs <project> --screen "<screen name>"` prints a function. Run it with the browser's evaluate tool, saving the result to `.copy-review/boxes-<slug>.json`. It finds each string on the page (text, placeholders, aria-labels, alt text) and returns where it is.
   3. Without scrolling or changing anything, take a **full-page** screenshot to `.copy-review/screenshots/<slug>.png`.

   React Native Web and many single-page apps scroll inside a container, not the page, so a "full-page" screenshot only covers the first screen. Before locating, check for this with `Math.max(...[...document.querySelectorAll('*')].map(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) ? e.scrollHeight : 0))`. If the result is taller than the viewport, resize the viewport to that height first. Pages that reveal content on scroll need one pass of scrolling top to bottom before you locate.

   The browser tools may only write inside the session's working directory. If `.copy-review/` is outside it, save to a staging folder there and copy the files over.
4. `node SKILL_DIR/scripts/set-boxes.mjs <project> .copy-review/boxes-*.json`, then delete the `boxes-*.json` files. It lists strings that weren't found. Those usually need another state (an error, a toast), so capture that state as well if it's cheap. Otherwise leave them for the user, who can mark them by hand in the page (`M`).

Screens behind auth: sign in once if there's a dev account or seed user. Never create accounts or test data against a production backend. Without a login, capture what you can and say which screens are missing. Dev-only pages that render components with sample data, like storybook pages or a `/dev-gallery`, are good stand-ins for screens behind auth. Name them after the screen whose copy they show.

**Native apps**: take one screenshot per screen, without positions.
- iOS simulator: navigate with deep links (`xcrun simctl openurl booted <url>`), then `xcrun simctl io booted screenshot <path>`.
- Android emulator: `adb shell am start -d <deep link>`, then `adb exec-out screencap -p > <path>`.

The user can mark where each string is by hand in the review page.

If you can't drive the app at all, tell the user they can drop or paste a screenshot into the panel next to any string.

Replacing a screen's screenshot clears its positions, so locate and screenshot together. After a rescan that changed copy on a screen, recapture that screen so the screenshot shows the new text.

## 5. Open the review

```bash
node SKILL_DIR/scripts/serve.mjs <project>
```

Run it in the background. It picks a free port starting at 4477, opens the browser, and prints the URL. Give the user the URL and a short summary: how many strings, how many screens, anything you weren't sure about. Then stop and let them review. Don't wait on the server.

In the page, each string sits next to its screen, highlighted. You rate 1–5 (`J`/`K` to move, `1`–`5` to rate) and click the text, or press `Enter`, to rewrite it in place. You can also tag problems and add comments (`C`). Identical text in several places is one card, so you rate it once. `F` switches to focus mode, one string at a time. **Generate prompt** builds the revision prompt, copies it, and saves it to `.copy-review/prompt.md`. Feedback saves to disk as you go, so you can close the page and come back later with "open the copy review".

## 6. Apply feedback

When the user says "apply my copy feedback" (or similar):

1. Use `.copy-review/prompt.md` if it's newer than `feedback.json`. Otherwise regenerate it with
   `node SKILL_DIR/scripts/export.mjs <project>` (add `--max-rating N` if they want a different cutoff).
2. Follow the prompt. It lists each string with its location, rating, tags, suggestion and notes, and the rules for revising. Where the user wrote a suggested rewrite, use it.
3. Edit only the copy. Keep placeholders, i18n keys and code untouched. When copy is in a translation file, change the base language and list the keys that need retranslation.
4. Report a before/after table and anything you skipped.
5. Offer a rescan (step 1 with `--since`, then 3, then 4 for the screens that changed, then 5). The revised strings show up under **New & revised** with a before/after diff, and the user accepts each one (`Y`) or sends it back with a note (`R`). Sent-back strings go into the next prompt along with the rejected attempt.

## Notes

- Don't edit `.gitignore` or commit `.copy-review/` unless asked. Mention once that the folder exists, and that committing `feedback.json` and `voice.md` keeps the review history.
- If the user wants different tags or rating labels, they're defined in `SKILL_DIR/lib/core.js`.
- The prompt from `export.mjs --target chat` leaves out file-editing instructions, so it can be pasted into any chat model.
