import type {
  Alert,
  AlertRecord,
  Assessment,
  Command,
  GameState,
  Lane,
  LinkRecord,
  Phase,
  Result,
  Reward,
  RoundRecord,
  Scenario,
  Summary,
  Verdict,
} from "./types";

// Pure triage rules: no DOM, no clock. The UI passes elapsed time in on submit.

export const POINTS = {
  best: 10,
  ok: 6,
  reason: 4,
  revised: 5,
  link: 6,
  missed: -6,
  overescalated: -4,
  wrongLink: -4,
} as const;

type Internal = GameState & { moved: Record<string, boolean> };

export function createGame(scenario: Scenario): GameState {
  const state: Internal = {
    scenario,
    phase: 0,
    done: false,
    placements: {},
    links: {},
    inspected: {},
    evidenceFirst: {},
    rounds: [],
    nextIncident: 1,
    moved: {},
  };
  return state;
}

export function getAlert(scenario: Scenario, id: string): Alert {
  const alert = scenario.alerts.find((entry) => entry.id === id);
  if (!alert) throw new Error(`Unknown alert ${id}`);
  return alert;
}

export function assessmentAt(alert: Alert, phase: Phase): Assessment {
  return alert.assessment[phase];
}

// Alerts linked with `id`, including itself.
export function incidentMembers(state: GameState, id: string): string[] {
  const incident = state.links[id];
  if (!incident) return [id];
  return state.scenario.alerts.filter((alert) => state.links[alert.id] === incident).map((alert) => alert.id);
}

// An incident is one unit of analyst work, however many alerts it holds.
export function laneLoad(state: GameState, lane: Lane): number {
  const seen = new Set<string>();
  for (const alert of state.scenario.alerts) {
    if (state.placements[alert.id]?.lane === lane) seen.add(state.links[alert.id] ?? alert.id);
  }
  return seen.size;
}

export function placedCount(state: GameState): number {
  return state.scenario.alerts.filter((alert) => state.placements[alert.id]).length;
}

export function readyToSubmit(state: GameState): boolean {
  return state.scenario.alerts.every((alert) => state.placements[alert.id]?.reason);
}

// Alerts that received evidence the learner has not opened yet this phase.
export function hasNewEvidence(state: GameState, id: string): boolean {
  if (state.phase === 0 || state.inspected[id]) return false;
  return state.scenario.updates[state.phase - 1].affects.includes(id);
}

// `seen`: evidence for the alert (or an alert linked with it) was opened this phase.
function setLane(state: Internal, id: string, lane: Lane, seen: boolean): void {
  const current = state.placements[id];
  if (current?.lane === lane) return;
  state.placements[id] = { lane, reason: null };
  state.moved[id] = true;
  state.evidenceFirst[id] = seen;
}

export function apply(game: GameState, command: Command): Result {
  const state = game as Internal;
  if (state.done) return { ok: false, error: "The shift is over." };
  const { scenario } = state;
  const known = (id: string) => scenario.alerts.some((alert) => alert.id === id);

  switch (command.type) {
    case "inspect": {
      if (!known(command.alert)) return { ok: false, error: "Unknown alert." };
      state.inspected[command.alert] = true;
      // Reading new evidence and keeping the lane is an evidence-based decision too.
      if (!state.moved[command.alert]) state.evidenceFirst[command.alert] = true;
      return { ok: true };
    }
    case "place": {
      if (!known(command.alert)) return { ok: false, error: "Unknown alert." };
      const members = incidentMembers(state, command.alert);
      const alreadyThere = state.placements[command.alert]?.lane === command.lane;
      if (command.lane === "immediate" && !alreadyThere && laneLoad(state, "immediate") >= scenario.immediateCapacity) {
        return {
          ok: false,
          error: `Only ${scenario.immediateCapacity} analysts can respond right now. Move something out of Immediate, or link related alerts into one incident.`,
        };
      }
      const seen = members.some((member) => state.inspected[member]);
      for (const member of members) setLane(state, member, command.lane, seen);
      return { ok: true };
    }
    case "unplace": {
      for (const member of incidentMembers(state, command.alert)) {
        delete state.placements[member];
        state.moved[member] = true;
      }
      return { ok: true };
    }
    case "justify": {
      if (!scenario.reasons.some((reason) => reason.id === command.reason)) return { ok: false, error: "Unknown reason." };
      const members = incidentMembers(state, command.alert);
      if (!state.placements[command.alert]) return { ok: false, error: "Assign a priority first." };
      for (const member of members) state.placements[member].reason = command.reason;
      return { ok: true };
    }
    case "link": {
      if (!known(command.alert) || !known(command.with)) return { ok: false, error: "Unknown alert." };
      if (command.alert === command.with) return { ok: false, error: "Pick a different alert to link." };
      if (state.links[command.alert] && state.links[command.alert] === state.links[command.with]) {
        return { ok: false, error: "Those alerts are already linked." };
      }
      // The incident takes the target's priority, falling back to the source's.
      const target = state.placements[command.with] ?? state.placements[command.alert];
      const keepReason =
        !!target && state.placements[command.with]?.lane === state.placements[command.alert]?.lane
          ? state.placements[command.with]?.reason === state.placements[command.alert]?.reason
          : false;
      const reason = keepReason && target ? target.reason : null;
      const incident = state.links[command.with] ?? state.links[command.alert] ?? `incident-${state.nextIncident++}`;
      const members = [...incidentMembers(state, command.alert), ...incidentMembers(state, command.with)];
      const seen = members.some((member) => state.inspected[member]);
      for (const member of members) {
        state.links[member] = incident;
        if (target) {
          setLane(state, member, target.lane, seen);
          state.placements[member].reason = reason;
        }
      }
      return { ok: true };
    }
    case "unlink": {
      const incident = state.links[command.alert];
      if (!incident) return { ok: false, error: "That alert is not linked." };
      delete state.links[command.alert];
      const rest = scenario.alerts.filter((alert) => state.links[alert.id] === incident);
      if (rest.length === 1) delete state.links[rest[0].id];
      // Splitting an incident needs a second analyst; without one the alert returns to the queue.
      if (state.placements[command.alert]?.lane === "immediate" && laneLoad(state, "immediate") > scenario.immediateCapacity) {
        delete state.placements[command.alert];
        state.moved[command.alert] = true;
      }
      return { ok: true };
    }
    case "submit": {
      if (!command.timedOut && !readyToSubmit(state)) {
        return { ok: false, error: "Every alert needs a priority and a justification first." };
      }
      state.rounds.push(scoreRound(state, command.elapsedSeconds, !!command.timedOut));
      if (state.phase === 2) {
        state.done = true;
        return { ok: true };
      }
      state.phase = (state.phase + 1) as Phase;
      state.moved = {};
      for (const id of scenario.updates[state.phase - 1].affects) {
        state.inspected[id] = false;
        state.evidenceFirst[id] = false;
      }
      return { ok: true };
    }
  }
}

function judge(assessment: Assessment, lane: Lane | null): Verdict {
  if (lane === assessment.best) return "best";
  if (lane && assessment.ok.includes(lane)) return "ok";
  if (assessment.best === "immediate" && (lane === "monitor" || lane === null)) return "missed";
  if (lane === "immediate" && assessment.best === "monitor") return "overescalated";
  return lane === null ? "unplaced" : "weak";
}

function scoreLinks(state: GameState): LinkRecord[] {
  const incidents = new Map<string, string[]>();
  for (const alert of state.scenario.alerts) {
    const incident = state.links[alert.id];
    if (incident) incidents.set(incident, [...(incidents.get(incident) ?? []), alert.id]);
  }
  return [...incidents.values()].map((members) => {
    const groups = new Set(members.map((id) => getAlert(state.scenario, id).group ?? `solo:${id}`));
    const group = groups.size === 1 ? [...groups][0] : undefined;
    const size = state.scenario.alerts.filter((alert) => alert.group === group).length;
    const correct = !!group && !group.startsWith("solo:") && members.length === size;
    return { members, correct, group: correct ? group : undefined };
  });
}

export function maxRoundPoints(scenario: Scenario, phase: Phase): number {
  let max = scenario.alerts.length * (POINTS.best + POINTS.reason);
  if (phase > 0) {
    const changed = scenario.alerts.filter((alert) => alert.assessment[phase].best !== alert.assessment[phase - 1].best);
    max += changed.length * POINTS.revised;
  }
  // Links are judged once, on the final board.
  if (phase === 2) max += scenario.groups.length * POINTS.link;
  return max;
}

function scoreRound(state: GameState, elapsedSeconds: number, timedOut: boolean): RoundRecord {
  const { scenario, phase } = state;
  const previous = state.rounds[phase - 1];
  const alerts: AlertRecord[] = scenario.alerts.map((alert) => {
    const assessment = alert.assessment[phase];
    const placement = state.placements[alert.id];
    const lane = placement?.lane ?? null;
    const reason = placement?.reason ?? null;
    const verdict = judge(assessment, lane);
    const supported = verdict === "best" || verdict === "ok";
    const reasonOk = supported && !!reason && assessment.reasons.includes(reason);
    const before = previous?.alerts.find((entry) => entry.alert === alert.id);
    const revised =
      phase > 0 && verdict === "best" && alert.assessment[phase - 1].best !== assessment.best && before?.lane !== lane;
    let points = verdict === "best" ? POINTS.best : verdict === "ok" ? POINTS.ok : 0;
    if (verdict === "missed") points += POINTS.missed;
    if (verdict === "overescalated") points += POINTS.overescalated;
    if (reasonOk) points += POINTS.reason;
    if (revised) points += POINTS.revised;
    return {
      alert: alert.id,
      lane,
      reason,
      linkedWith: incidentMembers(state, alert.id).filter((id) => id !== alert.id),
      evidenceFirst: lane !== null && !!state.evidenceFirst[alert.id],
      verdict,
      reasonOk,
      revised,
      points,
    };
  });
  const links = scoreLinks(state);
  let points = alerts.reduce((sum, entry) => sum + entry.points, 0);
  if (phase === 2) {
    for (const link of links) points += link.correct ? POINTS.link : POINTS.wrongLink;
  }
  return { phase, elapsedSeconds, timedOut, alerts, links, points: Math.max(0, points), maxPoints: maxRoundPoints(scenario, phase) };
}

export function summarize(state: GameState): Summary {
  const { scenario, rounds } = state;
  const final = rounds[rounds.length - 1];
  const title = (id: string) => getAlert(scenario, id).title;
  const rewards: Reward[] = [];
  const rewarded = new Set<string>();
  const overescalated = new Set<string>();
  let revisions = 0;
  let reasonsMatched = 0;
  let evidenceFirst = 0;

  for (const round of rounds) {
    for (const record of round.alerts) {
      const assessment = getAlert(scenario, record.alert).assessment[round.phase];
      if (record.reasonOk) reasonsMatched += 1;
      if (record.evidenceFirst) evidenceFirst += 1;
      if (record.verdict === "overescalated") overescalated.add(record.alert);
      if (record.revised) {
        revisions += 1;
        rewards.push({ kind: "revised", phase: round.phase, alert: record.alert, text: `Revised on new evidence: ${title(record.alert)}` });
      }
      if (record.verdict !== "best") continue;
      const critical = assessment.best === "immediate";
      const benign = assessment.best === "monitor" && assessment.reasons.includes("expected");
      const key = `${critical ? "critical" : "benign"}:${record.alert}`;
      if ((critical || benign) && !rewarded.has(key)) {
        rewarded.add(key);
        rewards.push({
          kind: critical ? "critical" : "benign",
          phase: round.phase,
          alert: record.alert,
          text: critical ? `Critical catch: ${title(record.alert)}` : `Benign recognized: ${title(record.alert)}`,
        });
      }
    }
  }

  const finalLinks = final?.links ?? [];
  for (const link of finalLinks) {
    if (!link.correct) continue;
    const group = scenario.groups.find((entry) => entry.id === link.group);
    rewards.push({ kind: "linked", phase: 2, alert: link.members[0], text: `Linked incident: ${group?.name ?? "related alerts"}` });
  }

  const finalBest = (id: string) => getAlert(scenario, id).assessment[2].best;
  const finalAlerts = final?.alerts ?? [];
  const points = rounds.reduce((sum, round) => sum + round.points, 0);
  const maxPoints = ([0, 1, 2] as Phase[]).reduce<number>((sum, phase) => sum + maxRoundPoints(scenario, phase), 0);
  let revisionChances = 0;
  for (const alert of scenario.alerts) {
    for (const phase of [1, 2] as const) {
      if (alert.assessment[phase].best !== alert.assessment[phase - 1].best) revisionChances += 1;
    }
  }

  return {
    quality: maxPoints > 0 ? points / maxPoints : 0,
    points,
    maxPoints,
    criticalCaught: finalAlerts.filter((entry) => finalBest(entry.alert) === "immediate" && entry.lane === "immediate").length,
    criticalTotal: scenario.alerts.filter((alert) => finalBest(alert.id) === "immediate").length,
    missedCritical: finalAlerts.filter((entry) => entry.verdict === "missed").length,
    unnecessaryEscalations: overescalated.size,
    benignRecognized: finalAlerts.filter((entry) => finalBest(entry.alert) === "monitor" && entry.lane === "monitor").length,
    revisions,
    revisionChances,
    correctLinks: finalLinks.filter((link) => link.correct).length,
    wrongLinks: finalLinks.filter((link) => !link.correct).length,
    linkChances: scenario.groups.length,
    reasonsMatched,
    reasonsTotal: scenario.alerts.length * rounds.length,
    seconds: rounds.reduce((sum, round) => sum + round.elapsedSeconds, 0),
    evidenceFirst,
    decisions: scenario.alerts.length * rounds.length,
    rewards,
  };
}
