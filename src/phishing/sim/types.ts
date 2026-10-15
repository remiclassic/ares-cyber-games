export type Verdict = "report" | "safe" | "verify";

// What the message really is. "verify" messages cannot be settled from the
// inbox alone; `outcome` says what the trusted-channel check turns up.
export type Category = "phish" | "legit" | "verify";

export type CueKind = "sender" | "replyTo" | "link" | "attachment" | "request" | "tone" | "context";

// strong: evidence that supports the best response.
// weak: true observation that does not settle the question on its own.
export type CueStrength = "strong" | "weak";

export type CueFlag = "suspicious" | "matches" | "policy" | "weak";

export type Cue = Readonly<{
  id: string;
  kind: CueKind;
  label: string;
  // Neutral facts shown when the learner inspects the cue (never a verdict).
  facts: readonly string[];
  strength: CueStrength;
  // Shown after the decision.
  flag: CueFlag;
  why: string;
}>;

export type BodyBlock =
  | Readonly<{ type: "p"; text: string }>
  | Readonly<{ type: "button"; text: string; cue: string }>
  | Readonly<{ type: "link"; lead: string; text: string; cue: string }>
  | Readonly<{ type: "attachment"; name: string; meta: string; cue: string }>
  | Readonly<{ type: "sign"; lines: readonly string[] }>;

export type Message = Readonly<{
  id: string;
  batch: 1 | 2 | 3;
  guided?: boolean;
  category: Category;
  // For "verify" messages: what the independent check reveals.
  outcome?: "malicious" | "legitimate";
  fromName: string;
  fromAddress: string;
  replyTo?: string;
  initials: string;
  time: string;
  subject: string;
  preview: string;
  external: boolean;
  brand: Readonly<{ name: string; tag: string }>;
  body: readonly BodyBlock[];
  cues: readonly Cue[];
  // Feedback keyed by the response the learner chose.
  feedback: Readonly<Record<Verdict, string>>;
  // One line for the toast when the best response is chosen.
  headline: string;
}>;

export type Quality = "correct" | "partial" | "wrong";

export type Decision = Readonly<{
  messageId: string;
  response: Verdict;
  best: Verdict;
  quality: Quality;
  evidence: readonly string[];
  strongPicked: readonly string[];
  weakPicked: readonly string[];
  missedCues: readonly string[];
  seconds: number;
  points: Readonly<{ accuracy: number; evidence: number; streak: number; speed: number; total: number }>;
  streakAfter: number;
}>;

export type Rating = "guardian" | "analyst" | "trainee" | "novice";

export type Summary = Readonly<{
  total: number;
  parScore: number;
  ratio: number;
  rating: Rating;
  correct: number;
  partial: number;
  wrong: number;
  accuracyPoints: number;
  evidencePoints: number;
  streakPoints: number;
  speedPoints: number;
  bestStreak: number;
  falseAlarms: number;
  missedPhish: number;
  skippedVerification: number;
}>;
