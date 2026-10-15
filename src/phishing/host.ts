import type { Decision, Summary } from "./sim/types";

// Same proposed contract as the Network Defense practice (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-phishing-speed-drill/the-payroll-request/v0.1";
const RESULT_KEY = "ares-psd:lastResult";

export type DrillStatement = Readonly<{
  at: string;
  verb: "started" | "inspected" | "selected" | "answered" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type DrillResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  seed: string;
  // Game performance.
  score: Summary;
  // Learning evidence: what was chosen and which cues supported it.
  decisions: readonly Decision[];
}>;

export interface DrillHost {
  started(seed: string): void;
  record(statement: Omit<DrillStatement, "at">): void;
  complete(result: DrillResult): void;
}

export function createDrillHost(): DrillHost {
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

export function readLastDrillResult(): DrillResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as DrillResult) : null;
  } catch {
    return null;
  }
}
