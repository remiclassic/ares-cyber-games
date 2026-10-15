import { BADGES, PRIORITY_LABEL, earnedBadges, guidanceOf, harmDeadline, scenarioOf } from "./scoring";
import type { Action, CaseState, FeedTone, Scenario, ShiftDef, ShiftState } from "./types";

// World reducer in the style of the 120 Dispatch Desk reference: one typed
// action union, one pure step function, time-based events settled after every
// action. Unlike the reference there is no real-time tick: the clock is in
// shift minutes and moves only by the authored cost of each action.

export const COST = { ask: 2, guidance: 1, handoff: 1, reopen: 1 } as const;

export function createShift(def: ShiftDef): ShiftState {
  const state: ShiftState = {
    shiftId: def.id,
    clock: 0,
    phase: "playing",
    cases: def.arrivals.map(({ caseId, at }) => ({
      id: caseId,
      status: "pending",
      arrivesAt: at,
      transcript: [{ speaker: "them", text: scenarioOf(def, caseId).opening }],
      mood: "worried",
      asked: [],
      facts: [],
      wasted: 0,
      priority: null,
      priorityLog: [],
      guidanceLog: [],
      harmedAt: null,
      harmCause: null,
      claims: {},
      handoff: null,
      reopens: 0,
      resolvedAt: null,
    })),
    analysts: def.analysts.map((a) => ({ id: a.id, name: a.name, busyUntil: a.busyUntil, busyFrom: 0, task: a.busyUntil > 0 ? "earlier" : null })),
    feed: [],
    log: [],
    badges: [],
    seq: 0,
  };
  settle(def, state);
  return state;
}

function notify(s: ShiftState, at: number, tone: FeedTone, title: string, detail: string, caseId: string | null): void {
  s.feed.push({ id: s.seq++, at, tone, title, detail, caseId });
}

function record(s: ShiftState, at: number, caseId: string | null, kind: string, detail: string): void {
  s.log.push({ at, caseId, kind, detail });
}

function harmPrevented(sc: Scenario, c: CaseState, deadline: number): boolean {
  if (c.guidanceLog.some((g) => g.at < deadline && guidanceOf(sc, g.id).quality === "correct")) return true;
  return c.handoff?.route === "analyst" && c.handoff.endsAt <= deadline;
}

// Apply everything that is due at the current clock.
function settle(def: ShiftDef, s: ShiftState): void {
  for (const c of s.cases) {
    const sc = scenarioOf(def, c.id);
    if (c.status === "pending" && c.arrivesAt <= s.clock) {
      c.status = "open";
      notify(s, c.arrivesAt, "info", "New report", `${sc.reporter.name}, ${sc.reporter.deptLabel}: ${sc.title}`, c.id);
      record(s, c.arrivesAt, c.id, "arrived", sc.title);
    }
    const deadline = harmDeadline(sc, c);
    if (sc.harm && deadline !== null && c.status !== "pending" && c.harmedAt === null && deadline <= s.clock && !harmPrevented(sc, c, deadline)) {
      c.harmedAt = deadline;
      c.harmCause = "deadline";
      c.mood = "alarmed";
      c.transcript.push({ speaker: "system", text: sc.harm.text });
      notify(s, deadline, "bad", sc.harm.headline, "You can still recover: give a safe next step and get an analyst on it.", c.id);
      record(s, deadline, c.id, "harm", sc.harm.headline);
    }
    if (c.status === "assigned" && c.handoff && c.handoff.endsAt <= s.clock) {
      c.status = "resolved";
      c.resolvedAt = c.handoff.endsAt;
      const analyst = s.analysts.find((a) => a.id === c.handoff?.analystId);
      notify(s, c.handoff.endsAt, "good", "Case resolved", `${analyst?.name ?? "The analyst"} finished "${sc.title}".`, c.id);
      record(s, c.handoff.endsAt, c.id, "resolved", "analyst finished");
    }
  }
  for (const a of s.analysts) {
    if (a.task !== null && a.busyUntil <= s.clock) {
      if (a.task === "earlier") notify(s, a.busyUntil, "info", `${a.name} is available`, "Finished an earlier ticket.", null);
      a.task = null;
    }
  }
  for (const id of earnedBadges(def, s)) {
    if (s.badges.includes(id)) continue;
    s.badges.push(id);
    notify(s, s.clock, "badge", `Badge: ${BADGES[id].label}`, BADGES[id].detail, null);
  }
  if (s.clock >= def.length || s.cases.every((c) => c.status === "resolved")) s.phase = "ended";
}

export function nextEventTime(def: ShiftDef, s: ShiftState): number {
  const times: number[] = [def.length];
  for (const c of s.cases) {
    if (c.status === "pending") times.push(c.arrivesAt);
    const sc = scenarioOf(def, c.id);
    const deadline = harmDeadline(sc, c);
    if (deadline !== null && c.harmedAt === null && !harmPrevented(sc, c, deadline)) times.push(deadline);
  }
  for (const a of s.analysts) times.push(a.busyUntil);
  return Math.min(...times.filter((t) => t > s.clock));
}

function advanceTo(def: ShiftDef, s: ShiftState, time: number): void {
  s.clock = Math.min(time, def.length);
  settle(def, s);
}

export function availableQuestions(sc: Scenario, c: CaseState) {
  return sc.questions.filter((q) => !q.requires || c.facts.includes(q.requires));
}

export function analystFree(s: ShiftState, analystId: string): boolean {
  const a = s.analysts.find((x) => x.id === analystId);
  return a !== undefined && a.busyUntil <= s.clock;
}

// Why a handoff is not possible yet, or null when it is.
export function handoffBlocker(c: CaseState, route: "analyst" | "guidance"): string | null {
  if (c.status !== "open") return "This case is not open.";
  if (c.priority === null) return "Set a priority first.";
  if (route === "guidance" && c.guidanceLog.length === 0) return "Give a next step first.";
  return null;
}

export function canReopen(c: CaseState): boolean {
  return c.status === "assigned" || (c.status === "resolved" && c.handoff?.route === "guidance");
}

function apply(def: ShiftDef, s: ShiftState, action: Action): number | null {
  if (action.type === "END_SHIFT") {
    s.phase = "ended";
    record(s, s.clock, null, "ended", "shift ended by learner");
    return 0;
  }
  if (action.type === "WAIT") {
    record(s, s.clock, null, "waited", "");
    return nextEventTime(def, s) - s.clock;
  }

  const c = s.cases.find((x) => x.id === action.caseId);
  if (!c) return null;
  const sc = scenarioOf(def, c.id);
  const who = sc.reporter.first;

  if (action.type === "REOPEN") {
    if (!canReopen(c)) return null;
    const analyst = s.analysts.find((a) => a.id === c.handoff?.analystId);
    if (analyst) {
      analyst.busyUntil = s.clock;
      analyst.task = null;
    }
    c.status = "open";
    c.handoff = null;
    c.resolvedAt = null;
    c.reopens += 1;
    notify(s, s.clock, "info", "Case reopened", analyst ? `${analyst.name} is free again.` : `"${sc.title}" is back on your desk.`, c.id);
    record(s, s.clock, c.id, "reopened", analyst ? `recalled ${analyst.id}` : "reopened");
    return COST.reopen;
  }

  if (c.status !== "open") return null;

  switch (action.type) {
    case "ASK": {
      const q = availableQuestions(sc, c).find((x) => x.id === action.questionId);
      if (!q) return null;
      const repeated = c.asked.includes(q.id);
      c.asked.push(q.id);
      c.transcript.push({ speaker: "you", text: q.label });
      if (repeated) {
        c.wasted += 1;
        c.mood = "annoyed";
        c.transcript.push({ speaker: "them", text: `Like I said: ${q.reply}` });
        notify(s, s.clock, "info", "No new information", `You already asked that. ${COST.ask} minutes used.`, c.id);
      } else {
        c.mood = q.mood ?? "neutral";
        c.transcript.push({ speaker: "them", text: q.reply });
        const fact = sc.facts.find((f) => f.id === q.fact);
        if (fact) {
          c.facts.push(fact.id);
          notify(s, s.clock, "good", "Useful evidence", fact.text, c.id);
        } else {
          c.wasted += 1;
          notify(s, s.clock, "info", "No new information", `That did not add evidence. ${COST.ask} minutes used.`, c.id);
        }
      }
      record(s, s.clock, c.id, "asked", q.id);
      return COST.ask;
    }
    case "SET_PRIORITY": {
      if (c.priority === action.priority) return null;
      const revised = c.priority !== null;
      c.priority = action.priority;
      c.priorityLog.push({ at: s.clock, priority: action.priority, facts: [...c.facts] });
      notify(s, s.clock, "info", revised ? "Priority revised" : "Priority set", `${PRIORITY_LABEL[action.priority]}, with ${c.facts.length} fact${c.facts.length === 1 ? "" : "s"} recorded.`, c.id);
      record(s, s.clock, c.id, "prioritised", action.priority);
      return 0;
    }
    case "GIVE_GUIDANCE": {
      const g = sc.guidance.find((x) => x.id === action.guidanceId);
      if (!g) return null;
      c.guidanceLog.push({ at: s.clock, id: g.id });
      c.transcript.push({ speaker: "you", text: g.label }, { speaker: "them", text: g.reply });
      c.mood = g.mood;
      if (g.quality === "correct") {
        notify(s, s.clock, "good", "Safe next step given", `${who} knows what to do.`, c.id);
      } else if (g.quality === "harmful") {
        if (c.harmedAt === null) {
          c.harmedAt = s.clock;
          c.harmCause = "guidance";
        }
        c.transcript.push({ speaker: "system", text: g.consequence ?? "" });
        notify(s, s.clock, "bad", "That made it worse", `${g.consequence ?? ""} You can still correct it.`, c.id);
      } else {
        notify(s, s.clock, "info", "That did not help", g.consequence ?? "", c.id);
      }
      record(s, s.clock, c.id, "guided", g.id);
      return COST.guidance;
    }
    case "MARK_CLAIM": {
      if (!sc.claims.some((x) => x.id === action.claimId) || c.claims[action.claimId] === action.mark) return null;
      c.claims[action.claimId] = action.mark;
      record(s, s.clock, c.id, "marked", `${action.claimId}=${action.mark}`);
      return 0;
    }
    case "HANDOFF": {
      if (handoffBlocker(c, action.route) !== null) return null;
      if (action.route === "analyst") {
        const analyst = s.analysts.find((a) => a.id === action.analystId);
        if (!analyst || analyst.busyUntil > s.clock) return null;
        const endsAt = s.clock + COST.handoff + sc.analystMinutes;
        c.handoff = { at: s.clock, route: "analyst", analystId: analyst.id, endsAt };
        c.status = "assigned";
        analyst.busyFrom = s.clock;
        analyst.busyUntil = endsAt;
        analyst.task = c.id;
        notify(s, s.clock, "good", `${analyst.name} assigned`, `"${sc.title}" handed off at ${PRIORITY_LABEL[c.priority ?? "low"]} priority. About ${sc.analystMinutes} minutes.`, c.id);
        record(s, s.clock, c.id, "handed-off", `analyst:${analyst.id}`);
      } else {
        c.handoff = { at: s.clock, route: "guidance", analystId: null, endsAt: s.clock + COST.handoff };
        c.status = "resolved";
        c.resolvedAt = s.clock + COST.handoff;
        notify(s, s.clock, "info", "Closed with guidance", `"${sc.title}" closed without an analyst.`, c.id);
        record(s, s.clock, c.id, "handed-off", "guidance");
      }
      return COST.handoff;
    }
  }
}

export function step(def: ShiftDef, prev: ShiftState, action: Action): ShiftState {
  if (prev.phase === "ended") return prev;
  const s = structuredClone(prev);
  const minutes = apply(def, s, action);
  if (minutes === null) return prev;
  if (s.phase === "playing") advanceTo(def, s, s.clock + minutes);
  // Nothing on the desk: move on to whatever happens next.
  while (s.phase === "playing" && !s.cases.some((c) => c.status === "open")) advanceTo(def, s, nextEventTime(def, s));
  return s;
}
