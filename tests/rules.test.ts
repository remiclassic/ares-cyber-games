import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/rules/data";
import { commit, createGame, currentPuzzle, distance, evaluate, inCidr, initialConfig, minimalFix, move, nextPuzzle, scorePuzzle, summarize, toggleRule } from "../src/rules/engine";

const puzzle = (id: string) => SCENARIO.puzzles.find((entry) => entry.id === id)!;

describe("matching", () => {
  it("matches CIDR ranges", () => {
    expect(inCidr("10.20.9.40", "10.20.9.0/24")).toBe(true);
    expect(inCidr("10.20.4.15", "10.20.9.0/24")).toBe(false);
    expect(inCidr("10.20.4.15", "10.20.0.0/16")).toBe(true);
    expect(inCidr("10.20.1.5", "10.20.1.5/32")).toBe(true);
    expect(inCidr("198.51.100.7", "any")).toBe(true);
  });

  it("uses the first matching rule, then the default", () => {
    const verdicts = evaluate(SCENARIO, puzzle("guest"), initialConfig(puzzle("guest")));
    expect(verdicts.find((verdict) => verdict.packet === "p2")).toMatchObject({ rule: "r1", action: "allow", ok: false });
  });
});

describe("puzzles", () => {
  it("each starts broken and has a short fix", () => {
    const expected: Record<string, number> = { guest: 1, "early-default": 2, legacy: 1, rebuild: 3 };
    for (const entry of SCENARIO.puzzles) {
      expect(evaluate(SCENARIO, entry, initialConfig(entry)).every((verdict) => verdict.ok), entry.id).toBe(false);
      expect(minimalFix(SCENARIO, entry).changes, entry.id).toBe(expected[entry.id]);
    }
  });

  it("does not let the cleanup rule simply be deleted on an allow-by-default firewall", () => {
    const entry = puzzle("early-default");
    const verdicts = evaluate(SCENARIO, entry, { order: initialConfig(entry).order, disabled: ["r2"] });
    expect(verdicts.filter((verdict) => !verdict.ok).map((verdict) => verdict.packet)).toEqual(["p4", "p5"]);
  });

  it("does not solve the legacy rule by reordering alone", () => {
    const entry = puzzle("legacy");
    const sunk = { order: ["r2", "r3", "r4", "r1"], disabled: [] };
    expect(evaluate(SCENARIO, entry, sunk).every((verdict) => verdict.ok)).toBe(false);
  });
});

describe("scoring", () => {
  it("measures changes as edit distance, not clicks", () => {
    const start = initialConfig(puzzle("guest"));
    expect(distance(start, { order: ["r2", "r1", "r3"], disabled: [] })).toBe(1);
    expect(distance(start, start)).toBe(0);
  });

  it("gives 100 for the minimal fix and less for a fix with extra changes", () => {
    const entry = puzzle("guest");
    expect(scorePuzzle(SCENARIO, entry, minimalFix(SCENARIO, entry).config).total).toBe(100);
    const longWay = scorePuzzle(SCENARIO, entry, { order: ["r2", "r3", "r1"], disabled: [] });
    expect(longWay.correct).toBe(70);
    expect(longWay.tidy).toBe(15);
  });

  it("plays through every puzzle", () => {
    const state = createGame(SCENARIO);
    while (state.phase !== "done") {
      const fix = minimalFix(SCENARIO, currentPuzzle(state)).config;
      // Apply the fix through the public moves: bubble each rule into place, then switch rules off.
      fix.order.forEach((id, target) => {
        while (state.config.order.indexOf(id) > target) move(state, id, -1);
      });
      for (const id of fix.disabled) toggleRule(state, id);
      expect(commit(state).total, currentPuzzle(state).id).toBe(100);
      nextPuzzle(state);
    }
    expect(summarize(state)).toMatchObject({ total: 100, solved: 4 });
  });

  it("gives an untouched broken list no tidiness credit", () => {
    const entry = puzzle("rebuild");
    expect(scorePuzzle(SCENARIO, entry, initialConfig(entry)).tidy).toBe(0);
  });
});
