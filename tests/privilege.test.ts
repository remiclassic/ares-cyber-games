import { describe, expect, it } from "vitest";
import { PUZZLES } from "../src/privilege/data/puzzles";
import { changeCount, evaluate, setChange, verify } from "../src/privilege/sim/access";
import { scorePuzzle } from "../src/privilege/sim/scoring";
import type { Change, Changes, Puzzle, PuzzleEdge } from "../src/privilege/sim/types";

function puzzle(id: string): Puzzle {
  const found = PUZZLES.find((p) => p.id === id);
  if (!found) throw new Error(`no puzzle ${id}`);
  return found;
}

function edit(p: Puzzle, edits: Record<string, Change>): Changes {
  let changes: Changes = {};
  for (const [edgeId, change] of Object.entries(edits)) changes = setChange(p.edges, changes, edgeId, change);
  return changes;
}

const SOLUTIONS: Record<string, Record<string, Change>> = {
  "who-can-read-payroll": { "g-all-payroll": { from: "finance" } },
  "the-nested-contractor": { "m-project-engineering": { removed: true } },
  "two-routes-to-the-ledger": { "g-it-share": { removed: true }, "g-backup-ledger": { actions: ["read"] } },
};

describe("permission model", () => {
  const edges: PuzzleEdge[] = [
    { id: "m1", kind: "member", from: "u", to: "a" },
    { id: "m2", kind: "member", from: "a", to: "b" },
    { id: "m3", kind: "member", from: "b", to: "a" },
    { id: "g1", kind: "grant", from: "b", to: "folder", actions: ["read"] },
    { id: "c1", kind: "contains", from: "folder", to: "file" },
    { id: "i1", kind: "info", from: "u", to: "secret", label: "Sits next to" },
    { id: "g2", kind: "grant", from: "other", to: "secret", actions: ["read", "write"] },
  ];

  it("carries access through nested groups and folders", () => {
    const result = evaluate(edges, "u", "read", "file");
    expect(result.allowed).toBe(true);
    expect(result.paths[0]).toEqual(["m1", "m2", "g1", "c1"]);
  });

  it("only allows the actions a grant lists", () => {
    expect(evaluate(edges, "u", "write", "file").allowed).toBe(false);
  });

  it("never treats connectivity as authorization", () => {
    expect(evaluate(edges, "u", "read", "secret").allowed).toBe(false);
  });

  it("does not pass access up from an item to its folder", () => {
    const up: PuzzleEdge[] = [...edges, { id: "g3", kind: "grant", from: "u", to: "file", actions: ["write"] }];
    expect(evaluate(up, "u", "write", "file").allowed).toBe(true);
    expect(evaluate(up, "u", "write", "folder").allowed).toBe(false);
  });
});

describe("changes", () => {
  const p = puzzle("two-routes-to-the-ledger");

  it("drops a change that restores the original", () => {
    expect(changeCount(edit(p, { "g-it-share": { actions: ["write", "read"], from: "it" } }))).toBe(0);
  });

  it("cannot add actions or edit fixed relationships", () => {
    const p1 = puzzle("who-can-read-payroll");
    expect(changeCount(edit(p1, { "g-all-payroll": { actions: ["read", "write"] } }))).toBe(0);
    expect(changeCount(edit(p, { "c-share-ledger": { removed: true } }))).toBe(0);
  });

  it("treats removing every action as removing the grant", () => {
    expect(edit(p, { "g-it-share": { actions: [] } })["g-it-share"]).toEqual({ removed: true });
  });
});

describe.each(PUZZLES.map((p) => [p.id, p] as const))("%s", (_id, p) => {
  it("starts with a real problem and working business access", () => {
    const report = verify(p, {});
    expect(report.solved).toBe(false);
    for (const r of report.results) if (r.check.expect === "allow") expect(r.pass).toBe(true);
  });

  it("is solved by the intended fix at par", () => {
    const changes = edit(p, SOLUTIONS[p.id]);
    expect(changeCount(changes)).toBe(p.par);
    expect(verify(p, changes).solved).toBe(true);
  });

  it("cannot be solved with fewer changes than par", () => {
    const options = (edge: PuzzleEdge): Change[] => {
      if (edge.kind === "member") return [{ removed: true }];
      if (edge.kind !== "grant") return [];
      const groups = p.nodes.filter((n) => n.kind === "group" && n.id !== edge.from).map((n) => ({ from: n.id }));
      return [{ removed: true }, { actions: ["read"] }, { actions: ["write"] }, ...groups];
    };
    if (p.par === 1) return;
    for (const edge of p.edges) {
      for (const change of options(edge)) expect(verify(p, edit(p, { [edge.id]: change })).solved).toBe(false);
    }
  });

  it("fails when access is removed for everyone", () => {
    const all: Record<string, Change> = {};
    for (const edge of p.edges) if (edge.kind === "grant") all[edge.id] = { removed: true };
    const report = verify(p, edit(p, all));
    expect(report.results.some((r) => r.check.expect === "allow" && !r.pass)).toBe(true);
  });

  it("has exactly one correct explanation", () => {
    expect(p.explain.options.filter((o) => o.correct)).toHaveLength(1);
  });
});

describe("specific mistakes", () => {
  it("payroll: removing the grant breaks Finance", () => {
    const p = puzzle("who-can-read-payroll");
    const report = verify(p, edit(p, { "g-all-payroll": { removed: true } }));
    expect(report.results.find((r) => r.check.id === "dana-payroll")?.pass).toBe(false);
  });

  it("ledger: closing one route leaves the other open", () => {
    const p = puzzle("two-routes-to-the-ledger");
    const report = verify(p, edit(p, { "g-it-share": { removed: true } }));
    const jordan = report.results.find((r) => r.check.id === "jordan-ledger-write")!;
    expect(jordan.before.paths).toHaveLength(2);
    expect(jordan.after.paths).toHaveLength(1);
    expect(jordan.pass).toBe(false);
  });
});

describe("scoring", () => {
  it("rewards minimal fixes and explanations", () => {
    const best = scorePuzzle({ changesUsed: 1, par: 1, correctPredictions: 3, explainedFirstTry: true, failedVerifies: 0 });
    const loose = scorePuzzle({ changesUsed: 2, par: 1, correctPredictions: 0, explainedFirstTry: false, failedVerifies: 3 });
    expect(best.total).toBe(230);
    expect(loose.total).toBe(100);
  });
});
