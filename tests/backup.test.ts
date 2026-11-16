import { describe, expect, it } from "vitest";
import { GAME } from "../src/backup/data";
import {
  FREQ,
  FREQS,
  INCIDENT,
  LOC,
  LOCS,
  MAX_CHOICE,
  NO_BACKUP,
  allInCloud,
  allOnShare,
  bestChoice,
  bestPlan,
  bestStrategy,
  canCommit,
  canHint,
  cheapestEverywhere,
  commit,
  costOf,
  createGame,
  currentScenario,
  explain,
  flatDaily,
  maxEverything,
  neverTest,
  next,
  nothingAtAll,
  planCost,
  playStrategy,
  resolve,
  rpoOf,
  rtoOf,
  scorePlan,
  setChoice,
  spent,
  summarize,
  takeHint,
  type Choice,
  type Strategy,
  type System,
} from "../src/backup/sim";

const scenarios = GAME.scenarios;
const [year1, year2, year3] = scenarios;
const sys = (scenario: (typeof scenarios)[number], id: string): System => scenario.systems.find((system) => system.id === id)!;
const total = (strategy: Strategy) => summarize(playStrategy(GAME, strategy)!);
const perRound = (strategy: Strategy) => playStrategy(GAME, strategy)!.results.map((result) => result.points);
const choices: Choice[] = [NO_BACKUP, ...FREQS.filter((freq) => freq !== "none").flatMap((freq) => LOCS.flatMap((loc) => [false, true].map((test) => ({ freq, loc, test }))))];

describe("costs and budget", () => {
  it("prices frequency + location + test, and nothing for no backup", () => {
    expect(costOf(NO_BACKUP)).toBe(0);
    expect(costOf({ freq: "none", loc: "offline", test: true })).toBe(0);
    expect(costOf({ freq: "weekly", loc: "same", test: false })).toBe(1);
    expect(costOf({ freq: "daily", loc: "cloud", test: true })).toBe(5);
    expect(costOf(MAX_CHOICE)).toBe(8);
  });

  it("costs more for better protection on every axis", () => {
    expect(FREQ.weekly.cost).toBeLessThan(FREQ.daily.cost);
    expect(FREQ.daily.cost).toBeLessThan(FREQ.hourly.cost);
    expect(LOC.same.cost).toBeLessThan(LOC.share.cost);
    expect(LOC.share.cost).toBeLessThan(LOC.cloud.cost);
    expect(LOC.cloud.cost).toBeLessThan(LOC.offline.cost);
  });

  it("refuses to commit a plan that is over budget", () => {
    const state = createGame(GAME);
    for (const system of year1.systems) setChoice(state, system.id, MAX_CHOICE);
    expect(spent(state)).toBe(32);
    expect(canCommit(state)).toBe(false);
    expect(commit(state)).toBeNull();
    expect(state.phase).toBe("plan");
  });

  it("ignores location and test changes while there is no backup", () => {
    const state = createGame(GAME);
    expect(setChoice(state, "patients", { loc: "cloud" })).toBe(false);
    expect(setChoice(state, "patients", { test: true })).toBe(false);
    expect(setChoice(state, "nope", { freq: "daily" })).toBe(false);
    expect(setChoice(state, "patients", { freq: "daily" })).toBe(true);
    expect(setChoice(state, "patients", { loc: "cloud", test: true })).toBe(true);
    expect(spent(state)).toBe(5);
    expect(setChoice(state, "patients", { freq: "none" })).toBe(true);
    expect(state.plan.patients).toEqual(NO_BACKUP);
  });
});

describe("recovery rules", () => {
  const patients = sys(year1, "patients"); // critical, changes all day, live database, ransomware
  const drive = sys(year1, "drive"); // important, changes daily, plain files, ransomware

  it("loses a system with no backup", () => {
    const outcome = resolve(drive, NO_BACKUP);
    expect(outcome).toMatchObject({ verdict: "lost", reason: "none", usable: false, points: 0 });
  });

  it("loses any copy the incident can reach, however often it ran or was tested", () => {
    for (const scenario of scenarios) {
      for (const system of scenario.systems.filter((entry) => !entry.rebuildable)) {
        for (const loc of INCIDENT[system.hit].reaches) {
          expect(resolve(system, { freq: "hourly", loc, test: true }).points).toBe(0);
        }
      }
    }
  });

  it("ransomware reaches the same server and the network share, not cloud or offline", () => {
    expect(resolve(drive, { freq: "daily", loc: "same", test: true }).reason).toBe("reached");
    expect(resolve(drive, { freq: "daily", loc: "share", test: true }).reason).toBe("reached");
    expect(resolve(drive, { freq: "daily", loc: "cloud", test: false }).usable).toBe(true);
    expect(resolve(drive, { freq: "daily", loc: "offline", test: false }).usable).toBe(true);
  });

  it("a failed disk only reaches the same server; a lockout reaches the cloud; a takeover leaves only offline", () => {
    expect(INCIDENT.disk.reaches).toEqual(["same"]);
    expect(INCIDENT.lockout.reaches).toContain("cloud");
    expect(INCIDENT.lockout.reaches).not.toContain("share");
    expect(INCIDENT.delete.reaches).toContain("share");
    expect(LOCS.filter((loc) => !INCIDENT.takeover.reaches.includes(loc))).toEqual(["offline"]);
    for (const kind of Object.keys(INCIDENT) as (keyof typeof INCIDENT)[]) {
      expect(INCIDENT[kind].reaches).toContain("same");
      expect(INCIDENT[kind].reaches).not.toContain("offline");
    }
  });

  it("an untested copy of a live database does not restore", () => {
    expect(resolve(patients, { freq: "hourly", loc: "cloud", test: false })).toMatchObject({ verdict: "lost", reason: "untested", points: 0 });
    expect(resolve(patients, { freq: "hourly", loc: "cloud", test: true }).points).toBe(100);
  });

  it("an untested restore takes twice as long", () => {
    expect(resolve(drive, { freq: "daily", loc: "cloud", test: true }).downHours).toBe(4);
    expect(resolve(drive, { freq: "daily", loc: "cloud", test: false }).downHours).toBe(8);
  });

  it("data lost is the gap between backups, judged against how fast the system changes", () => {
    expect(rpoOf(patients)).toBe(1);
    expect(rtoOf(patients)).toBe(6);
    const daily = resolve(patients, { freq: "daily", loc: "cloud", test: true });
    expect(daily).toMatchObject({ lostHours: 24, rpoMet: false, rtoMet: true, verdict: "partial", points: 85 });
    const weekly = resolve(patients, { freq: "weekly", loc: "cloud", test: true });
    expect(weekly).toMatchObject({ lostHours: 168, points: 70 });
    // Backing up more often than the data changes buys nothing.
    expect(resolve(drive, { freq: "hourly", loc: "cloud", test: false }).points).toBe(resolve(drive, { freq: "daily", loc: "cloud", test: false }).points);
  });

  it("time down is judged against how critical the system is", () => {
    const booking = sys(year3, "booking"); // critical, plain files, only offline survives
    expect(resolve(booking, { freq: "hourly", loc: "offline", test: true })).toMatchObject({ downHours: 6, rtoMet: true, points: 100 });
    expect(resolve(booking, { freq: "hourly", loc: "offline", test: false })).toMatchObject({ downHours: 12, rtoMet: false, points: 85 });
  });

  it("a rebuildable system needs no backup at all", () => {
    const display = sys(year2, "display");
    expect(resolve(display, NO_BACKUP)).toMatchObject({ verdict: "rebuilt", points: 100 });
    expect(bestChoice(display)).toEqual(NO_BACKUP);
    expect(scorePlan(year2, { ...bestPlan(year2), display: MAX_CHOICE }).wasted).toBe(8);
  });

  it("explains every outcome in plain words", () => {
    for (const scenario of scenarios) for (const system of scenario.systems) for (const choice of choices) expect(explain(system, choice).length).toBeGreaterThan(20);
    expect(explain(drive, { freq: "daily", loc: "share", test: true })).toMatch(/not a backup/);
    expect(explain(patients, { freq: "hourly", loc: "cloud", test: false })).toMatch(/nobody had ever restored/);
  });
});

describe("content", () => {
  it("has three scenarios: guided, hints, final", () => {
    expect(scenarios.map((scenario) => scenario.mode)).toEqual(["guided", "hints", "final"]);
    expect(year3.systems.length).toBeGreaterThan(year1.systems.length);
  });

  it("uses all four incident kinds and unique system ids", () => {
    const kinds = new Set(scenarios.flatMap((scenario) => scenario.systems.map((system) => system.hit)));
    for (const kind of ["disk", "ransomware", "delete", "lockout"] as const) expect(kinds.has(kind) || (kind === "ransomware" && kinds.has("takeover"))).toBe(true);
    for (const scenario of scenarios) expect(new Set(scenario.systems.map((system) => system.id)).size).toBe(scenario.systems.length);
  });

  it("has exactly one cheapest full-recovery choice per system, so the reference plan is not a coin toss", () => {
    for (const scenario of scenarios) {
      for (const system of scenario.systems) {
        const full = choices.filter((choice) => resolve(system, choice).points === 100);
        const min = Math.min(...full.map(costOf));
        expect(full.filter((choice) => costOf(choice) === min), `${scenario.id}/${system.id}`).toHaveLength(1);
      }
    }
  });

  it("the right location differs between scenarios", () => {
    const locs = scenarios.map((scenario) => new Set(scenario.systems.filter((system) => !system.rebuildable).map((system) => bestChoice(system).loc)));
    expect([...locs[0]]).toEqual(["cloud"]);
    expect(locs[1].has("share") && locs[1].has("cloud")).toBe(true);
    expect([...locs[2]]).toEqual(["offline"]);
  });

  it("the reference plan mixes frequencies and tests only some systems", () => {
    for (const scenario of scenarios) {
      const best = Object.values(bestPlan(scenario)).filter((choice) => choice.freq !== "none");
      expect(new Set(best.map((choice) => choice.freq)).size).toBe(3);
      expect(best.some((choice) => choice.test)).toBe(true);
      expect(best.some((choice) => !choice.test)).toBe(true);
    }
  });
});

describe("best play and the shortcuts", () => {
  it("best play scores the maximum within budget in every scenario", () => {
    for (const scenario of scenarios) {
      const plan = bestPlan(scenario);
      expect(planCost(scenario, plan)).toBeLessThanOrEqual(scenario.budget);
      expect(scenario.budget - planCost(scenario, plan)).toBeLessThanOrEqual(1);
      expect(scorePlan(scenario, plan)).toMatchObject({ points: 100, lost: 0, wasted: 0 });
    }
    const summary = total(bestStrategy);
    expect(summary.score).toBe(300);
    expect(summary.max).toBe(300);
    expect(summary.lost).toBe(0);
  });

  it("'back up everything at maximum' never fits the budget", () => {
    for (const scenario of scenarios) expect(planCost(scenario, maxEverything(scenario))).toBeGreaterThan(scenario.budget * 1.5);
    expect(playStrategy(GAME, maxEverything)).toBeNull();
  });

  it("'cheapest everywhere' loses: under 15 in every scenario", () => {
    for (const strategy of [cheapestEverywhere, nothingAtAll]) {
      for (const points of perRound(strategy)) expect(points).toBeLessThan(15);
      expect(total(strategy).score).toBeLessThan(30);
    }
  });

  it("'every copy on the network share' loses to ransomware", () => {
    const [one, two, three] = perRound(allOnShare);
    expect(one).toBe(0); // ransomware
    expect(three).toBeLessThan(15); // ransomware with a stolen admin login
    expect(two).toBeLessThan(90); // no ransomware, but the late delete still beats a week of history
    expect(total(allOnShare).score).toBeLessThan(120);
  });

  it("'skip every test restore' loses in every scenario", () => {
    for (const points of perRound(neverTest)) expect(points).toBeLessThan(70);
    expect(total(neverTest).score).toBeLessThan(170);
    expect(total(neverTest).lost).toBeGreaterThanOrEqual(6);
  });

  it("'cloud for everything' and 'the same daily backup for everything' also fall short", () => {
    expect(scorePlan(year1, allInCloud(year1)).points).toBe(100); // right for year 1 only
    expect(planCost(year2, allInCloud(year2))).toBeGreaterThan(year2.budget); // dearer than needed, and the lockout takes two of them
    expect(scorePlan(year2, allInCloud(year2)).points).toBeLessThan(80);
    expect(scorePlan(year3, allInCloud(year3)).points).toBeLessThan(15);
    expect(total(flatDaily).score).toBeLessThan(150);
  });

  it("no plan within budget beats the reference plan", () => {
    // Systems are independent, so the best affordable total is a small knapsack over per-system choices.
    for (const scenario of scenarios) {
      let best = new Map<number, number>([[0, 0]]); // cost -> weighted points
      for (const system of scenario.systems) {
        const nextBest = new Map<number, number>();
        for (const [cost, points] of best) {
          for (const choice of choices) {
            const c = cost + costOf(choice);
            if (c > scenario.budget) continue;
            const p = points + system.criticality * resolve(system, choice).points;
            if ((nextBest.get(c) ?? -1) < p) nextBest.set(c, p);
          }
        }
        best = nextBest;
      }
      const weight = scenario.systems.reduce((sum, system) => sum + system.criticality, 0);
      expect(Math.max(...best.values()) / weight).toBe(100);
    }
  });
});

describe("game flow", () => {
  it("plays three scenarios and then is done", () => {
    const state = playStrategy(GAME, bestStrategy)!;
    expect(state.phase).toBe("done");
    expect(state.results).toHaveLength(3);
  });

  it("offers a free, counted hint only in the middle scenario", () => {
    const state = createGame(GAME);
    expect(canHint(state)).toBe(false);
    expect(takeHint(state)).toBe(false);
    commit(state);
    next(state);
    expect(currentScenario(state).mode).toBe("hints");
    expect(takeHint(state)).toBe(true);
    expect(takeHint(state)).toBe(false);
    for (const [id, choice] of Object.entries(bestPlan(year2))) if (choice.freq !== "none") setChoice(state, id, choice);
    const result = commit(state)!;
    expect(result.hinted).toBe(true);
    expect(result.points).toBe(100); // the hint costs nothing
    next(state);
    expect(canHint(state)).toBe(false);
    commit(state);
    next(state);
    expect(summarize(state).evidence.hintsUsed).toBe(1);
  });

  it("starts each scenario with an empty plan and cannot change a committed one", () => {
    const state = createGame(GAME);
    setChoice(state, "drive", { freq: "daily" });
    commit(state);
    expect(setChoice(state, "drive", { freq: "hourly" })).toBe(false);
    expect(commit(state)).toBeNull();
    next(state);
    expect(Object.values(state.plan).every((choice) => choice.freq === "none")).toBe(true);
    expect(Object.keys(state.plan)).toEqual(year2.systems.map((system) => system.id));
  });
});

describe("score vs learning evidence", () => {
  it("keeps evidence apart from the score", () => {
    const best = total(bestStrategy);
    expect(best.evidence).toMatchObject({ attempt: 1, firstAttempt: true, needing: 15, copySurvived: 15, frequencyFits: 15, wasted: 0, finalRecovered: 7, finalTotal: 7, hintsUsed: 0 });
    expect(best.evidence.testsPlaced).toBe(best.evidence.testsNeeded);
    expect(best.evidence.testsNeeded).toBe(7);

    const untested = total(neverTest);
    expect(untested.evidence.copySurvived).toBe(15); // right places, right frequency...
    expect(untested.evidence.frequencyFits).toBe(15);
    expect(untested.evidence.testsPlaced).toBe(0); // ...never proven
    expect(untested.score).toBeLessThan(best.score);

    const share = total(allOnShare);
    expect(share.evidence.copySurvived).toBe(4); // only the year 2 disk and lockout systems
    expect(share.evidence.testsPlaced).toBe(share.evidence.testsNeeded);
  });

  it("tags a retry with its attempt number", () => {
    const state = createGame(GAME, 2);
    expect(summarize(state).evidence).toMatchObject({ attempt: 2, firstAttempt: false });
  });
});
