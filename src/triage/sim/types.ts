export type Lane = "immediate" | "investigate" | "monitor";

export const LANES: readonly Lane[] = ["immediate", "investigate", "monitor"];

// Phase 0 is shift start; each update moves the shift to the next phase.
export type Phase = 0 | 1 | 2;

export type Severity = "High" | "Medium" | "Low";
export type Level = "Critical" | "High" | "Medium" | "Low";

export type Category = "Identity" | "Network" | "Operations" | "Email" | "Endpoint";

// Justification choices. "label" is the trap: a severity tag is not evidence.
export type ReasonId = "confirmed" | "thin" | "expected" | "lowlow" | "label";

export type Reason = Readonly<{ id: ReasonId; text: string; hint: string }>;

export type EvidenceItem = Readonly<{
  time: string;
  title: string;
  detail: string;
  // Phase in which this item becomes visible.
  from: Phase;
  // Marks the first event in the timeline (drawn as the alert trigger).
  trigger?: boolean;
}>;

// What the evidence supports at one phase of the shift.
export type Assessment = Readonly<{
  confidence: number;
  confidenceNote: string;
  impact: Level;
  impactNote: string;
  known: readonly string[];
  unknown: readonly string[];
  best: Lane;
  // Defensible, but not the strongest call.
  ok: readonly Lane[];
  reasons: readonly ReasonId[];
  // Shown in the debrief only.
  why: string;
}>;

export type Alert = Readonly<{
  id: string;
  title: string;
  subject: string;
  summary: string;
  time: string;
  category: Category;
  severity: Severity;
  tag: string;
  asset: Readonly<{ name: string; role: string; importance: Level }>;
  evidence: readonly EvidenceItem[];
  // One entry per phase.
  assessment: readonly [Assessment, Assessment, Assessment];
  // Alerts that share a truth group describe the same underlying activity.
  group?: string;
}>;

export type Update = Readonly<{
  // The phase this update opens.
  phase: 1 | 2;
  clock: string;
  from: string;
  title: string;
  body: readonly string[];
  // Alerts that receive new evidence.
  affects: readonly string[];
}>;

// A decision worth replaying in the debrief.
export type ReplayMoment = Readonly<{ phase: Phase; alert: string; headline: string }>;

export type TruthGroup = Readonly<{ id: string; name: string; why: string }>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  clock: readonly [string, string, string];
  // Seconds allowed per phase when the timer is on.
  seconds: readonly [number, number, number];
  immediateCapacity: number;
  alerts: readonly Alert[];
  updates: readonly [Update, Update];
  groups: readonly TruthGroup[];
  reasons: readonly Reason[];
  replay: readonly ReplayMoment[];
  missionConnection: string;
}>;

export type Placement = { lane: Lane; reason: ReasonId | null };

export type Command =
  | { type: "inspect"; alert: string }
  | { type: "place"; alert: string; lane: Lane }
  | { type: "unplace"; alert: string }
  | { type: "justify"; alert: string; reason: ReasonId }
  | { type: "link"; alert: string; with: string }
  | { type: "unlink"; alert: string }
  | { type: "submit"; elapsedSeconds: number; timedOut?: boolean };

export type Result = { ok: true } | { ok: false; error: string };

export type Verdict = "best" | "ok" | "weak" | "missed" | "overescalated" | "unplaced";

export type AlertRecord = Readonly<{
  alert: string;
  lane: Lane | null;
  reason: ReasonId | null;
  // Other alerts linked with this one when the round was submitted.
  linkedWith: readonly string[];
  // Evidence was opened this phase before the lane was last set.
  evidenceFirst: boolean;
  verdict: Verdict;
  reasonOk: boolean;
  // Moved to the strongest lane after new evidence changed it.
  revised: boolean;
  points: number;
}>;

export type LinkRecord = Readonly<{ members: readonly string[]; correct: boolean; group?: string }>;

export type RoundRecord = Readonly<{
  phase: Phase;
  elapsedSeconds: number;
  timedOut: boolean;
  alerts: readonly AlertRecord[];
  links: readonly LinkRecord[];
  points: number;
  maxPoints: number;
}>;

export type GameState = {
  scenario: Scenario;
  phase: Phase;
  done: boolean;
  placements: Record<string, Placement>;
  // Alert id -> incident id. Alerts sharing an incident id are linked.
  links: Record<string, string>;
  // Alerts whose evidence was opened in the current phase.
  inspected: Record<string, boolean>;
  // Whether evidence had been opened this phase when the lane was last set.
  evidenceFirst: Record<string, boolean>;
  rounds: RoundRecord[];
  nextIncident: number;
};

export type RewardKind = "critical" | "benign" | "revised" | "linked";

export type Reward = Readonly<{ kind: RewardKind; phase: Phase; alert: string; text: string }>;

export type Summary = Readonly<{
  // Decision quality, 0..1. Speed is never part of it.
  quality: number;
  points: number;
  maxPoints: number;
  criticalCaught: number;
  criticalTotal: number;
  missedCritical: number;
  unnecessaryEscalations: number;
  benignRecognized: number;
  revisions: number;
  revisionChances: number;
  correctLinks: number;
  wrongLinks: number;
  linkChances: number;
  reasonsMatched: number;
  reasonsTotal: number;
  // Reported separately from quality.
  seconds: number;
  evidenceFirst: number;
  decisions: number;
  rewards: readonly Reward[];
}>;
