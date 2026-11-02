// Breach Timeline rules. Pure: no DOM. See docs/design/BREACH_TIMELINE.md.
//
// An incident is a set of event cards with a true order. Some timestamps are shown in full, some
// only to the hour or day, some not at all, so sorting by time alone never settles the order: the
// learner has to infer the rest from dependencies ("can't sign in before the password is stolen").
// Then they pick the control that would have stopped the attack earliest, and mark the step it
// stops. The score and the learning evidence are computed separately.

export type Mask = "full" | "hour" | "day" | "none";

export type Dependency = Readonly<{ id: string; why: string }>;

export type TimelineEvent = Readonly<{
  id: string;
  short: string; // 2–4 word name used in feedback
  text: string; // what the card says
  at: number; // minutes from Monday 00:00 of the incident's first week (true time)
  mask: Mask; // how much of the timestamp the learner sees
  after: readonly Dependency[]; // events that must come first, and why
  clue: string; // hint: what this step needs
}>;

export type ControlId = "mail" | "mfa" | "geo" | "edr" | "egress";

export type Control = Readonly<{ id: ControlId; name: string; does: string }>;

// The same five controls appear in every incident. Whether each one helps differs per incident,
// so "always pick the same one" never pays.
export const CONTROLS: readonly Control[] = [
  { id: "mail", name: "Mail filtering", does: "Quarantines suspicious email: look-alike or brand-new domains, risky attachments, known bad links." },
  { id: "mfa", name: "MFA", does: "Sign-ins need a second factor (a push approval on a phone) as well as the password." },
  { id: "geo", name: "Geo-blocking", does: "Blocks sign-ins from countries the organisation doesn't operate in." },
  { id: "edr", name: "EDR", does: "Endpoint detection and response on managed computers and servers: blocks and isolates malicious activity." },
  { id: "egress", name: "Egress monitoring", does: "Watches traffic leaving the network and blocks large or unusual outbound transfers." },
];

export type ControlEffect = Readonly<{ stops: string | null; why: string }>;

export type Summary = Readonly<{ headline: string; body: string; lesson: string }>;

export type Incident = Readonly<{
  id: string;
  title: string;
  org: string;
  brief: string;
  quick: boolean; // short enough for the 60-second mode
  guided?: boolean; // clues shown on every card, coach on
  events: readonly TimelineEvent[]; // in true chronological order
  controls: Readonly<Record<ControlId, ControlEffect>>;
  summary: Summary;
}>;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function at(day: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return day * 1440 + h * 60 + m;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function timeLabel(event: TimelineEvent): string {
  const day = DAYS[Math.floor(event.at / 1440) % 7];
  const h = pad(Math.floor((event.at % 1440) / 60));
  const m = pad(event.at % 60);
  switch (event.mask) {
    case "full":
      return `${day} ${h}:${m}`;
    case "hour":
      return `${day} ${h}:··`;
    case "day":
      return `${day} ··:··`;
    case "none":
      return "Time not logged";
  }
}

// What the visible part of two timestamps proves: -1 a is before b, 1 a is after b, 0 unknown.
export function visibleOrder(a: TimelineEvent, b: TimelineEvent): -1 | 0 | 1 {
  if (a.mask === "none" || b.mask === "none") return 0;
  const sign = (x: number, y: number): -1 | 0 | 1 => (x < y ? -1 : x > y ? 1 : 0);
  const day = sign(Math.floor(a.at / 1440), Math.floor(b.at / 1440));
  if (day !== 0) return day;
  if (a.mask === "day" || b.mask === "day") return 0;
  const hour = sign(Math.floor(a.at / 60), Math.floor(b.at / 60));
  if (hour !== 0) return hour;
  if (a.mask === "hour" || b.mask === "hour") return 0;
  return sign(a.at, b.at);
}

export type Constraint = Readonly<{ before: string; after: string; kind: "dependency" | "time"; why: string }>;

// Everything the learner can know about the order: authored dependencies plus whatever the
// visible timestamps prove. A dependency explanation wins when both apply.
export function constraints(incident: Incident, kinds: readonly Constraint["kind"][] = ["dependency", "time"]): Constraint[] {
  const out: Constraint[] = [];
  const byId = new Map(incident.events.map((e) => [e.id, e]));
  if (kinds.includes("dependency")) {
    for (const event of incident.events) for (const dep of event.after) out.push({ before: dep.id, after: event.id, kind: "dependency", why: dep.why });
  }
  if (kinds.includes("time")) {
    for (const a of incident.events)
      for (const b of incident.events) {
        if (a === b || visibleOrder(a, b) !== -1) continue;
        if (out.some((c) => c.before === a.id && c.after === b.id)) continue;
        out.push({ before: a.id, after: b.id, kind: "time", why: `“${a.short}” is stamped ${timeLabel(byId.get(a.id)!)} and “${b.short}” ${timeLabel(b)}.` });
      }
  }
  return out;
}

// True when the constraints allow exactly one order (Kahn's algorithm with a single source at
// every step). Content tests use it: all clues together must settle the order; timestamps alone
// must not.
export function uniqueOrder(incident: Incident, kinds: readonly Constraint["kind"][] = ["dependency", "time"]): string[] | null {
  const cs = constraints(incident, kinds);
  const remaining = new Set(incident.events.map((e) => e.id));
  const order: string[] = [];
  while (remaining.size) {
    const sources = [...remaining].filter((id) => !cs.some((c) => c.after === id && remaining.has(c.before)));
    if (sources.length !== 1) return null;
    order.push(sources[0]);
    remaining.delete(sources[0]);
  }
  return order;
}

export function trueOrder(incident: Incident): string[] {
  return incident.events.map((e) => e.id);
}

export function violations(incident: Incident, order: readonly string[]): Constraint[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return constraints(incident).filter((c) => pos.get(c.before)! > pos.get(c.after)!);
}

export function isValidOrder(incident: Incident, order: readonly string[]): boolean {
  const ids = trueOrder(incident);
  return order.length === ids.length && ids.every((id) => order.includes(id)) && violations(incident, order).length === 0;
}

// ---------- controls ----------

export type ControlVerdict = "earliest" | "later" | "none";

export type ControlEvaluation = Readonly<{
  control: ControlId;
  verdict: ControlVerdict;
  stops: string | null;
  stepsLate: number; // events that still happen beyond the earliest possible stop
  why: string;
}>;

export function stopIndex(incident: Incident, control: ControlId): number | null {
  const stops = incident.controls[control].stops;
  return stops === null ? null : incident.events.findIndex((e) => e.id === stops);
}

export function earliestIndex(incident: Incident): number {
  return Math.min(...CONTROLS.map((c) => stopIndex(incident, c.id)).filter((i): i is number => i !== null));
}

export function earliestControls(incident: Incident): ControlId[] {
  const best = earliestIndex(incident);
  return CONTROLS.filter((c) => stopIndex(incident, c.id) === best).map((c) => c.id);
}

export function evaluateControl(incident: Incident, control: ControlId): ControlEvaluation {
  const effect = incident.controls[control];
  const index = stopIndex(incident, control);
  if (index === null) return { control, verdict: "none", stops: null, stepsLate: 0, why: effect.why };
  const late = index - earliestIndex(incident);
  return { control, verdict: late === 0 ? "earliest" : "later", stops: effect.stops, stepsLate: late, why: effect.why };
}

// ---------- a round (one incident) ----------

export const ORDER_MAX = 50;
export const CHECK_PENALTY = 15;
export const MAX_FAILED_CHECKS = 3; // the third failed check reveals the order, for 0 order points
export const CONTROL_MAX = 30;
export const LATE_PENALTY = 6; // per step later than the earliest effective control
export const LATE_MIN = 4;
export const MARK_MAX = 20;

export type Phase = "order" | "control" | "done";

export type CheckResult = Readonly<{
  ok: boolean;
  satisfied: number;
  total: number;
  explained: Constraint | null; // one broken clue, explained
  revealed: boolean; // out of checks: the true order was laid out
}>;

export type Round = {
  incident: Incident;
  order: string[];
  phase: Phase;
  failedChecks: number;
  revealed: boolean;
  hints: string[]; // event ids whose clue was revealed by a hint
  slips: { dependency: number; time: number }; // broken clues across failed checks
  control: ControlId | null;
  mark: string | null;
  lastCheck: CheckResult | null;
};

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Deals the cards in an order that is not already correct.
export function newRound(incident: Incident, seed: number): Round {
  let order = shuffled(trueOrder(incident), seed);
  for (let n = 1; isValidOrder(incident, order) && n < 50; n += 1) order = shuffled(trueOrder(incident), seed + n * 7919);
  if (isValidOrder(incident, order)) order = trueOrder(incident).reverse();
  return { incident, order, phase: "order", failedChecks: 0, revealed: false, hints: [], slips: { dependency: 0, time: 0 }, control: null, mark: null, lastCheck: null };
}

export function moveTo(round: Round, id: string, index: number): boolean {
  if (round.phase !== "order") return false;
  const from = round.order.indexOf(id);
  const to = Math.max(0, Math.min(round.order.length - 1, index));
  if (from < 0 || from === to) return false;
  round.order.splice(from, 1);
  round.order.splice(to, 0, id);
  round.lastCheck = null;
  return true;
}

export function moveBy(round: Round, id: string, delta: number): boolean {
  return moveTo(round, id, round.order.indexOf(id) + delta);
}

// Which broken clue to explain: the one whose later event comes earliest in the true order, so
// feedback works from the start of the story forward. Dependencies before timestamps.
function pickViolation(incident: Incident, broken: readonly Constraint[]): Constraint | null {
  if (!broken.length) return null;
  const truth = trueOrder(incident);
  return [...broken].sort((a, b) => truth.indexOf(a.after) - truth.indexOf(b.after) || (a.kind === b.kind ? 0 : a.kind === "dependency" ? -1 : 1))[0];
}

export function check(round: Round): CheckResult | null {
  if (round.phase !== "order") return null;
  const all = constraints(round.incident);
  const broken = violations(round.incident, round.order);
  if (!broken.length) {
    round.phase = "control";
    round.lastCheck = { ok: true, satisfied: all.length, total: all.length, explained: null, revealed: false };
    return round.lastCheck;
  }
  round.failedChecks += 1;
  for (const c of broken) round.slips[c.kind] += 1;
  const explained = pickViolation(round.incident, broken);
  const revealed = round.failedChecks >= MAX_FAILED_CHECKS;
  if (revealed) {
    round.order = trueOrder(round.incident);
    round.revealed = true;
    round.phase = "control";
  }
  round.lastCheck = { ok: false, satisfied: all.length - broken.length, total: all.length, explained, revealed };
  return round.lastCheck;
}

// A free hint: the clue of the event at the heart of the first broken rule (or, if nothing is
// broken yet, the first event whose clue is still hidden). Counted as evidence, never scored.
export function hint(round: Round): TimelineEvent | null {
  if (round.phase !== "order") return null;
  const broken = pickViolation(round.incident, violations(round.incident, round.order));
  const id = broken && !round.hints.includes(broken.after) ? broken.after : round.incident.events.find((e) => e.after.length && !round.hints.includes(e.id))?.id;
  if (!id) return null;
  round.hints.push(id);
  return round.incident.events.find((e) => e.id === id)!;
}

export function chooseControl(round: Round, control: ControlId): boolean {
  if (round.phase !== "control" || !CONTROLS.some((c) => c.id === control)) return false;
  round.control = control;
  return true;
}

export function markStop(round: Round, eventId: string): boolean {
  if (round.phase !== "control" || !round.incident.events.some((e) => e.id === eventId)) return false;
  round.mark = eventId;
  return true;
}

export function canLockIn(round: Round): boolean {
  return round.phase === "control" && round.control !== null && round.mark !== null;
}

export function lockIn(round: Round): boolean {
  if (!canLockIn(round)) return false;
  round.phase = "done";
  return true;
}

export type RoundScore = Readonly<{ order: number; control: number; mark: number; total: number }>;

export const ROUND_MAX = ORDER_MAX + CONTROL_MAX + MARK_MAX;

export function orderPoints(round: Round): number {
  return round.revealed ? 0 : Math.max(0, ORDER_MAX - CHECK_PENALTY * round.failedChecks);
}

export function controlPoints(incident: Incident, control: ControlId | null): number {
  if (!control) return 0;
  const evaluation = evaluateControl(incident, control);
  if (evaluation.verdict === "none") return 0;
  return Math.max(LATE_MIN, CONTROL_MAX - LATE_PENALTY * evaluation.stepsLate);
}

// The mark only counts for a control that works, placed on the step it actually stops.
export function markPoints(incident: Incident, control: ControlId | null, mark: string | null): number {
  if (!control || !mark) return 0;
  const stops = incident.controls[control].stops;
  return stops !== null && stops === mark ? MARK_MAX : 0;
}

export function scoreRound(round: Round): RoundScore {
  const order = round.phase === "order" ? 0 : orderPoints(round);
  const control = round.phase === "done" ? controlPoints(round.incident, round.control) : 0;
  const mark = round.phase === "done" ? markPoints(round.incident, round.control, round.mark) : 0;
  return { order, control, mark, total: order + control + mark };
}

// ---------- learning evidence (never part of the score) ----------

export type Evidence = Readonly<{
  incident: string;
  guided: boolean;
  orderFirstTry: boolean; // correct order on the first check
  unaided: boolean; // ...and without hints
  failedChecks: number;
  revealed: boolean;
  hints: number;
  dependencySlips: number;
  timeSlips: number;
  controlVerdict: ControlVerdict | null;
  stepsLate: number;
  markCorrect: boolean;
}>;

export function evidenceFor(round: Round): Evidence {
  const evaluation = round.control ? evaluateControl(round.incident, round.control) : null;
  return {
    incident: round.incident.id,
    guided: !!round.incident.guided,
    orderFirstTry: round.phase !== "order" && round.failedChecks === 0,
    unaided: round.phase !== "order" && round.failedChecks === 0 && round.hints.length === 0,
    failedChecks: round.failedChecks,
    revealed: round.revealed,
    hints: round.hints.length,
    dependencySlips: round.slips.dependency,
    timeSlips: round.slips.time,
    controlVerdict: round.phase === "done" ? (evaluation?.verdict ?? null) : null,
    stepsLate: evaluation?.stepsLate ?? 0,
    markCorrect: round.phase === "done" && markPoints(round.incident, round.control, round.mark) > 0,
  };
}

export type ObjectiveStatus = "shown" | "partly" | "not yet";

export type Objective = Readonly<{ id: string; text: string; status: ObjectiveStatus; detail: string }>;

// Objectives are judged on unguided incidents where possible (the guided one shows every clue).
export function objectives(evidence: readonly Evidence[]): Objective[] {
  const pool = evidence.filter((e) => !e.guided).length ? evidence.filter((e) => !e.guided) : evidence;
  const n = pool.length;
  const rate = (k: number, of = n): ObjectiveStatus => (of === 0 ? "not yet" : k === of ? "shown" : k > 0 ? "partly" : "not yet");
  const unaided = pool.filter((e) => e.unaided).length;
  const earliest = pool.filter((e) => e.controlVerdict === "earliest").length;
  const marked = pool.filter((e) => e.markCorrect).length;
  const markable = pool.filter((e) => e.controlVerdict === "earliest" || e.controlVerdict === "later").length;
  const noneChosen = pool.filter((e) => e.controlVerdict === "none").length;
  return [
    { id: "sequence", text: "Infers attack order from dependencies when timestamps are missing", status: rate(unaided), detail: `${unaided} of ${n} timeline${n === 1 ? "" : "s"} right on the first check with no hints.` },
    { id: "earliest", text: "Chooses the control that stops the attack earliest", status: rate(earliest), detail: `${earliest} of ${n} earliest; ${noneChosen} chosen control${noneChosen === 1 ? "" : "s"} would not have stopped the attack at all.` },
    { id: "placement", text: "Knows which step a control actually stops", status: rate(marked, markable), detail: `${marked} of ${markable} stop points marked on the right step (only counted when the chosen control works).` },
  ];
}

export function totals(scores: readonly RoundScore[]): { total: number; max: number } {
  return { total: scores.reduce((s, r) => s + r.total, 0), max: scores.length * ROUND_MAX };
}
