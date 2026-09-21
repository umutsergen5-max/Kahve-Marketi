/* ==========================================================================
   carousel.js — scroll-snap carousel behaviour (arrows, dots, thumbnails, keys).
   The track scrolls natively (touch, trackpad, keyboard), this file only adds
   controls and state. Used by the gallery, featured collection, editorial slideshow.

   Markup contract: see "Carousel" in assets/components.css.
     [data-carousel-track] [data-carousel-slide] [data-carousel-prev|next]
     [data-carousel-dots]  [data-carousel-goto="i"][aria-controls="<track id>"] (thumbnails)
   Events: "carousel:goto" (detail.index) on the root moves the carousel;
           "carousel:change" (detail.index) is dispatched on the root after scrolling.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var utils = Theme.utils;

  Theme.component('carousel', function (root) {
    var track = utils.qs('[data-carousel-track]', root);
    if (!track) return;
    var slides = utils.qsa('[data-carousel-slide]', track);
    var prev = utils.qs('[data-carousel-prev]', root);
    var next = utils.qs('[data-carousel-next]', root);
    var dotsBox = utils.qs('[data-carousel-dots]', root);
    var thumbs = track.id ? utils.qsa('[data-carousel-goto][aria-controls="' + track.id + '"]') : [];
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var frame = 0;
    var current = 0;
    var dotCount = 0;

    function gap() { return parseFloat(getComputedStyle(track).columnGap) || 0; }
    function trackLeft() { return track.getBoundingClientRect().left; }

    function perView() {
      if (!slides.length) return 1;
      var w = slides[0].getBoundingClientRect().width + gap();
      return Math.max(1, Math.round((track.clientWidth + gap()) / (w || 1)));
    }

    function nearestIndex() {
      var origin = trackLeft(), best = 0, bestDelta = Infinity;
      slides.forEach(function (slide, i) {
        var delta = Math.abs(slide.getBoundingClientRect().left - origin);
        if (delta < bestDelta) { bestDelta = delta; best = i; }
      });
      return best;
    }

    function goTo(index, instant) {
      index = Math.max(0, Math.min(slides.length - 1, index));
      var slide = slides[index];
      if (!slide) return;
      var left = track.scrollLeft + slide.getBoundingClientRect().left - trackLeft();
      track.scrollTo({ left: left, behavior: instant || reduced.matches ? 'auto' : 'smooth' });
    }

    function buildDots() {
      if (!dotsBox) return;
      var count = Math.max(1, slides.length - Math.floor(perView()) + 1);
      if (count === dotCount) return;
      dotCount = count;
      dotsBox.innerHTML = '';
      for (var i = 0; i < count; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel__dot';
        dot.setAttribute('data-dot', i);
        dot.setAttribute('aria-label', utils.t('carousel.go_to_slide', { number: i + 1 }));
        dotsBox.appendChild(dot);
      }
    }

    function update() {
      frame = 0;
      var maxScroll = track.scrollWidth - track.clientWidth;
      var scrollable = maxScroll > 1;
      root.setAttribute('data-scrollable', scrollable ? 'true' : 'false');
      buildDots();

      var atEnd = track.scrollLeft >= maxScroll - 2;
      var index = atEnd && slides.length ? slides.length - 1 : nearestIndex();
      var changed = index !== current;
      current = index;

      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = atEnd;

      var dotIndex = Math.min(current, Math.max(0, dotCount - 1));
      if (dotsBox) utils.qsa('.carousel__dot', dotsBox).forEach(function (dot, i) {
        if (i === dotIndex) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
      });
      thumbs.forEach(function (thumb, i) {
        if (i === current) thumb.setAttribute('aria-current', 'true'); else thumb.removeAttribute('aria-current');
      });
      if (changed) root.dispatchEvent(new CustomEvent('carousel:change', { detail: { index: current }, bubbles: true }));
    }

    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function step() { return Math.max(1, Math.floor(perView())); }

    function onPrev() { goTo(current - step()); }
    function onNext() { goTo(current + step()); }
    function onDots(e) {
      var dot = e.target.closest && e.target.closest('[data-dot]');
      if (dot) goTo(parseInt(dot.getAttribute('data-dot'), 10));
    }
    function onThumb(e) { goTo(parseInt(e.currentTarget.getAttribute('data-carousel-goto'), 10)); }
    function onGoto(e) { goTo(e.detail && e.detail.index, e.detail && e.detail.instant); }
    function onKeydown(e) {
      if (e.target !== track) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
    }
    // Theme editor: selecting a slide block brings it into view.
    function onBlockSelect(e) {
      var i = slides.indexOf(e.target);
      if (i !== -1) goTo(i, true);
    }

    track.addEventListener('scroll', schedule, { passive: true });
    track.addEventListener('keydown', onKeydown);
    root.addEventListener('carousel:goto', onGoto);
    if (prev) prev.addEventListener('click', onPrev);
    if (next) next.addEventListener('click', onNext);
    if (dotsBox) dotsBox.addEventListener('click', onDots);
    thumbs.forEach(function (t) { t.addEventListener('click', onThumb); });
    document.addEventListener('shopify:block:select', onBlockSelect);

    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (observer) observer.observe(track); else window.addEventListener('resize', schedule);
    update();

    return {
      destroy: function () {
        if (frame) cancelAnimationFrame(frame);
        track.removeEventListener('scroll', schedule);
        track.removeEventListener('keydown', onKeydown);
        root.removeEventListener('carousel:goto', onGoto);
        if (prev) prev.removeEventListener('click', onPrev);
        if (next) next.removeEventListener('click', onNext);
        if (dotsBox) dotsBox.removeEventListener('click', onDots);
        thumbs.forEach(function (t) { t.removeEventListener('click', onThumb); });
        document.removeEventListener('shopify:block:select', onBlockSelect);
        if (observer) observer.disconnect(); else window.removeEventListener('resize', schedule);
      }
    };
  });
})();
