/* ==========================================================================
   product.js — product purchase UI shared by the product page, the featured
   product section and the quick-add drawer.
   - "product-details" component: variant selection (any options, any number),
     valid-selection guard, price / badges / unit price / SKU / stock / quantity
     rules / button / payment button / gallery sync, screen-reader announcements.
   - Quantity stepper rules (min, max, increment).
   - Image lightbox (native <dialog> through Theme.modal) with previous/next.
   - Quick add: multi-variant product cards open the quick-add drawer, whose
     content is rendered server-side (Section Rendering API).
   Adding to cart itself is handled by assets/cart-drawer.js (form[data-cart-add]).
   Markup contract: snippets/product-options, product-quantity, product-buy-buttons,
   product-variants-json, product-gallery.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;
  var events = Theme.events;

  function text(node, value) { if (node) node.textContent = value; }

  /* ---------- Quantity rules ---------- */
  function normalizeQuantity(value, min, max, step) {
    var n = parseInt(value, 10);
    if (isNaN(n)) n = min;
    if (n < min) n = min;
    if (max != null && n > max) n = max;
    var offset = (n - min) % step;
    if (offset > 0) n -= offset;            // snap down to the increment
    return Math.max(n, min);
  }

  /* ---------- Variant selection ---------- */
  Theme.component('product-details', function (root) {
    var dataNode = utils.qs('script[data-variants]', root);
    if (!dataNode) return;

    var variants = [];
    try { variants = JSON.parse(dataNode.textContent); } catch (e) { return; }
    if (!variants.length) return;

    var idInput = utils.qs('[data-variant-id]', root);
    var button = utils.qs('[data-add-button]', root);
    var label = utils.qs('[data-add-label]', root);
    var payment = utils.qs('[data-payment-button]', root);
    var live = utils.qs('[data-variant-live]', root);
    var qtyInput = utils.qs('[data-product-qty]', root);
    var qtyField = utils.qs('[data-quantity-field]', root);
    var qtyHint = utils.qs('[data-qty-hint]', root);
    var gallery = utils.qs('[data-gallery]', root);
    var updateUrl = root.getAttribute('data-update-url') === 'true';
    var inputs = utils.qsa('[data-option-input]', root);
    var groups = {};
    inputs.forEach(function (input) {
      var index = input.closest('[data-option-index]').getAttribute('data-option-index');
      (groups[index] = groups[index] || []).push(input);
    });
    var optionIndexes = Object.keys(groups).sort(function (a, b) { return a - b; });
    var current = null;

    // JS is running: the hidden id input (disabled for no-JS fallback) becomes the source of truth.
    if (idInput) idInput.disabled = false;

    /* -- reading / writing the selection -- */
    function selection() {
      return optionIndexes.map(function (index) {
        var group = groups[index];
        if (group[0].tagName === 'SELECT') return group[0].value;
        var checked = group.filter(function (i) { return i.checked; })[0];
        return checked ? checked.value : null;
      });
    }

    function applySelection(values) {
      optionIndexes.forEach(function (index, position) {
        var group = groups[index];
        if (group[0].tagName === 'SELECT') { group[0].value = values[position]; return; }
        group.forEach(function (input) { input.checked = input.value === values[position]; });
      });
    }

    function match(values) {
      return variants.filter(function (v) {
        return v.options.every(function (opt, i) { return values[i] === opt; });
      })[0];
    }

    // The customer changed option `position`. If that value does not exist together with the other
    // current choices, move to the closest real variant (keeping as many other choices as possible).
    function resolve(position) {
      var values = selection();
      var exact = match(values);
      if (exact) return exact;
      var best = null, bestScore = -1;
      variants.forEach(function (candidate) {
        if (candidate.options[position] !== values[position]) return;
        var score = 0;
        candidate.options.forEach(function (opt, i) { if (i !== position && opt === values[i]) score += 10; });
        if (candidate.available) score += 1;
        if (score > bestScore) { best = candidate; bestScore = score; }
      });
      if (best) applySelection(best.options);
      return best;
    }

    /* -- option availability marks (sold out vs. combination does not exist) -- */
    function markAvailability() {
      var values = selection();
      optionIndexes.forEach(function (index, position) {
        var group = groups[index];
        group.forEach(function (input) {
          var probe = values.slice();
          var isSelect = input.tagName === 'SELECT';
          var options = isSelect ? utils.qsa('option', input) : [input];
          options.forEach(function (node) {
            probe[position] = node.value;
            var candidate = match(probe);
            var state = !candidate ? 'missing' : (candidate.available ? '' : 'sold-out');
            if (isSelect) {
              var base = node.getAttribute('data-value-label') || node.textContent;
              node.textContent = state === 'missing' ? utils.t('products.option_unavailable', { value: base })
                : state === 'sold-out' ? utils.t('products.option_sold_out', { value: base }) : base;
              return;
            }
            node.toggleAttribute('data-missing', state === 'missing');
            node.toggleAttribute('data-sold-out', state === 'sold-out');
            var note = node.nextElementSibling && utils.qs('[data-option-note]', node.nextElementSibling);
            if (note) note.textContent = state === 'missing' ? ' (' + utils.t('products.note_missing') + ')'
              : state === 'sold-out' ? ' (' + utils.t('products.note_sold_out') + ')' : '';
          });
        });
        var shown = utils.qs('[data-option-index="' + index + '"] [data-option-selected]', root);
        if (shown) text(shown, values[position]);
      });
    }

    /* -- price area -- */
    function renderPrice(variant) {
      var price = utils.qs('[data-price]', root);
      if (price && variant.price_html) {
        var tpl = doc.createElement('template');
        tpl.innerHTML = variant.price_html.trim();
        var fresh = tpl.content.firstElementChild;
        if (fresh) price.replaceWith(fresh);
      }
      var buttonPrice = utils.qs('[data-add-price]', root);
      if (buttonPrice && variant.price_html) {
        var tmp = doc.createElement('template');
        tmp.innerHTML = variant.price_html.trim();
        var current = tmp.content.querySelector('.price__current');
        if (current) {
          utils.qsa('.visually-hidden', current).forEach(function (n) { n.remove(); });
          buttonPrice.textContent = current.textContent.replace(/\s+/g, ' ').trim();
        }
        buttonPrice.hidden = !variant.available;
      }
      var block = utils.qs('[data-price-block]', root);
      var badges = utils.qs('[data-price-badges]', root);
      if (block && badges) {
        var style = block.getAttribute('data-sale-style');
        var soldOut = block.getAttribute('data-show-soldout') === 'true';
        badges.textContent = '';
        var badge = null;
        if (!variant.available && soldOut) {
          badge = doc.createElement('span'); badge.className = 'badge badge--muted'; badge.textContent = utils.t('products.sold_out');
        } else if (variant.on_sale && style === 'percent') {
          badge = doc.createElement('span'); badge.className = 'badge badge--sale'; badge.textContent = utils.t('products.sale_percent', { percent: variant.percent });
        } else if (variant.on_sale && style === 'text') {
          badge = doc.createElement('span'); badge.className = 'badge badge--sale'; badge.textContent = utils.t('products.sale');
        }
        if (badge) badges.appendChild(badge);
      }
      var unit = utils.qs('[data-unit-price]', root);
      if (unit) { unit.innerHTML = variant.unit_html || ''; unit.hidden = !variant.unit_html; }
    }

    function renderIdentity(variant) {
      var skuBlock = utils.qs('[data-sku-block]', root);
      if (!skuBlock) return;
      var sku = utils.qs('[data-sku]', skuBlock), skuWrap = utils.qs('[data-sku-wrap]', skuBlock);
      var code = utils.qs('[data-barcode]', skuBlock), codeWrap = utils.qs('[data-barcode-wrap]', skuBlock);
      text(sku, variant.sku || ''); if (skuWrap) skuWrap.hidden = !variant.sku;
      text(code, variant.barcode || ''); if (codeWrap) codeWrap.hidden = !variant.barcode;
      skuBlock.hidden = !variant.sku && !(codeWrap && variant.barcode);
    }

    function renderInventory(variant) {
      var node = utils.qs('[data-inventory]', root);
      if (!node) return;
      var threshold = parseInt(node.getAttribute('data-threshold'), 10) || 0;
      var showCount = node.getAttribute('data-show-count') === 'true';
      var state = 'in', message;
      if (!variant.available) { state = 'out'; message = utils.t('products.out_of_stock'); }
      else if (variant.tracked && variant.stock != null && threshold > 0 && variant.stock > 0 && variant.stock <= threshold) {
        state = 'low'; message = utils.t('products.low_stock', { count: variant.stock });
      } else if (showCount && variant.tracked && variant.stock > 0) message = utils.t('products.in_stock_count', { count: variant.stock });
      else message = utils.t('products.in_stock');
      node.setAttribute('data-state', state);
      text(utils.qs('[data-inventory-text]', node), message);
    }

    /* -- quantity: rules follow the selected variant -- */
    function quantityRules(variant) {
      var min = variant.qty_min || 1, step = variant.qty_step || 1, max = variant.qty_max;
      var limit = !qtyField || qtyField.getAttribute('data-limit-stock') === 'true';
      if (limit && variant.tracked && variant.policy === 'deny' && variant.stock != null) {
        var stock = Math.max(0, variant.stock);
        if (max == null || stock < max) max = stock;
      }
      return { min: min, step: step, max: max };
    }

    function syncQuantityButtons() {
      if (!qtyInput) return;
      var min = parseInt(qtyInput.min, 10) || 1, step = parseInt(qtyInput.step, 10) || 1;
      var max = qtyInput.max === '' ? null : parseInt(qtyInput.max, 10);
      var value = parseInt(qtyInput.value, 10) || min;
      utils.qsa('[data-product-qty-step]', root).forEach(function (btn) {
        var dir = parseInt(btn.getAttribute('data-product-qty-step'), 10);
        var blocked = dir < 0 ? value - step < min : (max != null && value + step > max);
        btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
      });
    }

    function renderQuantity(variant) {
      if (!qtyInput) return;
      var rules = quantityRules(variant);
      qtyInput.min = rules.min;
      qtyInput.step = rules.step;
      if (rules.max != null) qtyInput.max = rules.max; else qtyInput.removeAttribute('max');
      qtyInput.value = normalizeQuantity(qtyInput.value, rules.min, rules.max, rules.step);
      if (qtyHint) {
        var parts = [];
        if (rules.min > 1) parts.push(utils.t('products.quantity_min', { count: rules.min }));
        if (rules.step > 1) parts.push(utils.t('products.quantity_step', { count: rules.step }));
        if (rules.max != null) parts.push(utils.t('products.quantity_max', { count: rules.max }));
        qtyHint.textContent = parts.join(' ');
        qtyHint.hidden = !parts.length;
      }
      syncQuantityButtons();
    }

    /* -- buttons, media, url, announcement -- */
    function renderButtons(variant) {
      if (button) {
        button.disabled = !variant.available;
        text(label, variant.available ? button.getAttribute('data-label-add') : button.getAttribute('data-label-sold-out'));
      }
      if (payment) payment.hidden = !variant.available;
    }

    function renderMedia(variant, silent) {
      if (!gallery || !variant.media) return;
      var slides = utils.qsa('[data-media-id]', gallery);
      var slideIndex = -1;
      slides.forEach(function (slide, i) { if (slide.getAttribute('data-media-id') === String(variant.media)) slideIndex = i; });
      if (slideIndex < 0) return;
      gallery.dispatchEvent(new CustomEvent('carousel:goto', { detail: { index: slideIndex, instant: silent } }));
      // Stacked desktop layout: media are laid out one after another, so bring the image into view instead.
      if (!silent && gallery.classList.contains('gallery--stacked') && window.matchMedia('(min-width: 1024px)').matches) {
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        slides[slideIndex].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      }
    }

    function renderUrl(variant) {
      if (!updateUrl || !window.history || !history.replaceState) return;
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      history.replaceState(null, '', url.toString());
    }

    function announce(variant) {
      if (!live) return;
      var priceNode = utils.qs('[data-price] .price__current', root);
      live.textContent = utils.t('products.variant_updated', {
        price: priceNode ? priceNode.textContent.replace(/\s+/g, ' ').trim() : '',
        availability: variant.available ? utils.t('products.in_stock') : utils.t('products.sold_out')
      });
    }

    function render(variant, initial) {
      current = variant;
      if (!variant) {
        // No variant matches the selection (only reachable through a stale URL): block purchase, say why.
        if (button) { button.disabled = true; text(label, button.getAttribute('data-label-unavailable')); }
        if (idInput) idInput.disabled = true;
        if (payment) payment.hidden = true;
        var badges = utils.qs('[data-price-badges]', root);
        if (badges) {
          badges.textContent = '';
          var badge = doc.createElement('span'); badge.className = 'badge badge--muted'; badge.textContent = utils.t('products.unavailable');
          badges.appendChild(badge);
        }
        return;
      }
      if (idInput) {
        idInput.disabled = false;
        if (String(idInput.value) !== String(variant.id)) {
          idInput.value = variant.id;
          idInput.dispatchEvent(new Event('change', { bubbles: true }));   // lets Shopify's payment button follow the variant
        }
      }
      renderPrice(variant);
      renderIdentity(variant);
      renderInventory(variant);
      renderQuantity(variant);
      renderButtons(variant);
      if (!initial) { renderMedia(variant); renderUrl(variant); announce(variant); }
    }

    /* -- events -- */
    function onChange(e) {
      var input = e.target.closest && e.target.closest('[data-option-input]');
      if (!input || !root.contains(input)) return;
      var position = optionIndexes.indexOf(input.closest('[data-option-index]').getAttribute('data-option-index'));
      render(resolve(position));
      markAvailability();
    }

    function onClick(e) {
      var step = e.target.closest && e.target.closest('[data-product-qty-step]');
      if (!step || !qtyInput || !root.contains(step)) return;
      e.preventDefault();
      var min = parseInt(qtyInput.min, 10) || 1, stepSize = parseInt(qtyInput.step, 10) || 1;
      var max = qtyInput.max === '' ? null : parseInt(qtyInput.max, 10);
      var value = normalizeQuantity(qtyInput.value, min, max, stepSize);
      var next = value + parseInt(step.getAttribute('data-product-qty-step'), 10) * stepSize;
      qtyInput.value = normalizeQuantity(next, min, max, stepSize);
      syncQuantityButtons();
    }

    function onQtyChange() {
      var min = parseInt(qtyInput.min, 10) || 1, step = parseInt(qtyInput.step, 10) || 1;
      var max = qtyInput.max === '' ? null : parseInt(qtyInput.max, 10);
      qtyInput.value = normalizeQuantity(qtyInput.value, min, max, step);
      syncQuantityButtons();
    }

    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    if (qtyInput && qtyInput.type === 'number') qtyInput.addEventListener('change', onQtyChange);

    // Initial state: the server already rendered the selected variant; align the derived UI with it.
    var initial = optionIndexes.length ? match(selection()) : variants[0];
    if (initial) render(initial, true); else render(resolve(0), true);
    markAvailability();

    return {
      destroy: function () {
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
        if (qtyInput) qtyInput.removeEventListener('change', onQtyChange);
      }
    };
  });

  /* ---------- Image lightbox ----------
     Trigger: [data-zoom-open] (data-zoom-src / data-zoom-alt) inside a [data-gallery].
     Dialog : dialog[data-modal] with [data-zoom-image], optional [data-zoom-prev|next|counter]. */
  function showZoom(dialog, index) {
    var state = dialog.__zoom;
    if (!state || !state.items.length) return;
    var total = state.items.length;
    state.index = (index + total) % total;
    var item = state.items[state.index];
    var image = utils.qs('[data-zoom-image]', dialog);
    image.src = item.getAttribute('data-zoom-src');
    image.alt = item.getAttribute('data-zoom-alt') || '';
    text(utils.qs('[data-zoom-counter]', dialog), utils.t('carousel.slide_of', { current: state.index + 1, total: total }));
    // keep the page's gallery on the image being viewed
    var slide = item.closest('[data-carousel-slide]');
    if (state.gallery && slide) {
      var slides = utils.qsa('[data-carousel-slide]', state.gallery);
      state.gallery.dispatchEvent(new CustomEvent('carousel:goto', { detail: { index: slides.indexOf(slide), instant: true } }));
    }
  }

  events.delegate('click', '[data-zoom-open]', function (e, trigger) {
    var scope = trigger.closest('section') || doc;
    var dialog = utils.qs('dialog[data-modal]', scope);
    var image = dialog && utils.qs('[data-zoom-image]', dialog);
    if (!dialog || !image) return;
    var gallery = trigger.closest('[data-gallery]');
    var items = gallery ? utils.qsa('[data-zoom-open]', gallery) : [trigger];
    dialog.__zoom = { items: items, index: Math.max(0, items.indexOf(trigger)), gallery: gallery };
    showZoom(dialog, dialog.__zoom.index);
    Theme.modal.open(dialog.getAttribute('data-modal'));
  });

  events.delegate('click', '[data-zoom-prev], [data-zoom-next]', function (e, btn) {
    var dialog = btn.closest('dialog');
    if (dialog && dialog.__zoom) showZoom(dialog, dialog.__zoom.index + (btn.hasAttribute('data-zoom-next') ? 1 : -1));
  });

  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var dialog = utils.qs('dialog[data-modal][open]');
    if (!dialog || !dialog.__zoom || dialog.__zoom.items.length < 2) return;
    e.preventDefault();
    showZoom(dialog, dialog.__zoom.index + (e.key === 'ArrowRight' ? 1 : -1));
  });

  // Swipe between images inside the lightbox (touch and pen)
  (function () {
    var startX = null, startY = 0;
    doc.addEventListener('pointerdown', function (e) {
      var img = e.target instanceof Element && e.target.closest('dialog[data-modal][open] [data-zoom-image]');
      if (img && e.pointerType !== 'mouse') { startX = e.clientX; startY = e.clientY; } else startX = null;
    });
    doc.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      var dialog = utils.qs('dialog[data-modal][open]');
      if (!dialog || !dialog.__zoom || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      showZoom(dialog, dialog.__zoom.index + (dx < 0 ? 1 : -1));
    });
  })();

  /* ---------- Quick add drawer (multi-variant products) ---------- */
  events.delegate('click', '[data-quick-add]', function (e, link) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;   // let "open in new tab" work
    var drawer = utils.qs('[data-drawer="quick-add"]');
    var content = drawer && utils.qs('[data-quick-add-content]', drawer);
    if (!drawer || !content) return;            // no drawer (page cart): follow the link
    e.preventDefault();

    content.innerHTML = '';
    content.setAttribute('aria-busy', 'true');
    Theme.drawer.open('quick-add', link);

    var url = new URL(link.getAttribute('data-quick-add'), window.location.origin);
    url.searchParams.set('sections', 'quick-add');
    var token = url.toString();
    content.setAttribute('data-request', token);

    // No Accept header: 'application/json' makes a product URL return the product JSON instead of the section.
    fetch(token)
      .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.json(); })
      .then(function (json) {
        if (content.getAttribute('data-request') !== token) return;    // a newer request superseded this one
        var tpl = doc.createElement('template');
        tpl.innerHTML = json['quick-add'] || '';
        var fresh = utils.qs('[data-quick-add-content]', tpl.content);
        if (!fresh || !fresh.children.length) throw new Error('empty');
        content.innerHTML = fresh.innerHTML;
        Theme.init(content);
      })
      .catch(function () {
        if (content.getAttribute('data-request') !== token) return;
        var p = doc.createElement('p');
        p.className = 'message message--error';
        p.setAttribute('role', 'alert');
        p.textContent = utils.t('cart.error');
        content.innerHTML = '';
        content.appendChild(p);
      })
      .then(function () { if (content.getAttribute('data-request') === token) content.setAttribute('aria-busy', 'false'); });
  });
})();
