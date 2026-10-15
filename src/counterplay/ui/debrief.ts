import { $, esc } from "../../ui/dom";
import { card, summarize, techniqueOf } from "../sim/engine";
import type { GameState, Summary } from "../sim/types";
import { FIT_LABEL } from "./game";
import { ICONS } from "./icons";

const OBJECTIVES = [
  "Read raw telemetry and recognise the attacker technique behind it.",
  "Tell a technique from the benign activity that looks like it.",
  "Choose the response that actually removes the actor's capability, not just one that sounds related.",
  "Know which responses only partly help: blocking a sender after delivery, resetting a password while an app grant or session survives.",
  "Spend limited response capacity where it matters most.",
];

export function renderDebrief(state: GameState, handlers: { retry: () => void }): Summary {
  const summary = summarize(state.records);
  const scenario = state.scenario;
  const confusions = state.records.flatMap((record) => {
    const incident = scenario.incidents.find((entry) => entry.id === record.incidentId)!;
    return record.hands
      .filter((hand) => hand.identified !== techniqueOf(incident, hand.technique).name)
      .map((hand) => ({ actual: techniqueOf(incident, hand.technique).name, named: hand.identified ?? "" }));
  });
  const partialsWhenCounter = state.records.flatMap((record) => record.hands.filter((hand) => hand.fit === "partial" && hand.bestAvailable === "counter"));
  const habits: string[] = [];
  if (confusions.length)
    habits.push(`<strong>Look-alikes caught you ${confusions.length} time${confusions.length > 1 ? "s" : ""}:</strong> ${confusions.slice(0, 3).map((entry) => `${esc(entry.actual)} read as “${esc(entry.named)}”`).join("; ")}${confusions.length > 3 ? `; and ${confusions.length - 3} more in the table below` : ""}. Go back to the field that gives it away (who, from where, how often, and what changed).`);
  if (partialsWhenCounter.length)
    habits.push(`<strong>${partialsWhenCounter.length} partial fix${partialsWhenCounter.length > 1 ? "es" : ""} while a counter was in hand.</strong> A related action is not the same as removing the capability the actor just used.`);
  if (summary.evicted < summary.incidents) habits.push(`<strong>${summary.incidents - summary.evicted} incident${summary.incidents - summary.evicted > 1 ? "s" : ""} not won.</strong> Each miss handed the actor a step toward their objective.`);
  if (!habits.length) habits.push(`<strong>Clean reads, clean responses.</strong> You named every technique and played the card that removed it.`);

  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(scenario.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Response score ${summary.total}<small>/100</small></h2>
        <p class="muted">${summary.identifiedRight} of ${summary.handsPlayed} techniques named from telemetry · ${summary.bestPlays} of ${summary.handsPlayed} best plays · ${summary.evicted} of ${summary.incidents} incidents won.</p>
      </header>
      <div class="score-grid wide three">
        ${tile("Named it", summary.identify, 30, "Technique recognised from the telemetry")}
        ${tile("Response", summary.response, 40, "Best card with what you had left")}
        ${tile("Outcome", summary.outcome, 30, "Incidents where you reached three first")}
      </div>
      <section class="panel">
        <h3>${ICONS.eye}Habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>${ICONS.log}Incident by incident</h3>
        ${state.records
          .map((record) => {
            const incident = scenario.incidents.find((entry) => entry.id === record.incidentId)!;
            return `<article class="case-row">
              <header><strong>${esc(incident.title)}</strong><span>${record.score.total}/100 · ${record.score.defender}–${record.score.attacker} · ${record.score.result}</span></header>
              <table>
                <thead><tr><th scope="col">Telemetry showed</th><th scope="col">You named</th><th scope="col">You played</th><th scope="col">Result</th><th scope="col">Best card</th></tr></thead>
                <tbody>${record.hands
                  .map((hand) => {
                    const tech = techniqueOf(incident, hand.technique);
                    return `<tr class="fit-${hand.fit}">
                      <th scope="row">${esc(tech.name)} <span class="attack">${esc(tech.attack)}</span></th>
                      <td>${hand.identified === tech.name ? "✓" : `✕ ${esc(hand.identified ?? "")}`}</td>
                      <td>${esc(card(scenario, hand.card!).name)}</td>
                      <td>${FIT_LABEL[hand.fit!]}</td>
                      <td>${tech.counters.map((id) => esc(card(scenario, id).name)).join(" or ")}</td></tr>`;
                  })
                  .join("")}</tbody>
              </table>
            </article>`;
          })
          .join("")}
      </section>
      <section class="panel">
        <h3>${ICONS.shield}What this practised</h3>
        <ul class="objectives">${OBJECTIVES.map((objective) => `<li>${esc(objective)}</li>`).join("")}</ul>
        <p class="muted small">Technique ids follow MITRE ATT&amp;CK. Telemetry is fictional and simplified.</p>
      </section>
      <div class="debrief-actions">
        <button class="btn primary" id="retry">${ICONS.retry}Retry: new telemetry values</button>
      </div>
      <p class="fineprint">Prototype · Content pending SME review (docs/design/COUNTERPLAY.md)</p>
    </div>`;
  $("#retry").addEventListener("click", handlers.retry);
  return summary;
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
