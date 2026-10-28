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
  - Editing a model sets it to *In Progress* and locks it. Other users get "Model Being Edited By Another User".
  - **SUBMIT** is disabled (with a tooltip saying why) until the total is exactly 100.000% and something changed. Admins enter a reason. It logs *Model Updated By Admin* + *Model Approved* and applies the weights.
  - **CONFIRM** is available only when there are no changes. It stamps Confirmed user/date.
  - **DELETE** removes a row and moves its weight to USD Cash (current production behavior).
  - **CLEAR** discards edits and releases the lock.
- **Model Snapshot**: date picker; shows "Model snapshot not saved for selected date" when none exists (every model has 10/21/2026 seeded).
- **Model Options**: Tax Loss Harvest Replacement saves and is logged.
- Edits persist in the browser (localStorage).

## Proposed improvements (default) vs. today's behavior

The twin shows proposed UX by default. Add `?ux=current` to see production behavior side by side.

- **Model Snapshot**: today it opens on the previous business day, puts an error ribbon at the top of the page, and gives no hint which dates have a snapshot. The proposal opens on the latest saved snapshot, marks saved dates in the calendar (with a "Saved Snapshots" list), adds ‹ › buttons to step between snapshots, and shows any error inline next to the date with a one-click "View latest" link.

## URL options

- `?ux=current` — production behavior where we propose a change (see above).

- `?reset=1` — restore the seed data.
- `?persona=blackrock` — single-manager (external manager) view. Also `americanfunds`, `capitalgroup`, `polen`, `vanguard`, `twelfthstreet`. Default is the admin view (`MDC, ART`).

## Assumptions to confirm with the MDP team

These behaviors weren't visible in the screenshots, so they are best guesses:

- Admin "reason for update" prompt on SUBMIT (inferred from the audit trail).
- "Most Recent Profile" opens a summary modal.
- Import replaces the model target (securities not in the file go to 0).

## Files

- `index.html` — header, sub-nav, shell
- `css/styles.css` — all styling
- `js/data.js` — mock strategies, securities, users, snapshots
- `js/app.js` — routing, screens, interactions
