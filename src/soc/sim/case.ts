import { createRng, nextFloat } from "../../sim/rng";
import {
  ACTIONS,
  BUDGET_PER_DECISION,
  CASE,
  CONTAIN_EFFECT_MINUTES,
  EVENTS,
  EVIDENCE,
  EXPORT_RESTART_DEADLINE,
  FRAUD_AT,
  GB_PER_MINUTE,
  HANDOVER_MINUTES,
  INITIAL_BUDGET,
  INVESTIGATE_BUDGET,
  IR_BASE_MINUTES,
  IR_MINUTES_PER_MISSING_SOURCE,
  MAX_DECISIONS,
  PAYROLL_END,
  PAYROLL_START,
  Q3_END,
  Q3_GB,
  RULE_AT,
  SIGNALS,
  STALL_MINUTES,
  TOTAL_GB,
  TRANSFER_START,
  UNRESTORED_MINUTES,
} from "../data/scenario";
import {
  DECISIONS_MAX,
  OUTCOME_MAX,
  REASONING_MAX,
  SOURCES,
  type ActionId,
  type Asset,
  type CaseState,
  type Clue,
  type Command,
  type EvidenceId,
  type Grade,
  type Outcome,
  type Rating,
  type ReasonId,
  type Score,
  type Source,
  type Target,
  type Variant,
  type View,
} from "./types";

// Pure and deterministic: a case is fully rebuilt from its seed and command
// log, which is what makes rewind and the decision replay possible.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function variantOf(seed: string): Variant {
  return nextFloat(createRng(seed)) < 0.5 ? "compromise" : "approved";
}

// GB sent by `time`, given the minute the laptop was cut off (if it was).
export function transferred(variant: Variant, time: number, stopAt: number | null): number {
  const until = stopAt === null ? time : Math.min(time, stopAt);
  let gb = clamp(until - TRANSFER_START, 0, Q3_END - TRANSFER_START) * GB_PER_MINUTE;
  if (variant === "compromise") gb += clamp(until - PAYROLL_START, 0, PAYROLL_END - PAYROLL_START) * GB_PER_MINUTE;
  return round2(gb);
}

export function createCase(seed: string, variant: Variant = variantOf(seed)): CaseState {
  return {
    seed,
    variant,
    clock: CASE.start,
    decision: 1,
    budget: INITIAL_BUDGET,
    revealed: [],
    feed: [],
    fired: [],
    hostContainedAt: null,
    accountContainedAt: null,
    escalatedAt: null,
    irActAt: null,
    stoodDownAt: null,
    decisions: [],
    stalls: 0,
    ended: false,
  };
}

function advance(state: CaseState, minutes: number): void {
  const end = state.clock + minutes;
  for (let minute = state.clock + 1; minute <= end; minute += 1) {
    for (const event of EVENTS) {
      if (event.variant !== state.variant || state.fired.includes(event.id)) continue;
      const when = event.when(state);
      if (when === null || when > minute) continue;
      state.fired.push(event.id);
      state.feed.push({
        id: `ev:${event.id}`,
        at: when,
        seq: state.decisions.length,
        source: event.source,
        kind: "world",
        title: event.title,
        detail: event.detail,
        strength: event.strength,
        points: event.points,
      });
    }
  }
  state.clock = end;
}

// ---------- what the player knows ----------
export function cluesOf(state: CaseState): Clue[] {
  const clues: Clue[] = SOURCES.map((source) => ({
    id: `sig:${source}`,
    source,
    title: SIGNALS[source].title,
    time: CASE.start,
    strength: "weak" as const,
    points: "compromise" as const,
  }));
  for (const item of state.revealed) {
    const def = EVIDENCE.find((entry) => entry.id === item.id)!;
    const finding = def.finding[state.variant];
    clues.push({ id: def.id, source: def.source, title: def.label, time: item.at, strength: finding.strength, points: finding.points });
  }
  for (const item of state.feed) {
    if (item.kind !== "world" || !item.strength || !item.points) continue;
    clues.push({ id: item.id, source: item.source, title: item.title, time: item.at, strength: item.strength, points: item.points });
  }
  return clues;
}

export function viewOf(state: CaseState): View {
  const strong = cluesOf(state).filter((clue) => clue.strength === "strong");
  const sources = SOURCES.filter((source) => strong.some((clue) => clue.source === source));
  return {
    known: sources.length,
    sources: [...sources],
    direction: strong.length > 0 ? state.variant : null,
    hostContained: state.hostContainedAt !== null,
    accountContained: state.accountContainedAt !== null,
    clock: state.clock,
    transferredGb: transferred(state.variant, state.clock, state.hostContainedAt),
  };
}

export function remainingAssets(view: Pick<View, "hostContained" | "accountContained">): Asset[] {
  const assets: Asset[] = [];
  if (!view.accountContained) assets.push("account");
  if (!view.hostContained) assets.push("host");
  return assets;
}

function targetAssets(target: Target | undefined, view: View): Asset[] {
  const remaining = remainingAssets(view);
  if (target === "both" || target === undefined) return remaining;
  return remaining.filter((asset) => asset === target);
}

const ASSET_OF: Readonly<Record<Source, Asset>> = { login: "account", endpoint: "host", network: "host" };
const ASSET_NAME: Readonly<Record<Asset, string>> = { account: "account", host: "laptop" };

// ---------- grading (from the player's view only) ----------
export function gradeDecision(view: View, action: ActionId, target?: Target): { grade: Grade; why: string } {
  const remaining = remainingAssets(view);
  const contained = remaining.length < 2;

  if (view.direction === null) {
    switch (action) {
      case "investigate":
        return { grade: "best", why: "Three signals line up but none of them rules out an ordinary explanation yet. Evidence was cheap and available, so getting it first was the proportionate move." };
      case "contain":
        return { grade: "defensible", why: "You acted on potential impact alone. With data leaving that can be argued, but you had not yet seen anything that separates a compromise from approved work, so you were betting on the business cost." };
      case "escalate":
        return { grade: "weak", why: "You handed over three unconfirmed signals. Responders had to do the checking you skipped, and the handoff added delay without adding protection." };
      case "monitor":
        return { grade: "weak", why: "Watching does not answer the open question, and a transfer was in progress. Evidence you could have requested would have told you more than waiting did." };
      case "standdown":
        return { grade: "harmful", why: "You closed the case with no evidence that the activity was expected. Unusual logins, an archive and an outbound transfer were all still unexplained." };
    }
  }

  if (view.direction === "compromise") {
    if (remaining.length === 0) {
      switch (action) {
        case "escalate":
          return { grade: "best", why: "Both the laptop and the account were contained and data had already left. Scoping, recovery and notification belong with incident response, and your evidence gave them a clean start." };
        case "investigate":
          return { grade: "defensible", why: "Scoping what else was touched is useful, but data had already left the company. Incident response needed to know sooner." };
        case "monitor":
          return { grade: "weak", why: "Containment held, but a confirmed compromise with data loss was sitting with one analyst. It needed to be handed over." };
        default:
          return { grade: "harmful", why: "You reopened access after seeing confirmed evidence of a compromise. The intruder got the laptop and the account back." };
      }
    }
    switch (action) {
      case "contain": {
        const chosen = targetAssets(target, view);
        const coversAll = chosen.length === remaining.length;
        if (view.known >= 2) {
          return coversAll
            ? { grade: "best", why: "Independent sources agreed and data was leaving. Cutting off everything still open stopped the upload and the intruder's session together." }
            : { grade: "defensible", why: `You contained the ${ASSET_NAME[chosen[0]]} on solid evidence, but the evidence already covered more than one source and the ${ASSET_NAME[remaining.find((asset) => !chosen.includes(asset))!]} was left open.` };
        }
        const evidenced = view.sources.map((source) => ASSET_OF[source]);
        const hitsEvidence = chosen.some((asset) => evidenced.includes(asset)) || evidenced.every((asset) => !remaining.includes(asset));
        return hitsEvidence
          ? { grade: "best", why: "One source had confirmed malicious activity and finance data was leaving. Containing the asset that evidence pointed at was proportionate and fast." }
          : { grade: "defensible", why: `Containing was right, but your confirmed evidence was about the ${ASSET_NAME[evidenced[0]]} and you contained the ${ASSET_NAME[chosen[0]]} instead.` };
      }
      case "escalate":
        return { grade: "defensible", why: contained ? "Handing over a partly contained compromise is reasonable, though you could have closed the remaining gap yourself first." : "Escalating a confirmed compromise is sound, but you had the authority to contain immediately and the handoff let data keep leaving." };
      case "investigate":
        return view.known >= 2
          ? { grade: "weak", why: "Two or more sources had already confirmed a compromise. More analysis added certainty you did not need while data kept leaving." }
          : { grade: "defensible", why: "Corroborating a single confirmed source is reasonable, but the transfer was live and every minute of analysis had a cost." };
      case "monitor":
        return view.known >= 2
          ? { grade: "harmful", why: "The compromise was confirmed across sources and you chose to watch it. Nothing was protecting the data or the account." }
          : { grade: "weak", why: "You had confirmed malicious activity from one source and watched instead of acting or checking further." };
      case "standdown":
        return { grade: "harmful", why: "You closed the case after seeing confirmed evidence of a compromise." };
    }
  }

  if (contained) {
    switch (action) {
      case "standdown":
        return { grade: "best", why: "New evidence showed the activity was approved, and you reversed the containment instead of defending it. Restoring access quickly limited the disruption." };
      case "escalate":
        return { grade: "defensible", why: "Responders will restore access, but the evidence already showed approved work and you could have lifted the containment yourself, sooner." };
      case "investigate":
        return view.known >= 2
          ? { grade: "weak", why: "Two sources already showed approved work while the user stayed locked out. The extra checking prolonged an unnecessary interruption." }
          : { grade: "defensible", why: "One more check before reversing is reasonable, but the user was cut off the whole time." };
      case "monitor":
        return { grade: "weak", why: "Evidence pointed to approved work and containment was still in place. Waiting kept people locked out for no benefit." };
      case "contain":
        return { grade: "harmful", why: "You extended containment after seeing evidence that the activity was approved." };
    }
  }
  switch (action) {
    case "standdown":
      return view.known >= 2
        ? { grade: "best", why: "Independent sources explained the activity as approved work. Closing the case and documenting why kept finance working and freed you for the next alert." }
        : { grade: "defensible", why: "One strong source explained the activity. Closing was reasonable, though a second source would have made it a confirmation and cost little." };
    case "investigate":
      return view.known >= 2
        ? { grade: "weak", why: "Two sources had already explained the activity as approved. More analysis was time taken from other alerts." }
        : { grade: "best", why: "One source pointed to approved work. Checking a second, independent source before closing turned a likely explanation into a confirmed one." };
    case "monitor":
      return { grade: "defensible", why: "Nothing needed stopping, so watching did no harm. It also left a case open that the evidence could already have closed or confirmed." };
    case "escalate":
      return { grade: "weak", why: "The evidence pointed to approved work. Escalating pulled responders onto something you could have resolved." };
    case "contain":
      return { grade: "harmful", why: "You had strong evidence that this was approved work and contained anyway. The business paid for an interruption the evidence did not support." };
  }
}

export function reasonFit(view: View, action: ActionId, reason: ReasonId): number {
  const passive = action === "investigate" || action === "monitor";
  const decisive = action === "contain" || action === "escalate";
  const contained = view.hostContained || view.accountContained;
  switch (reason) {
    case "partial":
      return passive ? (view.known <= 1 ? 1 : 0) : 0;
    case "correlated":
      if (!decisive || view.direction !== "compromise") return 0;
      return view.known >= 2 ? 1 : 0.5;
    case "impact":
      return decisive && view.direction !== "approved" ? 1 : 0;
    case "approved":
      if ((action !== "standdown" && action !== "monitor") || view.direction !== "approved") return 0;
      return view.known >= 2 ? 1 : 0.5;
    case "handover":
      if (action !== "escalate" || view.direction === "approved") return 0;
      return contained ? 1 : 0.5;
    case "reversal":
      return action === "standdown" && contained && view.direction === "approved" ? 1 : 0;
    case "location":
      return 0;
  }
}

export function citeFit(clues: readonly Clue[], action: ActionId, cited: readonly string[]): number {
  if (action === "investigate" || action === "monitor") return 1;
  const wanted: Variant = action === "standdown" ? "approved" : "compromise";
  const picked = clues.filter((clue) => cited.includes(clue.id));
  if (picked.some((clue) => clue.strength === "strong" && clue.points !== wanted)) return 0;
  if (picked.some((clue) => clue.strength === "strong" && clue.points === wanted)) return 1;
  if (picked.some((clue) => clue.points === wanted)) return 0.5;
  return 0;
}

// ---------- commands ----------
export function canRequest(state: CaseState, id: EvidenceId): boolean {
  return !state.ended && state.budget > 0 && !state.revealed.some((item) => item.id === id);
}

export function availableActions(state: CaseState): ActionId[] {
  const view = viewOf(state);
  return ACTIONS.map((action) => action.id).filter((id) => id !== "contain" || remainingAssets(view).length > 0);
}

export function apply(previous: CaseState, command: Command): CaseState {
  const state = structuredClone(previous);
  if (state.ended) return state;

  if (command.type === "stall") {
    state.stalls += 1;
    advance(state, STALL_MINUTES);
    return state;
  }

  if (command.type === "request") {
    if (!canRequest(state, command.id)) return state;
    const def = EVIDENCE.find((entry) => entry.id === command.id)!;
    state.budget -= 1;
    advance(state, def.minutes);
    const context = { clock: state.clock, transferredGb: transferred(state.variant, state.clock, state.hostContainedAt) };
    state.revealed.push({ id: def.id, at: state.clock, seq: state.decisions.length, lines: [...def.finding[state.variant].lines(context)] });
    return state;
  }

  if (!availableActions(state).includes(command.action)) return state;
  const view = viewOf(state);
  const clues = cluesOf(state);
  const cited = command.cited.filter((id) => clues.some((clue) => clue.id === id));
  const target = command.action === "contain" ? (command.target ?? "both") : undefined;
  const { grade, why } = gradeDecision(view, command.action, target);
  const seq = state.decisions.length;
  state.decisions.push({
    n: state.decision,
    at: state.clock,
    after: state.clock,
    view,
    action: command.action,
    target,
    reason: command.reason,
    cited: [...cited],
    requested: state.revealed.filter((item) => item.seq === seq).map((item) => item.id),
    grade,
    why,
    reasonFit: reasonFit(view, command.action, command.reason),
    citeFit: citeFit(clues, command.action, cited),
  });
  const minutes = ACTIONS.find((action) => action.id === command.action)!.minutes;

  switch (command.action) {
    case "contain": {
      const assets = targetAssets(target, view);
      advance(state, CONTAIN_EFFECT_MINUTES);
      if (assets.includes("host")) {
        state.hostContainedAt = state.clock;
        const sent = transferred(state.variant, state.clock, state.clock);
        const live = state.clock < Q3_END || (state.variant === "compromise" && state.clock >= PAYROLL_START && state.clock < PAYROLL_END);
        state.feed.push({
          id: "act:host",
          at: state.clock,
          seq: state.decisions.length,
          source: "endpoint",
          kind: "action",
          title: `Laptop isolated: ${CASE.host}`,
          detail: live ? `Network isolation applied. The outbound transfer stopped at ${sent.toFixed(2)} GB.` : "Network isolation applied. No transfer was in progress.",
        });
      }
      if (assets.includes("account")) {
        state.accountContainedAt = state.clock;
        state.feed.push({
          id: "act:account",
          at: state.clock,
          seq: state.decisions.length,
          source: "login",
          kind: "action",
          title: `Account disabled: ${CASE.user}`,
          detail: "All sessions were revoked. Sign-in is blocked until the account is restored.",
        });
      }
      advance(state, minutes - CONTAIN_EFFECT_MINUTES);
      break;
    }
    case "investigate":
      advance(state, minutes);
      state.budget += INVESTIGATE_BUDGET;
      break;
    case "monitor":
      advance(state, minutes);
      break;
    case "escalate":
      advance(state, minutes);
      state.escalatedAt = state.clock;
      state.irActAt = state.clock + IR_BASE_MINUTES + IR_MINUTES_PER_MISSING_SOURCE * (SOURCES.length - view.known);
      state.ended = true;
      break;
    case "standdown":
      advance(state, minutes);
      state.stoodDownAt = state.clock;
      state.ended = true;
      break;
  }

  state.decisions[seq].after = state.clock;
  if (state.decisions.length >= MAX_DECISIONS) state.ended = true;
  if (!state.ended) {
    state.decision += 1;
    state.budget += BUDGET_PER_DECISION;
  }
  return state;
}

export function run(seed: string, commands: readonly Command[], variant?: Variant): CaseState {
  return commands.reduce(apply, createCase(seed, variant));
}

// ---------- outcome and score ----------
export function outcomeOf(state: CaseState): Outcome {
  const escalated = state.escalatedAt !== null;
  const stoodDown = state.stoodDownAt !== null;
  const handoverAt = state.clock + HANDOVER_MINUTES;
  const epilogue: string[] = [];
  const base = {
    variant: state.variant,
    exposedGb: 0,
    payrollExposed: false,
    mailRule: false,
    fraudAttempt: false,
    hostStopAt: null,
    accountStopAt: null,
    hostDownMinutes: 0,
    accountDownMinutes: 0,
    exportCut: false,
    deadlineMissed: false,
    caseLeftOpen: false,
    escalated,
  };

  if (state.variant === "compromise") {
    // Standing down reopens whatever was contained; nobody is watching after that.
    const stop = (containedAt: number | null): number | null => {
      if (stoodDown) return null;
      if (containedAt !== null) return containedAt;
      return escalated ? state.irActAt : handoverAt;
    };
    const hostStopAt = stop(state.hostContainedAt);
    const accountStopAt = stop(state.accountContainedAt);
    const exposedGb = hostStopAt === null ? TOTAL_GB : transferred("compromise", hostStopAt, hostStopAt);
    const mailRule = accountStopAt === null || accountStopAt > RULE_AT;
    const fraudAttempt = accountStopAt === null || accountStopAt > FRAUD_AT;
    const selfContained = state.hostContainedAt !== null && state.accountContainedAt !== null;
    const resolvedBy = stoodDown ? "nobody" : selfContained ? "you" : escalated ? "responders" : "next shift";

    if (stoodDown) {
      epilogue.push("The case was closed. Nobody was watching when the Payroll archive finished uploading at 11:08.");
      epilogue.push("At 11:30 Accounts Payable questioned a supplier's new bank details, and the incident was reopened from scratch.");
    } else {
      if (state.hostContainedAt === null) {
        epilogue.push(escalated ? `Incident response isolated the laptop at ${formatClock(hostStopAt!)}, after re-checking what the handoff did not show.` : `The case rolled to the next shift, who isolated the laptop at ${formatClock(hostStopAt!)}.`);
      }
      if (state.accountContainedAt === null) {
        epilogue.push(escalated ? `Incident response disabled the account at ${formatClock(accountStopAt!)}.` : `The next shift disabled the account at ${formatClock(accountStopAt!)}.`);
      }
      if (selfContained) epilogue.push(escalated ? "Incident response took over a contained incident and started scoping and notification." : "Containment held. The case still had to be handed to incident response for scoping and notification.");
    }
    epilogue.push(
      exposedGb > Q3_GB
        ? `${exposedGb.toFixed(2)} GB left the company: the whole Q3 finance package and ${(exposedGb - Q3_GB).toFixed(2)} GB of payroll records.`
        : `${exposedGb.toFixed(2)} GB of the Q3 finance package left the company. Payroll was never touched.`,
    );
    if (fraudAttempt) epilogue.push("The intruder set a mail-forwarding rule and sent Accounts Payable a request to change a supplier's bank details.");
    else if (mailRule) epilogue.push("The intruder set a mail-forwarding rule before the account was cut off. It was found and removed in cleanup.");
    else epilogue.push("The account was cut off before the intruder could use the mailbox.");

    return { ...base, resolvedBy, exposedGb, payrollExposed: exposedGb > Q3_GB, mailRule, fraudAttempt, hostStopAt, accountStopAt, epilogue };
  }

  const restoreAt = (containedAt: number): number => state.stoodDownAt ?? state.irActAt ?? containedAt + UNRESTORED_MINUTES;
  const hostDownMinutes = state.hostContainedAt === null ? 0 : restoreAt(state.hostContainedAt) - state.hostContainedAt;
  const accountDownMinutes = state.accountContainedAt === null ? 0 : restoreAt(state.accountContainedAt) - state.accountContainedAt;
  const exportCut = state.hostContainedAt !== null && state.hostContainedAt < Q3_END;
  const deadlineMissed = exportCut && restoreAt(state.hostContainedAt!) > EXPORT_RESTART_DEADLINE;
  const caseLeftOpen = !stoodDown && !escalated;
  const anyContained = state.hostContainedAt !== null || state.accountContainedAt !== null;
  const resolvedBy = stoodDown ? "you" : escalated ? "responders" : "next shift";

  if (stoodDown) epilogue.push(anyContained ? `You lifted containment at ${formatClock(state.stoodDownAt!)} and closed the case as approved activity.` : `You closed the case at ${formatClock(state.stoodDownAt!)} as approved activity.`);
  else if (escalated) epilogue.push(`Incident response confirmed approved activity at ${formatClock(state.irActAt!)} and closed the case${anyContained ? ", restoring access" : ""}. A responder was pulled off other work to do it.`);
  else epilogue.push(anyContained ? "The case rolled to the next shift still open. Containment stayed in place until the service desk worked the ticket that afternoon." : "The case rolled to the next shift still open, and they closed it as approved activity.");
  if (state.hostContainedAt !== null) epilogue.push(`The laptop was offline for ${hostDownMinutes} minutes.`);
  if (state.accountContainedAt !== null) epilogue.push(`t.nguyen was locked out for ${accountDownMinutes} minutes during the audit walkthrough.`);
  if (exportCut) epilogue.push(deadlineMissed ? "The audit export was cut off and could not be restarted in time. Hale & Marlow did not get the Q3 package by noon." : "The audit export was cut off and had to be restarted. It reached the auditor before the noon deadline.");
  if (!anyContained) epilogue.push("The audit package reached Hale & Marlow at 10:41 and the audit carried on uninterrupted.");

  return { ...base, resolvedBy, hostDownMinutes, accountDownMinutes, exportCut, deadlineMissed, caseLeftOpen, epilogue };
}

const GRADE_VALUE: Readonly<Record<Grade, number>> = { best: 1, defensible: 0.7, weak: 0.35, harmful: 0 };
// A good reason attached to a poor action earns less.
const REASONING_FACTOR: Readonly<Record<Grade, number>> = { best: 1, defensible: 1, weak: 0.5, harmful: 0 };
// Transfer that even the fastest evidence-led response could not have stopped.
const PAR_EXPOSED_GB = 1.0;

export function outcomePoints(outcome: Outcome): number {
  if (outcome.variant === "compromise") {
    const data = 28 * (1 - clamp((outcome.exposedGb - PAR_EXPOSED_GB) / (TOTAL_GB - PAR_EXPOSED_GB), 0, 1));
    const account = outcome.fraudAttempt ? 0 : outcome.mailRule ? 6 : 12;
    return data + account;
  }
  let points = OUTCOME_MAX;
  for (const minutes of [outcome.hostDownMinutes, outcome.accountDownMinutes]) {
    if (minutes > 0) points -= 8 + minutes * 0.5;
  }
  if (outcome.deadlineMissed) points -= 6;
  if (outcome.caseLeftOpen) points -= 5;
  if (outcome.escalated) points -= 4;
  return Math.max(0, points);
}

export function ratingOf(total: number): Rating {
  if (total >= 85) return "lead";
  if (total >= 70) return "analyst";
  if (total >= 50) return "trainee";
  return "novice";
}

export function scoreOf(state: CaseState): Score {
  const count = Math.max(1, state.decisions.length);
  const outcome = Math.round(outcomePoints(outcomeOf(state)));
  const decisions = Math.round((state.decisions.reduce((sum, item) => sum + GRADE_VALUE[item.grade], 0) / count) * DECISIONS_MAX);
  const reasoning = Math.round(
    (state.decisions.reduce((sum, item) => sum + (0.6 * item.reasonFit + 0.4 * item.citeFit) * REASONING_FACTOR[item.grade], 0) / count) * REASONING_MAX,
  );
  const total = outcome + decisions + reasoning;
  return { outcome, decisions, reasoning, total, rating: ratingOf(total) };
}
