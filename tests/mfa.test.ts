import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/mfa/data";
import {
  PASS_OWN_RATIO,
  PASS_RATIO,
  POINTS,
  allPrompts,
  bestResponse,
  createGame,
  currentPrompt,
  evidenceOf,
  feedbackFor,
  hintsAllowed,
  next,
  outcomeOf,
  respond,
  summarize,
  takeHint,
  type Prompt,
  type Response,
} from "../src/mfa/engine";

function playAll(choose: (prompt: Prompt) => Response) {
  const state = createGame(SCENARIO);
  while (state.phase !== "done") {
    respond(state, choose(currentPrompt(state)));
    next(state);
  }
  return state;
}

const perfect = () => playAll(bestResponse);

describe("mfa fatigue: content", () => {
  const prompts = allPrompts(SCENARIO);

  it("has unique ids, a why for every prompt, and hints outside the final round", () => {
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
    for (const stage of SCENARIO.stages) {
      for (const prompt of stage.prompts) {
        expect(prompt.why.length).toBeGreaterThan(20);
        expect(prompt.clues.length).toBeGreaterThan(0);
        if (!stage.final) expect(prompt.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it("starts with one guided prompt the player initiated and ends on a no-hint scenario", () => {
    expect(prompts[0].guided).toBe(true);
    expect(prompts[0].origin).toBe("you");
    expect(prompts.filter((p) => p.guided)).toHaveLength(1);
    expect(SCENARIO.stages[SCENARIO.stages.length - 1].final).toBe(true);
    expect(SCENARIO.stages.filter((s) => s.final)).toHaveLength(1);
  });

  it("mixes own and attacker prompts, including pressure and a mismatched number", () => {
    expect(prompts.filter((p) => p.origin === "you").length).toBeGreaterThanOrEqual(5);
    expect(prompts.filter((p) => p.origin === "attacker").length).toBeGreaterThanOrEqual(5);
    expect(prompts.some((p) => p.message && p.clues.includes("pressure"))).toBe(true);
    const mismatch = prompts.find((p) => p.number !== undefined && p.screenNumber !== undefined && p.number !== p.screenNumber)!;
    expect(mismatch.origin).toBe("attacker");
    // Own prompts with a number always match the player's screen.
    for (const p of prompts.filter((p) => p.origin === "you" && p.number !== undefined)) expect(p.number).toBe(p.screenNumber);
  });
});

describe("mfa fatigue: rules", () => {
  const own = allPrompts(SCENARIO).find((p) => p.origin === "you")!;
  const attack = allPrompts(SCENARIO).find((p) => p.origin === "attacker")!;

  it("approves your own sign-ins and reports the attacker's", () => {
    expect(bestResponse(own)).toBe("approve");
    expect(bestResponse(attack)).toBe("report");
    expect(outcomeOf(attack, "approve")).toBe("breach");
    expect(outcomeOf(own, "deny")).toBe("blocked-self");
    expect(outcomeOf(own, "report")).toBe("false-alarm");
    expect(feedbackFor(attack, "approve")).toContain("make it stop");
  });

  it("ranks responses: deny is safe but costs work; approving the attacker scores nothing", () => {
    expect(POINTS.you.approve).toBeGreaterThan(POINTS.you.deny);
    expect(POINTS.you.deny).toBeGreaterThanOrEqual(POINTS.you.report);
    expect(POINTS.attacker.report).toBeGreaterThan(POINTS.attacker.deny);
    expect(POINTS.attacker.deny).toBeGreaterThan(POINTS.attacker.approve);
    expect(POINTS.attacker.approve).toBe(0);
  });

  it("allows one decision per prompt and refuses hints in the final round", () => {
    const state = createGame(SCENARIO);
    expect(takeHint(state)).toBeTruthy();
    expect(respond(state, "approve")?.hinted).toBe(true);
    expect(respond(state, "deny")).toBeNull();
    next(state);
    expect(state.hinted).toBe(false);
    // Advance to the final stage.
    while (hintsAllowed(state)) {
      respond(state, bestResponse(currentPrompt(state)));
      next(state);
    }
    expect(takeHint(state)).toBeNull();
    expect(state.hinted).toBe(false);
  });
});

describe("mfa fatigue: scoring", () => {
  it("perfect play scores the maximum, passes, and shows every skill", () => {
    const state = perfect();
    const summary = summarize(state);
    expect(summary.total).toBe(summary.max);
    expect(summary.passed).toBe(true);
    expect(summary.breaches).toBe(0);
    expect(summary.ownSignIns).toBe(summary.ownTotal);
    expect(summary.lostMinutes).toBe(0);
    const evidence = evidenceOf(state);
    expect(evidence.skills.every((s) => s.level === "shown")).toBe(true);
    expect(evidence.final.correct).toBe(evidence.final.of);
  });

  it("approve-all (approve to make it stop) is below the pass threshold and breaches", () => {
    const summary = summarize(playAll(() => "approve"));
    expect(summary.total).toBeLessThan(summary.max * PASS_RATIO);
    expect(summary.breaches).toBeGreaterThan(0);
    expect(summary.passed).toBe(false);
  });

  it("deny-all is below the pass threshold: it blocks your own work", () => {
    const summary = summarize(playAll(() => "deny"));
    expect(summary.breaches).toBe(0);
    expect(summary.ownSignIns).toBe(0);
    expect(summary.lostMinutes).toBeGreaterThan(0);
    expect(summary.total).toBeLessThan(summary.max * PASS_RATIO);
    expect(summary.passed).toBe(false);
  });

  it("report-all is below the pass threshold too", () => {
    const summary = summarize(playAll(() => "report"));
    expect(summary.total).toBeLessThan(summary.max * PASS_RATIO);
    expect(summary.passed).toBe(false);
  });

  it("denying instead of reporting the attacker still passes, but scores below perfect", () => {
    const summary = summarize(playAll((p) => (p.origin === "you" ? "approve" : "deny")));
    expect(summary.passed).toBe(true);
    expect(summary.total).toBeLessThan(summary.max);
  });

  it("trusting the number alone (approve matches, report the rest) fails: it blocks your own work", () => {
    const summary = summarize(playAll((p) => (p.number !== undefined && p.number === p.screenNumber ? "approve" : "report")));
    expect(summary.breaches).toBe(0);
    expect(summary.ownSignIns).toBeLessThan(summary.ownTotal * PASS_OWN_RATIO);
    expect(summary.passed).toBe(false);
  });

  it("a single breach fails the run even with a high score", () => {
    let approvedOne = false;
    const summary = summarize(
      playAll((p) => {
        if (p.origin === "attacker" && !approvedOne) {
          approvedOne = true;
          return "approve";
        }
        return bestResponse(p);
      }),
    );
    expect(summary.total).toBeGreaterThanOrEqual(summary.max * PASS_RATIO);
    expect(summary.passed).toBe(false);
  });

  it("keeps learning evidence separate from score: hints change evidence, not points", () => {
    const hinted = createGame(SCENARIO);
    while (hinted.phase !== "done") {
      takeHint(hinted);
      respond(hinted, bestResponse(currentPrompt(hinted)));
      next(hinted);
    }
    const plain = perfect();
    expect(summarize(hinted).total).toBe(summarize(plain).total);
    expect(summarize(hinted).hints).toBeGreaterThan(0);
    expect(evidenceOf(hinted).unaided.of).toBeLessThan(evidenceOf(plain).unaided.of);
    expect(evidenceOf(hinted).final).toEqual(evidenceOf(plain).final);
  });

  it("names the skill gaps of each dominant strategy", () => {
    const level = (strategy: Response, skill: string) => evidenceOf(playAll(() => strategy)).skills.find((s) => s.skill === skill)!.level;
    expect(level("approve", "never-approve-unexpected")).toBe("not-yet");
    expect(level("approve", "resist-pressure")).toBe("not-yet");
    expect(level("deny", "approve-own")).toBe("not-yet");
    expect(level("deny", "report-unexpected")).toBe("not-yet");
    expect(level("report", "approve-own")).toBe("not-yet");
    expect(level("approve", "number-match")).toBe("partial");
  });
});
