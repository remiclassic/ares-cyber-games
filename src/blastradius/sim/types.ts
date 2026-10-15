// Blast Radius: scope a compromise from aggregate telemetry before containing it.
// Pure types; no DOM.

export type HostKind = "workstation" | "laptop" | "server" | "critical";

export type Host = Readonly<{
  id: string;
  label: string;
  role: string;
  kind: HostKind;
  // Map position, 0–100 on each axis.
  x: number;
  y: number;
  // Business weight when a clean host is isolated (1 normal, 3 for a critical service).
  weight: number;
}>;

export type SensorKind = "dns" | "proxy" | "ids" | "vpn";

export type Sensor = Readonly<{
  id: string;
  label: string;
  kind: SensorKind;
  // Why this source reports a count and not names. Shown when the sensor is read.
  why: string;
  covers: readonly string[];
  x: number;
  y: number;
}>;

export type CaseVariant = Readonly<{
  // Hosts that really show the indicator in this variant.
  compromised: readonly string[];
}>;

export type CaseDef = Readonly<{
  id: string;
  title: string;
  site: string;
  brief: string;
  budgetMinutes: number;
  hosts: readonly Host[];
  sensors: readonly Sensor[];
  // Two truths over the same network; the seed picks one. Retry swaps it.
  variants: readonly [CaseVariant, CaseVariant];
  // Shown on the first case only.
  guided?: boolean;
}>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  indicator: string;
  costs: Readonly<{ readSensor: number; triage: number }>;
  cases: readonly CaseDef[];
}>;

export type Decision = "isolate" | "keep" | "watch";

export type Status = "compromised" | "clean";

// What the learner knows about one host from the evidence they have gathered.
export type Knowledge = "compromised" | "clean" | "unknown";

export type Command =
  | Readonly<{ type: "read"; sensor: string }>
  | Readonly<{ type: "triage"; host: string }>
  | Readonly<{ type: "decide"; host: string; decision: Decision | null }>
  | Readonly<{ type: "submit"; elapsedSeconds: number }>
  | Readonly<{ type: "answer"; choice: number }>
  | Readonly<{ type: "next" }>;

export type Result = Readonly<{ ok: true }> | Readonly<{ ok: false; error: string }>;

export type HostOutcome = Readonly<{
  host: string;
  truth: Status;
  decision: Decision | "none";
  // What the evidence the learner gathered proved at submission.
  known: Knowledge;
  supported: boolean;
  verdict: "contained" | "missed" | "watched-compromised" | "kept-clean" | "over-isolated" | "watched-clean";
  why: string;
}>;

export type CaseScore = Readonly<{
  containment: number;
  continuity: number;
  evidence: number;
  efficiency: number;
  total: number;
  compromisedTotal: number;
  compromisedIsolated: number;
  cleanIsolated: number;
  triagesUsed: number;
  triagesNeeded: number;
}>;

export type Check = Readonly<{
  host: string;
  question: string;
  options: readonly string[];
  correct: number;
  explain: string;
}>;

export type CaseRecord = {
  caseId: string;
  variant: number;
  reads: string[];
  triages: string[];
  decisions: Record<string, Decision>;
  minutesUsed: number;
  seconds: number;
  outcomes: HostOutcome[];
  score: CaseScore;
  check: Check | null;
  answer: { choice: number; correct: boolean } | null;
  log: Command[];
};

export type Phase = "play" | "result" | "done";

export type GameState = {
  scenario: Scenario;
  seed: string;
  // Retry count; each retry swaps every case to its other truth.
  attempt: number;
  caseIndex: number;
  variant: number;
  phase: Phase;
  reads: Set<string>;
  triages: Set<string>;
  decisions: Map<string, Decision>;
  minutesUsed: number;
  log: Command[];
  records: CaseRecord[];
};

export type Summary = Readonly<{
  total: number;
  containment: number;
  continuity: number;
  evidence: number;
  efficiency: number;
  seconds: number;
  checksCorrect: number;
  checksTotal: number;
  missedCompromised: number;
  overIsolated: number;
  unsupported: number;
}>;
