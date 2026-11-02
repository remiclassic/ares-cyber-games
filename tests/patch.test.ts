import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/patch/data";
import {
  ATTEMPT_AT,
  BREACH_AT,
  bestPlan,
  byHighestScore,
  canHint,
  commit,
  consequence,
  createGame,
  currentRound,
  decoyOf,
  next,
  outcomeOf,
  playStrategy,
  risk,
  scorePlan,
  severityLabel,
  summarize,
  takeHint,
  toggle,
  type Strategy,
  type Vuln,
} from "../src/patch/sim";

const all = SCENARIO.rounds.flatMap((round) => round.vulns);
const bestStrategy: Strategy = (round, budget) => bestPlan(round, budget);
const ranked = (vulns: readonly Vuln[]) => [...vulns].sort((a, b) => risk(b) - risk(a));

describe("patch tuesday content", () => {
  it("has three rounds of five, a guided first round and a no-hint final round", () => {
    expect(SCENARIO.rounds).toHaveLength(3);
    for (const round of SCENARIO.rounds) expect(round.vulns).toHaveLength(5);
    expect(SCENARIO.rounds[0].mode).toBe("guided");
    expect(SCENARIO.rounds[SCENARIO.rounds.length - 1].mode).toBe("final");
    expect(SCENARIO.budget).toBe(3);
  });

  it("is well formed: unique ids, valid scores, an explanation for every item", () => {
    expect(new Set(all.map((vuln) => vuln.id)).size).toBe(all.length);
    for (const vuln of all) {
      expect(vuln.cvss).toBeGreaterThanOrEqual(0);
      expect(vuln.cvss).toBeLessThanOrEqual(10);
      expect(vuln.why.length).toBeGreaterThan(20);
      // Anything that can be breached has an authored breach line.
      if (risk(vuln) >= BREACH_AT) expect(vuln.breach.length).toBeGreaterThan(10);
    }
  });

  it("has a clear best plan each round (no near-tie between 3rd and 4th)", () => {
    for (const round of SCENARIO.rounds) {
      const order = ranked(round.vulns);
      expect(risk(order[2]) - risk(order[3])).toBeGreaterThanOrEqual(1);
    }
  });

  it("puts a severity trap in every round: the top severity item is not worth patching", () => {
    for (const round of SCENARIO.rounds) {
      const top = [...round.vulns].sort((a, b) => b.cvss - a.cvss)[0];
      expect(bestPlan(round, 3)).not.toContain(top.id);
      expect(decoyOf(round, 3)?.id).toBe(top.id);
      expect(severityLabel(top.cvss)).toBe("Critical");
    }
  });

  it("an internet-facing exploited medium outranks an internal unexploited critical", () => {
    const medium = all.find((vuln) => vuln.id === "FH-2611-02")!;
    const critical = all.find((vuln) => vuln.id === "FH-2611-01")!;
    expect(severityLabel(medium.cvss)).toBe("Medium");
    expect(severityLabel(critical.cvss)).toBe("Critical");
    expect(risk(medium)).toBeGreaterThan(risk(critical) * 5);
  });

  it("covers every exposure, exploit status and criticality", () => {
    for (const exposure of ["internet", "internal"]) expect(all.some((vuln) => vuln.exposure === exposure)).toBe(true);
    for (const exploit of ["itw", "poc", "none"]) expect(all.some((vuln) => vuln.exploit === exploit)).toBe(true);
    for (const criticality of [1, 2, 3]) expect(all.some((vuln) => vuln.criticality === criticality)).toBe(true);
  });
});

describe("patch tuesday rules", () => {
  it("allows exactly the budget, toggles picks, and commits only a full plan", () => {
    const state = createGame(SCENARIO);
    const ids = currentRound(state).vulns.map((vuln) => vuln.id);
    expect(commit(state)).toBeNull();
    expect(toggle(state, ids[0])).toBe(true);
    expect(toggle(state, ids[0])).toBe(true); // un-pick
    expect(state.selected).toEqual([]);
    for (const id of ids.slice(0, 3)) toggle(state, id);
    expect(toggle(state, ids[3])).toBe(false); // over budget
    expect(toggle(state, "not-a-vuln")).toBe(false);
    expect(commit(state)).not.toBeNull();
    expect(commit(state)).toBeNull(); // one commit per round
    expect(toggle(state, ids[4])).toBe(false); // locked after commit
  });

  it("offers hints only in the hints round, free of score cost", () => {
    const state = createGame(SCENARIO);
    expect(canHint(state)).toBe(false); // guided round shows the factors anyway
    for (const id of bestPlan(currentRound(state), 3)) toggle(state, id);
    commit(state);
    next(state);
    expect(takeHint(state)).toBe(true);
    for (const id of bestPlan(currentRound(state), 3)) toggle(state, id);
    expect(commit(state)!.points).toBe(100);
    next(state);
    expect(currentRound(state).mode).toBe("final");
    expect(takeHint(state)).toBe(false);
    expect(state.hinted).toBe(false);
  });

  it("explains outcomes from the evidence and leaves low-risk items quiet", () => {
    for (const vuln of all) {
      expect(outcomeOf(vuln, true)).toBe("patched");
      const outcome = outcomeOf(vuln, false);
      expect(outcome).toBe(risk(vuln) >= BREACH_AT ? "breach" : risk(vuln) >= ATTEMPT_AT ? "attempt" : "quiet");
      expect(consequence(vuln, false).length).toBeGreaterThan(10);
    }
    const decoy = decoyOf(SCENARIO.rounds[0], 3)!;
    expect(outcomeOf(decoy, false)).toBe("quiet");
    // Every round's severity trap stays quiet if deferred; that is the point of deferring it.
    for (const round of SCENARIO.rounds) expect(outcomeOf(decoyOf(round, 3)!, false)).toBe("quiet");
    expect(consequence(decoy, true)).toContain("bought little");
  });
});

describe("patch tuesday scoring", () => {
  it("the best plan scores 100 every round with no breaches", () => {
    const summary = summarize(playStrategy(SCENARIO, bestStrategy));
    expect(summary.score).toBe(summary.max);
    expect(summary.breaches).toBe(0);
    expect(summary.evidence.accuracy).toBe(1);
    expect(summary.evidence.decoysAvoided).toBe(3);
  });

  it("patching the highest severity scores first loses: under 50% score and under half accuracy", () => {
    const naive = summarize(playStrategy(SCENARIO, byHighestScore));
    expect(naive.score).toBeLessThan(naive.max * 0.5);
    expect(naive.evidence.accuracy).toBeLessThan(0.5);
    expect(naive.evidence.decoysAvoided).toBe(0);
    expect(naive.breaches).toBeGreaterThanOrEqual(4);
    for (const result of playStrategy(SCENARIO, byHighestScore).results) expect(result.points).toBeLessThan(60);
  });

  it("no single-signal shortcut matches the best plan", () => {
    const sortBy = (key: (vuln: Vuln) => number): Strategy => (round, budget) =>
      [...round.vulns]
        .sort((a, b) => key(b) - key(a) || b.cvss - a.cvss)
        .slice(0, budget)
        .map((vuln) => vuln.id);
    const shortcuts = {
      exploitedFirst: sortBy((vuln) => (vuln.exploit === "itw" ? 2 : vuln.exploit === "poc" ? 1 : 0)),
      internetFirst: sortBy((vuln) => (vuln.exposure === "internet" ? 1 : 0)),
      crownJewelsFirst: sortBy((vuln) => vuln.criticality),
    };
    const naive = summarize(playStrategy(SCENARIO, byHighestScore)).score;
    for (const strategy of Object.values(shortcuts)) {
      const state = playStrategy(SCENARIO, strategy);
      const summary = summarize(state);
      // Each shortcut is beaten in at least one round, and still beats chasing severity.
      expect(state.results.some((result) => result.points < 100)).toBe(true);
      expect(summary.score).toBeLessThan(summary.max * 0.95);
      expect(summary.score).toBeGreaterThan(naive);
    }
    // The most tempting shortcut ("exploited first, then severity") stays well short.
    const exploited = summarize(playStrategy(SCENARIO, shortcuts.exploitedFirst));
    expect(exploited.score).toBeLessThan(exploited.max * 0.9);
  });

  it("scores a round as the share of removable risk", () => {
    const round = SCENARIO.rounds[0];
    const result = scorePlan(round, ["FH-2611-02", "FH-2611-05", "FH-2611-01"], 3);
    expect(result.correct).toBe(2);
    expect(result.decoyAvoided).toBe(false);
    expect(result.points).toBe(Math.round((100 * (19.5 + 10.8 + 1.96)) / (19.5 + 10.8 + 8.8)));
    expect(result.breaches).toBe(1); // webmail left open
  });

  it("keeps learning evidence separate from the game score and tags the attempt", () => {
    const state = createGame(SCENARIO, 2);
    for (const strategy of [bestStrategy, byHighestScore, bestStrategy]) {
      for (const id of strategy(currentRound(state), 3)) toggle(state, id);
      commit(state);
      next(state);
    }
    const summary = summarize(state);
    expect(state.phase).toBe("done");
    expect(summary.evidence.firstAttempt).toBe(false);
    expect(summary.evidence.attempt).toBe(2);
    expect(summary.evidence.correct).toBe(3 + 1 + 3);
    expect(summary.evidence.total).toBe(9);
    expect(summary.evidence.finalCorrect).toBe(3);
    expect(summary.evidence.finalTotal).toBe(3);
    expect(summary).not.toHaveProperty("evidence.score");
    expect(summary.score).toBe(100 + state.results[1].points + 100);
  });
});
