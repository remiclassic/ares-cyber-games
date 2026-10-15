import { describe, expect, it } from "vitest";
import { MESSAGES } from "../src/phishing/data/messages";
import {
  ACCURACY_POINTS,
  MAX_EVIDENCE,
  PAR_SECONDS,
  bestResponse,
  orderMessages,
  parScore,
  scoreDecision,
  summarize,
} from "../src/phishing/sim/drill";
import type { Decision, Message, Verdict } from "../src/phishing/sim/types";

const SEEDS = ["first-run", "a", "b", "c", "d", "e", "f", "g"];

type Player = (message: Message) => { response: Verdict; evidence: string[]; seconds: number };

function playAll(seed: string, player: Player): { order: Message[]; decisions: Decision[] } {
  const order = orderMessages(MESSAGES, seed);
  const decisions: Decision[] = [];
  let streak = 0;
  for (const message of order) {
    const { response, evidence, seconds } = player(message);
    const decision = scoreDecision(message, response, evidence, seconds, streak);
    streak = decision.streakAfter;
    decisions.push(decision);
  }
  return { order, decisions };
}

const strongCues = (m: Message) => m.cues.filter((c) => c.strength === "strong").map((c) => c.id);
const allCues = (m: Message) => m.cues.map((c) => c.id);

describe("content", () => {
  it("has eight messages covering all three best responses", () => {
    expect(MESSAGES).toHaveLength(8);
    for (const verdict of ["report", "safe", "verify"] as const) {
      expect(MESSAGES.filter((m) => bestResponse(m) === verdict).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("opens with the guided imitation, the legitimate payroll notice, then the request to verify", () => {
    const order = orderMessages(MESSAGES, "any");
    expect(order.slice(0, 3).map((m) => m.category)).toEqual(["phish", "legit", "verify"]);
    expect(order[0].guided).toBe(true);
  });

  it("gives every message enough strong cues, a weak cue, and valid hotspots", () => {
    for (const m of MESSAGES) {
      expect(strongCues(m).length, m.id).toBeGreaterThanOrEqual(MAX_EVIDENCE);
      expect(m.cues.some((c) => c.strength === "weak"), m.id).toBe(true);
      expect(m.cues.some((c) => c.id === "sender"), m.id).toBe(true);
      if (m.category === "verify") expect(m.outcome, m.id).toBeDefined();
      for (const block of m.body) {
        if ("cue" in block) expect(m.cues.some((c) => c.id === block.cue), `${m.id}/${block.cue}`).toBe(true);
      }
      if (m.replyTo) expect(m.cues.some((c) => c.id === "replyTo"), m.id).toBe(true);
    }
  });

  it("uses only reserved .example addresses", () => {
    for (const m of MESSAGES) {
      expect(m.fromAddress.endsWith(".example"), m.id).toBe(true);
      if (m.replyTo) expect(m.replyTo.endsWith(".example"), m.id).toBe(true);
    }
  });
});

describe("scoring", () => {
  const phish = MESSAGES.find((m) => m.category === "phish" && !m.guided)!;
  const legit = MESSAGES.find((m) => m.category === "legit")!;

  it("makes accuracy the largest part of a perfect, instant decision", () => {
    const d = scoreDecision(phish, "report", strongCues(phish), 0, 3);
    expect(d.points.accuracy).toBe(ACCURACY_POINTS);
    expect(d.points.accuracy).toBeGreaterThan(d.points.evidence + d.points.speed);
    expect(d.points.speed).toBeLessThanOrEqual(ACCURACY_POINTS / 5);
  });

  it("awards speed and evidence only after a correct decision", () => {
    const wrong = scoreDecision(phish, "safe", strongCues(phish), 0, 2);
    expect(wrong.points.total).toBe(0);
    expect(wrong.streakAfter).toBe(0);
    const partial = scoreDecision(phish, "verify", strongCues(phish), 0, 2);
    expect(partial.quality).toBe("partial");
    expect(partial.points.speed + partial.points.evidence + partial.points.streak).toBe(0);
  });

  it("needs relevant evidence to keep the streak", () => {
    expect(scoreDecision(legit, "safe", [], 10, 2).streakAfter).toBe(0);
    expect(scoreDecision(legit, "safe", ["tone"], 10, 2).streakAfter).toBe(0);
    expect(scoreDecision(legit, "safe", ["sender"], 10, 2).streakAfter).toBe(3);
  });

  it("counts at most two cues", () => {
    const d = scoreDecision(phish, "report", allCues(phish), 10, 0);
    expect(d.evidence).toHaveLength(MAX_EVIDENCE);
    expect(d.points.evidence).toBeLessThanOrEqual(MAX_EVIDENCE * 20);
  });

  it("reports strong cues as missed only when an evidence slot was left unused", () => {
    const strong = strongCues(phish);
    expect(scoreDecision(phish, "report", strong.slice(0, MAX_EVIDENCE), 10, 0).missedCues).toEqual([]);
    expect(scoreDecision(phish, "report", [strong[0], "tone"], 10, 0).missedCues).toEqual(strong.slice(1));
    expect(scoreDecision(phish, "report", [], 10, 0).missedCues).toEqual(strong);
  });

  it("scores a false alarm at zero, whatever the cues", () => {
    expect(scoreDecision(legit, "report", strongCues(legit), 0, 3).points.total).toBe(0);
  });

  it("does not time the guided message", () => {
    const guided = MESSAGES.find((m) => m.guided)!;
    expect(scoreDecision(guided, "report", strongCues(guided), 0, 0).points.speed).toBe(0);
  });
});

describe("strategies", () => {
  it.each(SEEDS)("careful play at a normal pace earns the top rating (seed %s)", (seed) => {
    const { order, decisions } = playAll(seed, (m) => ({ response: bestResponse(m), evidence: strongCues(m), seconds: 30 }));
    expect(summarize(order, decisions).rating).toBe("guardian");
  });

  it.each(SEEDS)("slow but correct play still earns the top rating (seed %s)", (seed) => {
    const { order, decisions } = playAll(seed, (m) => ({ response: bestResponse(m), evidence: strongCues(m), seconds: PAR_SECONDS * 3 }));
    const summary = summarize(order, decisions);
    expect(summary.total).toBe(parScore(order));
    expect(summary.rating).toBe("guardian");
  });

  for (const blanket of ["report", "safe", "verify"] as const) {
    it.each(SEEDS)(`choosing "${blanket}" for everything, instantly, stays out of the top two ratings (seed %s)`, (seed) => {
      const { order, decisions } = playAll(seed, (m) => ({ response: blanket, evidence: strongCues(m), seconds: 0 }));
      const summary = summarize(order, decisions);
      expect(summary.ratio).toBeLessThan(0.6);
      expect(["trainee", "novice"]).toContain(summary.rating);
    });
  }

  it("fast guessing without evidence scores below slow, evidenced play", () => {
    const fast = playAll("a", (m) => ({ response: bestResponse(m), evidence: [], seconds: 0 }));
    const slow = playAll("a", (m) => ({ response: bestResponse(m), evidence: strongCues(m), seconds: PAR_SECONDS * 2 }));
    expect(summarize(fast.order, fast.decisions).total).toBeLessThan(summarize(slow.order, slow.decisions).total);
  });

  it("summarizes habits", () => {
    const { order, decisions } = playAll("a", () => ({ response: "report", evidence: [], seconds: 5 }));
    const summary = summarize(order, decisions);
    expect(summary.falseAlarms).toBe(4);
    expect(summary.missedPhish).toBe(0);
    expect(summary.skippedVerification).toBe(2);
  });
});
