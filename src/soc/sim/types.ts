// What is really going on. The opening signals are identical in both variants;
// only requested evidence and later events tell them apart.
export type Variant = "compromise" | "approved";

export type Source = "login" | "endpoint" | "network";
export const SOURCES: readonly Source[] = ["login", "endpoint", "network"];

export type Asset = "account" | "host";

export type ActionId = "monitor" | "investigate" | "escalate" | "contain" | "standdown";
export type Target = "account" | "host" | "both";

// "location" is the trap: an unusual location is a signal, not a confirmation.
export type ReasonId = "partial" | "correlated" | "impact" | "approved" | "handover" | "reversal" | "location";

// strong: separates the two explanations on its own.
// weak: a true observation that fits both explanations.
export type Strength = "strong" | "weak";
export type Points = Variant | "neutral";
export type Grade = "best" | "defensible" | "weak" | "harmful";

export type EvidenceId = "L1" | "L2" | "L3" | "E1" | "E2" | "E3" | "N1" | "N2" | "N3";

export type EvidenceContext = Readonly<{ clock: number; transferredGb: number }>;

export type EvidenceFinding = Readonly<{
  strength: Strength;
  points: Points;
  // Neutral facts shown when the evidence comes back (never a verdict).
  lines: (context: EvidenceContext) => readonly string[];
  // Shown in the debrief only.
  why: string;
}>;

export type EvidenceDef = Readonly<{
  id: EvidenceId;
  source: Source;
  label: string;
  // Scenario minutes the request takes.
  minutes: number;
  finding: Readonly<Record<Variant, EvidenceFinding>>;
}>;

export type Signal = Readonly<{
  source: Source;
  title: string;
  summary: string;
  rows: readonly Readonly<{ time: number; what: string; detail: string; alert: boolean }>[];
}>;

export type Revealed = { id: EvidenceId; at: number; seq: number; lines: string[] };

export type FeedItem = {
  id: string;
  at: number;
  // Number of decisions already committed when this appeared.
  seq: number;
  source: Source;
  kind: "world" | "action";
  title: string;
  detail: string;
  strength?: Strength;
  points?: Points;
};

// Anything the player can cite in support of a decision.
export type Clue = Readonly<{ id: string; source: Source; title: string; time: number; strength: Strength; points: Points }>;

// What the player knew when deciding. Grading uses this, never the hidden truth.
export type View = {
  // Distinct sources with strong evidence seen (0-3).
  known: number;
  sources: Source[];
  direction: Variant | null;
  hostContained: boolean;
  accountContained: boolean;
  clock: number;
  transferredGb: number;
};

export type DecisionRecord = {
  n: number;
  at: number;
  after: number;
  view: View;
  action: ActionId;
  target?: Target;
  reason: ReasonId;
  cited: string[];
  requested: EvidenceId[];
  grade: Grade;
  why: string;
  reasonFit: number;
  citeFit: number;
};

export type CaseState = {
  seed: string;
  variant: Variant;
  clock: number;
  // 1-based decision point the player is on.
  decision: number;
  budget: number;
  revealed: Revealed[];
  feed: FeedItem[];
  fired: string[];
  hostContainedAt: number | null;
  accountContainedAt: number | null;
  escalatedAt: number | null;
  irActAt: number | null;
  stoodDownAt: number | null;
  decisions: DecisionRecord[];
  stalls: number;
  ended: boolean;
};

export type Command =
  | Readonly<{ type: "request"; id: EvidenceId }>
  | Readonly<{ type: "commit"; action: ActionId; target?: Target; reason: ReasonId; cited: readonly string[] }>
  | Readonly<{ type: "stall" }>;

export type Outcome = Readonly<{
  variant: Variant;
  resolvedBy: "you" | "responders" | "next shift" | "nobody";
  // compromise
  exposedGb: number;
  payrollExposed: boolean;
  mailRule: boolean;
  fraudAttempt: boolean;
  hostStopAt: number | null;
  accountStopAt: number | null;
  // approved
  hostDownMinutes: number;
  accountDownMinutes: number;
  exportCut: boolean;
  deadlineMissed: boolean;
  caseLeftOpen: boolean;
  escalated: boolean;
  // What happened after the last decision, in plain sentences.
  epilogue: readonly string[];
}>;

export type Rating = "lead" | "analyst" | "trainee" | "novice";

export type Score = Readonly<{
  outcome: number;
  decisions: number;
  reasoning: number;
  total: number;
  rating: Rating;
}>;

export const OUTCOME_MAX = 40;
export const DECISIONS_MAX = 36;
export const REASONING_MAX = 24;
