import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/cleandesk/data";
import {
  ACTIONS,
  PASS_SCORE,
  act,
  allItems,
  bestAction,
  bestCost,
  canAct,
  clockNow,
  createGame,
  currentScene,
  formatClock,
  guidedPending,
  inspect,
  isAvailable,
  learning,
  leaveRoom,
  minutesLeft,
  nextScene,
  nightReport,
  optionFor,
  playAll,
  score,
  type Action,
  type Item,
} from "../src/cleandesk/engine";

const items = allItems(SCENARIO);
const sensitive = items.filter((item) => item.severity > 0);
const decoys = items.filter((item) => item.severity === 0);

// Policies
const best = (item: Item): Action => bestAction(item);
const cheapestHandling = (item: Item): Action =>
  [...item.options].filter((option) => option.action !== "leave").sort((a, b) => ACTIONS[a.action].minutes - ACTIONS[b.action].minutes)[0].action;
// "Action everything": the right action on what is sensitive, and some action on everything else.
const actionEverything = (item: Item): Action => (item.severity > 0 ? bestAction(item) : cheapestHandling(item));
const shredEverything = (item: Item): Action | null => (optionFor(item, "shred") ? "shred" : null);
const reversed = (list: readonly Item[]) => [...list].reverse();
const cheapestFirst = (list: readonly Item[]) => [...list].sort((a, b) => ACTIONS[actionEverything(a)].minutes - ACTIONS[actionEverything(b)].minutes);

describe("content", () => {
  it("has three rooms: guided first, and a final room with no hints, no feedback and no slack", () => {
    expect(SCENARIO.scenes).toHaveLength(3);
    const [first, second, last] = SCENARIO.scenes;
    expect(first.guided).toBeTruthy();
    expect(first.hints && first.feedback).toBe(true);
    expect(second.hints).toBe(false);
    expect(last.hints || last.feedback).toBe(false);
    expect(first.start).toBe(17 * 60 + 25);
    // The clock tightens: slack over best play shrinks to zero.
    const slack = SCENARIO.scenes.map((scene) => scene.budget - bestCost(scene));
    expect(slack[0]).toBeGreaterThan(slack[1]);
    expect(slack[1]).toBeGreaterThan(slack[2]);
    expect(slack[2]).toBe(0);
    // Rooms follow each other on the clock without overlapping.
    expect(second.start).toBeGreaterThanOrEqual(first.start + first.budget);
    expect(last.start).toBeGreaterThanOrEqual(second.start + second.budget);
  });

  it("mixes sensitive objects with harmless decoys in every room, all well formed", () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const scene of SCENARIO.scenes) {
      expect(scene.items.filter((item) => item.severity > 0).length, scene.id).toBeGreaterThanOrEqual(3);
      expect(scene.items.filter((item) => item.severity === 0).length, scene.id).toBeGreaterThanOrEqual(2);
    }
    for (const item of items) {
      const grades = item.options.map((option) => option.grade);
      expect(grades.filter((grade) => grade === "best"), item.id).toHaveLength(1);
      expect(new Set(item.options.map((option) => option.action)).size, item.id).toBe(item.options.length);
      expect(optionFor(item, "leave"), item.id).toBeTruthy();
      for (const option of item.options) expect(option.text.length, `${item.id}:${option.action}`).toBeGreaterThan(40);
      expect(item.detail.length, item.id).toBeGreaterThan(40);
      expect(item.reason.length, item.id).toBeGreaterThan(40);
      // Neutral labels: nothing in the label gives the answer away.
      expect(item.label.toLowerCase(), item.id).not.toMatch(/password|payroll|confidential|sensitive|public|lock|customer|contract|visitor|usb|network|unknown|menu|photo/);
      if (item.severity > 0) {
        expect(optionFor(item, "leave")!.grade, item.id).toBe("exposed");
        expect(bestAction(item), item.id).not.toBe("leave");
      } else {
        expect(bestAction(item), item.id).toBe("leave");
        for (const option of item.options) if (option.action !== "leave") expect(["waste", "harm"], `${item.id}:${option.action}`).toContain(option.grade);
      }
    }
    for (const item of SCENARIO.scenes[0].items) expect(item.hint.length, item.id).toBeGreaterThan(20);
  });

  it("covers the named exposures and decoys, and uses every securing action as a best answer", () => {
    for (const id of ["sticky-note", "screen-crm", "badge", "payroll", "whiteboard", "usb", "keys"]) expect(items.find((item) => item.id === id)!.severity, id).toBeGreaterThan(0);
    for (const id of ["lunch-menu", "brochure", "photo", "screen-locked"]) expect(items.find((item) => item.id === id)!.severity, id).toBe(0);
    const bests = new Set(items.map(bestAction));
    for (const action of ["lock", "shred", "drawer", "handin", "wipe", "collect", "report", "leave"] as Action[]) expect(bests.has(action), action).toBe(true);
  });

  it("makes shredding wrong for the contract, the notebook and the sign-in book, and plugging in the USB the worst choice", () => {
    for (const id of ["contract", "notebook", "sign-in"]) expect(optionFor(items.find((item) => item.id === id)!, "shred")!.grade, id).toBe("harm");
    const plug = optionFor(items.find((item) => item.id === "usb")!, "plug")!;
    expect(plug.grade).toBe("harm");
    const harms = items.flatMap((item) => item.options).filter((option) => option.grade === "harm");
    expect(Math.max(...harms.map((option) => option.harm ?? 1))).toBe(plug.harm);
    expect(harms.filter((option) => (option.harm ?? 1) === plug.harm)).toHaveLength(1);
    // Switching a monitor off is a paid action that fixes nothing.
    expect(optionFor(items.find((item) => item.id === "screen-crm")!, "off")!.grade).toBe("exposed");
  });
});

describe("flow and clock", () => {
  it("starts guided: only the guided object is available, and you cannot leave before dealing with it", () => {
    const state = createGame(SCENARIO);
    const scene = currentScene(state);
    const other = scene.items.find((item) => item.id !== scene.guided)!;
    expect(guidedPending(state)).toBe(true);
    expect(isAvailable(state, other.id)).toBe(false);
    expect(inspect(state, other.id)).toBe(false);
    expect(leaveRoom(state)).toBe(false);
    expect(act(state, scene.guided!, "lock")).toBeNull(); // not inspected yet
    expect(inspect(state, scene.guided!)).toBe(true);
    expect(minutesLeft(state)).toBe(scene.budget); // looking is free
    expect(act(state, scene.guided!, "lock")!.grade).toBe("best");
    expect(guidedPending(state)).toBe(false);
    expect(isAvailable(state, other.id)).toBe(true);
  });

  it("charges minutes per action, makes actions final and refuses what the clock cannot pay for", () => {
    const state = createGame(SCENARIO);
    inspect(state, "screen-crm");
    act(state, "screen-crm", "lock");
    expect(minutesLeft(state)).toBe(6);
    expect(formatClock(clockNow(state))).toBe("17:26");
    expect(act(state, "screen-crm", "leave")).toBeNull(); // final
    inspect(state, "lunch-menu");
    act(state, "lunch-menu", "shred");
    inspect(state, "photo");
    act(state, "photo", "drawer");
    inspect(state, "sticky-note");
    act(state, "sticky-note", "shred");
    expect(minutesLeft(state)).toBe(0);
    inspect(state, "contract");
    expect(canAct(state, "contract", "drawer")).toBe(false);
    expect(act(state, "contract", "drawer")).toBeNull();
    expect(canAct(state, "contract", "leave")).toBe(true); // leaving is free
    expect(act(state, "lunch-menu", "wipe")).toBeNull();
  });

  it("plays the night out after each room, worst first, and moves on to the debrief after the third", () => {
    const state = createGame(SCENARIO);
    inspect(state, "screen-crm");
    act(state, "screen-crm", "lock");
    expect(nextScene(state)).toBe(false);
    expect(leaveRoom(state)).toBe(true);
    expect(state.phase).toBe("night");
    expect(inspect(state, "contract")).toBe(false);
    const report = nightReport(state);
    expect(report).toHaveLength(SCENARIO.scenes[0].items.length);
    expect(report[0].option.grade).toBe("exposed");
    expect(report.find((row) => row.item.id === "sticky-note")!.decided).toBe(false);
    expect(report[report.length - 1].option.grade).toBe("best");
    expect(nextScene(state)).toBe(true);
    expect(state.sceneIndex).toBe(1);
    expect(minutesLeft(state)).toBe(SCENARIO.scenes[1].budget); // unused minutes do not carry over
    expect(inspect(state, "sticky-note")).toBe(false); // previous room is behind you
    leaveRoom(state);
    nextScene(state);
    leaveRoom(state);
    nextScene(state);
    expect(state.phase).toBe("done");
  });
});

describe("scoring", () => {
  it("gives best play the maximum, inside the time budget of every room", () => {
    const state = playAll(SCENARIO, best);
    const result = score(state);
    expect(result).toMatchObject({ total: 100, secured: 100, proportion: 100, care: 100, passed: true, harms: 0, criticalExposed: 0 });
    state.spent.forEach((spent, index) => expect(spent, SCENARIO.scenes[index].id).toBeLessThanOrEqual(SCENARIO.scenes[index].budget));
    expect(Object.keys(state.choices)).toHaveLength(items.length);
    // Order does not matter for best play.
    expect(score(playAll(SCENARIO, best, reversed)).total).toBe(100);
  });

  it("makes 'action everything' run out of time and lose, whatever order the room is worked in", () => {
    for (const scene of SCENARIO.scenes) {
      const cost = scene.items.reduce((sum, item) => sum + ACTIONS[actionEverything(item)].minutes, 0);
      expect(cost, scene.id).toBeGreaterThan(scene.budget);
    }
    for (const order of [undefined, reversed, cheapestFirst]) {
      const state = playAll(SCENARIO, actionEverything, order);
      const result = score(state);
      expect(Object.keys(state.choices).length).toBeLessThan(items.length); // ran out of time
      expect(result.passed).toBe(false);
      expect(result.total).toBeLessThan(PASS_SCORE);
      expect(result.criticalExposed).toBeGreaterThan(0);
      expect(learning(state).minutesWasted).toBeGreaterThan(0);
    }
  });

  it("makes 'shred everything' lose", () => {
    const state = playAll(SCENARIO, shredEverything);
    const result = score(state);
    expect(result.passed).toBe(false);
    expect(result.total).toBeLessThan(40);
    expect(result.harms).toBeGreaterThanOrEqual(3);
    expect(learning(state).destroyed).toEqual(expect.arrayContaining(["contract", "notebook", "sign-in"]));
    // Even shredding what can be shredded and doing the right thing everywhere else fails.
    const mixed = score(playAll(SCENARIO, (item) => (optionFor(item, "shred") ? "shred" : bestAction(item))));
    expect(mixed.passed).toBe(false);
  });

  it("makes leaving early lose", () => {
    const nothing = score(playAll(SCENARIO, () => null));
    expect(nothing.passed).toBe(false);
    expect(nothing.total).toBeLessThan(40);
    expect(nothing.secured).toBe(0);
    // Do the guided object and walk out of every room.
    const guidedOnly = score(playAll(SCENARIO, (item, scene) => (item.id === scene.guided ? bestAction(item) : null)));
    expect(guidedOnly.passed).toBe(false);
    expect(guidedOnly.total).toBeLessThan(40);
  });

  it("makes plugging in the unknown USB the single worst action and a fail on its own", () => {
    const withPlug = score(playAll(SCENARIO, (item) => (item.id === "usb" ? "plug" : bestAction(item))));
    expect(withPlug.passed).toBe(false);
    expect(withPlug.care).toBe(0);
    for (const item of items) {
      for (const option of item.options) {
        if (option.action === bestAction(item) || (item.id === "usb" && option.action === "plug")) continue;
        const other = score(playAll(SCENARIO, (entry) => (entry.id === item.id ? option.action : bestAction(entry))));
        expect(other.total, `${item.id}:${option.action}`).toBeGreaterThan(withPlug.total);
      }
    }
  });

  it("fails on any single critical exposure or destroyed record, even with a high score", () => {
    const missedScreen = score(playAll(SCENARIO, (item) => (item.id === "reception-pc" ? "off" : bestAction(item))));
    expect(missedScreen.criticalExposed).toBe(1);
    expect(missedScreen.passed).toBe(false);
    const shredded = score(playAll(SCENARIO, (item) => (item.id === "contract" ? "shred" : bestAction(item))));
    expect(shredded.harms).toBe(1);
    expect(shredded.passed).toBe(false);
    // Heavier-than-needed but safe actions still pass.
    const heavy = score(playAll(SCENARIO, (item) => (item.id === "contract" ? "handin" : bestAction(item))));
    expect(heavy.passed).toBe(true);
    expect(heavy.total).toBeLessThan(100);
  });

  it("makes other single-action habits lose too", () => {
    for (const action of ["drawer", "handin", "lock"] as Action[]) {
      const result = score(playAll(SCENARIO, (item) => (optionFor(item, action) ? action : null)));
      expect(result.passed, action).toBe(false);
    }
  });

  it("keeps learning evidence separate from the score", () => {
    const quick = playAll(SCENARIO, best);
    // Same actions, but this player also looked at everything before acting.
    const thorough = createGame(SCENARIO);
    while (thorough.phase !== "done") {
      const scene = currentScene(thorough);
      if (scene.guided) {
        inspect(thorough, scene.guided);
        act(thorough, scene.guided, bestAction(items.find((item) => item.id === scene.guided)!));
      }
      for (const item of scene.items) inspect(thorough, item.id);
      for (const item of scene.items) if (item.severity > 0) act(thorough, item.id, bestAction(item));
      leaveRoom(thorough);
      nextScene(thorough);
    }
    const lazy = playAll(SCENARIO, (item) => (item.severity > 0 ? bestAction(item) : null));
    expect(score(thorough)).toEqual(score(lazy));
    expect(learning(thorough).inspected).toBe(items.length);
    expect(learning(lazy).inspected).toBe(sensitive.length);
    expect(score(quick).total).toBe(score(lazy).total);

    const evidence = learning(playAll(SCENARIO, actionEverything));
    expect(evidence.overHandled.length).toBeGreaterThan(0);
    expect(evidence.exposed.length).toBeGreaterThan(0);
    const perfect = learning(quick);
    expect(perfect).toMatchObject({ decoysLeft: decoys.length, decoyTotal: decoys.length, proportionate: sensitive.length, minutesWasted: 0, pluggedUnknownMedia: false });
    expect(perfect.finalSecured).toBe(perfect.finalTotal);
    expect(learning(playAll(SCENARIO, (item) => (item.id === "screen-crm" ? "off" : bestAction(item)))).falseFixes).toEqual(["screen-crm"]);
    expect(learning(playAll(SCENARIO, (item) => (item.id === "usb" ? "plug" : bestAction(item)))).pluggedUnknownMedia).toBe(true);
  });
});
