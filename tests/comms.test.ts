import { describe, expect, it } from "vitest";
import { INCIDENTS } from "../src/comms/data";
import {
  PASS_EACH,
  PASS_RATIO,
  TRUST_PASS,
  TRUST_START,
  actionsLeft,
  advance,
  causedBy,
  createGame,
  currentIncident,
  currentRun,
  evidenceOf,
  isGuided,
  scoreRun,
  select,
  sendTurn,
  silenceEvents,
  summarize,
  visibleAsks,
  visibleFacts,
  type Ask,
  type GameState,
  type Style,
} from "../src/comms/engine";

type Chooser = (state: GameState, asks: Ask[]) => Record<string, string>;

function playAll(choose: Chooser): GameState {
  const state = createGame(INCIDENTS);
  while (state.phase !== "done") {
    if (state.phase === "epilogue") {
      advance(state);
      continue;
    }
    const picks = choose(state, visibleAsks(state));
    for (const [askId, draftId] of Object.entries(picks)) select(state, askId, draftId);
    sendTurn(state);
  }
  return state;
}

const plan: Chooser = (state) => currentIncident(state).plan[state.turn] ?? {};

// Answer the first people in the inbox, as many as there are actions, in one style where a draft
// of that style exists (otherwise the fallback style, otherwise nobody).
function inStyle(style: Style, fallback?: Style, onlyLastTurn = false): Chooser {
  return (state, asks) => {
    const incident = currentIncident(state);
    if (onlyLastTurn && state.turn < incident.turns.length - 1) return {};
    const picks: Record<string, string> = {};
    for (const ask of asks) {
      if (Object.keys(picks).length >= incident.actions) break;
      const draft = ask.drafts.find((entry) => entry.style === style) ?? ask.drafts.find((entry) => entry.style === fallback);
      if (draft) picks[ask.id] = draft.id;
    }
    return picks;
  };
}

// The planned audiences each turn, but with another style wherever one is on offer.
function planButStyle(style: Style): Chooser {
  return (state, asks) => {
    const picks: Record<string, string> = {};
    for (const [askId, best] of Object.entries(currentIncident(state).plan[state.turn] ?? {})) {
      const ask = asks.find((entry) => entry.id === askId);
      if (ask) picks[askId] = ask.drafts.find((draft) => draft.style === style)?.id ?? best;
    }
    return picks;
  };
}

const total = (state: GameState) => summarize(state).total;
const LOSE = 0.5; // every named shortcut must end below half the points (the pass bar is 70%)

describe("incident comms: content", () => {
  it("has two incidents: the first coached for its opening turn only, the second not at all", () => {
    expect(INCIDENTS).toHaveLength(2);
    expect(INCIDENTS[0].guided).toBe(true);
    expect(INCIDENTS[0].guideText!.length).toBeGreaterThan(40);
    expect(INCIDENTS[1].guided).toBeFalsy();
    const state = createGame(INCIDENTS);
    expect(isGuided(state)).toBe(true);
    sendTurn(state);
    expect(isGuided(state)).toBe(false);
  });

  it("runs each incident from hour 0 towards a 72-hour deadline, in rising hours", () => {
    for (const incident of INCIDENTS) {
      expect(incident.turns[0].hour).toBe(0);
      expect(incident.deadlineHour).toBe(72);
      const hours = incident.turns.map((turn) => turn.hour);
      expect([...hours].sort((a, b) => a - b)).toEqual(hours);
      expect(hours[hours.length - 1]).toBeLessThan(72);
      expect(incident.objectives.reduce((sum, objective) => sum + objective.points, 0)).toBe(100);
    }
  });

  it("gives every ask 3 or 4 drafts with unique ids, at most one measured, and explanations", () => {
    for (const incident of INCIDENTS) {
      for (const turn of incident.turns) {
        expect(new Set(turn.asks.map((ask) => ask.id)).size).toBe(turn.asks.length);
        for (const ask of turn.asks) {
          expect(ask.drafts.length).toBeGreaterThanOrEqual(3);
          expect(ask.drafts.length).toBeLessThanOrEqual(4);
          expect(new Set(ask.drafts.map((draft) => draft.id)).size).toBe(ask.drafts.length);
          expect(ask.drafts.filter((draft) => draft.style === "measured").length).toBeLessThanOrEqual(1);
          for (const draft of ask.drafts) {
            expect(draft.why.length).toBeGreaterThan(20);
            expect(draft.reaction.length).toBeGreaterThan(5);
          }
        }
      }
    }
  });

  it("does not put the measured draft in the same position every time", () => {
    const positions = new Set<number>();
    for (const incident of INCIDENTS) for (const turn of incident.turns) for (const ask of turn.asks) positions.add(ask.drafts.findIndex((draft) => draft.style === "measured"));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it("covers all ten audiences and uses only fictional .example addresses and a fictional regulator", () => {
    const audiences = new Set(INCIDENTS.flatMap((incident) => incident.turns.flatMap((turn) => turn.asks.map((ask) => ask.audience))));
    expect(audiences.size).toBe(10);
    const text = JSON.stringify(INCIDENTS);
    for (const address of text.match(/[\w.-]+@[\w.-]+/g) ?? []) expect(address).toMatch(/\.example$/);
    expect(text).not.toMatch(/GDPR|HIPAA|ICO\b|CCPA|NIS2/);
    for (const incident of INCIDENTS) expect(incident.deadlineRule).toMatch(/In-game rule.*fictional/);
  });

  it("changes what is confirmed over time", () => {
    for (const incident of INCIDENTS) {
      expect(incident.turns[0].facts.some((fact) => fact.status === "unknown")).toBe(true);
      expect(incident.turns.every((turn) => turn.facts.some((fact) => fact.status === "confirmed"))).toBe(true);
      expect(incident.turns.slice(1).every((turn) => turn.facts.some((fact) => fact.fresh))).toBe(true);
    }
  });

  it("includes one ask where every draft is worse than holding", () => {
    const asks = INCIDENTS[1].turns.flatMap((turn) => turn.asks);
    expect(asks.some((ask) => ask.drafts.every((draft) => draft.style !== "measured"))).toBe(true);
  });
});

describe("incident comms: turn rules", () => {
  it("limits the messages per turn and lets a choice be changed or withdrawn", () => {
    const state = createGame(INCIDENTS);
    expect(actionsLeft(state)).toBe(3);
    expect(select(state, "it", "bridge")).toBe(true);
    expect(select(state, "ceo", "brief")).toBe(true);
    expect(select(state, "legal", "call")).toBe(true);
    expect(actionsLeft(state)).toBe(0);
    expect(select(state, "staff", "alert")).toBe(false);
    expect(select(state, "it", "email")).toBe(true); // changing a draft costs nothing
    expect(select(state, "it", null)).toBe(true);
    expect(actionsLeft(state)).toBe(1);
    expect(select(state, "staff", "alert")).toBe(true);
    expect(select(state, "staff", "nonsense")).toBe(false);
    expect(select(state, "nobody", "x")).toBe(false);
  });

  it("applies trust at once, records the messages and moves the clock", () => {
    const state = createGame(INCIDENTS);
    select(state, "staff", "alert");
    const report = sendTurn(state)!;
    expect(report.sent).toHaveLength(1);
    expect(report.trustBefore.staff).toBe(TRUST_START);
    expect(currentRun(state).trust.staff).toBe(TRUST_START + 10);
    expect(state.turn).toBe(1);
    expect(state.selection).toEqual({});
    expect(currentRun(state).flags).toContain("told:staff");
  });

  it("stops asking once someone has been answered properly, and keeps asking if not", () => {
    const state = createGame(INCIDENTS);
    select(state, "legal", "call");
    sendTurn(state);
    const ids = visibleAsks(state).map((ask) => ask.id);
    expect(ids).not.toContain("legal");
    expect(ids).toContain("staff");
    expect(ids).toContain("insurer");
  });

  it("allows a turn with no messages at all, and ends each incident in an epilogue", () => {
    const state = createGame(INCIDENTS);
    for (let turn = 0; turn < INCIDENTS[0].turns.length; turn++) sendTurn(state);
    expect(state.phase).toBe("epilogue");
    expect(sendTurn(state)).toBeNull();
    advance(state);
    expect(state.phase).toBe("compose");
    expect(state.index).toBe(1);
    expect(currentRun(state).trust.customers).toBe(TRUST_START);
  });

  it("shows facts that depend on what the player did", () => {
    const state = playUntil(1, 1, { 0: { it: "revoke" } });
    expect(visibleFacts(state).some((fact) => fact.text.includes("disabled at 09:20"))).toBe(true);
    const late = playUntil(1, 1, {});
    expect(visibleFacts(late).some((fact) => fact.text.includes("live until 12:00"))).toBe(true);
  });
});

// Play the plan for earlier incidents, then the given picks per turn (plan where not given is NOT used).
function playUntil(incidentIndex: number, turn: number, picks: Record<number, Record<string, string>>): GameState {
  const state = createGame(INCIDENTS);
  while (state.index < incidentIndex) {
    if (state.phase === "epilogue") advance(state);
    else {
      for (const [askId, draftId] of Object.entries(plan(state, []))) select(state, askId, draftId);
      sendTurn(state);
    }
  }
  while (state.phase === "compose" && state.turn < turn) {
    for (const [askId, draftId] of Object.entries(picks[state.turn] ?? {})) expect(select(state, askId, draftId)).toBe(true);
    sendTurn(state);
  }
  return state;
}

const fired = (state: GameState) => currentRun(state).fired.map((event) => event.id);
const firedAt = (state: GameState, id: string) => currentRun(state).fired.find((event) => event.id === id)?.hour;

describe("incident comms: delayed consequences (ransomware)", () => {
  it("emailing the plan over the compromised mail system tips off the attacker next turn", () => {
    const state = playUntil(0, 1, { 0: { it: "email" } });
    expect(fired(state)).toContain("tipped");
    expect(scoreRun(INCIDENTS[0], currentRun(state)).objectives.find((o) => o.id === "channel")!.met).toBe(false);
    const safe = playUntil(0, 1, { 0: { it: "bridge" } });
    expect(fired(safe)).toContain("it-oob");
    expect(fired(safe)).not.toContain("tipped");
  });

  it("“no data affected” at hour 4 is not punished until it is contradicted at hour 30", () => {
    const at12 = playUntil(0, 2, { 1: { press: "no-data" } });
    expect(fired(at12)).not.toContain("no-data-contradicted");
    expect(currentRun(at12).trust.customers).toBeGreaterThan(TRUST_START - 10); // it even felt good at the time
    const at30 = playUntil(0, 3, { 1: { press: "no-data" } });
    expect(firedAt(at30, "no-data-contradicted")).toBe(30);
    expect(currentRun(at30).flags).toContain("contradicted");
    const message = currentRun(at30).sent.find((entry) => entry.askId === "press")!;
    expect(causedBy(currentRun(at30), message).map((event) => event.id)).toContain("no-data-contradicted");
  });

  it("telling customers before the facts are ready forces a retraction later", () => {
    const state = playUntil(0, 3, { 1: { customers: "all-now" } });
    expect(firedAt(state, "retraction")).toBe(30);
    expect(currentRun(state).flags).toContain("retraction");
  });

  it("a member notice that counsel never saw has to be corrected; the same notice after review does not", () => {
    const unreviewed = playUntil(0, 6, { 3: { notice: "direct" } });
    expect(currentRun(unreviewed).sent.find((entry) => entry.askId === "notice")!.unmet).toBe(true);
    expect(fired(unreviewed)).toContain("unreviewed");
    const sameTurn = playUntil(0, 6, { 3: { notice: "direct", legal: "call" } }); // review takes a turn
    expect(fired(sameTurn)).toContain("unreviewed");
    const reviewed = playUntil(0, 6, { 0: { legal: "call" }, 3: { notice: "direct" } });
    expect(fired(reviewed)).not.toContain("unreviewed");
  });

  it("staff told nothing learn it from the press and one of them answers the journalist", () => {
    const silent = playUntil(0, 2, {});
    expect(firedAt(silent, "staff-leak")).toBe(12);
    expect(silenceEvents(currentRun(silent)).map((event) => event.id)).toContain("staff-leak");
    const told = playUntil(0, 2, { 1: { staff: "alert" } });
    expect(fired(told)).not.toContain("staff-leak");
    expect(fired(told)).toContain("staff-held");
    const lied = playUntil(0, 2, { 0: { staff: "maintenance" } });
    expect(fired(lied)).toContain("staff-leak");
  });

  it("missing the notification deadline is a regulatory failure, and a late-but-in-time notice is not", () => {
    const never = playUntil(0, 6, {});
    expect(fired(never)).toContain("deadline-missed");
    expect(scoreRun(INCIDENTS[0], currentRun(never)).deadlineMissed).toBe(true);
    const lastTurn = playUntil(0, 6, { 5: { regulator: "staged" } });
    expect(fired(lastTurn)).not.toContain("deadline-missed");
    expect(fired(lastTurn)).toContain("reg-silent"); // but the Office had already read about it
    expect(scoreRun(INCIDENTS[0], currentRun(lastTurn)).deadlineMissed).toBe(false);
  });

  it("giving the press the numbers is only a problem before affected members have heard", () => {
    const early = playUntil(0, 5, { 3: { "press-update": "numbers" } });
    expect(fired(early)).toContain("press-first");
    const after = playUntil(0, 6, { 0: { legal: "call" }, 3: { notice: "direct" }, 4: { "press-update": "numbers" } });
    expect(fired(after)).not.toContain("press-first");
  });

  it("blame is contradicted once the cause is confirmed, and an unbriefed chief executive improvises", () => {
    const blamed = playUntil(0, 6, { 3: { "staff-update": "name" } });
    expect(firedAt(blamed, "blame-wrong")).toBe(60);
    const unbriefed = playUntil(0, 6, {});
    expect(fired(unbriefed)).toContain("radio-unbriefed");
    const briefed = playUntil(0, 6, { 4: { radio: "lines" } });
    expect(fired(briefed)).not.toContain("radio-unbriefed");
  });

  it("the insurer's 24-hour window and the supplier both punish silence", () => {
    const silent = playUntil(0, 5, {});
    expect(firedAt(silent, "insurer-late")).toBe(30);
    expect(firedAt(silent, "supplier-cut")).toBe(48);
    const prompt = playUntil(0, 5, { 2: { insurer: "notify", supplier: "call" } });
    expect(fired(prompt)).not.toContain("insurer-late");
    expect(fired(prompt)).not.toContain("supplier-cut");
  });
});

describe("incident comms: delayed consequences (open folder)", () => {
  it("not having the link disabled first keeps it live; deleting the folder loses the evidence", () => {
    expect(fired(playUntil(1, 1, {}))).toContain("link-live");
    expect(fired(playUntil(1, 1, { 0: { it: "revoke" } }))).toContain("link-dead");
    expect(fired(playUntil(1, 2, { 0: { it: "delete" } }))).toContain("logs-lost");
  });

  it("describing the folder to 2,300 recipients makes it worse; “nothing sensitive” is contradicted by the log", () => {
    expect(fired(playUntil(1, 1, { 0: { recipients: "contents" } }))).toContain("advertised");
    const state = playUntil(1, 2, { 0: { recipients: "ignore" } });
    expect(firedAt(state, "safe-contradicted")).toBe(10);
  });

  it("blaming the person who reported it backfires, and an unmanaged director draws his own line", () => {
    expect(fired(playUntil(1, 3, { 0: { staff: "example" } }))).toContain("blame-wrong");
    const state = playUntil(1, 5, {});
    expect(fired(state)).toContain("md-alone");
    expect(fired(state)).toContain("deadline-missed");
  });
});

describe("incident comms: scoring", () => {
  it("best play scores the maximum in both incidents and passes", () => {
    const state = playAll(plan);
    const summary = summarize(state);
    for (const incident of summary.incidents) {
      expect(incident.objectives.filter((objective) => !objective.met).map((objective) => objective.id)).toEqual([]);
      expect(incident.earned).toBe(100);
      for (const value of Object.values(incident.trust)) expect(value).toBeGreaterThanOrEqual(TRUST_PASS);
    }
    expect(summary.total).toBe(200);
    expect(summary.max).toBe(200);
    expect(summary.passed).toBe(true);
    expect(state.runs.every((run) => run.fired.every((event) => event.tone === "good"))).toBe(true);
    expect(state.runs.every((run) => run.fired.some((event) => event.id === "one-story"))).toBe(true);
  });

  it("the plan only uses asks and drafts that are on offer, within the action limit", () => {
    const state = createGame(INCIDENTS);
    while (state.phase !== "done") {
      if (state.phase === "epilogue") {
        advance(state);
        continue;
      }
      const picks = Object.entries(plan(state, []));
      expect(picks.length).toBeLessThanOrEqual(currentIncident(state).actions);
      for (const [askId, draftId] of picks) expect(select(state, askId, draftId)).toBe(true);
      sendTurn(state);
    }
  });

  it("“tell everyone everything immediately” loses", () => {
    const state = playAll(inStyle("dump", "measured"));
    console.log("tell everything:", total(state), summarize(state).incidents.map((i) => i.earned));
    expect(total(state)).toBeLessThan(200 * LOSE);
    expect(summarize(state).passed).toBe(false);
    expect(state.runs[0].fired.map((event) => event.id)).toEqual(expect.arrayContaining(["tipped", "retraction"]));
  });

  it("“say nothing until the investigation is finished” loses", () => {
    const state = playAll(inStyle("measured", undefined, true));
    console.log("silence until the last turn:", total(state), summarize(state).incidents.map((i) => i.earned));
    expect(total(state)).toBeLessThan(200 * LOSE);
    const nothing = playAll(() => ({}));
    console.log("silence throughout:", total(nothing));
    expect(total(nothing)).toBe(0);
    expect(summarize(nothing).deadlineMissed).toBe(true);
    expect(summarize(nothing).passed).toBe(false);
  });

  it("“reassure everyone” loses, even when aimed at exactly the right people at the right time", () => {
    const blunt = playAll(inStyle("reassure", "measured"));
    const aimed = playAll(planButStyle("reassure"));
    console.log("reassure everyone:", total(blunt), "| reassure, right people:", total(aimed));
    expect(total(blunt)).toBeLessThan(200 * LOSE);
    expect(total(aimed)).toBeLessThan(200 * LOSE);
    expect(aimed.runs[0].flags).toContain("contradicted");
    expect(aimed.runs[1].flags).toContain("contradicted");
  });

  it("blaming the employee and stalling lose too", () => {
    const blame = playAll(planButStyle("blame"));
    const stall = playAll(inStyle("stall", "reassure"));
    console.log("blame where possible:", total(blame), "| stall:", total(stall));
    expect(total(blame)).toBeLessThan(200 * PASS_RATIO);
    expect(summarize(blame).passed).toBe(false);
    expect(total(stall)).toBeLessThan(200 * LOSE);
  });

  it("the right drafts in the wrong order are not enough: answering whoever is first in the inbox drops the sequencing outcomes", () => {
    const state = playAll(inStyle("measured"));
    const summary = summarize(state);
    console.log("best drafts, inbox order:", summary.total, summary.incidents.map((i) => i.earned));
    expect(summary.total).toBeLessThan(200 * 0.85);
    expect(evidenceOf(state).skills.find((skill) => skill.id === "sequence")!.level).not.toBe("shown");
    expect(state.runs[0].fired.map((event) => event.id)).toContain("unreviewed-statement");
    expect(state.runs[1].fired.map((event) => event.id)).toContain("link-live");
  });

  it("leadership left without a brief fills the silence with reassurance, which is then contradicted", () => {
    const state = playUntil(0, 4, {});
    expect(firedAt(state, "ceo-vacuum")).toBe(12);
    expect(firedAt(state, "no-data-contradicted")).toBe(30);
  });

  it("a missed regulatory deadline fails the game whatever the points", () => {
    const state = playAll((s) => {
      const picks = { ...(currentIncident(s).plan[s.turn] ?? {}) };
      delete picks.regulator;
      delete picks["regulator-update"];
      return picks;
    });
    const summary = summarize(state);
    console.log("perfect except the regulator:", summary.total);
    expect(summary.total).toBeGreaterThanOrEqual(200 * PASS_RATIO);
    expect(summary.deadlineMissed).toBe(true);
    expect(summary.passed).toBe(false);
  });

  it("one early slip costs points later but is recoverable", () => {
    const state = playAll((s) => {
      const picks = { ...(currentIncident(s).plan[s.turn] ?? {}) };
      if (s.index === 0 && s.turn === 1) picks.press = "no-data";
      return picks;
    });
    const first = summarize(state).incidents[0];
    expect(first.objectives.find((objective) => objective.id === "consistent")!.met).toBe(false);
    expect(first.earned).toBeLessThan(100);
    expect(first.earned).toBeGreaterThanOrEqual(70);
  });

  it("one good incident cannot carry a bad one", () => {
    const state = playAll((s) => (s.index === 0 ? planButStyle("reassure")(s, visibleAsks(s)) : plan(s, [])));
    const summary = summarize(state);
    expect(summary.incidents[1].earned).toBe(100);
    expect(summary.incidents[0].earned).toBeLessThan(100 * PASS_EACH);
    expect(summary.passed).toBe(false);
  });
});

describe("incident comms: learning evidence", () => {
  it("is reported per skill, separately from the score", () => {
    const best = evidenceOf(playAll(plan));
    expect(best.skills.map((skill) => skill.id)).toEqual(["confirmed", "sequence", "deadline", "channel", "story"]);
    expect(best.skills.every((skill) => skill.level === "shown" && skill.of > 0)).toBe(true);
    expect(best.styles.measured).toBe(best.messages);
    expect(best.unaided!.title).toBe(INCIDENTS[1].title);
    expect(best.unaided!.met).toBe(best.unaided!.of);
    expect(best.heldTurns).toBeGreaterThan(0);
    expect(best).not.toHaveProperty("total");
  });

  it("shows which skill a shortcut misses", () => {
    const reassure = evidenceOf(playAll(planButStyle("reassure")));
    expect(reassure.skills.find((skill) => skill.id === "confirmed")!.level).toBe("not-yet");
    expect(reassure.styles.reassure).toBeGreaterThan(10);
    const silent = evidenceOf(playAll(() => ({})));
    expect(silent.skills.every((skill) => skill.level === "not-yet")).toBe(true);
    expect(silent.messages).toBe(0);
  });
});
