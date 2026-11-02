// MFA Fatigue: one workday of push approvals. Pure rules; no DOM.
// Each prompt is either one the employee started (they just took the action on the timeline) or
// one the attacker sent with a stolen password. The phone looks the same either way: the context
// (what you were doing, where, when, and the number on your own screen) is the evidence.

export type Response = "approve" | "deny" | "report";
export const RESPONSES: readonly Response[] = ["approve", "deny", "report"];

export type Origin = "you" | "attacker";

// What, in the context, tells the two apart. Shown in the debrief replay.
export type ClueKind = "yours" | "match" | "not-signing-in" | "location" | "time" | "number" | "repeat" | "pressure";

export const CLUE_LABELS: Readonly<Record<ClueKind, string>> = {
  yours: "You had just started this sign-in",
  match: "Number matches your screen",
  "not-signing-in": "You weren't signing in",
  location: "Location doesn't match where you are",
  time: "Odd time: you were away or asleep",
  number: "Number doesn't match any screen of yours",
  repeat: "Repeated unexpected prompts",
  pressure: "Pressure to approve “to make it stop”",
};

export type Prompt = Readonly<{
  id: string;
  time: string; // "12:41", as shown on the phone
  doing: string; // what the employee is doing right now (the timeline context)
  where: string; // where the employee actually is
  screenNumber?: number; // the number on the employee's own sign-in screen, if they are signing in
  app: string; // as shown on the push
  location: string; // as shown on the push
  number?: number; // number-match code shown on the push
  message?: Readonly<{ from: string; text: string }>; // a chat/SMS that arrives with the prompt
  origin: Origin;
  clues: readonly ClueKind[];
  why: string; // authored explanation, shown after the decision and in the debrief
  hint: string;
  guided?: boolean; // the first prompt: coached
}>;

export type Beat = Readonly<{ time: string; text: string }>;

export type Stage = Readonly<{
  id: string;
  title: string;
  lesson: string;
  final?: boolean; // no hints, no coaching
  beats: readonly Beat[]; // timeline entries without a prompt (arrive, lunch, leave, asleep)
  prompts: readonly Prompt[];
}>;

export type Scenario = Readonly<{ id: string; title: string; org: string; employee: string; stages: readonly Stage[] }>;

// Approving your own sign-in is the only way work gets done; approving the attacker's is the
// breach. Denying your own blocks you (safe, but it costs productivity); reporting your own also
// raises a false alarm. For the attacker, Deny stops this push but leaves the stolen password in
// play; Report also tells security, who can reset it. So neither approve-all nor deny-all pays.
export const POINTS: Readonly<Record<Origin, Readonly<Record<Response, number>>>> = {
  you: { approve: 10, deny: 2, report: 0 },
  attacker: { report: 10, deny: 6, approve: 0 },
};

export const PASS_RATIO = 0.6;
// Security that stops the work is not a pass: at least this share of your own sign-ins must go through.
export const PASS_OWN_RATIO = 0.8;

export function bestResponse(prompt: Prompt): Response {
  return prompt.origin === "you" ? "approve" : "report";
}

export function pointsFor(prompt: Prompt, response: Response): number {
  return POINTS[prompt.origin][response];
}

export type Outcome = "signed-in" | "blocked-self" | "false-alarm" | "breach" | "blocked" | "reported";

export function outcomeOf(prompt: Prompt, response: Response): Outcome {
  if (prompt.origin === "you") return response === "approve" ? "signed-in" : response === "deny" ? "blocked-self" : "false-alarm";
  return response === "approve" ? "breach" : response === "deny" ? "blocked" : "reported";
}

// Minutes of work lost by blocking your own sign-in (retry) or reporting it (account locked).
export const LOST_MINUTES: Readonly<Record<Outcome, number>> = {
  "signed-in": 0,
  "blocked-self": 10,
  "false-alarm": 30,
  breach: 0,
  blocked: 0,
  reported: 0,
};

export const OUTCOME_TEXT: Readonly<Record<Outcome, string>> = {
  "signed-in": "Signed in. Your work carries on.",
  "blocked-self": "You blocked your own sign-in. Safe, but you had to start again and lost about 10 minutes.",
  "false-alarm": "You reported your own sign-in. The service desk locked your account to check, and you lost about 30 minutes.",
  breach: "You let the attacker in. Approving “to make it stop” is exactly what push bombing is for.",
  blocked: "Blocked. But the attacker still has your password and security doesn't know, so the pushes keep coming.",
  reported: "Blocked and reported. Security can reset your password and block the source.",
};

export function feedbackFor(prompt: Prompt, response: Response): string {
  return `${OUTCOME_TEXT[outcomeOf(prompt, response)]} ${prompt.why}`;
}

export type Pick = Readonly<{ prompt: string; response: Response; hinted: boolean; points: number; outcome: Outcome; correct: boolean }>;

export type GameState = { scenario: Scenario; index: number; picks: Pick[]; hinted: boolean; phase: "play" | "answered" | "done" };

export function allPrompts(scenario: Scenario): Prompt[] {
  return scenario.stages.flatMap((stage) => stage.prompts);
}

export function stageOf(scenario: Scenario, promptId: string): Stage {
  return scenario.stages.find((stage) => stage.prompts.some((prompt) => prompt.id === promptId))!;
}

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, picks: [], hinted: false, phase: "play" };
}

export function currentPrompt(state: GameState): Prompt {
  return allPrompts(state.scenario)[state.index];
}

export function hintsAllowed(state: GameState): boolean {
  const prompt = currentPrompt(state);
  return !stageOf(state.scenario, prompt.id).final;
}

export function respond(state: GameState, response: Response): Pick | null {
  if (state.phase !== "play" || !RESPONSES.includes(response)) return null;
  const prompt = currentPrompt(state);
  const pick: Pick = {
    prompt: prompt.id,
    response,
    hinted: state.hinted,
    points: pointsFor(prompt, response),
    outcome: outcomeOf(prompt, response),
    correct: response === bestResponse(prompt),
  };
  state.picks.push(pick);
  state.phase = "answered";
  return pick;
}

export function takeHint(state: GameState): string | null {
  if (state.phase !== "play" || !hintsAllowed(state)) return null;
  state.hinted = true;
  return currentPrompt(state).hint;
}

export function next(state: GameState): void {
  if (state.phase !== "answered") return;
  state.hinted = false;
  if (state.index + 1 >= allPrompts(state.scenario).length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.phase = "play";
}

// ---------- score (what the learner earned) ----------

export type Tally = Readonly<Record<Response, number>>;

export type Summary = Readonly<{
  total: number;
  max: number;
  passed: boolean; // no breach, at least PASS_RATIO of the maximum, and at least PASS_OWN_RATIO of own sign-ins
  breaches: number; // attacker prompts approved
  ownSignIns: number; // own prompts approved
  ownTotal: number;
  lostMinutes: number;
  own: Tally;
  attacker: Tally;
  hints: number;
  byStage: readonly { title: string; points: number; max: number }[];
}>;

function maxFor(prompts: readonly Prompt[]): number {
  return prompts.reduce((sum, prompt) => sum + pointsFor(prompt, bestResponse(prompt)), 0);
}

export function summarize(state: GameState): Summary {
  const prompts = allPrompts(state.scenario);
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const tally = (origin: Origin): Tally => {
    const own = state.picks.filter((pick) => byId.get(pick.prompt)!.origin === origin);
    return { approve: own.filter((p) => p.response === "approve").length, deny: own.filter((p) => p.response === "deny").length, report: own.filter((p) => p.response === "report").length };
  };
  const total = state.picks.reduce((sum, pick) => sum + pick.points, 0);
  const max = maxFor(prompts);
  const breaches = state.picks.filter((pick) => pick.outcome === "breach").length;
  const own = tally("you");
  const ownTotal = prompts.filter((prompt) => prompt.origin === "you").length;
  return {
    total,
    max,
    passed: breaches === 0 && total >= max * PASS_RATIO && own.approve >= ownTotal * PASS_OWN_RATIO,
    breaches,
    ownSignIns: own.approve,
    ownTotal,
    lostMinutes: state.picks.reduce((sum, pick) => sum + LOST_MINUTES[pick.outcome], 0),
    own,
    attacker: tally("attacker"),
    hints: state.picks.filter((pick) => pick.hinted).length,
    byStage: state.scenario.stages.map((stage) => {
      const picks = state.picks.filter((pick) => stage.prompts.some((prompt) => prompt.id === pick.prompt));
      return { title: stage.title, points: picks.reduce((sum, pick) => sum + pick.points, 0), max: maxFor(stage.prompts) };
    }),
  };
}

// ---------- learning evidence (what the learner showed they can do; never mixed into the score) ----------

export type Skill = "approve-own" | "never-approve-unexpected" | "report-unexpected" | "resist-pressure" | "number-match";

export type SkillEvidence = Readonly<{ skill: Skill; label: string; shown: number; of: number; level: "shown" | "partial" | "not-yet" | "n/a" }>;

const SKILLS: readonly { skill: Skill; label: string; applies: (p: Prompt) => boolean; shows: (p: Prompt, r: Response) => boolean }[] = [
  { skill: "approve-own", label: "Approves the sign-ins they started", applies: (p) => p.origin === "you", shows: (_p, r) => r === "approve" },
  { skill: "never-approve-unexpected", label: "Never approves a prompt they didn't start", applies: (p) => p.origin === "attacker", shows: (_p, r) => r !== "approve" },
  { skill: "report-unexpected", label: "Reports unexpected prompts", applies: (p) => p.origin === "attacker", shows: (_p, r) => r === "report" },
  { skill: "resist-pressure", label: "Ignores pressure to approve “to make it stop”", applies: (p) => p.clues.includes("pressure"), shows: (p, r) => r === bestResponse(p) },
  { skill: "number-match", label: "Checks the number against their own screen", applies: (p) => p.number !== undefined, shows: (p, r) => r === bestResponse(p) },
];

export type Evidence = Readonly<{
  skills: readonly SkillEvidence[];
  final: Readonly<{ correct: number; of: number }>; // the no-hint scenario, unaided
  unaided: Readonly<{ correct: number; of: number }>; // every decision made without a hint
}>;

function levelOf(shown: number, of: number): SkillEvidence["level"] {
  if (of === 0) return "n/a";
  return shown === of ? "shown" : shown > 0 ? "partial" : "not-yet";
}

export function evidenceOf(state: GameState): Evidence {
  const prompts = allPrompts(state.scenario);
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const decided = state.picks.map((pick) => ({ pick, prompt: byId.get(pick.prompt)! }));
  const finalIds = new Set(state.scenario.stages.filter((stage) => stage.final).flatMap((stage) => stage.prompts.map((p) => p.id)));
  const finalPicks = decided.filter(({ prompt }) => finalIds.has(prompt.id));
  const unaided = decided.filter(({ pick }) => !pick.hinted);
  return {
    skills: SKILLS.map(({ skill, label, applies, shows }) => {
      const relevant = decided.filter(({ prompt }) => applies(prompt));
      const shown = relevant.filter(({ prompt, pick }) => shows(prompt, pick.response)).length;
      return { skill, label, shown, of: relevant.length, level: levelOf(shown, relevant.length) };
    }),
    final: { correct: finalPicks.filter(({ pick }) => pick.correct).length, of: finalPicks.length },
    unaided: { correct: unaided.filter(({ pick }) => pick.correct).length, of: unaided.length },
  };
}
