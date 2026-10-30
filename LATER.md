# Later (proposal)

**Proposal from the overnight audit on 2026-10-29. Nothing here is agreed; keep, cut or reorder freely.** Each item has a one-line why. Details are in `docs/AUDIT-2026-10-29.md` and `docs/COPY-REVIEW-2026-10-29.md`.

## Small fixes

- **Bigger touch targets on phone for Edit, Discard and View on screen.** They're about 19 px tall; 24 px is the WCAG 2.2 minimum.
- **Hide keycap hints on touch screens.** They crowd the card actions and mean nothing without a keyboard.
- **Label the export and voice text boxes** (`aria-labelledby` on the dialog heading). Screen readers announce them as "edit text".
- **Say "No screen called X" from `export.mjs --screen`.** A typo currently gets "Nothing flagged yet", which sends you to rate strings.
- **Let `--port 0` pick a free port.** `Number(0) || 4477` ignores it; useful for tests and parallel sessions.
- **Return 400, not 500, for a malformed screenshot name.** `decodeURIComponent` throws on bad escapes.
- **Don't warn about " / " in labels like "Typo / grammar" or "Next / previous string".** The joined-variants warning fired five false positives on copyproof's own copy.

## Robustness

- **Lock or re-read `feedback.json` in `merge.mjs` just before writing.** A rating saved from the page during a merge can be overwritten.
- **Keep "Saved" honest while a second save is pending.** It shows Saved for up to 500 ms while a newer change hasn't been written.
- **Resolve symlinks in `inside()`.** Cheap defence in depth for open-in-editor and screenshot reads.

## Bigger ideas

- **Run the browser tests in CI.** `npm run test:e2e` exists now but needs Playwright installed; a GitHub Action would keep the page from regressing.
- **A copyproof pass on its own UI before each release.** The dogfood run found real copy issues; a saved `.copyproof/` for this repo would track them over time.