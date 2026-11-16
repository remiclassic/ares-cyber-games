// Backup or Bust: backup planning under a budget. Pure rules; no DOM.
// For each system the learner picks how often to back up, where the copy lives and whether to pay
// for a test restore. Then an incident hits and every system plays out: was the copy usable, how
// much work was lost (RPO) and how long it was down (RTO). The budget is too small to protect
// everything at maximum, so the skill is matching protection to each system
// (docs/design/BACKUP_OR_BUST.md).

export type Freq = "none" | "weekly" | "daily" | "hourly";
export type Loc = "same" | "share" | "cloud" | "offline";
export type IncidentKind = "disk" | "ransomware" | "delete" | "lockout" | "takeover";
export type Criticality = 1 | 2 | 3;
export type Mode = "guided" | "hints" | "final";

export const FREQS: readonly Freq[] = ["none", "weekly", "daily", "hourly"];
export const LOCS: readonly Loc[] = ["same", "share", "cloud", "offline"];

// `hours` is the most work that can be lost: the gap between two backups.
export const FREQ: Record<Freq, { label: string; cost: number; hours: number; rule: string }> = {
  none: { label: "None", cost: 0, hours: Infinity, rule: "No copy at all. Right only when there is nothing to lose." },
  weekly: { label: "Weekly", cost: 1, hours: 168, rule: "Up to a week of work is lost." },
  daily: { label: "Daily", cost: 2, hours: 24, rule: "Up to a day of work is lost." },
  hourly: { label: "Hourly", cost: 4, hours: 1, rule: "At most an hour of work is lost." },
};

// `restore` is the hours to get the data back from a copy that has been restored before.
export const LOC: Record<Loc, { label: string; short: string; cost: number; restore: number; rule: string }> = {
  same: { label: "Same server", short: "Same", cost: 0, restore: 1, rule: "A copy next to the live data. Free and fast, and gone whenever the system is." },
  share: { label: "Network share", short: "Share", cost: 1, restore: 2, rule: "A copy on another machine on the network. Fast, keeps 7 days, reachable by anything on the network." },
  cloud: { label: "Cloud", short: "Cloud", cost: 2, restore: 4, rule: "A copy in the organisation's cloud account. Off-site, keeps 90 days, needs the account to be working." },
  offline: { label: "Offline / immutable", short: "Offline", cost: 3, restore: 6, rule: "A copy nothing on the network or in the cloud account can change. Slowest to restore, survives everything." },
};

export const TEST_COST = 1;
// A restore nobody has practised takes twice as long.
export const UNTESTED_FACTOR = 2;

export const INCIDENT: Record<IncidentKind, { label: string; reaches: readonly Loc[]; rule: string }> = {
  disk: { label: "Failed disk", reaches: ["same"], rule: "The machine's disk dies. Anything stored on that machine dies with it." },
  ransomware: { label: "Ransomware", reaches: ["same", "share"], rule: "Encrypts every on-site machine and every network share those machines can reach." },
  delete: { label: "Accidental delete, found late", reaches: ["same", "share"], rule: "A folder is deleted by mistake and noticed three weeks later. Copies that only go back a week no longer contain it." },
  lockout: { label: "Cloud account lockout", reaches: ["same", "cloud"], rule: "The cloud account is locked. Hosted systems and every copy stored in that account are out of reach." },
  takeover: { label: "Ransomware + cloud lockout", reaches: ["same", "share", "cloud"], rule: "Attackers with a stolen admin login encrypt the site, the shares, and lock the cloud account." },
};

export const CRITICALITY: Record<Criticality, { label: string; rto: number; rule: string }> = {
  3: { label: "Critical", rto: 6, rule: "The organisation stops without it. Back within 6 hours." },
  2: { label: "Important", rto: 12, rule: "Painful to be without. Back within 12 hours." },
  1: { label: "Low", rto: 72, rule: "An inconvenience. Back within 3 days." },
};

export type Change = "constant" | "daily" | "rarely";
export const CHANGE: Record<Change, { label: string; rpo: number; rule: string }> = {
  constant: { label: "Changes all day", rpo: 1, rule: "New records every few minutes. Losing more than an hour hurts." },
  daily: { label: "Changes daily", rpo: 24, rule: "A day of work can be redone. More than that cannot." },
  rarely: { label: "Changes rarely", rpo: 168, rule: "Changes about once a week. A week-old copy is fine." },
};

export type System = Readonly<{
  id: string;
  name: string;
  desc: string;
  criticality: Criticality;
  change: Change;
  hosted: boolean; // lives in the cloud account rather than on site
  fragile: boolean; // live database: an untested copy of it does not restore
  rebuildable?: boolean; // holds nothing unique: rebuilt from a standard image, no backup needed
  hit: IncidentKind; // what the incident does to this system
  lost: string; // what losing it for good means, in the learner's terms
}>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  mode: Mode;
  budget: number;
  lesson: string;
  register: readonly string[]; // the risks known before the incident (HTML-free text)
  incident: string; // headline shown when it hits
  story: string;
  systems: readonly System[];
}>;

export type Game = Readonly<{ id: string; org: string; title: string; scenarios: readonly Scenario[] }>;

export type Choice = Readonly<{ freq: Freq; loc: Loc; test: boolean }>;
export type Plan = Readonly<Record<string, Choice>>;

export const NO_BACKUP: Choice = { freq: "none", loc: "same", test: false };

export function costOf(choice: Choice): number {
  if (choice.freq === "none") return 0;
  return FREQ[choice.freq].cost + LOC[choice.loc].cost + (choice.test ? TEST_COST : 0);
}

export function planCost(scenario: Scenario, plan: Plan): number {
  return scenario.systems.reduce((sum, system) => sum + costOf(plan[system.id] ?? NO_BACKUP), 0);
}

export const MAX_CHOICE: Choice = { freq: "hourly", loc: "offline", test: true };

export function rpoOf(system: System): number {
  return CHANGE[system.change].rpo;
}

export function rtoOf(system: System): number {
  return CRITICALITY[system.criticality].rto;
}

// ---------- what the incident does to one system ----------

export type Verdict = "recovered" | "partial" | "lost" | "rebuilt";
export type Reason = "ok" | "rebuilt" | "none" | "reached" | "untested";

export type Outcome = Readonly<{
  verdict: Verdict;
  reason: Reason;
  usable: boolean;
  lostHours: number; // work lost; Infinity when nothing came back
  downHours: number; // time until the system was back; Infinity when it never was
  rpoMet: boolean;
  rtoMet: boolean;
  points: number; // 0-100 for this system
}>;

const STEPS = [1, 24, 168];
export const BASE_POINTS = 40; // the copy was usable at all
export const TARGET_POINTS = 30; // each of: loss within tolerance, downtime within tolerance

export function resolve(system: System, choice: Choice): Outcome {
  if (system.rebuildable) {
    return { verdict: "rebuilt", reason: "rebuilt", usable: true, lostHours: 0, downHours: 1, rpoMet: true, rtoMet: true, points: 100 };
  }
  const dead = (reason: Reason): Outcome => ({ verdict: "lost", reason, usable: false, lostHours: Infinity, downHours: Infinity, rpoMet: false, rtoMet: false, points: 0 });
  if (choice.freq === "none") return dead("none");
  if (INCIDENT[system.hit].reaches.includes(choice.loc)) return dead("reached");
  if (system.fragile && !choice.test) return dead("untested");
  const lostHours = FREQ[choice.freq].hours;
  const downHours = LOC[choice.loc].restore * (choice.test ? 1 : UNTESTED_FACTOR);
  const rpo = rpoOf(system);
  const rto = rtoOf(system);
  const over = STEPS.indexOf(lostHours) - STEPS.indexOf(rpo);
  const rpoPoints = over <= 0 ? TARGET_POINTS : over === 1 ? TARGET_POINTS / 2 : 0;
  const rtoPoints = downHours <= rto ? TARGET_POINTS : downHours <= rto * 2 ? TARGET_POINTS / 2 : 0;
  const rpoMet = lostHours <= rpo;
  const rtoMet = downHours <= rto;
  return { verdict: rpoMet && rtoMet ? "recovered" : "partial", reason: "ok", usable: true, lostHours, downHours, rpoMet, rtoMet, points: BASE_POINTS + rpoPoints + rtoPoints };
}

export function hoursLabel(hours: number): string {
  if (!Number.isFinite(hours)) return "everything";
  if (hours === 0) return "nothing";
  if (hours < 24) return `${hours} h`;
  const days = hours / 24;
  return days === 7 ? "1 week" : `${days} day${days === 1 ? "" : "s"}`;
}

export function choiceLabel(choice: Choice): string {
  if (choice.freq === "none") return "No backup";
  return `${FREQ[choice.freq].label} · ${LOC[choice.loc].label} · ${choice.test ? "tested" : "not tested"}`;
}

// One or two plain sentences: what the incident did to this choice, and why.
export function explain(system: System, choice: Choice): string {
  const outcome = resolve(system, choice);
  const incident = INCIDENT[system.hit];
  switch (outcome.reason) {
    case "rebuilt":
      return costOf(choice) > 0
        ? `Rebuilt from the standard image in an hour. It holds nothing unique, so the ${costOf(choice)} spent here bought nothing.`
        : "Rebuilt from the standard image in an hour. It holds nothing unique, so no backup was the right call.";
    case "none":
      return `No copy existed. ${system.lost}`;
    case "reached":
      return `${REACH_WHY[system.hit][choice.loc] ?? "The incident reached the copy."} ${system.lost}`;
    case "untested":
      return `The copy was out of reach of the incident, but nobody had ever restored it. It was taken while the database was open and would not load. ${system.lost}`;
    case "ok": {
      const loss = outcome.rpoMet
        ? `Lost ${hoursLabel(outcome.lostHours)} of work, within what it can stand (${hoursLabel(rpoOf(system))}).`
        : `Lost ${hoursLabel(outcome.lostHours)} of work; it can only stand ${hoursLabel(rpoOf(system))}. Back up more often.`;
      const down = outcome.rtoMet
        ? `Back in ${hoursLabel(outcome.downHours)} (limit ${hoursLabel(rtoOf(system))}).`
        : `Down ${hoursLabel(outcome.downHours)} against a limit of ${hoursLabel(rtoOf(system))}${choice.test ? ": this copy is too slow to restore for this system." : ": the restore had never been practised, so it took twice as long."}`;
      return `The ${LOC[choice.loc].label.toLowerCase()} copy was out of reach of the ${incident.label.toLowerCase()}. ${loss} ${down}`;
    }
  }
}

const REACH_WHY: Record<IncidentKind, Partial<Record<Loc, string>>> = {
  disk: { same: "The copy sat on the disk that died." },
  ransomware: {
    same: "The copy sat on the machine that was encrypted.",
    share: "The ransomware followed the mapped drive and encrypted the network share too. An attached backup is not a backup.",
  },
  delete: {
    same: "The copy on the same server mirrors the live folder, so the delete was copied too.",
    share: "The share keeps 7 days of copies. The delete was three weeks old, so every copy left was already missing the folder.",
  },
  lockout: {
    same: "The copy sat in the same locked account as the live system.",
    cloud: "The cloud copy sat in the same locked account as the live system: one account, one point of failure.",
  },
  takeover: {
    same: "The copy sat on the machine that was encrypted.",
    share: "The ransomware encrypted every network share it could reach.",
    cloud: "The attackers used the stolen admin login to lock the cloud account, backups included.",
  },
};

// ---------- the reference plan ----------

function allChoices(): Choice[] {
  const out: Choice[] = [NO_BACKUP];
  for (const freq of FREQS) {
    if (freq === "none") continue;
    for (const loc of LOCS) for (const test of [false, true]) out.push({ freq, loc, test });
  }
  return out;
}

// The cheapest choice that fully recovers this system from what hits it.
export function bestChoice(system: System): Choice {
  return allChoices()
    .filter((choice) => resolve(system, choice).points === 100)
    .sort((a, b) => costOf(a) - costOf(b))[0];
}

export function bestPlan(scenario: Scenario): Plan {
  return Object.fromEntries(scenario.systems.map((system) => [system.id, bestChoice(system)]));
}

export function sameChoice(a: Choice, b: Choice): boolean {
  if (a.freq === "none" || b.freq === "none") return a.freq === b.freq;
  return a.freq === b.freq && a.loc === b.loc && a.test === b.test;
}

// ---------- scoring one scenario ----------

export type SystemResult = Readonly<{ id: string; choice: Choice; outcome: Outcome; cost: number; matchesBest: boolean }>;

export type RoundResult = Readonly<{
  scenario: string;
  hinted: boolean;
  spent: number;
  budget: number;
  points: number; // 0-100: criticality-weighted recovery
  systems: readonly SystemResult[];
  recovered: number; // fully recovered (or rebuilt)
  lost: number;
  // Learning evidence, counted over the systems that need a backup.
  needing: number;
  copySurvived: number; // a copy existed out of the incident's reach
  frequencyFits: number; // backup gap within what the system can stand
  testsNeeded: number;
  testsPlaced: number; // test restores bought where the reference plan needs one
  wasted: number; // budget spent on systems with nothing to lose
}>;

export function scorePlan(scenario: Scenario, plan: Plan, hinted = false): RoundResult {
  const systems = scenario.systems.map((system): SystemResult => {
    const choice = plan[system.id] ?? NO_BACKUP;
    return { id: system.id, choice, outcome: resolve(system, choice), cost: costOf(choice), matchesBest: sameChoice(choice, bestChoice(system)) };
  });
  const weight = scenario.systems.reduce((sum, system) => sum + system.criticality, 0);
  const earned = scenario.systems.reduce((sum, system, i) => sum + system.criticality * systems[i].outcome.points, 0);
  const need = scenario.systems.map((system, i) => ({ system, result: systems[i] })).filter(({ system }) => !system.rebuildable);
  const needTest = need.filter(({ system }) => bestChoice(system).test);
  return {
    scenario: scenario.id,
    hinted,
    spent: systems.reduce((sum, entry) => sum + entry.cost, 0),
    budget: scenario.budget,
    points: Math.round(earned / weight),
    systems,
    recovered: systems.filter((entry) => entry.outcome.points === 100).length,
    lost: systems.filter((entry) => entry.outcome.verdict === "lost").length,
    needing: need.length,
    copySurvived: need.filter(({ system, result }) => result.choice.freq !== "none" && !INCIDENT[system.hit].reaches.includes(result.choice.loc)).length,
    frequencyFits: need.filter(({ system, result }) => FREQ[result.choice.freq].hours <= rpoOf(system)).length,
    testsNeeded: needTest.length,
    testsPlaced: needTest.filter(({ result }) => result.choice.freq !== "none" && result.choice.test).length,
    wasted: scenario.systems.reduce((sum, system, i) => sum + (system.rebuildable ? systems[i].cost : 0), 0),
  };
}

// ---------- game state ----------

export type GameState = {
  game: Game;
  attempt: number;
  index: number;
  plan: Record<string, Choice>;
  hinted: boolean;
  results: RoundResult[];
  phase: "plan" | "result" | "done";
};

function emptyPlan(scenario: Scenario): Record<string, Choice> {
  return Object.fromEntries(scenario.systems.map((system) => [system.id, NO_BACKUP]));
}

export function createGame(game: Game, attempt = 1): GameState {
  return { game, attempt, index: 0, plan: emptyPlan(game.scenarios[0]), hinted: false, results: [], phase: "plan" };
}

export function currentScenario(state: GameState): Scenario {
  return state.game.scenarios[state.index];
}

// Changes one system's choice. Going over budget is allowed while planning (so choices can be
// rearranged); committing is not.
export function setChoice(state: GameState, id: string, patch: Partial<Choice>): boolean {
  if (state.phase !== "plan" || !(id in state.plan)) return false;
  const before = state.plan[id];
  const after = { ...before, ...patch };
  if (after.freq === "none") {
    // Location and test mean nothing without a backup.
    if (patch.freq !== "none") return false;
    state.plan[id] = NO_BACKUP;
    return true;
  }
  state.plan[id] = after;
  return true;
}

export function spent(state: GameState): number {
  return planCost(currentScenario(state), state.plan);
}

export function canCommit(state: GameState): boolean {
  return state.phase === "plan" && spent(state) <= currentScenario(state).budget;
}

// Hints are free but counted, and only exist in the middle scenario.
export function canHint(state: GameState): boolean {
  return state.phase === "plan" && currentScenario(state).mode === "hints";
}

export function takeHint(state: GameState): boolean {
  if (!canHint(state) || state.hinted) return false;
  state.hinted = true;
  return true;
}

export function commit(state: GameState): RoundResult | null {
  if (!canCommit(state)) return null;
  const result = scorePlan(currentScenario(state), { ...state.plan }, state.hinted);
  state.results.push(result);
  state.phase = "result";
  return result;
}

export function next(state: GameState): void {
  if (state.phase !== "result") return;
  state.hinted = false;
  if (state.index + 1 >= state.game.scenarios.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.plan = emptyPlan(currentScenario(state));
  state.phase = "plan";
}

// ---------- summary: game score and learning evidence kept apart ----------

export type Summary = Readonly<{
  score: number; // game score: sum of scenario points
  max: number;
  lost: number; // systems lost for good
  // Learning evidence: decision accuracy against the rules. Never mixed into the score.
  evidence: Readonly<{
    attempt: number;
    firstAttempt: boolean;
    needing: number;
    copySurvived: number;
    frequencyFits: number;
    testsNeeded: number;
    testsPlaced: number;
    wasted: number;
    finalRecovered: number; // the no-hint scenario on its own
    finalTotal: number;
    hintsUsed: number;
  }>;
}>;

export function summarize(state: GameState): Summary {
  const { results, game } = state;
  const sum = (pick: (result: RoundResult) => number) => results.reduce((total, result) => total + pick(result), 0);
  const finalScenario = game.scenarios.find((scenario) => scenario.mode === "final");
  const final = results.find((result) => result.scenario === finalScenario?.id);
  return {
    score: sum((result) => result.points),
    max: game.scenarios.length * 100,
    lost: sum((result) => result.lost),
    evidence: {
      attempt: state.attempt,
      firstAttempt: state.attempt === 1,
      needing: sum((result) => result.needing),
      copySurvived: sum((result) => result.copySurvived),
      frequencyFits: sum((result) => result.frequencyFits),
      testsNeeded: sum((result) => result.testsNeeded),
      testsPlaced: sum((result) => result.testsPlaced),
      wasted: sum((result) => result.wasted),
      finalRecovered: final?.recovered ?? 0,
      finalTotal: final ? final.systems.length : 0,
      hintsUsed: results.filter((result) => result.hinted).length,
    },
  };
}

// ---------- reference strategies (used by the debrief and the tests) ----------

export type Strategy = (scenario: Scenario) => Plan;

const mapPlan = (scenario: Scenario, pick: (system: System) => Choice): Plan => Object.fromEntries(scenario.systems.map((system) => [system.id, pick(system)]));

export const bestStrategy: Strategy = (scenario) => bestPlan(scenario);
// "Back up everything at maximum": hourly, offline, tested. Never fits the budget.
export const maxEverything: Strategy = (scenario) => mapPlan(scenario, () => MAX_CHOICE);
// "Cheapest everywhere": the cheapest thing that can still be called a backup.
export const cheapestEverywhere: Strategy = (scenario) => mapPlan(scenario, () => ({ freq: "weekly", loc: "same", test: false }));
export const nothingAtAll: Strategy = (scenario) => mapPlan(scenario, () => NO_BACKUP);
// "Put every copy on the network share": the right frequency and tests, one convenient place.
export const allOnShare: Strategy = (scenario) => mapPlan(scenario, (system) => (system.rebuildable ? NO_BACKUP : { ...bestChoice(system), loc: "share" }));
// "Skip every test restore": the right frequency and place, never proven.
export const neverTest: Strategy = (scenario) => mapPlan(scenario, (system) => ({ ...bestChoice(system), test: false }));
// "Cloud for everything".
export const allInCloud: Strategy = (scenario) => mapPlan(scenario, (system) => (system.rebuildable ? NO_BACKUP : { ...bestChoice(system), loc: "cloud" }));
// "Same protection for every system": daily to the cloud, as far as the budget goes (most critical first).
export const flatDaily: Strategy = (scenario) => {
  let left = scenario.budget;
  const plan: Record<string, Choice> = {};
  for (const system of [...scenario.systems].sort((a, b) => b.criticality - a.criticality)) {
    const choice: Choice = { freq: "daily", loc: "cloud", test: false };
    plan[system.id] = costOf(choice) <= left ? choice : NO_BACKUP;
    left -= costOf(plan[system.id]);
  }
  return plan;
};

// Plays a whole game with one strategy. Returns null if any plan does not fit its budget.
export function playStrategy(game: Game, strategy: Strategy): GameState | null {
  const state = createGame(game);
  while (state.phase !== "done") {
    const plan = strategy(currentScenario(state));
    for (const [id, choice] of Object.entries(plan)) {
      if (choice.freq === "none") setChoice(state, id, { freq: "none" });
      else setChoice(state, id, choice);
    }
    if (!commit(state)) return null;
    next(state);
  }
  return state;
}
