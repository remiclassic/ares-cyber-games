import { describe, expect, it } from "vitest";
import { COUNTERS, LEVELS, STICKERS, counters, mismatch } from "../src/stack/data";
import { defencesFor, nextSpawn, rescue, recordMatch, recordMixup, seeded, stars, startLevel, startingPile, tryMatch } from "../src/stack/engine";
import { step, type World } from "../src/stack/physics";

describe("content", () => {
  it("gives every threat at least one defence, with a reason for each pairing", () => {
    for (const threat of STICKERS.filter((entry) => entry.kind === "threat" && entry.id !== "unknown")) {
      const list = COUNTERS[threat.id];
      expect(Object.keys(list ?? {}).length, threat.id).toBeGreaterThan(0);
      for (const reason of Object.values(list)) expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("gives every level threat a defence in that level, and makes goals reachable", () => {
    for (const level of LEVELS) {
      for (const threat of level.threats) expect(defencesFor(level, threat).length, `${level.id}:${threat}`).toBeGreaterThan(0);
      for (const goal of level.goals) expect(level.threats).toContain(goal.threat);
    }
  });
});

describe("matching", () => {
  it("accepts a defence on the threat it stops, in either drag direction", () => {
    expect(tryMatch("mfa", "phish")).toMatchObject({ ok: true, threat: "phish", defence: "mfa" });
    expect(tryMatch("phish", "report").ok).toBe(true);
  });

  it("explains a wrong drop from the table", () => {
    const wrong = tryMatch("backup", "phish");
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toContain("Offline backup stops ransomware");
    expect(wrong.reason).toContain("Report button or MFA");
    expect(mismatch("phish", "ransom")).toContain("Two threats");
    expect(mismatch("mfa", "edr")).toContain("Two defences");
    expect(mismatch("unknown", "edr")).toContain("investigate");
    expect(counters("unknown", "edr")).toBe(false);
  });
});

describe("pile planning", () => {
  it("starts every level solvable: each threat has a matching defence in the pile", () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed < 30; seed += 1) {
        const pile = startingPile(level, seeded(seed));
        expect(pile.length).toBe(level.start);
        expect(pile.filter((id) => id === "unknown").length).toBe(level.unknowns);
        for (const threat of pile.filter((id) => STICKERS.find((entry) => entry.id === id)!.kind === "threat" && id !== "unknown")) {
          expect(pile.some((id) => counters(threat, id)), `${level.id}/${seed}/${threat}`).toBe(true);
        }
      }
    }
  });

  it("spawns a defence for any threat left without one", () => {
    const level = LEVELS[1];
    expect(defencesFor(level, "ransom")).toContain(nextSpawn(level, ["ransom", "mfa"], seeded(5)));
  });
});

describe("never stuck", () => {
  it("drops a defence for a threat left without one, and goal threats the pile has run out of", () => {
    const level = LEVELS[0];
    expect(defencesFor(level, "phish")).toContain(rescue(level, ["phish", "pwman"], { phish: 0, weakpw: 0 }, seeded(1))[0]);
    const refill = rescue(level, ["mfa"], { phish: 3, weakpw: 1 }, seeded(2));
    expect(refill[0]).toBe("weakpw");
    expect(rescue(level, ["phish", "report"], { phish: 1, weakpw: 3 }, seeded(3))).toEqual([]);
  });
});

describe("progress", () => {
  it("builds streaks, fills goals and wins", () => {
    const progress = startLevel(0);
    const first = recordMatch(progress, "phish", "report", 1);
    const second = recordMatch(progress, "phish", "mfa", 2);
    expect(first.points).toBe(100);
    expect(second).toMatchObject({ points: 150, streak: 2 });
    recordMatch(progress, "phish", "report", 10);
    expect(progress.streak).toBe(1);
    for (let i = 0; i < 3; i += 1) recordMatch(progress, "weakpw", "pwman", 20 + i * 10);
    expect(progress.phase).toBe("won");
    expect(stars(progress)).toBe(3);
  });

  it("awards stars for understanding, not speed", () => {
    const progress = startLevel(0);
    for (let i = 0; i < 5; i += 1) recordMixup(progress, "backup", "phish", "x");
    expect(stars(progress)).toBe(1);
    expect(progress.streak).toBe(0);
  });
});

describe("physics", () => {
  it("lets a pile fall and come to rest inside the box", () => {
    const world: World = { width: 300, height: 400, bodies: [] };
    for (let i = 0; i < 12; i += 1) world.bodies.push({ key: i, x: 40 + (i % 5) * 50, y: -40 * i, vx: 0, vy: 0, r: 28, angle: 0, spin: 0, held: false, restFor: 0 });
    for (let t = 0; t < 600; t += 1) step(world, 1 / 60);
    for (const body of world.bodies) {
      expect(body.x).toBeGreaterThanOrEqual(body.r - 1);
      expect(body.x).toBeLessThanOrEqual(300 - body.r + 1);
      expect(body.y).toBeLessThanOrEqual(400 - body.r + 1);
      expect(body.restFor).toBeGreaterThan(0.5);
    }
  });
});
