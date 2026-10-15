import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/board/data";
import { bestLevel, calibration, payout } from "../src/board/engine";

describe("Confidence Board", () => {
  it("has six categories of four questions with valid answers", () => {
    expect(CATEGORIES).toHaveLength(6);
    for (const category of CATEGORIES) {
      expect(category.questions.map((q) => q.value)).toEqual([100, 200, 300, 400]);
      for (const q of category.questions) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });

  it("makes each confidence level the best bet in its own accuracy band", () => {
    expect(bestLevel(0.4)).toBe("unsure");
    expect(bestLevel(0.6)).toBe("likely");
    expect(bestLevel(0.8)).toBe("sure");
    expect(bestLevel(0.95)).toBe("certain");
  });

  it("pays and charges by confidence", () => {
    expect(payout(200, "certain", true)).toBe(400);
    expect(payout(200, "certain", false)).toBe(-1200);
    expect(payout(200, "unsure", false)).toBe(0);
    const c = calibration([{ category: 0, row: 0, confidence: "sure", choice: 2, correct: true, points: 150 }]);
    expect(c.find((x) => x.id === "sure")).toMatchObject({ asked: 1, right: 1 });
  });
});
