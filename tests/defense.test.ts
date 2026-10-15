import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/defense/data/scenario";
import { apply, createGame, currentWave, runCampaign, summarize } from "../src/defense/sim/engine";
import type { Command, GameState } from "../src/defense/sim/types";

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

function finishWave(state: GameState): void {
  const record = state.records[state.records.length - 1];
  if (record.check) must(state, { type: "answer", choice: record.check.correct });
  must(state, { type: "next" });
}

function playPlan(state: GameState, perWave: readonly (readonly string[])[]): void {
  perWave.forEach((controls, index) => {
    for (const id of controls) must(state, { type: "deploy", control: id });
    must(state, { type: "launch" });
    if (index < perWave.length - 1) finishWave(state);
  });
}

const REFERENCE = SCENARIO.waves.map((wave) => wave.reference);
const seedFor = (variant: number) => ["s0", "s1", "s2", "s3", "s4"].find((seed) => createGame(SCENARIO, seed).variant === variant)!;

describe("content", () => {
  it("only refers to techniques and controls that exist, in the right stages", () => {
    const tech = new Map(SCENARIO.techniques.map((entry) => [entry.id, entry]));
    for (const control of SCENARIO.controls) for (const id of Object.keys(control.effects)) expect(tech.has(id), `${control.id}:${id}`).toBe(true);
    for (const entry of SCENARIO.techniques.filter((item) => item.stage === "initial")) expect(tech.get(entry.leadsTo!)?.stage).toBe("execution");
    for (const wave of SCENARIO.waves) {
      for (const campaign of wave.campaigns) {
        for (const stage of ["initial", "credential", "lateral", "impact"] as const) {
          for (const id of [...campaign[stage], ...(campaign.alt?.[stage] ?? [])]) expect(tech.get(id)?.stage, `${campaign.id}:${id}`).toBe(stage);
        }
      }
      for (const id of wave.reference) expect(SCENARIO.controls.some((control) => control.id === id)).toBe(true);
    }
  });

  it("cannot afford every control", () => {
    const total = SCENARIO.controls.reduce((sum, control) => sum + control.cost, 0);
    const budget = SCENARIO.waves.reduce((sum, wave) => sum + wave.credits, 0);
    expect(budget).toBeLessThan(total / 1.5);
  });
});

describe("the attack model", () => {
  const a = SCENARIO.waves[0].campaigns[0];
  const c = SCENARIO.waves[1].campaigns[0];

  it("runs a fixed playbook to impact when nothing is in the way", () => {
    const run = runCampaign(SCENARIO, a, [], 0);
    expect(run.steps.map((step) => step.technique)).toEqual(["phish-macro", "macro-ps", "lsass-dump", "smb-exec", "ransomware"]);
    expect(run.stopped).toBe(false);
    expect(run.damage).toBe(4);
  });

  it("switches to the next option when the first is blocked", () => {
    const run = runCampaign(SCENARIO, c, ["macro"], 0);
    expect(run.steps[0].technique).toBe("iso-lnk");
    expect(run.steps[0].skipped).toEqual(["phish-macro"]);
    expect(run.steps[1].technique).toBe("lnk-exec");
  });

  it("stops when every option at a stage is blocked", () => {
    const run = runCampaign(SCENARIO, c, ["macro", "attach"], 0);
    expect(run.stopped).toBe(true);
    expect(run.stoppedAt).toBe("initial");
    expect(new Set(run.decisive)).toEqual(new Set(["macro", "attach"]));
  });

  it("treats a detection with nobody responding as no stop at all", () => {
    const run = runCampaign(SCENARIO, a, ["edr"], 0);
    // EDR blocks the LSASS dump on its own, so use a campaign path it only detects.
    expect(run.stoppedAt).toBe("credential");
    const lnk = runCampaign(SCENARIO, c, ["macro", "edr", "credguard"], 0);
    expect(lnk.steps[1].result).toBe("detected");
    expect(lnk.steps[1].unanswered).toBe(true);
  });

  it("contains a detected campaign one stage later when 24×7 response is in service", () => {
    const run = runCampaign(SCENARIO, c, ["macro", "edr", "soc"], 0);
    // Detected at execution, the credential stage runs (EDR blocks LSASS here, so make it run).
    const open = runCampaign(SCENARIO, { ...c, credential: ["creds-in-files"] }, ["macro", "edr", "soc"], 0);
    expect(open.steps.map((step) => step.result)).toEqual(["ran", "detected", "ran", "contained"]);
    expect(open.decisive).toEqual(["edr", "soc"]);
    expect(run.stopped).toBe(true);
  });

  it("contains an interactive session spotted by the SOC two stages on", () => {
    const run = runCampaign(SCENARIO, { ...a, initial: ["bought-creds"], credential: ["creds-in-files"], lateral: ["rdp-lateral"] }, ["edr", "soc"], 0);
    // SOC spots the interactive session at execution, credential runs, lateral is contained.
    expect(run.stoppedAt).toBe("lateral");
  });

  it("backups reduce ransomware damage but do not stop it", () => {
    const run = runCampaign(SCENARIO, a, ["backups"], 0);
    expect(run.stopped).toBe(false);
    expect(run.damage).toBe(2); // foothold + recovered encryption
    expect(run.steps[4].result).toBe("recovered");
  });
});

describe("scoring", () => {
  for (const variant of [0, 1]) {
    it(`gives 100 to the authored reference plan in every wave (variant ${variant})`, () => {
      const state = createGame(SCENARIO, seedFor(variant));
      playPlan(state, REFERENCE);
      for (const record of state.records) expect(record.score.total, record.waveId).toBe(100);
    });
  }

  it("a single strong layer stops Monday but scores no depth", () => {
    const state = createGame(SCENARIO, "single");
    playPlan(state, [["macro", "nordp"]]);
    const score = state.records[0].score;
    expect(score.outcome).toBe(50);
    expect(score.depth).toBe(0);
    expect(state.records[0].resilience.a.failsWithout).toBe("macro");
  });

  it("detection without response leaves the damage in place", () => {
    const state = createGame(SCENARIO, "detect");
    playPlan(state, [["edr"]]);
    const runs = state.records[0].runs;
    expect(runs[1].damage).toBe(4); // Spray and pray is never seen by EDR
    expect(runs[0].steps[1]).toMatchObject({ technique: "macro-ps", result: "detected", unanswered: true });
    expect(summarize(state.records).unansweredDetections).toBeGreaterThan(0);
  });

  it("heavy-friction plans lose the friction points", () => {
    const state = createGame(SCENARIO, "friction");
    playPlan(state, [["allow", "nordp", "credguard"]]);
    expect(state.records[0].score.frictionUsed).toBe(4);
    expect(state.records[0].score.friction).toBe(0);
  });

  it("perimeter-only planning collapses when the actors adapt", () => {
    const state = createGame(SCENARIO, seedFor(0));
    playPlan(state, [["macro", "nordp", "mfa"], ["attach", "patch"], ["fido"]]);
    const totals = state.records.map((record) => record.score.total);
    expect(totals[0]).toBeLessThan(100);
    expect(summarize(state.records).total).toBeLessThan(75);
  });

  it("an interior-only plan stops the damage but pays for every foothold", () => {
    const state = createGame(SCENARIO, "interior");
    playPlan(state, [["credguard", "gmsa", "segment"]]);
    expect(state.records[0].score.depth).toBe(25);
    expect(state.records[0].score.outcome).toBeLessThan(50);
  });

  it("doing nothing scores under 60", () => {
    const state = createGame(SCENARIO, "nothing");
    playPlan(state, [[], [], []]);
    expect(summarize(state.records).total).toBeLessThan(60);
  });
});

describe("rules", () => {
  it("enforces the budget and refunds only this wave's additions", () => {
    const state = createGame(SCENARIO, "budget");
    must(state, { type: "deploy", control: "fido" });
    must(state, { type: "deploy", control: "edr" });
    expect(state.creditsLeft).toBe(1);
    expect(apply(state, { type: "deploy", control: "macro" }).ok).toBe(false);
    must(state, { type: "remove", control: "edr" });
    expect(state.creditsLeft).toBe(5);
    must(state, { type: "launch" });
    finishWave(state);
    expect(state.creditsLeft).toBe(5 + SCENARIO.waves[1].credits);
    expect(apply(state, { type: "remove", control: "fido" }).ok).toBe(false);
  });

  it("swaps the actors' preference order on retry", () => {
    expect(createGame(SCENARIO, "x", 1).variant).toBe(1 - createGame(SCENARIO, "x", 0).variant);
  });

  it("asks what would stop a campaign if its stopping control failed, and the answer is the rerun", () => {
    const state = createGame(SCENARIO, "check");
    playPlan(state, [REFERENCE[0]]);
    const check = state.records[0].check!;
    expect(check.question).toContain("Block macros");
    expect(check.options[check.correct]).toBe("Credential Guard and LSA protection");
    expect(check.options).toHaveLength(3);
  });

  it("rebuilds the same wave result from the command log", () => {
    const state = createGame(SCENARIO, "replay");
    playPlan(state, [REFERENCE[0]]);
    const again = createGame(SCENARIO, "replay");
    for (const command of state.records[0].log) must(again, command);
    expect(again.records[0].score).toEqual(state.records[0].score);
    expect(currentWave(again).id).toBe("monday");
  });
});
