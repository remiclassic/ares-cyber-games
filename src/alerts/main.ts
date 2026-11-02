import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, isTutorialOpen, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { GUIDED, ORG, POOL } from "./data";
import {
  CONFIGS,
  POINTS,
  buildStream,
  createGame,
  currentAlert,
  debriefLines,
  decide,
  end,
  evidenceOf,
  isSwamped,
  nextGuided,
  scoreOf,
  splitEvidence,
  streamLength,
  tick,
  timeLeft,
  type Alert,
  type Call,
  type CallRecord,
  type GameState,
  type Mode,
  type Phase,
} from "./engine";

// Modes: the full drill (walkthrough, three guided alerts, 60 s stream, full debrief) and
// ?mode=wait: one 30-second round for the range waiting screen. Wait mode shows no dialogs at all,
// ends itself without a prompt, and stops at once (no prompt, nothing lost) when the host posts
// { type: "ares:practice:stop" }, e.g. because the range is ready.
const params = new URLSearchParams(location.search);
const MODE: Mode = params.get("mode") === "wait" ? "wait" : "full";
const CONFIG = CONFIGS[MODE];
const ACTIVITY_ID = `ares-alert-or-noise/${MODE}/v0.1`;
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
const UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
const X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
document.documentElement.classList.toggle("wait-mode", MODE === "wait");
if (MODE === "wait") $("#fineprint").textContent = "30-second round · Stops whenever your range is ready · Content to be reviewed with SMEs";
$("#logo").innerHTML = LOGO;

let state: GameState;
let armed = false; // the clock may run (after the walkthrough, or after "Start" in wait mode)
let lastCall: CallRecord | null = null;
let lastSignature = "";
let attempt = 0;
let startedAt = performance.now();
let lastFrame = 0;
let reported = false;
let lastHeadId = ""; // animate a card only when a new alert reaches the top

function seedFor(run: number): string {
  return params.get("seed") ? `${params.get("seed")}-${run}` : Math.random().toString(36).slice(2, 8);
}

function alertById(id: string): Alert {
  return [...state.stream, ...state.guided].find((alert) => alert.id === id)!;
}

function lineHtml(alert: Alert, highlight: boolean): string {
  if (!highlight) return esc(alert.text);
  const [before, evidence, after] = splitEvidence(alert);
  return `${esc(before)}<mark>${esc(evidence)}</mark>${esc(after)}`;
}

function clockText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- rendering ----------
function signature(): string {
  return [state.phase, state.guidedIndex, state.guidedAnswered, state.records.length, state.arrived, state.pending.length, isSwamped(state), armed].join("|");
}

function render(): void {
  if (state.phase === "done") return MODE === "wait" ? renderWaitResult() : renderDebrief();
  lastSignature = signature();
  renderSide();
  renderConsole();
  renderNext();
  renderDynamic();
}

function renderDynamic(): void {
  const points = scoreOf(state).points;
  $("#status").innerHTML = `
    <div class="clock ${timeLeft(state) <= 10_000 && state.phase === "live" ? "low" : ""}">${CLOCK}<span id="clock-text">${state.phase === "guided" ? "Paused" : clockText(timeLeft(state))}</span></div>
    <div class="count"><strong>${points}</strong><span>Points</span></div>
    <div class="count"><strong>${state.pending.length > 1 ? state.pending.length - 1 : 0}</strong><span>Waiting</span></div>`;
  const meter = document.getElementById("queue-meter");
  if (meter) {
    const load = Math.min(state.queue, CONFIG.capacity + 2);
    meter.style.setProperty("--fill", String(Math.min(1, state.queue / (CONFIG.capacity + 2))));
    meter.setAttribute("aria-valuenow", load.toFixed(1));
    const label = document.getElementById("queue-label");
    if (label) label.textContent = `${state.queue.toFixed(1)} open / ${CONFIG.capacity} capacity`;
  }
  const ttl = document.getElementById("ttl");
  const head = state.pending[0];
  if (ttl && head && state.phase === "live") {
    const left = Math.max(0, head.arrivedAt + CONFIG.ttlMs - state.clock);
    ttl.style.setProperty("--left", String(left / CONFIG.ttlMs));
    ttl.classList.toggle("low", left < 3000);
  }
}

function renderSide(): void {
  const swamped = isSwamped(state);
  const slots = Array.from({ length: CONFIG.capacity + 2 }, (_, index) => `<span class="slot ${index >= CONFIG.capacity ? "over" : ""}"></span>`).join("");
  $("#side").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Analyst queue</h2><span class="phase-pill">${swamped ? "Swamped" : "Coping"}</span></div>
    <div class="d-scroll">
      <div id="queue-meter" class="queue-meter ${swamped ? "swamped" : ""}" role="meter" aria-label="Analyst queue load" aria-valuemin="0" aria-valuemax="${CONFIG.capacity + 2}" aria-valuenow="0">
        <div class="slots">${slots}</div><div class="fill"></div>
      </div>
      <p class="muted small" id="queue-label"></p>
      <p class="queue-note ${swamped ? "hot" : ""}">${
        swamped
          ? "<strong>Analysts swamped.</strong> Real threats escalated now are worth half; wasted ones cost more."
          : `Every escalation lands here. The team closes one case every ${CONFIG.drainMs / 1000} s. Past ${CONFIG.capacity} open cases they are swamped.`
      }</p>
      <h3 class="sub-head">Points</h3>
      <ul class="points-list">
        <li><b class="pos">+${POINTS.hit}</b> Threat escalated <span class="muted">(+${POINTS.hitSwamped} if swamped)</span></li>
        <li><b class="pos">+${POINTS.correctReject}</b> Noise dismissed</li>
        <li><b class="neg">${POINTS.falseAlarm}</b> Noise escalated <span class="muted">(${POINTS.falseAlarmSwamped} if swamped)</span></li>
        <li><b class="neg">${POINTS.miss}</b> Threat dismissed or left to age out</li>
      </ul>
      ${MODE === "full" ? `<p class="muted small">The first ${GUIDED.length} alerts are guided and not scored. Accuracy is reported separately from points in the debrief.</p>` : ""}
    </div>`;
}

function renderConsole(): void {
  const alert = currentAlert(state);
  const guided = state.phase === "guided";
  const head = guided ? `Guided alert ${state.guidedIndex + 1} of ${state.guided.length}` : `Alert stream · ${state.arrived}/${state.stream.length}`;
  $("#console-head").innerHTML = `<h2>${BELL} ${guided ? "Walk-through" : "Live stream"}</h2><span>${esc(head)}</span>`;

  if (MODE === "wait" && !armed) {
    $("#console").innerHTML = `
      <div class="start-card">
        <p class="kicker">While you wait · 30 seconds</p>
        <h3>Is it an attack, or just noise?</h3>
        <p>Alerts arrive every ${CONFIG.intervalMs / 1000} s. <b>Escalate</b> <kbd>→</kbd> the real threats, <b>Dismiss</b> <kbd>←</kbd> the noise. Escalating everything swamps the analysts and loses points.</p>
        <button class="btn primary" data-act="start">Start the 30-second round</button>
        <p class="muted small">You can leave at any moment: nothing to save, nothing to confirm.</p>
      </div>`;
    return;
  }

  const answered = guided && state.guidedAnswered ? state.records[state.records.length - 1] : null;
  const waiting = guided ? [] : state.pending.slice(1);
  const fresh = !!alert && alert.id !== lastHeadId && !reduceMotion();
  lastHeadId = alert?.id ?? "";
  $("#console").innerHTML = `
    ${
      alert
        ? `<article class="alert-card ${guided ? "guided" : ""} ${fresh ? "fresh" : ""}" aria-label="Current alert">
            <header><span class="src">${esc(alert.source)}</span>${guided ? "" : `<span class="age">waiting <span id="ttl" class="ttl"><i></i></span></span>`}</header>
            <p class="line">${lineHtml(alert, guided)}</p>
          </article>`
        : `<div class="alert-card empty"><p class="muted">Quiet for a moment. The next alert arrives in a few seconds.</p></div>`
    }
    ${guided && !answered ? `<div class="feedback-box hint" role="status"><strong>Look at the highlight.</strong> ${guidedCoach(alert!)}</div>` : ""}
    <div class="calls" role="group" aria-label="Your call">
      <button class="call dismiss" data-call="dismiss" ${!alert || answered ? "disabled" : ""}>${X}<span><b>Dismiss</b><small>Noise: no action needed</small></span><kbd>←</kbd></button>
      <button class="call escalate" data-call="escalate" ${!alert || answered ? "disabled" : ""}>${UP}<span><b>Escalate</b><small>Threat: send to the analysts</small></span><kbd>→</kbd></button>
    </div>
    ${answered ? guidedFeedback(answered) : !guided && lastCall ? liveFeedback(lastCall) : ""}
    ${answered ? `<div class="bench-actions"><button class="btn primary" data-act="next">${state.guidedIndex + 1 < state.guided.length ? "Next guided alert" : "Start the live stream"} <kbd>N</kbd></button></div>` : ""}
    ${
      waiting.length
        ? `<section class="waiting" aria-label="Alerts waiting"><h3 class="sub-head">Waiting (${waiting.length})</h3><ul>${waiting
            .map((entry) => `<li><span class="src">${esc(entry.alert.source)}</span> ${esc(entry.alert.text)}</li>`)
            .join("")}</ul></section>`
        : ""
    }`;
}

function guidedCoach(alert: Alert): string {
  return alert.truth === "threat"
    ? "This detail is what an attacker leaves behind. Escalate or dismiss?"
    : "This detail explains the alert. Does an analyst need to act on it?";
}

function guidedFeedback(record: CallRecord): string {
  const alert = alertById(record.alert);
  const right = record.outcome === "hit" || record.outcome === "correct-reject";
  const label = alert.truth === "threat" ? "Threat." : "Noise.";
  return `<div class="feedback-box ${right ? "good" : "bad"}" role="status"><strong>${right ? "Right call." : "Not quite."} ${label}</strong> ${esc(alert.why)}</div>`;
}

const OUTCOME_TEXT: Record<CallRecord["outcome"], string> = {
  hit: "Threat escalated",
  "correct-reject": "Noise dismissed",
  "false-alarm": "Wasted escalation: queue +1",
  miss: "Missed threat",
  expired: "Aged out (noise, no harm)",
};

function liveFeedback(record: CallRecord): string {
  const good = record.outcome === "hit" || record.outcome === "correct-reject";
  const sign = record.points > 0 ? "+" : "";
  const timed = record.decision === "timeout" && record.outcome === "miss" ? " (aged out)" : "";
  return `<p class="last-call ${good ? "good" : record.outcome === "expired" ? "" : "bad"}"><b>${sign}${record.points}</b> ${OUTCOME_TEXT[record.outcome]}${timed}${record.swamped ? " · analysts swamped" : ""}. <span class="muted">Reasons in the debrief.</span></p>`;
}

function renderNext(): void {
  let step: NextStep;
  if (MODE === "wait" && !armed) {
    step = { text: "Press <strong>Start</strong> when you are ready. The round lasts 30 seconds.", targets: ['[data-act="start"]'] };
  } else if (state.phase === "guided" && state.guidedAnswered) {
    const last = state.guidedIndex + 1 >= state.guided.length;
    step = { label: "Done", tone: "ready", text: `Read why, then press <strong>${last ? "Start the live stream" : "Next guided alert"}</strong> (or <kbd>N</kbd>).${last ? " The clock starts then." : ""}`, targets: ['[data-act="next"]'] };
  } else if (state.phase === "guided") {
    step = { text: "Read the line and the highlighted evidence, then <strong>Escalate</strong> <kbd>→</kbd> or <strong>Dismiss</strong> <kbd>←</kbd>.", hint: "Guided alerts are not scored and the clock is paused.", targets: [".calls"] };
  } else if (isSwamped(state)) {
    step = { label: "Careful", tone: "warn", text: "The analysts are swamped. Escalate only what the evidence shows is real.", targets: [".calls"] };
  } else {
    step = { label: "Live", text: "Call the top alert: <strong>Escalate</strong> <kbd>→</kbd> threats, <strong>Dismiss</strong> <kbd>←</kbd> noise.", hint: "Alerts left waiting age out, and a threat that ages out counts as missed.", targets: [] };
  }
  renderNextStep($("#next-step"), step);
}

function reduceMotion(): boolean {
  return settings.reducedMotion || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

// ---------- actions ----------
function onCall(call: Call): void {
  if (isModalOpen() || isTutorialOpen() || (MODE === "wait" && !armed)) return;
  const record = decide(state, call);
  if (!record) return;
  const alert = alertById(record.alert);
  const good = record.outcome === "hit" || record.outcome === "correct-reject";
  play(good ? (call === "escalate" ? "success" : "click") : "setback");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: record.alert, result: { correct: good, outcome: record.outcome, call, guided: record.guided } });
  if (record.guided) announce(`${good ? "Right call" : "Not quite"}. ${alert.why}`);
  else {
    lastCall = record;
    announce(`${OUTCOME_TEXT[record.outcome]}. ${record.points} points.`);
  }
  render();
  if (record.guided) document.querySelector<HTMLElement>("[data-act=next]")?.focus();
  else document.querySelector<HTMLElement>(`[data-call=${call}]:not(:disabled)`)?.focus();
}

function onNextGuided(): void {
  if (state.phase !== "guided" || !state.guidedAnswered) return;
  nextGuided(state);
  render();
  const alert = currentAlert(state);
  if (alert) announce(`${(state.phase as Phase) === "live" ? "Live stream started. " : ""}${alert.source}: ${alert.text}`);
  document.querySelector<HTMLElement>("[data-call=escalate]")?.focus();
}

function arm(): void {
  if (armed) return;
  armed = true;
  lastFrame = performance.now();
  startedAt = performance.now();
  render();
  document.querySelector<HTMLElement>("[data-call=escalate]")?.focus();
}

// Stops the round with no prompt. Used by the host when the range is ready.
function stopNow(): void {
  if (state.phase === "done") return;
  end(state, true);
  render();
}

// ---------- clock ----------
// A 100 ms interval rather than requestAnimationFrame: rAF stops in background tabs and in
// off-screen iframes, and the clock must not depend on paint. Hidden pages pause the round.
function frame(): void {
  const now = performance.now();
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;
  const paused = !armed || document.hidden || isModalOpen() || isTutorialOpen();
  if (!paused && state.phase === "live") {
    const expired = tick(state, dt);
    if (expired.length) {
      lastCall = expired[expired.length - 1];
      if (expired.some((record) => record.outcome === "miss")) play("setback");
    }
    if ((state.phase as Phase) === "done") {
      render();
    } else if (signature() !== lastSignature) {
      const focused = (document.activeElement as HTMLElement | null)?.dataset.call;
      render();
      if (focused) document.querySelector<HTMLElement>(`[data-call=${focused}]:not(:disabled)`)?.focus();
    } else renderDynamic();
  }
}

// ---------- results ----------
function report(): void {
  if (reported) return;
  reported = true;
  const score = scoreOf(state);
  const evidence = evidenceOf(state);
  // Score (game points) and evidence (accuracy of the calls) are reported separately on purpose.
  post("completed", { activityId: ACTIVITY_ID, completed: !state.stoppedEarly, stoppedEarly: state.stoppedEarly, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - startedAt) / 1000), score, evidence, records: state.records });
  try {
    localStorage.setItem(`ares-alerts:${MODE}:lastResult`, JSON.stringify({ score, evidence }));
  } catch {
    // Optional.
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function evidenceTiles(): string {
  const e = evidenceOf(state);
  return `
    ${tile("Accuracy", pct(e.accuracy), e.calls ? `${e.correct} of ${e.calls} calls right` : "No calls made", e.accuracy)}
    ${tile("Threats caught", `${e.caught}<small>/${e.threats}</small>`, `${e.missed} dismissed · ${e.timedOutThreats} aged out`, e.threats ? e.caught / e.threats : 1)}
    ${tile("Noise filtered", `${e.filtered}<small>/${e.noise}</small>`, `${e.wasted} escalated · ${e.timedOutNoise} aged out`, e.noise ? e.filtered / e.noise : 1)}`;
}

function tile(label: string, value: string, note: string, ratio: number): string {
  const tone = ratio >= 0.85 ? "good" : ratio >= 0.6 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}</strong><p>${esc(note)}</p></div>`;
}

function habitLine(): string {
  const e = evidenceOf(state);
  if (!e.calls) return "No calls made. In a real queue, unread alerts are how threats slip through.";
  if (e.lean === "escalate") return "You leaned towards <strong>escalating</strong>. It feels safe, but every wasted escalation buries the real ones and burns analyst time. Look for the detail that explains the alert away.";
  if (e.lean === "dismiss") return "You leaned towards <strong>dismissing</strong>. Fatigue does that. A missed threat costs most: look for the detail no normal user leaves behind.";
  if (e.wasted + e.missed === 0) return "Every call matched the evidence.";
  return "Your mistakes were balanced between wasted escalations and missed threats.";
}

function debriefList(limit?: number): string {
  const lines = debriefLines(state);
  const shown = limit ? lines.slice(0, limit) : lines;
  if (!lines.length) return `<p>No missed threats and no wasted escalations.</p>`;
  return `<ul class="debrief-lines">${shown
    .map(
      (line) => `<li class="${line.kind}">
        <span class="tag">${line.kind === "missed" ? "Missed threat" : "Wasted escalation"}</span>
        <code class="line">${lineHtml(line.alert, true)}</code>
        <span class="reason">${esc(line.reason)}</span>
      </li>`,
    )
    .join("")}</ul>${limit && lines.length > limit ? `<p class="muted small">${lines.length - limit} more not shown.</p>` : ""}`;
}

function renderDebrief(): void {
  report();
  const score = scoreOf(state);
  const lines = debriefLines(state);
  const missed = lines.filter((line) => line.kind === "missed").length;
  const wasted = lines.length - missed;
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(ORG)} SOC · ${CONFIG.durationMs / 1000}-second shift</p>
        <h2 id="debrief-title" tabindex="-1">Score ${score.points}<small>/${score.best} possible</small></h2>
        <p class="muted">${missed} missed threat${missed === 1 ? "" : "s"} · ${wasted} wasted escalation${wasted === 1 ? "" : "s"} · ${score.swampedCalls} call${score.swampedCalls === 1 ? "" : "s"} made while the analysts were swamped.</p>
      </header>
      <section class="panel">
        <h3>Learning evidence <span class="muted small">(accuracy of your calls, separate from points)</span></h3>
        <div class="score-grid three">${evidenceTiles()}</div>
        <p>${habitLine()}</p>
      </section>
      <section class="panel">
        <h3>What to look at again</h3>
        ${debriefList()}
      </section>
      <div class="debrief-actions">
        <a class="btn" href="?mode=wait">30-second round</a>
        <button class="btn primary" data-act="retry">New shift</button>
      </div>
      <p class="fineprint">Prototype · Fictional content to be reviewed with SMEs (docs/design/ALERT_OR_NOISE.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

// Wait mode: a compact result in place of the console. No dialog, no prompt.
function renderWaitResult(): void {
  report();
  const score = scoreOf(state);
  lastSignature = "";
  renderNextStep($("#next-step"), { label: state.stoppedEarly ? "Stopped" : "Done", tone: "ready", text: state.stoppedEarly ? "Round stopped. Nothing to save." : "Round over. Another one if you are still waiting." });
  $("#status").innerHTML = `<div class="clock">${CLOCK}<span>0:00</span></div><div class="count"><strong>${score.points}</strong><span>Points</span></div>`;
  $("#console-head").innerHTML = `<h2>${BELL} Round over</h2><span>Score ${score.points} of ${score.best}</span>`;
  if (state.stoppedEarly && !evidenceOf(state).calls) {
    $("#console").innerHTML = `<div class="wait-result"><p>Round stopped before any calls. Nothing to save.</p><div class="bench-actions"><button class="btn" data-act="again">Play a round</button></div></div>`;
    return;
  }
  $("#console").innerHTML = `
    <div class="wait-result">
      <div class="score-grid three">${evidenceTiles()}</div>
      <p>${habitLine()}</p>
      ${debriefList(3)}
      <div class="bench-actions"><button class="btn primary" data-act="again">Another round</button></div>
    </div>`;
  if (!state.stoppedEarly) document.querySelector<HTMLElement>("[data-act=again]")?.focus();
}

// ---------- input ----------
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-call]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.call) return onCall(target.dataset.call as Call);
  const act = target.dataset.act;
  if (act === "next") onNextGuided();
  else if (act === "start") arm();
  else if (act === "retry") start();
  else if (act === "again") {
    start();
    arm();
  }
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || isTutorialOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const onButton = (event.target as HTMLElement).tagName === "BUTTON";
  if (key === "arrowright" || key === "e") onCall("escalate");
  else if (key === "arrowleft" || key === "d") onCall("dismiss");
  else if (key === "n" || (key === "enter" && !onButton)) {
    if (state.phase === "guided" && state.guidedAnswered) onNextGuided();
    else if (MODE === "wait" && !armed) arm();
    else return;
  } else return;
  event.preventDefault();
});

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const type = (event.data as { type?: unknown } | null)?.type;
  if (type === "ares:practice:stop") stopNow();
});

// ---------- tutorial ----------
function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your shift",
      body: `
        <p class="tut-lead">You are on the alert console at ${esc(ORG)}. For ${CONFIG.durationMs / 1000} seconds, a new alert arrives every ${CONFIG.intervalMs / 1000} seconds.</p>
        <p class="tut-lead">Most are <strong>noise</strong>: backups, updates, typos, planned changes. A few are <strong>real threats</strong>. Your job is to tell them apart.</p>
        <p class="tut-note">${BELL}<span>The alert type never decides it. One detail in the line does: an approved ticket, a VPN exit, a residential ISP, a 3 a.m. change.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the top alert</b><span class="how">You always work the oldest alert. Others wait below it. An alert left waiting ${CONFIG.ttlMs / 1000} s ages out.</span></span></li>
          <li><span><b>Escalate or Dismiss</b><span class="how"><span class="tut-pill">Escalate</span> (<kbd>→</kbd> or <kbd>E</kbd>) sends it to the analysts. <span class="tut-pill">Dismiss</span> (<kbd>←</kbd> or <kbd>D</kbd>) closes it as noise.</span></span></li>
          <li><span><b>Watch the analyst queue</b><span class="how">Every escalation adds a case. The team closes one every ${CONFIG.drainMs / 1000} s. Over ${CONFIG.capacity} open cases they are swamped.</span></span></li>
        </ol>
        <p class="tut-muted">The first ${GUIDED.length} alerts are guided: the clock is paused and the deciding detail is highlighted.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>+${POINTS.hit}</b>Threat escalated (+${POINTS.hitSwamped} if the analysts are swamped).</div>
          <div><b>+${POINTS.correctReject}</b>Noise dismissed.</div>
          <div><b>${POINTS.falseAlarm}</b>Noise escalated (${POINTS.falseAlarmSwamped} if swamped). It also adds to the queue.</div>
          <div><b>${POINTS.miss}</b>Threat dismissed or left to age out.</div>
        </div>
        <p>Escalating everything swamps the team and loses. Dismissing everything misses the attacks and loses more. The debrief reports your <strong>accuracy</strong> separately from points, with the reason for every miss.</p>
        ${retry ? `<p class="tut-note">${BELL}<span>New shift: a fresh mix of alerts.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-motion" ${settings.reducedMotion ? "checked" : ""} /> Reduce motion</label>
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
  root.querySelector<HTMLInputElement>("#opt-motion")!.addEventListener("change", (event) => {
    settings.reducedMotion = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
}

function start(): void {
  const retry = attempt > 0;
  attempt += 1;
  state = createGame(CONFIG, buildStream(POOL, streamLength(CONFIG), seedFor(attempt)), MODE === "full" && !retry ? GUIDED : []);
  armed = false;
  lastCall = null;
  reported = false;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", { mode: MODE });
  render();
  if (MODE === "wait") {
    document.querySelector<HTMLElement>("[data-act=start]")?.focus();
    return;
  }
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${ORG} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start the shift" : "Open the console",
    onStart: arm,
    onLastPage: bindSettings,
  });
}

if (MODE === "full") {
  addHelpButton(() => {
    if ($("#game").hidden) return;
    showTutorial({ kicker: `${ORG} · How to play`, pages: tutorialPages(false), startLabel: "Back to the console", midGame: true, onStart: () => {}, onLastPage: bindSettings });
  });
}

start();
lastFrame = performance.now();
window.setInterval(frame, 100);
