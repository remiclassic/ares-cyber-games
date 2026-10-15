// Defense in Depth: plan layered controls against an attacker who adapts. Pure types; no DOM.

export type StageId = "initial" | "execution" | "credential" | "lateral" | "impact";

export type Stage = Readonly<{ id: StageId; name: string; short: string; question: string }>;

export type Technique = Readonly<{
  id: string;
  stage: StageId;
  name: string;
  attack: string; // ATT&CK technique id, for reference
  detail: string;
  // Initial-access techniques say which execution technique follows them.
  leadsTo?: string;
  // Damage when an impact technique completes (0 elsewhere).
  damage?: number;
}>;

export type Effect = "block" | "detect" | "recover";

export type Control = Readonly<{
  id: string;
  name: string;
  short: string;
  cost: number;
  friction: number;
  frictionNote: string;
  detail: string;
  effects: Readonly<Record<string, Effect>>;
  // 24×7 monitoring: turns detections into containment.
  responds?: boolean;
}>;

export type Campaign = Readonly<{
  id: string;
  name: string;
  actor: string;
  // Intel shown before the wave: what the actor is known to do.
  intel: string;
  // Preference order per stage. The actor uses the first option no deployed control blocks.
  // A single option means a fixed playbook.
  initial: readonly string[];
  credential: readonly string[];
  lateral: readonly string[];
  impact: readonly string[];
  // Retry variant: a different preference order for some stages.
  alt?: Partial<Pick<Campaign, "initial" | "credential" | "lateral" | "impact">>;
}>;

export type Wave = Readonly<{
  id: string;
  title: string;
  brief: string;
  credits: number; // added at the start of this wave
  frictionAllowance: number; // total friction the business accepts by this wave
  campaigns: readonly Campaign[];
  // An authored strong plan: controls added this wave. Used by tests and the SME sheet.
  reference: readonly string[];
}>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  crownJewels: string;
  stages: readonly Stage[];
  techniques: readonly Technique[];
  controls: readonly Control[];
  waves: readonly Wave[];
}>;

export type StepResult = "ran" | "blocked" | "detected" | "recovered" | "contained";

export type Step = Readonly<{
  stage: StageId;
  technique: string;
  result: StepResult;
  // Controls that blocked, detected or recovered at this step.
  by: readonly string[];
  // Detected but nobody was there to respond.
  unanswered: boolean;
  // Options the actor skipped because a control blocked them.
  skipped: readonly string[];
}>;

export type CampaignRun = Readonly<{
  campaign: string;
  steps: readonly Step[];
  stopped: boolean;
  stoppedAt: StageId | null;
  // Controls the stop depended on.
  decisive: readonly string[];
  damage: number;
}>;

export type WaveScore = Readonly<{
  outcome: number;
  depth: number;
  friction: number;
  total: number;
  damage: number;
  maxDamage: number;
  resilient: number;
  campaigns: number;
  frictionUsed: number;
  frictionAllowance: number;
}>;

export type Check = Readonly<{
  campaign: string;
  removed: string;
  question: string;
  options: readonly string[];
  correct: number;
  explain: string;
}>;

export type WaveRecord = {
  waveId: string;
  deployed: string[];
  added: string[];
  runs: CampaignRun[];
  resilience: Record<string, { resilient: boolean; failsWithout: string | null }>;
  score: WaveScore;
  check: Check | null;
  answer: { choice: number; correct: boolean } | null;
  log: Command[];
};

export type Command =
  | Readonly<{ type: "deploy"; control: string }>
  | Readonly<{ type: "remove"; control: string }>
  | Readonly<{ type: "launch" }>
  | Readonly<{ type: "answer"; choice: number }>
  | Readonly<{ type: "next" }>;

export type Result = Readonly<{ ok: true }> | Readonly<{ ok: false; error: string }>;

export type Phase = "plan" | "result" | "done";

export type GameState = {
  scenario: Scenario;
  seed: string;
  attempt: number;
  variant: number;
  waveIndex: number;
  phase: Phase;
  // Controls in service from earlier waves (locked) and added this wave (removable).
  locked: string[];
  added: string[];
  creditsLeft: number;
  log: Command[];
  records: WaveRecord[];
};

export type Summary = Readonly<{
  total: number;
  outcome: number;
  depth: number;
  friction: number;
  damage: number;
  maxDamage: number;
  resilient: number;
  campaigns: number;
  checksCorrect: number;
  checksTotal: number;
  unansweredDetections: number;
}>;
