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
- **Model Details**: add by Ticker/CUSIP/CINS (comma-separated; UCITS models require CINS), edit New Weight (live Weight Change and Total), Trade Type, Do Not Buy/Sell, Notes, **Trade All To Target**, **Import** (CSV), **Download Template**.
  - **SUBMIT** validates the total is 100.000%, sets status to *In Progress* and stores the pending change.
  - **CONFIRM** applies weights, sets status to *Approved*, stamps Confirmed user/date, saves today's snapshot and logs the audit trail.
- **Model Snapshot**: date picker; shows "Model snapshot not saved for selected date" when none exists (every model has 10/21/2026 seeded).
- **Model Options**: Tax Loss Harvest Replacement saves and is logged.
- Edits persist in the browser (localStorage).

## URL options

- `?reset=1` — restore the seed data.
- `?persona=blackrock` — single-manager (external manager) view. Also `americanfunds`, `capitalgroup`, `polen`, `vanguard`, `twelfthstreet`. Default is the admin view (`MDC, ART`).

## Assumptions to confirm with the MDP team

These behaviors weren't visible in the screenshots, so they are best guesses:

- Trade Type options (`Trade to Target`, `Buy Only`, `Sell Only`).
- SUBMIT vs CONFIRM semantics (submit = pending review; confirm = apply).
- Audit Trail icon opens a history modal; "Most Recent Profile" opens a summary modal.
- Import replaces the model target (securities not in the file go to 0).

## Files

- `index.html` — header, sub-nav, shell
- `css/styles.css` — all styling
- `js/data.js` — mock strategies, securities, users, snapshots
- `js/app.js` — routing, screens, interactions
