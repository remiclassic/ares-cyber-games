import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { HOME_LAPTOP, SCENARIO } from "./data";
import { NOTHING, answerFix, answerIssue, createGame, currentScene, finishScene, flagged, issueOptions, item, nextScene, shuffled, summarize, type GameState, type Item } from "./engine";

const ACTIVITY_ID = "ares-spot-the-risks/walkround/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let selected: string | null = null;
const started = performance.now();
$("#logo").innerHTML = LOGO;

function flaggedList(): Item[] {
  return currentScene(state).items.filter((entry) => flagged(state.answers[entry.id]));
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const scene = currentScene(state);
  const review = state.phase === "review";
  const result = review ? state.results[state.results.length - 1] : null;
  const flags = flaggedList();
  $("#status").innerHTML = `
    <div class="count"><strong>${state.sceneIndex + 1}/${SCENARIO.scenes.length}</strong><span>Scene</span></div>
    <div class="count"><strong>${flags.length}</strong><span>Flagged</span></div>`;
  $("#walk").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Walk-round</h2><span class="phase-pill">${review ? "Reviewed" : "In progress"}</span></div>
    <div class="d-scroll">
      <p class="kicker">Scene ${state.sceneIndex + 1} of ${SCENARIO.scenes.length}</p>
      <h3 class="case-title">${esc(scene.title)}</h3>
      <p class="brief">${esc(scene.brief)}</p>
      ${
        result
          ? `<div class="score-grid">
              ${tile("Found", result.found, result.risks, "risks flagged")}
              ${tile("Fixes", result.fixRight, result.risks, "right fix chosen")}
            </div>
            <p class="scene-score">Scene score <strong>${result.total}</strong>/100${result.falseAlarms ? ` · ${result.falseAlarms} false alarm${result.falseAlarms > 1 ? "s" : ""} (−5 each)` : ""}</p>
            <p class="muted small">Select anything in the scene to see what it was and why. Red rings are risks you missed.</p>
            <button class="btn primary" data-act="next">${state.sceneIndex + 1 < SCENARIO.scenes.length ? "Next scene" : "See debrief"}</button>`
          : `<h4 class="sub-head">Your flags</h4>
            ${flags.length ? `<ol class="flags">${flags.map((entry) => `<li><button class="link-row" data-act="select" data-id="${entry.id}"><b>${flags.indexOf(entry) + 1}</b><span>${esc(entry.label)}</span>${state.answers[entry.id].fix ? "" : `<em class="todo">pick a fix</em>`}</button></li>`).join("")}</ol>` : `<p class="muted small">Nothing flagged yet. Click or Tab to anything in the scene that looks wrong.</p>`}
            <p class="muted small">Points for each risk found, its issue named and its fix chosen. Flagging something that is fine costs 5.</p>
            <button class="btn primary" data-act="finish">Finish this scene</button>`
      }
    </div>`;
  const items = scene.items
    .map((entry) => {
      const answer = state.answers[entry.id];
      const isFlagged = flagged(answer);
      const cleared = answer?.issue === NOTHING;
      let mark = "";
      if (review) {
        if (entry.risk) mark = isFlagged ? "found" : "missed";
        else mark = isFlagged ? "false" : "fine";
      } else if (isFlagged) mark = "flag";
      else if (cleared) mark = "ok";
      const badge = review ? (entry.risk ? (isFlagged ? "✓" : "!") : isFlagged ? "✕" : "") : isFlagged ? String(flaggedList().indexOf(entry) + 1) : cleared ? "✓" : "";
      return `<g class="item ${mark} ${selected === entry.id ? "sel" : ""}" data-id="${entry.id}" role="button" tabindex="0" aria-label="${esc(entry.label)}${isFlagged ? ", flagged" : cleared ? ", checked as fine" : ""}">
        ${entry.svg}
        <rect class="hit" x="${entry.x - 4}" y="${entry.y - 4}" width="${entry.w + 8}" height="${entry.h + 8}" rx="10"/>
        ${badge ? `<g class="badge"><circle cx="${entry.x + entry.w}" cy="${entry.y}" r="14"/><text x="${entry.x + entry.w}" y="${entry.y + 5}" text-anchor="middle">${badge}</text></g>` : ""}
      </g>`;
    })
    .join("");
  $("#scene").innerHTML = `
    <div class="col-head"><h2>${esc(scene.title)}</h2><span class="muted">${review ? "Review" : "Click anything that looks wrong"}</span></div>
    <div class="scene-wrap"><svg viewBox="0 0 1000 600" class="scene" role="group" aria-label="${esc(scene.title)}">${scene.backdrop}${scene.id === "home" ? HOME_LAPTOP : ""}${items}</svg></div>`;
  renderInspector();
}

function renderInspector(): void {
  const box = $("#inspector");
  if (!selected) {
    box.innerHTML = `<div class="col-head"><h2>Inspect</h2></div><div class="d-scroll"><p class="muted">Select something in the scene to inspect it.</p><p class="muted small">Keyboard: Tab through the scene, Enter to inspect.</p></div>`;
    return;
  }
  const entry = item(state, selected);
  const answer = state.answers[entry.id];
  const review = state.phase === "review";
  const issues = shuffled(issueOptions(entry), `${entry.id}:issue`);
  const fixes = shuffled(entry.fix, `${entry.id}:fix`);
  const choice = (option: string, picked: string | null | undefined, right: string, act: string) => {
    const cls = review ? (option === right ? "right" : option === picked ? "wrong" : "") : option === picked ? "on" : "";
    return `<button class="option ${cls}" data-act="${act}" data-value="${esc(option)}" ${review ? "disabled" : ""} aria-pressed="${option === picked}">${esc(option)}</button>`;
  };
  box.innerHTML = `
    <div class="col-head"><h2>Inspect</h2><span>${review ? (entry.risk ? "A risk" : "Fine") : ""}</span></div>
    <div class="d-scroll">
      <h3 class="d-title">${esc(entry.label)}</h3>
      <h4 class="sub-head">What is the issue?</h4>
      <div class="options">${issues.map((option) => choice(option, answer?.issue, entry.risk ? entry.issue[0] : NOTHING, "issue")).join("")}</div>
      ${
        entry.risk && (flagged(answer) || review)
          ? `<h4 class="sub-head">What is the best fix?</h4><div class="options">${fixes.map((option) => choice(option, answer?.fix, entry.fix[0], "fix")).join("")}</div>`
          : ""
      }
      ${review ? `<div class="explain ${entry.risk ? (flagged(answer) ? "good" : "bad") : flagged(answer) ? "warn" : "good"}"><strong>${entry.risk ? (flagged(answer) ? "Found." : "Missed.") : flagged(answer) ? "False alarm." : "Correctly left alone."}</strong> ${esc(entry.explain)}</div>` : ""}
    </div>`;
}

function select(id: string): void {
  selected = id;
  play("click");
  render();
  announce(`${item(state, id).label}. What is the issue?`);
  document.querySelector<HTMLElement>("#inspector .option:not(:disabled)")?.focus();
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const scenic = target.closest<SVGGElement>("g.item");
  if (scenic) return select(scenic.dataset.id!);
  const button = target.closest<HTMLElement>("[data-act]");
  if (!button || (button as HTMLButtonElement).disabled) return;
  const { act, value, id } = button.dataset;
  if (act === "issue" && selected) {
    answerIssue(state, selected, value!);
    play(value === NOTHING ? "click" : "deliver");
    render();
    document.querySelector<HTMLElement>(value === NOTHING ? `[data-id="${selected}"]` : "#inspector [data-act=fix]")?.focus();
  } else if (act === "fix" && selected) {
    answerFix(state, selected, value!);
    play("click");
    render();
    document.querySelector<HTMLElement>(`g.item[data-id="${selected}"]`)?.focus();
  } else if (act === "select") select(id!);
  else if (act === "finish") {
    const score = finishScene(state);
    post("statement", { at: new Date().toISOString(), verb: "completed", object: currentScene(state).id, result: score });
    play(score.found === score.risks ? "success" : "setback");
    selected = null;
    render();
    announce(`Scene reviewed. Found ${score.found} of ${score.risks} risks. Score ${score.total}.`);
  } else if (act === "next") {
    nextScene(state);
    selected = null;
    render();
  } else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  const target = event.target as Element;
  if ((event.key === "Enter" || event.key === " ") && target instanceof SVGGElement && target.classList.contains("item")) {
    event.preventDefault();
    select(target.dataset.id!);
  }
});

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}

function renderDebrief(): void {
  const summary = summarize(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, scenes: state.results });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Awareness score ${summary.total}<small>/100</small></h2>
        <p class="muted">${summary.found} of ${summary.risks} risks found · ${summary.falseAlarms} false alarm${summary.falseAlarms === 1 ? "" : "s"}.</p>
      </header>
      <section class="panel">
        <h3>Scene by scene</h3>
        <table class="plan-table"><thead><tr><th scope="col">Scene</th><th scope="col">Found</th><th scope="col">Issue named</th><th scope="col">Right fix</th><th scope="col">False alarms</th><th scope="col">Score</th></tr></thead><tbody>
        ${state.results
          .map((result) => {
            const scene = SCENARIO.scenes.find((entry) => entry.id === result.scene)!;
            return `<tr><th scope="row">${esc(scene.title)}</th><td>${result.found}/${result.risks}</td><td>${result.issueRight}</td><td>${result.fixRight}</td><td>${result.falseAlarms}</td><td>${result.total}</td></tr>`;
          })
          .join("")}</tbody></table>
      </section>
      <section class="panel">
        <h3>Habits worth keeping</h3>
        <ul class="objectives">
          <li>Lock the screen every time you step away.</li>
          <li>Passwords live in the password manager, never on paper, whiteboards or sticky notes.</li>
          <li>Unknown USB drives go to IT, unplugged.</li>
          <li>Badge-only doors stay shut, and a friendly challenge is the right response to an unescorted stranger.</li>
          <li>At home: check what your camera sees, mute smart speakers for confidential calls, patch the router and the laptop, shred paper.</li>
          <li>Don't over-flag: a locked screen, a confidential-waste console, a webcam cover and a connected VPN are what good looks like.</li>
        </ul>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Content pending SME review (docs/design/SPOT_THE_RISKS.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function start(): void {
  state = createGame(SCENARIO);
  selected = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  showModal({
    kicker: `${SCENARIO.org} · Security walk-round`,
    title: "Spot the Risks",
    body: `
      <p>Two scenes: the office after hours, and a home office before a client call. In each one, find what puts the company at risk.</p>
      <ol class="brief-steps">
        <li><span><strong>Inspect</strong> anything that looks wrong: click it, or Tab to it and press Enter.</span></li>
        <li><span><strong>Name the issue</strong>, then <strong>pick the best fix</strong>.</span></li>
        <li><span><strong>Leave good things alone.</strong> Some items only look suspicious. Answer “Nothing wrong here” for those; a false alarm costs 5.</span></li>
      </ol>
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>`,
    actions: [{ label: "Start the walk-round", primary: true, onClick: () => undefined }],
    onMount: (root) =>
      root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
        settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
        setSoundEnabled(settings.sound);
      }),
  });
}

start();
