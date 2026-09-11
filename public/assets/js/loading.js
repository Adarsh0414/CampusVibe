/**
 * loading.js — shared loading-state / network-resilience utilities for CampusVibe.
 *
 * Part of the loading/perceived-performance pass (see /LOADING_STATES.md).
 * Loaded on every page (after app.js) so any page's inline <script> can use
 * `window.CVLoading` without re-implementing button spinners, offline
 * detection, timeouts, or stale-response guarding from scratch.
 *
 * Nothing here auto-runs except the network status banner, which is safe
 * to have on every page (it stays hidden unless the browser actually goes
 * offline/comes back online).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Button loading state (Register…, Saving…, Processing…)
  //    Locks the button's rendered width first so swapping the label for
  //    a spinner (text is made transparent, not removed) never reflows
  //    the layout — see .btn.is-loading in styles.css.
  // ---------------------------------------------------------------------
  const originalLabels = new WeakMap();

  function setButtonLoading(btn, _label) {
    if (!btn || btn.classList.contains('is-loading')) return;
    // Lock current rendered width/height so the spinner swap can't shift layout.
    const rect = btn.getBoundingClientRect();
    btn.style.minWidth = rect.width + 'px';
    btn.style.minHeight = rect.height + 'px';
    originalLabels.set(btn, { disabled: btn.disabled, html: btn.innerHTML });
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-loading');
  }

  function clearButtonLoading(btn) {
    if (!btn) return;
    const prev = originalLabels.get(btn);
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
    if (prev) {
      btn.disabled = prev.disabled;
      originalLabels.delete(btn);
    } else {
      btn.disabled = false;
    }
    btn.style.minWidth = '';
    btn.style.minHeight = '';
  }

  /**
   * Wrap an async submit handler so double-clicks/rapid re-submits can't
   * fire the request twice, and the button always recovers (even on throw).
   *   button.addEventListener('click', CVLoading.guardSubmit(btn, async () => { ... }));
   */
  function guardSubmit(btn, handler) {
    let inFlight = false;
    return async function (...args) {
      if (inFlight) return; // duplicate-submission protection (client-side half of it)
      inFlight = true;
      setButtonLoading(btn);
      try {
        return await handler.apply(this, args);
      } finally {
        inFlight = false;
        clearButtonLoading(btn);
      }
    };
  }

  // ---------------------------------------------------------------------
  // 2. fetchWithTimeout — every request gets a ceiling so the UI can never
  //    be stuck on "Loading..." forever. Default 15s; pass ms to override.
  // ---------------------------------------------------------------------
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: opts.signal || controller.signal });
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Request timed out. Please check your connection and try again.');
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------
  // 2b. fetchWithProgress — for genuinely-long operations where a real
  //     percentage is available (file uploads). `fetch()` has no reliable
  //     cross-browser way to observe upload progress, so this uses
  //     XMLHttpRequest under the hood but exposes a fetch-Response-like
  //     object ({ ok, status, json(), text() }) so call sites don't need
  //     two different response-handling code paths. Mirrors
  //     fetchWithTimeout's error shape (isTimeout, generic network error)
  //     so existing catch blocks keep working unchanged.
  // ---------------------------------------------------------------------
  function fetchWithProgress(url, { method = 'POST', body, credentials, headers, timeoutMs = 25000, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      if (credentials === 'include') xhr.withCredentials = true;
      if (headers) Object.keys(headers).forEach((h) => xhr.setRequestHeader(h, headers[h]));
      xhr.timeout = timeoutMs;
      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.addEventListener('load', () => {
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          json: async () => { try { return JSON.parse(xhr.responseText || '{}'); } catch (_) { return {}; } },
          text: async () => xhr.responseText,
        });
      });
      xhr.addEventListener('error', () => reject(new Error('Network error. Please check your connection and try again.')));
      xhr.addEventListener('timeout', () => {
        const err = new Error('Request timed out. Please check your connection and try again.');
        err.isTimeout = true;
        reject(err);
      });
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
      try {
        xhr.send(body);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ---------------------------------------------------------------------
  // 3. RequestGuard — prevents an older/slower response from overwriting
  //    a newer one (e.g. fast typing in a search box). Each call() bumps
  //    a token; only the response matching the latest token is applied.
  // ---------------------------------------------------------------------
  function createRequestGuard() {
    let token = 0;
    return {
      async run(promiseFactory, onResolve, onError) {
        const my = ++token;
        try {
          const result = await promiseFactory();
          if (my !== token) return; // a newer request has since started — drop stale result
          onResolve(result);
        } catch (err) {
          if (my !== token) return;
          if (onError) onError(err);
        }
      },
      isStale(myToken) { return myToken !== token; },
      bump() { return ++token; },
    };
  }

  // ---------------------------------------------------------------------
  // 3b. Navigation progress bar — CampusVibe is a classic multi-page app
  //     (real <a href> links, full navigations), so there is no client-side
  //     router to hook a route-change loading state into. What we CAN do:
  //     show a thin top-of-page progress bar the instant the user clicks an
  //     internal link (or submits a GET-navigating form), so the interval
  //     between "click" and the browser actually swapping the document never
  //     looks frozen — this mirrors what YouTube/GitHub's bar does, without
  //     pretending to be a SPA. The bar is left running; the browser's own
  //     navigation replaces the whole page (and the bar) once the new
  //     document arrives, so there's nothing to "finish" from this side.
  // ---------------------------------------------------------------------
  let navBarEl = null;
  function ensureNavBar() {
    if (navBarEl) return navBarEl;
    navBarEl = document.createElement('div');
    navBarEl.className = 'nav-progress-bar';
    navBarEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(navBarEl);
    return navBarEl;
  }

  function startNavProgress() {
    const el = ensureNavBar();
    el.classList.remove('show', 'done');
    // Force reflow so the width transition re-triggers on repeated clicks.
    void el.offsetWidth;
    el.classList.add('show');
  }

  function isInternalNavigableClick(e, a) {
    if (e.defaultPrevented || e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false; // opening in new tab/window
    if (!a || !a.href) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.origin !== location.origin) return false;
    // Same-page hash link (e.g. "#section" or same path+hash) isn't a real navigation.
    if (a.pathname === location.pathname && a.hash) return false;
    return true;
  }

  function initNavProgress() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (isInternalNavigableClick(e, a)) startNavProgress();
    });
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const method = (form.getAttribute('method') || 'get').toLowerCase();
      // Only forms that trigger a real page navigation (GET, no JS
      // preventDefault-and-fetch pattern already handled elsewhere) — most
      // CampusVibe forms are JS-submitted (preventDefault + fetch), which
      // never reach here since e.defaultPrevented is checked implicitly by
      // the form no longer firing a native submit once prevented.
      if (method === 'get') startNavProgress();
    });
    // Back/forward cache restores: make sure a bar left mid-animation from
    // the *previous* page doesn't flash stale on the restored page.
    window.addEventListener('pageshow', () => {
      if (navBarEl) navBarEl.classList.remove('show', 'done');
    });
  }

  // ---------------------------------------------------------------------
  // 3c. Lightweight read-through cache (sessionStorage) for stale-while-
  //     revalidate on read-heavy pages (event list, event details,
  //     my-tickets). Deliberately NOT a full offline/service-worker
  //     architecture — just enough that a flaky/temporarily-dead connection
  //     shows the last-known data (clearly marked as saved/possibly stale)
  //     instead of a blank error page. Never used for state-changing
  //     requests (registration, payment, attendance).
  // ---------------------------------------------------------------------
  const CACHE_PREFIX = 'cv_cache:';

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw); // { data, savedAt }
    } catch (_) { return null; }
  }

  function cacheSet(key, data) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
    } catch (_) { /* storage full/unavailable — caching is a nice-to-have, never fatal */ }
  }

  function clearCache() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.indexOf(CACHE_PREFIX) === 0)
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  }

  /**
   * Stale-while-revalidate for a single GET-style fetch.
   *   - If a cached copy exists, onCache(data, savedAt) fires immediately
   *     (synchronously) so the page can paint real content with zero wait.
   *   - The network request always runs. On success, onFresh(data) fires
   *     and the cache is updated.
   *   - On network failure: if a cached copy existed, onOffline(savedAt) is
   *     called so the page can show "you're offline — showing saved
   *     results" instead of wiping the content it already painted. If there
   *     was no cache, onError(err) is called for the normal error state.
   */
  async function staleWhileRevalidate(key, fetcher, { onCache, onFresh, onOffline, onError } = {}) {
    const cached = cacheGet(key);
    if (cached && onCache) onCache(cached.data, cached.savedAt);
    try {
      const fresh = await fetcher();
      cacheSet(key, fresh);
      if (onFresh) onFresh(fresh);
    } catch (err) {
      if (cached) {
        if (onOffline) onOffline(cached.savedAt);
      } else if (onError) {
        onError(err);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 4. Network status banner — one instance per page, created lazily.
  // ---------------------------------------------------------------------
  let bannerEl = null;
  let onlineOnceOffline = false;

  function ensureBanner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement('div');
    bannerEl.className = 'network-banner';
    bannerEl.setAttribute('role', 'status');
    bannerEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(bannerEl);
    return bannerEl;
  }

  function showBanner(text, kind, autoHideMs) {
    const el = ensureBanner();
    el.textContent = text;
    el.className = `network-banner show ${kind}`;
    if (autoHideMs) {
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => el.classList.remove('show'), autoHideMs);
    }
  }

  function initNetworkStatus() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => {
      onlineOnceOffline = true;
      showBanner("You're offline. Some features may be unavailable.", 'offline');
    });
    window.addEventListener('online', () => {
      if (!onlineOnceOffline) return; // don't announce "back online" on first load
      showBanner('Back online', 'online', 3000);
    });
    if (navigator && navigator.onLine === false) {
      onlineOnceOffline = true;
      showBanner("You're offline. Some features may be unavailable.", 'offline');
    }
  }

  function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  // ---------------------------------------------------------------------
  // 5. Skeleton HTML generators — small helpers so pages don't hand-roll
  //    the same markup. Purely presentational; safe to call before any
  //    data exists.
  // ---------------------------------------------------------------------
  function skeletonCard(lines = 3) {
    const textLines = Array.from({ length: lines }, (_, i) =>
      `<span class="skel skel-text${i === lines - 1 ? ' sm' : ''}"></span>`
    ).join('');
    return `
      <div class="skel-card" aria-hidden="true">
        <span class="skel skel-image"></span>
        <span class="skel skel-text lg" style="margin-top:10px;"></span>
        ${textLines}
      </div>`;
  }

  function skeletonRow(cols = 3) {
    const columns = Array.from({ length: cols }, () => '<span class="skel skel-text skel-col"></span>').join('');
    return `<div class="skel-row" aria-hidden="true">${columns}</div>`;
  }

  function skeletonTable(rows = 5, cols = 4) {
    const rowsHtml = Array.from({ length: rows }, () => skeletonRow(cols)).join('');
    return `<div class="skel-table" aria-hidden="true">${rowsHtml}</div>`;
  }

  function skeletonStatCard() {
    return `
      <div class="skel-stat-card" aria-hidden="true">
        <span class="skel skel-text sm"></span>
        <span class="skel skel-text lg" style="width:40%;height:28px;"></span>
      </div>`;
  }

  function repeat(html, times) {
    return Array.from({ length: times }, () => html).join('');
  }

  // ---------------------------------------------------------------------
  // 6. Error state markup helper — pairs with .error-state in styles.css.
  //    Distinct from an empty-state: this always means "the request
  //    failed", never "the request succeeded with zero results".
  // ---------------------------------------------------------------------
  function errorStateHtml({ icon = '⚠️', title = 'Something went wrong', message = 'Please try again.', retryId = '' } = {}) {
    return `
      <div class="error-state" role="alert">
        <div class="icon" aria-hidden="true">${icon}</div>
        <h3>${title}</h3>
        <p>${message}</p>
        <button type="button" class="btn outline" ${retryId ? `id="${retryId}"` : ''}>Retry</button>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // 7. Focus management for error/retry states (item 15).
  //    `.error-state[role=alert]` blocks are announced to screen readers
  //    on insertion (role="alert" is an implicit assertive live region),
  //    but that alone doesn't help keyboard users — without this, reaching
  //    the Retry button after a failed page/section load means tabbing
  //    from wherever focus happened to be, which after a full-content
  //    replacement is often nowhere useful (or gone entirely, e.g. a form
  //    that just vanished). This moves focus straight to the primary
  //    actionable element (Retry button, or a fallback link when there's
  //    no retry — e.g. ticket.html's non-retryable "bad link" state) right
  //    after it's wired up, matching the "Action -> Processing -> Error"
  //    pattern for a section the user was actively waiting on. Not used
  //    for background/secondary refreshes that don't replace something the
  //    user's focus already depended on (e.g. homepage's cached-copy
  //    banner) — see call sites for the reasoning per page.
  // ---------------------------------------------------------------------
  function focusErrorState(el) {
    if (!el) return;
    // Buttons/links are natively focusable; only add tabindex as a fallback
    // for a plain container so we never leave a stray tabindex on a control
    // that didn't need one.
    if (el.tabIndex < 0 && !['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      el.setAttribute('tabindex', '-1');
    }
    try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
  }

  global.CVLoading = {
    setButtonLoading,
    clearButtonLoading,
    guardSubmit,
    fetchWithTimeout,
    fetchWithProgress,
    createRequestGuard,
    initNetworkStatus,
    isOnline,
    showBanner,
    skeletonCard,
    skeletonRow,
    skeletonTable,
    skeletonStatCard,
    repeat,
    errorStateHtml,
    focusErrorState,
    initNavProgress,
    cacheGet,
    cacheSet,
    clearCache,
    staleWhileRevalidate,
  };

  // Network status detection and the nav-progress bar are cheap and
  // universally safe — turn them on for every page that includes this file.
  function autoInit() {
    initNetworkStatus();
    initNavProgress();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(window);
