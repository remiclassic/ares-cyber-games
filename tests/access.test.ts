import { describe, expect, it } from "vitest";
import { SCENARIO, SYSTEMS } from "../src/access/data";
import {
  EXCESS_PENALTY,
  GRANTS,
  LINGER_PENALTY,
  PASS_RATIO,
  RENEWAL_PENALTY,
  REQUEST_POINTS,
  UNTIDY_PENALTY,
  bestSelection,
  commit,
  createGame,
  currentRequest,
  cycleGrant,
  evaluate,
  evidenceOf,
  excessLevel,
  hintsAllowed,
  needOn,
  next,
  setGrant,
  startSelection,
  summarize,
  takeHint,
  type GameState,
  type Grant,
  type Request,
  type Selection,
} from "../src/access/engine";

const requests = SCENARIO.requests;
const byId = (id: string): Request => requests.find((request) => request.id === id)!;
const all = (request: Request, grant: Grant): Selection => Object.fromEntries(request.catalogue.map((item) => [item.id, grant]));

// Plays the whole desk, choosing each selection with `pick`.
function playAll(pick: (request: Request) => Selection): GameState {
  const state = createGame(SCENARIO);
  while (state.phase !== "done") {
    const request = currentRequest(state);
    for (const [id, grant] of Object.entries(pick(request))) setGrant(state, id, grant);
    commit(state);
    next(state);
  }
  return state;
}

// Every possible selection for a request (3 states per item).
function* everySelection(request: Request): Generator<Selection> {
  const ids = request.catalogue.map((item) => item.id);
  const count = 3 ** ids.length;
  for (let n = 0; n < count; n += 1) {
    const selection: Record<string, Grant> = {};
    let rest = n;
    for (const id of ids) {
      selection[id] = GRANTS[rest % 3];
      rest = Math.floor(rest / 3);
    }
    yield selection;
  }
}

describe("least privilege: content", () => {
  it("covers a joiner, a mover, a contractor, a manager, a break-glass case and a final", () => {
    expect(requests.map((request) => request.kind)).toEqual(["joiner", "mover", "contractor", "manager", "breakglass", "final"]);
    expect(requests[0].guided).toBe(true);
    expect(requests.filter((request) => request.final)).toHaveLength(1);
    expect(requests[requests.length - 1].final).toBe(true);
  });

  it("is well formed: unique ids, known systems, small catalogues, .example addresses", () => {
    expect(SCENARIO.domain.endsWith(".example")).toBe(true);
    for (const request of requests) {
      const ids = request.catalogue.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(5);
      expect(ids.length).toBeLessThanOrEqual(9); // number keys 1-9
      expect(request.from).toMatch(/@[a-z]+\.example$/);
      for (const address of request.ask.match(/\S+@\S+/g) ?? []) expect(address).toMatch(/\.example\)?[.,]?$/);
      for (const id of [...request.held, ...Object.keys(request.best)]) expect(ids).toContain(id);
      for (const cap of [...request.catalogue.flatMap((item) => item.caps), ...request.tasks.map((task) => task.needs)]) expect(SYSTEMS[cap.system]).toBeTruthy();
      expect(request.tasks.length).toBeGreaterThanOrEqual(2);
      expect(request.catalogue.some((item) => item.kind === "role")).toBe(true);
      expect(request.catalogue.some((item) => item.kind === "right")).toBe(true);
      if (!request.final) expect(request.hint.length).toBeGreaterThan(20);
    }
  });

  it("every grant that can exceed the work has an authored event and blast radius", () => {
    for (const request of requests) {
      const excessive = request.catalogue.filter((item) => excessLevel(request, item));
      expect(excessive.length).toBeGreaterThanOrEqual(2);
      expect(excessive.some((item) => excessLevel(request, item) === "admin")).toBe(true); // "just give admin" is always on the table
      for (const item of excessive) expect(item.risk.text.length).toBeGreaterThan(60);
      // Temporary work granted permanently has its own authored event.
      for (const [id, grant] of Object.entries(request.best)) {
        if (grant === "timed") expect(request.catalogue.find((item) => item.id === id)!.linger?.text.length).toBeGreaterThan(60);
      }
    }
  });

  it("uses all three events across the desk", () => {
    const events = new Set(requests.flatMap((request) => request.catalogue.flatMap((item) => [excessLevel(request, item) ? item.risk.event : null, item.linger?.event ?? null])));
    for (const event of ["phish", "mistake", "leaver"]) expect(events.has(event as "phish")).toBe(true);
  });

  it("the mover and the final hold old access that must go, and baseline access that must stay", () => {
    for (const id of ["mover", "final"]) {
      const request = byId(id);
      expect(request.held.some((held) => !(held in request.best))).toBe(true);
      expect(request.held.some((held) => request.best[held] === "perm")).toBe(true);
    }
    expect(Object.values(byId("contractor").best)).toEqual(["timed"]);
    expect(byId("breakglass").best["right-orderdb-admin"]).toBe("timed");
    expect(byId("manager").best["right-reports-read"]).toBe("timed");
  });
});

describe("least privilege: rules", () => {
  const joiner = byId("joiner");

  it("works out what the tasks need and what goes beyond them", () => {
    expect(needOn(joiner, "ledger")).toBe(2);
    expect(needOn(joiner, "payroll")).toBe(0);
    const item = (id: string) => joiner.catalogue.find((entry) => entry.id === id)!;
    expect(excessLevel(joiner, item("role-ap-clerk"))).toBeNull();
    expect(excessLevel(joiner, item("role-finance-manager"))).toBe("admin");
    expect(excessLevel(joiner, item("right-payroll-read"))).toBe("read");
  });

  it("a task works only when some grant reaches its system at its level", () => {
    const breakglass = byId("breakglass");
    const withWrite = evaluate(breakglass, { "role-on-call": "perm", "right-orderdb-write": "timed" });
    expect(withWrite.tasks.find((task) => task.task === "failover")!.works).toBe(false);
    expect(withWrite.items.find((item) => item.item === "right-orderdb-write")!.issues[0].reason).toBe("too-little");
    const withAdmin = evaluate(breakglass, { "role-on-call": "perm", "right-orderdb-admin": "timed" });
    expect(withAdmin.working).toBe(2);
    expect(withAdmin.perfect).toBe(true);
  });

  it("admin lets the work happen and is still punished as excess", () => {
    const result = evaluate(joiner, { "role-finance-manager": "perm" });
    expect(result.working).toBe(joiner.tasks.length);
    expect(result.incident).toBe(true);
    expect(result.points).toBe(REQUEST_POINTS - EXCESS_PENALTY.admin);
    // A time limit does not shrink an over-broad grant.
    expect(evaluate(joiner, { "role-finance-manager": "timed" }).points).toBe(result.points);
  });

  it("prefers the role: one-off rights and duplicates are clutter", () => {
    const rights = evaluate(joiner, { "right-ledger-write": "perm", "right-purchasing-read": "perm" });
    expect(rights.working).toBe(2);
    expect(rights.items.flatMap((item) => item.issues).map((issue) => issue.reason)).toEqual(["one-off", "one-off"]);
    expect(rights.points).toBe(REQUEST_POINTS - 2 * UNTIDY_PENALTY);
    const both = evaluate(joiner, { "role-ap-clerk": "perm", "right-ledger-write": "perm" });
    expect(both.items.find((item) => item.item === "right-ledger-write")!.issues[0].reason).toBe("duplicate");
    expect(both.items.find((item) => item.item === "role-ap-clerk")!.issues).toHaveLength(0);
  });

  it("temporary work granted permanently lingers; standing work that expires comes back", () => {
    const contractor = byId("contractor");
    const forever = evaluate(contractor, { "role-web-contractor": "perm" });
    expect(forever.working).toBe(2);
    expect(forever.items[0].issues.map((issue) => [issue.kind, issue.event])).toEqual([["linger", "leaver"]]);
    expect(forever.points).toBe(REQUEST_POINTS - LINGER_PENALTY);
    const expiring = evaluate(joiner, { "role-ap-clerk": "timed" });
    expect(expiring.items[0].issues.map((issue) => issue.kind)).toEqual(["renewal"]);
    expect(expiring.points).toBe(REQUEST_POINTS - RENEWAL_PENALTY);
  });

  it("a mover who keeps the old role carries its blast radius; removing the baseline blocks work", () => {
    const mover = byId("mover");
    const kept = evaluate(mover, { ...startSelection(mover), "role-cs-agent": "perm" });
    expect(kept.working).toBe(3);
    expect(kept.items.find((item) => item.item === "role-warehouse-supervisor")!.issues[0].kind).toBe("excess");
    expect(kept.perfect).toBe(false);
    const stripped = evaluate(mover, { "role-cs-agent": "perm" });
    expect(stripped.tasks.find((task) => task.task === "timesheet")!.works).toBe(false);
  });

  it("the authored best set is the unique maximum for every request", () => {
    for (const request of requests) {
      const best = bestSelection(request);
      const top = evaluate(request, best);
      expect(top.points).toBe(REQUEST_POINTS);
      expect(top.perfect).toBe(true);
      expect(top.items.every((item) => item.correct)).toBe(true);
      let perfect = 0;
      for (const selection of everySelection(request)) {
        const result = evaluate(request, selection);
        expect(result.points).toBeLessThanOrEqual(REQUEST_POINTS);
        if (result.points === REQUEST_POINTS) perfect += 1;
      }
      expect(perfect).toBe(1);
    }
  });

  it("commits once per request, cycles grants, and refuses hints on the final request", () => {
    const state = createGame(SCENARIO);
    const first = currentRequest(state).catalogue[0].id;
    expect(cycleGrant(state, first)).toBe("timed");
    expect(cycleGrant(state, first)).toBe("perm");
    expect(cycleGrant(state, first)).toBe("none");
    expect(setGrant(state, "nope", "perm")).toBe(false);
    expect(takeHint(state)).toBeTruthy();
    expect(commit(state)?.hinted).toBe(true);
    expect(commit(state)).toBeNull();
    expect(setGrant(state, first, "perm")).toBe(false);
    next(state);
    expect(state.hinted).toBe(false);
    // A mover arrives already holding access.
    expect(state.selection["role-warehouse-supervisor"]).toBe("perm");
    while (hintsAllowed(state)) {
      commit(state);
      next(state);
    }
    expect(currentRequest(state).final).toBe(true);
    expect(takeHint(state)).toBeNull();
    expect(state.hinted).toBe(false);
  });
});

describe("least privilege: scoring", () => {
  const LOSE = 0.4; // shortcuts must not just miss the pass mark, they must lose badly

  it("best play scores the maximum, passes, and shows every skill", () => {
    const state = playAll(bestSelection);
    const summary = summarize(state);
    expect(summary.total).toBe(summary.max);
    expect(summary.max).toBe(requests.length * REQUEST_POINTS);
    expect(summary.passed).toBe(true);
    expect(summary.incidents).toBe(0);
    expect(summary.tasksWorking).toBe(summary.tasksTotal);
    expect(summary.perfect).toBe(requests.length);
    const evidence = evidenceOf(state);
    expect(evidence.skills.every((skill) => skill.level === "shown")).toBe(true);
    expect(evidence.final).toEqual({ correct: 1, of: 1 });
    expect(evidence.unaided).toEqual({ correct: requests.length, of: requests.length });
  });

  it("grant everything permanently loses badly: the work happens and every request is an incident", () => {
    const state = playAll((request) => all(request, "perm"));
    const summary = summarize(state);
    expect(summary.tasksWorking).toBe(summary.tasksTotal);
    expect(summary.incidents).toBe(requests.length);
    expect(summary.total).toBeLessThan(summary.max * LOSE);
    expect(summary.passed).toBe(false);
    expect(evidenceOf(state).skills.find((skill) => skill.skill === "no-more")!.level).toBe("not-yet");
  });

  it("grant everything time-limited loses just as badly", () => {
    const summary = summarize(playAll((request) => all(request, "timed")));
    expect(summary.total).toBeLessThan(summary.max * LOSE);
    expect(summary.passed).toBe(false);
  });

  it("grant only the admin-level items loses badly", () => {
    const summary = summarize(playAll((request) => Object.fromEntries(request.catalogue.map((item) => [item.id, item.caps.some((cap) => cap.level === "admin") ? "perm" : "none"]))));
    expect(summary.incidents).toBe(requests.length);
    expect(summary.total).toBeLessThan(summary.max * LOSE);
  });

  it("deny everything (strip all access) scores nothing: no credit for safety that stops the work", () => {
    const state = playAll((request) => all(request, "none"));
    const summary = summarize(state);
    expect(summary.tasksWorking).toBe(0);
    expect(summary.incidents).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(false);
    expect(evidenceOf(state).skills.find((skill) => skill.skill === "enough")!.level).toBe("not-yet");
  });

  it("grant nothing new (commit every request untouched) loses badly too", () => {
    const summary = summarize(playAll(() => ({})));
    expect(summary.total).toBeLessThan(summary.max * LOSE);
    expect(summary.passed).toBe(false);
  });

  it("right scope but never time-limiting and never removing misses the pass mark", () => {
    const state = playAll((request) => Object.fromEntries(request.catalogue.map((item) => [item.id, request.held.includes(item.id) || item.id in request.best ? "perm" : "none"])));
    const summary = summarize(state);
    expect(summary.tasksWorking).toBe(summary.tasksTotal);
    expect(summary.lingering).toBeGreaterThanOrEqual(4);
    expect(summary.total).toBeLessThan(summary.max * PASS_RATIO);
    expect(summary.passed).toBe(false);
    const skills = evidenceOf(state).skills;
    expect(skills.find((skill) => skill.skill === "time-limit")!.level).toBe("not-yet");
    expect(skills.find((skill) => skill.skill === "remove")!.level).toBe("not-yet");
    expect(skills.find((skill) => skill.skill === "enough")!.level).toBe("shown");
  });

  it("one-off rights instead of roles still works but is not the maximum", () => {
    const joiner = byId("joiner");
    const state = createGame(SCENARIO);
    setGrant(state, "right-ledger-write", "perm");
    setGrant(state, "right-purchasing-read", "perm");
    const decision = commit(state)!;
    expect(decision.result.points).toBeLessThan(REQUEST_POINTS);
    expect(decision.result.points).toBeGreaterThan(REQUEST_POINTS / 2);
    expect(evidenceOf(state).skills.find((skill) => skill.skill === "role")!.level).toBe("not-yet");
    expect(joiner.best["role-ap-clerk"]).toBe("perm");
  });

  it("keeps learning evidence out of the score: a hint changes the evidence, not the points", () => {
    const hinted = createGame(SCENARIO);
    takeHint(hinted);
    for (const [id, grant] of Object.entries(bestSelection(currentRequest(hinted)))) setGrant(hinted, id, grant);
    commit(hinted);
    expect(summarize(hinted).total).toBe(REQUEST_POINTS);
    expect(summarize(hinted).hints).toBe(1);
    expect(evidenceOf(hinted).unaided).toEqual({ correct: 0, of: 0 });
  });
});
