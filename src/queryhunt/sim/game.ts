import type { Database } from "sql.js";
import { checkResult, runQuery } from "./sql";
import type { CaseDef, Challenge, Game, Mode, QueryResult, Score, StepLog, VariantId } from "./types";

// Pure progression and scoring. Nothing is unlocked by running a query: a step
// advances query -> pin -> explain, and each gate is checked here.

export const POINTS = {
  query: 100,
  evidence: [50, 25] as const, // per required card: first try, later tries
  interpretation: [50, 25, 10] as const,
  conclusion: [150, 75, 30] as const,
};

const tiered = (tiers: readonly number[], wrongTries: number): number => tiers[Math.min(wrongTries, tiers.length - 1)];

const emptyStep = (): StepLog => ({
  runs: 0,
  sqlErrors: 0,
  mismatches: 0,
  solvedSql: null,
  solvedMode: null,
  pinTries: 0,
  wrongPins: [],
  explainTries: 0,
  wrongExplains: [],
  hints: 0,
  points: { query: 0, evidence: 0, interpretation: 0 },
});

export function createGame(def: CaseDef): Game {
  return {
    variant: def.variant,
    step: 0,
    phase: def.challenges[0].kind === "query" ? "query" : "conclude",
    steps: def.challenges.map(emptyStep),
    evidence: [],
    conclusion: { tries: 0, wrong: [], chosen: null, cited: [], points: 0 },
  };
}

export const otherVariant = (variant: VariantId): VariantId => (variant === "a" ? "b" : "a");

const copy = (game: Game): Game => structuredClone(game);
const current = (def: CaseDef, game: Game): Challenge => def.challenges[game.step];

// ---------- 1. query ----------
export type QueryFeedback =
  // The statement did not run: a SQL problem, not an investigation problem.
  | Readonly<{ kind: "sql-error"; blocked: boolean; message: string; detail?: string }>
  // It ran, but the result does not answer the question.
  | Readonly<{ kind: "mismatch"; message: string; result: QueryResult }>
  | Readonly<{ kind: "match"; result: QueryResult }>;

export function submitQuery(def: CaseDef, game: Game, db: Database, sql: string, mode: Mode): { game: Game; feedback: QueryFeedback } {
  const challenge = current(def, game);
  if (challenge.kind !== "query" || game.phase !== "query") throw new Error("No query is expected now.");
  const next = copy(game);
  const log = next.steps[next.step];
  log.runs += 1;

  const outcome = runQuery(db, sql);
  if (!outcome.ok) {
    log.sqlErrors += 1;
    return { game: next, feedback: { kind: "sql-error", blocked: outcome.kind === "blocked", message: outcome.message, detail: outcome.detail } };
  }
  const expected = runQuery(db, challenge.expectedSql);
  if (!expected.ok) throw new Error(`Reference query for ${challenge.id} failed: ${expected.message}`);
  const check = checkResult(outcome.result, expected.result, challenge.check);
  if (!check.match) {
    log.mismatches += 1;
    return { game: next, feedback: { kind: "mismatch", message: check.message, result: outcome.result } };
  }
  log.solvedSql = sql.trim();
  log.solvedMode = mode;
  log.points.query = POINTS.query;
  next.phase = "pin";
  return { game: next, feedback: { kind: "match", result: outcome.result } };
}

// ---------- 2. pin evidence ----------
export type PinFeedback = Readonly<{
  accepted: boolean;
  pinned: string[];
  // One line per card that needs a comment.
  notes: { id: string; title: string; tone: "wrong" | "optional"; text: string }[];
  missing: number;
  message: string;
}>;

export function pinEvidence(def: CaseDef, game: Game, selected: readonly string[]): { game: Game; feedback: PinFeedback } {
  const challenge = current(def, game);
  if (challenge.kind !== "query" || game.phase !== "pin") throw new Error("Nothing can be pinned now.");
  const next = copy(game);
  const log = next.steps[next.step];
  const chosen = challenge.candidates.filter((c) => selected.includes(c.id));
  const required = challenge.candidates.filter((c) => c.verdict === "relevant");
  const wrong = chosen.filter((c) => c.verdict === "wrong");
  const missing = required.filter((c) => !selected.includes(c.id)).length;
  const notes: PinFeedback["notes"] = chosen
    .filter((c) => c.verdict !== "relevant")
    .map((c) => ({ id: c.id, title: c.title, tone: c.verdict === "wrong" ? "wrong" : "optional", text: c.feedback }));

  if (!chosen.length) {
    return { game, feedback: { accepted: false, pinned: [], notes: [], missing, message: "Select at least one card to pin." } };
  }
  if (wrong.length || missing) {
    log.pinTries += 1;
    wrong.forEach((c) => !log.wrongPins.includes(c.id) && log.wrongPins.push(c.id));
    const message = wrong.length
      ? "Not pinned. Remove the cards below and try again."
      : `Not pinned yet. ${missing === 1 ? "One relevant observation from this result is" : `${missing} relevant observations from this result are`} still missing.`;
    return { game: next, feedback: { accepted: false, pinned: [], notes, missing, message } };
  }
  const pinned = required.map((c) => c.id);
  next.evidence.push(...pinned);
  log.points.evidence = pinned.length * tiered(POINTS.evidence, log.pinTries);
  next.phase = "explain";
  return { game: next, feedback: { accepted: true, pinned, notes, missing: 0, message: "Evidence pinned." } };
}

// ---------- 3. explain the finding ----------
export type ExplainFeedback = Readonly<{ correct: boolean; message: string }>;

function advance(def: CaseDef, game: Game): void {
  game.step += 1;
  game.phase = def.challenges[game.step].kind === "query" ? "query" : "conclude";
}

export function explainFinding(def: CaseDef, game: Game, optionId: string): { game: Game; feedback: ExplainFeedback } {
  const challenge = current(def, game);
  if (challenge.kind !== "query" || game.phase !== "explain") throw new Error("No explanation is expected now.");
  const option = challenge.explain.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option ${optionId}`);
  const next = copy(game);
  const log = next.steps[next.step];
  if (!option.correct) {
    log.explainTries += 1;
    if (!log.wrongExplains.includes(option.id)) log.wrongExplains.push(option.id);
    return { game: next, feedback: { correct: false, message: option.feedback } };
  }
  log.points.interpretation = tiered(POINTS.interpretation, log.explainTries);
  advance(def, next);
  return { game: next, feedback: { correct: true, message: option.feedback } };
}

// ---------- 5. conclusion ----------
export type ConcludeFeedback = Readonly<{ correct: boolean; conclusion: string | null; evidence: string | null }>;

export function conclude(def: CaseDef, game: Game, optionId: string, cited: readonly string[]): { game: Game; feedback: ConcludeFeedback } {
  const challenge = current(def, game);
  if (challenge.kind !== "conclusion" || game.phase !== "conclude") throw new Error("No conclusion is expected now.");
  const option = challenge.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option ${optionId}`);
  const held = cited.filter((id) => game.evidence.includes(id));
  const fb = challenge.evidenceFeedback;
  const has = (id: string): boolean => held.includes(id);
  let evidence: string | null = null;
  if (!held.length) evidence = fb.none;
  else if (held.every((id) => challenge.attemptsOnly.includes(id))) evidence = fb.attemptsOnly;
  else if (!has("E3")) evidence = fb.missingSuccess;
  else if (!challenge.requiredEvidence.every(has)) evidence = fb.missingActivity;

  const next = copy(game);
  const correct = option.correct && evidence === null;
  if (!correct) {
    next.conclusion.tries += 1;
    if (!option.correct && !next.conclusion.wrong.includes(option.id)) next.conclusion.wrong.push(option.id);
    // A right conclusion without its evidence earns nothing: it could be a guess.
    return { game: next, feedback: { correct: false, conclusion: option.correct ? null : option.feedback, evidence } };
  }
  next.conclusion.chosen = option.id;
  next.conclusion.cited = held;
  next.conclusion.points = tiered(POINTS.conclusion, next.conclusion.tries);
  next.phase = "done";
  return { game: next, feedback: { correct: true, conclusion: option.feedback, evidence: null } };
}

// ---------- hints and score ----------
// Hints are free: they are counted and reported, never deducted.
export function useHint(def: CaseDef, game: Game): { game: Game; hint: string | null } {
  const challenge = current(def, game);
  const used = game.steps[game.step].hints;
  if (used >= challenge.hints.length) return { game, hint: null };
  const next = copy(game);
  next.steps[next.step].hints += 1;
  return { game: next, hint: challenge.hints[used] };
}

export function scoreOf(def: CaseDef, game: Game): Score {
  const sum = (pick: (s: StepLog) => number): number => game.steps.reduce((total, s) => total + pick(s), 0);
  const queries = def.challenges.filter((c) => c.kind === "query");
  const cards = queries.reduce((n, c) => n + (c.kind === "query" ? c.candidates.filter((x) => x.verdict === "relevant").length : 0), 0);
  const query = sum((s) => s.points.query);
  const evidence = sum((s) => s.points.evidence);
  const interpretation = sum((s) => s.points.interpretation);
  return {
    query,
    evidence,
    interpretation,
    conclusion: game.conclusion.points,
    total: query + evidence + interpretation + game.conclusion.points,
    max: queries.length * POINTS.query + cards * POINTS.evidence[0] + queries.length * POINTS.interpretation[0] + POINTS.conclusion[0],
    hints: sum((s) => s.hints),
  };
}

// Challenges whose discovery is complete (their map node is lit).
export function completedSteps(game: Game): number {
  return game.phase === "done" ? game.steps.length : game.step;
}
