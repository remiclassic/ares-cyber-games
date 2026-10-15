import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/counterplay/data/scenario";
import { apply, createGame, currentHand, currentIncident, fitOf, summarize, techniqueOf } from "../src/counterplay/sim/engine";
import type { Command, GameState } from "../src/counterplay/sim/types";

function must(state: GameState, command: Command): void {
  const result = apply(state, command);
  if (!result.ok) throw new Error(`${command.type} failed: ${result.error}`);
}

type Strategy = (state: GameState) => { name: string; card: string };

const best: Strategy = (state) => {
  const tech = techniqueOf(currentIncident(state), currentHand(state).technique);
  const rank = { counter: 2, partial: 1, miss: 0 } as const;
  const card = [...state.toolkit].sort((a, b) => rank[fitOf(tech, b)] - rank[fitOf(tech, a)])[0];
  return { name: tech.name, card };
};

function playIncident(state: GameState, strategy: Strategy): void {
  const index = state.incidentIndex;
  while (state.incidentIndex === index && state.phase !== "done") {
    if (state.phase === "identify") {
      const { name } = strategy(state);
      must(state, { type: "identify", choice: name });
    } else if (state.phase === "respond") {
      must(state, { type: "play", card: strategy(state).card });
    } else {
      must(state, { type: "next" });
    }
  }
}

function playAll(state: GameState, strategy: Strategy): void {
  while (state.phase !== "done") playIncident(state, strategy);
}

describe("content", () => {
  it("only uses cards and techniques that exist, and every technique has a counter in its toolkit", () => {
    const cards = new Set(SCENARIO.cards.map((entry) => entry.id));
    for (const incident of SCENARIO.incidents) {
      for (const id of incident.toolkit) expect(cards.has(id), id).toBe(true);
      for (const tech of incident.techniques) {
        expect(tech.counters.length, tech.id).toBeGreaterThan(0);
        for (const id of [...tech.counters, ...tech.partials, ...Object.keys(tech.notes)]) expect(incident.toolkit.includes(id), `${tech.id}:${id}`).toBe(true);
        expect(new Set([tech.name, ...tech.lookalikes]).size).toBe(3);
        for (const template of tech.telemetry) {
          for (const [, key] of template.matchAll(/\{(\w+)\}/g)) expect(incident.values[key], `${tech.id}:{${key}}`).toBeDefined();
        }
      }
      for (const step of incident.playbook) {
        expect(incident.techniques.some((tech) => tech.id === step.play)).toBe(true);
        if (step.ifCountered) expect(incident.techniques.some((tech) => tech.id === step.ifCountered)).toBe(true);
      }
    }
  });

  it("never gives a card two different counters in one incident, so the toolkit always has the answer", () => {
    for (const incident of SCENARIO.incidents) {
      const seen = new Map<string, string>();
      for (const tech of incident.techniques) {
        for (const id of tech.counters) {
          expect(seen.get(id), `${incident.id}:${id}`).toBeUndefined();
          seen.set(id, tech.id);
        }
      }
    }
  });

  it("fills every telemetry placeholder", () => {
    const state = createGame(SCENARIO, "fill");
    playAll(state, (current) => {
      expect(currentHand(current).telemetry).not.toMatch(/\{\w+\}/);
      return best(current);
    });
  });
});

describe("rules", () => {
  it("requires naming the technique before responding", () => {
    const state = createGame(SCENARIO, "order");
    expect(apply(state, { type: "play", card: "purge" }).ok).toBe(false);
    must(state, { type: "identify", choice: currentHand(state).options[0] });
    must(state, { type: "play", card: "purge" });
    expect(apply(state, { type: "play", card: "revoke" }).ok).toBe(false);
  });

  it("uses each card once per incident", () => {
    const state = createGame(SCENARIO, "once");
    must(state, { type: "identify", choice: currentHand(state).options[0] });
    must(state, { type: "play", card: "block-sender" });
    must(state, { type: "next" });
    must(state, { type: "identify", choice: currentHand(state).options[0] });
    expect(apply(state, { type: "play", card: "block-sender" }).ok).toBe(false);
  });

  it("switches technique when its last move was countered", () => {
    const counter = createGame(SCENARIO, "branch");
    playIncident(counter, best); // counters phishing and token replay, so the actor moves to OAuth
    expect(counter.records[0].hands.map((hand) => hand.technique)).toEqual(["phish-link", "token-replay", "oauth-consent"]);
    const partial = createGame(SCENARIO, "branch");
    for (const card of ["purge", "mfa-reset"]) {
      must(partial, { type: "identify", choice: currentHand(partial).options[0] });
      must(partial, { type: "play", card });
      must(partial, { type: "next" });
    }
    expect(currentHand(partial).technique).toBe("inbox-rule");
  });

  it("ends an incident at three points and moves to the next", () => {
    const state = createGame(SCENARIO, "three");
    playIncident(state, best);
    expect(state.records[0].score).toMatchObject({ defender: 3, attacker: 0, result: "evicted" });
    expect(currentIncident(state).id).toBe("ransomware");
  });

  it("changes the telemetry values on retry", () => {
    const a = createGame(SCENARIO, "values", 0);
    const b = createGame(SCENARIO, "values", 1);
    expect(currentHand(a).telemetry).not.toBe(currentHand(b).telemetry);
  });

  it("rebuilds an incident from the seed and the command log", () => {
    const state = createGame(SCENARIO, "replay");
    playIncident(state, best);
    const again = createGame(SCENARIO, "replay");
    for (const command of state.records[0].log) must(again, command);
    expect(again.records[0].score).toEqual(state.records[0].score);
  });
});

describe("scoring", () => {
  for (const seed of ["a", "b", "c"]) {
    it(`gives 100 for naming every technique and playing the best card (seed ${seed})`, () => {
      const state = createGame(SCENARIO, seed);
      playAll(state, best);
      for (const record of state.records) expect(record.score.total, record.incidentId).toBe(100);
    });
  }

  it("grades the response against what was still in the toolkit", () => {
    const state = createGame(SCENARIO, "toolkit");
    must(state, { type: "identify", choice: techniqueOf(currentIncident(state), "phish-link").name });
    must(state, { type: "play", card: "inbox-rule" });
    expect(state.hands[0].fit).toBe("miss");
    expect(state.hands[0].bestAvailable).toBe("counter");
    must(state, { type: "next" });
    must(state, { type: "identify", choice: currentHand(state).options[0] });
    must(state, { type: "play", card: "mfa-reset" }); // partial, so the actor stays on its plan
    must(state, { type: "next" });
    // Inbox rule is next and its counter is gone, so the partial is now the best play left.
    expect(currentHand(state).technique).toBe("inbox-rule");
    must(state, { type: "identify", choice: currentHand(state).options[0] });
    expect(apply(state, { type: "play", card: "inbox-rule" }).ok).toBe(false);
  });

  it("keeps naive strategies well below the best play", () => {
    const first: Strategy = (state) => ({ name: currentHand(state).options[0], card: state.toolkit[0] });
    const last: Strategy = (state) => ({ name: currentHand(state).options[2], card: state.toolkit[state.toolkit.length - 1] });
    for (const strategy of [first, last]) {
      const state = createGame(SCENARIO, "naive");
      playAll(state, strategy);
      expect(summarize(state.records).total).toBeLessThan(60);
    }
  });

  it("separates naming the technique from choosing the response", () => {
    const wrongName: Strategy = (state) => {
      const pick = best(state);
      return { name: currentHand(state).options.find((option) => option !== pick.name)!, card: pick.card };
    };
    const state = createGame(SCENARIO, "split");
    playAll(state, wrongName);
    const summary = summarize(state.records);
    expect(summary.identify).toBe(0);
    expect(summary.response).toBe(40);
    expect(summary.outcome).toBe(30);
  });
});
