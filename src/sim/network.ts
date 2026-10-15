import { NODE_BY_ID } from "../data/scenario";
import type { Link, NodeId } from "./types";

export function linkId(a: NodeId, b: NodeId): string {
  return `${a}-${b}`;
}

function neighbours(links: readonly Link[], node: NodeId, allowed?: (id: NodeId) => boolean): NodeId[] {
  const result: NodeId[] = [];
  for (const link of links) {
    if (link.status !== "up") continue;
    const other = link.a === node ? link.b : link.b === node ? link.a : null;
    if (other && (!allowed || allowed(other))) result.push(other);
  }
  return result;
}

// Breadth-first shortest path over working links. Ties resolve by link order,
// so the result is deterministic.
export function findPath(
  links: readonly Link[],
  from: NodeId,
  to: NodeId,
  allowed?: (id: NodeId) => boolean,
): NodeId[] | null {
  if (from === to) return [from];
  const previous = new Map<NodeId, NodeId>();
  const queue: NodeId[] = [from];
  const seen = new Set<NodeId>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbours(links, current, allowed)) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, current);
      if (next === to) {
        const path: NodeId[] = [to];
        let step = to;
        while (previous.has(step)) {
          step = previous.get(step)!;
          path.unshift(step);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// A service works only if its dependencies are reachable over internal links.
// Going back out through the gateway does not count.
export function missingDependency(links: readonly Link[], node: NodeId): NodeId | null {
  for (const dependency of NODE_BY_ID[node].dependsOn ?? []) {
    const path = findPath(links, node, dependency, (id) => NODE_BY_ID[id].zone === "internal");
    if (!path) return dependency;
  }
  return null;
}

export function linkBetween(links: readonly Link[], a: NodeId, b: NodeId): Link | undefined {
  return links.find((link) => (link.a === a && link.b === b) || (link.a === b && link.b === a));
}
