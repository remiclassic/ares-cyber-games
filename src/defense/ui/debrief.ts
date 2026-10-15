import { $, esc } from "../../ui/dom";
import { control, summarize, technique } from "../sim/engine";
import type { GameState, Summary } from "../sim/types";
import { ICONS } from "./icons";

const OBJECTIVES = [
  "Map controls to the attack stages they actually affect.",
  "Build layers so that no single control failing lets an attack through.",
  "Expect attackers to adapt to visible controls, and plan for their next option.",
  "Know that detection only helps with someone to respond, and that recovery limits damage but does not prevent it.",
  "Weigh security against the friction each control puts on the business.",
];

export function renderDebrief(state: GameState, handlers: { retry: () => void }): Summary {
  const summary = summarize(state.records);
  const scenario = state.scenario;
  const habits: string[] = [];
  const singles = state.records.flatMap((record) =>
    Object.entries(record.resilience)
      .filter(([, value]) => !value.resilient && value.failsWithout)
      .map(([id, value]) => ({ wave: record.waveId, id, without: value.failsWithout! })),
  );
  if (singles.length) {
    const names = singles.map((entry) => control(scenario, entry.without).short).filter((name, index, list) => list.indexOf(name) === index);
    habits.push(`<strong>${singles.length} stop${singles.length > 1 ? "s" : ""} hung on a single control</strong> (${esc(names.join(", "))}). If it fails, nothing behind it holds. Add a layer at a later stage of the same path.`);
  }
  if (summary.unansweredDetections) habits.push(`<strong>${summary.unansweredDetections} alert${summary.unansweredDetections > 1 ? "s" : ""} nobody acted on.</strong> Detection without response is a log entry, not a defence.`);
  const reached = state.records.reduce((sum, record) => sum + record.runs.filter((run) => !run.stopped).length, 0);
  if (reached) habits.push(`<strong>${reached} campaign${reached > 1 ? "s" : ""} reached the crown jewels.</strong> Look at the stage where each one slipped through, and which option the actor switched to.`);
  const overFriction = state.records.filter((record) => record.score.frictionUsed > record.score.frictionAllowance).length;
  if (overFriction) habits.push(`<strong>Over the friction the business accepts in ${overFriction} wave${overFriction > 1 ? "s" : ""}.</strong> Strong controls with high friction get worked around; choose the lighter control that does the same job where one exists.`);
  if (!habits.length) habits.push(`<strong>Layered and lean.</strong> Every stop survived a single control failing, inside the friction the business accepts.`);

  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(scenario.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Defense score ${summary.total}<small>/100</small></h2>
        <p class="muted">Damage taken ${summary.damage} of a possible ${summary.maxDamage}. ${summary.resilient} of ${summary.campaigns} stops were resilient.</p>
      </header>
      <div class="score-grid wide three">
        ${tile("Outcome", summary.outcome, 50, "Damage avoided, footholds included")}
        ${tile("Depth", summary.depth, 25, "Stops that survive any one control failing")}
        ${tile("Friction", summary.friction, 25, "Staying inside what the business accepts")}
      </div>
      <section class="panel">
        <h3>${ICONS.layers}Habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>${ICONS.intel}Wave by wave</h3>
        ${state.records
          .map((record) => {
            const wave = scenario.waves.find((entry) => entry.id === record.waveId)!;
            return `<article class="case-row">
              <header><strong>${esc(wave.title)}</strong><span>${record.score.total}/100 · added ${record.added.length ? esc(record.added.map((id) => control(scenario, id).short).join(", ")) : "nothing"}</span></header>
              <table>
                <thead><tr><th scope="col">Campaign</th><th scope="col">Path taken</th><th scope="col">Result</th><th scope="col">Resilient?</th></tr></thead>
                <tbody>${wave.campaigns
                  .map((campaign, index) => {
                    const run = record.runs[index];
                    const res = record.resilience[campaign.id];
                    const path = run.steps
                      .map((step) =>
                        step.result === "blocked" && step.skipped.length
                          ? `${[...step.skipped, step.technique].map((id) => esc(technique(scenario, id).name)).join(" / ")} <em class="r-blocked">(all blocked)</em>`
                          : `${esc(technique(scenario, step.technique).name)}${step.result === "ran" ? "" : ` <em class="r-${step.result}">(${step.result})</em>`}`,
                      )
                      .join(" → ");
                    return `<tr class="${run.stopped ? "stopped" : "hit"}">
                      <th scope="row">${esc(campaign.name)}</th>
                      <td>${path}</td>
                      <td>${run.stopped ? `Stopped${run.damage ? `, foothold ${run.damage}` : ""}` : `Damage ${run.damage}`}</td>
                      <td>${res.resilient ? "✓ yes" : res.failsWithout ? `✕ fails without ${esc(control(scenario, res.failsWithout).short)}` : "–"}</td></tr>`;
                  })
                  .join("")}</tbody>
              </table>
              ${record.check ? `<p class="check-line">${record.answer?.correct ? "✓" : "✕"} Reasoning check: ${esc(record.check.question)}</p>` : ""}
            </article>`;
          })
          .join("")}
      </section>
      <section class="panel">
        <h3>${ICONS.block}What this practised</h3>
        <ul class="objectives">${OBJECTIVES.map((objective) => `<li>${esc(objective)}</li>`).join("")}</ul>
        <p class="muted small">Reasoning checks: ${summary.checksCorrect} of ${summary.checksTotal} right. Recorded as learning evidence, kept out of the score. Technique names follow MITRE ATT&amp;CK; hover a board cell for the technique id.</p>
      </section>
      <div class="debrief-actions">
        <button class="btn primary" id="retry">${ICONS.retry}Retry: the actors change their preferences</button>
      </div>
      <p class="fineprint">Prototype · Control effects are simplified and pending SME review (docs/design/DEFENSE_IN_DEPTH.md)</p>
    </div>`;
  $("#retry").addEventListener("click", handlers.retry);
  return summary;
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
