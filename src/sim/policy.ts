import type { FlowDef, Rule } from "./types";

// Gateway rule evaluation, kept deliberately simple for beginners and shown
// verbatim in the Policy panel:
//   1. If any DENY rule matches, the request is denied.
//   2. Otherwise, if any ALLOW rule matches, the request is allowed.
//   3. Otherwise it is denied (default deny).
// Every route — including backup routes — passes through this one gateway, so
// the policy follows the traffic whichever path it takes.

export type Decision = Readonly<{ allowed: boolean; ruleId: string | "default" }>;

export function ruleMatches(rule: Omit<Rule, "id">, flow: FlowDef): boolean {
  return (
    (rule.source === "any" || rule.source === flow.id) &&
    (rule.dest === "any" || rule.dest === flow.dest) &&
    (rule.service === "any" || rule.service === flow.service)
  );
}

export function evaluate(rules: readonly Rule[], flow: FlowDef): Decision {
  const deny = rules.find((rule) => rule.action === "deny" && ruleMatches(rule, flow));
  if (deny) return { allowed: false, ruleId: deny.id };
  const allow = rules.find((rule) => rule.action === "allow" && ruleMatches(rule, flow));
  if (allow) return { allowed: true, ruleId: allow.id };
  return { allowed: false, ruleId: "default" };
}

// How many fields a rule pins down. A rule with all three set is fully scoped.
export function ruleSpecificity(rule: Omit<Rule, "id">): number {
  return (rule.source !== "any" ? 1 : 0) + (rule.dest !== "any" ? 1 : 0) + (rule.service !== "any" ? 1 : 0);
}

export type PolicyImpact = Readonly<{
  legitBlocked: FlowDef[];
  prohibitedAllowed: FlowDef[];
}>;

export function policyImpact(rules: readonly Rule[], flows: readonly FlowDef[]): PolicyImpact {
  const legitBlocked: FlowDef[] = [];
  const prohibitedAllowed: FlowDef[] = [];
  for (const flow of flows) {
    const decision = evaluate(rules, flow);
    if (flow.permitted && !decision.allowed) legitBlocked.push(flow);
    if (!flow.permitted && decision.allowed) prohibitedAllowed.push(flow);
  }
  return { legitBlocked, prohibitedAllowed };
}
