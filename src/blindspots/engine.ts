// Blind Spots rules. Pure: no DOM. Each path scores on how early it is first detected (70) and
// whether at least two sensors see it, so one missed alert doesn't blind you (30).
import { BUDGET, PATHS, SENSORS, type Path } from "./data";

export function cost(sensors: readonly string[]): number {
  return sensors.reduce((sum, id) => sum + SENSORS.find((s) => s.id === id)!.cost, 0);
}

export function seenBy(stepId: string, sensors: readonly string[]): string[] {
  return SENSORS.filter((s) => sensors.includes(s.id) && s.sees.includes(stepId)).map((s) => s.id);
}

export type PathResult = { path: string; first: number | null; detections: number; early: number; depth: number; total: number };

export function runPath(path: Path, sensors: readonly string[]): PathResult {
  const hits = path.steps.map((step) => seenBy(step.id, sensors).length > 0);
  const firstIndex = hits.indexOf(true);
  const first = firstIndex < 0 ? null : firstIndex;
  const detections = hits.filter(Boolean).length;
  // Seen at step 1 = 70, falling to 10 at the last step; never seen = 0.
  const early = first === null ? 0 : Math.round(70 - (60 * first) / Math.max(1, path.steps.length - 1));
  const depth = detections >= 2 ? 30 : 0;
  return { path: path.id, first, detections, early, depth, total: early + depth };
}

export function evaluate(sensors: readonly string[]): { paths: PathResult[]; total: number } {
  const paths = PATHS.map((path) => runPath(path, sensors));
  return { paths, total: Math.round(paths.reduce((s, p) => s + p.total, 0) / paths.length) };
}

// The best plan within budget, by checking every combination (2^9 = 512).
export function bestPlan(): { sensors: string[]; total: number } {
  let best = { sensors: [] as string[], total: -1 };
  const ids = SENSORS.map((s) => s.id);
  for (let mask = 0; mask < 1 << ids.length; mask += 1) {
    const pick = ids.filter((_, i) => mask & (1 << i));
    if (cost(pick) > BUDGET) continue;
    const total = evaluate(pick).total;
    if (total > best.total || (total === best.total && cost(pick) < cost(best.sensors))) best = { sensors: pick, total };
  }
  return best;
}
