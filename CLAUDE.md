# Trading Games

A static website of trading practice games. No server, no build step, no frameworks, no dependencies.
Open `index.html` in a browser (works straight from `file://`) or host the folder as-is (e.g. GitHub Pages).

## Conventions (the owner's preferences: keep following them)
- Keep the codebase small and easy for a human to maintain. Prefer the shortest plain solution:
  plain functions, template strings, no classes or abstractions unless they clearly pay for themselves.
- One HTML file per page, each with its own page-specific JS file. A page may also have a data-only
  JS file (e.g. `betting-board-markets.js`). Pages that need no JS (like `index.html`) have none.
- Generic helpers used by more than one file go in `shared.js`. All CSS lives in the single `style.css`.
- Use classic `<script src>` tags, not ES modules, so pages work from `file://`.
  Load order: `shared.js`, then the data file, then the page file.
- UI: minimalist black and white. Use color only where it carries meaning (green/red for gains, losses and
  edge; red suits; ball colors). No dark mode, animations, shadows, icons or decorative effects.
- Persistence: browser localStorage only, through `load`/`save` in `shared.js`. Prefix keys with the game
  (e.g. `bb-settings`).
- Confirm new design choices with the owner before building them.

## Files
- `index.html`: home page. Add a list item for every new game.
- `style.css`, `shared.js`: shared by all pages.
- `betting-board.html`, `betting-board.js`, `betting-board-markets.js`: the betting board game.
- `betting-board-check.html`, `betting-board-check.js`: self-check page for the betting board (not linked from the home page).

## Betting board
- Tuning constants (+EV count weights, markup ranges, probability ranges, defaults) are at the top of `betting-board.js`.
- Payout odds are profit to stake: "pays 4:1" means a $1 stake wins $4 and keeps the $1. Fair odds are (1-p)/p.
- Markets are a mix of fixed markets and templates (functions that draw new numbers each time), so fair odds
  can't simply be memorized. Probabilities are counted exactly by enumerating every equally likely outcome.
- Add a fixed market: one line in a category's `markets` in `betting-board-markets.js`:
  `{ text, outcomes: dice(2), test: d => d[0] + d[1] === 10 }`. No probability math needed.
- Add a template: a function returning the same kind of object with random numbers. Every number that
  changes the test must appear in the text. Draws outside `MARKET_P_RANGE` are re-rolled automatically.
- Keep enumerations small (up to about 8 coins, 4 dice, 3 cards, 3 spins, 4 balls) so boards build instantly.
- Add a category: add an entry to `CATEGORIES` with `show(outcome)` and at least 6 markets.
  It appears in the settings automatically.

## Checking changes
- Open `betting-board-check.html` after adding markets or changing tuning constants. It lists every market's
  exact probability, samples every template (flagging texts that are missing a number), checks the +EV counts
  and board sizes, and compares simulated frequencies with exact probabilities. Problems show in red.
- Then play a few rounds in `betting-board.html` and check the browser console for errors.
