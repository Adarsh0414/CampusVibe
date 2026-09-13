/*
 * CampusVibe i18n engine
 * =======================
 * Lightweight, dependency-free translation layer.
 *
 * Usage in HTML:
 *   <span data-i18n="hero_title">Find your next campus moment</span>
 *   <input data-i18n-placeholder="search_placeholder" placeholder="Search..." />
 *
 * The English text already in the HTML is kept as a fallback — if a key is
 * missing for the selected language (or the language data hasn't loaded),
 * the page still shows sensible English rather than breaking.
 *
 * Usage in JS:
 *   window.i18n.t('cat_all')          -> translated string for current language
 *   window.i18n.setLanguage('hi')     -> switch language, re-translate page, persist choice
 *   window.i18n.getLanguage()         -> current language code
 *
 * Requires assets/i18n/i18n-data.js to be loaded first (defines window.I18N_STRINGS).
 */
(function () {
  const STORAGE_KEY = 'campusvibe_lang';
  const DEFAULT_LANG = 'en';

  function getStrings() {
    return window.I18N_STRINGS || {};
  }

  function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function t(key, lang) {
    const strings = getStrings();
    const code = lang || getLanguage();
    const table = strings[code] || strings[DEFAULT_LANG] || {};
    if (table[key] != null) return table[key];
    const fallback = strings[DEFAULT_LANG] || {};
    return fallback[key] != null ? fallback[key] : key;
  }

  function applyToDom(root) {
    const scope = root || document;
    const lang = getLanguage();
    const table = getStrings()[lang] || {};
    const isDefaultLang = lang === DEFAULT_LANG;

    // When the current language's table has no entry for a key, t() falls
    // back to the English string — but the text on screen is then English
    // inside a page whose <html lang> says (e.g.) "hi". A screen reader
    // would apply Hindi pronunciation rules to that English fallback text.
    // Tag just that element `lang="en"` (WCAG 3.1.2 Language of Parts) so
    // it's announced correctly; clear the override once a real translation
    // exists (e.g. after switching to a fully-covered language, or if the
    // string is later added to this language's table).
    function markFallback(el, key) {
      if (!isDefaultLang && table[key] == null) el.setAttribute('lang', 'en');
      else el.removeAttribute('lang');
    }

    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key, lang);
      markFallback(el, key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key, lang));
      // Not applying the same per-element `lang` override here: AT support
      // for a `lang` attribute changing how a placeholder is announced is
      // inconsistent across screen readers, so this is a known, accepted
      // gap rather than a fix — see ACCESSIBILITY_AUDIT.md A11Y-018.
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.setAttribute('title', t(key, lang));
      markFallback(el, key);
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', t(key, lang));
      markFallback(el, key);
    });

    document.documentElement.setAttribute('lang', lang);
    const dir = (getStrings()[lang] || {}).dir || 'ltr';
    document.documentElement.setAttribute('dir', dir);
  }

  function setLanguage(code) {
    localStorage.setItem(STORAGE_KEY, code);
    applyToDom(document);
    document.dispatchEvent(new CustomEvent('campusvibe:languagechange', { detail: { lang: code } }));
  }

  function buildSelectorOptions() {
    const strings = getStrings();
    return Object.keys(strings).map(code => ({ code, name: strings[code].name || code }));
  }

  // Renders a <select> based language picker into any element with
  // id="langSelectorMount" found on the page (header nav, footer, etc.)
  function mountSelector() {
    const mounts = document.querySelectorAll('[data-i18n-mount]');
    if (!mounts.length) return;
    const current = getLanguage();
    const options = buildSelectorOptions();

    mounts.forEach(mount => {
      const select = document.createElement('select');
      select.className = 'lang-select';
      select.setAttribute('aria-label', 'Language');
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.code;
        o.textContent = opt.name;
        if (opt.code === current) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', (e) => setLanguage(e.target.value));
      mount.innerHTML = '';
      mount.appendChild(select);
    });
  }

  function init() {
    mountSelector();
    applyToDom(document);
    // On phones the nav can scroll horizontally (there are usually more
    // items than fit in one row). Some mobile browsers restore a leftover
    // scroll offset from a previous visit/page, which makes the nav look
    // like it's showing a cut-off middle section instead of starting
    // cleanly from the first item — force it back to the start.
    document.querySelectorAll('.nav').forEach(nav => { nav.scrollLeft = 0; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.i18n = { t, setLanguage, getLanguage, applyToDom, mountSelector };
})();