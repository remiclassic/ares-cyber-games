import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { INCIDENTS } from "./data";
import {
  AUDIENCE_LABELS,
  METERS,
  METER_LABELS,
  PASS_EACH,
  PASS_RATIO,
  STYLE_LABELS,
  TRUST_PASS,
  actionsLeft,
  advance,
  causedBy,
  createGame,
  currentIncident,
  currentRun,
  currentTurn,
  draftOf,
  evidenceOf,
  hourOf,
  isGuided,
  needsMet,
  scoreRun,
  select,
  sendTurn,
  silenceEvents,
  summarize,
  visibleAsks,
  visibleFacts,
  type Ask,
  type Audience,
  type FactStatus,
  type Fired,
  type GameState,
  type Incident,
  type Meter,
  type Run,
  type Style,
  type TrustDelta,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-incident-comms/two-incidents/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MEGAPHONE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h3l8 4V6l-8 4H4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M18 9.5a4 4 0 0 1 0 5M8 14.5l1 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CLOCK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const AUDIENCE_CODE: Readonly<Record<Audience, string>> = { ceo: "LEAD", legal: "LAW", it: "IT", regulator: "REG", customers: "CUST", staff: "STAFF", press: "PRESS", insurer: "INS", police: "LAW ENF", supplier: "PARTNER" };
const FACT_UI: Readonly<Record<FactStatus, { icon: string; label: string }>> = {
  confirmed: { icon: "✓", label: "Confirmed" },
  suspected: { icon: "?", label: "Suspected" },
  unknown: { icon: "…", label: "Not known" },
};
const TONE_LABEL = { bad: "Consequence", warn: "Consequence", good: "Paid off" } as const;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(INCIDENTS);
let started = performance.now();

$("#logo").innerHTML = LOGO;

const pad = (hour: number) => String(hour).padStart(2, "0");

function trustChips(delta: TrustDelta): string {
  return METERS.filter((meter) => delta[meter])
    .map((meter) => `<span class="delta ${delta[meter]! > 0 ? "up" : "down"}">${METER_LABELS[meter]} ${delta[meter]! > 0 ? "+" : "−"}${Math.abs(delta[meter]!)}</span>`)
    .join("");
}

function eventHtml(event: Fired): string {
  return `<li class="event ${event.tone}"><span class="tag">${TONE_LABEL[event.tone]}</span><div><b>${esc(event.title)}</b><p>${esc(event.text)}</p>${trustChips(event.trust) ? `<p class="deltas">${trustChips(event.trust)}</p>` : ""}</div></li>`;
}

// ---------- situation column ----------

function renderSituation(): void {
  const incident = currentIncident(state);
  const run = currentRun(state);
  const epilogue = state.phase === "epilogue";
  const hour = epilogue ? incident.deadlineHour : currentTurn(state).hour;
  const before = state.lastReport?.trustBefore;
  const hours = incident.turns
    .map((turn, index) => `<li class="${index < state.turn ? "done" : index === state.turn && !epilogue ? "now" : ""}"><b>${turn.hour}</b><span>${esc(turn.clock)}</span></li>`)
    .join("");
  const facts = epilogue
    ? ""
    : `<h3 class="sub-head">What is known at hour ${hour}</h3>
       <ul class="facts" id="facts">
         ${visibleFacts(state)
           .map((fact) => `<li class="fact ${fact.status}"><i aria-hidden="true">${FACT_UI[fact.status].icon}</i><span><em>${FACT_UI[fact.status].label}${fact.fresh ? ` <b class="new">new</b>` : ""}</em>${esc(fact.text)}</span></li>`)
           .join("")}
       </ul>`;
  const sent = run.sent.length
    ? `<h3 class="sub-head">Sent so far</h3><ol class="sent-log">${run.sent.map((message) => `<li><time>h${message.hour}</time><span><b>${esc(message.from)}</b>: ${esc(draftOf(incident, message).label)}</span></li>`).join("")}</ol>`
    : "";
  $("#situation").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">${MEGAPHONE} Situation</h2><span class="phase-pill">Incident ${state.index + 1} of ${state.incidents.length}</span></div>
    <div class="d-scroll">
      <div><p class="kicker">${esc(incident.org)} · ${esc(incident.kind)}</p><p class="brief">${esc(incident.brief)}</p></div>
      <ol class="hours" aria-label="Timeline in hours">${hours}<li class="deadline ${epilogue ? "now" : ""}"><b>${incident.deadlineHour}</b><span>Deadline</span></li></ol>
      <div class="rule" id="deadline">${CLOCK}<span><b>${epilogue ? "The 72 hours are up." : `${incident.deadlineHour - hour} hours left to notify the regulator.`}</b> ${esc(incident.deadlineRule)}</span></div>
      <div class="meters" id="meters" aria-label="Trust">
        ${METERS.map((meter) => meterHtml(meter, run.trust[meter], before ? run.trust[meter] - before[meter] : 0)).join("")}
      </div>
      ${facts}
      <p class="channel" id="channel"><b>Channel.</b> ${esc(incident.channelNote)}</p>
      ${sent}
    </div>`;
}

function meterHtml(meter: Meter, value: number, change: number): string {
  const tone = value >= TRUST_PASS ? "good" : value >= 40 ? "ok" : "bad";
  return `<div class="meter ${tone}" data-id="${meter}">
    <span>${METER_LABELS[meter]}</span>
    <div class="bar" role="meter" aria-label="${METER_LABELS[meter]} trust" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i><u style="left:${TRUST_PASS}%"></u></div>
    <b>${value}</b>${change ? `<em class="${change > 0 ? "up" : "down"}">${change > 0 ? "+" : "−"}${Math.abs(change)}</em>` : `<em></em>`}
  </div>`;
}

// ---------- desk column ----------

function reportHtml(): string {
  const report = state.lastReport;
  if (!report) return "";
  const incident = currentIncident(state);
  const sent = report.sent
    .map((message) => `<li class="echo"><span class="tag">You sent</span><div><b>${esc(message.from)}: ${esc(draftOf(incident, message).label)}</b><p>${esc(draftOf(incident, message).reaction)}</p></div></li>`)
    .join("");
  const events = report.events.map(eventHtml).join("");
  return `<section class="report" id="report" aria-label="What happened since hour ${report.hour}">
    <h3 class="sub-head">Since hour ${report.hour}</h3>
    <ul>${sent || `<li class="echo"><span class="tag">You sent</span><div><b>Nothing.</b><p>Everyone who asked is still waiting.</p></div></li>`}${events}</ul>
  </section>`;
}

function askHtml(ask: Ask, index: number): string {
  const chosen = state.selection[ask.id] ?? "";
  const drafts = ask.drafts
    .map((draft) => {
      const note = draft.needsNote ? `<em class="needs ${needsMet(state, draft) ? "met" : "unmet"}">${esc(needsMet(state, draft) ? draft.needsNote.met : draft.needsNote.unmet)}</em>` : "";
      return `<label class="draft" data-card="${ask.id}:${draft.id}">
        <input type="radio" name="ask-${ask.id}" value="${draft.id}" data-act="pick" data-id="${ask.id}" data-draft="${draft.id}" ${chosen === draft.id ? "checked" : ""} />
        <span><b>${esc(draft.label)}</b>${note}<small>${esc(draft.text)}</small></span>
      </label>`;
    })
    .join("");
  return `<article class="ask ${chosen ? "answered" : ""}" data-ask="${ask.id}" aria-labelledby="ask-${ask.id}-who">
    <header><span class="code" aria-hidden="true">${AUDIENCE_CODE[ask.audience]}</span><div><h3 id="ask-${ask.id}-who">${esc(ask.from)}</h3><span class="aud">${AUDIENCE_LABELS[ask.audience]}</span></div>${index < 9 ? `<kbd>${index + 1}</kbd>` : ""}</header>
    <p class="ask-text">${esc(ask.ask)}</p>
    <div class="drafts" role="radiogroup" aria-label="Your reply to ${esc(ask.from)}">
      <label class="draft hold" data-card="${ask.id}:">
        <input type="radio" name="ask-${ask.id}" value="" data-act="pick" data-id="${ask.id}" data-draft="" ${chosen ? "" : "checked"} />
        <span><b>Hold</b><small>Say nothing to them this turn.</small></span>
      </label>
      ${drafts}
    </div>
  </article>`;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  renderSituation();
  if (state.phase === "epilogue") return renderEpilogue();
  const incident = currentIncident(state);
  const turn = currentTurn(state);
  const asks = visibleAsks(state);
  $("#desk-head").innerHTML = `<h2>Hour ${turn.hour} · ${esc(turn.clock)}</h2><span class="phase-pill">${isGuided(state) ? "Guided turn" : incident.guided ? "No more hints" : "No hints"}</span>`;
  $("#desk").innerHTML = `
    ${reportHtml()}
    <div class="headline" id="headline" tabindex="-1"><p class="kicker">Hour ${turn.hour} · turn ${state.turn + 1} of ${incident.turns.length}</p><h3>${esc(turn.headline)}</h3></div>
    ${isGuided(state) ? `<div class="coach"><strong>Your first turn, guided.</strong> ${esc(incident.guideText ?? "")}</div>` : ""}
    <p class="inbox-head"><b>Inbox: ${asks.length} waiting.</b> You can answer <b>${incident.actions}</b> this turn. For each, choose a draft or hold.</p>
    <div class="inbox" id="inbox">${asks.map(askHtml).join("")}</div>
    <div class="send-bar"><span id="send-count" class="muted small"></span><button class="btn primary" data-act="send" id="send"></button></div>`;
  sync();
}

// After a pick: refresh counters, disabled drafts and the Next bar without rebuilding the inbox,
// so keyboard focus stays on the radio the player is using.
function sync(): void {
  if (state.phase !== "compose") return;
  const incident = currentIncident(state);
  const turn = currentTurn(state);
  const left = actionsLeft(state);
  const used = incident.actions - left;
  const nextHour = hourOf(incident, state.turn + 1);
  document.querySelectorAll<HTMLInputElement>('#inbox input[type="radio"]').forEach((input) => {
    const askId = input.dataset.id!;
    const chosen = state.selection[askId] ?? "";
    input.checked = input.value === chosen;
    input.disabled = input.value !== "" && !chosen && left <= 0;
    input.closest(".draft")!.classList.toggle("locked", input.disabled);
    input.closest(".draft")!.classList.toggle("on", input.checked);
    input.closest(".ask")!.classList.toggle("answered", !!chosen);
  });
  $("#status").innerHTML = `
    <div class="clock" title="Hours since confirmation">H+${pad(turn.hour)}</div>
    <div class="count"><strong>${left}</strong><span>Messages left</span></div>
    <div class="count"><strong>${incident.deadlineHour - turn.hour}h</strong><span>To deadline</span></div>`;
  $("#send-count").textContent = `${used} of ${incident.actions} messages chosen`;
  $("#send").innerHTML = `${used ? `Send ${used} and move to hour ${nextHour}` : `Send nothing and move to hour ${nextHour}`} <kbd>N</kbd>`;
  renderNext();
}

function renderNext(): void {
  const incident = currentIncident(state);
  const left = actionsLeft(state);
  let step: NextStep;
  if (isGuided(state)) {
    const missing = Object.entries(incident.plan[0]).find(([askId, draftId]) => state.selection[askId] !== draftId);
    if (missing) {
      const ask = visibleAsks(state).find((entry) => entry.id === missing[0])!;
      const draft = ask.drafts.find((entry) => entry.id === missing[1])!;
      step = {
        text: `Find <strong>${esc(ask.from)}</strong> in the inbox and choose <strong>${esc(draft.label)}</strong>.`,
        hint: "Compare it with the other drafts: which one says only what is confirmed, on a safe channel?",
        targets: [`[data-card="${ask.id}:${draft.id}"]`],
      };
    } else {
      step = { label: "Ready", tone: "ready", text: `Three people briefed. Press <strong>Send</strong> (<kbd>N</kbd>). The others wait a turn: watch what that costs, if anything.`, targets: ["#send"] };
    }
  } else if (left > 0) {
    step = {
      text: `Read what is <strong>confirmed</strong> on the left. Choose who hears from you now and which draft: <strong>${left}</strong> message${left === 1 ? "" : "s"} left. Then <strong>Send</strong> (<kbd>N</kbd>).`,
      hint: "Holding is allowed. What you say, and what you do not say, comes back in later hours.",
      targets: Object.keys(state.selection).length ? ["#send"] : ["#inbox"],
    };
  } else {
    step = { label: "Ready", tone: "ready", text: `All messages for this turn are chosen. Press <strong>Send</strong> (<kbd>N</kbd>), or change a choice first.`, targets: ["#send"] };
  }
  renderNextStep($("#next-step"), step);
}

function renderEpilogue(): void {
  const incident = currentIncident(state);
  const run = currentRun(state);
  const score = scoreRun(incident, run);
  const last = state.index + 1 >= state.incidents.length;
  $("#status").innerHTML = `
    <div class="clock" title="Hours since confirmation">H+${incident.deadlineHour}</div>
    <div class="count"><strong>${score.earned}</strong><span>of ${score.max}</span></div>
    <div class="count"><strong>${run.sent.length}</strong><span>Messages</span></div>`;
  $("#desk-head").innerHTML = `<h2>Hour ${incident.deadlineHour} · ${esc(incident.deadlineClock)}</h2><span class="phase-pill">Deadline</span>`;
  $("#desk").innerHTML = `
    ${reportHtml()}
    <div class="headline" id="headline" tabindex="-1"><p class="kicker">${esc(incident.title)} · how it landed</p><h3>${score.deadlineMissed ? "The regulator's deadline passed without a notification." : `You earned ${score.earned} of ${score.max} for this incident.`}</h3></div>
    <ul class="outcomes">
      ${score.objectives.map((objective) => `<li class="${objective.met ? "met" : "missed"}"><i aria-hidden="true">${objective.met ? "✓" : "✕"}</i><span><b>${esc(objective.label)}</b>${objective.met ? "" : `<small>${esc(objective.missed)}</small>`}</span><em>${objective.earned}/${objective.points}</em></li>`).join("")}
    </ul>
    <div class="send-bar"><span class="muted small">${last ? "The debrief replays every message with what it caused." : "Next: a different kind of incident, with no coaching."}</span><button class="btn primary" data-act="next" id="next">${last ? "See debrief" : "Next incident"} <kbd>N</kbd></button></div>`;
  renderNextStep($("#next-step"), {
    label: "Done",
    tone: score.deadlineMissed || score.earned < score.max * PASS_RATIO ? "warn" : "ready",
    text: `Hour 72. Read how it landed, then press <strong>${last ? "See debrief" : "Next incident"}</strong> (<kbd>N</kbd>).`,
    targets: ["#next"],
  });
}

// ---------- actions ----------

function onPick(input: HTMLInputElement): void {
  const ok = select(state, input.dataset.id!, input.value || null);
  if (ok) play("click");
  else announce("No messages left this turn. Set another reply to Hold first.");
  sync();
}

function onSend(): void {
  const report = sendTurn(state);
  if (!report) return;
  const bad = report.events.filter((event) => event.tone !== "good");
  play(bad.some((event) => event.tone === "bad") ? "fail" : bad.length ? "setback" : report.events.length ? "success" : "deliver");
  post("statement", { at: new Date().toISOString(), verb: "sent", object: `${currentIncident(state).id}/hour-${report.hour}`, result: { messages: report.sent.map((message) => ({ to: message.audience, ask: message.askId, draft: message.draftId, style: message.style })), consequences: report.events.map((event) => event.id) } });
  render();
  const next = state.phase === "epilogue" ? `Hour ${currentIncident(state).deadlineHour}. The deadline.` : `Hour ${currentTurn(state).hour}. ${currentTurn(state).headline}`;
  announce(`${report.events.map((event) => event.title).join(". ")}${report.events.length ? ". " : ""}${next}`);
  $("#desk").scrollTop = 0;
  window.scrollTo({ top: 0 });
  $("#headline").focus({ preventScroll: true });
}

function goNext(): void {
  if (state.phase !== "epilogue") return;
  advance(state);
  render();
  if ((state.phase as GameState["phase"]) === "done") return;
  play("alarm");
  announce(`${currentIncident(state).title}. ${currentTurn(state).headline}`);
  $("#desk").scrollTop = 0;
  window.scrollTo({ top: 0 });
  $("#headline").focus({ preventScroll: true });
}

document.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset?.act === "pick") onPick(input);
});

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button[data-act]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  const act = target.dataset.act;
  if (act === "send") onSend();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "n" && state.phase === "compose") onSend();
  else if (key === "n" && state.phase === "epilogue") goNext();
  else if (/^[1-9]$/.test(key) && state.phase === "compose") {
    const ask = document.querySelectorAll<HTMLElement>("#inbox .ask")[Number(key) - 1];
    if (!ask) return;
    ask.scrollIntoView({ block: "nearest" });
    ask.querySelector<HTMLInputElement>("input:checked")?.focus();
  } else return;
  event.preventDefault();
});

// ---------- debrief ----------

const STYLE_TONE: Readonly<Record<Style, string>> = { measured: "cool", reassure: "hot", blame: "hot", dump: "hot", stall: "warm" };

function replayHtml(incident: Incident, run: Run): string {
  const turns = incident.turns
    .map((turn, index) => {
      const messages = run.sent.filter((message) => message.turn === index);
      const body = messages.length
        ? messages
            .map((message) => {
              const draft = draftOf(incident, message);
              const caused = causedBy(run, message);
              const tone = caused.some((event) => event.tone === "bad") ? "breach" : caused.some((event) => event.tone === "warn") || draft.style !== "measured" ? "miss" : "ok";
              return `<article class="rp ${tone}">
                <header><b>${esc(message.from)}</b><span>${esc(draft.label)}</span><em class="chip ${STYLE_TONE[draft.style]}">${STYLE_LABELS[draft.style]}</em></header>
                <p class="quote">${esc(draft.text)}</p>
                ${message.unmet && draft.needsNote ? `<p class="warn-text small">${esc(draft.needsNote.unmet)}.</p>` : ""}
                <p class="muted small">${esc(draft.why)}</p>
                <div class="caused"><b>What it caused later</b>${
                  caused.length
                    ? `<ul>${caused.map((event) => `<li class="${event.tone}"><time>Hour ${event.hour}</time><span><b>${esc(event.title)}.</b> ${esc(event.text)}</span></li>`).join("")}</ul>`
                    : `<p class="muted small">${draft.style === "measured" ? "Nothing had to be corrected, withdrawn or explained." : "No later event traced to this message alone."}</p>`
                }</div>
              </article>`;
            })
            .join("")
        : `<p class="muted small">No messages sent this turn.</p>`;
      return `<section class="rp-turn"><h4><time>Hour ${turn.hour}</time> ${esc(turn.headline)}</h4>${body}</section>`;
    })
    .join("");
  const silence = silenceEvents(run).filter((event) => event.tone !== "good");
  const quiet = silence.length
    ? `<section class="rp-turn"><h4>What silence caused</h4><ul class="events">${silence.map((event) => `<li class="event ${event.tone}"><span class="tag">Hour ${event.hour}</span><div><b>${esc(event.title)}</b><p>${esc(event.text)}</p></div></li>`).join("")}</ul></section>`
    : "";
  return turns + quiet;
}

function renderDebrief(): void {
  const summary = summarize(state);
  const evidence = evidenceOf(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, evidence, messages: state.runs.map((run) => ({ incident: run.incident, sent: run.sent, consequences: run.fired.map((event) => ({ id: event.id, hour: event.hour })) })) });
  try {
    localStorage.setItem("ares-comms:lastResult", JSON.stringify({ summary, evidence }));
  } catch {
    // Optional.
  }
  const risky = evidence.styles.reassure + evidence.styles.blame + evidence.styles.dump + evidence.styles.stall;
  const flags = state.runs.flatMap((run) => run.flags);
  const habit = summary.deadlineMissed
    ? "A regulator's deadline passed with no notification. A staged notification (what is confirmed, what is not, when you will update) can go early; waiting for the full picture is how deadlines are missed."
    : flags.includes("contradicted") || flags.includes("retraction")
      ? "Something you said had to be contradicted or withdrawn later. The fix is not silence: say what is confirmed, say what is not yet known, and say when you will update."
      : flags.includes("blame-wrong")
        ? "Someone was blamed before the cause was confirmed, and the cause turned out to be a gap in the system. Blame closes down exactly the reporting you rely on."
        : evidence.messages === 0
          ? "You sent nothing. Everyone found out anyway, from someone else."
          : risky === 0 && summary.total === summary.max
            ? "Every message said only what was confirmed, reached the right person at the right time, and matched every other message."
            : risky === 0
              ? "Your wording held up: nothing had to be taken back. The points you dropped came from order and timing: who heard first, and who was left waiting too long."
              : `${risky} of your ${evidence.messages} messages reassured, blamed, stalled or over-shared. Look at what each one caused in the replay below.`;
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · Incident Comms</p>
        <h2 id="debrief-title" tabindex="-1">Score ${summary.total}<small>/${summary.max}</small> · ${summary.passed ? (flags.includes("contradicted") || flags.includes("retraction") || flags.includes("blame-wrong") ? "Passed, with corrections" : "One consistent story") : summary.deadlineMissed ? "Regulatory failure" : "Below the bar"}</h2>
        <p class="muted">${evidence.messages} messages across ${state.incidents.length} incidents. Pass: ${Math.round(PASS_RATIO * 100)}% of the points, at least ${Math.round(PASS_EACH * 100)} in each incident, and no missed regulator deadline. Speed is never scored.</p>
      </header>
      <div class="score-grid wide">
        ${summary.incidents.map((incident) => tile(incident.title, incident.earned, incident.max)).join("")}
        ${summary.incidents.map((incident) => `<div class="score-tile ${METERS.every((meter) => incident.trust[meter] >= TRUST_PASS) ? "good" : "ok"}"><span>Trust at hour 72</span><p>${METERS.map((meter) => `${METER_LABELS[meter]} <b>${incident.trust[meter]}</b>`).join(" · ")}</p></div>`).join("")}
      </div>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <ul class="evidence">
          ${evidence.skills.map((skill) => `<li class="ev-${skill.level}"><b>${skill.level === "shown" ? "Shown" : skill.level === "partial" ? "Partly" : skill.level === "n/a" ? "n/a" : "Not yet"}</b><span>${esc(skill.label)}</span><small>${skill.shown}/${skill.of}</small></li>`).join("")}
          ${evidence.unaided ? `<li class="ev-${evidence.unaided.met === evidence.unaided.of ? "shown" : evidence.unaided.met ? "partial" : "not-yet"}"><b>Unaided</b><span>${esc(evidence.unaided.title)}: outcomes reached with no coaching</span><small>${evidence.unaided.met}/${evidence.unaided.of}</small></li>` : ""}
          <li class="ev-${risky === 0 && evidence.messages > 0 ? "shown" : evidence.styles.measured > risky ? "partial" : "not-yet"}"><b>Wording</b><span>Messages that stated confirmed facts and a next step (the rest: ${evidence.styles.reassure} over-reassuring, ${evidence.styles.blame} blaming, ${evidence.styles.dump} too much too soon, ${evidence.styles.stall} stalling)</span><small>${evidence.styles.measured}/${evidence.messages}</small></li>
        </ul>
      </section>
      ${state.runs
        .map((run) => {
          const incident = state.incidents.find((entry) => entry.id === run.incident)!;
          const score = summary.incidents.find((entry) => entry.id === run.incident)!;
          return `<section class="panel">
            <h3>${esc(incident.title)} <span class="muted small">${esc(incident.org)} · ${score.earned}/${score.max}</span></h3>
            <ul class="outcomes">${score.objectives.map((objective) => `<li class="${objective.met ? "met" : "missed"}"><i aria-hidden="true">${objective.met ? "✓" : "✕"}</i><span><b>${esc(objective.label)}</b>${objective.met ? "" : `<small>${esc(objective.missed)}</small>`}</span><em>${objective.earned}/${objective.points}</em></li>`).join("")}</ul>
            <h3>Replay: each message and what it caused</h3>
            <div class="replay">${replayHtml(incident, run)}</div>
          </section>`;
        })
        .join("")}
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional organisations, regulator and deadlines · Content to be reviewed with SMEs (docs/design/INCIDENT_COMMS.md)</p>
    </div>`;
  window.scrollTo({ top: 0 });
  $("#debrief-title").focus();
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

// ---------- walkthrough ----------

function tutorialPages(retry: boolean): TutorialPage[] {
  const first = INCIDENTS[0];
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">A breach has just been confirmed and you are the <strong>incident communications lead</strong>. Over 72 hours, everyone wants answers: the chief executive, counsel, IT, staff, customers, a journalist, the insurer, the regulator.</p>
        <p class="tut-lead">You decide <strong>who hears from you now</strong> and <strong>what they hear</strong>. The facts keep changing. What you say at hour 4 will be read again at hour 30.</p>
        <p class="tut-note">${MEGAPHONE}<span>The aim: <strong>one consistent story</strong>, told in the right order, with every obligation met on time.</span></p>`,
    },
    {
      title: "Read the situation",
      body: `
        <div class="tut-ex">
          <div class="row"><span class="tag">✓ Confirmed</span><span class="then">safe to say</span></div>
          <div class="row"><span class="tag sensor">? Suspected</span><span class="then">may turn out wrong: say it is being investigated</span></div>
          <div class="row"><span class="tag sensor">… Not known</span><span class="then">say that you do not know yet, and when you will</span></div>
        </div>
        <p>The left panel also shows the <strong>regulator's clock</strong> (an in-game rule set by the fictional Data Protection Office), which <strong>channel</strong> is safe, and three <strong>trust</strong> meters: customers, staff and the regulator.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Choose who to answer</b><span class="how">Each turn you can send ${first.actions} messages. More people are waiting than that.</span></span></li>
          <li><span><b>Choose a draft, or Hold</b><span class="how">Every inbox item has 3 or 4 drafts. Hold means they hear nothing from you this turn. Sometimes that is right; sometimes they find out elsewhere.</span></span></li>
          <li><span><b>Send</b> <kbd>N</kbd><span class="how">The clock jumps forward. You see the replies, and anything earlier messages (or silences) have caused.</span></span></li>
        </ol>
        <p class="tut-muted">Keys: <kbd>1</kbd> to <kbd>9</kbd> jump to an inbox item, arrow keys change the draft, <kbd>N</kbd> sends. The first turn of the first incident is guided. After that there are no hints.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>100 <small>points</small></b>per incident, for outcomes: regulator notified on time, affected people told once and accurately, nothing contradicted later, staff heard it from you.</div>
          <div><b>${TRUST_PASS}+ <small>trust</small></b>on each meter at hour 72 earns the last 15 points.</div>
          <div><b>0 <small>for speed</small></b>Take your time. Turns do not run on a real clock.</div>
        </div>
        <p>Telling everyone everything, saying nothing until it is over, and reassuring everyone all lose. A missed regulator deadline fails the game. Learning evidence is reported separately from the score.</p>
        ${retry ? `<p class="tut-note">${MEGAPHONE}<span>Starting again: the same two incidents, a fresh score.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
    settings.sound = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  });
}

let attempt = 0;

function start(): void {
  const retry = attempt > 0;
  attempt += 1;
  state = createGame(INCIDENTS);
  started = performance.now();
  post("started", {});
  render();
  window.scrollTo({ top: 0 });
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: "Incident Comms · How to play",
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Take the desk",
    onStart: () => $("#headline").focus({ preventScroll: true }),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: "Incident Comms · How to play", pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
