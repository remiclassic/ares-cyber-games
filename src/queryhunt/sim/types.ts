export type Value = string | number | null;
export type VariantId = "a" | "b";
export type Mode = "guided" | "sql";

// ---------- query results ----------
export type QueryResult = Readonly<{ columns: string[]; rows: Value[][]; truncated: boolean }>;

export type RunOutcome =
  | Readonly<{ ok: true; result: QueryResult }>
  // "blocked": refused by the read-only guard. "syntax": SQLite could not run it.
  | Readonly<{ ok: false; kind: "blocked" | "syntax"; message: string; detail?: string }>;

// How a challenge's result set is checked. Columns are matched by name unless
// `flexible` (an aggregate whose alias is the learner's choice).
export type CheckSpec = Readonly<{
  columns: readonly Readonly<{ name: string; flexible?: boolean }>[];
  orderBy?: Readonly<{ column: string; dir: "asc" | "desc" }>;
}>;

export type CheckResult =
  | Readonly<{ match: true }>
  | Readonly<{ match: false; reason: "missing-column" | "too-many" | "too-few" | "wrong-rows" | "wrong-order"; message: string }>;

// ---------- guided blocks ----------
export type Tile =
  | Readonly<{ id: string; kind: "source"; label: string; table: string; select: string }>
  | Readonly<{ id: string; kind: "join"; label: string; sql: string; select: string }>
  | Readonly<{ id: string; kind: "filter"; label: string; sql: string }>
  | Readonly<{ id: string; kind: "group"; label: string; by: string; select: string }>
  | Readonly<{ id: string; kind: "sort"; label: string; sql: string }>;

// ---------- case content ----------
export type Verdict = "relevant" | "optional" | "wrong";

export type Candidate = Readonly<{
  id: string;
  title: string;
  source: string;
  fields: readonly (readonly [string, string])[];
  note: string;
  verdict: Verdict;
  // Shown when the learner pins it: why it is not evidence (wrong) or what it adds (optional).
  feedback: string;
  // Rows of the learner's result that this card refers to.
  highlight?: Readonly<{ column: string; value: string }>;
}>;

export type Option = Readonly<{ id: string; text: string; correct: boolean; feedback: string }>;

export type QueryChallenge = Readonly<{
  kind: "query";
  id: string;
  node: string;
  title: string;
  question: string;
  mustInclude: string;
  ordering: string;
  expectedSql: string;
  check: CheckSpec;
  tiles: readonly Tile[];
  hints: readonly string[];
  candidates: readonly Candidate[];
  explain: Readonly<{ prompt: string; options: readonly Option[] }>;
  concept: string;
}>;

export type ConclusionChallenge = Readonly<{
  kind: "conclusion";
  id: string;
  node: string;
  title: string;
  question: string;
  hints: readonly string[];
  options: readonly Option[];
  // Evidence that must be cited for the cautious conclusion to be supported.
  requiredEvidence: readonly string[];
  // Evidence that only shows failed attempts.
  attemptsOnly: readonly string[];
  evidenceFeedback: Readonly<{ attemptsOnly: string; missingSuccess: string; missingActivity: string; none: string }>;
  supported: string;
  openQuestions: readonly string[];
}>;

export type Challenge = QueryChallenge | ConclusionChallenge;

export type CaseDef = Readonly<{
  id: string;
  title: string;
  variant: VariantId;
  variantLabel: string;
  brief: string;
  challenges: readonly Challenge[];
}>;

// ---------- game state ----------
export type Phase = "query" | "pin" | "explain" | "conclude" | "done";

export type StepLog = {
  runs: number;
  sqlErrors: number;
  mismatches: number;
  solvedSql: string | null;
  solvedMode: Mode | null;
  pinTries: number;
  wrongPins: string[];
  explainTries: number;
  wrongExplains: string[];
  hints: number;
  points: { query: number; evidence: number; interpretation: number };
};

export type Game = {
  variant: VariantId;
  step: number;
  phase: Phase;
  steps: StepLog[];
  // Pinned evidence ids, in the order they were collected.
  evidence: string[];
  conclusion: { tries: number; wrong: string[]; chosen: string | null; cited: string[]; points: number };
};

export type Score = Readonly<{ query: number; evidence: number; interpretation: number; conclusion: number; total: number; max: number; hints: number }>;
