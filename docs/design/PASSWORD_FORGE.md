# Password Forge

**Skill:** how password strength actually works. Length and unpredictability decide strength; symbol rules and letter swaps barely matter; and a password that has leaked anywhere is weak everywhere, whatever its length.

**Page:** `forge.html` · **Code:** `src/forge/` · **Tests:** `tests/forge.test.ts` · **Activity id:** `ares-password-forge/halden-works/v0.1`

Fictional (Halden Works, a locksmith's forge; ShopNest and FitTrackr are made-up breached sites). Content to be reviewed with SMEs.

## Problem

Most people learned passwords from composition rules: a capital, a digit, a symbol. Those rules produce `P@ssw0rd2026!`, which meets every rule, looks strong to naive meters, and falls in microseconds to a real cracker, because real crackers guess human habits, not raw character combinations. The same people reuse their one "strong" password across sites, so a breach at a web shop opens their work email. Telling people this does not stick; seeing it happen to their own password does.

## Objective

After about 5 minutes the learner can:

1. Explain why length and unpredictability matter more than character types.
2. Recognise the patterns crackers try first: common passwords, dictionary words, letter-for-symbol swaps, keyboard walks, sequences, repeats, years and dates, characters tacked on the end.
3. Build a passphrase that survives an offline attack for a century.
4. Explain why a strong password is useless once breached elsewhere, and what fixes it: a unique password per site (a password manager), plus MFA.

## Loop

Six short challenges (left panel), each a **build** or a **pick**:

| # | Challenge | Type | What it teaches |
|---|---|---|---|
| 1 | Your first forge | Build, guided | Start from `sunshine`; the coach invites the classic swaps, the cracker undoes them, then the coach steers to added words. Target: offline smart cracker ≥ 1 year. |
| 2 | Pick the strongest | Pick | Leet word, common password + year + symbols, keyboard row + 123, four plain words. The plain words win. |
| 3 | Spot the weakness | Pick | Why `P@ssw0rd2026!` falls. Attacker times are shown first (naive brute force: millions of years; smart cracker: instantly); the working is revealed after the pick. Each wrong option is refuted with a live estimate of the "fix" it proposes. |
| 4 | Sixteen characters each | Pick | Same length, different strength: keyboard walk, alphabet, stock phrase, random. |
| 5 | The reuse trap | Pick | Dana's long, random-looking password is in the fictional ShopNest breach. The credential-stuffing row reads "instantly". Right answer: unique password from a manager + MFA. Tweaking one character is refuted with evidence (tweaks are flagged too). |
| 6 | The century vault | Build | No coach. Offline smart cracker ≥ 100 years, and no breach-list match. |

While building, the **cracker panel** updates on every keystroke with four attacker models, and **the cracker's working** shows how the password was split into pieces, what each piece cost, and plain-language findings. Then a debrief.

Standard Ares shell: shared header and branding, the How to play walkthrough (4 pages) and header help button, the live Next-step bar, keyboard play (Enter to lock in, 1–4 to pick, N for next).

## Why the mechanic is the skill

The player's only lever is the password itself, and the only feedback is what a pattern-aware cracker would do with it. Every change they try (a swap, a symbol, a year, another word) is immediately priced, with the reason shown. The lesson is not stated and then quizzed; it is discovered by trying the folk advice and watching it fail, then trying length and watching it work. The pick challenges then test the same judgement without the meter's help, and the reuse challenge shows the one failure no amount of strength can fix.

## How dominant strategies lose

- **"Add symbols / leetspeak."** The estimator undoes common swaps (`@→a`, `0→o`, `1→i/l`, `3→e`, `$→s`, `!→i`, `7→t`, …) and charges only ×2 per kind of swap. A single odd symbol standing in for a letter of a known word (`s#nshine`) is charged ×33. Appended characters are cheap. Tested: no leet/symbol variant meets either build target (`tests/forge.test.ts`, "a symbols-and-leetspeak strategy never meets a build target").
- **"Just make it long."** Keyboard walks, sequences (`abcdefghijklmnop`), repeats (`aaaa…`, `hellohello…`) and dates are charged as patterns, so long-but-predictable strings stay weak.
- **"Use a famous passphrase."** `correct horse battery staple` uses words in the top-words tier and needs only days. Uncommon, unrelated words are what pass.
- **"Reuse my strong one."** Any password in the breach list (or a small tweak of it) is flagged and the stuffing attacker gets it instantly, regardless of length. A build cannot pass with a breached password.
- **Guessing in picks.** One pick per question, scored 0 if wrong. The right answers are cross-checked against the estimator in tests, so the content and the meter cannot disagree.
- **Spamming lock-in.** Each failed lock-in costs 25 points (floor 50); the panel shows pass/fail before locking, so a failed lock-in means the evidence was ignored.

## The estimator (`src/forge/estimator.ts`)

Deterministic, dependency-free, explainable. It finds the **cheapest split** of the password into pieces (dynamic programming over all candidate matches), multiplies the pieces' guess counts, and converts guesses to time.

| Piece | Guesses | Notes |
|---|---|---|
| Common password | its rank (1–110) | small built-in list from public breach compilations |
| Common word | 5,000 | the attacker's top-words list (built-in ~340 words, names, months, seasons) |
| Dictionary word | 100,000 (×10 per letter past 8) | "word-like" heuristic: pronounceable 5–11 letters, English-like consonant clusters; stands in for a full wordlist |
| Keyboard walk | 47 × length × 4 per turn (×2 with Shift) | QWERTY adjacency, 4+ keys |
| Sequence | 4–26 × length (×2 backwards) | `abc`, `987`, 3+ |
| Repeat | unit's guesses × repeats | recursive |
| Year / date | 100 / 36,600 (×4 with separators) | 1950–2049; dd mm yyyy, mm dd yyyy, yyyy mm dd, 6- and 8-digit |
| Separator | 6 | space - _ . , / |
| Random | pool per character | pool = 26/26/10/33 by character classes present |

Modifiers on word pieces: capitals ×2 (first, last or all) or the number of ways to place them; each kind of letter swap ×2; one odd symbol for a letter ×33; reversed ×2.

**Attacker models** (time = guesses ÷ rate, worst case):

- *Online, throttled*: smart guesses at 100 per hour against a live login.
- *Offline brute force*: pool^length at 10^11 per second (GPU rig vs a fast, unsalted hash). Shown as "what naive meters assume", to make the contrast visible.
- *Offline smart cracker*: the estimator's guesses at 10^11 per second. **Targets use this one.**
- *Credential stuffing*: instant if the password, or a small tweak of it (trailing digits/symbols changed), is in the breach list (the fictional breaches plus the common-passwords list); otherwise "no match". A breach-list match also caps the smart cracker at 10^9 guesses.

Tiers: breached; under an hour; under a year; under a century; a century or more.

### Simplifications (be honest with learners and SMEs)

This is an **educational approximation**, not a security tool, and the debrief says so.

- Real crackers hold billions of leaked passwords and every word in many languages. Ours uses small lists plus flat tiers, so it can **overestimate** strength for words it does not know (a real word that fails the word-like heuristic is priced as random letters) and **underestimate** it for random letters that happen to look pronounceable.
- Guess counts are not summed across all possible splits, there is no ordering penalty for combining pieces, and capitalisation and swaps are simple multipliers. zxcvbn-style meters are more careful; ours trades precision for working that fits on one line per piece.
- Speeds are one fixed number per model. Real offline speed depends heavily on how the site stores passwords (a slow, salted hash such as bcrypt or Argon2 is millions of times slower than MD5/NTLM), and online throttling varies by site.
- Times are worst case (the whole space); the average is about half.
- English-only, QWERTY-only.
- Personal information (names, birthdays, pets) is only caught if it is a common word, name or date.

Treat the numbers as a comparison between passwords, not a guarantee.

## Privacy

The game asks people to type passwords, so it must never risk capturing one:

- The typed text lives only in the input element and in memory while the challenge is open. It is never sent, stored (no localStorage, cookies or URLs) or logged. The input has autocomplete, autocorrect, spellcheck and password-manager prompts turned off and is not in a form.
- The input is cleared when a build challenge ends. Game state keeps only pattern kinds and a guess count per lock-in, never the text (tested: "keeps evidence without keeping passwords").
- Host messages (`ares:practice:started|statement|completed`) carry challenge ids, scores, options picked and pattern kinds only.
- A visible note on the page, in the walkthrough and under the input says: practice only, nothing leaves the page, never type a real password.

## Scoring vs learning evidence

**Score** (600 max): builds 100 for meeting the target, −25 per failed lock-in (floor 50), 0 for asking for the example; the guided build always scores 100 on completion. Picks 100 if right first time. Hints are free; speed is never scored.

**Learning evidence** (debrief and the `completed` payload), kept separate from the score:

- builds in which the player tried letter swaps (observed live, not just at lock-in);
- weak pattern kinds present in failed lock-ins (common password, keyboard walk, sequence, repeat, year, date);
- the composition and guess count of the century password (kinds only);
- each wrong pick with the option chosen, the refutation and its live evidence;
- hints used, examples shown, lock-in counts.

## SME review items

1. Attacker speeds: 10^11/s for fast-hash offline cracking and 100/hour for throttled online guessing. Should the panel add a slow-hash (bcrypt/Argon2) row?
2. Tier boundaries and the build targets (1 year; 100 years against fast-hash offline cracking). Is 100 years the right message, given slow hashes and rate limits?
3. Guess counts per piece (top-words 5,000; full wordlist 100,000; years 100; dates 36,600; swaps ×2; odd symbol ×33).
4. Treating a small tweak of a breached password as breached (trailing digits/symbols only).
5. Advice wording: password manager, passphrases for the few remembered passwords, MFA, unique per site. Align with the learner organisation's policy (e.g. NIST SP 800-63B: length over composition, screen against breach lists, no forced periodic rotation).
6. Whether `correct horse battery staple` being rated weak (its words are common and the phrase is famous) is a helpful or confusing message.
7. The fictional scenario names (Halden Works, ShopNest, FitTrackr, Dana) and breach entries.
8. Whether to show typed text (current) or mask it with a show/hide toggle.
