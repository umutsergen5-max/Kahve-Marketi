/* ==========================================================================
   auth.js — small progressive enhancements for customer, password and address forms.
   Standalone (no dependency on theme.js) so it also runs in layout/password.liquid.
   - Password visibility toggle: [data-password-toggle] (hidden until this script runs).
   - Login / recover panels: [data-auth-panel] swapped by [data-auth-toggle], and #recover
     opens the recovery panel (Shopify redirects there after a recovery request).
   - Address forms: country select fills the province select from data-provinces.
   - Delete address confirmation: form[data-confirm].
   Everything works without JavaScript (both login panels stay visible, province select is
   hidden and the browser's own validation applies).
   ========================================================================== */
(function () {
  'use strict';
  var doc = document;

  /* ---- password toggle ---- */
  function setToggle(button, show) {
    var input = doc.getElementById(button.getAttribute('aria-controls'));
    if (!input) return;
    input.type = show ? 'text' : 'password';
    if (show) input.setAttribute('data-revealed', ''); else input.removeAttribute('data-revealed');
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    button.setAttribute('aria-label', button.getAttribute(show ? 'data-label-hide' : 'data-label-show'));
    var icons = button.querySelectorAll('[data-password-icon]');
    Array.prototype.forEach.call(icons, function (icon) { icon.hidden = icon.getAttribute('data-password-icon') !== (show ? 'hide' : 'show'); });
  }

  doc.addEventListener('click', function (e) {
    var button = e.target.closest && e.target.closest('[data-password-toggle]');
    if (button) setToggle(button, button.getAttribute('aria-pressed') !== 'true');
  });

  Array.prototype.forEach.call(doc.querySelectorAll('[data-password-toggle]'), function (b) { b.hidden = false; });

  /* ---- login / recover panels ---- */
  var panels = Array.prototype.slice.call(doc.querySelectorAll('[data-auth-panel]'));
  function showPanel(name, focus) {
    if (!panels.length) return;
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-auth-panel') !== name; });
    if (focus) {
      var target = doc.querySelector('[data-auth-panel="' + name + '"] [data-auth-success], [data-auth-panel="' + name + '"] input:not([type=hidden])');
      if (target) { if (target.tagName !== 'INPUT') target.setAttribute('tabindex', '-1'); target.focus(); }
    }
  }
  if (panels.length) {
    showPanel(window.location.hash === '#recover' ? 'recover' : 'login', false);
    doc.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('[data-auth-toggle]');
      if (!link) return;
      e.preventDefault();
      var name = link.getAttribute('data-auth-toggle');
      showPanel(name, true);
      if (window.history && history.replaceState) history.replaceState(null, '', name === 'recover' ? '#recover' : window.location.pathname + window.location.search);
    });
  }

  /* ---- country / province ---- */
  function fillProvinces(country) {
    var wrap = country.closest('form');
    var province = wrap && wrap.querySelector('[data-address-province]');
    var field = wrap && wrap.querySelector('[data-address-province-field]');
    if (!province || !field) return;
    var option = country.options[country.selectedIndex];
    var list = [];
    try { list = JSON.parse((option && option.getAttribute('data-provinces')) || '[]'); } catch (err) { list = []; }
    var wanted = province.getAttribute('data-default') || province.value;
    province.innerHTML = '';
    list.forEach(function (pair) {
      var o = doc.createElement('option');
      o.value = pair[0]; o.textContent = pair[1];
      if (pair[0] === wanted) o.selected = true;
      province.appendChild(o);
    });
    field.hidden = list.length === 0;
    province.disabled = list.length === 0;
  }

  Array.prototype.forEach.call(doc.querySelectorAll('[data-address-country]'), function (country) {
    var wanted = country.getAttribute('data-default');
    if (wanted) {
      Array.prototype.forEach.call(country.options, function (o) { if (o.value === wanted || o.text === wanted) country.value = o.value; });
    }
    fillProvinces(country);
  });
  doc.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-address-country]')) {
      var province = e.target.closest('form').querySelector('[data-address-province]');
      if (province) province.setAttribute('data-default', '');
      fillProvinces(e.target);
    }
  });

  /* ---- delete confirmation ---- */
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    var message = form.getAttribute && form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) e.preventDefault();
  });
})();
