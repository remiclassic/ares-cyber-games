// Clean Desk: it is 17:25, visitors are coming (cleaners tonight, a client tour tomorrow) and you
// have a few minutes per room to secure it before you leave. Inspect objects, then choose what to
// DO with each one. Pure rules; no DOM.
//
// The clock is action-based: every action costs a fixed number of minutes and a room has a fixed
// budget, so the game is fair and testable. Looking is free; acting is not. Decoys cost nothing if
// left alone and waste minutes if handled, so "action everything" runs out of time. Some actions
// destroy things that must be kept (a signed contract, a colleague's notebook), so "shred
// everything" loses. Plugging in an unknown USB stick "to check it" is the worst choice in the game.

export type Action = "lock" | "off" | "drawer" | "shred" | "wipe" | "collect" | "handin" | "report" | "plug" | "leave";

export const ACTIONS: Readonly<Record<Action, Readonly<{ name: string; past: string; minutes: number }>>> = {
  lock: { name: "Lock the screen", past: "Locked the screen", minutes: 1 },
  off: { name: "Switch the monitor off", past: "Switched the monitor off", minutes: 1 },
  drawer: { name: "Lock it in a drawer", past: "Locked it away", minutes: 2 },
  shred: { name: "Shred it", past: "Shredded it", minutes: 2 },
  wipe: { name: "Wipe the whiteboard", past: "Wiped it", minutes: 2 },
  collect: { name: "Collect it for the owner", past: "Collected it for the owner", minutes: 2 },
  handin: { name: "Hand it to reception / security", past: "Handed it in", minutes: 3 },
  report: { name: "Remove it and report it", past: "Removed and reported it", minutes: 3 },
  plug: { name: "Plug it in to check it", past: "Plugged it in", minutes: 2 },
  leave: { name: "Leave it", past: "Left it", minutes: 0 },
};

// best    the proportionate action (for a harmless object: leaving it)
// ok      the exposure is gone, but the action is heavier than needed or leaves a loose end
// waste   minutes spent on something that was never a risk
// harm    made things worse: destroyed something that must be kept, or ran unknown media
// exposed still there for the visitors to see (left, or "fixed" in a way that does not fix it)
export type Grade = "best" | "ok" | "waste" | "harm" | "exposed";

export type Option = Readonly<{ action: Action; grade: Grade; text: string; harm?: number }>;

export type Item = Readonly<{
  id: string;
  label: string; // neutral name shown before inspection; never gives the answer away
  name: string; // what it turns out to be, shown once inspected
  detail: string; // what you see when you look closely
  hint: string; // what to weigh; only shown in the guided room
  x: number;
  y: number;
  w: number;
  h: number;
  svg: string; // drawing, in scene coordinates (1000 × 600)
  severity: 0 | 1 | 2 | 3; // 0 = harmless decoy, 3 = critical
  witness: string; // who comes past it, and when
  options: readonly Option[]; // always includes "leave"
  reason: string; // why the best action is best, replayed in the debrief
}>;

export type Scene = Readonly<{
  id: string;
  title: string;
  brief: string;
  start: number; // minutes since midnight when you walk in
  budget: number; // minutes you can spend here
  hints: boolean; // per-object hints (guided room only)
  feedback: boolean; // explain each action straight away (off in the final room)
  guided?: string; // id of the guided first object
  backdrop: string;
  items: readonly Item[];
}>;

export type Scenario = Readonly<{ id: string; title: string; org: string; brief: string; scenes: readonly Scene[] }>;

export type Phase = "play" | "night" | "done";

export type GameState = {
  scenario: Scenario;
  sceneIndex: number;
  phase: Phase;
  spent: number[]; // minutes spent per scene
  inspected: string[];
  choices: Record<string, Action>;
};

export const WEIGHTS = { secured: 0.6, proportion: 0.25, care: 0.15 } as const;
export const OK_FACTOR = 0.6;
export const HARM_COST = 50;
export const PASS_SCORE = 75;

export function createGame(scenario: Scenario): GameState {
  return { scenario, sceneIndex: 0, phase: "play", spent: scenario.scenes.map(() => 0), inspected: [], choices: {} };
}

export function currentScene(state: GameState): Scene {
  return state.scenario.scenes[state.sceneIndex];
}

export function allItems(scenario: Scenario): Item[] {
  return scenario.scenes.flatMap((scene) => scene.items);
}

export function itemById(scenario: Scenario, id: string): Item {
  const item = allItems(scenario).find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item;
}

export function optionFor(item: Item, action: Action): Option | undefined {
  return item.options.find((option) => option.action === action);
}

export function bestAction(item: Item): Action {
  return item.options.find((option) => option.grade === "best")!.action;
}

export function bestCost(scene: Scene): number {
  return scene.items.reduce((sum, item) => sum + ACTIONS[bestAction(item)].minutes, 0);
}

export function minutesLeft(state: GameState): number {
  return currentScene(state).budget - state.spent[state.sceneIndex];
}

export function clockNow(state: GameState): number {
  return currentScene(state).start + state.spent[state.sceneIndex];
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function inScene(state: GameState, id: string): boolean {
  return currentScene(state).items.some((item) => item.id === id);
}

// True while the guided first object of a room still has to be dealt with.
export function guidedPending(state: GameState): boolean {
  const guided = currentScene(state).guided;
  return state.phase === "play" && !!guided && !state.choices[guided];
}

export function isAvailable(state: GameState, id: string): boolean {
  if (state.phase !== "play" || !inScene(state, id)) return false;
  return !guidedPending(state) || id === currentScene(state).guided;
}

export function isInspected(state: GameState, id: string): boolean {
  return state.inspected.includes(id);
}

// Looking is free.
export function inspect(state: GameState, id: string): boolean {
  if (!isAvailable(state, id)) return false;
  if (!state.inspected.includes(id)) state.inspected.push(id);
  return true;
}

export function canAct(state: GameState, id: string, action: Action): boolean {
  if (!isAvailable(state, id) || !isInspected(state, id) || state.choices[id]) return false;
  const option = optionFor(itemById(state.scenario, id), action);
  return !!option && ACTIONS[action].minutes <= minutesLeft(state);
}

// Final: the minutes are spent. Returns the outcome, or null if the action is not possible.
export function act(state: GameState, id: string, action: Action): Option | null {
  if (!canAct(state, id, action)) return null;
  state.choices[id] = action;
  state.spent[state.sceneIndex] += ACTIONS[action].minutes;
  return optionFor(itemById(state.scenario, id), action)!;
}

// Walk out. Anything not dealt with stays exactly as it is. The night then plays out.
export function leaveRoom(state: GameState): boolean {
  if (state.phase !== "play" || guidedPending(state)) return false;
  state.phase = "night";
  return true;
}

export function nextScene(state: GameState): boolean {
  if (state.phase !== "night") return false;
  if (state.sceneIndex + 1 < state.scenario.scenes.length) {
    state.sceneIndex += 1;
    state.phase = "play";
  } else state.phase = "done";
  return true;
}

export type Row = Readonly<{ item: Item; action: Action; option: Option; decided: boolean; minutes: number }>;

export function rowFor(state: GameState, item: Item): Row {
  const chosen = state.choices[item.id];
  const action = chosen ?? "leave";
  return { item, action, option: optionFor(item, action)!, decided: !!chosen, minutes: ACTIONS[action].minutes };
}

const NIGHT_ORDER: readonly Grade[] = ["exposed", "harm", "ok", "waste", "best"];

// What the visitors found, worst first.
export function nightReport(state: GameState, sceneIndex = state.sceneIndex): Row[] {
  return state.scenario.scenes[sceneIndex].items
    .map((item) => rowFor(state, item))
    .sort((a, b) => NIGHT_ORDER.indexOf(a.option.grade) - NIGHT_ORDER.indexOf(b.option.grade));
}

export type Score = Readonly<{
  secured: number; // 0–100, severity-weighted share of sensitive objects no longer exposed
  proportion: number; // 0–100, share of all objects that got the proportionate choice
  care: number; // 0–100, drops with every harmful action
  total: number;
  grades: Readonly<Record<Grade, number>>;
  harms: number;
  criticalExposed: number;
  minutesUsed: number;
  minutesBudget: number;
  passed: boolean;
  reasons: readonly string[];
}>;

// The game score. Only what was done to the objects counts; see learning() for the evidence.
export function score(state: GameState): Score {
  const rows = allItems(state.scenario).map((item) => rowFor(state, item));
  const grades: Record<Grade, number> = { best: 0, ok: 0, waste: 0, harm: 0, exposed: 0 };
  let weight = 0;
  let safe = 0;
  let harms = 0;
  let criticalExposed = 0;
  for (const { item, option } of rows) {
    grades[option.grade] += 1;
    weight += item.severity;
    if (item.severity > 0) safe += item.severity * (option.grade === "best" ? 1 : option.grade === "ok" ? OK_FACTOR : 0);
    if (option.grade === "harm") harms += option.harm ?? 1;
    if (item.severity === 3 && option.grade !== "best" && option.grade !== "ok") criticalExposed += 1;
  }
  const secured = Math.round((100 * safe) / weight);
  const proportion = Math.round((100 * grades.best) / rows.length);
  const care = Math.max(0, 100 - HARM_COST * harms);
  const total = Math.round(WEIGHTS.secured * secured + WEIGHTS.proportion * proportion + WEIGHTS.care * care);
  const reasons: string[] = [];
  if (criticalExposed) reasons.push(`${criticalExposed} critical exposure${criticalExposed === 1 ? " was" : "s were"} still there when the visitors came.`);
  if (harms) reasons.push("An action made things worse: something that had to be kept was destroyed, or unknown media was run.");
  if (total < PASS_SCORE) reasons.push(`Score below ${PASS_SCORE}.`);
  return {
    secured,
    proportion,
    care,
    total,
    grades,
    harms,
    criticalExposed,
    minutesUsed: state.spent.reduce((sum, value) => sum + value, 0),
    minutesBudget: state.scenario.scenes.reduce((sum, scene) => sum + scene.budget, 0),
    passed: reasons.length === 0,
    reasons,
  };
}

export type Learning = Readonly<{
  inspected: number;
  total: number;
  criticalHandled: number;
  criticalTotal: number;
  decoysLeft: number;
  decoyTotal: number;
  proportionate: number; // sensitive objects acted on with the best action
  actedSensitive: number; // sensitive objects acted on at all
  finalSecured: number; // in the unaided final room
  finalTotal: number;
  minutesWasted: number; // spent on harmless objects, on fixes that fix nothing, or on harmful actions
  exposed: readonly string[];
  destroyed: readonly string[];
  overHandled: readonly string[];
  falseFixes: readonly string[];
  pluggedUnknownMedia: boolean;
}>;

// Learning evidence, reported next to the score and never added to it.
export function learning(state: GameState): Learning {
  const items = allItems(state.scenario);
  const rows = items.map((item) => rowFor(state, item));
  const sensitive = rows.filter((row) => row.item.severity > 0);
  const decoys = rows.filter((row) => row.item.severity === 0);
  const critical = sensitive.filter((row) => row.item.severity === 3);
  const safe = (row: Row) => row.option.grade === "best" || row.option.grade === "ok";
  const final = state.scenario.scenes[state.scenario.scenes.length - 1].items.filter((item) => item.severity > 0).map((item) => rowFor(state, item));
  const ids = (list: Row[]) => list.map((row) => row.item.id);
  return {
    inspected: items.filter((item) => state.inspected.includes(item.id)).length,
    total: items.length,
    criticalHandled: critical.filter(safe).length,
    criticalTotal: critical.length,
    decoysLeft: decoys.filter((row) => row.action === "leave").length,
    decoyTotal: decoys.length,
    proportionate: sensitive.filter((row) => row.option.grade === "best").length,
    actedSensitive: sensitive.filter((row) => row.action !== "leave").length,
    finalSecured: final.filter(safe).length,
    finalTotal: final.length,
    minutesWasted: rows.filter((row) => ["waste", "harm", "exposed"].includes(row.option.grade)).reduce((sum, row) => sum + row.minutes, 0),
    exposed: ids(sensitive.filter((row) => row.option.grade === "exposed")),
    destroyed: ids(rows.filter((row) => row.option.grade === "harm" && row.action !== "plug")),
    overHandled: ids(decoys.filter((row) => row.action !== "leave")),
    falseFixes: ids(sensitive.filter((row) => row.option.grade === "exposed" && row.action !== "leave")),
    pluggedUnknownMedia: rows.some((row) => row.action === "plug"),
  };
}

// Plays a whole game with one policy (used by the tests to prove that shortcuts lose). In each room
// the guided object goes first, then the objects in the order given by `order`. An action the clock
// cannot pay for is skipped, exactly as in play.
export function playAll(
  scenario: Scenario,
  choose: (item: Item, scene: Scene) => Action | null,
  order: (items: readonly Item[]) => readonly Item[] = (items) => items,
): GameState {
  const state = createGame(scenario);
  while (state.phase !== "done") {
    const scene = currentScene(state);
    const guided = scene.items.filter((item) => item.id === scene.guided);
    const rest = order(scene.items.filter((item) => item.id !== scene.guided));
    for (const item of [...guided, ...rest]) {
      // A policy with nothing to do to the guided object still has to deal with it: it leaves it.
      const action = choose(item, scene) ?? (item.id === scene.guided ? "leave" : null);
      if (!action) continue;
      inspect(state, item.id);
      act(state, item.id, action);
    }
    leaveRoom(state);
    nextScene(state);
  }
  return state;
}
