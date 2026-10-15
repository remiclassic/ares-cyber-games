import type { RoundRecord, Summary } from "./sim/types";

// Same proposed contract as the Network Defense practice (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-incident-triage-race/the-busy-morning/v0.1";
const RESULT_KEY = "ares-itr:lastResult";

export type TriageStatement = Readonly<{
  at: string;
  verb: "started" | "inspected" | "prioritized" | "justified" | "linked" | "submitted" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type TriageResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  // Speed is reported on its own and is not part of `score.quality`.
  durationSeconds: number;
  timed: boolean;
  score: Summary;
  // Learning evidence: every lane, justification, and link per round.
  rounds: readonly RoundRecord[];
}>;

export interface TriageHost {
  started(): void;
  record(statement: Omit<TriageStatement, "at">): void;
  complete(result: TriageResult): void;
}

export function createTriageHost(): TriageHost {
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
