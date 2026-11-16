// Incident Comms: the communications lead's desk during a confirmed breach. Pure rules; no DOM.
// The incident runs in turns over 72 in-game hours. Each turn the facts change, people ask for
// answers, and the player has a few actions: who to answer now, and with which draft. Messages set
// flags; authored consequences read those flags at later turns (a contradiction, a retraction, a
// missed deadline, a leak). The score is a list of outcomes; learning evidence is kept separate.

export type Meter = "customers" | "staff" | "regulator";
export const METERS: readonly Meter[] = ["customers", "staff", "regulator"];
export const METER_LABELS: Readonly<Record<Meter, string>> = { customers: "Customers", staff: "Staff", regulator: "Regulator" };
export const TRUST_START = 50;

export type Audience = "ceo" | "legal" | "it" | "regulator" | "customers" | "staff" | "press" | "insurer" | "police" | "supplier";

export const AUDIENCE_LABELS: Readonly<Record<Audience, string>> = {
  ceo: "Leadership",
  legal: "Legal counsel",
  it: "IT team",
  regulator: "Regulator",
  customers: "Customers",
  staff: "Staff",
  press: "Journalist",
  insurer: "Cyber insurer",
  police: "Law enforcement",
  supplier: "Supplier / partner",
};

// How a draft speaks. Only "measured" says what is confirmed, what is not, and what happens next.
export type Style = "measured" | "reassure" | "blame" | "dump" | "stall";

export const STYLE_LABELS: Readonly<Record<Style, string>> = {
  measured: "Confirmed facts, next step",
  reassure: "Over-reassuring",
  blame: "Blames a person",
  dump: "Too much, too soon",
  stall: "Stalls or deflects",
};

export type Cond = Readonly<{ all?: readonly string[]; any?: readonly string[]; none?: readonly string[] }>;
export type TrustDelta = Readonly<Partial<Record<Meter, number>>>;

export type Draft = Readonly<{
  id: string;
  label: string;
  text: string;
  style: Style;
  sets?: readonly string[];
  // Flags that must already be held at the start of the turn (set in an earlier turn). If any is
  // missing, `elseSets` is added: e.g. a notice that counsel never saw.
  needs?: readonly string[];
  elseSets?: readonly string[];
  needsNote?: Readonly<{ met: string; unmet: string }>;
  trust?: TrustDelta;
  reaction: string; // what the player sees straight away, in the fiction; never a verdict
  why: string; // debrief explanation
}>;

export type Ask = Readonly<{
  id: string;
  audience: Audience;
  from: string;
  ask: string;
  showIf?: Cond;
  drafts: readonly Draft[];
}>;

export type FactStatus = "confirmed" | "suspected" | "unknown";
export type Fact = Readonly<{ status: FactStatus; text: string; fresh?: boolean; showIf?: Cond }>;

export type Turn = Readonly<{ hour: number; clock: string; headline: string; facts: readonly Fact[]; asks: readonly Ask[] }>;

export type Tone = "bad" | "warn" | "good";

// Checked at the start of every turn index >= `from` (the epilogue is index `turns.length`).
// Fires once, the first time its condition holds.
export type Consequence = Readonly<{
  id: string;
  from: number;
  when: Cond;
  tone: Tone;
  title: string;
  text: string;
  trust?: TrustDelta;
  sets?: readonly string[];
}>;

export type Skill = "confirmed" | "sequence" | "deadline" | "channel" | "story";

export const SKILL_LABELS: Readonly<Record<Skill, string>> = {
  confirmed: "Says only what is confirmed, and says what is not yet known",
  sequence: "Tells the right people in the right order",
  deadline: "Meets notification obligations on time",
  channel: "Keeps the response plan off a compromised channel",
  story: "Keeps leadership and the organisation on one story",
};

export type Objective = Readonly<{
  id: string;
  label: string;
  points: number;
  skill?: Skill;
  when?: Cond;
  trust?: Readonly<{ meter: Meter; min: number }>;
  missed: string; // one line shown when it is not met
}>;

export type Incident = Readonly<{
  id: string;
  title: string;
  org: string;
  kind: string;
  brief: string;
  deadlineHour: number;
  deadlineRule: string;
  deadlineClock: string;
  channelNote: string;
  actions: number;
  guided?: boolean; // the opening turn is coached
  guideText?: string;
  turns: readonly Turn[];
  consequences: readonly Consequence[];
  objectives: readonly Objective[];
  plan: readonly Readonly<Record<string, string>>[]; // one best line of play, per turn: ask id -> draft id
}>;

export type Sent = { turn: number; hour: number; askId: string; audience: Audience; from: string; draftId: string; style: Style; flags: string[]; unmet: boolean };
export type Fired = { id: string; turn: number; hour: number; tone: Tone; title: string; text: string; because: string[]; trust: TrustDelta };
export type Run = { incident: string; flags: string[]; trust: Record<Meter, number>; sent: Sent[]; fired: Fired[]; complete: boolean };
export type TurnReport = { hour: number; sent: Sent[]; events: Fired[]; trustBefore: Record<Meter, number> };

export type GameState = {
  incidents: readonly Incident[];
  index: number;
  turn: number;
  phase: "compose" | "epilogue" | "done";
  selection: Record<string, string>;
  runs: Run[];
  lastReport: TurnReport | null;
};

export const PASS_RATIO = 0.7; // of all points
export const PASS_EACH = 0.6; // and of each incident: one good incident cannot carry a bad one
export const TRUST_PASS = 65;

function newRun(incident: Incident): Run {
  return { incident: incident.id, flags: [], trust: { customers: TRUST_START, staff: TRUST_START, regulator: TRUST_START }, sent: [], fired: [], complete: false };
}

export function createGame(incidents: readonly Incident[]): GameState {
  const state: GameState = { incidents, index: 0, turn: 0, phase: "compose", selection: {}, runs: [newRun(incidents[0])], lastReport: null };
  fire(state.incidents[0], state.runs[0], 0);
  return state;
}

export function holds(flags: readonly string[], cond: Cond | undefined): boolean {
  if (!cond) return true;
  if (cond.all && !cond.all.every((flag) => flags.includes(flag))) return false;
  if (cond.any && !cond.any.some((flag) => flags.includes(flag))) return false;
  if (cond.none && cond.none.some((flag) => flags.includes(flag))) return false;
  return true;
}

export const currentIncident = (state: GameState): Incident => state.incidents[state.index];
export const currentRun = (state: GameState): Run => state.runs[state.index];
export const currentTurn = (state: GameState): Turn => currentIncident(state).turns[Math.min(state.turn, currentIncident(state).turns.length - 1)];
export const isGuided = (state: GameState): boolean => state.phase === "compose" && !!currentIncident(state).guided && state.turn === 0;

export function visibleAsks(state: GameState): Ask[] {
  if (state.phase !== "compose") return [];
  const flags = currentRun(state).flags;
  return currentTurn(state).asks.filter((ask) => holds(flags, ask.showIf));
}

export function visibleFacts(state: GameState): Fact[] {
  const flags = currentRun(state).flags;
  return currentTurn(state).facts.filter((fact) => holds(flags, fact.showIf));
}

export function actionsLeft(state: GameState): number {
  return currentIncident(state).actions - Object.keys(state.selection).length;
}

export function needsMet(state: GameState, draft: Draft): boolean {
  return !draft.needs || draft.needs.every((flag) => currentRun(state).flags.includes(flag));
}

// Choose a draft for one ask this turn, or pass null to hold (say nothing to them this turn).
export function select(state: GameState, askId: string, draftId: string | null): boolean {
  if (state.phase !== "compose") return false;
  const ask = visibleAsks(state).find((entry) => entry.id === askId);
  if (!ask) return false;
  if (draftId === null) {
    delete state.selection[askId];
    return true;
  }
  if (!ask.drafts.some((draft) => draft.id === draftId)) return false;
  if (!(askId in state.selection) && actionsLeft(state) <= 0) return false;
  state.selection[askId] = draftId;
  return true;
}

function applyTrust(run: Run, delta: TrustDelta | undefined): void {
  if (!delta) return;
  for (const meter of METERS) run.trust[meter] = Math.max(0, Math.min(100, run.trust[meter] + (delta[meter] ?? 0)));
}

function addFlags(run: Run, flags: readonly string[] | undefined): void {
  for (const flag of flags ?? []) if (!run.flags.includes(flag)) run.flags.push(flag);
}

export function hourOf(incident: Incident, turnIndex: number): number {
  return turnIndex < incident.turns.length ? incident.turns[turnIndex].hour : incident.deadlineHour;
}

function fire(incident: Incident, run: Run, turnIndex: number): Fired[] {
  const events: Fired[] = [];
  for (const consequence of incident.consequences) {
    if (consequence.from > turnIndex || run.fired.some((event) => event.id === consequence.id)) continue;
    if (!holds(run.flags, consequence.when)) continue;
    const because = [...(consequence.when.all ?? []), ...(consequence.when.any ?? [])].filter((flag) => run.flags.includes(flag));
    const event: Fired = { id: consequence.id, turn: turnIndex, hour: hourOf(incident, turnIndex), tone: consequence.tone, title: consequence.title, text: consequence.text, because, trust: consequence.trust ?? {} };
    applyTrust(run, consequence.trust);
    addFlags(run, consequence.sets);
    run.fired.push(event);
    events.push(event);
  }
  return events;
}

// Send this turn's chosen messages, move the clock on, and let earlier choices land.
export function sendTurn(state: GameState): TurnReport | null {
  if (state.phase !== "compose") return null;
  const incident = currentIncident(state);
  const run = currentRun(state);
  const turn = currentTurn(state);
  const before = [...run.flags];
  const trustBefore = { ...run.trust };
  const sent: Sent[] = [];
  for (const ask of visibleAsks(state)) {
    const draft = ask.drafts.find((entry) => entry.id === state.selection[ask.id]);
    if (!draft) continue;
    const unmet = !!draft.needs && !draft.needs.every((flag) => before.includes(flag));
    const flags = [`told:${ask.audience}`, `sent:${ask.id}:${draft.id}`, ...(draft.sets ?? []), ...(unmet ? (draft.elseSets ?? []) : [])];
    sent.push({ turn: state.turn, hour: turn.hour, askId: ask.id, audience: ask.audience, from: ask.from, draftId: draft.id, style: draft.style, flags, unmet });
    applyTrust(run, draft.trust);
  }
  for (const message of sent) addFlags(run, message.flags);
  run.sent.push(...sent);
  state.selection = {};
  state.turn += 1;
  const events = fire(incident, run, state.turn);
  if (state.turn >= incident.turns.length) {
    state.phase = "epilogue";
    run.complete = true;
  }
  state.lastReport = { hour: turn.hour, sent, events, trustBefore };
  return state.lastReport;
}

// From an incident's epilogue: on to the next incident, or to the debrief.
export function advance(state: GameState): void {
  if (state.phase !== "epilogue") return;
  state.lastReport = null;
  state.selection = {};
  if (state.index + 1 < state.incidents.length) {
    state.index += 1;
    state.turn = 0;
    state.phase = "compose";
    state.runs.push(newRun(currentIncident(state)));
    fire(currentIncident(state), currentRun(state), 0);
  } else {
    state.phase = "done";
  }
}

export function findAsk(incident: Incident, turnIndex: number, askId: string): Ask | undefined {
  return incident.turns[turnIndex]?.asks.find((ask) => ask.id === askId);
}

export function draftOf(incident: Incident, message: Sent): Draft {
  return findAsk(incident, message.turn, message.askId)!.drafts.find((draft) => draft.id === message.draftId)!;
}

// The later events a message contributed to: any event whose condition used a flag this message set.
export function causedBy(run: Run, message: Sent): Fired[] {
  return run.fired.filter((event) => event.turn > message.turn && event.because.some((flag) => message.flags.includes(flag)));
}

// Events that no message caused: they happened because something was not said in time.
export function silenceEvents(run: Run): Fired[] {
  return run.fired.filter((event) => !run.sent.some((message) => event.turn > message.turn && event.because.some((flag) => message.flags.includes(flag))));
}

// ---------- score ----------

export type ObjectiveResult = Readonly<{ id: string; label: string; points: number; earned: number; met: boolean; skill?: Skill; missed: string }>;
export type IncidentScore = Readonly<{ id: string; title: string; earned: number; max: number; objectives: ObjectiveResult[]; deadlineMissed: boolean; trust: Record<Meter, number>; messages: number }>;

export function scoreRun(incident: Incident, run: Run): IncidentScore {
  const objectives = incident.objectives.map((objective) => {
    const met = holds(run.flags, objective.when) && (!objective.trust || run.trust[objective.trust.meter] >= objective.trust.min);
    return { id: objective.id, label: objective.label, points: objective.points, earned: met ? objective.points : 0, met, skill: objective.skill, missed: objective.missed };
  });
  return {
    id: incident.id,
    title: incident.title,
    earned: objectives.reduce((sum, entry) => sum + entry.earned, 0),
    max: objectives.reduce((sum, entry) => sum + entry.points, 0),
    objectives,
    deadlineMissed: run.flags.includes("reg-late"),
    trust: { ...run.trust },
    messages: run.sent.length,
  };
}

export type Summary = Readonly<{ total: number; max: number; ratio: number; passed: boolean; deadlineMissed: boolean; incidents: IncidentScore[] }>;

export function summarize(state: GameState): Summary {
  const incidents = state.runs.filter((run) => run.complete).map((run) => scoreRun(state.incidents.find((incident) => incident.id === run.incident)!, run));
  const total = incidents.reduce((sum, entry) => sum + entry.earned, 0);
  const max = state.incidents.reduce((sum, incident) => sum + incident.objectives.reduce((points, objective) => points + objective.points, 0), 0);
  const deadlineMissed = incidents.some((entry) => entry.deadlineMissed);
  return { total, max, ratio: max ? total / max : 0, passed: !deadlineMissed && incidents.length === state.incidents.length && total >= max * PASS_RATIO && incidents.every((entry) => entry.earned >= entry.max * PASS_EACH), deadlineMissed, incidents };
}

// ---------- learning evidence (never mixed into the score) ----------

export type Level = "shown" | "partial" | "not-yet" | "n/a";
export type Evidence = Readonly<{
  skills: { id: Skill; label: string; shown: number; of: number; level: Level }[];
  styles: Record<Style, number>;
  messages: number;
  heldTurns: number; // turns where at least one person was deliberately left waiting
  unaided: { title: string; met: number; of: number } | null; // the incident with no coaching
}>;

export function evidenceOf(state: GameState): Evidence {
  const scores = summarize(state).incidents;
  const skills = (Object.keys(SKILL_LABELS) as Skill[]).map((id) => {
    const items = scores.flatMap((score) => score.objectives.filter((objective) => objective.skill === id));
    const shown = items.filter((item) => item.met).length;
    const level: Level = items.length === 0 ? "n/a" : shown === items.length ? "shown" : shown > 0 ? "partial" : "not-yet";
    return { id, label: SKILL_LABELS[id], shown, of: items.length, level };
  });
  const styles: Record<Style, number> = { measured: 0, reassure: 0, blame: 0, dump: 0, stall: 0 };
  let heldTurns = 0;
  for (const run of state.runs) {
    for (const message of run.sent) styles[message.style] += 1;
    const incident = state.incidents.find((entry) => entry.id === run.incident)!;
    for (let turn = 0; turn < incident.turns.length; turn++) {
      const count = run.sent.filter((message) => message.turn === turn).length;
      if (count > 0 && count < incident.actions) heldTurns += 1;
    }
  }
  const unaidedIncident = state.incidents.find((incident) => !incident.guided);
  const unaidedScore = unaidedIncident && scores.find((score) => score.id === unaidedIncident.id);
  const skillItems = unaidedScore?.objectives.filter((objective) => objective.skill) ?? [];
  return {
    skills,
    styles,
    messages: state.runs.reduce((sum, run) => sum + run.sent.length, 0),
    heldTurns,
    unaided: unaidedScore ? { title: unaidedScore.title, met: skillItems.filter((item) => item.met).length, of: skillItems.length } : null,
  };
}
