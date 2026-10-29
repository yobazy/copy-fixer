# Overnight notes: a-copy (copyproof audit), 2026-10-29

Branch `ov/a-copy`, pushed to `audit-2026-10-29`. Scratch (screenshots, scripts, fixtures): `/data/tmp/overnight-2026-10-29/scratch/a-copy` on `pc`.

## Plan

1. Audit: read source, run tests, drive the review page with Playwright (desktop + phone), dogfood copyproof on its own UI copy. Write `docs/AUDIT-2026-10-29.md`. Commit.
2. Tests: server API end to end (spawned `serve.mjs` + fetch), CLI scripts, browser test (optional, Playwright).
3. Fixes: one commit per confirmed bug, each with a test.
4. `LATER.md` proposal.

## Decisions

- Notes file lives in the repo (`docs/`) so the morning digest finds it.
- Playwright is **not** added to `package.json`: copyproof's promise is no dependencies. The browser test (`npm run test:e2e`) imports Playwright if it's there, or from `COPYPROOF_PLAYWRIGHT=<path>`, and skips otherwise.
- `/api/locate` CORS now allows loopback origins only (localhost, 127.0.0.1, [::1], *.localhost, any port). An app served from a LAN IP or staging URL must paste the snippet from `locate.mjs` instead (already the documented fallback for CSP). Flagged for Bazil in case he screenshots non-local apps.
- Removed strings with feedback are now kept across rescans (the conservative reading of the merge docstring: no data loss). Clearing their feedback lets them go.
- The dogfood `.copyproof/` for this repo is not committed (SKILL.md says don't commit it unless asked). The report is in `docs/COPY-REVIEW-2026-10-29.md`; the raw data is copied to the scratch dir.
- Product/design items (all-caps labels, prompt.md saved on dialog open) are listed as questions, not changed.

## Done

- Audit: `docs/AUDIT-2026-10-29.md`.
- Tests: 27 → 51 in `npm test` (server, CLI, two regression tests) plus 3 browser tests in `npm run test:e2e`.
- Fixes (one commit each): removed strings survive rescans; `export --screen` matches by slug; `/api/locate` no longer readable by any website.
- Dogfood: 260 strings extracted from the review page, merged, expert pass; report in `docs/COPY-REVIEW-2026-10-29.md`.
- `LATER.md` proposal.
- Screenshots: `scratch/a-copy/shots/` (`audit-*` click-through, `xss-*` escaping check, `fix-removed-before.png` / `fix-removed-after.png`).

## Left

- Nothing half-built. Lower-ranked findings are in LATER.md.

## Try it

```bash
npm test                     # 51 tests, no dependencies
npm i --no-save playwright && npx playwright install chromium
npm run test:e2e             # 3 browser tests
npm run demo                 # review page on the demo fixture
# Dogfood: open copyproof's own copy review (scratch copy of the data)
node skill/copyproof/scripts/serve.mjs /data/tmp/overnight-2026-10-29/scratch/a-copy/dogfood
```

## Needs Bazil

1. `/api/locate` is now loopback-only. OK, or do you screenshot apps served from other hosts (LAN IP, staging)?
2. Should opening the export dialog stop writing `prompt.md` (save on Copy only)?
3. Keep the all-caps, letter-spaced labels (wayfinding design) or move to sentence case like your other projects?
4. Look over the copy report and LATER.md; pick what to apply.
