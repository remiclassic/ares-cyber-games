// Alert or Noise: triage a stream of alerts under time pressure. Pure rules; no DOM, no timers.
// The UI drives the clock with tick(state, ms) and the player's calls with decide(state, call).
//
// The design rule: escalating everything must lose. Every escalation lands in a visible analyst
// queue that drains slowly. A wasted escalation costs points and adds load; once the queue is over
// capacity, real threats are worth half (the analysts reach them late) and wasted ones cost more.
// A missed threat costs the most of all, so dismissing everything loses too.

export type Truth = "threat" | "noise";

export type Alert = Readonly<{
  id: string;
  source: string; // product or log the line came from, e.g. "Identity provider"
  text: string; // the line as the analyst sees it
  evidence: string; // the exact substring that decides it (highlighted in guidance and debrief)
  truth: Truth;
  why: string; // one line, tied to the evidence
}>;

export type Call = "escalate" | "dismiss";
export type Decision = Call | "timeout";
export type Outcome = "hit" | "miss" | "false-alarm" | "correct-reject" | "expired";

export type Mode = "full" | "wait";

export type Config = Readonly<{
  mode: Mode;
  durationMs: number; // length of the live stream
  intervalMs: number; // a new alert arrives this often
  ttlMs: number; // an alert left waiting this long ages out unhandled
  drainMs: number; // the analysts close one escalated case this often
  capacity: number; // queue load at which the analysts are swamped
}>;

export const CONFIGS: Readonly<Record<Mode, Config>> = {
  full: { mode: "full", durationMs: 60_000, intervalMs: 3_000, ttlMs: 8_000, drainMs: 6_000, capacity: 4 },
  wait: { mode: "wait", durationMs: 30_000, intervalMs: 3_000, ttlMs: 8_000, drainMs: 6_000, capacity: 4 },
};

// Points are the game score. Learning evidence (accuracy) is computed separately in evidenceOf().
export const POINTS = {
  hit: 10, // real threat escalated
  hitSwamped: 5, // real threat escalated into an overloaded queue
  correctReject: 2, // noise dismissed
  falseAlarm: -4, // noise escalated: wasted analyst time
  falseAlarmSwamped: -7, // ... into an overloaded queue
  miss: -12, // real threat dismissed or left to age out
  expiredNoise: 0, // noise left to age out: no harm, no credit
} as const;

export type CallRecord = Readonly<{
  alert: string;
  decision: Decision;
  outcome: Outcome;
  points: number;
  guided: boolean;
  swamped: boolean; // the queue was over capacity when this was escalated
  at: number; // round clock (ms) when it was settled
}>;

export type Pending = Readonly<{ alert: Alert; arrivedAt: number }>;

export type Phase = "guided" | "live" | "done";

export type GameState = {
  config: Config;
  guided: readonly Alert[];
  guidedIndex: number;
  guidedAnswered: boolean; // a guided call was made and is waiting for "next"
  stream: readonly Alert[];
  arrived: number; // how many stream alerts have arrived
  pending: Pending[]; // arrived, not yet settled; the player always works the oldest
  queue: number; // analyst load (escalated cases still open)
  clock: number; // live-stream time elapsed (ms)
  records: CallRecord[];
  phase: Phase;
  stoppedEarly: boolean;
};

// ---------- seeded shuffle ----------
export function rngFrom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function streamLength(config: Config): number {
  return Math.ceil(config.durationMs / config.intervalMs);
}

// Builds the round's stream: about a third threats (never fewer than two), shuffled so that no
// more than two threats arrive back to back and the first alert is noise (the first live call is
// never a freebie for "escalate everything").
export function buildStream(pool: readonly Alert[], count: number, seed: string, threatShare = 0.35): Alert[] {
  const rand = rngFrom(seed);
  const threats = shuffle(pool.filter((alert) => alert.truth === "threat"), rand);
  const noise = shuffle(pool.filter((alert) => alert.truth === "noise"), rand);
  const wantThreats = Math.min(threats.length, Math.max(2, Math.round(count * threatShare)));
  const wantNoise = Math.min(noise.length, count - wantThreats);
  const picked = [...threats.slice(0, wantThreats), ...noise.slice(0, wantNoise)];
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = shuffle(picked, rand);
    if (order[0]?.truth === "threat") continue;
    let run = 0;
    let ok = true;
    for (const alert of order) {
      run = alert.truth === "threat" ? run + 1 : 0;
      if (run > 2) ok = false;
    }
    if (ok) return order;
  }
  // Fallback (only reachable with a degenerate pool): interleave deterministically.
  const out: Alert[] = [];
  const t = picked.filter((alert) => alert.truth === "threat");
  const n = picked.filter((alert) => alert.truth === "noise");
  while (t.length || n.length) {
    if (n.length) out.push(n.shift()!);
    if (t.length) out.push(t.shift()!);
  }
  return out;
}

// ---------- lifecycle ----------
export function createGame(config: Config, stream: readonly Alert[], guided: readonly Alert[] = []): GameState {
  const state: GameState = {
    config,
    guided,
    guidedIndex: 0,
    guidedAnswered: false,
    stream,
    arrived: 0,
    pending: [],
    queue: 0,
    clock: 0,
    records: [],
    phase: guided.length ? "guided" : "live",
    stoppedEarly: false,
  };
  if (state.phase === "live") deliver(state);
  return state;
}

export function arrivalTime(state: GameState, index: number): number {
  return index * state.config.intervalMs;
}

export function isSwamped(state: GameState): boolean {
  return state.queue >= state.config.capacity;
}

export function timeLeft(state: GameState): number {
  return Math.max(0, state.config.durationMs - state.clock);
}

// The alert the player is looking at right now, if any.
export function currentAlert(state: GameState): Alert | undefined {
  if (state.phase === "guided") return state.guided[state.guidedIndex];
  if (state.phase === "live") return state.pending[0]?.alert;
  return undefined;
}

function outcomeOf(truth: Truth, decision: Decision): Outcome {
  if (decision === "timeout") return truth === "threat" ? "miss" : "expired";
  if (decision === "escalate") return truth === "threat" ? "hit" : "false-alarm";
  return truth === "threat" ? "miss" : "correct-reject";
}

export function pointsFor(outcome: Outcome, swamped: boolean): number {
  switch (outcome) {
    case "hit":
      return swamped ? POINTS.hitSwamped : POINTS.hit;
    case "false-alarm":
      return swamped ? POINTS.falseAlarmSwamped : POINTS.falseAlarm;
    case "correct-reject":
      return POINTS.correctReject;
    case "miss":
      return POINTS.miss;
    case "expired":
      return POINTS.expiredNoise;
  }
}

function settle(state: GameState, alert: Alert, decision: Decision, guided: boolean): CallRecord {
  const outcome = outcomeOf(alert.truth, decision);
  const swamped = decision === "escalate" && isSwamped(state);
  // Guided items teach; they are not scored and not counted as evidence.
  const points = guided ? 0 : pointsFor(outcome, swamped);
  if (decision === "escalate" && !guided) state.queue += 1;
  const record: CallRecord = { alert: alert.id, decision, outcome, points, guided, swamped, at: state.clock };
  state.records.push(record);
  return record;
}

function deliver(state: GameState): void {
  const due = () => arrivalTime(state, state.arrived);
  while (state.arrived < state.stream.length && due() <= state.clock && due() < state.config.durationMs) {
    state.pending.push({ alert: state.stream[state.arrived], arrivedAt: due() });
    state.arrived += 1;
  }
}

// Advances the live stream by `ms`: drains the analyst queue, delivers new alerts, ages out the
// ones left waiting too long, and ends the round when the time is up. No effect outside "live".
export function tick(state: GameState, ms: number): CallRecord[] {
  if (state.phase !== "live" || ms <= 0) return [];
  const { config } = state;
  const expired: CallRecord[] = [];
  state.clock = Math.min(config.durationMs, state.clock + ms);
  state.queue = Math.max(0, state.queue - ms / config.drainMs);
  deliver(state);
  while (state.pending.length && state.pending[0].arrivedAt + config.ttlMs <= state.clock) {
    expired.push(settle(state, state.pending.shift()!.alert, "timeout", false));
  }
  if (state.clock >= config.durationMs) end(state, false);
  return expired;
}

// The player's call on the current alert. Returns the record, or null if there is nothing to call.
export function decide(state: GameState, call: Call): CallRecord | null {
  if (call !== "escalate" && call !== "dismiss") return null;
  if (state.phase === "guided") {
    if (state.guidedAnswered) return null;
    state.guidedAnswered = true;
    return settle(state, state.guided[state.guidedIndex], call, true);
  }
  if (state.phase !== "live" || !state.pending.length) return null;
  return settle(state, state.pending.shift()!.alert, call, false);
}

// Moves past an answered guided alert; after the last one the live stream starts.
export function nextGuided(state: GameState): void {
  if (state.phase !== "guided" || !state.guidedAnswered) return;
  state.guidedAnswered = false;
  state.guidedIndex += 1;
  if (state.guidedIndex >= state.guided.length) {
    state.phase = "live";
    deliver(state); // the first alert arrives at once
  }
}

// Ends the round. Alerts still waiting are dropped unscored: the player had no fair chance at them.
// Used both when time runs out and when a host (e.g. a range that just became ready) stops play.
export function end(state: GameState, early = true): void {
  if (state.phase === "done") return;
  state.pending = [];
  state.phase = "done";
  state.stoppedEarly = early;
}

// ---------- results ----------
export type Score = Readonly<{
  points: number;
  best: number; // what perfect calls on the same alerts would have scored
  swampedCalls: number;
}>;

// Learning evidence: how well the calls separated threats from noise, independent of points,
// speed bonuses and queue effects. Guided items are excluded.
export type Evidence = Readonly<{
  calls: number; // decisions actually made (not timeouts)
  correct: number;
  accuracy: number; // correct / calls, 0..1 (0 when no calls)
  threats: number; // threats seen (decided or timed out)
  caught: number; // threats escalated
  missed: number; // threats dismissed
  timedOutThreats: number;
  noise: number; // noise seen (decided or timed out)
  filtered: number; // noise dismissed
  wasted: number; // noise escalated
  timedOutNoise: number;
  lean: "escalate" | "dismiss" | "balanced";
}>;

export function scoreOf(state: GameState): Score {
  const live = state.records.filter((record) => !record.guided);
  const byId = new Map(state.stream.map((alert) => [alert.id, alert]));
  return {
    points: live.reduce((sum, record) => sum + record.points, 0),
    best: live.reduce((sum, record) => sum + (byId.get(record.alert)?.truth === "threat" ? POINTS.hit : POINTS.correctReject), 0),
    swampedCalls: live.filter((record) => record.swamped).length,
  };
}

export function evidenceOf(state: GameState): Evidence {
  const live = state.records.filter((record) => !record.guided);
  const count = (outcome: Outcome, decision?: Decision) => live.filter((record) => record.outcome === outcome && (!decision || record.decision === decision)).length;
  const caught = count("hit");
  const missed = count("miss", "dismiss");
  const timedOutThreats = count("miss", "timeout");
  const filtered = count("correct-reject");
  const wasted = count("false-alarm");
  const timedOutNoise = count("expired");
  const calls = caught + missed + filtered + wasted;
  const correct = caught + filtered;
  const lean = wasted > missed + 1 ? "escalate" : missed > wasted + 1 ? "dismiss" : "balanced";
  return {
    calls,
    correct,
    accuracy: calls ? correct / calls : 0,
    threats: caught + missed + timedOutThreats,
    caught,
    missed,
    timedOutThreats,
    noise: filtered + wasted + timedOutNoise,
    filtered,
    wasted,
    timedOutNoise,
    lean,
  };
}

export type DebriefLine = Readonly<{ alert: Alert; kind: "missed" | "wasted"; reason: string }>;

// Missed threats first (they cost most), then wasted escalations, each with its evidence line.
export function debriefLines(state: GameState): DebriefLine[] {
  const byId = new Map([...state.stream, ...state.guided].map((alert) => [alert.id, alert]));
  const live = state.records.filter((record) => !record.guided);
  const missed = live
    .filter((record) => record.outcome === "miss")
    .map((record): DebriefLine => {
      const alert = byId.get(record.alert)!;
      const prefix = record.decision === "timeout" ? "Aged out unhandled. " : "";
      return { alert, kind: "missed", reason: prefix + alert.why };
    });
  const wasted = live
    .filter((record) => record.outcome === "false-alarm")
    .map((record): DebriefLine => {
      const alert = byId.get(record.alert)!;
      return { alert, kind: "wasted", reason: alert.why };
    });
  return [...missed, ...wasted];
}

// Splits a line around its evidence so the UI can highlight it without re-implementing the search.
export function splitEvidence(alert: Alert): [string, string, string] {
  const at = alert.text.indexOf(alert.evidence);
  if (at < 0) return [alert.text, "", ""];
  return [alert.text.slice(0, at), alert.evidence, alert.text.slice(at + alert.evidence.length)];
}
