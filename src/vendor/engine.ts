// Vendor Vetting: for each purchase three suppliers bid. Read each file, spend a few follow-up
// questions, flag the evidence that matters, give each supplier a verdict (approve, approve with
// one condition, or reject) and name the preferred supplier. Then a year plays out.
// Pure rules; no DOM. The score comes only from verdicts and the year's outcome. Flags and
// follow-up questions are learning evidence and never change the score.

export type Grade = "best" | "ok" | "poor";

export type ConditionId = "mfa" | "access" | "contract" | "evidence" | "onsite";

export const CONDITIONS: readonly Readonly<{ id: ConditionId; name: string; detail: string; weight: "light" | "heavy" }>[] = [
  { id: "mfa", name: "Multi-factor sign-in", detail: "Our accounts on the service must use single sign-on with multi-factor.", weight: "light" },
  { id: "access", name: "Limit the access", detail: "Only what the job needs: per session, approved by us, time-limited and recorded.", weight: "light" },
  { id: "contract", name: "Stronger contract terms", detail: "72-hour breach notice, right to audit, data returned and deleted on exit.", weight: "light" },
  { id: "evidence", name: "Current in-scope audit first", detail: "No go-live until an independent audit report covers the product we are buying.", weight: "heavy" },
  { id: "onsite", name: "Our own audit and penetration test", detail: "We audit the supplier on site and test the service before signing.", weight: "heavy" },
];

export type Verdict = Readonly<{ kind: "approve" } | { kind: "reject" } | { kind: "conditions"; condition: ConditionId }>;

export type YearEvent = readonly [when: string, text: string];

// What a verdict is worth for one supplier. `text` ties it to the evidence; `events` is the year
// that follows if this supplier is the preferred one (falls back to `text`).
export type Opt = Readonly<{ grade: Grade; text: string; events?: readonly YearEvent[] }>;

export type Section = "questionnaire" | "audit" | "breach" | "access" | "subs" | "contract";

export const SECTIONS: readonly Readonly<{ id: Section; name: string }>[] = [
  { id: "access", name: "Data and access" },
  { id: "questionnaire", name: "Security questionnaire" },
  { id: "audit", name: "Audit report" },
  { id: "breach", name: "Breach history" },
  { id: "subs", name: "Subcontractors" },
  { id: "contract", name: "Contract terms" },
];

export type Fact = Readonly<{ id: string; section: Section; text: string; key?: boolean }>;
export type FollowUp = Readonly<{ id: string; question: string; answer: string; key?: boolean }>;

export type Supplier = Readonly<{
  id: string;
  name: string;
  domain: string;
  price: number; // per year
  badge: string | null; // marketing badge on the bid; never evidence by itself
  // Why the tempting reading is wrong (learning evidence only).
  trap?: "unverifiable" | "badge" | "overaccess";
  handledBreach?: boolean; // disclosed a past breach that was handled well
  coach?: string; // guided purchase only: what to look at, never which button
  facts: readonly Fact[];
  followUps: readonly FollowUp[];
  approve: Opt;
  reject: Opt;
  conditions: Readonly<Partial<Record<ConditionId, Opt>>>;
  otherCondition: Opt; // any condition not listed above
}>;

export type Purchase = Readonly<{
  id: string;
  title: string;
  need: string;
  data: string;
  access: string;
  tier: "low" | "high";
  tierWhy: string;
  hints: "full" | "light" | "none";
  hint?: string;
  questions: number; // follow-up questions for the whole purchase
  suppliers: readonly Supplier[];
  unmet: readonly YearEvent[]; // the year if nobody is signed
}>;

export type Round = {
  asked: string[]; // "supplierId/followUpId"
  flags: Record<string, string[]>; // supplier id -> fact ids ("fu:<id>" for a follow-up answer)
  verdicts: Record<string, Verdict>;
  preferred: string | null;
  signed: boolean;
};

export type Phase = "review" | "year" | "done";

export type GameState = { purchases: readonly Purchase[]; index: number; phase: Phase; rounds: Round[] };

export const MAX_FLAGS = 3;
export const VERDICT_POINTS: Readonly<Record<Grade, number>> = { best: 15, ok: 7, poor: 0 };
export const OUTCOME_POINTS: Readonly<Record<Grade, number>> = { best: 55, ok: 25, poor: 0 };
export const PURCHASE_MAX = 3 * VERDICT_POINTS.best + OUTCOME_POINTS.best; // 100
// Pass: score at or above the mark AND every business need met.
export const THRESHOLDS = { score: 70, shortcutCeiling: 50 } as const;

const emptyRound = (): Round => ({ asked: [], flags: {}, verdicts: {}, preferred: null, signed: false });

export function createGame(purchases: readonly Purchase[]): GameState {
  return { purchases, index: 0, phase: "review", rounds: purchases.map(emptyRound) };
}

export const currentPurchase = (state: GameState): Purchase => state.purchases[state.index];
export const currentRound = (state: GameState): Round => state.rounds[state.index];

export function supplierById(purchase: Purchase, id: string): Supplier {
  const found = purchase.suppliers.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown supplier ${id}`);
  return found;
}

export function verdictKey(verdict: Verdict): string {
  return verdict.kind === "conditions" ? `c:${verdict.condition}` : verdict.kind;
}

export function verdictName(verdict: Verdict): string {
  if (verdict.kind === "approve") return "Approve";
  if (verdict.kind === "reject") return "Reject";
  return `Approve with condition: ${CONDITIONS.find((entry) => entry.id === verdict.condition)!.name.toLowerCase()}`;
}

export function optionFor(supplier: Supplier, verdict: Verdict): Opt {
  if (verdict.kind === "approve") return supplier.approve;
  if (verdict.kind === "reject") return supplier.reject;
  return supplier.conditions[verdict.condition] ?? supplier.otherCondition;
}

export const ALL_VERDICTS: readonly Verdict[] = [
  { kind: "approve" },
  ...CONDITIONS.map((entry) => ({ kind: "conditions", condition: entry.id }) as const),
  { kind: "reject" },
];

export function bestVerdict(supplier: Supplier): Verdict {
  return ALL_VERDICTS.find((verdict) => optionFor(supplier, verdict).grade === "best")!;
}

// ---- review phase ----
const reviewing = (state: GameState) => state.phase === "review";

export function questionsLeft(state: GameState): number {
  return currentPurchase(state).questions - currentRound(state).asked.length;
}

export function isAsked(round: Round, supplierId: string, followUpId: string): boolean {
  return round.asked.includes(`${supplierId}/${followUpId}`);
}

export function ask(state: GameState, supplierId: string, followUpId: string): FollowUp | null {
  if (!reviewing(state) || questionsLeft(state) <= 0) return null;
  const supplier = supplierById(currentPurchase(state), supplierId);
  const followUp = supplier.followUps.find((entry) => entry.id === followUpId);
  const round = currentRound(state);
  if (!followUp || isAsked(round, supplierId, followUpId)) return null;
  round.asked.push(`${supplierId}/${followUpId}`);
  return followUp;
}

// Everything the learner can currently see and flag for a supplier.
export function visibleEvidence(round: Round, supplier: Supplier): { id: string; text: string; key: boolean }[] {
  return [
    ...supplier.facts.map((fact) => ({ id: fact.id, text: fact.text, key: !!fact.key })),
    ...supplier.followUps.filter((entry) => isAsked(round, supplier.id, entry.id)).map((entry) => ({ id: `fu:${entry.id}`, text: entry.answer, key: !!entry.key })),
  ];
}

// Flag or unflag a piece of evidence. At most MAX_FLAGS per supplier, so flagging everything is
// not an option. Not scored.
export function toggleFlag(state: GameState, supplierId: string, factId: string): boolean {
  if (!reviewing(state)) return false;
  const round = currentRound(state);
  const supplier = supplierById(currentPurchase(state), supplierId);
  if (!visibleEvidence(round, supplier).some((entry) => entry.id === factId)) return false;
  const flags = (round.flags[supplierId] ??= []);
  const at = flags.indexOf(factId);
  if (at >= 0) flags.splice(at, 1);
  else if (flags.length >= MAX_FLAGS) return false;
  else flags.push(factId);
  return true;
}

export function canJudge(state: GameState, supplierId: string): boolean {
  return reviewing(state) && (currentRound(state).flags[supplierId]?.length ?? 0) > 0;
}

// Verdicts can be changed until sign-off: the consequence only shows afterwards.
export function setVerdict(state: GameState, supplierId: string, verdict: Verdict): boolean {
  if (!canJudge(state, supplierId)) return false;
  supplierById(currentPurchase(state), supplierId);
  const round = currentRound(state);
  round.verdicts[supplierId] = verdict;
  if (verdict.kind === "reject" && round.preferred === supplierId) round.preferred = null;
  return true;
}

export function setPreferred(state: GameState, supplierId: string): boolean {
  if (!reviewing(state)) return false;
  const round = currentRound(state);
  const verdict = round.verdicts[supplierId];
  if (!verdict || verdict.kind === "reject") return false;
  round.preferred = supplierId;
  return true;
}

export function signBlockers(state: GameState): string[] {
  if (!reviewing(state)) return ["Not in review."];
  const purchase = currentPurchase(state);
  const round = currentRound(state);
  const blockers: string[] = [];
  for (const supplier of purchase.suppliers) {
    if (!round.verdicts[supplier.id]) blockers.push(`${supplier.name} needs a verdict.`);
  }
  const open = purchase.suppliers.some((supplier) => round.verdicts[supplier.id] && round.verdicts[supplier.id].kind !== "reject");
  if (!blockers.length && open && !round.preferred) blockers.push("Name your preferred supplier.");
  return blockers;
}

export function allRejected(state: GameState): boolean {
  const round = currentRound(state);
  return currentPurchase(state).suppliers.every((supplier) => round.verdicts[supplier.id]?.kind === "reject");
}

export function sign(state: GameState): RoundResult | null {
  if (signBlockers(state).length) return null;
  currentRound(state).signed = true;
  state.phase = "year";
  return roundResult(currentPurchase(state), currentRound(state));
}

export function next(state: GameState): void {
  if (state.phase !== "year") return;
  if (state.index + 1 < state.purchases.length) {
    state.index += 1;
    state.phase = "review";
  } else state.phase = "done";
}

// ---- results ----
export type SupplierResult = Readonly<{ supplier: Supplier; verdict: Verdict | null; grade: Grade; points: number; text: string; best: Verdict; preferred: boolean }>;

export type RoundResult = Readonly<{
  purchase: Purchase;
  suppliers: readonly SupplierResult[];
  verdictPoints: number;
  preferred: Supplier | null;
  outcome: Grade | "unmet";
  outcomePoints: number;
  events: readonly YearEvent[];
  total: number;
}>;

export function roundResult(purchase: Purchase, round: Round): RoundResult {
  const suppliers = purchase.suppliers.map((supplier): SupplierResult => {
    const verdict = round.signed ? (round.verdicts[supplier.id] ?? null) : null;
    const opt = verdict ? optionFor(supplier, verdict) : null;
    const grade = opt?.grade ?? "poor";
    return { supplier, verdict, grade, points: VERDICT_POINTS[grade], text: opt?.text ?? "No verdict given.", best: bestVerdict(supplier), preferred: round.signed && round.preferred === supplier.id };
  });
  const picked = suppliers.find((entry) => entry.preferred && entry.verdict && entry.verdict.kind !== "reject") ?? null;
  const verdictPoints = suppliers.reduce((sum, entry) => sum + entry.points, 0);
  const outcome: Grade | "unmet" = picked ? picked.grade : "unmet";
  const outcomePoints = picked ? OUTCOME_POINTS[picked.grade] : 0;
  const opt = picked ? optionFor(picked.supplier, picked.verdict!) : null;
  const events: readonly YearEvent[] = opt ? (opt.events ?? [["During the year", opt.text]]) : purchase.unmet;
  return { purchase, suppliers, verdictPoints, preferred: picked?.supplier ?? null, outcome, outcomePoints, events, total: verdictPoints + outcomePoints };
}

export type Score = Readonly<{
  rounds: readonly RoundResult[];
  verdicts: number; // 0–45, mean across purchases
  outcomes: number; // 0–55, mean across purchases
  total: number; // 0–100
  needsMet: number;
  passed: boolean;
  reasons: readonly string[];
}>;

export function score(state: GameState): Score {
  const rounds = state.purchases.map((purchase, index) => roundResult(purchase, state.rounds[index]));
  const mean = (pick: (entry: RoundResult) => number) => rounds.reduce((sum, entry) => sum + pick(entry), 0) / rounds.length;
  const total = Math.round(mean((entry) => entry.total));
  const needsMet = rounds.filter((entry) => entry.outcome !== "unmet").length;
  const reasons: string[] = [];
  for (const entry of rounds) if (entry.outcome === "unmet") reasons.push(`${entry.purchase.title}: nobody was signed, so the business need went unmet.`);
  if (total < THRESHOLDS.score) reasons.push(`Score ${total} is below the pass mark of ${THRESHOLDS.score}.`);
  return { rounds, verdicts: Math.round(mean((entry) => entry.verdictPoints)), outcomes: Math.round(mean((entry) => entry.outcomePoints)), total, needsMet, passed: reasons.length === 0, reasons };
}

// Learning evidence: what the run shows about the skill. Reported apart from the score.
export type Learning = Readonly<{
  flags: number;
  flagsOnKey: number; // flags placed on evidence that decides the verdict
  suppliersWithKeyFlag: number;
  suppliers: number;
  followUpsUsed: number;
  followUpsAvailable: number;
  followUpsKey: number; // questions that surfaced a deciding clarification
  heavyOnLowRisk: string[]; // heavyweight condition on a low-risk purchase
  gapsLeftOpen: string[]; // approved outright where one condition was needed
  badgeTrusted: string[]; // accepted a badge whose audit was out of scope, stale or beside the point
  unverifiableTrusted: string[]; // accepted a spotless story nobody could check
  handledBreachRejected: string[]; // rejected a supplier for a breach it handled well
  cheapestPickedPoorly: string[]; // purchases where the cheapest bid was preferred and it went badly
  needsUnmet: string[];
  noHintOutcome: Grade | "unmet" | null; // the final, unguided purchase
}>;

export function learning(state: GameState): Learning {
  const out = {
    flags: 0, flagsOnKey: 0, suppliersWithKeyFlag: 0, suppliers: 0, followUpsUsed: 0, followUpsAvailable: 0, followUpsKey: 0,
    heavyOnLowRisk: [] as string[], gapsLeftOpen: [] as string[], badgeTrusted: [] as string[], unverifiableTrusted: [] as string[],
    handledBreachRejected: [] as string[], cheapestPickedPoorly: [] as string[], needsUnmet: [] as string[], noHintOutcome: null as Grade | "unmet" | null,
  };
  state.purchases.forEach((purchase, index) => {
    const round = state.rounds[index];
    if (!round.signed) return;
    const result = roundResult(purchase, round);
    out.followUpsUsed += round.asked.length;
    out.followUpsAvailable += purchase.questions;
    const cheapest = [...purchase.suppliers].sort((a, b) => a.price - b.price)[0];
    for (const supplier of purchase.suppliers) {
      out.suppliers += 1;
      const evidence = visibleEvidence(round, supplier);
      const flags = round.flags[supplier.id] ?? [];
      const onKey = flags.filter((id) => evidence.find((entry) => entry.id === id)?.key).length;
      out.flags += flags.length;
      out.flagsOnKey += onKey;
      if (onKey) out.suppliersWithKeyFlag += 1;
      out.followUpsKey += supplier.followUps.filter((entry) => entry.key && isAsked(round, supplier.id, entry.id)).length;
      const verdict = round.verdicts[supplier.id];
      if (!verdict) continue;
      const grade = optionFor(supplier, verdict).grade;
      const accepted = verdict.kind !== "reject";
      if (purchase.tier === "low" && verdict.kind === "conditions" && CONDITIONS.find((entry) => entry.id === verdict.condition)!.weight === "heavy") out.heavyOnLowRisk.push(supplier.id);
      if (verdict.kind === "approve" && bestVerdict(supplier).kind === "conditions") out.gapsLeftOpen.push(supplier.id);
      if (accepted && grade === "poor" && (supplier.trap === "badge" || supplier.trap === "overaccess") && supplier.badge) out.badgeTrusted.push(supplier.id);
      if (accepted && grade === "poor" && supplier.trap === "unverifiable") out.unverifiableTrusted.push(supplier.id);
      if (!accepted && supplier.handledBreach) out.handledBreachRejected.push(supplier.id);
    }
    if (result.outcome === "unmet") out.needsUnmet.push(purchase.id);
    if (result.preferred?.id === cheapest.id && result.outcome === "poor") out.cheapestPickedPoorly.push(purchase.id);
    if (purchase.hints === "none") out.noHintOutcome = result.outcome;
  });
  return out;
}

// ---- whole-run strategies (tests, and to check that the shortcuts lose) ----
export type Plan = Readonly<{ verdicts: Readonly<Record<string, Verdict>>; preferred: string | null }>;
export type Strategy = (purchase: Purchase) => Plan;

const APPROVE: Verdict = { kind: "approve" };
const REJECT: Verdict = { kind: "reject" };
const byPrice = (purchase: Purchase) => [...purchase.suppliers].sort((a, b) => a.price - b.price);
const only = (purchase: Purchase, pick: Supplier, verdict: Verdict = APPROVE): Plan => ({
  verdicts: Object.fromEntries(purchase.suppliers.map((entry) => [entry.id, entry.id === pick.id ? verdict : REJECT])),
  preferred: pick.id,
});
const everyone = (purchase: Purchase, verdict: Verdict, preferred: string | null): Plan => ({
  verdicts: Object.fromEntries(purchase.suppliers.map((entry) => [entry.id, verdict])),
  preferred,
});

export const STRATEGIES = {
  // The right verdict for every supplier; prefer the first supplier whose right verdict is not a rejection.
  best: (purchase) => ({
    verdicts: Object.fromEntries(purchase.suppliers.map((entry) => [entry.id, bestVerdict(entry)])),
    preferred: purchase.suppliers.find((entry) => bestVerdict(entry).kind !== "reject")!.id,
  }),
  rejectEveryone: (purchase) => everyone(purchase, REJECT, null),
  cheapest: (purchase) => only(purchase, byPrice(purchase)[0]),
  approveAllPreferCheapest: (purchase) => everyone(purchase, APPROVE, byPrice(purchase)[0].id),
  // Whoever shows a certificate badge (the cheapest of them if several do).
  badge: (purchase) => only(purchase, byPrice(purchase).find((entry) => entry.badge) ?? byPrice(purchase)[0]),
  approveAllPreferBadge: (purchase) => everyone(purchase, APPROVE, (byPrice(purchase).find((entry) => entry.badge) ?? byPrice(purchase)[0]).id),
  // Never touch a supplier that has admitted a breach; take the cheapest "clean" one.
  spotlessOnly: (purchase) => only(purchase, byPrice(purchase).find((entry) => !entry.handledBreach)!),
  // Maximum caution: the heaviest condition on everyone, prefer the dearest bid.
  heavyEverything: (purchase) => everyone(purchase, { kind: "conditions", condition: "onsite" }, byPrice(purchase)[purchase.suppliers.length - 1].id),
  dearest: (purchase) => only(purchase, byPrice(purchase)[purchase.suppliers.length - 1]),
} satisfies Record<string, Strategy>;

export function applyPlan(state: GameState, plan: Plan, flag: (supplier: Supplier) => string = (supplier) => supplier.facts[0].id): void {
  for (const supplier of currentPurchase(state).suppliers) {
    toggleFlag(state, supplier.id, flag(supplier));
    const verdict = plan.verdicts[supplier.id];
    if (verdict) setVerdict(state, supplier.id, verdict);
  }
  if (plan.preferred) setPreferred(state, plan.preferred);
}

export function playAll(purchases: readonly Purchase[], strategy: Strategy, flag?: (supplier: Supplier) => string): GameState {
  const state = createGame(purchases);
  while (state.phase !== "done") {
    applyPlan(state, strategy(currentPurchase(state)), flag);
    if (!sign(state)) throw new Error(`Could not sign ${currentPurchase(state).id}: ${signBlockers(state).join(" ")}`);
    next(state);
  }
  return state;
}
