import { describe, expect, it } from "vitest";
import { INCIDENTS, STAGES } from "../src/chain/data";
import { earliestBreak, newRound, pass, place, score } from "../src/chain/engine";

describe("Chain Breaker", () => {
  it("each incident has one card per stage and at least one break that does nothing", () => {
    for (const incident of INCIDENTS) {
      expect(incident.cards.map((c) => c.stage).sort()).toEqual(STAGES.map((_, i) => i));
      expect(incident.breaks.some((b) => b.stage === null)).toBe(true);
      expect(earliestBreak(incident).stage).toBe(2);
    }
  });

  it("places cards on the right stage and explains wrong ones", () => {
    const round = newRound(0, 3);
    const top = round.incident.cards.find((c) => c.id === round.deck[0])!;
    const wrong = place(round, (top.stage + 1) % 7);
    expect(wrong.ok).toBe(false);
    expect(round.mistakes).toBe(1);
    expect(place(round, top.stage).ok).toBe(true);
    pass(round);
    expect(round.deck).toHaveLength(6);
  });

  it("scores the earliest break best and an irrelevant one at zero", () => {
    const round = newRound(1, 5);
    for (const card of [...round.incident.cards]) {
      while (round.deck[0] !== card.id) pass(round);
      place(round, card.stage);
    }
    round.breakChoice = earliestBreak(round.incident).id;
    expect(score(round).total).toBe(100);
    round.breakChoice = round.incident.breaks.find((b) => b.stage === null)!.id;
    expect(score(round).break).toBe(0);
  });
});
