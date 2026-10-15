import { describe, expect, it } from "vitest";
import { TACTICS, TECHNIQUES, WAVES } from "../src/orbit/data";
import { isRight, pointsFor, waveSchedule } from "../src/orbit/engine";

describe("Tactic Orbit", () => {
  it("uses every tactic and only known techniques", () => {
    const used = new Set(TECHNIQUES.flatMap((t) => t.tactics));
    for (const tactic of TACTICS) expect(used.has(tactic.id), tactic.id).toBe(true);
    for (const wave of WAVES) for (const id of wave) expect(TECHNIQUES.some((t) => t.id === id), id).toBe(true);
    expect(new Set(WAVES.flat()).size).toBe(WAVES.flat().length);
  });

  it("accepts any tactic a multi-tactic technique serves", () => {
    expect(isRight("sched-task", "persistence")).toBe(true);
    expect(isRight("sched-task", "execution")).toBe(true);
    expect(isRight("sched-task", "exfil")).toBe(false);
  });

  it("scores first tries best and spaces ships out", () => {
    expect(pointsFor({ key: 1, technique: "rdp", born: 0, tries: 1, result: "shielded", angle: 0 })).toBe(100);
    expect(pointsFor({ key: 1, technique: "rdp", born: 0, tries: 2, result: "shielded", angle: 0 })).toBe(50);
    expect(pointsFor({ key: 1, technique: "rdp", born: 0, tries: 1, result: "impact", angle: 0 })).toBe(0);
    const s = waveSchedule(0);
    expect(s[1].at - s[0].at).toBeGreaterThanOrEqual(3);
  });
});
