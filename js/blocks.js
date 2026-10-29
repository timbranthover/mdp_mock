/* Model Delivery Portal — Building Blocks (UBS CIO view)
 *
 * A Building Block is a UBS-constructed parent strategy whose components are existing
 * third-party SMA models ("underlying strategies"). UBS owns the allocation across them;
 * each manager keeps maintaining their own model and never sees the block.
 *
 *   Composition tab           edit which underlying strategies and their allocation (must total 100%)
 *   Consolidated Holdings tab the look-through model = SUM(allocation x security weight), with drill-down
 *   Underlying model approved recalculates every block that uses it and auto-publishes, with notification
 *   Status flows up           an underlying model that is Rejected / Needs Attention flags the block
 *
 * One level only: a block cannot contain another block.
 * Loaded before app.js; app.js calls MDPBlocksInit(ctx) once its helpers exist.
 */
(function () {
  'use strict';
  window.MDPBlocksInit = function (C) {
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var esc = C.esc, num = C.num, r3 = C.round3, fmt = C.fmt, I = C.I, CASH = C.CASH, EPS = C.EPS, SEC = C.SEC;
    var STALE_DAYS = 14;
    /* distinct, muted, colour-blind-aware (Okabe-Ito family, softened); no greys so sleeves never read as UI chrome */
    var PALETTE = ['#2f6f9f', '#d9962b', '#3f9a78', '#b5679b', '#7fb3d5', '#c8603c', '#8a7bb8', '#9aa83a'];
    var SUBS = [['details', 'Composition'], ['holdings', 'Consolidated Holdings'], ['options', 'Model Options'], ['snapshot', 'Model Snapshot']];
    var confirmedHere = null, openSec = {};

    function blocks() { return C.S.models.filter(function (m) { return m.block; }); }
    function model(a) { return C.byAccess[a]; }
    function sleevesOf(b, draft) {
      if (draft && b.bdraft && b.bdraft.live) return b.bdraft.rows.map(function (r) { return { access: r.access, alloc: +r.na || 0 }; });
      return b.sleeves;
    }
    function calc(b, draft) { return C.SEED.consolidate(sleevesOf(b, draft), C.byAccess); }
    function colorOf(b, access) { var i = b.sleeves.map(function (s) { return s.access; }).indexOf(access); if (i < 0 && b.bdraft) i = b.bdraft.rows.map(function (r) { return r.access; }).indexOf(access); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; }
    function daysSince(stamp) { var d = new Date(stamp.slice(0, 10) + 'T12:00:00'), t = new Date(C.todayISO() + 'T12:00:00'); return Math.round((t - d) / 864e5); }
    function sleeveIssue(m) {
      if (!m) return { level: 'err', text: 'Model not found' };
      if (m.block) return { level: 'err', text: 'A Building Block cannot contain another Building Block' };
      if (m.status === 'Rejected') return { level: 'err', text: 'Underlying model is Rejected' };
      if (m.status === 'Needs Attention') return { level: 'err', text: 'Underlying model needs attention' };
      if (m.status === 'New') return { level: 'err', text: 'No approved model yet' };
      if (m.status === 'In Progress') return { level: 'info', text: 'Being edited by ' + C.displayName(m.modifiedUser) + '. The block keeps using the last approved model.' };
      var d = daysSince(m.modified);
      if (d > STALE_DAYS) return { level: 'warn', text: 'Stale: last model update ' + d + ' days ago' };
      return null;
    }

    /* ---------------- status flows up ---------------- */
    function refreshStatuses() {
      blocks().forEach(function (b) {
        if (b.status === 'In Progress') return;
        var bad = b.sleeves.some(function (s) { var i = sleeveIssue(model(s.access)); return i && i.level === 'err'; });
        if (bad) b.status = 'Needs Attention';
        else if (b.status === 'Needs Attention') b.status = 'Approved';
      });
    }
    function reason(b) {
      var st = b.bdraft && b.bdraft.live && b.bdraft.prev ? b.bdraft.prev.status : b.status;
      if (st !== 'Needs Attention') return null;
      var probs = b.sleeves.map(function (s) { var m = model(s.access), i = sleeveIssue(m); return i && i.level === 'err' ? { s: s, m: m, i: i } : null; }).filter(Boolean);
      if (!probs.length) return null;
      var p = probs[0], m = p.m, detail = '';
      if (m && m.status === 'Needs Attention') {
        var e = C.eventsDesc(m).filter(function (x) { return x.event === 'Mandatory Corp Action'; })[0];
        if (e && e.note) detail = ' ' + e.note.replace(/ Review the position and resubmit the model\.?$/, '');
      } else if (m && m.status === 'Rejected') {
        var r = C.eventsDesc(m).filter(function (x) { return x.event === 'Model Rejected'; })[0];
        if (r) detail = ' ' + r.details.replace(/^Rejected for the following reason\(s\):\s*/i, '').trim();
      }
      return { kind: 'attn', title: 'Needs Attention', sleeve: p.s.access,
        text: 'Underlying strategy ' + p.s.access + (m ? ' (' + m.name + ')' : '') + ': ' + p.i.text.toLowerCase().replace(/^underlying model /, '') + '.' + detail + (probs.length > 1 ? ' ' + (probs.length - 1) + ' more underlying strateg' + (probs.length > 2 ? 'ies' : 'y') + ' affected.' : '') + ' The manager must resolve it, or adjust the allocation.' };
    }
    /* Shown on an underlying model's page (UBS view only; managers never see the wrapper). */
    function memberHtml(m) {
      if (m.block || !C.isAdmin()) return '';
      var uses = blocks().filter(function (b) { return b.sleeves.some(function (s) { return s.access === m.access; }); });
      if (!uses.length) return '';
      return '<div class="why why-blk">' + I.info + '<div class="why-t"><b>Used in ' + (uses.length === 1 ? 'a Building Block' : uses.length + ' Building Blocks') + '</b><span class="why-x">' +
        uses.map(function (b) { var s = b.sleeves.filter(function (x) { return x.access === m.access; })[0]; return '<a class="lnk" href="#/model/' + esc(b.access) + '/info/details">' + esc(b.name) + ' (' + esc(b.access) + ')</a> at ' + num(s.alloc, 3) + '%'; }).join(', ') +
        '. Approved changes to this model update ' + (uses.length === 1 ? 'the block' : 'those blocks') + ' automatically. <em>UBS view only: the manager does not see this.</em></span></div></div>';
    }

    /* ---------------- underlying model approved -> recalculate + auto-publish ---------------- */
    function onUnderlyingApproved(m, ts) {
      var hit = [];
      blocks().forEach(function (b) {
        if (!b.sleeves.some(function (s) { return s.access === m.access; })) return;
        var before = {}; b.holdings.forEach(function (h) { before[h.ticker] = h.weight; });
        var res = calc(b, false), after = {};
        res.holdings.forEach(function (h) { after[h.ticker] = h.weight; });
        var changes = [];
        Object.keys(Object.assign({}, before, after)).forEach(function (t) { var f = before[t] || 0, to = after[t] || 0; if (Math.abs(f - to) > EPS) changes.push({ ticker: t, from: f, to: to }); });
        b.holdings = res.holdings;
        if (b.status !== 'In Progress') { b.modified = ts; b.modifiedUser = 'System'; }
        b.snapshots[C.todayISO()] = b.holdings.map(function (h) { return { ticker: h.ticker, weight: h.weight }; });
        C.logEvent(b, { ts: ts, event: 'Underlying Model Updated', user: 'System', details: m.access + ' (' + m.name + ') updated by ' + m.modifiedUser + '. Consolidated model recalculated and auto-published (' + (function (n) { return n + ' security change' + (n === 1 ? '' : 's'); })(changes.filter(function (c) { return c.ticker !== CASH; }).length) + ').', changes: changes });
        hit.push(b);
      });
      refreshStatuses();
      return hit;
    }

    /* ---------------- composition (draft) ---------------- */
    function rowsOf(b) { return b.bdraft && b.bdraft.live ? b.bdraft.rows : b.sleeves.map(function (s) { return { access: s.access, alloc: s.alloc, na: s.alloc }; }); }
    function startDraft(b) {
      if (b.bdraft && b.bdraft.live) return b.bdraft;
      b.bdraft = { live: true, rows: b.sleeves.map(function (s) { return { access: s.access, alloc: s.alloc, na: s.alloc }; }), prev: { status: b.status, modified: b.modified, modifiedUser: b.modifiedUser } };
      b.status = 'In Progress'; b.modified = C.nowStamp(); b.modifiedUser = C.persona.user;
      C.refreshMeta(b); C.save();
      return b.bdraft;
    }
    function discard(b) {
      if (b.bdraft && b.bdraft.live && b.bdraft.prev) { b.status = b.bdraft.prev.status; b.modified = b.bdraft.prev.modified; b.modifiedUser = b.bdraft.prev.modifiedUser; }
      delete b.bdraft; C.save();
    }
    function total(rows) { return r3(rows.reduce(function (a, r) { return a + (isNaN(+r.na) ? 0 : +r.na); }, 0)); }
    function bad(v) { return v === '' || isNaN(+v) || +v < 0 || +v > 100; }
    function dirty(b) {
      if (!b.bdraft || !b.bdraft.live) return false;
      var cur = {}; b.sleeves.forEach(function (s) { cur[s.access] = s.alloc; });
      var rows = b.bdraft.rows;
      return rows.length !== b.sleeves.length || rows.some(function (r) { return !(r.access in cur) || Math.abs((+r.na || 0) - cur[r.access]) > EPS; });
    }
    function chg(r) {
      var v = r3((+r.na || 0) - (r.alloc || 0));
      if (v > EPS) return '<span class="pos">+' + v.toFixed(3) + '% <i class="arr">&#9650;</i></span>';
      if (v < -EPS) return '<span class="neg">' + v.toFixed(3) + '% <i class="arr">&#9660;</i></span>';
      return '<span>0.000%</span>';
    }
    var COMP_COLS = '<colgroup><col style="width:78px"><col><col style="width:190px"><col style="width:150px"><col style="width:150px"><col style="width:78px"><col style="width:96px"><col style="width:128px"><col style="width:104px"><col style="width:80px"></colgroup>';

    function renderComposition(b, c) {
      var opts = C.S.models.filter(function (m) { return !m.block && m.status !== 'New'; }).map(function (m) { return '<option value="' + esc(m.access) + '">' + esc(m.access + ' · ' + m.name + ' · ' + m.manager) + '</option>'; }).join('');
      c.innerHTML =
        '<div class="md-bar">' +
          '<div class="add-wrap"><span class="lbl">Add underlying strategy (Access code or strategy name)</span><div class="add-row"><input id="bb-add" list="bb-list" placeholder="Eg. N611 or Polen Focus Growth" autocomplete="off"><datalist id="bb-list">' + opts + '</datalist><button class="btn" data-blk="add">Add</button></div></div>' +
          '<div class="md-actions"><span class="mt">Model Type: Building Block</span><button data-blk="scale" id="bb-scale">' + I.refresh + 'Scale To 100%</button></div>' +
        '</div>' +
        '<div class="grid-scroll bb-scroll"><table class="grid bb-grid" id="bb-table"></table></div>' +
        '<div class="md-foot"><table class="grid bb-grid">' + COMP_COLS + '<tr><td colspan="6"></td><td class="r" colspan="2"><span id="bb-total"></span></td><td colspan="2"></td></tr></table></div>' +
        '<div class="md-buttons"><button class="btn btn-text" data-blk="clear">Clear</button><button class="btn btn-tan" id="bb-submit" data-blk="submit">Submit</button><button class="btn btn-black" id="bb-confirm" data-blk="confirm">Confirm</button></div>' +
        '<div class="bb-updates" id="bb-updates"></div>';
      drawComp(b);
      drawUpdates(b);
    }
    function drawComp(b) {
      var rows = rowsOf(b), head = '<thead><tr><th>Access</th><th>Strategy Name</th><th>Manager</th><th>Status</th><th>Last Model Update</th><th class="r">Holdings</th><th class="r">Allocation</th><th class="r">New Allocation</th><th class="r">Change</th><th></th></tr></thead>';
      var body = rows.map(function (r) {
        var m = model(r.access), iss = sleeveIssue(m), a = esc(r.access);
        var flag = iss ? '<div class="bb-flag ' + iss.level + '">' + esc(iss.text) + '</div>' : '';
        return '<tr data-row="' + a + '" class="' + (iss && iss.level === 'err' ? 'bb-bad' : '') + '">' +
          '<td class="b"><span class="bb-dot" style="background:' + colorOf(b, r.access) + '"></span><a class="lnk" href="#/model/' + a + '/info/details" data-tip="Open the underlying model" data-tip-anchor>' + a + '</a></td>' +
          '<td data-tip="' + esc(m ? m.name : '') + '" data-tip-trunc>' + esc(m ? m.name : 'Unknown') + flag + '</td>' +
          '<td data-tip="' + esc(m ? m.manager : '') + '" data-tip-trunc>' + esc(m ? m.manager : '') + '</td>' +
          '<td>' + (m ? C.statusHtml(m.status) : '') + '</td>' +
          '<td>' + (m ? fmt.listMod(m.modified) : '') + '</td>' +
          '<td class="r">' + (m ? m.holdings.length - 1 : '') + '</td>' +
          '<td class="r">' + (r.alloc || 0).toFixed(3) + '%</td>' +
          '<td class="r"><input class="nw bb-na' + (bad(r.na) ? ' bad' : '') + '" data-a="' + a + '" value="' + (isNaN(+r.na) ? esc(r.na) : (+r.na).toFixed(3)) + '" inputmode="decimal" autocomplete="off"></td>' +
          '<td class="r" data-chg>' + chg(r) + '</td>' +
          '<td class="c"><button class="del" data-blk="remove" data-a="' + a + '">Delete</button></td></tr>';
      }).join('');
      $('#bb-table').innerHTML = COMP_COLS + head + '<tbody>' + (body || '<tr class="empty-row"><td colspan="10">No underlying strategies. Add one above.</td></tr>') + '</tbody>';
      totals(b);
    }
    function totals(b) {
      var rows = rowsOf(b), t = total(rows), off = Math.abs(t - 100) > EPS, te = $('#bb-total');
      if (te) { te.textContent = 'Total: ' + t.toFixed(3) + '%'; te.className = off ? 'neg' : ''; }
      var sc = $('#bb-scale'); if (sc) sc.classList.toggle('is-off', !off || !t);
      var d = dirty(b), invalid = rows.some(function (r) { return bad(r.na); });
      var errs = rows.filter(function (r) { var i = sleeveIssue(model(r.access)); return +r.na > EPS && i && i.level === 'err'; });
      var why = invalid ? 'Each allocation must be a number between 0 and 100' :
        off ? 'Allocations must total 100.000% to submit. Current total: ' + t.toFixed(3) + '%' :
        !d ? 'No changes to submit' : '';
      C.setBtn($('#bb-submit'), why);
      C.setBtn($('#bb-confirm'), confirmedHere === b.access ? 'Building Block already confirmed at ' + fmt.conf(b.confirmed) + '.' : d ? 'Confirm is available only when there are no changes. Submit or clear your changes first.' : '');
      var sb = $('#bb-submit');
      if (sb && !why && errs.length) sb.setAttribute('data-warn', errs.map(function (r) { return r.access; }).join(', ')); else if (sb) sb.removeAttribute('data-warn');
    }
    function drawUpdates(b) {
      var ev = C.eventsDesc(b).filter(function (e) { return e.event === 'Underlying Model Updated'; }).slice(0, 5);
      $('#bb-updates').innerHTML = '<div class="bb-up-h">Underlying model updates <span>Recalculated and published automatically. Each update is logged in the audit trail.</span></div>' +
        (ev.length ? ev.map(function (e) { return '<div class="bb-up"><span class="bb-up-t">' + fmt.conf(e.ts) + '</span><span>' + esc(e.details) + '</span></div>'; }).join('') : '<div class="bb-up muted">No updates yet.</div>');
    }

    /* ---------------- consolidated holdings ----------------
     * Allocation strip (one card per underlying strategy, click to focus it), summary tiles,
     * filter chips, and a table where one bar shows both size (length, vs. the largest position)
     * and who contributes (coloured segments). Click a row for the per-strategy arithmetic.
     */
    var HV = { block: null, q: '', f: 'all', sleeve: null, sort: { key: 'weight', dir: -1 } };
    function pct(v) { return v.toFixed(3) + '%'; }
    /* Diversified funds/ETFs are exempt from the 5% single-security review. */
    function isFund(t) { var x = SEC[t]; return !!x && /^(ishares|vanguard|capgroup|other_etf|afunds|ucits)$/.test(x.group); }
    function overLimit(h) { return h.weight > 5 && !isFund(h.ticker); }
    function renderHoldings(b, c) {
      if (HV.block !== b.access) { HV = { block: b.access, q: '', f: 'all', sleeve: null, sort: { key: 'weight', dir: -1 } }; }
      var preview = b.bdraft && b.bdraft.live && dirty(b), res = calc(b, preview), H = res.holdings, contrib = res.contrib;
      var sl = sleevesOf(b, preview).filter(function (s) { return s.alloc > 0; });
      if (HV.sleeve && !sl.some(function (s) { return s.access === HV.sleeve; })) HV.sleeve = null;
      var non = H.filter(function (h) { return h.ticker !== CASH; }).sort(function (x, y) { return y.weight - x.weight; });
      var cash = (H[0] && H[0].ticker === CASH) ? H[0].weight : 0;
      var max = non.length ? non[0].weight : 1, rank = {}, cum = {}, run = 0;
      non.forEach(function (h, i) { rank[h.ticker] = i + 1; run += h.weight; cum[h.ticker] = run; });
      var parts = function (t) { return (contrib[t] || []).slice().sort(function (x, y) { return y.c - x.c; }); };
      var top10 = r3(non.slice(0, 10).reduce(function (a, h) { return a + h.weight; }, 0));
      var overlap = non.filter(function (h) { return (contrib[h.ticker] || []).length > 1; });
      var conc = non.filter(overLimit);
      var ovW = r3(overlap.reduce(function (a, h) { return a + h.weight; }, 0));
      var stat = {}; sl.forEach(function (s) { stat[s.access] = { n: 0, uniq: 0 }; });
      non.forEach(function (h) { var ps = contrib[h.ticker] || []; ps.forEach(function (p) { if (stat[p.access]) { stat[p.access].n++; if (ps.length === 1) stat[p.access].uniq++; } }); });

      var tile = function (k, v, sub, cls) { return '<div class="bb-tile' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + (sub || '&nbsp;') + '</span></div>'; };
      var strip = '<div class="bb-alloc"><div class="bb-alloc-h"><span class="k">Allocation</span><span class="bb-hint">Select a strategy to see only what it contributes</span></div>' +
        '<div class="bb-cards" style="grid-template-columns:' + sl.map(function (s) { return 'minmax(150px,' + s.alloc + 'fr)'; }).join(' ') + '">' + sl.map(function (s) {
          var m = model(s.access), st = stat[s.access];
          return '<button class="bb-card" data-blk="hsl" data-v="' + esc(s.access) + '" style="--c:' + colorOf(b, s.access) + '">' +
            '<span class="bb-card-t"><b>' + esc(s.access) + '</b><span>' + pct(s.alloc) + '</span></span>' +
            '<span class="bb-card-n" title="' + esc(m ? m.name : '') + '">' + esc(m ? m.name : '') + '</span>' +
            '<span class="bb-card-m">' + st.n + ' securities &middot; ' + st.uniq + ' only here</span></button>';
        }).join('') + '</div></div>';
      c.innerHTML = (preview ? '<div class="bb-prev">' + I.info + '<span><b>Preview.</b> Showing your unsubmitted allocation. Trading still uses the published model until you Submit.</span></div>' : '') +
        strip +
        '<div class="bb-tiles">' +
          tile('Securities', non.length, 'across ' + sl.length + ' strategies') +
          tile('Largest Position', non[0] ? esc(non[0].ticker) + ' <small>' + pct(non[0].weight) + '</small>' : '-', conc.length ? I.attn + ' ' + conc.length + ' stock' + (conc.length === 1 ? '' : 's') + ' above 5% review level' : 'No single stock above 5%', conc.length ? 'attn' : '') +
          tile('Top 10 Weight', pct(top10), 'of the model') +
          tile('Held By 2+ Strategies', overlap.length, pct(ovW) + ' of the model') +
          tile('USD Cash', pct(cash), 'from underlying models') +
        '</div>' +
        '<div class="bb-hbar"><div class="fchips" id="bb-chips"></div><label class="search-box">' + I.search + '<input id="bb-q" placeholder="Search securities" value="' + esc(HV.q) + '" autocomplete="off"></label></div>' +
        '<div class="grid-scroll bb-hscroll"><table class="grid bb-hgrid" id="bb-htable"></table></div>' +
        '<div class="bb-hfoot" id="bb-hfoot"></div>';

      var COLS = [['', 26], ['#', 40, 'r'], ['Ticker', 84, '', 'ticker'], ['Description', 0, '', 'desc'], ['Weight', 96, 'r', 'weight'], ['Size And Contribution By Strategy', '34%', '', null, 'Bar length is the weight vs. the largest position. Colours show how much each underlying strategy contributes.'], ['Held By', 132, '', 'held'], ['Cumulative', 96, 'r']];
      var draw = function () {
        var q = HV.q.trim().toLowerCase(), f = HV.f, sx = HV.sleeve;
        var list = non.filter(function (h) {
          var ps = contrib[h.ticker] || [], sd = SEC[h.ticker];
          if (q && (h.ticker + ' ' + (sd ? sd.desc : '')).toLowerCase().indexOf(q) < 0) return false;
          if (f === 'overlap' && ps.length < 2) return false;
          if (f === 'conc' && !overLimit(h)) return false;
          if (sx && !ps.some(function (p) { return p.access === sx; })) return false;
          return true;
        });
        var k = HV.sort.key, dir = HV.sort.dir;
        list.sort(function (x, y) {
          var a, z;
          if (k === 'ticker') { a = x.ticker; z = y.ticker; }
          else if (k === 'desc') { a = (SEC[x.ticker] || {}).desc || ''; z = (SEC[y.ticker] || {}).desc || ''; }
          else if (k === 'held') { a = (contrib[x.ticker] || []).length; z = (contrib[y.ticker] || []).length; if (a === z) { a = x.weight; z = y.weight; } }
          else { a = x.weight; z = y.weight; }
          return a < z ? -dir : a > z ? dir : 0;
        });
        var showCash = cash && !q && f === 'all' && !sx;
        var chip = function (v, label, n) { return '<button class="fchip' + (f === v ? ' on' : '') + '" data-blk="hf" data-v="' + v + '">' + label + ' <b>' + n + '</b></button>'; };
        $('#bb-chips').innerHTML = chip('all', 'All', non.length) + chip('overlap', 'Held By 2+', overlap.length) + chip('conc', 'Stocks Above 5%', conc.length) +
          (sx ? '<button class="fchip on bb-slchip" data-blk="hsl" data-v="' + esc(sx) + '" style="--c:' + colorOf(b, sx) + '"><i></i>' + esc(sx) + ' only <span aria-hidden="true">&times;</span></button>' : '');
        Array.prototype.forEach.call(document.querySelectorAll('.bb-card'), function (el) { var v = el.getAttribute('data-v'); el.classList.toggle('on', v === sx); el.classList.toggle('dim', !!sx && v !== sx); });

        var head = '<colgroup>' + COLS.map(function (cl) { return '<col' + (cl[1] ? ' style="width:' + (typeof cl[1] === 'number' ? cl[1] + 'px' : cl[1]) + '"' : '') + '>'; }).join('') + '</colgroup><thead><tr>' +
          COLS.map(function (cl) {
            var srt = cl[3] && k === cl[3] ? '<span class="sort">' + (dir > 0 ? '&#9650;' : '&#9660;') + '</span>' : '';
            return '<th class="' + (cl[2] || '') + (cl[3] ? '' : ' ns') + '"' + (cl[3] ? ' data-blk="hs" data-k="' + cl[3] + '"' : '') + '>' + cl[0] + (cl[4] ? '<span class="ii" data-tip="' + esc(cl[4]) + '" data-tip-anchor>' + I.info + '</span>' : '') + srt + '</th>';
          }).join('') + '</tr></thead>';
        var row = function (h, isCash) {
          var ps = parts(h.ticker), sd = SEC[h.ticker], open = openSec[b.access + h.ticker], big = !isCash && overLimit(h);
          var len = isCash ? Math.min(100, h.weight / max * 100) : h.weight / max * 100;
          var bar = '<div class="bb-sz"><div class="bb-sz-b" style="width:' + Math.max(len, 1.5) + '%">' + ps.map(function (p) {
            return '<i class="' + (sx && p.access !== sx ? 'dim' : '') + '" style="flex:' + p.c + ' 1 0;background:' + colorOf(b, p.access) + '" data-tip="' + esc(p.access) + ' contributes ' + pct(p.c) + ' (' + (h.weight ? (p.c / h.weight * 100).toFixed(0) : 0) + '%)" data-tip-anchor></i>';
          }).join('') + '</div></div>';
          var dots = '<span class="bb-dots">' + ps.map(function (p) { return '<i style="background:' + colorOf(b, p.access) + '" class="' + (sx && p.access !== sx ? 'dim' : '') + '"></i>'; }).join('') + '</span>' + (isCash ? '' : ps.length > 1 ? '<span class="bb-ov">' + ps.length + ' strategies</span>' : '<span class="bb-one">' + esc(ps[0] ? ps[0].access : '') + ' only</span>');
          var out = '<tr class="bb-sec' + (open ? ' open' : '') + (isCash ? ' bb-cash' : '') + '" data-blk="sec" data-t="' + esc(h.ticker) + '">' +
            '<td class="chevc">' + I.chev + '</td><td class="r bb-rk">' + (isCash ? '' : rank[h.ticker]) + '</td><td class="b">' + esc(h.ticker) + '</td>' +
            '<td data-tip="' + esc(isCash ? 'USD Cash' : sd ? sd.desc : '') + '" data-tip-trunc>' + esc(isCash ? 'Residual cash from the underlying models' : sd ? sd.desc : '') + '</td>' +
            '<td class="r bb-w' + (big ? ' big' : '') + '"' + (big ? ' data-tip="Above the 5% single-security review level" data-tip-anchor' : '') + '>' + (big ? '<span class="bb-wi">' + I.attn + '</span>' : '') + pct(h.weight) + '</td>' +
            '<td>' + bar + '</td><td>' + dots + '</td><td class="r bb-cum">' + (isCash ? '' : pct(cum[h.ticker])) + '</td></tr>';
          if (open) {
            out += '<tr class="bb-x"><td></td><td colspan="7"><div class="bb-math"><div class="bb-math-h"><span>How ' + esc(h.ticker) + ' gets to ' + pct(h.weight) + '</span><span>Weight in strategy &times; allocation = contribution</span></div>' +
              ps.map(function (p) {
                var m = model(p.access), share = h.weight ? p.c / h.weight * 100 : 0;
                return '<div class="bb-math-r' + (sx && p.access !== sx ? ' dim' : '') + '"><span class="bb-math-s"><i style="background:' + colorOf(b, p.access) + '"></i><b>' + esc(p.access) + '</b><span>' + esc(m ? m.name : '') + '</span></span>' +
                  '<span class="bb-math-e">' + pct(p.w) + ' <em>&times;</em> ' + num(p.alloc, 3) + '% <em>=</em> <b>' + pct(p.c) + '</b></span>' +
                  '<span class="bb-math-b"><i style="width:' + share + '%;background:' + colorOf(b, p.access) + '"></i></span><span class="bb-math-p">' + share.toFixed(1) + '%</span></div>';
              }).join('') +
              '<div class="bb-math-r tot"><span class="bb-math-s">Combined</span><span class="bb-math-e"><b>' + pct(h.weight) + '</b></span><span></span><span class="bb-math-p">100%</span></div></div></td></tr>';
          }
          return out;
        };
        var body = (showCash ? row({ ticker: CASH, weight: cash }, true) : '') + list.map(function (h) { return row(h, false); }).join('');
        $('#bb-htable').innerHTML = head + '<tbody>' + (body || '<tr class="empty-row"><td colspan="8">No securities match</td></tr>') + '</tbody>';
        var shown = r3(list.reduce(function (a, h) { return a + h.weight; }, 0));
        $('#bb-hfoot').innerHTML = '<span>Showing <b>' + list.length + '</b> of ' + non.length + ' securities &middot; <b>' + pct(shown) + '</b> of the model' + (sx ? ' (full weight of each security, not just ' + esc(sx) + '’s share)' : '') + '</span><span>Click a row to see the arithmetic</span>';
      };
      draw();
      $('#bb-q').addEventListener('input', function (e) { HV.q = e.target.value; draw(); });
      c._draw = draw;
    }

    /* ---------------- actions ---------------- */
    function addStrategy(b) {
      var inp = $('#bb-add'), raw = inp.value.trim();
      if (!raw) { C.toast('Enter an Access code or strategy name'); return; }
      var tok = raw.split(/\s+·\s+|\s+/)[0].toUpperCase(), m = model(tok);
      if (!m) {
        var q = raw.toLowerCase(), hits = C.S.models.filter(function (x) { return x.name.toLowerCase().indexOf(q) > -1; });
        if (hits.length === 1) m = hits[0];
        else { C.toast(hits.length ? 'More than one strategy matches "' + raw + '". Pick one from the list.' : 'Strategy not found: ' + raw); return; }
      }
      if (m.block) { C.toast('A Building Block cannot contain another Building Block'); return; }
      if (m.status === 'New') { C.toast(m.access + ' has no approved model yet'); return; }
      var d = startDraft(b);
      if (d.rows.some(function (r) { return r.access === m.access; })) { C.toast(m.access + ' is already in this Building Block'); return; }
      d.rows.push({ access: m.access, alloc: 0, na: 0 });
      inp.value = '';
      drawComp(b);
      var iss = sleeveIssue(m);
      C.toast('Added ' + m.access + ' ' + m.name + '. Set its allocation.' + (iss && iss.level !== 'info' ? ' Note: ' + iss.text + '.' : ''), iss && iss.level === 'err' ? undefined : 'ok');
      var el = $('.bb-na[data-a="' + m.access + '"]'); if (el) { el.focus(); el.select(); }
    }
    function scale(b) {
      var d = startDraft(b), t = total(d.rows);
      if (!t) { C.toast('Set at least one allocation first'); return; }
      d.rows.forEach(function (r) { r.na = r3((+r.na || 0) * 100 / t); });
      var diff = r3(100 - total(d.rows));
      if (Math.abs(diff) > EPS) { var big = d.rows.slice().sort(function (x, y) { return (+y.na) - (+x.na); })[0]; big.na = r3(+big.na + diff); }
      drawComp(b);
      C.toast('Allocations scaled proportionally to total 100.000%', 'ok');
    }
    function submit(b, force) {
      var d = b.bdraft, sbtn = $('#bb-submit');
      if (!d || (sbtn && sbtn.classList.contains('is-disabled'))) return;
      var zero = d.rows.filter(function (r) { return Math.abs(+r.na || 0) < EPS; });
      var warn = d.rows.filter(function (r) { var i = sleeveIssue(model(r.access)); return +r.na > EPS && i && i.level === 'err'; });
      if (!force && (zero.length || warn.length)) {
        var li = function (r, txt) { var m = model(r.access); return '<li><b>' + esc(r.access) + '</b><span>' + esc(m ? m.name : '') + '</span><em>' + esc(txt) + '</em></li>'; };
        C.modal({ cls: 'warnz', icon: '<span class="mh-ic">' + I.warn + '</span>', title: 'Review Before Submitting',
          body: (zero.length ? '<p>These underlying strategies are set to 0.000% and will be removed from the Building Block:</p><ul class="zero-list">' + zero.map(function (r) { return li(r, (r.alloc || 0).toFixed(3) + '% → 0.000%'); }).join('') + '</ul>' : '') +
            (warn.length ? '<p>These underlying strategies have an issue. The block will show Needs Attention until it is resolved:</p><ul class="zero-list">' + warn.map(function (r) { return li(r, sleeveIssue(model(r.access)).text); }).join('') + '</ul>' : ''),
          foot: '<button class="btn btn-text" data-act="close-modal">Go Back</button><button class="btn btn-tan" data-blk="submit-anyway" autofocus>Submit Anyway</button>' });
        return;
      }
      var ts = C.nowStamp(), cur = {}; b.sleeves.forEach(function (s) { cur[s.access] = s.alloc; });
      var changes = [];
      d.rows.forEach(function (r) { var f = cur[r.access] || 0, to = r3(+r.na || 0); if (Math.abs(f - to) > EPS) changes.push({ ticker: r.access, from: f, to: to }); delete cur[r.access]; });
      Object.keys(cur).forEach(function (a) { changes.push({ ticker: a, from: cur[a], to: 0 }); });
      b.sleeves = d.rows.filter(function (r) { return +r.na > EPS; }).map(function (r) { return { access: r.access, alloc: r3(+r.na) }; });
      b.holdings = calc(b, false).holdings;
      delete b.bdraft;
      b.status = 'Approved'; b.modified = ts; b.modifiedUser = C.persona.user;
      b.snapshots[C.todayISO()] = b.holdings.map(function (h) { return { ticker: h.ticker, weight: h.weight }; });
      C.logEvent(b, { ts: ts, event: C.isAdmin() ? 'Building Block Updated By Admin' : 'Building Block Updated', user: C.persona.user, details: changes.length + ' allocation change' + (changes.length === 1 ? '' : 's'), changes: changes });
      C.logEvent(b, { ts: ts, event: 'Building Block Approved', user: C.persona.user, details: 'Consolidated model recalculated and published (' + (b.holdings.length - 1) + ' securities)' });
      refreshStatuses(); C.save(); C.closeModal(); C.route();
      C.successCard(b, 'Building Block Approved', changes.length + ' allocation change' + (changes.length === 1 ? '' : 's') + ' · consolidated model published', ts);
    }
    function confirmBlock(b) {
      var cb = $('#bb-confirm'); if (cb && cb.classList.contains('is-disabled')) return;
      discard(b);
      var ts = C.nowStamp(); b.confirmed = ts; b.confirmedUser = C.persona.user;
      if (b.status === 'In Progress') b.status = 'Approved';
      C.logEvent(b, { ts: ts, event: 'Confirmed', user: C.persona.user, details: 'Building Block allocation confirmed' });
      refreshStatuses(); C.save(); C.route(); confirmedHere = b.access; totals(b);
      C.successCard(b, 'Building Block Confirmed', 'Current allocation confirmed', ts);
    }
    function exportBlock(b) {
      var res = calc(b, false), non = res.holdings.filter(function (h) { return h.ticker !== CASH; }).sort(function (x, y) { return y.weight - x.weight; });
      var hrows = non.map(function (h) { var s = SEC[h.ticker] || {}; return [h.ticker, h.weight, (res.contrib[h.ticker] || []).map(function (p) { return p.access + ' ' + p.c.toFixed(3) + '%'; }).join(' + '), s.id || '', s.desc || '', s.price || '']; });
      var crow = b.sleeves.map(function (s) { var m = model(s.access) || {}; return [s.access, s.alloc, m.name || '', m.manager || '', m.status || '', m.modified ? fmt.listMod(m.modified) : '']; });
      window.MDPXlsx.writeBook(b.access + '_BUILDING_BLOCK_' + C.todayISO() + '.xlsx', [
        { name: 'Consolidated Holdings', cols: [{ h: 'Security', w: 12, required: 1 }, { h: 'Weight %', w: 12, required: 1, fmt: 'weight' }, { h: 'Contribution By Strategy', w: 44 }, { h: 'CUSIP (reference)', w: 14, ref: 1 }, { h: 'Description (reference)', w: 34, ref: 1 }, { h: 'EOD Price (reference)', w: 14, ref: 1, fmt: 'price' }], rows: hrows },
        { name: 'Composition', cols: [{ h: 'Access', w: 10, required: 1 }, { h: 'Allocation %', w: 14, required: 1, fmt: 'weight' }, { h: 'Strategy Name', w: 44 }, { h: 'Manager', w: 30 }, { h: 'Status', w: 16 }, { h: 'Last Model Update', w: 24 }], rows: crow }
      ], { title: b.name });
    }

    /* ---------------- events ---------------- */
    function redraw() { var c = $('#d-content'); if (c && c._draw) c._draw(); }
    function cur() { var m = C.currentModel(); return m && m.block ? m : null; }
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-blk]'); if (!el) return;
      var b = cur(); if (!b) return;
      var a = el.getAttribute('data-blk');
      if (a === 'add') addStrategy(b);
      else if (a === 'scale') { if (!el.classList.contains('is-off')) scale(b); }
      else if (a === 'remove') { var d = startDraft(b), ra = el.getAttribute('data-a'), row = d.rows.filter(function (r) { return r.access === ra; })[0]; d.rows = d.rows.filter(function (r) { return r.access !== ra; }); drawComp(b); C.toast(ra + ' removed. ' + (row ? (+row.na || 0).toFixed(3) : '0.000') + '% needs to be reallocated (or use Scale To 100%).', 'ok'); }
      else if (a === 'clear') { discard(b); C.route(); }
      else if (a === 'submit') submit(b, false);
      else if (a === 'submit-anyway') submit(b, true);
      else if (a === 'confirm') confirmBlock(b);
      else if (a === 'hf') { HV.f = el.getAttribute('data-v'); redraw(); }
      else if (a === 'hsl') { var v = el.getAttribute('data-v'); HV.sleeve = HV.sleeve === v ? null : v; redraw(); }
      else if (a === 'hs') { var sk = el.getAttribute('data-k'); HV.sort = HV.sort.key === sk ? { key: sk, dir: -HV.sort.dir } : { key: sk, dir: sk === 'weight' || sk === 'held' ? -1 : 1 }; redraw(); }
      else if (a === 'sec') { var k = b.access + el.getAttribute('data-t'); openSec[k] = !openSec[k]; var c = $('#d-content'); if (c && c._draw) c._draw(); }
    });
    document.addEventListener('input', function (e) {
      if (!e.target.classList.contains('bb-na')) return;
      var b = cur(); if (!b) return;
      var d = startDraft(b), row = d.rows.filter(function (r) { return r.access === e.target.getAttribute('data-a'); })[0], v = e.target.value.trim();
      row.na = v === '' ? '' : (isNaN(+v) ? v : +v);
      e.target.classList.toggle('bad', bad(row.na));
      e.target.closest('tr').querySelector('[data-chg]').innerHTML = chg(row);
      totals(b);
    });
    document.addEventListener('change', function (e) { if (e.target.classList.contains('bb-na') && !bad(e.target.value)) e.target.value = (+e.target.value).toFixed(3); });
    document.addEventListener('keydown', function (e) {
      if (e.target.id === 'bb-add' && e.key === 'Enter') { var b = cur(); if (b) addStrategy(b); }
      if (e.target.classList && e.target.classList.contains('bb-na') && ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) > -1) {
        var all = Array.prototype.slice.call(document.querySelectorAll('.bb-na')), i = all.indexOf(e.target), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
        if (all[j]) { e.preventDefault(); all[j].focus(); all[j].select(); }
      }
    });
    document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('bb-na')) e.target.select(); });

    refreshStatuses();
    return {
      SUBS: SUBS, renderComposition: renderComposition, renderHoldings: renderHoldings, refreshStatuses: refreshStatuses,
      reason: reason, memberHtml: memberHtml, onUnderlyingApproved: onUnderlyingApproved, exportBlock: exportBlock,
      leave: function (access) { if (confirmedHere !== access) confirmedHere = null; },
      isEditing: function (b) { return !!(b.bdraft && b.bdraft.live); }
    };
  };
})();
