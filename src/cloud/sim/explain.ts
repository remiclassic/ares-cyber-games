import { evaluateCapacity, requiredInstances, scopeServices } from "./rules";
import type { AccessCheckpoint, CapacityCheckpoint, CapacityOutcome, Checkpoint, Fact, Mission, Outcome, Plan } from "./types";

// Every sentence here is built from simulation numbers, so an outcome can always be traced to a rule.

export const num = (value: number): string => Math.round(value).toLocaleString("en-US");
export const percent = (value: number): string => `${Math.floor(value * 100 + 1e-6)}%`;

export function describeChange(mission: Mission, checkpoint: Checkpoint, plan: Plan): string {
  if (checkpoint.kind === "capacity") {
    const parts = scopeServices(mission, checkpoint)
      .filter((service) => plan.instances[service.id] !== mission.initialInstances[service.id])
      .map((service) => `${service.name} ${mission.initialInstances[service.id]} → ${plan.instances[service.id]} instances`);
    return parts.length ? parts.join(", ") : "No change to instance counts";
  }
  const kept = checkpoint.permissions.filter((entry) => plan.grants.includes(entry.id)).map((entry) => entry.id);
  const removed = checkpoint.permissions.filter((entry) => mission.initialGrants.includes(entry.id) && !plan.grants.includes(entry.id)).map((entry) => entry.id);
  if (removed.length === 0) return "No change to permissions";
  return kept.length ? `Kept ${kept.join(", ")}; removed ${removed.join(", ")}` : "Removed every permission";
}

export function assumptions(mission: Mission, checkpoint: Checkpoint, known: readonly Fact[]): string[] {
  if (checkpoint.kind === "access") {
    return [
      known.includes("usage")
        ? "The job keeps making the calls the collected evidence shows."
        : "The job needs only the permissions named in its ticket. Actual usage has not been checked.",
    ];
  }
  const focus = mission.services.find((service) => service.id === checkpoint.focus)!;
  const lines = [
    known.includes("peak")
      ? `Demand peaks at the forecast ${num(checkpoint.demandPeak)} requests per second (rps).`
      : `Demand stays at the current ${num(checkpoint.demandNow)} rps. No forecast has been collected.`,
    `Each ${focus.name} instance serves its rated ${num(focus.unitCapacity)} rps.`,
  ];
  if (focus.dependsOn.length > 0) {
    lines.push(known.includes("dependency") ? "Dependencies behave as inspected." : "Dependencies have spare capacity. They have not been inspected.");
  }
  return lines;
}

function capacityLines(mission: Mission, checkpoint: CapacityCheckpoint, plan: Plan, outcome: CapacityOutcome): string[] {
  const lines: string[] = [];
  const focus = outcome.services.find((entry) => entry.id === checkpoint.focus)!;
  const scope = scopeServices(mission, checkpoint);
  for (const entry of outcome.services) {
    const service = scope.find((candidate) => candidate.id === entry.id)!;
    lines.push(`${entry.name}: ${entry.instances} × ${num(service.unitCapacity)} rps = ${num(entry.capacity)} rps of capacity. ${num(entry.offered)} rps arrived.`);
  }
  lines.push(`${focus.name} served ${num(focus.served)} of ${num(focus.offered)} rps at the peak: ${percent(outcome.availability)} availability.`);

  if (outcome.constraint === checkpoint.focus) {
    lines.push(`${focus.name} is the constraint. Demand exceeds its capacity by ${num(focus.offered - focus.capacity)} rps.`);
  } else if (outcome.constraint) {
    const dep = outcome.services.find((entry) => entry.id === outcome.constraint)!;
    lines.push(`${focus.name} has enough capacity, but each request calls ${dep.name}, which can serve only ${num(dep.capacity)} rps. More ${focus.name} instances cannot help until ${dep.name} has capacity.`);
  }

  // Did each addition matter? Re-run the rules with that one service put back.
  for (const service of scope) {
    const before = mission.initialInstances[service.id];
    if (plan.instances[service.id] <= before) continue;
    const without = evaluateCapacity(mission, checkpoint, { ...plan.instances, [service.id]: before });
    const stillNeeded = without.services.find((entry) => entry.id === service.id)!.headroomMet === false;
    if (without.availability >= outcome.availability - 1e-9 && !stillNeeded) {
      lines.push(`Adding ${service.name} instances changed nothing: ${service.name} was not the constraint.`);
    } else if (without.availability >= outcome.availability - 1e-9 && !outcome.continuity) {
      lines.push(`The extra ${service.name} instances have not raised availability yet, because another service limits the request path.`);
    }
  }

  for (const entry of outcome.services) {
    const service = scope.find((candidate) => candidate.id === entry.id)!;
    const needed = requiredInstances(service, entry.required / (1 + checkpoint.headroom), checkpoint.headroom);
    const rule = `policy asks for ${num(entry.required)} rps (peak ${num(entry.required / (1 + checkpoint.headroom))} + ${Math.round(checkpoint.headroom * 100)}% headroom)`;
    if (!entry.headroomMet) lines.push(`${entry.name} headroom not met: ${rule}, it has ${num(entry.capacity)}.`);
    else if (entry.instances > needed) lines.push(`${entry.name} headroom met with ${entry.instances - needed} instance${entry.instances - needed === 1 ? "" : "s"} more than the policy needs (${service.unitCost} credits per hour each).`);
    else lines.push(`${entry.name} headroom met: ${rule}, it has ${num(entry.capacity)}.`);
  }

  const before = evaluateCapacity(mission, checkpoint, mission.initialInstances);
  lines.push(`Run cost: ${num(outcome.costPerHour)} credits per hour × ${checkpoint.windowHours} h = ${num(outcome.windowCost)} credits (was ${num(before.costPerHour)} per hour). The ceiling for this window is ${num(checkpoint.costCeiling)} credits${outcome.withinCost ? "" : ", so this is over"}.`);
  return lines;
}

function accessLines(checkpoint: AccessCheckpoint, outcome: Extract<Outcome, { kind: "access" }>): string[] {
  const info = (id: string) => checkpoint.permissions.find((entry) => entry.id === id)!;
  const lines = [outcome.granted.length ? `${checkpoint.account} now holds: ${outcome.granted.join(", ")}.` : `${checkpoint.account} now holds no permissions.`];
  for (const id of outcome.missing) lines.push(`The task failed: it needs ${id} ${info(id).neededFor ?? ""}`.trim());
  if (outcome.missing.length === 0) lines.push(`The stated task still runs: "${checkpoint.statedTask}"`);
  for (const id of outcome.excess) lines.push(`Still granted beyond the stated task: ${id} (${info(id).allows}; last used: ${info(id).lastUsed}).`);
  if (outcome.excess.length === 0 && outcome.missing.length === 0) lines.push("The account can do its stated task and nothing more.");
  return lines;
}

export function explain(mission: Mission, checkpoint: Checkpoint, plan: Plan, outcome: Outcome): string[] {
  if (checkpoint.kind === "capacity" && outcome.kind === "capacity") return capacityLines(mission, checkpoint, plan, outcome);
  if (checkpoint.kind === "access" && outcome.kind === "access") return accessLines(checkpoint, outcome);
  return [];
}
