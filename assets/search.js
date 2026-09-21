/* ==========================================================================
   search.js — predictive search inside the search drawer.
   Uses Shopify's Predictive Search API (routes.predictive_search_url, i.e.
   /search/suggest) and the section sections/predictive-search.liquid to
   render results server-side. Loaded only when predictive search is enabled.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var utils = Theme.utils;

  Theme.component('predictive-search', function (root) {
    var input = utils.qs('[data-search-input]', root);
    var results = utils.qs('[data-search-results]', root);
    var live = utils.qs('[data-search-live]', root);
    var clear = utils.qs('[data-search-clear]', root);
    if (!input || !results) return;

    var enabled = root.getAttribute('data-predictive') === 'true';
    var types = root.getAttribute('data-types') || 'product';
    var limit = root.getAttribute('data-limit') || '4';
    var endpoint = (Theme.config.routes || {}).predictive_search_url || '/search/suggest';
    var controller = null;
    var lastQuery = '';

    function setBusy(busy) { results.setAttribute('aria-busy', busy ? 'true' : 'false'); }
    function announce(text) { if (live) live.textContent = text || ''; }

    function reset() {
      if (controller) controller.abort();
      lastQuery = '';
      results.innerHTML = '';
      setBusy(false);
      announce('');
    }

    function showError() {
      var p = document.createElement('p');
      p.className = 'message message--error';
      p.setAttribute('role', 'alert');
      p.textContent = root.getAttribute('data-error') || '';
      results.innerHTML = '';
      results.appendChild(p);
    }

    function search(term) {
      term = term.trim();
      if (!term) { reset(); return; }
      if (term === lastQuery) return;
      lastQuery = term;

      if (controller) controller.abort();
      controller = new AbortController();
      setBusy(true);

      var url = new URL(endpoint, window.location.origin);
      url.searchParams.set('q', term);
      url.searchParams.set('resources[type]', types);
      url.searchParams.set('resources[limit]', limit);
      url.searchParams.set('resources[limit_scope]', 'each');
      url.searchParams.set('section_id', 'predictive-search');

      fetch(url.toString(), { signal: controller.signal, headers: { 'Accept': 'text/html' } })
        .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.text(); })
        .then(function (html) {
          var tpl = document.createElement('template');
          tpl.innerHTML = html;
          var payload = tpl.content.querySelector('[data-predictive-results]');
          results.innerHTML = payload ? payload.innerHTML : '';
          announce(payload ? payload.getAttribute('data-announce') : '');
          setBusy(false);
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return;   // superseded by a newer request
          lastQuery = '';
          showError();
          setBusy(false);
        });
    }

    var debounced = utils.debounce(function () { search(input.value); }, 250);

    function onInput() {
      if (clear) clear.hidden = input.value === '';
      if (enabled) debounced(); 
    }

    function onClear() {
      input.value = '';
      clear.hidden = true;
      reset();
      input.focus();
    }

    function resultLinks() { return utils.qsa('[data-result-link]', results); }

    // Arrow-key navigation: input <-> result links
    function onInputKeydown(e) {
      if (e.key === 'ArrowDown') {
        var links = resultLinks();
        if (links.length) { e.preventDefault(); links[0].focus(); }
      }
    }
    function onResultsKeydown(e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = resultLinks();
      var index = links.indexOf(document.activeElement);
      if (index === -1) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') (links[index + 1] || links[0]).focus();
      else if (index === 0) input.focus();
      else links[index - 1].focus();
    }

    // When the drawer opens, select any previous text so typing replaces it.
    var offOpen = Theme.events.on('drawer:open', function (e) {
      if (e.detail.id === 'search') input.select();
    });

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKeydown);
    results.addEventListener('keydown', onResultsKeydown);
    if (clear) clear.addEventListener('click', onClear);

    return {
      destroy: function () {
        if (controller) controller.abort();
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onInputKeydown);
        results.removeEventListener('keydown', onResultsKeydown);
        if (clear) clear.removeEventListener('click', onClear);
        offOpen();
      }
    };
  });
})();
