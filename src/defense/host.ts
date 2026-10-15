import type { Summary, WaveRecord } from "./sim/types";

// Same proposed contract as the other practices (docs/INTEGRATION.md): post to the parent when
// embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-defense-in-depth/the-long-week/v0.1";
const RESULT_KEY = "ares-did:lastResult";

export type DefenseStatement = Readonly<{
  at: string;
  verb: "started" | "configured" | "launched" | "answered" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type DefenseResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  seed: string;
  attempt: number;
  score: Summary;
  // Learning evidence: reasoning-check answers are kept apart from the score.
  learningEvidence: readonly { waveId: string; question: string; correct: boolean }[];
  waves: readonly WaveRecord[];
}>;

export interface DefenseHost {
  started(seed: string): void;
  record(statement: Omit<DefenseStatement, "at">): void;
  complete(result: DefenseResult): void;
}

export function createDefenseHost(): DefenseHost {
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
