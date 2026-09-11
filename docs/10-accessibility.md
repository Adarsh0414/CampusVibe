# 10. Accessibility

Accessibility work on CampusVibe is tracked in **two dedicated documents
at the repository root**, kept separate from this `docs/` folder because
they were maintained as a running project log throughout a multi-part
remediation effort, updated after every part rather than written once at
the end:

- **[`../ACCESSIBILITY.md`](../ACCESSIBILITY.md)** — the plain-language
  summary. Start here if you want the short version: what's been fixed,
  what's known to still be missing, and an honest conformance statement.
- **[`../ACCESSIBILITY_AUDIT.md`](../ACCESSIBILITY_AUDIT.md)** — the
  full engineering log. Every issue found is numbered (`A11Y-001` through
  `A11Y-019`), with its severity, the exact WCAG success criterion it
  relates to, root-cause analysis, precisely what was changed to fix it,
  and how that fix was verified. It also contains a **Before/After
  Summary table**, two full **keyboard user-journey walkthroughs**, and
  the final **Conformance Statement**.

All 7 parts of the original remediation plan are complete.

## The short version

19 distinct accessibility issues were found across navigation, forms,
custom interactive widgets (a ticket-type selector, tab bars, dropdown
menus, a chatbot dialog), color contrast, decorative icons, and
multilingual support — and **all 19 were fixed** in this codebase, each
checked against the relevant WCAG 2.2 success criterion and, for custom
widgets, the matching WAI-ARIA Authoring Practices Guide pattern (Tabs,
Menu Button, radiogroup).

**What this does not mean:** CampusVibe does **not** claim WCAG 2.2 AA
conformance. Every fix was made through static source analysis — reading
code, tracing logic, and (for color contrast) computing the actual WCAG
relative-luminance formula against the real colors in the stylesheet —
because the environment this work was done in had no browser, no screen
reader, and no Lighthouse/axe tooling available. That's a real
limitation, stated plainly in both documents above, not a formality.
Before making any public accessibility claim about this project, it
should go through:

1. An automated pass with **Lighthouse** and/or **axe DevTools** in an
   actual browser.
2. At least one full manual pass with a **real screen reader** (NVDA +
   Firefox/Chrome on Windows, or VoiceOver on macOS/iOS) across the two
   user journeys documented in `ACCESSIBILITY_AUDIT.md`'s "Keyboard
   User-Journey Walkthroughs" section.

## Highlights, if you only read one paragraph

The single most severe issue found (`A11Y-004`, marked P0) was that the
custom-built ticket-type selector on the event registration page — the
control a student uses to choose Single/Duo/Trio — was built from
unfocusable `<div>` elements with no keyboard path at all. A keyboard-only
user could not register for a paid event with more than one ticket tier.
This is now a correct ARIA radiogroup. Beyond that single most-serious
bug, the work also implemented the WAI-ARIA "Tabs" pattern from scratch
across two different tab bars, the "Menu Button" pattern for two
different dropdown menus, a non-modal dialog pattern for the chatbot, a
measured and corrected color-contrast failure affecting most of the
app's primary/danger buttons, and a sitewide sweep for redundant or
unlabeled icons.

For anything more specific than that — a particular WCAG criterion, why a
particular fix was made the way it was, or what's genuinely still
untested — go to `ACCESSIBILITY_AUDIT.md` directly; it's written to be
read on its own without needing this page as an intermediary.
