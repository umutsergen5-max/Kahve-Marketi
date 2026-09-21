/* ==========================================================================
   share.js — share button ([data-share], snippets/share-button.liquid).
   Uses the Web Share API when available and falls back to copying the link.
   No third-party SDK. Loaded on product and article pages.
   ========================================================================== */
(function () {
  'use strict';

  var Theme = window.Theme;
  if (!Theme) return;
  var doc = document;
  var utils = Theme.utils;

  function copyLegacy(value) {
    return new Promise(function (resolve, reject) {
      var field = doc.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      doc.body.appendChild(field);
      field.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (err) { ok = false; }
      doc.body.removeChild(field);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(value).catch(function () { return copyLegacy(value); });
    }
    return copyLegacy(value);
  }

  Theme.events.delegate('click', '[data-share]', function (e, button) {
    var wrap = button.closest('[data-share-wrap]');
    var status = wrap && utils.qs('[data-share-status]', wrap);
    var data = { title: button.getAttribute('data-share-title') || '', url: button.getAttribute('data-share-url') || window.location.href };
    function say(key) { if (status) status.textContent = utils.t(key); }
    function fallback() { copyText(data.url).then(function () { say('products.share_copied'); }, function () { say('products.share_failed'); }); }
    if (typeof navigator.share === 'function') {
      navigator.share(data).catch(function (error) { if (!error || error.name !== 'AbortError') fallback(); });
    } else {
      fallback();
    }
  });
})();
