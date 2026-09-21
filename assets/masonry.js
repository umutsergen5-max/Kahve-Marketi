/* ==========================================================================
   masonry.js — lightweight masonry for a CSS grid list ([data-component="masonry"]).
   The list stays an ordinary CSS grid: this script only switches it to 1px rows and gives
   each item a row span equal to the height of its content plus the gap
   (--masonry-gap). The browser's own auto-placement then puts every item in the shortest
   column. DOM order never changes, so reading and tab order stay logical, and without JS
   the list is a normal grid. Heights are re-measured when items resize (images, fonts,
   viewport changes) through ResizeObserver.
   Markup: <ul data-component="masonry"><li>…card…</li>…</ul>  (see sections/main-blog.liquid)
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;

  Theme.component('masonry', function (root) {
    var frame = 0;
    var observer = null;

    function items() { return Array.prototype.slice.call(root.children); }

    function layout() {
      frame = 0;
      var gap = parseFloat(getComputedStyle(root).getPropertyValue('--masonry-gap')) || 0;
      var list = items();
      // read every height first, then write, to avoid layout thrashing
      var heights = list.map(function (item) {
        var inner = item.firstElementChild;
        return inner ? inner.getBoundingClientRect().height : 0;
      });
      root.setAttribute('data-masonry', 'ready');
      list.forEach(function (item, i) {
        item.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil(heights[i] + gap));
      });
    }

    function schedule() { if (!frame) frame = requestAnimationFrame(layout); }

    function watch() {
      if (typeof ResizeObserver !== 'function') { window.addEventListener('resize', schedule); return; }
      observer = new ResizeObserver(schedule);
      items().forEach(function (item) {
        if (item.firstElementChild) observer.observe(item.firstElementChild);
      });
      observer.observe(root);
    }

    layout();
    watch();
    window.addEventListener('load', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    return {
      destroy: function () {
        if (frame) cancelAnimationFrame(frame);
        if (observer) observer.disconnect(); else window.removeEventListener('resize', schedule);
        window.removeEventListener('load', schedule);
        root.removeAttribute('data-masonry');
        items().forEach(function (item) { item.style.gridRowEnd = ''; });
      }
    };
  });
})();
