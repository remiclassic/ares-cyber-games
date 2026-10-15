import { createRng, nextInt, shuffle } from "../../sim/rng";
import type { Command, Fit, GameState, Hand, HandGrade, Incident, IncidentRecord, IncidentScore, ResponseCard, Result, Scenario, Summary, TechniqueCard } from "./types";

// Rules for Counterplay. Each hand: the actor's next technique arrives face down as telemetry;
// the defender names the technique, then plays one response card from the incident toolkit
// (each card once per incident). A counter scores for the defender, a miss for the actor, a
// partial for nobody. First to three wins the incident. Deterministic from seed, attempt and
// the defender's plays: the actor switches technique when its last move was countered.

export const WEIGHTS = { identify: 30, response: 40, outcome: 30 } as const;
const FIT_RANK: Record<Fit, number> = { counter: 2, partial: 1, miss: 0 };

export function createGame(scenario: Scenario, seed: string, attempt = 0): GameState {
  const state: GameState = {
    scenario,
    seed,
    attempt,
    incidentIndex: 0,
    step: 0,
    phase: "identify",
    values: {},
    toolkit: [],
    hands: [],
    defender: 0,
    attacker: 0,
    log: [],
    records: [],
  };
  startIncident(state);
  return state;
}

export function currentIncident(state: GameState): Incident {
  return state.scenario.incidents[state.incidentIndex];
}

export function card(scenario: Scenario, id: string): ResponseCard {
  const found = scenario.cards.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

export function techniqueOf(incident: Incident, id: string): TechniqueCard {
  const found = incident.techniques.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown technique ${id}`);
  return found;
}

export function fitOf(tech: TechniqueCard, cardId: string): Fit {
  return tech.counters.includes(cardId) ? "counter" : tech.partials.includes(cardId) ? "partial" : "miss";
}

export function noteFor(tech: TechniqueCard, cardId: string): string {
  const fit = fitOf(tech, cardId);
  return tech.notes[cardId] ?? (fit === "counter" ? "Counters this step." : fit === "partial" ? "Helps, but does not stop this step." : "Does not address this technique.");
}

export function currentHand(state: GameState): Hand {
  return state.hands[state.hands.length - 1];
}

function startIncident(state: GameState): void {
  const incident = currentIncident(state);
  const rng = createRng(`${state.seed}:${incident.id}`);
  state.values = Object.fromEntries(Object.entries(incident.values).map(([key, list]) => [key, list[(nextInt(rng, 0, list.length) + state.attempt) % list.length]]));
  state.toolkit = [...incident.toolkit];
  state.hands = [];
  state.defender = 0;
  state.attacker = 0;
  state.step = 0;
  state.log = [];
  state.phase = "identify";
  dealHand(state);
}

// The actor's next technique: the playbook step's choice, switching when the defender countered
// the last move; techniques already used are skipped. Null when the playbook runs out.
export function nextTechnique(state: GameState): string | null {
  const incident = currentIncident(state);
  const used = new Set(state.hands.map((hand) => hand.technique));
  const countered = state.hands.length > 0 && currentHand(state).fit === "counter";
  while (state.step < incident.playbook.length) {
    const step = incident.playbook[state.step];
    const first = countered && step.ifCountered ? step.ifCountered : step.play;
    const second = first === step.play ? step.ifCountered : step.play;
    const pick = [first, second].find((id) => id && !used.has(id));
    state.step += 1;
    if (pick) return pick;
  }
  return null;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function dealHand(state: GameState): boolean {
  const id = nextTechnique(state);
  if (!id) return false;
  const incident = currentIncident(state);
  const tech = techniqueOf(incident, id);
  const rng = createRng(`${state.seed}:${incident.id}:${state.hands.length}:${state.attempt}`);
  state.hands.push({
    technique: id,
    telemetry: fill(tech.telemetry[nextInt(rng, 0, tech.telemetry.length)], state.values),
    options: shuffle(rng, [tech.name, ...tech.lookalikes]),
    identified: null,
    card: null,
    fit: null,
    bestAvailable: null,
    bestCards: [],
  });
  state.phase = "identify";
  return true;
}

export function gradeHand(state: GameState, hand: Hand): HandGrade {
  const tech = techniqueOf(currentIncident(state), hand.technique);
  const identify = hand.identified === tech.name;
  let response: number;
  let note: string;
  if (hand.fit === hand.bestAvailable) {
    response = 1;
    note = hand.fit === "counter" ? "Best play: a counter." : hand.fit === "partial" ? "Best play left: no counter was still in the toolkit." : "Nothing left in the toolkit could help.";
  } else if (hand.fit === "partial") {
    response = 0.5;
    note = "A counter was still available.";
  } else {
    response = 0;
    note = hand.bestAvailable === "counter" ? "A counter was still available." : "A card that helped was still available.";
  }
  return { identify, response, note };
}

export function apply(state: GameState, command: Command): Result {
  const fail = (error: string): Result => ({ ok: false, error });
  switch (command.type) {
    case "identify": {
      if (state.phase !== "identify") return fail("Not identifying now.");
      const hand = currentHand(state);
      if (!hand.options.includes(command.choice)) return fail("Unknown option.");
      hand.identified = command.choice;
      state.phase = "respond";
      break;
    }
    case "play": {
      if (state.phase !== "respond") return fail(state.phase === "identify" ? "Name the technique first." : "Not your move.");
      if (!state.toolkit.includes(command.card)) return fail("That card is not in your toolkit.");
      const hand = currentHand(state);
      const tech = techniqueOf(currentIncident(state), hand.technique);
      const fits = state.toolkit.map((id) => ({ id, fit: fitOf(tech, id) }));
      const best = fits.reduce((top, entry) => (FIT_RANK[entry.fit] > FIT_RANK[top] ? entry.fit : top), "miss" as Fit);
      hand.bestAvailable = best;
      hand.bestCards = fits.filter((entry) => entry.fit === best && best !== "miss").map((entry) => entry.id);
      hand.card = command.card;
      hand.fit = fitOf(tech, command.card);
      state.toolkit = state.toolkit.filter((id) => id !== command.card);
      if (hand.fit === "counter") state.defender += 1;
      else if (hand.fit === "miss") state.attacker += 1;
      state.log.push(command);
      const target = state.scenario.target;
      if (state.defender >= target || state.attacker >= target) closeIncident(state);
      else state.phase = "reveal";
      return { ok: true };
    }
    case "next": {
      if (state.phase === "reveal") {
        state.log.push(command);
        if (!dealHand(state)) closeIncident(state);
        return { ok: true };
      }
      if (state.phase === "over") {
        if (state.incidentIndex + 1 >= state.scenario.incidents.length) {
          state.phase = "done";
          return { ok: true };
        }
        state.incidentIndex += 1;
        startIncident(state);
        return { ok: true };
      }
      return fail("Finish this hand first.");
    }
  }
  state.log.push(command);
  return { ok: true };
}

function closeIncident(state: GameState): void {
  const grades = state.hands.map((hand) => gradeHand(state, hand));
  state.records.push({ incidentId: currentIncident(state).id, hands: state.hands.map((hand) => ({ ...hand, options: [...hand.options], bestCards: [...hand.bestCards] })), grades, score: scoreIncident(state, grades), log: [...state.log] });
  state.phase = "over";
}

export function scoreIncident(state: GameState, grades: readonly HandGrade[]): IncidentScore {
  const target = state.scenario.target;
  const result: IncidentScore["result"] =
    state.defender >= target ? "evicted" : state.attacker >= target ? "breached" : state.defender > state.attacker ? "evicted" : state.attacker > state.defender ? "breached" : "stalemate";
  const share = (values: readonly number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const identify = Math.round(WEIGHTS.identify * share(grades.map((grade) => (grade.identify ? 1 : 0))));
  const response = Math.round(WEIGHTS.response * share(grades.map((grade) => grade.response)));
  const outcome = result === "evicted" ? WEIGHTS.outcome : result === "stalemate" ? Math.round(WEIGHTS.outcome / 2) : 0;
  return { identify, response, outcome, total: identify + response + outcome, defender: state.defender, attacker: state.attacker, result };
}

export function summarize(records: readonly IncidentRecord[]): Summary {
  const mean = (pick: (record: IncidentRecord) => number) => (records.length ? Math.round(records.reduce((sum, record) => sum + pick(record), 0) / records.length) : 0);
  const grades = records.flatMap((record) => record.grades);
  return {
    total: mean((record) => record.score.total),
    identify: mean((record) => record.score.identify),
    response: mean((record) => record.score.response),
    outcome: mean((record) => record.score.outcome),
    handsPlayed: grades.length,
    identifiedRight: grades.filter((grade) => grade.identify).length,
    bestPlays: grades.filter((grade) => grade.response === 1).length,
    evicted: records.filter((record) => record.score.result === "evicted").length,
    incidents: records.length,
  };
}
