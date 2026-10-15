import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import { BITS, POINTS, allTasks, createGame, currentTask, fitPrefix, maskOctet, next, prefixOf, reveal, stageOf, submit, summarize, takeHint, toBinary, toggle, usable, type Check, type GameState, type Task } from "./engine";

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
  $("#bench-head").innerHTML = `<h2>${esc(stage.title)}</h2><span>Task ${state.index + 1} of ${tasks.length}</span>`;
  $("#bench").innerHTML = `
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
      </div>`;
  renderNext(task);
}

// The "Next" bar above the workbench: what to do now, in the words on the buttons. It explains
// the method and reads back what the screen shows; it never says whether a build is right.
function renderNext(task: Task): void {
  const bar = $("#next-step");
  const record = state.records[state.index];
  const last = state.index + 1 >= allTasks(SCENARIO).length;
  let step: NextStep;
  if (state.phase === "solved") {
    step = {
      label: "Done",
      tone: "ready",
      text: `${record.revealed ? "<strong>Answer shown</strong> (no points for this task)." : `<strong>Correct</strong>, +${record.points} points.`} Read the note, then press <strong>${last ? "See debrief" : "Next task"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else {
    const how: Record<Task["kind"], string> = {
      value: "Turn on gears until they add up to the number in the task.",
      mask: "Turn on gears from the left (128 first) for each network bit in the last octet.",
      size: "Work out how many host bits the devices need, then build the mask: ones from the left, zeros for the host bits.",
      network: "Keep a bit only where both the address row and the mask row have a 1.",
    };
    const invalidMask = (task.kind === "mask" || task.kind === "size") && state.bits !== 0 && prefixOf(state.bits) === null;
    if (invalidMask) {
      step = {
        label: "Check",
        tone: "warn",
        text: `<strong>${toBinary(state.bits)}</strong> has gaps in the ones, so it is not a valid mask.`,
        hint: "A mask is all ones on the left, then all zeros. Fix the gears before you press Check.",
        targets: [".gears"],
      };
    } else if (feedback && !feedback.ok && !feedback.hint) {
      step = {
        text: `<strong>Not yet.</strong> Read the note under the gears, change the gears, then press <strong>Check</strong> (<kbd>Enter</kbd>) again.`,
        hint: `Stuck? <strong>Hint</strong> (<kbd>H</kbd>) is free. Points for this task: ${POINTS[Math.min(record.attempts, POINTS.length - 1)]} if the next check is right.`,
        targets: ['[data-act="check"]'],
      };
    } else if (state.bits === 0) {
      step = {
        text: `${how[task.kind]} Click a gear, or press <kbd>1</kbd>–<kbd>8</kbd> (<kbd>1</kbd> is 128, <kbd>8</kbd> is 1).`,
        hint: feedback?.hint ? "The hint is in the yellow box above the buttons." : "The “You built” row shows your value in binary and decimal as you go.",
        targets: [".gears"],
      };
    } else {
      step = {
        text: `When the <strong>You built</strong> row shows your answer, press <strong>Check</strong> (<kbd>Enter</kbd>).`,
        hint: `${how[task.kind]} ${record.attempts === 0 ? "Right first time scores 10." : ""}`,
        targets: ['[data-act="check"]'],
      };
    }
  }
  renderNextStep(bar, step);
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

// The first-time walkthrough: the job, the workbench, the moves, a worked example of each kind
// of task (made-up numbers, not the real tasks), and how it is scored. Reopenable from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const tasks = allTasks(SCENARIO);
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">${esc(SCENARIO.org)} is opening a new depot, and its network gets <strong>${esc(SCENARIO.base)}.0/24</strong>: 256 addresses. Before anything is plugged in, someone has to split that range into segments, and later work out which segment an alert came from.</p>
        <p class="tut-lead">You work through ${tasks.length} short tasks in ${SCENARIO.stages.length} skills: ${SCENARIO.stages.map((stage) => `<strong>${esc(stage.title)}</strong>`).join(", ")}.</p>
        <p class="tut-note">${GEAR}<span>Only the <strong>last octet</strong> (the last number of the address) ever changes, so every answer is one number from 0 to 255, built from eight bits.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico disc">${GEAR}</span><span><b>Eight bit gears</b>Worth 128, 64, 32, 16, 8, 4, 2 and 1. A lit gear is a 1, a dark gear is a 0. Your answer is the sum of the lit gears.</span></div>
          <div><span class="tut-ico box">0/1</span><span><b>The “You built” row</b>Your current value in binary and in decimal. For mask tasks it also says which prefix (/26 and so on) and how many usable hosts that gives.</span></div>
          <div><span class="tut-ico box">AND</span><span><b>Address and mask rows</b>Shown only on “Which network?” tasks: the alert's last octet and its mask, bit by bit.</span></div>
          <div><span class="tut-ico box">▦</span><span><b>Depot plan (left)</b>One square per task: green right first time, amber after more checks, grey if you used Show answer. The current skill's lesson is shown under it.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Set the gears</b><span class="how">Click a gear to turn it on or off, or press <kbd>1</kbd>–<kbd>8</kbd> (<kbd>1</kbd> is 128, <kbd>8</kbd> is 1).</span></span></li>
          <li><span><b>Check your answer</b><span class="how">Press <span class="tut-pill">Check</span> (or <kbd>Enter</kbd>). Check as often as you like: a wrong check says what is off, but each one lowers the points for that task.</span></span></li>
          <li><span><b>Ask for help if you need it</b><span class="how"><span class="tut-pill">Hint</span> (or <kbd>H</kbd>) is free. <span class="tut-pill">Show answer</span> fills in the gears and explains, but the task then scores 0.</span></span></li>
          <li><span><b>Move on</b><span class="how">Once it is right, read the note and press <span class="tut-pill">Next task</span> (or <kbd>N</kbd>).</span></span></li>
        </ol>`,
    },
    {
      title: "How the four task types work",
      body: `
        <p>Made-up numbers, not the ones in the tasks.</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">Binary · build 13</span><span class="arrow">→</span><span>128, 64, 32, 16 are too big; 8 fits (5 left), 4 fits (1 left), 2 does not, 1 fits.</span></div>
          <div class="row"><span class="then">Lit gears:</span><span class="tag ok">8</span><span class="tag ok">4</span><span class="tag ok">1</span><span class="arrow">=</span><span>00001101</span></div>
        </div>
        <div class="tut-ex">
          <div class="row"><span class="tag">Mask · /25</span><span class="arrow">→</span><span>25 ones in total; the first 24 are the three 255s, so the last octet has 1 one, from the left: 10000000 = 128.</span></div>
          <div class="row"><span class="tag">Size · 20 devices</span><span class="arrow">→</span><span>Usable hosts = 2<sup>host bits</sup> − 2. 4 host bits give 14 (too few), 5 give 30. So 3 network bits: /27 = 11100000 = 224.</span></div>
          <div class="row"><span class="tag">Network · .45/29</span><span class="arrow">→</span><span>00101101 AND 11111000 = 00101000 = 40. The alert came from the .40/29 segment.</span></div>
        </div>
        <p class="tut-note">${GEAR}<span>For sizing, pick the <strong>smallest</strong> subnet that still fits: a bigger one works, but it is marked wrong because it wastes addresses and lets a compromised device reach more.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${POINTS[0]} <small>points</small></b>Right on the first check.</div>
          <div><b>${POINTS[1]} <small>points</small></b>Right on the second check.</div>
          <div><b>${POINTS[2]} <small>points</small></b>Right on any later check.</div>
          <div><b>0 <small>points</small></b>If you press Show answer.</div>
        </div>
        <p>${tasks.length} tasks, up to ${tasks.length * POINTS[0]} points. Hints are free: the debrief counts them, but they cost nothing. How fast you play is never scored.</p>
        ${retry ? `<p class="tut-note">${GEAR}<span>Starting again: same tasks, fresh score.</span></p>` : ""}
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
  state = createGame(SCENARIO);
  feedback = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    // A retry opens on the last page: the scoring reminder.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the workbench",
    onStart: () => document.querySelector<HTMLElement>(".gear")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
