import type { IncidentRecord, Summary } from "./sim/types";

// Same proposed contract as the other practices (docs/INTEGRATION.md): post to the parent when
// embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-counterplay/three-incidents/v0.1";
const RESULT_KEY = "ares-cp:lastResult";

export type CounterplayStatement = Readonly<{
  at: string;
  verb: "started" | "assessed" | "responded" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type CounterplayResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  seed: string;
  attempt: number;
  score: Summary;
  // Learning evidence: whether each technique was named correctly from its telemetry.
  learningEvidence: readonly { incidentId: string; technique: string; named: string; correct: boolean }[];
  incidents: readonly IncidentRecord[];
}>;

export interface CounterplayHost {
  started(seed: string): void;
  record(statement: Omit<CounterplayStatement, "at">): void;
  complete(result: CounterplayResult): void;
}

export function createCounterplayHost(): CounterplayHost {
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
