// Pure simulation types. Nothing in src/sim touches the DOM or Canvas, so the
// same code drives live play, deterministic replay, and the test suite.

export type NodeId =
  | "internet"
  | "gateway"
  | "inspect"
  | "core"
  | "hr"
  | "finance"
  | "backup";

export type Zone = "external" | "dmz" | "internal";

export type ServiceId = "invoice" | "hrportal" | "admin";
export type SourceId = "supplier" | "hrstaff" | "unknown";
export type DestId = "finance" | "hr";

export type NodeDef = Readonly<{
  id: NodeId;
  label: string;
  short: string;
  role: string;
  zone: Zone;
  gx: number;
  gy: number;
  sprite: string;
  // Services that must be reachable over internal links for this node to work.
  dependsOn?: readonly NodeId[];
}>;

export type LinkStatus = "up" | "down";

export type Link = {
  id: string;
  a: NodeId;
  b: NodeId;
  status: LinkStatus;
  kind: "primary" | "backup";
  // Which route command created it (undefined for links that ship with the board).
  routeId?: string;
};

export type RouteCandidate = Readonly<{
  id: string;
  label: string;
  description: string;
  kind: "primary" | "backup";
  links: readonly (readonly [NodeId, NodeId])[];
}>;

export type FlowDef = Readonly<{
  id: SourceId;
  label: string;
  address: string;
  dest: DestId;
  service: ServiceId;
  // Ground truth from the scenario policy. Never shown to the learner directly.
  permitted: boolean;
  evidence: readonly string[];
}>;

export type RuleAction = "allow" | "deny";
export type Rule = {
  id: string;
  action: RuleAction;
  source: SourceId | "any";
  dest: DestId | "any";
  service: ServiceId | "any";
  locked?: boolean;
  note?: string;
};

export type Assessment = "permitted" | "violates" | "unsure";

export type ScheduledRequest = Readonly<{ tick: number; flow: SourceId }>;

export type RoundEvent =
  | Readonly<{ kind: "pauseOnArrival"; flow: SourceId; message: string; title: string }>
  | Readonly<{ kind: "linkFail"; tick: number; linkId: string; title: string; message: string }>;

export type RoundDef = Readonly<{
  id: string;
  title: string;
  objective: string;
  situation: string;
  apGrant: number;
  flows: readonly SourceId[];
  counts: Readonly<Partial<Record<SourceId, number>>>;
  spacing: number;
  candidates: readonly RouteCandidate[];
  events: readonly RoundEvent[];
  allowedActions: readonly ActionKind[];
  success: Readonly<{
    minLegitRatio: number;
    minFinanceRatio?: number;
    maxProhibitedDelivered: number;
  }>;
  checkpoint?: string;
}>;

export type ActionKind = "inspect" | "rule" | "route" | "revise";

export type TokenState = "moving" | "waiting" | "blocked" | "delivered" | "failed";

export type Token = {
  id: number;
  flow: SourceId;
  permitted: boolean;
  at: NodeId;
  to: NodeId | null;
  progress: number;
  state: TokenState;
  evaluated: boolean;
  visited: NodeId[];
  resolvedTick: number;
  reason?: "rule" | "default" | "dependency" | "stuck";
  ruleId?: string;
};

export type FlowStats = {
  total: number;
  delivered: number;
  blocked: number;
  failed: number;
};

export type RoundStats = Record<SourceId, FlowStats>;

export type Phase =
  | "planning"
  | "running"
  | "paused"
  | "roundEnd"
  | "complete";

export type Command =
  | Readonly<{ type: "inspect"; flow: SourceId }>
  | Readonly<{ type: "assess"; flow: SourceId; verdict: Assessment }>
  | Readonly<{ type: "addRule"; rule: Omit<Rule, "id"> }>
  | Readonly<{ type: "reviseRule"; ruleId: string; rule: Omit<Rule, "id"> | null }>
  | Readonly<{ type: "addRoute"; routeId: string }>
  | Readonly<{ type: "removeRoute"; routeId: string }>
  | Readonly<{ type: "launch" }>
  | Readonly<{ type: "pause" }>;

export type RecordedCommand = Readonly<{ round: number; attempt: number; t: number; c: Command }>;

export type PauseInfo = Readonly<{ title: string; message: string; eventKey: string }>;

export type RoundOutcome = "success" | "setback" | "retry";

export type RoundResult = Readonly<{
  round: number;
  attempt: number;
  outcome: RoundOutcome;
  stats: RoundStats;
  explanations: readonly string[];
  headline: string;
}>;

export type Variant = Readonly<{
  failLink: string;
  unknownAddress: string;
  adminLabel: string;
}>;

export type GameState = {
  seed: string;
  variant: Variant;
  round: number;
  attempt: number;
  phase: Phase;
  tick: number;
  // step() calls this round, including ones that paused. Commands are logged
  // against this so replay applies them in exactly the same place.
  steps: number;
  ap: number;
  apGranted: number;
  apSpent: number;
  links: Link[];
  rules: Rule[];
  builtRoutes: string[];
  inspected: SourceId[];
  assessments: Partial<Record<SourceId, Assessment>>;
  tokens: Token[];
  schedule: ScheduledRequest[];
  spawnIndex: number;
  stats: RoundStats;
  firedEvents: string[];
  pause: PauseInfo | null;
  setbacks: number;
  nextId: number;
  // Final stats per round (last attempt wins), used for the scenario score.
  roundStats: (RoundStats | null)[];
  results: RoundResult[];
  log: RecordedCommand[];
  // Snapshot taken when each round attempt starts so the debrief can replay it.
  roundStarts: Record<string, string>;
  lastActionTick: number;
};

export type ScoreBreakdown = Readonly<{
  service: number;
  security: number;
  efficiency: number;
  total: number;
  legitDelivered: number;
  legitTotal: number;
  prohibitedBlocked: number;
  prohibitedTotal: number;
}>;
