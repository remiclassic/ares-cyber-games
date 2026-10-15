import type { CaseDef, Knowledge, Status } from "./types";

// The deduction model. A read sensor says exactly how many of the hosts it covers show the
// indicator. A triaged host's status is known. A host is "known" when every arrangement of
// compromised hosts that fits all of that evidence agrees on it. Boards are small (under 16
// hosts), so every arrangement is checked.

export type Evidence = Readonly<{
  reads: ReadonlySet<string>;
  triages: ReadonlySet<string>;
}>;

export function truthOf(def: CaseDef, variant: number): Set<string> {
  return new Set(def.variants[variant].compromised);
}

export function sensorCount(def: CaseDef, sensorId: string, truth: ReadonlySet<string>): number {
  const sensor = def.sensors.find((entry) => entry.id === sensorId);
  if (!sensor) throw new Error(`Unknown sensor ${sensorId}`);
  return sensor.covers.filter((host) => truth.has(host)).length;
}

// Every set of compromised hosts that agrees with the evidence, as bitmasks over def.hosts.
export function consistent(def: CaseDef, truth: ReadonlySet<string>, evidence: Evidence): number[] {
  const ids = def.hosts.map((host) => host.id);
  const bit = new Map(ids.map((id, index) => [id, 1 << index]));
  let fixedOn = 0;
  let fixedOff = 0;
  for (const id of evidence.triages) {
    if (truth.has(id)) fixedOn |= bit.get(id)!;
    else fixedOff |= bit.get(id)!;
  }
  const checks = [...evidence.reads].map((sensorId) => {
    const sensor = def.sensors.find((entry) => entry.id === sensorId)!;
    const mask = sensor.covers.reduce((sum, id) => sum | bit.get(id)!, 0);
    return { mask, count: sensorCount(def, sensorId, truth) };
  });
  const out: number[] = [];
  const total = 1 << ids.length;
  for (let set = 0; set < total; set += 1) {
    if ((set & fixedOn) !== fixedOn || (set & fixedOff) !== 0) continue;
    if (checks.every((check) => popcount(set & check.mask) === check.count)) out.push(set);
  }
  return out;
}

export function knowledge(def: CaseDef, truth: ReadonlySet<string>, evidence: Evidence): Map<string, Knowledge> {
  const sets = consistent(def, truth, evidence);
  const out = new Map<string, Knowledge>();
  def.hosts.forEach((host, index) => {
    const bit = 1 << index;
    const on = sets.filter((set) => set & bit).length;
    out.set(host.id, on === sets.length ? "compromised" : on === 0 ? "clean" : "unknown");
  });
  return out;
}

export type Deduction = Readonly<{ host: string; status: Status; reason: string; order: number }>;

// Human-readable reasons, found the way an analyst would reason: triage results first, then
// one sensor at a time, then pairs of sensors. Anything the full check proves that these steps
// do not is reported as following from all the sensors together.
export function deduce(def: CaseDef, truth: ReadonlySet<string>, evidence: Evidence): Map<string, Deduction> {
  const out = new Map<string, Deduction>();
  const label = (id: string) => def.hosts.find((host) => host.id === id)!.label;
  const list = (ids: readonly string[]) => joinNames(ids.map(label));
  let order = 0;
  const set = (host: string, status: Status, reason: string) => {
    if (!out.has(host)) out.set(host, { host, status, reason, order: order++ });
  };
  for (const id of evidence.triages) {
    set(id, truth.has(id) ? "compromised" : "clean", `Host triage ${truth.has(id) ? "found the indicator" : "found no sign of the indicator"} on ${label(id)}.`);
  }
  const reads = def.sensors.filter((sensor) => evidence.reads.has(sensor.id));
  const open = (covers: readonly string[]) => covers.filter((id) => !out.has(id));
  const found = (covers: readonly string[]) => covers.filter((id) => out.get(id)?.status === "compromised");
  let changed = true;
  while (changed) {
    changed = false;
    for (const sensor of reads) {
      const count = sensorCount(def, sensor.id, truth);
      const unknown = open(sensor.covers);
      if (unknown.length === 0) continue;
      const already = found(sensor.covers);
      const need = count - already.length;
      if (need === 0) {
        const because =
          count === 0
            ? `${sensor.label} counted 0 hosts, so nothing behind it shows the indicator.`
            : `${sensor.label} counted ${count}, and ${list(already)} already ${already.length === 1 ? "accounts" : "account"} for ${count === 1 ? "it" : "all of them"}.`;
        unknown.forEach((id) => set(id, "clean", because));
        changed = true;
      } else if (need === unknown.length) {
        const because =
          already.length === 0
            ? `${sensor.label} counted ${count}, and exactly ${count} ${count === 1 ? "host sits" : "hosts sit"} behind it that ${count === 1 ? "is" : "are"} not yet cleared.`
            : `${sensor.label} counted ${count}. ${list(already)} ${already.length === 1 ? "is" : "are"} one; the only ${need === 1 ? "host" : "hosts"} left open behind it must be the rest.`;
        unknown.forEach((id) => set(id, "compromised", because));
        changed = true;
      }
    }
    if (changed) continue;
    // Pairs: when one sensor's open hosts all sit behind another sensor too, the difference in
    // what each still needs falls on the hosts only the larger one covers.
    for (const small of reads) {
      for (const big of reads) {
        if (small === big) continue;
        const openSmall = open(small.covers);
        const openBig = open(big.covers);
        if (openSmall.length === 0 || openSmall.length >= openBig.length) continue;
        if (!openSmall.every((id) => openBig.includes(id))) continue;
        const needSmall = sensorCount(def, small.id, truth) - found(small.covers).length;
        const needBig = sensorCount(def, big.id, truth) - found(big.covers).length;
        const rest = openBig.filter((id) => !openSmall.includes(id));
        const left = needBig - needSmall;
        if (left === 0) {
          rest.forEach((id) =>
            set(id, "clean", `${small.label} and ${big.label} together: every open host behind ${small.label} also sits behind ${big.label}, and they account for all of ${big.label}'s remaining count.`),
          );
          changed = true;
        } else if (left === rest.length) {
          rest.forEach((id) =>
            set(id, "compromised", `${small.label} and ${big.label} together: ${big.label} still needs ${needBig}, and at most ${needSmall} can come from hosts ${small.label} also covers.`),
          );
          changed = true;
        }
        if (changed) break;
      }
      if (changed) break;
    }
  }
  const full = knowledge(def, truth, evidence);
  for (const [id, known] of full) {
    if (known !== "unknown" && !out.has(id)) set(id, known, "Only one arrangement of compromised hosts fits every sensor you read.");
  }
  return out;
}

// The fewest host triages that, with every sensor read, settle every host. Used to grade
// efficiency and checked by the tests so every case can be solved within its budget.
export function triagesNeeded(def: CaseDef, truth: ReadonlySet<string>, limit = 6): { count: number; hosts: string[] } {
  const reads = new Set(def.sensors.map((sensor) => sensor.id));
  const ids = def.hosts.map((host) => host.id);
  for (let size = 0; size <= limit; size += 1) {
    for (const combo of combinations(ids, size)) {
      const map = knowledge(def, truth, { reads, triages: new Set(combo) });
      if ([...map.values()].every((value) => value !== "unknown")) return { count: size, hosts: combo };
    }
  }
  return { count: Infinity, hosts: [] };
}

function* combinations<T>(items: readonly T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield [...prefix];
    return;
  }
  for (let index = start; index < items.length; index += 1) {
    prefix.push(items[index]);
    yield* combinations(items, size, index + 1, prefix);
    prefix.pop();
  }
}

function popcount(value: number): number {
  let count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
