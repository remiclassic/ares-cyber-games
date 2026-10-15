// Secure Stack rules. Pure: no DOM, no physics. The pile's contents are planned here so every
// threat on the board always has a defence that can stop it.

import { COUNTERS, LEVELS, counters, mismatch, sticker, type Level } from "./data";

export type Rng = () => number;

export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

export function defencesFor(level: Level, threat: string): string[] {
  return level.defences.filter((id) => counters(threat, id));
}

// Goal threats come up more often, so the goals are always reachable.
function nextThreat(level: Level, rng: Rng): string {
  const pool = [...level.threats, ...level.goals.map((goal) => goal.threat), ...level.goals.map((goal) => goal.threat)];
  return pick(rng, pool);
}

export function startingPile(level: Level, rng: Rng): string[] {
  const out: string[] = [];
  for (let i = 0; i < level.unknowns; i += 1) out.push("unknown");
  while (out.length + 2 <= level.start) {
    const threat = nextThreat(level, rng);
    out.push(threat, pick(rng, defencesFor(level, threat)));
  }
  // An odd slot left over gets a spare defence (useful once an unknown is revealed).
  if (out.length < level.start) out.push(pick(rng, defencesFor(level, nextThreat(level, rng))));
  // Shuffle so pairs are not dropped side by side.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// What the tide drops next: a defence for any threat left without one, otherwise a threat or a
// useful defence.
export function nextSpawn(level: Level, pile: readonly string[], rng: Rng): string {
  const threats = pile.filter((id) => sticker(id).kind === "threat" && id !== "unknown");
  const orphan = threats.find((threat) => !pile.some((id) => counters(threat, id)));
  if (orphan) return pick(rng, defencesFor(level, orphan));
  if (threats.length && rng() < 0.4) return pick(rng, defencesFor(level, pick(rng, threats)));
  return nextThreat(level, rng);
}

export function revealUnknown(level: Level, rng: Rng): string {
  return nextThreat(level, rng);
}

export type Match = Readonly<{ ok: true; threat: string; defence: string; reason: string }> | Readonly<{ ok: false; reason: string }>;

export function tryMatch(a: string, b: string): Match {
  const one = sticker(a);
  const two = sticker(b);
  const threat = one.kind === "threat" ? a : b;
  const defence = one.kind === "threat" ? b : a;
  if (one.kind !== two.kind && counters(threat, defence)) return { ok: true, threat, defence, reason: COUNTERS[threat][defence] };
  return { ok: false, reason: mismatch(a, b) };
}

// ---------- level progress ----------

export const STREAK_WINDOW = 3.5; // seconds between matches to keep a streak going

export type Mixup = Readonly<{ a: string; b: string; reason: string }>;

export type Progress = {
  level: Level;
  goals: Record<string, number>;
  score: number;
  streak: number;
  bestStreak: number;
  lastMatchAt: number;
  matches: { threat: string; defence: string }[];
  mixups: Mixup[];
  hints: number;
  phase: "play" | "won" | "lost";
};

export function startLevel(index: number): Progress {
  const level = LEVELS[index];
  return { level, goals: Object.fromEntries(level.goals.map((goal) => [goal.threat, 0])), score: 0, streak: 0, bestStreak: 0, lastMatchAt: -99, matches: [], mixups: [], hints: 3, phase: "play" };
}

export function recordMatch(progress: Progress, threat: string, defence: string, now: number): { points: number; streak: number } {
  progress.streak = now - progress.lastMatchAt <= STREAK_WINDOW ? progress.streak + 1 : 1;
  progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
  progress.lastMatchAt = now;
  const points = 100 + (progress.streak - 1) * 50;
  progress.score += points;
  progress.matches.push({ threat, defence });
  if (threat in progress.goals) {
    const goal = progress.level.goals.find((entry) => entry.threat === threat)!;
    progress.goals[threat] = Math.min(goal.count, progress.goals[threat] + 1);
  }
  if (goalsDone(progress)) progress.phase = "won";
  return { points, streak: progress.streak };
}

export function recordMixup(progress: Progress, a: string, b: string, reason: string): void {
  progress.streak = 0;
  progress.mixups.push({ a, b, reason });
}

export function goalsDone(progress: Progress): boolean {
  return progress.level.goals.every((goal) => progress.goals[goal.threat] >= goal.count);
}

// Stars measure understanding: how few mix-ups it took.
export function stars(progress: Progress): number {
  const wrong = progress.mixups.length;
  return wrong <= 1 ? 3 : wrong <= 4 ? 2 : 1;
}

// Keeps a level winnable: what to drop when a threat on the board has no defence left in the
// pile, or a goal still needs threats the pile no longer has. Empty when nothing is missing.
export function rescue(level: Level, pile: readonly string[], goals: Readonly<Record<string, number>>, rng: Rng): string[] {
  const threats = pile.filter((id) => sticker(id).kind === "threat" && id !== "unknown");
  const orphan = threats.find((threat) => !pile.some((id) => counters(threat, id)));
  if (orphan) return [pick(rng, defencesFor(level, orphan))];
  for (const goal of level.goals) {
    const missing = goal.count - (goals[goal.threat] ?? 0);
    if (missing > 0 && !pile.includes(goal.threat) && !pile.includes("unknown")) return [goal.threat, pick(rng, defencesFor(level, goal.threat))];
  }
  return [];
}
