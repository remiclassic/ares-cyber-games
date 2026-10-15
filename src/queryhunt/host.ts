import type { Mode, Score, VariantId } from "./sim/types";

// Same proposed contract as the other practices (docs/INTEGRATION.md):
// post to the parent when embedded, keep the last result locally when standalone.

export const ACTIVITY_ID = "ares-query-hunt/unusual-access/v0.1";
const RESULT_KEY = "ares-queryhunt:lastResult";

export type HuntStatement = Readonly<{
  at: string;
  verb: "started" | "queried" | "pinned" | "explained" | "concluded" | "hinted" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type HuntResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  variant: VariantId;
  // Game performance. Hints are reported separately and never deducted.
  score: Score;
  // Learning evidence: the query that solved each challenge and the missteps on the way.
  challenges: readonly Readonly<{ id: string; sql: string | null; mode: Mode | null; runs: number; sqlErrors: number; mismatches: number; wrongPins: string[]; wrongExplanations: string[]; hints: number }>[];
  conclusion: Readonly<{ chosen: string | null; cited: string[]; wrong: string[]; tries: number }>;
}>;

export interface HuntHost {
  started(variant: VariantId): void;
  record(statement: Omit<HuntStatement, "at">): void;
  complete(result: HuntResult): void;
  navigate(target: "study" | "mission"): void;
}

export function createHuntHost(): HuntHost {
  const embedded = window.parent !== window;
  const post = (type: string, payload: unknown) => {
    if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
  };
  return {
    started(variant) {
      post("started", { seed: variant });
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
    navigate(target) {
      post("navigate", { target });
    },
  };
}
