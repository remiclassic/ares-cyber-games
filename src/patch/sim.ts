// Patch Tuesday: risk-based patch prioritisation. Pure rules; no DOM.
// Each round shows five vulnerabilities; the learner has budget to patch three. Risk is
// likelihood x impact, so the headline severity score is only one of four factors and
// "patch the highest score first" is a losing plan by design (docs/design/PATCH_TUESDAY.md).

export type Exposure = "internet" | "internal";
export type Exploit = "itw" | "poc" | "none";
export type Criticality = 1 | 2 | 3;

export const EXPOSURE: Record<Exposure, { label: string; weight: number; rule: string }> = {
  internet: { label: "Internet-facing", weight: 2, rule: "Anyone on the internet can reach it, including automated scanners." },
  internal: { label: "Internal only", weight: 1, rule: "Reachable only from inside the network: an attacker needs a foothold first." },
};

export const EXPLOIT: Record<Exploit, { label: string; weight: number; rule: string }> = {
  itw: { label: "Exploited in the wild", weight: 5, rule: "Attackers are using it right now. The strongest single signal of near-term risk." },
  poc: { label: "Public proof of concept", weight: 2.5, rule: "Working exploit code is published. Weaponisation is usually days away." },
  none: { label: "No known exploit", weight: 1, rule: "No public exploit code and no reports of attacks yet." },
};

export const CRITICALITY: Record<Criticality, { label: string; rule: string }> = {
  1: { label: "Low", rule: "Losing it is an inconvenience: test boxes, kiosks, printers." },
  2: { label: "Important", rule: "A business service people rely on every day." },
  3: { label: "Crown jewel", rule: "Patient data, money, identity or the systems that control everything else." },
};

export type Vuln = Readonly<{
  id: string; // fictional advisory id
  asset: string; // what is affected, as the learner sees it
  product: string;
  flaw: string; // one-line description of the bug
  cvss: number; // 0-10, CVSS-like base severity
  exposure: Exposure;
  exploit: Exploit;
  criticality: Criticality;
  breach: string; // what happens if it is left unpatched and attacked (authored)
  why: string; // one-line evidence-based explanation (authored)
}>;

export type Round = Readonly<{
  id: string;
  title: string;
  mode: "guided" | "hints" | "final";
  lesson: string;
  vulns: readonly Vuln[];
}>;

export type Scenario = Readonly<{ id: string; title: string; org: string; budget: number; rounds: readonly Round[] }>;

// ---------- the risk model ----------

export function severityLabel(cvss: number): "Critical" | "High" | "Medium" | "Low" {
  return cvss >= 9 ? "Critical" : cvss >= 7 ? "High" : cvss >= 4 ? "Medium" : "Low";
}

export function likelihood(vuln: Vuln): number {
  return EXPLOIT[vuln.exploit].weight * EXPOSURE[vuln.exposure].weight;
}

export function impact(vuln: Vuln): number {
  return (vuln.cvss / 10) * vuln.criticality;
}

export function risk(vuln: Vuln): number {
  return Math.round(likelihood(vuln) * impact(vuln) * 100) / 100;
}

export type Band = "Low" | "Medium" | "High" | "Very high";

export function likelihoodBand(vuln: Vuln): Band {
  const value = likelihood(vuln);
  return value >= 10 ? "Very high" : value >= 5 ? "High" : value >= 2 ? "Medium" : "Low";
}

export function impactBand(vuln: Vuln): Band {
  const value = impact(vuln);
  return value >= 2.4 ? "Very high" : value >= 1.6 ? "High" : value >= 0.8 ? "Medium" : "Low";
}

// What happens this month to an unpatched item. Deterministic so the lesson is the same every time.
export type Outcome = "patched" | "breach" | "attempt" | "quiet";
export const BREACH_AT = 8;
export const ATTEMPT_AT = 3.2;

export function outcomeOf(vuln: Vuln, patched: boolean): Outcome {
  if (patched) return "patched";
  const value = risk(vuln);
  return value >= BREACH_AT ? "breach" : value >= ATTEMPT_AT ? "attempt" : "quiet";
}

export function consequence(vuln: Vuln, patched: boolean): string {
  switch (outcomeOf(vuln, patched)) {
    case "patched":
      return outcomeOf(vuln, false) === "breach"
        ? "Patched in time: attackers tried it this month and hit a closed door."
        : outcomeOf(vuln, false) === "attempt"
          ? "Patched: it was probed this month, so the patch stopped real attempts."
          : "Patched, but nothing was trying it yet: this slot bought little this month.";
    case "breach":
      return vuln.breach;
    case "attempt":
      return "Probed and attempted, but not yet breached. Patch it next window.";
    case "quiet":
      return "Quiet this month: no one reached it or tried it. Safe to defer and schedule.";
  }
}

// The three highest-risk items: the plan the game rewards.
export function bestPlan(round: Round, budget: number): string[] {
  return [...round.vulns]
    .sort((a, b) => risk(b) - risk(a))
    .slice(0, budget)
    .map((vuln) => vuln.id);
}

// The decoy: the highest-severity item that should NOT be patched this round.
export function decoyOf(round: Round, budget: number): Vuln | undefined {
  const best = new Set(bestPlan(round, budget));
  return [...round.vulns].filter((vuln) => !best.has(vuln.id)).sort((a, b) => b.cvss - a.cvss)[0];
}

// ---------- game state ----------

export type RoundResult = Readonly<{
  round: string;
  picks: readonly string[];
  hinted: boolean;
  points: number; // 0-100: share of the round's removable risk the learner removed
  removed: number;
  best: number;
  correct: number; // picks that are in the best plan (learning evidence)
  decoyAvoided: boolean;
  breaches: number;
}>;

export type GameState = {
  scenario: Scenario;
  attempt: number;
  index: number;
  selected: string[];
  hinted: boolean;
  results: RoundResult[];
  phase: "pick" | "result" | "done";
};

export function createGame(scenario: Scenario, attempt = 1): GameState {
  return { scenario, attempt, index: 0, selected: [], hinted: false, results: [], phase: "pick" };
}

export function currentRound(state: GameState): Round {
  return state.scenario.rounds[state.index];
}

export function toggle(state: GameState, id: string): boolean {
  if (state.phase !== "pick" || !currentRound(state).vulns.some((vuln) => vuln.id === id)) return false;
  const at = state.selected.indexOf(id);
  if (at >= 0) state.selected.splice(at, 1);
  else if (state.selected.length < state.scenario.budget) state.selected.push(id);
  else return false;
  return true;
}

// Hints are free but counted, and unavailable in the final round.
export function canHint(state: GameState): boolean {
  return state.phase === "pick" && currentRound(state).mode === "hints";
}

export function takeHint(state: GameState): boolean {
  if (!canHint(state)) return false;
  state.hinted = true;
  return true;
}

export function scorePlan(round: Round, picks: readonly string[], budget: number, hinted = false): RoundResult {
  const best = bestPlan(round, budget);
  const chosen = round.vulns.filter((vuln) => picks.includes(vuln.id));
  const removed = chosen.reduce((sum, vuln) => sum + risk(vuln), 0);
  const max = round.vulns.filter((vuln) => best.includes(vuln.id)).reduce((sum, vuln) => sum + risk(vuln), 0);
  const decoy = decoyOf(round, budget);
  return {
    round: round.id,
    picks: [...picks],
    hinted,
    points: Math.round((100 * removed) / max),
    removed: Math.round(removed * 100) / 100,
    best: Math.round(max * 100) / 100,
    correct: picks.filter((id) => best.includes(id)).length,
    decoyAvoided: !decoy || !picks.includes(decoy.id),
    breaches: round.vulns.filter((vuln) => outcomeOf(vuln, picks.includes(vuln.id)) === "breach").length,
  };
}

export function commit(state: GameState): RoundResult | null {
  if (state.phase !== "pick" || state.selected.length !== state.scenario.budget) return null;
  const result = scorePlan(currentRound(state), state.selected, state.scenario.budget, state.hinted);
  state.results.push(result);
  state.phase = "result";
  return result;
}

export function next(state: GameState): void {
  if (state.phase !== "result") return;
  state.selected = [];
  state.hinted = false;
  if (state.index + 1 >= state.scenario.rounds.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.phase = "pick";
}

// ---------- summary: game score and learning evidence kept apart ----------

export type Summary = Readonly<{
  score: number; // game score: sum of round points
  max: number;
  breaches: number;
  // Learning evidence: accuracy of the committed picks against the best plan. Not mixed into score.
  evidence: Readonly<{
    attempt: number;
    firstAttempt: boolean;
    correct: number;
    total: number;
    accuracy: number; // 0-1
    decoysAvoided: number;
    finalCorrect: number; // the no-hint round on its own
    finalTotal: number;
    hintsUsed: number;
  }>;
}>;

export function summarize(state: GameState): Summary {
  const { results, scenario } = state;
  const budget = scenario.budget;
  const finalRound = scenario.rounds.find((round) => round.mode === "final");
  const final = results.find((result) => result.round === finalRound?.id);
  const correct = results.reduce((sum, result) => sum + result.correct, 0);
  const total = results.length * budget;
  return {
    score: results.reduce((sum, result) => sum + result.points, 0),
    max: scenario.rounds.length * 100,
    breaches: results.reduce((sum, result) => sum + result.breaches, 0),
    evidence: {
      attempt: state.attempt,
      firstAttempt: state.attempt === 1,
      correct,
      total,
      accuracy: total ? correct / total : 0,
      decoysAvoided: results.filter((result) => result.decoyAvoided).length,
      finalCorrect: final?.correct ?? 0,
      finalTotal: final ? budget : 0,
      hintsUsed: results.filter((result) => result.hinted).length,
    },
  };
}

// ---------- reference strategies (used by the debrief and the tests) ----------

export type Strategy = (round: Round, budget: number) => string[];

export const byHighestScore: Strategy = (round, budget) =>
  [...round.vulns]
    .sort((a, b) => b.cvss - a.cvss)
    .slice(0, budget)
    .map((vuln) => vuln.id);

export function playStrategy(scenario: Scenario, strategy: Strategy): GameState {
  const state = createGame(scenario);
  while (state.phase !== "done") {
    for (const id of strategy(currentRound(state), scenario.budget)) toggle(state, id);
    commit(state);
    next(state);
  }
  return state;
}
