// Need to Know: data classification, one record at a time. Pure rules; no DOM.
// From the Fix-it bench Water Jars: every item poured into the right jar. Here each record goes
// into one of four classification jars, and the jar sets who may see it.

export const LEVELS = [
  { id: "public", name: "Public", rule: "Already published, or meant to be. Harmless if anyone reads it." },
  { id: "internal", name: "Internal", rule: "Staff only. Unhelpful if it leaked, but no real harm to people or the business." },
  { id: "confidential", name: "Confidential", rule: "Named people or teams only. A leak harms customers, staff or the business: personal data, contracts, prices." },
  { id: "restricted", name: "Restricted", rule: "Smallest possible group. A leak causes severe harm or is a breach on its own: credentials, health or card data, inside information." },
] as const;

export type Level = 0 | 1 | 2 | 3;

export type Item = Readonly<{
  id: string;
  title: string; // what the record is
  detail: string; // what is in it, as the learner sees it
  level: Level;
  why: string; // authored reason, shown after the pick
  clue: string; // free hint
}>;

export type Stage = Readonly<{ id: string; title: string; lesson: string; items: readonly Item[] }>;

export type Scenario = Readonly<{ id: string; title: string; org: string; stages: readonly Stage[] }>;

export type Verdict = "exact" | "over" | "under";

export type Pick = Readonly<{ item: string; chose: Level; hinted: boolean; points: number; verdict: Verdict }>;

export type GameState = { scenario: Scenario; index: number; picks: Pick[]; hinted: boolean; phase: "play" | "answered" | "done" };

// Under-classifying is the leak, so it scores nothing. Over-classifying is safe but blocks work:
// one jar too high scores 4, two too high 2, three 0, so "label everything Restricted" never pays.
export const POINTS = { exact: 10, over: 4, under: 0 } as const;

export function pointsFor(item: Item, chose: Level): number {
  const verdict = verdictOf(item, chose);
  return verdict === "over" ? Math.max(0, POINTS.over - 2 * (chose - item.level - 1)) : POINTS[verdict];
}

export function allItems(scenario: Scenario): Item[] {
  return scenario.stages.flatMap((stage) => stage.items);
}

export function stageOf(scenario: Scenario, itemId: string): Stage {
  return scenario.stages.find((stage) => stage.items.some((item) => item.id === itemId))!;
}

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, picks: [], hinted: false, phase: "play" };
}

export function currentItem(state: GameState): Item {
  return allItems(state.scenario)[state.index];
}

export function verdictOf(item: Item, chose: Level): Verdict {
  return chose === item.level ? "exact" : chose > item.level ? "over" : "under";
}

export function feedbackFor(item: Item, chose: Level): string {
  const want = LEVELS[item.level].name;
  const got = LEVELS[chose].name;
  switch (verdictOf(item, chose)) {
    case "exact":
      return item.why;
    case "under":
      return `${got} is too low: handled that way it reaches people who must not see it. It is ${want}. ${item.why}`;
    case "over":
      return `${got} is safe but too high: people who need it can't get it, and they will work round the label. It is ${want}. ${item.why}`;
  }
}

export function choose(state: GameState, chose: Level): Pick | null {
  if (state.phase !== "play" || ![0, 1, 2, 3].includes(chose)) return null;
  const item = currentItem(state);
  const verdict = verdictOf(item, chose);
  const pick: Pick = { item: item.id, chose, hinted: state.hinted, points: pointsFor(item, chose), verdict };
  state.picks.push(pick);
  state.phase = "answered";
  return pick;
}

export function takeHint(state: GameState): string {
  if (state.phase === "play") state.hinted = true;
  return currentItem(state).clue;
}

export function next(state: GameState): void {
  if (state.phase !== "answered") return;
  state.hinted = false;
  if (state.index + 1 >= allItems(state.scenario).length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.phase = "play";
}

export type Summary = Readonly<{
  total: number;
  max: number;
  exact: number;
  over: number;
  under: number;
  hints: number;
  byStage: readonly { title: string; points: number; max: number }[];
}>;

export function summarize(state: GameState): Summary {
  const picks = state.picks;
  const count = (verdict: Verdict) => picks.filter((pick) => pick.verdict === verdict).length;
  return {
    total: picks.reduce((sum, pick) => sum + pick.points, 0),
    max: allItems(state.scenario).length * POINTS.exact,
    exact: count("exact"),
    over: count("over"),
    under: count("under"),
    hints: picks.filter((pick) => pick.hinted).length,
    byStage: state.scenario.stages.map((stage) => {
      const own = picks.filter((pick) => stage.items.some((item) => item.id === pick.item));
      return { title: stage.title, points: own.reduce((sum, pick) => sum + pick.points, 0), max: stage.items.length * POINTS.exact };
    }),
  };
}
