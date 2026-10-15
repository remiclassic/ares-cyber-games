import { assumptions, describeChange, explain } from "./explain";
import { FULL_VIEW, efficientPlan, evaluate, objectivesMet, planTags, viewOf } from "./rules";
import type { Checkpoint, CheckpointRecord, CheckpointScore, Command, Estimate, Fact, GameState, Mission, Plan, Result, Summary } from "./types";

export const WEIGHTS = { continuity: 0.35, policy: 0.3, resource: 0.15, justification: 0.2 } as const;
// Scenarios with no run cost judge fees against this many credits.
const FEE_ALLOWANCE = 30;

export function createGame(mission: Mission): GameState {
  return {
    mission,
    index: 0,
    stage: "travel",
    budget: mission.budget,
    instances: { ...mission.initialInstances },
    grants: [...mission.initialGrants],
    records: mission.checkpoints.map((checkpoint) => ({ id: checkpoint.id, evidence: [], flightChips: [], observed: [], inspected: false, attempts: [], fees: 0, done: false })),
  };
}

export function currentCheckpoint(state: GameState): Checkpoint {
  return state.mission.checkpoints[Math.min(state.index, state.mission.checkpoints.length - 1)];
}

export function currentRecord(state: GameState): CheckpointRecord {
  return state.records[Math.min(state.index, state.records.length - 1)];
}

export function currentPlan(state: GameState): Plan {
  return { instances: { ...state.instances }, grants: [...state.grants] };
}

export function knownFacts(checkpoint: Checkpoint, record: CheckpointRecord): Fact[] {
  const facts = new Set<Fact>(record.observed);
  for (const evidence of checkpoint.evidence) if (evidence.reveals && record.evidence.includes(evidence.id)) facts.add(evidence.reveals);
  return [...facts];
}

// A scenario estimate: the same rules as the simulation, limited to what the learner has found out.
export function estimate(state: GameState, plan: Plan): Estimate {
  const checkpoint = currentCheckpoint(state);
  const known = knownFacts(checkpoint, currentRecord(state));
  return { outcome: evaluate(state.mission, checkpoint, plan, viewOf(known)), assumptions: assumptions(state.mission, checkpoint, known) };
}

function validPlan(checkpoint: Checkpoint, plan: Plan, current: Plan, known: readonly Fact[]): string | null {
  if (checkpoint.kind === "capacity") {
    for (const entry of checkpoint.adjustable) {
      const count = plan.instances[entry.service];
      // A service the learner has not found yet cannot be part of the change.
      if (entry.needs && !known.includes(entry.needs) && count !== current.instances[entry.service]) return `${entry.service} has not been identified yet`;
      if (!Number.isInteger(count) || count < entry.min || count > entry.max) return `${entry.service} must run ${entry.min} to ${entry.max} instances`;
    }
  }
  return null;
}

export function apply(state: GameState, command: Command): Result {
  const fail = (error: string): Result => ({ ok: false, error });
  if (state.stage === "complete") return fail("The mission is complete");
  const mission = state.mission;
  const checkpoint = currentCheckpoint(state);
  const record = currentRecord(state);

  switch (command.type) {
    case "collect": {
      const evidence = checkpoint.evidence.find((entry) => entry.id === command.evidence && entry.source === "chip");
      if (!evidence) return fail("No such diagnostic chip on this leg");
      if (command.via === "flight" && state.stage !== "travel") return fail("Chips are collected in flight");
      if (command.via === "station" && state.stage !== "decide") return fail("The station log opens at the checkpoint");
      if (record.evidence.includes(evidence.id)) return fail("Already collected");
      record.evidence.push(evidence.id);
      if (command.via === "flight") record.flightChips.push(evidence.id);
      return { ok: true };
    }
    case "arrive":
      if (state.stage !== "travel") return fail("Not travelling");
      state.stage = "decide";
      return { ok: true };
    case "inspect": {
      if (state.stage !== "decide") return fail("Inspect at a checkpoint");
      const evidence = checkpoint.evidence.find((entry) => entry.source === "inspect");
      if (!evidence || record.inspected) return fail("Nothing more to inspect");
      record.inspected = true;
      record.evidence.push(evidence.id);
      record.fees += mission.fees.inspect;
      state.budget -= mission.fees.inspect;
      return { ok: true };
    }
    case "apply": {
      if (state.stage !== "decide") return fail("Changes are applied at a checkpoint");
      const known = knownFacts(checkpoint, record);
      const invalid = validPlan(checkpoint, command.plan, currentPlan(state), known);
      if (invalid) return fail(invalid);
      const justification = checkpoint.justifications.find((entry) => entry.id === command.justification);
      if (!justification || (justification.needs && !known.includes(justification.needs))) return fail("Choose a justification");
      const before = estimate(state, command.plan);
      const outcome = evaluate(mission, checkpoint, command.plan, FULL_VIEW);
      const tags = planTags(mission, checkpoint, command.plan, outcome);
      record.attempts.push({
        plan: command.plan,
        change: describeChange(mission, checkpoint, command.plan),
        justification: justification.id,
        justified: justification.valid && justification.fits.every((tag) => tags.includes(tag)),
        known,
        estimate: before,
        outcome,
        lines: explain(mission, checkpoint, command.plan, outcome),
      });
      state.instances = { ...command.plan.instances };
      state.grants = [...command.plan.grants];
      // A consequence is evidence too: hitting a hidden limit reveals it.
      if (checkpoint.kind === "capacity" && outcome.kind === "capacity" && outcome.constraint && outcome.constraint !== checkpoint.focus && !record.observed.includes("dependency")) record.observed.push("dependency");
      if (outcome.kind === "access" && outcome.missing.length > 0 && !record.observed.includes("usage")) record.observed.push("usage");
      state.stage = "outcome";
      return { ok: true };
    }
    case "revise":
      if (state.stage !== "outcome") return fail("Nothing to revise yet");
      if (record.attempts.length >= mission.maxAttempts) return fail("No revisions left at this checkpoint");
      record.fees += mission.fees.revise;
      state.budget -= mission.fees.revise;
      state.stage = "decide";
      return { ok: true };
    case "continue": {
      if (state.stage !== "outcome") return fail("Apply a change first");
      state.budget -= record.attempts[record.attempts.length - 1].outcome.windowCost;
      record.done = true;
      state.index += 1;
      state.stage = state.index >= mission.checkpoints.length ? "complete" : "travel";
      return { ok: true };
    }
  }
}

export function scoreCheckpoint(mission: Mission, checkpoint: Checkpoint, record: CheckpointRecord): CheckpointScore {
  const first = record.attempts[0];
  const final = record.attempts[record.attempts.length - 1];
  const outcome = final.outcome;
  const efficient = efficientPlan(mission, checkpoint);
  const reference = evaluate(mission, checkpoint, efficient).windowCost;

  const continuity = outcome.continuity ? 1 : outcome.availability * 0.5;
  let policy = 1;
  if (outcome.kind === "capacity") policy = outcome.services.filter((entry) => entry.headroomMet).length / outcome.services.length;
  else if (checkpoint.kind === "access") {
    const startExcess = mission.initialGrants.filter((id) => !checkpoint.requiredPermissions.includes(id)).length;
    if (startExcess > 0) policy = Math.max(0, 1 - outcome.excess.length / startExcess);
  }
  // Diagnostics are not waste: only run cost and revision fees are compared with the efficient plan.
  const revisionFees = (record.attempts.length - 1) * mission.fees.revise;
  const over = Math.max(0, outcome.windowCost + revisionFees - reference);
  const resource = Math.max(0, 1 - over / (reference > 0 ? reference : FEE_ALLOWANCE));
  const justification = final.justified ? 1 : 0;
  const met = (attempt: typeof final) => objectivesMet(attempt.outcome);

  return {
    id: checkpoint.id,
    title: checkpoint.title,
    continuity,
    policy,
    resource,
    justification,
    score: Math.round(100 * (WEIGHTS.continuity * continuity + WEIGHTS.policy * policy + WEIGHTS.resource * resource + WEIGHTS.justification * justification)),
    continuityMet: outcome.continuity,
    policyMet: outcome.policy,
    costMet: outcome.withinCost,
    attempts: record.attempts.length,
    recovered: record.attempts.length > 1 && !met(first) && met(final),
    better: !met(final) || outcome.windowCost > reference ? describeChange(mission, checkpoint, efficient) : null,
  };
}

export function summarize(state: GameState): Summary {
  const scored = state.mission.checkpoints.flatMap((checkpoint, index) => (state.records[index].attempts.length ? [scoreCheckpoint(state.mission, checkpoint, state.records[index])] : []));
  const mean = (pick: (entry: CheckpointScore) => number) => (scored.length ? scored.reduce((sum, entry) => sum + pick(entry), 0) / scored.length : 0);
  // The security objective is reported on its own so that a good average cannot cover for it.
  const securityObjectiveMet = state.mission.checkpoints.every((checkpoint, index) => checkpoint.kind !== "access" || scored[index]?.policyMet === true);
  const allMet = scored.length === state.mission.checkpoints.length && scored.every((entry) => entry.continuityMet && entry.policyMet && entry.costMet);
  return {
    checkpoints: scored,
    continuity: mean((entry) => entry.continuity),
    policy: mean((entry) => entry.policy),
    resource: mean((entry) => entry.resource),
    justification: mean((entry) => entry.justification),
    learningScore: Math.round(mean((entry) => entry.score)),
    securityObjectiveMet,
    rating: !securityObjectiveMet ? "security-objective-failed" : allMet ? "objectives-met" : "objectives-partly-met",
    recoveries: scored.filter((entry) => entry.recovered).length,
    budgetLeft: state.budget,
  };
}
