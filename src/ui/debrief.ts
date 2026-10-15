import { buildRounds } from "../data/scenario";
import { COURSE_CONTEXT } from "../integration/course";
import type { AresHost, PracticeResult } from "../integration/host";
import { drawScene } from "../render/renderer";
import { createReplay } from "../sim/engine";
import { describeRule } from "../sim/explain";
import { calculateScore } from "../sim/scoring";
import type { Command, GameState, RecordedCommand, RoundResult } from "../sim/types";
import { $, esc, pct, type Settings } from "./dom";
import type { RunSummary } from "./game";

type Decision = Readonly<{
  round: number;
  attempt: number;
  step: number;
  choice: string;
  result: RoundResult;
}>;

type Concept = "dependency" | "overbroad" | "permissive" | "availability" | "trust" | "segmentation";

const CONCEPT_TEXT: Record<Concept, string> = {
  dependency: "Service dependencies — before connecting a service, check what it needs to work. Finance needs the Core server's database over an internal link.",
  overbroad: "Scoping access rules — match the specific source and service the policy forbids, so approved work keeps flowing.",
  permissive: "Evidence-based filtering — inspect unfamiliar traffic, compare it with the policy, and deny what the policy prohibits.",
  availability: "Availability planning — when a link fails, trace the path a request needs and restore exactly that path.",
  trust: "Backup routes and trust — a new path doesn't make traffic trustworthy; the same policy must apply on every route.",
  segmentation: "Segmentation — the next scenario introduces zone boundaries that limit what can talk to what.",
};

function describeCommand(command: Command, state: GameState): string | null {
  const rounds = buildRounds(state.variant);
  const route = (id: string) => rounds.flatMap((round) => round.candidates).find((item) => item.id === id)?.label ?? id;
  switch (command.type) {
    case "addRule":
      return `Applied rule ${describeRule(command.rule, { variant: state.variant })}`;
    case "reviseRule": {
      if (!command.rule) return command.ruleId === "legacy" ? "Removed the legacy allow-all rule" : "Removed a rule";
      return `Revised a rule to ${describeRule(command.rule, { variant: state.variant })}`;
    }
    case "addRoute":
      return `Built ${route(command.routeId)}`;
    case "removeRoute":
      return `Removed ${route(command.routeId)}`;
    default:
      return null;
  }
}

export function collectDecisions(state: GameState): Decision[] {
  const byAttempt = new Map<string, RecordedCommand[]>();
  for (const entry of state.log) {
    const key = `${entry.round}:${entry.attempt}`;
    byAttempt.set(key, [...(byAttempt.get(key) ?? []), entry]);
  }
  const decisions: (Decision & { priority: number })[] = [];
  for (const result of state.results) {
    const entries = byAttempt.get(`${result.round}:${result.attempt}`) ?? [];
    const config = entries.filter((entry) => describeCommand(entry.c, state));
    const choice = config.length
      ? config.map((entry) => describeCommand(entry.c, state)).join("; ")
      : "Launched without changing the network";
    const step = config.length ? config[0].t : 0;
    if (!config.length && result.outcome === "success") continue;
    decisions.push({
      round: result.round,
      attempt: result.attempt,
      step,
      choice,
      result,
      priority: result.outcome === "success" ? 1 : 0,
    });
  }
  // Mistakes first (they carry the most learning), one per round where possible.
  const picked: typeof decisions = [];
  const sorted = [...decisions].sort((a, b) => a.priority - b.priority || a.round - b.round);
  for (const decision of sorted) {
    if (picked.length >= 3) break;
    if (picked.some((item) => item.round === decision.round) && sorted.some((d) => !picked.includes(d) && !picked.some((p) => p.round === d.round))) continue;
    picked.push(decision);
  }
  for (const decision of sorted) {
    if (picked.length >= 3) break;
    if (!picked.includes(decision)) picked.push(decision);
  }
  return picked.sort((a, b) => a.round - b.round || a.attempt - b.attempt);
}

function analyse(summary: RunSummary) {
  const { state } = summary;
  const mistakes = new Set<Concept>();
  for (const result of state.results) {
    const text = result.explanations.join(" ");
    if (/database on the Core/.test(text) && result.outcome !== "success") mistakes.add("dependency");
    if (/also blocked|blocked all external|default deny/.test(text)) mistakes.add("overbroad");
    if (result.stats.unknown.delivered > 0) mistakes.add("permissive");
    if (result.round === 2 && result.outcome !== "success" && /offline|didn't bypass|arrived late/.test(text)) mistakes.add("availability");
  }
  if (summary.checkpoints["backup-reason"] && !summary.checkpoints["backup-reason"].correct) mistakes.add("trust");
  if (summary.checkpoints["rule-reason"] && !summary.checkpoints["rule-reason"].correct) mistakes.add("overbroad");

  const r2 = state.results.filter((r) => r.round === 1);
  const r3 = state.results.filter((r) => r.round === 2);
  const r2Log = state.log.filter((entry) => entry.round === 1);
  const firstInspect = r2Log.findIndex((entry) => entry.c.type === "inspect");
  const firstRule = r2Log.findIndex((entry) => entry.c.type === "addRule" || entry.c.type === "reviseRule");

  const badges: { icon: string; name: string; why: string }[] = [];
  if (firstInspect >= 0 && (firstRule < 0 || firstInspect < firstRule))
    badges.push({ icon: "🔍", name: "Investigator", why: "Inspected evidence before writing a rule." });
  const finalR2 = r2[r2.length - 1];
  if (finalR2?.outcome === "success" && finalR2.stats.supplier.blocked + finalR2.stats.hrstaff.blocked === 0)
    badges.push({ icon: "🎯", name: "Scoped Defender", why: "Denied prohibited access without blocking approved work." });
  if (r3[0]?.outcome === "success") badges.push({ icon: "🛟", name: "Resilient", why: "Restored Finance on the first try with policy intact." });
  if (state.setbacks > 0) badges.push({ icon: "↺", name: "Comeback", why: "Recovered from a setback and finished the scenario." });

  const strength =
    badges.find((b) => b.name === "Scoped Defender")
      ? "Scoped filtering — you denied the prohibited access while approved suppliers and staff kept working."
      : badges.find((b) => b.name === "Resilient")
        ? "Recovering safely — you restored Finance without weakening your access rules."
        : badges.find((b) => b.name === "Investigator")
          ? "Investigating before deciding — you looked at the evidence before acting."
          : "Persistence — you revised your decisions after seeing their consequences.";

  const order: Concept[] = ["dependency", "permissive", "overbroad", "availability", "trust"];
  let practice: Concept = order.find((concept) => mistakes.has(concept)) ?? "segmentation";
  if (practice === "segmentation" && summary.finalChallenge && !summary.finalChallenge.correct) practice = "overbroad";
  return { badges, strength, practice: CONCEPT_TEXT[practice] };
}

export function renderDebrief(
  summary: RunSummary,
  settings: Settings,
  host: AresHost,
  actions: { retry: () => void },
): () => void {
  const { state } = summary;
  const score = calculateScore(state);
  const decisions = collectDecisions(state);
  const { badges, strength, practice } = analyse(summary);
  const rounds = buildRounds(state.variant);

  const result: PracticeResult = {
    activityId: COURSE_CONTEXT.activityId,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - summary.startedAt) / 1000),
    seed: state.seed,
    score,
    setbacks: state.setbacks,
    learningEvidence: { checkpoints: summary.checkpoints, finalChallenge: summary.finalChallenge },
    decisions: decisions.map((d) => d.choice),
  };
  host.record({ verb: "completed", object: "scenario", result: { total: score.total } });
  host.complete(result);

  const checkpointLine = (id: string, label: string) => {
    const answer = summary.checkpoints[id];
    return answer ? `<li>${label}: ${answer.correct ? "✓ strong reasoning" : "revisit — see feedback"}</li>` : "";
  };

  const root = $("#debrief");
  root.innerHTML = `
    <div class="course-top"><div class="brand">CYBER RANGE<span> ·</span> NETWORK DEFENSE</div>${COURSE_CONTEXT.mock ? `<span class="mock-flag">MOCK COURSE CONTEXT</span>` : ""}</div>
    <div class="debrief-body">
      <div class="tag">Debrief · Keep Finance Online</div>
      <h1 id="debrief-title" tabindex="-1">Practice complete</h1>
      <p class="muted">Completion recorded. Game performance and learning evidence are reported separately.</p>
      <div class="score-row">
        <div class="score-tile"><div class="k">Service delivery · 40%</div><div class="v">${pct(score.service)}</div><div class="s">${score.legitDelivered} of ${score.legitTotal} approved requests delivered</div></div>
        <div class="score-tile"><div class="k">Prohibited activity · 40%</div><div class="v">${pct(score.security)}</div><div class="s">${score.prohibitedBlocked} of ${score.prohibitedTotal} denied</div></div>
        <div class="score-tile"><div class="k">Efficiency · 20%</div><div class="v">${pct(score.efficiency)}</div><div class="s">${state.apSpent} AP spent</div></div>
        <div class="score-tile"><div class="k">Game score</div><div class="v">${pct(score.total)}</div><div class="s">${state.setbacks} setback${state.setbacks === 1 ? "" : "s"}</div></div>
      </div>
      ${badges.length ? `<div class="badges" aria-label="Badges earned">${badges.map((b) => `<span class="badge-chip" title="${esc(b.why)}">${b.icon} ${esc(b.name)}</span>`).join("")}</div>` : ""}

      <h2>Decision replay</h2>
      ${decisions
        .map(
          (decision, index) => `
        <article class="decision" aria-label="Decision ${index + 1}">
          <div><canvas data-replay="${index}" aria-label="Replay of ${esc(rounds[decision.round].title)}"></canvas>
          <div class="hint" style="margin-top:6px">${esc(rounds[decision.round].title)}${decision.attempt ? ` · attempt ${decision.attempt + 1}` : ""} — replay</div></div>
          <dl>
            <dt>Your choice</dt><dd>${esc(decision.choice)}</dd>
            <dt>Observed result</dt><dd><span class="outcome ${decision.result.outcome}">${decision.result.outcome === "success" ? "✓" : "↺"} ${esc(decision.result.headline)}</span>
              <div class="hint">Invoices ${decision.result.stats.supplier.delivered}/${decision.result.stats.supplier.total} · HR ${decision.result.stats.hrstaff.delivered}/${decision.result.stats.hrstaff.total}${decision.result.stats.unknown.total ? ` · prohibited denied ${decision.result.stats.unknown.blocked}/${decision.result.stats.unknown.total}` : ""}</div></dd>
            <dt>Why</dt><dd>${esc(decision.result.explanations[0])}</dd>
            <dt>Mission connection</dt><dd>${esc(COURSE_CONTEXT.missionConnections[rounds[decision.round].id])}</dd>
          </dl>
        </article>`,
        )
        .join("")}

      <div class="two-col">
        <div class="card"><h3 style="margin-top:0">💪 Demonstrated strength</h3><p>${esc(strength)}</p></div>
        <div class="card"><h3 style="margin-top:0">🎯 Concept to practice</h3><p>${esc(practice)}</p></div>
      </div>
      <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Learning evidence</h3>
        <ul class="policy">
          ${checkpointLine("rule-reason", "Reasoning checkpoint — scoped rules")}
          ${checkpointLine("backup-reason", "Reasoning checkpoint — backup routes and policy")}
          ${summary.finalChallenge ? `<li>Final challenge (no hints): ${summary.finalChallenge.correct ? "✓ applied correctly" : "not yet — review scoped rules"}</li>` : ""}
        </ul>
        <p class="hint">Mastery criteria for ${esc(COURSE_CONTEXT.moduleTitle)} are to be agreed with SMEs; this record is evidence, not a grade.</p>
      </div>
      <div class="final-actions">
        <button class="btn" data-debrief="retry">↺ Retry practice</button>
        <button class="btn" data-debrief="study">📘 Review study material</button>
        <button class="btn primary" data-debrief="mission">Continue to mission →</button>
      </div>
    </div>`;

  root.querySelector("[data-debrief='retry']")!.addEventListener("click", actions.retry);
  root.querySelector("[data-debrief='study']")!.addEventListener("click", () => host.navigate("study"));
  root.querySelector("[data-debrief='mission']")!.addEventListener("click", () => host.navigate("mission"));

  // Mini replays rebuilt from the seed + command log.
  let alive = true;
  const players = decisions.map((decision, index) => {
    const canvas = root.querySelector<HTMLCanvasElement>(`[data-replay='${index}']`)!;
    const startStep = Math.max(0, decision.step - 6);
    const make = () => {
      const replay = createReplay(state, decision.round, decision.attempt)!;
      let guard = 0;
      while (replay.state.steps < startStep && replay.state.phase !== "roundEnd" && guard++ < 5000) replay.advance();
      return replay;
    };
    let replay = make();
    let frames = 0;
    if (settings.reducedMotion) {
      for (let i = 0; i < 150; i += 1) replay.advance();
    }
    return {
      tick() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(rect.width * dpr)) {
          canvas.width = Math.round(rect.width * dpr);
          canvas.height = Math.round(rect.height * dpr);
        }
        if (!settings.reducedMotion) {
          frames += 1;
          if (frames % 2 === 0) replay.advance();
          if (frames > 520 || replay.state.phase === "roundEnd") {
            replay = make();
            frames = 0;
          }
        }
        drawScene(canvas.getContext("2d")!, replay.state, {
          width: rect.width,
          height: rect.height,
          dpr,
          time: performance.now(),
          alpha: 0,
          reducedMotion: settings.reducedMotion,
          selectedNode: null,
          candidates: [],
          hoverCandidate: null,
          focusFlow: null,
          compact: true,
        });
      },
    };
  });
  const loop = () => {
    if (!alive) return;
    players.forEach((player) => player.tick());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => {
    alive = false;
  };
}
