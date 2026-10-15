// Counterplay: read the telemetry, name the technique, play the response that counters it.
// Pure types; no DOM.

export type Fit = "counter" | "partial" | "miss";

export type ResponseCard = Readonly<{
  id: string;
  name: string;
  detail: string;
  icon: "user" | "mail" | "shield" | "host" | "network" | "cloud" | "key" | "phone" | "backup" | "log";
}>;

export type TechniqueCard = Readonly<{
  id: string;
  name: string;
  attack: string; // ATT&CK id, for reference
  source: string; // where the telemetry comes from
  // Telemetry templates. {placeholders} are filled from the incident's seeded values.
  telemetry: readonly string[];
  // Other technique names offered when the learner names the technique: plausible confusions.
  lookalikes: readonly [string, string];
  // Why the telemetry points to this technique (shown at reveal).
  tell: string;
  counters: readonly string[];
  partials: readonly string[];
  // Specific explanation per card; anything not listed uses the generic text for its fit.
  notes: Readonly<Record<string, string>>;
}>;

export type PlaybookStep = Readonly<{
  play: string;
  // If the defender countered the previous move, the actor switches to this instead.
  ifCountered?: string;
}>;

export type Incident = Readonly<{
  id: string;
  title: string;
  brief: string;
  objective: string; // what the actor is after
  toolkit: readonly string[];
  techniques: readonly TechniqueCard[];
  playbook: readonly PlaybookStep[];
  values: Readonly<Record<string, readonly string[]>>;
}>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  target: number; // points to win a match (first to 3)
  cards: readonly ResponseCard[];
  incidents: readonly Incident[];
}>;

export type Command =
  | Readonly<{ type: "identify"; choice: string }>
  | Readonly<{ type: "play"; card: string }>
  | Readonly<{ type: "next" }>;

export type Result = Readonly<{ ok: true }> | Readonly<{ ok: false; error: string }>;

export type Hand = {
  technique: string;
  telemetry: string;
  options: string[]; // technique names offered for identification, shuffled
  identified: string | null;
  card: string | null;
  fit: Fit | null;
  // The best fit any card still in the toolkit had for this technique when the card was played.
  bestAvailable: Fit | null;
  bestCards: string[];
};

export type HandGrade = Readonly<{ identify: boolean; response: number; note: string }>;

export type IncidentScore = Readonly<{
  identify: number;
  response: number;
  outcome: number;
  total: number;
  defender: number;
  attacker: number;
  result: "evicted" | "breached" | "stalemate";
}>;

export type IncidentRecord = {
  incidentId: string;
  hands: Hand[];
  grades: HandGrade[];
  score: IncidentScore;
  log: Command[];
};

export type Phase = "identify" | "respond" | "reveal" | "over" | "done";

export type GameState = {
  scenario: Scenario;
  seed: string;
  attempt: number;
  incidentIndex: number;
  // Next playbook step to consider.
  step: number;
  phase: Phase;
  values: Record<string, string>;
  toolkit: string[]; // cards still available in this incident
  hands: Hand[];
  defender: number;
  attacker: number;
  log: Command[];
  records: IncidentRecord[];
};

export type Summary = Readonly<{
  total: number;
  identify: number;
  response: number;
  outcome: number;
  handsPlayed: number;
  identifiedRight: number;
  bestPlays: number;
  evicted: number;
  incidents: number;
}>;
