// Password Forge estimator: a small, deterministic, explainable guess-count model. Pure; no DOM.
//
// Educational approximation, in the spirit of pattern-based meters such as zxcvbn but much
// simpler. It splits the password into the cheapest set of pieces a smart cracker would guess
// (common passwords, words, word-like strings, keyboard walks, sequences, repeats, years, dates,
// separators, and random leftovers), multiplies each piece's guess count, and converts guesses to
// time under four attacker models. Every number below is a named constant so the debrief and the
// design doc can explain it. See docs/design/PASSWORD_FORGE.md for the simplifications.
//
// Privacy: nothing here stores, logs or sends the password. Callers keep it in memory only.

import { BREACHES, COMMON_PASSWORDS, COMMON_WORDS } from "./wordlists";

export const MAX_LENGTH = 64;
export const YEAR_SECONDS = 31_557_600;

// Guess counts per piece.
export const COMMON_WORD_GUESSES = 5_000; // in the attacker's top-words list
export const WORDLIKE_GUESSES = 100_000; // any dictionary word: a full wordlist
export const YEAR_GUESSES = 100; // 1950–2049
export const DATE_GUESSES = 36_600; // ~366 days × 100 years
export const SEPARATOR_GUESSES = 6; // space - _ . , /
export const ODD_CHAR_GUESSES = 33; // any symbol standing in for one letter of a known word
export const KEYBOARD_STARTS = 47; // keys a walk can start on
export const KEYBOARD_TURN_FACTOR = 4; // each change of direction
export const BREACH_CORPUS_GUESSES = 1e9; // a breached password is in the list crackers try first

// Attacker speeds, guesses per second.
export const ONLINE_RATE = 100 / 3600; // live login page that allows ~100 guesses an hour
export const OFFLINE_RATE = 1e11; // GPU rig against a fast, unsalted hash (e.g. MD5, NTLM)

export type SegmentKind =
  | "common-password"
  | "word"
  | "wordlike"
  | "keyboard"
  | "sequence"
  | "repeat"
  | "year"
  | "date"
  | "separator"
  | "random";

export const KIND_LABEL: Readonly<Record<SegmentKind, string>> = {
  "common-password": "Common password",
  word: "Common word",
  wordlike: "Dictionary word",
  keyboard: "Keyboard walk",
  sequence: "Sequence",
  repeat: "Repeat",
  year: "Year",
  date: "Date",
  separator: "Separator",
  random: "Random",
};

export type Segment = Readonly<{
  kind: SegmentKind;
  token: string;
  start: number;
  end: number;
  log10: number; // log10 of guesses for this piece
  note: string; // plain-language working
  subs: readonly string[]; // letter swaps undone, e.g. "@→a"
}>;

export type AttackerId = "online" | "brute" | "smart" | "stuffing";

export type AttackerResult = Readonly<{ id: AttackerId; name: string; detail: string; seconds: number; label: string }>;

export type Tier = "breached" | "instant" | "weak" | "fair" | "strong";

export type Analysis = Readonly<{
  length: number;
  pool: number;
  log10: number; // smart cracker guesses, log10 (after any breach shortcut)
  patternLog10: number; // smart cracker guesses from patterns alone
  naiveLog10: number; // pool ^ length
  segments: readonly Segment[];
  breach: null | Readonly<{ source: string; exact: boolean; match: "breach" | "common" }>;
  attackers: readonly AttackerResult[];
  effectiveSeconds: number; // fastest realistic attacker (smart offline or stuffing)
  tier: Tier;
  findings: readonly string[];
}>;

const LOG2 = Math.log10(2);
const PASSWORD_RANK = new Map(COMMON_PASSWORDS.map((pw, index) => [pw, index + 1]));
const WORDS = new Set(COMMON_WORDS);
const BREACH_EXACT = new Map(BREACHES.map((entry) => [entry.password, entry.source]));
const SEPARATORS = " -_.,/";
const VOWELS = "aeiouy";

// Consonant pairs common inside English words. Any other consonant pair marks a string as not
// word-like (so random letters are not mistaken for words).
const CLUSTERS = new Set(
  (
    "bl br ch ck cl cr ct dr ds fl fr ft gh gl gr gs kl ks ld lf lk ll lm lp ls lt lv lb lc mb mm mp ms nc nd nf ng nk nl nn ns nt nv " +
    "ph pl pp pr ps pt rb rc rd rf rg rk rl rm rn rp rr rs rt rv sc sh sk sl sm sn sp sq ss st sw th tr ts tt tw wh wl wn wr ws xt " +
    "bb cc dd ff gg"
  ).split(" "),
);
// Three-consonant runs allowed inside a word-like string.
const TRIGRAMS = new Set("rch nch tch ght sch str spr scr thr shr ckl ndl ntr nst rst lls nds nts mpl mbl ngl ngs ldr ltr phr chr ttl ddl ppl bbl ffl ggl ndr".split(" "));

// Letter swaps crackers try automatically. Ambiguous ones list both readings.
const LEET: Readonly<Record<string, readonly string[]>> = {
  "4": ["a"],
  "@": ["a"],
  "8": ["b"],
  "(": ["c"],
  "3": ["e"],
  "6": ["g"],
  "9": ["g"],
  "1": ["i", "l"],
  "!": ["i"],
  "|": ["i", "l"],
  "0": ["o"],
  $: ["s"],
  "5": ["s"],
  "7": ["t"],
  "+": ["t"],
};

export function poolOf(text: string): number {
  let pool = 0;
  if (/[a-z]/.test(text)) pool += 26;
  if (/[A-Z]/.test(text)) pool += 26;
  if (/[0-9]/.test(text)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(text)) pool += 33;
  return Math.max(pool, 1);
}

function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

// Capitalisation an attacker tries: none ×1; first or last letter, or all caps ×2; otherwise
// the number of ways to place that many capitals.
function caseFactor(token: string): number {
  const letters = token.replace(/[^a-zA-Z]/g, "");
  const upper = (letters.match(/[A-Z]/g) ?? []).length;
  const lower = letters.length - upper;
  if (upper === 0) return 1;
  if (lower === 0) return 2;
  if (upper === 1 && (/^[A-Z]/.test(letters) || /[A-Z]$/.test(letters))) return 2;
  let sum = 0;
  for (let i = 1; i <= Math.min(upper, lower); i++) sum += choose(upper + lower, i);
  return sum;
}

function unleetVariants(lower: string): { text: string; subs: string[] }[] {
  const out = [{ text: lower, subs: [] as string[] }];
  if (![...lower].some((ch) => LEET[ch])) return out;
  for (const pickLast of [false, true]) {
    const subs = new Set<string>();
    const text = [...lower]
      .map((ch) => {
        const options = LEET[ch];
        if (!options) return ch;
        const to = pickLast ? options[options.length - 1] : options[0];
        subs.add(`${ch}→${to}`);
        return to;
      })
      .join("");
    if (!out.some((entry) => entry.text === text)) out.push({ text, subs: [...subs] });
  }
  return out;
}

// Longer pronounceable strings are rarer, so each letter past 8 multiplies by 10.
export function wordlikeGuesses(text: string): number {
  return WORDLIKE_GUESSES * 10 ** Math.max(0, text.length - 8);
}

export function isWordlike(text: string): boolean {
  if (!/^[a-z]{5,11}$/.test(text)) return false;
  const vowels = [...text].filter((ch) => VOWELS.includes(ch)).length;
  if (vowels / text.length < 0.25 || vowels / text.length > 0.7) return false;
  if (/[^aeiouy]{4}/.test(text) || /[aeiouy]{3}/.test(text) || /(.)\1\1/.test(text)) return false;
  if (/q(?!u)/.test(text)) return false;
  for (const run of text.match(/[^aeiouy]{3}/g) ?? []) if (!TRIGRAMS.has(run)) return false;
  for (let i = 1; i < text.length; i++) {
    const a = text[i - 1];
    const b = text[i];
    if (!VOWELS.includes(a) && !VOWELS.includes(b) && !CLUSTERS.has(a + b)) return false;
  }
  return true;
}

type Candidate = { start: number; end: number; kind: SegmentKind; log10: number; note: string; subs: string[] };

function fmtCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function dictionaryCandidates(pw: string, out: Candidate[]): void {
  const n = pw.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j <= Math.min(n, i + 20); j++) {
      const token = pw.slice(i, j);
      const realLetters = (token.match(/[a-zA-Z]/g) ?? []).length;
      if (realLetters === 0) continue;
      let best: Candidate | null = null;
      for (const variant of unleetVariants(token.toLowerCase())) {
        if (variant.subs.length && realLetters < 2) continue;
        const forms: [string, boolean][] = [[variant.text, false]];
        const reversed = [...variant.text].reverse().join("");
        if (variant.text.length >= 4 && reversed !== variant.text) forms.push([reversed, true]);
        for (const [text, isReversed] of forms) {
          let kind: SegmentKind | null = null;
          let base = 0;
          let what = "";
          const rank = PASSWORD_RANK.get(text);
          if (rank) {
            kind = "common-password";
            base = rank;
            what = `#${rank} on the common-passwords list`;
          } else if (WORDS.has(text)) {
            kind = "word";
            base = COMMON_WORD_GUESSES;
            what = `in the top ${fmtCount(COMMON_WORD_GUESSES)} words`;
          } else if (!isReversed && (!variant.subs.length || realLetters / token.length >= 0.7) && isWordlike(text)) {
            kind = "wordlike";
            base = wordlikeGuesses(text);
            what = `looks like a word from a full wordlist (~${fmtCount(base)} candidates)`;
          }
          if (!kind) continue;
          const caps = caseFactor(token);
          const log10 = Math.log10(base) + Math.log10(caps) + variant.subs.length * LOG2 + (isReversed ? LOG2 : 0);
          if (best && best.log10 <= log10) continue;
          const parts = [what];
          if (text !== token.toLowerCase() || isReversed) parts.unshift(`reads as "${isReversed ? `${text}" backwards` : `${text}"`}`);
          if (variant.subs.length) parts.push(`swaps ${variant.subs.join(", ")} undone (×${2 ** variant.subs.length})`);
          if (caps > 1) parts.push(`capitals tried (×${fmtCount(caps)})`);
          if (isReversed) parts.push("reversed (×2)");
          best = { start: i, end: j, kind, log10, note: parts.join("; "), subs: variant.subs };
        }
      }
      // One odd character standing in for a letter ("s#nshine"): crackers try every symbol in
      // every position of their common lists, so this costs only ×ODD_CHAR_GUESSES.
      if (!best && token.length >= 4 && realLetters >= 3) {
        for (const variant of unleetVariants(token.toLowerCase())) {
          if (best) break;
          const odd = [...variant.text].map((ch, index) => (/[a-z]/.test(ch) ? -1 : index)).filter((index) => index >= 0);
          if (odd.length !== 1) continue;
          for (const letter of "abcdefghijklmnopqrstuvwxyz") {
            const text = variant.text.slice(0, odd[0]) + letter + variant.text.slice(odd[0] + 1);
            const rank = PASSWORD_RANK.get(text);
            const base = rank ?? (WORDS.has(text) ? COMMON_WORD_GUESSES : 0);
            if (!base) continue;
            const caps = caseFactor(token);
            const log10 = Math.log10(base) + Math.log10(caps) + variant.subs.length * LOG2 + Math.log10(ODD_CHAR_GUESSES);
            const parts = [`reads as "${text}"`, rank ? `#${rank} on the common-passwords list` : `in the top ${fmtCount(COMMON_WORD_GUESSES)} words`, `"${token[odd[0]]}" in place of a letter (×${ODD_CHAR_GUESSES})`];
            if (variant.subs.length) parts.push(`swaps ${variant.subs.join(", ")} undone (×${2 ** variant.subs.length})`);
            if (caps > 1) parts.push(`capitals tried (×${fmtCount(caps)})`);
            best = { start: i, end: j, kind: rank ? "common-password" : "word", log10, note: parts.join("; "), subs: [...variant.subs, `${token[odd[0]]}→${letter}`] };
            break;
          }
        }
      }
      if (best) out.push(best);
    }
  }
}

// ---------- keyboard walks ----------
type Key = { row: number; x: number; shifted: boolean };
const KEYS = new Map<string, Key>();
(
  [
    ["`1234567890-=", "~!@#$%^&*()_+", 0],
    ["qwertyuiop[]\\", "QWERTYUIOP{}|", 1.5],
    ["asdfghjkl;'", 'ASDFGHJKL:"', 1.75],
    ["zxcvbnm,./", "ZXCVBNM<>?", 2.25],
  ] as const
).forEach(([plain, shifted, offset], row) => {
  [...plain].forEach((ch, i) => KEYS.set(ch, { row, x: i + offset, shifted: false }));
  [...shifted].forEach((ch, i) => KEYS.set(ch, { row, x: i + offset, shifted: true }));
});

function step(a: string, b: string): string | null {
  const ka = KEYS.get(a);
  const kb = KEYS.get(b);
  if (!ka || !kb) return null;
  const drow = kb.row - ka.row;
  const dx = kb.x - ka.x;
  const adjacent = drow === 0 ? Math.abs(dx) === 1 : Math.abs(drow) === 1 && Math.abs(dx) <= 1;
  return adjacent ? `${drow},${Math.sign(dx)}` : null;
}

function keyboardCandidates(pw: string, out: Candidate[]): void {
  for (let i = 0; i < pw.length; i++) {
    let dir: string | null = null;
    let turns = 0;
    let shifted = KEYS.get(pw[i])?.shifted ?? false;
    for (let j = i + 1; j < pw.length; j++) {
      const d = step(pw[j - 1], pw[j]);
      if (!d) break;
      if (dir && d !== dir) turns++;
      dir = d;
      shifted ||= KEYS.get(pw[j])!.shifted;
      const len = j - i + 1;
      if (len < 4) continue;
      const log10 = Math.log10(KEYBOARD_STARTS * len) + turns * Math.log10(KEYBOARD_TURN_FACTOR) + (shifted ? LOG2 : 0);
      const note = `keyboard walk: ${len} neighbouring keys${turns ? `, ${turns} turn${turns === 1 ? "" : "s"} (×${KEYBOARD_TURN_FACTOR} each)` : " in a line"}${shifted ? ", with Shift (×2)" : ""}`;
      out.push({ start: i, end: j + 1, kind: "keyboard", log10, note, subs: [] });
    }
  }
}

// ---------- sequences ----------
function charClass(ch: string): string {
  return /[a-z]/.test(ch) ? "l" : /[A-Z]/.test(ch) ? "u" : /[0-9]/.test(ch) ? "d" : "";
}

function sequenceCandidates(pw: string, out: Candidate[]): void {
  for (let i = 0; i + 2 < pw.length; i++) {
    const cls = charClass(pw[i]);
    if (!cls) continue;
    const delta = pw.charCodeAt(i + 1) - pw.charCodeAt(i);
    if (Math.abs(delta) !== 1 || charClass(pw[i + 1]) !== cls) continue;
    let j = i + 2;
    while (j < pw.length && charClass(pw[j]) === cls && pw.charCodeAt(j) - pw.charCodeAt(j - 1) === delta) {
      j++;
      const len = j - i;
      if (len < 3) continue;
      const base = "aA10zZ9".includes(pw[i]) ? 4 : cls === "d" ? 10 : 26;
      const log10 = Math.log10(base * len) + (delta < 0 ? LOG2 : 0);
      out.push({ start: i, end: j, kind: "sequence", log10, note: `${delta < 0 ? "backwards " : ""}sequence of ${len}`, subs: [] });
    }
  }
}

// ---------- years and dates ----------
function validDate(day: number, month: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function looksLikeDate(token: string): boolean {
  const sep = token.match(/[-/.]/)?.[0];
  let parts: string[];
  if (sep) {
    parts = token.split(sep);
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return false;
  } else {
    if (!/^\d+$/.test(token)) return false;
    if (token.length === 6) parts = [token.slice(0, 2), token.slice(2, 4), token.slice(4)];
    else if (token.length === 8) {
      const ymd = [token.slice(0, 4), token.slice(4, 6), token.slice(6)];
      if (/^(19|20)/.test(ymd[0]) && validDate(+ymd[2], +ymd[1])) return true;
      parts = [token.slice(0, 2), token.slice(2, 4), token.slice(4)];
    } else return false;
  }
  const [a, b, c] = parts;
  if (a.length === 4) return /^(19|20)/.test(a) && b.length <= 2 && c.length <= 2 && validDate(+c, +b);
  if (a.length > 2 || b.length > 2 || (c.length !== 2 && c.length !== 4)) return false;
  if (c.length === 4 && !/^(19|20)/.test(c)) return false;
  return validDate(+a, +b) || validDate(+b, +a);
}

function dateCandidates(pw: string, out: Candidate[]): void {
  for (let i = 0; i < pw.length; i++) {
    const year = pw.slice(i, i + 4);
    if (/^(19[5-9]\d|20[0-4]\d)$/.test(year)) {
      out.push({ start: i, end: i + 4, kind: "year", log10: Math.log10(YEAR_GUESSES), note: `a year: about ${YEAR_GUESSES} likely years to try`, subs: [] });
    }
    for (let len = 6; len <= 10 && i + len <= pw.length; len++) {
      const token = pw.slice(i, i + len);
      if (!looksLikeDate(token)) continue;
      const sep = /[-/.]/.test(token);
      const guesses = DATE_GUESSES * (sep ? 4 : 1);
      out.push({ start: i, end: i + len, kind: "date", log10: Math.log10(guesses), note: `a date: about ${fmtCount(guesses)} likely dates${sep ? " and separators" : ""}`, subs: [] });
    }
  }
}

// ---------- repeats ----------
function repeatCandidates(pw: string, depth: number, out: Candidate[]): void {
  if (depth > 1) return;
  for (let i = 0; i < pw.length; i++) {
    for (let u = 1; u <= Math.floor((pw.length - i) / 2); u++) {
      const unit = pw.slice(i, i + u);
      let k = 1;
      while (pw.startsWith(unit, i + k * u)) k++;
      if (k < 2) continue;
      const unitLog = bestSplit(unit, depth + 1).log10;
      for (let reps = u === 1 ? 3 : 2; reps <= k; reps++) {
        out.push({ start: i, end: i + reps * u, kind: "repeat", log10: unitLog + Math.log10(reps), note: `"${unit}" repeated ${reps} times: the cracker guesses "${unit}" once, then ×${reps}`, subs: [] });
      }
    }
  }
}

// ---------- the cheapest split ----------
function bestSplit(pw: string, depth = 0): { log10: number; segments: Segment[] } {
  const n = pw.length;
  if (n === 0) return { log10: 0, segments: [] };
  const pool = poolOf(pw);
  const candidates: Candidate[] = [];
  dictionaryCandidates(pw, candidates);
  keyboardCandidates(pw, candidates);
  sequenceCandidates(pw, candidates);
  dateCandidates(pw, candidates);
  repeatCandidates(pw, depth, candidates);
  for (let i = 0; i < n; i++) {
    candidates.push({ start: i, end: i + 1, kind: "random", log10: Math.log10(pool), note: "", subs: [] });
    if (SEPARATORS.includes(pw[i])) {
      candidates.push({ start: i, end: i + 1, kind: "separator", log10: Math.log10(SEPARATOR_GUESSES), note: `separator: one of ${SEPARATOR_GUESSES} usual choices`, subs: [] });
    }
  }
  const byEnd: Candidate[][] = Array.from({ length: n + 1 }, () => []);
  for (const candidate of candidates) byEnd[candidate.end].push(candidate);
  const best = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<Candidate | null>(n + 1).fill(null);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (const candidate of byEnd[j]) {
      const cost = best[candidate.start] + candidate.log10;
      // Ties go to the more specific pattern (non-random), which explains better.
      if (cost < best[j] - 1e-9 || (Math.abs(cost - best[j]) <= 1e-9 && back[j]?.kind === "random")) {
        best[j] = cost;
        back[j] = candidate;
      }
    }
  }
  const picked: Candidate[] = [];
  for (let j = n; j > 0; ) {
    const candidate = back[j]!;
    picked.unshift(candidate);
    j = candidate.start;
  }
  // Merge neighbouring random characters into one piece.
  const segments: Segment[] = [];
  for (const candidate of picked) {
    const last = segments[segments.length - 1];
    if (candidate.kind === "random" && last?.kind === "random") {
      segments[segments.length - 1] = { ...last, end: candidate.end, token: pw.slice(last.start, candidate.end), log10: last.log10 + candidate.log10 };
    } else {
      segments.push({ kind: candidate.kind, token: pw.slice(candidate.start, candidate.end), start: candidate.start, end: candidate.end, log10: candidate.log10, note: candidate.note, subs: candidate.subs });
    }
  }
  return {
    log10: best[n],
    segments: segments.map((segment) =>
      segment.kind === "random" ? { ...segment, note: `no pattern the cracker knows: ${pool} possible characters each (×${pool} per character)` } : segment,
    ),
  };
}

// ---------- breach lists ----------
function core(text: string): string {
  return text.replace(/[\d\W_]{1,4}$/, "").toLowerCase();
}

export function breachOf(pw: string): Analysis["breach"] {
  const exact = BREACH_EXACT.get(pw);
  if (exact) return { source: exact, exact: true, match: "breach" };
  if (PASSWORD_RANK.has(pw.toLowerCase())) return { source: "every public breach list (it is a top common password)", exact: true, match: "common" };
  const mine = core(pw);
  if (mine.length >= 6) {
    const near = BREACHES.find((entry) => core(entry.password) === mine);
    if (near) return { source: near.source, exact: false, match: "breach" };
    if (PASSWORD_RANK.has(mine)) return { source: "every public breach list (a common password with a tweak on the end)", exact: false, match: "common" };
  }
  return null;
}

// ---------- time ----------
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "never";
  if (seconds < 1) return "instantly";
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [YEAR_SECONDS / 86400, "day"],
  ];
  let value = seconds;
  for (const [size, name] of units) {
    if (value < size) {
      const n = Math.round(value);
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
    value /= size;
  }
  const years = seconds / YEAR_SECONDS;
  if (years < 2) return "1 year";
  if (years < 1e6) return `${fmtCount(years)} years`;
  if (years < 1.4e10) return `${fmtCount(years / 1e6)} million years`;
  return "longer than the universe has existed";
}

export function guessesLabel(log10: number): string {
  if (log10 < 7) return fmtCount(10 ** log10);
  return `10^${Math.round(log10)}`;
}

export const ATTACKERS: readonly { id: AttackerId; name: string; detail: string }[] = [
  { id: "online", name: "Online, throttled", detail: "Smart guesses against the live login page, which allows about 100 an hour." },
  { id: "brute", name: "Offline brute force", detail: "Every combination of the character types used, on a GPU rig (100 billion a second). What naive meters assume." },
  { id: "smart", name: "Offline smart cracker", detail: "Same rig, but common passwords, words, letter swaps, keyboard walks, dates and repeats first." },
  { id: "stuffing", name: "Credential stuffing", detail: "Replays passwords leaked in other sites' breaches, and small tweaks of them." },
];

export const ONE_YEAR = YEAR_SECONDS;
export const CENTURY = 100 * YEAR_SECONDS;

function tierOf(seconds: number, breached: boolean): Tier {
  if (breached) return "breached";
  if (seconds < 3600) return "instant";
  if (seconds < ONE_YEAR) return "weak";
  if (seconds < CENTURY) return "fair";
  return "strong";
}

export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  breached: "Breached: useless anywhere",
  instant: "Falls in under an hour",
  weak: "Weak: under a year",
  fair: "Fair: years, not centuries",
  strong: "Strong: a century or more",
};

function findingsFor(pw: string, a: Omit<Analysis, "findings">): string[] {
  const out: string[] = [];
  const kinds = new Set(a.segments.map((segment) => segment.kind));
  if (a.breach) {
    out.push(
      a.breach.exact
        ? `This exact password is in ${a.breach.source}. Credential stuffing replays it first, so its length and symbols do not matter.`
        : `It is a small tweak of a password in ${a.breach.source}. Attackers replay those tweaks too.`,
    );
  }
  const subs = [...new Set(a.segments.flatMap((segment) => segment.subs))];
  if (subs.length) out.push(`Letter swaps (${subs.join(", ")}) were undone: each kind of swap only doubles the guesses, because crackers try them all automatically.`);
  if (kinds.has("common-password")) out.push("It is built on a common password: those are the very first guesses.");
  if (kinds.has("keyboard")) out.push("A keyboard walk looks random but follows neighbouring keys: only a few hundred guesses.");
  if (kinds.has("sequence")) out.push("A run like abc or 123 costs the cracker almost nothing.");
  if (kinds.has("repeat")) out.push("Repeating a chunk barely helps: the cracker guesses the chunk once and repeats it.");
  if (kinds.has("year") || kinds.has("date")) out.push("Years and dates come from a short list (birthdays, this year), so they add little.");
  const last = a.segments[a.segments.length - 1];
  if (a.segments.length > 1 && last?.kind === "random" && last.token.length <= 2 && a.segments.slice(0, -1).some((segment) => segment.kind !== "random")) {
    out.push(`"${last.token}" tacked on the end is the first place crackers try extra characters.`);
  }
  const words = a.segments.filter((segment) => segment.kind === "word" || segment.kind === "wordlike").length;
  if (words >= 3 && a.patternLog10 >= 18) out.push(`${words} words in a row: each uncommon word multiplies the guesses by about ${fmtCount(WORDLIKE_GUESSES)} (a common one by ${fmtCount(COMMON_WORD_GUESSES)}). Length is doing the work.`);
  const randomChars = a.segments.filter((segment) => segment.kind === "random").reduce((sum, segment) => sum + segment.token.length, 0);
  if (randomChars >= 12) out.push(`${randomChars} characters with no pattern: strong, but hard to remember. This is what a password manager is for.`);
  if (a.naiveLog10 - a.patternLog10 >= 6 && a.effectiveSeconds < CENTURY) {
    const brute = a.attackers.find((entry) => entry.id === "brute")!;
    const smart = a.attackers.find((entry) => entry.id === "smart")!;
    out.push(`A naive meter would say ${brute.label}. The smart cracker needs ${smart.label}: patterns, not character types, decide strength.`);
  }
  if (!out.length && pw.length) out.push(pw.length < 10 ? "Short: even with no pattern there are few combinations to try." : "No big weakness found. Make it longer to make it stronger.");
  return out;
}

export function analyze(password: string): Analysis {
  const pw = password.slice(0, MAX_LENGTH);
  const pool = poolOf(pw);
  const split = bestSplit(pw);
  const patternLog10 = split.log10;
  const naiveLog10 = pw.length * Math.log10(pool);
  const breach = pw.length ? breachOf(pw) : null;
  const log10 = breach ? Math.min(patternLog10, Math.log10(BREACH_CORPUS_GUESSES)) : patternLog10;
  const guesses = 10 ** log10;
  const seconds: Record<AttackerId, number> = {
    online: guesses / ONLINE_RATE,
    brute: 10 ** naiveLog10 / OFFLINE_RATE,
    smart: guesses / OFFLINE_RATE,
    stuffing: breach ? 0 : Infinity,
  };
  const attackers = ATTACKERS.map((attacker) => ({
    ...attacker,
    seconds: seconds[attacker.id],
    label: attacker.id === "stuffing" ? (breach ? "instantly" : "no match in breach lists") : formatDuration(seconds[attacker.id]),
  }));
  const effectiveSeconds = Math.min(seconds.smart, seconds.stuffing);
  const partial = {
    length: pw.length,
    pool,
    log10,
    patternLog10,
    naiveLog10,
    segments: split.segments,
    breach,
    attackers,
    effectiveSeconds,
    tier: pw.length ? tierOf(effectiveSeconds, breach !== null) : ("instant" as Tier),
  };
  return { ...partial, findings: pw.length ? findingsFor(pw, partial) : [] };
}

export function secondsFor(analysis: Analysis, id: AttackerId): number {
  return analysis.attackers.find((attacker) => attacker.id === id)!.seconds;
}
