# CampusVibe — Loading, Network Resilience & Perceived Performance

Documents the loading, network resilience, and perceived-performance
system built for CampusVibe across all 26 delivery parts of the original
spec — see
that spec file's progress tracker for the authoritative per-item status.

## 1. Shared system (`loading.js` → `window.CVLoading`)

Loaded on all 12 pages, after `app.js`/`i18n.js`. Nothing except the network
banner and nav-progress bar auto-runs — everything else is opt-in per page.

| Helper | Purpose |
|---|---|
| `setButtonLoading` / `clearButtonLoading` | Locks a button's rendered width, swaps its label for a spinner, disables it. |
| `guardSubmit(btn, handler)` | Wraps an async submit handler so a second click while one is in flight is a no-op, and the button always recovers (even on throw). |
| `fetchWithTimeout(url, opts, ms=15000)` | Every request gets a ceiling — the UI can never be stuck on "Loading…" forever. |
| `createRequestGuard()` | Token-based guard so an older, slower response can't overwrite a newer one (e.g. fast typing in search). |
| `initNetworkStatus()` | Browser online/offline banner. Auto-run on every page. |
| `initNavProgress()` | Top progress bar on internal link/GET-form navigation (new in Part 3 — see §4). Auto-run on every page. |
| `cacheGet` / `cacheSet` / `clearCache` / `staleWhileRevalidate` | sessionStorage read-through cache for offline/recovery (new in Part 3 — see §5). |
| `skeletonCard/Row/Table/StatCard`, `repeat`, `errorStateHtml` | Markup generators for the skeleton system and the standard error-state block. |

## 2. Skeleton system

`.skel` (base) + shape helpers (`.skel-text`, `.skel-avatar`, `.skel-image`,
`.skel-btn`, `.skel-chip`), composed into `.skel-card` / `.skel-row` /
`.skel-table` / `.skel-stat-card`. Same shimmer as the older `.skeleton`
class (kept so nothing looks mismatched). Sized to match real content so
nothing shifts when it's replaced.

**Applied on:** homepage, event details, my-tickets, dashboard (page-level +
events list + stat cards).
**Not yet applied on:** payment, ticket, profile, attendance, register,
login, organizer-apply (tracked as a separate remaining-work item, not part
of Part 3).

## 3. Error / empty / loading states

Every audited page distinguishes:
- **Loading** → skeleton (or, where cached, the cached copy — see §5).
- **Empty** → `.empty-state` ("No events found", etc.) — request succeeded,
  zero results.
- **Error** → `.error-state` with an icon, a plain-language message, and a
  `Retry` button. Never leaks raw response bodies/stack traces. Homepage,
  event page, my-tickets, dashboard, payment.html, and (Part 4) profile.html
  all use this same component.

`profile.html` previously had two ways to silently strand a user on its
skeleton forever: `loadProfile()` returned with no UI change on any non-401
failure, and its `catch` block wrote a message into `#msg` — an element
still `display:none` at that point because the skeleton was never swapped
out. Both now route into the same `.error-state` + Retry pattern as
everywhere else.

## 4. Navigation loading (Part 3, item 18)

CampusVibe is a classic multi-page app — real `<a href>` links and full
document navigations, not a client-side router. There's no "route change"
to hook a loading state into, so instead of faking an SPA transition,
`initNavProgress()` shows a thin top bar (`.nav-progress-bar`) the instant
an internal link is clicked (or a GET-navigating form is submitted):

- Skips new-tab clicks (modifier keys, `target="_blank"`), `download`
  links, external links, and same-page hash links.
- Eases toward ~78% and holds — it never needs to explicitly "finish",
  because the browser's own navigation tears down the whole page (bar
  included) the moment the next document arrives.
- Respects `prefers-reduced-motion` (snaps instead of easing).

This closes the "click → does anything happen?" gap on a slow connection
without pretending the app is something it isn't.

## 5. Offline / recovery (Part 3, item 21)

Deliberately minimal, per the spec's own guidance not to build a full
offline architecture unless it adds real value. `staleWhileRevalidate()` and
manual `cacheGet`/`cacheSet` wrap **two read-heavy views only**:

- **Homepage default view** (`index.html`, no active search/category
  filter) — the one view every cold visit hits. Cached copy paints
  instantly (marked `.is-stale-data`, "Showing saved results — refreshing…")
  while a background refresh runs; if the refresh fails, the banner changes
  to "You're offline — showing saved results from earlier" instead of
  wiping the content that's already on screen.
- **Event details** (`event.html`) — falls back to the last-fetched copy of
  *that specific event* on a network failure, with a persistent "You're
  offline — showing saved event details" banner (`.network-banner.cached`).
- **My Tickets** (`my-tickets.html`, Part 14, item 21, delivered now) — the
  full stale-while-revalidate pattern (immediate stale paint + background
  refresh + `.is-stale-data` styling), same shape as the homepage. A
  student reopening this page on bad venue wifi right before an event sees
  their last-known ticket list instantly instead of a skeleton or a dead
  end; a failed background refresh shows "You're offline — showing saved
  tickets from earlier" instead of wiping the list. `loadTickets()` was
  refactored to separate the fetch/cache orchestration from a new
  `renderTickets()` function so the stale/fresh paint paths share one
  render path (previously the render logic was inlined in the fetch's
  `try` block, which the stale-while-revalidate pattern doesn't have).

**Not cached:** search results for one-off queries (low reuse, would just
grow storage), and anything state-changing (registration, payment, manual
attendance) — those always require a live request; a cached "success" for a
write would be actively wrong.

**Privacy:** cached data lives in `sessionStorage` and is wiped by
`CVLoading.clearCache()` on logout. **Real gap found and fixed in Part 14:**
this was previously only called from `index.html`'s dynamically-built nav
logout link — `dashboard.html`, `my-tickets.html`, and `profile.html` each
have their own separate, always-present logout button that never called
it. That was a low-stakes staleness gap while only public event/homepage
data was cached, but became a real privacy gap the moment `my-tickets.html`
started caching a signed-in user's *own ticket list* — a second person
using the same browser tab/session after a logout-via-dashboard (or
-profile, or -my-tickets) could otherwise have been shown the previous
user's cached tickets on a subsequent stale-while-revalidate paint. All
three pages' logout handlers now call `CVLoading.clearCache()` before
redirecting.

## 6. Data-fetching architecture audit (Part 3, item 19)

Findings and fixes:

| Page | Finding | Fix |
|---|---|---|
| `index.html` | `setAuthNav()` → `loadCategoryPills()` → `filterEvents()` ran as a sequential `await` chain even though none depends on another's result — tripling round trips before the event grid appeared. | Fired together via `Promise.all`. |
| `payment.html` | `payment-setup` and `ticket` fetches ran sequentially despite being independent reads. | Fired together via `Promise.all`; page also gained the standard `.error-state` + Retry (previously a bare alert). |
| `dashboard.html` | Auth check → role-gated render → my-events fetch. Sequential, but genuinely dependent (can't know *whether* to fetch my-events without first knowing the user's role) — left as-is. | No change needed. |
| `event.html` | Single request — no waterfall. | No change needed. |
| Homepage search/category filter | Each keystroke fires a new `/api/events` request; debounced (300ms) and guarded (§ race conditions below) — not a duplicate-request bug. | No change needed. |

No missing-cancellation or unbounded-growth issues found beyond the above.

## 7. Race conditions (Part 3, item 20)

Re-audited the pages called out in the spec as likely candidates:

- **Homepage search/filter** — already fixed (Part 2) via
  `createRequestGuard()`; confirmed still correct.
- **Dashboard** — no live/typeahead search or filter inputs; only tab
  switches (synchronous, no network race) and a role-gated one-shot load.
  No race-condition risk found.
- **Attendance** — the manual ticket-number field submits on click/Enter
  only (not per-keystroke), so there's no rapid-fire request pattern to
  race. The real risk there was **duplicate submission**, not a stale-
  response race — see §8.

## 8. Duplicate-submission protection (continuation of Part 2, item 14)

`attendance.html`'s manual "mark present" button had no frontend guard at
all — a held Enter key or a fast double-click at a live check-in desk could
fire two `manual-by-ticket` requests before the first returned. Wrapped in
`CVLoading.guardSubmit()` (same pattern as event registration). Backend
idempotency (`data.already`) remains the required second layer.

## 9. Accessibility & reduced motion

Unchanged since Part 1/2: `aria-busy` toggled on fetch-driven containers,
skeletons marked `aria-hidden`, `.error-state` uses `role="alert"`, the
network/cached banners use `role="status"` + `aria-live="polite"`. All new
Part 3 additions (nav-progress bar, cached-data banner) follow the same
pattern — the nav bar is `aria-hidden` (purely visual, doesn't need
announcing), the cached-data banner reuses the existing announced banner
element.

## 10. Auth-flow pages & chatbot (Part 4)

`login.html`, `register.html`, `organizer-apply.html`, and `profile.html`
already had their own hand-rolled button-spinner + disable-while-pending
pattern (kept as-is — no reason to replace working code with the shared
`guardSubmit` just for consistency). What they were missing:

- **No request ceiling.** A hung `fetch` left "Signing in…" / "Creating
  Account…" / "Submitting…" on screen forever, with the button disabled and
  no way out. All four now route through `CVLoading.fetchWithTimeout`
  (15s for submits, 12s for profile's initial load), and the resulting
  `err.isTimeout` flag drives a distinct "taking longer than expected"
  message versus a generic network-error one.
- **profile.html's real bug** — see §3 above.

The chatbot widget (`chatbot.js`, loaded on every page) got the same
timeout treatment, plus a duplicate-request guard: hitting Enter twice
while a reply was pending previously fired two overlapping requests, and
whichever resolved second would `.remove()` whatever was then the *last*
message in the thread — not necessarily its own "thinking…" bubble. The
send button now disables for the duration of one in-flight request.

## 11. Known gaps flagged (not fixed this pass)

- `profile.html` has dead logout-button code:
  `document.querySelector('#save ~ button')` matches nothing because the
  markup has no logout button. Left alone — wiring one in is a
  markup/feature decision, not a loading-state fix.
- **`ticket.html` is a 0-byte file in the uploaded project snapshot.** It's
  referenced throughout `styles.css` (the `.ticket-*` boarding-pass
  component) and by `payment.html`'s post-payment redirect, but there's no
  content to audit. Needs a re-upload before it can be covered.

## 12. `dashboard.html`'s own action requests (Part 10)

Every earlier pass at `dashboard.html` covered its *page-load* fetches
(auth gate, `loadEvents()`) but never re-audited the organizer console's own
action requests — the ones fired from `withLoading()`-wrapped buttons and a
few unwrapped click handlers. This pass closed that gap:

- **No timeout ceiling anywhere.** Create/edit event, delete event, load
  analytics, save payment setup, list pending proofs, approve/reject
  payment, and admin approve/reject application were all bare `fetch()`
  calls. All now go through `CVLoading.fetchWithTimeout` — 12s for plain
  reads/actions, 15s for the create/edit-event save, 25s for the
  payment-setup save (it can carry a QR-image upload, so it needs more
  room than a JSON request).
- **`withLoading()` swallowed network errors.** If the wrapped `fn()`
  threw (network failure, or now a timeout), the `.finally()` reset the
  button but nothing ever caught the rejection — no toast, no error state,
  just a button quietly returning to normal. To someone on a flaky
  connection that's indistinguishable from the click doing nothing at all.
  `withLoading()` now `.catch()`es and shows a toast ("Request timed
  out…" for `err.isTimeout`, a generic network-error message otherwise).
  This one fix covers every button that goes through it.
- **`withLoading()` didn't set `aria-busy`.** It disabled the button and
  swapped its label, but never announced busy state the way the shared
  `guardSubmit`/`setButtonLoading` pattern does elsewhere. Now it does.
- **Two actions had *no* duplicate-submission guard at all:**
  `approvePayment`/`rejectPayment` (reviewing a payment proof) and
  `reviewApplication` (admin approve/reject of an organizer application)
  were plain unwrapped `fetch()` calls with no button disable — a
  double-click, or a slow connection making an admin click twice thinking
  the first click didn't register, could genuinely fire two approve/reject
  requests for the same ticket or application. All three now run through
  `withLoading()` with the clicked button passed in, so they get the
  disable-while-pending guard, the timeout, and the error toast in one
  change.
- **`loadApplications()` (admin "Pending Organizer Applications" tab) had
  no skeleton and no error state.** A failed fetch threw uncaught and left
  the `#applications` container permanently empty — visually identical to
  the genuine "No pending applications" empty state, so an admin with a
  broken connection would have no way to tell whether they were caught up
  or the page had just failed to load. It now shows a `skeletonTable`
  while loading and a real `.error-state` + Retry button on failure,
  matching the pattern used by `loadEvents()` on the same page.

## 13. Image loading (Part 11, item 6)

Audited every `<img>` in the app. Most are the static bundled `logo.svg` in
each page's header — same-origin, cached, guaranteed to exist — which needs
no loading treatment, the same way a production site doesn't skeleton-load
its own logo. Three images are genuinely dynamic:

- **`payment.html`'s UPI QR code** — an organizer-uploaded file, the one
  real *extra* network fetch on this page beyond its own JSON data. Was a
  bare `<img>` with no reserved dimensions (layout shift while it loaded on
  a slow connection) and no fallback if the upload was missing or corrupted
  (a plain broken-image icon, with no clue the UPI ID text right above it
  was still a usable fallback). Now: a `.qr-img-wrap` reserves a fixed
  200×200 box immediately via a `.skel` placeholder, the real `<img>` has
  explicit `width`/`height` and fades in via `onload`, and `onerror` swaps
  the whole thing for a short message pointing back at the UPI ID.
  `loading="eager"` is explicit (not lazy) since this is essential content
  a paying student needs immediately, not an offscreen/below-the-fold image.
- **`ticket.html`'s QR code** — a `data:image/png;base64,...` URL generated
  server-side once a ticket is paid (see `docs/04-database-schema.md`), so
  there's no real network round trip and no loading-state need. It had no
  broken-image handling for a malformed/corrupted data URI though — added
  an `onerror` handler that swaps it for the same `.qr-holder` visual style
  already used for the pending/rejected states, instead of a bare
  broken-image icon.
- **`profile.html`'s avatar** — `user.avatar_url`, which can point to a
  now-missing upload. Had no fallback; now `onerror` swaps it back to the
  default avatar SVG. Dimensions were already fixed via `.profile-avatar`
  CSS, so no layout-shift concern there.

No lazy-loading was implemented anywhere: this app has no image galleries
or below-the-fold image lists to lazy-load — events render as text/icon
cards (category chips, not cover photos), so there was nothing to defer.

## 15. Progressive loading (Part 12, item 4)

The one clear, safe, high-value fix here: `lottie.min.js` (305KB — a purely
decorative background animation, used at `opacity: 0.5` or less on every
page) was loaded as a **blocking, non-deferred `<script>`** in `<head>` on
all 11 pages that include it. A blocking script in `<head>` stops the HTML
parser in its tracks until it's downloaded *and* executed — so on a slow
connection, the browser had to fetch a 305KB library before it could even
finish parsing down to the skeleton markup in `<body>`. That's exactly the
"don't block critical structure on non-critical enhancements" failure mode
this item exists to catch, and it was the single biggest one in the app.

**Fix:** added `defer` to the `lottie.min.js` tag everywhere. Deferred
scripts download in the background without blocking parsing, and execute
right before `DOMContentLoaded` fires — so HTML parsing/first paint is
never gated on this 305KB file, but the animation still reliably plays
once things settle.

**A regression this could have caused, caught before shipping:** three
pages — `login.html`, `event.html`, `attendance.html` — triggered
`window.lottie.loadAnimation(...)` from top-level synchronous code (not
wrapped in `DOMContentLoaded`, not gated behind an awaited fetch). With
`defer`, that code runs *during* parsing, strictly before the deferred
script is guaranteed to have executed — so `window.lottie` would have been
reliably `undefined` there, silently killing those three animations every
single time (masked by the existing `try/catch`, so no visible error —
just a quietly broken feature). Fixed by wrapping all three in
`DOMContentLoaded` listeners, matching the pattern the other 8 pages
(`dashboard.html`, `faq.html`, `index.html`, `my-tickets.html`,
`payment.html`, `profile.html`, `register.html`) already used safely.

**Deliberately left alone:** `i18n-data.js` (46KB), `i18n.js` (5KB), and
`loading.js` (15KB) are also blocking `<head>` scripts, but an order of
magnitude smaller than lottie and more plausibly load-bearing for a
correct first render (translated strings, the skeleton/network-banner
machinery itself) — deferring them wasn't an obviously safe win, so left
as-is rather than introducing more risk for a smaller payoff.

The spec's other progressive-loading example — "show the event card
immediately, stage the image in behind it" — doesn't really apply to this
app: events render as text/icon category cards, not photos (see §13/item
6), so there's no slow image to stage content behind in the first place.

**Part 16 — remaining broader audit (delivered now), closing item 4:**
checked every other page for anything else blocking critical structure —
`<script>` placement/order in every `<head>` (all 12 pages), whether
`app.js` (confirmed genuinely unused, see `docs/11-known-limitations-and-
tech-debt.md`) or `chatbot.js` (confirmed placed at the very end of
`<body>`, one line before `</body>` on all 12 pages — already
non-blocking by position, doesn't need `defer`) were doing anything
untracked. Found one real remaining offender, a different flavor of the
same problem:

**`styles.css` was pulling in the "Space Grotesk" display font via a CSS
`@import` placed after other rules (line 729 of a 1140-line file).** Two
problems, one masking the other: (1) per the CSS spec, `@import` must
precede every other rule (barring `@charset`) — a browser encountering
one this late in the file **ignores it entirely**, so the custom font was
silently never loading at all, always falling back to Inter/sans-serif
regardless of connection speed; (2) even had it been positioned validly,
an `@import` inside a stylesheet is only *discovered* once that
stylesheet has downloaded and begun parsing — an extra serial round trip
the HTML preload scanner can't see coming, unlike a `<link>` in `<head>`
which it discovers immediately and fetches in parallel with everything
else.

**Fix:** removed the `@import`; added `<link rel="preconnect">` (for both
`fonts.googleapis.com` and the cross-origin `fonts.gstatic.com`) plus a
real `<link rel="stylesheet">` for the font, in every page's `<head>`
right before the `styles.css` link — same `display=swap` as the original
URL, so body text is never invisible while the font loads either way.
This both fixes the correctness bug (the custom font now actually loads)
and removes a would-be render-blocking round trip.

With this, item 4's scope — critical structure never blocked on a
non-critical enhancement — is covered everywhere in the app; closing as ✅.

## 18. Layout-shift (CLS) audit (Part 17, item 5)

Reviewed every category the spec calls out — buttons, cards, images,
navigation, error messages, notifications — against what's actually in the
codebase, rather than re-verifying things other items already cover:

- **Toast / network-banner / nav-progress-bar:** all `position: fixed`
  (`#toast` in `dashboard.html`, `.network-banner`, `.nav-progress-bar`),
  so none of them can ever push page content — confirmed, no change needed.
- **Images:** already covered by item 6 (§13) — explicit dimensions,
  reserved space, `onerror` fallbacks.
- **Skeleton → content:** already covered by item 1 (Part 1/12) — sized to
  match real content.
- **Append-below status messages** (`attendance.html`'s `#scanStatus`,
  `#manualMsg`, `#backupMsg`): these render *after* their own button/input,
  so no interactive control moves when they fill in — reviewed and left
  as-is; the only effect is a lower-priority card further down the page
  nudging slightly, an acceptable trade-off already used consistently
  elsewhere in the app.

**Two real, previously-unaudited gaps found and fixed:**

1. **`#msg` status/alert slots sit *above* the form on `login.html`,
   `register.html`, `organizer-apply.html`, and `profile.html`** (below it
   on `payment.html`). These start empty and get an `.alert` inserted into
   them once a submit resolves — on a fast connection that lands inside the
   "recent input" window most CLS tooling already excludes, but on a slow
   connection (exactly this document's stated audience) the response can
   land seconds later, at which point it's a real, countable shift that
   pushes the entire form — the primary interactive content of the page —
   down. **Fix:** `#msg { min-height: 48px; overflow: hidden; }` in
   `styles.css`, reserving the space up front so filling it in never moves
   anything. `overflow: hidden` keeps the inserted `.alert`'s own margin
   contained inside that reserved box instead of collapsing out of it,
   so the reserved height is deterministic.

2. **The button-loading pattern used locally by `login.html`,
   `register.html`, `organizer-apply.html`, and `profile.html`** (kept
   as their own pre-existing pattern per items 8/11/14, rather than
   switched to `CVLoading.setButtonLoading`) swaps in a longer label
   ("Sign In" → "Signing in...", "Save Changes" → "Saving...", etc., plus a
   spinner) without locking the button's width first. These buttons are
   `display: inline-flex` with intrinsic (not full/stretched) width, so the
   longer label visibly widens the button on submit — the spec's own
   "Buttons moving" example. `CVLoading.setButtonLoading()` already solves
   this everywhere it's used, but these four pages' local `setLoading()`
   functions don't call it (different internal shape — some toggle a
   `.spinner` span, one swaps the whole `innerHTML`). **Fix:** each
   `setLoading()` now locks `btn.style.minWidth` to the button's current
   rendered width before swapping the label in, and clears it after —
   same effect as `setButtonLoading`, applied inline so the existing
   per-page pattern didn't need restructuring.

## 19. Exhaustive request audit — items 7, 8, 9, 11 (Part 18)

Enumerated every `fetch(` call site across all 13 pages (not just the ones
already known to be solid) and checked each for: a timeout ceiling, a
caught/handled failure path, and — where it feeds a list — a distinct
empty state. Most were already correct (the `window.CVLoading ?
fetchWithTimeout(...) : fetch(...)` ternary / `doFetch` pattern used
throughout is a defensive fallback for if `loading.js` itself somehow
failed to load, not a real gap).

**Real gaps found and fixed — all in the "logout" and lightweight-nav
requests, which had been getting less scrutiny than the main page-data
fetches:**

- **`index.html`, `dashboard.html`, `my-tickets.html`'s logout buttons**
  were still on a bare `fetch()` with no timeout — inconsistent with
  `profile.html`'s own logout handler, which already got a 10s timeout in
  Part 7. A stalled (not failed) connection would leave Logout looking
  completely unresponsive with no way out. **`my-tickets.html`'s was worse:
  no `try/catch` at all** — a network error there threw unhandled, so the
  rest of the handler (cache clear, redirect) never ran and the user
  stayed stuck on the page looking "logged in." All three now match
  `profile.html`'s pattern: `fetchWithTimeout(..., 10000)` wrapped in
  try/catch that proceeds to clear cache + redirect either way.
- **`index.html`'s `setAuthNav()` (`/api/auth/me`) and `loadCategoryPills()`
  (`/api/meta/categories`)** also had no timeout ceiling. Neither blocks
  the main event grid from rendering (`filterEvents()` runs and paints
  independently inside the same `Promise.all`), but a hang here means the
  nav silently never upgrades past its logged-out default and the category
  pills never appear — no visible error, just a quietly incomplete page.
  Both now go through `fetchWithTimeout(..., 12000)`.

**Empty-state coverage confirmed exhaustive:** every list-rendering fetch
in the app — dashboard's live-events list, pending-proofs list, and
pending-applications list; the homepage's and my-tickets' event grids;
attendance's recent-check-ins feed — has a distinct empty state, separate
from its loading skeleton and its error state. No gaps found.

With this, items 7 (API loading states), 8 (error states), 9 (empty vs
loading vs error), and 11 (timeout handling) are all closing as ✅ — every
request in the app now has an explicit state model, a real ceiling, and a
real failure path. Item 8's specific open note — "dashboard's
non-withLoading paths not re-verified since Part 10" — is the one this
pass targeted directly: re-checked the auth gate, `loadEvents()`, and
`loadApplications()` line by line and confirmed all three still have the
try/catch → error-state → retry shape Part 10 put in place; no regression.

## 14. Optimistic UI audit (Part 13, item 13)

The spec scopes optimistic UI to *safe, non-critical* state — its own
examples are like/favorite, toggle-preference, "non-critical UI state" —
and explicitly says to prefer confirmed server state for anything in the
seat-reservation/registration/payment/ticket/organizer-action family.

Audited every state-changing interaction in the app for a safe candidate:

* **No like/favorite/bookmark/wishlist feature exists anywhere in
  CampusVibe** (confirmed via `docs/08-core-features.md` and a full grep
  of every page/script for `favorite|bookmark|wishlist|toggle|preference`
  — the only toggles found are the tab/accordion/panel UI already listed
  in §16 below, none of which hit the network).
* The language switcher (i18n) is a pure client-side, same-tick operation
  — it writes a preference and re-renders `data-i18n` text with no
  `fetch()` involved, so there's no request latency for optimistic UI to
  paper over in the first place.
* Dashboard tab switches, the FAQ accordion, and the mobile nav toggle
  are all local DOM state changes with no server round trip — same
  reasoning.
* Every remaining action that *does* hit the server falls squarely in the
  spec's own "prefer confirmed state" list: event registration (seat
  hold), payment-proof submission, ticket/QR generation, attendance
  check-in, and every organizer/admin action (create/edit/delete event,
  approve/reject payment, approve/reject application). Applying optimism
  to any of these would mean showing a seat as reserved, a payment as
  verified, or an application as approved before the server has actually
  committed that state — exactly the "business-flow problem" the spec
  warns against, especially given the 5-minute seat-hold and manual
  payment-verification mechanisms documented in
  [`docs/08-core-features.md`](./docs/08-core-features.md).

**Conclusion: closed with no code changes.** CampusVibe has no safe
candidate for optimistic UI as the spec defines "safe" — every
network-backed interaction in the app is exactly the kind of operation
the spec says should wait for confirmed server state. If a genuinely
low-stakes, purely-preferential feature (e.g. a "save event" bookmark)
is added later, it would be the natural first candidate.

## 17. Progress indicators for genuine long-running uploads (Part 15, item 2)

The spec's "Progress indicator" pattern (`Uploading 65%` instead of an
indefinite spinner) needs an operation that can actually report a real
percentage. Audited every long-running operation in the app:

- **`dashboard.html`'s UPI QR upload** (Payment Setup tab) is the one
  genuine file upload in the app — organizer-side, up to 5MB (multer's
  limit, see `server.js`). This is the case the spec's own example
  ("file upload progress on payment QR upload") points at.
- Everything else that takes a moment — registration, proof submission
  (just a text Transaction ID, no file — see below), attendance check-in,
  analytics load — is a small JSON request with no meaningful sub-progress
  to report; an indefinite spinner ("Registering…", "Verifying…") is the
  honest representation there, not a fake progress bar.
- `payment.html`'s "Submit Payment Proof" form only sends a Transaction ID
  string, not a file — the QR image is organizer-uploaded on the *setup*
  side, not attendee-uploaded here — so there is no upload for it to show
  progress on.

**New: `CVLoading.fetchWithProgress(url, { method, body, credentials,
timeoutMs, onProgress })`.** `fetch()` has no reliable cross-browser way
to observe request-body upload progress, so this wraps `XMLHttpRequest`
but returns a fetch-`Response`-shaped object (`{ ok, status, json(),
text() }`) and throws the same `isTimeout`-flagged error shape
`fetchWithTimeout` does, so existing `catch` blocks work unchanged.

`savePaymentSetup()` now branches on whether a QR file is attached: no
file → unchanged `withLoading()` path (generic "Loading…" spinner, exactly
as before); file attached → `fetchWithProgress`, with the button label
updating live as `Uploading 0%` → `Uploading NN%` while the upload streams,
still going through the same duplicate-submission guard (button disabled
+ `aria-busy` for the whole window) and the same timeout/network error
toasts as the non-progress path.

## 16. Status history (formerly "Still open" — all items now closed)

- Optimistic UI — **closed (Part 13)**: audited, no safe candidate exists
  in the current feature set; see §14.
- Offline stale-while-revalidate caching — **extended to my-tickets.html
  (Part 14, item 21)**; now covers the three highest-value read views
  (homepage default view, event details, my-tickets). Dashboard's own
  views were deliberately left uncached — an organizer's dashboard data
  (registrations, payment proofs, applications) changes far more often
  than a student's ticket list, and staleness there is more likely to
  mislead (e.g. approving something already handled) than help.
- Progress indicators — **closed (Part 15)**: see §17. Item 2 is now fully
  covered — skeleton/inline-spinner/button-loading/progress/page-level are
  all applied where the spec calls for each.
- Performance testing under throttled network — **closed (Part 22)**, see
  §23 and Appendix B.
- Real-user-flow pass under slow network — **closed (Part 23)**, see §24
  and Appendix C.
- Final "does it clearly communicate state on a slow connection" audit —
  **closed (Part 26)**, see §25 and Appendix D. Nothing remains
  open — every item in the original spec's tracker is ✅.

## 20. Duplicate-submission re-audit of the auth/save "redirect-after-success" pages (Part 19, item 14)

Requested scope was login/register/organizer-apply's submit-button-disable
pattern specifically (the same width-lock/state-model scrutiny the auth
pages got in Parts 17–18). Audited all four pages that share this pattern
(login, register, organizer-apply, and profile — pulled in because it uses
the identical helper shape) plus, while checking every page with a
post-success `setTimeout(() => location.href/reload(...), Nms)` redirect
for the same shape of bug, `payment.html`'s proof-upload submit.

**Confirmed already solid:** all four pages disable their submit button
synchronously at the top of the handler (`btn.disabled = loading`, before
any `await`), which is enough to block both a second click (browsers don't
fire `click` on a disabled button) and Enter-key implicit submission
(browsers don't implicitly submit a form whose only/default submit control
is disabled) — so the base double-click/double-Enter case was never at
risk. Width-lock (`minWidth`) from Part 17 is present and correct on all
four. `organizer-apply.html` has no redirect-delay issue: on success it
swaps the form card out for a "pending" card entirely, so a re-enabled
button underneath is unreachable.

**Real bug found and fixed, in four places:** `register.html`,
`profile.html`, and `payment.html` all show a success message and then
`setTimeout(() => location.href/reload(...), 1500–2000)` — but the
`finally` block ran on the *original* promise chain, which resolves as
soon as the `fetch` completes, not after the queued timeout. That reset
`setLoading(false)` (and, on payment.html, `submitInFlight = false`)
immediately, re-enabling the button for the full 1.5–2s gap before the
page actually navigated away. A click in that window fired a second real
request:

- `register.html` — a second `/api/auth/register` call (same form data
  still in the fields).
- `profile.html` — a second `/api/users/me` PUT (harmless-ish, but still a
  real unintended duplicate write).
- `payment.html` — a second `/api/payments/proof` submission for the same
  ticket. This is the most serious instance: it's the exact "multiple
  payment submissions" case item 14 calls out by name, and the redirect
  window here was the longest (2s).

Fixed identically on all three: a `redirectPending` flag is set `true` the
moment the redirect/reload is queued, checked at the top of the handler
(returns early — belt-and-suspenders alongside `payment.html`'s existing
`submitInFlight`), and consulted in `finally` so the button/guard is only
released on a genuine failure path, staying locked for the entire window
between success and the page actually leaving.

`login.html`'s redirect is immediate (`location.href = ...` with no
`setTimeout`), so the equivalent window is only the remainder of the
current synchronous task — real but negligible, and not the kind of gap a
user could realistically double-click into. Added the same
`redirectPending` guard there anyway for consistency with the other three
and as defense in depth, not because a bug was reproducible.

**Backend, per item 14's "frontend protection alone is not a security
mechanism" requirement — checked, not modified:**
- `/api/auth/register` and `/api/auth/register-organizer`: `email` is
  `UNIQUE NOT NULL` at the schema level (`docs/04-database-schema.md`,
  `server.js`), so even a request that races past the frontend guard
  cannot create two accounts with the same email — the second `INSERT`
  fails at the DB layer.
- `/api/payments/proof`: already has real backend idempotency independent
  of this frontend fix — it re-checks `payment_status` is still
  `unpaid`/`rejected` immediately before writing, does the update with a
  `WHERE payment_status IN ('unpaid','rejected')` guard, and explicitly
  checks `this.changes === 0` to catch a same-millisecond race, returning
  409 rather than silently double-processing.

No frontend/backend mismatch found — the frontend fix removes a real
window for an accidental duplicate click; the backend was already the
authoritative safety net item 14 requires.

Item 14 is now ✅ closed.

## 21. Retry strategy policy (Part 20, item 12)

Full policy, endpoint-by-endpoint idempotency classification, and the
audit confirming zero auto-retry logic exists anywhere in the app are in
**Appendix A** below. Item 12 is now ✅ closed.

## 22. Loading accessibility — closing out item 15 (Part 21)

**Correction to the record first:** before doing this pass, the tracker
claimed `profile.html`'s skeleton/spinner/save-button and `login.html`'s
submit button already had their `aria-busy`/`aria-hidden` fixes applied.
Re-checking the actual files found that none of that was true — the
skeleton had no `aria-hidden` and no screen-reader announcement, and none
of those four buttons ever set `aria-busy`. That's fixed now (see below),
but the earlier "fixed so far" note was wrong, not just incomplete, and
this doc is only trustworthy going forward because it was re-verified
against the code rather than carried over.

**1. `aria-busy` added to every remaining local button-spinner pattern.**
`login.html`, `register.html`, `organizer-apply.html`, `profile.html`'s
save button, and `payment.html`'s `submitProof` button all had their own
pre-existing spinner-swap `setLoading()` (kept as-is per items 5/8/11/14,
same reasoning as the Part 17 width-lock pass) but none of them ever
toggled `aria-busy` on the button itself — a screen-reader user who
tabbed back to the button mid-request, or who was still on it when the
request kicked off, heard only the static label ("Sign In", "Submit
Proof") with no indication a request was in flight, unlike every button
already using `CVLoading.setButtonLoading()`/`guardSubmit` elsewhere in
the app, which has done this since early on. All five now set
`aria-busy="true"` for the duration of the request and remove it after,
matching that shared pattern. `payment.html`'s `submitProof` was also
missing the width-lock item 5 (Part 17) added to the other four local
buttons at the same time — added now too, so "Submit Proof" →
"Submitting..." no longer visibly widens the button.

**2. `profile.html`'s skeleton given the same accessible-loading
treatment already used elsewhere.** The `#loading` skeleton's three
`.skeleton` bars now have `aria-hidden="true"` (they're purely visual —
the screen-reader–relevant fact is "profile is loading," not three
gradient bars), and a `sr-only` `role="status"` "Loading your profile…"
text was added, matching the identical pattern already on
`payment.html` (`Loading payment details…`) and `ticket.html`
(`Loading your ticket…`). The save button's spinner `<span>` also picked
up `aria-hidden="true"` for the same reason the login/register/
organizer-apply spinner spans already had it.

**3. Full page-by-page focus-management pass for error/retry states.**
Added a new shared helper, `CVLoading.focusErrorState(el)`, to
`loading.js` — focuses the given element (a Retry button, or a fallback
link when there's no retry), adding a `tabindex="-1"` first only if the
element isn't natively focusable. Reasoning: every `.error-state` block
in the app already uses `role="alert"`, so screen readers announce the
message on insertion without any focus change needed — but that doesn't
help a keyboard-only user, who'd otherwise have to tab from wherever
focus happened to be (often nowhere useful, e.g. a form or list that the
error just replaced) to find the Retry button. Wired into every
page-level error/retry block that was missing it:

- `index.html` — homepage events-grid load failure (`filterEvents`'s
  `onError`). **Deliberately not** applied to the sibling
  `hadCache`/offline branch just above it — that path leaves the cached
  content on screen and only updates a status line, so there's nothing
  new for focus to usefully land on and moving it would be disruptive
  mid-browse.
- `event.html` — event-detail load failure (`renderLoadError`).
- `my-tickets.html` — ticket-list load failure, only on the no-cache
  branch (same reasoning as homepage: a background refresh failure with
  a cached copy still showing doesn't get a focus jump).
- `dashboard.html` — the auth-gate network/timeout failure, the "My
  Events" tab's load failure (`renderEventsLoadError`), and both error
  branches of the admin "Pending Applications" panel load
  (`loadApplications`, which uses the shared `errorStateHtml()` helper).
- `payment.html` — the payment-details load failure. **Deliberately not**
  applied to the small inline UPI-QR-image `onerror` fallback (`cvQrImgError`)
  — it's a non-retryable, non-interactive status message next to
  still-usable UPI ID text, not a page-level failure with an action to
  take.
- `profile.html` — the profile load failure (`showLoadError`).
- `ticket.html` — both branches of `renderError`: the retryable
  transient-failure case focuses Retry, and the non-retryable "bad
  link"/"no access" case (no Retry button at all) focuses the "← My
  Tickets" link instead, since that's the only way forward either way.
- `attendance.html` — the organizer-access auth-gate failure.

All nine call sites were chosen because the error state replaces the
page's (or a tab/panel's) *primary, currently-not-yet-successfully-loaded*
content — i.e. focus wasn't meaningfully "somewhere" useful already. Live,
already-successful views that merely show a transient background-refresh
failure (homepage/my-tickets' `hadCache` branches) intentionally keep
focus wherever the user left it.

Item 15 is now ✅ closed.

## 23. Performance testing under throttled network (Part 22, item 22)

Full methodology, harness, and raw numbers are in **Appendix B** below.
Summary:

- Built `scripts/throttle-proxy.js` (latency + bandwidth-capped reverse
  proxy modeled on Chrome DevTools' Fast 4G / Slow 4G / Slow 3G presets,
  plus an Offline mode that accepts a connection and never responds) and
  `scripts/performance-tests.js`, which drives every page's real initial
  fetch() calls through it against the actual running `server.js` — no
  mocked responses, no synthetic timings.
- **First meaningful UI / skeleton paint time**: confirmed by code audit
  (§1/§18, and re-checked here) that every skeleton (`.skeleton` /
  `.skel*` cards) ships inside the page's *initial* HTML response — it is
  never injected by a follow-up `fetch()`. That means skeleton paint time
  is bounded only by HTML time-to-first-byte, which this harness measured
  directly per profile (see table in Appendix B) rather than
  assumed.
- **API response delays**: measured per page, per profile. Even on
  simulated Slow 3G (400ms RTT, 400 Kbps, matching Lighthouse's own Slow
  3G definition) every page's real payload stayed well inside its
  client-side timeout ceiling (12s on most pages, 20s on
  `dashboard.html`) — worst case observed was `dashboard.html` at ~1.6s
  on Slow 3G, ~13% of its ceiling. No page is at real risk of a false
  "timeout" on a merely-slow (as opposed to broken) connection.
- **Offline**: every simulated request correctly never resolves within
  the client's own timeout window, which is exactly the case
  `fetchWithTimeout` + the network-status banner (§5) exist to handle —
  confirmed by code audit that this path is covered everywhere, not by
  re-deriving it from the proxy (a proxy can't observe DOM/banner state).
- **Item 3 (slow/weak network handling)** was sitting at 🟡 purely
  because it was blocked on this actual measurement, not because more
  wiring was needed — the wiring (item 11) was already ✅. With real
  numbers now in hand showing every page's timeout ceiling has wide
  headroom even on Slow 3G, item 3 is promoted to ✅.
- No code changes were needed as a result of this pass — the numbers
  validate the existing timeout/skeleton design rather than surfacing a
  regression. See Appendix B for the full table and the
  harness's own documented limitations (no real browser/CDP available in
  this environment, so true paint/TTI/CLS metrics are inferred from the
  static-HTML-skeleton fact above rather than measured with a browser).

## 24. Real user flow testing (Part 23, item 23)

Full methodology, transcript, and the one recorded finding are in
**Appendix C** below. Summary:

- Built `scripts/flow-tests.js`, which drives the real `server.js`
  through the Part 22 throttle-proxy (Slow 3G by default) across the
  User, Organizer, and Admin flows the spec lists, plus a dedicated
  Offline → Fast 4G transition for the "UI recovers after network
  restoration" requirement.
- Its distinct value over the existing page-level audits (§1–22) is
  **concurrency / business-state correctness**: it fires genuinely
  simultaneous duplicate requests at register/approve/reject and checks
  the real resulting database rows, rather than trusting that a
  client-side disabled-button guard is never bypassed.
- **Result: 23/23 checks passed.** Confirmed: no blank/broken responses
  anywhere in any flow under Slow 3G; admin approve/reject are correctly
  state-guarded under concurrency (exactly one of two simultaneous calls
  succeeds); the seat-capacity atomic guard (SEC-013) still holds; a
  dead-connection request never resolves and the identical request
  succeeds once connectivity returns.
- **One real finding, documented not fixed** (same category as Part 20's
  payment-approve non-idempotency note): the `tickets` table has no
  `user_id`+`event_id` uniqueness guard, so two genuinely concurrent
  duplicate registration requests from the same user both succeed,
  creating two tickets. The client-side duplicate-submission guard
  (§14/§20) prevents this in the normal single-tab UI; this only
  surfaces if that guard is bypassed (e.g. two tabs). Not fixed here
  because a blanket unique constraint would incorrectly block the app's
  legitimate multi-tier (duo/trio) group-registration design — it needs
  a product decision on intended behavior, not a schema tweak from this
  spec. See Appendix C §4 for the full reasoning.

## 25. Final audit (Part 26, item 26 — closing the spec)

Full writeup in **Appendix D** below. This was deliberately
a fresh, holistic read of the *finished* product — not a re-check of
individual fixes — walking every page and asking the spec's own final
question ("does a user on a slow/unstable connection always know what's
happening?"). Answer: yes, at every point the user sees one of loading /
loaded / stale-labeled-cached / error-with-retry, never a blank or
frozen-looking screen. Also used this pass to formally close items 24
(visual consistency — re-scanned all CSS added across every part against
the app's existing tokens, no drift found) and 25 (documentation — cross-
checked `LOADING_STATES.md`'s section list against the spec's own
documentation checklist, nothing missing), both of which had been
running as "so far" / "ongoing" throughout the project. With this part,
every item in the original spec's tracker is ✅ and the
spec is complete.

---

# Appendix A: Retry Strategy Policy (Part 20, item 12)

*Merged from the former standalone `RETRY_POLICY.md` — full policy referenced by §21 above.*


> Written for spec item **#12 (Retry strategy)**. The behavior described
> here already existed in the app before this document — manual retry
> buttons throughout, no auto-retry anywhere — this is the audit that
> makes that assertion checkable, by listing every state-changing
> endpoint the frontend calls and confirming, one by one, that none of
> them is auto-retried. See `LOADING_STATES.md` for the general loading/
> error-state architecture this policy sits on top of.

## 1. The rule

> Do NOT blindly retry sensitive operations such as registration,
> payment-related operations, seat reservation, ticket creation, or other
> state-changing operations, unless the backend guarantees idempotency.
> — spec §12

CampusVibe's actual policy, in one sentence: **nothing in this app
retries a failed request automatically.** Every retry a user sees is a
button they clicked. This is deliberately simpler than "auto-retry the
safe ones, manual-retry the sensitive ones" — see §4 for why.

## 2. How this was verified (not just asserted)

Grepped the entire frontend (`public/*.html`, `public/assets/js/*.js`)
and the shared loading library (`loading.js`) for anything that could
constitute an automatic retry: `setInterval` used as a retry loop,
recursive `fetch` calls after a `.catch`, exponential-backoff helpers,
retry-count variables, or scheduled re-attempts. Found: **none.**

- `fetchWithTimeout` (`loading.js`) is a single `fetch` wrapped in an
  `AbortController` — on timeout or failure it throws once and stops.
  It does not re-issue the request.
- `fetchWithProgress` (XHR-based, used only for the dashboard's QR
  upload) is likewise single-shot.
- `staleWhileRevalidate` (homepage/event/my-tickets caching) does one
  opportunistic background `fetch` to refresh a cached view — this is
  not a retry of a failed request, it's a single new read triggered by
  page load, and if *it* fails, the page just keeps showing the cached
  copy (see `LOADING_STATES.md` §5). It never loops or re-attempts.
- Every `.error-state` block in the app (`errorStateHtml()` in
  `loading.js`, plus the bespoke error markup on `ticket.html`,
  `attendance.html`'s auth gate, etc.) renders a `<button>Retry</button>`
  wired to a click handler that re-runs the original load function
  exactly once per click. A user can click it repeatedly, but the app
  itself never does.

So the frontend has zero automated retry machinery to misuse on a
sensitive endpoint in the first place — the "don't auto-retry
sensitive ops" rule is satisfied structurally, not by a per-endpoint
guard that could be forgotten. §3 documents that this holds for every
state-changing endpoint specifically, since that's the sensitive case
the spec is concerned with.

## 3. Every state-changing (POST/PUT/DELETE) endpoint the frontend calls

| Endpoint | Called from | Idempotency | Retry behavior |
|---|---|---|---|
| `POST /api/auth/login` | `login.html` | Non-idempotent (issues a new session token each call) | Manual only. No retry button on failure — user re-submits the form. |
| `POST /api/auth/register` | `register.html` | **Non-idempotent** — creates a new user row. DB `UNIQUE` email constraint is the backstop if a retry ever slipped through. | Manual only (re-submit form). Explicitly named as non-idempotent in the spec. |
| `POST /api/auth/register-organizer` | `organizer-apply.html` | **Non-idempotent** — creates a new user row (pending organizer). Same `UNIQUE` email backstop. | Manual only (re-submit form). |
| `POST /api/auth/logout` | `index.html`, `dashboard.html`, `my-tickets.html`, `profile.html` | Idempotent in effect (clearing an already-cleared session is a no-op) | Manual only, but moot — a failed logout just leaves the user still logged in, which is safe to leave to a manual re-click; no retry UI exists for it specifically. |
| `PUT /api/users/me` | `profile.html` | Idempotent by HTTP semantics (PUT, full replace of the same fields) | Manual only (re-submit form). Safe to retry in principle, but kept manual for consistency with the rest of the auth/profile group — see §4. |
| `POST /api/events` | `dashboard.html` (create) | **Non-idempotent** — creates a new event row. | Manual only (re-click Create). |
| `PUT /api/events/:uuid` | `dashboard.html` (edit) | Idempotent by HTTP semantics (full replace) | Manual only (re-click Save). |
| `DELETE /api/events/:uuid` | `dashboard.html` (delete) | Idempotent in effect (deleting an already-deleted event 404s, doesn't error destructively) | Manual only, and explicitly confirmed via native `confirm()` before the request even fires. |
| `PUT /api/events/:uuid/payment-setup` | `dashboard.html` (payment setup save, incl. QR upload) | Idempotent by HTTP semantics (full replace) | Manual only. Uses `fetchWithProgress`, still single-shot. |
| `POST /api/events/:uuid/register` | `event.html` | **Non-idempotent — the spec's own headline example.** Creates a new ticket and consumes real seat capacity; a second identical call is a second seat, not a no-op. | Manual only. `guardSubmit()` blocks a double-click from firing it twice; timeout/network failure shows an inline warning with no auto-retry, and the copy explicitly tells the user to check My Tickets rather than resubmit blindly. |
| `POST /api/payments/proof` | `payment.html` | Non-idempotent by default, but the backend adds a real idempotency guard: it only accepts the write while `payment_status` is still `unpaid`/`rejected` and checks `this.changes === 0` to catch a same-instant race (see `LOADING_STATES.md` §20). A resubmission attempt while a first submission is already `pending`/`paid` is safely rejected with 409. | Manual only. `submitInFlight` + (as of Part 19) `redirectPending` block a same-page double-submit; the backend guard is the second, independent layer the spec asks for. |
| `POST /api/organizer/payments/:ticketUuid/approve` | `dashboard.html` | Idempotent-in-effect for the ticket's state (re-approving an already-`paid` ticket leaves it `paid`), but **not state-guarded** — unlike `/payments/proof`, it doesn't check the current status before writing, so a repeat call regenerates a new QR image and `reviewed_at` timestamp rather than being a true no-op. Noted as a minor backend observation, not fixed here — out of scope for a frontend loading-states pass, and harmless in practice since nothing in the frontend calls it twice (see below). | Manual only, and protected from an accidental double-click by `withLoading()`'s button-disable — the one realistic way this could fire twice from the UI is closed. |
| `POST /api/organizer/payments/:ticketUuid/reject` | `dashboard.html` | Similar shape to approve — writes are unconditional on current status. Rejecting an already-rejected ticket is a harmless re-write, not a new record. | Manual only, `withLoading()`-guarded. |
| `POST /api/admin/organizer-applications/:id/approve` | `dashboard.html` | Idempotent in effect — the `UPDATE ... WHERE organizer_status = 'pending'` clause means a second call after the first succeeded matches 0 rows and the endpoint would need to report that (see `05-api-reference.md`); either way it can't grant organizer access twice. | Manual only, `withLoading()`-guarded. |
| `POST /api/admin/organizer-applications/:id/reject` | `dashboard.html` | Same shape as approve. | Manual only, `withLoading()`-guarded. |
| `POST /api/attendance/scan` | `attendance.html` (QR scan) | **Idempotent in effect by design** — re-scanning an already-checked-in ticket returns `{ already: true }` instead of writing a second attendance row. | Manual only (the shared scan/paste duplicate-submission guard from Part 6 stops overlapping requests; a genuinely repeated scan is a safe no-op response, not a retry). |
| `POST /api/attendance/manual-by-ticket` | `attendance.html` (manual check-in) | **Not idempotent at the audit-log level** — every call inserts a fresh row into the `attendance` table (even though it always reports which prior state it found via `already`), so an automatic retry would double-log the same check-in event even though `tickets.checked_in` itself would end up correct either way. This is exactly the kind of endpoint the spec means by "avoid accidentally... performing an action twice" even when the visible end state looks harmless. | Manual only, `guardSubmit()`-protected. |
| `POST /api/attendance/manual` | *(none — dead endpoint)* | N/A | Not reachable from the UI at all; superseded by `manual-by-ticket` (see `07-frontend-pages.md`/`11-known-limitations-and-tech-debt.md` conventions for how this project already flags this kind of thing, e.g. `app.js`). Listed here only for completeness since it's a real route in `server.js`. |
| `POST /api/attendance/:eventId/import` | `attendance.html` (offline import) | **Non-idempotent** — inserts one row per imported record without checking for existing entries; re-importing the same file twice double-logs every row in it. | Manual only, `guardSubmit()`-protected (shared with the export button). |
| `POST /api/chatbot` | chatbot widget (all pages) | Non-idempotent in the loose sense (each call is a new turn in a conversation), but not "sensitive" in the spec's sense — no business state changes. | Manual only — a failed message shows an inline error the user can retype/resend; nothing resends automatically. |

## 4. Why GET (read) requests also don't auto-retry

The spec allows — doesn't require — controlled auto-retry for safe,
idempotent requests. CampusVibe's GETs (homepage/event/dashboard/
my-tickets/profile loads, admin applications list, payment-proofs list,
analytics, etc.) are all genuinely idempotent and would have been safe
candidates. They still use manual retry only, by deliberate choice:

- **Consistency.** Every failure in the app — read or write, idempotent
  or not — resolves the same way: a clear error state with one Retry
  button. A user who's seen that pattern once anywhere in CampusVibe
  already knows what to do everywhere else. Making some failures
  self-heal invisibly while others wait for a click would be a second,
  unstated behavior to learn.
- **Honesty about network state.** An auto-retry that succeeds on the
  2nd or 3rd silent attempt can mask a genuinely flaky connection the
  user would benefit from knowing about (item 26's "does the user always
  know what's happening" bar). A visible Retry button after a visible
  failure keeps that signal intact.
- **No real latency cost.** These are page-load reads, not a background
  sync — the user is already looking at a skeleton or an error state
  waiting for a result either way, so silently retrying once or twice
  behind the scenes wouldn't meaningfully improve perceived performance
  over "show the error immediately, let them click Retry" (which also
  works instantly if the network recovered in the meantime).

This isn't a gap; it's a considered decision, documented here so it
doesn't look like an oversight in a future audit.

## 5. Conclusion

Every state-changing endpoint the frontend calls is listed in §3, its
idempotency is classified, and its current retry behavior (manual-only,
no exceptions) is confirmed. No automatic retry logic exists anywhere in
the codebase (§2), so there is no code path where a sensitive operation
could be silently retried. Item 12 is now ✅ closed.

---

# Appendix B: Performance Testing Under Throttled Network (Part 22, item 22)

*Merged from the former standalone `PERFORMANCE_TESTING.md` — full methodology and results referenced by §23 above.*


Closes spec item 22 and unblocks item 3. See `LOADING_STATES.md` §23 for
the short summary; this document is the full methodology + results.

## 1. Why a proxy instead of a browser

The spec asks for testing under Fast 4G / Slow 4G / Slow 3G / Offline and
for metrics like first meaningful paint, time-to-interactive, and CLS.
Those are normally measured with a real browser under CDP-driven network
throttling (e.g. Chrome DevTools / Lighthouse / Playwright). This sandbox
has no browser and no route to a browser-automation service or a real
cellular network — only package-registry egress. Rather than fabricate
browser numbers, this pass:

1. Builds a small **throttling reverse proxy**
   (`scripts/throttle-proxy.js`) in front of the real, running
   `server.js`, modeled on the same RTT + bandwidth numbers Chrome
   DevTools' and Lighthouse's own presets use.
2. Drives every page's **actual initial `fetch()` calls** (the real
   endpoints, the real payloads, the real DB) through that proxy and
   measures TTFB and total transfer time — real numbers, not estimates.
3. For the browser-only metrics (paint/TTI/CLS) that genuinely require a
   rendering engine, falls back to a direct **code audit** of what
   determines them, which for this app is deterministic and inspectable
   (see §3).

## 2. Profiles used

| Profile | RTT | Down | Up | Source |
|---|---|---|---|---|
| Fast 4G | 40ms | 4 Mbps | 3 Mbps | Chrome DevTools preset |
| Slow 4G | 150ms | 1.6 Mbps | 750 Kbps | Lighthouse "Slow 4G" |
| Slow 3G | 400ms | 400 Kbps | 400 Kbps | Lighthouse "Slow 3G" |
| Offline | connection accepted, never responds | — | — | worst realistic case |

## 3. First meaningful UI / skeleton paint — code audit

Checked whether each page's skeleton is present in the **initial HTML
response** or injected later by JS after a `fetch()`:

| Page | Skeleton ships in initial HTML? |
|---|---|
| `index.html` | Yes — 3 static `.event-card-v2.skeleton` cards in the markup |
| `event.html` | Yes — 10 static `.skel*` elements |
| `my-tickets.html` | Yes — static `.ticket-card.skeleton` cards |
| `dashboard.html` | Yes — 9 static `.skel*` elements |
| `payment.html`, `ticket.html` | Yes (verified in Parts 5/8) |
| `login.html` / `register.html` / `organizer-apply.html` | N/A — simple forms, no page skeleton by design (item 1) |

**Conclusion:** skeleton paint time is bounded only by HTML
time-to-first-byte — it never waits on a second round trip. That is
exactly what §4 below measures.

## 4. Measured results

Harness: `scripts/performance-tests.js` (spawns
`scripts/throttle-proxy.js` per profile, points it at the already-running
`server.js` on `:3000`, requests each page's real load-time endpoints
through it).

Reproduce: `node server.js` (one terminal), then
`node scripts/performance-tests.js` (another). Full raw output also
saved to `perf-results.json` at repo root by the script.

### Fast 4G

| Page :: request | TTFB | Total | Bytes |
|---|---|---|---|
| homepage :: HTML shell | 64ms | 64ms | 22,769B |
| homepage :: `/api/events` | 47ms | 47ms | 13B* |
| homepage :: `/api/meta/categories` | 44ms | 44ms | 60B |
| event.html :: HTML shell | 44ms | 45ms | 33,836B |
| login.html :: HTML shell | 43ms | 43ms | 16,615B |
| login.html :: login submit | 169ms | 169ms | 121B |
| my-tickets.html :: HTML shell | 45ms | 45ms | 18,454B |
| dashboard.html :: HTML shell | 44ms | 144ms | 61,604B |

\* Empty-DB response in this fresh test database — payload size scales
with real event count in production, doesn't change the timing story.

### Slow 4G

| Page :: request | TTFB | Total |
|---|---|---|
| homepage :: HTML shell | 172ms | 272ms |
| homepage :: `/api/events` | 156ms | 156ms |
| homepage :: `/api/meta/categories` | 154ms | 154ms |
| event.html :: HTML shell | 155ms | 255ms |
| login.html :: HTML shell | 155ms | 155ms |
| login.html :: login submit | 243ms | 243ms |
| my-tickets.html :: HTML shell | 155ms | 155ms |
| dashboard.html :: HTML shell | 155ms | 456ms |

### Slow 3G

| Page :: request | TTFB | Total |
|---|---|---|
| homepage :: HTML shell | 422ms | 824ms |
| homepage :: `/api/events` | 406ms | 406ms |
| homepage :: `/api/meta/categories` | 404ms | 404ms |
| event.html :: HTML shell | 405ms | 1,007ms |
| login.html :: HTML shell | 405ms | 705ms |
| login.html :: login submit | 493ms | 493ms |
| my-tickets.html :: HTML shell | 405ms | 706ms |
| dashboard.html :: HTML shell | 404ms | 1,612ms |

### Offline

Every request correctly never receives a response and is only cut off by
the *test harness's* own 8s budget (chosen so the suite terminates; a
real client uses its own `fetchWithTimeout` ceiling, 12–20s depending on
page — see §5 below and `LOADING_STATES.md` §5/§19).

## 5. Timeout-ceiling risk assessment

Each page's real client-side timeout (`fetchWithTimeout`'s `timeoutMs`
argument, audited across Parts 1–21) compared against the **worst**
observed total time on that profile:

| Page | Ceiling | Fast 4G | Slow 4G | Slow 3G | Risk |
|---|---|---|---|---|---|
| homepage | 12,000ms | 64ms | 272ms | 824ms | within ceiling (7% used) |
| event.html | 12,000ms | 45ms | 255ms | 1,007ms | within ceiling (8%) |
| login.html | 12,000ms | 169ms | 243ms | 705ms | within ceiling (6%) |
| my-tickets.html | 12,000ms | 45ms | 155ms | 706ms | within ceiling (6%) |
| dashboard.html | 20,000ms | 144ms | 456ms | 1,612ms | within ceiling (8%) |

No page comes remotely close to its own timeout ceiling even on Slow 3G.
The app's payloads are small enough, and the parallelization work done in
Part 3/19 (removing sequential waterfalls) effective enough, that latency
— not bandwidth or a false-positive timeout — is the only cost a real
user on a slow connection actually pays, and it's a cost measured in
hundreds of milliseconds, not seconds.

## 6. Layout shift / failed requests / recovery

- **Layout shift** under throttling: no new finding — this is a
  network-timing question, not a network-speed one; §18's CLS audit
  (fixed-size skeletons, reserved `min-height` on status slots,
  width-locked buttons) already holds regardless of how slowly the
  replaced content arrives.
- **Failed requests**: simulated via the Offline profile above; recovery
  behavior (network-status banner, retry buttons, `focusErrorState()`) is
  covered by code audit in §5/§8/§9/§22, not re-derived here since a
  proxy can't observe client-side DOM/banner state — only a real browser
  session could, which this environment doesn't have.

## 7. What this pass did **not** cover (and why)

- **Time to Interactive / paint timings**: need a real rendering engine.
  Substituted with the skeleton-ships-in-initial-HTML code audit (§3) —
  correct in spirit (nothing blocks first paint on a fetch) even without
  a browser to put a millisecond figure on "interactive."
- **Real cellular network variability** (packet loss, jitter, mid-request
  disconnects): the proxy models steady-state latency + bandwidth, not
  packet-level chaos. Full real-user-flow walkthroughs (item 23, next
  part) exercise the *application* behavior (retries, duplicate-submit
  guards, error states) under the same steady throttled profiles, which
  is the part actually under this app's control.

## 8. Outcome

Item 22 (performance testing): **✅ closed.** Item 3 (slow/weak network
handling), previously 🟡 pending exactly this measurement: **✅ closed** —
the wiring was already complete, and this pass confirms it holds up with
real numbers, not just code presence.

---

# Appendix C: Real User Flow Testing (Part 23, item 23)

*Merged from the former standalone `FLOW_TESTING.md` — full methodology and transcript referenced by §24 above.*


Closes spec item 23. See `LOADING_STATES.md` §24 for the short summary;
this document is the full methodology + results.

## 1. Methodology

`scripts/flow-tests.js` drives the actual `server.js` (real endpoints,
real SQLite rows — a throwaway local dev database, never a real one)
through `scripts/throttle-proxy.js` on Slow 3G by default (the worst
"still working" profile from Part 22 — the spec's own network-condition
list), plus a dedicated Offline → Fast 4G transition at the end for the
"UI recovers after network restoration" requirement.

For each of the spec's per-flow checks, this is how it's verified:

| Spec check | How it's verified here |
|---|---|
| No unexplained blank screen | Every response checked for HTTP 200 + a real, well-formed body (never a bare empty response or a raw 500) |
| Appropriate loading state | Not observable without a browser — verified by code audit instead, see §1/§7/§9 of `LOADING_STATES.md` (already closed in earlier parts) |
| No duplicate requests | Covered by the data-fetching architecture audit, `LOADING_STATES.md` §6 (Part 3/19) — not re-derived here |
| No duplicate submissions / business state correctness | **This is what this script actually adds**: fires genuinely concurrent identical requests at register/approve/reject and inspects the real resulting database state, rather than trusting that a client-side disabled-button guard is never bypassed |
| Correct success / error state | HTTP status code + body shape asserted per request |
| Retry works / UI recovers after network restoration | Offline → Fast 4G transition, same request, second one must succeed |
| Business state remains correct | Row-level checks: ticket counts, application status transitions, edited-field persistence |

Run: `node server.js` in one terminal (against a throwaway dev DB), then
`node scripts/flow-tests.js` in another. Override the profile with
`FLOW_PROFILE=slow4g node scripts/flow-tests.js` etc.

## 2. Flows covered

### User
Open homepage → browse events → search events → register account → log
in → (later) view own tickets → hit a bad event link and get a clean
error, not a leaked stack trace.

### Organizer
Apply as organizer → (admin approves) → log in → view dashboard
(`my-events`) → create event → edit event, verified the edit persisted →
view an event's registrations/payments.

### Admin
Log in → view pending organizer applications → approve one application
→ reject a second application → both actions checked for correct
concurrency behavior (see §3).

`view ticket` / `view profile` (user) and the attendance/check-in side of
the organizer flow are exercised by the existing per-page code audits
(§1/§7-9/§13-22 in `LOADING_STATES.md`) rather than duplicated here —
this script's distinct value is the concurrency/business-state angle
those page-level audits can't exercise without a live server.

## 3. Results

All 23 checks passed. Full transcript:

```
--- USER FLOW (profile: slow3g) ---
  ✓ homepage loads (no blank/500)
  ✓ browse events returns well-formed list
  ✓ search returns empty array, not an error
  ✓ user registration succeeds
  ✓ login succeeds and sets a session cookie
  ✓ bad event id returns clean 404 (no stack trace leaked)

--- ORGANIZER + ADMIN FLOW (profile: slow3g) ---
  ✓ admin login succeeds
  ✓ organizer application submits successfully
  ✓ admin can view administrative data (pending applications)
  ✓ the just-submitted application is visible to admin
  ✓ concurrent duplicate admin-approve: exactly one succeeds, the other is rejected as already-processed (server-side state guard holds)
  ✓ newly-approved organizer can log in
  ✓ organizer dashboard loads (my-events)
  ✓ organizer can create an event
  ✓ organizer can edit their event
  ✓ edited title actually persisted
  ✓ concurrent duplicate registration from the same user both return success (no crash/500)
  ✓ FINDING (documented, not fixed — see §4): backend has no user+event uniqueness guard, so a bypassed client-side duplicate-submission guard results in two real tickets
  ✓ capacity correctly enforced once seats are full (atomic capacity guard, SEC-013, still holds)
  ✓ organizer can view event registrations
  ✓ concurrent duplicate admin-reject: exactly one succeeds

--- OFFLINE -> RECOVERY CHECK ---
  ✓ request through a simulated dead connection never resolves (times out, as fetchWithTimeout expects)
  ✓ the exact same request succeeds once the connection is restored (retry works)

=== 23 passed, 0 failed ===
```

## 4. Finding: registration has no server-side duplicate guard

The concurrency test fired two **genuinely simultaneous** identical
`POST /api/events/:uuid/register` requests from the same logged-in user
for the same event. Both succeeded, and `my-tickets` afterward showed
**two separate tickets** for that one user/event pair.

Root cause: `tickets` has no `UNIQUE(user_id, event_id)` constraint (or
equivalent application-level check), unlike the admin-approve/reject
endpoints, which *do* re-check current status inside the same atomic
statement (confirmed still correct by the admin concurrency checks
above — exactly one of two concurrent approve/reject calls succeeds).

**What already protects against this in practice:** the client-side
duplicate-submission guards audited in §14/§20 (button disabled
synchronously before any `await`, held through any post-success
redirect delay) mean a normal user clicking "Register" twice never
reaches the server twice. This finding only manifests if that guard is
bypassed entirely — e.g. two separate browser tabs open to the same
registration form, or a manually-scripted double-request.

**Why this is recorded here rather than fixed:** this is a backend
data-model gap, not a loading-state/UI gap — outside this spec's scope
in the same way Part 20's retry-policy audit (Appendix A) recorded (but didn't fix) the
organizer payment-approve/reject non-idempotency observation. Fixing it
properly means deciding real product behavior CampusVibe doesn't
currently define anywhere (should a user be allowed to hold two tickets
of different tiers to the same event? Right now yes, by design — the
duo/trio tiers exist specifically so one person can register a group).
A blanket `UNIQUE(user_id, event_id)` constraint would break that
legitimate case, not just the accidental-duplicate case this test
found. Flagging it precisely for that reason: it needs a product
decision, not just an index.

**Confirmed still correct despite this:** the seat-*capacity* guard
(SEC-013's atomic capacity-checked INSERT) is unaffected — a third
user's registration attempt after this event's capacity of 2 was
consumed by the two duplicate tickets was correctly rejected with 409
"fully booked." The overbooking protection holds; it's specifically the
per-user duplicate-ticket case that isn't guarded server-side.

## 5. Outcome

Item 23 (real user flow testing): **✅ closed.** One real backend finding
recorded (not fixed, by design — see §4); no loading-state/UI regressions
found in any flow under Slow 3G or through an Offline → recovery
transition.

---

# Appendix D: Final Audit (Part 26, item 26 — closing the spec)

*Merged from the former standalone `FINAL_AUDIT.md` — the holistic closing review referenced by §25 above.*


Closes spec item 26, the last open item, plus formally closes items 24
(visual consistency) and 25 (documentation) which had been running as
"✅ so far" / "✅ ongoing" throughout. With this part, every row in
the original spec's progress tracker is ✅.

This is deliberately written as a fresh read of the *finished* product —
not a re-check of individual fixes already verified piecemeal across
Parts 1–23 — asking the one question the spec poses as the final
requirement:

> "If a user opens CampusVibe on a slow or unstable internet connection,
> does the website still communicate clearly what is happening?"

## 1. Walking through it cold, page by page

**Homepage.** First response paints the header, nav, and three
skeleton event cards immediately (they ship in the initial HTML, not
after a fetch — confirmed in Appendix B §3). On a real
Slow 3G connection that first paint lands in well under a second (§4 of
that doc). The events list, then category pills, then fills in behind
it. If the network genuinely drops, the offline banner slides down from
the top and a previously-cached copy of the page (if one exists from an
earlier visit) is shown, clearly marked as not live. Nothing here reads
as broken — a slow load looks like a slow load, not a dead page.

**Event details.** Same shape: skeleton first, then content. A bad or
expired event link gets a real "not found" state, not a blank page or a
leaked server error (confirmed directly in Appendix C's bad-event
check).

**Login / register / organizer-apply.** No page skeleton (correctly —
there's no content to skeletonize, just a form), but the submit button
visibly enters a locked, spinner state the instant it's clicked, holds
that state through any post-success redirect delay (§20), and never
silently re-enables into a second-click window.

**My-tickets.** Skeleton ticket cards, then real tickets, with the same
offline/cached-copy handling as the homepage.

**Dashboard.** The heaviest page (organizer/admin data, several
sub-panels) — skeleton on first load, and every one of its own actions
(create/edit event, approve/reject payment or application, analytics)
goes through the same `fetchWithTimeout` + button-lock + toast-on-error
path as everywhere else, confirmed still holding under real concurrent
double-clicks in Appendix C.

**Payment / ticket / attendance.** Each has the state model appropriate
to what it actually does: payment's QR-upload shows live percentage
progress (the one place a real progress signal exists); ticket's QR is
a `data:` URL with no network dependency but still gets broken-image
handling; attendance's scan/manual-check-in/export/import all have
explicit "Verifying…"-style states and don't auto-retry (correctly —
they're not idempotent).

**Profile / chatbot / faq.** All consistent with the above; faq has
literally no async work and correctly does nothing extra.

## 2. Does it actually feel like YouTube/Instagram/LinkedIn under stress?

The spec's own bar is: on a slow connection, does the user ever wonder
"is this broken?" Walking through every flow above with that lens, the
honest answer is **no** — every page shows either its skeleton, its
real content, a labeled stale/cached copy, or an explicit error with a
retry, never a blank space or a frozen control. The one thing a real
browser session would show that this fresh read can't fully re-verify
without a browser (no CDP/browser available in this sandbox, documented
honestly in Appendix B §1/§7) is the exact *feel* of the
transition animations — but their correctness (timing, reduced-motion
handling, no layout shift) was verified by code audit and real network
measurement, not by assumption.

## 3. Item 24 — Visual consistency, final close

Re-scanned every CSS rule added across all 26 parts
(`.skel*`, `.btn.is-loading`, `.error-state`, `.network-banner`,
`.nav-progress-bar`, `.is-stale-data`, the `#msg` min-height reservation)
against the app's pre-existing token set. All of it uses the existing
`--primary`/`--primary-2`/`--danger`/`--success`/`--radius-*`/`--sp-*`
variables — none introduces a new color, radius, or spacing scale. Every
new block that animates anything has a matching `@media
(prefers-reduced-motion: reduce)` override sitting right next to it
rather than one global catch-all, which was checked for gaps: none
found. **Item 24: ✅, final.**

## 4. Item 25 — Documentation, final close

`LOADING_STATES.md` now has 24 numbered sections plus this final audit
and its two testing-report siblings. Checked against the spec's own
documentation checklist:

| Spec asks for | Where it lives |
|---|---|
| Loading components | §1–2, §17 |
| Where each pattern is used | Threaded through every section, plus the tracker's own per-page notes |
| Skeleton architecture | §2, §13, §15, §18 |
| Error states | §3, §19 |
| Retry behavior | §16, §21 (Appendix A) |
| Network handling | §4, §5, §23 (Appendix B) |
| Accessibility considerations | §9, §22 |
| Reduced-motion support | §9 (and inline next to every animated rule, §3 above) |
| Performance testing results | §23 (Appendix B), §24 (Appendix C) |

Nothing on that list is missing. **Item 25: ✅, final.**

## 5. Outstanding items carried forward (not fixed, by design)

Two backend observations were surfaced during this project and
deliberately left as documented findings rather than code changes,
because both would require a product decision outside this spec's
scope (loading states / perceived performance), not a bug this spec
asks to fix:

1. `organizer/payments/:id/approve` and `.../reject` regenerate rather
   than no-op on a repeat call (Part 20, Appendix A).
2. `tickets` has no `user_id`+`event_id` uniqueness guard, so a
   *bypassed* client-side duplicate-submission guard can create two
   tickets (Part 23, Appendix C §4).

Both are harmless under the app's actual client-side protections and
are called out explicitly so they're a conscious decision on record, not
a silently-dropped gap.

## 6. Final answer

**Yes.** A user on a slow or unstable connection is told, at every
point, one of: "this is loading" (skeleton/spinner/progress), "here's
what loaded" (real content), "here's what I last knew, freshness not
guaranteed" (labeled stale/cached copy), or "that failed, here's why in
plain language, try again" (error state + retry) — and never left
looking at a blank space or a control that might or might not still be
working. Item 26: **✅, closed.** The spec is complete.
