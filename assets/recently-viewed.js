/* ==========================================================================
   recently-viewed.js — remembers the product handles a visitor has viewed and renders
   them in the "recently viewed" section.
   - Storage: localStorage key "theme:recently-viewed" (array of handles, newest first).
     Nothing leaves the browser.
   - Recording: the layout puts data-product-handle on <body> for product pages, so this
     works with any product template.
   - Rendering: each card is fetched server-side as a section
     (/products/<handle>?sections=product-card-item), lazily, when the section is near
     the viewport. Handles that no longer exist are skipped.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var utils = Theme.utils;
  var KEY = 'theme:recently-viewed';
  var MAX = 20;

  // A handle is a URL segment: no whitespace, slashes, query or fragment characters.
  function valid(handle) { return typeof handle === 'string' && /^[^\s\/?#\\]{1,255}$/.test(handle); }

  function read() {
    try {
      var list = JSON.parse(window.localStorage.getItem(KEY));
      return Array.isArray(list) ? list.filter(valid) : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* storage unavailable */ }
  }

  Theme.recentlyViewed = {
    get: read,
    // Newest first, no duplicates, capped at MAX. Invalid handles are ignored.
    add: function (handle) {
      if (!valid(handle)) return;
      write([handle].concat(read().filter(function (h) { return h !== handle; })));
    },
    remove: function (handle) { write(read().filter(function (h) { return h !== handle; })); },
    clear: function () { write([]); }
  };

  var current = document.body.getAttribute('data-product-handle');
  if (current) Theme.recentlyViewed.add(current);

  Theme.component('recently-viewed', function (root) {
    var grid = utils.qs('[data-recent-grid]', root);
    var limit = parseInt(root.getAttribute('data-limit'), 10) || 4;
    var exclude = root.getAttribute('data-exclude');
    var design = root.getAttribute('data-design-mode') === 'true';
    var loaded = false;
    var observer = null;
    var alive = true;

    function endpoint(handle) {
      var base = (Theme.config.routes && Theme.config.routes.root_url) || '/';
      var url = new URL(base + 'products/' + encodeURIComponent(handle), window.location.origin);
      url.searchParams.set('sections', 'product-card-item');
      return url.toString();
    }

    function fetchCard(handle) {
      return fetch(endpoint(handle), { headers: { 'Accept': 'application/json' } })
        .then(function (res) {
          if (!res.ok) { var err = new Error(res.statusText); err.status = res.status; throw err; }
          return res.json();
        })
        .then(function (json) {
          var tpl = document.createElement('template');
          tpl.innerHTML = json['product-card-item'] || '';
          var card = utils.qs('[data-product-card-item] > *', tpl.content);
          if (!card) throw new Error('no card');
          return card;
        });
    }

    function load() {
      if (loaded) return;
      loaded = true;
      var handles = read().filter(function (h) { return h !== exclude; }).slice(0, limit);
      if (!handles.length) return;   // stay hidden (or keep the editor placeholders)
      Promise.all(handles.map(function (h) {
        return fetchCard(h).catch(function (err) {
          if (err && err.status === 404) Theme.recentlyViewed.remove(h);   // the product no longer exists
          return null;
        });
      })).then(function (cards) {
        if (!alive) return;
        cards = cards.filter(Boolean);
        if (!cards.length) return;
        grid.innerHTML = '';
        cards.forEach(function (card) { grid.appendChild(card); });
        root.hidden = false;
        Theme.init(grid);
      });
    }

    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { load(); observer.disconnect(); }
      }, { rootMargin: window.innerHeight + 'px 0px' });
      // A hidden element never intersects, so observe a zero-height sentinel placed before it.
      var sentinel = document.createElement('div');
      sentinel.setAttribute('aria-hidden', 'true');
      root.parentNode.insertBefore(sentinel, root);
      observer.observe(sentinel);
      root.__sentinel = sentinel;
    } else {
      load();
    }
    if (design) load();

    return {
      destroy: function () {
        alive = false;
        if (observer) observer.disconnect();
        if (root.__sentinel && root.__sentinel.parentNode) root.__sentinel.parentNode.removeChild(root.__sentinel);
      }
    };
  });
})();
