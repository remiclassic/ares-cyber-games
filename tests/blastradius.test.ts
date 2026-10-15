import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/blastradius/data/scenario";
import { apply, createGame, currentCase, evidence, markedBehind, minutesLeft, summarize, truth } from "../src/blastradius/sim/engine";
import { deduce, knowledge, triagesNeeded, truthOf } from "../src/blastradius/sim/logic";
import type { Command, Decision, GameState } from "../src/blastradius/sim/types";

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

// Reads every sensor, triages the fewest hosts that settle the case, decides from the proof.
function playBest(state: GameState): void {
  const def = currentCase(state);
  for (const sensor of def.sensors) must(state, { type: "read", sensor: sensor.id });
  for (const host of triagesNeeded(def, truth(state)).hosts) must(state, { type: "triage", host });
  const known = knowledge(def, truth(state), evidence(state));
  for (const host of def.hosts) must(state, { type: "decide", host: host.id, decision: known.get(host.id) === "compromised" ? "isolate" : "keep" });
  must(state, { type: "submit", elapsedSeconds: 60 });
}

function playBlanket(state: GameState, decision: Decision, read: boolean): void {
  const def = currentCase(state);
  if (read) for (const sensor of def.sensors) must(state, { type: "read", sensor: sensor.id });
  for (const host of def.hosts) must(state, { type: "decide", host: host.id, decision });
  must(state, { type: "submit", elapsedSeconds: 30 });
}

function finishCase(state: GameState): void {
  const record = state.records[state.records.length - 1];
  if (record.check) must(state, { type: "answer", choice: record.check.correct });
  must(state, { type: "next" });
}

describe("scenario content", () => {
  it("has three cases with two different truths each", () => {
    expect(SCENARIO.cases).toHaveLength(3);
    for (const def of SCENARIO.cases) {
      const [a, b] = def.variants.map((variant) => [...variant.compromised].sort().join());
      expect(a).not.toBe(b);
      for (const variant of def.variants) for (const id of variant.compromised) expect(def.hosts.some((host) => host.id === id)).toBe(true);
      for (const sensor of def.sensors) for (const id of sensor.covers) expect(def.hosts.some((host) => host.id === id)).toBe(true);
    }
  });

  it("puts every host behind at least one sensor", () => {
    for (const def of SCENARIO.cases) {
      for (const host of def.hosts) expect(def.sensors.some((sensor) => sensor.covers.includes(host.id))).toBe(true);
    }
  });

  it("never settles a case from the sensors alone, but always within the triage budget", () => {
    const { readSensor, triage } = SCENARIO.costs;
    for (const def of SCENARIO.cases) {
      for (const variant of [0, 1]) {
        const real = truthOf(def, variant);
        const need = triagesNeeded(def, real).count;
        expect(need, `${def.id}/${variant}`).toBeGreaterThanOrEqual(1);
        expect(def.sensors.length * readSensor + need * triage, `${def.id}/${variant}`).toBeLessThanOrEqual(def.budgetMinutes);
        // And the budget never allows triaging every host.
        expect(def.sensors.length * readSensor + def.hosts.length * triage).toBeGreaterThan(def.budgetMinutes);
      }
    }
  });
});

describe("deduction", () => {
  const def = SCENARIO.cases[0];

  it("clears the other hosts behind a sensor once its count is accounted for", () => {
    const real = truthOf(def, 0); // hb-ws-03 only
    const evidenceSet = { reads: new Set(["hb-dns", "hb-proxy"]), triages: new Set(["hb-ws-03"]) };
    const reasons = deduce(def, real, evidenceSet);
    expect(reasons.get("hb-lt-01")?.status).toBe("clean");
    expect(reasons.get("hb-lt-01")?.reason).toContain("Branch DNS forwarder counted 1");
    expect(reasons.get("hb-ws-05")?.status).toBe("clean");
  });

  it("agrees with the full check on every host it explains", () => {
    for (const caseDef of SCENARIO.cases) {
      for (const variant of [0, 1]) {
        const real = truthOf(caseDef, variant);
        const evidenceSet = { reads: new Set(caseDef.sensors.map((sensor) => sensor.id)), triages: new Set(triagesNeeded(caseDef, real).hosts) };
        const known = knowledge(caseDef, real, evidenceSet);
        for (const [host, entry] of deduce(caseDef, real, evidenceSet)) {
          expect(entry.status).toBe(known.get(host));
          expect(entry.status === "compromised").toBe(real.has(host));
        }
      }
    }
  });

  it("does not claim knowledge it does not have", () => {
    const real = truthOf(def, 1);
    const known = knowledge(def, real, { reads: new Set(["hb-dns"]), triages: new Set() });
    expect([...known.values()].every((value) => value === "unknown")).toBe(true);
  });
});

describe("rules", () => {
  it("charges case time and refuses actions past the budget", () => {
    const state = createGame(SCENARIO, "budget");
    must(state, { type: "read", sensor: "hb-dns" });
    expect(minutesLeft(state)).toBe(55);
    must(state, { type: "triage", host: "hb-lt-01" });
    must(state, { type: "triage", host: "hb-lt-02" });
    expect(minutesLeft(state)).toBe(15);
    expect(apply(state, { type: "triage", host: "hb-ws-04" }).ok).toBe(false);
    expect(apply(state, { type: "read", sensor: "hb-dns" }).ok).toBe(false);
    must(state, { type: "read", sensor: "hb-proxy" });
  });

  it("requires a decision on every host before submitting", () => {
    const state = createGame(SCENARIO, "submit");
    must(state, { type: "decide", host: "hb-lt-01", decision: "keep" });
    const result = apply(state, { type: "submit", elapsedSeconds: 5 });
    expect(result.ok).toBe(false);
  });

  it("shows how many hosts are marked for isolation behind each sensor", () => {
    const state = createGame(SCENARIO, "marks");
    must(state, { type: "decide", host: "hb-ws-03", decision: "isolate" });
    must(state, { type: "decide", host: "hb-ws-04", decision: "isolate" });
    expect(markedBehind(state, "hb-dns")).toBe(1);
    expect(markedBehind(state, "hb-proxy")).toBe(2);
  });

  it("swaps every case to its other truth on retry", () => {
    const first = createGame(SCENARIO, "retry", 0);
    const second = createGame(SCENARIO, "retry", 1);
    expect(second.variant).toBe(1 - first.variant);
  });

  it("rebuilds the same result from the seed and the command log", () => {
    const state = createGame(SCENARIO, "replay");
    playBest(state);
    const record = state.records[0];
    const again = createGame(SCENARIO, "replay");
    for (const command of record.log) must(again, command);
    expect(again.records[0].score).toEqual(record.score);
  });
});

describe("scoring", () => {
  for (const seed of ["a", "b", "c", "d"]) {
    it(`gives 100 to the evidence-led best play (seed ${seed})`, () => {
      const state = createGame(SCENARIO, seed);
      for (let index = 0; index < SCENARIO.cases.length; index += 1) {
        playBest(state);
        expect(state.records[index].score.total, state.records[index].caseId).toBe(100);
        finishCase(state);
      }
      expect(state.phase).toBe("done");
      expect(summarize(state.records).total).toBe(100);
    });
  }

  it("keeps blanket strategies well under 60", () => {
    for (const [decision, read] of [["isolate", true], ["isolate", false], ["keep", true], ["watch", false], ["watch", true]] as const) {
      const state = createGame(SCENARIO, "blanket");
      for (let index = 0; index < SCENARIO.cases.length; index += 1) {
        playBlanket(state, decision, read);
        finishCase(state);
      }
      expect(summarize(state.records).total, `${decision}/${read}`).toBeLessThan(60);
    }
  });

  it("pays less for a right answer that was a guess", () => {
    const guessed = createGame(SCENARIO, "guess");
    const real = truth(guessed);
    for (const host of currentCase(guessed).hosts) must(guessed, { type: "decide", host: host.id, decision: real.has(host.id) ? "isolate" : "keep" });
    must(guessed, { type: "submit", elapsedSeconds: 10 });
    const score = guessed.records[0].score;
    expect(score.containment).toBe(40);
    expect(score.continuity).toBe(30);
    expect(score.evidence).toBe(0);
    expect(score.efficiency).toBe(0);
    expect(score.total).toBe(70);
    expect(guessed.records[0].outcomes.every((outcome) => outcome.why.includes("guess"))).toBe(true);
  });

  it("credits Watch only as honest uncertainty after the sensors in front were read", () => {
    const watchAll = (read: boolean) => {
      const state = createGame(SCENARIO, "watch");
      if (read) for (const sensor of currentCase(state).sensors) must(state, { type: "read", sensor: sensor.id });
      for (const host of currentCase(state).hosts) must(state, { type: "decide", host: host.id, decision: "watch" });
      must(state, { type: "submit", elapsedSeconds: 10 });
      return state.records[0].outcomes.filter((outcome) => outcome.supported).length;
    };
    expect(watchAll(false)).toBe(0);
    // Case 1 never settles from its sensors alone, so every Watch is honest once both are read.
    expect(watchAll(true)).toBe(5);
  });

  it("weights a wrongly isolated critical server more than a workstation", () => {
    const run = (isolateClean: string) => {
      const state = createGame(SCENARIO, "weights");
      while (state.caseIndex < 2) {
        playBest(state);
        finishCase(state);
      }
      const def = currentCase(state);
      const real = truth(state);
      for (const host of def.hosts) must(state, { type: "decide", host: host.id, decision: real.has(host.id) || host.id === isolateClean ? "isolate" : "keep" });
      must(state, { type: "submit", elapsedSeconds: 10 });
      return state.records[2].score.continuity;
    };
    // Both critical hosts and FIN-01 are clean in variant 1; pick a seed whose third case is it.
    const seed = ["w0", "w1", "w2", "w3"].find((candidate) => {
      const state = createGame(SCENARIO, candidate);
      while (state.caseIndex < 2) {
        playBest(state);
        finishCase(state);
      }
      return state.variant === 1;
    })!;
    expect(seed).toBeDefined();
    const runSeeded = (host: string) => {
      const state = createGame(SCENARIO, seed);
      while (state.caseIndex < 2) {
        playBest(state);
        finishCase(state);
      }
      for (const entry of currentCase(state).hosts) must(state, { type: "decide", host: entry.id, decision: truth(state).has(entry.id) || entry.id === host ? "isolate" : "keep" });
      must(state, { type: "submit", elapsedSeconds: 10 });
      return state.records[2].score.continuity;
    };
    expect(runSeeded("pay-db")).toBeLessThan(runSeeded("fin-01"));
    void run;
  });

  it("asks a reasoning check whose right answer is the deduction, not a hunch", () => {
    const state = createGame(SCENARIO, "check");
    playBest(state);
    const check = state.records[0].check!;
    expect(check).not.toBeNull();
    expect(check.options).toHaveLength(3);
    expect(check.options[check.correct]).toMatch(/counted|together|arrangement/);
    must(state, { type: "answer", choice: (check.correct + 1) % 3 });
    expect(state.records[0].answer?.correct).toBe(false);
    expect(apply(state, { type: "answer", choice: check.correct }).ok).toBe(false);
  });
});
