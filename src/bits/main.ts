import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings, showModal } from "../ui/dom";
import { SCENARIO } from "./data";
import { BITS, allTasks, createGame, currentTask, fitPrefix, maskOctet, next, prefixOf, reveal, stageOf, submit, summarize, takeHint, toBinary, toggle, usable, type Check, type GameState, type Task } from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-bit-by-bit/the-new-depot/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GEAR = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l3 5 6-1 1 6 5 3-2 6 2 6-5 3-1 6-6-1-3 5-3-5-6 1-1-6-5-3 2-6-2-6 5-3 1-6 6 1z" fill="currentColor" opacity=".9"/><circle cx="24" cy="24" r="8" fill="#050b18"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let feedback: (Check & { hint?: boolean }) | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const task = currentTask(state);
  const stage = stageOf(SCENARIO, task.id);
  const tasks = allTasks(SCENARIO);
  const record = state.records[state.index];
  const solved = state.phase === "solved";
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${tasks.length}</strong><span>Task</span></div>
    <div class="count"><strong>${summarize(state).total}</strong><span>Points</span></div>`;
  $("#plan").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Depot plan</h2><span class="phase-pill">${esc(SCENARIO.base)}.0/24</span></div>
    <div class="d-scroll">
      <div class="panel-ports" aria-label="Progress">${tasks
        .map((_, index) => {
          const rec = state.records[index];
          const cls = rec.solved ? (rec.revealed ? "shown" : rec.attempts === 1 ? "first" : "later") : index === state.index ? "now" : "";
          return `<span class="port ${cls}" title="Task ${index + 1}"></span>`;
        })
        .join("")}</div>
      ${SCENARIO.stages
        .map(
          (entry) => `<section class="stage ${entry.id === stage.id ? "on" : ""}">
            <h3>${esc(entry.title)}</h3>
            ${entry.id === stage.id ? `<p>${esc(entry.lesson)}</p>` : ""}
          </section>`,
        )
        .join("")}
      <p class="muted small">Points: 10 right first time, 6 on the second check, 3 after that. Hints are free and counted separately.</p>
    </div>`;
  $("#bench").innerHTML = `
    <div class="col-head"><h2>${esc(stage.title)}</h2><span>Task ${state.index + 1} of ${tasks.length}</span></div>
    <div class="d-scroll bench-body">
      <p class="prompt">${esc(task.prompt)}</p>
      ${context(task)}
      <div class="gears" role="group" aria-label="Bit gears, last octet">
        ${BITS.map(
          (bit, index) => `<button class="gear ${state.bits & bit ? "on" : ""}" data-bit="${bit}" aria-pressed="${!!(state.bits & bit)}" ${solved ? "disabled" : ""} aria-label="${bit}: ${state.bits & bit ? "on" : "off"}">
            ${GEAR}<b>${bit}</b><kbd>${index + 1}</kbd></button>`,
        ).join("")}
      </div>
      ${readout(task)}
      ${feedback ? `<div class="feedback-box ${feedback.hint ? "hint" : feedback.ok ? "good" : "bad"}" role="status">${feedback.hint ? "<strong>Hint.</strong> " : feedback.ok ? `<strong>${record.revealed ? "Answer shown." : "Correct."}</strong> ` : "<strong>Not yet.</strong> "}${esc(feedback.message)}</div>` : ""}
      <div class="bench-actions">
        ${
          solved
            ? `<button class="btn primary" data-act="next">${state.index + 1 < tasks.length ? "Next task" : "See debrief"} <kbd>N</kbd></button>`
            : `<button class="btn primary" data-act="check">Check <kbd>Enter</kbd></button>
               <button class="btn" data-act="hint">Hint <kbd>H</kbd></button>
               <button class="btn ghost" data-act="reveal">Show answer</button>`
        }
      </div>
    </div>`;
}

function bitsRow(label: string, value: number, cls: string): string {
  return `<div class="bitrow ${cls}"><span class="lab">${label}</span>${toBinary(value)
    .split("")
    .map((digit) => `<i class="${digit === "1" ? "one" : ""}">${digit}</i>`)
    .join("")}<span class="dec">${value}</span></div>`;
}

function context(task: Task): string {
  if (task.kind === "network") {
    return `<div class="and">${bitsRow(`Address .${task.host}`, task.host, "addr")}${bitsRow(`Mask /${task.prefix}`, maskOctet(task.prefix), "mask")}<div class="and-line">AND ↓ build the result below</div></div>`;
  }
  if (task.kind === "mask" || task.kind === "size") return `<p class="mask-frame">255 . 255 . 255 . <b>?</b></p>`;
  return `<p class="mask-frame">${esc(SCENARIO.base)} . <b>?</b></p>`;
}

function readout(task: Task): string {
  const value = state.bits;
  let extra = "";
  if (task.kind === "mask" || task.kind === "size") {
    const prefix = prefixOf(value);
    extra = prefix === null ? `<span class="warn-text">not a valid mask (gaps in the ones)</span>` : `<span>/${prefix} · ${usable(prefix)} usable hosts</span>`;
    if (task.kind === "size") extra += `<span class="muted">need ${task.need}</span>`;
  }
  return `<div class="readout">${bitsRow("You built", value, "you")}<div class="extra">${extra}</div></div>`;
}

function onCheck(): void {
  if (state.phase !== "play") return;
  feedback = submit(state);
  play(feedback.ok ? "success" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: currentTask(state).id, result: { correct: feedback.ok, value: state.bits } });
  announce(feedback.message);
  render();
  document.querySelector<HTMLElement>(feedback.ok ? "[data-act=next]" : "[data-act=check]")?.focus();
}

function onAction(event: Event): void {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-bit]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.bit) {
    toggle(state, Number(target.dataset.bit));
    play("click");
    feedback = feedback?.hint ? feedback : null;
    render();
    document.querySelector<HTMLElement>(`[data-bit="${target.dataset.bit}"]`)?.focus();
    return;
  }
  const act = target.dataset.act;
  if (act === "check") onCheck();
  else if (act === "hint") {
    feedback = { ok: false, message: takeHint(state), hint: true };
    render();
  } else if (act === "reveal") {
    feedback = reveal(state);
    play("click");
    render();
  } else if (act === "next") goNext();
  else if (act === "retry") start();
}

function goNext(): void {
  next(state);
  feedback = null;
  render();
  if (state.phase === "done") return;
  announce(currentTask(state).prompt);
  document.querySelector<HTMLElement>(".gear")?.focus();
}

document.addEventListener("click", onAction);
document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (/^[1-8]$/.test(key) && state.phase === "play") {
    toggle(state, BITS[Number(key) - 1]);
    play("click");
    render();
  } else if (key === "enter" && state.phase === "play" && !(event.target instanceof HTMLButtonElement)) onCheck();
  else if (key === "h" && state.phase === "play") {
    feedback = { ok: false, message: takeHint(state), hint: true };
    render();
  } else if (key === "n" && state.phase === "solved") goNext();
  else return;
  event.preventDefault();
});

function renderDebrief(): void {
  const summary = summarize(state);
  const misses = state.records.filter((record) => record.wrong.length || record.revealed);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, tasks: state.records });
  try {
    localStorage.setItem("ares-bits:lastResult", JSON.stringify(summary));
  } catch {
    // Optional.
  }
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Network maths ${summary.total}<small>/100</small></h2>
        <p class="muted">${summary.firstTry} of ${state.records.length} right first time · ${summary.hints} hint${summary.hints === 1 ? "" : "s"} used (not scored) · ${summary.revealed} shown.</p>
      </header>
      <div class="score-grid wide">${summary.byStage.map((entry) => tile(entry.title, entry.points, entry.max)).join("")}</div>
      <section class="panel">
        <h3>The depot plan you built</h3>
        <table class="plan-table"><thead><tr><th scope="col">Segment</th><th scope="col">Mask</th><th scope="col">Usable hosts</th></tr></thead><tbody>
          ${allTasks(SCENARIO)
            .filter((task) => task.kind === "size")
            .map((task) => {
              const t = task as Extract<Task, { kind: "size" }>;
              const fit = fitPrefix(t.need);
              return `<tr><th scope="row">${esc(t.label)} (${t.need})</th><td>/${fit} = 255.255.255.${maskOctet(fit)}</td><td>${usable(fit)}</td></tr>`;
            })
            .join("")}</tbody></table>
        <p class="muted small">Right-sized subnets limit what a compromised device can reach: a scanner VLAN of 62 addresses is easier to watch, and to isolate, than one flat /24.</p>
      </section>
      <section class="panel">
        <h3>Where it went wrong</h3>
        ${
          misses.length
            ? `<ul class="habits">${misses
                .map((record) => {
                  const task = allTasks(SCENARIO).find((entry) => entry.id === record.task)!;
                  return `<li><strong>${esc(task.prompt)}</strong><br /><span class="muted">${record.revealed ? "Answer shown." : esc(record.wrong[0])}</span></li>`;
                })
                .join("")}</ul>`
            : `<p>Nothing: every task right first time.</p>`
        }
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Content pending SME review (docs/design/BIT_BY_BIT.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

function start(): void {
  state = createGame(SCENARIO);
  feedback = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  showModal({
    kicker: `${SCENARIO.org} · Network build`,
    title: SCENARIO.title,
    body: `
      <p>The new depot gets <strong>${SCENARIO.base}.0/24</strong>. Before anything is plugged in, someone has to carve it into segments, and later work out which segment an alert came from.</p>
      <ol class="brief-steps">
        <li>${GEAR}<span><strong>Every answer is one octet:</strong> eight gears worth 128, 64, 32 … 1. Turn gears on until they add up. Keys <kbd>1</kbd>–<kbd>8</kbd>.</span></li>
        <li>${GEAR}<span><strong>Four skills:</strong> binary, masks, sizing a subnet, and finding the network an address belongs to.</span></li>
        <li>${GEAR}<span><strong>Check</strong> as often as you like. Every wrong check explains what is off. Hints are free.</span></li>
      </ol>
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>`,
    actions: [{ label: "Open the workbench", primary: true, onClick: () => document.querySelector<HTMLElement>(".gear")?.focus() }],
    onMount: (root) =>
      root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
        settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
        setSoundEnabled(settings.sound);
      }),
  });
}

start();
