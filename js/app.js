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
 */
(function () {
  'use strict';

  var SEED = window.MDP_SEED;
  var SEC = SEED.securities;
  var STORE_KEY = 'mdp-twin-v' + SEED.version;
  var app = document.getElementById('app');

  /* ================= helpers ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function num(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  /* ---- time (America/New_York) ---- */
  function nyParts(d) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' });
    var p = {};
    f.formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
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
    detailMod: function (s) { var p = parseStamp(s); return p.mo + '-' + p.d + '-' + p.y + ' ' + pad(p.h % 12 || 12) + ':' + p.mi + ':' + p.s + '.' + p.f + ' ' + (p.h < 12 ? 'AM' : 'PM'); },
    conf: function (s) { var p = parseStamp(s); return p.mo + '/' + p.d + '/' + p.y + ' ' + (p.h % 12 || 12) + ':' + p.mi + ' ' + (p.h < 12 ? 'AM' : 'PM'); },
    day: function (iso) { return iso ? iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4) : ''; },
    event: function (s) { var p = parseStamp(s); return p.mo + '/' + p.d + '/' + p.y + ' ' + (p.h % 12 || 12) + ':' + p.mi + ':' + p.s + ' ' + (p.h < 12 ? 'AM' : 'PM'); }
  };
  function isoFromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateFromIso(iso) { return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function prevBusinessDay(iso) {
    var d = dateFromIso(iso);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return isoFromDate(d);
  }

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
    info: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M6 5.2v3.3" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="3.5" r=".7" fill="currentColor"/></svg>',
    audit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5H3a.5.5 0 0 0-.5.5v10.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h4M5 8.5h3" stroke="currentColor" stroke-width="1.1"/><path d="M8 11l.4-1.8 5.1-5.1 1.4 1.4-5.1 5.1z" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
    ok: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#3b8a3e"/><path d="M4 7.2l2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
    warn: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#e08a00"/><path d="M7 3.5v4.3" stroke="#fff" stroke-width="1.7"/><circle cx="7" cy="10.2" r=".95" fill="#fff"/></svg>',
    err: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#c8102e"/><path d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8" stroke="#fff" stroke-width="1.6"/></svg>',
    errBang: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.5" fill="#c8102e"/><path d="M8 3.8v5.2" stroke="#fff" stroke-width="1.9"/><circle cx="8" cy="11.7" r="1.1" fill="#fff"/></svg>',
    refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    excel: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#1f7244"/><path d="M5 5.5l3 5M8 5.5l-3 5" stroke="#fff" stroke-width="1.3"/><path d="M9.5 5.5h3.5M9.5 8h3.5M9.5 10.5h3.5" stroke="#fff" stroke-width=".9"/></svg>'
  };
  function statusHtml(s) {
    if (s === 'Approved') return '<span class="st">' + I.ok + 'Approved</span>';
    if (s === 'Rejected') return '<span class="st rej">' + I.err + 'Rejected</span>';
    return '<span class="st">' + I.warn + esc(s) + '</span>';
  }

  /* ================= state & persistence ================= */
  var params = new URLSearchParams(location.search);
  function loadModels() {
    if (params.get('reset')) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) return parsed; }
    } catch (e) { /* ignore */ }
    return SEED.buildModels();
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S.models)); } catch (e) { /* ignore */ } }

  var persona = SEED.personas[(params.get('persona') || 'admin').toLowerCase()] || SEED.personas.admin;
  var S = {
    models: loadModels(),
    list: {
      pending: { managers: [], mod: null, conf: null, status: [] },
      applied: { managers: [], mod: null, conf: null, status: [] },
      search: '', sort: { key: null, dir: 1 }, perPage: 100, page: 1, collapsed: false
    },
    ui: { open: null, mgrQuery: '' },
    drafts: {},
    detailSort: {},
    snapDate: {}
  };
  function visibleManagers() { return persona.managers || SEED.managers; }
  function managerOptions() { return persona.managers || SEED.managerOptions; }
  function scopedModels() {
    var allowed = visibleManagers();
    return S.models.filter(function (m) { return allowed.indexOf(m.manager) > -1; });
  }
  function findModel(access) { return scopedModels().filter(function (m) { return m.access === access; })[0]; }

  /* ================= toasts / tooltip / modal ================= */
  function toast(msg, kind) {
    var z = $('#toast-zone');
    $$('.toast', z).forEach(function (t) { if (t.getAttribute('data-msg') === msg) t.remove(); });
    while (z.children.length >= 3) z.firstChild.remove();
    var el = document.createElement('div');
    el.setAttribute('data-msg', msg);
    el.className = 'toast ' + (kind || 'err');
    el.innerHTML = (kind === 'ok' ? I.ok : I.errBang) + '<span>' + esc(msg) + '</span><button class="x" aria-label="Dismiss">&times;</button>';
    el.querySelector('.x').onclick = function () { el.remove(); };
    z.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }
  var tip = $('#tip');
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    // only show for truncated cells unless forced
    if (t.hasAttribute('data-tip-trunc') && t.scrollWidth <= t.clientWidth) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.style.display = 'block';
  });
  document.addEventListener('mousemove', function (e) {
    if (tip.style.display === 'block') { tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; }
  });
  function modal(title, sub, body, foot) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="modal-bg"><div class="modal" role="dialog"><div class="modal-h"><div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><button class="x" data-act="close-modal" aria-label="Close">&times;</button></div><div class="modal-b">' + body + '</div>' + (foot ? '<div class="modal-f">' + foot + '</div>' : '') + '</div></div>';
    $('.modal-bg', root).addEventListener('mousedown', function (e) { if (e.target.classList.contains('modal-bg')) closeModal(); });
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  /* ================= clock ================= */
  function tickClock() {
    var p = nyParts();
    var h = +p.hour;
    $('#gh-clock').textContent = (h % 12 || 12) + ':' + p.minute + ':' + p.second + ' ' + (h < 12 ? 'AM' : 'PM') + ' ' + (p.timeZoneName || 'ET');
  }
  tickClock(); setInterval(tickClock, 1000);

  /* ================= CSV helpers ================= */
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadCsv(name, rows) {
    var blob = new Blob([rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
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
  var DP = null; // {anchor, mode:'range'|'single', start, end, month:Date, onDone}
  function openDatePicker(anchor, mode, value, onDone) {
    var base = mode === 'range' ? (value && value[0]) : value;
    var month = base ? dateFromIso(base) : dateFromIso(todayISO());
    month.setDate(1);
    DP = { anchor: anchor, mode: mode, start: mode === 'range' ? (value ? value[0] : null) : value, end: mode === 'range' ? (value ? value[1] : null) : null, month: month, onDone: onDone };
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
    var cells = '';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) { cells += '<span class="dow">' + d + '</span>'; });
    var today = todayISO();
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, mo, 1 - startDow + i), iso = isoFromDate(d);
      var cls = [];
      if (d.getMonth() !== mo) cls.push('out');
      if (iso === today) cls.push('today');
      if (iso === DP.start || iso === DP.end) cls.push('sel');
      else if (DP.start && DP.end && iso > DP.start && iso < DP.end) cls.push('in');
      cells += '<button data-dp-day="' + iso + '" class="' + cls.join(' ') + '">' + d.getDate() + '</button>';
    }
    var hint = DP.mode === 'range' ? (DP.start && !DP.end ? 'Select end date' : DP.start ? fmt.day(DP.start) + ' - ' + fmt.day(DP.end) : 'Select start date') : (DP.start ? fmt.day(DP.start) : 'Select a date');
    var el = document.createElement('div');
    el.className = 'dp';
    el.innerHTML = '<div class="dp-head"><button data-dp="prev" aria-label="Previous month">' + I.prev + '</button><span>' + first.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + '</span><button data-dp="next" aria-label="Next month">' + I.next + '</button></div>' +
      '<div class="dp-grid">' + cells + '</div>' +
      '<div class="dp-foot"><span class="hint">' + hint + '</span><span><button class="btn btn-text" data-dp="clear">Clear</button>' + (DP.mode === 'range' ? ' <button class="btn btn-dark" data-dp="done">Done</button>' : '') + '</span></div>';
    var left = r.left + window.scrollX, top = r.bottom + window.scrollY + 2;
    if (left + 252 > window.innerWidth - 10) left = r.right + window.scrollX - 252;
    el.style.left = left + 'px'; el.style.top = top + 'px';
    root.appendChild(el);
  }
  document.addEventListener('click', function (e) {
    if (!DP) return;
    var dp = e.target.closest('.dp');
    if (!dp) { if (!e.target.closest('[data-dp-anchor]')) closeDatePicker(); return; }
    var day = e.target.closest('[data-dp-day]'), act = e.target.closest('[data-dp]');
    if (day) {
      var iso = day.getAttribute('data-dp-day');
      if (DP.mode === 'single') { var cb = DP.onDone; closeDatePicker(); cb(iso); return; }
      if (!DP.start || DP.end) { DP.start = iso; DP.end = null; }
      else if (iso < DP.start) { DP.end = DP.start; DP.start = iso; }
      else DP.end = iso;
      renderDatePicker();
    } else if (act) {
      var a = act.getAttribute('data-dp');
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
  function filterCount(f) {
    return (f.managers.length ? 1 : 0) + (f.mod ? 1 : 0) + (f.conf ? 1 : 0) + (f.status.length ? 1 : 0);
  }
  function listRows() {
    var L = S.list, f = L.applied, q = L.search.trim().toLowerCase();
    var rows = scopedModels().filter(function (m) {
      if (f.managers.length && f.managers.indexOf(m.manager) < 0) return false;
      if (f.status.length && f.status.indexOf(m.status) < 0) return false;
      if (f.mod) { var d = m.modified.slice(0, 10); if (d < f.mod[0] || d > f.mod[1]) return false; }
      if (f.conf) { if (!m.confirmed) return false; var c = m.confirmed.slice(0, 10); if (c < f.conf[0] || c > f.conf[1]) return false; }
      if (q) {
        var hay = [m.manager, m.name, m.access, m.swp, m.type, m.modifiedUser, m.confirmedUser, m.status].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = L.sort.key, dir = L.sort.dir;
    rows.sort(function (a, b) {
      if (key) {
        var va = a[key], vb = b[key];
        if (va == null) va = ''; if (vb == null) vb = '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
        if (va !== vb) return (va < vb ? -1 : 1) * dir;
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
    { key: 'aum', label: 'AUM(M)', w: 74, r: 1, info: 'Assets under management in millions (USD), as of prior close' },
    { key: 'modifiedUser', label: 'Modified User', w: 124 },
    { key: 'modified', label: 'Modified Date', w: 150 },
    { key: 'confirmedUser', label: 'Confirmed User', w: 124 },
    { key: 'confirmed', label: 'Confirmed Date', w: 136 },
    { key: 'status', label: 'Status', w: 92 },
    { key: null, label: 'Audit Trail', w: 64 }
  ];

  function renderList() {
    var L = S.list;
    app.innerHTML =
      '<div class="banner"><h1>Model Delivery Portal</h1><button class="btn-support">Support</button></div>' +
      '<div class="page">' +
        '<section class="card ml-head">' +
          '<div class="ml-title">Model List</div>' +
          '<div class="kv mgr"><span class="k">Manager</span><span class="v">' + esc(visibleManagers().join(', ')) + '</span></div>' +
          '<div class="kv user"><span class="k">User</span><span class="v">' + esc(persona.user) + '</span></div>' +
          '<div class="ml-tools"><label class="search-box">' + I.search + '<input id="ml-search" placeholder="Search" value="' + esc(L.search) + '" autocomplete="off"></label>' +
            '<button class="icon-btn" data-act="list-export" data-tip="Download">' + I.download + '</button>' +
            '<button class="icon-btn" data-act="print" data-tip="Print">' + I.print + '</button></div>' +
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
    $('#ml-search').addEventListener('input', function (e) { S.list.search = e.target.value; S.list.page = 1; renderListGrid(); });
  }

  function mgrLabel(sel) {
    if (!sel.length) return '<span class="txt ph">Select Manager</span>';
    if (sel.length === 1) return '<span class="txt">' + esc(sel[0]) + '</span>';
    if (sel.length === managerOptions().length) return '<span class="txt">All Selected</span>';
    return '<span class="txt">' + sel.length + ' Selected</span>';
  }
  function rangeLabel(r) { return r ? '<span class="txt">' + fmt.day(r[0]) + ' - ' + fmt.day(r[1]) + '</span>' : '<span class="txt ph">Select</span>'; }

  function renderFilters() {
    var P = S.list.pending, open = S.ui.open;
    var mgrCtl = open === 'mgr'
      ? '<div class="ctl" data-act="noop">' + I.search + '<input id="mgr-q" value="' + esc(S.ui.mgrQuery || (P.managers.length === 1 ? P.managers[0] : '')) + '" placeholder="Search" autocomplete="off"></div>'
      : '<div class="ctl" data-act="dd-mgr">' + mgrLabel(P.managers) + I.down + '</div>';
    var stLabel = P.status.length ? '<span class="txt">' + esc(P.status.join(', ')) + '</span>' : '<span class="txt ph">Select status</span>';
    var hasAny = filterCount(P) || filterCount(S.list.applied);
    $('#ml-filters').innerHTML =
      '<div class="filters' + (S.list.collapsed ? ' collapsed' : '') + '">' +
        '<div class="field f-mgr"><span class="lbl">Manager*</span>' + mgrCtl + (open === 'mgr' ? mgrDropdown() : '') + '</div>' +
        '<div class="field f-mod"><span class="lbl">Modified Date Range</span><div class="ctl cal" data-act="dp-mod" data-dp-anchor>' + rangeLabel(P.mod) + I.cal + '</div></div>' +
        '<div class="field f-conf"><span class="lbl">Confirmed Date Range</span><div class="ctl cal" data-act="dp-conf" data-dp-anchor>' + rangeLabel(P.conf) + I.cal + '</div></div>' +
        '<div class="field f-status"><span class="lbl">Status</span><div class="ctl" data-act="dd-status">' + stLabel + I.down + '</div>' + (open === 'status' ? statusDropdown() : '') + '</div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-clear' + (hasAny ? ' on' : '') + '" data-act="f-clear">Clear</button>' +
        '<button class="btn btn-dark" data-act="f-apply">Apply</button>' +
      '</div>';
    var n = filterCount(P);
    $('#ml-pill').innerHTML = '<div class="filter-pill-wrap' + (S.list.collapsed ? ' top' : '') + '"><button class="filter-pill' + (S.list.collapsed ? ' collapsed' : '') + '" data-act="f-toggle">(' + n + ') ' + (n ? 'Filters Applied' : 'No Filters Applied') + ' ' + I.up + '</button></div>';
    var q = $('#mgr-q');
    if (q) {
      q.focus(); q.setSelectionRange(q.value.length, q.value.length);
      q.addEventListener('input', function (e) { S.ui.mgrQuery = e.target.value; var dd = $('#mgr-dd'); if (dd) dd.outerHTML = mgrDropdown(); });
    }
  }
  function mgrDropdown() {
    var P = S.list.pending, opts = managerOptions(), q = (S.ui.mgrQuery || '').toLowerCase();
    if (q && P.managers.length === 1 && q === P.managers[0].toLowerCase()) q = '';
    var shown = opts.filter(function (o) { return !q || o.toLowerCase().indexOf(q) > -1; });
    var all = P.managers.length === opts.length, none = !P.managers.length;
    var html = '<div class="dd" id="mgr-dd" style="width:230px">';
    if (!q) html += '<div class="dd-opt" data-act="mgr-all"><span class="cb ' + (all ? 'on' : none ? '' : 'part') + '"></span>Select All</div>';
    shown.forEach(function (o) {
      html += '<div class="dd-opt" data-act="mgr-opt" data-val="' + esc(o) + '"><span class="cb' + (P.managers.indexOf(o) > -1 ? ' on' : '') + '"></span>' + esc(o) + '</div>';
    });
    if (!shown.length) html += '<div class="dd-opt" style="color:#777;cursor:default">No matches</div>';
    return html + '</div>';
  }
  function statusDropdown() {
    var P = S.list.pending;
    return '<div class="dd">' + SEED.statuses.map(function (s) {
      return '<div class="dd-opt" data-act="st-opt" data-val="' + esc(s) + '"><span class="cb' + (P.status.indexOf(s) > -1 ? ' on' : '') + '"></span>' + esc(s) + '</div>';
    }).join('') + '</div>';
  }

  function renderListGrid() {
    var L = S.list, rows = listRows();
    var total = rows.length, pages = Math.max(1, Math.ceil(total / L.perPage));
    if (L.page > pages) L.page = pages;
    var start = (L.page - 1) * L.perPage, slice = rows.slice(start, start + L.perPage);

    var head = '<colgroup>' + LIST_COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join('') + '</colgroup><thead><tr>' +
      LIST_COLS.map(function (c) {
        var s = c.key && L.sort.key === c.key ? '<span class="sort">' + (L.sort.dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
        var info = c.info ? '<span class="ii" data-tip="' + esc(c.info) + '">' + I.info + '</span>' : '';
        return '<th class="' + (c.r ? 'r' : '') + '"' + (c.key ? ' data-act="list-sort" data-key="' + c.key + '"' : '') + '>' + c.label + info + s + '</th>';
      }).join('') + '</tr></thead>';
    var body = slice.length ? slice.map(function (m) {
      return '<tr>' +
        '<td data-tip="' + esc(m.manager) + '" data-tip-trunc>' + esc(m.manager) + '</td>' +
        '<td data-tip="' + esc(m.name) + '" data-tip-trunc><a class="lnk" href="#/model/' + encodeURIComponent(m.access) + '/info/details">' + esc(m.name) + '</a></td>' +
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
    }).join('') : '<tr class="empty-row"><td colspan="13">No Rows To Show</td></tr>';
    $('#ml-table').innerHTML = head + '<tbody>' + body + '</tbody>';

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
    $('#ml-pp').addEventListener('change', function (e) { L.perPage = +e.target.value; L.page = 1; renderListGrid(); });
    $('#ml-goto').addEventListener('keydown', function (e) { if (e.key === 'Enter') goPage(); });
  }
  function goPage() {
    var L = S.list, pages = Math.max(1, Math.ceil(listRows().length / L.perPage));
    var p = parseInt($('#ml-goto').value, 10);
    if (!p || p < 1 || p > pages) { toast('Please enter a page between 1 and ' + pages); return; }
    L.page = p; renderListGrid();
  }

  function showAudit(m) {
    var ev = m.events.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var body = '<table class="grid"><colgroup><col style="width:170px"><col style="width:150px"><col style="width:140px"><col></colgroup><thead><tr><th>Timestamp</th><th>Event</th><th>User</th><th>Details</th></tr></thead><tbody>' +
      (ev.length ? ev.map(function (e) { return '<tr><td>' + fmt.event(e.ts) + '</td><td>' + esc(e.event) + '</td><td>' + esc(e.user) + '</td><td data-tip="' + esc(e.details) + '" data-tip-trunc>' + esc(e.details) + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="4">No Rows To Show</td></tr>') +
      '</tbody></table>';
    modal('Audit Trail', m.name + '  |  ' + m.access, body, '<button class="btn btn-dark" data-act="close-modal">Close</button>');
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

  function secFor(t) { return t === 'USD Cash' ? { ticker: 'USD Cash', desc: 'USD Cash', id: '-', price: 1, info: false } : SEC[t]; }

  function getDraft(m) {
    if (!S.drafts[m.access]) {
      var basis = m.pending || null;
      var rows = m.holdings.map(function (h) {
        var p = basis ? basis.filter(function (x) { return x.ticker === h.ticker; })[0] : null;
        return { ticker: h.ticker, weight: h.weight, nw: p ? p.nw : h.weight, tt: p ? p.tt : '-', dnb: p ? p.dnb : false, dns: p ? p.dns : false, notes: p ? p.notes : '', added: false };
      });
      if (basis) basis.forEach(function (p) {
        if (!rows.some(function (r) { return r.ticker === p.ticker; })) rows.push({ ticker: p.ticker, weight: 0, nw: p.nw, tt: p.tt, dnb: p.dnb, dns: p.dns, notes: p.notes, added: true });
      });
      S.drafts[m.access] = { rows: rows };
    }
    return S.drafts[m.access];
  }
  function draftTotal(d) { return round3(d.rows.reduce(function (a, r) { return a + (+r.nw || 0); }, 0)); }
  function draftChanged(d) {
    return d.rows.some(function (r) { return Math.abs((+r.nw || 0) - r.weight) > 0.0004 || r.tt !== '-' || r.dnb || r.dns || r.notes || r.added; });
  }

  function renderDetail(access, tab, sub) {
    var m = findModel(access);
    if (!m) { toast('Model ' + access + ' was not found'); location.hash = '#/'; return; }
    if (!SUBS[tab]) tab = 'info';
    if (!SUBS[tab].some(function (s) { return s[0] === sub; })) sub = SUBS[tab][0][0];
    var base = '#/model/' + encodeURIComponent(access) + '/';
    app.innerHTML =
      '<div class="banner detail"><a class="crumb" href="#/">' + I.left + 'Model List</a><h1>Model Delivery Portal</h1><button class="btn-support">Support</button></div>' +
      '<div class="page">' +
        '<section class="card d-head">' +
          '<div class="tabs big">' + TABS.map(function (t) { return '<a href="' + base + t[0] + '/' + t[2] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</a>'; }).join('') + '</div>' +
          '<div class="meta">' +
            '<div class="mf"><span class="k">Strategy Name</span><span class="v">' + esc(m.name) + '</span></div>' +
            '<div class="mf"><span class="k">Access</span><span class="v">' + esc(m.access) + '</span></div>' +
            '<div class="mf"><span class="k">SWP/AAP</span><span class="v">' + (m.swp ? esc(m.swp) : 'N/A') + '</span></div>' +
            '<div class="mf"><span class="k">Modified</span><span class="v">' + fmt.detailMod(m.modified) + '</span></div>' +
            '<div class="mf"><span class="k">Confirmed</span><span class="v">' + (m.confirmed ? fmt.conf(m.confirmed) : 'N/A') + '</span></div>' +
            '<div class="mf"><span class="k">Status</span><span class="v">' + statusHtml(m.status) + '</span></div>' +
            '<div class="meta-tools"><button class="icon-btn" data-act="model-export" data-acc="' + esc(m.access) + '" data-tip="Download">' + I.download + '</button><button class="icon-btn" data-act="print" data-tip="Print">' + I.print + '</button></div>' +
          '</div>' +
        '</section>' +
        '<section class="card d-body">' +
          '<div class="tabs small">' + SUBS[tab].map(function (s) { return '<a href="' + base + tab + '/' + s[0] + '" class="' + (s[0] === sub ? 'on' : '') + '">' + s[1] + '</a>'; }).join('') + '</div>' +
          '<div id="d-content"></div>' +
        '</section>' +
      '</div>';
    var c = $('#d-content');
    ({
      details: renderModelDetails, options: renderOptions, snapshot: renderSnapshot,
      today: renderToday, sma: renderSma, performance: renderPerformance, profile: renderProfile
    })[sub](m, c);
  }

  /* ---------- Model Details ---------- */
  var MD_COLS = [
    { key: 'ticker', label: 'Ticker', w: 92 }, { key: 'desc', label: 'Description', w: 196 }, { key: 'id', label: 'CUSIP', w: 98 },
    { key: 'price', label: 'Price ($)', w: 96, r: 1 }, { key: 'weight', label: 'Weight', w: 84, r: 1 }, { key: 'nw', label: 'New Weight', w: 132, r: 1 },
    { key: 'chg', label: 'Weight Change', w: 100, r: 1 }, { key: null, label: 'Trade Type', w: 156 }, { key: null, label: 'Do Not Buy', w: 86 },
    { key: null, label: 'Do Not Sell', w: 86 }, { key: null, label: 'Notes', w: 262 }, { key: null, label: '', w: 30 }
  ];
  function renderModelDetails(m, c) {
    var d = getDraft(m);
    c.innerHTML =
      (m.pending ? '<div class="pending-note">This model has a submitted change awaiting confirmation. Review the new weights and CONFIRM to apply them.</div>' : '') +
      '<div class="md-bar">' +
        '<div class="add-wrap"><span class="lbl">Add Ticker/CUSIP/CINS/SEDOL (For UCITS must use CINS)</span><div class="add-row"><input id="md-add" placeholder="Eg. AAPL,AMZN,MSFT" autocomplete="off"><button class="btn" data-act="md-add">Add</button></div></div>' +
        '<div class="md-actions"><span class="mt">Model Type: ' + esc(m.type) + '</span>' +
          '<button data-act="md-trade-all">' + I.refresh + 'Trade All To Target</button>' +
          '<button data-act="md-import">' + I.excel + 'Import</button>' +
          '<button data-act="md-template">' + I.excel + 'Download Template</button></div>' +
      '</div>' +
      '<div class="grid-scroll md-scroll"><table class="grid md-grid" id="md-table"></table></div>' +
      '<div id="md-foot" style="overflow:hidden"></div>' +
      '<div class="md-buttons"><button class="btn btn-text" data-act="md-clear" data-acc="' + esc(m.access) + '">Clear</button><button class="btn btn-tan" data-act="md-submit" data-acc="' + esc(m.access) + '">Submit</button><button class="btn btn-black" data-act="md-confirm" data-acc="' + esc(m.access) + '">Confirm</button></div>';
    renderMdTable(m);
    bindMdTable(m);
    $('#md-add').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSecurities(m); });
  }
  function mdSorted(m, d) {
    var s = S.detailSort[m.access] || { key: 'ticker', dir: 1 };
    var cash = d.rows.filter(function (r) { return r.ticker === 'USD Cash'; });
    var rest = d.rows.filter(function (r) { return r.ticker !== 'USD Cash'; });
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
    var cls = v > 0.0004 ? 'pos' : v < -0.0004 ? 'neg' : '';
    return '<span class="' + cls + '">' + (v > 0.0004 ? '+' : '') + v.toFixed(3) + '%</span>';
  }
  function renderMdTable(m) {
    var d = getDraft(m), o = mdSorted(m, d), total = draftTotal(d);
    var head = '<colgroup>' + MD_COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join('') + '</colgroup><thead><tr>' +
      MD_COLS.map(function (c) {
        var s = c.key && o.sort.key === c.key ? '<span class="sort">' + (o.sort.dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
        return '<th class="' + (c.r ? 'r' : '') + '"' + (c.key ? ' data-act="md-sort" data-key="' + c.key + '" data-acc="' + esc(m.access) + '"' : ' style="cursor:default"') + '>' + c.label + s + '</th>';
      }).join('') + '</tr></thead>';
    var body = o.rows.map(function (r) {
      var sec = secFor(r.ticker) || { desc: '', id: '', price: 0 };
      var isCash = r.ticker === 'USD Cash', t = esc(r.ticker);
      return '<tr class="' + (r.added ? 'added' : '') + '">' +
        '<td>' + t + '</td>' +
        '<td data-tip="' + esc(sec.desc) + '" data-tip-trunc>' + esc(sec.desc) + '</td>' +
        '<td>' + esc(sec.id) + '</td>' +
        '<td class="r">$' + num(sec.price, 2) + (sec.info ? ' <span class="ii" data-tip="Price as of prior market close ' + fmt.day(prevBusinessDay(todayISO())) + '" style="display:inline-block;vertical-align:-1px">' + I.info + '</span>' : '<span style="display:inline-block;width:15px"></span>') + '</td>' +
        '<td class="r">' + r.weight.toFixed(3) + '%</td>' +
        '<td class="r"><input class="nw" data-t="' + t + '" value="' + (+r.nw).toFixed(3) + '" inputmode="decimal"></td>' +
        '<td class="r" data-chg="' + t + '">' + chgHtml(r) + '</td>' +
        '<td>' + (isCash ? '' : '<select data-tt="' + t + '">' + SEED.tradeTypes.map(function (x) { return '<option' + (x === r.tt ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>') + '</td>' +
        '<td>' + (isCash ? '' : '<input type="checkbox" class="cbx" data-dnb="' + t + '"' + (r.dnb ? ' checked' : '') + '>') + '</td>' +
        '<td>' + (isCash ? '' : '<input type="checkbox" class="cbx" data-dns="' + t + '"' + (r.dns ? ' checked' : '') + '>') + '</td>' +
        '<td>' + (isCash ? '' : '<input class="notes" data-notes="' + t + '" placeholder="Add notes..." value="' + esc(r.notes) + '">') + '</td>' +
        '<td>' + (r.added ? '<button class="rm" data-act="md-remove" data-t="' + t + '" data-acc="' + esc(m.access) + '" aria-label="Remove">&times;</button>' : '') + '</td>' +
      '</tr>';
    }).join('');
    $('#md-table').innerHTML = head + '<tbody>' + body + '</tbody>';
    var cg = '<colgroup>' + MD_COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join('') + '</colgroup>';
    $('#md-foot').innerHTML = '<table class="grid md-grid">' + cg + '<tr><td colspan="5" style="background:transparent;border:0"></td><td class="r" style="background:transparent;border:0;font-weight:700"><span id="md-total" class="' + (Math.abs(total - 100) > 0.0004 ? 'neg' : '') + '">Total: ' + total.toFixed(3) + '%</span></td><td colspan="6" style="background:transparent;border:0"></td></tr></table>';
    $('#md-foot').scrollLeft = $('.md-scroll').scrollLeft;
  }
  function bindMdTable(m) {
    var tbl = $('#md-table');
    $('.md-scroll').addEventListener('scroll', function (e) { $('#md-foot').scrollLeft = e.target.scrollLeft; });
    tbl.addEventListener('input', function (e) {
      var el = e.target, d2 = getDraft(m), t;
      if ((t = el.getAttribute('data-t')) && el.classList.contains('nw')) {
        var row = rowOf(d2, t); row.nw = el.value === '' || isNaN(+el.value) ? 0 : +el.value;
        el.classList.toggle('bad', el.value !== '' && (isNaN(+el.value) || +el.value < 0));
        var cell = tbl.querySelector('[data-chg="' + cssEsc(t) + '"]'); if (cell) cell.innerHTML = chgHtml(row);
        var tot = draftTotal(d2), te = $('#md-total');
        te.textContent = 'Total: ' + tot.toFixed(3) + '%'; te.className = Math.abs(tot - 100) > 0.0004 ? 'neg' : '';
      } else if ((t = el.getAttribute('data-notes'))) rowOf(d2, t).notes = el.value;
    });
    tbl.addEventListener('change', function (e) {
      var el = e.target, d2 = getDraft(m), t;
      if ((t = el.getAttribute('data-tt'))) rowOf(d2, t).tt = el.value;
      else if ((t = el.getAttribute('data-dnb'))) rowOf(d2, t).dnb = el.checked;
      else if ((t = el.getAttribute('data-dns'))) rowOf(d2, t).dns = el.checked;
      else if (el.classList.contains('nw')) { var r = rowOf(d2, el.getAttribute('data-t')); if (!isNaN(+el.value) && el.value !== '') el.value = (+el.value).toFixed(3); r.nw = +el.value || 0; }
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'); }
  function rowOf(d, t) { return d.rows.filter(function (r) { return r.ticker === t; })[0]; }
  function resolveSecurity(token) {
    var t = token.trim().toUpperCase();
    if (!t) return null;
    if (SEC[t]) return t;
    if (SEED.securitiesById[t]) return SEED.securitiesById[t];
    return null;
  }
  function addSecurities(m) {
    var input = $('#md-add'), tokens = input.value.split(/[,\s]+/).filter(Boolean);
    if (!tokens.length) { toast('Please enter a Ticker, CUSIP, CINS or SEDOL'); return; }
    var d = getDraft(m), added = [], bad = [], dup = [];
    var isUcits = m.kind === 'ucits';
    tokens.forEach(function (tok) {
      var t = resolveSecurity(tok);
      if (!t) { bad.push(tok); return; }
      if (isUcits && !/^[A-Z]\d/.test(tok.toUpperCase()) && SEC[t].ucits) { bad.push(tok + ' (use CINS)'); return; }
      if (rowOf(d, t)) { dup.push(t); return; }
      d.rows.push({ ticker: t, weight: 0, nw: 0, tt: '-', dnb: false, dns: false, notes: '', added: true });
      added.push(t);
    });
    if (bad.length) toast('Security not found: ' + bad.join(', '));
    if (dup.length) toast('Already in model: ' + dup.join(', '));
    if (added.length) { input.value = ''; renderMdTable(m); toast('Added ' + added.join(', ') + ' to model', 'ok'); }
  }

  function snapshotFromRows(rows) { return rows.filter(function (r) { return r.weight > 0 || r.ticker === 'USD Cash'; }).map(function (r) { return { ticker: r.ticker, weight: r.weight }; }); }

  function submitModel(m) {
    var d = getDraft(m), total = draftTotal(d);
    if (d.rows.some(function (r) { return isNaN(+r.nw) || +r.nw < 0; })) { toast('New weights must be zero or greater'); return; }
    if (Math.abs(total - 100) > 0.0004) { toast('Model weights must total 100.000%. Current total is ' + total.toFixed(3) + '%'); return; }
    if (!draftChanged(d)) { toast('No changes to submit'); return; }
    var changes = d.rows.filter(function (r) { return Math.abs(r.nw - r.weight) > 0.0004; }).length;
    m.pending = d.rows.map(function (r) { return { ticker: r.ticker, nw: round3(+r.nw), tt: r.tt, dnb: r.dnb, dns: r.dns, notes: r.notes }; });
    m.status = 'In Progress';
    m.modified = nowStamp(); m.modifiedUser = persona.user;
    m.events.push({ ts: m.modified, event: 'Model Submitted', user: persona.user, details: changes + ' weight change(s) submitted' + (d.rows.some(function (r) { return r.added; }) ? '; new securities added' : '') });
    save(); route();
    toast('Model submitted successfully', 'ok');
  }
  function confirmModel(m) {
    var d = getDraft(m), total = draftTotal(d);
    if (Math.abs(total - 100) > 0.0004) { toast('Model weights must total 100.000%. Current total is ' + total.toFixed(3) + '%'); return; }
    var changes = d.rows.filter(function (r) { return Math.abs(r.nw - r.weight) > 0.0004; }).length;
    m.holdings = d.rows.filter(function (r) { return +r.nw > 0 || r.ticker === 'USD Cash'; }).map(function (r) { return { ticker: r.ticker, weight: round3(+r.nw) }; });
    var cash = m.holdings.filter(function (h) { return h.ticker === 'USD Cash'; })[0];
    if (!cash) m.holdings.unshift({ ticker: 'USD Cash', weight: 0 });
    m.pending = null;
    var ts = nowStamp();
    m.status = 'Approved';
    m.modified = ts; m.modifiedUser = persona.user;
    m.confirmed = ts; m.confirmedUser = persona.user;
    m.snapshots[todayISO()] = snapshotFromRows(m.holdings);
    m.events.push({ ts: ts, event: 'Model Confirmed', user: persona.user, details: changes ? changes + ' weight change(s) applied' : 'Model confirmed with no changes' });
    delete S.drafts[m.access];
    save(); route();
    toast('Model confirmed successfully', 'ok');
  }
  function importCsv(m, text) {
    var rows = parseCsv(text);
    if (!rows.length) { toast('The selected file is empty'); return; }
    if (isNaN(+rows[0][1])) rows.shift(); // header
    var d = getDraft(m), seen = {}, bad = [];
    rows.forEach(function (r) {
      var tok = r[0], w = +r[1];
      var t = /^usd ?cash$/i.test(tok) ? 'USD Cash' : resolveSecurity(tok);
      if (!t || isNaN(w)) { bad.push(tok); return; }
      var row = rowOf(d, t);
      if (!row) { row = { ticker: t, weight: 0, nw: 0, tt: '-', dnb: false, dns: false, notes: '', added: true }; d.rows.push(row); }
      row.nw = round3(w);
      if (r[2] && SEED.tradeTypes.indexOf(r[2]) > -1) row.tt = r[2];
      if (r[3]) row.dnb = /^(y|yes|true|1)$/i.test(r[3]);
      if (r[4]) row.dns = /^(y|yes|true|1)$/i.test(r[4]);
      if (r[5]) row.notes = r[5];
      seen[t] = 1;
    });
    d.rows.forEach(function (r) { if (!seen[r.ticker]) r.nw = 0; });
    renderMdTable(m);
    if (bad.length) toast('Skipped unrecognized rows: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? '…' : ''));
    toast('Imported ' + Object.keys(seen).length + ' securities. Review and SUBMIT.', 'ok');
  }

  /* ---------- Model Options ---------- */
  function renderOptions(m, c) {
    c.innerHTML = '<div class="opt-wrap"><span class="lbl">Tax Loss Harvest Replacement</span><div class="opt-row"><input id="tlh" placeholder="Eg. SPY" value="' + esc(m.tlh) + '" autocomplete="off"><button class="btn btn-black" data-act="tlh-submit" data-acc="' + esc(m.access) + '">Submit</button></div></div>';
    $('#tlh').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('[data-act="tlh-submit"]').click(); });
  }

  /* ---------- Model Snapshot ---------- */
  function renderSnapshot(m, c) {
    var date = S.snapDate[m.access] || prevBusinessDay(todayISO());
    var snap = m.snapshots[date];
    var cols = '<colgroup><col style="width:13%"><col style="width:20%"><col style="width:15%"><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col></colgroup>';
    var head = '<thead><tr><th>Ticker</th><th>Description</th><th>CUSIP</th><th class="r">Price ($)</th><th class="r">Weight</th><th class="r">Quantity</th><th class="r">Market Value (M)</th><th></th></tr></thead>';
    var body = '', totW = 0, totMv = 0;
    if (snap) {
      snap = snap.slice().sort(function (a, b) { return a.ticker === 'USD Cash' ? -1 : b.ticker === 'USD Cash' ? 1 : a.ticker < b.ticker ? -1 : 1; });
      body = snap.map(function (r) {
        var sec = secFor(r.ticker) || { desc: '', id: '', price: 0 };
        var mv = m.aum * r.weight / 100, cash = r.ticker === 'USD Cash';
        totW += r.weight; totMv += mv;
        var qty = cash ? '-' : num(mv * 1e6 / sec.price, 2);
        return '<tr><td>' + esc(r.ticker) + '</td><td>' + esc(sec.desc) + '</td><td>' + esc(sec.id) + '</td><td class="r">$' + num(sec.price, 2) + '</td><td class="r">' + r.weight.toFixed(3) + '%</td><td class="r">' + qty + '</td><td class="r">' + num(mv, 2) + '</td><td></td></tr>';
      }).join('');
    }
    c.innerHTML =
      '<div class="snap-bar">Select Date: <div class="ctl cal" data-act="dp-snap" data-acc="' + esc(m.access) + '" data-dp-anchor><span class="txt">' + fmt.day(date) + '</span>' + I.cal + '</div></div>' +
      '<div class="grid-scroll snap-scroll">' +
        '<table class="grid snap-grid">' + cols + head + '<tbody>' + body + '</tbody></table>' +
        (snap ? '' : '<div class="no-rows">No Rows To Show</div>') +
      '</div>' +
      '<table class="grid" style="table-layout:fixed;width:100%"><colgroup><col style="width:13%"><col style="width:20%"><col style="width:15%"><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col></colgroup><tr class="snap-tot"><td colspan="4" style="border-top:1px solid #555"></td><td class="r" style="border-top:1px solid #555;font-weight:700">Total: ' + totW.toFixed(3) + '%</td><td style="border-top:1px solid #555"></td><td class="r" style="border-top:1px solid #555;font-weight:700">Total: ' + num(totMv, 2) + '</td><td style="border-top:1px solid #555"></td></tr></table>';
    if (!snap) toast('Model snapshot not saved for selected date');
  }

  /* ---------- Communication ---------- */
  function renderToday(m, c) {
    var today = todayISO();
    var ev = m.events.filter(function (e) { return e.ts.slice(0, 10) === today; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    c.innerHTML = '<div class="comm-list"><table class="grid comm-grid"><colgroup><col style="width:34%"><col style="width:28%"><col style="width:24%"><col></colgroup><thead><tr><th style="cursor:default">Timestamp</th><th style="cursor:default">Event</th><th style="cursor:default">User</th><th style="cursor:default">Details</th></tr></thead><tbody>' +
      ev.map(function (e) { return '<tr><td>' + fmt.event(e.ts) + '</td><td>' + esc(e.event) + '</td><td>' + esc(e.user) + '</td><td data-tip="' + esc(e.details) + '" data-tip-trunc>' + esc(e.details) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function renderSma(m, c) {
    c.innerHTML = '<div class="comm-box">' + (m.communications || []).map(function (x) {
      return '<div class="comm-msg"><div class="h">' + fmt.event(x.ts) + ' &middot; ' + esc(x.user) + '</div>' + esc(x.text) + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- Analysis ---------- */
  function renderPerformance(m, c) {
    c.innerHTML = '<div class="perf"><h3>Performance Reports</h3><a data-act="perf-profile" data-acc="' + esc(m.access) + '">Most Recent Profile</a></div>';
  }
  function showProfileReport(m) {
    var eq = 0, fi = 0, cash = 0;
    m.holdings.forEach(function (h) {
      if (h.ticker === 'USD Cash') { cash += h.weight; return; }
      var g = (SEC[h.ticker] || {}).group, desc = (SEC[h.ticker] || {}).desc || '';
      if (/BOND|BD|TREAS|MUNI|INCOME|INC ETF|SHORT DURATION|T-BILL|GOVT|SECURITIES FD|CORP/.test(desc) && g !== 'growth' && g !== 'value') fi += h.weight; else eq += h.weight;
    });
    var top = m.holdings.filter(function (h) { return h.ticker !== 'USD Cash'; }).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 10);
    var body = '<div class="prof-sum">' +
      '<div><span class="k">Manager</span><span class="v">' + esc(m.manager) + '</span></div>' +
      '<div><span class="k">Holdings</span><span class="v">' + (m.holdings.length - 1) + '</span></div>' +
      '<div><span class="k">AUM (M)</span><span class="v">' + num(m.aum, 2) + '</span></div>' +
      '<div><span class="k">Accounts</span><span class="v">' + num(m.accounts, 0) + '</span></div>' +
      '<div><span class="k">Equity</span><span class="v">' + eq.toFixed(1) + '%</span></div>' +
      '<div><span class="k">Fixed Income</span><span class="v">' + fi.toFixed(1) + '%</span></div>' +
      '<div><span class="k">Cash</span><span class="v">' + cash.toFixed(1) + '%</span></div>' +
      '<div><span class="k">As of</span><span class="v">' + fmt.day(prevBusinessDay(todayISO())) + '</span></div></div>' +
      '<table class="grid"><colgroup><col style="width:90px"><col><col style="width:90px"><col style="width:200px"></colgroup><thead><tr><th>Ticker</th><th>Top 10 Holdings</th><th class="r">Weight</th><th></th></tr></thead><tbody>' +
      top.map(function (h) { return '<tr><td>' + esc(h.ticker) + '</td><td>' + esc((SEC[h.ticker] || {}).desc) + '</td><td class="r">' + h.weight.toFixed(3) + '%</td><td><div class="bar"><i style="width:' + Math.min(100, h.weight / top[0].weight * 100) + '%"></i></div></td></tr>'; }).join('') +
      '</tbody></table>';
    modal('Most Recent Profile', m.name + '  |  ' + m.access, body, '<button class="btn btn-tan" data-act="print">Print</button><button class="btn btn-dark" data-act="close-modal">Close</button>');
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
      '<table class="grid users-grid"><colgroup><col style="width:40%"><col style="width:34%"><col></colgroup><thead><tr><th style="cursor:default">Name</th><th style="cursor:default">User Email</th><th style="cursor:default">Phone Number</th></tr></thead><tbody id="users-body"></tbody></table></div>';
    function draw(q) {
      q = (q || '').toLowerCase();
      var rows = m.users.filter(function (u) { return !q || u.join(' ').toLowerCase().indexOf(q) > -1; });
      $('#users-body').innerHTML = rows.length ? rows.map(function (u) { return '<tr><td>' + esc(u[0]) + '</td><td>' + esc(u[1]) + '</td><td>' + esc(u[2]) + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="3">No Rows To Show</td></tr>';
    }
    draw('');
    $('#users-q').addEventListener('input', function (e) { draw(e.target.value); });
  }

  /* =====================================================================
   * EVENTS (delegated)
   * ===================================================================== */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    var L = S.list;
    // close dropdowns on outside click
    if (S.ui.open && !e.target.closest('.f-mgr') && !e.target.closest('.f-status')) { S.ui.open = null; S.ui.mgrQuery = ''; if ($('#ml-filters')) renderFilters(); }
    if (!el) return;
    var act = el.getAttribute('data-act'), acc = el.getAttribute('data-acc');
    var m = acc ? findModel(acc) : null;
    switch (act) {
      case 'noop': break;
      case 'dd-mgr': S.ui.open = S.ui.open === 'mgr' ? null : 'mgr'; S.ui.mgrQuery = ''; renderFilters(); break;
      case 'dd-status': S.ui.open = S.ui.open === 'status' ? null : 'status'; renderFilters(); break;
      case 'mgr-all':
        L.pending.managers = L.pending.managers.length === managerOptions().length ? [] : managerOptions().slice();
        S.ui.mgrQuery = ''; renderFilters(); break;
      case 'mgr-opt': {
        var v = el.getAttribute('data-val'), i = L.pending.managers.indexOf(v);
        if (i > -1) L.pending.managers.splice(i, 1); else L.pending.managers.push(v);
        S.ui.mgrQuery = ''; renderFilters(); break;
      }
      case 'st-opt': {
        var sv = el.getAttribute('data-val'), si = L.pending.status.indexOf(sv);
        if (si > -1) L.pending.status.splice(si, 1); else L.pending.status.push(sv);
        renderFilters(); break;
      }
      case 'dp-mod': openDatePicker(el, 'range', L.pending.mod, function (v) { L.pending.mod = v; renderFilters(); }); break;
      case 'dp-conf': openDatePicker(el, 'range', L.pending.conf, function (v) { L.pending.conf = v; renderFilters(); }); break;
      case 'f-clear':
        L.pending = { managers: [], mod: null, conf: null, status: [] };
        L.applied = { managers: [], mod: null, conf: null, status: [] };
        L.page = 1; S.ui.open = null; renderFilters(); renderListGrid(); break;
      case 'f-apply':
        L.applied = JSON.parse(JSON.stringify(L.pending));
        L.page = 1; S.ui.open = null; renderFilters(); renderListGrid(); break;
      case 'f-toggle': L.collapsed = !L.collapsed; renderFilters(); break;
      case 'list-sort': {
        var k = el.getAttribute('data-key');
        if (L.sort.key === k) { if (L.sort.dir === 1) L.sort.dir = -1; else L.sort = { key: null, dir: 1 }; }
        else L.sort = { key: k, dir: 1 };
        renderListGrid(); break;
      }
      case 'pg': {
        var pages = Math.max(1, Math.ceil(listRows().length / L.perPage)), to = el.getAttribute('data-to');
        L.page = to === 'first' ? 1 : to === 'last' ? pages : to === 'prev' ? Math.max(1, L.page - 1) : Math.min(pages, L.page + 1);
        renderListGrid(); break;
      }
      case 'pg-go': goPage(); break;
      case 'audit': if (m) showAudit(m); break;
      case 'close-modal': closeModal(); break;
      case 'print': window.print(); break;
      case 'list-export':
        downloadCsv('Model_List_' + todayISO() + '.csv', [['Manager', 'Strategy Name', 'Access', 'SWP/AAP', 'Model Type', 'Accounts', 'AUM(M)', 'Modified User', 'Modified Date', 'Confirmed User', 'Confirmed Date', 'Status']].concat(
          listRows().map(function (x) { return [x.manager, x.name, x.access, x.swp || '-', x.type, x.accounts, x.aum.toFixed(2), x.modifiedUser, fmt.listMod(x.modified), x.confirmedUser || '-', x.confirmed ? fmt.conf(x.confirmed) : '-', x.status]; })));
        break;
      case 'model-export':
        if (m) downloadCsv(m.access + '_Model_' + todayISO() + '.csv', [['Ticker', 'Description', 'CUSIP', 'Price ($)', 'Weight', 'New Weight', 'Weight Change', 'Trade Type', 'Do Not Buy', 'Do Not Sell', 'Notes']].concat(
          getDraft(m).rows.map(function (r) { var s = secFor(r.ticker) || {}; return [r.ticker, s.desc, s.id, (s.price || 0).toFixed(2), r.weight.toFixed(3), (+r.nw).toFixed(3), round3(r.nw - r.weight).toFixed(3), r.ticker === 'USD Cash' ? '' : r.tt, r.dnb ? 'Y' : 'N', r.dns ? 'Y' : 'N', r.notes]; })));
        break;
      case 'md-sort': {
        var cur = S.detailSort[acc] || { key: 'ticker', dir: 1 }, key = el.getAttribute('data-key');
        S.detailSort[acc] = cur.key === key ? { key: key, dir: -cur.dir } : { key: key, dir: 1 };
        renderMdTable(m); break;
      }
      case 'md-add': addSecurities(currentModel()); break;
      case 'md-remove': { var d = getDraft(m), t = el.getAttribute('data-t'); d.rows = d.rows.filter(function (r) { return r.ticker !== t; }); renderMdTable(m); break; }
      case 'md-trade-all': {
        var cm = currentModel(), dd = getDraft(cm);
        dd.rows.forEach(function (r) { if (r.ticker !== 'USD Cash') r.tt = 'Trade to Target'; });
        renderMdTable(cm); toast('Trade Type set to Trade to Target for all securities', 'ok'); break;
      }
      case 'md-import': $('#import-file').value = ''; $('#import-file').click(); break;
      case 'md-template': {
        var tm = currentModel();
        downloadCsv(tm.access + '_Import_Template.csv', [['Ticker/CUSIP/CINS/SEDOL', 'New Weight', 'Trade Type', 'Do Not Buy', 'Do Not Sell', 'Notes']].concat(
          getDraft(tm).rows.map(function (r) { return [r.ticker, (+r.nw).toFixed(3), r.ticker === 'USD Cash' ? '' : r.tt, r.dnb ? 'Y' : 'N', r.dns ? 'Y' : 'N', r.notes]; })));
        break;
      }
      case 'md-clear': delete S.drafts[acc]; renderMdTable(m); break;
      case 'md-submit': submitModel(m); break;
      case 'md-confirm': confirmModel(m); break;
      case 'tlh-submit': {
        var inp = $('#tlh'), val = inp.value.trim().toUpperCase();
        if (!val) { toast('Please enter a replacement security'); break; }
        var rt = resolveSecurity(val);
        if (!rt) { toast('Security not found: ' + val); break; }
        m.tlh = rt; inp.value = rt;
        m.events.push({ ts: nowStamp(), event: 'Model Options Updated', user: persona.user, details: 'Tax Loss Harvest Replacement set to ' + rt });
        save(); toast('Tax Loss Harvest Replacement saved', 'ok'); break;
      }
      case 'dp-snap':
        openDatePicker(el, 'single', S.snapDate[acc] || prevBusinessDay(todayISO()), function (v) { if (v) { S.snapDate[acc] = v; route(); } });
        break;
      case 'perf-profile': if (m) showProfileReport(m); break;
    }
  });
  $('#import-file').addEventListener('change', function (e) {
    var f = e.target.files[0], m = currentModel();
    if (!f || !m) return;
    var rd = new FileReader();
    rd.onload = function () { importCsv(m, String(rd.result)); };
    rd.readAsText(f);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeDatePicker(); if (S.ui.open) { S.ui.open = null; if ($('#ml-filters')) renderFilters(); } }
  });

  /* ================= router ================= */
  var current = { access: null };
  function currentModel() { return current.access ? findModel(current.access) : null; }
  function route() {
    closeDatePicker(); closeModal(); tip.style.display = 'none';
    if (!route.keepToasts) $('#toast-zone').innerHTML = '';
    route.keepToasts = false;
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'model' && h[1]) {
      current.access = decodeURIComponent(h[1]);
      renderDetail(current.access, h[2] || 'info', h[3] || '');
    } else {
      current.access = null;
      renderList();
    }
    document.title = current.access ? 'Model Delivery Portal - ' + current.access : 'Model Delivery Portal - Money Manager';
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });
  route();
})();
