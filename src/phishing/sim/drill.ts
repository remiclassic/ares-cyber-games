import { createRng, shuffle } from "../../sim/rng";
import type { Decision, Message, Quality, Rating, Verdict, Summary } from "./types";

// Pure scoring for the drill (no DOM). Accuracy carries the score; evidence and
// streaks reward explaining the decision; speed is a small bonus that only a
// fully correct decision can earn.
export const ACCURACY_POINTS = 100;
export const PARTIAL_SAFE_POINTS = 50;
export const PARTIAL_REPORT_POINTS = 40;
export const EVIDENCE_POINTS = 20;
export const MAX_EVIDENCE = 2;
export const STREAK_STEP = 10;
export const STREAK_CAP = 3;
export const SPEED_MAX = 20;
export const PAR_SECONDS = 60;

export function bestResponse(message: Message): Verdict {
  if (message.category === "phish") return "report";
  if (message.category === "legit") return "safe";
  return "verify";
}

function accuracy(message: Message, response: Verdict): { points: number; quality: Quality } {
  if (response === bestResponse(message)) return { points: ACCURACY_POINTS, quality: "correct" };
  // Checking through a trusted channel is never dangerous, only slower than needed.
  if (response === "verify") return { points: PARTIAL_SAFE_POINTS, quality: "partial" };
  // Reporting an unverified request that turns out to be malicious keeps the
  // organization safe, but the learner did not establish that before acting.
  if (message.category === "verify" && response === "report" && message.outcome === "malicious") {
    return { points: PARTIAL_REPORT_POINTS, quality: "partial" };
  }
  return { points: 0, quality: "wrong" };
}

export function speedBonus(seconds: number, guided: boolean): number {
  if (guided) return 0;
  return Math.round(SPEED_MAX * Math.max(0, 1 - seconds / PAR_SECONDS));
}

export function scoreDecision(
  message: Message,
  response: Verdict,
  evidence: readonly string[],
  seconds: number,
  streakBefore: number,
): Decision {
  const picked = [...new Set(evidence)].slice(0, MAX_EVIDENCE);
  const cue = (id: string) => message.cues.find((c) => c.id === id);
  const strongPicked = picked.filter((id) => cue(id)?.strength === "strong");
  const weakPicked = picked.filter((id) => cue(id)?.strength === "weak");
  // A strong cue only counts as missed if there was an evidence slot left for it.
  const missedCues =
    strongPicked.length >= MAX_EVIDENCE
      ? []
      : message.cues.filter((c) => c.strength === "strong" && !picked.includes(c.id)).map((c) => c.id);

  const { points: accuracyPoints, quality } = accuracy(message, response);
  const correct = quality === "correct";
  const evidencePoints = correct ? strongPicked.length * EVIDENCE_POINTS : 0;
  // The evidence streak needs a correct decision backed by at least one relevant cue.
  const streakAfter = correct && strongPicked.length > 0 ? streakBefore + 1 : 0;
  const streakPoints = streakAfter > 1 ? STREAK_STEP * Math.min(streakAfter - 1, STREAK_CAP) : 0;
  const speed = correct ? speedBonus(seconds, !!message.guided) : 0;

  return {
    messageId: message.id,
    response,
    best: bestResponse(message),
    quality,
    evidence: picked,
    strongPicked,
    weakPicked,
    missedCues,
    seconds,
    points: {
      accuracy: accuracyPoints,
      evidence: evidencePoints,
      streak: streakPoints,
      speed,
      total: accuracyPoints + evidencePoints + streakPoints + speed,
    },
    streakAfter,
  };
}

// Batch 1 keeps its teaching order; later batches are shuffled per seed.
export function orderMessages(messages: readonly Message[], seed: string): Message[] {
  const rng = createRng(seed);
  const ordered: Message[] = [];
  for (const batch of [1, 2, 3] as const) {
    const group = messages.filter((m) => m.batch === batch);
    ordered.push(...(batch === 1 ? group : shuffle(rng, group)));
  }
  return ordered;
}

// Score of a perfect run without any speed bonus: the yardstick for ratings.
export function parScore(order: readonly Message[]): number {
  let streak = 0;
  let total = 0;
  for (const message of order) {
    const strong = message.cues.filter((c) => c.strength === "strong").slice(0, MAX_EVIDENCE).map((c) => c.id);
    const decision = scoreDecision(message, bestResponse(message), strong, PAR_SECONDS, streak);
    streak = decision.streakAfter;
    total += decision.points.total;
  }
  return total;
}

export function ratingFor(ratio: number): Rating {
  if (ratio >= 0.85) return "guardian";
  if (ratio >= 0.6) return "analyst";
  if (ratio >= 0.35) return "trainee";
  return "novice";
}

export function summarize(order: readonly Message[], decisions: readonly Decision[]): Summary {
  const sum = (pick: (d: Decision) => number) => decisions.reduce((n, d) => n + pick(d), 0);
  const byId = new Map(order.map((m) => [m.id, m]));
  const count = (test: (d: Decision, m: Message) => boolean) =>
    decisions.filter((d) => test(d, byId.get(d.messageId)!)).length;
  const total = sum((d) => d.points.total);
  const par = parScore(order);
  const ratio = par > 0 ? total / par : 0;
  return {
    total,
    parScore: par,
    ratio,
    rating: ratingFor(ratio),
    correct: count((d) => d.quality === "correct"),
    partial: count((d) => d.quality === "partial"),
    wrong: count((d) => d.quality === "wrong"),
    accuracyPoints: sum((d) => d.points.accuracy),
    evidencePoints: sum((d) => d.points.evidence),
    streakPoints: sum((d) => d.points.streak),
    speedPoints: sum((d) => d.points.speed),
    bestStreak: decisions.reduce((n, d) => Math.max(n, d.streakAfter), 0),
    falseAlarms: count((d, m) => d.response === "report" && (m.category === "legit" || m.outcome === "legitimate")),
    missedPhish: count((d, m) => d.response === "safe" && (m.category === "phish" || m.outcome === "malicious")),
    skippedVerification: count((d, m) => m.category === "verify" && d.response !== "verify"),
  };
}
