/* ==========================================================================
   theme.js — lightweight JavaScript core (original implementation)

   Architecture
   - One global namespace: window.Theme
   - Behaviour is attached by data attributes and document-level event
     delegation, so it survives Shopify section re-renders untouched.
   - Per-element behaviour uses a tiny component registry
     (Theme.component / data-component="name") that is initialised on load and
     re-initialised on the theme editor's shopify:section:* events.
   - Modules: utils, events, mq, scrollLock, drawer, modal, disclosure,
     sections (Section Rendering API), cart (Cart AJAX API).

   Markup contracts are documented next to the CSS in assets/components.css.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* ---------- Config (emitted by layout/theme.liquid) ---------- */
  function readConfig() {
    var node = doc.getElementById('theme-config');
    if (!node) return {};
    try { return JSON.parse(node.textContent); } catch (e) { return {}; }
  }

  var Theme = window.Theme = window.Theme || {};
  Theme.config = readConfig();
  Theme.breakpoints = { small: 500, medium: 768, large: 1024 };

  /* ---------- utils ---------- */
  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    'summary', '[contenteditable="true"]'
  ].join(',');

  var utils = Theme.utils = {
    qs: function (sel, scope) { return (scope || doc).querySelector(sel); },
    qsa: function (sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); },

    debounce: function (fn, wait) {
      var t;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    },

    /* Elements that can really receive focus (skips display:none, visibility:hidden and inert branches). */
    isVisible: function (el) {
      if (el.closest('[inert]')) return false;
      if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
      return el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    },

    focusable: function (container) {
      return utils.qsa(FOCUSABLE, container).filter(function (el) {
        return el === doc.activeElement || utils.isVisible(el);
      });
    },

    /* Keep Tab/Shift+Tab inside `container`. Returns a release function. */
    trapFocus: function (container) {
      function onKeydown(e) {
        if (e.key !== 'Tab') return;
        var items = utils.focusable(container);
        if (!items.length) { e.preventDefault(); container.focus(); return; }
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (doc.activeElement === first || doc.activeElement === container)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
      container.addEventListener('keydown', onKeydown);
      return function release() { container.removeEventListener('keydown', onKeydown); };
    },

    /* Locale-aware money formatting from integer minor units (cents). */
    formatMoney: function (cents) {
      var c = Theme.config.currency || {};
      try {
        return new Intl.NumberFormat(c.locale || undefined, {
          style: 'currency', currency: c.code || 'USD'
        }).format(cents / 100);
      } catch (e) {
        return (cents / 100).toFixed(2);
      }
    },

    /* Tiny translation lookup: Theme.config.strings.cart.error -> utils.t('cart.error') */
    t: function (key, vars) {
      var str = key.split('.').reduce(function (o, k) { return o && o[k]; }, Theme.config.strings || {});
      if (typeof str !== 'string') return key;
      // Placeholders arrive as [[ name ]] (from Liquid) or {{ name }} (plain locale text).
      return str.replace(/(?:\{\{|\[\[)\s*(\w+)\s*(?:\}\}|\]\])/g, function (m, name) {
        return vars && vars[name] != null ? vars[name] : '';
      });
    },

    /* fetch wrapper: JSON in/out, throws Error(message) on non-2xx. */
    fetchJSON: function (url, options) {
      options = options || {};
      var headers = { 'Accept': 'application/json' };
      if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      options.headers = Object.assign(headers, options.headers);
      return fetch(url, options).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.description || data.message || data.error || res.statusText);
            err.status = res.status; err.data = data;
            throw err;
          }
          return data;
        });
      });
    }
  };

  /* ---------- events ---------- */
  var events = Theme.events = {
    /* Custom events are namespaced "theme:*" and dispatched on document. */
    emit: function (name, detail) {
      doc.dispatchEvent(new CustomEvent('theme:' + name, { detail: detail || {}, bubbles: false }));
    },
    on: function (name, handler) {
      var type = 'theme:' + name;
      doc.addEventListener(type, handler);
      return function off() { doc.removeEventListener(type, handler); };
    },
    /* Delegated listener: handler(event, matchedElement) */
    delegate: function (type, selector, handler, scope) {
      (scope || doc).addEventListener(type, function (e) {
        var target = e.target instanceof Element ? e.target.closest(selector) : null;
        if (target && (scope || doc).contains(target)) handler(e, target);
      });
    }
  };

  /* ---------- responsive utilities ---------- */
  var bp = Theme.breakpoints;
  var queries = {
    mobile: '(max-width: ' + (bp.medium - 1) + 'px)',
    tablet: '(min-width: ' + bp.medium + 'px) and (max-width: ' + (bp.large - 1) + 'px)',
    desktop: '(min-width: ' + bp.large + 'px)',
    touch: '(hover: none)',
    reducedMotion: '(prefers-reduced-motion: reduce)'
  };
  Theme.mq = {
    matches: function (name) { return window.matchMedia(queries[name] || name).matches; },
    /* Calls handler(matches) whenever the query flips. Returns an off function. */
    on: function (name, handler) {
      var mql = window.matchMedia(queries[name] || name);
      var listener = function (e) { handler(e.matches); };
      if (mql.addEventListener) mql.addEventListener('change', listener);
      else mql.addListener(listener);
      return function off() {
        if (mql.removeEventListener) mql.removeEventListener('change', listener);
        else mql.removeListener(listener);
      };
    }
  };

  /* ---------- scroll lock (reference counted) ---------- */
  var lockCount = 0;
  Theme.scrollLock = {
    lock: function () {
      if (lockCount++ === 0) {
        var gap = window.innerWidth - root.clientWidth;
        root.style.setProperty('--scrollbar-compensation', gap + 'px');
        root.classList.add('scroll-locked');
      }
    },
    unlock: function () {
      if (lockCount > 0 && --lockCount === 0) {
        root.classList.remove('scroll-locked');
        root.style.removeProperty('--scrollbar-compensation');
      }
    }
  };

  /* ---------- component registry ----------
     Theme.component('name', function (el) { ...; return { destroy: fn } })
     Markup: <div data-component="name">. An element may list several names. */
  var registry = {};
  var instances = new WeakMap();

  Theme.component = function (name, factory) {
    registry[name] = factory;
    if (doc.readyState !== 'loading') Theme.init(doc);   // late registration
  };

  Theme.init = function (scope) {
    scope = scope || doc;
    var nodes = utils.qsa('[data-component]', scope);
    if (scope.nodeType === 1 && scope.hasAttribute && scope.hasAttribute('data-component')) nodes.unshift(scope);
    nodes.forEach(function (el) {
      var made = instances.get(el) || {};
      el.getAttribute('data-component').split(/\s+/).forEach(function (name) {
        if (!name || made[name] || !registry[name]) return;
        try { made[name] = registry[name](el) || {}; } catch (e) { console.error('[theme] component "' + name + '" failed', e); }
      });
      instances.set(el, made);
    });
  };

  Theme.destroy = function (scope) {
    scope = scope || doc;
    var nodes = utils.qsa('[data-component]', scope);
    if (scope.nodeType === 1 && scope.hasAttribute && scope.hasAttribute('data-component')) nodes.unshift(scope);
    nodes.forEach(function (el) {
      var made = instances.get(el);
      if (!made) return;
      Object.keys(made).forEach(function (name) {
        if (made[name] && typeof made[name].destroy === 'function') made[name].destroy();
      });
      instances.delete(el);
    });
  };

  /* ---------- drawer ----------
     Triggers : [data-drawer-open="id"]  [data-drawer-toggle="id"]  [data-drawer-close]
     Panels   : [data-drawer="id"]  (+ data-side="left|right|top")
     Overlay  : [data-overlay]
     Focus    : [data-drawer-focus] inside the panel is focused first. */
  var drawerState = { active: null, release: null, returnTo: null };

  function drawerEl(id) { return utils.qs('[data-drawer="' + id + '"]'); }
  function overlayEl() { return utils.qs('[data-overlay]'); }
  function syncTriggers(id, expanded) {
    utils.qsa('[data-drawer-open="' + id + '"], [data-drawer-toggle="' + id + '"]').forEach(function (t) {
      t.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  Theme.drawer = {
    isOpen: function (id) { return id ? drawerState.active === id : drawerState.active !== null; },

    open: function (id, trigger) {
      var el = drawerEl(id);
      if (!el) return false;
      if (drawerState.active === id) return true;

      var returnTo = trigger || doc.activeElement;
      if (drawerState.active) {
        // Switching drawers (e.g. menu -> search): if the trigger lives inside the
        // drawer being closed, keep the original opener as the focus target.
        // (also when nothing sensible is focused, e.g. a button that was disabled while submitting)
        var previous = drawerEl(drawerState.active);
        if (previous && (returnTo === doc.body || (returnTo && previous.contains(returnTo)))) returnTo = drawerState.returnTo;
        Theme.drawer.close(drawerState.active, { restoreFocus: false });
      }

      // Focus already inside the panel being opened is not a valid place to return to.
      if (returnTo && el.contains(returnTo)) returnTo = null;

      drawerState.active = id;
      drawerState.returnTo = returnTo;
      el.setAttribute('data-open', 'true');
      var overlay = overlayEl();
      if (overlay) overlay.setAttribute('data-visible', 'true');
      Theme.scrollLock.lock();
      syncTriggers(id, true);
      drawerState.release = utils.trapFocus(el);

      // Panels become visible with a 0s visibility transition, so focus works right away.
      (utils.qs('[data-drawer-focus]', el) || el).focus({ preventScroll: true });
      events.emit('drawer:open', { id: id, element: el });
      return true;
    },

    close: function (id, options) {
      id = id || drawerState.active;
      var el = id && drawerEl(id);
      if (!el || drawerState.active !== id) return false;
      options = options || {};

      el.setAttribute('data-open', 'false');
      var overlay = overlayEl();
      if (overlay) overlay.setAttribute('data-visible', 'false');
      Theme.scrollLock.unlock();
      syncTriggers(id, false);
      if (drawerState.release) drawerState.release();

      var returnTo = drawerState.returnTo;
      drawerState.active = drawerState.release = drawerState.returnTo = null;
      if (options.restoreFocus !== false && returnTo && returnTo.focus && doc.contains(returnTo)) returnTo.focus();
      events.emit('drawer:close', { id: id, element: el });
      return true;
    },

    toggle: function (id, trigger) {
      return drawerState.active === id ? Theme.drawer.close(id) : Theme.drawer.open(id, trigger);
    }
  };

  events.delegate('click', '[data-drawer-open]', function (e, t) {
    if (Theme.drawer.open(t.getAttribute('data-drawer-open'), t)) e.preventDefault();
  });
  events.delegate('click', '[data-drawer-toggle]', function (e, t) {
    e.preventDefault();
    Theme.drawer.toggle(t.getAttribute('data-drawer-toggle'), t);
  });
  events.delegate('click', '[data-drawer-close]', function (e) {
    e.preventDefault();
    Theme.drawer.close();
  });
  events.delegate('click', '[data-overlay]', function () { Theme.drawer.close(); });

  /* ---------- modal (native <dialog>) ----------
     Triggers: [data-modal-open="id"]  Panels: dialog[data-modal="id"]
     Close   : [data-modal-close], Esc, or a click on the backdrop. */
  function modalEl(id) { return utils.qs('dialog[data-modal="' + id + '"]'); }

  Theme.modal = {
    open: function (id) {
      var el = modalEl(id);
      if (!el || el.open) return false;
      if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', '');
      Theme.scrollLock.lock();
      events.emit('modal:open', { id: id, element: el });
      return true;
    },
    close: function (id) {
      var el = modalEl(id);
      if (!el || !el.open) return false;
      if (typeof el.close === 'function') el.close(); else el.removeAttribute('open');
      return true;
    }
  };

  // `close` fires for Esc, form[method=dialog] and el.close() alike.
  doc.addEventListener('close', function (e) {
    var el = e.target;
    if (!(el instanceof HTMLDialogElement) || !el.hasAttribute('data-modal')) return;
    Theme.scrollLock.unlock();
    events.emit('modal:close', { id: el.getAttribute('data-modal'), element: el });
  }, true);

  events.delegate('click', '[data-modal-open]', function (e, t) {
    if (Theme.modal.open(t.getAttribute('data-modal-open'))) e.preventDefault();
  });
  events.delegate('click', '[data-modal-close]', function (e, t) {
    var dialog = t.closest('dialog[data-modal]');
    if (dialog) { e.preventDefault(); Theme.modal.close(dialog.getAttribute('data-modal')); }
  });
  doc.addEventListener('click', function (e) {
    // A click whose target is the <dialog> itself landed on the backdrop.
    var el = e.target;
    if (el instanceof HTMLDialogElement && el.hasAttribute('data-modal') && el.open) {
      Theme.modal.close(el.getAttribute('data-modal'));
    }
  });

  /* ---------- disclosure / accordion ----------
     Wrapper : [data-disclosure] with data-open="true|false"
     Trigger : [data-disclosure-trigger] (button, aria-controls -> panel id)
     Groups  : data-disclosure-group="name" + data-single to keep one open.     */
  function setDisclosure(wrapper, open) {
    wrapper.setAttribute('data-open', open ? 'true' : 'false');
    var trigger = utils.qs('[data-disclosure-trigger]', wrapper);
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    events.emit('disclosure:toggle', { element: wrapper, open: open });
  }

  Theme.disclosure = {
    open: function (w) { setDisclosure(w, true); },
    close: function (w) { setDisclosure(w, false); },
    toggle: function (w) { setDisclosure(w, w.getAttribute('data-open') !== 'true'); }
  };

  events.delegate('click', '[data-disclosure-trigger]', function (e, trigger) {
    var wrapper = trigger.closest('[data-disclosure]');
    if (!wrapper) return;
    var willOpen = wrapper.getAttribute('data-open') !== 'true';
    var group = wrapper.getAttribute('data-disclosure-group');
    if (willOpen && group && wrapper.hasAttribute('data-single')) {
      utils.qsa('[data-disclosure][data-disclosure-group="' + group + '"]').forEach(function (other) {
        if (other !== wrapper && other.getAttribute('data-open') === 'true') setDisclosure(other, false);
      });
    }
    setDisclosure(wrapper, willOpen);
  });

  // Make aria-expanded match the initial data-open state.
  Theme.component('disclosure', function (el) {
    setDisclosure(el, el.getAttribute('data-open') === 'true');
  });

  /* ---------- Section Rendering API ----------
     Theme.sections.render(['section-id'], { url }) -> Promise<{ id: HTMLElement }> */
  Theme.sections = {
    render: function (ids, options) {
      options = options || {};
      var url = new URL(options.url || window.location.pathname, window.location.origin);
      url.searchParams.set('sections', [].concat(ids).join(','));
      // No Accept header: with 'application/json' a product URL answers with the product's own JSON, not the sections.
      return fetch(url.toString())
        .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.json(); })
        .then(function (json) {
          var out = {};
          Object.keys(json).forEach(function (id) {
            var tpl = doc.createElement('template');
            tpl.innerHTML = json[id];
            out[id] = tpl.content.firstElementChild;
          });
          return out;
        });
    },

    /* Replace the live section wrapper with fresh markup and re-init components. */
    replace: function (id, fresh) {
      var current = doc.getElementById('shopify-section-' + id);
      if (!current || !fresh) return;
      Theme.destroy(current);
      current.replaceWith(fresh);
      Theme.init(fresh);
      events.emit('section:replace', { id: id, element: fresh });
    }
  };

  /* ---------- Cart AJAX foundation ----------
     Wraps the Ajax Cart API. Every mutation resolves with the updated cart and
     emits "theme:cart:updated"; failures emit "theme:cart:error".              */
  var cartRoutes = function () { return Theme.config.routes || {}; };

  function cartFail(err) {
    // Server messages (e.g. stock limits) are shown as-is; network failures get the localised generic text.
    events.emit('cart:error', { message: err.status ? err.message : utils.t('cart.error'), error: err });
    throw err;
  }

  function isCart(data) { return data && typeof data.item_count === 'number' && Array.isArray(data.items); }

  function setCart(cart, source) {
    Theme.cart.state = cart;
    events.emit('cart:updated', { cart: cart, source: source });
    return cart;
  }

  Theme.cart = {
    state: null,

    get: function () {
      return utils.fetchJSON(cartRoutes().cart_url + '.js', { cache: 'no-store' }).then(function (cart) {
        return setCart(cart, 'get');
      });
    },

    /* payload: { items: [{ id, quantity, properties? }] } or a FormData from a product form. */
    add: function (payload) {
      var body = payload instanceof FormData || (payload && payload.items) ? payload : { items: [].concat(payload) };
      return utils.fetchJSON(cartRoutes().cart_add_url + '.js', { method: 'POST', body: body })
        .then(function () { return Theme.cart.get(); })
        .then(function (cart) { events.emit('cart:added', { cart: cart }); return cart; })
        .catch(cartFail);
    },

    /* line is the 1-based line index (or a line item key). */
    change: function (line, quantity) {
      var body = { quantity: quantity };
      if (typeof line === 'string') body.id = line; else body.line = line;
      return utils.fetchJSON(cartRoutes().cart_change_url + '.js', { method: 'POST', body: body })
        .then(function (cart) { return isCart(cart) ? setCart(cart, 'change') : Theme.cart.get(); })
        .catch(cartFail);
    },

    update: function (payload) {
      return utils.fetchJSON(cartRoutes().cart_update_url + '.js', { method: 'POST', body: payload })
        .then(function (cart) { return isCart(cart) ? setCart(cart, 'update') : Theme.cart.get(); })
        .catch(cartFail);
    }
  };

  // Keep every [data-cart-count] in sync with the cart.
  events.on('cart:updated', function (e) {
    var count = e.detail.cart.item_count;
    utils.qsa('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  });

  /* ---------- global keyboard handling ---------- */
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && Theme.drawer.isOpen()) Theme.drawer.close();
  });

  /* ---------- Theme editor compatibility ---------- */
  doc.addEventListener('shopify:section:load', function (e) { Theme.init(e.target); events.emit('section:load', { element: e.target }); });
  doc.addEventListener('shopify:section:unload', function (e) {
    // Close any drawer that lives inside a section that is being removed.
    var drawer = e.target.querySelector && e.target.querySelector('[data-drawer]');
    if (drawer && Theme.drawer.isOpen(drawer.getAttribute('data-drawer'))) Theme.drawer.close(drawer.getAttribute('data-drawer'), { restoreFocus: false });
    Theme.destroy(e.target);
    events.emit('section:unload', { element: e.target });
  });
  doc.addEventListener('shopify:section:select', function (e) {
    // Selecting a drawer section in the editor reveals it; deselecting hides it.
    // Only drawers that are a section of their own (data-editor-reveal) are revealed on select.
    var drawer = e.target.querySelector && e.target.querySelector('[data-drawer][data-editor-reveal]');
    if (drawer) Theme.drawer.open(drawer.getAttribute('data-drawer'));
    events.emit('section:select', { element: e.target });
  });
  doc.addEventListener('shopify:section:deselect', function (e) {
    var drawer = e.target.querySelector && e.target.querySelector('[data-drawer][data-editor-reveal]');
    if (drawer) Theme.drawer.close(drawer.getAttribute('data-drawer'), { restoreFocus: false });
    events.emit('section:deselect', { element: e.target });
  });
  doc.addEventListener('shopify:block:select', function (e) { events.emit('block:select', { element: e.target }); });
  doc.addEventListener('shopify:block:deselect', function (e) { events.emit('block:deselect', { element: e.target }); });

  /* ---------- Boot ---------- */
  function boot() {
    Theme.init(doc);
    // Fade-in for images opting in with data-fade.
    utils.qsa('img[data-fade]').forEach(function (img) {
      if (img.complete) img.classList.add('is-loaded');
      else img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
    });
    events.emit('ready');
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
