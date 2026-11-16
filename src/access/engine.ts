// Least Privilege: an access desk. Pure rules; no DOM.
// Each request is a person with a job and a concrete task list. The learner sets every catalogue
// item (a role, or one right on one system) to not granted / time-limited / permanent, then
// commits. The week then plays out: each task works or is blocked, and each grant is checked:
// more than the work needs (excess), temporary work granted forever (linger), standing work that
// expires (renewal), or one-off clutter where a role fits (untidy).
// This is about deciding what to GRANT for a job. Tracing who already reaches what through nested
// groups is a different practice (src/privilege).

export type Level = "read" | "write" | "admin";
export const LEVEL_RANK: Readonly<Record<Level, number>> = { read: 1, write: 2, admin: 3 };
export const LEVEL_LABELS: Readonly<Record<Level, string>> = { read: "View", write: "Change", admin: "Admin" };

export type Cap = Readonly<{ system: string; level: Level }>;

// What can go wrong with access nobody needed.
export type EventKind = "phish" | "mistake" | "leaver";
export const EVENT_LABELS: Readonly<Record<EventKind, string>> = {
  phish: "Phished account",
  mistake: "Honest mistake",
  leaver: "Leaver not offboarded",
};

export type Item = Readonly<{
  id: string;
  kind: "role" | "right";
  name: string;
  caps: readonly Cap[];
  note?: string; // why it is on the table ("what the requester asked for", "what Tom has")
  // The event this grant is tested against when it is more than the work needs, and its blast radius.
  risk: Readonly<{ event: EventKind; text: string }>;
  // The event when temporary work is granted permanently (only for items whose work is temporary).
  linger?: Readonly<{ event: EventKind; text: string }>;
}>;

export type Task = Readonly<{
  id: string;
  text: string;
  needs: Cap;
  // Standing: part of the job from now on. Temporary: ends with a contract, a cover period or an incident.
  duration: "standing" | "temporary";
  blocked: string; // what it costs when the task cannot be done
}>;

export type Grant = "none" | "timed" | "perm";
export const GRANTS: readonly Grant[] = ["none", "timed", "perm"];
export type Selection = Readonly<Record<string, Grant>>;

export type RequestKind = "joiner" | "mover" | "contractor" | "manager" | "breakglass" | "final";

export type Request = Readonly<{
  id: string;
  kind: RequestKind;
  title: string;
  person: string;
  job: string;
  from: string; // who is asking, as an address
  ask: string; // the request, in their words
  context: string; // what you know from the joiner/mover/leaver record
  tasks: readonly Task[];
  catalogue: readonly Item[];
  held: readonly string[]; // items the person already holds (permanent) when the request arrives
  timedLabel: string; // what "time-limited" means here: "6 weeks", "4 hours"
  best: Selection; // the minimal sufficient set; items left out are "none". Verified by the tests.
  lesson: string;
  hint: string;
  guided?: boolean;
  final?: boolean; // no hints
}>;

export type Scenario = Readonly<{ id: string; title: string; org: string; domain: string; requests: readonly Request[] }>;

// ---------- scoring constants ----------

export const REQUEST_POINTS = 20;
export const EXCESS_PENALTY: Readonly<Record<Level, number>> = { read: 3, write: 5, admin: 8 };
export const LINGER_PENALTY = 5; // temporary work, permanent access
export const RENEWAL_PENALTY = 2; // standing work, access that expires
export const UNTIDY_PENALTY = 2; // one-off right where a role fits, a duplicate, or a grant too small to use
export const PASS_RATIO = 0.8;
export const PASS_WORK_RATIO = 0.8;

// ---------- rules ----------

function rank(level: Level): number {
  return LEVEL_RANK[level];
}

// The highest level any task needs on a system (0: no task touches it).
export function needOn(request: Request, system: string): number {
  return request.tasks.reduce((max, task) => (task.needs.system === system ? Math.max(max, rank(task.needs.level)) : max), 0);
}

// The highest level by which an item goes beyond the work, or null when all of it is needed.
export function excessLevel(request: Request, item: Item): Level | null {
  let worst: Level | null = null;
  for (const cap of item.caps) {
    if (rank(cap.level) > needOn(request, cap.system) && (!worst || rank(cap.level) > rank(worst))) worst = cap.level;
  }
  return worst;
}

function covers(item: Item, cap: Cap): boolean {
  return item.caps.some((own) => own.system === cap.system && rank(own.level) >= rank(cap.level));
}

// A role that gives exactly work this job needs: nothing in it is excess.
function fittingRoles(request: Request): Item[] {
  return request.catalogue.filter((item) => item.kind === "role" && !excessLevel(request, item));
}

// How long an item is needed for: permanent if any standing task relies on a system it grants.
export function neededFor(request: Request, item: Item): "standing" | "temporary" {
  const systems = new Set(item.caps.map((cap) => cap.system));
  return request.tasks.some((task) => task.duration === "standing" && systems.has(task.needs.system)) ? "standing" : "temporary";
}

export function startSelection(request: Request): Record<string, Grant> {
  return Object.fromEntries(request.catalogue.map((item) => [item.id, request.held.includes(item.id) ? "perm" : "none"]));
}

export function bestSelection(request: Request): Record<string, Grant> {
  return Object.fromEntries(request.catalogue.map((item) => [item.id, request.best[item.id] ?? "none"]));
}

export type IssueKind = "excess" | "linger" | "renewal" | "untidy";
export type Issue = Readonly<{
  kind: IssueKind;
  penalty: number;
  event?: EventKind; // excess and linger are tested against an event
  level?: Level; // excess: how far beyond the work
  reason?: "one-off" | "duplicate" | "too-little"; // untidy
  text: string;
}>;

export type ItemResult = Readonly<{
  item: string;
  grant: Grant;
  best: Grant;
  held: boolean;
  correct: boolean; // same as the minimal sufficient set
  issues: readonly Issue[];
  penalty: number;
}>;

export type TaskResult = Readonly<{ task: string; works: boolean }>;

export type Evaluation = Readonly<{
  request: string;
  tasks: readonly TaskResult[];
  items: readonly ItemResult[];
  working: number;
  workPoints: number; // REQUEST_POINTS scaled by the share of tasks that work
  penalties: number;
  points: number; // workPoints - penalties, never below 0
  incident: boolean; // an admin right nobody needed was exploited
  perfect: boolean;
}>;

export function evaluate(request: Request, selection: Selection): Evaluation {
  const grantOf = (item: Item): Grant => selection[item.id] ?? "none";
  const granted = request.catalogue.filter((item) => grantOf(item) !== "none");
  const tasks = request.tasks.map((task) => ({ task: task.id, works: granted.some((item) => covers(item, task.needs)) }));
  const working = tasks.filter((task) => task.works).length;
  const clean = granted.filter((item) => !excessLevel(request, item));
  const roles = fittingRoles(request);

  const items = request.catalogue.map((item): ItemResult => {
    const grant = grantOf(item);
    const best = request.best[item.id] ?? "none";
    const held = request.held.includes(item.id);
    const issues: Issue[] = [];
    if (grant !== "none") {
      const excess = excessLevel(request, item);
      if (excess) {
        issues.push({ kind: "excess", penalty: EXCESS_PENALTY[excess], event: item.risk.event, level: excess, text: item.risk.text });
      } else {
        const useful = request.tasks.some((task) => covers(item, task.needs));
        const duplicate = clean.some((other) => other.id !== item.id && item.caps.every((cap) => covers(other, cap)));
        const oneOff = item.kind === "right" && roles.some((role) => item.caps.every((cap) => covers(role, cap)));
        if (!useful) {
          issues.push({ kind: "untidy", penalty: UNTIDY_PENALTY, reason: "too-little", text: "Granted, but too little for the task it was meant for. It does nothing except sit in the next access review." });
        } else if (duplicate) {
          issues.push({ kind: "untidy", penalty: UNTIDY_PENALTY, reason: "duplicate", text: "A duplicate: another grant already covers this. Duplicates outlive the grant that mattered, because nobody knows which one to remove." });
        } else if (oneOff) {
          issues.push({ kind: "untidy", penalty: UNTIDY_PENALTY, reason: "one-off", text: "A one-off right where a role fits. It works today, but when the job changes the role is removed and this is forgotten." });
        }
        const need = neededFor(request, item);
        if (need === "temporary" && grant === "perm") {
          const linger = item.linger ?? { event: "leaver" as const, text: "The work ended. The access did not, and nobody is watching it." };
          issues.push({ kind: "linger", penalty: LINGER_PENALTY, event: linger.event, text: linger.text });
        } else if (need === "standing" && grant === "timed") {
          issues.push({ kind: "renewal", penalty: RENEWAL_PENALTY, text: `This is part of the job from now on, but the access expires after ${request.timedLabel}. The work stops again and the request comes back to you.` });
        }
      }
    }
    return { item: item.id, grant, best, held, correct: grant === best, issues, penalty: issues.reduce((sum, issue) => sum + issue.penalty, 0) };
  });

  const workPoints = Math.round((REQUEST_POINTS * working) / request.tasks.length);
  const penalties = items.reduce((sum, item) => sum + item.penalty, 0);
  return {
    request: request.id,
    tasks,
    items,
    working,
    workPoints,
    penalties,
    points: Math.max(0, workPoints - penalties),
    incident: items.some((item) => item.issues.some((issue) => issue.kind === "excess" && issue.level === "admin")),
    perfect: working === request.tasks.length && penalties === 0,
  };
}

// ---------- game state ----------

export type Decision = Readonly<{ request: string; selection: Selection; hinted: boolean; result: Evaluation }>;

export type GameState = {
  scenario: Scenario;
  index: number;
  selection: Record<string, Grant>;
  decisions: Decision[];
  hinted: boolean;
  phase: "play" | "answered" | "done";
};

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, selection: startSelection(scenario.requests[0]), decisions: [], hinted: false, phase: "play" };
}

export function currentRequest(state: GameState): Request {
  return state.scenario.requests[state.index];
}

export function hintsAllowed(state: GameState): boolean {
  return !currentRequest(state).final;
}

export function setGrant(state: GameState, itemId: string, grant: Grant): boolean {
  if (state.phase !== "play" || !GRANTS.includes(grant) || !(itemId in state.selection)) return false;
  state.selection[itemId] = grant;
  return true;
}

// Not granted -> time-limited -> permanent -> not granted (the number-key shortcut).
export function cycleGrant(state: GameState, itemId: string): Grant | null {
  if (state.phase !== "play" || !(itemId in state.selection)) return null;
  const nextGrant = GRANTS[(GRANTS.indexOf(state.selection[itemId]) + 1) % GRANTS.length];
  state.selection[itemId] = nextGrant;
  return nextGrant;
}

export function takeHint(state: GameState): string | null {
  if (state.phase !== "play" || !hintsAllowed(state)) return null;
  state.hinted = true;
  return currentRequest(state).hint;
}

export function commit(state: GameState): Decision | null {
  if (state.phase !== "play") return null;
  const request = currentRequest(state);
  const selection = { ...state.selection };
  const decision: Decision = { request: request.id, selection, hinted: state.hinted, result: evaluate(request, selection) };
  state.decisions.push(decision);
  state.phase = "answered";
  return decision;
}

export function next(state: GameState): void {
  if (state.phase !== "answered") return;
  state.hinted = false;
  if (state.index + 1 >= state.scenario.requests.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.selection = startSelection(currentRequest(state));
  state.phase = "play";
}

// ---------- score (what the learner earned) ----------

export type Summary = Readonly<{
  total: number;
  max: number;
  passed: boolean; // no incident, PASS_RATIO of the points, PASS_WORK_RATIO of the tasks working
  incidents: number; // requests where an unneeded admin right was exploited
  tasksWorking: number;
  tasksTotal: number;
  excess: number; // grants beyond the work
  lingering: number; // temporary work granted permanently
  untidy: number;
  renewals: number;
  perfect: number; // requests answered with the minimal sufficient set
  hints: number;
  byRequest: readonly { id: string; title: string; points: number; max: number }[];
}>;

export function summarize(state: GameState): Summary {
  const requests = state.scenario.requests;
  const results = state.decisions.map((decision) => decision.result);
  const count = (kind: IssueKind): number => results.reduce((sum, result) => sum + result.items.reduce((inner, item) => inner + item.issues.filter((issue) => issue.kind === kind).length, 0), 0);
  const total = results.reduce((sum, result) => sum + result.points, 0);
  const max = requests.length * REQUEST_POINTS;
  const incidents = results.filter((result) => result.incident).length;
  const tasksWorking = results.reduce((sum, result) => sum + result.working, 0);
  const tasksTotal = requests.reduce((sum, request) => sum + request.tasks.length, 0);
  return {
    total,
    max,
    passed: incidents === 0 && total >= max * PASS_RATIO && tasksWorking >= tasksTotal * PASS_WORK_RATIO,
    incidents,
    tasksWorking,
    tasksTotal,
    excess: count("excess"),
    lingering: count("linger"),
    untidy: count("untidy"),
    renewals: count("renewal"),
    perfect: results.filter((result) => result.perfect).length,
    hints: state.decisions.filter((decision) => decision.hinted).length,
    byRequest: requests.map((request) => ({
      id: request.id,
      title: request.title,
      points: results.find((result) => result.request === request.id)?.points ?? 0,
      max: REQUEST_POINTS,
    })),
  };
}

// ---------- learning evidence (what the learner showed they can do; never mixed into the score) ----------

export type Skill = "enough" | "no-more" | "role" | "time-limit" | "remove";

export type SkillEvidence = Readonly<{ skill: Skill; label: string; shown: number; of: number; level: "shown" | "partial" | "not-yet" | "n/a" }>;

const granted = (result: Evaluation, id: string): Grant => result.items.find((item) => item.item === id)!.grant;

const SKILLS: readonly { skill: Skill; label: string; applies: (r: Request) => boolean; shows: (r: Request, e: Evaluation) => boolean }[] = [
  { skill: "enough", label: "Grants enough for every task to work", applies: () => true, shows: (_r, e) => e.working === e.tasks.length },
  { skill: "no-more", label: "Grants nothing beyond what the tasks need", applies: () => true, shows: (_r, e) => !e.items.some((item) => item.issues.some((issue) => issue.kind === "excess" && !item.held)) },
  {
    skill: "role",
    label: "Uses the fitting role instead of one-off rights",
    applies: (r) => r.catalogue.some((item) => item.kind === "role" && !r.held.includes(item.id) && (r.best[item.id] ?? "none") !== "none"),
    shows: (r, e) =>
      r.catalogue.filter((item) => item.kind === "role" && !r.held.includes(item.id) && (r.best[item.id] ?? "none") !== "none").every((item) => granted(e, item.id) !== "none") &&
      !e.items.some((item) => item.issues.some((issue) => issue.reason === "one-off" || issue.reason === "duplicate")),
  },
  {
    skill: "time-limit",
    label: "Time-limits access for temporary work",
    applies: (r) => Object.values(r.best).includes("timed"),
    shows: (r, e) => Object.entries(r.best).every(([id, grant]) => grant !== "timed" || granted(e, id) === "timed"),
  },
  {
    skill: "remove",
    label: "Removes old access when the role changes",
    applies: (r) => r.held.some((id) => (r.best[id] ?? "none") === "none"),
    shows: (r, e) => r.held.every((id) => (r.best[id] ?? "none") !== "none" || granted(e, id) === "none"),
  },
];

export type Evidence = Readonly<{
  skills: readonly SkillEvidence[];
  final: Readonly<{ correct: number; of: number }>; // the no-hint request: minimal sufficient set, unaided
  unaided: Readonly<{ correct: number; of: number }>; // requests decided without a hint
}>;

function levelOf(shown: number, of: number): SkillEvidence["level"] {
  if (of === 0) return "n/a";
  return shown === of ? "shown" : shown > 0 ? "partial" : "not-yet";
}

export function evidenceOf(state: GameState): Evidence {
  const byId = new Map(state.scenario.requests.map((request) => [request.id, request]));
  const decided = state.decisions.map((decision) => ({ decision, request: byId.get(decision.request)! }));
  const finals = decided.filter(({ request }) => request.final);
  const unaided = decided.filter(({ decision }) => !decision.hinted);
  return {
    skills: SKILLS.map(({ skill, label, applies, shows }) => {
      const relevant = decided.filter(({ request }) => applies(request));
      const shown = relevant.filter(({ request, decision }) => shows(request, decision.result)).length;
      return { skill, label, shown, of: relevant.length, level: levelOf(shown, relevant.length) };
    }),
    final: { correct: finals.filter(({ decision }) => decision.result.perfect).length, of: finals.length },
    unaided: { correct: unaided.filter(({ decision }) => decision.result.perfect).length, of: unaided.length },
  };
}
