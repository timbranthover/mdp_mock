/* Model Delivery Portal — Import drawer
 *
 * One panel for every way a model change arrives:
 *   paste from Excel (Ctrl+V anywhere), type a few lines, drop a file, or browse.
 * Columns are detected automatically (headers optional), securities are resolved by
 * ticker / CUSIP / CINS / SEDOL / company name, and a live preview shows exactly what
 * will change before anything touches the model.
 *
 *   Single model (from Model Details): Apply to Model -> fills the grid, Undo available.
 *   Bulk (from Model List): sheet with an Access column -> Submit all, or Apply as drafts.
 */
(function () {
  'use strict';
  var C = window.MDPCore;
  if (!C) return;
  var SEC = C.SEC, CASH = C.CASH, EPS = C.EPS, esc = C.esc, num = C.num, r3 = C.round3;
  var root = document.getElementById('imp-root');
  var TRADE = C.SEED.tradeTypes;

  /* ---------------- indexes (built once) ---------------- */
  var TICKERS = Object.keys(SEC);
  var NAMES = TICKERS.map(function (t) { return { t: t, words: SEC[t].desc.toUpperCase().split(/[^A-Z0-9&]+/).filter(Boolean) }; });
  function accessIndex() { var o = {}; C.models().forEach(function (m) { o[m.access.toUpperCase()] = m; }); return o; }

  var ROLES = [
    ['id', 'Security / CUSIP'], ['id2', 'Security / CUSIP (backup)'], ['weight', 'Weight'], ['shares', 'Shares'], ['mv', 'Market Value'],
    ['tt', 'TradeType'], ['dnb', 'DoNotBuy'], ['dns', 'DoNotSell'], ['notes', 'Notes'], ['access', 'Access (model)'], ['ignore', 'Ignore']
  ];
  var ROLE_LABEL = {}; ROLES.forEach(function (r) { ROLE_LABEL[r[0]] = r[1]; });
  var HEADER_RULES = [
    [/^(access|accessfoa|foa|model|modelcode|account)$/, 'access'],
    [/^(security|ticker|symbol|identifier|securityid|sedol)/, 'id'],
    [/^(cusip|cins|isin)/, 'id'],
    [/^(newweight|targetweight|target|weight|wt|allocation|alloc|%|pct|percent)/, 'weight'],
    [/^(shares|quantity|qty|units|position)/, 'shares'],
    [/^(marketvalue|mv|value|amount|mktval)/, 'mv'],
    [/^(tradetype|trade|action)/, 'tt'],
    [/^(donotbuy|dnb)/, 'dnb'],
    [/^(donotsell|dns)/, 'dns'],
    [/^(notes?|comments?|memo)/, 'notes'],
    [/^(description|name|securityname|strategyname|price|difference|change|investmenttype|type|weightchange|currentweight|oldweight|previousweight)/, 'ignore']
  ];

  /* ---------------- small helpers ---------------- */
  function normHeader(h) { return String(h == null ? '' : h).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[\s_\-\.:]+/g, ''); }
  function cleanNum(v) {
    if (typeof v === 'number') return { n: v, pct: false };
    var s = String(v == null ? '' : v).trim();
    if (!s) return { n: NaN, pct: false, blank: true };
    var pct = /%\s*$/.test(s), neg = /^\(.*\)$/.test(s);
    s = s.replace(/[%$,\s()]/g, '');
    if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return { n: NaN, pct: pct };
    var n = +s; if (neg) n = -n;
    return { n: n, pct: pct };
  }
  function isCashToken(t) { return /^(usd\s*)?cash(\s*\(usd\))?$|^\$\s*cash$|^cash\s*usd$/i.test(String(t).trim()); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function nameMatches(tok) {
    var words = tok.toUpperCase().split(/[^A-Z0-9&]+/).filter(function (w) { return w.length >= 2; });
    if (!words.length || !/[A-Z]/i.test(tok) || tok.replace(/\s/g, '').length < 3) return [];
    return NAMES.filter(function (n) { return words.every(function (w) { return n.words.some(function (x) { return x.indexOf(w) === 0; }); }); }).map(function (n) { return n.t; });
  }
  function suggestions(tok) {
    var T = tok.toUpperCase().replace(/\s/g, ''), out = [];
    if (/^[A-Z0-9./]{1,6}$/.test(T)) {
      TICKERS.forEach(function (t) { var d = lev(T, t); if (d <= (T.length <= 3 ? 1 : 2)) out.push([d, t]); });
      out.sort(function (a, b) { return a[0] - b[0]; });
      out = out.map(function (x) { return x[1]; });
    }
    nameMatches(tok).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    if (!out.length) {
      var first = tok.toUpperCase().split(/[^A-Z0-9&]+/).filter(function (w) { return w.length >= 3; })[0];
      if (first) NAMES.forEach(function (n) { if (n.words.some(function (x) { return x.indexOf(first) === 0; }) && out.length < 4) out.push(n.t); });
    }
    return out.slice(0, 4);
  }
  /* Resolve one pasted identifier against the security master + model rules. */
  function resolve(m, tok) {
    tok = String(tok == null ? '' : tok).trim();
    if (!tok) return { err: 'Missing security' };
    if (isCashToken(tok)) return { t: CASH, how: 'cash' };
    var c = C.checkSecurity(m, tok);
    if (c.t && !c.err) return { t: c.t, how: 'id' };
    if (c.t && c.err) return { t: c.t, err: c.err, rule: true };
    // Name matching only for name-like input ("Apple", "Microsoft Corp"); ticker-shaped typos ("APPL") get suggestions instead.
    var nameLike = /[a-z]/.test(tok) || /\s/.test(tok.trim()) || tok.length > 6;
    var byName = nameLike ? nameMatches(tok) : [];
    if (byName.length === 1) {
      var c2 = C.checkSecurity(m, byName[0]);
      return c2.err ? { t: byName[0], err: c2.err, rule: true } : { t: byName[0], how: 'name' };
    }
    if (byName.length > 1) return { err: 'Matches more than one security. Pick one:', sugg: byName.slice(0, 4) };
    return { err: 'Invalid security. Not added to model.', sugg: suggestions(tok) };
  }

  /* ---------------- text / file parsing ---------------- */
  function parseDelimited(text, delim) {
    var rows = [], row = [], cell = '', q = false, i = 0, ch;
    text = text.replace(/\r\n?/g, '\n');
    for (; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseText(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    if (text.indexOf('\t') > -1) return parseDelimited(text, '\t');
    var commaLines = lines.filter(function (l) { return l.indexOf(',') > -1; }).length;
    if (commaLines >= Math.ceil(lines.length * 0.6)) return parseDelimited(text, ',');
    if (lines.filter(function (l) { return l.indexOf(';') > -1; }).length >= Math.ceil(lines.length * 0.6)) return parseDelimited(text, ';');
    // free typing: "AAPL 5", "Apple Inc 10%", "MSFT=2.5"
    return lines.map(function (l) {
      var mm = /^(.*?)[\s=:]+([-+(]?\$?[\d.,]+%?\)?)\s*$/.exec(l.trim());
      return mm ? [mm[1].trim(), mm[2]] : [l.trim()];
    });
  }
  function trimGrid(g) {
    g = g.map(function (r) { return r.map(function (v) { return typeof v === 'string' ? v.trim() : v; }); })
      .filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
    var w = g.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    g.forEach(function (r) { while (r.length < w) r.push(''); });
    // drop fully empty columns
    var keep = []; for (var j = 0; j < w; j++) if (g.some(function (r) { return String(r[j]).trim() !== ''; })) keep.push(j);
    return g.map(function (r) { return keep.map(function (j) { return r[j]; }); });
  }

  /* ---------------- column detection ---------------- */
  function detect(grid, bulk) {
    var acc = accessIndex();
    var w = grid[0] ? grid[0].length : 0, roles = [], header = false;
    var r0 = grid[0] || [];
    var headerHit = r0.some(function (h) { var n = normHeader(h); return n && HEADER_RULES.some(function (r) { return r[0].test(n); }); });
    var r0Plain = r0.every(function (v) { return v === '' || isNaN(cleanNum(v).n); }) && !r0.some(function (v) { return v !== '' && (C.resolveSecurity(String(v)) || acc[String(v).toUpperCase()]); });
    header = headerHit || (r0Plain && grid.length > 1 && grid[1].some(function (v) { return !isNaN(cleanNum(v).n); }));
    var data = header ? grid.slice(1) : grid, sample = data.slice(0, 300);
    for (var j = 0; j < w; j++) {
      var role = null;
      if (header) { var n = normHeader(r0[j]); for (var k = 0; k < HEADER_RULES.length; k++) if (HEADER_RULES[k][0].test(n)) { role = HEADER_RULES[k][1]; break; } }
      if (!role) {
        var vals = sample.map(function (r) { return r[j]; }).filter(function (v) { return String(v).trim() !== ''; });
        var nv = vals.length || 1;
        var accS = vals.filter(function (v) { return acc[String(v).toUpperCase()]; }).length / nv;
        var idS = vals.filter(function (v) { return isCashToken(v) || C.resolveSecurity(String(v)) || nameMatches(String(v)).length === 1; }).length / nv;
        var numS = vals.filter(function (v) { return !isNaN(cleanNum(v).n); }).length / nv;
        var ttS = vals.filter(function (v) { return TRADE.indexOf(String(v)) > 0; }).length / nv;
        if (accS >= 0.6) role = 'access';
        else if (idS >= 0.5) role = 'id';
        else if (numS >= 0.8) role = 'num';
        else if (ttS >= 0.5) role = 'tt';
        else if (vals.length && vals.every(function (v) { return /^[a-z]{2,}/i.test(String(v)) && !C.resolveSecurity(String(v)); })) role = (idS > 0.2 ? 'id' : 'ignore');
        else role = 'ignore';
      }
      roles.push(role);
    }
    // keep the first id as primary, the second as backup, extra ones ignored
    var ids = roles.reduce(function (a, r, i) { if (r === 'id') a.push(i); return a; }, []);
    ids.forEach(function (i, n) { roles[i] = n === 0 ? 'id' : n === 1 ? 'id2' : 'ignore'; });
    // weight: header wins; otherwise the numeric column whose total looks like 100% (or 1.0)
    var nums = roles.reduce(function (a, r, i) { if (r === 'num') a.push(i); return a; }, []);
    if (roles.indexOf('weight') < 0 && roles.indexOf('shares') < 0 && roles.indexOf('mv') < 0 && nums.length) {
      var best = nums[0], bestScore = 1e9;
      nums.forEach(function (j) {
        var s = data.reduce(function (a, r) { var c = cleanNum(r[j]); return a + (isNaN(c.n) ? 0 : c.n); }, 0);
        var groups = bulk && roles.indexOf('access') > -1 ? Math.max(1, new Set(data.map(function (r) { return String(r[roles.indexOf('access')]).toUpperCase(); })).size) : 1;
        var per = s / groups, score = Math.min(Math.abs(per - 100), Math.abs(per - 1) * 100);
        if (score < bestScore) { bestScore = score; best = j; }
      });
      roles[best] = 'weight';
    }
    roles = roles.map(function (r) { return r === 'num' ? 'ignore' : r; });
    ['weight', 'access', 'tt', 'dnb', 'dns', 'notes', 'shares', 'mv'].forEach(function (role) {
      var seen = false; roles = roles.map(function (r) { if (r !== role) return r; if (seen) return 'ignore'; seen = true; return r; });
    });
    return { header: header, roles: roles };
  }

  /* ---------------- state ---------------- */
  var ST = null;
  function fresh(access) {
    var m = access ? C.findModel(access) : null;
    return { bulk: !m, m: m, grid: null, header: false, roles: [], text: '', source: null, replace: null, skip: false, filter: 'all', fix: {}, drop: {}, open: {}, editing: false };
  }

  /* ---------------- compute preview ---------------- */
  function baseOf(m) {
    var b = {}, meta = {};
    if (m.draft && m.draft.live) m.draft.rows.forEach(function (r) { b[r.ticker] = +r.nw || 0; meta[r.ticker] = r; });
    else m.holdings.forEach(function (h) { b[h.ticker] = h.weight; });
    if (!(CASH in b)) b[CASH] = 0;
    return { w: b, meta: meta };
  }
  function compute() {
    var R = ST.roles, col = function (role) { return R.indexOf(role); };
    var cId = col('id'), cId2 = col('id2'), cW = col('weight'), cSh = col('shares'), cMv = col('mv'), cA = col('access');
    var cTT = col('tt'), cB = col('dnb'), cS = col('dns'), cN = col('notes');
    var data = ST.header ? ST.grid.slice(1) : ST.grid, acc = accessIndex();
    var out = { groups: [], missing: [], rows: data.length };
    if (cId < 0 && cId2 < 0) out.missing.push('Security / CUSIP');
    if (cW < 0 && cSh < 0 && cMv < 0) out.missing.push('Weight');
    if (ST.bulk && cA < 0) out.missing.push('Access (model)');
    if (out.missing.length) return out;
    var groups = {}, order = [];
    data.forEach(function (r, i) {
      var key = ST.bulk ? String(r[cA] || '').trim().toUpperCase() || '(blank)' : '_';
      var gi = i + (ST.header ? 1 : 0);
      if (ST.drop[gi]) return;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ i: gi, r: r });
    });
    order.forEach(function (key) {
      var m = ST.bulk ? acc[key] : ST.m, g = { key: key, m: m, rows: [], notes: [], problem: null };
      out.groups.push(g);
      if (!m) {
        g.problem = key === '(blank)' ? 'Rows without an Access code' : 'Model ' + key + ' not found';
        var toks = groups[key].map(function (x) { return String(x.r[cId] || (cId2 > -1 ? x.r[cId2] : '') || '').trim(); }).filter(Boolean);
        g.notes.push(groups[key].length + ' row' + (groups[key].length === 1 ? '' : 's') + ' skipped' + (toks.length ? ': ' + toks.slice(0, 8).join(', ') + (toks.length > 8 ? '…' : '') : ''));
        g.counts = { changed: 0, new: 0, removed: 0, error: 0, same: 0 }; g.changes = 0; g.ready = false;
        return;
      }
      var locked = C.lockedBy(m);
      if (locked) g.problem = 'Being edited by ' + C.displayName(locked);
      var base = baseOf(m), seen = {}, pastedCash = null;
      // pass 1: resolve + raw values
      var useVal = cW < 0 ? (cMv > -1 ? 'mv' : 'shares') : null, vals = [];
      groups[key].forEach(function (x) {
        var token = ST.fix[x.i] != null ? ST.fix[x.i] : (String(x.r[cId] || '').trim() || String(cId2 > -1 ? x.r[cId2] || '' : '').trim());
        var res = resolve(m, token), raw = cleanNum(cW > -1 ? x.r[cW] : useVal === 'mv' ? x.r[cMv] : x.r[cSh]);
        var row = { i: x.i, token: token, res: res, raw: raw, t: res.t, err: res.err || null, sugg: res.sugg, how: res.how };
        if (!row.err && !raw.blank && (isNaN(raw.n) || raw.n < 0)) row.err = 'Weight must be a number of 0 or more';
        if (cTT > -1 && String(x.r[cTT]).trim()) { var tt = String(x.r[cTT]).trim(); row.tt = TRADE.filter(function (o) { return o.toLowerCase() === tt.toLowerCase(); })[0] || null; if (!row.tt && !row.err) row.warn = 'Unknown TradeType "' + tt + '" ignored'; }
        if (cB > -1 && String(x.r[cB]).trim()) row.dnb = /^(y|yes|true|1|x)$/i.test(String(x.r[cB]).trim());
        if (cS > -1 && String(x.r[cS]).trim()) row.dns = /^(y|yes|true|1|x)$/i.test(String(x.r[cS]).trim());
        if (cN > -1 && String(x.r[cN]).trim()) row.notes = String(x.r[cN]).trim();
        vals.push(row);
      });
      // weight normalization
      var ok = vals.filter(function (v) { return !v.err; });
      if (useVal) {
        var tot = 0;
        ok.forEach(function (v) { var p = v.t === CASH ? 1 : (SEC[v.t] ? SEC[v.t].price : 0); v.val = (isNaN(v.raw.n) ? 0 : v.raw.n) * (useVal === 'shares' ? p : 1); tot += v.val; });
        ok.forEach(function (v) { v.w = tot ? r3(v.val / tot * 100) : 0; });
        g.notes.push('Weights calculated from ' + (useVal === 'mv' ? 'market value' : 'shares × EOD price'));
      } else {
        var anyPct = ok.some(function (v) { return v.raw.pct; }), s = 0, maxv = 0;
        ok.forEach(function (v) { var n = isNaN(v.raw.n) ? 0 : v.raw.n; s += n; maxv = Math.max(maxv, n); });
        var frac = !anyPct && maxv <= 1.0000001 && s > 0.5 && s <= 1.0001;
        ok.forEach(function (v) { var n = isNaN(v.raw.n) ? 0 : v.raw.n; v.w = r3(frac ? n * 100 : n); });
        if (frac) g.notes.push('Decimal weights converted to percent (0.10 → 10.000%)');
      }
      // duplicates -> combine
      ok.forEach(function (v) {
        if (v.t === CASH) { pastedCash = (pastedCash || 0) + v.w; v.status = 'cashp'; return; }
        if (seen[v.t]) {
          seen[v.t].parts = (seen[v.t].parts || [seen[v.t].w]).concat([v.w]);
          seen[v.t].w = r3(seen[v.t].w + v.w); seen[v.t].combined = (seen[v.t].combined || 1) + 1; v.status = 'merged'; v.into = seen[v.t].t; return;
        }
        seen[v.t] = v;
      });
      // mode
      var baseNon = Object.keys(base.w).filter(function (t) { return t !== CASH && base.w[t] > EPS; });
      var pastedNon = Object.keys(seen), covered = pastedNon.filter(function (t) { return base.w[t] > EPS; }).length;
      var pastedSum = pastedNon.reduce(function (a, t) { return a + seen[t].w; }, 0);
      g.coverage = { covered: covered, of: baseNon.length, pasted: pastedNon.length, sum: pastedSum };
      g.auto = pastedSum >= 90 || (baseNon.length > 0 && covered / baseNon.length >= 0.6);
      g.replace = ST.replace == null ? g.auto : ST.replace;
      // final weights
      var fin = {};
      Object.keys(base.w).forEach(function (t) { if (t !== CASH) fin[t] = g.replace ? 0 : base.w[t]; });
      pastedNon.forEach(function (t) { fin[t] = seen[t].w; });
      var others = Object.keys(fin).reduce(function (a, t) { return a + fin[t]; }, 0);
      var cash = r3(100 - others); if (Math.abs(cash) < EPS) cash = 0;
      Object.keys(seen).forEach(function (t) { if (seen[t].parts) g.notes.push(t + ' appears ' + seen[t].parts.length + ' times. Weights were added together (' + seen[t].parts.map(function (x) { return x.toFixed(3) + '%'; }).join(' + ') + ' = ' + seen[t].w.toFixed(3) + '%).'); });
      g.fin = fin; g.cash = cash; g.base = base; g.seen = seen; g.pastedCash = pastedCash;
      if (cash < -EPS && !g.problem) g.problem = 'Over 100% by ' + (-cash).toFixed(3) + '%' + (g.replace ? '' : ', not enough cash. Lower other weights or use Replace');
      if (pastedCash != null && Math.abs(pastedCash - cash) > 0.01) g.notes.push('USD Cash set to ' + cash.toFixed(3) + '% so the model totals 100% (you pasted ' + pastedCash.toFixed(3) + '%)');
      // preview rows
      var rows = [];
      rows.push({ kind: 'cash', t: CASH, cur: base.w[CASH] || 0, nw: cash });
      vals.forEach(function (v) {
        if (v.status === 'cashp') return;
        if (v.err) { rows.push({ kind: ST.skip ? 'skipped' : 'error', i: v.i, token: v.token, err: v.err, sugg: v.sugg, t: v.t }); return; }
        if (v.status === 'merged') { rows.push({ kind: 'merged', i: v.i, t: v.t, token: v.token, into: v.into, nw: v.w }); return; }
        var cur = base.w[v.t] || 0;
        rows.push({ kind: cur > EPS ? (Math.abs(v.w - cur) > EPS ? 'changed' : 'same') : 'new', i: v.i, t: v.t, token: v.token, cur: cur, nw: fin[v.t], how: v.how, combined: v.combined, warn: v.warn, tt: v.tt, dnb: v.dnb, dns: v.dns, notes: v.notes });
      });
      if (g.replace) baseNon.forEach(function (t) { if (!seen[t]) rows.push({ kind: 'removed', t: t, cur: base.w[t], nw: 0 }); });
      g.rows = rows;
      g.counts = { changed: 0, new: 0, removed: 0, error: 0, same: 0 };
      rows.forEach(function (r) { if (r.kind in g.counts) g.counts[r.kind]++; });
      g.changes = g.counts.changed + g.counts.new + g.counts.removed + (Math.abs(cash - (base.w[CASH] || 0)) > EPS ? 1 : 0);
      g.meta = rows.some(function (r) { return r.tt || r.dnb != null || r.dns != null || r.notes; });
      g.ready = !g.problem && !g.counts.error && (g.changes > 0 || g.meta);
    });
    return out;
  }

  /* ---------------- rendering ---------------- */
  var I2 = {
    clip: '<svg viewBox="0 0 40 40"><rect x="9" y="7" width="22" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="15" y="4" width="10" height="6" rx="1.5" fill="#fff" stroke="currentColor" stroke-width="1.6"/><path d="M14 18h12M14 23h12M14 28h7" stroke="currentColor" stroke-width="1.6"/></svg>',
    copy: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    chev: '<svg viewBox="0 0 12 12"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    check: '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    x: '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.6"/></svg>'
  };
  var CHIP = {
    changed: ['', ''], same: ['muted', 'No change'], new: ['new', 'New'], removed: ['rem', 'Removed'], error: ['err', 'Fix needed'],
    skipped: ['muted', 'Skipped'], merged: ['info', 'Combined'], cash: ['muted', 'Auto'], skip: ['muted', 'Skipped']
  };
  function chg(cur, nw) {
    var v = r3(nw - cur);
    if (v > EPS) return '<span class="pos">+' + v.toFixed(3) + '% <i class="arr">&#9650;</i></span>';
    if (v < -EPS) return '<span class="neg">' + v.toFixed(3) + '% <i class="arr">&#9660;</i></span>';
    return '<span class="muted">0.000%</span>';
  }
  function rowHtml(g, r) {
    var s = r.t && SEC[r.t], price = r.t === CASH ? 1 : s ? s.price : null, chip = CHIP[r.kind] || ['', ''], extra = '';
    if (r.kind === 'error' || r.kind === 'skipped') {
      var rmLink = r.kind === 'error' ? '<button class="imp-rm-l" data-imp="drop" data-row="' + r.i + '" data-tok="' + esc(r.token) + '">Remove row</button>' : '';
      var sugg = r.sugg && r.sugg.length ? '<div class="imp-sugg">' + (r.kind === 'error' && /Invalid/.test(r.err) ? 'Did you mean ' : '') + r.sugg.map(function (t) { return '<button data-imp="sugg" data-row="' + r.i + '" data-t="' + esc(t) + '" title="' + esc(SEC[t].desc) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '';
      return '<tr class="k-' + r.kind + '"><td><input class="imp-fix" data-row="' + r.i + '" value="' + esc(r.token) + '" spellcheck="false" aria-label="Fix security for row ' + (r.i + 1) + '"></td>' +
        '<td colspan="5"><div class="imp-err">' + esc(r.err) + (r.kind === 'skipped' ? ' <em>(skipped)</em>' : '') + '</div>' + (sugg || rmLink ? '<div class="imp-sugg">' + (sugg ? sugg.replace(/^<div class="imp-sugg">|<\/div>$/g, '') : '') + (sugg && rmLink ? '<span class="or">or</span>' : '') + rmLink + '</div>' : '') + '</td>' +
        '<td><span class="chip ' + chip[0] + '">' + chip[1] + '</span><span class="rown">Row ' + (r.i + 1) + '</span></td>' + RM(r) + '</tr>';
    }
    if (r.kind === 'merged') {
      return '<tr class="k-merged"><td>' + esc(r.t) + '</td><td class="desc">' + esc(s ? s.desc : '') + '</td><td class="r">' + (price != null ? '$' + num(price, 2) : '') + '</td><td class="r"></td><td class="r muted">' + r.nw.toFixed(3) + '%</td><td></td>' +
        '<td><span class="chip info">Combined</span><span class="rown">Added to ' + esc(r.into) + ' above</span></td>' + RM(r) + '</tr>';
    }
    if (r.how === 'name') extra = '<span class="rown">Matched “' + esc(r.token) + '” by name</span>';
    else if (r.combined) extra = '<span class="rown">' + r.combined + ' rows combined</span>';
    else if (r.warn) extra = '<span class="rown warnt">' + esc(r.warn) + '</span>';
    else if (r.kind === 'cash') extra = '<span class="rown">Balances to 100%</span>';
    var chipHtml = r.kind === 'changed' ? '' : '<span class="chip ' + chip[0] + '">' + chip[1] + '</span>';
    if (r.how === 'name' && r.kind !== 'error') chipHtml = '<span class="chip name">By name</span>' + (r.kind === 'new' ? '<span class="chip new">New</span>' : '');
    return '<tr class="k-' + r.kind + (r.kind === 'cash' && g.cash < -EPS ? ' bad' : '') + '"><td class="tk">' + esc(r.t) + '</td><td class="desc" title="' + esc(s ? s.desc : '') + '">' + esc(r.t === CASH ? 'USD Cash' : s ? s.desc : '') + '</td>' +
      '<td class="r">' + (price != null ? '$' + num(price, 2) : '') + '</td><td class="r">' + r.cur.toFixed(3) + '%</td><td class="r b' + (r.kind === 'cash' && g.cash < -EPS ? ' neg' : '') + '">' + r.nw.toFixed(3) + '%</td><td class="r">' + chg(r.cur, r.nw) + '</td>' +
      '<td>' + chipHtml + extra + '</td>' + RM(r) + '</tr>';
  }
  function RM(r) { return '<td class="rmc">' + (r.i != null ? '<button class="imp-rm" data-imp="drop" data-row="' + r.i + '" data-tok="' + esc(r.token || r.t || '') + '" data-tip="Remove this row from the import" data-tip-anchor aria-label="Remove row">' + I2.x + '</button>' : '') + '</td>'; }
  function visible(r) {
    var f = ST.filter;
    if (f === 'all') return true;
    if (f === 'error') return r.kind === 'error' || r.kind === 'skipped';
    if (f === 'changed') return r.kind === 'changed' || r.kind === 'cash';
    return r.kind === f;
  }
  function renderEmpty() {
    var m = ST.m;
    return '<div class="imp-drop" id="imp-drop">' +
      '<div class="imp-drop-in">' + '<span class="imp-clip">' + I2.clip + '</span>' +
      '<div class="imp-big">Paste from Excel</div>' +
      '<div class="imp-keys"><kbd>Ctrl</kbd> + <kbd>V</kbd> anywhere in this panel</div>' +
      '<div class="imp-or">or drop an .xlsx / .csv file here &middot; <button data-imp="browse">browse files</button> &middot; <button data-imp="type">type it in</button></div>' +
      '</div>' +
      '<textarea id="imp-text" class="imp-text" spellcheck="false" placeholder="' + (ST.bulk ? 'N529\tAAPL\t5%\nN524\tMSFT\t3.25%' : 'AAPL 5%\nMSFT 3.25\nApple 4') + '" aria-label="Paste or type model rows"' + (ST.editing ? '' : ' hidden') + '>' + esc(ST.text) + '</textarea>' +
      '</div>' +
      '<div class="imp-needs"><div class="imp-sec-h">Columns needed</div><div class="imp-chips">' +
        (ST.bulk ? '<span class="need req">Access <em>required</em></span>' : '') +
        '<span class="need req">Security or CUSIP <em>required</em></span><span class="need req">Weight <em>required</em></span>' +
        '<span class="need">TradeType</span><span class="need">DoNotBuy</span><span class="need">DoNotSell</span><span class="need">Notes</span></div>' +
        '<p>Headers are optional. Tickers, CUSIPs, CINS, SEDOLs and company names are recognized. Weights can be <b>10%</b>, <b>10</b> or <b>0.10</b>. Shares or market value also work; they are converted to weights at EOD prices.</p></div>' +
      '<div class="imp-tip"><div><b>No files needed.</b> ' + (ST.bulk ? 'Copy every model, edit in Excel, then paste the sheet back here to update them all at once.' : 'Copy this model, edit it in Excel, then paste it back here.') + '</div>' +
        '<button class="btn imp-copy" data-imp="copy">' + I2.copy + (ST.bulk ? 'Copy All Models' : 'Copy Current Model') + '</button></div>' +
      (m ? '' : '<div class="imp-hint">Updating a single model? Open it and paste there.</div>');
  }
  function renderData(res) {
    var src = ST.source, rowsN = (ST.header ? ST.grid.length - 1 : ST.grid.length), cols = ST.grid[0].length;
    var sheetSel = src.kind === 'file' && ST.file && ST.file.name === src.label && ST.file.sheets.length > 1
      ? ' &middot; Sheet <select class="imp-sheet" data-imp-sheet>' + ST.file.sheets.map(function (sh, i) { return '<option value="' + i + '"' + (sh.name === src.sheet ? ' selected' : '') + '>' + esc(sh.name) + '</option>'; }).join('') + '</select>' : '';
    var h = '<div class="imp-src"><span>' + esc(src.label) + sheetSel + ' &middot; ' + rowsN + ' row' + (rowsN === 1 ? '' : 's') + ' &times; ' + cols + ' column' + (cols === 1 ? '' : 's') + (ST.header ? ' &middot; header row detected' : '') + '</span>' +
      '<span class="imp-src-a">' + (src.kind !== 'file' ? '<button data-imp="edit">Edit text</button>' : '') + '<button data-imp="reset">Clear &amp; start over</button></span></div>';
    if (ST.editing) h += '<textarea id="imp-text" class="imp-text inline" spellcheck="false">' + esc(ST.text) + '</textarea>';
    // column mapping
    var sampleRows = (ST.header ? ST.grid.slice(1) : ST.grid).slice(0, 3);
    h += '<div class="imp-map"><div class="imp-sec-h">Column mapping <span>Detected automatically. Change any column if needed.</span></div><div class="imp-cols">' +
      ST.grid[0].map(function (hd, j) {
        var role = ST.roles[j], samp = sampleRows.map(function (r) { return r[j]; }).filter(function (v) { return String(v) !== ''; }).slice(0, 3).join(', ');
        return '<label class="imp-col' + (role === 'ignore' ? ' off' : '') + '"><span class="imp-col-h">' + esc(ST.header ? String(hd) || 'Column ' + (j + 1) : 'Column ' + String.fromCharCode(65 + j)) + '</span>' +
          '<span class="imp-col-s" title="' + esc(samp) + '">' + esc(samp || '—') + '</span>' +
          '<select data-imp-role="' + j + '">' + ROLES.filter(function (r) { return ST.bulk || r[0] !== 'access'; }).map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === role ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div>';
    var need = [['Security / CUSIP', ST.roles.indexOf('id') > -1 || ST.roles.indexOf('id2') > -1], ['Weight', ST.roles.indexOf('weight') > -1 || ST.roles.indexOf('shares') > -1 || ST.roles.indexOf('mv') > -1]];
    if (ST.bulk) need.unshift(['Access', ST.roles.indexOf('access') > -1]);
    h += '<div class="imp-needrow">' + need.map(function (n) { return '<span class="nd ' + (n[1] ? 'ok' : 'no') + '">' + (n[1] ? I2.check : I2.x) + esc(n[0]) + '</span>'; }).join('') + '</div></div>';
    if (res.missing.length) {
      h += '<div class="imp-alert">' + C.I.errBang + '<span>Choose a column for <b>' + res.missing.join('</b> and <b>') + '</b> to see the preview.' + (ST.bulk && res.missing.indexOf('Access (model)') > -1 ? ' Bulk import needs an Access column so each row knows its model.' : '') + '</span></div>';
      return h;
    }
    var G = res.groups, all = [];
    G.forEach(function (g) { all = all.concat(g.rows); });
    // mode
    var g0 = G[0] || {}, autoTxt;
    var rep = ST.replace == null ? (ST.bulk ? null : g0.replace) : ST.replace;
    if (!ST.bulk) {
      var cv = g0.coverage || { covered: 0, of: 0, pasted: 0 };
      autoTxt = ST.replace == null ? '<span class="sugg-tag">Suggested</span>' : '';
      var expl = g0.replace ? 'Your paste covers ' + cv.covered + ' of ' + cv.of + ' current holdings. Securities not in your paste go to 0.000%' + (g0.counts && g0.counts.removed ? ' (' + g0.counts.removed + ' removed)' : '') + '.' :
        'Only the ' + cv.pasted + ' securit' + (cv.pasted === 1 ? 'y' : 'ies') + ' you pasted change. Everything else keeps its current weight.';
      h += '<div class="imp-mode"><div class="seg" role="radiogroup"><button role="radio" aria-checked="' + !!rep + '" class="' + (rep ? 'on' : '') + '" data-imp="mode" data-v="1">Replace model</button><button role="radio" aria-checked="' + !rep + '" class="' + (!rep ? 'on' : '') + '" data-imp="mode" data-v="0">Update listed only</button></div>' + autoTxt + '<span class="imp-mode-x">' + expl + '</span></div>';
    } else {
      h += '<div class="imp-mode"><div class="seg"><button class="' + (ST.replace == null ? 'on' : '') + '" data-imp="mode" data-v="">Auto per model</button><button class="' + (ST.replace === true ? 'on' : '') + '" data-imp="mode" data-v="1">Replace</button><button class="' + (ST.replace === false ? 'on' : '') + '" data-imp="mode" data-v="0">Update listed only</button></div><span class="imp-mode-x">' +
        (ST.replace == null ? 'Each model is replaced when your sheet covers most of it, otherwise only listed securities change.' : ST.replace ? 'Securities not in your sheet go to 0.000% in each model.' : 'Only the securities in your sheet change.') + '</span></div>';
    }
    // summary + filters
    var cnt = { changed: 0, new: 0, removed: 0, error: 0 };
    all.forEach(function (r) { if (r.kind in cnt) cnt[r.kind]++; if (r.kind === 'skipped') cnt.error++; });
    var f = function (k, label, n, cls) { return '<button class="fchip ' + (cls || '') + (ST.filter === k ? ' on' : '') + '" data-imp="filter" data-v="' + k + '">' + label + ' <b>' + n + '</b></button>'; };
    h += '<div class="imp-sum"><div class="fchips">' + f('all', 'All', all.length) + f('changed', 'Changed', cnt.changed) + f('new', 'New', cnt.new, 'c-new') + f('removed', 'Removed', cnt.removed, 'c-rem') + (cnt.error ? f('error', 'Errors', cnt.error, 'c-err') : '') + '</div>';
    if (!ST.bulk && g0.m) h += '<div class="imp-tot">Total <b>100.000%</b><span class="sep"></span>USD Cash <b class="' + (g0.cash < -EPS ? 'neg' : '') + '">' + g0.cash.toFixed(3) + '%</b> <em>auto</em></div>';
    else h += '<div class="imp-tot">' + G.filter(function (g) { return g.ready; }).length + ' of ' + G.length + ' models ready</div>';
    h += '</div>';
    var errN = all.filter(function (r) { return r.kind === 'error'; }).length;
    var dropped = Object.keys(ST.drop);
    if (dropped.length) h += '<div class="imp-note">' + dropped.length + ' row' + (dropped.length === 1 ? '' : 's') + ' removed from this import: <b>' + dropped.map(function (k) { return esc(ST.drop[k]); }).join(', ') + '</b>. <button data-imp="undrop">Undo</button></div>';
    if (errN) h += '<div class="imp-alert">' + C.I.errBang + '<span><b>' + errN + ' row' + (errN === 1 ? ' needs' : 's need') + ' attention.</b> Fix the security, pick a suggestion, remove the row, or</span><button class="btn btn-text" data-imp="skip">Skip ' + (errN === 1 ? 'it' : 'them') + '</button></div>';
    else if (ST.skip && cnt.error) h += '<div class="imp-note">' + cnt.error + ' error row' + (cnt.error === 1 ? ' is' : 's are') + ' skipped. <button data-imp="unskip">Undo skip</button></div>';
    G.forEach(function (g) { g.notes.forEach(function (n) { if (!ST.bulk) h += '<div class="imp-note">' + esc(n) + '</div>'; }); });
    if (!ST.bulk && g0.problem) h += '<div class="imp-alert">' + C.I.errBang + '<span><b>' + esc(g0.problem) + '.</b> USD Cash cannot go below 0.000%.</span></div>';
    // table
    h += '<div class="imp-tbl" id="imp-tbl"><table class="grid imp-grid"><colgroup><col style="width:108px"><col><col style="width:92px"><col style="width:86px"><col style="width:86px"><col style="width:104px"><col style="width:190px"><col style="width:34px"></colgroup>' +
      '<thead><tr><th>Ticker</th><th>Description</th><th class="r">EOD Price</th><th class="r">Current</th><th class="r">New</th><th class="r">Change</th><th>Status</th><th></th></tr></thead>';
    G.forEach(function (g) {
      var rows = g.rows.filter(visible);
      if (ST.bulk) {
        var open = ST.open[g.key] != null ? ST.open[g.key] : (G.length <= 3 || (!!g.counts && g.counts.error > 0) || /^Over 100%/.test(g.problem || ''));
        var stat = g.problem ? '<span class="chip err">Skipped</span><span class="rown">' + esc(g.problem) + '</span>' :
          g.counts.error ? '<span class="chip err">Fix needed</span>' : g.ready ? '<span class="chip ok">Ready</span><span class="rown">' + g.changes + ' change' + (g.changes === 1 ? '' : 's') + ' &middot; ' + (g.replace ? 'Replace' : 'Update') + ' &middot; Cash ' + g.cash.toFixed(3) + '%</span>' : '<span class="chip muted">No changes</span>';
        h += '<tbody class="g' + (open ? ' open' : '') + '"><tr class="g-h" data-imp="group" data-v="' + esc(g.key) + '"><td colspan="6"><span class="gchev">' + I2.chev + '</span><b>' + esc(g.m ? g.m.access : g.key) + '</b>' + (g.m ? ' <span class="gname">' + esc(g.m.name) + '</span>' : '') + '</td><td colspan="2">' + stat + '</td></tr>';
        if (open) { h += rows.map(function (r) { return rowHtml(g, r); }).join(''); g.notes.forEach(function (n) { h += '<tr class="g-note"><td></td><td colspan="7">' + esc(n) + '</td></tr>'; }); }
        h += '</tbody>';
      } else h += '<tbody>' + (rows.length ? rows.map(function (r) { return rowHtml(g, r); }).join('') : '<tr class="empty-row"><td colspan="8">Nothing in this filter</td></tr>') + '</tbody>';
    });
    return h + '</table></div>';
  }
  function footer(res) {
    if (!ST.grid) return '<div class="imp-f-l">' + (ST.bulk ? 'Tip: press Ctrl+V on the Model List to open this panel with your data.' : 'Tip: press Ctrl+V anywhere on Model Details to open this panel with your data.') + '</div><div class="imp-f-r"><button class="btn btn-text" data-imp="close">Cancel</button></div>';
    var l = '', why = '', btns = '';
    if (res.missing.length) { why = 'Map the required columns first'; l = '<span class="st-warn">' + why + '</span>'; }
    if (!ST.bulk) {
      var g = res.groups[0];
      if (!why && g) {
        if (g.problem) why = g.problem;
        else if (g.counts.error) why = 'Fix, remove or skip ' + g.counts.error + ' error row' + (g.counts.error === 1 ? '' : 's') + ' to continue';
        else if (!g.ready) why = 'Nothing would change';
        l = why ? '<span class="st-warn">' + esc(why) + '</span>' : '<span class="st-ok">' + I2.check + 'Ready &middot; ' + g.changes + ' change' + (g.changes === 1 ? '' : 's') + ' will be applied to the grid. You still review and Submit.</span>';
      }
      btns = '<button class="btn btn-text" data-imp="close">Cancel</button><button class="btn btn-black' + (why ? ' is-disabled' : '') + '" data-imp="apply"' + (why ? ' data-tip="' + esc(why) + '" data-tip-anchor' : '') + '>Apply to Model</button>';
    } else {
      var ready = res.groups.filter(function (g) { return g.ready; }), skipped = res.groups.filter(function (g) { return g.problem; }).length;
      var errs = res.groups.reduce(function (a, g) { return a + (g.counts ? g.counts.error : 0); }, 0);
      if (!why) {
        if (errs) why = 'Fix, remove or skip ' + errs + ' error row' + (errs === 1 ? '' : 's') + ' first';
        else if (!ready.length) why = 'No models are ready to update';
      }
      l = why ? '<span class="st-warn">' + esc(why) + '</span>' : '<span class="st-ok">' + I2.check + ready.length + ' model' + (ready.length === 1 ? '' : 's') + ' ready' + (skipped ? ' &middot; ' + skipped + ' will be skipped' : '') + '</span>';
      var dis = why ? ' is-disabled" data-tip="' + esc(why) + '" data-tip-anchor' : '"';
      btns = '<button class="btn btn-text" data-imp="close">Cancel</button><button class="btn btn-tan' + dis + ' data-imp="drafts">Apply as Drafts</button><button class="btn btn-black' + dis + ' data-imp="submitall">Submit ' + (ready.length || '') + ' Model' + (ready.length === 1 ? '' : 's') + '</button>';
    }
    return '<div class="imp-f-l">' + l + '</div><div class="imp-f-r">' + btns + '</div>';
  }
  var lastRes = null;
  function render(keepScroll) {
    if (!ST) return;
    var tbl = document.getElementById('imp-tbl'), top = keepScroll && tbl ? tbl.scrollTop : 0;
    var focusRow = document.activeElement && document.activeElement.classList.contains('imp-fix') ? document.activeElement.getAttribute('data-row') : null;
    var res = ST.grid ? compute() : null;
    lastRes = res;
    var m = ST.m;
    root.querySelector('.imp-h-t').innerHTML = '<h2>' + (ST.bulk ? 'Bulk Import' : 'Import Model') + '</h2><div class="sub">' + (m ? esc(m.name) + ' <span>' + esc(m.access) + '</span>' : 'Update many models at once from one sheet') + '</div>';
    root.querySelector('.imp-body').innerHTML = ST.grid ? renderData(res) : renderEmpty();
    root.querySelector('.imp-f').innerHTML = footer(res);
    var t2 = document.getElementById('imp-tbl'); if (t2 && top) t2.scrollTop = top;
    if (focusRow != null) { var f = root.querySelector('.imp-fix[data-row="' + focusRow + '"]'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
    var ta = document.getElementById('imp-text');
    if (ta && ST.editing) { ta.focus(); }
  }

  /* ---------------- ingest ---------------- */
  function ingestGrid(grid, source, text) {
    grid = trimGrid(grid || []);
    if (!grid.length) { C.toast('Nothing to import. Copy rows from Excel and paste again.'); return; }
    var d = detect(grid, ST.bulk);
    ST.grid = grid; ST.header = d.header; ST.roles = d.roles; ST.source = source; ST.text = text || ''; ST.fix = {}; ST.drop = {}; ST.skip = false; ST.filter = 'all'; ST.replace = null; ST.open = {};
    ST.editing = false;
    render();
  }
  function ingestText(text, label) { ingestGrid(parseText(text), { kind: label === 'Typed' ? 'typed' : 'paste', label: label || 'Pasted from clipboard' }, text); }
  function usableRoles(roles) {
    var has = function (r) { return roles.indexOf(r) > -1; };
    return (has('id') || has('id2')) && (has('weight') || has('shares') || has('mv')) && (!ST.bulk || has('access'));
  }
  function ingestFile(f) {
    if (!f) return;
    var done = function (rows) { ingestGrid(rows, { kind: 'file', label: f.name }); };
    var fail = function (err) { C.toast('Could not read ' + f.name + ': ' + (err && err.message ? err.message : 'unsupported file')); };
    if (/\.(xlsx|xlsm)$/i.test(f.name)) f.arrayBuffer().then(window.MDPXlsx.readAll).then(function (sheets) {
      sheets = sheets.filter(function (sh) { return trimGrid(sh.rows).length; });
      if (!sheets.length) { C.toast(f.name + ' has no data'); return; }
      // pick the sheet you were looking at if it is importable, otherwise the first importable one
      var usable = function (sh) { var g = trimGrid(sh.rows), d = detect(g, ST.bulk); return usableRoles(d.roles); };
      var pick = sheets.filter(function (sh) { return sh.active && usable(sh); })[0] || sheets.filter(usable)[0] || sheets.filter(function (sh) { return sh.active; })[0] || sheets[0];
      ST.file = { name: f.name, sheets: sheets };
      ingestGrid(pick.rows, { kind: 'file', label: f.name, sheet: pick.name });
    }).catch(fail);
    else if (/\.(csv|tsv|txt)$/i.test(f.name)) f.text().then(function (t) { done(parseText(t)); }).catch(fail);
    else C.toast('Use an .xlsx or .csv file');
  }

  /* ---------------- build draft from preview ---------------- */
  function buildDraft(g) {
    var m = g.m, d = C.getDraft(m), changed = [];
    Object.keys(g.fin).forEach(function (t) {
      var row = C.rowOf(d, t), w = r3(g.fin[t]);
      if (!row) { if (w < EPS) return; row = C.newRow(t, 0); row.added = true; d.rows.push(row); }
      if (Math.abs((+row.nw || 0) - w) > EPS) changed.push(t);
      row.nw = w;
      var src = g.seen[t];
      if (src) {
        if (src.tt) row.tt = src.tt;
        if (src.dnb != null) row.dnb = src.dnb;
        if (src.dns != null) row.dns = src.dns;
        if (src.notes) row.notes = src.notes;
      }
    });
    C.rowOf(d, CASH).nw = g.cash;
    return changed;
  }

  /* ---------------- actions ---------------- */
  var undoState = null;
  function applySingle() {
    var g = lastRes && lastRes.groups[0];
    if (!g || !g.ready) return;
    var m = g.m, prevDraft = m.draft ? JSON.parse(JSON.stringify(m.draft)) : null;
    var changed = buildDraft(g);
    C.touch(m);
    var label = ST.source.label, n = g.changes;
    C.logEvent(m, { ts: C.nowStamp(), event: 'Model Imported', user: C.persona.user, details: label + ' · ' + (g.replace ? 'Replace model' : 'Update listed only') + ' · ' + n + ' change' + (n === 1 ? '' : 's') });
    var evSeq = m.events[m.events.length - 1].seq;
    C.save();
    close();
    if (C.onDetails()) {
      C.renderMdTable(m);
      changed.concat([CASH]).forEach(function (t) { var tr = document.querySelector('#md-table tr[data-row="' + (window.CSS && CSS.escape ? CSS.escape(t) : t) + '"]'); if (tr) tr.classList.add('imp-hl'); });
      var first = document.querySelector('#md-table tr.imp-hl:not([data-row="' + CASH + '"])'); if (first) first.scrollIntoView({ block: 'nearest' });
    }
    undoState = { access: m.access, draft: prevDraft, seq: evSeq };
    snackbar('Imported ' + n + ' change' + (n === 1 ? '' : 's') + ' into the grid. Review, then Submit.', function () {
      var mm = C.findModel(undoState.access);
      if (!mm) return;
      mm.events = mm.events.filter(function (e) { return e.seq !== undoState.seq; });
      if (undoState.draft && undoState.draft.live) mm.draft = undoState.draft; else C.discardDraft(mm);
      C.save(); C.route(); C.toast('Import undone', 'ok');
    });
  }
  function applyBulk(submit) {
    var ready = lastRes ? lastRes.groups.filter(function (g) { return g.ready; }) : [];
    if (!ready.length) return;
    var src = ST.source.label, total = 0, ts = null;
    ready.forEach(function (g) {
      buildDraft(g);
      if (submit) { var r = C.applySubmit(g.m, 'Bulk import · ' + src + ' · ' + (g.replace ? 'Replace model' : 'Update listed only')); ts = r.ts; total += r.changes.filter(function (c) { return c.ticker !== CASH; }).length; }
      else { C.touch(g.m); C.logEvent(g.m, { ts: C.nowStamp(), event: 'Model Imported', user: C.persona.user, details: 'Bulk import · ' + src + ' · draft' }); total += g.changes; }
    });
    var skipped = lastRes.groups.filter(function (g) { return g.problem; }).length;
    C.save(); close(); C.route();
    var n = ready.length;
    C.successCard({ name: n + ' model' + (n === 1 ? '' : 's') + ' · ' + ready.map(function (g) { return g.m.access; }).slice(0, 6).join(', ') + (n > 6 ? '…' : ''), access: '' },
      submit ? (n === 1 ? 'Model Approved' : n + ' Models Approved') : 'Drafts Ready',
      submit ? total + ' weight change' + (total === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' skipped' : '') : 'Set to In Progress. Open each to review and Submit', ts || C.nowStamp());
  }
  function copyText(text, msg) {
    var done = function () { C.toast(msg, 'ok'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { C.toast('Copy failed. Select the rows manually.'); }
      ta.remove();
    }
  }
  function copyModels() {
    var lines;
    if (ST.m) {
      var d = ST.m.draft && ST.m.draft.live ? ST.m.draft.rows.map(function (r) { return { t: r.ticker, w: +r.nw || 0, tt: r.tt, dnb: r.dnb, dns: r.dns, notes: r.notes }; }) : ST.m.holdings.map(function (h) { return { t: h.ticker, w: h.weight }; });
      lines = [['Security', 'CUSIP', 'Description', 'Price', 'Weight', 'TradeType', 'DoNotBuy', 'DoNotSell', 'Notes'].join('\t')].concat(d.map(function (r) {
        var s = SEC[r.t] || {}; return [r.t, r.t === CASH ? '' : s.id, r.t === CASH ? 'USD Cash' : s.desc, r.t === CASH ? '1.00' : (s.price || 0).toFixed(2), r.w.toFixed(3) + '%', r.tt && r.tt !== '-' ? r.tt : '', r.dnb ? 'Y' : '', r.dns ? 'Y' : '', r.notes || ''].join('\t');
      }));
      copyText(lines.join('\n'), 'Copied ' + (lines.length - 1) + ' rows. Paste into Excel, edit, then paste back here.');
    } else {
      var ms = C.models().filter(function (m) { return !C.lockedBy(m); });
      lines = [['Access', 'Strategy Name', 'Security', 'CUSIP', 'Description', 'Price', 'Weight'].join('\t')];
      ms.forEach(function (m) { m.holdings.forEach(function (h) { var s = SEC[h.ticker] || {}; lines.push([m.access, m.name, h.ticker, h.ticker === CASH ? '' : s.id, h.ticker === CASH ? 'USD Cash' : s.desc, h.ticker === CASH ? '1.00' : (s.price || 0).toFixed(2), h.weight.toFixed(3) + '%'].join('\t')); }); });
      copyText(lines.join('\n'), 'Copied ' + ms.length + ' models (' + (lines.length - 1) + ' rows). Paste into Excel, edit, then paste back here.');
    }
  }

  /* ---------------- snackbar with undo ---------------- */
  var snackTimer = null;
  function snackbar(msg, onUndo) {
    var el = document.getElementById('imp-snack');
    clearTimeout(snackTimer);
    el.innerHTML = '<span>' + esc(msg) + '</span><button data-imp-snack="undo">Undo</button><button class="x" data-imp-snack="x" aria-label="Dismiss">&times;</button>';
    el.hidden = false; el.classList.remove('out');
    el.onclick = function (e) {
      var b = e.target.closest('[data-imp-snack]'); if (!b) return;
      hideSnack(); if (b.getAttribute('data-imp-snack') === 'undo') onUndo();
    };
    snackTimer = setTimeout(hideSnack, 10000);
  }
  function hideSnack() { var el = document.getElementById('imp-snack'); clearTimeout(snackTimer); el.classList.add('out'); setTimeout(function () { el.hidden = true; }, 180); }

  /* ---------------- open / close ---------------- */
  function open(access, payload) {
    ST = fresh(access);
    if (access && !ST.m) { C.toast('Model ' + access + ' was not found'); return; }
    root.hidden = false;
    document.body.classList.add('imp-open');
    requestAnimationFrame(function () { root.classList.add('on'); });
    render();
    if (payload && payload.text != null) ingestText(payload.text);
    if (payload && payload.file) ingestFile(payload.file);
    var drop = document.getElementById('imp-drop'); if (drop) drop.focus();
  }
  function close() {
    if (!ST) return;
    ST = null; C.hideTip();
    root.classList.remove('on');
    document.body.classList.remove('imp-open');
    setTimeout(function () { if (!ST) root.hidden = true; }, 200);
  }
  function isOpen() { return !!ST; }

  /* ---------------- events ---------------- */
  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-imp]');
    if (!el || !ST) return;
    var a = el.getAttribute('data-imp'), v = el.getAttribute('data-v');
    switch (a) {
      case 'close': close(); break;
      case 'browse': document.getElementById('imp-file').click(); break;
      case 'type': ST.editing = true; render(); break;
      case 'edit': ST.editing = !ST.editing; render(true); break;
      case 'reset': ST.grid = null; ST.text = ''; ST.editing = false; render(); break;
      case 'copy': copyModels(); break;
      case 'mode': ST.replace = v === '' ? null : v === '1'; render(true); break;
      case 'filter': ST.filter = v; render(); break;
      case 'skip': ST.skip = true; render(true); break;
      case 'unskip': ST.skip = false; render(true); break;
      case 'drop': ST.drop[el.getAttribute('data-row')] = el.getAttribute('data-tok') || ('Row ' + (+el.getAttribute('data-row') + 1)); C.hideTip(); render(true); break;
      case 'undrop': ST.drop = {}; render(true); break;
      case 'group': ST.open[v] = !el.parentNode.classList.contains('open'); render(true); break;
      case 'sugg': ST.fix[el.getAttribute('data-row')] = el.getAttribute('data-t'); render(true); break;
      case 'apply': if (!el.classList.contains('is-disabled')) applySingle(); break;
      case 'drafts': if (!el.classList.contains('is-disabled')) applyBulk(false); break;
      case 'submitall': if (!el.classList.contains('is-disabled')) applyBulk(true); break;
    }
  });
  root.addEventListener('change', function (e) {
    if (!ST) return;
    if (e.target.hasAttribute('data-imp-sheet')) { var sh = ST.file.sheets[+e.target.value]; ingestGrid(sh.rows, { kind: 'file', label: ST.file.name, sheet: sh.name }); return; }
    var j = e.target.getAttribute('data-imp-role');
    if (j != null) {
      var role = e.target.value;
      ST.roles = ST.roles.map(function (r, i) { return i === +j ? role : (r === role && role !== 'ignore' ? 'ignore' : r); });
      render(true);
    } else if (e.target.classList.contains('imp-fix')) { ST.fix[e.target.getAttribute('data-row')] = e.target.value; render(true); }
  });
  root.addEventListener('keydown', function (e) {
    if (e.target.classList.contains('imp-fix') && e.key === 'Enter') { e.preventDefault(); ST.fix[e.target.getAttribute('data-row')] = e.target.value; render(true); }
  });
  var typeTimer = null;
  root.addEventListener('input', function (e) {
    if (e.target.id !== 'imp-text' || !ST) return;
    var text = e.target.value;
    clearTimeout(typeTimer);
    typeTimer = setTimeout(function () {
      if (!ST) return;
      var label = ST.source && ST.source.kind === 'paste' ? ST.source.label : 'Typed';
      ST.text = text;
      var g = trimGrid(parseText(text));
      if (!g.length) return;
      var keepRoles = ST.grid && ST.grid[0].length === g[0].length ? ST.roles : null, d = detect(g, ST.bulk);
      ST.grid = g; ST.header = d.header; ST.roles = keepRoles || d.roles; ST.source = { kind: label === 'Typed' ? 'typed' : 'paste', label: label };
      ST.editing = true; render(true);
    }, 300);
  });
  document.getElementById('imp-file').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f && ST) ingestFile(f); });

  function editable(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  /* Paste anywhere: inside the drawer, or on Model Details / Model List (opens the drawer). */
  /* Read what was pasted. Excel puts the cells on the clipboard as text AND as a picture;
     text always wins. HTML (some browsers / Excel Online) is the fallback; real files come last. */
  function htmlToTsv(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), rows = doc.querySelectorAll('tr');
    return Array.prototype.map.call(rows, function (tr) {
      return Array.prototype.map.call(tr.querySelectorAll('td,th'), function (c) { return c.textContent.replace(/\s+/g, ' ').trim(); }).join('\t');
    }).join('\n');
  }
  function clipPayload(cd) {
    if (!cd) return null;
    var text = cd.getData('text/plain') || '';
    if (!text.trim()) { var html = cd.getData('text/html'); if (html && /<tr/i.test(html)) text = htmlToTsv(html); }
    if (text.trim()) return { text: text };
    var files = Array.prototype.filter.call(cd.files || [], function (f) { return /\.(xlsx|xlsm|csv|tsv|txt)$/i.test(f.name); });
    if (files.length) return { file: files[0] };
    if (cd.files && cd.files.length) return { image: true };
    return null;
  }
  document.addEventListener('paste', function (e) {
    if (editable(e.target) || document.querySelector('#modal-root .modal')) return;
    var pl = clipPayload(e.clipboardData);
    if (!pl) return;
    var where = ST ? 'drawer' : (C.currentModel() && C.onDetails()) ? 'details' : document.getElementById('ml-table') ? 'list' : null;
    if (!where) return;
    e.preventDefault();
    if (pl.image) { C.toast('That paste was only a picture. In Excel, select the cells, press Ctrl+C, then paste here.'); return; }
    if (ST) { if (pl.file) ingestFile(pl.file); else ingestText(pl.text); return; }
    open(where === 'details' ? C.currentModel().access : null, pl);
  });
  /* Drag a file anywhere */
  var dz = document.getElementById('imp-dropzone'), dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
  function canDrop() { return ST || C.onDetails() || document.getElementById('ml-table'); }
  document.addEventListener('dragenter', function (e) { if (!hasFiles(e) || !canDrop()) return; dragDepth++; dz.hidden = false; dz.querySelector('b').textContent = ST ? 'Drop to import' : C.onDetails() ? 'Drop to import into this model' : 'Drop to bulk import'; });
  document.addEventListener('dragover', function (e) { if (hasFiles(e) && canDrop()) e.preventDefault(); });
  document.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dz.hidden = true; });
  document.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; dz.hidden = true;
    if (!canDrop()) return;
    var f = e.dataTransfer.files[0];
    if (ST) ingestFile(f);
    else { var m = C.currentModel(); open(m && C.onDetails() ? m.access : null, { file: f }); }
  });
  document.addEventListener('keydown', function (e) {
    if (!ST) return;
    if (e.key === 'Escape') { if (document.querySelector('#modal-root .modal')) return; e.stopPropagation(); close(); return; }
    var primary = root.querySelector('[data-imp="apply"],[data-imp="submitall"]');
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && primary) { e.preventDefault(); primary.click(); return; }
    if (e.key === 'Enter' && !editable(e.target) && primary && !e.target.closest('button')) { e.preventDefault(); primary.click(); }
  }, true);
  window.addEventListener('hashchange', function () { if (ST) close(); });

  window.MDPImport = { open: open, close: close, isOpen: isOpen };
})();
