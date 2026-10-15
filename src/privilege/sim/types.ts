export type Action = "read" | "write";

export type NodeKind = "user" | "group" | "resource";
export type NodeIcon = "user" | "service" | "group" | "folder" | "file" | "queue";

export type PuzzleNode = Readonly<{
  id: string;
  kind: NodeKind;
  icon: NodeIcon;
  label: string;
  sub: string;
  // Resources the puzzle is about get a warning ring.
  sensitive?: boolean;
  // Neutral facts shown in the inspector (never a verdict).
  facts: readonly string[];
  x: number;
  y: number;
}>;

// member:   user -> group, or group -> group (nesting). Carries membership.
// grant:    principal -> resource, for the listed actions.
// contains: folder -> item. Grants on the folder also apply to the item.
// info:     any other relationship drawn on the map. Never grants anything.
export type EdgeKind = "member" | "grant" | "contains" | "info";

export type PuzzleEdge = Readonly<{
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  actions?: readonly Action[];
  // Label for info edges ("Reports to").
  label?: string;
  // Extra context shown in the inspector.
  note?: string;
  // Vertical edges use the top/bottom handles.
  vertical?: boolean;
}>;

// One edit to one relationship. Each changed edge costs one change.
export type Change = Readonly<{
  removed?: boolean;
  actions?: readonly Action[];
  from?: string;
}>;

export type Changes = Readonly<Record<string, Change>>;

export type ViewEdge = PuzzleEdge & Readonly<{ removed: boolean; changed: boolean }>;

export type Check = Readonly<{
  id: string;
  user: string;
  action: Action;
  resource: string;
  expect: "allow" | "deny";
  // The business reason behind the requirement.
  reason: string;
}>;

export type ExplainOption = Readonly<{ id: string; text: string; correct: boolean; feedback: string }>;

export type Puzzle = Readonly<{
  id: string;
  title: string;
  brief: string;
  objective: string;
  budget: number;
  // Fewest changes that satisfy every check.
  par: number;
  nodes: readonly PuzzleNode[];
  edges: readonly PuzzleEdge[];
  checks: readonly Check[];
  explain: Readonly<{ question: string; options: readonly ExplainOption[] }>;
  takeaway: string;
}>;

export type AccessResult = Readonly<{
  allowed: boolean;
  // Every route that grants the action, as ordered edge ids.
  paths: readonly (readonly string[])[];
  // Membership edges followed from the user, in the order they were found.
  explored: readonly string[];
  // Users and groups the user acts as.
  principals: readonly string[];
}>;

export type CheckResult = Readonly<{
  check: Check;
  before: AccessResult;
  after: AccessResult;
  pass: boolean;
}>;

export type VerifyReport = Readonly<{
  results: readonly CheckResult[];
  changesUsed: number;
  withinBudget: boolean;
  solved: boolean;
}>;

export type PuzzleScore = Readonly<{
  solve: number;
  precision: number;
  predictions: number;
  explanation: number;
  penalty: number;
  total: number;
}>;
