import { describe, expect, it } from "vitest";
import { SHIFTS, shiftById } from "../src/dispatch/data/scenarios";
import { COST, createShift, step } from "../src/dispatch/sim/engine";
import { debriefMoments, earnedBadges, outcomeKind, scenarioOf, scoreCase, scoreShift } from "../src/dispatch/sim/scoring";
import type { Action, AnalystId, ClaimMark, Priority, ShiftDef, ShiftState } from "../src/dispatch/sim/types";

const S1 = shiftById("shift-1");
const S2 = shiftById("shift-2");

function run(def: ShiftDef, actions: Action[], from: ShiftState = createShift(def)): ShiftState {
  return actions.reduce((state, action) => step(def, state, action), from);
}

const ask = (caseId: string, ...ids: string[]): Action[] => ids.map((questionId) => ({ type: "ASK", caseId, questionId }));
const guide = (caseId: string, guidanceId: string): Action => ({ type: "GIVE_GUIDANCE", caseId, guidanceId });
const prio = (caseId: string, priority: Priority): Action => ({ type: "SET_PRIORITY", caseId, priority });
const assign = (caseId: string, analystId: AnalystId): Action => ({ type: "HANDOFF", caseId, route: "analyst", analystId });
const close = (caseId: string): Action => ({ type: "HANDOFF", caseId, route: "guidance" });
const claims = (caseId: string, marks: Record<string, ClaimMark>): Action[] =>
  Object.entries(marks).map(([claimId, mark]) => ({ type: "MARK_CLAIM", caseId, claimId, mark }));

const PERFECT_1: Action[] = [
  ...ask("mfa-a", "q-approve"),
  guide("mfa-a", "g-deny"),
  ...ask("mfa-a", "q-active", "q-details", "q-password"),
  prio("mfa-a", "high"),
  ...claims("mfa-a", { "c-own": "confirmed", "c-pw": "confirmed", "c-access": "unresolved" }),
  assign("mfa-a", "jamie"),
  ...ask("files-a", "q-error", "q-scope", "q-change"),
  prio("files-a", "low"),
  guide("files-a", "g-newpath"),
  ...claims("files-a", { "c-seen": "confirmed", "c-reach": "confirmed", "c-data": "unresolved" }),
  close("files-a"),
  ...ask("invoice-a", "q-sender", "q-change", "q-paid"),
  guide("invoice-a", "g-verify"),
  prio("invoice-a", "medium"),
  ...claims("invoice-a", { "c-origin": "confirmed", "c-changed": "confirmed", "c-vendor": "unresolved" }),
  assign("invoice-a", "alex"),
];

const PERFECT_2: Action[] = [
  ...ask("invoice-b", "q-sender", "q-change", "q-paid"),
  guide("invoice-b", "g-verify"),
  prio("invoice-b", "medium"),
  ...claims("invoice-b", { "c-origin": "confirmed", "c-changed": "confirmed", "c-vendor": "unresolved" }),
  assign("invoice-b", "alex"),
  ...ask("mfa-b", "q-details", "q-active"),
  guide("mfa-b", "g-deny"),
  prio("mfa-b", "low"),
  ...claims("mfa-b", { "c-own": "confirmed", "c-pw": "unresolved", "c-access": "unresolved" }),
  close("mfa-b"),
  ...ask("files-b", "q-error"),
  guide("files-b", "g-disconnect"),
  ...ask("files-b", "q-scope", "q-change"),
  prio("files-b", "high"),
  ...claims("files-b", { "c-seen": "confirmed", "c-reach": "confirmed", "c-data": "unresolved" }),
  assign("files-b", "jamie"),
];

describe("authored shifts", () => {
  it.each(SHIFTS.map((s) => [s.id, s] as const))("%s has one benign report and two different priorities", (_id, def) => {
    const benign = def.scenarios.filter((s) => !s.truth.needsAnalyst);
    const real = def.scenarios.filter((s) => s.truth.needsAnalyst);
    expect(benign).toHaveLength(1);
    expect(new Set(real.map((s) => s.truth.priority)).size).toBe(2);
  });

  it("changes order and which report is benign in the variant", () => {
    expect(S1.arrivals.map((a) => scenarioOf(S1, a.caseId).family)).not.toEqual(S2.arrivals.map((a) => scenarioOf(S2, a.caseId).family));
    expect(S1.scenarios.find((s) => !s.truth.needsAnalyst)?.family).not.toBe(S2.scenarios.find((s) => !s.truth.needsAnalyst)?.family);
  });

  it("keeps every claim and question pointing at a real fact", () => {
    for (const def of SHIFTS) {
      for (const sc of def.scenarios) {
        const ids = new Set(sc.facts.map((f) => f.id));
        for (const q of sc.questions) {
          if (q.fact) expect(ids.has(q.fact)).toBe(true);
          if (q.requires) expect(ids.has(q.requires)).toBe(true);
        }
        for (const claim of sc.claims) if (claim.fact) expect(ids.has(claim.fact)).toBe(true);
        expect(sc.guidance.filter((g) => g.quality === "correct")).toHaveLength(1);
        expect(sc.facts.some((f) => f.key && f.justifies?.includes(sc.truth.priority))).toBe(true);
      }
    }
  });
});

describe("a complete successful run", () => {
  it.each([
    ["shift-1", S1, PERFECT_1, ["clean", "rightSized", "clean"]],
    ["shift-2", S2, PERFECT_2, ["clean", "rightSized", "clean"]],
  ] as const)("%s ends with no harm and a full score", (_id, def, actions, outcomes) => {
    const end = run(def, [...actions]);
    expect(end.phase).toBe("ended");
    expect(end.cases.every((c) => c.harmedAt === null && c.status === "resolved")).toBe(true);
    expect(end.cases.map((c) => outcomeKind(scenarioOf(def, c.id), c))).toEqual(outcomes);
    expect(scoreShift(def, end).total).toBe(100);
    expect(end.clock).toBeLessThan(def.length);
    expect(earnedBadges(def, end)).toEqual(expect.arrayContaining(["evidence", "safe-step", "right-sized", "clean-handoff"]));
    expect(debriefMoments(def, end).map((m) => m.tone)).toEqual(["good", "good", "good"]);
  });

  it("is deterministic: the same actions give the same shift", () => {
    expect(run(S1, PERFECT_1)).toEqual(run(S1, PERFECT_1));
  });
});

describe("questions", () => {
  it("records evidence for a useful question and charges time", () => {
    const s = run(S1, ask("mfa-a", "q-approve"));
    expect(s.cases[0].facts).toEqual(["not-approved"]);
    expect(s.clock).toBe(COST.ask);
  });

  it("charges time for irrelevant and repeated questions without adding evidence", () => {
    const s = run(S1, ask("mfa-a", "q-phone", "q-approve", "q-approve"));
    expect(s.cases[0].facts).toEqual(["not-approved"]);
    expect(s.cases[0].wasted).toBe(2);
    expect(s.clock).toBe(3 * COST.ask);
  });

  it("only offers a follow-up once the fact that leads to it is recorded", () => {
    const locked = run(S1, ask("mfa-a", "q-password"));
    expect(locked.clock).toBe(0);
    const unlocked = run(S1, ask("mfa-a", "q-active", "q-password"));
    expect(unlocked.cases[0].facts).toContain("phish");
  });
});

describe("recoverable mistakes", () => {
  it("lets harm happen when questions come before an urgent safe step, then allows recovery", () => {
    const late = run(S1, ask("mfa-a", "q-approve", "q-phone", "q-manager", "q-active"));
    expect(late.cases[0].harmedAt).toBe(8);
    expect(late.cases[0].harmCause).toBe("deadline");

    const end = run(S1, [...ask("mfa-a", "q-password"), guide("mfa-a", "g-deny"), prio("mfa-a", "high"), assign("mfa-a", "jamie")], late);
    const c = end.cases[0];
    const score = scoreCase(scenarioOf(S1, "mfa-a"), c);
    expect(outcomeKind(scenarioOf(S1, "mfa-a"), c)).toBe("recovered");
    expect(score.guidance).toBe(15);
    expect(end.badges).toContain("recovery");
    expect(debriefMoments(S1, end)[0].tone).toBe("mixed");
  });

  it("applies harmful guidance at once and scores a correction below a clean step", () => {
    const bad = run(S1, [guide("mfa-a", "g-approve")]);
    expect(bad.cases[0].harmedAt).toBe(0);
    const fixed = run(S1, [guide("mfa-a", "g-deny")], bad);
    const sc = scenarioOf(S1, "mfa-a");
    expect(scoreCase(sc, bad.cases[0]).guidance).toBe(0);
    expect(scoreCase(sc, fixed.cases[0]).guidance).toBe(15);
  });

  it("frees the analyst when a handoff is recalled", () => {
    const sent = run(S1, [...ask("mfa-a", "q-approve", "q-active", "q-details"), prio("files-a", "high"), assign("files-a", "jamie")]);
    expect(sent.analysts.find((a) => a.id === "jamie")?.task).toBe("files-a");
    const back = step(S1, sent, { type: "REOPEN", caseId: "files-a" });
    expect(back.analysts.find((a) => a.id === "jamie")?.task).toBeNull();
    expect(back.cases[1].status).toBe("open");
    const ok = step(S1, back, assign("mfa-a", "jamie"));
    expect(ok).toBe(back); // no priority yet on mfa-a
    expect(step(S1, step(S1, back, prio("mfa-a", "high")), assign("mfa-a", "jamie")).cases[0].status).toBe("assigned");
  });

  it("gives full priority credit when new evidence justifies a revision", () => {
    const s = run(S1, [prio("mfa-a", "low"), ...ask("mfa-a", "q-active"), prio("mfa-a", "high")]);
    const score = scoreCase(scenarioOf(S1, "mfa-a"), s.cases[0]);
    expect(score.priority).toBe(25);
    expect(s.badges).toContain("recovery");
    const guess = run(S1, [prio("mfa-a", "high")]);
    expect(scoreCase(scenarioOf(S1, "mfa-a"), guess.cases[0]).priority).toBe(15);
  });
});

describe("blanket strategies", () => {
  const everything = (def: ShiftDef, perCase: (caseId: string, i: number) => Action[]): ShiftState => {
    let state = createShift(def);
    def.arrivals.forEach(({ caseId }, i) => {
      while (state.phase === "playing" && state.cases[i].status === "pending") state = step(def, state, { type: "WAIT" });
      for (const action of perCase(caseId, i)) {
        while (action.type === "HANDOFF" && action.route === "analyst" && state.phase === "playing" && !state.analysts.some((a) => a.busyUntil <= state.clock)) {
          state = step(def, state, { type: "WAIT" });
        }
        const free = state.analysts.find((a) => a.busyUntil <= state.clock);
        state = step(def, state, action.type === "HANDOFF" && action.route === "analyst" && free ? assign(caseId, free.id) : action);
      }
    });
    while (state.phase === "playing") state = step(def, state, { type: "WAIT" });
    return state;
  };

  it.each(SHIFTS.map((s) => [s.id, s] as const))("%s: escalating everything as high scores poorly", (_id, def) => {
    const end = everything(def, (caseId) => [prio(caseId, "high"), assign(caseId, "alex")]);
    expect(end.cases.every((c) => c.handoff !== null)).toBe(true);
    expect(scoreShift(def, end).total).toBeLessThan(35);
  });

  it.each(SHIFTS.map((s) => [s.id, s] as const))("%s: closing everything with the first guidance scores poorly", (_id, def) => {
    const end = everything(def, (caseId) => [prio(caseId, "low"), guide(caseId, scenarioOf(def, caseId).guidance[0].id), close(caseId)]);
    expect(end.cases.every((c) => c.status === "resolved")).toBe(true);
    expect(scoreShift(def, end).total).toBeLessThan(60);
  });

  it.each(SHIFTS.map((s) => [s.id, s] as const))("%s: asking every question before acting is not the best run", (_id, def) => {
    const end = everything(def, (caseId) => {
      const sc = scenarioOf(def, caseId);
      const ordered = [...sc.questions.filter((q) => !q.requires), ...sc.questions.filter((q) => q.requires)];
      const correct = sc.guidance.find((g) => g.quality === "correct");
      return [...ask(caseId, ...ordered.map((q) => q.id)), guide(caseId, correct?.id ?? ""), prio(caseId, sc.truth.priority), sc.truth.needsAnalyst ? assign(caseId, "alex") : close(caseId)];
    });
    expect(end.cases.some((c) => c.harmedAt !== null)).toBe(true);
    expect(scoreShift(def, end).total).toBeLessThan(85);
  });
});

describe("handoff and debrief", () => {
  it("treats an unsupported 'confirmed' as wrong and an unasked fact as unresolved", () => {
    const sc = scenarioOf(S1, "invoice-a");
    const end = run(S1, [
      // Arrival, harm deadline, Alex free, arrival.
      ...Array.from({ length: 4 }, (): Action => ({ type: "WAIT" })),
      ...ask("invoice-a", "q-sender"),
      guide("invoice-a", "g-verify"),
      prio("invoice-a", "medium"),
      ...claims("invoice-a", { "c-origin": "confirmed", "c-changed": "confirmed", "c-vendor": "confirmed" }),
      assign("invoice-a", "jamie"),
    ]);
    const c = end.cases[2];
    expect(c.handoff).not.toBeNull();
    // Route (10) + one of three statements right (5).
    expect(scoreCase(sc, c).handoff).toBe(15);
  });

  it("requires a priority before any handoff and guidance before a guidance-only close", () => {
    const s = createShift(S1);
    expect(step(S1, s, assign("mfa-a", "jamie"))).toBe(s);
    const p = step(S1, s, prio("mfa-a", "low"));
    expect(step(S1, p, close("mfa-a"))).toBe(p);
  });

  it("always replays three choices, one per report", () => {
    const end = run(S1, [{ type: "END_SHIFT" }]);
    const moments = debriefMoments(S1, end);
    expect(moments).toHaveLength(3);
    expect(moments.every((m) => m.action && m.consequence && m.explanation && m.mission)).toBe(true);
    expect(scoreShift(S1, end).total).toBe(0);
  });

  it("keeps response time out of the score", () => {
    const slow = run(S1, [{ type: "WAIT" }, ...PERFECT_1.filter((a) => !("caseId" in a) || a.caseId !== "mfa-a")]);
    const fast = run(S1, PERFECT_1);
    const pick = (s: ShiftState) => scoreCase(scenarioOf(S1, "files-a"), s.cases[1]);
    expect(pick(slow).total).toBe(pick(fast).total);
  });
});
