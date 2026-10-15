import type { CheckpointRecord, NavigationReport, Summary } from "./sim/types";

// Same proposed contract as the other practices (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-cloud-command/first-orbit/v0.1";
const RESULT_KEY = "ares-cc:lastResult";

export type CloudStatement = Readonly<{
  at: string;
  verb: "started" | "collected" | "inspected" | "applied" | "revised" | "continued" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type CloudResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  // Learning decisions. `rating` reports a failed security objective whatever the score.
  score: Summary;
  // Navigation is reported on its own and is not part of `score`.
  navigation: NavigationReport;
  // Learning evidence: every attempt, its justification, estimate and outcome.
  checkpoints: readonly CheckpointRecord[];
}>;

export interface CloudHost {
  started(): void;
  record(statement: Omit<CloudStatement, "at">): void;
  complete(result: CloudResult): void;
}

export function createCloudHost(): CloudHost {
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
