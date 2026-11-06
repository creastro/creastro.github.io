/*
 * Explanations for the simulations: short tooltips on hover or focus, and a dialog with the theory,
 * formulas and references for each parameter. The content comes from window.SIM_HELP, defined by a
 * help.js file next to each simulation:
 *
 *   SIM_HELP = {
 *     tips:   { elementId: 'short text', ... },     tooltip for the control with that id (or for its row)
 *     bind:   { elementId: 'topic', ... },          clicking the control's label opens that topic
 *     panels: { headingId: 'topic', ... },          an "i" button after the heading opens that topic
 *     topics: { topic: { title, what, theory: [...], formulas: [{tex, note}], sim, refs: [{c, u}], see: [...] } }
 *   }
 *
 * Text fields accept $tex$ for inline maths and {{topic|label}} for a link to another topic.
 * Any element with data-topic opens that topic when clicked, and any element with data-tip-key or
 * data-tip gets a tooltip, so the simulations can create such elements at any time.
 */
(() => {
  'use strict';
  const H = window.SIM_HELP;
  if (!H) return;
  const tips = H.tips || {}, topics = H.topics || {};
  const $ = (id) => document.getElementById(id);

  /* ---------- text with maths and cross-references ---------- */

  function math(tex, display) {
    const el = document.createElement(display ? 'div' : 'span');
    if (window.katex) {
      try { window.katex.render(tex, el, { displayMode: !!display, throwOnError: false, strict: 'ignore' }); return el; } catch (e) { /* fall through */ }
    }
    const code = document.createElement('code');
    code.textContent = tex;
    el.appendChild(code);
    return el;
  }

  function rich(text) {
    const frag = document.createDocumentFragment();
    String(text).split(/(\$[^$]+\$|\{\{[^}|]+\|[^}]+\}\})/).forEach((part) => {
      if (!part) return;
      if (part[0] === '$' && part.length > 2) frag.appendChild(math(part.slice(1, -1), false));
      else if (part.slice(0, 2) === '{{') {
        const [key, label] = part.slice(2, -2).split('|');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'xref'; b.dataset.topic = key; b.textContent = label;
        frag.appendChild(b);
      } else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  /* ---------- tooltips ---------- */

  const tip = document.createElement('div');
  tip.className = 'sim-tip';
  tip.id = 'sim-tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let tipEl = null, tipTimer = 0;

  const tipSelector = '[data-tip-key],[data-tip]';
  const tipOf = (el) => (el.dataset.tipKey ? tips[el.dataset.tipKey] : el.dataset.tip);
  const hasTopic = (el) => el.matches('[data-topic]') || !!el.querySelector('[data-topic]');

  function placeTip(el, px) {
    const r = el.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = (px != null ? px : r.left + r.width / 2) - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.top - h - 10;
    if (y < 8) y = r.bottom + 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function showTip(el, px) {
    const text = tipOf(el);
    if (!text) return;
    tip.textContent = text;
    if (hasTopic(el)) {
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = 'Click for the theory and formulas';
      tip.appendChild(more);
    }
    tip.classList.add('on');
    placeTip(el, px);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipEl = null;
    tip.classList.remove('on');
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest ? e.target.closest(tipSelector) : null;
    if (!el) { hideTip(); return; }
    if (el === tipEl) return;
    hideTip();
    tipEl = el;
    const px = e.clientX;
    tipTimer = setTimeout(() => showTip(el, px), 260);
  });
  document.addEventListener('pointerout', (e) => {
    if (tipEl && !(e.relatedTarget && tipEl.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('input[type=range]')) hideTip(); });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest ? e.target.closest(tipSelector) : null;
    if (el && e.target.matches(':focus-visible')) { hideTip(); tipEl = el; showTip(el); }
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });

  /* ---------- the dialog ---------- */

  const dlg = document.createElement('dialog');
  dlg.className = 'sim-dialog';
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  dlg.innerHTML = '<div class="dlg-head"><button type="button" class="dlg-back" hidden>← Back</button><h2 id="dlg-title"></h2>' +
    '<button type="button" class="dlg-close" aria-label="Close the explanation">×</button></div><div class="dlg-body" tabindex="-1"></div>';
  document.body.appendChild(dlg);
  const titleEl = dlg.querySelector('#dlg-title'), bodyEl = dlg.querySelector('.dlg-body'), backBtn = dlg.querySelector('.dlg-back');
  const history = [];
  let current = null;

  function section(title) {
    const h = document.createElement('h3');
    h.textContent = title;
    bodyEl.appendChild(h);
  }

  function render(key) {
    const t = topics[key];
    current = key;
    titleEl.textContent = t.title;
    bodyEl.textContent = '';
    if (t.what) { const p = document.createElement('p'); p.className = 'what'; p.appendChild(rich(t.what)); bodyEl.appendChild(p); }
    if (t.theory && t.theory.length) {
      section('Theory');
      t.theory.forEach((s) => { const p = document.createElement('p'); p.appendChild(rich(s)); bodyEl.appendChild(p); });
    }
    if (t.formulas && t.formulas.length) {
      section('Formulas');
      t.formulas.forEach((f) => {
        const box = document.createElement('div');
        box.className = 'formula-box';
        if (f.note) { const n = document.createElement('span'); n.className = 'f-note'; n.appendChild(rich(f.note)); box.appendChild(n); }
        box.appendChild(math(f.tex, true));
        bodyEl.appendChild(box);
      });
    }
    if (t.sim) { section('In this simulation'); const p = document.createElement('p'); p.appendChild(rich(t.sim)); bodyEl.appendChild(p); }
    if (t.refs && t.refs.length) {
      section('References');
      const ol = document.createElement('ol');
      ol.className = 'refs';
      t.refs.forEach((r) => {
        const li = document.createElement('li');
        li.appendChild(document.createTextNode(r.c));
        if (r.u) {
          li.appendChild(document.createTextNode(' '));
          const a = document.createElement('a');
          a.href = r.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = decodeURIComponent(r.u.replace(/^https?:\/\/(doi\.org\/|ui\.adsabs\.harvard\.edu\/abs\/)?/, (m, p) => (p && p.indexOf('doi') >= 0 ? 'doi:' : p ? 'ADS:' : '')));
          li.appendChild(a);
        }
        ol.appendChild(li);
      });
      bodyEl.appendChild(ol);
    }
    if (t.see && t.see.length) {
      const d = document.createElement('p');
      d.className = 'related';
      d.appendChild(document.createTextNode('Related: '));
      t.see.forEach((k) => { if (topics[k]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'xref'; b.dataset.topic = k; b.textContent = topics[k].title; d.appendChild(b); } });
      bodyEl.appendChild(d);
    }
    bodyEl.scrollTop = 0;
    backBtn.hidden = history.length === 0;
  }

  function announce(open) { window.dispatchEvent(new CustomEvent('sim-dialog', { detail: { open } })); }

  function openTopic(key) {
    if (!topics[key]) return;
    hideTip();
    if (dlg.open && current && current !== key) history.push(current);
    if (!dlg.open) history.length = 0;
    render(key);
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      document.documentElement.classList.add('dlg-open');
      announce(true);
    }
    bodyEl.focus({ preventScroll: true });
  }

  function closeDialog() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => { document.documentElement.classList.remove('dlg-open'); history.length = 0; announce(false); });
  dlg.querySelector('.dlg-close').addEventListener('click', closeDialog);
  backBtn.addEventListener('click', () => { if (history.length) render(history.pop()); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });

  document.addEventListener('click', (e) => {
    const t = e.target.closest ? e.target.closest('[data-topic]') : null;
    if (t) { e.preventDefault(); openTopic(t.dataset.topic); }
  });

  /* ---------- wire up the controls that exist now ---------- */

  // tooltips for controls, by id
  Object.keys(tips).forEach((id) => {
    const ctl = $(id);
    if (!ctl) return;
    const host = ctl.closest('.field') || ctl.closest('label') || ctl;
    host.dataset.tipKey = id;
    if (ctl.matches('input,select,button,textarea')) {
      const d = document.createElement('span');
      d.className = 'sr-only';
      d.id = 'tipd-' + id;
      d.textContent = tips[id];
      document.body.appendChild(d);
      ctl.setAttribute('aria-describedby', d.id);
    }
  });

  // parameter names open the dialog
  Object.keys(H.bind || {}).forEach((id) => {
    const ctl = $(id);
    if (!ctl) return;
    const field = ctl.closest('.field');
    const label = (field && field.querySelector('label')) || document.querySelector('label[for="' + id + '"]');
    if (!label || label.querySelector('.term')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'term'; b.dataset.topic = H.bind[id];
    b.setAttribute('aria-haspopup', 'dialog');
    while (label.firstChild) b.appendChild(label.firstChild);
    label.appendChild(b);
  });

  // an "i" button after each panel heading
  Object.keys(H.panels || {}).forEach((id) => {
    const h = $(id);
    if (!h || h.querySelector('.i-btn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'i-btn'; b.textContent = 'i';
    b.dataset.topic = H.panels[id];
    b.dataset.tip = 'Explain this panel';
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', 'Explain: ' + h.textContent.trim());
    h.appendChild(b);
  });

  // used by the automated checks
  window.SimExplain = { open: openTopic, close: closeDialog, topics, tips, math };
})();
