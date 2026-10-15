import type { AccessResult, Action, Change, Changes, Check, Puzzle, PuzzleEdge, PuzzleNode, VerifyReport, ViewEdge } from "./types";

// The permission model, in full:
//   1. A user acts as themselves plus every group they belong to, including
//      groups reached through nested membership.
//   2. A grant gives one principal specific actions on one resource.
//   3. A grant on a folder also applies to everything the folder contains.
//   4. An action is allowed only if some grant reached through 1-3 covers it.
//      There is no other way in: "info" edges and plain graph connectivity
//      never authorize anything.

export const ACTION_LABEL: Record<Action, string> = { read: "Read", write: "Write" };

function sameActions(a: readonly Action[] = [], b: readonly Action[] = []): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// Returns the change set with `edgeId` set to `change` (null reverts it).
// A change that leaves the edge as it started is dropped, so it costs nothing.
export function setChange(edges: readonly PuzzleEdge[], changes: Changes, edgeId: string, change: Change | null): Changes {
  const next: Record<string, Change> = { ...changes };
  delete next[edgeId];
  const edge = edges.find((e) => e.id === edgeId);
  if (!change || !edge || edge.kind === "contains" || edge.kind === "info") return next;
  if (edge.kind === "member") {
    if (change.removed) next[edgeId] = { removed: true };
    return next;
  }
  // Narrowing only: actions can be taken away, never added.
  const actions = change.actions?.filter((a) => edge.actions?.includes(a));
  if (change.removed || (actions && actions.length === 0)) {
    next[edgeId] = { removed: true };
    return next;
  }
  const clean: { actions?: readonly Action[]; from?: string } = {};
  if (actions && !sameActions(actions, edge.actions)) clean.actions = actions;
  if (change.from && change.from !== edge.from) clean.from = change.from;
  if (clean.actions || clean.from) next[edgeId] = clean;
  return next;
}

export function changeCount(changes: Changes): number {
  return Object.keys(changes).length;
}

// Every edge with its change applied. Removed edges stay in the list (flagged)
// so the map can still draw them.
export function viewEdges(edges: readonly PuzzleEdge[], changes: Changes): ViewEdge[] {
  return edges.map((edge) => {
    const change = changes[edge.id];
    if (!change) return { ...edge, removed: false, changed: false };
    return {
      ...edge,
      from: change.from ?? edge.from,
      actions: change.actions ?? edge.actions,
      removed: change.removed === true,
      changed: true,
    };
  });
}

export function applyChanges(edges: readonly PuzzleEdge[], changes: Changes): PuzzleEdge[] {
  return viewEdges(edges, changes).filter((edge) => !edge.removed);
}

export function evaluate(edges: readonly PuzzleEdge[], user: string, action: Action, resource: string): AccessResult {
  // Rule 1: the user plus every group reachable through membership.
  const chainTo = new Map<string, string[]>([[user, []]]);
  const explored: string[] = [];
  const queue = [user];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.kind !== "member" || edge.from !== current || chainTo.has(edge.to)) continue;
      chainTo.set(edge.to, [...chainTo.get(current)!, edge.id]);
      explored.push(edge.id);
      queue.push(edge.to);
    }
  }

  // Rule 3: the resource plus every folder above it.
  const chainDown = new Map<string, string[]>([[resource, []]]);
  const up = [resource];
  while (up.length > 0) {
    const current = up.shift()!;
    for (const edge of edges) {
      if (edge.kind !== "contains" || edge.to !== current || chainDown.has(edge.from)) continue;
      chainDown.set(edge.from, [edge.id, ...chainDown.get(current)!]);
      up.push(edge.from);
    }
  }

  // Rules 2 and 4: only a matching grant allows the action.
  const paths: string[][] = [];
  for (const edge of edges) {
    if (edge.kind !== "grant" || !edge.actions?.includes(action)) continue;
    const members = chainTo.get(edge.from);
    const contains = chainDown.get(edge.to);
    if (members && contains) paths.push([...members, edge.id, ...contains]);
  }
  paths.sort((a, b) => a.length - b.length);

  return { allowed: paths.length > 0, paths, explored, principals: [...chainTo.keys()] };
}

export function evaluateCheck(edges: readonly PuzzleEdge[], check: Check): AccessResult {
  return evaluate(edges, check.user, check.action, check.resource);
}

export function verify(puzzle: Puzzle, changes: Changes): VerifyReport {
  const current = applyChanges(puzzle.edges, changes);
  const results = puzzle.checks.map((check) => {
    const before = evaluateCheck(puzzle.edges, check);
    const after = evaluateCheck(current, check);
    return { check, before, after, pass: after.allowed === (check.expect === "allow") };
  });
  const changesUsed = changeCount(changes);
  const withinBudget = changesUsed <= puzzle.budget;
  return { results, changesUsed, withinBudget, solved: withinBudget && results.every((r) => r.pass) };
}

export function edgeLabel(edge: PuzzleEdge): string {
  if (edge.kind === "member") return "Member of";
  if (edge.kind === "contains") return "Contains";
  if (edge.kind === "info") return edge.label ?? "Related to";
  return (edge.actions ?? []).map((a) => ACTION_LABEL[a]).join(" · ");
}

// "Alex Chen → Member of → All Employees → Read → Payroll Files"
export function describePath(nodes: readonly PuzzleNode[], edges: readonly PuzzleEdge[], path: readonly string[]): string {
  const name = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const parts: string[] = [];
  path.forEach((edgeId, index) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    if (index === 0) parts.push(name(edge.from));
    parts.push(edgeLabel(edge), name(edge.to));
  });
  return parts.join(" → ");
}
