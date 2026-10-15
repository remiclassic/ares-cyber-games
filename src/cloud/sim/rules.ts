import type {
  AccessCheckpoint,
  AccessOutcome,
  CapacityCheckpoint,
  CapacityOutcome,
  Checkpoint,
  Fact,
  Mission,
  Outcome,
  Permission,
  Plan,
  Service,
  ServiceId,
  ServiceResult,
} from "./types";

// ---------- capacity, demand, dependencies ----------

export function capacityOf(service: Service, instances: number): number {
  return service.unitCapacity * instances;
}

export function requiredCapacity(demand: number, headroom: number): number {
  return demand * (1 + headroom);
}

export function requiredInstances(service: Service, demand: number, headroom: number): number {
  return Math.ceil(requiredCapacity(demand, headroom) / service.unitCapacity - 1e-9);
}

export type Flow = Readonly<{ offered: number; capacity: number; served: number; full: number }>;

// A service passes on at most its own capacity. Each passed request calls its dependencies, and a
// saturated dependency fails the same share of its callers' requests.
export function evaluateFlows(
  services: readonly Service[],
  instances: Readonly<Record<ServiceId, number>>,
  external: Readonly<Record<ServiceId, number>>,
): Record<ServiceId, Flow> {
  const byId = new Map(services.map((service) => [service.id, service]));
  const cap = (id: ServiceId) => capacityOf(byId.get(id)!, instances[id] ?? 0);
  const callers = (id: ServiceId) =>
    services.flatMap((caller) => caller.dependsOn.filter((dep) => dep.service === id).map((dep) => ({ caller, dep })));
  const memo = (compute: (id: ServiceId) => number) => {
    const cache = new Map<ServiceId, number>();
    const get = (id: ServiceId): number => {
      if (!cache.has(id)) cache.set(id, compute(id));
      return cache.get(id)!;
    };
    return get;
  };
  // Demand that reaches a service given upstream capacity limits.
  const offered: (id: ServiceId) => number = memo(
    (id) => (external[id] ?? 0) + callers(id).reduce((sum, { caller, dep }) => sum + Math.min(offered(caller.id), cap(caller.id)) * dep.callsPerRequest, 0),
  );
  // Demand that would reach it if nothing upstream were limited. Headroom is judged against this.
  const full: (id: ServiceId) => number = memo(
    (id) => (external[id] ?? 0) + callers(id).reduce((sum, { caller, dep }) => sum + full(caller.id) * dep.callsPerRequest, 0),
  );
  const ratio: (id: ServiceId) => number = memo((id) => {
    const own = offered(id) > 0 ? Math.min(1, cap(id) / offered(id)) : 1;
    return byId.get(id)!.dependsOn.reduce((lowest, dep) => Math.min(lowest, ratio(dep.service)), 1) * own;
  });
  return Object.fromEntries(
    services.map((service) => [service.id, { offered: offered(service.id), capacity: cap(service.id), served: offered(service.id) * ratio(service.id), full: full(service.id) }]),
  );
}

export function runCostPerHour(services: readonly Service[], instances: Readonly<Record<ServiceId, number>>): number {
  return services.reduce((sum, service) => sum + (instances[service.id] ?? 0) * service.unitCost, 0);
}

export type View = Readonly<{ peak: boolean; dependency: boolean; usage: boolean }>;
export const FULL_VIEW: View = { peak: true, dependency: true, usage: true };

export function viewOf(known: readonly Fact[]): View {
  return { peak: known.includes("peak"), dependency: known.includes("dependency"), usage: known.includes("usage") };
}

export function scopeServices(mission: Mission, checkpoint: CapacityCheckpoint): Service[] {
  return checkpoint.adjustable.map((entry) => mission.services.find((service) => service.id === entry.service)!);
}

// With FULL_VIEW this is the simulation. With a partial view it is the learner's estimate: an
// unknown peak means demand stays as it is, an unknown dependency means it has spare capacity.
export function evaluateCapacity(mission: Mission, checkpoint: CapacityCheckpoint, instances: Readonly<Record<ServiceId, number>>, view: View = FULL_VIEW): CapacityOutcome {
  const scope = scopeServices(mission, checkpoint);
  const visible = view.dependency ? scope : scope.filter((service) => service.id === checkpoint.focus).map((service) => ({ ...service, dependsOn: [] }));
  const demand = view.peak ? checkpoint.demandPeak : checkpoint.demandNow;
  const flows = evaluateFlows(visible, instances, { [checkpoint.focus]: demand });
  const services: ServiceResult[] = visible.map((service) => {
    const flow = flows[service.id];
    const required = requiredCapacity(flow.full, checkpoint.headroom);
    const floor = checkpoint.adjustable.find((entry) => entry.service === service.id)!.min;
    return {
      id: service.id,
      name: service.name,
      instances: instances[service.id] ?? 0,
      capacity: flow.capacity,
      offered: flow.offered,
      served: flow.served,
      required,
      headroomMet: flow.capacity >= required - 1e-9 && (instances[service.id] ?? 0) >= floor,
    };
  });
  const focus = flows[checkpoint.focus];
  const availability = focus.offered > 0 ? focus.served / focus.offered : 1;
  // The tightest stage on the request path is the constraint.
  const tightest = services.filter((entry) => entry.offered > entry.capacity + 1e-9).sort((a, b) => a.capacity / a.offered - b.capacity / b.offered)[0];
  const costPerHour = runCostPerHour(scope, instances);
  return {
    kind: "capacity",
    demand,
    services,
    availability,
    constraint: tightest?.id ?? null,
    continuity: availability >= checkpoint.minAvailability,
    policy: services.every((entry) => entry.headroomMet),
    withinCost: costPerHour * checkpoint.windowHours <= checkpoint.costCeiling,
    costPerHour,
    windowCost: costPerHour * checkpoint.windowHours,
  };
}

// ---------- permissions ----------

export function evaluateAccess(checkpoint: AccessCheckpoint, grants: readonly Permission[], view: View = FULL_VIEW): AccessOutcome {
  const required = view.usage ? checkpoint.requiredPermissions : checkpoint.ticketPermissions;
  const granted = checkpoint.permissions.map((entry) => entry.id).filter((id) => grants.includes(id));
  const missing = required.filter((id) => !granted.includes(id));
  const excess = granted.filter((id) => !required.includes(id));
  return { kind: "access", granted, missing, excess, availability: missing.length === 0 ? 1 : 0, continuity: missing.length === 0, policy: excess.length === 0, withinCost: true, windowCost: 0 };
}

export function evaluate(mission: Mission, checkpoint: Checkpoint, plan: Plan, view: View = FULL_VIEW): Outcome {
  return checkpoint.kind === "capacity" ? evaluateCapacity(mission, checkpoint, plan.instances, view) : evaluateAccess(checkpoint, plan.grants, view);
}

export function objectivesMet(outcome: Outcome): boolean {
  return outcome.continuity && outcome.policy && outcome.withinCost;
}

// ---------- plans ----------

export function initialPlan(mission: Mission): Plan {
  return { instances: { ...mission.initialInstances }, grants: [...mission.initialGrants] };
}

// The cheapest configuration that meets continuity and policy, found by search rather than authored.
export function efficientPlan(mission: Mission, checkpoint: Checkpoint): Plan {
  const start = initialPlan(mission);
  if (checkpoint.kind === "access") return { ...start, grants: [...checkpoint.requiredPermissions] };
  let best: { plan: Plan; cost: number } | null = null;
  const search = (index: number, instances: Record<ServiceId, number>) => {
    if (index === checkpoint.adjustable.length) {
      const outcome = evaluateCapacity(mission, checkpoint, instances);
      if (objectivesMet(outcome) && (!best || outcome.windowCost < best.cost)) best = { plan: { ...start, instances: { ...instances } }, cost: outcome.windowCost };
      return;
    }
    const entry = checkpoint.adjustable[index];
    for (let count = entry.min; count <= entry.max; count += 1) search(index + 1, { ...instances, [entry.service]: count });
  };
  search(0, { ...start.instances });
  return (best as { plan: Plan; cost: number } | null)?.plan ?? start;
}

// Facts about a change that a justification can rest on. Compared with the checkpoint's starting state.
export function planTags(mission: Mission, checkpoint: Checkpoint, plan: Plan, outcome: Outcome): string[] {
  const tags: string[] = [];
  if (checkpoint.kind === "capacity") {
    for (const entry of checkpoint.adjustable) {
      const before = mission.initialInstances[entry.service];
      const after = plan.instances[entry.service];
      tags.push(`${after > before ? "up" : after < before ? "down" : "same"}:${entry.service}`);
    }
    if (outcome.policy) tags.push("meets-headroom");
    if (tags.every((tag) => !tag.startsWith("up:") && !tag.startsWith("down:"))) tags.push("no-change");
  } else if (outcome.kind === "access") {
    const kept = checkpoint.permissions.filter((entry) => plan.grants.includes(entry.id)).length;
    if (kept < mission.initialGrants.length) tags.push("narrowed");
    else tags.push("no-change");
    if (outcome.excess.length === 0) tags.push("removes-excess");
    if (outcome.missing.length === 0) tags.push("keeps-required");
  }
  return tags;
}

export function samePlan(checkpoint: Checkpoint, a: Plan, b: Plan): boolean {
  if (checkpoint.kind === "capacity") return checkpoint.adjustable.every((entry) => a.instances[entry.service] === b.instances[entry.service]);
  return checkpoint.permissions.every((entry) => a.grants.includes(entry.id) === b.grants.includes(entry.id));
}
