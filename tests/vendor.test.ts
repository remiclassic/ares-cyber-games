import { describe, expect, it } from "vitest";
import { PURCHASES } from "../src/vendor/data";
import {
  ALL_VERDICTS,
  CONDITIONS,
  MAX_FLAGS,
  OUTCOME_POINTS,
  PURCHASE_MAX,
  STRATEGIES,
  THRESHOLDS,
  VERDICT_POINTS,
  applyPlan,
  ask,
  bestVerdict,
  canJudge,
  createGame,
  currentPurchase,
  currentRound,
  learning,
  next,
  optionFor,
  playAll,
  questionsLeft,
  roundResult,
  score,
  setPreferred,
  setVerdict,
  sign,
  signBlockers,
  toggleFlag,
  visibleEvidence,
  type Strategy,
  type Verdict,
} from "../src/vendor/engine";

const APPROVE: Verdict = { kind: "approve" };
const REJECT: Verdict = { kind: "reject" };
const cond = (condition: (typeof CONDITIONS)[number]["id"]): Verdict => ({ kind: "conditions", condition });
const run = (strategy: Strategy) => score(playAll(PURCHASES, strategy));
const suppliers = PURCHASES.flatMap((purchase) => purchase.suppliers.map((supplier) => ({ purchase, supplier })));

describe("content", () => {
  it("has three purchases of three bids: guided first, a no-hint final", () => {
    expect(PURCHASES).toHaveLength(3);
    for (const purchase of PURCHASES) expect(purchase.suppliers, purchase.id).toHaveLength(3);
    expect(PURCHASES[0].hints).toBe("full");
    expect(PURCHASES[2].hints).toBe("none");
    expect(PURCHASES[2].hint).toBeUndefined();
    for (const supplier of PURCHASES[0].suppliers) expect(supplier.coach, supplier.id).toBeTruthy();
    for (const supplier of PURCHASES[2].suppliers) expect(supplier.coach, supplier.id).toBeUndefined();
    expect(PURCHASES.some((purchase) => purchase.tier === "low")).toBe(true);
  });

  it("is well formed: unique ids, .example domains, key evidence, limited questions", () => {
    expect(new Set(suppliers.map(({ supplier }) => supplier.id)).size).toBe(9);
    for (const { purchase, supplier } of suppliers) {
      expect(supplier.domain, supplier.id).toMatch(/\.example$/);
      expect(new Set(supplier.facts.map((fact) => fact.id)).size, supplier.id).toBe(supplier.facts.length);
      expect(supplier.facts.filter((fact) => fact.key).length, supplier.id).toBeGreaterThanOrEqual(1);
      expect(supplier.followUps.length, supplier.id).toBe(2);
      for (const section of ["access", "questionnaire", "audit", "breach", "subs", "contract"]) expect(supplier.facts.some((fact) => fact.section === section), `${supplier.id}:${section}`).toBe(true);
      for (const verdict of ALL_VERDICTS) expect(optionFor(supplier, verdict).text.length, supplier.id).toBeGreaterThan(40);
      // Fewer questions than there are things to ask.
      expect(purchase.questions).toBeLessThan(purchase.suppliers.reduce((sum, entry) => sum + entry.followUps.length, 0));
    }
    const text = JSON.stringify(PURCHASES);
    expect(text).not.toMatch(/(ISO|SOC ?2|PCI|NIST|Cyber Essentials)/);
  });

  it("gives every purchase at least one supplier worth signing and one worth rejecting", () => {
    for (const purchase of PURCHASES) {
      const bests = purchase.suppliers.map((supplier) => bestVerdict(supplier).kind);
      expect(bests.some((kind) => kind !== "reject"), purchase.id).toBe(true);
      expect(bests.includes("reject"), purchase.id).toBe(true);
    }
  });

  it("uses approve, approve with conditions and reject as a best verdict somewhere", () => {
    const kinds = new Set(suppliers.map(({ supplier }) => bestVerdict(supplier).kind));
    expect([...kinds].sort()).toEqual(["approve", "conditions", "reject"]);
  });

  it("never makes a certificate badge enough: the cheapest badge holder is a poor outright approval in every purchase", () => {
    for (const purchase of PURCHASES) {
      const badged = [...purchase.suppliers].sort((a, b) => a.price - b.price).find((supplier) => supplier.badge)!;
      expect(badged, purchase.id).toBeTruthy();
      expect(badged.approve.grade, badged.id).toBe("poor");
    }
  });

  it("makes a supplier with a well-handled breach the right pick over spotless, unverifiable ones", () => {
    const handled = suppliers.filter(({ supplier }) => supplier.handledBreach);
    expect(handled.length).toBeGreaterThanOrEqual(2);
    for (const { purchase, supplier } of handled) {
      expect(bestVerdict(supplier).kind, supplier.id).not.toBe("reject");
      expect(supplier.reject.grade, supplier.id).toBe("poor");
      for (const other of purchase.suppliers.filter((entry) => entry.trap === "unverifiable")) expect(bestVerdict(other).kind, other.id).toBe("reject");
    }
  });

  it("punishes heavyweight conditions on the low-risk purchase and accepts a plain approval there", () => {
    const low = PURCHASES.find((purchase) => purchase.tier === "low")!;
    const viable = low.suppliers.filter((supplier) => bestVerdict(supplier).kind !== "reject");
    expect(viable.length).toBeGreaterThanOrEqual(1);
    for (const supplier of viable) {
      expect(supplier.approve.grade, supplier.id).toBe("best");
      expect(optionFor(supplier, cond("onsite")).grade, supplier.id).toBe("poor");
    }
    for (const supplier of low.suppliers) expect(optionFor(supplier, cond("onsite")).grade, supplier.id).toBe("poor");
    // The cheapest bid without a certificate is fine when nothing sensitive is involved.
    const cheapest = [...low.suppliers].sort((a, b) => a.price - b.price)[0];
    expect(cheapest.badge).toBeNull();
    expect(cheapest.approve.grade).toBe("best");
  });
});

describe("flow", () => {
  it("needs flagged evidence before a verdict, and caps flags per supplier", () => {
    const state = createGame(PURCHASES);
    const [a] = currentPurchase(state).suppliers;
    expect(canJudge(state, a.id)).toBe(false);
    expect(setVerdict(state, a.id, REJECT)).toBe(false);
    expect(toggleFlag(state, a.id, "nope")).toBe(false);
    for (const fact of a.facts.slice(0, MAX_FLAGS)) expect(toggleFlag(state, a.id, fact.id)).toBe(true);
    expect(toggleFlag(state, a.id, a.facts[MAX_FLAGS].id)).toBe(false);
    expect(toggleFlag(state, a.id, a.facts[0].id)).toBe(true); // unflag
    expect(currentRound(state).flags[a.id]).toHaveLength(MAX_FLAGS - 1);
    expect(setVerdict(state, a.id, REJECT)).toBe(true);
  });

  it("limits follow-up questions and reveals the answer as evidence that can be flagged", () => {
    const state = createGame(PURCHASES);
    const purchase = currentPurchase(state);
    const [a, b, c] = purchase.suppliers;
    expect(toggleFlag(state, a.id, `fu:${a.followUps[0].id}`)).toBe(false); // not asked yet
    expect(ask(state, a.id, a.followUps[0].id)?.answer).toBeTruthy();
    expect(ask(state, a.id, a.followUps[0].id)).toBeNull(); // no repeat
    expect(visibleEvidence(currentRound(state), a).some((entry) => entry.id === `fu:${a.followUps[0].id}`)).toBe(true);
    expect(toggleFlag(state, a.id, `fu:${a.followUps[0].id}`)).toBe(true);
    ask(state, b.id, b.followUps[0].id);
    ask(state, c.id, c.followUps[0].id);
    expect(questionsLeft(state)).toBe(0);
    expect(ask(state, c.id, c.followUps[1].id)).toBeNull();
  });

  it("needs a verdict for every supplier and a preferred supplier before sign-off", () => {
    const state = createGame(PURCHASES);
    const [a, b, c] = currentPurchase(state).suppliers;
    for (const supplier of [a, b, c]) toggleFlag(state, supplier.id, supplier.facts[0].id);
    setVerdict(state, a.id, REJECT);
    expect(signBlockers(state)).toHaveLength(2);
    expect(sign(state)).toBeNull();
    setVerdict(state, b.id, REJECT);
    setVerdict(state, c.id, APPROVE);
    expect(setPreferred(state, a.id)).toBe(false); // rejected suppliers cannot be preferred
    expect(signBlockers(state)).toEqual(["Name your preferred supplier."]);
    expect(setPreferred(state, c.id)).toBe(true);
    setVerdict(state, c.id, REJECT); // changing to reject clears the preference
    expect(currentRound(state).preferred).toBeNull();
    setVerdict(state, c.id, cond("mfa"));
    setPreferred(state, c.id);
    const result = sign(state)!;
    expect(result.outcome).toBe("best");
    expect(result.total).toBe(PURCHASE_MAX);
    expect(state.phase).toBe("year");
    expect(setVerdict(state, c.id, REJECT)).toBe(false); // final once signed
    next(state);
    expect(state.phase).toBe("review");
    expect(state.index).toBe(1);
  });

  it("lets everyone be rejected, and the business need then goes unmet", () => {
    const state = createGame(PURCHASES);
    applyPlan(state, STRATEGIES.rejectEveryone(currentPurchase(state)));
    expect(signBlockers(state)).toEqual([]);
    const result = sign(state)!;
    expect(result.outcome).toBe("unmet");
    expect(result.outcomePoints).toBe(0);
    expect(result.events).toBe(PURCHASES[0].unmet);
  });

  it("ends after the third purchase", () => {
    const state = playAll(PURCHASES, STRATEGIES.best);
    expect(state.phase).toBe("done");
    expect(state.rounds.every((round) => round.signed)).toBe(true);
  });
});

describe("scoring", () => {
  it("scores the maximum for best play and passes", () => {
    const result = run(STRATEGIES.best);
    expect(result.total).toBe(100);
    expect(result.verdicts).toBe(3 * VERDICT_POINTS.best);
    expect(result.outcomes).toBe(OUTCOME_POINTS.best);
    expect(result.needsMet).toBe(3);
    expect(result.passed).toBe(true);
  });

  it("no plan beats best play in any purchase", () => {
    for (const purchase of PURCHASES) {
      let top = 0;
      for (const a of ALL_VERDICTS) for (const b of ALL_VERDICTS) for (const c of ALL_VERDICTS) {
        const verdicts = Object.fromEntries(purchase.suppliers.map((supplier, i) => [supplier.id, [a, b, c][i]]));
        for (const supplier of purchase.suppliers) {
          if (verdicts[supplier.id].kind === "reject") continue;
          top = Math.max(top, roundResult(purchase, { asked: [], flags: {}, verdicts, preferred: supplier.id, signed: true }).total);
        }
      }
      expect(top, purchase.id).toBe(PURCHASE_MAX);
    }
  });

  it("reject everyone loses: every business need goes unmet", () => {
    const result = run(STRATEGIES.rejectEveryone);
    expect(result.total).toBeLessThan(THRESHOLDS.shortcutCeiling);
    expect(result.needsMet).toBe(0);
    expect(result.outcomes).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("fails a run with a single unmet need even when the score clears the pass mark", () => {
    const result = run((purchase) => (purchase.id === "hvac" ? STRATEGIES.rejectEveryone(purchase) : STRATEGIES.best(purchase)));
    expect(result.total).toBe(77);
    expect(result.total).toBeGreaterThanOrEqual(THRESHOLDS.score);
    expect(result.needsMet).toBe(2);
    expect(result.passed).toBe(false);
  });

  it("pick the cheapest loses", () => {
    for (const strategy of [STRATEGIES.cheapest, STRATEGIES.approveAllPreferCheapest]) {
      const result = run(strategy);
      expect(result.total).toBeLessThan(THRESHOLDS.shortcutCeiling);
      expect(result.passed).toBe(false);
      expect(result.rounds.filter((round) => round.outcome === "poor")).toHaveLength(2);
    }
  });

  it("pick whoever has a certificate badge loses", () => {
    for (const strategy of [STRATEGIES.badge, STRATEGIES.approveAllPreferBadge]) {
      const result = run(strategy);
      expect(result.total).toBeLessThan(THRESHOLDS.shortcutCeiling);
      expect(result.passed).toBe(false);
      expect(result.rounds.every((round) => round.outcome === "poor")).toBe(true);
    }
  });

  it("avoiding any supplier that admitted a breach loses", () => {
    const result = run(STRATEGIES.spotlessOnly);
    expect(result.total).toBeLessThan(THRESHOLDS.shortcutCeiling);
    expect(result.passed).toBe(false);
  });

  it("the heaviest condition on everyone, and always buying the dearest bid, both lose", () => {
    for (const strategy of [STRATEGIES.heavyEverything, STRATEGIES.dearest]) {
      const result = run(strategy);
      expect(result.total).toBeLessThan(THRESHOLDS.score);
      expect(result.passed).toBe(false);
    }
    expect(run(STRATEGIES.heavyEverything).rounds.find((round) => round.purchase.tier === "low")!.outcome).toBe("poor");
  });

  it("the right supplier with its gap left open is partly right, not best", () => {
    const state = createGame(PURCHASES);
    const purchase = currentPurchase(state);
    const plan = STRATEGIES.best(purchase);
    applyPlan(state, { ...plan, verdicts: { ...plan.verdicts, [plan.preferred!]: APPROVE } });
    const result = sign(state)!;
    expect(result.outcome).toBe("ok");
    expect(result.total).toBe(2 * VERDICT_POINTS.best + VERDICT_POINTS.ok + OUTCOME_POINTS.ok);
  });
});

describe("learning evidence is separate from the score", () => {
  it("flags and follow-up questions change the learning evidence but never the score", () => {
    const keyFlag = playAll(PURCHASES, STRATEGIES.best, (supplier) => supplier.facts.find((fact) => fact.key)!.id);
    const otherFlag = playAll(PURCHASES, STRATEGIES.best, (supplier) => supplier.facts.find((fact) => !fact.key)!.id);
    expect(score(keyFlag)).toEqual(score(otherFlag));
    expect(learning(keyFlag).flagsOnKey).toBe(9);
    expect(learning(keyFlag).suppliersWithKeyFlag).toBe(9);
    expect(learning(otherFlag).flagsOnKey).toBe(0);

    const asking = createGame(PURCHASES);
    while (asking.phase !== "done") {
      const purchase = currentPurchase(asking);
      const key = purchase.suppliers[0].followUps.find((entry) => entry.key)!;
      ask(asking, purchase.suppliers[0].id, key.id);
      applyPlan(asking, STRATEGIES.best(purchase));
      sign(asking);
      next(asking);
    }
    expect(score(asking).total).toBe(score(keyFlag).total);
    expect(learning(asking).followUpsUsed).toBe(3);
    expect(learning(asking).followUpsKey).toBe(3);
    expect(learning(keyFlag).followUpsUsed).toBe(0);
  });

  it("names the habits behind each shortcut", () => {
    const clean = learning(playAll(PURCHASES, STRATEGIES.best));
    expect(clean.heavyOnLowRisk).toEqual([]);
    expect(clean.gapsLeftOpen).toEqual([]);
    expect(clean.badgeTrusted).toEqual([]);
    expect(clean.handledBreachRejected).toEqual([]);
    expect(clean.needsUnmet).toEqual([]);
    expect(clean.noHintOutcome).toBe("best");

    expect(learning(playAll(PURCHASES, STRATEGIES.rejectEveryone)).needsUnmet).toEqual(["payroll", "chatbot", "hvac"]);
    expect(learning(playAll(PURCHASES, STRATEGIES.rejectEveryone)).handledBreachRejected).toEqual(["harrowgate", "fennick"]);
    expect(learning(playAll(PURCHASES, STRATEGIES.badge)).badgeTrusted).toEqual(["quillmark", "orbisdesk", "northvane"]);
    const cheap = learning(playAll(PURCHASES, STRATEGIES.cheapest));
    expect(cheap.unverifiableTrusted).toEqual(["paynimbus", "coolcurrent"]);
    expect(cheap.cheapestPickedPoorly).toEqual(["payroll", "hvac"]);
    expect(cheap.noHintOutcome).toBe("poor");
    expect(learning(playAll(PURCHASES, STRATEGIES.heavyEverything)).heavyOnLowRisk).toHaveLength(3);
    expect(learning(playAll(PURCHASES, STRATEGIES.approveAllPreferCheapest)).gapsLeftOpen).toEqual(["harrowgate", "fennick"]);
  });
});

describe("shortcut scores (documented in docs/design/VENDOR_VETTING.md)", () => {
  it("match the table", () => {
    const totals = Object.fromEntries(Object.entries(STRATEGIES).map(([name, strategy]) => [name, run(strategy).total]));
    expect(totals).toMatchInlineSnapshot(`
      {
        "approveAllPreferBadge": 15,
        "approveAllPreferCheapest": 33,
        "badge": 15,
        "best": 100,
        "cheapest": 41,
        "dearest": 46,
        "heavyEverything": 31,
        "rejectEveryone": 30,
        "spotlessOnly": 41,
      }
    `);
  });
});
