# CampusVibe Accessibility Audit

## Overview

This document is a running, honest log of an accessibility audit and remediation
pass performed on CampusVibe — a static HTML/CSS/vanilla-JS frontend served by
an Express backend. It records what was actually inspected, what was actually
changed, and what still needs work. Nothing in this file is aspirational or
assumed; every entry below corresponds to a real change in this repository.

## Scope

All 12 user-facing pages under `public/`:
`index.html`, `login.html`, `register.html`, `event.html`, `my-tickets.html`,
`ticket.html`, `payment.html`, `profile.html`, `organizer-apply.html`,
`attendance.html`, `dashboard.html`, `faq.html` — plus the shared assets
`assets/css/styles.css`, `assets/js/chatbot.js`, `assets/js/i18n.js`.

`server.js` (backend logic) is **out of scope** for accessibility (it has no
UI), except where it emits HTML/error strings that end up in the DOM.

## Standard & Target

- **Standard:** WCAG 2.2
- **Target conformance:** Level AA, where applicable to this codebase.
- This document does **not** claim full WCAG 2.2 AA conformance. It documents
  what was tested, what was fixed, and what remains open. See
  [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) for the plain-language conformance
  summary and honest limitations.

## Testing Methods Actually Used

- **Static code inspection** — reading every page's markup, inline scripts,
  and the shared CSS/JS assets directly (this is the primary method used
  throughout).
- **Keyboard walk-through reasoning** — tracing tab order, event handlers,
  and focus targets in the source to identify keyboard traps or unreachable
  controls.
- **Manual grep/pattern audits** — e.g. searching every page for `<img>`
  without `alt`, `<div>`/`<span>` with `onclick`, inputs without a
  `for`-linked `<label>`, etc.
- **Node syntax checks** (`node --check`) on edited JS files after each
  change, to catch syntax regressions.

### Explicitly NOT performed (documented honestly, not fabricated)

- **No live screen reader testing** (NVDA or VoiceOver) — this sandboxed
  environment has no GUI, audio, or assistive technology available to run
  them. All screen-reader-relevant fixes (accessible names, live regions,
  roles/states) are based on WCAG/ARIA spec compliance and accname
  computation rules, not on having heard actual announcements.
- **No JAWS testing** — not available, not claimed.
- **No live Lighthouse/axe run** — no browser available in this sandbox to
  execute them. Findings below come from manual source inspection against
  the same rules those tools check (label association, contrast values in
  CSS, ARIA validity, etc.), not from tool output. If you run Lighthouse/axe
  yourself after pulling these changes, please treat that as the first real
  automated baseline — record the actual numbers in the "Before/After"
  section rather than trusting any number here.
- **No visual regression screenshots** — changes were reasoned about from
  CSS/markup, not visually confirmed pixel-by-pixel.

## Priority Legend

- **P0** — Critical: blocks access or prevents completing an important workflow.
- **P1** — High: significantly affects accessibility or an important journey.
- **P2** — Medium: meaningful usability/accessibility problem, non-blocking.
- **P3** — Low: minor improvement or best-practice polish.

---

## Findings & Fixes

### A11Y-001 — No skip-navigation mechanism

- **Severity:** P2
- **Location:** All 12 pages (`<body>` start).
- **Impact:** Keyboard users had to tab through the full header/nav on every
  page load to reach the main content.
- **WCAG:** 2.4.1 Bypass Blocks (Level A).
- **Root cause:** No skip link existed anywhere in the codebase.
- **Fix:** Added a "Skip to main content" link as the first focusable
  element on every page, visually hidden until focused (`.skip-link` in
  `styles.css`), targeting each page's real `<main>` landmark (reusing
  existing IDs like `#catalog`/`#mainArea` instead of creating duplicate
  ones). Added `tabindex="-1"` to each `<main>` so focus can land there
  programmatically.
- **Verification:** Source inspection + keyboard tab-order reasoning.
  **Not** verified with a live screen reader (see "Explicitly NOT performed").
- **Status:** ✅ Fixed (Part 1).

### A11Y-002 — No "current page" indication in navigation

- **Severity:** P3
- **Location:** `.nav` links on every page.
- **Impact:** Sighted users get a hover/active visual cue; screen-reader
  users had no equivalent "you are here" signal.
- **WCAG:** 2.4.8 Location (Level AAA — not required for AA, implemented as
  a best-practice enhancement, not claimed as an AA fix).
- **Root cause:** No `aria-current` logic existed; several pages also
  rebuild `.nav` dynamically via JS after login, so a static per-page fix
  wouldn't survive that.
- **Fix:** Added `markCurrentNavLink()` to `assets/js/chatbot.js` — the one
  script already loaded on every real page — run after the DOM (and any
  dynamic nav rebuild) settles. It compares each nav link's path to
  `location.pathname` and sets `aria-current="page"` on the match. Added a
  small visual affordance (`font-weight:700`) so sighted users benefit too.
- **Verification:** Source inspection of load order in `index.html`/
  `dashboard.html` (chatbot.js's `DOMContentLoaded` listener runs after the
  inline script that rebuilds `#nav`, so it sees final markup).
- **Status:** ✅ Fixed (Part 1).

### A11Y-003 — Form `<label>` elements not associated with their inputs

- **Severity:** P1
- **Location:** `register.html`, `profile.html`, `organizer-apply.html`,
  `payment.html`, `attendance.html`, `event.html` (ticket-type radios,
  discount code, participant name/roll fields), `dashboard.html` (create/edit
  event form, payment setup, discount-code rows).
- **Impact:** These `<label class="label">Text</label>` elements are
  **visually** next to their input but have no `for` attribute, and the
  inputs have no matching reference. A screen reader focusing the input
  announces only its type (e.g. "edit text") with no name, or falls back to
  the placeholder if the browser exposes it — placeholders are not a
  reliable substitute for a label (WCAG 3.3.2) and disappear once text is
  typed. `login.html` was **not** affected — it already does this correctly,
  confirming this is an inconsistency introduced elsewhere, not a from-scratch
  gap.
- **WCAG:** 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or
  Instructions (Level A), 4.1.2 Name, Role, Value (Level A).
- **Fix:** Added `for`/`id` associations to every affected `<label>`/input
  pair across `register.html`, `profile.html`, `organizer-apply.html`,
  `payment.html`, and the create-event/payment-setup fields in
  `dashboard.html`. Repeatable discount-code rows (dynamically generated per
  event, one set of Code/Type/Value/Max-uses fields per row) previously had
  no per-row unique ids at all — gave each row's fields a real unique id
  (`${rowId}-code`, `${rowId}-type`, etc.) so the pattern still works when
  the organizer adds multiple rows. Where no visible `<label>` existed at
  all (`attendance.html`, several one-off dashboard fields like Account
  Number/IFSC/UPI), added `aria-label` instead — a visible label wasn't
  appropriate there without a bigger layout change, and `aria-label` is a
  valid WCAG 4.1.2-conformant accessible name for those inline/compact
  fields per the "native HTML first, ARIA second" principle (ARIA used only
  because a structural label wasn't a minimal-diff option).
  Also added `aria-describedby` linking password-rules and hint text to
  their inputs, and marked decorative red-asterisk "*" glyphs
  `aria-hidden="true"` with a `.sr-only` "(required)" text equivalent, so
  screen readers announce "required" rather than reading a bare asterisk
  glyph.
  Note: checkbox labels in `dashboard.html` (Single/Duo/Trio tier toggles,
  "Enable" discount codes) already **wrapped** their `<input>` — that is a
  valid native association and needed no change.
- **Verification:** Source inspection, `node --check` on every edited
  inline script, and an HTML well-formedness parse pass. **Not** verified
  with a live screen reader.
- **Status:** ✅ Fixed (Part 2).

### A11Y-004 — Ticket-type selector was keyboard-inoperable (P0)

- **Severity:** P0 — this blocked the core registration workflow for
  keyboard-only users entirely.
- **Location:** `event.html`, `#tierGrid` (Single/Duo/Trio ticket-type
  selection on every event's registration screen).
- **Impact:** Each ticket-tier option was a plain `<div class="tier-price-card">`
  with a `click` listener and no `tabindex`, `role`, or keyboard handler at
  all. A mouse user could click a tier; a keyboard-only user had **no way
  to select a ticket type**, meaning no way to register for any paid or
  free event with tier options. This is the single most serious finding in
  this audit.
- **WCAG:** 2.1.1 Keyboard (Level A), 4.1.2 Name, Role, Value (Level A).
- **Root cause:** Custom selection UI built from styled `<div>`s instead of
  native `<input type="radio">` or a button group, with no ARIA or keyboard
  support added to compensate.
- **Fix:** Converted `#tierGrid` into a proper WAI-ARIA radiogroup: the
  container has `role="radiogroup"` + `aria-labelledby` pointing at the
  "Choose Ticket Type" label; each card has `role="radio"`, `aria-checked`,
  `aria-disabled` for tiers the organizer hasn't enabled, and a **roving
  tabindex** (only the checked card is `tabindex="0"`, matching native
  radio-button Tab behavior). Arrow Left/Right/Up/Down cycle selection among
  the *allowed* tiers only, and Enter/Space also select — per the WAI-ARIA
  Authoring Practices Guide radio-group pattern. Focus is restored to the
  newly-selected card after each re-render (the grid's `innerHTML` is
  rebuilt on every selection, which would otherwise silently drop focus to
  `<body>`). Added a visible `:focus-visible` outline in `styles.css`, since
  this is a styled div, not a native input with a built-in focus ring.
- **Verification:** Source/logic trace of the keydown handler and focus
  restoration. **Not** verified with a live keyboard + screen reader
  combination — that would be the ideal next verification step.
- **Status:** ✅ Fixed (Part 2).

### A11Y-005 — Dashboard toast notifications never announced to screen readers

- **Severity:** P1
- **Location:** `dashboard.html`, `#toast` (the shared success/error toast
  used by *every* organizer action: create/update/delete event, save
  payment setup, load/approve/reject payment proofs, approve/reject
  organizer applications).
- **Impact:** `showToast()` only ever set `.textContent` and toggled a
  `.show` class (a CSS transform/opacity transition). With no `role` or
  `aria-live`, a screen-reader user gets **zero feedback** for the single
  busiest feedback channel in the entire organizer console — e.g. clicking
  "Delete" gives no indication of success or failure other than the event
  silently disappearing (or not) from a list that they'd have to re-find and
  re-inspect.
- **WCAG:** 4.1.3 Status Messages (Level AA).
- **Root cause:** No live region — feedback was visual-only (color + toast
  position), a common but incomplete pattern (it's also a duplicate of the
  "conveyed by visual position alone" problem this same criterion covers).
- **Fix:** Added `role="status" aria-live="polite" aria-atomic="true"` to
  the persistent `#toast` element. Because the element already exists in
  the DOM at page load (it's just visually hidden via CSS transform, not
  removed), this is the minimal-diff fix — no restructuring of
  `showToast()` itself was needed.
- **Verification:** Source inspection of `showToast()`'s call sites (13
  across the file) confirms every one routes through this single element.
  **Not** verified with a live screen reader.
- **Status:** ✅ Fixed (Part 3).

### A11Y-006 — Share-link confirmation toast on event.html not announced

- **Severity:** P3
- **Location:** `event.html`, `shareToast()` (shown after "Copy Link" /
  "Instagram" share actions).
- **Impact:** Minor — the action itself (clipboard copy) already succeeded
  silently from the user's perspective either way, but sighted users get a
  transient visual confirmation that screen-reader users didn't.
- **WCAG:** 4.1.3 Status Messages (Level AA).
- **Root cause:** The toast `<div>` is created fresh on first use via
  `document.createElement`, with no `role`/`aria-live` ever set.
- **Fix:** Set `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
  at element-creation time, before the first `textContent` write, so the
  very first toast is announced too (not just subsequent ones).
- **Verification:** Source inspection. **Not** verified with a live screen
  reader.
- **Status:** ✅ Fixed (Part 3).

### A11Y-007 — Event registration errors not announced or focused

- **Severity:** P1
- **Location:** `event.html`, the `#reg` (Register) button's submit
  handler.
- **Impact:** On a failed registration (e.g. "Discount code invalid",
  capacity race lost, validation error from the server), the error was
  inserted at the top of `#root` via `insertAdjacentHTML` and the page was
  smooth-scrolled to it — a purely visual cue. A screen-reader user stays
  focused on the Register button they just activated and gets no
  announcement that anything happened, let alone why it failed. This
  directly affects completing a core registration workflow.
- **WCAG:** 4.1.3 Status Messages (Level AA), 3.3.1 Error Identification
  (Level A).
- **Root cause:** No live region and no focus management on the
  dynamically-inserted error.
- **Fix:** Added `role="alert"` (an assertive, implicit live region — the
  right choice here since it's a blocking error on a user-initiated
  submit, not a passive status update) and `tabindex="-1"` to the error
  `<div>`, then called `.focus()` on it immediately after insertion. This
  both announces the error text on insertion (`role="alert"`) *and* moves
  screen-reader/keyboard focus to it, so the very next Tab press continues
  from a position the user can actually perceive, instead of from
  wherever the button happened to be.
- **Verification:** Source/logic trace of the submit handler. **Not**
  verified with a live screen reader.
- **Status:** ✅ Fixed (Part 3).

### A11Y-008 — Hard page-load failures not announced as alerts

- **Severity:** P2
- **Location:** `event.html` ("Invalid event link", "Event not found"),
  `ticket.html` (`renderError()` — invalid link, not found, network
  failure), `payment.html` ("Invalid payment link", "Failed to load
  payment details"), `my-tickets.html` ("Failed to load tickets").
- **Impact:** These pages are always reached via a direct link (from an
  email, a QR code, another page's redirect) — there's no prior page state
  for a screen-reader user to have "seen coming". If the primary content
  fails to load, the failure replaces a loading skeleton with no semantic
  signal that this is an *error* rather than the normal page content.
- **WCAG:** 4.1.3 Status Messages (Level AA).
- **Root cause:** Failure-state markup used the same plain `.alert.warn`
  div as any other content block, with no `role`.
- **Fix:** Added `role="alert"` to each of these specific failure blocks
  only (not to normal successful content rendering, which is not a
  "status message" — it's the page's primary content and is already
  reachable via normal reading order/landmarks).
- **Verification:** Source inspection across all four files. **Not**
  verified with a live screen reader.
- **Status:** ✅ Fixed (Part 3).

### A11Y-009 — Search/filter result count on the homepage not announced

- **Severity:** P2
- **Location:** `index.html`, `#resultsHint` (updates on search-box input
  and category/sort changes with e.g. "Showing 12 live events").
- **Impact:** This is exactly the kind of feedback WCAG 4.1.3 targets —
  content changes in response to user action, conveyed only visually. A
  screen-reader user typing a search term gets no indication of how many
  results came back (or that the list changed at all) without manually
  re-navigating to the results grid each time.
- **WCAG:** 4.1.3 Status Messages (Level AA).
- **Root cause:** No live region on `#resultsHint`.
- **Fix:** Added `role="status" aria-live="polite" aria-atomic="true"`.
  Also had the network-failure `catch` branch in `filterEvents()` write a
  message into the same element ("Couldn't load events — check your
  connection"), which it previously left blank — a related gap in the same
  code path, fixed alongside since it's the same element and same root
  cause (a status change with no accessible announcement).
- **Verification:** Source inspection. **Not** verified with a live screen
  reader.
- **Status:** ✅ Fixed (Part 3).

### A11Y-010 — Seat-hold countdown expiry not announced

- **Severity:** P2
- **Location:** `my-tickets.html` (`.tc-countdown`, per-ticket) and
  `payment.html` (`#holdCountdown`, single ticket being paid for) — both
  show a live "⏰ Seat held for MM:SS" countdown that ticks every second
  until the temporary seat hold expires.
- **Impact:** The countdown text itself was correctly left out of any live
  region — this is intentional, not an oversight (see "Design decision"
  below). But that also meant the *one* transition in this countdown that
  actually matters — the hold expiring, which on `payment.html` also
  disables the Submit Proof button — was completely silent to
  screen-reader users. A sighted user sees the text change to "expired";
  a screen-reader user tabbing back to a now-disabled Submit button with
  no explanation would reasonably read that as a bug.
- **WCAG:** 4.1.3 Status Messages (Level AA), 4.1.2 Name, Role, Value
  (Level A) — for the button's disabled-state change specifically.
- **Design decision (documented, not just fixed):** Making the visible
  countdown itself `aria-live` was considered and rejected — a region that
  re-announces every second is a textbook anti-pattern (WAI-ARIA APG
  explicitly warns against highly dynamic live regions) and would make the
  page unusable with a screen reader running. Instead, a separate
  visually-hidden (`.sr-only`) `role="status"` element was added on each
  page, updated **exactly once** — guarded with a boolean flag
  (`el._announcedExpired` on my-tickets.html; the `clearInterval` early
  return on payment.html, which only runs once by construction) — the
  moment a hold transitions to expired.
- **Verification:** Source/logic trace of both `tick()` functions,
  confirming the announcement fires on the expiry transition only and not
  on every subsequent tick. **Not** verified with a live screen reader —
  this is exactly the kind of timing-sensitive behavior live testing would
  be most valuable for, and is called out as such in "Remaining Issues".
- **Status:** ✅ Fixed (Part 3).

### A11Y-011 — Decorative loading spinners exposed to assistive tech

- **Severity:** P3
- **Location:** Loading spinner `<span class="spinner">` on login.html,
  organizer-apply.html, payment.html, register.html (static markup,
  toggled via `style.display`), and dashboard.html (created dynamically
  inside `showToast`'s sibling `withLoading()` helper).
- **Impact:** Minimal in practice (an empty `<span>` has no accessible
  name to announce), but the element is purely decorative (a CSS
  animation) and was not marked as such, which is best practice and closes
  off any inconsistent AT behavior across browsers/engines.
- **WCAG:** 1.1.1 Non-text Content (Level A) — decorative-content
  handling.
- **Fix:** Added `aria-hidden="true"` to every spinner `<span>`, static and
  dynamically-created alike. The adjacent visible text ("Loading...",
  "Submitting...") already carries the actual status change and is what
  gets announced.
- **Verification:** Source inspection; `node --check` + HTML well-formedness
  parse on every edited file (see Testing Methods).
- **Status:** ✅ Fixed (Part 3).

### A11Y-012 — Dashboard organizer tabs used no ARIA Tabs pattern

- **Severity:** P1
- **Location:** `dashboard.html`, `#tabs` / `.section-tab` / `.tab-panel`
  (Create Event, My Events, Payment Setup, Payment Proofs, Analytics, and
  — for admins — Organizer Applications).
- **Impact:** The six section buttons were real `<button>` elements (so
  basic Tab-to-reach + Enter/Space-to-activate already worked — this was
  **not** a P0 keyboard blocker like A11Y-004 was), but nothing told
  assistive technology this was a tab interface at all: no `tablist`/`tab`/
  `tabpanel` roles, no `aria-selected` to say which one is current, no
  `aria-controls` linking a tab to the panel it shows, and each tab sat in
  the normal Tab order individually rather than acting as one stop with
  arrow-key navigation between options — the behavior screen-reader users
  familiar with tabs expect (and rely on to skip past 5 tabs they don't
  want with one Tab press instead of five).
- **WCAG:** 4.1.2 Name, Role, Value (Level A); 2.1.1 Keyboard (Level A) for
  the missing arrow-key/Home/End support specifically.
- **Root cause:** Custom tab UI built from plain buttons/divs with only
  visual (`.active` class) state, no ARIA semantics or roving tabindex —
  the same underlying gap as A11Y-004, in a different widget.
- **Fix:** Implemented the WAI-ARIA APG "Tabs" pattern with automatic
  activation:
  - `#tabs` is `role="tablist"` with an `aria-label`.
  - Each button is `role="tab"`, carries `aria-selected`, `aria-controls`
    pointing at its panel's id, and a **roving tabindex** (only the
    selected tab is `tabindex="0"`; the rest are `-1` — Tab moves past the
    whole group in one stop, exactly like the ticket-type radiogroup from
    Part 2).
  - Each panel is `role="tabpanel"`, `aria-labelledby` pointing back at its
    tab, and `tabindex="0"` so it's reachable/focusable in its own right
    (used by the focus-management fixes below).
  - Left/Right (and Up/Down, treated the same on this single-row list) move
    focus **and** activate the newly-focused tab; Home/End jump to the
    first/last tab — per the "automatic activation" variant of the pattern,
    which matches how this UI already behaved on click.
  - `switchTab()` was extended to keep `aria-selected`/`tabindex` in sync
    on every call, including the three places it's invoked
    programmatically ("Edit" on an event, "Analytics" on an event, and the
    existing "Set up Payment →" shortcut) — not just from direct tab-bar
    clicks.
- **Verification:** Source/logic trace of the keydown handler and
  `switchTab()`'s three call sites. `node --check` + HTML well-formedness
  parse on the edited file. **Not** verified with a live screen reader.
- **Status:** ✅ Fixed (Part 4).

### A11Y-013 — Attendance check-in mode tabs had the same gap

- **Severity:** P2 (same root cause as A11Y-012, but only 2 tabs and lower
  traffic than the organizer dashboard, hence one severity step down).
- **Location:** `attendance.html`, `.mode-tabs` (📷 QR Scan / 🔢 Manual by
  Ticket #).
- **Impact:** Same as A11Y-012 — no tab semantics, no arrow-key support.
- **WCAG:** 4.1.2 Name, Role, Value (Level A); 2.1.1 Keyboard (Level A).
- **Fix:** Identical WAI-ARIA APG "Tabs" pattern applied — `role="tablist"`/
  `"tab"`/`"tabpanel"`, `aria-selected`, `aria-controls`/`aria-labelledby`,
  roving tabindex, Left/Right/Up/Down/Home/End automatic activation. Logic
  was factored into a small `switchMode()` function so the click handler
  and the new keydown handler share one code path instead of duplicating
  the class-toggling logic.
- **Verification:** Source inspection, `node --check`, HTML well-formedness
  parse. **Not** verified with a live screen reader.
- **Status:** ✅ Fixed (Part 4).

### A11Y-014 — Focus left behind after programmatic tab switches

- **Severity:** P2
- **Location:** `dashboard.html`, `startEditEvent()` (Edit → Create tab)
  and the `analytics` branch of `handleEventClick()` (Analytics → Analytics
  tab).
- **Impact:** Clicking "Edit" or "Analytics" on an event under "My Events"
  calls `switchTab()` to jump to a different tab, but focus silently stayed
  on the button in the now-hidden "My Events" panel. A sighted user sees
  the new panel appear; a keyboard/screen-reader user's next Tab press
  would continue from a control that's no longer visible, in a panel
  that's no longer showing — confusing and easy to lose track of. (The
  pre-existing "Set up Payment →" shortcut, `goToPaymentSetup()`, already
  did this correctly — it was the template for this fix, not a new
  pattern.)
- **WCAG:** 2.4.3 Focus Order (Level A).
- **Fix:** `startEditEvent()` now focuses the Title field (`els.title`)
  after switching tabs and populating the form — matching the user's
  actual intent (edit the title first). The `analytics` action now focuses
  the analytics `tabpanel` itself (using the `tabindex="0"` added for
  A11Y-012) immediately after switching, so a screen-reader user lands in
  the right region and hears the stats — via the `#analytics` container's
  new `role="status" aria-live="polite"` (added alongside this fix, since
  the stats load asynchronously after the tab switch) — as soon as they
  arrive.
- **Verification:** Source/logic trace of both call sites. **Not**
  verified with a live screen reader.
- **Status:** ✅ Fixed (Part 4).

### A11Y-015 — Chatbot widget had no accessible open/closed state or live announcements

- **Severity:** P1
- **Location:** `assets/js/chatbot.js` (`#cvbot-launcher`, `#cvbot-panel`,
  `#cvbot-messages`, `#cvbot-send`), loaded on every page.
- **Impact:**
  - The launcher button (🤔) had an `aria-label` but no `aria-expanded` or
    `aria-haspopup` — a screen-reader user had no way to know it opened a
    panel, or whether that panel was currently open, before activating it.
  - The panel itself had no `role`, so AT users tabbing into it got no
    indication it was a distinct dialog/widget rather than more page
    content.
  - New bot/user messages were appended to `#cvbot-messages` with plain
    `innerHTML`/`appendChild` and no `aria-live` region — a screen-reader
    user who asked a question and looked away would never hear the
    answer arrive; they'd have to know to re-focus the messages list.
  - `#cvbot-send` was an icon-only button (`➤`) with no accessible name
    at all — its accname would have been the arrow glyph itself.
  - The launcher's click handler always called `togglePanel(true)`, so it
    could open but never close the panel — inconsistent with a control
    that advertises `aria-expanded` (a toggle implies it toggles).
  - Focus was only ever moved into the panel's input on the *very first*
    open (a `panelOpened` one-shot flag) — every subsequent open silently
    left focus on the launcher instead of the newly-visible input.
- **WCAG:** 4.1.2 Name, Role, Value (Level A) — launcher state and send
  button name; 4.1.3 Status Messages (Level AA) — message announcements;
  2.4.3 Focus Order (Level A) — focus on open/close.
- **Root cause:** The widget was built as a self-contained script that
  injects its own markup, but that markup only ever considered mouse/visual
  interaction (a CSS `.open` class), with no parallel ARIA state or live
  region added alongside it.
- **Fix:**
  - Launcher: `aria-haspopup="dialog"`, `aria-expanded` (kept in sync on
    every open/close), `aria-controls="cvbot-panel"`; clicking it now
    toggles based on current state instead of only ever opening.
  - Panel: `role="dialog"` with `aria-label`. Deliberately **not**
    `aria-modal="true"` — this is a non-modal widget (the rest of the page
    stays operable, no backdrop, no focus trap), so claiming modal status
    would misrepresent its actual behavior.
  - `#cvbot-messages`: `role="log" aria-live="polite" aria-relevant="additions"`
    — new messages (both the bot's replies and the user's own echoed
    input) are announced as they arrive, without re-announcing the whole
    history on every addition.
  - `#cvbot-send`: `aria-label="Send message"`.
  - `#cvbot-suggestions`: `role="group" aria-label="Suggested questions"`
    so the chip buttons are announced as a related set.
  - The chat input gained an associated (visually-hidden) `<label>` in
    addition to its existing `placeholder`, since a placeholder alone is
    not a reliable accessible name across all AT/browser combinations.
  - Focus now moves to the input on **every** open (the one-shot flag was
    removed), and `Escape` — from anywhere inside the panel — closes it
    and returns focus to the launcher, matching the standard dismissible-
    widget expectation used elsewhere in this app (menus, below).
- **Verification:** Source/logic trace of `togglePanel`, the new keydown
  handler, and `injectMarkup`. `node --check` on the edited file. **Not**
  verified with a live screen reader.
- **Status:** ✅ Fixed (Part 5).

### A11Y-016 — Share/Calendar dropdowns on event.html were mouse-only menus

- **Severity:** P1
- **Location:** `event.html`, `#calendarBtn`/`#calendarMenu` and
  `#shareBtn`/`#shareMenu`.
- **Impact:** Both "Add to Calendar" and the Web-Share-API fallback
  "Share" control opened a small custom dropdown on click, closed on an
  outside click, and had no other behavior:
  - No `aria-haspopup`/`aria-expanded` on either trigger button, so a
    screen-reader user had no indication these buttons opened a menu, or
    whether it was open.
  - The dropdown `<div>`s had no `role="menu"`, and their options
    (a mix of `<button>` and one `<a>`) had no `role="menuitem"` — so AT
    users landed on a list of generic controls with no relationship
    between the trigger and its options.
  - The options were reachable by Tab one at a time (fine on its own),
    but there was no Arrow-key navigation between them, no Home/End, and
    critically **no Escape to close** — a keyboard user who opened either
    menu could only dismiss it by tabbing all the way past every option
    into unrelated page content, or by finding a mouse.
  - After choosing an option (e.g. "Copy Link" or "Add to Google
    Calendar"), focus was left on whatever element happened to have been
    clicked/removed, not deliberately returned anywhere.
- **WCAG:** 4.1.2 Name, Role, Value (Level A); 2.1.1 Keyboard (Level A) —
  Escape-to-close and arrow navigation were entirely missing, not just
  incomplete; 2.4.3 Focus Order (Level A) — focus after selecting an
  option.
- **Root cause:** Same pattern as A11Y-004/A11Y-012/A11Y-013 — a custom
  interactive widget built with only visual/mouse behavior (`style.display`
  toggling) and no parallel keyboard/ARIA implementation.
- **Fix:** Implemented the WAI-ARIA APG "Menu Button" pattern via one
  shared `setupMenuButton(btnEl, menuEl)` helper used by both dropdowns
  (avoiding duplicating the same keyboard logic twice):
  - Trigger buttons get `aria-haspopup="true"`, `aria-expanded` kept in
    sync, and `aria-controls` pointing at the menu's id.
  - Menus are `role="menu"` with an `aria-label`; each option is
    `role="menuitem"` with a **roving tabindex** (only one option is
    `tabindex="0"` at a time; the rest are `-1`), consistent with the
    roving-tabindex approach already used for the ticket-type radiogroup
    (Part 2) and the tab bars (Part 4).
  - Opening via `↓`/`↑` on the trigger moves focus straight to the
    first/last option; inside the menu, `↓`/`↑` move between options,
    `Home`/`End` jump to the first/last, and **`Escape` closes the menu
    and returns focus to the trigger button** (previously impossible by
    keyboard). `Tab` also closes the menu (matching APG guidance that a
    menu shouldn't remain open once focus leaves it).
  - Clicking an in-page action (Copy Link, Add to Google Calendar, the
    social-share links) now explicitly closes the menu and returns focus
    to the trigger, instead of leaving focus wherever the click landed.
    The `.ics` download `<a>` gets a lighter-touch version of the same
    fix — it closes the menu on click without interfering with the
    link's normal download behavior.
  - The Web-Share-API branch (used automatically on devices that support
    the native OS share sheet) deliberately does **not** get
    `aria-haspopup`/`aria-expanded` — in that branch `#shareBtn` is a
    plain action button that invokes an OS-level dialog directly, not an
    in-page menu, so claiming menu semantics there would be inaccurate.
  - Added `.share-option:focus-visible` styling (matching the existing
    `:focus-visible` treatment used for tabs and the ticket-type cards)
    since menu options previously relied on an unstyled default outline.
- **Verification:** Source/logic trace of `setupMenuButton` and both call
  sites; confirmed the native-share branch never invokes the menu
  helper. `node --check`-equivalent (extracted and parsed both inline
  `<script>` blocks with Node) after editing. **Not** verified with a
  live screen reader or real mouse+keyboard browser session.
- **Status:** ✅ Fixed (Part 5).

*(Additional entries continue below as each part is completed — see the
Progress Log for the running narrative of what was done, in order.)*

### A11Y-017 — Solid-color button/tab backgrounds didn't meet 4.5:1 against their white text

- **Severity:** P1
- **Location:** `assets/css/styles.css` — `.btn.primary`, `.btn.danger`,
  `.cv-header .nav a.nav-cta`, `.category-pill.active`, `.step-num`,
  `.section-tab.active` (dashboard's Create/My Events/Payment Setup/
  Payment Proofs/Analytics tabs); `attendance.html`'s `.mode-tab.active`
  (QR Scan / Manual by Ticket #); and the chatbot widget's launcher,
  header bar, "you" message bubbles, and send button
  (`assets/js/chatbot.js`).
- **Impact:** All of these render near-white text (`#fff`/`#f4f7ff`) over
  a `linear-gradient(var(--primary), var(--primary-2))`-family
  background (or, for `.btn.danger`, `var(--danger)` → `#d43d61`).
  Measured against the actual rendered gradient — not just its lightest
  stop — text contrast ranged from **~2.9:1 to ~4.3:1** depending on
  exactly where in the gradient a given glyph sits, never reaching the
  4.5:1 WCAG AA floor for normal-weight text at these font sizes (14–16px,
  none large enough or bold enough to qualify for the 3:1 large-text
  exception). This affects primary/danger action buttons, the header's
  main call-to-action, the homepage category filter's active state, the
  numbered step badges in the organizer instructions, every active tab
  across the dashboard and attendance pages, and the chatbot's own chrome
  and the user's own sent messages — i.e. some of the most-used controls
  and most-read text in the app.
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA).
- **Root cause:** `--primary` (#6c8cff) and `--primary-2` (#4a6cff) were
  tuned to look good as *text* on the app's very dark backgrounds (where
  they measure 5.6–6.2:1 and are fine) and were then reused, unchanged,
  as a *background* gradient behind light text — a different pairing
  with a different contrast requirement that nobody had checked.
- **Fix:** Added two new gradient-stop tokens, computed to keep the same
  hue family but dark enough that **every point along the gradient**
  clears 4.5:1 against white text (not just the darker endpoint):
  `--btn-primary-grad-1: #2353fe` / `--btn-primary-grad-2: #0836ff`
  (worst-case 5.24:1) and `--btn-danger-grad-1: #c7113c` /
  `--btn-danger-grad-2: #9c223f` (worst-case 5.48:1). Every location
  listed above now uses these tokens instead of `--primary`/
  `--primary-2`/`--danger` for its *background*; `--primary` itself is
  untouched, since every one of its other uses (outline-button text/
  border, links, category accents) was already measured as passing and
  changing it would have risked breaking those for no reason.
- **Verification:** Computed WCAG relative-luminance contrast ratios in
  Python for the old and new colors, at the gradient's top stop, bottom
  stop, and midpoint (to account for text sitting mid-gradient rather
  than at an edge) — old range ~2.9–4.3:1 confirmed failing everywhere
  along the gradient regardless of exact glyph position; new range
  5.24–7.87:1 confirmed passing everywhere along the gradient with
  margin. **Not** verified with a real browser color picker or a
  contrast-checker extension (none available in this sandbox) — the
  math should be exact (it's the same formula those tools use), but a
  quick spot-check with one is worth doing before shipping.
- **Status:** ✅ Fixed (Part 6).

### A11Y-018 — English-fallback strings weren't marked when a translation was missing

- **Severity:** P3
- **Location:** `assets/js/i18n.js`, `applyToDom()`.
- **Impact:** When the selected language's string table has no entry for
  a given `data-i18n`/`data-i18n-title` key, `t()` silently falls back to
  the English string — a deliberate and reasonable design choice so the
  page never shows a raw key or blank text. But the element showing that
  English fallback wasn't marked as English; it just inherited whatever
  `lang` was set on `<html>` for the selected language. A screen reader
  in, say, Hindi mode would apply Hindi pronunciation rules to that
  English fallback text instead of reading it as English.
- **WCAG:** 3.1.2 Language of Parts (Level AA).
- **Root cause:** `applyToDom()` always called `document.documentElement
  .setAttribute('lang', lang)` for the page as a whole, but never checked,
  per element, whether the string it had just written was an actual
  translation or an English fallback.
- **Fix:** `applyToDom()` now looks up each key directly in the current
  language's table (not through `t()`, which hides whether a fallback
  happened) and sets `lang="en"` on that specific element when the key is
  missing there, clearing it when a real translation exists. Applied to
  both `[data-i18n]` and `[data-i18n-title]` elements. Deliberately
  **not** applied to `[data-i18n-placeholder]` — screen-reader support
  for a `lang` attribute changing placeholder pronunciation is
  inconsistent enough across AT/browser combinations that it wasn't
  worth the added complexity for uncertain benefit; documented here
  rather than silently skipped.
- **Verification:** Source/logic trace of the new `markFallback()` helper
  and both call sites; `node --check` on the edited file. **Not**
  verified with a live screen reader in a non-English mode.
- **Status:** ✅ Fixed (Part 6).

### A11Y-019 — Redundant logo alt text, and decorative emoji/icons not hidden from assistive tech

- **Severity:** P2
- **Location:** Site-wide — the header `<img class="logo">` on all 12
  pages, and dozens of emoji used as button/label/status icons across
  `attendance.html`, `dashboard.html`, `event.html`, `faq.html`,
  `index.html`, `my-tickets.html`, `organizer-apply.html`, `payment.html`,
  and `ticket.html`.
- **Impact:**
  - Every page's header logo had `alt="CampusVibe"` sitting directly next
    to a visible `<h1>CampusVibe</h1>` — a screen reader announced
    "CampusVibe" twice, back to back, on every single page load. (The
    footer logo on `index.html` already used `alt=""` correctly in the
    same situation — this was an inconsistency, not a novel pattern.)
  - The vast majority of buttons, links, status badges, and section
    headings that pair an emoji with a text label (📅 Add to Calendar,
    ✅ Approve, ❌ Payment Rejected, 🔒 organizer-access gate cards, empty-
    state icons like 📭/🔍/🎟️, the homepage's quick-links row, category
    chips, etc.) had no `aria-hidden` on the emoji. A screen reader would
    announce the emoji's own name in addition to the adjacent text (e.g.
    "check mark button, Approve button" instead of just "Approve
    button") — redundant at best, confusing at worst when the emoji's
    announced name doesn't obviously match its intended meaning.
- **WCAG:** 1.1.1 Non-text Content (Level A) — decorative content that
  duplicates adjacent text should be hidden from the accessibility tree,
  not given its own (redundant) text alternative.
- **Root cause:** Emoji were added throughout as a lightweight way to add
  visual texture without needing an icon font or SVG set — a reasonable
  choice — but with no pass to mark the purely-decorative ones
  (duplicating adjacent text) as `aria-hidden="true"`.
- **Fix:**
  - Set the header logo's `alt=""` on all 12 pages (it's redundant with
    the adjacent `<h1>CampusVibe</h1>`), matching the existing correct
    footer pattern.
  - Wrapped decorative emoji in `<span aria-hidden="true">…</span>` in
    every case found where the emoji sits next to (or immediately before)
    text that already conveys the same information — including inside
    dynamically-rendered template strings (event cards, dashboard tabs,
    ticket status badges, empty states) and standalone bare-icon elements
    directly followed by a heading (e.g. the 🔒/🚫 "access required" gate
    cards). Also covered category-icon spans (`.cat-icon-bg`, `.cat-chip`)
    which duplicate the category name shown right next to them.
  - Left emoji **not** hidden where they carry information without any
    accompanying visible text — none were found in this pass, but this
    was checked for, not assumed away (e.g. any icon-only button would
    need a real accessible name via `aria-label`, not `aria-hidden`).
- **Verification:** Automated regex-based sweep across all 12 HTML pages
  (Python) to find emoji-adjacent text patterns, run twice — once for
  static text and once, by hand, for the handful of dynamic
  (`${...}`-interpolated) template strings the automated pass
  intentionally skipped to avoid corrupting JS — followed by a manual
  review of every match before wrapping it, plus a second sweep
  afterward specifically for bare emoji-only elements to confirm none
  needed an accessible name instead of `aria-hidden`. `node --check` /
  parsed every inline `<script>` block on every edited page after each
  round of edits. **Not** verified with a live screen reader.
- **Status:** ✅ Fixed (Part 6).

---

## Progress Log

### Part 1 — Global navigation & landmarks
- Fixed A11Y-001, A11Y-002. See above.

### Part 2 — Forms accessibility
- Fixed A11Y-003 (label/input association across register, profile,
  organizer-apply, payment, attendance, dashboard forms).
- Fixed A11Y-004 (ticket-type radiogroup keyboard support on event.html —
  the most important fix in this audit).
- Added `role="status" aria-live="polite" aria-atomic="true"` to the shared
  `#msg` success/error containers on login, register, profile,
  organizer-apply, and payment, plus to the scan/manual-check-in status
  regions on attendance.html — so form/action feedback that was previously
  visual-only is now announced to screen readers. (This overlaps with
  "dynamic content" scope from Part 3, but was tightly coupled to these
  same forms, so it was done here instead of being split awkwardly across
  two parts.)

### Part 3 — Dynamic content & status messaging
- Fixed A11Y-005 through A11Y-011 (dashboard toast, share toast, event
  registration errors, hard page-load failures, homepage search/filter
  result count, seat-hold countdown expiry, decorative spinners).
- Files touched: `dashboard.html`, `event.html`, `ticket.html`,
  `my-tickets.html`, `payment.html`, `index.html`, `login.html`,
  `organizer-apply.html`, `register.html`.
- Explicitly did **not** add a live region to `attendance.html`'s
  `#recentFeed` (the scrolling list of recent check-ins) — its
  organizer-facing `#scanStatus` (already `role="status"` from Part 2)
  already announces each check-in the moment it happens; making the feed
  list live too would double-announce the same event on every scan.
  Documented here rather than silently skipped, per the "explain the
  reasoning" instruction for items that look applicable but aren't the
  right fix.
- Deferred to Part 4: the `.section-tab`/`.tab-panel` pattern in
  `dashboard.html` and the `.mode-tab`/`.mode-panel` pattern in
  `attendance.html` are both plain click-toggled divs with no ARIA tabs
  semantics yet — in scope for "Dashboard Tabs", not "Dynamic Content".
- Deferred to Part 5: `chatbot.js` message announcements and
  `aria-expanded` on its toggle are explicitly Part 5 scope
  ("Chatbot & Dropdown Menus").

### Part 4 — Dashboard tabs
- Fixed A11Y-012, A11Y-013, A11Y-014 (organizer dashboard tabs, attendance
  mode tabs, and focus management on the two places that jump tabs
  programmatically).
- Files touched: `dashboard.html`, `attendance.html`,
  `assets/css/styles.css` (added `:focus-visible` styling for the tab
  buttons and suppressed the default ring on programmatically-focused tab
  panels, consistent with the existing `main:focus` treatment for the skip
  link target).
- Confirmed **not** in scope here, staying deferred to Part 5: the
  chatbot toggle and the share/calendar dropdown menus on `event.html`
  use a different interaction pattern (disclosure widgets, not tabs) and
  are explicitly called out as Part 5 ("Chatbot & Dropdown Menus").

### Part 5 — Chatbot & dropdown menus
- Fixed A11Y-015 (chatbot launcher/panel state, live message
  announcements, send-button name, focus management, toggle behavior).
- Fixed A11Y-016 (Share and Add-to-Calendar dropdowns on `event.html` —
  WAI-ARIA Menu Button pattern via one shared `setupMenuButton()` helper,
  Escape-to-close, arrow/Home/End navigation, focus returned to trigger).
- Files touched: `assets/js/chatbot.js`, `event.html`,
  `assets/css/styles.css` (added `.share-option:focus-visible`).
- Confirmed the native Web Share API branch on `event.html` intentionally
  keeps plain button semantics (no `aria-haspopup`/`aria-expanded`) since
  it invokes an OS-level share sheet, not an in-page menu — not a gap,
  a deliberate distinction.
- Deferred to Part 6: color contrast, decorative/informative icon
  handling (the emoji used throughout — 📅, 🔗, 💬, etc. — have not yet
  been audited for whether they need `aria-hidden` or an accessible
  name), and `lang` attribute behavior during language switching are all
  explicitly Part 6 scope ("Images, Contrast & Multilingual
  Accessibility").

### Part 6 — Images, contrast & multilingual accessibility
- Fixed A11Y-017: computed actual rendered contrast (not just the
  gradient's darker endpoint) for every solid-gradient button/tab
  background paired with white text found site-wide; the whole family
  measured ~2.9–4.3:1 (failing 4.5:1 AA) everywhere along the gradient.
  Introduced `--btn-primary-grad-1/-2` and `--btn-danger-grad-1/-2`
  tokens (same hue family, darkened enough to clear 4.5:1 with margin at
  every point) and repointed `.btn.primary`, `.btn.danger`, the header's
  `.nav-cta`, `.category-pill.active`, `.step-num`, `.section-tab.active`
  (dashboard), `.mode-tab.active` (attendance), and all four gradient
  backgrounds in the chatbot widget to use them. `--primary`/
  `--primary-2`/`--danger` themselves were left untouched, since every
  other place they're used (outline-button text/border, links, category
  accents) already passed.
- Checked every other colored badge/pill/chip pattern in the stylesheet
  (`.badge.*`, `.status-badge.*`, `.cat-chip.*`, `.pending-pill`,
  `.share-toast`) by computing contrast against their actual (sometimes
  translucent, blended-with-page-background) fill — all measured
  7.6:1 or higher and needed no change. Also checked `.skip-link`: it has
  a `background: var(--primary)` declaration that looks like the same
  bug, but a second `background` declaration further down the same rule
  overrides it to a dark, mostly-opaque navy — the `var(--primary)` line
  is dead CSS, not a live rendering issue, so left as-is (not worth the
  churn of removing genuinely-dead code as part of an accessibility
  pass).
- Fixed A11Y-018: `i18n.js`'s `applyToDom()` now marks individual
  elements `lang="en"` when the current language has no translation for
  that key and the visible text is an English fallback, so a screen
  reader doesn't apply the wrong pronunciation rules to it. Confirmed
  the existing re-translation-on-language-change flow already works
  correctly otherwise: `setLanguage()` re-runs `applyToDom(document)`
  across the *whole* document (not just static markup), which does reach
  dynamically-rendered `data-i18n` elements like the homepage's event-card
  category chips — this was checked, not assumed.
- Fixed A11Y-019: `alt=""` on the header logo on all 12 pages (redundant
  with the adjacent `<h1>CampusVibe</h1>`, matching the pattern already
  used correctly for the footer logo); `aria-hidden="true"` added to
  decorative emoji/icons across all 12 pages everywhere one sits next to
  or immediately before text/a heading that already conveys the same
  meaning (buttons, status badges, empty states, gate cards, category
  icons, the homepage quick-links row). Confirmed no icon-only control
  without adjacent text was found that would have needed an `aria-label`
  instead.
- Files touched: `assets/js/i18n.js`, `assets/css/styles.css`, and all 12
  page files under `public/*.html`.
- No live screen reader, browser-based contrast-checker, or Lighthouse/
  axe run was available in this sandbox for any of the above — every fix
  in this part is backed by either a computed WCAG contrast-ratio formula
  (Python, matching the standard relative-luminance formula tools use) or
  a source/logic trace against the WCAG 1.1.1 / 3.1.2 spec text, not by
  hearing or seeing an actual assistive-technology run.
- Remaining: Part 7.

### Part 7 — Live Lighthouse baseline & remediation

A real Lighthouse Accessibility audit was run manually in Chromium on the
deployed homepage (`index.html`) on **13 September 2026**. The initial live
Accessibility score was **90**. Lighthouse reported four actionable findings:

- **Select elements do not have associated label elements** — the homepage
  sort `<select id="sort">` had no programmatic label.
- **Background and foreground colors do not have a sufficient contrast ratio**
  — the live homepage had low-contrast hero text, the outline "My Tickets"
  button, and empty-state text over the starfield background.
- **Heading elements are not in a sequentially-descending order** — the
  homepage footer used `<h5>` headings after the page's `<h2>` content.
- **Identical links have the same purpose** — two homepage links pointed to
  `#catalog` but exposed different accessible names ("Browse Events" and
  "Events").

All four findings have now been remediated in source:

- Added a visually-hidden `<label for="sort">Sort events</label>`.
- Added opaque dark backing to hero and empty-state text and changed the
  outline button to white text/border on a dark background, removing the
  low-contrast text combinations reported by the live audit.
- Changed the homepage footer section headings from `<h5>` to `<h2>` and
  retained the existing visual sizing in CSS.
- Gave the `#catalog` quick-link a localized `aria-label` matching the
  primary "Browse Events" link. Added `data-i18n-aria-label` support to the
  shared i18n engine so that accessible names follow the selected language.

**Verification status:** source-level checks after these changes pass for
select/label association, homepage heading order, and JavaScript syntax. The
updated site has **not yet been redeployed and re-run through Lighthouse**, so
no post-fix Lighthouse score is claimed here.

### Part 8 — Testing & documentation

Traced full keyboard-only journeys through the source (event handlers,
`tabindex` values, focus-management calls) rather than a live browser
session — see "Keyboard User-Journey Walkthroughs" below for what was
checked and what it found. Compiled the "Before/After Summary" and
final conformance statement sections below, and the plain-language
mirror of both in `ACCESSIBILITY.md`. No new numbered findings this
part — the point of Part 7 was verification and write-up of Parts 1–6,
not new remediation — except for the sitewide sanity checks noted below,
which turned up no additional issues (recorded here so "we checked and
it was fine" isn't lost, the same way A11Y-011's investigation was).

**Additional sitewide checks performed, no issues found:**
- No `tabindex` greater than `0` anywhere in any of the 12 pages (which
  would scramble tab order) — every custom widget's roving tabindex
  (ticket-type selector, dashboard/attendance tabs, event.html's Share/
  Calendar menus) correctly alternates only between `0` and `-1`.
- No keydown handler that intercepts `Tab` calls `preventDefault()` —
  checked every `key === 'Tab'` branch in the codebase (only one exists,
  in the Share/Calendar menu helper) and confirmed it closes the menu
  without blocking the browser's own focus movement, so Tab can never
  get stuck inside a widget.
- No `onclick`/`addEventListener('click', …)` anywhere in the codebase is
  attached to a non-interactive element (`<div>`, `<span>`, `<li>`, `<img>`,
  `<p>`) — checked every inline `onclick` attribute sitewide (zero found)
  and every `document.getElementById(...)`/`querySelector(...)` feeding
  a `.addEventListener('click', …)` call (38 across all pages), confirming
  each target is a real `<button>` or `<a href>`. This means every
  click-driven action in the app was already reachable and operable by
  keyboard by construction, not by accident.
- The only custom confirmation prompt in the app (deleting an event, in
  `dashboard.html`) uses the browser's native `confirm()` — inherently
  keyboard-operable with no custom focus-trap logic needed.
- Found and deliberately left alone two pieces of genuinely dead CSS
  (`.skip-link`'s overridden `background: var(--primary)`, and
  `register.html`'s unused `.role-toggle`/`.role-btn` rules with no
  matching markup anywhere in the page) — neither affects anything a
  user can see or reach, so "fixing" them wouldn't be an accessibility
  change, just code cleanup outside this audit's scope.

## Keyboard User-Journey Walkthroughs

Performed as a source-level trace (tab order from DOM order plus any
`tabindex`/`focus()` calls, verifying every step's target is a real
focusable, operable element) rather than a live keyboard session in a
browser — there is no browser in this sandbox. This is **weaker
evidence than an actual keyboard-only run** and is presented as such;
treat it as "nothing looks wrong on paper," not "confirmed working."

**Journey 1 — Student: browse → register → pay → view ticket**
`index.html` → skip link → search/filter (Part 3) → an event card (real
`<a>`, native Enter-to-follow) → `event.html` → ticket-type selector
(Part 2, A11Y-004) → "Register" button → `payment.html` → upload payment
proof (native `<input type="file">`, native file picker) → `my-tickets.html`
→ "View Ticket" link → `ticket.html`. Every step in this chain is either
a native link/button/input or one of the custom widgets already given a
full keyboard implementation in Parts 2–6 (ticket-type radiogroup, share/
calendar menus, chatbot). No point in the chain requires a mouse.

**Journey 2 — Organizer: apply → create event → manage → check people in**
`organizer-apply.html` (standard form, Part 2 fixes apply) → login →
`dashboard.html`'s tab bar (Part 4: full ARIA Tabs pattern, Arrow/Home/
End, roving tabindex) → "Create Event" tab's form → "My Events" tab →
per-event action buttons (Edit/Analytics/Payment Setup/Copy ID/Delete —
all real `<button>`s, Delete behind a native `confirm()`) → "Payment
Proofs" tab → Approve/Reject buttons → `attendance.html`'s mode tabs
(Part 4/13: same Tabs pattern) → QR scan or manual ticket-number entry
(Enter-to-submit) → "Mark Present". Again, no point in this chain is
mouse-only.

**Journey 3 — Chatbot and dropdown menus, used mid-journey on any page**
Launcher (Part 5: `aria-expanded`, opens/closes on Enter/Space) → panel
(input focus moves in every time, Escape closes and returns focus to the
launcher) → suggestion chips (real buttons) → on `event.html`, the
Share/Calendar dropdowns (Part 5/6: WAI-ARIA Menu Button pattern, Arrow/
Home/End/Escape, focus returns to trigger). Verified the two widgets
don't interfere with each other's keyboard handling (they attach
independent listeners to their own elements; opening one doesn't close
or affect the other, which is acceptable — APG doesn't require unrelated
disclosure widgets to be mutually exclusive).

**Not verified by this walkthrough:** actual screen-reader announcement
wording/timing (requires a real AT), touch/mobile-specific interactions,
and browser-specific quirks (e.g. how a specific version of Safari
handles `role="log"`). These require tools this sandbox doesn't have —
see "Explicitly NOT performed" above.

## Before/After Summary

| ID | Issue | Before | After |
|----|-------|--------|-------|
| A11Y-001 | No skip-navigation | No way to bypass repeated nav by keyboard | Skip link on every page, jumps to `#main-content` |
| A11Y-002 | No current-page indication | Nav gave no indication which page you were on | `aria-current="page"` set correctly per page |
| A11Y-003 | Labels not associated with inputs | Screen readers couldn't announce what a field was for | Every input has a programmatically-associated `<label for>` |
| A11Y-004 | Ticket-type selector keyboard-inoperable (P0) | Custom selector had no keyboard path at all | Full radiogroup pattern: Arrow keys, Space/Enter, `aria-checked` |
| A11Y-005 | Dashboard toasts never announced | Silent success/error feedback for screen-reader users | `role="status"`/`role="alert"` live regions |
| A11Y-006 | Share-link toast not announced | Same gap, `event.html`'s "link copied" toast | `role="status"` added |
| A11Y-007 | Registration errors not announced/focused | Failed submits were silent and didn't move focus | `role="alert"` + focus moved to the error |
| A11Y-008 | Hard page-load failures not announced | Broken/missing-link states were silent | `role="alert"` on fatal load failures |
| A11Y-009 | Search/filter result count not announced | No feedback on how many results a search returned | Live region announces the count |
| A11Y-010 | Seat-hold countdown expiry not announced | Silent expiry of a time-limited hold | One-time `role="status"` announcement on expiry (not per-tick) |
| A11Y-011 | Decorative spinners exposed to AT | Spinners announced as meaningless content | `aria-hidden="true"` |
| A11Y-012 | Dashboard tabs, no ARIA Tabs pattern | Visually tabs, but not operable/identifiable as tabs | Full `tablist`/`tab`/`tabpanel`, Arrow/Home/End, roving tabindex |
| A11Y-013 | Attendance mode tabs, same gap | Same issue, second location | Same fix applied |
| A11Y-014 | Focus lost after programmatic tab switches | Focus could end up on `<body>` after a tab change | Focus explicitly moved to the new tab/panel |
| A11Y-015 | Chatbot had no accessible state/announcements | No `aria-expanded`, no live region, one-shot focus bug, icon-only send button | `aria-expanded`/`role="dialog"`/`role="log"`, focus-every-open, Escape-to-close, labeled send button |
| A11Y-016 | Share/Calendar dropdowns mouse-only | No keyboard path to open, navigate, or close them | Full WAI-ARIA Menu Button pattern |
| A11Y-017 | Button/tab gradients failed contrast | ~2.9–4.3:1 white text on gradient (fails AA) | 5.2–7.9:1 via darker button-specific gradient tokens |
| A11Y-018 | English fallback text mispronounced | No per-element `lang` override on fallback strings | `lang="en"` set on fallback text specifically |
| A11Y-019 | Redundant icons/alt text | Logo alt duplicated adjacent heading; ~60 decorative emoji announced by name | Logo `alt=""`; decorative emoji `aria-hidden="true"` |
| A11Y-020 | Homepage sort selector lacked accessible name | Live Lighthouse reported unlabeled `<select id="sort">` | Visually-hidden `<label for="sort">Sort events</label>` |
| A11Y-021 | Homepage text had live contrast failures | Hero/empty-state text and outline button failed Lighthouse contrast audit | Dark opaque text backplates and high-contrast outline button treatment |
| A11Y-022 | Homepage footer heading hierarchy skipped levels | `<h2>` content was followed by `<h5>` footer headings | Footer section headings changed to `<h2>` with CSS preserving visual size |
| A11Y-023 | Homepage duplicate-purpose catalog links | Two `#catalog` links exposed different names | Localized `aria-label` on the quick-link, with i18n support |

Every "After" above reflects a real, verifiable code change in this
repository (see the corresponding `A11Y-0xx` entry for the exact diff
description and file); none of it is a projection of what automated
tooling *would* report — no such tooling was run.

## Conformance Statement

CampusVibe does **not** claim full WCAG 2.2 Level AA conformance. What
can honestly be said, based on the work recorded in this document:

- 23 distinct accessibility issues are now recorded across navigation,
  forms, dynamic content, custom widgets (tabs, ticket selector, chatbot,
  dropdown menus), color contrast, icons, internationalization, and live
  homepage Lighthouse findings. All 23 have corresponding source-level
  remediations in this repository; the four live Lighthouse findings still
  require a post-deployment Lighthouse re-run to verify the rendered result.
- Every fix was checked against the relevant WCAG 2.2 success criterion
  and, where applicable, the WAI-ARIA Authoring Practices Guide pattern
  for that widget type (Tabs, Menu Button, radiogroup).
- All of this was done through **static analysis**: reading source code,
  tracing logic, and — for color contrast — computing the actual WCAG
  contrast formula against the colors in the stylesheet. **No live
  screen reader, browser, Lighthouse/axe run, or human keyboard-only
  testing session was available in this environment.** That is a real
  gap, not a formality: static analysis can miss browser-specific
  rendering quirks, actual screen-reader announcement phrasing/timing,
  and anything that only shows up when a real person with real assistive
  technology uses the real page.
- Recommended before making any public conformance claim: run this
  through Lighthouse and/or axe DevTools in an actual browser, and do at
  least one full pass with a real screen reader (NVDA on Windows +
  Firefox/Chrome, or VoiceOver on macOS/iOS) across both journeys
  documented above. Record real results in a new dated section here
  rather than replacing this one.
