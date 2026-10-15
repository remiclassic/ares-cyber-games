// Pattern Patrol rules. Pure: no DOM.
import { LEVELS, type Level } from "./data";

export type Verdict = Readonly<{ matched: boolean; bad: boolean; ok: boolean }>;
export type Evaluation =
  | Readonly<{ error: string }>
  | Readonly<{ error: null; verdicts: readonly Verdict[]; caught: number; missed: number; falseAlarms: number; solved: boolean }>;

// Accepts a leading (?i) as "ignore case", since JavaScript has no inline flags.
export function compile(pattern: string): RegExp | string {
  if (!pattern.trim()) return "Type a pattern to start.";
  let source = pattern;
  let flags = "";
  if (source.startsWith("(?i)")) {
    source = source.slice(4);
    flags = "i";
  }
  try {
    return new RegExp(source, flags);
  } catch (error) {
    return `That pattern doesn't compile: ${(error as Error).message.replace(/^Invalid regular expression: /, "")}`;
  }
}

export function evaluate(level: Level, pattern: string): Evaluation {
  const regex = compile(pattern);
  if (typeof regex === "string") return { error: regex };
  if (regex.test("")) return { error: "That pattern matches empty text, so it would flag every line. Make it more specific." };
  const verdicts = level.lines.map((line) => {
    const matched = regex.test(line.text);
    return { matched, bad: line.bad, ok: matched === line.bad };
  });
  const caught = verdicts.filter((v) => v.bad && v.matched).length;
  const missed = verdicts.filter((v) => v.bad && !v.matched).length;
  const falseAlarms = verdicts.filter((v) => !v.bad && v.matched).length;
  return { error: null, verdicts, caught, missed, falseAlarms, solved: missed === 0 && falseAlarms === 0 };
}

export type LevelRecord = { level: string; solved: boolean; hints: number; checks: number; shown: boolean; pattern: string; points: number };

// 10 points for a solve; a hint costs 3; showing the reference pattern scores 0.
export function points(record: LevelRecord): number {
  if (!record.solved || record.shown) return 0;
  return Math.max(4, 10 - record.hints * 3);
}

export function levels(): readonly Level[] {
  return LEVELS;
}
