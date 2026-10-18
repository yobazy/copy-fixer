# Extracting user-facing copy

You are reading source files and writing down every piece of text a user of the app can see or hear. The output is reviewed by a person, one string at a time, so be accurate and don't include noise.

## What counts as copy

Include text the end user can see or hear, in any of these forms:

- Headings, titles, subtitles, body text, descriptions, helper text
- Buttons, links, menu items, tabs, navigation labels, breadcrumbs
- Form labels, placeholders, hints, validation messages, character counters
- Errors, warnings, success messages, toasts, snackbars, banners, alerts
- Dialogs and confirmation prompts (title, body and both buttons)
- Empty states, loading text, offline messages, 404 and error pages
- Onboarding, tooltips, coach marks, walkthroughs, release notes shown in-app
- Accessibility text: `aria-label`, `alt`, `title`, `accessibilityLabel`, `accessibilityHint`, `contentDescription`
- Page `<title>` and meta descriptions, Open Graph text, web app manifest names
- Notifications: push, in-app, email subjects and bodies, SMS
- OS permission prompts: `NS*UsageDescription` in Info.plist / `InfoPlist.strings`, Android permission rationale
- App store listing text, if it lives in the repo (fastlane metadata)
- Server error messages that the client shows to the user verbatim
- Legal and consent text: cookie banners, terms checkboxes, paywall fine print

Leave out:

- Logs, `console.*`, debug output, analytics event names, telemetry properties
- Code identifiers, enum values, CSS classes, test IDs, route paths, URLs, query keys
- Comments and docstrings
- Tests, stories, fixtures, mocks, seed data and dev-only screens (unless the user asks)
- Developer-facing errors that never reach the UI (`throw new Error('invariant failed')`)
- Non-base-language translations. Review the source language only.
- Brand names or single proper nouns standing alone (a logo wordmark), unless they're clearly a sentence

When unsure whether a string reaches the user, trace one hop (where is this error message rendered?). If you still can't tell, include it with `kind: "other"` and say so in `context`.

## Where copy lives, by stack

- **React / React Native / Vue / Svelte / Astro / HTML**: JSX text children, string props (`title=`, `label=`, `placeholder=`, `alt=`, `aria-label=`), template literals passed to toast/alert helpers, `Alert.alert(...)` in React Native, constants files (`copy.ts`, `strings.ts`, `messages.ts`), form schema error messages (zod/yup `.min(1, "Required")`).
- **i18n libraries** (i18next, react-intl, FormatJS, vue-i18n, next-intl, Lingui, Rails/Django gettext): read the **base locale file**. Each entry is one item with `key` set and `file`/`line` pointing at the locale file. If it's cheap, add `usedIn` with one or two `file:line` references where the key is used, which helps you pick the screen.
- **iOS**: SwiftUI `Text("…")`, `Button("…")`, `Label`, `.navigationTitle`, `.alert`, `String(localized:)`, `NSLocalizedString`, `Localizable.strings` / `.xcstrings` (base language), storyboards/xibs (`text=`, `title=` attributes), `Info.plist` usage descriptions.
- **Android**: `res/values/strings.xml` (not `values-xx`), Compose `Text("…")`, `stringResource`, layout XML `android:text`/`android:hint`/`android:contentDescription`, `Toast.makeText`, notification builders.
- **Flutter**: `Text('…')`, `.arb` files (base locale), `SnackBar`, `AlertDialog`.
- **Desktop (Tauri / Electron)**: front-end code as for web, plus native menu labels, tray menus, dialog titles in Rust/JS main process, notification text.
- **Backend / email**: email templates (MJML, React Email, Handlebars, ERB, Jinja), notification payload builders, user-visible API error messages.

## Writing each item

- `text`: the string **exactly as the user sees it**. Keep the original characters, punctuation and casing. If JSX splits a sentence across inline elements (`Read our <a>terms</a>.`), join it into one item: `Read our terms.` Replace interpolation with readable placeholders that match the source syntax (`{name}`, `{{count}}`, `%@`, `${total}`). For plural variants, add one item per variant, and put the variant (one/other) in the `context`.
- `file`: path relative to the project root, using `/`.
- `line`: the 1-based line where the string starts. **It must be correct.** Check it against the file contents, not your memory.
- `kind`: one of `heading`, `body`, `button`, `link`, `label`, `placeholder`, `tooltip`, `error`, `success`, `empty-state`, `toast`, `dialog`, `notification`, `email`, `onboarding`, `nav`, `title-meta`, `accessibility`, `permission`, `legal`, `other`.
- `screen`: the screen, page or surface the user sees it on, named the way a user would say it: `Checkout`, `Settings › Notifications`, `Sign in`, `Emails`, `Push notifications`. Copy in shared components goes under `Shared components`, or under the specific screen if it's only used once. Use the same spelling for the same screen everywhere, because items are grouped by this name.
- `context`: one short sentence on when or why the user sees it, if that isn't obvious. Examples: "Shown when the card is declined", "Confirm button in the delete-account dialog", "Subject line of the weekly digest email". Leave it empty for self-explanatory items like a page heading.
- `key`: the i18n key, if the string comes from a translation file or a `t('…')` call.

## Output

Write JSON to the path you were given (normally `.copyproof/scan/<name>.json`):

```json
{
  "files": ["src/screens/Checkout.tsx", "src/screens/Cart.tsx"],
  "screens": [
    { "name": "Checkout", "description": "Payment and order review", "route": "/checkout" }
  ],
  "items": [
    {
      "text": "Your card was declined. Try another card or contact your bank.",
      "file": "src/screens/Checkout.tsx",
      "line": 88,
      "kind": "error",
      "screen": "Checkout",
      "context": "Shown when the payment provider rejects the card"
    }
  ]
}
```

- `files` lists **every file you read**, including files with no copy. The merge step uses it to know what was rescanned.
- `screens` is optional. Add it for screens you can describe, and include `route` (web path or deep link) when you know it, because the screenshot step uses it.
- Write valid JSON. Escape quotes and newlines inside strings.
