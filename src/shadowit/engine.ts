// Shadow IT: walk an office floor, inspect the tools teams are using, and decide per finding:
// Block, Approve (with conditions), Migrate to the sanctioned equivalent, or Leave as is.
// Pure rules; no DOM. Two meters move with every decision: Risk (unmanaged exposure) and
// Productivity (team morale). Blocking tools people need without an alternative drains
// productivity; approving risky tools raises risk. Neither "block everything" nor "approve
// everything" passes.

export type Decision = "block" | "approve" | "migrate" | "leave";

export const DECISIONS: readonly Readonly<{ id: Decision; name: string; key: string; rule: string }>[] = [
  { id: "block", name: "Block", key: "B", rule: "Remove or cut it off. Stops the exposure, but the team loses the tool." },
  { id: "approve", name: "Approve", key: "A", rule: "Sanction it with conditions (for example SSO, a vendor review, an owner)." },
  { id: "migrate", name: "Migrate", key: "M", rule: "Move the work and data to the sanctioned equivalent, then retire this one." },
  { id: "leave", name: "Leave as is", key: "L", rule: "Change nothing. Right for tools that are already sanctioned." },
];

export type Grade = "best" | "ok" | "poor";

// Deltas are applied to the meters; risk up is bad, morale down is bad.
export type Outcome = Readonly<{ risk: number; morale: number; grade: Grade; text: string }>;

export type Evidence = Readonly<{ id: string; label: string; value: string }>;

export type Item = Readonly<{
  id: string;
  label: string; // neutral name shown before inspection; never gives the answer away
  name: string; // what it turns out to be, shown once inspected
  team: string;
  x: number;
  y: number;
  w: number;
  h: number;
  svg: string; // drawing, in scene coordinates (1000 × 600)
  sanctioned: boolean; // true for decoys: tools IT already runs
  evidence: readonly Evidence[];
  key: string; // the evidence id that should drive the decision (learning evidence, not scored)
  approveAs: string; // what "Approve" would mean here (the conditions)
  migrateTo: string; // the sanctioned equivalent, or why there is none
  outcomes: Readonly<Record<Decision, Outcome>>;
  lesson: string; // why the best decision is best, shown in the debrief
}>;

export type Zone = Readonly<{ id: string; name: string; x: number; y: number; w: number; h: number }>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  brief: string;
  start: Readonly<{ risk: number; morale: number }>;
  zones: readonly Zone[];
  backdrop: string;
  guided: string; // id of the guided first finding
  items: readonly Item[];
}>;

export type Phase = "guided" | "play" | "done";

export type GameState = {
  scenario: Scenario;
  inspected: string[]; // in inspection order
  facts: Record<string, string>; // item id -> evidence id the learner picked as the deciding fact
  decisions: Record<string, Decision>;
  order: string[]; // decision order
  phase: Phase;
};

export const POINTS: Readonly<Record<Grade, number>> = { best: 10, ok: 5, poor: 0 };

// Score = 60% decision quality + 20% risk control (100 − risk) + 20% productivity.
export const WEIGHTS = { decisions: 0.6, safety: 0.2, productivity: 0.2 } as const;

// A run passes only with a good score AND both meters inside their limits.
export const THRESHOLDS = { score: 70, maxRisk: 60, minMorale: 40 } as const;

export function createGame(scenario: Scenario): GameState {
  return { scenario, inspected: [], facts: {}, decisions: {}, order: [], phase: "guided" };
}

export function itemById(scenario: Scenario, id: string): Item {
  const found = scenario.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown item ${id}`);
  return found;
}

export function bestDecision(item: Item): Decision {
  return DECISIONS.map((entry) => entry.id).find((id) => item.outcomes[id].grade === "best")!;
}

// During the guided finding only the guided item can be touched.
export function isAvailable(state: GameState, id: string): boolean {
  if (state.phase === "done") return false;
  return state.phase !== "guided" || id === state.scenario.guided;
}

export function isInspected(state: GameState, id: string): boolean {
  return state.inspected.includes(id);
}

export function inspect(state: GameState, id: string): boolean {
  if (!isAvailable(state, id)) return false;
  itemById(state.scenario, id);
  if (!state.inspected.includes(id)) state.inspected.push(id);
  return true;
}

// The learner names the one fact that decides it. Not scored: recorded as learning evidence.
export function pickFact(state: GameState, id: string, factId: string): boolean {
  if (!isAvailable(state, id) || !isInspected(state, id) || state.decisions[id]) return false;
  if (!itemById(state.scenario, id).evidence.some((entry) => entry.id === factId)) return false;
  state.facts[id] = factId;
  return true;
}

export function canDecide(state: GameState, id: string): boolean {
  return isAvailable(state, id) && isInspected(state, id) && !!state.facts[id] && !state.decisions[id];
}

// One decision per item, final: the outcome is shown straight away, so changing it would let a
// learner try every option until one turns green.
export function decide(state: GameState, id: string, decision: Decision): Outcome | null {
  if (!canDecide(state, id)) return null;
  state.decisions[id] = decision;
  state.order.push(id);
  if (state.phase === "guided") state.phase = "play";
  return itemById(state.scenario, id).outcomes[decision];
}

export function finish(state: GameState): void {
  if (state.phase === "play") state.phase = "done";
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

// Meters are a pure function of the decisions so far (and, once done, undecided items left as is).
export function meters(state: GameState): { risk: number; morale: number } {
  let { risk, morale } = state.scenario.start;
  for (const entry of state.scenario.items) {
    const decision = state.decisions[entry.id] ?? (state.phase === "done" ? "leave" : undefined);
    if (!decision) continue;
    risk += entry.outcomes[decision].risk;
    morale += entry.outcomes[decision].morale;
  }
  return { risk: clamp(risk), morale: clamp(morale) };
}

export type Score = Readonly<{
  decisionPct: number;
  safety: number;
  productivity: number;
  total: number;
  risk: number;
  morale: number;
  grades: Readonly<Record<Grade, number>>;
  undecided: number;
  passed: boolean;
  reasons: readonly string[];
}>;

export function score(state: GameState): Score {
  const items = state.scenario.items;
  const grades: Record<Grade, number> = { best: 0, ok: 0, poor: 0 };
  let points = 0;
  let undecided = 0;
  for (const entry of items) {
    const decision = state.decisions[entry.id] ?? "leave";
    if (!state.decisions[entry.id]) undecided += 1;
    const grade = entry.outcomes[decision].grade;
    grades[grade] += 1;
    points += POINTS[grade];
  }
  const done = { ...state, phase: "done" as Phase };
  const { risk, morale } = meters(done);
  const decisionPct = Math.round((100 * points) / (POINTS.best * items.length));
  const safety = 100 - risk;
  const productivity = morale;
  const total = Math.round(WEIGHTS.decisions * decisionPct + WEIGHTS.safety * safety + WEIGHTS.productivity * productivity);
  const reasons: string[] = [];
  if (risk > THRESHOLDS.maxRisk) reasons.push(`Risk ended at ${risk}, above the limit of ${THRESHOLDS.maxRisk}: too much unmanaged exposure is still in place.`);
  if (morale < THRESHOLDS.minMorale) reasons.push(`Productivity ended at ${morale}, below the floor of ${THRESHOLDS.minMorale}: teams lost tools they need and will route around IT.`);
  if (total < THRESHOLDS.score) reasons.push(`Score ${total} is below the pass mark of ${THRESHOLDS.score}.`);
  return { decisionPct, safety, productivity, total, risk, morale, grades, undecided, passed: reasons.length === 0, reasons };
}

// Learning evidence: what the run shows about the skill. Kept apart from the score, never mixed in.
export type Learning = Readonly<{
  inspected: number;
  total: number;
  factsPicked: number;
  factsMatched: number; // deciding fact matched the authored key fact
  sanctionedRecognised: number; // sanctioned tools left as they are
  sanctionedTotal: number;
  blockedWithAlternative: string[]; // blocked a needed tool when a better path existed
  approvedRisky: string[]; // approved something that cannot be made safe by conditions
  unaddressed: string[]; // unsanctioned items left as they are (or never decided)
  disruptedSanctioned: string[]; // blocked or migrated a tool that was already sanctioned
}>;

export function learning(state: GameState): Learning {
  const items = state.scenario.items;
  const decided = items.filter((entry) => state.decisions[entry.id]);
  const decision = (entry: Item) => state.decisions[entry.id] ?? "leave";
  const shadow = items.filter((entry) => !entry.sanctioned);
  const sanctioned = items.filter((entry) => entry.sanctioned);
  return {
    inspected: state.inspected.length,
    total: items.length,
    factsPicked: decided.length,
    factsMatched: decided.filter((entry) => state.facts[entry.id] === entry.key).length,
    sanctionedRecognised: sanctioned.filter((entry) => decision(entry) === "leave").length,
    sanctionedTotal: sanctioned.length,
    blockedWithAlternative: shadow.filter((entry) => decision(entry) === "block" && bestDecision(entry) !== "block").map((entry) => entry.id),
    approvedRisky: shadow.filter((entry) => decision(entry) === "approve" && entry.outcomes.approve.grade === "poor").map((entry) => entry.id),
    unaddressed: shadow.filter((entry) => decision(entry) === "leave").map((entry) => entry.id),
    disruptedSanctioned: sanctioned.filter((entry) => decision(entry) === "block" || decision(entry) === "migrate").map((entry) => entry.id),
  };
}

// Plays a whole run with one rule (used by tests and to check dominant strategies).
export function playAll(scenario: Scenario, choose: (item: Item) => Decision): GameState {
  const state = createGame(scenario);
  const ordered = [itemById(scenario, scenario.guided), ...scenario.items.filter((entry) => entry.id !== scenario.guided)];
  for (const entry of ordered) {
    inspect(state, entry.id);
    pickFact(state, entry.id, entry.evidence[0].id);
    decide(state, entry.id, choose(entry));
  }
  finish(state);
  return state;
}
