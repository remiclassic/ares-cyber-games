// Spot the Risks: find the security risks in a scene, say what is wrong, and pick the fix.
// Pure rules; no DOM. Decoys look suspicious but are fine, so over-flagging costs points.

export type Item = Readonly<{
  id: string;
  label: string; // neutral name used for screen readers and the list, never the answer
  x: number;
  y: number;
  w: number;
  h: number;
  svg: string; // drawing, in scene coordinates
  risk: boolean;
  issue: readonly string[]; // options; issue[0] is correct (shuffled for display)
  fix: readonly string[]; // options; fix[0] is correct; empty for decoys
  explain: string;
}>;

export type Scene = Readonly<{ id: string; title: string; brief: string; backdrop: string; items: readonly Item[] }>;

export type Scenario = Readonly<{ id: string; title: string; org: string; scenes: readonly Scene[] }>;

export const NOTHING = "Nothing wrong here";

export type Answer = { issue: string | null; fix: string | null };

export type GameState = {
  scenario: Scenario;
  sceneIndex: number;
  answers: Record<string, Answer>;
  phase: "play" | "review" | "done";
  results: SceneScore[];
};

export type SceneScore = Readonly<{
  scene: string;
  found: number;
  risks: number;
  issueRight: number;
  fixRight: number;
  falseAlarms: number;
  total: number;
}>;

export const POINTS = { found: 4, issue: 3, fix: 3, falseAlarm: 5 } as const;

export function createGame(scenario: Scenario): GameState {
  return { scenario, sceneIndex: 0, answers: {}, phase: "play", results: [] };
}

export function currentScene(state: GameState): Scene {
  return state.scenario.scenes[state.sceneIndex];
}

export function item(state: GameState, id: string): Item {
  return currentScene(state).items.find((entry) => entry.id === id)!;
}

// Decoys offer the "nothing wrong" option alongside two plausible worries.
export function issueOptions(entry: Item): string[] {
  return entry.risk ? [...entry.issue, NOTHING] : [NOTHING, ...entry.issue];
}

export function answerIssue(state: GameState, id: string, choice: string): void {
  if (state.phase !== "play") return;
  const entry = item(state, id);
  if (!issueOptions(entry).includes(choice)) return;
  state.answers[id] = { issue: choice, fix: null };
}

export function answerFix(state: GameState, id: string, choice: string): void {
  if (state.phase !== "play") return;
  const answer = state.answers[id];
  const entry = item(state, id);
  if (!answer || answer.issue === NOTHING || !entry.fix.includes(choice)) return;
  answer.fix = choice;
}

export function flagged(answer: Answer | undefined): boolean {
  return !!answer?.issue && answer.issue !== NOTHING;
}

export function scoreScene(scene: Scene, answers: Record<string, Answer>): SceneScore {
  const risks = scene.items.filter((entry) => entry.risk);
  const found = risks.filter((entry) => flagged(answers[entry.id]));
  const issueRight = found.filter((entry) => answers[entry.id].issue === entry.issue[0]).length;
  const fixRight = found.filter((entry) => answers[entry.id].fix === entry.fix[0]).length;
  const falseAlarms = scene.items.filter((entry) => !entry.risk && flagged(answers[entry.id])).length;
  const raw = found.length * POINTS.found + issueRight * POINTS.issue + fixRight * POINTS.fix;
  const max = risks.length * (POINTS.found + POINTS.issue + POINTS.fix);
  const total = Math.max(0, Math.round((100 * raw) / max) - falseAlarms * POINTS.falseAlarm);
  return { scene: scene.id, found: found.length, risks: risks.length, issueRight, fixRight, falseAlarms, total };
}

export function finishScene(state: GameState): SceneScore {
  const score = scoreScene(currentScene(state), state.answers);
  state.results.push(score);
  state.phase = "review";
  return score;
}

export function nextScene(state: GameState): void {
  if (state.phase !== "review") return;
  if (state.sceneIndex + 1 >= state.scenario.scenes.length) {
    state.phase = "done";
    return;
  }
  state.sceneIndex += 1;
  state.answers = {};
  state.phase = "play";
}

export function summarize(state: GameState): { total: number; found: number; risks: number; falseAlarms: number } {
  const n = state.results.length || 1;
  return {
    total: Math.round(state.results.reduce((sum, result) => sum + result.total, 0) / n),
    found: state.results.reduce((sum, result) => sum + result.found, 0),
    risks: state.results.reduce((sum, result) => sum + result.risks, 0),
    falseAlarms: state.results.reduce((sum, result) => sum + result.falseAlarms, 0),
  };
}

// Stable shuffle so option order does not give the answer away and stays the same on re-render.
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const pick = h % (index + 1);
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}
