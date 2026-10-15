import type { ShiftScore } from "./sim/scoring";

// Same proposed contract as the other practices (docs/INTEGRATION.md): post to
// the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-cyber-dispatch/first-shift/v0.1";
const RESULT_KEY = "ares-dispatch:lastResult";

export type DispatchResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  shiftId: string;
  // Decision quality only.
  score: ShiftScore;
  badges: readonly string[];
  // Recorded choices, enough to rebuild the shift.
  log: readonly Readonly<{ at: number; caseId: string | null; kind: string; detail: string }>[];
}>;

export interface DispatchHost {
  started(shiftId: string): void;
  record(statement: { verb: string; object: string; detail: string; shiftMinute: number }): void;
  complete(result: DispatchResult): void;
}

export function createDispatchHost(): DispatchHost {
  const embedded = window.parent !== window;
  const post = (type: string, payload: unknown) => {
    if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
  };
  return {
    started(shiftId) {
      post("started", { shiftId });
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
