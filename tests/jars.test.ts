import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/jars/data";
import { LEVELS, POINTS, allItems, choose, createGame, currentItem, feedbackFor, next, summarize, takeHint, verdictOf, type Level } from "../src/jars/engine";

function playAll(pickFor: (level: Level) => Level) {
  const state = createGame(SCENARIO);
  while (state.phase !== "done") {
    choose(state, pickFor(currentItem(state).level));
    next(state);
  }
  return state;
}

describe("need to know", () => {
  it("has well-formed content covering every jar", () => {
    const items = allItems(SCENARIO);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const level of [0, 1, 2, 3]) expect(items.some((item) => item.level === level)).toBe(true);
    for (const item of items) expect(item.why.length && item.clue.length).toBeTruthy();
  });

  it("scores exact, over and under differently", () => {
    const item = allItems(SCENARIO).find((entry) => entry.level === 2)!;
    expect(verdictOf(item, 2)).toBe("exact");
    expect(verdictOf(item, 3)).toBe("over");
    expect(verdictOf(item, 1)).toBe("under");
    expect(feedbackFor(item, 1)).toContain("too low");
    expect(feedbackFor(item, 3)).toContain("too high");
  });

  it("perfect play scores the maximum", () => {
    const summary = summarize(playAll((level) => level));
    expect(summary.total).toBe(summary.max);
    expect(summary.exact).toBe(allItems(SCENARIO).length);
  });

  it("labelling everything Restricted scores at most half", () => {
    const summary = summarize(playAll(() => 3));
    expect(summary.under).toBe(0);
    expect(summary.total).toBeLessThanOrEqual(summary.max / 2);
    expect(summary.total).toBeLessThan(summarize(playAll((level) => level)).total);
  });

  it("labelling everything Internal scores worse than over-labelling", () => {
    expect(summarize(playAll(() => 1)).total).toBeLessThan(summarize(playAll(() => 3)).total);
  });

  it("allows one pick per record and counts hints without cost", () => {
    const state = createGame(SCENARIO);
    takeHint(state);
    const level = currentItem(state).level;
    expect(choose(state, level)?.points).toBe(POINTS.exact);
    expect(choose(state, 0)).toBeNull();
    next(state);
    expect(summarize(state).hints).toBe(1);
    expect(LEVELS).toHaveLength(4);
  });
});
