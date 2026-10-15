// Rule Order: fix a firewall rule list so every test packet gets the intended verdict.
// Pure rules; no DOM. First match wins; if nothing matches, the puzzle's default applies.

export type Action = "allow" | "deny";

export type Host = Readonly<{ id: string; label: string; ip: string; groups: readonly string[] }>;

export type Rule = Readonly<{
  id: string;
  action: Action;
  src: string; // "any" or CIDR
  srcLabel: string;
  dst: string; // "any" or a group name
  port: number | "any";
  note: string;
}>;

export type Packet = Readonly<{ id: string; label: string; src: string; dst: string; port: number; intent: Action; why: string }>;

export type Puzzle = Readonly<{
  id: string;
  title: string;
  brief: string;
  lesson: string;
  defaultAction: Action;
  rules: readonly Rule[]; // in their starting order
  packets: readonly Packet[];
}>;

export type Scenario = Readonly<{ id: string; title: string; org: string; hosts: readonly Host[]; puzzles: readonly Puzzle[] }>;

export type Config = Readonly<{ order: readonly string[]; disabled: readonly string[] }>;

export type Verdict = Readonly<{ packet: string; rule: string | null; action: Action; ok: boolean }>;

export function ipToInt(ip: string): number {
  return ip.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
}

export function inCidr(ip: string, cidr: string): boolean {
  if (cidr === "any") return true;
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText ?? 32);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(base) & mask) >>> 0);
}

export function host(scenario: Scenario, id: string): Host {
  const found = scenario.hosts.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown host ${id}`);
  return found;
}

export function matches(scenario: Scenario, rule: Rule, packet: Packet): boolean {
  const target = host(scenario, packet.dst);
  return inCidr(packet.src, rule.src) && (rule.dst === "any" || target.groups.includes(rule.dst)) && (rule.port === "any" || rule.port === packet.port);
}

export function evaluate(scenario: Scenario, puzzle: Puzzle, config: Config): Verdict[] {
  const rules = config.order.map((id) => puzzle.rules.find((rule) => rule.id === id)!).filter((rule) => !config.disabled.includes(rule.id));
  return puzzle.packets.map((packet) => {
    const rule = rules.find((entry) => matches(scenario, entry, packet)) ?? null;
    const action = rule ? rule.action : puzzle.defaultAction;
    return { packet: packet.id, rule: rule?.id ?? null, action, ok: action === packet.intent };
  });
}

export function initialConfig(puzzle: Puzzle): Config {
  return { order: puzzle.rules.map((rule) => rule.id), disabled: [] };
}

const key = (config: Config) => `${config.order.join(",")}|${[...config.disabled].sort().join(",")}`;

function neighbours(config: Config): Config[] {
  const out: Config[] = [];
  for (let index = 0; index + 1 < config.order.length; index += 1) {
    const order = [...config.order];
    [order[index], order[index + 1]] = [order[index + 1], order[index]];
    out.push({ order, disabled: config.disabled });
  }
  for (const id of config.order) {
    out.push({ order: config.order, disabled: config.disabled.includes(id) ? config.disabled.filter((entry) => entry !== id) : [...config.disabled, id] });
  }
  return out;
}

// Edit distance between two configurations, counting one per adjacent move or switch.
export function distance(from: Config, to: Config): number {
  const goal = key(to);
  let frontier = [from];
  const seen = new Set([key(from)]);
  for (let depth = 0; frontier.length; depth += 1) {
    if (frontier.some((config) => key(config) === goal)) return depth;
    const nextFrontier: Config[] = [];
    for (const config of frontier) {
      for (const next of neighbours(config)) {
        const k = key(next);
        if (!seen.has(k)) {
          seen.add(k);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
  }
  return Infinity;
}

// Fewest changes that make every packet right.
export function minimalFix(scenario: Scenario, puzzle: Puzzle): { changes: number; config: Config } {
  let frontier = [initialConfig(puzzle)];
  const seen = new Set([key(frontier[0])]);
  for (let depth = 0; frontier.length && depth < 12; depth += 1) {
    const solved = frontier.find((config) => evaluate(scenario, puzzle, config).every((verdict) => verdict.ok));
    if (solved) return { changes: depth, config: solved };
    const nextFrontier: Config[] = [];
    for (const config of frontier) {
      for (const next of neighbours(config)) {
        const k = key(next);
        if (!seen.has(k)) {
          seen.add(k);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
  }
  return { changes: Infinity, config: initialConfig(puzzle) };
}

export type PuzzleScore = Readonly<{ correct: number; tidy: number; total: number; right: number; packets: number; changes: number; minimal: number }>;

export const WEIGHTS = { correct: 70, tidy: 30 } as const;

export function scorePuzzle(scenario: Scenario, puzzle: Puzzle, config: Config): PuzzleScore {
  const verdicts = evaluate(scenario, puzzle, config);
  const right = verdicts.filter((verdict) => verdict.ok).length;
  const minimal = minimalFix(scenario, puzzle).changes;
  const changes = distance(initialConfig(puzzle), config);
  const allRight = right === verdicts.length;
  const correct = Math.round((WEIGHTS.correct * right) / verdicts.length);
  // Tidiness only counts once the rule set is right: an untouched broken list is not "tidy".
  const tidy = allRight ? Math.round(WEIGHTS.tidy * Math.min(1, minimal / Math.max(changes, 1))) : 0;
  return { correct, tidy, total: correct + tidy, right, packets: verdicts.length, changes, minimal };
}

// ---------- game state ----------

export type PuzzleRecord = { puzzle: string; config: Config; score: PuzzleScore; traces: number; runs: number };

export type GameState = {
  scenario: Scenario;
  index: number;
  config: Config;
  traces: number;
  runs: number;
  phase: "play" | "committed" | "done";
  records: PuzzleRecord[];
};

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, config: initialConfig(scenario.puzzles[0]), traces: 0, runs: 0, phase: "play", records: [] };
}

export function currentPuzzle(state: GameState): Puzzle {
  return state.scenario.puzzles[state.index];
}

export function move(state: GameState, id: string, delta: -1 | 1): boolean {
  if (state.phase !== "play") return false;
  const order = [...state.config.order];
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return false;
  [order[from], order[to]] = [order[to], order[from]];
  state.config = { ...state.config, order };
  return true;
}

export function toggleRule(state: GameState, id: string): void {
  if (state.phase !== "play") return;
  const disabled = state.config.disabled.includes(id) ? state.config.disabled.filter((entry) => entry !== id) : [...state.config.disabled, id];
  state.config = { ...state.config, disabled };
}

export function reset(state: GameState): void {
  if (state.phase === "play") state.config = initialConfig(currentPuzzle(state));
}

export function commit(state: GameState): PuzzleScore {
  const puzzle = currentPuzzle(state);
  const score = scorePuzzle(state.scenario, puzzle, state.config);
  state.records.push({ puzzle: puzzle.id, config: state.config, score, traces: state.traces, runs: state.runs });
  state.phase = "committed";
  return score;
}

export function nextPuzzle(state: GameState): void {
  if (state.phase !== "committed") return;
  if (state.index + 1 >= state.scenario.puzzles.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.config = initialConfig(currentPuzzle(state));
  state.traces = 0;
  state.runs = 0;
  state.phase = "play";
}

export function summarize(state: GameState): { total: number; correct: number; tidy: number; solved: number; puzzles: number } {
  const n = state.records.length || 1;
  return {
    total: Math.round(state.records.reduce((sum, record) => sum + record.score.total, 0) / n),
    correct: Math.round(state.records.reduce((sum, record) => sum + record.score.correct, 0) / n),
    tidy: Math.round(state.records.reduce((sum, record) => sum + record.score.tidy, 0) / n),
    solved: state.records.filter((record) => record.score.right === record.score.packets).length,
    puzzles: state.records.length,
  };
}
