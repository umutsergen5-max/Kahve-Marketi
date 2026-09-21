/* ==========================================================================
   header.js — global chrome behaviour: navigation menu, announcement bar,
   mobile menu drawer. Builds on the core in theme.js (Theme.component,
   Theme.drawer, Theme.mq, Theme.utils).
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;

  /* ---------- Navigation (dropdown + mega menu) ----------
     Markup (sections/header.liquid):
       <nav data-component="nav-menu">
         <li data-nav-item data-mega="true|false">
           <a>…</a> <button data-nav-toggle aria-expanded aria-controls>…
           <div data-nav-panel id>…
     Pattern: "disclosure navigation" — the parent link keeps navigating, the
     toggle button opens the panel. Pointer devices also open on hover.        */
  Theme.component('nav-menu', function (nav) {
    var items = utils.qsa('[data-nav-item]', nav);
    var hoverQuery = window.matchMedia('(hover: hover)');
    var openItem = null;
    var closeTimer = null;
    var openTimer = null;

    function toggleOf(item) { return item.querySelector('[data-nav-toggle]'); }
    function panelOf(item) { return item.querySelector('[data-nav-panel]'); }

    function setOpen(item, open) {
      item.setAttribute('data-open', open ? 'true' : 'false');
      var toggle = toggleOf(item);
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function open(item) {
      clearTimeout(closeTimer);
      if (openItem && openItem !== item) setOpen(openItem, false);
      setOpen(item, true);
      openItem = item;
    }

    function close(item) {
      if (!item) return;
      setOpen(item, false);
      if (openItem === item) openItem = null;
    }

    function closeAll() {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      items.forEach(function (item) { if (item.getAttribute('data-open') === 'true') close(item); });
    }

    function panelLinks(item) {
      var panel = panelOf(item);
      return panel ? utils.qsa('a[href]', panel) : [];
    }

    items.forEach(function (item) {
      item.setAttribute('data-open', 'false');

      // Pointer hover (mouse / trackpad only)
      item.addEventListener('mouseenter', function () {
        if (!hoverQuery.matches) return;
        clearTimeout(closeTimer);
        clearTimeout(openTimer);
        openTimer = setTimeout(function () { open(item); }, openItem ? 0 : 80);
      });
      item.addEventListener('mouseleave', function () {
        if (!hoverQuery.matches) return;
        clearTimeout(openTimer);
        closeTimer = setTimeout(function () { close(item); }, 160);
      });

      // Focus leaving the whole item closes it
      item.addEventListener('focusout', function (e) {
        var next = e.relatedTarget;
        if (next && item.contains(next)) return;
        setTimeout(function () {
          if (!item.contains(doc.activeElement) && item.getAttribute('data-open') === 'true') close(item);
        }, 0);
      });
    });

    function onClick(e) {
      var toggle = e.target.closest && e.target.closest('[data-nav-toggle]');
      if (!toggle || !nav.contains(toggle)) return;
      var item = toggle.closest('[data-nav-item]');
      if (item.getAttribute('data-open') === 'true') close(item); else open(item);
    }

    function onKeydown(e) {
      var item = e.target.closest && e.target.closest('[data-nav-item]');
      if (!item) return;
      var isOpen = item.getAttribute('data-open') === 'true';

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        var inside = item.contains(doc.activeElement) && doc.activeElement !== toggleOf(item);
        close(item);
        if (inside) toggleOf(item).focus();
        return;
      }

      var links = panelLinks(item);
      if (!links.length) return;
      var index = links.indexOf(doc.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) open(item);
        (links[index + 1] || links[0]).focus();
      } else if (e.key === 'ArrowUp' && index !== -1) {
        e.preventDefault();
        if (index === 0) toggleOf(item).focus(); else links[index - 1].focus();
      } else if (e.key === 'Home' && index !== -1) {
        e.preventDefault(); links[0].focus();
      } else if (e.key === 'End' && index !== -1) {
        e.preventDefault(); links[links.length - 1].focus();
      }
    }

    function onOutside(e) {
      if (openItem && !nav.contains(e.target)) closeAll();
    }

    // Theme editor: revealing a promo block opens the mega menu it belongs to.
    function onBlockSelect(e) {
      var item = e.target.closest && e.target.closest('[data-nav-item]');
      if (item && nav.contains(item)) open(item);
    }
    function onBlockDeselect(e) {
      var item = e.target.closest && e.target.closest('[data-nav-item]');
      if (item && nav.contains(item)) close(item);
    }

    nav.addEventListener('click', onClick);
    nav.addEventListener('keydown', onKeydown);
    doc.addEventListener('pointerdown', onOutside);
    doc.addEventListener('shopify:block:select', onBlockSelect);
    doc.addEventListener('shopify:block:deselect', onBlockDeselect);
    // The navigation is display:none below the header's breakpoint; close any open panel then.
    var onResize = utils.debounce(function () { if (nav.offsetParent === null) closeAll(); }, 150);
    window.addEventListener('resize', onResize);

    return {
      destroy: function () {
        closeAll();
        nav.removeEventListener('click', onClick);
        nav.removeEventListener('keydown', onKeydown);
        doc.removeEventListener('pointerdown', onOutside);
        doc.removeEventListener('shopify:block:select', onBlockSelect);
        doc.removeEventListener('shopify:block:deselect', onBlockDeselect);
        window.removeEventListener('resize', onResize);
      }
    };
  });

  /* ---------- Announcement bar (marquee speed + pause control) ---------- */
  Theme.component('announcement', function (el) {
    if (el.getAttribute('data-scroll') !== 'true') return;

    var group = el.querySelector('.announcement__group');
    var toggle = el.querySelector('[data-announcement-toggle]');
    var speed = parseInt(el.getAttribute('data-speed'), 10) || 5;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    function apply() {
      if (!group || !toggle) return;
      if (reduced.matches) { toggle.hidden = true; return; }
      // speed 1..10 -> 10..100 px per second
      var seconds = Math.max(8, group.offsetWidth / (speed * 10));
      el.style.setProperty('--announcement-duration', seconds.toFixed(1) + 's');
      toggle.hidden = false;
    }

    function onToggle() {
      var paused = el.getAttribute('data-paused') !== 'true';
      el.setAttribute('data-paused', paused ? 'true' : 'false');
      toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
      toggle.setAttribute('aria-label', toggle.getAttribute(paused ? 'data-label-play' : 'data-label-pause'));
    }

    var onResize = utils.debounce(apply, 200);
    if (toggle) toggle.addEventListener('click', onToggle);
    window.addEventListener('resize', onResize);
    reduced.addEventListener && reduced.addEventListener('change', apply);
    apply();

    return {
      destroy: function () {
        if (toggle) toggle.removeEventListener('click', onToggle);
        window.removeEventListener('resize', onResize);
        reduced.removeEventListener && reduced.removeEventListener('change', apply);
      }
    };
  });

  /* ---------- Mobile menu drawer ----------
     Open/close, focus trap, overlay and Escape are handled by Theme.drawer.
     The only extra rule: the menu button is hidden from the header's breakpoint
     upwards (a setting), so an open menu drawer is closed when its trigger
     disappears.                                                              */
  Theme.component('menu-drawer', function () {
    var onResize = utils.debounce(function () {
      if (!Theme.drawer.isOpen('menu')) return;
      var burger = utils.qs('.site-header__burger');
      if (burger && getComputedStyle(burger).display === 'none') Theme.drawer.close('menu', { restoreFocus: false });
    }, 150);
    window.addEventListener('resize', onResize);
    return { destroy: function () { window.removeEventListener('resize', onResize); } };
  });
})();

/* ---------- Horizontally scrolling navigation rows (collection navigation) ----------
   Brings the current item into view and toggles edge-fade hints. Markup:
   <nav data-component="scroll-active"><div data-scroll-track> … [aria-current="page"] */
(function () {
  'use strict';
  var Theme = window.Theme;
  if (!Theme) return;
  var utils = Theme.utils;

  Theme.component('scroll-active', function (nav) {
    var track = utils.qs('[data-scroll-track]', nav);
    if (!track) return;
    var frame = 0;

    function update() {
      frame = 0;
      var max = track.scrollWidth - track.clientWidth;
      nav.setAttribute('data-can-scroll-start', track.scrollLeft > 2 ? 'true' : 'false');
      nav.setAttribute('data-can-scroll-end', track.scrollLeft < max - 2 ? 'true' : 'false');
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }

    var current = utils.qs('[aria-current="page"]', track);
    if (current) {
      var offset = current.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
      track.scrollLeft = Math.max(0, offset - (track.clientWidth - current.offsetWidth) / 2);
    }
    track.addEventListener('scroll', schedule, { passive: true });
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(track);
    update();

    return {
      destroy: function () {
        if (frame) cancelAnimationFrame(frame);
        track.removeEventListener('scroll', schedule);
        if (observer) observer.disconnect();
      }
    };
  });
})();
