import type { DecisionRecord, Outcome, Score, Variant } from "./sim/types";

// Same proposed contract as the Network Defense practice (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-soc-dashboard-challenge/a-strange-login/v0.1";
const RESULT_KEY = "ares-soc:lastResult";

export type CaseStatement = Readonly<{
  at: string;
  verb: "started" | "requested" | "decided" | "rewound" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type CaseResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  seed: string;
  mode: "practice" | "challenge";
  variant: Variant;
  rewinds: number;
  // Game performance.
  score: Score;
  outcome: Outcome;
  // Learning evidence: each action with its reason, citations and what was known.
  decisions: readonly DecisionRecord[];
}>;

export interface CaseHost {
  started(seed: string): void;
  record(statement: Omit<CaseStatement, "at">): void;
  complete(result: CaseResult): void;
}

export function createCaseHost(): CaseHost {
  const embedded = window.parent !== window;
  const post = (type: string, payload: unknown) => {
    if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
  };
  return {
    started(seed) {
      post("started", { seed });
    },
    record(statement) {
      post("statement", { ...statement, at: new Date().toISOString() });
    },
    complete(result) {
      post("completed", result);
      try {
        localStorage.setItem(RESULT_KEY, JSON.stringify(result));
      } catch {
        // Storage can be unavailable (private mode); completion still posts.
      }
    },
  };
}

export function readLastCaseResult(): CaseResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as CaseResult) : null;
  } catch {
    return null;
  }
}
