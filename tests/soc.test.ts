import { describe, expect, it } from "vitest";
import { apply, createCase, outcomeOf, run, scoreOf, transferred, variantOf, viewOf } from "../src/soc/sim/case";
import { at } from "../src/soc/data/scenario";
import type { Command, Variant } from "../src/soc/sim/types";

const play = (variant: Variant, commands: Command[]) => run("test", commands, variant);
const commit = (action: Extract<Command, { type: "commit" }>["action"], reason: Extract<Command, { type: "commit" }>["reason"], cited: string[] = [], target?: "host" | "account" | "both"): Command => ({
  type: "commit",
  action,
  reason,
  cited,
  target,
});

const BEST_COMPROMISE: Command[] = [
  { type: "request", id: "E1" },
  commit("contain", "impact", ["E1"], "host"),
  commit("contain", "correlated", ["E1", "ev:c-mfa"], "account"),
  commit("escalate", "handover", ["E1", "ev:c-mfa"]),
];

const BEST_APPROVED: Command[] = [
  { type: "request", id: "N1" },
  commit("investigate", "partial"),
  { type: "request", id: "E1" },
  commit("standdown", "approved", ["N1", "E1"]),
];

describe("SOC Dashboard Challenge: A Strange Login", () => {
  it("is deterministic from seed and command log", () => {
    expect(run("abc", BEST_COMPROMISE, "compromise")).toEqual(run("abc", BEST_COMPROMISE, "compromise"));
    expect(variantOf("abc")).toBe(variantOf("abc"));
  });

  it("opens identically in both variants", () => {
    const a = viewOf(createCase("s", "compromise"));
    const b = viewOf(createCase("s", "approved"));
    expect(a).toEqual(b);
    expect(a.transferredGb).toBe(0.56);
  });

  it("matches the transfer shown on the dashboard: 1.2 GB between 10:26 and 10:41", () => {
    expect(transferred("approved", at(10, 41), null)).toBe(1.2);
    expect(transferred("compromise", at(11, 30), null)).toBe(3.2);
    expect(transferred("approved", at(11, 30), null)).toBe(1.2);
  });

  it("every evidence request advances the scenario and spends budget", () => {
    const start = createCase("s", "compromise");
    const next = apply(start, { type: "request", id: "L3" });
    expect(next.clock).toBe(start.clock + 4);
    expect(next.budget).toBe(start.budget - 1);
    expect(apply(next, { type: "request", id: "E1" }).revealed).toHaveLength(1);
  });

  it("evidence-led play earns the best result in both variants", () => {
    const compromise = play("compromise", BEST_COMPROMISE);
    expect(compromise.decisions.map((d) => d.grade)).toEqual(["best", "best", "best"]);
    expect(scoreOf(compromise).total).toBeGreaterThanOrEqual(95);
    expect(outcomeOf(compromise).payrollExposed).toBe(false);
    expect(outcomeOf(compromise).mailRule).toBe(false);

    const approved = play("approved", BEST_APPROVED);
    expect(approved.decisions.map((d) => d.grade)).toEqual(["best", "best"]);
    expect(scoreOf(approved).total).toBeGreaterThanOrEqual(95);
  });

  it("investigating first is not always right: delay lets the incident progress", () => {
    const always: Command[] = [commit("investigate", "partial"), commit("investigate", "partial"), commit("investigate", "partial")];
    const slow = play("compromise", always);
    const outcome = outcomeOf(slow);
    expect(outcome.payrollExposed).toBe(true);
    expect(outcome.mailRule).toBe(true);
    expect(scoreOf(slow).total).toBeLessThan(scoreOf(play("compromise", BEST_COMPROMISE)).total - 25);
    // With two sources confirmed, more analysis is graded as unjustified delay.
    const confirmed = play("compromise", [commit("investigate", "partial"), { type: "request", id: "E1" }, { type: "request", id: "N1" }, commit("investigate", "partial")]);
    expect(confirmed.decisions[1].grade).toBe("weak");
    expect(confirmed.decisions[1].reasonFit).toBe(0);
  });

  it("supports urgent containment when evidence and impact justify it", () => {
    const state = play("compromise", [{ type: "request", id: "N1" }, commit("contain", "impact", ["N1"], "both")]);
    expect(state.decisions[0].grade).toBe("best");
    expect(state.hostContainedAt).toBe(at(10, 36));
  });

  it("unnecessary containment interrupts work and costs outcome", () => {
    const blind: Command[] = [commit("contain", "impact", ["sig:network"], "both"), commit("standdown", "reversal", ["ev:a-usercall"])];
    const state = play("approved", blind);
    const outcome = outcomeOf(state);
    expect(outcome.exportCut).toBe(true);
    expect(outcome.hostDownMinutes).toBeGreaterThan(0);
    expect(state.decisions[1].grade).toBe("best");
    const score = scoreOf(state);
    expect(score.outcome).toBeLessThan(25);
    expect(score.total).toBeLessThan(scoreOf(play("approved", BEST_APPROVED)).total - 15);
    // The same gamble pays off in a compromise, so it stays defensible, not best.
    expect(state.decisions[0].grade).toBe("defensible");
  });

  it("no single blind opening wins in both variants", () => {
    const openings: Command[][] = [
      [commit("contain", "impact", ["sig:network"], "both"), commit("escalate", "handover", ["sig:network"])],
      [commit("standdown", "approved")],
      [commit("escalate", "impact", ["sig:network"])],
      [commit("monitor", "partial"), commit("monitor", "partial"), commit("monitor", "partial")],
    ];
    for (const opening of openings) {
      const worst = Math.min(scoreOf(play("compromise", opening)).total, scoreOf(play("approved", opening)).total);
      expect(worst).toBeLessThan(80);
    }
  });

  it("standing down on a confirmed compromise is the worst outcome", () => {
    const state = play("compromise", [{ type: "request", id: "E1" }, commit("standdown", "approved", ["E1"])]);
    expect(state.decisions[0].grade).toBe("harmful");
    expect(outcomeOf(state).exposedGb).toBe(3.2);
    expect(outcomeOf(state).fraudAttempt).toBe(true);
    expect(scoreOf(state).total).toBeLessThan(10);
  });

  it("a thin handoff makes responders slower than a correlated one", () => {
    const thin = play("compromise", [commit("escalate", "impact", ["sig:network"])]);
    const full = play("compromise", [{ type: "request", id: "E1" }, commit("investigate", "partial"), { type: "request", id: "N1" }, commit("escalate", "correlated", ["E1", "N1"])]);
    expect(thin.irActAt! - thin.escalatedAt!).toBeGreaterThan(full.irActAt! - full.escalatedAt!);
  });

  it("weak evidence never counts as confirmation, and the location reason is a trap", () => {
    const state = play("compromise", [{ type: "request", id: "L2" }, commit("contain", "location", ["L2"], "account")]);
    expect(state.decisions[0].view.known).toBe(0);
    expect(state.decisions[0].reasonFit).toBe(0);
    expect(state.decisions[0].citeFit).toBe(0);
  });

  it("the case ends after three decisions or a terminal action", () => {
    expect(play("approved", [commit("standdown", "approved")]).ended).toBe(true);
    const three = play("approved", [commit("monitor", "partial"), commit("monitor", "partial"), commit("monitor", "partial")]);
    expect(three.ended).toBe(true);
    expect(outcomeOf(three).caseLeftOpen).toBe(true);
    expect(apply(three, { type: "request", id: "E1" })).toEqual(three);
  });
});
