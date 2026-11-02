import { describe, expect, it } from "vitest";
import { CHALLENGES } from "../src/forge/data";
import {
  POINTS,
  buildPoints,
  coachFor,
  createGame,
  currentChallenge,
  giveUp,
  lockIn,
  next,
  observe,
  pick,
  summarize,
  takeHint,
  type BuildChallenge,
  type GameState,
  type PickChallenge,
} from "../src/forge/engine";
import { CENTURY, ONE_YEAR, YEAR_SECONDS, analyze, formatDuration, isWordlike, secondsFor } from "../src/forge/estimator";
import { BREACHES } from "../src/forge/wordlists";

const smart = (pw: string) => secondsFor(analyze(pw), "smart");
const kinds = (pw: string) => analyze(pw).segments.map((segment) => segment.kind);

describe("password forge estimator", () => {
  it("rates a leetspeak dictionary word as weak and undoes the swaps", () => {
    for (const pw of ["P@ssw0rd", "P@ssw0rd2026!", "$unsh1ne!", "Tr0ub4dor&3"]) {
      const a = analyze(pw);
      expect(a.effectiveSeconds, pw).toBeLessThan(3600);
      expect(["instant", "breached"]).toContain(a.tier);
      expect(a.segments.some((segment) => segment.subs.length > 0), pw).toBe(true);
    }
    expect(analyze("P@ssw0rd2026!").segments[0].note).toContain('reads as "password"');
  });

  it("does not let symbols or leetspeak win", () => {
    // Swapping and decorating a word gains far less than adding words.
    const plain = analyze("sunshine").log10;
    const decorated = analyze("$un$h1n3!!").log10;
    const longer = analyze("sunshine lantern orbit pickle").log10;
    expect(decorated - plain).toBeLessThan(longer - plain);
    expect(smart("S#nsh1n3!")).toBeLessThan(ONE_YEAR);
    // The naive meter is fooled; the smart cracker is not.
    const a = analyze("P@ssw0rd2026!");
    expect(secondsFor(a, "brute")).toBeGreaterThan(1e6 * YEAR_SECONDS);
    expect(secondsFor(a, "smart")).toBeLessThan(1);
  });

  it("rates a long random passphrase as strong", () => {
    for (const pw of ["lantern orbit pickle velvet", "glacier marmot quarry falcon velvet", "Pickle-Lantern-Orbit-Velvet"]) {
      expect(analyze(pw).tier, pw).toBe("strong");
      expect(smart(pw)).toBeGreaterThanOrEqual(CENTURY);
    }
    expect(analyze("vq7#Lm2pXz!e9Rb0").tier).toBe("strong");
  });

  it("rates common words lower than uncommon ones, so famous passphrases are not enough", () => {
    expect(smart("correct horse battery staple")).toBeLessThan(ONE_YEAR);
    expect(smart("correct horse battery staple")).toBeLessThan(smart("lantern orbit pickle velvet"));
  });

  it("rates keyboard walks, sequences, repeats and dates as weak", () => {
    for (const pw of ["qwertyuiop", "1qaz2wsx3edc4rfv", "zxcvbnm,./", "asdfghjkl;", "abcdefghijklmnop", "aaaaaaaaaaaaaaaaaaaa", "hellohellohello", "03/12/1990"]) {
      expect(smart(pw), pw).toBeLessThan(3600);
    }
    expect(kinds("zxcvbnm,./")).toContain("keyboard");
    expect(kinds("hjkl;'")).toContain("keyboard");
    expect(kinds("abcdefghijklmnop")).toEqual(["sequence"]);
    expect(kinds("aaaaaaaaaaaaaaaaaaaa")).toEqual(["repeat"]);
    expect(kinds("03/12/1990")).toEqual(["date"]);
    expect(kinds("Summer2026!!")).toContain("year");
  });

  it("flags a breached password regardless of length, and small tweaks of it", () => {
    for (const { password } of BREACHES) {
      const a = analyze(password);
      expect(a.breach?.exact, password).toBe(true);
      expect(a.tier).toBe("breached");
      expect(secondsFor(a, "stuffing")).toBe(0);
      expect(a.patternLog10).toBeGreaterThan(8); // strong-looking on its own
    }
    const tweak = analyze(`${BREACHES[0].password}8`);
    expect(tweak.breach?.exact).toBe(false);
    expect(tweak.tier).toBe("breached");
    expect(analyze("Sunshine!").breach?.match).toBe("common");
    expect(analyze("lantern orbit pickle velvet").breach).toBeNull();
    expect(secondsFor(analyze("lantern orbit pickle velvet"), "stuffing")).toBe(Infinity);
  });

  it("does not mistake random letters for words, and is deterministic", () => {
    expect(isWordlike("lantern")).toBe(true);
    expect(isWordlike("xkcdzzqq")).toBe(false);
    expect(isWordlike("vqlmpz")).toBe(false);
    expect(kinds("vq7#Lm2pXz!e9Rb0")).toEqual(["random"]);
    expect(analyze("Glacier marmot 42").log10).toBe(analyze("Glacier marmot 42").log10);
    expect(analyze("").length).toBe(0);
    expect(analyze("x".repeat(200)).length).toBe(64);
  });

  it("formats durations", () => {
    expect(formatDuration(0.2)).toBe("instantly");
    expect(formatDuration(90)).toBe("2 minutes");
    expect(formatDuration(3 * 86400)).toBe("3 days");
    expect(formatDuration(Infinity)).toBe("never");
    expect(formatDuration(1e40)).toContain("universe");
  });
});

describe("password forge content", () => {
  const picks = CHALLENGES.filter((c): c is PickChallenge => c.kind === "pick");
  const builds = CHALLENGES.filter((c): c is BuildChallenge => c.kind === "build");

  it("has one right answer per pick and a guided first build", () => {
    expect(CHALLENGES[0].kind).toBe("build");
    expect((CHALLENGES[0] as BuildChallenge).guided).toBe(true);
    for (const challenge of picks) expect(challenge.options.filter((option) => option.correct)).toHaveLength(1);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it("marks the estimator's strongest password as the right answer in password picks", () => {
    for (const challenge of picks.filter((c) => c.optionsArePasswords)) {
      const ranked = [...challenge.options].sort((a, b) => analyze(b.label).log10 - analyze(a.label).log10);
      expect(ranked[0].correct, challenge.id).toBe(true);
      for (const option of challenge.options.filter((o) => !o.correct)) expect(smart(option.label), option.label).toBeLessThan(3600);
    }
  });

  it("backs every evidence claim with the estimator", () => {
    const spot = picks.find((c) => c.id === "spot")!;
    expect(smart(spot.subject!.password)).toBeLessThan(1);
    expect(analyze(spot.subject!.password).log10).toBeLessThan(Math.log10(300_000)); // "about 150,000 guesses"
    for (const option of spot.options.filter((o) => o.evidence)) expect(smart(option.evidence!), option.evidence).toBeLessThan(1);
    const reuse = picks.find((c) => c.id === "reuse")!;
    expect(analyze(reuse.subject!.password).tier).toBe("breached");
    expect(analyze(reuse.options.find((o) => o.id === "tweak")!.evidence!).tier).toBe("breached");
    expect(smart("ilovemydog2019!!")).toBeLessThan(60);
  });

  it("ships examples that pass and starting text that does not", () => {
    for (const challenge of builds) {
      expect(smart(challenge.example)).toBeGreaterThanOrEqual(challenge.target.seconds);
      expect(analyze(challenge.example).breach).toBeNull();
      if (challenge.start) expect(smart(challenge.start)).toBeLessThan(challenge.target.seconds);
    }
  });
});

function playAll(answer: (state: GameState) => void): GameState {
  const state = createGame(CHALLENGES);
  while (state.phase !== "done") {
    answer(state);
    next(state);
  }
  return state;
}

const perfect = (state: GameState) => {
  const c = currentChallenge(state);
  if (c.kind === "build") lockIn(state, c.example);
  else pick(state, c.options.find((o) => o.correct)!.id);
};

describe("password forge scoring", () => {
  it("perfect play scores the maximum", () => {
    const summary = summarize(playAll(perfect));
    expect(summary.total).toBe(summary.max);
    expect(summary.max).toBe(CHALLENGES.length * POINTS.max);
    expect(summary.passed).toBe(CHALLENGES.length);
  });

  it("a symbols-and-leetspeak strategy never meets a build target", () => {
    const leety = ["$un$h1n3!", "P@$$w0rd2026!!", "Tr0ub4dor&3", "S#nsh1n3!2026", "Qw3rty!@#$"];
    for (const challenge of CHALLENGES.filter((c): c is BuildChallenge => c.kind === "build")) {
      for (const pw of leety) expect(lockIn(createGame([challenge]), pw)!.passed, pw).toBe(false);
    }
  });

  it("failed lock-ins cost points down to a floor; the guided build never penalises", () => {
    const century = CHALLENGES.find((c) => c.id === "century") as BuildChallenge;
    expect(buildPoints(century, 0)).toBe(100);
    expect(buildPoints(century, 1)).toBe(75);
    expect(buildPoints(century, 5)).toBe(POINTS.buildFloor);
    const state = createGame([century]);
    expect(lockIn(state, "P@ssw0rd2026!")!.passed).toBe(false);
    expect(lockIn(state, century.example)!.points).toBe(75);
    const guided = createGame([CHALLENGES[0]]);
    lockIn(guided, "sunshine");
    lockIn(guided, "$un$h1n3!");
    expect(lockIn(guided, "lantern orbit pickle velvet")!.points).toBe(100);
  });

  it("giving up or picking wrong scores zero; hints are free", () => {
    const state = createGame(CHALLENGES);
    expect(takeHint(state)).toBeTruthy();
    lockIn(state, (CHALLENGES[0] as BuildChallenge).example);
    next(state);
    const strongest = currentChallenge(state) as PickChallenge;
    expect(pick(state, strongest.options.find((o) => !o.correct)!.id)!.correct).toBe(false);
    expect(pick(state, strongest.options[0].id)).toBeNull(); // one pick
    const summary = summarize(state);
    expect(summary.total).toBe(100);
    expect(summary.hints).toBe(1);
    const centuryChallenge = CHALLENGES.find((c) => c.id === "century") as BuildChallenge;
    const century = createGame([centuryChallenge]);
    expect(giveUp(century)).toBe(centuryChallenge.example);
    expect(summarize(century).total).toBe(0);
  });

  it("keeps evidence without keeping passwords", () => {
    const state = createGame(CHALLENGES);
    observe(state, analyze("$un$h1n3!"));
    lockIn(state, "qwertyuiop");
    lockIn(state, "lantern orbit pickle velvet");
    const summary = summarize(state);
    expect(summary.leetTried).toBe(1);
    expect(summary.patternsLockedIn).toContain("common-password");
    const serialised = JSON.stringify(state.results);
    expect(serialised).not.toContain("lantern");
    expect(serialised).not.toContain("qwerty");
  });

  it("coaches the guided build from the cracker's evidence", () => {
    const target = (CHALLENGES[0] as BuildChallenge).target;
    expect(coachFor(analyze("sunshine"), target)).toContain("swap");
    expect(coachFor(analyze("$un$h1n3!"), target)).toContain("undid your swaps");
    expect(coachFor(analyze("lantern orbit"), target)).toContain("Add another word");
    expect(coachFor(analyze("lantern orbit pickle velvet"), target)).toContain("Lock it in");
  });
});
