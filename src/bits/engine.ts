// Bit by Bit: binary, masks and subnets, one octet at a time. Pure rules; no DOM.
// Every task is answered by switching eight bit gears (128 … 1) on or off, the way Bolt Buddies
// drops 1-, 2- and 5-dot gears until the dots match. Only the last octet changes in every task.

export const BITS = [128, 64, 32, 16, 8, 4, 2, 1] as const;

export type Task =
  | Readonly<{ kind: "value"; id: string; prompt: string; target: number }>
  | Readonly<{ kind: "mask"; id: string; prompt: string; prefix: number }>
  | Readonly<{ kind: "size"; id: string; prompt: string; need: number; label: string }>
  | Readonly<{ kind: "network"; id: string; prompt: string; host: number; prefix: number }>;

export type Stage = Readonly<{ id: string; title: string; lesson: string; tasks: readonly Task[] }>;

export type Scenario = Readonly<{ id: string; title: string; org: string; base: string; stages: readonly Stage[] }>;

export type Check = Readonly<{ ok: boolean; message: string }>;

export type TaskRecord = {
  task: string;
  attempts: number;
  hints: number;
  revealed: boolean;
  solved: boolean;
  points: number;
  wrong: string[]; // feedback messages for wrong checks, kept for the debrief
};

export type GameState = {
  scenario: Scenario;
  index: number; // flat task index
  bits: number; // current value of the eight gears
  records: TaskRecord[];
  phase: "play" | "solved" | "done";
};

export const POINTS = [10, 6, 3] as const; // right on the first, second, later check

export function allTasks(scenario: Scenario): Task[] {
  return scenario.stages.flatMap((stage) => stage.tasks);
}

export function stageOf(scenario: Scenario, taskId: string): Stage {
  return scenario.stages.find((stage) => stage.tasks.some((task) => task.id === taskId))!;
}

export function maskOctet(prefix: number): number {
  const bits = Math.max(0, Math.min(8, prefix - 24));
  return (0xff << (8 - bits)) & 0xff;
}

export function usable(prefix: number): number {
  const hostBits = 32 - prefix;
  return hostBits >= 2 ? 2 ** hostBits - 2 : 0;
}

// Smallest subnet (largest prefix) whose usable hosts cover the need, within the last octet.
export function fitPrefix(need: number): number {
  for (let prefix = 30; prefix >= 24; prefix -= 1) if (usable(prefix) >= need) return prefix;
  return 24;
}

export function prefixOf(octet: number): number | null {
  // A valid mask octet is ones from the left, then zeros.
  for (let ones = 0; ones <= 8; ones += 1) if (maskOctet(24 + ones) === octet) return 24 + ones;
  return null;
}

export function answer(task: Task): number {
  switch (task.kind) {
    case "value":
      return task.target;
    case "mask":
      return maskOctet(task.prefix);
    case "size":
      return maskOctet(fitPrefix(task.need));
    case "network":
      return task.host & maskOctet(task.prefix);
  }
}

export function toBinary(value: number): string {
  return value.toString(2).padStart(8, "0");
}

export function check(task: Task, value: number): Check {
  const want = answer(task);
  if (value === want) {
    switch (task.kind) {
      case "value":
        return { ok: true, message: `${BITS.filter((bit) => value & bit).join(" + ")} = ${value}.` };
      case "mask":
        return { ok: true, message: `/${task.prefix} = 255.255.255.${value}: ${task.prefix - 24} network bits in the last octet, ${32 - task.prefix} host bits, ${usable(task.prefix)} usable hosts.` };
      case "size": {
        const prefix = fitPrefix(task.need);
        return { ok: true, message: `/${prefix} gives ${usable(prefix)} usable hosts, enough for ${task.need}. The next size down (/${prefix + 1}) gives only ${usable(prefix + 1)}.` };
      }
      case "network":
        return { ok: true, message: `${task.host} AND ${maskOctet(task.prefix)} = ${value}. The network is .${value}/${task.prefix}; hosts run from .${value + 1} to .${value + 2 ** (32 - task.prefix) - 2}.` };
    }
  }
  switch (task.kind) {
    case "value": {
      const diff = value - want;
      return { ok: false, message: `You built ${value}. That is ${Math.abs(diff)} too ${diff > 0 ? "many" : "few"}. Add gears from the biggest down: take each one that still fits.` };
    }
    case "mask": {
      const prefix = prefixOf(value);
      if (prefix === null) return { ok: false, message: `${toBinary(value)} is not a valid mask: mask bits are all the ones on the left, then all zeros. No gaps.` };
      return { ok: false, message: `That is /${prefix}. You need /${task.prefix}: ${task.prefix - 24} ones in the last octet (the first 24 are in the 255s).` };
    }
    case "size": {
      const prefix = prefixOf(value);
      if (prefix === null) return { ok: false, message: `${toBinary(value)} is not a valid mask: ones on the left, then zeros.` };
      if (usable(prefix) < task.need) return { ok: false, message: `/${prefix} gives only ${usable(prefix)} usable hosts; you need ${task.need}. Free up more host bits (turn ones off from the right).` };
      return { ok: false, message: `/${prefix} fits (${usable(prefix)} usable) but wastes addresses. A smaller subnet still fits ${task.need}: add a network bit.` };
    }
    case "network":
      return { ok: false, message: `The network address is the host AND the mask: keep a bit only where both the address and the mask have a 1. ${toBinary(task.host)} AND ${toBinary(maskOctet(task.prefix))}.` };
  }
}

export function hint(task: Task): string {
  switch (task.kind) {
    case "value":
      return `Start with 128. Does it fit in ${task.target}? If so, turn it on and subtract; then try 64, and so on.`;
    case "mask":
      return `/${task.prefix} means ${task.prefix} ones in total. The first three octets already hold 24, so the last octet needs ${task.prefix - 24}, from the left.`;
    case "size":
      return `Usable hosts = 2^(host bits) − 2 (network and broadcast addresses are reserved). Find the fewest host bits that cover ${task.need}.`;
    case "network":
      return `Line the address up over the mask. Where the mask is 1, copy the address bit; where it is 0, the result is 0.`;
  }
}

export function createGame(scenario: Scenario): GameState {
  return { scenario, index: 0, bits: 0, records: allTasks(scenario).map((task) => ({ task: task.id, attempts: 0, hints: 0, revealed: false, solved: false, points: 0, wrong: [] })), phase: "play" };
}

export function currentTask(state: GameState): Task {
  return allTasks(state.scenario)[state.index];
}

export function toggle(state: GameState, bit: number): void {
  if (state.phase !== "play" || !BITS.includes(bit as (typeof BITS)[number])) return;
  state.bits ^= bit;
}

export function submit(state: GameState): Check {
  const task = currentTask(state);
  const record = state.records[state.index];
  if (state.phase !== "play") return { ok: false, message: "Move on to the next task." };
  record.attempts += 1;
  const result = check(task, state.bits);
  if (result.ok) {
    record.solved = true;
    record.points = POINTS[Math.min(record.attempts, POINTS.length) - 1];
    state.phase = "solved";
  } else {
    record.wrong.push(result.message);
  }
  return result;
}

export function takeHint(state: GameState): string {
  state.records[state.index].hints += 1;
  return hint(currentTask(state));
}

export function reveal(state: GameState): Check {
  const task = currentTask(state);
  const record = state.records[state.index];
  record.revealed = true;
  record.points = 0;
  state.bits = answer(task);
  state.phase = "solved";
  const explained = check(task, state.bits);
  return { ok: true, message: `Shown: ${explained.message}` };
}

export function next(state: GameState): void {
  if (state.phase !== "solved") return;
  if (state.index + 1 >= state.records.length) {
    state.phase = "done";
    return;
  }
  state.index += 1;
  state.bits = 0;
  state.phase = "play";
}

export type Summary = Readonly<{ total: number; firstTry: number; revealed: number; hints: number; byStage: readonly { title: string; points: number; max: number }[] }>;

export function summarize(state: GameState): Summary {
  const records = state.records;
  return {
    total: records.reduce((sum, record) => sum + record.points, 0),
    firstTry: records.filter((record) => record.solved && record.attempts === 1 && !record.revealed).length,
    revealed: records.filter((record) => record.revealed).length,
    hints: records.reduce((sum, record) => sum + record.hints, 0),
    byStage: state.scenario.stages.map((stage) => {
      const own = records.filter((record) => stage.tasks.some((task) => task.id === record.task));
      return { title: stage.title, points: own.reduce((sum, record) => sum + record.points, 0), max: own.length * POINTS[0] };
    }),
  };
}
