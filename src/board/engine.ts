// Confidence Board rules. Pure: no DOM. Points = value × win multiplier, or − value × loss
// multiplier. The multipliers make each confidence level the best choice in its own band of
// real accuracy (see tests), so the score rewards calibration, not bravado.
import { CATEGORIES, CONFIDENCE, type ConfidenceId, type Question } from "./data";

export type Pick = { category: number; row: number; confidence: ConfidenceId; choice: number; correct: boolean; points: number };

export function question(category: number, row: number): Question {
  return CATEGORIES[category].questions[row];
}

export function payout(value: number, confidence: ConfidenceId, correct: boolean): number {
  const level = CONFIDENCE.find((entry) => entry.id === confidence)!;
  return Math.round(correct ? value * level.win : -value * level.lose) || 0;
}

// Expected points per 100 at a given true probability of being right.
export function expected(confidence: ConfidenceId, p: number): number {
  const level = CONFIDENCE.find((entry) => entry.id === confidence)!;
  return p * level.win - (1 - p) * level.lose;
}

export function bestLevel(p: number): ConfidenceId {
  return [...CONFIDENCE].sort((a, b) => expected(b.id, p) - expected(a.id, p))[0].id;
}

export type Calibration = { id: ConfidenceId; label: string; asked: number; right: number };

export function calibration(picks: readonly Pick[]): Calibration[] {
  return CONFIDENCE.map((level) => {
    const own = picks.filter((pick) => pick.confidence === level.id);
    return { id: level.id, label: level.label, asked: own.length, right: own.filter((pick) => pick.correct).length };
  });
}
