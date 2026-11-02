import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  CRITICALITY,
  EXPLOIT,
  EXPOSURE,
  bestPlan,
  byHighestScore,
  canHint,
  commit,
  consequence,
  createGame,
  currentRound,
  decoyOf,
  impactBand,
  likelihoodBand,
  next,
  outcomeOf,
  playStrategy,
  scorePlan,
  severityLabel,
  summarize,
  takeHint,
  toggle,
  type Band,
  type GameState,
  type Outcome,
  type Round,
  type RoundResult,
  type Summary,
  type Vuln,
} from "./sim";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-patch-tuesday/the-monthly-window/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PATCH = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="16" width="36" height="16" rx="8" transform="rotate(-45 24 24)" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="24" r="1.8" fill="currentColor"/><circle cx="24" cy="20" r="1.8" fill="currentColor"/><circle cx="24" cy="28" r="1.8" fill="currentColor"/><circle cx="28" cy="24" r="1.8" fill="currentColor"/></svg>`;

const OUTCOME_LABEL: Record<Outcome, string> = { patched: "✓ Patched", breach: "✕ Breached", attempt: "! Attempted", quiet: "· Quiet" };

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let firstEvidence: Summary["evidence"] | null = null; // learning evidence is taken from the first run only
const started = performance.now();

$("#logo").innerHTML = LOGO;

const highestFirst = summarize(playStrategy(SCENARIO, byHighestScore));

function lastResult(): RoundResult | undefined {
  return state.phase === "result" ? state.results[state.results.length - 1] : undefined;
}

function showFactors(round: Round): boolean {
  return round.mode === "guided" || (round.mode === "hints" && state.hinted);
}

function bandClass(band: Band): string {
  return band.toLowerCase().replace(" ", "-");
}

function chips(vuln: Vuln): string {
  return `<ul class="chips" aria-label="Evidence">
    <li class="chip sev sev-${severityLabel(vuln.cvss).toLowerCase()}"><b>${vuln.cvss.toFixed(1)}</b> ${severityLabel(vuln.cvss)}</li>
    <li class="chip exp-${vuln.exposure}">${vuln.exposure === "internet" ? "◉" : "○"} ${EXPOSURE[vuln.exposure].label}</li>
    <li class="chip xp-${vuln.exploit}">${vuln.exploit === "itw" ? "▲" : vuln.exploit === "poc" ? "△" : "–"} ${EXPLOIT[vuln.exploit].label}</li>
    <li class="chip crit-${vuln.criticality}">${"◆".repeat(vuln.criticality)}${"◇".repeat(3 - vuln.criticality)} ${CRITICALITY[vuln.criticality].label}</li>
  </ul>`;
}

function factors(vuln: Vuln): string {
  const like = likelihoodBand(vuln);
  const imp = impactBand(vuln);
  return `<div class="factors">
    <span class="factor ${bandClass(like)}"><small>Likelihood</small>${like}</span>
    <span class="factor ${bandClass(imp)}"><small>Impact</small>${imp}</span>
  </div>`;
}

function card(vuln: Vuln, index: number, round: Round, result?: RoundResult): string {
  const picked = result ? result.picks.includes(vuln.id) : state.selected.includes(vuln.id);
  const full = !result && !picked && state.selected.length >= SCENARIO.budget;
  const head = `<header><span class="vid">${esc(vuln.id)}</span>${result ? "" : `<kbd>${index + 1}</kbd>`}</header>
    <h3>${esc(vuln.asset)}</h3>
    <p class="prod">${esc(vuln.product)} · ${esc(vuln.flaw)}</p>
    ${chips(vuln)}
    ${showFactors(round) || result ? factors(vuln) : ""}`;
  if (!result) {
    return `<button class="vuln ${picked ? "picked" : ""}" data-vuln="${esc(vuln.id)}" aria-pressed="${picked}" ${full ? 'aria-disabled="true"' : ""}>
      ${head}
      <span class="slot">${picked ? `${PATCH} Patch this month` : full ? "Budget used" : "Click to patch"}</span>
    </button>`;
  }
  const outcome = outcomeOf(vuln, picked);
  const shouldPatch = bestPlan(round, SCENARIO.budget).includes(vuln.id);
  const verdict = picked === shouldPatch ? "agree" : "differ";
  return `<article class="vuln done ${picked ? "picked" : ""} out-${outcome} ${verdict}">
    ${head}
    <div class="outcome-line"><span class="badge out-${outcome}">${OUTCOME_LABEL[outcome]}</span><span class="best ${shouldPatch ? "yes" : "no"}">${shouldPatch ? "Best plan: patch" : "Best plan: defer"}</span></div>
    <p class="conseq">${esc(consequence(vuln, picked))}</p>
    <p class="why"><strong>Why:</strong> ${esc(vuln.why)}</p>
  </article>`;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const round = currentRound(state);
  const result = lastResult();
  const summary = summarize(state);
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${SCENARIO.rounds.length}</strong><span>Round</span></div>
    <div class="count"><strong>${result ? 0 : SCENARIO.budget - state.selected.length}</strong><span>Patches left</span></div>
    <div class="count"><strong>${summary.score}</strong><span>Score</span></div>`;
  $("#plan").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Patch window</h2><span class="phase-pill">${SCENARIO.budget} patches / round</span></div>
    <div class="d-scroll">
      <div class="budget" aria-label="Patch budget">${Array.from({ length: SCENARIO.budget }, (_, i) => `<span class="bslot ${i < (result ? result.picks.length : state.selected.length) ? "used" : ""}">${PATCH}</span>`).join("")}</div>
      ${SCENARIO.rounds
        .map((entry, i) => {
          const done = state.results[i];
          return `<section class="stage ${i === state.index ? "on" : ""}">
            <h3>${esc(entry.title)}${done ? ` <span class="pts">${done.points}</span>` : ""}</h3>
            ${i === state.index ? `<p>${esc(entry.lesson)}</p>` : ""}
          </section>`;
        })
        .join("")}
      <div class="legend">
        <h3 class="sub-head">Four signals</h3>
        <p><b>Severity</b> (0–10): how bad the bug could be, in theory.</p>
        <p><b>Exposure</b>: ◉ internet-facing is reachable by anyone; ○ internal needs a foothold.</p>
        <p><b>Exploit</b>: ▲ in the wild beats △ public PoC beats – none.</p>
        <p><b>Asset</b>: ◆◆◆ crown jewel, ◆◆ important, ◆ low.</p>
      </div>
      <p class="muted small">Score: each round, the share of this month's risk your three patches removed (100 = the best plan). Hints are free and counted, never scored.</p>
    </div>`;
  $("#board-head").innerHTML = `<h2>${esc(round.title)}</h2><span>${round.mode === "guided" ? "Guided" : round.mode === "hints" ? "Hints available" : "No hints"}</span>`;
  const coach =
    round.mode === "guided" && !result
      ? `<div class="coach-box"><strong>Guided round.</strong> The Likelihood and Impact bars are shown for you. Likelihood comes from <b>exposure × exploit status</b>; impact from <b>severity × asset</b>. Patch the three with the most of both, not the three biggest numbers.</div>`
      : "";
  const hintBox = round.mode === "hints" && state.hinted && !result ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> Likelihood and Impact bars are now showing. Internal bugs still matter once attackers are inside: ask what sits behind each one. An exploit on a low-value box can rank below public exploit code against a crown jewel.</div>` : "";
  const roundSummary = result ? resultSummary(round, result) : "";
  $("#board").innerHTML = `
    ${coach}${hintBox}${roundSummary}
    <div class="vulns" role="group" aria-label="Vulnerabilities this round">${round.vulns.map((vuln, i) => card(vuln, i, round, result)).join("")}</div>
    <div class="board-actions">
      ${
        result
          ? `<button class="btn primary" data-act="next">${state.index + 1 < SCENARIO.rounds.length ? "Next round" : "See debrief"} <kbd>N</kbd></button>`
          : `<button class="btn primary" data-act="commit" ${state.selected.length === SCENARIO.budget ? "" : "disabled"}>Commit patches <kbd>C</kbd></button>
             ${canHint(state) && !state.hinted ? `<button class="btn" data-act="hint">Hint <kbd>H</kbd></button>` : ""}`
      }
    </div>`;
  renderNext();
}

function resultSummary(round: Round, result: RoundResult): string {
  const naive = scorePlan(round, byHighestScore(round, SCENARIO.budget), SCENARIO.budget);
  const tone = result.points >= 85 ? "good" : result.points >= 60 ? "hint" : "bad";
  return `<div class="feedback-box ${tone}" role="status"><strong>${result.points}/100 risk removed.</strong> ${result.correct} of ${SCENARIO.budget} match the best plan · ${result.breaches} breach${result.breaches === 1 ? "" : "es"} this month. <span class="muted">Patching the three highest severity scores would have removed ${naive.points}/100.</span></div>`;
}

function renderNext(): void {
  const round = currentRound(state);
  const result = lastResult();
  let step: NextStep;
  if (result) {
    step = {
      label: "Done",
      tone: result.breaches ? "warn" : "ready",
      text: `Read what happened to each item and why, then press <strong>${state.index + 1 < SCENARIO.rounds.length ? "Next round" : "See debrief"}</strong> (<kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (state.selected.length < SCENARIO.budget) {
    step = {
      text: `Choose <strong>${SCENARIO.budget - state.selected.length} more</strong> to patch: click a card or press <kbd>1</kbd>–<kbd>5</kbd>. Click again to un-pick.`,
      hint:
        round.mode === "guided"
          ? "Look first for <strong>▲ Exploited in the wild</strong> and <strong>◉ Internet-facing</strong>. The biggest number is a trap."
          : round.mode === "hints"
            ? "Stuck? <strong>Hint</strong> (<kbd>H</kbd>) shows the Likelihood and Impact bars. It is free."
            : "No hints this round. Weigh exposure, exploit status and asset, not just severity.",
      targets: [".vulns"],
    };
  } else {
    step = { label: "Ready", tone: "ready", text: `Three picked. Press <strong>Commit patches</strong> (<kbd>C</kbd>), or click a card to swap it out.`, targets: ['[data-act="commit"]'] };
  }
  renderNextStep($("#next-step"), step);
}

function onToggle(id: string): void {
  if (!toggle(state, id)) {
    play("block");
    announce(`Budget used: un-pick one first.`);
    return;
  }
  play("click");
  render();
  document.querySelector<HTMLElement>(`[data-vuln="${id}"]`)?.focus();
}

function onCommit(): void {
  const result = commit(state);
  if (!result) return;
  play(result.points >= 85 ? "success" : result.breaches ? "setback" : "click");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: result.round, result: { picks: result.picks, correct: result.correct, points: result.points, hinted: result.hinted, attempt: state.attempt } });
  announce(`${result.points} of 100 risk removed. ${result.correct} of ${SCENARIO.budget} match the best plan.`);
  render();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus();
}

function onHint(): void {
  if (!takeHint(state)) return;
  render();
}

function goNext(): void {
  next(state);
  render();
  if (state.phase === "done") return;
  announce(currentRound(state).title);
  document.querySelector<HTMLElement>(".vuln")?.focus();
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-vuln]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.vuln) return onToggle(target.dataset.vuln);
  const act = target.dataset.act;
  if (act === "commit") onCommit();
  else if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const round = currentRound(state);
  if (/^[1-5]$/.test(key) && state.phase === "pick") onToggle(round.vulns[Number(key) - 1].id);
  else if ((key === "c" || (key === "enter" && !(event.target as HTMLElement).closest?.("button"))) && state.phase === "pick") onCommit();
  else if (key === "h" && state.phase === "pick") onHint();
  else if (key === "n" && state.phase === "result") goNext();
  else return;
  event.preventDefault();
});

function renderDebrief(): void {
  const summary = summarize(state);
  firstEvidence ??= summary.evidence;
  const evidence = firstEvidence;
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: { score: summary.score, max: summary.max, breaches: summary.breaches }, evidence, results: state.results });
  try {
    localStorage.setItem("ares-patch:lastResult", JSON.stringify({ score: summary.score, max: summary.max, evidence }));
  } catch {
    // Optional.
  }
  const decoysPicked = state.results.length - summary.evidence.decoysAvoided;
  const habit =
    decoysPicked >= 2
      ? "You <strong>chased the severity score</strong>. The biggest number was the trap in most rounds: check exploit status and exposure before severity."
      : summary.evidence.correct === summary.evidence.total
        ? "You prioritised by risk every round: exploited and exposed first, severity as a tie-breaker."
        : decoysPicked === 1
          ? "Mostly risk-based, with one pull towards a big severity score. In doubt, ask: is anyone attacking this, and can they reach it?"
          : "You avoided the severity traps; your misses were between two moderate risks. Look at the asset: what sits behind the bug?";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Risk removed ${summary.score}<small>/${summary.max}</small></h2>
        <p class="muted">${summary.breaches} breach${summary.breaches === 1 ? "" : "es"} across ${SCENARIO.rounds.length} months. Patching the highest severity scores first would have scored ${highestFirst.score}/${highestFirst.max} with ${highestFirst.breaches} breaches.</p>
      </header>
      <section class="panel">
        <h3>Game score</h3>
        <div class="score-grid wide">${state.results.map((result, i) => tile(SCENARIO.rounds[i].title.split(" · ")[1] ?? `Round ${i + 1}`, result.points, 100)).join("")}${tile("Total", summary.score, summary.max)}</div>
      </section>
      <section class="panel evidence">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <div class="score-grid wide">
          ${tile("First-attempt accuracy", evidence.correct, evidence.total)}
          ${tile("Final round, no hints", evidence.finalCorrect, evidence.finalTotal)}
          ${tile("Severity traps avoided", evidence.decoysAvoided, SCENARIO.rounds.length)}
          <div class="score-tile"><span>Hints used</span><strong>${evidence.hintsUsed}</strong><p>Free; not scored</p></div>
        </div>
        <p class="muted small">${state.attempt > 1 ? `Recorded from your first run. This was attempt ${state.attempt}: its score is above, its accuracy was ${summary.evidence.correct}/${summary.evidence.total}.` : "Accuracy counts each committed pick that matches the best plan, on this first run."}</p>
      </section>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Replay: your decisions</h3>
        ${SCENARIO.rounds.map((round, i) => replay(round, state.results[i])).join("")}
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Content to be reviewed with SMEs (docs/design/PATCH_TUESDAY.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function replay(round: Round, result: RoundResult): string {
  const best = bestPlan(round, SCENARIO.budget);
  const decoy = decoyOf(round, SCENARIO.budget);
  return `<div class="case-row">
    <header><strong>${esc(round.title)}</strong><span>${result.points}/100 · ${result.correct}/${SCENARIO.budget} match${result.hinted ? " · hint used" : ""}${decoy ? ` · trap: ${esc(decoy.asset)} (${decoy.cvss.toFixed(1)})` : ""}</span></header>
    <table>
      <thead><tr><th scope="col">Asset</th><th scope="col">Evidence</th><th scope="col">You</th><th scope="col">Best</th><th scope="col">Outcome</th><th scope="col">Why</th></tr></thead>
      <tbody>${round.vulns
        .map((vuln) => {
          const picked = result.picks.includes(vuln.id);
          const should = best.includes(vuln.id);
          const outcome = outcomeOf(vuln, picked);
          return `<tr class="${picked === should ? "match" : "miss"}">
            <th scope="row">${esc(vuln.asset)}</th>
            <td>${vuln.cvss.toFixed(1)} · ${EXPOSURE[vuln.exposure].label} · ${EXPLOIT[vuln.exploit].label} · ${CRITICALITY[vuln.criticality].label}</td>
            <td>${picked ? "Patched" : "Deferred"}</td>
            <td>${should ? "Patch" : "Defer"}</td>
            <td class="o-${outcome}">${OUTCOME_LABEL[outcome]}</td>
            <td>${esc(vuln.why)}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table>
  </div>`;
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">It is Patch Tuesday at ${esc(SCENARIO.org)}. Each month brings five new vulnerabilities, but the change window only fits <strong>${SCENARIO.budget} patches</strong>.</p>
        <p class="tut-lead">Over ${SCENARIO.rounds.length} months, choose which ${SCENARIO.budget} to patch. Whatever you leave may be attacked before next month.</p>
        <p class="tut-note">${PATCH}<span>The one question: <strong>which of these is most likely to hurt us this month?</strong> The biggest severity number is not always the answer.</span></p>`,
    },
    {
      title: "Four signals on every card",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">9.8</span><span><b>Severity</b>How bad the bug could be in theory (CVSS-like, 0–10).</span></div>
          <div><span class="tut-ico box">◉</span><span><b>Exposure</b>${esc(EXPOSURE.internet.rule)} Internal needs a foothold first.</span></div>
          <div><span class="tut-ico box">▲</span><span><b>Exploit status</b>${esc(EXPLOIT.itw.rule)}</span></div>
          <div><span class="tut-ico box">◆</span><span><b>Asset</b>${esc(CRITICALITY[3].rule)}</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Pick three</b><span class="how">Click a card or press <kbd>1</kbd>–<kbd>5</kbd>. Click again to swap.</span></span></li>
          <li><span><b>Commit</b><span class="how"><span class="tut-pill">Commit patches</span> (<kbd>C</kbd>). Then see what happened to every item, and why.</span></span></li>
          <li><span><b>Three rounds</b><span class="how">Round 1 is guided (Likelihood and Impact shown). Round 2 has a free <span class="tut-pill">Hint</span>. Round 3 has no help.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>100 <small>/ round</small></b>Share of the month's risk your patches removed. The best plan scores 100.</div>
          <div><b>Breaches</b>Unpatched items that attackers got through this month.</div>
          <div><b>Evidence</b>Separately, we record how many first-attempt picks match the best plan.</div>
        </div>
        <p>Hints cost nothing; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${PATCH}<span>Starting again: same months, fresh score. Learning evidence stays from your first run.</span></p>` : ""}
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
  state = createGame(SCENARIO, attempt);
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", { attempt });
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the patch window",
    onStart: () => document.querySelector<HTMLElement>(".vuln")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
