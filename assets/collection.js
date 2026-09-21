/* ==========================================================================
   collection.js — progressive enhancement for collection pages.

   Filters, sorting and the filter drawer are a real <form method="get"> that works
   without JavaScript. This file makes it instant:
   - every change builds the Shopify URL (filter.* and sort_by), fetches ONLY the
     results section (Section Rendering API: ?section_id=…) and swaps the grid,
     pagination, active-filter chips, counts and the drawer's counts/disabled states;
   - the URL is updated with history.pushState, so the state is shareable, survives a
     refresh, and back/forward re-render the matching results (popstate);
   - the drawer itself is the shared Theme.drawer (focus trap, Esc, scroll lock, focus
     return); no separate drawer implementation exists;
   - layout toggle (2 columns vs the configured columns) is remembered in localStorage.
   Also: "scroll-active" for the horizontally scrolling collection navigation.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;
  var LAYOUT_KEY = 'theme:collection-layout';

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the layout simply is not remembered */ }
    return null;
  }

  Theme.component('collection', function (root) {
    var sectionId = root.getAttribute('data-section-id');
    var form = utils.qs('[data-filter-form]', root);
    var controller = null;
    var wantedGroup = null;

    function q(sel) { return utils.qs(sel, root); }
    function grid() { return q('[data-collection-grid]'); }
    function resultsBox() { return q('[data-collection-results]'); }
    function live(text) { var n = q('[data-collection-live]'); if (n) n.textContent = text || ''; }
    function busy(on) {
      var box = resultsBox();
      if (box) box.setAttribute('aria-busy', on ? 'true' : 'false');
      if (on) live(root.getAttribute('data-updating'));
    }

    /* ---------- URL building ---------- */
    function currentUrl() {
      var params = new URLSearchParams();
      new FormData(form).forEach(function (value, key) {
        if (value !== '') params.append(key, value);
      });
      if (params.get('sort_by') === form.getAttribute('data-default-sort')) params.delete('sort_by');

      // keep min <= max when both are given
      var minInput = utils.qs('[data-price-input="min"]', form), maxInput = utils.qs('[data-price-input="max"]', form);
      if (minInput && maxInput && minInput.value !== '' && maxInput.value !== '' && parseFloat(minInput.value) > parseFloat(maxInput.value)) {
        params.set(minInput.name, maxInput.value);
        params.set(maxInput.name, minInput.value);
      }
      var qs = params.toString();
      return window.location.pathname + (qs ? '?' + qs : '');
    }

    /* ---------- Results update ---------- */
    function replaceFrom(fresh, selector) {
      var current = q(selector), next = fresh.querySelector(selector);
      if (current && next) current.innerHTML = next.innerHTML;
    }

    function syncDrawer(fresh) {
      if (!form) return;
      utils.qsa('input[id]', form).forEach(function (input) {
        var next = fresh.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(input.id) : input.id));
        if (!next) return;
        if (input.type === 'checkbox' || input.type === 'radio') {
          input.checked = next.checked;
          input.disabled = next.disabled;
          var count = input.closest('.check') && utils.qs('[data-filter-count]', input.closest('.check'));
          var freshCount = next.closest('.check') && next.closest('.check').querySelector('[data-filter-count]');
          if (count && freshCount) count.textContent = freshCount.textContent;
        } else if (input.type === 'number') {
          input.placeholder = next.placeholder;
          if (doc.activeElement !== input) input.value = next.value;
        }
      });
      var footer = utils.qs('[data-filter-footer]', form), freshFooter = fresh.querySelector('[data-filter-footer]');
      if (footer && freshFooter) {
        var label = utils.qs('[data-filter-apply-label]', footer), freshLabel = freshFooter.querySelector('[data-filter-apply-label]');
        if (label && freshLabel) label.textContent = freshLabel.textContent;
        var clear = utils.qs('[data-filter-clear]', footer), freshClear = freshFooter.querySelector('[data-filter-clear]');
        if (clear && freshClear) { clear.href = freshClear.href; clear.hidden = freshClear.hidden; }
      }
    }

    function render(html) {
      var tpl = doc.createElement('template');
      tpl.innerHTML = html;
      var fresh = tpl.content;

      replaceFrom(fresh, '[data-collection-grid]');
      replaceFrom(fresh, '[data-collection-pagination]');

      // empty state sits between the grid and the pagination
      var oldEmpty = q('[data-collection-empty]'), newEmpty = fresh.querySelector('[data-collection-empty]');
      if (oldEmpty) oldEmpty.remove();
      if (newEmpty && grid()) grid().insertAdjacentElement('afterend', newEmpty);

      var chips = q('[data-active-filters]'), freshChips = fresh.querySelector('[data-active-filters]');
      if (chips && freshChips) chips.replaceWith(freshChips);

      var count = q('[data-result-count]'), freshCount = fresh.querySelector('[data-result-count]');
      if (count && freshCount) count.textContent = freshCount.textContent;
      var badge = q('[data-active-count]'), freshBadge = fresh.querySelector('[data-active-count]');
      if (badge && freshBadge) { badge.textContent = freshBadge.textContent; badge.hidden = freshBadge.hidden; }

      syncDrawer(fresh);
      Theme.init(grid());
      live((freshCount && freshCount.textContent) || '');
    }

    function apply(url, options) {
      options = options || {};
      if (controller) controller.abort();
      controller = new AbortController();
      busy(true);

      var request = new URL(url, window.location.origin);
      request.searchParams.set('section_id', sectionId);

      return fetch(request.toString(), { signal: controller.signal, headers: { 'Accept': 'text/html' } })
        .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.text(); })
        .then(function (html) {
          if (options.push !== false) window.history.pushState({ collection: true }, '', url);
          render(html);
          busy(false);
          if (options.focus) { var h = q('[data-results-heading]'); if (h) h.focus({ preventScroll: true }); }
          if (options.focusApply) { var a = utils.qs('[data-filter-apply]', form); if (a) a.focus({ preventScroll: true }); }
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return;
          busy(false);
          live(root.getAttribute('data-error'));
        });
    }

    function applyFromForm(options) { return apply(currentUrl(), options); }

    /* ---------- Events ---------- */
    function onChange(e) {
      if (!form || !form.contains(e.target)) return;
      if (e.target.matches('input')) applyFromForm();
    }

    function onSubmit(e) {
      if (e.target !== form) return;
      e.preventDefault();
      applyFromForm().then(function () { Theme.drawer.close('filter'); });
    }

    function onClick(e) {
      var target = e.target;
      if (!(target instanceof Element)) return;

      // chips, "clear all" and the empty-state link
      var link = target.closest('[data-filter-link]');
      if (link && root.contains(link) && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0)) {
        e.preventDefault();
        var inDrawer = !!link.closest('[data-filter-drawer]');
        apply(link.href, inDrawer ? { focusApply: true } : { focus: true });
        return;
      }

      var reset = target.closest('[data-sort-reset]');
      if (reset && root.contains(reset)) {
        var def = utils.qs('input[name="sort_by"][value="' + form.getAttribute('data-default-sort') + '"]', form);
        if (def) { def.checked = true; applyFromForm({ focus: true }); }
        return;
      }

      // Toolbar buttons open the shared drawer (theme.js). Remember which group was asked for;
      // it is expanded and focused once the drawer has opened (see the drawer:open listener).
      var opener = target.closest('[data-filter-group][data-drawer-open]');
      if (opener && root.contains(opener)) wantedGroup = opener.getAttribute('data-filter-group');

      // layout toggle
      var toggle = target.closest('[data-layout-toggle]');
      if (toggle && root.contains(toggle)) setLayout(toggle.getAttribute('data-layout-toggle'), true);
    }

    function onPop() { apply(window.location.pathname + window.location.search, { push: false }); }

    /* ---------- Layout toggle (reference behaviour: 2 columns vs configured columns) ---------- */
    function setLayout(mode, remember) {
      var g = grid();
      if (!g) return;
      if (mode === 'large') g.setAttribute('data-layout', 'large'); else g.removeAttribute('data-layout');
      utils.qsa('[data-layout-toggle]', root).forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-layout-toggle') === (mode === 'large' ? 'large' : 'compact') ? 'true' : 'false');
      });
      if (remember) store(LAYOUT_KEY, mode);
    }
    if (utils.qs('[data-layout-toggle]', root)) setLayout(store(LAYOUT_KEY) === 'large' ? 'large' : 'compact', false);

    // After the shared drawer has opened, expand + focus the group the visitor asked for.
    var offOpen = Theme.events.on('drawer:open', function (e) {
      if (e.detail.id !== 'filter' || !form || !wantedGroup) return;
      var group = utils.qs('[data-filter-group="' + wantedGroup + '"]', form);
      wantedGroup = null;
      if (!group) return;
      Theme.disclosure.open(group);
      var trigger = utils.qs('[data-disclosure-trigger]', group);
      if (trigger) trigger.focus({ preventScroll: true });
    });

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onPop);

    return {
      destroy: function () {
        if (controller) controller.abort();
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('submit', onSubmit);
        window.removeEventListener('popstate', onPop);
        offOpen();
      }
    };
  });
})();
