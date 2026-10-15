import { describe, expect, it } from "vitest";
import { advance, apply, createGame, createReplay, currentRound, lastResult, step } from "../src/sim/engine";
import { calculateScore } from "../src/sim/scoring";
import type { Command, GameState } from "../src/sim/types";

type Plan = (state: GameState) => Command[];

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

// Runs the current round: plan commands up front, and `onPause` when paused.
function playRound(state: GameState, plan: Plan, onPause: Plan = () => []): void {
  for (const command of plan(state)) must(state, command);
  must(state, { type: "launch" });
  let guard = 0;
  while (state.phase !== "roundEnd" && guard < 20000) {
    if (state.phase === "paused") {
      for (const command of onPause(state)) must(state, command);
      must(state, { type: "launch" });
    }
    step(state);
    guard += 1;
  }
  expect(state.phase).toBe("roundEnd");
}

function backupRoute(state: GameState): string {
  return state.variant.failLink === "core-finance" ? "backup-core-finance" : "backup-inspect-core";
}

const scopedRule: Command = {
  type: "addRule",
  rule: { action: "deny", source: "unknown", dest: "finance", service: "admin" },
};

function playScoped(seed: string): GameState {
  const state = createGame(seed);
  playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
  expect(lastResult(state)?.outcome).toBe("success");
  advance(state);
  playRound(state, () => [{ type: "inspect", flow: "unknown" }, scopedRule]);
  expect(lastResult(state)?.outcome).toBe("success");
  advance(state);
  playRound(state, () => [], (s) => (s.builtRoutes.includes(backupRoute(s)) ? [] : [{ type: "addRoute", routeId: backupRoute(s) }]));
  expect(lastResult(state)?.outcome).toBe("success");
  expect(advance(state)).toBe("complete");
  return state;
}

const SEEDS = Array.from({ length: 8 }, (_, i) => `seed-${i}`);

describe("Keep Finance Online", () => {
  it("covers both retry variations across seeds", () => {
    const fails = new Set(SEEDS.map((seed) => createGame(seed).variant.failLink));
    expect(fails.size).toBe(2);
  });

  it.each(SEEDS)("scoped play succeeds every round (%s)", (seed) => {
    const state = playScoped(seed);
    const score = calculateScore(state);
    expect(score.security).toBe(1);
    expect(score.service).toBeGreaterThan(0.85);
    expect(score.efficiency).toBe(1);
  });

  it.each(SEEDS)("blanket blocking cannot earn the best result (%s)", (seed) => {
    const scoped = calculateScore(playScoped(seed));

    const state = createGame(seed);
    playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
    advance(state);
    playRound(state, () => [{ type: "addRule", rule: { action: "deny", source: "any", dest: "any", service: "any" } }]);
    const result = lastResult(state)!;
    expect(result.outcome).toBe("setback");
    expect(result.explanations.join(" ")).toMatch(/blocked all external access/);
    expect(result.stats.supplier.delivered).toBe(0);
    const blanket = calculateScore(state);
    expect(blanket.total).toBeLessThan(scoped.total);
  });

  it("a destination-wide deny blocks approved supplier work and explains why", () => {
    const state = createGame("seed-1");
    playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
    advance(state);
    playRound(state, () => [{ type: "addRule", rule: { action: "deny", source: "any", dest: "finance", service: "any" } }]);
    const result = lastResult(state)!;
    expect(result.outcome).toBe("setback");
    expect(result.explanations.join(" ")).toMatch(/also blocked Northwind Supply/);
  });

  it("doing nothing in round 2 lets prohibited access through and pauses for a decision", () => {
    const state = createGame("seed-2");
    playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
    advance(state);
    let paused = 0;
    playRound(state, () => [], () => {
      paused += 1;
      return [];
    });
    expect(paused).toBe(1);
    expect(lastResult(state)!.stats.unknown.delivered).toBeGreaterThan(0);
    expect(lastResult(state)!.outcome).toBe("setback");
  });

  it("connecting Finance straight to the gateway fails its Core dependency", () => {
    const state = createGame("seed-3");
    playRound(state, () => [{ type: "addRoute", routeId: "gateway-finance" }]);
    const result = lastResult(state)!;
    expect(result.outcome).toBe("setback");
    expect(result.stats.supplier.failed).toBe(result.stats.supplier.total);
    expect(result.explanations[0]).toMatch(/database on the Core server/);
    // Recover: revise is possible and the repeat round is granted repair points.
    expect(advance(state)).toBe("repeat");
    playRound(state, () => [{ type: "removeRoute", routeId: "gateway-finance" }, { type: "addRoute", routeId: "core-finance" }]);
    expect(lastResult(state)!.outcome).toBe("success");
  });

  it.each(SEEDS)("backup routes preserve the access policy (%s)", (seed) => {
    const state = playScoped(seed);
    const r3 = state.results.find((result) => result.round === 2 && result.outcome === "success")!;
    expect(r3.stats.unknown.delivered).toBe(0);
    expect(r3.stats.unknown.blocked).toBe(r3.stats.unknown.total);
    // Approved traffic actually used the backup relay.
    expect(state.tokens.some((token) => token.permitted && token.state === "delivered" && token.visited.includes("backup"))).toBe(true);
  });

  it("ignoring the link failure loses Finance service", () => {
    const state = createGame("seed-0");
    playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
    advance(state);
    playRound(state, () => [{ type: "inspect", flow: "unknown" }, scopedRule]);
    advance(state);
    playRound(state, () => []);
    const result = lastResult(state)!;
    expect(result.outcome).toBe("setback");
    expect(result.explanations[0]).toMatch(/Finance stayed offline/);
  });

  it("inspection costs points but does not classify traffic", () => {
    const state = createGame("seed-4");
    playRound(state, () => [{ type: "addRoute", routeId: "core-finance" }]);
    advance(state);
    const before = state.ap;
    must(state, { type: "inspect", flow: "unknown" });
    expect(state.ap).toBe(before - 20);
    expect(state.assessments.unknown).toBeUndefined();
  });

  it("replays a round attempt deterministically from the command log", () => {
    const state = playScoped("seed-5");
    for (let round = 0; round < 3; round += 1) {
      const replay = createReplay(state, round, 0)!;
      let guard = 0;
      while (replay.state.phase !== "roundEnd" && guard < 20000) {
        replay.advance();
        guard += 1;
      }
      const original = state.results.find((result) => result.round === round && result.attempt === 0)!;
      expect(replay.state.stats).toEqual(original.stats);
    }
  });

  it("reaches retry after the failure limit", () => {
    const state = createGame("seed-6");
    for (let i = 0; i < 3; i += 1) {
      playRound(state, () => []);
      const outcome = lastResult(state)!.outcome;
      if (i < 2) {
        expect(outcome).toBe("setback");
        advance(state);
      } else {
        expect(outcome).toBe("retry");
        expect(advance(state)).toBe("retry");
      }
    }
    expect(currentRound(state).id).toBe("establish");
  });
});
