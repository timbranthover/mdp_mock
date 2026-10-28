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
- **Model Snapshot**: date picker; shows "Model snapshot not saved for selected date" when none exists (every model has 10/21/2026 seeded).
- **Model Options**: Tax Loss Harvest Replacement saves and is logged.
- Edits persist in the browser (localStorage).

## Improvements log

Everything net new vs. production is listed in the app at **Improvements** (button next to Support, or `#/improvements`). Each entry has today's behavior, the change, why it matters, and a *Try it* link. It downloads as Excel or copies as text for the product team. The source is `js/improvements.js`; see `CLAUDE.md` for how to keep it current.

## Import (proposed)

A right-side drawer replaces "pick a file". Open it with **Import** (Model Details), **Bulk Import** (Model List), by pressing **Ctrl+V anywhere** on either page, or by dragging a file onto the page.

- **Paste from Excel, type, drop or browse.** Headers are optional. Columns are detected (Security/CUSIP, Weight, Shares, Market Value, TradeType, DoNotBuy, DoNotSell, Notes, Access) and can be remapped.
- **Recognition:** ticker, CUSIP, CINS, SEDOL, or company name ("Apple"). Ticker typos get suggestions ("APPL" → AAPL). Weights as `10%`, `10` or `0.10`. Shares/market value are converted at EOD prices. Duplicates are combined and explained.
- **Same rules as the grid:** restricted, not eligible, UCITS-needs-CINS and invalid securities are flagged in the row, with one-click fixes or *Skip*. USD Cash balances to 100% automatically and cannot go below 0.
- **Modes:** *Replace model* or *Update listed only*, suggested automatically from how much of the model you pasted.
- **Single model:** *Apply to Model* fills the grid (changed rows highlighted). Review, then Submit. **Undo** for 10 seconds.
- **Bulk:** one sheet with an Access column updates many models. Locked, unknown or over-100% models are skipped with a reason. *Submit N Models* or *Apply as Drafts*.
- **No files at all:** *Copy Current Model* / *Copy All Models* puts the data on the clipboard for Excel. Edit it, then paste it back.
- Every import is logged in the audit trail as **Model Imported**.

## Proposed improvements (default) vs. today's behavior

The twin shows proposed UX by default. Add `?ux=current` to see production behavior side by side.

- **Model Snapshot**: today it opens on the previous business day, puts an error ribbon at the top of the page, and gives no hint which dates have a snapshot. The proposal opens on the latest saved snapshot, marks saved dates in the calendar (with a "Saved Snapshots" list), adds ‹ › buttons to step between snapshots, and shows any error inline next to the date with a one-click "View latest" link.

## URL options

- `?ux=current` — production behavior where we propose a change (see above).

- `?reset=1` — restore the seed data.
- `?persona=blackrock` — single-manager (external manager) view. Also `americanfunds`, `capitalgroup`, `polen`, `vanguard`, `twelfthstreet`. Default is the admin view (`MDC, ART`).

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
- `js/import.js` — Import drawer (paste/drop/type, detection, preview, bulk)
- `js/improvements.js` — improvements log (net new vs. production)
