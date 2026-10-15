import type { PuzzleScore } from "./sim/types";

// Same proposed contract as the Network Defense practice (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-privilege-path-puzzle/who-can-read-payroll/v0.1";
const RESULT_KEY = "ares-ppp:lastResult";

export type PuzzleStatement = Readonly<{
  at: string;
  verb: "started" | "inspected" | "tested" | "changed" | "verified" | "answered" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type PuzzleOutcome = Readonly<{
  puzzleId: string;
  // Game performance.
  score: PuzzleScore;
  changesUsed: number;
  failedVerifies: number;
  // Learning evidence: predictions and the explanation.
  predictions: Readonly<Record<string, boolean>>;
  explanation: Readonly<{ answer: string; correct: boolean }>;
}>;

export type PuzzleResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  total: number;
  puzzles: readonly PuzzleOutcome[];
}>;

export interface PuzzleHost {
  started(): void;
  record(statement: Omit<PuzzleStatement, "at">): void;
  complete(result: PuzzleResult): void;
}

export function createPuzzleHost(): PuzzleHost {
  const embedded = window.parent !== window;
  const post = (type: string, payload: unknown) => {
    if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
  };
  return {
    started() {
      post("started", {});
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
