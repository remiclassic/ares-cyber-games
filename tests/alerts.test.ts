import { describe, expect, it } from "vitest";
import { GUIDED, POOL } from "../src/alerts/data";
import {
  CONFIGS,
  POINTS,
  buildStream,
  createGame,
  currentAlert,
  debriefLines,
  decide,
  end,
  evidenceOf,
  nextGuided,
  scoreOf,
  splitEvidence,
  streamLength,
  tick,
  type Alert,
  type Call,
  type Config,
  type GameState,
} from "../src/alerts/engine";

const SEEDS = ["a", "b", "range", "ops-42", "zz9", "meridian", "7", "seed-x"];

function newGame(config: Config, seed: string, guided: readonly Alert[] = []): GameState {
  return createGame(config, buildStream(POOL, streamLength(config), seed), guided);
}

// Plays a whole round in 100 ms steps. `strategy` returns a call, or null to leave the alert waiting.
// `thinkMs` is how long the player takes per alert.
function play(state: GameState, strategy: (alert: Alert) => Call | null, thinkMs = 1000): GameState {
  let ready = thinkMs;
  while (state.phase === "guided") {
    decide(state, strategy(currentAlert(state)!) ?? "dismiss");
    nextGuided(state);
  }
  while (state.phase === "live") {
    const alert = currentAlert(state);
    if (alert && ready <= 0) {
      const call = strategy(alert);
      if (call) {
        decide(state, call);
        ready = thinkMs;
      }
    }
    tick(state, 100);
    ready -= 100;
  }
  return state;
}

const perfect = (alert: Alert): Call => (alert.truth === "threat" ? "escalate" : "dismiss");
const escalateAll = (): Call => "escalate";
const dismissAll = (): Call => "dismiss";

describe("alert or noise: content", () => {
  it("has unique ids and evidence that appears in every line", () => {
    const all = [...GUIDED, ...POOL];
    expect(new Set(all.map((alert) => alert.id)).size).toBe(all.length);
    for (const alert of all) {
      expect(alert.text).toContain(alert.evidence);
      expect(alert.evidence.length).toBeGreaterThan(0);
      expect(alert.why.length).toBeGreaterThan(10);
      expect(splitEvidence(alert)[1]).toBe(alert.evidence);
    }
  });

  it("has enough threats and noise for a full round, and guided items of both kinds", () => {
    const n = streamLength(CONFIGS.full);
    expect(POOL.filter((alert) => alert.truth === "threat").length).toBeGreaterThanOrEqual(Math.round(n * 0.35));
    expect(POOL.filter((alert) => alert.truth === "noise").length).toBeGreaterThanOrEqual(n - Math.round(n * 0.35));
    expect(new Set(GUIDED.map((alert) => alert.truth)).size).toBe(2);
  });
});

describe("alert or noise: stream", () => {
  it("is deterministic per seed, opens with noise and never runs three threats in a row", () => {
    for (const seed of SEEDS) {
      const stream = buildStream(POOL, streamLength(CONFIGS.full), seed);
      expect(stream.map((alert) => alert.id)).toEqual(buildStream(POOL, streamLength(CONFIGS.full), seed).map((alert) => alert.id));
      expect(stream).toHaveLength(20);
      expect(stream[0].truth).toBe("noise");
      expect(stream.filter((alert) => alert.truth === "threat")).toHaveLength(7);
      const runs = stream.map((alert) => alert.truth[0]).join("");
      expect(runs).not.toContain("ttt");
    }
  });

  it("the wait round is 30 seconds with at least two threats", () => {
    const stream = buildStream(POOL, streamLength(CONFIGS.wait), "w");
    expect(CONFIGS.wait.durationMs).toBe(30_000);
    expect(stream).toHaveLength(10);
    expect(stream.filter((alert) => alert.truth === "threat").length).toBeGreaterThanOrEqual(2);
  });

  it("delivers alerts on the interval and ages out the ones left waiting", () => {
    const state = newGame(CONFIGS.full, "a");
    expect(state.phase).toBe("live");
    expect(state.pending).toHaveLength(1);
    tick(state, 3000);
    expect(state.pending).toHaveLength(2);
    const expired = tick(state, 5000); // first alert has now waited 8 s
    expect(expired).toHaveLength(1);
    expect(expired[0].decision).toBe("timeout");
    expect(expired[0].outcome).toBe("expired"); // stream opens with noise
    expect(expired[0].points).toBe(POINTS.expiredNoise);
  });
});

describe("alert or noise: scoring", () => {
  it("scores each outcome as designed", () => {
    const threat = POOL.find((alert) => alert.truth === "threat")!;
    const noise = POOL.find((alert) => alert.truth === "noise")!;
    const run = (alert: Alert, call: Call) => decide(createGame(CONFIGS.full, [alert]), call)!;
    expect(run(threat, "escalate")).toMatchObject({ outcome: "hit", points: POINTS.hit });
    expect(run(threat, "dismiss")).toMatchObject({ outcome: "miss", points: POINTS.miss });
    expect(run(noise, "escalate")).toMatchObject({ outcome: "false-alarm", points: POINTS.falseAlarm });
    expect(run(noise, "dismiss")).toMatchObject({ outcome: "correct-reject", points: POINTS.correctReject });
    expect(-POINTS.miss).toBeGreaterThan(-POINTS.falseAlarm); // a miss costs more than a wasted escalation
  });

  it("every escalation loads the analyst queue, which drains over time", () => {
    const noise = POOL.filter((alert) => alert.truth === "noise").slice(0, 6);
    const state = createGame({ ...CONFIGS.full, intervalMs: 1 }, noise);
    tick(state, 10);
    for (let i = 0; i < 4; i++) decide(state, "escalate");
    expect(state.queue).toBeCloseTo(4, 1);
    const swamped = decide(state, "escalate")!;
    expect(swamped.swamped).toBe(true);
    expect(swamped.points).toBe(POINTS.falseAlarmSwamped);
    tick(state, CONFIGS.full.drainMs * 2);
    expect(state.queue).toBeCloseTo(3, 1);
  });

  it("perfect play scores the best possible on its alerts", () => {
    for (const seed of SEEDS) {
      const score = scoreOf(play(newGame(CONFIGS.full, seed), perfect));
      expect(score.points).toBe(score.best);
      expect(score.swampedCalls).toBe(0);
    }
  });

  it("escalate-all and dismiss-all both score below a quarter of perfect, in both modes", () => {
    for (const config of [CONFIGS.full, CONFIGS.wait]) {
      for (const seed of SEEDS) {
        const best = scoreOf(play(newGame(config, seed), perfect)).points;
        const threshold = best * 0.25;
        const escalated = scoreOf(play(newGame(config, seed), escalateAll)).points;
        const dismissed = scoreOf(play(newGame(config, seed), dismissAll)).points;
        expect(escalated).toBeLessThan(threshold);
        expect(dismissed).toBeLessThan(threshold);
      }
    }
  });

  it("escalating everything swamps the analysts in a full round", () => {
    const state = play(newGame(CONFIGS.full, "a"), escalateAll, 300);
    expect(scoreOf(state).swampedCalls).toBeGreaterThan(0);
    expect(scoreOf(state).points).toBeLessThan(0);
  });

  it("doing nothing loses: threats age out as misses", () => {
    const state = play(newGame(CONFIGS.full, "a"), () => null);
    const evidence = evidenceOf(state);
    expect(evidence.calls).toBe(0);
    expect(evidence.timedOutThreats).toBeGreaterThan(0);
    expect(scoreOf(state).points).toBeLessThan(0);
  });
});

describe("alert or noise: guided items, evidence and debrief", () => {
  it("guided items pause the clock and count toward neither score nor evidence", () => {
    const state = newGame(CONFIGS.full, "a", GUIDED);
    expect(state.phase).toBe("guided");
    tick(state, 10_000);
    expect(state.clock).toBe(0);
    expect(currentAlert(state)?.id).toBe(GUIDED[0].id);
    expect(decide(state, "dismiss")?.points).toBe(0); // a miss, but guided
    expect(decide(state, "escalate")).toBeNull(); // one call per item
    for (let i = 0; i < GUIDED.length; i++) {
      if (i > 0) decide(state, "escalate");
      nextGuided(state);
    }
    expect(state.phase).toBe("live");
    expect(state.pending).toHaveLength(1);
    expect(scoreOf(state).points).toBe(0);
    expect(evidenceOf(state).calls).toBe(0);
  });

  it("evidence measures accuracy separately from points", () => {
    const state = play(newGame(CONFIGS.full, "b"), escalateAll, 300);
    const evidence = evidenceOf(state);
    expect(evidence.caught).toBe(evidence.threats - evidence.timedOutThreats);
    expect(evidence.filtered).toBe(0);
    expect(evidence.lean).toBe("escalate");
    expect(evidence.accuracy).toBeCloseTo(evidence.correct / evidence.calls);
    const perfectEvidence = evidenceOf(play(newGame(CONFIGS.full, "b"), perfect));
    expect(perfectEvidence.accuracy).toBe(1);
    expect(evidenceOf(play(newGame(CONFIGS.full, "b"), dismissAll)).lean).toBe("dismiss");
  });

  it("debrief lists missed threats first, then wasted escalations, each with its reason", () => {
    const state = play(newGame(CONFIGS.full, "c"), (alert) => (alert.truth === "threat" ? "dismiss" : "escalate"), 2000);
    const lines = debriefLines(state);
    const evidence = evidenceOf(state);
    expect(lines.filter((line) => line.kind === "missed")).toHaveLength(evidence.missed + evidence.timedOutThreats);
    expect(lines.filter((line) => line.kind === "wasted")).toHaveLength(evidence.wasted);
    const firstWasted = lines.findIndex((line) => line.kind === "wasted");
    expect(lines.slice(0, firstWasted).every((line) => line.kind === "missed")).toBe(true);
    for (const line of lines) expect(line.reason).toContain(line.alert.why);
  });

  it("can be stopped at any moment, cleanly, with waiting alerts unscored", () => {
    const state = newGame(CONFIGS.wait, "w");
    tick(state, 7000);
    decide(state, "dismiss");
    const before = state.records.length;
    end(state);
    expect(state.phase).toBe("done");
    expect(state.stoppedEarly).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(state.records).toHaveLength(before);
    expect(decide(state, "escalate")).toBeNull();
    expect(tick(state, 1000)).toEqual([]);
    end(state); // idempotent
  });

  it("the round ends itself when time runs out", () => {
    const state = newGame(CONFIGS.wait, "w");
    tick(state, 29_900);
    expect(state.phase).toBe("live");
    tick(state, 200);
    expect(state.phase).toBe("done");
    expect(state.stoppedEarly).toBe(false);
    expect(state.clock).toBe(30_000);
  });
});
