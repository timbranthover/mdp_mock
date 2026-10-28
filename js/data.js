/* Model Delivery Portal — digital twin
 * Mock seed data. Every strategy, account count, AUM figure, user and holding
 * here is invented for prototyping. Prices and identifiers are illustrative only.
 */
(function () {
  'use strict';

  /* ---------- deterministic random ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function fakeId(t, prefix) {
    var r = mulberry32(hashStr(t));
    var digits = '0123456789';
    var alnum = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var s = prefix || '';
    while (s.length < 6) s += (s.length < 3 ? digits : alnum)[Math.floor(r() * (s.length < 3 ? 10 : 34))];
    s += alnum[Math.floor(r() * 34)] + digits[Math.floor(r() * 10)] + digits[Math.floor(r() * 10)];
    return s;
  }

  /* ---------- security master ----------
   * [ticker, description, price, id (CUSIP / CINS), priceInfo flag]
   * id null => generated. UCITS use CINS-style ids.
   */
  var RAW = {
    growth: [
      ['ADYEY', 'ADYEN N V ADR', 10.53, '00783V104', 1],
      ['AMD', 'ADVANCED MICRO DEVICES', 516.79, '007903107', 1],
      ['AMZN', 'AMAZON.COM INC', 248.00, '023135106', 1],
      ['AON', 'AON PLC CL A', 315.64, 'G0403H108', 0],
      ['ASML', 'ASML HLDG NV SPON ADR', 1571.80, 'N07059210', 1],
      ['AVGO', 'BROADCOM INC', 321.68, '11135F101', 1],
      ['CSGP', 'COSTAR GROUP INC', 33.92, '22160N109', 1],
      ['GE', 'GE AEROSPACE', 297.73, '369604301', 0],
      ['GEV', 'GE VERNOVA LLC COM', 867.72, '36828A101', 0],
      ['GOOG', 'ALPHABET INC CL C', 317.28, '02079K107', 1],
      ['HESAY', 'HERMES INTL SCA ADR', 138.06, '42751Q105', 1],
      ['HWM', 'HOWMET AEROSPACE INC', 196.34, '443201108', 0],
      ['IDXX', 'IDEXX LABS', 560.38, '45168D104', 1],
      ['LLY', 'LILLY ELI & CO', 1290.00, '532457108', 0],
      ['LRLCY', 'LOREAL CO ADR FRANCE A', 97.64, '502117203', 1],
      ['MA', 'MASTERCARD INC CL A', 613.48, '57636Q104', 0],
      ['MELI', 'MERCADOLIBRE INC', 1810.15, '58733R102', 1],
      ['META', 'META PLATFORMS INC CL A', 642.62, '30303M102', 1],
      ['MSFT', 'MICROSOFT CORP', 528.40, '594918104', 0],
      ['NVDA', 'NVIDIA CORP', 192.15, '67066G104', 1],
      ['NFLX', 'NETFLIX INC', 1124.30, '64110L106', 0],
      ['ISRG', 'INTUITIVE SURGICAL INC', 545.10, '46120E602', 0],
      ['SPGI', 'S&P GLOBAL INC', 512.66, '78409V104', 0],
      ['TSM', 'TAIWAN SEMICONDUCTOR ADR', 301.22, '874039100', 1],
      ['V', 'VISA INC CL A', 348.91, '92826C839', 0],
      ['UBER', 'UBER TECHNOLOGIES INC', 98.44, '90353T100', 0],
      ['NOW', 'SERVICENOW INC', 942.18, '81762P102', 0],
      ['COST', 'COSTCO WHOLESALE CORP', 921.55, '22160K105', 0],
      ['ORLY', 'O REILLY AUTOMOTIVE INC', 104.20, '67103H107', 0],
      ['CDNS', 'CADENCE DESIGN SYSTEMS', 338.70, '127387108', 0],
      ['AAPL', 'APPLE INC', 262.80, '037833100', 0],
      ['ADBE', 'ADOBE INC', 352.10, '00724F101', 0],
      ['SHOP', 'SHOPIFY INC CL A', 162.40, '82509L107', 1],
      ['TT', 'TRANE TECHNOLOGIES PLC', 448.90, 'G8994E103', 0]
    ],
    restricted: [
      ['TSLA', 'TESLA INC', 412.30, '88160R101', 0],
      ['LULU', 'LULULEMON ATHLETICA INC', 182.75, '550021109', 0],
      ['PBIX', 'PATRIOT BALANCED INCOME FD CL I', 10.42, null, 0]
    ],
    value: [
      ['JPM', 'JPMORGAN CHASE & CO', 335.19, '46625H100', 0],
      ['JNJ', 'JOHNSON & JOHNSON', 191.20, '478160104', 0],
      ['PG', 'PROCTER & GAMBLE CO', 152.75, '742718109', 0],
      ['XOM', 'EXXON MOBIL CORP', 117.30, '30231G102', 0],
      ['CVX', 'CHEVRON CORP', 156.40, '166764100', 0],
      ['KO', 'COCA COLA CO', 69.88, '191216100', 0],
      ['PEP', 'PEPSICO INC', 148.60, '713448108', 0],
      ['MRK', 'MERCK & CO INC NEW', 86.45, '58933Y105', 0],
      ['ABBV', 'ABBVIE INC', 225.70, '00287Y109', 0],
      ['HD', 'HOME DEPOT INC', 392.15, '437076102', 0],
      ['MCD', 'MCDONALDS CORP', 301.40, '580135101', 0],
      ['UNH', 'UNITEDHEALTH GROUP INC', 362.80, '91324P102', 0],
      ['BRK/B', 'BERKSHIRE HATHAWAY INC CL B', 492.30, '084670702', 0],
      ['WMT', 'WALMART INC', 104.65, '931142103', 0],
      ['CSCO', 'CISCO SYSTEMS INC', 71.30, '17275R102', 0],
      ['VZ', 'VERIZON COMMUNICATIONS', 40.15, '92343V104', 0],
      ['LMT', 'LOCKHEED MARTIN CORP', 488.20, '539830109', 0],
      ['NEE', 'NEXTERA ENERGY INC', 82.40, '65339F101', 0],
      ['TXN', 'TEXAS INSTRUMENTS INC', 178.90, '882508104', 0],
      ['EA', 'ELECTRONIC ARTS', 204.84, '285512109', 0],
      ['HON', 'HONEYWELL INTL INC', 214.60, '438516106', 0]
    ],
    ishares: [
      ['AGG', 'ISHARES CORE US AGGREGATE BD ETF', 100.45, '464287226', 0],
      ['IUSB', 'ISHARES CORE TOTAL USD BOND MKT', 46.80, null, 0],
      ['MUB', 'ISHARES NATIONAL MUNI BOND ETF', 106.20, '464288414', 0],
      ['IVV', 'ISHARES CORE S&P 500 ETF', 688.40, '464287200', 0],
      ['IEFA', 'ISHARES CORE MSCI EAFE ETF', 86.30, '46432F842', 0],
      ['IEMG', 'ISHARES CORE MSCI EMERGING MKTS', 66.10, '46434G103', 0],
      ['TLT', 'ISHARES 20+ YR TREASURY BD ETF', 89.70, '464287432', 0],
      ['SHY', 'ISHARES 1-3 YR TREASURY BD ETF', 82.95, '464287457', 0],
      ['LQD', 'ISHARES IBOXX INV GRADE CORP BD', 110.80, '464287242', 0],
      ['TIP', 'ISHARES TIPS BOND ETF', 111.10, '464287176', 0],
      ['IJH', 'ISHARES CORE S&P MID-CAP ETF', 66.20, '464287507', 0],
      ['IJR', 'ISHARES CORE S&P SMALL-CAP ETF', 118.30, '464287804', 0],
      ['EFA', 'ISHARES MSCI EAFE ETF', 92.40, '464287465', 0]
    ],
    other_etf: [
      ['SPY', 'SPDR S&P 500 ETF TRUST', 682.10, '78462F103', 0],
      ['GLD', 'SPDR GOLD SHARES', 381.20, '78463V107', 1],
      ['QQQ', 'INVESCO QQQ TRUST SER 1', 612.40, '46090E103', 0],
      ['BIL', 'SPDR BLOOMBERG 1-3 MONTH T-BILL', 91.60, '78468R663', 0],
      ['MINT', 'PIMCO ENHANCED SHORT MATURITY ETF', 100.55, '72201R833', 0],
      ['BOND', 'PIMCO ACTIVE BOND ETF', 93.10, '72201R775', 0]
    ],
    vanguard: [
      ['VTI', 'VANGUARD TOTAL STOCK MARKET ETF', 334.20, '922908769', 0],
      ['VXUS', 'VANGUARD TOTAL INTL STOCK ETF', 74.60, '921909768', 0],
      ['BND', 'VANGUARD TOTAL BOND MARKET ETF', 74.40, '921937835', 0],
      ['BNDX', 'VANGUARD TOTAL INTL BOND ETF', 49.30, '92203J407', 0],
      ['VTEB', 'VANGUARD TAX-EXEMPT BOND ETF', 50.70, '922907746', 0],
      ['VO', 'VANGUARD MID-CAP ETF', 81.40, '922908629', 0],
      ['VB', 'VANGUARD SMALL-CAP ETF', 262.10, '922908751', 0],
      ['VEA', 'VANGUARD FTSE DEVELOPED MKTS ETF', 61.20, '921943858', 0],
      ['VWO', 'VANGUARD FTSE EMERGING MKTS ETF', 53.80, '922042858', 0],
      ['VGIT', 'VANGUARD INTERMEDIATE-TERM TREAS', 60.10, '92206C706', 0],
      ['VIG', 'VANGUARD DIVIDEND APPRECIATION ETF', 214.30, '921908844', 0]
    ],
    capgroup: [
      ['CGGR', 'CAPITAL GROUP GROWTH ETF', 44.20, null, 0],
      ['CGDV', 'CAPITAL GROUP DIVIDEND VALUE ETF', 41.30, null, 0],
      ['CGUS', 'CAPITAL GROUP CORE EQUITY ETF', 39.80, null, 0],
      ['CGGO', 'CAPITAL GROUP GLOBAL GROWTH EQ ETF', 36.40, null, 0],
      ['CGXU', 'CAPITAL GROUP INTL FOCUS EQ ETF', 29.10, null, 0],
      ['CGIE', 'CAPITAL GROUP INTL EQUITY ETF', 33.40, null, 0],
      ['CGBL', 'CAPITAL GROUP CORE BALANCED ETF', 34.60, null, 0],
      ['CGCP', 'CAPITAL GROUP CORE PLUS INCOME ETF', 22.90, null, 0],
      ['CGMU', 'CAPITAL GROUP MUNICIPAL INCOME ETF', 27.30, null, 0],
      ['CGSD', 'CAPITAL GROUP SHORT DURATION INC ETF', 25.70, null, 0],
      ['CGHM', 'CAPITAL GROUP MUNI HIGH-INCOME ETF', 25.10, null, 0]
    ],
    afunds: [
      ['RGAGX', 'GROWTH FD OF AMERICA CL R6', 82.10, null, 1],
      ['RWMGX', 'WASHINGTON MUTUAL INVS FD CL R6', 65.40, null, 1],
      ['RICGX', 'INVESTMENT CO OF AMERICA CL R6', 62.30, null, 1],
      ['RNPGX', 'NEW PERSPECTIVE FD CL R6', 69.80, null, 1],
      ['RERGX', 'EUROPACIFIC GROWTH FD CL R6', 61.20, null, 1],
      ['RCWGX', 'CAPITAL WORLD GR & INC FD CL R6', 71.50, null, 1],
      ['RIRGX', 'CAPITAL INCOME BUILDER CL R6', 74.20, null, 1],
      ['RLBGX', 'AMERICAN BALANCED FD CL R6', 37.60, null, 1],
      ['RBFGX', 'BOND FD OF AMERICA CL R6', 11.90, null, 1],
      ['RITGX', 'US GOVERNMENT SECURITIES FD CL R6', 12.10, null, 1],
      ['RMQGX', 'MULTI-SECTOR INCOME FD CL R6', 9.85, null, 1]
    ],
    ucits: [
      ['CSPX', 'ISHARES CORE S&P 500 UCITS ETF', 742.10, null, 1],
      ['IWDA', 'ISHARES CORE MSCI WORLD UCITS ETF', 118.40, null, 1],
      ['EIMI', 'ISHARES CORE MSCI EM IMI UCITS ETF', 41.20, null, 1],
      ['IMEU', 'ISHARES MSCI EUROPE UCITS ETF', 36.80, null, 0],
      ['IJPA', 'ISHARES MSCI JAPAN UCITS ETF', 62.40, null, 0],
      ['IUSA', 'ISHARES S&P 500 UCITS ETF DIST', 58.70, null, 0],
      ['IGLN', 'ISHARES PHYSICAL GOLD ETC', 72.10, null, 1],
      ['AGGG', 'ISHARES CORE GLB AGG BD UCITS ETF', 5.12, null, 0],
      ['IGLA', 'ISHARES GLB GOVT BD UCITS ETF', 4.88, null, 0],
      ['IBTM', 'ISHARES USD TREAS 7-10YR UCITS ETF', 182.30, null, 0],
      ['IEAC', 'ISHARES CORE EUR CORP BD UCITS ETF', 127.40, null, 0],
      ['IHYG', 'ISHARES EUR HIGH YIELD CORP UCITS', 98.20, null, 0]
    ]
  };

  var SECURITIES = {};   // ticker -> {ticker, desc, id, price, info, ucits}
  var BY_ID = {};        // cusip/cins -> ticker
  Object.keys(RAW).forEach(function (group) {
    RAW[group].forEach(function (r) {
      var ucits = group === 'ucits';
      var id = r[3] || fakeId(r[0], ucits ? 'G' : '');
      SECURITIES[r[0]] = { ticker: r[0], desc: r[1], price: r[2], id: id, info: !!r[4], ucits: ucits, group: group };
      BY_ID[id] = r[0];
    });
  });
  function tickers(group) { return RAW[group].map(function (r) { return r[0]; }); }

  /* Securities that fail validation when added (mirrors the real error events) */
  SECURITIES.TSLA.error = 'Security is restricted. Restriction category: Restriction3,Restriction6,Restriction2. Not added to model.';
  SECURITIES.LULU.error = 'Security is restricted. Restriction category: FutureDate. Not added to model.';
  SECURITIES.PBIX.error = 'Security not valid for the ACCESS program.';

  /* ---------- holdings builder ---------- */
  function pick(rand, arr, n) {
    var a = arr.slice(), out = [];
    while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]);
    return out;
  }
  function fiShareFromName(name) {
    var n = name.toLowerCase();
    if (/equity|growth equity|focus growth|small company|global growth|capital appreciation|core equity models/.test(n) && !/& ?bond|income/.test(n)) return 0;
    if (/mod ?agg|aggressive|- agg/.test(n)) return 0.2;
    if (/mod ?cons/.test(n)) return 0.45;
    if (/cons|retirement income|income$/.test(n)) return 0.6;
    if (/bal|moderate|- mod|mod growth|tax-managed/.test(n)) return 0.38;
    return 0.3;
  }
  var KINDS = {
    multi:   { eq: tickers('ishares').filter(function (t) { return /IVV|IJH|IJR|EFA|IEMG/.test(t); }).concat(['SPY', 'QQQ', 'GLD']), fi: ['AGG', 'TLT', 'SHY', 'TIP', 'BIL', 'LQD', 'MINT'], eqN: [5, 7], fiN: [3, 5] },
    afunds:  { eq: tickers('afunds').slice(0, 7), fi: ['RBFGX', 'RITGX', 'RMQGX', 'RLBGX'], eqN: [4, 6], fiN: [2, 3] },
    bktax:   { eq: tickers('growth').concat(tickers('value')), fi: ['MUB', 'AGG', 'SHY'], eqN: [22, 28], fiN: [1, 2] },
    bkcore:  { eq: tickers('growth').concat(tickers('value')).concat(['IVV', 'IEFA', 'IEMG']), fi: ['AGG', 'IUSB', 'TLT', 'SHY', 'LQD', 'TIP'], eqN: [18, 24], fiN: [3, 5] },
    ucits:   { eq: ['CSPX', 'IWDA', 'EIMI', 'IMEU', 'IJPA', 'IUSA', 'IGLN'], fi: ['AGGG', 'IGLA', 'IBTM', 'IEAC', 'IHYG'], eqN: [4, 6], fiN: [2, 4] },
    capgroup:{ eq: ['CGGR', 'CGDV', 'CGUS', 'CGGO', 'CGXU', 'CGIE', 'CGBL'], fi: ['CGCP', 'CGMU', 'CGSD', 'CGHM'], eqN: [4, 6], fiN: [2, 3] },
    polen:   { eq: tickers('growth'), fi: [], eqN: [22, 27], fiN: [0, 0] },
    vanguard:{ eq: ['VTI', 'VXUS', 'VO', 'VB', 'VEA', 'VWO', 'VIG'], fi: ['BND', 'BNDX', 'VTEB', 'VGIT'], eqN: [4, 6], fiN: [2, 3] }
  };

  function buildHoldings(model) {
    var rand = mulberry32(hashStr(model.access + model.name));
    var k = KINDS[model.kind];
    var fiShare = k.fi.length ? fiShareFromName(model.name) : 0;
    var eqN = k.eqN[0] + Math.floor(rand() * (k.eqN[1] - k.eqN[0] + 1));
    var fiN = fiShare ? k.fiN[0] + Math.floor(rand() * (k.fiN[1] - k.fiN[0] + 1)) : 0;
    var cash = +(1 + rand() * 4).toFixed(3);
    var investable = 100 - cash;
    var eqT = pick(rand, k.eq, eqN), fiT = pick(rand, k.fi, fiN);
    function alloc(ts, total) {
      var raw = ts.map(function () { return 0.4 + rand() * 1.4; });
      var sum = raw.reduce(function (a, b) { return a + b; }, 0);
      return ts.map(function (t, i) { return { ticker: t, weight: +(raw[i] / sum * total).toFixed(3) }; });
    }
    var rows = alloc(eqT, investable * (1 - fiShare)).concat(alloc(fiT, investable * fiShare));
    var used = rows.reduce(function (a, r) { return a + r.weight; }, 0);
    rows.unshift({ ticker: 'USD Cash', weight: +(100 - used).toFixed(3) });
    return rows;
  }

  /* ---------- users ---------- */
  var MDP_USERS = {
    admin: 'MDC, ART', qa: 'QASIT, ICSTOMMQA', ho: 'HomeOffice, VM', ist: 'ISTOOLSET, QAHOTEN',
    test: 'Test, ICSTOMMC', uat: 'UATTest, MDP', vm: 'One, Vestmark', dr: 'Reyes, Dana', sys: 'System'
  };

  /* ---------- strategies (all mock) ----------
   * mgr, name, access, swp, type, accounts, aum(M), kind, status,
   * modified stamp, modified user key, confirmed stamp|null, confirmed user key
   */
  var M = {
    t12: '12th Street Asset Management', af: 'American Funds Models', bk: 'Blackrock Models',
    cg: 'Capital Group Models', pl: 'Polen Capital Management, LLC', vg: 'Vanguard Models'
  };
  var DEFS = [
    [M.t12, '12th Street Tactical Multi-Asset - Bal', 'N601', '', 'Dynamic', 192, 84.16, 'multi', 'In Progress', '2026-10-27 12:19:17.500213', 'qa', '2026-10-08 14:09:00', 'qa'],
    [M.af, 'American Funds Global Growth & Income', 'N537', '', 'Static', 1655, 471.01, 'afunds', 'Rejected', '2026-10-26 04:45:30.306118', 'admin', '2026-09-22 14:49:00', 'admin'],
    [M.af, 'American Funds Retirement Income - Cons', 'N538', '', 'Dynamic', 271, 81.23, 'afunds', 'Approved', '2026-10-27 16:16:33.294007', 'ho', '2026-09-16 15:42:00', 'test'],
    [M.af, 'American Funds Capital Appreciation', 'Z9D1', '', 'Static', 529, 80.17, 'afunds', 'Approved', '2026-10-26 11:03:57.325410', 'qa', '2026-08-28 16:35:00', 'dr'],
    [M.af, 'American Funds Core Equity Models', 'N539', '', 'Static', 138, 55.62, 'afunds', 'Approved', '2026-10-08 11:19:17.222904', 'ist', '2026-09-24 09:31:00', 'qa'],
    [M.af, 'American Funds Balanced Growth', 'N535', '', 'Static', 2518, 438.95, 'afunds', 'Approved', '2026-10-27 13:19:27.645331', 'qa', '2026-09-17 10:29:00', 'qa'],
    [M.af, 'American Funds Tax-Aware Growth & Income', 'N536', '', 'Static', 2688, 796.60, 'afunds', 'Approved', '2026-10-26 16:42:36.782560', 'ist', null, null],
    [M.bk, 'BlackRock Div&Inc w iShares TaxAware - Mod Agg', 'N529', '', 'Static', 72, 22.31, 'bktax', 'Approved', '2026-10-27 13:53:48.045479', 'qa', null, null],
    [M.bk, 'BlackRock Div&Inc w iShares TaxAware - Mod Cons', 'N527', '', 'Static', 13, 3.31, 'bktax', 'Rejected', '2026-10-27 15:02:07.453118', 'qa', null, null],
    [M.bk, 'BlackRock Core Equity & Bond - Cons', 'N522', '', 'Static', 83, 15.65, 'bkcore', 'Approved', '2026-10-16 10:14:56.485702', 'qa', null, null],
    [M.bk, 'BlackRock Core Equity & Bond - Mod', 'N524', '', 'Static', 369, 102.65, 'bkcore', 'Approved', '2026-10-02 15:04:31.535864', 'qa', '2026-09-17 10:30:00', 'qa'],
    [M.bk, 'BlackRock Core Equity & Bond - Mod Agg', 'N525', '', 'Dynamic', 463, 117.43, 'bkcore', 'In Progress', '2026-10-28 09:38:39.681220', 'ho', null, null],
    [M.bk, 'BlackRock Core Equity & Bond - Mod Cons', 'N523', '', 'Static', 90, 19.25, 'bkcore', 'Approved', '2026-10-08 05:57:36.379015', 'qa', null, null],
    [M.bk, 'BlackRock Core Eq & Bond TaxAware - Cons', 'N526', '', 'Static', 15, 2.65, 'bkcore', 'Approved', '2026-10-23 12:56:57.482166', 'qa', '2026-09-14 17:46:00', 'vm'],
    [M.bk, 'BlackRock Core Eq & Bond TaxAware - Mod', 'N528', '', 'Static', 101, 18.39, 'bkcore', 'Approved', '2026-10-27 16:15:51.348093', 'qa', '2026-10-22 17:21:00', 'qa'],
    [M.bk, 'BlackRock Global Allocation UCITS Aggressive', 'N593', 'Z9GG', 'Dynamic', 48, 62.24, 'ucits', 'Approved', '2026-10-27 12:17:53.309442', 'qa', '2026-09-17 10:35:00', 'qa'],
    [M.bk, 'BlackRock Global Allocation UCITS - Balanced', 'Z9E1', 'Z9GF', 'Static', 25, 108.70, 'ucits', 'Approved', '2026-10-23 09:36:46.352870', 'ho', '2026-09-15 12:43:00', 'test'],
    [M.bk, 'BlackRock Global Allocation UCITS Cons', 'N591', 'Z9GH', 'Static', 32, 45.66, 'ucits', 'In Progress', '2026-10-28 10:43:31.222651', 'qa', null, null],
    [M.bk, 'BlackRock Global Allocation UCITS Equity', 'N594', 'Z9GI', 'Static', 47, 77.81, 'ucits', 'Approved', '2026-10-12 05:31:30.425119', 'qa', null, null],
    [M.bk, 'BlackRock Global Allocation UCITS Moderate', 'N592', 'Z9GJ', 'Static', 159, 506.96, 'ucits', 'Approved', '2026-10-22 10:18:47.244388', 'ho', '2026-09-17 10:31:00', 'qa'],
    [M.cg, 'Capital Group ETF Core Plus Growth & Income', 'N532', 'Z9NO', 'Dynamic', 253, 87.23, 'capgroup', 'Approved', '2026-10-27 04:00:01.640517', 'ho', '2026-09-02 09:10:00', 'uat'],
    [M.cg, 'Capital Group ETF Core Plus Cons Income', 'N534', 'Z9NP', 'Static', 30, 13.97, 'capgroup', 'Approved', '2026-10-19 06:45:36.946200', 'qa', null, null],
    [M.cg, 'Capital Group ETF Core Plus Mod Growth & Inc', 'N531', 'Z9NR', 'Static', 329, 103.85, 'capgroup', 'Approved', '2026-10-19 06:46:30.107734', 'qa', null, null],
    [M.cg, 'Capital Group Global Equity Focus', 'N533', 'Z9NS', 'Static', 211, 64.40, 'capgroup', 'Approved', '2026-10-14 08:12:09.551023', 'ho', '2026-10-01 11:05:00', 'qa'],
    [M.cg, 'Capital Group Multi-Sector Income', 'N530', 'Z9NT', 'Static', 87, 29.18, 'capgroup', 'In Progress', '2026-10-27 17:22:40.019876', 'admin', null, null],
    [M.pl, 'Polen Focus Growth Equity', 'N611', '', 'Static', 1204, 312.55, 'polen', 'Approved', '2026-10-21 14:02:11.903301', 'qa', '2026-10-21 14:30:00', 'qa'],
    [M.pl, 'Polen Global Growth', 'N612', '', 'Static', 344, 96.02, 'polen', 'Needs Attention', '2026-10-21 11:04:56.393805', 'sys', '2026-10-03 10:12:00', 'qa'],
    [M.pl, 'Polen Small Company Growth', 'N613', '', 'Static', 61, 12.84, 'polen', 'Rejected', '2026-10-24 11:27:05.664912', 'admin', null, null],
    [M.vg, 'Vanguard Core ETF Allocation - Cons', 'N621', '', 'Static', 418, 141.27, 'vanguard', 'Approved', '2026-10-20 10:10:10.120004', 'ho', '2026-10-06 15:12:00', 'uat'],
    [M.vg, 'Vanguard Core ETF Allocation - Mod', 'N622', '', 'Dynamic', 977, 288.90, 'vanguard', 'Approved', '2026-10-26 14:31:02.774519', 'qa', '2026-10-13 09:58:00', 'qa'],
    [M.vg, 'Vanguard Core ETF Allocation - Agg', 'N623', '', 'Static', 503, 166.48, 'vanguard', 'In Progress', '2026-10-28 08:51:22.904437', 'ho', null, null],
    [M.vg, 'Vanguard Tax-Managed Balanced', 'N624', '', 'Static', 0, 0.00, 'vanguard', 'New', '2026-10-26 13:07:45.338190', 'admin', null, null],
    [M.bk, 'BlackRock Core Equity & Bond - Agg', 'N520', '', 'Static', 0, 0.00, 'bkcore', 'New', '2026-10-27 09:14:22.506113', 'ho', null, null],
    [M.af, 'American Funds Growth & Income Portfolio', 'N540', '', 'Dynamic', 742, 205.36, 'afunds', 'Needs Attention', '2026-10-24 06:02:18.770431', 'sys', '2026-09-29 14:15:00', 'qa']
  ];

  /* ---------- profile users (fictional) ---------- */
  var PROFILE_USERS = {};
  PROFILE_USERS[M.t12] = [['Hollis, Grant', 'mdp.ext.ghollis@ubs.com', '212-555-0141'], ['Ostrowski, Lena', 'mdp.ext.lostrowski@ubs.com', '']];
  PROFILE_USERS[M.af] = [['Calder, Marisa', 'mdp.ext.mcalder@ubs.com', '213-555-0162'], ['Byrne, Owen', 'mdp.ext.obyrne@ubs.com', '213-555-0188'], ['Tanaka, Rui', 'mdp.ext.rtanaka@ubs.com', '']];
  PROFILE_USERS[M.bk] = [['Hale, Arthur', 'mdp.qa.user01@ubs.com', '9082346444'], ['Woodley, Angela', 'mdp.qa.user01@ubs.com', '908-333-8888'], ['Novak, Irina', 'mdp.qa.user02@ubs.com', '777-777-7777']];
  PROFILE_USERS[M.cg] = [['Prescott, Elena', 'mdp.ext.eprescott@ubs.com', '415-555-0110'], ['Moreau, Julien', 'mdp.ext.jmoreau@ubs.com', '']];
  PROFILE_USERS[M.pl] = [['Kessler, Anya', 'mdp.ext.akessler@ubs.com', '561-555-0173'], ['Duarte, Sam', 'mdp.ext.sduarte@ubs.com', '']];
  PROFILE_USERS[M.vg] = [['Whitfield, Cole', 'mdp.ext.cwhitfield@ubs.com', '610-555-0129'], ['Iyer, Priya', 'mdp.ext.piyer@ubs.com', '610-555-0155']];
  var SHARED_USERS = [['Turner, Alla', 'mdp.qa.user01@ubs.com', ''], ['MDC, ART', 'mdp.qa.user03@ubs.com', ''], ['MDC, ART', 'testfailbounceback@example.com', ''], ['QASIT, ICSTOMMQA', 'mdp.qa.user03@ubs.com', ''], ['Test, ICSTOMMC', '', '']];

  var MINIMUMS = { 'multi': '$25,000', 'afunds': '$25,000', 'bktax': '$10,000', 'bkcore': '$10,000', 'ucits': '$50,000', 'capgroup': '$10,000', 'polen': '$100,000', 'vanguard': '$10,000' };

  /* ---------- snapshots & events ---------- */
  function jitter(rows, seed) {
    var rand = mulberry32(seed);
    var out = rows.map(function (r) { return { ticker: r.ticker, weight: r.ticker === 'USD Cash' ? r.weight : +(r.weight * (0.9 + rand() * 0.2)).toFixed(3) }; });
    var sumNonCash = out.slice(1).reduce(function (a, r) { return a + r.weight; }, 0);
    out[0].weight = +(100 - sumNonCash).toFixed(3);
    return out;
  }
  function dayOf(stamp) { return stamp.slice(0, 10); }

  /* ---------- audit trail ---------- */
  var REASONS = ['qa', 'testing', 'quarterly rebalance', 'drift correction', 'manager instruction', 'cash target update'];
  var ERRORS = [
    function (r) { var t = ['POIUYQ', 'G495548999', 'XXYZQ', '54K3F9Z'][Math.floor(r() * 4)]; return 'Ticker/CUSIP = ' + t + '\nERROR: Invalid security. Not added to model.'; },
    function () { return 'Ticker/CUSIP = CRDAX\nERROR: Mutual fund not eligible for program. Not added to model.'; },
    function () { return 'Ticker/CUSIP = LULU\nERROR: ' + SECURITIES.LULU.error; },
    function () { return 'Ticker/CUSIP = TSLA\nERROR: ' + SECURITIES.TSLA.error; },
    function (r, m) { return 'Ticker/CUSIP = ' + m.holdings[1 + Math.floor(r() * (m.holdings.length - 1))].ticker + '\nERROR: Duplicate security. Not added to model'; }
  ];
  var testUsers = ['QASIT, ICSTOMMQA', 'Test, ICSTOMMC', 'HomeOffice, VM'];
  function micros(seed) { return String(mulberry32(seed)()).slice(2, 8).padEnd(6, '0'); }
  function stamp(day, rand) {
    var h = 1 + Math.floor(rand() * 16);
    return day + ' ' + String(h + 5).padStart(2, '0') + ':' + String(Math.floor(rand() * 60)).padStart(2, '0') + ':' + String(Math.floor(rand() * 60)).padStart(2, '0') + '.' + micros(Math.floor(rand() * 1e9));
  }
  function changesFor(m, rand) {
    var rows = m.holdings.slice(1), n = 1 + Math.floor(rand() * 3), out = [];
    pick(rand, rows, n).forEach(function (h) {
      var delta = +((rand() - 0.5) * 1.2).toFixed(3) || 0.25;
      out.push({ ticker: h.ticker, from: Math.max(0, +(h.weight - delta).toFixed(3)), to: h.weight });
    });
    var net = out.reduce(function (a, c) { return a + (c.to - c.from); }, 0);
    out.push({ ticker: 'USD Cash', from: +(m.holdings[0].weight + net).toFixed(3), to: m.holdings[0].weight });
    return out;
  }
  function buildEvents(m) {
    var rand = mulberry32(hashStr('evt' + m.access)), ev = [], seq = 0;
    function push(e) { e.seq = seq++; ev.push(e); }
    var lastDay = m.modified.slice(0, 10);
    if (m.status !== 'New') {
      if (m.confirmed) push({ ts: m.confirmed, event: 'Confirmed', user: m.confirmedUser, details: 'Model Confirmed' });
      ['2026-10-06', '2026-10-09', '2026-10-16', '2026-10-20', '2026-10-22'].forEach(function (day) {
        if (day >= lastDay || rand() < 0.45) return;
        var ts = stamp(day, rand), u = testUsers[Math.floor(rand() * 3)], ch = changesFor(m, rand);
        push({ ts: ts, event: 'Model Updated By Admin', user: u, details: 'Admin reason for update: ' + REASONS[Math.floor(rand() * REASONS.length)], changes: ch });
        push({ ts: ts, event: 'Model Approved', user: u, details: '-', changes: ch });
        if (rand() < 0.4) push({ ts: stamp(day, rand), event: 'Error When Adding Security', user: testUsers[Math.floor(rand() * 2)], details: ERRORS[Math.floor(rand() * ERRORS.length)](rand, m) });
      });
    }
    var ch = changesFor(m, rand);
    if (m.status === 'Approved') {
      push({ ts: m.modified, event: 'Model Updated By Admin', user: m.modifiedUser, details: 'Admin reason for update: ' + REASONS[Math.floor(rand() * REASONS.length)], changes: ch });
      push({ ts: m.modified, event: 'Model Approved', user: m.modifiedUser, details: '-', changes: ch });
    } else if (m.status === 'Rejected') {
      push({ ts: m.modified, event: 'Model Rejected', user: m.modifiedUser, details: 'Rejected for the following reason(s):\nModel Weight total does not add up to 100%.' });
    } else if (m.status === 'Needs Attention') {
      var h = m.holdings[1 + Math.floor(rand() * (m.holdings.length - 1))];
      push({ ts: m.modified, event: 'Mandatory Corp Action', user: 'System', details: 'Mandatory Corporate Action event occurred. Status set to Needs Attention. Details below.', note: 'Corporate action on ' + h.ticker + ' (' + SECURITIES[h.ticker].desc + '): mandatory reorganization effective ' + m.modified.slice(5, 7) + '/' + m.modified.slice(8, 10) + '/2026. Review the position and resubmit the model.' });
    } else if (m.status === 'New') {
      push({ ts: m.modified, event: 'Model Created', user: m.modifiedUser, details: 'New model created. Awaiting initial submission.' });
    }
    return ev;
  }

  function buildModels() {
    return DEFS.map(function (d) {
      var m = {
        manager: d[0], name: d[1], access: d[2], swp: d[3], type: d[4], accounts: d[5], aum: d[6], kind: d[7],
        status: d[8], modified: d[9], modifiedUser: MDP_USERS[d[10]], confirmed: d[11], confirmedUser: d[12] ? MDP_USERS[d[12]] : null,
        minimum: MINIMUMS[d[7]], emails: '', tlh: '', pending: null, communications: []
      };
      if (m.confirmed && m.confirmed.indexOf('.') < 0) m.confirmed += '.' + micros(hashStr('c' + m.access));
      m.holdings = buildHoldings(m);
      m.users = (PROFILE_USERS[m.manager] || []).concat(SHARED_USERS);
      // snapshots
      m.snapshots = {};
      var rand = mulberry32(hashStr('snap' + m.access));
      var dates = ['2026-10-21', '2026-10-14', '2026-10-07', '2026-09-30'];
      if (m.confirmed) dates.push(dayOf(m.confirmed));
      if (m.status === 'New') dates = [];
      dates.forEach(function (dt, i) {
        if (dt === '2026-10-21' || dt === dayOf(m.confirmed || '') || rand() > 0.35) m.snapshots[dt] = jitter(m.holdings, hashStr(m.access + dt) + i);
      });
      m.events = buildEvents(m);
      return m;
    });
  }

  window.MDP_SEED = {
    version: 4,
    managers: [M.bk, M.af, M.pl, M.cg, M.vg, M.t12], // order used in the Model List header
    managerOptions: [M.t12, M.af, M.bk, M.cg, M.pl, M.vg], // order used in the Manager filter
    securities: SECURITIES,
    securitiesById: BY_ID,
    users: MDP_USERS,
    buildModels: buildModels,
    tradeTypes: ['-', 'Buy', 'Sell', 'Buy/Sell (Trade To Target)', 'Adjustment (No Trade)'],
    tradeToTarget: 'Buy/Sell (Trade To Target)',
    statuses: ['Approved', 'In Progress', 'Needs Attention', 'New', 'Rejected'],
    personas: {
      admin: { user: 'MDC, ART', managers: null },
      blackrock: { user: 'Novak, Irina', managers: [M.bk] },
      americanfunds: { user: 'Calder, Marisa', managers: [M.af] },
      capitalgroup: { user: 'Prescott, Elena', managers: [M.cg] },
      polen: { user: 'Kessler, Anya', managers: [M.pl] },
      vanguard: { user: 'Whitfield, Cole', managers: [M.vg] },
      twelfthstreet: { user: 'Hollis, Grant', managers: [M.t12] }
    }
  };
})();
