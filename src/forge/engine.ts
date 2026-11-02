// Password Forge: challenge flow and scoring. Pure rules; no DOM.
//
// Privacy: the game state never holds a typed password. Results keep only what the cracker saw
// (pattern kinds and a guess count), so nothing sensitive survives a challenge.

import { analyze, secondsFor, type Analysis, type SegmentKind } from "./estimator";

export type Target = Readonly<{ seconds: number; label: string }>;

export type BuildChallenge = Readonly<{
  id: string;
  kind: "build";
  title: string;
  lesson: string;
  brief: string;
  start: string;
  target: Target;
  hints: readonly string[];
  example: string; // a made-up password that passes, shown if the player gives up
  guided?: boolean;
}>;

export type PickOption = Readonly<{ id: string; label: string; correct: boolean; why: string; evidence?: string }>;

export type PickChallenge = Readonly<{
  id: string;
  kind: "pick";
  title: string;
  lesson: string;
  brief: string;
  prompt: string;
  options: readonly PickOption[];
  optionsArePasswords?: boolean;
  // A password under discussion. "times": attacker rows shown before the pick, working after.
  // "all": everything shown up front.
  subject?: Readonly<{ password: string; reveal: "times" | "all" }>;
}>;

export type Challenge = BuildChallenge | PickChallenge;

export type Attempt = Readonly<{ log10: number; kinds: readonly SegmentKind[]; leet: boolean; breached: boolean; passed: boolean }>;

export type Result = {
  id: string;
  kind: Challenge["kind"];
  points: number;
  passed: boolean;
  hints: number;
  attempts: Attempt[]; // build lock-ins (no passwords)
  picked?: string; // pick option id
  gaveUp: boolean;
  sawLeet: boolean; // tried letter swaps while building
};

export type GameState = {
  challenges: readonly Challenge[];
  index: number;
  phase: "play" | "answered" | "done";
  results: Result[];
  draft: Result; // the challenge in progress
};

export const POINTS = { max: 100, pick: 100, buildFloor: 50, failedLockIn: 25 } as const;

function freshResult(challenge: Challenge): Result {
  return { id: challenge.id, kind: challenge.kind, points: 0, passed: false, hints: 0, attempts: [], gaveUp: false, sawLeet: false };
}

export function createGame(challenges: readonly Challenge[]): GameState {
  return { challenges, index: 0, phase: "play", results: [], draft: freshResult(challenges[0]) };
}

export function currentChallenge(state: GameState): Challenge {
  return state.challenges[state.index];
}

export function meetsTarget(analysis: Analysis, target: Target): boolean {
  return analysis.length > 0 && !analysis.breach && secondsFor(analysis, "smart") >= target.seconds;
}

export function hasLeet(analysis: Analysis): boolean {
  return analysis.segments.some((segment) => segment.subs.length > 0);
}

// Live feedback while typing: only notes what the cracker saw, as evidence for the debrief.
export function observe(state: GameState, analysis: Analysis): void {
  if (state.phase === "play" && currentChallenge(state).kind === "build" && hasLeet(analysis)) state.draft.sawLeet = true;
}

// Build scoring: first lock-in that meets the target scores 100; each failed lock-in before it
// costs 25, down to 50. The guided challenge never penalises. Giving up scores 0.
export function buildPoints(challenge: BuildChallenge, failedLockIns: number): number {
  if (challenge.guided) return POINTS.max;
  return Math.max(POINTS.buildFloor, POINTS.max - POINTS.failedLockIn * failedLockIns);
}

export type LockIn = Readonly<{ passed: boolean; analysis: Analysis; points: number }>;

export function lockIn(state: GameState, password: string): LockIn | null {
  const challenge = currentChallenge(state);
  if (state.phase !== "play" || challenge.kind !== "build" || !password) return null;
  const analysis = analyze(password);
  const passed = meetsTarget(analysis, challenge.target);
  const draft = state.draft;
  draft.attempts.push({ log10: analysis.log10, kinds: [...new Set(analysis.segments.map((segment) => segment.kind))], leet: hasLeet(analysis), breached: analysis.breach !== null, passed });
  if (hasLeet(analysis)) draft.sawLeet = true;
  if (!passed) return { passed, analysis, points: 0 };
  draft.passed = true;
  draft.points = buildPoints(challenge, draft.attempts.length - 1);
  finish(state);
  return { passed, analysis, points: draft.points };
}

export function giveUp(state: GameState): string | null {
  const challenge = currentChallenge(state);
  if (state.phase !== "play" || challenge.kind !== "build") return null;
  state.draft.gaveUp = true;
  state.draft.points = 0;
  finish(state);
  return challenge.example;
}

export function pick(state: GameState, optionId: string): PickOption | null {
  const challenge = currentChallenge(state);
  if (state.phase !== "play" || challenge.kind !== "pick") return null;
  const option = challenge.options.find((entry) => entry.id === optionId);
  if (!option) return null;
  state.draft.picked = option.id;
  state.draft.passed = option.correct;
  state.draft.points = option.correct ? POINTS.pick : 0;
  finish(state);
  return option;
}

function finish(state: GameState): void {
  state.results.push(state.draft);
  state.phase = "answered";
}

export function takeHint(state: GameState): string | null {
  const challenge = currentChallenge(state);
  if (state.phase !== "play" || challenge.kind !== "build") return null;
  const hint = challenge.hints[Math.min(state.draft.hints, challenge.hints.length - 1)];
  state.draft.hints += 1;
  return hint;
}

export function next(state: GameState): void {
  if (state.phase !== "answered") return;
  if (state.index + 1 >= state.challenges.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.draft = freshResult(state.challenges[state.index]);
  state.phase = "play";
}

// The guided challenge's coach: reacts to what the cracker found, never to the raw text.
export function coachFor(analysis: Analysis, target: Target): string {
  if (!analysis.length) return "Type a password into the forge. Make one up; never use a real one.";
  if (meetsTarget(analysis, target)) return "That holds for over a year. Notice what did it: length and unpredictable words, not symbols. Press <strong>Lock it in</strong>.";
  const kinds = new Set(analysis.segments.map((segment) => segment.kind));
  const words = analysis.segments.filter((segment) => segment.kind === "word" || segment.kind === "wordlike" || segment.kind === "common-password").length;
  if (analysis.breach?.match === "common" && !hasLeet(analysis))
    return "“sunshine” is on every cracker's list of common passwords: it falls instantly. Try the classic advice first: swap some letters for symbols (s → $, i → 1, e → 3) and add a <strong>!</strong> on the end.";
  if (hasLeet(analysis)) return "Look at the cracker's working: it undid your swaps, and each one only doubled the guesses. Symbols did not save you. Now try length: replace it with three or four ordinary, unrelated words separated by spaces.";
  if (words >= 2) return `Getting there: the smart cracker now needs ${analysis.attackers.find((entry) => entry.id === "smart")!.label}. Each extra uncommon word multiplies that by about 100,000. Add another word.`;
  if (kinds.has("keyboard") || kinds.has("sequence") || kinds.has("repeat")) return "The cracker spotted a pattern (see its working). Patterns are cheap, however long. Try unrelated words instead.";
  return "Keep going: add unrelated words, separated by spaces, and watch the smart cracker's time grow.";
}

export type Summary = Readonly<{
  total: number;
  max: number;
  passed: number;
  hints: number;
  gaveUp: number;
  failedLockIns: number;
  leetTried: number; // build challenges where the player tried letter swaps
  patternsLockedIn: readonly SegmentKind[]; // weak patterns in failed lock-ins
  byChallenge: readonly { id: string; title: string; points: number; passed: boolean }[];
}>;

const WEAK_KINDS: readonly SegmentKind[] = ["common-password", "keyboard", "sequence", "repeat", "year", "date"];

export function summarize(state: GameState): Summary {
  const results = state.results;
  const failed = results.flatMap((result) => result.attempts.filter((attempt) => !attempt.passed));
  return {
    total: results.reduce((sum, result) => sum + result.points, 0),
    max: state.challenges.length * POINTS.max,
    passed: results.filter((result) => result.passed).length,
    hints: results.reduce((sum, result) => sum + result.hints, 0),
    gaveUp: results.filter((result) => result.gaveUp).length,
    failedLockIns: failed.length,
    leetTried: results.filter((result) => result.sawLeet).length,
    patternsLockedIn: [...new Set(failed.flatMap((attempt) => attempt.kinds.filter((kind) => WEAK_KINDS.includes(kind))))],
    byChallenge: state.challenges.map((challenge) => {
      const result = results.find((entry) => entry.id === challenge.id);
      return { id: challenge.id, title: challenge.title, points: result?.points ?? 0, passed: result?.passed ?? false };
    }),
  };
}
