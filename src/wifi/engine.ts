// Wi-Fi or Why Not: one work trip, nine situations. Pure rules; no DOM.
// At each stop the traveller has a job to do (or just a hazard to handle) and picks one action.
// Three things are limited: the phone's battery, the mobile data left on the roaming pass, and the
// minutes before the task is due. The action's risk comes from the evidence on screen and around
// the traveller, not from the kind of action: a VPN is right at some stops and useless at others.

export type Risk = "none" | "minor" | "exposed" | "compromise";
export type Compromise = "credentials" | "session" | "device";
export type Sensitivity = "low" | "high";

// Authoring tags. "naive" = the most convenient thing on offer; "vpn" = what someone who believes
// a VPN fixes everything would pick; "refuse" = do nothing; "hotspot" = own mobile data.
export type Tag = "naive" | "vpn" | "refuse" | "hotspot" | "venue" | "verify";

export type OptionKind = "wifi" | "vpn" | "hotspot" | "staff" | "power" | "act" | "decline" | "wait";

export type Option = Readonly<{
  id: string;
  label: string;
  detail: string;
  kind: OptionKind;
  tags: readonly Tag[];
  delivers: boolean; // gets the stop's task done (ignored when the stop has no task)
  risk: Risk;
  compromise?: Compromise; // required when risk is "compromise"
  battery?: number; // extra battery % this action uses
  data?: number; // MB of the roaming pass
  minutes?: number; // how long it takes; over the task's dueIn means late
  charge?: number; // battery % gained
  needsPhone?: boolean; // default true: unavailable with a dead phone
  result: string; // what happened, one or two sentences
}>;

export type Network = Readonly<{ name: string; secured: boolean; bars: 1 | 2 | 3 | 4; note?: string }>;

export type Screen =
  | Readonly<{ kind: "wifi"; networks: readonly Network[] }>
  | Readonly<{ kind: "portal"; network: string; url: string; heading: string; text: string; fields: readonly string[]; button: string }>
  | Readonly<{ kind: "prompt"; app: string; heading: string; text: string; buttons: readonly string[] }>
  | Readonly<{ kind: "warning"; url: string; heading: string; text: string; detail: string; buttons: readonly string[] }>
  | Readonly<{ kind: "doc"; title: string; lines: readonly string[] }>
  | Readonly<{ kind: "qr"; caption: string; link: string }>;

export type Around = Readonly<{ id: string; label: string; text: string }>;
// The evidence that decided the stop; shown in the debrief replay.
export type Clue = Readonly<{ text: string; tell: "trust" | "warn" }>;

export type Task = Readonly<{ label: string; sensitivity: Sensitivity; dueIn: number }>;

export type Stop = Readonly<{
  id: string;
  place: string;
  time: string; // "Day 1 · 06:40"
  title: string;
  situation: string;
  task?: Task; // absent: a pure hazard, nothing to deliver
  around: readonly Around[];
  screens: readonly Screen[];
  options: readonly Option[];
  clues: readonly Clue[];
  why: string;
  hint: string;
  guided?: boolean;
}>;

export type Stage = Readonly<{ id: string; title: string; lesson: string; final?: boolean; stops: readonly Stop[] }>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  traveller: string;
  startBattery: number;
  startData: number;
  stages: readonly Stage[];
}>;

// The phone drains this much at every stop whatever you do.
export const BASE_DRAIN = 7;

export const POINTS = { safe: 10, minor: 7, exposed: 3, compromise: 0, late: 3, missed: 0 } as const;

export const PASS_RATIO = 0.7;
// Each named shortcut must stay under this share of the maximum (tested).
export const SHORTCUT_CEILING = 0.6;
// At most this many tasks may go undelivered (or late) for a pass.
export const PASS_MISSED = 1;

const RISK_POINTS: Readonly<Record<Risk, number>> = { none: POINTS.safe, minor: POINTS.minor, exposed: POINTS.exposed, compromise: POINTS.compromise };

export const RISK_LABELS: Readonly<Record<Risk, string>> = {
  none: "No avoidable risk",
  minor: "Small avoidable risk",
  exposed: "Exposed",
  compromise: "Compromised",
};

export const COMPROMISE_LABELS: Readonly<Record<Compromise, string>> = {
  credentials: "Work credentials stolen",
  session: "Session hijacked",
  device: "Device trust compromised",
};

export function isLate(stop: Stop, option: Option): boolean {
  return !!stop.task && option.delivers && (option.minutes ?? 0) > stop.task.dueIn;
}

// Points for an option, resources aside. A task stop pays only when the task is delivered: on time
// by risk, late at most POINTS.late. A hazard-only stop pays by risk alone.
export function pointsFor(stop: Stop, option: Option): number {
  const byRisk = RISK_POINTS[option.risk];
  if (!stop.task) return byRisk;
  if (!option.delivers) return POINTS.missed;
  return isLate(stop, option) ? Math.min(POINTS.late, byRisk) : byRisk;
}

export function maxPoints(stop: Stop): number {
  return Math.max(...stop.options.map((option) => pointsFor(stop, option)));
}

export type Pick = Readonly<{
  stop: string;
  option: string;
  hinted: boolean;
  points: number;
  delivered: boolean; // task done on time
  late: boolean;
  risk: Risk;
  compromise?: Compromise;
  correct: boolean; // earned the stop's maximum
  battery: number; // after the stop
  data: number;
}>;

export type GameState = {
  scenario: Scenario;
  index: number;
  battery: number;
  data: number;
  picks: Pick[];
  hinted: boolean;
  phase: "play" | "answered" | "done";
};

export function allStops(scenario: Scenario): Stop[] {
  return scenario.stages.flatMap((stage) => stage.stops);
}

export function stageOf(scenario: Scenario, stopId: string): Stage {
  return scenario.stages.find((stage) => stage.stops.some((stop) => stop.id === stopId))!;
}

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, battery: scenario.startBattery, data: scenario.startData, picks: [], hinted: false, phase: "play" };
}

export function currentStop(state: GameState): Stop {
  return allStops(state.scenario)[state.index];
}

export type Availability = Readonly<{ ok: boolean; reason?: string }>;

export function availability(state: GameState, option: Option): Availability {
  const needsPhone = option.needsPhone !== false;
  if (needsPhone && state.battery <= 0) return { ok: false, reason: "Your phone is dead" };
  if (needsPhone && (option.battery ?? 0) > state.battery) return { ok: false, reason: `Needs ${option.battery}% battery, you have ${state.battery}%` };
  if ((option.data ?? 0) > state.data) return { ok: false, reason: `Needs ${option.data} MB, you have ${state.data} MB` };
  return { ok: true };
}

export function availableOptions(state: GameState): Option[] {
  return currentStop(state).options.filter((option) => availability(state, option).ok);
}

// The best available action right now: most points, then least data, battery and time.
export function bestOption(state: GameState): Option {
  const stop = currentStop(state);
  const cost = (o: Option) => [-pointsFor(stop, o), o.data ?? 0, o.battery ?? 0, o.minutes ?? 0];
  return [...availableOptions(state)].sort((a, b) => {
    const [ca, cb] = [cost(a), cost(b)];
    for (let i = 0; i < ca.length; i += 1) if (ca[i] !== cb[i]) return ca[i] - cb[i];
    return 0;
  })[0];
}

export function hintsAllowed(state: GameState): boolean {
  return !stageOf(state.scenario, currentStop(state).id).final;
}

export function takeHint(state: GameState): string | null {
  if (state.phase !== "play" || !hintsAllowed(state)) return null;
  state.hinted = true;
  return currentStop(state).hint;
}

export function choose(state: GameState, optionId: string): Pick | null {
  if (state.phase !== "play") return null;
  const stop = currentStop(state);
  const option = stop.options.find((entry) => entry.id === optionId);
  if (!option || !availability(state, option).ok) return null;
  const late = isLate(stop, option);
  const points = pointsFor(stop, option);
  state.battery = Math.max(0, Math.min(100, state.battery - (option.battery ?? 0) + (option.charge ?? 0)) - BASE_DRAIN);
  state.data -= option.data ?? 0;
  const pick: Pick = {
    stop: stop.id,
    option: option.id,
    hinted: state.hinted,
    points,
    delivered: !!stop.task && option.delivers && !late,
    late,
    risk: option.risk,
    compromise: option.risk === "compromise" ? option.compromise : undefined,
    correct: points === maxPoints(stop),
    battery: state.battery,
    data: state.data,
  };
  state.picks.push(pick);
  state.phase = "answered";
  return pick;
}

export function next(state: GameState): void {
  if (state.phase !== "answered") return;
  state.hinted = false;
  if (state.index + 1 >= allStops(state.scenario).length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.phase = "play";
}

export function optionOf(stop: Stop, optionId: string): Option {
  return stop.options.find((option) => option.id === optionId)!;
}

export function feedbackFor(stop: Stop, option: Option): string {
  const late = isLate(stop, option) ? ` That took ${option.minutes} minutes and you had ${stop.task!.dueIn}: it arrived late.` : "";
  return `${option.result}${late} ${stop.why}`;
}

// ---------- score (what the trip earned) ----------

export type Summary = Readonly<{
  total: number;
  max: number;
  passed: boolean; // no compromise, PASS_RATIO of the points, at most PASS_MISSED tasks undelivered
  compromises: number;
  exposures: number;
  tasks: number;
  delivered: number;
  late: number;
  missed: number; // tasks not delivered on time (late included)
  battery: number;
  data: number;
  hints: number;
  byStage: readonly { title: string; points: number; max: number }[];
}>;

export function summarize(state: GameState): Summary {
  const stops = allStops(state.scenario);
  const total = state.picks.reduce((sum, pick) => sum + pick.points, 0);
  const max = stops.reduce((sum, stop) => sum + maxPoints(stop), 0);
  const tasks = stops.filter((stop) => stop.task).length;
  const delivered = state.picks.filter((pick) => pick.delivered).length;
  const compromises = state.picks.filter((pick) => pick.risk === "compromise").length;
  const answeredTasks = state.picks.filter((pick) => stops.find((stop) => stop.id === pick.stop)!.task).length;
  const missed = answeredTasks - delivered;
  return {
    total,
    max,
    passed: state.phase === "done" && compromises === 0 && total >= max * PASS_RATIO && missed <= PASS_MISSED,
    compromises,
    exposures: state.picks.filter((pick) => pick.risk === "exposed").length,
    tasks,
    delivered,
    late: state.picks.filter((pick) => pick.late).length,
    missed,
    battery: state.battery,
    data: state.data,
    hints: state.picks.filter((pick) => pick.hinted).length,
    byStage: state.scenario.stages.map((stage) => {
      const picks = state.picks.filter((pick) => stage.stops.some((stop) => stop.id === pick.stop));
      return { title: stage.title, points: picks.reduce((sum, pick) => sum + pick.points, 0), max: stage.stops.reduce((sum, stop) => sum + maxPoints(stop), 0) };
    }),
  };
}

// ---------- learning evidence (what the learner showed; never mixed into the score) ----------

export type Skill = "venue-low-risk" | "real-network" | "no-portal-secrets" | "vpn-limits" | "cert-warning" | "physical" | "keeps-working";

export type SkillEvidence = Readonly<{ skill: Skill; label: string; shown: number; of: number; level: "shown" | "partial" | "not-yet" | "n/a" }>;

const hasTag = (stop: Stop, tag: Tag) => stop.options.some((option) => option.tags.includes(tag));
// A stop where the VPN option does not make things safe.
const vpnTrap = (stop: Stop) => stop.options.some((option) => option.tags.includes("vpn") && (option.risk === "exposed" || option.risk === "compromise"));

const SKILLS: readonly { skill: Skill; label: string; applies: (s: Stop) => boolean; shows: (s: Stop, o: Option) => boolean }[] = [
  { skill: "venue-low-risk", label: "Uses the venue's own Wi-Fi for low-risk tasks", applies: (s) => s.task?.sensitivity === "low" && hasTag(s, "venue"), shows: (_s, o) => o.tags.includes("venue") },
  { skill: "real-network", label: "Picks the network the venue vouches for, not the look-alike", applies: (s) => s.screens.some((screen) => screen.kind === "wifi"), shows: (_s, o) => !o.tags.includes("naive") && o.risk !== "compromise" && o.risk !== "exposed" },
  { skill: "no-portal-secrets", label: "Gives a Wi-Fi page no work password and installs nothing from it", applies: (s) => s.options.some((o) => o.compromise === "credentials" || o.compromise === "device"), shows: (_s, o) => o.risk !== "compromise" },
  { skill: "vpn-limits", label: "Knows what a VPN does not fix", applies: vpnTrap, shows: (_s, o) => !o.tags.includes("vpn") },
  { skill: "cert-warning", label: "Stops at a certificate warning instead of clicking through", applies: (s) => s.screens.some((screen) => screen.kind === "warning"), shows: (_s, o) => o.risk !== "compromise" },
  { skill: "physical", label: "Handles ports, files and onlookers, not only networks", applies: (s) => !s.screens.some((screen) => screen.kind === "wifi" || screen.kind === "portal" || screen.kind === "warning" || screen.kind === "qr"), shows: (_s, o) => o.risk === "none" },
  { skill: "keeps-working", label: "Gets the work delivered on time", applies: (s) => !!s.task, shows: (s, o) => o.delivers && !isLate(s, o) },
];

export type Evidence = Readonly<{
  skills: readonly SkillEvidence[];
  final: Readonly<{ correct: number; of: number }>;
  unaided: Readonly<{ correct: number; of: number }>;
}>;

function levelOf(shown: number, of: number): SkillEvidence["level"] {
  if (of === 0) return "n/a";
  return shown === of ? "shown" : shown > 0 ? "partial" : "not-yet";
}

export function evidenceOf(state: GameState): Evidence {
  const byId = new Map(allStops(state.scenario).map((stop) => [stop.id, stop]));
  const decided = state.picks.map((pick) => ({ pick, stop: byId.get(pick.stop)!, option: optionOf(byId.get(pick.stop)!, pick.option) }));
  const finalIds = new Set(state.scenario.stages.filter((stage) => stage.final).flatMap((stage) => stage.stops.map((stop) => stop.id)));
  const finalPicks = decided.filter(({ stop }) => finalIds.has(stop.id));
  const unaided = decided.filter(({ pick }) => !pick.hinted);
  return {
    skills: SKILLS.map(({ skill, label, applies, shows }) => {
      const relevant = decided.filter(({ stop }) => applies(stop));
      const shown = relevant.filter(({ stop, option }) => shows(stop, option)).length;
      return { skill, label, shown, of: relevant.length, level: levelOf(shown, relevant.length) };
    }),
    final: { correct: finalPicks.filter(({ pick }) => pick.correct).length, of: finalPicks.length },
    unaided: { correct: unaided.filter(({ pick }) => pick.correct).length, of: unaided.length },
  };
}
