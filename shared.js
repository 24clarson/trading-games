// Small generic helpers shared by every page. Game-specific code does not belong here.

const $ = id => document.getElementById(id);

// ----- Arrays and numbers -----
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); // inclusive
const sum = arr => arr.reduce((a, b) => a + b, 0);
const count = (arr, test) => arr.filter(x => test(x)).length;

// ----- Randomness -----
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)); // inclusive
const uniform = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, k) => shuffle(arr).slice(0, k);

function shuffle(arr) { // returns a shuffled copy
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// weightedPick({ a: 1, b: 3 }) returns 'b' three times as often as 'a'. Keys come back as strings.
function weightedPick(weights) {
  let r = Math.random() * sum(Object.values(weights));
  for (const [key, w] of Object.entries(weights)) if ((r -= w) < 0) return key;
  return Object.keys(weights).at(-1);
}

// ----- localStorage (JSON). Never throws: storage can be blocked or full. -----
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ----- Formatting -----
// Whole dollars: money(1234.4) = "$1,234", money(-40) = "−$40", money(5, true) = "+$5"
function money(x, signed = false) {
  const r = Math.round(x);
  return (r < 0 ? '−' : signed && r > 0 ? '+' : '') + '$' + Math.abs(r).toLocaleString('en-US');
}
// pct(0.1234, 1) = "12.3%", pct(0.33, 0, true) = "+33%"
function pct(x, digits = 0, signed = false) {
  const s = (x * 100).toFixed(digits);
  return (signed && x > 0 ? '+' : '') + s.replace('-', '−') + '%';
}
