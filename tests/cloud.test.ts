import { describe, expect, it } from "vitest";
import { FIRST_ORBIT } from "../src/cloud/data/mission";
import { apply, createGame, currentPlan, estimate, summarize } from "../src/cloud/sim/mission";
import { efficientPlan, evaluateCapacity, evaluateFlows, initialPlan } from "../src/cloud/sim/rules";
import type { AccessCheckpoint, CapacityCheckpoint, Command, GameState, Permission } from "../src/cloud/sim/types";

const mission = FIRST_ORBIT;
const [surge, quiet, access] = mission.checkpoints as [CapacityCheckpoint, CapacityCheckpoint, AccessCheckpoint];

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

function arrive(state: GameState, chips = true): void {
  if (chips) for (const evidence of mission.checkpoints[state.index].evidence) if (evidence.source === "chip") must(state, { type: "collect", evidence: evidence.id, via: "flight" });
  must(state, { type: "arrive" });
}

function change(state: GameState, justification: string, instances: Record<string, number> = {}, grants?: Permission[]): void {
  const plan = currentPlan(state);
  must(state, { type: "apply", plan: { instances: { ...plan.instances, ...instances }, grants: grants ?? plan.grants }, justification });
}

const last = (state: GameState) => state.records[state.index].attempts[state.records[state.index].attempts.length - 1];

// The supported strategy: inspect before spending, size to peak plus headroom, keep what the task uses.
function playWell(state: GameState): void {
  arrive(state);
  must(state, { type: "inspect" });
  change(state, "both", { checkout: 6, payments: 4 });
  must(state, { type: "continue" });
  arrive(state);
  change(state, "peak-plus-headroom", { storefront: 4 });
  must(state, { type: "continue" });
  arrive(state);
  change(state, "task-only", {}, [...access.requiredPermissions]);
  must(state, { type: "continue" });
}

describe("rules: capacity, demand and dependencies", () => {
  const services = mission.services;

  it("serves no more than the tightest stage on the request path", () => {
    const flows = evaluateFlows(services, { checkout: 6, payments: 3 }, { checkout: 1300 });
    expect(flows.checkout.capacity).toBe(1500);
    expect(flows.payments.offered).toBe(1300);
    expect(flows.checkout.served).toBeCloseTo(1200);
  });

  it("adding capacity helps only where capacity is the constraint", () => {
    const base = evaluateCapacity(mission, surge, mission.initialInstances);
    expect(base.constraint).toBe("checkout");
    const paymentsOnly = evaluateCapacity(mission, surge, { ...mission.initialInstances, payments: 6 });
    expect(paymentsOnly.availability).toBeCloseTo(base.availability);
    const checkoutOnly = evaluateCapacity(mission, surge, { ...mission.initialInstances, checkout: 8 });
    expect(checkoutOnly.availability).toBeGreaterThan(base.availability);
    expect(checkoutOnly.constraint).toBe("payments");
    expect(checkoutOnly.continuity).toBe(false);
  });

  it("right-sizing accounts for the expected peak and the required headroom", () => {
    const at = (count: number) => evaluateCapacity(mission, quiet, { ...mission.initialInstances, storefront: count });
    expect(at(4)).toMatchObject({ continuity: true, policy: true });
    // Enough for the peak, but short of the 25% headroom.
    expect(at(3)).toMatchObject({ continuity: true, policy: false });
    // Sized to the quiet reading: cannot serve the peak.
    expect(at(2)).toMatchObject({ continuity: false, policy: false });
    expect(at(2).availability).toBeCloseTo(600 / 750);
    expect(at(4).windowCost).toBeLessThan(at(8).windowCost);
    // Keeping everything running is available and has headroom, but it is over the cost ceiling.
    expect(at(8)).toMatchObject({ continuity: true, policy: true, withinCost: false });
    expect(at(5).withinCost).toBe(true);
  });

  it("finds the cheapest plan that meets every requirement by search", () => {
    expect(efficientPlan(mission, surge).instances).toMatchObject({ checkout: 6, payments: 4 });
    expect(efficientPlan(mission, quiet).instances).toMatchObject({ storefront: 4 });
    expect(efficientPlan(mission, access).grants).toEqual(access.requiredPermissions);
  });
});

describe("content", () => {
  it("has three checkpoints, each with three chips and a supported justification", () => {
    expect(mission.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(["surge", "quiet", "access"]);
    for (const checkpoint of mission.checkpoints) {
      expect(checkpoint.evidence.filter((evidence) => evidence.source === "chip")).toHaveLength(3);
      expect(checkpoint.justifications.some((entry) => entry.valid)).toBe(true);
      expect(checkpoint.justifications.some((entry) => !entry.valid)).toBe(true);
    }
  });

  it("starts each checkpoint with a real problem", () => {
    const start = initialPlan(mission);
    expect(evaluateCapacity(mission, surge, start.instances).continuity).toBe(false);
    expect(evaluateCapacity(mission, quiet, start.instances).windowCost).toBeGreaterThan(evaluateCapacity(mission, quiet, efficientPlan(mission, quiet).instances).windowCost);
    expect(mission.initialGrants.length).toBeGreaterThan(access.requiredPermissions.length);
  });
});

describe("estimates state their assumptions", () => {
  it("assumes spare dependency capacity until the dependency is inspected", () => {
    const state = createGame(mission);
    arrive(state);
    const plan = { ...currentPlan(state), instances: { ...state.instances, checkout: 6 } };
    const before = estimate(state, plan);
    expect(before.outcome.continuity).toBe(true);
    expect(before.assumptions.join(" ")).toMatch(/not been inspected/);
    must(state, { type: "inspect" });
    const after = estimate(state, plan);
    expect(after.outcome.continuity).toBe(false);
    expect(state.budget).toBe(mission.budget - mission.fees.inspect);
  });

  it("assumes current demand until the forecast is collected", () => {
    const state = createGame(mission);
    playTo(state, 1);
    must(state, { type: "arrive" });
    const plan = { ...currentPlan(state), instances: { ...state.instances, storefront: 3 } };
    expect(estimate(state, plan).outcome.policy).toBe(true);
    expect(estimate(state, plan).assumptions.join(" ")).toMatch(/No forecast/);
    must(state, { type: "collect", evidence: "quiet-forecast", via: "station" });
    expect(estimate(state, plan).outcome.policy).toBe(false);
    expect(state.records[1].flightChips).toEqual([]);
  });

  function playTo(state: GameState, index: number): void {
    arrive(state);
    change(state, "checkout-only", { checkout: 6 });
    must(state, { type: "continue" });
    expect(state.index).toBe(index);
  }
});

describe("a supported strategy", () => {
  it("meets every objective with justified choices", () => {
    const state = createGame(mission);
    playWell(state);
    const summary = summarize(state);
    expect(state.stage).toBe("complete");
    expect(summary.rating).toBe("objectives-met");
    expect(summary.securityObjectiveMet).toBe(true);
    expect(summary.learningScore).toBe(100);
    expect(summary.checkpoints.every((entry) => entry.better === null && entry.attempts === 1)).toBe(true);
    expect(summary.budgetLeft).toBe(mission.budget - 5 - 96 - 64);
  });

  it("accepts a more cautious right-size as defensible", () => {
    const state = createGame(mission);
    arrive(state);
    must(state, { type: "inspect" });
    change(state, "both", { checkout: 6, payments: 4 });
    must(state, { type: "continue" });
    arrive(state);
    change(state, "extra-margin", { storefront: 5 });
    expect(last(state)).toMatchObject({ justified: true, outcome: { continuity: true, policy: true } });
    must(state, { type: "continue" });
    const quietScore = summarize(state).checkpoints[1];
    expect(quietScore.resource).toBeLessThan(1);
    expect(quietScore.score).toBeGreaterThanOrEqual(90);
  });
});

describe("a recoverable failure", () => {
  it("explains a checkout-only change, reveals the dependency, and rewards the recovery", () => {
    const state = createGame(mission);
    arrive(state);
    change(state, "checkout-only", { checkout: 6 });
    const first = last(state);
    expect(first.estimate.outcome.continuity).toBe(true);
    expect(first.outcome.continuity).toBe(false);
    expect(first.lines.join(" ")).toMatch(/Payments API, which can serve only 1,200 rps/);
    expect(state.records[0].observed).toContain("dependency");

    must(state, { type: "revise" });
    expect(state.budget).toBe(mission.budget - mission.fees.revise);
    change(state, "both", { payments: 4 });
    expect(last(state).outcome).toMatchObject({ continuity: true, policy: true });
    must(state, { type: "continue" });

    const score = summarize(state).checkpoints[0];
    expect(score).toMatchObject({ recovered: true, attempts: 2, continuityMet: true, policyMet: true });
    // The revision has a visible cost, but recovering still scores well.
    expect(score.resource).toBeLessThan(1);
    expect(score.score).toBeGreaterThanOrEqual(90);
  });

  it("breaks the backup when access is narrowed to the ticket alone, then recovers", () => {
    const state = createGame(mission);
    arrive(state);
    // The Payments API card and its justification are not on offer before the dependency is known.
    const hidden = { instances: { ...state.instances, checkout: 6, payments: 4 }, grants: state.grants };
    expect(apply(state, { type: "apply", plan: hidden, justification: "checkout-only" }).ok).toBe(false);
    expect(apply(state, { type: "apply", plan: currentPlan(state), justification: "both" }).ok).toBe(false);
    must(state, { type: "inspect" });
    change(state, "both", { checkout: 6, payments: 4 });
    must(state, { type: "continue" });
    arrive(state);
    change(state, "peak-plus-headroom", { storefront: 4 });
    must(state, { type: "continue" });
    arrive(state);
    change(state, "ticket-only", {}, [...access.ticketPermissions]);
    expect(last(state).outcome).toMatchObject({ continuity: false, policy: true, missing: ["keys:use"] });
    expect(last(state).lines.join(" ")).toMatch(/needs keys:use/);
    must(state, { type: "revise" });
    change(state, "task-only", {}, [...access.requiredPermissions]);
    must(state, { type: "continue" });
    const summary = summarize(state);
    expect(summary.checkpoints[2].recovered).toBe(true);
    expect(summary.rating).toBe("objectives-met");
  });

  it("limits revisions", () => {
    const state = createGame(mission);
    arrive(state);
    for (let attempt = 0; attempt < mission.maxAttempts; attempt += 1) {
      change(state, "anywhere", {});
      if (attempt < mission.maxAttempts - 1) must(state, { type: "revise" });
    }
    expect(apply(state, { type: "revise" }).ok).toBe(false);
  });
});

describe("poor decisions produce explainable outcomes", () => {
  it("adding capacity to a service that is not the constraint changes nothing", () => {
    const state = createGame(mission);
    arrive(state);
    must(state, { type: "inspect" });
    change(state, "anywhere", { payments: 6 });
    const attempt = last(state);
    expect(attempt.justified).toBe(false);
    expect(attempt.outcome.continuity).toBe(false);
    expect(attempt.lines.join(" ")).toMatch(/Checkout is the constraint/);
  });

  it("an over-aggressive right-size loses requests at the peak", () => {
    const state = createGame(mission);
    arrive(state);
    change(state, "checkout-only", { checkout: 6 });
    must(state, { type: "continue" });
    arrive(state);
    change(state, "match-now", { storefront: 2 });
    expect(last(state).outcome.continuity).toBe(false);
    expect(last(state).lines.join(" ")).toMatch(/80% availability/);
    must(state, { type: "continue" });
    expect(summarize(state).checkpoints[1].better).toBe("Storefront 8 → 4 instances");
  });

  it("a true justification does not support a change it does not fit", () => {
    const state = createGame(mission);
    arrive(state);
    must(state, { type: "inspect" });
    change(state, "both", { checkout: 6 });
    expect(last(state).justified).toBe(false);
  });
});

describe("scoring", () => {
  it("does not let a high score hide a failed security objective", () => {
    const state = createGame(mission);
    arrive(state);
    must(state, { type: "inspect" });
    change(state, "both", { checkout: 6, payments: 4 });
    must(state, { type: "continue" });
    arrive(state);
    change(state, "peak-plus-headroom", { storefront: 4 });
    must(state, { type: "continue" });
    arrive(state);
    // Remove one unused permission and stop: the task works, the account is still over-privileged.
    change(state, "unused-harmless", {}, mission.initialGrants.filter((id) => id !== "analytics:query"));
    must(state, { type: "continue" });
    const summary = summarize(state);
    expect(summary.learningScore).toBeGreaterThanOrEqual(75);
    expect(summary.securityObjectiveMet).toBe(false);
    expect(summary.rating).toBe("security-objective-failed");
  });

  it("is independent of how chips were collected", () => {
    const flown = createGame(mission);
    playWell(flown);
    const docked = createGame(mission);
    for (const checkpoint of mission.checkpoints) {
      must(docked, { type: "arrive" });
      for (const evidence of checkpoint.evidence) if (evidence.source === "chip") must(docked, { type: "collect", evidence: evidence.id, via: "station" });
      if (checkpoint.id === "surge") {
        must(docked, { type: "inspect" });
        change(docked, "both", { checkout: 6, payments: 4 });
      } else if (checkpoint.id === "quiet") change(docked, "peak-plus-headroom", { storefront: 4 });
      else change(docked, "task-only", {}, [...access.requiredPermissions]);
      must(docked, { type: "continue" });
    }
    expect(summarize(docked).learningScore).toBe(summarize(flown).learningScore);
    expect(docked.records.flatMap((record) => record.flightChips)).toHaveLength(0);
  });
});
