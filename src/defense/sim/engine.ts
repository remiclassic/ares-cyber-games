import { createRng, nextInt, shuffle } from "../../sim/rng";
import type { Campaign, CampaignRun, Check, Command, Control, GameState, Result, Scenario, StageId, Step, Summary, Technique, Wave, WaveRecord, WaveScore } from "./types";

// Rules for Defense in Depth. Deterministic: the same deployed controls always produce the same
// runs. The seed only picks which of two authored preference orders the actors use.
//
// One stage at a time, each campaign:
//  - uses the first option at that stage that no deployed control blocks (skipping blocked ones);
//    if every option is blocked, it stops there;
//  - can be detected. A detection is acted on only if 24×7 response is in service; responders
//    contain the campaign after one more stage runs. With nobody responding, the alert waits.
//  - costs 1 damage once initial access succeeds (a foothold), and at Impact adds full damage,
//    or reduced damage when backups can recover it.

export const WEIGHTS = { outcome: 50, depth: 25, friction: 25 } as const;
export const RECOVERED_DAMAGE = 1;
// A foothold is never free: the host is investigated and rebuilt, the user's session revoked.
export const FOOTHOLD_DAMAGE = 1;
export const MAX_DAMAGE = FOOTHOLD_DAMAGE + 3;
const ORDER: readonly StageId[] = ["initial", "execution", "credential", "lateral", "impact"];

export function createGame(scenario: Scenario, seed: string, attempt = 0): GameState {
  return {
    scenario,
    seed,
    attempt,
    variant: (nextInt(createRng(seed), 0, 2) + attempt) % 2,
    waveIndex: 0,
    phase: "plan",
    locked: [],
    added: [],
    creditsLeft: scenario.waves[0].credits,
    log: [],
    records: [],
  };
}

export function currentWave(state: GameState): Wave {
  return state.scenario.waves[state.waveIndex];
}

export function deployed(state: GameState): string[] {
  return [...state.locked, ...state.added];
}

export function frictionOf(scenario: Scenario, controls: readonly string[]): number {
  return controls.reduce((sum, id) => sum + control(scenario, id).friction, 0);
}

export function control(scenario: Scenario, id: string): Control {
  const found = scenario.controls.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown control ${id}`);
  return found;
}

export function technique(scenario: Scenario, id: string): Technique {
  const found = scenario.techniques.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown technique ${id}`);
  return found;
}

export function prefs(campaign: Campaign, variant: number, stage: Exclude<StageId, "execution">): readonly string[] {
  return (variant === 1 && campaign.alt?.[stage]) || campaign[stage];
}

function withEffect(scenario: Scenario, controls: readonly string[], techniqueId: string, effect: "block" | "detect" | "recover"): string[] {
  return controls.filter((id) => control(scenario, id).effects[techniqueId] === effect);
}

export function runCampaign(scenario: Scenario, campaign: Campaign, controls: readonly string[], variant: number): CampaignRun {
  const responders = controls.filter((id) => control(scenario, id).responds);
  const steps: Step[] = [];
  let containAt = -1;
  let detectedBy: string[] = [];
  let lastInitial: Technique | null = null;
  let damage = 0;
  for (let index = 0; index < ORDER.length; index += 1) {
    const stage = ORDER[index];
    const options = stage === "execution" ? [lastInitial!.leadsTo!] : prefs(campaign, variant, stage);
    const open = options.find((id) => withEffect(scenario, controls, id, "block").length === 0);
    const skipped = options.slice(0, open ? options.indexOf(open) : options.length);
    if (!open) {
      const by = [...new Set(options.flatMap((id) => withEffect(scenario, controls, id, "block")))];
      steps.push({ stage, technique: options[options.length - 1], result: "blocked", by, unanswered: false, skipped: skipped.slice(0, -1) });
      return { campaign: campaign.id, steps, stopped: true, stoppedAt: stage, decisive: by, damage };
    }
    if (index === containAt) {
      const by = [...new Set([...detectedBy, ...responders])];
      steps.push({ stage, technique: open, result: "contained", by, unanswered: false, skipped });
      return { campaign: campaign.id, steps, stopped: true, stoppedAt: stage, decisive: by, damage };
    }
    const tech = technique(scenario, open);
    if (stage === "initial") {
      lastInitial = tech;
      damage += FOOTHOLD_DAMAGE;
    }
    const detectors = withEffect(scenario, controls, open, "detect");
    if (stage === "impact") {
      const recovers = withEffect(scenario, controls, open, "recover");
      damage += recovers.length ? Math.min(RECOVERED_DAMAGE, tech.damage ?? 0) : (tech.damage ?? 0);
      steps.push({ stage, technique: open, result: recovers.length ? "recovered" : detectors.length ? "detected" : "ran", by: recovers.length ? recovers : detectors, unanswered: detectors.length > 0 && responders.length === 0, skipped });
      return { campaign: campaign.id, steps, stopped: false, stoppedAt: null, decisive: [], damage };
    }
    if (detectors.length) {
      const answered = responders.length > 0;
      if (answered && containAt < 0) {
        containAt = index + 2;
        detectedBy = detectors.filter((id) => !control(scenario, id).responds).length ? detectors.filter((id) => !control(scenario, id).responds) : detectors;
      }
      steps.push({ stage, technique: open, result: "detected", by: detectors, unanswered: !answered, skipped });
    } else {
      steps.push({ stage, technique: open, result: "ran", by: [], unanswered: false, skipped });
    }
  }
  throw new Error("unreachable");
}

export function runWave(scenario: Scenario, wave: Wave, controls: readonly string[], variant: number): CampaignRun[] {
  return wave.campaigns.map((campaign) => runCampaign(scenario, campaign, controls, variant));
}

// A stop is resilient when it survives the failure of any single control it depended on.
export function resilience(scenario: Scenario, campaign: Campaign, controls: readonly string[], variant: number, run: CampaignRun): { resilient: boolean; failsWithout: string | null } {
  if (!run.stopped) return { resilient: false, failsWithout: null };
  for (const id of run.decisive) {
    const again = runCampaign(scenario, campaign, controls.filter((entry) => entry !== id), variant);
    if (!again.stopped) return { resilient: false, failsWithout: id };
  }
  return { resilient: true, failsWithout: null };
}

export function scoreWave(scenario: Scenario, wave: Wave, controls: readonly string[], runs: readonly CampaignRun[], resilient: number): WaveScore {
  const maxDamage = wave.campaigns.length * MAX_DAMAGE;
  const damage = runs.reduce((sum, run) => sum + run.damage, 0);
  const frictionUsed = frictionOf(scenario, controls);
  const allowance = wave.frictionAllowance;
  const frictionShare = frictionUsed <= allowance ? 1 : Math.max(0, 1 - (frictionUsed - allowance) / allowance);
  const outcome = Math.round(WEIGHTS.outcome * (1 - damage / maxDamage));
  const depth = Math.round((WEIGHTS.depth * resilient) / wave.campaigns.length);
  const friction = Math.round(WEIGHTS.friction * frictionShare);
  return { outcome, depth, friction, total: outcome + depth + friction, damage, maxDamage, resilient, campaigns: wave.campaigns.length, frictionUsed, frictionAllowance: allowance };
}

export function apply(state: GameState, command: Command): Result {
  const fail = (error: string): Result => ({ ok: false, error });
  const scenario = state.scenario;
  switch (command.type) {
    case "deploy": {
      if (state.phase !== "plan") return fail("Plan before the wave runs.");
      const entry = scenario.controls.find((item) => item.id === command.control);
      if (!entry) return fail("Unknown control.");
      if (deployed(state).includes(entry.id)) return fail("Already in service.");
      if (entry.cost > state.creditsLeft) return fail(`Not enough budget: ${entry.short} costs ${entry.cost}.`);
      state.added.push(entry.id);
      state.creditsLeft -= entry.cost;
      break;
    }
    case "remove": {
      if (state.phase !== "plan") return fail("Plan before the wave runs.");
      if (state.locked.includes(command.control)) return fail("Controls from earlier waves stay in service.");
      if (!state.added.includes(command.control)) return fail("Not deployed.");
      state.added = state.added.filter((id) => id !== command.control);
      state.creditsLeft += control(scenario, command.control).cost;
      break;
    }
    case "launch": {
      if (state.phase !== "plan") return fail("The wave already ran.");
      state.log.push(command);
      state.records.push(closeWave(state));
      state.locked = deployed(state);
      state.added = [];
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
      if (state.phase !== "result") return fail("Run the wave first.");
      if (record.check && !record.answer) return fail("Answer the reasoning check first.");
      if (state.waveIndex + 1 >= scenario.waves.length) {
        state.phase = "done";
        return { ok: true };
      }
      state.waveIndex += 1;
      state.creditsLeft += currentWave(state).credits;
      state.phase = "plan";
      state.log = [];
      return { ok: true };
    }
  }
  state.log.push(command);
  return { ok: true };
}

function closeWave(state: GameState): WaveRecord {
  const scenario = state.scenario;
  const wave = currentWave(state);
  const controls = deployed(state);
  const runs = runWave(scenario, wave, controls, state.variant);
  const resilienceMap: WaveRecord["resilience"] = {};
  wave.campaigns.forEach((campaign, index) => {
    resilienceMap[campaign.id] = resilience(scenario, campaign, controls, state.variant, runs[index]);
  });
  const resilientCount = Object.values(resilienceMap).filter((entry) => entry.resilient).length;
  return {
    waveId: wave.id,
    deployed: controls,
    added: [...state.added],
    runs,
    resilience: resilienceMap,
    score: scoreWave(scenario, wave, controls, runs, resilientCount),
    check: buildCheck(state, controls, runs),
    answer: null,
    log: [...state.log],
  };
}

// "If X failed, what would stop this campaign next?" The right answer comes from running the
// campaign again without X. Wrong options are controls you deployed that do not act on its path.
function buildCheck(state: GameState, controls: readonly string[], runs: readonly CampaignRun[]): Check | null {
  const scenario = state.scenario;
  const wave = currentWave(state);
  const pickIndex = runs.findIndex((run) => run.stopped && run.decisive.length > 0);
  if (pickIndex < 0) return null;
  const campaign = wave.campaigns[pickIndex];
  const run = runs[pickIndex];
  const removed = run.decisive[0];
  const without = controls.filter((id) => id !== removed);
  const again = runCampaign(scenario, campaign, without, state.variant);
  const nothing = `Nothing would: it reaches the ${scenario.crownJewels.toLowerCase()}`;
  const correct = again.stopped ? again.decisive.map((id) => control(scenario, id).name).join(" + ") : nothing;
  const onPath = new Set([...run.steps, ...again.steps].flatMap((step) => step.by));
  const pool = [...without, ...scenario.controls.map((entry) => entry.id)].filter((id, index, list) => list.indexOf(id) === index && id !== removed && !onPath.has(id));
  const distractors = pool.slice(0, again.stopped ? 1 : 2).map((id) => control(scenario, id).name);
  const options = shuffle(createRng(`${state.seed}:check:${state.waveIndex}`), [correct, ...(again.stopped ? [nothing] : []), ...distractors]);
  const stopStep = again.steps[again.steps.length - 1];
  return {
    campaign: campaign.id,
    removed,
    question: `If ${control(scenario, removed).name} failed, what would stop “${campaign.name}”?`,
    options,
    correct: options.indexOf(correct),
    explain: again.stopped
      ? `Without it, the actor gets as far as ${scenario.stages.find((stage) => stage.id === stopStep.stage)!.name.toLowerCase()}, where ${correct} stops “${technique(scenario, stopStep.technique).name}”. That second layer is what makes the defence resilient.`
      : `Without it, nothing else on the path stops the actor: “${technique(scenario, stopStep.technique).name}” completes. That control was a single point of failure.`,
  };
}

export function summarize(records: readonly WaveRecord[]): Summary {
  const mean = (pick: (record: WaveRecord) => number) => (records.length ? Math.round(records.reduce((sum, record) => sum + pick(record), 0) / records.length) : 0);
  const checks = records.filter((record) => record.check);
  return {
    total: mean((record) => record.score.total),
    outcome: mean((record) => record.score.outcome),
    depth: mean((record) => record.score.depth),
    friction: mean((record) => record.score.friction),
    damage: records.reduce((sum, record) => sum + record.score.damage, 0),
    maxDamage: records.reduce((sum, record) => sum + record.score.maxDamage, 0),
    resilient: records.reduce((sum, record) => sum + record.score.resilient, 0),
    campaigns: records.reduce((sum, record) => sum + record.score.campaigns, 0),
    checksCorrect: checks.filter((record) => record.answer?.correct).length,
    checksTotal: checks.length,
    unansweredDetections: records.reduce((sum, record) => sum + record.runs.reduce((inner, run) => inner + run.steps.filter((step) => step.unanswered).length, 0), 0),
  };
}
