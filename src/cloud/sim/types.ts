// Ares: Cloud Command. Types for the pure simulation (no DOM, no rendering).

export type ServiceId = string;
export type Permission = string;
export type StationId = "us-west" | "eu-central" | "ap-southeast";

// Things a learner may or may not know when they decide. Estimates only use known facts.
export type Fact = "peak" | "dependency" | "usage";

export type Dependency = Readonly<{ service: ServiceId; callsPerRequest: number }>;

export type Service = Readonly<{
  id: ServiceId;
  name: string;
  // Requests per second one instance serves.
  unitCapacity: number;
  // Credits per instance-hour, billed while the instance runs.
  unitCost: number;
  dependsOn: readonly Dependency[];
}>;

export type EvidenceIcon = "demand" | "capacity" | "errors" | "cost" | "forecast" | "ticket" | "keys" | "log" | "link";

export type Evidence = Readonly<{
  id: string;
  // Chips are collected in flight (or pulled from the station log); inspect evidence comes from the Inspect action.
  source: "chip" | "inspect";
  icon: EvidenceIcon;
  title: string;
  lines: readonly string[];
  reveals?: Fact;
}>;

export type Justification = Readonly<{
  id: string;
  text: string;
  // Is the statement true in this scenario?
  valid: boolean;
  // Plan tags that must all hold for the statement to support the change (see planTags).
  fits: readonly string[];
  feedback: string;
  // Only offered once this fact is known, so the wording cannot give it away.
  needs?: Fact;
}>;

export type Adjustable = Readonly<{
  service: ServiceId;
  min: number;
  max: number;
  card: "add" | "rightsize";
  title: string;
  blurb: string;
  // The card only appears once this fact is known.
  needs?: Fact;
}>;

type CheckpointBase = Readonly<{
  id: string;
  station: StationId;
  title: string;
  goal: string;
  brief: string;
  requirements: readonly string[];
  evidence: readonly Evidence[];
  inspect?: Readonly<{ title: string; blurb: string }>;
  justifications: readonly Justification[];
  // Debrief text.
  responsibility: string;
  connection: string;
}>;

export type CapacityCheckpoint = CheckpointBase &
  Readonly<{
    kind: "capacity";
    focus: ServiceId;
    adjustable: readonly Adjustable[];
    demandNow: number;
    demandPeak: number;
    // Required spare capacity above the expected peak, as a fraction.
    headroom: number;
    minAvailability: number;
    windowHours: number;
    // Most the window may cost, in credits.
    costCeiling: number;
  }>;

export type PermissionInfo = Readonly<{
  id: Permission;
  allows: string;
  lastUsed: string;
  // Why the stated task needs it (required permissions only).
  neededFor?: string;
}>;

export type AccessCheckpoint = CheckpointBase &
  Readonly<{
    kind: "access";
    account: string;
    statedTask: string;
    permissions: readonly PermissionInfo[];
    // What the ticket names. May be incomplete.
    ticketPermissions: readonly Permission[];
    // What the stated task really calls.
    requiredPermissions: readonly Permission[];
  }>;

export type Checkpoint = CapacityCheckpoint | AccessCheckpoint;

export type Mission = Readonly<{
  id: string;
  title: string;
  organisation: string;
  serviceModel: Readonly<{ name: string; summary: string; provider: readonly string[]; customer: readonly string[] }>;
  budget: number;
  fees: Readonly<{ inspect: number; revise: number }>;
  maxAttempts: number;
  services: readonly Service[];
  initialInstances: Readonly<Record<ServiceId, number>>;
  initialGrants: readonly Permission[];
  checkpoints: readonly Checkpoint[];
}>;

// A plan is a target configuration.
export type Plan = Readonly<{ instances: Readonly<Record<ServiceId, number>>; grants: readonly Permission[] }>;

export type ServiceResult = Readonly<{
  id: ServiceId;
  name: string;
  instances: number;
  capacity: number;
  offered: number;
  served: number;
  // Capacity the policy asks for: full demand plus headroom.
  required: number;
  headroomMet: boolean;
}>;

export type CapacityOutcome = Readonly<{
  kind: "capacity";
  demand: number;
  services: readonly ServiceResult[];
  availability: number;
  // The service whose capacity limits the focus service, if any.
  constraint: ServiceId | null;
  continuity: boolean;
  policy: boolean;
  withinCost: boolean;
  costPerHour: number;
  windowCost: number;
}>;

export type AccessOutcome = Readonly<{
  kind: "access";
  granted: readonly Permission[];
  missing: readonly Permission[];
  excess: readonly Permission[];
  availability: number;
  continuity: boolean;
  policy: boolean;
  withinCost: true;
  windowCost: 0;
}>;

export type Outcome = CapacityOutcome | AccessOutcome;

export type Estimate = Readonly<{ outcome: Outcome; assumptions: readonly string[] }>;

export type Attempt = Readonly<{
  plan: Plan;
  change: string;
  justification: string;
  justified: boolean;
  known: readonly Fact[];
  estimate: Estimate;
  outcome: Outcome;
  lines: readonly string[];
}>;

export type CheckpointRecord = {
  id: string;
  evidence: string[];
  flightChips: string[];
  observed: Fact[];
  inspected: boolean;
  attempts: Attempt[];
  fees: number;
  done: boolean;
};

export type Stage = "travel" | "decide" | "outcome" | "complete";

export type GameState = {
  mission: Mission;
  index: number;
  stage: Stage;
  budget: number;
  instances: Record<ServiceId, number>;
  grants: Permission[];
  records: CheckpointRecord[];
};

export type Command =
  | { type: "collect"; evidence: string; via: "flight" | "station" }
  | { type: "arrive" }
  | { type: "inspect" }
  | { type: "apply"; plan: Plan; justification: string }
  | { type: "revise" }
  | { type: "continue" };

export type Result = { ok: true } | { ok: false; error: string };

export type CheckpointScore = Readonly<{
  id: string;
  title: string;
  continuity: number;
  policy: number;
  resource: number;
  justification: number;
  score: number;
  continuityMet: boolean;
  policyMet: boolean;
  costMet: boolean;
  attempts: number;
  recovered: boolean;
  // Described only when the final change missed an objective or spent more than the efficient plan.
  better: string | null;
}>;

export type MissionRating = "objectives-met" | "objectives-partly-met" | "security-objective-failed";

export type Summary = Readonly<{
  checkpoints: readonly CheckpointScore[];
  // Averages over checkpoints, 0..1.
  continuity: number;
  policy: number;
  resource: number;
  justification: number;
  learningScore: number;
  securityObjectiveMet: boolean;
  rating: MissionRating;
  recoveries: number;
  budgetLeft: number;
}>;

// Reported next to the learning score, never mixed into it.
export type NavigationReport = Readonly<{
  chipsInFlight: number;
  chipsTotal: number;
  autopilotSegments: number;
  segments: number;
  flightSeconds: number;
}>;
