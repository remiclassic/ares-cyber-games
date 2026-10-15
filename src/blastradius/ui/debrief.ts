import { $, esc } from "../../ui/dom";
import { summarize } from "../sim/engine";
import type { GameState, Summary } from "../sim/types";
import { DECISIONS } from "./game";
import { ICONS } from "./icons";

const OBJECTIVES = [
  "Scope an incident from aggregate telemetry before acting on it.",
  "Spend expensive host triage where it settles the most.",
  "Balance containment against business continuity, especially for critical services.",
  "Tell proof from a hunch, and say “unknown” when the evidence cannot decide.",
];

export function renderDebrief(state: GameState, handlers: { retry: () => void }): Summary {
  const summary = summarize(state.records);
  const habits: string[] = [];
  if (summary.missedCompromised) habits.push(`<strong>${summary.missedCompromised} compromised host${summary.missedCompromised > 1 ? "s" : ""} left running.</strong> A beaconing host stays useful to the attacker until it is isolated; watching does not stop it.`);
  if (summary.overIsolated) habits.push(`<strong>${summary.overIsolated} clean host${summary.overIsolated > 1 ? "s" : ""} isolated.</strong> Over-containment has a real cost, and a clean critical server taken offline is an outage you caused.`);
  if (summary.unsupported) habits.push(`<strong>${summary.unsupported} decision${summary.unsupported > 1 ? "s" : ""} not backed by evidence.</strong> A right answer reached by guessing will not survive the incident report. Read the sensors and use the counts.`);
  if (!habits.length) habits.push(`<strong>Clean scoping.</strong> Every decision followed from the evidence you gathered.`);
  const minutes = Math.floor(summary.seconds / 60);
  const seconds = summary.seconds % 60;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(state.scenario.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Scope score ${summary.total}<small>/100</small></h2>
        <p class="muted">Decision quality only. Time taken (${minutes}:${String(seconds).padStart(2, "0")}) is shown for reference and never scored.</p>
      </header>
      <div class="score-grid wide">
        ${tile("Containment", summary.containment, 40, "Compromised hosts isolated")}
        ${tile("Continuity", summary.continuity, 30, "Clean hosts kept running, critical ones weighted ×3")}
        ${tile("Evidence", summary.evidence, 20, "Decisions the evidence actually supported")}
        ${tile("Efficiency", summary.efficiency, 10, "Triage time spent where it counted")}
      </div>
      <section class="panel">
        <h3>${ICONS.logic}Habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>${ICONS.radius}Case by case</h3>
        ${state.records
          .map((record) => {
            const def = state.scenario.cases.find((entry) => entry.id === record.caseId)!;
            return `<article class="case-row">
              <header><strong>${esc(def.title)}</strong><span>${record.score.total}/100 · ${record.reads.length}/${def.sensors.length} sensors read · ${record.triages.length} triage${record.triages.length === 1 ? "" : "s"} (best ${record.score.triagesNeeded})</span></header>
              <table>
                <thead><tr><th scope="col">Host</th><th scope="col">Truth</th><th scope="col">Your call</th><th scope="col">Evidence</th><th scope="col">Why</th></tr></thead>
                <tbody>${record.outcomes
                  .map((outcome) => {
                    const host = def.hosts.find((entry) => entry.id === outcome.host)!;
                    return `<tr class="${outcome.verdict}">
                      <th scope="row">${esc(host.label)}${host.weight > 1 ? ` <b class="crit-pill">critical</b>` : ""}</th>
                      <td class="${outcome.truth}">${outcome.truth === "compromised" ? "Compromised" : "Clean"}</td>
                      <td>${outcome.decision === "none" ? "–" : DECISIONS[outcome.decision].label}</td>
                      <td>${outcome.supported ? "✓ supported" : "✕ not supported"}</td>
                      <td>${esc(outcome.why)}</td></tr>`;
                  })
                  .join("")}</tbody>
              </table>
              ${record.check ? `<p class="check-line">${record.answer?.correct ? "✓" : "✕"} Reasoning check: ${esc(record.check.question)}</p>` : ""}
            </article>`;
          })
          .join("")}
      </section>
      <section class="panel">
        <h3>${ICONS.shield}What this practised</h3>
        <ul class="objectives">${OBJECTIVES.map((objective) => `<li>${esc(objective)}</li>`).join("")}</ul>
        <p class="muted small">Reasoning checks: ${summary.checksCorrect} of ${summary.checksTotal} right. Recorded as learning evidence, kept out of the score.</p>
      </section>
      <div class="debrief-actions">
        <button class="btn primary" id="retry">${ICONS.retry}Retry with the other truth</button>
      </div>
      <p class="fineprint">Prototype · Scenario content pending SME review (docs/design/BLAST_RADIUS.md)</p>
    </div>`;
  $("#retry").addEventListener("click", handlers.retry);
  return summary;
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
