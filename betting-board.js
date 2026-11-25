// Betting board game. Markets and categories live in betting-board-markets.js.

// ----- Tuning -----
const PLUS_EV_WEIGHTS = { 1: 0.2, 2: 0.3, 3: 0.3, 4: 0.2 }; // how many +EV markets per board, by probability
const PLUS_EV_MARKUP = [0.15, 0.60];   // +EV quoted odds = fair odds × (1 + markup)
const MINUS_EV_MARKUP = [-0.60, -0.05]; // −EV quoted odds = fair odds × (1 + markup)
const MARKET_P_RANGE = [0.015, 0.9];    // allowed probability of a basic market
const META_P_RANGE = [0.10, 0.85];      // allowed probability of a meta market
const START_BANKROLL = 1000;
const DEFAULT_SETTINGS = {
  categories: CATEGORIES.map(c => c.id), rounds: 6, perCategory: 3, metaCount: 1, timer: true, seconds: 90,
};

// ----- Board generation (pure: no page access) -----
function makeBoard(settings) {
  const cats = sample(CATEGORIES.filter(c => settings.categories.includes(c.id)), 3);
  const groups = cats.map(cat => ({ cat, markets: pickMarkets(cat, settings.perCategory) }));
  const metas = pickMetas(groups, settings.metaCount);
  const board = { groups, metas };
  const markets = allMarkets(board);
  markets.forEach((m, i) => m.id = i);
  const plus = sample(markets, Math.min(+weightedPick(PLUS_EV_WEIGHTS), markets.length));
  for (const m of markets) price(m, plus.includes(m));
  return board;
}

const allMarkets = board => [...board.groups.flatMap(g => g.markets), ...board.metas];
const inRange = (p, [lo, hi]) => p >= lo && p <= hi;

// n distinct markets from a category. Templates get up to 10 draws to land in MARKET_P_RANGE.
function pickMarkets(cat, n) {
  const chosen = [];
  for (const entry of shuffle(cat.markets)) {
    for (let tries = 0; tries < 10 && chosen.length < n; tries++) {
      const m = typeof entry === 'function' ? entry() : entry;
      const wins = count(m.outcomes, m.test), total = m.outcomes.length;
      if (inRange(wins / total, MARKET_P_RANGE) && !chosen.some(c => c.text === m.text)) {
        chosen.push({ ...m, cat, wins, total, p: wins / total });
        break;
      }
      if (typeof entry !== 'function') break;
    }
  }
  return chosen;
}

// Meta markets: pick a random template, then a random one of its candidates with p in META_P_RANGE.
// (Filtering first gives every template an equal share, whatever its number of candidates.)
function pickMetas(groups, n) {
  const states = countStates(groups);
  const metas = [];
  for (let tries = 0; tries < 50 && metas.length < n; tries++) {
    const candidates = pick(META_TEMPLATES)(groups)
      .map(m => ({ ...m, meta: true, p: sum(states.filter(s => m.test(s.counts)).map(s => s.prob)) }))
      .filter(m => inRange(m.p, META_P_RANGE) && !metas.some(x => x.text === m.text));
    if (candidates.length) metas.push(pick(candidates));
  }
  return metas;
}

// Every combination of per-group event counts, with its probability. Basic markets are independent.
function countStates(groups) {
  let states = [{ counts: [], prob: 1 }];
  for (const g of groups) {
    const dist = countDistribution(g.markets.map(m => m.p));
    states = states.flatMap(s => dist.map((q, k) => ({ counts: [...s.counts, k], prob: s.prob * q })));
  }
  return states;
}

// dist[k] = probability that exactly k of the independent events with probabilities ps happen.
function countDistribution(ps) {
  let dist = [1];
  for (const p of ps) dist = [...dist, 0].map((q, k) => q * (1 - p) + (k > 0 ? dist[k - 1] * p : 0));
  return dist;
}

// Quote odds: fair × (1 + markup), rounded to cents away from fair so a line never changes sides.
function price(m, plusEV) {
  m.fair = (1 - m.p) / m.p;
  const raw = m.fair * (1 + uniform(...(plusEV ? PLUS_EV_MARKUP : MINUS_EV_MARKUP))) * 100;
  m.odds = Math.max(1, plusEV ? Math.ceil(raw) : Math.floor(raw)) / 100;
  m.ev = m.p * (1 + m.odds) - 1;               // expected profit per $1 staked
  m.kellyFraction = Math.max(0, m.ev / m.odds); // single-bet Kelly
}

// ----- Resolving and settling a round (pure) -----
function resolve(board) {
  for (const g of board.groups) for (const m of g.markets) {
    m.outcome = pick(m.outcomes);
    m.happened = m.test(m.outcome);
  }
  board.counts = board.groups.map(g => count(g.markets, m => m.happened));
  for (const m of board.metas) m.happened = m.test(board.counts);
}

// Expected log growth of staking fraction f of the bankroll at odds b with win probability p.
const growth = (p, b, f) => p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f);

// Needs round.bankroll, round.kellyBankroll and a stake on every market.
function settle(round) {
  const markets = allMarkets(round.board);
  for (const m of markets) {
    m.pnl = m.happened ? Math.round(m.stake * m.odds) : -m.stake; // payouts round to whole dollars
    m.kelly = m.kellyFraction * round.bankroll;
    m.growth = growth(m.p, m.odds, m.stake / round.bankroll);
    m.kellyGrowth = growth(m.p, m.odds, m.kellyFraction);
  }
  round.pnl = sum(markets.map(m => m.pnl));
  round.expected = sum(markets.map(m => m.stake * m.ev));
  round.kellyExpected = sum(markets.map(m => m.kelly * m.ev));
  // The Kelly bettor stakes Kelly fractions of its own bankroll (scaled down if they add to over 100%).
  const scale = Math.min(1, 1 / sum(markets.map(m => m.kellyFraction)));
  round.kellyPnl = sum(markets.map(m => m.kellyFraction * scale * round.kellyBankroll * (m.happened ? m.odds : -1)));
}

// ----- Game state and flow -----
let game = null;  // { settings, bankroll, kellyBankroll, rounds: [] }
let round = null; // the current round: { number, bankroll, kellyBankroll, board, revealed, ... }
let timer = null;

const show = view => ['settings', 'board', 'summary'].forEach(v => $(v).hidden = v !== view);
const isLastRound = () => game.rounds.length >= game.settings.rounds || game.bankroll < 1;

function startGame(settings) {
  game = { settings, bankroll: START_BANKROLL, kellyBankroll: START_BANKROLL, rounds: [] };
  nextRound();
}

function nextRound() {
  round = { number: game.rounds.length + 1, bankroll: game.bankroll, kellyBankroll: game.kellyBankroll,
    board: makeBoard(game.settings), revealed: false };
  game.rounds.push(round);
  show('board');
  renderBoard();
  window.scrollTo(0, 0);
  document.querySelector('.stake')?.focus();
  startTimer();
}

function startTimer() {
  clearInterval(timer);
  $('timer').textContent = '';
  if (!game.settings.timer) return;
  const end = Date.now() + game.settings.seconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) placeBets();
  };
  tick();
  timer = setInterval(tick, 250);
}

function placeBets() {
  clearInterval(timer);
  const markets = allMarkets(round.board);
  for (const m of markets) m.stake = 0;
  for (const input of document.querySelectorAll('.stake')) markets[input.dataset.id].stake = stakeOf(input);
  resolve(round.board);
  settle(round);
  game.bankroll += round.pnl;
  game.kellyBankroll += round.kellyPnl;
  round.revealed = true;
  renderBoard();
  $('board-button').focus();
}

const stakeOf = input => Math.max(0, Math.floor(+input.value || 0));

// Keep stakes whole dollars and the total within the bankroll by trimming the box being edited.
function onStakeInput(e) {
  const others = sum([...document.querySelectorAll('.stake')].filter(i => i !== e.target).map(stakeOf));
  const allowed = Math.min(stakeOf(e.target), Math.floor(round.bankroll - others));
  if (e.target.value !== '' && +e.target.value !== allowed) e.target.value = allowed;
  renderTotals();
}

// ----- Rendering -----
const odds = x => `${+x.toFixed(2)}:1`;
const signClass = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';

function renderBoard() {
  const b = round.board;
  $('round-label').textContent = `Round ${round.number} of ${game.settings.rounds}`;
  $('groups').innerHTML = b.groups.map(g => `<div>
    <h3>${g.cat.name}</h3>${g.cat.note ? `<p class="note">${g.cat.note}</p>` : ''}
    ${g.markets.map(marketHtml).join('')}</div>`).join('');
  $('metas').innerHTML = b.metas.map(marketHtml).join('');
  $('board-button').textContent = !round.revealed ? 'Place bets' : isLastRound() ? 'See summary' : 'Next round';
  renderTotals();
}

function renderTotals() {
  $('bankroll').textContent = money(game.bankroll);
  if (round.revealed) {
    $('totals').innerHTML = `Round P&amp;L <b class="${signClass(round.pnl)}">${money(round.pnl, true)}</b>`;
  } else {
    const staked = sum([...document.querySelectorAll('.stake')].map(stakeOf));
    $('totals').innerHTML = `Staked <b>${money(staked)}</b> Remaining <b>${money(round.bankroll - staked)}</b>`;
  }
}

function marketHtml(m) {
  if (!round.revealed) {
    return `<div class="market"><p>${m.text}</p>
      <p class="line">pays <b>${odds(m.odds)}</b>
        <input class="stake" type="number" min="0" step="1" placeholder="0" data-id="${m.id}" aria-label="Stake"></p></div>`;
  }
  const plus = m.ev > 0;
  const prob = m.meta ? pct(m.p, 1) : `${m.wins}/${m.total} = ${pct(m.p, 1)}`;
  const drawn = m.meta
    ? 'Events: ' + round.board.groups.map((g, i) => `${g.cat.name} ${round.board.counts[i]}`).join(' · ')
    : `<span class="outcome">${m.cat.show(m.outcome)}</span>`;
  return `<div class="market${plus ? ' plus' : ''}"><p>${m.text}</p>
    <p>pays <b>${odds(m.odds)}</b> · fair ${odds(m.fair)} · p ${prob}</p>
    <p>${drawn} → ${m.happened ? 'happened' : 'did not happen'}</p>
    <p class="${plus ? 'pos' : 'neg'}">${plus ? 'Above' : 'Below'} fair: ${pct(m.ev, 0, true)} a dollar${plus ? ` · Kelly ${money(Math.round(m.kelly))}` : ''}</p>
    <p>Your stake ${money(m.stake)}${m.stake ? ` → <span class="${signClass(m.pnl)}">${money(m.pnl, true)}</span>` : ''}</p></div>`;
}

function showSummary() {
  const markets = game.rounds.flatMap(r => allMarkets(r.board).map(m => ({ r, m })));
  const yourGrowth = sum(markets.map(x => x.m.growth));
  const kellyGrowth = sum(markets.map(x => x.m.kellyGrowth));
  const score = yourGrowth / kellyGrowth;
  const scoreText = Number.isFinite(score) ? pct(score) : '−∞';
  const expected = sum(game.rounds.map(r => r.expected)), kellyExpected = sum(game.rounds.map(r => r.kellyExpected));
  const compounded = g => money(START_BANKROLL * (Math.exp(g) - 1), true);
  const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  const signed = x => `<span class="${signClass(x)}">${money(x, true)}</span>`;

  $('summary').innerHTML = `
    <h2>Summary</h2>
    <p>Growth score: <b>${scoreText}</b> of Kelly</p>
    <table>
      <tr><th></th><th>You</th><th>Kelly</th></tr>
      ${row(['Final bankroll', money(game.bankroll), money(game.kellyBankroll)])}
      ${row(['Actual profit', signed(game.bankroll - START_BANKROLL), signed(game.kellyBankroll - START_BANKROLL)])}
      ${row(['Expected profit', signed(expected), signed(kellyExpected)])}
      ${row(['Expected growth, compounded', compounded(yourGrowth), compounded(kellyGrowth)])}
    </table>
    <p class="note">The Kelly column stakes single-bet Kelly on every +EV market. Its bankroll uses the same draws as yours;
      its expected profit is sized on your bankroll at the start of each round. Expected growth sums
      p·ln(1 + f·b) + (1 − p)·ln(1 − f) over every bet; Kelly maximizes it.</p>
    <h3>Rounds</h3>
    <table>
      <tr><th>Round</th><th>Start bankroll</th><th>Staked</th><th>Expected profit</th><th>Kelly expected</th><th>P&amp;L</th></tr>
      ${game.rounds.map(r => row([r.number, money(r.bankroll), money(sum(allMarkets(r.board).map(m => m.stake))),
        signed(r.expected), signed(r.kellyExpected), signed(r.pnl)])).join('')}
    </table>
    <h3>Bet sizing (every market you bet on, and every +EV market)</h3>
    <table>
      <tr><th>Round</th><th>Market</th><th>Pays</th><th>Fair</th><th>Edge</th><th>Stake</th><th>Kelly</th><th>× Kelly</th><th>Result</th><th>P&amp;L</th></tr>
      ${markets.filter(x => x.m.stake > 0 || x.m.ev > 0).map(({ r, m }) => row([
        r.number, m.text, odds(m.odds), odds(m.fair), `<span class="${signClass(m.ev)}">${pct(m.ev, 0, true)}</span>`,
        money(m.stake), money(Math.round(m.kelly)),
        m.ev > 0 ? `${(m.stake / m.kelly).toFixed(1)}×` : '<span class="neg">should be $0</span>',
        m.happened ? 'happened' : 'missed', signed(m.pnl)])).join('')}
    </table>
    <p><button id="play-again">Play again</button></p>`;
  $('play-again').onclick = showSettings;
  save('bb-history', [...load('bb-history', []), { date: new Date().toLocaleDateString(), rounds: game.rounds.length,
    bankroll: game.bankroll, kellyBankroll: game.kellyBankroll, score: Number.isFinite(score) ? score : null }]);
  $('round-label').textContent = '';
  $('timer').textContent = '';
  show('summary');
  window.scrollTo(0, 0);
}

// ----- Settings view -----
function showSettings() {
  const s = { ...DEFAULT_SETTINGS, ...load('bb-settings', {}) };
  const f = $('settings-form');
  $('category-boxes').innerHTML = CATEGORIES.map(c => `<label><input type="checkbox" name="categories" value="${c.id}"
    ${s.categories.includes(c.id) ? 'checked' : ''}> ${c.name}</label>`).join('');
  f.rounds.value = s.rounds;
  f.perCategory.value = s.perCategory;
  f.metaCount.value = s.metaCount;
  f.timer.checked = s.timer;
  f.seconds.value = s.seconds;

  const history = load('bb-history', []).slice().reverse();
  $('history').innerHTML = !history.length ? '<p class="note">No games yet.</p>' : `<table>
    <tr><th>Date</th><th>Rounds</th><th>Final bankroll</th><th>Kelly bankroll</th><th>Growth score</th></tr>
    ${history.map(h => `<tr><td>${h.date}</td><td>${h.rounds}</td><td>${money(h.bankroll)}</td>
      <td>${money(h.kellyBankroll)}</td><td>${h.score === null ? '−∞' : pct(h.score)}</td></tr>`).join('')}</table>`;
  $('round-label').textContent = '';
  show('settings');
}

function readSettings() {
  const f = $('settings-form');
  return {
    categories: [...f.querySelectorAll('[name=categories]:checked')].map(x => x.value),
    rounds: +f.rounds.value, perCategory: +f.perCategory.value, metaCount: +f.metaCount.value,
    timer: f.timer.checked, seconds: +f.seconds.value,
  };
}

// ----- Wiring (skipped when betting-board-check.html loads this file) -----
if ($('settings-form')) {
  $('settings-form').onsubmit = e => {
    e.preventDefault();
    const settings = readSettings();
    if (settings.categories.length < 3) return alert('Check at least 3 categories.');
    save('bb-settings', settings);
    startGame(settings);
  };
  $('board').oninput = onStakeInput;
  $('board').onsubmit = e => { // Enter or the button: place bets, then go to the next round or the summary
    e.preventDefault();
    if (!round.revealed) placeBets();
    else if (isLastRound()) showSummary();
    else nextRound();
  };
  showSettings();
}
