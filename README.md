# copyproof

Proofread every word in your app. A Claude Code skill that collects all the user-facing copy in a project, lets you rate and rewrite it screen by screen, and turns your notes into a revision prompt.

1. **Scan.** Claude reads the project and pulls out every piece of user-facing text: headings, buttons, errors, empty states, toasts, emails, push notifications, permission prompts, accessibility labels. Each string comes with its file, line, screen and a note on when the user sees it. It works on web, React Native, iOS, Android, Flutter, desktop and backend templates, and it reads translation files when the project has them.
2. **Capture (optional).** For web apps, Claude screenshots each screen and records where every string is on it. For native apps, you drop in screenshots and mark positions yourself.
3. **Review.** A local page goes screen by screen and shows each string next to its screen, highlighted in place. You rate it from 1 (rewrite it) to 5 (love it), click the text to rewrite it (you see a word diff and the character count change), tag problems, or comment. Text that repeats across the app is one card, so you rate "Cancel" once, not twelve times.
4. **Export.** Finished a screen? **Apply this screen** queues just that screen's feedback; say "apply" in Claude Code and keep reviewing while it works (those strings show as **Sent**). Or **Generate prompt** turns your feedback into a revision prompt. It's copied to your clipboard and saved to `.copyproof/prompt.md`. Paste it into any model, or tell Claude Code "apply my copy feedback".
5. **Check the fixes.** Rescan after the fixes. Every revision comes back with a before/after diff. You accept it, or send it back with a note, and those notes go into the next prompt.

## Install

```bash
./install.sh
```

This symlinks `skill/copyproof` into `~/.claude/skills/`, so `/copyproof` works in every project, and edits here take effect right away. Requires Node 18+. There are no dependencies.

## Use

In any project, in Claude Code:

| Say | What happens |
|---|---|
| `/copyproof` | Scan, then open the review page |
| `/copyproof with screenshots` | Also capture a screenshot of each screen |
| `/copyproof onboarding` | Only scan part of the app |
| "rescan the copy" | Only rescan files changed since the last scan; your ratings carry over |
| "open copyproof" | Reopen the page without scanning |
| "apply my copy feedback" | Claude edits the source using your feedback |

### In the review page

| Key | |
|---|---|
| `J` / `K` | Next / previous string |
| `1`–`5` | Rate (press again to clear). 1 and 2 stay on the card and ask you why |
| `Enter` | Rewrite the text in place |
| `C` | Comment |
| `N` | Next string to review |
| `[` / `]` | Previous / next screen. The page shows one screen at a time; `J` past the last string moves on, and a search looks across every screen |
| `F` | One at a time: one big string, beside its screen |
| `M` | Mark where the string is on the screenshot (drag a box) |
| `Y` / `R` | Accept / send back a revised string |
| `⌘Z` | Undo |
| `O` | Open the source in your editor (Cursor, VS Code, Windsurf or Zed; override with `COPYPROOF_EDITOR="subl {file}:{line}"`) |
| `A` | Toggle auto-advance after rating |
| `E` | Generate the prompt |

The page works like a transit map. The rail on the left draws your screens as stops on a line: filled stops are done, and the yellow one is where you are. Each screen shows a strip of marks, one per string, coloured by rating, so you can see what's left. The string you're on lights up as a black panel. Rated strings get a stamp (Weak, Good, Love it…). The bar along the bottom shows the keys and the next stop, and it turns yellow when a screen is done.

To add a screenshot, drop or paste an image onto the panel, or click it to pick a file. **View** has the one-at-a-time layout, auto-advance, compact cards, voice notes and shortcuts. Click the progress line under the project name for a summary: reviewed count, average rating, and screens sorted worst first.

**Voice notes** are saved to `.copyproof/voice.md` and go at the top of every prompt. Put the product's tone rules there once.

## What lands in your project

```
.copyproof/
  copy.json        extracted strings (rewritten by each scan)
  feedback.json    your ratings, tags, suggestions, comments, and history
  voice.md         voice and tone notes
  screenshots/     <screen-slug>.png
  prompt.md        last generated prompt
```

Projects reviewed before the rename keep their feedback: the scripts rename an old `.copy-review/` folder to `.copyproof/` on first use.

Commit `feedback.json` and `voice.md` if you want to keep review history, or add `.copyproof/` to `.gitignore`.

## Without Claude

The scripts run on their own:

```bash
node skill/copyproof/scripts/candidates.mjs <project>          # files likely to contain copy
node skill/copyproof/scripts/merge.mjs <project> [--full]      # merge .copyproof/scan/*.json into copy.json
                                                               # (keeps strings a scan skipped if they're still in the source; --drop-missing to trust the scan)
node skill/copyproof/scripts/serve.mjs <project>               # open the review page
node skill/copyproof/scripts/export.mjs <project> --target chat  # print the prompt
node skill/copyproof/scripts/locate.mjs <project> --screen Home  # browser snippet that finds strings on a page
                                                                 # (or fetch it from the running review server: /api/locate?screen=Home)
node skill/copyproof/scripts/set-boxes.mjs <project> boxes.json  # save what it found
```

The scan JSON format is documented in [`skill/copyproof/reference/extraction.md`](skill/copyproof/reference/extraction.md).

## Develop

```bash
npm test       # merge and prompt logic
npm run demo   # review page on test/fixtures/demo-app (screenshots and positions included)
```

Tags, rating labels and prompt wording are in [`skill/copyproof/lib/core.js`](skill/copyproof/lib/core.js).
