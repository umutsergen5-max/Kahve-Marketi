/* ==========================================================================
   gift-card.js — gift card page (templates/gift_card.liquid): copy code and print.
   Standalone (this page has no theme layout). Buttons stay hidden without JavaScript.
   ========================================================================== */
(function () {
  'use strict';
  var doc = document;

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

  function copy(value) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(value).catch(function () { return copyLegacy(value); });
    }
    return copyLegacy(value);
  }

  Array.prototype.forEach.call(doc.querySelectorAll('[data-copy-code], [data-print]'), function (b) { b.hidden = false; });

  doc.addEventListener('click', function (e) {
    var target = e.target.closest && e.target.closest('[data-copy-code], [data-print]');
    if (!target) return;
    if (target.hasAttribute('data-print')) { window.print(); return; }
    var status = doc.querySelector('[data-copy-status]');
    copy(target.getAttribute('data-copy-code')).then(function () {
      if (status) status.textContent = target.getAttribute('data-copied');
    }, function () { /* clipboard unavailable: the code is selectable text */ });
  });
})();
