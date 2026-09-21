/* ==========================================================================
   cart-drawer.js — cart drawer behaviour on top of Theme.cart (theme.js).
   - Quantity / remove actions call Theme.cart.change (POST /cart/change.js).
   - After any cart update the drawer content is re-rendered by the server
     through the Section Rendering API (section "cart-drawer"), so markup
     lives only in sections/cart-drawer.liquid.
   - form[data-cart-add] gets a minimal AJAX add-to-cart handler that opens the
     drawer; product forms in later phases can reuse it as-is.
   Loaded only when the theme's cart type is "drawer".
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;
  var events = Theme.events;

  var SECTION_ID = 'cart-drawer';
  var refreshing = null;
  var pendingFocus = null;   // { key } | { heading: true }
  var removedTitle = '';     // announced with the next refresh
  var inlineErrors = 0;      // >0 while a row action reports its own error

  function root() { return utils.qs('[data-drawer="cart"]'); }
  function content() { var r = root(); return r && utils.qs('[data-cart-content]', r); }
  function live(text) { var r = root(), n = r && utils.qs('[data-cart-live]', r); if (n) n.textContent = text || ''; }
  function setBusy(busy) { var c = content(); if (c) c.setAttribute('aria-busy', busy ? 'true' : 'false'); }

  function showError(message) {
    var box = content() && utils.qs('[data-cart-error]', content());
    if (!box) return;
    box.textContent = message || utils.t('cart.error');
    box.hidden = false;
  }

  function findRow(key) {
    return utils.qsa('.cart-item', content() || doc).filter(function (li) { return li.getAttribute('data-key') === key; })[0];
  }

  function restoreFocus() {
    var c = content();
    if (!c || !Theme.drawer.isOpen('cart')) { pendingFocus = null; return; }   // never pull focus into a closed drawer
    var target = null;
    if (pendingFocus && pendingFocus.key) {
      var row = findRow(pendingFocus.key);
      target = row && utils.qs('[data-qty-input]', row);
    }
    if (!target) target = root() && utils.qs('[data-cart-heading]', root());
    pendingFocus = null;
    if (target) target.focus({ preventScroll: true });
  }

  /* Re-render from the server and swap only [data-cart-content]. */
  function refresh() {
    setBusy(true);
    var scroller = content() && utils.qs('.cart-drawer__body', content());
    var scrollTop = scroller ? scroller.scrollTop : 0;

    refreshing = Theme.sections.render(SECTION_ID).then(function (map) {
      var fresh = map[SECTION_ID];
      var next = fresh && utils.qs('[data-cart-content]', fresh);
      var current = content();
      if (!next || !current) throw new Error('cart drawer section missing');
      current.innerHTML = next.innerHTML;
      var body = utils.qs('.cart-drawer__body', current);
      if (body) body.scrollTop = scrollTop;
      Theme.init(current);
      var cart = Theme.cart.state;
      if (cart) {
        var message = utils.t('accessibility.cart_updated', { count: cart.item_count });
        if (removedTitle) message = utils.t('accessibility.item_removed', { title: removedTitle }) + ' ' + message;
        removedTitle = '';
        live(message);
      }
      restoreFocus();
    }).catch(function () {
      showError(utils.t('cart.error'));
    }).then(function () { setBusy(false); });

    return refreshing;
  }

  function changeLine(row, quantity) {
    var key = row.getAttribute('data-key');
    var input = utils.qs('[data-qty-input]', row);
    var previous = input ? input.getAttribute('value') : null;
    var errorNode = utils.qs('[data-line-error]', row);
    if (errorNode) errorNode.hidden = true;

    inlineErrors++;
    pendingFocus = quantity === 0 ? { heading: true } : { key: key };
    if (quantity === 0) removedTitle = row.getAttribute('data-title') || '';
    setBusy(true);

    var done = function () { inlineErrors--; };
    return Theme.cart.change(key, quantity).then(function () { return refreshing; }).then(done, function (err) {
      done();
      // e.g. stock limit: keep the row, restore the old quantity, explain inline
      setBusy(false);
      pendingFocus = null;
      if (input && previous !== null) input.value = previous;
      var text = err.status ? err.message : utils.t('cart.error');
      if (errorNode) { errorNode.textContent = text; errorNode.hidden = false; }
      else showError(text);
    });
  }

  /* ---- Drawer content interactions (delegated: survive re-renders) ---- */
  events.delegate('click', '[data-qty-step]', function (e, btn) {
    var drawer = btn.closest('[data-drawer="cart"]');
    var row = btn.closest('.cart-item');
    if (!drawer || !row) return;
    var input = utils.qs('[data-qty-input]', row);
    var next = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(btn.getAttribute('data-qty-step'), 10));
    input.value = next;
    changeLine(row, next);
  });

  events.delegate('change', '[data-qty-input]', function (e, input) {
    var row = input.closest('.cart-item');
    if (!row || !input.closest('[data-drawer="cart"]')) return;
    var qty = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = qty;
    changeLine(row, qty);
  });

  events.delegate('click', '[data-cart-remove]', function (e, link) {
    var row = link.closest('.cart-item');
    if (!row || !link.closest('[data-drawer="cart"]')) return;
    e.preventDefault();
    changeLine(row, 0);
  });

  // Order note: saved silently (no re-render, so typing is never interrupted)
  events.delegate('change', '[data-cart-note]', function (e, textarea) {
    var url = ((Theme.config.routes || {}).cart_update_url || '/cart/update') + '.js';
    utils.fetchJSON(url, { method: 'POST', body: { note: textarea.value } }).catch(function () { showError(); });
  });

  // Enter inside the quantity field must not submit the checkout form
  events.delegate('keydown', '[data-qty-input]', function (e, input) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });

  /* ---- Cart layer events ---- */
  events.on('cart:updated', function () {
    if (!root()) return;
    var err = content() && utils.qs('[data-cart-error]', content());
    if (err) err.hidden = true;
    refresh();
  });

  events.on('cart:added', function () {
    (refreshing || Promise.resolve()).then(function () { Theme.drawer.open('cart'); });
  });

  events.on('cart:error', function (e) {
    if (inlineErrors === 0 && Theme.drawer.isOpen('cart')) showError(e.detail.message);
  });

  /* ---- Minimal AJAX add-to-cart: <form data-cart-add> (used by later phases) ---- */
  events.delegate('submit', 'form[data-cart-add]', function (e, form) {
    if (!root()) return;
    e.preventDefault();
    var button = utils.qs('[type="submit"]', form);
    var errorBox = utils.qs('[data-cart-add-error]', form) || utils.qs('[data-cart-add-error]', form.closest('[data-product-card], [data-component~="product-details"]') || form);
    if (button) { button.setAttribute('aria-busy', 'true'); button.disabled = true; }
    if (errorBox) errorBox.hidden = true;

    // Option pickers only drive the variant id; they are not cart fields.
    var data = new FormData(form);
    Array.from(data.keys()).forEach(function (key) { if (key.indexOf('option-') === 0) data.delete(key); });

    Theme.cart.add(data).catch(function (err) {
      if (errorBox) { errorBox.textContent = err.status ? err.message : utils.t('cart.error'); errorBox.hidden = false; }
    }).then(function () {
      if (button) { button.removeAttribute('aria-busy'); button.disabled = false; }
    });
  });
})();
