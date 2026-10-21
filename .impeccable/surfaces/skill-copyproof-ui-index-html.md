---
version: 1
slug: "skill-copyproof-ui-index-html"
primary_target: "skill/copyproof/ui/index.html"
related_targets: ["skill/copyproof/ui/app.js","skill/copyproof/ui/styles.css"]
---

# Review page (skill/copyproof/ui)

Scope: the copyproof review page. Mode: Operate. A solo developer or founder proofreads their own app's copy, screen by screen, in long keyboard-heavy sessions. Task: rate each string 1–5, rewrite, tag, comment; know where they are, what's left, and what's next; export a prompt. Constraints: every feature and shortcut stays; zero dependencies; fonts bundled locally; light and dark; phone width.

Chosen direction: Wayfinding (THE ROLL, kept by the user 2026-10-20). Memorable moment: the screen rail drawn as a transit line with "You are here" and a "Next stop" bar.

## Direction contract

THESIS: Every screen is a stop on a line and every string a sign to approve; the page always answers "where am I, what's left, what's next". Refuses the grey sidebar-list-panel tool with one blue accent.

OWN-WORLD: Solid black rail and sign panels, signal yellow (#FFD200) only for "you are here" and the current string, warm concrete-grey ground, status green (OK) and red (FIX) as stamps. Overpass (Highway Gothic lineage) for everything, Overpass Mono for codes. Square corners, thick rules, keycap rating buttons.

STORY: Open on the current stop, see the strings as signs, rate with keycaps, watch stamps accumulate, follow "Next stop" to the next screen, export when the line is done.

FIRST VIEWPORT: Left: black rail, stops on a vertical yellow line, done stops filled, current stop highlighted "You are here". Centre: sequence code header (S03 · Onboarding · 7 of 20), strings as sign panels, the current one ringed yellow with 1–5 keycaps, the next one waiting below, stamps on rated ones. Right: screenshot with the string boxed yellow. Bottom of centre: "Next stop: <screen>" bar. Primary action: rating keycaps; Generate prompt in the top bar.

FORM: Wayfinding sign system, position 5 of 7 on the ordered list. seed: cdeb70f54b7e69d0

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
