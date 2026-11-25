// Betting board market data. Data only: the game logic lives in betting-board.js.
//
// A market is { text, outcomes, test }:
//   outcomes: every equally likely outcome, from one of the enumerators below
//   test(outcome): true if the event happens
// Its probability is counted exactly from `outcomes`, so no hand math is needed.
//
// A template is a function that draws random numbers and returns a market.
// Every number that changes the test must appear in the text.
// Draws whose probability falls outside MARKET_P_RANGE are re-rolled by the game.

// ----- Enumerators: every equally likely outcome, built once and cached -----
const outcomeCache = {};
const memo = (key, make) => outcomeCache[key] ??= make();

// All n-tuples of values, with replacement.
function tuples(values, n) {
  let out = [[]];
  for (let i = 0; i < n; i++) out = out.flatMap(t => values.map(v => [...t, v]));
  return out;
}
// All ordered draws of n items without replacement (items are distinct by position).
function draws(items, n) {
  if (n === 0) return [[]];
  return items.flatMap((item, i) =>
    draws([...items.slice(0, i), ...items.slice(i + 1)], n - 1).map(rest => [item, ...rest]));
}

const DECK = ['♠', '♥', '♦', '♣'].flatMap(suit => range(2, 14).map(rank => ({ rank, suit })));
const URN = ['red', 'red', 'red', 'red', 'red', 'blue', 'blue', 'blue', 'green', 'green'];

const coins = n => memo('coins' + n, () => tuples(['H', 'T'], n));
const dice = n => memo('dice' + n, () => tuples(range(1, 6), n));
const cards = n => memo('cards' + n, () => draws(DECK, n));
const ints = (hi, n = 1) => memo(`ints${hi}x${n}`, () => tuples(range(1, hi), n)); // integers 1..hi
const spins = n => memo('spins' + n, () => tuples(range(0, 36), n));
const balls = n => memo('balls' + n, () => draws(URN, n));

// ----- Small helpers for market text and tests -----
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
const heads = c => count(c, x => x === 'H');
const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_WORDS = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
const rankName = r => RANK_NAMES[r] ?? String(r);
const SUIT_WORDS = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' };
const isRedSuit = c => c.suit === '♥' || c.suit === '♦';
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const isRed = x => RED_NUMBERS.includes(x);
const isPrime = x => x > 1 && range(2, Math.floor(Math.sqrt(x))).every(d => x % d);
const allDifferent = arr => new Set(arr).size === arr.length;
const DIE_FACES = '⚀⚁⚂⚃⚄⚅';

// ----- Categories -----
// { id, name, noun (used in meta market text), note (shown under the heading), show(outcome) -> html, markets }
const CATEGORIES = [
  {
    id: 'coins', name: 'Coins', noun: 'coin',
    show: c => c.join(' '),
    markets: [
      () => { const n = randInt(3, 8), m = randInt(0, n);
        return { text: m === n ? `${n} coins all land heads` : `Exactly ${plural(m, 'head')} in ${n} coins`,
          outcomes: coins(n), test: c => heads(c) === m }; },
      () => { const n = randInt(3, 8), m = randInt(1, n);
        return { text: m === n ? `${n} coins all land heads` : `At least ${plural(m, 'head')} in ${n} coins`,
          outcomes: coins(n), test: c => heads(c) >= m }; },
      () => { const n = randInt(2, 6);
        return { text: `${n} coins land the same way`, outcomes: coins(n), test: c => heads(c) % n === 0 }; },
      { text: '5 coins alternate heads and tails (HTHTH or THTHT)', outcomes: coins(5), test: c => c.every((x, i) => i === 0 || x !== c[i - 1]) },
      { text: '5 coins never show two heads in a row', outcomes: coins(5), test: c => !c.join('').includes('HH') },
      { text: '4 coins show more heads than tails', outcomes: coins(4), test: c => heads(c) > 2 },
      { text: '6 coins show more heads than tails', outcomes: coins(6), test: c => heads(c) > 3 },
    ],
  },
  {
    id: 'dice', name: 'Dice', noun: 'dice',
    show: d => d.map(x => DIE_FACES[x - 1]).join(' '),
    markets: [
      () => { const k = randInt(2, 12);
        return { text: `Two dice sum to ${k}`, outcomes: dice(2), test: d => sum(d) === k }; },
      () => { const k = randInt(3, 12);
        return { text: `Two dice sum to ${k} or more`, outcomes: dice(2), test: d => sum(d) >= k }; },
      () => { const k = randInt(3, 18);
        return { text: `Three dice sum to ${k}`, outcomes: dice(3), test: d => sum(d) === k }; },
      () => { const k = randInt(1, 6), n = randInt(1, 4);
        return { text: n === 1 ? `One die shows a ${k}` : `At least one ${k} in ${n} dice`, outcomes: dice(n), test: d => d.includes(k) }; },
      () => { const k = randInt(2, 6);
        return { text: `One die shows ${k} or higher`, outcomes: dice(1), test: d => d[0] >= k }; },
      () => { const n = randInt(2, 4);
        return { text: `${n} dice show different numbers`, outcomes: dice(n), test: allDifferent }; },
      { text: 'Two dice show doubles', outcomes: dice(2), test: d => d[0] === d[1] },
      { text: 'Two dice differ by exactly 1', outcomes: dice(2), test: d => Math.abs(d[0] - d[1]) === 1 },
      { text: 'The product of two dice is even', outcomes: dice(2), test: d => d[0] * d[1] % 2 === 0 },
      { text: 'One of two dice is exactly double the other', outcomes: dice(2), test: d => d[0] === 2 * d[1] || d[1] === 2 * d[0] },
      { text: 'Three dice form a run, like 2-3-4 in any order', outcomes: dice(3), test: d => allDifferent(d) && Math.max(...d) - Math.min(...d) === 2 },
    ],
  },
  {
    id: 'cards', name: 'Cards', noun: 'card',
    note: 'Drawn from a full 52-card deck without replacement. Aces high.',
    show: cs => cs.map(c => `<span class="${isRedSuit(c) ? 'red' : ''}">${rankName(c.rank)}${c.suit}</span>`).join(' '),
    markets: [
      () => { const r = randInt(7, 13);
        return { text: `One card is ${rankName(r)} or higher`, outcomes: cards(1), test: c => c[0].rank >= r }; },
      () => { const s = pick(Object.keys(SUIT_WORDS)), w = SUIT_WORDS[s], n = randInt(1, 3);
        return { text: n === 1 ? `One card is a ${w}` : `${n} cards are all ${w}s`, outcomes: cards(n), test: c => c.every(x => x.suit === s) }; },
      () => { const r = randInt(2, 14), n = randInt(2, 3);
        return { text: `At least one ${RANK_WORDS[r] ?? r} in ${n} cards`, outcomes: cards(n), test: c => c.some(x => x.rank === r) }; },
      { text: 'One card is the ace of spades', outcomes: cards(1), test: c => c[0].rank === 14 && c[0].suit === '♠' },
      { text: 'One card is a face card (J, Q, K)', outcomes: cards(1), test: c => c[0].rank >= 11 && c[0].rank <= 13 },
      { text: 'One card is a red face card', outcomes: cards(1), test: c => isRedSuit(c[0]) && c[0].rank >= 11 && c[0].rank <= 13 },
      { text: 'Two cards are the same suit', outcomes: cards(2), test: c => c[0].suit === c[1].suit },
      { text: 'Two cards are the same color', outcomes: cards(2), test: c => isRedSuit(c[0]) === isRedSuit(c[1]) },
      { text: 'Two cards are a pair', outcomes: cards(2), test: c => c[0].rank === c[1].rank },
      { text: 'Three cards are all different suits', outcomes: cards(3), test: c => allDifferent(c.map(x => x.suit)) },
    ],
  },
  {
    id: 'integers', name: 'Random integers', noun: 'integer',
    note: 'Each integer is drawn uniformly at random.',
    show: xs => xs.join(', '),
    markets: [
      () => { const hi = pick([20, 50, 100, 1000]), k = randInt(2, 12);
        return { text: `An integer from 1 to ${hi} is divisible by ${k}`, outcomes: ints(hi), test: ([x]) => x % k === 0 }; },
      () => { const hi = randInt(4, 20);
        return { text: `Two integers from 1 to ${hi} are equal`, outcomes: ints(hi, 2), test: ([x, y]) => x === y }; },
      () => { const hi = randInt(6, 10), k = randInt(hi, 2 * hi - 2);
        return { text: `Two integers from 1 to ${hi} sum to more than ${k}`, outcomes: ints(hi, 2), test: ([x, y]) => x + y > k }; },
      { text: 'An integer from 1 to 100 is prime', outcomes: ints(100), test: ([x]) => isPrime(x) },
      { text: 'An integer from 1 to 100 is a perfect square', outcomes: ints(100), test: ([x]) => Number.isInteger(Math.sqrt(x)) },
      { text: 'An integer from 1 to 100 contains the digit 7', outcomes: ints(100), test: ([x]) => String(x).includes('7') },
      { text: 'The digits of an integer from 1 to 100 sum to 10', outcomes: ints(100), test: ([x]) => sum(String(x).split('').map(Number)) === 10 },
      { text: 'An integer from 1 to 50 is a Fibonacci number (1, 2, 3, 5, 8, ...)', outcomes: ints(50), test: ([x]) => [1, 2, 3, 5, 8, 13, 21, 34].includes(x) },
      { text: 'The product of two integers from 1 to 10 is odd', outcomes: ints(10, 2), test: ([x, y]) => x * y % 2 === 1 },
    ],
  },
  {
    id: 'roulette', name: 'Roulette', noun: 'roulette',
    note: 'European wheel: 0 to 36, with 18 red, 18 black and 0 (neither).',
    show: xs => xs.map(x => isRed(x) ? `<span class="red">${x}</span>` : x).join(', '),
    markets: [
      () => { const n = randInt(1, 3);
        return { text: n === 1 ? 'One spin lands red' : `${n} spins all land red`, outcomes: spins(n), test: s => s.every(isRed) }; },
      () => { const n = randInt(1, 3);
        return { text: n === 1 ? 'One spin lands on 0' : `At least one of ${n} spins lands on 0`, outcomes: spins(n), test: s => s.includes(0) }; },
      () => { const width = randInt(3, 18), lo = randInt(1, 37 - width), hi = lo + width - 1;
        return { text: `One spin lands on a number from ${lo} to ${hi}`, outcomes: spins(1), test: ([x]) => x >= lo && x <= hi }; },
      () => { const d = randInt(0, 2), lo = 12 * d + 1, hi = lo + 11, n = randInt(1, 2);
        const where = `the ${['first', 'second', 'third'][d]} dozen (${lo} to ${hi})`;
        return { text: n === 1 ? `One spin lands in ${where}` : `${n} spins all land in ${where}`, outcomes: spins(n), test: s => s.every(x => x >= lo && x <= hi) }; },
      { text: 'One spin lands on an odd number', outcomes: spins(1), test: ([x]) => x % 2 === 1 },
      { text: 'One spin lands on a prime number', outcomes: spins(1), test: ([x]) => isPrime(x) },
      { text: 'Two spins land on the same color (red or black)', outcomes: spins(2), test: ([x, y]) => x > 0 && y > 0 && isRed(x) === isRed(y) },
      { text: 'Two spins land on the same number', outcomes: spins(2), test: ([x, y]) => x === y },
      { text: 'At least one of two spins lands in the third column (3, 6, ..., 36)', outcomes: spins(2), test: s => s.some(x => x > 0 && x % 3 === 0) },
    ],
  },
  {
    id: 'urn', name: 'Urn', noun: 'urn',
    note: 'An urn holds 5 red, 3 blue and 2 green balls. Draws are without replacement.',
    show: bs => bs.map(b => `<span class="${b}">${b}</span>`).join(' '),
    markets: [
      () => { const n = randInt(2, 4), k = randInt(0, n), color = pick(['red', 'blue', 'green']);
        return { text: `Of ${n} balls drawn, exactly ${k} ${k === 1 ? 'is' : 'are'} ${color}`, outcomes: balls(n), test: b => count(b, x => x === color) === k }; },
      () => { const n = randInt(1, 3), color = pick(['red', 'blue', 'green']);
        return { text: n === 1 ? `One ball drawn is ${color}` : `${n} balls drawn are all ${color}`, outcomes: balls(n), test: b => b.every(x => x === color) }; },
      { text: 'Two balls drawn are the same color', outcomes: balls(2), test: ([a, b]) => a === b },
      { text: 'Two balls drawn are red, then blue (in that order)', outcomes: balls(2), test: ([a, b]) => a === 'red' && b === 'blue' },
      { text: 'Three balls drawn are all different colors', outcomes: balls(3), test: allDifferent },
      { text: 'Three balls drawn include both greens', outcomes: balls(3), test: b => count(b, x => x === 'green') === 2 },
      { text: 'The third of three balls drawn is green', outcomes: balls(3), test: b => b[2] === 'green' },
    ],
  },
];

// ----- Meta markets on the board as a whole -----
// Each template gets the board's groups (each { cat, markets }) and returns candidate markets
// { text, test(counts) }, where counts[i] is how many events in group i happened.
const META_TEMPLATES = [
  groups => { // count of all events
    const n = sum(groups.map(g => g.markets.length));
    return range(0, n).flatMap(k => [
      { text: `At most ${k} of the ${n} events above happen`, test: c => sum(c) <= k },
      { text: `At least ${k} of the ${n} events above happen`, test: c => sum(c) >= k },
      { text: `Exactly ${k} of the ${n} events above happen`, test: c => sum(c) === k },
    ]);
  },
  groups => groups.flatMap((g, i) => { // count within one category (needs at least 2 events)
    const n = g.markets.length, what = `${g.cat.noun} events`;
    return n < 2 ? [] : [
      { text: `None of the ${n} ${what} happen`, test: c => c[i] === 0 },
      { text: `All ${n} ${what} happen`, test: c => c[i] === n },
      ...range(1, n - 1).flatMap(k => [
        { text: `At least ${k} of the ${n} ${what} happen`, test: c => c[i] >= k },
        { text: `Exactly ${k} of the ${n} ${what} happen`, test: c => c[i] === k },
      ]),
    ];
  }),
  groups => groups.flatMap((a, i) => groups.flatMap((b, j) => i === j ? [] : // compare two categories
    [{ text: `More ${a.cat.noun} events than ${b.cat.noun} events happen`, test: c => c[i] > c[j] }])),
  groups => { // parity
    const n = sum(groups.map(g => g.markets.length));
    return [
      { text: `An even number of the ${n} events above happen`, test: c => sum(c) % 2 === 0 },
      { text: `An odd number of the ${n} events above happen`, test: c => sum(c) % 2 === 1 },
    ];
  },
];
