import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { CATEGORIES, CONFIDENCE, type ConfidenceId } from "./data";
import { calibration, payout, question, type Pick } from "./engine";

const ACTIVITY_ID = "ares-confidence-board/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let picks: Pick[] = [];
let open: { category: number; row: number } | null = null;
let choice: number | null = null;
let confidence: ConfidenceId | null = null;

const total = () => picks.reduce((sum, pick) => sum + pick.points, 0);
const taken = (c: number, r: number) => picks.find((p) => p.category === c && p.row === r);

function renderSide(): void {
  $("#status").innerHTML = `
    <div class="count"><strong>${total()}</strong><span>Score</span></div>
    <div class="count"><strong>${picks.length}/24</strong><span>Answered</span></div>`;
  const cal = calibration(picks);
  $("#side").innerHTML = `
    <div class="col-head"><h2>Know what you know</h2></div>
    <div class="d-scroll">
      <table class="conf-table"><thead><tr><th scope="col">Confidence</th><th scope="col">Win</th><th scope="col">Lose</th></tr></thead><tbody>
        ${CONFIDENCE.map((c) => `<tr><th scope="row">${c.label}<small>${c.hint}</small></th><td class="w">+${c.win}×</td><td class="l">${c.lose ? `−${c.lose}×` : "0"}</td></tr>`).join("")}
      </tbody></table>
      <p class="muted small">“Certain” wins 2× but loses 6×: only worth it if you'd be right 9 times in 10.</p>
      <h4 class="sub-head">Your calibration so far</h4>
      <ul class="cal">${cal
        .map((c) => {
          const rate = c.asked ? Math.round((100 * c.right) / c.asked) : null;
          return `<li><span>${c.label}</span><div class="bar"><i style="width:${rate ?? 0}%"></i></div><b>${rate === null ? "–" : `${c.right}/${c.asked}`}</b></li>`;
        })
        .join("")}</ul>
      ${picks.length ? `<button class="btn ghost" data-finish>Finish and see calibration</button>` : ""}
    </div>`;
}

function renderBoard(): void {
  $("#stage-head").innerHTML = `<h2>The board</h2><span>Pick any tile</span>`;
  $("#stage").innerHTML = `
    <div class="board" role="grid" aria-label="Question board">
      ${CATEGORIES.map((cat) => `<div class="cat" role="columnheader">${esc(cat.name)}</div>`).join("")}
      ${[0, 1, 2, 3]
        .map((row) =>
          CATEGORIES.map((cat, c) => {
            const done = taken(c, row);
            return `<button class="tile ${done ? (done.correct ? "won" : "lost") : ""}" data-tile="${c}:${row}" ${done ? "disabled" : ""} aria-label="${esc(cat.name)} for ${cat.questions[row].value}${done ? `, answered, ${done.points} points` : ""}">${done ? `${done.points > 0 ? "+" : ""}${done.points}` : cat.questions[row].value}</button>`;
          }).join(""),
        )
        .join("")}
    </div>`;
}

function renderQuestion(): void {
  const { category, row } = open!;
  const q = question(category, row);
  const done = taken(category, row);
  $("#stage-head").innerHTML = `<h2>${esc(CATEGORIES[category].name)} · ${q.value}</h2><button class="btn small-btn ghost" data-back>${done ? "Back to the board" : "Back"}</button>`;
  $("#stage").innerHTML = `
    <div class="d-scroll qbody">
      <p class="prompt">${esc(q.prompt)}</p>
      <div class="answers">${q.options
        .map((option, i) => {
          const cls = done ? (i === q.answer ? "right" : i === done.choice ? "wrong" : "") : i === choice ? "on" : "";
          return `<button class="ans ${cls}" data-choice="${i}" ${done ? "disabled" : ""}><b>${"ABCD"[i]}</b>${esc(option)}</button>`;
        })
        .join("")}</div>
      ${
        done
          ? `<div class="reveal ${done.correct ? "good" : "bad"}"><b>${done.correct ? "Right" : "Not quite"} · ${done.points > 0 ? "+" : ""}${done.points} at “${CONFIDENCE.find((c) => c.id === done.confidence)!.label}”.</b> ${esc(q.explain)}</div>
             <button class="btn primary" data-back>Back to the board</button>`
          : `<h4 class="sub-head">How sure are you?</h4>
             <div class="confs">${CONFIDENCE.map((c) => `<button class="conf ${confidence === c.id ? "on" : ""}" data-conf="${c.id}"><b>${c.label}</b><span>+${payout(q.value, c.id, true)} / ${payout(q.value, c.id, false)}</span></button>`).join("")}</div>
             <button class="btn primary" data-lock ${choice === null || confidence === null ? "disabled" : ""}>Lock it in</button>`
      }
    </div>`;
}

function render(): void {
  renderSide();
  if (open) renderQuestion();
  else renderBoard();
  renderNext();
}

// The "Next" bar above the board: the one thing to do now. It explains the wager and reads back
// what is on screen; it never hints at which answer is right.
function renderNext(): void {
  const bar = $("#next-step");
  let step: NextStep;
  const done = open ? taken(open.category, open.row) : undefined;
  if (!open) {
    if (picks.length >= 24) step = { label: "Done", tone: "ready", text: "<strong>All 24 questions answered.</strong> Your calibration results are on their way." };
    else if (!picks.length)
      step = {
        text: "<strong>Click any tile</strong> on the board to open its question. The number on the tile is what it is worth.",
        hint: "Wins and losses are a multiple of the tile's value, so bigger tiles are bigger bets.",
        targets: [".board"],
      };
    else
      step = {
        text: `<strong>Pick another tile.</strong> ${picks.length} of 24 answered.`,
        hint: "You can stop at any time: press <strong>Finish and see calibration</strong> on the left.",
        targets: [".board"],
      };
  } else if (done) {
    step = {
      label: "Done",
      tone: done.correct ? "ready" : "",
      text: `<strong>${done.correct ? "Right" : "Not quite"}, ${done.points > 0 ? "+" : ""}${done.points} points.</strong> The right answer is in green. ${picks.length >= 24 ? "That was the last question: your calibration results open in a moment." : "Read why, then press <strong>Back to the board</strong>."}`,
      targets: picks.length >= 24 ? [] : [".qbody [data-back]"],
    };
  } else if (choice === null && confidence === null) {
    step = { text: "<strong>Click the answer</strong> you think is right (A to D).", hint: "Then you say how sure you are. Nothing is scored until you lock it in.", targets: [".answers"] };
  } else if (choice === null) {
    step = { text: "<strong>Click an answer</strong> (A to D) as well, then press <strong>Lock it in</strong>.", targets: [".answers"] };
  } else if (confidence === null) {
    step = {
      text: "Now say <strong>how sure you are</strong>: click Unsure, Likely, Sure or Certain.",
      hint: "Each button shows what it wins if you are right / loses if you are wrong, on this question.",
      targets: [".confs"],
    };
  } else if (confidence === "certain") {
    const value = question(open.category, open.row).value;
    step = {
      label: "Check",
      tone: "warn",
      text: `<strong>Certain</strong> wins ${payout(value, "certain", true)} but loses ${-payout(value, "certain", false)} on this question. Only worth it if you would be right 9 times in 10.`,
      hint: "Still sure? Press <strong>Lock it in</strong>. If not, pick a lower level first.",
      targets: ["[data-lock]"],
    };
  } else {
    step = { label: "Ready", tone: "ready", text: "Answer and confidence chosen. Press <strong>Lock it in</strong>.", hint: "You can still change either one until you lock it in.", targets: ["[data-lock]"] };
  }
  renderNextStep(bar, step);
}

document.addEventListener("click", (event) => {
  const t = event.target as HTMLElement;
  const tile = t.closest<HTMLElement>("[data-tile]");
  if (tile) {
    const [c, r] = tile.dataset.tile!.split(":").map(Number);
    open = { category: c, row: r };
    choice = null;
    confidence = null;
    play("click");
    render();
    document.querySelector<HTMLElement>("[data-choice]")?.focus();
    return;
  }
  const ans = t.closest<HTMLElement>("[data-choice]");
  if (ans && open && !taken(open.category, open.row)) {
    choice = Number(ans.dataset.choice);
    render();
    document.querySelector<HTMLElement>(confidence ? "[data-lock]" : "[data-conf]")?.focus();
    return;
  }
  const conf = t.closest<HTMLElement>("[data-conf]");
  if (conf) {
    confidence = conf.dataset.conf as ConfidenceId;
    render();
    document.querySelector<HTMLElement>("[data-lock]")?.focus();
    return;
  }
  if (t.closest("[data-lock]") && open && choice !== null && confidence) {
    const q = question(open.category, open.row);
    const correct = choice === q.answer;
    const points = payout(q.value, confidence, correct);
    picks.push({ category: open.category, row: open.row, confidence, choice, correct, points });
    play(correct ? "success" : "setback");
    announce(`${correct ? "Right" : "Not quite"}, ${points} points. ${q.explain}`);
    post("statement", { at: new Date().toISOString(), verb: "answered", object: `${CATEGORIES[open.category].id}-${q.value}`, result: { correct, confidence, points } });
    render();
    document.querySelector<HTMLElement>("[data-back]")?.focus();
    if (picks.length === 24) window.setTimeout(results, 1500);
    return;
  }
  if (t.closest("[data-back]")) {
    open = null;
    render();
    return;
  }
  if (t.closest("[data-finish]")) return results();
  if (t.closest("[data-retry]")) {
    picks = [];
    open = null;
    $("#game").hidden = false;
    $("#debrief").hidden = true;
    render();
  }
});

function results(): void {
  const cal = calibration(picks);
  const right = picks.filter((p) => p.correct).length;
  const notes: string[] = [];
  const certain = cal.find((c) => c.id === "certain")!;
  if (certain.asked && certain.right / certain.asked < 0.9) notes.push(`<b>Overconfident at “Certain”:</b> right ${certain.right} of ${certain.asked}. Save “Certain” for things you could explain to someone else.`);
  const unsure = cal.find((c) => c.id === "unsure")!;
  if (unsure.asked >= 2 && unsure.right / unsure.asked > 0.75) notes.push(`<b>Underconfident at “Unsure”:</b> right ${unsure.right} of ${unsure.asked}. You know more than you think.`);
  if (!notes.length) notes.push("<b>Well calibrated.</b> Your confidence matched how often you were right.");
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: total(), right, answered: picks.length, calibration: cal });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head"><p class="kicker">Debrief · Confidence Board</p><h2 id="debrief-title" tabindex="-1">Score ${total()}</h2>
      <p class="muted">${right} of ${picks.length} right. The score rewards knowing what you know: a confident wrong answer costs more than an honest “unsure”.</p></header>
      <section class="panel"><h3>Calibration</h3>
        <ul class="cal big">${cal
          .map((c) => {
            const rate = c.asked ? Math.round((100 * c.right) / c.asked) : 0;
            const target = { unsure: 50, likely: 62, sure: 78, certain: 92 }[c.id];
            return `<li><span>${c.label}</span><div class="bar"><i style="width:${rate}%"></i><u style="left:${target}%"></u></div><b>${c.asked ? `${rate}% (${c.right}/${c.asked})` : "not used"}</b></li>`;
          })
          .join("")}</ul>
        <p class="muted small">The tick on each bar is roughly where that level pays off best.</p>
        <ul class="habits">${notes.map((n) => `<li>${n}</li>`).join("")}</ul></section>
      <section class="panel"><h3>Why calibration matters in security</h3><ul class="objectives">
        <li>An analyst who says “certain” must be right: confident wrong calls close real incidents.</li>
        <li>Saying “I'm not sure, let me verify” is a skill, not a weakness.</li></ul></section>
      <div class="debrief-actions"><button class="btn primary" data-retry>Play again</button></div>
      <p class="fineprint">A remix of Trivialoot by the Project Ares games team · new questions and twist · pending SME review</p>
    </div>`;
  $("#debrief-title").focus();
}

// The first-time walkthrough: the job, the screen, the moves, how the wager works (on a made-up
// tile value), and how it is scored. Reopenable from the header.
const KICKER = "Confidence Board · How to play";

function tutorialPages(): TutorialPage[] {
  const questions = CATEGORIES.reduce((n, cat) => n + cat.questions.length, 0);
  const values = CATEGORIES[0].questions.map((q) => q.value);
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">A quiz board: ${CATEGORIES.length} security categories, ${questions} questions. For each one you choose an answer <strong>and say how sure you are</strong>.</p>
        <p class="tut-lead">The aim is not only to be right. It is to <strong>know when you are right</strong>: confident when you know, careful when you don't.</p>
        <p class="tut-note"><span>In security work a confident wrong call (“that alert is nothing”, “that email is fine”) does more harm than an honest “not sure, let me check”. The scoring works the same way.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${values[1]}</span><span><b>Tiles</b>One question each, worth ${values[0]} to ${values[values.length - 1]}. Answered tiles turn green or red and show the points won or lost.</span></div>
          <div><span class="tut-ico box">×</span><span><b>Confidence table (left)</b>What each level wins and loses, as a multiple of the tile's value.</span></div>
          <div><span class="tut-ico box">▬</span><span><b>Your calibration (left)</b>How often you have been right at each level so far.</span></div>
          <div><span class="tut-ico box">#</span><span><b>Score and Answered</b>Top right: your running score and how many of the ${questions} you have done.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Pick a tile</b><span class="how">Click any tile on the board, in any order.</span></span></li>
          <li><span><b>Choose an answer</b><span class="how">Click one of the four answers, A to D.</span></span></li>
          <li><span><b>Say how sure you are</b><span class="how">Click <span class="tut-pill">Unsure</span>, <span class="tut-pill">Likely</span>, <span class="tut-pill">Sure</span> or <span class="tut-pill">Certain</span>. Each button shows what it wins / loses on this question.</span></span></li>
          <li><span><b>Lock it in</b><span class="how">Press <span class="tut-pill">Lock it in</span>. You see the right answer and why, then press <span class="tut-pill">Back to the board</span>.</span></span></li>
        </ol>
        <p class="tut-muted">You can change the answer and the confidence as often as you like until you lock it in. To stop early, press <span class="tut-pill">Finish and see calibration</span> on the left.</p>`,
    },
    {
      title: "How the wager works",
      body: `
        <p>A made-up 200-point tile pays:</p>
        <div class="tut-ex">
          ${CONFIDENCE.map((c) => `<div class="row"><span class="tag">${c.label}</span><span class="then">${c.hint}</span><span class="arrow">→</span><span class="tag ok">+${payout(200, c.id, true)} if right</span><span class="tag ${c.lose ? "hot" : ""}">${payout(200, c.id, false) || 0} if wrong</span></div>`).join("")}
        </div>
        <p class="tut-note"><span>Each level pays best in its own band. Right about 3 times in 4? “Certain” only breaks even over time, while “Sure” comes out ahead. Guessing? “Unsure” costs nothing. Pick the level that matches how often you are really right.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          ${CONFIDENCE.map((c) => `<div><b>${c.label} <small>+${c.win}× / ${c.lose ? `−${c.lose}×` : "0"}</small></b>${c.hint}.</div>`).join("")}
        </div>
        <p>Each answer scores the tile's value times the multiplier; your score is the total.</p>
        <p>At the end you see your <strong>calibration</strong>: how often you were right at each level. Each level pays best in a band: Unsure below about 1 in 2, Likely up to about 2 in 3, Sure up to 9 in 10, Certain above that.</p>
        <p class="tut-muted">How fast you play is never scored.</p>
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

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

render();
showTutorial({
  kicker: KICKER,
  pages: tutorialPages(),
  startLabel: "Show the board",
  onStart: () => document.querySelector<HTMLElement>("[data-tile]")?.focus(),
  onLastPage: bindSettings,
});
