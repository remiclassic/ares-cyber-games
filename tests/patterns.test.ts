import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/patterns/data";
import { compile, evaluate, points } from "../src/patterns/engine";

describe("Pattern Patrol content", () => {
  it("every reference pattern solves its level", () => {
    for (const level of LEVELS) {
      const result = evaluate(level, level.example);
      expect(result.error, level.id).toBeNull();
      if (result.error === null) expect(result.solved, level.id).toBe(true);
    }
  });

  it("every level has a trap that the obvious shortcut falls into", () => {
    // Matching everything is never a solution, and nor is matching nothing.
    for (const level of LEVELS) {
      expect(level.lines.some((line) => !line.bad), level.id).toBe(true);
      const all = evaluate(level, ".");
      if (all.error === null) expect(all.solved).toBe(false);
    }
  });

  it("the unescaped address falls for the look-alike", () => {
    const level = LEVELS.find((l) => l.id === "escape")!;
    const sloppy = evaluate(level, "203.0.113.44");
    expect(sloppy.error).toBeNull();
    if (sloppy.error === null) expect(sloppy.falseAlarms).toBeGreaterThan(0);
  });
});

describe("Pattern Patrol engine", () => {
  it("reports bad patterns and empty matches clearly", () => {
    expect(typeof compile("(unclosed")).toBe("string");
    expect(evaluate(LEVELS[0], "x*").error).toContain("empty text");
    expect(compile("(?i)ABC")).toBeInstanceOf(RegExp);
  });

  it("scores hints and reveals", () => {
    const base = { level: "x", solved: true, hints: 0, checks: 1, shown: false, pattern: "", points: 0 };
    expect(points(base)).toBe(10);
    expect(points({ ...base, hints: 1 })).toBe(7);
    expect(points({ ...base, shown: true })).toBe(0);
  });
});
