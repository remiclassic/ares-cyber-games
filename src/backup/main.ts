import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { GAME } from "./data";
import {
  CHANGE,
  CRITICALITY,
  FREQ,
  FREQS,
  INCIDENT,
  LOC,
  LOCS,
  TEST_COST,
  allOnShare,
  bestChoice,
  canCommit,
  canHint,
  choiceLabel,
  commit,
  costOf,
  createGame,
  currentScenario,
  explain,
  hoursLabel,
  neverTest,
  next,
  playStrategy,
  rpoOf,
  rtoOf,
  setChoice,
  spent,
  summarize,
  takeHint,
  type Choice,
  type Freq,
  type GameState,
  type Loc,
  type RoundResult,
  type Scenario,
  type Summary,
  type System,
  type SystemResult,
  type Verdict,
} from "./sim";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-backup-or-bust/three-years-at-larkmoor/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DISK = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><ellipse cx="24" cy="12" rx="15" ry="6" stroke="currentColor" stroke-width="3"/><path d="M9 12v12c0 3.3 6.7 6 15 6s15-2.7 15-6V12M9 24v12c0 3.3 6.7 6 15 6s15-2.7 15-6V24" stroke="currentColor" stroke-width="3"/></svg>`;

const VERDICT: Record<Verdict, string> = { recovered: "✓ Recovered", partial: "! Recovered, with damage", lost: "✕ Lost", rebuilt: "↺ Rebuilt" };
const MODE_LABEL = { guided: "Guided", hints: "Hint available", final: "No hints" } as const;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(GAME);
let firstEvidence: Summary["evidence"] | null = null; // learning evidence is taken from the first run only
const started = performance.now();

$("#logo").innerHTML = LOGO;

const shareRun = summarize(playStrategy(GAME, allOnShare)!);
const untestedRun = summarize(playStrategy(GAME, neverTest)!);

function lastResult(): RoundResult | undefined {
  return state.phase === "result" ? state.results[state.results.length - 1] : undefined;
}

function showNeeds(scenario: Scenario): boolean {
  return scenario.mode === "guided" || (scenario.mode === "hints" && state.hinted);
}

function chips(system: System): string {
  const crit = CRITICALITY[system.criticality];
  return `<ul class="chips" aria-label="About this system">
    <li class="chip crit-${system.criticality}">${"◆".repeat(system.criticality)}${"◇".repeat(3 - system.criticality)} ${crit.label}</li>
    <li class="chip">↻ ${CHANGE[system.change].label}</li>
    <li class="chip">${system.hosted ? "☁ Hosted in the cloud account" : "▣ On site"}</li>
    ${system.rebuildable ? `<li class="chip spare">↺ Rebuilt from an image</li>` : `<li class="chip ${system.fragile ? "fragile" : "plain"}">${system.fragile ? "⛁ Live database" : "▤ Plain files"}</li>`}
  </ul>`;
}

function needs(system: System): string {
  if (system.rebuildable) return `<p class="needs"><b>Needs:</b> nothing. There is no unique data on it.</p>`;
  return `<p class="needs"><b>Needs:</b> lose at most <b>${hoursLabel(rpoOf(system))}</b> of work · back within <b>${hoursLabel(rtoOf(system))}</b>${system.fragile ? " · <b>live database</b>: only a tested copy restores" : ""}</p>`;
}

function controls(system: System, choice: Choice): string {
  const off = choice.freq === "none";
  const id = esc(system.id);
  const freq = FREQS.map(
    (value) => `<button type="button" class="opt" data-act="freq" data-id="${id}" data-val="${value}" aria-pressed="${choice.freq === value}">${FREQ[value].label}<small>${FREQ[value].cost}</small></button>`,
  ).join("");
  const loc = LOCS.map(
    (value) =>
      `<button type="button" class="opt" data-act="loc" data-id="${id}" data-val="${value}" aria-pressed="${!off && choice.loc === value}" ${off ? "disabled" : ""}>${LOC[value].short}<small>+${LOC[value].cost}</small></button>`,
  ).join("");
  return `<div class="controls">
    <div class="ctl"><span id="lf-${id}">How often</span><div class="seg" role="group" aria-labelledby="lf-${id}">${freq}</div></div>
    <div class="ctl"><span id="ll-${id}">Where the copy lives</span><div class="seg" role="group" aria-labelledby="ll-${id}">${loc}</div></div>
    <div class="ctl"><span id="lt-${id}">Prove it</span><div class="seg" role="group" aria-labelledby="lt-${id}"><button type="button" class="opt" data-act="test" data-id="${id}" aria-pressed="${!off && choice.test}" ${off ? "disabled" : ""}>Test restore<small>+${TEST_COST}</small></button></div></div>
  </div>`;
}

function planCard(system: System, scenario: Scenario): string {
  const choice = state.plan[system.id];
  const cost = costOf(choice);
  return `<article class="sys ${cost > 0 ? "protected" : ""}" data-sys="${esc(system.id)}">
    <div class="sys-info">
      <h3>${esc(system.name)}<span class="cost">${cost > 0 ? `Cost ${cost}` : "No backup"}</span></h3>
      <p>${esc(system.desc)}</p>
      ${chips(system)}
      ${showNeeds(scenario) ? needs(system) : ""}
    </div>
    ${controls(system, choice)}
  </article>`;
}

function facts(system: System, entry: SystemResult): string {
  const { outcome } = entry;
  if (outcome.verdict === "rebuilt") return "";
  const dead = !outcome.usable;
  return `<div class="facts">
    <div class="fact ${dead ? "dead" : "ok"}"><small>Backup usable?</small>${dead ? "No" : "Yes"}</div>
    <div class="fact ${dead ? "dead" : outcome.rpoMet ? "ok" : "miss"}"><small>Data lost</small>${dead ? "Everything" : hoursLabel(outcome.lostHours)}<em>can stand ${hoursLabel(rpoOf(system))}</em></div>
    <div class="fact ${dead ? "dead" : outcome.rtoMet ? "ok" : "miss"}"><small>Time down</small>${dead ? "Days to weeks" : hoursLabel(outcome.downHours)}<em>limit ${hoursLabel(rtoOf(system))}</em></div>
  </div>`;
}

function resultCard(system: System, entry: SystemResult): string {
  const best = bestChoice(system);
  return `<article class="sys done out-${entry.outcome.verdict}" data-sys="${esc(system.id)}">
    <div class="sys-info">
      <h3>${esc(system.name)}<span class="cost">${entry.outcome.points}/100</span></h3>
      <div class="outcome-line"><span class="badge out-${entry.outcome.verdict}">${VERDICT[entry.outcome.verdict]}</span><span>${esc(INCIDENT[system.hit].label)}</span><span class="muted">You chose: ${esc(choiceLabel(entry.choice))}${entry.cost ? ` (cost ${entry.cost})` : ""}</span></div>
      ${facts(system, entry)}
      <p class="conseq">${esc(explain(system, entry.choice))}</p>
      <p class="ref ${entry.matchesBest ? "" : "differ"}"><b>${entry.matchesBest ? "Same as the reference plan." : "Reference plan:"}</b> ${entry.matchesBest ? "" : `${esc(choiceLabel(best))}${costOf(best) ? ` (cost ${costOf(best)})` : ""}. `}${esc(whyBest(system))}</p>
    </div>
  </article>`;
}

// Why the reference choice is what it is, in one line.
function whyBest(system: System): string {
  if (system.rebuildable) return "Nothing unique to lose, so every unit spent here is taken from a system that needs it.";
  const best = bestChoice(system);
  const reach = INCIDENT[system.hit].reaches.map((loc) => LOC[loc].label.toLowerCase()).join(", ");
  const test = best.test
    ? system.fragile
      ? "A live database only restores from a tested copy."
      : `Critical: a practised restore is the only way back inside ${hoursLabel(rtoOf(system))}.`
    : "Plain files and a loose enough deadline: the test restore can go elsewhere.";
  return `${CHANGE[system.change].label}, so ${FREQ[best.freq].label.toLowerCase()} is enough. ${INCIDENT[system.hit].label} reaches: ${reach}; ${LOC[best.loc].label.toLowerCase()} is the cheapest place out of reach. ${test}`;
}

function meter(scenario: Scenario, used: number): string {
  const over = used > scenario.budget;
  const left = scenario.budget - used;
  return `<div class="meter ${over ? "over" : ""}" id="meter" aria-label="Backup budget">
    <div class="meter-top"><span>Budget</span><strong>${used}<small>/${scenario.budget}</small></strong></div>
    <div class="meter-bar"><i style="width:${Math.min(100, Math.round((100 * used) / scenario.budget))}%"></i></div>
    <p>${over ? `<span class="warn-text">Over budget by ${-left}.</span> Trim something before you lock the plan.` : `${left} left to spend.`}</p>
  </div>`;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const scenario = currentScenario(state);
  const result = lastResult();
  const summary = summarize(state);
  const used = result ? result.spent : spent(state);
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${GAME.scenarios.length}</strong><span>Year</span></div>
    <div class="count"><strong>${scenario.budget - used}</strong><span>Budget left</span></div>
    <div class="count"><strong>${summary.score}</strong><span>Score</span></div>`;
  $("#plan").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Budget and risks</h2><span class="phase-pill">${MODE_LABEL[scenario.mode]}</span></div>
    <div class="d-scroll">
      ${meter(scenario, used)}
      <h3 class="sub-head">Risk register this year</h3>
      <ul class="register">${scenario.register.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      ${GAME.scenarios
        .map((entry, i) => {
          const done = state.results[i];
          return `<section class="stage ${i === state.index ? "on" : ""}"><h3>${esc(entry.title)}${done ? ` <span class="pts">${done.points}</span>` : ""}</h3></section>`;
        })
        .join("")}
      <div class="legend">
        <h3 class="sub-head">Price list</h3>
        <table>
          <thead><tr><th scope="col">Copy lives</th><th scope="col">Cost</th><th scope="col">Restore takes</th></tr></thead>
          <tbody>${LOCS.map((loc) => `<tr><th scope="row">${LOC[loc].label}</th><td>+${LOC[loc].cost}</td><td>${LOC[loc].restore} h</td></tr>`).join("")}</tbody>
        </table>
        <p><b>How often:</b> weekly ${FREQ.weekly.cost}, daily ${FREQ.daily.cost}, hourly ${FREQ.hourly.cost}. You lose the work since the last copy.</p>
        <p><b>Test restore</b> +${TEST_COST}: proves the copy loads. Untested restores take twice as long; an untested copy of a live database does not load at all.</p>
        <p><b>Deadlines:</b> ◆◆◆ back in ${CRITICALITY[3].rto} h · ◆◆ ${CRITICALITY[2].rto} h · ◆ ${CRITICALITY[1].rto / 24} days.</p>
      </div>
      <p class="muted small">Score: per year, how well each system recovered, weighted by how critical it is (100 = everything back within its limits). Hints are free and counted, never scored.</p>
    </div>`;
  $("#board-head").innerHTML = `<h2>${esc(scenario.title)}</h2><span>${result ? "What happened" : `${scenario.systems.length} systems`}</span>`;
  const coach =
    scenario.mode === "guided" && !result
      ? `<div class="coach-box"><strong>Guided year.</strong> Each card shows what the system <b>needs</b>. Ransomware reaches the <b>same server</b> and the <b>network share</b>, so put copies in the <b>cloud</b> or <b>offline</b>. Match <b>how often</b> to how fast the data changes, and buy a <b>test restore</b> for live databases and anything critical. You cannot afford the maximum everywhere.</div>`
      : "";
  const hintBox =
    scenario.mode === "hints" && state.hinted && !result
      ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> Each card now shows what the system needs. Ask what each risk can reach: a <b>failed disk</b> only takes what is on that machine; a <b>delete found after three weeks</b> beats the share's 7 days of history; a <b>locked cloud account</b> takes every copy stored in it, so hosted systems need a copy somewhere else. One system here needs no backup at all.</div>`
      : "";
  $("#board").innerHTML = `
    ${coach}${hintBox}${result ? incidentBox(scenario, result) : ""}
    <div class="systems" role="group" aria-label="Systems this year">${scenario.systems.map((system, i) => (result ? resultCard(system, result.systems[i]) : planCard(system, scenario))).join("")}</div>
    <div class="board-actions">
      ${
        result
          ? `<button class="btn primary" data-act="next">${state.index + 1 < GAME.scenarios.length ? "Next year" : "See debrief"} <kbd>N</kbd></button>`
          : `<button class="btn primary" data-act="commit" ${canCommit(state) ? "" : "disabled"}>Lock the plan <kbd>C</kbd></button>
             ${canHint(state) && !state.hinted ? `<button class="btn" data-act="hint">Hint <kbd>H</kbd></button>` : ""}
             <span class="muted small">Budget ${used}/${scenario.budget}</span>`
      }
    </div>`;
  renderNext();
}

function incidentBox(scenario: Scenario, result: RoundResult): string {
  const tone = result.points >= 85 ? "good" : result.points >= 60 ? "hint" : "bad";
  return `<div class="incident-box" role="status"><h3>Incident: ${esc(scenario.incident)}</h3><p>${esc(scenario.story)}</p></div>
    <div class="feedback-box ${tone}"><strong>${result.points}/100 recovered.</strong> ${result.recovered} of ${result.systems.length} systems fully back · ${result.lost} lost for good · ${result.spent} of ${result.budget} budget spent${result.wasted ? ` · ${result.wasted} spent on a system with nothing to lose` : ""}.</div>`;
}

function renderNext(): void {
  const scenario = currentScenario(state);
  const result = lastResult();
  const used = spent(state);
  const unprotected = scenario.systems.filter((system) => !system.rebuildable && state.plan[system.id].freq === "none").length;
  let step: NextStep;
  if (result) {
    step = {
      label: "Done",
      tone: result.lost ? "warn" : "ready",
      text: `Read what the incident did to each system, then press <strong>${state.index + 1 < GAME.scenarios.length ? "Next year" : "See debrief"}</strong> (<kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (used > scenario.budget) {
    step = { label: "Over budget", tone: "warn", text: `You are <strong>${used - scenario.budget} over</strong>. Back up less often somewhere, move a copy somewhere cheaper, or drop a test restore.`, targets: ["#meter"] };
  } else if (used === 0) {
    step = {
      text: `For each system choose <strong>how often</strong> to back it up, <strong>where</strong> the copy lives, and whether to pay for a <strong>test restore</strong>.`,
      hint:
        scenario.mode === "guided"
          ? "Start with the patient records: critical, changing all day, a live database."
          : scenario.mode === "hints"
            ? "Read the risk register first. <strong>Hint</strong> (<kbd>H</kbd>) is free."
            : "No hints this year. Read the risk register: what could reach each copy?",
      targets: [".systems"],
    };
  } else if (unprotected > 0) {
    step = {
      text: `<strong>${unprotected}</strong> system${unprotected === 1 ? " has" : "s have"} no backup yet. ${scenario.budget - used} budget left.`,
      hint: `Lock the plan when you are happy with it (<kbd>C</kbd>). With a card focused: <kbd>F</kbd> how often, <kbd>L</kbd> where, <kbd>T</kbd> test.`,
      targets: [],
    };
  } else {
    step = { label: "Ready", tone: "ready", text: `Within budget (${used}/${scenario.budget}). Press <strong>Lock the plan</strong> (<kbd>C</kbd>) and see what the year brings.`, targets: ['[data-act="commit"]'] };
  }
  renderNextStep($("#next-step"), step);
}

function change(id: string, patch: Partial<Choice>, focus: string): void {
  const beforeOver = spent(state) > currentScenario(state).budget;
  if (!setChoice(state, id, patch)) {
    play("block");
    announce("Choose how often to back it up first.");
    return;
  }
  const scenario = currentScenario(state);
  const used = spent(state);
  const over = used > scenario.budget;
  play(over ? "block" : "click");
  render();
  document.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  const system = scenario.systems.find((entry) => entry.id === id)!;
  announce(`${system.name}: ${choiceLabel(state.plan[id])}. ${over ? `Over budget by ${used - scenario.budget}.` : beforeOver ? "Back within budget." : `${scenario.budget - used} budget left.`}`);
}

function cycle<T>(list: readonly T[], value: T): T {
  return list[(list.indexOf(value) + 1) % list.length];
}

function toTop(): void {
  window.scrollTo({ top: 0 });
  $("#board").scrollTop = 0;
}

function onCommit(): void {
  const result = commit(state);
  if (!result) {
    play("block");
    announce("Over budget: trim the plan first.");
    return;
  }
  const scenario = currentScenario(state);
  play(result.points >= 85 ? "success" : result.lost ? "setback" : "click");
  post("statement", {
    at: new Date().toISOString(),
    verb: "answered",
    object: result.scenario,
    result: { plan: Object.fromEntries(result.systems.map((entry) => [entry.id, entry.choice])), points: result.points, spent: result.spent, lost: result.lost, hinted: result.hinted, attempt: state.attempt },
  });
  render();
  announce(`Incident: ${scenario.incident}. ${result.points} of 100 recovered. ${result.lost} systems lost for good.`);
  toTop();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus({ preventScroll: true });
}

function onHint(): void {
  if (!takeHint(state)) return;
  render();
  announce("Hint shown: each card now lists what the system needs.");
  document.querySelector<HTMLElement>(".opt")?.focus({ preventScroll: true });
}

function goNext(): void {
  next(state);
  render();
  if (state.phase === "done") return;
  announce(currentScenario(state).title);
  toTop();
  document.querySelector<HTMLElement>(".opt")?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  const { act, id, val } = target.dataset;
  if (act === "freq" && id) change(id, { freq: val as Freq }, `[data-act="freq"][data-id="${id}"][data-val="${val}"]`);
  else if (act === "loc" && id) change(id, { loc: val as Loc }, `[data-act="loc"][data-id="${id}"][data-val="${val}"]`);
  else if (act === "test" && id) change(id, { test: !state.plan[id].test }, `[data-act="test"][data-id="${id}"]`);
  else if (act === "commit") onCommit();
  else if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const id = (event.target as HTMLElement).closest?.<HTMLElement>("[data-sys]")?.dataset.sys;
  const planning = state.phase === "plan";
  if (planning && id && key === "f") {
    const value = cycle(FREQS, state.plan[id].freq);
    change(id, { freq: value }, `[data-act="freq"][data-id="${id}"][data-val="${value}"]`);
  } else if (planning && id && key === "l") {
    const value = cycle(LOCS, state.plan[id].loc);
    change(id, { loc: value }, `[data-act="loc"][data-id="${id}"][data-val="${value}"]`);
  } else if (planning && id && key === "t") change(id, { test: !state.plan[id].test }, `[data-act="test"][data-id="${id}"]`);
  else if (planning && key === "c") onCommit();
  else if (planning && key === "h") onHint();
  else if (key === "n" && state.phase === "result") goNext();
  else return;
  event.preventDefault();
});

function renderDebrief(): void {
  const summary = summarize(state);
  firstEvidence ??= summary.evidence;
  const evidence = firstEvidence;
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: { score: summary.score, max: summary.max, lost: summary.lost }, evidence, results: state.results });
  try {
    localStorage.setItem("ares-backup:lastResult", JSON.stringify({ score: summary.score, max: summary.max, evidence }));
  } catch {
    // Optional.
  }
  const now = summary.evidence;
  const habit =
    now.copySurvived < now.needing * 0.7
      ? "Too many copies sat <strong>within reach of the incident</strong>. Before choosing a place, ask what could go wrong and whether it could touch the copy as well as the original."
      : now.testsPlaced < now.testsNeeded
        ? "Your copies were mostly in the right places, but some were <strong>never proven</strong>. An untested backup of a live database is a hope, not a backup: test the ones you cannot afford to lose."
        : now.frequencyFits < now.needing
          ? "Right places and proven copies, but some systems <strong>changed faster than you backed them up</strong>. Match how often to how fast the data changes."
          : now.wasted > 0
            ? "You also <strong>spent budget on a system with nothing to lose</strong>. Protection should follow the data, not the hardware."
            : summary.score === summary.max
              ? "You matched protection to each system every year: out of reach, often enough, and proven where it mattered."
              : "Sound choices on frequency and testing. Your remaining misses were copies the incident could reach: check each year's risk register against where every copy lives.";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(GAME.org)}</p>
        <h2 id="debrief-title" tabindex="-1">Recovered ${summary.score}<small>/${summary.max}</small></h2>
        <p class="muted">${summary.lost} system${summary.lost === 1 ? "" : "s"} lost for good across ${GAME.scenarios.length} years. For comparison: every copy on the network share scores ${shareRun.score}/${shareRun.max}; the right places but no test restores scores ${untestedRun.score}/${untestedRun.max}.</p>
      </header>
      <section class="panel">
        <h3>Game score</h3>
        <div class="score-grid wide">${state.results.map((result, i) => tile(GAME.scenarios[i].title.split(" · ")[0], result.points, 100)).join("")}${tile("Total", summary.score, summary.max)}</div>
      </section>
      <section class="panel evidence">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <div class="score-grid wide">
          ${tile("Copies out of reach", evidence.copySurvived, evidence.needing)}
          ${tile("Frequency fits the data", evidence.frequencyFits, evidence.needing)}
          ${tile("Tests where they mattered", evidence.testsPlaced, evidence.testsNeeded)}
          ${tile("Final year, no hints", evidence.finalRecovered, evidence.finalTotal)}
          <div class="score-tile"><span>Hints used</span><strong>${evidence.hintsUsed}</strong><p>Free; not scored</p></div>
        </div>
        <p class="muted small">${state.attempt > 1 ? `Recorded from your first run. This was attempt ${state.attempt}: its score is above; it put ${now.copySurvived}/${now.needing} copies out of reach.` : "Counted per system that needs a backup, on this first run. “Final year” counts systems fully recovered."}</p>
      </section>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Replay: your choices against the incident</h3>
        ${GAME.scenarios.map((scenario, i) => replay(scenario, state.results[i])).join("")}
      </section>
      <section class="panel"><h3>The idea to keep: 3-2-1</h3><p>Keep <strong>3</strong> copies of anything that matters, on <strong>2</strong> different kinds of storage, with <strong>1</strong> somewhere the same disaster cannot reach. Then restore one, on purpose, before you need to.</p></section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · All content fictional · Content to be reviewed with SMEs (docs/design/BACKUP_OR_BUST.md)</p>
    </div>`;
  window.scrollTo({ top: 0 });
  $("#debrief-title").focus();
}

function replay(scenario: Scenario, result: RoundResult): string {
  return `<div class="case-row">
    <header><strong>${esc(scenario.title)}</strong><span>${result.points}/100 · ${result.spent}/${result.budget} budget${result.hinted ? " · hint used" : ""}</span></header>
    <p class="incident-line"><b>Incident:</b> ${esc(scenario.incident)}. ${esc(scenario.story)}</p>
    <table>
      <thead><tr><th scope="col">System</th><th scope="col">Needs</th><th scope="col">You chose</th><th scope="col">Result</th><th scope="col">What the incident did</th><th scope="col">Reference plan</th></tr></thead>
      <tbody>${scenario.systems
        .map((system, i) => {
          const entry = result.systems[i];
          const { outcome } = entry;
          const best = bestChoice(system);
          return `<tr class="${outcome.points === 100 ? "match" : "miss"}">
            <th scope="row">${esc(system.name)}</th>
            <td>${system.rebuildable ? "Nothing" : `Lose ≤ ${hoursLabel(rpoOf(system))}; back in ≤ ${hoursLabel(rtoOf(system))}${system.fragile ? "; live database" : ""}`}</td>
            <td>${esc(choiceLabel(entry.choice))}${entry.cost ? ` (${entry.cost})` : ""}</td>
            <td class="o-${outcome.verdict}">${VERDICT[outcome.verdict]}${outcome.usable && outcome.verdict !== "rebuilt" ? `<br />lost ${hoursLabel(outcome.lostHours)}, down ${hoursLabel(outcome.downHours)}` : ""}</td>
            <td>${esc(explain(system, entry.choice))}</td>
            <td>${esc(choiceLabel(best))}${costOf(best) ? ` (${costOf(best)})` : ""}</td>
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
        <p class="tut-lead">You look after the computers at ${esc(GAME.org)}. Each year you get a small <strong>backup budget</strong> and a handful of systems to protect.</p>
        <p class="tut-lead">You make the plan. Then something goes wrong, and you find out which systems come back.</p>
        <p class="tut-note">${DISK}<span>The one question: <strong>when it goes wrong, will this copy still be there, recent enough, and will it actually restore?</strong></span></p>`,
    },
    {
      title: "Three choices per system",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">↻</span><span><b>How often</b>None, weekly, daily or hourly. You lose the work done since the last copy, so match it to how fast the data changes.</span></div>
          <div><span class="tut-ico box">▣</span><span><b>Where the copy lives</b>Same server, network share, cloud, or offline / immutable. Cheaper places restore faster and are easier for a disaster to reach.</span></div>
          <div><span class="tut-ico box">✓</span><span><b>Test restore</b>Pay to prove the copy loads. Untested restores take twice as long, and an untested copy of a live database does not load at all.</span></div>
        </div>`,
    },
    {
      title: "What can reach a copy",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">1</span><span><b>${esc(INCIDENT.disk.label)}</b>${esc(INCIDENT.disk.rule)}</span></div>
          <div><span class="tut-ico box">2</span><span><b>${esc(INCIDENT.ransomware.label)}</b>${esc(INCIDENT.ransomware.rule)}</span></div>
          <div><span class="tut-ico box">3</span><span><b>${esc(INCIDENT.delete.label)}</b>${esc(INCIDENT.delete.rule)}</span></div>
          <div><span class="tut-ico box">4</span><span><b>${esc(INCIDENT.lockout.label)}</b>${esc(INCIDENT.lockout.rule)}</span></div>
        </div>
        <p>The <strong>risk register</strong> on the left says what is likely this year. A copy the incident can reach is not a backup.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Plan</b><span class="how">Click the choices on each system card. Keys with a card focused: <kbd>F</kbd> how often, <kbd>L</kbd> where, <kbd>T</kbd> test restore.</span></span></li>
          <li><span><b>Stay in budget</b><span class="how">The maximum everywhere costs far more than you have. Spend where losing data or time hurts most.</span></span></li>
          <li><span><b>Lock the plan</b><span class="how"><span class="tut-pill">Lock the plan</span> (<kbd>C</kbd>). The incident hits and each system shows data lost, time down, and whether the backup was usable.</span></span></li>
          <li><span><b>Three years</b><span class="how">Year 1 is guided. Year 2 has a free <span class="tut-pill">Hint</span> (<kbd>H</kbd>). Year 3 has no help.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>100 <small>/ year</small></b>How well each system recovered, weighted by how critical it is.</div>
          <div><b>Lost</b>Systems whose data never came back.</div>
          <div><b>Evidence</b>Separately, we record copies out of reach, frequency that fits, and tests where they mattered.</div>
        </div>
        <p>Hints cost nothing; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${DISK}<span>Starting again: same years, fresh score. Learning evidence stays from your first run.</span></p>` : ""}
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
  state = createGame(GAME, attempt);
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", { attempt });
  render();
  window.scrollTo({ top: 0 });
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${GAME.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the budget",
    onStart: () => document.querySelector<HTMLElement>(".opt")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${GAME.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
