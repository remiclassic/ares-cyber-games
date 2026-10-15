import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { HOME_LAPTOP, SCENARIO } from "./data";
import { NOTHING, POINTS, answerFix, answerIssue, createGame, currentScene, finishScene, fixOptions, flagged, issueOptions, item, nextScene, shuffled, summarize, type GameState, type Item } from "./engine";

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
  $("#scene-head").innerHTML = `<h2>${esc(scene.title)}</h2><span class="muted">${review ? "Review" : "Click anything that looks wrong"}</span>`;
  $("#scene-view").innerHTML = `<svg viewBox="0 0 1000 600" class="scene" role="group" aria-label="${esc(scene.title)}">${scene.backdrop}${scene.id === "home" ? HOME_LAPTOP : ""}${items}</svg>`;
  renderInspector();
  renderNext();
}

// The live "Next" bar: one plain instruction for the current state. It reads out what the screen
// already shows (what is flagged, what still needs a fix) and never says whether an item is a risk.
function renderNext(): void {
  const bar = $("#next-step");
  const scene = currentScene(state);
  if (state.phase === "review") {
    const last = state.sceneIndex + 1 >= SCENARIO.scenes.length;
    renderNextStep(bar, {
      label: "Done",
      tone: "ready",
      text: `<strong>Scene reviewed.</strong> Red rings mark risks you missed; click any item to read what it was and why. Then press <strong>${last ? "See debrief" : "Next scene"}</strong> on the left.`,
      targets: ['[data-act="next"]'],
    });
    return;
  }
  const flags = flaggedList();
  const needFix = flags.filter((entry) => !state.answers[entry.id].fix);
  const answered = scene.items.filter((entry) => state.answers[entry.id]).length;
  const untouched = scene.items.length - answered;
  const sel = selected ? item(state, selected) : null;
  const selAnswer = sel ? state.answers[sel.id] : undefined;
  let step: NextStep;
  if (sel && !selAnswer) {
    step = {
      text: `Under <strong>What is the issue?</strong> on the right, pick what is wrong with <strong>${esc(sel.label.toLowerCase())}</strong>, or <strong>${NOTHING}</strong> if it is fine.`,
      hint: "Only flag what you would really report. A false alarm costs 5 points.",
      targets: ["#inspector .options"],
    };
  } else if (sel && flagged(selAnswer) && !selAnswer!.fix) {
    step = {
      text: `Now pick the best fix under <strong>What is the best fix?</strong> on the right.`,
      hint: "A flag without a fix still scores for finding it, but not for the fix.",
      targets: ['#inspector [data-act="fix"]'],
    };
  } else if (needFix.length) {
    step = {
      label: "Check",
      tone: "warn",
      text: `${needFix.length === 1 ? "One flag still needs" : `${needFix.length} flags still need`} a fix: ${needFix.length === 1 ? "it shows" : "they show"} <em>pick a fix</em> under <strong>Your flags</strong> on the left. Click ${needFix.length === 1 ? "it" : "one"} to choose the fix.`,
      targets: [`#walk [data-act="select"][data-id="${needFix[0].id}"]`],
    };
  } else if (!answered) {
    step = {
      text: `<strong>Click anything in the scene that looks wrong</strong> (or <kbd>Tab</kbd> to it and press <kbd>Enter</kbd>). Its questions open on the right.`,
      hint: "Some things only look risky. Look closely before you flag.",
      targets: ["#scene-view .scene"],
    };
  } else if (untouched > 0) {
    step = {
      text: `Keep walking the scene: ${untouched} of ${scene.items.length} things you can inspect have no answer yet. When you are happy with your flags, press <strong>Finish this scene</strong>.`,
      hint: `${flags.length} flagged so far. You do not have to answer everything; anything you leave counts as not flagged.`,
    };
  } else {
    step = {
      label: "Ready",
      tone: "ready",
      text: `You have answered everything you can inspect, and every flag has a fix. Press <strong>Finish this scene</strong> on the left to see how you did.`,
      hint: "You can still click any item to change your answer first.",
      targets: ['[data-act="finish"]'],
    };
  }
  renderNextStep(bar, step);
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
  const fixes = shuffled(fixOptions(state, entry), `${entry.id}:fix`);
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
        (flagged(answer) || (review && entry.risk))
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
  } else if (act === "retry") start(true);
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

// The first-time walkthrough: the mission, what is on screen, the moves, a made-up worked
// example, and how it is scored. Reopenable at any time from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const perRisk = POINTS.found + POINTS.issue + POINTS.fix;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are doing a security walk-round at <strong>${esc(SCENARIO.org)}</strong>. There are ${SCENARIO.scenes.length} scenes: ${SCENARIO.scenes.map((scene) => `<strong>${esc(scene.title)}</strong>`).join(" and ")}.</p>
        <p class="tut-lead">In each scene, your job is to:</p>
        <ol class="tut-moves">
          <li><span><b>Find what puts the company at risk</b><span class="how">Things people have left, done or set up in a way an attacker could use.</span></span></li>
          <li><span><b>Say what is wrong with it</b><span class="how">Pick the issue from a short list.</span></span></li>
          <li><span><b>Choose the best fix</b><span class="how">The one that really removes the risk, not just the symptom.</span></span></li>
        </ol>
        <p class="tut-note"><span>Some things only <strong>look</strong> risky and are actually set up well. Flagging those is a false alarm and costs points, so look closely before you flag.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">▦</span><span><b>The scene</b>Middle. A drawing of the room. Anything you can inspect gets a yellow outline when you point at it.</span></div>
          <div><span class="tut-ico box">☰</span><span><b>Walk-round</b>Left. The scene brief, your list of flags, and the <span class="tut-pill">Finish this scene</span> button.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Inspect</b>Right. The questions about whatever you selected: the issue, then the fix.</span></div>
          <div><span class="tut-ico disc risks-flag">1</span><span><b>Numbered red badge</b>Something you flagged. The number matches <b style="display:inline">Your flags</b> on the left.</span></div>
          <div><span class="tut-ico disc risks-ok">✓</span><span><b>Green tick</b>Something you checked and marked as <em>${NOTHING}</em>.</span></div>
          <div><span class="tut-ico box">1/${SCENARIO.scenes.length}</span><span><b>Scene and Flagged</b>Top right. Which scene you are on, and how many things you have flagged in it.</span></div>
        </div>
        <p class="tut-note"><span>The bar above the scene always tells you the next thing to do. A flagged item with no fix yet shows <em>pick a fix</em> in your list.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Select something in the scene</b><span class="how">Click it. Or press <kbd>Tab</kbd> to move through the scene and <kbd>Enter</kbd> to select.</span></span></li>
          <li><span><b>Name the issue</b><span class="how">Under <span class="tut-pill">What is the issue?</span> on the right, pick what is wrong. If it is fine, pick <span class="tut-pill">${NOTHING}</span>.</span></span></li>
          <li><span><b>Pick the best fix</b><span class="how">Once you name an issue, <span class="tut-pill">What is the best fix?</span> appears below it. Choose one.</span></span></li>
          <li><span><b>Finish the scene</b><span class="how">When you have walked the whole room, press <span class="tut-pill">Finish this scene</span> on the left. Review what you found, then press <span class="tut-pill">Next scene</span>.</span></span></li>
        </ol>
        <p class="tut-note"><span>You can change an answer any time before you finish: select the item again and pick a different option. Clicking an entry in <strong>Your flags</strong> selects that item.</span></p>`,
    },
    {
      title: "Worked example",
      body: `
        <p>Two made-up items (not from the scenes):</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">Filing cabinet, key left in the lock</span></div>
          <div class="row"><span class="then">Issue:</span><span class="tag hot">Anyone can open it and take the files</span><span class="arrow">→</span><span class="then">Fix:</span><span class="tag ok">Lock it and keep the key with you</span></div>
          <div class="row"><span class="then">Flagged, with the right issue and the right fix: full marks for that item.</span></div>
        </div>
        <div class="tut-ex">
          <div class="row"><span class="tag">Desk phone showing a missed call</span></div>
          <div class="row"><span class="then">Issue:</span><span class="tag ok">${NOTHING}</span></div>
          <div class="row"><span class="then">Correctly left alone: no fix needed, no points lost. Flagging it would have been a false alarm.</span></div>
        </div>
        <p class="tut-muted">Options are shuffled, so the right answer is not always first.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Found <small>${POINTS.found}</small></b>For each real risk you flagged.</div>
          <div><b>Issue <small>${POINTS.issue}</small></b>If you named the right issue for it.</div>
          <div><b>Fix <small>${POINTS.fix}</small></b>If you chose the best fix for it.</div>
          <div><b>False alarm <small>−${POINTS.falseAlarm}</small></b>For each fine item you flagged as a risk.</div>
        </div>
        <p>Each risk is worth ${perRisk} points. A scene's total is scaled to 100, then false alarms are taken off (it never goes below 0). Your final score is the average of the ${SCENARIO.scenes.length} scenes.</p>
        <p>After each scene, red rings show the risks you missed. Click anything to read what it was and why.</p>
        <p class="tut-muted">There is no timer. Take the time you need.</p>
        ${retry ? `<p class="tut-note"><span>Retry: the same scenes again, with your answers cleared.</span></p>` : ""}
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
    startLabel: retry ? "Start again" : "Start the walk-round",
    onStart: () => document.querySelector<HTMLElement>("#walk h2")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
