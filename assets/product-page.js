/* ==========================================================================
   product-page.js — behaviour that only the product page needs (loaded when
   template.name == 'product'):
   - Hover zoom on gallery images (mouse pointers, desktop widths).
   - Pauses hosted/external videos when the gallery moves to another slide,
     keeps the thumbnail strip scrolled to the active thumbnail.
   - Loads Shopify's 3D model viewer UI when a model slide is present.
   - Product recommendations (Shopify recommendation endpoint, rendered by the section).
   - Editor: selecting an information block opens its accordion.
   The gallery itself is the shared carousel (assets/carousel.js); variants, quantity and
   the lightbox live in assets/product.js.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;

  /* ---------- Hover zoom ---------- */
  var hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
  var zooming = null;

  function stopZoom() {
    if (zooming) zooming.classList.remove('is-zooming');
    zooming = null;
  }

  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !hoverQuery.matches) return;
    var target = e.target instanceof Element ? e.target.closest('[data-hover-zoom] .gallery__zoom') : null;
    if (zooming && zooming !== target) stopZoom();
    if (!target) return;
    var rect = target.getBoundingClientRect();
    target.style.setProperty('--zx', ((e.clientX - rect.left) / rect.width * 100).toFixed(1) + '%');
    target.style.setProperty('--zy', ((e.clientY - rect.top) / rect.height * 100).toFixed(1) + '%');
    target.classList.add('is-zooming');
    zooming = target;
  });
  doc.addEventListener('pointerout', function (e) {
    if (zooming && (!e.relatedTarget || !zooming.contains(e.relatedTarget))) stopZoom();
  });

  /* ---------- Gallery: videos, thumbnails, 3D ---------- */
  function pauseMedia(slide) {
    utils.qsa('video', slide).forEach(function (video) { if (!video.paused) video.pause(); });
    utils.qsa('iframe', slide).forEach(function (frame) {
      if (!frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');   // YouTube (enablejsapi)
        frame.contentWindow.postMessage('{"method":"pause"}', '*');                                     // Vimeo
      } catch (e) { /* cross-origin frame refused the message: nothing to do */ }
    });
  }

  var modelsReady = false;
  function loadModels(gallery) {
    var models = utils.qsa('[data-model] model-viewer', gallery);
    if (!models.length || modelsReady || !window.Shopify || typeof window.Shopify.loadFeatures !== 'function') return;
    modelsReady = true;
    window.Shopify.loadFeatures([{
      name: 'model-viewer-ui',
      version: '1.0',
      onLoad: function (error) {
        if (error || !window.Shopify.ModelViewerUI) return;
        models.forEach(function (model) { if (!model.__ui) model.__ui = new window.Shopify.ModelViewerUI(model); });
      }
    }]);
  }

  function keepThumbVisible(gallery, index) {
    var list = gallery.parentNode && utils.qs('[data-gallery-thumbs]', gallery.parentNode);
    var thumb = list && utils.qsa('.gallery__thumb', list)[index];
    if (!thumb) return;
    var item = thumb.parentNode;
    var left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    list.scrollTo({ left: left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  doc.addEventListener('carousel:change', function (e) {
    var gallery = e.target instanceof Element ? e.target.closest('[data-gallery]') : null;
    if (!gallery) return;
    var index = e.detail && e.detail.index;
    var slides = utils.qsa('[data-carousel-slide]', gallery);
    slides.forEach(function (slide, i) { if (i !== index) pauseMedia(slide); });
    if (slides[index] && slides[index].getAttribute('data-media-type') === 'model') loadModels(gallery);
    keepThumbVisible(gallery, index);
  });

  utils.qsa('[data-gallery]').forEach(function (gallery) {
    var first = utils.qs('[data-carousel-slide]', gallery);
    if (first && first.getAttribute('data-media-type') === 'model') loadModels(gallery);
  });

  /* ---------- Recommendations ---------- */
  Theme.component('product-recommendations', function (root) {
    var url = root.getAttribute('data-url');
    var body = utils.qs('[data-recommendations-body]', root);
    if (!url || !body) return;
    var loaded = false;
    var alive = true;
    var observer = null;

    function load() {
      if (loaded) return;
      loaded = true;
      fetch(url, { headers: { 'Accept': 'text/html' } })
        .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.text(); })
        .then(function (html) {
          if (!alive) return;
          var tpl = doc.createElement('template');
          tpl.innerHTML = html;
          var fresh = utils.qs('[data-recommendations-body]', tpl.content);
          if (!fresh || !utils.qs('[data-product-card]', fresh)) return;     // nothing to recommend: stay hidden
          if (typeof Theme.destroy === 'function') Theme.destroy(body);
          body.innerHTML = fresh.innerHTML;
          root.hidden = false;
          Theme.init(body);
        })
        .catch(function () { /* recommendations are optional: fail silently */ });
    }

    if (typeof IntersectionObserver === 'function') {
      // A hidden section never intersects, so watch a zero-height sentinel placed before it.
      var sentinel = doc.createElement('div');
      sentinel.setAttribute('aria-hidden', 'true');
      root.parentNode.insertBefore(sentinel, root);
      root.__sentinel = sentinel;
      observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { load(); observer.disconnect(); }
      }, { rootMargin: window.innerHeight + 'px 0px' });
      observer.observe(sentinel);
    } else {
      load();
    }
    if (root.getAttribute('data-design-mode') === 'true') load();

    return {
      destroy: function () {
        alive = false;
        if (observer) observer.disconnect();
        if (root.__sentinel && root.__sentinel.parentNode) root.__sentinel.parentNode.removeChild(root.__sentinel);
      }
    };
  });

  /* ---------- Theme editor ---------- */
  doc.addEventListener('shopify:block:select', function (e) {
    var panel = e.target instanceof Element ? utils.qs('[data-disclosure]', e.target) : null;
    if (panel) Theme.disclosure.open(panel);
  });
})();
