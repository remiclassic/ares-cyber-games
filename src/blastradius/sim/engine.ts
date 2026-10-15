import { createRng, nextInt, shuffle } from "../../sim/rng";
import { deduce, knowledge, sensorCount, triagesNeeded, truthOf, type Evidence } from "./logic";
import type { CaseDef, CaseRecord, CaseScore, Check, Command, GameState, HostOutcome, Result, Scenario, Summary } from "./types";

// Rules and scoring for Blast Radius. Deterministic: a run is rebuilt from the scenario, seed,
// attempt number and command log.

export const WEIGHTS = { containment: 40, continuity: 30, evidence: 20, efficiency: 10 } as const;

export function createGame(scenario: Scenario, seed: string, attempt = 0): GameState {
  const state: GameState = {
    scenario,
    seed,
    attempt,
    caseIndex: 0,
    variant: 0,
    phase: "play",
    reads: new Set(),
    triages: new Set(),
    decisions: new Map(),
    minutesUsed: 0,
    log: [],
    records: [],
  };
  state.variant = variantFor(seed, attempt, 0);
  return state;
}

// The seed picks one of the case's two truths; each retry swaps to the other.
export function variantFor(seed: string, attempt: number, caseIndex: number): number {
  return (nextInt(createRng(`${seed}:${caseIndex}`), 0, 2) + attempt) % 2;
}

export function currentCase(state: GameState): CaseDef {
  return state.scenario.cases[state.caseIndex];
}

export function truth(state: GameState): Set<string> {
  return truthOf(currentCase(state), state.variant);
}

export function evidence(state: GameState): Evidence {
  return { reads: state.reads, triages: state.triages };
}

export function minutesLeft(state: GameState): number {
  return currentCase(state).budgetMinutes - state.minutesUsed;
}

export function readingOf(state: GameState, sensorId: string): number | null {
  return state.reads.has(sensorId) ? sensorCount(currentCase(state), sensorId, truth(state)) : null;
}

export function triageResult(state: GameState, hostId: string): boolean | null {
  return state.triages.has(hostId) ? truth(state).has(hostId) : null;
}

// How many hosts the learner has marked for isolation behind a sensor. Shown next to the
// reading so a mismatch is visible before submitting (the "counter" from the source game).
export function markedBehind(state: GameState, sensorId: string): number {
  const sensor = currentCase(state).sensors.find((entry) => entry.id === sensorId)!;
  return sensor.covers.filter((id) => state.decisions.get(id) === "isolate").length;
}

export function apply(state: GameState, command: Command): Result {
  const def = currentCase(state);
  const fail = (error: string): Result => ({ ok: false, error });
  switch (command.type) {
    case "read": {
      if (state.phase !== "play") return fail("The case is closed.");
      if (!def.sensors.some((sensor) => sensor.id === command.sensor)) return fail("Unknown sensor.");
      if (state.reads.has(command.sensor)) return fail("Already read.");
      if (minutesLeft(state) < state.scenario.costs.readSensor) return fail("Not enough case time left.");
      state.reads.add(command.sensor);
      state.minutesUsed += state.scenario.costs.readSensor;
      break;
    }
    case "triage": {
      if (state.phase !== "play") return fail("The case is closed.");
      if (!def.hosts.some((host) => host.id === command.host)) return fail("Unknown host.");
      if (state.triages.has(command.host)) return fail("Already triaged.");
      if (minutesLeft(state) < state.scenario.costs.triage) return fail("Not enough case time left for a triage.");
      state.triages.add(command.host);
      state.minutesUsed += state.scenario.costs.triage;
      break;
    }
    case "decide": {
      if (state.phase !== "play") return fail("The case is closed.");
      if (!def.hosts.some((host) => host.id === command.host)) return fail("Unknown host.");
      if (command.decision) state.decisions.set(command.host, command.decision);
      else state.decisions.delete(command.host);
      break;
    }
    case "submit": {
      if (state.phase !== "play") return fail("The case is closed.");
      const undecided = def.hosts.filter((host) => !state.decisions.has(host.id));
      if (undecided.length > 0) return fail(`Decide every host first (${undecided.length} left).`);
      state.log.push(command);
      state.records.push(closeCase(state, command.elapsedSeconds));
      state.phase = "result";
      return { ok: true };
    }
    case "answer": {
      const record = state.records[state.records.length - 1];
      if (state.phase !== "result" || !record?.check) return fail("No question is open.");
      if (record.answer) return fail("Already answered.");
      if (command.choice < 0 || command.choice >= record.check.options.length) return fail("Unknown option.");
      record.answer = { choice: command.choice, correct: command.choice === record.check.correct };
      record.log.push(command);
      return { ok: true };
    }
    case "next": {
      const record = state.records[state.records.length - 1];
      if (state.phase !== "result") return fail("Submit the case first.");
      if (record.check && !record.answer) return fail("Answer the reasoning check first.");
      if (state.caseIndex + 1 >= state.scenario.cases.length) {
        state.phase = "done";
        return { ok: true };
      }
      state.caseIndex += 1;
      state.variant = variantFor(state.seed, state.attempt, state.caseIndex);
      state.phase = "play";
      state.reads = new Set();
      state.triages = new Set();
      state.decisions = new Map();
      state.minutesUsed = 0;
      state.log = [];
      return { ok: true };
    }
  }
  state.log.push(command);
  return { ok: true };
}

function closeCase(state: GameState, seconds: number): CaseRecord {
  const def = currentCase(state);
  const real = truth(state);
  const known = knowledge(def, real, evidence(state));
  const reasons = deduce(def, real, evidence(state));
  const outcomes: HostOutcome[] = def.hosts.map((host) => {
    const decision = state.decisions.get(host.id)!;
    const isCompromised = real.has(host.id);
    const k = known.get(host.id)!;
    // Watch is honest uncertainty only after reading every sensor in front of the host.
    const looked = def.sensors.every((sensor) => !sensor.covers.includes(host.id) || state.reads.has(sensor.id));
    const supported = (decision === "isolate" && k === "compromised") || (decision === "keep" && k === "clean") || (decision === "watch" && k === "unknown" && looked);
    const reason = reasons.get(host.id)?.reason;
    const proof = reason ? ` Your evidence proved it: ${reason}` : "";
    const open = " The evidence you gathered left it open; a triage or another sensor would have settled it.";
    let verdict: HostOutcome["verdict"];
    let why: string;
    if (isCompromised) {
      if (decision === "isolate") {
        verdict = "contained";
        why = k === "compromised" ? `Contained.${proof}` : `Contained, but it was a guess.${open}`;
      } else if (decision === "watch") {
        verdict = "watched-compromised";
        why = `Still beaconing. Watching does not stop the attacker using it.${k === "compromised" ? proof : open}`;
      } else {
        verdict = "missed";
        why = `Missed: it stays online and keeps beaconing.${k === "compromised" ? proof : open}`;
      }
    } else if (decision === "isolate") {
      verdict = "over-isolated";
      why = `Clean, but isolated${host.weight > 1 ? `: the ${host.role.toLowerCase()} going offline stops the business` : ", so its user loses the day's work"}.${k === "clean" ? proof : open}`;
    } else if (decision === "watch") {
      verdict = "watched-clean";
      why = k === "clean" ? `Clean. Watching was more than needed.${proof}` : looked ? `Clean. Watching was the honest call on the evidence you had.` : `Clean, but a sensor in front of it was never read, so watching was not yet justified.`;
    } else {
      verdict = "kept-clean";
      why = k === "clean" ? `Kept online correctly.${proof}` : `Clean and kept online, but it was a guess.${open}`;
    }
    return { host: host.id, truth: isCompromised ? "compromised" : "clean", decision, known: k, supported, verdict, why };
  });
  const score = scoreCase(def, outcomes, state.triages.size, triagesNeeded(def, real).count);
  const record: CaseRecord = {
    caseId: def.id,
    variant: state.variant,
    reads: [...state.reads],
    triages: [...state.triages],
    decisions: Object.fromEntries(state.decisions),
    minutesUsed: state.minutesUsed,
    seconds,
    outcomes,
    score,
    check: buildCheck(state, outcomes, reasons),
    answer: null,
    log: [...state.log],
  };
  return record;
}

export function scoreCase(def: CaseDef, outcomes: readonly HostOutcome[], triagesUsed: number, triagesNeededCount: number): CaseScore {
  const weight = (id: string) => def.hosts.find((host) => host.id === id)!.weight;
  const compromised = outcomes.filter((outcome) => outcome.truth === "compromised");
  const clean = outcomes.filter((outcome) => outcome.truth === "clean");
  const isolated = compromised.filter((outcome) => outcome.decision === "isolate").length;
  const cleanWeight = clean.reduce((sum, outcome) => sum + weight(outcome.host), 0);
  const overWeight = clean.filter((outcome) => outcome.decision === "isolate").reduce((sum, outcome) => sum + weight(outcome.host), 0);
  const containment = compromised.length ? (WEIGHTS.containment * isolated) / compromised.length : WEIGHTS.containment;
  const continuity = cleanWeight ? WEIGHTS.continuity * (1 - overWeight / cleanWeight) : WEIGHTS.continuity;
  const evidenceScore = (WEIGHTS.evidence * outcomes.filter((outcome) => outcome.supported).length) / outcomes.length;
  // Saving triage time only counts when it did not cost containment and the calls still rest
  // on evidence; skipping triage and guessing is not efficient.
  const containedShare = compromised.length ? isolated / compromised.length : 1;
  const supportedShare = outcomes.filter((outcome) => outcome.supported).length / outcomes.length;
  const efficiency = WEIGHTS.efficiency * Math.min(1, (triagesNeededCount + 1) / (triagesUsed + 1)) * containedShare * supportedShare;
  const round = (value: number) => Math.round(value);
  return {
    containment: round(containment),
    continuity: round(continuity),
    evidence: round(evidenceScore),
    efficiency: round(efficiency),
    total: round(containment) + round(continuity) + round(evidenceScore) + round(efficiency),
    compromisedTotal: compromised.length,
    compromisedIsolated: isolated,
    cleanIsolated: clean.filter((outcome) => outcome.decision === "isolate").length,
    triagesUsed,
    triagesNeeded: triagesNeededCount,
  };
}

// One reasoning question per case, about a host the sensors (not a triage) settled. Wrong
// options are common reasoning slips, not trick wording.
function buildCheck(state: GameState, outcomes: readonly HostOutcome[], reasons: ReturnType<typeof deduce>): Check | null {
  const def = currentCase(state);
  const candidates = [...reasons.values()]
    .filter((entry) => !state.triages.has(entry.host))
    .sort((a, b) => {
      const okA = outcomes.find((outcome) => outcome.host === a.host)!.supported ? 0 : 1;
      const okB = outcomes.find((outcome) => outcome.host === b.host)!.supported ? 0 : 1;
      return okA - okB || a.order - b.order;
    });
  const pick = candidates[0];
  if (!pick) return null;
  const host = def.hosts.find((entry) => entry.id === pick.host)!;
  const wrong =
    pick.status === "clean"
      ? ["It raised no alert of its own, so it must be clean.", `A ${host.role.toLowerCase()} is a low-value target, so it was unlikely to be hit.`]
      : ["A sensor in front of it counted more than zero, so every host behind that sensor is compromised.", `A ${host.role.toLowerCase()} is a likely target, so it was probably hit.`];
  const options = shuffle(createRng(`${state.seed}:check:${state.caseIndex}`), [pick.reason, ...wrong]);
  return {
    host: host.id,
    question: pick.status === "clean" ? `Why can ${host.label} safely stay online?` : `Why must ${host.label} be isolated?`,
    options,
    correct: options.indexOf(pick.reason),
    explain:
      pick.status === "clean"
        ? "Absence of an alert is not evidence, and a host's role does not change what the counts say. The counts, and what you already know about the other hosts behind the sensor, decide it."
        : "A count above zero says how many, not which. Role-based hunches are hypotheses to test, not proof.",
  };
}

export function summarize(records: readonly CaseRecord[]): Summary {
  const mean = (pick: (record: CaseRecord) => number) =>
    records.length ? Math.round(records.reduce((sum, record) => sum + pick(record), 0) / records.length) : 0;
  const outcomes = records.flatMap((record) => record.outcomes);
  const checks = records.filter((record) => record.check);
  return {
    total: mean((record) => record.score.total),
    containment: mean((record) => record.score.containment),
    continuity: mean((record) => record.score.continuity),
    evidence: mean((record) => record.score.evidence),
    efficiency: mean((record) => record.score.efficiency),
    seconds: records.reduce((sum, record) => sum + record.seconds, 0),
    checksCorrect: checks.filter((record) => record.answer?.correct).length,
    checksTotal: checks.length,
    missedCompromised: outcomes.filter((outcome) => outcome.truth === "compromised" && outcome.decision !== "isolate").length,
    overIsolated: outcomes.filter((outcome) => outcome.verdict === "over-isolated").length,
    unsupported: outcomes.filter((outcome) => !outcome.supported).length,
  };
}
