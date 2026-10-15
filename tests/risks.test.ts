import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/risks/data";
import { NOTHING, answerFix, answerIssue, createGame, currentScene, finishScene, issueOptions, nextScene, scoreScene, shuffled, summarize } from "../src/risks/engine";

describe("content", () => {
  it("gives every risk three issue options, three fixes and an explanation; decoys none", () => {
    for (const scene of SCENARIO.scenes) {
      expect(scene.items.filter((item) => item.risk).length).toBeGreaterThanOrEqual(6);
      expect(scene.items.filter((item) => !item.risk).length).toBeGreaterThanOrEqual(2);
      for (const item of scene.items) {
        expect(item.explain.length, item.id).toBeGreaterThan(20);
        if (item.risk) {
          expect(item.issue, item.id).toHaveLength(3);
          expect(item.fix, item.id).toHaveLength(3);
        } else {
          expect(item.fix).toHaveLength(0);
          expect(issueOptions(item)[0]).toBe(NOTHING);
        }
        expect(item.label.toLowerCase()).not.toMatch(/password|risk|unlocked|usb|propped|confidential/);
      }
    }
  });

  it("shuffles options the same way every time", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffled(items, "x")).toEqual(shuffled(items, "x"));
    expect(new Set(shuffled(items, "x"))).toEqual(new Set(items));
  });
});

describe("scoring", () => {
  it("gives 100 for every risk found, named and fixed, with decoys left alone", () => {
    const state = createGame(SCENARIO);
    while (state.phase !== "done") {
      for (const item of currentScene(state).items) {
        if (item.risk) {
          answerIssue(state, item.id, item.issue[0]);
          answerFix(state, item.id, item.fix[0]);
        } else answerIssue(state, item.id, NOTHING);
      }
      expect(finishScene(state).total).toBe(100);
      nextScene(state);
    }
    expect(summarize(state).total).toBe(100);
  });

  it("charges false alarms, so flagging everything does not win", () => {
    const scene = SCENARIO.scenes[0];
    const answers = Object.fromEntries(scene.items.map((item) => [item.id, { issue: item.issue[0], fix: item.fix[0] ?? null }]));
    const flagAll = scoreScene(scene, answers);
    expect(flagAll.falseAlarms).toBe(2);
    expect(flagAll.total).toBe(90);
  });

  it("credits finding a risk even with the wrong reason, but less", () => {
    const scene = SCENARIO.scenes[0];
    const answers = Object.fromEntries(scene.items.filter((item) => item.risk).map((item) => [item.id, { issue: item.issue[1], fix: null }]));
    expect(scoreScene(scene, answers).total).toBe(40);
  });

  it("does not take a fix for an item marked fine", () => {
    const state = createGame(SCENARIO);
    answerIssue(state, "monitor", NOTHING);
    answerFix(state, "monitor", SCENARIO.scenes[0].items[0].fix[0]);
    expect(state.answers.monitor.fix).toBeNull();
  });
});
