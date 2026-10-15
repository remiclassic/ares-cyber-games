import {
  ACTION_COSTS,
  INITIAL_LINKS,
  INITIAL_RULES,
  SETBACK_LIMIT,
  SETBACK_REPAIR_GRANT,
  TOKEN_SPEED,
  linkPolyline,
  polylineLength,
  VARIANTS,
  buildFlows,
  buildRounds,
} from "../data/scenario";
import { explainRound } from "./explain";
import { findPath, linkBetween, linkId, missingDependency } from "./network";
import { evaluate } from "./policy";
import { createRng, nextInt, shuffle } from "./rng";
import type {
  Command,
  FlowDef,
  GameState,
  Link,
  NodeId,
  RoundDef,
  RoundResult,
  RoundStats,
  ScheduledRequest,
  SourceId,
  Token,
} from "./types";

// Ticks allowed after the last request spawns before waiting requests count as lost.
const DRAIN_TICKS = 210;

export type ApplyResult = Readonly<{ ok: true } | { ok: false; error: string }>;

export function emptyStats(): RoundStats {
  const blank = () => ({ total: 0, delivered: 0, blocked: 0, failed: 0 });
  return { supplier: blank(), hrstaff: blank(), unknown: blank() };
}

export function createGame(seed: string): GameState {
  const variant = VARIANTS[nextInt(createRng(`${seed}:variant`), 0, VARIANTS.length)];
  const links: Link[] = INITIAL_LINKS.map(([a, b]) => ({ id: linkId(a, b), a, b, status: "up", kind: "primary" }));
  const state: GameState = {
    seed,
    variant,
    round: 0,
    attempt: 0,
    phase: "planning",
    tick: 0,
    steps: 0,
    ap: 0,
    apGranted: 0,
    apSpent: 0,
    links,
    rules: INITIAL_RULES.map((rule) => ({ ...rule })),
    builtRoutes: [],
    inspected: [],
    assessments: {},
    tokens: [],
    schedule: [],
    spawnIndex: 0,
    stats: emptyStats(),
    firedEvents: [],
    pause: null,
    setbacks: 0,
    nextId: 1,
    roundStats: [null, null, null],
    results: [],
    log: [],
    roundStarts: {},
    lastActionTick: 0,
  };
  startRound(state, 0, false);
  return state;
}

export function flowsFor(state: GameState): Record<SourceId, FlowDef> {
  return buildFlows(state.variant);
}

export function roundsFor(state: GameState): RoundDef[] {
  return buildRounds(state.variant);
}

export function currentRound(state: GameState): RoundDef {
  return roundsFor(state)[state.round];
}

function startRound(state: GameState, round: number, repeat: boolean): void {
  const def = roundsFor(state)[round];
  state.round = round;
  state.phase = "planning";
  state.tick = 0;
  state.steps = 0;
  state.tokens = [];
  state.stats = emptyStats();
  state.firedEvents = [];
  state.pause = null;
  state.spawnIndex = 0;
  state.lastActionTick = 0;
  // Each round begins with the hardware repaired; failures are round events.
  for (const link of state.links) link.status = "up";

  const grant = repeat ? SETBACK_REPAIR_GRANT : def.apGrant;
  state.ap += grant;
  state.apGranted += grant;

  const rng = createRng(`${state.seed}:round${round}:attempt${state.attempt}`);
  const order: SourceId[] = [];
  for (const flow of def.flows) {
    for (let i = 0; i < (def.counts[flow] ?? 0); i += 1) order.push(flow);
  }
  shuffle(rng, order);
  // Open every wave with approved work so the learner sees what "normal" looks like.
  const firstLegit = order.findIndex((flow) => flow !== "unknown");
  if (firstLegit > 0) [order[0], order[firstLegit]] = [order[firstLegit], order[0]];
  state.schedule = order.map<ScheduledRequest>((flow, index) => ({
    tick: 12 + index * def.spacing + nextInt(rng, 0, 5),
    flow,
  }));

  state.roundStarts[`${round}:${state.attempt}`] = snapshot(state);
}

function snapshot(state: GameState): string {
  const { log: _log, roundStarts: _starts, results: _results, ...rest } = state;
  return JSON.stringify(rest);
}

export function restoreSnapshot(json: string): GameState {
  return { ...JSON.parse(json), log: [], roundStarts: {}, results: [] } as GameState;
}

function canAct(state: GameState): boolean {
  return state.phase === "planning" || state.phase === "paused";
}

function spend(state: GameState, cost: number): boolean {
  if (state.ap < cost) return false;
  state.ap -= cost;
  state.apSpent += cost;
  return true;
}

export function inspectionAvailable(state: GameState, flow: SourceId): boolean {
  const dest = flowsFor(state)[flow].dest;
  if (!findPath(state.links, "internet", "inspect")) return false;
  const path = findPath(state.links, "internet", dest);
  return !path || path.includes("inspect");
}

export function apply(state: GameState, command: Command): ApplyResult {
  if (command.type !== "launch" && command.type !== "pause" && !canAct(state)) {
    return { ok: false, error: "Actions can be taken while planning or paused." };
  }
  const def = currentRound(state);
  const fail = (error: string): ApplyResult => ({ ok: false, error });

  switch (command.type) {
    case "inspect": {
      if (!def.allowedActions.includes("inspect")) return fail("Inspection isn't needed this round.");
      if (!def.flows.includes(command.flow)) return fail("That traffic isn't present this round.");
      if (state.inspected.includes(command.flow)) return fail("Already inspected.");
      if (!inspectionAvailable(state, command.flow)) {
        return fail("This traffic doesn't pass the Inspection Point, so no evidence is recorded.");
      }
      if (!spend(state, ACTION_COSTS.inspect)) return fail("Not enough action points.");
      state.inspected.push(command.flow);
      break;
    }
    case "assess": {
      if (!state.inspected.includes(command.flow)) return fail("Inspect the activity first.");
      state.assessments[command.flow] = command.verdict;
      break;
    }
    case "addRule": {
      if (!def.allowedActions.includes("rule")) return fail("Access rules unlock in a later round.");
      if (!spend(state, ACTION_COSTS.rule)) return fail("Not enough action points.");
      state.rules.push({ ...command.rule, id: `rule-${state.nextId++}` });
      break;
    }
    case "reviseRule": {
      const index = state.rules.findIndex((rule) => rule.id === command.ruleId);
      if (index < 0) return fail("Rule not found.");
      if (!spend(state, ACTION_COSTS.revise)) return fail("Not enough action points.");
      if (command.rule) state.rules[index] = { ...command.rule, id: command.ruleId };
      else state.rules.splice(index, 1);
      break;
    }
    case "addRoute": {
      const candidate = def.candidates.find((item) => item.id === command.routeId);
      if (!candidate) return fail("That route isn't available now.");
      if (state.builtRoutes.includes(candidate.id)) return fail("Route already built.");
      if (!spend(state, ACTION_COSTS.route)) return fail("Not enough action points.");
      state.builtRoutes.push(candidate.id);
      for (const [a, b] of candidate.links) {
        if (!linkBetween(state.links, a, b)) {
          state.links.push({ id: linkId(a, b), a, b, status: "up", kind: candidate.kind, routeId: candidate.id });
        }
      }
      break;
    }
    case "removeRoute": {
      if (!state.builtRoutes.includes(command.routeId)) return fail("Route not built.");
      if (!spend(state, ACTION_COSTS.revise)) return fail("Not enough action points.");
      state.builtRoutes = state.builtRoutes.filter((id) => id !== command.routeId);
      state.links = state.links.filter((link) => link.routeId !== command.routeId);
      break;
    }
    case "pause": {
      if (state.phase !== "running") return fail("Not running.");
      state.phase = "paused";
      state.pause = { title: "Paused", message: "Take your time — the wave waits while you plan.", eventKey: "manual" };
      break;
    }
    case "launch": {
      if (state.phase === "planning" || state.phase === "paused") {
        state.phase = "running";
        state.pause = null;
      } else {
        return fail("Nothing to launch.");
      }
      break;
    }
  }
  state.log.push({ round: state.round, attempt: state.attempt, t: state.steps, c: command });
  state.lastActionTick = state.tick;
  return { ok: true };
}

export function nodeDistance(a: NodeId, b: NodeId): number {
  return polylineLength(linkPolyline(a, b));
}

function resolve(state: GameState, token: Token, outcome: "delivered" | "blocked" | "failed", reason?: Token["reason"]): void {
  token.state = outcome;
  token.reason = reason;
  token.resolvedTick = state.tick;
  token.to = null;
  state.stats[token.flow][outcome] += 1;
}

export function step(state: GameState): void {
  if (state.phase !== "running") return;
  state.steps += 1;
  const def = currentRound(state);
  const flows = flowsFor(state);

  for (const event of def.events) {
    if (event.kind !== "linkFail" || state.firedEvents.includes(event.linkId)) continue;
    if (state.tick < event.tick) continue;
    const link = state.links.find((item) => item.id === event.linkId);
    if (!link) continue;
    link.status = "down";
    state.firedEvents.push(event.linkId);
    for (const token of state.tokens) {
      if (token.to && (link.a === token.at || link.b === token.at) && (link.a === token.to || link.b === token.to)) {
        token.to = null;
        token.progress = 0;
      }
    }
    state.pause = { title: event.title, message: event.message, eventKey: event.linkId };
    state.phase = "paused";
    return;
  }

  while (state.spawnIndex < state.schedule.length && state.schedule[state.spawnIndex].tick <= state.tick) {
    const request = state.schedule[state.spawnIndex];
    state.spawnIndex += 1;
    state.stats[request.flow].total += 1;
    state.tokens.push({
      id: state.nextId++,
      flow: request.flow,
      permitted: flows[request.flow].permitted,
      at: "internet",
      to: null,
      progress: 0,
      state: "moving",
      evaluated: false,
      visited: ["internet"],
      resolvedTick: -1,
    });
  }

  for (const token of state.tokens) {
    if (token.state !== "moving" && token.state !== "waiting") continue;
    const flow = flows[token.flow];

    if (token.to === null) {
      if (token.at === flow.dest) {
        if (missingDependency(state.links, flow.dest)) resolve(state, token, "failed", "dependency");
        else resolve(state, token, "delivered");
        continue;
      }
      if (token.at === "gateway" && !token.evaluated) {
        const decision = evaluate(state.rules, flow);
        for (const event of def.events) {
          if (event.kind !== "pauseOnArrival" || event.flow !== token.flow) continue;
          if (state.firedEvents.includes(`arrive:${event.flow}`) || !decision.allowed) continue;
          if (state.assessments[event.flow] === "violates" && state.inspected.includes(event.flow)) continue;
          state.firedEvents.push(`arrive:${event.flow}`);
          state.pause = { title: event.title, message: event.message, eventKey: `arrive:${event.flow}` };
          state.phase = "paused";
          return;
        }
        token.evaluated = true;
        token.ruleId = decision.ruleId;
        if (!decision.allowed) {
          resolve(state, token, "blocked", decision.ruleId === "default" ? "default" : "rule");
          continue;
        }
      }
      const path = findPath(state.links, token.at, flow.dest);
      if (!path || path.length < 2) {
        token.state = "waiting";
        continue;
      }
      token.state = "moving";
      token.to = path[1];
      token.progress = 0;
    }

    const link = linkBetween(state.links, token.at, token.to);
    if (!link || link.status !== "up") {
      token.to = null;
      token.progress = 0;
      continue;
    }
    token.progress += TOKEN_SPEED / nodeDistance(token.at, token.to);
    if (token.progress >= 1) {
      token.at = token.to;
      token.to = null;
      token.progress = 0;
      token.visited.push(token.at);
    }
  }

  state.tick += 1;

  const allSpawned = state.spawnIndex >= state.schedule.length;
  const active = state.tokens.filter((token) => token.state === "moving" || token.state === "waiting");
  const lastSpawn = state.schedule.length ? state.schedule[state.schedule.length - 1].tick : 0;
  if (allSpawned && (active.length === 0 || state.tick > lastSpawn + DRAIN_TICKS)) {
    for (const token of active) resolve(state, token, "failed", "stuck");
    finishRound(state);
  }
}

function finishRound(state: GameState): void {
  const def = currentRound(state);
  const s = state.stats;
  const legitTotal = s.supplier.total + s.hrstaff.total;
  const legitDelivered = s.supplier.delivered + s.hrstaff.delivered;
  const legitRatio = legitTotal ? legitDelivered / legitTotal : 1;
  const financeRatio = s.supplier.total ? s.supplier.delivered / s.supplier.total : 1;
  const success =
    legitRatio >= def.success.minLegitRatio &&
    financeRatio >= (def.success.minFinanceRatio ?? 0) &&
    s.unknown.delivered <= def.success.maxProhibitedDelivered;

  let outcome: RoundResult["outcome"] = "success";
  if (!success) {
    state.setbacks += 1;
    outcome = state.setbacks >= SETBACK_LIMIT ? "retry" : "setback";
  }
  state.roundStats[state.round] = JSON.parse(JSON.stringify(s));
  const { headline, explanations } = explainRound(state, outcome);
  state.results.push({ round: state.round, attempt: state.attempt, outcome, stats: state.roundStats[state.round]!, headline, explanations });
  state.phase = "roundEnd";
}

export function lastResult(state: GameState): RoundResult | undefined {
  return state.results[state.results.length - 1];
}

// Called when the learner dismisses the round result. Returns false when the
// scenario must be retried from the start.
export function advance(state: GameState): "next" | "repeat" | "complete" | "retry" {
  const result = lastResult(state);
  if (!result || state.phase !== "roundEnd") return "next";
  if (result.outcome === "retry") return "retry";
  if (result.outcome === "setback") {
    state.attempt += 1;
    startRound(state, state.round, true);
    return "repeat";
  }
  if (state.round + 1 >= roundsFor(state).length) {
    state.phase = "complete";
    return "complete";
  }
  state.attempt = 0;
  startRound(state, state.round + 1, false);
  return "next";
}

// Rebuild a round attempt from its start snapshot and the recorded commands.
// Returns a stepper used by the debrief replay and by tests.
export function createReplay(state: GameState, round: number, attempt: number) {
  const json = state.roundStarts[`${round}:${attempt}`];
  if (!json) return null;
  const replay = restoreSnapshot(json);
  const commands = state.log.filter((entry) => entry.round === round && entry.attempt === attempt);
  let index = 0;
  return {
    state: replay,
    advance(): boolean {
      let guard = 0;
      while (index < commands.length && commands[index].t === replay.steps && guard < 50) {
        apply(replay, commands[index].c);
        index += 1;
        guard += 1;
      }
      if (replay.phase === "running") {
        step(replay);
        return true;
      }
      return index < commands.length && replay.phase !== "roundEnd";
    },
  };
}
