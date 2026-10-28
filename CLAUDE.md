# MDP Digital Twin — working rules

This repo is a desktop-only digital twin of the UBS Model Delivery Portal (Money Manager view), used to mock up features with the MDP product team. All data is mock.

## Domain context
- These are **SMA investment models**: one model = a set of target **weights** (%) that is traded across many client accounts. Everything is expressed in weights. Never add share counts, quantities, market values or dollar amounts to model editing or import. They don't apply to a model.
- USD Cash is the residual that keeps a model at 100%.

## Always keep the Improvements log current
`js/improvements.js` lists everything that is **net new vs. the production app** (shown in-app at `#/improvements`, exportable to Excel).

- When you add or change a feature that production does not have, add or update an entry: `id` (area prefix + number), `area`, `title`, `today` (production behavior), `change` (what the twin does), `why`, `added` (YYYY-MM-DD), `status`, and `try` (a hash route to demo it, optional; append `?import` to open the Import panel).
- Fidelity fixes that only make the twin match production are **not** improvements. Don't log them.
- When a feature is removed, remove its entry.

## Conventions
- Plain HTML/CSS/JS, no build step, no CDN dependencies (users are on locked-down Citrix desktops). Excel I/O is `js/xlsx.js`.
- Bump the `?v=` query on script/style tags in `index.html` whenever JS/CSS changes (assets are cached as immutable).
- New UI must fit the existing visual style (square corners, tan/black buttons, banner `#5A5D5C`, small caps labels).
- `?ux=current` shows production behavior where the twin proposes a change; `?reset=1` restores seed data; `?persona=blackrock` shows the single-manager view.
