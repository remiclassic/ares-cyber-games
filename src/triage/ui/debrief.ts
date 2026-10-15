import { $, esc, pct } from "../../ui/dom";
import { getAlert, summarize } from "../sim/engine";
import { LANES, type AlertRecord, type GameState, type Phase, type Scenario, type Summary, type TruthGroup, type Verdict } from "../sim/types";
import { LANE_META, clockText } from "./game";
import { ICONS, alertIcon } from "./icons";

const VERDICT_TEXT: Record<Verdict, [label: string, tone: "good" | "fair" | "bad"]> = {
  best: ["You made the strongest call.", "good"],
  ok: ["Defensible, but not the strongest call.", "fair"],
  weak: ["The evidence did not support this priority.", "bad"],
  missed: ["Missed critical: this needed an immediate response.", "bad"],
  overescalated: ["Unnecessary escalation: this took an analyst away from real work.", "bad"],
  unplaced: ["Left in the queue when the round ended.", "bad"],
};

const PHASE_NAME = ["Shift start", "After update 1", "After update 2"] as const;

type Moment =
  | { kind: "alert"; phase: Phase; alert: string; headline: string }
  | { kind: "link"; group: TruthGroup };

function headline(summary: Summary): string {
  if (summary.quality >= 0.85) return "Sharp triage. The evidence backed your calls.";
  if (summary.quality >= 0.6) return "Solid shift, with a few calls worth another look.";
  return "A hard morning. Here is what the evidence supported.";
}

function reasonText(scenario: Scenario, id: string | null): string {
  return scenario.reasons.find((reason) => reason.id === id)?.text ?? "No justification given";
}

function alertMoment(state: GameState, phase: Phase, id: string, title: string): string {
  const { scenario } = state;
  const alert = getAlert(scenario, id);
  const assessment = alert.assessment[phase];
  const record = state.rounds[phase].alerts.find((entry) => entry.alert === id) as AlertRecord;
  const [verdict, tone] = VERDICT_TEXT[record.verdict];
  const fresh = alert.evidence.filter((item) => item.from === phase);
  const shown = (phase > 0 && fresh.length ? fresh : alert.evidence.filter((item) => item.from <= phase)).slice(0, 4);
  const lanes = LANES.map((lane) => {
    const marks: string[] = [];
    if (record.lane === lane) marks.push(`<span class="mark you">You</span>`);
    if (assessment.best === lane) marks.push(`<span class="mark best">Strongest</span>`);
    else if (assessment.ok.includes(lane)) marks.push(`<span class="mark fair">Defensible</span>`);
    return `<div class="r-lane lane-${lane} ${assessment.best === lane ? "is-best" : ""}"><h4>${LANE_META[lane].title}</h4>${marks.join("")}</div>`;
  });
  return `
    <div class="r-meta">${scenario.clock[phase]} · ${PHASE_NAME[phase]}</div>
    <h3>${esc(title)}</h3>
    <div class="r-alert sev-${alert.severity.toLowerCase()}">
      <span class="a-icon">${alertIcon(alert)}</span>
      <div><strong>${esc(alert.title)}</strong><span>${esc(alert.subject)} · tagged ${alert.severity} · confidence ${assessment.confidence}% · impact ${assessment.impact}</span></div>
    </div>
    <div class="r-lanes">${lanes.join("")}</div>
    <p class="r-verdict ${tone}">${verdict}${record.revised ? " You revised when the evidence changed." : ""}</p>
    <div class="r-cols">
      <div>
        <h4>${phase > 0 && fresh.length ? "New evidence" : "Evidence"}</h4>
        <ul class="r-evidence">${shown.map((item) => `<li><time>${item.time}</time><span><strong>${esc(item.title)}.</strong> ${esc(item.detail)}</span></li>`).join("")}</ul>
      </div>
      <div>
        <h4>Why this priority</h4>
        <p>${esc(assessment.why)}</p>
        <p class="r-reason ${record.reasonOk ? "good" : "fair"}">
          Your justification: <strong>${esc(reasonText(scenario, record.reason))}</strong>${
            record.reasonOk ? "" : `<br />Strongest: <strong>${esc(reasonText(scenario, assessment.reasons[0]))}</strong>`
          }
        </p>
      </div>
    </div>`;
}

function linkMoment(state: GameState, group: TruthGroup): string {
  const { scenario } = state;
  const final = state.rounds[state.rounds.length - 1];
  const made = final.links.some((link) => link.group === group.id);
  const members = scenario.alerts.filter((alert) => alert.group === group.id);
  return `
    <div class="r-meta">${scenario.clock[2]} · Final board</div>
    <h3>One incident, two alerts</h3>
    <div class="r-pair">
      ${members.map((alert) => `<div class="r-alert sev-${alert.severity.toLowerCase()}"><span class="a-icon">${alertIcon(alert)}</span><div><strong>${esc(alert.title)}</strong><span>${esc(alert.subject)}</span></div></div>`).join(`<span class="r-join">${ICONS.link}</span>`)}
    </div>
    <p class="r-verdict ${made ? "good" : "fair"}">${made ? "You linked these into one incident." : "These were left as separate alerts."}</p>
    <div class="r-cols"><div><h4>${esc(group.name)}</h4><p>${esc(group.why)}</p></div>
      <div><h4>Why linking matters</h4><p>A linked incident takes one analyst, not two. With only ${scenario.immediateCapacity} able to respond at once, that is what makes room for everything critical.</p></div>
    </div>`;
}

function decisionsTable(state: GameState): string {
  const { scenario } = state;
  return state.rounds
    .map((round) => {
      const rows = round.alerts.map((record) => {
        const alert = getAlert(scenario, record.alert);
        const assessment = alert.assessment[round.phase];
        const [, tone] = VERDICT_TEXT[record.verdict];
        return `<tr>
          <th scope="row">${esc(alert.title)}</th>
          <td class="${tone}">${record.lane ? LANE_META[record.lane].title : "Not triaged"}</td>
          <td>${LANE_META[assessment.best].title}</td>
          <td class="${record.reasonOk ? "good" : "fair"}">${esc(reasonText(scenario, record.reason))}</td>
          <td>${record.evidenceFirst ? "Yes" : "No"}</td>
        </tr>`;
      });
      return `
        <h4>${scenario.clock[round.phase]} · ${PHASE_NAME[round.phase]} <span>${clockText(round.elapsedSeconds)}${round.timedOut ? " · ran out of time" : ""}</span></h4>
        <div class="table-wrap"><table>
          <thead><tr><th scope="col">Alert</th><th scope="col">Your priority</th><th scope="col">Strongest</th><th scope="col">Your justification</th><th scope="col">Evidence first</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table></div>`;
    })
    .join("");
}

export function renderDebrief(
  state: GameState,
  timed: boolean,
  actions: { retry: () => void },
): { summary: Summary; stop: () => void } {
  const { scenario } = state;
  const summary = summarize(state);
  const moments: Moment[] = [
    ...scenario.replay.map((moment) => ({ kind: "alert" as const, ...moment })),
    ...scenario.groups.map((group) => ({ kind: "link" as const, group })),
  ];
  const budget = scenario.seconds.reduce((sum, seconds) => sum + seconds, 0);
  const quality = Math.round(summary.quality * 100);
  const stat = (value: string, label: string, tone = "") => `<div class="stat ${tone}"><strong>${value}</strong><span>${label}</span></div>`;

  const root = $("#debrief");
  root.innerHTML = `
    <div class="debrief">
      <header class="db-head">
        <div class="kicker">Shift debrief · ${esc(scenario.title)}</div>
        <h1 id="debrief-title" tabindex="-1">${headline(summary)}</h1>
      </header>

      <section class="db-score" aria-label="Decision quality">
        <div class="ring" style="--value:${quality}" role="img" aria-label="Decision quality ${quality} percent">
          <strong>${quality}<small>%</small></strong>
        </div>
        <div class="db-score-text">
          <h2>Decision quality</h2>
          <p>Well-supported priorities, matching justifications, revisions on new evidence, and linked incidents.</p>
        </div>
        <div class="stats">
          ${stat(`${summary.criticalCaught} / ${summary.criticalTotal}`, "Critical alerts in Immediate", "good")}
          ${stat(`${summary.benignRecognized} / ${scenario.alerts.filter((alert) => alert.assessment[2].best === "monitor").length}`, "Benign events recognized", "good")}
          ${stat(`${summary.revisions} / ${summary.revisionChances}`, "Revised on new evidence", "good")}
          ${stat(`${summary.correctLinks} / ${summary.linkChances}`, "Incidents linked", "good")}
          ${stat(`${summary.missedCritical}`, "Missed critical", summary.missedCritical ? "bad" : "")}
          ${stat(`${summary.unnecessaryEscalations}`, "Unnecessary escalations", summary.unnecessaryEscalations ? "bad" : "")}
        </div>
      </section>

      <section class="db-separate" aria-label="Measured separately">
        <h2>Measured separately <span>Not part of decision quality. Fast guesses earn nothing.</span></h2>
        <div class="stats">
          ${stat(clockText(summary.seconds), timed ? `Time used of ${clockText(budget)}` : "Time used (untimed)")}
          ${stat(`${summary.evidenceFirst} / ${summary.decisions}`, "Decisions made after reading the evidence")}
          ${stat(pct(summary.reasonsMatched / summary.reasonsTotal), "Justifications that matched the evidence")}
        </div>
        ${
          summary.rewards.length
            ? `<ul class="rewards" aria-label="Rewards">${summary.rewards.map((reward) => `<li class="reward ${reward.kind}">${ICONS.check}${esc(reward.text)}</li>`).join("")}</ul>`
            : ""
        }
      </section>

      <section class="replay" aria-labelledby="replay-title">
        <header>
          <h2 id="replay-title">Replay: the strongest decisions</h2>
          <div class="replay-controls">
            <button class="nav-btn" id="replay-prev" aria-label="Previous decision">${ICONS.left}</button>
            <button class="play-btn" id="replay-play"></button>
            <button class="nav-btn" id="replay-next" aria-label="Next decision">${ICONS.right}</button>
            <span id="replay-count" aria-live="polite"></span>
          </div>
        </header>
        <div class="replay-dots" id="replay-dots"></div>
        <div class="replay-stage" id="replay-stage"></div>
      </section>

      <details class="all-decisions">
        <summary>Every decision, round by round</summary>
        ${decisionsTable(state)}
      </details>

      <section class="mission">
        <div><div class="kicker">Mission connection</div><p>${esc(scenario.missionConnection)}</p></div>
        <button class="submit" id="retry">Run the shift again${ICONS.right}</button>
      </section>
      <p class="fineprint">Prototype · Scenario content and scoring still to be reviewed with SMEs</p>
    </div>`;

  let index = 0;
  let timer: number | null = null;
  const show = () => {
    const moment = moments[index];
    $("#replay-stage").innerHTML = moment.kind === "alert" ? alertMoment(state, moment.phase, moment.alert, moment.headline) : linkMoment(state, moment.group);
    $("#replay-count").textContent = `${index + 1} of ${moments.length}`;
    $("#replay-dots").innerHTML = moments.map((_, at) => `<i class="${at === index ? "on" : at < index ? "done" : ""}"></i>`).join("");
    $("#replay-play").innerHTML = timer === null ? `${ICONS.play}Play` : `${ICONS.pause}Pause`;
    $("#replay-play").setAttribute("aria-label", timer === null ? "Play replay" : "Pause replay");
  };
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const go = (to: number) => {
    index = (to + moments.length) % moments.length;
    show();
  };
  $("#replay-prev").addEventListener("click", () => {
    stop();
    go(index - 1);
  });
  $("#replay-next").addEventListener("click", () => {
    stop();
    go(index + 1);
  });
  $("#replay-play").addEventListener("click", () => {
    if (timer !== null) stop();
    else {
      if (index === moments.length - 1) index = 0;
      timer = window.setInterval(() => {
        if (index === moments.length - 1) stop();
        else index += 1;
        show();
      }, 7000);
    }
    show();
  });
  $("#retry").addEventListener("click", () => {
    stop();
    actions.retry();
  });
  show();
  return { summary, stop };
}
