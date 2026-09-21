/* ==========================================================================
   cart-page.js — behaviour of the cart page (sections/main-cart.liquid).
   Uses the shared cart layer from theme.js (Theme.cart -> Shopify Ajax Cart API), so the
   page and the cart drawer always show the same cart:
   - quantity buttons / typing / remove -> Theme.cart.change(); the section is then
     re-rendered through the Section Rendering API (the server stays the source of truth);
   - any "cart:updated" (for example from the drawer) also refreshes the page;
   - order note is saved silently through Theme.cart.update().
   Quantity rules (min / increment) from data-rule-*: stepping below the minimum removes
   the line. Without JavaScript the form posts to the cart route and everything still works.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;
  var events = Theme.events;
  var pending = 0;       // >0 while this page runs its own change (its refresh is handled there)
  var pendingFocus = null;

  function root() { return utils.qs('[data-component~="cart-page"]'); }
  function content() { var r = root(); return r && utils.qs('[data-cart-page-content]', r); }
  function live(text) { var r = root(), n = r && utils.qs('[data-cart-live]', r); if (n) n.textContent = text || ''; }
  function showError(message) {
    var c = content(), box = c && utils.qs('[data-cart-error]', c);
    if (!box) return;
    box.textContent = message || utils.t('cart.error');
    box.hidden = false;
  }

  function refresh() {
    var r = root(), c = content();
    if (!r || !c) return Promise.resolve();
    var id = r.getAttribute('data-section-id');
    c.setAttribute('aria-busy', 'true');
    return Theme.sections.render(id).then(function (map) {
      var fresh = map[id] && utils.qs('[data-cart-page-content]', map[id]);
      if (!fresh) throw new Error('cart page section missing');
      Theme.destroy(c);
      c.innerHTML = fresh.innerHTML;
      Theme.init(c);
      var count = utils.qs('.main-cart__count', r);
      var freshCount = utils.qs('.main-cart__count', map[id]);
      if (count && freshCount) count.textContent = freshCount.textContent;
      else if (count && !freshCount) count.remove();
      var cart = Theme.cart.state;
      if (cart) live(utils.t('accessibility.cart_updated', { count: cart.item_count }));
      var target = null;
      if (pendingFocus && pendingFocus.key) {
        var row = utils.qsa('.cart-item', c).filter(function (li) { return li.getAttribute('data-key') === pendingFocus.key; })[0];
        target = row && utils.qs('[data-qty-input]', row);
      }
      if (!target) target = utils.qs('.main-cart__title', r) || null;
      pendingFocus = null;
      if (target) { if (!target.hasAttribute('tabindex') && target.tagName !== 'INPUT') target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    }).catch(function () { showError(utils.t('cart.error')); })
      .then(function () { c.setAttribute('aria-busy', 'false'); });
  }

  function snap(value, min, step) {
    if (value <= 0) return 0;
    if (value < min) return 0;                       // below the minimum order quantity: remove
    var offset = (value - min) % step;
    return offset ? value - offset : value;          // stay on the increment
  }

  function changeLine(row, quantity) {
    var key = row.getAttribute('data-key');
    var input = utils.qs('[data-qty-input]', row);
    var previous = input ? input.getAttribute('value') : null;
    var errorNode = utils.qs('[data-line-error]', row);
    if (errorNode) errorNode.hidden = true;
    pending++;
    pendingFocus = quantity === 0 ? null : { key: key };
    var c = content(); if (c) c.setAttribute('aria-busy', 'true');
    return Theme.cart.change(key, quantity).then(function () { return refresh(); }).catch(function (err) {
      if (c) c.setAttribute('aria-busy', 'false');
      pendingFocus = null;
      if (input && previous !== null) input.value = previous;
      var text = err && err.status ? err.message : utils.t('cart.error');
      if (errorNode) { errorNode.textContent = text; errorNode.hidden = false; } else showError(text);
    }).then(function () { pending--; });
  }

  function rowOf(el) { return el.closest('.cart-item'); }
  function inPage(el) { var r = root(); return r && r.contains(el); }

  events.delegate('click', '[data-qty-step]', function (e, btn) {
    if (!inPage(btn)) return;
    var row = rowOf(btn), input = row && utils.qs('[data-qty-input]', row);
    if (!input) return;
    var min = parseInt(input.getAttribute('data-rule-min'), 10) || 1;
    var step = parseInt(input.getAttribute('data-rule-step'), 10) || 1;
    var dir = parseInt(btn.getAttribute('data-qty-step'), 10);
    var current = parseInt(input.value, 10) || 0;
    var next = dir > 0 ? (current < min ? min : current + step) : (current - step < min ? 0 : current - step);
    var max = input.getAttribute('max') ? parseInt(input.getAttribute('max'), 10) : null;
    if (max !== null && next > max) return;
    input.value = next;
    changeLine(row, next);
  });

  events.delegate('change', '[data-qty-input]', function (e, input) {
    if (!inPage(input)) return;
    var row = rowOf(input);
    var min = parseInt(input.getAttribute('data-rule-min'), 10) || 1;
    var step = parseInt(input.getAttribute('data-rule-step'), 10) || 1;
    var qty = snap(Math.max(0, parseInt(input.value, 10) || 0), min, step);
    input.value = qty;
    changeLine(row, qty);
  });

  events.delegate('keydown', '[data-qty-input]', function (e, input) {
    if (inPage(input) && e.key === 'Enter') { e.preventDefault(); input.blur(); }   // Enter must not submit the checkout form
  });

  events.delegate('click', '[data-cart-remove]', function (e, link) {
    if (!inPage(link)) return;
    e.preventDefault();
    changeLine(rowOf(link), 0);
  });

  events.delegate('change', '[data-cart-note]', function (e, area) {
    if (!inPage(area)) return;
    var url = ((Theme.config.routes || {}).cart_update_url || '/cart/update') + '.js';
    utils.fetchJSON(url, { method: 'POST', body: { note: area.value } }).catch(function () { showError(); });
  });

  // Cart changed elsewhere (cart drawer, another tab through a reload…): show the same cart here.
  events.on('cart:updated', function () { if (root() && pending === 0) refresh(); });
})();
