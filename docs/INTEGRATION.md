# Ares integration contract (proposal)

**Status:** draft, not agreed with the Ares platform team. Implemented in `src/integration/host.ts`.

The practice is a static bundle (`npm run build` → `dist/`) and can be served under any path (`base: "./"`). The course shell embeds it in an iframe inside the Study Material section.

## Messages from the practice → course shell (`window.parent.postMessage`)

Every message has this shape: `{ type, activityId, payload }`. `activityId` currently has the value `ares-network-defense/keep-finance-online/v0.1`.

| `type` | When | `payload` |
|---|---|---|
| `ares:practice:started` | A run starts (including retries) | `{ seed }` |
| `ares:practice:statement` | Each meaningful learner action | `{ at, verb, object, result }`, where verb ∈ started, inspected, assessed, configured, launched, answered, completed, retried |
| `ares:practice:completed` | Debrief reached | `PracticeResult` (below) |
| `ares:practice:navigate` | Learner picks *Review study material* or *Continue to mission* | `{ target: "study" \| "mission" }` |

```ts
type PracticeResult = {
  activityId: string;
  completed: true;
  completedAt: string;        // ISO time
  durationSeconds: number;
  seed: string;               // reproduces the run with the command log
  score: { service, security, efficiency, total, legitDelivered, legitTotal, prohibitedBlocked, prohibitedTotal };
  setbacks: number;
  learningEvidence: {
    checkpoints: Record<"rule-reason" | "backup-reason", { answer: string; correct: boolean }>;
    finalChallenge: { answer: string; correct: boolean } | null;
  };
  decisions: string[];        // human-readable key decisions
};
```

Completion means the learner reached the debrief. Mastery is **not** derived from the score. The shell decides what to do with `learningEvidence` once SMEs agree on criteria.

## Standalone mode

When not embedded, the mock host saves the last result to `localStorage` (`ares-nd:lastResult`) and shows mock course and mission screens.

## Open questions for the platform team

1. Should the course context (module title, objectives, mission connections) come from the shell? (Proposed: an `ares:practice:init` message before start.) Today it is hard-coded in `src/integration/course.ts`.
2. Statement format: keep this lightweight shape, or map to xAPI?
3. `postMessage` target origin: currently `"*"`. It should be pinned to the Ares origin.
4. Are retries reported as separate attempts or folded into one?
