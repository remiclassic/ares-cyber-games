import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/shadowit/data";
import {
  DECISIONS,
  THRESHOLDS,
  bestDecision,
  canDecide,
  createGame,
  decide,
  finish,
  inspect,
  isAvailable,
  learning,
  meters,
  pickFact,
  playAll,
  score,
  type Decision,
} from "../src/shadowit/engine";

const ids = DECISIONS.map((entry) => entry.id);

describe("content", () => {
  it("has six unsanctioned tools and at least three sanctioned decoys, well formed", () => {
    expect(SCENARIO.items.filter((item) => !item.sanctioned)).toHaveLength(6);
    expect(SCENARIO.items.filter((item) => item.sanctioned).length).toBeGreaterThanOrEqual(3);
    expect(new Set(SCENARIO.items.map((item) => item.id)).size).toBe(SCENARIO.items.length);
    for (const item of SCENARIO.items) {
      expect(item.evidence.length, item.id).toBeGreaterThanOrEqual(3);
      expect(item.evidence.some((fact) => fact.id === item.key), item.id).toBe(true);
      const grades = ids.map((id) => item.outcomes[id].grade);
      expect(grades.filter((grade) => grade === "best"), item.id).toHaveLength(1);
      for (const id of ids) expect(item.outcomes[id].text.length, `${item.id}:${id}`).toBeGreaterThan(40);
      expect(item.lesson.length).toBeGreaterThan(20);
      // Neutral labels: nothing in the label gives the answer away.
      expect(item.label.toLowerCase(), item.id).not.toMatch(/shadow|personal|sanction|risk|free|licen|managed|unapproved/);
    }
  });

  it("makes sanctioned tools best left alone and never best left alone otherwise", () => {
    for (const item of SCENARIO.items) {
      if (item.sanctioned) expect(bestDecision(item), item.id).toBe("leave");
      else expect(bestDecision(item), item.id).not.toBe("leave");
    }
  });

  it("uses every action as a best answer somewhere", () => {
    const bests = new Set(SCENARIO.items.map(bestDecision));
    for (const id of ids) expect(bests.has(id), id).toBe(true);
  });
});

describe("flow", () => {
  it("starts with a guided finding: only that item is available until it is decided", () => {
    const state = createGame(SCENARIO);
    const other = SCENARIO.items.find((item) => item.id !== SCENARIO.guided)!;
    expect(isAvailable(state, other.id)).toBe(false);
    expect(inspect(state, other.id)).toBe(false);
    expect(inspect(state, SCENARIO.guided)).toBe(true);
    expect(decide(state, SCENARIO.guided, "migrate")).toBeNull(); // no deciding fact yet
    expect(pickFact(state, SCENARIO.guided, "nope")).toBe(false);
    expect(pickFact(state, SCENARIO.guided, "owner")).toBe(true);
    expect(canDecide(state, SCENARIO.guided)).toBe(true);
    expect(decide(state, SCENARIO.guided, "migrate")?.grade).toBe("best");
    expect(state.phase).toBe("play");
    expect(isAvailable(state, other.id)).toBe(true);
  });

  it("requires inspection before a decision, and a decision is final", () => {
    const state = createGame(SCENARIO);
    inspect(state, SCENARIO.guided);
    pickFact(state, SCENARIO.guided, "owner");
    decide(state, SCENARIO.guided, "block");
    expect(decide(state, SCENARIO.guided, "migrate")).toBeNull();
    expect(pickFact(state, SCENARIO.guided, "data")).toBe(false);
    expect(state.decisions[SCENARIO.guided]).toBe("block");
    expect(pickFact(state, "macro", "dest")).toBe(false); // not inspected
    expect(canDecide(state, "macro")).toBe(false);
  });

  it("moves the meters with each decision", () => {
    const state = createGame(SCENARIO);
    expect(meters(state)).toEqual(SCENARIO.start);
    inspect(state, SCENARIO.guided);
    pickFact(state, SCENARIO.guided, "owner");
    decide(state, SCENARIO.guided, "approve");
    const after = meters(state);
    expect(after.risk).toBeGreaterThan(SCENARIO.start.risk);
  });

  it("counts undecided items as left as they are when the audit ends", () => {
    const state = createGame(SCENARIO);
    inspect(state, SCENARIO.guided);
    pickFact(state, SCENARIO.guided, "owner");
    decide(state, SCENARIO.guided, "migrate");
    finish(state);
    const result = score(state);
    expect(result.undecided).toBe(SCENARIO.items.length - 1);
    expect(learning(state).unaddressed).toHaveLength(5);
  });
});

describe("scoring: dominant strategies lose", () => {
  const run = (rule: (item: (typeof SCENARIO.items)[number]) => Decision) => playAll(SCENARIO, rule);

  it("passes a run that picks the best action every time", () => {
    const result = score(run(bestDecision));
    expect(result.decisionPct).toBe(100);
    expect(result.total).toBeGreaterThanOrEqual(90);
    expect(result.risk).toBeLessThanOrEqual(10);
    expect(result.morale).toBeGreaterThanOrEqual(75);
    expect(result.passed).toBe(true);
  });

  it("fails block-everything: productivity collapses", () => {
    const result = score(run(() => "block"));
    expect(result.total).toBeLessThan(THRESHOLDS.score);
    expect(result.morale).toBeLessThan(THRESHOLDS.minMorale);
    expect(result.passed).toBe(false);
  });

  it("fails approve-everything: risk climbs past the limit", () => {
    const result = score(run(() => "approve"));
    expect(result.total).toBeLessThan(THRESHOLDS.score);
    expect(result.risk).toBeGreaterThan(THRESHOLDS.maxRisk);
    expect(result.passed).toBe(false);
  });

  it("fails migrate-everything and do-nothing too", () => {
    for (const rule of ["migrate", "leave"] as const) {
      const result = score(run(() => rule));
      expect(result.total, rule).toBeLessThan(THRESHOLDS.score);
      expect(result.passed, rule).toBe(false);
    }
  });

  it("never lets a single-action strategy pass", () => {
    for (const id of ids) expect(score(run(() => id)).passed, id).toBe(false);
  });
});

describe("learning evidence is separate from the score", () => {
  it("records deciding facts and habits without changing the score", () => {
    const a = createGame(SCENARIO);
    const b = createGame(SCENARIO);
    for (const [state, fact] of [[a, "owner"], [b, "why"]] as const) {
      inspect(state, SCENARIO.guided);
      pickFact(state, SCENARIO.guided, fact);
      decide(state, SCENARIO.guided, "migrate");
      finish(state);
    }
    expect(score(a)).toEqual(score(b));
    expect(learning(a).factsMatched).toBe(1);
    expect(learning(b).factsMatched).toBe(0);
  });

  it("names block-without-alternative and risky approvals", () => {
    const blocked = learning(playAll(SCENARIO, () => "block"));
    expect(blocked.blockedWithAlternative).toContain("ai-tool");
    expect(blocked.blockedWithAlternative).not.toContain("smart-speaker");
    expect(blocked.disruptedSanctioned).toHaveLength(3);
    const approved = learning(playAll(SCENARIO, () => "approve"));
    expect(approved.approvedRisky).toContain("personal-share");
    expect(approved.approvedRisky).not.toContain("saas-nosso");
  });
});
