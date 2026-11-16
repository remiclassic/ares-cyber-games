import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/insider/data";
import {
  CLASSES,
  MAX_CITES,
  POINTS,
  RESPONSES,
  SOURCES,
  THRESHOLDS,
  advance,
  bestResponses,
  canCheck,
  check,
  checkedFor,
  createGame,
  currentCase,
  fileCase,
  gradeCase,
  learning,
  meters,
  score,
  type Case,
  type Classification,
  type Filing,
  type GameState,
  type Response,
  type Source,
} from "../src/insider/engine";

const ALL = SOURCES.map((source) => source.id);
const cases = SCENARIO.cases;

type Plan = (entry: Case, state: GameState) => { checks: readonly Source[]; classification: Classification; response: Response; cite?: "support" | "none" };

// Plays the whole shift. Checks are attempted in order (the engine refuses once the pool is empty)
// and the player cites the best available facts among those actually revealed.
function run(plan: Plan): GameState {
  const state = createGame(SCENARIO);
  while (state.phase === "play") {
    const entry = currentCase(state);
    const move = plan(entry, state);
    for (const source of move.checks) check(state, source);
    const seen = checkedFor(state, entry.id);
    const cites = move.cite === "none" ? [] : [...seen.filter((s) => entry.supports.includes(s)), ...seen.filter((s) => !entry.supports.includes(s))].slice(0, MAX_CITES);
    expect(fileCase(state, { classification: move.classification, cites, response: move.response })).not.toBeNull();
    expect(advance(state)).toBe(true);
  }
  return state;
}

const best: Plan = (entry) => ({ checks: entry.deciding, classification: entry.truth, response: bestResponses(entry)[0] });

describe("Insider or Accident: content", () => {
  it("has six cases: guided first, hints in the middle, none on the final two", () => {
    expect(cases).toHaveLength(6);
    expect(cases[0].guided).toBe(true);
    expect(cases.slice(1, 4).every((entry) => entry.hint)).toBe(true);
    expect(cases.slice(-2).every((entry) => !entry.hint && !entry.guided)).toBe(true);
  });

  it("covers every classification and makes every response the best one somewhere", () => {
    expect(new Set(cases.map((entry) => entry.truth))).toEqual(new Set(CLASSES.map((entry) => entry.id)));
    expect(new Set(cases.flatMap(bestResponses))).toEqual(new Set(RESPONSES.map((entry) => entry.id)));
    for (const entry of cases) expect(bestResponses(entry).length).toBeGreaterThan(0);
  });

  it("gives every case a fact per source, with deciding evidence inside the supporting set", () => {
    for (const entry of cases) {
      for (const source of ALL) expect(entry.facts[source].length).toBeGreaterThan(20);
      expect(entry.deciding).toHaveLength(2);
      for (const source of entry.deciding) expect(entry.supports).toContain(source);
    }
  });

  it("has three look-alikes: the same 23:00 log pattern is authorised, malicious and compromised", () => {
    const pattern = (text: string) => text.replace(/\d+/g, "#").replace(/from the .*? (share|archive)/, "from X");
    const alike = cases.filter((entry) => /^23:0\d to 23:\d\d: \d+ GB bulk download/.test(entry.facts.log));
    expect(alike).toHaveLength(3);
    expect(new Set(alike.map((entry) => pattern(entry.facts.log))).size).toBe(1);
    expect(alike.map((entry) => entry.truth).sort()).toEqual(["authorised", "compromised", "malicious"]);
    // The log cannot be the evidence that splits them.
    for (const entry of alike) expect(entry.supports).not.toContain("log");
  });

  it("never lets who the person is decide a case: HR context is not supporting evidence anywhere", () => {
    for (const entry of cases) expect(entry.supports).not.toContain("hr");
    // Being on notice appears on an innocent case as well as the guilty one.
    const onNotice = cases.filter((entry) => entry.facts.hr.startsWith("On notice"));
    expect(onNotice.map((entry) => entry.truth).sort()).toEqual(["authorised", "malicious"]);
  });

  it("budgets far fewer checks than everything, and enough for the deciding evidence", () => {
    expect(SCENARIO.budget).toBeLessThan(cases.length * ALL.length * 0.5);
    expect(SCENARIO.budget).toBeGreaterThanOrEqual(cases.length * 3);
  });
});

describe("Insider or Accident: rules", () => {
  it("spends one check per source, once, from a pool shared across cases", () => {
    const state = createGame(SCENARIO);
    expect(check(state, "log")).toBe(cases[0].facts.log);
    expect(state.checksLeft).toBe(SCENARIO.budget - 1);
    expect(check(state, "log")).toBeNull();
    expect(state.checksLeft).toBe(SCENARIO.budget - 1);
    fileCase(state, { classification: "mistake", cites: ["log"], response: "coach" });
    expect(canCheck(state, "ticket")).toBe(false); // filed: the case file is closed
    advance(state);
    expect(state.checksLeft).toBe(SCENARIO.budget - 1);
    expect(check(state, "log")).toBe(cases[1].facts.log);
  });

  it("refuses checks once the pool is empty", () => {
    const state = createGame(SCENARIO);
    let spent = 0;
    while (state.phase === "play") {
      for (const source of ALL) if (check(state, source)) spent += 1;
      fileCase(state, { classification: "mistake", cites: [], response: "coach" });
      advance(state);
    }
    expect(spent).toBe(SCENARIO.budget);
    expect(state.checksLeft).toBe(0);
    expect(learning(state).checksPerCase).toEqual([8, 8, 4, 0, 0, 0]);
  });

  it("only accepts cites that were revealed, at most two, and filing is final", () => {
    const state = createGame(SCENARIO);
    check(state, "log");
    expect(fileCase(state, { classification: "mistake", cites: ["ticket"], response: "coach" })).toBeNull();
    check(state, "ticket");
    check(state, "dest");
    expect(fileCase(state, { classification: "mistake", cites: ["log", "ticket", "dest"], response: "coach" })).toBeNull();
    expect(advance(state)).toBe(false); // nothing filed yet
    expect(fileCase(state, { classification: "mistake", cites: ["ticket", "dest"], response: "coach" })?.points).toBe(POINTS.perCase);
    expect(fileCase(state, { classification: "gap", cites: [], response: "fix" })).toBeNull();
  });

  it("scores a case as classification 4 + evidence 2 + response 4", () => {
    const entry = cases[0];
    const filing: Filing = { classification: "mistake", cites: ["ticket", "dest"], response: "coach" };
    expect(gradeCase(entry, ["ticket", "dest"], filing)).toMatchObject({ classPoints: 4, citePoints: 2, responsePoints: 4, points: 10, supported: true });
    // One supporting fact and one that does not settle it.
    expect(gradeCase(entry, ["ticket", "hr"], { ...filing, cites: ["ticket", "hr"] }).points).toBe(9);
    // Right reading, partly right response.
    expect(gradeCase(entry, ["ticket", "dest"], { ...filing, response: "fix" }).points).toBe(8);
  });

  it("gives an unsupported call no classification points and half response points", () => {
    const entry = cases[0];
    const blind = gradeCase(entry, [], { classification: "mistake", cites: [], response: "coach" });
    expect(blind).toMatchObject({ classRight: true, supported: false, classPoints: 0, citePoints: 0, responsePoints: 2, points: 2 });
    // Checked evidence but cited only a fact that does not support the reading.
    const weak = gradeCase(entry, ["hr", "ticket"], { classification: "mistake", cites: ["hr"], response: "coach" });
    expect(weak.points).toBe(2);
  });

  it("moves trust down for a wrongful accusation and exposure up for a missed theft", () => {
    for (const entry of cases) {
      if (entry.truth !== "malicious") expect(entry.outcomes.investigate.trust).toBeLessThan(0);
      if (entry.truth === "malicious" || entry.truth === "compromised") {
        expect(entry.outcomes.close.exposure).toBeGreaterThanOrEqual(15);
        expect(entry.outcomes.coach.exposure).toBeGreaterThanOrEqual(15);
      }
    }
    const state = createGame(SCENARIO);
    check(state, "log");
    fileCase(state, { classification: "malicious", cites: ["log"], response: "investigate" });
    expect(meters(state).trust).toBe(SCENARIO.start.trust + cases[0].outcomes.investigate.trust);
  });
});

describe("Insider or Accident: strategies", () => {
  it("best play scores the maximum, well inside the check budget", () => {
    const state = run(best);
    const result = score(state);
    expect(result.total).toBe(100);
    expect(result.raw).toBe(result.max);
    expect(result.passed).toBe(true);
    expect(result.checksUsed).toBe(12);
    expect(result.checksUsed).toBeLessThanOrEqual(SCENARIO.budget);
    const learn = learning(state);
    expect(learn).toMatchObject({ classRight: 6, supportedCalls: 6, proportionate: 6, decidingFound: 12 });
    expect(learn.overAccused).toEqual([]);
    expect(learn.underReacted).toEqual([]);
  });

  it("a careful first-timer spending three checks a case can still score 100", () => {
    const state = run((entry) => ({ checks: ["log", ...entry.deciding], classification: entry.truth, response: bestResponses(entry)[0] }));
    expect(score(state).total).toBe(100);
    expect(score(state).checksUsed).toBe(18);
  });

  it("'always malicious' loses, with a visible trust cost", () => {
    // Even with well-chosen evidence on every case.
    const state = run((entry) => ({ checks: entry.deciding, classification: "malicious", response: "investigate" }));
    const result = score(state);
    expect(result.total).toBeLessThan(50);
    expect(result.passed).toBe(false);
    expect(result.trust).toBeLessThan(THRESHOLDS.minTrust);
    expect(result.reasons.some((reason) => reason.includes("trust"))).toBe(true);
    expect(learning(state).overAccused).toHaveLength(5);
  });

  it("'always an accident, close everything' loses: the leaver's exfiltration is missed", () => {
    for (const response of ["close", "coach"] as const) {
      const state = run((entry) => ({ checks: entry.deciding, classification: "mistake", response }));
      const result = score(state);
      expect(result.total).toBeLessThan(50);
      expect(result.passed).toBe(false);
      expect(learning(state).underReacted).toEqual(["night-accounts", "night-finance"]);
    }
    const closed = score(run((entry) => ({ checks: entry.deciding, classification: "mistake", response: "close" })));
    expect(closed.exposure).toBeGreaterThan(THRESHOLDS.maxExposure);
    expect(closed.reasons.some((reason) => reason.includes("exposure"))).toBe(true);
  });

  it("deciding without spending checks loses, even with every answer right", () => {
    const state = run((entry) => ({ checks: [], classification: entry.truth, response: bestResponses(entry)[0] }));
    const result = score(state);
    expect(result.total).toBe(20);
    expect(result.passed).toBe(false);
    expect(learning(state).blindCalls).toHaveLength(6);
  });

  it("checking every source on every case runs out and loses, even with every answer right", () => {
    const state = run((entry) => ({ checks: ALL, classification: entry.truth, response: bestResponses(entry)[0] }));
    const result = score(state);
    expect(state.checksLeft).toBe(0);
    expect(learning(state).blindCalls).toEqual(cases.slice(3).map((entry) => entry.id));
    expect(result.total).toBeLessThan(THRESHOLDS.score);
    expect(result.passed).toBe(false);
  });

  it("every single-answer strategy stays under the pass mark", () => {
    for (const cls of CLASSES) {
      for (const response of RESPONSES) {
        const result = score(run((entry) => ({ checks: entry.deciding, classification: cls.id, response: response.id })));
        expect(result.total, `${cls.id}/${response.id}`).toBeLessThan(60);
        expect(result.passed).toBe(false);
      }
    }
  });

  it("right answers with unrelated evidence score below right answers with supporting evidence", () => {
    const weak = score(run((entry) => ({ checks: ["hr"], classification: entry.truth, response: bestResponses(entry)[0] })));
    expect(weak.total).toBe(20);
    expect(weak.passed).toBe(false);
  });
});
