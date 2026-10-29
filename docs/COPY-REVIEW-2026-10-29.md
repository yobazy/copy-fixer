# copyproof on copyproof: copy review of the review page, 2026-10-29

copyproof was run on its own review page (`skill/copyproof/ui/index.html`, `ui/app.js`, and the tag and rating labels in `lib/core.js`), the way the skill runs on any project:

1. Two extraction agents followed `reference/extraction.md` and wrote `.copyproof/scan/part1.json` (215 strings: `index.html`, `core.js` labels, `app.js` lines 1 to 900) and `part2.json` (56 strings: the rest of `app.js`).
2. `merge.mjs . --full` merged them: **260 strings on 11 screens** (254 cards once identical text is joined). By kind: button 58, label 54, body 40, toast 27, empty-state 18, accessibility 15, tooltip 14, error 11, heading 9, success 9, placeholder 3, title-meta 2.
3. A `voice.md` was written from `PRODUCT.md` ("plain, direct, warm, short sentences, no hype") plus the house rules (sentence case, no em dashes), and an expert pass followed `reference/expert-review.md`. `set-expert.mjs` saved all 260 takes.
4. The review page served the result. Screenshot: `scratch/a-copy/shots/dogfood-claude-flagged.png` on `pc`.

The raw data (`copy.json`, `expert.json`, `voice.md`) is in `/data/tmp/overnight-2026-10-29/scratch/a-copy/dogfood/.copyproof/`. It isn't committed, following SKILL.md ("don't commit `.copyproof/` unless asked"). No copy was changed: these are suggestions for Bazil.

## Ratings

| 1 Rewrite it | 2 Weak | 3 Okay | 4 Good | 5 Love it |
|---|---|---|---|---|
| 0 | 11 | 32 | 202 | 15 |

Four strings are marked off-brand: "Could not save the batch", "Upload failed", "End of the line." and "Every stop is done. Press E to generate the prompt."

## What's wrong across screens

1. **"Stop" stands in for "screen".** The next bar says "Next stop", "Last stop" and "End of the line." (`app.js:574`, `:577`), and a toast says "Every stop is done." (`app.js:1041`). That's the wayfinding metaphor from `DESIGN.md`, but everything else in the page says screen, and the train joke reads as cute in a tool whose voice is plain.
2. **One setting, three names.** The View menu says "Move on after rating", the toast says "Auto-advance on/off" (`app.js:1641`), and the shortcuts list says "Toggle auto-advance" (`index.html:163`). Layouts work the same way: "Whole screen" and "One at a time" in the menu, but "Focus mode on / off" in the shortcuts.
3. **"Apply" only queues.** The button says "Apply this screen", while the chip, filter and toast all say "Queued". The commit `abf2ef5` moved to "Queued" on purpose, so the button is the one left over. One error still says "batch", an internal word: "Could not save the batch" (`app.js:598`).
4. **The errors are stiffer than the rest of the page.** Five say "Could not" (`app.js:598`, `:786`, `:966`, `:1324`, `:1586`) and one says "Couldn't" (`app.js:1741`). Most give no next step. "Upload failed" says neither what failed nor what to do.
5. **"Copy" and "string" are mixed.** "Search copy", "No new or revised copy" and "Add 5-rated copy as tone examples" sit next to "string" everywhere else.
6. **Small things:** one line in the first person ("Select a string first, so I know which screen this is"), "Clear" next to "Remove" with no object for either, and both "Claude" and "Claude Code" in use.

## Weakest strings, with Claude's suggested rewrite

| Where | Current | Rating | Suggested |
|---|---|---|---|
| Toasts | Could not save the batch | 2 | Couldn't queue this screen. Is the review server running? |
| Toasts | Upload failed | 2 | Couldn't add the screenshot. Try again. |
| Next bar | End of the line. | 2 | All screens reviewed. |
| Toasts | Every stop is done. Press E to generate the prompt. | 2 | Every screen is reviewed. Press E to generate the prompt. |
| Shortcuts dialog | Focus mode on / off | 2 | Whole screen / one at a time |
| Shortcuts dialog | Toggle auto-advance | 2 | Move on after rating, on / off |
| Toasts | Auto-advance on / Auto-advance off | 2 | Move on after rating: on / off |
| Cards | Done with later | 2 | Remove from later |
| Screen panel | Not on this screenshot. It appears from the dashed box… (2 variants) | 2 | Not on this screenshot. The dashed box opens it… |
| Screen header | Apply this screen · ${n} | 3 | Queue this screen · ${n} |
| Screen panel | Remove / Clear | 3 | Remove screenshot / Clear mark |
| Screen panel | This screenshot is older than ${n} changed strings… | 3 | ${n} strings changed since this screenshot, so it may show old text. |
| Toasts | Select a string first, so I know which screen this is | 3 | Select a string first, so the screenshot goes to the right screen |
| Cards | Add its tags | 3 | Use tags |

## What dogfooding found about copyproof itself

- **The " / " warning fires on legitimate labels.** `merge.mjs` warned about five "variants joined with ' / '": "Typo / grammar", "Next / previous string", "Previous / next screen", "Focus mode on / off" and "Accept / send back a revision". None of them are plural or conditional variants. It's on LATER.md.
- **A split sentence was the extractor's call.** "Your rating and notes apply to every place." with a "Review each place separately" button inside it was extracted as two items, which goes against extraction.md's "join it into one item" rule. That's the right call for rating, since the button is a separate thing to judge, but the rule could say when to keep inline controls apart.
- **Prompt text built in `core.js` wasn't extracted.** `core.js` was listed as fully covered, so the prompt's own wording ("## How to revise", "My suggested rewrite: …") isn't in the review. It's text for a model, not UI, but it does show in the export dialog. The extraction guide doesn't say what to do with generated prompts.
- **The "·" separator.** "Rate 2 ·Weak" and "reviewed ·1 flagged" look as if the space after the dot is missing. The source has a normal space, so this is about how the font spaces the middle dot (noted in the audit).
- The review page dealt with its own 260 strings with no problems, and the **Claude flagged** filter took you straight to the 11 to look at.

## Questions for Bazil

1. Keep the "stop" and "end of the line" wording (it's part of the wayfinding design), or switch to "screen"?
2. Rename "Apply this screen" to "Queue this screen", to match **Queued**?
3. Want these applied? Copy `scratch/a-copy/dogfood/.copyproof/` into the repo root, run "open copyproof", adopt the takes you agree with, then say "apply my copy feedback".
