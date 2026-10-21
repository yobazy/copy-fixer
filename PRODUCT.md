# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## What it is

copyproof is a Claude Code skill for proofreading every word in an app. Claude scans a project and extracts all user-facing copy (headings, buttons, errors, empty states, toasts, emails, push notifications, permission prompts, accessibility labels) with file, line, screen and context. A local review page (vanilla JS, served by a zero-dependency Node server on 127.0.0.1) lets the user rate each string 1–5, rewrite it inline, tag problems and comment. The feedback becomes a revision prompt for Claude or any other model. After the fixes, a rescan shows each revision as a before/after diff to accept or send back.

## Users and job

- Primary user: a solo developer or founder reviewing the copy of their own apps. They review alone, often in long keyboard-heavy sessions over projects with thousands of strings (link-app: 2,195 strings across 39 screens).
- Job: go through the app screen by screen, judge every string quickly, fix or flag the weak ones, and hand a precise revision prompt to Claude.
- Success: knowing where to start, what's left, and when a screen is done; spending attention on the copy, not on the tool.

## Known pain (from the user, 2026-10-20)

- The review page looks generic.
- It's unclear what to do next.
- There's too much on screen at once.

## Constraints to preserve

- Works for any stack; the data lives in `<project>/.copyproof/` (copy.json, feedback.json, voice.md, screenshots/, prompt.md).
- Zero runtime dependencies; no build step; served locally. Fonts must work offline or degrade gracefully.
- Every existing feature and keyboard shortcut stays: J/K, 1–5, Enter rewrite, C comment, N next to review, [ ] screens, F focus, M mark on screenshot, Y/R accept or send back, O open in editor, ⌘Z undo, A auto-advance, E export, / search.
- Screenshots are optional; the page must be complete without them.
- Repeated text is one card; i18n keys and placeholders are shown and preserved.
- Light and dark mode; usable down to phone width.

## Voice

Plain, direct, warm. Short sentences. No hype.
