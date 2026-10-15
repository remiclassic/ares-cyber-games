import { buildFlows, serviceLabel } from "../data/scenario";
import { evaluate, ruleSpecificity } from "./policy";
import type { FlowDef, GameState, Rule, RoundResult, SourceId } from "./types";

const DEST_LABEL = { finance: "Finance", hr: "HR" } as const;

// Before a source is inspected the learner only knows its address, so UI callers
// pass `inspected`; post-round explanations reveal identities.
export function describeRule(
  rule: Omit<Rule, "id">,
  state: Pick<GameState, "variant"> & { inspected?: readonly SourceId[] },
): string {
  const flows = buildFlows(state.variant);
  const known = !state.inspected || rule.source === "any" || state.inspected.includes(rule.source);
  const source = rule.source === "any" ? "Any source" : known ? flows[rule.source].label : flows[rule.source].address;
  const dest = rule.dest === "any" ? "Any destination" : DEST_LABEL[rule.dest];
  const service = rule.service === "any" ? "Any" : serviceLabel(rule.service, state.variant).replace(/ \(.*\)$/, "");
  return `${rule.action.toUpperCase()} ${source} → ${dest} : ${service}`;
}

function ruleById(state: GameState, id: string | undefined): Rule | undefined {
  return state.rules.find((rule) => rule.id === id);
}

function blockedLegitLines(state: GameState, flows: Record<SourceId, FlowDef>, present: readonly SourceId[]): string[] {
  const lines: string[] = [];
  const blockedBy = new Map<string, FlowDef[]>();
  for (const id of present) {
    const flow = flows[id];
    if (!flow.permitted || state.stats[id].blocked === 0) continue;
    const decision = evaluate(state.rules, flow);
    const key = decision.ruleId;
    blockedBy.set(key, [...(blockedBy.get(key) ?? []), flow]);
  }
  for (const [ruleId, victims] of blockedBy) {
    const names = victims.map((flow) => flow.label).join(" and ");
    if (ruleId === "default") {
      lines.push(
        `${names} hit the gateway's default deny — no rule allows them anymore. Removing the legacy allow-all rule without adding allow rules for approved work cuts it off.`,
      );
      continue;
    }
    const rule = ruleById(state, ruleId);
    if (!rule) continue;
    if (ruleSpecificity(rule) === 0) {
      lines.push(
        `You blocked all external access ("${describeRule(rule, { variant: state.variant })}"). Unauthorized requests stopped, but ${names} also failed. A scoped rule would preserve the required service while denying the prohibited access.`,
      );
    } else {
      lines.push(
        `Your rule "${describeRule(rule, { variant: state.variant })}" also blocked ${names}, which the policy approves. Narrow the rule to the source and service the policy forbids.`,
      );
    }
  }
  return lines;
}

function prohibitedLines(state: GameState, flows: Record<SourceId, FlowDef>): string[] {
  const unknown = flows.unknown;
  const count = state.stats.unknown.delivered;
  if (count === 0) return [];
  const lines = [
    `${unknown.label} ${unknown.address} reached Finance's ${serviceLabel("admin", state.variant)} ${count} time${count === 1 ? "" : "s"}. The policy only permits admin consoles from inside the network.`,
  ];
  const denies = state.rules.filter((rule) => rule.action === "deny");
  const allows = state.rules.filter((rule) => rule.action === "allow");
  if (denies.length === 0 && allows.some((rule) => rule.id !== "legacy")) {
    lines.push(
      "Adding an ALLOW rule doesn't stop anything while the legacy allow-all rule is in place. Prohibited access needs a DENY rule (or removing the allow-all).",
    );
  } else if (denies.length > 0) {
    lines.push("Your DENY rule didn't match this traffic. Check its source, destination, and service against the evidence.");
  }
  return lines;
}

export function explainRound(state: GameState, outcome: RoundResult["outcome"]): { headline: string; explanations: string[] } {
  const flows = buildFlows(state.variant);
  const s = state.stats;
  const explanations: string[] = [];
  const roundId = ["establish", "review", "recover"][state.round];
  const present: SourceId[] = state.round === 0 ? ["supplier", "hrstaff"] : ["supplier", "hrstaff", "unknown"];
  const supplierLost = s.supplier.total - s.supplier.delivered;
  const dependencyFailures = state.tokens.filter((t) => t.flow === "supplier" && t.reason === "dependency").length;
  const stuck = state.tokens.filter((t) => t.permitted && t.reason === "stuck").length;
  const bypass = state.builtRoutes.includes("gateway-finance");

  if (roundId === "establish") {
    if (dependencyFailures > 0) {
      explanations.push(
        "You connected Finance straight to the Gateway. Invoices reached Finance, but Finance couldn't reach its database on the Core server, so each one failed. Services depend on other services — a path from the internet isn't enough.",
      );
    } else if (stuck > 0) {
      explanations.push("No working connection reached Finance, so invoices queued and were never delivered.");
    }
    explanations.push(...blockedLegitLines(state, flows, present));
    if (outcome === "success") {
      explanations.unshift(
        "Finance reached its database on the Core server through an internal link, so every invoice could be processed.",
      );
      if (bypass) {
        explanations.push(
          "Note: the extra Gateway → Finance link is now the shortest path, so Finance traffic skips the Inspection Point. You can remove it with Revise.",
        );
      }
    }
  } else if (roundId === "review") {
    explanations.push(...prohibitedLines(state, flows));
    explanations.push(...blockedLegitLines(state, flows, present));
    if (outcome === "success") {
      const deny = state.rules.find((rule) => rule.action === "deny" && !evaluate([rule], flows.unknown).allowed && rule.id !== "legacy");
      explanations.unshift(
        deny
          ? `"${describeRule(deny, { variant: state.variant })}" denied the unrecognized host while Northwind Supply and HR staff kept working.`
          : "The unrecognized host was denied while approved work kept flowing.",
      );
    }
  } else {
    const failed = state.variant.failLink === "core-finance" ? "Core–Finance" : "Inspection–Core";
    if (supplierLost > 0 && (stuck > 0 || dependencyFailures > 0)) {
      const usefulBackup = state.builtRoutes.some((id) => id === "backup-core-finance" || id === "backup-inspect-core");
      explanations.push(
        usefulBackup
          ? `The backup route arrived late, so ${supplierLost} invoice${supplierLost === 1 ? " was" : "s were"} lost while Finance was unreachable.`
          : state.builtRoutes.some((id) => id.startsWith("backup-"))
            ? `The route you added didn't bypass the failed ${failed} link, so Finance stayed unreachable. Trace the path invoices need: Internet → Gateway → Inspection → Core → Finance.`
            : `Finance stayed offline after the ${failed} link failed. Without an alternate path, queued invoices were lost.`,
      );
    }
    explanations.push(...prohibitedLines(state, flows));
    explanations.push(...blockedLegitLines(state, flows, present));
    if (outcome === "success") {
      explanations.unshift(
        s.unknown.blocked > 0
          ? "The backup route restored Finance, and the unrecognized host was still denied on the new path — the gateway's rules apply to every route."
          : "The backup route restored Finance while your access rules stayed in force.",
      );
    }
  }

  const headline =
    outcome === "success"
      ? ["Finance is online", "Approved work protected", "Service restored safely"][state.round]
      : outcome === "setback"
        ? "Recoverable setback"
        : "Failure limit reached";

  if (explanations.length === 0) {
    explanations.push(outcome === "success" ? "Objective met." : "The round objective wasn't met. Review the board and try a different approach.");
  }
  return { headline, explanations };
}
