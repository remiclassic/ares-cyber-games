// Insider or Accident: a data-loss alert names an employee. Spend a limited pool of checks on
// evidence sources, then classify the case, cite the evidence that supports the call, and choose a
// proportionate response. Pure rules; no DOM.
//
// Rules that teach:
// - A call only counts when it rests on evidence you actually pulled and cited. Deciding blind
//   scores almost nothing, even when the guess is right.
// - The check pool is shared by every case and is far smaller than "everything, every time".
// - Every response moves two meters. Treating a colleague as a suspect without cause costs staff
//   trust (and carries a legal cost in the outcome); under-reacting to real loss raises exposure.

export type Source = "log" | "role" | "hr" | "manager" | "ticket" | "dest" | "timing" | "friction";

export const SOURCES: readonly Readonly<{ id: Source; name: string; asks: string }>[] = [
  { id: "log", name: "Audit log", asks: "What exactly happened, and when?" },
  { id: "role", name: "Role and project", asks: "Does their job need this data?" },
  { id: "hr", name: "HR context", asks: "On notice, new starter, or nothing?" },
  { id: "manager", name: "Manager's account", asks: "What does their manager say?" },
  { id: "ticket", name: "Ticket system", asks: "Was there an approved request?" },
  { id: "dest", name: "Data destination", asks: "Where did the data end up?" },
  { id: "timing", name: "Timing and device", asks: "Does it fit how they normally work?" },
  { id: "friction", name: "Policy and tooling", asks: "Was the right way hard or impossible?" },
];

export type Classification = "mistake" | "gap" | "negligent" | "malicious" | "compromised" | "authorised";

export const CLASSES: readonly Readonly<{ id: Classification; name: string; rule: string }>[] = [
  { id: "mistake", name: "Honest mistake", rule: "A slip while doing the job properly. No intent, no pattern." },
  { id: "gap", name: "Process or policy gap", rule: "The approved way was missing, broken or never explained." },
  { id: "negligent", name: "Negligent shortcut", rule: "Knew the rule, had a working approved way, took the easy one anyway." },
  { id: "malicious", name: "Malicious insider", rule: "Deliberately took data for a purpose the job does not need." },
  { id: "compromised", name: "Compromised account", rule: "An outsider acting with the employee's credentials." },
  { id: "authorised", name: "Authorised work", rule: "Approved, expected activity that only looks alarming." },
];

export type Response = "coach" | "fix" | "investigate" | "reset" | "close";

export const RESPONSES: readonly Readonly<{ id: Response; name: string; rule: string }>[] = [
  { id: "coach", name: "Coach the person", rule: "A recorded conversation with their manager, with retraining where needed." },
  { id: "fix", name: "Fix the process", rule: "Change the tool or policy that made the right way hard." },
  { id: "investigate", name: "Restrict and investigate", rule: "Suspend access, preserve evidence, hand to HR and legal." },
  { id: "reset", name: "Reset and treat as external", rule: "Revoke sessions, reset credentials, run it as an intrusion." },
  { id: "close", name: "Close as no issue", rule: "Record why and take no further action." },
];

export type Grade = "best" | "ok" | "poor";

// Deltas are applied to the meters: trust down is bad, exposure up is bad.
export type Outcome = Readonly<{ grade: Grade; trust: number; exposure: number; text: string }>;

export type Case = Readonly<{
  id: string;
  title: string; // neutral: never gives the answer away
  person: string;
  job: string;
  alert: string;
  guided?: boolean;
  hint?: string; // absent on the final, no-hint cases
  facts: Readonly<Record<Source, string>>;
  truth: Classification;
  truthText: string; // what it turned out to be
  supports: readonly Source[]; // facts that genuinely support the true classification
  deciding: readonly Source[]; // the pair that separates this case from its look-alikes
  outcomes: Readonly<Record<Response, Outcome>>;
  lesson: string;
}>;

export type Scenario = Readonly<{
  id: string;
  title: string;
  org: string;
  brief: string;
  budget: number; // checks for the whole shift, shared by every case
  start: Readonly<{ trust: number; exposure: number }>;
  cases: readonly Case[];
}>;

export type Filing = Readonly<{ classification: Classification; cites: readonly Source[]; response: Response }>;

export type GameState = {
  scenario: Scenario;
  index: number; // case on the desk
  checksLeft: number;
  checked: Record<string, Source[]>; // case id -> sources, in the order they were pulled
  filings: Record<string, Filing>;
  phase: "play" | "done";
};

export const MAX_CITES = 2;

// Per case: 4 for the classification, 1 per supporting fact cited (max 2), 4 for the response.
export const POINTS = {
  classification: 4,
  cite: 1,
  response: { best: 4, ok: 2, poor: 0 } as Readonly<Record<Grade, number>>,
  perCase: 10,
} as const;

// A run passes only with a good score AND both meters inside their limits.
export const THRESHOLDS = { score: 70, minTrust: 45, maxExposure: 60 } as const;

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, checksLeft: scenario.budget, checked: {}, filings: {}, phase: "play" };
}

export function currentCase(state: GameState): Case {
  return state.scenario.cases[state.index];
}

export function checkedFor(state: GameState, caseId: string): readonly Source[] {
  return state.checked[caseId] ?? [];
}

export function isFiled(state: GameState, caseId: string): boolean {
  return caseId in state.filings;
}

export function canCheck(state: GameState, source: Source): boolean {
  const entry = currentCase(state);
  return state.phase === "play" && !isFiled(state, entry.id) && state.checksLeft > 0 && !checkedFor(state, entry.id).includes(source);
}

// Spend one check on a source for the case on the desk. Returns the fact, or null if not allowed.
export function check(state: GameState, source: Source): string | null {
  if (!canCheck(state, source)) return null;
  const entry = currentCase(state);
  (state.checked[entry.id] ??= []).push(source);
  state.checksLeft -= 1;
  return entry.facts[source];
}

export type CaseResult = Readonly<{
  caseId: string;
  filed: boolean;
  classRight: boolean;
  supported: boolean; // at least one cited fact genuinely supports the true reading
  citesRight: number;
  classPoints: number;
  citePoints: number;
  responsePoints: number;
  points: number;
  grade: Grade;
  outcome: Outcome | null;
  checks: number;
  skippedDeciding: readonly Source[]; // deciding evidence never pulled
  unchecked: readonly Source[];
}>;

export function gradeCase(entry: Case, checked: readonly Source[], filing: Filing | undefined): CaseResult {
  const skippedDeciding = entry.deciding.filter((source) => !checked.includes(source));
  const unchecked = SOURCES.map((source) => source.id).filter((source) => !checked.includes(source));
  if (!filing) {
    return { caseId: entry.id, filed: false, classRight: false, supported: false, citesRight: 0, classPoints: 0, citePoints: 0, responsePoints: 0, points: 0, grade: "poor", outcome: null, checks: checked.length, skippedDeciding, unchecked };
  }
  const cites = [...new Set(filing.cites)].filter((source) => checked.includes(source)).slice(0, MAX_CITES);
  const citesRight = cites.filter((source) => entry.supports.includes(source)).length;
  const supported = citesRight > 0;
  const classRight = filing.classification === entry.truth;
  const outcome = entry.outcomes[filing.response];
  // An unsupported classification earns nothing, and an unsupported response earns half: a call
  // nobody can justify does not stand, even when it happens to be right.
  const classPoints = classRight && supported ? POINTS.classification : 0;
  const citePoints = citesRight * POINTS.cite;
  const responsePoints = supported ? POINTS.response[outcome.grade] : POINTS.response[outcome.grade] / 2;
  return { caseId: entry.id, filed: true, classRight, supported, citesRight, classPoints, citePoints, responsePoints, points: classPoints + citePoints + responsePoints, grade: outcome.grade, outcome, checks: checked.length, skippedDeciding, unchecked };
}

// File the decision on the case on the desk. Final. Cites must be facts you pulled (max 2).
export function fileCase(state: GameState, filing: Filing): CaseResult | null {
  const entry = currentCase(state);
  if (state.phase !== "play" || isFiled(state, entry.id)) return null;
  const checked = checkedFor(state, entry.id);
  if (filing.cites.length > MAX_CITES || filing.cites.some((source) => !checked.includes(source))) return null;
  state.filings[entry.id] = { classification: filing.classification, cites: [...new Set(filing.cites)], response: filing.response };
  return gradeCase(entry, checked, state.filings[entry.id]);
}

// Move to the next case once the current one is filed; after the last one the shift is done.
export function advance(state: GameState): boolean {
  if (state.phase !== "play" || !isFiled(state, currentCase(state).id)) return false;
  if (state.index >= state.scenario.cases.length - 1) state.phase = "done";
  else state.index += 1;
  return true;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function meters(state: GameState): { trust: number; exposure: number } {
  let { trust, exposure } = state.scenario.start;
  for (const entry of state.scenario.cases) {
    const filing = state.filings[entry.id];
    if (!filing) continue;
    trust = clamp(trust + entry.outcomes[filing.response].trust);
    exposure = clamp(exposure + entry.outcomes[filing.response].exposure);
  }
  return { trust, exposure };
}

export type Score = Readonly<{
  total: number; // 0-100
  raw: number;
  max: number;
  classPoints: number;
  citePoints: number;
  responsePoints: number;
  trust: number;
  exposure: number;
  passed: boolean;
  reasons: readonly string[];
  cases: readonly CaseResult[];
  checksUsed: number;
}>;

export function score(state: GameState): Score {
  const cases = state.scenario.cases.map((entry) => gradeCase(entry, checkedFor(state, entry.id), state.filings[entry.id]));
  const sum = (pick: (result: CaseResult) => number) => cases.reduce((total, result) => total + pick(result), 0);
  const raw = sum((result) => result.points);
  const max = cases.length * POINTS.perCase;
  const total = Math.round((raw / max) * 100);
  const { trust, exposure } = meters(state);
  const reasons: string[] = [];
  if (total < THRESHOLDS.score) reasons.push(`Score ${total} is under the pass mark of ${THRESHOLDS.score}.`);
  if (trust < THRESHOLDS.minTrust) reasons.push(`Staff trust fell to ${trust}: colleagues were treated as suspects without the evidence for it.`);
  if (exposure > THRESHOLDS.maxExposure) reasons.push(`Data exposure rose to ${exposure}: real loss was left unaddressed.`);
  return { total, raw, max, classPoints: sum((r) => r.classPoints), citePoints: sum((r) => r.citePoints), responsePoints: sum((r) => r.responsePoints), trust, exposure, passed: reasons.length === 0, reasons, cases, checksUsed: state.scenario.budget - state.checksLeft };
}

// Learning evidence: what the player's choices show about the skill. Reported next to the score,
// never folded into it.
export type Learning = Readonly<{
  filed: number;
  total: number;
  classRight: number;
  supportedCalls: number; // calls resting on at least one genuinely supporting fact
  blindCalls: readonly string[]; // filed with no checks at all
  decidingFound: number;
  decidingTotal: number;
  proportionate: number; // best responses
  overAccused: readonly string[]; // called malicious, or sent to HR/legal, when it was not
  underReacted: readonly string[]; // coached, fixed or closed a real theft or intrusion
  checksPerCase: readonly number[];
}>;

export function learning(state: GameState): Learning {
  const results = score(state).cases;
  const cases = state.scenario.cases;
  const filedIds = cases.filter((entry) => isFiled(state, entry.id));
  const serious = (entry: Case) => entry.truth === "malicious" || entry.truth === "compromised";
  return {
    filed: filedIds.length,
    total: cases.length,
    classRight: results.filter((result) => result.classRight).length,
    supportedCalls: results.filter((result) => result.supported).length,
    blindCalls: filedIds.filter((entry) => checkedFor(state, entry.id).length === 0).map((entry) => entry.id),
    decidingFound: cases.reduce((total, entry) => total + entry.deciding.filter((source) => checkedFor(state, entry.id).includes(source)).length, 0),
    decidingTotal: cases.reduce((total, entry) => total + entry.deciding.length, 0),
    proportionate: results.filter((result) => result.filed && result.grade === "best").length,
    overAccused: filedIds.filter((entry) => entry.truth !== "malicious" && (state.filings[entry.id].classification === "malicious" || state.filings[entry.id].response === "investigate")).map((entry) => entry.id),
    underReacted: filedIds.filter((entry) => serious(entry) && ["coach", "fix", "close"].includes(state.filings[entry.id].response)).map((entry) => entry.id),
    checksPerCase: cases.map((entry) => checkedFor(state, entry.id).length),
  };
}

export function bestResponses(entry: Case): Response[] {
  return RESPONSES.map((response) => response.id).filter((id) => entry.outcomes[id].grade === "best");
}
