# copy-fixer

A Claude Code skill for reviewing the written copy in any app.

1. **Scan.** Claude reads the project and pulls out every piece of user-facing text: headings, buttons, errors, empty states, toasts, emails, push notifications, permission prompts, accessibility labels. Each string comes with its file, line, screen and a note on when the user sees it. It works on web, React Native, iOS, Android, Flutter, desktop and backend templates, and it reads translation files when the project has them.
2. **Capture (optional).** For web apps, Claude screenshots each screen and records where every string is on it. For native apps, you drop in screenshots and mark positions yourself.
3. **Review.** A local page shows each string next to its screen, highlighted in place. You rate it from 1 (rewrite it) to 5 (love it), click the text to rewrite it (you see a word diff and the character count change), tag problems, or comment. Text that repeats across the app is one card, so you rate "Cancel" once, not twelve times.
4. **Export.** **Generate prompt** turns your feedback into a revision prompt. It's copied to your clipboard and saved to `.copy-review/prompt.md`. Paste it into any model, or tell Claude Code "apply my copy feedback".
5. **Check the fixes.** Rescan after the fixes. Every revision comes back with a before/after diff. You accept it, or send it back with a note, and those notes go into the next prompt.

## Install

```bash
./install.sh
```

This symlinks `skill/copy-review` into `~/.claude/skills/`, so `/copy-review` works in every project, and edits here take effect right away. Requires Node 18+. There are no dependencies.

## Use

In any project, in Claude Code:

| Say | What happens |
|---|---|
| `/copy-review` | Scan, then open the review page |
| `/copy-review with screenshots` | Also capture a screenshot of each screen |
| `/copy-review onboarding` | Only scan part of the app |
| "rescan the copy" | Only rescan files changed since the last scan; your ratings carry over |
| "open the copy review" | Reopen the page without scanning |
| "apply my copy feedback" | Claude edits the source using your feedback |

### In the review page

| Key | |
|---|---|
| `J` / `K` | Next / previous string |
| `1`–`5` | Rate (press again to clear). 1 and 2 stay on the card and ask you why |
| `Enter` | Rewrite the text in place |
| `C` | Comment |
| `N` | Next string to review |
| `F` | Focus mode: one big string at a time, beside its screen |
| `M` | Mark where the string is on the screenshot (drag a box) |
| `Y` / `R` | Accept / send back a revised string |
| `⌘Z` | Undo |
| `O` | Open the source in your editor (Cursor, VS Code, Windsurf or Zed; override with `COPY_REVIEW_EDITOR="subl {file}:{line}"`) |
| `A` | Toggle auto-advance after rating |
| `E` | Generate the prompt |

To add a screenshot, drop or paste an image onto the panel, or click it to pick a file. Use **Compact** for long lists. Click the progress line under the project name for a summary: reviewed count, average rating, and screens sorted worst first.

**Voice notes** are saved to `.copy-review/voice.md` and go at the top of every prompt. Put the product's tone rules there once.

## What lands in your project

```
.copy-review/
  copy.json        extracted strings (rewritten by each scan)
  feedback.json    your ratings, tags, suggestions, comments, and history
  voice.md         voice and tone notes
  screenshots/     <screen-slug>.png
  prompt.md        last generated prompt
```

Commit `feedback.json` and `voice.md` if you want to keep review history, or add `.copy-review/` to `.gitignore`.

## Without Claude

The scripts run on their own:

```bash
node skill/copy-review/scripts/candidates.mjs <project>          # files likely to contain copy
node skill/copy-review/scripts/merge.mjs <project> [--full]      # merge .copy-review/scan/*.json into copy.json
node skill/copy-review/scripts/serve.mjs <project>               # open the review page
node skill/copy-review/scripts/export.mjs <project> --target chat  # print the prompt
node skill/copy-review/scripts/locate.mjs <project> --screen Home  # browser snippet that finds strings on a page
node skill/copy-review/scripts/set-boxes.mjs <project> boxes.json  # save what it found
```

The scan JSON format is documented in [`skill/copy-review/reference/extraction.md`](skill/copy-review/reference/extraction.md).

## Develop

```bash
npm test       # merge and prompt logic
npm run demo   # review page on test/fixtures/demo-app (screenshots and positions included)
```

Tags, rating labels and prompt wording are in [`skill/copy-review/lib/core.js`](skill/copy-review/lib/core.js).
