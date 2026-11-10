# Model Delivery Portal — Digital Twin

A desktop-only replica of the Model Delivery Portal (Money Manager view) used to mock up new features before they go to the build team. All strategies, accounts, AUM, users and holdings are **mock data**.

Plain HTML/CSS/JS — no build step. Deploy the repo root as a static site on Vercel (Framework preset: **Other**, no build command, output directory `.`).

## Screens

| Screen | Route |
|---|---|
| Model List (filters, search, sort, paging, CSV export, audit trail) | `#/` |
| Model Information → Model Details / Model Options / Model Snapshot | `#/model/N529/info/details` · `options` · `snapshot` |
| Communication → Today's Change / SMA Communication | `#/model/N529/communication/today` · `sma` |
| Analysis → Performance / Profile | `#/model/N529/analysis/performance` · `profile` |

## What works

- **Manager\* filter**: searchable multi-select with Select All. The filter count pill updates as you select; the grid only changes on **APPLY** (same as production). **CLEAR** resets.
- **Modified / Confirmed Date Range** pickers and **Status** filter.
- **Auto-cash**: changing any weight rebalances USD Cash automatically, so the model stays at 100%. If allocations exceed 100%, cash goes negative (red) and SUBMIT explains why.
- **Trade All To Target** sets every row to *Buy/Sell (Trade To Target)* and Notes to *Fully Rebalance*.
- **Excel**: Download Template gives a real `.xlsx` (`STATIC_MODEL_Template` / `DYNAMIC_MODEL_Template`, sheet *Import*) with the production columns, dropdowns for DoNotBuy/DoNotSell/TradeType, and a frozen header. The download icon on a model exports the same format filled with current weights. Import reads it back (or a CSV).
- **Model Details**: add by Ticker/CUSIP/CINS (comma-separated; UCITS models require CINS), edit New Weight (live Weight Change and Total), Trade Type, Do Not Buy/Sell, Notes, **Trade All To Target**, **Import** (CSV), **Download Template**.
  - Editing a model sets it to *In Progress* and locks it. Other users get "Model Being Edited By Another User".
  - **SUBMIT** is disabled (with a tooltip saying why) until the total is exactly 100.000% and something changed. Securities left at 0.000% trigger a warning that names them (Go Back / Submit Anyway). Success shows a *Model Approved* card (auto-dismisses after 5s, pauses on hover, links to the audit trail).
  - **CONFIRM** is available only when there are no changes, and only once per visit to the screen. It stamps Confirmed user/date.
  - **DELETE** removes a row and moves its weight to USD Cash (current production behavior).
  - **CLEAR** discards edits and releases the lock.
- **Model Snapshot**: date picker; shows "Model snapshot not saved for selected date" when none exists.
- **Model Options**: Tax Loss Harvest Replacement saves and is logged.
- Edits persist in the browser (localStorage). Only models that differ from the seed are stored.
- Seed dates move forward in whole weeks so the newest activity is always within the last few days.

## Improvements log

Everything net new vs. production is listed in the app at **Improvements** (button next to Support, or `#/improvements`). Each entry has today's behavior, the change, why it matters, and a *Try it* link. It downloads as Excel or copies as text for the product team. The source is `js/improvements.js`; see `CLAUDE.md` for how to keep it current.

## Import (proposed)

A right-side drawer replaces "pick a file". Open it with **Import** on Model Details, by pressing **Ctrl+V anywhere** on Model Details, or by dragging a file onto the page.

- **Paste from Excel, type, drop or browse.** Headers are optional. Columns are detected (Security/CUSIP, Weight, TradeType, DoNotBuy, DoNotSell, Notes) and can be remapped.
- **Recognition:** ticker, CUSIP, CINS, SEDOL, or company name ("Apple"). Ticker typos get suggestions ("APPL" → AAPL). Weights as `10%`, `10` or `0.10`. Duplicates are combined and explained.
- **Same rules as the grid:** restricted, not eligible, UCITS-needs-CINS and invalid securities are flagged in the row, with one-click fixes or *Remove row*. Nothing is skipped silently: every issue is fixed or removed before applying. USD Cash balances to 100% automatically and cannot go below 0.
- **Modes:** *Replace model* or *Update listed only*, suggested automatically from how much of the model you pasted.
- *Apply to Model* fills the grid (changed rows highlighted). Review, then Submit. **Undo** for 10 seconds.
- **No files at all:** *Copy Current Model* puts the data on the clipboard for Excel. Edit it, then paste it back.
- Every import is logged in the audit trail as **Model Imported**.

## Portfolios (proposed, CIO view)

Three kinds of CIO models:

- **Building Blocks** (B301–B308, *CIO Building Blocks*): ordinary models holding ETFs, modelled on the CIO "Portfolio Building Blocks" design: 1 Cash, 2 Fixed Income (Short Duration), 3 Fixed Income (Intermediate), 4 Fixed Income (Long Duration), 5 High Yield & EM Debt, 6 US Equity, 7 International Equity (Developed + EM), 8 International Developed Equity. Edited on Model Details.
- **MyWay starting allocations** (W201 Conservative, W202 Moderate, W203 Aggressive SAA): made only of Building Blocks. The client questionnaire picks one; advisors then tailor it at the block level (re-weight within range, remove a block whose minimum is 0, add a listed block up to its maximum). Each shows its cash / fixed income / equity structure.
- **Multi-Manager Portfolios** (M101–M105, *CIO Multi-Manager Portfolios*): portfolios made only of third-party SMA models. Managers never see them.

Portfolios share the same screens:

- **Composition**: add underlying models by Access code or name, set allocations (total must be 100%; *Scale To 100%* helps), then Submit / Confirm / Clear like Model Details. No mixing of the two families, and no portfolio inside a portfolio.
- **Consolidated Holdings**: the look-through model (allocation × weight), with summary tiles, overlap and single-stock 5% filters (funds exempt) and a per-security drill-down.
- **Automatic updates**: approving an underlying model recalculates and publishes every portfolio that uses it (*Underlying Model Updated* in the audit trail).
- **Status flows up**: an underlying model that is Rejected or Needs Attention puts the portfolio in Needs Attention, with a link to it.
- Every underlying model shows where it is used (internal view only; try `?persona=polen`, where nothing changes).

## After Submit (proposed): impact, delivery, accounts, guardrails, fees

MDP today ends at *Model Approved*. These views (`js/uma.js`) show the rest of the chain. Nothing here keeps its own records: deliveries are derived from the audit trail and accounts are generated deterministically, so every view stays consistent with the models.

- **Impact before approval**: a strip under the Model Details grid and the Composition grid shows securities changing, turnover, accounts, portfolios recalculated, when trading starts, and cross-sleeve conflicts.
- **Delivery tab** (every model): each approval is a delivery followed through *Approved in MDP → Sent to Vestmark → Trading → Trades complete → Reconciled*, with accounts traded and exceptions. Approvals after 3:45 PM ET or on weekends queue for the next open.
- **Delivery dashboard** (`#/delivery`): all deliveries, in flight, open exceptions, and models needing action.
- **Guardrails** (MyWay): range per block, blocks advisors may add, and portfolio health checks (Risk = equity %, Structure = cash %, Diversification = largest block and minimum blocks; Sustainability is shown as not evaluated because MDP holds no ESG data). Editing a rule shows how many tailored accounts would fail it. One published feed. A starting allocation cannot be submitted if it breaks a range or fails its own checks.
- **Accounts** (portfolios): every account by block, about 30% of MyWay accounts tailored; open one to compare it with the starting allocation, see its health checks, and trace every holding to its block.
- **ETF look-through**: the blocks hold ETFs. Looking inside each ETF needs ETF holdings data, which MDP does not hold.
- **Cross-sleeve check**: one sleeve reduced a security another added within 30 days.
- **Fees** (portfolios): billable assets per sleeve, blended fee, per-manager billing feed. Rates are illustrative.

Trade and account data would come from Vestmark; here it is mock.

## Bulk Upload (proposed)

`#/bulk` (also *Bulk Upload* on the Model List). One workbook, one sheet per model named with its Access code (or one sheet with an Access column). Download the current models for a manager, edit, drop the file back. Every sheet is checked before anything is submitted; problems are fixed in the file or the model is removed from the batch. The 84 *House View* models (H001–H084) are there to exercise it; a sample file with deliberate mistakes loads from the page.

## Walkthrough

*Walkthrough* in the banner (or `?tour=1`) opens a dark docked panel that steps through what is new, with production behavior stated beside each change. Arrow keys move between steps; Esc closes.

## Proposed improvements (default) vs. today's behavior

The twin shows proposed UX by default. Add `?ux=current` to see production behavior side by side.

- **Model Snapshot**: today it opens on the previous business day, puts an error ribbon at the top of the page, and gives no hint which dates have a snapshot. The proposal opens on the latest saved snapshot, marks saved dates in the calendar (with a "Saved Snapshots" list), adds ‹ › buttons to step between snapshots, and shows any error inline next to the date with a one-click "View latest" link.

## URL options

- `?ux=current` — production behavior where we propose a change (see above).

- `?reset=1` — restore the seed data.
- `?persona=blackrock` — single-manager (external manager) view. Also `americanfunds`, `capitalgroup`, `polen`, `vanguard`, `twelfthstreet`, `houseview`. Default is the admin view (`MDC, ART`).
- `?tour=1` — start the walkthrough.

## Assumptions to confirm with the MDP team

These behaviors weren't visible in the screenshots, so they are best guesses:

- "Most Recent Profile" opens a summary modal.
- Import replaces the model target (securities not in the file go to 0).

## Files

- `index.html` — header, sub-nav, shell
- `css/styles.css` — all styling
- `js/data.js` — mock strategies, securities, users, snapshots
- `js/app.js` — routing, screens, interactions
- `js/xlsx.js` — dependency-free Excel writer/reader (works without CDN access)
- `js/portfolios.js` — MyWay and Multi-Manager Portfolios (composition, consolidated holdings, auto-recalculation)
- `js/uma.js` — after Submit: impact, delivery, accounts, guardrails, cross-sleeve checks, fees
- `js/import.js` — Import drawer (paste/drop/type, detection, preview, undo)
- `js/bulk.js` — Bulk Upload
- `js/tour.js` — walkthrough panel
- `js/improvements.js` — improvements log (net new vs. production)
