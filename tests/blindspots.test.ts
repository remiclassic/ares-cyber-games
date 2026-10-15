import { describe, expect, it } from "vitest";
import { BUDGET, NODES, PATHS, SENSORS } from "../src/blindspots/data";
import { bestPlan, cost, evaluate, runPath } from "../src/blindspots/engine";

describe("Blind Spots", () => {
  it("every step is visible to some sensor, on a real node", () => {
    for (const path of PATHS) for (const step of path.steps) {
      expect(SENSORS.some((s) => s.sees.includes(step.id)), step.id).toBe(true);
      expect(NODES.some((n) => n.id === step.node)).toBe(true);
    }
  });

  it("can't buy everything, and the best plan is a real trade-off", () => {
    expect(cost(SENSORS.map((s) => s.id))).toBeGreaterThan(BUDGET * 2);
    const best = bestPlan();
    expect(cost(best.sensors)).toBeLessThanOrEqual(BUDGET);
    expect(best.total).toBeGreaterThan(70);
    expect(best.total).toBeLessThan(100);
  });

  it("rewards early detection over late", () => {
    const p = PATHS[0];
    expect(runPath(p, ["mailbox"]).early).toBe(70);
    expect(runPath(p, ["fsaudit"]).early).toBeLessThan(30);
    expect(runPath(p, []).total).toBe(0);
    expect(runPath(p, ["mailbox", "fsaudit"]).depth).toBe(30);
    // Spending everything on the last step (exfil monitoring) scores worse than the best plan.
    expect(evaluate(["egress", "dbaudit", "fsaudit"]).total).toBeLessThan(bestPlan().total);
  });
});
