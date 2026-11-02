import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, isTutorialOpen, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { FICTION_NOTE, FULL_INCIDENTS, QUICK_INCIDENTS } from "./data";
import {
  CHECK_PENALTY,
  CONTROLS,
  CONTROL_MAX,
  LATE_PENALTY,
  MARK_MAX,
  MAX_FAILED_CHECKS,
  ORDER_MAX,
  ROUND_MAX,
  canLockIn,
  check,
  chooseControl,
  earliestControls,
  evaluateControl,
  evidenceFor,
  hint,
  lockIn,
  markStop,
  moveBy,
  moveTo,
  newRound,
  objectives,
  scoreRound,
  timeLabel,
  totals,
  trueOrder,
  type Constraint,
  type ControlId,
  type Evidence,
  type Incident,
  type Round,
  type RoundScore,
  type TimelineEvent,
} from "./engine";

// ?mode=quick: one short incident, no walkthrough, no prompts, stops cleanly (range-wait mode).
const params = new URLSearchParams(location.search);
const QUICK = params.get("mode") === "quick" || params.has("quick");
const ACTIVITY_ID = QUICK ? "ares-breach-timeline/quick/v0.1" : "ares-breach-timeline/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const CONTROL_ICONS: Record<ControlId, string> = { mail: "✉", mfa: "◎", geo: "⌖", edr: "⛨", egress: "⇪" };

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = LOGO;
document.body.classList.toggle("quick", QUICK);

let seed = Math.floor(Math.random() * 100000);
let incidents: readonly Incident[] = QUICK ? [pickQuick()] : FULL_INCIDENTS;
let index = 0;
let round: Round = newRound(incidents[0], seed);
let scores: RoundScore[] = [];
let evidence: Evidence[] = [];
let hintEvent: TimelineEvent | null = null;
let focusSel: string | null = null;
let stopped = false;
let started = performance.now();

function pickQuick(): Incident {
  const asked = QUICK_INCIDENTS.find((incident) => incident.id === params.get("incident"));
  if (asked) return asked;
  let next = Math.floor(Math.random() * QUICK_INCIDENTS.length);
  try {
    const stored = Number(localStorage.getItem("ares-timeline:quickNext"));
    if (Number.isInteger(stored) && stored >= 0) next = stored % QUICK_INCIDENTS.length;
    localStorage.setItem("ares-timeline:quickNext", String(next + 1));
  } catch {
    // Optional: rotation only.
  }
  return QUICK_INCIDENTS[next];
}

const eventOf = (id: string) => round.incident.events.find((e) => e.id === id)!;
const controlName = (id: ControlId) => CONTROLS.find((c) => c.id === id)!.name;

function explain(c: Constraint): string {
  const before = eventOf(c.before);
  const after = eventOf(c.after);
  return c.kind === "dependency" ? `“${after.short}” can't come before “${before.short}”. ${c.why}` : `Check the stamps: ${c.why}`;
}

function clueVisible(event: TimelineEvent): boolean {
  return !!round.incident.guided || round.hints.includes(event.id) || round.phase === "done";
}

// ---------- render ----------

function render(): void {
  const inc = round.incident;
  const s = scoreRound(round);
  const runningTotal = scores.reduce((sum, r) => sum + r.total, 0) + (round.phase === "done" ? 0 : s.total);
  $("#status").innerHTML = `
    ${QUICK ? "" : `<div class="count"><strong>${index + 1}/${incidents.length}</strong><span>Incident</span></div>`}
    <div class="count"><strong>${round.phase === "order" ? MAX_FAILED_CHECKS - round.failedChecks : "–"}</strong><span>Checks left</span></div>
    <div class="count"><strong>${round.phase === "done" ? scores.reduce((sum, r) => sum + r.total, 0) : runningTotal}</strong><span>Score</span></div>`;
  renderCase();
  const head = round.phase === "order" ? "Put the events in order" : round.phase === "control" ? "Where could it have been stopped first?" : "What happened";
  const sub = round.phase === "order" ? "Earliest at the top" : round.phase === "control" ? "Pick a control, then mark its step" : `${s.total}/${ROUND_MAX} this incident`;
  $("#board-head").innerHTML = `<h2>${head}</h2><span>${sub}</span>`;
  const [top, bottom] = round.phase === "order" ? orderPanel() : round.phase === "control" ? controlPanel() : donePanel();
  $("#board").innerHTML = `
    <p class="inc-line"><b>${esc(inc.title)}</b> · ${esc(inc.org)}<span class="fic-tag" title="${esc(FICTION_NOTE)}">Fictionalised</span></p>
    ${QUICK && round.phase !== "done" ? `<p class="brief">${esc(inc.brief)}</p>` : ""}
    ${top}
    <ol class="timeline" id="tl" aria-label="Timeline, earliest first">${round.order.map((id, i) => card(eventOf(id), i)).join("")}</ol>
    ${bottom}`;
  if (stopped) $("#board").insertAdjacentHTML("afterbegin", `<p class="feedback-box hint" role="status"><strong>Stopped.</strong> Your range is ready. Nothing to save here.</p>`);
  renderNext();
  if (focusSel) {
    document.querySelector<HTMLElement>(focusSel)?.focus();
    focusSel = null;
  }
}

function renderCase(): void {
  const inc = round.incident;
  const phasePill = round.phase === "order" ? "Order" : round.phase === "control" ? "Stop it" : "Closed";
  $("#case").innerHTML = `
    <div class="col-head"><h2>Incident file</h2><span class="phase-pill">${phasePill}</span></div>
    <div class="d-scroll">
      <h3 class="case-title">${esc(inc.title)}<br /><small>${esc(inc.org)}</small></h3>
      <p class="brief">${esc(inc.brief)}</p>
      ${inc.guided ? `<div class="coach" role="note">${coachText()}</div>` : ""}
      <h4 class="sub-head">Reading the stamps</h4>
      <ul class="stamp-key">
        <li><span class="stamp m-full">Mon 08:52</span> exact</li>
        <li><span class="stamp m-hour">Mon 23:··</span> hour only</li>
        <li><span class="stamp m-day">Tue ··:··</span> day only</li>
        <li><span class="stamp m-none">Time not logged</span> use what each step needs</li>
      </ul>
      <h4 class="sub-head">The five controls</h4>
      <ul class="ctl-key">${CONTROLS.map((c) => `<li><b>${CONTROL_ICONS[c.id]} ${esc(c.name)}</b><span>${esc(c.does)}</span></li>`).join("")}</ul>
      <p class="muted small">Order ${ORDER_MAX} (−${CHECK_PENALTY} per failed check) · Control ${CONTROL_MAX} (earliest that works) · Stop point ${MARK_MAX}. Hints are free.</p>
    </div>`;
}

function coachText(): string {
  if (round.phase === "order")
    return `<strong>Guided incident.</strong> Every card shows what it <em>needs</em> (the yellow line). Start with the card that needs nothing. Then ask of each card: what must already have happened? Only use the stamps to settle cards that don't depend on each other.`;
  if (round.phase === "control")
    return `<strong>Guided incident.</strong> For each control ask: <em>would it have worked here at all?</em> Then: <em>which step would never happen?</em> The best answer is the earliest step any working control stops, not the most powerful-sounding control.`;
  return `<strong>Guided incident done.</strong> From here on the “needs” lines are hidden. Use <strong>Hint</strong> if you want one: it's free and doesn't change the score.`;
}

function card(event: TimelineEvent, i: number): string {
  const r = round;
  const clash = r.phase === "order" && r.lastCheck && !r.lastCheck.ok && r.lastCheck.explained && (r.lastCheck.explained.before === event.id || r.lastCheck.explained.after === event.id);
  const markIdx = r.mark ? r.order.indexOf(r.mark) : -1;
  const chosenStop = r.phase === "done" && r.control ? r.incident.controls[r.control].stops : null;
  const stopIdx = chosenStop ? r.order.indexOf(chosenStop) : -1;
  const prevented = r.phase === "control" ? markIdx >= 0 && i >= markIdx : r.phase === "done" ? stopIdx >= 0 && i >= stopIdx : false;
  const bites = r.phase === "done" ? CONTROLS.filter((c) => r.incident.controls[c.id].stops === event.id) : [];
  const best = r.phase === "done" ? earliestControls(r.incident) : [];
  const classes = ["ev", clash ? "clash" : "", prevented ? "prevented" : "", r.mark === event.id ? "cut" : "", r.phase === "done" && chosenStop === event.id ? "truestop" : ""].join(" ");
  const label = `${i + 1}. ${event.text} ${timeLabel(event)}`;
  const tail =
    r.phase === "order"
      ? `<span class="mv"><button type="button" class="mv-btn" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up: ${esc(event.short)}">▲</button><button type="button" class="mv-btn" data-move="1" ${i === r.order.length - 1 ? "disabled" : ""} aria-label="Move down: ${esc(event.short)}">▼</button></span>`
      : r.phase === "control"
        ? `<button type="button" class="mark-btn" data-mark="${event.id}" aria-pressed="${r.mark === event.id}" aria-label="Mark: ${esc(event.short)} would never happen">✂ Stops here</button>`
        : bites.length
          ? `<span class="bites">${bites.map((c) => `<span class="bite ${best.includes(c.id) ? "best" : ""} ${c.id === r.control ? "mine" : ""}">✂ ${esc(c.name)}</span>`).join("")}</span>`
          : "";
  return `<li class="${classes}" data-id="${event.id}" tabindex="0" aria-label="${esc(label)}">
    <span class="pos" aria-hidden="true">${i + 1}</span>
    ${r.phase === "order" ? `<span class="grip" data-grip aria-hidden="true" title="Drag to move">⠿</span>` : ""}
    <div class="ev-body">
      <span class="stamp m-${event.mask}">${event.mask === "none" ? "" : CLOCK}${esc(timeLabel(event))}</span>
      <p>${esc(event.text)}</p>
      ${clueVisible(event) && event.after.length ? `<span class="clue">Needs “${event.after.map((d) => esc(eventOf(d.id).short)).join("” and “")}” first.</span>` : ""}
    </div>
    ${tail}
  </li>`;
}

function orderPanel(): [string, string] {
  const last = round.lastCheck;
  const box =
    last && !last.ok && last.explained
      ? `<div class="feedback-box bad" role="status"><strong>Not yet: ${last.satisfied} of ${last.total} clues fit.</strong> ${esc(explain(last.explained))} The two cards are ringed.</div>`
      : hintEvent
        ? `<div class="feedback-box hint" role="status"><strong>Hint: “${esc(hintEvent.short)}”.</strong> ${esc(hintEvent.clue)} Its card now shows what it needs.</div>`
        : "";
  return [
    box,
    `<div class="bench-actions sticky">
      <button class="btn primary" data-act="check">Check order <kbd>C</kbd></button>
      ${round.incident.guided ? "" : `<button class="btn" data-act="hint">Hint <kbd>H</kbd></button>`}
    </div>`,
  ];
}

function controlPanel(): [string, string] {
  const last = round.lastCheck;
  const head = last?.revealed
    ? `<div class="feedback-box bad" role="status"><strong>Out of checks.</strong> The true order is laid out for you (0 order points). ${last.explained ? esc(explain(last.explained)) : ""}</div>`
    : `<div class="feedback-box good" role="status"><strong>Order confirmed.</strong> ${round.failedChecks ? `${round.failedChecks} failed check${round.failedChecks === 1 ? "" : "s"}.` : "First try."} Now: which control stops this attack earliest?</div>`;
  return [
    `${head}
    <div class="controls" role="group" aria-label="Controls">${CONTROLS.map(
      (c, i) => `<button type="button" class="ctl ${round.control === c.id ? "on" : ""}" data-control="${c.id}" aria-pressed="${round.control === c.id}">
        <span class="ctl-ico" aria-hidden="true">${CONTROL_ICONS[c.id]}</span><b>${esc(c.name)}</b><kbd>${i + 1}</kbd></button>`,
    ).join("")}</div>`,
    `<div class="bench-actions sticky">
      <button class="btn primary" data-act="lock" ${canLockIn(round) ? "" : "disabled"}>Lock in <kbd>L</kbd></button>
      <span class="muted small">${round.control ? `${esc(controlName(round.control))} selected.` : "No control yet."} ${round.mark ? `Stops at “${esc(eventOf(round.mark).short)}”.` : "No step marked yet."}</span>
    </div>`,
  ];
}

function donePanel(): [string, string] {
  const inc = round.incident;
  const s = scoreRound(round);
  const mine = evaluateControl(inc, round.control!);
  const best = earliestControls(inc);
  const verdict =
    mine.verdict === "earliest"
      ? `<strong>Earliest stop.</strong> ${esc(mine.why)}`
      : mine.verdict === "later"
        ? `<strong>Works, but ${mine.stepsLate} step${mine.stepsLate === 1 ? "" : "s"} late.</strong> ${esc(mine.why)} Earliest: ${best.map((b) => esc(controlName(b))).join(" or ")}.`
        : `<strong>Wouldn't have stopped it.</strong> ${esc(mine.why)} Earliest: ${best.map((b) => esc(controlName(b))).join(" or ")}.`;
  const markLine =
    mine.verdict === "none"
      ? ""
      : s.mark
        ? `<p class="match-line ok">Stop point right: “${esc(eventOf(mine.stops!).short)}” never happens.</p>`
        : `<p class="match-line over">You marked “${esc(eventOf(round.mark!).short)}”, but ${esc(controlName(round.control!))} acts at “${esc(eventOf(mine.stops!).short)}”.</p>`;
  const last = QUICK || index + 1 >= incidents.length;
  return [
    `<div class="feedback-box ${mine.verdict === "earliest" ? "good" : mine.verdict === "later" ? "hint" : "bad"}" role="status">${verdict}</div>
    ${markLine}
    <p class="score-line">Order <b>${s.order}</b>/${ORDER_MAX} · Control <b>${s.control}</b>/${CONTROL_MAX} · Stop point <b>${s.mark}</b>/${MARK_MAX} · <b>${s.total}</b>/${ROUND_MAX}</p>`,
    `<details class="all-controls" ${round.incident.guided ? "open" : ""}><summary>Why each control would or wouldn't work</summary>
      <ul class="breaks">${CONTROLS.map((c) => {
        const ev = evaluateControl(inc, c.id);
        return `<li class="${ev.verdict === "earliest" ? "best" : ev.verdict === "none" ? "none" : "ok"} ${c.id === round.control ? "mine" : ""}"><b>${CONTROL_ICONS[c.id]} ${esc(c.name)} · ${ev.stops ? `stops “${esc(eventOf(ev.stops).short)}”` : "doesn't stop it"}</b><span>${esc(ev.why)}</span></li>`;
      }).join("")}</ul>
    </details>
    ${summaryCard(inc)}
    <div class="bench-actions sticky">
      ${QUICK ? `<button class="btn primary" data-act="another">Another incident <kbd>N</kbd></button>` : `<button class="btn primary" data-act="next">${last ? "See debrief" : "Next incident"} <kbd>N</kbd></button>`}
    </div>`,
  ];
}

function summaryCard(inc: Incident): string {
  return `<article class="what-happened">
    <p class="kicker">What happened · ${esc(inc.org)}</p>
    <h3>${esc(inc.summary.headline)}</h3>
    <p>${esc(inc.summary.body)}</p>
    <p class="lesson"><b>Takeaway.</b> ${esc(inc.summary.lesson)}</p>
    <p class="fic">${esc(FICTION_NOTE)}</p>
  </article>`;
}

function renderNext(): void {
  const r = round;
  let step: NextStep;
  if (stopped) step = { label: "Stopped", tone: "ready", text: "Your range is ready. You can close this." };
  else if (r.phase === "order") {
    const last = r.lastCheck;
    step =
      last && !last.ok
        ? {
            label: "Not yet",
            tone: "warn",
            text: `Fix the two ringed cards, then <strong>Check order</strong> again. ${MAX_FAILED_CHECKS - r.failedChecks} check${MAX_FAILED_CHECKS - r.failedChecks === 1 ? "" : "s"} left.`,
            hint: `Each failed check costs ${CHECK_PENALTY} points. ${r.incident.guided ? "" : "<strong>Hint</strong> (<kbd>H</kbd>) is free."}`,
            targets: [".ev.clash"],
          }
        : {
            text: `Drag the cards (or use ▲▼, or focus a card and press <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>) into the order they happened, earliest at the top. Then <strong>Check order</strong> (<kbd>C</kbd>).`,
            hint: r.incident.guided
              ? "Follow the yellow “Needs” lines: a step can't come before what it needs."
              : "Some times aren't logged. Ask what each step needs: you can't sign in before the password is stolen.",
            targets: QUICK ? ["#tl"] : ['[data-act="check"]'],
          };
  } else if (r.phase === "control") {
    step = !r.control
      ? { text: `Pick the control that would have stopped this attack <strong>earliest</strong>: click it or press <kbd>1</kbd>–<kbd>5</kbd>.`, hint: "Some controls wouldn't work here at all. The strongest-sounding one isn't always the earliest.", targets: [".controls"] }
      : !r.mark
        ? { text: `Now click <strong>✂ Stops here</strong> on the first step that would <strong>never happen</strong> with ${esc(controlName(r.control))} in place.`, targets: ["#tl"] }
        : { label: "Ready", tone: "ready", text: `Press <strong>Lock in</strong> (<kbd>L</kbd>). You can still change the control or the step first.`, targets: ['[data-act="lock"]'] };
  } else {
    const s = scoreRound(r);
    step = {
      label: "Done",
      tone: "ready",
      text: `<strong>${s.total}/${ROUND_MAX}.</strong> Read why, and what happened. ${QUICK ? "Play another, or stop any time." : `Then press <strong>${index + 1 >= incidents.length ? "See debrief" : "Next incident"}</strong> (<kbd>N</kbd>).`}`,
      targets: [QUICK ? '[data-act="another"]' : '[data-act="next"]'],
    };
  }
  renderNextStep($("#next-step"), step);
}

// ---------- actions ----------

function doMove(id: string, delta: number): void {
  if (!moveBy(round, id, delta)) return;
  hintEvent = null;
  play("click");
  focusSel = `.ev[data-id="${id}"]`;
  render();
  announce(`${eventOf(id).short}: position ${round.order.indexOf(id) + 1} of ${round.order.length}.`);
}

function doCheck(): void {
  const result = check(round);
  if (!result) return;
  hintEvent = null;
  post("statement", { at: new Date().toISOString(), verb: "checked-order", object: round.incident.id, result: { ok: result.ok, satisfied: result.satisfied, total: result.total, revealed: result.revealed } });
  play(result.ok ? "success" : "setback");
  announce(result.ok ? "Order confirmed. Pick the control that stops it earliest." : `Not yet. ${result.explained ? explain(result.explained) : ""}`);
  focusSel = round.phase === "control" ? ".ctl" : ".ev.clash";
  render();
}

function doHint(): void {
  if (round.incident.guided) return;
  const event = hint(round);
  if (!event) return;
  hintEvent = event;
  play("click");
  render();
  announce(`Hint: ${event.short}. ${event.clue}`);
}

function doControl(id: ControlId): void {
  if (!chooseControl(round, id)) return;
  play("click");
  focusSel = `[data-control="${id}"]`;
  render();
  announce(`${controlName(id)} selected. Now mark the first step it would stop.`);
}

function doMark(id: string): void {
  if (!markStop(round, id)) return;
  play("click");
  focusSel = `[data-mark="${id}"]`;
  render();
  announce(`Marked: ${eventOf(id).short}.`);
}

function doLock(): void {
  if (!lockIn(round)) return;
  const s = scoreRound(round);
  const ev = evidenceFor(round);
  scores.push(s);
  evidence.push(ev);
  play(ev.controlVerdict === "earliest" ? "success" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "completed", object: round.incident.id, result: { score: s, evidence: ev } });
  if (QUICK) {
    post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: totals(scores), evidence });
  }
  focusSel = QUICK ? '[data-act="another"]' : '[data-act="next"]';
  render();
  announce(evaluateControl(round.incident, round.control!).why);
}

function doNext(): void {
  if (round.phase !== "done") return;
  if (index + 1 >= incidents.length) return finish();
  index += 1;
  round = newRound(incidents[index], seed + index * 31);
  hintEvent = null;
  focusSel = ".ev";
  render();
  announce(`${round.incident.title}. ${round.incident.brief}`);
}

function doAnother(): void {
  if (round.phase !== "done") return;
  seed += 1;
  incidents = [pickQuickNext()];
  index = 0;
  round = newRound(incidents[0], seed);
  scores = [];
  evidence = [];
  hintEvent = null;
  started = performance.now();
  focusSel = ".ev";
  post("started", { incident: round.incident.id });
  render();
}

function pickQuickNext(): Incident {
  const pos = QUICK_INCIDENTS.indexOf(round.incident);
  const next = QUICK_INCIDENTS[(pos + 1) % QUICK_INCIDENTS.length];
  try {
    localStorage.setItem("ares-timeline:quickNext", String((QUICK_INCIDENTS.indexOf(next) + 1) % QUICK_INCIDENTS.length));
  } catch {
    // Optional.
  }
  return next;
}

// The host can end quick play the moment the range is ready: no prompt, nothing to lose.
function stop(): void {
  if (stopped) return;
  stopped = true;
  post("stopped", { incident: round.incident.id, phase: round.phase, evidence: round.phase === "done" ? evidence : [evidenceFor(round)] });
  render();
  document.querySelectorAll<HTMLButtonElement>("#board button").forEach((b) => (b.disabled = true));
}
window.addEventListener("message", (event) => {
  if (event.source === window.parent && event.data && (event.data.type === "ares:practice:stop" || event.data.type === "ares:host:stop")) stop();
});

document.addEventListener("click", (event) => {
  if (stopped) return;
  const t = event.target as HTMLElement;
  const move = t.closest<HTMLButtonElement>("[data-move]");
  if (move && !move.disabled) return doMove(move.closest<HTMLElement>(".ev")!.dataset.id!, Number(move.dataset.move));
  const ctl = t.closest<HTMLElement>("[data-control]");
  if (ctl) return doControl(ctl.dataset.control as ControlId);
  const mark = t.closest<HTMLElement>("[data-mark]");
  if (mark) return doMark(mark.dataset.mark!);
  if (round.phase === "control" && t.closest(".ev") && !t.closest("button")) return doMark(t.closest<HTMLElement>(".ev")!.dataset.id!);
  const act = t.closest<HTMLButtonElement>("[data-act]");
  if (!act || act.disabled) return;
  const name = act.dataset.act;
  if (name === "check") doCheck();
  else if (name === "hint") doHint();
  else if (name === "lock") doLock();
  else if (name === "next") doNext();
  else if (name === "another") doAnother();
  else if (name === "retry") restart();
});

document.addEventListener("keydown", (event) => {
  if (stopped || isModalOpen() || isTutorialOpen() || $("#game").hidden || event.ctrlKey || event.metaKey) return;
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".ev");
  const key = event.key;
  if (focused && (key === "ArrowUp" || key === "ArrowDown")) {
    const delta = key === "ArrowUp" ? -1 : 1;
    if ((event.altKey || event.shiftKey) && round.phase === "order") doMove(focused.dataset.id!, delta);
    else {
      const sibling = (delta < 0 ? focused.previousElementSibling : focused.nextElementSibling) as HTMLElement | null;
      sibling?.focus();
    }
    event.preventDefault();
    return;
  }
  if (event.altKey) return;
  if (focused && round.phase === "control" && (key === "Enter" || key === " ") && event.target === focused) {
    doMark(focused.dataset.id!);
    event.preventDefault();
    return;
  }
  const k = key.toLowerCase();
  if (k === "c" && round.phase === "order") doCheck();
  else if (k === "h" && round.phase === "order") doHint();
  else if (/^[1-5]$/.test(k) && round.phase === "control") doControl(CONTROLS[Number(k) - 1].id);
  else if (k === "l" && round.phase === "control") doLock();
  else if (k === "n" && round.phase === "done") (QUICK ? doAnother : doNext)();
  else return;
  event.preventDefault();
});

// ---------- drag (pointer events: mouse anywhere on a card, touch/pen on the grip) ----------

let drag: { id: string; el: HTMLElement; startY: number; active: boolean; target: number } | null = null;

document.addEventListener("pointerdown", (event) => {
  if (stopped || round.phase !== "order" || event.button !== 0) return;
  const t = event.target as HTMLElement;
  const el = t.closest<HTMLElement>(".ev");
  if (!el || t.closest("button")) return;
  if (event.pointerType !== "mouse" && !t.closest("[data-grip]")) return;
  drag = { id: el.dataset.id!, el, startY: event.clientY, active: false, target: round.order.indexOf(el.dataset.id!) };
  el.setPointerCapture(event.pointerId);
});

document.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dy = event.clientY - drag.startY;
  if (!drag.active && Math.abs(dy) < 6) return;
  drag.active = true;
  drag.el.classList.add("dragging");
  drag.el.style.transform = `translateY(${dy}px)`;
  const others = [...drag.el.parentElement!.children].filter((c) => c !== drag!.el) as HTMLElement[];
  let target = 0;
  for (const other of others) {
    const r = other.getBoundingClientRect();
    if (event.clientY > r.top + r.height / 2) target += 1;
  }
  drag.target = target;
  others.forEach((o, i) => {
    o.classList.toggle("drop-before", i === target);
    o.classList.toggle("drop-after", target === others.length && i === others.length - 1);
  });
  event.preventDefault();
});

function endDrag(commit: boolean): void {
  if (!drag) return;
  const { id, active, target } = drag;
  drag = null;
  if (active && commit && moveTo(round, id, target)) {
    hintEvent = null;
    play("click");
    announce(`${eventOf(id).short}: position ${target + 1} of ${round.order.length}.`);
  }
  if (active) {
    focusSel = `.ev[data-id="${id}"]`;
    render();
  }
}
document.addEventListener("pointerup", () => endDrag(true));
document.addEventListener("pointercancel", () => endDrag(false));

// ---------- debrief (full mode) ----------

function finish(): void {
  const t = totals(scores);
  const objs = objectives(evidence);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: { ...t, incidents: scores }, evidence: { objectives: objs, incidents: evidence } });
  try {
    localStorage.setItem("ares-timeline:lastResult", JSON.stringify({ score: t, objectives: objs.map((o) => ({ id: o.id, status: o.status })) }));
  } catch {
    // Optional.
  }
  const late = evidence.filter((e) => e.controlVerdict === "later").length;
  const none = evidence.filter((e) => e.controlVerdict === "none").length;
  const dep = evidence.reduce((s, e) => s + e.dependencySlips, 0);
  const time = evidence.reduce((s, e) => s + e.timeSlips, 0);
  const habits = [
    none ? `<li><strong>${none} control${none === 1 ? "" : "s"} that wouldn't have worked.</strong> Check each control against <em>this</em> attack: no email means no mail filter; an approved push means MFA was already beaten.</li>` : "",
    late ? `<li><strong>${late} late stop${late === 1 ? "" : "s"}.</strong> A control that works later still lets the earlier steps happen. Look for the first step any working control touches.</li>` : "",
    dep > time && dep ? `<li><strong>Dependencies tripped you more than timestamps.</strong> For each card ask: what must already be true for this to happen?</li>` : "",
    time > dep ? `<li><strong>Timestamps tripped you more than dependencies.</strong> A day-only stamp still orders cards on different days; an hour-only stamp doesn't settle two cards in the same hour.</li>` : "",
  ].join("");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · Breach Timeline</p>
        <h2 id="debrief-title" tabindex="-1">Score ${t.total}<small>/${t.max}</small></h2>
        <p class="muted">${incidents.length} incidents · ordering, earliest control and stop point. Speed and hints are never scored.</p>
      </header>
      <section class="panel"><h3>Incident by incident</h3>
        <table class="plan-table"><thead><tr><th scope="col">Incident</th><th scope="col">Order</th><th scope="col">Control</th><th scope="col">Stop point</th><th scope="col">Total</th></tr></thead><tbody>
          ${scores.map((s, i) => `<tr><th scope="row">${esc(incidents[i].title)}</th><td>${s.order}/${ORDER_MAX}</td><td>${s.control}/${CONTROL_MAX}</td><td>${s.mark}/${MARK_MAX}</td><td>${s.total}</td></tr>`).join("")}
        </tbody></table>
      </section>
      <section class="panel evidence"><h3>Learning evidence <span class="muted small">(recorded separately, not part of the score)</span></h3>
        <ul class="obj-list">${objs.map((o) => `<li class="obj ${o.status.replace(" ", "-")}"><span class="obj-status">${o.status === "shown" ? "✓ Shown" : o.status === "partly" ? "◐ Partly" : "○ Not yet"}</span><span><b>${esc(o.text)}</b><small>${esc(o.detail)}</small></span></li>`).join("")}</ul>
        <table class="plan-table"><thead><tr><th scope="col">Incident</th><th scope="col">First check right</th><th scope="col">Hints</th><th scope="col">Failed checks</th><th scope="col">Control</th><th scope="col">Stop point</th></tr></thead><tbody>
          ${evidence.map((e, i) => `<tr><th scope="row">${esc(incidents[i].title)}${e.guided ? ' <span class="muted small">(guided)</span>' : ""}</th><td>${e.orderFirstTry ? "Yes" : "No"}</td><td>${e.guided ? "shown" : e.hints}</td><td>${e.failedChecks}${e.revealed ? " (revealed)" : ""}</td><td>${e.controlVerdict === "earliest" ? "Earliest" : e.controlVerdict === "later" ? `${e.stepsLate} step${e.stepsLate === 1 ? "" : "s"} late` : "Wouldn't work"}</td><td>${e.controlVerdict === "none" ? "–" : e.markCorrect ? "Right" : "Wrong"}</td></tr>`).join("")}
        </tbody></table>
      </section>
      <section class="panel"><h3>Your habits</h3>${habits ? `<ul class="habits">${habits}</ul>` : `<p>Clean run: right order, earliest working control, right stop point.</p>`}</section>
      <section class="panel"><h3>What happened</h3><div class="summaries">${incidents.map(summaryCard).join("")}</div></section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Play again</button></div>
      <p class="fineprint">Fictionalised incidents · Prototype · Content to be reviewed with SMEs (docs/design/BREACH_TIMELINE.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

// ---------- walkthrough ----------

const KICKER = "Breach Timeline · How to play";

function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You're the incident analyst. For each of ${FULL_INCIDENTS.length} fictional incidents the event log arrives <strong>shuffled</strong>, and some timestamps are missing.</p>
        <ol class="tut-moves">
          <li><span><b>Rebuild the timeline</b><span class="how">Put the events in the order they happened. Where a time is missing, work it out from what each step <em>needs</em>: nobody signs in with a password before it is stolen.</span></span></li>
          <li><span><b>Stop it first</b><span class="how">Pick the control that would have stopped the attack <strong>earliest</strong>, and mark the step it stops.</span></span></li>
        </ol>
        <p class="tut-note"><span>The first incident is guided: every card shows what it needs.</span></p>`,
    },
    {
      title: "Reading the cards",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">⏱</span><span><b>Mon 08:52</b>Exact time. Two exact times settle their order.</span></div>
          <div><span class="tut-ico box">··</span><span><b>Mon 23:··</b>Hour only. Settles cards in different hours, not in the same hour.</span></div>
          <div><span class="tut-ico box">·</span><span><b>Tue ··:··</b>Day only. Settles cards on different days.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Time not logged</b>Only dependencies can place it.</span></div>
        </div>
        <p class="tut-muted">Sorting by time alone never works: you always need at least one dependency.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Move cards</b><span class="how">Drag a card (on touch, use the ⠿ grip), or use its ▲▼ buttons, or focus it and press <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>. Earliest goes at the top.</span></span></li>
          <li><span><b>Check order</b><span class="how"><span class="tut-pill">Check order</span> (<kbd>C</kbd>) explains one clue that doesn't fit. You get ${MAX_FAILED_CHECKS} checks; after the third miss the order is shown. <span class="tut-pill">Hint</span> (<kbd>H</kbd>) is free.</span></span></li>
          <li><span><b>Pick a control</b><span class="how">Click one of the five, or press <kbd>1</kbd>–<kbd>5</kbd>.</span></span></li>
          <li><span><b>Mark the stop</b><span class="how">Click <span class="tut-pill">✂ Stops here</span> on the first step that would never happen, then <span class="tut-pill">Lock in</span> (<kbd>L</kbd>).</span></span></li>
        </ol>`,
    },
    {
      title: "Earliest beats biggest",
      body: `
        <p>A made-up example, not one of the incidents: a fake parcel text steals a banking password.</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">EDR</span><span class="then">nothing runs on a company device</span><span class="arrow">→</span><span>doesn't stop it</span></div>
          <div class="row"><span class="tag">MFA</span><span class="then">the attacker has the password, not the phone</span><span class="arrow">→</span><span>stops the <b>sign-in</b></span></div>
          <div class="row"><span class="tag">Egress</span><span class="then">spots the money leaving</span><span class="arrow">→</span><span>stops the <b>transfer</b>, later</span></div>
        </div>
        <div class="tut-ex"><div class="row"><span class="then">Best choice:</span><span class="tag ok">MFA</span><span class="then">at the sign-in step. Nothing after it happens.</span></div></div>
        <p class="tut-note"><span>Ask of each control: <strong>would it work against this attack at all?</strong> Then: <strong>which step would never happen?</strong></span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Order <small>${ORDER_MAX}</small></b>−${CHECK_PENALTY} per failed check; 0 if the order has to be shown.</div>
          <div><b>Control <small>${CONTROL_MAX}</small></b>Earliest that works. −${LATE_PENALTY} per step later. 0 if it wouldn't work.</div>
          <div><b>Stop point <small>${MARK_MAX}</small></b>The step your control really stops.</div>
        </div>
        <p>Up to ${ROUND_MAX} per incident. Hints and speed are never scored. What you show you can do (reasoning from dependencies, choosing the earliest control) is recorded separately from the score.</p>
        ${retry ? `<p class="tut-note"><span>Playing again: same incidents, freshly shuffled.</span></p>` : ""}
        <div class="tut-settings"><label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label></div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>("#opt-sound")?.addEventListener("change", (event) => {
    settings.sound = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  });
}

let attempt = 0;

function restart(): void {
  attempt += 1;
  seed += 101;
  incidents = FULL_INCIDENTS;
  index = 0;
  round = newRound(incidents[0], seed);
  scores = [];
  evidence = [];
  hintEvent = null;
  started = performance.now();
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(attempt > 0);
  showTutorial({ kicker: KICKER, pages, startAt: attempt > 0 ? pages.length - 1 : 0, startLabel: attempt > 0 ? "Play again" : "Open the first incident", onStart: () => document.querySelector<HTMLElement>(".ev")?.focus(), onLastPage: bindSettings });
}

addHelpButton(() => {
  if ($("#game").hidden || stopped) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

// ?debug exposes the answer for automated playtests and videos.
if (params.has("debug")) {
  (window as unknown as { __timeline: unknown }).__timeline = {
    solve: () => {
      round.order = trueOrder(round.incident);
      render();
    },
    best: () => earliestControls(round.incident),
    stop,
  };
}

if (QUICK) {
  post("started", { incident: round.incident.id });
  render();
} else {
  attempt = -1;
  restart();
}
