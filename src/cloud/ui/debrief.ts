import { $, esc } from "../../ui/dom";
import { num } from "../sim/explain";
import type { GameState, NavigationReport, Summary } from "../sim/types";
import { ICONS } from "./icons";

const RATING: Record<Summary["rating"], { title: string; text: string }> = {
  "objectives-met": { title: "Mission objectives met", text: "Every checkpoint ended available, within policy and within its cost ceiling." },
  "objectives-partly-met": { title: "Some objectives were missed", text: "At least one checkpoint ended short on availability, policy or cost. The steps below show where." },
  "security-objective-failed": { title: "Security objective not met", text: "The access review ended with the account still holding permissions beyond its stated task." },
};

const bar = (label: string, value: number) =>
  `<div class="bar"><span>${esc(label)}</span><i><b style="width:${Math.round(value * 100)}%"></b></i><strong>${Math.round(value * 100)}%</strong></div>`;
const flag = (ok: boolean, label: string) => `<span class="badge ${ok ? "good" : "bad"}">${ok ? ICONS.check : ICONS.cross}${esc(label)}</span>`;

// Per checkpoint: evidence → chosen change → observed consequence → better alternative → course connection.
export function renderDebrief(state: GameState, summary: Summary, navigation: NavigationReport, handlers: { retry: () => void }): void {
  const mission = state.mission;
  const rating = RATING[summary.rating];

  const checkpoints = mission.checkpoints
    .map((checkpoint, index) => {
      const record = state.records[index];
      const score = summary.checkpoints[index];
      const final = record.attempts[record.attempts.length - 1];
      const first = record.attempts[0];
      const reason = checkpoint.justifications.find((entry) => entry.id === final.justification)!;
      const evidence = checkpoint.evidence
        .filter((entry) => entry.source === "chip" || record.evidence.includes(entry.id))
        .map((entry) => {
          const found = record.evidence.includes(entry.id);
          const how = !found ? "not collected" : entry.source === "inspect" ? "inspected" : record.flightChips.includes(entry.id) ? "collected in flight" : "pulled from the station log";
          return `<li class="${found ? "" : "missed"}"><strong>${esc(entry.title)}</strong> <em>${how}</em>${found ? `<p>${entry.lines.map(esc).join(" ")}</p>` : ""}</li>`;
        })
        .join("");
      const earlier = record.attempts.length > 1 ? `<p class="earlier">First attempt: ${esc(first.change)}. ${esc(first.lines[first.lines.length > 2 ? 2 : 0] ?? "")}</p>` : "";
      return `
        <article class="cp">
          <header>
            <h3>${index + 1}. ${esc(checkpoint.title)}</h3>
            ${score.recovered ? '<span class="tag good">Recovered after revising</span>' : record.attempts.length > 1 ? `<span class="tag">${record.attempts.length} attempts</span>` : ""}
            <strong class="cp-score">${score.score}<small>/100</small></strong>
          </header>
          <ol class="chain">
            <li><h4>Evidence</h4><ul class="found">${evidence}</ul></li>
            <li><h4>Chosen change</h4><p>${esc(final.change)}.</p><p class="quote">“${esc(reason.text)}”</p><p>${esc(reason.feedback)}</p>${earlier}</li>
            <li><h4>Observed consequence</h4>
              <div class="badges">${flag(score.continuityMet, "Service continuity")}${flag(score.policyMet, checkpoint.kind === "access" ? "Least privilege" : "Headroom policy")}${checkpoint.kind === "capacity" ? flag(score.costMet, "Cost ceiling") : ""}${flag(final.justified, "Reasoning supports the change")}</div>
              <ul>${final.lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></li>
            <li><h4>Better alternative</h4><p>${score.better ? `${esc(score.better)}. In this scenario, that is the leanest change that meets every requirement.` : "None needed. In this scenario, this was the leanest change that meets every requirement."}</p></li>
            <li><h4>Course connection</h4><p>${esc(checkpoint.connection)}</p><p>${esc(checkpoint.responsibility)}</p></li>
          </ol>
        </article>`;
    })
    .join("");

  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Mission debrief · ${esc(mission.title)} · ${esc(mission.organisation)}</p>
        <h1 id="debrief-title" tabindex="-1">${esc(rating.title)}</h1>
        <p>${esc(rating.text)}</p>
      </header>
      <div class="gate ${summary.securityObjectiveMet ? "good" : "bad"}" role="${summary.securityObjectiveMet ? "note" : "alert"}">
        <i>${summary.securityObjectiveMet ? ICONS.access : ICONS.cross}</i>
        <p><strong>Security objective: ${summary.securityObjectiveMet ? "met" : "not met"}.</strong>
        ${summary.securityObjectiveMet ? "The reviewed account holds only what its stated task needs." : "The decision score below does not offset this. Retry the access review to close it."}</p>
      </div>
      <div class="scores">
        <section class="scorecard" aria-labelledby="learn-title">
          <h2 id="learn-title">Learning decisions</h2>
          <p class="big">${summary.learningScore}<small>/100</small></p>
          ${bar("Service continuity", summary.continuity)}
          ${bar("Policy requirements", summary.policy)}
          ${bar("Resource use", summary.resource)}
          ${bar("Justified choices", summary.justification)}
          <p class="small">Budget left: ${num(summary.budgetLeft)} of ${num(mission.budget)} credits${summary.recoveries ? ` · ${summary.recoveries} recovered checkpoint${summary.recoveries === 1 ? "" : "s"}` : ""}</p>
        </section>
        <section class="scorecard nav" aria-labelledby="nav-title">
          <h2 id="nav-title">Navigation</h2>
          <p class="small">Reported separately. Flying is not part of the learning score.</p>
          <dl>
            <div><dt>Chips collected in flight</dt><dd>${navigation.chipsInFlight} of ${navigation.chipsTotal}</dd></div>
            <div><dt>Legs flown by autopilot</dt><dd>${navigation.autopilotSegments} of ${navigation.segments}</dd></div>
            <div><dt>Flight time</dt><dd>${navigation.flightSeconds} s</dd></div>
          </dl>
        </section>
      </div>
      <h2 class="section">Checkpoint by checkpoint</h2>
      ${checkpoints}
      <section class="model">
        <h2 class="section">Service model in this mission: ${esc(mission.serviceModel.name)}</h2>
        <div class="split">
          <div><h4>The provider is responsible for</h4><ul>${mission.serviceModel.provider.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
          <div><h4>The customer is responsible for</h4><ul>${mission.serviceModel.customer.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
        </div>
      </section>
      <div class="actions"><button class="btn primary" id="retry">Retry mission</button></div>
      <p class="sme">Prototype. All instructional content is a draft pending SME review. All data is fictional.</p>
    </div>`;
  $("#retry").addEventListener("click", handlers.retry);
}
