/* Model Delivery Portal — digital twin
 * Vanilla JS, hash routing, no build step.
 * Routes:
 *   #/                                  Model List
 *   #/model/:access/:tab/:sub           Model detail
 *     tab  = info | communication | analysis
 *     sub  = details | options | snapshot  (info)
 *            today | sma                   (communication)
 *            performance | profile         (analysis)
 * URL options:  ?persona=blackrock (single-manager view)   ?reset=1 (restore seed data)
 *
 * Model lifecycle (mirrors the production audit trail):
 *   edit a model           -> status In Progress, locked to the editing user
 *   another user opens it  -> "Model Being Edited By Another User"
 *   SUBMIT (changes, =100%)-> "Model Updated (By Admin)" + "Model Approved", weights applied
 *   CONFIRM (no changes)   -> "Confirmed", confirmed user/date stamped
 *   CLEAR                  -> discard edits, release the lock
 */
(function () {
  'use strict';

  var SEED = window.MDP_SEED;
  var SEC = SEED.securities;
  var STORE_KEY = 'mdp-twin-v' + SEED.version;
  var EPS = 0.0004;
  var app = document.getElementById('app');

  /* ================= helpers ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  var NF = {};
  function num(n, d) { var f = NF[d] || (NF[d] = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })); return f.format(n); }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function isAdmin() { return !persona.managers; }
  function displayName(u) { var p = String(u).split(','); return p.length > 1 ? p[1].trim() + ' ' + p[0].trim() : u; }

  /* ---- time (America/New_York) ---- */
  var NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' });
  function nyParts(d) {
    var p = {};
    NY.formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return p;
  }
  function nowStamp() {
    var p = nyParts(), us = pad(Math.floor(Math.random() * 1e6), 6);
    return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second + '.' + us;
  }
  function todayISO() { var p = nyParts(); return p.year + '-' + p.month + '-' + p.day; }
  function parseStamp(s) {
    var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?)?/);
    return { y: m[1], mo: m[2], d: m[3], h: +(m[4] || 0), mi: m[5] || '00', s: m[6] || '00', f: (m[7] || '000000').concat('000000').slice(0, 6) };
  }
  var fmt = {
    listMod: function (s) { var p = parseStamp(s); return p.mo + '-' + p.d + '-' + p.y + ' ' + pad(p.h % 12 || 12) + ':' + p.mi + ':' + p.s + '.' + p.f.slice(0, 3); },
    full: function (s) { var p = parseStamp(s); return p.mo + '-' + p.d + '-' + p.y + ' ' + pad(p.h % 12 || 12) + ':' + p.mi + ':' + p.s + '.' + p.f + ' ' + (p.h < 12 ? 'AM' : 'PM'); },
    conf: function (s) { var p = parseStamp(s); return p.mo + '/' + p.d + '/' + p.y + ' ' + (p.h % 12 || 12) + ':' + p.mi + ' ' + (p.h < 12 ? 'AM' : 'PM'); },
    day: function (iso) { return iso ? iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4) : ''; }
  };
  function isoFromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateFromIso(iso) { return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function prevBusinessDay(iso) {
    var d = dateFromIso(iso);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return isoFromDate(d);
  }
  var EOD = prevBusinessDay(todayISO());

  /* ---- icons ---- */
  var I = {
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.5"/></svg>',
    download: '<svg viewBox="0 0 20 20"><path d="M10 3v9.5M6 8.8l4 4 4-4M3.5 13.5v3h13v-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    print: '<svg viewBox="0 0 20 20"><path d="M6 7V3h8v4M6 14H3.5V8a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v6H14M6 11.5h8V17H6z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    cal: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.2"/><path d="M7.5 8.5h1v3.5" stroke="currentColor" stroke-width="1"/></svg>',
    down: '<svg viewBox="0 0 12 12"><path d="M2 4.2L6 8.2l4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    up: '<svg viewBox="0 0 12 12"><path d="M2.5 9L6 5.5 9.5 9M2.5 5.5L6 2l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    left: '<svg viewBox="0 0 10 14"><path d="M8 1.5L2.5 7 8 12.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    prev: '<svg viewBox="0 0 12 12"><path d="M7.5 2L3.5 6l4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    next: '<svg viewBox="0 0 12 12"><path d="M4.5 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    first: '<svg viewBox="0 0 12 12"><path d="M6 2L2 6l4 4M10 2L6 6l4 4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    last: '<svg viewBox="0 0 12 12"><path d="M2 2l4 4-4 4M6 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    chev: '<svg viewBox="0 0 12 12"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    info: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M6 5.2v3.3" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="3.5" r=".7" fill="currentColor"/></svg>',
    audit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5H3a.5.5 0 0 0-.5.5v10.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h4M5 8.5h3" stroke="currentColor" stroke-width="1.1"/><path d="M8 11l.4-1.8 5.1-5.1 1.4 1.4-5.1 5.1z" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
    ok: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#3b8a3e"/><path d="M4 7.2l2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
    warn: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#e08a00"/><path d="M7 3.5v4.3" stroke="#fff" stroke-width="1.7"/><circle cx="7" cy="10.2" r=".95" fill="#fff"/></svg>',
    err: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#c8102e"/><path d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8" stroke="#fff" stroke-width="1.6"/></svg>',
    attn: '<svg viewBox="0 0 14 14"><path d="M7 .9l6.4 11.4H.6z" fill="#d4580a"/><path d="M7 4.6v3.8" stroke="#fff" stroke-width="1.5"/><circle cx="7" cy="10.3" r=".85" fill="#fff"/></svg>',
    newI: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#1d6e8f"/><path d="M7 3.8v6.4M3.8 7h6.4" stroke="#fff" stroke-width="1.6"/></svg>',
    errBang: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.5" fill="#c8102e"/><path d="M8 3.8v5.2" stroke="#fff" stroke-width="1.9"/><circle cx="8" cy="11.7" r="1.1" fill="#fff"/></svg>',
    refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    excel: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#1f7244"/><path d="M5 5.5l3 5M8 5.5l-3 5" stroke="#fff" stroke-width="1.3"/><path d="M9.5 5.5h3.5M9.5 8h3.5M9.5 10.5h3.5" stroke="#fff" stroke-width=".9"/></svg>'
  };
  var STATUS_ICON = { 'Approved': I.ok, 'In Progress': I.warn, 'Rejected': I.err, 'Needs Attention': I.attn, 'New': I.newI };
  function statusHtml(s) { return '<span class="st' + (s === 'Rejected' ? ' rej' : '') + '">' + (STATUS_ICON[s] || I.warn) + esc(s) + '</span>'; }

  /* ================= state & persistence ================= */
  var params = new URLSearchParams(location.search);
  var UX_CURRENT = params.get('ux') === 'current'; // reproduce production behavior where we propose improvements
  function loadModels() {
    if (params.get('reset')) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) return parsed; }
    } catch (e) { /* ignore */ }
    return SEED.buildModels();
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(S.models)); } catch (e) { /* ignore */ }
    }, 150);
  }
  window.addEventListener('beforeunload', function () {
    if (saveTimer) { clearTimeout(saveTimer); try { localStorage.setItem(STORE_KEY, JSON.stringify(S.models)); } catch (e) { /* ignore */ } }
  });

  var persona = SEED.personas[(params.get('persona') || 'admin').toLowerCase()] || SEED.personas.admin;
  function emptyFilters() { return { managers: [], mod: null, conf: null, status: [] }; }
  var S = {
    models: loadModels(),
    list: { pending: emptyFilters(), applied: emptyFilters(), search: '', sort: { key: null, dir: 1 }, perPage: 100, page: 1, collapsed: false },
    ui: { open: null, q: {} },
    detailSort: {},
    snapDate: {}
  };
  var byAccess = {};
  S.models.forEach(function (m) { byAccess[m.access] = m; });
  function visibleManagers() { return persona.managers || SEED.managers; }
  function managerOptions() { return persona.managers || SEED.managerOptions; }
  function scopedModels() {
    if (!persona.managers) return S.models;
    return S.models.filter(function (m) { return persona.managers.indexOf(m.manager) > -1; });
  }
  function findModel(access) { var m = byAccess[access]; return m && (!persona.managers || persona.managers.indexOf(m.manager) > -1) ? m : null; }
  function lockedBy(m) { return m.status === 'In Progress' && m.modifiedUser !== persona.user ? m.modifiedUser : null; }
  function logEvent(m, e) {
    var seq = m.events.reduce(function (a, x) { return Math.max(a, x.seq || 0); }, 0) + 1;
    e.seq = seq; m.events.push(e);
  }

  /* ================= toasts / tooltip / modal ================= */
  var toastZone = $('#toast-zone');
  function toast(msg, kind) {
    $$('.toast', toastZone).forEach(function (t) { if (t.getAttribute('data-msg') === msg) t.remove(); });
    while (toastZone.children.length >= 3) toastZone.firstChild.remove();
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'err');
    el.setAttribute('data-msg', msg);
    el.innerHTML = (kind === 'ok' ? I.ok : I.errBang) + '<span>' + esc(msg) + '</span><button class="x" aria-label="Dismiss">&times;</button>';
    el.querySelector('.x').onclick = function () { el.remove(); };
    toastZone.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }

  /* Tooltips: data-tip follows the cursor (used for truncated cells, like production);
     data-tip-anchor pins a clean bubble above the element (info icons, disabled buttons). */
  var tip = $('#tip'), tipFor = null;
  function hideTip() { tip.style.display = 'none'; tip.className = 'tip'; tipFor = null; }
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (t === tipFor) return;
    if (!t) { hideTip(); return; }
    if (t.hasAttribute('data-tip-trunc') && t.scrollWidth <= t.clientWidth) { hideTip(); return; }
    var text = t.getAttribute('data-tip');
    if (!text) { hideTip(); return; }
    tipFor = t;
    tip.textContent = text;
    tip.style.display = 'block';
    if (t.hasAttribute('data-tip-anchor')) {
      tip.className = 'tip anchored';
      var r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      var top = r.top - h - 9, below = top < 4;
      if (below) top = r.bottom + 9;
      tip.classList.toggle('below', below);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
      tip.style.setProperty('--arrow-x', (r.left + r.width / 2 - left) + 'px');
    } else {
      tip.className = 'tip';
      tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px';
    }
  });
  document.addEventListener('mousemove', function (e) {
    if (tipFor && !tipFor.hasAttribute('data-tip-anchor')) { tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; }
  }, { passive: true });
  document.addEventListener('scroll', hideTip, { passive: true, capture: true });

  function modal(opts) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="modal-bg"><div class="modal ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-h">' + (opts.icon || '') + '<div class="mh-t"><h2>' + esc(opts.title) + '</h2>' + (opts.sub || '') + '</div><button class="x" data-act="close-modal" aria-label="Close">&times;</button></div>' +
      '<div class="modal-b">' + opts.body + '</div>' + (opts.foot ? '<div class="modal-f">' + opts.foot + '</div>' : '') + '</div></div>';
    $('.modal-bg', root).addEventListener('mousedown', function (e) { if (e.target.classList.contains('modal-bg')) closeModal(); });
    var f = $('[autofocus]', root); if (f) f.focus();
  }
  function closeModal() { var r = $('#modal-root'); if (r.firstChild) r.innerHTML = ''; }

  function showLocked(m) {
    modal({
      cls: 'lock', icon: '<span class="mh-ic">' + I.err + '</span>', title: 'Model Being Edited By Another User',
      body: '<p class="lock-msg">Only one user at a time is allowed to edit a model. Model is currently being edited by ' + esc(displayName(lockedBy(m))) + '. Please try again later.</p>',
      foot: '<button class="btn btn-black" data-act="close-modal" autofocus>Close</button>'
    });
  }

  /* ================= clock ================= */
  var clockEl = $('#gh-clock');
  function tickClock() {
    var p = nyParts(), h = +p.hour;
    clockEl.textContent = (h % 12 || 12) + ':' + p.minute + ':' + p.second + ' ' + (h < 12 ? 'AM' : 'PM') + ' ' + (p.timeZoneName || 'ET');
  }
  tickClock(); setInterval(tickClock, 1000);

  /* ================= CSV import helper ================= */
  function parseCsv(text) {
    return text.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (line) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
      }
      out.push(cur);
      return out.map(function (s) { return s.trim(); });
    });
  }

  /* ================= date picker ================= */
  var DP = null;
  function openDatePicker(anchor, mode, value, onDone, opts) {
    var base = mode === 'range' ? (value && value[0]) : value;
    var month = dateFromIso(base || todayISO());
    month.setDate(1);
    DP = { anchor: anchor, mode: mode, start: mode === 'range' ? (value ? value[0] : null) : value, end: mode === 'range' ? (value ? value[1] : null) : null, month: month, onDone: onDone, avail: null, list: null };
    if (opts && opts.avail) { DP.list = opts.avail; DP.avail = {}; opts.avail.forEach(function (d) { DP.avail[d] = 1; }); }
    renderDatePicker();
  }
  function closeDatePicker() { DP = null; var el = $('#pop-root .dp'); if (el) el.remove(); }
  function renderDatePicker() {
    var root = $('#pop-root');
    var old = $('.dp', root); if (old) old.remove();
    if (!DP) return;
    var r = DP.anchor.getBoundingClientRect();
    var m = DP.month, y = m.getFullYear(), mo = m.getMonth();
    var first = new Date(y, mo, 1), startDow = first.getDay();
    var cells = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(function (d) { return '<span class="dow">' + d + '</span>'; }).join('');
    var today = todayISO();
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, mo, 1 - startDow + i), iso = isoFromDate(d);
      var cls = [];
      if (d.getMonth() !== mo) cls.push('out');
      if (iso === today) cls.push('today');
      if (iso === DP.start || iso === DP.end) cls.push('sel');
      else if (DP.start && DP.end && iso > DP.start && iso < DP.end) cls.push('in');
      var na = DP.avail && !DP.avail[iso];
      if (DP.avail) cls.push(na ? 'na' : 'has');
      cells += '<button data-dp-day="' + iso + '" class="' + cls.join(' ') + '"' + (na ? ' aria-disabled="true" data-tip="No snapshot saved" data-tip-anchor' : DP.avail ? ' data-tip="Snapshot saved" data-tip-anchor' : '') + '>' + d.getDate() + '</button>';
    }
    var hint = DP.mode === 'range' ? (DP.start && !DP.end ? 'Select end date' : DP.start ? fmt.day(DP.start) + ' - ' + fmt.day(DP.end) : 'Select start date') : (DP.start ? fmt.day(DP.start) : 'Select a date');
    var el = document.createElement('div');
    el.className = 'dp' + (DP.avail ? ' snap' : '');
    var side = DP.avail ? '<div class="dp-side"><div class="dp-side-h">Saved Snapshots</div>' + (DP.list.length ? DP.list.map(function (d) { return '<button data-dp-day="' + d + '" class="' + (d === DP.start ? 'sel' : '') + '">' + fmt.day(d) + (d === DP.list[0] ? '<em>Latest</em>' : '') + '</button>'; }).join('') : '<div class="dp-side-empty">None saved yet</div>') + '</div>' : '';
    if (DP.avail) hint = '<span class="legend"><i></i>Snapshot saved</span>';
    el.innerHTML = '<div class="dp-main"><div class="dp-head"><button data-dp="prev" aria-label="Previous month">' + I.prev + '</button><span>' + first.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + '</span><button data-dp="next" aria-label="Next month">' + I.next + '</button></div>' +
      '<div class="dp-grid">' + cells + '</div>' +
      '<div class="dp-foot"><span class="hint">' + hint + '</span><span><button class="btn btn-text" data-dp="clear">Clear</button>' + (DP.mode === 'range' ? ' <button class="btn btn-dark" data-dp="done">Done</button>' : '') + '</span></div></div>' + side;
    root.appendChild(el);
    var w = el.offsetWidth, left = r.left + window.scrollX, top = r.bottom + window.scrollY + 2;
    if (left + w > window.innerWidth - 10) left = r.right + window.scrollX - w;
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }
  document.addEventListener('click', function (e) {
    if (!DP) return;
    var dp = e.target.closest('.dp');
    if (!dp) { if (!e.target.closest('[data-dp-anchor]')) closeDatePicker(); return; }
    var day = e.target.closest('[data-dp-day]'), act = e.target.closest('[data-dp]');
    if (day) {
      if (day.classList.contains('na')) { e.stopPropagation(); return; }
      var iso = day.getAttribute('data-dp-day');
      if (DP.mode === 'single') { var cb = DP.onDone; closeDatePicker(); cb(iso); return; }
      if (!DP.start || DP.end) { DP.start = iso; DP.end = null; }
      else if (iso < DP.start) { DP.end = DP.start; DP.start = iso; }
      else DP.end = iso;
      renderDatePicker();
    } else if (act) {
      var a = act.getAttribute('data-dp');
      if (a === 'clear' && DP.avail) { closeDatePicker(); e.stopPropagation(); return; }
      if (a === 'prev') { DP.month.setMonth(DP.month.getMonth() - 1); renderDatePicker(); }
      else if (a === 'next') { DP.month.setMonth(DP.month.getMonth() + 1); renderDatePicker(); }
      else if (a === 'clear') { var c = DP.onDone; closeDatePicker(); c(null); }
      else if (a === 'done') { var cbd = DP.onDone, s = DP.start, en = DP.end || DP.start; closeDatePicker(); cbd(s ? [s, en] : null); }
    }
    e.stopPropagation();
  }, true);

  /* =====================================================================
   * MODEL LIST
   * ===================================================================== */
  function filterCount(f) { return (f.managers.length ? 1 : 0) + (f.mod ? 1 : 0) + (f.conf ? 1 : 0) + (f.status.length ? 1 : 0); }
  function listRows() {
    var L = S.list, f = L.applied, q = L.search.trim().toLowerCase();
    var mset = f.managers.length ? f.managers : null, sset = f.status.length ? f.status : null;
    var rows = scopedModels().filter(function (m) {
      if (mset && mset.indexOf(m.manager) < 0) return false;
      if (sset && sset.indexOf(m.status) < 0) return false;
      if (f.mod) { var d = m.modified.slice(0, 10); if (d < f.mod[0] || d > f.mod[1]) return false; }
      if (f.conf) { if (!m.confirmed) return false; var c = m.confirmed.slice(0, 10); if (c < f.conf[0] || c > f.conf[1]) return false; }
      if (q && (m.manager + '\u0001' + m.name + '\u0001' + m.access + '\u0001' + m.swp + '\u0001' + m.type + '\u0001' + m.modifiedUser + '\u0001' + (m.confirmedUser || '') + '\u0001' + m.status).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = L.sort.key, dir = L.sort.dir;
    rows.sort(function (a, b) {
      if (key) {
        var va = a[key], vb = b[key];
        if (va == null) va = ''; if (vb == null) vb = '';
        if (typeof va === 'number' && typeof vb === 'number') { if (va !== vb) return (va - vb) * dir; }
        else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); if (va !== vb) return (va < vb ? -1 : 1) * dir; }
      }
      if (a.manager !== b.manager) return a.manager.toLowerCase() < b.manager.toLowerCase() ? -1 : 1;
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    return rows;
  }

  var LIST_COLS = [
    { key: 'manager', label: 'Manager', w: 120 },
    { key: 'name', label: 'Strategy Name', w: 222 },
    { key: 'access', label: 'Access', w: 60 },
    { key: 'swp', label: 'SWP/AAP', w: 64 },
    { key: 'type', label: 'Model Type', w: 78 },
    { key: 'accounts', label: 'Accounts', w: 64, r: 1 },
    { key: 'aum', label: 'AUM(M)', w: 74, r: 1, info: 'Assets under management in millions (USD) as of the last end-of-day close' },
    { key: 'modifiedUser', label: 'Modified User', w: 124 },
    { key: 'modified', label: 'Modified Date', w: 150 },
    { key: 'confirmedUser', label: 'Confirmed User', w: 124 },
    { key: 'confirmed', label: 'Confirmed Date', w: 136 },
    { key: 'status', label: 'Status', w: 112 },
    { key: null, label: 'Audit Trail', w: 64 }
  ];
  var LIST_COLGROUP = '<colgroup>' + LIST_COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join('') + '</colgroup>';

  function renderList() {
    var L = S.list;
    app.innerHTML =
      '<div class="banner"><h1>Model Delivery Portal</h1>' + improvementsBtn() + '<button class="btn-support">Support</button></div>' +
      '<div class="page">' +
        '<section class="card ml-head">' +
          '<div class="ml-title">Model List</div>' +
          '<div class="kv mgr"><span class="k">Manager</span><span class="v">' + esc(visibleManagers().join(', ')) + '</span></div>' +
          '<div class="kv user"><span class="k">User</span><span class="v">' + esc(persona.user) + '</span></div>' +
          '<div class="ml-tools"><button class="tool-link" data-act="list-import">' + I.excel + 'Bulk Import</button><label class="search-box">' + I.search + '<input id="ml-search" placeholder="Search" value="' + esc(L.search) + '" autocomplete="off"></label>' +
            '<button class="icon-btn" data-act="list-export" data-tip="Download" data-tip-anchor>' + I.download + '</button>' +
            '<button class="icon-btn" data-act="print" data-tip="Print" data-tip-anchor>' + I.print + '</button></div>' +
        '</section>' +
        '<section class="card grid-card">' +
          '<div id="ml-filters"></div>' +
          '<div id="ml-pill"></div>' +
          '<div class="grid-scroll list-scroll" id="ml-scroll"><table class="grid list-grid" id="ml-table"></table></div>' +
          '<div class="grid-foot" id="ml-foot"></div>' +
        '</section>' +
      '</div>';
    renderFilters();
    renderListGrid();
    var raf = 0;
    $('#ml-search').addEventListener('input', function (e) {
      S.list.search = e.target.value; S.list.page = 1;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(renderListGrid);
    });
  }

  /* ---- searchable multi-select (Manager*, Status) ---- */
  var MULTI = {
    managers: { opts: managerOptions, ph: 'Select Manager', width: 236 },
    status: { opts: function () { return SEED.statuses; }, ph: 'Select status', width: 246 }
  };
  function multiLabel(key) {
    var sel = S.list.pending[key], n = MULTI[key].opts().length;
    if (!sel.length) return '<span class="txt ph">' + MULTI[key].ph + '</span>';
    if (sel.length === 1) return '<span class="txt">' + esc(sel[0]) + '</span>';
    if (sel.length === n) return '<span class="txt">All Selected</span>';
    return '<span class="txt">' + sel.length + ' Selected</span>';
  }
  function multiField(key, cls, label) {
    var open = S.ui.open === key;
    var ctl = open
      ? '<div class="ctl focus" data-act="noop">' + I.search + '<input id="ms-q" data-key="' + key + '" value="' + esc(S.ui.q[key] || '') + '" placeholder="Search..." autocomplete="off"></div>'
      : '<div class="ctl" data-act="ms-toggle" data-key="' + key + '">' + multiLabel(key) + I.down + '</div>';
    return '<div class="field ' + cls + '" data-ms="' + key + '"><span class="lbl">' + label + '</span>' + ctl + (open ? multiDropdown(key) : '') + '</div>';
  }
  function multiDropdown(key) {
    var sel = S.list.pending[key], opts = MULTI[key].opts(), q = (S.ui.q[key] || '').toLowerCase();
    var shown = q ? opts.filter(function (o) { return o.toLowerCase().indexOf(q) > -1; }) : opts;
    var all = sel.length === opts.length, none = !sel.length;
    var html = '<div class="dd" id="ms-dd" style="width:' + MULTI[key].width + 'px">';
    if (!q) html += '<div class="dd-opt" data-act="ms-all" data-key="' + key + '"><span class="cb ' + (all ? 'on' : none ? '' : 'part') + '"></span>Select All</div>';
    shown.forEach(function (o) {
      html += '<div class="dd-opt" data-act="ms-opt" data-key="' + key + '" data-val="' + esc(o) + '"><span class="cb' + (sel.indexOf(o) > -1 ? ' on' : '') + '"></span>' + esc(o) + '</div>';
    });
    if (!shown.length) html += '<div class="dd-opt dd-empty">No matches</div>';
    return html + '</div>';
  }

  function rangeLabel(r) { return r ? '<span class="txt">' + fmt.day(r[0]) + ' - ' + fmt.day(r[1]) + '</span>' : '<span class="txt ph">Select</span>'; }
  function renderFilters() {
    var P = S.list.pending;
    var hasAny = filterCount(P) || filterCount(S.list.applied);
    $('#ml-filters').innerHTML =
      '<div class="filters' + (S.list.collapsed ? ' collapsed' : '') + '">' +
        multiField('managers', 'f-mgr', 'Manager*') +
        '<div class="field f-mod"><span class="lbl">Modified Date Range</span><div class="ctl cal" data-act="dp-mod" data-dp-anchor>' + rangeLabel(P.mod) + I.cal + '</div></div>' +
        '<div class="field f-conf"><span class="lbl">Confirmed Date Range</span><div class="ctl cal" data-act="dp-conf" data-dp-anchor>' + rangeLabel(P.conf) + I.cal + '</div></div>' +
        multiField('status', 'f-status', 'Status') +
        '<div class="spacer"></div>' +
        '<button class="btn btn-clear' + (hasAny ? ' on' : '') + '" data-act="f-clear">Clear</button>' +
        '<button class="btn btn-dark" data-act="f-apply">Apply</button>' +
      '</div>';
    var n = filterCount(P);
    $('#ml-pill').innerHTML = '<div class="filter-pill-wrap' + (S.list.collapsed ? ' top' : '') + '"><button class="filter-pill' + (S.list.collapsed ? ' collapsed' : '') + '" data-act="f-toggle">(' + n + ') ' + (n ? 'Filters Applied' : 'No Filters Applied') + ' ' + I.up + '</button></div>';
    var q = $('#ms-q');
    if (q) {
      q.focus(); q.setSelectionRange(q.value.length, q.value.length);
      q.addEventListener('input', function (e) {
        var key = e.target.getAttribute('data-key');
        S.ui.q[key] = e.target.value;
        var dd = $('#ms-dd'); if (dd) dd.outerHTML = multiDropdown(key);
      });
    }
  }
  function refreshMulti(key) {
    // update only the open dropdown + pill + clear button (keeps the search box focused)
    var dd = $('#ms-dd'); if (dd) dd.outerHTML = multiDropdown(key);
    var n = filterCount(S.list.pending);
    var pill = $('.filter-pill'); if (pill) pill.innerHTML = '(' + n + ') ' + (n ? 'Filters Applied' : 'No Filters Applied') + ' ' + I.up;
    var cl = $('[data-act="f-clear"]'); if (cl) cl.classList.toggle('on', !!(n || filterCount(S.list.applied)));
  }

  function rowHtml(m) {
    var locked = lockedBy(m);
    return '<tr>' +
      '<td data-tip="' + esc(m.manager) + '" data-tip-trunc>' + esc(m.manager) + '</td>' +
      '<td data-tip="' + esc(m.name) + '" data-tip-trunc><a class="lnk" href="#/model/' + encodeURIComponent(m.access) + '/info/details"' + (locked ? ' data-locked="' + esc(m.access) + '"' : '') + '>' + esc(m.name) + '</a></td>' +
      '<td class="b">' + esc(m.access) + '</td>' +
      '<td class="b">' + (m.swp ? esc(m.swp) : '-') + '</td>' +
      '<td>' + esc(m.type) + '</td>' +
      '<td class="r">' + num(m.accounts, 0) + '</td>' +
      '<td class="r">' + num(m.aum, 2) + '</td>' +
      '<td>' + esc(m.modifiedUser) + '</td>' +
      '<td>' + fmt.listMod(m.modified) + '</td>' +
      '<td>' + (m.confirmedUser ? esc(m.confirmedUser) : '-') + '</td>' +
      '<td>' + (m.confirmed ? fmt.conf(m.confirmed) : '-') + '</td>' +
      '<td>' + statusHtml(m.status) + '</td>' +
      '<td><button class="audit-btn" data-act="audit" data-acc="' + esc(m.access) + '" aria-label="Audit trail">' + I.audit + '</button></td>' +
    '</tr>';
  }
  function renderListGrid() {
    var L = S.list, rows = listRows();
    var total = rows.length, pages = Math.max(1, Math.ceil(total / L.perPage));
    if (L.page > pages) L.page = pages;
    var start = (L.page - 1) * L.perPage, slice = rows.slice(start, start + L.perPage);
    var head = '<thead><tr>' + LIST_COLS.map(function (c) {
      var s = c.key && L.sort.key === c.key ? '<span class="sort">' + (L.sort.dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
      var info = c.info ? '<span class="ii" data-tip="' + esc(c.info) + '" data-tip-anchor>' + I.info + '</span>' : '';
      return '<th class="' + (c.r ? 'r' : '') + '"' + (c.key ? ' data-act="list-sort" data-key="' + c.key + '"' : '') + '>' + c.label + info + s + '</th>';
    }).join('') + '</tr></thead>';
    var body = slice.length ? slice.map(rowHtml).join('') : '<tr class="empty-row"><td colspan="13">No Rows To Show</td></tr>';
    $('#ml-table').innerHTML = LIST_COLGROUP + head + '<tbody>' + body + '</tbody>';

    var from = total ? start + 1 : 0, to = Math.min(start + L.perPage, total);
    $('#ml-foot').innerHTML =
      '<div class="perpage">Per Page <select id="ml-pp">' + [10, 25, 50, 100].map(function (n) { return '<option' + (n === L.perPage ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div class="pager"><span class="count">' + from + ' to ' + to + ' of ' + total + '</span>' +
        '<button data-act="pg" data-to="first"' + (L.page <= 1 ? ' disabled' : '') + ' aria-label="First page">' + I.first + '</button>' +
        '<button data-act="pg" data-to="prev"' + (L.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">' + I.prev + '</button>' +
        '<span>Page ' + L.page + ' of ' + pages + '</span>' +
        '<button data-act="pg" data-to="next"' + (L.page >= pages ? ' disabled' : '') + ' aria-label="Next page">' + I.next + '</button>' +
        '<button data-act="pg" data-to="last"' + (L.page >= pages ? ' disabled' : '') + ' aria-label="Last page">' + I.last + '</button>' +
        '<input class="goto" id="ml-goto" value="' + L.page + '"><button class="go" data-act="pg-go">Go</button></div>';
  }
  function goPage() {
    var L = S.list, pages = Math.max(1, Math.ceil(listRows().length / L.perPage));
    var p = parseInt($('#ml-goto').value, 10);
    if (!p || p < 1 || p > pages) { toast('Please enter a page between 1 and ' + pages); return; }
    L.page = p; renderListGrid();
  }

  /* ---- audit trail ---- */
  function eventsDesc(m) {
    return m.events.slice().sort(function (a, b) { return a.ts !== b.ts ? (a.ts < b.ts ? 1 : -1) : (b.seq || 0) - (a.seq || 0); });
  }
  function changesTable(changes) {
    return '<table class="chg-tbl"><thead><tr><th>Ticker</th><th>Description</th><th class="r">Previous Weight</th><th class="r">New Weight</th><th class="r">Change</th></tr></thead><tbody>' +
      changes.map(function (c) {
        var s = SEC[c.ticker], d = round3(c.to - c.from);
        return '<tr><td>' + esc(c.ticker) + '</td><td>' + esc(s ? s.desc : c.ticker === 'USD Cash' ? 'USD Cash' : '') + '</td><td class="r">' + c.from.toFixed(3) + '%</td><td class="r">' + c.to.toFixed(3) + '%</td><td class="r ' + (d > EPS ? 'pos' : d < -EPS ? 'neg' : '') + '">' + (d > EPS ? '+' : '') + d.toFixed(3) + '%</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function showAudit(m) {
    var ev = eventsDesc(m);
    var rows = ev.map(function (e, i) {
      var exp = (e.changes && e.changes.length) || e.note;
      return '<tr class="ev' + (exp ? ' exp' : '') + '"' + (exp ? ' data-act="audit-exp" data-i="' + i + '"' : '') + '><td class="chevc">' + (exp ? I.chev : '') + '</td><td>' + fmt.full(e.ts) + '</td><td>' + esc(e.event) + '</td><td>' + esc(e.user) + '</td><td class="det">' + esc(e.details) + '</td></tr>' +
        (exp ? '<tr class="ev-x" data-x="' + i + '" hidden><td></td><td colspan="4">' + (e.note ? '<div class="ev-note">' + esc(e.note) + '</div>' : '') + (e.changes ? changesTable(e.changes) : '') + '</td></tr>' : '');
    }).join('');
    modal({
      cls: 'audit', title: 'Audit Trail',
      body: '<div class="audit-meta"><div><b>Strategy Name:</b> ' + esc(m.name) + '</div><div><b>Access:</b> ' + esc(m.access) + '</div><div><b>SWP/AAP:</b> ' + esc(m.swp) + '</div></div>' +
        '<div class="audit-scroll"><table class="grid audit-grid"><colgroup><col style="width:26px"><col style="width:23%"><col style="width:20%"><col style="width:18%"><col></colgroup><thead><tr><th></th><th>Timestamp</th><th>Event</th><th>User</th><th>Details</th></tr></thead><tbody>' +
        (rows || '<tr class="empty-row"><td colspan="5">No Rows To Show</td></tr>') + '</tbody></table></div>',
      foot: '<button class="btn btn-tan" data-act="close-modal">Cancel</button>'
    });
  }

  /* =====================================================================
   * MODEL DETAIL
   * ===================================================================== */
  var TABS = [['info', 'Model Information', 'details'], ['communication', 'Communication', 'today'], ['analysis', 'Analysis', 'performance']];
  var SUBS = {
    info: [['details', 'Model Details'], ['options', 'Model Options'], ['snapshot', 'Model Snapshot']],
    communication: [['today', "Today's Change"], ['sma', 'SMA Communication']],
    analysis: [['performance', 'Performance'], ['profile', 'Profile']]
  };
  var CASH = 'USD Cash';
  function secFor(t) { return t === CASH ? { ticker: CASH, desc: 'USD Cash', id: '-', price: 1, info: false } : SEC[t]; }

  function metaHtml(m) {
    return '<div class="mf"><span class="k">Strategy Name</span><span class="v">' + esc(m.name) + '</span></div>' +
      '<div class="mf"><span class="k">Access</span><span class="v">' + esc(m.access) + '</span></div>' +
      '<div class="mf"><span class="k">SWP/AAP</span><span class="v">' + (m.swp ? esc(m.swp) : 'N/A') + '</span></div>' +
      '<div class="mf"><span class="k">Modified</span><span class="v">' + fmt.full(m.modified) + '</span></div>' +
      '<div class="mf"><span class="k">Confirmed</span><span class="v">' + (m.confirmed ? fmt.full(m.confirmed) : 'N/A') + '</span></div>' +
      '<div class="mf"><span class="k">Status</span><span class="v">' + statusHtml(m.status) + '</span></div>' +
      '<div class="meta-tools"><button class="icon-btn" data-act="model-export" data-acc="' + esc(m.access) + '" data-tip="Download" data-tip-anchor>' + I.download + '</button><button class="icon-btn" data-act="print" data-tip="Print" data-tip-anchor>' + I.print + '</button></div>';
  }

  function renderDetail(access, tab, sub) {
    var m = findModel(access);
    if (!m || lockedBy(m)) {
      // fall back to the list, then show the reason on top of it
      skipRoute = true; location.replace('#/'); current.access = null; renderList();
      if (m) showLocked(m); else toast('Model ' + access + ' was not found');
      return;
    }
    if (!SUBS[tab]) tab = 'info';
    if (!SUBS[tab].some(function (s) { return s[0] === sub; })) sub = SUBS[tab][0][0];
    var base = '#/model/' + encodeURIComponent(access) + '/';
    app.innerHTML =
      '<div class="banner detail"><a class="crumb" href="#/">' + I.left + 'Model List</a><h1>Model Delivery Portal</h1>' + improvementsBtn() + '<button class="btn-support">Support</button></div>' +
      '<div class="page">' +
        '<section class="card d-head">' +
          '<div class="tabs big">' + TABS.map(function (t) { return '<a href="' + base + t[0] + '/' + t[2] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</a>'; }).join('') + '</div>' +
          '<div class="meta" id="d-meta">' + metaHtml(m) + '</div>' +
        '</section>' +
        '<section class="card d-body">' +
          '<div class="tabs small">' + SUBS[tab].map(function (s) { return '<a href="' + base + tab + '/' + s[0] + '" class="' + (s[0] === sub ? 'on' : '') + '">' + s[1] + '</a>'; }).join('') + '</div>' +
          '<div id="d-content"></div>' +
        '</section>' +
      '</div>';
    ({ details: renderModelDetails, options: renderOptions, snapshot: renderSnapshot, today: renderToday, sma: renderSma, performance: renderPerformance, profile: renderProfile })[sub](m, $('#d-content'));
  }

  /* ---------- draft (edit session) ---------- */
  function newRow(t, w) { return { ticker: t, weight: w, nw: w, tt: '-', dnb: false, dns: false, notes: '', added: false }; }
  function getDraft(m) {
    if (!m.draft) m.draft = { rows: m.holdings.map(function (h) { return newRow(h.ticker, h.weight); }), live: false };
    if (!m.draft.rows.some(function (r) { return r.ticker === CASH; })) m.draft.rows.unshift(newRow(CASH, 0));
    return m.draft;
  }
  function rowOf(d, t) { for (var i = 0; i < d.rows.length; i++) if (d.rows[i].ticker === t) return d.rows[i]; return null; }
  function draftTotal(d) { var s = 0; for (var i = 0; i < d.rows.length; i++) s += (+d.rows[i].nw || 0); return round3(s); }
  function badWeight(v) { return v === '' || isNaN(+v) || +v < 0 || +v > 100; }
  function diff(m, d) {
    var base = {}, seen = {}, changes = [];
    m.holdings.forEach(function (h) { base[h.ticker] = h.weight; });
    d.rows.forEach(function (r) {
      seen[r.ticker] = 1;
      var from = base[r.ticker] || 0, to = round3(+r.nw || 0);
      if (Math.abs(to - from) > EPS || (r.added && !(r.ticker in base))) changes.push({ ticker: r.ticker, from: from, to: to });
    });
    m.holdings.forEach(function (h) { if (!seen[h.ticker]) changes.push({ ticker: h.ticker, from: h.weight, to: 0 }); });
    var other = d.rows.some(function (r) { return r.tt !== '-' || r.dnb || r.dns || r.notes; });
    return { changes: changes, dirty: changes.length > 0 || other };
  }
  /* First edit puts the model In Progress and locks it to the current user. */
  function touch(m) {
    var d = getDraft(m);
    if (!d.live) {
      d.live = true;
      d.prev = { status: m.status, modified: m.modified, modifiedUser: m.modifiedUser };
      m.status = 'In Progress'; m.modified = nowStamp(); m.modifiedUser = persona.user;
      var meta = $('#d-meta'); if (meta) meta.innerHTML = metaHtml(m);
    }
    save();
  }
  function discardDraft(m) {
    var d = m.draft;
    if (d && d.live && d.prev) { m.status = d.prev.status; m.modified = d.prev.modified; m.modifiedUser = d.prev.modifiedUser; }
    delete m.draft;
    save();
  }

  /* ---------- Model Details ---------- */
  var MD_COLS = [
    { key: 'ticker', label: 'Ticker', w: 92 }, { key: 'desc', label: 'Description', w: 196 }, { key: 'id', label: 'CUSIP', w: 98 },
    { key: 'price', label: 'Price ($)', w: 100, r: 1 }, { key: 'weight', label: 'Weight', w: 84, r: 1 }, { key: 'nw', label: 'New Weight', w: 132, r: 1 },
    { key: 'chg', label: 'Weight Change', w: 112, r: 1 }, { key: null, label: 'Trade Type', w: 200 }, { key: null, label: 'Do Not Buy', w: 84 },
    { key: null, label: 'Do Not Sell', w: 84 }, { key: null, label: 'Notes', w: 262 }, { key: null, label: '', w: 84 }
  ];
  var MD_COLGROUP = '<colgroup>' + MD_COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join('') + '</colgroup>';
  var TT_OPTS = {};
  SEED.tradeTypes.forEach(function (sel) {
    TT_OPTS[sel] = SEED.tradeTypes.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
  });

  function renderModelDetails(m, c) {
    c.innerHTML =
      '<div class="md-bar">' +
        '<div class="add-wrap"><span class="lbl">Add Ticker/CUSIP/CINS/SEDOL (For UCITS must use CINS)</span><div class="add-row"><input id="md-add" placeholder="Eg. AAPL,AMZN,MSFT" autocomplete="off"><button class="btn" data-act="md-add">Add</button></div></div>' +
        '<div class="md-actions"><span class="mt">Model Type: ' + esc(m.type) + '</span>' +
          '<button data-act="md-trade-all">' + I.refresh + 'Trade All To Target</button>' +
          '<button data-act="md-import">' + I.excel + 'Import</button>' +
          '<button data-act="md-template">' + I.excel + 'Download Template</button></div>' +
      '</div>' +
      '<div class="grid-scroll md-scroll"><table class="grid md-grid" id="md-table"></table></div>' +
      '<div id="md-foot" class="md-foot"></div>' +
      '<div class="md-buttons"><button class="btn btn-text" data-act="md-clear" data-acc="' + esc(m.access) + '">Clear</button><button class="btn btn-tan" id="md-submit" data-act="md-submit" data-acc="' + esc(m.access) + '">Submit</button><button class="btn btn-black" id="md-confirm" data-act="md-confirm" data-acc="' + esc(m.access) + '">Confirm</button></div>';
    renderMdTable(m);
    bindMdTable(m);
    $('#md-add').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSecurities(m); });
  }
  function mdSorted(m, d) {
    var s = S.detailSort[m.access] || { key: 'ticker', dir: 1 };
    var cash = [], rest = [];
    d.rows.forEach(function (r) { (r.ticker === CASH ? cash : rest).push(r); });
    rest.sort(function (a, b) {
      var sa = secFor(a.ticker), sb = secFor(b.ticker), va, vb;
      switch (s.key) {
        case 'desc': va = sa.desc; vb = sb.desc; break;
        case 'id': va = sa.id; vb = sb.id; break;
        case 'price': va = sa.price; vb = sb.price; break;
        case 'weight': va = a.weight; vb = b.weight; break;
        case 'nw': va = +a.nw; vb = +b.nw; break;
        case 'chg': va = a.nw - a.weight; vb = b.nw - b.weight; break;
        default: va = a.ticker; vb = b.ticker;
      }
      if (typeof va === 'number') return (va - vb) * s.dir;
      return (va < vb ? -1 : va > vb ? 1 : 0) * s.dir;
    });
    return { rows: cash.concat(rest), sort: s };
  }
  function chgHtml(r) {
    var v = round3((+r.nw || 0) - r.weight);
    if (v > EPS) return '<span class="pos">+' + v.toFixed(3) + '% <i class="arr">&#9650;</i></span>';
    if (v < -EPS) return '<span class="neg">' + v.toFixed(3) + '% <i class="arr">&#9660;</i></span>';
    return '<span>0.000%</span>';
  }
  var EOD_TIP = 'Last end-of-day price as of ' + fmt.day(EOD) + ' close';
  function mdRowHtml(r) {
    var sec = secFor(r.ticker) || { desc: '', id: '', price: 0 };
    var isCash = r.ticker === CASH, t = esc(r.ticker);
    return '<tr class="' + (r.added ? 'added' : '') + '" data-row="' + t + '">' +
      '<td>' + t + '</td>' +
      '<td data-tip="' + esc(sec.desc) + '" data-tip-trunc>' + esc(sec.desc) + '</td>' +
      '<td>' + esc(sec.id) + '</td>' +
      '<td class="r">$' + num(sec.price, 2) + (sec.info ? '<span class="ii pi" data-tip="' + EOD_TIP + '" data-tip-anchor>' + I.info + '</span>' : '<span class="pi-sp"></span>') + '</td>' +
      '<td class="r">' + r.weight.toFixed(3) + '%</td>' +
      '<td class="r"><input class="nw' + (badWeight(r.nw) ? ' bad' : '') + '" data-t="' + t + '" value="' + (isNaN(+r.nw) ? esc(r.nw) : (+r.nw).toFixed(3)) + '" inputmode="decimal" autocomplete="off"></td>' +
      '<td class="r" data-chg>' + chgHtml(r) + '</td>' +
      '<td>' + (isCash ? '' : '<select data-tt="' + t + '">' + TT_OPTS[r.tt] + '</select>') + '</td>' +
      '<td>' + (isCash ? '' : '<input type="checkbox" class="cbx" data-dnb="' + t + '"' + (r.dnb ? ' checked' : '') + '>') + '</td>' +
      '<td>' + (isCash ? '' : '<input type="checkbox" class="cbx" data-dns="' + t + '"' + (r.dns ? ' checked' : '') + '>') + '</td>' +
      '<td>' + (isCash ? '' : '<input class="notes" data-notes="' + t + '" placeholder="Add notes..." value="' + esc(r.notes) + '" autocomplete="off">') + '</td>' +
      '<td class="c">' + (isCash ? '' : '<button class="del" data-act="md-delete" data-t="' + t + '" data-acc="' + '">Delete</button>') + '</td>' +
    '</tr>';
  }
  function renderMdTable(m) {
    var d = getDraft(m), o = mdSorted(m, d);
    var head = '<thead><tr>' + MD_COLS.map(function (c) {
      var s = c.key && o.sort.key === c.key ? '<span class="sort">' + (o.sort.dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
      return '<th class="' + (c.r ? 'r' : '') + '"' + (c.key ? ' data-act="md-sort" data-key="' + c.key + '" data-acc="' + esc(m.access) + '"' : ' style="cursor:default"') + '>' + c.label + s + '</th>';
    }).join('') + '</tr></thead>';
    $('#md-table').innerHTML = MD_COLGROUP + head + '<tbody>' + o.rows.map(mdRowHtml).join('') + '</tbody>';
    $('#md-foot').innerHTML = '<table class="grid md-grid">' + MD_COLGROUP + '<tr><td colspan="5"></td><td class="r"><span id="md-total"></span></td><td colspan="6"></td></tr></table>';
    var sc = $('.md-scroll'); $('#md-foot').scrollLeft = sc.scrollLeft;
    updateTotals(m);
  }
  /* Auto-cash: USD Cash absorbs every change to the other weights so the model stays at 100%.
     Raising a weight draws from cash; if cash would go negative it is flagged and Submit is blocked. */
  function syncCash(m, paint) {
    var d = getDraft(m), cash = rowOf(d, CASH), others = 0;
    for (var i = 0; i < d.rows.length; i++) { var r = d.rows[i]; if (r !== cash && !isNaN(+r.nw)) others += +r.nw || 0; }
    cash.nw = round3(100 - others);
    if (Math.abs(cash.nw) < EPS) cash.nw = 0;
    if (!paint) return;
    var inp = $('input.nw[data-t="' + CASH + '"]');
    if (inp) {
      if (document.activeElement !== inp) inp.value = cash.nw.toFixed(3);
      inp.classList.toggle('bad', badWeight(cash.nw));
      inp.classList.remove('flash'); void inp.offsetWidth; inp.classList.add('flash');
      inp.closest('tr').querySelector('[data-chg]').innerHTML = chgHtml(cash);
    }
  }
  /* Recompute total + button states. O(rows); runs on every keystroke. */
  function updateTotals(m) {
    var d = getDraft(m), total = draftTotal(d), off = Math.abs(total - 100) > EPS;
    var te = $('#md-total');
    if (te) { te.textContent = 'Total: ' + total.toFixed(3) + '%'; te.className = off ? 'neg' : ''; te.setAttribute('data-tip', off ? 'Weights must total 100.000% (' + (total > 100 ? 'over by ' : 'short by ') + Math.abs(round3(total - 100)).toFixed(3) + '%)' : ''); te.toggleAttribute('data-tip-anchor', off); }
    var df = diff(m, d), cashRow = rowOf(d, CASH), invalid = d.rows.some(function (r) { return r !== cashRow && badWeight(r.nw); });
    var subWhy = invalid ? 'Each new weight must be a number between 0 and 100' :
      +cashRow.nw < -EPS ? 'Allocations exceed 100%. USD Cash would be ' + (+cashRow.nw).toFixed(3) + '%. Reduce other weights to submit.' :
      off ? 'Weights must total 100.000% to submit. Current total: ' + total.toFixed(3) + '%' :
      !df.dirty ? 'No changes to submit' : '';
    var confWhy = confirmedHere === m.access ? 'Model already confirmed at ' + fmt.conf(m.confirmed) + '.' :
      df.dirty ? 'Confirm is available only when the model has no changes. Submit or clear your changes first.' : '';
    setBtn($('#md-submit'), subWhy);
    setBtn($('#md-confirm'), confWhy);
  }
  function setBtn(b, why) {
    if (!b) return;
    b.classList.toggle('is-disabled', !!why);
    b.setAttribute('aria-disabled', why ? 'true' : 'false');
    if (why) { b.setAttribute('data-tip', why); b.setAttribute('data-tip-anchor', ''); }
    else { b.removeAttribute('data-tip'); b.removeAttribute('data-tip-anchor'); }
    if (tipFor === b) hideTip();
  }
  function bindMdTable(m) {
    var tbl = $('#md-table'), sc = $('.md-scroll'), foot = $('#md-foot');
    sc.addEventListener('scroll', function () { foot.scrollLeft = sc.scrollLeft; }, { passive: true });
    tbl.addEventListener('input', function (e) {
      var el = e.target, d = getDraft(m), t;
      if (el.classList.contains('nw')) {
        var row = rowOf(d, el.getAttribute('data-t'));
        row.nw = el.value.trim() === '' ? '' : (isNaN(+el.value) ? el.value : +el.value);
        el.classList.toggle('bad', badWeight(row.nw));
        el.closest('tr').querySelector('[data-chg]').innerHTML = chgHtml(row);
        if (row.ticker !== CASH) syncCash(m, true);
        touch(m); updateTotals(m);
      } else if ((t = el.getAttribute('data-notes'))) { rowOf(d, t).notes = el.value; touch(m); updateTotals(m); }
    });
    tbl.addEventListener('change', function (e) {
      var el = e.target, d = getDraft(m), t;
      if ((t = el.getAttribute('data-tt'))) rowOf(d, t).tt = el.value;
      else if ((t = el.getAttribute('data-dnb'))) rowOf(d, t).dnb = el.checked;
      else if ((t = el.getAttribute('data-dns'))) rowOf(d, t).dns = el.checked;
      else if (el.classList.contains('nw')) { if (!badWeight(el.value)) el.value = (+el.value).toFixed(3); return; }
      else return;
      touch(m); updateTotals(m);
    });
    tbl.addEventListener('keydown', function (e) {
      // Enter / arrow keys move between New Weight cells, like a spreadsheet
      if (!e.target.classList.contains('nw') || ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var all = $$('input.nw', tbl), i = all.indexOf(e.target), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (all[j]) { e.preventDefault(); all[j].focus(); all[j].select(); }
    });
    tbl.addEventListener('focusin', function (e) { if (e.target.classList.contains('nw')) e.target.select(); });
  }

  function resolveSecurity(token) {
    var t = token.trim().toUpperCase();
    if (!t) return null;
    if (SEC[t]) return t;
    if (SEED.securitiesById[t]) return SEED.securitiesById[t];
    return null;
  }
  function addError(m, tok, msg) {
    logEvent(m, { ts: nowStamp(), event: 'Error When Adding Security', user: persona.user, details: 'Ticker/CUSIP = ' + tok + '\nERROR: ' + msg });
    return tok + ': ' + msg;
  }
  /* Shared validation (Add box + Import). Returns {t} or {err} using production error wording. */
  function checkSecurity(m, tok, d) {
    tok = String(tok).trim().toUpperCase();
    var t = resolveSecurity(tok);
    if (!t) return { err: 'Invalid security. Not added to model.' };
    var s = SEC[t];
    if (s.error) return { t: t, err: s.error };
    if (s.group === 'afunds' && m.kind !== 'afunds') return { t: t, err: 'Mutual fund not eligible for program. Not added to model.' };
    if (m.kind === 'ucits' && t === tok && s.ucits) return { t: t, err: 'UCITS securities must be added by CINS. Not added to model.' };
    if (d && rowOf(d, t)) return { t: t, err: 'Duplicate security. Not added to model' };
    return { t: t };
  }
  function addSecurities(m) {
    var input = $('#md-add'), tokens = input.value.split(/[,\s]+/).filter(Boolean);
    if (!tokens.length) { toast('Please enter a Ticker, CUSIP, CINS or SEDOL'); return; }
    var d = getDraft(m), added = [], errs = [];
    tokens.forEach(function (raw) {
      var tok = raw.toUpperCase(), c = checkSecurity(m, tok, d);
      if (c.err) { errs.push(addError(m, tok, c.err)); return; }
      var r = newRow(c.t, 0); r.added = true; d.rows.push(r);
      added.push(c.t);
    });
    errs.forEach(function (msg) { toast(msg); });
    if (added.length) { input.value = ''; touch(m); renderMdTable(m); toast('Added ' + added.join(', ') + ' to model', 'ok'); var el = $('input.nw[data-t="' + added[added.length - 1] + '"]'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }
    else save();
  }
  /* DELETE (as in production): removes the row and moves its new weight into cash. */
  function deleteRow(m, t) {
    var d = getDraft(m), r = rowOf(d, t), cash = rowOf(d, CASH);
    if (!r) return;
    var w = badWeight(r.nw) ? 0 : +r.nw;
    cash.nw = round3((+cash.nw || 0) + w);
    d.rows = d.rows.filter(function (x) { return x !== r; });
    touch(m); renderMdTable(m);
    toast(t + ' deleted. ' + w.toFixed(3) + '% moved to USD Cash.', 'ok');
  }

  /* SUBMIT: warn (but allow) when securities are set to 0.000%, then apply + show the approval card. */
  function submitModel(m) {
    var b = $('#md-submit');
    if (b && b.classList.contains('is-disabled')) return;
    var zero = getDraft(m).rows.filter(function (r) { return r.ticker !== CASH && Math.abs(+r.nw || 0) < EPS; });
    if (!zero.length) { doSubmit(m); return; }
    var list = zero.map(function (r) { var s = SEC[r.ticker]; return '<li><b>' + esc(r.ticker) + '</b><span>' + esc(s ? s.desc : '') + '</span><em>' + r.weight.toFixed(3) + '% &rarr; 0.000%</em></li>'; }).join('');
    modal({
      cls: 'warnz', icon: '<span class="mh-ic">' + I.warn + '</span>',
      title: zero.length === 1 ? 'Security Set To 0.000%' : zero.length + ' Securities Set To 0.000%',
      body: '<p>The following ' + (zero.length === 1 ? 'security has' : 'securities have') + ' a new weight of 0.000% and will be removed from the model when you submit.</p><ul class="zero-list">' + list + '</ul>',
      foot: '<button class="btn btn-text" data-act="close-modal">Go Back</button><button class="btn btn-tan" data-act="submit-anyway" data-acc="' + esc(m.access) + '" autofocus>Submit Anyway</button>'
    });
  }
  /* Applies the draft to the model and logs it. Shared by SUBMIT and bulk import. */
  function applySubmit(m, extra) {
    var d = getDraft(m), df = diff(m, d), ts = nowStamp();
    m.holdings = d.rows.filter(function (r) { return +r.nw > EPS || r.ticker === CASH; }).map(function (r) { return { ticker: r.ticker, weight: round3(+r.nw) }; });
    m.holdings.sort(function (a, b) { return a.ticker === CASH ? -1 : b.ticker === CASH ? 1 : a.ticker < b.ticker ? -1 : 1; });
    m.status = 'Approved'; m.modified = ts; m.modifiedUser = persona.user;
    m.snapshots[todayISO()] = m.holdings.map(function (h) { return { ticker: h.ticker, weight: h.weight }; });
    if (extra) logEvent(m, { ts: ts, event: 'Model Imported', user: persona.user, details: extra });
    logEvent(m, { ts: ts, event: isAdmin() ? 'Model Updated By Admin' : 'Model Updated', user: persona.user, details: '-', changes: df.changes });
    logEvent(m, { ts: ts, event: 'Model Approved', user: persona.user, details: '-', changes: df.changes });
    delete m.draft;
    save();
    return { changes: df.changes, ts: ts };
  }
  function changeSummary(changes) {
    var moved = changes.filter(function (c) { return c.ticker !== CASH; });
    var removed = moved.filter(function (c) { return c.to < EPS; }).length, added = moved.filter(function (c) { return c.from < EPS; }).length;
    var parts = [moved.length + ' weight change' + (moved.length === 1 ? '' : 's')];
    if (added) parts.push(added + ' added'); if (removed) parts.push(removed + ' removed');
    return parts.join(' · ');
  }
  function doSubmit(m) {
    var res = applySubmit(m);
    route();
    successCard(m, 'Model Approved', changeSummary(res.changes), res.ts);
  }
  /* CONFIRM: once per visit to the model screen. */
  var confirmedHere = null;
  function confirmModel(m) {
    var b = $('#md-confirm');
    if (b && b.classList.contains('is-disabled')) return;
    discardDraft(m);
    var ts = nowStamp();
    m.confirmed = ts; m.confirmedUser = persona.user;
    if (m.status === 'In Progress') m.status = 'Approved';
    m.snapshots[todayISO()] = m.holdings.map(function (h) { return { ticker: h.ticker, weight: h.weight }; });
    logEvent(m, { ts: ts, event: 'Confirmed', user: persona.user, details: 'Model Confirmed' });
    save(); route();
    confirmedHere = m.access;
    updateTotals(m);
    successCard(m, 'Model Confirmed', 'Current weights confirmed', ts);
  }
  /* Success card: clear, unobtrusive, dismisses itself (pauses while hovered). */
  var cardTimer = null;
  function successCard(m, title, detail, ts) {
    var root = $('#success-root');
    clearTimeout(cardTimer);
    root.innerHTML = '<div class="okcard" role="status" aria-live="polite"><div class="okc-ic">' + I.ok + '</div><div class="okc-b">' +
      '<div class="okc-t">' + esc(title) + '</div><div class="okc-n">' + esc(m.name) + ' <span>' + esc(m.access) + '</span></div>' +
      '<div class="okc-d">' + esc(detail) + ' &middot; ' + fmt.conf(ts).split(' ').slice(1).join(' ') + '</div>' +
      '<div class="okc-a">' + (m.access ? '<button data-act="audit" data-acc="' + esc(m.access) + '">View Audit Trail</button>' : '') + '<button data-act="card-close">Dismiss</button></div></div>' +
      '<button class="x" data-act="card-close" aria-label="Dismiss">&times;</button><i class="okc-bar"></i></div>';
    var card = root.firstChild, left = 5000, started = Date.now();
    function arm() { started = Date.now(); card.querySelector('.okc-bar').style.animationPlayState = 'running'; cardTimer = setTimeout(closeCard, left); }
    card.addEventListener('mouseenter', function () { clearTimeout(cardTimer); left -= Date.now() - started; card.querySelector('.okc-bar').style.animationPlayState = 'paused'; });
    card.addEventListener('mouseleave', arm);
    arm();
  }
  function closeCard() {
    clearTimeout(cardTimer);
    var c = $('#success-root .okcard');
    if (!c) return;
    c.classList.add('out');
    setTimeout(function () { if (c.parentNode) c.remove(); }, 180);
  }
  /* ---- Excel template (mirrors the production DYNAMIC/STATIC_MODEL_Template "Import" sheet) ---- */
  var TEMPLATE_COLS = [
    { h: 'Security (Required, if CUSIP is blank)', w: 24, required: 1, key: 'security' },
    { h: 'CUSIP (Required, if Security is blank)', w: 24, required: 1, key: 'cusip' },
    { h: 'Description', w: 34, key: 'desc' },
    { h: 'InvestmentType', w: 16, key: 'itype' },
    { h: 'Price', w: 11, fmt: 'price', key: 'price' },
    { h: 'Weight (Required, Blank defaults to Zero)', w: 22, required: 1, fmt: 'weight', key: 'weight' },
    { h: 'Difference', w: 12, fmt: 'weight', key: 'diff' },
    { h: 'DoNotBuy', w: 11, list: ['Y', 'N'], key: 'dnb' },
    { h: 'DoNotSell', w: 11, list: ['Y', 'N'], key: 'dns' },
    { h: 'TradeType (Required)', w: 28, required: 1, list: SEED.tradeTypes.slice(1), key: 'tt' }
  ];
  function downloadTemplate(m) {
    var name = (m && m.type ? m.type.toUpperCase() : 'MODEL') + '_MODEL_Template.xlsx';
    window.MDPXlsx.write(name, 'Import', TEMPLATE_COLS, [], { blankRows: 60, title: name.replace('.xlsx', '') });
  }
  function investmentType(s) {
    if (!s) return '';
    if (s.group === 'afunds') return 'Mutual Fund';
    if (/ETF|ETC|TRUST|SPDR|SHARES/.test(s.desc)) return 'ETF';
    return 'Equity';
  }


  /* ---------- Model Options ---------- */
  function renderOptions(m, c) {
    c.innerHTML = '<div class="opt-wrap"><span class="lbl">Tax Loss Harvest Replacement</span><div class="opt-row"><input id="tlh" placeholder="Eg. SPY" value="' + esc(m.tlh) + '" autocomplete="off"><button class="btn btn-black" data-act="tlh-submit" data-acc="' + esc(m.access) + '">Submit</button></div></div>';
    $('#tlh').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('[data-act="tlh-submit"]').click(); });
  }

  /* ---------- Model Snapshot ----------
   * Proposed UX (default): open on the latest saved snapshot, mark saved dates in the
   * calendar, step between saved snapshots, and show any error inline next to the date.
   * ?ux=current reproduces production: previous business day + red ribbon at the top.
   */
  var SNAP_COLS = '<colgroup><col style="width:13%"><col style="width:20%"><col style="width:15%"><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col></colgroup>';
  function snapDates(m) { return Object.keys(m.snapshots || {}).filter(function (d) { return d <= todayISO(); }).sort().reverse(); }
  function snapNav(m, date) {
    var list = snapDates(m), older = null, newer = null;
    for (var i = 0; i < list.length; i++) { if (list[i] < date) { older = list[i]; break; } }
    for (var j = list.length - 1; j >= 0; j--) { if (list[j] > date) { newer = list[j]; break; } }
    return { list: list, older: older, newer: newer, latest: list[0] || null };
  }
  function renderSnapshot(m, c) {
    var nav0 = snapNav(m, '9999');
    var date = S.snapDate[m.access] || (UX_CURRENT ? EOD : nav0.latest || EOD);
    var snap = m.snapshots[date], nav = snapNav(m, date);
    var body = '', totW = 0, totMv = 0;
    if (snap) {
      snap = snap.slice().sort(function (a, b) { return a.ticker === CASH ? -1 : b.ticker === CASH ? 1 : a.ticker < b.ticker ? -1 : 1; });
      body = snap.map(function (r) {
        var sec = secFor(r.ticker) || { desc: '', id: '', price: 1 };
        var mv = m.aum * r.weight / 100, cash = r.ticker === CASH;
        totW += r.weight; totMv += mv;
        return '<tr><td>' + esc(r.ticker) + '</td><td>' + esc(sec.desc) + '</td><td>' + esc(sec.id) + '</td><td class="r">$' + num(sec.price, 2) + '</td><td class="r">' + r.weight.toFixed(3) + '%</td><td class="r">' + (cash ? '-' : num(mv * 1e6 / sec.price, 2)) + '</td><td class="r">' + num(mv, 2) + '</td><td></td></tr>';
      }).join('');
    }
    var cellB = ' style="border-top:1px solid #555;font-weight:700"';
    var A = ' data-acc="' + esc(m.access) + '"', bar;
    if (UX_CURRENT) {
      bar = '<div class="snap-bar">Select Date: <div class="ctl cal" data-act="dp-snap"' + A + ' data-dp-anchor><span class="txt">' + fmt.day(date) + '</span>' + I.cal + '</div></div>';
    } else {
      var msg = snap
        ? '<div class="snap-info">Showing snapshot saved ' + fmt.day(date) + (date === nav.latest ? ' (latest)' : '') + ' &middot; ' + nav.list.length + ' saved</div>'
        : '<div class="snap-alert" role="alert">' + I.errBang + '<span>' + (nav.list.length ? 'No snapshot saved for ' + fmt.day(date) + '.' : 'No snapshots have been saved for this model yet.') + '</span>' +
            (nav.latest ? '<button data-act="snap-go" data-date="' + nav.latest + '"' + A + '>View latest (' + fmt.day(nav.latest) + ')</button>' : '') + '</div>';
      bar = '<div class="snap-bar">' + msg + '<span class="snap-lbl">Select Date:</span>' +
        '<button class="snap-step' + (nav.older ? '' : ' is-disabled') + '" data-act="snap-go"' + A + (nav.older ? ' data-date="' + nav.older + '" data-tip="Previous snapshot: ' + fmt.day(nav.older) + '"' : ' data-tip="No older snapshot"') + ' data-tip-anchor aria-label="Previous snapshot">' + I.prev + '</button>' +
        '<div class="ctl cal' + (snap ? '' : ' err') + '" data-act="dp-snap"' + A + ' data-dp-anchor><span class="txt">' + fmt.day(date) + '</span>' + I.cal + '</div>' +
        '<button class="snap-step' + (nav.newer ? '' : ' is-disabled') + '" data-act="snap-go"' + A + (nav.newer ? ' data-date="' + nav.newer + '" data-tip="Next snapshot: ' + fmt.day(nav.newer) + '"' : ' data-tip="No newer snapshot"') + ' data-tip-anchor aria-label="Next snapshot">' + I.next + '</button></div>';
    }
    c.innerHTML = bar +
      '<div class="grid-scroll snap-scroll"><table class="grid snap-grid">' + SNAP_COLS + '<thead><tr><th>Ticker</th><th>Description</th><th>CUSIP</th><th class="r">Price ($)</th><th class="r">Weight</th><th class="r">Quantity</th><th class="r">Market Value (M)</th><th></th></tr></thead><tbody>' + body + '</tbody></table>' +
        (snap ? '' : '<div class="no-rows">No Rows To Show</div>') + '</div>' +
      '<table class="grid snap-total">' + SNAP_COLS + '<tr><td colspan="4"' + cellB + '></td><td class="r"' + cellB + '>Total: ' + round3(totW).toFixed(3) + '%</td><td' + cellB + '></td><td class="r"' + cellB + '>Total: ' + num(totMv, 2) + '</td><td' + cellB + '></td></tr></table>';
    if (!snap && UX_CURRENT) showRibbon('Model snapshot not saved for selected date');
  }
  var ribbon = $('#ribbon');
  function showRibbon(msg) { ribbon.innerHTML = I.errBang + '<span>' + esc(msg) + '</span>'; ribbon.hidden = false; }

  /* ---------- Communication ---------- */
  function renderToday(m, c) {
    var today = todayISO();
    var ev = eventsDesc(m).filter(function (e) { return e.ts.slice(0, 10) === today; });
    c.innerHTML = '<div class="comm-list"><table class="grid comm-grid"><colgroup><col style="width:30%"><col style="width:24%"><col style="width:20%"><col></colgroup><thead><tr><th>Timestamp</th><th>Event</th><th>User</th><th>Details</th></tr></thead><tbody>' +
      ev.map(function (e) { return '<tr><td>' + fmt.full(e.ts) + '</td><td>' + esc(e.event) + '</td><td>' + esc(e.user) + '</td><td class="det" data-tip="' + esc(e.details) + '" data-tip-trunc>' + esc(e.details) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function renderSma(m, c) {
    c.innerHTML = '<div class="comm-box">' + (m.communications || []).map(function (x) {
      return '<div class="comm-msg"><div class="h">' + fmt.full(x.ts) + ' &middot; ' + esc(x.user) + '</div>' + esc(x.text) + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- Analysis ---------- */
  function renderPerformance(m, c) {
    c.innerHTML = '<div class="perf"><h3>Performance Reports</h3><a data-act="perf-profile" data-acc="' + esc(m.access) + '">Most Recent Profile</a></div>';
  }
  function showProfileReport(m) {
    var eq = 0, fi = 0, cash = 0;
    m.holdings.forEach(function (h) {
      if (h.ticker === CASH) { cash += h.weight; return; }
      var s = SEC[h.ticker] || {}, g = s.group, desc = s.desc || '';
      if (g !== 'growth' && g !== 'value' && /BOND|BD|TREAS|MUNI|INCOME|SHORT DURATION|T-BILL|GOVT|SECURITIES FD|CORP/.test(desc)) fi += h.weight; else eq += h.weight;
    });
    var top = m.holdings.filter(function (h) { return h.ticker !== CASH; }).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 10);
    var body = '<div class="prof-sum">' +
      '<div><span class="k">Manager</span><span class="v">' + esc(m.manager) + '</span></div>' +
      '<div><span class="k">Holdings</span><span class="v">' + (m.holdings.length - 1) + '</span></div>' +
      '<div><span class="k">AUM (M)</span><span class="v">' + num(m.aum, 2) + '</span></div>' +
      '<div><span class="k">Accounts</span><span class="v">' + num(m.accounts, 0) + '</span></div>' +
      '<div><span class="k">Equity</span><span class="v">' + eq.toFixed(1) + '%</span></div>' +
      '<div><span class="k">Fixed Income</span><span class="v">' + fi.toFixed(1) + '%</span></div>' +
      '<div><span class="k">Cash</span><span class="v">' + cash.toFixed(1) + '%</span></div>' +
      '<div><span class="k">As of</span><span class="v">' + fmt.day(EOD) + '</span></div></div>' +
      '<table class="grid"><colgroup><col style="width:90px"><col><col style="width:90px"><col style="width:200px"></colgroup><thead><tr><th>Ticker</th><th>Top 10 Holdings</th><th class="r">Weight</th><th></th></tr></thead><tbody>' +
      top.map(function (h) { return '<tr><td>' + esc(h.ticker) + '</td><td>' + esc((SEC[h.ticker] || {}).desc) + '</td><td class="r">' + h.weight.toFixed(3) + '%</td><td><div class="bar"><i style="width:' + Math.min(100, h.weight / top[0].weight * 100) + '%"></i></div></td></tr>'; }).join('') +
      '</tbody></table>';
    modal({ title: 'Most Recent Profile', sub: '<div class="sub">' + esc(m.name) + '  |  ' + esc(m.access) + '</div>', body: body, foot: '<button class="btn btn-tan" data-act="print">Print</button><button class="btn btn-dark" data-act="close-modal">Close</button>' });
  }
  function renderProfile(m, c) {
    c.innerHTML =
      '<div class="prof-grid">' +
        '<div><span class="k">Manager</span><span class="v">' + esc(m.manager) + '</span></div>' +
        '<div><span class="k">Strategy Name</span><span class="v">' + esc(m.name) + '</span></div>' +
        '<div><span class="k">Investment Minimum</span><span class="v">' + esc(m.minimum) + '</span></div>' +
        '<div><span class="k">Access FOA</span><span class="v">' + esc(m.access) + '</span></div>' +
        '<div><span class="k">SWP/AAP</span><span class="v">' + esc(m.swp) + '</span></div>' +
        '<div><span class="k">Communication Email(s)</span><span class="v">' + esc(m.emails) + '</span></div>' +
      '</div>' +
      '<div class="users-card"><div class="users-head"><h3>Users</h3><label class="search-box">' + I.search + '<input id="users-q" placeholder="Search" autocomplete="off"></label></div>' +
      '<table class="grid users-grid"><colgroup><col style="width:40%"><col style="width:34%"><col></colgroup><thead><tr><th>Name</th><th>User Email</th><th>Phone Number</th></tr></thead><tbody id="users-body"></tbody></table></div>';
    function draw(q) {
      q = (q || '').toLowerCase();
      var rows = m.users.filter(function (u) { return !q || u.join(' ').toLowerCase().indexOf(q) > -1; });
      $('#users-body').innerHTML = rows.length ? rows.map(function (u) { return '<tr><td>' + esc(u[0]) + '</td><td>' + esc(u[1]) + '</td><td>' + esc(u[2]) + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="3">No Rows To Show</td></tr>';
    }
    draw('');
    $('#users-q').addEventListener('input', function (e) { draw(e.target.value); });
  }

  /* =====================================================================
   * IMPROVEMENTS LOG — net new vs production (data in js/improvements.js)
   * ===================================================================== */
  var IMPS = window.MDP_IMPROVEMENTS || [], impState = { area: 'All', q: '' };
  function improvementsBtn() { return IMPS.length ? '<a class="btn-imps" href="#/improvements" data-tip="Everything in this twin that is new vs. production" data-tip-anchor>Improvements <b>' + IMPS.length + '</b></a>' : ''; }
  function impFiltered() {
    var q = impState.q.trim().toLowerCase();
    return IMPS.filter(function (x) {
      if (impState.area !== 'All' && x.area !== impState.area) return false;
      return !q || (x.id + ' ' + x.area + ' ' + x.title + ' ' + x.today + ' ' + x.change + ' ' + x.why).toLowerCase().indexOf(q) > -1;
    });
  }
  function renderImprovements() {
    var areas = ['All'];
    IMPS.forEach(function (x) { if (areas.indexOf(x.area) < 0) areas.push(x.area); });
    var latest = IMPS.reduce(function (a, x) { return x.added > a ? x.added : a; }, '');
    app.innerHTML =
      '<div class="banner detail"><a class="crumb" href="#/">' + I.left + 'Model List</a><h1>Model Delivery Portal</h1><button class="btn-support">Support</button></div>' +
      '<div class="page">' +
        '<section class="card ml-head">' +
          '<div class="ml-title">Improvements</div>' +
          '<div class="kv mgr"><span class="k">Net new vs. current production Model Delivery Portal</span><span class="v">' + IMPS.length + ' improvements &middot; ' + (areas.length - 1) + ' areas &middot; last updated ' + fmt.day(latest) + '</span></div>' +
          '<div class="ml-tools"><label class="search-box">' + I.search + '<input id="imp-q" placeholder="Search" value="' + esc(impState.q) + '" autocomplete="off"></label>' +
            '<button class="tool-link" data-act="imps-copy">Copy</button>' +
            '<button class="icon-btn" data-act="imps-xlsx" data-tip="Download Excel" data-tip-anchor>' + I.download + '</button>' +
            '<button class="icon-btn" data-act="print" data-tip="Print" data-tip-anchor>' + I.print + '</button></div>' +
        '</section>' +
        '<section class="card grid-card imps-card">' +
          '<div class="imps-bar"><div class="fchips">' + areas.map(function (a) {
            var n = a === 'All' ? IMPS.length : IMPS.filter(function (x) { return x.area === a; }).length;
            return '<button class="fchip' + (impState.area === a ? ' on' : '') + '" data-act="imps-area" data-v="' + esc(a) + '">' + esc(a) + ' <b>' + n + '</b></button>';
          }).join('') + '</div><span class="imps-legend">Status: <b>Proposed</b> = built in this twin for review with the product team</span></div>' +
          '<div class="grid-scroll imps-scroll"><table class="grid imps-grid"><colgroup><col style="width:78px"><col style="width:118px"><col style="width:30%"><col style="width:22%"><col><col style="width:104px"><col style="width:70px"></colgroup>' +
          '<thead><tr><th>ID</th><th>Area</th><th>Improvement</th><th>Today (production)</th><th>Why it matters</th><th>Status</th><th></th></tr></thead><tbody id="imps-body"></tbody></table></div>' +
        '</section>' +
      '</div>';
    drawImps();
    $('#imp-q').addEventListener('input', function (e) { impState.q = e.target.value; drawImps(); });
  }
  function drawImps() {
    var rows = impFiltered();
    $('#imps-body').innerHTML = rows.length ? rows.map(function (x) {
      return '<tr><td class="b">' + esc(x.id) + '</td><td>' + esc(x.area) + '</td>' +
        '<td><div class="imps-t">' + esc(x.title) + '</div><div class="imps-c">' + esc(x.change) + '</div></td>' +
        '<td class="imps-today">' + esc(x.today) + '</td><td>' + esc(x.why) + '</td>' +
        '<td><span class="chip new">' + esc(x.status) + '</span><div class="imps-d">' + fmt.day(x.added) + '</div></td>' +
        '<td>' + (x.try ? '<a class="lnk" href="' + esc(x.try) + '">Try it</a>' : '') + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="7">No improvements match</td></tr>';
  }

  /* =====================================================================
   * EVENTS (one delegated listener for the whole app)
   * ===================================================================== */
  document.addEventListener('click', function (e) {
    var L = S.list;
    // locked model link -> production pop-up instead of navigating
    var lk = e.target.closest('a[data-locked]');
    if (lk) { e.preventDefault(); var lm = findModel(lk.getAttribute('data-locked')); if (lm && lockedBy(lm)) { showLocked(lm); return; } location.hash = lk.getAttribute('href'); return; }
    var el = e.target.closest('[data-act]');
    if (S.ui.open && !e.target.closest('[data-ms]')) { S.ui.open = null; S.ui.q = {}; if ($('#ml-filters')) renderFilters(); }
    if (!el) return;
    var act = el.getAttribute('data-act'), acc = el.getAttribute('data-acc');
    var m = acc ? findModel(acc) : currentModel();
    var key = el.getAttribute('data-key');
    switch (act) {
      case 'noop': break;
      case 'ms-toggle': S.ui.open = S.ui.open === key ? null : key; S.ui.q = {}; renderFilters(); break;
      case 'ms-all': {
        var opts = MULTI[key].opts();
        L.pending[key] = L.pending[key].length === opts.length ? [] : opts.slice();
        refreshMulti(key); break;
      }
      case 'ms-opt': {
        var v = el.getAttribute('data-val'), arr = L.pending[key], i = arr.indexOf(v);
        if (i > -1) arr.splice(i, 1); else arr.push(v);
        refreshMulti(key); break;
      }
      case 'dp-mod': openDatePicker(el, 'range', L.pending.mod, function (v) { L.pending.mod = v; renderFilters(); }); break;
      case 'dp-conf': openDatePicker(el, 'range', L.pending.conf, function (v) { L.pending.conf = v; renderFilters(); }); break;
      case 'f-clear':
        L.pending = emptyFilters(); L.applied = emptyFilters();
        L.page = 1; S.ui.open = null; renderFilters(); renderListGrid(); break;
      case 'f-apply':
        L.applied = JSON.parse(JSON.stringify(L.pending));
        L.page = 1; S.ui.open = null; renderFilters(); renderListGrid(); break;
      case 'f-toggle': L.collapsed = !L.collapsed; renderFilters(); break;
      case 'list-sort':
        if (L.sort.key === key) { if (L.sort.dir === 1) L.sort.dir = -1; else L.sort = { key: null, dir: 1 }; }
        else L.sort = { key: key, dir: 1 };
        renderListGrid(); break;
      case 'pg': {
        var pages = Math.max(1, Math.ceil(listRows().length / L.perPage)), to = el.getAttribute('data-to');
        L.page = to === 'first' ? 1 : to === 'last' ? pages : to === 'prev' ? Math.max(1, L.page - 1) : Math.min(pages, L.page + 1);
        renderListGrid(); break;
      }
      case 'pg-go': goPage(); break;
      case 'audit': if (m) showAudit(m); break;
      case 'audit-exp': {
        var x = $('[data-x="' + el.getAttribute('data-i') + '"]');
        if (x) { x.hidden = !x.hidden; el.classList.toggle('open', !x.hidden); }
        break;
      }
      case 'close-modal': closeModal(); break;
      case 'print': window.print(); break;
      case 'list-export': {
        var LC = [{ h: 'Manager', w: 30 }, { h: 'Strategy Name', w: 44 }, { h: 'Access', w: 9 }, { h: 'SWP/AAP', w: 10 }, { h: 'Model Type', w: 12 }, { h: 'Accounts', w: 10 }, { h: 'AUM(M)', w: 11, fmt: 'price' }, { h: 'Modified User', w: 20 }, { h: 'Modified Date', w: 24 }, { h: 'Confirmed User', w: 20 }, { h: 'Confirmed Date', w: 20 }, { h: 'Status', w: 15 }];
        window.MDPXlsx.write('Model_List_' + todayISO() + '.xlsx', 'Model List', LC, listRows().map(function (x) { return [x.manager, x.name, x.access, x.swp || '-', x.type, x.accounts, x.aum, x.modifiedUser, fmt.listMod(x.modified), x.confirmedUser || '-', x.confirmed ? fmt.conf(x.confirmed) : '-', x.status]; }));
        break;
      }
      case 'model-export':
        if (m) {
          var rowsX = getDraft(m).rows.map(function (r) {
            var sx = secFor(r.ticker) || {}, nwv = +r.nw || 0;
            return [r.ticker, r.ticker === CASH ? '' : sx.id, sx.desc, r.ticker === CASH ? 'Cash' : investmentType(sx), sx.price || 0, round3(nwv), round3(nwv - r.weight), r.ticker === CASH ? '' : (r.dnb ? 'Y' : 'N'), r.ticker === CASH ? '' : (r.dns ? 'Y' : 'N'), r.ticker === CASH || r.tt === '-' ? '' : r.tt];
          });
          window.MDPXlsx.write(m.access + '_' + m.type.toUpperCase() + '_MODEL_' + todayISO() + '.xlsx', 'Import', TEMPLATE_COLS, rowsX, { blankRows: rowsX.length + 20, title: m.name });
        }
        break;
      case 'md-sort': {
        var cur = S.detailSort[acc] || { key: 'ticker', dir: 1 };
        S.detailSort[acc] = cur.key === key ? { key: key, dir: -cur.dir } : { key: key, dir: 1 };
        renderMdTable(m); break;
      }
      case 'md-add': addSecurities(m); break;
      case 'md-delete': deleteRow(m, el.getAttribute('data-t')); break;
      case 'md-trade-all': {
        var dd = getDraft(m);
        dd.rows.forEach(function (r) { if (r.ticker !== CASH) { r.tt = SEED.tradeToTarget; r.notes = 'Fully Rebalance'; } });
        touch(m); renderMdTable(m); toast('All securities set to ' + SEED.tradeToTarget + ' · Notes: Fully Rebalance', 'ok'); break;
      }
      case 'md-import': window.MDPImport.open(m ? m.access : null); break;
      case 'list-import': window.MDPImport.open(null); break;
      case 'md-template': downloadTemplate(m); break;
      case 'md-clear': discardDraft(m); route(); break;
      case 'md-submit': submitModel(m); break;
      case 'md-confirm': confirmModel(m); break;
      case 'submit-anyway': closeModal(); doSubmit(m); break;
      case 'card-close': closeCard(); break;
      case 'tlh-submit': {
        var inp = $('#tlh'), val = inp.value.trim().toUpperCase();
        if (!val) { toast('Please enter a replacement security'); break; }
        var rt = resolveSecurity(val);
        if (!rt || SEC[rt].error) { toast('Invalid security: ' + val); break; }
        m.tlh = rt; inp.value = rt;
        logEvent(m, { ts: nowStamp(), event: 'Model Options Updated', user: persona.user, details: 'Tax Loss Harvest Replacement set to ' + rt });
        save(); toast('Tax Loss Harvest Replacement saved', 'ok'); break;
      }
      case 'dp-snap': {
        var cur0 = S.snapDate[acc] || (UX_CURRENT ? EOD : snapNav(m, '9999').latest || EOD);
        openDatePicker(el, 'single', cur0, function (v) { if (v) { S.snapDate[acc] = v; route(); } },
          UX_CURRENT ? null : { avail: snapDates(m) });
        break;
      }
      case 'snap-go': {
        var dt = el.getAttribute('data-date');
        if (dt) { S.snapDate[acc] = dt; route(); }
        break;
      }
      case 'perf-profile': if (m) showProfileReport(m); break;
      case 'imps-area': impState.area = el.getAttribute('data-v'); renderImprovements(); break;
      case 'imps-xlsx':
        window.MDPXlsx.write('MDP_Twin_Improvements_' + todayISO() + '.xlsx', 'Improvements',
          [{ h: 'ID', w: 10 }, { h: 'Area', w: 16 }, { h: 'Improvement', w: 38 }, { h: 'Today (production)', w: 50 }, { h: 'Change in twin', w: 60 }, { h: 'Why it matters', w: 46 }, { h: 'Status', w: 11 }, { h: 'Added', w: 12 }],
          impFiltered().map(function (x) { return [x.id, x.area, x.title, x.today, x.change, x.why, x.status, fmt.day(x.added)]; }), { title: 'MDP Twin Improvements' });
        break;
      case 'imps-copy': {
        var txt = impFiltered().map(function (x) { return x.id + ' [' + x.area + '] ' + x.title + '\n  Today: ' + x.today + '\n  Change: ' + x.change + '\n  Why: ' + x.why; }).join('\n\n');
        var done = function () { toast('Copied ' + impFiltered().length + ' improvements. Paste into email or Teams.', 'ok'); };
        var fb = function () { var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (er) { toast('Copy failed'); } ta.remove(); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fb); else fb();
        break;
      }
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'ml-pp') { S.list.perPage = +e.target.value; S.list.page = 1; renderListGrid(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'ml-goto' && e.key === 'Enter') goPage();
    if (e.key === 'Escape') { closeModal(); closeDatePicker(); if (S.ui.open) { S.ui.open = null; if ($('#ml-filters')) renderFilters(); } }
  });
  /* ================= router ================= */
  var current = { access: null }, skipRoute = false;
  function currentModel() { return current.access ? findModel(current.access) : null; }
  function route() {
    closeDatePicker(); closeModal(); hideTip();
    toastZone.innerHTML = '';
    ribbon.hidden = true;
    // drop untouched drafts so stale weights never leak between visits
    S.models.forEach(function (m) { if (m.draft && !m.draft.live) delete m.draft; });
    var hq = location.hash.split('?'), wantImport = hq[1] === 'import';
    var h = hq[0].replace(/^#\/?/, '').split('/');
    if (h[0] === 'improvements') { current.access = null; confirmedHere = null; renderImprovements(); document.title = 'Model Delivery Portal - Improvements'; return; }
    if (h[0] !== 'model' || decodeURIComponent(h[1] || '') !== confirmedHere) confirmedHere = null;
    if (h[0] === 'model' && h[1]) {
      current.access = decodeURIComponent(h[1]);
      renderDetail(current.access, h[2] || 'info', h[3] || '');
    } else {
      current.access = null;
      renderList();
    }
    document.title = current.access ? 'Model Delivery Portal - ' + current.access : 'Model Delivery Portal - Money Manager';
    if (wantImport) setTimeout(function () { if (window.MDPImport) window.MDPImport.open(current.access && $('#md-table') ? current.access : null); }, 0);
  }
  window.addEventListener('hashchange', function () {
    if (skipRoute) { skipRoute = false; return; }
    route(); window.scrollTo(0, 0);
  });
  /* Internal API for js/import.js */
  window.MDPCore = {
    SEC: SEC, SEED: SEED, CASH: CASH, EPS: EPS, I: I, esc: esc, num: num, round3: round3, fmt: fmt, todayISO: todayISO, EOD: EOD,
    persona: persona, isAdmin: isAdmin, displayName: displayName, toast: toast, hideTip: hideTip,
    models: function () { return scopedModels(); }, findModel: findModel, lockedBy: lockedBy, currentModel: currentModel,
    getDraft: getDraft, rowOf: rowOf, newRow: newRow, touch: touch, discardDraft: discardDraft, syncCash: syncCash,
    renderMdTable: renderMdTable, updateTotals: updateTotals, checkSecurity: checkSecurity, resolveSecurity: resolveSecurity,
    applySubmit: applySubmit, changeSummary: changeSummary, successCard: successCard, logEvent: logEvent, nowStamp: nowStamp,
    parseCsv: parseCsv, save: save, route: route, onDetails: function () { return !!document.getElementById('md-table'); }
  };
  route();
})();
