import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/bits/data";
import { BITS, allTasks, answer, check, createGame, fitPrefix, maskOctet, next, prefixOf, reveal, submit, summarize, toggle, usable } from "../src/bits/engine";

function build(state: ReturnType<typeof createGame>, value: number): void {
  for (const bit of BITS) if (((state.bits ^ value) & bit) !== 0) toggle(state, bit);
}

describe("network maths", () => {
  it("builds masks and counts usable hosts", () => {
    expect([24, 25, 26, 27, 28, 29, 30].map(maskOctet)).toEqual([0, 128, 192, 224, 240, 248, 252]);
    expect([24, 26, 30].map(usable)).toEqual([254, 62, 2]);
    expect(prefixOf(192)).toBe(26);
    expect(prefixOf(0b10100000)).toBeNull();
  });

  it("sizes subnets to the smallest that fits", () => {
    expect(fitPrefix(50)).toBe(26);
    expect(fitPrefix(2)).toBe(30);
    expect(fitPrefix(100)).toBe(25);
    expect(fitPrefix(62)).toBe(26);
    expect(fitPrefix(63)).toBe(25);
  });

  it("finds network addresses with AND", () => {
    expect(answer({ kind: "network", id: "x", prompt: "", host: 77, prefix: 26 })).toBe(64);
    expect(answer({ kind: "network", id: "x", prompt: "", host: 200, prefix: 27 })).toBe(192);
  });
});

describe("feedback", () => {
  it("explains each kind of wrong answer specifically", () => {
    expect(check({ kind: "value", id: "v", prompt: "", target: 37 }, 45).message).toContain("8 too many");
    expect(check({ kind: "mask", id: "m", prompt: "", prefix: 26 }, 0b10100000).message).toContain("not a valid mask");
    expect(check({ kind: "mask", id: "m", prompt: "", prefix: 26 }, 224).message).toContain("That is /27");
    expect(check({ kind: "size", id: "s", prompt: "", need: 50, label: "" }, 224).message).toContain("only 30 usable");
    expect(check({ kind: "size", id: "s", prompt: "", need: 50, label: "" }, 128).message).toContain("wastes addresses");
  });
});

describe("game", () => {
  it("has ten tasks whose answers all fit in one octet", () => {
    const tasks = allTasks(SCENARIO);
    expect(tasks).toHaveLength(10);
    for (const task of tasks) expect(answer(task)).toBeGreaterThanOrEqual(0);
  });

  it("scores 100 for every task right first time", () => {
    const state = createGame(SCENARIO);
    for (const task of allTasks(SCENARIO)) {
      build(state, answer(task));
      expect(submit(state).ok).toBe(true);
      next(state);
    }
    expect(state.phase).toBe("done");
    expect(summarize(state).total).toBe(100);
  });

  it("pays less after a wrong check and nothing after a reveal", () => {
    const state = createGame(SCENARIO);
    build(state, 128);
    expect(submit(state).ok).toBe(false);
    build(state, 192);
    expect(submit(state).ok).toBe(true);
    expect(state.records[0].points).toBe(6);
    next(state);
    reveal(state);
    expect(state.records[1].points).toBe(0);
    expect(state.bits).toBe(37);
  });

  it("does not change gears once the task is solved", () => {
    const state = createGame(SCENARIO);
    build(state, 192);
    submit(state);
    toggle(state, 1);
    expect(state.bits).toBe(192);
  });
});
