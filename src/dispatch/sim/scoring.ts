import type { CaseState, Guidance, OutcomeKind, Priority, Scenario, ShiftDef, ShiftState } from "./types";

// Scoring looks only at decision quality. Response time is reported next to
// it and never mixed in, and nothing here counts how many cases were closed.

export function scenarioOf(def: ShiftDef, caseId: string): Scenario {
  const found = def.scenarios.find((s) => s.id === caseId);
  if (!found) throw new Error(`no scenario ${caseId}`);
  return found;
}

export function guidanceOf(sc: Scenario, id: string): Guidance {
  const found = sc.guidance.find((g) => g.id === id);
  if (!found) throw new Error(`no guidance ${id}`);
  return found;
}

const RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

function supports(sc: Scenario, facts: readonly string[], priority: Priority): boolean {
  return sc.facts.some((f) => facts.includes(f.id) && f.justifies?.includes(priority));
}

export function harmDeadline(sc: Scenario, c: CaseState): number | null {
  return sc.harm ? c.arrivesAt + sc.harm.afterMinutes : null;
}

function finalGuidance(sc: Scenario, c: CaseState): Guidance | null {
  const last = c.guidanceLog[c.guidanceLog.length - 1];
  return last ? guidanceOf(sc, last.id) : null;
}

function routeCorrect(sc: Scenario, c: CaseState): boolean {
  return c.handoff !== null && (c.handoff.route === "analyst") === sc.truth.needsAnalyst;
}

export function claimCorrect(sc: Scenario, c: CaseState, claimId: string): boolean {
  const claim = sc.claims.find((x) => x.id === claimId);
  if (!claim) return false;
  const supported = claim.fact !== null && c.facts.includes(claim.fact);
  return c.claims[claimId] === (supported ? "confirmed" : "unresolved");
}

export type CaseScore = {
  evidence: number;
  priority: number;
  guidance: number;
  handoff: number;
  total: number;
  priorityJustified: boolean;
  // Reported separately from the score.
  minutesToSafeStep: number | null;
  minutesToHandoff: number | null;
};

export function scoreCase(sc: Scenario, c: CaseState): CaseScore {
  const keys = sc.facts.filter((f) => f.key);
  const got = keys.filter((f) => c.facts.includes(f.id)).length;
  const evidence = Math.max(0, Math.round((25 * got) / keys.length) - Math.min(9, 3 * c.wasted));

  const lastSet = c.priorityLog[c.priorityLog.length - 1];
  const priorityJustified = lastSet !== undefined && lastSet.priority === sc.truth.priority && supports(sc, lastSet.facts, lastSet.priority);
  let priority = 0;
  if (c.priority !== null) {
    const gap = Math.abs(RANK[c.priority] - RANK[sc.truth.priority]);
    priority = gap === 0 ? (priorityJustified ? 25 : 15) : gap === 1 ? 8 : 0;
  }

  const final = finalGuidance(sc, c);
  const harmed = c.harmedAt !== null;
  const hadWeak = c.guidanceLog.some((g) => guidanceOf(sc, g.id).quality !== "correct");
  let guidance = 0;
  if (final?.quality === "correct") guidance = harmed ? 15 : hadWeak ? 20 : 25;
  else if (final?.quality === "weak") guidance = harmed ? 0 : 8;

  let handoff = 0;
  if (c.handoff) {
    const right = sc.claims.filter((claim) => claimCorrect(sc, c, claim.id)).length;
    handoff = (routeCorrect(sc, c) ? 10 : 0) + Math.round((15 * right) / sc.claims.length);
  }

  const firstSafe = c.guidanceLog.find((g) => guidanceOf(sc, g.id).quality === "correct");
  return {
    evidence,
    priority,
    guidance,
    handoff,
    total: evidence + priority + guidance + handoff,
    priorityJustified,
    minutesToSafeStep: firstSafe ? firstSafe.at - c.arrivesAt : null,
    minutesToHandoff: c.handoff ? c.handoff.at - c.arrivesAt : null,
  };
}

export function outcomeKind(sc: Scenario, c: CaseState): OutcomeKind {
  if (!c.handoff) return "unhandled";
  const harmed = c.harmedAt !== null;
  if (c.handoff.route === "analyst") {
    if (harmed) return "recovered";
    return sc.truth.needsAnalyst ? "clean" : "overEscalated";
  }
  if (harmed) return "harmed";
  return sc.truth.needsAnalyst ? "underhandled" : "rightSized";
}

export function outcomeText(def: ShiftDef, sc: Scenario, c: CaseState): string {
  const analyst = def.analysts.find((a) => a.id === c.handoff?.analystId)?.name ?? "An analyst";
  return sc.outcomes[outcomeKind(sc, c)].replace("{analyst}", analyst);
}

// ---------- badges ----------

export type BadgeId = "evidence" | "safe-step" | "right-sized" | "clean-handoff" | "recovery";

export const BADGES: Record<BadgeId, { label: string; detail: string }> = {
  evidence: { label: "Evidence first", detail: "Every key fact recorded, and a priority your evidence supports." },
  "safe-step": { label: "Safe step in time", detail: "Approved guidance reached the person before harm was done." },
  "right-sized": { label: "Right-sized", detail: "A benign report closed with clear guidance and no analyst time." },
  "clean-handoff": { label: "Clean handoff", detail: "Confirmed facts and open questions kept apart." },
  recovery: { label: "Recovery", detail: "You corrected a mistake while it could still be fixed." },
};

function caseBadges(sc: Scenario, c: CaseState): BadgeId[] {
  const out: BadgeId[] = [];
  const score = scoreCase(sc, c);
  const final = finalGuidance(sc, c);
  const allKeys = sc.facts.filter((f) => f.key).every((f) => c.facts.includes(f.id));
  const deadline = harmDeadline(sc, c);

  if (allKeys && score.priorityJustified && c.wasted === 0) out.push("evidence");
  if (deadline !== null && c.harmedAt === null && c.guidanceLog.some((g) => guidanceOf(sc, g.id).quality === "correct" && g.at < deadline)) out.push("safe-step");
  if (!sc.truth.needsAnalyst && c.handoff?.route === "guidance" && final?.quality === "correct" && c.harmedAt === null) out.push("right-sized");
  if (c.handoff && routeCorrect(sc, c) && sc.claims.every((claim) => claimCorrect(sc, c, claim.id))) out.push("clean-handoff");

  const fixedHarm = c.harmedAt !== null && final?.quality === "correct" && c.handoff?.route === "analyst";
  const fixedRoute = c.reopens > 0 && routeCorrect(sc, c);
  const fixedPriority = score.priorityJustified && c.priorityLog.some((p) => p.priority !== sc.truth.priority);
  if (fixedHarm || fixedRoute || fixedPriority) out.push("recovery");
  return out;
}

export function earnedBadges(def: ShiftDef, state: ShiftState): BadgeId[] {
  const set = new Set<BadgeId>();
  for (const c of state.cases) for (const b of caseBadges(scenarioOf(def, c.id), c)) set.add(b);
  return [...set];
}

// ---------- shift result ----------

export type ShiftScore = {
  total: number;
  evidence: number;
  priority: number;
  guidance: number;
  handoff: number;
  cases: { caseId: string; score: CaseScore; outcome: OutcomeKind }[];
  // Separate from the score.
  averageMinutesToHandoff: number | null;
  shiftMinutesUsed: number;
};

export function scoreShift(def: ShiftDef, state: ShiftState): ShiftScore {
  const cases = state.cases.map((c) => {
    const sc = scenarioOf(def, c.id);
    return { caseId: c.id, score: scoreCase(sc, c), outcome: outcomeKind(sc, c) };
  });
  const mean = (pick: (s: CaseScore) => number) => Math.round(cases.reduce((sum, c) => sum + pick(c.score), 0) / cases.length);
  const times = cases.map((c) => c.score.minutesToHandoff).filter((t): t is number => t !== null);
  return {
    total: mean((s) => s.total),
    evidence: mean((s) => s.evidence),
    priority: mean((s) => s.priority),
    guidance: mean((s) => s.guidance),
    handoff: mean((s) => s.handoff),
    cases,
    averageMinutesToHandoff: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null,
    shiftMinutesUsed: state.clock,
  };
}

// ---------- debrief ----------

export type Moment = {
  caseId: string;
  tone: "good" | "mixed" | "bad";
  action: string;
  consequence: string;
  explanation: string;
  mission: string;
};

// One decision per case, so the debrief always replays three. The most
// consequential mistake wins; a clean case replays its best decision.
function momentFor(def: ShiftDef, sc: Scenario, c: CaseState): Moment {
  const who = sc.reporter.first;
  const outcome = outcomeText(def, sc, c);
  const base = { caseId: c.id, mission: sc.mission };
  const final = finalGuidance(sc, c);
  const analyst = def.analysts.find((a) => a.id === c.handoff?.analystId)?.name;
  const recovered = c.harmedAt !== null && final?.quality === "correct" && c.handoff?.route === "analyst";
  const recovery = recovered ? ` You recovered: you told ${who} "${final.label}" and handed the case to ${analyst}.` : "";

  if (c.status === "pending" || (c.asked.length === 0 && c.guidanceLog.length === 0 && !c.handoff)) {
    return { ...base, tone: "bad", action: `You did not open ${who}'s report.`, consequence: c.harmedAt !== null && sc.harm ? sc.harm.text : outcome, explanation: "A report you have not looked at cannot be prioritised. One question is often enough to tell whether it can wait.", mission: sc.mission };
  }

  const harmful = c.guidanceLog.map((g) => guidanceOf(sc, g.id)).find((g) => g.quality === "harmful");
  if (harmful) {
    return { ...base, tone: recovered ? "mixed" : "bad", action: `You told ${who}: "${harmful.label}"`, consequence: `${harmful.consequence ?? ""}${recovery}`, explanation: sc.lessons.guidance };
  }

  if (c.harmCause === "deadline" && sc.harm) {
    const before = c.asked.length;
    return {
      ...base,
      tone: recovered ? "mixed" : "bad",
      action: `${who}'s report went ${sc.harm.afterMinutes} minutes without a safe next step${before > 0 ? `, while you asked ${before} question${before === 1 ? "" : "s"}` : ""}.`,
      consequence: `${sc.harm.text}${recovery}`,
      explanation: sc.lessons.timing,
    };
  }

  if (!c.handoff) {
    return { ...base, tone: "bad", action: `You worked on ${who}'s report but never handed it off.`, consequence: outcome, explanation: "Evidence only helps once it reaches someone who can act on it. A case needs an owner or a clear close." };
  }

  if (!routeCorrect(sc, c)) {
    const action = c.handoff.route === "analyst" ? `You assigned ${analyst} to "${sc.title}".` : `You closed "${sc.title}" with guidance only.`;
    return { ...base, tone: "bad", action, consequence: outcome, explanation: sc.lessons.route };
  }

  const score = scoreCase(sc, c);
  if (c.priority !== null && c.priority !== sc.truth.priority) {
    const tooHigh = RANK[c.priority] > RANK[sc.truth.priority];
    return {
      ...base,
      tone: "bad",
      action: `You handed off "${sc.title}" as ${PRIORITY_LABEL[c.priority]} priority.`,
      consequence: tooHigh ? "It jumped the queue ahead of work that mattered more." : "It waited in the queue behind work that mattered less.",
      explanation: sc.lessons.priority,
    };
  }
  if (!score.priorityJustified) {
    return {
      ...base,
      tone: "mixed",
      action: `You set ${PRIORITY_LABEL[sc.truth.priority]} priority before recording a fact that supports it.`,
      consequence: "The priority happened to be right, but the handoff could not show why.",
      explanation: sc.lessons.priority,
    };
  }

  const wrongClaim = sc.claims.find((claim) => !claimCorrect(sc, c, claim.id));
  if (wrongClaim) {
    const mark = c.claims[wrongClaim.id];
    const action = mark === undefined ? `You left "${wrongClaim.text}" unmarked in the handoff.` : `You marked "${wrongClaim.text}" as ${mark}.`;
    const consequence = mark === "confirmed" ? "The analyst was told this was settled when you held no evidence on it." : mark === "unresolved" ? "The analyst will spend time re-checking something you had already established." : "The analyst cannot tell whether this was checked.";
    return { ...base, tone: "mixed", action, consequence, explanation: wrongClaim.why };
  }

  const first = c.guidanceLog.find((g) => guidanceOf(sc, g.id).quality === "correct");
  if (first && final?.quality === "correct") {
    const minutes = first.at - c.arrivesAt;
    const action = `You told ${who}: "${final.label}" ${minutes} minute${minutes === 1 ? "" : "s"} after the report arrived.`;
    return { ...base, tone: "good", action, consequence: outcome, explanation: sc.lessons.good };
  }
  return { ...base, tone: "mixed", action: `You handed off "${sc.title}" without a safe next step for ${who}.`, consequence: final?.consequence ?? outcome, explanation: sc.lessons.guidance };
}

export function debriefMoments(def: ShiftDef, state: ShiftState): Moment[] {
  return state.cases.map((c) => momentFor(def, scenarioOf(def, c.id), c));
}
