/* ==========================================================================
   video.js — hero video behaviour.
   - Videos are muted and inline; they never play with sound.
   - Autoplay is applied here (not with the HTML attribute) so it can respect
     prefers-reduced-motion, pause when off-screen and offer a pause/play button.
   - If the video cannot load, it is removed and the image underneath remains.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var utils = Theme.utils;

  Theme.component('hero-video', function (el) {
    if (el.getAttribute('data-has-video') !== 'true') return;

    var videos = utils.qsa('[data-hero-video]', el);
    var toggle = utils.qs('[data-hero-toggle]', el);
    var wantsAutoplay = el.getAttribute('data-autoplay') === 'true';
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var inView = true;
    var userPaused = false;

    function active() {
      return videos.filter(function (v) { return v.offsetParent !== null && v.style.display !== 'none'; })[0];
    }

    function setPaused(paused) {
      el.setAttribute('data-paused', paused ? 'true' : 'false');
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
      toggle.setAttribute('aria-label', toggle.getAttribute(paused ? 'data-label-play' : 'data-label-pause'));
    }

    function play() {
      var video = active();
      if (!video) return;
      videos.forEach(function (v) { if (v !== video) v.pause(); });
      var attempt = video.play();
      if (attempt && typeof attempt.then === 'function') {
        attempt.then(function () { setPaused(false); }, function () { setPaused(true); });
      } else {
        setPaused(false);
      }
    }

    function pause() {
      videos.forEach(function (v) { v.pause(); });
      setPaused(true);
    }

    function sync() {
      if (wantsAutoplay && !reduced.matches && inView && !userPaused) play(); else pause();
    }

    function onToggle() {
      var paused = el.getAttribute('data-paused') === 'true';
      if (paused) { userPaused = false; play(); } else { userPaused = true; pause(); }
    }

    // A source that fails to load must not leave an empty black box: fall back to the image.
    function onError(e) {
      var video = e.target && e.target.closest && e.target.closest('[data-hero-video]');
      if (!video) return;
      if (e.target === video || e.target.tagName === 'SOURCE') { video.style.display = 'none'; video.pause(); sync(); }
    }

    if (toggle) { toggle.hidden = false; toggle.addEventListener('click', onToggle); }
    el.addEventListener('error', onError, true);

    var observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.15 }) : null;
    if (observer) observer.observe(el);

    var onResize = utils.debounce(sync, 200);   // the visible video changes between mobile and desktop
    window.addEventListener('resize', onResize);
    var onReduced = function () { sync(); };
    if (reduced.addEventListener) reduced.addEventListener('change', onReduced);

    sync();

    return {
      destroy: function () {
        pause();
        if (observer) observer.disconnect();
        if (toggle) toggle.removeEventListener('click', onToggle);
        el.removeEventListener('error', onError, true);
        window.removeEventListener('resize', onResize);
        if (reduced.removeEventListener) reduced.removeEventListener('change', onReduced);
      }
    };
  });
})();
