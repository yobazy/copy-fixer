# Overnight notes: a-copy (copyproof audit), 2026-10-29

Branch `ov/a-copy`, pushed to `audit-2026-10-29`. Scratch: `/data/tmp/overnight-2026-10-29/scratch/a-copy`.

## Plan

1. Audit: read source, run tests, drive the review page with Playwright (desktop + phone), dogfood copyproof on its own UI copy. Write `docs/AUDIT-2026-10-29.md`. Commit.
2. Tests: server API end to end (spawned `serve.mjs` + fetch), CLI scripts, browser smoke test (optional, Playwright).
3. Fixes: one commit per confirmed bug, each with a test.
4. `LATER.md` proposal.

## Decisions

- Notes file lives in the repo (`docs/`) so the morning digest finds it.

## Done

## Left

## Try it

```bash
npm test
npm run demo   # review page on the demo fixture
```

## Needs Bazil

1. (filled in at the end)
