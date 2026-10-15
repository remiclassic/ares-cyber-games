import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
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
  $("#stage").innerHTML = `
    <div class="col-head"><h2>The board</h2><span>Pick any tile</span></div>
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
  $("#stage").innerHTML = `
    <div class="col-head"><h2>${esc(CATEGORIES[category].name)} · ${q.value}</h2><button class="btn small-btn ghost" data-back>${done ? "Back to the board" : "Back"}</button></div>
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

render();
showModal({
  kicker: "Remix · Six-category board",
  title: "Confidence Board",
  body: `<p>Six categories, 24 questions. Pick a tile, choose an answer, then say <strong>how sure you are</strong>.</p>
    <p>The more confident you are, the more you win if you're right, and the more you lose if you're wrong. “Certain” loses three times what it wins, so use it only when you'd bet on it 9 times out of 10.</p>
    <p class="note"><span>At the end you'll see your calibration: how often you were right at each confidence level.</span></p>`,
  actions: [{ label: "Show the board", primary: true, onClick: () => document.querySelector<HTMLElement>("[data-tile]")?.focus() }],
});
