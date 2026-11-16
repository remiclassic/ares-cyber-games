import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  ACTIONS,
  HARM_COST,
  PASS_SCORE,
  WEIGHTS,
  act,
  bestAction,
  canAct,
  clockNow,
  createGame,
  currentScene,
  formatClock,
  guidedPending,
  inspect,
  isAvailable,
  isInspected,
  itemById,
  learning,
  leaveRoom,
  minutesLeft,
  nextScene,
  nightReport,
  rowFor,
  score,
  type Action,
  type GameState,
  type Grade,
  type Item,
  type Option,
  type Row,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-clean-desk/last-one-out/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const GRADE_LABEL: Record<Grade, string> = { best: "Right call", ok: "Safe, with a loose end", waste: "Wasted minutes", harm: "Made it worse", exposed: "Still exposed" };
const GRADE_TONE: Record<Grade, string> = { best: "good", ok: "ok", waste: "warn", harm: "bad", exposed: "bad" };
// One fixed button order for every object, so the position of a button never hints at the answer.
const ACTION_ORDER = Object.keys(ACTIONS) as Action[];

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let selected: string | null = null;
let started = performance.now();
$("#logo").innerHTML = LOGO;

const mins = (value: number) => `${value} min`;
const optionsOf = (entry: Item): Option[] => [...entry.options].sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));
const sceneMode = () => (currentScene(state).hints ? "Guided" : currentScene(state).feedback ? "Practice" : "No hints");

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const scene = currentScene(state);
  const left = minutesLeft(state);
  const night = state.phase === "night";
  $("#status").innerHTML = `
    <div class="clock ${left <= 2 ? "low" : ""}" role="timer" aria-label="Time ${formatClock(clockNow(state))}, ${left} minutes left in this room">${CLOCK}${formatClock(clockNow(state))}<small>${mins(left)} left</small></div>
    <div class="count"><strong>${state.sceneIndex + 1}/${SCENARIO.scenes.length}</strong><span>Room</span></div>`;
  const ticks = Array.from({ length: scene.budget }, (_, i) => `<i class="${i < state.spent[state.sceneIndex] ? "used" : ""}"></i>`).join("");
  $("#rooms").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Before you go</h2><span class="phase-pill">${sceneMode()}</span></div>
    <div class="d-scroll">
      <div class="cd-time ${left <= 2 ? "low" : ""}">
        <div class="cd-time-top"><span>Minutes left here</span><strong>${left}<small>/${scene.budget}</small></strong></div>
        <div class="cd-ticks" aria-hidden="true">${ticks}</div>
        <small>Walked in at ${formatClock(scene.start)}. You must be out by ${formatClock(scene.start + scene.budget)}. Looking is free; every action costs minutes.</small>
      </div>
      <button class="btn primary" data-act="leave-room" ${night || guidedPending(state) ? "disabled" : ""}>Leave the room</button>
      <h4 class="sub-head">In this room</h4>
      <ol class="cd-list">${scene.items
        .map((entry) => {
          const row = rowFor(state, entry);
          const seen = isInspected(state, entry.id);
          const available = isAvailable(state, entry.id);
          const tag = row.decided ? `<em class="done">${esc(ACTIONS[row.action].past)}${row.minutes ? ` · ${mins(row.minutes)}` : ""}</em>` : seen ? `<em class="todo">decide</em>` : `<em>look</em>`;
          return `<li><button class="link-row ${selected === entry.id ? "on" : ""}" data-act="inspect" data-id="${entry.id}" ${available && !night ? "" : "disabled"}><span><b>${esc(seen ? entry.name : entry.label)}</b>${seen ? `<small>${esc(entry.label)}</small>` : ""}</span>${tag}</button></li>`;
        })
        .join("")}</ol>
      <p class="muted small">Anything you do not deal with stays exactly as it is when you walk out.</p>
    </div>`;
  $("#floor-head").innerHTML = `<h2>${esc(scene.title)}</h2><span class="muted">${night ? "The night plays out" : guidedPending(state) ? "Guided first object" : "Click anything to look at it"}</span>`;
  if (night) renderNight();
  else renderScene();
  renderInspector();
  renderNext();
}

function renderScene(): void {
  const scene = currentScene(state);
  const drawn = scene.items
    .map((entry) => {
      const available = isAvailable(state, entry.id);
      const row = rowFor(state, entry);
      const seen = isInspected(state, entry.id);
      const cls = [
        "item",
        available ? "" : "locked",
        selected === entry.id ? "sel" : "",
        guidedPending(state) && entry.id === scene.guided ? "guide" : "",
        row.decided ? `done ${scene.feedback ? `g-${row.option.grade}` : ""} ${row.action === "leave" ? "left" : ""}` : seen ? "seen" : "",
      ].join(" ");
      const badge = row.decided ? (row.action === "leave" ? "–" : "✓") : seen ? "?" : "";
      const name = seen ? `${entry.label}: ${entry.name}` : entry.label;
      const said = row.decided ? `, ${ACTIONS[row.action].past.toLowerCase()}` : seen ? ", looked at, not dealt with" : "";
      const bx = Math.min(entry.x + entry.w, 982);
      const by = Math.max(entry.y, 18);
      return `<g class="${cls}" data-act="inspect" data-id="${entry.id}" role="button" tabindex="${available ? 0 : -1}" aria-disabled="${!available}" aria-label="${esc(name + said)}">
        ${entry.svg}
        <rect class="hit" x="${entry.x - 4}" y="${entry.y - 4}" width="${entry.w + 8}" height="${entry.h + 8}" rx="10"/>
        ${badge ? `<g class="badge"><circle cx="${bx}" cy="${by}" r="15"/><text x="${bx}" y="${by + 6}" text-anchor="middle">${badge}</text></g>` : ""}
      </g>`;
    })
    .join("");
  $("#floor-view").innerHTML = `<svg viewBox="0 0 1000 600" class="scene" role="group" aria-label="${esc(scene.title)}">${scene.backdrop}${drawn}</svg>`;
}

function nightRow(row: Row): string {
  const { item, option } = row;
  const did = row.decided ? ACTIONS[row.action].past : "Never dealt with";
  return `<li class="cd-night-row ${option.grade}">
    <div class="cd-when"><b>${esc(item.witness)}</b><em class="cd-grade ${option.grade}">${GRADE_LABEL[option.grade]}</em></div>
    <div><strong>${esc(item.name)}</strong> <span class="muted">· you: ${esc(did)}${row.minutes ? ` (${mins(row.minutes)})` : ""}</span><p>${esc(option.text)}</p></div>
  </li>`;
}

function renderNight(): void {
  const scene = currentScene(state);
  const rows = nightReport(state);
  const exposed = rows.filter((row) => row.option.grade === "exposed").length;
  const harmed = rows.filter((row) => row.option.grade === "harm").length;
  const last = state.sceneIndex === SCENARIO.scenes.length - 1;
  const headline = harmed
    ? "Something you did tonight made tomorrow worse."
    : exposed
      ? `${exposed} thing${exposed === 1 ? " was" : "s were"} still there for the visitors.`
      : "The visitors found nothing they should not have.";
  $("#floor-view").innerHTML = `
    <div class="cd-night" role="region" aria-label="The night plays out">
      <p class="kicker">You left at ${formatClock(clockNow(state))} · ${esc(scene.title)}</p>
      <h3 class="d-title" id="night-title" tabindex="-1">${headline}</h3>
      <p class="muted small">Cleaning crew at 18:10, client tour at 09:05. This is who came past what.</p>
      <ol class="cd-night-list">${rows.map(nightRow).join("")}</ol>
      <div class="cd-night-actions"><button class="btn primary" data-act="next">${last ? "See the debrief" : "Walk on to the next room"}</button></div>
    </div>`;
}

// Coach lines for the guided first object: what to weigh, never which button to press.
function coach(entry: Item): string {
  const scene = currentScene(state);
  if (!scene.hints) return "";
  if (entry.id === scene.guided && guidedPending(state)) return `<div class="coach"><strong>Guided object.</strong> ${esc(entry.hint)} Each button shows what it costs. The choice is final.</div>`;
  if (state.choices[entry.id]) return "";
  return `<div class="coach"><strong>Weigh it.</strong> ${esc(entry.hint)}</div>`;
}

function renderInspector(): void {
  const box = $("#inspector");
  const scene = currentScene(state);
  if (state.phase === "night") {
    const rows = nightReport(state);
    const count = (grade: Grade) => rows.filter((row) => row.option.grade === grade).length;
    const wasted = rows.filter((row) => ["waste", "harm", "exposed"].includes(row.option.grade)).reduce((sum, row) => sum + row.minutes, 0);
    box.innerHTML = `<div class="col-head"><h2>This room</h2></div><div class="d-scroll">
      <div class="score-grid">
        <div class="score-tile ${count("exposed") ? "bad" : "good"}"><span>Still exposed</span><strong>${count("exposed")}</strong></div>
        <div class="score-tile ${count("harm") ? "bad" : "good"}"><span>Made worse</span><strong>${count("harm")}</strong></div>
        <div class="score-tile good"><span>Right calls</span><strong>${count("best")}<small>/${rows.length}</small></strong></div>
        <div class="score-tile ${wasted ? "ok" : "good"}"><span>Minutes wasted</span><strong>${wasted}</strong></div>
      </div>
      <p class="muted small">You used ${state.spent[state.sceneIndex]} of ${scene.budget} minutes. Minutes spent on harmless things, or on fixes that fix nothing, are counted as wasted.</p>
    </div>`;
    return;
  }
  if (!selected) {
    box.innerHTML = `<div class="col-head"><h2>Inspect</h2></div><div class="d-scroll">
      <p class="kicker">${esc(SCENARIO.org)} · ${formatClock(scene.start)}</p>
      <p class="brief">${esc(scene.brief)}</p>
      <p class="muted small">Select something in the room to look at it. Keyboard: Tab through the room, Enter to look, number keys to act.</p></div>`;
    return;
  }
  const entry = itemById(SCENARIO, selected);
  const row = rowFor(state, entry);
  const left = minutesLeft(state);
  box.innerHTML = `
    <div class="col-head"><h2>Inspect</h2><span>${esc(entry.witness)}</span></div>
    <div class="d-scroll">
      <h3 class="d-title">${esc(entry.name)}</h3>
      <p class="muted small">${esc(entry.label)}</p>
      <p class="brief">${esc(entry.detail)}</p>
      ${coach(entry)}
      <h4 class="sub-head">What do you do? ${row.decided ? "" : `· ${mins(left)} left`}</h4>
      <div class="decisions" role="group" aria-label="Actions">
        ${optionsOf(entry)
          .map((option, index) => {
            const cost = ACTIONS[option.action].minutes;
            const affordable = cost <= left;
            const chosen = row.decided && row.action === option.action;
            const showBest = row.decided && scene.feedback && !chosen && option.action === bestAction(entry);
            return `<button class="dec-btn cd-act ${chosen ? "on" : ""} ${showBest ? "best" : ""}" data-act="do" data-value="${option.action}" ${canAct(state, entry.id, option.action) ? "" : "disabled"} aria-pressed="${chosen}">
              <kbd>${index + 1}</kbd><span><b>${esc(ACTIONS[option.action].name)}</b><small>${cost ? mins(cost) : "No time"}${!row.decided && !affordable ? " · not enough time left" : ""}${showBest ? " · the right call here" : ""}</small></span></button>`;
          })
          .join("")}
      </div>
      ${
        !row.decided
          ? ""
          : scene.feedback
            ? `<div class="outcome ${GRADE_TONE[row.option.grade]}" role="status" tabindex="-1">
                <strong>${GRADE_LABEL[row.option.grade]}${row.minutes ? ` · ${mins(row.minutes)} spent` : ""}</strong>
                <span>${esc(row.option.text)}</span>
                ${row.option.grade === "best" ? "" : `<span class="muted small">${esc(entry.reason)}</span>`}
              </div>`
            : `<div class="outcome" role="status" tabindex="-1"><strong>${esc(ACTIONS[row.action].past)}${row.minutes ? ` · ${mins(row.minutes)} spent` : ""}</strong><span>No feedback in this room. The night will show whether that was the right call.</span></div>`
      }
    </div>`;
}

function renderNext(): void {
  const bar = $("#next-step");
  const scene = currentScene(state);
  const sel = selected ? itemById(SCENARIO, selected) : null;
  const left = minutesLeft(state);
  const undecided = scene.items.filter((entry) => !state.choices[entry.id]);
  const unseen = scene.items.filter((entry) => !isInspected(state, entry.id));
  const cheapest = Math.min(...Object.values(ACTIONS).filter((entry) => entry.minutes > 0).map((entry) => entry.minutes));
  let step: NextStep;
  if (state.phase === "night") {
    step = { label: "Night", text: `Read who saw what, then press <strong>${state.sceneIndex === SCENARIO.scenes.length - 1 ? "See the debrief" : "Walk on to the next room"}</strong>.`, targets: ['[data-act="next"]'] };
  } else if (guidedPending(state) && !sel) {
    step = {
      text: `Start with the guided object: click the <strong>${esc(itemById(SCENARIO, scene.guided!).label.toLowerCase())}</strong> (pulsing) to look at it.`,
      hint: "The rest of the room opens after your first action.",
      targets: [`g.item[data-id="${scene.guided}"]`],
    };
  } else if (sel && !state.choices[sel.id]) {
    step = {
      text: `Choose what to do with it on the right. You have <strong>${mins(left)}</strong> left; <strong>Leave it</strong> costs nothing.`,
      hint: "The choice is final. Not everything in the room deserves your minutes.",
      targets: ["#inspector .decisions"],
    };
  } else if (left < cheapest) {
    step = { label: "Time", tone: "warn", text: `The clock has run out. Press <strong>Leave the room</strong>: whatever is left stays as it is.`, targets: ['[data-act="leave-room"]'] };
  } else if (unseen.length) {
    step = {
      label: sel ? "Done" : "Next",
      tone: sel ? "ready" : "",
      text: `Keep going: <strong>${unseen.length}</strong> thing${unseen.length === 1 ? "" : "s"} in the room you have not looked at, <strong>${mins(left)}</strong> left.`,
      hint: "Looking is free. Some things are harmless and only look like a problem.",
      targets: ["#floor-view .scene"],
    };
  } else if (undecided.length) {
    step = {
      label: "Check",
      tone: "warn",
      text: `You have looked at everything. ${undecided.length} thing${undecided.length === 1 ? " is" : "s are"} not dealt with, <strong>${mins(left)}</strong> left. Act on what matters, then leave the room.`,
      hint: "Whatever you do not deal with is left as it is.",
      targets: [`#rooms [data-act="inspect"][data-id="${undecided[0].id}"]`],
    };
  } else {
    step = { label: "Ready", tone: "ready", text: `Everything in the room has a decision. Press <strong>Leave the room</strong> to see how the night plays out.`, targets: ['[data-act="leave-room"]'] };
  }
  renderNextStep(bar, step);
}

function select(id: string): void {
  if (state.phase !== "play") return;
  if (!isAvailable(state, id)) {
    announce("Deal with the guided object first.");
    return;
  }
  const first = !isInspected(state, id);
  inspect(state, id);
  selected = id;
  play("click");
  if (first) post("statement", { at: new Date().toISOString(), verb: "inspected", object: id });
  render();
  const entry = itemById(SCENARIO, id);
  announce(`${entry.name}. ${entry.detail}`);
  document.querySelector<HTMLElement>("#inspector .cd-act:not(:disabled), #inspector .outcome")?.focus();
}

function onAct(action: Action): void {
  if (!selected) return;
  const id = selected;
  const scene = currentScene(state);
  const outcome = act(state, id, action);
  if (!outcome) return;
  if (!scene.feedback) play("click");
  else play(outcome.grade === "best" ? "success" : outcome.grade === "ok" ? "deliver" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "acted", object: id, result: { action, grade: outcome.grade, minutes: ACTIONS[action].minutes, minutesLeft: minutesLeft(state) } });
  render();
  announce(scene.feedback ? `${GRADE_LABEL[outcome.grade]}. ${outcome.text} ${minutesLeft(state)} minutes left.` : `${ACTIONS[action].past}. ${minutesLeft(state)} minutes left.`);
  document.querySelector<HTMLElement>("#inspector .outcome")?.focus();
}

function onLeave(): void {
  if (!leaveRoom(state)) return;
  selected = null;
  const rows = nightReport(state);
  const bad = rows.some((row) => row.option.grade === "exposed" || row.option.grade === "harm");
  play(bad ? "alarm" : "success");
  post("statement", { at: new Date().toISOString(), verb: "left-room", object: currentScene(state).id, result: { minutesUsed: state.spent[state.sceneIndex], exposed: rows.filter((row) => row.option.grade === "exposed").map((row) => row.item.id) } });
  render();
  $("#night-title").focus();
}

function onNext(): void {
  if (!nextScene(state)) return;
  selected = null;
  play("click");
  render();
  if (state.phase === "play") {
    announce(`${currentScene(state).title}. ${currentScene(state).brief}`);
    document.querySelector<HTMLElement>("g.item[tabindex='0']")?.focus();
    window.scrollTo({ top: 0 });
  }
}

document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLElement | SVGGElement>("[data-act]");
  if (!button || (button as HTMLButtonElement).disabled) return;
  const { act: name, value, id } = button.dataset;
  if (name === "inspect") select(id!);
  else if (name === "do") onAct(value as Action);
  else if (name === "leave-room") onLeave();
  else if (name === "next") onNext();
  else if (name === "retry") start(true);
});

document.addEventListener("keydown", (event) => {
  const target = event.target as Element;
  if ((event.key === "Enter" || event.key === " ") && target instanceof SVGGElement && target.classList.contains("item")) {
    event.preventDefault();
    return select(target.dataset.id!);
  }
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey || !selected || state.phase !== "play") return;
  const option = /^[1-9]$/.test(event.key) ? optionsOf(itemById(SCENARIO, selected))[Number(event.key) - 1] : undefined;
  if (option && canAct(state, selected, option.action)) {
    event.preventDefault();
    onAct(option.action);
  }
});

function tile(label: string, value: number, note: string, good = 85, ok = 50): string {
  const tone = value >= good ? "good" : value >= ok ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/100</small></strong><p>${esc(note)}</p></div>`;
}

function renderDebrief(): void {
  const result = score(state);
  const learn = learning(state);
  const names = (ids: readonly string[]) => ids.map((id) => esc(itemById(SCENARIO, id).name)).join(", ");
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: result, learning: learn, choices: state.choices, inspected: state.inspected });
  try {
    localStorage.setItem("ares-cleandesk:lastResult", JSON.stringify({ total: result.total, passed: result.passed }));
  } catch {
    // Optional.
  }
  const habits: string[] = [];
  if (learn.pluggedUnknownMedia) habits.push(`<strong>Plugged in an unknown USB stick.</strong> The worst choice in the game. Curiosity, or wanting to return it to its owner, is exactly what a dropped stick counts on. Never plug it in; hand it to security.`);
  if (learn.destroyed.length) habits.push(`<strong>Destroyed what had to be kept:</strong> ${names(learn.destroyed)}. Shredding is for copies and waste. Originals, records and other people's notes get locked away, not destroyed.`);
  if (learn.exposed.length) habits.push(`<strong>Left for the visitors to see:</strong> ${names(learn.exposed)}.${learn.minutesWasted ? ` You spent ${learn.minutesWasted} minute${learn.minutesWasted === 1 ? "" : "s"} elsewhere on things that did not need it.` : ""}`);
  if (learn.falseFixes.length) habits.push(`<strong>A fix that fixes nothing:</strong> ${names(learn.falseFixes)}. A dark monitor is still an unlocked session.`);
  if (learn.overHandled.length) habits.push(`<strong>Minutes spent on harmless things:</strong> ${names(learn.overHandled)}. Ask "would it matter if a stranger saw this?" before acting.`);
  if (!habits.length) habits.push("Proportionate: you dealt with what mattered, in the lightest way that worked, and left the rest alone.");
  const replay = SCENARIO.scenes
    .map((scene, index) => {
      const rows = scene.items.map((entry) => rowFor(state, entry));
      return `<section class="panel">
        <h3>${index + 1}. ${esc(scene.title)} <small class="muted">${state.spent[index]} of ${scene.budget} minutes used</small></h3>
        <ol class="cd-replay">${rows
          .map(
            (row) => `<li class="${row.option.grade}">
              <div class="cd-replay-head"><strong>${esc(row.item.name)}</strong>${row.item.severity === 0 ? `<span class="tag-ok">harmless</span>` : row.item.severity === 3 ? `<span class="tag-crit">critical</span>` : ""}<em class="cd-grade ${row.option.grade}">${GRADE_LABEL[row.option.grade]}</em></div>
              <p><b>You:</b> ${esc(row.decided ? ACTIONS[row.action].past : "Never dealt with")}${row.minutes ? ` (${mins(row.minutes)})` : ""} · <b>Best:</b> ${esc(ACTIONS[bestAction(row.item)].name)}${ACTIONS[bestAction(row.item)].minutes ? ` (${mins(ACTIONS[bestAction(row.item)].minutes)})` : ""}</p>
              <p class="muted">${esc(row.option.text)}</p>
              <p><b>Why:</b> ${esc(row.item.reason)}</p>
            </li>`,
          )
          .join("")}</ol>
      </section>`;
    })
    .join("");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${result.total}<small>/100</small> · <span class="${result.passed ? "pass" : "fail"}">${result.passed ? "Clean exit" : "Not yet"}</span></h2>
        <p class="muted">${result.grades.best} right calls · ${result.grades.ok} safe with a loose end · ${result.grades.exposed} still exposed · ${result.grades.waste} wasted · ${result.grades.harm} made worse. ${result.minutesUsed} of ${result.minutesBudget} minutes used. A clean exit needs ${PASS_SCORE}+, no critical exposure left and nothing made worse.</p>
        ${result.reasons.length ? `<ul class="reasons">${result.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : ""}
      </header>
      <div class="score-grid wide">
        ${tile("Secured", result.secured, `What visitors could no longer see, weighted by how bad it was · ${Math.round(WEIGHTS.secured * 100)}%`)}
        ${tile("Proportion", result.proportion, `Objects that got the right-sized choice, including leaving harmless ones · ${Math.round(WEIGHTS.proportion * 100)}%`)}
        ${tile("Care", result.care, `Minus ${HARM_COST} for each thing made worse · ${Math.round(WEIGHTS.care * 100)}%`, 100, 50)}
        ${tile("Total", result.total, `Clean exit at ${PASS_SCORE}`, 90, PASS_SCORE)}
      </div>
      <section class="panel">
        <h3>Your habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>Learning evidence <small class="muted">(not part of the score)</small></h3>
        <ul class="objectives">
          <li><strong>Recognising physical exposure:</strong> dealt with ${learn.criticalHandled} of ${learn.criticalTotal} critical exposures; looked at ${learn.inspected} of ${learn.total} objects.</li>
          <li><strong>Telling harmless from sensitive:</strong> left ${learn.decoysLeft} of ${learn.decoyTotal} harmless objects alone; ${learn.minutesWasted} minute${learn.minutesWasted === 1 ? "" : "s"} wasted.</li>
          <li><strong>Choosing the proportionate action:</strong> ${learn.proportionate} of the ${learn.actedSensitive} sensitive objects you acted on got the right-sized action.</li>
          <li><strong>Unaided, under pressure:</strong> secured ${learn.finalSecured} of ${learn.finalTotal} in the final room with no hints and no feedback.</li>
        </ul>
      </section>
      <h3 class="cd-replay-title">Object by object</h3>
      ${replay}
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional company · Content to be reviewed with SMEs (docs/design/CLEAN_DESK.md)</p>
    </div>`;
  window.scrollTo({ top: 0 });
  $("#debrief-title").focus();
}

function tutorialPages(retry: boolean): TutorialPage[] {
  const cost = (action: Action) => `<span class="tut-pill">${esc(ACTIONS[action].name)}</span> ${ACTIONS[action].minutes ? mins(ACTIONS[action].minutes) : "no time"}`;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">It is <strong>17:25</strong> at <strong>${esc(SCENARIO.org)}</strong> and you are the last one out. The cleaning crew arrive at 18:10. A client tour comes through at 09:05 tomorrow.</p>
        <p class="tut-lead">Three rooms are on your way to the door. In each one you have a few minutes to deal with whatever should not be seen.</p>
        <p class="tut-note"><span>The catch: <strong>you cannot deal with everything</strong>. Every action costs minutes, and some things in each room are harmless. Spend your minutes on what would actually hurt.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">▦</span><span><b>The room</b>Middle. Anything you can look at gets a yellow outline when you point at it.</span></div>
          <div><span class="tut-ico box">◷</span><span><b>The clock</b>Top right and left. It only moves when you act, never while you read or think.</span></div>
          <div><span class="tut-ico box">☰</span><span><b>In this room</b>Left. Every object, what you did with it, and the <b>Leave the room</b> button.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Inspect</b>Right. What you see up close, and what you can do about it.</span></div>
        </div>
        <p class="tut-note"><span>The bar above the room always says what to do next.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Look</b><span class="how">Click an object (or <kbd>Tab</kbd> + <kbd>Enter</kbd>). Looking is free.</span></span></li>
          <li><span><b>Choose what to do</b><span class="how">${(["lock", "shred", "drawer", "wipe", "collect", "handin", "report", "leave"] as Action[]).map(cost).join("<br />")}<br />Each object offers only the actions that make sense for it. Number keys <kbd>1</kbd>–<kbd>4</kbd> work too. A choice is final.</span></span></li>
          <li><span><b>Leave the room</b><span class="how">When you are done or out of time. Then the night plays out: who came past, and what they saw.</span></span></li>
        </ol>
        <p class="tut-note"><span>Room 1 is guided, with hints. Room 2 explains each action. Room 3 has no hints, no feedback and a tighter clock.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Secured <small>${Math.round(WEIGHTS.secured * 100)}%</small></b>What visitors can no longer see, weighted by how bad it was.</div>
          <div><b>Proportion <small>${Math.round(WEIGHTS.proportion * 100)}%</small></b>Right-sized choices, including leaving harmless things alone.</div>
          <div><b>Care <small>${Math.round(WEIGHTS.care * 100)}%</small></b>Lost when an action makes things worse.</div>
        </div>
        <p>A clean exit needs ${PASS_SCORE} or more, no critical exposure left, and nothing made worse. Destroying something that had to be kept is not securing it.</p>
        <p class="tut-muted">No real-time timer: the clock is the minutes your actions cost.</p>
        ${retry ? `<p class="tut-note"><span>Starting again: same three rooms, fresh clock.</span></p>` : ""}
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

function start(retry = false): void {
  state = createGame(SCENARIO);
  selected = null;
  started = performance.now();
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Walk in",
    onStart: () => document.querySelector<HTMLElement>(`g.item[data-id="${currentScene(state).guided}"]`)?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
