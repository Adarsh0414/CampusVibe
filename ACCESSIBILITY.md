# Accessibility — CampusVibe

This document summarizes CampusVibe's accessibility posture in plain terms.
For the detailed, issue-by-issue engineering log, see
[`ACCESSIBILITY_AUDIT.md`](./ACCESSIBILITY_AUDIT.md). All 7 planned parts
of this remediation pass are complete; this document and the audit log
were both updated after every part, not written after the fact.

## Goals

Make CampusVibe usable with a keyboard alone and with a screen reader,
without breaking any existing feature, route, auth flow, or visual design.

## Standard & Target Conformance

- **WCAG version:** 2.2
- **Target level:** AA, where applicable.
- **Conformance claim:** None. This project has **not** undergone a complete
  conformance evaluation, and this document does not claim WCAG 2.2 AA
  conformance. It documents genuine, verifiable progress toward it: 19
  distinct issues found and fixed across navigation, forms, dynamic
  content, custom widgets, color contrast, icons, and internationalization
  — see the "Conformance Statement" in `ACCESSIBILITY_AUDIT.md` for the
  full, honest statement of what that does and doesn't establish.

## Assistive Technology Actually Tested

**None, live.** This work was done in a sandboxed environment with no
browser, screen reader, or audio output available. Every fix below is based
on:
- The WCAG 2.2 success criteria text and "Understanding" guidance,
- The WAI-ARIA spec and Authoring Practices Guide (APG) patterns,
- The HTML accessibility-name computation algorithm (accname).

It is **not** based on hearing NVDA, VoiceOver, or JAWS actually announce
these pages. If you have access to real assistive technology, please test
the flows in `ACCESSIBILITY_AUDIT.md`'s journeys and file what you find —
that would be the first genuine AT-verified pass on this codebase.

## Supported Browsers

Not independently re-verified as part of this pass. No new browser-specific
code was introduced; all changes use standard HTML attributes, ARIA, and CSS
already compatible with whatever browser matrix the app already targeted.

## Keyboard Support

Documented per-component as fixed — see `ACCESSIBILITY_AUDIT.md`. Summary
maintained here as parts complete:
- ✅ Skip-to-main-content link (Part 1)
- ✅ Forms — all labels associated, required/hint text exposed to AT,
  status messages announced via `aria-live` (Part 2)
- ✅ Event registration ticket-type selector — was a P0 keyboard blocker
  (unfocusable `<div>`s), now a real ARIA radiogroup with roving tabindex
  and Arrow/Enter/Space support (Part 2)
- ✅ Registration error focus management — a failed registration submit now
  moves focus to the error itself (Part 3)
- ✅ Dashboard organizer tabs and attendance check-in mode tabs — full
  WAI-ARIA Tabs pattern (roving tabindex, arrow keys, Home/End) plus focus
  moved correctly on the two programmatic tab switches ("Edit", "Analytics")
  (Part 4)
- ✅ Chatbot widget — launcher toggle with `aria-expanded`, non-modal
  `role="dialog"` panel, Escape-to-close with focus returned to the
  launcher, focus moved to the input on every open (not just the first)
  (Part 5)
- ✅ Share/Add-to-Calendar dropdowns on the event page — WAI-ARIA Menu
  Button pattern, Arrow/Home/End navigation, Escape-to-close, focus
  returned to the trigger after choosing an option (Part 5)
- ✅ Sitewide sweep confirmed no `tabindex` greater than `0` anywhere, no
  `Tab`-key handler ever calls `preventDefault()` (so nothing can trap
  focus), and every click handler in the app targets a real `<button>`
  or `<a href>` — never a `<div>`/`<span>` acting as a fake button
  (Part 7)
- ✅ Traced two full end-to-end keyboard journeys (student:
  browse→register→pay→view ticket; organizer: apply→create event→manage→
  check attendees) confirming every step is reachable without a mouse —
  see "Keyboard User-Journey Walkthroughs" in `ACCESSIBILITY_AUDIT.md`
  for exactly what this did and didn't verify (Part 7)

## Screen-Reader Announcement Support (dynamic content)

Summary maintained here as parts complete:
- ✅ Form success/error messages — `#msg` regions across login, register,
  profile, organizer-apply, payment (Part 2)
- ✅ Attendance scan/manual check-in status (Part 2)
- ✅ Dashboard toast notifications — the shared feedback channel for every
  organizer action (create/edit/delete event, payment setup, proof review,
  applications) (Part 3)
- ✅ Event registration errors — announced via `role="alert"` *and* focused,
  not just announced (Part 3)
- ✅ Hard page-load failures (invalid/missing links, not-found states) on
  event, ticket, payment, and my-tickets pages (Part 3)
- ✅ Homepage search/filter result count (Part 3)
- ✅ Seat-hold countdown expiry — announced once, not on every tick (see
  "Accessibility Architecture Decisions" below for why the ticking display
  itself is deliberately not live) (Part 3)
- ✅ Dashboard "View Analytics" results — announced via a live region as
  soon as they load, right after focus lands on the newly-selected
  Analytics tab (Part 4)
- ✅ Chatbot messages — `role="log" aria-live="polite"` on the message
  list, so both the assistant's replies and the user's own sent messages
  are announced as they're added (Part 5)

## Color Contrast & Visual/Language Accessibility

- ✅ Solid-gradient button and active-tab backgrounds (primary/danger
  buttons, the header's main call-to-action, dashboard/attendance active
  tabs, the homepage category filter, chatbot chrome) — measured contrast
  against white text was as low as ~2.9:1 across these; new darker
  gradient tokens bring every one to 5.2:1 or better (Part 6)
- ✅ Redundant icon/alt-text cleanup — header logo `alt=""` (was duplicating
  the adjacent visible "CampusVibe" heading on every page) and
  `aria-hidden="true"` on decorative emoji next to text site-wide, so a
  screen reader doesn't announce the icon's name on top of the label it
  decorates (Part 6)
- ✅ `lang` attribute now set per-element (`lang="en"`) when a translation
  is missing and the English fallback string is shown, so it isn't
  mispronounced under the page's selected language (Part 6)
- ✅ Confirmed (not assumed) that language switching correctly re-translates
  dynamically-rendered content, not just static markup (Part 6)

## Known Limitations

- No live screen-reader, browser, or Lighthouse/axe run was performed —
  this sandbox has no GUI/audio/browser available at any point across all
  7 parts of this pass. Every fix in this project is backed by static
  source inspection, WCAG/ARIA spec compliance, and (for color contrast)
  a computed relative-luminance formula — never by hearing or seeing an
  actual assistive-technology or browser run. See "Explicitly NOT
  performed" and the "Conformance Statement" in `ACCESSIBILITY_AUDIT.md`
  for the full, itemized version of this limitation.
- Keyboard journeys were verified by tracing source code (DOM order,
  `tabindex`, focus calls), not by an actual keyboard-only session in a
  browser. See "Keyboard User-Journey Walkthroughs" in
  `ACCESSIBILITY_AUDIT.md`.
- All 7 parts of the planned remediation are now complete. Recommended
  next step, before any public conformance claim: a real screen-reader
  pass and a Lighthouse/axe run, per the Conformance Statement.

## Resume-Ready Accessibility Achievements

Concrete, verifiable outcomes from this pass — each one is a real code
change in this repository, traceable to a specific `A11Y-0xx` entry in
`ACCESSIBILITY_AUDIT.md`:

- Diagnosed and fixed a **P0 keyboard-blocking bug** in the event
  registration flow — a custom ticket-type selector built from
  unfocusable `<div>`s that no keyboard user could operate at all —
  replacing it with a correct ARIA radiogroup (roving tabindex, Arrow/
  Space/Enter, `aria-checked`).
- Implemented the **WAI-ARIA Authoring Practices Guide "Tabs" pattern**
  from scratch across two separate tab bars (dashboard organizer console,
  attendance check-in modes), including roving tabindex, Arrow/Home/End
  navigation, and correct focus management on two different kinds of
  programmatic tab switches.
- Implemented the **WAI-ARIA "Menu Button" pattern** from scratch via one
  shared, reusable helper function, applied to two different dropdown
  menus (Share, Add-to-Calendar) — avoiding duplicated keyboard-handling
  logic.
- Retrofitted a **non-modal dialog pattern** onto an existing chatbot
  widget (`aria-expanded`, `role="dialog"`, `role="log"` live
  announcements, Escape-to-close with focus restoration), correctly
  distinguishing it from a modal dialog rather than over-applying
  `aria-modal="true"`.
- Found and fixed a **real, measured WCAG 1.4.3 color-contrast failure**
  (as low as ~2.9:1 against a 4.5:1 requirement) affecting the app's
  primary/danger buttons and every active-tab state, by computing the
  actual WCAG relative-luminance formula in Python and introducing
  new, hue-matched, contrast-safe design tokens — without altering any
  color usage elsewhere in the app that was already passing.
- Added a `role="alert"`/`role="status"` live-region strategy applied
  *deliberately per case* (not uniformly) across 9+ distinct dynamic-
  content locations (toasts, form errors, search results, countdown
  expiry, hard page-load failures), including correctly identifying
  a ticking countdown as a case where `aria-live` would be actively
  harmful (per APG guidance) and using a one-shot status region instead.
- Fixed a **WCAG 3.1.2 Language of Parts gap** in a 30+-language i18n
  system: elements showing an English-fallback string (because the
  selected language had no translation for that key) are now marked
  `lang="en"` individually, rather than inheriting the page's selected
  language.
- Performed a sitewide **redundant-content-for-assistive-tech sweep**,
  fixing duplicate logo alt text on all 12 pages and hiding ~60 decorative
  emoji from the accessibility tree, all found via a combination of
  automated pattern-matching and manual review (not blind automation).
- Documented all of the above — 19 total issues — in a running,
  dated audit log with WCAG success-criterion citations, root-cause
  analysis, and an honest statement of what was and wasn't verified,
  rather than a one-time summary written after the fact.

## Testing Methodology

Static source inspection, keyboard/tab-order tracing from code, and
`node --check` syntax verification after each JS edit. See
`ACCESSIBILITY_AUDIT.md` for the full "Testing Methods Actually Used"
section.

## Accessibility Architecture Decisions

- **Native HTML first, ARIA second** — e.g. mobile nav uses a horizontally
  scrollable, always-in-DOM `<nav>` rather than a hidden hamburger menu, so
  no custom disclosure widget/keyboard handling was needed for it at all.
- Shared fixes (like "current page" nav indication) were added once, to the
  single script already loaded on every page (`chatbot.js`), instead of
  duplicating logic per page.
- **Ticking countdowns are deliberately not `aria-live`.** The seat-hold
  countdowns on `my-tickets.html`/`payment.html` update every second; making
  that text a live region would re-announce it every second, which the
  WAI-ARIA Authoring Practices Guide explicitly calls out as unusable. Instead
  each page has a separate hidden `role="status"` element that announces
  exactly once, on the one transition that matters (the hold expiring).
- **`role="status"` vs `role="alert"` was chosen deliberately per case**, not
  applied uniformly: `role="status"` (polite) for routine feedback — toasts,
  result counts, form success — and `role="alert"` (assertive, interrupts)
  reserved for actual failures a user needs to know about immediately —
  a rejected registration submit, a page whose primary content failed to
  load. Using `alert` everywhere would make the app noisy and would misuse
  a criterion meant for genuinely important interruptions.

## Remediation History

See "Progress Log" in `ACCESSIBILITY_AUDIT.md` — updated after every part.
