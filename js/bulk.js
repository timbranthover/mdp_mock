/* Model Delivery Portal — Bulk Upload (#/bulk)
 *
 * One workbook updates many models in one pass. Built for teams that maintain a family of models together
 * (for example the House View's 84 allocation models at each quarterly rebalance).
 *
 * File format (same columns as the single-model template, so nothing new to learn):
 *   - one sheet per model, sheet name = Access code, columns Security and Weight %   (Bulk Download produces this)
 *   - or one sheet with the columns Access, Security, Weight %
 * Rules (same as the Model Details grid and the Import panel):
 *   - each sheet is the whole model: securities not listed go to 0, USD Cash is the residual
 *   - every problem must be fixed in the file or the model removed from the batch; nothing is skipped silently
 *   - each model is submitted through the normal path: audit events, snapshot, portfolio recalculation, delivery
 * Loaded after app.js (uses window.MDPCore).
 */
(function () {
  'use strict';
  var C = window.MDPCore;
  if (!C) return;
  var SEC = C.SEC, CASH = C.CASH, EPS = C.EPS, esc = C.esc, num = C.num, r3 = C.round3, I = C.I;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ST = null;          // { file, items: [...], f, open: {}, done }
  var mgrSel = null;
  function pct(v, d) { return (+v).toFixed(d == null ? 3 : d) + '%'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* ---------------- parsing ---------------- */
  function cellNum(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s) return null;
    var n = +s.replace(/[%,\s]/g, '');
    return isNaN(n) ? NaN : n;
  }
  function isHeader(row) { return row.some(function (c) { return /^(security|ticker|cusip|symbol|weight|access)/i.test(String(c).trim()); }); }
  function trim(rows) { return rows.filter(function (r) { return r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); }); }
  /* sheets [{name, rows}] -> [{access, sheet, rows: [[security, weight, line]]}] */
  function split(sheets) {
    var out = [];
    sheets.forEach(function (sh) {
      var rows = trim(sh.rows); if (!rows.length) return;
      var head = isHeader(rows[0]) ? rows[0].map(function (c) { return String(c).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z%]/g, ''); }) : null;
      var ai = head ? head.indexOf('access') : -1;
      if (ai > -1) { // long format: Access | Security | Weight
        var si = head.findIndex(function (h) { return /^(security|ticker|cusip|symbol)/.test(h); }), wi = head.findIndex(function (h) { return /^weight/.test(h); });
        if (si < 0 || wi < 0) { out.push({ access: sh.name, sheet: sh.name, rows: [], fileErr: 'Sheet "' + sh.name + '" needs Access, Security and Weight % columns' }); return; }
        var by = {}, order = [];
        rows.slice(1).forEach(function (r, i) { var a = String(r[ai] || '').trim().toUpperCase(); if (!a) return; if (!by[a]) { by[a] = []; order.push(a); } by[a].push([r[si], r[wi], i + 2]); });
        order.forEach(function (a) { out.push({ access: a, sheet: sh.name, rows: by[a] }); });
        return;
      }
      if (/^(how to use|instructions|readme|notes)$/i.test(sh.name.trim())) return;
      var si2 = 0, wi2 = 1;
      if (head) { var s2 = head.findIndex(function (h) { return /^(security|ticker|cusip|symbol)/.test(h); }), w2 = head.findIndex(function (h) { return /^weight/.test(h); }); if (s2 > -1) si2 = s2; if (w2 > -1) wi2 = w2; }
      out.push({ access: sh.name.trim().toUpperCase(), sheet: sh.name, rows: rows.slice(head ? 1 : 0).map(function (r, i) { return [r[si2], r[wi2], i + (head ? 2 : 1)]; }) });
    });
    return out;
  }
  /* validate one model's rows against the model as it stands now */
  function evaluate(raw, seen) {
    var m = C.findModel(raw.access), it = { access: raw.access, m: m, issues: [], rows: [], changes: [], removed: false };
    if (raw.fileErr) { it.issues.push(raw.fileErr); it.status = 'error'; return it; }
    if (!m) { it.issues.push('No model with Access code ' + raw.access + ' in your scope'); it.status = 'error'; return it; }
    if (seen[raw.access]) it.issues.push('Access code ' + raw.access + ' appears more than once in the file');
    seen[raw.access] = 1;
    if (m.parent) it.issues.push('Portfolios are not uploaded. Their weights come from the Composition tab.');
    var lb = C.lockedBy(m);
    if (lb) it.issues.push('Being edited by ' + C.displayName(lb) + '. Try again when they finish.');
    else if (m.draft && m.draft.live) it.issues.push('You have unsubmitted edits on this model. Submit or clear them first.');
    var w = {}, total = 0;
    raw.rows.forEach(function (r) {
      var tok = String(r[0] == null ? '' : r[0]).trim(), n = cellNum(r[1]);
      if (!tok && n == null) return;
      if (/^(usd\s*)?cash$/i.test(tok)) return; // cash is always the residual
      if (!tok) { it.issues.push('Row ' + r[2] + ': missing security'); return; }
      var c = C.checkSecurity(m, tok);
      if (c.err) { it.issues.push('Row ' + r[2] + ': ' + tok + ' - ' + c.err.replace(/\.? Not added to model\.?/, '')); return; }
      if (n == null) n = 0;
      if (isNaN(n) || n < 0 || n > 100) { it.issues.push('Row ' + r[2] + ': ' + tok + ' weight must be a number from 0 to 100'); return; }
      if (w[c.t] != null) it.issues.push('Row ' + r[2] + ': ' + c.t + ' is listed more than once');
      w[c.t] = r3((w[c.t] || 0) + n);
    });
    Object.keys(w).forEach(function (t) { total += w[t]; });
    total = r3(total);
    if (total > 100 + EPS) it.issues.push('Weights add up to ' + pct(total) + '. They cannot exceed 100%.');
    if (!Object.keys(w).length && !it.issues.length) it.issues.push('No securities found on sheet "' + raw.sheet + '"');
    it.total = total; it.cash = r3(100 - total); it.n = Object.keys(w).filter(function (t) { return w[t] > EPS; }).length; it.w = w;
    var cur = {}; m.holdings.forEach(function (h) { if (h.ticker !== CASH) cur[h.ticker] = h.weight; });
    Object.keys(Object.assign({}, cur, w)).forEach(function (t) { var f = cur[t] || 0, to = w[t] || 0; if (Math.abs(f - to) > EPS) it.changes.push({ ticker: t, from: f, to: to }); });
    it.changes.sort(function (a, b) { return Math.abs(b.to - b.from) - Math.abs(a.to - a.from); });
    var cashNow = m.holdings[0] && m.holdings[0].ticker === CASH ? m.holdings[0].weight : 0;
    it.turnover = r3((it.changes.reduce(function (a, c) { return a + Math.abs(c.to - c.from); }, 0) + Math.abs(it.cash - cashNow)) / 2);
    it.status = it.issues.length ? 'error' : it.changes.length ? 'ready' : 'same';
    return it;
  }
  function ingest(sheets, name) {
    var raw = split(sheets);
    if (!raw.length) { C.toast(name + ' has no model sheets. Name each sheet with an Access code, or add an Access column.'); return; }
    var seen = {};
    ST = { file: name, items: raw.map(function (r) { return evaluate(r, seen); }), f: 'all', open: {}, done: null };
    draw();
  }
  function readFile(f) {
    if (!f) return;
    var fail = function (err) { C.toast('Could not read ' + f.name + ': ' + (err && err.message ? err.message : 'unsupported file')); };
    if (/\.(xlsx|xlsm)$/i.test(f.name)) f.arrayBuffer().then(window.MDPXlsx.readAll).then(function (sheets) { ingest(sheets, f.name); }).catch(fail);
    else if (/\.(csv|txt)$/i.test(f.name)) f.text().then(function (t) { ingest([{ name: f.name, rows: C.parseCsv(t) }], f.name); }).catch(fail);
    else C.toast('Use an .xlsx workbook or a .csv file');
  }

  /* ---------------- download: one sheet per model ---------------- */
  function uploadable(mgr) { return C.models().filter(function (m) { return !m.parent && (!mgr || m.manager === mgr); }); }
  function managers() { var out = []; C.models().forEach(function (m) { if (!m.parent && out.indexOf(m.manager) < 0) out.push(m.manager); }); return out.sort(); }
  function downloadBook(mgr) {
    var list = uploadable(mgr);
    if (!list.length) { C.toast('No models to download'); return; }
    var cols = [{ h: 'Security (required)', w: 22, required: 1 }, { h: 'Weight % (required)', w: 18, required: 1, fmt: 'weight', max: 100 }, { h: 'Description (reference)', w: 40, ref: 1 }];
    var sheets = [{ name: 'How to use', notes: true, widths: [34, 90], lines: [
      { style: 'title', cells: ['Bulk upload workbook'] },
      { style: 'muted', cells: ['One sheet per model. The sheet name is the Access code: do not rename sheets.'] },
      { style: 'gap' },
      { style: 'hdr', cells: ['Rule', 'Detail'] },
      { style: 'row', cells: ['Each sheet is the whole model', 'A security that is not listed is removed from that model (weight 0).'] },
      { style: 'row', cells: ['Only two columns are read', 'Security (ticker, CUSIP, CINS or SEDOL) and Weight %. Other columns are ignored.'] },
      { style: 'row', cells: ['USD Cash', 'Calculated for you: 100% minus the weights you list. No cash row is needed.'] },
      { style: 'row', cells: ['Models you do not change', 'Leave their sheets as they are, or delete those sheets. Unchanged models are not resubmitted.'] },
      { style: 'row', cells: ['Checks', 'Every sheet is checked before anything is submitted. Problems are listed model by model.'] }
    ] }];
    list.forEach(function (m) {
      sheets.push({ name: m.access, cols: cols, rows: m.holdings.filter(function (h) { return h.ticker !== CASH; }).map(function (h) { return [h.ticker, h.weight, (SEC[h.ticker] || {}).desc || '']; }), blankRows: m.holdings.length + 15 });
    });
    window.MDPXlsx.writeBook('MDP_BULK_' + (mgr ? mgr.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase() : 'ALL') + '_' + C.todayISO() + '.xlsx', sheets, { title: 'MDP bulk upload' });
    C.toast('Downloaded ' + plural(list.length, 'model') + '. Edit the weights, then drop the file here.', 'ok');
  }
  /* Sample: the House View quarterly rebalance. Shifts US large cap toward international in every model that holds
     both, and includes the kinds of mistakes a real file has, so the checks are visible. */
  function sample() {
    var list = uploadable(C.SEED.houseViewManager);
    if (!list.length) list = uploadable(managers()[0]);
    var sheets = list.map(function (m, i) {
      var rows = [['Security', 'Weight %']], w = {};
      m.holdings.forEach(function (h) { if (h.ticker !== CASH) w[h.ticker] = h.weight; });
      if (i % 9 !== 4) { // most models change; a few are left alone
        var a = w.IVV != null ? 'IVV' : null, b = w.IEFA != null ? 'IEFA' : null;
        if (a && b && w[a] > 3) { w[a] = r3(w[a] - 1.5); w[b] = r3(w[b] + 1.5); }
        else { var ks = Object.keys(w).sort(function (x, y) { return w[y] - w[x]; }); if (ks.length > 1 && w[ks[0]] > 3) { w[ks[0]] = r3(w[ks[0]] - 1); w[ks[1]] = r3(w[ks[1]] + 1); } }
      }
      if (i === 6) w.TSLA = 2;                              // restricted security
      if (i === 17) { var k0 = Object.keys(w)[0]; w[k0] = r3(w[k0] + 9); } // over 100%
      if (i === 30) w.XXYZQ = 1.5;                          // unknown ticker
      Object.keys(w).forEach(function (t) { rows.push([t, w[t]]); });
      return { name: m.access, rows: rows };
    });
    ingest(sheets, 'HouseView_Q4_Rebalance_sample.xlsx');
  }

  /* ---------------- render ---------------- */
  function render(app) {
    if (!mgrSel || managers().indexOf(mgrSel) < 0) mgrSel = managers().indexOf(C.SEED.houseViewManager) > -1 ? C.SEED.houseViewManager : managers()[0];
    app.innerHTML =
      '<div class="banner detail"><a class="crumb" href="#/">' + I.left + 'Model List</a><h1>Model Delivery Portal</h1>' + C.bannerTools() + '</div>' +
      '<div class="page"><section class="card ml-head"><div class="ml-title">Bulk Upload</div>' +
        '<div class="kv mgr"><span class="k">Update many models from one workbook</span><span class="v" id="bk-sub"></span></div><div class="ml-tools" id="bk-tools"></div></section>' +
        '<section class="card grid-card bk-card"><div id="bk-body"></div></section></div><input type="file" id="bk-file" accept=".xlsx,.xlsm,.csv" hidden>';
    $('#bk-file').addEventListener('change', function (e) { readFile(e.target.files[0]); e.target.value = ''; });
    draw();
  }
  function draw() {
    var body = $('#bk-body'); if (!body) return;
    var sub = $('#bk-sub'), tools = $('#bk-tools');
    if (!ST) {
      sub.textContent = 'One sheet per model, named with its Access code';
      tools.innerHTML = '';
      var ms = managers();
      body.innerHTML =
        '<div class="bk-start"><div class="bk-drop" id="bk-drop" data-bk="browse"><div class="bk-drop-ic">' + I.upload + '</div><b>Drop a workbook here, or click to browse</b><span>.xlsx with one sheet per model, or .csv with Access, Security, Weight % columns</span>' +
          '<button class="tool-link" data-bk="sample">No file to hand? Load the sample: House View quarterly rebalance (' + uploadable(C.SEED.houseViewManager).length + ' models)</button></div>' +
        '<div class="bk-side"><div class="dv-sec-h">Start from current models</div><p>Download a workbook with the current weights of every model for a manager, one sheet each. Change what you need and drop it back here.</p>' +
          '<div class="bk-dl"><select id="bk-mgr">' + ms.map(function (x) { return '<option' + (x === mgrSel ? ' selected' : '') + ' value="' + esc(x) + '">' + esc(x) + ' (' + uploadable(x).length + ')</option>'; }).join('') + '</select><button class="btn btn-black" data-bk="download">' + 'Download Workbook</button></div>' +
          '<div class="dv-sec-h bk-h2">How it is checked</div><ul class="bk-rules"><li>Each sheet is the whole model. Securities you leave out are removed.</li><li>USD Cash is the remainder to 100%.</li><li>Restricted or unknown securities, weights over 100% and locked models are listed before anything is submitted.</li><li>Each model is submitted the normal way: audit trail, snapshot, portfolio recalculation and delivery.</li></ul></div></div>';
      var sel = $('#bk-mgr'); if (sel) sel.addEventListener('change', function (e) { mgrSel = e.target.value; });
      return;
    }
    if (ST.done) { drawDone(body, sub, tools); return; }
    var items = ST.items.filter(function (x) { return !x.removed; });
    var cnt = { ready: 0, same: 0, error: 0 }, accts = 0, pf = {};
    items.forEach(function (x) { cnt[x.status]++; if (x.status === 'ready') { accts += x.m.accounts; if (C.isAdmin()) C.B.usedIn(x.m).forEach(function (p) { pf[p.access] = p; }); } });
    var nPf = Object.keys(pf).length;
    sub.textContent = ST.file + ' · ' + plural(ST.items.length, 'model');
    tools.innerHTML = '<button class="tool-link" data-bk="reset">Start over</button>';
    var tile = function (k, v, s, cls) { return '<div class="bb-tile' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; };
    var chip = function (v, label, n) { return '<button class="fchip' + (ST.f === v ? ' on' : '') + '" data-bk="f" data-v="' + v + '">' + label + ' <b>' + n + '</b></button>'; };
    var shown = items.filter(function (x) { return ST.f === 'all' || x.status === ST.f; });
    var why = cnt.error ? 'Fix ' + plural(cnt.error, 'model') + ' with problems in the file and upload again, or remove ' + (cnt.error === 1 ? 'it' : 'them') + ' from this batch' : !cnt.ready ? 'Nothing to submit: no model in the file differs from what is published' : '';
    body.innerHTML =
      '<div class="bb-tiles">' + tile('Models In File', items.length, ST.items.length - items.length ? (ST.items.length - items.length) + ' removed from batch' : 'checked against current models') +
        tile('Ready', cnt.ready, 'will be submitted') + tile('No Change', cnt.same, 'same as published, left alone') +
        tile('Problems', cnt.error, cnt.error ? 'must be fixed or removed' : 'none found', cnt.error ? 'attn' : '') +
        tile('Reach', num(accts, 0), 'accounts' + (nPf ? ' · ' + plural(nPf, 'portfolio') + ' recalculated' : '')) + '</div>' +
      '<div class="bb-hbar"><div class="fchips">' + chip('all', 'All', items.length) + chip('ready', 'Ready', cnt.ready) + chip('same', 'No Change', cnt.same) + chip('error', 'Problems', cnt.error) + '</div><span class="bb-hint">Click a model to see its changes or problems.</span></div>' +
      '<div class="grid-scroll bk-scroll"><table class="grid bk-grid"><colgroup><col style="width:26px"><col style="width:70px"><col><col style="width:190px"><col style="width:92px"><col style="width:100px"><col style="width:96px"><col style="width:92px"><col style="width:92px"><col style="width:130px"><col style="width:74px"></colgroup>' +
      '<thead><tr><th></th><th>Access</th><th>Model</th><th>Manager</th><th class="r">Securities</th><th class="r">USD Cash</th><th class="r">Changes</th><th class="r">Turnover</th><th class="r">Accounts</th><th>Result</th><th></th></tr></thead><tbody>' +
      (shown.length ? shown.map(rowHtml).join('') : '<tr class="empty-row"><td colspan="11">Nothing to show</td></tr>') + '</tbody></table></div>' +
      '<div class="md-buttons bk-buttons"><span class="gd-msg">' + (why ? I.attn + '<span>' + esc(why) + '.</span>' : '<span>Each model is submitted and approved separately. Portfolios that use them are recalculated.</span>') + '</span>' +
        '<button class="btn btn-text" data-bk="reset">Cancel</button><button class="btn btn-tan" id="bk-submit" data-bk="submit">Submit ' + plural(cnt.ready, 'Model') + '</button></div>';
    C.setBtn($('#bk-submit'), why);
  }
  function rowHtml(x) {
    var open = !!ST.open[x.access], m = x.m, res = x.status === 'ready' ? '<span class="dv-chip ok">Ready</span>' : x.status === 'same' ? '<span class="dv-chip">No change</span>' : '<span class="dv-chip ex">' + plural(x.issues.length, 'problem') + '</span>';
    var out = '<tr class="dv-row bb-sec' + (open ? ' open' : '') + '" data-bk="open" data-acc="' + esc(x.access) + '"><td class="chevc">' + I.chev + '</td><td class="b">' + esc(x.access) + '</td>' +
      '<td data-tip="' + esc(m ? m.name : '') + '" data-tip-trunc>' + (m ? C.typeTag(m) + esc(m.name) : '<span class="muted">Not found</span>') + '</td><td data-tip="' + esc(m ? m.manager : '') + '" data-tip-trunc>' + esc(m ? m.manager : '') + '</td>' +
      '<td class="r">' + (x.n != null ? x.n : '-') + '</td><td class="r' + (x.cash < -EPS ? ' neg b' : '') + '">' + (x.cash != null ? pct(x.cash) : '-') + '</td><td class="r">' + (x.changes.length || '-') + '</td><td class="r">' + (x.turnover ? pct(x.turnover, 2) : '-') + '</td><td class="r">' + (m ? num(m.accounts, 0) : '-') + '</td><td>' + res + '</td>' +
      '<td class="c"><button class="del" data-bk="remove" data-acc="' + esc(x.access) + '" data-tip="Leave this model out of the batch" data-tip-anchor>Remove</button></td></tr>';
    if (open) out += '<tr class="bb-x"><td></td><td colspan="10">' +
      (x.issues.length ? '<ul class="bk-issues">' + x.issues.map(function (s) { return '<li>' + I.errBang + '<span>' + esc(s) + '</span></li>'; }).join('') + '</ul>' : '') +
      (x.changes.length ? '<table class="chg-tbl bk-chg"><thead><tr><th>Ticker</th><th>Description</th><th class="r">Published</th><th class="r">In file</th><th class="r">Change</th></tr></thead><tbody>' +
        x.changes.slice(0, 15).map(function (c) { var d = r3(c.to - c.from); return '<tr><td>' + esc(c.ticker) + '</td><td>' + esc((SEC[c.ticker] || {}).desc || '') + '</td><td class="r">' + pct(c.from) + '</td><td class="r">' + (c.to < EPS ? 'Removed' : pct(c.to)) + '</td><td class="r ' + (d > 0 ? 'pos' : 'neg') + '">' + (d > 0 ? '+' : '') + pct(d) + '</td></tr>'; }).join('') +
        '</tbody></table>' + (x.changes.length > 15 ? '<div class="muted">' + (x.changes.length - 15) + ' more changes not shown.</div>' : '') : (x.issues.length ? '' : '<div class="muted">The file matches the published model.</div>')) + '</td></tr>';
    return out;
  }

  /* ---------------- submit ---------------- */
  function submit() {
    var b = $('#bk-submit'); if (!b || b.classList.contains('is-disabled')) return;
    var ready = ST.items.filter(function (x) { return !x.removed && x.status === 'ready'; }), done = [], pf = {}, failed = [];
    ready.forEach(function (x) {
      var m = x.m;
      if (C.lockedBy(m) || (m.draft && m.draft.live)) { failed.push(x.access); return; } // changed since the file was checked
      var d = C.getDraft(m);
      d.rows.forEach(function (r) { if (r.ticker !== CASH) r.nw = x.w[r.ticker] || 0; });
      Object.keys(x.w).forEach(function (t) { if (!C.rowOf(d, t) && x.w[t] > EPS) { var nr = C.newRow(t, 0); nr.nw = x.w[t]; nr.added = true; d.rows.push(nr); } });
      C.syncCash(m, false);
      C.touch(m);
      C.logEvent(m, { ts: C.nowStamp(), event: 'Model Imported', user: C.persona.user, details: 'Bulk upload: ' + ST.file + ' (' + plural(x.changes.length, 'change') + ')' });
      var res = C.applySubmit(m);
      (res.blocks || []).forEach(function (p) { pf[p.access] = p; });
      done.push({ access: m.access, name: m.name, n: x.changes.length, accounts: m.accounts });
    });
    ST.done = { models: done, portfolios: Object.keys(pf), failed: failed, accounts: done.reduce(function (a, x) { return a + x.accounts; }, 0), at: C.nowStamp() };
    draw();
  }
  function drawDone(body, sub, tools) {
    var d = ST.done;
    sub.textContent = ST.file;
    tools.innerHTML = '';
    body.innerHTML = '<div class="bk-done"><div class="bk-done-h">' + I.ok + '<div><b>' + plural(d.models.length, 'model') + ' approved</b><span>' + num(d.accounts, 0) + ' accounts' + (d.portfolios.length ? ' · ' + plural(d.portfolios.length, 'portfolio') + ' recalculated (' + d.portfolios.slice(0, 6).join(', ') + (d.portfolios.length > 6 ? '…' : '') + ')' : '') + ' · each model has its own delivery</span></div></div>' +
      (d.failed.length ? '<div class="ac-note">' + I.info + '<span>' + plural(d.failed.length, 'model') + ' changed while you were reviewing and was not submitted: ' + esc(d.failed.join(', ')) + '.</span></div>' : '') +
      '<div class="bk-done-a"><a class="btn btn-black" href="#/delivery">Track Deliveries</a><button class="btn btn-text" data-bk="reset">Upload Another File</button><a class="btn btn-text" href="#/">Model List</a></div>' +
      '<div class="grid-scroll bk-scroll"><table class="grid bk-grid"><colgroup><col style="width:80px"><col><col style="width:110px"><col style="width:110px"><col style="width:140px"></colgroup><thead><tr><th>Access</th><th>Model</th><th class="r">Changes</th><th class="r">Accounts</th><th>Delivery</th></tr></thead><tbody>' +
      d.models.map(function (x) { return '<tr><td class="b">' + esc(x.access) + '</td><td>' + esc(x.name) + '</td><td class="r">' + x.n + '</td><td class="r">' + num(x.accounts, 0) + '</td><td><a class="lnk" href="#/model/' + encodeURIComponent(x.access) + '/info/delivery">Open delivery</a></td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-bk]'); if (!el) return;
    var a = el.getAttribute('data-bk'), acc = el.getAttribute('data-acc');
    if (a === 'sample') { e.stopPropagation(); sample(); }
    else if (a === 'browse') { if (!e.target.closest('button')) $('#bk-file').click(); }
    else if (a === 'download') downloadBook(mgrSel);
    else if (a === 'reset') { ST = null; draw(); }
    else if (a === 'f') { ST.f = el.getAttribute('data-v'); draw(); }
    else if (a === 'remove') { e.stopPropagation(); ST.items.forEach(function (x) { if (x.access === acc) x.removed = true; }); draw(); }
    else if (a === 'open') { ST.open[acc] = !ST.open[acc]; draw(); }
    else if (a === 'submit') submit();
  });
  var depth = 0;
  function onBulk() { return !!document.getElementById('bk-body'); }
  document.addEventListener('dragenter', function (e) { if (!onBulk()) return; depth++; var d = $('#bk-drop'); if (d) d.classList.add('over'); e.preventDefault(); });
  document.addEventListener('dragleave', function () { if (!onBulk()) return; depth = Math.max(0, depth - 1); if (!depth) { var d = $('#bk-drop'); if (d) d.classList.remove('over'); } });
  document.addEventListener('dragover', function (e) { if (onBulk()) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (!onBulk()) return;
    e.preventDefault(); depth = 0;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { if (ST && ST.done) ST = null; readFile(f); }
  });

  window.MDPBulk = { render: render, sample: sample, state: function () { return ST; }, reset: function () { ST = null; } };
})();
