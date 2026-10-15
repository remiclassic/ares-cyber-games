import type { ScoreBreakdown } from "../sim/types";
import { COURSE_CONTEXT } from "./course";

// Proposed integration contract with the Ares course shell. NOT yet agreed with
// the Ares platform team — see docs/INTEGRATION.md. When embedded in an iframe
// we post messages to the parent; standalone, a mock host records to
// localStorage and drives the mock course screen.

export type LearnerStatement = Readonly<{
  at: string;
  verb: "started" | "inspected" | "assessed" | "configured" | "launched" | "answered" | "completed" | "retried";
  object: string;
  result?: Record<string, unknown>;
}>;

export type PracticeResult = Readonly<{
  activityId: string;
  completed: true;
  completedAt: string;
  durationSeconds: number;
  seed: string;
  // Game performance — separate from learning evidence by design.
  score: ScoreBreakdown;
  setbacks: number;
  learningEvidence: Readonly<{
    checkpoints: Record<string, { answer: string; correct: boolean }>;
    finalChallenge: { answer: string; correct: boolean } | null;
  }>;
  decisions: readonly string[];
}>;

export type NavigationTarget = "study" | "mission";

export interface AresHost {
  started(seed: string): void;
  record(statement: Omit<LearnerStatement, "at">): void;
  complete(result: PracticeResult): void;
  navigate(target: NavigationTarget): void;
}

type Listener = (target: NavigationTarget) => void;

export function createHost(onNavigate: Listener): AresHost {
  const embedded = window.parent !== window;
  const post = (type: string, payload: unknown) => {
    if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: COURSE_CONTEXT.activityId, payload }, "*");
  };
  const statements: LearnerStatement[] = [];
  return {
    started(seed) {
      statements.length = 0;
      post("started", { seed });
    },
    record(statement) {
      const full = { ...statement, at: new Date().toISOString() };
      statements.push(full);
      post("statement", full);
    },
    complete(result) {
      post("completed", result);
      try {
        localStorage.setItem("ares-nd:lastResult", JSON.stringify({ result, statements }));
      } catch {
        // Storage can be unavailable (private mode); completion still posts.
      }
    },
    navigate(target) {
      post("navigate", { target });
      if (!embedded) onNavigate(target);
    },
  };
}

export function readLastResult(): PracticeResult | null {
  try {
    const raw = localStorage.getItem("ares-nd:lastResult");
    return raw ? (JSON.parse(raw).result as PracticeResult) : null;
  } catch {
    return null;
  }
}
