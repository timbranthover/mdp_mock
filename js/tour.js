/* Model Delivery Portal — walkthrough
 *
 * A docked, dark panel (deliberately unlike the app's own light UI, so it is never mistaken for a product screen)
 * that steps through what this twin adds to today's MDP. Each step navigates to a real screen, outlines the part to
 * look at, and states plainly what production does today and what is different here. Some steps offer one button
 * that performs the action for you (edit a weight, submit, load a file) using the same code path as a user would.
 *
 * Start: "Walkthrough" in the banner, or add ?tour=1 to the URL. Arrow keys move between steps. Esc closes.
 * Loaded after app.js (uses window.MDPCore).
 */
(function () {
  'use strict';
  var C = window.MDPCore;
  if (!C) return;
  var KEY = 'mdp-tour-step';
  var root = null, ring = null, idx = -1, target = null, retry = 0, userSide = null;
  function $(s) { return document.querySelector(s); }
  function hashNow() { return location.hash.split('?')[0] || '#/'; }

  /* ---- actions a step can offer ---- */
  function sampleEdit() {
    var inp = $('input.nw[data-t="META"]') || document.querySelectorAll('#md-table input.nw')[1];
    if (!inp) return;
    var cur = parseFloat(inp.value) || 0;
    inp.focus(); inp.value = (cur + 0.5).toFixed(3);
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
  }
  function hasDraft(acc) { var m = C.findModel(acc); return !!(m && m.draft && m.draft.live && C.diff(m, m.draft).dirty); }
  function submitSample() {
    var m = C.findModel('N611');
    if (m && hasDraft('N611')) C.doSubmit(m);
    location.hash = '#/model/N611/info/delivery';
  }
  function openSampleAccount() {
    var p = C.findModel('W204'); if (!p) return;
    var list = C.U.accountsOf(p), pick = list.filter(function (a) { return a.custom && a.restr; })[0] || list.filter(function (a) { return a.custom; })[0] || list[0];
    if (pick) C.U.openAccount('W204', pick.i);
  }

  var STEPS = [
    { ch: 'Start', title: 'What this walkthrough shows', go: '#/',
      text: 'The Model Delivery Portal today: managers enter model weights, UBS approves them, Vestmark trades them. This twin keeps all of that and adds what a UMA needs around it.',
      note: 'About 5 minutes. All data is mock. Each step opens a real screen you can use.' },

    { ch: 'Today', title: 'A model is a list of target weights', go: '#/model/N611/info/details', look: '#md-table',
      today: 'This is the screen as it works in production. A manager changes weights, the total must be 100%, and Submit publishes the model.',
      here: 'Nothing new yet. Every later step starts from this approval.' },

    { ch: 'After Submit', title: 'See what a change reaches before approving it', go: '#/model/N611/info/details', look: '#impact',
      today: 'Submit gives no indication of what the change affects.',
      here: 'As soon as a weight changes, a strip under the grid shows turnover, the accounts on the model, the portfolios that will be recalculated, and any conflict with another sleeve.',
      action: { label: 'Make a sample edit (META +0.5%)', run: sampleEdit, done: function () { return hasDraft('N611'); }, doneLabel: 'Sample edit made. Open "Show detail" in the strip.' } },

    { ch: 'After Submit', title: 'Every approval becomes a tracked delivery', go: '#/model/N611/info/delivery', look: '.dv-card',
      today: 'After "Model Approved", MDP shows nothing further. Whether accounts traded is only visible in Vestmark.',
      here: 'The Delivery tab follows each approval: sent to Vestmark, accounts traded, exceptions, reconciled. It updates while trading is in progress.',
      action: { label: 'Submit the sample edit and track it', run: submitSample, show: function () { return hasDraft('N611'); } } },

    { ch: 'After Submit', title: 'One place for every delivery', go: '#/delivery', look: '.db-tiles',
      today: 'There is no view across models of what was delivered, what is still trading, or what failed.',
      here: 'All deliveries, open exceptions, and the models that need action. A change to one underlying model appears once for each portfolio that uses it: filter on "From Underlying Models".' },

    { ch: 'Portfolios', title: 'A UBS building block is an ordinary model', go: '#/model/B303/info/details', look: '#d-why',
      today: 'Models are maintained by third-party managers and UBS AM.',
      here: 'UBS CIO maintains building blocks on the same screen with the same rules and audit trail. The notice lists the portfolios each block feeds.' },

    { ch: 'Portfolios', title: 'A portfolio is an allocation across blocks', go: '#/model/W204/info/details', look: '#bb-table',
      today: 'A model made of other models cannot be expressed in MDP.',
      here: 'The portfolio stores only block weights and each block\'s advisor range. Security weights are calculated. When a block is approved, every portfolio using it is recalculated and delivered.' },

    { ch: 'Portfolios', title: 'The combined model, traced to its blocks', go: '#/model/W204/info/holdings', look: '.bb-cards',
      today: 'Not available.',
      here: 'What accounts will hold and which block each weight comes from. Two checks run on it: single stocks above 5%, and securities one block reduced while another added within 30 days (filter "Cross-Sleeve Conflicts").' },

    { ch: 'Portfolios', title: 'Advisor limits, held in one place', go: '#/model/W204/info/guardrails', look: '#gd-feed',
      today: 'Allowed ranges and substitutions are not held in any system.',
      here: 'Minimum and maximum per block, and approved swaps. The proposal tool, enrollment and rebalancing would read this one record. Tighten a range to see how many customized accounts fall outside it.' },

    { ch: 'Accounts', title: 'One account, every sleeve', go: '#/model/W204/info/accounts', look: '.ac-cols', prep: openSampleAccount,
      today: 'No system shows an account sleeve by sleeve, so no one sees the whole account.',
      here: 'Each account\'s block weights against target and range, and every holding traced to the block it comes from. Account data would come from Vestmark.' },

    { ch: 'Accounts', title: 'Each manager\'s billable assets', go: '#/model/M102/info/fees', look: '.fee-grid',
      today: 'A portfolio that uses several managers has no billing breakdown.',
      here: 'Portfolio assets × allocation gives each manager\'s billable assets and fee, and a feed for billing. Rates shown are illustrative.' },

    { ch: 'Scale', title: 'Update many models from one file', go: '#/bulk', look: '#bk-body',
      today: 'Models are updated one at a time. The House View team maintains 84.',
      here: 'One workbook, one sheet per model. Every sheet is checked before anything is submitted. Problems are listed model by model and must be fixed or removed.',
      action: { label: 'Load the sample file', run: function () { window.MDPBulk.sample(); }, show: function () { var s = window.MDPBulk.state(); return !s; } } },

    { ch: 'Scale', title: 'What an external manager sees', go: '#/', look: '#ml-table',
      today: 'A manager sees only their own models.',
      here: 'Unchanged. Managers get the Delivery tab for their own models. Portfolios, accounts and fees are visible to UBS only.',
      link: { label: 'Open the Polen manager view in a new tab', href: '?persona=polen#/' } },

    { ch: 'Summary', title: 'Everything new, listed against today', go: '#/improvements',
      text: 'Each change in this twin is recorded here with production behavior beside it and a link to try it. The list exports to Excel.',
      note: 'End of walkthrough. Close this panel to keep exploring, or step back to any screen.' }
  ];

  /* ---- panel ---- */
  function build() {
    root = document.createElement('aside');
    root.id = 'tour'; root.className = 'tour'; root.setAttribute('aria-label', 'Walkthrough');
    document.body.appendChild(root);
    ring = document.createElement('div'); ring.className = 'tour-ring'; ring.hidden = true;
    document.body.appendChild(ring);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]'); if (!b) return;
      var a = b.getAttribute('data-tour');
      if (a === 'next') go(idx + 1); else if (a === 'back') go(idx - 1); else if (a === 'close') close();
      else if (a === 'jump') go(+b.getAttribute('data-i'));
      else if (a === 'act') { var s = STEPS[idx]; if (s.action) { s.action.run(); setTimeout(function () { paint(); locate(); }, 60); } }
      else if (a === 'side') { userSide = root.classList.contains('left') ? 'right' : 'left'; root.classList.toggle('left', userSide === 'left'); }
    });
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
  }
  function paint() {
    var s = STEPS[idx], n = STEPS.length, act = s.action, actHtml = '';
    if (act && (!act.show || act.show())) {
      var done = act.done && act.done();
      actHtml = done ? '<div class="tour-done">' + C.I.ok + '<span>' + C.esc(act.doneLabel || 'Done') + '</span></div>' : '<button class="tour-act" data-tour="act">' + C.I.play + C.esc(act.label) + '</button>';
    }
    root.innerHTML =
      '<div class="tour-h"><span class="tour-ch">' + C.esc(s.ch) + '</span><span class="tour-n">' + (idx + 1) + ' / ' + n + '</span>' +
        '<button class="tour-x" data-tour="side" data-tip="Move to the other side" data-tip-anchor aria-label="Move panel">&#8646;</button><button class="tour-x" data-tour="close" aria-label="Close walkthrough">&times;</button></div>' +
      '<div class="tour-bar">' + STEPS.map(function (x, i) { return '<button data-tour="jump" data-i="' + i + '" class="' + (i < idx ? 'past' : i === idx ? 'on' : '') + '" data-tip="' + C.esc((i + 1) + '. ' + x.title) + '" data-tip-anchor aria-label="Step ' + (i + 1) + '"></button>'; }).join('') + '</div>' +
      '<div class="tour-b"><h3>' + C.esc(s.title) + '</h3>' +
        (s.text ? '<p>' + C.esc(s.text) + '</p>' : '') +
        (s.today ? '<div class="tour-row"><span class="k">Today</span><p>' + C.esc(s.today) + '</p></div>' : '') +
        (s.here ? '<div class="tour-row here"><span class="k">In this twin</span><p>' + C.esc(s.here) + '</p></div>' : '') +
        (s.note ? '<p class="tour-note">' + C.esc(s.note) + '</p>' : '') +
        actHtml +
        (s.link ? '<a class="tour-link" href="' + C.esc(s.link.href) + '" target="_blank" rel="noopener">' + C.esc(s.link.label) + ' &#8599;</a>' : '') +
      '</div>' +
      '<div class="tour-f"><button class="tour-back" data-tour="back"' + (idx === 0 ? ' disabled' : '') + '>Back</button>' +
        (idx < n - 1 ? '<button class="tour-next" data-tour="next">Next' + (idx === 0 ? ': start' : '') + '</button>' : '<button class="tour-next" data-tour="close">Finish</button>') + '</div>';
  }
  function go(i) {
    if (i < 0 || i >= STEPS.length) return;
    if (!root) build();
    idx = i;
    try { sessionStorage.setItem(KEY, String(i)); } catch (e) { /* ignore */ }
    var s = STEPS[i];
    root.hidden = false; document.body.classList.add('tour-on');
    if (s.prep) s.prep();
    paint();
    if (hashNow() !== s.go || s.prep) {
      if (hashNow() === s.go) C.route(); else location.hash = s.go; // onRoute() re-locates after the screen renders
    }
    retry = 0; locate();
  }
  /* find the element to outline; screens render synchronously, a few retries cover async bits */
  function locate() {
    var s = STEPS[idx]; target = null;
    if (!s || !s.look) { ring.hidden = true; return; }
    var el = $(s.look);
    if (el && (el.offsetWidth || el.offsetHeight)) {
      target = el;
      var r = el.getBoundingClientRect(), pw = root.offsetWidth + 40, ph = root.offsetHeight + 40, vw = window.innerWidth, vh = window.innerHeight;
      // keep the panel off the thing it is pointing at: dock on the other side if the target sits on the right, otherwise scroll the target above the panel
      var side = userSide || (r.left > vw - pw && r.left > pw ? 'left' : 'right');
      root.classList.toggle('left', side === 'left');
      var overlapsX = side === 'left' ? r.left < pw : r.right > vw - pw;
      if (r.top < 60 || r.top > vh * 0.6 || (overlapsX && r.bottom > vh - ph)) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - (overlapsX && r.height < vh - ph - 140 ? Math.max(120, vh - ph - r.height - 20) : 140)), behavior: 'auto' });
      place();
    } else {
      ring.hidden = true;
      if (retry++ < 12) setTimeout(locate, 120);
    }
  }
  function place() {
    if (!ring || !target || idx < 0 || !document.body.contains(target)) { if (ring) ring.hidden = true; return; }
    var r = target.getBoundingClientRect();
    if (!r.width && !r.height) { ring.hidden = true; return; }
    ring.hidden = false;
    var top = Math.max(r.top, 0), h = Math.min(r.bottom, window.innerHeight) - top;
    if (h <= 0) { ring.hidden = true; return; }
    ring.style.cssText = 'left:' + (r.left - 5) + 'px;top:' + (top - 5) + 'px;width:' + (r.width + 10) + 'px;height:' + (h + 10) + 'px';
  }
  function close() {
    idx = -1; target = null;
    if (root) root.hidden = true; if (ring) ring.hidden = true;
    document.body.classList.remove('tour-on');
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  function start() {
    var saved = -1; try { saved = +sessionStorage.getItem(KEY); } catch (e) { saved = -1; }
    go(idx >= 0 ? idx : 0);
    void saved;
  }
  document.addEventListener('keydown', function (e) {
    if (idx < 0) return;
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key === 'Escape' && !document.querySelector('#modal-root .modal')) close();
    else if (!typing && e.key === 'ArrowRight') go(idx + 1);
    else if (!typing && e.key === 'ArrowLeft') go(idx - 1);
  });
  /* keep the action button state and the outline current as the user works on the screen */
  document.addEventListener('input', function () { if (idx >= 0 && STEPS[idx].action) setTimeout(function () { paint(); place(); }, 0); });

  window.MDPTour = {
    start: start, close: close, go: go,
    onRoute: function () { if (idx >= 0) { retry = 0; setTimeout(function () { paint(); locate(); }, 0); } },
    active: function () { return idx; }
  };
  /* resume after a reload, or start from the URL */
  var resume = null; try { resume = sessionStorage.getItem(KEY); } catch (e) { resume = null; }
  var wants = new URLSearchParams(location.search).get('tour');
  if (wants || resume != null) document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { go(resume != null ? Math.min(+resume || 0, STEPS.length - 1) : 0); }, 0); });
})();
