import { ACTION_COSTS } from "../data/scenario";
import type { GameState, ScoreBreakdown } from "./types";

// The cheapest *good* plan: one route, one inspection, one scoped rule, one backup route.
export const IDEAL_SPEND = ACTION_COSTS.route + ACTION_COSTS.inspect + ACTION_COSTS.rule + ACTION_COSTS.route;

// Game performance only. Learning evidence (checkpoints, final challenge) is
// recorded separately and never folded into this number.
export function calculateScore(state: GameState): ScoreBreakdown {
  let legitTotal = 0;
  let legitDelivered = 0;
  let prohibitedTotal = 0;
  let prohibitedBlocked = 0;
  const rounds = state.roundStats.map((stats, index) => (index === state.round && state.phase !== "roundEnd" && state.phase !== "complete" ? state.stats : stats));
  for (const stats of rounds) {
    if (!stats) continue;
    // Count resolved requests only, so traffic still in flight isn't scored as a miss.
    const resolved = (flow: keyof typeof stats) => stats[flow].delivered + stats[flow].blocked + stats[flow].failed;
    legitTotal += resolved("supplier") + resolved("hrstaff");
    legitDelivered += stats.supplier.delivered + stats.hrstaff.delivered;
    prohibitedTotal += resolved("unknown");
    prohibitedBlocked += stats.unknown.blocked;
  }
  const service = legitTotal ? legitDelivered / legitTotal : 1;
  const security = prohibitedTotal ? prohibitedBlocked / prohibitedTotal : 1;
  const slack = Math.max(1, state.apGranted - IDEAL_SPEND);
  const efficiency = Math.max(0, Math.min(1, 1 - Math.max(0, state.apSpent - IDEAL_SPEND) / slack));
  const total = 0.4 * service + 0.4 * security + 0.2 * efficiency;
  return { service, security, efficiency, total, legitDelivered, legitTotal, prohibitedBlocked, prohibitedTotal };
}
