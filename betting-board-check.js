// Self-check for the betting board, shown by betting-board-check.html. Uses the game's own code.

const TEMPLATE_DRAWS = 500; // draws per template
const BOARDS = 500;         // boards per settings combination
const SIMS = 20000;         // simulated rounds per board when comparing with exact probabilities

const lines = [];
let problems = 0;
function log(text, problem = false) {
  lines.push(problem ? `<span class="neg">${text}</span>` : text);
  if (problem) problems++;
}

// Every fixed market's exact probability, and a sample of each template's markets.
function checkMarkets() {
  for (const cat of CATEGORIES) {
    log(`\n${cat.name}: ${cat.markets.length} entries (at least 6 needed)`, cat.markets.length < 6);
    const texts = new Set();
    for (const entry of cat.markets) {
      if (typeof entry !== 'function') {
        const wins = count(entry.outcomes, entry.test), total = entry.outcomes.length, p = wins / total;
        log(`  ${entry.text}: ${wins}/${total} = ${pct(p, 2)}, fair ${odds((1 - p) / p)}`,
          !inRange(p, MARKET_P_RANGE) || texts.has(entry.text));
        texts.add(entry.text);
        continue;
      }
      const seen = {}; // text -> p
      let ok = 0;
      for (let i = 0; i < TEMPLATE_DRAWS; i++) {
        const m = entry(), p = count(m.outcomes, m.test) / m.outcomes.length;
        if (seen[m.text] !== undefined && seen[m.text] !== p) log(`  Same text, different p (a number is missing from the text): ${m.text}`, true);
        seen[m.text] = p;
        if (inRange(p, MARKET_P_RANGE)) ok++;
      }
      const usable = Object.keys(seen).filter(t => inRange(seen[t], MARKET_P_RANGE));
      const low = ok < TEMPLATE_DRAWS / 2;
      log(`  Template: ${usable.length} usable texts, ${pct(ok / TEMPLATE_DRAWS)} of draws in range${low ? ' (narrow its number ranges)' : ''}`, low);
      for (const t of sample(usable, 3)) log(`    e.g. ${t}: ${pct(seen[t], 2)}`);
    }
  }
}

// Boards for a few settings: +EV counts against PLUS_EV_WEIGHTS, and boards that came up short.
function checkBoards() {
  const target = Object.entries(PLUS_EV_WEIGHTS).map(([k, w]) => `${k}: ${pct(w)}`).join(', ');
  for (const s of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, perCategory: 1, metaCount: 2 }, { ...DEFAULT_SETTINGS, perCategory: 6, metaCount: 2 }]) {
    const plusCounts = {};
    let short = 0;
    for (let i = 0; i < BOARDS; i++) {
      const board = makeBoard(s), plus = count(allMarkets(board), m => m.ev > 0);
      plusCounts[plus] = (plusCounts[plus] || 0) + 1;
      if (board.metas.length < s.metaCount || board.groups.some(g => g.markets.length < s.perCategory)) short++;
    }
    log(`\n${BOARDS} boards with ${s.perCategory} per category and ${s.metaCount} meta`);
    log(`  +EV markets per board: ${Object.entries(plusCounts).map(([k, n]) => `${k}: ${pct(n / BOARDS)}`).join(', ')} (target ${target})`);
    log(`  Boards with fewer markets than asked for: ${short}`, short > BOARDS / 100);
  }
}

// Simulated frequencies against exact probabilities. This catches mistakes in the meta market math.
function checkSimulation() {
  log(`\nSimulated vs exact probability, ${SIMS} rounds per board (|z| above 4 is flagged)`);
  for (let b = 0; b < 3; b++) {
    const board = makeBoard({ ...DEFAULT_SETTINGS, metaCount: 2 }), markets = allMarkets(board);
    const hits = markets.map(() => 0);
    for (let i = 0; i < SIMS; i++) {
      resolve(board);
      markets.forEach((m, k) => hits[k] += m.happened);
    }
    markets.forEach((m, k) => {
      const f = hits[k] / SIMS, z = (f - m.p) / Math.sqrt(m.p * (1 - m.p) / SIMS);
      log(`  ${m.text}: exact ${pct(m.p, 2)}, simulated ${pct(f, 2)}, z ${z.toFixed(1)}`, Math.abs(z) > 4);
    });
  }
}

setTimeout(() => { // let the page show "Running checks" first
  checkMarkets();
  checkBoards();
  checkSimulation();
  $('status').innerHTML = problems ? `<b class="neg">${plural(problems, 'problem')} found (in red below).</b>` : '<b class="pos">All checks passed.</b>';
  $('report').innerHTML = lines.join('\n');
}, 50);
