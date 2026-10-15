import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { INCIDENTS, STAGES } from "./data";
import { earliestBreak, newRound, pass, place, score, type Round } from "./engine";

const ACTIVITY_ID = "ares-chain-breaker/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DEFS = [
  "Learning about the target",
  "Building the weapon",
  "Getting it to the target",
  "Making it run",
  "Staying in",
  "Remote control",
  "Doing the damage",
];
const seed = Math.floor(Math.random() * 10000);
let index = 0;
let round: Round = newRound(0, seed);
let results: ReturnType<typeof score>[] = [];
let message: { ok: boolean; text: string } | null = null;
let wobble: number | null = null;

function render(): void {
  const inc = round.incident;
  const done = round.deck.length === 0;
  const chosen = inc.breaks.find((b) => b.id === round.breakChoice);
  const breakAt = chosen?.stage ?? null;
  $("#status").innerHTML = `
    <div class="count"><strong>${index + 1}/${INCIDENTS.length}</strong><span>Incident</span></div>
    <div class="count"><strong>${results.reduce((s, r) => s + r.total, 0) + (round.breakChoice ? 0 : 0)}</strong><span>Score</span></div>`;
  $("#case").innerHTML = `
    <div class="col-head"><h2>Incident file</h2><span class="phase-pill">${done ? (round.breakChoice ? "Closed" : "Break it") : `${round.deck.length} cards left`}</span></div>
    <div class="d-scroll">
      <h3 class="case-title">${esc(inc.title)}</h3>
      <p class="brief">${esc(inc.brief)}</p>
      <h4 class="sub-head">The seven links</h4>
      <ol class="defs">${STAGES.map((s, i) => `<li><b>${esc(s)}</b><span>${DEFS[i]}</span></li>`).join("")}</ol>
      <p class="muted small">Mistakes: ${round.mistakes} · 10 points per card, −3 per mistake, up to 30 for the break.</p>
    </div>`;
  const top = round.deck.length ? inc.cards.find((c) => c.id === round.deck[0])! : null;
  $("#table-head").innerHTML = `<h2>${done ? "Where would you break the chain?" : "Lay each card on its link"}</h2><span>${done ? "Earlier is better" : "Keys 1–7 place · P puts it back"}</span>`;
  $("#table").innerHTML = `
      ${
        !done
          ? `<div class="drawrow">
              <div class="deck" aria-hidden="true">${round.deck.length > 1 ? `<span>${round.deck.length - 1}</span>` : ""}</div>
              <article class="card big ${wobble !== null ? "wobble" : ""}" aria-live="polite"><small>Turned over</small><p>${esc(top!.text)}</p></article>
              <button class="btn ghost" data-pass ${round.deck.length < 2 ? "disabled" : ""}>Put it back (P)</button>
            </div>`
          : ""
      }
      ${message ? `<p class="msg ${message.ok ? "good" : "bad"}">${esc(message.text)}</p>` : ""}
      <div class="stages">${STAGES.map((stage, i) => {
        const card = round.placed[i] ? inc.cards.find((c) => c.id === round.placed[i]) : null;
        const broken = breakAt !== null && i > breakAt;
        const breakHere = breakAt === i;
        return `<button class="stage ${card ? "filled" : ""} ${broken ? "broken" : ""} ${breakHere ? "snap" : ""} ${wobble === i ? "wobble" : ""}" data-stage="${i}" ${done ? "disabled" : ""} aria-label="${esc(stage)}${card ? `: ${esc(card.text)}` : ", empty"}">
          <span class="link-n">${i + 1}</span><b>${esc(stage)}</b>${card ? `<p>${esc(card.text)}</p>` : `<i>empty</i>`}${breakHere ? `<em>✂ broken here</em>` : ""}</button>`;
      }).join("")}</div>
      ${
        done
          ? round.breakChoice
            ? `<ul class="breaks reveal">${inc.breaks
                .map((b) => `<li class="${b.id === earliestBreak(inc).id ? "best" : b.stage === null ? "none" : "ok"} ${b.id === round.breakChoice ? "mine" : ""}"><b>${esc(b.text)}</b><span>${esc(b.why)}</span></li>`)
                .join("")}</ul>
               <p class="msg ${score(round).break === 30 ? "good" : "bad"}">${score(round).break === 30 ? "Earliest possible break." : score(round).break ? "That works, but the chain could break earlier." : "That doesn't break this chain at all."} Incident score ${score(round).total}/100.</p>
               <button class="btn primary" data-next>${index + 1 < INCIDENTS.length ? "Next incident" : "See results"}</button>`
            : `<div class="breaks">${inc.breaks.map((b) => `<button class="brk" data-break="${b.id}">✂ ${esc(b.text)}</button>`).join("")}</div>`
          : ""
      }`;
  renderNext();
}

// The "Next" bar above the table: the one thing to do now, in the words on the buttons. It says
// how to decide, and reads back the feedback already on screen; it never names a card's link or
// the best break.
function renderNext(): void {
  const bar = $("#next-step");
  const done = round.deck.length === 0;
  const placed = Object.keys(round.placed).length;
  let step: NextStep;
  if (!done && message && !message.ok) {
    step = {
      label: "Not yet",
      tone: "warn",
      text: `${esc(message.text)} Click another link for the same card.`,
      hint: `Each wrong link costs 3 points. Not sure? <strong>Put it back (P)</strong> and come back to it once more links are filled.`,
      targets: [".stages"],
    };
  } else if (!done) {
    step = {
      text: `Read the <strong>turned-over card</strong>, then click the link it belongs to (or press <kbd>1</kbd>–<kbd>7</kbd>). ${placed} of ${STAGES.length} links filled.`,
      hint:
        round.deck.length > 1
          ? `Ask: what is the attacker doing at this moment? The definitions are on the left. Unsure? <strong>Put it back (P)</strong> and try the next card.`
          : `Last card: the only empty link is where it goes.`,
      targets: [".stages"],
    };
  } else if (!round.breakChoice) {
    step = {
      text: `The chain is rebuilt. <strong>Click the ✂ control</strong> below the links that breaks it earliest.`,
      hint: "For each control, ask which link it stops. Every link after that one never happens. Some controls stop no link of this attack at all.",
      targets: [".breaks"],
    };
  } else {
    const s = score(round);
    const last = index + 1 >= INCIDENTS.length;
    step = {
      label: "Done",
      tone: "ready",
      text: `Incident score <strong>${s.total}/100</strong> (chain ${s.placement}/70, break ${s.break}/30). The green-bordered control was the earliest break; yours has the yellow ring. Press <strong>${last ? "See results" : "Next incident"}</strong>.`,
      targets: ["[data-next]"],
    };
  }
  renderNextStep(bar, step);
}

function onPlace(stage: number): void {
  if (!round.deck.length || round.placed[stage]) {
    if (round.placed[stage]) {
      message = { ok: false, text: `${STAGES[stage]} already holds its card.` };
      render();
    }
    return;
  }
  const result = place(round, stage);
  message = { ok: result.ok, text: result.ok ? `Linked: ${result.why}` : result.why };
  wobble = result.ok ? null : stage;
  play(result.ok ? "deliver" : "setback");
  announce(message.text);
  render();
  window.setTimeout(() => {
    wobble = null;
  }, 500);
  if (!round.deck.length) {
    message = { ok: true, text: "The whole chain is rebuilt. Now pick the control that breaks it earliest." };
    play("success");
    render();
    document.querySelector<HTMLElement>("[data-break]")?.focus();
  }
}

document.addEventListener("click", (event) => {
  const t = event.target as HTMLElement;
  const stage = t.closest<HTMLElement>("[data-stage]");
  if (stage) return onPlace(Number(stage.dataset.stage));
  if (t.closest("[data-pass]")) {
    pass(round);
    message = null;
    play("click");
    return render();
  }
  const brk = t.closest<HTMLElement>("[data-break]");
  if (brk) {
    round.breakChoice = brk.dataset.break!;
    const s = score(round);
    play(s.break === 30 ? "success" : "setback");
    post("statement", { at: new Date().toISOString(), verb: "completed", object: round.incident.id, result: s });
    message = null;
    render();
    document.querySelector<HTMLElement>("[data-next]")?.focus();
    return;
  }
  if (t.closest("[data-next]")) {
    results.push(score(round));
    if (index + 1 >= INCIDENTS.length) return finish();
    index += 1;
    round = newRound(index, seed);
    message = null;
    render();
    return;
  }
  if (t.closest("[data-retry]")) {
    index = 0;
    results = [];
    round = newRound(0, seed + 1);
    $("#game").hidden = false;
    $("#debrief").hidden = true;
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey) return;
  if (/^[1-7]$/.test(event.key)) onPlace(Number(event.key) - 1);
  else if (event.key.toLowerCase() === "p" && round.deck.length > 1) {
    pass(round);
    message = null;
    render();
  }
});

function finish(): void {
  const total = Math.round(results.reduce((s, r) => s + r.total, 0) / results.length);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: total, incidents: results });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head"><p class="kicker">Debrief · Chain Breaker</p><h2 id="debrief-title" tabindex="-1">Score ${total}<small>/100</small></h2></header>
      <section class="panel"><h3>Incident by incident</h3><table class="plan-table"><thead><tr><th scope="col">Incident</th><th scope="col">Chain rebuilt</th><th scope="col">Break</th><th scope="col">Total</th></tr></thead><tbody>
        ${results.map((r, i) => `<tr><th scope="row">${esc(INCIDENTS[i].title)}</th><td>${r.placement}/70</td><td>${r.break}/30</td><td>${r.total}</td></tr>`).join("")}
      </tbody></table></section>
      <section class="panel"><h3>What this practised</h3><ul class="objectives">
        <li>Placing real attack activity on the seven kill-chain stages.</li>
        <li>Seeing that every later link depends on the earlier ones, so breaking early prevents everything after.</li>
        <li>Telling a control that breaks the chain from one that only helps you recover (backups) or targets a different attack (training, MFA).</li></ul></section>
      <div class="debrief-actions"><button class="btn primary" data-retry>Deal again</button></div>
      <p class="fineprint">A remix of Cylitaire: Kill Chain by the Project Ares games team · new content and twist · pending SME review</p>
    </div>`;
  $("#debrief-title").focus();
}

// ?debug exposes the answer for automated playtests and videos.
if (new URLSearchParams(location.search).has("debug")) {
  (window as unknown as { __chain: unknown }).__chain = {
    topStage: () => (round.deck.length ? round.incident.cards.find((c) => c.id === round.deck[0])!.stage : null),
    bestBreak: () => earliestBreak(round.incident).id,
  };
}

// The first-time walkthrough: the job, the table, the moves, a made-up example of choosing a
// break, and how it is scored. Reopenable from the header.
const KICKER = "Chain Breaker · How to play";

function tutorialPages(): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You get ${INCIDENTS.length} real-world style incidents. Each one is a shuffled deck of ${STAGES.length} cards: one card for each step the attacker took.</p>
        <ol class="tut-moves">
          <li><span><b>Rebuild the attack</b><span class="how">Lay each card on its link of the cyber kill chain, in the order an attack happens.</span></span></li>
          <li><span><b>Break the chain</b><span class="how">Then choose the defence that would have stopped it <strong>earliest</strong>. Every link after the break never happens.</span></span></li>
        </ol>
        <p class="tut-note"><span>The earlier a control stops an attack, the less there is to clean up. Some defences sound good but stop no step of a particular attack.</span></p>`,
    },
    {
      title: "What is on the table",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">▤</span><span><b>The deck and the turned-over card</b>Top of the table. The card shows one thing the attacker did. The number on the deck is how many cards wait underneath.</span></div>
          <div><span class="tut-ico disc">1</span><span><b>Seven links</b>The row of slots, numbered 1 to ${STAGES.length}: ${STAGES.map((s) => esc(s)).join(", ")}.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Incident file (left)</b>What happened, plus a plain-words definition of every link. Use it when a card is unclear.</span></div>
          <div><span class="tut-ico box">✂</span><span><b>Controls</b>Once the chain is rebuilt, four defences appear below the links. You pick one.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Place the turned-over card</b><span class="how">Click the link it belongs to, or press its number, <kbd>1</kbd> to <kbd>7</kbd>. A right link holds the card; a wrong one shakes and says whether the step happens earlier or later.</span></span></li>
          <li><span><b>Not sure? Put it back</b><span class="how">Press <span class="tut-pill">Put it back (P)</span> (or <kbd>P</kbd>) to move the card under the deck at no cost and turn over the next one. Cards are easier once the links around them are filled.</span></span></li>
          <li><span><b>Break the chain</b><span class="how">When all seven links are filled, click one of the <span class="tut-pill">✂</span> controls. You only get one choice.</span></span></li>
          <li><span><b>Move on</b><span class="how">Read why each control does or does not break the chain, then press <span class="tut-pill">Next incident</span>.</span></span></li>
        </ol>`,
    },
    {
      title: "Choosing the break",
      body: `
        <p>A made-up example, not one of the incidents: a fake parcel-delivery text leads to a stolen banking login.</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">Control A</span><span class="then">stops the message reaching the phone</span><span class="arrow">→</span><span>breaks at <b>Delivery</b> (link 3)</span></div>
          <div class="row"><span class="tag">Control B</span><span class="then">blocks the fake site's traffic to the attacker</span><span class="arrow">→</span><span>breaks at <b>Command &amp; Control</b> (link 6)</span></div>
          <div class="row"><span class="tag">Control C</span><span class="then">offline backups</span><span class="arrow">→</span><span>helps recovery, stops no link</span></div>
        </div>
        <div class="tut-ex"><div class="row"><span class="then">Best choice:</span><span class="tag ok">Control A</span><span class="then">links 4 to 7 never happen. B still works, but later. C breaks nothing.</span></div></div>
        <p class="tut-note"><span>For each control ask: <strong>which link does it stop?</strong> Then choose the lowest link number.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Chain <small>70</small></b>10 per card, minus 3 for every wrong link you try.</div>
          <div><b>Earliest break <small>30</small></b>The control that stops the attack soonest.</div>
          <div><b>Later break <small>15</small></b>A control that works, but lets more of the attack happen.</div>
          <div><b>No break <small>0</small></b>A control that stops no link of this attack.</div>
        </div>
        <p>Each incident scores out of 100; your final score is the average over the ${INCIDENTS.length} incidents. Putting a card back is free.</p>
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
  startLabel: "Deal the first incident",
  onStart: () => document.querySelector<HTMLElement>("[data-stage]")?.focus(),
  onLastPage: bindSettings,
});
