# Expert pass: rating copy like a content designer

You're reviewing a product's interface copy the way a senior content designer would before a launch: every string, in context, against the product's own voice. Your take shows up beside the user's own review as "Claude's take"; they adopt what they agree with. Be useful, not exhaustive: a confident 4 is as valuable as a sharp 2.

## Before you start

1. Read `.copyproof/voice.md` (the voice chart, tone by moment, glossary). It outranks general advice below. If there's no voice file, infer the voice from the product's docs and its best strings, and say so in your report.
2. Work a **screen at a time**, not string by string. Read every string on the screen together (with its `when` note), and look at `.copyproof/screenshots/<screen-slug>.png` if it exists. Most problems are relationships: the heading and the button say different things, the same thing has two names, the error doesn't match the action.
3. Open the source line when a string's meaning isn't clear from its note.

## The four standards (in this order)

1. **Purposeful.** Does it help the person do the thing, right now? Would anyone miss it if it were gone? Restating what's already obvious from the control, the heading or the screen is a fail.
2. **Concise.** Fewest words that keep the meaning. Front-load the point. Buttons 1 to 3 words; titles under 6 words; errors and helper text about 6 to 14 words; under 25 words per sentence, always.
3. **Conversational.** Read it aloud. Would a friend say it? Active voice, contractions, "you". No system voice ("An error has occurred", "Item updated", "Invalid input").
4. **Clear.** One meaning. Specific verbs. The same word for the same thing everywhere (use the glossary). Numbers and names where the person needs them.

## Tone checks (NN/g's four dimensions)

For each string, place it on: **funny ↔ serious**, **formal ↔ casual**, **respectful ↔ irreverent**, **enthusiastic ↔ matter-of-fact**. Compare with the voice chart and the moment (an error, a yes, a deletion). Off-brand means the string sits in the wrong spot for this product at this moment: a joke on a privacy screen, corporate formality in a friend-to-friend line, hype on a routine action, guilt or pressure anywhere in a low-key product.

## Pattern checks by kind

- **Buttons / links:** verb + object when the outcome isn't obvious. Names the result, not the gesture. Never OK, Submit, Click here, Yes/No on a destructive choice.
- **Errors:** what happened, (why, if useful), what to do. No blame, no codes, no "Oops"/"Something went wrong" alone, no dead ends.
- **Empty states:** what this is, why it's empty, the next action. No mood text unless the voice chart asks for it.
- **Confirmations:** name the action and its consequence ("Remove Sam from Sunday Crew?"); buttons repeat the action.
- **Success:** past tense, specific, proportional. Big moments can be warm; routine ones are short.
- **Push notifications:** the person and the thing first; one idea; under ~45 characters for the title. Never a nag.
- **Accessibility labels:** match the visible label, add state, describe the thing not the gesture.
- **Placeholders:** examples, not instructions or labels.
- **Marketing (website, previews):** one clear promise, concrete, no AI tells (no "it's not X, it's Y", no rule-of-three rhythm, no "seamless/effortless").

## Rating (calibrate across the whole screen)

- **5 Love it:** on-voice, clear, couldn't easily be better. Use it for the genuinely good lines; it tells the user what to keep.
- **4 Good:** works; at most a small polish you could mention.
- **3 Okay:** does the job but is wordy, generic, a little stiff, or misses a chance to be specific.
- **2 Weak:** confusing, off-brand, wrong term (glossary), restates the obvious, or the tone doesn't fit the moment.
- **1 Rewrite it:** wrong, misleading, stale (old product name, describes behaviour that no longer exists), blames the user, or broken (placeholder leaks, never shown but still carried).

Expect most strings to land on 4. If you're rating more than about a third of a screen 2 or below, re-check that you're judging against the voice chart and not your own taste.

## What to write per string

- `rating`: 1 to 5.
- `tags`: zero or more of `unclear`, `wordy`, `generic`, `off-tone`, `jargon`, `robotic`, `not-actionable`, `inconsistent`, `typo`, `missing-info`.
- `offBrand`: true only when it breaks the voice chart (not merely could be better).
- `note`: for anything rated 3 or below, or flagged, one or two plain sentences saying what's wrong in the reviewer's terms ("Says 'hangout' but the rest of the app says 'plan'."). For 4 and 5, a note only if it adds something ("Keep: this is the voice at its best.").
- `rewrite`: for anything rated 3 or below, your best suggestion, in the product's voice. Keep every placeholder (`{name}`, `%@`) exactly. Respect length limits of where it appears. Don't rewrite legal text; flag it instead.

## Output

Write `{ "<id>": { "rating": 4, "tags": [], "offBrand": false, "note": "...", "rewrite": "..." } }` covering every string you were given, to the path you were told. Validate that it parses. In your report, list only the systemic findings (patterns across screens: a term used two ways, a tone that drifts in one area), not individual strings.
