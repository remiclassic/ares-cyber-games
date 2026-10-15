import type { PuzzleScore } from "./types";

export const POINTS = {
  solve: 100,
  minimal: 60,
  withinBudget: 20,
  prediction: 10,
  explanation: 40,
  failedVerify: 15,
} as const;

export type ScoreInput = Readonly<{
  changesUsed: number;
  par: number;
  correctPredictions: number;
  explainedFirstTry: boolean;
  failedVerifies: number;
}>;

// Scores a solved puzzle. Rewards a minimal fix and a correct explanation;
// guessing with the Verify button costs points but never below the solve award.
export function scorePuzzle(input: ScoreInput): PuzzleScore {
  const solve = POINTS.solve;
  const precision = input.changesUsed <= input.par ? POINTS.minimal : POINTS.withinBudget;
  const predictions = input.correctPredictions * POINTS.prediction;
  const explanation = input.explainedFirstTry ? POINTS.explanation : 0;
  const penalty = Math.min(input.failedVerifies * POINTS.failedVerify, precision + predictions + explanation);
  return { solve, precision, predictions, explanation, penalty, total: solve + precision + predictions + explanation - penalty };
}

export function maxScore(checks: number): number {
  return POINTS.solve + POINTS.minimal + checks * POINTS.prediction + POINTS.explanation;
}
