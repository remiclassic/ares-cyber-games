import { describe, expect, it } from "vitest";
import { FULL_INCIDENTS, INCIDENTS, QUICK_INCIDENTS } from "../src/timeline/data";
import {
  CHECK_PENALTY,
  CONTROLS,
  CONTROL_MAX,
  LATE_MIN,
  LATE_PENALTY,
  MARK_MAX,
  MAX_FAILED_CHECKS,
  ORDER_MAX,
  ROUND_MAX,
  at,
  canLockIn,
  check,
  chooseControl,
  constraints,
  controlPoints,
  earliestControls,
  evaluateControl,
  evidenceFor,
  hint,
  isValidOrder,
  lockIn,
  markPoints,
  markStop,
  moveBy,
  moveTo,
  newRound,
  objectives,
  scoreRound,
  timeLabel,
  trueOrder,
  uniqueOrder,
  violations,
  visibleOrder,
  type ControlId,
  type Incident,
  type Round,
  type TimelineEvent,
} from "../src/timeline/engine";

const byId = (incident: Incident, id: string) => incident.events.find((e) => e.id === id)!;

function solve(round: Round): void {
  round.order = trueOrder(round.incident);
}

function play(incident: Incident, control: ControlId, mark: "right" | string = "right", seed = 7): Round {
  const round = newRound(incident, seed);
  solve(round);
  check(round);
  chooseControl(round, control);
  markStop(round, mark === "right" ? (incident.controls[control].stops ?? incident.events[0].id) : mark);
  lockIn(round);
  return round;
}

describe("breach timeline content", () => {
  it("has 3+ full incidents, a guided first one, and short quick incidents", () => {
    expect(FULL_INCIDENTS.length).toBeGreaterThanOrEqual(3);
    expect(FULL_INCIDENTS[0].guided).toBe(true);
    expect(QUICK_INCIDENTS.length).toBeGreaterThanOrEqual(1);
    for (const incident of QUICK_INCIDENTS) expect(incident.events.length).toBeLessThanOrEqual(6);
    expect(new Set(INCIDENTS.map((i) => i.id)).size).toBe(INCIDENTS.length);
  });

  for (const incident of INCIDENTS) {
    describe(incident.title, () => {
      it("is well formed: unique ids, true times ascending, dependencies point backwards", () => {
        const ids = trueOrder(incident);
        expect(new Set(ids).size).toBe(ids.length);
        incident.events.forEach((event, i) => {
          if (i > 0) expect(event.at).toBeGreaterThan(incident.events[i - 1].at);
          for (const dep of event.after) {
            expect(ids.indexOf(dep.id)).toBeGreaterThanOrEqual(0);
            expect(ids.indexOf(dep.id)).toBeLessThan(i);
            expect(dep.why.length).toBeGreaterThan(10);
          }
          expect(event.clue.length).toBeGreaterThan(5);
        });
        expect(incident.summary.headline && incident.summary.body && incident.summary.lesson).toBeTruthy();
      });

      it("all clues together settle exactly one order: the true one", () => {
        expect(uniqueOrder(incident)).toEqual(trueOrder(incident));
      });

      it("timestamps alone do not settle the order (dependency reasoning is required)", () => {
        expect(incident.events.some((e) => e.mask === "none")).toBe(true);
        expect(uniqueOrder(incident, ["time"])).toBeNull();
      });

      it("rates all five controls, at least one works, and some don't", () => {
        for (const control of CONTROLS) {
          const effect = incident.controls[control.id];
          expect(effect.why.length).toBeGreaterThan(10);
          if (effect.stops !== null) expect(trueOrder(incident)).toContain(effect.stops);
        }
        expect(CONTROLS.some((c) => incident.controls[c.id].stops !== null)).toBe(true);
        expect(CONTROLS.some((c) => incident.controls[c.id].stops === null)).toBe(true);
      });
    });
  }

  it("no single control is the earliest in every incident", () => {
    for (const control of CONTROLS) expect(INCIDENTS.every((incident) => earliestControls(incident).includes(control.id))).toBe(false);
    expect(FULL_INCIDENTS.every((incident) => earliestControls(incident).includes("edr"))).toBe(false);
  });
});

describe("timestamps", () => {
  const ev = (at: number, mask: TimelineEvent["mask"]): TimelineEvent => ({ id: String(at) + mask, short: "x", text: "x", at, mask, after: [], clue: "x" });

  it("labels hide what the mask hides", () => {
    expect(timeLabel(ev(at(0, "08:52"), "full"))).toBe("Mon 08:52");
    expect(timeLabel(ev(at(0, "23:26"), "hour"))).toBe("Mon 23:··");
    expect(timeLabel(ev(at(7, "01:15"), "day"))).toBe("Mon ··:··");
    expect(timeLabel(ev(at(1, "01:15"), "none"))).toBe("Time not logged");
  });

  it("only proves an order from what is visible", () => {
    expect(visibleOrder(ev(at(0, "08:00"), "full"), ev(at(0, "08:30"), "full"))).toBe(-1);
    expect(visibleOrder(ev(at(0, "08:00"), "full"), ev(at(0, "08:30"), "hour"))).toBe(0); // same hour
    expect(visibleOrder(ev(at(0, "08:00"), "hour"), ev(at(0, "09:30"), "hour"))).toBe(-1);
    expect(visibleOrder(ev(at(0, "08:00"), "day"), ev(at(0, "09:30"), "full"))).toBe(0); // same day
    expect(visibleOrder(ev(at(1, "08:00"), "day"), ev(at(0, "09:30"), "full"))).toBe(1);
    expect(visibleOrder(ev(at(0, "08:00"), "none"), ev(at(5, "09:30"), "full"))).toBe(0);
  });
});

describe("ordering validation", () => {
  const incident = FULL_INCIDENTS[0];

  it("accepts the true order and rejects a dependency break", () => {
    expect(isValidOrder(incident, trueOrder(incident))).toBe(true);
    const order = trueOrder(incident);
    // Credentials entered before the phishing email arrived: both untimed vs timed, so only the
    // dependency catches it.
    [order[0], order[1]] = [order[1], order[0]];
    const broken = violations(incident, order);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ before: "pp1", after: "pp2", kind: "dependency" });
    expect(isValidOrder(incident, order)).toBe(false);
  });

  it("rejects a timestamp break and explains it with the stamps", () => {
    const order = trueOrder(incident);
    const i = order.indexOf("pp4");
    [order[i], order[i + 1]] = [order[i + 1], order[i]]; // file server (Tue) before mailbox rule (Mon)
    const broken = violations(incident, order);
    expect(broken).toHaveLength(1);
    expect(broken[0].kind).toBe("time");
    expect(broken[0].why).toContain("Mon 23:··");
  });

  it("sorting by visible time (unlogged cards last) is not a valid order", () => {
    for (const inc of INCIDENTS) {
      const naive = [...inc.events].sort((a, b) => (a.mask === "none" ? 1 : 0) - (b.mask === "none" ? 1 : 0) || a.at - b.at).map((e) => e.id);
      expect(isValidOrder(inc, naive)).toBe(false);
    }
  });

  it("rejects orders with missing or duplicated cards", () => {
    const order = trueOrder(incident);
    expect(isValidOrder(incident, order.slice(1))).toBe(false);
    expect(isValidOrder(incident, [...order.slice(1), order[1]])).toBe(false);
  });

  it("deals a shuffled, not-yet-valid order containing every card", () => {
    for (const inc of INCIDENTS)
      for (const seed of [1, 2, 3, 99]) {
        const round = newRound(inc, seed);
        expect([...round.order].sort()).toEqual([...trueOrder(inc)].sort());
        expect(isValidOrder(inc, round.order)).toBe(false);
      }
  });

  it("moves cards by drag target or by one step, clamped", () => {
    const round = newRound(incident, 3);
    const id = round.order[2];
    expect(moveBy(round, id, -1)).toBe(true);
    expect(round.order[1]).toBe(id);
    expect(moveTo(round, id, 99)).toBe(true);
    expect(round.order[round.order.length - 1]).toBe(id);
    expect(moveBy(round, id, 1)).toBe(false);
    expect(moveTo(round, "nope", 0)).toBe(false);
  });

  it("dependency constraints come from content and include 'can't log in before credentials are stolen'", () => {
    const deps = constraints(incident, ["dependency"]);
    expect(deps).toContainEqual(expect.objectContaining({ before: "pp2", after: "pp3", kind: "dependency" }));
    expect(byId(incident, "pp3").after[0].why).toMatch(/password/);
  });
});

describe("checking", () => {
  const incident = FULL_INCIDENTS[1];

  it("a correct first check moves to the control phase with full order points", () => {
    const round = newRound(incident, 5);
    solve(round);
    const result = check(round)!;
    expect(result.ok).toBe(true);
    expect(round.phase).toBe("control");
    expect(scoreRound(round).order).toBe(ORDER_MAX);
    expect(check(round)).toBeNull();
  });

  it("each failed check costs points and explains one broken clue from the start of the story", () => {
    const round = newRound(incident, 5);
    round.order = trueOrder(incident).reverse();
    const result = check(round)!;
    expect(result.ok).toBe(false);
    expect(result.explained).toMatchObject({ after: trueOrder(incident)[1], kind: "dependency" });
    expect(result.satisfied).toBeLessThan(result.total);
    expect(round.slips.dependency).toBeGreaterThan(0);
    solve(round);
    check(round);
    expect(scoreRound(round).order).toBe(ORDER_MAX - CHECK_PENALTY);
  });

  it("running out of checks lays out the true order for zero order points", () => {
    const round = newRound(incident, 5);
    round.order = trueOrder(incident).reverse();
    for (let i = 0; i < MAX_FAILED_CHECKS; i += 1) check(round);
    expect(round.revealed).toBe(true);
    expect(round.phase).toBe("control");
    expect(round.order).toEqual(trueOrder(incident));
    expect(scoreRound(round).order).toBe(0);
  });

  it("hints reveal a relevant clue, are counted, and never cost points", () => {
    const round = newRound(incident, 5);
    round.order = trueOrder(incident).reverse();
    const first = hint(round)!;
    expect(first.id).toBe(trueOrder(incident)[1]);
    hint(round);
    expect(round.hints).toHaveLength(2);
    solve(round);
    check(round);
    expect(scoreRound(round).order).toBe(ORDER_MAX);
    expect(evidenceFor(round)).toMatchObject({ orderFirstTry: true, unaided: false, hints: 2 });
  });
});

describe("control evaluation", () => {
  const payroll = FULL_INCIDENTS[0];
  const push = FULL_INCIDENTS[1];
  const invoice = FULL_INCIDENTS[2];

  it("ranks earliest, later and ineffective controls", () => {
    expect(evaluateControl(payroll, "mfa")).toMatchObject({ verdict: "earliest", stops: "pp3", stepsLate: 0 });
    expect(evaluateControl(payroll, "geo").verdict).toBe("earliest"); // a tie is allowed
    expect(evaluateControl(payroll, "edr")).toMatchObject({ verdict: "later", stepsLate: 3 });
    expect(evaluateControl(payroll, "mail").verdict).toBe("none");
    expect(earliestControls(payroll).sort()).toEqual(["geo", "mfa"]);
  });

  it("MFA that was already beaten doesn't count; the 'big' control can be right or late", () => {
    expect(evaluateControl(push, "mfa").verdict).toBe("none");
    expect(earliestControls(push)).toEqual(["edr"]);
    expect(evaluateControl(invoice, "edr")).toMatchObject({ verdict: "later", stepsLate: 1 });
    expect(earliestControls(invoice)).toEqual(["mail"]);
  });

  it("points: earliest full, later reduced per step (with a floor), none zero", () => {
    expect(controlPoints(invoice, "mail")).toBe(CONTROL_MAX);
    expect(controlPoints(invoice, "edr")).toBe(CONTROL_MAX - LATE_PENALTY);
    expect(controlPoints(payroll, "egress")).toBeGreaterThanOrEqual(LATE_MIN);
    expect(controlPoints(payroll, "egress")).toBeLessThan(controlPoints(payroll, "edr"));
    expect(controlPoints(invoice, "egress")).toBe(0);
    expect(controlPoints(invoice, null)).toBe(0);
  });

  it("the stop mark only scores on the step the chosen control actually stops", () => {
    expect(markPoints(payroll, "mfa", "pp3")).toBe(MARK_MAX);
    expect(markPoints(payroll, "mfa", "pp4")).toBe(0);
    expect(markPoints(payroll, "mail", "pp1")).toBe(0); // the filter would not have caught it
  });

  it("needs a control and a mark before locking in, and only after the order is checked", () => {
    const round = newRound(invoice, 2);
    expect(chooseControl(round, "mail")).toBe(false);
    solve(round);
    check(round);
    expect(canLockIn(round)).toBe(false);
    chooseControl(round, "mail");
    expect(lockIn(round)).toBe(false);
    markStop(round, "iz1");
    expect(lockIn(round)).toBe(true);
    expect(moveBy(round, "iz1", 1)).toBe(false);
    expect(scoreRound(round)).toEqual({ order: ORDER_MAX, control: CONTROL_MAX, mark: MARK_MAX, total: ROUND_MAX });
  });
});

describe("scoring and shortcuts", () => {
  const best = (incident: Incident) => scoreRound(play(incident, earliestControls(incident)[0])).total;

  it("perfect play scores 100 per incident", () => {
    for (const incident of INCIDENTS) expect(best(incident)).toBe(ROUND_MAX);
  });

  it("always picking the same control scores less than picking the earliest one", () => {
    const optimum = FULL_INCIDENTS.reduce((s, i) => s + best(i), 0);
    for (const control of CONTROLS) {
      const fixed = FULL_INCIDENTS.reduce((s, i) => s + scoreRound(play(i, control.id)).total, 0);
      expect(fixed).toBeLessThan(optimum);
    }
  });

  it("the 'biggest' control (EDR) or the last line (egress) loses to earliest in most incidents", () => {
    const worse = INCIDENTS.filter((i) => scoreRound(play(i, "edr")).total < best(i)).length;
    expect(worse).toBeGreaterThan(INCIDENTS.length / 2);
    for (const incident of INCIDENTS) expect(scoreRound(play(incident, "egress")).total).toBeLessThan(best(incident));
  });

  it("guessing the order by brute force (3 failed checks) caps the round well below a reasoned one", () => {
    const incident = FULL_INCIDENTS[2];
    const round = newRound(incident, 4);
    for (let i = 0; i < MAX_FAILED_CHECKS; i += 1) {
      round.order = trueOrder(incident).reverse();
      check(round);
    }
    chooseControl(round, "mail");
    markStop(round, "iz1");
    lockIn(round);
    expect(scoreRound(round).total).toBe(ROUND_MAX - ORDER_MAX);
  });
});

describe("learning evidence is separate from the score", () => {
  it("records reasoning, not points", () => {
    const round = play(FULL_INCIDENTS[1], "egress");
    const evidence = evidenceFor(round);
    expect(evidence).toMatchObject({ orderFirstTry: true, unaided: true, controlVerdict: "later", stepsLate: 2, markCorrect: true });
    expect(Object.keys(evidence)).not.toContain("total");
  });

  it("judges objectives on unguided incidents", () => {
    const evidence = FULL_INCIDENTS.map((incident, i) => evidenceFor(play(incident, i === 0 ? "mail" : earliestControls(incident)[0])));
    const result = objectives(evidence);
    expect(result.find((o) => o.id === "earliest")!.status).toBe("shown"); // the guided miss is ignored
    const mixed = objectives([evidenceFor(play(FULL_INCIDENTS[1], "edr")), evidenceFor(play(FULL_INCIDENTS[2], "egress"))]);
    expect(mixed.find((o) => o.id === "earliest")!.status).toBe("partly");
    expect(objectives([]).every((o) => o.status === "not yet")).toBe(true);
  });
});
