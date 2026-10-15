// Chain Breaker rules. Pure: no DOM.
import { INCIDENTS, STAGES, type Break, type Incident } from "./data";

export type Round = {
  incident: Incident;
  deck: string[]; // card ids still to place, top first
  placed: Record<number, string>; // stage -> card id
  mistakes: number;
  breakChoice: string | null;
};

export function shuffled(ids: readonly string[], seed: number): string[] {
  const out = [...ids];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newRound(index: number, seed: number): Round {
  const incident = INCIDENTS[index];
  return { incident, deck: shuffled(incident.cards.map((c) => c.id), seed + index * 97), placed: {}, mistakes: 0, breakChoice: null };
}

export function place(round: Round, stage: number): { ok: boolean; why: string } {
  const card = round.incident.cards.find((c) => c.id === round.deck[0])!;
  if (card.stage === stage) {
    round.placed[stage] = card.id;
    round.deck.shift();
    return { ok: true, why: `${STAGES[stage]}.` };
  }
  round.mistakes += 1;
  const hint = stage < card.stage ? "later in the chain" : "earlier in the chain";
  return { ok: false, why: `Not ${STAGES[stage]}: this step happens ${hint}.` };
}

// Put the top card back under the deck (patience-style).
export function pass(round: Round): void {
  if (round.deck.length > 1) round.deck.push(round.deck.shift()!);
}

export function earliestBreak(incident: Incident): Break {
  return [...incident.breaks].filter((b) => b.stage !== null).sort((a, b) => a.stage! - b.stage!)[0];
}

// Placement: 10 per card, minus 3 per mistake (min 0). Break: 30 for the earliest valid
// break, 15 for a later valid one, 0 for one that breaks nothing.
export function score(round: Round): { placement: number; break: number; total: number } {
  const placement = Math.max(0, 70 - round.mistakes * 3);
  const chosen = round.incident.breaks.find((b) => b.id === round.breakChoice);
  const best = earliestBreak(round.incident);
  const brk = !chosen || chosen.stage === null ? 0 : chosen.id === best.id ? 30 : 15;
  return { placement, break: brk, total: placement + brk };
}
