---
name: copyproof
description: A wayfinding sign system for proofreading every word in an app, one screen (stop) at a time.
colors:
  signal: "#ffd200"
  on-signal: "#111111"
  rail: "#111111"
  rail-text: "#f4f3ef"
  rail-muted: "#a9a69e"
  rail-line: "#3a3936"
  concrete: "#e7e6e1"
  surface: "#ffffff"
  surface-2: "#f1f0ec"
  border: "#cfcdc6"
  border-strong: "#8f8c84"
  ink: "#111111"
  muted: "#4b4944"
  faint: "#625f58"
  placeholder-bg: "#fff1a8"
  placeholder-text: "#5a4600"
  ins-bg: "#d6f0dd"
  ins-text: "#0b5a31"
  del-bg: "#f8dcd8"
  del-text: "#8e1a14"
  rating-1: "#c8211f"
  rating-2: "#c2540e"
  rating-3: "#8c6b00"
  rating-4: "#3b7d32"
  rating-5: "#0a7a4b"
  status-new: "#1f4fbf"
  status-changed: "#6c34a8"
typography:
  headline:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  sign-focused:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  sign:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.006em"
  title:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 750
    letterSpacing: "0.06em"
  code:
    fontFamily: "Overpass Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  none: "0px"
  keycap: "3px"
  node: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  rail: "252px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "0 14px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.concrete}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "0 14px"
  keycap:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.keycap}"
    width: "36px"
    height: "32px"
  keycap-focused:
    width: "84px"
    height: "58px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.none}"
    height: "28px"
    padding: "1px 10px 0"
  tag-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  sign-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 20px 14px"
  sign-card-focused:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-text}"
    padding: "22px 24px 18px"
  stop-active:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    height: "58px"
  next-stop:
    backgroundColor: "transparent"
    textColor: "{colors.signal}"
    rounded: "{rounded.none}"
    height: "38px"
    padding: "2px 14px 0"
  sequence-code:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.signal}"
    width: "56px"
    height: "56px"
---

# Design System: copyproof

## Overview

**Creative North Star: "Wayfinding"**

Every screen of the reviewed app is a stop on a line and every string is a sign to approve. The page always answers three questions: where am I, what's left, what's next. A solid black rail carries a vertical signal-yellow line with one node per stop; the work area shows the current stop's sequence code and its strings as sign panels; a black "Next stop" bar sits at the bottom of the work column and turns yellow when the screen is done.

The world is built from road-sign materials: black panels, a single signal yellow, warm concrete-grey ground, square corners, thick rules, and status rendered as rotated stamps. Density is high but staged: only the current sign shows its controls, rated signs collapse to their stamp. Overpass (Highway Gothic lineage) sets everything; Overpass Mono carries codes, keys, and counts. It refuses the generic grey sidebar-list-panel tool with one blue accent.

**Key Characteristics:**
- Black rail with a 4px yellow line and circular stop nodes that fill (conic) with progress.
- Signal yellow reserved for "you are here", the current string, and arrival.
- Square corners everywhere except keycaps (3px) and stop nodes (round).
- Status as stamps (3px bordered, uppercase, rotated -3deg), never hidden.
- Focused sign inverts to a black panel with a 4px yellow outline.
- Light and dark via prefers-color-scheme; the rail stays black in both.

## Colors

A near-monochrome concrete-and-black ground with one signal color and a five-step rating scale for status.

### Primary
- **Signal Yellow** (signal): the active stop row, the line itself, the focused-sign outline, the progress fill, the "Next stop" button, the arrived bar, text selection, and dark-mode focus rings. Always paired with **Sign Black** (on-signal) text.

### Neutral
- **Sign Black** (rail / ink): the rail, the Next-stop bar, the focused sign panel, sequence-code blocks, primary buttons, and body text in light mode.
- **Rail Paper** (rail-text) and **Rail Grey** (rail-muted): text on black; rail-line divides rail sections.
- **Warm Concrete** (concrete): the page ground behind sign panels.
- **Sign White** (surface) and **Pale Concrete** (surface-2): sign panels, inputs, the screenshot panel.
- **Kerb Grey** (border, border-strong): hairlines and keycap/tag strokes.
- **Muted** / **Faint**: metadata, counts, hints.

### Status
- **Rating scale** (rating-1 red through rating-5 green): selected keycaps, stamps, and per-string ticks. 1 and 2 read as FIX, 4 and 5 as OK.
- **Diff pair** (ins-bg/ins-text, del-bg/del-text): before/after revisions.
- **Placeholder** (placeholder-bg/text): i18n placeholders inside strings, set in mono.
- **New** (status-new) and **Changed** (status-changed): rescan states only.

Dark mode lifts the ground to #2b2a27, surfaces to #34332f, text to #f2f1ec, the rating scale to lighter tints (#f0625a … #3fbf86), and switches focus rings to signal yellow.

### Named Rules
**The One Signal Rule.** Yellow means "you are here" or "arrived". It never decorates; if a yellow element is not the current position, the current string, or progress toward it, it is wrong.

**The Stamp Rule.** Status is shown by the rating colors as stamps, ticks, and filled keycaps. Those colors are not used for anything else.

## Typography

**Display/Body Font:** Overpass (with ui-sans-serif, system-ui), bundled locally as variable woff2 (100–900).
**Label/Mono Font:** Overpass Mono (with ui-monospace, SF Mono, Menlo), 300–700.

**Character:** Highway-sign gothic: open, legible at speed, heavy weights (750–850) for signage, tabular numerals throughout.

### Hierarchy
- **Headline** (800, 30px, 1.1): the stop's screen name in the stop header; 24px on phones.
- **Sign, focused** (700, 24px, 1.3): the string you are on; 21px on phones.
- **Sign** (600, 19px, 1.4): every other string.
- **Title** (750, 22px, 1.15): project name in the rail; sequence code (800, 22px) in its black block.
- **Body** (400, 15px, 1.5, tabular-nums): UI text; context lines capped at 72ch, descriptions at 64ch.
- **Label** (750, 11.5px, 0.06em, uppercase): field labels, the "You are here" marker, rewrite and revision labels. Stamps use 850, 13px, 0.08em.
- **Code** (Overpass Mono, 12px): file paths, i18n keys, counts, kbd hints.

### Named Rules
**The Sign Weight Rule.** Strings under review are always the heaviest, largest text in their panel; chrome never outweighs the copy.

## Layout

A two-column body grid: the fixed rail (252px; 220px under 1280px) and the work area. The work area splits into the sign list and a sticky screenshot panel (minmax(300px, 38%) under 1280px); under 1024px the panel hides and a "view on screen" link appears. Under 760px the rail moves to the top and the line runs horizontally, stops showing a node above a name; the top bar unsticks, search collapses behind a toggle, and keycaps stretch to fill the row at 54px tall. The topbar is sticky at the top of the work area, the Next-stop bar sticky at the bottom. Spacing runs on a 4/8/12/16/22px rhythm; signs sit 8px apart and stops 40px apart. Side gutters are 20px on desktop, 16px on phones.

## Elevation & Depth

Flat. Depth comes from tonal inversion (black rail, black focused sign on concrete) and thick rules, not shadows. Two functional shadows exist: the View menu popover (`0 12px 32px rgb(0 0 0 / 0.18)`) and the current screenshot box's spotlight (`0 0 0 9999px rgb(0 0 0 / 0.32)`), which dims everything except the marked string.

### Named Rules
**The Inversion Rule.** To raise something, turn it into a black sign panel; don't lift it with a shadow.

## Shapes

Square corners (0px) on buttons, inputs, tags, panels, and cards. Two exceptions carry meaning: keycaps (3px radius, 3px bottom border that collapses on press) and stop nodes (circles with a 4px yellow ring). Rules are thick: 2px ink top border on each sign, 4px ink rule under the stop header, 4px yellow outline on the focused sign, 2px yellow border on Next stop. Chevrons are drawn from borders, icons are 14–16px stroked SVG with square caps.

## Components

### Buttons
- **Shape:** square (0px), 36px tall (30px small), 14px horizontal padding, weight 650.
- **Default:** sign-white fill, kerb-grey hairline; hover darkens the border to ink.
- **Primary:** ink fill with concrete text; in the Next-stop bar it becomes signal yellow with black text.
- **Ghost:** transparent until hover. **Icon:** 36px square.

### Keycaps (rating)
Tactile 1–5 keys: 3px radius, kerb-grey stroke with a 3px bottom edge, weight 800. 36x32 on resting signs, 84x58 with a text label beneath on the focused sign. Press translates 2px down and flattens the bottom edge. Selected keycaps fill with their rating color.

### Tags (chips)
Square 28px outlined toggles; pressed state fills ink with surface text. Only shown on the focused sign, on low-rated signs, or when already pressed.

### Inputs / Fields
Square, 1px border-strong stroke on pale concrete; focus switches the border to signal yellow (textareas) or ink with an inset 1px ring (search). The inline rewrite editor uses a 2px yellow border at focused-sign size.

### Navigation: the line
Rail stops are 38px rows (58px when active) with a node, name, and mono count. The yellow line runs through every node; the active stop becomes a full-width yellow band with black text and a "You are here" label. Done stops fill their node solid and dim their name.

### Sign card
White panel, 2px ink top rule, no radius. Rated cards show a stamp floated right and hide their keycaps. The focused card re-scopes every color token to its dark values, inverts to black, and wears a 4px signal outline.

### Stop header
Black sequence-code block (56px square, yellow numerals), screen name headline, description, a mono count, then a row of per-string ticks (10x14) colored by rating, closed by a 4px ink rule.

### Next-stop bar
Sticky black bar (56px min) with kbd hints, "Next stop" label, and a yellow-outlined destination button with a border-drawn chevron. When the screen is done (`arrived`), the whole bar turns signal yellow and its controls invert to black.

## Do's and Don'ts

### Do:
- **Do** keep signal yellow (#ffd200) for current position, current string, progress, and arrival only.
- **Do** use square corners (0px) for every surface and control except keycaps (3px) and stop nodes (round).
- **Do** show status as stamps, ticks, or filled keycaps in the rating colors.
- **Do** raise the active element by inverting it to a black panel with a 4px yellow outline.
- **Do** set codes, keys, paths, and counts in Overpass Mono with tabular numerals.
- **Do** keep the rail black in both light and dark mode.

### Don't:
- **Don't** introduce a second accent hue; the rating and diff colors are status, not decoration.
- **Don't** add soft drop shadows to cards or buttons; the only shadows are the menu popover and the screenshot spotlight.
- **Don't** round sign panels, buttons, tags, or inputs.
- **Don't** load fonts from a CDN; Overpass and Overpass Mono ship in ui/fonts.
