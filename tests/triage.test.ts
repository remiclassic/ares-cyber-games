import { describe, expect, it } from "vitest";
import { BUSY_MORNING } from "../src/triage/data/scenario";
import { apply, createGame, incidentMembers, laneLoad, summarize } from "../src/triage/sim/engine";
import type { Command, GameState, Lane, Phase, ReasonId } from "../src/triage/sim/types";

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

type Call = [alert: string, lane: Lane, reason: ReasonId];

function round(state: GameState, calls: Call[], inspect = true): void {
  for (const [alert, lane, reason] of calls) {
    if (inspect) must(state, { type: "inspect", alert });
    must(state, { type: "place", alert, lane });
    must(state, { type: "justify", alert, reason });
  }
  must(state, { type: "submit", elapsedSeconds: 40 });
}

// Follows the strongest call for every alert at every phase.
function playBest(state: GameState, link: boolean): void {
  for (const phase of [0, 1, 2] as Phase[]) {
    if (phase === 2 && link) {
      must(state, { type: "link", alert: "phishing", with: "device" });
      must(state, { type: "link", alert: "outbound", with: "backup" });
    }
    round(
      state,
      BUSY_MORNING.alerts.map((alert) => {
        const assessment = alert.assessment[phase];
        // Unlinked, the phishing alert no longer fits in Immediate next to the other two.
        if (phase === 2 && !link && alert.id === "phishing") return [alert.id, "investigate", "confirmed"];
        return [alert.id, assessment.best, assessment.reasons[0]];
      }),
    );
  }
}

describe("scenario", () => {
  it("has six alerts with one assessment per phase", () => {
    expect(BUSY_MORNING.alerts).toHaveLength(6);
    for (const alert of BUSY_MORNING.alerts) expect(alert.assessment).toHaveLength(3);
  });

  it("never treats the severity tag as a valid justification", () => {
    for (const alert of BUSY_MORNING.alerts) {
      for (const assessment of alert.assessment) expect(assessment.reasons).not.toContain("label");
    }
  });

  it("changes the order of urgency with each update", () => {
    const best = (id: string) => BUSY_MORNING.alerts.find((alert) => alert.id === id)!.assessment.map((entry) => entry.best);
    expect(best("outbound")).toEqual(["investigate", "monitor", "monitor"]);
    expect(best("device")).toEqual(["investigate", "investigate", "immediate"]);
    expect(best("admin")).toEqual(["immediate", "immediate", "immediate"]);
  });
});

describe("triage rules", () => {
  it("limits Immediate to analyst capacity, counting a linked incident once", () => {
    const state = createGame(BUSY_MORNING);
    must(state, { type: "place", alert: "admin", lane: "immediate" });
    must(state, { type: "place", alert: "device", lane: "immediate" });
    expect(apply(state, { type: "place", alert: "phishing", lane: "immediate" }).ok).toBe(false);
    must(state, { type: "link", alert: "phishing", with: "device" });
    expect(state.placements.phishing.lane).toBe("immediate");
    expect(laneLoad(state, "immediate")).toBe(2);
  });

  it("moves linked alerts together and asks for a fresh justification", () => {
    const state = createGame(BUSY_MORNING);
    must(state, { type: "place", alert: "backup", lane: "monitor" });
    must(state, { type: "justify", alert: "backup", reason: "expected" });
    must(state, { type: "link", alert: "outbound", with: "backup" });
    expect(incidentMembers(state, "backup").sort()).toEqual(["backup", "outbound"]);
    must(state, { type: "place", alert: "outbound", lane: "investigate" });
    expect(state.placements.backup).toEqual({ lane: "investigate", reason: null });
    must(state, { type: "unlink", alert: "outbound" });
    expect(state.links).toEqual({});
  });

  it("refuses to submit until every alert has a lane and a reason", () => {
    const state = createGame(BUSY_MORNING);
    must(state, { type: "place", alert: "admin", lane: "immediate" });
    expect(apply(state, { type: "submit", elapsedSeconds: 5 }).ok).toBe(false);
    // The shift moves on when the clock runs out.
    must(state, { type: "submit", elapsedSeconds: 120, timedOut: true });
    expect(state.phase).toBe(1);
    expect(state.rounds[0].timedOut).toBe(true);
  });
});

describe("scoring", () => {
  it("gives the best result to evidence-led priorities, revisions, and links", () => {
    const state = createGame(BUSY_MORNING);
    playBest(state, true);
    const summary = summarize(state);
    expect(state.done).toBe(true);
    expect(summary.points).toBe(summary.maxPoints);
    expect(summary.quality).toBe(1);
    expect(summary.revisions).toBe(summary.revisionChances);
    expect(summary.correctLinks).toBe(2);
    expect(summary.criticalCaught).toBe(3);
    expect(summary.evidenceFirst).toBe(summary.decisions);
  });

  it("cannot fit every critical alert in Immediate without linking", () => {
    const state = createGame(BUSY_MORNING);
    round(state, BUSY_MORNING.alerts.map((alert) => [alert.id, alert.assessment[0].best, alert.assessment[0].reasons[0]]));
    round(state, BUSY_MORNING.alerts.map((alert) => [alert.id, alert.assessment[1].best, alert.assessment[1].reasons[0]]));
    must(state, { type: "place", alert: "device", lane: "immediate" });
    expect(apply(state, { type: "place", alert: "phishing", lane: "immediate" }).ok).toBe(false);
  });

  it("penalizes escalating everything alarming", () => {
    const escalate = createGame(BUSY_MORNING);
    for (let phase = 0; phase < 3; phase += 1) {
      round(
        escalate,
        [
          ["admin", "immediate", "label"],
          ["outbound", "immediate", "label"],
          ["backup", "investigate", "label"],
          ["logins", "investigate", "label"],
          ["phishing", "investigate", "label"],
          ["device", "monitor", "label"],
        ],
        false,
      );
    }
    const summary = summarize(escalate);
    expect(summary.unnecessaryEscalations).toBe(1);
    expect(summary.missedCritical).toBe(1);
    expect(summary.reasonsMatched).toBe(0);
    expect(summary.evidenceFirst).toBe(0);
    expect(summary.quality).toBeLessThan(0.4);
  });

  it("penalizes monitoring everything", () => {
    const state = createGame(BUSY_MORNING);
    for (let phase = 0; phase < 3; phase += 1) {
      round(state, BUSY_MORNING.alerts.map((alert) => [alert.id, "monitor", "lowlow"]));
    }
    const summary = summarize(state);
    expect(summary.missedCritical).toBe(3);
    expect(summary.quality).toBeLessThan(0.5);
  });

  it("rewards revising when evidence changes, not standing still", () => {
    const revise = createGame(BUSY_MORNING);
    playBest(revise, false);
    const still = createGame(BUSY_MORNING);
    const first: Call[] = BUSY_MORNING.alerts.map((alert) => [alert.id, alert.assessment[0].best, alert.assessment[0].reasons[0]]);
    round(still, first);
    must(still, { type: "submit", elapsedSeconds: 1 });
    must(still, { type: "submit", elapsedSeconds: 1 });
    expect(summarize(still).revisions).toBe(0);
    expect(summarize(still).points).toBeLessThan(summarize(revise).points);
    // Ignoring new evidence is not an evidence-first decision.
    expect(summarize(still).evidenceFirst).toBeLessThan(summarize(still).decisions);
  });

  it("does not let speed change decision quality", () => {
    const fast = createGame(BUSY_MORNING);
    const slow = createGame(BUSY_MORNING);
    playBest(fast, true);
    playBest(slow, true);
    slow.rounds = slow.rounds.map((entry) => ({ ...entry, elapsedSeconds: 110 }));
    expect(summarize(slow).quality).toBe(summarize(fast).quality);
    expect(summarize(slow).seconds).toBeGreaterThan(summarize(fast).seconds);
  });

  it("penalizes linking unrelated alerts", () => {
    const state = createGame(BUSY_MORNING);
    must(state, { type: "link", alert: "admin", with: "outbound" });
    for (let phase = 0; phase < 3; phase += 1) {
      round(state, BUSY_MORNING.alerts.map((alert) => [alert.id, "investigate", "thin"]));
    }
    expect(summarize(state).wrongLinks).toBe(1);
    expect(summarize(state).correctLinks).toBe(0);
  });
});
