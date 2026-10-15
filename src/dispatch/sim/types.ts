// Ares: Cyber Dispatch — shared types. The simulation is pure and turn-based:
// the shift clock only moves when the learner acts (or waits), so every
// outcome can be rebuilt from the recorded actions.

export type Priority = "low" | "medium" | "high";
export type Mood = "neutral" | "worried" | "relieved" | "annoyed" | "alarmed";
export type DeptId = "finance" | "hr" | "marketing" | "product" | "it";
export type PersonId = "priya" | "daniel" | "elena";
export type AnalystId = "alex" | "jamie";

export type Fact = Readonly<{
  id: string;
  text: string;
  // Key facts are the ones a handoff needs; they drive the evidence score.
  key: boolean;
  // Priorities this fact can justify on its own.
  justifies?: readonly Priority[];
}>;

export type Question = Readonly<{
  id: string;
  label: string;
  reply: string;
  mood?: Mood;
  // Fact revealed. Questions without one are irrelevant: they cost time only.
  fact?: string;
  // Fact that must be recorded before this question is offered.
  requires?: string;
}>;

export type GuidanceQuality = "correct" | "weak" | "harmful";

export type Guidance = Readonly<{
  id: string;
  label: string;
  quality: GuidanceQuality;
  reply: string;
  mood: Mood;
  // Shown when the step is weak or harmful.
  consequence?: string;
}>;

// A point the handoff must cover, worded neutrally so it gives nothing away.
// The learner marks it confirmed (they hold evidence) or unresolved.
// `fact: null` is something no question can establish.
export type Claim = Readonly<{ id: string; text: string; fact: string | null; why: string }>;

// What happens if no safe next step is given in time.
export type Harm = Readonly<{ afterMinutes: number; headline: string; text: string; depts?: readonly DeptId[] }>;

export type OutcomeKind = "clean" | "recovered" | "harmed" | "underhandled" | "rightSized" | "overEscalated" | "unhandled";

export type Lessons = Readonly<{
  good: string;
  guidance: string;
  timing: string;
  route: string;
  priority: string;
}>;

export type Scenario = Readonly<{
  id: string;
  family: "mfa" | "files" | "invoice";
  title: string;
  tag: string;
  reporter: Readonly<{ id: PersonId; name: string; first: string; dept: DeptId; deptLabel: string }>;
  opening: string;
  truth: Readonly<{ priority: Priority; needsAnalyst: boolean; summary: string }>;
  facts: readonly Fact[];
  questions: readonly Question[];
  guidance: readonly Guidance[];
  claims: readonly Claim[];
  harm?: Harm;
  // Authored duration of an analyst assignment, in shift minutes.
  analystMinutes: number;
  // "{analyst}" is replaced with the assigned analyst's name.
  outcomes: Readonly<Record<OutcomeKind, string>>;
  lessons: Lessons;
  mission: string;
}>;

export type ShiftDef = Readonly<{
  id: string;
  label: string;
  day: string;
  // Minutes after midnight at clock 0.
  startMinutes: number;
  length: number;
  arrivals: readonly Readonly<{ caseId: string; at: number }>[];
  analysts: readonly Readonly<{ id: AnalystId; name: string; busyUntil: number }>[];
  scenarios: readonly Scenario[];
}>;

// ---------- state ----------

export type ClaimMark = "confirmed" | "unresolved";
export type Line = { speaker: "you" | "them" | "system"; text: string };
export type Handoff = { at: number; route: "analyst" | "guidance"; analystId: AnalystId | null; endsAt: number };

export type CaseState = {
  id: string;
  status: "pending" | "open" | "assigned" | "resolved";
  arrivesAt: number;
  transcript: Line[];
  mood: Mood;
  asked: string[];
  facts: string[];
  wasted: number;
  priority: Priority | null;
  // Each entry keeps the facts recorded at that moment, so a priority can be
  // judged against what the learner actually knew.
  priorityLog: { at: number; priority: Priority; facts: string[] }[];
  guidanceLog: { at: number; id: string }[];
  harmedAt: number | null;
  harmCause: "deadline" | "guidance" | null;
  claims: Record<string, ClaimMark>;
  handoff: Handoff | null;
  reopens: number;
  resolvedAt: number | null;
};

export type AnalystState = { id: AnalystId; name: string; busyUntil: number; busyFrom: number; task: string | null };

export type FeedTone = "good" | "info" | "bad" | "badge";
export type FeedItem = { id: number; at: number; tone: FeedTone; title: string; detail: string; caseId: string | null };
export type LogEntry = { at: number; caseId: string | null; kind: string; detail: string };

export type ShiftState = {
  shiftId: string;
  clock: number;
  phase: "playing" | "ended";
  cases: CaseState[];
  analysts: AnalystState[];
  feed: FeedItem[];
  log: LogEntry[];
  badges: string[];
  seq: number;
};

export type Action =
  | { type: "ASK"; caseId: string; questionId: string }
  | { type: "SET_PRIORITY"; caseId: string; priority: Priority }
  | { type: "GIVE_GUIDANCE"; caseId: string; guidanceId: string }
  | { type: "MARK_CLAIM"; caseId: string; claimId: string; mark: ClaimMark }
  | { type: "HANDOFF"; caseId: string; route: "analyst"; analystId: AnalystId }
  | { type: "HANDOFF"; caseId: string; route: "guidance" }
  | { type: "REOPEN"; caseId: string }
  | { type: "WAIT" }
  | { type: "END_SHIFT" };
