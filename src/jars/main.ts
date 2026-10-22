import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import { LEVELS, POINTS, allItems, choose, createGame, currentItem, feedbackFor, next, stageOf, summarize, takeHint, type GameState, type Level, type Pick } from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-need-to-know/the-shared-drive/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const JAR = `<svg viewBox="0 0 48 56" aria-hidden="true"><rect x="12" y="2" width="24" height="8" rx="2" fill="currentColor" opacity=".55"/><path d="M10 12h28c3 0 5 2 5 5v31c0 3-2 6-6 6H11c-4 0-6-3-6-6V17c0-3 2-5 5-5Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 34h32v14c0 2-1 3-3 3H11c-2 0-3-1-3-3Z" fill="currentColor" opacity=".35"/></svg>`;
const DOC = `<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M4 2h22l10 10v32c0 1-1 2-2 2H4c-1 0-2-1-2-2V4c0-1 1-2 2-2Z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M26 2v10h10M9 22h20M9 29h20M9 36h13" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let hintText: string | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

function lastPick(): Pick | undefined {
  return state.phase === "answered" ? state.picks[state.picks.length - 1] : undefined;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const item = currentItem(state);
  const stage = stageOf(SCENARIO, item.id);
  const items = allItems(SCENARIO);
  const pick = lastPick();
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${items.length}</strong><span>Record</span></div>
    <div class="count"><strong>${summarize(state).total}</strong><span>Points</span></div>`;
  $("#plan").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Shared drive clean-up</h2><span class="phase-pill">${items.length} records</span></div>
    <div class="d-scroll">
      <div class="panel-ports" aria-label="Progress">${items
        .map((_, index) => {
          const done = state.picks[index];
          const cls = done ? done.verdict : index === state.index ? "now" : "";
          return `<span class="port ${cls}" title="Record ${index + 1}"></span>`;
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
      <p class="muted small">Points: ${POINTS.exact} for the right jar, ${POINTS.over} if one jar too high (safe, but blocks work), less if higher, ${POINTS.under} if too low (that is the leak). Hints are free.</p>
    </div>`;
  $("#bench-head").innerHTML = `<h2>${esc(stage.title)}</h2><span>Record ${state.index + 1} of ${items.length}</span>`;
  $("#bench").innerHTML = `
      <article class="record">
        <span class="doc">${DOC}</span>
        <div><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p></div>
      </article>
      <div class="jars" role="group" aria-label="Classification jars">
        ${LEVELS.map((level, index) => {
          const chosen = pick?.chose === index;
          const right = pick && item.level === index;
          return `<button class="jar lvl-${index} ${chosen ? "chosen" : ""} ${right ? "right" : ""}" data-level="${index}" ${pick ? "disabled" : ""} aria-label="${level.name}: ${esc(level.rule)}">
            ${JAR}<b>${level.name}</b><small>${esc(level.rule)}</small><kbd>${index + 1}</kbd></button>`;
        }).join("")}
      </div>
      ${
        pick
          ? `<div class="feedback-box ${pick.verdict === "exact" ? "good" : pick.verdict === "over" ? "hint" : "bad"}" role="status"><strong>${pick.verdict === "exact" ? "Right jar." : pick.verdict === "over" ? "Too high." : "Too low."}</strong> ${esc(feedbackFor(item, pick.chose))}</div>`
          : hintText
            ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> ${esc(hintText)}</div>`
            : ""
      }
      <div class="bench-actions">
        ${
          pick
            ? `<button class="btn primary" data-act="next">${state.index + 1 < items.length ? "Next record" : "See debrief"} <kbd>N</kbd></button>`
            : `<button class="btn" data-act="hint">Hint <kbd>H</kbd></button>`
        }
      </div>`;
  renderNext();
}

function renderNext(): void {
  const pick = lastPick();
  const last = state.index + 1 >= allItems(SCENARIO).length;
  let step: NextStep;
  if (pick) {
    step = {
      label: "Done",
      tone: pick.verdict === "under" ? "warn" : "ready",
      text: `<strong>+${pick.points} points.</strong> Read why, then press <strong>${last ? "See debrief" : "Next record"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else {
    step = {
      text: `Read the record, then drop it in a jar: click one, or press <kbd>1</kbd>–<kbd>4</kbd>. One pick per record.`,
      hint: hintText ? "The hint is in the yellow box." : "Ask: if this reached the wrong inbox, who would be harmed, and how badly? <strong>Hint</strong> (<kbd>H</kbd>) is free.",
      targets: [".jars"],
    };
  }
  renderNextStep($("#next-step"), step);
}

function onChoose(level: Level): void {
  const pick = choose(state, level);
  if (!pick) return;
  hintText = null;
  play(pick.verdict === "exact" ? "success" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: pick.item, result: { correct: pick.verdict === "exact", verdict: pick.verdict, chose: LEVELS[level].id } });
  announce(feedbackFor(currentItem(state), level));
  render();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus();
}

function onHint(): void {
  if (state.phase !== "play") return;
  hintText = takeHint(state);
  render();
}

function goNext(): void {
  next(state);
  render();
  if (state.phase === "done") return;
  announce(currentItem(state).title);
  document.querySelector<HTMLElement>(".jar")?.focus();
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-level]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.level) return onChoose(Number(target.dataset.level) as Level);
  const act = target.dataset.act;
  if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (/^[1-4]$/.test(key) && state.phase === "play") onChoose((Number(key) - 1) as Level);
  else if (key === "h" && state.phase === "play") onHint();
  else if (key === "n" && state.phase === "answered") goNext();
  else return;
  event.preventDefault();
});

function renderDebrief(): void {
  const summary = summarize(state);
  const items = allItems(SCENARIO);
  const misses = state.picks.filter((pick) => pick.verdict !== "exact");
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, picks: state.picks });
  try {
    localStorage.setItem("ares-jars:lastResult", JSON.stringify(summary));
  } catch {
    // Optional.
  }
  const habit =
    summary.under > summary.over
      ? "You leaned <strong>too low</strong>. Under-labelled data is the kind that leaks: when unsure, look for the most sensitive thing inside."
      : summary.over > summary.under
        ? "You leaned <strong>too high</strong>. Safe, but over-labelling blocks colleagues and teaches people to ignore labels. Match the label to the real harm."
        : summary.under + summary.over === 0
          ? "Every record in the right jar."
          : "Your misses were balanced between too high and too low.";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Classification ${summary.total}<small>/${summary.max}</small></h2>
        <p class="muted">${summary.exact} of ${items.length} in the right jar · ${summary.over} too high · ${summary.under} too low · ${summary.hints} hint${summary.hints === 1 ? "" : "s"} (not scored).</p>
      </header>
      <div class="score-grid wide">${summary.byStage.map((entry) => tile(entry.title, entry.points, entry.max)).join("")}</div>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>The shelf you sorted</h3>
        <table class="plan-table"><thead><tr><th scope="col">Record</th><th scope="col">You</th><th scope="col">Label</th></tr></thead><tbody>
          ${state.picks
            .map((pick) => {
              const item = items.find((entry) => entry.id === pick.item)!;
              return `<tr class="${pick.verdict}"><th scope="row">${esc(item.title)}</th><td>${LEVELS[pick.chose].name}</td><td>${LEVELS[item.level].name}</td></tr>`;
            })
            .join("")}</tbody></table>
      </section>
      <section class="panel">
        <h3>Where it went wrong</h3>
        ${
          misses.length
            ? `<ul class="habits">${misses
                .map((pick) => {
                  const item = items.find((entry) => entry.id === pick.item)!;
                  return `<li><strong>${esc(item.title)}</strong><br /><span class="muted">${esc(feedbackFor(item, pick.chose))}</span></li>`;
                })
                .join("")}</ul>`
            : `<p>Nothing: every record in the right jar.</p>`
        }
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Content pending SME review (docs/design/NEED_TO_KNOW.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

function tutorialPages(retry: boolean): TutorialPage[] {
  const items = allItems(SCENARIO);
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">${esc(SCENARIO.org)} is moving its old shared drive to a new file store. Nothing moves without a label, and the label decides who can open it.</p>
        <p class="tut-lead">You sort ${items.length} records in ${SCENARIO.stages.length} rounds: ${SCENARIO.stages.map((stage) => `<strong>${esc(stage.title)}</strong>`).join(", ")}.</p>
        <p class="tut-note">${JAR}<span>The one question: <strong>if this reached the wrong inbox, who would be harmed, and how badly?</strong></span></p>`,
    },
    {
      title: "The four jars",
      body: `
        <div class="tut-legend">
          ${LEVELS.map((level, index) => `<div><span class="tut-ico box lvl-${index}">${index + 1}</span><span><b>${level.name}</b>${esc(level.rule)}</span></div>`).join("")}
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the record</b><span class="how">The card says what the file is and what is inside. Judge by what is inside, not the file name.</span></span></li>
          <li><span><b>Pick a jar</b><span class="how">Click it, or press <kbd>1</kbd>–<kbd>4</kbd>. One pick per record, so think first. <span class="tut-pill">Hint</span> (<kbd>H</kbd>) is free.</span></span></li>
          <li><span><b>Read why</b><span class="how">Every pick is explained, right or wrong. Then press <span class="tut-pill">Next record</span> (<kbd>N</kbd>).</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${POINTS.exact} <small>points</small></b>The right jar.</div>
          <div><b>${POINTS.over} <small>points</small></b>One jar too high: safe, but it blocks people who need it. Two too high: 2.</div>
          <div><b>${POINTS.under} <small>points</small></b>Too low: that is how data leaks.</div>
        </div>
        <p>${items.length} records, up to ${items.length * POINTS.exact} points. Hints cost nothing; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${JAR}<span>Starting again: same records, fresh score.</span></p>` : ""}
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
  hintText = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the shared drive",
    onStart: () => document.querySelector<HTMLElement>(".jar")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
